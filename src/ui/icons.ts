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

// Re-export để cả app import 1 chỗ (đảm bảo addCollection đã chạy trước khi render).
export { Icon };
