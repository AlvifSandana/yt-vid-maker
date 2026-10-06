import { useEffect, useState } from 'react'
import { Layers, ShieldCheck } from 'lucide-react'
import { LogoMark } from '../components/Logo'

/** Settings › Tentang aplikasi: versi, fitur utama, teknologi, dan lisensi. */
export function AboutSection() {
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.app.version().then(setVersion)
  }, [])

  return (
    <div className="flex flex-col gap-5 text-[15px] leading-relaxed text-ink-2">
      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <LogoMark size={52} />
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <h1 className="font-display text-[32px] font-bold tracking-[-0.015em] text-ink">Story Maker</h1>
                {version && (
                  <span className="rounded-full border border-line-2 bg-sand px-3 py-0.5 font-mono text-xs font-semibold text-ink">
                    v{version}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-muted">
                Dibuat oleh <strong className="font-semibold text-ink">Kucing Sakti</strong>
              </span>
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-[720px] text-[15px] leading-relaxed text-ink-2">
          Aplikasi desktop studio terpadu untuk mengubah ide cerita menjadi video YouTube utuh berkualitas tinggi.
          Mulai dari perumusan naskah, perancangan karakter, visual gambar dan animasi video AI, narasi suara realistis,
          hingga perakitan timeline dan sinkronisasi caption karaoke otomatis.
        </p>
      </section>

      {/* Alur Produksi Video */}
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center gap-2 text-ink">
          <Layers className="size-5 text-accent" />
          <h2 className="font-display text-[20px] font-bold">Alur Produksi Video</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 rounded-xl border border-line-2 bg-sand/50 p-4">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">1</span>
              Ide & Konsep Cerita
            </span>
            <p className="text-[13.5px] text-ink-2">
              Tulis sinopsis cerita atau biarkan AI membantumu merumuskannya. Tentukan durasi target, rasio video (16:9 lanskap atau 9:16 Shorts/Reels), bahasa, serta 20 pilihan gaya visual seni.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 rounded-xl border border-line-2 bg-sand/50 p-4">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">2</span>
              Naskah & Karakter
            </span>
            <p className="text-[13.5px] text-ink-2">
              AI menyusun naskah per adegan lengkap dengan arahan visual detail. Karakter tokoh dirancang dengan lembar karakter (character sheet) agar wajah dan kostum tokoh selalu konsisten di tiap klip.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 rounded-xl border border-line-2 bg-sand/50 p-4">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">3</span>
              Gambar, Video & Suara AI
            </span>
            <p className="text-[13.5px] text-ink-2">
              Buat gambar adegan dengan Higgsfield atau endpoint custom, ubah gambar menjadi animasi video AI, serta buat narasi suara natural melalui Gemini TTS atau ElevenLabs.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 rounded-xl border border-line-2 bg-sand/50 p-4">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">4</span>
              Timeline & Ekspor MP4
            </span>
            <p className="text-[13.5px] text-ink-2">
              Rangkai di editor timeline: potong klip, atur gerak kamera sinematik, efek transisi, musik latar, serta caption kata-per-kata otomatis dengan Whisper lokal. Render video langsung dengan FFmpeg.
            </p>
          </div>
        </div>
      </section>

      {/* Privasi & Keamanan Kunci */}
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center gap-2 text-ink">
          <ShieldCheck className="size-5 text-ok" />
          <h2 className="font-display text-[20px] font-bold">Privasi & Kunci Mandiri (BYOK)</h2>
        </div>
        <p className="text-[14px] leading-relaxed text-ink-2">
          Story Maker menganut prinsip <strong>Bring Your Own Key (BYOK)</strong>. Semua kunci API disimpan terenkripsi di komputer kamu menggunakan sistem enkripsi bawaan Windows (DPAPI safeStorage). Kunci hanya dikirim langsung ke penyedia resmi saat melakukan permintaan dan tidak pernah dikirim ke server pihak ketiga.
        </p>
        <div className="mt-1 flex flex-wrap gap-2 text-xs font-medium text-ink-2">
          <span className="rounded-lg border border-line bg-sand px-2.5 py-1">Enkripsi DPAPI Lokal</span>
          <span className="rounded-lg border border-line bg-sand px-2.5 py-1">Semua Aset Tersimpan di Komputer</span>
          <span className="rounded-lg border border-line bg-sand px-2.5 py-1">Database SQLite Terisolasi</span>
        </div>
      </section>

      {/* Teknologi & Lisensi */}
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 text-[13.5px] leading-relaxed text-muted">
        <h2 className="text-[15px] font-semibold text-ink">Teknologi & Lisensi Open Source</h2>
        <p>
          Story Maker dirilis dengan lisensi open source <strong>MIT</strong>. Aplikasi ini dibangun dengan teknologi terbaik:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>FFmpeg</strong> (lisensi GPL) untuk perakitan, filtering visual, mixing suara, dan render video MP4 berkecepatan tinggi.</li>
          <li><strong>whisper.cpp</strong> (lisensi MIT) untuk transkripsi dan penyesuaian waktu kata narasi secara offline tanpa internet.</li>
          <li><strong>Tipografi Google Fonts</strong>: Plus Jakarta Sans, Bricolage Grotesque, dan JetBrains Mono (SIL OFL & Apache 2.0).</li>
          <li><strong>Layanan AI Eksternal</strong>: Google Gemini, ElevenLabs, Higgsfield, OpenRouter, dan Groq (merek dagang dan hak cipta milik penyedia masing-masing).</li>
        </ul>
        <p className="pt-2 text-xs text-muted">
          Dibuat dengan penuh dedikasi oleh <strong className="text-ink">Kucing Sakti</strong>. Selamat berkarya dan menciptakan cerita visualmu!
        </p>
      </section>
    </div>
  )
}
