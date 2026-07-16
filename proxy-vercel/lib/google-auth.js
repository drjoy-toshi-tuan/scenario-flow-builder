// Xác thực Google ID token + CORS dùng chung cho các function trong api/.
// (Tách từ api/chat.js để api/drive-token.js dùng lại — logic không đổi.)
//
// Verify chữ ký RS256 bằng JWKS của Google + siết claims (iss/aud/exp/hd/
// email_verified/sub) — bản server-side của src/auth/verifyIdToken.ts.

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ALLOWED_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const CLOCK_SKEW = 60; // giây

export const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://drjoy-toshi-tuan.github.io';
export const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'drjoy.jp';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

let jwksCache = { keys: null, exp: 0 };

export function b64urlToBytes(s) {
  return new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}
export function b64urlToString(s) {
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

// Trả payload (claims) nếu token hợp lệ, null nếu không.
export async function verifyGoogleToken(token) {
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

// Đặt header CORS chung. Trả true nếu đã trả lời xong (OPTIONS preflight /
// method sai) — handler gọi xong thấy true thì return luôn.
export function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method Not Allowed' } });
    return true;
  }
  return false;
}

// Đọc Bearer token từ header Authorization ('' nếu không có).
export function bearerToken(req) {
  const authHeader = req.headers['authorization'] || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

// Parse body JSON (Vercel tự parse khi Content-Type đúng; phòng khi là chuỗi).
// Trả null nếu JSON hỏng.
export function jsonBody(req) {
  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload && typeof payload === 'object' ? payload : null;
}
