import { AI_PROXY_URL, OPENAI_MODEL } from './config';
import { getStoredIdToken } from '../auth/session';

// ─────────────────────────────────────────────────────────────────────────────
// Client gọi AI qua PROXY serverless (Vercel) — key OpenAI nằm ở server, KHÔNG ở
// client. Gửi kèm ID token Google (Authorization: Bearer) để proxy xác thực. Trả
// về nội dung message đầu tiên. Lỗi phân loại bằng AiError.code để UI ánh xạ i18n.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly code: 'no-config' | 'no-auth' | 'unauthorized' | 'http' | 'network' | 'empty',
  ) {
    super(message);
    this.name = 'AiError';
  }
}

// Model dòng reasoning (gpt-5*, o1/o3/o4…) KHÔNG nhận `temperature` tuỳ chỉnh
// (chỉ chấp nhận mặc định) — gửi vào sẽ bị API từ chối. Các model này tự "suy
// nghĩ" nên bỏ temperature; các model thường (gpt-4o/4.1) vẫn set 0.2 cho ổn định.
function isReasoningModel(model: string): boolean {
  return /^o\d/.test(model) || /^gpt-5/.test(model);
}

// Tuỳ chọn cho 1 lời gọi:
//   - signal: AbortSignal để DỪNG giữa chừng (nút "Dừng" của AI Chat).
//   - json: true -> yêu cầu model trả JSON object (response_format) — dùng cho edit-ops.
export interface ChatOptions {
  signal?: AbortSignal;
  json?: boolean;
}

export async function chatComplete(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if (!AI_PROXY_URL) throw new AiError('AI proxy chưa được cấu hình.', 'no-config');
  const idToken = getStoredIdToken();
  if (!idToken) throw new AiError('Chưa đăng nhập — không thể gọi AI.', 'no-auth');

  const payload: Record<string, unknown> = { model: OPENAI_MODEL, messages };
  if (!isReasoningModel(OPENAI_MODEL)) payload.temperature = 0.2;
  if (opts.json) payload.response_format = { type: 'json_object' };

  let res: Response;
  try {
    res = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      signal: opts.signal,
    });
  } catch (e) {
    // Người dùng bấm "Dừng" -> AbortError: ném lại để caller phân biệt (không phải lỗi mạng).
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new AiError('Không kết nối được AI proxy.', 'network');
  }
  // 401: proxy từ chối token (thường do ID token Google hết hạn ~1 giờ) — mời đăng nhập lại.
  if (res.status === 401) {
    throw new AiError('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để dùng AI.', 'unauthorized');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      // ignore
    }
    throw new AiError(detail || `AI proxy lỗi (${res.status}).`, 'http');
  }
  // Proxy forward nguyên response OpenAI Chat Completions.
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) throw new AiError('AI trả về nội dung rỗng.', 'empty');
  return content;
}

// Bỏ rào code markdown (```js … ```) nếu model vẫn trả kèm — chỉ lấy phần ruột.
export function stripCodeFence(text: string): string {
  const m = /^\s*```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return m ? m[1] : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// chatRaw — gọi proxy cho TOOL-CALLING (Option 3). Khác chatComplete: gửi kèm
// `tools` và trả về NGUYÊN message (content + tool_calls + raw) để caller chạy vòng
// lặp gọi tool. messages là mảng message OpenAI thô (gồm cả role 'tool').
// ─────────────────────────────────────────────────────────────────────────────

export interface RawToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string (tham số tool)
}

export interface RawAssistantMessage {
  content: string;
  toolCalls: RawToolCall[];
  raw: unknown; // message assistant nguyên bản — nối lại vào messages ở lượt sau
}

export async function chatRaw(
  messages: unknown[],
  opts: { tools?: unknown[]; signal?: AbortSignal } = {},
): Promise<RawAssistantMessage> {
  if (!AI_PROXY_URL) throw new AiError('AI proxy chưa được cấu hình.', 'no-config');
  const idToken = getStoredIdToken();
  if (!idToken) throw new AiError('Chưa đăng nhập — không thể gọi AI.', 'no-auth');

  const payload: Record<string, unknown> = { model: OPENAI_MODEL, messages };
  if (!isReasoningModel(OPENAI_MODEL)) payload.temperature = 0.2;
  if (opts.tools && opts.tools.length) {
    payload.tools = opts.tools;
    payload.tool_choice = 'auto';
  }

  let res: Response;
  try {
    res = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new AiError('Không kết nối được AI proxy.', 'network');
  }
  if (res.status === 401) {
    throw new AiError('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để dùng AI.', 'unauthorized');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      // ignore
    }
    throw new AiError(detail || `AI proxy lỗi (${res.status}).`, 'http');
  }
  const body = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
      };
    }>;
  };
  const msg = body.choices?.[0]?.message;
  const toolCalls: RawToolCall[] = (msg?.tool_calls ?? []).map((c) => ({
    id: c.id,
    name: c.function?.name ?? '',
    arguments: c.function?.arguments ?? '{}',
  }));
  return { content: msg?.content ?? '', toolCalls, raw: msg ?? { role: 'assistant', content: '' } };
}
