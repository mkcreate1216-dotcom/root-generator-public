# たびろーむ (TabiRome)

> 「道草を楽しむ、気ままな旅へ。」  
> スポットや宿泊地をタイムラインに追加するだけで、旅程の作成からルート確認・LINE共有まで完結する旅程作成アプリ。

---

## 概要

「たびろーむ」は、旅行の計画・整理から当日の移動経路確認、道草や寄り道、同行者への共有までをシンプルに行える旅程作成アプリです。  
**Astro** と **Tailwind CSS**、**TypeScript** によるモダンな静的サイトアーキテクチャを採用しており、高速・軽量な動作と保守性を両立しています。データはブラウザのLocalStorageを活用して手軽に永続化されます。

---

## 特徴

- **直感的なタイムライン設計**
  - スポット、出発・到着地点、宿泊地の3種類の地点を登録可能。
  - 宿泊地を登録すると、翌日の出発地点へ自動反映（反映範囲は「以降すべて」「当日のみ」から選択可能）。
  - ドラッグ＆ドロップによる直感的な並び替え（FLIPアニメーション対応）および上下ボタンでの移動。
  - スポット名のインライン編集対応。

- **地図アプリ連携（ルート案内）**
  - ヘッダー右上のマップ選択UI（マップアイコン付き）から、Google MapsとApple Mapsをワンクリック切り替え可能。
  - 区間の「ルート」ボタンを押すだけで、選択中のマップで直接ルート案内を開くワンクリック起動。
  - 1日の見出しをクリックして、選択中のマップで全地点を経由地に含めたまとめルートを一括表示。

- **複数日程（Day）の管理**
  - 画面端のフローティングタブから各日程へスムーズスクロール。
  - 閲覧中の日程に応じたタブのアクティブ追従。
  - 誤操作を防ぐ日程削除のアンドゥ（元に戻す、Ctrl+Z / ⌘+Z ショートカット対応）。

- **複数旅行の保存と切り替え**
  - ブラウザのLocalStorageに最大3つの旅行プランを保存。
  - コンボボックスから素早く新規作成・切り替え・削除が可能。

- **LINE共有テキスト生成**
  - 旅行名、各日の旅程、選択中マップ（Google Maps または Apple Maps）のルートURLを整形したテキストとしてワンクリックでクリップボードへコピー。

- **レスポンシブデザイン**
  - スマートフォンおよびデスクトップの両方で快適に操作できるミニマルなモノトーンUI。

---

## 技術スタック

| 分類 | 技術 / ツール | 役割 |
| :--- | :--- | :--- |
| フレームワーク | [Astro](https://astro.build/) (v4) | 高速な静的サイト生成 (SSG) & アイランドアーキテクチャ |
| スタイリング | [Tailwind CSS](https://tailwindcss.com/) (v3) | モノトーン基調のユーティリティファーストUIデザイン |
| 言語 | TypeScript | 型安全なアプリケーションロジック |
| アイコン | [Lucide Icons](https://lucide.dev/) | 軽量ベクターアイコン |
| データ永続化 | LocalStorage API | ブラウザ内でのデータ保持 |
| 地図連携 | Google Maps / Apple Maps URL Scheme | 経路案内・経由地指定ルート生成 |
| デプロイ基盤 | [Cloudflare Pages](https://pages.cloudflare.com/) / GitHub Actions | 超高速なエッジネットワーク配信 |

---

## ディレクトリ構成

```text
root-generator-public/
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions (ビルド & Cloudflare Pagesデプロイ)
├── public/
│   └── favicon.svg               # アプリケーションファビコン
├── src/
│   ├── components/               # Astro UIコンポーネント
│   │   ├── Header.astro          # ヘッダー・地図セレクター
│   │   ├── SpotAddForm.astro     # スポット追加・旅行名コンボボックス
│   │   ├── DayTabs.astro         # 右側フローティング日程タブ
│   │   └── Tooltip.astro         # グローバルツールチップ
│   ├── layouts/
│   │   └── Layout.astro          # 共通HTMLレイアウト・メタデータ
│   ├── pages/
│   │   └── index.astro           # メインページ
│   ├── scripts/                  # TypeScript アプリケーションロジック
│   │   ├── types.ts              # 型定義 (Trip, Day, MapType 等)
│   │   ├── storage.ts            # LocalStorage 永続化・旅行データ管理
│   │   ├── maps.ts               # Google / Apple Maps ルートURL生成
│   │   ├── share.ts              # LINE共有テキスト生成・トースト通知
│   │   ├── flip.ts               # FLIP並び替えアニメーション
│   │   └── app.ts                # メインコントローラー・イベント制御
│   └── styles/
│       └── global.css            # グローバルCSS & カスタムユーティリティ
├── astro.config.mjs              # Astro 設定ファイル
├── tailwind.config.mjs           # Tailwind CSS 設定ファイル
├── tsconfig.json                 # TypeScript 設定ファイル
├── wrangler.toml                 # Cloudflare Pages 設定ファイル
└── package.json
```

---

## ローカルでの開発・実行方法

### 動作要件
- Node.js 18.20+ または 20+ (Node.js 20 LTS 推奨)
- npm 10+

### 1. 依存パッケージのインストール
```bash
npm install
```

### 2. 開発サーバーの起動
```bash
npm run dev
# アクセスURL: http://localhost:4321
```

### 3. プロダクションビルド
```bash
npm run build
```

ビルド成果物は `dist/` ディレクトリに出力されます。

### 4. ビルド成果物のローカルプレビュー
```bash
npm run preview
```

---

## Cloudflare Pages へのデプロイ方法

以下のいずれかの方法でデプロイできます。

### 方法 1: Cloudflare ダッシュボードから直接連携（推奨）

最も簡単で設定不要な方法です。

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログイン
2. **Workers & Pages** > **Create application** > **Pages** > **Connect to Git** を選択
3. GitHub アカウントを認証し、`root-generator-public` リポジトリを選択
4. ビルド設定を入力：
   - **Framework preset**: `Astro`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables** (環境変数):
     - 変数名: `NODE_VERSION`
     - 値: `20`
5. **Save and Deploy** をクリック

以降は `main` ブランチにプッシュするだけで、Cloudflare 側で自動ビルドと全世界エッジへの即時デプロイが行われます。

### 方法 2: GitHub Actions による自動デプロイ

リポジトリ内の `.github/workflows/deploy.yml` により、GitHub Actions 経由でデプロイすることも可能です。

1. Cloudflare ダッシュボードの **My Profile** > **API Tokens** で「Cloudflare Pages 編集権限」を持つ API トークンを発行
2. GitHub リポジトリの **Settings** > **Secrets and variables** > **Actions** に以下を登録：
   - `CLOUDFLARE_API_TOKEN`: 発行したAPIトークン
   - `CLOUDFLARE_ACCOUNT_ID`: CloudflareのアカウントID
3. `main` ブランチにプッシュすると、GitHub Actions がビルド成果物を Cloudflare Pages に自動デプロイします。

---

## 広告・プロモーション枠の管理

たびろーむでは、宿泊やレンタカー予約などのアフィリエイトプロモーション枠を設定ファイル（[`src/config/ads.ts`](src/config/ads.ts)）で一元管理しています。

- **管理・プレビューツール**: `http://localhost:4321/admin/ads`
  - A8.net等のバナーHTMLタグを貼り付けるだけで、画像URLやリンク先、サイズを自動解析。
  - 実機と同じカルーセルアニメーション付きライブプレビューで表示確認。
  - 変更結果を反映した設定コード（TypeScript）をワンクリックで生成・コピー可能。
- **詳しい使い方マニュアル**: [広告管理・設定変更マニュアル (`docs/ads-management.md`)](docs/ads-management.md)

---

## ライセンス

Personal / Open Source Project
