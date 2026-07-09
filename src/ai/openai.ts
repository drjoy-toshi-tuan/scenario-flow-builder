import { getOpenAiKey, OPENAI_API_URL, OPENAI_MODEL } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// Client OpenAI Chat Completions (thuần fetch — không thêm SDK). Trả về nội dung
// message đầu tiên. Lỗi phân loại bằng AiError.code để UI ánh xạ i18n.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly code: 'no-key' | 'http' | 'network' | 'empty',
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
  const key = getOpenAiKey();
  if (!key) throw new AiError('OpenAI API key chưa được cấu hình.', 'no-key');

  const payload: Record<string, unknown> = { model: OPENAI_MODEL, messages };
  if (!isReasoningModel(OPENAI_MODEL)) payload.temperature = 0.2;

  let res: Response;
  try {
    res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AiError('Không kết nối được OpenAI.', 'network');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      // ignore
    }
    throw new AiError(detail || `OpenAI API lỗi (${res.status}).`, 'http');
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) throw new AiError('OpenAI trả về nội dung rỗng.', 'empty');
  return content;
}

// Bỏ rào code markdown (```js … ```) nếu model vẫn trả kèm — chỉ lấy phần ruột.
export function stripCodeFence(text: string): string {
  const m = /^\s*```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return m ? m[1] : text;
}
