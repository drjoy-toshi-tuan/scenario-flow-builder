# scenario-ai-proxy (Vercel) — proxy OpenAI + token Drive

Backend nhỏ chạy trên **Vercel Serverless Function**, gồm 2 endpoint:

1. **`POST /api/chat`** — proxy OpenAI chống lỗi vùng. Cloudflare Worker chạy ở data
   center gần người dùng (vd Hong Kong) → OpenAI trả `403 unsupported_country`; Vercel
   Function chạy ở **region cố định** (mặc định `iad1` = Mỹ) → egress luôn hợp lệ.
   Verify Google ID token (chữ ký RS256 + claims — `lib/google-auth.js`) rồi mới gắn
   `OPENAI_API_KEY` và forward sang OpenAI.
2. **`POST /api/drive-token`** — cấp & **gia hạn ngầm** access token Google Drive để app
   không phải mở popup GIS mỗi giờ. Đổi authorization code lấy refresh token bằng
   `GOOGLE_CLIENT_SECRET`, **niêm phong** refresh token bằng AES-256-GCM
   (`DRIVE_TOKEN_SECRET`) thành `refresh_blob` cho client giữ — refresh token thô không
   bao giờ rời server. Chi tiết mô hình + đánh đổi bảo mật: comment đầu
   `api/drive-token.js`.

## Deploy (CLI)

```bash
cd proxy-vercel
npm i -g vercel          # cài Vercel CLI (hoặc dùng: npx vercel ...)
vercel login             # đăng nhập (email/GitHub)
vercel                   # deploy preview lần đầu — trả lời:
                         #   Set up and deploy? Y
                         #   Which scope? (chọn account của bạn)
                         #   Link to existing project? N
                         #   Project name? scenario-ai-proxy
                         #   In which directory is your code? ./   (Enter)
```

Sau đó **đặt 2 biến môi trường** (Production):

```bash
vercel env add OPENAI_API_KEY production      # dán key sk-...
vercel env add GOOGLE_CLIENT_ID production    # dán Client ID .apps.googleusercontent.com
# ── cho /api/drive-token (kết nối Drive 1 lần, tự gia hạn không popup) ──
vercel env add GOOGLE_CLIENT_SECRET production  # client secret của CÙNG OAuth client (Web application)
vercel env add DRIVE_TOKEN_SECRET production    # chuỗi ngẫu nhiên, sinh bằng: openssl rand -hex 32
# (tuỳ chọn) vercel env add ALLOWED_ORIGIN production   # mặc định https://drjoy-toshi-tuan.github.io
# (tuỳ chọn) vercel env add ALLOWED_DOMAIN production   # mặc định drjoy.jp
```

> `GOOGLE_CLIENT_SECRET` lấy ở Google Cloud Console → APIs & Services → Credentials →
> mở OAuth client (Web application) đang dùng cho app → mục **Client secrets**.
> `DRIVE_TOKEN_SECRET` là key mã hoá refresh token — **đổi nó = mọi người phải bấm
> kết nối Drive lại 1 lần** (dùng làm nút thu hồi khẩn cấp).

Rồi deploy production:

```bash
vercel --prod            # → in ra URL https://scenario-ai-proxy-xxxx.vercel.app
```

> Cũng có thể đặt env ở **Vercel Dashboard → Project → Settings → Environment Variables**
> (nhớ chọn Environment = Production) rồi Redeploy.

## Endpoint dùng cho app

`VITE_AI_PROXY_URL` = `https://<project>.vercel.app/api/chat`  ← **có `/api/chat`**.

Endpoint token Drive app **tự suy ra** từ URL trên (`/api/chat` → `/api/drive-token`),
không cần đặt gì thêm. Chỉ khi tách proxy Drive sang project khác mới cần
`VITE_DRIVE_TOKEN_URL`.

## Test

```bash
curl -i -X POST https://<project>.vercel.app/api/chat -d "{}"
# → 401 {"error":{"message":"Missing token"}}  (đúng = đang chặn người lạ)
```

## Region

Mặc định `iad1` (Mỹ) — OpenAI hỗ trợ, không cần chỉnh. Muốn gần châu Á hơn có thể đổi
sang **Tokyo (`hnd1`)** ở Dashboard → Settings → Functions → Region (Nhật cũng được hỗ trợ).
⚠ TRÁNH các region OpenAI chặn (vd Hong Kong).

## Env

| Tên | Loại | Ghi chú |
|-----|------|---------|
| `OPENAI_API_KEY` | **secret** | Key OpenAI (cho `/api/chat`). |
| `GOOGLE_CLIENT_ID` | plain | Check claim `aud` + đổi code/refresh token. |
| `GOOGLE_CLIENT_SECRET` | **secret** | Client secret OAuth (cho `/api/drive-token`). |
| `DRIVE_TOKEN_SECRET` | **secret** | Key niêm phong refresh token (≥32 ký tự, `openssl rand -hex 32`). |
| `ALLOWED_ORIGIN` | plain (tuỳ chọn) | CORS origin, mặc định GitHub Pages. |
| `ALLOWED_DOMAIN` | plain (tuỳ chọn) | Domain Workspace, mặc định `drjoy.jp`. |
