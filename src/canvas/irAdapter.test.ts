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

    // Hearing nhánh failed: nhãn 失敗 luôn hiện.
    expect(byId.get('e1')?.label).toBe('失敗');
    expect((byId.get('e1')?.data as RFEdgeData).alwaysLabel).toBe(true);
    // Transfer nhánh next: nhãn 次へ luôn hiện.
    expect(byId.get('e2')?.label).toBe('次へ');
    expect((byId.get('e2')?.data as RFEdgeData).alwaysLabel).toBe(true);
    // Announce: bỏ hẳn nhãn (kể cả hover).
    expect(byId.get('e3')?.label).toBeUndefined();
    expect((byId.get('e3')?.data as RFEdgeData).alwaysLabel).toBe(false);
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

  it('nhiều stamp chập về 1 đích -> stagger dọc so le, không trùng nhau', () => {
    const doc = ir(
      [node('h1', 'interaction'), node('h2', 'interaction'), node('end', 'hangup')],
      [
        { id: 'e1', source: 'h1', target: 'end', sourceHandle: 'failed' },
        { id: 'e2', source: 'h2', target: 'end', sourceHandle: 'failed' },
      ],
    );
    const { edges } = irToReactFlow(doc, { cs: true });
    const s1 = (edges[0].data as RFEdgeData).labelStagger;
    const s2 = (edges[1].data as RFEdgeData).labelStagger;
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s1!.y).not.toBe(s2!.y);
    // So le quanh tâm: tổng độ lệch = 0 (không kéo cả cụm lệch hẳn 1 phía).
    expect(s1!.y + s2!.y).toBe(0);
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
