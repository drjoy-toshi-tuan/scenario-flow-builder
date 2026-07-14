import { BrekekeLogo } from './BrekekeLogo';

// ─────────────────────────────────────────────────────────────────────────────
// Thương hiệu: logo ngọn lửa/dòng chảy (2 tông cam, bake sẵn) + wordmark
// "Scenario Flow Builder" (font Space Grotesk, màu --bk-text → trắng ở dark mode).
// Dùng chung cho màn login (cỡ lớn) và header màn Quản lý flow (cỡ gọn) để nhận
// diện đồng bộ.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  logoClass?: string;
  textClass?: string;
  className?: string;
}

export function BrandLockup({
  logoClass = 'h-9 w-9',
  textClass = 'text-2xl',
  className = '',
}: Props) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrekekeLogo className={`${logoClass} shrink-0`} />
      <span
        className={`${textClass} font-semibold tracking-tight text-[var(--bk-text)]`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Scenario Flow Builder
      </span>
    </div>
  );
}
