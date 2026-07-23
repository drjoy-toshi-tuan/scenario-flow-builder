import { describe, it, expect } from 'vitest';
import { computeInheritedFlags } from './statusFlow';
import { SYNTHETIC_START_ID } from './types';
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
  it('node đầu tiên mặc định 0 / -2 + isEntry (hiện PLAIN, không stamp); node sau kế thừa baseline', () => {
    const ir = makeIr(
      [node('a', 'announce'), node('b', 'transfer'), node('c', 'hangup')],
      [edge('a', 'b'), edge('b', 'c')],
    );
    const flags = computeInheritedFlags(ir);
    // a = node đầu tiên -> mặc định 0 / -2 nhưng isEntry -> UI hiện PLAIN, không stamp Carried.
    expect(flags.get('a')).toEqual({ statusFlag: '0', smsFlag: '-2', isEntry: true });
    // b, c ở sau -> kế thừa baseline mặc định (0 / -2), KHÔNG isEntry -> hiện stamp Carried.
    for (const id of ['b', 'c']) {
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
    // a là node đầu tiên -> mặc định 0 / -2 + isEntry (giá trị riêng của a hiển thị riêng); b kế thừa flag của a.
    expect(flags.get('a')).toEqual({ statusFlag: '0', smsFlag: '-2', isEntry: true });
    expect(flags.get('b')).toEqual({ statusFlag: '3', smsFlag: '1' });
  });

  it('node đầu tiên sau Start tổng hợp cũng mặc định 0 / -2 + isEntry', () => {
    const ir = makeIr(
      [node(SYNTHETIC_START_ID, 'start'), node('first', 'interaction'), node('second', 'hangup')],
      [edge(SYNTHETIC_START_ID, 'first'), edge('first', 'second')],
    );
    const flags = computeInheritedFlags(ir);
    // 'first' chỉ có dây vào từ node Start tổng hợp -> vẫn là node đầu tiên -> 0 / -2 + isEntry.
    expect(flags.get('first')).toEqual({ statusFlag: '0', smsFlag: '-2', isEntry: true });
    // 'second' ở sau -> kế thừa baseline mặc định (không isEntry).
    expect(flags.get('second')).toEqual({ statusFlag: '0', smsFlag: '-2' });
  });

  it('node rời rạc (không nối gốc) -> là điểm bắt đầu -> mặc định 0 / -2 + isEntry', () => {
    const ir = makeIr([node('lonely', 'hangup')], []);
    expect(computeInheritedFlags(ir).get('lonely')).toEqual({ statusFlag: '0', smsFlag: '-2', isEntry: true });
  });
});
