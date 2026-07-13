import { BrandLockup } from '../ui/BrandLockup';
import { APP_VERSION } from '../ui/appVersion';

// ─────────────────────────────────────────────────────────────────────────────
// Đầu panel menu (dropdown): thương hiệu (logo ếch + wordmark "Brekeke Flow
// Builder") + dòng phiên bản nhỏ bên dưới. Dùng chung cho 4 màn (login, canvas,
// quản lý flow, kết nối GitHub) để nhận diện đồng bộ với header các màn. Cỡ gọn
// cho vừa bề rộng panel (w-72).
// ─────────────────────────────────────────────────────────────────────────────
export function MenuBrandHeader() {
  return (
    <div className="mb-1 border-b border-[var(--bk-border)] px-2 pb-2.5 pt-1">
      <BrandLockup logoClass="h-6 w-6" textClass="text-sm" />
      {/* Phiên bản — canh lề trái theo wordmark (logo 1.5rem + gap 0.625rem). */}
      <div className="mt-1 pl-[2.125rem] text-[10px] font-medium text-[var(--bk-text-faint)]">
        Version: {APP_VERSION}
      </div>
    </div>
  );
}
