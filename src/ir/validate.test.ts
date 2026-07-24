import { describe, it, expect } from 'vitest';
import { validateFlow } from './validate';
import type { FlowNode, FlowEdge } from './types';

function node(id: string, type: FlowNode['type'], data: Record<string, unknown> = {}): FlowNode {
  return { id, type, label: id, position: { x: 0, y: 0 }, data };
}
const edge = (source: string, target: string, sourceHandle?: string): FlowEdge => ({
  id: `${source}-${target}-${sourceHandle ?? ''}`,
  source,
  target,
  sourceHandle,
});

describe('validateFlow — handle bắt buộc', () => {
  it('interaction chỉ nối default -> thiếu failed', () => {
    const v = validateFlow([node('a', 'interaction'), node('b', 'hangup')], [edge('a', 'b')]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ nodeId: 'a', handle: 'failed' });
  });

  it('interaction nối đủ failed + default -> không vi phạm', () => {
    const v = validateFlow(
      [node('a', 'interaction'), node('b', 'hangup'), node('c', 'hangup')],
      [edge('a', 'b', 'default'), edge('a', 'c', 'failed')],
    );
    expect(v).toHaveLength(0);
  });

  it('sourceHandle rỗng coi như default', () => {
    const v = validateFlow(
      [node('a', 'openai'), node('b', 'hangup'), node('c', 'hangup')],
      [edge('a', 'b'), edge('a', 'c', 'failed')],
    );
    expect(v).toHaveLength(0);
  });

  it('announce thiếu default', () => {
    const v = validateFlow([node('a', 'announce')], []);
    expect(v).toEqual([
      expect.objectContaining({ nodeId: 'a', nodeType: 'announce', handle: 'default' }),
    ]);
  });

  it('hangup không cần nhánh ra', () => {
    expect(validateFlow([node('a', 'hangup')], [])).toHaveLength(0);
  });

  it('nexus (editable): mỗi branch trong data.branches cần 1 dây', () => {
    const n = node('a', 'nexus', { branches: [{ id: 'yes' }, { id: 'no' }] });
    const v = validateFlow([n, node('b', 'hangup')], [edge('a', 'b', 'yes')]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ nodeId: 'a', handle: 'no' });
  });

  it('nexus không có branches -> không vi phạm (chưa cấu hình)', () => {
    expect(validateFlow([node('a', 'nexus')], [])).toHaveLength(0);
  });
});
