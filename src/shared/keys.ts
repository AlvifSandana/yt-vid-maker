import type { ApiProvider } from './types'

/**
 * Keys copied from a console or a .env file often carry quotes, a "Bearer " prefix or a trailing newline.
 * Shared so the renderer checks the same string that main stores.
 */
export function cleanKey(raw: string): string {
  const unquote = (s: string): string => s.trim().replace(/^["'`]+|["'`]+$/g, '').trim()
  let k = unquote(raw)
  // An env-style name like GEMINI_API_KEY= (needs an underscore, so a base64 key ending in "=" survives).
  k = unquote(k.replace(/^[A-Z][A-Z0-9]*_[A-Z0-9_]*\s*=\s*/, ''))
  k = unquote(k.replace(/^(?:authorization:\s*)?(?:bearer|key)\s+/i, ''))
  return k.replace(/\s+/g, '')
}

/**
 * A hint when a key does not look like the provider's usual format. Only a warning: providers change
 * their formats, so the live test stays the real check.
 */
export function keyFormatWarning(provider: ApiProvider, key: string): string | null {
  if (!key) return null
  switch (provider) {
    case 'higgsfield': {
      const [id, secret, ...rest] = key.split(':')
      return id && secret && rest.length === 0 ? null : 'Kunci Higgsfield biasanya berformat KEY_ID:KEY_SECRET (dua bagian dipisah titik dua).'
    }
    case 'gemini':
      return /^AIza[\w-]{30,}$/.test(key) ? null : 'Kunci Gemini dari Google AI Studio biasanya diawali "AIza".'
    case 'openrouter':
      return /^sk-or-/.test(key) ? null : 'Kunci OpenRouter biasanya diawali "sk-or-".'
    case 'groq':
      return /^gsk_/.test(key) ? null : 'Kunci Groq biasanya diawali "gsk_".'
    case 'elevenlabs':
      return /^sk_\w{20,}$/.test(key) || /^[0-9a-f]{32}$/i.test(key) ? null : 'Kunci ElevenLabs biasanya diawali "sk_".'
    default:
      return null
  }
}

/** Origin of an endpoint URL, used to tell whether a stored key still belongs to the same server. */
export function urlOrigin(url: string): string | null {
  try {
    return new URL(url.trim()).origin.toLowerCase()
  } catch {
    return null
  }
}
