import { AI_PROXY_URL, OPENAI_MODEL } from './config';
import { getStoredIdToken } from '../auth/session';

// ─────────────────────────────────────────────────────────────────────────────
// Client gọi AI qua PROXY (Cloudflare Worker) — key OpenAI nằm ở server, KHÔNG ở
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

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  if (!AI_PROXY_URL) throw new AiError('AI proxy chưa được cấu hình.', 'no-config');
  const idToken = getStoredIdToken();
  if (!idToken) throw new AiError('Chưa đăng nhập — không thể gọi AI.', 'no-auth');

  const payload: Record<string, unknown> = { model: OPENAI_MODEL, messages };
  if (!isReasoningModel(OPENAI_MODEL)) payload.temperature = 0.2;

  let res: Response;
  try {
    res = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
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
