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

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const key = getOpenAiKey();
  if (!key) throw new AiError('OpenAI API key chưa được cấu hình.', 'no-key');

  let res: Response;
  try {
    res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.2,
      }),
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
