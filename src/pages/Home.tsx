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
      prompt: '緊急事態の内容を話してください',
      micPermission: 'マイクの許可が必要です。ブラウザの権限を確認してください。',
    }
  }
  if (lang === 'zh') {
    return {
      title: '紧急通报助手',
      prompt: '请说出紧急情况',
      micPermission: '需要麦克风权限，请检查浏览器设置。',
    }
  }
  return {
    title: 'Emergency Call Assistant',
    prompt: 'Please describe your emergency',
    micPermission: 'Microphone permission is required. Please check browser settings.',
  }
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

function emergencyHeuristic(text: string, lang: DetectedLang) {
  const t = text.trim()
  const normalized = t.replace(/[\s\u3000]+/g, '')
  const isGreetingOnly = /^(もしもし|もしもーし|はい|お願いします|助けて|たすけて|help|hello|hi)$/i.test(normalized)

  if (isGreetingOnly) {
    if (lang === 'ja') return 'どうしましたか？'
    if (lang === 'zh') return '发生什么事了？'
    return 'What happened?'
  }

  const hasFire = /火事|火|煙|燃え|焦げ|ガス|爆発|fire|smoke|gas|explosion/i.test(t)
  const hasBloodOrInjury = /血|出血|けが|怪我|意識|倒れ|呼吸|苦しい|胸|痛い|bleed|blood|injury|hurt|unconscious|breath|chest/i.test(t)
  const hasCrime = /犯人|ストーカー|盗難|泥棒|暴力|脅迫|不審者|襲われ|crime|thief|stalker|attack|assault|threat/i.test(t)

  if (hasCrime) {
    if (lang === 'ja') return '警察です。危険の可能性があります。電話番号は110です。いまどこにいますか？'
    if (lang === 'zh') return '这是报警情况。电话号码是110。你现在在哪里？'
    return 'This is a police emergency. The number is 110. Where are you now?'
  }

  if (hasFire) {
    if (lang === 'ja') return '消防です。火災の可能性があります。電話番号は119です。いまどこにいますか？'
    if (lang === 'zh') return '这是消防紧急情况。电话号码是119。你现在在哪里？'
    return 'This is a fire emergency. The number is 119. Where are you now?'
  }

  if (hasBloodOrInjury) {
    const isBleeding = /血|出血|bleed|blood/i.test(t)
    if (lang === 'ja') {
      return isBleeding
        ? '血が止まらないのですね。救急です。病院へ搬送する機関の電話番号はこちらです。119。いまどこにいますか？'
        : '救急です。電話番号は119です。いまどこにいますか？'
    }
    if (lang === 'zh') {
      return isBleeding
        ? '你在流血且止不住。请拨打急救电话119。你现在在哪里？'
        : '这是急救情况。请拨打119。你现在在哪里？'
    }
    return isBleeding
      ? 'You are bleeding and it won’t stop. Call 119 for an ambulance. Where are you now?'
      : 'This is a medical emergency. Call 119. Where are you now?'
  }

  return null
}

function buildDispatchSystemMessage(lang: DetectedLang): ChatMessage {
  if (lang === 'ja') {
    return {
      role: 'system',
      content:
        'あなたは日本の緊急通報（119/110）を受け付ける指令員です。通報者テキストを受け取り、必ず次の形式のSTRICT JSONのみで返してください。<think>や説明文、Markdownは禁止です。\n\n{\n  "spoken_text": "この文章をそのまま読み上げる（日本語、短く）"\n}\n\nルール: (1) 火災/煙/ガス/爆発なら119を明示。(2) けが/出血/意識なし/呼吸困難なら119を明示。(3) 犯罪/暴力/不審者/ストーカーなら110を明示。(4) 状況が不明なら「どうしましたか？」だけ返す。\n禁止: 「緊急ですか？」と聞かない。絵文字を使わない。',
    }
  }
  if (lang === 'zh') {
    return {
      role: 'system',
      content:
        '你是日本的紧急报警接线员（119/110）。只返回STRICT JSON（禁止<think>、解释、Markdown）。\n\n{\n  "spoken_text": "要直接朗读的短句（中文）"\n}\n\n规则: (1) 火灾/烟/煤气/爆炸→明确119。(2) 受伤/出血/昏迷/呼吸困难→明确119。(3) 犯罪/暴力/可疑人物/跟踪→明确110。(4) 情况不明→只问“发生什么事了？”。\n禁止: 不要问“是否紧急？”，不要用表情符号。',
    }
  }
  return {
    role: 'system',
    content:
      'You are a Japanese emergency dispatcher (119/110). Return STRICT JSON only (no <think>, no explanations, no markdown).\n\n{\n  "spoken_text": "A short sentence to read aloud in English"\n}\n\nRules: (1) Fire/smoke/gas/explosion -> clearly tell 119. (2) Injury/bleeding/unconscious/breathing issues -> clearly tell 119. (3) Crime/violence/suspicious person/stalker -> clearly tell 110. (4) If unclear, only ask: "What happened?"\nForbidden: Do not ask "Is it an emergency?" Do not use emojis.',
  }
}

export default function Home() {
  const stt = useSpeechRecognition()
  const autoStartedRef = useRef(false)

  const preferredLang = useMemo<DetectedLang>(() => {
    if (typeof navigator === 'undefined') return 'en'
    const l = (navigator.language || '').toLowerCase()
    if (l.startsWith('ja')) return 'ja'
    if (l.startsWith('zh')) return 'zh'
    return 'en'
  }, [])

  const abortRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsObjectUrlRef = useRef<string | null>(null)
  const ttsAbortRef = useRef<AbortController | null>(null)
  const ttsRequestIdRef = useRef(0)
  const [ttsError, setTtsError] = useState<string | null>(null)

  const chatEndpoint = (import.meta.env.VITE_CHAT_PROXY_URL as string | undefined)?.trim() ?? ''
  const ttsEndpoint = (import.meta.env.VITE_TTS_PROXY_URL as string | undefined)?.trim() ?? ''
  const ttsVoiceId = 'English_expressive_narrator'

  const spokenText = useMemo(() => {
    const interim = stt.interimTranscript.trim()
    const final = stt.transcript.trim()
    return interim || final
  }, [stt.interimTranscript, stt.transcript])

  const detectedLang = useMemo(() => detectLanguageFromText(spokenText), [spokenText])
  const sttLang = useMemo(() => {
    if (!spokenText) return toBcp47(preferredLang)
    return toBcp47(detectedLang)
  }, [detectedLang, preferredLang, spokenText])

  useEffect(() => {
    if (autoStartedRef.current) return
    if (!stt.supported) return
    autoStartedRef.current = true
    stt.start({ lang: toBcp47(preferredLang) })
  }, [preferredLang, stt.start, stt.supported])

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

  async function dispatch(text: string) {
    const lang = detectLanguageFromText(text)

    const heuristic = emergencyHeuristic(text, lang)
    if (heuristic) {
      await speakWithMiniMax(heuristic, lang)
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
        max_tokens: 256,
        signal: ac.signal,
      })

      const assistantText = sanitizeAssistantText(result.text)
      const parsed = parseJsonMaybe(assistantText)
      const spoken =
        parsed && typeof parsed === 'object' && parsed !== null && typeof (parsed as { spoken_text?: unknown }).spoken_text === 'string'
          ? (parsed as { spoken_text: string }).spoken_text
          : assistantText

      const safeSpoken = sanitizeAssistantText(spoken)
      if (safeSpoken) await speakWithMiniMax(safeSpoken, lang)
    } finally {
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  const prevStatusRef = useRef(stt.status)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = stt.status
    if (prev !== 'listening') return
    if (stt.status === 'listening') return

    const t = stt.transcript.trim()
    if (!t) return
    void dispatch(t)
  }, [stt.status, stt.transcript])

  function toggleListening() {
    if (!stt.supported) return
    if (stt.status === 'listening') {
      stt.stop()
      return
    }
    stt.reset()
    stt.start({ lang: sttLang })
  }

  const bg = stt.status === 'listening' ? 'bg-[#111827]' : 'bg-[#0B0F14]'
  const showIdleIndicator = !spokenText && stt.status !== 'listening'
  const showListeningIndicator = stt.status === 'listening'
  const t = uiText(preferredLang)

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
          <div className="text-xs text-white/60">{stt.error ? t.micPermission : t.prompt}</div>
        </div>
        <div className="flex-1 overflow-auto pt-8">
          <div className="whitespace-pre-wrap break-words text-[28px] leading-snug tracking-tight">{spokenText}</div>
        </div>
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
