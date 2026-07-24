import { describe, it, expect } from 'vitest';
import { FIXED_REQUIRED_HANDLES, EDITABLE_BRANCH_TYPES } from './branchRules';
import { BRANCH_SCHEMA } from '../ui/nodeSchema';
import type { NodeType } from './types';

// Chống LỆCH giữa nguồn thuần ir/branchRules (dùng cho validate) và bản render
// ui/nodeSchema (BRANCH_SCHEMA). Đổi một bên mà quên bên kia -> test này đỏ.
describe('branchRules ↔ BRANCH_SCHEMA nhất quán', () => {
  const types = Object.keys(BRANCH_SCHEMA) as NodeType[];

  for (const type of types) {
    const schema = BRANCH_SCHEMA[type];
    it(`${type} (mode=${schema.mode})`, () => {
      if (schema.mode === 'fixed') {
        const ids = (schema.fixed ?? []).map((b) => b.id);
        expect(FIXED_REQUIRED_HANDLES[type]).toEqual(ids);
      } else if (schema.mode === 'editable') {
        expect(EDITABLE_BRANCH_TYPES).toContain(type);
        expect(FIXED_REQUIRED_HANDLES[type]).toBeUndefined();
      } else {
        // none (hangup): không nằm ở nhóm nào.
        expect(FIXED_REQUIRED_HANDLES[type]).toBeUndefined();
        expect(EDITABLE_BRANCH_TYPES).not.toContain(type);
      }
    });
  }
});
