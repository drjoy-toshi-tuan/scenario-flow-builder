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
    autoLayout: 'Auto Layout',
    autoLayoutBusy: 'Đang sắp xếp…',
    exportYaml: 'YAML Export',
    logout: 'Đăng xuất',
    themeLight: 'Chế độ sáng',
    themeDark: 'Chế độ tối',
    // Header menu (dọc, đóng/mở)
    menu: 'Menu',
    secInterface: 'Cài đặt giao diện',
    secFlow: 'Cài đặt flow',
    mLanguage: 'Ngôn ngữ',
    mTheme: 'Giao diện',
    ivrProperty: 'Cài đặt IVR Property',
    // Modal IVR Property
    ivrFacility: 'Tên bệnh viện',
    ivrOfficeId: 'Office ID',
    ivrEnvironment: 'Môi trường',
    ivrEnvDemo: 'Demo',
    ivrEnvMaster: 'Master',
    ivrTts: 'TTS Engine',
    ivrStt: 'STT Engine',
    ivrTtsAmivoice: 'Amivoice',
    ivrTtsAiTalk: 'AI Talk',
    ivrSttAmivoice: 'Amivoice',
    ivrSttSoniox: 'Soniox',
    ivrPropertyText: 'IVR Property',
    ivrFacilityPlaceholder: 'Nhập tên bệnh viện…',
    ivrOfficeIdPlaceholder: 'Nhập Office ID…',
    stats: '{n} node · {e} dây',
    addModule: 'Thêm node',
    chooseType: 'Chọn loại node',
    startExists: 'Canvas đã có node Start',
    nodeName: 'Tên node',
    description: 'Mô tả',
    descriptionPlaceholder: 'Giải thích node này dùng để làm gì…',
    params: 'Tham số',
    close: 'Đóng',
    // Tab panel setting
    tabGeneral: 'General Settings',
    tabProperty: 'Property Settings',
    tabBranch: 'Branch Settings',
    // Nhãn tham số theo node
    fAnnounce: 'Announce',
    fInputType: 'Input Type',
    fVoiceType: 'Voice Type',
    fRetryCount: 'Retry Count',
    fRetryAnnounce: 'Retry Announce',
    fRepeat: 'Repeat',
    fRepeatAnnounce: 'Repeat Announce',
    fStatusFlag: 'Status Flag',
    fSmsFlag: 'SMS Flag',
    fSaveContext: 'Lưu context',
    fContextName: 'Tên context',
    fContextType: 'Kiểu context',
    fScript: 'Script (JavaScript ES2021+)',
    fModule: 'Module',
    fPrompt: 'Prompt',
    fTransferNumber: 'Số điện thoại nối máy',
    fTransferType: 'Kiểu nối máy',
    fFailedAnnounce: 'Failed Announce',
    fAcceptanceTime: 'Acceptance Time',
    fContextSetting: 'Context Setting',
    // Lựa chọn
    optYes: 'Có',
    optNo: 'Không',
    vtKanaName: 'Tên Kana',
    vtNumber: 'Số',
    vtPhone: 'Số điện thoại',
    vtDatetime: 'Ngày giờ',
    // Nhánh
    addBranch: 'Thêm nhánh',
    deleteBranch: 'Xoá nhánh',
    branchConditionPlaceholder: 'Nhập điều kiện (regex)',
    branchLabelPlaceholder: 'Nhãn',
    branchColValue: 'Value',
    branchColLabel: 'Label',
    branchColNode: 'Node',
    branchFixedNote: 'Node này không cho chỉnh sửa nhánh.',
    branchNoneNote: 'Node này không có nhánh.',
    noPropertyNote: 'Node này không có tham số.',
    showField: 'Hiện',
    hideField: 'Ẩn',
    branchTargetNone: 'CHƯA NỐI',
    branchElse: 'Nhánh mặc định (else) — tự khớp phần còn lại, không sửa được.',
    // Nút lưu/huỷ + cảnh báo thay đổi chưa lưu
    btnSave: 'LƯU',
    btnCancel: 'HỦY',
    unsavedTitle: 'Thay đổi chưa lưu',
    unsavedMessage: 'Bạn có thay đổi chưa được lưu. Nếu rời đi, các thay đổi sẽ bị mất. Tiếp tục?',
    discardChanges: 'Bỏ thay đổi',
    keepEditing: 'Tiếp tục sửa',
    syntaxErrorTitle: 'Script có lỗi cú pháp',
    syntaxErrorMessage: 'Script đang có lỗi cú pháp:',
    syntaxErrorFix: 'Quay lại sửa',
    syntaxErrorSaveAnyway: 'Vẫn lưu',
    noDescription: 'Chưa có mô tả',
    edit: 'Sửa',
    delete: 'Xoá',
    editTitle: 'Chỉnh sửa',
    deleteNodeTitle: 'Xoá node',
    deleteEdgeTitle: 'Xoá dây',
    confirmDeleteMessage: 'Bạn có chắc chắn muốn xoá node này không?',
    undo: 'Hoàn tác',
    redo: 'Làm lại',
    exStart: 'Điểm bắt đầu của luồng gọi',
    exAnnounce: 'Phát thông báo bằng giọng nói (TTS)',
    exInput: 'Nhận phím bấm (DTMF) hoặc giọng nói từ người gọi',
    exCondition: 'Rẽ nhánh theo điều kiện',
    exScript: 'Xử lý logic (chọn module hoặc viết script)',
    exLlm: 'Gọi mô hình AI (LLM) để xử lý hội thoại',
    exFaq: 'Trả lời câu hỏi thường gặp (FAQ)',
    exTransfer: 'Chuyển cuộc gọi tới máy nhánh / người khác',
    exFlag: 'Đặt cờ trạng thái / SMS cho cuộc gọi',
    exHangup: 'Kết thúc và ngắt cuộc gọi',
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
    autoLayout: 'Auto Layout',
    autoLayoutBusy: '配置中…',
    exportYaml: 'YAML Export',
    logout: 'ログアウト',
    themeLight: 'ライトモード',
    themeDark: 'ダークモード',
    // Header menu (dọc, đóng/mở)
    menu: 'メニュー',
    secInterface: 'インターフェース設定',
    secFlow: 'フロー設定',
    mLanguage: '言語',
    mTheme: 'テーマ',
    ivrProperty: 'IVRプロパティ設定',
    // Modal IVR Property
    ivrFacility: '施設名',
    ivrOfficeId: 'Office ID',
    ivrEnvironment: '環境',
    ivrEnvDemo: 'デモ',
    ivrEnvMaster: '本番',
    ivrTts: 'TTS Engine',
    ivrStt: 'STT Engine',
    ivrTtsAmivoice: 'Amivoice',
    ivrTtsAiTalk: 'AI Talk',
    ivrSttAmivoice: 'Amivoice',
    ivrSttSoniox: 'Soniox',
    ivrPropertyText: 'IVRプロパティ',
    ivrFacilityPlaceholder: '施設名を入力…',
    ivrOfficeIdPlaceholder: 'Office IDを入力…',
    stats: '{n} ノード · {e} エッジ',
    addModule: 'ノード追加',
    chooseType: 'ノードの種類',
    startExists: '既に Start ノードがあります',
    nodeName: 'ノード名',
    description: '説明',
    descriptionPlaceholder: 'このノードの目的を説明…',
    params: 'パラメータ',
    close: '閉じる',
    // Tab panel setting
    tabGeneral: '基本設定',
    tabProperty: 'プロパティ設定',
    tabBranch: '分岐設定',
    // Nhãn tham số theo node
    fAnnounce: 'アナウンス',
    fInputType: '入力タイプ',
    fVoiceType: '音声タイプ',
    fRetryCount: 'リトライ回数',
    fRetryAnnounce: 'リトライアナウンス',
    fRepeat: '復唱',
    fRepeatAnnounce: '復唱アナウンス',
    fStatusFlag: 'ステータスフラグ',
    fSmsFlag: 'SMSフラグ',
    fSaveContext: 'コンテキスト保存',
    fContextName: 'コンテキスト名',
    fContextType: 'コンテキスト形式',
    fScript: 'スクリプト（JavaScript ES2021+）',
    fModule: 'モジュール',
    fPrompt: 'プロンプト',
    fTransferNumber: '転送先番号',
    fTransferType: '転送タイプ',
    fFailedAnnounce: '転送失敗アナウンス',
    fAcceptanceTime: '受付時間',
    fContextSetting: 'コンテキスト設定',
    // Lựa chọn
    optYes: 'あり',
    optNo: 'なし',
    vtKanaName: '氏名カナ',
    vtNumber: '数値',
    vtPhone: '電話番号',
    vtDatetime: '日時',
    // Nhánh
    addBranch: '分岐を追加',
    deleteBranch: '分岐を削除',
    branchConditionPlaceholder: '条件を入力（正規表現）',
    branchLabelPlaceholder: 'ラベル',
    branchColValue: '値',
    branchColLabel: 'ラベル',
    branchColNode: 'ノード',
    branchFixedNote: 'このノードは分岐を編集できません。',
    branchNoneNote: 'このノードには分岐がありません。',
    noPropertyNote: 'このノードにはパラメータがありません。',
    showField: '表示',
    hideField: '非表示',
    branchTargetNone: '未接続',
    branchElse: 'デフォルト分岐（その他）— 残り全部に自動一致・編集不可。',
    // Nút lưu/huỷ + cảnh báo thay đổi chưa lưu
    btnSave: '保存',
    btnCancel: 'キャンセル',
    unsavedTitle: '未保存の変更',
    unsavedMessage: '未保存の変更があります。移動すると変更は破棄されます。よろしいですか？',
    discardChanges: '変更を破棄',
    keepEditing: '編集を続ける',
    syntaxErrorTitle: 'スクリプトに構文エラー',
    syntaxErrorMessage: 'スクリプトに構文エラーがあります：',
    syntaxErrorFix: '戻って修正',
    syntaxErrorSaveAnyway: 'このまま保存',
    noDescription: '説明なし',
    edit: '編集',
    delete: '削除',
    editTitle: '編集',
    deleteNodeTitle: 'ノードを削除',
    deleteEdgeTitle: '接続を削除',
    confirmDeleteMessage: 'このノードを削除してもよろしいですか？',
    undo: '元に戻す',
    redo: 'やり直し',
    exStart: '通話フローの開始点',
    exAnnounce: '音声アナウンス（TTS）を再生',
    exInput: '発信者のプッシュ（DTMF）や音声を受け取る',
    exCondition: '条件で分岐する',
    exScript: 'ロジック処理（モジュール選択またはスクリプト）',
    exLlm: 'AI（LLM）で会話を処理する',
    exFaq: 'よくある質問（FAQ）に回答する',
    exTransfer: '他の内線・担当者へ転送する',
    exFlag: 'ステータス／SMSフラグを設定する',
    exHangup: '通話を終了して切断する',
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
