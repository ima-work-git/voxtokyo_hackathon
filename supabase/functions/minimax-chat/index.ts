const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...(init?.headers ?? {}) },
    status: init?.status ?? 200,
  })
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatRequest = {
  model?: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
}

function isChatRequest(value: unknown): value is ChatRequest {
  if (!value || typeof value !== 'object') return false
  const v = value as { messages?: unknown }
  if (!Array.isArray(v.messages)) return false
  return v.messages.every((m) => {
    if (!m || typeof m !== 'object') return false
    const mm = m as { role?: unknown; content?: unknown }
    if (mm.role !== 'system' && mm.role !== 'user' && mm.role !== 'assistant') return false
    return typeof mm.content === 'string'
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 })

  const apiKey = Deno.env.get('MINIMAX_API_KEY')
  if (!apiKey) return jsonResponse({ error: 'Server misconfigured: MINIMAX_API_KEY missing' }, { status: 500 })

  const minimaxUrl = Deno.env.get('MINIMAX_CHAT_URL')?.trim() || 'https://api.minimax.io/v1/chat/completions'
  const defaultModel = Deno.env.get('MINIMAX_CHAT_MODEL')?.trim() || 'MiniMax-M2.5'

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isChatRequest(body)) {
    return jsonResponse({ error: 'Invalid request. Expected { messages: [{role, content}, ...] }' }, { status: 400 })
  }

  const payload: ChatRequest = {
    model: (body.model?.trim() || defaultModel).slice(0, 128),
    messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.2,
    max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 512,
  }

  const upstreamRes = await fetch(minimaxUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const upstreamContentType = upstreamRes.headers.get('content-type') ?? ''
  const upstreamPayload = upstreamContentType.includes('application/json') ? await upstreamRes.json() : await upstreamRes.text()

  if (!upstreamRes.ok) {
    return jsonResponse(
      {
        error: 'Upstream Chat error',
        status: upstreamRes.status,
        payload: upstreamPayload,
      },
      { status: 502 },
    )
  }

  return jsonResponse(upstreamPayload)
})

