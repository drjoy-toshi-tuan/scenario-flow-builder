// ─────────────────────────────────────────────────────────────────────────────
// Logo cho option STT "Amivoice" trong modal IVR Property. Nhúng thẳng path SVG,
// giữ nguyên màu thương hiệu (#005cb9 / #2a7de1) — KHÔNG dùng currentColor.
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
      viewBox="0 0 28.5 24"
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <path
        d="M28.444,8.762,25.51,1.485A2.027,2.027,0,0,0,25,.6L24.991.592A1.987,1.987,0,0,0,23.57,0,2.011,2.011,0,0,0,21.7,1.263l-5.89,14.725a.736.736,0,0,1-1.367,0L8.557,1.263A2.009,2.009,0,0,0,6.691,0h0A2.01,2.01,0,0,0,4.824,2.757l7.935,19.835a2.011,2.011,0,0,0,1.867,1.263h1.011A2.01,2.01,0,0,0,17.5,22.591L23.752,6.968l1.279,3.171a1.84,1.84,0,0,0,3.413-1.377"
        transform="translate(-1.682 0)"
        fill="#005cb9"
      />
      <path
        d="M23.754,21.1,15.819,1.263A2.011,2.011,0,0,0,13.953,0H12.942a2.01,2.01,0,0,0-1.866,1.264L4.826,16.887l-1.278-3.17A1.84,1.84,0,1,0,.135,15.093l2.934,7.275a2.01,2.01,0,0,0,3.806.223L12.763,7.867a.736.736,0,0,1,1.367,0l5.891,14.725A2.01,2.01,0,0,0,23.754,21.1"
        transform="translate(0 0)"
        fill="#2a7de1"
      />
    </svg>
  );
}
