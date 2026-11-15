# Spec Delta: Skill-based retention — V1

Status: implemented

## Objective
Replace "four future checks for every lecture" with retention that rides inside practice Ayan already does:
**cumulative mixed homework** as the main system, **one self-explanation question** while learning, and a **small recall queue** for recurring gaps. Lectures stay the source material; what gets scheduled is **skills**.
Success = over a 4-week trial, accuracy on fresh older-topic problems (no hints) holds or improves **without adding study time**.

Research basis (from Ayan's notes, not re-verified here): interleaved/cumulative practice (Rohrer et al. 2020; Samani & Pan 2021), spacing repeated practice (Rohrer & Taylor 2006), self-explanation of principles and conditions (Gjerde et al. 2022), successive relearning for small items (Rawson & Dunlosky 2011). Exact numbers below (25%, 3 items, 4 weeks) are **starting points, not research results**.

## Current behavior (shipped)
- Each lecture gets 4 checks (~3, 10, 30, 60 days), shown as "older-topic slots", max one per subject per day.
- The schedule adds separate `maths-sp` / `physics-sp` / `chem-sp` blocks (20–45 min) when checks are due.
- A ✔ on a chapter or an independent guided session counts as that chapter's due check.
- Weekly wildcard; misses notebook with its own intervals (1, 3, 7, 14, 30).

## New behavior
1. **Skills.** A skill is a short named ability ("split log inequality into base cases", "choose friction direction on an incline").
   - Logging a lecture asks for 1–3 skills (Iroha suggests them from the notes; Ayan edits or accepts). One skill can link to several lectures.
   - Migration: each existing lecture becomes one skill named after its topic, keeping its last-tested date. Nothing is deleted.
   - Each skill keeps: last tested, last result (unaided ✓ / hint / miss), and a strength: **new → shaky → solid**.
2. **Older material inside practice, not extra blocks.**
   - The separate `*-sp` blocks are removed from the schedule. Total daily hours don't change.
   - Each practice block shows **"Mix in: ~25% older material"** (e.g. 15 of 60 min) and lists **2–3 older skills** to pull a problem for, picked by: shaky first, then longest-untested solid skills. Chapter names hidden until revealed (as now).
   - A brand-new method isn't mixed in until it has been practised once (skill stays "new").
3. **Any qualifying attempt counts.** An unaided ✓ (homework, guided session, mock, slot) records against the matching skill. No duplicate check is scheduled for a skill that was just shown. Hint/miss → skill becomes shaky and comes back in the next practice block's mix.
4. **Small recall queue** for recurring gaps (conditions, definitions, sign conventions, domain restrictions): at most **3 items a day, ~5–10 min**, taken from practice time. Fed by misses tagged as knowledge gaps, plus anything Ayan adds. Uses the existing misses notebook and its intervals.
5. **Self-explanation.** While Ayan works an example or homework, Iroha asks **one** targeted question at a key decision point ("Why can you use conservation of energy here?", "Which step could add an invalid root?"). Never a full Feynman task after every lecture.
6. **Weekly cumulative sample.** The holiday Mock / backlog / test block (and the wildcard) samples **4–6 older skills** with unfamiliar questions, replacing a practice block, not adding one.
7. **Trial card (4 weeks)** on Progress, three numbers only: minutes on older material, unaided accuracy on fresh older-topic problems, and the 3 skills longest untested.

## Success criteria
- Schedule study minutes for every day type are **unchanged** vs today (the `*-sp` minutes move into practice blocks); existing schedule tests still pass.
- No skill gets a separate check within 7 days of an unaided ✓ on it.
- The recall queue never shows more than 3 items in a day.
- After migration, every existing lecture maps to exactly one skill and keeps its history; running migration twice changes nothing.
- The trial card's three numbers match the underlying records for a seeded test week.
- **Must not change:** chain/streak rules, mastery "Shown" ladder, college-day schedule, misses intervals.

## Boundaries
- Always: keep total study hours fixed; keep every record (migrate, never delete); add node tests in `tests/` for skill picking, the 25% split and the 3-item cap.
- Ask first: changing mastery rules, removing the weekly wildcard, changing misses intervals.
- Never: add study time to fit reviews; delete lectures or notes; claim research numbers the studies don't support.

## Out of Scope (Deferred)
- Automatic skill extraction from PDFs without Ayan's confirmation — accuracy risk.
- Verified problem bank — separate feature.
- Adaptive share (auto-raising older-material % when accuracy drops) — V2, after the trial shows a baseline.
- Chemistry-specific tuning — research cited is Maths/Physics; Chemistry uses the same rules in V1 unless you say otherwise.

## Open questions
1. **Starting share:** 25% older material per practice block (range 20–30%)? 
2. **Who names skills:** Iroha suggests and you confirm (proposed), or you type them yourself?
3. **Chemistry:** same system, or keep Chemistry on the current lecture checks during the trial?
4. **Trial start:** begin the 4 weeks as soon as it ships?
5. **Older-topic slots card:** replace it with the "Mix in" lists (proposed), or keep it alongside for the trial?
