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
    // Bong bóng chat FILLED có dòng chữ (icon "có câu announce" cột 復唱/リトライ
    // ở Announce List) — body chính chủ line-md:chat-filled (Iconify tự thay id
    // mask thành id duy nhất mỗi lần render nên không lo trùng).
    'chat-filled': {
      body: '<defs><mask id="chatFilledMask"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="#fff" fill-opacity="0" stroke="#fff" stroke-dasharray="70" d="M3 19.5v-15.5c0 -0.55 0.45 -1 1 -1h16c0.55 0 1 0.45 1 1v12c0 0.55 -0.45 1 -1 1h-14.5Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="70;0"/><animate fill="freeze" attributeName="fill-opacity" begin="0.7s" dur="0.4s" to="1"/></path><g fill="none" stroke="#000"><g stroke-dasharray="10" stroke-dashoffset="10"><path d="M8 7h8"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.2s" dur="0.2s" to="0"/></path><path d="M8 10h8"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.3s" dur="0.2s" to="0"/></path></g><path stroke-dasharray="6" stroke-dashoffset="6" d="M8 13h4"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.4s" dur="0.2s" to="0"/></path></g></g></mask></defs><path fill="currentColor" d="M0 0h24v24H0z" mask="url(#chatFilledMask)"/>',
    },
    // Bong bóng chat tròn (nút Ghi chú khi CHƯA có memo) — body chính chủ line-md.
    'chat-round': {
      body: '<path fill="none" stroke="currentColor" stroke-dasharray="54" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16.82c-2.41 -1.25 -4 -3.39 -4 -5.82c0 -3.87 4.03 -7 9 -7c4.97 0 9 3.13 9 7c0 3.87 -4.03 7 -9 7c-1.85 0 -3.57 -0.43 -5 -1.18Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="54;0"/></path><path fill="currentColor" d="M5 15.5c1 1 2.5 2 4 2.5c-2 2 -5 3 -7 3c2 -2 3 -3.5 3 -5.5Z" opacity="0"><set fill="freeze" attributeName="opacity" begin="0.7s" to="1"/><animate fill="freeze" attributeName="d" begin="0.7s" dur="0.2s" values="M5 15.5c1 1 2.5 2 4 2.5c-0.71 -0.24 -1.43 -0.59 -2.09 -1c-0.72 -0.45 -1.39 -0.98 -1.91 -1.5Z;M5 15.5c1 1 2.5 2 4 2.5c-2 2 -5 3 -7 3c2 -2 3 -3.5 3 -5.5Z"/></path>',
    },
    // Dấu check kép (nút toggle 復唱 màn Announce List) — body chính chủ line-md:check-all.
    'check-all': {
      body: '<defs><mask id="lineMdCheckAll"><g fill="none" stroke-dasharray="24" stroke-linecap="round" stroke-linejoin="round"><path stroke="#fff" stroke-width="2" d="M2 13.5l4 4l10.75 -10.75"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.5s" values="24;0"/></path><path stroke="#000" stroke-dashoffset="24" stroke-width="6" d="M7.5 13.5l4 4l10.75 -10.75"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.5s" dur="0.3s" to="0"/></path></g></mask></defs><path fill="currentColor" d="M0 0h24v24H0z" mask="url(#lineMdCheckAll)"/><path fill="none" stroke="currentColor" stroke-dasharray="24" stroke-dashoffset="24" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7.5 13.5l4 4l10.75 -10.75"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.5s" dur="0.3s" to="0"/></path>',
    },
    // Dấu cộng trong ô vuông ĐẶC (nút Thêm màn Retry・Re-confirm) — line-md:plus-square-filled.
    'plus-square-filled': {
      body: '<defs><mask id="lineMdPlusSquareFilled"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="#fff" fill-opacity="0" stroke="#fff" stroke-dasharray="66" d="M4 12v-7c0 -0.55 0.45 -1 1 -1h14c0.55 0 1 0.45 1 1v14c0 0.55 -0.45 1 -1 1h-14c-0.55 0 -1 -0.45 -1 -1Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="66;0"/><animate fill="freeze" attributeName="fill-opacity" begin="0.6s" dur="0.4s" to="1"/></path><g fill="none" stroke="#000" stroke-dasharray="12" stroke-dashoffset="12"><path d="M7 12h10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.1s" dur="0.2s" to="0"/></path><path d="M12 7v10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.3s" dur="0.2s" to="0"/></path></g></g></mask></defs><path fill="currentColor" d="M0 0h24v24H0z" mask="url(#lineMdPlusSquareFilled)"/>',
    },
    // Dấu cộng trong vòng tròn (xác nhận chọn node khi thêm) — line-md:plus-circle.
    'plus-circle': {
      body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="60" d="M3 12c0 -4.97 4.03 -9 9 -9c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="60;0"/></path><g stroke-dasharray="12" stroke-dashoffset="12"><path d="M7 12h10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.6s" dur="0.2s" to="0"/></path><path d="M12 7v10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.8s" dur="0.2s" to="0"/></path></g></g>',
    },
    // Dấu cộng ô vuông twotone (nút thêm trang trên dải tab) — line-md:plus-square-twotone.
    'plus-square-twotone': {
      body: '<g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="currentColor" fill-opacity="0" stroke-dasharray="66" d="M4 12v-7c0 -0.55 0.45 -1 1 -1h14c0.55 0 1 0.45 1 1v14c0 0.55 -0.45 1 -1 1h-14c-0.55 0 -1 -0.45 -1 -1Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="66;0"/><animate fill="freeze" attributeName="fill-opacity" begin="0.6s" dur="0.15s" to=".3"/></path><g fill="none" stroke-dasharray="12" stroke-dashoffset="12"><path d="M7 12h10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.85s" dur="0.2s" to="0"/></path><path d="M12 7v10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.05s" dur="0.2s" to="0"/></path></g></g>',
    },
    // Dấu cộng trong vòng tròn ĐẶC (nút thêm trang trên dải tab) — line-md:plus-circle-filled.
    'plus-circle-filled': {
      body: '<defs><mask id="lineMdPlusCircleFilled"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="#fff" fill-opacity="0" stroke="#fff" stroke-dasharray="60" d="M3 12c0 -4.97 4.03 -9 9 -9c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="60;0"/><animate fill="freeze" attributeName="fill-opacity" begin="0.6s" dur="0.4s" to="1"/></path><g fill="none" stroke="#000" stroke-dasharray="12" stroke-dashoffset="12"><path d="M7 12h10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.1s" dur="0.2s" to="0"/></path><path d="M12 7v10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.3s" dur="0.2s" to="0"/></path></g></g></mask></defs><path fill="currentColor" d="M0 0h24v24H0z" mask="url(#lineMdPlusCircleFilled)"/>',
    },
    // Dấu X nhỏ vẽ nét (nút đóng/xoá trang trên dải tab, kiểu đóng tab Chrome) — line-md:close-small.
    'close-small': {
      body: '<g fill="none" stroke="currentColor" stroke-dasharray="18" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M7 7l10 10"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.5s" values="18;0"/></path><path stroke-dashoffset="18" d="M17 7l-10 10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.5s" dur="0.5s" to="0"/></path></g>',
    },
    // Vòng tròn + dấu X (DISPLAY = no ở block SMS認証設定) — body chính chủ line-md:close-circle.
    'close-circle': {
      body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="60" d="M3 12c0 -4.97 4.03 -9 9 -9c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="60;0"/></path><path stroke-dasharray="8" stroke-dashoffset="8" d="M12 12l4 4M12 12l-4 -4M12 12l-4 4M12 12l4 -4"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.6s" dur="0.2s" to="0"/></path></g>',
    },
    // Vòng tròn + dấu check (DISPLAY = yes ở block SMS認証設定) — body chính chủ
    // line-md:circle-to-confirm-circle-transition.
    'circle-to-confirm-circle-transition': {
      body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12c0 -4.97 4.03 -9 9 -9c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9Z"/><path stroke-dasharray="14" d="M8 12l3 3l5 -5"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.2s" values="14;0"/></path></g>',
    },
    // Vòng tròn ĐẶC + dấu trừ (DISPLAY = no, nút bấm block SMS認証設定) — body chính
    // chủ line-md:minus-circle-filled (Iconify tự uniquify id mask mỗi lần render).
    'minus-circle-filled': {
      body: '<defs><mask id="SVG0usORzfX"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="#fff" fill-opacity="0" stroke="#fff" stroke-dasharray="60" d="M3 12c0 -4.97 4.03 -9 9 -9c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="60;0"/><animate fill="freeze" attributeName="fill-opacity" begin="0.6s" dur="0.4s" to="1"/></path><path fill="none" stroke="#000" stroke-dasharray="12" stroke-dashoffset="12" d="M7 12h10"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.1s" dur="0.2s" to="0"/></path></g></mask></defs><path fill="currentColor" d="M0 0h24v24H0z" mask="url(#SVG0usORzfX)"/>',
    },
    // Vòng tròn ĐẶC + dấu check (DISPLAY = yes, nút bấm block SMS認証設定) — body chính
    // chủ line-md:circle-filled-to-confirm-circle-filled-transition.
    'circle-filled-to-confirm-circle-filled-transition': {
      body: '<defs><mask id="SVGy4zdAbbT"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="#fff" stroke="#fff" d="M3 12c0 -4.97 4.03 -9 9 -9c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9Z"/><path fill="none" stroke="#000" stroke-dasharray="14" d="M8 12l3 3l5 -5"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.2s" values="14;0"/></path></g></mask></defs><path fill="currentColor" d="M0 0h24v24H0z" mask="url(#SVGy4zdAbbT)"/>',
    },
    // Vòng tròn ĐẶC + dấu trừ, vòng tròn tô đặc NGAY, chỉ nét dấu trừ vẽ animation
    // (DISPLAY = no) — đồng bộ với icon yes ở trên để toggle yes↔no chỉ animate nét
    // bên trong, không redraw cả vòng tròn mỗi lần bấm.
    'minus-circle-filled-transition': {
      body: '<defs><mask id="SVGminusCircleFilledTrans"><g stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="#fff" stroke="#fff" d="M3 12c0 -4.97 4.03 -9 9 -9c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9Z"/><path fill="none" stroke="#000" stroke-dasharray="12" stroke-dashoffset="12" d="M7 12h10"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.2s" values="14;0"/></path></g></mask></defs><path fill="currentColor" d="M0 0h24v24H0z" mask="url(#SVGminusCircleFilledTrans)"/>',
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

// Icon màn hình CS/TS (viewBox 22x24) — màn hình có chữ "CS"/"TS" bên trong, dùng
// cho bộ chuyển màn CS↔TS ở menu (owner). Body giữ nguyên path chính chủ (fill
// currentColor) để đổi màu theo bộ phận khi active.
addCollection({
  prefix: 'app',
  width: 22,
  height: 24,
  icons: {
    'screen-ts': {
      body: '<path d="M0 0h22v24H0z" fill="none"/><path fill="currentColor" d="M9.338 14.788q.212-.213.212-.538V10.5h.5q.325 0 .538-.213T10.8 9.75t-.213-.537T10.05 9h-2.5q-.325 0-.537.213T6.8 9.75t.213.538t.537.212h.5v3.75q0 .325.213.538T8.8 15t.538-.213M14.3 15q.425 0 .713-.288T15.3 14v-1.5q0-.425-.288-.788t-.712-.362H12.8v-.85h1.75q.325 0 .538-.212t.212-.538t-.213-.537T14.55 9H12.3q-.425 0-.712.288T11.3 10v1.5q0 .425.288.763t.712.337H13.8v.9h-1.75q-.325 0-.537.213t-.213.537t.213.538t.537.212M4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h14q.825 0 1.413.588T20 6v12q0 .825-.587 1.413T18 20z"/>',
    },
    'screen-cs': {
      body: '<path d="M0 0h22v24H0z" fill="none"/><path fill="currentColor" d="M7.55 15L9.8 15Q10.125 15 10.338 14.787Q10.551 14.574 10.55 14.25Q10.549 13.926 10.337 13.713Q10.125 13.5 9.8 13.5L8.05 13.5L8.05 10.5L9.8 10.5Q10.125 10.5 10.338 10.287Q10.551 10.074 10.55 9.75Q10.549 9.426 10.337 9.213Q10.125 9 9.8 9L7.55 9Q7.125 9 6.838 9.288Q6.551 9.576 6.55 10L6.55 14Q6.55 14.425 6.838 14.713Q7.126 15.001 7.55 15M12.2 15L14.45 15Q14.875 15 15.163 14.712Q15.451 14.424 15.45 14L15.45 12.5Q15.45 12.075 15.162 11.712Q14.874 11.349 14.45 11.35L12.95 11.35L12.95 10.5L14.7 10.5Q15.025 10.5 15.238 10.288Q15.451 10.076 15.45 9.75Q15.449 9.424 15.237 9.213Q15.025 9.002 14.7 9L12.45 9Q12.025 9 11.738 9.288Q11.451 9.576 11.45 10L11.45 11.5Q11.45 11.925 11.738 12.263Q12.026 12.601 12.45 12.6L13.95 12.6L13.95 13.5L12.2 13.5Q11.875 13.5 11.663 13.713Q11.451 13.926 11.45 14.25Q11.449 14.574 11.663 14.788Q11.877 15.002 12.2 15M4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h14q.825 0 1.413.588T20 6v12q0 .825-.587 1.413T18 20z"/>',
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
// Icon material-symbols-light (24x24) — dùng cho tab trang bảng phụ (診療科一覧 /
// コース・追加オプション一覧). Prefix mới, chưa có trong subset trim sẵn.
addCollection({
  prefix: 'material-symbols-light',
  width: 24,
  height: 24,
  icons: {
    // Danh sách dạng bảng (icon tab 診療科 / コース) — body chính chủ
    // material-symbols-light:view-list-outline.
    'view-list-outline': {
      body: '<path fill="currentColor" d="M8.5 18h10.885q.23 0 .423-.192t.192-.424v-2.559H8.5zM4 9.175h3.5V6H4.616q-.231 0-.424.192T4 6.616zm0 4.675h3.5v-3.675H4zM4.616 18H7.5v-3.175H4v2.56q0 .23.192.423t.423.192M8.5 13.85H20v-3.675H8.5zm0-4.675H20v-2.56q0-.23-.192-.423T19.385 6H8.5zM4.616 19q-.691 0-1.153-.462T3 17.384V6.616q0-.691.463-1.153T4.615 5h14.77q.69 0 1.152.463T21 6.616v10.769q0 .69-.463 1.153T19.385 19z"/>',
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

// Icon tabler bổ sung (thanh thao tác flow trên dải tab): layout-filled (Auto
// Layout) + file-download-filled (Export). Cùng prefix 'tabler' -> GỘP vào subset.
addCollection({
  prefix: 'tabler',
  width: 24,
  height: 24,
  icons: {
    'layout-filled': {
      body: '<path fill="currentColor" d="M8 3a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm0 9a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3zm10-9a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z"/>',
    },
    'file-download-filled': {
      body: '<path fill="currentColor" d="m12 2l.117.007a1 1 0 0 1 .876.876L13 3v4l.005.15a2 2 0 0 0 1.838 1.844L15 9h4l.117.007a1 1 0 0 1 .876.876L20 10v9a3 3 0 0 1-2.824 2.995L17 22H7a3 3 0 0 1-2.995-2.824L4 19V5a3 3 0 0 1 2.824-2.995L7 2zm0 8a1 1 0 0 0-1 1v3.585l-.793-.792a1 1 0 0 0-1.32-.083l-.094.083a1 1 0 0 0 0 1.414l2.5 2.5l.044.042l.068.055l.11.071l.114.054l.105.035l.15.03L12 18l.117-.007l.117-.02l.108-.033l.081-.034l.098-.052l.092-.064l.094-.083l2.5-2.5a1 1 0 0 0 0-1.414l-.094-.083a1 1 0 0 0-1.32.083l-.793.791V11a1 1 0 0 0-.883-.993zm2.999-7.001L19 7h-4z"/>',
    },
  },
});

// Icon fluent bổ sung: save-24-filled (nút Lưu flow trên dải tab). Bộ fluent mặc
// định 20x20 nên icon 24x24 phải khai width/height riêng.
addCollection({
  prefix: 'fluent',
  width: 20,
  height: 20,
  icons: {
    'save-24-filled': {
      body: '<path fill="currentColor" d="M6.75 3h-1A2.75 2.75 0 0 0 3 5.75v12.5A2.75 2.75 0 0 0 5.75 21H6v-6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 15v6h.25A2.75 2.75 0 0 0 21 18.25V8.286a3.25 3.25 0 0 0-.952-2.299l-2.035-2.035A3.25 3.25 0 0 0 15.75 3v4.5a2.25 2.25 0 0 1-2.25 2.25H9A2.25 2.25 0 0 1 6.75 7.5zm7.5 0v4.5a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75V3zm2.25 18v-6a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0-.75.75v6z"/>',
      width: 24,
      height: 24,
    },
  },
});

// Icon system-uicons: chevron-left-circle (nút mở panel flow settings trên dải tab
// màn TS) — chevron trong vòng tròn, mặc định hướng TRÁI, xoay xuống khi mở panel.
addCollection({
  prefix: 'system-uicons',
  width: 21,
  height: 21,
  icons: {
    'chevron-left-circle': {
      body: '<g fill="none" fill-rule="evenodd" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" transform="translate(2 2)"><circle cx="8.5" cy="8.5" r="8"/><path d="m9.55 11.4l-3-2.9l3-3"/></g>',
    },
  },
});

// Icon hugeicons: workflow-square-05 (tab Flow Designer màn TS). Cùng prefix
// 'hugeicons' -> GỘP vào subset đã đăng ký.
addCollection({
  prefix: 'hugeicons',
  width: 24,
  height: 24,
  icons: {
    'workflow-square-05': {
      body: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.4c0-1.131 0-1.697.351-2.049C3.703 2 4.27 2 5.4 2h.2c1.131 0 1.697 0 2.049.351C8 2.703 8 3.27 8 4.4v.2c0 1.131 0 1.697-.351 2.049C7.297 7 6.73 7 5.6 7h-.2c-1.131 0-1.697 0-2.049-.351C3 6.297 3 5.73 3 4.6zm13 5c0-1.131 0-1.697.352-2.049C16.702 7 17.269 7 18.4 7h.2c1.131 0 1.697 0 2.048.351C21 7.703 21 8.27 21 9.4v.2c0 1.131 0 1.697-.352 2.049c-.35.351-.917.351-2.048.351h-.2c-1.131 0-1.697 0-2.048-.351C16 11.297 16 10.73 16 9.6zm-13 5c0-1.131 0-1.697.351-2.049C3.703 12 4.27 12 5.4 12h.2c1.131 0 1.697 0 2.049.351C8 12.704 8 13.27 8 14.4v.2c0 1.131 0 1.697-.351 2.048C7.297 17 6.73 17 5.6 17h-.2c-1.131 0-1.697 0-2.049-.352C3 16.298 3 15.731 3 14.6zm13 5c0-1.131 0-1.697.352-2.048c.35-.352.917-.352 2.048-.352h.2c1.131 0 1.697 0 2.048.352c.352.35.352.917.352 2.048v.2c0 1.131 0 1.697-.352 2.048c-.35.352-.917.352-2.048.352h-.2c-1.131 0-1.697 0-2.048-.352C16 21.298 16 20.731 16 19.6z"/><path stroke-linecap="round" stroke-linejoin="round" d="m8 4.5l7 5l-6 5l7 5"/></g>',
    },
  },
});

// Icon ci: settings (tab General Settings màn CS) — bánh răng nét mảnh.
addCollection({
  prefix: 'ci',
  width: 24,
  height: 24,
  icons: {
    'settings': {
      body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m20.35 8.923l-.366-.204l-.113-.064a2 2 0 0 1-.67-.66c-.018-.027-.034-.056-.066-.112a2 2 0 0 1-.3-1.157l.006-.425c.012-.68.018-1.022-.078-1.328a2 2 0 0 0-.417-.736c-.214-.24-.511-.412-1.106-.754l-.494-.285c-.592-.341-.889-.512-1.204-.577a2 2 0 0 0-.843.007c-.313.07-.606.246-1.191.596l-.003.002l-.354.211c-.056.034-.085.05-.113.066c-.278.155-.588.24-.907.25c-.032.002-.065.002-.13.002l-.13-.001a2 2 0 0 1-.91-.252c-.028-.015-.055-.032-.111-.066l-.357-.214c-.589-.354-.884-.53-1.199-.601a2 2 0 0 0-.846-.006c-.316.066-.612.238-1.205.582l-.003.001l-.488.283l-.005.004c-.588.34-.883.512-1.095.751a2 2 0 0 0-.415.734c-.095.307-.09.649-.078 1.333l.007.424c0 .065.003.097.002.128a2 2 0 0 1-.301 1.027c-.033.056-.048.084-.065.11a2 2 0 0 1-.675.664l-.112.063l-.361.2c-.602.333-.903.5-1.121.738a2 2 0 0 0-.43.73c-.1.307-.1.65-.099 1.338l.002.563c.001.683.003 1.024.104 1.329a2 2 0 0 0 .427.726c.218.236.516.402 1.113.734l.358.199c.061.034.092.05.121.068a2 2 0 0 1 .74.781l.067.12a2 2 0 0 1 .23 1.038l-.007.407c-.012.686-.017 1.03.079 1.337c.085.272.227.523.417.736c.214.24.512.411 1.106.754l.494.285c.593.341.889.512 1.204.577a2 2 0 0 0 .843-.007c.314-.07.607-.246 1.194-.598l.354-.212l.113-.066c.278-.154.588-.24.907-.25l.13-.001h.13c.318.01.63.097.91.252l.092.055l.376.226c.59.354.884.53 1.199.6a2 2 0 0 0 .846.008c.315-.066.613-.239 1.206-.583l.495-.287c.588-.342.883-.513 1.095-.752c.19-.213.33-.463.415-.734c.095-.305.09-.644.078-1.318l-.008-.44v-.127a2 2 0 0 1 .3-1.028l.065-.11a2 2 0 0 1 .675-.664l.11-.061l.002-.001l.361-.2c.602-.334.903-.5 1.122-.738c.194-.21.34-.46.429-.73c.1-.305.1-.647.098-1.327l-.002-.574c-.001-.683-.002-1.025-.103-1.33a2 2 0 0 0-.428-.725c-.217-.236-.515-.402-1.111-.733z"/><path d="M8 12a4 4 0 1 0 8 0a4 4 0 0 0-8 0"/></g>',
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

// Icon bx: dialpad-alt (nút データ「電話番号」ở CS 分岐ロジック プロパティ設定) — bàn phím số.
addCollection({
  prefix: 'bx',
  width: 24,
  height: 24,
  icons: {
    'dialpad-alt': {
      body: '<circle cx="12" cy="6" r="2" fill="currentColor"/><circle cx="6" cy="6" r="2" fill="currentColor"/><circle cx="18" cy="6" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="18" r="2" fill="currentColor"/>',
    },
  },
});

// Icon griddy-icons: calendar-time-filled (nút データ「着信日時」ở CS 分岐ロジック プロパティ設定) — lịch + đồng hồ.
addCollection({
  prefix: 'griddy-icons',
  width: 24,
  height: 24,
  icons: {
    'calendar-time-filled': {
      body: '<path fill="currentColor" fill-rule="evenodd" d="M5.75 19.5h4.12c.29.545.645 1.045 1.055 1.5H5.75A2.755 2.755 0 0 1 3 18.25V5.75A2.755 2.755 0 0 1 5.75 3h.75V2H8v1h8V2h1.5v1h.75A2.755 2.755 0 0 1 21 5.75v4.265a7.5 7.5 0 0 0-1.5-.885V8.5h-15v9.75c0 .69.56 1.25 1.25 1.25m11.75-15H16V6h1.5zM8 4.5H6.5V6H8zM10.5 16c0-3.315 2.685-6 6-6s6 2.685 6 6s-2.685 6-6 6s-6-2.685-6-6m5.25.31l2.22 2.22l1.06-1.06l-1.78-1.78v-3.44h-1.5z" clip-rule="evenodd"/>',
    },
  },
});

// Re-export để cả app import 1 chỗ (đảm bảo addCollection đã chạy trước khi render).
export { Icon };
