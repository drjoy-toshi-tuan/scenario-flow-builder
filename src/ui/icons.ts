// Đăng ký bộ icon Iconify (lucide) ở chế độ offline: dùng subset đã trim sẵn
// (src/ui/iconData.ts) nên KHÔNG gọi API api.iconify.design lúc runtime —
// hoạt động ngay cả khi deploy tĩnh trên GitHub Pages / mạng nội bộ.
import { addCollection, Icon } from '@iconify/react';
import {
  lucideSubset,
  mingcuteSubset,
  tablerSubset,
  fa6SolidSubset,
  fluentSubset,
  heroiconsSolidSubset,
  twemojiSubset,
  materialSymbolsSubset,
  fluentMdl2Subset,
  hugeiconsSubset,
  notoSubset,
  fa7SolidSubset,
  riSubset,
  lineMdSubset,
  mdiSubset,
  majesticonsSubset,
  svgSpinnersSubset,
} from './iconData';

addCollection(lucideSubset);
addCollection(mingcuteSubset);
addCollection(tablerSubset);
addCollection(fa6SolidSubset);
addCollection(fluentSubset);
addCollection(heroiconsSolidSubset);
addCollection(twemojiSubset);
addCollection(materialSymbolsSubset);
addCollection(fluentMdl2Subset);
addCollection(hugeiconsSubset);
addCollection(notoSubset);
addCollection(fa7SolidSubset);
addCollection(riSubset);
addCollection(lineMdSubset);
addCollection(mdiSubset);
addCollection(majesticonsSubset);
addCollection(svgSpinnersSubset);

// Icon line-md bổ sung ngoài subset trim sẵn (addCollection cùng prefix sẽ GỘP
// vào bộ đã đăng ký, không ghi đè các icon cũ).
addCollection({
  prefix: 'line-md',
  width: 24,
  height: 24,
  icons: {
    // Bong bóng chat tròn (nút Ghi chú khi CHƯA có memo) — body chính chủ line-md.
    'chat-round': {
      body: '<path fill="none" stroke="currentColor" stroke-dasharray="54" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16.82c-2.41 -1.25 -4 -3.39 -4 -5.82c0 -3.87 4.03 -7 9 -7c4.97 0 9 3.13 9 7c0 3.87 -4.03 7 -9 7c-1.85 0 -3.57 -0.43 -5 -1.18Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="54;0"/></path><path fill="currentColor" d="M5 15.5c1 1 2.5 2 4 2.5c-2 2 -5 3 -7 3c2 -2 3 -3.5 3 -5.5Z" opacity="0"><set fill="freeze" attributeName="opacity" begin="0.7s" to="1"/><animate fill="freeze" attributeName="d" begin="0.7s" dur="0.2s" values="M5 15.5c1 1 2.5 2 4 2.5c-0.71 -0.24 -1.43 -0.59 -2.09 -1c-0.72 -0.45 -1.39 -0.98 -1.91 -1.5Z;M5 15.5c1 1 2.5 2 4 2.5c-2 2 -5 3 -7 3c2 -2 3 -3.5 3 -5.5Z"/></path>',
    },
  },
});

// Icon SVG tự vẽ theo phong cách line-md (animation SMIL vẽ nét khi mount).
addCollection({
  prefix: 'app',
  width: 24,
  height: 24,
  icons: {
    // Chìa khóa (menu/modal Quản lý quyền) — thân vẽ 1 nét liền + arc lỗ khóa.
    'key-draw': {
      body: '<path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="66" stroke-dashoffset="66" d="M15 15a6 6 0 1 0-5.743-4.257L9 11l-5.707 5.707a1 1 0 0 0-.293.707V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1a1 1 0 0 1 1-1a1 1 0 0 0 1-1a1 1 0 0 1 1-1h.586a1 1 0 0 0 .707-.293L13 15l.257-.257A6 6 0 0 0 15 15"><animate fill="freeze" attributeName="stroke-dashoffset" dur="1s" values="66;0"/></path><path stroke-dasharray="4" stroke-dashoffset="4" d="M17 9a2 2 0 0 0-2-2"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.9s" dur="0.3s" to="0"/></path></g>',
    },
    // Bong bóng chat tròn CÓ 2 dòng chữ (nút Ghi chú khi ĐÃ có memo).
    'chat-round-text': {
      body: '<path d="M0 0h24v24H0z" fill="none"/><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="54" stroke-dashoffset="54" d="M7 16.82c-2.41 -1.25 -4 -3.39 -4 -5.82c0 -3.87 4.03 -7 9 -7c4.97 0 9 3.13 9 7c0 3.87 -4.03 7 -9 7c-1.85 0 -3.57 -0.43 -5 -1.18Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="54;0"/></path><g stroke-dasharray="8" stroke-dashoffset="8"><path d="M8 9h8"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.6s" dur="0.2s" to="0"/></path></g><path stroke-dasharray="5" stroke-dashoffset="5" d="M8 13h5"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.7s" dur="0.2s" to="0"/></path></g><path fill="currentColor" d="M5 15.5c1 1 2.5 2 4 2.5c-2 2 -5 3 -7 3c2 -2 3 -3.5 3 -5.5Z" opacity="0"><set fill="freeze" attributeName="opacity" begin="0.9s" to="1"/><animate fill="freeze" attributeName="d" begin="0.9s" dur="0.2s" values="M5 15.5c1 1 2.5 2 4 2.5c-0.71 -0.24 -1.43 -0.59 -2.09 -1c-0.72 -0.45 -1.39 -0.98 -1.91 -1.5Z;M5 15.5c1 1 2.5 2 4 2.5c-2 2 -5 3 -7 3c2 -2 3 -3.5 3 -5.5Z"/></path>',
    },
  },
});

// Re-export để cả app import 1 chỗ (đảm bảo addCollection đã chạy trước khi render).
export { Icon };
