import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { app } from 'electron'
import { describeModel, HF_IMAGE_MODELS, HF_VIDEO_MODELS } from '@shared/higgsfield'
import type { AspectRatio, CreditEstimate, KeyTestResult, ModelOption } from '@shared/types'
import { getSecret, requireSecret } from '../secrets'
import { getSettings } from '../settings'
import { ApiError, downloadTo, readError, sleep } from './http'

// Development builds can point at a local mock (STUDIO_HF_BASE) to test the UI without spending credits.
function getBase(): string {
  const s = getSettings()
  if (s.mediaProvider === 'custom' && s.customMediaBaseUrl) return s.customMediaBaseUrl.replace(/\/+$/, '')
  return (!app.isPackaged && process.env.STUDIO_HF_BASE) || 'https://api.higgsfield.ai'
}

export type HfStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled'

export interface HfResult {
  status: HfStatus
  images?: { url: string }[]
  video?: { url: string }
  error?: string
}

function authHeader(cred?: string): string | null {
  const s = getSettings()
  if (s.mediaProvider === 'custom') {
    const k = cred ?? getSecret('custom-media')
    return k ? `Key ${k}` : null
  }
  return `Key ${cred ?? requireSecret('higgsfield')}`
}

/** Error for a custom endpoint, which is not Higgsfield and may answer a wrong path with a web page. */
function customFriendly(status: number, detail: string, url: string, hint: string): ApiError {
  const html = /^\s*<(!doctype|html)/i.test(detail)
  if (status === 401 || status === 403) return new ApiError('Kunci endpoint custom ditolak. Periksa kunci di Pengaturan.', status)
  if (status === 404 && html) return new ApiError(`Server custom tidak punya alamat ${url} (404). ${hint}`, status)
  const said = html ? `HTTP ${status}` : detail
  if (status === 429) return new ApiError(`Server custom sedang membatasi permintaan: ${said}`, status, true)
  if (status >= 500) return new ApiError(`Server custom sedang bermasalah (${status}): ${said}`, status, true)
  return new ApiError(`Server custom menolak permintaan: ${said}`, status)
}

function friendly(status: number, detail: string): ApiError {
  if (status === 401) return new ApiError('Kunci Higgsfield tidak valid. Tempel ulang hasil tombol "Copy API key" dari console Higgsfield di Pengaturan.', status)
  if (status === 403) return new ApiError('Kredit Higgsfield tidak cukup. Isi ulang di dashboard Higgsfield.', status)
  if (status === 400 && /concurrent/i.test(detail))
    return new ApiError('Terlalu banyak proses bersamaan di Higgsfield.', status, true)
  if (status === 404 || status === 423 || status === 503)
    return new ApiError(`Model ini belum bisa dipakai akun Higgsfield kamu (${detail}).`, status)
  if (status >= 500) return new ApiError(`Server Higgsfield sedang bermasalah (${status}).`, status, true)
  return new ApiError(`Higgsfield menolak permintaan: ${detail}`, status)
}

async function hf<T>(path: string, init: RequestInit & { cred?: string } = {}): Promise<T> {
  const base = getBase()
  const url = path.startsWith('http') ? path : `${base}/${path.replace(/^\//, '')}`
  const auth = authHeader(init.cred)
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  if (auth) headers.set('Authorization', auth)
  const res = await fetch(url, {
    ...init,
    headers
  })
  if (!res.ok) {
    const detail = await readError(res)
    if (getSettings().mediaProvider === 'custom')
      throw customFriendly(res.status, detail, url, 'Model dari katalog Higgsfield dan semua video lewat endpoint custom butuh server yang meniru API Higgsfield.')
    throw friendly(res.status, detail)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

/** Submits a generation. Retries a few times when the account's concurrency limit is hit. */
export async function submit(endpoint: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const idem = randomUUID()
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await hf<{ request_id: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': idem },
        signal
      })
      return out.request_id
    } catch (e) {
      if (e instanceof ApiError && e.retryable && attempt < 6 && !signal?.aborted) {
        await sleep(4000 + attempt * 3000, signal)
        continue
      }
      throw e
    }
  }
}

export async function getStatus(requestId: string, signal?: AbortSignal): Promise<HfResult> {
  return hf<HfResult>(`requests/${requestId}/status`, { method: 'GET', signal })
}

export async function cancelRequest(requestId: string): Promise<void> {
  try {
    await hf(`requests/${requestId}/cancel`, { method: 'POST' })
  } catch {
    // Already processing: Higgsfield only cancels queued jobs.
  }
}

/** Polls until the request finishes. Starts at 2 s and backs off to 10 s. */
export async function waitForResult(
  requestId: string,
  onTick: (status: HfStatus, elapsedMs: number) => void,
  signal?: AbortSignal,
  timeoutMs = 20 * 60 * 1000
): Promise<HfResult> {
  const started = Date.now()
  let delay = 2000
  let failures = 0
  for (;;) {
    if (Date.now() - started > timeoutMs) throw new Error('Higgsfield terlalu lama merespons. Coba lagi nanti.')
    let r: HfResult
    try {
      r = await getStatus(requestId, signal)
      failures = 0
    } catch (e) {
      if (signal?.aborted) throw e
      if (e instanceof ApiError && !e.retryable) throw e
      if (++failures > 8) throw e
      await sleep(delay, signal)
      continue
    }
    onTick(r.status, Date.now() - started)
    if (r.status === 'completed') return r
    if (r.status === 'failed') throw new Error(`Higgsfield gagal membuat hasil: ${r.error ?? 'tanpa keterangan'}`)
    if (r.status === 'nsfw') throw new Error('Ditolak moderasi Higgsfield. Ubah prompt lalu coba lagi.')
    if (r.status === 'canceled') throw new Error('Dibatalkan')
    await sleep(delay + Math.random() * 500, signal)
    delay = Math.min(10_000, delay * 1.5)
  }
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav'
}

/** Uploads a local file through a presigned URL and returns its public URL for use as a reference. */
export async function uploadFile(absPath: string, signal?: AbortSignal): Promise<string> {
  const contentType = MIME[extname(absPath).toLowerCase()] ?? 'image/png'
  const slot = await hf<{ public_url: string; upload_url: string; upload_headers?: Record<string, string> }>(
    'files/generate-upload-url',
    { method: 'POST', body: JSON.stringify({ content_type: contentType }), signal }
  )
  const bytes = await readFile(absPath)
  const put = await fetch(slot.upload_url, {
    method: 'PUT',
    headers: slot.upload_headers ?? { 'Content-Type': contentType },
    body: bytes,
    signal
  })
  if (!put.ok) throw new Error(`Gagal mengunggah referensi ke Higgsfield (HTTP ${put.status})`)
  return slot.public_url
}

export async function estimate(endpoint: string, body: Record<string, unknown>): Promise<CreditEstimate | null> {
  try {
    const out = await hf<{ credits?: string | number; usd?: string | number }>(`estimate/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
    const credits = Number(out.credits)
    const usd = Number(out.usd)
    return Number.isFinite(credits) ? { credits, usd: out.usd != null && Number.isFinite(usd) ? usd : null } : null
  } catch (e) {
    console.warn(`[higgsfield] estimate ${endpoint}: ${(e as Error).message}`)
    return null
  }
}

/** A cost estimate is the cheapest authenticated call the API documents. */
export async function testCredentials(cred?: string): Promise<KeyTestResult> {
  const c = cred ?? getSecret('higgsfield')
  if (!c) return { ok: false, message: 'Kunci belum diatur' }
  try {
    const out = await hf<{ credits?: string }>('estimate/higgsfield-ai/soul/v2/standard', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test', aspect_ratio: '16:9', resolution: '720p', batch_size: 1 }),
      cred: c
    })
    // The API sends credits as "1.500"; show them the Indonesian way ("1,5") so they are not read as thousands.
    const n = Number(out.credits)
    const credits = Number.isFinite(n) ? (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('id-ID') : null
    return { ok: true, message: credits ? `Terhubung · 1 gambar Soul ≈ ${credits} kredit` : 'Terhubung' }
  } catch (e) {
    const noColon = !c.includes(':')
    if (e instanceof ApiError && e.status === 401 && noColon)
      return {
        ok: false,
        message: 'Kunci ditolak. Kunci Higgsfield berformat KEY_ID:KEY_SECRET. Pakai tombol "Copy API key" di console, atau gabungkan Key ID dan Secret dengan titik dua.'
      }
    return { ok: false, message: (e as Error).message }
  }
}

type MediaKind = 'image' | 'video'

interface RawMediaModel {
  id?: string
  model?: string
  name?: string
  description?: string
  family?: string
  kind?: string
  type?: string
  modality?: string
  category?: string
  task?: string
  output_modalities?: string[]
  capabilities?: { imageOutput?: boolean; videoOutput?: boolean }
}

function kindHint(text: string): MediaKind | null {
  // Check video first: "image-to-video" models make videos.
  if (/video|i2v|t2v/i.test(text)) return 'video'
  if (/image|picture|t2i|txt2img/i.test(text)) return 'image'
  return null
}

/**
 * Image or video, from whatever the server says about the model, else from its id; null when it cannot tell.
 * 'other' is a model the server describes as neither (a chat model), which belongs in no media list.
 */
function mediaKindOf(m: RawMediaModel, id: string): MediaKind | 'other' | null {
  const said = kindHint([m.kind, m.type, m.modality, m.category, m.task, ...(m.output_modalities ?? [])].filter(Boolean).join(' '))
  if (said) return said
  // OpenAI-compatible routers (9router, ...) list chat models with their capabilities; trust those over the id.
  const caps = m.capabilities
  if (caps && typeof caps === 'object') return caps.videoOutput ? 'video' : caps.imageOutput ? 'image' : 'other'
  return kindHint(id)
}

function customMediaBase(baseUrl?: string): string {
  return (baseUrl?.trim() || getSettings().customMediaBaseUrl.trim()).replace(/\/+$/, '')
}

/** Higgsfield-style servers take "Key", OpenAI-style ones "Bearer". */
function customMediaHeaders(cred?: string, scheme: 'Key' | 'Bearer' = 'Key'): Record<string, string> {
  const c = cred ?? getSecret('custom-media')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (c) headers.Authorization = `${scheme} ${c}`
  return headers
}

async function fetchModelList(url: string, cred?: string): Promise<(string | RawMediaModel)[]> {
  // A model list is an OpenAI convention, so try its auth scheme first.
  let res: Response | null = null
  for (const scheme of ['Bearer', 'Key'] as const) {
    try {
      res = await fetch(url, { method: 'GET', headers: customMediaHeaders(cred, scheme), signal: AbortSignal.timeout(10_000) })
    } catch (e) {
      throw new Error(`Tidak bisa terhubung ke ${url}: ${(e as Error).message}`)
    }
    if (res.status !== 401 && res.status !== 403) break
  }
  if (!res) throw new Error(`Tidak bisa terhubung ke ${url}`)
  if (res.status === 401 || res.status === 403) throw new ApiError('Kunci endpoint custom ditolak. Periksa kunci di Pengaturan.', res.status)
  if (!res.ok) throw new Error(`Server tidak memberi daftar model di ${url} (${res.status}): ${await readError(res)}`)
  const body = (await res.json().catch(() => null)) as { data?: unknown; models?: unknown } | unknown[] | null
  const raw = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : null
  if (!raw) throw new Error(`Jawaban ${url} bukan daftar model.`)
  return raw as (string | RawMediaModel)[]
}

async function fetchCustomMediaModels(cred?: string, baseUrl?: string): Promise<(string | RawMediaModel)[]> {
  const base = customMediaBase(baseUrl)
  if (!base) throw new Error('Alamat endpoint custom belum diisi. Buka Pengaturan untuk menambahkannya.')
  const all = await fetchModelList(`${base}/models`, cred)
  // 9router and similar routers keep image models out of /models and list them at /models/image.
  const images = await fetchModelList(`${base}/models/image`, cred).catch(() => [])
  const tagged = images.map((m): RawMediaModel => ({ ...(typeof m === 'string' ? { id: m } : m), type: 'image' }))
  return [...tagged, ...all]
}

function toMediaOptions(raw: (string | RawMediaModel)[], kind: MediaKind): ModelOption[] {
  const known = kind === 'image' ? HF_IMAGE_MODELS : HF_VIDEO_MODELS
  const seen = new Set<string>()
  const out: ModelOption[] = []
  for (const item of raw) {
    const m: RawMediaModel = typeof item === 'string' ? { id: item } : (item ?? {})
    const id = String(m.id ?? m.model ?? m.name ?? '').trim()
    if (!id || seen.has(id)) continue
    const k = mediaKindOf(m, id)
    if (k && k !== kind) continue
    seen.add(id)
    // A proxy in front of Higgsfield serves catalog ids; show them the way the Higgsfield list does.
    const hfModel = known.find((x) => x.id === id)
    out.push(
      hfModel
        ? { id, name: hfModel.name, family: hfModel.family, description: describeModel(hfModel), tags: hfModel.tags }
        : {
            id,
            name: m.name?.trim() || id,
            family: m.family?.trim() || 'Custom',
            description: typeof m.description === 'string' ? m.description.slice(0, 280) : undefined,
            tags: []
          }
    )
  }
  return out
}

/**
 * Models the custom endpoint offers, from GET {base}/models. Accepts the OpenAI shape ({ data: [...] }), { models: [...] }
 * or a bare array, of objects or plain ids. A model the server does not label as image or video shows in both lists.
 */
export async function customMediaModels(kind: MediaKind): Promise<ModelOption[]> {
  return toMediaOptions(await fetchCustomMediaModels(), kind)
}

export async function testCustomMedia(cred?: string, baseUrl?: string): Promise<KeyTestResult> {
  const url = customMediaBase(baseUrl)
  if (!url) return { ok: false, message: 'Alamat endpoint belum diatur' }
  try {
    const raw = await fetchCustomMediaModels(cred, url)
    return { ok: true, message: `Terhubung · ${toMediaOptions(raw, 'image').length} model gambar dan ${toMediaOptions(raw, 'video').length} model video` }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, message: e.message }
    // Servers without a model list still work; their models are typed in by hand.
  }
  try {
    const headers = customMediaHeaders(cred)
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(6000)
    })
    return { ok: true, message: `Terhubung ke server (HTTP ${res.status})` }
  } catch (e) {
    return { ok: false, message: `Gagal terhubung: ${(e as Error).message}` }
  }
}

/**
 * A custom endpoint serving a model outside the Higgsfield catalog is taken to be OpenAI-compatible (9router,
 * LiteLLM, ...): those answer POST {base}/images/generations, not Higgsfield's POST {base}/{model}.
 */
export function usesOpenAiImages(modelId: string): boolean {
  return getSettings().mediaProvider === 'custom' && !HF_IMAGE_MODELS.some((m) => m.id === modelId)
}

// DALL-E sizes, which routers translate into each provider's aspect ratio.
const OPENAI_SIZE: Record<AspectRatio, string> = { '16:9': '1792x1024', '9:16': '1024x1792' }

/** Draws one image through an OpenAI-compatible endpoint. `refs` are data URLs of the character sheets. */
export async function openAiImage(
  model: string,
  prompt: string,
  aspect: AspectRatio,
  refs: string[],
  signal?: AbortSignal
): Promise<{ bytes: Buffer; contentType: string; url: string | null }> {
  const base = customMediaBase()
  if (!base) throw new Error('Alamat endpoint custom belum diisi. Buka Pengaturan untuk menambahkannya.')
  const url = `${base}/images/generations`
  const body: Record<string, unknown> = { model, prompt, n: 1, size: OPENAI_SIZE[aspect] }
  // Not in the OpenAI spec, but routers hand these to models that take reference images.
  if (refs.length) body.images = refs
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: customMediaHeaders(undefined, 'Bearer'), body: JSON.stringify(body), signal })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error(`Tidak bisa terhubung ke ${base}: ${(e as Error).message}`)
  }
  if (!res.ok)
    throw customFriendly(res.status, await readError(res), url, 'Pastikan alamatnya API kompatibel OpenAI (biasanya berakhiran /v1).')
  const out = (await res.json().catch(() => null)) as { data?: { b64_json?: string; url?: string }[] } | null
  const item = out?.data?.find((d) => d?.b64_json || d?.url)
  if (item?.b64_json) {
    const prefix = /^data:(image\/[\w.+-]+);base64,/.exec(item.b64_json)
    const bytes = Buffer.from(prefix ? item.b64_json.slice(prefix[0].length) : item.b64_json, 'base64')
    if (bytes.length) return { bytes, contentType: prefix?.[1] ?? 'image/png', url: null }
  }
  if (item?.url) return { ...(await downloadTo(item.url, signal)), url: /^https?:/i.test(item.url) ? item.url : null }
  throw new Error(`Model ${model} selesai tanpa gambar. Pilih model gambar di langkah Ide cerita.`)
}
