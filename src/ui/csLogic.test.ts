import { describe, expect, it } from 'vitest';
import {
  csProductBranches,
  csSlotsToDataBranches,
  dayRemainder,
  readCsCount,
  readCsSlots,
  slotValueLabels,
  timeRemainderRanges,
  CS_ELSE_LABEL,
  type CsSlot,
} from './csLogic';
import { CATCH_ALL_ID } from './nodeSchema';

// Node 分岐ロジック (CS) — model điều kiện (data.csCount + data.csSlots) + nhánh tích.

describe('csLogic', () => {
  it('readCsCount: kẹp trong [1,3], mặc định 1', () => {
    expect(readCsCount({})).toBe(1);
    expect(readCsCount({ csCount: 2 })).toBe(2);
    expect(readCsCount({ csCount: 9 })).toBe(3);
    expect(readCsCount({ csCount: 0 })).toBe(1);
  });

  it('readCsSlots: đọc đúng số slot theo count, an toàn kiểu', () => {
    const data = {
      csCount: 2,
      csSlots: [
        { kind: 'hearing', nodeId: 'interaction_1', values: ['予約', '変更'] },
        { kind: 'phone', phoneKind: 'answered' },
        { kind: 'datetime', dtKind: 'day', days: ['mon'] }, // dư -> bỏ (count=2)
      ],
    };
    const slots = readCsSlots(data);
    expect(slots).toHaveLength(2);
    expect(slots[0].kind).toBe('hearing');
    expect(slots[1].kind).toBe('phone');
    expect(slots[1].phoneKind).toBe('answered');
  });

  it('slotValueLabels: hearing = giá trị đã nhập (bỏ trống); phone = toàn bộ 種別', () => {
    expect(slotValueLabels({ kind: 'hearing', nodeId: 'x', values: ['予約', '', ' 変更 '] })).toEqual(['予約', '変更']);
    expect(slotValueLabels({ kind: 'phone', phoneKind: 'answered' })).toEqual(['その他', '固定', '携帯']);
    expect(slotValueLabels({ kind: 'phone', phoneKind: 'incoming' })).toEqual([
      'その他',
      '非通知',
      '海外',
      'WebRTC',
      '固定',
      '携帯',
    ]);
  });

  it('slotValueLabels: 曜日 = nhóm đã chọn + phần còn lại (tự động)', () => {
    const labels = slotValueLabels({ kind: 'datetime', dtKind: 'day', days: ['mon', 'tue'] });
    expect(labels[0]).toBe('月・火');
    expect(labels[1]).toContain('残り');
    expect(labels[1]).toContain('水');
  });

  it('slotValueLabels: 曜日 nhiều khung = mỗi khung 1 value + phần còn lại (hợp mọi khung)', () => {
    const labels = slotValueLabels({
      kind: 'datetime',
      dtKind: 'day',
      dayGroups: [
        ['mon', 'tue'],
        ['wed', 'thu'],
      ],
    });
    expect(labels[0]).toBe('月・火');
    expect(labels[1]).toBe('水・木');
    // phần còn lại = các thứ chưa thuộc khung nào (金土日祝)
    expect(labels[2]).toContain('残り');
    expect(labels[2]).toContain('金');
    expect(labels[2]).not.toContain('月');
  });

  it('readCsSlots: 曜日 legacy `days` -> gộp thành 1 khung dayGroups', () => {
    const slots = readCsSlots({
      csCount: 1,
      csSlots: [{ kind: 'datetime', dtKind: 'day', days: ['mon', 'fri'] }],
    });
    expect(slots[0].dayGroups).toEqual([['mon', 'fri']]);
  });

  it('slotValueLabels: 時間 = khung user + khung còn lại (qua nửa đêm)', () => {
    const labels = slotValueLabels({ kind: 'datetime', dtKind: 'time', ranges: [{ from: '08:00', to: '16:00' }] });
    expect(labels[0]).toBe('08:00〜16:00');
    // phần còn lại 16:00 → 08:00 hôm sau (wrap)
    expect(labels.some((l) => l.startsWith('16:00〜08:00') && l.includes('残り'))).toBe(true);
  });

  it('timeRemainderRanges: rỗng -> cả ngày; phủ kín -> rỗng', () => {
    expect(timeRemainderRanges([])).toEqual([{ from: '00:00', to: '24:00' }]);
    expect(timeRemainderRanges([{ from: '00:00', to: '24:00' }])).toEqual([]);
  });

  it('dayRemainder: phần bù', () => {
    expect(dayRemainder(['mon', 'tue', 'wed', 'thu', 'fri'])).toEqual(['sat', 'sun', 'holiday']);
  });

  it('csProductBranches: tích các tập giá trị (ĐK1 × ĐK2)', () => {
    const slots: CsSlot[] = [
      { kind: 'hearing', nodeId: 'x', values: ['予約', '変更'] },
      { kind: 'phone', phoneKind: 'answered' }, // その他/固定/携帯
    ];
    const branches = csProductBranches(slots);
    expect(branches).toHaveLength(6); // 2 × 3
    expect(branches[0].parts).toEqual(['予約', 'その他']);
    expect(branches[0].label).toBe('予約 × その他');
    expect(branches[5].parts).toEqual(['変更', '携帯']);
  });

  it('csSlotsToDataBranches: sync + catch-all その他 CUỐI', () => {
    const out = csSlotsToDataBranches([{ kind: 'hearing', nodeId: 'x', values: ['予約', '変更'] }]);
    expect(out).toHaveLength(3); // 2 nhánh + その他
    expect(out[0]).toEqual({ id: 'b0', value: '予約', label: '予約' });
    expect(out[2]).toEqual({ id: CATCH_ALL_ID, value: '', label: CS_ELSE_LABEL });
  });
});
