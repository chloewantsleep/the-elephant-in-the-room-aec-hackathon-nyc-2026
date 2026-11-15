# Pitch site review: repetition, redundancy, gaps

**Date:** 2026-11-15
**Scope:** the local build at 127.0.0.1:5174, which includes the uncommitted team, recording and tech-stack changes.
**Method:** No pitch-deck skill is installed on this machine. This review applies the rubric from `deck/pitch-review.md`: one point per beat, show the demo early, show the result before the mechanism, and make no claim the data can't back.

## Current order
Hero → Team → Start with your room (sofa swaps) → Say your habits (talk + brief) → Find real products (sources + 3 sofas) → Living Room (12 items) → Life changes. Rooms too. → Upright chat swap → 5 recordings → Under the hood → Your room, through life → CTA → Footer

## 1. Repetition: cut or merge

| # | What repeats | Where | Fix |
|---|---|---|---|
| R1 | **"Under $2,500" appears as a check on 17 cards.** A $16.99 side table "meeting the budget" tells the audience nothing. | Every grid, sofa and life card | Remove it from the per-item checks. State the budget once, in the grid chip: "$2,212.66 of $2,500". |
| R2 | **The reason pill repeats the checks.** For example, TJUSIG has the check "Shoes off at the door" and the reason "Shoes off at the door." Rug, bookcase, sideboard, side table and rocking chair are near-duplicates too. | Living Room grid | Keep one per card. Better still, make the pill the user's own words, which also fixes G3. |
| R3 | **SÖDERHAMN is shown 4 times**, and "Seat 36⅝″ deep · 84¼″ wide" appears 3 times. | Compare, grid card 1, life "Before", tech stack | Keep it as the running thread. In the grid and life cards, drop the spec line. |
| R4 | **The product count is given 3 times** (316 + 55, "One catalog 371", and "371 real products" in the stack). | Sources strip, grid chip, stack stats | Remove "371 real products" from the stack stats. The sources strip already says it. |
| R5 | **The adaptation idea is told 3 times**: "Life changes. Rooms too." with the upright swap, the "Adaptation" recording, and "Your room, through life". | Second half of the page | Already planned: replace "Your room, through life". If it stays, cut it to one image row. |
| R6 | **The "Open live demo" and GitHub links repeat.** The footer lists GitHub twice. | Nav, CTA, footer | Keep one GitHub link in the footer. |

## 2. Redundant: low value for judges

- **Stack group "Pitch: Vite · React · TypeScript".** Judges are scoring the product, not the slide site. Remove it.
- **Stack group "App: HTML · CSS · JS".** Merge with the other pieces into one line: "Python + Vercel functions, plain JS front end".
- **Flow step "01 You · Words, a room photo, a sketch".** The talk section already showed this. Start the flow at "Understand", which leaves 5 steps.
- **Hero hint "Hover a piece. Pick another. Same spot, same room."** It's an instruction without a value statement. Either fold it into "Start with your room." or cut it.

## 3. Accuracy: fix before presenting

- **A1: the stack's example habit doesn't match the story.** The talk says "tucked up" and traces `SEAT_DEPTH ↑ ×3 · SEAT_WIDTH ↑ ×1`. That is exactly the ontology profile `cross_legged` ("Sitting cross-legged", seat_depth weight 3, seat_width weight 1). The stack card instead shows `side_lounge` ("Leaning sideways to read → padded_arms"), and SÖDERHAMN's padded_arms is *unknown*. Switch the card to "Sitting cross-legged → seat_depth ×3 · seat_width ×1" so the talk and the data line up.
- **A2: "30 sofas, every measurement sourced" overclaims.** `docs/sofa-matching.md` says 4 of the 30 are ineligible, and many attributes are *unknown*. Use "30 sofas, each value sourced or marked unknown".
- **A3: some grid items trace to no stated need.** "Shoes off at the door" (TJUSIG), "Spare seat for friends" (TEODORES), "Hides clutter" (VIHALS) and "Brighter room" (mirror) were never said in the talk. The page claims every choice traces to your words. Either add 1–2 lines to the talk, or label these "Elephant suggests".

## 4. Missing

| Priority | Gap | Why it matters | Suggestion |
|---|---|---|---|
| 1 | **The recordings are empty.** | They are the only proof the product runs. Without them the page is a concept. | Record before the event. Label them "recorded". Consider moving the full-length recording earlier, right after the Living Room grid. |
| 2 | **The problem is never stated.** The hero is a promise. | Judges need the pain in one line. | Add one line under the hero or before the talk: "A sofa can look perfect and still be wrong for how you live." (from the earlier review) |
| 3 | **The core product features are barely shown**: render in your room, click to swap, sketch, FF&E PDF/CSV. They appear only as text in the stack flow. | These are the most demo-able things the product does. | Cover them with the 4 small recordings, and put a one-line caption under each saying what it proves. |
| 4 | **Team roles.** The cards show names only. | Credibility, and an event requirement. | Add one role per person, e.g. "Data / scraping", "Render pipeline". Use real facts from the team. |
| 5 | **Differentiation from room-image generators.** | It's the first question judges will ask. | One line in the stack: "The picture never invents furniture. Every object is a real SKU with a price and a link." (from the README) |
| 6 | **Concrete numbers the repo can back.** | They make the product feel real. | Add "~8 s and ~$0.07 per render" (from the README), shown as a test measurement. |
| 7 | **Who it's for first.** | It frames the market without a TAM slide. | "People refreshing a living room they already live in." |

## Suggested next edits (small, in order)
1. Fix A1–A3, R1 and R2. These are copy and data edits only.
2. Add the problem line (G2), the differentiation line (G5) and team roles (G4, once you supply them).
3. Trim the stack (Pitch/App groups, step 01).
4. Fill the recordings, then decide whether the full-length one moves up.
