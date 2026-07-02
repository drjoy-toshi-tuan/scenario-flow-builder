import { useRef, type UIEvent } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Editor code có tô sáng cú pháp — KHÔNG thêm thư viện (tech stack khoá cứng).
// Kỹ thuật: <textarea> trong suốt đặt CHỒNG lên <pre> đã highlight; cuộn đồng bộ.
// Bộ tô sáng là scanner JS tự viết (đủ cho script Brekeke ES2021+): xử lý chú thích,
// chuỗi, template literal, regex literal, số, từ khoá, literal, biến $global, tên hàm,
// truy cập thuộc tính (.prop) và dấu câu — hạn chế "khoảng trắng không màu".
// ─────────────────────────────────────────────────────────────────────────────

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'typeof', 'instanceof', 'in', 'of',
  'this', 'class', 'extends', 'super', 'import', 'from', 'export', 'default', 'try',
  'catch', 'finally', 'throw', 'async', 'await', 'yield', 'void', 'delete', 'with',
  'debugger', 'get', 'set', 'static',
]);
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

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

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

export function CodeEditor({ value, onChange, rows = 12 }: CodeEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);

  // Đồng bộ cuộn: textarea (trên) cuộn -> <pre> highlight (dưới) cuộn theo.
  const onScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = e.currentTarget.scrollTop;
    pre.scrollLeft = e.currentTarget.scrollLeft;
  };

  return (
    <div className="bk-code" style={{ height: `${rows * 1.5 + 1.25}em` }}>
      <pre ref={preRef} className="bk-code-pre" aria-hidden="true">
        <code dangerouslySetInnerHTML={{ __html: highlight(value) }} />
      </pre>
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
  );
}
