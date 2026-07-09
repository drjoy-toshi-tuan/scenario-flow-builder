import { useState } from 'react';
import type { FlowNode } from '../ir/types';
import type { PropertyField } from '../ui/nodeSchema';
import { useFlowStore } from '../store/flowStore';
import { useLang, useT, type TKey } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { AiError } from '../ai/openai';
import { explainScript } from '../ai/explain';
import { AiSparkleIcon } from './AiSparkleIcon';
import { AiGenerateModal } from './AiGenerateModal';

// ─────────────────────────────────────────────────────────────────────────────
// Phụ trợ AI cho ô script (Logic) / prompt (OpenAI):
//   - AiGenerateButton: nút "AI Generate" (tím #d946ef, không viền) — đặt ở GÓC
//     TRÊN BÊN PHẢI, cùng hàng với nhãn field (trên ô nhập). Mở modal sinh/sửa.
//   - ScriptExplain (chỉ script): nút ⓘ dưới ô code -> panel giải thích; bật thì
//     icon xanh #22c55e; text lưu ở data.scriptExplanation (theo YAML); nút Regenerate.
// ─────────────────────────────────────────────────────────────────────────────

const AI_PURPLE = '#d946ef';
const EXPLAIN_GREEN = '#22c55e';

// Icon info kiểu icon-park-solid:info (hình tròn đặc + chữ i) — vẽ inline.
function InfoIcon({ size = 15 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2Zm0 5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3Zm0 4.3c-.58 0-1.05.47-1.05 1.05v4.3a1.05 1.05 0 1 0 2.1 0v-4.3c0-.58-.47-1.05-1.05-1.05Z"
      />
    </svg>
  );
}

function aiErrorKey(e: unknown): TKey {
  if (e instanceof AiError && e.code === 'no-key') return 'aiErrNoKey';
  return 'aiErrCall';
}

// ── Nút "AI Generate" (đặt cạnh nhãn field, góc trên bên phải) ────────────────
export function AiGenerateButton({
  node,
  field,
  value,
}: {
  node: FlowNode;
  field: PropertyField;
  value: string;
}) {
  const t = useT();
  const setDraftField = useFlowStore((s) => s.setDraftField);
  const [showModal, setShowModal] = useState(false);
  if (!field.aiGenerate) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="bk-ai-sparkle flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-semibold transition hover:brightness-90"
        style={{ color: AI_PURPLE }}
      >
        <AiSparkleIcon size={16} />
        {t('aiGenerate')}
      </button>
      {showModal && (
        <AiGenerateModal
          kind={field.aiGenerate}
          nodeId={node.id}
          current={value}
          onApply={(text) => setDraftField(field.key, text)}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ── Giải thích code bằng AI (dưới ô script) ──────────────────────────────────
export function ScriptExplain({ value, data }: { value: string; data: Record<string, unknown> }) {
  const t = useT();
  const { lang } = useLang();
  const setDraftField = useFlowStore((s) => s.setDraftField);

  const [showExplain, setShowExplain] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explainErrKey, setExplainErrKey] = useState<TKey | null>(null);

  const explanation = typeof data.scriptExplanation === 'string' ? data.scriptExplanation : '';

  // Regenerate: AI đọc code -> ghi vào draft (LƯU node mới commit vào IR/YAML).
  const regenerate = async () => {
    if (explaining || !value.trim()) return;
    setExplaining(true);
    setExplainErrKey(null);
    try {
      const text = await explainScript(value, lang);
      setDraftField('scriptExplanation', text);
    } catch (e) {
      setExplainErrKey(aiErrorKey(e));
    } finally {
      setExplaining(false);
    }
  };

  return (
    <>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowExplain((v) => !v)}
          title={t('aiExplainShow')}
          aria-label={t('aiExplainShow')}
          aria-expanded={showExplain}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-[var(--bk-surface-2)]"
          style={
            showExplain
              ? { color: EXPLAIN_GREEN, background: `color-mix(in srgb, ${EXPLAIN_GREEN} 14%, transparent)` }
              : { color: 'var(--bk-text-faint)' }
          }
        >
          <InfoIcon size={16} />
        </button>
      </div>

      {showExplain && (
        <div className="mt-2 rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface-2)] p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--bk-text)]">
              <span style={{ color: EXPLAIN_GREEN }} className="flex items-center">
                <InfoIcon size={13} />
              </span>
              {t('aiExplainTitle')}
            </span>
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={explaining || !value.trim()}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                icon={explaining ? 'lucide:loader-circle' : 'lucide:refresh-cw'}
                width={12}
                height={12}
                className={explaining ? 'animate-spin' : ''}
              />
              {explaining ? t('aiGenerating') : t('aiRegenerate')}
            </button>
          </div>
          {explainErrKey && <div className="mb-1.5 text-[11px] text-rose-500">{t(explainErrKey)}</div>}
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[var(--bk-text-muted)]">
            {explanation.trim() ? explanation : t('aiExplainEmpty')}
          </div>
        </div>
      )}
    </>
  );
}
