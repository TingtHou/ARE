#!/usr/bin/env node
// Turns a quiz text file (the "ARE-PPD-PDD-All-Quizzes.txt" layout) into practice questions in material/questions.js.
//   node tools/import-quizzes.js <quizzes.txt> [--divisions PPD,PDD] [--keep PA] [--dry]
// Questions of the listed divisions are replaced; those of --keep divisions stay. New questions get fresh ids
// (ids are never reused, so old answers can't attach to a different question). Objectives are chosen automatically
// from the objective map (section from "Category:", objective by best word match); check them in the summary.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SRC = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--divisions' && args[args.indexOf(a) - 1] !== '--keep');
if (!SRC) { console.error('Usage: node tools/import-quizzes.js <quizzes.txt> [--divisions PPD,PDD] [--keep PA] [--dry]'); process.exit(1); }
const DIVS = (opt('--divisions') || 'PPD,PDD').split(','), KEEP = (opt('--keep') || 'PA').split(','), DRY = args.includes('--dry');

/* ---------- the objective map: sections and objectives per division ---------- */
const objHtml = fs.readFileSync(path.join(ROOT, 'material/notes/objectives.html'), 'utf8');
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const MAP = {}; let div = null, sec = null;
for (const m of objHtml.matchAll(/<h2 class="s"><span class="pill [a-z]+">([A-Z]+)<\/span>|<tr>([\s\S]*?)<\/tr>/g)) {
  if (m[1]) { div = m[1]; MAP[div] = []; continue; }
  if (!div) continue;
  const td = [...m[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(x => strip(x[1]));
  if (td.length === 1) { const t = td[0].match(/^(\d+)\s*·\s*(.+?)\s+—/); if (t) { sec = { n: +t[1], name: t[2], objs: [] }; MAP[div].push(sec); } }
  else if (td.length === 3 && sec) sec.objs.push({ o: div + ' ' + td[0], text: td[1] + ' ' + td[2] });
}
const norm = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('a an and are as at be by for from has have in is it its of on or that the this to was were will with what which how why when where who not no can do does each your their they them than then so such into also any all most more less per use used using should would could may must one two three four five six over under between within about after before while during'.split(' '));
const words = s => (s.toLowerCase().match(/[a-z][a-z]+/g) || []).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/(ies|es|s)$/, ''));
function section(d, category) {
  const c = norm(category).replace(/ estimate$/, '');
  return MAP[d].find(s => norm(s.name) === c) || MAP[d].find(s => norm(s.name).startsWith(c) || c.startsWith(norm(s.name))) || null;
}
function objective(d, sec, text) {
  const qw = words(text), df = {};
  const docs = MAP[d].flatMap(s => s.objs).map(o => ({ o: o.o, w: new Set(words(o.text)) }));
  docs.forEach(x => x.w.forEach(w => { df[w] = (df[w] || 0) + 1; }));
  let best = null, bs = -1;
  sec.objs.forEach(o => { const w = new Set(words(o.text)); let s = 0; new Set(qw).forEach(t => { if (w.has(t)) s += Math.log(1 + docs.length / (df[t] || 1)); }); if (s > bs) { bs = s; best = o.o; } });
  return best;
}

/* ---------- text → small HTML ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function html(lines) {
  const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^\s{2,}\S/.test(l) && !/^\s*[-•]\s/.test(l)) { const b = []; while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-•]\s/.test(lines[i])) b.push(lines[i++].replace(/^\s{2}/, '')); out.push('<pre class="qtab">' + esc(b.join('\n')) + '</pre>'); continue; }
    if (/^\s*[-•]\s+/.test(l)) { const b = []; while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) b.push('<li>' + esc(lines[i++].replace(/^\s*[-•]\s+/, '')) + '</li>'); out.push('<ul>' + b.join('') + '</ul>'); continue; }
    const b = []; while (i < lines.length && lines[i].trim() && !/^\s{2,}\S/.test(lines[i]) && !/^\s*[-•]\s+/.test(lines[i])) b.push(esc(lines[i++].trim()));
    out.push('<p>' + b.join('<br>') + '</p>');
  }
  return out.join('');
}

/* ---------- parse ---------- */
const raw = fs.readFileSync(SRC, 'utf8').replace(/\r/g, '');
const all = raw.split('\n');
const qs = [], warn = [];
let curDiv = null;
for (let i = 0; i < all.length; i++) {
  const l = all[i];
  const quiz = l.match(/^(PA|PPD|PDD|PCM)[ -]*Quiz\b/); if (quiz) { curDiv = quiz[1]; continue; }
  const h = l.match(/^QUESTION (\d+) \(([^)]*)\)(?:\s+—\s+(.*))?$/); if (!h) continue;
  let j = i + 1; const blk = [];
  while (j < all.length && !/^(={10,}|-{20,}|END OF |QUESTION \d+ \()/.test(all[j])) blk.push(all[j++]);
  if (curDiv && DIVS.includes(curDiv)) qs.push({ div: curDiv, n: +h[1], kind: h[2], title: h[3] || '', blk, line: i + 1 });
}
function parseQ(q) {
  const b = q.blk.slice();
  const catI = b.findIndex(x => /^Category:/.test(x)); const category = catI >= 0 ? b.splice(catI, 1)[0].replace(/^Category:\s*/, '') : '';
  const refI = b.findIndex(x => /^Reference:/.test(x)); const ref = refI >= 0 ? b.splice(refI).join(' ').replace(/^Reference:\s*/, '').trim() : '';
  const caI = b.findIndex(x => /^CORRECT ANSWERS?:/.test(x));
  if (caI < 0) throw new Error('no CORRECT ANSWER line');
  const pre = b.slice(0, caI), caLine = b[caI], post = b.slice(caI + 1);
  const optRe = /^([A-H])[.)]\s+(.*)$/;
  const isMatch = /drag/i.test(q.kind) || pre.some(x => /^\s+→\s/.test(x));
  const out = { title: q.title, category, ref };
  if (isMatch) {
    // choices: an indented "- X" list or a "Methods: a / b / c" line; statements: "A. text" then "→ choice"
    let choices = [], stem = [], items = [], map = [];
    for (let k = 0; k < pre.length; k++) {
      const x = pre[k], m = x.match(optRe);
      if (m) { let t = m[2]; while (pre[k + 1] && !/^\s+→/.test(pre[k + 1]) && !optRe.test(pre[k + 1]) && pre[k + 1].trim()) t += ' ' + pre[++k].trim(); items.push(t.replace(/^"|"$/g, '').replace(/^“|”$/g, '')); continue; }
      const ar = x.match(/^\s+→\s+(.*)$/); if (ar) { map[items.length - 1] = ar[1].trim(); continue; }
      const li = x.match(/^\s+[-•]\s+(.*)$/); if (li && !items.length) { choices.push(li[1].trim()); continue; }
      const cl = x.match(/^(Methods|Classifications|Choices|Options|Categories|Available [a-z ]+):\s*(.+)$/i); if (cl && !items.length) { choices = cl[2].split(/\s+[\/|]\s+/).map(s => s.trim()); continue; }
      if (!items.length) stem.push(x);
    }
    const key = s => s.toLowerCase().replace(/\s*\(.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const c = map.map((v, k) => { const want = key(v); let idx = choices.findIndex(ch => key(ch) === want); if (idx < 0) idx = choices.findIndex(ch => key(ch).startsWith(want) || want.startsWith(key(ch))); if (idx < 0) throw new Error('statement ' + String.fromCharCode(65 + k) + ' answer "' + v + '" is not one of the choices'); return idx; });
    if (!choices.length || items.length < 2 || c.length !== items.length) throw new Error('could not read the matching layout');
    let ex = post.filter(x => !/^- .+:\s*Statements?\s/i.test(x) && !/^- .+?:\s*Statement/i.test(x));
    while (ex.length && /^-\s/.test(ex[0])) ex.shift();
    Object.assign(out, { t: 'match', s: html(stem), items, opts: choices, c, e: html(ex.map(x => x.replace(/^Explanation:\s*/, ''))) });
    return out;
  }
  const opts = [], marks = [], stem = [];
  for (let k = 0; k < pre.length; k++) {
    const m = pre[k].match(optRe);
    if (m && (opts.length || !/^\s/.test(pre[k]))) {
      let t = m[2]; const good = /✓\s*CORRECT/.test(t), why = (t.match(/✗\s*INCORRECT\s*(\(.*\))?/) || [])[1];
      t = t.replace(/\s*✓\s*CORRECT.*$/, '').replace(/\s*✗\s*INCORRECT.*$/, '').trim();
      opts.push(t); marks.push(good); continue;
    }
    if (opts.length && pre[k].trim()) { warn.push(q.div + ' Q' + q.n + ' (line ' + q.line + '): text after the options was added to the question: "' + pre[k].trim().slice(0, 60) + '"'); }
    if (!/^Answer:\s*_+/.test(pre[k])) stem.push(pre[k]);
  }
  const ex = post.map(x => x.replace(/^Explanation:\s*/, ''));
  if (opts.length >= 2) {
    const letters = (caLine.replace(/^CORRECT ANSWERS?:\s*/, '').split(/\s+—\s+/)[0].match(/\b[A-H]\b/g) || []);
    let c = [...new Set(letters.map(x => x.charCodeAt(0) - 65))].filter(k => k < opts.length);
    if (!c.length) c = marks.map((g, k) => g ? k : -1).filter(k => k >= 0);
    if (!c.length) throw new Error('no correct option found');
    const markIdx = marks.map((g, k) => g ? k : -1).filter(k => k >= 0);
    if (markIdx.length && markIdx.join() !== c.join()) warn.push(q.div + ' Q' + q.n + ': the ✓ marks (' + markIdx.map(k => String.fromCharCode(65 + k)).join(',') + ') differ from CORRECT ANSWER; used CORRECT ANSWER');
    Object.assign(out, { t: c.length > 1 || /multiple select/i.test(q.kind) ? 'cata' : 'mc', s: html(stem), opts, c, e: html(ex) });
    return out;
  }
  // numeric fill-in
  const body = caLine.replace(/^CORRECT ANSWERS?:\s*/, '');
  const ent = body.match(/\(enter\s+([-\d.,]+)\)/i), num = ent ? ent[1] : (body.match(/-?\$?[\d,]*\.?\d+/) || [])[0];
  if (!num) throw new Error('no numeric answer found');
  const val = parseFloat(num.replace(/[$,]/g, '')), dec = (num.replace(/[$,]/g, '').split('.')[1] || '').length;
  const unit = (/\$/.test(body.split('(')[0]) ? 'dollars' : body.split('(')[0].replace(/^[\s\S]*?[\d.,]+\s*/, '').replace(/^(approx\.?\s*)/i, '').trim()).slice(0, 30);
  const tol = /approx/i.test(body) ? Math.max(Math.abs(val) * 0.01, 0.5 * Math.pow(10, -dec)) : 0.5 * Math.pow(10, -dec);
  Object.assign(out, { t: 'num', s: html(stem), ans: val, tol: +tol.toPrecision(3), unit, e: html(ex) });
  return out;
}

/* ---------- build ---------- */
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
const qFile = path.join(ROOT, 'material/questions.js'), qSrc = fs.readFileSync(qFile, 'utf8');
vm.runInContext(qSrc, ctx);
const old = ctx.ARE.questions || [];
const maxId = Math.max(-1, ...old.map(q => +(String(q.id).match(/^q(\d+)$/) || [0, -1])[1]));
let next = maxId + 1;
const kept = old.filter(q => KEEP.includes(q.d) || !DIVS.includes(q.d));
const made = [], fail = [], objCount = {};
qs.forEach(q => {
  try {
    const p = parseQ(q), sec = section(q.div, p.category);
    if (!sec) throw new Error('category "' + p.category + '" is not a ' + q.div + ' section');
    const o = objective(q.div, sec, p.title + ' ' + p.s + ' ' + p.e + ' ' + (p.items || []).join(' ') + ' ' + (p.opts || []).join(' '));
    objCount[o] = (objCount[o] || 0) + 1;
    const e = p.e + (p.ref ? '<p class="qsrc">Source: ' + esc(p.ref) + '</p>' : '');
    const s = (p.title ? '<p class="qtitle">' + esc(p.title) + '</p>' : '') + p.s;
    const item = { id: 'q' + next++, d: q.div, o, t: p.t, s };
    if (p.t === 'num') Object.assign(item, { ans: p.ans, tol: p.tol, unit: p.unit });
    if (p.t === 'match') item.items = p.items;
    if (p.t !== 'num') Object.assign(item, { opts: p.opts, c: p.c });
    item.e = e;
    made.push(item);
  } catch (err) { fail.push(q.div + ' Q' + q.n + ' (line ' + q.line + ', ' + q.kind + '): ' + err.message); }
});
const head = qSrc.slice(0, qSrc.indexOf('ARE.questions = ['));
const lit = v => JSON.stringify(v).replace(/<\/script/gi, '<\\/script');
const ser = q => '{' + Object.entries(q).map(([k, v]) => k + ':' + lit(v)).join(',') + '}';
const outSrc = head + 'ARE.questions = [\n' + kept.concat(made).map(ser).join(',\n') + '\n];\n';
const types = made.reduce((a, q) => (a[q.t] = (a[q.t] || 0) + 1, a), {});
console.log('Read ' + qs.length + ' ' + DIVS.join('/') + ' questions from ' + path.basename(SRC) + '.');
console.log('Made ' + made.length + ' (' + Object.entries(types).map(([k, v]) => v + ' ' + k).join(', ') + '), kept ' + kept.length + ' (' + KEEP.join(', ') + '). New ids q' + (maxId + 1) + '–q' + (next - 1) + '.');
console.log('Removed ' + (old.length - kept.length) + ' old ' + DIVS.join('/') + ' questions.');
DIVS.forEach(d => console.log(d + ' objectives: ' + Object.entries(objCount).filter(([o]) => o.startsWith(d + ' ')).sort().map(([o, n]) => o.split(' ')[1] + '×' + n).join('  ')));
if (warn.length) console.log('\nCheck:\n- ' + warn.join('\n- '));
if (fail.length) { console.log('\nNot converted:\n- ' + fail.join('\n- ')); }
if (DRY) { console.log('\n(dry run: nothing written)'); fs.writeFileSync(path.join(require('os').tmpdir(), 'questions.preview.js'), outSrc); }
else { fs.writeFileSync(qFile, outSrc); console.log('\nWrote material/questions.js'); }
