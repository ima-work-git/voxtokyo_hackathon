import { Mic, Square, Upload, RotateCcw, AudioLines, BadgeInfo, Send, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { transcribeWithProxy } from '@/utils/asrClient'
import { chatWithProxy, type ChatMessage } from '@/utils/chatClient'
import { ttsWithProxy } from '@/utils/ttsClient'

function formatSeconds(total: number) {
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function Home() {
  const recorder = useAudioRecorder()
  const speech = useSpeechRecognition()
  const dictation = useSpeechRecognition()
  const [mode, setMode] = useState<'local' | 'proxy'>('local')
  const [speechLang, setSpeechLang] = useState<'en-US' | 'ja-JP'>('en-US')
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<string>('')
  const [apiError, setApiError] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [ttsMode, setTtsMode] = useState<'browser' | 'minimax'>('minimax')
  const [ttsVoiceId, setTtsVoiceId] = useState<string>('English_expressive_narrator')
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsAbortRef = useRef<AbortController | null>(null)
  const ttsRequestIdRef = useRef(0)
  const [voiceAutoSend, setVoiceAutoSend] = useState(true)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content:
        'You are a helpful assistant for visiting tourists in Japan. Keep responses short and practical. If the user seems to have an emergency, ask one short follow-up question about location.',
    },
  ])

  const abortRef = useRef<AbortController | null>(null)

  const asrEndpoint = (import.meta.env.VITE_ASR_PROXY_URL as string | undefined)?.trim() ?? ''
  const chatEndpoint = (import.meta.env.VITE_CHAT_PROXY_URL as string | undefined)?.trim() ?? ''
  const ttsEndpoint = (import.meta.env.VITE_TTS_PROXY_URL as string | undefined)?.trim() ?? ''

  const prevDictationStatusRef = useRef(dictation.status)

  useEffect(() => {
    if (!ttsEndpoint) setTtsMode('browser')
  }, [ttsEndpoint])

  const canSend = useMemo(() => {
    return !!recorder.audioBlob && recorder.status === 'stopped' && !transcribing
  }, [recorder.audioBlob, recorder.status, transcribing])

  const canChat = useMemo(() => {
    return !!chatEndpoint && !chatBusy && chatInput.trim().length > 0
  }, [chatBusy, chatEndpoint, chatInput])

  const dictationHasText = useMemo(() => {
    return dictation.transcript.trim().length > 0 || dictation.interimTranscript.trim().length > 0
  }, [dictation.interimTranscript, dictation.transcript])

  function speakWithBrowser(text: string, lang: 'en-US' | 'ja-JP') {
    if (!ttsEnabled) return
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  async function speakWithMiniMax(text: string) {
    if (!ttsEnabled) return
    if (!ttsEndpoint) {
      setTtsError('TTSのエンドポイントが未設定です。VITE_TTS_PROXY_URL を設定してください。')
      return
    }

    setTtsError(null)
    const requestId = (ttsRequestIdRef.current += 1)

    ttsAbortRef.current?.abort()
    const ac = new AbortController()
    ttsAbortRef.current = ac

    const a = audioRef.current
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
    }

    setTtsPlaying(true)
    setTtsAudioUrl(null)

    try {
      const languageBoost = speechLang === 'ja-JP' ? 'Japanese' : 'English'
      const res = await ttsWithProxy({
        endpoint: ttsEndpoint,
        text,
        voice_id: ttsVoiceId,
        language_boost: languageBoost,
        signal: ac.signal,
      })

      if (ttsRequestIdRef.current !== requestId) return

      if (!res.audio_url) {
        setTtsError('TTSが音声URLを返しませんでした。')
        return
      }

      setTtsAudioUrl(res.audio_url)
      if (!a) return
      a.src = res.audio_url
      a.load()
      const playPromise = a.play()
      if (playPromise) {
        await playPromise.catch((e) => {
          const msg = e instanceof Error ? e.message : '音声の再生に失敗しました。'
          setTtsError(msg)
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'TTSでエラーが発生しました。'
      setTtsError(msg)
    } finally {
      if (ttsRequestIdRef.current === requestId) setTtsPlaying(false)
      if (ttsAbortRef.current === ac) ttsAbortRef.current = null
    }
  }

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

  async function onSendChat(overrideText?: string) {
    const text = (overrideText ?? chatInput).trim()
    if (!text) return
    if (!chatEndpoint) {
      setChatError('チャットのエンドポイントが未設定です。VITE_CHAT_PROXY_URL を設定してください。')
      return
    }

    setChatError(null)
    setChatBusy(true)

    const ac = new AbortController()
    abortRef.current = ac

    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: text }]
    setChatMessages(nextMessages)
    setChatInput('')

    try {
      const result = await chatWithProxy({
        endpoint: chatEndpoint,
        messages: nextMessages,
        temperature: 0.2,
        max_tokens: 512,
        signal: ac.signal,
      })
      const assistantText = result.text
      setChatMessages((prev) => [...prev, { role: 'assistant', content: assistantText }])
      if (ttsMode === 'minimax') await speakWithMiniMax(assistantText)
      else speakWithBrowser(assistantText, speechLang)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'チャットでエラーが発生しました。'
      setChatError(msg)
    } finally {
      setChatBusy(false)
      abortRef.current = null
    }
  }

  useEffect(() => {
    const prev = prevDictationStatusRef.current
    prevDictationStatusRef.current = dictation.status
    if (prev !== 'listening') return
    if (dictation.status === 'listening') return

    const t = dictation.transcript.trim()
    if (!t) return
    dictation.reset()

    if (voiceAutoSend) {
      void onSendChat(t)
      return
    }

    setChatInput((p) => (p ? `${p} ${t}` : t))
  }, [dictation, voiceAutoSend])

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
                    音声認識はブラウザ機能で完結します。MiniMax等の外部APIは、APIキー露出とCORS制限があるため、通常はプロキシが必要です。
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

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold">会話（MiniMax）</h2>
              <p className="mt-1 text-sm text-zinc-400">テキスト入力（または音声入力）を送信して応答を表示します。</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-zinc-400">
                言語
                <select
                  id="chat-lang"
                  name="chat-lang"
                  value={speechLang}
                  onChange={(e) => setSpeechLang(e.target.value as 'en-US' | 'ja-JP')}
                  className="ml-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-zinc-100"
                >
                  <option value="en-US">English</option>
                  <option value="ja-JP">日本語</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setTtsEnabled((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900"
              >
                {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {ttsEnabled ? '読み上げON' : '読み上げOFF'}
              </button>

              <label className="text-xs text-zinc-400">
                読み上げ
                <select
                  id="tts-mode"
                  name="tts-mode"
                  value={ttsMode}
                  onChange={(e) => setTtsMode(e.target.value as 'browser' | 'minimax')}
                  className="ml-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-zinc-100"
                >
                  <option value="minimax">MiniMax TTS</option>
                  <option value="browser">ブラウザ</option>
                </select>
              </label>

              {ttsMode === 'minimax' ? (
                <label className="text-xs text-zinc-400">
                  Voice
                  <input
                    id="tts-voice"
                    name="tts-voice"
                    value={ttsVoiceId}
                    onChange={(e) => setTtsVoiceId(e.target.value)}
                    className="ml-2 w-56 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-zinc-100"
                  />
                </label>
              ) : null}

              <button
                type="button"
                onClick={() => setVoiceAutoSend((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900"
              >
                {voiceAutoSend ? '音声→自動送信ON' : '音声→自動送信OFF'}
              </button>
            </div>
          </div>

          {!chatEndpoint ? (
            <div className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
              `VITE_CHAT_PROXY_URL` が未設定です。GitHub Pages単体ではMiniMax APIキーを安全に扱えないため、プロキシ（例: Supabase Edge Function）が必要です。
            </div>
          ) : null}

          {ttsMode === 'minimax' && !ttsEndpoint ? (
            <div className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
              `VITE_TTS_PROXY_URL` が未設定です。MiniMax TTSで読み上げるにはTTSプロキシが必要です。
            </div>
          ) : null}

          {ttsError ? (
            <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
              {ttsError}
            </div>
          ) : null}

          {chatError ? (
            <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
              {chatError}
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-2 text-xs text-zinc-400">履歴</div>
            <div className="max-h-[40vh] space-y-3 overflow-auto pr-1">
              {chatMessages
                .filter((m) => m.role !== 'system')
                .map((m, idx) => (
                  <div
                    key={`${m.role}-${idx}`}
                    className={
                      m.role === 'user'
                        ? 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm'
                        : 'rounded-xl border border-zinc-800 bg-zinc-900/10 p-3 text-sm'
                    }
                  >
                    <div className="mb-1 text-xs text-zinc-400">{m.role === 'user' ? 'You' : 'MiniMax'}</div>
                    <div className="whitespace-pre-wrap break-words text-zinc-100">{m.content}</div>
                  </div>
                ))}
              {chatBusy ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/10 p-3 text-sm text-zinc-300">…</div>
              ) : null}
            </div>
          </div>

          {ttsMode === 'minimax' ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <audio
                ref={audioRef}
                controls
                className="w-full"
                onPlay={() => setTtsPlaying(true)}
                onPause={() => setTtsPlaying(false)}
                onEnded={() => setTtsPlaying(false)}
                src={ttsAudioUrl ?? undefined}
              />
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type your message…"
                className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onSendChat()
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (dictation.status === 'listening') {
                    dictation.stop()
                    return
                  }
                  dictation.start({ lang: speechLang })
                }}
                disabled={!dictation.supported}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Mic className="h-4 w-4" />
                {dictation.status === 'listening' ? '入力中…' : '音声入力'}
              </button>

              <button
                type="button"
                onClick={() => {
                  const t = dictation.transcript.trim()
                  if (t) setChatInput((prev) => (prev ? `${prev} ${t}` : t))
                  dictation.reset()
                }}
                disabled={!dictation.transcript.trim().length}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                反映
              </button>

              <button
                type="button"
                onClick={() => onSendChat()}
                disabled={!canChat}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {chatBusy ? '送信中…' : '送信'}
              </button>

              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort()
                  dictation.reset()
                  setChatError(null)
                  setChatBusy(false)
                  setChatInput('')
                  setChatMessages((prev) => prev.slice(0, 1))
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-900"
              >
                <RotateCcw className="h-4 w-4" />
                クリア
              </button>
            </div>
          </div>

          {!dictation.supported ? (
            <div className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
              このブラウザでは音声入力（Web Speech）が使えません。PCのChrome/Edgeで、アドレスバーのマイク権限を許可してください。
            </div>
          ) : null}

          {dictation.error ? (
            <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
              {dictation.error}
            </div>
          ) : null}

          {dictationHasText ? (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 text-xs text-zinc-400">
                音声入力プレビュー{dictation.status === 'listening' ? '（入力中）' : ''}
              </div>
              {dictation.transcript.trim() ? (
                <div className="whitespace-pre-wrap break-words text-sm text-zinc-100">{dictation.transcript}</div>
              ) : null}
              {dictation.interimTranscript.trim() ? (
                <div className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400">{dictation.interimTranscript}</div>
              ) : null}
              <div className="mt-2 text-xs text-zinc-500">「反映」を押すと入力欄に入ります。</div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
