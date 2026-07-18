import { useWorkspaceStore } from '../store/workspaceStore';
import { useT } from './i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Stamp bộ phận đang làm việc — hiện trên header (cạnh menu) để biết đang ở màn
// nào: CS (tone xanh blue) / TS (tone cam, cùng tone logo #ff8c30). Hiện HẲN cả
// cụm "CS Working Screen"/"TS作業画面" (theo ngôn ngữ). Nền để hơi TRONG (color-mix
// với transparent) cho dịu mắt, chữ tô đúng màu bộ phận, viền mảnh cùng tông. Font
// geometric giống logo/wordmark (Space Grotesk; tiếng Nhật dùng Zen Kaku Gothic New).
// Dùng chung cho màn quản lý flow lẫn màn design.
// ─────────────────────────────────────────────────────────────────────────────
export function WorkspaceStamp({ className = '' }: { className?: string }) {
  const mode = useWorkspaceStore((s) => s.mode);
  const t = useT();
  const cs = mode === 'cs';
  const color = cs ? '#3b82f6' : '#ff8c30';
  const label = cs ? t('workScreenCs') : t('workScreenTs');
  return (
    <span
      aria-label={`${cs ? 'CS' : 'TS'} workspace`}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-2.5 py-0.5 text-xs font-bold leading-5 tracking-wide ${className}`}
      style={{
        // Nền trong nhẹ + chữ/viền cùng màu bộ phận -> cảm giác "kính màu" dễ nhìn.
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        color,
        fontFamily: "'Space Grotesk', 'Zen Kaku Gothic New', sans-serif",
      }}
    >
      {label}
    </span>
  );
}
