import { describe, it, expect } from 'vitest';
import { computeInheritedFlags } from './statusFlow';
import type { FlowEdge, FlowIR, FlowNode } from './types';

// Helper dựng IR tối giản (chỉ cần nodes/edges cho computeInheritedFlags).
function makeIr(nodes: FlowNode[], edges: FlowEdge[]): FlowIR {
  return {
    version: '1.0',
    meta: { id: 'test', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
  };
}

const node = (id: string, type: FlowNode['type'], data: Record<string, unknown> = {}): FlowNode => ({
  id,
  type,
  label: id,
  position: { x: 0, y: 0 },
  data,
});

const edge = (source: string, target: string): FlowEdge => ({ id: `${source}-${target}`, source, target });

describe('computeInheritedFlags — baseline mặc định', () => {
  it('chưa node nào set -> mọi node kế thừa status 0 + SMS -2', () => {
    const ir = makeIr(
      [node('a', 'announce'), node('b', 'transfer'), node('c', 'hangup')],
      [edge('a', 'b'), edge('b', 'c')],
    );
    const flags = computeInheritedFlags(ir);
    for (const id of ['a', 'b', 'c']) {
      expect(flags.get(id)).toEqual({ statusFlag: '0', smsFlag: '-2' });
    }
  });

  it('node phía trên set flag -> node sau kế thừa flag đó (đè baseline)', () => {
    const ir = makeIr(
      [
        node('a', 'transfer', { statusFlag: 3, smsFlag: 1 }),
        node('b', 'hangup'),
      ],
      [edge('a', 'b')],
    );
    const flags = computeInheritedFlags(ir);
    // a chưa có ai phía trên -> vẫn baseline; b kế thừa flag của a.
    expect(flags.get('a')).toEqual({ statusFlag: '0', smsFlag: '-2' });
    expect(flags.get('b')).toEqual({ statusFlag: '3', smsFlag: '1' });
  });

  it('node rời rạc (không nối gốc) vẫn nhận baseline mặc định', () => {
    const ir = makeIr([node('lonely', 'hangup')], []);
    expect(computeInheritedFlags(ir).get('lonely')).toEqual({ statusFlag: '0', smsFlag: '-2' });
  });
});
