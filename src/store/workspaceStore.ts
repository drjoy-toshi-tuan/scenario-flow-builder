import { create } from 'zustand';
import type { Department } from '../drive/permissions';

// ─────────────────────────────────────────────────────────────────────────────
// Chế độ làm việc theo BỘ PHẬN — quyết định biến thể UI của canvas:
//   ts: màn kỹ thuật đầy đủ (mặc định khi chưa gán bộ phận)
//   cs: màn thiết kế diagram tối giản (node lùn, palette 4 loại node…)
//
// DEPARTMENT LÀ BẮT BUỘC: sau khi đăng nhập, bộ phận của user trong access-log
// quyết định màn — và KHOÁ luôn màn đó. User KHÔNG được nhảy sang màn khác, kể cả
// gõ tay URL hash (#/cs | #/ts): hash sai bộ phận sẽ tự động ghi đè về đúng bộ phận.
//
// Trước khi biết bộ phận (đang đăng nhập / user chưa được gán bộ phận, vd owner),
// mode tạm suy từ hash URL; khi chưa khoá vẫn đổi theo hash được. Chỉ khi
// applyDepartment() được gọi với 1 bộ phận thì màn mới bị khoá cứng.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceMode = Department; // 'cs' | 'ts'

function modeFromHash(): WorkspaceMode | null {
  const h = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  return h === 'cs' || h === 'ts' ? h : null;
}

function writeHash(mode: WorkspaceMode) {
  // replaceState thay vì gán location.hash: không rải lịch sử back/forward
  // (và không phát lại sự kiện hashchange -> không lặp vô hạn).
  history.replaceState(null, '', `#/${mode}`);
}

interface WorkspaceState {
  mode: WorkspaceMode;
  // Bộ phận bị KHOÁ của user (từ access-log). null = chưa biết / user không được gán
  // bộ phận (vd owner) -> không khoá, tự do đổi theo hash.
  locked: Department | null;
  // Đổi màn chủ động (nếu có UI/URL) — bị chặn nếu đã khoá vào bộ phận khác.
  setMode: (mode: WorkspaceMode) => void;
  // Suy từ access-log sau đăng nhập — KHOÁ cứng vào bộ phận này (ghi đè hash).
  applyDepartment: (department: Department) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  mode: modeFromHash() ?? 'ts',
  locked: null,
  setMode: (mode) => {
    const { locked } = get();
    // Đã khoá bộ phận -> không cho rời khỏi bộ phận đó (kéo về đúng màn).
    const next = locked ?? mode;
    writeHash(next);
    set({ mode: next });
  },
  applyDepartment: (department) => {
    // Bộ phận là bắt buộc: khoá cứng + ghi đè hash về đúng màn dù URL đang trỏ đâu.
    writeHash(department);
    set({ mode: department, locked: department });
  },
}));

// Người dùng sửa hash trực tiếp trên URL:
//   - Đã khoá bộ phận -> hash sai tự nhảy về đúng bộ phận (không cho vượt màn).
//   - Chưa khoá -> đồng bộ mode theo hash như bình thường.
window.addEventListener('hashchange', () => {
  const { locked, mode } = useWorkspaceStore.getState();
  const fromHash = modeFromHash();
  if (locked) {
    if (fromHash !== locked) writeHash(locked);
    if (mode !== locked) useWorkspaceStore.setState({ mode: locked });
    return;
  }
  if (fromHash && fromHash !== mode) {
    useWorkspaceStore.setState({ mode: fromHash });
  }
});
