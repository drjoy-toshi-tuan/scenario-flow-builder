import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAiChatStore, type ChatMsg } from '../store/aiChatStore';
import { useFlowStore } from '../store/flowStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAuth } from '../auth/useAuth';
import { useT, type TKey } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { AiSparkleIcon } from './AiSparkleIcon';
import { describeOp, type EditOp, type OpKind } from '../ai/editOps';

// ─────────────────────────────────────────────────────────────────────────────
// Panel AI Chat — dock bên phải canvas (dùng chung CS/TS). Trò chuyện để sửa flow
// đang mở: AI dùng tool-calling dựng "đề xuất thay đổi" (edit-ops) chờ Áp dụng/Bỏ.
// Mở panel có hiệu ứng phóng ra; click ra ngoài tự đóng. Divider hệ thống khi đổi
// màn (CS: từng tab; TS/CS đổi luồng). Gửi bằng Shift+Enter.
// ─────────────────────────────────────────────────────────────────────────────

const AI_PURPLE = '#d946ef';
const AI_SOFT = 'color-mix(in srgb, #d946ef 14%, transparent)';
const AI_BTN = 'color-mix(in srgb, #d946ef 92%, transparent)';

// Icon OpenAI thô (avatar AI) — tím, không vòng tròn.
function OpenAiAvatar() {
  return (
    <span className="mt-0.5 shrink-0" style={{ color: AI_PURPLE }} aria-hidden>
      <Icon icon="proicons:openai" width={19} height={19} />
    </span>
  );
}

// Avatar user: ảnh Google (cắt tròn); thiếu ảnh -> chữ cái đầu.
function UserAvatar({ picture, name }: { picture?: string; name: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-[var(--bk-accent)]"
      style={{ background: 'var(--bk-accent-soft)' }}
      aria-hidden
    >
      {picture ? (
        <img src={picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
    </span>
  );
}

// Icon + màu theo loại op (add=xanh/plus · edit=xanh dương/edit · remove=đỏ/thùng rác).
const OP_ICON: Record<OpKind, { icon: string; color: string; bg: string }> = {
  add: { icon: 'qlementine-icons:plus-16', color: '#16a34a', bg: 'rgba(22,163,74,.15)' },
  edit: { icon: 'lets-icons:edit-fill', color: '#3b82f6', bg: 'rgba(59,130,246,.16)' },
  remove: { icon: 'lucide:trash-2', color: '#ef4444', bg: 'rgba(239,68,68,.15)' },
};

// Thẻ "đề xuất thay đổi" (edit-ops) — header bóng đèn + danh sách op + Áp dụng/Bỏ.
function OpsCard({ msg }: { msg: ChatMsg }) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const applyOps = useAiChatStore((s) => s.applyOps);
  const rejectOps = useAiChatStore((s) => s.rejectOps);
  const ops = msg.ops ?? [];

  const tempLabels = new Map<string, string>();
  for (const op of ops) if (op.op === 'addNode' && op.tempId) tempLabels.set(op.tempId, op.label || op.nodeType);
  const labelOf = (ref: string) =>
    ir?.nodes.find((n) => n.id === ref)?.label ?? tempLabels.get(ref) ?? ref;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)]">
      <div
        className="flex items-center gap-1.5 border-b border-[var(--bk-border)] px-3 py-2 text-[11.5px] font-bold"
        style={{ color: AI_PURPLE, background: AI_SOFT }}
      >
        <Icon icon="heroicons-solid:light-bulb" width={14} height={14} />
        {t('aiChatProposed', { n: ops.length })}
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2">
        {ops.map((op: EditOp, i) => {
          const d = describeOp(op, labelOf);
          const style = OP_ICON[d.kind];
          return (
            <div key={i} className="flex items-center gap-2 text-[12px] text-[var(--bk-text)]">
              <span
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md"
                style={{ color: style.color, background: style.bg }}
              >
                <Icon icon={style.icon} width={12} height={12} />
              </span>
              <span className="min-w-0">{t(d.key as TKey, d.params)}</span>
            </div>
          );
        })}
      </div>
      {msg.opsState === 'pending' ? (
        <div className="flex gap-2 border-t border-[var(--bk-border)] px-3 py-2.5">
          <button
            type="button"
            onClick={() => void applyOps(msg.id)}
            className="flex-1 rounded-lg py-2 text-[12.5px] font-bold text-white transition hover:brightness-95"
            style={{ background: AI_BTN }}
          >
            {t('aiChatApply')}
          </button>
          <button
            type="button"
            onClick={() => rejectOps(msg.id)}
            className="flex-1 rounded-lg border border-[var(--bk-border)] py-2 text-[12.5px] font-bold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)]"
          >
            {t('aiChatReject')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 border-t border-[var(--bk-border)] px-3 py-2 text-[11.5px] font-semibold">
          {msg.opsState === 'applied' ? (
            <span className="flex items-center gap-1.5 text-[var(--bk-success,#16a34a)]">
              <Icon icon="lucide:check" width={13} height={13} />
              {t('aiChatApplied')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[var(--bk-text-faint)]">
              <Icon icon="lucide:x" width={13} height={13} />
              {t('aiChatRejected')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// 1 dòng chat: system divider / user / assistant.
function MessageRow({ msg, picture, name }: { msg: ChatMsg; picture?: string; name: string }) {
  const t = useT();

  if (msg.role === 'system') {
    // Divider hệ thống: canh giữa, chữ xám (contrast 2 theme), format "— nội dung —".
    return (
      <div className="flex items-center gap-2.5 py-0.5 text-[11px] font-semibold text-[var(--bk-text-faint)]">
        <span className="h-px flex-1 bg-[var(--bk-border)]" />
        <span className="shrink-0">{msg.text}</span>
        <span className="h-px flex-1 bg-[var(--bk-border)]" />
      </div>
    );
  }

  if (msg.role === 'user') {
    return (
      <div className="flex flex-row-reverse gap-2.5">
        <UserAvatar picture={picture} name={name} />
        <div className="bk-user-bubble whitespace-pre-wrap rounded-[13px] rounded-tr-[5px] px-3 py-2 text-[13px] font-semibold leading-relaxed">
          {msg.text}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex gap-2.5">
      <OpenAiAvatar />
      <div className="min-w-0">
        {msg.errorKey ? (
          <div className="rounded-[13px] rounded-tl-[5px] border border-rose-300/50 bg-rose-500/10 px-3 py-2 text-[13px] leading-relaxed text-rose-600 dark:text-rose-300">
            {t(msg.errorKey as TKey)}
          </div>
        ) : (
          <>
            {(msg.text || msg.typing) && (
              <div className="whitespace-pre-wrap rounded-[13px] rounded-tl-[5px] border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--bk-text)]">
                {msg.text}
                {msg.typing && <span className="bk-ai-caret" />}
              </div>
            )}
            {msg.ops && msg.ops.length > 0 && !msg.typing && <OpsCard msg={msg} />}
          </>
        )}
      </div>
    </div>
  );
}

// Nhãn tab CS -> key i18n (cho divider khi đổi tab).
const TAB_KEY: Record<string, TKey> = {
  announce: 'ctAnnounce',
  general: 'ctGeneral',
  status: 'ctStatus',
  clinicalDept: 'ctClinicalDept',
  courseList: 'ctCourseList',
};

export function AiChatPanel() {
  const t = useT();
  const { user } = useAuth();
  const open = useAiChatStore((s) => s.open);
  const status = useAiChatStore((s) => s.status);
  const messages = useAiChatStore((s) => s.messages);
  const closePanel = useAiChatStore((s) => s.closePanel);
  const send = useAiChatStore((s) => s.send);
  const stop = useAiChatStore((s) => s.stop);
  const pushDivider = useAiChatStore((s) => s.pushDivider);
  const resetConversation = useAiChatStore((s) => s.resetConversation);

  const mode = useWorkspaceStore((s) => s.mode);
  const canvasTab = useFlowStore((s) => s.canvasTab);
  const activeFlowId = useFlowStore((s) => s.activeFlowId);
  const scenarioId = useFlowStore((s) => s.ir?.meta.id);
  const subName = useFlowStore((s) => s.ir?.subflows?.find((sf) => sf.id === s.activeFlowId)?.name);

  const flowDisplay = activeFlowId === 'main' ? 'Main Flow' : subName || activeFlowId;
  const screenKey =
    mode === 'cs' ? `cs:${canvasTab}${canvasTab === 'flow' ? `:${activeFlowId}` : ''}` : `ts:${activeFlowId}`;
  const screenLabel =
    mode === 'cs'
      ? canvasTab === 'flow'
        ? `${t('ctFlow')} · ${flowDisplay}`
        : t(TAB_KEY[canvasTab] ?? 'ctFlow')
      : flowDisplay;

  // Reset khi đổi CS/TS hoặc đổi file; divider khi đổi màn trong cùng mode/file.
  const modeRef = useRef(mode);
  const scenarioRef = useRef(scenarioId);
  const screenRef = useRef(screenKey);
  const hasMessages = messages.length > 0;
  useEffect(() => {
    if (modeRef.current !== mode || scenarioRef.current !== scenarioId) {
      resetConversation();
      modeRef.current = mode;
      scenarioRef.current = scenarioId;
      screenRef.current = screenKey;
      return;
    }
    if (screenRef.current !== screenKey) {
      if (hasMessages) pushDivider(screenLabel);
      screenRef.current = screenKey;
    }
  }, [mode, scenarioId, screenKey, screenLabel, hasMessages, resetConversation, pushDivider]);

  const [input, setInput] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const busy = status !== 'idle';

  // Textarea auto-grow tới ~150px rồi cuộn trong ô.
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [input]);

  // Tự cuộn xuống đáy khi có message mới / đang gõ.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Click ra ngoài panel -> đóng (bỏ qua nút toggle ✨ trên thanh công cụ).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('[data-ai-toggle]')) return;
      closePanel();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, closePanel]);

  if (!open) return null;

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    void send(text);
  };

  return (
    <aside
      ref={panelRef}
      className="bk-ai-panel--in flex h-full w-[400px] shrink-0 flex-col border-l border-[var(--bk-border)] bg-[var(--bk-surface)]"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--bk-border)] px-4 py-3">
        <span
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg"
          style={{ color: AI_PURPLE, background: AI_SOFT }}
        >
          <AiSparkleIcon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold text-[var(--bk-text)]">{t('aiChatTitle')}</div>
          <div className="truncate text-[11px] text-[var(--bk-text-muted)]">{t('aiChatSubtitle')}</div>
        </div>
        <button
          type="button"
          onClick={closePanel}
          aria-label={t('close')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
        >
          <Icon icon="lucide:x" width={18} height={18} />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="bk-scroll flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
        {/* Lời chào (tĩnh) */}
        <div className="flex gap-2.5">
          <OpenAiAvatar />
          <div className="rounded-[13px] rounded-tl-[5px] border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--bk-text)]">
            {t('aiChatGreeting')}
          </div>
        </div>

        {messages.map((m) => (
          <MessageRow key={m.id} msg={m} picture={user?.picture} name={user?.name ?? ''} />
        ))}

        {/* Đang suy nghĩ -> spinner 3 chấm */}
        {status === 'thinking' && (
          <div className="flex gap-2.5">
            <OpenAiAvatar />
            <div className="inline-flex items-center rounded-[13px] rounded-tl-[5px] border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3.5 py-2.5 text-[var(--bk-text-muted)]">
              <Icon icon="svg-spinners:3-dots-bounce" width={28} height={16} />
            </div>
          </div>
        )}
      </div>

      {/* Ô nhập */}
      <div className="shrink-0 border-t border-[var(--bk-border)] px-3.5 pb-2 pt-2.5">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2.5 transition focus-within:border-[var(--bk-accent)]">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            placeholder={t('aiChatPlaceholder')}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Gửi = Shift+Enter; Enter (một mình) = xuống dòng.
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="bk-scroll max-h-[150px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-[var(--bk-text)] outline-none placeholder:text-[var(--bk-text-faint)]"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] text-[var(--bk-text-faint)]">
              <kbd className="rounded border border-[var(--bk-border)] bg-[var(--bk-surface)] px-1.5 py-px font-semibold text-[var(--bk-text-muted)]">
                Shift
              </kbd>{' '}
              +{' '}
              <kbd className="rounded border border-[var(--bk-border)] bg-[var(--bk-surface)] px-1.5 py-px font-semibold text-[var(--bk-text-muted)]">
                Enter
              </kbd>{' '}
              {t('aiChatSendSuffix')}
            </span>
            {/* Nút gửi/dừng: CÙNG kiểu — icon xám, hover đổi icon sang tím (không nền). */}
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label={t('aiChatStop')}
                title={t('aiChatStop')}
                className="bk-ai-send flex h-[26px] w-[26px] items-center justify-center rounded-lg"
              >
                <Icon icon="mingcute:square-line" width={16} height={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!input.trim()}
                aria-label={t('aiChatSend')}
                title={t('aiChatSend')}
                className="bk-ai-send flex h-[26px] w-[26px] items-center justify-center rounded-lg disabled:opacity-40"
              >
                <Icon icon="fluent:arrow-enter-left-24-filled" width={16} height={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
