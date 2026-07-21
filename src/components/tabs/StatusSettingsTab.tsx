import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { ensureSettings, smsCharCount, SMS_WARN_LIMIT, DEFAULT_SMS_FLAG } from '../../ir/settings';
import type { FlowNode, SmsFlagEntry, StatusEntry } from '../../ir/types';
import { Icon } from '../../ui/icons';
import { AutoGrowTextarea } from '../AutoGrowTextarea';
import { useT, type TKey } from '../../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Tab "Status Settings / 通話状態設定" — 2 phần:
//   状態    : bảng Status/Flag. 7 status mặc định KHÔNG xoá/đổi flag (chỉ đổi tên);
//             status thêm tay sửa được cả flag + xoá được. Nút ⓘ mở modal quy tắc
//             đặt tên/đánh số (No.20~29 / No.5・50~59 / No.80~89).
//   SMSフラグ: bảng 区分/フラグ/SMS文言/文字数. Nội dung luôn kèm tag cố định
//             通話後送信URL (22 ký tự) ở dòng cuối; 文字数 tự đếm cả phần đó.
// Option của 2 bảng liên động sang cột 切断時フラグ của tab Announce List.
// ─────────────────────────────────────────────────────────────────────────────

// ── SMS認証設定: matching ưu tiên tên node Hearing theo regex gần nghĩa ─────────
// Thứ tự KIỂM TRA đặt 着信元 TRƯỚC 連絡先 để 2 loại "電話番号" không lẫn nhau.
const AUTH_MATCH: { key: string; re: RegExp }[] = [
  { key: '氏名', re: /(氏名|名前|お名前|姓名|フルネーム|受信者名|患者名|利用者名|お客様名)/ },
  { key: '生年月日', re: /(生年月日|誕生日|生年|バースデー|birth|dob)/i },
  { key: '診察券番号', re: /(診察券|カルテ番号|患者番号|会員番号|受付番号|予約番号)/ },
  { key: '着信元電話番号', re: /(着信元|発信元|着信番号|発信番号|発信者|着信者|かけている|今お使い)/ },
  { key: '連絡先電話番号', re: /(連絡先|折り返し|携帯|電話番号|お電話番号|tel|phone)/i },
];
// Thứ tự HIỂN THỊ (khác thứ tự kiểm tra): 連絡先 đứng trước 着信元.
const AUTH_DISPLAY_RANK: Record<string, number> = {
  氏名: 0,
  生年月日: 1,
  診察券番号: 2,
  連絡先電話番号: 3,
  着信元電話番号: 4,
};
function authRank(label: string): number {
  for (const m of AUTH_MATCH) if (m.re.test(label)) return AUTH_DISPLAY_RANK[m.key];
  return 99; // không khớp -> giữ theo thứ tự flow, xuống sau nhóm ưu tiên.
}

// Option 認証設定: 認証なし + 優先1(đỏ)/優先2(cam)/優先3(xanh lá) — kiểu chip.
type AuthPriority = 'none' | '1' | '2' | '3';
const AUTH_CHIP: Record<AuthPriority, { labelKey: TKey; cls: string }> = {
  none: { labelKey: 'stAuthNone', cls: 'bg-[var(--bk-surface-2)] text-[var(--bk-text-muted)]' },
  '1': { labelKey: 'stAuthP1', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  '2': { labelKey: 'stAuthP2', cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  '3': { labelKey: 'stAuthP3', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
};

export function StatusSettingsTab() {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const setSettings = useFlowStore((s) => s.setSettings);
  const setNodeData = useFlowStore((s) => s.setNodeData);
  const settings = ensureSettings(ir?.settings);
  const [showInfo, setShowInfo] = useState(false);

  // Có SMS flag nào KHÁC -2 (送信なし) không -> mới hiện block SMS認証設定.
  const hasExtraSmsFlag = settings.smsFlags.some((s) => s.flag !== DEFAULT_SMS_FLAG);

  // Danh sách node Hearing sắp theo: ưu tiên (氏名/生年月日/診察券番号/連絡先電話番号/
  // 着信元電話番号 — khớp regex gần nghĩa) lên đầu; còn lại theo thứ tự flow (y, x).
  const authNodes = useMemo<FlowNode[]>(() => {
    const interactions = (ir?.nodes ?? []).filter((n) => n.type === 'interaction');
    const byFlow = [...interactions].sort(
      (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
    );
    return [...byFlow].sort((a, b) => authRank(a.label) - authRank(b.label));
  }, [ir]);

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
                    {s.fixed ? (
                      // SMS flag mặc định (送信なし): 区分 cố định, không sửa.
                      <span className="inline-flex w-full items-center rounded-lg bg-[var(--bk-surface-2)] px-2.5 py-1.5 text-sm font-bold text-[var(--bk-text-muted)]">
                        {s.type}
                      </span>
                    ) : (
                      cellInput(s.type, (v) =>
                        setSmsFlags(settings.smsFlags.map((x, j) => (j === i ? { ...x, type: v } : x))),
                      )
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {s.fixed ? (
                      // Flag mặc định (-2): cố định, không sửa số.
                      <span className="inline-flex w-full justify-center rounded-lg bg-[var(--bk-surface-2)] px-2 py-1.5 text-sm font-bold text-[var(--bk-text-muted)]">
                        {s.flag}
                      </span>
                    ) : (
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
                              j === i && !x.fixed ? { ...x, flag: Math.min(99, Math.max(1, x.flag)) } : x,
                            ),
                          )
                        }
                        className="w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1.5 text-center text-sm text-[var(--bk-text)]"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {s.fixed ? (
                      // Nội dung mặc định để rỗng, không sửa.
                      <span className="inline-flex px-2.5 py-1.5 text-sm text-[var(--bk-text-faint)]">ー</span>
                    ) : (
                      // Ô SMS文言: textbox tự cao theo nội dung (Enter xuống dòng được).
                      // Tag 通話後送信URL (22 ký tự) nằm NGAY TRONG ô, luôn là dòng cuối —
                      // chỉ hiện khi đã nhập nội dung.
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
                    )}
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
                    {!s.fixed && (
                      <button
                        type="button"
                        onClick={() => setSmsFlags(settings.smsFlags.filter((_, j) => j !== i))}
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
          {addBtn(t('stAddSms'), () =>
            setSmsFlags([...settings.smsFlags, { type: '', flag: nextSmsFlag(), content: '' }]),
          )}
        </section>

        {/* ── SMS認証設定: chỉ hiện khi có SMS flag khác -2 ── */}
        {hasExtraSmsFlag && (
          <section className="mt-4 rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-4">
            <h3 className="mb-3 text-[13px] font-bold text-[var(--bk-text)]">{t('stSecSmsAuth')}</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--bk-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                  <th className="px-2 py-2">{t('stAuthColItem')}</th>
                  <th className="w-48 px-2 py-2">{t('stAuthColSetting')}</th>
                  {/* Cột 確認画面表示 rộng ra: lấy đúng phần bề ngang bớt đi của cột
                      Hiển thị màn chi tiết (cột 1 là cột co giãn, tự nhường chỗ). */}
                  <th className="w-72 px-2 py-2 text-center">{t('stAuthColDisplay')}</th>
                </tr>
              </thead>
              <tbody>
                {authNodes.map((node) => {
                  const priority = (node.data.smsAuthPriority as AuthPriority) ?? 'none';
                  const display = node.data.smsAuthDisplay === 'no' ? 'no' : 'yes';
                  return (
                    <tr key={node.id} className="border-b border-[var(--bk-border)] last:border-0">
                      <td className="px-2 py-2 font-medium text-[var(--bk-text)]">{node.label}</td>
                      <td className="px-2 py-1.5">
                        <AuthPrioritySelect
                          value={priority}
                          onChange={(v) => setNodeData(node.id, { smsAuthPriority: v })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <DisplaySelect
                          value={display}
                          onChange={(v) => setNodeData(node.id, { smsAuthDisplay: v })}
                        />
                      </td>
                    </tr>
                  );
                })}
                {authNodes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-6 text-center text-xs text-[var(--bk-text-faint)]">
                      {t('alEmpty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}
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

// Pulldown TỰ VẼ nhỏ dùng chung cho 認証設定 / 確認画面表示 (đóng khi click ngoài).
function MiniDropdown({
  trigger,
  children,
  width = 'w-full',
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className={`relative ${width}`} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2 py-1.5 text-left"
      >
        {trigger(open)}
        <Icon icon="lucide:chevron-down" width={14} height={14} className="shrink-0 text-[var(--bk-text-faint)]" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] p-1 shadow-[var(--bk-shadow)]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// Pulldown 認証設定: chip 認証なし / 優先1(đỏ)/優先2(cam)/優先3(xanh).
function AuthPrioritySelect({ value, onChange }: { value: AuthPriority; onChange: (v: AuthPriority) => void }) {
  const t = useT();
  const chip = (v: AuthPriority) => {
    const c = AUTH_CHIP[v];
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${c.cls}`}>
        {t(c.labelKey)}
      </span>
    );
  };
  return (
    <MiniDropdown trigger={() => chip(value)}>
      {(close) => (
        <>
          {(['none', '1', '2', '3'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                onChange(v);
                close();
              }}
              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition hover:bg-[var(--bk-surface-2)] ${
                v === value ? 'bg-[var(--bk-accent-soft)]' : ''
              }`}
            >
              {chip(v)}
            </button>
          ))}
        </>
      )}
    </MiniDropdown>
  );
}

// 確認画面表示: NÚT BẤM toggle yes<->no bằng icon (không còn pulldown).
//   yes → line-md:circle-filled-to-confirm-circle-filled-transition (xanh lá)
//   no  → line-md:minus-circle-filled-transition (đỏ nhẹ) — vòng tròn tô đặc ngay,
//         chỉ nét dấu trừ animate (đồng bộ style với icon yes).
function DisplaySelect({ value, onChange }: { value: 'yes' | 'no'; onChange: (v: 'yes' | 'no') => void }) {
  const face =
    value === 'yes'
      ? { icon: 'line-md:circle-filled-to-confirm-circle-filled-transition', cls: 'text-emerald-500', label: 'YES' }
      : { icon: 'line-md:minus-circle-filled-transition', cls: 'text-rose-400', label: 'NO' };
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => onChange(value === 'yes' ? 'no' : 'yes')}
        aria-label={face.label}
        title={face.label}
        className={`inline-flex items-center justify-center rounded-lg p-1.5 transition hover:bg-[var(--bk-surface-2)] ${face.cls}`}
      >
        {/* key theo value để icon re-mount, chạy lại animation vẽ nét khi toggle */}
        <Icon key={value} icon={face.icon} width={22} height={22} />
      </button>
    </div>
  );
}
