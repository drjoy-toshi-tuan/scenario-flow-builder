// ─────────────────────────────────────────────────────────────────────────────
// Knowledge cho AI sinh code/prompt chuẩn Brekeke. Đây là chỗ DÁN THÊM tài liệu:
//   - BREKEKE_SCRIPT_KNOWLEDGE: dán các script mẫu chuẩn (đã chạy tốt trên môi
//     trường Brekeke) để AI bám theo phong cách/API thật, tránh sinh code lỗi.
//   - OPENAI_PROMPT_KNOWLEDGE: dán các prompt mẫu của node OpenAI (từ những
//     project chuyên gen prompt) để AI học cấu trúc prompt chuẩn.
// Nội dung dưới đây là khung tối thiểu — càng nhiều mẫu thật càng chính xác.
// ─────────────────────────────────────────────────────────────────────────────

export const BREKEKE_SCRIPT_KNOWLEDGE = `
## Môi trường thực thi
- Script chạy trong node Logic (module Script) của hệ thống AI電話 dựa trên Brekeke IVR.
- Ngôn ngữ: JavaScript ES2021+ chạy như THÂN của một hàm (được phép \`return\` ở cấp cao nhất).
- Giá trị \`return\` (chuỗi) sẽ được so khớp với các nhánh regex ở Branch Settings của node
  để quyết định rẽ nhánh tiếp theo. Ví dụ: \`return 'NON_BUSINESS_DAY';\` khớp nhánh ^NON_BUSINESS_DAY$.
- Input thường là câu trả lời (đã STT) của người gọi cho câu hỏi announce đứng trước node.

## Quy tắc sinh code
- Chỉ trả về CODE THUẦN (không markdown, không giải thích, không rào \`\`\`).
- Code phải parse được (không lỗi cú pháp), ngắn gọn, có comment tiếng Nhật/Việt khi cần.
- Không dùng API trình duyệt (window/document) hay Node.js (require/fs).

## Script mẫu (DÁN THÊM các mẫu chuẩn vào đây)
(chưa có mẫu — sẽ được bổ sung)
`;

export const OPENAI_PROMPT_KNOWLEDGE = `
## Bối cảnh node OpenAI
- Prompt chạy trong node OpenAI của flow AI電話: nhận câu trả lời (đã STT) của người gọi
  và phải phân tích/chuẩn hoá nó theo yêu cầu, output khớp với các nhánh của node.
- Prompt nên: nêu vai trò, mô tả input, liệt kê các giá trị output hợp lệ, ràng buộc
  "chỉ trả về 1 trong các giá trị đó, không thêm chữ nào khác".

## Prompt mẫu (DÁN THÊM các mẫu chuẩn vào đây)
(chưa có mẫu — sẽ được bổ sung)
`;
