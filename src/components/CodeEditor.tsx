import { useMemo, useRef, type UIEvent } from 'react';
import { Icon } from '../ui/icons';
import { lintFor } from '../ui/scriptLint';

// ─────────────────────────────────────────────────────────────────────────────
// Editor code có tô sáng cú pháp — KHÔNG thêm thư viện (tech stack khoá cứng).
// Kỹ thuật: <textarea> trong suốt đặt CHỒNG lên lớp highlight; cuộn đồng bộ bằng
// transform. Bổ sung kiểu VS Code: cột số dòng (gutter), đường dẫn thụt lề
// (indent guides) nối các khối {}, và báo lỗi cú pháp trực tiếp dưới editor.
// Bộ tô sáng là scanner JS tự viết (đủ cho script Brekeke ES2021+): xử lý chú thích,
// chuỗi, template literal, regex literal, số, từ khoá, literal, biến $global, tên hàm,
// hàm/đối tượng dựng sẵn (JSON/Math/logger…), truy cập thuộc tính (.prop) và dấu câu.
// ─────────────────────────────────────────────────────────────────────────────

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'typeof', 'instanceof', 'in', 'of',
  'this', 'class', 'extends', 'super', 'import', 'from', 'export', 'default', 'try',
  'catch', 'finally', 'throw', 'async', 'await', 'yield', 'void', 'delete', 'with',
  'debugger', 'get', 'set', 'static',
]);
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
// Hàm/đối tượng dựng sẵn + host phổ biến trong script Brekeke -> tô như $global,
// tránh để trắng như biến thường (JSON, Math, logger, console…).
const BUILTINS = new Set([
  'JSON', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp',
  'Map', 'Set', 'Promise', 'Symbol', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'console', 'logger',
]);

const TAB_SIZE = 2;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentPart = (c: string) => /[\w$]/.test(c);
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';

const NUM_RE = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/;

function highlight(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  // prevValue: token trước có "kết thúc 1 giá trị" không -> quyết định `/` là chia hay regex.
  let prevValue = false;
  let prevText = '';

  const push = (cls: string, text: string) => {
    out += cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text);
  };

  while (i < n) {
    const c = code[i];

    // Khoảng trắng
    if (isSpace(c)) {
      let j = i + 1;
      while (j < n && isSpace(code[j])) j++;
      out += escapeHtml(code.slice(i, j));
      i = j;
      continue;
    }

    // Chú thích 1 dòng
    if (c === '/' && code[i + 1] === '/') {
      let j = i + 2;
      while (j < n && code[j] !== '\n') j++;
      push('tok-comment', code.slice(i, j));
      i = j;
      prevValue = false;
      prevText = '';
      continue;
    }

    // Chú thích khối / JSDoc
    if (c === '/' && code[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(code[j] === '*' && code[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      push('tok-comment', code.slice(i, j));
      i = j;
      prevValue = false;
      prevText = '';
      continue;
    }

    // Chuỗi ' " ` (template literal xử lý như chuỗi cho đơn giản)
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === c) { j++; break; }
        j++;
      }
      push('tok-string', code.slice(i, j));
      i = j;
      prevValue = true;
      prevText = '';
      continue;
    }

    // Regex literal (chỉ khi vị trí cho phép biểu thức, không phải phép chia)
    if (c === '/' && !prevValue) {
      let j = i + 1;
      let inClass = false;
      let ok = true;
      while (j < n) {
        const d = code[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '\n') { ok = false; break; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { j++; break; }
        j++;
      }
      if (ok) {
        while (j < n && /[a-z]/i.test(code[j])) j++; // cờ (g, i, m, …)
        push('tok-regex', code.slice(i, j));
        i = j;
        prevValue = true;
        prevText = '';
        continue;
      }
    }

    // Số
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(code[i + 1] ?? ''))) {
      const m = NUM_RE.exec(code.slice(i));
      if (m) {
        push('tok-number', m[0]);
        i += m[0].length;
        prevValue = true;
        prevText = '';
        continue;
      }
    }

    // Định danh / từ khoá
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(code[j])) j++;
      const word = code.slice(i, j);
      // Nhìn tới trước: bỏ qua khoảng trắng -> nếu gặp '(' thì đây là lời gọi hàm.
      let k = j;
      while (k < n && isSpace(code[k])) k++;
      const isCall = code[k] === '(';
      const afterDot = prevText === '.';

      let cls: string;
      if (KEYWORDS.has(word)) cls = 'tok-keyword';
      else if (LITERALS.has(word)) cls = 'tok-literal';
      else if (word[0] === '$') cls = isCall ? 'tok-function' : 'tok-global';
      else if (afterDot) cls = isCall ? 'tok-method' : 'tok-property';
      else if (BUILTINS.has(word)) cls = isCall ? 'tok-function' : 'tok-global';
      else if (isCall) cls = 'tok-function';
      else cls = 'tok-identifier';

      push(cls, word);
      i = j;
      // literal & định danh là "giá trị"; từ khoá thì không (regex có thể theo sau).
      prevValue = !KEYWORDS.has(word) || LITERALS.has(word);
      prevText = word;
      continue;
    }

    // Dấu câu / toán tử
    push('tok-punct', c);
    prevValue = c === ')' || c === ']';
    prevText = c;
    i++;
  }

  // Ký tự cuối là newline / rỗng -> thêm khoảng trắng để dòng cuối vẫn cao đúng.
  return out + (code.endsWith('\n') || code === '' ? ' ' : '');
}

interface IndentGuide {
  row: number; // dòng (0-based)
  col: number; // cột bắt đầu vẽ đường (số ký tự)
}

// Tính đường dẫn thụt lề cho từng dòng: mỗi cấp thụt lề -> 1 đường dọc, nối liền
// qua các dòng trống trong cùng khối (giống VS Code).
function computeGuides(lines: string[]): { guides: IndentGuide[] } {
  const info = lines.map((l) => {
    let cols = 0;
    for (const ch of l) {
      if (ch === ' ') cols += 1;
      else if (ch === '\t') cols += TAB_SIZE;
      else break;
    }
    return { blank: l.trim() === '', cols };
  });

  // Dòng trống: kế thừa mức thụt lề nhỏ hơn giữa dòng liền trước & liền sau (không rỗng)
  // để đường guide chạy xuyên qua khoảng trống trong khối.
  const cols = info.map((x) => x.cols);
  for (let i = 0; i < info.length; i++) {
    if (!info[i].blank) continue;
    let p = i - 1;
    while (p >= 0 && info[p].blank) p--;
    let nx = i + 1;
    while (nx < info.length && info[nx].blank) nx++;
    const pv = p >= 0 ? cols[p] : 0;
    const nv = nx < info.length ? info[nx].cols : 0;
    cols[i] = Math.min(pv, nv);
  }

  // Đơn vị thụt lề = mức thụt lề dương nhỏ nhất trong file (2 hay 4 space đều đúng).
  let unit = Infinity;
  for (const x of info) if (!x.blank && x.cols > 0) unit = Math.min(unit, x.cols);
  if (!Number.isFinite(unit) || unit < 1) unit = TAB_SIZE;

  const guides: IndentGuide[] = [];
  for (let row = 0; row < cols.length; row++) {
    for (let col = unit; col < cols[row]; col += unit) {
      guides.push({ row, col });
    }
  }
  return { guides };
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  // 'js' (mặc định) lint bằng new Function; 'json' lint bằng JSON.parse.
  // Bộ tô sáng dùng chung (scanner JS xử lý chuỗi/số/dấu câu của JSON ổn).
  language?: 'js' | 'json';
  // Tạm TẮT kiểm tra cú pháp (vd khi AI đang gõ dần code) — code chưa hoàn chỉnh
  // nên đừng nháy báo lỗi liên tục; lint lại bình thường khi gõ xong / người dùng tự gõ.
  suppressLint?: boolean;
}

export function CodeEditor({ value, onChange, rows = 18, language = 'js', suppressLint = false }: CodeEditorProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => value.split('\n'), [value]);
  const { guides } = useMemo(() => computeGuides(lines), [lines]);
  const html = useMemo(() => highlight(value), [value]);
  const error = useMemo(() => (suppressLint ? null : lintFor(language, value)), [language, value, suppressLint]);

  // Đồng bộ cuộn: textarea (trên) cuộn -> lớp highlight + gutter dịch theo (transform).
  const onScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (layerRef.current) {
      layerRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    }
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translateY(${-scrollTop}px)`;
    }
  };

  return (
    <div className="bk-code-wrap">
      <div className="bk-code" style={{ height: `calc(${rows} * 1.5em + 20px)` }}>
        <div className="bk-code-gutter" aria-hidden="true">
          <div className="bk-code-gutter-inner" ref={gutterRef}>
            {lines.map((_, i) => (
              <div key={i} className="bk-code-lnum">
                {i + 1}
              </div>
            ))}
          </div>
        </div>
        <div className="bk-code-main">
          <div className="bk-code-layer" ref={layerRef} aria-hidden="true">
            <div className="bk-code-guides">
              {guides.map((g, idx) => (
                <span
                  key={idx}
                  className="bk-code-guide"
                  style={{
                    top: `calc(10px + ${g.row * 1.5}em)`,
                    left: `calc(12px + ${g.col}ch)`,
                  }}
                />
              ))}
            </div>
            <pre className="bk-code-pre">
              <code dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
          </div>
          <textarea
            className="bk-code-ta"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={onScroll}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
          />
        </div>
      </div>
      {error && (
        <div className="bk-code-error" role="alert">
          <Icon icon="lucide:circle-alert" width={14} height={14} className="flex-none" />
          <span>
            {error.line != null ? `Dòng ${error.line}: ` : ''}
            {error.message}
          </span>
        </div>
      )}
    </div>
  );
}
