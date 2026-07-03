// ─────────────────────────────────────────────────────────────────────────────
// Kiểm tra cú pháp script (JavaScript ES2021+) — KHÔNG thêm thư viện.
// Kỹ thuật: biên dịch chuỗi như THÂN của một hàm bằng `new Function(code)`.
//   - Chỉ PARSE, KHÔNG chạy -> an toàn, phát hiện lỗi cú pháp.
//   - Cho phép `return` ở cấp cao nhất (đúng ngữ cảnh script Brekeke).
// Lỗi runtime (biến chưa khai báo…) KHÔNG bị bắt ở đây — chỉ lỗi cú pháp.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScriptError {
  message: string;
  line?: number; // 1-based, best-effort (rút từ stack V8 nếu có)
}

// Rút số dòng lỗi từ stack. V8 bọc code thành `function anonymous(\n) {\n<body>\n}`
// nên dòng thân +2 so với dòng gốc -> trừ 2 để ra dòng người dùng thấy.
function extractLine(err: unknown): number | undefined {
  if (!(err instanceof Error) || typeof err.stack !== 'string') return undefined;
  const m = /<anonymous>:(\d+):\d+/.exec(err.stack);
  if (!m) return undefined;
  const line = Number(m[1]) - 2;
  return Number.isFinite(line) && line > 0 ? line : undefined;
}

export function lintScript(code: string): ScriptError | null {
  if (!code.trim()) return null; // rỗng -> không coi là lỗi
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function(code);
    return null;
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { message: err.message, line: extractLine(err) };
    }
    return null; // không phải lỗi cú pháp -> bỏ qua
  }
}
