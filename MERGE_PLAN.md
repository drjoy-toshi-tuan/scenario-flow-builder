# MERGE_PLAN.md — Kế hoạch gộp `gen_flow` (backend logic) + `scenario-flow-builder` (UI) thành 1 repo

> Branch làm việc: `claude/merge-gen-flow-builder-js3fh1` (tồn tại trên cả 2 repo).
> Mục tiêu: 1 repo duy nhất, trong đó **gen_flow là tầng logic backend** (pipeline sinh/kiểm BIVR)
> và **scenario-flow-builder là tầng UI** (visual editor React Flow).

---

## 0. Hiện trạng — vì sao merge không phải chỉ là copy code

| | gen_flow (TS-dong-nc) | scenario-flow-builder (drjoy-toshi-tuan) |
|---|---|---|
| Bản chất | Pipeline Python quyết định luận: 設計書 YAML → qa_validator → scaffold → … → BIVR JSON | Static webapp Vite + React 18 + React Flow, deploy GitHub Pages |
| Định dạng dữ liệu | 設計書 YAML (`scenario_flow` blocks — 26 block type theo `schemas/qa_validator.py::KNOWN_BLOCK_TYPES`) + BIVR JSON | FlowIR YAML riêng (`flow.nodes` + edges, 11 NodeType trong `src/ir/types.ts`) |
| Runtime | Local CLI / Claude agents, KHÔNG có server | Browser thuần, KHÔNG có backend; ghi file qua GitHub Contents API |
| Đường dẫn nội bộ | Hàng chục script/agent/skill tham chiếu cứng `scripts/`, `schemas/`, `output/`, `modules/`, `.claude/`, `docs/` | App tự chứa trong `src/`, chỉ cần chỉnh Vite root/base là dời được |
| Governance | CLAUDE.md "hiến pháp", allowlist zone, CODEOWNERS, guard-master.yml, cấm cài đặt tool | CLAUDE.md kiến trúc IR, deploy.yml (Pages) |
| Default branch | `master` (được bảo vệ) | `main` |

**Hệ quả → 2 quyết định nền tảng:**

1. **Repo host = `gen_flow`** (khuyến nghị). Di chuyển gen_flow sẽ vỡ toàn bộ đường dẫn pipeline;
   di chuyển UI thì chỉ chỉnh config build. gen_flow cũng đã có sẵn hạ tầng bảo vệ master + CODEOWNERS.
2. **Việc "merge" có 2 tầng tách bạch:**
   - Tầng A — *gộp mã nguồn* (Phase 1–3): cơ học, ít rủi ro.
   - Tầng B — *tích hợp dữ liệu* (Phase 4–5): viết adapter FlowIR ⇄ 設計書 YAML. Đây là giá trị thật
     và là phần tốn công nhất — UI hiện tại **không đọc được** file 設計書 của pipeline và ngược lại.

---

## 1. Cấu trúc thư mục đích (monorepo)

```
gen_flow/  (repo merged)
├── CLAUDE.md                  # hiến pháp gen_flow, thêm §webapp trỏ xuống dưới
├── scripts/ schemas/ modules/ tools/ docs/ output/   # GIỮ NGUYÊN 100% đường dẫn
├── .claude/  .github/         # gộp workflows + agents/skills của cả 2
├── webapp/                    # ← toàn bộ scenario-flow-builder chuyển vào đây
│   ├── CLAUDE.md              # CLAUDE.md của builder (Claude Code tự đọc theo thư mục)
│   ├── package.json  vite.config.ts  index.html
│   ├── src/  (ir/ canvas/ auth/ github/ drive/ ai/ files/ store/ components/ ui/)
│   ├── flows/  fixtures/  proxy-vercel/
│   └── ...
└── MERGE_PLAN.md              # file này
```

Nguyên tắc: **gen_flow không đổi 1 đường dẫn nào**; builder nằm trọn trong `webapp/` như một
"app con" tự chứa.

---

## 2. Kế hoạch từng bước

### Phase 0 — Chốt quyết định (0.5 ngày, cần con người xác nhận)

- [ ] **D0.1** Xác nhận repo host = `gen_flow` (hoặc ngược lại — mọi bước dưới đảo chiều tương ứng).
- [ ] **D0.2** Chốt prefix `webapp/` (tên khác tuỳ ý: `ui/`, `frontend/`).
- [ ] **D0.3** Chốt số phận repo cũ sau cutover: archive `scenario-flow-builder`, README trỏ sang repo mới.
- [ ] **D0.4** GitHub Pages URL sẽ đổi (repo/owner khác) → phải cập nhật **Authorized JavaScript origins**
  của Google OAuth Client ID và mọi config domain trong `webapp/src/auth/config.ts`, `drive/config.ts`.
  *Đây là việc chỉ owner console Google Cloud làm được — lên lịch trước.*

### Phase 1 — Gộp mã nguồn, giữ nguyên lịch sử git (0.5–1 ngày)

Dùng `git subtree` (có sẵn trong git, không cần cài tool — tuân thủ luật cấm install của gen_flow):

```bash
# đứng trong clone của gen_flow, branch claude/merge-gen-flow-builder-js3fh1
git remote add builder <url scenario-flow-builder>
git fetch builder main
git subtree add --prefix=webapp builder main   # giữ full lịch sử commit của builder
```

- [ ] **1.1** Subtree add như trên. Nếu không cần lịch sử → copy thẳng + 1 commit (nhanh hơn, mất blame).
- [ ] **1.2** Giải quyết va chạm file cùng tên (subtree tự tránh vì khác prefix, nhưng phải quy hoạch lại):
  - `CLAUDE.md`: root = của gen_flow (thêm mục "webapp"); `webapp/CLAUDE.md` = của builder.
  - `README.md`: root = gen_flow + mục giới thiệu webapp; `webapp/README.md` giữ nguyên.
  - `.claude/`: giữ của gen_flow ở root (agents/skills/settings là tài sản pipeline);
    `webapp/.claude/launch.json` của builder giữ tại chỗ hoặc hợp nhất vào root nếu cần chạy chung.
  - `.gitignore`: nối phần của builder (node_modules, dist…) vào root, prefix `webapp/`.
- [ ] **1.3** Kiểm tra build tại chỗ: `cd webapp && npm ci && npm run build && npm test` — Vite app
  tự chứa nên kỳ vọng pass ngay, chưa cần sửa code.

### Phase 2 — CI/CD cho monorepo (0.5 ngày)

- [ ] **2.1** `deploy.yml` (Pages) của builder → `.github/workflows/deploy-webapp.yml` của repo host:
  - `working-directory: webapp`, trigger `paths: ["webapp/**"]`.
  - Vite `base` chỉnh theo tên repo mới (Pages project site: `/<repo>/`).
- [ ] **2.2** `guard-master.yml`, `backup-master.yml` của gen_flow giữ nguyên; thêm `webapp/**` vào
  phạm vi guard nếu muốn bảo vệ (xem Phase 3).
- [ ] **2.3** Thêm workflow test 2 nhánh chạy theo path-filter: python tests (`scripts/test_*.py`,
  `schemas/`) khi đổi pipeline; `vitest` khi đổi `webapp/**`. Không chạy chéo → CI nhanh.
- [ ] **2.4** Đồng bộ tên branch: gen_flow dùng `master`, builder dùng `main`. Sau merge chỉ còn
  default branch của repo host (`master`) — sửa mọi tham chiếu `main` trong workflow/docs của webapp.

### Phase 3 — Hợp nhất governance (0.5 ngày, cần owner gen_flow duyệt)

- [ ] **3.1** Root `CLAUDE.md`: thêm section ngắn *"webapp/ — UI editor, luật riêng tại webapp/CLAUDE.md"*;
  quy định `webapp/` thuộc zone nào:
  - Khuyến nghị: `webapp/` = **zone mới "UI"** — CODEOWNERS `@drjoy-toshi-tuan` (team UI review),
    tách khỏi cả free zone (`output/scenarios/`) lẫn protected zone pipeline.
- [ ] **3.2** Cập nhật `CODEOWNERS`: `/webapp/ @drjoy-toshi-tuan`, phần còn lại giữ `@TS-dong-nc`.
- [ ] **3.3** Rà `CONTRIBUTING.md` + bảng allowlist trong CLAUDE.md để members UI không bị guard chặn oan.
- [ ] **3.4** Luật "cấm cài tool" của gen_flow áp toàn repo — ghi chú ngoại lệ có kiểm soát:
  `npm ci` trong `webapp/` (cài theo lockfile, không thêm dependency mới) là thao tác build chuẩn;
  **thêm dependency mới vẫn cần owner duyệt** như luật `requirements.txt`.

### Phase 4 — Tầng adapter dữ liệu: FlowIR ⇄ 設計書 YAML (2–4 ngày — phần việc chính)

Đây là chỗ biến "2 repo nằm cạnh nhau" thành "1 sản phẩm". UI phải mở/lưu được file 設計書
mà pipeline tiêu thụ.

- [ ] **4.1** Viết `webapp/src/ir/designYaml/fromDesignYaml.ts` + `toDesignYaml.ts` (hàm thuần,
  đúng quy tắc `ir/` không import React). Bảng map khởi điểm 26 block type → 11 NodeType:

  | scenario_flow block | NodeType (FlowIR) |
  |---|---|
  | opening, announcement | `announce` |
  | hearing, slot, patient_name, dob, phone, card_number, free_text | `interaction` |
  | context_match_router, phone_branch, null_check, date_of_call_classifier, incoming_category_classifier | `nexus` |
  | script, cmr_chain, phone2name, clinical_department_normalize, text các script khác | `logic` |
  | intent, faq, clinical_department_classifier, clinical_department | `openai` / `faq` |
  | call_transfer | `transfer` |
  | subflow | `jump` |
  | termination (+termination_patterns) | `save` → `hangup` |
  | augment | node placeholder (badge cảnh báo trên canvas) |

- [ ] **4.2** **Round-trip lossless bắt buộc**: mọi field pipeline cần (`step_details`, `save_to`,
  `termination_patterns`, comment nghiệp vụ…) mà UI không hiểu thì giữ nguyên trong `node.data.raw`
  và ghi lại y nguyên khi `toDesignYaml`. Tiêu chí nghiệm thu: mở → lưu không sửa gì → **diff = 0**
  (hoặc tối thiểu: `qa_validator.py` PASS với cùng kết quả trước/sau).
- [ ] **4.3** Test round-trip bằng 設計書 thật: `output/scenarios/_proto_flat/`, `Medcity21_健診/`,
  `DrJOY病院_BCP/` → đưa vào `webapp/fixtures/` làm vitest fixture.
- [ ] **4.4** File manager của UI (`webapp/src/files/` + `github/`) trỏ sang repo merged, browse thư mục
  `output/scenarios/{施設}_{flow}/` thay vì `flows/` — cơ chế GitHub Contents API + fine-grained token
  đã có sẵn, chỉ đổi config repo/path.
- [ ] **4.5** (Tùy chọn, giá trị cao) Visualize BIVR hoàn chỉnh: tái dụng `scripts/scaffold_extractor.py`
  (BIVR → 設計書 YAML) rồi mở bằng adapter 4.1 — UI xem được cả sản phẩm cuối mà không cần parser BIVR riêng.

### Phase 5 — Luồng làm việc end-to-end (1–2 ngày)

Vì UI là static site không backend, "gọi backend" = thao tác quanh git:

```
UI vẽ/sửa flow ──toDesignYaml──▶ commit 設計書 vào output/scenarios/… (Contents API, đã có token flow)
      ▲                                            │
      │                                            ▼
 fromDesignYaml ◀── pipeline chạy (2 phương án dưới) ──▶ BIVR + report commit lại
```

- [ ] **5.1** Bước đầu (không tốn hạ tầng): pipeline vẫn chạy local như hiện nay
  (`orchestrator.py` /壁打ち theo CLAUDE.md gen_flow); UI chỉ là editor 設計書 thay cho sửa tay YAML.
- [ ] **5.2** Bước sau: workflow `workflow_dispatch` chạy `qa_validator.py` (+ `yaml_auto_fixer.py`)
  trên 設計書 vừa commit, ghi report về cùng thư mục → UI hiển thị trạng thái PASS/CRITICAL.
  GitHub Actions đóng vai "backend" — đúng tinh thần static site, không thêm server.
  *Lưu ý giữ keystone của gen_flow: không đưa LLM tự sửa vào line; Action chỉ chạy phần quyết định luận.*

### Phase 6 — Kiểm thử & nghiệm thu (0.5–1 ngày)

- [ ] **6.1** `cd webapp && npm run build && npm test` xanh; python test hiện có của gen_flow xanh
  (`scripts/test_*.py`, không đụng gì tới chúng ở các phase trên).
- [ ] **6.2** Round-trip test Phase 4.3 xanh trên ≥3 設計書 thật.
- [ ] **6.3** Smoke test tay: mở UI từ Pages build mới → login Google → mở 設計書 từ
  `output/scenarios/` → sửa 1 node → lưu → chạy `qa_validator.py` local → PASS.

### Phase 7 — Cutover (0.5 ngày, cần owner cả 2 phía)

- [ ] **7.1** PR từ `claude/merge-gen-flow-builder-js3fh1` vào default branch repo host, review theo CODEOWNERS.
- [ ] **7.2** Bật Pages trên repo host, xác nhận OAuth origins mới hoạt động (D0.4).
- [ ] **7.3** Archive `scenario-flow-builder`, README trỏ sang repo mới; đóng băng ghi mới vào `flows/` cũ.
- [ ] **7.4** Migrate các file `flows/*.yaml` cũ (format FlowIR) sang `output/scenarios/` nếu còn giá trị,
  hoặc giữ nguyên trong `webapp/flows/` như legacy (UI vẫn đọc được format cũ qua `fromYaml` hiện có).

---

## 3. Rủi ro & điểm cần quyết định sớm

| # | Rủi ro / quyết định | Ảnh hưởng | Hướng xử lý |
|---|---|---|---|
| R1 | Google OAuth origins gắn với domain Pages cũ | Login vỡ ngay sau cutover | Làm D0.4 trước Phase 7; giữ Pages cũ chạy song song 1 tuần |
| R2 | 26 block type ⇄ 11 NodeType không map 1:1 | Adapter mất thông tin → pipeline fail | Luật `data.raw` lossless (4.2) + nghiệm thu diff=0; block chưa map hiển thị dạng placeholder thay vì loại bỏ |
| R3 | Governance gen_flow (cấm install, protected zone) áp lên dev UI | Team UI bị chặn thao tác thường ngày | Phase 3: zone riêng cho `webapp/` + ngoại lệ `npm ci` ghi rõ trong CLAUDE.md |
| R4 | 2 default branch khác tên (master/main) | Workflow, docs trỏ nhầm | Phase 2.4 rà một lượt bằng grep `main` trong webapp |
| R5 | Fine-grained token của member chỉ cấp cho repo cũ | Lưu file từ UI fail | Thông báo cấp lại token cho repo merged trong hướng dẫn cutover |
| R6 | Lịch sử git: subtree làm `git log --follow` kém hơn filter-repo | Blame khó hơn | Chấp nhận (filter-repo cần cài tool — vi phạm luật gen_flow); repo cũ archive vẫn giữ nguyên lịch sử để tra |

## 4. Thứ tự ưu tiên nếu cần chia nhỏ

1. **Phase 1 + 2** (gộp code + CI xanh) — có thể xong trong 1 ngày, tạo "monorepo chạy được".
2. **Phase 4.1–4.3** (adapter + round-trip) — giá trị cốt lõi, làm ngay sau đó.
3. Phase 3, 5, 6, 7 — theo sau, mỗi phase độc lập tương đối.

Tổng ước lượng: **5–8 ngày công**, trong đó adapter dữ liệu chiếm ~một nửa.
