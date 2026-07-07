/// <reference types="vite/client" />

// Import file YAML dạng chuỗi thô: `import x from '...yaml?raw'`
declare module '*.yaml?raw' {
  const content: string;
  export default content;
}

// elkjs bản bundled không kèm type cho đường dẫn con này → khai báo tối thiểu.
declare module 'elkjs/lib/elk.bundled.js' {
  export interface ElkNode {
    id: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    children?: ElkNode[];
    edges?: ElkExtendedEdge[];
    layoutOptions?: Record<string, string>;
  }
  export interface ElkExtendedEdge {
    id: string;
    sources: string[];
    targets: string[];
  }
  export default class ELK {
    layout(graph: ElkNode): Promise<ElkNode>;
  }
}

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  // 'true' để bật chế độ demo (bỏ qua đăng nhập) trên bản build. Mặc định tắt.
  readonly VITE_ALLOW_DEMO?: string;
  // Kho GitHub chứa file YAML (tuỳ chọn — mặc định trỏ repo hiện tại).
  readonly VITE_GITHUB_OWNER?: string;
  readonly VITE_GITHUB_REPO?: string;
  readonly VITE_FLOWS_BRANCH?: string;
  readonly VITE_FLOWS_DIR?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
