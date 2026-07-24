import { describe, expect, it } from 'vitest';
import { irToReactFlow, type RFEdgeData } from './irAdapter';
import type { FlowIR, FlowNode } from '../ir/types';

// Test hành vi nhãn điều kiện trên dây (màn CS):
//   - CHỈ node nguồn logic/transfer/hearing có stamp, LUÔN hiện (alwaysLabel).
//   - Node khác bỏ hẳn nhãn (hover chỉ còn nút xoá dây).
//   - Nhiều dây chập về 1 đích -> stagger so le để stamp không đè nhau.
//   - Offset người dùng kéo (node.data.labelOffsets) truyền xuống edge data.

function node(id: string, type: FlowNode['type'], data: Record<string, unknown> = {}): FlowNode {
  return { id, type, label: id, position: { x: 0, y: 0 }, data };
}

function ir(nodes: FlowNode[], edges: FlowIR['edges']): FlowIR {
  return {
    version: '1.0',
    meta: { id: 'test', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
  };
}

describe('irToReactFlow — stamp điều kiện màn CS', () => {
  it('logic/transfer/hearing: nhãn nhánh luôn hiện; announce: không nhãn', () => {
    const doc = ir(
      [
        node('hear', 'interaction'),
        node('move', 'transfer'),
        node('talk', 'announce'),
        node('end', 'hangup'),
      ],
      [
        { id: 'e1', source: 'hear', target: 'end', sourceHandle: 'failed' },
        { id: 'e2', source: 'move', target: 'end', sourceHandle: 'default' },
        { id: 'e3', source: 'talk', target: 'move', sourceHandle: 'default' },
      ],
    );
    const { edges } = irToReactFlow(doc, { cs: true });
    const byId = new Map(edges.map((e) => [e.id, e]));

    // Hearing chỉ có 2 nhánh (failed + đi tiếp): nhánh failed vẫn hiện nhãn 失敗.
    expect(byId.get('e1')?.label).toBe('失敗');
    expect((byId.get('e1')?.data as RFEdgeData).alwaysLabel).toBe(true);
    // Transfer nhánh next: nhãn 次へ luôn hiện.
    expect(byId.get('e2')?.label).toBe('次へ');
    expect((byId.get('e2')?.data as RFEdgeData).alwaysLabel).toBe(true);
    // Announce: bỏ hẳn nhãn (kể cả hover).
    expect(byId.get('e3')?.label).toBeUndefined();
    expect((byId.get('e3')?.data as RFEdgeData).alwaysLabel).toBe(false);
  });

  it('hearing 2 nhánh (failed + 次へ): 次へ ẩn nhãn; failed vẫn hiện', () => {
    const doc = ir(
      [node('hear', 'interaction'), node('a', 'announce'), node('end', 'hangup')],
      [
        { id: 'nx', source: 'hear', target: 'a', sourceHandle: 'default' },
        { id: 'fl', source: 'hear', target: 'end', sourceHandle: 'failed' },
      ],
    );
    const { edges } = irToReactFlow(doc, { cs: true });
    const byId = new Map(edges.map((e) => [e.id, e]));
    // Đường "đi tiếp" (次へ) bị bỏ nhãn cho gọn.
    expect(byId.get('nx')?.label).toBeUndefined();
    expect((byId.get('nx')?.data as RFEdgeData).alwaysLabel).toBe(false);
    // Nhánh failed vẫn giữ nhãn 失敗.
    expect(byId.get('fl')?.label).toBe('失敗');
  });

  it('hearing 3+ nhánh (rẽ nhánh thật): mọi nhánh đều hiện nhãn', () => {
    const doc = ir(
      [
        node('hear', 'interaction', {
          branches: [
            { id: 'b0', value: 'はい', label: 'はい' },
            { id: 'default', value: '', label: 'いいえ' },
          ],
        }),
        node('a', 'announce'),
        node('b', 'announce'),
        node('end', 'hangup'),
      ],
      [
        { id: 'e0', source: 'hear', target: 'a', sourceHandle: 'b0' },
        { id: 'ed', source: 'hear', target: 'b', sourceHandle: 'default' },
        { id: 'fl', source: 'hear', target: 'end', sourceHandle: 'failed' },
      ],
    );
    const { edges } = irToReactFlow(doc, { cs: true });
    const byId = new Map(edges.map((e) => [e.id, e]));
    // 3 handle (failed + はい + いいえ) -> hiện nhãn cho cả nhánh default (いいえ).
    expect(byId.get('e0')?.label).toBe('はい');
    expect(byId.get('ed')?.label).toBe('いいえ');
    expect(byId.get('fl')?.label).toBe('失敗');
    expect((byId.get('ed')?.data as RFEdgeData).alwaysLabel).toBe(true);
  });

  it('màn TS giữ hành vi cũ: announce vẫn có nhãn (hover mới hiện)', () => {
    const doc = ir(
      [node('talk', 'announce'), node('end', 'hangup')],
      [{ id: 'e1', source: 'talk', target: 'end', sourceHandle: 'default' }],
    );
    const { edges } = irToReactFlow(doc);
    expect(edges[0].label).toBe('次へ');
    expect((edges[0].data as RFEdgeData).alwaysLabel).toBe(false);
  });

  it('nhiều stamp chập về 1 đích -> mỗi dây vẫn có nhãn (neo sát output nguồn, không stagger)', () => {
    const doc = ir(
      [node('h1', 'interaction'), node('h2', 'interaction'), node('end', 'hangup')],
      [
        { id: 'e1', source: 'h1', target: 'end', sourceHandle: 'failed' },
        { id: 'e2', source: 'h2', target: 'end', sourceHandle: 'failed' },
      ],
    );
    const { edges } = irToReactFlow(doc, { cs: true });
    // Cả 2 dây failed vẫn có stamp 失敗 luôn hiện.
    expect((edges[0].data as RFEdgeData).alwaysLabel).toBe(true);
    expect((edges[1].data as RFEdgeData).alwaysLabel).toBe(true);
    // Không còn stagger: nhãn neo sát chấm output từng node (xem DeletableEdge.labelAnchor).
    expect((edges[0].data as RFEdgeData).labelStagger).toBeUndefined();
    expect((edges[1].data as RFEdgeData).labelStagger).toBeUndefined();
  });

  it('offset stamp người dùng kéo (data.labelOffsets[handle]) truyền xuống edge', () => {
    const doc = ir(
      [
        node('hear', 'interaction', { labelOffsets: { failed: { x: 30, y: -12 } } }),
        node('end', 'hangup'),
      ],
      [{ id: 'e1', source: 'hear', target: 'end', sourceHandle: 'failed' }],
    );
    const { edges } = irToReactFlow(doc, { cs: true });
    expect((edges[0].data as RFEdgeData).labelOffset).toEqual({ x: 30, y: -12 });
  });
});
