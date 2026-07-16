// Vercel Serverless Function (Node runtime) — proxy OpenAI có xác thực Google ID token.
//
// Vì sao Vercel thay vì Cloudflare Worker? Cloudflare Worker chạy ở data center gần
// người dùng (vd Hong Kong) → OpenAI chặn vùng (403 unsupported_country). Vercel
// Serverless Function chạy ở region cố định (mặc định iad1 = Mỹ, vùng OpenAI hỗ trợ),
// nên egress luôn từ vùng hợp lệ.
//
// Env cần đặt trên Vercel (Project → Settings → Environment Variables):
//   - OPENAI_API_KEY   (SECRET) — key OpenAI.
//   - GOOGLE_CLIENT_ID          — Client ID Google (check claim `aud`).
//   - (tuỳ chọn) ALLOWED_ORIGIN, ALLOWED_DOMAIN — có default trong lib/google-auth.js.

import { applyCors, bearerToken, jsonBody, verifyGoogleToken } from '../lib/google-auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: { message: 'Missing token' } });

  let claims = null;
  try {
    claims = await verifyGoogleToken(token);
  } catch {
    claims = null;
  }
  if (!claims) return res.status(401).json({ error: { message: 'Unauthorized' } });

  const payload = jsonBody(req);
  if (!payload) return res.status(400).json({ error: { message: 'Bad JSON' } });

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await openaiRes.text();
  res.status(openaiRes.status);
  res.setHeader('Content-Type', openaiRes.headers.get('content-type') || 'application/json');
  return res.send(text);
}
