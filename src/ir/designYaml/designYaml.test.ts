import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { fromDesignYaml } from './fromDesignYaml';
import { toDesignYaml } from './toDesignYaml';

const FIXTURE_PATH = new URL('../../../fixtures/design-flow-proto.yaml', import.meta.url);

describe('designYaml adapter', () => {
  it('parses scenario_flow steps into IR nodes/edges', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf-8');
    const { ir, passthrough } = fromDesignYaml(text, { id: 'proto-flat', name: 'プロト_フラット' });

    expect(ir.nodes.map((n) => n.id)).toEqual(['冒頭', '冒頭_アナウンス', '氏名聴取', '生年月日聴取', '電話番号聴取', '終了']);
    expect(ir.nodes.find((n) => n.id === '氏名聴取')).toMatchObject({
      type: 'interaction',
      data: { blockType: 'slot', slot: 'patient_name', save_to: 'patientName' },
    });
    expect(ir.edges).toContainEqual(
      expect.objectContaining({ source: '冒頭', target: '冒頭_アナウンス', sourceHandle: 'default' }),
    );
    // Section không phải graph phải giữ nguyên ở passthrough.
    expect(passthrough.basic_info).toBeDefined();
    expect(passthrough.termination_patterns).toBeDefined();
    expect(passthrough.scenario_flow).toBeUndefined();
  });

  it('round-trips: fromDesignYaml -> toDesignYaml giữ nguyên nội dung nghiệp vụ (diff = 0 khi không sửa gì)', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf-8');
    const { ir, passthrough } = fromDesignYaml(text, { id: 'proto-flat', name: 'プロト_フラット' });
    const out = toDesignYaml(ir, passthrough);

    const originalDoc = parse(text);
    const roundTripDoc = parse(out);

    expect(roundTripDoc.scenario_flow).toEqual(originalDoc.scenario_flow);
    expect(roundTripDoc.termination_patterns).toEqual(originalDoc.termination_patterns);
    expect(roundTripDoc.basic_info).toEqual(originalDoc.basic_info);
    expect(roundTripDoc.context_fields).toEqual(originalDoc.context_fields);
    expect(roundTripDoc.hearing_items).toEqual(originalDoc.hearing_items);
  });

  it('hearing có conditions -> tách 1 node "分岐" ẢO (nexus, kéo-thả sửa nhánh được) ngay sau, round-trip gộp ngược đúng', () => {
    const text = [
      'scenario_flow:',
      '  - step: "用件確認"',
      '    type: hearing',
      '    output_format: enum',
      '    output_labels:',
      '      - "予約"',
      '      - "変更"',
      '    conditions:',
      '      - match: "予約"',
      '        next: "予約フロー"',
      '      - match: "変更"',
      '        next: "変更フロー"',
      '      - match: "default"',
      '        next: "失敗フロー"',
      '  - step: "予約フロー"',
      '    type: termination',
      '    termination_ref: "END_予約"',
      '  - step: "変更フロー"',
      '    type: termination',
      '    termination_ref: "END_変更"',
      '  - step: "失敗フロー"',
      '    type: termination',
      '    termination_ref: "END_失敗"',
      '',
    ].join('\n');

    const { ir, passthrough } = fromDesignYaml(text, { id: 'x', name: 'x' });
    const hearingNode = ir.nodes.find((n) => n.id === '用件確認');
    // hearing -> interaction (2 lối ra CỐ ĐỊNH) -> KHÔNG mang branches trực tiếp.
    expect(hearingNode?.type).toBe('interaction');
    expect(hearingNode?.data.branches).toBeUndefined();

    // Node "分岐" ảo: nexus (rẽ nhánh tự do) + đánh dấu step gốc để gộp ngược khi lưu.
    const routerNode = ir.nodes.find((n) => n.data.syntheticRouterFor === '用件確認');
    expect(routerNode).toMatchObject({ type: 'nexus' });
    expect(routerNode?.data.branches).toHaveLength(3);

    // hearing chỉ có 1 dây (mặc định) trỏ tới node ảo; nhánh thật nằm ở node ảo.
    expect(ir.edges).toContainEqual(expect.objectContaining({ source: '用件確認', target: routerNode?.id, sourceHandle: 'default' }));
    expect(ir.edges).toContainEqual(
      expect.objectContaining({ source: routerNode?.id, target: '予約フロー', condition: '予約' }),
    );

    const out = toDesignYaml(ir, passthrough);
    const roundTripDoc = parse(out);
    const originalDoc = parse(text);
    // Xuất lại: node ảo KHÔNG thành step riêng — conditions gộp ngược vào step 用件確認.
    expect(roundTripDoc.scenario_flow).toEqual(originalDoc.scenario_flow);
  });
});
