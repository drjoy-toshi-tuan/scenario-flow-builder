import { useLayoutEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Ô nhập "1 dòng nhưng tự cao lên": mặc định cao ~1 dòng (38px), khi text dài thì
// tự wrap xuống dòng (chỉ về mặt hiển thị) và chiều cao tăng theo nội dung.
// KHÔNG cho xuống dòng cứng (chặn Enter, bỏ ký tự newline khi dán).
// ─────────────────────────────────────────────────────────────────────────────

interface AutoGrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  // true: CHO PHÉP xuống dòng cứng (Enter) — vẫn tự cao theo nội dung (vd SMS文言).
  allowNewlines?: boolean;
  // Chiều cao tối đa (px): quá thì DỪNG cao thêm và bật scroll trong ô (vd announce
  // giới hạn 3 dòng ở màn Announce List).
  maxHeight?: number;
}

export function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  className,
  allowNewlines = false,
  maxHeight,
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Đặt lại chiều cao theo nội dung mỗi khi value đổi; kẹp theo maxHeight nếu có.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const full = el.scrollHeight;
    if (maxHeight != null && full > maxHeight) {
      el.style.height = `${maxHeight}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${full}px`;
      el.style.overflowY = 'hidden';
    }
  }, [value, maxHeight]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      placeholder={placeholder}
      // Mặc định gộp mọi xuống dòng thành khoảng trắng -> vẫn là "1 dòng logic";
      // allowNewlines thì giữ nguyên (Enter xuống dòng, chiều cao tự tăng).
      onChange={(e) =>
        onChange(allowNewlines ? e.target.value : e.target.value.replace(/[\r\n]+/g, ' '))
      }
      onKeyDown={(e) => {
        if (!allowNewlines && e.key === 'Enter') e.preventDefault();
      }}
    />
  );
}
