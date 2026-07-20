import { useT } from './i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Stamp cho Status/SMS flag KẾ THỪA từ node phía trên (tự fill khi node chưa tự
// đặt flag). Nhãn theo ngôn ngữ (t('flagInherit')): VI "Carried", JA "継続" — thay
// cho chữ trơn "Kế thừa" khó hiểu. Dùng ở preview node, panel setting và tab
// Announce List — nằm INLINE trong mặt pulldown / dòng option (không phủ absolute
// lên trên để không che viền pulldown).
// Màu tím THỐNG NHẤT mọi màn — phân biệt với chip Status (xanh ngọc) / SMS Flag (vàng).
// ─────────────────────────────────────────────────────────────────────────────

export function FlagInheritStamp({ className = '' }: { className?: string }) {
  const t = useT();
  return (
    <span
      title={t('flagInheritHint')}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded px-1.5 py-px text-[10px] font-bold leading-4 tracking-wide bg-violet-400/20 text-violet-600 dark:bg-violet-400/25 dark:text-violet-300 ${className}`}
    >
      {t('flagInherit')}
    </span>
  );
}
