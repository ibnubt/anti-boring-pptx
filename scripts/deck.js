#!/usr/bin/env node
/* pptx-varied-deck renderer — deck.json -> fully editable .pptx
 *
 *   node deck.js <deck.json> <out.pptx> [--force] [--no-charts]
 *
 * One JSON file describes the deck: a layout per slide plus its fields (reference/layouts.md).
 * This script draws it with pptxgenjs and lints it first: text that does not fit its box,
 * text boxes that overlap, a slide without speaker notes, the same layout twice in a row,
 * a chart without its condition, a table that is too big. Lint errors stop the build
 * (--force writes the file anyway). --no-charts replaces native charts with a box, to find
 * out whether a chart is what stops PowerPoint from exporting the file.
 *
 * To add a layout: write L['name'] = async (s, sl) => {...} with the helpers below, give it a
 * TONE entry, and document it in reference/layouts.md.
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');

/* Dependencies may live next to this skill or in the project folder. */
function req(name) {
  const from = [null, path.join(process.cwd(), 'x.js'), path.join(__dirname, '..', 'x.js')];
  for (const f of from) {
    try { return f ? Module.createRequire(f)(name) : require(name); } catch (e) { /* next */ }
  }
  return null;
}
const PptxGenJS = req('pptxgenjs');
if (!PptxGenJS) { console.error('pptxgenjs not found. Run once:  cd <skill folder> && npm install'); process.exit(2); }
const React = req('react');
const RDS = req('react-dom/server');
const fa = req('react-icons/fa');
const sharp = req('sharp');
const ot = req('opentype.js');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const FLAG = f => process.argv.includes(f);
if (args.length < 2) { console.error('usage: node deck.js <deck.json> <out.pptx> [--force] [--no-charts]'); process.exit(2); }
const SRC = path.resolve(args[0]);
const OUT = path.resolve(args[1]);
const DIR = path.dirname(SRC);
let deck;
try { deck = JSON.parse(fs.readFileSync(SRC, 'utf8')); } catch (e) { console.error('cannot read ' + SRC + ': ' + e.message); process.exit(2); }
const slides = deck.slides || [];
const TOTAL = slides.length;
const B = deck.brand || {};

/* ------------------------------------------------------------- palette */
function mix(a, b, t) {
  const p = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const hex = v => String(v || '').replace('#', '').toUpperCase();
const bc = B.colors || {};
const PRIMARY = hex(bc.primary) || '0E2A3B';
const ACCENT = hex(bc.accent) || '157A57';
const WARN = hex(bc.warn) || 'E8A33C';
const C = {
  deep: PRIMARY, deep2: mix(PRIMARY, 'FFFFFF', 0.08), deepLine: mix(PRIMARY, 'FFFFFF', 0.24), deepest: mix(PRIMARY, '000000', 0.28),
  accent: ACCENT, accentTint: mix(ACCENT, 'FFFFFF', 0.87), accentLight: mix(ACCENT, 'FFFFFF', 0.5),
  warn: WARN, warnTint: mix(WARN, 'FFFFFF', 0.82), warnDark: mix(WARN, '000000', 0.52),
  tint: hex(bc.tint) || mix(ACCENT, 'FFFFFF', 0.91),
  ink: '1F2D38', muted: '5B6B76', source: '6B7C87', paper: 'FBFCFB', white: 'FFFFFF', line: 'D9E3DE',
  grey: 'EEF1F0', greyLine: 'C9D3CE', idle: '8494A0',
  onDark: mix(PRIMARY, 'FFFFFF', 0.8), onDark2: mix(PRIMARY, 'FFFFFF', 0.58),
};
const SERIES = [C.accent, C.deep, C.warn, C.accentLight, C.muted, C.warnDark];
const FONT = { d: (B.fonts && B.fonts.head) || 'Arial', b: (B.fonts && B.fonts.body) || 'Arial', m: 'Courier New' };
const LANG = (deck.meta && deck.meta.lang) || 'en-US';
/* Words the renderer supplies itself follow the deck language; override any of them in meta.labels. */
const LBL = Object.assign(/^id/i.test(LANG)
  ? { illustration: 'ILUSTRASI · ANGKA CONTOH', takeaway: 'Yang terlihat', result: 'Hasil:', image: 'gambar' }
  : { illustration: 'ILLUSTRATION · EXAMPLE DATA', takeaway: 'What it shows', result: 'Result:', image: 'image' },
  (deck.meta && deck.meta.labels) || {});

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.title = (deck.meta && deck.meta.title) || path.basename(OUT, '.pptx');
pptx.author = (deck.meta && deck.meta.author) || '';
pptx.company = B.name || '';
pptx.theme = { headFontFace: FONT.d, bodyFontFace: FONT.b };

const W = 13.333, H = 7.5, L = 0.6, R = W - 0.6, CW = R - L, TOP = 1.72;

/* ------------------------------------------------------------- font metrics (for lint) */
const faces = {};
(function loadFaces() {
  if (!ot || process.env.DECK_NO_FONTS) return;
  const sets = [
    ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
    ['/Library/Fonts/Arial.ttf', '/Library/Fonts/Arial Bold.ttf'],
    ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'],
    ['/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'],
    ['/usr/share/fonts/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/liberation/LiberationSans-Bold.ttf'],
    ['/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf', '/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf'],
    ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  ];
  for (const [r, b] of sets) {
    try {
      const load = f => { const buf = fs.readFileSync(f); return ot.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); };
      faces.r = load(r); faces.b = load(b); return;
    } catch (e) { /* try the next set */ }
  }
})();
function wText(str, bold, sz, cs = 0, mono = false) {
  if (mono) return (str.length * sz * 0.6 + cs * str.length) / 72;
  if (!faces.r) return (str.length * sz * (bold ? 0.56 : 0.52) + cs * str.length) / 72; // estimate without font files
  return ((bold ? faces.b : faces.r).getAdvanceWidth(str, sz) + cs * str.length) / 72;
}
function wrap(runs, boxW, indent) {
  const paras = [[]];
  runs.forEach(r => {
    r.t.split('\n').forEach((part, i) => { if (i > 0) paras.push([]); paras[paras.length - 1].push({ ...r, t: part }); });
    if (r.br) paras.push([]);
  });
  if (paras[paras.length - 1].length === 0 && paras.length > 1) paras.pop();
  let lines = 0, maxW = 0, wide = null;
  const avail = (boxW - indent) * 0.98;
  paras.forEach(p => {
    const words = [];
    let w = 0, open = false;
    p.forEach(r => r.t.split(/(\s+)/).forEach(tok => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) { if (open) { words.push(w); w = 0; open = false; } words.push({ sp: wText(' ', r.b, r.sz, r.cs, r.f === 'm') }); return; }
      w += wText(tok, r.b, r.sz, r.cs, r.f === 'm'); open = true;
    }));
    if (open) words.push(w);
    let lineW = 0, pend = 0, n = 1;
    words.forEach(x => {
      if (typeof x === 'object') { pend = x.sp; return; }
      if (x > avail) wide = x;
      if (lineW > 0 && lineW + pend + x > avail) { maxW = Math.max(maxW, lineW); n += 1; lineW = x; }
      else lineW += (lineW > 0 ? pend : 0) + x;
      pend = 0;
    });
    maxW = Math.max(maxW, lineW);
    lines += n;
  });
  return { lines, maxW: maxW + indent, wide };
}

/* ------------------------------------------------------------- lint state */
const LINT = { slides: [], errors: [], warns: [], placeholders: [] };
let cur = null;
const err = m => LINT.errors.push(`${cur ? cur.id : 'deck'} — ${m}`);
const warn = m => LINT.warns.push(`${cur ? cur.id : 'deck'} — ${m}`);

/* ------------------------------------------------------------- drawing helpers */
/** Text box. content: string | runs [{t, b, c, sz, f, br, bullet}].
 *  o: f ('d' head | 'b' body | 'm' mono), sz, c, b, al, va, ls, cs, pa, one (single line), fit [max, min], ov (may overlap). */
function T(s, content, x, y, w, h, o = {}) {
  if (content === undefined || content === null || content === '') return;
  const raw = Array.isArray(content) ? content : [{ t: content }];
  const build = size => raw.map(r => {
    const f = r.f || o.f || 'b';
    return { t: String(r.t), f, sz: r.sz || size, c: r.c || o.c || C.ink, b: f === 'd' ? true : (r.b !== undefined ? r.b : !!o.b), cs: r.cs || o.cs || 0, br: !!r.br, bullet: !!r.bullet };
  });
  const measure = size => {
    const runs = build(size);
    const maxSz = Math.max(...runs.map(r => r.sz));
    const ls = o.ls ? o.ls * (size / (o.sz || size)) : Math.round(maxSz * ((o.f || 'b') === 'd' ? 1.16 : 1.26) * 10) / 10;
    const m = wrap(runs, w, runs.some(r => r.bullet) ? 0.2 : 0);
    const gaps = o.pa ? (runs.filter(r => r.br).length * o.pa) / 72 : 0;
    return { runs, ls, m, needH: (m.lines * ls) / 72 + gaps, maxSz };
  };
  let size = o.sz || 12;
  let res = measure(size);
  if (o.fit) {
    for (size = o.fit[0]; size >= o.fit[1]; size -= 0.5) {
      res = measure(size);
      if (!res.m.wide && res.needH <= h + 0.03 && !(o.one && res.m.lines > 1)) break;
    }
    if (size < o.fit[1]) { size = o.fit[1]; res = measure(size); }
  }
  const { runs, ls, m, needH, maxSz } = res;
  const out = runs.map(r => {
    const opt = { fontFace: FONT[r.f], fontSize: r.sz, color: r.c, bold: r.b, breakLine: r.br, lang: LANG };
    if (r.cs) opt.charSpacing = r.cs;
    if (r.bullet) opt.bullet = { indent: 14 };
    if (o.pa) opt.paraSpaceAfter = o.pa;
    return { text: r.t, options: opt };
  });
  const box = { x, y, w, h, margin: 0, align: o.al || 'left', valign: o.va || 'top', lineSpacing: ls, fit: 'none' };
  s.addText(out, box);
  const all = runs.map(r => r.t).join(' ');
  const id = `"${all.slice(0, 44)}"`;
  if (m.wide) err(`${id}: one word is wider than its box — use a shorter word`);
  if (o.one && m.lines > 1) err(`${id}: must fit on one line — shorten it by about ${Math.ceil(all.length * (1 - 1 / m.lines))} characters`);
  else if (needH > h + 0.03) err(`${id}: text is too long for its box — shorten it by about ${Math.ceil(all.length * (1 - h / needH))} characters`);
  if (maxSz < 8.5) warn(`${id}: font ${maxSz} pt is hard to read`);
  if (/\[[^\]]{1,40}\]/.test(all)) LINT.placeholders.push(`${cur.id}: ${all.match(/\[[^\]]{1,40}\]/)[0]}`);
  const ew = Math.min(m.maxW, w), eh = Math.min(needH, h);
  const ex = box.align === 'center' ? x + (w - ew) / 2 : box.align === 'right' ? x + w - ew : x;
  const ey = box.valign === 'middle' ? y + (h - eh) / 2 : box.valign === 'bottom' ? y + h - eh : y;
  if (ex < -0.01 || ey < -0.01 || ex + ew > W + 0.01 || ey + eh > H + 0.01) err(`${id}: outside the slide`);
  cur.texts.push({ id, ex, ey, ew, eh, ov: !!o.ov });
}
function shape(s, type, x, y, w, h, o = {}) {
  const sh = { x, y, w, h };
  if (o.fill) sh.fill = { color: o.fill };
  if (o.line) sh.line = { color: o.line, width: o.lw || 1, dashType: o.dash };
  if (o.r !== undefined) sh.rectRadius = o.r;
  s.addShape(type, sh);
}
const rect = (s, x, y, w, h, o) => shape(s, 'rect', x, y, w, h, o);
const rrect = (s, x, y, w, h, o = {}) => shape(s, 'roundRect', x, y, w, h, { r: 0.08, ...o });
const circle = (s, x, y, d, o) => shape(s, 'ellipse', x, y, d, d, o);
function arrow(s, x1, y1, x2, y2, o = {}) {
  s.addShape('line', {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipH: x2 < x1, flipV: y2 < y1,
    line: { color: o.c || C.accent, width: o.w || 1.75, endArrowType: o.head === false ? undefined : 'triangle', dashType: o.dash },
  });
}
const seg = (s, x1, y1, x2, y2, o = {}) => arrow(s, x1, y1, x2, y2, { ...o, head: false });
const label = (s, t, x, y, w, o = {}) => T(s, String(t).toUpperCase(), x, y, w, 0.22, { b: true, sz: 9.5, cs: 1.1, c: C.accent, va: 'middle', one: true, ...o });
function tag(s, t, xRight, y) {
  const w = wText(t, true, 8.5, 0.8) + 0.26;
  rrect(s, xRight - w, y, w, 0.22, { fill: C.warn, r: 0.11 });
  T(s, t, xRight - w, y, w, 0.22, { b: true, sz: 8.5, cs: 0.8, c: C.deep, al: 'center', va: 'middle', one: true });
}
function num(s, n, x, y, d, o = {}) {
  circle(s, x, y, d, { fill: o.fill || C.accent });
  T(s, String(n), x, y, d, d, { b: true, sz: o.sz || 11, c: o.c || C.white, al: 'center', va: 'middle', one: true });
}
/** A string becomes a paragraph, an array becomes bullets. */
function body(s, v, x, y, w, h, o = {}) {
  if (!v) return;
  if (Array.isArray(v)) T(s, v.map((t, i) => ({ t, bullet: true, br: i < v.length - 1 })), x, y, w, h, { pa: 4, ...o });
  else T(s, v, x, y, w, h, o);
}
const lead = (a, b, c1, c2) => [{ t: a + ' ', b: true, c: c1 }, { t: b || '', c: c2 }];

/* icons: react-icons name -> PNG; falls back to a plain dot when the libraries are missing */
const ICONS = {};
async function iconData(name, color) {
  if (!fa || !sharp || !React || !RDS) return null;
  if (!fa[name]) { warn(`unknown icon "${name}" (react-icons/fa names, e.g. FaTruck)`); return null; }
  const k = name + color;
  if (!ICONS[k]) {
    const svg = RDS.renderToStaticMarkup(React.createElement(fa[name], { color: '#' + color, size: 256 }));
    const buf = await sharp(Buffer.from(svg)).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    ICONS[k] = 'image/png;base64,' + buf.toString('base64');
  }
  return ICONS[k];
}
async function icon(s, name, x, y, d, color) {
  const data = name ? await iconData(name, color || C.accent) : null;
  if (data) s.addImage({ data, x, y, w: d, h: d });
  else circle(s, x + d * 0.3, y + d * 0.3, d * 0.4, { fill: color || C.accent });
}
async function badge(s, name, x, y, d, o = {}) {
  circle(s, x, y, d, { fill: o.fill || C.accentTint });
  await icon(s, name, x + d * 0.25, y + d * 0.25, d * 0.5, o.c || C.accent);
}

/* images and logos */
function imgSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.slice(1, 4).toString() === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i += 1; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (e) { /* fall through */ }
  return null;
}
const abs = f => (path.isAbsolute(f) ? f : path.join(DIR, f));
/** Draw an image inside a box, keeping its proportions. Returns the width used. */
function image(s, file, x, y, w, h, o = {}) {
  const f = file ? abs(file) : null;
  const size = f && fs.existsSync(f) ? imgSize(f) : null;
  if (!size) {
    rrect(s, x, y, w, h, { line: C.greyLine, dash: 'dash', fill: cur.tone === 'dark' ? C.deep2 : C.white });
    T(s, `[${o.alt || (file ? path.basename(file) : LBL.image)}]`, x + 0.1, y, w - 0.2, h, { sz: 9.5, c: C.muted, al: 'center', va: 'middle' });
    if (file) warn(`image not found or not PNG/JPG: ${file}`);
    return w;
  }
  const k = Math.min(w / size[0], h / size[1]);
  const iw = size[0] * k, ih = size[1] * k;
  const ix = o.al === 'left' ? x : o.al === 'right' ? x + w - iw : x + (w - iw) / 2;
  if (o.plate) rrect(s, ix - 0.1, y + (h - ih) / 2 - 0.07, iw + 0.2, ih + 0.14, { fill: C.white, r: 0.06 });
  s.addImage({ path: f, x: ix, y: y + (h - ih) / 2, w: iw, h: ih });
  return iw;
}
const LOGOS = B.logos || {};

/* ------------------------------------------------------------- slide frame */
const TONE = {
  cover: 'light', agenda: 'light', section: 'dark', 'big-number': 'tint', kpi: 'light', 'icon-grid': 'tint', feature: 'light',
  split: 'tint', comparison: 'light', process: 'light', timeline: 'light', chart: 'light', table: 'tint', quote: 'dark',
  'image-text': 'light', closing: 'dark', stations: 'tint', nested: 'light', matrix: 'tint', screen: 'light', pairs: 'tint',
};
function pal() {
  const d = cur.tone === 'dark';
  return { d, card: d ? C.deep2 : C.white, cardLine: d ? C.deepLine : C.line, head: d ? C.white : C.deep, text: d ? C.onDark : C.ink,
    mute: d ? C.onDark2 : C.muted, acc: d ? C.accentLight : C.accent, soft: d ? C.deep2 : (cur.tone === 'tint' ? C.white : C.tint) };
}
/** Kicker, logo, title, footer and page number. Returns nothing; content starts at TOP. */
function head(s, sl, n) {
  const p = pal();
  if (sl.kicker) label(s, sl.kicker, L, 0.36, 8.6, { c: p.acc });
  if (B.header && LOGOS[B.header]) image(s, LOGOS[B.header], R - 1.6, 0.17, 1.6, 0.42, { al: 'right', plate: p.d });
  else if (B.name) T(s, B.name.toUpperCase(), R - 3, 0.36, 3, 0.22, { b: true, sz: 9.5, cs: 1.1, c: p.head, al: 'right', va: 'middle', one: true });
  T(s, sl.title, L, 0.68, CW, 0.82, { f: 'd', sz: 22, c: p.head, fit: [22, 18] });
  if (!sl.title) err('missing "title" — state the point of the slide in one sentence');
  T(s, `${String(n).padStart(2, '0')} / ${TOTAL}`, R - 1.5, 6.98, 1.5, 0.22, { b: true, sz: 9.5, cs: 1.1, c: p.acc, al: 'right', va: 'middle', one: true });
  if (B.footer) T(s, B.footer, L, 6.98, 8, 0.22, { sz: 9, c: p.d ? C.onDark2 : C.source, va: 'middle', one: true });
}
/** Source line and key at the bottom. Returns the y where content must end. */
function foot(s, sl) {
  const p = pal();
  const both = sl.source && sl.key;
  if (sl.key) {
    let cx = L;
    const y = both ? 6.28 : 6.44;
    sl.key.forEach(it => {
      const col = it.color === 'warn' ? C.warn : it.color === 'primary' ? C.deep : it.color === 'muted' ? C.idle : it.color === 'light' ? C.accentTint : C.accent;
      if (it.arrow) arrow(s, cx, y + 0.11, cx + 0.3, y + 0.11, { c: col, w: 1.5, dash: it.dash ? 'dash' : undefined });
      else rect(s, cx, y + 0.03, 0.16, 0.16, { fill: col, line: it.color === 'light' ? C.accent : undefined, lw: 0.75 });
      const tw = wText(it.label, false, 9.5) + 0.14;
      T(s, it.label, cx + (it.arrow ? 0.38 : 0.24), y, tw, 0.22, { sz: 9.5, c: p.mute, va: 'middle', one: true });
      cx += (it.arrow ? 0.38 : 0.24) + tw + 0.28;
    });
  }
  if (sl.source) T(s, sl.source, L, both ? 6.54 : 6.42, CW, 0.3, { sz: 9, ls: 11.5, c: p.d ? C.onDark2 : C.source });
  return both ? 6.14 : (sl.source || sl.key) ? 6.28 : 6.62;
}
/** A full-width strip with a bold lead and a sentence. kind: warn | accent | deep | soft */
function band(s, y, h, b, kind = 'soft') {
  if (!b) return;
  const p = pal();
  const st = { warn: [C.warnTint, C.warnDark, C.ink], accent: [C.accent, C.white, C.white], deep: [p.d ? C.deepest : C.deep, C.accentLight, C.white], soft: [p.soft, p.acc, p.text] }[b.kind || kind];
  rrect(s, L, y, CW, h, { fill: st[0] });
  const txt = typeof b === 'string' ? b : b.text;
  T(s, b.lead ? lead(b.lead, txt, st[1], st[2]) : txt, L + 0.3, y, CW - 0.6, h, { sz: 11.5, c: st[2], va: 'middle', fit: [11.5, 10] });
}
const bandH = sl => (sl.band ? 0.72 : 0);
function need(sl, field, min, max) {
  const v = sl[field];
  if (!Array.isArray(v) || v.length < min) { err(`"${field}" needs at least ${min} item(s)`); return []; }
  if (v.length > max) err(`"${field}" has ${v.length} items; this layout holds ${max}. Split the slide or use another layout`);
  return v.slice(0, max);
}

/* ------------------------------------------------------------- layouts */
const L_ = {};

L_.cover = async (s, sl) => {
  const hasPanel = !!sl.panel;
  if (hasPanel) rect(s, 7.9, 0, W - 7.9, H, { fill: C.deep });
  let lx = L;
  (sl.logos || []).forEach(k => { if (LOGOS[k]) lx += image(s, LOGOS[k], lx, 0.48, 2.2, 0.62, { al: 'left' }) + 0.35; else warn(`logo "${k}" is not in brand.logos`); });
  const tw = hasPanel ? 7.0 : 11.5;
  if (sl.kicker) label(s, sl.kicker, L, 1.95, tw);
  T(s, sl.accent ? [{ t: sl.title + ' ' }, { t: sl.accent, c: C.accent }] : sl.title, L, 2.3, tw, 2.3, { f: 'd', sz: 44, c: C.deep, fit: [44, 30] });
  T(s, sl.subtitle, L, 4.75, Math.min(tw, 8.5) - 0.4, 0.95, { sz: 15, c: C.muted, fit: [15, 12.5] });
  T(s, sl.for, L, 6.1, tw, 0.3, { sz: 12, b: true, c: C.deep, one: true });
  T(s, sl.note, L, 6.42, tw, 0.3, { sz: 11, c: C.muted, one: true });
  if (hasPanel) {
    const items = (sl.panel.items || []).slice(0, 6);
    if ((sl.panel.items || []).length > 6) err('"panel.items" holds 6 at most');
    const px = 8.55, pw = 4.2, pitch = Math.min(0.8, 4.0 / Math.max(items.length, 1)), y0 = 1.55;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], y = y0 + i * pitch;
      rrect(s, px, y, pw, pitch - 0.2, { fill: C.deep2, line: C.deepLine });
      await icon(s, it.icon, px + 0.2, y + (pitch - 0.2 - 0.28) / 2, 0.28, C.accentLight);
      T(s, it.label, px + 0.68, y, it.tag ? 2.4 : 3.3, pitch - 0.2, { b: true, sz: 12.5, c: C.white, va: 'middle', one: true, fit: [12.5, 10.5] });
      if (it.tag) T(s, String(it.tag).toUpperCase(), px + 3.0, y, 1.0, pitch - 0.2, { b: true, sz: 8.5, cs: 1, c: C.accentLight, al: 'right', va: 'middle', one: true });
      if (sl.panel.arrows && i < items.length - 1) arrow(s, px + 0.34, y + pitch - 0.19, px + 0.34, y + pitch - 0.01, { c: C.accentLight, w: 1.5 });
    }
    if (sl.panel.caption) {
      rrect(s, px, 5.75, pw, 0.6, { line: C.deepLine, lw: 1, dash: 'dash' });
      T(s, String(sl.panel.caption).toUpperCase(), px + 0.1, 5.75, pw - 0.2, 0.6, { b: true, sz: 9, cs: 0.8, c: C.accentLight, al: 'center', va: 'middle', one: true, fit: [9, 8.5] });
    }
  }
};

L_.agenda = async (s, sl, n) => {
  head(s, sl, n);
  const items = need(sl, 'items', 2, 7);
  const w = sl.aside ? 6.6 : CW, pitch = Math.min(0.66, 4.7 / items.length);
  items.forEach((t, i) => {
    const y = TOP + 0.1 + i * pitch;
    T(s, String(i + 1).padStart(2, '0'), L, y, 0.7, pitch - 0.14, { f: 'd', sz: 20, c: C.accent, va: 'middle', one: true });
    T(s, t, L + 0.8, y, w - 0.8, pitch - 0.14, { sz: 16, c: C.deep, va: 'middle', one: true, fit: [16, 12] });
    seg(s, L, y + pitch - 0.08, L + w, y + pitch - 0.08, { c: C.line, w: 0.75 });
  });
  if (sl.aside) {
    rrect(s, 7.7, TOP + 0.1, R - 7.7, 4.5, { fill: C.tint });
    label(s, sl.aside.heading || '', 8.0, TOP + 0.35, 4.4);
    body(s, sl.aside.items, 8.0, TOP + 0.8, R - 8.3, 3.6, { sz: 12, c: C.ink, pa: 8 });
  }
};

L_.section = async (s, sl, n) => {
  rect(s, 0, 0, 0.32, H, { fill: C.accent });
  T(s, sl.number, 1.2, 1.7, 5, 1.7, { f: 'd', sz: 96, c: C.accentLight, va: 'bottom', one: true, fit: [96, 60] });
  T(s, sl.title, 1.2, 3.55, 10.5, 1.0, { f: 'd', sz: 36, c: C.white, fit: [36, 26] });
  T(s, sl.subtitle, 1.2, 4.65, 9.5, 0.8, { sz: 16, c: C.onDark });
  T(s, `${String(n).padStart(2, '0')} / ${TOTAL}`, R - 1.5, 6.98, 1.5, 0.22, { b: true, sz: 9.5, cs: 1.1, c: C.accentLight, al: 'right', va: 'middle', one: true });
};

L_['big-number'] = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  rrect(s, L, TOP, 5.2, bot - TOP, { fill: p.d ? C.deep2 : C.white, line: p.cardLine });
  T(s, sl.number, L + 0.35, TOP + 0.35, 4.5, 1.9, { f: 'd', sz: 96, c: C.accent, va: 'middle', one: true, fit: [96, 48] });
  T(s, sl.label, L + 0.35, TOP + 2.35, 4.5, bot - TOP - 2.6, { sz: 15, c: p.head, b: true, fit: [15, 12] });
  if (!sl.number) err('"number" is missing');
  const x = 6.15, w = R - x, stats = (sl.stats || []).slice(0, 3);
  if ((sl.stats || []).length > 3) err('"stats" holds 3 at most');
  const sh = stats.length ? 1.25 : 0;
  body(s, sl.body, x, TOP + 0.1, w, bot - TOP - sh - 0.4, { sz: 13.5, c: p.text, pa: 8, fit: [13.5, 11] });
  stats.forEach((st, i) => {
    const sw = (w - 0.2 * (stats.length - 1)) / stats.length, sx = x + i * (sw + 0.2), sy = bot - sh;
    rrect(s, sx, sy, sw, sh, { fill: p.soft });
    T(s, st.value, sx + 0.2, sy + 0.12, sw - 0.4, 0.55, { f: 'd', sz: 24, c: p.head, va: 'middle', one: true, fit: [24, 14] });
    T(s, st.label, sx + 0.2, sy + 0.7, sw - 0.4, 0.48, { sz: 10.5, c: p.mute, fit: [10.5, 9] });
  });
};

L_.kpi = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const tiles = need(sl, 'tiles', 2, 6);
  const cols = tiles.length <= 4 ? tiles.length : 3, rows = Math.ceil(tiles.length / cols);
  const w = (CW - 0.2 * (cols - 1)) / cols, h = Math.min(2.4, (bot - TOP - 0.2 * (rows - 1)) / rows);
  tiles.forEach((t, i) => {
    const x = L + (i % cols) * (w + 0.2), y = TOP + Math.floor(i / cols) * (h + 0.2);
    rrect(s, x, y, w, h, { fill: p.card, line: p.cardLine });
    T(s, t.value, x + 0.25, y + 0.2, w - 0.5, h * 0.42, { f: 'd', sz: 40, c: t.warn ? C.warn : p.acc, va: 'middle', one: true, fit: [40, 20] });
    T(s, t.label, x + 0.25, y + 0.2 + h * 0.44, w - 0.5, 0.5, { sz: 12, b: true, c: p.head, fit: [12, 10] });
    T(s, t.note, x + 0.25, y + 0.75 + h * 0.44, w - 0.5, h - (0.95 + h * 0.44), { sz: 10, c: p.mute, fit: [10, 9] });
  });
  band(s, TOP + rows * h + 0.2 * (rows - 1) + 0.2, bandH(sl), sl.band, 'warn');
};

L_['icon-grid'] = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const items = need(sl, 'items', 2, 6);
  const cols = items.length <= 5 ? items.length : 3, rows = Math.ceil(items.length / cols);
  const w = (CW - 0.2 * (cols - 1)) / cols, h = (bot - TOP - 0.2 * (rows - 1)) / rows;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], x = L + (i % cols) * (w + 0.2), y = TOP + Math.floor(i / cols) * (h + 0.2);
    rrect(s, x, y, w, h, { fill: p.card, line: p.cardLine });
    const side = rows > 1; // two rows: icon beside the title to save height
    await badge(s, it.icon, x + 0.22, y + 0.22, side ? 0.5 : 0.66, it.warn ? { fill: C.warnTint, c: C.warnDark } : { fill: p.d ? C.deepest : C.accentTint });
    if (side) {
      T(s, it.title, x + 0.85, y + 0.2, w - 1.05, 0.54, { b: true, sz: 13, c: p.head, va: 'middle', fit: [13, 11] });
      T(s, it.body, x + 0.22, y + 0.9, w - 0.44, h - 1.05, { sz: 10.5, c: p.mute, fit: [10.5, 9.5] });
    } else {
      T(s, it.title, x + 0.22, y + 1.05, w - 0.44, 0.7, { b: true, sz: 14, c: p.head, fit: [14, 11.5] });
      T(s, it.body, x + 0.22, y + 1.8, w - 0.44, h - 1.95, { sz: 11, c: p.mute, fit: [11, 9.5] });
    }
  }
  band(s, bot + 0.15, bandH(sl), sl.band, 'deep');
};

L_.feature = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const pn = sl.panel || {}, lw = 5.4;
  rrect(s, L, TOP, lw, bot - TOP, { fill: p.card, line: p.cardLine });
  if (pn.heading) label(s, pn.heading, L + 0.3, TOP + 0.2, lw - 0.6, { c: p.acc });
  if (pn.image) image(s, pn.image, L + 0.3, TOP + 0.55, lw - 0.6, bot - TOP - 0.8, { alt: pn.alt });
  else body(s, pn.bullets || pn.text, L + 0.3, TOP + 0.58, lw - 0.6, bot - TOP - 0.8, { sz: 12.5, c: p.text, pa: 7, fit: [12.5, 10.5] });
  const items = need(sl, 'items', 2, 6), x = L + lw + 0.35, w = R - x;
  if (sl.itemsHeading) label(s, sl.itemsHeading, x, TOP, w, { c: p.acc });
  const y0 = TOP + (sl.itemsHeading ? 0.35 : 0), pitch = (bot - y0) / items.length;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], y = y0 + i * pitch;
    await badge(s, it.icon, x, y + (pitch - 0.42) / 2, 0.42, { fill: p.d ? C.deepest : (cur.tone === 'tint' ? C.white : C.accentTint) });
    T(s, it.lead ? lead(it.lead, it.text, p.head, p.text) : it.text, x + 0.58, y, w - 0.58, pitch - 0.06, { sz: 11, c: p.text, va: 'middle', fit: [11, 9.5] });
  }
  band(s, bot + 0.15, bandH(sl), sl.band, 'accent');
};

L_.split = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl), w = (CW - 0.3) / 2;
  const draw = (side, x, strong) => {
    const d = side || {};
    const fill = strong ? C.deep : p.card, hc = strong ? C.accentLight : p.acc, tc = strong ? C.white : p.text, mc = strong ? C.onDark : p.mute;
    rrect(s, x, TOP, w, bot - TOP, { fill, line: strong ? C.deep : p.cardLine });
    if (d.heading) label(s, d.heading, x + 0.3, TOP + 0.2, w - 0.6, { c: hc });
    if (d.cards) {
      const cards = d.cards.slice(0, 4), ch = (bot - TOP - 0.65 - 0.14 * (cards.length - 1)) / cards.length;
      if (d.cards.length > 4) err('a split panel holds 4 cards at most');
      cards.forEach((c, i) => {
        const y = TOP + 0.55 + i * (ch + 0.14);
        rrect(s, x + 0.3, y, w - 0.6, ch, { fill: strong ? C.deep2 : p.soft });
        rect(s, x + 0.3, y + 0.12, 0.06, ch - 0.24, { fill: C.accent });
        T(s, c.title, x + 0.55, y + 0.1, w - 1.05, 0.32, { b: true, sz: 12.5, c: strong ? C.white : p.head, va: 'middle', one: true, fit: [12.5, 10] });
        T(s, c.text, x + 0.55, y + 0.44, w - 1.05, ch - 0.52, { sz: 10.5, c: mc, fit: [10.5, 9] });
      });
    } else body(s, d.bullets || d.text, x + 0.3, TOP + 0.6, w - 0.6, bot - TOP - 0.8, { sz: 12.5, c: tc, pa: 7, fit: [12.5, 10.5] });
  };
  draw(sl.left, L, false);
  draw(sl.right, L + w + 0.3, sl.right && sl.right.strong !== false);
};

L_.comparison = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const cols = need(sl, 'columns', 2, 3), rows = need(sl, 'rows', 2, 6);
  const lw = 2.6, gap = 0.18, cw = (CW - lw - gap * cols.length) / cols.length, rh = Math.min(0.95, (bot - TOP - 0.62) / rows.length);
  cols.forEach((c, j) => {
    const x = L + lw + gap + j * (cw + gap);
    rrect(s, x, TOP, cw, 0.48, { fill: c.highlight ? C.accent : (p.d ? C.deep2 : C.grey) });
    T(s, String(c.head).toUpperCase(), x + 0.1, TOP, cw - 0.2, 0.48, { b: true, sz: 10, cs: 1, c: c.highlight ? C.white : p.mute, al: 'center', va: 'middle', one: true, fit: [10, 8.5] });
  });
  rows.forEach((r, i) => {
    const y = TOP + 0.62 + i * rh;
    T(s, r.label, L, y, lw - 0.15, rh - 0.12, { b: true, sz: 12, c: p.head, va: 'middle', fit: [12, 10] });
    cols.forEach((c, j) => {
      const x = L + lw + gap + j * (cw + gap);
      rrect(s, x, y, cw, rh - 0.12, { fill: p.card, line: c.highlight ? C.accent : (p.d ? C.deepLine : C.greyLine) });
      T(s, (r.cells || [])[j], x + 0.18, y, cw - 0.36, rh - 0.12, { sz: 11, c: c.highlight ? p.text : p.mute, va: 'middle', fit: [11, 9.5] });
    });
    if ((r.cells || []).length !== cols.length) err(`row "${r.label}" needs ${cols.length} cells`);
  });
};

L_.process = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const steps = need(sl, 'steps', 2, 6);
  const gap = 0.24, w = (CW - gap * (steps.length - 1)) / steps.length;
  const below = sl.list || sl.aside;
  const h = below ? 2.05 : Math.min(3.4, bot - TOP);
  steps.forEach((st, i) => {
    const x = L + i * (w + gap), last = sl.lastStrong && i === steps.length - 1;
    rrect(s, x, TOP, w, h, { fill: last ? C.accent : p.card, line: last ? C.accent : p.cardLine });
    num(s, i + 1, x + 0.15, TOP + 0.15, 0.36, last ? { fill: C.white, c: C.accent } : {});
    T(s, st.title, x + 0.6, TOP + 0.15, w - 0.72, 0.36, { b: true, sz: 12.5, c: last ? C.white : p.head, va: 'middle', one: true, fit: [12.5, 9.5] });
    let y = TOP + 0.66;
    if (st.tag) { T(s, st.tag, x + 0.15, y, w - 0.3, 0.44, { b: true, sz: 10, c: last ? C.white : p.acc, fit: [10, 9] }); y += 0.5; }
    T(s, st.text, x + 0.15, y, w - 0.3, TOP + h - y - 0.12, { sz: 10.5, c: last ? C.white : p.mute, fit: [10.5, 9] });
    if (i < steps.length - 1) arrow(s, x + w + 0.02, TOP + Math.min(1.0, h / 2), x + w + gap - 0.02, TOP + Math.min(1.0, h / 2), { w: 2 });
  });
  if (below) {
    const y = TOP + h + 0.2, bh = bot - y, lw = sl.aside && sl.list ? 7.0 : CW;
    if (sl.list) {
      rrect(s, L, y, lw, bh, { fill: p.soft });
      label(s, sl.list.heading || '', L + 0.25, y + 0.14, lw - 0.5, { c: p.acc });
      const items = (sl.list.items || []).slice(0, 5), ip = (bh - 0.55) / Math.max(items.length, 1);
      if ((sl.list.items || []).length > 5) err('"list.items" holds 5 at most');
      items.forEach((t, i) => {
        num(s, i + 1, L + 0.25, y + 0.48 + i * ip + (ip - 0.3) / 2, 0.3, { sz: 9.5, fill: C.deep });
        T(s, t, L + 0.7, y + 0.48 + i * ip, lw - 0.95, ip, { sz: 10.5, c: p.text, va: 'middle', fit: [10.5, 9.5] });
      });
    }
    if (sl.aside) {
      const ax = sl.list ? L + lw + 0.25 : L, aw = R - ax, a = sl.aside;
      rect(s, ax, y, aw, bh, { fill: p.card, line: p.cardLine });
      rect(s, ax, y, aw, 0.36, { fill: C.deep });
      T(s, String(a.heading || '').toUpperCase(), ax + 0.2, y, aw - 1.6, 0.36, { b: true, sz: 9, cs: 1, c: C.white, va: 'middle', one: true });
      if (a.tag) tag(s, a.tag, ax + aw - 0.12, y + 0.07);
      const f = (a.fields || []).slice(0, 6), fr = Math.ceil(f.length / 2), fp = (bh - 0.5 - (a.result ? 0.45 : 0)) / Math.max(fr, 1);
      f.forEach((fl, i) => {
        const fx = ax + 0.2 + (i % 2) * ((aw - 0.4) / 2), fy = y + 0.46 + Math.floor(i / 2) * fp;
        T(s, String(fl.label).toUpperCase(), fx, fy, (aw - 0.5) / 2, 0.18, { b: true, sz: 8.5, cs: 0.8, c: p.mute, va: 'middle', one: true });
        T(s, fl.value, fx, fy + 0.18, (aw - 0.5) / 2, 0.28, { b: true, sz: fl.strong ? 13.5 : 11, c: fl.strong ? p.acc : p.head, va: 'middle', one: true, fit: [fl.strong ? 13.5 : 11, 9] });
      });
      if (a.result) { rrect(s, ax + 0.2, y + bh - 0.42, aw - 0.4, 0.32, { fill: C.accentTint }); T(s, a.result, ax + 0.2, y + bh - 0.42, aw - 0.4, 0.32, { b: true, sz: 10, c: C.accent, al: 'center', va: 'middle', one: true, fit: [10, 8.5] }); }
    }
  }
  band(s, bot + 0.15, bandH(sl), sl.band, 'warn');
};

L_.timeline = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - (sl.roles ? 1.1 : 0);
  const items = need(sl, 'items', 2, 5);
  const gap = 0.18, w = (CW - gap * (items.length - 1)) / items.length, ry = TOP + 0.18;
  arrow(s, L, ry, R, ry, { c: C.accent, w: 3 });
  items.forEach((it, i) => {
    const x = L + i * (w + gap), y = TOP + 0.48, h = bot - y;
    circle(s, x + 0.1, ry - 0.17, 0.34, { fill: C.accent, line: p.d ? C.deep : C.white, lw: 2.5 });
    rrect(s, x, y, w, h, { fill: p.card, line: p.cardLine });
    T(s, it.label, x + 0.25, y + 0.13, w - 0.5, 0.34, { f: 'd', sz: 15, c: p.head, va: 'middle', one: true, fit: [15, 11] });
    T(s, it.title, x + 0.25, y + 0.52, w - 0.5, 0.34, { b: true, sz: 13, c: p.acc, va: 'middle', one: true, fit: [13, 10] });
    const rh = it.result ? 0.78 : 0;
    body(s, it.bullets || it.text, x + 0.25, y + 0.98, w - 0.45, h - 1.1 - rh, { sz: 10.5, c: p.text, pa: 3, fit: [10.5, 9.5] });
    if (it.result) {
      seg(s, x + 0.25, y + h - rh - 0.04, x + w - 0.25, y + h - rh - 0.04, { c: p.cardLine, w: 0.75 });
      T(s, lead(sl.resultLabel || LBL.result, it.result, p.acc, p.text), x + 0.25, y + h - rh + 0.06, w - 0.5, rh - 0.14, { sz: 10.5, c: p.text, fit: [10.5, 9.5] });
    }
  });
  if (sl.roles) {
    const rs = sl.roles.slice(0, 3), rw = (CW - 0.2 * (rs.length - 1)) / rs.length, y = bot + 0.3;
    rs.forEach((r, i) => {
      rrect(s, L + i * (rw + 0.2), y, rw, 0.8, { fill: p.soft });
      T(s, lead(r.who + ':', r.does, p.head, p.text), L + i * (rw + 0.2) + 0.2, y, rw - 0.4, 0.8, { sz: 10, c: p.text, va: 'middle', fit: [10, 9] });
    });
  }
};

L_.chart = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl), ch = sl.chart || {};
  const tk = sl.takeaway, cw = tk ? 7.7 : CW;
  rrect(s, L, TOP, cw, bot - TOP, { fill: p.card, line: p.cardLine });
  if (ch.title) label(s, ch.title, L + 0.25, TOP + 0.15, cw - 0.5, { c: p.mute });
  if (!ch.condition) err('"chart.condition" is missing — say on the slide which data, setting and unit the chart shows');
  T(s, ch.condition, L + 0.25, bot - 0.46, cw - 0.5, 0.36, { sz: 9.5, c: p.mute, va: 'middle', fit: [9.5, 8.5] });
  const cats = ch.categories || [], series = ch.series || [];
  if (!cats.length || !series.length) err('"chart.categories" and "chart.series" are required');
  series.forEach(se => { if ((se.values || []).length !== cats.length) err(`series "${se.name}" needs ${cats.length} values`); });
  const box = { x: L + 0.15, y: TOP + 0.45, w: cw - 0.3, h: bot - TOP - 1.0 };
  if (FLAG('--no-charts') || !cats.length) { rrect(s, box.x, box.y, box.w, box.h, { line: C.greyLine, dash: 'dash' }); }
  else {
    const data = series.map(se => ({ name: se.name, labels: cats, values: se.values }));
    const type = ch.type || 'bar';
    const common = { ...box, catAxisLabelColor: p.mute, valAxisLabelColor: p.mute, catAxisLabelFontSize: 10, valAxisLabelFontSize: 9.5, catAxisLabelFontFace: FONT.b,
      valAxisLabelFontFace: FONT.b, valGridLine: { color: p.d ? C.deepLine : C.line, size: 0.5 }, catGridLine: { style: 'none' }, showLegend: series.length > 1, legendPos: 'b',
      legendFontSize: 10, legendColor: p.mute, legendFontFace: FONT.b, dataLabelFontFace: FONT.b };
    if (ch.max !== undefined) common.valAxisMaxVal = ch.max;
    if (ch.min !== undefined) common.valAxisMinVal = ch.min;
    if (ch.format) { common.dataLabelFormatCode = ch.format; common.valAxisLabelFormatCode = ch.format; }
    let k = 0; // series without a colour of their own take the palette in order, accent first
    const colors = series.map(se => (se.color === 'warn' ? C.warn : se.color === 'primary' ? (p.d ? C.onDark : C.deep) : se.color === 'muted' ? C.idle : SERIES[k++ % SERIES.length]));
    const dec = Math.min(2, Math.max(0, ...series.flatMap(se => (se.values || []).map(v => (String(v).split('.')[1] || '').length))));
    if (!ch.format && dec) common.dataLabelFormatCode = '0.' + '0'.repeat(dec);
    if (type === 'doughnut') {
      s.addChart(pptx.charts.DOUGHNUT, [data[0]], { ...box, holeSize: 58, chartColors: cats.map((c, i) => SERIES[i % SERIES.length]), showLegend: true, legendPos: 'r', legendFontSize: 11,
        legendColor: p.text, legendFontFace: FONT.b, showPercent: true, showValue: false, dataLabelColor: 'FFFFFF', dataLabelFontSize: 10, dataBorder: { pt: 1, color: p.d ? C.deep2 : 'FFFFFF' } });
    } else if (type === 'line') {
      s.addChart(pptx.charts.LINE, data, { ...common, chartColors: colors, lineSize: 2.25, lineDataSymbol: cats.length > 12 ? 'none' : 'circle', lineDataSymbolSize: 6,
        showValue: cats.length <= 8 && series.length === 1, dataLabelPosition: 't', dataLabelFontSize: 10, dataLabelColor: p.text,
        catAxisLabelFrequency: cats.length > 12 ? String(Math.ceil(cats.length / 6)) : undefined });
    } else {
      s.addChart(pptx.charts.BAR, data, { ...common, barDir: ch.horizontal ? 'bar' : 'col', chartColors: colors, barGapWidthPct: 70, showValue: true, dataLabelColor: p.text,
        dataLabelFontSize: 10, dataLabelPosition: 'outEnd', valAxisHidden: series.length === 1, valGridLine: series.length === 1 ? { style: 'none' } : common.valGridLine });
    }
  }
  if (tk) {
    const x = L + cw + 0.3, w = R - x;
    rrect(s, x, TOP, w, bot - TOP, { fill: C.deep });
    label(s, tk.heading || LBL.takeaway, x + 0.3, TOP + 0.22, w - 0.6, { c: C.accentLight });
    body(s, tk.bullets || tk.text, x + 0.3, TOP + 0.62, w - 0.6, bot - TOP - 0.85, { sz: 13, c: C.white, pa: 8, fit: [13, 10.5] });
  }
};

L_.table = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const headRow = sl.head || [], rows = sl.rows || [];
  if (rows.length > 6 || headRow.length > 4) err(`a table holds 6 rows and 4 columns at most (this one: ${rows.length} × ${headRow.length}). A grid of numbers cannot be presented: show the one comparison as a chart, or the pattern as a matrix`);
  if (!headRow.length || !rows.length) { err('"head" and "rows" are required'); return; }
  const tw = sl.aside ? 7.8 : CW, ncol = headRow.length;
  const colW = (sl.widths && sl.widths.length === ncol ? sl.widths.map(v => (v / sl.widths.reduce((a, b) => a + b, 0)) * tw) : headRow.map(() => tw / ncol));
  const sz = 10.5, all = [headRow, ...rows];
  const rh = Math.min(0.72, (bot - TOP) / all.length);
  let total = 0;
  const data = all.map((r, ri) => r.map((c, ci) => {
    const hd = ri === 0, bold = hd || ci === 0;
    const m = wrap([{ t: String(c), b: bold, sz, cs: 0 }], colW[ci] - 0.22, 0);
    if ((m.lines * sz * 1.2) / 72 + 0.12 > rh + 0.02) err(`table cell "${String(c).slice(0, 30)}": too long — shorten it`);
    return { text: String(c), options: { fontFace: FONT.b, fontSize: sz, bold, color: hd ? C.white : (ci === 0 ? C.deep : C.ink), fill: { color: hd ? C.deep : C.white }, valign: 'middle', align: 'left', margin: [4, 7, 4, 7], lang: LANG } };
  }));
  total = rh * all.length;
  s.addTable(data, { x: L, y: TOP, w: tw, colW, rowH: rh, border: { type: 'solid', pt: 0.75, color: C.line }, autoPage: false });
  cur.texts.push({ id: 'table', ex: L, ey: TOP, ew: tw, eh: total, ov: false });
  if (sl.note) T(s, sl.note, L, TOP + total + 0.12, tw, bot - TOP - total - 0.12, { sz: 9.5, c: p.mute, fit: [9.5, 8.5] });
  if (sl.aside) {
    const x = L + tw + 0.3, w = R - x;
    rrect(s, x, TOP, w, bot - TOP, { fill: p.soft });
    label(s, sl.aside.heading || '', x + 0.25, TOP + 0.18, w - 0.5, { c: p.acc });
    body(s, sl.aside.bullets || sl.aside.text, x + 0.25, TOP + 0.55, w - 0.5, bot - TOP - 0.75, { sz: 11, c: p.text, pa: 6, fit: [11, 9.5] });
  }
  band(s, bot + 0.15, bandH(sl), sl.band, 'soft');
};

L_.quote = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  rect(s, L, TOP + 0.2, 0.09, bot - TOP - 1.4, { fill: C.accent });
  T(s, sl.quote, L + 0.45, TOP + 0.2, CW - 1.2, bot - TOP - 1.4, { f: 'd', sz: 28, c: p.head, va: 'middle', fit: [28, 18] });
  T(s, sl.by, L + 0.45, bot - 1.0, CW - 1.2, 0.36, { b: true, sz: 13, c: p.acc, va: 'middle', one: true });
  T(s, sl.context, L + 0.45, bot - 0.6, CW - 1.2, 0.5, { sz: 11, c: p.mute });
  if (!sl.by) warn('"by" is missing — a quotation needs its source');
};

L_['image-text'] = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl), iw = 6.6, right = sl.side === 'right';
  const ix = right ? R - iw : L, tx = right ? L : L + iw + 0.4, tw = CW - iw - 0.4;
  image(s, sl.image, ix, TOP, iw, bot - TOP, { alt: sl.alt });
  if (sl.caption) T(s, sl.caption, ix, bot - 0.02, iw, 0.26, { sz: 9, c: p.mute, va: 'middle', one: true, ov: true });
  if (sl.heading) label(s, sl.heading, tx, TOP + 0.05, tw, { c: p.acc });
  body(s, sl.bullets || sl.text, tx, TOP + 0.45, tw, bot - TOP - 0.5, { sz: 13, c: p.text, pa: 8, fit: [13, 10.5] });
};

L_.closing = async (s, sl, n) => {
  head(s, sl, n);
  const steps = (sl.steps || []).slice(0, 4);
  if ((sl.steps || []).length > 4) err('"steps" holds 4 at most');
  const cols = steps.length > 2 ? 2 : Math.max(steps.length, 1), w = (CW - 0.27 * (cols - 1)) / cols, rows = Math.ceil(steps.length / cols);
  steps.forEach((st, i) => {
    const x = L + (i % cols) * (w + 0.27), y = TOP + Math.floor(i / cols) * 1.68;
    rrect(s, x, y, w, 1.5, { fill: C.deep2, line: C.deepLine });
    num(s, i + 1, x + 0.25, y + 0.28, 0.5, { fill: C.accentLight, c: C.deep, sz: 14 });
    T(s, st.title, x + 0.95, y + 0.2, w - 1.2, 0.72, { b: true, sz: 14, c: C.white, fit: [14, 11.5] });
    T(s, st.text, x + 0.95, y + 0.96, w - 1.2, 0.42, { sz: 11, c: C.onDark, fit: [11, 9.5] });
  });
  const y = TOP + rows * 1.68 + 0.15;
  T(s, sl.thanks, L, y, 8, 0.55, { f: 'd', sz: 28, c: C.accentLight, va: 'middle', one: true });
  T(s, sl.contact, L, y + 0.62, 10, 0.3, { sz: 12, c: C.onDark, va: 'middle', one: true });
};

/* A row of stations with rows beneath it: the spine of a deck. */
L_.stations = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const st = need(sl, 'stations', 3, 6), rows = need(sl, 'rows', 1, 3);
  const lw = rows.some(r => r.label) ? 1.2 : 0, gap = 0.19, x0 = L + lw, w = (CW - lw - gap * (st.length - 1)) / st.length;
  const X = i => x0 + i * (w + gap);
  let y = TOP;
  if (sl.facts) {
    const f = sl.facts.slice(0, 5), fw = (CW - 0.19 * (f.length - 1)) / f.length;
    f.forEach((ft, i) => {
      rrect(s, L + i * (fw + 0.19), y, fw, 0.8, { fill: p.card, line: p.cardLine });
      T(s, ft.value, L + i * (fw + 0.19) + 0.15, y, 0.85, 0.8, { f: 'd', sz: 24, c: p.acc, va: 'middle', one: true, fit: [24, 13] });
      T(s, ft.label, L + i * (fw + 0.19) + 1.05, y, fw - 1.2, 0.8, { sz: 9.5, c: p.text, va: 'middle', fit: [9.5, 8.5] });
    });
    y += 1.0;
  }
  if (sl.groups) {
    sl.groups.forEach(g => {
      const gx = X(g.from - 1), gw = X(g.to - 1) + w - gx;
      rrect(s, gx, y, gw, 0.48, { fill: C.deep });
      T(s, g.sub ? [{ t: String(g.label).toUpperCase(), c: C.accentLight, br: true }, { t: String(g.sub).toUpperCase() }] : String(g.label).toUpperCase(), gx + 0.05, y, gw - 0.1, 0.48, { b: true, sz: 8.5, cs: 0.6, ls: 11.5, c: C.white, al: 'center', va: 'middle', fit: [8.5, 8.5] });
    });
    y += 0.56;
  }
  const hf = sl.stationStyle === 'accent' ? C.accent : C.deep;
  if (lw && sl.stationsLabel) T(s, String(sl.stationsLabel).toUpperCase(), L, y, lw - 0.15, 0.56, { b: true, sz: 9, cs: 1, ls: 12, c: p.head, va: 'middle' });
  for (let i = 0; i < st.length; i++) {
    rrect(s, X(i), y, w, 0.56, { fill: hf });
    const hasIcon = !!st[i].icon;
    if (hasIcon) await icon(s, st[i].icon, X(i) + 0.14, y + 0.14, 0.28, C.white);
    T(s, st[i].label || st[i], X(i) + (hasIcon ? 0.52 : 0.14), y, w - (hasIcon ? 0.6 : 0.28), 0.56, { b: true, sz: 11.5, ls: 13.5, c: C.white, va: 'middle', fit: [11.5, 9.5] });
    if (i < st.length - 1) arrow(s, X(i) + w + 0.01, y + 0.28, X(i + 1) - 0.01, y + 0.28, { w: 1.5, c: p.mute });
  }
  y += 0.7;
  const avail = bot - y, weights = rows.map(r => r.weight || (r.style === 'strong' ? 0.7 : 1)), sum = weights.reduce((a, b) => a + b, 0);
  rows.forEach((r, ri) => {
    const rh = (avail - 0.1 * (rows.length - 1)) * (weights[ri] / sum);
    const sty = { plain: [p.card, p.cardLine, p.text], tint: [p.d ? C.deep2 : C.accentTint, p.d ? C.deepLine : C.accentTint, p.text], strong: [C.deep, C.deep, C.white], warn: [p.card, p.cardLine, p.mute] }[r.style || 'plain'];
    if (lw && r.label) T(s, String(r.label).toUpperCase(), L, y, lw - 0.15, rh, { b: true, sz: 9, cs: 1, ls: 12, c: r.style === 'warn' ? C.warnDark : p.acc, va: 'middle' });
    if ((r.cells || []).length !== st.length) err(`row "${r.label || ri + 1}" needs ${st.length} cells, one per station`);
    (r.cells || []).slice(0, st.length).forEach((c, i) => {
      rrect(s, X(i), y, w, rh, { fill: sty[0], line: sty[1], r: 0.06 });
      if (r.style === 'warn') rect(s, X(i), y, w, 0.07, { fill: C.warn });
      if (c && typeof c === 'object') {
        T(s, c.title, X(i) + 0.15, y + 0.16, w - 0.3, 0.6, { b: true, sz: 12, c: r.style === 'strong' ? C.white : p.head, fit: [12, 10] });
        T(s, c.text, X(i) + 0.15, y + 0.8, w - 0.3, rh - 0.9, { sz: 10, c: sty[2], fit: [10, 9] });
      } else T(s, c, X(i) + 0.15, y, w - 0.3, rh, { sz: r.style === 'strong' ? 10.5 : 10, b: r.style === 'strong', c: sty[2], va: 'middle', fit: [r.style === 'strong' ? 10.5 : 10, 9] });
    });
    y += rh + 0.1;
  });
  band(s, bot + 0.15, bandH(sl), sl.band, 'warn');
};

/* Boxes inside boxes: A contains B contains C. */
L_.nested = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const lv = need(sl, 'levels', 2, 4), bw = sl.aside ? 7.6 : CW;
  const fills = [p.card, p.d ? C.deepest : C.tint, p.d ? C.deep2 : C.accentTint, C.accent];
  lv.forEach((l, i) => {
    const inset = i * 0.5, x = L + inset, y = TOP + i * 0.62, w = bw - inset * 2, h = bot - y - i * 0.22, last = i === lv.length - 1;
    rrect(s, x, y, w, h, { fill: last ? C.accent : fills[i], line: last ? C.accent : (p.d ? C.deepLine : C.greyLine), lw: 1.25 });
    T(s, l.label, x + 0.25, y + 0.12, w - 0.5, 0.36, { b: true, sz: 12.5, c: last ? C.white : p.head, va: 'middle', one: true, fit: [12.5, 10] });
    if (last) T(s, l.note, x + 0.25, y + 0.52, w - 0.5, h - 0.65, { sz: 11, c: C.white, fit: [11, 9.5] });
    else if (l.note) T(s, l.note, x + w * 0.45, y + 0.12, w * 0.55 - 0.25, 0.36, { sz: 10, c: p.mute, al: 'right', va: 'middle', one: true, fit: [10, 8.5] });
  });
  if (sl.aside) {
    const x = L + bw + 0.3, w = R - x;
    label(s, sl.aside.heading || '', x, TOP + 0.05, w, { c: p.acc });
    body(s, sl.aside.bullets || sl.aside.text, x, TOP + 0.45, w, bot - TOP - 0.5, { sz: 12, c: p.text, pa: 7, fit: [12, 10] });
  }
};

/* A matrix of marks instead of a table of values. */
L_.matrix = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - 0.4;
  const cols = need(sl, 'columns', 2, 7), rows = need(sl, 'rows', 2, 7);
  const tw = sl.aside ? 8.0 : CW, lw = Math.min(3.4, tw * 0.34), cw = (tw - lw) / cols.length, rh = Math.min(0.72, (bot - TOP - 0.6) / rows.length);
  rrect(s, L, TOP, tw, 0.5 + rh * rows.length + 0.1, { fill: p.card, line: p.cardLine });
  cols.forEach((c, j) => T(s, c, L + lw + j * cw + 0.05, TOP + 0.05, cw - 0.1, 0.45, { b: true, sz: 10, c: p.head, al: 'center', va: 'middle', fit: [10, 8.5] }));
  rows.forEach((r, i) => {
    const y = TOP + 0.55 + i * rh;
    seg(s, L + 0.15, y, L + tw - 0.15, y, { c: p.cardLine, w: 0.75 });
    T(s, r.label, L + 0.25, y, lw - 0.35, rh, { sz: 11, b: !!r.strong, c: r.strong ? p.acc : p.text, va: 'middle', fit: [11, 9.5] });
    if ((r.marks || []).length !== cols.length) err(`row "${r.label}" needs ${cols.length} marks`);
    (r.marks || []).slice(0, cols.length).forEach((m, j) => {
      const d = Math.min(0.3, rh * 0.5), cx = L + lw + j * cw + cw / 2 - d / 2, cy = y + rh / 2 - d / 2;
      if (m === true || m === 1) circle(s, cx, cy, d, { fill: C.accent });
      else if (m === false || m === 0) circle(s, cx, cy, d, { line: p.d ? C.onDark2 : C.idle, lw: 1.5 });
      else if (m === 'warn') circle(s, cx, cy, d, { fill: C.warn });
      else seg(s, cx + d * 0.2, cy + d / 2, cx + d * 0.8, cy + d / 2, { c: p.mute, w: 1.5 });
    });
  });
  const ky = TOP + 0.5 + rh * rows.length + 0.25, k = sl.marks || {};
  if (!k.filled || !k.empty) err('"marks.filled" and "marks.empty" are required — say on the slide what a filled and an empty mark mean');
  let kx = L;
  [[true, k.filled], [false, k.empty], ['warn', k.warn], [null, k.none]].forEach(([m, t]) => {
    if (!t) return;
    if (m === true) circle(s, kx, ky + 0.03, 0.18, { fill: C.accent });
    else if (m === false) circle(s, kx, ky + 0.03, 0.18, { line: p.d ? C.onDark2 : C.idle, lw: 1.5 });
    else if (m === 'warn') circle(s, kx, ky + 0.03, 0.18, { fill: C.warn });
    else seg(s, kx + 0.02, ky + 0.12, kx + 0.16, ky + 0.12, { c: p.mute, w: 1.5 });
    const w = wText(t, false, 10) + 0.14;
    T(s, t, kx + 0.26, ky, w, 0.24, { sz: 10, c: p.mute, va: 'middle', one: true });
    kx += 0.26 + w + 0.35;
  });
  if (sl.aside) {
    const x = L + tw + 0.3, w = R - x;
    rrect(s, x, TOP, w, bot + 0.4 - TOP, { fill: C.deep });
    label(s, sl.aside.heading || LBL.takeaway, x + 0.3, TOP + 0.22, w - 0.6, { c: C.accentLight });
    body(s, sl.aside.bullets || sl.aside.text, x + 0.3, TOP + 0.62, w - 0.6, bot - TOP - 0.5, { sz: 12.5, c: C.white, pa: 8, fit: [12.5, 10] });
  }
};

/* An illustration of something the user will see: a screen with example data. */
L_.screen = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl), sc = sl.screen || {};
  const side = sl.side, fw = side ? 7.9 : CW, fx = L, fy = TOP, fh = bot - TOP;
  rect(s, fx, fy, fw, fh, { fill: C.deep });
  rect(s, fx, fy, fw, 0.4, { fill: C.deepest });
  T(s, String(sc.title || '').toUpperCase(), fx + 0.2, fy, fw - 3.2, 0.4, { b: true, sz: 9.5, cs: 1.1, c: C.white, va: 'middle', one: true, fit: [9.5, 8.5] });
  tag(s, sc.tag || LBL.illustration, fx + fw - 0.15, fy + 0.09);
  let y = fy + 0.55;
  const tiles = (sc.tiles || []).slice(0, 5);
  if ((sc.tiles || []).length > 5) err('"screen.tiles" holds 5 at most');
  if (tiles.length) {
    const tw = (fw - 0.4 - 0.15 * (tiles.length - 1)) / tiles.length;
    tiles.forEach((t, i) => {
      const x = fx + 0.2 + i * (tw + 0.15);
      rect(s, x, y, tw, 0.82, { fill: C.deep2, line: C.deepLine });
      T(s, t.label, x + 0.12, y + 0.07, tw - 0.24, 0.22, { sz: 9, c: C.onDark2, va: 'middle', one: true, fit: [9, 8.5] });
      T(s, t.value, x + 0.12, y + 0.32, tw - 0.24, 0.42, { f: 'd', sz: 16, c: t.warn ? C.warn : C.white, va: 'middle', one: true, fit: [16, 10.5] });
    });
    y += 1.0;
  }
  const bars = (sc.bars || []).slice(0, 6), rows = (sc.rows || []).slice(0, 6);
  if ((sc.bars || []).length > 6 || (sc.rows || []).length > 6) err('"screen.bars" and "screen.rows" hold 6 each at most');
  const colW = bars.length && rows.length ? (fw - 0.6) / 2 : fw - 0.4;
  const block = (x, title) => { T(s, String(title || '').toUpperCase(), x, y, colW, 0.22, { b: true, sz: 9, cs: 1.1, c: C.onDark2, va: 'middle', one: true, fit: [9, 8.5] }); };
  const avail = fy + fh - y - 0.6 - (sc.note ? 0.34 : 0);
  if (bars.length) {
    block(fx + 0.2, sc.barsTitle);
    const bp = Math.min(0.6, avail / bars.length);
    const max = Math.max(...bars.map(b => b.value), sc.barsMax || 0) || 1;
    bars.forEach((b, i) => {
      const by = y + 0.32 + i * bp;
      T(s, b.label, fx + 0.2, by, colW * 0.34, 0.26, { sz: 9.5, c: C.onDark, va: 'middle', one: true, fit: [9.5, 8.5] });
      rect(s, fx + 0.2 + colW * 0.36, by + 0.06, colW * 0.46, 0.14, { fill: C.deep2 });
      rect(s, fx + 0.2 + colW * 0.36, by + 0.06, Math.max(0.02, colW * 0.46 * (b.value / max)), 0.14, { fill: b.warn ? C.warn : C.accentLight });
      T(s, b.text || String(b.value), fx + 0.2 + colW * 0.84, by, colW * 0.16, 0.26, { b: true, sz: 9.5, c: C.white, al: 'right', va: 'middle', one: true, fit: [9.5, 8.5] });
    });
  }
  if (rows.length) {
    const rx = bars.length ? fx + 0.4 + colW : fx + 0.2;
    block(rx, sc.rowsTitle);
    const rp = Math.min(0.6, avail / rows.length);
    rows.forEach((r, i) => {
      const ry = y + 0.32 + i * rp, col = r.status === 'warn' ? C.warn : r.status === 'idle' ? C.idle : C.accentLight;
      circle(s, rx, ry + 0.07, 0.12, { fill: col });
      T(s, r.text || r, rx + 0.22, ry, colW - 0.22, 0.26, { sz: 9.5, c: C.white, va: 'middle', one: true, fit: [9.5, 8.5] });
    });
  }
  if (sc.note) T(s, sc.note, fx + 0.2, fy + fh - 0.38, fw - 0.4, 0.26, { sz: 9, c: C.onDark2, va: 'middle', one: true, fit: [9, 8.5] });
  if (side) {
    const x = fx + fw + 0.3, w = R - x, steps = (side.steps || []).slice(0, 5), nb = side.note ? 1.05 : 0;
    if ((side.steps || []).length > 5) err('"side.steps" holds 5 at most');
    label(s, side.heading || '', x, TOP, w, { c: p.acc });
    const sp = (bot - TOP - 0.4 - nb) / Math.max(steps.length, 1);
    steps.forEach((t, i) => {
      const sy = TOP + 0.4 + i * sp;
      if (side.numbered !== false) { num(s, i + 1, x, sy + 0.02, 0.38); if (i < steps.length - 1) arrow(s, x + 0.19, sy + 0.43, x + 0.19, sy + sp - 0.02, { w: 1.5 }); }
      else circle(s, x + 0.08, sy + 0.12, 0.14, { fill: C.accent });
      T(s, t, x + 0.55, sy, w - 0.55, sp - 0.1, { sz: 10.5, c: p.text, fit: [10.5, 9.5] });
    });
    if (side.note) { rrect(s, x, bot - 0.95, w, 0.95, { fill: p.soft }); T(s, side.note, x + 0.2, bot - 0.95, w - 0.4, 0.95, { sz: 10.5, c: p.text, va: 'middle', fit: [10.5, 9.5] }); }
  }
};

/* Left → right pairs: learned → applied, before → after, cause → action. */
L_.pairs = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const rows = need(sl, 'rows', 2, 6), lw = (CW - 0.5) * 0.47, rx = L + lw + 0.5, rw = R - rx;
  rrect(s, L, TOP, lw, 0.4, { fill: C.deep });
  T(s, String(sl.leftHead || '').toUpperCase(), L, TOP, lw, 0.4, { b: true, sz: 9.5, cs: 1.1, c: C.white, al: 'center', va: 'middle', one: true, fit: [9.5, 8.5] });
  rrect(s, rx, TOP, rw, 0.4, { fill: C.accent });
  T(s, String(sl.rightHead || '').toUpperCase(), rx, TOP, rw, 0.4, { b: true, sz: 9.5, cs: 1.1, c: C.white, al: 'center', va: 'middle', one: true, fit: [9.5, 8.5] });
  const pitch = Math.min(0.9, (bot - TOP - 0.5) / rows.length), h = pitch - 0.1;
  rows.forEach((r, i) => {
    const y = TOP + 0.5 + i * pitch;
    rrect(s, L, y, lw, h, { fill: p.card, line: p.cardLine });
    num(s, i + 1, L + 0.18, y + (h - 0.36) / 2, 0.36, { sz: 10.5, fill: C.deep });
    T(s, r.left, L + 0.7, y, lw - 0.9, h, { sz: 10.5, c: p.text, va: 'middle', fit: [10.5, 9.5] });
    arrow(s, L + lw + 0.06, y + h / 2, rx - 0.06, y + h / 2, { w: 2 });
    rrect(s, rx, y, rw, h, { fill: p.card, line: C.accent });
    T(s, r.right, rx + 0.2, y, rw - 0.4, h, { sz: 10.5, c: p.text, va: 'middle', fit: [10.5, 9.5] });
  });
};

/* ------------------------------------------------------------- build */
async function main() {
  if (!TOTAL) { console.error('deck.json has no "slides"'); process.exit(2); }
  for (let i = 0; i < slides.length; i++) {
    const sl = slides[i], layout = sl.layout;
    const s = pptx.addSlide();
    cur = { id: `slide ${i + 1} (${sl.id || layout})`, layout, tone: sl.tone || TONE[layout] || 'light', texts: [], notes: 0 };
    LINT.slides.push(cur);
    if (!L_[layout]) { err(`unknown layout "${layout}". Available: ${Object.keys(L_).join(', ')}`); continue; }
    s.background = { color: cur.tone === 'dark' ? C.deep : cur.tone === 'tint' ? C.tint : C.paper };
    await L_[layout](s, sl, i + 1);
    if (sl.notes && String(sl.notes).trim().length >= 60) { s.addNotes(String(sl.notes)); cur.notes = String(sl.notes).length; }
    else err('speaker notes are missing or too short — write what the presenter says for this slide');
  }
  cur = null;
  const sl = LINT.slides;
  sl.forEach((d, i) => {
    if (i > 0 && d.layout === sl[i - 1].layout) LINT.errors.push(`${d.id} — same layout as the slide before it (${d.layout}); pick another layout for one of them`);
    d.texts.forEach((a, ai) => d.texts.slice(ai + 1).forEach(b => {
      if (a.ov || b.ov) return;
      const ox = Math.min(a.ex + a.ew, b.ex + b.ew) - Math.max(a.ex, b.ex), oy = Math.min(a.ey + a.eh, b.ey + b.eh) - Math.max(a.ey, b.ey);
      if (ox > 0.03 && oy > 0.03) LINT.errors.push(`${d.id} — two texts overlap: ${a.id} and ${b.id}`);
    }));
    if (d.layout === 'agenda' || d.layout === 'section') LINT.warns.push(`${d.id} — this slide only organizes the deck; keep it only if the user asked for it or the deck is long`);
  });
  const distinct = new Set(sl.map(d => d.layout)).size;
  if (sl.length >= 8 && distinct / sl.length < 0.5) LINT.warns.push(`deck — only ${distinct} layouts for ${sl.length} slides; vary them`);
  let run = 0;
  sl.forEach(d => { run = d.tone === 'light' ? run + 1 : 0; if (run === 5) LINT.warns.push(`${d.id} — five plain light slides in a row; give one a tint or dark tone ("tone")`); });
  console.log(`lint: ${sl.length} slides, ${distinct} layouts, tones ${sl.map(d => d.tone[0].toUpperCase()).join('')}${faces.r ? '' : ' (no font files found: text fit is estimated)'}`);
  LINT.warns.forEach(w => console.log('  warn  ' + w));
  LINT.errors.forEach(e => console.log('  ERROR ' + e));
  if (LINT.placeholders.length) console.log('placeholders to replace: ' + [...new Set(LINT.placeholders)].join(' | '));
  if (LINT.errors.length && !FLAG('--force')) {
    console.error(`\n${LINT.errors.length} lint error(s). Fix them in ${path.basename(SRC)} and run again (or --force to write the file anyway).`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await pptx.writeFile({ fileName: OUT });
  console.log('wrote ' + OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
