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
    // Dấu hỏi trong vòng tròn twotone (nút info màn Status Settings) — body chính chủ.
    'question-circle-twotone': {
      body: '<g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="currentColor" fill-opacity="0" stroke-dasharray="60" d="M12 3c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9c0 -4.97 4.03 -9 9 -9Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="60;0"/><animate fill="freeze" attributeName="fill-opacity" begin="1s" dur="0.15s" to=".3"/></path><g fill="none"><path stroke-dasharray="18" stroke-dashoffset="18" d="M9 10c0 -1.66 1.34 -3 3 -3c1.66 0 3 1.34 3 3c0 0.98 -0.47 1.85 -1.2 2.4c-0.73 0.55 -1.3 0.6 -1.8 1.6"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.7s" dur="0.3s" to="0"/></path><path stroke-dasharray="4" stroke-dashoffset="4" d="M12 17v0.01"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.7s" dur="0.2s" to="0"/></path></g></g>',
    },
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
addCollection({
  prefix: 'mdi',
  width: 24,
  height: 24,
  icons: {
    // Badge "phiên bản mới nhất" trên màn quản lý flow (body chính chủ mdi:new-box).
    'new-box': {
      body: '<path fill="currentColor" d="M20 4c1.11 0 2 .89 2 2v12c0 1.11-.89 2-2 2H4c-1.11 0-2-.89-2-2V6c0-1.11.89-2 2-2zM8.5 15V9H7.25v3.5L4.75 9H3.5v6h1.25v-3.5L7.3 15zm5-4.74V9h-4v6h4v-1.25H11v-1.11h2.5v-1.26H11v-1.12zm7 3.74V9h-1.25v4.5h-1.12V10h-1.25v3.5h-1.13V9H14.5v5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1"/>',
    },
  },
});

// Icon gravity-ui (16x16) — cờ flag cho tab Status Settings + indicator node CS.
addCollection({
  prefix: 'gravity-ui',
  width: 16,
  height: 16,
  icons: {
    'flag': {
      body: '<path fill="currentColor" fill-rule="evenodd" d="M7.47 3.588a4.45 4.45 0 0 0-4.15-.224a.55.55 0 0 0-.32.499v5.533a6.25 6.25 0 0 1 5.547.439l.344.207a4.02 4.02 0 0 0 3.865.148a.44.44 0 0 0 .244-.395V4.182a6.26 6.26 0 0 1-5.386-.508zm5.957 7.944a5.52 5.52 0 0 1-5.307-.204l-.345-.207a4.75 4.75 0 0 0-4.314-.293L3 11.026v3.255a.75.75 0 0 1-1.5 0V3.863c0-.8.465-1.526 1.19-1.861a5.95 5.95 0 0 1 5.552.3l.144.086a4.76 4.76 0 0 0 4.447.24l.603-.278a.75.75 0 0 1 1.064.681v6.764c0 .735-.416 1.408-1.073 1.737" clip-rule="evenodd"/>',
    },
  },
});

// Icon Fluent bổ sung cho thanh công cụ canvas (nút toggle + zoom/fit/lock).
// Cùng prefix 'fluent' -> GỘP vào fluentSubset đã đăng ký ở trên (không ghi đè).
// Bộ Fluent mặc định 20x20 (khớp các icon "-20-filled").
addCollection({
  prefix: 'fluent',
  width: 20,
  height: 20,
  icons: {
    // Nút mở/đóng thanh công cụ canvas — 3 cột dọc (theo yêu cầu).
    'column-triple-20-filled': {
      body: '<path fill="currentColor" d="M3 17a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2zm6 0a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2zm6 0a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2z"/>',
    },
    'zoom-in-20-filled': {
      body: '<path fill="currentColor" d="M8.5 2a6.5 6.5 0 0 1 4.937 10.73l3.417 3.416a.5.5 0 0 1-.638.765l-.07-.058l-3.417-3.417A6.5 6.5 0 1 1 8.5 2m0 3.5A.5.5 0 0 0 8 6v2H6a.5.5 0 0 0 0 1h2v2a.5.5 0 0 0 1 0V9h2a.5.5 0 0 0 0-1H9V6a.5.5 0 0 0-.5-.5"/>',
    },
    'zoom-out-20-filled': {
      body: '<path fill="currentColor" d="M8.5 2a6.5 6.5 0 0 1 4.937 10.73l3.417 3.416a.5.5 0 0 1-.638.765l-.07-.058l-3.417-3.417A6.5 6.5 0 1 1 8.5 2M6 8a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1z"/>',
    },
    'arrow-fit-20-filled': {
      body: '<path fill="currentColor" d="M5.791 6.72a.75.75 0 0 1-.002 1.061L4.566 9H8.25a.75.75 0 0 1 0 1.5H4.56l1.22 1.22a.75.75 0 1 1-1.06 1.06l-2.5-2.5a.75.75 0 0 1 0-1.061l2.51-2.5a.75.75 0 0 1 1.061.002m8.429 0a.75.75 0 0 1 1.06 0l2.5 2.5a.75.75 0 0 1 0 1.06l-2.5 2.5a.75.75 0 1 1-1.06-1.06l1.22-1.22h-3.69a.75.75 0 0 1 0-1.5h3.69l-1.22-1.22a.75.75 0 0 1 0-1.06"/>',
    },
    'lock-closed-20-filled': {
      body: '<path fill="currentColor" d="M10 1a4 4 0 0 1 4 4v2.05a2.5 2.5 0 0 1 2 2.45v6a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 15.5v-6a2.5 2.5 0 0 1 2-2.45V5a4 4 0 0 1 4-4m0 10.5a1 1 0 1 0 0 2a1 1 0 0 0 0-2M10 2a3 3 0 0 0-3 3v2h6V5a3 3 0 0 0-3-3"/>',
    },
    'lock-open-20-filled': {
      body: '<path fill="currentColor" d="M15 1a4 4 0 0 1 4 4v.5a.5.5 0 0 1-1 0V5a3 3 0 1 0-6 0v2h1.5A2.5 2.5 0 0 1 16 9.5v6a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 15.5v-6A2.5 2.5 0 0 1 6.5 7H11V5a4 4 0 0 1 4-4m-5 10.5a1 1 0 1 0 0 2a1 1 0 0 0 0-2"/>',
    },
    // Indicator node CS: Re-confirm (vòng sync + dấu check) — body chính chủ
    // fluent:arrow-sync-checkmark-20-regular (20x20, khớp width bộ fluent).
    'arrow-sync-checkmark-20-regular': {
      body: '<path fill="currentColor" d="M11.414 3.635a.5.5 0 0 0 0-.707L9.293.807a.5.5 0 0 0-.707.707l.997.997a7.5 7.5 0 0 0-4.075 13.495a.5.5 0 0 0 .6-.8a6.5 6.5 0 0 1 5.29-11.554zM8.586 16.363l.016-.016q.613.135 1.264.15l-.006.006l.074-.004a6.5 6.5 0 0 0 3.959-11.706a.5.5 0 1 1 .6-.8q.424.317.81.703a7.5 7.5 0 0 1-4.886 12.791l.997.997a.5.5 0 1 1-.707.707l-2.121-2.12a.5.5 0 0 1 0-.708m3.768-8.218a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 0 1 .708-.708L9 10.792l2.646-2.647a.5.5 0 0 1 .708 0M5 10a5 5 0 1 1 10 0a5 5 0 0 1-10 0m5-4a4 4 0 1 0 0 8a4 4 0 0 0 0-8"/>',
    },
    // Indicator node CS: Retry (2 mũi tên sync đặc) — body chính chủ
    // fluent:arrow-sync-24-filled (24x24, khai width/height riêng vì bộ fluent mặc định 20).
    'arrow-sync-24-filled': {
      body: '<path fill="currentColor" d="M16.052 5.029a1 1 0 0 0 .189 1.401a7.002 7.002 0 0 1-3.157 12.487l.709-.71a1 1 0 0 0-1.414-1.414l-2.5 2.5a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 1.414-1.414l-.843-.842A9.001 9.001 0 0 0 17.453 4.84a1 1 0 0 0-1.401.189m-1.93-1.736l-2.5-2.5a1 1 0 0 0-1.498 1.32l.083.094l.843.843a9.001 9.001 0 0 0-4.778 15.892A1 1 0 0 0 7.545 17.4a7.002 7.002 0 0 1 3.37-12.316l-.708.709a1 1 0 0 0 1.32 1.497l.094-.083l2.5-2.5a1 1 0 0 0 .083-1.32z"/>',
      width: 24,
      height: 24,
    },
  },
});

// Icon fa6-solid bổ sung: check-double (indicator 復唱 trên node CS). Cùng prefix
// 'fa6-solid' -> GỘP vào fa6SolidSubset đã đăng ký (không ghi đè). Bộ fa6-solid
// 512x512; icon này khai width 448 riêng (viewBox gốc 448x512).
addCollection({
  prefix: 'fa6-solid',
  width: 512,
  height: 512,
  icons: {
    'check-double': {
      body: '<path fill="currentColor" d="M342.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 178.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l80 80c12.5 12.5 32.8 12.5 45.3 0zm96 128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 402.7L54.6 297.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l256-256z"/>',
      width: 448,
    },
  },
});

// Icon akar-icons (24x24): arrow-cycle (indicator リトライ trên node CS).
addCollection({
  prefix: 'akar-icons',
  width: 24,
  height: 24,
  icons: {
    'arrow-cycle': {
      body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M22 12c0 6-4.39 10-9.806 10C7.792 22 4.24 19.665 3 16m-1-4C2 6 6.39 2 11.807 2C16.208 2 19.758 4.335 21 8"/><path d="m7 17l-4-1l-1 4M17 7l4 1l1-4"/></g>',
    },
  },
});

// Icon app: dấu hỏi trong vòng tròn vẽ nét (nút info màn Status Settings). Vòng tròn
// vẽ viền rồi fill trắng, dấu hỏi "khoét" đen qua mask -> nét chấm hỏi rỗng. Iconify
// tự thay id mask thành id duy nhất mỗi lần render nên không lo trùng.
addCollection({
  prefix: 'app',
  width: 24,
  height: 24,
  icons: {
    'question-circle-draw': {
      body: '<path d="M0 0h24v24H0z" fill="none"/><defs><mask id="questionCircleMask"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="#fff" fill-opacity="0" stroke="#fff" stroke-dasharray="60" d="M3 12c0 -4.97 4.03 -9 9 -9c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="60;0"/><animate fill="freeze" attributeName="fill-opacity" begin="0.6s" dur="0.4s" to="1"/></path><path fill="none" stroke="#000" stroke-dasharray="18" stroke-dashoffset="18" d="M9 10c0 -1.66 1.34 -3 3 -3c1.66 0 3 1.34 3 3c0 0.98 -0.47 1.85 -1.2 2.4c-0.73 0.55 -1.3 0.6 -1.8 1.6"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1s" dur="0.3s" to="0"/></path><path fill="none" stroke="#000" stroke-dasharray="4" stroke-dashoffset="4" d="M12 17v0.01"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.3s" dur="0.2s" to="0"/></path></g></mask></defs><path fill="currentColor" d="M0 0h24v24H0z" mask="url(#questionCircleMask)"/>',
    },
  },
});

// Re-export để cả app import 1 chỗ (đảm bảo addCollection đã chạy trước khi render).
export { Icon };
