import { useT } from './i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Stamp cho Status/SMS flag KẾ THỪA từ node phía trên (tự fill khi node chưa tự
// đặt flag). Nhãn theo ngôn ngữ (t('flagInherit')): VI "Carried", JA "継続" — thay
// cho chữ trơn "Kế thừa" khó hiểu. Dùng ở preview node, panel setting và tab
// Announce List — nằm INLINE trong mặt pulldown / dòng option (không phủ absolute
// lên trên để không che viền pulldown).
// Tone màu: 'violet' (mặc định) phân biệt với chip Status (xanh) / SMS Flag (vàng);
// 'cyan' = xanh ngọc (水色 đậm hơn một chút, giữ opacity) — dùng ở tab Announce List
// theo yêu cầu team CS.
// ─────────────────────────────────────────────────────────────────────────────

export type StampTone = 'violet' | 'cyan';

const TONE_CLASS: Record<StampTone, string> = {
  violet: 'bg-violet-400/20 text-violet-600 dark:bg-violet-400/25 dark:text-violet-300',
  cyan: 'bg-cyan-500/20 text-cyan-600 dark:bg-cyan-500/25 dark:text-cyan-300',
};

export function FlagInheritStamp({
  className = '',
  tone = 'violet',
}: {
  className?: string;
  tone?: StampTone;
}) {
  const t = useT();
  return (
    <span
      title={t('flagInheritHint')}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded px-1.5 py-px text-[10px] font-bold leading-4 tracking-wide ${TONE_CLASS[tone]} ${className}`}
    >
      {t('flagInherit')}
    </span>
  );
}
