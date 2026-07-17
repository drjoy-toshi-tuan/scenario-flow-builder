import type { FlowIR, NodeType } from './types';
import { SYNTHETIC_START_ID } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Lan truyền XUÔI flag "trạng thái cuộc gọi" (状態 / SMSフラグ) theo dòng flow:
// một node đã set status/SMS flag thì các node PHÍA SAU (nối tiếp theo dây) mặc định
// KẾ THỪA flag đó, cho tới khi gặp node khác set flag mới (kiểu tự fill).
//
// Hàm thuần (ir/ không import React): trả về, cho MỖI node, flag mà node KẾ THỪA từ
// thượng nguồn — CHƯA gộp flag của chính node đó. Panel/Announce List dùng giá trị này
// làm MẶC ĐỊNH khi node chưa tự đặt flag.
// ─────────────────────────────────────────────────────────────────────────────

export interface InheritedFlags {
  statusFlag?: string;
  smsFlag?: string;
}

const asFlag = (v: unknown): string | undefined => {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
};

// Flag CỦA CHÍNH node (key khác nhau theo loại): node interaction dùng hangup*Flag
// (切断時フラグ set ở tab Announce List); transfer/hangup/save dùng statusFlag/smsFlag.
function ownFlags(type: NodeType, data: Record<string, unknown>): InheritedFlags {
  if (type === 'interaction') {
    return { statusFlag: asFlag(data.hangupStatusFlag), smsFlag: asFlag(data.hangupSmsFlag) };
  }
  return { statusFlag: asFlag(data.statusFlag), smsFlag: asFlag(data.smsFlag) };
}

export function computeInheritedFlags(ir: FlowIR | null | undefined): Map<string, InheritedFlags> {
  const result = new Map<string, InheritedFlags>();
  if (!ir) return result;

  const nodeById = new Map(ir.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const hasIncoming = new Set<string>();
  for (const e of ir.edges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    const list = outgoing.get(e.source);
    if (list) list.push(e.target);
    else outgoing.set(e.source, [e.target]);
    hasIncoming.add(e.target);
  }

  // Gốc lan truyền: node Start tổng hợp -> node không có dây vào (theo thứ tự IR).
  const roots = [
    ...ir.nodes.filter((n) => n.id === SYNTHETIC_START_ID),
    ...ir.nodes.filter((n) => n.id !== SYNTHETIC_START_ID && !hasIncoming.has(n.id)),
  ];

  // BFS mang flag kế thừa xuôi dòng; mỗi node xử lý 1 lần (first-arrival) để chặn vòng lặp.
  const queue: { id: string; carry: InheritedFlags }[] = roots.map((n) => ({ id: n.id, carry: {} }));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const { id, carry } = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.set(id, carry);

    const node = nodeById.get(id);
    const own = node ? ownFlags(node.type, node.data) : {};
    // Flag mang xuống các node sau = flag của chính node (nếu có) đè lên flag kế thừa.
    const carryOut: InheritedFlags = {
      statusFlag: own.statusFlag ?? carry.statusFlag,
      smsFlag: own.smsFlag ?? carry.smsFlag,
    };
    for (const target of outgoing.get(id) ?? []) {
      if (!seen.has(target)) queue.push({ id: target, carry: carryOut });
    }
  }

  // Node không tới được từ gốc (cụm rời / toàn vòng) -> không kế thừa gì.
  for (const n of ir.nodes) if (!result.has(n.id)) result.set(n.id, {});
  return result;
}
