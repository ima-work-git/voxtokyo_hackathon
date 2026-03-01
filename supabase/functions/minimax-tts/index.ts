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

type TtsRequest = {
  text: string
  model?: string
  voice_id?: string
  speed?: number
  vol?: number
  pitch?: number
  language_boost?: string
}

function isHexString(s: string) {
  if (!s) return false
  if (s.length < 32) return false
  return /^[0-9a-fA-F]+$/.test(s)
}

function isTtsRequest(value: unknown): value is TtsRequest {
  if (!value || typeof value !== 'object') return false
  const v = value as { text?: unknown }
  return typeof v.text === 'string'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 })

  const apiKey = Deno.env.get('MINIMAX_API_KEY')
  if (!apiKey) return jsonResponse({ error: 'Server misconfigured: MINIMAX_API_KEY missing' }, { status: 500 })

  const minimaxUrl = Deno.env.get('MINIMAX_TTS_URL')?.trim() || 'https://api.minimax.io/v1/t2a_v2'
  const defaultModel = Deno.env.get('MINIMAX_TTS_MODEL')?.trim() || 'speech-2.8-turbo'
  const defaultVoice = Deno.env.get('MINIMAX_TTS_VOICE_ID')?.trim() || 'English_expressive_narrator'

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isTtsRequest(body)) {
    return jsonResponse({ error: 'Invalid request. Expected { text: string }' }, { status: 400 })
  }

  const text = body.text.trim()
  if (!text) return jsonResponse({ error: 'Text is empty' }, { status: 400 })
  if (text.length > 10_000) return jsonResponse({ error: 'Text too long (max 10,000 chars)' }, { status: 413 })

  const model = (body.model?.trim() || defaultModel).slice(0, 64)
  const voiceId = (body.voice_id?.trim() || defaultVoice).slice(0, 128)

  const speed = typeof body.speed === 'number' ? body.speed : 1
  const vol = typeof body.vol === 'number' ? body.vol : 1
  const pitch = typeof body.pitch === 'number' ? body.pitch : 0

  const languageBoost = body.language_boost?.trim()

  const upstreamPayload = {
    model,
    text,
    stream: false,
    output_format: 'url',
    language_boost: languageBoost || 'auto',
    voice_setting: {
      voice_id: voiceId,
      speed,
      vol,
      pitch,
    },
    audio_setting: {
      format: 'mp3',
      channel: 1,
      sample_rate: 32000,
      bitrate: 128000,
    },
  }

  const upstreamRes = await fetch(minimaxUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(upstreamPayload),
  })

  const upstreamContentType = upstreamRes.headers.get('content-type') ?? ''
  const payload = upstreamContentType.includes('application/json') ? await upstreamRes.json() : await upstreamRes.text()

  if (!upstreamRes.ok) {
    return jsonResponse(
      {
        error: 'Upstream TTS error',
        status: upstreamRes.status,
        payload,
      },
      { status: 502 },
    )
  }

  if (typeof payload === 'object' && payload !== null) {
    const baseResp = (payload as { base_resp?: unknown }).base_resp as { status_code?: unknown; status_msg?: unknown } | undefined
    if (baseResp && typeof baseResp.status_code === 'number' && baseResp.status_code !== 0) {
      return jsonResponse(
        {
          error: 'Upstream TTS error',
          status: 502,
          base_resp: baseResp,
          payload,
        },
        { status: 502 },
      )
    }
  }

  if (typeof payload === 'object' && payload !== null) {
    const data = (payload as { data?: unknown }).data as { audio?: unknown; audio_url?: unknown; url?: unknown } | undefined

    const candidates: Array<unknown> = [data?.audio_url, data?.url, data?.audio, (payload as { audio_url?: unknown }).audio_url]
    for (const c of candidates) {
      if (typeof c !== 'string') continue
      if (c.startsWith('http://') || c.startsWith('https://')) return jsonResponse({ audio_url: c, raw: payload })
      if (isHexString(c)) return jsonResponse({ audio_hex: c, raw: payload })
    }
  }

  return jsonResponse({ audio_url: null, audio_hex: null, raw: payload })
})
