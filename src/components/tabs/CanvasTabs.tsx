import { useEffect, useRef, useState } from 'react';
import { useFlowStore, type CanvasTab } from '../../store/flowStore';
import { ensureSettings } from '../../ir/settings';
import { Icon } from '../../ui/icons';
import { useT, type TKey } from '../../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Dải tab của màn canvas (ngay dưới header) — kiểu tab browser/Google Sheets.
// 4 tab bắt buộc: Flow Diagram / Announce List / General Settings / Status Settings.
// + Trang bảng phụ THÊM ĐƯỢC qua nút "+" cuối dải: Clinical Department List
//   (診療科一覧) và Course List (コースリスト) — mỗi trang lưu trong settings.
// ─────────────────────────────────────────────────────────────────────────────

// Key i18n prefix "ct" (canvas tab).
const TABS: { id: CanvasTab; labelKey: TKey; icon: string }[] = [
  { id: 'flow', labelKey: 'ctFlow', icon: 'lucide:git-fork' },
  { id: 'announce', labelKey: 'ctAnnounce', icon: 'lucide:volume-2' },
  { id: 'general', labelKey: 'ctGeneral', icon: 'lucide:layout-dashboard' },
  { id: 'status', labelKey: 'ctStatus', icon: 'gravity-ui:flag' },
];

// Trang bảng phụ thêm được: id tab + key settings + nhãn + icon.
const EXTRA_PAGES: {
  id: Extract<CanvasTab, 'clinicalDept' | 'courseList'>;
  settingsKey: 'clinicalDepartments' | 'courses';
  labelKey: TKey;
  icon: string;
}[] = [
  { id: 'clinicalDept', settingsKey: 'clinicalDepartments', labelKey: 'ctClinicalDept', icon: 'material-symbols-light:view-list-outline' },
  { id: 'courseList', settingsKey: 'courses', labelKey: 'ctCourseList', icon: 'material-symbols-light:view-list-outline' },
];

export function CanvasTabs() {
  const t = useT();
  const active = useFlowStore((s) => s.canvasTab);
  const setTab = useFlowStore((s) => s.setCanvasTab);
  const ir = useFlowStore((s) => s.ir);
  const setSettings = useFlowStore((s) => s.setSettings);
  const settings = ensureSettings(ir?.settings);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Đóng menu khi click ra ngoài.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // Trang phụ đã tạo (field settings tồn tại) -> hiện tab tương ứng.
  const openExtras = EXTRA_PAGES.filter((p) => settings[p.settingsKey] !== undefined);

  // Tạo trang (nếu chưa) rồi chuyển sang. Chưa có -> seed 1 dòng trống.
  const createPage = (page: (typeof EXTRA_PAGES)[number]) => {
    if (settings[page.settingsKey] === undefined) {
      setSettings({ [page.settingsKey]: [{ name: '', synonyms: [] }] });
    }
    setTab(page.id);
    setMenuOpen(false);
  };

  // Xoá trang bảng phụ: bỏ field settings (undefined -> không round-trip YAML) và
  // nếu đang đứng ở tab đó thì quay về Flow Diagram.
  const removePage = (page: (typeof EXTRA_PAGES)[number]) => {
    setSettings({ [page.settingsKey]: undefined });
    if (active === page.id) setTab('flow');
  };

  const renderTab = (
    tab: { id: CanvasTab; labelKey: TKey; icon: string },
    onClose?: () => void,
  ) => {
    const on = tab.id === active;
    // Tab đóng được (trang bảng phụ) -> bọc div để nút chọn + nút xoá là 2 <button>
    // riêng (không lồng button). Nút xoá nằm bên phải, kiểu đóng tab Chrome.
    return (
      <div
        key={tab.id}
        className={[
          'flex items-center rounded-t-lg border border-b-0 text-[12.5px] font-semibold transition -mb-px',
          onClose ? 'pr-1.5' : '',
          on
            ? 'border-[var(--bk-border)] bg-[var(--bk-canvas)] text-[var(--bk-accent)]'
            : 'border-transparent text-[var(--bk-text-muted)] hover:bg-[color-mix(in_srgb,var(--bk-text)_6%,transparent)] hover:text-[var(--bk-text)]',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => setTab(tab.id)}
          aria-current={on ? 'page' : undefined}
          className={`flex items-center gap-2 py-2 pl-4 ${onClose ? 'pr-1.5' : 'pr-4'}`}
        >
          <Icon icon={tab.icon} width={14} height={14} />
          <span>{t(tab.labelKey)}</span>
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title={t('clRemovePage')}
            aria-label={t('clRemovePage')}
            className="flex h-5 w-5 items-center justify-center rounded-md text-[var(--bk-text-faint)] transition hover:bg-[color-mix(in_srgb,var(--bk-danger,#ef4444)_16%,transparent)] hover:text-[var(--bk-danger,#ef4444)]"
          >
            <Icon icon="line-md:close-small" width={16} height={16} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-end gap-1 border-b border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 pt-1.5">
      {TABS.map((tab) => renderTab(tab))}
      {openExtras.map((p) => renderTab(p, () => removePage(p)))}

      {/* Nút thêm trang (plus-circle-filled) -> menu chọn 1 trong 2 trang bảng phụ.
          self-center: căn giữa theo trục dọc của dải tab (không dính đáy như tab). */}
      <div className="relative mb-1 self-center" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title={t('ctAddPage')}
          aria-label={t('ctAddPage')}
          className={`flex items-center justify-center rounded-lg p-1.5 text-[var(--bk-text-muted)] transition hover:bg-[color-mix(in_srgb,var(--bk-text)_6%,transparent)] hover:text-[var(--bk-accent)] ${
            menuOpen ? 'text-[var(--bk-accent)]' : ''
          }`}
        >
          <Icon icon="line-md:plus-circle-filled" width={18} height={18} />
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-1 shadow-[var(--bk-shadow)]">
            <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
              {t('ctAddPage')}
            </div>
            {EXTRA_PAGES.map((p) => {
              const exists = settings[p.settingsKey] !== undefined;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => createPage(p)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--bk-text)] transition hover:bg-[var(--bk-surface-2)]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
                    <Icon icon={p.icon} width={15} height={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t(p.labelKey)}</span>
                  {exists && <Icon icon="lucide:check" width={15} height={15} className="text-[var(--bk-accent)]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
