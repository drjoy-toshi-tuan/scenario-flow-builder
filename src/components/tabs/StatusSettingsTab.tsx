import { useState } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { ensureSettings, smsCharCount, SMS_WARN_LIMIT } from '../../ir/settings';
import type { SmsFlagEntry, StatusEntry } from '../../ir/types';
import { Icon } from '../../ui/icons';
import { AutoGrowTextarea } from '../AutoGrowTextarea';
import { useT } from '../../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Tab "Status Settings / 通話状態設定" — 2 phần:
//   状態    : bảng Status/Flag. 7 status mặc định KHÔNG xoá/đổi flag (chỉ đổi tên);
//             status thêm tay sửa được cả flag + xoá được. Nút ⓘ mở modal quy tắc
//             đặt tên/đánh số (No.20~29 / No.5・50~59 / No.80~89).
//   SMSフラグ: bảng 区分/フラグ/SMS文言/文字数. Nội dung luôn kèm tag cố định
//             通話後送信URL (22 ký tự) ở dòng cuối; 文字数 tự đếm cả phần đó.
// Option của 2 bảng liên động sang cột 切断時フラグ của tab Announce List.
// ─────────────────────────────────────────────────────────────────────────────

export function StatusSettingsTab() {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const setSettings = useFlowStore((s) => s.setSettings);
  const settings = ensureSettings(ir?.settings);
  const [showInfo, setShowInfo] = useState(false);

  const setStatuses = (statuses: StatusEntry[]) => setSettings({ statuses });
  const setSmsFlags = (smsFlags: SmsFlagEntry[]) => setSettings({ smsFlags });

  // Flag gợi ý cho status thêm tay: số nhỏ nhất còn trống trong dải 20-29
  // (theo quy tắc trong modal info); hết dải thì lấy max+1.
  const nextStatusFlag = () => {
    const used = new Set(settings.statuses.map((s) => s.flag));
    for (let f = 20; f <= 29; f++) if (!used.has(f)) return f;
    return Math.max(...settings.statuses.map((s) => s.flag)) + 1;
  };

  const nextSmsFlag = () => {
    const used = new Set(settings.smsFlags.map((s) => s.flag));
    let f = 1;
    while (used.has(f)) f++;
    return f;
  };

  const cellInput = (value: string, onChange: (v: string) => void) => (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5 text-sm text-[var(--bk-text)]"
    />
  );

  const addBtn = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--bk-border)] px-3 py-1.5 text-xs font-semibold text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
    >
      <Icon icon="lucide:plus" width={13} height={13} />
      {label}
    </button>
  );

  return (
    <div className="h-full overflow-auto bg-[var(--bk-canvas)] p-5">
      <div className="mx-auto max-w-[900px]">
        <div className="mb-4 flex items-center gap-2 text-[15px] font-bold text-[var(--bk-text)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
            <Icon icon="gravity-ui:flag" width={17} height={17} />
          </span>
          {t('ctStatus')}
        </div>

        {/* ── 状態 ── */}
        <section className="rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-[var(--bk-text)]">{t('stSecStatus')}</h3>
            {/* Info: quy tắc đặt tên & đánh số */}
            <button
              type="button"
              onClick={() => setShowInfo(true)}
              title={t('stInfoTitle')}
              className="inline-flex h-5 w-5 items-center justify-center text-[#38bdf8] transition hover:brightness-110"
            >
              <Icon icon="app:question-circle-draw" width={19} height={19} />
            </button>
          </div>
          <table className="w-full max-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bk-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                <th className="px-2 py-2">{t('stColStatus')}</th>
                <th className="w-24 px-2 py-2">{t('stColFlag')}</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {settings.statuses.map((s, i) => (
                <tr key={`${s.flag}-${i}`} className="border-b border-[var(--bk-border)] last:border-0">
                  <td className="px-2 py-1.5">
                    {cellInput(s.name, (v) =>
                      setStatuses(settings.statuses.map((x, j) => (j === i ? { ...x, name: v } : x))),
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {s.fixed ? (
                      // Flag mặc định: cố định, không sửa số.
                      <span className="inline-flex w-full justify-center rounded-lg bg-[var(--bk-surface-2)] px-2 py-1.5 text-sm font-bold text-[var(--bk-text-muted)]">
                        {s.flag}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={6}
                        max={99}
                        value={s.flag}
                        onChange={(e) =>
                          setStatuses(
                            settings.statuses.map((x, j) => (j === i ? { ...x, flag: Number(e.target.value) } : x)),
                          )
                        }
                        onBlur={() =>
                          // Giới hạn cho chọn 6~99 — blur thì kẹp về trong dải.
                          setStatuses(
                            settings.statuses.map((x, j) =>
                              j === i && !x.fixed ? { ...x, flag: Math.min(99, Math.max(6, x.flag)) } : x,
                            ),
                          )
                        }
                        className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1.5 text-center text-sm text-[var(--bk-text)]"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {!s.fixed && (
                      <button
                        type="button"
                        onClick={() => setStatuses(settings.statuses.filter((_, j) => j !== i))}
                        className="text-[var(--bk-text-faint)] transition hover:text-rose-500"
                      >
                        <Icon icon="lucide:trash-2" width={15} height={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {addBtn(t('stAddStatus'), () => setStatuses([...settings.statuses, { name: '', flag: nextStatusFlag() }]))}
        </section>

        {/* ── SMSフラグ ── */}
        <section className="mt-4 rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-4">
          <h3 className="mb-3 text-[13px] font-bold text-[var(--bk-text)]">{t('stSecSms')}</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bk-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                <th className="w-40 px-2 py-2">{t('stColType')}</th>
                <th className="w-24 px-2 py-2">{t('stColFlag')}</th>
                <th className="px-2 py-2">{t('stColContent')}</th>
                <th className="w-24 px-2 py-2 text-center">{t('stColChars')}</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {settings.smsFlags.map((s, i) => (
                <tr key={i} className="border-b border-[var(--bk-border)] align-top last:border-0">
                  <td className="px-2 py-1.5">
                    {cellInput(s.type, (v) =>
                      setSmsFlags(settings.smsFlags.map((x, j) => (j === i ? { ...x, type: v } : x))),
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={s.flag}
                      onChange={(e) =>
                        setSmsFlags(
                          settings.smsFlags.map((x, j) => (j === i ? { ...x, flag: Number(e.target.value) } : x)),
                        )
                      }
                      onBlur={() =>
                        // Giới hạn 1~99 — blur thì kẹp về trong dải.
                        setSmsFlags(
                          settings.smsFlags.map((x, j) =>
                            j === i ? { ...x, flag: Math.min(99, Math.max(1, x.flag)) } : x,
                          ),
                        )
                      }
                      className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1.5 text-center text-sm text-[var(--bk-text)]"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {/* Ô SMS文言: textbox tự cao theo nội dung (Enter xuống dòng được).
                        Tag 通話後送信URL (22 ký tự) nằm NGAY TRONG ô, luôn là dòng cuối —
                        chỉ hiện khi đã nhập nội dung. */}
                    <div className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1.5">
                      <AutoGrowTextarea
                        allowNewlines
                        value={s.content}
                        onChange={(v) =>
                          setSmsFlags(
                            settings.smsFlags.map((x, j) => (j === i ? { ...x, content: v } : x)),
                          )
                        }
                        className="block w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--bk-text)] outline-none"
                      />
                      {s.content.trim() !== '' && (
                        <div className="mt-1 border-t border-dashed border-[var(--bk-border)] pt-1">
                          <span className="inline-flex items-center rounded-md bg-[var(--bk-surface-2)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--bk-text)]">
                            通話後送信URL
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center text-sm font-semibold text-[var(--bk-text-muted)]">
                    {(() => {
                      const count = smsCharCount(s.content);
                      const over = count > SMS_WARN_LIMIT; // từ 71 ký tự trở đi -> cảnh báo
                      return (
                        <span
                          className={`inline-flex items-center justify-center gap-1 ${over ? 'text-amber-500' : ''}`}
                          title={over ? t('stSmsTooLong') : undefined}
                        >
                          {over && <Icon icon="lucide:triangle-alert" width={14} height={14} />}
                          {count}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => setSmsFlags(settings.smsFlags.filter((_, j) => j !== i))}
                      className="text-[var(--bk-text-faint)] transition hover:text-rose-500"
                    >
                      <Icon icon="lucide:trash-2" width={15} height={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {addBtn(t('stAddSms'), () =>
            setSmsFlags([...settings.smsFlags, { type: '', flag: nextSmsFlag(), content: '' }]),
          )}
        </section>
      </div>

      {/* Modal quy tắc đặt tên/đánh số status */}
      {showInfo && (
        <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={() => setShowInfo(false)}>
          <div className="bk-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sm font-bold text-[var(--bk-text)]">{t('stInfoTitle')}</div>
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-auto text-[13px] leading-relaxed text-[var(--bk-text-muted)]">
              {(['stInfo1', 'stInfo2', 'stInfo3'] as const).map((k) => (
                <div key={k}>
                  <div className="mb-0.5 font-semibold text-[var(--bk-text)]">{t(`${k}Title`)}</div>
                  <p>{t(`${k}Body`)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
