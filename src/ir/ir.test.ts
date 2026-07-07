import { describe, it, expect } from 'vitest';
import { fromYaml } from './fromYaml';
import { toYaml } from './toYaml';
import { parse } from 'yaml';
import { SYNTHETIC_START_ID } from './types';
import { defaultDataFor, sourceHandlesFor, readBranches, catchAllDisplay } from '../ui/nodeSchema';
import { parseFlowMeta } from './flowMeta';

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

  it('defaultDataFor: seed tham số mặc định + 1 nhánh cho node editable', () => {
    const input = defaultDataFor('input');
    expect(input.inputType).toBe('STT');
    expect(input.retryCount).toBe('2');
    expect(input.branches).toBeUndefined(); // input là fixed, không có nhánh tự do

    const script = defaultDataFor('script');
    // Mặc định chỉ có nhánh catch-all (id 'default').
    expect(script.branches).toEqual([{ id: 'default', value: '' }]);

    const start = defaultDataFor('start');
    expect(start.acceptanceTime).toBe('yes');
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
