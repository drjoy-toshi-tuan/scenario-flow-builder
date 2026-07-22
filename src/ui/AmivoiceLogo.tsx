// ─────────────────────────────────────────────────────────────────────────────
// Logo cho option STT "Amivoice" trong modal IVR Property. Nhúng thẳng path SVG,
// giữ nguyên màu thương hiệu (#669df6 / #4285f4). SVG gốc dùng <use> + <symbol>
// offset (.5,.5) — thay bằng <g translate>.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  width?: number;
  height?: number;
  className?: string;
}

export function AmivoiceLogo({ width = 19, height = 16, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 81 68"
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <g stroke="none" transform="translate(0.5 0.5)">
        <path
          d="M.04 13.223h26.559v6.68H.04zm36.639 33.319H0v6.68h0 36.679v-6.68zM10.04 29.902H0v6.64h16.72 23.279l-6.68-6.64H10.04z"
          fill="#669df6"
          fillRule="nonzero"
        />
        <path
          d="M39.999 21.543a1.68 1.68 0 0 1 1.68-1.44 1.64 1.64 0 0 1 1.64 1.44v36.719a8.36 8.36 0 0 0 10.44 8 8.64 8.64 0 0 0 6.24-8.44V8.263a1.6 1.6 0 0 1 .76-1.6 1.64 1.64 0 0 1 1.8 0 1.6 1.6 0 0 1 .76 1.6v36.639a8.28 8.28 0 0 0 3.24 6.56 8 8 0 0 0 7.2 1.48 8.64 8.64 0 0 0 6.24-8.48v-11.2h-6.68v11.68a1.6 1.6 0 0 1-.76 1.6 1.64 1.64 0 0 1-1.8 0 1.6 1.6 0 0 1-.76-1.6V8.263a8.36 8.36 0 0 0-3.274-6.539A8.36 8.36 0 0 0 59.558.263a8.64 8.64 0 0 0-6.24 8.52v49.479a1.6 1.6 0 0 1-.76 1.6 1.64 1.64 0 0 1-1.8 0 1.6 1.6 0 0 1-.76-1.6V21.583a8.28 8.28 0 0 0-16.44-1.44 9.6 9.6 0 0 0-.2 1.84v8l6.64 6.56v-15z"
          fill="#4285f4"
          fillRule="nonzero"
        />
      </g>
    </svg>
  );
}
