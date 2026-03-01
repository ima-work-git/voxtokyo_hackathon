# 画面デザイン仕様（スマホ向け・spoken_textのみ表示）

## 共通方針
- 画面上に表示する文字情報は **spoken_text のみ**（ステータス文言、ボタンラベル、説明文、エラーテキスト等は表示しない）。
- 多言語対応は「入力言語（ASR検出または推定）」に追従し、**表示（spoken_text）と応答（生成/読み上げ）を同一言語**に揃える。
- スマホを主対象（モバイルファースト）。タブレット/デスクトップでも表示は成立するが、情報量は増やさない。

## Global Styles
- Layout 基本: 1カラム、フルスクリーン。
- 背景色: #0B0F14（ダーク）を基本。状態表現が必要な場合は背景トーンのみで表現（例: 受付中=やや明るい、処理中=やや暗い等）。※文字は増やさない。
- Typography:
  - spoken_text: 24–32px（モバイル基準）、行間 1.3、最大 6行程度でスクロール。
  - フォント: system-ui（iOS: San Francisco / Android: Roboto）。
- Color:
  - spoken_text: #FFFFFF（高コントラスト）。
  - アクセント: 状態に応じた背景色変化のみ（文字/アイコンは追加しない）。
- Interaction:
  - 画面全体をタップ領域として扱う実装は可（ただし視覚要素としてのボタンは置かない）。
  - アニメーション: 150–250ms のフェード/背景色トランジションのみ。

## Page: 緊急通報画面

### 1) Layout
- レイアウト方式: Flexbox（縦方向）。
- 余白: safe-area を考慮し、上下 16–24px のパディング。
- 文字ブロックは中央寄せ（縦は上寄せ〜中央の中間を推奨）。
- 長文時は spoken_text ブロックのみ内部スクロール。

### 2) Meta Information
- Title: 緊急通報
- Description: 音声入力の文字起こし（spoken_text）のみを表示し、入力言語に合わせて応答言語を自動切替する緊急通報UI。
- Open Graph:
  - og:title: 緊急通報
  - og:description: spoken_textのみ表示・多言語自動切替

### 3) Page Structure
- フルスクリーン単一ビュー（ヘッダー/フッター/ナビゲーション無し）。
- 表示要素は spoken_text のテキストブロックのみ。

### 4) Sections & Components
#### A. Spoken Text Display（唯一の表示コンポーネント）
- 表示内容: spoken_text（音声認識の結果文字列）。
- 表示ルール:
  - 入力言語に応じてそのまま表示（翻訳表示はしない。表示内容は spoken_text のみに限定）。
  - 空の場合は空表示（プレースホルダ文言は出さない）。
  - 更新時は軽いフェードで置換（視認性向上、文字は増やさない）。
- タイポグラフィ:
  - 1行あたり 18–24文字程度の可読幅になるよう max-width を設定（モバイルでは 100% - padding）。

### 5) Responsive behavior
- Mobile（〜480px）: spoken_text 24–32px。
- Tablet（481–1024px）: spoken_text 32–40px、最大幅を 720px 程度に制限。
- Desktop（1025px〜）: spoken_text 40–48px、最大幅 800–960px。中央配置のまま。

### 6) Interaction States（表示要素追加なし）
- Idle: 背景色は基本色、spoken_text があれば表示。
- Listening: 背景色をわずかに変化（例: 明度+5%）。
- Processing: 背景色をわずかに変化（例: 明度-5%）。
- いずれも追加テキスト/アイコンは表示しない。

### 7) Multilingual behavior
- ASR結果に言語情報が含まれる場合: detected_language を採用。
- 含まれない場合: spoken_text から言語推定して language を決定。
- 決定した language を、応答生成（Chat）と読み上げ（TTS）に必ず渡す。
- spoken_text の表示は常に入力言語のまま（画面上の追加翻訳はしない）。
