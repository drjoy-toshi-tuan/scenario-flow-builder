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
}

export function AutoGrowTextarea({ value, onChange, placeholder, className }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Đặt lại chiều cao theo nội dung mỗi khi value đổi.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      placeholder={placeholder}
      // Gộp mọi xuống dòng thành khoảng trắng -> vẫn là "1 dòng logic".
      onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault();
      }}
    />
  );
}
