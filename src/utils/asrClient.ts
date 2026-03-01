export type AsrResponse = {
  text: string
  raw?: unknown
}

export async function transcribeWithProxy(params: {
  endpoint: string
  audio: Blob
  filename: string
  language?: string
  model?: string
  signal?: AbortSignal
}): Promise<AsrResponse> {
  const form = new FormData()
  form.append('file', params.audio, params.filename)
  if (params.language) form.append('language', params.language)
  if (params.model) form.append('model', params.model)

  const res = await fetch(params.endpoint, {
    method: 'POST',
    body: form,
    signal: params.signal,
  })

  const contentType = res.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await res.json() : await res.text()

  if (!res.ok) {
    const msg = typeof payload === 'string' ? payload : JSON.stringify(payload)
    throw new Error(msg || `ASR failed: ${res.status}`)
  }

  if (typeof payload === 'string') {
    return { text: payload }
  }

  if (typeof payload === 'object' && payload !== null) {
    const maybeText = (payload as { text?: unknown }).text
    if (typeof maybeText === 'string') return { text: maybeText, raw: payload }

    const maybeTranscript = (payload as { transcript?: unknown }).transcript
    if (typeof maybeTranscript === 'string') return { text: maybeTranscript, raw: payload }
  }
  return { text: JSON.stringify(payload), raw: payload }
}
