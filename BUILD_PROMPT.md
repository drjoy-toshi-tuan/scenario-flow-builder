# Scenario Flow Builder — Build Prompt (Phase 1)

> File này là prompt/spec để đưa cho **Claude Code**. Cách dùng:
> tạo repo rỗng trên GitHub → clone về → chạy `claude` trong thư mục đó →
> paste nội dung file này làm yêu cầu đầu tiên, hoặc lưu file này vào repo và nói
> *"Đọc BUILD_PROMPT.md và build đúng theo đó."*
> Sau khi scaffold xong, phần "Nguyên tắc & kiến trúc" nên được tách ra thành `CLAUDE.md`
> để làm ngữ cảnh lâu dài.

---

## 0. Mục tiêu của Phase 1

Dựng một webapp cho phép **visualize flow của hệ thống AI電話** (Brekeke-based) dưới dạng
sơ đồ node giống n8n, đọc từ file YAML. Phase 1 chỉ cần đạt tới mức **UI test được trên
GitHub Pages**, có đăng nhập Google giới hạn domain `drjoy.jp`.

Trong phase này:
- ✅ Định nghĩa **IR (Intermediate Representation)** làm **source of truth** duy nhất.
- ✅ Parser: YAML → IR, và IR → YAML (round-trip cơ bản).
- ✅ Auto-layout deterministic (ELK) để sinh toạ độ node đẹp từ IR.
- ✅ Canvas React Flow: xem sơ đồ, kéo-thả node, nối/xoá dây, zoom, chọn nhiều node.
- ✅ Google login, chỉ cho `@drjoy.jp` truy cập (client-side gating, xem cảnh báo §6).
- ✅ Deploy GitHub Pages qua GitHub Actions để test UI online.

**CHƯA làm trong phase này** (đừng over-build):
- ❌ Sinh file `.bivr` của Brekeke.
- ❌ Node config panel đầy đủ cho mọi loại node (chỉ cần panel đọc/sửa cơ bản).
- ❌ Tính năng AI (sinh code/prompt, làm giàu import).
- ❌ Import ngược từ `.bivr`.
- ❌ Backend / database / lưu server.

---

## 1. Tech stack (KHOÁ CỨNG — không tự đổi)

- Build tool: **Vite**
- Framework: **React 18 + TypeScript** (strict mode bật)
- Canvas: **@xyflow/react** (React Flow v12)
- Auto-layout: **elkjs** (`elkjs/lib/elk.bundled.js`)
- State: **zustand** (giữ IR + trạng thái canvas)
- YAML: package **`yaml`**
- Styling: **Tailwind CSS v4**
- Google auth: **Google Identity Services** (script GIS) hoặc `@react-oauth/google`
- Deploy: **GitHub Pages** qua **GitHub Actions**

Không thêm Redux, MUI, styled-components, hay framework khác trừ khi được yêu cầu.

---

## 2. Cấu trúc thư mục

```
.
├─ src/
│  ├─ ir/
│  │  ├─ types.ts          # IR schema — SOURCE OF TRUTH (xem §3)
│  │  ├─ fromYaml.ts       # YAML -> IR
│  │  ├─ toYaml.ts         # IR -> YAML (round-trip)
│  │  └─ layout.ts         # ELK auto-layout: điền position cho node
│  ├─ canvas/
│  │  ├─ FlowCanvas.tsx    # component React Flow chính
│  │  ├─ irAdapter.ts      # IR <-> React Flow (nodes/edges) — 2 chiều
│  │  ├─ nodes/            # 1 component cho mỗi NodeType
│  │  └─ edges/            # custom edge có nút xoá (thùng rác) khi hover
│  ├─ auth/
│  │  ├─ AuthProvider.tsx  # context, bao toàn app
│  │  ├─ useAuth.ts
│  │  └─ config.ts         # ALLOWED_DOMAIN = 'drjoy.jp'
│  ├─ store/
│  │  └─ flowStore.ts      # zustand: giữ FlowIR + actions
│  ├─ App.tsx
│  └─ main.tsx
├─ fixtures/
│  └─ sample-flow.yaml     # dữ liệu test (xem §4)
├─ .github/workflows/deploy.yml
├─ vite.config.ts          # base: '/<tên-repo>/' cho GitHub Pages
└─ CLAUDE.md               # tách từ §1 + §3 sau khi scaffold
```

---

## 3. IR Schema (SOURCE OF TRUTH)

IR là model JSON duy nhất mô tả toàn bộ flow. YAML và (sau này) `.bivr` chỉ là adapter
import/export quanh nó. Định nghĩa trong `src/ir/types.ts`:

```typescript
export interface FlowIR {
  version: string;                 // vd "1.0"
  meta: {
    id: string;
    name: string;
    facility?: string;             //施設名 nếu có
    createdAt: string;
    updatedAt: string;
  };
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type NodeType =
  | 'start'
  | 'announce'    // TTS / phát audio
  | 'input'       // thu DTMF hoặc STT
  | 'condition'   // phân nhánh theo điều kiện (jump)
  | 'script'      // ES5 script (Brekeke)
  | 'llm'         // gọi OpenAI / LLM
  | 'transfer'    // chuyển máy
  | 'hangup'
  | 'end';

export interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number };   // do ELK auto-layout điền; người dùng có thể kéo
  data: Record<string, unknown>;        // tham số riêng theo type (vd announce: { text })
}

export interface FlowEdge {
  id: string;
  source: string;                       // node id
  target: string;                       // node id
  sourceHandle?: string;                // nhánh output: 'default' | 'yes' | 'no' | ...
  condition?: string;                   // điều kiện jump, hiển thị trên dây
  label?: string;
}
```

**Quy tắc kiến trúc bắt buộc:**
- Mọi chỉnh sửa trên canvas phải cập nhật **IR trong zustand store**, không giữ state riêng lẻ ở React Flow. React Flow render **từ** IR (một chiều state → view), và các thao tác của người dùng gọi action cập nhật IR.
- `irAdapter.ts` có 2 hàm thuần: `irToReactFlow(ir): { nodes, edges }` và `reactFlowToIr(nodes, edges, prevIr): FlowIR`. Không nhét logic vào component.
- `fromYaml` / `toYaml` / `layout` là các hàm thuần, test được độc lập.

---

## 4. File YAML mẫu để test

Tạo `fixtures/sample-flow.yaml` với nội dung sau và dùng nó làm dữ liệu mặc định khi
app khởi động (để test UI ngay không cần upload):

```yaml
flow:
  name: "予約確認フロー"
  start: greet
  nodes:
    - id: greet
      type: announce
      text: "お電話ありがとうございます。ご用件をお選びください。"
      next: main_menu
    - id: main_menu
      type: input
      mode: dtmf
      prompt: "予約は1、変更は2を押してください。"
      next: classify
    - id: classify
      type: condition
      branches:
        - when: "input == '1'"
          to: reserve
        - when: "input == '2'"
          to: change
        - default: fallback
    - id: reserve
      type: announce
      text: "予約受付に進みます。"
      next: end
    - id: change
      type: announce
      text: "変更受付に進みます。"
      next: end
    - id: fallback
      type: announce
      text: "もう一度お選びください。"
      next: main_menu
    - id: end
      type: hangup
```

`fromYaml.ts` phải map được cấu trúc này sang IR:
- `next: X` → tạo 1 edge `sourceHandle: 'default'`.
- `branches[].when → to` → mỗi nhánh là 1 edge, `condition = when`, hiển thị trên dây.
- `branches[].default` → 1 edge `sourceHandle: 'default'`.
- Node không có toạ độ trong YAML → để `position: {x:0,y:0}`, rồi `layout.ts` (ELK)
  tính lại toàn bộ toạ độ theo hướng top-down.

---

## 5. Canvas — hành vi giống n8n

Dùng React Flow, cần đạt các tương tác sau (phần lớn là tính năng sẵn có, chỉ cần cấu hình):
- Chọn 1 hoặc nhiều node (rê chuột chọn vùng), copy, di chuyển.
- Nối dây bằng kéo-thả từ handle output sang input.
- **Xoá dây**: hover vào dây → hiện icon thùng rác trên dây → click để xoá (cần custom edge component).
- **Double-click node** → mở panel setting (phase 1 chỉ cần form đơn giản đọc/sửa `label` và vài field trong `data`).
- Zoom in/out + pan + minimap + nút fit-view.
- Mỗi `NodeType` có 1 component riêng trong `canvas/nodes/`, màu/icon khác nhau để phân biệt.
- Có nút **"Auto layout"** (chạy lại ELK) và nút **"Export YAML"** (dùng `toYaml`, cho tải về) để kiểm chứng round-trip.

---

## 6. Auth — Google login, chỉ domain drjoy.jp

Yêu cầu: người dùng phải đăng nhập bằng tài khoản Google, và **chỉ tài khoản thuộc
domain `drjoy.jp`** mới vào được app.

Cách làm phase này (client-side gating):
1. Dùng Google Identity Services. Khi request, truyền tham số `hd: 'drjoy.jp'` (gợi ý cho Google hiển thị đúng domain).
2. Sau khi nhận ID token, **decode JWT** và kiểm tra claim **`hd === 'drjoy.jp'`** và `email_verified === true`. Nếu không khớp → chặn, hiện thông báo "Chỉ tài khoản @drjoy.jp mới truy cập được" và không render app.
3. `ALLOWED_DOMAIN` để trong `src/auth/config.ts` (dễ đổi).
4. `AuthProvider` bao toàn app; nếu chưa đăng nhập hoặc sai domain → chỉ hiện màn hình login.

> ⚠️ **CẢNH BÁO BẢO MẬT — Claude Code phải ghi rõ trong README:**
> Kiểm tra domain ở client-side **không phải bảo mật thật**. Bundle JS là công khai;
> người dùng kỹ thuật có thể fork/chạy local để bypass, và `hd` param không đủ tin cậy
> nếu chỉ dựa vào nó. Nó chỉ là **cổng UX cho nội bộ test UI**. Vì phase này chỉ dùng
> YAML mẫu (không dữ liệu thật), mức này chấp nhận được.
> Khi có API/dữ liệu thật: BẮT BUỘC verify `hd` claim của ID token **ở server-side**
> (Vercel/Cloudflare Functions) trước khi trả bất kỳ dữ liệu nào. Thiết kế module auth
> tách rời để bước nâng cấp này không phải sửa UI.

**Việc con người (Tuan) phải làm trên Google Cloud Console** (Claude Code không làm được, ghi vào README):
- Tạo OAuth 2.0 Client ID (Web application).
- Authorized JavaScript origins: `http://localhost:5173` và URL GitHub Pages
  (vd `https://<user>.github.io`).
- Copy Client ID vào biến `VITE_GOOGLE_CLIENT_ID` (Client ID **không phải secret**, để trong `.env` / GitHub Actions secret là được; **không** dùng client secret cho SPA).

---

## 7. Deploy để test UI

- Cấu hình `vite.config.ts` với `base: '/<tên-repo>/'`.
- Tạo `.github/workflows/deploy.yml`: build và deploy lên GitHub Pages khi push `main`.
- Truyền `VITE_GOOGLE_CLIENT_ID` qua GitHub Actions secret.
- README ghi rõ các bước: bật GitHub Pages (Source: GitHub Actions), thêm secret, thêm origin trên Google Console.

---

## 8. Định nghĩa "Done" cho Phase 1

1. `npm install && npm run dev` chạy được, mở ra thấy sơ đồ của `sample-flow.yaml` đã auto-layout gọn gàng.
2. Kéo-thả node, nối dây, xoá dây (icon thùng rác), zoom hoạt động.
3. Double-click node mở panel sửa `label`.
4. Nút "Export YAML" tải về YAML tái tạo được flow (round-trip IR ↔ YAML).
5. Chưa đăng nhập → chỉ thấy màn login. Đăng nhập tài khoản `@drjoy.jp` → vào app; tài khoản khác domain → bị chặn.
6. Push `main` → GitHub Actions build & deploy Pages thành công, test được online.
7. Có `README.md` ghi đủ setup (Google Console, secret, Pages) và cảnh báo bảo mật ở §6.

---

## 9. Nguyên tắc code (giữ về sau)

- TypeScript strict, không `any` trừ khi có lý do và comment.
- Tên hàm/biến/identifier: **tiếng Anh**. Comment giải thích logic nghiệp vụ: có thể tiếng Việt/Nhật cho dễ đọc nội bộ.
- Tách rõ: `ir/` (thuần, không React) ↔ `canvas/` (React) ↔ `auth/`. IR không được import gì từ React Flow.
- Ưu tiên hàm thuần, dễ test. Viết vài unit test cho `fromYaml`/`toYaml`/`layout` nếu kịp.
