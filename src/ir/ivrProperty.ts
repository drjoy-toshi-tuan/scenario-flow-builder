import type { FlowIR, FlowNode } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Sinh nội dung "IVR Property" (chỉ để HIỂN THỊ, read-only) từ IR + cấu hình flow.
// Hàm thuần, KHÔNG import React. Nội dung liên động với:
//   - facility / office id / environment (header form)
//   - TTS engine  -> token {tts_g:…} (Google) hoặc {tts_ai:…} (AI Talk)
//   - STT engine  -> khối "# Amivoice" (Amivoice) hoặc "# Soniox"
//   - câu announce của các node trong flow (announce / input / llm)
// ─────────────────────────────────────────────────────────────────────────────

export type IvrEnvironment = 'demo' | 'master';
export type TtsEngine = 'google' | 'aitalk';
export type SttEngine = 'amivoice' | 'soniox';

export interface IvrSettings {
  facilityName: string;
  officeId: string;
  environment: IvrEnvironment;
  ttsEngine: TtsEngine;
  sttEngine: SttEngine;
}

export const DEFAULT_IVR_SETTINGS: IvrSettings = {
  facilityName: '',
  officeId: '',
  environment: 'demo',
  ttsEngine: 'google',
  sttEngine: 'amivoice',
};

// 作成日時 hiển thị theo định dạng yyyy-MM-dd HH:mm (giờ địa phương).
export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

// Tên dùng làm key prompt = tên node (label); fallback về id nếu label rỗng.
function nodeName(node: FlowNode): string {
  const label = typeof node.label === 'string' ? node.label.trim() : '';
  return label || node.id;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

// 1 dòng prompt: <key>.prompt={<token>:<text>}
function promptLine(key: string, text: string, token: string): string {
  return `${key}.prompt={${token}:${text}}`;
}

// Khối cấu hình Amivoice (STT) theo môi trường (chỉ khác host của amivoice.uri).
function amivoiceBlock(env: IvrEnvironment): string {
  const uri = env === 'demo' ? 'ws://10.0.20.11:8000/ws' : 'ws://speech.internal.assistant.com:8000/ws';
  return [
    '# Amivoice',
    `amivoice.uri=${uri}`,
    'amivoice.language=日本語',
    'amivoice.engine=入力汎用',
    'amivoice.keep_filter_token=true',
    'amivoice.silent_detection_ms=2000',
    'amivoice.timeout_ms=30000',
    'amivoice.probability=0.7',
    'amivoice.detection_flag=検出しない',
    'amivoice.save_log=false',
  ].join('\n');
}

// Khối các service URL theo môi trường (Demo dùng famishare, Master dùng drjoy).
function servicesBlock(env: IvrEnvironment): string {
  if (env === 'demo') {
    const base = 'https://demo-reserve.famishare.jp/api/anonymous/dr/ha';
    return [
      '# Save2DB',
      'pbx.db.name=save.db',
      `context.settings.url=${base}/pbx/context-model`,
      '',
      '#Acceptance_times',
      `acceptance_times.url=${base}/incoming-call-by-brekeke`,
      '',
      '# OpenAI',
      `openAI_generate.url=${base}/openai/generate-text`,
      '',
      '# RAG SSML',
      `rag_ssml.url=${base}/rag-ssml/process-text`,
      '',
      '# RAG',
      'speech.rag.url=http://10.0.20.11:8000/api/v1/rag',
      'speech.rag.connect_timeout=2',
      'speech.rag.request_timeout=3',
      'speech.rag.credibility=0',
      '',
      '# Entity Classifier',
      `entity_classifier.url=${base}/brekeke-entity-classification`,
      '',
      '#Intonation',
      `get-intonation-from-drjoy.url=${base}/brekeke-replace-intonation`,
      '',
      '#saveData2DrJOY',
      `drjoy.save.url=${base}/brekeke-booking-ai`,
      '',
      '#Phone2name',
      `phone_2_name.url=${base}/phone-to-name`,
    ].join('\n');
  }
  const base = 'https://reserve.drjoy.jp/api/anonymous/dr/ha';
  return [
    '# Save2DB',
    'pbx.db.name=save.db',
    `context.settings.url=${base}/pbx/context-model`,
    '',
    '#Acceptance_times',
    `acceptance_times.url=${base}/incoming-call-by-brekeke`,
    '',
    '# RAG SSML',
    `rag_ssml.url=${base}/rag-ssml/process-text`,
    '',
    '# OpenAI',
    `openAI_generate.url=${base}/openai/generate-text`,
    '',
    '# RAG',
    'speech.rag.url=http://speech.internal.assistant.com:8000/api/v1/rag',
    'speech.rag.connect_timeout=2',
    'speech.rag.request_timeout=3',
    'speech.rag.credibility=0',
    '',
    '# Entity Classifier',
    `entity_classifier.url=${base}/brekeke-entity-classification`,
    '',
    '#Intonation',
    `get-intonation-from-drjoy.url=${base}/brekeke-replace-intonation`,
    '',
    '#SaveDate2DrJOY',
    `drjoy.save.url=${base}/brekeke-booking-ai`,
    '',
    '#Phone2name',
    `phone_2_name.url=${base}/phone-to-name`,
  ].join('\n');
}

// Các dòng announce sinh từ node trong flow (announce / interaction / openai).
function announceLines(ir: FlowIR, token: string): string[] {
  const lines: string[] = [];
  for (const node of ir.nodes) {
    const name = nodeName(node);
    if (node.type === 'announce') {
      lines.push(promptLine(name, str(node.data.text), token));
    } else if (node.type === 'interaction') {
      lines.push(promptLine(name, str(node.data.announce), token));
      if (node.data.reconfirm === 'yes') {
        lines.push(promptLine(`復唱_${name}`, str(node.data.reconfirmAnnounce), token));
      }
      lines.push(promptLine(`リトライ_${name}`, str(node.data.retryAnnounce), token));
    } else if (node.type === 'openai') {
      lines.push(promptLine(`リトライ_LLM_${name}`, str(node.data.retryAnnounce), token));
    } else if (node.type === 'hangup') {
      // Câu 終話 phát trước khi cúp máy — field mới, flow cũ chưa có nên chỉ ghi khi có nội dung.
      const text = str(node.data.announce);
      if (text.trim()) lines.push(promptLine(name, text, token));
    }
  }
  return lines;
}

// createdAt: thời điểm import file YAML (định dạng yyyy-MM-dd HH:mm) — điền vào 作成日時.
export function buildIvrProperty(ir: FlowIR | null, settings: IvrSettings, createdAt = ''): string {
  const envLabel = settings.environment === 'demo' ? 'デモ' : '本番';
  const token = settings.ttsEngine === 'aitalk' ? 'tts_ai' : 'tts_g';
  const lines = ir ? announceLines(ir, token) : [];

  const sttBlock = settings.sttEngine === 'amivoice' ? amivoiceBlock(settings.environment) : '# Soniox';

  return [
    '# ===== IVRプロパティ =====',
    `# 施設名: ${settings.facilityName}`,
    `# 環境: ${envLabel}`,
    `# 作成日時: ${createdAt}`,
    '',
    '# ==================',
    '#Office ID',
    `office_id=${settings.officeId}`,
    '',
    '# アナウンス',
    ...lines,
    '',
    sttBlock,
    '',
    servicesBlock(settings.environment),
    '',
  ].join('\n');
}
