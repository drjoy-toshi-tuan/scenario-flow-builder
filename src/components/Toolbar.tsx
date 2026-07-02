import { useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { useAuth } from '../auth/useAuth';
import { useTheme } from '../ui/theme';
import { useLang, useT } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { SlideToggle } from './SlideToggle';

// Thanh công cụ trên cùng: tên flow, nút Tự sắp xếp / Xuất YAML, toggle theme & ngôn ngữ, user.
export function Toolbar() {
  const ir = useFlowStore((s) => s.ir);
  const autoLayout = useFlowStore((s) => s.autoLayout);
  const exportYaml = useFlowStore((s) => s.exportYaml);
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  const t = useT();
  const [busy, setBusy] = useState(false);

  const handleAutoLayout = async () => {
    setBusy(true);
    try {
      await autoLayout();
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    const yaml = exportYaml();
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ir?.meta.id ?? 'flow'}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="flex items-center justify-between border-b border-[var(--bk-border)] bg-[var(--bk-surface)] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bk-accent-soft)] text-lg text-[var(--bk-accent)]">
          <Icon icon="lucide:phone" />
        </span>
        <div>
          <div className="text-sm font-semibold text-[var(--bk-text)]">
            {ir?.meta.name ?? 'AI電話 Flow Builder'}
          </div>
          <div className="text-[11px] text-[var(--bk-text-faint)]">
            {ir ? t('stats', { n: ir.nodes.length, e: ir.edges.length }) : '…'}
          </div>
        </div>

        {/* Toggle ngôn ngữ & theme — đặt bên TRÁI cho header phải đỡ chật. */}
        <div className="ml-2 flex items-center gap-2 border-l border-[var(--bk-border)] pl-3">
          <Icon
            icon="fa6-solid:language"
            width={18}
            height={18}
            className="text-[var(--bk-text-muted)]"
          />
          <SlideToggle
            value={lang}
            options={[
              { key: 'vi', label: 'Tiếng Việt' },
              { key: 'ja', label: '日本語' },
            ]}
            onChange={(k) => setLang(k as 'vi' | 'ja')}
            ariaLabel="Language"
            title={lang === 'vi' ? 'Ngôn ngữ: Tiếng Việt' : '言語: 日本語'}
          />
          <SlideToggle
            value={theme}
            options={[
              { key: 'light', icon: 'lucide:sun' },
              { key: 'dark', icon: 'lucide:moon' },
            ]}
            onChange={(k) => setTheme(k as 'light' | 'dark')}
            ariaLabel="Theme"
            title={theme === 'dark' ? t('themeDark') : t('themeLight')}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--bk-border)] px-3 py-1.5 text-sm font-medium text-[var(--bk-text)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)] disabled:opacity-50"
          onClick={handleAutoLayout}
          disabled={busy || !ir}
        >
          <Icon icon="lucide:layout-dashboard" width={16} height={16} />
          {busy ? t('autoLayoutBusy') : t('autoLayout')}
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg bg-[var(--bk-accent)] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          onClick={handleExport}
          disabled={!ir}
        >
          <Icon icon="lucide:download" width={16} height={16} />
          {t('exportYaml')}
        </button>

        <div className="flex items-center gap-2 border-l border-[var(--bk-border)] pl-3">
          {user?.picture && <img src={user.picture} alt="" className="h-7 w-7 rounded-full" />}
          <span
            className="max-w-[140px] truncate text-xs text-[var(--bk-text-muted)]"
            title={user?.email}
          >
            {user?.name}
          </span>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-[#ef4444] px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#dc2626]"
            onClick={signOut}
          >
            <Icon icon="lucide:log-out" width={14} height={14} />
            {t('logout')}
          </button>
        </div>
      </div>
    </header>
  );
}
