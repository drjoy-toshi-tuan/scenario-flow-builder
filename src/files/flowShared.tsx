import { fromYaml } from '../ir/fromYaml';
import { useT } from '../ui/i18n';
import { FlowGlyph } from '../ui/FlowGlyph';

// ─────────────────────────────────────────────────────────────────────────────
// Tiện ích dùng chung của màn quản lý flow (DriveManagerScreen): dựng nội dung
// flow trống, kiểm tra YAML import, badge cấu trúc Main/Sub flow.
// ─────────────────────────────────────────────────────────────────────────────

// Nội dung flow trống khi "Tạo flow mới" — kèm metadata (施設名/シナリオ名/作成者/日時).
// noStart (màn CS): シナリオ設計書 KHÔNG có node Start kỹ thuật — bỏ field flow.start
// (node アナウンス đầu tiên chính là điểm bắt đầu; TS mới ráp Start khi gen YAML chạy).
export function buildBlankFlow(o: {
  facility: string;
  name: string;
  author: string;
  createdAt: string;
  noStart?: boolean;
}): string {
  const q = (s: string) => JSON.stringify(s ?? ''); // double-quoted scalar an toàn cho YAML
  return [
    'flow:',
    `  name: ${q(o.name)}`,
    `  facility: ${q(o.facility)}`,
    `  author: ${q(o.author)}`,
    `  createdAt: ${q(o.createdAt)}`,
    `  updatedAt: ${q(o.createdAt)}`,
    ...(o.noStart ? [] : ['  start: welcome']),
    '  nodes:',
    '    - id: welcome',
    '      type: announce',
    '      text: ""',
    '      next: goodbye',
    '    - id: goodbye',
    '      type: hangup',
    '',
  ].join('\n');
}

// Kiểm tra YAML có phải flow đọc được không (không ném lỗi khi vào canvas).
export function isValidFlowYaml(text: string): boolean {
  try {
    return Array.isArray(fromYaml(text).nodes);
  } catch {
    return false;
  }
}

// Cấu trúc flow cạnh tên kịch bản: logo Main Flow (luôn 1) | logo Sub Flow · số
// lượng sub flow. Main & Sub ngăn cách bằng dấu gạch đứng. Dùng logo đồng bộ toàn app.
export function FlowStructureBadge({ subflowCount }: { subflowCount: number }) {
  const t = useT();
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--bk-text-muted)]">
      <span className="flex items-center gap-1" title={t('mainFlowBadge')}>
        <FlowGlyph isMain size={15} />
        <span>1</span>
      </span>
      <span aria-hidden className="h-3.5 w-px bg-[var(--bk-border)]" />
      <span className="flex items-center gap-1" title={t('subFlowBadge')}>
        <FlowGlyph isMain={false} size={15} />
        <span>{subflowCount}</span>
      </span>
    </span>
  );
}
