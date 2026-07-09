import { useMemo, useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import {
  buildGenerateSystemPrompt,
  detectQuestionNodeId,
  questionCandidates,
  type GenerateKind,
} from '../ai/context';
import { AiError, chatComplete, stripCodeFence } from '../ai/openai';
import { useT, type TKey } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { AiSparkleIcon } from './AiSparkleIcon';

// ─────────────────────────────────────────────────────────────────────────────
// Modal "AI Generate" cho script (node Logic) / prompt (node OpenAI).
// Bố cục:
//   1. Chọn node câu hỏi (Announce/Interaction) — trên cùng, tự phát hiện, đổi được.
//   2. Ô bối cảnh read-only dạng #Role / #Question Context (announce tự fill +
//      highlight để thấy nó liên động khi đổi node).
//   3. Ô chỉ thị của người dùng (phần chính) + nút 生成.
// Modal cao tối đa 88vh, thân cuộn được -> kéo textarea cao vẫn không đẩy footer.
// Màu chủ đạo tím #d946ef (đồng bộ với nút AI Generate).
// ─────────────────────────────────────────────────────────────────────────────

const AI_PURPLE = '#d946ef';

interface AiGenerateModalProps {
  kind: GenerateKind;
  nodeId: string; // node logic/openai đang sửa
  current: string; // code/prompt hiện có trong draft
  onApply: (text: string) => void;
  onClose: () => void;
}

function aiErrorKey(e: unknown): TKey {
  if (e instanceof AiError && e.code === 'no-key') return 'aiErrNoKey';
  return 'aiErrCall';
}

export function AiGenerateModal({ kind, nodeId, current, onApply, onClose }: AiGenerateModalProps) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const exportYaml = useFlowStore((s) => s.exportYaml);
  // Tài liệu đầy đủ (main + sub flow) — ứng viên câu hỏi lấy xuyên flow.
  const doc = useMemo(() => useFlowStore.getState().assembleDoc(), [ir]); // eslint-disable-line react-hooks/exhaustive-deps
  const candidates = useMemo(() => questionCandidates(doc), [doc]);

  // Node câu hỏi: tự phát hiện (nối trực tiếp hoặc qua nexus) — người dùng đổi được.
  const [questionId, setQuestionId] = useState<string>(() => detectQuestionNodeId(doc, nodeId) ?? '');
  const question = candidates.find((c) => c.id === questionId) ?? null;
  const announce = question?.announce.trim() ?? '';

  const [userPrompt, setUserPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TKey | null>(null);
  const [errorDetail, setErrorDetail] = useState('');

  const handleGenerate = async () => {
    if (busy || !userPrompt.trim()) return;
    setBusy(true);
    setErrorKey(null);
    try {
      const system = buildGenerateSystemPrompt(kind, {
        yaml: exportYaml(),
        questionAnnounce: announce,
        current,
      });
      const result = await chatComplete([
        { role: 'system', content: system },
        { role: 'user', content: userPrompt.trim() },
      ]);
      onApply(kind === 'script' ? stripCodeFence(result) : result);
      onClose();
    } catch (e) {
      setErrorKey(aiErrorKey(e));
      setErrorDetail(e instanceof AiError && e.code !== 'no-key' ? e.message : '');
      setBusy(false);
    }
  };

  const roleKey: TKey = kind === 'script' ? 'aiRoleScript' : 'aiRolePrompt';

  return (
    <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={onClose}>
      {/* Flex-col + max-h: thân cuộn, footer luôn cố định (không bị textarea đẩy khỏi màn hình). */}
      <div
        className="flex max-h-[88vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-[var(--bk-border)] bg-[var(--bk-surface)] shadow-[var(--bk-shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--bk-border)] px-5 py-3.5 text-sm font-bold text-[var(--bk-text)]">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ color: AI_PURPLE, background: `color-mix(in srgb, ${AI_PURPLE} 16%, transparent)` }}
          >
            <AiSparkleIcon size={18} />
          </span>
          {t('aiGenerate')}
        </div>

        {/* Thân cuộn được */}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {/* 1. Node câu hỏi (trên cùng) */}
          <label className="block">
            <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('aiQuestionNode')}</span>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]"
              value={questionId}
              onChange={(e) => setQuestionId(e.target.value)}
            >
              <option value="">{t('aiQuestionNodeNone')}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.label} — ${c.flowName}`}
                </option>
              ))}
            </select>
          </label>

          {/* 2. Bối cảnh read-only: #Role / #Question Context (announce tự fill + highlight) */}
          <div className="rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface-2)] p-3 text-xs leading-relaxed">
            <div className="font-mono font-bold text-[var(--bk-text-muted)]">#Role</div>
            <p className="mb-2 mt-0.5 text-[var(--bk-text-muted)]">{t(roleKey)}</p>
            <div className="font-mono font-bold text-[var(--bk-text-muted)]">#Question Context</div>
            <div className="mt-1">
              {announce ? (
                // Highlight (nền tím nhạt) để thấy nội dung liên động theo node đã chọn.
                <span
                  className="whitespace-pre-wrap rounded px-1.5 py-0.5 font-medium text-[var(--bk-text)]"
                  style={{ background: `color-mix(in srgb, ${AI_PURPLE} 16%, transparent)` }}
                >
                  {announce}
                </span>
              ) : (
                <span className="italic text-[var(--bk-text-faint)]">{t('aiContextNone')}</span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-[var(--bk-text-faint)]">{t('aiContextHint')}</p>
          </div>

          {/* 3. Chỉ thị của người dùng (phần chính) */}
          <label className="block">
            <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('aiUserPrompt')}</span>
            <textarea
              autoFocus
              className="mt-1 max-h-[40vh] w-full resize-y rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]"
              rows={5}
              value={userPrompt}
              placeholder={t('aiUserPromptPh')}
              onChange={(e) => setUserPrompt(e.target.value)}
            />
          </label>

          {errorKey && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              <Icon icon="lucide:triangle-alert" width={14} height={14} className="mt-0.5 shrink-0" />
              <span>
                {t(errorKey)}
                {errorDetail ? ` (${errorDetail})` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Footer cố định */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--bk-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
          >
            {t('btnCancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy || !userPrompt.trim()}
            className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: AI_PURPLE }}
          >
            {busy ? (
              <Icon icon="lucide:loader-circle" width={16} height={16} className="animate-spin" />
            ) : (
              <AiSparkleIcon size={16} />
            )}
            {busy ? t('aiGenerating') : t('aiGenerateBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
