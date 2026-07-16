// Vercel Serverless Function — cấp & GIA HẠN NGẦM access token Google Drive,
// để frontend KHÔNG phải mở popup GIS mỗi giờ (xem src/drive/DriveTokenKeeper.tsx).
//
// Mô hình (authorization code flow + refresh token, backend stateless):
//
//   1) KẾT NỐI (1 lần / tài khoản): frontend mở popup GIS auth-code flow → nhận
//      `code`, gửi lên đây kèm ID token Google (Authorization: Bearer — chỉ người
//      trong ALLOWED_DOMAIN mới tạo được kết nối). Server đổi code lấy
//      access_token + refresh_token bằng GOOGLE_CLIENT_SECRET.
//   2) refresh_token KHÔNG trả thô về browser. Server NIÊM PHONG nó bằng
//      AES-256-GCM (key = SHA-256(DRIVE_TOKEN_SECRET), chỉ tồn tại trong env
//      Vercel) thành `refresh_blob` — browser giữ blob này (localStorage) nhưng
//      không giải mã được, không dùng thẳng với Google được.
//   3) GIA HẠN: frontend gửi lại `refresh_blob` (không cần ID token — ID token
//      cũng chỉ sống ~1h, đòi nó thì lại chết đúng bệnh cũ). Server giải mã, gọi
//      Google refresh, trả access_token mới + blob mới (iat trượt).
//
// Vì backend stateless (không database), blob chính là "kho" refresh token —
// đánh đổi: kẻ trộm được blob từ localStorage (XSS/máy bị chiếm) có thể xin
// access token QUA ENDPOINT NÀY cho tới khi quyền bị thu hồi / blob quá hạn.
// Giảm nhẹ: blob hết hạn cứng sau BLOB_MAX_AGE_DAYS không dùng; thu hồi được
// ngay bằng cách rút quyền app tại https://myaccount.google.com/permissions
// hoặc đổi DRIVE_TOKEN_SECRET (vô hiệu MỌI blob).
//
// Env cần đặt thêm trên Vercel (ngoài GOOGLE_CLIENT_ID đã có):
//   - GOOGLE_CLIENT_SECRET (SECRET) — client secret OAuth (Web application).
//   - DRIVE_TOKEN_SECRET   (SECRET) — chuỗi ngẫu nhiên dài ≥32 ký tự, tự sinh
//     (vd `openssl rand -hex 32`). Đổi nó = buộc mọi người kết nối lại.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  ALLOWED_DOMAIN,
  applyCors,
  b64urlToString,
  bearerToken,
  GOOGLE_CLIENT_ID,
  jsonBody,
  verifyGoogleToken,
} from '../lib/google-auth.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

// Blob không được gia hạn (không ai dùng) quá số ngày này thì hết hạn cứng —
// mỗi lần refresh thành công blob được niêm phong lại với iat mới (cửa sổ trượt).
const BLOB_MAX_AGE_DAYS = 90;

// Nhãn phiên bản định dạng blob — đưa vào AAD của GCM: đổi format thì blob cũ
// tự thành không hợp lệ thay vì giải mã sai kiểu.
const BLOB_AAD = 'drive-refresh-v1';

function sealKey() {
  const secret = process.env.DRIVE_TOKEN_SECRET || '';
  if (secret.length < 32) return null; // chưa cấu hình / quá yếu
  return createHash('sha256').update(secret, 'utf8').digest();
}

// Niêm phong object JSON -> chuỗi base64url(iv | authTag | ciphertext).
function seal(key, obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(BLOB_AAD));
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

// Giải niêm phong; null nếu blob hỏng / bị sửa / sai key.
function unseal(key, blob) {
  try {
    const raw = Buffer.from(blob, 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(BLOB_AAD));
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    const obj = JSON.parse(text);
    return obj && typeof obj.rt === 'string' && typeof obj.iat === 'number' ? obj : null;
  } catch {
    return null;
  }
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Gọi Google token endpoint (form-encoded). Trả { ok, status, body }.
async function googleToken(params) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

// ── Đổi authorization code lấy token (bước KẾT NỐI, cần ID token hợp lệ) ──
async function handleExchange(req, res, key, code) {
  const idToken = bearerToken(req);
  if (!idToken) return fail(res, 401, 'auth', 'Missing token');
  let claims = null;
  try {
    claims = await verifyGoogleToken(idToken);
  } catch {
    claims = null;
  }
  if (!claims) return fail(res, 401, 'auth', 'Unauthorized');

  const { ok, body } = await googleToken({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    // GIS popup code flow (ux_mode=popup) quy ước redirect_uri cố định 'postmessage'.
    redirect_uri: 'postmessage',
    grant_type: 'authorization_code',
  });
  if (!ok || !body?.access_token) {
    return fail(res, 502, 'exchange', `Google code exchange failed: ${body?.error || 'unknown'}`);
  }
  if (!String(body.scope || '').includes(DRIVE_SCOPE)) {
    return fail(res, 409, 'scope', 'Drive scope was not granted');
  }
  if (!body.refresh_token) {
    // Hiếm (GIS popup code flow luôn hiện consent → luôn kèm refresh_token),
    // nhưng nếu xảy ra thì báo rõ thay vì trả kết nối "một giờ rồi chết".
    return fail(res, 409, 'no_refresh_token', 'Google did not return a refresh token');
  }

  // Tài khoản được chọn trong popup Drive phải LÀ tài khoản đang đăng nhập app
  // (scope xin kèm openid email nên exchange trả id_token — đến thẳng từ Google
  // qua TLS, không cần verify chữ ký, chỉ đọc claims).
  let driveEmail = '';
  try {
    driveEmail = String(JSON.parse(b64urlToString(body.id_token.split('.')[1])).email || '').toLowerCase();
  } catch {
    driveEmail = '';
  }
  const appEmail = String(claims.email || '').toLowerCase();
  if (!driveEmail || driveEmail !== appEmail) {
    return fail(res, 409, 'mismatch', 'Drive account does not match the signed-in account');
  }

  const refreshBlob = seal(key, {
    rt: body.refresh_token,
    sub: claims.sub,
    email: appEmail,
    iat: Math.floor(Date.now() / 1000),
  });
  return res.status(200).json({
    access_token: body.access_token,
    expires_in: body.expires_in,
    refresh_blob: refreshBlob,
  });
}

// ── Gia hạn ngầm bằng blob (không cần ID token — xem ghi chú đầu file) ──
async function handleRefresh(req, res, key, blob) {
  const sealed = unseal(key, blob);
  if (!sealed) return fail(res, 401, 'revoked', 'Invalid refresh blob');
  const ageDays = (Date.now() / 1000 - sealed.iat) / 86400;
  if (ageDays > BLOB_MAX_AGE_DAYS || ageDays < -1) {
    return fail(res, 401, 'revoked', 'Refresh blob expired');
  }

  const { ok, body } = await googleToken({
    refresh_token: sealed.rt,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
  });
  if (!ok || !body?.access_token) {
    // invalid_grant = quyền đã bị thu hồi / refresh token chết → client phải
    // kết nối lại từ đầu. Lỗi khác (mạng, 5xx của Google) → thử lại sau được.
    if (body?.error === 'invalid_grant') return fail(res, 401, 'revoked', 'Refresh token revoked');
    return fail(res, 502, 'exchange', `Google refresh failed: ${body?.error || 'unknown'}`);
  }

  // Niêm phong lại với iat mới (cửa sổ trượt); Google đôi khi phát refresh_token mới.
  const refreshBlob = seal(key, {
    rt: body.refresh_token || sealed.rt,
    sub: sealed.sub,
    email: sealed.email,
    iat: Math.floor(Date.now() / 1000),
  });
  return res.status(200).json({
    access_token: body.access_token,
    expires_in: body.expires_in,
    refresh_blob: refreshBlob,
  });
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const key = sealKey();
  if (!key || !process.env.GOOGLE_CLIENT_SECRET) {
    return fail(res, 500, 'config', 'DRIVE_TOKEN_SECRET / GOOGLE_CLIENT_SECRET not configured');
  }

  const payload = jsonBody(req);
  if (!payload) return fail(res, 400, 'bad_json', 'Bad JSON');

  if (typeof payload.code === 'string' && payload.code) {
    return handleExchange(req, res, key, payload.code);
  }
  if (typeof payload.refresh_blob === 'string' && payload.refresh_blob) {
    return handleRefresh(req, res, key, payload.refresh_blob);
  }
  return fail(res, 400, 'bad_request', 'Expected `code` or `refresh_blob`');
}
