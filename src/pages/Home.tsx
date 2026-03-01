import { Mic, Square, Upload, RotateCcw, AudioLines, BadgeInfo } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { transcribeWithProxy } from '@/utils/asrClient'

function formatSeconds(total: number) {
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function Home() {
  const recorder = useAudioRecorder()
  const speech = useSpeechRecognition()
  const [mode, setMode] = useState<'local' | 'proxy'>('local')
  const [speechLang, setSpeechLang] = useState<'en-US' | 'ja-JP'>('en-US')
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<string>('')
  const [apiError, setApiError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const asrEndpoint = (import.meta.env.VITE_ASR_PROXY_URL as string | undefined)?.trim() ?? ''

  const canSend = useMemo(() => {
    return !!recorder.audioBlob && recorder.status === 'stopped' && !transcribing
  }, [recorder.audioBlob, recorder.status, transcribing])

  async function onTranscribe() {
    if (!recorder.audioBlob) return
    if (!asrEndpoint) {
      setApiError('ASRのエンドポイントが未設定です。VITE_ASR_PROXY_URL を設定してください。')
      return
    }

    setApiError(null)
    setTranscript('')
    setTranscribing(true)

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const ext = recorder.mimeType?.includes('ogg') ? 'ogg' : 'webm'
      const filename = `recording.${ext}`

      const result = await transcribeWithProxy({
        endpoint: asrEndpoint,
        audio: recorder.audioBlob,
        filename,
        language: 'auto',
        signal: ac.signal,
      })
      setTranscript(result.text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ASRでエラーが発生しました。'
      setApiError(msg)
    } finally {
      setTranscribing(false)
      abortRef.current = null
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <AudioLines className="h-4 w-4" />
            <span>Voice Intake（デモ）</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">音声入力 → 文字起こし</h1>
          <p className="max-w-2xl text-sm text-zinc-400">
            GitHub Pagesのような静的ホスティングでも動かせるよう、ローカル音声認識（ブラウザ機能）とプロキシ経由ASRの2モードを用意しています。
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('local')}
            className={
              mode === 'local'
                ? 'rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950'
                : 'rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900'
            }
          >
            ローカル音声認識（GitHub Pagesだけ）
          </button>
          <button
            type="button"
            onClick={() => setMode('proxy')}
            className={
              mode === 'proxy'
                ? 'rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950'
                : 'rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900'
            }
          >
            プロキシ経由ASR（MiniMaxなど外部API）
          </button>
        </div>

        {mode === 'local' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">音声入力</h2>
                  <p className="mt-1 text-sm text-zinc-400">ブラウザの音声認識でそのまま文字起こしします。</p>
                </div>
                <div className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
                  {speech.status === 'listening' ? 'LISTENING' : 'READY'}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="text-xs text-zinc-400">
                  言語
                  <select
                    value={speechLang}
                    onChange={(e) => setSpeechLang(e.target.value as 'en-US' | 'ja-JP')}
                    className="ml-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
                  >
                    <option value="en-US">English</option>
                    <option value="ja-JP">日本語</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => speech.start({ lang: speechLang })}
                  disabled={!speech.supported || speech.status === 'listening'}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Mic className="h-4 w-4" />
                  開始
                </button>

                <button
                  type="button"
                  onClick={speech.stop}
                  disabled={speech.status !== 'listening'}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Square className="h-4 w-4" />
                  停止
                </button>

                <button
                  type="button"
                  onClick={() => {
                    speech.reset()
                    setTranscript('')
                    setApiError(null)
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900"
                >
                  <RotateCcw className="h-4 w-4" />
                  リセット
                </button>
              </div>

              {!speech.supported ? (
                <div className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
                  このブラウザでは音声認識が使えません。Chrome系/Edgeを推奨します。
                </div>
              ) : null}

              {speech.error ? (
                <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                  {speech.error}
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400">
                <div className="flex items-start gap-2">
                  <BadgeInfo className="mt-0.5 h-4 w-4 text-zinc-300" />
                  <div>
                    MiniMax等の外部APIをブラウザから直接呼ぶ場合、APIキー露出とCORS制限で詰まりやすいです。
                    デモを確実に動かすため、ここでは外部APIを使いません。
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">文字起こし結果</h2>
                  <p className="mt-1 text-sm text-zinc-400">確定テキストと途中経過を表示します。</p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="mb-2 text-xs text-zinc-400">確定</div>
                {speech.transcript ? (
                  <pre className="whitespace-pre-wrap break-words text-sm text-zinc-100">{speech.transcript}</pre>
                ) : (
                  <div className="text-sm text-zinc-500">まだ結果はありません。</div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="mb-2 text-xs text-zinc-400">途中</div>
                {speech.interimTranscript ? (
                  <pre className="whitespace-pre-wrap break-words text-sm text-zinc-300">{speech.interimTranscript}</pre>
                ) : (
                  <div className="text-sm text-zinc-500">（入力中のみ表示）</div>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">録音</h2>
                  <p className="mt-1 text-sm text-zinc-400">録音して停止後、「文字起こし」を押してください。</p>
                </div>
                <div className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
                  {recorder.status === 'recording' ? 'REC' : 'READY'} · {formatSeconds(recorder.seconds)}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={recorder.start}
                  disabled={!recorder.supported || recorder.status === 'recording' || transcribing}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Mic className="h-4 w-4" />
                  録音開始
                </button>

                <button
                  type="button"
                  onClick={recorder.stop}
                  disabled={recorder.status !== 'recording'}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Square className="h-4 w-4" />
                  停止
                </button>

                <button
                  type="button"
                  onClick={() => {
                    abortRef.current?.abort()
                    recorder.reset()
                    setTranscript('')
                    setApiError(null)
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900"
                >
                  <RotateCcw className="h-4 w-4" />
                  リセット
                </button>
              </div>

              {recorder.error ? (
                <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                  {recorder.error}
                </div>
              ) : null}

              {!recorder.supported ? (
                <div className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
                  このブラウザでは録音が使えません。Chrome系/Edgeを推奨します。
                </div>
              ) : null}

              {recorder.audioUrl ? (
                <div className="mt-5">
                  <p className="mb-2 text-xs text-zinc-400">録音プレビュー</p>
                  <audio controls src={recorder.audioUrl} className="w-full" />
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">文字起こし</h2>
                  <p className="mt-1 text-sm text-zinc-400">録音データをASRへ送信し、テキストを表示します。</p>
                </div>
                <button
                  type="button"
                  onClick={onTranscribe}
                  disabled={!canSend}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {transcribing ? '送信中…' : '文字起こし'}
                </button>
              </div>

              {!asrEndpoint ? (
                <div className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
                  `VITE_ASR_PROXY_URL` が未設定です。GitHub Pagesだけで完結させるなら「ローカル音声認識」を使ってください。
                </div>
              ) : null}

              {apiError ? (
                <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                  {apiError}
                </div>
              ) : null}

              <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="mb-2 text-xs text-zinc-400">結果</div>
                {transcribing ? (
                  <div className="space-y-2">
                    <div className="h-4 w-4/5 animate-pulse rounded bg-zinc-800" />
                    <div className="h-4 w-3/5 animate-pulse rounded bg-zinc-800" />
                    <div className="h-4 w-2/5 animate-pulse rounded bg-zinc-800" />
                  </div>
                ) : transcript ? (
                  <pre className="whitespace-pre-wrap break-words text-sm text-zinc-100">{transcript}</pre>
                ) : (
                  <div className="text-sm text-zinc-500">まだ結果はありません。</div>
                )}
              </div>

              <div className="mt-4 text-xs text-zinc-500">
                APIキーはクライアントに置かず、サーバー側（プロキシ）で環境変数管理してください。
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
