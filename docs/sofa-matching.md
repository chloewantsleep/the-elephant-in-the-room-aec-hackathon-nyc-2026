# Sofa evidence and living-habit matching

## Contract

`schema/sofa-ontology.json` defines common attributes, evidence semantics and six soft preference profiles. The same immutable catalogue is re-ranked from the confirmed living brief. Supported profiles are side lounging, cross-legged sitting, upright conversation, frequent rising, overnight guests and regular cover cleaning. Generic “reading” prompts a posture question; no high-arm or hard dimension constraint is invented.

Gemini classifies real user language into a pending `sofa_lifestyle` requirement. It carries the original quote, situation, outcome, impact, priority, certainty and scope. Confirmation activates it. Corrections reference the old requirement using `supersedes`; independent habits coexist. Candidate-specific feedback must not become a global lifestyle filter.

## Product annotation

`python3 scraper/sofas.py` refreshes all 30 catalogue sofas. It reuses the existing cached, rate-limited fetch and inch parser. Extraction selects only the product information hydration block whose article number exactly matches the SKU. It never uses packaging dimensions, image alt text as proof, or the first related-product block on the page.

`data/sofas/<sku>.json` captures owning manufacturer measurements and details with URL, SKU and retrieval timestamp. `data/sofa-annotations.json` contains values, documented / derived / conflicting / unknown status, exact source excerpts and artifact references. Boolean absence is unknown, not false. Non-removable covers are not removable; ambiguous mixed cover claims are unknown. Arm dimensions with obvious inconsistencies are excluded from ranking. Actual softness, cushion compression, back angle and individual ergonomic fit remain unknown. No model-generated performance labels are stored.

26 of 30 sofas have acceptable footprint data. SALTMYRAN and FRIHETEN/KLAGSHAMN returned unmatched owning product detail blocks; HYLTARP lacked a simple footprint; BALKARP's outer depth equaled seat depth. These four remain explicitly ineligible until resolved. Source records preserve evidence rather than silently repairing dimensions. GULLVALLA, LILLESÄTER and VIMLE outer widths were corrected from the owning product blocks instead of the legacy scraped values.

## Ranking and UI

`app/sofa-matcher.js` turns documented attributes into relative support scores using the ontology's explicit direction and weights. Numeric signals use the verified catalogue range; no clinical/ergonomic thresholds are claimed. Missing attributes contribute zero and are shown as unverified. Hard budget, width, depth and exclusions take precedence in `BriefEngine`. The chosen sofa competes within the residual room budget. Changing a habit re-ranks the shortlist and regenerates the room's selected sofa if the old choice has less support; compatible equal-ranked edits can remain.

Design → **Find your sofa** opens real product cards with matching user need, supporting dimensions/attributes, trade-offs, unknowns, original manufacturer quotation/link and previous rank. Natural-language input uses the same live chat endpoint. Choosing a sofa changes the scene/shopping list and records feedback. Detail-page alternatives use the same scoring. Cover washability is not carried over to unannotated colorway variants.

## Verification

`node --test tests/*.test.cjs`; `python3 -m unittest discover -s tests -p 'test_*.py'`.
Real-data tests compare different habits on the same products, verify planner changes, enforce width/budget overrides, reject unresolved data, check missing evidence and inspect captured quote provenance.

References: https://github.com/schemaorg/schemaorg (Product / PropertyValue; no dependency added), exact manufacturer URLs inside annotations. Matching weights are product design hypotheses, deliberately visible and changeable, not industry standards.

Live browser verification: real Gemini chat classified cross-legged reading, confirmation ranked SÖDERHAMN first; correcting the habit to upright conversation ranked ROCKSJÖN first and updated the room selection. Budget and catalogue were unchanged. Manufacturer quote disclosure was checked in the UI.
