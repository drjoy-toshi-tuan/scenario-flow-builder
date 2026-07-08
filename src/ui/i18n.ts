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
    loginNonceError: 'Phiên đăng nhập không hợp lệ (nonce sai). Thử lại.',
    loginExpiredError: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại.',
    loginNotConfigured:
      'Chưa cấu hình đăng nhập Google (thiếu Client ID). Vui lòng liên hệ quản trị viên.',
    // ── Quản lý file YAML (GitHub) ──
    fmTitle: 'Quản lý file YAML',
    fmSubtitle: 'Chọn file có sẵn hoặc tải lên file mới để mở trên canvas.',
    fmConnectTitle: 'Kết nối GitHub',
    fmConnectDesc:
      'Nhập token (fine-grained hoặc classic) có quyền ghi Contents trên repo này để đọc/ghi file YAML.',
    fmTokenLabel: 'GitHub Token',
    fmTokenPlaceholder: 'github_pat_… hoặc ghp_…',
    fmConnectBtn: 'Kết nối',
    fmConnecting: 'Đang kết nối…',
    fmDisconnect: 'Ngắt kết nối',
    fmConnectedAs: 'Đã kết nối: {login}',
    fmTokenHelp: 'Cách tạo token (Fine-grained, Contents: Read and write)',
    fmTokenHelpClassic: 'Hoặc tạo classic token (scope: repo) — chọn “No expiration” để nhập 1 lần dùng mãi mãi',
    fmTokenPersistNote:
      'Token được nhớ trên trình duyệt này qua các phiên — chỉ phải nhập lại khi token hết hạn hoặc bạn bấm “Ngắt kết nối”. Đừng dùng trên máy chung.',
    fmOpen: 'Mở',
    fmUpload: 'Tải file lên',
    fmUploading: 'Đang tải lên…',
    fmNew: 'Tạo flow mới',
    fmRefresh: 'Làm mới',
    fmEmpty: 'Chưa có file YAML nào trong thư mục này.',
    fmLoading: 'Đang tải danh sách…',
    fmBrowseRepo: 'Xem trên GitHub',
    fmFolderNote: 'Thư mục: {dir}',
    fmBackToFiles: 'Danh sách file',
    fmBackToManager: 'Về màn quản lý file',
    fmSaveToRepo: 'Lưu về repo',
    fmSaving: 'Đang lưu…',
    fmSaved: 'Đã lưu về repo',
    fmDeleteTitle: 'Xoá file',
    fmDeleteConfirm: 'Xoá file "{name}" khỏi repo? Hành động này không thể hoàn tác.',
    fmNewFlowName: 'New Flow',
    fmNamePrompt: 'Tên file (sẽ tự thêm .yaml nếu thiếu)',
    fmCreate: 'Tạo',
    fmUploadReplaceTitle: 'File đã tồn tại',
    fmUploadReplace: 'File "{name}" đã có trên repo. Ghi đè?',
    fmOverwrite: 'Ghi đè',
    commitUpload: 'Tải lên file YAML: {name}',
    commitCreate: 'Tạo flow mới: {name}',
    commitSave: 'Cập nhật flow: {name}',
    commitDelete: 'Xoá flow: {name}',
    ghErrAuth: 'Token không hợp lệ hoặc thiếu quyền (cần Contents: Read/Write đúng repo).',
    ghErrNotFound: 'Không tìm thấy repo/thư mục, hoặc token không có quyền truy cập.',
    ghErrConflict: 'Xung đột phiên bản. Hãy làm mới danh sách rồi thử lại.',
    ghErrNetwork: 'Không kết nối được GitHub. Kiểm tra mạng rồi thử lại.',
    ghErrRateLimit: 'Đã chạm giới hạn tần suất GitHub. Thử lại sau ít phút.',
    ghErrEmpty: 'Vui lòng nhập token.',
    ghErrOther: 'Có lỗi khi gọi GitHub. Thử lại.',
    fmUploadInvalid: 'File YAML không hợp lệ hoặc không đọc được.',
    fmNameRequired: 'Vui lòng nhập tên file.',
    // Cột bảng danh sách file
    colFacility: 'Tên bệnh viện',
    colScenario: 'Tên kịch bản',
    colCreatedAt: 'Ngày tạo',
    colUpdatedAt: 'Cập nhật cuối',
    colAuthor: 'Người tạo',
    colActions: 'Thao tác',
    // Form tạo flow mới
    fmFacilityPlaceholder: 'Nhập tên bệnh viện…',
    fmScenarioPlaceholder: 'Nhập tên kịch bản…',
    fmFacilityRequired: 'Vui lòng nhập tên bệnh viện.',
    fmScenarioRequired: 'Vui lòng nhập tên kịch bản.',
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
    loginNonceError: 'ログインセッションが無効です（nonce不一致）。もう一度お試しください。',
    loginExpiredError: 'ログインセッションの有効期限が切れました。再度ログインしてください。',
    loginNotConfigured:
      'Googleログインが未設定です（Client IDがありません）。管理者にお問い合わせください。',
    // ── YAMLファイル管理（GitHub） ──
    fmTitle: 'YAMLファイル管理',
    fmSubtitle: '既存のファイルを選ぶか、新しいファイルをアップロードしてキャンバスで開きます。',
    fmConnectTitle: 'GitHub接続',
    fmConnectDesc:
      'このリポジトリの Contents 書き込み権限を持つトークン（fine-grained または classic）を入力してください。',
    fmTokenLabel: 'GitHub トークン',
    fmTokenPlaceholder: 'github_pat_… または ghp_…',
    fmConnectBtn: '接続',
    fmConnecting: '接続中…',
    fmDisconnect: '切断',
    fmConnectedAs: '接続済み: {login}',
    fmTokenHelp: 'トークンの作成方法（Fine-grained, Contents: Read and write）',
    fmTokenHelpClassic: 'または classic トークンを作成（scope: repo）—「No expiration」を選べば一度の入力で無期限に使えます',
    fmTokenPersistNote:
      'トークンはこのブラウザに保存され、セッションをまたいで記憶されます（期限切れまたは「切断」まで再入力は不要）。共有PCでは使用しないでください。',
    fmOpen: '開く',
    fmUpload: 'アップロード',
    fmUploading: 'アップロード中…',
    fmNew: '新規フロー作成',
    fmRefresh: '更新',
    fmEmpty: 'このフォルダにはまだYAMLファイルがありません。',
    fmLoading: '一覧を読み込み中…',
    fmBrowseRepo: 'GitHubで開く',
    fmFolderNote: 'フォルダ: {dir}',
    fmBackToFiles: 'ファイル一覧',
    fmBackToManager: 'ファイル管理へ戻る',
    fmSaveToRepo: 'リポジトリに保存',
    fmSaving: '保存中…',
    fmSaved: 'リポジトリに保存しました',
    fmDeleteTitle: 'ファイルを削除',
    fmDeleteConfirm: 'ファイル「{name}」をリポジトリから削除しますか？この操作は元に戻せません。',
    fmNewFlowName: 'New Flow',
    fmNamePrompt: 'ファイル名（.yamlが無ければ自動付与）',
    fmCreate: '作成',
    fmUploadReplaceTitle: 'ファイルが既に存在します',
    fmUploadReplace: 'ファイル「{name}」は既にリポジトリにあります。上書きしますか？',
    fmOverwrite: '上書き',
    commitUpload: 'YAMLアップロード: {name}',
    commitCreate: '新規フロー作成: {name}',
    commitSave: 'フロー更新: {name}',
    commitDelete: 'フロー削除: {name}',
    ghErrAuth: 'トークンが無効か権限不足です（対象リポジトリの Contents: Read/Write が必要）。',
    ghErrNotFound: 'リポジトリ/フォルダが見つからないか、トークンにアクセス権がありません。',
    ghErrConflict: 'バージョンの競合です。一覧を更新してからやり直してください。',
    ghErrNetwork: 'GitHubに接続できません。ネットワークを確認してください。',
    ghErrRateLimit: 'GitHubのレート制限に達しました。しばらくしてからお試しください。',
    ghErrEmpty: 'トークンを入力してください。',
    ghErrOther: 'GitHub呼び出しでエラーが発生しました。もう一度お試しください。',
    fmUploadInvalid: 'YAMLファイルが無効か読み取れませんでした。',
    fmNameRequired: 'ファイル名を入力してください。',
    // Cột bảng danh sách file
    colFacility: '施設名',
    colScenario: 'シナリオ名',
    colCreatedAt: '作成日時',
    colUpdatedAt: '更新日時',
    colAuthor: '作成者',
    colActions: '操作',
    // Form tạo flow mới
    fmFacilityPlaceholder: '施設名を入力…',
    fmScenarioPlaceholder: 'シナリオ名を入力…',
    fmFacilityRequired: '施設名を入力してください。',
    fmScenarioRequired: 'シナリオ名を入力してください。',
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
