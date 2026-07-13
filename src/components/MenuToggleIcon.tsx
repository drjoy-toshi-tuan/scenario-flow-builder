import { useRef } from 'react';
import { lineMdSubset } from '../ui/iconData';

// ─────────────────────────────────────────────────────────────────────────────
// Icon cho nút mở/đóng panel menu, có transition mượt của line-md:
//   • Lần đầu load (chưa mở bao giờ): hamburger tĩnh `menu`.
//   • Khi mở panel: morph hamburger → X (`menu-to-close-transition`).
//   • Khi đóng panel (bấm lại hoặc click ra ngoài): morph X → hamburger
//     (`close-to-menu-transition`).
//
// Icon line-md chạy animation SMIL 1 lần khi <svg> được mount. Nếu dùng
// <Icon> của @iconify/react, component đó render placeholder <span> trước rồi
// mới thay bằng <svg> trong effect — cú "swap" trễ này có thể rơi qua mốc 0.4s
// (fill="freeze") khiến animation hiện thẳng ở khung cuối → nhìn như bị "nhảy
// cóc" (nhất là lúc mở). Vì vậy ở đây render thẳng body SVG bằng key theo trạng
// thái: mỗi lần đổi open/đóng là <svg> mount MỚI hoàn toàn nên SMIL luôn chạy
// lại từ t=0, mượt và chính xác ở cả 2 chiều.
// (body lấy từ chính subset offline của app nên an toàn cho dangerouslySetInnerHTML.)
// ─────────────────────────────────────────────────────────────────────────────

type MenuIconName = 'menu' | 'menu-to-close-transition' | 'close-to-menu-transition';

export function MenuToggleIcon({ open, size = 22 }: { open: boolean; size?: number }) {
  // Đánh dấu đã từng mở: trước lần mở đầu tiên hiển thị icon tĩnh (không morph).
  const openedOnce = useRef(false);
  if (open) openedOnce.current = true;

  const name: MenuIconName = !openedOnce.current
    ? 'menu'
    : open
      ? 'menu-to-close-transition'
      : 'close-to-menu-transition';

  const body = lineMdSubset.icons[name].body;

  return (
    <svg
      key={name}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
