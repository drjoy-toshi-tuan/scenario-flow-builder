import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// Toast tối giản: 1 thông báo nổi, bán trong suốt, TỰ biến mất và KHÔNG chặn thao
// tác (component render với pointer-events: none). `token` tăng mỗi lần show để
// khởi động lại animation dù message trùng nội dung.
// ─────────────────────────────────────────────────────────────────────────────

interface ToastState {
  message: string | null;
  token: number;
  show: (message: string) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  token: 0,
  show: (message) => set((s) => ({ message, token: s.token + 1 })),
  hide: () => set({ message: null }),
}));
