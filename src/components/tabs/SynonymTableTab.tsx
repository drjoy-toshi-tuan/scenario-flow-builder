import { useState } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { ensureSettings } from '../../ir/settings';
import type { SynonymRow } from '../../ir/types';
import { Icon } from '../../ui/icons';
import { useT } from '../../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Trang bảng "類義語" dùng chung cho 診療科一覧 (clinicalDepartments) và コースリスト
// (courses). Bảng 2 cột: Tên (診療科 / コース) + Từ gần nghĩa (類義語, dạng chip).
// Có nút "Thêm dòng" ở cuối. Dữ liệu lưu trong settings -> round-trip qua YAML.
// ─────────────────────────────────────────────────────────────────────────────

type PageKind = 'clinicalDept' | 'courseList';

const CONFIG: Record<
  PageKind,
  { settingsKey: 'clinicalDepartments' | 'courses'; titleKey: 'ctClinicalDept' | 'ctCourseList'; nameColKey: 'clColDept' | 'clColCourse'; icon: string }
> = {
  clinicalDept: {
    settingsKey: 'clinicalDepartments',
    titleKey: 'ctClinicalDept',
    nameColKey: 'clColDept',
    icon: 'material-symbols-light:view-list-outline',
  },
  courseList: {
    settingsKey: 'courses',
    titleKey: 'ctCourseList',
    nameColKey: 'clColCourse',
    icon: 'material-symbols-light:view-list-outline',
  },
};

export function SynonymTableTab({ kind }: { kind: PageKind }) {
  const t = useT();
  const cfg = CONFIG[kind];
  const ir = useFlowStore((s) => s.ir);
  const setSettings = useFlowStore((s) => s.setSettings);
  const settings = ensureSettings(ir?.settings);
  const rows: SynonymRow[] = settings[cfg.settingsKey] ?? [];

  const write = (next: SynonymRow[]) => setSettings({ [cfg.settingsKey]: next });

  const updateRow = (index: number, patch: Partial<SynonymRow>) =>
    write(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRow = () => write([...rows, { name: '', synonyms: [] }]);
  const removeRow = (index: number) => write(rows.filter((_, i) => i !== index));

  return (
    <div className="h-full overflow-auto bg-[var(--bk-canvas)] p-5">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-4 flex items-center gap-2 text-[15px] font-bold text-[var(--bk-text)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
            <Icon icon={cfg.icon} width={17} height={17} />
          </span>
          {t(cfg.titleKey)}
        </div>

        <div className="overflow-visible rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bk-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                <th className="w-[32%] px-3 py-2.5">{t(cfg.nameColKey)}</th>
                <th className="px-3 py-2.5">{t('clColSynonyms')}</th>
                <th className="w-[44px] px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--bk-border)] align-top last:border-0">
                  {/* Tên chính */}
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      value={row.name}
                      placeholder={t('clNamePlaceholder')}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5 text-sm font-medium text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
                    />
                  </td>
                  {/* 類義語: chip nền xám, chữ theo theme (contrast) + input thêm */}
                  <td className="px-3 py-2.5">
                    <SynonymChips
                      values={row.synonyms}
                      onChange={(synonyms) => updateRow(i, { synonyms })}
                    />
                  </td>
                  {/* Xoá dòng — căn giữa theo trục dọc của hàng và giữa ô trống theo trục ngang */}
                  <td className="px-2 py-2.5 align-middle">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      title={t('clRemoveRow')}
                      className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[color-mix(in_srgb,var(--bk-danger,#ef4444)_14%,transparent)] hover:text-[var(--bk-danger,#ef4444)]"
                    >
                      <Icon icon="lucide:trash-2" width={15} height={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-xs text-[var(--bk-text-faint)]">
                    {t('clEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Nút thêm dòng */}
        <button
          type="button"
          onClick={addRow}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-[var(--bk-border)] px-3.5 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
        >
          <Icon icon="line-md:plus-circle" width={18} height={18} />
          {t('clAddRow')}
        </button>
      </div>
    </div>
  );
}

// Chip nhập từ gần nghĩa: Enter / phẩy để thêm; Backspace ở ô rỗng xoá chip cuối.
// Chip nền xám (pha từ --bk-text), chữ dùng --bk-text -> contrast cả light/dark.
function SynonymChips({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const v = raw.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  const remove = (index: number) => onChange(values.filter((_, i) => i !== index));

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1.5 focus-within:border-[var(--bk-accent)]">
      {values.map((v, i) => (
        <span
          key={`${v}:${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--bk-text)_16%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--bk-text)]"
        >
          {v}
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-[var(--bk-text-muted)] transition hover:text-[var(--bk-text)]"
          >
            <Icon icon="lucide:x" width={12} height={12} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        placeholder={t('clSynonymPlaceholder')}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
            remove(values.length - 1);
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm text-[var(--bk-text)] outline-none"
      />
    </div>
  );
}
