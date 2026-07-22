import { DAY_KEYS, type DayKey, type FlowIR, type FlowNode } from '../ir/types';
import { CATCH_ALL_ID, type DataBranch } from './nodeSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Node 分岐ロジック (màn CS) — MÔ HÌNH ĐIỀU KIỆN (2026-07, spec CS v2).
//
// プロパティ設定 (Property): chọn SỐ ĐIỀU KIỆN (1/2/3). Mỗi điều kiện = 1 nguồn
// dữ liệu + 1 TẬP giá trị:
//   聴取内容 (hearing) : chọn node 聴取 + danh sách giá trị tự nhập (thêm/bớt tuỳ ý).
//   電話番号 (phone)   : 着信/聴取 → LIỆT KÊ TẤT CẢ 種別 cố định (mọi option đều là 1 value).
//   着信日時 (datetime): 日付(khoảng ngày) / 曜日(chọn thứ) / 時間(khoảng giờ);
//                        曜日 & 時間 luôn có 1 dòng "còn lại (tự động)" tự tính phần
//                        user chưa cover.
//
// 分岐設定 (Branch): LIỆT KÊ mọi nhánh = TÍCH (Cartesian) các tập giá trị của các
// điều kiện. 2 điều kiện → mỗi value của ĐK1 ghép với từng value của ĐK2.
//
// Lưu trong node.data: csCount (số ĐK) + csSlots (mảng điều kiện). branches (bản
// sync sinh từ tích) để handle/dây/commit/toYaml dùng lại cơ chế sẵn có.
// Nhãn hiển thị (category / section) do component lấy theo i18n; module này thuần.
// ─────────────────────────────────────────────────────────────────────────────

export const CS_ELSE_LABEL = 'その他';
export const MAX_CS_CONDITIONS = 3;

export const INCOMING_PHONE_VALUES: readonly string[] = ['その他', '非通知', '海外', 'WebRTC', '固定', '携帯'];
export const ANSWERED_PHONE_VALUES: readonly string[] = ['その他', '固定', '携帯'];

// Thứ + Ngày lễ, thứ tự hiển thị ngang (T2 → NL). Nhãn theo ngôn ngữ.
export const CS_DAY_LABELS: Record<DayKey, { ja: string; vi: string }> = {
  mon: { ja: '月', vi: 'T2' },
  tue: { ja: '火', vi: 'T3' },
  wed: { ja: '水', vi: 'T4' },
  thu: { ja: '木', vi: 'T5' },
  fri: { ja: '金', vi: 'T6' },
  sat: { ja: '土', vi: 'T7' },
  sun: { ja: '日', vi: 'CN' },
  holiday: { ja: '祝', vi: 'NL' },
};

export type CsSlotKind = 'hearing' | 'phone' | 'datetime';
export type CsPhoneKind = 'incoming' | 'answered';
export type CsDatetimeKind = 'date' | 'day' | 'time';

export interface CsRange {
  from: string;
  to: string;
}

// 1 điều kiện (slot). Các field theo kind — field thừa được bỏ qua khi đọc.
export interface CsSlot {
  kind: CsSlotKind;
  // hearing
  nodeId?: string;
  values?: string[];
  // phone
  phoneKind?: CsPhoneKind;
  // datetime
  dtKind?: CsDatetimeKind;
  ranges?: CsRange[]; // date | time
  days?: DayKey[]; // day — LEGACY 1 nhóm (đọc lên -> gộp vào dayGroups[0]).
  dayGroups?: DayKey[][]; // day — nhiều khung, mỗi khung 1 tập thứ; phần còn lại tự tính từ hợp mọi khung.
}

const NODE_SOURCE_PREFIX = 'node:';
export function nodeSource(nodeId: string): string {
  return NODE_SOURCE_PREFIX + nodeId;
}

// ── Đọc model từ data (an toàn kiểu) ─────────────────────────────────────────
function asRanges(v: unknown): CsRange[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ from: typeof r.from === 'string' ? r.from : '', to: typeof r.to === 'string' ? r.to : '' }));
}
function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function asDays(v: unknown): DayKey[] {
  return asStrings(v).filter((d): d is DayKey => (DAY_KEYS as readonly string[]).includes(d));
}
// dayGroups = mảng các khung, mỗi khung là 1 tập thứ. Fallback: legacy `days` -> 1 khung;
// nếu trống hẳn -> 1 khung rỗng (để UI luôn có sẵn 1 khung).
function normalizeDayGroups(v: unknown, legacy: DayKey[]): DayKey[][] {
  if (Array.isArray(v)) {
    const groups = v.filter((g) => Array.isArray(g)).map((g) => asDays(g));
    if (groups.length) return groups;
  }
  return legacy.length ? [legacy] : [[]];
}
// Hợp các thứ đã chọn qua mọi khung (khử trùng lặp, giữ thứ tự DAY_KEYS).
function unionDays(groups: DayKey[][]): DayKey[] {
  return DAY_KEYS.filter((d) => groups.some((g) => g.includes(d)));
}

export function readCsCount(data: Record<string, unknown>): number {
  const n = typeof data.csCount === 'number' ? data.csCount : 1;
  return Math.min(MAX_CS_CONDITIONS, Math.max(1, n));
}

export function readCsSlots(data: Record<string, unknown>): CsSlot[] {
  const count = readCsCount(data);
  const raw = Array.isArray(data.csSlots) ? (data.csSlots as unknown[]) : [];
  const slots: CsSlot[] = [];
  for (let i = 0; i < count; i++) {
    const o = (raw[i] && typeof raw[i] === 'object' ? raw[i] : {}) as Record<string, unknown>;
    const kind: CsSlotKind =
      o.kind === 'phone' || o.kind === 'datetime' ? (o.kind as CsSlotKind) : 'hearing';
    if (kind === 'hearing') {
      slots.push({ kind, nodeId: typeof o.nodeId === 'string' ? o.nodeId : '', values: asStrings(o.values) });
    } else if (kind === 'phone') {
      slots.push({ kind, phoneKind: o.phoneKind === 'answered' ? 'answered' : 'incoming' });
    } else {
      const dtKind: CsDatetimeKind = o.dtKind === 'date' || o.dtKind === 'day' ? (o.dtKind as CsDatetimeKind) : 'time';
      const days = asDays(o.days);
      slots.push({ kind, dtKind, ranges: asRanges(o.ranges), days, dayGroups: normalizeDayGroups(o.dayGroups, days) });
    }
  }
  return slots;
}

// Điều kiện mặc định cho 1 nhóm データ.
export function defaultSlot(kind: CsSlotKind, ir: FlowIR | null, selfId: string): CsSlot {
  if (kind === 'phone') return { kind, phoneKind: 'incoming' };
  if (kind === 'datetime') return { kind, dtKind: 'time', ranges: [{ from: '09:00', to: '17:00' }], days: [], dayGroups: [[]] };
  const first = (ir?.nodes ?? []).find((n) => n.type === 'interaction' && n.id !== selfId);
  return { kind: 'hearing', nodeId: first ? first.id : '', values: [''] };
}

export function phoneValuesFor(kind: CsPhoneKind): readonly string[] {
  return kind === 'answered' ? ANSWERED_PHONE_VALUES : INCOMING_PHONE_VALUES;
}

// ── Tính "phần còn lại" (remainder) ──────────────────────────────────────────
function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59) return null;
  return h * 60 + mm;
}
function fromMin(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Phần giờ CHƯA được cover bởi các khung (vòng 24h, cho phép qua nửa đêm).
export function timeRemainderRanges(ranges: CsRange[]): CsRange[] {
  const covered = new Array(1440).fill(false) as boolean[];
  let any = false;
  for (const r of ranges) {
    const a = toMin(r.from);
    const b = toMin(r.to);
    if (a === null || b === null || a === b) continue;
    any = true;
    if (a < b) for (let i = a; i < b; i++) covered[i] = true;
    else {
      for (let i = a; i < 1440; i++) covered[i] = true;
      for (let i = 0; i < b; i++) covered[i] = true;
    }
  }
  if (!any) return [{ from: '00:00', to: '24:00' }];
  // Gom các đoạn false thành khoảng; nối wrap 23:59→00:00 nếu cả 2 đầu trống.
  const out: CsRange[] = [];
  let i = 0;
  while (i < 1440) {
    if (covered[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < 1440 && !covered[j]) j++;
    out.push({ from: fromMin(i), to: j === 1440 ? '24:00' : fromMin(j) });
    i = j;
  }
  // Nối khoảng cuối (…→24:00) với khoảng đầu (00:00→…) thành 1 khung qua nửa đêm.
  if (out.length >= 2 && out[0].from === '00:00' && out[out.length - 1].to === '24:00') {
    const last = out.pop()!;
    out[0] = { from: last.from, to: out[0].to };
  }
  return out;
}

export function dayRemainder(days: DayKey[]): DayKey[] {
  return DAY_KEYS.filter((d) => !days.includes(d));
}

// ── Sinh danh sách value (label JP) của 1 điều kiện — dùng cho tích nhánh ─────
function joinDays(days: DayKey[]): string {
  return days.map((d) => CS_DAY_LABELS[d].ja).join('・');
}

export function slotValueLabels(slot: CsSlot): string[] {
  if (slot.kind === 'hearing') return (slot.values ?? []).map((v) => v.trim()).filter(Boolean);
  if (slot.kind === 'phone') return [...phoneValuesFor(slot.phoneKind ?? 'incoming')];
  // datetime
  if (slot.dtKind === 'date') {
    return (slot.ranges ?? []).filter((r) => r.from || r.to).map((r) => `${r.from || '?'}〜${r.to || '?'}`);
  }
  if (slot.dtKind === 'day') {
    // Mỗi khung (nhóm thứ) không rỗng = 1 value; phần còn lại (tự động) tính từ HỢP mọi khung.
    const groups = slot.dayGroups ?? (slot.days && slot.days.length ? [slot.days] : []);
    const out: string[] = [];
    for (const g of groups) if (g.length) out.push(joinDays(g));
    const rem = dayRemainder(unionDays(groups));
    if (rem.length) out.push(`${joinDays(rem)}（残り）`);
    return out.length ? out : [`${joinDays([...DAY_KEYS])}（残り）`];
  }
  // time
  const ranges = (slot.ranges ?? []).filter((r) => r.from || r.to);
  const out = ranges.map((r) => `${r.from || '?'}〜${r.to || '?'}`);
  for (const rem of timeRemainderRanges(ranges)) out.push(`${rem.from}〜${rem.to}（残り）`);
  return out;
}

// ── Sinh nhánh (tích Cartesian) từ các điều kiện ─────────────────────────────
export interface CsProductBranch {
  id: string;
  parts: string[]; // 1 phần / điều kiện
  label: string; // parts nối bằng " × "
}

export function csProductBranches(slots: CsSlot[]): CsProductBranch[] {
  const lists = slots.map((s) => {
    const vs = slotValueLabels(s);
    return vs.length ? vs : ['—'];
  });
  if (lists.length === 0) return [];
  let combos: string[][] = [[]];
  for (const list of lists) {
    const next: string[][] = [];
    for (const combo of combos) for (const v of list) next.push([...combo, v]);
    combos = next;
  }
  return combos.map((parts, i) => ({ id: `b${i}`, parts, label: parts.join(' × ') }));
}

// Sync → data.branches (mỗi nhánh tích 1 handle) + catch-all その他 CUỐI.
export function csSlotsToDataBranches(slots: CsSlot[]): DataBranch[] {
  const list: DataBranch[] = csProductBranches(slots).map((b) => ({ id: b.id, value: b.label, label: b.label }));
  list.push({ id: CATCH_ALL_ID, value: '', label: CS_ELSE_LABEL });
  return list;
}

// Danh sách node 聴取 (cho pulldown khi データ = 聴取内容).
export interface CsSourceOption {
  id: string;
  label: string;
}
export function hearingSourceOptions(ir: FlowIR | null, selfId: string): CsSourceOption[] {
  return (ir?.nodes ?? [])
    .filter((n) => n.type === 'interaction' && n.id !== selfId)
    .map((n) => ({ id: n.id, label: n.label.trim() || n.id }));
}

export function hearingNodeLabel(nodeId: string, ir: FlowIR | null): string {
  const node: FlowNode | undefined = ir?.nodes.find((n) => n.id === nodeId);
  return node ? node.label.trim() || node.id : nodeId;
}
