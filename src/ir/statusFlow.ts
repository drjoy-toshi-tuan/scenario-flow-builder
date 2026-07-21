import type { FlowIR, NodeType } from './types';
import { SYNTHETIC_START_ID } from './types';
import { DEFAULT_STATUS_FLAG, DEFAULT_SMS_FLAG } from './settings';

// ─────────────────────────────────────────────────────────────────────────────
// Lan truyền XUÔI flag "trạng thái cuộc gọi" (状態 / SMSフラグ) theo dòng flow:
// một node đã set status/SMS flag thì các node PHÍA SAU (nối tiếp theo dây) mặc định
// KẾ THỪA flag đó, cho tới khi gặp node khác set flag mới (kiểu tự fill).
//
// Baseline: khi CHƯA node nào phía trên set, mọi node kế thừa flag mặc định
// status 0 (途中切断) + SMS -2 (送信なし) — xem DEFAULT_STATUS_FLAG / DEFAULT_SMS_FLAG.
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
  // Số dây vào TỪ NODE THẬT (bỏ qua node Start tổng hợp — nó chỉ đánh dấu điểm vào,
  // không phải "node phía trên" theo nghĩa kế thừa flag).
  const realIncoming = new Set<string>();
  for (const e of ir.edges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    const list = outgoing.get(e.source);
    if (list) list.push(e.target);
    else outgoing.set(e.source, [e.target]);
    if (e.source !== SYNTHETIC_START_ID) realIncoming.add(e.target);
  }

  // Baseline mọi node thừa hưởng khi chưa có node nào phía trên set flag.
  const baseCarry: InheritedFlags = {
    statusFlag: String(DEFAULT_STATUS_FLAG),
    smsFlag: String(DEFAULT_SMS_FLAG),
  };

  // Node ĐẦU TIÊN (entry): node thật KHÔNG có dây vào từ node thật khác (điểm bắt đầu
  // luồng gọi). Vì phía trên không có gì để "継続/Carried" nên inherited = RỖNG (không
  // hiện stamp) — nhưng nó vẫn khởi nguồn baseline mặc định cho các node phía sau.
  const entries = ir.nodes.filter((n) => n.id !== SYNTHETIC_START_ID && !realIncoming.has(n.id));

  // BFS mang flag kế thừa xuôi dòng; mỗi node xử lý 1 lần (first-arrival) để chặn vòng lặp.
  const queue: { id: string; carry: InheritedFlags; isEntry: boolean }[] = entries.map((n) => ({
    id: n.id,
    carry: {},
    isEntry: true,
  }));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const { id, carry, isEntry } = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    // Node đầu tiên -> RỖNG (không stamp Carried); node sau -> flag kế thừa thật.
    result.set(id, isEntry ? {} : carry);

    const node = nodeById.get(id);
    const own = node ? ownFlags(node.type, node.data) : {};
    // Flag mang xuống các node sau = flag của chính node (nếu có) đè lên flag kế thừa;
    // node đầu tiên khởi nguồn từ baseline mặc định (0 / -2).
    const inFlow = isEntry ? baseCarry : carry;
    const carryOut: InheritedFlags = {
      statusFlag: own.statusFlag ?? inFlow.statusFlag,
      smsFlag: own.smsFlag ?? inFlow.smsFlag,
    };
    for (const target of outgoing.get(id) ?? []) {
      if (!seen.has(target)) queue.push({ id: target, carry: carryOut, isEntry: false });
    }
  }

  // Node không tới được (node Start tổng hợp / cụm rời / toàn vòng) -> coi như điểm
  // bắt đầu riêng: inherited RỖNG (không stamp).
  for (const n of ir.nodes) if (!result.has(n.id)) result.set(n.id, {});
  return result;
}
