# IT Product Deployment — Gantt & Tracking Kit

A GitHub-native project plan for rolling out an IT product/system. It replaces the "Weeek board + separate Gantt chart" combo with two things GitHub already renders/hosts for free:

| Need | Weeek/Trello equivalent | This repo |
|---|---|---|
| Visual timeline (day/month/year) | Weeek Gantt view | [`gantt-chart.md`](gantt-chart.md) — Mermaid chart, renders directly on GitHub, no plugin |
| Kanban board (To Do / In Progress / Done) | Trello board | GitHub Project **Board** view — see [`docs/github-project-setup.md`](docs/github-project-setup.md) |
| Drag-and-drop timeline / roadmap | Weeek Timeline | GitHub Project **Roadmap** view (zoom Day/Week/Month/Quarter) — same doc |
| Task list with dates/owners/status | Trello cards / Weeek tasks | [`tasks.csv`](tasks.csv) — also the source data for bulk-creating GitHub Issues |
| Dependencies between tasks | Weeek dependency arrows | `after <id>` links in the Mermaid chart, and a `Dependencies` column in the CSV |
| Subtasks | Trello checklist / Weeek subtask | Mermaid section→task nesting, plus GitHub's native **sub-issues** |

## Files

- **`gantt-chart.md`** — the visual Gantt chart (7 phases, ~37 tasks/milestones, dependencies, critical path). Open it on GitHub and it renders as an actual chart, not code.
- **`tasks.csv`** — the same plan as flat data (ID, Phase, Task, Type, Duration, Start, End, Dependencies, Owner, Status). Open in Excel/Google Sheets for quick edits, or use it to bulk-create GitHub Issues (see below).
- **`docs/github-project-setup.md`** — step-by-step guide to set up a GitHub Project (Board + Roadmap views) so the team can track day-to-day status the way they would in Trello/Weeek.
- **`scripts/import-to-github.ps1`** — optional PowerShell script that reads `tasks.csv` and bulk-creates a GitHub Issue per task/subtask, labeled by phase, and adds them to a Project. Requires the `gh` CLI.

## Quick start

1. **Customize the plan**: open `gantt-chart.md`, change the one absolute start date (`p1_charter`), rename/add/remove tasks and phases to match your actual product deployment.
2. **Push to GitHub** (see below) so the team can see the rendered chart directly in the repo.
3. **Set up tracking**: follow `docs/github-project-setup.md` to get a Kanban board + interactive timeline your team can update daily — this is the part that replaces Weeek/Trello for ongoing use, while `gantt-chart.md` stays as the always-current visual reference committed alongside it.
4. **Keep both in sync**: as work completes, tick tasks off in the GitHub Project *and* flip the Mermaid tags (`done`/`active`) in `gantt-chart.md` so anyone glancing at the README sees current status without opening the Project.

## Pushing this repo to GitHub

This folder is already a local git repository with an initial commit. To publish it:

```powershell
# 1. Create a new EMPTY repository on https://github.com/new (no README/license/gitignore)
#    e.g. name it "it-deployment-gantt"

# 2. Point this local repo at it and push (replace YOUR-ORG-OR-USER):
git remote add origin https://github.com/YOUR-ORG-OR-USER/it-deployment-gantt.git
git branch -M main
git push -u origin main
```

Git for Windows' Credential Manager will pop up a browser login the first time — no token handling needed.

Once pushed, open the repo on GitHub and click into `gantt-chart.md` — GitHub renders the Mermaid chart inline automatically.
