import type { ReactNode } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { ensureSettings } from '../../ir/settings';
import { DAY_KEYS, type DayKey, type DaySchedule, type ScenarioSettings } from '../../ir/types';
import { Icon } from '../../ui/icons';
import { useT, type TKey } from '../../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Tab "General Settings / 基本設定" — form cấu hình kịch bản, chia 4 nhóm:
//   1. 基本情報   : 施設名 / シナリオ名 (ghi vào ir.meta)
//   2. 電話番号   : 代表電話 / 050 (Master・Demo, có stamp môi trường) / SMS送信番号
//   3. 稼働スケジュール: 稼働曜日 (stamp thứ + khung giờ, thêm/xoá) / 稼働休止期間
//   4. 応答タイミング : 発話待機時間 / 無回答待機時間 (giây)
// Mọi thay đổi ghi thẳng vào IR (ir.settings) -> lưu kèm YAML.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_LABEL_KEY: Record<DayKey, TKey> = {
  mon: 'dayMon',
  tue: 'dayTue',
  wed: 'dayWed',
  thu: 'dayThu',
  fri: 'dayFri',
  sat: 'daySat',
  sun: 'daySun',
  holiday: 'dayHoliday',
};

export function GeneralSettingsTab() {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const setMeta = useFlowStore((s) => s.setMeta);
  const setSettings = useFlowStore((s) => s.setSettings);
  const settings = ensureSettings(ir?.settings);

  const patch = (p: Partial<ScenarioSettings>) => setSettings(p);

  const updateDay = (day: DayKey, up: (d: DaySchedule) => DaySchedule) => {
    patch({ workingDays: settings.workingDays.map((d) => (d.day === day ? up(d) : d)) });
  };

  const input = (value: string, onChange: (v: string) => void, extra?: ReactNode) => (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-[420px] rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-3 py-2 text-sm text-[var(--bk-text)]"
      />
      {extra}
    </div>
  );

  // Stamp môi trường cạnh ô 050 (Master xanh / Demo cam — khớp màu badge màn quản lý flow).
  const stamp = (labelKey: TKey, cls: string) => (
    <span className={`inline-flex shrink-0 rounded-md px-2 py-1 text-[10px] font-bold text-white ${cls}`}>
      {t(labelKey)}
    </span>
  );

  const field = (label: string, control: ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[var(--bk-text-muted)]">{label}</span>
      {control}
    </div>
  );

  const group = (titleKey: TKey, children: ReactNode) => (
    <section className="rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-4">
      <h3 className="mb-3 text-[13px] font-bold text-[var(--bk-text)]">{t(titleKey)}</h3>
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  );

  const secondsInput = (value: string, onChange: (v: string) => void) => (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-3 py-2 text-sm text-[var(--bk-text)]"
      />
      <span className="text-xs text-[var(--bk-text-muted)]">{t('gsSeconds')}</span>
    </div>
  );

  return (
    <div className="h-full overflow-auto bg-[var(--bk-canvas)] p-5">
      <div className="mx-auto max-w-[900px]">
        <div className="mb-4 flex items-center gap-2 text-[15px] font-bold text-[var(--bk-text)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
            <Icon icon="lucide:layout-dashboard" width={17} height={17} />
          </span>
          {t('tabGeneral')}
        </div>

        <div className="flex flex-col gap-4">
          {group(
            'gsGroupBasic',
            <>
              {field(t('gsFacility'), input(ir?.meta.facility ?? '', (v) => setMeta({ facility: v })))}
              {field(t('gsScenario'), input(ir?.meta.name ?? '', (v) => setMeta({ name: v })))}
            </>,
          )}

          {group(
            'gsGroupPhone',
            <>
              {field(t('gsMainPhone'), input(settings.mainPhone, (v) => patch({ mainPhone: v })))}
              {field(
                t('gs050'),
                input(settings.master050, (v) => patch({ master050: v }), stamp('stampMaster', 'bg-emerald-500')),
              )}
              {field(
                t('gs050'),
                input(settings.demo050, (v) => patch({ demo050: v }), stamp('stampDemo', 'bg-orange-400')),
              )}
              {field(t('gsSmsNumber'), input(settings.smsNumber, (v) => patch({ smsNumber: v })))}
            </>,
          )}

          {group(
            'gsGroupSchedule',
            <>
              {field(
                t('gsWorkingDays'),
                <div className="flex flex-col gap-1.5">
                  {DAY_KEYS.map((day) => {
                    const sched = settings.workingDays.find((d) => d.day === day)!;
                    return (
                      <div key={day} className="flex items-start gap-3">
                        {/* Stamp thứ: bấm chọn -> sáng lên + hiện phần khung giờ */}
                        <button
                          type="button"
                          onClick={() =>
                            updateDay(day, (d) => ({
                              ...d,
                              enabled: !d.enabled,
                              // Bật ngày chưa có khung giờ -> seed 1 khung mặc định.
                              ranges: !d.enabled && d.ranges.length === 0 ? [{ from: '09:00', to: '17:00' }] : d.ranges,
                            }))
                          }
                          aria-pressed={sched.enabled}
                          className={`mt-0.5 inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-bold transition ${
                            sched.enabled
                              ? 'border-[var(--bk-accent)] bg-[var(--bk-accent)] text-white'
                              : 'border-[var(--bk-border)] bg-[var(--bk-surface-2)] text-[var(--bk-text-faint)] hover:text-[var(--bk-text)]'
                          }`}
                        >
                          {t(DAY_LABEL_KEY[day])}
                        </button>

                        {sched.enabled && (
                          <div className="flex flex-wrap items-center gap-2">
                            {sched.ranges.map((r, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1"
                              >
                                <input
                                  type="time"
                                  value={r.from}
                                  onChange={(e) =>
                                    updateDay(day, (d) => ({
                                      ...d,
                                      ranges: d.ranges.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)),
                                    }))
                                  }
                                  className="bg-transparent text-sm text-[var(--bk-text)]"
                                />
                                <span className="text-[var(--bk-text-faint)]">〜</span>
                                <input
                                  type="time"
                                  value={r.to}
                                  onChange={(e) =>
                                    updateDay(day, (d) => ({
                                      ...d,
                                      ranges: d.ranges.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)),
                                    }))
                                  }
                                  className="bg-transparent text-sm text-[var(--bk-text)]"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateDay(day, (d) => ({ ...d, ranges: d.ranges.filter((_, j) => j !== i) }))
                                  }
                                  className="ml-0.5 text-[var(--bk-text-faint)] transition hover:text-rose-500"
                                >
                                  <Icon icon="lucide:x" width={13} height={13} />
                                </button>
                              </span>
                            ))}
                            {/* 1 ngày có thể 2-4 khung giờ -> thêm được khung */}
                            <button
                              type="button"
                              onClick={() =>
                                updateDay(day, (d) => ({ ...d, ranges: [...d.ranges, { from: '', to: '' }] }))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[var(--bk-border)] px-2 py-1 text-xs text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
                            >
                              <Icon icon="lucide:plus" width={12} height={12} />
                              {t('gsAddRange')}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>,
              )}
              {field(
                t('gsRestPeriod'),
                <textarea
                  value={settings.restPeriod}
                  onChange={(e) => patch({ restPeriod: e.target.value })}
                  rows={2}
                  placeholder={t('gsRestPlaceholder')}
                  className="w-full max-w-[560px] resize-y rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-3 py-2 text-sm text-[var(--bk-text)]"
                />,
              )}
            </>,
          )}

          {group(
            'gsGroupTiming',
            <>
              {field(t('gsSilent'), secondsInput(settings.silentDetectionSec, (v) => patch({ silentDetectionSec: v })))}
              {field(t('gsTimeout'), secondsInput(settings.timeoutSec, (v) => patch({ timeoutSec: v })))}
            </>,
          )}
        </div>
      </div>
    </div>
  );
}
