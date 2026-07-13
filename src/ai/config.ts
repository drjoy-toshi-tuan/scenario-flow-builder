// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình client cho tính năng AI ("AIで生成・修正" + giải thích code).
//
// Client KHÔNG còn giữ API key OpenAI. Mọi lời gọi đi qua một PROXY (Cloudflare
// Worker) giữ key ở phía server và verify ID token Google trước khi forward sang
// OpenAI. Xem proxy/README.md để dựng proxy.
//
//   - VITE_AI_PROXY_URL: URL của Worker proxy (BẮT BUỘC để bật AI). KHÔNG phải
//     secret — an toàn để công khai trong bundle.
//   - VITE_OPENAI_MODEL: model OpenAI (client gửi kèm; proxy forward). Mặc định gpt-5.1.
// ─────────────────────────────────────────────────────────────────────────────

export const AI_PROXY_URL = (import.meta.env.VITE_AI_PROXY_URL as string | undefined)?.trim() || '';

// Model mặc định gpt-5.1 (reasoning model nên client tự bỏ `temperature` — xem
// openai.ts). Đổi qua env VITE_OPENAI_MODEL (vd 'gpt-5-mini' rẻ hơn, 'gpt-4.1', 'gpt-4o').
export const OPENAI_MODEL = (import.meta.env.VITE_OPENAI_MODEL as string | undefined)?.trim() || 'gpt-5.1';

// AI khả dụng khi đã cấu hình URL proxy.
export function isAiConfigured(): boolean {
  return AI_PROXY_URL.length > 0;
}
