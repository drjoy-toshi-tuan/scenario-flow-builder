# AI電話 Flow Builder — Phase 1 (UI demo)

Webapp visualize flow của hệ thống **AI電話** (Brekeke-based) dưới dạng sơ đồ node giống
[n8n](https://n8n.io), đọc/ghi từ file YAML. **IR** (Intermediate Representation) là source
of truth duy nhất; YAML chỉ là adapter import/export.

> Phase 1 tập trung **test UI online trên GitHub Pages**, có đăng nhập Google giới hạn
> domain `drjoy.jp`. Chưa sinh `.bivr`, chưa có AI, chưa có backend.

![node types](https://img.shields.io/badge/nodes-9%20types-blue) ![phase](https://img.shields.io/badge/phase-1%20(UI%20demo)-green)

---

## Tính năng phase 1

- 📥 Đọc YAML flow → **IR** → **auto-layout ELK** (top-down) → canvas React Flow.
- 🖱️ Kéo-thả node, chọn nhiều node (rê vùng), zoom/pan, minimap, fit-view.
- 🔌 Nối dây (kéo từ output → input), **xoá dây** bằng icon 🗑 hiện khi hover.
- ✏️ **Double-click node** mở panel sửa `label` và các field trong `data`.
- 📤 **Export YAML** (round-trip IR ↔ YAML) để kiểm chứng.
- 🔐 Đăng nhập Google, chỉ tài khoản `@drjoy.jp` — verify claim kỹ + nonce (xem [Bảo mật](#-bảo-mật)).
- 📁 **Quản lý file YAML** trên repo: mở / tải lên / tạo / lưu về `flows/` qua GitHub API.
- 🚀 Deploy GitHub Pages qua GitHub Actions.

9 loại node: `start · announce · input · condition · script · llm · transfer · hangup · end`.

---

## Chạy local

```bash
npm install
npm run dev        # mở http://localhost:5173
```

Sau khi đăng nhập, chọn/tải file từ màn **Quản lý file YAML** (xem [§Quản lý file YAML](#-quản-lý-file-yaml-github))
để mở trên canvas. File mẫu có sẵn trong [`flows/`](flows/).

> **Chế độ demo (chỉ khi chạy `npm run dev`):** nếu chưa set `VITE_GOOGLE_CLIENT_ID`, màn login
> có nút **“Vào chế độ demo (bỏ qua đăng nhập)”** để xem UI ngay. **Bản build/deploy TẮT demo**
> → luôn bắt đăng nhập Google (muốn bật demo trên bản build phải đặt `VITE_ALLOW_DEMO=true`).
> (Vẫn cần GitHub token để đọc/ghi file YAML.)

Các lệnh khác:

```bash
npm run build      # tsc -b && vite build  -> dist/
npm run preview    # xem thử bản build
npm test           # unit test cho fromYaml / toYaml (round-trip)
```

---

## Biến môi trường

Tạo `.env` (xem `.env.example`):

```
VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

Client ID **không phải secret** — an toàn để nằm trong bundle SPA. **Không** dùng client
secret cho SPA.

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
2. **Thêm Client ID:** repo → **Settings → Secrets and variables → Actions**
   - Vào tab **Secrets** (hoặc **Variables** đều được — workflow đọc cả hai) → **New**
   - Name: `VITE_GOOGLE_CLIENT_ID`
   - Value: Client ID ở trên.
   - ⚠️ Sau khi thêm phải **chạy lại deploy** (push `main` hoặc **Actions → Deploy → Run workflow**)
     thì bản build mới có Client ID. Nếu thiếu, màn login sẽ báo *"Chưa cấu hình đăng nhập Google"*.
3. **Push `main`** → workflow `.github/workflows/deploy.yml` build & deploy.
4. URL: `https://drjoy-toshi-tuan.github.io/brekeke-flow-builder/`

> `vite.config.ts` đã set `base: '/brekeke-flow-builder/'` khớp tên repo.

---

## 🔒 Bảo mật

### Đã siết ở client (defense-in-depth)

Khi nhận ID token từ Google, [`src/auth/verifyIdToken.ts`](src/auth/verifyIdToken.ts) kiểm tra:

- `iss` ∈ `accounts.google.com` / `https://accounts.google.com`
- `aud` === `VITE_GOOGLE_CLIENT_ID` (token phát cho **đúng app này**)
- `exp` còn hạn, `iat`/`nbf` không ở tương lai (có clock-skew 60s) → tự đăng xuất khi hết hạn
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
2. **Resource owner** = `drjoy-toshi-tuan`; **Only select repositories** = `brekeke-flow-builder`.
3. **Repository permissions → Contents: Read and write**.
4. Dán token vào màn "Kết nối GitHub".

> 🔐 Token lưu ở **`localStorage`** → **nhớ qua các phiên** (thêm 1 lần, lần sau tự dùng cho tới
> khi token hết hạn hoặc bạn **"Ngắt kết nối"**). Không đưa vào bundle, không commit. Hãy cấp
> **quyền tối thiểu** (đúng 1 repo, chỉ Contents) và **"Ngắt kết nối"** trước khi rời máy dùng chung.
> (Đăng nhập Google vẫn theo `sessionStorage` — đóng tab/tắt trình duyệt là đăng nhập lại.)

Cấu hình repo/nhánh/thư mục qua biến `VITE_GITHUB_OWNER` / `VITE_GITHUB_REPO` /
`VITE_FLOWS_BRANCH` / `VITE_FLOWS_DIR` (xem `.env.example`).

---

## Kiến trúc

Xem [`CLAUDE.md`](CLAUDE.md) — IR là source of truth; `ir/` thuần (không React); `canvas/`
render từ IR; `irAdapter.ts` là 2 hàm thuần IR ↔ React Flow.

```
YAML ──fromYaml──► IR ──layout(ELK)──► IR(+position) ──irToReactFlow──► Canvas
                    ▲                                                      │
                    └──────────── reactFlowToIr / store actions ◄──────────┘
IR ──toYaml──► YAML (Export)
```
