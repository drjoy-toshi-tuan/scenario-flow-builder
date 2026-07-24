// ─────────────────────────────────────────────────────────────────────────────
// Prompt cho AI Chat (trợ lý sửa flow) — TOOL-CALLING, bối cảnh THEO TỪNG MÀN.
// Bố trí message để tận dụng prompt caching:
//   1) CHAT_SYSTEM_BASE — hằng chung mọi màn (prefix cache-hit toàn cục).
//   2) spec — hằng theo màn (cache-hit khi ở cùng màn).
//   3) context — dữ liệu động của màn.
// spec/context/tool do ai/screens.ts dựng riêng cho mỗi màn (spec khác nhau!).
// ─────────────────────────────────────────────────────────────────────────────

export const CHAT_SYSTEM_BASE = `You are an assistant embedded in a tool that visualizes and edits "AI電話" (Brekeke-based) phone-call scenarios.
You help with the SCREEN the user currently has open. Different screens manage different data and follow different specs — ALWAYS obey the SCREEN SPEC and CONTEXT given below for the current screen; never assume another screen's rules or data.
You make changes ONLY by calling the tools provided for the current screen (there may be none). Tools only QUEUE changes for the user to review — nothing is applied until the user approves — so it is safe to call them.
- Call as many tools as needed to fully satisfy the request; decompose multi-step requests instead of stopping after one.
- If the current screen has no tool for what the user wants, do not pretend to change it — briefly explain and, when relevant, point to the screen/tab that can.
- After acting, reply with a SHORT summary in the SAME language the user used. No JSON, no code.`;

// Dựng mảng message thô gửi proxy theo bối cảnh màn hiện tại.
// history: các lượt user/assistant trước (assistant = phần tóm tắt text).
export function buildChatMessages(
  spec: string,
  context: string,
  screenName: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): unknown[] {
  return [
    { role: 'system', content: CHAT_SYSTEM_BASE },
    { role: 'system', content: spec },
    { role: 'system', content: `CURRENT SCREEN: ${screenName}\n\n${context}` },
    ...history,
  ];
}
