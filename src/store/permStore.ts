import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// Store nhẹ giữ danh sách admin (đọc từ access-log.json trên Drive ở màn quản lý).
// Mục đích: để bất kỳ component nào (HeaderMenu ở canvas, FileManagerMenu ở màn
// Drive) cũng suy ra được quyền của user hiện tại qua resolveRole(email, {admins})
// mà không phải kéo lại file quyền. Owner vẫn nhận diện qua email cố định nên kể
// cả khi store rỗng thì owner/user vẫn đúng.
// ─────────────────────────────────────────────────────────────────────────────

interface PermState {
  admins: string[];
  setAdmins: (admins: string[]) => void;
}

export const usePermStore = create<PermState>((set) => ({
  admins: [],
  setAdmins: (admins) => set({ admins }),
}));
