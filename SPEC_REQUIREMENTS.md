# SPEC_REQUIREMENTS.md — Spec-Driven Voicebot Builder（要件定義書 / Tài liệu yêu cầu dự án）

> Phiên bản: 0.1 (draft để review) — 2026-07-15
> Trạng thái: **CHƯA CODE** — tài liệu này cần được 2 phía (UI team / pipeline owner) chốt trước.
> Liên quan: `MERGE_PLAN.md` (kế hoạch gộp repo), `spec_driven_voicebot_idea.md` (ý tưởng gốc).

---

## 1. Mục tiêu & triết lý

> **Con người quản lý Spec — Code thực thi — Không giao phó toàn bộ cho AI.**

Xây dựng công cụ cho phép Staff (không kỹ thuật) tạo và bảo trì kịch bản voicebot:

1. **Đầu vào**: dán một luồng mô tả đơn giản (text) vào **UI web**.
2. Hệ thống **normalize** thành từ khoá chuẩn (聴取項目), Staff xác nhận qua **pulldown**.
3. Phần còn lại hệ thống **tự điền logic mặc định** — Staff chỉ confirm và sửa.
4. **Đầu ra**: file **Excel = tài liệu spec chính thức (specs document)** — Staff/Owner/khách
   đọc Excel là hiểu voicebot làm gì. Excel này compile được thành 設計書 YAML để chạy
   pipeline gen_flow hiện có (**pipeline không đổi gì**).

### Non-goals (phạm vi loại trừ ở phase này)

- ❌ Không sửa pipeline gen_flow (scaffold/validator/tester… giữ nguyên).
- ❌ Không đưa LLM vào line (keystone). LLM chỉ được cân nhắc ở vai *gợi ý* khâu normalize, luôn có người confirm.
- ❌ Không làm backend/server mới — UI vẫn là static site (ràng buộc hiện tại của webapp).
- ❌ Không hỗ trợ macro/VBA trong Excel (bảo mật + tương thích).

---

## 2. Người dùng & hành trình

| Persona | Vai trò | Thao tác chính |
|---|---|---|
| **Staff**（非技術者） | Nhập & bảo trì spec | Dán flow, chọn pulldown, sửa TTS/choices, confirm, xuất Excel |
| **Owner**（技術） | Gác cổng | Duyệt Review Package, xử lý escalation (thiếu từ khoá/部品), duyệt custom script, chạy pipeline |
| **Khách hàng/hiện trường** | Đọc | Đọc Excel spec để xác nhận nghiệp vụ (照合 với canvas gốc) |

### User journey chuẩn (tạo mới)

```
1. Staff mở UI → 新規作成 → dán luồng text đơn giản
2. Hệ thống normalize → bảng kết quả map 🟢/🟡/🔴 → Staff xác nhận các 🟡 bằng pulldown
3. Sheet editor: mỗi step 1 hàng, mọi field đã có default (trạng thái AUTO, màu xám)
   → Staff chỉ sửa chỗ cần (chuyển thành OVERRIDE, màu đậm)
4. Canvas preview cập nhật realtime bên cạnh; lỗi hiện badge đỏ ngay khi nhập
5. Staff bấm 出力 → file Excel spec (specs document) được sinh ra
6. Owner mở Review Package (flow図 / TTS list / AmiVoice / script logic / settings) → duyệt ✅
7. Compile → 設計書 YAML → pipeline gen_flow chạy như hiện nay → BIVR
```

### User journey bảo trì (quan trọng ngang tạo mới)

```
1. Staff mở kịch bản đã có trong UI (hoặc import lại file Excel spec)
2. Sửa đúng hàng cần sửa (vd đổi câu TTS, thêm từ AmiVoice, thêm 1 step)
3. Hệ thống chỉ ghi nhận phần OVERRIDE thay đổi → diff nhỏ, đọc được
4. Xuất Excel version mới (revision history tự ghi) → Owner duyệt diff → compile → deploy
5. TUYỆT ĐỐI không vá trực tiếp BIVR/JSON (giữ keystone "sửa generator, không sửa sản phẩm")
```

---

## 3. Kiến trúc dữ liệu — quyết định nền tảng

```
Paste text ──normalize──▶ ┌────────────────────────────┐
                          │  DECISION MODEL (nội bộ UI)│  step list + chỉ các field OVERRIDE
                          │  = trạng thái làm việc      │  field AUTO không lưu giá trị
                          └──────┬─────────────────────┘
                    export ⇅ import (round-trip lossless)
                          ┌──────▼─────────────────────┐
                          │  EXCEL SPEC (SSoT con người)│  tài liệu spec chính thức, lưu git
                          └──────┬─────────────────────┘   output/scenarios/{施設}_{flow}/
                                 │ compile (excel_to_yaml.py — thuần, vài giây)
                          ┌──────▼─────────────────────┐
                          │  設計書 YAML (derived)      │  + Review Package (drawio/TTS/辞書)
                          └──────┬─────────────────────┘   commit kèm để diff được trên git
                                 ▼
                     pipeline gen_flow hiện có (KHÔNG ĐỔI)
```

### Quy tắc bắt buộc

- **R3.1 — Excel là SSoT với con người**; 設計書 YAML là sản phẩm derive, **luôn commit kèm** Excel
  (để git diff đọc được — xlsx là binary, diff kém).
- **R3.2 — AUTO / OVERRIDE là khái niệm trung tâm**: mỗi field thuộc 1 trong 2 trạng thái.
  AUTO = compiler điền default tại thời điểm compile (không đóng băng vào spec);
  OVERRIDE = giá trị user quyết, được tôn trọng tuyệt đối. Re-compile hàng loạt khi default
  nâng cấp → kịch bản cũ tự hưởng logic mới ở các field AUTO.
- **R3.3 — Step ID bất biến, tách khỏi tên hiển thị**: đổi label không làm gãy tham chiếu `next`.
  ID do hệ thống cấp (`S001`, `S002`…), user không sửa được.
- **R3.4 — Round-trip lossless**: UI → Excel → UI (import lại) → Excel phải cho ra file tương đương
  (mọi OVERRIDE, ghi chú, trạng thái giữ nguyên). Đây là tiêu chí nghiệm thu số 1.
- **R3.5 — Vocabulary sinh máy từ 1 nguồn**: block type / slot / format / display type / script
  template lấy từ **spec schema** xuất tự động từ `schemas/qa_validator.py::KNOWN_BLOCK_TYPES`
  + `modules/parts_catalog.json`. Schema này nuôi đồng thời pulldown của UI **và** data validation
  của Excel. Không hardcode danh sách ở 2 nơi.

---

## 4. Yêu cầu chức năng (FR)

### FR-1 — Nhập nhanh bằng paste + normalize

- FR-1.1 Ô paste nhận text tự do (mỗi dòng ≈ 1 bước; chấp nhận `→`, `-`, số thứ tự, tiếng Nhật/Việt).
- FR-1.2 Normalize **quyết định luận** bằng từ điển 聴取項目 + synonym (tái dụng tinh thần
  `text_normalizer` / `field_normalizer` đã 認定). Kết quả từng dòng có 3 trạng thái:
  - 🟢 **khớp chắc** → auto-fill block type + default;
  - 🟡 **mơ hồ** (≥2 ứng viên) → bắt buộc user chọn pulldown, không tự đoán;
  - 🔴 **không khớp** → chặn compile; mở luồng escalation (FR-9).
- FR-1.3 Không bao giờ đoán im lặng (fail-closed — nhất quán với `NO_CERTIFIED_PART` của pipeline).
- FR-1.4 Từ điển normalize là file dữ liệu bảo trì được (`tools/normalize_dictionary.json` — đề xuất),
  Owner thêm từ khoá qua escalation, lần sau tự thành 🟢.

### FR-2 — Sheet editor (màn hình làm việc chính)

- FR-2.1 Bảng: 1 hàng = 1 step. Cột lõi: No / Step ID (khoá) / Step名 / 聴取項目·block type (pulldown)
  / 入力形式 (pulldown) / 保存先 / Next (pulldown ref) / 失敗時 / Retry / 状態 / 備考.
- FR-2.2 Mọi field hiển thị trạng thái **AUTO (xám) / OVERRIDE (đậm)**; mỗi field OVERRIDE có nút
  「↩ デフォルトに戻す」.
- FR-2.3 Thêm/xoá/di chuyển hàng: hệ thống tự nối lại `next` mặc định (dây thẳng); nếu thao tác
  tại điểm rẽ nhánh thì hỏi user chọn cách nối.
- FR-2.4 Sửa TTS / Choices / AmiVoice / Termination / Settings trên các tab tương ứng
  (mapping 1:1 với sheet Excel §5).
- FR-2.5 Custom script: Staff chỉ chọn được template部品 từ catalog; ô "custom" khoá lại,
  chỉ Owner nhập (đánh dấu cần Owner review trong Review Package).

### FR-3 — Canvas preview

- FR-3.1 Render sơ đồ node realtime từ Decision Model (tái dụng engine React Flow + auto-layout
  của webapp hiện có). Phase 1: **read-only** (sheet để sửa, canvas để hiểu).
- FR-3.2 Click node ↔ nhảy tới hàng tương ứng trên sheet (đồng bộ 2 chiều về selection).
- FR-3.3 Node lỗi/🔴/🟡 hiển thị badge trạng thái ngay trên canvas.

### FR-4 — Validation 3 tầng

- FR-4.1 **Tầng 0 — Ngăn ngừa**: pulldown vocabulary đóng (R3.5); `next` chỉ chọn từ step tồn tại;
  field bắt buộc không rỗng. Mục tiêu: phần lớn lỗi *không thể nhập ra được*.
- FR-4.2 **Tầng 1 — Realtime trên UI** (~10 rule đồ thị, viết TS): step mồ côi; dead-end thiếu
  termination; tham chiếu next gãy; vòng lặp; slot thiếu `save_to`; trùng tên step. Badge đỏ tức thời.
- FR-4.3 **Tầng 2 — Gate chính thức**: `qa_validator.py` (40 rule) chạy khi compile — phán quyết
  cuối cùng, không port sang TS. *Spike cần làm*: chạy qa_validator nguyên bản trong browser bằng
  Pyodide/WASM (khả thi vì chỉ dùng stdlib) → zero drift, không cần backend. Nếu spike fail →
  fallback: compile qua GitHub Actions.
- FR-4.4 Lỗi hiển thị bằng ngôn ngữ dễ hiểu theo quy tắc `spec-kit-communication.md`
  (kèm mã check gốc T-x/L-x/E-x để Owner tra).

### FR-5 — Xuất Excel（★ deliverable chính = specs document）

- FR-5.1 Xuất 1 file `spec_{施設}_{flow}_v{n}.xlsx` theo đúng cấu trúc workbook §5.
- FR-5.2 Excel **tự đứng được như tài liệu**: người không mở UI vẫn đọc hiểu toàn bộ nghiệp vụ.
- FR-5.3 Dropdown trong Excel bằng **Data Validation** (sinh từ spec schema — R3.5); vùng máy quản lý
  (Step ID, cột 状態, sheet `_schema`) **khoá cell**; không macro.
- FR-5.4 Màu thể hiện AUTO (nền xám) / OVERRIDE (nền trắng chữ đậm) đồng nhất với UI.
- FR-5.5 Sheet 表紙 có bảng **改訂履歴** (version / ngày / người sửa / tóm tắt thay đổi) — UI tự
  ghi thêm dòng mỗi lần xuất.

### FR-6 — Import Excel (round-trip & sửa offline)

- FR-6.1 Import file Excel spec (kể cả file đã được Staff sửa tay offline) → dựng lại Decision Model.
- FR-6.2 Kiểm tra khi import: schema version khớp; Step ID không bị sửa/trùng; giá trị ngoài
  vocabulary → báo lỗi từng ô (địa chỉ cell cụ thể), không nhận mù.
- FR-6.3 Nghiệm thu R3.4: export → import → export ra file tương đương.

### FR-7 — Compile & Review Package

- FR-7.1 `excel_to_yaml.py` (mới, thuần Python stdlib): Excel spec → 設計書 YAML (scenario_flow
  hiện hành). Deterministic — cùng input cùng output.
- FR-7.2 `excel_review_gen.py` (mới): sinh Review Package = flow図 drawio (tái dụng yaml-to-drawio)
  + TTS一覧 + AmiVoice辞書一覧 + script logic preview + settings summary — đúng checklist trong
  tài liệu ý tưởng.
- FR-7.3 Nút compile trên UI chỉ bật khi tầng 1 sạch lỗi; kết quả qa_validator hiển thị lại trên UI.

### FR-8 — Lưu trữ & phiên bản

- FR-8.1 Vị trí: `output/scenarios/{施設}_{flow}/` (free zone hiện hành) gồm: Excel spec + 設計書
  YAML derive + Review Package. Cơ chế ghi: GitHub Contents API + token sẵn có của webapp.
- FR-8.2 Mỗi lần lưu = 1 commit; message tự sinh từ tóm tắt thay đổi (改訂履歴).

### FR-9 — Escalation (mở rộng vocabulary)

- FR-9.1 Khi 🔴 hoặc "không có lựa chọn phù hợp trong pulldown": Staff bấm 「報告」→ hệ thống tạo
  phiếu (GitHub Issue) kèm ngữ cảnh (dòng text gốc, step, kịch bản).
- FR-9.2 Owner xử lý theo luật mở rộng của ý tưởng gốc: ① thêm script template vào catalog,
  ② thêm block type (scaffold + qa_validator), hoặc ③ thêm synonym vào từ điển normalize
  → spec schema tái sinh → pulldown UI + Excel tự cập nhật lần sau.
- FR-9.3 **Cấm "patch ngoài spec"** — không có đường tắt sửa YAML/BIVR tay cho case thiếu vocabulary.

---

## 5. Đặc tả workbook Excel（specs document）

Tên file: `spec_{施設名}_{フロー名}_v{n}.xlsx` — 1 flow = 1 file.

| # | Sheet | Nội dung | Cột chính (header tiếng Nhật cho Staff) |
|---|---|---|---|
| 0 | **表紙** | Thông tin chung + phê duyệt | 施設名 / フロー名 / バージョン / 作成者 / 作成日 / 承認状況 / **改訂履歴**(版・日付・担当・変更概要) |
| 1 | **Flow（フロー定義）** | 1 hàng = 1 step | No / **StepID**(khoá) / ステップ名 / 聴取項目(▼) / ブロック型(▼26種) / 入力形式(▼enum·text·datetime) / 保存先 / Next(▼StepID) / 失敗時(▼) / リトライ回数 / **状態**(AUTO·OVERRIDE, khoá) / 備考 |
| 2 | **TTS（発話文言）** | Toàn bộ câu thoại | StepID / モジュール名 / 発話テキスト / 由来(デフォルト·カスタム) / 原資料照合✅ |
| 3 | **Choices（選択肢・分岐）** | Enum & nhánh | StepID / ラベル / 値 / 行き先(▼StepID) |
| 4 | **Context（変数）** | Biến & hiển thị | 変数名 / DisplayType(▼TEXT·DATE·PHONE_NUMBER…) / 保存値 |
| 5 | **Scripts（ロジック部品）** | Phán định | StepID / テンプレートキー(▼từ parts_catalog) / パラメータ / カスタム(Owner専用・khoá với Staff) |
| 6 | **AmiVoice（辞書）** | Từ điển STT theo block | StepID / 登録単語（区切り可） |
| 7 | **Termination（終話）** | Pattern kết thúc | 名前 / 条件 / TTSアナウンス / status / SMSフラグ / 完了フラグ名 |
| 8 | **Settings（設定）** | Tham số hệ thống | office_id / 電話番号 / 営業時間 / 環境(demo·prod) / SMS設定 … |
| 9 | **_schema**（ẩn·khoá） | Vùng máy | vocabulary cho Data Validation / schema version / checksum liên kết với YAML derive |

Quy ước chung: ▼ = Data Validation dropdown; nền xám = AUTO; StepID & cột 状態 & sheet `_schema`
= cell khoá; không macro/VBA.

---

## 6. Yêu cầu phi chức năng (NFR)

- **NFR-1** UI chạy trên nền webapp hiện có (Vite + React 18 + React Flow + zustand + Tailwind —
  tech stack khoá cứng theo CLAUDE.md của builder); static site, không server mới.
- **NFR-2** Đọc/ghi Excel client-side. *Cần Owner duyệt dependency mới* (đề xuất: `exceljs` — hỗ trợ
  Data Validation + style + cell lock; SheetJS bản community không ghi được style). Đây là
  ngoại lệ theo luật quản lý dependency — ghi rõ để duyệt trước khi code.
- **NFR-3** Auth & phân quyền: dùng Google auth + fine-grained token hiện có. Quyền "Owner"
  (mở khoá custom script, duyệt compile) xác định theo danh sách admin đã có trong webapp.
- **NFR-4** Ngôn ngữ UI & Excel header: tiếng Nhật (đối tượng Staff); code/identifier tiếng Anh.
- **NFR-5** Hiệu năng: normalize + validation tầng 1 < 1s cho flow ≤ 100 step; compile ≤ vài giây.
- **NFR-6** Không LLM trong đường chính (keystone). Nếu sau này thêm AI gợi ý ở khâu 🔴,
  phải là opt-in và mọi kết quả qua người confirm.

---

## 7. Thành phần cần xây (khớp với tài liệu ý tưởng, có điều chỉnh)

| Thành phần | Loại | Ghi chú |
|---|---|---|
| `tools/spec_schema_gen.py` | **Mới (bổ sung so với ý tưởng gốc)** | Xuất spec schema từ qa_validator + parts_catalog → nguồn duy nhất cho mọi pulldown (R3.5) |
| `tools/excel_to_yaml.py` | Mới | Compiler Excel → 設計書 YAML |
| `tools/excel_review_gen.py` | Mới | Review Package (tái dụng yaml-to-drawio, gen_properties) |
| `tools/normalize_dictionary.json` | Mới | Từ điển 聴取項目 + synonym cho FR-1 |
| UI: màn paste/normalize, sheet editor, canvas preview, export/import Excel | Mới (trong webapp) | Trên nền code webapp sau khi merge repo (MERGE_PLAN Phase 1–2) |
| `tools/voicebot_template.xlsx` | **Đổi cách làm** | Không bảo trì tay — sinh tự động từ spec schema |
| Pipeline gen_flow | **Không đổi** | Từ 設計書 YAML trở đi giữ nguyên 100% |

---

## 8. Tiêu chí nghiệm thu tổng thể (Definition of Done của spec này)

1. Round-trip: UI → Excel → import → Excel tương đương (R3.4) trên ≥3 kịch bản thật
   (`_proto_flat`, `Medcity21_健診`, 1 kịch bản mới nhập tay).
2. Excel spec của kịch bản mẫu được Staff thật đọc hiểu không cần hướng dẫn (test 1 buổi).
3. `excel_to_yaml.py` output qua `qa_validator.py` **PASS 0 CRITICAL** với kịch bản mẫu.
4. Nhập từ paste → Excel hoàn chỉnh cho flow chuẩn (冒頭→用件→cá nhân 4 slot→終話) ≤ 30 phút bởi Staff.
5. Sửa 1 câu TTS trên kịch bản đã có → xuất version mới → diff git chỉ ra đúng thay đổi đó.

---

## 9. Điểm mở cần chốt trước khi code（要決定事項）

| # | Câu hỏi | Phương án đề xuất |
|---|---|---|
| Q1 | Thư viện Excel client-side (NFR-2) | `exceljs` — cần Owner duyệt dependency |
| Q2 | Validation tầng 2 trong browser: Pyodide hay GitHub Actions? | Spike Pyodide 1–2 ngày trước, fail thì Actions |
| Q3 | Phase 1 có cần sửa cấu trúc trên canvas (kéo-thả) không? | Không — canvas read-only, sửa qua sheet (giảm ½ khối lượng UI) |
| Q4 | Import Excel do Staff sửa offline: cho phép từ đầu hay chỉ export trước? | Export trước (FR-5), import (FR-6) ngay sau khi round-trip ổn định |
| Q5 | Quan hệ với merge repo | Cần MERGE_PLAN Phase 1–2 xong trước khi code UI (webapp cần đứng cạnh schemas/tools để ăn spec schema) |
| Q6 | AI pre-fill từ canvas khách hàng (đã bàn) | Để v2, opt-in, ngoài phạm vi phase 1 |

---

## 10. Lộ trình đề xuất (chỉ kế hoạch — chưa code)

| Giai đoạn | Nội dung | Điều kiện vào |
|---|---|---|
| **P0** | Chốt tài liệu này (Q1–Q6) + review 2 phía | — |
| **P1** | Merge repo (MERGE_PLAN Phase 1–2) + `spec_schema_gen.py` | P0 xong |
| **P2** | `excel_to_yaml.py` + template Excel sinh máy + round-trip test (chưa cần UI — chứng minh concept bằng Excel thuần) | P1 |
| **P3** | UI: paste/normalize + sheet editor + export Excel | P2 |
| **P4** | Canvas preview + validation tầng 1 + spike Pyodide | P3 |
| **P5** | Import Excel + escalation + Review Package tích hợp UI | P4 |
