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
/* Icons by name from react-icons: Fa (Font Awesome), Lu (Lucide, line), Pi (Phosphor, e.g. PiHandshakeLight),
 * Tb (Tabler), Fi (Feather), Md (Material), Ri (Remix), Bs (Bootstrap), Hi (Heroicons 2). */
const ICON_SETS = { Fa: 'fa', Lu: 'lu', Pi: 'pi', Tb: 'tb', Fi: 'fi', Md: 'md', Ri: 'ri', Bs: 'bs', Hi: 'hi2' }, ICON_LIB = { fa };
const iconComp = name => { const set = ICON_SETS[String(name).slice(0, 2)]; if (!set) return null; if (!(set in ICON_LIB)) ICON_LIB[set] = req('react-icons/' + set); return ICON_LIB[set] && ICON_LIB[set][name]; };
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
const B = deck.brand || {};

/* ------------------------------------------------------------- palette */
function mix(a, b, t) {
  const p = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const hex = v => String(v || '').replace('#', '').toUpperCase();
const bc = B.colors || {};
/* The look is editorial: a paper page, near-black ink, one accent, hairlines instead of boxes.
 * brand.theme picks one of the colour themes below; brand.colors overrides any of its colours:
 * primary (dark slides, strong blocks), accent (the one thing a slide is about), warn, paper, ink. */
const THEMES = {
  paper:    { paper: 'F4F1EA', ink: '1B1A17', primary: '24272B', accent: 'B4441C', warn: 'C98A1B' },  // warm paper, charcoal, terracotta
  ocean:    { paper: 'F2F4F5', ink: '111C24', primary: '0F3345', accent: '0A7AAB', warn: 'CC8A1E' },  // cool white, deep sea blue
  forest:   { paper: 'F1F1EA', ink: '181D19', primary: '1D3A2F', accent: '4C7A3D', warn: 'C2841A' },  // pale stone, deep green, moss
  graphite: { paper: 'F7F7F5', ink: '111111', primary: '1C1C1E', accent: '0066CC', warn: 'C27C0E' },  // near white, graphite, one blue
  navy:     { paper: 'F5F3EE', ink: '141A26', primary: '16233A', accent: 'A87C32', warn: 'C8612A' },  // ivory, navy, muted gold
};
const THEME = THEMES[B.theme] || THEMES.paper;
const PRIMARY = hex(bc.primary) || THEME.primary;
const ACCENT = hex(bc.accent) || THEME.accent;
const WARN = hex(bc.warn) || THEME.warn;
const PAPER = hex(bc.paper) || THEME.paper;
const INK = hex(bc.ink) || THEME.ink;
// neutrals lie between the ink and the paper, so greys, lines and backgrounds belong to one warm family
const nt = t => mix(INK, PAPER, t);
const C = {
  deep: PRIMARY, deep2: mix(PRIMARY, 'FFFFFF', 0.08), deepLine: mix(PRIMARY, 'FFFFFF', 0.24), deepest: mix(PRIMARY, '000000', 0.28),
  accent: ACCENT, accentTint: mix(ACCENT, PAPER, 0.88), accentLight: mix(ACCENT, 'FFFFFF', 0.45),
  warn: WARN, warnTint: mix(WARN, PAPER, 0.8), warnDark: mix(WARN, '000000', 0.5),
  tint: hex(bc.tint) || mix(PAPER, INK, 0.05),
  ink: INK, muted: nt(0.32), source: nt(0.44), paper: PAPER,
  white: 'FFFFFF', line: nt(0.86), rule: nt(0.74), grey: mix(PAPER, INK, 0.07), greyLine: nt(0.72),
  idle: nt(0.6), bad: hex(bc.bad) || 'B42318',
  onDark: mix(PAPER, PRIMARY, 0.06), onDark2: mix(PAPER, PRIMARY, 0.3),
};
const SERIES = [C.accent, C.deep, C.warn, C.accentLight, C.idle, C.warnDark];
/* Type. Headlines, big numbers and quotations in Georgia, a serif every PowerPoint has. Everything
 * else in Aptos — the Office default since 2023, shipped with PowerPoint — when its files are on this
 * machine: Aptos SemiBold for anything bold, Aptos for body, Consolas for code; otherwise Arial.
 * brand.fonts { head, body } overrides them. */
const os = require('os');
const FONT_DIRS = ['/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts', path.join(os.homedir(), 'Library/Fonts'), '/Library/Fonts', '/System/Library/Fonts/Supplemental',
  'C:/Windows/Fonts', path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Windows/Fonts'), path.join(os.homedir(), '.local/share/fonts'), '/usr/share/fonts/truetype/aptos', '/usr/share/fonts/aptos',
  '/usr/share/fonts/truetype/msttcorefonts', '/usr/share/fonts/truetype/georgia'];
const findFont = names => { for (const d of FONT_DIRS) for (const n of names) { const f = path.join(d, n); if (fs.existsSync(f)) return f; } return null; };
const APTOS = { r: findFont(['Aptos.ttf', 'aptos.ttf']), b: findFont(['Aptos-Bold.ttf', 'aptos-bold.ttf']), d: findFont(['Aptos-SemiBold.ttf', 'aptos-semibold.ttf']), n: findFont(['Aptos-Light.ttf', 'aptos-light.ttf']) };
const SERIF = { r: findFont(['Georgia.ttf', 'georgia.ttf']), i: findFont(['Georgia Italic.ttf', 'georgiai.ttf', 'Georgia_Italic.ttf']) };
const CUSTOM = B.fonts && (B.fonts.head || B.fonts.body);
const USE_APTOS = !CUSTOM && !process.env.DECK_ARIAL && APTOS.r && APTOS.b && APTOS.d && APTOS.n;
/* brand.style: "editorial" (headlines in the serif; the default) or "bold" (headlines in heavy Aptos in the
 * deep colour, the look of a corporate infographic deck). */
const STYLE = B.style === 'bold' ? 'bold' : 'editorial';
const HEAD = (B.fonts && B.fonts.head) || (STYLE === 'bold' ? 'Aptos' : 'Georgia');
// big numbers are set in Aptos Light: its figures line up (Georgia's old-style figures dance at display sizes)
const FONT = USE_APTOS ? { d: 'Aptos SemiBold', n: 'Aptos Light', h: HEAD, b: 'Aptos', m: 'Consolas' }
  : { d: (B.fonts && B.fonts.body) || 'Arial', n: (B.fonts && B.fonts.body) || 'Arial', h: HEAD, b: (B.fonts && B.fonts.body) || 'Arial', m: 'Courier New' };
/* weight-named families (Aptos SemiBold) are set without the bold flag, or PowerPoint fakes a bolder cut;
 * the serif is set in its regular weight */
const FONT_BOLD = { d: !USE_APTOS, n: false, h: STYLE === 'bold' && !(B.fonts && B.fonts.head) };
/* The type scale. Fitted text steps down through these sizes only, so the same sizes recur from slide
 * to slide instead of every slide finding its own. */
const SCALE = [200, 170, 150, 130, 120, 110, 96, 88, 72, 60, 52, 44, 40, 36, 32, 28, 24, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10.5, 10, 9.5, 9, 8.5, 8];
const sizesIn = (max, min) => { const xs = SCALE.filter(v => v <= max + 1e-6 && v >= min - 1e-6); if (!xs.length || xs[xs.length - 1] > min) xs.push(min); return xs; };
const LANG = (deck.meta && deck.meta.lang) || 'en-US';
/* Words the renderer supplies itself follow the deck language; override any of them in meta.labels. */
const LBL = Object.assign(/^id/i.test(LANG)
  ? { illustration: 'ILUSTRASI · ANGKA CONTOH', screenshot: 'CONTOH TAMPILAN', takeaway: 'Yang terlihat', result: 'Hasil:', image: 'gambar',
      status: { done: 'Selesai', ok: 'Sesuai rencana', risk: 'Berisiko', late: 'Terlambat', idle: 'Belum mulai' },
      statusHead: { name: 'Pekerjaan', status: 'Status', progress: 'Progres', text: 'Keterangan', owner: 'PIC' },
      continued: 'lanjutan', continuedNotes: 'Tabel ini lanjutan dari slide sebelumnya.\nRujuk barisnya bila ditanya; tidak perlu dibacakan satu per satu.' }
  : { illustration: 'ILLUSTRATION · EXAMPLE DATA', screenshot: 'SCREENSHOT', takeaway: 'What it shows', result: 'Result:', image: 'image',
      status: { done: 'Done', ok: 'On track', risk: 'At risk', late: 'Late', idle: 'Not started' },
      statusHead: { name: 'Work item', status: 'Status', progress: 'Progress', text: 'Note', owner: 'Owner' },
      continued: 'continued', continuedNotes: 'This table continues from the previous slide.\nRefer to its rows when asked; there is no need to read them out one by one.' },
  (deck.meta && deck.meta.labels) || {});

/* A table longer than one slide holds ("perSlide", default 12 rows) continues on the next slides,
 * with the same head, the title marked as continued, and a short note. */
function expandSlides(list) {
  const out = [];
  list.forEach(sl => {
    const per = sl.perSlide || 12;
    if (sl.layout !== 'table' || !Array.isArray(sl.rows) || sl.rows.length <= per) { out.push(sl); return; }
    // balanced: 16 rows at 12 per slide become 8 + 8, not 12 + 4
    const n = Math.ceil(sl.rows.length / per), pp = Math.ceil(sl.rows.length / n);
    for (let k = 0; k < n; k++) {
      const rows = sl.rows.slice(k * pp, (k + 1) * pp);
      out.push({ ...sl, rows, id: `${sl.id || 'table'}${k ? '-' + (k + 1) : ''}`, title: k ? `${sl.title} (${LBL.continued})` : sl.title, _cont: k > 0, _page: [k + 1, n],
        total: !!sl.total && k === n - 1, highlight: (sl.highlight || []).filter(r => r >= k * pp && r < (k + 1) * pp).map(r => r - k * pp),
        notes: k ? (sl.notesContinued || LBL.continuedNotes) : sl.notes, covers: k ? [] : sl.covers, band: k === n - 1 ? sl.band : undefined });
    }
  });
  return out;
}
const slides = expandSlides(deck.slides || []);
const TOTAL = slides.length;

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.title = (deck.meta && deck.meta.title) || path.basename(OUT, '.pptx');
pptx.author = (deck.meta && deck.meta.author) || '';
pptx.company = B.name || '';
pptx.theme = { headFontFace: FONT.d, bodyFontFace: FONT.b };

const W = 13.333, H = 7.5, L = 0.6, R = W - 0.6, CW = R - L, TOP0 = 1.72;
/* Where content starts. head() moves it up under a one-line title, so no band of air sits between the
 * title and the content; it is reset for every slide. */
let TOP = TOP0;

/* ------------------------------------------------------------- font metrics (for lint) */
const faces = {};
(function loadFaces() {
  if (!ot || process.env.DECK_NO_FONTS) return;
  const load = f => { const buf = fs.readFileSync(f); return ot.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); };
  // the serif for headlines and numbers; a custom head face or a missing Georgia is measured as the bold sans
  const serif = () => {
    if (B.fonts && B.fonts.head) { faces.h = faces.d; faces.hi = faces.d; return; }
    if (STYLE === 'bold') { faces.h = faces.b; faces.hi = faces.r; return; }
    try { faces.h = load(SERIF.r); faces.hi = SERIF.i ? load(SERIF.i) : faces.h; } catch (e) { faces.h = faces.d; faces.hi = faces.d; }
  };
  if (USE_APTOS) {
    try { faces.r = load(APTOS.r); faces.b = load(APTOS.b); faces.d = load(APTOS.d); faces.n = load(APTOS.n); serif(); return; } catch (e) { /* fall back to Arial metrics */ }
  }
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
      faces.r = load(r); faces.b = load(b); faces.d = faces.b; faces.n = faces.r; serif(); return;
    } catch (e) { /* try the next set */ }
  }
})();
function wText(str, bold, sz, cs = 0, mono = false, f = 'b', it = false) {
  if (mono) return (str.length * sz * 0.6 + cs * str.length) / 72;
  if (!faces.r) return (str.length * sz * (bold || f === 'd' || f === 'n' || f === 'h' ? 0.56 : 0.52) + cs * str.length) / 72; // estimate without font files
  const face = f === 'h' ? (it ? faces.hi : faces.h) : f === 'd' ? faces.d : f === 'n' ? faces.n : bold ? faces.b : faces.r;
  return (face.getAdvanceWidth(str, sz) + cs * str.length) / 72;
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
      if (/^\s+$/.test(tok)) { if (open) { words.push(w); w = 0; open = false; } words.push({ sp: wText(' ', r.b, r.sz, r.cs, r.f === 'm', r.f, r.i) }); return; }
      w += wText(tok, r.b, r.sz, r.cs, r.f === 'm', r.f, r.i); open = true;
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
/** Text box. content: string | runs [{t, b, i, c, sz, f, br, bullet}].
 *  o: f ('h' serif headline | 'd' bold sans | 'n' number | 'b' body | 'm' mono), sz, c, b, i (italic), al, va, ls, cs, pa,
 *  one (single line), fit [max, min], ov (may overlap).
 *  With fit, the largest size in the range that fits is used, so text grows into the room it has. */
function measureT(content, w, o, size) {
  const raw = Array.isArray(content) ? content : [{ t: content }];
  const runs = raw.map(r => {
    let f = r.f || o.f || 'b';
    // with Aptos the deck uses three weights only: Regular, SemiBold for anything bold, ExtraBold for big numbers
    if (USE_APTOS && f === 'b' && (r.b !== undefined ? r.b : !!o.b)) f = 'd';
    // in the bold style an italic caption is set in the body face, not in the heavy headline face
    if (STYLE === 'bold' && f === 'h' && (r.i !== undefined ? r.i : !!o.i)) f = 'b';
    return { t: String(r.t), f, sz: r.sz || size, c: r.c || o.c || C.ink, b: f in FONT_BOLD ? FONT_BOLD[f] : (r.b !== undefined ? r.b : !!o.b), i: r.i !== undefined ? !!r.i : !!o.i, cs: r.cs || o.cs || 0, br: !!r.br, bullet: !!r.bullet };
  });
  const maxSz = Math.max(...runs.map(r => r.sz));
  const role = o.f || 'b';
  const ls = o.ls ? o.ls * (size / (o.sz || size)) : Math.round(maxSz * (role === 'n' ? 1.0 : role === 'h' ? 1.1 : role === 'd' ? 1.12 : 1.24) * 10) / 10;
  const m = wrap(runs, w, runs.some(r => r.bullet) ? 0.2 : 0);
  const gaps = o.pa ? (runs.filter(r => r.br).length * o.pa) / 72 : 0;
  return { runs, ls, m, needH: (m.lines * ls) / 72 + gaps, maxSz };
}
const fitsAt = (content, w, h, o, size) => { const r = measureT(content, w, o, size); return !r.m.wide && r.needH <= h + 0.03 && !(o.one && r.m.lines > 1); };
/** One size for a set of sibling texts (the bodies of cards in a row), so a row never mixes sizes:
 *  the largest size in fit at which every one of them fits. list: [[content, w, h, o], …] */
function uni(list, fit) {
  const xs = list.filter(q => q[0] !== undefined && q[0] !== null && q[0] !== '');
  for (const sz of sizesIn(fit[0], fit[1])) if (xs.every(([c, w, h, o]) => fitsAt(Array.isArray(c) && typeof c[0] === 'string' ? bulletRuns(c) : c, w, h, o || {}, sz))) return [sz, fit[1]];
  return [fit[1], fit[1]];
}
const bulletRuns = v => v.map((t, i) => ({ t, bullet: true, br: i < v.length - 1 }));
/** Splits runs where the measured lines end, marking each line start as a soft break. PowerPoint may
 *  break a line at a hyphen ("di-review", "AI-Powered"); with the breaks set here it keeps such a
 *  word whole, as it was measured. */
function breakRuns(runs, boxW) {
  const avail = boxW * 0.98, out = [];
  let lineW = 0, pend = 0;
  runs.forEach(r => {
    let buf = '', sb = false;
    r.t.split(/(\s+)/).filter(Boolean).forEach(tok => {
      if (/^\s+$/.test(tok)) { pend = wText(' ', r.b, r.sz, r.cs, r.f === 'm', r.f, r.i); buf += tok; return; }
      const x = wText(tok, r.b, r.sz, r.cs, r.f === 'm', r.f, r.i);
      if (lineW > 0 && lineW + pend + x > avail) {
        if (buf.trim()) out.push({ ...r, t: buf.replace(/\s+$/, ''), sb });
        buf = ''; sb = true; lineW = x;
      } else lineW += (lineW > 0 ? pend : 0) + x;
      buf += tok; pend = 0;
    });
    if (buf) out.push({ ...r, t: buf, sb });
  });
  return out;
}
function T(s, content, x, y, w, h, o = {}) {
  if (content === undefined || content === null || content === '') return;
  let size = o.sz || 12;
  let res = measureT(content, w, o, size);
  if (o.fit) {
    let ok = false;
    for (const sz of sizesIn(o.fit[0], o.fit[1])) {
      size = sz; res = measureT(content, w, o, size);
      if (!res.m.wide && res.needH <= h + 0.03 && !(o.one && res.m.lines > 1)) { ok = true; break; }
    }
    if (!ok) { size = o.fit[1]; res = measureT(content, w, o, size); }
  }
  const { runs, ls, m, needH, maxSz } = res;
  const hyph = m.lines > 1 && !runs.some(r => r.bullet || r.br || /\n/.test(r.t)) && runs.some(r => /\p{L}-\p{L}/u.test(r.t));
  const out = (hyph ? breakRuns(runs, w) : runs).map(r => {
    const opt = { fontFace: FONT[r.f], fontSize: r.sz, color: r.c, bold: r.b, breakLine: r.br, lang: LANG };
    if (r.sb) opt.softBreakBefore = true;
    if (r.i) opt.italic = true;
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
  ink(ex, ey, ew, eh);
  return { size, needH, lines: m.lines };
}
/* Ink: what the eye sees as content (text, pictures, charts, tables, marks, colour blocks). Light
 * cards and panels are containers, not ink, so a card with a short text inside still counts as
 * empty space. Lint uses this to find the slide's largest empty area. */
const ink = (x, y, w, h) => { if (cur && w > 0 && h > 0) cur.ink.push({ x, y, w, h }); };
const lum = c => { const v = [0, 2, 4].map(i => parseInt(hex(c).slice(i, i + 2), 16) / 255); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const bgOf = () => (cur.tone === 'dark' ? C.deep : cur.tone === 'tint' ? C.tint : C.paper);
function shape(s, type, x, y, w, h, o = {}) {
  const sh = { x, y, w, h };
  // Hairline borders around light cards make every slide look like a form. A light card is a flat
  // tile on the paper, without border or shadow (o.keepLine keeps the border where it carries meaning).
  if (o.line && o.line === C.line && !o.keepLine && !o.dash) o = { ...o, line: undefined };
  if (o.fill) sh.fill = o.alpha ? { color: o.fill, transparency: o.alpha } : { color: o.fill };
  if (o.line) sh.line = { color: o.line, width: o.lw || 1, dashType: o.dash };
  if (o.r !== undefined) sh.rectRadius = o.r;
  // cards and panels get a subtle diagonal gradient instead of a flat fill; stripes on their edges are
  // not used (a gradient towards a warm or red tint marks a card that needs attention)
  const g = (type === 'rect' || type === 'roundRect') && o.fill && !o.alpha && !o.noGrad && w * h >= 0.9 && Math.min(w, h) >= 0.3 ? gradTo(o.fill, o.grad) : null;
  if (g) sh.objectName = `grad:${hex(o.fill)}:${g}${o.gradAng !== undefined ? ':' + o.gradAng : ''}`;
  if (o.shadow) sh.shadow = { type: 'outer', color: '000000', opacity: 0.14, blur: 18, offset: 5, angle: 90 };
  s.addShape(type, sh);
  // small marks are ink; a large shape is ink only when its colour stands out from the slide
  if (o.fill && !o.noInk && (w * h < 1.0 || Math.min(w, h) < 0.15 || (!o.alpha && Math.abs(lum(o.fill) - lum(bgOf())) > 0.3))) ink(x, y, w, h);
  else if (cur && !o.noInk && (o.fill || o.line) && w * h >= 1.0) cur.boxes.push({ x, y, w, h });
}
/** The far colour of a card's gradient: towards the paper on white tiles, towards the accent and lighter
 *  on dark ones, a little lighter on strong colours. "to" overrides it (a tint for state). */
function gradTo(fill, to) {
  if (to) return hex(to);
  const f = hex(fill), l = lum(f);
  if (l > 0.82) return mix(f, mix(PAPER, INK, 0.03), 0.8);
  if (l < 0.3) return mix(f, mix(ACCENT, 'FFFFFF', 0.2), 0.2);
  return mix(f, 'FFFFFF', 0.16);
}
const rect = (s, x, y, w, h, o) => shape(s, 'rect', x, y, w, h, o);
/** A filled polygon through slide points [[x, y], …] (inches): diamonds split in four, chevrons,
 *  pyramid bands, slanted stripes. o: fill, grad (far colour), gradAng, alpha, line, lw, noInk. */
function poly(s, pts, o = {}) {
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(0.01, Math.max(...xs) - x0), h = Math.max(0.01, Math.max(...ys) - y0);
  const points = pts.map(([x, y], i) => (i === 0 ? { x: x - x0, y: y - y0, moveTo: true } : { x: x - x0, y: y - y0 }));
  points.push({ close: true });
  const sh = { x: x0, y: y0, w, h, points };
  if (o.fill) sh.fill = o.alpha ? { color: o.fill, transparency: o.alpha } : { color: o.fill };
  if (o.line) sh.line = { color: o.line, width: o.lw || 1, dashType: o.dash };
  if (o.grad && o.fill) sh.objectName = `grad:${hex(o.fill)}:${hex(o.grad)}${o.gradAng !== undefined ? ':' + o.gradAng : ''}`;
  s.addShape('custGeom', sh);
  if (!o.noInk) ink(x0, y0, w, h);
}
/** The colours infographic shapes take, in order: the deep colour, the accent, a light accent, a light
 *  deep. Two hues only, so a diagram of four parts still looks calm. */
const FAM = () => [C.deep, C.accent, mix(ACCENT, PAPER, 0.45), mix(PRIMARY, PAPER, 0.42)];
/** A colour dark enough for text on the paper: light fills give their text a darker shade. */
const inkOf = c => (lum(c) > 0.55 ? mix(c, INK, 0.45) : c);
const rrect = (s, x, y, w, h, o = {}) => shape(s, 'roundRect', x, y, w, h, { r: 0.1, ...o });
const circle = (s, x, y, d, o) => shape(s, 'ellipse', x, y, d, d, o);
function arrow(s, x1, y1, x2, y2, o = {}) {
  s.addShape('line', {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipH: x2 < x1, flipV: y2 < y1,
    line: { color: o.c || C.accent, width: o.w || 1.75, endArrowType: o.head === false ? undefined : 'triangle', dashType: o.dash },
  });
  if (!o.noInk) ink(Math.min(x1, x2), Math.min(y1, y2), Math.max(Math.abs(x2 - x1), 0.02), Math.max(Math.abs(y2 - y1), 0.02));
}
const seg = (s, x1, y1, x2, y2, o = {}) => arrow(s, x1, y1, x2, y2, { ...o, head: false });
/** A label in spaced capitals: the editorial small heading. */
const label = (s, t, x, y, w, o = {}) => T(s, String(t).toUpperCase(), x, y, w, 0.22, { sz: 9, cs: 2, c: C.accent, va: 'middle', one: true, fit: [9, 8], ...o });
function tag(s, t, xRight, y) {
  const w = wText(t, true, 8.5, 1.2, false, 'd') + 0.26, d = pal().d;
  rect(s, xRight - w, y, w, 0.22, { fill: d ? C.paper : C.ink, noGrad: true });
  T(s, String(t).toUpperCase(), xRight - w, y, w, 0.22, { b: true, sz: 8.5, cs: 1.2, c: d ? C.ink : C.paper, al: 'center', va: 'middle', one: true });
}
/** A number tag: a small square in the accent with the number in white. It labels a region on a
 *  picture (sitting on the region's outline) and the matching point in the list beside it. */
function num(s, n, x, y, d, o = {}) {
  rect(s, x, y, d, d, { fill: o.fill || C.accent, noGrad: true });
  T(s, String(n), x, y, d, d, { b: true, sz: o.sz || 10, c: o.c || C.white, al: 'center', va: 'middle', one: true, ov: true });
}
/** The number of a step, a finding or an agenda item: "01", small, in the bold sans, quiet. The order
 *  is read from it; it is not a picture. */
function numeral(s, n, x, y, w, h, o = {}) {
  return T(s, String(n).padStart(2, '0'), x, y, w, h, { f: 'd', sz: o.big ? 15 : 13, cs: 1, c: o.c || (pal().d ? C.onDark2 : C.muted), va: o.va || 'top', one: true });
}
/** A string becomes a paragraph, an array becomes bullets. */
function body(s, v, x, y, w, h, o = {}) {
  if (!v) return;
  if (Array.isArray(v)) T(s, v.map((t, i) => ({ t, bullet: true, br: i < v.length - 1 })), x, y, w, h, { pa: 4, ...o });
  else T(s, v, x, y, w, h, o);
}
/** A panel's heading and its text as one block: centred in the room it has when the text is short,
 *  so a short note does not leave the heading at the top and the text floating below it. */
function panelText(s, heading, v, x, y, w, h, o, lc) {
  const hh = heading ? 0.42 : 0, oo = Array.isArray(v) ? { pa: 4, ...o } : o;
  if (!v) { if (heading) label(s, heading, x, y, w, { c: lc }); return; }
  const content = Array.isArray(v) ? bulletRuns(v) : v;
  let size = o.fit[1];
  for (const sz of sizesIn(o.fit[0], o.fit[1])) if (fitsAt(content, w, h - hh, oo, sz)) { size = sz; break; }
  const need = measureT(content, w, oo, size).needH, y0 = y + Math.max(0, (h - hh - need) / 2);
  if (heading) label(s, heading, x, y0, w, { c: lc });
  body(s, v, x, y0 + hh, w, h - (y0 - y) - hh, { ...o, va: 'top', fit: [size, o.fit[1]] });
}
/** The point beside a chart, a table or a drawing, without a panel: a hairline, a label in spaced
 *  capitals and the text, set as one block in the middle of the column. */
function sideNote(s, heading, v, x, y, w, h, o = {}) {
  if (!v) return;
  const p = pal(), content = Array.isArray(v) ? bulletRuns(v) : v, oo = Array.isArray(v) ? { pa: 8 } : {}, fit = o.fit || [19, 11], hh = heading ? 0.42 : 0;
  let size = fit[1];
  for (const sz of sizesIn(fit[0], fit[1])) if (fitsAt(content, w, h - hh - 0.2, oo, sz)) { size = sz; break; }
  const need = measureT(content, w, oo, size).needH, y0 = y + Math.max(0, (h - hh - 0.2 - need) / 2);
  seg(s, x, y0, x + w, y0, { c: p.d ? C.deepLine : C.ink, w: 1 });
  if (heading) label(s, heading, x, y0 + 0.14, w, { c: p.acc });
  body(s, v, x, y0 + 0.2 + hh, w, h - (y0 - y) - 0.2 - hh, { c: p.text, pa: 8, fit: [size, fit[1]] });
}
const lead = (a, b, c1, c2) => [{ t: a + ' ', b: true, c: c1 }, { t: b || '', c: c2 }];
/** A change against a target or an earlier period: a small triangle (up for "+", down for "-") in
 *  green when good, red when bad, grey when neither, and the text beside it. */
function delta(s, text, good, x, y, w, sz = 12, fit) {
  const t = String(text), down = /^\s*[-−–▼]/.test(t), col = good === true ? (pal().d ? C.accentLight : C.accent) : good === false ? C.bad : C.idle;
  const d = sz / 72 * 0.8;
  s.addShape('triangle', { x, y: y + (0.3 - d) / 2, w: d, h: d * 0.85, fill: { color: col }, rotate: down ? 180 : 0 });
  ink(x, y, d, d);
  T(s, t.replace(/^\s*[▲▼]\s*/, ''), x + d + 0.08, y, w - d - 0.08, 0.3, { b: true, sz, c: col, va: 'middle', one: true, fit: fit || [sz, 8.5] });
}

/* icons: react-icons name -> PNG; falls back to a plain dot when the libraries are missing */
const ICONS = {};
async function iconData(name, color) {
  if (!sharp || !React || !RDS) return null;
  const comp = iconComp(name);
  if (!comp) { warn(`unknown icon "${name}" (react-icons names: FaTruck, LuTruck, PiTruckLight, TbTruck, …)`); return null; }
  const k = name + color;
  if (!ICONS[k]) {
    const svg = RDS.renderToStaticMarkup(React.createElement(comp, { color: '#' + color, size: 256 }));
    const buf = await sharp(Buffer.from(svg)).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    ICONS[k] = 'image/png;base64,' + buf.toString('base64');
  }
  return ICONS[k];
}
async function icon(s, name, x, y, d, color) {
  const data = name ? await iconData(name, color || C.accent) : null;
  if (data) { s.addImage({ data, x, y, w: d, h: d }); ink(x, y, d, d); }
  else circle(s, x + d * 0.3, y + d * 0.3, d * 0.4, { fill: color || C.accent });
}
/** A small picture (a logo or an illustration) in the place of an icon: kept whole, never cropped. */
function mark(s, file, x, y, w, h, al = 'left') { return image(s, file, x, y, w, h, { al, logo: true, va: 'middle' }); }
/** An icon drawn plain, without a disc behind it: a row of tinted discs with icons is the first thing
 *  that makes a deck look generated. Real pictures and logos ("image") are better still. */
async function badge(s, name, x, y, d, o = {}) {
  await icon(s, name, x + d * 0.12, y + d * 0.12, d * 0.76, o.c || C.accent);
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
/** Draw an image inside a box, keeping its proportions. Returns the width used.
 *  o: al (left | right | center), plate (white plate behind, for logos on dark slides), alt (placeholder text),
 *  va (top | bottom | middle), out (object that receives the drawn x, y, w, h),
 *  logo (a small mark: no resolution or fill check), matte (the picture sits on a deliberate background: no fill check). */
function image(s, file, x, y, w, h, o = {}) {
  const f = file ? abs(file) : null;
  const size = f && fs.existsSync(f) ? imgSize(f) : null;
  if (!size) {
    rrect(s, x, y, w, h, { line: C.greyLine, dash: 'dash', fill: cur.tone === 'dark' ? C.deep2 : C.white });
    T(s, `[${o.alt || (file ? path.basename(file) : LBL.image)}]`, x + 0.1, y, w - 0.2, h, { sz: 9.5, c: C.muted, al: 'center', va: 'middle' });
    ink(x, y, w, h);
    if (file) warn(`image not found or not PNG/JPG: ${file}`);
    return w;
  }
  const k = Math.min(w / size[0], h / size[1]);
  const iw = size[0] * k, ih = size[1] * k;
  const ix = o.al === 'left' ? x : o.al === 'right' ? x + w - iw : x + (w - iw) / 2;
  const iy = o.va === 'top' ? y : o.va === 'bottom' ? y + h - ih : y + (h - ih) / 2;
  if (o.plate) rrect(s, ix - 0.1, iy - 0.07, iw + 0.2, ih + 0.14, { fill: C.white, r: 0.06 });
  s.addImage({ path: f, x: ix, y: iy, w: iw, h: ih });
  ink(ix, iy, iw, ih);
  if (o.out) Object.assign(o.out, { x: ix, y: iy, w: iw, h: ih });
  // About 80 pixels per inch is the least that still looks sharp on a projector.
  if (!o.logo && size[0] / iw < 80) warn(`image ${path.basename(f)} is ${size[0]} px wide but shown ${iw.toFixed(1)} in wide; it may look blurry — use a larger original or show it smaller`);
  // A picture that leaves most of its frame empty reads as unfinished.
  const fill = (iw * ih) / (w * h);
  if (!o.logo && !o.matte && fill < 0.5) warn(`image ${path.basename(f)} fills only ${Math.round(fill * 100)}% of its frame — crop it to the frame ("fit": "cover"), crop the source to the part that matters, or use a layout shaped like the picture`);
  return iw;
}
/** What a picture's border looks like: cut out (transparent), or a plain background colour, or neither (a photo).
 *  Used to keep a borrowed picture from showing as a box inside a box. */
const INFO = {};
async function pictureInfo(file) {
  const f = file ? abs(file) : null;
  if (!f || !fs.existsSync(f) || !sharp) return null;
  if (f in INFO) return INFO[f];
  try {
    const { data } = await sharp(f).ensureAlpha().resize(48, 48, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const px = [];
    for (let i = 0; i < 48; i++) [[i, 0], [i, 47], [0, i], [47, i]].forEach(([x, y]) => { const o = (y * 48 + x) * 4; px.push([data[o], data[o + 1], data[o + 2], data[o + 3]]); });
    const solid = px.filter(q => q[3] > 40), mean = [0, 1, 2].map(c => solid.reduce((a, q) => a + q[c], 0) / Math.max(1, solid.length));
    const spread = solid.length ? Math.max(...solid.map(q => Math.max(...[0, 1, 2].map(c => Math.abs(q[c] - mean[c]))))) : 0;
    const hex2 = v => Math.round(v).toString(16).padStart(2, '0');
    INFO[f] = { cutout: solid.length < px.length * 0.4, plain: solid.length >= px.length * 0.4 && spread < 28, edge: mean.map(hex2).join('').toUpperCase() };
  } catch (e) { INFO[f] = null; }
  return INFO[f];
}
/** A soft round light (radial gradient) as an image: behind cut-outs, and as depth on dark slides. */
const GLOWS = {};
async function glow(s, x, y, w, h, color, opacity) {
  if (!sharp) return;
  const key = color + opacity;
  if (!GLOWS[key]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><radialGradient id="g"><stop offset="0" stop-color="#${color}" stop-opacity="${opacity}"/><stop offset="0.55" stop-color="#${color}" stop-opacity="${(opacity * 0.35).toFixed(3)}"/><stop offset="1" stop-color="#${color}" stop-opacity="0"/></radialGradient></defs><circle cx="200" cy="200" r="200" fill="url(#g)"/></svg>`;
    GLOWS[key] = 'image/png;base64,' + (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
  }
  s.addImage({ data: GLOWS[key], x, y, w, h });
}
/** A drawn browser window around a screenshot. Returns the box the screenshot goes in. */
const BAR = 0.3;
function browserFrame(s, x, y, w, h) {
  rrect(s, x, y, w, h, { fill: C.white, line: C.line, r: 0.05, shadow: true });
  rect(s, x + 0.03, y + BAR - 0.01, w - 0.06, 0.01, { fill: C.line });
  for (let i = 0; i < 3; i++) circle(s, x + 0.14 + i * 0.17, y + 0.1, 0.1, { fill: 'D3DAE0' });
  if (w > 1.6) rrect(s, x + 0.72, y + 0.07, Math.min(3.2, w - 0.95), 0.16, { fill: C.grey, r: 0.08 });
  return { x: x + 0.05, y: y + BAR, w: w - 0.1, h: h - BAR - 0.05 };
}
/** Like image(), but with o.fit === 'cover' the picture is cropped to fill the whole box (sharp does the crop).
 *  o.focus: [x, y] in fractions of the picture, the point that stays in view (default the centre). */
const CROPS = {};
async function pic(s, file, x, y, w, h, o = {}) {
  const f = file ? abs(file) : null;
  const size = f && fs.existsSync(f) ? imgSize(f) : null;
  if (size && o.backdrop && o.fit !== 'cover') {
    const inf = await pictureInfo(file);
    if (inf && inf.plain) {
      const k = Math.min(w / size[0], h / size[1]), iw = size[0] * k, ih = size[1] * k;
      const ix = o.al === 'left' ? x : o.al === 'right' ? x + w - iw : x + (w - iw) / 2, iy = o.va === 'top' ? y : y + (h - ih) / 2;
      rrect(s, ix - 0.12, iy - 0.12, iw + 0.24, ih + 0.24, { fill: inf.edge, r: 0.06 });
      return image(s, file, x, y, w, h, { ...o, matte: true });
    }
  }
  if (!size || o.fit !== 'cover' || !sharp) return image(s, file, x, y, w, h, o);
  const [W0, H0] = size, want = w / h;
  let cw = W0, ch = Math.round(W0 / want);
  if (ch > H0) { ch = H0; cw = Math.round(H0 * want); }
  const fx = (o.focus && o.focus[0] !== undefined) ? o.focus[0] : 0.5, fy = (o.focus && o.focus[1] !== undefined) ? o.focus[1] : 0.5;
  const left = Math.round(Math.min(Math.max(fx * W0 - cw / 2, 0), W0 - cw));
  const top = Math.round(Math.min(Math.max(fy * H0 - ch / 2, 0), H0 - ch));
  const key = `${f}|${left},${top},${cw},${ch}`;
  if (!CROPS[key]) {
    const jpg = /\.jpe?g$/i.test(f);
    const im = sharp(f).extract({ left, top, width: cw, height: ch });
    const buf = await (jpg ? im.jpeg({ quality: 90 }) : im.png()).toBuffer();
    CROPS[key] = `image/${jpg ? 'jpeg' : 'png'};base64,` + buf.toString('base64');
  }
  s.addImage({ data: CROPS[key], x, y, w, h });
  ink(x, y, w, h);
  if (o.out) Object.assign(o.out, { x, y, w, h });
  if (cw / w < 80) warn(`image ${path.basename(f)}: the part shown is ${cw} px wide over ${w.toFixed(1)} in; it may look blurry — show it smaller or find a larger original`);
  return w;
}
/* Logos: "key": "file.png" or { "light": "file.png", "dark": "file-white.png" }. On dark slides the
 * supplied dark variant is used where a layout puts a logo on a dark area. */
const LOGOS = {}, LOGO_DARK = {};
/* Logos keep their own colours. The header logos always sit on the paper colour: on a dark slide the
 * masthead becomes a light band across the top. A logo is only shown in another colour when the brand
 * supplies that version itself ("dark"), and then only where the layout puts a logo on a dark area. */
Object.entries(B.logos || {}).forEach(([k, v]) => {
  if (typeof v === 'string') LOGOS[k] = v;
  else if (v) { LOGOS[k] = v.light || v.file; if (v.dark) LOGO_DARK[k] = v.dark; }
});
async function prepareLogos() {
  if (!sharp) return;
  for (const [k, file] of Object.entries(LOGOS)) {
    const f = abs(file);
    if (!fs.existsSync(f)) continue;
    try {
      const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const W0 = info.width, H0 = info.height, px = i => data[i * 4 + 3];
      const corners = [0, W0 - 1, (H0 - 1) * W0, H0 * W0 - 1].map(px);
      if (corners.every(a => a > 200)) warn(`logo "${k}" has an opaque background; it shows as a box on tinted slides — use a transparent PNG (crop_image.py --cutout)`);
    } catch (e) { /* keep the original */ }
  }
}
const logoFor = (k, dark) => (dark && LOGO_DARK[k]) || LOGOS[k];
/* brand.header: the logo key shown at the top left of every slide, or a list of keys shown side by side */
const HEADER = [].concat(B.header || []);

/* ------------------------------------------------------------- slide frame */
const TONE = {
  cover: 'light', agenda: 'light', section: 'dark', 'big-number': 'tint', kpi: 'light', 'icon-grid': 'tint', feature: 'light',
  split: 'tint', comparison: 'light', process: 'light', timeline: 'light', chart: 'light', table: 'tint', quote: 'dark',
  'image-text': 'light', closing: 'dark', stations: 'tint', nested: 'light', matrix: 'tint', screen: 'light', pairs: 'tint',
  gallery: 'light', photo: 'dark', annotated: 'light', diagram: 'light', dashboard: 'tint', status: 'light', summary: 'light', figure: 'light', code: 'light',
  statement: 'dark', cycle: 'light', hub: 'light', diamond: 'light', arrows: 'light', pyramid: 'light', tree: 'light',
  'logo-wall': 'tint', bands: 'light', roadmap: 'light', ribbons: 'light',
};
/* What kind of slide each layout makes. A deck reads as monotonous when the same kind repeats, when
 * it never changes pace (no statement among many slides), or when nearly every slide is light.
 *   S statement: one big thing (a sentence, a number, a quote)   P picture   D data
 *   G drawing: how things fit together                          T text and cards */
const KIND = {
  statement: 'S', section: 'S', 'big-number': 'S', quote: 'S', cover: 'S', closing: 'S', kpi: 'S',
  photo: 'P', figure: 'P', gallery: 'P', annotated: 'P', 'image-text': 'P', screen: 'P', code: 'P',
  chart: 'D', dashboard: 'D', table: 'D', matrix: 'D', status: 'D',
  diagram: 'G', nested: 'G', process: 'G', stations: 'G', timeline: 'G', cycle: 'G', hub: 'G', diamond: 'G', arrows: 'G', pyramid: 'G', tree: 'G', roadmap: 'G',
  'logo-wall': 'P', bands: 'P', ribbons: 'T',
  'icon-grid': 'T', feature: 'T', split: 'T', pairs: 'T', comparison: 'T', summary: 'T', agenda: 'T',
};
const KIND_NAME = { S: 'statement', P: 'picture', D: 'data', G: 'drawing', T: 'text-and-cards' };
const ACCENT_OK = new Set(['statement', 'quote', 'section', 'big-number', 'kpi', 'closing']);
/* meta.mode: "presented" (default; someone speaks over the deck) or "read" (sent around). It sets
 * the word budget per slide. */
const MODE = (deck.meta && deck.meta.mode) === 'read' ? 'read' : 'presented';
const NOT_ON_SLIDE = new Set(['notes', 'id', 'layout', 'image', 'icon', 'tone', 'covers', 'source', 'alt', 'focus', 'fit', 'frame', 'side',
  'key', 'kicker', 'tag', 'caption', 'condition', 'link', 'links', 'from', 'to', 'transition', 'notesContinued', 'widths', 'align', 'perSlide', 'logos', 'logo', 'color', 'status', 'row', 'col', 'x', 'y',
  'categories', 'series', 'values', 'screen', 'code', 'head', 'rows', 'progress', 'owner', 'marks']);
/* Layouts whose words are data or labels rather than prose: no word budget. */
const NO_BUDGET = new Set(['table', 'code', 'status', 'matrix', 'screen']);
const BUDGET = () => (MODE === 'read' ? 120 : 60);
function slideWords(sl) {
  const count = o => typeof o === 'string' ? (o.match(/[\p{L}\p{N}]+(?:[.,:\/][\p{N}]+)*/gu) || []).length
    : Array.isArray(o) ? o.reduce((a, x) => a + count(x), 0)
    : o && typeof o === 'object' ? Object.entries(o).reduce((a, [k, v]) => a + (NOT_ON_SLIDE.has(k) ? 0 : count(v)), 0) : 0;
  const side = sl.side && typeof sl.side === 'object' ? count(sl.side) : 0;
  return count(sl) + side;
}
/** A panel of bullets or text beside the main visual. */
function sidePanel(sl) {
  const has = o => o && typeof o === 'object' && (o.bullets || o.text || o.items || o.steps);
  return !!(has(sl.takeaway) || (has(sl.aside) && sl.layout !== 'agenda') || has(sl.side));
}
/* Layouts whose composition is a row or grid of equal boxes. Three of them in a row is the pattern
 * that makes a deck look generated. */
const BOXES = new Set(['icon-grid', 'kpi', 'process', 'timeline', 'closing', 'comparison', 'stations', 'split', 'pairs', 'feature']);
function pal() {
  if (cur.tone === 'accent') {
    // the brand's accent colour as the background: white text, darker accent for cards
    return { d: true, card: mix(ACCENT, '000000', 0.2), cardLine: mix(ACCENT, 'FFFFFF', 0.3), head: C.white, text: mix(ACCENT, 'FFFFFF', 0.9),
      mute: mix(ACCENT, 'FFFFFF', 0.7), acc: C.white, soft: mix(ACCENT, '000000', 0.14) };
  }
  const d = cur.tone === 'dark';
  return { d, card: d ? C.deep2 : C.white, cardLine: d ? C.deepLine : C.line, head: d ? C.white : STYLE === 'bold' ? C.deep : C.ink, text: d ? C.onDark : C.ink,
    mute: d ? C.onDark2 : C.muted, acc: d ? C.accentLight : C.accent, soft: d ? C.deep2 : (cur.tone === 'tint' ? C.white : C.tint),
    rule: d ? C.deepLine : C.rule };
}
/* The masthead: the company logo at the top left, the part of the deck (kicker) at the top right, a
 * hairline under both. No page numbers. Content runs down to BOT. */
const MAST = 0.84, BOT = 6.9;
function mast(s, sl, area) {
  const p = pal(), ax = area ? area.x : L, aw = area ? area.w : CW;
  const heads = HEADER.filter(k => LOGOS[k]);
  // logos keep their colours: on a dark slide or over a photo the masthead is a light band
  const band = heads.length && (p.d || (area && area.photo));
  if (band) rect(s, 0, 0, W, MAST, { fill: C.paper, noGrad: true, noInk: true });
  const mc = band ? C.muted : p.mute, rc = band ? C.rule : p.rule;
  if (heads.length) {
    let lx = ax;
    heads.forEach((k, i) => {
      if (i) { seg(s, lx + 0.02, 0.3, lx + 0.02, 0.62, { c: rc, w: 0.75, noInk: true }); lx += 0.26; }
      lx += image(s, LOGOS[k], lx, 0.27, Math.min(1.9, (aw * 0.6) / heads.length), 0.38, { al: 'left', logo: true }) + 0.24;
    });
  } else if (B.name) T(s, B.name.toUpperCase(), ax, 0.3, Math.min(6, aw * 0.6), 0.3, { f: 'd', sz: 9.5, cs: 2, c: p.head, va: 'middle', one: true, fit: [9.5, 8] });
  if (sl && sl.kicker) T(s, String(sl.kicker).toUpperCase(), ax + aw * 0.4, 0.3, aw * 0.6, 0.3, { sz: 9, cs: 2, c: mc, al: 'right', va: 'middle', one: true, fit: [9, 8] });
  if (!band) seg(s, ax, MAST, ax + aw, MAST, { c: rc, w: 0.75, noInk: true });
  if (B.footer) T(s, B.footer, ax, 7.06, Math.min(9, aw), 0.2, { sz: 8.5, c: p.d ? C.onDark2 : C.source, va: 'middle', one: true, fit: [8.5, 8] });
}
/** The masthead for slides that draw their own title. */
function chrome(s, n, sl) { mast(s, sl || null); }
/** Masthead and title. Returns nothing; content starts at TOP, right under the title.
 *  area {x, w, photo}: keep the masthead and title inside a column (used when a photo takes the rest). */
function head(s, sl, n, area) {
  const p = pal(), ax = area ? area.x : L, aw = area ? area.w : CW;
  mast(s, sl, area);
  const tm = T(s, sl.title, ax, 1.02, aw, area ? 1.5 : 1.02, { f: 'h', sz: 30, c: p.head, fit: [30, 22] });
  if (tm) TOP = Math.max(1.62, Math.min(area ? 3.4 : TOP0 + 0.4, 1.02 + tm.needH + 0.26));
  if (!sl.title) err('missing "title" — state the point of the slide in one sentence');
}
/** Source line and key at the bottom. Returns the y where content must end. */
function foot(s, sl, area) {
  const p = pal(), ax = area ? area.x : L, aw = area ? area.w : CW;
  const both = sl.source && sl.key;
  if (sl.key) {
    let cx = ax;
    const y = both ? 6.36 : 6.66;
    sl.key.forEach(it => {
      // an arrow in the key looks like the links it explains: neutral unless a colour is named
      const col = it.color === 'warn' ? C.warn : it.color === 'primary' ? C.deep : it.color === 'muted' ? C.idle : it.color === 'light' ? C.accentTint
        : it.color === 'accent' ? C.accent : it.arrow ? (pal().d ? C.onDark2 : C.idle) : C.accent;
      if (it.arrow) arrow(s, cx, y + 0.11, cx + 0.3, y + 0.11, { c: col, w: 1.5, dash: it.dash ? 'dash' : undefined });
      else rect(s, cx, y + 0.03, 0.16, 0.16, { fill: col, line: it.color === 'light' ? C.accent : undefined, lw: 0.75 });
      const tw = wText(it.label, false, 9.5) + 0.14;
      T(s, it.label, cx + (it.arrow ? 0.38 : 0.24), y, tw, 0.22, { sz: 9.5, c: p.mute, va: 'middle', one: true });
      cx += (it.arrow ? 0.38 : 0.24) + tw + 0.28;
    });
  }
  if (sl.source) T(s, sl.source, ax, both ? 6.62 : 6.6, aw, 0.3, { f: 'h', i: true, sz: 9.5, ls: 12, c: p.d ? C.onDark2 : C.source });
  return both ? 6.22 : (sl.source || sl.key) ? 6.46 : BOT;
}
/** A full-width strip with a bold lead and a sentence. kind: warn | accent | deep | soft */
function band(s, y, h, b, kind = 'soft') {
  if (!b) return;
  const p = pal();
  const st = { warn: [C.warnTint, C.warnDark, C.ink], accent: [C.accent, C.white, C.white], deep: [p.d ? C.deepest : C.deep, C.accentLight, C.white], soft: [p.soft, p.acc, p.text] }[b.kind || kind];
  rect(s, L, y, CW, h, { fill: st[0] });
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

/* The cover: the company logos along the top, the title large in the serif, the subtitle under it, who
 * it is for and the date at the foot. A panel on the right holds a photo or a short list. */
L_.cover = async (s, sl) => {
  const hasPanel = !!sl.panel, px0 = 7.9, tw = hasPanel ? px0 - L - 0.5 : 11.6, mw = hasPanel ? px0 - L - 0.5 : CW;
  if (hasPanel) {
    rect(s, px0, 0, W - px0, H, { fill: C.deep });
    // a photo under the panel, toned to the brand colour so the panel text stays readable
    if (sl.panel.image) {
      await pic(s, sl.panel.image, px0, 0, W - px0, H, { fit: 'cover', focus: sl.panel.focus, alt: sl.panel.alt });
      if ((sl.panel.items || []).length || sl.panel.caption) rect(s, px0, 0, W - px0, H, { fill: C.deep, alpha: sl.panel.shade !== undefined ? sl.panel.shade : 28 });
    }
  }
  // the logos: the cover's own list, else the header logo
  const keys = (sl.logos && sl.logos.length ? sl.logos : HEADER);
  let lx = L;
  keys.forEach(k => { if (LOGOS[k]) lx += image(s, LOGOS[k], lx, 0.3, 2.6, 0.56, { al: 'left', logo: true }) + 0.4; else warn(`logo "${k}" is not in brand.logos`); });
  if (!keys.some(k => LOGOS[k]) && B.name) T(s, B.name.toUpperCase(), L, 0.42, mw, 0.3, { f: 'd', sz: 10, cs: 2, c: C.ink, va: 'middle', one: true, fit: [10, 8] });
  seg(s, L, 1.08, L + mw, 1.08, { c: C.rule, w: 0.75, noInk: true });
  if (sl.kicker) label(s, sl.kicker, L, 1.5, tw);
  const tt = sl.accent ? [{ t: sl.title + ' ' }, { t: sl.accent, c: C.accent, i: true }] : sl.title;
  const tm = T(s, tt, L, 1.9, tw, 2.9, { f: 'h', sz: 60, c: C.ink, fit: [60, 34] });
  const sy = 1.9 + Math.min(2.9, tm ? tm.needH : 2.9) + 0.3;
  T(s, sl.subtitle, L, sy, Math.min(tw, 8.8), Math.max(0.6, 6.0 - sy), { sz: 18, c: C.muted, fit: [18, 13] });
  if (sl.for || sl.note) seg(s, L, 6.18, L + mw, 6.18, { c: C.rule, w: 0.75, noInk: true });
  T(s, sl.for, L, 6.32, tw, 0.3, { sz: 13, b: true, c: C.ink, one: true, fit: [13, 10] });
  T(s, sl.note, L, 6.64, tw, 0.3, { f: 'h', i: true, sz: 11.5, c: C.muted, one: true, fit: [11.5, 9.5] });
  if (hasPanel) {
    const items = (sl.panel.items || []).slice(0, 6);
    if ((sl.panel.items || []).length > 6) err('"panel.items" holds 6 at most');
    const px = 8.5, pw = 4.25, pitch = Math.min(0.82, 4.2 / Math.max(items.length, 1)), y0 = 1.55;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], y = y0 + i * pitch;
      seg(s, px, y, px + pw, y, { c: C.deepLine, w: 0.75, noInk: true });
      if (it.image) mark(s, it.image, px, y + (pitch - 0.36) / 2, 0.36, 0.36, 'center');
      else if (it.icon) await icon(s, it.icon, px + 0.04, y + (pitch - 0.28) / 2, 0.28, C.accentLight);
      const ix = it.image || it.icon ? px + 0.55 : px;
      T(s, it.label, ix, y, (it.tag ? 3.0 : px + pw - ix), pitch, { b: true, sz: 13, c: C.white, va: 'middle', one: true, fit: [13, 10.5] });
      if (it.tag) T(s, String(it.tag).toUpperCase(), px + pw - 1.2, y, 1.2, pitch, { sz: 8.5, cs: 1.6, c: C.accentLight, al: 'right', va: 'middle', one: true });
      if (sl.panel.arrows && i < items.length - 1) arrow(s, px + 0.18, y + pitch * 0.72, px + 0.18, y + pitch + 0.02, { c: C.accentLight, w: 1 });
    }
    if (items.length) seg(s, px, y0 + items.length * pitch, px + pw, y0 + items.length * pitch, { c: C.deepLine, w: 0.75, noInk: true });
    if (sl.panel.caption) T(s, sl.panel.caption, px, 6.3, pw, 0.5, { f: 'h', i: true, sz: 12, c: C.onDark, va: 'middle', fit: [12, 9.5] });
  }
};

L_.agenda = async (s, sl, n) => {
  head(s, sl, n);
  const items = need(sl, 'items', 2, 7), bot = foot(s, sl);
  const w = sl.aside ? 6.6 : CW, pitch = Math.min(1.3, (bot - TOP) / items.length), two = items.some(t => t && t.text);
  const tf = uni(items.map(t => [two ? t.title : t, w - 1.0, two ? pitch * 0.42 : pitch - 0.14, { one: true }]), [24, 12]);
  const bf = two ? uni(items.map(t => [t.text, w - 1.0, pitch * 0.5 - 0.1, {}]), [15, 10]) : null;
  items.forEach((t, i) => {
    const y = TOP + i * pitch;
    numeral(s, i + 1, L, y, 0.9, two ? pitch * 0.42 : pitch - 0.14, { big: true, va: 'middle' });
    if (two) {
      T(s, t.title, L + 1.0, y, w - 1.0, pitch * 0.42, { b: true, c: C.deep, va: 'bottom', one: true, fit: tf });
      T(s, t.text, L + 1.0, y + pitch * 0.42 + 0.04, w - 1.0, pitch * 0.5 - 0.1, { c: C.muted, fit: bf });
    } else T(s, t, L + 1.0, y, w - 1.0, pitch - 0.14, { c: C.deep, va: 'middle', one: true, fit: tf });
    seg(s, L, y + pitch - 0.06, L + w, y + pitch - 0.06, { c: C.line, w: 0.75, noInk: true });
  });
  if (sl.aside) {
    rrect(s, 7.7, TOP, R - 7.7, bot - TOP, { fill: C.tint });
    panelText(s, sl.aside.heading, sl.aside.items || sl.aside.bullets || sl.aside.text, 8.0, TOP + 0.25, R - 8.3, bot - TOP - 0.5, { c: C.ink, pa: 8, fit: [17, 11] }, C.accent);
  }
};

L_.section = async (s, sl, n) => {
  // a picture on the right: a cut-out or illustration stands on a soft light; a photo fills the right side
  let tw = 10.5;
  if (sl.image) {
    const inf = await pictureInfo(sl.image);
    if (inf && inf.cutout) {
      image(s, sl.image, 8.1, 1.25, 4.6, 4.5, { alt: sl.alt, logo: true });
      tw = 6.6;
    } else {
      const px = W * 0.6;
      await pic(s, sl.image, px, 0, W - px, H, { fit: 'cover', focus: sl.focus, alt: sl.alt });
      rect(s, px, 0, W - px, H, { fill: C.deep, alpha: sl.shade !== undefined ? sl.shade : 30 });
      tw = px - 1.6;
    }
  }
  mast(s, sl, sl.image ? { x: L, w: tw + 0.6 } : undefined);
  T(s, sl.number, 1.2, 1.5, 5, 1.9, { f: 'n', sz: 120, c: C.accentLight, va: 'bottom', one: true, fit: [120, 60] });
  T(s, sl.title, 1.2, 3.55, tw, 1.3, { f: 'h', sz: 44, c: C.white, fit: [44, 26] });
  T(s, sl.subtitle, 1.2, 4.95, Math.min(9.5, tw), 1.1, { sz: 17, c: C.onDark, fit: [17, 12] });
};

/* One number as large as the page allows, in Aptos Light, with what it counts under it and the
 * explanation in a column beside it. */
L_['big-number'] = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl), ch = bot - TOP;
  if (!sl.number) err('"number" is missing');
  const nh = ch * 0.6, num0 = String(sl.number || '');
  // the number's column is as wide as the number needs at full size (a single digit leaves no empty band beside it)
  let nsz = 54;
  for (const sz of sizesIn(200, 54)) if (sz * 1.0 / 72 <= nh && wText(num0, false, sz, 0, false, 'n') <= 5.5) { nsz = sz; break; }
  const nw = Math.max(3.6, Math.min(5.7, wText(num0, false, nsz, 0, false, 'n') + 0.7));
  T(s, num0, L - 0.04, TOP, nw - 0.2, nh, { f: 'n', c: p.acc, va: 'bottom', one: true, fit: [nsz, 54] });
  seg(s, L, TOP + nh + 0.16, L + nw - 0.45, TOP + nh + 0.16, { c: p.d ? C.deepLine : C.ink, w: 1, noInk: true });
  T(s, sl.label, L, TOP + nh + 0.34, nw - 0.45, ch - nh - 0.34, { f: 'h', c: p.head, fit: [26, 13] });
  seg(s, L + nw - 0.1, TOP + 0.1, L + nw - 0.1, bot, { c: p.rule, w: 0.75, noInk: true });
  const x = L + nw + 0.35, w = R - x, stats = (sl.stats || []).slice(0, 3), logos = (sl.logos || []).slice(0, 8);
  if ((sl.stats || []).length > 3) err('"stats" holds 3 at most');
  if ((sl.logos || []).length > 8) err('"logos" holds 8 at most');
  // what the number counts, shown by its logos: a row under the text
  const lgH = logos.length ? Math.min(1.5, ch * 0.3) : 0, sh = stats.length ? Math.min(1.75, ch * 0.36) : 0;
  body(s, sl.body, x, TOP + 0.05, w, ch - sh - lgH - 0.3, { c: p.text, pa: 12, fit: [21, 12], va: stats.length || logos.length ? 'top' : 'middle' });
  if (logos.length) {
    const y = bot - sh - lgH - (sh ? 0.2 : 0), cw = w / logos.length;
    seg(s, x, y, R, y, { c: p.d ? C.deepLine : C.ink, w: 1, noInk: true });
    if (sl.logosHeading) label(s, sl.logosHeading, x, y + 0.12, w, { c: p.acc });
    const top = y + (sl.logosHeading ? 0.45 : 0.2), lh = lgH - (top - y) - 0.35;
    const lf = uni(logos.map(g => [g.label, cw - 0.1, 0.3, { one: true }]), [12, 8.5]);
    logos.forEach((g, i) => {
      const gx = x + i * cw;
      mark(s, p.d && g.dark ? g.dark : g.image, gx, top, Math.min(cw - 0.15, lh * 1.6), lh, 'left');
      T(s, g.label, gx, top + lh + 0.06, cw - 0.1, 0.3, { c: p.mute, one: true, fit: lf });
    });
  }
  stats.forEach((st, i) => {
    const sw = (w - 0.3 * (stats.length - 1)) / stats.length, sx = x + i * (sw + 0.3), sy = bot - sh;
    seg(s, sx, sy, sx + sw, sy, { c: p.d ? C.deepLine : C.ink, w: 1, noInk: true });
    T(s, st.value, sx, sy + 0.12, sw - 0.1, sh * 0.48, { f: 'n', c: p.head, va: 'middle', one: true, fit: [40, 16] });
    T(s, st.label, sx, sy + 0.16 + sh * 0.48, sw - 0.1, sh * 0.52 - 0.18, { c: p.mute, fit: [14, 9.5] });
  });
};

/* Key figures side by side: each hangs from a hairline, the value large in Aptos Light. */
L_.kpi = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const tiles = need(sl, 'tiles', 2, 6);
  const cols = tiles.length <= 4 ? tiles.length : 3, rows = Math.ceil(tiles.length / cols), gx = 0.4, gy = 0.3;
  const w = (CW - gx * (cols - 1)) / cols, h = (bot - TOP - gy * (rows - 1)) / rows;
  const vh = Math.min(h * 0.46, 1.9), lh = Math.min(0.9, h * 0.2), dh = tiles.some(t => t.delta) ? 0.34 : 0, nh = h - 0.2 - vh - lh - dh - 0.15;
  const vf = uni(tiles.map(t => [t.value, w - 0.1, vh, { f: 'n', one: true }]), [Math.min(110, vh * 58), 22]);
  const lf = uni(tiles.map(t => [t.label, w - 0.1, lh, { b: true }]), [19, 11]);
  const nf = uni(tiles.map(t => [t.note, w - 0.1, nh, {}]), [16, 9.5]);
  const df = uni(tiles.map(t => [t.delta, w - 0.4, 0.3, { b: true, one: true }]), [13, 9]);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i], x = L + (i % cols) * (w + gx), y = TOP + Math.floor(i / cols) * (h + gy);
    seg(s, x, y, x + w, y, { c: t.warn ? C.warn : p.d ? C.deepLine : C.ink, w: t.warn ? 2 : 1 });
    let ty = y + 0.12;
    T(s, t.value, x, ty, w - 0.1, vh, { f: 'n', c: t.warn ? (p.d ? C.warn : C.warnDark) : p.d ? C.white : p.acc, va: 'middle', one: true, fit: vf }); ty += vh;
    if (dh) { if (t.delta) delta(s, t.delta, t.good, x, ty, w - 0.1, df[0], df); ty += dh; }
    T(s, t.label, x, ty + 0.04, w - 0.1, lh, { b: true, c: p.head, fit: lf });
    T(s, t.note, x, ty + lh + 0.08, w - 0.1, nh, { c: p.mute, fit: nf });
  }
  band(s, TOP + rows * h + gy * (rows - 1) + 0.15, bandH(sl), sl.band, 'warn');
};

L_['icon-grid'] = async (s, sl, n) => {
  // Editorial: no cards. Each item hangs from a hairline: its picture or logo if it has one, a title in
  // the serif and a readable body. Cards around short texts leave empty boxes.
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const items = need(sl, 'items', 2, 6);
  const cols = items.length <= 4 ? items.length : 3, rows = Math.ceil(items.length / cols), gx = 0.45, gy = 0.3;
  const marks = items.some(it => it.image || it.icon);
  const w = (CW - gx * (cols - 1)) / cols, h = (bot - TOP - gy * (rows - 1)) / rows, d = marks ? Math.min(0.85, h * 0.22) : -0.12, th = Math.min(1.0, h * 0.24);
  const tf = uni(items.map(it => [it.title, w, th, { f: 'h' }]), [26, 14]);
  const bf = uni(items.map(it => [it.body, w, h - (0.3 + d + 0.32 + th), {}]), [16, 10]);
  // short items: centre the block in its row instead of leaving the bottom of the slide empty
  const bodyH = Math.max(0, ...items.map(it => (it.body ? measureT(it.body, w, {}, bf[0]).needH : 0)));
  const used = 0.3 + d + 0.26 + th + bodyH + 0.1, yOff = rows === 1 ? Math.max(0, (h - used) / 2) : 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], x = L + (i % cols) * (w + gx), y = TOP + yOff + Math.floor(i / cols) * (h + gy);
    seg(s, x, y, x + w, y, { c: it.warn ? C.warn : p.d ? C.deepLine : C.ink, w: it.warn ? 2 : 1 });
    if (it.image) mark(s, it.image, x, y + 0.3, Math.min(w, d * 3.2), d);
    else if (it.icon) await badge(s, it.icon, x, y + 0.3, d, { c: it.warn ? (p.d ? C.warn : C.warnDark) : p.acc });
    T(s, it.title, x, y + 0.3 + d + 0.16, w, th, { f: 'h', c: p.head, va: 'middle', fit: tf });
    T(s, it.body, x, y + 0.3 + d + 0.26 + th, w, h - (0.3 + d + 0.32 + th), { c: p.text, fit: bf });
  }
  band(s, bot + 0.15, bandH(sl), sl.band, 'deep');
};

L_.feature = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const pn = sl.panel || {}, lw = 5.4;
  rrect(s, L, TOP, lw, bot - TOP, { fill: pn.image ? p.card : (p.d ? C.deepest : C.deep) });
  if (pn.heading && pn.image) label(s, pn.heading, L + 0.3, TOP + 0.2, lw - 0.6, { c: p.acc });
  if (pn.image) await pic(s, pn.image, L + 0.3, TOP + 0.55, lw - 0.6, bot - TOP - 0.8, { alt: pn.alt, va: 'top', fit: pn.fit, focus: pn.focus, backdrop: true });
  else panelText(s, pn.heading, pn.bullets || pn.text, L + 0.35, TOP + 0.25, lw - 0.7, bot - TOP - 0.5, { f: 'h', c: C.white, pa: 9, fit: [24, 12] }, C.accentLight);
  const items = need(sl, 'items', 2, 6), x = L + lw + 0.4, w = R - x;
  if (sl.itemsHeading) label(s, sl.itemsHeading, x, TOP, w, { c: p.acc });
  const marks = items.some(it => it.image || it.icon);
  const y0 = TOP + (sl.itemsHeading ? 0.35 : 0), pitch = (bot - y0) / items.length, bd = marks ? Math.min(0.5, pitch * 0.5) : 0, tx0 = marks ? bd + 0.25 : 0;
  const tx = it => (it.lead ? lead(it.lead, it.text, p.head, p.text) : it.text);
  const f = uni(items.map(it => [tx(it), w - tx0, pitch - 0.16, {}]), [17, 10]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i], y = y0 + i * pitch;
    seg(s, x, y, R, y, { c: i ? p.rule : (p.d ? C.deepLine : C.ink), w: i ? 0.75 : 1, noInk: true });
    if (it.image) mark(s, it.image, x, y + (pitch - bd) / 2, bd, bd, 'center');
    else if (it.icon) await badge(s, it.icon, x, y + (pitch - bd) / 2, bd, { c: p.acc });
    T(s, tx(it), x + tx0, y + 0.06, w - tx0, pitch - 0.12, { c: p.text, va: 'middle', fit: f });
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
    if (d.heading && d.cards) label(s, d.heading, x + 0.3, TOP + 0.2, w - 0.6, { c: hc });
    if (d.cards) {
      const cards = d.cards.slice(0, 4), ch = (bot - TOP - 0.65 - 0.14 * (cards.length - 1)) / cards.length, th = Math.min(0.6, ch * 0.36);
      const tf = uni(cards.map(c => [c.title, w - 0.6, th, { f: 'h' }]), [18, 11]);
      const bf = uni(cards.map(c => [c.text, w - 0.6, ch - th - 0.24, {}]), [15, 9.5]);
      if (d.cards.length > 4) err('a split panel holds 4 cards at most');
      cards.forEach((c, i) => {
        const y = TOP + 0.55 + i * (ch + 0.14);
        seg(s, x + 0.3, y, x + w - 0.3, y, { c: strong ? C.deepLine : p.rule, w: 0.75, noInk: true });
        T(s, c.title, x + 0.3, y + 0.1, w - 0.6, th, { f: 'h', c: strong ? C.white : p.head, va: 'middle', fit: tf });
        T(s, c.text, x + 0.3, y + 0.14 + th, w - 0.6, ch - th - 0.24, { c: mc, fit: bf });
      });
    } else panelText(s, d.heading, d.bullets || d.text, x + 0.35, TOP + 0.25, w - 0.7, bot - TOP - 0.5, { c: tc, pa: 9, fit: [19, 11] }, hc);
  };
  draw(sl.left, L, false);
  draw(sl.right, L + w + 0.3, sl.right && sl.right.strong !== false);
};

L_.comparison = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const cols = need(sl, 'columns', 2, 3), rows = need(sl, 'rows', 2, 6);
  const pics = cols.some(c => c.image), hh = pics ? 1.0 : 0.48;
  const lw = 2.6, gap = 0.18, cw = (CW - lw - gap * cols.length) / cols.length, rh = Math.min(1.35, (bot - TOP - hh - 0.14) / rows.length);
  const cf = uni(rows.flatMap(r => cols.map((c, j) => [(r.cells || [])[j], cw - 0.2, rh - 0.12, {}])), [17, 9.5]);
  const lf = uni(rows.map(r => [r.label, lw - 0.15, rh - 0.12, { b: true }]), [16, 10]);
  const tableB = TOP + hh + 0.14 + rows.length * rh;
  cols.forEach((c, j) => {
    const x = L + lw + gap + j * (cw + gap);
    // the column the slide argues for sits on one pale band from its head to the last row
    if (c.highlight) rect(s, x - 0.08, TOP - 0.08, cw + 0.16, tableB - TOP + 0.08, { fill: p.d ? C.deep2 : C.white, noGrad: true });
    if (pics) {
      if (c.image) mark(s, c.image, x + 0.2, TOP + 0.08, cw - 0.4, 0.46, 'center');
      T(s, c.head, x + 0.1, TOP + 0.6, cw - 0.2, 0.34, { f: 'h', sz: 16, c: c.highlight ? p.acc : p.head, al: 'center', va: 'middle', one: true, fit: [16, 10] });
    } else T(s, c.head, x + 0.1, TOP, cw - 0.2, 0.48, { f: 'h', sz: 18, c: c.highlight ? p.acc : p.head, al: 'center', va: 'middle', one: true, fit: [18, 10] });
  });
  seg(s, L, TOP + hh + 0.04, R, TOP + hh + 0.04, { c: p.d ? C.deepLine : C.ink, w: 1, noInk: true });
  rows.forEach((r, i) => {
    const y = TOP + hh + 0.14 + i * rh;
    if (i) seg(s, L, y - 0.06, R, y - 0.06, { c: p.rule, w: 0.5, noInk: true });
    T(s, r.label, L, y, lw - 0.15, rh - 0.12, { b: true, c: p.head, va: 'middle', fit: lf });
    cols.forEach((c, j) => {
      const x = L + lw + gap + j * (cw + gap);
      T(s, (r.cells || [])[j], x + 0.1, y, cw - 0.2, rh - 0.12, { c: p.text, b: !!c.highlight, va: 'middle', fit: cf });
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
  // a short list (up to 4 items of one line each) sits in columns under the steps, so the steps keep their height
  const litems = sl.list ? (sl.list.items || []).slice(0, 5) : [];
  const lcols = sl.list && !sl.aside && litems.length <= 4 && litems.every(t => String(t).length <= 70);
  let h = !below ? bot - TOP : lcols ? bot - TOP - 0.2 - 1.45 : 2.05;
  const big = h > 3;
  const nd = big ? 0.24 : 0.36, th = big ? 0.92 : 0.36, tg = steps.some(st => st.tag) ? (big ? 0.62 : 0.5) : 0;
  const lp = sl.lastStrong ? 0.4 : 0;
  const tf = uni(steps.map(st => [st.title, w - 0.2 - lp, th, big ? { f: 'h' } : { b: true, one: true }]), big ? [28, 11] : [13, 9.5]);
  const gf = uni(steps.map(st => [st.tag, w - 0.2 - lp, tg - 0.06, { b: true }]), big ? [15, 9] : [11, 9]);
  const y00 = TOP + (big ? 0.3 + nd + 0.12 : 0.66) + (big ? th : 0) + tg;
  const bf = uni(steps.map(st => [st.text, w - 0.2 - lp, TOP + h - y00 - 0.15, {}]), big ? [20, 9.5] : [12.5, 9]);
  // short steps: the row takes the height its text needs and sits in the middle of the room
  let t0 = TOP;
  if (big && !below) {
    const need = (y00 - TOP) + Math.max(0, ...steps.map(st => (st.text ? measureT(st.text, w - 0.2 - lp, {}, bf[0]).needH : 0))) + 0.4;
    if (h - need > 0.5) { t0 = TOP + (h - need) / 2; h = need; }
  }
  const dy = t0 - TOP;
  const y0 = y00 + dy;
  steps.forEach((st, i) => {
    const x = L + i * (w + gap), last = sl.lastStrong && i === steps.length - 1, px = last ? 0.2 : 0;
    // the step the sequence leads to sits on a block of the deep colour; the others hang from a hairline
    if (last) rect(s, x, t0, w, h, { fill: p.d ? C.deepest : C.deep });
    else seg(s, x, t0, x + w, t0, { c: p.d ? C.deepLine : C.ink, w: 1 });
    const hc = last ? C.white : p.head, ac = last ? C.accentLight : p.acc, mc = last ? C.onDark : p.text, nc = last ? C.onDark2 : undefined;
    if (big) {
      numeral(s, i + 1, x + px, t0 + 0.2, w - 0.3, 0.3, { big: true, c: nc });
      T(s, st.title, x + px, t0 + 0.3 + nd + 0.12, w - 0.2 - 2 * px, th, { f: 'h', c: hc, fit: tf });
    } else {
      numeral(s, i + 1, x + px, t0 + 0.18, 0.6, 0.3, { c: nc });
      T(s, st.title, x + px + 0.62, t0 + 0.12, w - 0.72 - 2 * px, th + 0.06, { b: true, c: hc, va: 'middle', one: true, fit: tf });
    }
    const ty = y0 - tg;
    if (st.tag) T(s, st.tag, x + px, ty, w - 0.2 - 2 * px, tg - 0.06, { b: true, c: ac, fit: gf });
    T(s, st.text, x + px, y0, w - 0.2 - 2 * px, t0 + h - y0 - 0.15, { c: mc, fit: bf });
  });
  if (below) {
    const y = TOP + h + 0.2, bh = bot - y, lw = sl.aside && sl.list ? 7.0 : CW;
    if (sl.list && lcols) {
      rrect(s, L, y, lw, bh, { fill: p.soft });
      label(s, sl.list.heading || '', L + 0.25, y + 0.14, lw - 0.5, { c: p.acc });
      const cw2 = (lw - 0.5 - 0.3 * (litems.length - 1)) / litems.length;
      const lf = uni(litems.map(t => [t, cw2 - 0.5, bh - 0.6, {}]), [17, 9.5]);
      litems.forEach((t, i) => {
        const cx = L + 0.25 + i * (cw2 + 0.3);
        numeral(s, i + 1, cx, y + 0.5, 0.45, bh - 0.6, { va: 'middle' });
        T(s, t, cx + 0.48, y + 0.5, cw2 - 0.5, bh - 0.6, { c: p.text, va: 'middle', fit: lf });
      });
    } else if (sl.list) {
      rrect(s, L, y, lw, bh, { fill: p.soft });
      label(s, sl.list.heading || '', L + 0.25, y + 0.14, lw - 0.5, { c: p.acc });
      const items = (sl.list.items || []).slice(0, 5), ip = (bh - 0.55) / Math.max(items.length, 1);
      if ((sl.list.items || []).length > 5) err('"list.items" holds 5 at most');
      const lf = uni(items.map(t => [t, lw - 0.95, ip, {}]), [15, 9.5]);
      items.forEach((t, i) => {
        numeral(s, i + 1, L + 0.25, y + 0.48 + i * ip, 0.4, ip, { va: 'middle' });
        T(s, t, L + 0.7, y + 0.48 + i * ip, lw - 0.95, ip, { c: p.text, va: 'middle', fit: lf });
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
  seg(s, L, ry, R, ry, { c: p.d ? C.onDark2 : C.ink, w: 1 });
  const y = TOP + 0.48, h = bot - y, rh = items.some(it => it.result) ? Math.min(1.2, h * 0.26) : 0, th = Math.min(0.9, h * 0.17);
  const lf = uni(items.map(it => [it.label, w - 0.2, 0.5, { f: 'h', one: true }]), [26, 12]);
  const tf = uni(items.map(it => [it.title, w - 0.2, th, { b: true }]), [20, 10]);
  const bf = uni(items.map(it => [it.bullets || it.text, w - 0.2, h - 0.7 - th - 0.2 - rh, { pa: 4 }]), [17, 9.5]);
  const rf = uni(items.map(it => [it.result ? lead(sl.resultLabel || LBL.result, it.result, p.acc, p.text) : '', w - 0.2, rh - 0.14, {}]), [16, 9.5]);
  items.forEach((it, i) => {
    const x = L + i * (w + gap);
    circle(s, x, ry - 0.08, 0.16, { fill: p.acc });
    if (i) seg(s, x - gap / 2, y + 0.05, x - gap / 2, y + h, { c: p.rule, w: 0.5, noInk: true });
    T(s, it.label, x, y + 0.05, w - 0.2, 0.5, { f: 'h', c: p.head, va: 'middle', one: true, fit: lf });
    T(s, it.title, x, y + 0.62, w - 0.2, th, { b: true, c: p.acc, va: 'top', fit: tf });
    body(s, it.bullets || it.text, x, y + 0.66 + th + 0.08, w - 0.2, h - 0.7 - th - 0.2 - rh, { c: p.text, pa: 4, fit: bf });
    if (it.result) {
      seg(s, x, y + h - rh - 0.04, x + w - 0.2, y + h - rh - 0.04, { c: p.rule, w: 0.75, noInk: true });
      T(s, lead(sl.resultLabel || LBL.result, it.result, p.acc, p.text), x, y + h - rh + 0.06, w - 0.2, rh - 0.14, { c: p.text, fit: rf });
    }
  });
  if (sl.roles) {
    const rs = sl.roles.slice(0, 3), rw = (CW - 0.2 * (rs.length - 1)) / rs.length, y = bot + 0.3;
    rs.forEach((r, i) => {
      rect(s, L + i * (rw + 0.2), y, rw, 0.8, { fill: p.soft });
      T(s, lead(r.who + ':', r.does, p.head, p.text), L + i * (rw + 0.2) + 0.2, y, rw - 0.4, 0.8, { c: p.text, va: 'middle', fit: [13, 9] });
    });
  }
};

/** A native chart inside a box: bar (also stacked, horizontal), line, area, doughnut, pie.
 *  Series colours follow the deck: accent first, then primary, warn …; "color" picks one. */
function drawChart(s, ch, box, p) {
  const cats = ch.categories || [], series = ch.series || [];
  if (!cats.length || !series.length) { err('"chart.categories" and "chart.series" are required'); return; }
  series.forEach(se => { if ((se.values || []).length !== cats.length) err(`series "${se.name}" needs ${cats.length} values`); });
  ink(box.x, box.y, box.w, box.h);
  if (FLAG('--no-charts')) { rrect(s, box.x, box.y, box.w, box.h, { line: C.greyLine, dash: 'dash' }); return; }
  const data = series.map(se => ({ name: se.name, labels: cats, values: se.values }));
  const type = ch.type || 'bar', small = box.h < 2.6;
  const common = { ...box, catAxisLabelColor: p.mute, valAxisLabelColor: p.mute, catAxisLabelFontSize: small ? 9 : 10.5, valAxisLabelFontSize: 9.5, catAxisLabelFontFace: FONT.b,
    valAxisLabelFontFace: FONT.b, valGridLine: { color: p.d ? C.deepLine : C.line, size: 0.5 }, catGridLine: { style: 'none' }, showLegend: series.length > 1, legendPos: 'b',
    legendFontSize: 10, legendColor: p.mute, legendFontFace: FONT.b, dataLabelFontFace: FONT.b };
  if (ch.max !== undefined) common.valAxisMaxVal = ch.max;
  if (ch.min !== undefined) common.valAxisMinVal = ch.min;
  if (ch.format) { common.dataLabelFormatCode = ch.format; common.valAxisLabelFormatCode = ch.format; }
  let k = 0; // series without a colour of their own take the palette in order, accent first
  const colors = series.map(se => (se.color === 'warn' ? C.warn : se.color === 'bad' ? C.bad : se.color === 'primary' ? (p.d ? C.onDark : C.deep) : se.color === 'muted' ? C.idle : SERIES[k++ % SERIES.length]));
  const dec = Math.min(2, Math.max(0, ...series.flatMap(se => (se.values || []).map(v => (String(v).split('.')[1] || '').length))));
  if (!ch.format && dec) common.dataLabelFormatCode = '0.' + '0'.repeat(dec);
  if (type === 'doughnut' || type === 'pie') {
    s.addChart(type === 'pie' ? pptx.charts.PIE : pptx.charts.DOUGHNUT, [data[0]], { ...box, holeSize: type === 'pie' ? undefined : 58, chartColors: cats.map((c, i) => SERIES[i % SERIES.length]),
      showLegend: true, legendPos: box.w > box.h * 1.3 ? 'r' : 'b', legendFontSize: 11, legendColor: p.text, legendFontFace: FONT.b, showPercent: true, showValue: false,
      dataLabelColor: 'FFFFFF', dataLabelFontSize: 10.5, dataBorder: { pt: 1, color: p.d ? C.deep2 : 'FFFFFF' } });
  } else if (type === 'line' || type === 'area') {
    s.addChart(type === 'area' ? pptx.charts.AREA : pptx.charts.LINE, data, { ...common, chartColors: colors, lineSize: 2.25, lineDataSymbol: cats.length > 12 ? 'none' : 'circle', lineDataSymbolSize: 6,
      barGrouping: type === 'area' && ch.stacked ? 'stacked' : undefined, chartColorsOpacity: type === 'area' ? 70 : undefined,
      showValue: cats.length <= 8 && series.length === 1, dataLabelPosition: type === 'area' ? undefined : 't', dataLabelFontSize: 10, dataLabelColor: p.text,
      catAxisLabelFrequency: cats.length > 12 ? String(Math.ceil(cats.length / 6)) : undefined });
  } else {
    const stacked = !!ch.stacked && series.length > 1;
    s.addChart(pptx.charts.BAR, data, { ...common, barDir: ch.horizontal ? 'bar' : 'col', barGrouping: stacked ? 'stacked' : 'clustered', overlap: stacked ? 100 : undefined,
      chartColors: colors, barGapWidthPct: stacked ? 55 : 70, showValue: cats.length * series.length <= 24, dataLabelColor: stacked ? 'FFFFFF' : p.text,
      dataLabelFontSize: small ? 9 : 10, dataLabelPosition: stacked ? 'ctr' : 'outEnd', valAxisHidden: series.length === 1, valGridLine: series.length === 1 ? { style: 'none' } : common.valGridLine });
  }
}

L_.chart = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl), ch = sl.chart || {};
  const tk = sl.takeaway, cw = tk ? 8.2 : CW, left = tk && (sl.side ? sl.side === 'left' : sl._alt);
  const cx = left ? R - cw : L;
  if (ch.title) label(s, ch.title, cx, TOP, cw, { c: p.mute });
  if (!ch.condition) err('"chart.condition" is missing — say on the slide which data, setting and unit the chart shows');
  T(s, ch.condition, cx, bot - 0.36, cw, 0.36, { f: 'h', i: true, sz: 10, c: p.mute, va: 'middle', fit: [10, 8.5] });
  drawChart(s, ch, { x: cx - 0.1, y: TOP + (ch.title ? 0.3 : 0), w: cw + 0.1, h: bot - TOP - 0.42 - (ch.title ? 0.3 : 0) }, p);
  if (tk) {
    const x = left ? L : L + cw + 0.45, w = CW - cw - 0.45;
    sideNote(s, tk.heading || LBL.takeaway, tk.bullets || tk.text, x, TOP, w, bot - TOP, { fit: [19, 11] });
  }
};

/* A table carried over from a source: native, restyled in the deck's colours, numbers aligned
 * right, the rows or the column the slide is about highlighted, an optional total row and
 * status cells. Longer tables are split over several slides before drawing (see expandSlides). */
const NUMERIC = /^[-+−(]?\s*(Rp\.?|US\$|\$|€|£)?\s*[\d.,]+\s*(%|[A-Za-z]{1,6}\.?)?\)?$/;
const STATUS_C = () => ({ ok: pal().d ? C.accentLight : C.accent, done: pal().d ? C.onDark : C.deep, warn: C.warnDark, bad: C.bad, idle: C.idle });
L_.table = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const headRow = sl.head || [], rows = sl.rows || [], ncol = headRow.length;
  if (!ncol || !rows.length) { err('"head" and "rows" are required'); return; }
  if (ncol > 8) err(`a table holds 8 columns at most (this one: ${ncol}). Keep the columns the slide is about; the rest stay in the source or go to an appendix slide`);
  rows.forEach((r, ri) => { if (r.length !== ncol) err(`table row ${ri + 1} has ${r.length} cells; the head has ${ncol}`); });
  const cellText = c => (c && typeof c === 'object' ? String(c.text !== undefined ? c.text : '') : String(c === undefined || c === null ? '' : c));
  const cellPic = c => (c && typeof c === 'object' && c.image ? c.image : null);
  const tw = sl.aside ? Math.max(7.4, CW - 3.9) : CW;
  const raw = sl.widths && sl.widths.length === ncol ? sl.widths : headRow.map((h, ci) => Math.max(4, Math.min(28, Math.max(cellText(h).length * 0.8, ...rows.map(r => cellText(r[ci]).length)))));
  const colW = raw.map(v => (v / raw.reduce((a, b) => a + b, 0)) * tw);
  const align = headRow.map((h, ci) => (sl.align && sl.align[ci]) || (ci > 0 && rows.filter(r => cellText(r[ci]).trim()).every(r => NUMERIC.test(cellText(r[ci]).trim())) ? 'right' : 'left'));
  const noteH = sl.note ? 0.42 : 0, avail = bot - TOP - noteH;
  const rh = Math.min(0.85, avail / (rows.length + 1)), pw = Math.min(0.42, rh * 0.62);
  // one size for the whole table: the largest at which every cell fits its row
  let sz = Math.round(Math.min(16, Math.max(10, rh * 72 * 0.45)) * 2) / 2;
  for (; sz > 9; sz -= 0.5) {
    const ok = [headRow, ...rows].every((r, ri) => r.every((c, ci) => { const m = wrap([{ t: cellText(c), b: ri === 0 || ci === 0, sz, cs: 0 }], colW[ci] - 0.2 - (cellPic(c) ? pw + 0.08 : 0), 0); return (m.lines * sz * 1.18) / 72 + 0.1 <= rh + 0.01 && !m.wide; }));
    if (ok) break;
  }
  const hl = new Set(sl.highlight || []), hc = sl.highlightCol, last = rows.length - 1;
  const none = { type: 'none' }, hair = { type: 'solid', pt: 0.5, color: p.d ? C.deepLine : C.rule }, thick = { type: 'solid', pt: 1.25, color: p.d ? C.onDark2 : C.ink };
  const SC = STATUS_C();
  const data = [headRow, ...rows].map((r, ri) => r.map((c, ci) => {
    const hd = ri === 0, body = ri - 1, isTotal = !hd && sl.total && body === last, isHl = !hd && hl.has(body), isHc = hc === ci;
    const st = c && typeof c === 'object' ? c.status : null;
    const bold = hd || ci === 0 || isTotal || isHl || (c && typeof c === 'object' && c.b) || (isHc && !hd);
    const color = hd ? (isHc ? p.acc : p.mute) : st ? SC[st] || p.text : isHc ? p.acc : ci === 0 ? p.head : p.text;
    const fill = !hd && isHl ? (p.d ? mix(C.accent, C.deep, 0.6) : C.accentTint) : null;
    const face = bold && USE_APTOS ? FONT.d : FONT.b, bflag = bold && !USE_APTOS;
    const text = st ? [{ text: '● ', options: { color: SC[st] || p.text, fontSize: sz, fontFace: FONT.b } }, { text: cellText(c), options: { color, bold: bflag, fontSize: sz, fontFace: face } }] : cellText(c);
    if (/\[[^\]]{1,40}\]/.test(cellText(c))) LINT.placeholders.push(`${cur.id}: ${cellText(c).match(/\[[^\]]{1,40}\]/)[0]}`);
    const cell = { fontFace: face, fontSize: hd ? Math.max(9, sz - 1.5) : sz, bold: bflag, color, valign: hd ? 'bottom' : 'middle', align: hd && align[ci] === 'right' ? 'right' : align[ci],
      margin: [3, 8, 3, cellPic(c) ? 8 + Math.round((pw + 0.08) * 72) : 8], lang: LANG, border: [isTotal ? thick : none, none, hd ? thick : (body === last ? none : hair), none] };
    if (fill) cell.fill = { color: fill };
    return { text: hd && typeof text === 'string' ? text.toUpperCase() : text, options: hd ? { ...cell, charSpacing: 1 } : cell };
  }));
  if (sz <= 9) err(`table cells do not fit even at 9 pt: shorten the longest cells, drop a column, or set "perSlide" lower so the rows get more room`);
  const total = rh * (rows.length + 1);
  s.addTable(data, { x: L, y: TOP, w: tw, colW, rowH: rh, autoPage: false });
  rows.forEach((r, ri) => r.forEach((c, ci) => {
    if (!cellPic(c)) return;
    const cx = L + colW.slice(0, ci).reduce((a, b) => a + b, 0) + 0.11, cy = TOP + rh * (ri + 1) + (rh - pw) / 2;
    mark(s, cellPic(c), cx, cy, pw, pw, 'center');
  }));
  cur.texts.push({ id: 'table', ex: L, ey: TOP, ew: tw, eh: total, ov: false });
  ink(L, TOP, tw, total);
  if (sl._page) T(s, `${sl._page[0]} / ${sl._page[1]}`, L + tw - 1, TOP - 0.3, 1, 0.24, { b: true, sz: 9, c: p.mute, al: 'right', va: 'middle', one: true });
  if (sl.note) T(s, sl.note, L, TOP + total + 0.1, tw, noteH, { c: p.mute, fit: [11, 8.5] });
  if (sl.aside) {
    const x = L + tw + 0.45, w = R - x;
    sideNote(s, sl.aside.heading || LBL.takeaway, sl.aside.bullets || sl.aside.text, x, TOP, w, bot - TOP, { fit: [17, 10] });
  }
  band(s, bot + 0.15, bandH(sl), sl.band, 'soft');
};

L_.quote = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  T(s, '\u201C', L - 0.06, TOP - 0.3, 1.2, 1.85, { f: 'h', sz: 120, c: p.acc, one: true, ov: true });
  T(s, sl.quote, L + 1.05, TOP + 0.1, CW - 1.6, bot - TOP - 1.35, { f: 'h', i: true, c: p.head, va: 'middle', fit: [44, 20] });
  seg(s, L + 1.05, bot - 1.08, L + 3.0, bot - 1.08, { c: p.d ? C.deepLine : C.ink, w: 1, noInk: true });
  const qx = sl.image ? L + 1.05 + mark(s, sl.image, L + 1.05, bot - 0.95, 1.6, 0.8) + 0.3 : L + 1.05;
  T(s, sl.by, qx, bot - 0.94, R - qx - 0.3, 0.36, { b: true, sz: 14, c: p.head, va: 'middle', one: true, fit: [14, 10] });
  T(s, sl.context, qx, bot - 0.54, R - qx - 0.3, 0.5, { sz: 12, c: p.mute, fit: [12, 9.5] });
  if (!sl.by) warn('"by" is missing — a quotation needs its source');
};

L_['image-text'] = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl), iw = 6.6, right = sl.side ? sl.side === 'right' : !!sl._alt;
  const ix = right ? R - iw : L, tx = right ? L : L + iw + 0.4, tw = CW - iw - 0.4, capH = sl.caption ? 0.36 : 0;
  const box = {};
  await pic(s, sl.image, ix, TOP, iw, bot - TOP - capH, { alt: sl.alt, out: box, va: 'top', fit: sl.fit, focus: sl.focus, backdrop: true });
  if (sl.tag && box.w) tag(s, sl.tag, box.x + box.w - 0.12, box.y + 0.12);
  if (sl.caption) {
    const cx = box.w ? box.x : ix, cy = box.h ? box.y + box.h + 0.08 : bot - capH + 0.08;
    T(s, sl.caption, cx, cy, ix + iw - cx, 0.26, { f: 'h', i: true, sz: 10, c: p.mute, va: 'top', one: true, fit: [10, 8.5] });
  }
  if (sl.heading) label(s, sl.heading, tx, TOP + 0.05, tw, { c: p.acc });
  body(s, sl.bullets || sl.text, tx, TOP + 0.45, tw, bot - TOP - 0.5, { c: p.text, pa: 10, fit: [19, 10.5] });
};

L_.closing = async (s, sl, n) => {
  head(s, sl, n);
  const steps = (sl.steps || []).slice(0, 4);
  if ((sl.steps || []).length > 4) err('"steps" holds 4 at most');
  const cols = steps.length === 3 ? 3 : steps.length > 2 ? 2 : Math.max(steps.length, 1), w = (CW - 0.27 * (cols - 1)) / cols, rows = Math.ceil(steps.length / cols);
  const tail = sl.thanks || sl.contact ? 0.8 : 0, gap = 0.2;
  const h = Math.min(rows === 1 ? 3.6 : 2.7, (BOT - TOP - tail - (tail ? 0.2 : 0) - gap * (rows - 1)) / Math.max(rows, 1)), th = Math.min(1.0, h * 0.42);
  const tf = uni(steps.map(st => [st.title, w - 0.2, th, { f: 'h' }]), [28, 12]);
  const bf = uni(steps.map(st => [st.text, w - 0.2, h - th - 0.75, {}]), [20, 9.5]);
  const need = Math.max(0, ...steps.map(st => measureT(st.title || '', w - 0.2, { f: 'h' }, tf[0]).needH + (st.text ? measureT(st.text, w - 0.2, {}, bf[0]).needH : 0))) + 0.9;
  const room = BOT - TOP - tail - (tail ? 0.3 : 0), hh = Math.min(h, Math.max(need, 1.2)), off = Math.max(0, (room - rows * hh - gap * (rows - 1)) / 2);
  steps.forEach((st, i) => {
    const x = L + (i % cols) * (w + 0.27), y = TOP + off + Math.floor(i / cols) * (hh + gap);
    seg(s, x, y, x + w, y, { c: C.onDark2, w: 1 });
    numeral(s, i + 1, x, y + 0.18, 1, 0.3, { big: true });
    const tH = Math.min(th, measureT(st.title || '', w - 0.2, { f: 'h' }, tf[0]).needH + 0.08);
    T(s, st.title, x, y + 0.56, w - 0.2, tH, { f: 'h', c: C.white, fit: tf });
    T(s, st.text, x, y + 0.66 + tH, w - 0.2, Math.max(0.4, hh - tH - 0.7), { c: C.onDark, fit: bf });
  });
  // the thanks on the left and the contact on the right of one closing line, under a hairline
  const y = BOT - 0.72;
  if (tail) seg(s, L, y - 0.14, R, y - 0.14, { c: C.deepLine, w: 0.75, noInk: true });
  const tw2 = sl.thanks ? Math.min(6.5, wText(sl.thanks, false, 36, 0, false, 'h', true) + 0.3) : 0;
  T(s, sl.thanks, L, y, tw2 || 1, 0.7, { f: 'h', i: true, sz: 36, c: C.accentLight, va: 'middle', one: true, fit: [36, 22] });
  T(s, sl.contact, L + tw2 + 0.4, y, CW - tw2 - 0.4, 0.65, { sz: 13, c: C.onDark, al: 'right', va: 'middle', one: true, fit: [13, 10] });
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
      seg(s, L + i * (fw + 0.19), y, L + i * (fw + 0.19) + fw, y, { c: p.d ? C.deepLine : C.ink, w: 1 });
      T(s, ft.value, L + i * (fw + 0.19), y + 0.04, 0.95, 0.76, { f: 'n', sz: 28, c: p.acc, va: 'middle', one: true, fit: [28, 14] });
      T(s, ft.label, L + i * (fw + 0.19) + 1.0, y + 0.04, fw - 1.05, 0.76, { sz: 10, c: p.text, va: 'middle', fit: [10, 8.5] });
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
  const hf = sl.stationStyle === 'accent' || (sl.stationStyle !== 'deep' && rows.some(r => r.style === 'strong')) ? C.accent : C.deep;
  if (lw && sl.stationsLabel) T(s, String(sl.stationsLabel).toUpperCase(), L, y, lw - 0.15, 0.56, { b: true, sz: 9, cs: 1, ls: 12, c: p.head, va: 'middle' });
  const sfit = uni(st.map(q => [q.label || q, w - ((q.icon || q.image) ? 0.5 : 0.05), 0.5, { f: 'h' }]), [20, 10]);
  for (let i = 0; i < st.length; i++) {
    seg(s, X(i), y, X(i) + w, y, { c: p.d ? C.onDark2 : C.ink, w: 1.5 });
    const hasIcon = !!(st[i].icon || st[i].image);
    if (st[i].image) mark(s, st[i].image, X(i), y + 0.1, 0.4, 0.4, 'center');
    else if (hasIcon) await icon(s, st[i].icon, X(i) + 0.04, y + 0.16, 0.3, p.acc);
    T(s, st[i].label || st[i], X(i) + (hasIcon ? 0.5 : 0), y + 0.04, w - (hasIcon ? 0.5 : 0.05), 0.52, { f: 'h', c: p.head, va: 'middle', fit: sfit });
  }
  y += 0.7;
  const avail = bot - y, weights = rows.map(r => r.weight || (r.style === 'strong' ? 0.7 : 1)), sum = weights.reduce((a, b) => a + b, 0);
  rows.forEach((r, ri) => {
    const rh = (avail - 0.1 * (rows.length - 1)) * (weights[ri] / sum);
    const sty = { plain: [p.card, p.cardLine, p.text], tint: [p.d ? C.deep2 : C.accentTint, p.d ? C.deepLine : C.accentTint, p.text], strong: [C.deep, C.deep, C.white], warn: [p.card, p.cardLine, p.text] }[r.style || 'plain'];
    if (lw && r.label) T(s, String(r.label).toUpperCase(), L, y, lw - 0.15, rh, { b: true, sz: 9, cs: 1, ls: 12, c: r.style === 'warn' ? C.warnDark : p.acc, va: 'middle' });
    if ((r.cells || []).length !== st.length) err(`row "${r.label || ri + 1}" needs ${st.length} cells, one per station`);
    const cs = (r.cells || []).slice(0, st.length), obj = c => c && typeof c === 'object', cth = Math.min(0.75, rh * 0.38);
    const ctf = uni(cs.filter(obj).map(c => [c.title, w - 0.3, cth, { b: true }]), [15, 10]);
    const cbf = uni(cs.filter(obj).map(c => [c.text, w - 0.3, rh - cth - 0.34, {}]), [14, 9]);
    const csf = uni(cs.filter(c => !obj(c)).map(c => [c, w - 0.3, rh - 0.1, { b: r.style === 'strong' }]), [18, 9]);
    (r.cells || []).slice(0, st.length).forEach((c, i) => {
      rrect(s, X(i), y, w, rh, { fill: sty[0], r: 0.06, noGrad: true });
      if (c && typeof c === 'object') {
        T(s, c.title, X(i) + 0.15, y + 0.16, w - 0.3, cth, { b: true, c: r.style === 'strong' ? C.white : p.head, fit: ctf });
        T(s, c.text, X(i) + 0.15, y + 0.24 + cth, w - 0.3, rh - cth - 0.34, { c: sty[2], fit: cbf });
      } else T(s, c, X(i) + 0.15, y, w - 0.3, rh, { b: r.style === 'strong', c: sty[2], va: 'middle', fit: csf });
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
  // each level a shade further into the accent; the innermost is the lightest accent, not a solid block
  const fills = p.d ? [C.deep2, C.deepest, mix(C.deep2, C.accent, 0.22), mix(C.deep2, C.accent, 0.4)]
    : [C.white, C.tint, mix(C.tint, C.accentTint, 0.55), C.accentTint];
  const hdr = 0.66, lf = uni(lv.map((l, i) => [l.label, bw - i * 1.0 - 0.6, 0.4, { f: 'd', one: true }]), [18, 11]);
  const k = lv.length - 1, innerW = bw - k * 1.0 - 0.6, full = bot - TOP;
  const noteH = lv[k].note ? measureT(lv[k].note, innerW, {}, 18).needH : 0;
  const innerH = Math.min(full - k * (hdr + 0.22), Math.max(1.6, 0.62 + noteH + 0.4));
  const total = k * (hdr + 0.22) + innerH, y00 = TOP + Math.max(0, (full - total) / 2);
  lv.forEach((l, i) => {
    const inset = i * 0.5, x = L + inset, y = y00 + i * hdr, w = bw - inset * 2, h = total - i * (hdr + 0.22), last = i === lv.length - 1;
    const fill = last ? fills[3] : fills[Math.min(i, 2)];
    rrect(s, x, y, w, h, { fill, noGrad: !last });
    T(s, l.label, x + 0.3, y + 0.13, w * (last ? 1 : 0.55) - 0.4, 0.4, { f: 'd', c: last ? (p.d ? C.white : C.deep) : p.head, va: 'middle', one: true, fit: lf });
    if (last) T(s, l.note, x + 0.3, y + 0.62, w - 0.6, h - 0.8, { c: p.d ? C.onDark : C.ink, fit: [20, 11] });
    else if (l.note) T(s, l.note, x + w * 0.55, y + 0.13, w * 0.45 - 0.3, 0.4, { c: p.mute, al: 'right', va: 'middle', one: true, fit: [13, 9] });
  });
  if (sl.aside) {
    const x = L + bw + 0.3, w = R - x;
    panelText(s, sl.aside.heading, sl.aside.bullets || sl.aside.text, x, TOP + 0.05, w, bot - TOP - 0.1, { c: p.text, pa: 10, fit: [18, 10] }, p.acc);
  }
};

/* A matrix of marks instead of a table of values. */
L_.matrix = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - 0.4;
  const cols = need(sl, 'columns', 2, 7), rows = need(sl, 'rows', 2, 7);
  const tw = sl.aside ? 8.0 : CW, lw = Math.min(3.4, tw * 0.34), cw = (tw - lw) / cols.length, rh = Math.min(1.0, (bot - TOP - 0.6) / rows.length);
  const rf = uni(rows.map(r => [r.label, lw - 0.2, rh, {}]), [17, 9.5]), hf = uni(cols.map(c => [c, cw - 0.1, 0.45, { b: true }]), [13, 8.5]);
  cols.forEach((c, j) => T(s, c, L + lw + j * cw + 0.05, TOP + 0.05, cw - 0.1, 0.45, { b: true, c: p.head, al: 'center', va: 'middle', fit: hf }));
  rows.forEach((r, i) => {
    const y = TOP + 0.55 + i * rh;
    seg(s, L, y, L + tw, y, { c: i ? p.rule : (p.d ? C.deepLine : C.ink), w: i ? 0.5 : 1 });
    T(s, r.label, L, y, lw - 0.2, rh, { b: !!r.strong, c: r.strong ? p.acc : p.text, va: 'middle', fit: rf });
    if ((r.marks || []).length !== cols.length) err(`row "${r.label}" needs ${cols.length} marks`);
    (r.marks || []).slice(0, cols.length).forEach((m, j) => {
      const d = Math.min(0.42, rh * 0.48), cx = L + lw + j * cw + cw / 2 - d / 2, cy = y + rh / 2 - d / 2;
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
    const x = L + tw + 0.45, w = R - x;
    sideNote(s, sl.aside.heading || LBL.takeaway, sl.aside.bullets || sl.aside.text, x, TOP, w, bot + 0.4 - TOP, { fit: [18, 10] });
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
  tag(s, sc.tag || (sc.image ? LBL.screenshot : LBL.illustration), fx + fw - 0.15, fy + 0.09);
  let y = fy + 0.55;
  if (sc.image) {
    // A screenshot from the source, shown in the same frame instead of drawn tiles, bars and rows.
    image(s, sc.image, fx + 0.15, fy + 0.52, fw - 0.3, fh - 0.67 - (sc.note ? 0.34 : 0), { alt: sc.alt });
    if (sc.tiles || sc.bars || sc.rows) warn('"screen.image" is shown; tiles, bars and rows are ignored');
  } else {
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
  }
  if (sc.note) T(s, sc.note, fx + 0.2, fy + fh - 0.38, fw - 0.4, 0.26, { sz: 9, c: C.onDark2, va: 'middle', one: true, fit: [9, 8.5] });
  if (side) {
    const x = fx + fw + 0.3, w = R - x, steps = (side.steps || []).slice(0, 5), nb = side.note ? 1.05 : 0;
    if ((side.steps || []).length > 5) err('"side.steps" holds 5 at most');
    label(s, side.heading || '', x, TOP, w, { c: p.acc });
    const sp = (bot - TOP - 0.4 - nb) / Math.max(steps.length, 1), sf = uni(steps.map(t => [t, w - 0.55, sp - 0.1, {}]), [15, 9.5]);
    steps.forEach((t, i) => {
      const sy = TOP + 0.4 + i * sp;
      if (side.numbered !== false) numeral(s, i + 1, x, sy + 0.04, 0.5, 0.3);
      else circle(s, x + 0.08, sy + 0.12, 0.14, { fill: C.accent });
      T(s, t, x + 0.55, sy, w - 0.55, sp - 0.1, { c: p.text, fit: sf });
    });
    if (side.note) { rrect(s, x, bot - 0.95, w, 0.95, { fill: p.soft }); T(s, side.note, x + 0.2, bot - 0.95, w - 0.4, 0.95, { c: p.text, va: 'middle', fit: [13, 9.5] }); }
  }
};

/* Pictures of several things, each with a name and one line: devices, screens, sites, figures.
 * Each card holds its picture above its text ("stack") or beside it ("side"); the shape and column
 * count that show the pictures largest without leaving their frames half empty are chosen, unless
 * "cols" or "card" is set. How a picture sits follows what it is:
 *   cut-out pictures (transparent background) stand on white cards with no frame;
 *   "frame": "browser" puts each screenshot in a drawn browser window sized to it, no card;
 *   other pictures sit on a matte in their own background colour, so no box shows inside the card. */
L_.gallery = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const items = need(sl, 'items', 2, 6), N = items.length, gap = 0.25, avail = bot - TOP;
  const infos = [];
  for (const it of items) infos.push(await pictureInfo(it.image));
  const cut = infos.every(q => q && q.cutout), browser = sl.frame === 'browser', cover = sl.fit === 'cover';
  const hasCap = items.some(it => it.caption);
  const sizes = items.map(it => { const f = it.image && abs(it.image); return (f && fs.existsSync(f) && imgSize(f)) || [16, 10]; });
  const ars = sizes.map(z => z[1] / z[0]).sort((a, b) => a - b), ar = ars[Math.floor(ars.length / 2)];
  const bar = browser ? BAR + 0.05 : 0;
  const shown = (fw, fh) => { const h2 = fh - bar; return cover ? fw * fh : (h2 / fw > ar ? fw * fw * ar : (h2 * h2) / ar); };
  const plans = [];
  for (let c = 1; c <= N; c++) {
    const r = Math.ceil(N / c);
    if (r > 3 || (c * r - N) >= c) continue;
    const w = (CW - gap * (c - 1)) / c, h = (avail - gap * (r - 1)) / r;
    if (r <= 2) { const fw = w - 0.3, fh = h - (hasCap ? 1.0 : 0.5) - 0.15; if (fh > 0.6 && fw > 0.8) plans.push({ c, r, w, h, shape: 'stack', fw, fh, a: shown(fw, fh) }); }
    const tw = Math.min(3.0, Math.max(2.1, w * 0.38)), fw = w - tw - 0.35, fh = h - 0.3;
    if (fw > 1.2 && fh > 0.6) plans.push({ c, r, w, h, shape: 'side', tw, fw, fh, a: shown(fw, fh) });
  }
  let pool = plans.filter(q => (!sl.cols || q.c === sl.cols) && (!sl.card || q.shape === sl.card));
  if (!pool.length) pool = plans;
  const score = q => q.a * (0.6 + 0.4 * (q.a / (q.fw * q.fh)));
  pool.sort((x, y) => score(y) - score(x) || x.c - y.c);
  const pl = pool[0];
  if (!pl) { err('gallery: no arrangement fits; use fewer items'); return; }
  const shownW = Math.min(pl.fw, (pl.fh - bar) / ar);
  if (!cut && ar < 0.8 && N > 2 && shownW < 4) warn(`${N} wide pictures in one gallery are shown about ${shownW.toFixed(1)} in wide; screenshots that small are noise — show one or two larger ("frame": "browser", or annotated), or redraw the screen`);
  const used = pl.a / (pl.fw * pl.fh);
  const stackT = pl.shape === 'stack', tcol = pl.shape === 'side' ? pl.w - pl.fw - 0.55 : pl.w - 0.4;
  const gtf = uni(items.map(it => [it.title, tcol, stackT ? 0.3 : 0.62, { b: true, one: stackT }]), stackT ? [15, 10] : [16, 11]);
  const gcf = uni(items.map(it => [it.caption, tcol, stackT ? pl.h - pl.fh - 0.15 - 0.12 - 0.42 - 0.04 : pl.h - 1.05, {}]), stackT ? [13.5, 9] : [14, 9.5]);
  if (!cut && !cover && !browser && used < 0.5) warn(`gallery pictures fill only ${Math.round(used * 100)}% of their frames — crop them to a common shape, cut them out, or set "fit": "cover"`);
  for (let i = 0; i < N; i++) {
    const it = items[i], inf = infos[i], z = sizes[i];
    const x = L + (i % pl.c) * (pl.w + gap), y = TOP + Math.floor(i / pl.c) * (pl.h + gap);
    const fx = x + 0.15, fy = y + 0.15;
    if (browser) {
      // the window is sized to the screenshot, centred in the picture area; no card around it
      const k = Math.min((pl.fw - 0.1) / z[0], (pl.fh - BAR - 0.05) / z[1]), iw = z[0] * k, ih = z[1] * k;
      const wx = fx + (pl.fw - iw - 0.1) / 2, wy = pl.shape === 'side' ? fy + (pl.fh - ih - BAR - 0.05) / 2 : fy;
      const inner = browserFrame(s, wx, wy, iw + 0.1, ih + BAR + 0.05);
      image(s, it.image, inner.x, inner.y, inner.w, inner.h, { alt: it.alt || it.title, matte: true });
    } else {
      if (cut) rrect(s, fx, fy, pl.fw, pl.fh, { fill: p.d ? C.deep2 : C.white, noInk: true });
      else if (!cover) rect(s, fx, fy, pl.fw, pl.fh, { fill: inf && inf.plain ? inf.edge : (p.d ? C.deep2 : C.grey) });
      const pad = cut ? 0.12 : cover ? 0 : 0.08, bw = pl.fw - 2 * pad, bh = pl.fh - 2 * pad;
      if (cut && it.image) {
        // cut-outs get the same visual weight: each covers about the same area, so a tall sensor
        // does not tower over a small one
        const k = Math.min(bw / z[0], bh / z[1], Math.sqrt((0.55 * bw * bh) / (z[0] * z[1]))), iw = z[0] * k, ih = z[1] * k;
        image(s, it.image, fx + pad + (bw - iw) / 2, fy + pad + (bh - ih) / 2, iw, ih, { alt: it.alt || it.title, matte: true });
      } else await pic(s, it.image, fx + pad, fy + pad, bw, bh, { alt: it.alt || it.title, fit: it.fit || sl.fit, focus: it.focus, matte: true });
    }
    if (it.tag) tag(s, it.tag, fx + pl.fw - 0.1, fy + (browser ? BAR + 0.1 : 0.1));
    const txt = p.head, sub = p.d ? C.onDark : p.mute;
    if (pl.shape === 'stack') {
      const ty = fy + pl.fh + 0.12;
      T(s, it.title, fx, ty, pl.fw, 0.3, { b: true, c: txt, va: 'middle', one: true, fit: gtf });
      if (it.caption) T(s, it.caption, fx, ty + 0.34, pl.fw, y + pl.h - ty - 0.42, { c: sub, fit: gcf });
    } else {
      const tx = fx + pl.fw + 0.25, tw = x + pl.w - tx - 0.15;
      T(s, it.title, tx, y + 0.25, tw, 0.62, { b: true, c: txt, fit: gtf });
      if (it.caption) T(s, it.caption, tx, y + 0.9, tw, pl.h - 1.05, { c: sub, fit: gcf });
    }
    if (!it.image) warn(`gallery item "${it.title || i + 1}" has no "image"; a placeholder is drawn`);
  }
  band(s, bot + 0.15, bandH(sl), sl.band, 'soft');
};

/* A photo edge to edge on one side, and the point it makes on the other: numbered points, a paragraph
 * or bullets, and up to three numbers. */
L_.photo = async (s, sl, n) => {
  const right = sl.side ? sl.side === 'right' : !!sl._alt, frac = Math.min(0.62, Math.max(0.38, sl.width || 0.5));
  const pw = W * frac, px = right ? W - pw : 0;
  await pic(s, sl.image, px, 0, pw, H, { fit: 'cover', focus: sl.focus, alt: sl.alt });
  if (sl.caption) {
    rect(s, px, H - 0.52, pw, 0.52, { fill: '000000', alpha: 45 });
    T(s, sl.caption, px + 0.3, H - 0.52, pw - 0.6, 0.52, { sz: 10, c: C.white, va: 'middle', one: true, fit: [10, 8.5] });
  }
  if (sl.tag) tag(s, sl.tag, px + pw - 0.3, H - (sl.caption ? 0.9 : 0.62));
  const ax = right ? L : pw + 0.55, aw = (right ? px - 0.55 : R) - ax;
  const area = { x: ax, w: aw, plate: right };
  head(s, sl, n, area);
  const p = pal(), bot = foot(s, sl, area), top = 2.05;
  const stats = (sl.stats || []).slice(0, 3), sh = stats.length ? 1.05 : 0;
  if ((sl.stats || []).length > 3) err('"stats" holds 3 at most');
  if (sl.points) {
    const pts = sl.points.slice(0, 5), pitch = Math.min(1.6, (bot - top - sh - 0.1) / Math.max(pts.length, 1)), th = Math.min(0.42, pitch * 0.34);
    if (sl.points.length > 5) err('"points" holds 5 at most');
    const tf = uni(pts.map(pt => [pt.title, aw - 0.6, th, { b: true, one: true }]), [17, 11]);
    const bf = uni(pts.map(pt => [pt.text, aw - 0.6, pitch - th - 0.14, {}]), [15, 9.5]);
    pts.forEach((pt, i) => {
      const y = top + i * pitch;
      numeral(s, i + 1, ax, y - 0.04, 0.55, 0.5, { c: p.acc, sz: 24, fit: [24, 14] });
      T(s, pt.title, ax + 0.6, y, aw - 0.6, th, { b: true, c: p.head, va: 'middle', one: true, fit: tf });
      if (pt.text) T(s, pt.text, ax + 0.6, y + th + 0.04, aw - 0.6, pitch - th - 0.14, { c: p.text, fit: bf });
    });
  } else body(s, sl.bullets || sl.text, ax, top, aw, bot - top - sh, { c: p.text, pa: 10, fit: [19, 10.5] });
  stats.forEach((st, i) => {
    const w = aw / stats.length, x = ax + i * w, y = bot - sh + 0.1;
    T(s, st.value, x + 0.2, y, w - 0.3, 0.5, { f: 'n', c: p.acc, va: 'middle', one: true, fit: [30, 16] });
    T(s, st.label, x + 0.2, y + 0.5, w - 0.3, 0.42, { c: p.mute, fit: [12, 9] });
  });
};

/* One picture with its parts marked, and what each mark shows beside it. A point with "box"
 * ([x1, y1, x2, y2], fractions of the picture) marks a region: the rest of the picture is washed pale,
 * a thin accent outline goes round the region and its number sits just left of it. A point with "x"
 * and "y" gets a small number on that spot. The list beside the picture repeats the same numbers.
 * The picture has rounded corners and a soft shadow, no border. */
const SPOT = {};
async function spotlit(file, boxes, w, radius, wash, op) {
  const f = abs(file), key = JSON.stringify([f, boxes, w, radius, wash, op]);
  if (SPOT[key]) return SPOT[key];
  const m = await sharp(f).metadata(), ow = Math.min(m.width, Math.round(w * 220)), k = ow / m.width, oh = Math.round(m.height * k), ppi = ow / w;
  const layers = [];
  if (boxes.length && op) {
    const holes = boxes.map(([x1, y1, x2, y2]) => `<rect x="${x1 * ow}" y="${y1 * oh}" width="${(x2 - x1) * ow}" height="${(y2 - y1) * oh}" rx="${0.035 * ppi}" fill="black"/>`).join('');
    layers.push({ input: Buffer.from(`<svg width="${ow}" height="${oh}"><defs><mask id="m"><rect width="${ow}" height="${oh}" fill="white"/>${holes}</mask></defs><rect width="${ow}" height="${oh}" fill="#${wash}" fill-opacity="${op}" mask="url(#m)"/></svg>`) });
  }
  let buf = await sharp(f).resize(ow, oh).composite(layers).png().toBuffer();
  if (radius) {
    const r = Math.round(radius * ppi);
    buf = await sharp(buf).composite([{ input: Buffer.from(`<svg width="${ow}" height="${oh}"><rect width="${ow}" height="${oh}" rx="${r}" ry="${r}"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
  }
  if (m.width / w < 80) warn(`image ${path.basename(f)} is ${m.width} px wide but shown ${w.toFixed(1)} in wide; it may look blurry`);
  return (SPOT[key] = 'image/png;base64,' + buf.toString('base64'));
}
L_.annotated = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const pts = need(sl, 'points', 1, 6), right = sl.side ? sl.side === 'right' : !!sl._alt, gap = 0.5, minList = 3.6, d = 0.24;
  const f = sl.image && abs(sl.image), z = f && fs.existsSync(f) ? imgSize(f) : [16, 10];
  const inf = await pictureInfo(sl.image);
  // frame: plain (rounded, soft shadow), browser (a drawn window), dark, or none (a cut-out)
  const frame = sl.frame === 'light' ? 'plain' : sl.frame || (inf && inf.cutout ? 'none' : 'plain');
  const padX = frame === 'browser' ? 0.05 : frame === 'dark' ? 0.12 : 0, padT = frame === 'browser' ? BAR : padX, padB = frame === 'browser' ? 0.05 : padX;
  const capH = sl.caption ? 0.4 : 0;
  const k = Math.min((CW - minList - gap - 2 * padX) / z[0], (bot - TOP - capH - padT - padB) / z[1]);
  const iw = z[0] * k, ih = z[1] * k, fw = iw + 2 * padX, fh = ih + padT + padB;
  const fx = right ? R - fw : L, fy = TOP + Math.max(0, (bot - TOP - capH - fh) / 2), lx = right ? L : L + fw + gap, lw = CW - fw - gap;
  if (frame === 'browser') browserFrame(s, fx, fy, fw, fh);
  else if (frame === 'dark') rrect(s, fx, fy, fw, fh, { fill: p.d ? C.deepest : C.deep, noGrad: true });
  else if (frame === 'plain') rrect(s, fx, fy, fw, fh, { fill: inf && inf.plain ? inf.edge : C.white, r: 0.08, shadow: true, noGrad: true, noInk: true });
  const ix = fx + padX, iy = fy + padT;
  const boxes = pts.filter(pt => Array.isArray(pt.box)).map(pt => pt.box);
  if (f && fs.existsSync(f) && sharp) {
    s.addImage({ data: await spotlit(sl.image, boxes, iw, frame === 'plain' ? 0.08 : 0, p.d ? C.deep : 'FFFFFF', sl.wash === false ? 0 : 0.55), x: ix, y: iy, w: iw, h: ih });
    ink(ix, iy, iw, ih);
  } else image(s, sl.image, ix, iy, iw, ih, { alt: sl.alt, matte: true });
  if (sl.tag) tag(s, sl.tag, fx + fw - 0.15, iy + 0.12);
  pts.forEach((pt, i) => {
    if (Array.isArray(pt.box)) {
      const [x1, y1, x2, y2] = pt.box;
      if (!(x1 >= 0 && y1 >= 0 && x2 <= 1 && y2 <= 1 && x2 > x1 && y2 > y1)) { err(`point ${i + 1}: "box" is [x1, y1, x2, y2] in fractions of the picture, left top to right bottom`); return; }
      const bx = ix + x1 * iw, by = iy + y1 * ih, bw = (x2 - x1) * iw, bh = (y2 - y1) * ih;
      shape(s, 'rect', bx, by, bw, bh, { line: p.acc, lw: 1.25, noInk: true });
      // the tag hangs on the region's outline at its top left, outside it; inside the corner when the
      // region starts at the picture's edge
      const out = bx - ix >= d + 0.02;
      num(s, i + 1, out ? bx - d : bx, by, d, { fill: p.acc, c: p.d ? C.deep : C.white, sz: 9.5 });
    } else if (pt.x !== undefined && pt.y !== undefined) {
      if (pt.x < 0 || pt.x > 1 || pt.y < 0 || pt.y > 1) err(`point ${i + 1}: "x" and "y" are fractions of the picture, between 0 and 1`);
      const cx = ix + pt.x * iw, cy = iy + pt.y * ih;
      rect(s, cx - d / 2 - 0.025, cy - d / 2 - 0.025, d + 0.05, d + 0.05, { fill: C.white, noGrad: true });
      num(s, i + 1, cx - d / 2, cy - d / 2, d, { fill: p.acc, sz: 9.5 });
    }
  });
  if (sl.caption) T(s, sl.caption, fx, fy + fh + 0.14, fw, 0.26, { f: 'h', i: true, sz: 10.5, c: p.mute, one: true, fit: [10.5, 8.5] });
  const lh = sl.listHeading ? 0.4 : 0, nh = sl.note ? 0.95 : 0, y0 = TOP + lh;
  if (sl.listHeading) label(s, sl.listHeading, lx, TOP, lw, { c: p.acc });
  const pitch = Math.min(1.7, (bot - y0 - nh - 0.05) / pts.length), th = Math.min(0.42, pitch * 0.32);
  const tf = uni(pts.map(pt => [pt.title, lw - 0.4, th, { b: true, one: true }]), [17, 10.5]);
  const bf = uni(pts.map(pt => [pt.text, lw - 0.4, pitch - th - 0.2, {}]), [15, 9.5]);
  const used = pts.length * pitch, ly = y0 + Math.max(0, (bot - y0 - nh - used) / 2);
  pts.forEach((pt, i) => {
    const y = ly + i * pitch;
    seg(s, lx, y, lx + lw, y, { c: i ? p.rule : (p.d ? C.deepLine : C.ink), w: i ? 0.75 : 1, noInk: true });
    num(s, i + 1, lx, y + 0.1 + (th - d) / 2, d, { fill: p.acc, c: p.d ? C.deep : C.white, sz: 9.5 });
    T(s, pt.title, lx + 0.4, y + 0.1, lw - 0.4, th, { b: true, c: p.head, va: 'middle', one: true, fit: tf });
    if (pt.text) T(s, pt.text, lx + 0.4, y + 0.1 + th + 0.03, lw - 0.4, pitch - th - 0.2, { c: p.text, fit: bf });
  });
  if (sl.note) { rect(s, lx, bot - nh + 0.1, lw, nh - 0.1, { fill: p.soft }); T(s, sl.note, lx + 0.2, bot - nh + 0.1, lw - 0.4, nh - 0.1, { c: p.text, va: 'middle', fit: [14, 9.5] }); }
  band(s, bot + 0.15, bandH(sl), sl.band, 'soft');
};

/* A command, prompt or file to type, set in a dark panel in a monospace face, with what it does
 * and what to check beside it, and optionally the expected result under the panel. Training and
 * technical decks: install commands, prompts for an assistant, a configuration file. */
L_.code = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const c = sl.code || {};
  const lines = Array.isArray(c.lines) ? c.lines.map(String) : String(c.text || '').split('\n');
  if (!lines.join('').trim()) err('"code.lines" needs the text to type, one string per line');
  const pts = sl.points ? need(sl, 'points', 1, 6) : [];
  const right = sl.side ? sl.side === 'right' : !!sl._alt, gap = 0.4;
  const frac = Math.min(0.66, Math.max(0.42, sl.width || 0.56)), pw = (CW - gap) * frac, lw = CW - gap - pw;
  const px = right ? R - pw : L, lx = right ? L : L + pw + gap;
  // the panel: a label strip, then the text in the mono face; comment lines (# or //) are dimmer
  const bar = c.label ? 0.42 : 0.16, padX = 0.28;
  // the result box takes the room its text needs (1.0–2.4 in); the panel takes the rest
  let rh = 0;
  if (sl.result) {
    const rv = sl.result.bullets ? bulletRuns(sl.result.bullets) : sl.result.text;
    rh = Math.min(2.4, Math.max(1.0, measureT(rv, pw - 0.5, { pa: 4 }, 13).needH + (sl.result.heading ? 0.62 : 0.32)));
  }
  const runs = lines.map((t, i) => ({ t: t === '' ? ' ' : t, f: 'm', c: /^\s*(#|\/\/)/.test(t) ? C.onDark2 : C.white, br: i < lines.length - 1 }));
  const maxH = bot - TOP - bar - 0.3 - (rh ? rh + 0.2 : 0);
  let sz = 16;
  for (; sz > 9; sz -= 0.5) { const r = measureT(runs, pw - 2 * padX, { f: 'm' }, sz); if (!r.m.wide && r.needH <= maxH) break; }
  const needH = measureT(runs, pw - 2 * padX, { f: 'm' }, sz).needH;
  const ph = rh ? bot - TOP - rh - 0.2 : bot - TOP;
  rrect(s, px, TOP, pw, ph, { fill: C.deepest, r: 0.05 });
  if (c.label) {
    T(s, String(c.label).toUpperCase(), px + padX, TOP + 0.08, pw - 2 * padX, 0.26, { b: true, sz: 9.5, cs: 1.1, c: C.accentLight, va: 'middle', one: true, fit: [9.5, 8.5] });
    seg(s, px, TOP + bar, px + pw, TOP + bar, { c: C.deepLine, w: 0.75 });
  }
  T(s, runs, px + padX, TOP + bar + 0.18, pw - 2 * padX, ph - bar - 0.3, { f: 'm', c: C.white, fit: [sz, 9] });
  if (sl.result) {
    const r = sl.result, ry = TOP + ph + 0.2, rH = bot - ry;
    rrect(s, px, ry, pw, rH, { fill: p.soft });
    if (r.heading) label(s, r.heading, px + 0.3, ry + 0.14, pw - 0.5, { c: p.acc });
    body(s, r.bullets || r.text, px + 0.3, ry + (r.heading ? 0.46 : 0.16), pw - 0.5, rH - (r.heading ? 0.6 : 0.3), { c: p.text, pa: 4, fit: [14, 9.5] });
  }
  // beside the panel: numbered points (what it does, what to check), or bullets / a paragraph
  const hh = sl.heading ? 0.4 : 0, nh = sl.note ? 0.95 : 0, y0 = TOP + hh;
  if (sl.heading) label(s, sl.heading, lx, TOP, lw, { c: p.acc });
  if (pts.length) {
    const pitch = Math.min(1.7, (bot - y0 - nh - 0.05) / pts.length), th = Math.min(0.42, pitch * 0.3);
    const tf = uni(pts.map(pt => [pt.title, lw - 0.55, th, { b: true, one: true }]), [16, 10.5]);
    const bf = uni(pts.map(pt => [pt.text, lw - 0.55, pitch - th - 0.12, {}]), [15, 9.5]);
    pts.forEach((pt, i) => {
      const y = y0 + i * pitch;
      numeral(s, i + 1, lx, y + 0.08, 0.5, 0.3);
      T(s, pt.title, lx + 0.55, y, lw - 0.55, th, { b: true, c: p.head, va: 'middle', one: true, fit: tf });
      if (pt.text) T(s, pt.text, lx + 0.55, y + th + 0.03, lw - 0.55, pitch - th - 0.12, { c: p.text, fit: bf });
    });
  } else body(s, sl.bullets || sl.text, lx, y0 + 0.05, lw, bot - y0 - nh - 0.1, { c: p.text, pa: 9, fit: [18, 10.5] });
  if (sl.note) { rrect(s, lx, bot - nh + 0.1, lw, nh - 0.1, { fill: p.soft }); T(s, sl.note, lx + 0.2, bot - nh + 0.1, lw - 0.4, nh - 0.1, { c: p.text, va: 'middle', fit: [14, 9.5] }); }
  band(s, bot + 0.15, bandH(sl), sl.band, 'soft');
};

/* Boxes on a grid joined by arrows, inside optional containers: an architecture, a topology, a
 * system's parts and how data moves between them. Nodes carry a photo, an icon, or text only.
 * Links run along a row, along a column, or between neighbouring rows (up, across, then into the node). */
L_.diagram = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const nodes = need(sl, 'nodes', 2, 12), groups = sl.groups || [], links = sl.links || [];
  const aw = sl.aside ? 3.3 : 0, gw = CW - (aw ? aw + 0.35 : 0);
  const cols = Math.max(...nodes.map(d => (d.col || 0) + 1)), rows = Math.max(...nodes.map(d => (d.row || 0) + 1));
  const byId = {}, cells = {};
  nodes.forEach(d => {
    byId[d.id] = d;
    const c = `${d.row || 0},${d.col || 0}`;
    if (cells[c]) err(`nodes "${cells[c]}" and "${d.id}" share row ${d.row || 0}, column ${d.col || 0}`);
    cells[c] = d.id;
  });
  const mx = links.some(l => l.label && (byId[l.from] || {}).row === (byId[l.to] || {}).row) ? 0.45 : 0.2, my = 0.2;
  const cw = gw / cols, chh = (bot - TOP) / rows;
  const rowOf = id => (byId[id] ? byId[id].row || 0 : 0);
  const labelRows = new Set(groups.map(g => Math.min(...g.nodes.map(rowOf))));
  const top = r => (labelRows.has(r) ? 0.46 : my);
  const nh = Math.min(...[...Array(rows).keys()].map(r => chh - top(r) - my));
  const box = d => { const c = d.col || 0, r = d.row || 0; return { x: L + c * cw + mx, y: TOP + r * chh + top(r), w: cw - 2 * mx, h: nh }; };
  groups.forEach(g => {
    const ms = g.nodes.map(id => byId[id]).filter(Boolean);
    if (!ms.length) { warn(`group "${g.label}" has no known nodes`); return; }
    const c0 = Math.min(...ms.map(d => d.col || 0)), c1 = Math.max(...ms.map(d => d.col || 0));
    const r0 = Math.min(...ms.map(d => d.row || 0)), r1 = Math.max(...ms.map(d => d.row || 0));
    const gx = L + c0 * cw + 0.06, gy = TOP + r0 * chh + 0.04, gx2 = L + (c1 + 1) * cw - 0.06, gy2 = TOP + r1 * chh + top(r1) + nh + 0.14;
    rrect(s, gx, gy, gx2 - gx, gy2 - gy, { fill: g.strong ? C.accentTint : p.soft, line: g.dash ? p.cardLine : undefined, dash: g.dash ? 'dash' : undefined, noGrad: true });
    if (g.label) label(s, g.label, gx + 0.18, gy + 0.11, gx2 - gx - 0.36, { c: p.acc });
  });
  links.forEach(l => {
    const A = byId[l.from], Bn = byId[l.to];
    if (!A || !Bn) { warn(`link ${l.from} → ${l.to}: unknown node`); return; }
    const a = box(A), b = box(Bn), ar = A.row || 0, br = Bn.row || 0, ac = A.col || 0, bc = Bn.col || 0;
    const lc = l.strong ? (p.d ? C.accentLight : C.accent) : l.muted ? (p.d ? C.deepLine : C.greyLine) : (p.d ? C.onDark2 : C.idle);
    const o = { c: lc, w: l.strong ? 2 : 1.5, dash: l.dash ? 'dash' : undefined, head: l.arrow !== false };
    let lab = null;
    if (ar === br) {
      const [x1, x2] = bc > ac ? [a.x + a.w, b.x] : [a.x, b.x + b.w], y = a.y + a.h / 2;
      arrow(s, x1, y, x2, y, o);
      lab = { x: Math.min(x1, x2), y: y - 0.3, w: Math.abs(x2 - x1), al: 'center' };
    } else if (ac === bc) {
      const [y1, y2] = br > ar ? [a.y + a.h, b.y] : [a.y, b.y + b.h], x = a.x + a.w / 2;
      arrow(s, x, y1, x, y2, o);
      lab = { x: x + 0.1, y: (y1 + y2) / 2 - 0.13, w: cw / 2, al: 'left' };
    } else {
      const down = br > ar, y1 = down ? a.y + a.h : a.y, y2 = down ? b.y : b.y + b.h;
      const ym = down ? (y1 + TOP + (ar + 1) * chh + top(ar + 1)) / 2 : (y1 + TOP + (ar - 1) * chh + top(ar - 1) + nh) / 2;
      const x1 = a.x + a.w / 2, x2 = b.x + b.w / 2;
      seg(s, x1, y1, x1, ym, o); seg(s, x1, ym, x2, ym, o); arrow(s, x2, ym, x2, y2, o);
      lab = { x: Math.min(x1, x2), y: ym - 0.28, w: Math.abs(x2 - x1), al: 'center' };
    }
    if (l.label) {
      const lw2 = wText(String(l.label), true, 9.5, 0, false, 'd') + 0.24, cx = lab.al === 'center' ? lab.x + Math.max(lab.w, 0.6) / 2 : lab.x + lw2 / 2;
      rrect(s, cx - lw2 / 2, lab.y + 0.02, lw2, 0.24, { fill: bgOf(), r: 0.5, noGrad: true, noInk: true });
      T(s, l.label, cx - lw2 / 2, lab.y + 0.02, lw2, 0.24, { f: 'd', sz: 9.5, c: p.mute, al: 'center', va: 'middle', one: true, fit: [9.5, 8], ov: true });
    }
  });
  // every node is laid out the same way, and all titles share one size, all texts another
  const anyB = box(nodes[0]), wide = anyB.w / anyB.h >= 1.45;
  const bd = Math.min(0.62, anyB.h * 0.42);
  const geo = d => {
    const b = box(d), pad = 0.2;
    if (d.image) return null;
    // a decision is a diamond: its text sits in the middle half; a start or end is a pill with centred text
    if (d.shape === 'decision') return { tx: b.x + b.w * 0.2, tw: b.w * 0.6, ty0: b.y + b.h * 0.18, th: b.h * 0.64, al: 'center' };
    if (d.shape === 'start' || d.shape === 'end') return { tx: b.x + b.h * 0.4, tw: b.w - b.h * 0.8, ty0: b.y + 0.08, th: b.h - 0.16, al: 'center' };
    if (wide) { const tx = b.x + pad + (d.icon ? bd + 0.2 : 0); return { tx, tw: b.x + b.w - tx - pad, ty0: b.y + 0.12, th: b.h - 0.24, al: 'left' }; }
    const top = d.icon ? bd + 0.18 : 0; return { tx: b.x + 0.14, tw: b.w - 0.28, ty0: b.y + 0.14 + top, th: b.h - 0.28 - top, al: 'center' };
  };
  const gs = nodes.map(geo);
  const tFit = uni(nodes.map((d, i) => gs[i] ? [d.title, gs[i].tw, 0.42, { f: 'd' }] : null).filter(Boolean), [16, 10]);
  const xFit = uni(nodes.map((d, i) => gs[i] && d.text ? [d.text, gs[i].tw, Math.max(0.3, gs[i].th - 0.46), {}] : null).filter(Boolean), [13, 9]);
  for (let i = 0; i < nodes.length; i++) {
    const d = nodes[i], b = box(d), pill = d.shape === 'start' || d.shape === 'end', strong = !!d.strong || pill, g = gs[i];
    if (d.shape === 'decision') shape(s, 'diamond', b.x, b.y, b.w, b.h, { fill: d.strong ? C.deep : p.card, line: d.strong ? C.deep : p.acc, lw: 1.5, keepLine: true, noGrad: true });
    else if (pill) rrect(s, b.x, b.y, b.w, b.h, { fill: d.shape === 'end' ? C.accent : C.deep, r: b.h / 2 });
    else rrect(s, b.x, b.y, b.w, b.h, { fill: strong ? C.deep : p.card, line: strong ? C.deep : p.cardLine, grad: d.warn ? (p.d ? mix(C.deep2, C.warn, 0.25) : C.warnTint) : undefined });
    const tc = strong ? C.white : p.head, xc = strong ? C.onDark : p.text;
    if (d.image) {
      const textH = d.text ? 0.8 : 0.42;
      if (b.w / b.h > 1.3) {
        // a wide node: the photo on the left, the text beside it
        const iw = Math.min(b.w * 0.42, b.h * 1.1), tx = b.x + iw + 0.2, tw = b.x + b.w - tx - 0.12;
        const inf = await pictureInfo(d.image);
        if (!(inf && inf.cutout)) rect(s, b.x + 0.1, b.y + 0.1, iw, b.h - 0.2, { fill: inf && inf.plain ? inf.edge : (strong ? C.deep2 : C.grey), noGrad: true });
        await pic(s, d.image, b.x + 0.16, b.y + 0.16, iw - 0.12, b.h - 0.32, { alt: d.title, fit: d.fit, focus: d.focus, matte: true });
        const th = d.text ? 0.56 + 0.62 : 0.56, y0 = b.y + Math.max(0.1, (b.h - th) / 2);
        T(s, d.title, tx, y0, tw, 0.56, { f: 'd', c: tc, va: 'bottom', fit: [15, 10] });
        if (d.text) T(s, d.text, tx, y0 + 0.6, tw, Math.min(0.9, b.y + b.h - y0 - 0.7), { c: xc, fit: [12, 9] });
      } else {
        const ih = Math.max(0.45, b.h - textH - 0.2);
        const inf = await pictureInfo(d.image);
        if (!(inf && inf.cutout)) rect(s, b.x + 0.1, b.y + 0.1, b.w - 0.2, ih, { fill: inf && inf.plain ? inf.edge : (strong ? C.deep2 : C.grey), noGrad: true });
        await pic(s, d.image, b.x + 0.16, b.y + 0.14, b.w - 0.32, ih - 0.08, { alt: d.title, fit: d.fit, focus: d.focus, matte: true });
        const ty = b.y + b.h - textH - 0.04;
        T(s, d.title, b.x + 0.1, ty, b.w - 0.2, 0.32, { f: 'd', c: tc, al: 'center', va: 'middle', one: true, fit: [14, 9.5] });
        if (d.text) T(s, d.text, b.x + 0.1, ty + 0.34, b.w - 0.2, textH - 0.36, { c: xc, al: 'center', fit: [11, 8.5] });
      }
      continue;
    }
    // the title and text block, centred vertically in the room the node has
    const tH = measureT(d.title || '', g.tw, { f: 'd' }, tFit[0]).needH, xH = d.text ? measureT(d.text, g.tw, {}, xFit[0]).needH : 0;
    const blk = tH + (d.text ? 0.06 + xH : 0), y0 = g.ty0 + Math.max(0, (g.th - blk) / 2);
    if (d.icon) {
      const bopt = strong ? { fill: C.deep2, c: C.accentLight } : d.warn ? { fill: p.d ? C.deepest : 'FFFFFF', c: C.warnDark } : { fill: p.d ? C.deepest : C.accentTint };
      if (wide) await badge(s, d.icon, b.x + 0.2, b.y + (b.h - bd) / 2, bd, bopt);
      else await badge(s, d.icon, b.x + (b.w - bd) / 2, g.ty0 - bd - 0.08 + Math.max(0, (g.th - blk) / 2), bd, bopt);
    }
    T(s, d.title, g.tx, y0, g.tw, tH + 0.02, { f: 'd', c: tc, al: g.al, fit: tFit });
    if (d.text) T(s, d.text, g.tx, y0 + tH + 0.06, g.tw, xH + 0.04, { c: xc, al: g.al, fit: xFit });
  }
  if (sl.aside) {
    const x = L + gw + 0.35;
    sideNote(s, sl.aside.heading, sl.aside.bullets || sl.aside.text, x, TOP, aw, bot - TOP, { fit: [16, 9.5] });
  }
  band(s, bot + 0.15, bandH(sl), sl.band, 'soft');
};

/* Left → right pairs: learned → applied, before → after, cause → action. */
L_.pairs = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const rows = need(sl, 'rows', 2, 6), lw = (CW - 0.5) * 0.47, rx = L + lw + 0.5, rw = R - rx;
  T(s, sl.leftHead, L, TOP, lw, 0.42, { f: 'h', sz: 20, c: p.head, va: 'bottom', one: true, fit: [20, 12] });
  T(s, sl.rightHead, rx, TOP, rw, 0.42, { f: 'h', sz: 20, c: p.acc, va: 'bottom', one: true, fit: [20, 12] });
  seg(s, L, TOP + 0.5, L + lw, TOP + 0.5, { c: p.d ? C.deepLine : C.ink, w: 1, noInk: true });
  seg(s, rx, TOP + 0.5, R, TOP + 0.5, { c: p.acc, w: 1, noInk: true });
  const pitch = Math.min(1.35, (bot - TOP - 0.62) / rows.length), h = pitch - 0.12;
  const f = uni(rows.flatMap(r => [[r.left, lw - 0.7, h, {}], [r.right, rw - 0.4, h, {}]]), [17, 9.5]);
  rows.forEach((r, i) => {
    const y = TOP + 0.62 + i * pitch;
    if (i) seg(s, L, y - 0.06, L + lw, y - 0.06, { c: p.rule, w: 0.5, noInk: true });
    numeral(s, i + 1, L, y, 0.6, h, { va: 'middle', sz: 22, fit: [22, 14] });
    T(s, r.left, L + 0.7, y, lw - 0.7, h, { c: p.text, va: 'middle', fit: f });
    arrow(s, L + lw + 0.08, y + h / 2, rx - 0.08, y + h / 2, { c: p.d ? C.onDark2 : C.idle, w: 1 });
    rect(s, rx, y, rw, h, { fill: p.d ? C.deep2 : C.white });
    T(s, r.right, rx + 0.2, y, rw - 0.4, h, { c: p.text, va: 'middle', fit: f });
  });
};

/* A reporting page: the period's numbers with their change, one or two charts, and what to note. */
L_.dashboard = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const tiles = need(sl, 'tiles', 2, 5), charts = need(sl, 'charts', 1, 2);
  const side = sl.side, sw = side ? 3.55 : 0, gw = CW - (side ? sw + 0.3 : 0), left = side && sl._alt, gx = left ? L + sw + 0.3 : L;
  const th = tiles.some(t => t.delta) ? 1.38 : 1.12, tw = (gw - 0.2 * (tiles.length - 1)) / tiles.length;
  const vf = uni(tiles.map(t => [t.value, tw - 0.4, 0.56, { f: 'n', one: true }]), [34, 15]);
  const lf = uni(tiles.map(t => [t.label, tw - 0.4, 0.4, { b: true }]), [12.5, 9]);
  const df = uni(tiles.map(t => [t.delta, tw - 0.6, 0.3, { b: true, one: true }]), [11, 8.5]);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i], x = gx + i * (tw + 0.2);
    rrect(s, x, TOP, tw, th, { fill: p.card, line: p.cardLine, grad: t.warn ? (p.d ? mix(C.deep2, C.warn, 0.25) : C.warnTint) : t.good === false ? (p.d ? mix(C.deep2, C.bad, 0.25) : mix(C.bad, 'FFFFFF', 0.86)) : undefined });
    T(s, t.value, x + 0.24, TOP + 0.1, tw - 0.4, 0.56, { f: 'n', c: t.warn ? (p.d ? C.warn : C.warnDark) : p.head, va: 'middle', one: true, fit: vf });
    T(s, t.label, x + 0.24, TOP + 0.66, tw - 0.4, 0.4, { b: true, c: p.mute, fit: lf });
    if (t.delta) delta(s, t.delta, t.good, x + 0.24, TOP + th - 0.38, tw - 0.4, df[0], df);
  }
  const cy = TOP + th + 0.22, chh = bot - cy, cwid = (gw - 0.25 * (charts.length - 1)) / charts.length;
  charts.forEach((ch, i) => {
    const x = gx + i * (cwid + 0.25);
    rrect(s, x, cy, cwid, chh, { fill: p.card, line: p.cardLine });
    if (ch.title) label(s, ch.title, x + 0.22, cy + 0.12, cwid - 0.44, { c: p.mute });
    if (!ch.condition) err(`"charts[${i}].condition" is missing — say which data, setting and unit the chart shows`);
    T(s, ch.condition, x + 0.22, cy + chh - 0.4, cwid - 0.44, 0.32, { sz: 9, c: p.mute, va: 'middle', fit: [9.5, 8.5] });
    drawChart(s, ch, { x: x + 0.1, y: cy + 0.38, w: cwid - 0.2, h: chh - 0.82 }, p);
  });
  if (side) {
    const x = left ? L : L + gw + 0.3;
    rrect(s, x, TOP, sw, bot - TOP, { fill: p.d ? C.deepest : C.deep });
    panelText(s, side.heading || LBL.takeaway, side.bullets || side.text, x + 0.28, TOP + 0.22, sw - 0.56, bot - TOP - 0.45, { c: C.white, pa: 9, fit: [15, 9.5] }, C.accentLight);
  }
  band(s, bot + 0.15, bandH(sl), sl.band, 'warn');
};

/* Where each piece of work stands: a row per item with its status, progress, owner and a note. */
L_.status = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const rows = need(sl, 'rows', 2, 10), SLB = Object.assign({}, LBL.status, sl.statusLabels || {}), H = Object.assign({}, LBL.statusHead, sl.columns || {});
  const hasProg = rows.some(r => r.progress !== undefined && r.progress !== null), hasOwner = rows.some(r => r.owner), hasText = rows.some(r => r.text);
  const gap = 0.25, nameW = hasText ? 3.0 : 4.2, stW = 1.75, prW = hasProg ? 2.35 : 0, owW = hasOwner ? 1.75 : 0;
  const txW = CW - nameW - stW - prW - owW - gap * (1 + (hasProg ? 1 : 0) + (hasOwner ? 1 : 0) + (hasText ? 1 : 0)) - 0.3;
  const X = { name: L + 0.15 }; X.st = X.name + nameW + gap; X.pr = X.st + stW + gap; X.tx = X.pr + prW + (hasProg ? gap : 0); X.ow = X.tx + (hasText ? txW + gap : 0);
  const hy = TOP, rh = Math.min(0.95, (bot - TOP - 0.42) / rows.length), y0 = TOP + 0.42;
  [['name', nameW], ['status', stW], hasProg && ['progress', prW], hasText && ['text', txW], hasOwner && ['owner', owW]].filter(Boolean).forEach(([k, w]) => {
    const x = k === 'name' ? X.name : k === 'status' ? X.st : k === 'progress' ? X.pr : k === 'text' ? X.tx : X.ow;
    T(s, String(H[k] || '').toUpperCase(), x, hy, w, 0.3, { b: true, sz: 9, cs: 1, c: p.mute, va: 'middle', one: true, fit: [9, 8] });
  });
  seg(s, L, y0 - 0.06, R, y0 - 0.06, { c: p.d ? C.deepLine : C.ink, w: 1, noInk: true });
  const nf = uni(rows.map(r => [r.name, nameW, rh - 0.1, { b: true }]), [15, 9.5]);
  const tf = uni(rows.map(r => [r.text, txW, rh - 0.1, {}]), [13.5, 9]);
  const of = uni(rows.map(r => [r.owner, owW, rh - 0.1, {}]), [12.5, 9]);
  const COL = { done: [p.d ? C.accentLight : C.deep, p.d ? C.deep : C.white], ok: [C.accent, C.white], risk: [C.warn, C.deep], late: [C.bad, C.white], idle: [p.d ? C.deepLine : C.grey, p.d ? C.onDark : C.muted] };
  rows.forEach((r, i) => {
    const y = y0 + i * rh, ph = Math.min(0.36, rh - 0.18);
    if (i) seg(s, L, y, R, y, { c: p.rule, w: 0.5, noInk: true });
    T(s, r.name, X.name, y, nameW, rh, { b: true, c: p.head, va: 'middle', fit: nf });
    const st = COL[r.status] ? r.status : 'idle';
    if (!COL[r.status]) err(`row "${r.name}": status must be one of done, ok, risk, late, idle`);
    rrect(s, X.st, y + (rh - ph) / 2, stW, ph, { fill: COL[st][0], r: 0.5 });
    T(s, SLB[st], X.st, y + (rh - ph) / 2, stW, ph, { b: true, sz: 10.5, c: COL[st][1], al: 'center', va: 'middle', one: true, fit: [10.5, 8.5] });
    if (hasProg && r.progress !== undefined && r.progress !== null) {
      const v = Math.max(0, Math.min(100, Number(r.progress))), bw = prW - 0.65;
      rrect(s, X.pr, y + rh / 2 - 0.07, bw, 0.14, { fill: p.d ? C.deepLine : C.grey, r: 0.5, noInk: true });
      if (v > 0) rrect(s, X.pr, y + rh / 2 - 0.07, Math.max(0.14, bw * v / 100), 0.14, { fill: COL[st][0] === C.grey ? C.idle : COL[st][0], r: 0.5 });
      T(s, `${Math.round(v)}%`, X.pr + bw + 0.08, y, 0.57, rh, { b: true, sz: 11, c: p.head, al: 'right', va: 'middle', one: true, fit: [11, 9] });
    }
    if (hasText) T(s, r.text, X.tx, y, txW, rh, { c: p.text, va: 'middle', fit: tf });
    if (hasOwner) T(s, r.owner, X.ow, y, owW, rh, { c: p.mute, va: 'middle', fit: of });
  });
  band(s, bot + 0.15, bandH(sl), sl.band, 'soft');
};

/* The executive summary of a report: numbered findings on the left, the numbers that carry them
 * and the decision asked for on a dark column on the right. */
L_.summary = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const pts = need(sl, 'points', 2, 5), nums = (sl.numbers || []).slice(0, 4);
  if ((sl.numbers || []).length > 4) err('"numbers" holds 4 at most');
  // the findings column is as wide as its longest line needs; the dark column takes the rest
  const need0 = Math.max(...pts.map(pt => Math.max(wText(String(pt.title || ''), false, 20, 0, false, 'd'), wText(String(pt.text || ''), false, 16)))) + 1.3;
  const pw = nums.length || sl.ask ? Math.max(4.1, Math.min(5.2, CW - 0.4 - Math.max(6.2, need0))) : 0;
  const right = !(sl.side === 'left'), lw = CW - (pw ? pw + 0.4 : 0), lx = right ? L : L + pw + 0.4;
  const pitch = (bot - TOP) / pts.length, th = Math.min(0.8, pitch * 0.42);
  const tf = uni(pts.map(pt => [pt.title, lw - 0.95, th, { f: 'd' }]), [20, 12]);
  const bf = uni(pts.map(pt => [pt.text, lw - 0.95, pitch - th - 0.2, {}]), [16, 9.5]);
  pts.forEach((pt, i) => {
    const y = TOP + i * pitch;
    if (i) seg(s, lx, y - 0.04, lx + lw, y - 0.04, { c: p.d ? C.deepLine : C.line, w: 0.75, noInk: true });
    numeral(s, i + 1, lx, y + 0.12, 0.8, 0.3, { big: true, c: pt.warn ? C.warnDark : undefined });
    T(s, pt.title, lx + 0.95, y + 0.06, lw - 0.95, th, { b: true, c: p.head, fit: tf });
    T(s, pt.text, lx + 0.95, y + 0.1 + th, lw - 0.95, pitch - th - 0.2, { c: p.text, fit: bf });
  });
  if (pw) {
    const x = right ? R - pw : L;
    rrect(s, x, TOP, pw, bot - TOP, { fill: p.d ? C.deepest : C.deep });
    const askH = sl.ask ? Math.min(1.9, (bot - TOP) * 0.4) : 0;
    if (sl.numbersHeading) label(s, sl.numbersHeading, x + 0.3, TOP + 0.22, pw - 0.6, { c: C.accentLight });
    const ny = TOP + (sl.numbersHeading ? 0.55 : 0.2), nh = (bot - ny - askH - 0.1) / Math.max(nums.length, 1);
    const vf = uni(nums.map(q => [q.value, pw - 0.6, nh * 0.52, { f: 'n', one: true }]), [44, 18]);
    const lf2 = uni(nums.map(q => [q.label, pw - 0.6, nh * 0.42, {}]), [13.5, 9]);
    nums.forEach((q, i) => {
      const y = ny + i * nh;
      if (i) seg(s, x + 0.3, y, x + pw - 0.3, y, { c: C.deepLine, w: 0.75, noInk: true });
      T(s, q.value, x + 0.3, y + 0.05, pw - 0.6, nh * 0.52, { f: 'n', c: q.warn ? C.warn : C.white, va: 'middle', one: true, fit: vf });
      T(s, q.label, x + 0.3, y + 0.05 + nh * 0.52, pw - 0.6, nh * 0.42, { c: C.onDark, fit: lf2 });
    });
    if (sl.ask) {
      const ay = bot - askH;
      rect(s, x + 0.2, ay, pw - 0.4, askH - 0.2, { fill: C.paper, noGrad: true });
      label(s, sl.ask.heading || '', x + 0.4, ay + 0.15, pw - 0.8, { c: C.accent });
      T(s, sl.ask.text, x + 0.4, ay + 0.45, pw - 0.8, askH - 0.75, { f: 'h', c: C.ink, fit: [17, 10] });
    }
  }
};

/* One picture from a source that cannot be redrawn — a map, a site plan, an engineering drawing,
 * a scanned page, a chart whose data is not available — shown as large as the slide allows, with
 * the explanation where the picture leaves room: beside a tall picture, under a wide one. */
L_.figure = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const f = sl.image && abs(sl.image), z = (f && fs.existsSync(f) && imgSize(f)) || [16, 10];
  const inf = await pictureInfo(sl.image);
  const frame = sl.frame || (inf && inf.cutout ? 'none' : 'plain');
  const pad = frame === 'none' ? 0 : frame === 'browser' ? 0.05 : 0.1, padT = frame === 'browser' ? BAR : pad;
  const pts = sl.points ? sl.points.slice(0, 4) : null;
  if (sl.points && sl.points.length > 4) err('"points" holds 4 at most');
  const hasText = !!(pts || sl.bullets || sl.text), capH = sl.caption || sl.tag ? 0.34 : 0, AH = bot - TOP - capH;
  const fitIn = (bw, bh) => { const k = Math.min((bw - 2 * pad) / z[0], (bh - padT - pad) / z[1]); return { fw: z[0] * k + 2 * pad, fh: z[1] * k + padT + pad, iw: z[0] * k, ih: z[1] * k }; };
  const sideO = fitIn(hasText ? CW - 3.4 - 0.4 : CW, AH), botO = hasText ? fitIn(CW, AH - 1.55 - 0.2) : null;
  const under = botO && botO.iw * botO.ih > sideO.iw * sideO.ih * 1.08, o = under ? botO : sideO;
  const right = !under && hasText && (sl.side ? sl.side === 'right' : !!sl._alt);
  const fx = under || !hasText ? L + (CW - o.fw) / 2 : right ? R - o.fw : L, fy = TOP + (under ? 0 : Math.max(0, (AH - o.fh) / 2));
  if (frame === 'browser') browserFrame(s, fx, fy, o.fw, o.fh);
  else if (frame === 'dark') rrect(s, fx, fy, o.fw, o.fh, { fill: p.d ? C.deepest : C.deep });
  else if (frame === 'plain') rrect(s, fx, fy, o.fw, o.fh, { fill: inf && inf.plain ? inf.edge : C.white, shadow: true, noGrad: true });
  image(s, sl.image, fx + pad, fy + padT, o.iw, o.ih, { alt: sl.alt, matte: true });
  // the tag goes under the picture, not on it: a source figure has content up to its edges
  const tagW = sl.tag ? wText(sl.tag, true, 8.5, 0.8) + 0.4 : 0;
  if (sl.tag) tag(s, sl.tag, fx + o.fw, fy + o.fh + 0.08);
  if (sl.caption) T(s, sl.caption, fx, fy + o.fh + 0.08, o.fw - tagW, 0.26, { f: 'h', i: true, sz: 10.5, c: p.mute, one: true, fit: [10.5, 8.5] });
  if (!hasText) return;
  if (under) {
    const ty = fy + o.fh + capH + 0.2, th = bot - ty;
    if (pts) {
      const w = (CW - 0.3 * (pts.length - 1)) / pts.length;
      const tf = uni(pts.map(q => [q.title, w - 0.2, 0.34, { b: true, one: true }]), [15, 10]), bf = uni(pts.map(q => [q.text, w - 0.2, th - 0.5, {}]), [13.5, 9]);
      pts.forEach((q, i) => {
        const x = L + i * (w + 0.3);
        T(s, q.title, x + 0.2, ty, w - 0.2, 0.34, { b: true, c: p.head, va: 'middle', one: true, fit: tf });
        T(s, q.text, x + 0.2, ty + 0.4, w - 0.2, th - 0.45, { c: p.text, fit: bf });
      });
    } else body(s, sl.bullets || sl.text, L, ty, CW, th, { c: p.text, pa: 6, fit: [16, 10] });
  } else {
    const tx = right ? L : fx + o.fw + 0.4, tw = right ? fx - 0.4 - L : R - tx;
    if (sl.heading) label(s, sl.heading, tx, TOP + 0.05, tw, { c: p.acc });
    const y0 = TOP + (sl.heading ? 0.45 : 0.05);
    if (pts) {
      const pitch = Math.min(1.7, (bot - y0) / pts.length), th = Math.min(0.42, pitch * 0.32);
      const tf = uni(pts.map(q => [q.title, tw - 0.25, th, { b: true, one: true }]), [16, 10]), bf = uni(pts.map(q => [q.text, tw - 0.25, pitch - th - 0.15, {}]), [15, 9.5]);
      pts.forEach((q, i) => {
        const y = y0 + i * pitch;
        T(s, q.title, tx + 0.25, y, tw - 0.25, th, { b: true, c: p.head, va: 'middle', one: true, fit: tf });
        T(s, q.text, tx + 0.25, y + th + 0.03, tw - 0.25, pitch - th - 0.15, { c: p.text, fit: bf });
      });
    } else body(s, sl.bullets || sl.text, tx, y0, tw, bot - y0, { c: p.text, pa: 10, fit: [19, 10.5] });
  }
};

/* One sentence in large type that carries a point by itself: the claim a part of the deck opens
 * with, a finding, a decision. It changes the pace: no cards and no bullets, the slide is the
 * sentence. Optional: one supporting line ("sub"), up to three short facts beside it ("points":
 * value + label), or a photo behind it, full bleed, toned so the sentence stays readable. */
L_.statement = async (s, sl, n) => {
  if (sl.image) {
    await pic(s, sl.image, 0, 0, W, H, { fit: 'cover', focus: sl.focus, alt: sl.alt });
    rect(s, 0, 0, W * 0.72, H, { fill: C.deepest, alpha: sl.shade !== undefined ? sl.shade : 18, noInk: true });
    rect(s, W * 0.72, 0, W * 0.28, H, { fill: C.deepest, alpha: Math.min(90, (sl.shade !== undefined ? sl.shade : 18) + 35), noInk: true });
  }
  const p = pal(), facts = (sl.points || []).slice(0, 3);
  if ((sl.points || []).length > 3) err('"points" holds 3 at most; a statement carries one point');
  const tw = facts.length ? 7.4 : 9.6;
  mast(s, sl, sl.image ? { x: L, w: CW, photo: true } : undefined);
  if (!sl.title) err('missing "title" — the statement is the title: one sentence');
  T(s, sl.title, L, 1.35, tw, sl.sub ? 3.7 : 4.6, { f: 'h', c: C.white, va: 'middle', fit: [40, 24] });
  if (sl.sub) T(s, sl.sub, L, 5.25, tw, 1.1, { c: p.mute === C.onDark2 ? C.onDark : p.text, fit: [18, 12] });
  if (facts.length) {
    const fx = L + tw + 0.7, fw = R - fx, y0 = 1.4, fh = (BOT - 0.2 - y0) / facts.length;
    const vf = uni(facts.map(q => [q.value, fw, Math.min(1.0, fh * 0.5), { f: 'n', one: true }]), [44, 18]);
    const lf = uni(facts.map(q => [q.label, fw, fh * 0.45 - 0.1, {}]), [15, 10]);
    facts.forEach((q, i) => {
      const y = y0 + i * fh;
      seg(s, fx, y, fx + fw, y, { c: p.acc === C.white ? 'FFFFFF' : C.accentLight, w: 1 });
      T(s, q.value, fx, y + 0.12, fw, Math.min(1.0, fh * 0.5), { f: 'n', c: q.warn ? C.warn : C.white, va: 'middle', one: true, fit: vf });
      T(s, q.label, fx, y + 0.16 + Math.min(1.0, fh * 0.5), fw, fh * 0.45 - 0.1, { c: p.text, fit: lf });
    });
  }
};

/* ------------------------------------------------------------- infographic layouts */
/** A title and a line of text as one block, centred on cy (or starting at cy with va: 'top'). */
function labelBlock(s, title, text, x, cy, w, maxH, ts, bs, o = {}) {
  const p = pal(), al = o.al || 'left';
  const tH = title ? Math.min(maxH, measureT(title, w, { b: true }, ts).needH + 0.02) : 0;
  const xH = text ? Math.max(0.2, Math.min(maxH - tH - 0.06, measureT(text, w, {}, bs).needH + 0.02)) : 0;
  const tot = tH + (text ? 0.06 + xH : 0), y0 = o.va === 'top' ? cy : o.va === 'bottom' ? cy - tot : cy - tot / 2;
  if (title) T(s, title, x, y0, w, tH, { b: true, sz: ts, c: o.tc || p.head, al, fit: [ts, Math.min(ts, 9)] });
  if (text) T(s, text, x, y0 + tH + 0.06, w, xH, { sz: bs, c: o.xc || p.text, al, fit: [bs, Math.min(bs, 8.5)] });
  return tot;
}
/** A round node: a number, an icon or a logo inside a filled circle with a ring of the slide colour. */
async function node(s, it, i, x, y, d, col, o = {}) {
  const bg = bgOf();
  if (it.image) {
    circle(s, x, y, d, { fill: C.white, line: col, lw: 2 });
    mark(s, it.image, x + d * 0.2, y + d * 0.2, d * 0.6, d * 0.6, 'center');
  } else {
    circle(s, x, y, d, { fill: col, line: o.ring === false ? undefined : bg, lw: 2.5 });
    const fg = lum(col) > 0.55 ? C.ink : C.white;
    if (it.icon) await icon(s, it.icon, x + d * 0.25, y + d * 0.25, d * 0.5, fg);
    else T(s, String(i + 1), x, y, d, d, { b: true, sz: Math.round(d * 26), c: fg, al: 'center', va: 'middle', one: true, ov: true });
  }
}

/* Stages in a loop (cycle) or parts around a centre (hub): numbered nodes on a ring around a centre
 * label, each with its title and one line beside it. A hub draws spokes from the centre instead of
 * the ring. "aside" puts a note column on the left. */
async function radial(s, sl, n, hub) {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const items = need(sl, 'items', 3, hub ? 8 : 6), N = items.length, fam = FAM();
  const asideW = sl.aside ? 3.6 : 0, x0 = L + (asideW ? asideW + 0.5 : 0), aW = R - x0, aH = bot - TOP;
  const lw = asideW ? 2.3 : 3.1, d = hub ? 0.6 : 0.64;
  const r = Math.max(1.05, Math.min(aH / 2 - d / 2 - 0.12, (aW - 2 * lw - 2 * (d / 2 + 0.3)) / 2));
  const cx = x0 + aW / 2, cy = TOP + aH / 2;
  const rows = Math.ceil(N / 2), maxH = Math.min(1.9, aH / rows - 0.1);
  const ts = uni(items.map(it => [it.title, lw, Math.min(0.66, maxH * 0.4), { b: true }]), [20, 12])[0];
  const bs = uni(items.map(it => [it.text, lw, maxH - 0.5, {}]), [16, 10])[0];
  const cd = hub ? Math.min(2.3, r * 1.05) : r * 0.98;
  if (hub) {
    items.forEach((it, i) => {
      const a = (-90 + (360 / N) * (i + 0.5)) * Math.PI / 180, ex = cx + Math.cos(a) * (cd / 2), ey = cy + Math.sin(a) * (cd / 2);
      seg(s, ex, ey, cx + Math.cos(a) * (r - d / 2), cy + Math.sin(a) * (r - d / 2), { c: p.d ? C.onDark2 : C.idle, w: 1.25 });
    });
    const c = sl.center || {};
    if (c.image) { circle(s, cx - cd / 2, cy - cd / 2, cd, { fill: C.white, line: p.d ? C.deepLine : C.line, lw: 1 }); mark(s, c.image, cx - cd * 0.32, cy - cd * 0.32, cd * 0.64, cd * 0.64, 'center'); }
    else {
      circle(s, cx - cd / 2, cy - cd / 2, cd, { fill: p.d ? C.deepest : C.deep });
      T(s, c.title || '', cx - cd * 0.4, cy - cd * 0.3, cd * 0.8, c.text ? cd * 0.36 : cd * 0.6, { f: 'h', c: C.white, al: 'center', va: c.text ? 'bottom' : 'middle', fit: [20, 11] });
      if (c.text) T(s, c.text, cx - cd * 0.38, cy + cd * 0.08, cd * 0.76, cd * 0.26, { sz: 11, c: C.onDark, al: 'center', fit: [11, 8.5] });
    }
  } else {
    shape(s, 'ellipse', cx - r, cy - r, 2 * r, 2 * r, { line: p.d ? C.deepLine : mix(PRIMARY, PAPER, 0.55), lw: 2.25, noInk: true });
    shape(s, 'ellipse', cx - cd * 0.62, cy - cd * 0.62, cd * 1.24, cd * 1.24, { line: p.rule, lw: 1, dash: 'sysDot', noInk: true });
    circle(s, cx - cd / 2, cy - cd / 2, cd, { fill: p.d ? C.deep2 : mix(ACCENT, PAPER, 0.86), grad: p.d ? undefined : C.white });
    const c = sl.center || {};
    T(s, c.title || sl.center || '', cx - cd * 0.42, cy - cd * 0.3, cd * 0.84, cd * 0.6, { f: 'h', c: p.d ? C.white : C.deep, al: 'center', va: 'middle', fit: [22, 11] });
  }
  for (let i = 0; i < N; i++) {
    const it = items[i], a = (-90 + (360 / N) * (i + 0.5)) * Math.PI / 180, nx = cx + Math.cos(a) * r, ny = cy + Math.sin(a) * r, col = fam[i % fam.length];
    await node(s, it, i, nx - d / 2, ny - d / 2, d, col);
    const right = Math.cos(a) > -0.15;
    const bx = right ? nx + d / 2 + 0.22 : x0, bw = right ? Math.min(lw, R - (nx + d / 2 + 0.22)) : Math.min(lw, nx - d / 2 - 0.22 - x0);
    labelBlock(s, it.title, it.text, right ? bx : nx - d / 2 - 0.22 - bw, ny, bw, maxH, ts, bs, { al: right ? 'left' : 'right', tc: p.d ? C.white : inkOf(col) });
  }
  if (sl.aside) sideNote(s, sl.aside.heading, sl.aside.bullets || sl.aside.text, L, TOP, asideW, aH, { fit: [18, 11] });
}
L_.cycle = async (s, sl, n) => radial(s, sl, n, false);
L_.hub = async (s, sl, n) => radial(s, sl, n, true);

/* Four options or parts around a diamond split in four, each with its title and line at a corner of
 * the slide and a bar pointing in from the slide's edge. items[0] is at the top right, then clockwise. */
L_.diamond = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const items = need(sl, 'items', 4, 4), fam = FAM();
  const hgt = bot - TOP - 0.05, dw = Math.min(3.7, hgt * 0.7), cx = W / 2, cy = TOP + hgt / 2 + 0.02;
  const top = cy - hgt / 2, btm = cy + hgt / 2, lft = cx - dw / 2, rgt = cx + dw / 2;
  // corners: TR, BR, BL, TL
  const Q = [
    { pts: [[cx, top], [rgt, cy], [cx, cy]], col: fam[0], c: [cx + dw * 0.17, cy - hgt * 0.17], right: true, up: true },
    { pts: [[cx, cy], [rgt, cy], [cx, btm]], col: fam[3], c: [cx + dw * 0.17, cy + hgt * 0.17], right: true, up: false },
    { pts: [[cx, cy], [cx, btm], [lft, cy]], col: fam[2], c: [cx - dw * 0.17, cy + hgt * 0.17], right: false, up: false },
    { pts: [[cx, top], [cx, cy], [lft, cy]], col: fam[1], c: [cx - dw * 0.17, cy - hgt * 0.17], right: false, up: true },
  ];
  Q.forEach(q => poly(s, q.pts, { fill: q.col }));
  // the quiet lines across the diamond, as in a cut stone
  [0.22, 0.44, 0.66].forEach(t => [-1, 1].forEach(sg => {
    const y = cy + sg * t * (hgt / 2), hw = (dw / 2) * (1 - t);
    seg(s, cx - hw, y, cx + hw, y, { c: 'FFFFFF', w: 0.75, dash: 'dash', noInk: true });
  }));
  const tw = lft - 0.55 - (L + 0.95);
  const ts = uni(items.map(it => [it.title, tw, 0.82, { b: true }]), [24, 13])[0];
  const bs = uni(items.map(it => [it.text, tw, hgt * 0.32, {}]), [18, 11])[0];
  for (let i = 0; i < 4; i++) {
    const it = items[i], q = Q[i], d = Math.min(0.8, dw * 0.2);
    await node(s, it, i, q.c[0] - d / 2, q.c[1] - d / 2, d, q.col);
    const y = q.up ? cy - hgt * 0.36 : cy + hgt * 0.1, bx = q.right ? rgt + 0.55 : L + 0.95;
    // the bar from the slide's edge, pointing at the text
    const by = y + 0.2;
    if (q.right) poly(s, [[W, by - 0.1], [R + 0.1, by - 0.1], [R - 0.08, by], [R + 0.1, by + 0.1], [W, by + 0.1]], { fill: q.col });
    else poly(s, [[0, by - 0.1], [L + 0.5, by - 0.1], [L + 0.68, by], [L + 0.5, by + 0.1], [0, by + 0.1]], { fill: q.col });
    labelBlock(s, it.title, it.text, q.right ? bx : bx, y, q.right ? R - 0.35 - bx : tw, hgt * 0.42, ts, bs, { va: 'top', al: q.right ? 'right' : 'left', tc: inkOf(q.col) });
  }
};

/* Big arrows in a row: the steps of a process as chevrons, each step's text under its arrow. */
L_.arrows = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const steps = need(sl, 'steps', 3, 6), N = steps.length, tip = 0.45, gap = 0.07;
  const w = (CW + (N - 1) * (tip - gap)) / N, ah = Math.min(2.3, Math.max(1.1, (bot - TOP) * 0.42));
  const colW = w - tip - 0.1;
  const tf = uni(steps.map(st => [st.title, colW - 0.1, ah - 0.55, { f: 'h' }]), [22, 11]);
  const bf = uni(steps.map(st => [st.text, colW, bot - TOP - ah - 0.4, {}]), [18, 10]);
  const textH = Math.max(0, ...steps.map(st => (st.text ? measureT(st.text, colW, {}, bf[0]).needH : 0))) + (steps.some(st => st.tag) ? 0.4 : 0);
  const tot = ah + 0.3 + textH, y = TOP + Math.max(0, (bot - TOP - tot) / 2 - 0.1);
  steps.forEach((st, i) => {
    const x = L + i * (w - tip + gap), strong = st.strong || (sl.lastStrong && i === N - 1);
    const col = strong ? C.accent : mix(C.deep, PAPER, N > 1 ? 0.62 * (1 - i / (N - 1)) : 0);
    const pts = i === 0 ? [[x, y], [x + w - tip, y], [x + w, y + ah / 2], [x + w - tip, y + ah], [x, y + ah]]
      : [[x, y], [x + w - tip, y], [x + w, y + ah / 2], [x + w - tip, y + ah], [x, y + ah], [x + tip, y + ah / 2]];
    poly(s, pts, { fill: col, grad: mix(col, 'FFFFFF', 0.1) });
    const fg = lum(col) > 0.55 ? C.ink : C.white, ix = x + (i ? tip : 0.2) + 0.05, iw = w - tip - (i ? tip : 0.2) - 0.05;
    T(s, String(i + 1).padStart(2, '0'), ix, y + 0.16, iw, 0.26, { f: 'd', sz: 11, cs: 1, c: fg === C.white ? mix(col, 'FFFFFF', 0.6) : C.muted, one: true });
    T(s, st.title, ix, y + 0.42, iw, ah - 0.55, { f: 'h', c: fg, va: 'middle', fit: tf });
    const tx = x + (i ? tip * 0.6 : 0.05);
    let ty = y + ah + 0.25;
    if (st.tag) { T(s, st.tag, tx, ty, colW, 0.3, { b: true, sz: 12, c: inkOf(strong ? C.accent : C.deep), one: true, fit: [12, 9] }); ty += 0.38; }
    T(s, st.text, tx, ty, colW, bot - ty, { c: p.text, fit: bf });
  });
  band(s, bot + 0.15, bandH(sl), sl.band, 'soft');
};

/* Levels as a pyramid (narrowest at the top) or, with "invert", a funnel; each level's explanation
 * beside it on a leader line. */
L_.pyramid = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const lv = need(sl, 'levels', 3, 6), N = lv.length, inv = !!sl.invert;
  const ph = bot - TOP - 0.05, pw = Math.min(6.4, ph * 1.3), px = L, cx = px + pw / 2, top = TOP + 0.02, g = 0.07;
  const bh = (ph - g * (N - 1)) / N;
  const hw = y => (inv ? (pw / 2) * (1 - 0.7 * (y - top) / ph) : (pw / 2) * Math.max(0, (y - top) / ph));
  const tx = px + pw + 0.55, tw = R - tx;
  const bs = uni(lv.map(l => [l.text, tw - 0.1, bh, {}]), [19, 11])[0];
  for (let i = 0; i < N; i++) {
    const y0 = top + i * (bh + g), y1 = y0 + bh, ym = (y0 + y1) / 2;
    const col = inv ? (i === N - 1 ? C.accent : mix(C.deep, PAPER, 0.62 * (1 - i / Math.max(1, N - 2)))) : (i === 0 ? C.accent : mix(C.deep, PAPER, 0.62 * ((i - 1) / Math.max(1, N - 2))));
    poly(s, [[cx - hw(y0), y0], [cx + hw(y0), y0], [cx + hw(y1), y1], [cx - hw(y1), y1]], { fill: col, grad: mix(col, 'FFFFFF', 0.12) });
    const fg = lum(col) > 0.55 ? C.ink : C.white;
    // the label inside the band; in the apex triangle it sits in the wide lower part
    const ly = !inv && i === 0 ? y0 + bh * 0.42 : y0, lh = !inv && i === 0 ? bh * 0.58 : bh, lwid = 2 * hw(!inv && i === 0 ? y0 + bh * 0.8 : ym) * 0.86;
    T(s, lv[i].label, cx - lwid / 2, ly, lwid, lh, { b: true, c: fg, al: 'center', va: 'middle', fit: [17, 9] });
    // leader to the explanation
    const ex = cx + hw(ym) + 0.1;
    seg(s, ex, ym, tx - 0.12, ym, { c: p.rule, w: 0.75, dash: 'sysDot', noInk: true });
    circle(s, tx - 0.15, ym - 0.04, 0.08, { fill: inkOf(col) });
    labelBlock(s, lv[i].title, lv[i].text, tx, ym, tw, bh + g, 19, bs, { tc: inkOf(col) });
  }
};

/* A hierarchy: one root over its children, each child with its own items under it on a rail. */
L_.tree = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const root = sl.root || {}, kids = need(sl, 'children', 2, 5), K = kids.length;
  const hasG = kids.some(k => (k.children || []).length), gap = 0.3, cw = (CW - gap * (K - 1)) / K;
  const rw = Math.min(CW * 0.55, Math.max(3.4, wText(String(root.title || ''), true, 18, 0, false, 'd') + 1.4)), rh = root.text ? 0.98 : 0.62, rx = W / 2 - rw / 2, ry = TOP;
  rrect(s, rx, ry, rw, rh, { fill: root.color === 'deep' ? C.deep : C.accent, r: 0.06 });
  T(s, root.title, rx + 0.2, ry + 0.06, rw - 0.4, root.text ? 0.44 : rh - 0.12, { b: true, c: C.white, al: 'center', va: 'middle', one: true, fit: [19, 11] });
  if (root.text) T(s, root.text, rx + 0.2, ry + 0.5, rw - 0.4, rh - 0.56, { sz: 12, c: mix(C.accent, 'FFFFFF', 0.85), al: 'center', fit: [12, 9] });
  if (!root.title) err('"root.title" is missing');
  const busY = ry + rh + 0.28, cy0 = busY + 0.34, lc = p.d ? C.onDark2 : C.idle;
  seg(s, W / 2, ry + rh, W / 2, busY, { c: lc, w: 1.25 });
  seg(s, L + cw / 2, busY, R - cw / 2, busY, { c: lc, w: 1.25 });
  const kh = hasG ? Math.min(1.6, (bot - cy0) * 0.45) : bot - cy0, iconD = kids.some(k => k.icon || k.image) ? 0.5 : 0;
  const tf = uni(kids.map(k => [k.title, cw - 0.4, 0.5, { b: true }]), [20, 12]);
  const bf = uni(kids.map(k => [k.text, cw - 0.4, kh - 0.75 - iconD / 2, {}]), [16, 10]);
  for (let i = 0; i < K; i++) {
    const k = kids[i], x = L + i * (cw + gap), mx = x + cw / 2;
    seg(s, mx, busY, mx, cy0, { c: lc, w: 1.25 });
    rrect(s, x, cy0, cw, kh, { fill: mix(ACCENT, PAPER, 0.85), grad: p.d ? C.deep2 : C.white, gradAng: 90, r: 0.08 });
    if (iconD) await node(s, k, i, mx - iconD / 2, cy0 - iconD / 2, iconD, C.accent);
    const ttop = cy0 + (iconD ? iconD / 2 + 0.1 : 0.16);
    labelBlock(s, k.title, k.text, x + 0.2, ttop, cw - 0.4, kh - (ttop - cy0) - 0.1, tf[0], bf[0], { va: hasG ? 'top' : 'top', al: 'center', tc: inkOf(C.accent) });
    const g = (k.children || []).slice(0, 5);
    if ((k.children || []).length > 5) err(`child "${k.title}" holds 5 items at most`);
    if (g.length) {
      const gy0 = cy0 + kh + 0.25, gp = Math.min(0.85, (bot - gy0) / g.length), railX = x + 0.22;
      seg(s, railX, cy0 + kh, railX, gy0 + (g.length - 1) * gp + gp / 2 - 0.05, { c: lc, w: 1 });
      const gf = uni(g.map(q => [typeof q === 'string' ? q : q.title, cw - 0.6, gp - 0.12, {}]), [16, 10]);
      g.forEach((q, j) => {
        const yy = gy0 + j * gp;
        seg(s, railX, yy + (gp - 0.1) / 2, x + 0.42, yy + (gp - 0.1) / 2, { c: lc, w: 1 });
        rrect(s, x + 0.42, yy, cw - 0.42, gp - 0.1, { fill: p.card, r: 0.06 });
        T(s, typeof q === 'string' ? q : q.title, x + 0.56, yy, cw - 0.7, gp - 0.1, { c: p.text, va: 'middle', fit: gf });
      });
    }
  }
};

/* A wall of logos on white tiles running off the slide's edge, the point on the left. */
L_['logo-wall'] = async (s, sl, n) => {
  const gx0 = 6.15, area = { x: L, w: gx0 - L - 0.45 };
  head(s, sl, n, area);
  const p = pal(), bot = foot(s, sl, area);
  const logos = need(sl, 'logos', 3, 24);
  body(s, sl.bullets || sl.text, L, TOP + 0.15, area.w, bot - TOP - 0.15, { c: p.text, pa: 10, fit: [24, 13], va: 'middle' });
  // the largest tile that shows every logo in the room right of the text, the grid running off the slide
  let best = null;
  for (let tw = 2.2; tw >= 1.05; tw -= 0.05) {
    const th = tw * 0.74, g = tw * 0.12, cols = Math.floor((W - gx0 + g) / (tw + g)), rows = Math.floor((H - MAST - 0.25 + g) / (th + g));
    if (cols * rows >= logos.length) { best = { tw, th, g, cols, rows }; break; }
  }
  if (!best) { err('too many logos for the wall; use 24 at most'); return; }
  const { tw, th, g } = best, y0 = MAST + 0.28;
  let k = 0;
  for (let r = 0; y0 + r * (th + g) < H; r++) {
    for (let c = 0; gx0 + c * (tw + g) < W; c++) {
      const x = gx0 + c * (tw + g), y = y0 + r * (th + g), whole = x + tw <= W && y + th <= H;
      const it = whole && k < logos.length ? logos[k++] : null;
      rrect(s, x, y, tw, th, { fill: p.d ? C.deep2 : C.white, r: 0.16, shadow: !p.d && !!it, noGrad: true, alpha: it ? 0 : 45, noInk: !it });
      if (it) {
        const lab = it.label ? 0.3 : 0;
        mark(s, typeof it === 'string' ? it : it.image, x + tw * 0.2, y + th * 0.16, tw * 0.6, th * 0.68 - lab, 'center');
        if (it.label) T(s, it.label, x + 0.1, y + th - 0.44, tw - 0.2, 0.3, { sz: 12, c: p.text, al: 'center', va: 'middle', one: true, fit: [12, 8.5] });
      }
    }
  }
};

/* Items on slanted stripes of pale colour, edge to edge: tools, products, options seen side by side. */
L_.bands = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const items = need(sl, 'items', 3, 6), N = items.length, fam = FAM();
  const top = TOP - 0.05, b = H, sk = Math.min(1.1, (b - top) * 0.2), sw = (W + sk) / N;
  const ts = uni(items.map(it => [it.title, sw - 1.2, 0.5, { b: true, one: true }]), [22, 12])[0];
  const bs = uni(items.map(it => [it.text, sw - 1.2, 1.3, {}]), [17, 10])[0];
  // the middle of the part of stripe i that is on the slide at height y
  const edge = (i, y) => -sk + i * sw + sk * (1 - (y - top) / (b - top));
  const xAt = (i, y) => (Math.max(0.35, edge(i, y)) + Math.min(W - 0.35, edge(i + 1, y))) / 2;
  const wAt = (i, y) => Math.min(W - 0.35, edge(i + 1, y)) - Math.max(0.35, edge(i, y)) - 0.5;
  for (let i = 0; i < N; i++) {
    const xl = -sk + i * sw, xr = xl + sw;
    poly(s, [[xl + sk, top], [xr + sk, top], [xr, b], [xl, b]], { fill: mix(fam[i % fam.length], PAPER, p.d ? 0.2 : 0.86) });
  }
  for (let i = 1; i < N; i++) { const xb = -sk + i * sw; seg(s, xb + sk, top, xb, b, { c: bgOf(), w: 4, noInk: true }); }
  for (let i = 0; i < N; i++) {
    const it = items[i], iy = top + (bot - top) * 0.3, ty = top + (bot - top) * 0.56, d = Math.min(1.25, sw * 0.42);
    if (it.image) mark(s, it.image, xAt(i, iy) - d / 2, iy - d / 2, d, d, 'center');
    else if (it.icon) await icon(s, it.icon, xAt(i, iy) - d * 0.35, iy - d * 0.35, d * 0.7, inkOf(fam[i % fam.length]));
    const cw = Math.min(sw - 0.7, wAt(i, ty));
    labelBlock(s, it.title, it.text, xAt(i, ty) - cw / 2, ty, cw, bot - ty, ts, bs, { va: 'top', al: 'center', tc: inkOf(fam[i % fam.length]) });
  }
};

/* A big arrow across the slide with milestones on it; what each milestone holds sits above and below
 * the arrow in turn. */
L_.roadmap = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl);
  const items = need(sl, 'items', 3, 7), N = items.length;
  const yc = TOP + (bot - TOP) / 2, th = 0.46, hd = 0.75;
  poly(s, [[0, yc - th / 2], [R - hd + 0.3, yc - th / 2], [R - hd + 0.3, yc - th * 1.2], [R + 0.35, yc], [R - hd + 0.3, yc + th * 1.2], [R - hd + 0.3, yc + th / 2], [0, yc + th / 2]],
    { fill: C.deep, grad: C.accent, gradAng: 0 });
  const x0 = L + 0.45, x1 = R - hd - 0.2, sp = (x1 - x0) / Math.max(1, N - 1), bw = Math.min(3.3, sp * 1.9 - 0.2);
  const half = (bot - TOP) / 2 - th / 2 - 0.45;
  const ts = uni(items.map(it => [it.title, bw, 0.66, { b: true }]), [20, 12])[0];
  const bs = uni(items.map(it => [it.text, bw, half - 0.9, {}]), [16, 10])[0];
  items.forEach((it, i) => {
    const x = x0 + i * sp, up = i % 2 === 0;
    circle(s, x - 0.17, yc - 0.17, 0.34, { fill: C.paper, line: C.accent, lw: 2.5 });
    if (it.label) T(s, it.label, x + 0.24, yc - th / 2, Math.min(sp - 0.35, 1.6), th, { f: 'd', sz: 10.5, c: C.white, va: 'middle', one: true, fit: [10.5, 8], ov: true });
    const cy = up ? yc - th / 2 - 0.35 : yc + th / 2 + 0.35;
    seg(s, x, up ? yc - 0.17 : yc + 0.17, x, cy, { c: p.d ? C.onDark2 : C.idle, w: 1, noInk: true });
    const bx = Math.max(L, Math.min(R - bw, x - bw / 2));
    labelBlock(s, it.title, it.text, bx, cy, bw, half, ts, bs, { va: up ? 'bottom' : 'top', al: 'center' });
  });
};

/* Rows with a coloured label block on the left (an icon and a short label) and the statement fading
 * out to the right: vision and mission, principles, commitments. An optional picture on the right. */
L_.ribbons = async (s, sl, n) => {
  head(s, sl, n);
  const p = pal(), bot = foot(s, sl) - bandH(sl) - (sl.band ? 0.15 : 0);
  const items = need(sl, 'items', 2, 5), N = items.length, gap = 0.22;
  const rw = sl.image ? 7.4 : CW, rh = Math.min(1.5, (bot - TOP - gap * (N - 1)) / N), tot = N * rh + (N - 1) * gap, y0 = TOP + Math.max(0, (bot - TOP - tot) / 2);
  const bw = Math.min(4.0, rw * 0.36), cols = [C.deep, mix(PRIMARY, PAPER, 0.28), C.accent, mix(ACCENT, PAPER, 0.25)];
  const xf = uni(items.map(it => [it.text, rw - bw - 0.6, rh - 0.2, {}]), [20, 12]);
  const lf = uni(items.map(it => [it.label, bw - (items.some(q => q.icon || q.image) ? 1.35 : 0.55), rh * 0.62, { b: true }]), [20, 12]);
  for (let i = 0; i < N; i++) {
    const it = items[i], y = y0 + i * (rh + gap), col = cols[i % cols.length];
    rect(s, L + bw, y, rw - bw, rh, { fill: mix(col, PAPER, 0.84), grad: bgOf(), gradAng: 0, noInk: true });
    rect(s, L, y, bw, rh, { fill: col, grad: mix(col, 'FFFFFF', 0.1) });
    const hasMark = it.icon || it.image, lx = L + 0.3, lwid = bw - (hasMark ? 1.35 : 0.55);
    if (it.kicker) T(s, String(it.kicker).toUpperCase(), lx, y + rh * 0.18, lwid, 0.26, { sz: 10, cs: 2, c: mix(col, 'FFFFFF', 0.7), one: true });
    T(s, it.label, lx, it.kicker ? y + rh * 0.18 + 0.28 : y, lwid, it.kicker ? rh * 0.82 - 0.4 : rh, { b: true, c: C.white, va: it.kicker ? 'top' : 'middle', fit: lf });
    if (it.image) mark(s, it.image, L + bw - 0.8, y + (rh - 0.5) / 2, 0.5, 0.5, 'center');
    else if (it.icon) await icon(s, it.icon, L + bw - 0.8, y + (rh - 0.5) / 2, 0.5, C.white);
    T(s, it.text, L + bw + 0.3, y + 0.1, rw - bw - 0.6, rh - 0.2, { c: p.text, va: 'middle', fit: xf });
  }
  if (sl.image) await pic(s, sl.image, L + rw + 0.4, TOP, R - (L + rw + 0.4), bot - TOP, { fit: sl.fit || 'cover', focus: sl.focus, alt: sl.alt });
  band(s, bot + 0.15, bandH(sl), sl.band, 'soft');
};

/* ------------------------------------------------------------- speaker notes */
/* pptxgenjs writes a slide's notes as one text run, and PowerPoint does not show the line breaks
 * inside it. Rewrite each line as its own paragraph: a blank line stays a blank paragraph, and a
 * line written all in capitals (a group label such as KEY POINT) is set in bold. */
const JSZip = req('jszip');
const NOTE_RUN = /<a:p><a:r>(<a:rPr[^>]*\/>)<a:t>([^<]*)<\/a:t><\/a:r>(<a:endParaRPr[^>]*\/>)?<\/a:p>/g;
// a group label: a line in capitals, which may name a part of the slide ("GRAFIK KIRI: RECALL@5")
const NOTE_LABEL = /^(?=.*[A-Z]{2})[A-Z0-9][A-Z0-9 :@&\/().,+'%-]{2,48}$/;
async function notesParagraphs(buf) {
  if (!JSZip) { warn('jszip not found: line breaks in speaker notes are not kept'); return buf; }
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter(f => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f));
  for (const f of names) {
    const xml = await zip.file(f).async('string');
    const out = xml.replace(NOTE_RUN, (m, rpr, text, endp) => {
      const lines = text.split(/\r\n|\r|\n/);
      if (lines.length === 1) return m;
      const end = endp || rpr.replace('<a:rPr', '<a:endParaRPr');
      const bold = rpr.replace('<a:rPr ', '<a:rPr b="1" ');
      return lines.map(ln => (ln.trim() ? `<a:p><a:r>${NOTE_LABEL.test(ln.trim()) ? bold : rpr}<a:t>${ln}</a:t></a:r></a:p>` : `<a:p>${end}</a:p>`)).join('');
    });
    if (out !== xml) zip.file(f, out);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* ------------------------------------------------------------- coverage */
/* meta.coverage lists the parts of the sources: the outline.json that extract_content.py writes, an
 * inline list [{ "id", "title" }] (the fact list), or { "key": either } for several documents (ids
 * become "key:id"). Every part with substance must be named in some slide's "covers", directly or
 * through a parent, or in meta.omit with the reason. A part with substance: a leaf section with 40
 * words or more, or with a table, a chart or a picture; every inline item. */
function coverage() {
  const m = deck.meta || {};
  if (!m.coverage) return null;
  const parts = [];
  const load = (src, key) => {
    let list = src, file = null;
    if (typeof src === 'string') { file = src; const j = JSON.parse(fs.readFileSync(abs(src), 'utf8')); list = j.sections || j; }
    (list || []).forEach(q => parts.push({ ...q, id: key ? `${key}:${q.id}` : String(q.id), parent: q.parent ? (key ? `${key}:${q.parent}` : String(q.parent)) : null, file, inline: !file }));
  };
  const cv = m.coverage;
  try {
    if (typeof cv === 'string' || Array.isArray(cv)) load(cv, null);
    else Object.entries(cv).forEach(([k, v]) => load(v, k));
  } catch (e) { LINT.errors.push(`deck — meta.coverage cannot be read: ${e.message}`); return null; }
  const byId = {}, kids = {};
  parts.forEach(q => { byId[q.id] = q; if (q.parent) kids[q.parent] = true; });
  const covered = new Set(Object.keys(m.omit || {}));
  slides.forEach((s0, i) => (s0.covers || []).forEach(id => {
    covered.add(String(id));
    if (!byId[id]) LINT.warns.push(`slide ${i + 1} (${s0.id || s0.layout}) — "covers" names "${id}", which is not in meta.coverage`);
  }));
  const up = q => { const out = []; let c = q; while (c && c.parent) { out.push(c.parent); c = byId[c.parent]; } return out; };
  const need = parts.filter(q => !kids[q.id] && (q.inline || q.words === undefined || q.words >= 40 || (q.tables || 0) + (q.charts || 0) + (q.pictures || 0) > 0));
  const miss = need.filter(q => !covered.has(q.id) && !up(q).some(a => covered.has(a)));
  if (miss.length) LINT.errors.push(`deck — the deck leaves out ${miss.length} part(s) of the sources: ${miss.slice(0, 12).map(q => `${q.id} "${String(q.title || '').slice(0, 50)}"${q.page ? ` (p. ${q.page})` : ''}`).join(' · ')}${miss.length > 12 ? ' …' : ''} — put each on a slide ("covers": ["${miss[0].id}"]) or list it in meta.omit with the reason`);
  return { total: need.length, miss, omitted: Object.keys(m.omit || {}).length };
}

/* ------------------------------------------------------------- transitions */
/* Gradients: pptxgenjs writes solid fills only. Shapes named "grad:<from>:<to>" get their solid fill
 * replaced by a two-stop linear gradient (top left to bottom right), and a plain name. */
const BGS = {};
async function gradients(buf) {
  if (!JSZip) return buf;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  for (const f of names) {
    let xml = await zip.file(f).async('string');
    const bg = BGS[Number(f.match(/slide(\d+)\.xml$/)[1]) - 1];
    if (bg) xml = xml.replace(/<p:bg><p:bgPr><a:solidFill>[\s\S]*?<\/a:solidFill>/, `<p:bg><p:bgPr><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${bg[0]}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${bg[1]}"/></a:gs></a:gsLst><a:lin ang="2700000" scaled="0"/></a:gradFill>`);
    if (!xml.includes('name="grad:')) { if (bg) zip.file(f, xml); continue; }
    const out = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, m => {
      const nm = m.match(/name="grad:([0-9A-F]{6}):([0-9A-F]{6})(?::(\d+))?"/);
      if (!nm) return m;
      const g = `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${nm[1]}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${nm[2]}"/></a:gs></a:gsLst><a:lin ang="${nm[3] ? Number(nm[3]) * 60000 : 2700000}" scaled="0"/></a:gradFill>`;
      return m.replace(/(<p:spPr>[\s\S]*?)<a:solidFill>[\s\S]*?<\/a:solidFill>/, (mm, pre) => pre + g).replace(/name="grad:[0-9A-F:]+"/, 'name="Card"');
    });
    zip.file(f, out);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* meta.transition ("fade", "push", "wipe") sets a quiet transition on every slide; a slide's own
 * "transition" overrides it ("none" for none). Off by default. */
const TRANS = { fade: '<p:fade/>', push: '<p:push dir="u"/>', wipe: '<p:wipe dir="r"/>' };
async function transitions(buf) {
  const def = deck.meta && deck.meta.transition;
  if (!def && !slides.some(q => q.transition)) return buf;
  if (!JSZip) { warn('jszip not found: transitions are not set'); return buf; }
  const zip = await JSZip.loadAsync(buf);
  for (let i = 0; i < slides.length; i++) {
    const t = slides[i].transition || def, f = `ppt/slides/slide${i + 1}.xml`;
    if (!t || t === 'none' || !zip.file(f)) continue;
    if (!TRANS[t]) { LINT.warns.push(`slide ${i + 1} — unknown transition "${t}" (fade, push, wipe, none)`); continue; }
    let xml = await zip.file(f).async('string');
    const tr = `<p:transition spd="med">${TRANS[t]}</p:transition>`;
    xml = xml.includes('</p:clrMapOvr>') ? xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + tr) : xml.replace('</p:sld>', tr + '</p:sld>');
    zip.file(f, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/* ------------------------------------------------------------- empty space */
/* The largest empty rectangle inside a region, on a 0.1 in grid, ignoring rectangles thinner than
 * minDim in either direction. Boxes get a small margin: the space right around a text or a picture
 * belongs to it. */
function largestEmpty(boxes, rx, ry, rw, rh, minDim = 1.0, pad = 0.14) {
  const g = 0.1, nx = Math.round(rw / g), ny = Math.round(rh / g);
  if (nx < 1 || ny < 1) return null;
  const full = Array.from({ length: ny }, () => new Uint8Array(nx));
  boxes.forEach(b => {
    const c0 = Math.max(0, Math.floor((b.x - pad - rx) / g)), c1 = Math.min(nx, Math.ceil((b.x + b.w + pad - rx) / g));
    const r0 = Math.max(0, Math.floor((b.y - pad - ry) / g)), r1 = Math.min(ny, Math.ceil((b.y + b.h + pad - ry) / g));
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) full[r][c] = 1;
  });
  const hgt = new Array(nx).fill(0), min = Math.round(minDim / g);
  let best = { a: 0 };
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) hgt[c] = full[r][c] ? 0 : hgt[c] + 1;
    const st = [];
    for (let c = 0; c <= nx; c++) {
      const hh = c < nx ? hgt[c] : 0;
      let start = c;
      while (st.length && st[st.length - 1][1] >= hh) {
        const [sc, sh] = st.pop();
        if (sh >= min && c - sc >= min && sh * (c - sc) > best.a) best = { a: sh * (c - sc), c0: sc, c1: c, r0: r + 1 - sh, r1: r + 1 };
        start = sc;
      }
      st.push([start, hh]);
    }
  }
  if (!best.a) return null;
  const x = rx + best.c0 * g, y = ry + best.r0 * g, w = (best.c1 - best.c0) * g, h = (best.r1 - best.r0) * g;
  const where = `${y + h / 2 < 3.0 ? 'top' : y + h / 2 > 5.3 ? 'bottom' : 'middle'}${x + w / 2 < 4.6 ? ' left' : x + w / 2 > 8.7 ? ' right' : ''}`;
  return { x, y, w, h, a: w * h, share: (w * h) / (rw * rh), where };
}
/** Empty space on a slide: the largest empty area of the content region (cards count as content),
 *  and the emptiest card (a card counts as empty where nothing is drawn inside it). */
function emptiness(d) {
  const top = d.top || TOP0;
  const slide = largestEmpty([...d.ink, ...d.boxes], L, top - 0.05, CW, BOT - top + 0.05);
  let card = null;
  d.boxes.forEach(b => {
    if (b.w * b.h < 2.5) return;
    const inside = [...d.ink, ...d.boxes].filter(q => q !== b && q.x >= b.x - 0.02 && q.y >= b.y - 0.02 && q.x + q.w <= b.x + b.w + 0.02 && q.y + q.h <= b.y + b.h + 0.02);
    const e = largestEmpty(inside, b.x + 0.1, b.y + 0.1, b.w - 0.2, b.h - 0.2, 0.9);
    if (e && e.a >= 2.2 && e.share >= 0.3 && (!card || e.a > card.a)) card = { ...e, box: b };
  });
  return { slide, card };
}

/* ------------------------------------------------------------- build */
async function main() {
  if (!TOTAL) { console.error('deck.json has no "slides"'); process.exit(2); }
  await prepareLogos();
  const seen = {};
  for (let i = 0; i < slides.length; i++) {
    const sl = slides[i], layout = sl.layout;
    // asymmetric layouts mirror on every second use, so a deck does not repeat one composition
    if (!sl._cont) seen[layout] = (seen[layout] || 0) + 1;
    sl._alt = seen[layout] % 2 === 0;
    const s = pptx.addSlide();
    const tone = sl.tone || (layout === 'gallery' && sl.frame === 'browser' ? 'dark' : TONE[layout]) || 'light';
    TOP = TOP0;
    cur = { id: `slide ${i + 1} (${sl.id || layout})`, layout, tone, texts: [], ink: [], boxes: [], notes: 0, cont: !!sl._cont };
    LINT.slides.push(cur);
    if (!L_[layout]) { err(`unknown layout "${layout}". Available: ${Object.keys(L_).join(', ')}`); continue; }
    s.background = { color: cur.tone === 'dark' ? C.deep : cur.tone === 'accent' ? C.accent : cur.tone === 'tint' ? C.tint : C.paper };
    // dark and accent slides get a diagonal gradient background: the accent deepens towards the primary
    // colour, so an accent slide reads as rich rather than as a flat default blue
    if (cur.tone === 'dark') BGS[i] = [mix(PRIMARY, 'FFFFFF', 0.03), mix(PRIMARY, '000000', 0.2)];
    if (cur.tone === 'accent') BGS[i] = [mix(ACCENT, 'FFFFFF', 0.04), mix(ACCENT, '000000', 0.3)];
    if (cur.tone === 'accent' && !ACCENT_OK.has(layout)) warn(`"tone": "accent" suits ${[...ACCENT_OK].join(', ')}; on ${layout} its cards and marks lose contrast`);
    // depth on dark slides: one soft light from the top right instead of a flat fill
    if (cur.tone === 'dark' && sl.glow === true && L_[layout]) await glow(s, W - 5.5, -3.2, 9, 9, C.accent, 0.3);
    if (cur.tone === 'accent' && sl.glow === true) await glow(s, W - 6, -3.5, 10, 10, 'FFFFFF', 0.1);
    cur.words = slideWords(sl);
    cur.panel = sidePanel(sl);
    await L_[layout](s, sl, i + 1);
    cur.top = TOP;
    if (sl.notes && String(sl.notes).trim().length >= 60) { s.addNotes(String(sl.notes)); cur.notes = String(sl.notes).length; }
    else err('speaker notes are missing or too short — write what the presenter says for this slide');
  }
  cur = null;
  const sl = LINT.slides;
  sl.forEach((d, i) => {
    if (i > 0 && d.layout === sl[i - 1].layout && !d.cont) LINT.errors.push(`${d.id} — same layout as the slide before it (${d.layout}); pick another layout for one of them`);
    // a table and its continuation slides count as one unit
    const prev = sl.slice(0, i).filter(q => !q.cont).slice(-2);
    if (!d.cont && KIND[d.layout] && prev.length === 2 && prev.every(q => KIND[q.layout] === KIND[d.layout])) LINT.warns.push(`${d.id} — three ${KIND_NAME[KIND[d.layout]]} slides in a row (${prev[0].layout}, ${prev[1].layout}, ${d.layout}); change the kind of one of them: a statement, a picture, a chart or a drawing`);
    else if (i > 1 && [d, sl[i - 1], sl[i - 2]].every(q => BOXES.has(q.layout))) LINT.warns.push(`${d.id} — three slides in a row are rows of boxes (${sl[i - 2].layout}, ${sl[i - 1].layout}, ${d.layout}); this is what makes a deck look generated — show one of them as the source's picture, a chart, a diagram or a table`);
    const budget = BUDGET();
    if (d.words > budget * 1.1 && !NO_BUDGET.has(d.layout)) LINT.warns.push(`${d.id} — ${d.words} words on the slide (about ${budget} at most for a ${MODE} deck); the slide shows its one point, the detail goes to the notes, an appendix or a second slide`);
    if (!['cover', 'section', 'statement'].includes(d.layout)) {
      const { slide: e, card: c } = emptiness(d), fix = 'the content is too thin for this layout — add what the sources hold on this point (its picture, its table, its numbers), pick a layout made for less, or merge this slide with its neighbour';
      if (e && e.share >= 0.12) (e.share >= 0.22 && d.layout !== 'quote' ? LINT.errors : LINT.warns).push(`${d.id} — empty area of ${e.w.toFixed(1)} × ${e.h.toFixed(1)} in (${e.where}, ${Math.round(e.share * 100)}% of the content area): ${fix}`);
      if (c) (c.share >= 0.5 && c.a >= 4 ? LINT.errors : LINT.warns).push(`${d.id} — a ${c.box.w.toFixed(1)} × ${c.box.h.toFixed(1)} in card is ${Math.round(c.share * 100)}% empty inside: ${fix}`);
    }
    d.texts.forEach((a, ai) => d.texts.slice(ai + 1).forEach(b => {
      if (a.ov || b.ov) return;
      const ox = Math.min(a.ex + a.ew, b.ex + b.ew) - Math.max(a.ex, b.ex), oy = Math.min(a.ey + a.eh, b.ey + b.eh) - Math.max(a.ey, b.ey);
      if (ox > 0.03 && oy > 0.03) LINT.errors.push(`${d.id} — two texts overlap: ${a.id} and ${b.id}`);
    }));
    if (process.env.DECK_EMPTY_DEBUG) { const { slide: e, card: c } = emptiness(d); console.log(d.id.padEnd(30), e ? `${e.w.toFixed(1)}x${e.h.toFixed(1)} a=${e.a.toFixed(1)} ${Math.round(e.share * 100)}% ${e.where}` : '-', '| card', c ? `${c.w.toFixed(1)}x${c.h.toFixed(1)} a=${c.a.toFixed(1)} ${Math.round(c.share * 100)}% of ${c.box.w.toFixed(1)}x${c.box.h.toFixed(1)}` : '-'); }
    if (d.layout === 'agenda' || d.layout === 'section') LINT.warns.push(`${d.id} — this slide only organizes the deck; keep it only if the user asked for it or the deck is long`);
  });
  const nb = sl.filter(d => BOXES.has(d.layout)).length;
  if (sl.length >= 8 && nb / sl.length > 0.55) LINT.warns.push(`deck — ${nb} of ${sl.length} slides are rows of boxes; use the sources' pictures, charts, tables and diagrams for some of them`);
  const cov = coverage();
  const distinct = new Set(sl.map(d => d.layout)).size;
  if (sl.length >= 8 && distinct / sl.length < 0.5) LINT.warns.push(`deck — only ${distinct} layouts for ${sl.length} slides; vary them`);
  let run = 0;
  sl.forEach(d => { run = d.tone === 'light' || d.tone === 'tint' ? run + 1 : 0; if (run === 5) LINT.warns.push(`${d.id} — five light slides in a row; make one of them dark or accent: a statement, a photo, a dark chart ("tone": "dark")`); });
  if (sl.length >= 8) {
    const light = sl.filter(d => d.tone === 'light' || d.tone === 'tint').length;
    if (light / sl.length > 0.75) LINT.warns.push(`deck — ${light} of ${sl.length} slides are light; about one slide in four should be dark or accent, and not only the section dividers`);
    const tk = sl.filter(d => KIND[d.layout] === 'T').length;
    if (tk / sl.length > 0.4) LINT.warns.push(`deck — ${tk} of ${sl.length} slides are text and cards; show more of the content as pictures, charts, drawings or statements`);
    const pn = sl.filter(d => d.panel).length;
    if (pn / sl.length > 0.25) LINT.warns.push(`deck — ${pn} of ${sl.length} slides put a panel of bullets beside the visual (takeaway, aside, side); say the point in the title and keep the panel for about one slide in four`);
    const over = sl.filter(d => d.words > BUDGET() * 1.1 && !NO_BUDGET.has(d.layout)).length;
    if (over / sl.length > 0.3) LINT.warns.push(`deck — ${over} of ${sl.length} slides are over the word budget; a deck where every slide is a paragraph reads as one long document`);
  }
  if (sl.length >= 10) {
    let since = 0;
    sl.forEach((d, i) => {
      since = KIND[d.layout] === 'S' || d.tone === 'accent' ? 0 : since + 1;
      if (since === 7) LINT.warns.push(`${d.id} — seven slides without a change of pace; put a statement, a big number, a quote or a full photo among them`);
    });
  }
  console.log(`lint: ${sl.length} slides, ${distinct} layouts, tones ${sl.map(d => d.tone[0].toUpperCase()).join('')}${faces.r ? '' : ' (no font files found: text fit is estimated)'}`);
  LINT.warns.forEach(w => console.log('  warn  ' + w));
  LINT.errors.forEach(e => console.log('  ERROR ' + e));
  if (LINT.placeholders.length) console.log('placeholders to replace: ' + [...new Set(LINT.placeholders)].join(' | '));
  if (cov) console.log(`coverage: ${cov.total - cov.miss.length} of ${cov.total} source parts are on slides or omitted on purpose${cov.omitted ? ` (${cov.omitted} in meta.omit)` : ''}`);
  if (LINT.errors.length && !FLAG('--force')) {
    console.error(`\n${LINT.errors.length} lint error(s). Fix them in ${path.basename(SRC)} and run again (or --force to write the file anyway).`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  let buf = await pptx.write({ outputType: 'nodebuffer' });
  buf = await notesParagraphs(buf);
  buf = await transitions(buf);
  buf = await gradients(buf);
  fs.writeFileSync(OUT, buf);
  console.log('wrote ' + OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
