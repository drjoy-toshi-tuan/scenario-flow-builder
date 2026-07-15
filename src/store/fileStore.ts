import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// Trạng thái "file đang mở" — điều hướng giữa màn quản lý flow (Drive) và canvas.
// Có file đang mở -> vào canvas; không có -> ở màn quản lý flow.
// Flow lưu trên Google Drive theo cây 施設名/シナリオ名/<シナリオ名>_V{N}.yaml.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenFile {
  path: string; // "施設名/シナリオ名" — chỉ để hiển thị
  name: string; // <シナリオ名>_V{N}.yaml
  driveFileId: string; // id file version đang mở trên Drive
  driveFolderId: string; // id folder シナリオ chứa các version (tạo version mới vào đây)
  version: number; // số version đang mở (V{N})
}

interface FileState {
  current: OpenFile | null;
  openFile: (file: OpenFile) => void;
  closeFile: () => void; // quay lại màn quản lý flow
}

export const useFileStore = create<FileState>((set) => ({
  current: null,
  openFile: (file) => set({ current: file }),
  closeFile: () => set({ current: null }),
}));
