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
    // Bong bóng chat tròn CÓ 2 dòng chữ (nút Ghi chú khi ĐÃ có memo) — bản FILLED:
    // thân vẽ nét rồi fill đặc, 2 gạch "khắc lỗ" qua mask (Iconify tự thay id mask
    // thành id duy nhất mỗi lần render nên không lo trùng).
    'chat-round-text': {
      body: '<path d="M0 0h24v24H0z" fill="none"/><defs><mask id="chatBubbleLinesMask"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="#fff" fill-opacity="0" stroke="#fff" stroke-dasharray="54" d="M7 16.82c-2.41 -1.25 -4 -3.39 -4 -5.82c0 -3.87 4.03 -7 9 -7c4.97 0 9 3.13 9 7c0 3.87 -4.03 7 -9 7c-1.85 0 -3.57 -0.43 -5 -1.18Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="54;0"/><animate fill="freeze" attributeName="fill-opacity" begin="0.9s" dur="0.4s" to="1"/></path><path fill="#fff" d="M5 15.5c1 1 2.5 2 4 2.5c-2 2 -5 3 -7 3c2 -2 3 -3.5 3 -5.5Z" opacity="0"><set fill="freeze" attributeName="opacity" begin="0.7s" to="1"/><animate fill="freeze" attributeName="d" begin="0.7s" dur="0.2s" values="M5 15.5c1 1 2.5 2 4 2.5c-0.71 -0.24 -1.43 -0.59 -2.09 -1c-0.72 -0.45 -1.39 -0.98 -1.91 -1.5Z;M5 15.5c1 1 2.5 2 4 2.5c-2 2 -5 3 -7 3c2 -2 3 -3.5 3 -5.5Z"/></path><g fill="none" stroke="#000"><path stroke-dasharray="8" stroke-dashoffset="8" d="M8 9h8"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.4s" dur="0.2s" to="0"/></path><path stroke-dasharray="5" stroke-dashoffset="5" d="M8 13h5"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.5s" dur="0.2s" to="0"/></path></g></g></mask></defs><path fill="currentColor" d="M0 0h24v24H0z" mask="url(#chatBubbleLinesMask)"/>',
    },
    // Node Jump: 2 nút tròn nối bằng đường ống chữ S (flow rẽ nhánh).
    'jump-flow': {
      body: '<path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M18 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5m-3.935 1.779A4.001 4.001 0 0 1 22 8a4 4 0 0 1-7.92.8a1.75 1.75 0 0 0-1.33 1.7v3a3.25 3.25 0 0 1-2.815 3.221A4.001 4.001 0 1 1 9.92 15.2a1.75 1.75 0 0 0 1.33-1.699v-3a3.25 3.25 0 0 1 2.815-3.221M6 13.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5" stroke-width="1" stroke="currentColor"/>',
    },
  },
});

// Icon ngoài subset trim sẵn cho 2 node mới (thêm lẻ, cùng cách với line-md ở trên).
addCollection({
  prefix: 'mingcute',
  width: 24,
  height: 24,
  icons: {
    // Node Classifier — 4 ô phân loại (body chính chủ mingcute:classify-2-fill).
    'classify-2-fill': {
      body: '<g fill="none" fill-rule="evenodd"><path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M15.586 2.757a2 2 0 0 1 2.828 0l2.829 2.829a2 2 0 0 1 0 2.828l-2.829 2.829a2 2 0 0 1-2.828 0l-2.829-2.829a2 2 0 0 1 0-2.828zM9 3a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm12 12a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2zM9 13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z"/></g>',
    },
  },
});
addCollection({
  prefix: 'lucide',
  width: 24,
  height: 24,
  icons: {
    // Node Normalization — dấu ≈ (chuẩn hoá; body chính chủ lucide:equal-approximately).
    'equal-approximately': {
      body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15a6.5 6.5 0 0 1 7 0a6.5 6.5 0 0 0 7 0M5 9a6.5 6.5 0 0 1 7 0a6.5 6.5 0 0 0 7 0"/>',
    },
  },
});

// Re-export để cả app import 1 chỗ (đảm bảo addCollection đã chạy trước khi render).
export { Icon };
