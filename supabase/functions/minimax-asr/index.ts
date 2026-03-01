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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 })

  const apiKey = Deno.env.get('MINIMAX_API_KEY')
  if (!apiKey) return jsonResponse({ error: 'Server misconfigured: MINIMAX_API_KEY missing' }, { status: 500 })

  const minimaxUrl = Deno.env.get('MINIMAX_ASR_URL')?.trim() || 'https://api.minimax.io/v1/audio/transcriptions'
  const defaultModel = Deno.env.get('MINIMAX_ASR_MODEL')?.trim() || 'minimax/speech-2.6-turbo'

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonResponse({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = (form.get('file') ?? form.get('audio')) as File | null
  if (!file) return jsonResponse({ error: 'Missing file (field: file)' }, { status: 400 })
  if (file.size === 0) return jsonResponse({ error: 'Empty file' }, { status: 400 })
  if (file.size > 15 * 1024 * 1024) return jsonResponse({ error: 'File too large (max 15MB)' }, { status: 413 })

  const model = (form.get('model')?.toString().trim() || defaultModel).slice(0, 128)
  const language = form.get('language')?.toString().trim()

  const upstreamForm = new FormData()
  upstreamForm.append('file', file, file.name || 'audio.webm')
  upstreamForm.append('model', model)
  if (language) upstreamForm.append('language', language)
  upstreamForm.append('response_format', 'json')

  const upstreamRes = await fetch(minimaxUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: upstreamForm,
  })

  const upstreamContentType = upstreamRes.headers.get('content-type') ?? ''
  const upstreamPayload = upstreamContentType.includes('application/json') ? await upstreamRes.json() : await upstreamRes.text()

  if (!upstreamRes.ok) {
    return jsonResponse(
      {
        error: 'Upstream ASR error',
        status: upstreamRes.status,
        payload: upstreamPayload,
      },
      { status: 502 },
    )
  }

  if (typeof upstreamPayload === 'string') return jsonResponse({ text: upstreamPayload })

  if (typeof upstreamPayload === 'object' && upstreamPayload !== null) {
    const maybeText = (upstreamPayload as { text?: unknown }).text
    if (typeof maybeText === 'string') return jsonResponse({ text: maybeText, raw: upstreamPayload })
  }

  return jsonResponse({ text: JSON.stringify(upstreamPayload), raw: upstreamPayload })
})
