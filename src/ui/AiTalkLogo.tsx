// ─────────────────────────────────────────────────────────────────────────────
// Logo エーアイトーク (AI Talk) — bake sẵn SVG (ngọn lửa "A" gradient + chấm tròn).
// Dùng cho option TTS trong modal IVR Property. Bỏ ảnh base64 ẩn của file gốc,
// nhúng thẳng stops vào gradient để không phụ thuộc href SVG2.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  width?: number;
  height?: number;
  className?: string;
}

export function AiTalkLogo({ width = 16, height = 16, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 500 500"
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="aitalk-logo-grad"
          gradientUnits="userSpaceOnUse"
          x1="256.432"
          y1="138.316"
          x2="256.432"
          y2="398"
          gradientTransform="matrix(-0.66363, -1.293035, 1.196769, -0.696584, 46.400632, 854.118941)"
        >
          <stop offset="0" stopColor="rgb(18, 194, 233)" />
          <stop offset="0.5" stopColor="#c471ed" />
          <stop offset="1" stopColor="rgb(235, 108, 159)" />
        </linearGradient>
      </defs>
      <path
        d="M 249.254 56.011 L 326.529 189.857 C 313.62 194.533 302.226 203.611 294.824 216.431 L 169.537 433.433 L 31.349 433.433 L 249.254 56.011 Z M 467.158 433.433 L 308.996 433.433 L 388.078 296.459 L 467.158 433.433 Z"
        fill="url(#aitalk-logo-grad)"
      />
      <path
        d="M 407.862 121.047 H 407.862 A 64.581 64.581 0 0 0 472.443 185.628 V 185.628 A 64.581 64.581 0 0 0 407.862 250.209 H 407.862 A 64.581 64.581 0 0 0 343.281 185.628 V 185.628 A 64.581 64.581 0 0 0 407.862 121.047 Z"
        fill="rgb(235, 108, 159)"
      />
    </svg>
  );
}
