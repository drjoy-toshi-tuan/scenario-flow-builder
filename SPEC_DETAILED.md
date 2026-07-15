# SPEC_DETAILED.md — Spec-Driven Voicebot Builder（詳細設計 / spec cấp thực thi）

> Phiên bản 0.1 — 2026-07-15. Tài liệu NGUỒN cho Claude Code implement.
> Đọc kèm: `SPEC_REQUIREMENTS.md` (yêu cầu tổng), `MERGE_PLAN.md` (bố trí repo).
> Quy ước trong tài liệu: **[HỆ THỐNG]** = bước máy tự làm; **[USER]** = thao tác người.
> Mọi hằng số, schema, mã lỗi trong đây là CHUẨN — code phải khớp từng tên field.

---

## §0. Ranh giới & luật cứng cho người implement

1. **KHÔNG sửa** pipeline gen_flow (`scripts/`, `schemas/`, `modules/` — trừ file MỚI trong `tools/`).
2. **KHÔNG thêm dependency** ngoài danh sách đã duyệt ở §1.3.
3. Code TS mới nằm trong webapp theo kiến trúc sẵn có: logic thuần vào `src/spec/` (không import React — giống quy tắc `src/ir/`); UI vào `src/components/`, `src/files/`; state vào `src/store/`.
4. Code Python mới chỉ nằm trong `tools/`, **stdlib-only** (trừ `yaml` đã có sẵn trong repo), có test `tools/test_*.py` chạy bằng `python3 -m unittest`.
5. Mọi hàm biến tên tiếng Anh; comment nghiệp vụ được phép tiếng Nhật/Việt; UI label tiếng Nhật.
6. Vocabulary (block type…) **không được hardcode** trong TS/Excel — chỉ đọc từ `spec_schema.json` (§2.1).

### §1.3 Dependency được duyệt trước

| Package | Nơi dùng | Lý do |
|---|---|---|
| `exceljs` | webapp (client-side) | Ghi/đọc xlsx với Data Validation + style + cell lock. **Chờ Owner xác nhận trước khi npm install** |
| (không thêm gì khác) | — | zustand/yaml/@xyflow đã có sẵn |

---

## §2. DATA CONTRACTS（chuẩn dữ liệu — code phải khớp từng tên field）

### §2.1 `spec_schema.json` — sinh bởi `tools/spec_schema_gen.py`, đầu vào của MỌI pulldown

Đường dẫn output: `tools/generated/spec_schema.json` (commit vào git; webapp import lúc build qua `webapp/src/spec/schema.ts` đọc file copy `webapp/src/spec/generated/spec_schema.json`).

```jsonc
{
  "schema_version": "2026-07-15T00:00:00+09:00#<sha256-12 đầu của nội dung>",
  "generated_from": {
    "qa_validator": "schemas/qa_validator.py",
    "parts_catalog": "modules/parts_catalog.json"
  },
  "block_types": [            // ĐÚNG 26 phần tử, trích tự động từ KNOWN_BLOCK_TYPES
    {
      "type": "hearing",                     // key máy
      "label_ja": "聴取（音声入力）",         // nhãn hiển thị pulldown (bảng §2.1.a)
      "category": "input",                   // opening|announce|input|branch|logic|transfer|terminal|special
      "required_fields": ["output_format"],  // trích tự động từ BLOCK_REQUIRED_FIELDS
      "optional_fields": ["output_labels", "conditions", "save_to", "next", "failed"],
      "allow_conditions": true,              // được có nhánh conditions không
      "is_terminal": false
    }
    // ... 25 type còn lại
  ],
  "slot_types": ["patient_name", "date_of_birth", "phone", "card_number"], // từ SLOT_SUPPORTED + card
  "output_formats": ["enum", "text", "datetime"],
  "display_types": ["TEXT", "DATE", "PHONE_NUMBER"],
  "augment_patterns": ["new_module", "none_applicable", "director_handled"],
  "script_templates": [        // từ parts_catalog.json .parts[] — CHỈ lấy status=="certified"
    {
      "part_id": "ambiguity_gate",
      "purpose": "…(nguyên văn field purpose)…",
      "spec_vars": ["MIN_QUERY_CHARS", "..."],  // tham số user phải điền
      "wiring_vars": ["SOURCE_MODULE", "GROUP"],
      "certified_spec_labels": ["default"]
    }
    // ... 22 部品
  ]
}
```

**§2.1.a Bảng `label_ja` + `category` cố định** (spec_schema_gen giữ bảng này trong code; type mới chưa có trong bảng → label = tên type, category = `special`, đồng thời exit code 2 kèm cảnh báo để Owner bổ sung):

| type | label_ja | category |
|---|---|---|
| opening | 冒頭 | opening |
| announcement | アナウンス | announce |
| hearing | 聴取（音声入力） | input |
| slot | 個人情報スロット | input |
| patient_name | 氏名聴取 | input |
| dob | 生年月日聴取 | input |
| phone | 電話番号聴取 | input |
| card_number | 診察券番号聴取 | input |
| free_text | 自由発話聴取 | input |
| intent | 用件判定 | branch |
| faq | FAQ照合 | branch |
| context_match_router | コンテキスト分岐 | branch |
| cmr_chain | CMRチェーン分岐 | branch |
| incoming_category_classifier | 着信種別分岐 | branch |
| phone_branch | 電話種別分岐 | branch |
| null_check | 事前入力チェック | branch |
| date_of_call_classifier | 当日判定 | branch |
| script | スクリプト | logic |
| clinical_department | 診療科聴取 | logic |
| clinical_department_normalize | 診療科正規化 | logic |
| clinical_department_classifier | 診療科分類 | logic |
| phone2name | 電話帳照合 | logic |
| subflow | サブフロー呼出 | special |
| call_transfer | 転送 | transfer |
| termination | 終話 | terminal |
| augment | （暫定枠）augment | special |

> Lưu ý cho C1: `date_of_call_classifier` nếu không còn trong KNOWN_BLOCK_TYPES thì KHÔNG phát sinh — bảng label chỉ là phụ chú, **danh sách thật lấy runtime từ qa_validator**.

### §2.2 Decision Model — TS types (file `webapp/src/spec/types.ts`)

```ts
export interface SpecDoc {
  specVersion: '1';                 // version format Decision Model
  schemaVersion: string;            // copy từ spec_schema.json lúc tạo/migrate
  meta: {
    facility: string;               // 施設名
    flowName: string;               // フロー名
    author: string;
    createdAt: string;              // 'yyyy-MM-dd HH:mm' (JST)
    updatedAt: string;
    revision: number;               // tăng +1 mỗi lần export Excel
    revisionHistory: RevisionEntry[];
  };
  steps: SpecStep[];                // THỨ TỰ = thứ tự hàng trên sheet
  terminations: TerminationPattern[];
  contexts: ContextVar[];
  settings: FlowSettings;
  pastedSource?: string;            // text gốc user dán (chỉ để tham khảo, KHÔNG dùng lại)
}

export interface RevisionEntry { rev: number; date: string; author: string; summary: string; }

export type FieldState = 'auto' | 'override';

/** Field 2 trạng thái: auto → compiler quyết; override → giá trị user. */
export interface Ovr<T> { state: FieldState; value?: T }   // state==='auto' ⇒ value undefined

export interface SpecStep {
  id: string;                       // 'S001'.. bất biến, máy cấp, KHÔNG tái sử dụng sau khi xoá
  label: string;                    // ステップ名 (user sửa được, phải unique — V1-06)
  blockType: string;                // key trong spec_schema.block_types
  normalizeStatus: 'matched' | 'chosen' | 'unresolved';  // 🟢/🟡đã chọn/🔴
  fields: Record<string, Ovr<unknown>>;  // các field theo block type (§2.1)
  next: Ovr<string | null>;         // Step id; auto = hàng kế tiếp; null = không nối (chỉ terminal)
  failed: Ovr<string | null>;       // Step id hoặc termination id ('E01'..); auto = END_聴取失敗
  choices: ChoiceRow[];             // chỉ khi output_format==='enum' hoặc block branch
  tts: Ovr<string>;                 // câu thoại chính của step (nếu type có phát ngôn)
  amivoiceWords: string[];          // từ điển đăng ký theo step
  scriptTemplate?: { partId: string; params: Record<string, string> }; // khi blockType==='script'
  note: string;                     // 備考
}

export interface ChoiceRow { label: string; value: string; next: string }  // next = Step id | termination id

export interface TerminationPattern {
  id: string;                       // 'E01'..
  name: Ovr<string>;                // auto ⇒ compiler đặt 'END_完了'…
  condition: string;
  tts: Ovr<string>;
  status: Ovr<string>;              // '0'..'5'
  smsFlag: Ovr<'0' | '1'>;
  completionFlagName: Ovr<string>;
}

export interface ContextVar { name: string; displayType: string; savedValue: Ovr<string> }

export interface FlowSettings {
  officeId: Ovr<string>; phoneNumber: string; businessHours: Ovr<string>;
  environment: 'demo' | 'production'; flowType: '1flow' | 'subflow';
}
```

**Bất biến của model (code phải enforce, có unit test):**
- I-1 `steps[i].id` unique, dạng `/^S\d{3}$/`; id đã cấp không cấp lại kể cả sau xoá (giữ `nextIdSeq` khi serialize).
- I-2 Mọi tham chiếu (`next.value`, `failed.value`, `choices[].next`) chỉ được là id tồn tại hoặc `E\d{2}`.
- I-3 `Ovr.state==='auto'` ⇒ `value===undefined` (serializer phải strip).
- I-4 `SpecDoc` serialize ổn định: key order cố định, không timestamp phát sinh trong nội dung steps (round-trip diff = 0).

### §2.3 `normalize_dictionary.json` (file mới `tools/normalize_dictionary.json`, copy vào `webapp/src/spec/generated/`)

```jsonc
{
  "version": 1,
  "entries": [
    {
      "canonical": "氏名聴取",          // 聴取項目 chuẩn (hiển thị)
      "block_type": "patient_name",     // map thẳng sang block type
      "defaults": { "save_to": "patientName" },
      "synonyms": ["氏名", "名前", "なまえ", "フルネーム", "患者氏名", "ten", "họ tên"]
    },
    { "canonical": "生年月日聴取", "block_type": "dob",
      "defaults": { "save_to": "patientDateOfBirth" },
      "synonyms": ["生年月日", "誕生日", "DOB", "ngày sinh"] },
    { "canonical": "電話番号聴取", "block_type": "phone",
      "defaults": { "save_to": "additionalPhoneNumber" },
      "synonyms": ["電話番号", "電話", "TEL", "SĐT", "số điện thoại"] },
    { "canonical": "診察券番号聴取", "block_type": "card_number",
      "defaults": { "save_to": "patientCardNumber" },
      "synonyms": ["診察券", "診察券番号", "カード番号"] },
    { "canonical": "冒頭", "block_type": "opening", "defaults": {}, "synonyms": ["オープニング", "開始", "welcome", "mở đầu"] },
    { "canonical": "アナウンス", "block_type": "announcement", "defaults": {}, "synonyms": ["案内", "説明", "announce"] },
    { "canonical": "用件聴取", "block_type": "intent", "defaults": {}, "synonyms": ["用件", "ご用件", "メニュー", "yōken", "yoken"] },
    { "canonical": "FAQ", "block_type": "faq", "defaults": {}, "synonyms": ["よくある質問", "質問対応"] },
    { "canonical": "診療科聴取", "block_type": "clinical_department", "defaults": {}, "synonyms": ["診療科", "科", "khoa"] },
    { "canonical": "転送", "block_type": "call_transfer", "defaults": {}, "synonyms": ["取次", "オペレーター", "有人対応", "chuyển máy"] },
    { "canonical": "終話", "block_type": "termination", "defaults": {}, "synonyms": ["終了", "切断", "hangup", "kết thúc"] }
  ]
}
```
Owner bổ sung entry qua escalation (§C12). File này là dữ liệu, KHÔNG hardcode trong TS.

### §2.4 設計書 YAML đích（compile target — PHẢI qua `qa_validator.py` PASS）

12 section bắt buộc (trích `qa_validator.REQUIRED_SECTIONS`): `basic_info, flow_structure, purpose, flow_diagrams, context_fields, hearing_items, step_details, termination_patterns, tts_modules, amivoice_dictionary, special_notes, confirmation_items` + `scenario_flow`. Mapping chi tiết ở §C9.

---

## §3. ĐẶC TẢ WORKBOOK EXCEL（tọa độ & style chính xác）

File: `spec_{facility}_{flowName}_v{revision}.xlsx`. Tabs theo thứ tự: `表紙, Flow, TTS, Choices, Context, Scripts, AmiVoice, Termination, Settings, _model`(ẩn), `_schema`(ẩn).

Style chung: header hàng 1 (đóng băng), fill `FF1F2937` chữ trắng bold; AUTO cell fill `FFF3F4F6` chữ `FF6B7280`; OVERRIDE fill trắng chữ `FF111827` bold; sheet protection bật với password rỗng, cell nhập liệu `locked:false`.

### Sheet `Flow` (cột A→L)

| Cột | Header (ja) | Nhập | Data Validation |
|---|---|---|---|
| A | No | khoá (số thứ tự) | — |
| B | StepID | khoá | — |
| C | ステップ名 | text | — |
| D | 聴取項目 | ▼ | list: canonical của §2.3 + `(その他)` |
| E | ブロック型 | ▼ | list: `block_types[].label_ja`（ghi label; import map ngược qua bảng） |
| F | 入力形式 | ▼ | `enum,text,datetime` |
| G | 保存先 | text | — |
| H | Next | ▼ | list: toàn bộ `StepID: ステップ名` + `E01..` |
| I | 失敗時 | ▼ | như H |
| J | リトライ回数 | ▼ | `1,2,3` |
| K | 状態 | khoá | tự ghi `AUTO`/`OVERRIDE`（cấp hàng: OVERRIDE nếu ≥1 field override） |
| L | 備考 | text | — |

Data Validation của E/H/I trỏ vùng ẩn trong sheet `_schema` (named range `BLOCK_LABELS`, `STEP_REFS`) — exceljs: `dataValidation: { type:'list', formulae:['=_schema!$A$2:$A$27'] }`.

### Các sheet còn lại (cột chính)

- `TTS`: A StepID(khoá) / B モジュール名(khoá, sinh máy) / C 発話テキスト / D 由来(AUTO·OVERRIDE, khoá) / E 原資料照合✅(▼ `未,済`).
- `Choices`: A StepID / B ラベル / C 値 / D 行き先(▼ STEP_REFS).
- `Context`: A 変数名 / B DisplayType(▼) / C 保存値 / D 状態(khoá).
- `Scripts`: A StepID / B テンプレートキー(▼ `script_templates[].part_id`) / C パラメータ(JSON 1 dòng `{"K":"V"}`) / D カスタム(Owner専用・khoá).
- `AmiVoice`: A StepID / B 登録単語（区切り `／`）.
- `Termination`: A ID(khoá `E01`..) / B 名前 / C 条件 / D TTSアナウンス / E status(▼`0..5`) / F SMSフラグ(▼`0,1`) / G 完了フラグ名 / H 状態(khoá).
- `Settings`: dạng key-value 2 cột (A key ja khoá, B value): 施設名/フロー名/office_id/電話番号/営業時間/環境(▼demo·production)/フロー種別(▼1flow·subflow).
- `表紙`: block thông tin B2:C8 + bảng 改訂履歴 từ hàng 11 (版/日付/担当/変更概要).

### Sheet `_model` (ẩn — chìa khoá round-trip lossless)

- Cell A1: chuỗi `VFB_SPEC_MODEL_V1`. Cell A2: JSON của `SpecDoc` (I-4 serialize ổn định), chunk 30.000 ký tự/cell xuống A2,A3,… nếu dài.
- **Luật import (§C8)**: sheet nhìn thấy là phần con người có thể đã sửa offline; `_model` là bản máy. Import = đọc `_model` làm nền, diff với cell nhìn thấy; cell khác `_model` ⇒ coi là OVERRIDE mới của user (cập nhật vào model). `_model` thiếu/hỏng ⇒ dựng model chỉ từ sheet nhìn thấy (mọi giá trị thành OVERRIDE) + cảnh báo `IMP-20`.

### Sheet `_schema` (ẩn): vùng list cho Data Validation + `schema_version` (A1) + checksum SpecDoc (B1, sha256).

---

## §4. ĐẶC TẢ TỪNG COMPONENT — từng bước hệ thống làm gì

### C1. `tools/spec_schema_gen.py`

Input: `schemas/qa_validator.py`, `modules/parts_catalog.json`. Output: `tools/generated/spec_schema.json` + copy `webapp/src/spec/generated/`.

Thuật toán:
1. Import module `qa_validator` (thêm `schemas/` vào sys.path) → đọc `KNOWN_BLOCK_TYPES`, `BLOCK_REQUIRED_FIELDS`, `AUGMENT_PATTERNS`; import `SLOT_SUPPORTED` từ `scaffold_generator` (fallback y như qa_validator đang làm). **Không regex-parse file** — import thật để không lệch.
2. Đọc `parts_catalog.json` → lọc `parts[].status=="certified"` → map field theo §2.1.
3. Ghép bảng label §2.1.a; type thiếu label → thêm với label=type, in cảnh báo, **exit code 2** (CI fail mềm để Owner bổ sung bảng).
4. Serialize JSON `ensure_ascii=False, indent=2, sort_keys=False` (thứ tự §2.1); tính `schema_version`; ghi 2 nơi.
5. `--check`: chỉ so sánh với file hiện có, khác ⇒ exit 1 (dùng cho CI chống trôi).

Test: sinh ra đủ 26 type; mọi key của `BLOCK_REQUIRED_FIELDS` có mặt; chạy 2 lần liên tiếp → file identical.

### C2. Normalize engine — `webapp/src/spec/normalize.ts` (hàm thuần)

`normalizePasted(text: string, dict: NormalizeDictionary): NormalizeResult`

1. Tách bước: split theo `\n`; mỗi dòng split tiếp theo `→ -> ⇒ >` ; loại token rỗng.
2. Chuẩn hoá từng token: NFKC → trim → bỏ đầu mục (`^\d+[\.\)、]\s*`, `^[・\-\*]\s*`) → lưu `raw` + `norm` (norm: lowercase ASCII, bỏ khoảng trắng giữa, katakana→hiragana bảng cố định).
3. Match theo thứ tự: (a) `norm == canonical.norm` → 🟢; (b) `norm` khớp đúng 1 synonym → 🟢; (c) khớp ≥2 entry, hoặc canonical/synonym là **substring** của token (chỉ khi len(token)≥4) với đúng 1 entry → 🟡 kèm `candidates[]` xếp theo: match dài hơn trước, rồi thứ tự trong dict; (d) còn lại → 🔴.
4. KHÔNG fuzzy/LLM. Kết quả: `{ items: [{raw, status: 'matched'|'ambiguous'|'unknown', entry?, candidates?}] }`.
5. Sau khi user chốt hết 🟡🔴 (hoặc gán `(その他)`+chọn block type tay), `buildSpecDoc(items)` dựng `SpecDoc`: cấp id S001.. theo thứ tự; `next=auto` (chuỗi thẳng); mọi field `auto`; áp `defaults` của entry (vd `save_to`) ở trạng thái **auto** (để compiler điền — user chưa đụng); tự thêm: step đầu nếu chưa phải opening → chèn `S000?` không — **quy tắc**: nếu item đầu không phải opening thì tự thêm step opening AUTO ở đầu, nếu item cuối không phải termination thì tự thêm step termination AUTO + `terminations` mặc định 3 pattern: `END_完了`, `END_聴取失敗`, `END_非通知` (giá trị auto).

Test vàng (fixture `normalize.golden.test.ts`): input `"冒頭→用件→氏名→生年月日→電話番号→終話"` ra đúng 6 step 🟢 với block_type `[opening, intent, patient_name, dob, phone, termination]`.

### C3. Default engine — `webapp/src/spec/defaults.ts`

Nguyên tắc chia đôi:
- **Materialized defaults** (compiler PHẢI ghi ra YAML vì qa_validator đòi — theo `required_fields`): `hearing.output_format='enum'` khi có choices ngược lại `'text'`; `slot.slot=<slot_type>`; `intent.save_to='yoken'`; `free_text.save_to='freeText'`; `card_number.save_to='patientCardNumber'`; `termination.termination_ref=<id pattern tương ứng>`; `null_check.true_next/false_next` không có default → bắt OVERRIDE (V1-08).
- **Deferred defaults** (KHÔNG ghi ra YAML khi auto — scaffold_generator downstream tự lo): retry announce, echo_back, REPEAT route, failed-chain chi tiết, layout.
- `resolveField(step, fieldKey): {value, source: 'override'|'default'}` — UI hiển thị giá trị default ngay trên ô (màu xám) bằng hàm này; cùng hàm được compile dùng lại ⇒ **UI thấy gì compile ra đúng cái đó**.

Bảng default cụ thể (trích để test): `retryCount=2`; `failed` auto → termination `END_聴取失敗`; TTS auto theo template chuỗi cố định trong `defaults.ts` (vd patient_name: `お名前をフルネームでお話しください。`) — bảng đầy đủ 26 type để trong `defaults.ts` dạng const, có unit test snapshot.

### C4. Sheet editor UI — `webapp/src/components/SpecSheetEditor/`

State: store zustand mới `specStore` (`webapp/src/store/specStore.ts`): `{doc: SpecDoc, dirty: boolean, validation: V1Issue[], selectedStepId}` + actions: `setField(stepId, key, value)` (đặt override), `resetField(stepId, key)` (về auto), `insertStep(afterId)`, `deleteStep(id)`, `moveStep(id, dir)`, `setChoices(...)`, v.v. **Mọi mutation qua action — component không sửa doc trực tiếp** (giống quy tắc IR hiện hành).

Hành vi từng thao tác:
1. **[USER] sửa ô** → `setField` → field sang `override`; ô đổi style; cột 状態 hàng đó = OVERRIDE; chạy lại `validateTier1` (debounce 300ms).
2. **[USER] bấm ↩** trên ô override → `resetField` → `auto`, ô hiện lại giá trị `resolveField` màu xám.
3. **[USER] insertStep(after S002)** → **[HỆ THỐNG]**: cấp id mới; step mới `blockType='announcement'` mặc định, mọi field auto; nếu `S002.next` đang **auto** → không đổi gì (auto = hàng kế, tự trỏ step mới theo thứ tự); nếu `S002.next` **override** → giữ nguyên override (dây cũ), step mới `next=auto`; KHÔNG bao giờ tự đổi một giá trị override.
4. **[USER] deleteStep(Sxxx)** → **[HỆ THỐNG]** tìm mọi tham chiếu override tới Sxxx (`next/failed/choices`), nếu có → dialog liệt kê `「S001 用件 の Next が参照しています。付け替え先を選択」` bắt chọn re-target (pulldown) hoặc huỷ; tham chiếu auto tự lành theo thứ tự.
5. **[USER] đổi blockType** → **[HỆ THỐNG]** giữ các field trùng tên còn hợp lệ (theo `optional/required_fields` type mới), field không còn hợp lệ bị drop **sau khi confirm dialog** liệt kê field sẽ mất.
6. **[USER] đổi label** → chỉ đổi label; mọi tham chiếu dùng id nên không gãy (I-2); nếu trùng label → V1-06 đỏ.
7. Tab phụ (TTS/Choices/Context/Scripts/AmiVoice/Termination/Settings) render từ cùng `doc`, cùng quy tắc auto/override.

### C5. Canvas preview — tái dụng engine hiện có

`webapp/src/spec/specToIr.ts`: `specToFlowIR(doc, schema): FlowIR` (thuần) — map để render:
category `opening|announce`→`announce`; `input`→`interaction`; `branch`→`nexus`; `logic`→`logic`; `transfer`→`transfer`; `terminal`→`hangup`; `subflow`→`jump`; `augment`→`logic`+badge. Edge: `next` (resolve auto = step kế), `failed` (edge nét đứt, `sourceHandle:'failed'`), `choices[]` (edge label = choice label). Node `data.__specStatus` = `{normalizeStatus, hasError}` để node component vẽ badge 🟡🔴/đỏ. Render bằng `FlowCanvas` sẵn có ở chế độ readOnly (thêm prop `readOnly` nếu chưa có — chặn drag-connect, cho phép pan/zoom/click). Click node → `specStore.selectedStepId` → bảng scroll tới hàng; và ngược lại.

### C6. Validation tầng 1 — `webapp/src/spec/validateTier1.ts` (thuần, sync)

`validateTier1(doc, schema): V1Issue[]`, `V1Issue = { code, level:'error'|'warn', stepId?, field?, message_ja }`.

| Code | Điều kiện | Level |
|---|---|---|
| V1-01 | Tham chiếu next/failed/choices.next tới id không tồn tại | error |
| V1-02 | Step không tới được từ step đầu (BFS theo mọi edge) | error |
| V1-03 | Step không phải terminal mà không có đường ra (next resolve = null và không có choices) | error |
| V1-04 | Không có step `termination` nào / `terminations` rỗng | error |
| V1-05 | `required_fields` của blockType chưa có giá trị (resolveField trả undefined) | error |
| V1-06 | label trùng nhau (so sánh sau NFKC+trim) | error |
| V1-07 | Chu trình không đi qua node input nào (vòng lặp chết) | error |
| V1-08 | Field bắt buộc-phải-override chưa override (`null_check.true_next/false_next`, `subflow.flowname`, `cmr_chain.*`) | error |
| V1-09 | `choices[].value` trùng trong 1 step / choices rỗng khi output_format=enum | error |
| V1-10 | blockType=`augment` được dùng | warn |
| V1-11 | `normalizeStatus==='unresolved'` còn tồn tại | error |
| V1-12 | Scripts.パラメータ không parse được JSON / thiếu spec_vars của part | error |

`message_ja` viết theo `spec-kit-communication.md`: câu dễ hiểu + mã trong ngoặc. Compile bị chặn khi còn ≥1 `error`.

### C7. Excel export — `webapp/src/spec/excelExport.ts` (exceljs, chạy client)

1. `doc.meta.revision += 1`; push RevisionEntry (summary = user nhập trong dialog export, bắt buộc ≤60 ký tự).
2. Dựng workbook đúng §3 theo THỨ TỰ tab cố định; ghi từng sheet từ `doc` (giá trị hiển thị của ô auto = `resolveField`, style AUTO).
3. Ghi `_model` (JSON chunk), `_schema` (list + schema_version + checksum sha256 của JSON `_model`).
4. Bật protection từng sheet; chỉ unlock các ô nhập §3.
5. Xuất Blob → trả cho C11 lưu (và cho user tải về). Tên file: `spec_{facility}_{flowName}_v{revision}.xlsx` (sanitize: bỏ `/\:*?"<>|`, space→`_`).
6. **Xuất cả YAML derive** (gọi C9-TS preview — xem C9) để commit cùng lượt.

### C8. Excel import — `webapp/src/spec/excelImport.ts`

1. Đọc workbook; tìm `_schema!A1` → so `schema_version`: khác **major nguồn** (phần trước `#`) ⇒ cảnh báo IMP-01 (vẫn cho import, đánh dấu cần re-validate).
2. Đọc `_model` → parse JSON ⇒ `base: SpecDoc`. Hỏng/thiếu ⇒ IMP-20 (warn) và `base = null`.
3. Đọc các sheet nhìn thấy thành `visible` (map ngược label_ja→type qua schema; label không map được ⇒ **IMP-02 error kèm địa chỉ ô**, dừng).
4. Merge: có `base` → với từng ô, `visible ≠ resolveField(base)` ⇒ set override mới vào base (log thành `importDiff[]` cho user xem); không `base` → dựng SpecDoc từ visible, mọi giá trị = override, id giữ nguyên cột StepID (validate `/^S\d{3}$/` unique — sai ⇒ IMP-03 error).
5. Chạy `validateTier1` → hiển thị màn "インポート結果": bảng importDiff + issues → **[USER] confirm** mới ghi vào store.

Mã lỗi: IMP-01 schema lệch(warn) / IMP-02 giá trị ngoài vocabulary(error, kèm `Sheet!Cell`) / IMP-03 StepID hỏng(error) / IMP-10 tham chiếu gãy sau merge(error) / IMP-20 mất _model(warn).

### C9. Compile — 2 hiện thân, 1 bảng mapping

- `tools/excel_to_yaml.py` (Python, stdlib+yaml+zipfile đọc xlsx**chỉ qua `_model` JSON** — không parse style): dùng cho CI/chạy tay. Đọc `_model` → SpecDoc → YAML.
- `webapp/src/spec/compileYaml.ts` (TS): cùng logic để preview + commit từ UI. **Bảng mapping dưới đây là chuẩn chung; test vàng so sánh output 2 bản byte-equal** trên fixtures.

Bước compile (cả 2 bản):
1. Validate tier-1 lại; còn error ⇒ fail `CMP-01` liệt kê.
2. Sinh `scenario_flow`: mỗi SpecStep → 1 block `{ step: label, type: blockType, ...fields }`; field auto: materialized default (C3) thì ghi giá trị, deferred thì **omit**; `next`: resolve (auto→label step kế; termination→omit next, ghi `termination_ref`); choices → `conditions: [{match: value, next: label}]`; step tham chiếu bằng **label** (đúng format 設計書 hiện hành — qa_validator F-2 check theo step name).
3. Sinh 12 section §2.4: `basic_info` từ Settings/meta (`flow_name` = `{facility}${flowName}_{yyyymmdd}` — yyyymmdd từ meta.updatedAt); `context_fields` từ contexts; `hearing_items` từ steps category input (`step名/保存先/形式`); `step_details` từ steps có tts/choices (`step_name, tts_announcement, input_method:'voice_only'`, `openai_rules.output_values` = choices values khi intent/hearing-enum); `termination_patterns` từ terminations (resolve auto qua default engine); `tts_modules`/`amivoice_dictionary` từ tts/amivoiceWords; `flow_diagrams: "(auto-generated by spec builder)"`; `special_notes`/`confirmation_items`: từ note các step (rỗng thì `[]`/ghi chú mặc định).
4. Dump YAML: `allow_unicode`, indent 2, key order cố định như §2.4, header comment 3 dòng (`# 設計書 -- {facility} {flow}` / `# 生成元: spec builder v{specVersion} rev{revision}` / `# schema: {schemaVersion}`).
5. Python bản có flag `--validate`: gọi `schemas/qa_validator.py` subprocess với file vừa sinh, propagate exit code. **DoD: fixtures PASS 0 CRITICAL.**

### C10. Review Package — `tools/excel_review_gen.py`

Input: 設計書 YAML (output C9). Không đọc Excel. Các bước: (1) gọi logic yaml-to-drawio sẵn có (import hàm, không copy code) → `flow図.drawio`; (2) trích TTS一覧 + AmiVoice一覧 + Scripts logic (part purpose từ spec_schema) + Settings summary → 1 file `review_package_{facility}_{flow}.md` có checkbox từng mục theo format tài liệu ý tưởng. Output vào `output/scenarios/{facility}_{flowName}/`.

### C11. Lưu & commit từ UI (GitHub Contents API — tái dụng `webapp/src/github/`)

Trình tự khi **[USER] bấm 保存**: (1) export Excel (C7) + compile YAML (C9-TS); (2) PUT lần lượt: `output/scenarios/{facility}_{flowName}/spec_..._v{n}.xlsx` (base64), `設計書_{facility}_{flowName}.yaml` (ghi đè — tên KHÔNG mang version, là "bản hiện hành"); (3) message commit: `spec(v{n}): {facility}_{flowName} — {summary}`; (4) lỗi 409 (sha đổi — người khác đã sửa) ⇒ hiện dialog "リモートが更新されています" với 2 lựa chọn: tải remote về xem / ghi đè (confirm 2 lần); KHÔNG merge tự động.

### C12. Escalation

**[USER]** bấm 「該当する選択肢がない・報告」 từ ô pulldown → dialog nhập mô tả → **[HỆ THỐNG]** tạo GitHub Issue trên repo (API sẵn có) title `[vocab-request] {facility}_{flow}: {mô tả ngắn}`, body gồm: dòng text gốc, stepId, blockType hiện chọn, schema_version, link file spec. Step được đặt `blockType='augment'` + `normalizeStatus='unresolved'` (V1-10/11 giữ trạng thái chưa compile được — fail-closed).

---

## §5. TRÌNH TỰ END-TO-END（đánh số — "hệ thống làm gì" từng bước）

### 5.1 Tạo mới
1. [USER] mở UI → 新規作成 → nhập 施設名/フロー名 → dán text → 「解析」.
2. [HỆ THỐNG] C2 normalize → bảng kết quả 🟢🟡🔴 từng dòng.
3. [USER] chốt 🟡 (chọn 1 trong candidates) và 🔴 (chọn tay hoặc 報告 C12) → 「シート作成」.
4. [HỆ THỐNG] `buildSpecDoc` → thêm opening/termination nếu thiếu → mở Sheet editor; chạy V1 → badge.
5. [USER] sửa/confirm trên sheet (C4), xem canvas (C5).
6. [USER] 「保存」→ [HỆ THỐNG] C7+C9+C11 (3 bước, hiển thị tiến trình từng file, lỗi bước nào dừng bước đó và báo rõ).
7. [OWNER] chạy `python3 tools/excel_to_yaml.py --validate` + `tools/excel_review_gen.py` → duyệt Review Package → pipeline gen_flow như hiện hành.

### 5.2 Bảo trì
1. [USER] mở kịch bản từ danh sách (đọc `_model` trong xlsx mới nhất trên repo — không đọc YAML).
2. [USER] sửa N ô → mỗi ô thành override; 状態 cột đổi; V1 chạy lại.
3. [USER] 保存 với summary bắt buộc → revision +1 → file `_v{n+1}.xlsx` MỚI + YAML hiện hành ghi đè → git diff YAML thể hiện đúng N thay đổi.

### 5.3 Import file sửa offline: theo C8, luôn có màn confirm diff trước khi vào store.

---

## §6. FIXTURES & TEST MATRIX（DoD từng phần）

| ID | Test | PASS khi |
|---|---|---|
| T-01 | C1 chạy 2 lần → diff rỗng; đủ 26 type | ✅ |
| T-02 | C2 golden (§C2) + case 🟡 (`"電話"` khi dict có phone & phone_branch synonym) + case 🔴 | đúng status từng dòng |
| T-03 | Round-trip: SpecDoc → C7 → C8 → SpecDoc' — deep-equal (bỏ revision/updatedAt) | trên 3 fixtures |
| T-04 | C9 TS vs Python byte-equal; qa_validator PASS 0 CRITICAL | fixtures: `_proto_flat` tái tạo bằng SpecDoc + 1 flow enum-branch + 1 flow subflow |
| T-05 | V1: mỗi rule ≥1 case dương + 1 case âm (12 rule) | ✅ |
| T-06 | C4 thao tác: insert giữa nhánh override không phá override; delete có tham chiếu bắt re-target | ✅ |
| T-07 | Excel mở bằng Excel/LibreOffice thật: dropdown hoạt động, ô khoá không sửa được | check tay 1 lần/release |
| T-08 | C8 file bị sửa label sai vocabulary → IMP-02 đúng địa chỉ ô | ✅ |

Fixtures đặt tại `webapp/fixtures/spec/` (SpecDoc JSON + xlsx sinh sẵn + YAML kỳ vọng).

## §7. THỨ TỰ IMPLEMENT cho Claude Code（mỗi task tự nghiệm thu được）

1. **P1** C1 spec_schema_gen (+T-01) → 2. **P2** types.ts + defaults.ts + validateTier1 (+T-05) → 3. **P3** normalize.ts (+T-02) → 4. **P4** compileYaml.ts + excel_to_yaml.py (+T-04, chưa cần UI — CLI nhận SpecDoc JSON) → 5. **P5** excelExport/Import (+T-03, T-08) → 6. **P6** specStore + SheetEditor UI (+T-06) → 7. **P7** canvas preview + validation panel → 8. **P8** save/commit C11 + escalation C12 → 9. **P9** excel_review_gen (+T-07, smoke E2E §5.1).

Mỗi bước: code + test + chạy test PASS rồi mới sang bước sau. Không gộp nhiều bước 1 commit.

## §8. Điểm đã chốt sẵn để khỏi hỏi lại (design decisions log)

- Excel = SSoT con người; `_model` JSON nhúng trong xlsx = SSoT máy; YAML = derived, luôn commit kèm.
- Tham chiếu nội bộ bằng StepID; ra 設計書 YAML bằng label (khớp qa_validator F-2).
- Auto không bao giờ bị "nướng" thành giá trị trong `_model`; chỉ materialize lúc compile theo C3.
- Không LLM, không fuzzy match trong normalize; fail-closed mọi trường hợp mơ hồ.
- Canvas phase này read-only. Kéo-thả sửa cấu trúc = ngoài phạm vi.
- Chưa làm: Pyodide (spike riêng sau P9), AI pre-fill, import 設計書 YAML cũ → SpecDoc (v2).
