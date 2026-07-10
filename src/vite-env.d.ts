/// <reference types="vite/client" />

// Import file YAML dạng chuỗi thô: `import x from '...yaml?raw'`
declare module '*.yaml?raw' {
  const content: string;
  export default content;
}

// Import file JS (script mẫu Brekeke) dạng chuỗi thô: `import code from '...js?raw'`
declare module '*.js?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  // 'true' để bật chế độ demo (bỏ qua đăng nhập) trên bản build. Mặc định tắt.
  readonly VITE_ALLOW_DEMO?: string;
  // OpenAI API key cho tính năng AIで生成・修正 / giải thích code (tuỳ chọn — có thể
  // nhập tay qua localStorage; xem src/ai/config.ts).
  readonly VITE_OPENAI_API_KEY?: string;
  // Model OpenAI (mặc định gpt-4.1). Vd 'gpt-4o', 'o4-mini'.
  readonly VITE_OPENAI_MODEL?: string;
  // Kho GitHub chứa file YAML (tuỳ chọn — mặc định trỏ repo hiện tại).
  readonly VITE_GITHUB_OWNER?: string;
  readonly VITE_GITHUB_REPO?: string;
  readonly VITE_FLOWS_BRANCH?: string;
  readonly VITE_FLOWS_DIR?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
