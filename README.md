# Scenario Flow Builder

**AI電話**（Brekeke ベース）システムのフローを [n8n](https://n8n.io) 風のノードグラフで可視化し、YAML ファイルを読み書きする Web アプリです。**IR**（中間表現 / Intermediate Representation）が唯一の source of truth で、YAML は IR を包む import/export アダプタにすぎません。

> 本アプリは **バックエンドのない静的サイト（GitHub Pages）** です。Google ログインは `drjoy.jp` ドメインに制限（UX ゲート＋クライアント側でのクレーム検証）。`.bivr` 生成・データベース・サーバー保存は未対応です。
> **AI によるスクリプト／プロンプトの生成・修正**（OpenAI）機能を搭載し、**プロキシ**（Vercel Function）経由で呼び出すことでキーをサーバー側に保持し、クライアントに露出させません（[`proxy-vercel/`](proxy-vercel/) 参照）。

![node types](https://img.shields.io/badge/nodes-11%20types-blue) ![i18n](https://img.shields.io/badge/i18n-VI%20%2F%20JA-orange) ![theme](https://img.shields.io/badge/theme-light%20%2F%20dark-lightgrey)

🌐 **言語 / Ngôn ngữ:** **日本語**（このセクション） ｜ [Tiếng Việt](#tiếng-việt)（下部）

---

## 機能

- 📥 YAML フロー読み込み → **IR** → **オートレイアウト**（トップダウン、自作のツリーアルゴリズム）→ React Flow キャンバス。
- 🖱️ ノードのドラッグ＆ドロップ、複数選択（範囲ドラッグ）、ズーム／パン、ミニマップ、fit-view。
- 🔌 エッジの接続（output → input へドラッグ）、ホバー時に表示される 🗑 アイコンで**エッジ削除**。
- ➕ パレットから**ノード追加**、✏️ **ノードをダブルクリック**で `label`・説明・パラメータ（`data`）を種類別に編集するパネルを表示（**General / Property / Branch** タブに分割）。
- 🌿 同一ファイル内の **Sub Flow**：**Jump** ノードが名前でサブフローを参照し、処理後にメインフローへ戻る。
- 🤖 **AI 生成・修正**（OpenAI）：**Logic** ノード（JavaScript スクリプト）と **OpenAI** ノード（プロンプト）内の *AIで生成・修正* ボタン。**スクリプトの自動説明**付き（ファイルに保存され、再オープン時に再生成不要）。
- ⚙️ **IVR Property**：IR と設定フォームから IVR 構成（施設名・Office ID・Demo/Master 環境・TTS/STT エンジン）を生成する読み取り専用パネル。フロー内の announce 文と連動。
- 📤 **YAML エクスポート**（IR ↔ YAML のラウンドトリップ）と 💾 GitHub API 経由の**リポジトリへ直接保存**。
- 🔐 Google ログイン、`@drjoy.jp` アカウントのみ許可 — クレーム検証＋nonce を厳格に実施（[セキュリティ](#-セキュリティ)参照）。
- 📁 リポジトリ上の **YAML ファイル管理**：GitHub Contents API 経由で `flows/` の開く／アップロード／作成／削除／保存。
- 🌐 **多言語** UI：Tiếng Việt / 日本語。🎨 **ライト／ダークテーマ**。
- 🚀 GitHub Actions による GitHub Pages デプロイ。

### 11 種類のノード

| Type | ラベル | 役割 |
|------|--------|------|
| `start` | Start | フローの開始点（`flow.start` から合成されるノード） |
| `announce` | Announce | TTS / 音声再生 |
| `interaction` | Interaction | DTMF または STT の受け取り（旧名: `input`） |
| `nexus` | Nexus | 条件による分岐（旧名: `condition`） |
| `logic` | Logic | ロジックモジュール / JavaScript スクリプト（旧名: `script`） |
| `openai` | OpenAI | OpenAI / LLM の呼び出し（旧名: `llm`） |
| `faq` | FAQ | 質問応答（FAQ） |
| `transfer` | Transfer | 転送 |
| `save` | Save | データ保存 — Flag / Save Data 2 Dr.JOY モジュール（旧名: `flag`） |
| `jump` | Jump | 別のサブフローへジャンプ |
| `hangup` | Hangup | 終了 / 通話切断 |

> 旧 type 名（`input · condition · script · llm · flag`）も [`src/ir/types.ts`](src/ir/types.ts) の `LEGACY_TYPE_ALIASES` によって**引き続き読み込み可能**です。

---

## ローカル実行

```bash
npm install
npm run dev        # http://localhost:5173 を開く
```

ログイン後、**YAML ファイル管理**画面（[§YAML ファイル管理](#-yaml-ファイル管理github)参照）でファイルを選択／アップロードしてキャンバスに開きます。サンプルファイルは [`flows/`](flows/) にあります。

> **デモモード（`npm run dev` 時の既定）:** `VITE_GOOGLE_CLIENT_ID` が未設定の場合、ログイン画面に **「デモモードに入る（ログインをスキップ）」** ボタンが表示され、すぐに UI を確認できます。**ビルド／デプロイ版ではデモは無効**で、常に Google ログインを要求します（ビルド版でデモを有効にするには `VITE_ALLOW_DEMO=true` が必要）。
> （YAML ファイルの読み書きには GitHub トークンが必要、AI 機能には `VITE_AI_PROXY_URL` が必要です。）

その他のコマンド:

```bash
npm run build      # tsc -b && vite build  -> dist/
npm run preview    # ビルド版のプレビュー
npm test           # vitest run — fromYaml/toYaml, verifyIdToken, GitHub API, icon などの単体テスト
npm run test:watch # vitest の watch モード
```

---

## 環境変数

`.env` / `.env.local` を作成（[`.env.example`](.env.example) 参照）:

| 変数 | 必須 | 意味 |
|------|:----:|------|
| `VITE_GOOGLE_CLIENT_ID` | ✅¹ | Google OAuth 2.0 Client ID（Web）。**secret ではない** — SPA バンドルに含めても安全。 |
| `VITE_AI_PROXY_URL` | – | AI プロキシ URL（Vercel Function、OpenAI キーをサーバー側に保持）、末尾は `/api/chat`。**secret ではない。** [`proxy-vercel/README.md`](proxy-vercel/README.md) 参照。 |
| `VITE_OPENAI_MODEL` | – | クライアントが送る OpenAI モデル（プロキシが forward）、既定 `gpt-5.1`（[`src/ai/config.ts`](src/ai/config.ts) 参照）。 |
| `VITE_ALLOW_DEMO` | – | ビルド版でデモモードを有効にするには `true`（既定は `npm run dev` 時のみ有効）。 |
| `VITE_SESSION_IDLE_MINUTES` | – | スライディング idle ウィンドウによるセッション有効期限（分）、既定 `720`（12 時間）。 |
| `VITE_GITHUB_OWNER` / `VITE_GITHUB_REPO` | – | YAML を格納するリポジトリ、既定 `drjoy-toshi-tuan/scenario-flow-builder`。 |
| `VITE_FLOWS_BRANCH` / `VITE_FLOWS_DIR` | – | YAML のブランチ＆ディレクトリ、既定 `main` / `flows`。 |

> ¹ Client ID がないとデモモード（ローカル）のみ利用可能。本番デプロイでは**必須**。SPA なので Client ID に client secret は**使いません**。

> **OpenAI キーはもうクライアントにありません。** クライアントは Google ID トークンを添えて `VITE_AI_PROXY_URL` を呼び、プロキシ（Vercel Function）がトークンを検証してから OpenAI キー（Vercel の env）を付与します。プロキシの構築: [`proxy-vercel/README.md`](proxy-vercel/README.md)。

---

## Google Cloud Console の設定（人間が行う作業）

Claude Code では実行できません。あなた（Tuan）が [Google Cloud Console](https://console.cloud.google.com/apis/credentials) で行う必要があります:

1. **Web application** タイプの **OAuth 2.0 Client ID** を作成。
2. **Authorized JavaScript origins** に以下を追加:
   - `http://localhost:5173`
   - `https://drjoy-toshi-tuan.github.io`
3. Client ID をコピー → `VITE_GOOGLE_CLIENT_ID` に使用（ローカル `.env` と GitHub Actions secret）。

---

## GitHub Pages デプロイ

1. **Pages を有効化:** repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**。
2. **Client ID と（任意で）AI プロキシ URL を追加:** repo → **Settings → Secrets and variables → Actions**
   - **Secrets** タブ（または **Variables** どちらでも可 — workflow は両方を読む）→ **New**
   - `VITE_GOOGLE_CLIENT_ID` = 上記の Client ID。
   - `VITE_AI_PROXY_URL`（任意）= デプロイ版で AI を有効にするプロキシ URL、例 `https://…vercel.app/api/chat`（[`proxy-vercel/`](proxy-vercel/) 参照）。
   - ⚠️ **Repository** の secret/variable に設定すること（`github-pages` 環境の Environment secret では**ない** — build ジョブが読めません）。追加後は必ず**再デプロイ**（`main` に push、または **Actions → Deploy → Run workflow**）。Client ID がないとログイン画面が *「Google ログインが未設定」* と表示します。
3. **`main` に push** → workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) がビルド＆デプロイ（build 変数を値を出さずにログ確認するステップ、Pages の一時エラー時に自動リトライするステップあり）。
4. URL: `https://drjoy-toshi-tuan.github.io/scenario-flow-builder/`

> `vite.config.ts` はリポジトリ名に合わせて `base: '/scenario-flow-builder/'` を設定済み。

---

## 🤖 AI 機能（OpenAI をプロキシ経由で）

**OpenAI Chat Completions** を**プロキシ**（Vercel Function、[`proxy-vercel/`](proxy-vercel/) 参照）経由で呼び出します — OpenAI キーはサーバー側にあり、クライアントは Google ID トークンを添えて認証させるだけです。2 か所で使用:

- **AIで生成・修正** — **Logic** ノード（JavaScript *スクリプト*の生成・修正）と **OpenAI** ノード（*プロンプト*の生成・修正）内のボタン。モーダルがコンテキスト（`#Role` → `#Scenario Flow Context` → 関連する announce 文から自動入力される `#Question Context`）を構築し、結果をコード／プロンプト欄に自動入力します。
- **スクリプトの説明** — Logic ノード保存後、バックグラウンドで `data.scriptExplanation` を更新（YAML ファイル単位で保存、再オープン時に再生成不要）。

設定は [`src/ai/config.ts`](src/ai/config.ts): `VITE_AI_PROXY_URL` ＋既定モデル `gpt-5.1`（reasoning model のためクライアントは `temperature` を省略）。プロキシ未設定でも AI ボタンは表示されますが、押すとエラーになります（バックグラウンド説明は無言でスキップ）。Google ID トークンの寿命は約 1 時間: タブを 1 時間以上放置してから AI を押すと *「再ログイン」* エラー（プロキシが 401 を返す）になることがあります。コンテキスト用の **サンプルモジュール** JS が [`src/ai/samples/`](src/ai/samples/) にあります。

---

## ⚙️ IVR Property

IR ＋設定フォームから IVR 構成内容を生成する**読み取り専用**パネル（[`src/ir/ivrProperty.ts`](src/ir/ivrProperty.ts)、純粋関数）。連動項目:

- 施設名 / Office ID / **Demo** または **Master** 環境（host とサービス URL が変わる）。
- **TTS エンジン**（Amivoice → トークン `{tts_g:…}` / AI Talk → `{tts_ai:…}`）。
- **STT エンジン**（Amivoice → `# Amivoice` ブロック / Soniox → `# Soniox`）。
- `*.prompt=` 行はフロー内の `announce` / `interaction` / `openai` ノードの announce 文から生成。

---

## 🌐 言語＆テーマ

- **i18n** は最小構成でライブラリ非依存（[`src/ui/i18n.ts`](src/ui/i18n.ts)）: zustand store が言語＋辞書 **VI / JA**（同一キーセット）を保持し `localStorage`（`bk-lang`）に保存。メニューで言語を切り替えるとキャンバス上のノードも再レンダリング。
- **テーマ**（ライト／ダーク）はメニューで切り替え（[`src/ui/theme.ts`](src/ui/theme.ts)）。

---

## 🔒 セキュリティ

### クライアント側で厳格化（defense-in-depth）

Google から ID トークンを受け取ると、[`src/auth/verifyIdToken.ts`](src/auth/verifyIdToken.ts) が以下を検証:

- `iss` ∈ `accounts.google.com` / `https://accounts.google.com`
- `aud` === `VITE_GOOGLE_CLIENT_ID`（トークンが**このアプリ宛て**であること）
- `exp` が有効、`iat`/`nbf` が未来でない（clock-skew 60 秒）— ログイン時点で判定
- `hd` === `drjoy.jp` **かつ** email が `@drjoy.jp` で終わる **かつ** `email_verified === true`
- `nonce` が各ログイン前に生成したランダム nonce と一致（**リプレイ**対策）
- `sub` が存在

> ⚠️ **これでも完全なセキュリティではありません。** クライアントは Google の公開鍵で**署名**を検証しておらず、JS バンドルは公開されるため、静的サイトでは理論上バイパス可能です。上記チェックは「安価な」バイパス（通常の Gmail への差し替え、他アプリのトークン流用、古いトークンの再送）を防ぎ、実データがない段階の **UI テスト用内部ゲート**として十分です。

### バックエンドなしで最強のバイパス防止: OAuth **Internal**

Google Cloud Console で **OAuth consent screen = Internal** に設定（Google Workspace が必要）。こうすると **Workspace `drjoy.jp` のアカウントだけがトークンを取得可能**になり、部外者は Google の層でログインできません — クライアントコードに依存しません:

1. Google Cloud Console → **APIs & Services → OAuth consent screen**。
2. **User type: Internal** → Save。

### 実 API／実データを扱うとき（必須）

ID トークンの署名＋クレーム `hd`/`aud`/`exp` を**サーバー側**（Vercel/Cloudflare Functions）で検証してからデータを返すこと。`auth/` モジュールは分離されており、このステップは検証呼び出しを 1 つ追加するだけで済み、UI を書き換える必要はありません。

`ALLOWED_DOMAIN` は [`src/auth/config.ts`](src/auth/config.ts) にあります。

---

## 📁 YAML ファイル管理（GitHub）

ログイン後、キャンバスに入る前に **「YAML ファイル管理」** 画面が開きます:

- 📂 リポジトリの [`flows/`](flows/) ディレクトリ内の**ファイル一覧**（GitHub Contents API で読み取り）。
- 📤 **ファイルのアップロード** — PC から `.yaml/.yml` を選択 → 妥当性チェック → **`flows/` へ直接コミット**。
- ✨ **新規フロー作成** — 空ファイルを生成して `flows/` へコミット。
- 🗑 リポジトリからファイルを**削除**（確認あり）。
- 💾 キャンバス内: **「リポジトリへ保存」**（メニュー）で現在の IR（YAML エクスポート）を該当ファイルへ上書きコミット、**「ファイル一覧」** で戻る。

### なぜ GitHub トークンが必要か

本アプリは **バックエンドのない GitHub Pages 上の静的サイト** です。リポジトリにファイルを**書き込む**ため、ブラウザがあなたの提供する **fine-grained personal access token** で **GitHub Contents API** を直接呼び出します:

1. GitHub → **Settings → Developer settings → Fine-grained tokens → [Generate new token](https://github.com/settings/personal-access-tokens/new)**。
2. **Resource owner** = `drjoy-toshi-tuan`；**Only select repositories** = `scenario-flow-builder`。
3. **Repository permissions → Contents: Read and write**。
4. トークンを「GitHub 接続」画面に貼り付け。

> 🔐 トークンは **`localStorage`** に保存 → **セッションをまたいで記憶**（一度追加すれば、トークンが失効するか「切断」するまで次回以降も自動使用）。バンドルに含めず、コミットもしません。**最小権限**（1 リポジトリのみ・Contents のみ）を付与し、共有 PC を離れる前に**「切断」**してください。（Google ログインは引き続き `sessionStorage` — タブを閉じる／ブラウザを終了すると再ログイン。）

### ログインセッションの有効期限（使用中に締め出されない）

Google の ID トークンは約 1 時間しか生きません。以前はトークン失効時にアプリが自動ログアウトしていたため、（開いたままでも）長時間放置すると再ログインを強制されました。現在はアプリのセッションを**スライディング idle ウィンドウ**で計算: 各操作（マウス／キーボード／スクロール…）で延長され、**継続して操作がない時間がこの期限を超えたときのみログアウト**します（既定 **12 時間**、`VITE_SESSION_IDLE_MINUTES` で変更）。これは Google トークンの `exp` から切り離されています — クライアント側のドメインゲートは **UX ゲート**にすぎないため妥当です（実データを扱うときはサーバー側検証が本当のセキュリティ境界、上記参照）。

---

## アーキテクチャ

[`CLAUDE.md`](CLAUDE.md) 参照 — IR が source of truth。`ir/` は純粋（React 非依存）、`canvas/` は IR からレンダリング、`irAdapter.ts` は IR ↔ React Flow の純粋関数 2 つ。

```
YAML ──fromYaml──► IR ──layout(ツリー)──► IR(+position) ──irToReactFlow──► Canvas
                    ▲                                                      │
                    └──────────── reactFlowToIr / store actions ◄──────────┘
IR ──toYaml──► YAML (Export / リポジトリへ保存)
```

`src/` ディレクトリ構成（詳細は [`CLAUDE.md`](CLAUDE.md)）:

```
ir/         # 純粋 TS — types (SOURCE OF TRUTH), fromYaml, toYaml, layout, ivrProperty, flowMeta
canvas/     # React Flow — FlowCanvas, irAdapter, nodes/, edges/
auth/       # AuthProvider, useAuth, config (ALLOWED_DOMAIN), LoginScreen, verifyIdToken, nonce
github/     # config + Contents API (純粋 fetch), token store (localStorage), errors
files/      # FileManagerScreen, GithubConnectPanel (キャンバス前の YAML 管理画面)
ai/         # OpenAI client, context builder, explain, knowledge, samples/ (サンプル JS モジュール)
store/      # zustand: flowStore (FlowIR + actions), fileStore (開いているファイル / routing)
components/ # Toolbar, NodeSettingsPanel, HeaderMenu, AddModulePanel, AiGenerateModal, IvrPropertyModal…
ui/         # i18n (VI/JA), theme, icons, nodeConfig, nodeSchema, scriptLint, Toast…
```

<br>

---
---

<br>

# Tiếng Việt

Webapp visualize flow của hệ thống **AI電話** (Brekeke-based) dưới dạng sơ đồ node giống
[n8n](https://n8n.io), đọc/ghi từ file YAML. **IR** (Intermediate Representation) là source
of truth duy nhất; YAML chỉ là adapter import/export quanh IR.

> App là **static site chạy trên GitHub Pages, không có backend**. Đăng nhập Google giới hạn
> domain `drjoy.jp` (cổng UX + siết claim ở client). Chưa sinh `.bivr`, chưa có database/lưu server.
> Có sẵn tính năng **AI sinh/sửa script & prompt** (OpenAI) — gọi qua **proxy** (Vercel Function)
> giữ key ở server, không lộ ra client (xem [`proxy-vercel/`](proxy-vercel/)).

🌐 **Ngôn ngữ / 言語:** [日本語](#scenario-flow-builder)（phía trên） ｜ **Tiếng Việt**（phần này）

---

## Tính năng

- 📥 Đọc YAML flow → **IR** → **auto-layout** (top-down, thuật toán cây tự viết) → canvas React Flow.
- 🖱️ Kéo-thả node, chọn nhiều node (rê vùng), zoom/pan, minimap, fit-view.
- 🔌 Nối dây (kéo từ output → input), **xoá dây** bằng icon 🗑 hiện khi hover.
- ➕ **Thêm node** từ palette; ✏️ **double-click node** mở panel sửa `label`, mô tả và tham số (`data`)
  theo từng loại — chia tab **General / Property / Branch**.
- 🌿 **Sub Flow** trong cùng file: node **Jump** trỏ tới sub flow theo tên; xử lý xong quay lại main flow.
- 🤖 **AI sinh/sửa** (OpenAI): nút *AIで生成・修正* trong node **Logic** (script JS) và **OpenAI** (prompt),
  kèm **giải thích script** tự động (lưu vào file, mở lại không cần gen lại).
- ⚙️ **IVR Property**: panel read-only sinh cấu hình IVR (施設名, Office ID, môi trường Demo/Master,
  TTS/STT engine) liên động với các câu announce trong flow.
- 📤 **Export YAML** (round-trip IR ↔ YAML) và 💾 **lưu thẳng về repo** qua GitHub API.
- 🔐 Đăng nhập Google, chỉ tài khoản `@drjoy.jp` — verify claim kỹ + nonce (xem [Bảo mật](#-bảo-mật)).
- 📁 **Quản lý file YAML** trên repo: mở / tải lên / tạo / xoá / lưu về `flows/` qua GitHub Contents API.
- 🌐 **Đa ngôn ngữ** giao diện: Tiếng Việt / 日本語. 🎨 **Giao diện sáng/tối**.
- 🚀 Deploy GitHub Pages qua GitHub Actions.

### 11 loại node

| Type | Nhãn | Vai trò |
|------|------|---------|
| `start` | Start | Điểm bắt đầu flow (node tổng hợp từ `flow.start`) |
| `announce` | Announce | Phát TTS / audio |
| `interaction` | Interaction | Thu DTMF hoặc STT (tên cũ: `input`) |
| `nexus` | Nexus | Phân nhánh theo điều kiện (tên cũ: `condition`) |
| `logic` | Logic | Module logic / script JavaScript (tên cũ: `script`) |
| `openai` | OpenAI | Gọi OpenAI / LLM (tên cũ: `llm`) |
| `faq` | FAQ | Hỏi–đáp (FAQ) |
| `transfer` | Transfer | Chuyển máy |
| `save` | Save | Lưu dữ liệu — module Flag / Save Data 2 Dr.JOY (tên cũ: `flag`) |
| `jump` | Jump | Nhảy sang sub flow khác |
| `hangup` | Hangup | Kết thúc / cúp máy |

> Tên type cũ (`input · condition · script · llm · flag`) **vẫn mở được** nhờ `LEGACY_TYPE_ALIASES`
> trong [`src/ir/types.ts`](src/ir/types.ts).

---

## Chạy local

```bash
npm install
npm run dev        # mở http://localhost:5173
```

Sau khi đăng nhập, chọn/tải file từ màn **Quản lý file YAML** (xem [§Quản lý file YAML](#-quản-lý-file-yaml-github))
để mở trên canvas. File mẫu có sẵn trong [`flows/`](flows/).

> **Chế độ demo (mặc định khi chạy `npm run dev`):** nếu chưa set `VITE_GOOGLE_CLIENT_ID`, màn login
> có nút **“Vào chế độ demo (bỏ qua đăng nhập)”** để xem UI ngay. **Bản build/deploy TẮT demo**
> → luôn bắt đăng nhập Google (muốn bật demo trên bản build phải đặt `VITE_ALLOW_DEMO=true`).
> (Vẫn cần GitHub token để đọc/ghi file YAML; cần `VITE_AI_PROXY_URL` để dùng tính năng AI.)

Các lệnh khác:

```bash
npm run build      # tsc -b && vite build  -> dist/
npm run preview    # xem thử bản build
npm test           # vitest run — unit test cho fromYaml/toYaml, verifyIdToken, github API, icon…
npm run test:watch # vitest ở chế độ watch
```

---

## Biến môi trường

Tạo `.env` / `.env.local` (xem [`.env.example`](.env.example)):

| Biến | Bắt buộc | Ý nghĩa |
|------|:--------:|---------|
| `VITE_GOOGLE_CLIENT_ID` | ✅¹ | Google OAuth 2.0 Client ID (Web). **Không phải secret** — an toàn trong bundle SPA. |
| `VITE_AI_PROXY_URL` | – | URL proxy AI (Vercel Function, giữ key OpenAI ở server), có đuôi `/api/chat`. **Không phải secret.** Xem [`proxy-vercel/README.md`](proxy-vercel/README.md). |
| `VITE_OPENAI_MODEL` | – | Model OpenAI client gửi kèm (proxy forward), mặc định `gpt-5.1` (xem [`src/ai/config.ts`](src/ai/config.ts)). |
| `VITE_ALLOW_DEMO` | – | `true` để bật chế độ demo trên bản build (mặc định chỉ bật khi `npm run dev`). |
| `VITE_SESSION_IDLE_MINUTES` | – | Thời hạn phiên theo cửa sổ idle trượt (phút), mặc định `720` (12 giờ). |
| `VITE_GITHUB_OWNER` / `VITE_GITHUB_REPO` | – | Repo chứa YAML, mặc định `drjoy-toshi-tuan/scenario-flow-builder`. |
| `VITE_FLOWS_BRANCH` / `VITE_FLOWS_DIR` | – | Nhánh & thư mục chứa YAML, mặc định `main` / `flows`. |

> ¹ Không có Client ID thì chỉ vào được chế độ demo (local). Bản deploy production **bắt buộc** có.
> Client ID **không** dùng client secret cho SPA.

> **Key OpenAI không còn ở client.** Client gọi `VITE_AI_PROXY_URL` kèm ID token Google; proxy
> (Vercel Function) verify token rồi mới gắn key OpenAI (env của Vercel). Dựng proxy: [`proxy-vercel/README.md`](proxy-vercel/README.md).

---

## Thiết lập Google Cloud Console (việc con người phải làm)

Claude Code không làm được các bước này — bạn (Tuan) cần tự làm trên
[Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Tạo **OAuth 2.0 Client ID** loại **Web application**.
2. **Authorized JavaScript origins**, thêm:
   - `http://localhost:5173`
   - `https://drjoy-toshi-tuan.github.io`
3. Copy Client ID → dùng cho `VITE_GOOGLE_CLIENT_ID` (local `.env` và GitHub Actions secret).

---

## Deploy GitHub Pages

1. **Bật Pages:** repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Thêm Client ID & (tuỳ chọn) URL proxy AI:** repo → **Settings → Secrets and variables → Actions**
   - Vào tab **Secrets** (hoặc **Variables** đều được — workflow đọc cả hai) → **New**
   - `VITE_GOOGLE_CLIENT_ID` = Client ID ở trên.
   - `VITE_AI_PROXY_URL` (tuỳ chọn) = URL proxy để bật AI trên bản deploy, vd `https://…vercel.app/api/chat` (xem [`proxy-vercel/`](proxy-vercel/)).
   - ⚠️ Phải đặt ở **Repository** secret/variable (KHÔNG phải Environment secret của môi trường
     `github-pages` — job build không đọc được). Sau khi thêm phải **chạy lại deploy** (push `main`
     hoặc **Actions → Deploy → Run workflow**). Thiếu Client ID → màn login báo
     *"Chưa cấu hình đăng nhập Google"*.
3. **Push `main`** → workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) build & deploy
   (có bước log kiểm tra biến build không lộ giá trị, và tự thử lại deploy khi Pages lỗi tạm thời).
4. URL: `https://drjoy-toshi-tuan.github.io/scenario-flow-builder/`

> `vite.config.ts` đã set `base: '/scenario-flow-builder/'` khớp tên repo.

---

## 🤖 Tính năng AI (OpenAI qua proxy)

Gọi **OpenAI Chat Completions** qua một **proxy** (Vercel Function, xem [`proxy-vercel/`](proxy-vercel/)) — key OpenAI
nằm ở server, client chỉ gửi kèm ID token Google để proxy xác thực. Dùng ở 2 chỗ:

- **AIで生成・修正** — nút trong node **Logic** (sinh/sửa *script* JavaScript) và node **OpenAI**
  (sinh/sửa *prompt*). Modal dựng bối cảnh (`#Role` → `#Scenario Flow Context` → `#Question Context`
  tự fill từ câu announce liên quan) rồi để field tự gõ kết quả vào ô code/prompt.
- **Giải thích script** — sau khi lưu node Logic, chạy nền để làm mới `data.scriptExplanation`
  (lưu theo file YAML, mở lại không cần gen lại).

Cấu hình ở [`src/ai/config.ts`](src/ai/config.ts): `VITE_AI_PROXY_URL` + model mặc định `gpt-5.1`
(reasoning model nên client tự bỏ `temperature`). Chưa cấu hình proxy → nút AI vẫn hiện nhưng báo lỗi
khi bấm; giải thích nền bỏ qua im lặng. ID token Google sống ~1 giờ: để tab lâu > 1 giờ rồi bấm AI có
thể bị lỗi *"đăng nhập lại"* (proxy trả 401). Có sẵn vài **sample module** JS trong
[`src/ai/samples/`](src/ai/samples/) làm ngữ cảnh.

---

## ⚙️ IVR Property

Panel **read-only** ([`src/ir/ivrProperty.ts`](src/ir/ivrProperty.ts), hàm thuần) sinh nội dung cấu hình
IVR từ IR + form cài đặt. Liên động:

- 施設名 / Office ID / môi trường **Demo** hoặc **Master** (đổi host & service URL).
- **TTS engine** (Amivoice → token `{tts_g:…}` / AI Talk → `{tts_ai:…}`).
- **STT engine** (Amivoice → khối `# Amivoice` / Soniox → `# Soniox`).
- Các dòng `*.prompt=` sinh từ câu announce của node `announce` / `interaction` / `openai` trong flow.

---

## 🌐 Ngôn ngữ & giao diện

- **i18n** tối giản, không thêm thư viện ([`src/ui/i18n.ts`](src/ui/i18n.ts)): store zustand giữ ngôn
  ngữ + từ điển **VI / JA** (cùng bộ key), lưu `localStorage` (`bk-lang`). Đổi ngôn ngữ trong menu →
  cả node trên canvas cũng re-render.
- **Theme** sáng/tối đổi trong menu ([`src/ui/theme.ts`](src/ui/theme.ts)).

---

## 🔒 Bảo mật

### Đã siết ở client (defense-in-depth)

Khi nhận ID token từ Google, [`src/auth/verifyIdToken.ts`](src/auth/verifyIdToken.ts) kiểm tra:

- `iss` ∈ `accounts.google.com` / `https://accounts.google.com`
- `aud` === `VITE_GOOGLE_CLIENT_ID` (token phát cho **đúng app này**)
- `exp` còn hạn, `iat`/`nbf` không ở tương lai (có clock-skew 60s) tại thời điểm đăng nhập
- `hd` === `drjoy.jp` **và** email kết thúc bằng `@drjoy.jp` **và** `email_verified === true`
- `nonce` khớp nonce ngẫu nhiên sinh trước mỗi lần đăng nhập (chống **replay**)
- có `sub`

> ⚠️ **Vẫn KHÔNG phải bảo mật tuyệt đối.** Client không verify **chữ ký** bằng khoá công khai
> của Google; bundle JS là công khai nên về lý thuyết vẫn bypass được trên static site. Các
> kiểm tra trên chặn được các kiểu bypass "rẻ" (đổi Gmail thường, dùng lại token của app khác,
> phát lại token cũ), đủ cho **cổng nội bộ test UI** khi chưa có dữ liệu thật.

### Chặn bypass mạnh nhất mà không cần backend: OAuth **Internal**

Đặt **OAuth consent screen = Internal** trên Google Cloud Console (yêu cầu Google Workspace).
Khi đó **chỉ tài khoản thuộc Workspace `drjoy.jp` mới lấy được token** — người ngoài không thể
đăng nhập ngay từ tầng Google, không phụ thuộc code client:

1. Google Cloud Console → **APIs & Services → OAuth consent screen**.
2. **User type: Internal** → Save.

### Khi có API/dữ liệu thật (BẮT BUỘC)

Verify chữ ký + claim `hd`/`aud`/`exp` của ID token **ở server-side** (Vercel/Cloudflare
Functions) trước khi trả bất kỳ dữ liệu nào. Module `auth/` tách rời để bước này chỉ cần thêm
1 lời gọi verify, không phải sửa UI.

`ALLOWED_DOMAIN` nằm ở [`src/auth/config.ts`](src/auth/config.ts).

---

## 📁 Quản lý file YAML (GitHub)

Sau khi đăng nhập, app mở màn **"Quản lý file YAML"** trước khi vào canvas:

- 📂 **Danh sách file** trong thư mục [`flows/`](flows/) của repo (đọc qua GitHub Contents API).
- 📤 **Tải file lên** — chọn `.yaml/.yml` từ máy → kiểm tra hợp lệ → **commit thẳng vào `flows/`**.
- ✨ **Tạo flow mới** — sinh file trống rồi commit vào `flows/`.
- 🗑 **Xoá** file khỏi repo (có xác nhận).
- 💾 Trong canvas: **"Lưu về repo"** (menu) commit IR hiện tại (export YAML) đè lên đúng file,
  **"Danh sách file"** để quay lại.

### Vì sao cần GitHub token?

App là **static site trên GitHub Pages, không có backend**. Để **ghi** file vào repo, trình
duyệt gọi thẳng **GitHub Contents API** bằng **fine-grained personal access token** do bạn cung cấp:

1. GitHub → **Settings → Developer settings → Fine-grained tokens →
   [Generate new token](https://github.com/settings/personal-access-tokens/new)**.
2. **Resource owner** = `drjoy-toshi-tuan`; **Only select repositories** = `scenario-flow-builder`.
3. **Repository permissions → Contents: Read and write**.
4. Dán token vào màn "Kết nối GitHub".

> 🔐 Token lưu ở **`localStorage`** → **nhớ qua các phiên** (thêm 1 lần, lần sau tự dùng cho tới
> khi token hết hạn hoặc bạn **"Ngắt kết nối"**). Không đưa vào bundle, không commit. Hãy cấp
> **quyền tối thiểu** (đúng 1 repo, chỉ Contents) và **"Ngắt kết nối"** trước khi rời máy dùng chung.
> (Đăng nhập Google vẫn theo `sessionStorage` — đóng tab/tắt trình duyệt là đăng nhập lại.)

### Thời hạn phiên đăng nhập (không bị đá ra khi đang dùng)

ID token của Google chỉ sống ~1 giờ. Trước đây app tự đăng xuất đúng lúc token hết hạn nên
để lâu (kể cả vẫn đang mở) là bị buộc đăng nhập lại. Nay phiên app tính theo **cửa sổ idle
trượt**: mỗi thao tác (chuột/bàn phím/cuộn…) gia hạn thêm, **chỉ đăng xuất khi KHÔNG thao tác
liên tục quá thời hạn** (mặc định **12 giờ**, đổi qua `VITE_SESSION_IDLE_MINUTES`). Việc này
tách khỏi `exp` của token Google — hợp lý vì gating domain ở client chỉ là **cổng UX** (khi có
dữ liệu thật, verify server-side mới là ranh giới bảo mật thật, xem trên).

---

## Kiến trúc

Xem [`CLAUDE.md`](CLAUDE.md) — IR là source of truth; `ir/` thuần (không React); `canvas/`
render từ IR; `irAdapter.ts` là 2 hàm thuần IR ↔ React Flow.

```
YAML ──fromYaml──► IR ──layout(cây)──► IR(+position) ──irToReactFlow──► Canvas
                    ▲                                                      │
                    └──────────── reactFlowToIr / store actions ◄──────────┘
IR ──toYaml──► YAML (Export / Lưu về repo)
```

Bố cục thư mục `src/` (chi tiết trong [`CLAUDE.md`](CLAUDE.md)):

```
ir/         # thuần TS — types (SOURCE OF TRUTH), fromYaml, toYaml, layout, ivrProperty, flowMeta
canvas/     # React Flow — FlowCanvas, irAdapter, nodes/, edges/
auth/       # AuthProvider, useAuth, config (ALLOWED_DOMAIN), LoginScreen, verifyIdToken, nonce
github/     # config + Contents API (thuần fetch), token store (localStorage), errors
files/      # FileManagerScreen, GithubConnectPanel (màn quản lý YAML trước canvas)
ai/         # OpenAI client, context builder, explain, knowledge, samples/ (module JS mẫu)
store/      # zustand: flowStore (FlowIR + actions), fileStore (file đang mở / routing)
components/ # Toolbar, NodeSettingsPanel, HeaderMenu, AddModulePanel, AiGenerateModal, IvrPropertyModal…
ui/         # i18n (VI/JA), theme, icons, nodeConfig, nodeSchema, scriptLint, Toast…
```
