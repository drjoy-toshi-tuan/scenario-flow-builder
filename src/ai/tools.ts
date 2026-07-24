import { NODE_TYPES, type NodeType } from '../ir/types';
import type { EditOp } from './editOps';

// ─────────────────────────────────────────────────────────────────────────────
// Tool-calling (Option 3): khai báo "công cụ" cho OpenAI theo TỪNG MÀN (mỗi màn có
// spec/thao tác khác nhau). Model tự gọi tool (nhiều tool/nhiều vòng) để dựng thay
// đổi; tool chỉ GOM edit-ops vào giỏ (queued) để người dùng duyệt (human-in-the-loop).
// ─────────────────────────────────────────────────────────────────────────────

const CREATABLE_TYPES = NODE_TYPES.filter((t) => t !== 'start') as unknown as string[];

const TOOL_ADD_NODE = {
  type: 'function',
  function: {
    name: 'add_node',
    description:
      'Add a new node to the current flow. Use `ref` as a temporary id to connect this node in add_edge within the same turn. Put wording in data (announce node: {"text":"..."}, interaction node: {"announce":"..."}, openai node: {"prompt":"..."}).',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'temporary reference id (e.g. "n1") to use in add_edge' },
        nodeType: { type: 'string', enum: CREATABLE_TYPES },
        label: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
      required: ['ref', 'nodeType'],
    },
  },
};

const TOOL_UPDATE_NODE = {
  type: 'function',
  function: {
    name: 'update_node',
    description: 'Update an existing node (by its id from the context). data is merged into current data.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
      required: ['id'],
    },
  },
};

const TOOL_REMOVE_NODE = {
  type: 'function',
  function: {
    name: 'remove_node',
    description: 'Remove an existing node (by id). Its edges are removed too.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
};

const TOOL_ADD_EDGE = {
  type: 'function',
  function: {
    name: 'add_edge',
    description:
      'Connect two nodes. source/target are existing node ids OR the `ref` of a node created by add_node in this turn. condition/label optional.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        target: { type: 'string' },
        sourceHandle: { type: 'string' },
        condition: { type: 'string' },
        label: { type: 'string' },
      },
      required: ['source', 'target'],
    },
  },
};

const TOOL_REMOVE_EDGE = {
  type: 'function',
  function: {
    name: 'remove_edge',
    description: 'Remove the connection between two nodes (by source and target ids).',
    parameters: {
      type: 'object',
      properties: { source: { type: 'string' }, target: { type: 'string' } },
      required: ['source', 'target'],
    },
  },
};

// Bộ tool theo màn.
export const FLOW_TOOLS = [TOOL_ADD_NODE, TOOL_UPDATE_NODE, TOOL_REMOVE_NODE, TOOL_ADD_EDGE, TOOL_REMOVE_EDGE];
// Màn Announce List: CHỈ sửa văn lời (wording) của node có sẵn.
export const ANNOUNCE_TOOLS = [TOOL_UPDATE_NODE];

const asStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

// Chuyển 1 tool-call (tên + tham số đã parse) -> EditOp. Trả null nếu không hợp lệ.
export function toolCallToOp(name: string, args: Record<string, unknown>): EditOp | null {
  const data = args.data && typeof args.data === 'object' ? (args.data as Record<string, unknown>) : undefined;
  switch (name) {
    case 'add_node': {
      const nodeType = asStr(args.nodeType);
      if (!nodeType || nodeType === 'start' || !NODE_TYPES.includes(nodeType as NodeType)) return null;
      return { op: 'addNode', tempId: asStr(args.ref), nodeType: nodeType as NodeType, label: asStr(args.label), data };
    }
    case 'update_node': {
      const id = asStr(args.id);
      if (!id) return null;
      return { op: 'updateNode', id, label: asStr(args.label), data };
    }
    case 'remove_node': {
      const id = asStr(args.id);
      if (!id) return null;
      return { op: 'removeNode', id };
    }
    case 'add_edge': {
      const source = asStr(args.source);
      const target = asStr(args.target);
      if (!source || !target) return null;
      return {
        op: 'addEdge',
        source,
        target,
        sourceHandle: asStr(args.sourceHandle),
        condition: asStr(args.condition),
        label: asStr(args.label),
      };
    }
    case 'remove_edge': {
      const source = asStr(args.source);
      const target = asStr(args.target);
      if (!source || !target) return null;
      return { op: 'removeEdge', source, target };
    }
    default:
      return null;
  }
}
