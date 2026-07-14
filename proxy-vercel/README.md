# scenario-ai-proxy (Vercel) — proxy OpenAI chống lỗi vùng

Bản proxy chạy trên **Vercel Serverless Function** thay cho Cloudflare Worker.

**Vì sao?** Cloudflare Worker chạy ở data center gần người dùng (vd Hong Kong) → OpenAI
trả `403 unsupported_country_region_territory`. Vercel Serverless Function chạy ở **region
cố định** (mặc định `iad1` = Mỹ, vùng OpenAI hỗ trợ) → egress luôn hợp lệ.

Logic giống hệt bản Cloudflare: verify Google ID token (chữ ký RS256 + claims) rồi mới
gắn `OPENAI_API_KEY` (env của Vercel) và forward sang OpenAI. Endpoint: `POST /api/chat`.

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
# (tuỳ chọn) vercel env add ALLOWED_ORIGIN production   # mặc định https://drjoy-toshi-tuan.github.io
# (tuỳ chọn) vercel env add ALLOWED_DOMAIN production   # mặc định drjoy.jp
```

Rồi deploy production:

```bash
vercel --prod            # → in ra URL https://scenario-ai-proxy-xxxx.vercel.app
```

> Cũng có thể đặt env ở **Vercel Dashboard → Project → Settings → Environment Variables**
> (nhớ chọn Environment = Production) rồi Redeploy.

## Endpoint dùng cho app

`VITE_AI_PROXY_URL` = `https://<project>.vercel.app/api/chat`  ← **có `/api/chat`**.

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
| `OPENAI_API_KEY` | **secret** | Key OpenAI. |
| `GOOGLE_CLIENT_ID` | plain | Check claim `aud`. |
| `ALLOWED_ORIGIN` | plain (tuỳ chọn) | CORS origin, mặc định GitHub Pages. |
| `ALLOWED_DOMAIN` | plain (tuỳ chọn) | Domain Workspace, mặc định `drjoy.jp`. |
