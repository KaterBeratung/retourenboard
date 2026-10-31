// Statische Prüfung der Escaping-Regeln für Markup im Frontend.
//
// Das `html`-Template (frontend/src/i18n.js) escaped eingesetzte Werte nicht selbst:
// Nutzerdaten müssen mit `h()` ausgegeben werden. Dieser Scanner findet jede
// `${…}`-Stelle in `html`…`- und `t`…`-Templates und stuft sie ein. Was nicht
// nachweislich sicher ist, landet in der geprüften Baseline
// (tests/fixtures/html-interpolation-baseline.json).

const BS = String.fromCharCode(92);
const isWord = ch => /[\w$]/.test(ch ?? '');

// Überspringt Zeichenketten und Templates ab `i` (Zeichen an `i` ist das Anführungszeichen).
function skipQuoted(src, i) {
  const quote = src[i];
  if (quote === '`') return skipTemplate(src, i).end;
  i++;
  while (i < src.length && src[i] !== quote) {
    if (src[i] === BS) i++;
    i++;
  }
  return i + 1;
}

// Liest ein Template ab dem öffnenden Backtick. Liefert Ausdrücke samt Position und Endindex.
function skipTemplate(src, start, onTemplate) {
  let j = start - 1;
  while (j >= 0 && /[\w$.]/.test(src[j])) j--;
  const tag = src.slice(j + 1, start);
  let i = start + 1;
  const exprs = [];
  while (i < src.length && src[i] !== '`') {
    if (src[i] === BS) { i += 2; continue; }
    if (src[i] === '$' && src[i + 1] === '{') {
      const from = i + 2;
      const end = scanCode(src, from, true, onTemplate);
      exprs.push({ text: src.slice(from, end), pos: from });
      i = end + 1;
      continue;
    }
    i++;
  }
  onTemplate?.({ tag, exprs, pos: start });
  return { end: i + 1, tag, exprs };
}

// Einfacher JS/TS-Scanner: Kommentare, Zeichenketten, Regex-Literale und verschachtelte Templates.
function scanCode(src, i, stopAtBrace, onTemplate) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === "'" || c === '"') { i = skipQuoted(src, i); continue; }
    if (c === '`') { i = skipTemplate(src, i, onTemplate).end; continue; }
    if (c === '/') {
      let j = i - 1;
      while (j >= 0 && /\s/.test(src[j])) j--;
      const before = src[j];
      if (j < 0 || /[(,=:[!&|?{};+\-*%<>~^]/.test(before) || /(?:return|typeof|case)$/.test(src.slice(Math.max(0, j - 6), j + 1))) {
        i++;
        let inClass = false;
        while (i < src.length) {
          if (src[i] === BS) { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { i++; break; }
          else if (src[i] === '\n') break;
          i++;
        }
        while (/[a-z]/.test(src[i] ?? '')) i++;
        continue;
      }
    }
    if (c === '{') depth++;
    if (c === '}') { if (stopAtBrace && depth === 0) return i; depth--; }
    i++;
  }
  return i;
}

function lineOf(src, pos) {
  let n = 1;
  for (let i = 0; i < pos; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

/** Alle Interpolationen in `html`- und `t`-Templates einer Quelldatei. */
export function scanSource(src, file = 'quelle') {
  const found = [];
  scanCode(src, 0, false, ({ tag, exprs }) => {
    if (tag !== 'html' && tag !== 't') return;
    for (const e of exprs) found.push({ file, line: lineOf(src, e.pos), tag, expr: e.text.replace(/\s+/g, ' ').trim() });
  });
  return found;
}

// --- Einstufung -------------------------------------------------------------

function closingIndex(expr, open) {
  // Index der Klammer, die `(` bei `open` schließt; -1 falls nicht gefunden.
  let depth = 0;
  for (let i = open; i < expr.length; i++) {
    const c = expr[i];
    if (c === "'" || c === '"' || c === '`') { i = skipQuoted(expr, i) - 1; continue; }
    if (c === '(') depth++;
    if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function wholeCall(expr, name) {
  return expr.startsWith(name + '(') && closingIndex(expr, name.length) === expr.length - 1;
}

function wholeTemplate(expr, tag) {
  if (!expr.startsWith(tag + '`')) return false;
  return skipTemplate(expr, tag.length).end === expr.length;
}

// Teilt am obersten Operator (außerhalb von Klammern, Zeichenketten und Templates).
function splitTop(expr, operator) {
  const parts = [];
  let depth = 0, last = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "'" || c === '"' || c === '`') { i = skipQuoted(expr, i) - 1; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && expr.startsWith(operator, i)) {
      if (operator === '?' && (expr[i + 1] === '.' || expr[i + 1] === '?' || expr[i - 1] === '?')) continue;
      if (operator === '|' && (expr[i + 1] === '|' || expr[i - 1] === '|')) continue;
      if (operator === '&' && (expr[i + 1] === '&' || expr[i - 1] === '&')) continue;
      parts.push(expr.slice(last, i));
      last = i + operator.length;
      i += operator.length - 1;
    }
  }
  parts.push(expr.slice(last));
  return parts;
}

function unwrap(expr) {
  while (expr.startsWith('(') && closingIndex(expr, 0) === expr.length - 1) expr = expr.slice(1, -1).trim();
  return expr;
}

const NUMERIC = /^(?:[\w$.?]+\.length|Number\([^)]*\)|\d+(?:\.\d+)?|(?:index|i|n|count|total|page|pages|id)|Math\.\w+\([^)]*\)|[\w$]+\s*[+\-*/]\s*\d+)$/;

/** true, wenn der Ausdruck nachweislich nur Markup aus geprüften Quellen, Literale oder Zahlen liefert. */
export function isSafeExpression(input) {
  const expr = unwrap(String(input).trim());
  if (expr === '') return true;
  if (/^(?:true|false|null|undefined)$/.test(expr)) return true;
  if (/^'[^'\\]*'$|^"[^"\\]*"$/.test(expr)) return true;
  if (wholeCall(expr, 'h') || wholeCall(expr, 'icon')) return true;
  if (wholeTemplate(expr, 'html') || wholeTemplate(expr, 't')) return true;
  if (/^t\((?:'[^'\\]*'|"[^"\\]*")\)$/.test(expr)) return true;
  if (NUMERIC.test(expr)) return true;
  // cond ? a : b — beide Zweige müssen sicher sein
  const ternary = splitTop(expr, '?');
  if (ternary.length > 1) {
    const rest = ternary.slice(1).join('?');
    const branches = splitTop(rest, ':');
    if (branches.length >= 2) return isSafeExpression(branches[0]) && isSafeExpression(branches.slice(1).join(':'));
    return false;
  }
  // a || b, a ?? b — beide Seiten ausgeben können
  const either = splitTop(expr, '||');
  if (either.length > 1) return either.every(isSafeExpression);
  const nullish = splitTop(expr, '??');
  if (nullish.length > 1) return nullish.every(isSafeExpression);
  // cond && x — nur x wird ausgegeben (cond ist `false`/leer)
  const guarded = splitTop(expr, '&&');
  if (guarded.length > 1) return isSafeExpression(guarded[guarded.length - 1]);
  // liste.map(x => html`…`).join('')
  if (/\.join\(\s*(?:''|"")\s*\)$/.test(expr) && /\.map\(\s*(?:\([^)]*\)|[\w$]+)\s*(?::\s*[\w$.<>\[\]]+\s*)?=>\s*(?:html`|icon\(|h\()/.test(expr)) return true;
  return false;
}

/** Fasst alle nicht nachweislich sicheren Interpolationen als `datei|tag|ausdruck` → Anzahl zusammen. */
export function summarizeUnreviewed(items) {
  const counts = {};
  for (const item of items) {
    if (isSafeExpression(item.expr)) continue;
    const key = `${item.file}|${item.tag}|${item.expr}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// --- Zuweisungen von Markup (innerHTML & Co.) ---------------------------------

const SAFE_SINK_START = /^(?:html\s*[`(]|''|""|``|h\()/;

/** Zuweisungen an innerHTML/outerHTML und insertAdjacentHTML-Aufrufe mit nicht offensichtlich sicherem Wert. */
export function scanSinks(src, file = 'quelle') {
  const found = [];
  const add = (sink, value) => {
    const rhs = value.replace(/\s+/g, ' ').trim();
    if (!SAFE_SINK_START.test(rhs)) found.push({ file, sink, rhs: rhs.slice(0, 60) });
  };
  for (const m of src.matchAll(/\.(innerHTML|outerHTML)\s*=\s*([^;\n]{0,140})/g)) add(m[1], m[2]);
  for (const m of src.matchAll(/insertAdjacentHTML\(\s*['"][a-z]+['"]\s*,\s*([^;\n]{0,140})/g)) add('insertAdjacentHTML', m[1]);
  return found;
}

export function summarizeSinks(items) {
  const counts = {};
  for (const item of items) {
    const key = `${item.file}|${item.sink}|${item.rhs}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// --- Verbotene Muster ------------------------------------------------------------

const FORBIDDEN = [
  [/\bdocument\.write(?:ln)?\s*\(/, 'document.write'],
  [/(?:^|[^.\w$])eval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
  [/\bsrcdoc\s*=/, 'srcdoc'],
  [/\s[a-zA-Z][\w-]*=\$\{/, 'Attribut ohne Anführungszeichen (name=${…})'],
  [/<\/?\$\{/, 'Interpolation im Tag-Namen (<${…})'],
  [/\son(?:click|dblclick|error|load|focus|blur|change|input|submit|key\w+|mouse\w+|touch\w+|pointer\w+)\s*=\s*["'$]/, 'Inline-Ereignisattribut'],
  [/javascript:/i, 'javascript:-URL']
];

/** Muster, die im Frontend nie vorkommen dürfen. */
export function scanForbidden(src, file = 'quelle') {
  const found = [];
  const lines = src.split('\n');
  lines.forEach((text, index) => {
    const line = text.replace(/\/\/.*$/, '');
    for (const [pattern, label] of FORBIDDEN) {
      // i18n.js ist die Template-Engine selbst und vergleicht dort Tag-Namen im Quelltext.
      if (file === 'i18n.js' && label.startsWith('Interpolation im Tag-Namen')) continue;
      if (pattern.test(line)) found.push({ file, line: index + 1, label });
    }
  });
  return found;
}
