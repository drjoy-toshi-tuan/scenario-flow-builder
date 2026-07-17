import { useWorkspaceStore } from '../store/workspaceStore';

// ─────────────────────────────────────────────────────────────────────────────
// Stamp bộ phận đang làm việc — hiện trên header (cạnh menu) để biết đang ở màn
// nào: CS (nền xanh blue sáng) / TS (nền cam, cùng tone logo #ff8c30). Nền đặc,
// chữ trắng bold, font geometric giống logo/wordmark (Space Grotesk; tiếng Nhật
// dùng Zen Kaku Gothic New). Dùng chung cho màn quản lý flow lẫn màn design.
// ─────────────────────────────────────────────────────────────────────────────
export function WorkspaceStamp({ className = '' }: { className?: string }) {
  const mode = useWorkspaceStore((s) => s.mode);
  const cs = mode === 'cs';
  return (
    <span
      aria-label={`${cs ? 'CS' : 'TS'} workspace`}
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase leading-5 tracking-widest text-white ${className}`}
      style={{
        background: cs ? '#3b82f6' : '#ff8c30',
        fontFamily: "'Space Grotesk', 'Zen Kaku Gothic New', sans-serif",
      }}
    >
      {cs ? 'CS' : 'TS'}
    </span>
  );
}
