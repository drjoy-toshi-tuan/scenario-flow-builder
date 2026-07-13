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
  // URL proxy AI (Cloudflare Worker) cho tính năng AIで生成・修正 / giải thích code.
  // BẮT BUỘC để bật AI. KHÔNG phải secret. Xem proxy/README.md + src/ai/config.ts.
  readonly VITE_AI_PROXY_URL?: string;
  // Model OpenAI (mặc định gpt-5.1). Vd 'gpt-4o', 'gpt-5-mini'.
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
