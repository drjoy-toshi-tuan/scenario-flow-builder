// OpenAI proxy có xác thực Google ID token (chạy trên Cloudflare Workers).
//
// Mục đích: KEY OPENAI KHÔNG NẰM Ở CLIENT NỮA. Trình duyệt gọi Worker này kèm
// Google ID token (Authorization: Bearer <id_token>); Worker verify token rồi
// mới gắn OPENAI_API_KEY (secret của Worker) và forward sang OpenAI.
//
// Biến cần cấu hình (xem wrangler.toml + `wrangler secret put`):
//   - env.OPENAI_API_KEY   (SECRET) — key OpenAI, nạp bằng `wrangler secret put`.
//   - env.GOOGLE_CLIENT_ID (var)    — Client ID Google (không phải secret), để check `aud`.
//   - env.ALLOWED_DOMAIN   (var)    — domain Workspace được phép (vd "drjoy.jp").
//   - env.ALLOWED_ORIGIN   (var)    — origin GitHub Pages, cho CORS.

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ALLOWED_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const CLOCK_SKEW = 60; // giây

let jwksCache = { keys: null, exp: 0 }; // cache khoá công khai Google (best-effort giữa các request)

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
const b64urlToString = (s) => new TextDecoder().decode(b64urlToBytes(s));

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
async function verifyGoogleToken(token, env) {
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
  if (payload.aud !== env.GOOGLE_CLIENT_ID) return null;
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW < now) return null;
  if (payload.hd !== env.ALLOWED_DOMAIN) return null;
  if (!email.endsWith('@' + env.ALLOWED_DOMAIN.toLowerCase())) return null;
  if (payload.email_verified !== true) return null;
  if (!payload.sub) return null;
  return payload;
}

const corsHeaders = (env) => ({
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const json = (obj, status, cors) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: { message: 'Method Not Allowed' } }, 405, cors);

    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return json({ error: { message: 'Missing token' } }, 401, cors);

    let claims = null;
    try {
      claims = await verifyGoogleToken(token, env);
    } catch {
      claims = null;
    }
    if (!claims) return json({ error: { message: 'Unauthorized' } }, 401, cors);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: { message: 'Bad JSON' } }, 400, cors);
    }

    // (tùy chọn) ép model ở server để client không tự chọn model đắt:
    // if (env.OPENAI_MODEL) payload.model = env.OPENAI_MODEL;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const headers = new Headers(cors);
    headers.set('Content-Type', openaiRes.headers.get('Content-Type') || 'application/json');
    return new Response(openaiRes.body, { status: openaiRes.status, headers });
  },
};
