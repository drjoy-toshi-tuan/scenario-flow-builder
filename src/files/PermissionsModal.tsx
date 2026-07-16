import { useT } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { SlideToggle } from '../components/SlideToggle';
import { OWNER_EMAIL, resolveRole, type Department, type PermissionsData } from '../drive/permissions';
import { formatDateTime } from '../ir/ivrProperty';

// ─────────────────────────────────────────────────────────────────────────────
// Modal 権限管理 — CHỈ owner thấy (mở từ menu màn quản lý flow). Liệt kê các tài
// khoản đã truy cập app (tự ghi nhận mỗi lần vào màn Drive), cho owner gạt
// quyền Admin/User và bộ phận CS/TS từng người (nhân sự chuyển bộ phận thì owner
// đổi ở đây). Không đóng khi click ra ngoài — chỉ nút Đóng.
// ─────────────────────────────────────────────────────────────────────────────

export function PermissionsModal({
  data,
  busy,
  error,
  onChangeRole,
  onChangeDepartment,
  onClose,
}: {
  data: PermissionsData;
  busy: boolean;
  // Lỗi khi đổi quyền (vd token Drive hết hạn) — hiện ngay trong modal.
  error?: string | null;
  // makeAdmin=true -> cấp Admin; false -> về User. Không truyền -> chỉ xem (mock).
  onChangeRole?: (email: string, makeAdmin: boolean) => void;
  // Gạt bộ phận CS/TS. Không truyền -> chỉ xem (mock).
  onChangeDepartment?: (email: string, department: Department) => void;
  onClose: () => void;
}) {
  const t = useT();

  // Owner luôn đứng đầu danh sách (kể cả chưa từng truy cập); còn lại sắp theo
  // lần truy cập gần nhất.
  const ownerMember = data.members.find((m) => m.email.toLowerCase() === OWNER_EMAIL) ?? {
    email: OWNER_EMAIL,
    name: '',
    lastAccessAt: '',
  };
  const others = data.members
    .filter((m) => m.email.toLowerCase() !== OWNER_EMAIL)
    .sort((a, b) => (a.lastAccessAt > b.lastAccessAt ? -1 : 1));

  const fmt = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : formatDateTime(d);
  };

  const roleBadge = (label: string, cls: string) => (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );

  return (
    <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true">
      {/* bk-modal mặc định 380px — nới cho bảng 4 cột + ảnh đại diện (style đè trực tiếp, không dùng important của Tailwind) */}
      <div className="bk-modal" style={{ maxWidth: 680 }}>
        <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
            <Icon icon="app:key-draw" width={15} height={15} />
          </span>
          {t('pmTitle')}
        </div>

        <div className="mb-4 mt-3 max-h-[50vh] overflow-auto rounded-xl border border-[var(--bk-border)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bk-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
                <th className="px-3 py-2">{t('pmColUser')}</th>
                <th className="px-3 py-2 whitespace-nowrap">{t('pmColLastAccess')}</th>
                <th className="px-3 py-2 text-right">{t('pmColDept')}</th>
                <th className="px-3 py-2 text-right">{t('pmColRole')}</th>
              </tr>
            </thead>
            <tbody>
              {[ownerMember, ...others].map((m) => {
                const role = resolveRole(m.email, data);
                return (
                  <tr key={m.email} className="border-b border-[var(--bk-border)] last:border-0">
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {/* Ảnh đại diện tròn (ghi kèm khi ghi nhận truy cập); chưa có ảnh ->
                            vòng tròn chữ cái đầu. referrerPolicy để ảnh googleusercontent không bị chặn. */}
                        {m.picture ? (
                          <img
                            src={m.picture}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bk-accent-soft)] text-sm font-bold text-[var(--bk-accent)]">
                            {(m.name.trim() || m.email).charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          {m.name && (
                            <div className="truncate font-medium text-[var(--bk-text)]">{m.name}</div>
                          )}
                          <div className="truncate text-xs text-[var(--bk-text-muted)]">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--bk-text-muted)]">
                      {fmt(m.lastAccessAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {/* Bộ phận gạt được cho MỌI thành viên (kể cả owner) — chưa gán
                          thì cả 2 nút đều nhạt để owner thấy ai còn thiếu. */}
                      <DeptToggle
                        value={m.department}
                        disabled={busy || !onChangeDepartment}
                        onSelect={(d) => onChangeDepartment?.(m.email, d)}
                        ariaLabel={`${t('pmColDept')}: ${m.email}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {role === 'owner' ? (
                        roleBadge(t('pmRoleOwner'), 'bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]')
                      ) : (
                        // Toggle trượt Admin/User (2 bên cân bằng — cùng kiểu với
                        // toggle Theme/Ngôn ngữ). Chỉ owner mở được modal này nên
                        // không cần kiểm tra thêm quyền ở đây.
                        <SlideToggle
                          value={role}
                          options={[
                            { key: 'admin', label: t('pmRoleAdmin') },
                            { key: 'user', label: t('pmRoleUser') },
                          ]}
                          onChange={(r) => onChangeRole?.(m.email, r === 'admin')}
                          disabled={busy || !onChangeRole}
                          ariaLabel={`${t('pmColRole')}: ${m.email}`}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {others.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-xs text-[var(--bk-text-faint)]">
                    {t('pmEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <Icon icon="lucide:triangle-alert" width={14} height={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Cặp nút CS/TS gạt bộ phận. KHÔNG dùng SlideToggle vì cần trạng thái "chưa gán"
// (không bên nào sáng) — SlideToggle luôn coi 1 trong 2 bên là đang chọn.
function DeptToggle({
  value,
  disabled,
  onSelect,
  ariaLabel,
}: {
  value?: Department;
  disabled: boolean;
  onSelect: (d: Department) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded-full border border-[var(--bk-border)] text-[11px] font-semibold"
    >
      {(['cs', 'ts'] as const).map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          disabled={disabled}
          onClick={() => value !== d && onSelect(d)}
          className={
            value === d
              ? 'bg-[var(--bk-accent)] px-2.5 py-1 text-white'
              : 'px-2.5 py-1 text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]'
          }
        >
          {d.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
