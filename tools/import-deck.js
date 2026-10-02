#!/usr/bin/env node
// Merges the "PcM + PjM Command Deck" (its data-*.js files) into the study site's material:
//   notes/pcm.html, notes/pjm.html, notes/contracts.html (new pages)
//   PcM + PjM sections in notes/overview.html, notes/objectives.html and notes/numbers.html (between <!-- deck:pcmpjm --> markers)
//   flashcards in cards.js, exams + weights + 8 plan weeks in plan.js
//   node tools/import-deck.js <folder with the deck's data-*.js files>
// Practice questions are not taken from the deck. Run it once; it refuses to add cards or plan weeks twice.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), DIR = process.argv[2];
if (!DIR) { console.error('Usage: node tools/import-deck.js <deck data folder>'); process.exit(1); }
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
['data-core.js', 'data-pcm.js', 'data-pjm.js', 'data-drill.js', 'data-misses.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx));
const A = JSON.parse(JSON.stringify(ctx.ARE));
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const esc = s => String(s).replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- objectives: sections, objectives and what each asks ---------- */
const OBJ = { PcM: [], PjM: [] };   // [{n, name, weight, objs:[{num, text, asks}]}]
A.objectives.blocks.filter(b => b.t === 'acc').forEach(b => b.x.forEach(([key, head, body]) => {
  const div = key.startsWith('pcm') ? 'PcM' : 'PjM', m = head.match(/^(\d+)\.\s*(.+?)\s+—\s+(.+)$/);
  const sec = { n: +m[1], name: m[2], weight: m[3], objs: [], intro: '' };
  let cur = null;
  body.forEach(x => {
    if (x.t === 'h4') { const o = strip(x.x).match(/^(\d+\.\d+)\s+(.*)$/); cur = { num: o[1], text: o[2].replace(/\s*(Narrowed|Clarified|New)\b.*$/i, '').trim(), asks: '' }; sec.objs.push(cur); }
    else if (x.t === 'p' || x.t === 'ul') { const t = x.t === 'ul' ? x.x.map(strip).join('; ') : strip(x.x); if (cur) cur.asks += (cur.asks ? ' ' : '') + t; else sec.intro += (sec.intro ? ' ' : '') + t; }
  });
  if (!sec.objs.length) sec.objs.push({ num: sec.n + '.1', text: sec.name + ' (the whole section)', asks: sec.intro });
  OBJ[div].push(sec);
}));
const allObjs = d => OBJ[d].flatMap(s => s.objs.map(o => ({ o: d + ' ' + o.num, sec: s.n, text: o.text + ' ' + o.asks })));
const STOP = new Set('a an and are as at be by for from has have in is it its of on or that the this to was were will with what which how why when where who not no can do does each your their they them than then so such into also any all most more less per use used using should would could may must one two three four five six over under between within about after before while during architect owner project firm'.split(' '));
const words = s => (strip(s).toLowerCase().match(/[a-z][a-z]+/g) || []).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/(ies|es|s)$/, ''));
function bestObj(d, text, secN) {
  const docs = allObjs(d).filter(x => secN == null || x.sec === secN); if (!docs.length) return null;
  const all = allObjs(d), df = {}; all.forEach(x => new Set(words(x.text)).forEach(w => { df[w] = (df[w] || 0) + 1; }));
  const q = new Set(words(text)); let best = docs[0].o, bs = -1;
  docs.forEach(x => { const w = new Set(words(x.text)); let s = 0; q.forEach(t => { if (w.has(t)) s += Math.log(1 + all.length / (df[t] || 1)); }); if (s > bs) { bs = s; best = x.o; } });
  return best;
}

/* ---------- the deck's blocks → the site's notes HTML ---------- */
// bold inside the deck's text becomes <strong>: the site's .hook boxes style a <b> as their title
const B = s => typeof s === 'string' ? s.replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>') : Array.isArray(s) ? s.map(B) : s;
function blocks(list, ctxDiv) { return blocks0((list || []).map(b => { if (!b) return b; const c = Object.assign({}, b); ['x', 'rows', 'head', 'note'].forEach(k => { if (c[k] != null && c.t !== 'note') c[k] = B(c[k]); }); if (c.t === 'note' && typeof c.x === 'string') c.x = B(c.x); return c; }), ctxDiv); }
function blocks0(list, ctxDiv) {
  let o = '', secN = null;
  (list || []).forEach(b => {
    if (!b) return;
    switch (b.t) {
      case 'sec': { const m = String(b.x).match(/^(\d+)\.\s*(.*)$/); secN = m ? +m[1] : null; o += '<h2 class="s">' + (m ? 'Section ' + m[1] + ' · ' + m[2] : b.x) + (b.wt ? ' <span class="pill">' + b.wt + '</span>' : '') + '</h2>\n'; break; }
      case 'h': { const ob = ctxDiv ? bestObj(ctxDiv, b.x + ' ' + JSON.stringify(list.slice(list.indexOf(b) + 1, list.indexOf(b) + 4)), secN) : null;
        o += '<h3 class="s">' + (ob ? '<span class="obj">' + ob + '</span>' : '') + b.x + '</h3>\n'; break; }
      case 'h4': o += '<h4 class="s">' + b.x + '</h4>\n'; break;
      case 'p': o += '<p>' + b.x + '</p>\n'; break;
      case 'ul': o += '<ul>' + b.x.map(i => '<li>' + i + '</li>').join('') + '</ul>\n'; break;
      case 'ol': o += '<ol>' + b.x.map(i => '<li>' + i + '</li>').join('') + '</ol>\n'; break;
      case 'tbl': o += '<div class="tw"><table><thead><tr>' + b.head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + b.rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>\n'; break;
      case 'note': { const inner = typeof b.x === 'string' ? '<p>' + b.x + '</p>' : blocks(b.x, ctxDiv);
        if (b.k === 'trap') o += '<div class="trap">' + (b.title ? '<div class="hd">' + b.title + '</div>' : '') + inner + '</div>\n';
        else if (b.k === 'warn') o += '<div class="rl">' + (b.title ? '<div class="hd">' + b.title + '</div>' : '') + inner + '</div>\n';
        else o += '<div class="hook">' + (b.title ? '<b>' + b.title + '</b>' : '') + inner + '</div>\n';
        break; }
      case 'facts': o += '<div class="tw"><table><tbody>' + b.x.map(r => '<tr><td><b>' + r[0] + '</b></td><td>' + r[1] + '</td></tr>').join('') + '</tbody></table></div>\n'; break;
      case 'fx': o += '<div class="hook"><b>' + b.name + '</b><p><code>' + esc(b.eq) + '</code></p>' + (b.note ? '<p>' + b.note + '</p>' : '') + '</div>\n'; break;
      case 'cards': o += '<div class="grid g3">' + b.x.map(c => '<div class="card"><h4>' + c[0] + '</h4>' + c[1].replace(/<span class="cn">/g, '<div class="big">').replace(/<\/span><div class="cx">/g, '</div><div class="sub">') + '</div>').join('') + '</div>\n'; break;
      case 'phases': o += '<div class="tw"><table><thead><tr><th>Phase</th><th></th><th>What happens</th></tr></thead><tbody>' + b.x.map(p => '<tr><td><b>' + p[0] + '</b></td><td>' + p[1] + '</td><td>' + p[2] + '</td></tr>').join('') + '</tbody></table></div>\n'; break;
      case 'acc': o += b.x.map(a => '<h3 class="s">' + strip(a[1]) + '</h3>\n' + blocks(a[2], ctxDiv)).join(''); break;
      case 'weights': o += '<div class="tw"><table><thead><tr><th>Section</th><th>Share of items</th></tr></thead><tbody>' + b.x.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '–' + r[2] + '%</td></tr>').join('') + '</tbody></table></div>\n'; break;
    }
  });
  return o;
}
const pill = d => '<span class="pill ' + d.toLowerCase() + '">' + d + '</span>';
const head = (eyebrow, title, lede) => '<div class="eyebrow">' + eyebrow + '</div>\n<h1 class="t">' + title + '</h1>\n<p class="lede">' + lede + '</p>\n\n';
const SRC = '<p class="small" style="margin-top:28px">From the PcM + PjM Command Deck: compiled from the NCARB ARE 5.0 specifications for Practice Management and Project Management (including the changes effective 27 April 2026), AIA B101–2017, B101–2007 and A101–2007, <em>The Architecture Student’s Handbook of Professional Practice</em> (15th ed.) and four 2016 practice lectures. Corrections are flagged in place.</p>\n';
const N = p => path.join(ROOT, 'material/notes', p);
const write = (p, s) => { fs.writeFileSync(N(p), s); console.log('wrote material/notes/' + p + ' (' + Math.round(s.length / 1000) + ' KB)'); };
write('pcm.html', head(pill('PcM') + ' ' + A.pcm.eyebrow, A.pcm.title, A.pcm.lede) + blocks(A.pcm.blocks, 'PcM') +
  '<h2 class="s">Wrong-answer review</h2>\n<p class="lede">' + A.misses.lede + '</p>\n' + blocks(A.misses.blocks, 'PcM') + SRC);
write('pjm.html', head(pill('PjM') + ' ' + A.pjm.eyebrow, A.pjm.title, A.pjm.lede) + blocks(A.pjm.blocks, 'PjM') + SRC);
write('contracts.html', head(pill('PjM') + ' ' + pill('PcM') + ' ' + A.contracts.eyebrow, A.contracts.title, A.contracts.lede) + blocks(A.contracts.blocks, 'PjM') + SRC);

/* sections appended to existing pages, between markers so a re-run replaces them */
function spliceSection(p, html) {
  const f = N(p); let s = fs.readFileSync(f, 'utf8'); const a = '<!-- deck:pcmpjm start -->', b = '<!-- deck:pcmpjm end -->';
  const block = '\n' + a + '\n' + html + b + '\n';
  if (s.includes(a)) s = s.slice(0, s.indexOf(a)) + block.trim() + '\n' + s.slice(s.indexOf(b) + b.length).replace(/^\n/, ''); else s = s.replace(/\s*$/, '\n') + block;
  fs.writeFileSync(f, s); console.log('updated material/notes/' + p);
}
spliceSection('overview.html', '<h2 class="s">' + pill('PcM') + ' ' + pill('PjM') + ' Practice Management + Project Management</h2>\n' + blocks(A.overview.blocks));
const objTable = d => '<h2 class="s">' + pill(d) + ' ' + (d === 'PcM' ? 'Practice Management' : 'Project Management') + ' — ' + OBJ[d].reduce((n, s) => n + s.objs.length, 0) + ' objectives</h2>\n<div class="tw"><table>\n<thead><tr><th style="width:62px">Obj</th><th>NCARB wording</th><th>What it actually asks</th></tr></thead>\n<tbody>\n' +
  OBJ[d].map(s => '<tr><td colspan="3"><strong>' + s.n + ' · ' + s.name + ' — ' + s.weight + '</strong></td></tr>\n' + s.objs.map(o => '<tr><td class="n">' + o.num + '</td><td>' + esc(o.text) + '</td><td>' + esc(o.asks || s.intro) + '</td></tr>').join('\n')).join('\n') + '\n</tbody></table></div>\n';
spliceSection('objectives.html', objTable('PcM') + objTable('PjM') + blocks(A.objectives.blocks.filter(b => b.t === 'note')));
spliceSection('numbers.html', '<h2 class="s">' + pill('PcM') + ' ' + pill('PjM') + ' ' + A.numbers.title + '</h2>\n' + blocks(A.numbers.blocks));

/* ---------- flashcards ---------- */
const cardsFile = path.join(ROOT, 'material/cards.js'); let cs = fs.readFileSync(cardsFile, 'utf8');
if (/d:["']P[cj]M · /.test(cs)) console.log('cards.js already has PcM/PjM cards: skipped');
else {
  const ids = [...cs.matchAll(/id:'c(\d+)'/g)].map(m => +m[1]); let next = Math.max(...ids) + 1;
  const DECKDIV = { Contracts: 'PjM', PjM: 'PjM', Delivery: 'PcM', Finance: 'PcM', 'Ethics & Law': 'PcM', Structures: 'PcM', 'Insurance & Risk': 'PcM' };
  const deckName = { PjM: 'Project management' };
  const lines = A.cards.map(([deck, q, a]) => {
    let d = DECKDIV[deck];
    if (!d) d = /B101|A101|A201|consultant|schedule|scope|construction administration|QC|quality/i.test(q + a) ? 'PjM' : 'PcM';   // the "Misses" deck mixes both
    const o = bestObj(d, q + ' ' + a), name = d + ' · ' + (deckName[deck] || deck);
    const ans = /^\s*</.test(a) ? a : '<p>' + a + '</p>';
    return "{id:'c" + (next++) + "',d:" + JSON.stringify(name) + ",o:'" + o + "',q:" + JSON.stringify(q) + ",a:" + JSON.stringify(ans) + "}";
  });
  cs = cs.replace(/,?\s*\n\];\s*$/, ',\n' + lines.join(',\n') + '\n];\n');   // the last line may already end with a comma
  fs.writeFileSync(cardsFile, cs); console.log('cards.js: added ' + lines.length + ' cards (c' + (next - lines.length) + '–c' + (next - 1) + ')');
}

/* ---------- exams, weights and 8 more plan weeks ---------- */
const planFile = path.join(ROOT, 'material/plan.js'); let ps = fs.readFileSync(planFile, 'utf8');
const pctx = {}; pctx.window = pctx; vm.createContext(pctx); vm.runInContext(ps, pctx);
const P = pctx.ARE;
if (P.exams.some(e => e.d === 'PcM')) console.log('plan.js already has PcM/PjM: skipped');
else {
  const last = P.plan[P.plan.length - 1], day = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fmt = t => t.toISOString().slice(0, 10), MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  const lbl = (a, b) => a.getUTCDate() + (a.getUTCMonth() === b.getUTCMonth() ? '' : ' ' + MON[a.getUTCMonth()]) + '–' + b.getUTCDate() + ' ' + MON[b.getUTCMonth()];
  let start = new Date(day(last.to).getTime() + 864e5);
  const weeks = [], exams = {};
  A.plan.weeks.forEach((w, i) => {
    const from = new Date(start.getTime() + i * 7 * 864e5), to = new Date(from.getTime() + 6 * 864e5), sit = /sit (PcM|PjM)/i.exec(w.t);
    const wk = { w: last.w + i + 1, from: fmt(from), to: fmt(to), d: lbl(from, to), g: w.t.replace(/\s*→\s*/, ' · '), t: w.tasks.map(strip) };
    if (sit) { const fri = new Date(to.getTime() - 2 * 864e5), dv = sit[1].toUpperCase() === 'PCM' ? 'PcM' : 'PjM'; exams[dv] = fmt(fri); wk.exam = dv + ' exam — Friday ' + fri.getUTCDate() + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][fri.getUTCMonth()]; }
    weeks.push(wk);
  });
  const ser = o => '{' + Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => k + ':' + JSON.stringify(v)).join(',') + '}';
  ps = ps.replace(/(ARE\.exams = \[[\s\S]*?)\n\];/, (m0, a) => a + ",\n {d:'PcM', name:'Practice Management',                  date:'" + exams.PcM + "', items:65},\n {d:'PjM', name:'Project Management',                   date:'" + exams.PjM + "', items:75}\n];");
  const wt = (k, list) => ' ' + k + ':' + JSON.stringify(list.map((r, i) => [strip(r[0]).replace(/^\d+\.\s*/, ''), r[1], r[2], i === list.reduce((bi, x, j, arr) => (x[1] + x[2] > arr[bi][1] + arr[bi][2] ? j : bi), 0) ? 1 : 0]));
  const W = A.overview.blocks.filter(b => b.t === 'weights');
  ps = ps.replace(/(ARE\.weights = \{[\s\S]*?)\n\};/, (m0, a) => a + ',\n' + wt('pcm', W[0].x) + ',\n' + wt('pjm', W[1].x) + '\n};');
  ps = ps.replace(/(ARE\.planNote = ')/, "$1<p><strong>Weeks " + weeks[0].w + "–" + weeks[weeks.length - 1].w + " (PcM and PjM):</strong> contracts first, then PcM, then PjM, from the PcM + PjM Command Deck. Sit PcM at the end of week " + weeks.find(w => /PcM/.test(w.exam || '')).w + " and PjM at the end of week " + weeks[weeks.length - 1].w + ". Change the exam dates on Today.</p>");
  ps = ps.replace(/,?\s*\n\];\s*$/, ',\n' + weeks.map(ser).join(',\n') + '\n];\n');
  fs.writeFileSync(planFile, ps); console.log('plan.js: PcM ' + exams.PcM + ', PjM ' + exams.PjM + ', weeks ' + weeks[0].w + '–' + weeks[weeks.length - 1].w + ' (' + weeks[0].d + ' to ' + weeks[weeks.length - 1].d + ')');
}
