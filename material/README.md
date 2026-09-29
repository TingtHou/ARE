# ARE Study System — study material

Everything you study is in this folder. The page itself (`../are-study-system.html`) is only the interface. It reads these files every time it opens, so you can change them without touching any code.

| File | What's in it |
|---|---|
| `cards.js` | Flashcards: 176 cards in 13 decks |
| `questions.js` | Practice questions: 57, multiple choice and check-all-that-apply |
| `plan.js` | Exam dates, section weights, the 14-week plan and its intro text |
| `notes/overview.html` | The Overview page |
| `notes/objectives.html` | The Objective map |
| `notes/pa.html`, `ppd.html`, `pdd.html` | The three division study pages |
| `notes/numbers.html` | The Numbers page |

Each `.js` file opens with a comment that explains its format. Read it before you edit that file.

## Common edits

**Add a flashcard.** In `cards.js`, copy the last card line, paste it below, and give it the next id (`c176`, `c177`, …). Then change the deck, the objective, the question and the answer.

**Add a practice question.** In `questions.js`, copy a line and give it the next id (`q57`, `q58`, …). Set `c` to the correct option numbers, counting from 0. So `c:[2]` means the third option is correct.

**Fix a wrong fact.** Edit the text in place. Your progress is saved against each item's `id`, not its wording, so rewording never resets it.

**Move an exam date.** Change `date:` in `ARE.exams` in `plan.js`. The countdowns update the next time the page opens.

**Add a point to the notes.** Open the division's page in `notes/` and add a paragraph where it belongs, for example `<p>Your point here.</p>`. For a highlighted tip, copy one of these existing blocks:
- `<div class="hook"><b>Title</b>Text</div>`: a memory hook
- `<div class="trap"><div class="hd">Title</div><p>Text</p></div>`: a trap to watch for
- `<div class="rl"><div class="hd">Title</div><p>Text</p></div>`: a correction

## Rules that keep your progress safe

1. **Never change or reuse an `id`.** Delete a card or question by removing its line, and leave its id unused.
2. Every item line ends with a comma. Write an apostrophe inside `'…'` as `\'`.
3. After editing, open the page and check **Today**. If any file has a problem (a repeated id, a missing field, a correct-answer number that doesn't exist), a red "Check the material files" box lists it there.

## Publishing changes

Opening `are-study-system.html` straight from your computer won't show the notes pages, because browsers block a local page from reading its own folder. The published link reads everything. After you edit, ask Claude to "publish the study system" and the live link updates. Your progress is kept.
