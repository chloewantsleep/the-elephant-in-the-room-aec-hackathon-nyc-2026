# Living brief: implemented local flow

Run `PORT=8014 python3 server.py` and visit `/app/`.
Set `GEMINI_API_KEY` in the ignored local `.env` to enable real conversation and photo understanding. Do not put it in the browser or commit it. Vercel uses the existing team passcode and the new `/api/chat` function. `GEMINI_CHAT_MODEL` defaults to `gemini-3.8-flash`.

## Contract

Photo + user conversation + confirmed brief + current selection → Gemini structured proposals → exact source-quote / value validation → conversational confirmation → versioned confirmed requirements → deterministic catalogue filtering/ranking → options, swaps, render context, shopping export.

Each requirement has text, exact quote, effect, category scope, value, priority, impact, status and optional supersedes. Pending or superseded entries cannot constrain selection. Requirements without catalogue-verifiable evidence stay design notes. User corrections replace the referenced requirement. One product edit is recorded in conversation and prompts a reason; it is not automatically promoted into a durable preference.

Supported executable effects: total USD budget, width/depth in inches, material exclusion/preference, compact-product preference, explicit category inclusion/exclusion. Missing data fails required checks. Impossible slots remain open and are named; there is no unrestricted fallback. Alternatives and colorways respect the total budget and confirmed constraints. Brief updates preserve compatible manual choices where budget allows and invalidate stale renders. Render requests include the confirmed brief.

The UI defaults to an example background explicitly labelled as such. Only an attached uploaded photo goes into the analysis request. Space notes are a qualitative diagram, not a measured plan; observations are never automatically hard constraints. Real room scale and clearance still need measurement. Product position pins remain the original demo defaults, not a solved layout. Design-note constraints such as pet resistance, ergonomic comfort or construction requirements are displayed as unverified, not guaranteed.

## Persistence and limits

The brief and conversation persist in localStorage for this browser/origin; photos and scene placements do not persist across reload. Sample handlers have been removed. Old explicitly tagged sample records are excluded. There is no model fallback. There is no claim of verified online conversation/photo analysis without a configured key. No cloud account or multi-room persistence is implemented. The current editor represents a single space; changing room category changes its furnishing template.

Context import supports reviewed text and a copyable history-summary prompt; it cannot access ChatGPT/Claude history itself. The prompt asks for available evidence only, not invented preferences. Send explicitly shares the conversation and attached photo with Gemini. API failures retain the message and expose Retry.

## Verification

- `node --test tests/brief-engine.test.cjs`: real catalogue selection, total cap, impossible constraints, category removal, material ranking, unknown evidence and inactive requirements.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: quote validation, numeric limits, hallucinated photo observations, replacement identity.
- Browser: opt-in sample → confirm three requirements → actual three option prices $649 / $1,237 / $1,703; no coffee table; refresh retains three decisions; unavailable model retains user message and exposes retry.
- Actual Gemini photo interpretation and multi-turn requirement extraction: verified via live API and browser. Photorealistic rendering quality and measured spatial layout are separate, not validated by this check.

Reference: Google Gemini cookbook and structured-output documentation. Reuses the existing standard-library Gemini HTTP client, adds no agent framework or dependency.

## Photo-first refinement

The entry screen now contains only a photo invitation and upload action. Upload starts photo-led conversation automatically. Context is a small composer action; internal brief/version/evidence and sample controls are no longer exposed in the normal flow. Visible model replies are constrained to short observations and one useful question. Structured proposals carry situation, outcome, decision impact, priority, evidence kind/quote/certainty, and person/room/candidate scope. Existing local sample history is retained, not deleted.

## Live model verification

2026-11-14: configured the ignored local key; provider rejected the old 2.5 model for new users. Confirmed available models via provider API, then used `gemini-3.8-flash`. Uploaded repository room photo via the real browser file chooser, observed actual photo annotations, and continued in Chinese. Model extracted $1800 / sofa <=75 inches / no coffee table, and confirming produced catalogue options $649 / $1237 / $1703 with no coffee table. This is a real provider call, not scripted. Room conversations remain browser-local. Context → Start a new room archives the previous brief locally and resets the active room.

Live correction verified in the browser: changing the same conversation to $1000 and a 60-inch sofa cap produced $649 / $719 / $989 options; the $1800 cap was superseded. Photo annotations were returned by the real model and positioned on the uploaded image. Test conversation stays under the localhost origin; the user-facing fresh preview is available at 127.0.0.1:8014.
