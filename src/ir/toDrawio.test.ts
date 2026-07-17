import { describe, expect, it } from 'vitest';
import { toDrawio } from './toDrawio';
import type { FlowIR } from './types';

// IR tối giản: 2 node + 1 dây có nhãn nhánh, kèm ký tự cần escape trong tên.
function sampleIr(): FlowIR {
  return {
    version: '1.0',
    meta: { id: 'demo', name: 'Demo <flow> & "test"', createdAt: '', updatedAt: '' },
    nodes: [
      {
        id: 'hearing_1',
        type: 'interaction',
        label: '受診歴 <確認>',
        position: { x: 10.4, y: 20.6 },
        data: {},
      },
      {
        id: 'hangup_1',
        type: 'hangup',
        label: '終話',
        position: { x: 10, y: 300 },
        data: {},
      },
    ],
    edges: [
      {
        id: 'hearing_1->hangup_1#failed',
        source: 'hearing_1',
        target: 'hangup_1',
        sourceHandle: 'failed',
      },
    ],
  };
}

describe('toDrawio', () => {
  it('sinh mxfile hợp lệ: node vertex + edge kèm nhãn nhánh', () => {
    const xml = toDrawio(sampleIr());
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('<diagram');
    // Node: id giữ nguyên, label được escape, toạ độ làm tròn.
    expect(xml).toContain('id="hearing_1"');
    expect(xml).toContain('value="受診歴 &lt;確認&gt;"');
    expect(xml).toContain('x="10" y="21"');
    // Edge: nối đúng source/target, nhánh failed có nhãn 失敗.
    expect(xml).toContain('source="hearing_1" target="hangup_1"');
    expect(xml).toContain('value="失敗"');
    // Tên diagram (tên flow) cũng được escape — không vỡ XML.
    expect(xml).toContain('name="Demo &lt;flow&gt; &amp; &quot;test&quot;"');
    expect(xml).not.toContain('<flow>');
  });

  it('nhãn nhánh tự do lấy từ node.data.branches (label -> value)', () => {
    const ir = sampleIr();
    ir.nodes[0] = {
      ...ir.nodes[0],
      id: 'logic_1',
      type: 'logic',
      data: { branches: [{ id: 'b0', value: 'はい', label: '' }] },
    };
    ir.edges = [{ id: 'e1', source: 'logic_1', target: 'hangup_1', sourceHandle: 'b0' }];
    const xml = toDrawio(ir);
    expect(xml).toContain('value="はい"');
  });

  it('mỗi sub flow thành 1 page diagram riêng; dây thiếu đầu nối bị bỏ qua', () => {
    const ir = sampleIr();
    ir.subflows = [
      {
        id: 'sub-1',
        name: '予約',
        nodes: [
          { id: 'a1', type: 'announce', label: 'A', position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [{ id: 'ghost', source: 'a1', target: 'missing' }],
      },
    ];
    const xml = toDrawio(ir);
    expect(xml).toContain('name="予約"');
    expect(xml).not.toContain('id="ghost"');
  });
});
