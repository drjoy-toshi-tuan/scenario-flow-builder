# Scenario Flow Builder

Webapp visualize flow của hệ thống **AI電話** (Brekeke-based) dưới dạng sơ đồ node giống
[n8n](https://n8n.io), đọc/ghi từ file YAML. **IR** (Intermediate Representation) là source
of truth duy nhất; YAML chỉ là adapter import/export quanh IR.

> App là **static site chạy trên GitHub Pages, không có backend**. Đăng nhập Google giới hạn
> domain `drjoy.jp` (cổng UX + siết claim ở client). Chưa sinh `.bivr`, chưa có database/lưu server.
> Có sẵn tính năng **AI sinh/sửa script & prompt** (OpenAI) — gọi qua **proxy** (Cloudflare Worker)
> giữ key ở server, không lộ ra client (xem [`proxy/`](proxy/)).

![node types](https://img.shields.io/badge/nodes-11%20types-blue) ![i18n](https://img.shields.io/badge/i18n-VI%20%2F%20JA-orange) ![theme](https://img.shields.io/badge/theme-light%20%2F%20dark-lightgrey)

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
| `VITE_AI_PROXY_URL` | – | URL Cloudflare Worker proxy cho tính năng AI (giữ key OpenAI ở server). **Không phải secret.** Xem [`proxy/README.md`](proxy/README.md). |
| `VITE_OPENAI_MODEL` | – | Model OpenAI client gửi kèm (proxy forward), mặc định `gpt-5.1` (xem [`src/ai/config.ts`](src/ai/config.ts)). |
| `VITE_ALLOW_DEMO` | – | `true` để bật chế độ demo trên bản build (mặc định chỉ bật khi `npm run dev`). |
| `VITE_SESSION_IDLE_MINUTES` | – | Thời hạn phiên theo cửa sổ idle trượt (phút), mặc định `720` (12 giờ). |
| `VITE_GITHUB_OWNER` / `VITE_GITHUB_REPO` | – | Repo chứa YAML, mặc định `drjoy-toshi-tuan/scenario-flow-builder`. |
| `VITE_FLOWS_BRANCH` / `VITE_FLOWS_DIR` | – | Nhánh & thư mục chứa YAML, mặc định `main` / `flows`. |

> ¹ Không có Client ID thì chỉ vào được chế độ demo (local). Bản deploy production **bắt buộc** có.
> Client ID **không** dùng client secret cho SPA.

> **Key OpenAI không còn ở client.** Client gọi `VITE_AI_PROXY_URL` kèm ID token Google; proxy
> (Cloudflare Worker) verify token rồi mới gắn key OpenAI (secret của Worker). Dựng proxy: [`proxy/README.md`](proxy/README.md).

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
   - `VITE_AI_PROXY_URL` (tuỳ chọn) = URL Worker proxy để bật AI trên bản deploy (xem [`proxy/`](proxy/)).
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

Gọi **OpenAI Chat Completions** qua một **proxy** (Cloudflare Worker, xem [`proxy/`](proxy/)) — key OpenAI
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
