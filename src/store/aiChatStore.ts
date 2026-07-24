import { create } from 'zustand';
import { AiError, chatRaw } from '../ai/openai';
import { buildChatMessages } from '../ai/chatPrompt';
import { buildScreenContext } from '../ai/screens';
import { toolCallToOp } from '../ai/tools';
import type { EditOp } from '../ai/editOps';
import { useFlowStore } from './flowStore';
import { useWorkspaceStore } from './workspaceStore';

// ─────────────────────────────────────────────────────────────────────────────
// Store cho panel AI Chat (trợ lý sửa flow bằng hội thoại) — TOOL-CALLING.
//   - Gửi yêu cầu -> vòng lặp gọi tool (OpenAI) gom edit-ops vào giỏ -> gõ dần phần
//     tóm tắt (typing). Ops chờ người dùng Áp dụng/Bỏ (human-in-the-loop).
//   - "Dừng": abort fetch / kết thúc typing ngay.
//   - Tin nhắn hệ thống (divider) khi đổi màn; hội thoại reset khi đổi CS/TS hoặc file.
// Nội dung hiển thị bằng ngôn ngữ người dùng (AI tự sinh). Lỗi giữ ở errorKey (i18n).
// ─────────────────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMsg {
  id: string;
  role: ChatRole;
  text: string;
  ops?: EditOp[]; // assistant: đề xuất thay đổi
  opsState?: 'pending' | 'applied' | 'rejected';
  errorKey?: string; // assistant: lỗi (TKey) thay cho text
  typing?: boolean; // đang gõ dần
}

type Status = 'idle' | 'thinking' | 'typing';

interface AiChatState {
  open: boolean;
  status: Status;
  messages: ChatMsg[];
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  applyOps: (msgId: string) => Promise<void>;
  rejectOps: (msgId: string) => void;
  pushDivider: (text: string) => void;
  resetConversation: () => void;
}

let activeController: AbortController | null = null;
let typingTimer: ReturnType<typeof setTimeout> | null = null;
let msgSeq = 0;
const nextId = () => `m${++msgSeq}`;
const MAX_TOOL_ROUNDS = 6; // chặn vòng lặp tool-call chạy vô hạn

function errorKeyOf(e: unknown): string {
  if (e instanceof AiError) {
    if (e.code === 'no-config') return 'aiErrNoKey';
    if (e.code === 'no-auth' || e.code === 'unauthorized') return 'aiErrAuth';
  }
  return 'aiErrCall';
}

// Tên flow đang mở (main / tên sub flow) — cho digest & divider.
function activeFlowName(): string {
  const { ir, activeFlowId } = useFlowStore.getState();
  if (activeFlowId === 'main') return 'Main Flow';
  return (ir?.subflows ?? []).find((s) => s.id === activeFlowId)?.name ?? activeFlowId;
}

export const useAiChatStore = create<AiChatState>((set, get) => {
  const patchMsg = (id: string, patch: Partial<ChatMsg>) =>
    set({ messages: get().messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) });

  // Gõ dần `full` vào message `id` (typing). Xong -> status idle.
  const typeOut = (id: string, full: string) => {
    set({ status: 'typing' });
    const chunk = Math.max(1, Math.round(full.length / 140));
    let shown = 0;
    const step = () => {
      shown = Math.min(full.length, shown + chunk);
      patchMsg(id, { text: full.slice(0, shown) });
      if (shown >= full.length) {
        patchMsg(id, { typing: false });
        set({ status: 'idle' });
        typingTimer = null;
        return;
      }
      typingTimer = setTimeout(step, 16);
    };
    step();
  };

  return {
    open: false,
    status: 'idle',
    messages: [],

    openPanel: () => set({ open: true }),
    closePanel: () => set({ open: false }),
    togglePanel: () => set({ open: !get().open }),

    pushDivider: (text) => set({ messages: [...get().messages, { id: nextId(), role: 'system', text }] }),

    send: async (raw) => {
      const text = raw.trim();
      if (!text || get().status !== 'idle') return;

      set({ messages: [...get().messages, { id: nextId(), role: 'user', text }], status: 'thinking' });

      const ir = useFlowStore.getState().ir;
      if (!ir) {
        set({
          messages: [...get().messages, { id: nextId(), role: 'assistant', text: '', errorKey: 'aiChatNoFlow' }],
          status: 'idle',
        });
        return;
      }

      // Lịch sử cho model: chỉ text user/assistant hợp lệ (bỏ divider + message lỗi).
      const history = get()
        .messages.filter((m) => !m.errorKey && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));

      // Bối cảnh RIÊNG theo màn đang mở (spec + context + tool khác nhau mỗi màn).
      const screen = buildScreenContext(
        useWorkspaceStore.getState().mode,
        useFlowStore.getState().canvasTab,
        ir,
        activeFlowName(),
      );
      const msgs = buildChatMessages(screen.spec, screen.context, screen.screenName, history);

      activeController = new AbortController();
      const signal = activeController.signal;
      const batch: EditOp[] = [];
      let finalReply = '';

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const res = await chatRaw(msgs, { tools: screen.tools, signal });
          if (res.toolCalls.length === 0) {
            finalReply = res.content;
            break;
          }
          // Nối message assistant (chứa tool_calls) + kết quả từng tool (queued).
          msgs.push(res.raw);
          for (const tc of res.toolCalls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>;
            } catch {
              // tham số hỏng -> op null
            }
            const op = toolCallToOp(tc.name, args);
            if (op) batch.push(op);
            msgs.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: op ? '{"status":"queued"}' : '{"status":"ignored"}',
            });
          }
          // Lượt cuối vẫn còn tool-call -> lấy content hiện có làm tóm tắt.
          if (round === MAX_TOOL_ROUNDS - 1) finalReply = res.content;
        }
        activeController = null;

        const id = nextId();
        const hasOps = batch.length > 0;
        set({
          messages: [
            ...get().messages,
            {
              id,
              role: 'assistant',
              text: '',
              typing: true,
              ...(hasOps ? { ops: batch, opsState: 'pending' as const } : {}),
            },
          ],
        });
        typeOut(id, finalReply.trim());
      } catch (e) {
        activeController = null;
        if (e instanceof DOMException && e.name === 'AbortError') return; // "Dừng"
        set({
          messages: [...get().messages, { id: nextId(), role: 'assistant', text: '', errorKey: errorKeyOf(e) }],
          status: 'idle',
        });
      }
    },

    stop: () => {
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
      if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
        const last = [...get().messages].reverse().find((m) => m.typing);
        if (last) patchMsg(last.id, { typing: false });
      }
      set({ status: 'idle' });
    },

    applyOps: async (msgId) => {
      const msg = get().messages.find((m) => m.id === msgId);
      if (!msg || !msg.ops || msg.opsState !== 'pending') return;
      try {
        const ok = await useFlowStore.getState().applyAiOps(msg.ops);
        if (ok) patchMsg(msgId, { opsState: 'applied' });
      } catch {
        // Áp lỗi -> giữ pending để thử lại.
      }
    },

    rejectOps: (msgId) => {
      const msg = get().messages.find((m) => m.id === msgId);
      if (!msg || msg.opsState !== 'pending') return;
      patchMsg(msgId, { opsState: 'rejected' });
    },

    resetConversation: () => {
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
      if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
      }
      set({ messages: [], status: 'idle' });
    },
  };
});
