# CLAUDE.md — ngữ cảnh lâu dài cho AI電話 Flow Builder

> Tách từ §1 (tech stack) + §3 (IR) + §9 (nguyên tắc code) của `BUILD_PROMPT.md`.
> Đây là ngữ cảnh kiến trúc phải giữ cho các phase sau.

## Mục tiêu dự án

Webapp visualize flow của hệ thống **AI電話** (Brekeke-based) dưới dạng sơ đồ node giống
n8n, đọc/ghi từ file YAML. **IR (Intermediate Representation)** là source of truth; YAML
(và sau này `.bivr`) chỉ là adapter import/export quanh IR.

## Tech stack (KHOÁ CỨNG — không tự đổi)

- Build tool: **Vite**
- Framework: **React 18 + TypeScript** (strict mode)
- Canvas: **@xyflow/react** (React Flow v12)
- Auto-layout: **thuật toán cây tự viết** (`src/ir/layout.ts`, thuần TS): flow top-down
  bước tầng đều nhau; chuỗi `failed` nằm ngang cùng hàng; nhánh rẽ cách đều quanh tâm
  node cha, chống chồng chéo bằng contour. (Đã bỏ elkjs.)
- State: **zustand** (giữ IR + trạng thái canvas)
- YAML: package **`yaml`**
- Styling: **Tailwind CSS v4** (plugin `@tailwindcss/vite`, `@import "tailwindcss"`)
- Google auth: **@react-oauth/google** (Google Identity Services)
- Deploy: **GitHub Pages** qua **GitHub Actions**

Không thêm Redux, MUI, styled-components, hay framework khác trừ khi được yêu cầu.

## Kiến trúc thư mục

```
src/
  ir/        # thuần, KHÔNG import React — types.ts (SOURCE OF TRUTH), fromYaml, toYaml, layout
  canvas/    # React Flow — FlowCanvas, irAdapter (IR <-> RF, 2 hàm thuần), nodes/, edges/
  auth/      # AuthProvider, useAuth, config (ALLOWED_DOMAIN), LoginScreen, jwt, verifyIdToken, nonce
  github/    # config + Contents API (thuần fetch), token store (sessionStorage), errors
  files/     # FileManagerScreen, GithubConnectPanel (màn quản lý YAML trước canvas)
  store/     # zustand: flowStore (FlowIR + actions), fileStore (file đang mở / routing)
  components/# Toolbar, NodeSettingsPanel, HeaderMenu…
fixtures/    # sample-flow.yaml (dữ liệu test cho unit test)
flows/       # kho file YAML trên repo (mở/upload/tạo/lưu qua GitHub Contents API)
```

## Bảo mật auth & quản lý file (tóm tắt)

- App là **static site (GitHub Pages), không backend**. Domain check ở client CHỈ là cổng UX.
  `auth/verifyIdToken.ts` siết claim (iss/aud/exp/nonce/hd/email_verified/sub) — defense-in-depth,
  KHÔNG verify chữ ký. Chặn bypass mạnh nhất = đặt OAuth consent screen **Internal** (xem README §Bảo mật).
- Ghi file YAML vào repo qua **GitHub Contents API** bằng fine-grained token của người dùng
  (quyền Contents: Read/Write), lưu **localStorage** (nhớ qua phiên, tới khi hết hạn/ngắt kết nối)
  — không đưa vào bundle. Đăng nhập Google vẫn **sessionStorage**. `github/` thuần fetch.

## IR Schema (SOURCE OF TRUTH)

Định nghĩa chính thức ở `src/ir/types.ts`. Tóm tắt:

- `FlowIR { version, meta{id,name,facility?,createdAt,updatedAt}, nodes[], edges[] }`
- `NodeType = start | announce | interaction | nexus | logic | openai | faq | transfer | save | jump | hangup`
  (tên cũ input/condition/script/llm/flag vẫn đọc được qua `LEGACY_TYPE_ALIASES`)
- `FlowNode { id, type, label, position{x,y}, data }` — `position` do auto-layout điền, `data` là tham số riêng theo type.
- `FlowEdge { id, source, target, sourceHandle?, condition?, label? }`

Quy ước YAML `flow.start` → tạo 1 node `start` tổng hợp (id `__start__`) + edge tới node đầu.
`toYaml` bỏ node này ra và ghi lại thành field `flow.start`.

## Quy tắc kiến trúc BẮT BUỘC

1. Mọi chỉnh sửa canvas phải cập nhật **IR trong zustand store**. React Flow render **từ** IR
   (state → view một chiều); thao tác người dùng gọi action cập nhật IR.
2. `irAdapter.ts` chỉ chứa 2 hàm thuần: `irToReactFlow(ir)` và `reactFlowToIr(nodes, edges, prev)`.
   Không nhét logic vào component.
3. `fromYaml` / `toYaml` / `layout` là hàm thuần, test được độc lập (`src/ir/ir.test.ts`).
4. `ir/` KHÔNG được import bất cứ thứ gì từ React / React Flow.

## Nguyên tắc code (§9)

- TypeScript strict, **không `any`** trừ khi có lý do và comment.
- Tên hàm/biến/identifier: **tiếng Anh**. Comment nghiệp vụ: có thể tiếng Việt/Nhật.
- Tách rõ 3 tầng: `ir/` (thuần) ↔ `canvas/` (React) ↔ `auth/`.
- Ưu tiên hàm thuần, dễ test.

## CHƯA làm (đừng over-build ở phase 1)

- ❌ Sinh file `.bivr`, import ngược từ `.bivr`.
- ❌ Node config panel đầy đủ cho mọi loại node.
- ❌ Tính năng AI (sinh code/prompt).
- ❌ Backend / database / lưu server.
- ❌ Verify auth server-side (BẮT BUỘC khi có dữ liệu thật — xem README §Bảo mật).
