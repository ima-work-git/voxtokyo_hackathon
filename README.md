# Voice → MiniMax ASR Demo

Webサイトで録音した音声を、サーバー側プロキシ（Supabase Edge Function）経由でMiniMax ASRへ送信し、文字起こし結果を表示するデモです。

## 前提
- MiniMax APIキーはクライアントに置きません（Supabase Edge Functionの環境変数で管理）。
- GitHub Pagesは静的ホストのため、ASR呼び出しは必ずサーバー側プロキシを使います。

## ローカル起動
```bash
npm install
```

`.env.local` を作り、以下を設定してください（これは公開情報：プロキシURLのみ）。
```
VITE_ASR_PROXY_URL=https://<your-project>.functions.supabase.co/minimax-asr
```

起動:
```bash
npm run dev
```

## Supabase Edge Function（プロキシ）
コードは `supabase/functions/minimax-asr/index.ts` です。

設定する環境変数（Supabase側）
- `MINIMAX_API_KEY`: MiniMax APIキー（秘密）
- `MINIMAX_ASR_URL`: 省略可。デフォルト `https://api.minimax.io/v1/audio/transcriptions`
- `MINIMAX_ASR_MODEL`: 省略可。デフォルト `minimax/speech-2.6-turbo`

Supabase CLIでの例（手元の環境に合わせて実行）:
```bash
supabase functions deploy minimax-asr --no-verify-jwt
supabase secrets set MINIMAX_API_KEY=... MINIMAX_ASR_URL=https://api.minimax.io/v1/audio/transcriptions MINIMAX_ASR_MODEL=minimax/speech-2.6-turbo
```

## GitHub Pages デプロイ
- `vite.config.ts` は production 時に `base: /voxtokyo_hackathon/` を設定済み。
- GitHub ActionsでビルドしてPagesへデプロイします。

GitHubのRepository Secretsに以下を追加してください:
- `VITE_ASR_PROXY_URL`: `https://<your-project>.functions.supabase.co/minimax-asr`
