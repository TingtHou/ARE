#!/usr/bin/env node
// Adds practice questions written in the study-pack format (any of the four types) to material/questions.js,
// with fresh ids after the last one. Questions whose text already exists are skipped.
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
const md = t => String(t || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => { const ls = b.split('\n').filter(x => x.trim()); if (!ls.length) return '';
  if (ls.every(l => /^\s*[-•]\s+/.test(l))) return '<ul>' + ls.map(l => '<li>' + inl(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>';
  if (ls.every(l => /^\s*\d+[.)]\s+/.test(l))) return '<ol>' + ls.map(l => '<li>' + inl(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>').join('') + '</ol>';
  return '<p>' + ls.map(inl).join('<br>') + '</p>'; }).join('');
const pick = (list, w) => { const x = String(w).trim(); let k = list.findIndex(o => o.toLowerCase() === x.toLowerCase()); if (k < 0 && /^[A-H]$/.test(x)) k = x.charCodeAt(0) - 65; return k; };

const input = JSON.parse(fs.readFileSync(SRC, 'utf8')), list = Array.isArray(input) ? input : input.questions;
const qFile = path.join(ROOT, 'material/questions.js'), src = fs.readFileSync(qFile, 'utf8');
const ctx = {}; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const old = ctx.ARE.questions, have = new Set(old.map(q => String(q.s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase()));
let next = Math.max(...old.map(q => +(String(q.id).match(/^q(\d+)$/) || [0, -1])[1])) + 1;
const made = [], errs = [];
list.forEach((q, i) => {
  const lab = 'Question ' + (i + 1) + ' (' + (q.title || '').slice(0, 40) + ')';
  try {
    const d = canon(q.division) || canon(String(q.objective).split(' ')[0]); if (!d) throw new Error('no division');
    const num = (String(q.objective).match(/\d+\.\d+/) || [])[0]; if (!num) throw new Error('no objective number');
    const s = '<p class="qtitle">' + esc(q.title) + '</p>' + md(q.question);
    const key = s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); if (have.has(key)) throw new Error('already in the bank');
    const it = { id: 'q' + next, d, o: d + ' ' + num, t: q.type, s };
    if (q.type === 'num') { if (typeof q.answer !== 'number') throw new Error('num needs a numeric answer'); Object.assign(it, { ans: q.answer, tol: q.tolerance || 0, unit: q.unit || '' }); }
    else if (q.type === 'match') { const c = q.matches.map(w => pick(q.choices, w)); if (q.statements.length < 2 || c.length !== q.statements.length || c.some(k => k < 0)) throw new Error('match needs one known choice per statement'); Object.assign(it, { items: q.statements, opts: q.choices, c }); }
    else { const c = [...new Set(q.correct.map(w => pick(q.options, w)))]; if (q.options.length < 2 || !c.length || c.some(k => k < 0)) throw new Error('options/correct do not line up'); if (q.type === 'mc' && c.length !== 1) throw new Error('mc needs exactly one correct option'); if (q.type === 'cata' && c.length < 2) throw new Error('cata needs 2+ correct options'); Object.assign(it, { opts: q.options, c }); }
    it.e = md(q.explanation) + (q.reference ? '<p class="qsrc">Source: ' + esc(q.reference) + '</p>' : '');
    made.push(it); have.add(key); next++;
  } catch (e) { errs.push(lab + ': ' + e.message); }
});
const lit = v => JSON.stringify(v).replace(/<\/script/gi, '<\\/script');
const ser = q => '{' + Object.entries(q).map(([k, v]) => k + ':' + lit(v)).join(',') + '}';
fs.writeFileSync(qFile, src.replace(/,?\s*\n\];\s*$/, ',\n' + made.map(ser).join(',\n') + '\n];\n'));
const by = made.reduce((a, q) => (a[q.o] = (a[q.o] || 0) + 1, a), {}), ty = made.reduce((a, q) => (a[q.t] = (a[q.t] || 0) + 1, a), {});
console.log('Added ' + made.length + ' questions (' + Object.entries(ty).map(([k, v]) => v + ' ' + k).join(', ') + ')' + (made.length ? ', ids ' + made[0].id + '–' + made[made.length - 1].id : '') + '.');
console.log(Object.keys(by).sort().map(o => o + '×' + by[o]).join('  '));
if (errs.length) console.log('Skipped:\n- ' + errs.join('\n- '));
