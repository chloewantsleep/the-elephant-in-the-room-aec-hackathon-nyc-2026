# Photo conversation workspace

`/app/` uses the repository's full-screen room, original input/send primitives, product cards and cart list. The composer stays mounted while the conversation expands above it. Selection is a capsule before the input. There are no conversation/brief/setup/product tabs, no new-space button, and no visible layout tool. Measurements constrain selection in the background.

## Connected flow

- Upload a space photo → real `/api/chat` observation and a living-scenario question. Optional qualitative photo callouts are inside the conversation.
- User statements become exact-quote-backed proposals; confirmation activates them. Corrections supersede the previous requirement. Candidate feedback is scoped to its product, not every product. Inferences cannot become binding catalogue constraints.
- Budget and measured room conditions are confirmed in the conversation. Existing catalogue ranking, price checks and footprint checks consume the brief. The original shopping list owns selection and the original product card owns alternatives/colorways.
- Additional images are separately stored as context and sent alongside the original room photo. Memory import copies a prompt for the user's original AI tool, then accepts the user's checked summary. It does not read private AI history automatically.
- Object selection uses the existing product hotspots, cart rows and detected-furniture cards. These selections become composer capsules. Existing scan/detect/isolate, keep/ditch, swap, colorway and render functions are reused. There is no custom free-photo point detector or automatic re-grounding pipeline.
- Structured chat actions can choose only supplied catalogue alternatives/colorways, with an exact quote from the latest user message. Both chat and card controls call the same mutation function, rechecking budget, dimensions and constraints before mutation. Color/replacement requests can trigger the real image endpoint.
- The render request includes active brief and measured constraints. Failures keep choices and offer retry. A response for an obsolete scene cannot overwrite a changed scene. The latest render is stored in IndexedDB; the brief/project/context remain in localStorage.

## Observed local acceptance — 2026-11-14

Code: `codex/living-brief`, base `fe09409`, uncommitted changes. Runtime: `127.0.0.1:8016`, this repository's `server.py`. Test state is isolated to port 8016's browser origin. Production/GitHub were not updated.

Browser walkthrough used `app/assets/example-lounge.jpg` as a real test input with real Gemini responses; there were no stubbed AI replies or sample-render substitution.

1. Uploaded photo; response identified daylight, columns and circulation uncertainty. Confirmed a nightly cross-legged reading habit, $3000 budget, 400 × 500 cm usable area and an 80 cm left corridor.
2. First real selection: SÖDERHAMN sofa, seven products, displayed total $2085; first generated image returned.
3. Changed primary habit to upright conversation and confirmed the proposal. The old habit was superseded; ROCKSJÖN replaced SÖDERHAMN. Displayed total became $1039. Budget, measured dimensions and corridor were unchanged.
4. Imported an explicitly checked no-leather preference, confirmed it, and observed it on the product's eligibility reasons. Uploaded `example-bar.jpg` as separate reference context: the room was preserved and the agent asked which aspect to borrow rather than asserting a preference.
5. Tested the earlier custom point detector, then removed that implementation at the user's instruction. The detector API is restored exactly to HEAD; selection now uses existing UI entries. The native scan flow itself was not rerun after this rollback.
6. Opened the original replacement controls and replaced the proposed IKEA PS 2026 chair with EKENÄSET. Sent a natural-language request for Kelinge gray-turquoise. The actual scene variant became `ikea:90533485` (base `ikea:30533493`), and the live image service generated the revised room with a blue-green chair. Exact scene total: $1187.95, displayed as $1188.
7. Refreshed using the browser's reload protocol: photo, confirmed brief, one reference image, seven products, variant and rendered image restored. No regeneration was required.
8. Removed the user-rejected custom photo selection/re-grounding pipeline, layout UI, tab menu and new-space entry. Rechecked that original product selection feeds the capsule and original cart retains ownership of selection.

Automated checks: 29 Node tests and 11 Python tests pass, including variant lookup, shared replacement validation, render brief propagation, candidate scope, metric conversion, and action allowlisting. Syntax and `git diff --check` pass.

Limits: generated imagery is a design preview, not an exact measured reconstruction; visual/product fidelity still needs inspection. The rectangular footprint checks do not validate every ergonomic relationship or mounting location. Microphone permission and live speech transcription were not tested. Catalogue prices are repository snapshots. The test workspace and generated images remain on port 8016 for demonstration.
