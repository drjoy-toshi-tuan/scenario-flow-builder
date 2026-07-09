// ─────────────────────────────────────────────────────────────────────────────
// Icon "AI sparkles" — 2 ngôi sao 4 cánh lấp lánh (twinkle) lệch pha nhau.
// Đỉnh sao bo NHẸ HƠN bản trước (bớt nhọn một chút): control point ở mỗi chóp
// dãn rộng ra để mũi sao mềm hơn nhưng vẫn ra hình sao.
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
        {/* Ngôi sao lớn — tâm (12,12); 4 chóp bo nhẹ (control point rộng hơn). */}
        <path
          className="bk-ai-star-big"
          d="M11.55 4.9
             C11.62 4.3 12.38 4.3 12.45 4.9
             C13.32 8.28 15.72 10.68 19.1 11.55
             C19.7 11.62 19.7 12.38 19.1 12.45
             C15.72 13.32 13.32 15.72 12.45 19.1
             C12.38 19.7 11.62 19.7 11.55 19.1
             C10.68 15.72 8.28 13.32 4.9 12.45
             C4.3 12.38 4.3 11.62 4.9 11.55
             C8.28 10.68 10.68 8.28 11.55 4.9
             Z"
        />
        {/* Ngôi sao nhỏ — tâm (19,5.5); chớp lệch pha 0.8s. */}
        <path
          className="bk-ai-star-small"
          d="M18.78 2.95
             C18.82 2.72 19.18 2.72 19.22 2.95
             C19.62 4.38 20.47 5.23 21.9 5.63
             C22.13 5.67 22.13 6.03 21.9 6.07
             C20.47 6.47 19.62 7.32 19.22 8.75
             C19.18 8.98 18.82 8.98 18.78 8.75
             C18.38 7.32 17.53 6.47 16.1 6.07
             C15.87 6.03 15.87 5.67 16.1 5.63
             C17.53 5.23 18.38 4.38 18.78 2.95
             Z"
        />
      </g>
    </svg>
  );
}
