import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useFlowStore } from '../store/flowStore';
import { buildIvrProperty, type IvrSettings } from '../ir/ivrProperty';
import { Icon } from '../ui/icons';
import { AiTalkLogo } from '../ui/AiTalkLogo';
import { GoogleTtsLogo } from '../ui/GoogleTtsLogo';
import { AmivoiceLogo } from '../ui/AmivoiceLogo';
import { useT, type TKey } from '../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Modal "Cài đặt IVR Property":
//   - Header: 施設名 + Office ID (text 1 dòng) và 3 lựa chọn (環境 / TTS / STT).
//   - Body: textarea IVR Property READ-ONLY, liên động với các setting + announce.
// ─────────────────────────────────────────────────────────────────────────────

const inputClass =
  'mt-1 w-full rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface-2)] px-3 py-2 text-sm text-[var(--bk-text)] outline-none transition focus:border-[var(--bk-accent)]';

interface OptionDef {
  value: string;
  labelKey: TKey;
  icon: string;
  iconNode?: ReactNode; // logo SVG tuỳ biến (thay cho icon Iconify) nếu có
  color: string; // màu accent khi chọn
}

export function IvrPropertyModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ir = useFlowStore((s) => s.ir);
  const ivr = useFlowStore((s) => s.ivr);
  const setIvr = useFlowStore((s) => s.setIvr);
  const ivrCreatedAt = useFlowStore((s) => s.ivrCreatedAt);

  const text = useMemo(() => buildIvrProperty(ir, ivr, ivrCreatedAt), [ir, ivr, ivrCreatedAt]);

  const envOptions: OptionDef[] = [
    { value: 'demo', labelKey: 'ivrEnvDemo', icon: 'fluent-mdl2:test-beaker-solid', color: '#16a34a' },
    { value: 'master', labelKey: 'ivrEnvMaster', icon: 'material-symbols:contacts-product', color: '#f97316' },
  ];
  const ttsOptions: OptionDef[] = [
    {
      value: 'google',
      labelKey: 'ivrTtsGoogle',
      icon: 'mingcute:voice-fill',
      iconNode: <GoogleTtsLogo width={18} height={15} />,
      color: 'var(--bk-accent)',
    },
    {
      value: 'aitalk',
      labelKey: 'ivrTtsAiTalk',
      icon: 'mingcute:chat-1-ai-fill',
      iconNode: <AiTalkLogo width={16} height={16} />,
      color: 'var(--bk-accent)',
    },
  ];
  const sttOptions: OptionDef[] = [
    {
      value: 'amivoice',
      labelKey: 'ivrSttAmivoice',
      icon: 'mingcute:voice-fill',
      iconNode: <AmivoiceLogo width={18} height={15} />,
      color: 'var(--bk-accent)',
    },
    { value: 'soniox', labelKey: 'ivrSttSoniox', icon: 'noto:letter-s', color: 'var(--bk-accent)' },
  ];

  return (
    <div className="bk-modal-overlay bk-modal-overlay--fixed" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bk-ivr-modal" onClick={(e) => e.stopPropagation()}>
        <header className="bk-ivr-modal-header">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bk-accent-soft)] text-[var(--bk-accent)]">
              <Icon icon="line-md:text-box" width={17} height={17} />
            </span>
            <span className="text-sm font-bold text-[var(--bk-text)]">{t('ivrProperty')}</span>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--bk-border)] bg-[var(--bk-surface)] text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
            onClick={onClose}
            aria-label={t('close')}
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </header>

        <div className="bk-ivr-modal-body">
          {/* Form: 施設名 + Office ID */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('ivrFacility')}</span>
              <input
                type="text"
                className={inputClass}
                placeholder={t('ivrFacilityPlaceholder')}
                value={ivr.facilityName}
                onChange={(e) => setIvr({ facilityName: e.target.value.replace(/[\r\n]+/g, ' ') })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('ivrOfficeId')}</span>
              <input
                type="text"
                className={inputClass}
                placeholder={t('ivrOfficeIdPlaceholder')}
                value={ivr.officeId}
                onChange={(e) => setIvr({ officeId: e.target.value.replace(/[\r\n]+/g, ' ') })}
              />
            </label>
          </div>

          {/* 3 cột: 環境 / TTS / STT — ngăn cách bằng line mảnh, option xếp dọc. */}
          <div className="bk-ivr-configs">
            <ConfigColumn
              label={t('ivrEnvironment')}
              options={envOptions}
              value={ivr.environment}
              onChange={(v) => setIvr({ environment: v as IvrSettings['environment'] })}
            />
            <ConfigColumn
              label={t('ivrTts')}
              options={ttsOptions}
              value={ivr.ttsEngine}
              onChange={(v) => setIvr({ ttsEngine: v as IvrSettings['ttsEngine'] })}
            />
            <ConfigColumn
              label={t('ivrStt')}
              options={sttOptions}
              value={ivr.sttEngine}
              onChange={(v) => setIvr({ sttEngine: v as IvrSettings['sttEngine'] })}
            />
          </div>

          {/* IVR Property — read-only + tô sáng cú pháp; liên động setting + announce. */}
          <div className="block">
            <span className="text-xs font-medium text-[var(--bk-text-muted)]">{t('ivrPropertyText')}</span>
            <pre className="bk-ivr-code">
              {text.split('\n').map((line, i) => (
                <IvrLine key={i} line={line} />
              ))}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tô sáng cú pháp 1 dòng IVR Property (read-only) ──────────────────────────
//   - dòng bắt đầu bằng '#'         -> comment
//   - dòng key=value               -> key (property) · '=' · value (string)
//   - value dạng {tts_g:…}/{tts_ai:…} -> tô token trong ngoặc nhọn
function IvrLine({ line }: { line: string }) {
  if (line.trim() === '') return <div className="bk-ivr-ln">{'\n'}</div>;

  // Comment nguyên dòng.
  if (line.trimStart().startsWith('#')) {
    return (
      <div className="bk-ivr-ln">
        <span className="tok-comment">{line}</span>
      </div>
    );
  }

  const eq = line.indexOf('=');
  if (eq === -1) {
    return <div className="bk-ivr-ln">{line}</div>;
  }

  const key = line.slice(0, eq);
  const value = line.slice(eq + 1);

  return (
    <div className="bk-ivr-ln">
      <span className="tok-property">{key}</span>
      <span className="tok-punct">=</span>
      {renderValue(value)}
    </div>
  );
}

// value: tô sáng token {tts_g:…} / {tts_ai:…}; còn lại coi như chuỗi.
function renderValue(value: string) {
  const m = value.match(/^\{(tts_g|tts_ai):([\s\S]*)\}$/);
  if (m) {
    return (
      <>
        <span className="tok-punct">{'{'}</span>
        <span className="tok-keyword">{m[1]}</span>
        <span className="tok-punct">:</span>
        <span className="tok-string">{m[2]}</span>
        <span className="tok-punct">{'}'}</span>
      </>
    );
  }
  return <span className="tok-string">{value}</span>;
}

// 1 cột cấu hình: nhãn trên cùng + các option xếp DỌC (compact).
function ConfigColumn({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: OptionDef[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  return (
    <div className="bk-ivr-col">
      <span className="bk-ivr-col-label">{label}</span>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`bk-ivr-opt ${on ? 'bk-ivr-opt--on' : ''}`}
            style={{ '--optc': o.color } as CSSProperties}
          >
            {o.iconNode ?? <Icon icon={o.icon} width={16} height={16} />}
            <span>{t(o.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
