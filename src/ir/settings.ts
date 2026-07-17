import {
  DAY_KEYS,
  type DayKey,
  type DaySchedule,
  type ScenarioSettings,
  type SmsFlagEntry,
  type StatusEntry,
  type TimeRange,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers thuần cho ScenarioSettings (KHÔNG import React): default + normalize.
// fromYaml gọi normalizeSettings để file bị sửa tay/thiếu field vẫn mở được;
// các tab UI gọi ensureSettings(ir.settings) để luôn có object đầy đủ field.
// ─────────────────────────────────────────────────────────────────────────────

// Bộ 状態 mặc định (Brekeke) — LUÔN tồn tại, không xoá/đổi flag, chỉ đổi tên.
export const FIXED_STATUSES: readonly StatusEntry[] = [
  { name: '途中切断', flag: 0, fixed: true },
  { name: '未処理', flag: 1, fixed: true },
  { name: '代表案内', flag: 2, fixed: true },
  { name: '転送', flag: 3, fixed: true },
  { name: '処理中', flag: 4, fixed: true },
  { name: '処理済み', flag: 5, fixed: true },
  { name: '時間外', flag: 6, fixed: true },
] as const;

// URL gửi sau cuộc gọi gắn cuối mỗi SMS — độ dài CỐ ĐỊNH 22 ký tự (cột 文字数
// đếm: nội dung + 1 ký tự xuống dòng + 22).
export const SMS_URL_LENGTH = 22;

export function smsCharCount(content: string): number {
  return content.length + 1 + SMS_URL_LENGTH;
}

function emptyDays(): DaySchedule[] {
  return DAY_KEYS.map((day) => ({ day, enabled: false, ranges: [] }));
}

export function defaultSettings(): ScenarioSettings {
  return {
    mainPhone: '',
    master050: '',
    demo050: '',
    smsNumber: '',
    workingDays: emptyDays(),
    restPeriod: '',
    silentDetectionSec: '',
    timeoutSec: '',
    statuses: FIXED_STATUSES.map((s) => ({ ...s })),
    smsFlags: [],
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function normalizeRanges(raw: unknown): TimeRange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ from: str(r.from), to: str(r.to) }));
}

function normalizeDays(raw: unknown): DaySchedule[] {
  const byDay = new Map<DayKey, DaySchedule>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const d = item as Partial<DaySchedule> | null;
      if (d && (DAY_KEYS as readonly string[]).includes(String(d.day))) {
        byDay.set(d.day as DayKey, {
          day: d.day as DayKey,
          enabled: d.enabled === true,
          ranges: normalizeRanges(d.ranges),
        });
      }
    }
  }
  // Luôn trả đủ 8 ngày theo đúng thứ tự DAY_KEYS (file thiếu ngày nào thì bù).
  return DAY_KEYS.map((day) => byDay.get(day) ?? { day, enabled: false, ranges: [] });
}

// Status: các flag cố định LUÔN có mặt (giữ tên người dùng đã đổi); dòng thêm tay
// giữ nguyên, ép fixed=false. Sắp theo flag tăng dần cho ổn định.
function normalizeStatuses(raw: unknown): StatusEntry[] {
  const parsed: StatusEntry[] = Array.isArray(raw)
    ? raw
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({ name: str(s.name), flag: num(s.flag, -1) }))
        .filter((s) => s.flag >= 0)
    : [];
  const result: StatusEntry[] = FIXED_STATUSES.map((fixed) => {
    const saved = parsed.find((p) => p.flag === fixed.flag);
    return { name: saved?.name.trim() ? saved.name : fixed.name, flag: fixed.flag, fixed: true };
  });
  const fixedFlags = new Set(result.map((s) => s.flag));
  for (const p of parsed) {
    if (!fixedFlags.has(p.flag)) result.push({ name: p.name, flag: p.flag });
  }
  return result.sort((a, b) => a.flag - b.flag);
}

function normalizeSmsFlags(raw: unknown): SmsFlagEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({ type: str(s.type), flag: num(s.flag), content: str(s.content) }));
}

// Chuẩn hoá settings đọc từ YAML (hoặc undefined) về object đầy đủ field.
export function normalizeSettings(raw: unknown): ScenarioSettings {
  if (!raw || typeof raw !== 'object') return defaultSettings();
  const r = raw as Record<string, unknown>;
  return {
    mainPhone: str(r.mainPhone),
    master050: str(r.master050),
    demo050: str(r.demo050),
    smsNumber: str(r.smsNumber),
    workingDays: normalizeDays(r.workingDays),
    restPeriod: str(r.restPeriod),
    silentDetectionSec: str(r.silentDetectionSec),
    timeoutSec: str(r.timeoutSec),
    statuses: normalizeStatuses(r.statuses),
    smsFlags: normalizeSmsFlags(r.smsFlags),
  };
}

// Cho UI: ir.settings có thể undefined (file cũ) -> luôn trả bản đầy đủ.
export function ensureSettings(settings: ScenarioSettings | undefined): ScenarioSettings {
  return settings ?? defaultSettings();
}
