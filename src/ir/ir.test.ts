import { describe, it, expect } from 'vitest';
import { fromYaml } from './fromYaml';
import { toYaml } from './toYaml';
import { layout } from './layout';
import { parse } from 'yaml';
import { SYNTHETIC_START_ID } from './types';
import {
  defaultDataFor,
  sourceHandlesFor,
  readBranches,
  catchAllDisplay,
  catchAllEditable,
  effectiveBranches,
  optionsForSource,
  BRANCH_SCHEMA,
  SAVE_MODULE_FLAG,
  MODULE_FIXED_BRANCHES,
  LOGIC_MODULE_IC,
  LOGIC_MODULE_DOCC,
  LOGIC_MODULE_CDEPT,
  LOGIC_MODULE_NULLCHECK,
  NULL_CHECK_FIXED_BRANCHES,
  clinicalDepartmentBranches,
  readClinicalDepartments,
  CATCH_ALL_ID,
  formatTimeInput,
} from '../ui/nodeSchema';
import { parseFlowMeta, updateFlowMeta } from './flowMeta';

const SAMPLE = `
flow:
  name: "予約確認フロー"
  start: greet
  nodes:
    - id: greet
      type: announce
      text: "ようこそ"
      next: main_menu
    - id: main_menu
      type: input
      mode: dtmf
      prompt: "1か2を"
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
      text: "予約"
      next: end
    - id: change
      type: announce
      text: "変更"
      next: end
    - id: fallback
      type: announce
      text: "再度"
      next: main_menu
    - id: end
      type: hangup
`;

describe('fromYaml', () => {
  const ir = fromYaml(SAMPLE);

  it('tạo node start tổng hợp + node thật', () => {
    // 7 node YAML + 1 node start tổng hợp
    expect(ir.nodes).toHaveLength(8);
    expect(ir.nodes.find((n) => n.id === SYNTHETIC_START_ID)?.type).toBe('start');
  });

  it('alias tên type cũ: input->interaction, condition->nexus', () => {
    expect(ir.nodes.find((n) => n.id === 'main_menu')?.type).toBe('interaction');
    expect(ir.nodes.find((n) => n.id === 'classify')?.type).toBe('nexus');
  });

  it('map next thành edge default', () => {
    const e = ir.edges.find((x) => x.source === 'greet' && x.target === 'main_menu');
    expect(e?.sourceHandle).toBe('default');
  });

  it('map branches: when->to giữ condition, default là edge default', () => {
    const branchEdges = ir.edges.filter((x) => x.source === 'classify');
    expect(branchEdges).toHaveLength(3);
    expect(branchEdges.filter((x) => x.condition).length).toBe(2);
    expect(branchEdges.find((x) => x.target === 'fallback')?.condition).toBeUndefined();
  });

  it('start trỏ tới node đầu', () => {
    const startEdge = ir.edges.find((x) => x.source === SYNTHETIC_START_ID);
    expect(startEdge?.target).toBe('greet');
  });

  it('gom field lạ vào data', () => {
    const greet = ir.nodes.find((n) => n.id === 'greet');
    expect(greet?.data.text).toBe('ようこそ');
  });
});

describe('toYaml round-trip', () => {
  it('giữ TOẠ ĐỘ node (position) qua save/reopen — không auto-layout lại', () => {
    const withPos = `
flow:
  name: "f"
  start: a
  startPosition: { x: 96, y: 40 }
  nodes:
    - id: a
      type: announce
      text: "hi"
      position: { x: 96, y: 200 }
      next: b
    - id: b
      type: hangup
      position: { x: 96, y: 360 }
`;
    const ir = fromYaml(withPos);
    // Toạ độ đọc đúng: node thật + node Start tổng hợp.
    expect(ir.nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 96, y: 200 });
    expect(ir.nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 96, y: 360 });
    expect(ir.nodes.find((n) => n.id === SYNTHETIC_START_ID)?.position).toEqual({ x: 96, y: 40 });
    // Toạ độ không phải toàn (0,0) -> loadYaml sẽ GIỮ NGUYÊN (không auto-layout lại).
    expect(ir.nodes.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(false);
    // Round-trip: toYaml ghi lại position từng node + flow.startPosition.
    const parsed = parse(toYaml(ir)) as {
      flow: { startPosition?: { x: number; y: number }; nodes: Array<{ id: string; position?: { x: number; y: number } }> };
    };
    expect(parsed.flow.startPosition).toEqual({ x: 96, y: 40 });
    expect(parsed.flow.nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 96, y: 200 });
  });

  it('file cũ KHÔNG có position -> mọi node (0,0) (loadYaml sẽ auto-layout)', () => {
    const ir = fromYaml(SAMPLE);
    expect(ir.nodes.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(true);
  });

  it('giữ TÊN node (label) qua save/reopen: field `name`', () => {
    const ir = fromYaml(SAMPLE);
    // Người dùng đổi tên node 'greet' -> label mới.
    const renamed = {
      ...ir,
      nodes: ir.nodes.map((n) => (n.id === 'greet' ? { ...n, label: '冒頭アナウンス' } : n)),
    };
    const yaml = toYaml(renamed);
    // YAML ghi field `name` cho node đã đổi tên (khác id), không ghi cho node chưa đổi.
    const parsed = parse(yaml) as {
      flow: { nodes: Array<{ id: string; name?: string }> };
    };
    const greet = parsed.flow.nodes.find((n) => n.id === 'greet')!;
    expect(greet.name).toBe('冒頭アナウンス');
    const classify = parsed.flow.nodes.find((n) => n.id === 'classify')!;
    expect(classify.name).toBeUndefined(); // chưa đổi tên -> label === id -> không ghi
    // Mở lại: label được khôi phục từ `name` (không rớt về id).
    const reopened = fromYaml(yaml);
    expect(reopened.nodes.find((n) => n.id === 'greet')?.label).toBe('冒頭アナウンス');
    expect(reopened.nodes.find((n) => n.id === 'classify')?.label).toBe('classify');
  });

  it('IR -> YAML tái tạo cấu trúc flow', () => {
    const ir = fromYaml(SAMPLE);
    const yaml = toYaml(ir);
    const parsed = parse(yaml) as {
      flow: {
        name: string;
        start: string;
        nodes: Array<Record<string, unknown> & { id: string; type: string }>;
      };
    };

    expect(parsed.flow.name).toBe('予約確認フロー');
    expect(parsed.flow.start).toBe('greet');
    // start tổng hợp không xuất hiện như node YAML
    expect(parsed.flow.nodes).toHaveLength(7);

    const greet = parsed.flow.nodes.find((n) => n.id === 'greet');
    expect(greet?.type).toBe('announce');
    expect(greet?.text).toBe('ようこそ');
    expect(greet?.next).toBe('main_menu');

    const classify = parsed.flow.nodes.find((n) => n.id === 'classify') as unknown as {
      branches: Array<{ when?: string; to?: string; default?: string }>;
    };
    expect(classify.branches).toHaveLength(3);
    expect(classify.branches[0]).toEqual({ when: "input == '1'", to: 'reserve' });
    expect(classify.branches[2]).toEqual({ default: 'fallback' });
  });
});

describe('nhánh (branch) model mới', () => {
  it('fromYaml dựng data.branches cho node condition (kèm nhánh default)', () => {
    const ir = fromYaml(SAMPLE);
    const classify = ir.nodes.find((n) => n.id === 'classify');
    const branches = readBranches(classify!.data);
    expect(branches).toEqual([
      { id: 'b0', value: "input == '1'" },
      { id: 'b1', value: "input == '2'" },
      { id: 'default', value: '' },
    ]);
  });

  it('sourceHandlesFor: condition theo data.branches, hangup không có, input FAILED+NEXT', () => {
    const ir = fromYaml(SAMPLE);
    const classify = ir.nodes.find((n) => n.id === 'classify')!;
    expect(sourceHandlesFor(classify).map((h) => h.id)).toEqual(['b0', 'b1', 'default']);

    const end = ir.nodes.find((n) => n.id === 'end')!;
    expect(sourceHandlesFor(end)).toEqual([]);

    const input = ir.nodes.find((n) => n.id === 'main_menu')!;
    expect(sourceHandlesFor(input).map((h) => h.label)).toEqual(['失敗', '次へ']);
  });

  it('toYaml lấy điều kiện từ data.branches (round-trip qua sửa giá trị nhánh)', () => {
    const ir = fromYaml(SAMPLE);
    // Giả lập panel sửa giá trị nhánh b0 -> biểu thức khác.
    const classify = ir.nodes.find((n) => n.id === 'classify')!;
    classify.data.branches = [
      { id: 'b0', value: "input == '9'" },
      { id: 'b1', value: "input == '2'" },
      { id: 'default', value: '' },
    ];
    const parsed = parse(toYaml(ir)) as {
      flow: { nodes: Array<{ id: string; branches?: Array<{ when?: string; default?: string }> }> };
    };
    const out = parsed.flow.nodes.find((n) => n.id === 'classify')!;
    expect(out.branches![0]).toEqual({ when: "input == '9'", to: 'reserve' });
    expect(out.branches![2]).toEqual({ default: 'fallback' });
  });

  it('label nhánh round-trip qua YAML (đọc label + xuất lại label)', () => {
    const withLabel = `
flow:
  name: "f"
  start: c
  nodes:
    - id: c
      type: condition
      branches:
        - when: "^はい$"
          to: a
          label: "はい"
        - default: b
    - id: a
      type: hangup
    - id: b
      type: hangup
`;
    const ir = fromYaml(withLabel);
    const c = ir.nodes.find((n) => n.id === 'c')!;
    // fromYaml lưu label vào data.branches.
    expect(readBranches(c.data)).toEqual([
      { id: 'b0', value: '^はい$', label: 'はい' },
      { id: 'default', value: '' },
    ]);
    // toYaml xuất lại label; nhánh không có label thì không kèm field label.
    const parsed = parse(toYaml(ir)) as {
      flow: { nodes: Array<{ id: string; branches?: Array<{ label?: string }> }> };
    };
    const out = parsed.flow.nodes.find((n) => n.id === 'c')!;
    expect(out.branches![0].label).toBe('はい');
    expect(out.branches![1].label).toBeUndefined();
  });

  it('catch-all có value (Module Result Binder) round-trip: default kèm when', () => {
    const withValue = `
flow:
  name: "f"
  start: l
  nodes:
    - id: l
      type: logic
      moduleType: Module Result Binder
      branches:
        - when: "OK"
          to: a
        - when: "^.*$"
          default: b
          label: "診療日"
    - id: a
      type: hangup
    - id: b
      type: hangup
`;
    const ir = fromYaml(withValue);
    const l = ir.nodes.find((n) => n.id === 'l')!;
    // Nhánh default kèm when -> vẫn là catch-all (handle 'default') nhưng GIỮ value.
    expect(readBranches(l.data)).toEqual([
      { id: 'b0', value: 'OK' },
      { id: 'default', value: '^.*$', label: '診療日' },
    ]);
    // toYaml xuất lại default + when (không biến thành nhánh when/to thường).
    const parsed = parse(toYaml(ir)) as {
      flow: { nodes: Array<{ id: string; branches?: Array<Record<string, string>> }> };
    };
    const out = parsed.flow.nodes.find((n) => n.id === 'l')!;
    expect(out.branches).toEqual([
      { when: 'OK', to: 'a' },
      { when: '^.*$', default: 'b', label: '診療日' },
    ]);
  });

  it('nhánh FAILED (interaction/openai/faq/transfer) round-trip qua YAML', () => {
    const withFailed = `
flow:
  name: "f"
  start: ask
  nodes:
    - id: ask
      type: input
      announce: "お名前を"
      next: ok
      failed: retry
    - id: ok
      type: hangup
    - id: retry
      type: hangup
`;
    const ir = fromYaml(withFailed);
    // fromYaml: field failed -> edge handle 'failed'.
    const failedEdge = ir.edges.find((e) => e.source === 'ask' && e.sourceHandle === 'failed');
    expect(failedEdge?.target).toBe('retry');
    const nextEdge = ir.edges.find((e) => e.source === 'ask' && (e.sourceHandle ?? 'default') === 'default');
    expect(nextEdge?.target).toBe('ok');

    // toYaml: giữ cả next lẫn failed (trước đây nhánh failed bị mất khi lưu).
    const parsed = parse(toYaml(ir)) as {
      flow: { nodes: Array<{ id: string; next?: string; failed?: string }> };
    };
    const out = parsed.flow.nodes.find((n) => n.id === 'ask')!;
    expect(out.next).toBe('ok');
    expect(out.failed).toBe('retry');
  });

  it('defaultDataFor: seed tham số mặc định + 1 nhánh cho node editable', () => {
    const interaction = defaultDataFor('interaction');
    expect(interaction.inputType).toBe('STT');
    expect(interaction.retryCount).toBe('2');
    expect(interaction.branches).toBeUndefined(); // interaction là fixed, không có nhánh tự do

    const logic = defaultDataFor('logic');
    expect(logic.moduleType).toBe('Script');
    // Chỉ seed tham số của module đang chọn — không rải tham số CDC/CMR/MRB.
    expect(logic.holidaySource).toBeUndefined();
    // Mặc định chỉ có nhánh catch-all (id 'default').
    expect(logic.branches).toEqual([{ id: 'default', value: '' }]);

    const start = defaultDataFor('start');
    expect(start.acceptanceTime).toBe('yes');
  });

  it('catchAllEditable: nexus sửa được catch-all; announce/interaction thì không', () => {
    // Nexus: người dùng có thể tự đặt điều kiện cho nhánh catch-all.
    expect(catchAllEditable('nexus', {})).toBe(true);
    // Logic Script (mặc định) không sửa catch-all; các node fixed cũng không.
    expect(catchAllEditable('logic', defaultDataFor('logic'))).toBe(false);
    expect(catchAllEditable('announce', {})).toBe(false);
    expect(catchAllEditable('interaction', {})).toBe(false);
  });

  it('nexus: catch-all có value round-trip qua when + default', () => {
    const withValue = `
flow:
  name: "f"
  start: g
  nodes:
    - id: g
      type: condition
      branches:
        - when: "OK"
          to: a
        - when: "その他"
          default: b
    - id: a
      type: hangup
    - id: b
      type: hangup
`;
    const ir = fromYaml(withValue);
    const g = ir.nodes.find((n) => n.id === 'g')!;
    // Nhánh default kèm when -> vẫn là catch-all (handle 'default') nhưng GIỮ value.
    expect(readBranches(g.data)).toEqual([
      { id: 'b0', value: 'OK' },
      { id: 'default', value: 'その他' },
    ]);
    const parsed = parse(toYaml(ir)) as {
      flow: { nodes: Array<{ id: string; branches?: Array<Record<string, string>> }> };
    };
    const out = parsed.flow.nodes.find((n) => n.id === 'g')!;
    expect(out.branches).toEqual([
      { when: 'OK', to: 'a' },
      { when: 'その他', default: 'b' },
    ]);
  });

  it('catchAllDisplay: ^.*$ khi 1 nhánh, phủ định khi có nhánh khác', () => {
    expect(catchAllDisplay([{ id: 'default', value: '' }])).toBe('^.*$');
    expect(
      catchAllDisplay([
        { id: 'default', value: '' },
        { id: 'b0', value: '1' },
        { id: 'b1', value: '2' },
      ]),
    ).toBe('^(?!(?:1|2)$).*$');
  });
});

describe('Context Match Router: nhánh sinh từ Pair (value 1..n, không catch-all)', () => {
  const CMR = `
flow:
  name: "f"
  start: r
  nodes:
    - id: r
      type: logic
      moduleType: Context Match Router
      pairs:
        - left: "a"
          right: "b"
        - left: "c"
          right: "d"
      branches:
        - when: "1"
          to: x
          label: "Khớp"
        - when: "Pair2"
          to: y
    - id: x
      type: hangup
    - id: y
      type: hangup
`;

  it('fromYaml: when "1" và "Pair2" (dạng cũ) đều map về handle pairN', () => {
    const ir = fromYaml(CMR);
    const edges = ir.edges.filter((e) => e.source === 'r');
    expect(edges.map((e) => e.sourceHandle).sort()).toEqual(['pair1', 'pair2']);
  });

  it('effectiveBranches: chỉ các nhánh pair, value 1..n, giữ label; không catch-all', () => {
    const ir = fromYaml(CMR);
    const r = ir.nodes.find((n) => n.id === 'r')!;
    expect(effectiveBranches(r.type, r.data)).toEqual([
      { id: 'pair1', value: '1', label: 'Khớp' },
      { id: 'pair2', value: '2' },
    ]);
    // Handle trên canvas cũng chỉ có 2 chấm pair (không có default).
    expect(sourceHandlesFor(r).map((h) => h.id)).toEqual(['pair1', 'pair2']);
  });
});

describe('sub flow trong cùng file YAML', () => {
  const WITH_SUB = `
flow:
  name: "main"
  start: a
  nodes:
    - id: a
      type: announce
      text: "hi"
      next: j
    - id: j
      type: jump
      subflow: "Đặt lịch"
  subflows:
    - name: "Đặt lịch"
      start: s1
      nodes:
        - id: s1
          type: interaction
          announce: "ngày?"
        - id: s2
          type: hangup
`;

  it('fromYaml đọc subflows (id slug + graph riêng, KHÔNG có node Start)', () => {
    const ir = fromYaml(WITH_SUB);
    expect(ir.subflows).toHaveLength(1);
    const sub = ir.subflows![0];
    expect(sub.name).toBe('Đặt lịch');
    // Chỉ 2 node YAML — sub flow không có node Start (kể cả file cũ còn field start).
    expect(sub.nodes).toHaveLength(2);
    expect(sub.nodes.some((n) => n.id === SYNTHETIC_START_ID)).toBe(false);
    // Node Jump ở main flow chọn được sub flow theo tên.
    expect(optionsForSource('subflows', ir)).toEqual(['Đặt lịch']);
  });

  it('toYaml ghi lại subflows (round-trip, không field start)', () => {
    const ir = fromYaml(WITH_SUB);
    const parsed = parse(toYaml(ir)) as {
      flow: {
        nodes: Array<{ id: string }>;
        subflows?: Array<{ name: string; start?: string; nodes: Array<{ id: string; type: string }> }>;
      };
    };
    expect(parsed.flow.nodes.map((n) => n.id)).toEqual(['a', 'j']);
    expect(parsed.flow.subflows).toHaveLength(1);
    expect(parsed.flow.subflows![0].name).toBe('Đặt lịch');
    expect(parsed.flow.subflows![0].start).toBeUndefined();
    expect(parsed.flow.subflows![0].nodes.map((n) => n.id)).toEqual(['s1', 's2']);
    expect(parsed.flow.subflows![0].nodes[0].type).toBe('interaction');
  });
});

describe('logic module mới: Incoming Classifier / Date Of Call Classifier', () => {
  it('bộ nhánh CỐ ĐỊNH của IC: catch-all(その他) + 非通知/海外/WebRTC/固定/携帯 (kèm label)', () => {
    expect(MODULE_FIXED_BRANCHES[LOGIC_MODULE_IC]).toEqual([
      { id: CATCH_ALL_ID, value: '', label: 'その他' },
      { id: 'b0', value: '非通知', label: '非通知' },
      { id: 'b1', value: '海外', label: '海外' },
      { id: 'b2', value: 'WebRTC', label: 'WebRTC' },
      { id: 'b3', value: '固定', label: '固定' },
      { id: 'b4', value: '携帯', label: '携帯' },
    ]);
  });

  it('bộ nhánh CỐ ĐỊNH của DOCC: ^ERROR$ (catch-all, giống FAILED) + 時間後/時間一致/時間前, label khoá', () => {
    expect(MODULE_FIXED_BRANCHES[LOGIC_MODULE_DOCC]).toEqual([
      { id: CATCH_ALL_ID, value: 'ERROR', label: 'エラー' },
      { id: 'b0', value: '時間後', label: '時間後' },
      { id: 'b1', value: '時間一致', label: '時間一致' },
      { id: 'b2', value: '時間前', label: '時間前' },
    ]);
  });

  it('catchAllEditable: IC/DOCC đều KHÔNG sửa được catch-all (chỉ nexus/MRB)', () => {
    expect(catchAllEditable('logic', { moduleType: LOGIC_MODULE_DOCC })).toBe(false);
    expect(catchAllEditable('logic', { moduleType: LOGIC_MODULE_IC })).toBe(false);
  });

  it('effectiveBranches: DOCC dính nhánh của IC (data sai) vẫn trả về đúng bộ DOCC', () => {
    // Bug cũ: chọn IC trước rồi đổi sang DOCC -> data.branches còn nguyên bộ của IC.
    const staleData = {
      moduleType: LOGIC_MODULE_DOCC,
      branches: [
        { id: CATCH_ALL_ID, value: '' },
        { id: 'b0', value: '非通知' },
        { id: 'b1', value: '海外' },
        { id: 'b2', value: 'WebRTC' },
        { id: 'b3', value: '固定' },
        { id: 'b4', value: '携帯' },
      ],
    };
    expect(effectiveBranches('logic', staleData)).toEqual([
      { id: CATCH_ALL_ID, value: 'ERROR', label: 'エラー' },
      { id: 'b0', value: '時間後', label: '時間後' },
      { id: 'b1', value: '時間一致', label: '時間一致' },
      { id: 'b2', value: '時間前', label: '時間前' },
    ]);
  });

  it('effectiveBranches: IC/DOCC khoá cứng cả value lẫn label (label trong data bị bỏ qua)', () => {
    const icData = {
      moduleType: LOGIC_MODULE_IC,
      branches: [{ id: 'b0', value: 'gì đó', label: 'label tự đặt' }],
    };
    const ic = effectiveBranches('logic', icData);
    expect(ic.find((b) => b.id === 'b0')).toEqual({ id: 'b0', value: '非通知', label: '非通知' });
    const doccData = {
      moduleType: LOGIC_MODULE_DOCC,
      branches: [
        { id: CATCH_ALL_ID, value: 'ERROR', label: '失敗' },
        { id: 'b0', value: '時間後', label: 'Sau giờ hẹn' },
      ],
    };
    const docc = effectiveBranches('logic', doccData);
    // Value khớp -> giữ id trong data, nhưng label bị đè về bộ chuẩn.
    expect(docc.find((b) => b.id === 'b0')).toEqual({ id: 'b0', value: '時間後', label: '時間後' });
    expect(docc.find((b) => b.id === CATCH_ALL_ID)).toEqual({ id: CATCH_ALL_ID, value: 'ERROR', label: 'エラー' });
  });

  it('formatTimeInput: chỉ giữ chữ số, tự chèn ":" theo HH:mm:ss', () => {
    expect(formatTimeInput('123456')).toBe('12:34:56');
    expect(formatTimeInput('12:34:56')).toBe('12:34:56');
    expect(formatTimeInput('1234')).toBe('12:34');
    expect(formatTimeInput('1')).toBe('1');
    expect(formatTimeInput('')).toBe('');
    expect(formatTimeInput('ab!12x34時56')).toBe('12:34:56'); // ký tự lạ bị loại
    expect(formatTimeInput('1234567890')).toBe('12:34:56'); // cắt còn 6 chữ số
  });

  it('DOCC round-trip YAML: catch-all ERROR (when + default) + compareTime', () => {
    const DOCC = `
flow:
  name: "f"
  start: d
  nodes:
    - id: d
      type: logic
      moduleType: Date Of Call Classifier
      compareTime: "12:30:00"
      branches:
        - when: "ERROR"
          default: e
          label: "エラー"
        - when: "時間後"
          to: a
        - when: "時間一致"
          to: b
        - when: "時間前"
          to: c
    - id: a
      type: hangup
    - id: b
      type: hangup
    - id: c
      type: hangup
    - id: e
      type: hangup
`;
    const ir = fromYaml(DOCC);
    const d = ir.nodes.find((n) => n.id === 'd')!;
    expect(d.data.compareTime).toBe('12:30:00');
    expect(readBranches(d.data)).toEqual([
      { id: 'default', value: 'ERROR', label: 'エラー' },
      { id: 'b1', value: '時間後' },
      { id: 'b2', value: '時間一致' },
      { id: 'b3', value: '時間前' },
    ]);
    // Nhánh hiệu lực GIỮ id trong data (b1, b2, b3 theo thứ tự YAML) — dây nối từ các
    // handle này không bị lệch khi áp bộ nhánh cố định của DOCC; label theo bộ chuẩn.
    expect(effectiveBranches(d.type, d.data)).toEqual([
      { id: 'default', value: 'ERROR', label: 'エラー' },
      { id: 'b1', value: '時間後', label: '時間後' },
      { id: 'b2', value: '時間一致', label: '時間一致' },
      { id: 'b3', value: '時間前', label: '時間前' },
    ]);
    const parsed = parse(toYaml(ir)) as {
      flow: { nodes: Array<{ id: string; compareTime?: string; branches?: Array<Record<string, string>> }> };
    };
    const out = parsed.flow.nodes.find((n) => n.id === 'd')!;
    expect(out.compareTime).toBe('12:30:00');
    expect(out.branches).toEqual([
      { when: 'ERROR', default: 'e', label: 'エラー' },
      { when: '時間後', to: 'a' },
      { when: '時間一致', to: 'b' },
      { when: '時間前', to: 'c' },
    ]);
  });
});

describe('logic module mới: Clinical Department Classifier', () => {
  it('readClinicalDepartments: đọc các set từ key phẳng clinical_department_n / result_name_n', () => {
    const data = {
      clinical_department_1: '内科;外科',
      result_name_1: 'GENERAL',
      clinical_department_2: '小児科',
      result_name_2: 'PED',
    };
    expect(readClinicalDepartments(data)).toEqual([
      { list: '内科;外科', output: 'GENERAL' },
      { list: '小児科', output: 'PED' },
    ]);
    // Chưa có set nào -> vẫn trả 1 set trống để panel hiển thị ô nhập.
    expect(readClinicalDepartments({})).toEqual([{ list: '', output: '' }]);
  });

  it('clinicalDepartmentBranches: FAILED (default) + NOT_COVERED + mỗi output 1 nhánh', () => {
    const data = {
      moduleType: LOGIC_MODULE_CDEPT,
      clinical_department_1: '内科;外科',
      result_name_1: 'GENERAL',
      clinical_department_2: '小児科',
      result_name_2: 'PED',
    };
    expect(clinicalDepartmentBranches(data)).toEqual([
      { id: CATCH_ALL_ID, value: 'FAILED', label: '失敗' },
      { id: 'b0', value: 'NOT_COVERED', label: '対象外' },
      { id: 'out0', value: 'GENERAL', label: 'GENERAL' },
      { id: 'out1', value: 'PED', label: 'PED' },
    ]);
  });

  it('effectiveBranches: value = label = output, không cho custom (bộ cố định động)', () => {
    const data = {
      moduleType: LOGIC_MODULE_CDEPT,
      result_name_1: 'GENERAL',
      result_name_2: 'PED',
    };
    expect(effectiveBranches('logic', data)).toEqual([
      { id: CATCH_ALL_ID, value: 'FAILED', label: '失敗' },
      { id: 'b0', value: 'NOT_COVERED', label: '対象外' },
      { id: 'b1', value: 'GENERAL', label: 'GENERAL' },
      { id: 'b2', value: 'PED', label: 'PED' },
    ]);
  });

  it('CDEPT round-trip YAML: FAILED (default) + NOT_COVERED + output, giữ key phẳng', () => {
    const CDEPT = `
flow:
  name: "f"
  start: c
  nodes:
    - id: c
      type: logic
      moduleType: Clinical Department Classifier
      module: menu
      saveDepartment2DB: "no"
      clinical_department_1: "内科;外科"
      result_name_1: "GENERAL"
      branches:
        - when: "FAILED"
          default: f
          label: "失敗"
        - when: "NOT_COVERED"
          to: n
          label: "対象外"
        - when: "GENERAL"
          to: g
          label: "GENERAL"
    - id: f
      type: hangup
    - id: n
      type: hangup
    - id: g
      type: hangup
`;
    const ir = fromYaml(CDEPT);
    const c = ir.nodes.find((n) => n.id === 'c')!;
    expect(c.data.module).toBe('menu');
    expect(c.data.clinical_department_1).toBe('内科;外科');
    expect(c.data.result_name_1).toBe('GENERAL');
    expect(effectiveBranches(c.type, c.data)).toEqual([
      { id: 'default', value: 'FAILED', label: '失敗' },
      { id: 'b1', value: 'NOT_COVERED', label: '対象外' },
      { id: 'b2', value: 'GENERAL', label: 'GENERAL' },
    ]);
    const parsed = parse(toYaml(ir)) as {
      flow: { nodes: Array<{ id: string; clinical_department_1?: string; result_name_1?: string; branches?: Array<Record<string, string>> }> };
    };
    const out = parsed.flow.nodes.find((n) => n.id === 'c')!;
    expect(out.clinical_department_1).toBe('内科;外科');
    expect(out.result_name_1).toBe('GENERAL');
    expect(out.branches).toEqual([
      { when: 'FAILED', default: 'f', label: '失敗' },
      { when: 'NOT_COVERED', to: 'n', label: '対象外' },
      { when: 'GENERAL', to: 'g', label: 'GENERAL' },
    ]);
  });
});

describe('logic module mới: Null Check', () => {
  it('bộ nhánh CỐ ĐỊNH: true(Null, catch-all trên cùng) + false(Not Null)', () => {
    expect(NULL_CHECK_FIXED_BRANCHES).toEqual([
      { id: CATCH_ALL_ID, value: 'true', label: 'Null' },
      { id: 'b0', value: 'false', label: 'Not Null' },
    ]);
    expect(MODULE_FIXED_BRANCHES[LOGIC_MODULE_NULLCHECK]).toBe(NULL_CHECK_FIXED_BRANCHES);
  });

  it('effectiveBranches: khoá cứng value/label kể cả khi data còn sót nhánh module khác', () => {
    const staleData = {
      moduleType: LOGIC_MODULE_NULLCHECK,
      branches: [
        { id: CATCH_ALL_ID, value: '' },
        { id: 'b0', value: '非通知', label: 'label tự đặt' },
      ],
    };
    expect(effectiveBranches('logic', staleData)).toEqual([
      { id: CATCH_ALL_ID, value: 'true', label: 'Null' },
      { id: 'b0', value: 'false', label: 'Not Null' },
    ]);
  });

  it('Null Check round-trip YAML: true (default) + false', () => {
    const NC = `
flow:
  name: "f"
  start: c
  nodes:
    - id: c
      type: logic
      moduleType: Null Check
      key: patient_name
      branches:
        - when: "true"
          default: y
          label: "Null"
        - when: "false"
          to: n
          label: "Not Null"
    - id: y
      type: hangup
    - id: n
      type: hangup
`;
    const ir = fromYaml(NC);
    const c = ir.nodes.find((n) => n.id === 'c')!;
    expect(c.data.key).toBe('patient_name');
    expect(effectiveBranches(c.type, c.data)).toEqual([
      { id: 'default', value: 'true', label: 'Null' },
      { id: 'b1', value: 'false', label: 'Not Null' },
    ]);
    const parsed = parse(toYaml(ir)) as {
      flow: { nodes: Array<{ id: string; key?: string; branches?: Array<Record<string, string>> }> };
    };
    const out = parsed.flow.nodes.find((n) => n.id === 'c')!;
    expect(out.key).toBe('patient_name');
    expect(out.branches).toEqual([
      { when: 'true', default: 'y', label: 'Null' },
      { when: 'false', to: 'n', label: 'Not Null' },
    ]);
  });
});

describe('node Save (thay node Flag cũ)', () => {
  it('file cũ type flag -> node save, giữ nguyên Status/SMS Flag; toYaml ghi type save', () => {
    const LEGACY = `
flow:
  name: "f"
  start: fl
  nodes:
    - id: fl
      type: flag
      statusFlag: "3"
      smsFlag: "1"
      next: bye
    - id: bye
      type: hangup
`;
    const ir = fromYaml(LEGACY);
    const fl = ir.nodes.find((n) => n.id === 'fl')!;
    expect(fl.type).toBe('save');
    expect(fl.data.statusFlag).toBe('3');
    expect(fl.data.smsFlag).toBe('1');
    // Chưa có moduleType -> panel hiểu là module Flag (mặc định), không cần migrate data.
    expect(fl.data.moduleType).toBeUndefined();
    const parsed = parse(toYaml(ir)) as { flow: { nodes: Array<{ id: string; type: string }> } };
    expect(parsed.flow.nodes.find((n) => n.id === 'fl')?.type).toBe('save');
  });

  it('defaultDataFor(save): seed module mặc định Flag, nhánh cố định NEXT', () => {
    const data = defaultDataFor('save');
    expect(data.moduleType).toBe(SAVE_MODULE_FLAG);
    expect(data.branches).toBeUndefined(); // nhánh cố định, không có nhánh tự do
    expect(BRANCH_SCHEMA.save.mode).toBe('fixed');
  });

  it('nhánh cố định NEXT hiển thị VALUE ^.*$ (FAILED giữ ^FAILED$)', () => {
    // name là phần giữa ^…$ ở cột VALUE của Branch Settings.
    expect(BRANCH_SCHEMA.announce.fixed![0]).toMatchObject({ id: 'default', name: '.*' });
    expect(BRANCH_SCHEMA.save.fixed![0]).toMatchObject({ id: 'default', name: '.*' });
    expect(BRANCH_SCHEMA.interaction.fixed).toEqual([
      expect.objectContaining({ id: 'failed', name: 'FAILED' }),
      expect.objectContaining({ id: 'default', name: '.*' }),
    ]);
    expect(BRANCH_SCHEMA.start.fixed![0].name).toBe('.*');
  });
});

describe('auto-layout (quy tắc bố cục chuẩn)', () => {
  // Cấu trúc mô phỏng flow 診療 thật: mạch chính dọc + chuỗi failed + nexus 4 nhánh
  // + vòng lặp retry (logic quay lại interaction).
  const FLOW = `
flow:
  name: "診療"
  start: welcome
  nodes:
    - id: welcome
      type: announce
      text: "hi"
      next: ask
    - id: ask
      type: interaction
      announce: "用件?"
      next: classify
      failed: sorry
    - id: sorry
      type: announce
      text: "sorry"
      next: flag_ng
    - id: flag_ng
      type: flag
      next: bye_ng
    - id: bye_ng
      type: hangup
    - id: classify
      type: logic
      branches:
        - default: ask
          label: retry
        - when: "OK"
          to: route
          label: success
    - id: route
      type: nexus
      branches:
        - default: jump_1
        - when: "変更"
          to: jump_2
        - when: "キャンセル"
          to: jump_3
        - when: "その他"
          to: jump_4
    - id: jump_1
      type: jump
    - id: jump_2
      type: jump
    - id: jump_3
      type: jump
    - id: jump_4
      type: jump
`;

  const centerX = (ir: Awaited<ReturnType<typeof layout>>, id: string) =>
    ir.nodes.find((n) => n.id === id)!.position.x + 122; // NODE_WIDTH / 2
  const posY = (ir: Awaited<ReturnType<typeof layout>>, id: string) =>
    ir.nodes.find((n) => n.id === id)!.position.y;

  it('mạch chính đi thẳng đứng, khoảng cách tầng LUÔN bằng nhau', async () => {
    const ir = await layout(fromYaml(FLOW));
    const chain = [SYNTHETIC_START_ID, 'welcome', 'ask', 'classify', 'route'];
    // Cùng 1 đường dọc (tâm x bằng nhau).
    const xs = chain.map((id) => centerX(ir, id));
    expect(new Set(xs).size).toBe(1);
    // Bước y giữa các tầng liên tiếp bằng nhau tuyệt đối.
    const ys = chain.map((id) => posY(ir, id));
    const steps = ys.slice(1).map((y, i) => y - ys[i]);
    expect(new Set(steps).size).toBe(1);
    expect(steps[0]).toBeGreaterThan(0);
  });

  it('chuỗi failed nằm NGANG cùng hàng với node nguồn, lấn dần sang trái', async () => {
    const ir = await layout(fromYaml(FLOW));
    const rowY = posY(ir, 'ask');
    for (const id of ['sorry', 'flag_ng', 'bye_ng']) expect(posY(ir, id)).toBe(rowY);
    // Thứ tự trái dần: ask > sorry > flag_ng > bye_ng, bước ngang đều nhau.
    const xs = ['ask', 'sorry', 'flag_ng', 'bye_ng'].map((id) => centerX(ir, id));
    const steps = xs.slice(1).map((x, i) => xs[i] - x);
    expect(steps.every((s) => s > 0)).toBe(true);
    expect(new Set(steps).size).toBe(1);
  });

  it('nhánh nexus dàn hàng dưới, cách đều & đối xứng quanh tâm node cha', async () => {
    const ir = await layout(fromYaml(FLOW));
    const jumps = ['jump_1', 'jump_2', 'jump_3', 'jump_4'];
    // Cùng 1 hàng, ngay dưới nexus.
    const ys = new Set(jumps.map((id) => posY(ir, id)));
    expect(ys.size).toBe(1);
    expect([...ys][0]).toBeGreaterThan(posY(ir, 'route'));
    // Cách đều nhau với khoảng cách lớn (mép–mép >= 320) và giữ thứ tự nhánh.
    const xs = jumps.map((id) => centerX(ir, id));
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(new Set(steps).size).toBe(1);
    expect(steps[0]).toBeGreaterThanOrEqual(244 + 320);
    // Cụm nhánh đối xứng qua tâm node cha.
    expect((xs[0] + xs[3]) / 2).toBe(centerX(ir, 'route'));
  });

  it('node không chồng chéo nhau (bounding box rời nhau)', async () => {
    const ir = await layout(fromYaml(FLOW));
    for (let i = 0; i < ir.nodes.length; i++) {
      for (let j = i + 1; j < ir.nodes.length; j++) {
        const a = ir.nodes[i].position;
        const b = ir.nodes[j].position;
        const overlap = Math.abs(a.x - b.x) < 244 && Math.abs(a.y - b.y) < 80;
        expect(overlap, `${ir.nodes[i].id} đè lên ${ir.nodes[j].id}`).toBe(false);
      }
    }
  });

  it('cụm node rời nhau (không dây nối) xếp cạnh nhau, không đè lên nhau', async () => {
    const TWO = `
flow:
  name: "f"
  start: a
  nodes:
    - id: a
      type: announce
      text: "hi"
    - id: b
      type: announce
      text: "đảo rời"
`;
    const ir = await layout(fromYaml(TWO));
    const a = ir.nodes.find((n) => n.id === 'a')!.position;
    const b = ir.nodes.find((n) => n.id === 'b')!.position;
    expect(Math.abs(a.x - b.x) >= 244 || Math.abs(a.y - b.y) >= 80).toBe(true);
  });
});

describe('metadata flow (施設名/シナリオ名/作成者/日時)', () => {
  const WITH_META = `
flow:
  name: "予約フロー"
  facility: "テスト病院"
  author: "Tuan"
  createdAt: "2026-07-01 09:30"
  updatedAt: "2026-07-02 14:00"
  start: greet
  nodes:
    - id: greet
      type: announce
      text: "hi"
`;

  it('fromYaml đọc facility/author/createdAt/updatedAt vào meta', () => {
    const ir = fromYaml(WITH_META);
    expect(ir.meta.facility).toBe('テスト病院');
    expect(ir.meta.author).toBe('Tuan');
    expect(ir.meta.createdAt).toBe('2026-07-01 09:30');
    expect(ir.meta.updatedAt).toBe('2026-07-02 14:00');
  });

  it('toYaml ghi lại metadata (round-trip)', () => {
    const parsed = parse(toYaml(fromYaml(WITH_META))) as {
      flow: { facility?: string; author?: string; createdAt?: string; updatedAt?: string };
    };
    expect(parsed.flow.facility).toBe('テスト病院');
    expect(parsed.flow.author).toBe('Tuan');
    expect(parsed.flow.createdAt).toBe('2026-07-01 09:30');
    expect(parsed.flow.updatedAt).toBe('2026-07-02 14:00');
  });

  it('updateFlowMeta: vá metadata, giữ nguyên nodes/subflows', () => {
    const src = `flow:
  name: "cũ"
  facility: "viện cũ"
  start: greet
  nodes:
    - id: greet
      type: announce
      text: "hi"
  subflows:
    - name: "sub"
      start: s1
      nodes:
        - id: s1
          type: hangup
`;
    const out = updateFlowMeta(src, { name: 'mới', facility: 'viện mới', updatedAt: '2026-07-08 10:00' });
    const meta = parseFlowMeta(out);
    expect(meta.name).toBe('mới');
    expect(meta.facility).toBe('viện mới');
    expect(meta.updatedAt).toBe('2026-07-08 10:00');
    // Graph không suy suyển: node + subflow còn nguyên.
    const ir = fromYaml(out);
    expect(ir.nodes.find((n) => n.id === 'greet')?.data.text).toBe('hi');
    expect(ir.subflows?.[0].name).toBe('sub');
    // Field không có trong patch giữ nguyên (author không bị xoá/đổi).
    const out2 = updateFlowMeta(out, { name: 'mới 2' });
    expect(parseFlowMeta(out2).facility).toBe('viện mới');
  });

  it('parseFlowMeta trả metadata; field vắng -> undefined', () => {
    const meta = parseFlowMeta(WITH_META);
    expect(meta).toEqual({
      facility: 'テスト病院',
      name: '予約フロー',
      author: 'Tuan',
      createdAt: '2026-07-01 09:30',
      updatedAt: '2026-07-02 14:00',
      subflowCount: 0,
    });
    const bare = parseFlowMeta('flow:\n  name: "x"\n  nodes: []\n');
    expect(bare.createdAt).toBeUndefined();
    expect(bare.author).toBeUndefined();
    expect(bare.name).toBe('x');
    // Đếm số Sub Flow từ header (dùng cho badge cạnh tên kịch bản).
    const withSubs = parseFlowMeta(
      'flow:\n  name: "y"\n  nodes: []\n  subflows:\n    - name: a\n      nodes: []\n    - name: b\n      nodes: []\n',
    );
    expect(withSubs.subflowCount).toBe(2);
  });
});
