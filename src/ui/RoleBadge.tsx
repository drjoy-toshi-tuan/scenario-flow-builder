import { useT } from './i18n';
import type { PermRole } from '../drive/permissions';

// ─────────────────────────────────────────────────────────────────────────────
// Stamp nhỏ hiển thị QUYỀN của user (owner/admin/user) — đặt dưới tên trong menu
// tài khoản. Dáng giống WorkspaceStamp: bo góc, nền hơi trong (color-mix với
// transparent) + chữ/viền cùng màu quyền cho hài hoà:
//   user  → xanh emerald | admin → đỏ | owner → tím neon.
// Nhãn dịch VI/JA qua pmRole* (Owner/Admin/User · オーナー/管理者/ユーザー).
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<PermRole, string> = {
  user: '#10b981', // emerald
  admin: '#dc2626', // đỏ
  owner: '#a855f7', // tím neon
};

const ROLE_KEY = {
  owner: 'pmRoleOwner',
  admin: 'pmRoleAdmin',
  user: 'pmRoleUser',
} as const;

export function RoleBadge({ role, className = '' }: { role: PermRole; className?: string }) {
  const t = useT();
  const color = ROLE_COLOR[role];
  return (
    <span
      className={`inline-flex w-fit items-center rounded-md border px-1.5 py-px text-[9px] font-bold uppercase leading-none tracking-wider ${className}`}
      style={{
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        color,
        fontFamily: "'Space Grotesk', 'Zen Kaku Gothic New', sans-serif",
      }}
    >
      {t(ROLE_KEY[role])}
    </span>
  );
}
