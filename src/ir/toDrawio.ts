import { type FlowIR, type FlowEdge, type FlowNode, type NodeType, SYNTHETIC_START_ID } from './types';
import { NODE_WIDTH, NODE_HEIGHT } from './layout';

// ─────────────────────────────────────────────────────────────────────────────
// IR -> XML Draw.io (diagrams.net). Hàm thuần, KHÔNG import React — adapter
// export đứng cạnh toYaml (IR vẫn là source of truth).
//
// Cấu trúc sinh ra: <mxfile> chứa 1 <diagram> cho main flow + 1 diagram cho mỗi
// sub flow. Node = mxCell vertex (bo góc, tô màu theo loại — đồng bộ màu accent
// trên canvas); dây = mxCell edge orthogonal kèm nhãn nhánh. Toạ độ lấy nguyên
// từ IR (đã auto-layout / người dùng kéo) nên sơ đồ mở lên giống canvas.
// ─────────────────────────────────────────────────────────────────────────────

// Màu accent theo loại node — GIỮ ĐỒNG BỘ với NODE_CONFIG trong src/ui/nodeConfig.ts
// (ir/ không được import ui/ nên khai lại tại đây).
const NODE_COLOR: Record<NodeType, string> = {
  start: '#0ac4ab',
  announce: '#10b981',
  interaction: '#0ea5e9',
  nexus: '#f59e0b',
  logic: '#22c55e',
  classifier: '#fb7c25',
  normalization: '#d9b806',
  openai: '#d946ef',
  faq: '#6366f1',
  transfer: '#06b6d4',
  save: '#de5f1b',
  jump: '#d10887',
  hangup: '#f43f5e',
};

// Escape text/attribute cho XML.
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Pha màu accent với trắng (ratio 0..1 = phần trắng) -> fillColor nhạt dễ đọc chữ.
function tint(hex: string, ratio: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * ratio);
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Nhãn nhánh của 1 edge: ưu tiên label/value trong node.data.branches (nguồn sự
// thật của nhánh tự do), fallback label/condition trên edge, nhánh failed -> 失敗.
function edgeLabel(edge: FlowEdge, source: FlowNode | undefined): string {
  const handle = edge.sourceHandle ?? 'default';
  const raw = source?.data.branches;
  if (Array.isArray(raw)) {
    for (const b of raw) {
      if (b && typeof b === 'object' && (b as { id?: unknown }).id === handle) {
        const label = (b as { label?: unknown }).label;
        if (typeof label === 'string' && label.trim()) return label;
        const value = (b as { value?: unknown }).value;
        if (typeof value === 'string' && value.trim()) return value;
      }
    }
  }
  if (typeof edge.label === 'string' && edge.label.trim()) return edge.label;
  if (typeof edge.condition === 'string' && edge.condition.trim()) return edge.condition;
  if (handle === 'failed') return '失敗';
  return '';
}

// Serialize 1 graph (main flow / sub flow) thành các mxCell bên trong <root>.
function graphCells(nodes: FlowNode[], edges: FlowEdge[]): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cells: string[] = [];

  for (const node of nodes) {
    const color = NODE_COLOR[node.type];
    const isStart = node.id === SYNTHETIC_START_ID || node.type === 'start';
    // Node start vẽ ellipse (điểm bắt đầu), còn lại là hộp bo góc như canvas.
    const shape = isStart ? 'ellipse;' : 'rounded=1;arcSize=12;';
    const style =
      `${shape}whiteSpace=wrap;html=1;fontSize=13;fontStyle=1;` +
      `fillColor=${tint(color, 0.88)};strokeColor=${color};fontColor=#333333;`;
    cells.push(
      `        <mxCell id="${esc(node.id)}" value="${esc(node.label)}" style="${style}" vertex="1" parent="1">\n` +
        `          <mxGeometry x="${Math.round(node.position.x)}" y="${Math.round(node.position.y)}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" as="geometry" />\n` +
        `        </mxCell>`,
    );
  }

  edges.forEach((edge, index) => {
    // Dây chỉ vẽ được khi cả 2 đầu tồn tại trong graph.
    if (!byId.has(edge.source) || !byId.has(edge.target)) return;
    const label = edgeLabel(edge, byId.get(edge.source));
    const style =
      'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;' +
      'exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
    cells.push(
      `        <mxCell id="${esc(edge.id) || `edge_${index}`}" value="${esc(label)}" style="${style}" edge="1" parent="1" source="${esc(edge.source)}" target="${esc(edge.target)}">\n` +
        '          <mxGeometry relative="1" as="geometry" />\n' +
        '        </mxCell>',
    );
  });

  return cells.join('\n');
}

function diagramXml(id: string, name: string, nodes: FlowNode[], edges: FlowEdge[]): string {
  return (
    `  <diagram id="${esc(id)}" name="${esc(name)}">\n` +
    '    <mxGraphModel dx="1000" dy="800" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1200" math="0" shadow="0">\n' +
    '      <root>\n' +
    '        <mxCell id="0" />\n' +
    '        <mxCell id="1" parent="0" />\n' +
    `${graphCells(nodes, edges)}\n` +
    '      </root>\n' +
    '    </mxGraphModel>\n' +
    '  </diagram>'
  );
}

// Xuất TÀI LIỆU đầy đủ: main flow là page đầu, mỗi sub flow 1 page riêng.
export function toDrawio(ir: FlowIR): string {
  const pages = [
    diagramXml('main', ir.meta.name || 'Main Flow', ir.nodes, ir.edges),
    ...(ir.subflows ?? []).map((s) => diagramXml(s.id, s.name, s.nodes, s.edges)),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<mxfile host="app.diagrams.net" agent="scenario-flow-builder" type="device">\n' +
    `${pages.join('\n')}\n` +
    '</mxfile>\n'
  );
}
