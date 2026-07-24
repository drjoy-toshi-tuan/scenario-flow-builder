import type { FlowIR, ScenarioSettings } from '../ir/types';
import { ensureSettings } from '../ir/settings';
import { buildFlowDigest } from './flowDigest';
import { announceTextOf } from './context';
import { FLOW_TOOLS, ANNOUNCE_TOOLS } from './tools';

// ─────────────────────────────────────────────────────────────────────────────
// Bối cảnh AI THEO TỪNG MÀN. Mỗi màn (CS: Flow Diagram / Announce List / General /
// Status / bảng phụ; TS: Flow Designer) quản lý dữ liệu + spec KHÁC nhau, nên phải
// gửi cho AI: (1) spec riêng, (2) context (dữ liệu) riêng, (3) bộ tool riêng.
// Gửi context giống nhau -> AI hiểu sai màn -> làm sai. File THUẦN (không React).
// ─────────────────────────────────────────────────────────────────────────────

export type WorkMode = 'cs' | 'ts';

export interface ScreenContext {
  screenName: string; // mô tả màn (đưa vào prompt)
  spec: string; // spec/kiến thức riêng của màn
  context: string; // digest dữ liệu liên quan tới màn
  tools: unknown[]; // tool AI được phép dùng ở màn (rỗng = chỉ tư vấn, không sửa)
}

// ── Spec từng màn (hằng — tận dụng prompt caching) ───────────────────────────

function flowSpec(mode: WorkMode): string {
  const base = `SCREEN: Flow Diagram — the node graph of the call flow. You may add/update/remove nodes and connect them with edges (tools provided).
NODE TYPES:
- start: entry (one, main flow only). Never add/remove.
- announce: plays TTS. Wording in data.text.
- interaction: asks caller, collects DTMF/speech. Wording in data.announce.
- nexus: branch by condition. logic/classifier/normalization: logic modules.
- openai: LLM call, prompt in data.prompt. faq / transfer(data.number) / save / jump(data.subflow) / hangup.
RULES:
- Reference existing nodes by the exact id in the context digest.
- Give every new node a unique "ref" in add_node and reuse it as source/target in add_edge.
- ALWAYS wire new nodes into the flow with add_edge; never leave nodes unconnected.
- Decompose multi-step requests into multiple tool calls (several nodes + edges in one turn).
- Never touch the start node; positions are automatic.`;
  const modeNote =
    mode === 'cs'
      ? `\nCS SCREEN NOTE: This is the CS design view. Node labels/wording are Japanese and polite (敬語). Branch conditions on 分岐ロジック are business-friendly; keep labels short and in Japanese.`
      : `\nTS SCREEN NOTE: This is the TS engineering view. Branch conditions/handles map closely to the Brekeke implementation; you may use raw handles/conditions.`;
  return base + modeNote;
}

const ANNOUNCE_SPEC = `SCREEN: Announce List — manages only the SPOKEN WORDING of the flow. You can ONLY edit wording of EXISTING nodes via update_node (announce node → data.text, interaction node → data.announce). Keep caller-facing Japanese natural and polite (敬語). Do NOT add or remove nodes, and do NOT change flow structure on this screen — if the user asks for that, tell them to use the Flow Diagram screen.`;

const GENERAL_SPEC = `SCREEN: General Settings — scenario-wide settings: representative/direct phone, 050 numbers (master/demo), SMS number, working days & hours, rest period, silent-detection seconds, no-answer timeout. No editing tools are available on this screen; help the user by reading/advising and, if they want to change a value, tell them to edit it on this General Settings form.`;

const STATUS_SPEC = `SCREEN: Status Settings — 状態 flags (name + numeric flag; the 7 default ones are fixed) and SMSフラグ (区分 / flag / SMS文言; 送信なし=-2 is fixed). Each SMS message auto-appends a fixed 22-char post-call URL. No editing tools here; advise only and point the user to this form for changes.`;

function synonymSpec(kind: 'clinicalDept' | 'courseList'): string {
  const which = kind === 'clinicalDept' ? '診療科一覧 (Clinical Department List)' : 'コースリスト (Course List)';
  return `SCREEN: ${which} — a table of a main name + its synonyms (類義語), used for speech recognition matching. No editing tools here; advise only and point the user to this table form for changes.`;
}

// ── Context (dữ liệu) từng màn ───────────────────────────────────────────────

function clip(v: unknown, max = 140): string {
  if (typeof v !== 'string') return '';
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Announce List: chỉ node announce/interaction của flow đang mở (id để update_node).
function announceContext(ir: FlowIR): string {
  const rows = ir.nodes
    .filter((n) => n.type === 'announce' || n.type === 'interaction')
    .map((n) => `- ${n.id} [${n.type}] "${n.label}" :: ${clip(announceTextOf(n)) || '(empty)'}`);
  return `ANNOUNCE / INTERACTION NODES (open flow):\n${rows.length ? rows.join('\n') : '- (none)'}`;
}

function daysSummary(s: ScenarioSettings): string {
  return s.workingDays
    .filter((d) => d.enabled)
    .map((d) => `${d.day}=${d.allDay ? '24h' : d.ranges.map((r) => `${r.from}-${r.to}`).join('/') || 'off'}`)
    .join(', ');
}

function generalContext(ir: FlowIR): string {
  const s = ensureSettings(ir.settings);
  return [
    'GENERAL SETTINGS (current values):',
    `- mainPhone: ${s.mainPhone || '(empty)'}`,
    `- master050: ${s.master050 || '(empty)'} · demo050: ${s.demo050 || '(empty)'}`,
    `- smsNumber: ${s.smsNumber || '(empty)'}`,
    `- workingDays: ${daysSummary(s) || '(none)'}`,
    `- restPeriod: ${s.restPeriod || '(none)'}`,
    `- silentDetectionSec: ${s.silentDetectionSec || '(unset)'} · timeoutSec: ${s.timeoutSec || '(unset)'}`,
  ].join('\n');
}

function statusContext(ir: FlowIR): string {
  const s = ensureSettings(ir.settings);
  const statuses = s.statuses.map((x) => `${x.flag}:${x.name}${x.fixed ? '(fixed)' : ''}`).join(', ');
  const sms = s.smsFlags
    .map((x) => `${x.flag}:${x.type}${x.fixed ? '(fixed)' : ''}${x.content ? ` "${clip(x.content, 40)}"` : ''}`)
    .join(', ');
  return `STATUS SETTINGS:\n- 状態: ${statuses || '(none)'}\n- SMSフラグ: ${sms || '(none)'}`;
}

function synonymContext(ir: FlowIR, kind: 'clinicalDept' | 'courseList'): string {
  const s = ensureSettings(ir.settings);
  const rows = (kind === 'clinicalDept' ? s.clinicalDepartments : s.courses) ?? [];
  const lines = rows.map((r) => `- ${r.name || '(empty)'} :: ${r.synonyms.join(', ') || '(no synonyms)'}`);
  return `${kind === 'clinicalDept' ? '診療科一覧' : 'コースリスト'}:\n${lines.length ? lines.join('\n') : '- (empty)'}`;
}

// ── Điều phối: (mode, tab) -> bối cảnh màn ───────────────────────────────────
export function buildScreenContext(
  mode: WorkMode,
  canvasTab: string,
  ir: FlowIR,
  flowName: string,
): ScreenContext {
  // TS: chỉ có Flow Designer (canvas).
  if (mode === 'ts') {
    return {
      screenName: `TS screen · Flow Designer · ${flowName}`,
      spec: flowSpec('ts'),
      context: buildFlowDigest(ir, flowName),
      tools: FLOW_TOOLS,
    };
  }
  // CS: theo tab.
  switch (canvasTab) {
    case 'announce':
      return { screenName: 'CS screen · Announce List', spec: ANNOUNCE_SPEC, context: announceContext(ir), tools: ANNOUNCE_TOOLS };
    case 'general':
      return { screenName: 'CS screen · General Settings', spec: GENERAL_SPEC, context: generalContext(ir), tools: [] };
    case 'status':
      return { screenName: 'CS screen · Status Settings', spec: STATUS_SPEC, context: statusContext(ir), tools: [] };
    case 'clinicalDept':
      return {
        screenName: 'CS screen · Clinical Department List',
        spec: synonymSpec('clinicalDept'),
        context: synonymContext(ir, 'clinicalDept'),
        tools: [],
      };
    case 'courseList':
      return {
        screenName: 'CS screen · Course List',
        spec: synonymSpec('courseList'),
        context: synonymContext(ir, 'courseList'),
        tools: [],
      };
    case 'flow':
    default:
      return {
        screenName: `CS screen · Flow Diagram · ${flowName}`,
        spec: flowSpec('cs'),
        context: buildFlowDigest(ir, flowName),
        tools: FLOW_TOOLS,
      };
  }
}
