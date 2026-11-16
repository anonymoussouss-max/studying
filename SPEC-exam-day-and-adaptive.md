# Spec: Exam day + self-adapting schedule — V1

Status: proposed · Changes the shipped college-day schedule (`tasks/plan-college-day.md`) and retention (`SPEC-skill-based-retention.md`).

## Capability map
| Module id | Responsibility | Depends on |
|---|---|---|
| `exam-day` | A day type whose only study sessions are "<exam> preparation" | day types (shipped) |
| `self-adapt` | Re-lays the rest of today's plan when you start late or a session runs late | day builder (shipped) |

Build order: `exam-day` → `self-adapt` (independent; exam day is smaller and lands first). Each can ship as its own PR.

---

## Module `exam-day`

### Objective
On an exam day the desk stops showing the normal plan. You press **Exam today**, it asks **"Which exam?"**, you type e.g. "Physics unit test", and every study session today becomes **"Physics unit test preparation"**.

### New behaviour
- "Your study day" card gets an **Exam today** button next to College / Holiday / Rest. Clicking it shows an inline field **"Which exam?"** (not a browser pop-up) and a Save button; saved per date as `{t:'exam', name, at?}`.
- Optional **"Exam starts at"** time. If given, preparation stops 30 min before it; after the exam: lunch/dinner and rest only.
- Schedule: same wake, meals, IRL break, dinner and sleep as the day would normally have; **every study block is titled "<name> preparation"**; no Maths/Physics/Chemistry blocks.
- Today page on an exam day hides the Mix in card, recall queue and lecture-log prompt. Iroha's plan note says it's an exam day for <name> and to keep help focused on it.
- "Auto" (or another day type) undoes it.

### Success criteria
- Exam day with name "Physics unit test": every `study` row's title is "Physics unit test preparation"; none is a subject block (test).
- With an exam time of 2:00 PM: no study row ends after 1:30 PM (test).
- Empty name is refused with a message; name is shown escaped.
- Other day types' schedules unchanged (existing tests still pass).

---

## Module `self-adapt`

### Objective
The plan follows what actually happens. **Start late** or **finish a session late**, and the rest of today is re-laid from that moment so it still fits, instead of showing blocks that already passed.

### Current behaviour (shipped)
- College days: "I'm home now" rebuilds the evening from the real time.
- Late starts only lower the day's chain target; the timeline itself doesn't move.

### New behaviour
- **Re-plan points** (automatic): (1) when you start your first study session of the day after its planned start; (2) when a session ends more than 10 min after its block's planned end. Plus a manual **"Re-plan from now"** button on the Your study day card.
- **Re-planning** keeps everything before the re-plan point as it was, then lays **the study minutes still owed** (plan total − minutes already logged, per subject, in the original order) from that point, using the same rules: 50-min chunks, one 20-min rest per ~150 min, fixed anchors (breakfast, IRL break, lunch after college, dinner, wind-down, sleep) **never move or shrink**.
- Whatever no longer fits before dinner is listed as **"moves to tomorrow: …"** (as today). The Mix in share stays ~25% of each re-laid block.
- Header, NOW card and Iroha's plan note all read the re-laid plan.
- At most one automatic re-plan per 10 min, so the timeline doesn't jitter.

### Success criteria
- Holiday, first session started at 1:00 PM instead of 10:30: no study row starts before 1:00 PM; breakfast still at 4:30 PM; IRL break still at 8:30 PM (test).
- A session that ran 40 min late: the next study row starts at the real end time (+ break rules), anchors unchanged (test).
- Minutes already logged aren't scheduled again (test).
- Overflow named in "moves to tomorrow"; rest/meal/sleep minutes identical before and after (test).
- No re-plan → plan identical to today's (existing tests pass).

---

## Commands
- Tests: `node --test tests/skills.test.cjs tests/study-plan.test.cjs tests/exam-adapt.test.cjs`
- Preview: Claude Browser `kaguya-desk` launch config (port 8765)

## Project structure
- `index.html` — day builder (StudyPlan script, testable in Node) + Moon Lab UI
- `tests/*.test.cjs` — Node built-in tests loading StudyPlan with a fixed clock
- `chat.js` — Iroha's instructions (backend repo `ame-bkend321`)

## Testing strategy
Pure scheduling logic (exam titles, exam cut-off, re-plan from a point with logged minutes) lives in StudyPlan and gets Node tests written failing first. UI (buttons, hidden cards) is checked in the preview.

## Boundaries
- Always: keep fixed anchors and sleep untouched; keep logged minutes; tests before each PR.
- Ask first: changing chain/streak rules for exam days; moving dinner or sleep on late days.
- Never: add study time to "catch up"; shrink rest or meals to fit; delete logged sessions.

## Out of Scope (Deferred)
- Exam results logging / linking to mocks — separate feature.
- Multiple exams in one day — one name per day in V1.
- Shifting dinner or sleep later on very late days — anchors stay fixed by design.

## Open questions
1. **Exam on a college day:** is the exam usually *at college* (morning prep, then college as normal, prep sessions renamed) or does it replace the college day? *(Proposed: keep college; only rename study sessions.)*
2. **Exam-day study hours:** keep the day's normal hours (8 h college / 10 h holiday), or a lighter cap like 4 h? *(Proposed: normal hours, capped by the exam time if given.)*
3. **Streak on exam days:** count at 80% of the (possibly shorter) prep plan like any day, or count automatically? *(Proposed: 80% of the prep plan.)*
4. **Self-adapt trigger:** automatic re-plans at late start / late finish, plus the manual button — OK? Or manual button only?
5. **Late finish threshold:** 10 minutes past the block end before re-planning — OK?
