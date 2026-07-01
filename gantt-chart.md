# IT Product Deployment — Gantt Chart

> Rendered automatically by GitHub (no extension needed) because it uses a fenced ```mermaid``` block.
> The axis (`axisFormat %d %b %y`) shows day, month, and year together on every tick, and `tickInterval 1week` keeps weekly gridlines visible even when zoomed out to a multi-month view. Extend any phase's duration and the plan will naturally run past a year boundary — the axis format handles that without changes.

Edit the **one** absolute date below (`p1_charter` start date) to shift the entire plan — every other task is defined relative to it via `after <id>`, so Mermaid recalculates the whole schedule for you.

```mermaid
gantt
    title IT Product Deployment Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %d %b %y
    excludes    weekends
    tickInterval 1week

    section Phase 1 - Initiation & Planning
    Project charter & business case        :done, p1_charter, 2026-07-01, 3d
    Stakeholder alignment & sign-off        :milestone, p1_stake, after p1_charter, 0d
    Requirements gathering & scope          :active, p1_req, after p1_charter, 5d
    Risk & compliance assessment            :p1_risk, after p1_stake, 3d
    Resource & budget planning              :p1_plan, after p1_req, 3d
    Gate 1 - Planning sign-off              :milestone, p1_gate, after p1_plan p1_risk, 0d

    section Phase 2 - Design
    Solution architecture design            :p2_arch, after p1_gate, 7d
    UX/UI design & prototyping              :p2_ux, after p1_gate, 6d
    Data model & integration design         :p2_data, after p2_arch, 5d
    Security & compliance review            :p2_sec, after p2_arch, 4d
    Gate 2 - Design sign-off                :milestone, p2_gate, after p2_data p2_sec p2_ux, 0d

    section Phase 3 - Build & Configuration
    Environment setup (dev/test/stage)      :p3_env, after p2_gate, 4d
    Core development / configuration        :crit, p3_core, after p3_env, 15d
    Integrations build                      :p3_int, after p3_env, 10d
    Customizations & workflow build         :p3_cust, after p3_core, 8d
    Draft technical & user documentation    :p3_doc, after p3_core, 6d
    Gate 3 - Build complete                 :milestone, p3_gate, after p3_cust p3_int p3_doc, 0d

    section Phase 4 - Testing & QA
    Unit & system integration testing (SIT) :crit, p4_unit, after p3_gate, 6d
    Performance & load testing              :p4_perf, after p4_unit, 4d
    Security penetration testing            :p4_secTest, after p4_unit, 4d
    User acceptance testing (UAT)           :crit, p4_uat, after p4_perf p4_secTest, 8d
    Defect triage & fixes                   :crit, p4_fix, after p4_uat, 5d
    Gate 4 - Testing sign-off                :milestone, p4_gate, after p4_fix, 0d

    section Phase 5 - Training & Change Mgmt
    Develop training materials & job aids   :p5_mat, after p3_gate, 6d
    Train-the-trainer sessions               :p5_ttt, after p5_mat, 3d
    Change communication rollout             :p5_comm, after p5_mat, 10d
    End-user training sessions               :p5_end, after p5_ttt, 5d

    section Phase 6 - Deployment / Go-Live
    Data migration & validation              :crit, p6_mig, after p4_gate, 5d
    Cutover plan finalization                :p6_cutplan, after p4_gate, 3d
    Go-live rehearsal / dry run              :crit, p6_rehearse, after p6_mig p6_cutplan, 2d
    Production deployment (Go-Live)          :milestone, crit, p6_golive, after p6_rehearse p5_end, 0d
    Hypercare period begins                  :p6_hyper, after p6_golive, 1d

    section Phase 7 - Hypercare & Closeout
    Post go-live monitoring & support        :p7_monitor, after p6_hyper, 10d
    Issue resolution & stabilization         :p7_issues, after p6_hyper, 10d
    Knowledge transfer to ops/support        :p7_kt, after p7_monitor, 4d
    Project closure report & lessons learned :p7_close, after p7_kt, 3d
    Project closed                           :milestone, p7_final, after p7_close, 0d
```

## How to read this

| Mermaid concept | Maps to |
|---|---|
| `section` | A **phase** (top-level task) |
| Bar within a section | A **subtask** of that phase |
| `after <id>` | A **dependency** on one or more other tasks/subtasks |
| `milestone` | A **gate/sign-off** (zero-duration checkpoint) |
| `crit` | Marks items on the **critical path** (rendered in red) |
| `done` / `active` | Status styling — update these tags as work progresses |

## Customizing

- **Change the timeline**: edit the single date on `p1_charter` (`2026-07-01`). Everything downstream shifts automatically.
- **Add a task**: add a line under the right `section`, give it a unique `id`, and point its `after` at whatever it depends on.
- **Add a subtask under a subtask**: Mermaid only supports two levels (section → task). For deeper hierarchies, use the `Parent ID` column in [tasks.csv](tasks.csv) instead, and/or GitHub's native **sub-issues** feature (see [docs/github-project-setup.md](docs/github-project-setup.md)).
- **Track real status**: swap `done` / `active` tags in, as tasks complete, so the chart visually reflects progress — this file is meant to be edited and re-committed throughout the project, not generated once and frozen.

For day-to-day task tracking (assignees, comments, Kanban board, live status) use the **GitHub Project** described in [docs/github-project-setup.md](docs/github-project-setup.md) — this Mermaid chart is the always-current visual summary that lives next to your code/docs and needs no external tool.
