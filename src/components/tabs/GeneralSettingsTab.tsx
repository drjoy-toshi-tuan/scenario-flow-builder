import { useState, type ReactNode } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { ensureSettings } from '../../ir/settings';
import { DAY_KEYS, type DayKey, type DaySchedule, type ScenarioSettings } from '../../ir/types';
import { formatJapanesePhone, stripPhone } from '../../ui/phoneFormat';
import { Icon } from '../../ui/icons';
import { useT, type TKey } from '../../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Tab "General Settings / 基本設定" — form cấu hình kịch bản, chia 4 nhóm:
//   1. 基本情報   : 施設名 / シナリオ名 — CHỈ XEM (đổi tên ở màn quản lý file).
//   2. 電話番号   : 代表電話 / 050 (Demo trên・Master dưới, stamp デモ/本番) / SMS送信番号.
//      Ô số điện thoại: gõ số trần, blur tự chèn hyphen theo 市外局番 (xem
//      ui/phoneFormat.ts), focus lại thì bỏ hyphen để sửa.
//   3. 稼働スケジュール: 稼働曜日 — mỗi thứ chọn 24H (24時間) hoặc 時間帯 (khung giờ,
//      thêm/xoá được) / 稼働休止期間.
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

// Ô số điện thoại: focus -> hiện số trần để sửa; blur -> tự chèn hyphen.
function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={focused ? stripPhone(value) : value}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onChange(formatJapanesePhone(value));
      }}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      className="w-full max-w-[420px] rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-3 py-2 text-sm text-[var(--bk-text)]"
    />
  );
}

export function GeneralSettingsTab() {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const setSettings = useFlowStore((s) => s.setSettings);
  const settings = ensureSettings(ir?.settings);
  // Thứ vừa được bật -> đang chờ chọn chế độ (24H hay khung giờ). Chọn xong thì
  // chỉ hiển thị KẾT QUẢ (chip 24H hoặc các khung giờ), không hiện bộ chọn nữa.
  const [choosingDay, setChoosingDay] = useState<DayKey | null>(null);

  const patch = (p: Partial<ScenarioSettings>) => setSettings(p);

  const updateDay = (day: DayKey, up: (d: DaySchedule) => DaySchedule) => {
    patch({ workingDays: settings.workingDays.map((d) => (d.day === day ? up(d) : d)) });
  };

  // Ô chỉ xem (施設名/シナリオ名 — không cho sửa ở tab này).
  const readonlyBox = (value: string) => (
    <div className="w-full max-w-[420px] cursor-not-allowed rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text-muted)]">
      {value || '—'}
    </div>
  );

  const phoneField = (value: string, onChange: (v: string) => void, extra?: ReactNode) => (
    <div className="flex items-center gap-2">
      <PhoneInput value={value} onChange={onChange} />
      {extra}
    </div>
  );

  // Stamp môi trường cạnh ô 050 — dùng ĐÚNG stamp デモ/本番 (DEM/MAS) của màn quản lý.
  const envStamp = (env: 'master' | 'demo') => (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-bold uppercase leading-4 tracking-widest text-white"
      style={{
        background: env === 'master' ? '#10b981' : '#f97316',
        fontFamily: "'Space Grotesk', 'Zen Kaku Gothic New', sans-serif",
      }}
    >
      {t(env === 'master' ? 'dmEnvMaster' : 'dmEnvDemo')}
    </span>
  );

  // labelExtra: phần tử gắn NGAY CẠNH title (vd stamp デモ/本番 của ô 050).
  const field = (label: string, control: ReactNode, labelExtra?: ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-xs font-semibold text-[var(--bk-text-muted)]">
        {label}
        {labelExtra}
      </span>
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
          {t('ctGeneral')}
        </div>

        <div className="flex flex-col gap-4">
          {group(
            'gsGroupBasic',
            <>
              {field(t('gsFacility'), readonlyBox(ir?.meta.facility ?? ''))}
              {field(t('gsScenario'), readonlyBox(ir?.meta.name ?? ''))}
            </>,
          )}

          {group(
            'gsGroupPhone',
            <>
              {field(t('gsMainPhone'), phoneField(settings.mainPhone, (v) => patch({ mainPhone: v })))}
              {/* 050: Demo TRÊN, Master DƯỚI — stamp môi trường nằm CẠNH title. */}
              {field(
                t('gs050'),
                phoneField(settings.demo050, (v) => patch({ demo050: v })),
                envStamp('demo'),
              )}
              {field(
                t('gs050'),
                phoneField(settings.master050, (v) => patch({ master050: v })),
                envStamp('master'),
              )}
              {field(t('gsSmsNumber'), phoneField(settings.smsNumber, (v) => patch({ smsNumber: v })))}
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
                    // T2~T6 bật = xanh lá hơi ngả cyan (emerald); T7/CN/NL bật = đỏ tone
                    // sáng. Cả 2 dùng chữ TRẮNG — nền đủ đậm để tương phản tốt (AA cho chữ
                    // đậm) ở cả light lẫn dark theme.
                    const isRedDay = day === 'sat' || day === 'sun' || day === 'holiday';
                    return (
                      <div key={day} className="flex items-start gap-3">
                        {/* Stamp thứ: bấm bật -> hiện bộ chọn 24 GIỜ / khung giờ; bấm lại -> tắt */}
                        <button
                          type="button"
                          onClick={() => {
                            if (sched.enabled) {
                              updateDay(day, (d) => ({ ...d, enabled: false }));
                              setChoosingDay((cur) => (cur === day ? null : cur));
                            } else {
                              updateDay(day, (d) => ({ ...d, enabled: true }));
                              setChoosingDay(day);
                            }
                          }}
                          aria-pressed={sched.enabled}
                          className={`inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-bold transition ${
                            sched.enabled
                              ? isRedDay
                                ? 'border-[#ef4444] bg-[#ef4444] text-white'
                                : 'border-[#059669] bg-[#059669] text-white'
                              : 'border-[var(--bk-border)] bg-[var(--bk-surface-2)] text-[var(--bk-text-faint)] hover:text-[var(--bk-text)]'
                          }`}
                        >
                          {t(DAY_LABEL_KEY[day])}
                        </button>

                        {sched.enabled && (
                          // min-h = chiều cao stamp thứ (h-9) + items-center -> bộ chọn /
                          // chip kết quả luôn canh giữa theo hàng, không bị lệch lên trên.
                          <div className="flex min-h-9 flex-wrap items-center gap-2">
                            {choosingDay === day ? (
                              // Vừa bật -> hỏi chế độ: 24H (24時間) hay 時間帯 (khung giờ).
                              // Chọn xong bộ chọn biến mất, chỉ còn kết quả.
                              <span className="inline-flex overflow-hidden rounded-lg border border-[var(--bk-border)]">
                                {([true, false] as const).map((allDay) => (
                                  <button
                                    key={String(allDay)}
                                    type="button"
                                    onClick={() => {
                                      updateDay(day, (d) => ({
                                        ...d,
                                        allDay,
                                        // Chế độ khung giờ mà chưa có khung -> seed 1 khung mặc định.
                                        ranges:
                                          !allDay && d.ranges.length === 0
                                            ? [{ from: '09:00', to: '17:00' }]
                                            : d.ranges,
                                      }));
                                      setChoosingDay(null);
                                    }}
                                    className="bg-[var(--bk-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--bk-text-muted)] transition first:border-r first:border-[var(--bk-border)] hover:bg-[var(--bk-accent)] hover:text-white"
                                  >
                                    {t(allDay ? 'gs24h' : 'gsTimeframe')}
                                  </button>
                                ))}
                              </span>
                            ) : sched.allDay ? (
                              // 24 GIỜ (24時間): chip kết quả — bấm để chọn lại chế độ.
                              <button
                                type="button"
                                onClick={() => setChoosingDay(day)}
                                title={t('gsTimeframe')}
                                className="inline-flex items-center rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1 text-sm font-bold text-[var(--bk-text)] transition hover:border-[var(--bk-accent)]"
                              >
                                {t('gs24h')}
                              </button>
                            ) : (
                              <>
                                {sched.ranges.map((r, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1"
                                  >
                                    <input
                                      type="time"
                                      value={r.from}
                                      title={t('gsFromTime')}
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
                                      title={t('gsToTime')}
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
                              </>
                            )}
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
