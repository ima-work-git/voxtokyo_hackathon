import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error'

function pickSupportedMimeType(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]

  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return undefined
}

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const intervalRef = useRef<number | null>(null)

  const supported = useMemo(() => {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  }, [])

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
    }
  }, [])

  const cleanupTimer = useCallback(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    cleanupTimer()
    cleanupStream()
    chunksRef.current = []
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setSeconds(0)
    setError(null)
    setStatus('idle')
  }, [audioUrl, cleanupStream, cleanupTimer])

  const start = useCallback(async () => {
    if (!supported) {
      setStatus('error')
      setError('このブラウザは録音に対応していません（MediaRecorder未対応）。')
      return
    }

    setError(null)
    setStatus('requesting')
    setSeconds(0)
    setAudioBlob(null)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mt = pickSupportedMimeType()
      setMimeType(mt ?? null)

      const mr = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined)
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onerror = () => {
        setStatus('error')
        setError('録音中にエラーが発生しました。')
      }

      mr.onstop = () => {
        cleanupTimer()
        cleanupStream()
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setAudioBlob(blob)
        setAudioUrl(url)
        setStatus('stopped')
      }

      mr.start()
      setStatus('recording')

      intervalRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1)
      }, 1000)
    } catch {
      setStatus('error')
      setError('マイクの権限が必要です。ブラウザ設定を確認してください。')
      cleanupTimer()
      cleanupStream()
    }
  }, [audioUrl, cleanupStream, cleanupTimer, supported])

  const stop = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    if (mr.state === 'recording') mr.stop()
  }, [])

  useEffect(() => {
    return () => {
      cleanupTimer()
      cleanupStream()
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl, cleanupStream, cleanupTimer])

  return {
    supported,
    status,
    error,
    seconds,
    audioBlob,
    audioUrl,
    mimeType,
    start,
    stop,
    reset,
  }
}

