// ─────────────────────────────────────────────────────────────────────────────
// Icon "AI sparkles" — 2 ngôi sao 4 cánh lấp lánh (twinkle) lệch pha nhau.
// Vẽ lại từ icon gốc với ĐỈNH NHỌN HƠN MỘT CHÚT: cạnh lõm cong về tâm, chóp sao
// chỉ giữ một vát bo rất nhỏ (thay vì bo tròn to như bản gốc).
// Animation ở index.css (.bk-ai-star-big / .bk-ai-star-small).
// ─────────────────────────────────────────────────────────────────────────────

export function AiSparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">
        {/* Ngôi sao lớn — tâm (12,12), 4 cánh, chóp hơi nhọn (vát bo nhỏ). */}
        <path
          className="bk-ai-star-big"
          d="M11.55 4.9
             C11.75 4.12 12.25 4.12 12.45 4.9
             C13.32 8.28 15.72 10.68 19.1 11.55
             C19.88 11.75 19.88 12.25 19.1 12.45
             C15.72 13.32 13.32 15.72 12.45 19.1
             C12.25 19.88 11.75 19.88 11.55 19.1
             C10.68 15.72 8.28 13.32 4.9 12.45
             C4.12 12.25 4.12 11.75 4.9 11.55
             C8.28 10.68 10.68 8.28 11.55 4.9
             Z"
        />
        {/* Ngôi sao nhỏ — tâm (19,5.5), chớp lệch pha 0.8s. */}
        <path
          className="bk-ai-star-small"
          d="M18.78 2.95
             C18.87 2.6 19.13 2.6 19.22 2.95
             C19.62 4.38 20.47 5.23 21.9 5.63
             C22.25 5.72 22.25 5.98 21.9 6.07
             C20.47 6.47 19.62 7.32 19.22 8.75
             C19.13 9.1 18.87 9.1 18.78 8.75
             C18.38 7.32 17.53 6.47 16.1 6.07
             C15.75 5.98 15.75 5.72 16.1 5.63
             C17.53 5.23 18.38 4.38 18.78 2.95
             Z"
        />
      </g>
    </svg>
  );
}
