import { describe, expect, it } from 'vitest';
import {
  csBranchesToDataBranches,
  csBranchSentence,
  nextCsBranchId,
  nextCsBranchName,
  operatorsFor,
  readCsBranches,
  sourceValueType,
  CS_ELSE_LABEL,
  type CsBranch,
} from './csLogic';
import { CATCH_ALL_ID } from './nodeSchema';

// Node 分岐ロジック màn CS: model điều kiện có cấu trúc (data.csConditions).

const branch = (over: Partial<CsBranch> = {}): CsBranch => ({
  id: 'b0',
  name: '携帯からの着信',
  combinator: 'and',
  conditions: [{ source: 'callerNumber', operator: 'isMobile', value: '', value2: '' }],
  ...over,
});

describe('csLogic', () => {
  it('readCsBranches: đọc an toàn, bỏ entry hỏng, seed 1 điều kiện khi trống', () => {
    const data = {
      csConditions: [
        branch(),
        { id: 'b1', name: 'x', combinator: 'or', conditions: [] }, // trống -> seed 1 điều kiện
        { name: 'thiếu id' }, // hỏng -> bỏ
        null,
      ],
    };
    const parsed = readCsBranches(data as Record<string, unknown>);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('携帯からの着信');
    expect(parsed[1].combinator).toBe('or');
    expect(parsed[1].conditions).toHaveLength(1);
  });

  it('readCsBranches: data không có csConditions -> []', () => {
    expect(readCsBranches({})).toEqual([]);
  });

  it('csBranchesToDataBranches: sync value/label = tên nhánh + catch-all その他 CUỐI', () => {
    const out = csBranchesToDataBranches([branch(), branch({ id: 'b1', name: '予約あり' })]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ id: 'b0', value: '携帯からの着信', label: '携帯からの着信' });
    expect(out[2]).toEqual({ id: CATCH_ALL_ID, value: '', label: CS_ELSE_LABEL });
  });

  it('id/tên nhánh mới không trùng (bỏ qua id đã dùng)', () => {
    const list = [branch(), branch({ id: 'b1', name: '分岐1' })];
    expect(nextCsBranchId(list)).toBe('b2');
    expect(nextCsBranchName(list)).toBe('分岐2');
  });

  it('toán tử theo loại nguồn: node result là text, 発信元電話番号 là phone', () => {
    expect(sourceValueType('node:interaction_1')).toBe('text');
    expect(sourceValueType('callerNumber')).toBe('phone');
    expect(operatorsFor('callDay').map((o) => o.id)).toEqual(['is']);
  });

  it('câu tóm tắt: AND nối かつ, toán tử không cần giá trị & khoảng thời gian', () => {
    const b = branch({
      combinator: 'and',
      conditions: [
        { source: 'callerNumber', operator: 'isMobile', value: '', value2: '' },
        { source: 'callTime', operator: 'between', value: '09:00', value2: '12:00' },
      ],
    });
    expect(csBranchSentence(b, null)).toBe(
      '発信元電話番号が携帯電話である かつ 受電時刻が 09:00〜12:00 の間',
    );
  });

  it('câu tóm tắt: nguồn node đã bị xoá -> hiện id thô (không crash)', () => {
    const b = branch({
      combinator: 'or',
      conditions: [{ source: 'node:gone_1', operator: 'equals', value: 'はい', value2: '' }],
    });
    expect(csBranchSentence(b, null)).toBe('聴取「gone_1」の結果が「はい」と等しい');
  });
});
