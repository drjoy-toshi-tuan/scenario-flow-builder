import { useEffect } from 'react';
import { useToast } from './toast';
import { Icon } from './icons';

// Hiển thị toast hiện tại (nếu có), tự ẩn sau ~1.8s. Đặt 1 lần ở gốc app.
// pointer-events: none (trong CSS .bk-toast) → không ảnh hưởng thao tác nào.
export function Toast() {
  const message = useToast((s) => s.message);
  const token = useToast((s) => s.token);
  const hide = useToast((s) => s.hide);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hide, 1800);
    return () => clearTimeout(timer);
  }, [token, message, hide]);

  if (!message) return null;
  return (
    <div key={token} className="bk-toast" role="status" aria-live="polite">
      <Icon icon="lucide:circle-check" width={16} height={16} className="text-emerald-400" />
      <span>{message}</span>
    </div>
  );
}
