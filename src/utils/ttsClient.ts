export type TtsResponse = {
  audio_url: string | null
  raw?: unknown
}

export async function ttsWithProxy(params: {
  endpoint: string
  text: string
  model?: string
  voice_id?: string
  speed?: number
  vol?: number
  pitch?: number
  language_boost?: string
  signal?: AbortSignal
}): Promise<TtsResponse> {
  const res = await fetch(params.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: params.text,
      model: params.model,
      voice_id: params.voice_id,
      speed: params.speed,
      vol: params.vol,
      pitch: params.pitch,
      language_boost: params.language_boost,
    }),
    signal: params.signal,
  })

  const contentType = res.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await res.json() : await res.text()

  if (!res.ok) {
    const msg = typeof payload === 'string' ? payload : JSON.stringify(payload)
    throw new Error(msg || `TTS failed: ${res.status}`)
  }

  if (typeof payload === 'object' && payload !== null) {
    const audioUrl = (payload as { audio_url?: unknown }).audio_url
    if (typeof audioUrl === 'string' || audioUrl === null) return payload as TtsResponse
  }

  return { audio_url: null, raw: payload }
}

