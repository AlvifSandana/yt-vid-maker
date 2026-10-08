import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Info,
  KeyRound,
  Mic,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Users
} from 'lucide-react'
import {
  HF_IMAGE_MODELS,
  HF_VIDEO_MODELS,
  getImageModel,
  getVideoModel,
  hfModelOptions,
  maxRefs
} from '@shared/higgsfield'
import { cleanKey, keyFormatWarning } from '@shared/keys'
import { LANGUAGES, LLM_PROVIDERS } from '@shared/models'
import type { ApiProvider, AppSettings, KeyStatus, KeyTestResult, LlmProvider, MediaProvider, TtsProvider, WhisperStatus } from '@shared/types'
import { Logo } from '../components/Logo'
import { ModelLogo } from '../components/ModelLogo'
import { ModelPicker } from '../components/ModelPicker'
import { Popover } from '../components/Popover'
import { ProviderLogo, type ProviderLogoId } from '../components/ProviderLogo'
import { Select } from '../components/Select'
import { AboutSection } from './AboutSection'
import { WhisperSection } from './WhisperSection'
import { Badge, Button, Field, IconButton, confirmDialog, cx, inputCls } from '../components/ui'
import { errorText, relativeTime } from '../lib/format'
import { useModels } from '../lib/useModels'
import { useApp } from '../store/app'

type Tab = 'services' | 'general' | 'about'
type StatusOf = (p: ApiProvider) => KeyStatus | undefined

interface ProviderOption<T extends string> {
  id: T
  name: string
  note: string
  logo: ProviderLogoId
  status?: KeyStatus
  checking?: boolean
}

interface SectionProps {
  settings: AppSettings
  statusOf: StatusOf
  checking: ApiProvider[]
  onChanged: () => void
  onSettings: (s: AppSettings) => void
}

const TTS_OPTIONS: Omit<ProviderOption<TtsProvider>, 'status'>[] = [
  { id: 'gemini', name: 'Gemini TTS', note: 'Suara Google Gemini, 30 pilihan suara, mendukung bahasa Indonesia.', logo: 'gemini' },
  { id: 'elevenlabs', name: 'ElevenLabs', note: 'Suara sangat natural dengan waktu kata yang presisi untuk caption karaoke.', logo: 'elevenlabs' }
]

const MEDIA_OPTIONS: Omit<ProviderOption<MediaProvider>, 'status'>[] = [
  { id: 'higgsfield', name: 'Higgsfield', note: 'GPT Image 2.5, Kling, Seedance, dan model lain dari akun Higgsfield kamu.', logo: 'higgsfield' },
  { id: 'custom', name: 'Endpoint custom', note: 'Server mandiri atau proxy lokal (misalnya ComfyUI proxy atau mock API Higgsfield).', logo: 'custom' }
]

const mediaKey = (s: AppSettings): ApiProvider => (s.mediaProvider === 'custom' ? 'custom-media' : 'higgsfield')

/** The providers the current settings actually use, one per service. */
const activeProviders = (s: AppSettings): ApiProvider[] => [s.llmProvider, s.defaultTtsProvider, mediaKey(s)]

/** "Saved but not tested yet" still counts as ready; only a failed or missing key blocks the service. */
const isReady = (s?: KeyStatus): boolean => !!s?.configured && !s.unreadable && s.lastOk !== false

/** Results older than this are re-tested quietly when the page opens, so quota and status are current. */
const STALE_MS = 6 * 60 * 60 * 1000

const GEMINI_SHARED = 'Kunci Gemini dipakai bersama oleh penyusun cerita dan suara narator Gemini TTS, jadi keduanya akan berhenti.'

function StatusBadge({ status, checking }: { status?: KeyStatus; checking?: boolean }) {
  if (checking) return <Badge tone="info">Mengecek…</Badge>
  if (!status?.configured) return <Badge tone="draft">Belum diatur</Badge>
  if (status.lastOk === false) return <Badge tone="bad">Gagal terhubung</Badge>
  if (status.lastOk)
    return (
      <Badge tone="ok">
        <Check className="size-3" strokeWidth={3} />
        Terhubung
      </Badge>
    )
  return <Badge tone="info">Tersimpan</Badge>
}

/** One dropdown to choose which provider a section uses; only that provider's settings are shown below it. */
function ProviderSelect<T extends string>({
  value,
  options,
  label,
  onChange
}: {
  value: T
  options: ProviderOption<T>[]
  label: string
  onChange: (id: T) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const current = Math.max(0, options.findIndex((o) => o.id === value))
  const cur = options[current]

  const show = (): void => {
    setActive(current)
    setOpen(true)
  }
  const pick = (o: ProviderOption<T>): void => {
    setOpen(false)
    trigger.current?.focus()
    if (o.id !== value) onChange(o.id)
  }
  // Focus stays on the trigger and the arrows move the highlight (aria-activedescendant), like a native listbox.
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show()
      }
      return
    }
    const n = options.length
    if (e.key === 'Tab') return setOpen(false)
    if (e.key === 'ArrowDown') setActive((a) => (a + 1) % n)
    else if (e.key === 'ArrowUp') setActive((a) => (a - 1 + n) % n)
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(n - 1)
    else if (e.key === 'Enter' || e.key === ' ') pick(options[active])
    else return
    e.preventDefault()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`${label}: ${cur.name}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${options[active]?.id}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={cx(
          'flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-surface px-4 py-3 text-left transition-shadow',
          open ? 'shadow-none' : 'shadow-ink hover:shadow-ink-md'
        )}
      >
        <ProviderLogo id={cur.logo} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-bold">{cur.name}</span>
          <span className="truncate text-[13px] text-ink-2">{cur.note}</span>
        </span>
        <StatusBadge status={cur.status} checking={cur.checking} />
        <ChevronDown className={cx('size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <Popover
        anchor={trigger}
        open={open}
        label={label}
        onClose={(reason) => {
          setOpen(false)
          if (reason === 'escape') trigger.current?.focus()
        }}
      >
        <div id={listId} role="listbox" aria-label={label} className="scroll-thin flex flex-col gap-0.5 overflow-y-auto p-1.5">
          {options.map((o, i) => {
            const on = o.id === value
            return (
              <div
                key={o.id}
                id={`${listId}-${o.id}`}
                role="option"
                aria-selected={on}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={cx(
                  'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left',
                  on ? 'bg-accent-soft' : i === active && 'bg-sand'
                )}
              >
                <ProviderLogo id={o.logo} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-semibold">{o.name}</span>
                  <span className="truncate text-[13px] text-ink-2">{o.note}</span>
                </span>
                <StatusBadge status={o.status} checking={o.checking} />
                <span className="flex size-5 shrink-0 items-center justify-center">{on && <Check className="size-4 text-accent" strokeWidth={2.6} />}</span>
              </div>
            )
          })}
        </div>
      </Popover>
    </>
  )
}

/**
 * The frame every service shares: title, provider choice, a warning while the chosen provider cannot be
 * used yet, and the provider's own settings.
 */
function ServiceShell<T extends string>({
  id,
  icon,
  title,
  sub,
  feature,
  value,
  options,
  onChange,
  children
}: {
  id: string
  icon: ReactNode
  title: string
  sub: ReactNode
  /** What stops working while the provider is not ready, e.g. "Penyusunan naskah". */
  feature: string
  value: T
  options: ProviderOption<T>[]
  onChange: (id: T) => void
  children: ReactNode
}) {
  const cur = options.find((o) => o.id === value)
  const status = cur?.status
  const what = value === 'custom' ? 'alamatnya' : 'kuncinya'
  const problem = cur?.checking || isReady(status)
    ? null
    : !status?.configured
      ? `${cur?.name} belum diatur.`
      : status.unreadable
        ? `Kunci ${cur?.name} tidak bisa dibuka lagi.`
        : `${cur?.name} gagal terhubung pada tes terakhir.`
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3.5">
      <SectionTitle icon={icon} title={title} sub={sub} />
      <ProviderSelect value={value} options={options} label={title} onChange={onChange} />
      {problem && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-sun bg-sun-soft px-3.5 py-2.5 text-[13px] leading-snug text-sun-ink">
          <AlertTriangle className="mt-px size-4 shrink-0" />
          <span>
            {problem} {feature} belum bisa dipakai sampai {what} tersimpan dan lolos tes.
          </span>
        </p>
      )}
      <Card key={value}>{children}</Card>
    </section>
  )
}

/** API key field(s) with save, test and delete. The custom endpoint also takes a base URL. */
function KeyForm({
  provider,
  name,
  status,
  label = 'API key',
  placeholder = 'Tempel API key',
  hint,
  help,
  link,
  linkLabel,
  customUrl,
  clearWarning,
  onChanged,
  onSaved
}: {
  provider: ApiProvider
  name: string
  status?: KeyStatus
  label?: string
  placeholder?: string
  hint?: ReactNode
  help: string
  link: string | null
  linkLabel: string
  customUrl?: string
  /** Extra line in the delete dialog, e.g. when other features share this key. */
  clearWarning?: string
  onChanged: () => void
  onSaved?: (r: KeyTestResult) => void
}) {
  const { toast } = useApp()
  const configured = !!status?.configured
  const isCustom = provider === 'custom' || provider === 'custom-media'
  const preview = status?.preview ?? null
  const [editing, setEditing] = useState(!preview)
  const [key, setKey] = useState('')
  const [url, setUrl] = useState(customUrl ?? '')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [showTyped, setShowTyped] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)

  // A newly saved or removed key puts the field back in its resting state.
  useEffect(() => {
    setEditing(!preview)
    setKey('')
    setRevealed(null)
  }, [preview])

  // A revealed key should not stay on screen for whoever walks by later.
  useEffect(() => {
    if (!revealed) return
    const t = window.setTimeout(() => setRevealed(null), 30_000)
    return () => window.clearTimeout(t)
  }, [revealed])

  const typed = cleanKey(key)
  // The stored key is shown masked; the custom endpoint keeps an editable (optional) key field.
  const showStored = !isCustom && !editing && !!preview
  const urlChanged = isCustom && url.trim() !== (customUrl ?? '').trim()
  const canSave = isCustom ? !!url.trim() && (urlChanged || !!typed || !configured) : !showStored && !!typed
  // A pasted key only counts once it is saved; Enter saves it too.
  const unsaved = !isCustom && !showStored && !!typed && busy !== 'save'
  const formatWarning = !isCustom && !showStored ? keyFormatWarning(provider, typed) : null
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter' || !canSave || busy) return
    e.preventDefault()
    void save()
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    try {
      const r =
        provider === 'custom-media'
          ? await window.api.settings.setCustomMedia(url, key)
          : isCustom
            ? await window.api.settings.setCustom(url, key)
            : await window.api.settings.setKey(provider, key)
      // Main stores the key before testing it, so a failed test still leaves it saved; say so.
      toast(r.ok ? 'success' : 'error', r.ok ? `${name}: ${r.message}` : `${name}: ${isCustom ? 'alamat' : 'kunci'} tersimpan, tapi tesnya gagal. ${r.message}`)
      setKey('')
      setEditing(false)
      onChanged()
      onSaved?.(r)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const toggleEye = async (): Promise<void> => {
    if (!showStored) {
      setShowTyped(!showTyped)
      return
    }
    setRevealed(revealed ? null : await window.api.settings.revealKey(provider))
  }
  const visible = showStored ? !!revealed : showTyped

  const test = async (): Promise<void> => {
    setBusy('test')
    try {
      const r = await window.api.settings.testKey(provider)
      toast(r.ok ? 'success' : 'error', `${name}: ${r.message}`)
      onChanged()
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const clear = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: `Hapus ${isCustom ? 'endpoint' : 'kunci'} ${name}?`,
      body: `${isCustom ? 'Alamat dan kunci endpoint ini' : 'Kunci ini'} akan dihapus dari komputer ini.${clearWarning ? ` ${clearWarning}` : ''} Kamu bisa menambahkannya lagi kapan saja.`,
      confirm: 'Hapus',
      danger: true
    })
    if (!ok) return
    await window.api.settings.clearKey(provider)
    setUrl('')
    onChanged()
  }

  // Local servers work without a key, so the custom endpoint can drop just its key and keep the address.
  const clearKeyOnly = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: `Hapus kunci ${name}?`,
      body: 'Alamat endpoint tetap tersimpan. Permintaan berikutnya dikirim tanpa kunci.',
      confirm: 'Hapus kunci',
      danger: true
    })
    if (!ok) return
    try {
      await window.api.settings.clearKey(provider, true)
      const r = await window.api.settings.testKey(provider)
      toast(r.ok ? 'success' : 'error', `${name}: kunci dihapus · ${r.message}`)
    } catch (e) {
      toast('error', errorText(e))
    }
    onChanged()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        {isCustom && (
          <Field label="Alamat endpoint (base URL)" className="flex-[1.3]">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onEnter}
              placeholder={provider === 'custom-media' ? 'http://localhost:8000' : 'http://localhost:11434/v1'}
              spellCheck={false}
              className={cx(inputCls, 'h-11 font-mono text-sm')}
            />
          </Field>
        )}
        <Field label={isCustom ? 'API key (opsional)' : label} className="flex-1">
          <div className="relative">
            {showStored ? (
              <input
                readOnly
                value={revealed ?? preview ?? ''}
                aria-label={`${label} tersimpan`}
                className={cx(inputCls, 'h-11 cursor-default bg-paper pr-11 font-mono text-sm')}
              />
            ) : (
              <input
                type={showTyped ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                autoFocus={!isCustom && !!preview}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={onEnter}
                placeholder={
                  isCustom ? (preview ? `Tersimpan (${preview}) · isi untuk mengganti` : 'Kosongkan untuk server lokal') : placeholder
                }
                className={cx(inputCls, 'h-11 pr-11')}
              />
            )}
            {(showStored || key.length > 0) && (
              <button
                type="button"
                aria-label={visible ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                title={visible ? 'Sembunyikan kunci' : 'Tampilkan kunci (tersembunyi lagi setelah 30 detik)'}
                onClick={() => void toggleEye()}
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-sand hover:text-ink"
              >
                {visible ? <EyeOff className="size-[17px]" /> : <Eye className="size-[17px]" />}
              </button>
            )}
          </div>
        </Field>
        {showStored ? (
          <Button
            className="h-11"
            onClick={() => {
              setEditing(true)
              setRevealed(null)
            }}
          >
            Ganti
          </Button>
        ) : (
          <Button variant="accent" className="h-11" disabled={!canSave} loading={busy === 'save'} onClick={() => void save()}>
            Simpan dan tes
          </Button>
        )}
        {!isCustom && editing && !!preview && (
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => {
              setEditing(false)
              setKey('')
            }}
          >
            Batal
          </Button>
        )}
        {configured && (
          <>
            <Button className="h-11" loading={busy === 'test'} onClick={() => void test()}>
              Tes
            </Button>
            <IconButton label={`Hapus ${name}`} size={44} className="text-bad-ink" onClick={() => void clear()}>
              <Trash2 className="size-[18px]" />
            </IconButton>
          </>
        )}
      </div>
      {formatWarning && (
        <p className="-mt-1 flex items-start gap-1.5 text-[13px] text-sun-ink">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {formatWarning} Periksa lagi kuncinya, atau simpan saja kalau kamu yakin.
        </p>
      )}
      {unsaved && <p className="-mt-1 text-[13px] font-semibold text-accent-dark">Kunci belum tersimpan. Tekan Enter atau klik Simpan dan tes.</p>}
      {hint && <p className="-mt-1 text-[13px] text-ink-2">{hint}</p>}
      <div className="flex items-center gap-3 text-[13px] text-ink-2">
        <span className={cx('flex-1', configured && status?.lastOk === false && 'text-bad-ink')}>
          {configured && status?.lastMessage
            ? `${status.lastMessage}${status.checkedAt && !status.unreadable ? ` · dicek ${relativeTime(status.checkedAt)}` : ''}`
            : help}
        </span>
        {isCustom && !!preview && (
          <button type="button" onClick={() => void clearKeyOnly()} className="shrink-0 font-semibold text-bad-ink hover:underline">
            Hapus kunci saja
          </button>
        )}
        {link && (
          <button
            type="button"
            onClick={() => void window.api.app.openExternal(link)}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent-dark hover:underline"
          >
            {linkLabel}
            <ExternalLink className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-[18px]">{children}</section>
}

function SectionTitle({ icon, title, sub }: { icon: ReactNode; title: string; sub: ReactNode }) {
  return (
    <div className="mt-5 flex items-start gap-3">
      <span className="mt-1 text-ink">{icon}</span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-bold leading-tight">{title}</h2>
        <p className="text-sm text-ink-2">{sub}</p>
      </div>
    </div>
  )
}

function LlmSection({ settings, statusOf, checking, onChanged, onSettings }: SectionProps) {
  const { toast } = useApp()
  const provider = settings.llmProvider
  const spec = LLM_PROVIDERS.find((p) => p.id === provider)!
  const status = statusOf(provider)
  const configured = !!status?.configured
  const [openPicker, setOpenPicker] = useState(false)
  const models = useModels(provider, isReady(status), provider === 'custom' ? settings.customBaseUrl : '')
  const model = settings.llmModels[provider]
  const selected = models.models.find((m) => m.id === model)

  const options: ProviderOption<LlmProvider>[] = LLM_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    note: p.note,
    logo: p.id,
    status: statusOf(p.id),
    checking: checking.includes(p.id)
  }))

  return (
    <ServiceShell
      id="svc-llm"
      icon={<Cpu className="size-5" />}
      title="Penyusun cerita (AI LLM)"
      sub="Pilih satu penyedia untuk menyusun klip, naskah, dan pemeran. Hanya penyedia yang dipilih yang dipakai."
      feature="Penyusunan naskah dan rencana visual"
      value={provider}
      options={options}
      onChange={async (id) => {
        setOpenPicker(false)
        onSettings(await window.api.settings.set({ llmProvider: id }))
      }}
    >
      <KeyForm
        provider={provider}
        name={spec.name}
        status={status}
        help={provider === 'custom' ? 'Contoh: http://localhost:11434/v1 untuk Ollama, http://localhost:1234/v1 untuk LM Studio, https://api.x.ai/v1 untuk Grok.' : 'Setelah kunci disimpan, daftar model diambil langsung dari penyedianya.'}
        hint={provider === 'gemini' && settings.defaultTtsProvider === 'gemini' ? 'Kunci ini dipakai bersama untuk suara narator Gemini TTS.' : undefined}
        link={spec.link}
        linkLabel={spec.linkLabel}
        customUrl={settings.customBaseUrl}
        clearWarning={provider === 'gemini' ? GEMINI_SHARED : undefined}
        onChanged={onChanged}
        onSaved={async (r) => {
          if (!r.ok) return
          onSettings(await window.api.settings.get())
          if (configured) void models.refresh()
          if (!model) setOpenPicker(true)
        }}
      />
      {isReady(status) && (
        <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
          <span className="text-sm font-semibold">Model untuk menyusun cerita</span>
          <ModelPicker
            value={model}
            models={models.models}
            loading={models.loading}
            error={models.error}
            fetchedAt={models.fetchedAt}
            onChange={async (id) => {
              setOpenPicker(false)
              onSettings(await window.api.settings.set({ llmModels: { ...settings.llmModels, [provider]: id } }))
              toast('success', `Cerita akan disusun oleh ${spec.name} · ${id}`)
            }}
            onRefresh={() => void models.refresh()}
            allowCustom={provider === 'custom'}
            defaultOpen={openPicker}
            placeholder="Pilih model dari daftar"
          />
          {selected?.description && <p className="line-clamp-2 text-[13px] text-muted">{selected.description}</p>}
          {selected && provider === 'openrouter' && !selected.tags.includes('JSON') && (
            <p className="text-[13px] text-sun-ink">
              Model ini tidak mendukung output JSON terstruktur. Aplikasi tetap mencoba, tapi model berlabel JSON biasanya lebih stabil.
            </p>
          )}
        </div>
      )}
    </ServiceShell>
  )
}

function TtsSection({ settings, statusOf, checking, onChanged, onSettings }: SectionProps) {
  const provider = settings.defaultTtsProvider
  const status = statusOf(provider)
  const ready = isReady(status)
  const models = useModels(provider === 'gemini' ? 'gemini-tts' : 'elevenlabs', ready)
  const options: ProviderOption<TtsProvider>[] = TTS_OPTIONS.map((o) => ({ ...o, status: statusOf(o.id), checking: checking.includes(o.id) }))
  const value = provider === 'gemini' ? settings.geminiTtsModel : settings.elevenModel
  return (
    <ServiceShell
      id="svc-tts"
      icon={<Mic className="size-5" />}
      title="Suara narator (TTS)"
      sub="Penyedia suara bawaan untuk proyek baru. Setiap proyek tetap bisa memilih sendiri di langkah Ide cerita."
      feature="Pembuatan suara narator"
      value={provider}
      options={options}
      onChange={async (id) => onSettings(await window.api.settings.set({ defaultTtsProvider: id }))}
    >
      <KeyForm
        provider={provider}
        name={provider === 'gemini' ? 'Google Gemini' : 'ElevenLabs'}
        status={status}
        help={provider === 'gemini' ? 'Kunci Gemini dari Google AI Studio.' : 'Kunci API dari akun ElevenLabs.'}
        hint={provider === 'gemini' && settings.llmProvider === 'gemini' ? 'Kunci ini dipakai bersama dengan penyusun cerita Gemini.' : undefined}
        link={provider === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://elevenlabs.io/app/settings/api-keys'}
        linkLabel={provider === 'gemini' ? 'Buat kunci di Google AI Studio' : 'Buat kunci di ElevenLabs'}
        clearWarning={provider === 'gemini' ? GEMINI_SHARED : undefined}
        onChanged={onChanged}
        onSaved={(r) => r.ok && void models.refresh()}
      />
      {ready && (
        <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
          <span className="text-sm font-semibold">Model suara</span>
          <ModelPicker
            value={value}
            models={models.models}
            loading={models.loading}
            error={models.error}
            fetchedAt={models.fetchedAt}
            onChange={async (id) => onSettings(await window.api.settings.set(provider === 'gemini' ? { geminiTtsModel: id } : { elevenModel: id }))}
            onRefresh={() => void models.refresh()}
          />
        </div>
      )}
    </ServiceShell>
  )
}

function HiggsfieldSection({ settings, statusOf, checking, onChanged, onSettings }: SectionProps) {
  const { toast } = useApp()
  const provider: MediaProvider = settings.mediaProvider ?? 'higgsfield'
  const isCustom = provider === 'custom'
  const status = statusOf(mediaKey(settings))
  const ready = isReady(status)
  const [openImagePicker, setOpenImagePicker] = useState(false)
  const [openVideoPicker, setOpenVideoPicker] = useState(false)

  // The custom endpoint lists its own models; Higgsfield's come from the bundled catalog.
  const customImages = useModels('media-image', ready && isCustom, settings.customMediaBaseUrl)
  const customVideos = useModels('media-video', ready && isCustom, settings.customMediaBaseUrl)
  const catalogImages = useMemo(() => hfModelOptions('image'), [])
  const catalogVideos = useMemo(() => hfModelOptions('video'), [])
  const imageOptions = isCustom ? customImages.models : catalogImages
  const videoOptions = isCustom ? customVideos.models : catalogVideos

  const currentImage = getImageModel(settings.imageModel)
  const currentVideo = getVideoModel(settings.videoModel)

  const selectedImage = imageOptions.find((m) => m.id === currentImage.id)
  const selectedVideo = videoOptions.find((m) => m.id === currentVideo.id)

  const options: ProviderOption<MediaProvider>[] = MEDIA_OPTIONS.map((o) => {
    const key: ApiProvider = o.id === 'custom' ? 'custom-media' : 'higgsfield'
    return { ...o, status: statusOf(key), checking: checking.includes(key) }
  })

  const onSaved = async (r: KeyTestResult): Promise<void> => {
    if (!r.ok) return
    onSettings(await window.api.settings.get())
    if (isCustom) {
      void customImages.refresh()
      void customVideos.refresh()
    }
  }

  return (
    <ServiceShell
      id="svc-media"
      icon={<ImageIcon className="size-5" />}
      title="Gambar dan video"
      sub="Pilih satu penyedia untuk membuat gambar klip, lembar karakter, dan animasi video AI."
      feature="Pembuatan gambar dan video"
      value={provider}
      options={options}
      onChange={async (id) => {
        setOpenImagePicker(false)
        setOpenVideoPicker(false)
        onSettings(await window.api.settings.set({ mediaProvider: id }))
      }}
    >
      {provider === 'higgsfield' ? (
        <KeyForm
          provider="higgsfield"
          name="Higgsfield"
          status={status}
          placeholder="Tempel hasil tombol Copy API key"
          hint={
            <>
              Di console Higgsfield, buka API Keys lalu klik <strong className="text-ink">Copy API key</strong> dan tempel di sini. Formatnya{' '}
              <code className="rounded bg-sand px-1 font-mono text-xs">KEY_ID:KEY_SECRET</code>. Kalau kamu memegang Key ID dan Secret terpisah, gabungkan
              dengan titik dua.
            </>
          }
          help="Kunci dicek dengan permintaan estimasi biaya, tanpa memakai kredit."
          link="https://higgsfield.ai"
          linkLabel="Buka Higgsfield"
          onChanged={onChanged}
          onSaved={onSaved}
        />
      ) : (
        <KeyForm
          provider="custom-media"
          name="Endpoint custom"
          status={status}
          customUrl={settings.customMediaBaseUrl}
          placeholder="Kosongkan jika server lokal tidak memerlukan kunci"
          hint="Alamat server mandiri yang kompatibel dengan format API Higgsfield. Kunci hanya dikirim ke server tempat kunci itu disimpan."
          help="Contoh: http://localhost:8000 untuk server mock atau proxy lokal."
          link={null}
          linkLabel=""
          onChanged={onChanged}
          onSaved={onSaved}
        />
      )}
      {ready && (
        <>
          <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="size-4 text-ink-2" />
              Model gambar bawaan
            </span>
            <ModelPicker
              value={currentImage.id}
              models={imageOptions}
              loading={isCustom && customImages.loading}
              error={isCustom ? customImages.error : null}
              fetchedAt={isCustom ? customImages.fetchedAt : null}
              onRefresh={isCustom ? () => void customImages.refresh() : undefined}
              renderIcon={(m) => <ModelLogo family={m.family} />}
              detail="description"
              tagFilters={['Rekomendasi', 'Referensi', 'GPT Image', 'Soul', 'Recraft', '4K']}
              defaultOpen={openImagePicker}
              allowCustom={isCustom}
              placeholder="Pilih model gambar dari daftar"
              onChange={async (id) => {
                setOpenImagePicker(false)
                onSettings(await window.api.settings.set({ imageModel: id }))
                toast('success', `Model gambar bawaan: ${getImageModel(id).name}`)
              }}
            />
            {selectedImage?.description && <p className="line-clamp-2 text-[13px] text-muted">{selectedImage.description}</p>}
            <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
              <Users className="mt-px size-3.5 shrink-0" />
              {maxRefs(currentImage)
                ? `Mendukung lembar karakter (maksimal ${maxRefs(currentImage)} tokoh), wajah dan kostum tokoh konsisten di tiap klip.`
                : 'Tanpa lembar karakter, tampilan tokoh bisa sedikit berubah antar klip.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Film className="size-4 text-ink-2" />
              Model video bawaan
            </span>
            <ModelPicker
              value={currentVideo.id}
              models={videoOptions}
              loading={isCustom && customVideos.loading}
              error={isCustom ? customVideos.error : null}
              fetchedAt={isCustom ? customVideos.fetchedAt : null}
              onRefresh={isCustom ? () => void customVideos.refresh() : undefined}
              renderIcon={(m) => <ModelLogo family={m.family} />}
              detail="description"
              tagFilters={['Rekomendasi', 'Kling', 'Seedance', 'Wan', 'Referensi', '4K']}
              defaultOpen={openVideoPicker}
              allowCustom={isCustom}
              placeholder="Pilih model video dari daftar"
              onChange={async (id) => {
                setOpenVideoPicker(false)
                onSettings(await window.api.settings.set({ videoModel: id }))
                toast('success', `Model video bawaan: ${getVideoModel(id).name}`)
              }}
            />
            {selectedVideo?.description && <p className="line-clamp-2 text-[13px] text-muted">{selectedVideo.description}</p>}
          </div>
        </>
      )}
      <p className="flex items-start gap-2.5 border-t border-dashed border-line pt-4 text-[13px] leading-relaxed text-ink-2">
        <Film className="mt-0.5 size-4 shrink-0" />
        <span>
          {isCustom
            ? 'Model di atas adalah pilihan bawaan untuk proyek baru. Daftarnya diambil dari GET /models di server kamu; kalau model yang kamu mau tidak ada, ketik namanya langsung.'
            : `Model di atas adalah pilihan bawaan untuk proyek baru (${HF_IMAGE_MODELS.length} model gambar dan ${HF_VIDEO_MODELS.length} model video tersedia). Setiap proyek tetap bisa memilih modelnya sendiri di langkah Ide cerita.`}
        </span>
      </p>
    </ServiceShell>
  )
}

interface SummaryRow {
  id: string
  label: string
  provider: string
  badge: ReactNode
  ready: boolean
  optional?: boolean
}

/** One glance at which services can run, with a jump to each section. */
function ServiceSummary({ rows }: { rows: SummaryRow[] }) {
  const main = rows.filter((r) => !r.optional)
  const ready = main.filter((r) => r.ready).length
  return (
    <section aria-label="Ringkasan layanan" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
      <p className="text-sm font-semibold">
        {ready === main.length ? 'Semua layanan utama siap dipakai.' : `${ready} dari ${main.length} layanan utama siap. Lengkapi yang belum supaya video bisa dibuat dari awal sampai akhir.`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => document.getElementById(r.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left hover:bg-sand"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12.5px] text-ink-2">
                {r.label}
                {r.optional && ' · opsional'}
              </span>
              <span className="truncate text-[14px] font-semibold">{r.provider}</span>
            </span>
            {r.badge}
          </button>
        ))}
      </div>
    </section>
  )
}

function whisperBadge(w: WhisperStatus | null): ReactNode {
  if (w?.state === 'ready') return <Badge tone="ok">Siap dipakai</Badge>
  if (w?.state === 'downloading' || w?.state === 'verifying') return <Badge tone="warn">Mengunduh</Badge>
  return <Badge tone="draft">Belum diunduh</Badge>
}

export function Settings() {
  const { go, route } = useApp()
  const back = route.name === 'settings' && route.back ? route.back : ({ name: 'home' } as const)
  const [tab, setTab] = useState<Tab>('services')
  const [keys, setKeys] = useState<KeyStatus[] | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [folder, setFolder] = useState('')
  const [encrypted, setEncrypted] = useState(true)
  const [whisper, setWhisper] = useState<WhisperStatus | null>(null)
  const [checking, setChecking] = useState<ApiProvider[]>([])
  const autoChecked = useRef(false)

  const reload = (): void => {
    void window.api.settings.keys().then(setKeys)
    void window.api.settings.get().then(setSettings)
  }
  useEffect(() => {
    reload()
    void window.api.exporter.defaultFolder().then(setFolder)
    void window.api.settings.encryption().then(setEncrypted)
    void window.api.whisper.status().then(setWhisper)
    return window.api.on.whisper(setWhisper)
  }, [])

  const statusOf: StatusOf = (p) => keys?.find((k) => k.provider === p)

  // A status from days ago can hide an expired key or a used-up quota, so re-test the providers in use once, quietly.
  useEffect(() => {
    if (autoChecked.current || !settings || !keys) return
    autoChecked.current = true
    const stale = Date.now() - STALE_MS
    const due = [...new Set(activeProviders(settings))].filter((p) => {
      const s = keys.find((k) => k.provider === p)
      return !!s?.configured && !s.unreadable && (s.checkedAt ?? 0) < stale
    })
    if (!due.length) return
    setChecking(due)
    void Promise.allSettled(due.map((p) => window.api.settings.testKey(p))).then(() => {
      setChecking([])
      reload()
    })
  }, [settings, keys])

  const llmName = settings ? (LLM_PROVIDERS.find((p) => p.id === settings.llmProvider)?.name ?? settings.llmProvider) : ''
  const summary: SummaryRow[] = settings
    ? [
        { id: 'svc-llm', label: 'Penyusun cerita', provider: llmName, key: settings.llmProvider },
        { id: 'svc-tts', label: 'Suara narator', provider: TTS_OPTIONS.find((o) => o.id === settings.defaultTtsProvider)!.name, key: settings.defaultTtsProvider },
        { id: 'svc-media', label: 'Gambar dan video', provider: MEDIA_OPTIONS.find((o) => o.id === settings.mediaProvider)?.name ?? 'Higgsfield', key: mediaKey(settings) }
      ]
        .map(({ key, ...r }): SummaryRow => ({
          ...r,
          ready: isReady(statusOf(key)),
          badge: <StatusBadge status={statusOf(key)} checking={checking.includes(key)} />
        }))
        .concat({ id: 'svc-whisper', label: 'Caption akurat', provider: 'Whisper Small', ready: whisper?.state === 'ready', badge: whisperBadge(whisper), optional: true })
    : []
  const needsAttention = !!keys && summary.some((r) => !r.optional && !r.ready)

  const NAV: { id: Tab; label: string; icon: ReactNode; alert?: boolean }[] = [
    { id: 'services', label: 'Layanan AI dan kunci', icon: <KeyRound className="size-[18px]" />, alert: needsAttention },
    { id: 'general', label: 'Umum', icon: <SlidersHorizontal className="size-[18px]" /> },
    { id: 'about', label: 'Tentang aplikasi', icon: <Info className="size-[18px]" /> }
  ]
  const sectionProps = settings && { settings, statusOf, checking, onChanged: reload, onSettings: setSettings }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[68px] shrink-0 items-center gap-3.5 border-b border-line bg-surface px-8">
        <button type="button" onClick={() => go({ name: 'home' })}>
          <Logo />
        </button>
        <span className="text-xl text-line-3">/</span>
        <span className="font-semibold">Pengaturan</span>
        <div className="flex-1" />
        <Button icon={<ArrowLeft className="size-[18px]" />} onClick={() => go(back)}>
          {back.name === 'project' ? 'Kembali ke proyek' : 'Kembali ke beranda'}
        </Button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Bagian pengaturan" className="flex flex-col gap-1 border-r border-line pl-6 pr-4 pt-7">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={tab === n.id ? 'page' : undefined}
              onClick={() => setTab(n.id)}
              className={cx(
                'flex h-11 items-center gap-3 rounded-xl px-3.5 text-left text-[15px]',
                tab === n.id ? 'bg-ink font-semibold text-paper' : 'font-medium text-ink hover:bg-sand'
              )}
            >
              {n.icon}
              <span className="flex-1">{n.label}</span>
              {n.alert && <span role="img" aria-label="Ada layanan yang belum siap" title="Ada layanan yang belum siap" className="size-2 shrink-0 rounded-full bg-accent" />}
            </button>
          ))}
        </nav>
        <main className="scroll-thin overflow-y-auto">
          <div className="flex max-w-[900px] flex-col gap-3.5 px-14 pb-24 pt-8">
            {tab === 'services' && sectionProps && keys && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Layanan AI dan kunci</h1>
                  <p className="mt-2 max-w-[700px] text-[15px] text-ink-2">
                    Story Maker memakai akun layanan milikmu sendiri. Kunci disimpan {encrypted ? 'terenkripsi ' : ''}di komputer ini dan hanya dikirim
                    langsung ke layanan yang bersangkutan.
                  </p>
                </div>
                {!encrypted && (
                  <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-bad-ink/30 bg-bad-soft px-4 py-3 text-[13.5px] leading-relaxed text-bad-ink">
                    <ShieldAlert className="mt-0.5 size-[18px] shrink-0" />
                    <span>
                      Sistem operasi ini tidak menyediakan enkripsi untuk kunci, jadi kunci disimpan sebagai teks biasa di folder data aplikasi. Hindari
                      memakai kunci dengan limit besar di komputer yang dipakai bersama.
                    </span>
                  </p>
                )}
                <ServiceSummary rows={summary} />
                <LlmSection {...sectionProps} />
                <TtsSection {...sectionProps} />
                <HiggsfieldSection {...sectionProps} />
                <div id="svc-whisper" className="flex scroll-mt-6 flex-col gap-3.5">
                  <WhisperSection settings={sectionProps.settings} onSettings={setSettings} />
                </div>
              </>
            )}

            {tab === 'general' && settings && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Umum</h1>
                  <p className="mt-2 text-[15px] text-ink-2">Pilihan bawaan untuk proyek baru.</p>
                </div>
                <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
                  <Field label="Bahasa default naskah dan suara">
                    <Select
                      label="Bahasa default naskah dan suara"
                      value={settings.defaultLanguage}
                      onChange={async (v) => setSettings(await window.api.settings.set({ defaultLanguage: v }))}
                      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                      className="max-w-[320px]"
                    />
                  </Field>
                  <Field label="Folder ekspor">
                    <div className="flex gap-2">
                      <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-sand px-3.5 font-mono text-[13px]">
                        <FolderOpen className="size-[17px] shrink-0 text-ink-2" />
                        <span className="truncate">{folder}</span>
                      </div>
                      <Button
                        className="h-11"
                        onClick={async () => {
                          const f = await window.api.exporter.pickFolder()
                          if (f) setFolder(f)
                        }}
                      >
                        Ganti folder
                      </Button>
                    </div>
                  </Field>
                </section>
              </>
            )}

            {tab === 'about' && <AboutSection />}
          </div>
        </main>
      </div>
    </div>
  )
}
