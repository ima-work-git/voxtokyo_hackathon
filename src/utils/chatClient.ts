export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatResponse = {
  text: string
  raw?: unknown
}

export async function chatWithProxy(params: {
  endpoint: string
  messages: ChatMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  signal?: AbortSignal
}): Promise<ChatResponse> {
  const res = await fetch(params.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
    }),
    signal: params.signal,
  })

  const contentType = res.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await res.json() : await res.text()

  if (!res.ok) {
    const msg = typeof payload === 'string' ? payload : JSON.stringify(payload)
    throw new Error(msg || `Chat failed: ${res.status}`)
  }

  if (typeof payload === 'string') return { text: payload }

  if (typeof payload === 'object' && payload !== null) {
    const choices = (payload as { choices?: unknown }).choices
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as { message?: unknown; text?: unknown }
      if (typeof first.text === 'string') return { text: first.text, raw: payload }

      const msg = first.message as { content?: unknown } | undefined
      if (msg && typeof msg.content === 'string') return { text: msg.content, raw: payload }
    }

    const maybeContent = (payload as { content?: unknown }).content
    if (typeof maybeContent === 'string') return { text: maybeContent, raw: payload }
  }

  return { text: JSON.stringify(payload), raw: payload }
}

