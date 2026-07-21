import { ViewportPortal, useStore } from '@xyflow/react';

// ─────────────────────────────────────────────────────────────────────────────
// Khung BAO quanh nhóm node đang chọn (vùng cam). React Flow CHỈ vẽ khung nhóm
// (.react-flow__nodesselection-rect) sau khi KÉO KHUNG chọn — Ctrl/Shift+click gộp
// node thì KHÔNG có khung. Ở đây tự vẽ 1 khung nhất quán: hiện khi có ≥2 node được
// chọn (bất kể chọn bằng cách nào) và tự NỞ RA theo bbox của nhóm.
//
// Vẽ trong ViewportPortal nên khung nằm trong lớp có transform của viewport -> dùng
// thẳng toạ độ flow (positionAbsolute). pointer-events:none để không chắn thao tác
// (kéo cả nhóm vẫn bằng cách nắm 1 node đang chọn như React Flow mặc định).
// ─────────────────────────────────────────────────────────────────────────────

const PAD = 14; // đệm quanh bbox nhóm cho thoáng

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function SelectionOverlay() {
  const box = useStore((s) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    for (const n of s.nodeLookup.values()) {
      if (!n.selected) continue;
      count += 1;
      const { x, y } = n.internals.positionAbsolute;
      const w = n.measured?.width ?? 0;
      const h = n.measured?.height ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }
    // Chỉ hiện khung khi CHỌN NHIỀU (≥2). Chọn 1 node thì chỉ có glow của node đó.
    if (count < 2 || !Number.isFinite(minX)) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, sameBox);

  if (!box) return null;
  return (
    <ViewportPortal>
      <div
        className="bk-selection-box"
        style={{
          position: 'absolute',
          transform: `translate(${box.x - PAD}px, ${box.y - PAD}px)`,
          width: box.w + PAD * 2,
          height: box.h + PAD * 2,
          pointerEvents: 'none',
        }}
      />
    </ViewportPortal>
  );
}
