import { describe, it, expect } from 'vitest';
import { fromYaml } from './fromYaml';
import { toYaml } from './toYaml';
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
    // Toạ độ không phải toàn (0,0) -> loadYaml sẽ GIỮ NGUYÊN (không ELK layout lại).
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
    });
    const bare = parseFlowMeta('flow:\n  name: "x"\n  nodes: []\n');
    expect(bare.createdAt).toBeUndefined();
    expect(bare.author).toBeUndefined();
    expect(bare.name).toBe('x');
  });
});
