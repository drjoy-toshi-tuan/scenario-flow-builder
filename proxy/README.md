# scenario-ai-proxy — Cloudflare Worker proxy cho OpenAI

Proxy đứng trước OpenAI để **key OpenAI không còn nằm ở trình duyệt**. Trình duyệt
gọi Worker này kèm **Google ID token**; Worker verify token (chữ ký + claims) rồi
mới gắn `OPENAI_API_KEY` (secret của Worker) và forward sang OpenAI.

```
Trình duyệt ──POST + Bearer <google id_token>──► Worker ──+ OPENAI_API_KEY──► OpenAI
                                              (verify token, gắn CORS)
```

Bí mật DUY NHẤT nằm ở Cloudflare là `OPENAI_API_KEY`. `GOOGLE_CLIENT_ID` **không phải
secret** (đã công khai trong bundle app) nên để thẳng trong `wrangler.toml`.

## Yêu cầu

- Tài khoản Cloudflare (free, không cần thẻ): https://dash.cloudflare.com/sign-up
- **Node.js LTS** (khuyến nghị **v22**). ⚠ Node số lẻ (v25…) có thể làm `wrangler`/C3 lỗi
  — nếu gặp lỗi lạ, cài lại Node 22 LTS từ https://nodejs.org (chọn "LTS").

## Các bước deploy

```bash
cd proxy
npm install                 # cài wrangler (đã khai trong package.json)
npx wrangler --version      # kiểm tra wrangler chạy được

# 1) Sửa wrangler.toml: thay GOOGLE_CLIENT_ID bằng Client ID thật (giống VITE_GOOGLE_CLIENT_ID).
#    Kiểm tra ALLOWED_ORIGIN đúng origin GitHub Pages của bạn.

npx wrangler login          # mở trình duyệt → Allow
npm run secret              # = wrangler secret put OPENAI_API_KEY → dán key sk-... → Enter
npm run deploy              # = wrangler deploy → in ra URL https://scenario-ai-proxy.<subdomain>.workers.dev
```

Lấy URL vừa in ra → đặt vào biến `VITE_AI_PROXY_URL` của app (local `.env.local` và
GitHub Actions). URL này **không phải secret**, để công khai vô hại.

## Test

```bash
# Không có token → phải trả 401 (đúng = proxy đang chặn người lạ)
curl -i -X POST https://scenario-ai-proxy.<subdomain>.workers.dev -d "{}"
# → HTTP/.. 401  {"error":{"message":"Missing token"}}
```

Test thành công (có nội dung OpenAI) cần token Google thật — dễ nhất là để chính app
gọi sau khi đã nối `VITE_AI_PROXY_URL`.

## Cấu hình (wrangler.toml + secret)

| Tên | Loại | Ý nghĩa |
|-----|------|---------|
| `OPENAI_API_KEY` | **secret** (`wrangler secret put`) | Key OpenAI. Không nằm trong file, không vào git. |
| `GOOGLE_CLIENT_ID` | var | Client ID Google — check claim `aud`. Không phải secret. |
| `ALLOWED_DOMAIN` | var | Domain Workspace được phép (vd `drjoy.jp`). |
| `ALLOWED_ORIGIN` | var | Origin GitHub Pages cho CORS (chỉ origin, không kèm `/repo/`). |

## Lưu ý

- **ID token Google sống ~1 giờ**, trong khi phiên app ~12 giờ. Nếu để tab lâu > 1 giờ
  rồi mới bấm AI, proxy trả **401** (token hết hạn) → app nên bắt lỗi này và mời đăng
  nhập lại. Muốn hết vướng mốc 1 giờ thì nâng Worker để tự cấp session token riêng (12h).
- Sau khi chạy xong, **rotate key OpenAI cũ** từng nằm trong bundle public (coi như đã lộ)
  và đặt **hard spend limit** trên OpenAI.
