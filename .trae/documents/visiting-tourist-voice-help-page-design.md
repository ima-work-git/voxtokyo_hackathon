# ページデザイン仕様（Desktop-first）

## Global Styles（全ページ共通）
- Layout方針: Desktop-first（基準幅 1200px）。主要コンテンツは `max-width: 1200px; margin: 0 auto;`。
- Responsive: 2段階
  - Desktop: >= 1024px（サイドバー/2カラム可）
  - Mobile: < 1024px（1カラム、テーブルはカード化）
- Spacing: 8pxスケール（8/16/24/32/48）。
- Typography（例）
  - H1: 28px/700
  - H2: 20px/700
  - Body: 14–16px/400
  - Mono: 12–13px（IDやSID表示）
- Color tokens（例）
  - Background: #0B1020（濃紺）
  - Surface: #111A33
  - Text: #E8EEFF
  - Muted: #A9B4D0
  - Primary: #5B8CFF（リンク/主要ボタン）
  - Success: #22C55E（classified等）
  - Warning: #F59E0B（transcribing等）
  - Danger: #EF4444（failed、緊急強調）
- Buttons
  - Primary: 塗り（Primary背景＋白文字）、hoverで明度+5%
  - Secondary: 枠線（Muted境界）、hoverでSurfaceを1段明るく
  - Disabled: 不透明度60%、カーソル禁止
- Links: Primary色＋下線はhover時のみ
- Card: 角丸12px、境界線1px（#223055）、影は控えめ
- Table: Desktopは行ホバー、Mobileはカードリストに変換

---

## 1) ホーム（/）
### Layout
- Desktop: CSS Grid 2カラム（左: 録音、右: 文字起こし結果）
- Mobile: 1カラム（上から順に並ぶ）

### Meta Information
- title: Voice → MiniMax ASR（デモ）
- description: Web録音した音声をMiniMax ASRへ送って文字起こしを表示するデモ。
- og:title / og:description: 上記に準拠

### Page Structure
1. Hero（デモ名＋説明）
2. 録音カード
3. 文字起こしカード
4. フッター（デモ注記）

### Sections & Components
- 録音カード
  - 録音開始/停止/リセット
  - 録音時間（mm:ss）
  - 録音プレビュー（audio player）
- 文字起こしカード
  - 送信ボタン（録音停止後のみ活性）
  - 送信中はSkeleton
  - 結果表示（pre、折り返し）
  - エラー表示（赤系のalert）
  - 未設定ガイド（`VITE_ASR_PROXY_URL`）

## 共有インタラクション指針
- トースト: 主要操作（コピー等）がある場合のみ短く表示。
- Loading: 送信中はSkeleton、録音権限要求中は「requesting」状態を表示。
- Error: 「原因」「次の行動（再試行/戻る）」を必ず表示。
