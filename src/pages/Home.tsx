import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { chatWithProxy, type ChatMessage } from '@/utils/chatClient'
import { ttsWithProxy } from '@/utils/ttsClient'
import { useEffect, useMemo, useRef, useState } from 'react'

type DetectedLang = 'ja' | 'en' | 'zh'

function detectLanguageFromText(text: string): DetectedLang {
  if (/[\u3040-\u30ff]/.test(text)) return 'ja'
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh'
  if (/[a-zA-Z]/.test(text)) return 'en'
  return 'en'
}

function toBcp47(lang: DetectedLang) {
  if (lang === 'ja') return 'ja-JP' as const
  if (lang === 'zh') return 'zh-CN' as const
  return 'en-US' as const
}

function toLanguageBoost(lang: DetectedLang) {
  if (lang === 'ja') return 'Japanese'
  if (lang === 'zh') return 'Chinese'
  return 'English'
}

function uiText(lang: DetectedLang) {
  if (lang === 'ja') {
    return {
      title: '緊急通報アシスタント',
      titleEn: 'Emergency Call Assistant',
      prompt: '緊急事態の内容を話してください',
      promptEn: 'Please describe your emergency',
      micPermission: 'マイクの許可が必要です。ブラウザの権限を確認してください。',
      callNow: 'タップして発信',
      listening: '音声入力中',
      tapToStop: 'タップで停止',
      tapToTalk: 'タップして話す',
      processing: '処理中…',
      aiSays: 'AIの案内',
      enableAudio: '音声を有効化',
      enableAudioHint: 'タップすると読み上げが再生されます',
      language: '言語',
    }
  }
  if (lang === 'zh') {
    return {
      title: '紧急通报助手',
      titleEn: null,
      prompt: '请说出紧急情况',
      promptEn: null,
      micPermission: '需要麦克风权限，请检查浏览器设置。',
      callNow: '点击拨打',
      listening: '正在听',
      tapToStop: '点击停止',
      tapToTalk: '点击说话',
      processing: '处理中…',
      aiSays: 'AI提示',
      enableAudio: '启用语音',
      enableAudioHint: '点击后可播放语音提示',
      language: '语言',
    }
  }
  return {
    title: 'Emergency Call Assistant',
    titleEn: null,
    prompt: 'Please describe your emergency',
    promptEn: null,
    micPermission: 'Microphone permission is required. Please check browser settings.',
    callNow: 'Tap to call',
    listening: 'Listening',
    tapToStop: 'Tap to stop',
    tapToTalk: 'Tap to talk',
    processing: 'Processing…',
    aiSays: 'AI guidance',
    enableAudio: 'Enable audio',
    enableAudioHint: 'Tap to allow audio playback',
    language: 'Language',
  }
}

function isAutoplayBlockedError(e: unknown) {
  if (e instanceof DOMException && e.name === 'NotAllowedError') return true
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const m = String(msg).toLowerCase()
  return m.includes('notallowederror') || m.includes('play() failed') || m.includes('user didn\'t interact') || m.includes('not allowed')
}

function stripThink(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

function stripDecorations(text: string) {
  return text.replace(/^=+$/gm, '').trim()
}

function sanitizeAssistantText(text: string) {
  const cleaned = stripDecorations(stripThink(text))
  return cleaned.replace(/[\u2600-\u27BF]/g, '').replace(/\uFE0F/g, '').trim()
}

function parseJsonMaybe(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function extractSpokenTextFromJsonish(text: string): string | null {
  const m = text.match(/"spoken_text"\s*:\s*"([\s\S]*?)"/)
  if (!m) return null
  return m[1]
}

function extractCallFromText(text: string): '119' | '110' | null {
  if (/\b110\b/.test(text)) return '110'
  if (/\b119\b/.test(text)) return '119'
  return null
}

function normalizeForCompare(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[“”"'`.,!?，。！？:;（）()\[\]{}<>]/g, '')
}

function emergencyHeuristic(text: string, lang: DetectedLang): { spoken_text: string; call: '119' | '110' | null } | null {
  const t = text.trim()
  const normalized = t.replace(/[\s\u3000]+/g, '')
  const isGreetingOnly = /^(もしもし|もしもーし|はい|お願いします|助けて|たすけて|help|hello|hi|喂|你好|救命|帮帮我)$/i.test(normalized)

  if (isGreetingOnly) {
    if (lang === 'ja') return { spoken_text: 'どうしましたか？', call: null }
    if (lang === 'zh') return { spoken_text: '发生什么事了？', call: null }
    return { spoken_text: 'What happened?', call: null }
  }

  const hasFire = /火事|火|煙|燃え|焦げ|ガス|爆発|火灾|着火|烟|煤气|爆炸|fire|smoke|gas|explosion/i.test(t)
  const hasBloodOrInjury =
    /血|出血|けが|怪我|意識|倒れ|呼吸|苦しい|胸|痛い|流血|受伤|昏迷|呼吸困难|胸痛|bleed|blood|injury|hurt|unconscious|breath|breathing|can\s*not\s*breathe|shortness\s*of\s*breath|chest\s*pain/i.test(
      t,
    )
  const hasCrime = /犯人|ストーカー|盗難|泥棒|暴力|脅迫|不審者|襲われ|跟踪|骚扰|偷|盗窃|打人|威胁|可疑|crime|thief|stalker|attack|assault|threat/i.test(t)

  if (hasCrime) {
    if (lang === 'ja') return { spoken_text: '警察です。危険の可能性があります。電話番号は110です。いまどこにいますか？', call: '110' }
    if (lang === 'zh') return { spoken_text: '这是报警情况。电话号码是110。你现在在哪里？', call: '110' }
    return { spoken_text: 'This is a police emergency. The number is 110. Where are you now?', call: '110' }
  }

  if (hasFire) {
    if (lang === 'ja') return { spoken_text: '消防です。火災の可能性があります。電話番号は119です。いまどこにいますか？', call: '119' }
    if (lang === 'zh') return { spoken_text: '这是消防紧急情况。电话号码是119。你现在在哪里？', call: '119' }
    return { spoken_text: 'This is a fire emergency. The number is 119. Where are you now?', call: '119' }
  }

  if (hasBloodOrInjury) {
    const isBleeding = /血|出血|bleed|blood|流血/i.test(t)
    if (lang === 'ja') {
      return {
        spoken_text: isBleeding
          ? '血が止まらないのですね。救急です。病院へ搬送する機関の電話番号はこちらです。119。いまどこにいますか？'
          : '救急です。電話番号は119です。いまどこにいますか？',
        call: '119',
      }
    }
    if (lang === 'zh') {
      return {
        spoken_text: isBleeding
          ? '你在流血且止不住。请拨打急救电话119。你现在在哪里？'
          : '这是急救情况。请拨打119。你现在在哪里？',
        call: '119',
      }
    }
    return {
      spoken_text: isBleeding
        ? 'You are bleeding and it won’t stop. Call 119 for an ambulance. Where are you now?'
        : 'This is a medical emergency. The number is 119. Where are you now?',
      call: '119',
    }
  }

  return null
}

function buildDispatchSystemMessage(lang: DetectedLang): ChatMessage {
  if (lang === 'ja') {
    return {
      role: 'system',
      content:
        'あなたは日本の緊急通報（119/110）を受け付ける指令員です。通報者テキストを受け取り、必ず次の形式のSTRICT JSONのみで返してください。<think>や説明文、Markdownは禁止です。\n\n{\n  "call": "119" | "110" | null,\n  "spoken_text": "この文章をそのまま読み上げる（日本語、短く）"\n}\n\nルール: (1) 火災/煙/ガス/爆発なら call=119 を明示。(2) けが/出血/意識なし/呼吸困難/胸痛/強い痛み/体調不良（例: 頭痛・腹痛・吐き気・めまい・発熱）なら call=119 を明示。(3) 犯罪/暴力/不審者/ストーカーなら call=110 を明示。(4) 本当に状況が不明（挨拶だけ等）なら call=null で「どうしましたか？」だけ返す。\n禁止: 「緊急ですか？」と聞かない。絵文字を使わない。',
    }
  }
  if (lang === 'zh') {
    return {
      role: 'system',
      content:
        '你是日本的紧急报警接线员（119/110）。只返回STRICT JSON（禁止<think>、解释、Markdown）。\n\n{\n  "call": "119" | "110" | null,\n  "spoken_text": "要直接朗读的短句（中文）"\n}\n\n规则: (1) 火灾/烟/煤气/爆炸 → call=119 并明确119。(2) 受伤/出血/昏迷/呼吸困难/胸痛/明显疼痛/不适（例: 头痛、腹痛、恶心、眩晕、发烧）→ call=119 并明确119。(3) 犯罪/暴力/可疑人物/跟踪 → call=110 并明确110。(4) 只有问候等确实不清楚 → call=null，只问“发生什么事了？”。\n禁止: 不要问“是否紧急？”，不要用表情符号。',
    }
  }
  return {
    role: 'system',
    content:
      'You are a Japanese emergency dispatcher (119/110). Return STRICT JSON only (no <think>, no explanations, no markdown).\n\n{\n  "call": "119" | "110" | null,\n  "spoken_text": "A short sentence to read aloud in English"\n}\n\nRules: (1) Fire/smoke/gas/explosion -> call=119 and clearly say 119. (2) Injury/bleeding/unconscious/breathing issues/chest pain OR feeling unwell (e.g., headache, migraine, stomach ache, abdominal pain, nausea, vomiting, dizziness, fainting, fever) -> call=119 and clearly say 119. (3) Crime/violence/suspicious person/stalker -> call=110 and clearly say 110. (4) Only if truly unclear (greeting only etc.), set call=null and only ask: "What happened?"\nForbidden: Do not ask "Is it an emergency?" Do not use emojis.',
  }
}

export default function Home() {
  const stt = useSpeechRecognition()
  const autoStartedRef = useRef(false)
  const [callNumber, setCallNumber] = useState<'119' | '110' | null>(null)
  const [assistantText, setAssistantText] = useState('')
  const lastAssistantRef = useRef('')
  const [processing, setProcessing] = useState(false)
  const dispatchRequestIdRef = useRef(0)
  const silenceTimerRef = useRef<number | null>(null)
  const lastSpokenRef = useRef('')
  const silenceEndTriggeredRef = useRef(false)

  const [history, setHistory] = useState<Array<{ user_text: string; assistant_text: string; call: '119' | '110' | null }>>([])

  const preferredLang = useMemo<DetectedLang>(() => {
    if (typeof navigator === 'undefined') return 'en'
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean)
    const lower = langs.map((l) => String(l).toLowerCase())
    if (lower.some((l) => l.startsWith('ja'))) return 'ja'
    if (lower.some((l) => l.startsWith('zh'))) return 'zh'
    return 'en'
  }, [])

  const [selectedLang, setSelectedLang] = useState<DetectedLang>(preferredLang)

  useEffect(() => {
    setSelectedLang(preferredLang)
  }, [preferredLang])

  const abortRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsObjectUrlRef = useRef<string | null>(null)
  const ttsAbortRef = useRef<AbortController | null>(null)
  const ttsRequestIdRef = useRef(0)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false)
  const pendingAudioSrcRef = useRef<string | null>(null)

  const chatEndpoint = (import.meta.env.VITE_CHAT_PROXY_URL as string | undefined)?.trim() ?? ''
  const ttsEndpoint = (import.meta.env.VITE_TTS_PROXY_URL as string | undefined)?.trim() ?? ''
  const ttsVoiceId = 'English_expressive_narrator'

  const spokenText = useMemo(() => {
    const interim = stt.interimTranscript.trim()
    const final = stt.transcript.trim()
    return interim || final
  }, [stt.interimTranscript, stt.transcript])

  useEffect(() => {
    lastSpokenRef.current = spokenText
  }, [spokenText])

  useEffect(() => {
    lastAssistantRef.current = assistantText
  }, [assistantText])

  const detectedLang = useMemo(() => detectLanguageFromText(spokenText), [spokenText])
  const sttLang = useMemo(() => toBcp47(selectedLang), [selectedLang])

  function restartListening() {
    if (!stt.supported) return
    if (processing) return
    if (stt.status === 'listening') return

    window.setTimeout(() => {
      if (!stt.supported) return
      if (processing) return
      if (stt.status === 'listening') return
      stt.reset()
      stt.start({ lang: sttLang })
    }, 200)
  }

  useEffect(() => {
    if (autoStartedRef.current) return
    if (!stt.supported) return
    autoStartedRef.current = true
    stt.start({ lang: sttLang })
  }, [stt.start, stt.supported, sttLang])

  useEffect(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    if (stt.status !== 'listening') return

    silenceTimerRef.current = window.setTimeout(() => {
      if (stt.status !== 'listening') return
      const t = lastSpokenRef.current.trim()
      if (!t) return
      silenceEndTriggeredRef.current = true
      stt.stop()
    }, 2000)

    return () => {
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
    }
  }, [spokenText, stt.status, stt.stop])

  async function speakWithMiniMax(text: string, lang: DetectedLang) {
    if (!ttsEndpoint) return

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

    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current)
      ttsObjectUrlRef.current = null
    }

    try {
      const res = await ttsWithProxy({
        endpoint: ttsEndpoint,
        text,
        voice_id: ttsVoiceId,
        language_boost: toLanguageBoost(lang),
        signal: ac.signal,
      })

      if (ttsRequestIdRef.current !== requestId) return

      let src = res.audio_url ?? null
      if (!src && res.audio_hex) {
        const hex = res.audio_hex
        const bytes = new Uint8Array(hex.length / 2)
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
        }
        const blob = new Blob([bytes], { type: 'audio/mpeg' })
        src = URL.createObjectURL(blob)
        ttsObjectUrlRef.current = src
      }

      if (!src) return
      if (!a) return

      a.src = src
      a.load()
      const playPromise = a.play()
      if (playPromise) {
        await playPromise.catch((e) => {
          if (ttsRequestIdRef.current !== requestId) return
          if (isAutoplayBlockedError(e)) {
            pendingAudioSrcRef.current = src
            setNeedsAudioUnlock(true)
            restartListening()
            return
          }
          const msg = e instanceof Error ? e.message : 'Playback failed'
          if (typeof msg === 'string' && msg.toLowerCase().includes('interrupted')) return
          setTtsError(msg)
        })
      }
    } catch (e) {
      if (ttsRequestIdRef.current !== requestId) return
      const msg = e instanceof Error ? e.message : 'TTS failed'
      setTtsError(msg)
    } finally {
      if (ttsAbortRef.current === ac) ttsAbortRef.current = null
    }
  }

  async function tryPlayPendingAudio() {
    const src = pendingAudioSrcRef.current
    const a = audioRef.current
    if (!src || !a) return
    try {
      a.src = src
      a.load()
      await a.play()
      setNeedsAudioUnlock(false)
      pendingAudioSrcRef.current = null
    } catch (e) {
      if (isAutoplayBlockedError(e)) return
      const msg = e instanceof Error ? e.message : 'Playback failed'
      setTtsError(msg)
    }
  }

  useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const onEnded = () => {
      restartListening()
    }

    a.addEventListener('ended', onEnded)
    return () => a.removeEventListener('ended', onEnded)
  }, [processing, stt, sttLang])

  async function dispatch(text: string) {
    const lang = selectedLang

    const requestId = (dispatchRequestIdRef.current += 1)
    setProcessing(true)
    setAssistantText('')
    setCallNumber(null)

    const heuristic = emergencyHeuristic(text, lang)
    if (heuristic) {
      if (dispatchRequestIdRef.current !== requestId) return
      setCallNumber(heuristic.call)
      setAssistantText(heuristic.spoken_text)
      setHistory((prev) => [{ user_text: text, assistant_text: heuristic.spoken_text, call: heuristic.call }, ...prev].slice(0, 12))
      await speakWithMiniMax(heuristic.spoken_text, lang)
      if (dispatchRequestIdRef.current === requestId) setProcessing(false)
      return
    }

    if (!chatEndpoint) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const messages: ChatMessage[] = [buildDispatchSystemMessage(lang), { role: 'user', content: text }]
      const result = await chatWithProxy({
        endpoint: chatEndpoint,
        messages,
        temperature: 0.0,
        max_tokens: 512,
        signal: ac.signal,
      })

      const assistantText = sanitizeAssistantText(result.text)
      const parsed = parseJsonMaybe(assistantText)
      const spoken =
        parsed && typeof parsed === 'object' && parsed !== null && typeof (parsed as { spoken_text?: unknown }).spoken_text === 'string'
          ? (parsed as { spoken_text: string }).spoken_text
          : extractSpokenTextFromJsonish(assistantText) ?? assistantText

      const call =
        parsed && typeof parsed === 'object' && parsed !== null && (parsed as { call?: unknown }).call === '119'
          ? '119'
          : parsed && typeof parsed === 'object' && parsed !== null && (parsed as { call?: unknown }).call === '110'
            ? '110'
            : null

      const safeSpoken = sanitizeAssistantText(spoken)
      const inferredCall = extractCallFromText(safeSpoken)
      if (dispatchRequestIdRef.current !== requestId) return

      setCallNumber(call ?? inferredCall)
      setAssistantText(safeSpoken)
      if (safeSpoken) {
        setHistory((prev) => [{ user_text: text, assistant_text: safeSpoken, call: (call ?? inferredCall) as '119' | '110' | null }, ...prev].slice(0, 12))
      }
      if (safeSpoken) await speakWithMiniMax(safeSpoken, lang)
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      if (dispatchRequestIdRef.current === requestId) setProcessing(false)
    }
  }

  const prevStatusRef = useRef(stt.status)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = stt.status
    if (prev !== 'listening') return
    if (stt.status === 'listening') return

    const t = (silenceEndTriggeredRef.current ? lastSpokenRef.current : stt.transcript).trim()
    if (!t) return
    silenceEndTriggeredRef.current = false

    const norm = normalizeForCompare(t)
    const normAssistant = normalizeForCompare(lastAssistantRef.current)
    const isLikelyEcho = normAssistant && norm === normAssistant
    const isUiNoise = norm === 'aiguidance' || norm === 'enableaudio' || norm === 'taptotalk' || norm === 'taptostop'
    if (isLikelyEcho || isUiNoise) {
      restartListening()
      return
    }

    void dispatch(t)
  }, [stt.status, stt.transcript])

  function toggleListening() {
    if (!stt.supported) return
    if (stt.status === 'listening') {
      stt.stop()
      return
    }
    void tryPlayPendingAudio()
    setCallNumber(null)
    setAssistantText('')
    setProcessing(false)
    stt.reset()
    stt.start({ lang: sttLang })
  }

  const bg = stt.status === 'listening' ? 'bg-[#111827]' : 'bg-[#0B0F14]'
  const showIdleIndicator = !spokenText && stt.status !== 'listening'
  const showListeningIndicator = stt.status === 'listening'
  const t = uiText(selectedLang)

  return (
    <div
      className={`min-h-dvh ${bg} text-white`}
      role="button"
      tabIndex={0}
      aria-label="Emergency call UI. Tap to start or stop listening."
      onClick={toggleListening}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggleListening()
        }
      }}
    >
      <audio ref={audioRef} className="hidden" />
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))]">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold tracking-tight text-white/90">{t.title}</div>
          {t.titleEn ? <div className="text-xs text-white/60">{t.titleEn}</div> : null}
          <div className="text-xs text-white/60">{stt.error ? t.micPermission : t.prompt}</div>
          {t.promptEn ? <div className="text-[11px] text-white/45">{t.promptEn}</div> : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
            {processing ? t.processing : stt.status === 'listening' ? t.listening : t.tapToTalk}
            <span className="text-white/50">•</span>
            {stt.status === 'listening' ? t.tapToStop : ''}
          </div>

          <label className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
            <span className="text-white/70">{t.language}</span>
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value as DetectedLang)}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent text-xs text-white outline-none"
            >
              <option value="ja">ja</option>
              <option value="en">en</option>
              <option value="zh">zh</option>
            </select>
          </label>
        </div>

        <div className="flex-1 overflow-auto pt-8">
          {history.length ? (
            <div className="mb-6 space-y-3">
              {history.map((h, idx) => (
                <div key={idx} className="rounded-2xl bg-white/5 p-4">
                  <div className="text-xs text-white/60">{h.user_text}</div>
                  <div className="mt-2 whitespace-pre-wrap break-words text-[16px] leading-snug text-white/90">{h.assistant_text}</div>
                  {h.call ? <div className="mt-2 text-xs font-semibold text-white/70">{h.call}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="whitespace-pre-wrap break-words text-[28px] leading-snug tracking-tight">{spokenText}</div>

          {assistantText ? (
            <div className="mt-6 rounded-2xl bg-white/5 p-4">
              <div className="text-xs font-semibold text-white/70">{t.aiSays}</div>
              <div className="mt-2 whitespace-pre-wrap break-words text-[18px] leading-snug text-white/90">{assistantText}</div>
            </div>
          ) : null}
        </div>
        {callNumber ? (
          <a
            href={`tel:${callNumber}`}
            onClick={(e) => e.stopPropagation()}
            className="mb-2 inline-flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-zinc-950"
          >
            <div className="text-4xl font-semibold tracking-tight">{callNumber}</div>
            <div className="text-sm font-semibold">{t.callNow}</div>
          </a>
        ) : null}

        {needsAudioUnlock ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void tryPlayPendingAudio()
            }}
            className="mb-2 flex w-full flex-col items-start gap-1 rounded-2xl bg-white/10 px-5 py-4 text-left"
          >
            <div className="text-sm font-semibold text-white">{t.enableAudio}</div>
            <div className="text-xs text-white/70">{t.enableAudioHint}</div>
          </button>
        ) : null}
      </div>
      {showIdleIndicator ? (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="h-3 w-3 rounded-full bg-white/60" />
        </div>
      ) : null}
      {showListeningIndicator ? (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="h-3 w-3 rounded-full bg-white/80" />
          <div className="absolute h-16 w-16 animate-ping rounded-full bg-white/10" />
        </div>
      ) : null}
      {ttsError ? <span className="hidden">{ttsError}</span> : null}
    </div>
  )
}
