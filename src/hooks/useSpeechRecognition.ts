import { useCallback, useMemo, useRef, useState } from 'react'

type SpeechStatus = 'idle' | 'listening' | 'stopped' | 'error'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}

type SpeechRecognitionResultListLike = {
  length: number
  item: (index: number) => SpeechRecognitionResultLike
  [index: number]: SpeechRecognitionResultLike
}

type SpeechRecognitionResultLike = {
  isFinal: boolean
  length: number
  item: (index: number) => SpeechRecognitionAlternativeLike
  [index: number]: SpeechRecognitionAlternativeLike
}

type SpeechRecognitionAlternativeLike = {
  transcript: string
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useSpeechRecognition() {
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const stoppedByUserRef = useRef(false)

  const supported = useMemo(() => {
    return typeof window !== 'undefined' && !!getSpeechRecognitionConstructor()
  }, [])

  const reset = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    stoppedByUserRef.current = false
    setStatus('idle')
    setError(null)
    setTranscript('')
    setInterimTranscript('')
  }, [])

  const stop = useCallback(() => {
    stoppedByUserRef.current = true
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(
    (opts?: { lang?: string }) => {
      if (!supported) {
        setStatus('error')
        setError('このブラウザは音声認識に対応していません。Chrome系を推奨します。')
        return
      }

      if (status === 'listening') return

      const Ctor = getSpeechRecognitionConstructor()
      if (!Ctor) {
        setStatus('error')
        setError('音声認識の初期化に失敗しました。')
        return
      }

      stoppedByUserRef.current = false
      setError(null)
      setTranscript('')
      setInterimTranscript('')
      setStatus('listening')

      const recognition = new Ctor()
      recognitionRef.current = recognition
      recognition.lang = opts?.lang ?? 'en-US'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onresult = (event) => {
        let finalText = ''
        let interimText = ''

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results.item(i)
          const alt = res.item(0)
          const t = alt.transcript
          if (res.isFinal) finalText += t
          else interimText += t
        }

        if (finalText) setTranscript((prev) => (prev ? `${prev} ${finalText}` : finalText).trim())
        setInterimTranscript(interimText.trim())
      }

      recognition.onerror = (e) => {
        setStatus('error')
        setError(e?.error ? `音声認識エラー: ${e.error}` : '音声認識でエラーが発生しました。')
      }

      recognition.onend = () => {
        recognitionRef.current = null
        setInterimTranscript('')
        setStatus((s) => {
          if (s === 'error') return s
          if (stoppedByUserRef.current) return 'stopped'
          return 'stopped'
        })
      }

      try {
        recognition.start()
      } catch {
        setStatus('error')
        setError('音声認識を開始できませんでした。ブラウザ権限を確認してください。')
      }
    },
    [status, supported],
  )

  return {
    supported,
    status,
    error,
    transcript,
    interimTranscript,
    start,
    stop,
    reset,
  }
}
