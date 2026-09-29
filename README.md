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

## Connect your Claude

Each person can connect **their own** Anthropic API key with the **Connect Claude** button in the top bar. Calls go straight from their browser to the Claude API and are billed to their own Anthropic account. The key stays on that device only: it isn't saved to their study account or sent to this site. With a key connected, they get:

- **Explain with Claude** on wrong answers, mistakes and revealed flashcards
- **Ask Claude**, a tutor chat panel that knows the current page, card or section
- **Generate with Claude** on My material, Flashcards and Practice. Drafts go through the study-pack preview before anything is added
- **Build my own plan with Claude** on the Study plan page, around their exam dates and weak spots. **Back to the standard plan** undoes it

On the **claude.ai link** the same features need no API key. They run on the viewer's own claude.ai plan (Pro or Max usage), and claude.ai asks each person to allow it the first time.

### The chat panel

**Ask Claude** opens a chat docked on the right, similar to Claude in VS Code. You can resize it by dragging its edge, start a new chat, and reopen past chats from the history list. Past chats are saved on your device. Claude sees the page you're on, which you can turn off with the chip above the input. It can also act on the site: search the material, quiz you and record your answers, run your due flashcards and save your ratings, add cards, questions and study points (each with **Undo**), tick plan tasks and open pages. Type `/` for commands: `/today`, `/quiz PA 4.1`, `/cards`, `/mistakes`, `/explain`, `/weak`, `/plan`, `/make`.
