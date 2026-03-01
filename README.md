# Voice Intake Demo (ASR + Chat)

Webサイトで音声入力（録音/音声認識）し、必要に応じてサーバー側プロキシ（Supabase Edge Function）経由でMiniMaxを呼び出すデモです。

## 前提
- MiniMax APIキーはクライアントに置きません（Supabase Edge Functionの環境変数で管理）。
- GitHub Pagesは静的ホストのため、MiniMaxの呼び出し（ASR/Chat）は基本サーバー側プロキシを使います。
- GitHub Pagesだけで完結させたい場合は「ローカル音声認識（ブラウザ機能）」モードを使います。

## ローカル起動
```bash
npm install
```

`.env.local` を作り、以下を設定してください（これは公開情報：プロキシURLのみ）。
```
VITE_ASR_PROXY_URL=https://<your-project>.functions.supabase.co/minimax-asr
VITE_CHAT_PROXY_URL=https://<your-project>.functions.supabase.co/minimax-chat
```

起動:
```bash
npm run dev
```

## Supabase Edge Function（プロキシ）
コード:
- ASR: `supabase/functions/minimax-asr/index.ts`
- Chat: `supabase/functions/minimax-chat/index.ts`
- TTS: `supabase/functions/minimax-tts/index.ts`

設定する環境変数（Supabase側）
- `MINIMAX_API_KEY`: MiniMax APIキー（秘密）
- `MINIMAX_ASR_URL`: MiniMaxのSTT/ASRエンドポイントURL（必須）
- `MINIMAX_ASR_MODEL`: 省略可。デフォルト `minimax/speech-2.6-turbo`

Supabase CLIでの例（手元の環境に合わせて実行）:
```bash
supabase functions deploy minimax-asr --no-verify-jwt
supabase functions deploy minimax-chat --no-verify-jwt
supabase functions deploy minimax-tts --no-verify-jwt
supabase secrets set MINIMAX_API_KEY=... MINIMAX_ASR_URL=https://api.minimax.io/v1/audio/transcriptions MINIMAX_ASR_MODEL=minimax/speech-2.6-turbo
```

## GitHub Pages デプロイ
- `vite.config.ts` は production 時に `base: /voxtokyo_hackathon/` を設定済み。
- GitHub ActionsでビルドしてPagesへデプロイします。

GitHubのRepository Secretsに以下を追加してください:
- `VITE_ASR_PROXY_URL`: `https://<your-project>.functions.supabase.co/minimax-asr`
- `VITE_CHAT_PROXY_URL`: `https://<your-project>.functions.supabase.co/minimax-chat`
- `VITE_TTS_PROXY_URL`: `https://<your-project>.functions.supabase.co/minimax-tts`
