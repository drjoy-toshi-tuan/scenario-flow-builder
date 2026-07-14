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
//   - (tuỳ chọn) ALLOWED_ORIGIN, ALLOWED_DOMAIN — có default bên dưới.

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ALLOWED_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const CLOCK_SKEW = 60; // giây

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://drjoy-toshi-tuan.github.io';
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'drjoy.jp';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

let jwksCache = { keys: null, exp: 0 };

function b64urlToBytes(s) {
  return new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}
function b64urlToString(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

async function getGoogleKeys() {
  const now = Date.now();
  if (jwksCache.keys && jwksCache.exp > now) return jwksCache.keys;
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error('cannot fetch google certs');
  const body = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  const ttl = m ? parseInt(m[1], 10) * 1000 : 3600 * 1000;
  jwksCache = { keys: body.keys, exp: now + ttl };
  return body.keys;
}

// Verify chữ ký RS256 + siết claims (bản server-side của src/auth/verifyIdToken.ts).
async function verifyGoogleToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = JSON.parse(b64urlToString(parts[0]));
  const payload = JSON.parse(b64urlToString(parts[1]));
  if (header.alg !== 'RS256') return null;

  const jwk = (await getGoogleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), data);
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  const email = (payload.email || '').toLowerCase();
  if (!ALLOWED_ISSUERS.includes(payload.iss)) return null;
  if (payload.aud !== GOOGLE_CLIENT_ID) return null;
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW < now) return null;
  if (payload.hd !== ALLOWED_DOMAIN) return null;
  if (!email.endsWith('@' + ALLOWED_DOMAIN.toLowerCase())) return null;
  if (payload.email_verified !== true) return null;
  if (!payload.sub) return null;
  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method Not Allowed' } });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: { message: 'Missing token' } });

  let claims = null;
  try {
    claims = await verifyGoogleToken(token);
  } catch {
    claims = null;
  }
  if (!claims) return res.status(401).json({ error: { message: 'Unauthorized' } });

  // Vercel tự parse JSON body khi Content-Type: application/json; phòng khi là chuỗi.
  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return res.status(400).json({ error: { message: 'Bad JSON' } });
    }
  }

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
