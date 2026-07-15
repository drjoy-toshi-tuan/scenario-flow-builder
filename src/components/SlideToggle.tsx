import { Icon } from '../ui/icons';

// ─────────────────────────────────────────────────────────────────────────────
// Toggle dạng gạt trái/phải (2 lựa chọn). Có 1 "thumb" trượt sang bên đang chọn.
// Dùng cho đổi theme (sun/moon) và đổi ngôn ngữ (VI/JP).
// ─────────────────────────────────────────────────────────────────────────────

interface ToggleOption {
  key: string;
  icon?: string; // tên icon Iconify (tuỳ chọn)
  label?: string; // nhãn chữ (tuỳ chọn)
}

interface SlideToggleProps {
  value: string;
  options: [ToggleOption, ToggleOption]; // đúng 2 lựa chọn: [trái, phải]
  onChange: (key: string) => void;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export function SlideToggle({ value, options, onChange, title, ariaLabel, disabled }: SlideToggleProps) {
  const [left, right] = options;
  const isRight = value === right.key;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isRight}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={() => onChange(isRight ? left.key : right.key)}
      className="bk-slide"
    >
      {/* Thumb trượt nền cho lựa chọn đang active */}
      <span className="bk-slide-thumb" data-right={isRight} />
      {options.map((opt, i) => {
        const on = i === 0 ? !isRight : isRight;
        return (
          <span key={opt.key} className={`bk-slide-opt ${on ? 'bk-slide-opt--on' : ''}`}>
            {opt.icon && <Icon icon={opt.icon} width={15} height={15} />}
            {opt.label && <span>{opt.label}</span>}
          </span>
        );
      })}
    </button>
  );
}
