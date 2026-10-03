#!/usr/bin/env node
// Adds practice questions written in the study-pack format (any of the four types) to material/questions.js,
// with fresh ids after the last one. Questions whose text already exists are skipped. A question that carries
// "id" of one already in the bank replaces it in place (same id, so answers recorded on it still count).
//   node tools/add-questions.js <questions.json>
// Each question: { division, objective ("2.1" or "PjM 2.1"), type: mc|cata|num|match, title, question, explanation, reference,
//   options + correct (mc, cata) | answer + tolerance + unit (num) | statements + choices + matches (match) }
// question and explanation may use blank lines for paragraphs, "- " bullets and **bold**.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = process.argv[2];
if (!SRC) { console.error('Usage: node tools/add-questions.js <questions.json>'); process.exit(1); }
const CANON = { PA: 'PA', PPD: 'PPD', PDD: 'PDD', PCM: 'PcM', PJM: 'PjM' }, canon = s => CANON[String(s || '').trim().toUpperCase()] || null;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, '$1<em>$2</em>');
// A figure is a line "![alt](img/…png)" (path inside material/); a table is a block of "| a | b |" lines, the second one "|---|".
// "Figure as text:" before a table puts the table in a closed <details> under the figure, so the text is there for search and the AI.
const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
const table = ls => { const head = cells(ls[0]), body = ls.slice(/^\s*\|?\s*:?-{3,}/.test(ls[1] || '') ? 2 : 1).map(cells);
  return '<div class="qtwrap"><table class="qtable"><thead><tr>' + head.map(c => '<th>' + inl(c) + '</th>').join('') + '</tr></thead><tbody>' + body.map(r => '<tr>' + r.map(c => '<td>' + inl(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'; };
const md = t => String(t || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => { const ls = b.split('\n').filter(x => x.trim()); if (!ls.length) return '';
  const fig = ls.length === 1 && ls[0].trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
  if (fig) return '<figure class="qfig"><a href="material/' + esc(fig[2]) + '" target="_blank" rel="noopener" title="Open full size"><img src="material/' + esc(fig[2]) + '" alt="' + esc(fig[1]) + '" loading="lazy"></a></figure>';
  if (/^figure as text:?$/i.test(ls[0].trim()) && ls.length > 2 && ls.slice(1).every(l => /^\s*\|/.test(l))) return '<details class="qfigtxt"><summary>Figure as text</summary>' + table(ls.slice(1)) + '</details>';
  if (ls.length > 1 && ls.every(l => /^\s*\|/.test(l))) return table(ls);
  if (ls.every(l => /^\s*[-•]\s+/.test(l))) return '<ul>' + ls.map(l => '<li>' + inl(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>';
  if (ls.every(l => /^\s*\d+[.)]\s+/.test(l))) return '<ol>' + ls.map(l => '<li>' + inl(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>').join('') + '</ol>';
  return '<p>' + ls.map(inl).join('<br>') + '</p>'; }).join('');
const pick = (list, w) => { const x = String(w).trim(); let k = list.findIndex(o => o.toLowerCase() === x.toLowerCase()); if (k < 0 && /^[A-H]$/.test(x)) k = x.charCodeAt(0) - 65; return k; };

const input = JSON.parse(fs.readFileSync(SRC, 'utf8')), list = Array.isArray(input) ? input : input.questions;
const qFile = path.join(ROOT, 'material/questions.js'), src = fs.readFileSync(qFile, 'utf8');
const ctx = {}; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const old = ctx.ARE.questions, have = new Set(old.map(q => String(q.s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase()));
let next = Math.max(...old.map(q => +(String(q.id).match(/^q(\d+)$/) || [0, -1])[1])) + 1;
const made = [], errs = [], swapped = new Map();
list.forEach((q, i) => {
  const lab = 'Question ' + (i + 1) + ' (' + (q.title || '').slice(0, 40) + ')';
  try {
    const d = canon(q.division) || canon(String(q.objective).split(' ')[0]); if (!d) throw new Error('no division');
    const num = (String(q.objective).match(/\d+\.\d+/) || [])[0]; if (!num) throw new Error('no objective number');
    const s = '<p class="qtitle">' + esc(q.title) + '</p>' + md(q.question);
    const key = s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const at = q.id ? old.findIndex(o => o.id === q.id) : -1; if (q.id && at < 0) throw new Error(q.id + ' is not in the bank');
    if (at < 0 && have.has(key)) throw new Error('already in the bank');
    const it = { id: at >= 0 ? q.id : 'q' + next, d, o: d + ' ' + num, t: q.type, s };
    if (q.type === 'num') { if (typeof q.answer !== 'number') throw new Error('num needs a numeric answer'); Object.assign(it, { ans: q.answer, tol: q.tolerance || 0, unit: q.unit || '' }); }
    else if (q.type === 'match') { const c = q.matches.map(w => pick(q.choices, w)); if (q.statements.length < 2 || c.length !== q.statements.length || c.some(k => k < 0)) throw new Error('match needs one known choice per statement'); Object.assign(it, { items: q.statements, opts: q.choices, c }); }
    else { const c = [...new Set(q.correct.map(w => pick(q.options, w)))]; if (q.options.length < 2 || !c.length || c.some(k => k < 0)) throw new Error('options/correct do not line up'); if (q.type === 'mc' && c.length !== 1) throw new Error('mc needs exactly one correct option'); if (q.type === 'cata' && c.length < 2) throw new Error('cata needs 2+ correct options'); Object.assign(it, { opts: q.options, c }); }
    it.e = md(q.explanation) + (q.reference ? '<p class="qsrc">Source: ' + esc(q.reference) + '</p>' : '');
    if (at >= 0) { swapped.set(q.id, it); return; }
    made.push(it); have.add(key); next++;
  } catch (e) { errs.push(lab + ': ' + e.message); }
});
const lit = v => JSON.stringify(v).replace(/<\/script/gi, '<\\/script');
const ser = q => '{' + Object.entries(q).map(([k, v]) => k + ':' + lit(v)).join(',') + '}';
// A question with an "id" that is already in the bank replaces that line in place, so progress on it carries over.
let out = src;
for (const [id, it] of swapped) { const re = new RegExp('^\\{id:"' + id + '",.*?\\}(?=,?\\s*$)', 'm'); if (!re.test(out)) { errs.push(id + ': could not find its line to replace'); continue; } out = out.replace(re, () => ser(it)); }
if (made.length) out = out.replace(/,?\s*\n\];\s*$/, ',\n' + made.map(ser).join(',\n') + '\n];\n');
fs.writeFileSync(qFile, out);
if (swapped.size) console.log('Replaced ' + swapped.size + ' questions in place: ' + [...swapped.keys()].join(' '));
const by = made.reduce((a, q) => (a[q.o] = (a[q.o] || 0) + 1, a), {}), ty = made.reduce((a, q) => (a[q.t] = (a[q.t] || 0) + 1, a), {});
console.log('Added ' + made.length + ' questions (' + Object.entries(ty).map(([k, v]) => v + ' ' + k).join(', ') + ')' + (made.length ? ', ids ' + made[0].id + '–' + made[made.length - 1].id : '') + '.');
console.log(Object.keys(by).sort().map(o => o + '×' + by[o]).join('  '));
if (errs.length) console.log('Skipped:\n- ' + errs.join('\n- '));
