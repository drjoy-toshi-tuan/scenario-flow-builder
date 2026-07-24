import { describe, it, expect } from 'vitest';
import { buildFlowDigest } from './flowDigest';
import type { FlowIR, FlowNode } from '../ir/types';

function node(id: string, type: FlowNode['type'], label: string, data: Record<string, unknown> = {}): FlowNode {
  return { id, type, label, position: { x: 0, y: 0 }, data };
}

const doc: FlowIR = {
  version: '1',
  meta: {
    id: 's1',
    name: 'カレス記念病院',
    facility: 'カレス記念病院',
    createdAt: '2026-01-01 00:00',
    updatedAt: '2026-01-01 00:00',
  },
  nodes: [
    node('n1', 'announce', '案内', { text: 'こんにちは' }),
    node('n2', 'interaction', '聴取', { announce: '' }), // trống -> (empty)
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  subflows: [
    {
      id: 'sub_yoyaku',
      name: '予約',
      nodes: [node('s1n1', 'announce', '聴取失敗', { text: '' })],
      edges: [],
    },
  ],
};

describe('buildFlowDigest', () => {
  it('main mở: digest đầy đủ flow đang mở + liệt kê sub flow khác', () => {
    const out = buildFlowDigest(doc, 'main');
    expect(out).toContain('OPEN FLOW: Main Flow');
    expect(out).toContain('ALL FLOWS: Main Flow, 予約');
    // flow đang mở có cả brief lẫn dây
    expect(out).toContain('- n1 [announce] "案内" :: こんにちは');
    expect(out).toContain('- n1 -> n2');
    // field trống được đánh dấu (empty)
    expect(out).toContain('- n2 [interaction] "聴取" :: (empty)');
    // sub flow khác được liệt kê (để AI biết 聴取失敗 tồn tại ở đâu)
    expect(out).toContain('OTHER FLOWS');
    expect(out).toContain('FLOW "予約":');
    expect(out).toContain('- s1n1 [announce] "聴取失敗" :: (empty)');
  });

  it('sub flow mở: flow đó thành OPEN, main thành OTHER', () => {
    const out = buildFlowDigest(doc, 'sub_yoyaku');
    expect(out).toContain('OPEN FLOW: 予約');
    expect(out).toContain('OPEN FLOW "予約" — NODES:');
    // main giờ nằm ở OTHER FLOWS
    const otherIdx = out.indexOf('OTHER FLOWS');
    expect(otherIdx).toBeGreaterThan(-1);
    expect(out.indexOf('FLOW "Main Flow":')).toBeGreaterThan(otherIdx);
  });
});
