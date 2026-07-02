# IT Product Deployment — Gantt & Tracking Kit

An interactive, GitHub-hosted Gantt chart for rolling out an IT product/system — drag-and-drop scheduling and click-to-edit task details, like Weeek/Trello, but living entirely in this repo with no external service.

| Need | Weeek/Trello equivalent | This repo |
|---|---|---|
| Drag-and-drop visual timeline (day/month/year) | Weeek Gantt/Timeline view | [`webapp/`](webapp/) — interactive Gantt app, hosted free on GitHub Pages |
| Click a task for details / edit | Trello card | Click any bar → info box with name, phase, dates, owner, status, dependencies, notes |
| Task list with dates/owners/status | Trello cards / Weeek tasks | [`webapp/projects.json`](webapp/projects.json) — the live data file the app reads and writes |
| Dependencies between tasks | Weeek dependency arrows | `dependencies` field per task; rendered as arrows automatically |
| Subtasks | Trello checklist / Weeek subtask | Collapsible phase rows (▶/▼) with tasks nested underneath, both in the fixed name column and the chart |
| Multiple boards | Multiple Weeek/Trello workspaces | A project switcher dropdown in the toolbar — one deployment, several independent task lists |
| Static/offline reference | — | [`gantt-chart.md`](gantt-chart.md) (Mermaid) and [`tasks.csv`](tasks.csv) — a non-interactive snapshot of the original single project, useful for a quick look without opening the app |

## The interactive app (primary tool)

Live at: `https://YOUR-ORG-OR-USER.github.io/it-deployment-gantt/` once GitHub Pages is enabled (one-time setup below).

- **Anyone** can open the link and view the chart — drag a bar, and it's obvious this is read-only (bar snaps back, a toast explains why).
- **To edit**: click **Connect GitHub to edit**, paste a personal access token (see setup below). From then on: drag bars to reschedule, drag the right edge to resize, drag the progress handle to update %, and click any bar or task name to open the full info box (rename, reassign, change phase/status, edit dependencies/notes, or delete).
- **Task names live in a fixed left column** synced to the chart, and the date-axis header stays visible (with a reachable horizontal scrollbar) no matter how far you scroll down through a long task list.
- **Phases are collapsible** — click a phase row's ▼/▶ to fold its tasks away into a single summary bar; dependency arrows automatically reroute to point at the summary bar when their target is hidden.
- **Multiple projects**: use the dropdown next to the title to switch between projects, or **+ Project** (while connected) to start a new one.
- **English/Russian toggle** in the top-right switches all interface text (buttons, labels, statuses); task data you enter is not auto-translated.
- **Saving** writes a real commit to `webapp/projects.json` via the GitHub API — teammates see it after the next Pages build (usually under a minute).
- Your token is stored only in your own browser's local storage and talks directly to `api.github.com` — it never passes through any third-party server.

### One-time setup

1. **Enable GitHub Pages via Actions**: repo → **Settings** → **Pages** → under "Build and deployment", set **Source** to **GitHub Actions**. The included workflow ([`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)) then deploys `webapp/` automatically on every push to `main`.
2. **Generate a token** (each teammate who wants to edit does this once): GitHub → profile picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**. Scope it to just this repository, with **Repository permissions → Contents: Read and write**.
3. Open the app, click **Connect GitHub to edit**, and fill in the owner, repo name, branch (`main`), and the token you just generated.

## Files

- **`webapp/`** — the interactive app: `index.html`, `app.js`, `style.css`, and `projects.json` (the live data — an array of projects, each with its own task list). This is what gets deployed to GitHub Pages.
- **`gantt-chart.md`** — static Mermaid chart mirroring the original single project; renders directly on GitHub with no setup, handy as a quick offline-friendly reference.
- **`tasks.csv`** — the original flat-data version of the plan (Excel-friendly). `webapp/projects.json` is now the live source of truth; this file is a point-in-time reference.
- **`docs/github-project-setup.md`** — optional: if you'd rather track status via GitHub Issues + a GitHub Project (Kanban board/roadmap) instead of, or alongside, the app.
- **`scripts/import-to-github.ps1`** — optional: bulk-creates GitHub Issues from `tasks.csv` for teams using the Issues/Project route above.

## Quick start

1. Push this repo to GitHub (see below) if you haven't already.
2. Enable Pages (Part 1 above) and open the deployed app URL.
3. Connect a token and customize the plan directly in the chart — rename tasks, adjust dates by dragging, add/remove tasks via **+ Add task**.
4. Share the Pages URL with your team; anyone with a token can edit, everyone else can view.

## Pushing this repo to GitHub

If this repo isn't on GitHub yet:

```powershell
# 1. Create a new EMPTY repository on https://github.com/new (no README/license/gitignore)

# 2. Point this local repo at it and push (replace YOUR-ORG-OR-USER):
git remote add origin https://github.com/YOUR-ORG-OR-USER/it-deployment-gantt.git
git branch -M main
git push -u origin main
```

Git for Windows' Credential Manager will pop up a browser login the first time — no token handling needed for the push itself (the token above is separate, and only used by the web app to save chart edits).
