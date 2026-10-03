# ARE Study System

Study site for ARE 5.0 PA, PPD and PDD: dashboard, study notes, spaced-repetition flashcards, timed practice, a mistake log and the 14-week plan.

- `src/` holds the page source (layout, styles, app code). Run `build.ps1` after editing it; it writes `are-study-system.html` and `index.html`
- `index.html` is the page served by GitHub/AWS Amplify (generated)
- `are-study-system.html` is the built page published to claude.ai (generated)
- `material/` holds all study content. See `material/README.md` for how to edit it.

Progress is saved in each browser. With accounts switched on (see `aws/SETUP.md` and `config.js`) each person signs in and progress syncs across devices. On the claude.ai version it syncs to your claude.ai account.

## Branches

- `develop` gets every change first and deploys to the preview site.
- `main` is the live site. It only moves when an admin clicks **Publish** on the preview site.

## Divisions

The site covers all five ARE 5.0 divisions: **PA**, **PPD**, **PDD**, **PcM** (Practice Management) and **PjM** (Project Management). PcM and PjM have their own notes pages plus a **Contracts (AIA)** page, objectives in the Objective map, flashcard decks, exam dates on Today (change them there) and plan weeks 15–22. PcM has 77 practice questions (with the original figures and tables) and PjM has 32 (two per objective); make more with **Generate → All of PcM / All of PjM**, or let Endless practice write them as you go. To add your own written questions: `node tools/add-questions.js <questions.json>`. To re-import: `node tools/import-deck.js <deck data folder>` for the deck, and `node tools/add-questions.js <questions.json>` for questions (an `id` already in the bank replaces that question in place; `![alt](img/…png)` lines add figures from `material/img/`).

## Endless practice

**Endless practice** (Study → Endless practice): pick a division and answer one question after another. Your place is saved after every question: leave the page, close the tab or click **Stop**, and next time Endless practice continues on the same question with the same counts (on any device you sign in on). **New session** starts over; **Divisions** switches division and keeps each division's place. Questions you missed, and objectives where you miss often, come up more; nothing repeats within 8 questions. Questions on the same concept (a question and the similar ones written from it, or ones with closely matching wording) are kept at least 6 questions apart, and the same objective rarely comes twice in a row. A question you get right leaves the rotation: it comes back only as an occasional **memory check** (about one question in five, when one is due), 2 days later, then 7, 21 and 60 days as you keep getting it right. Miss a check and it is back in rotation and in Mistakes. The top bar shows how many questions are still to go and how many are learned. Once you know a concept's question, the other questions on that concept come up a little less too. With ChatGPT on the site (or on the claude.ai link), about one in three questions is newly written for your weakest objectives in mixed formats and saved to My material, so each session adds to the pool. Answers count like Practice, misses go into the Mistakes schedule, and a summary lists what you missed with **Reread** and **Learn it**.

## Connect your AI (ChatGPT or Claude)

Everyone uses **their own plan**, ChatGPT or Claude. There are no API keys, and nothing is billed to the site.

**ChatGPT on the website:** click **Connect AI**, then **Continue with ChatGPT**, and run the one-line sign-in command it shows on your own computer (Node.js 18+). After that, explanations, generated material, your plan and the chat panel answer right on the website on your ChatGPT plan (Plus or Pro). Details and the steps behind it: [aws/SETUP.md](aws/SETUP.md), "ChatGPT on the website".

**Claude on the website** reaches each person's study account through the **ARE Study System connector**:

1. Click **Connect AI** in the top bar. It shows the connector URL and the steps.
2. In Claude, go to **Settings → Connectors → Add custom connector**. Name it *ARE Study System* and paste the URL. It ends in `/mcp` and is the `ConnectorUrl` output of the `are-accounts` stack.
3. Click **Connect** and sign in with the same email and password as the website.

In any Claude chat, Claude can then:

- see your plan week, exam dates, due cards, due mistakes and weak spots
- quiz you and record your answers (they count on the Practice and Mistakes pages)
- run your due flashcards and save your ratings
- explain your mistakes
- add cards, questions and study points to **My material**, and remove the ones it added
- tick plan tasks, and save your own week-by-week plan

**Your own documents and agents:** upload PDFs, Word files and notes to **My library**, and make **agents** with your own instructions that answer from them, quiz you and draft cards and questions. They work with ChatGPT on the website and with Claude through the connector. See [aws/SETUP.md](aws/SETUP.md), "My library and my agents".

Everything saves to your study account, so the website shows it the next time you open it or switch back to its tab.

The **Explain with Claude**, **Generate with Claude** and **Build my own plan with Claude** buttons on the website open a new Claude chat with the request already typed. The request is also copied to the clipboard, in case the box is empty.

Your Claude plan must allow custom connectors. The connector's code is `aws/connector.js`. `build.ps1` copies it into `aws/are-accounts.yaml`, so updating the stack updates the connector.

**On the claude.ai link**, the features run inside the page on the viewer's claude.ai plan, and claude.ai asks each person to allow it the first time.

### The chat panel

On the claude.ai link, **Ask Claude** opens a chat docked on the right, similar to Claude in VS Code. You can resize it by dragging its edge, start a new chat, and reopen past chats from the history list. Past chats are saved on your device. Claude sees the page you're on, which you can turn off with the chip above the input. It can also act on the site: search the material, quiz you and record your answers, run your due flashcards and save your ratings, add cards, questions and study points (each with **Undo**), tick plan tasks and open pages. Type `/` for commands: `/today`, `/quiz PA 4.1`, `/cards`, `/mistakes`, `/explain`, `/weak`, `/plan`, `/make`.

## License

The code is open source under the [MIT License](LICENSE). The study material in `material/` is all rights reserved: see [material/LICENSE.md](material/LICENSE.md).
