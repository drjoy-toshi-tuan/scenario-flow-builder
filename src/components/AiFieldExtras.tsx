import { useEffect, useRef, useState } from 'react';
import type { FlowNode } from '../ir/types';
import type { PropertyField } from '../ui/nodeSchema';
import { useFlowStore } from '../store/flowStore';
import { useLang, useT, type TKey } from '../ui/i18n';
import { useToast } from '../ui/toast';
import { Icon } from '../ui/icons';
import { AiError, chatComplete, stripCodeFence } from '../ai/openai';
import { explainScript } from '../ai/explain';
import { AiSparkleIcon } from './AiSparkleIcon';
import { CodeEditor } from './CodeEditor';
import { AiGenerateModal, type AiGenerateRequest } from './AiGenerateModal';

// ─────────────────────────────────────────────────────────────────────────────
// Phụ trợ AI cho ô script (Logic) / prompt (OpenAI):
//   - AiEditableField: nhãn + nút "AI Generate" (góc trên phải) + ô nhập (code/prompt).
//     Bấm Generate ở modal -> modal đóng ngay, ô hiện lớp phủ "AI đang tạo…" (icon lấp
//     lánh) trong lúc gọi OpenAI; có kết quả thì GÕ dần vào ô (typing). Xong script ->
//     tự kích hoạt phần giải thích code.
//   - ScriptExplain (chỉ script): nút ⓘ dưới ô code -> panel giải thích; openSignal đổi
//     -> tự mở panel & 再生成 (dùng sau khi AI gen xong script).
// ─────────────────────────────────────────────────────────────────────────────

const AI_PURPLE = '#d946ef';
const EXPLAIN_GREEN = '#22c55e';
const FIELD_CLASS =
  'w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]';

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
  if (e instanceof AiError) {
    if (e.code === 'no-config') return 'aiErrNoKey';
    if (e.code === 'no-auth' || e.code === 'unauthorized') return 'aiErrAuth';
  }
  return 'aiErrCall';
}

// Gõ dần `text` vào ô theo TỪNG DÒNG một (hiện thêm 1 dòng sau mỗi nhịp) — cảm giác
// AI đang soạn code/prompt chuyên nghiệp, không nhảy hết cùng lúc. Chậm hơn một chút
// so với gõ theo ký tự nhưng "có nhịp". Nhịp mỗi dòng co theo số dòng để flow dài
// không quá lê thê, chặn trong [55ms, 140ms]. isCancelled -> ghi hết ngay & dừng.
function typeInto(
  text: string,
  onChange: (v: string) => void,
  isCancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    if (text.length === 0) {
      onChange('');
      resolve();
      return;
    }
    const lines = text.split('\n');
    const perLine = Math.min(140, Math.max(55, Math.round(3200 / lines.length)));
    let shown = 0;
    const step = () => {
      if (isCancelled()) {
        onChange(text);
        resolve();
        return;
      }
      shown += 1;
      onChange(lines.slice(0, shown).join('\n'));
      if (shown >= lines.length) {
        resolve();
        return;
      }
      window.setTimeout(step, perLine);
    };
    step();
  });
}

// ── Ô nhập script/prompt có AI Generate (nhãn + nút + ô + lớp phủ loading + typing) ──
export function AiEditableField({
  node,
  field,
  value,
  onChange,
  data,
}: {
  node: FlowNode;
  field: PropertyField;
  value: string;
  onChange: (v: string) => void;
  data: Record<string, unknown>;
}) {
  const t = useT();
  const showToast = useToast((s) => s.show);
  const [showModal, setShowModal] = useState(false);
  // idle: bình thường · waiting: đang gọi OpenAI (hiện lớp phủ) · typing: đang gõ chữ.
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'typing'>('idle');
  // Đếm tăng để kích hoạt ScriptExplain tự chạy sau khi gen xong script.
  const [explainSignal, setExplainSignal] = useState(0);
  // Huỷ khi unmount (đổi node/tab) -> không set state / ghi tiếp lên component đã gỡ.
  // Reset false khi mount (kể cả lần remount của StrictMode) để không bị "kẹt huỷ".
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const kind = field.aiGenerate; // 'script' | 'prompt'
  const busy = phase !== 'idle';

  const runGenerate = async (req: AiGenerateRequest) => {
    const prev = value; // giữ nội dung cũ để khôi phục nếu lỗi
    setPhase('waiting');
    onChange(''); // xoá nội dung cũ + hiện lớp phủ loading
    try {
      const result = await chatComplete([
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ]);
      if (cancelledRef.current) return;
      const text = kind === 'script' ? stripCodeFence(result) : result;
      setPhase('typing');
      await typeInto(text, onChange, () => cancelledRef.current);
      if (cancelledRef.current) return;
      setPhase('idle');
      // Script: gen xong -> tự kích hoạt phần giải thích code.
      if (kind === 'script') setExplainSignal((n) => n + 1);
    } catch (e) {
      if (cancelledRef.current) return;
      onChange(prev); // lỗi -> trả lại nội dung cũ (không mất công sức trước đó)
      setPhase('idle');
      showToast(t(aiErrorKey(e)));
    }
  };

  return (
    <div className="block">
      {/* Nhãn + nút "AI Generate" ở góc trên bên phải (trên ô nhập). */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t(field.labelKey)}</span>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={busy}
          className="bk-ai-sparkle flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-semibold transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: AI_PURPLE }}
        >
          <AiSparkleIcon size={16} />
          {t('aiGenerate')}
        </button>
      </div>

      <div className="relative mt-1">
        {field.kind === 'code' ? (
          // AI đang gõ dần (typing/waiting) -> tắt báo lỗi cú pháp: code chưa hoàn chỉnh
          // nên đừng nháy lỗi. Gõ xong (phase idle) hoặc người dùng tự sửa -> lint lại.
          <CodeEditor
            value={value}
            onChange={onChange}
            rows={field.rows ?? 12}
            language={field.language}
            suppressLint={busy}
          />
        ) : (
          <textarea
            className={`${FIELD_CLASS} resize-y`}
            rows={field.rows ?? 3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {/* Lớp phủ loading khi đang chờ OpenAI: icon lấp lánh + "AI đang tạo…". */}
        {phase === 'waiting' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)]">
            <span style={{ color: AI_PURPLE }}>
              <AiSparkleIcon size={30} />
            </span>
            <span className="text-xs font-semibold" style={{ color: AI_PURPLE }}>
              {t('aiGenLoading')}
            </span>
          </div>
        )}
      </div>

      {/* Giải thích code bằng AI (nút info + panel) — chỉ cho script của node Logic. */}
      {kind === 'script' && <ScriptExplain value={value} data={data} openSignal={explainSignal} />}

      {showModal && (
        <AiGenerateModal
          kind={kind!}
          nodeId={node.id}
          current={value}
          onGenerate={(req) => void runGenerate(req)}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ── Giải thích code bằng AI (dưới ô script) ──────────────────────────────────
export function ScriptExplain({
  value,
  data,
  openSignal = 0,
}: {
  value: string;
  data: Record<string, unknown>;
  openSignal?: number;
}) {
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

  // openSignal đổi (sau khi AI gen xong script) -> tự mở panel & 再生成 giải thích.
  useEffect(() => {
    if (openSignal > 0) {
      setShowExplain(true);
      void regenerate();
    }
    // Chỉ chạy khi openSignal đổi; regenerate đọc value hiện tại (script vừa gõ xong).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

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
            {explaining && !explanation.trim()
              ? t('aiGenLoading')
              : explanation.trim()
                ? explanation
                : t('aiExplainEmpty')}
          </div>
        </div>
      )}
    </>
  );
}
