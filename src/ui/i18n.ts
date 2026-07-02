import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// i18n tối giản (không thêm thư viện): store zustand giữ ngôn ngữ hiện tại +
// từ điển VI/JA. Component dùng hook useT() để lấy hàm dịch, tự re-render khi
// đổi ngôn ngữ (kể cả node trên canvas vì subscribe store).
// ─────────────────────────────────────────────────────────────────────────────

export type Lang = 'vi' | 'ja';

const STORAGE_KEY = 'bk-lang';

function getInitialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'ja' || saved === 'vi' ? saved : 'vi';
}

// Từ điển — VI và JA phải cùng bộ key.
const DICT: Record<Lang, Record<string, string>> = {
  vi: {
    autoLayout: 'Tự sắp xếp',
    autoLayoutBusy: 'Đang sắp xếp…',
    exportYaml: 'Xuất YAML',
    logout: 'Đăng xuất',
    themeLight: 'Chế độ sáng',
    themeDark: 'Chế độ tối',
    stats: '{n} node · {e} dây',
    addModule: 'Thêm module',
    chooseType: 'Chọn loại module',
    nodeName: 'Tên module',
    description: 'Mô tả',
    descriptionPlaceholder: 'Mô tả ngắn hiển thị trên node…',
    params: 'Tham số',
    close: 'Đóng',
    noDescription: 'Chưa có mô tả',
    edit: 'Sửa',
    delete: 'Xoá',
    editTitle: 'Chỉnh sửa',
    deleteNodeTitle: 'Xoá module',
    deleteEdgeTitle: 'Xoá dây',
    loginSubtitle: 'Đăng nhập bằng tài khoản @{domain}',
    loginReadError: 'Không đọc được thông tin đăng nhập.',
    loginDomainError: 'Chỉ tài khoản @{domain} mới truy cập được.',
    loginGoogleError: 'Đăng nhập Google thất bại. Thử lại.',
    loginDemoNotice:
      'Chưa cấu hình VITE_GOOGLE_CLIENT_ID. Bạn đang xem bản demo UI — đăng nhập Google bị tắt.',
    loginDemoButton: 'Vào chế độ demo (bỏ qua đăng nhập)',
    loginFooter:
      'Kiểm tra domain ở client-side chỉ là cổng UX cho nội bộ test UI, không phải bảo mật thật. Xem cảnh báo trong README.',
  },
  ja: {
    autoLayout: '自動レイアウト',
    autoLayoutBusy: '配置中…',
    exportYaml: 'YAML出力',
    logout: 'ログアウト',
    themeLight: 'ライトモード',
    themeDark: 'ダークモード',
    stats: '{n} ノード · {e} エッジ',
    addModule: 'モジュール追加',
    chooseType: 'モジュールの種類',
    nodeName: 'モジュール名',
    description: '説明',
    descriptionPlaceholder: 'ノードに表示される短い説明…',
    params: 'パラメータ',
    close: '閉じる',
    noDescription: '説明なし',
    edit: '編集',
    delete: '削除',
    editTitle: '編集',
    deleteNodeTitle: 'モジュールを削除',
    deleteEdgeTitle: '接続を削除',
    loginSubtitle: '@{domain} アカウントでログイン',
    loginReadError: 'ログイン情報を読み取れませんでした。',
    loginDomainError: '@{domain} のアカウントのみアクセスできます。',
    loginGoogleError: 'Googleログインに失敗しました。もう一度お試しください。',
    loginDemoNotice:
      'VITE_GOOGLE_CLIENT_ID が未設定です。UIデモを表示中 — Googleログインは無効です。',
    loginDemoButton: 'デモモードで開く（ログインをスキップ）',
    loginFooter:
      'クライアント側のドメイン確認は社内UIテスト用のUXゲートであり、実際のセキュリティではありません。READMEの注意を参照してください。',
  },
};

export type TKey = keyof (typeof DICT)['vi'];

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

function apply(lang: Lang) {
  document.documentElement.lang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
}

export const useLang = create<LangState>((set, get) => {
  const initial = getInitialLang();
  apply(initial);
  return {
    lang: initial,
    setLang: (lang) => {
      apply(lang);
      set({ lang });
    },
    toggle: () => {
      const next: Lang = get().lang === 'vi' ? 'ja' : 'vi';
      apply(next);
      set({ lang: next });
    },
  };
});

// Hook trả về hàm dịch t(key, params?). Subscribe `lang` để re-render khi đổi.
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: TKey, params?: Record<string, string | number>): string => {
    let text = DICT[lang][key] ?? DICT.vi[key] ?? key;
    if (params) {
      for (const p of Object.keys(params)) {
        text = text.replace(new RegExp(`\\{${p}\\}`, 'g'), String(params[p]));
      }
    }
    return text;
  };
}
