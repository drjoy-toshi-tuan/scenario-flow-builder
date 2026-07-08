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
// Modal "AIで生成・修正" cho script (node Logic) / prompt (node OpenAI).
// Bố cục 2 phần:
//   TRÊN (không sửa được): role + bộ chọn node câu hỏi (tự phát hiện, đổi được)
//     + preview announce + ghi chú YAML/code hiện tại sẽ gửi kèm.
//   DƯỚI: ô prompt của người dùng + nút 生成.
// Thành công -> onApply(text) ghi vào draft field rồi đóng modal.
// ─────────────────────────────────────────────────────────────────────────────

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
        questionAnnounce: question?.announce ?? '',
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
  const attachKey: TKey =
    kind === 'script'
      ? current.trim()
        ? 'aiAttachScriptEdit'
        : 'aiAttachScriptNew'
      : current.trim()
        ? 'aiAttachPromptEdit'
        : 'aiAttachPromptNew';

  return (
    <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bk-modal !max-w-[620px]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#8b5cf6_16%,transparent)] text-[#8b5cf6]">
            <AiSparkleIcon size={16} />
          </span>
          {t('aiGenerate')}
        </div>

        {/* ── Phần TRÊN: bối cảnh cố định (không sửa được) ── */}
        <div className="mb-3 space-y-2.5 rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface-2)] p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
            {t('aiContextSection')}
          </div>
          <p className="text-xs leading-relaxed text-[var(--bk-text-muted)]">{t(roleKey)}</p>

          {/* Bộ chọn node câu hỏi (tự phát hiện — đổi lại được nếu sai). */}
          <label className="block">
            <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('aiQuestionNode')}</span>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]"
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

          {/* Preview announce (tự fill từ node đã chọn — read-only). */}
          <div className="block">
            <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('aiAnnounceLabel')}</span>
            <div className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-3 py-2 text-sm leading-relaxed text-[var(--bk-text-muted)]">
              {question?.announce.trim() ? question.announce : t('aiNoAnnounce')}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--bk-text-faint)]">{t(attachKey)}</p>
        </div>

        {/* ── Phần DƯỚI: prompt của người dùng ── */}
        <label className="mb-3 block">
          <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('aiUserPrompt')}</span>
          <textarea
            autoFocus
            className="mt-1 w-full resize-y rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]"
            rows={4}
            value={userPrompt}
            placeholder={t('aiUserPromptPh')}
            onChange={(e) => setUserPrompt(e.target.value)}
          />
        </label>

        {errorKey && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            <Icon icon="lucide:triangle-alert" width={14} height={14} className="mt-0.5 shrink-0" />
            <span>
              {t(errorKey)}
              {errorDetail ? ` (${errorDetail})` : ''}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2">
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
            className="flex items-center gap-2 rounded-lg bg-[#8b5cf6] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Icon icon="lucide:loader-circle" width={15} height={15} className="animate-spin" />
            ) : (
              <AiSparkleIcon size={15} />
            )}
            {busy ? t('aiGenerating') : t('aiGenerateBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
