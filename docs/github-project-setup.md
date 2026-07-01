# Setting up the GitHub Project (Board + Roadmap)

This is the part that replaces Weeek/Trello for day-to-day tracking. `gantt-chart.md` is the static visual snapshot committed to the repo; the **GitHub Project** below is the live, editable board and timeline your team updates daily.

## 1. Create the Project

1. Go to your repo → **Projects** tab → **New project** → pick **Board** template.
2. Name it e.g. "IT Product Deployment".
3. Link it to this repository so issues can be added directly from it.

## 2. Add custom fields (mirrors Weeek/Trello card fields)

In the Project, click **+** next to the field headers and add:

| Field name | Type | Purpose |
|---|---|---|
| `Phase` | Single select | Options: `Phase 1 - Initiation & Planning`, `Phase 2 - Design`, `Phase 3 - Build & Configuration`, `Phase 4 - Testing & QA`, `Phase 5 - Training & Change Mgmt`, `Phase 6 - Deployment / Go-Live`, `Phase 7 - Hypercare & Closeout` |
| `Status` | Single select | `Not Started`, `In Progress`, `Blocked`, `In Review`, `Done` — your Trello-style columns |
| `Start date` | Date | From `tasks.csv` |
| `Target date` | Date | End date from `tasks.csv` |
| `Owner` | Text or Person | Who owns the task |
| `Dependency IDs` | Text | Copy from the `Dependencies` column in `tasks.csv` (or use native linking, see below) |

## 3. Board view (Trello equivalent)

- Group by `Status`.
- Optionally add a secondary grouping/swimlane by `Phase`.
- Drag cards across columns as work progresses — same motion as Trello.

## 4. Roadmap view (Weeek Timeline / Gantt equivalent)

1. Add a new view → **Roadmap** layout.
2. Set **Start date** field = `Start date`, **Target date** field = `Target date`.
3. Group by `Phase` — each phase becomes a swimlane, tasks render as timeline bars.
4. Use the zoom control (top-right of the view) to switch between **Week / Month / Quarter** — this is the interactive equivalent of the day/month/year breakdown in `gantt-chart.md`, but live-editable by dragging bars.

## 5. Dependencies

GitHub doesn't have arrow-based dependency lines like Weeek, but you have two options:

- **Simple**: keep the `Dependency IDs` text field, referencing the same IDs used in `gantt-chart.md` and `tasks.csv` (e.g. `p3_core`).
- **Native**: in each issue's body, write `Blocked by #<issue-number>` — GitHub shows a "Blocked by" relationship on the issue and a warning if you try to close it before the blocker is closed.

## 6. Subtasks

Use GitHub's native **sub-issues**: open the parent phase's tracking issue, and in the "Sub-issues" panel add each subtask issue. This gives collapsible parent/child hierarchy directly in Issues and on the Board.

## 7. Milestones as gates

Create a GitHub **Milestone** for each Gate (`Gate 1 - Planning sign-off`, `Gate 2 - Design sign-off`, etc.) and assign the relevant issues to it. The repo's Milestones page then shows gate-by-gate completion percentage automatically.

## 8. Bulk-creating issues from tasks.csv

Manually creating 37 issues is tedious. If you have the [GitHub CLI](https://cli.github.com/) installed (`winget install GitHub.cli`, then `gh auth login`), use [`scripts/import-to-github.ps1`](../scripts/import-to-github.ps1):

```powershell
cd it-deployment-gantt
./scripts/import-to-github.ps1 -Owner "YOUR-ORG-OR-USER" -Repo "it-deployment-gantt" -ProjectNumber 1
```

This creates one Issue per row in `tasks.csv`, labels it by phase, adds it to the Project, and sets the `Start date` / `Target date` / `Phase` / `Status` fields automatically. Review the script header comments before running — it's meant to be edited to match your field names if you changed them in step 2.

If you don't have `gh` installed, just create issues manually from the CSV — it's still only ~37 rows, and you can copy-paste each row's Task, Start Date, End Date, and Dependencies straight into the issue form.
