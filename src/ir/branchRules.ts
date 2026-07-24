import type { NodeType } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Luật nhánh RA của node — SOURCE OF TRUTH THUẦN ở tầng ir/ (để validate.ts test
// độc lập, không phải import ngược lên ui/). Bản render/label ở ui/nodeSchema.ts
// PHẢI khớp bộ này; có test đối chiếu (branchRules.test.ts) chống lệch.
//
// Hệ thống đánh giá điều kiện nhánh TỪ TRÊN xuống DƯỚI:
//   - FAILED  = nhóm kết quả lỗi/không có dữ liệu (TIMEOUT|ERROR|NO_RESULT|INVALID).
//   - SUCCESS = nhánh catch-all cuối (.*).
// ─────────────────────────────────────────────────────────────────────────────

export const FAILED_HANDLE = 'failed';
export const DEFAULT_HANDLE = 'default';

export const FAILED_REGEX = 'TIMEOUT|ERROR|NO_RESULT|INVALID';
export const SUCCESS_REGEX = '.*';

// Node type có bộ nhánh RA CỐ ĐỊNH và BẮT BUỘC nối đủ các handle này.
// (interaction/openai/faq/transfer cần CẢ failed LẪN default — đây chính là luật
// "phải nối dây 100%" mà AI hay quên nhánh failed.)
export const FIXED_REQUIRED_HANDLES: Readonly<Partial<Record<NodeType, readonly string[]>>> = {
  start: [DEFAULT_HANDLE],
  announce: [DEFAULT_HANDLE],
  save: [DEFAULT_HANDLE],
  interaction: [FAILED_HANDLE, DEFAULT_HANDLE],
  openai: [FAILED_HANDLE, DEFAULT_HANDLE],
  faq: [FAILED_HANDLE, DEFAULT_HANDLE],
  transfer: [FAILED_HANDLE, DEFAULT_HANDLE],
};

// Node type nhánh ĐỘNG: handle bắt buộc = các nhánh trong data.branches (do người
// dùng/module định nghĩa), không cố định.
export const EDITABLE_BRANCH_TYPES: readonly NodeType[] = [
  'nexus',
  'logic',
  'jump',
  'classifier',
  'normalization',
];

// hangup: KHÔNG có nhánh ra (không nằm ở cả 2 nhóm trên).
