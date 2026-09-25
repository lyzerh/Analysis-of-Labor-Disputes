# LawLens Limitations

This document records limitations that are useful for reviewers and maintainers but do not belong on the README first screen.

## Evidence and evaluation

- The formal Benchmark is a small method-validation set, not a representative sample of all labor-dispute judgments.
- The current records do not establish overall accuracy, recall, calibration, causal effects, or cross-source generalization.
- A 5/5 match rate applies only to the five explicit candidates; it is not a system-wide accuracy claim.
- The rules-only baseline does not measure missed claims, so 12/26 is not complete extraction accuracy.

## Human review and unresolved cases

- Human review remains necessary for low-confidence, conflicting, context-limited, and appellate-dependent relationships.
- Unresolved records are intentionally retained for review and are not silently admitted to deterministic analytics.
- Source evidence and provenance must remain attached to a record before it can support a research result.

## Data and reproducibility

- LaborInfoCN availability, coverage, metadata quality, and detail-page behavior depend on the upstream source.
- Current project materials do not record a complete source URL, retrieval timestamp, source version, or usage-license record for every research input.
- Browser-local data can be lost or separated when site data is cleared or the workspace is opened in another browser.
- Formal result persistence and some weighted or interval-based analyses are not implemented.

## AI and privacy

- The formal browser semantic path is an opt-in xAI BYOK integration using `grok-4.20-0309-reasoning`.
- When enabled, unresolved text is sent to the user's configured xAI API endpoint.
- API keys are stored in browser `sessionStorage` for the current session; this is not a claim of absolute security.
- Legacy Gemini and DeepSeek adapters remain for compatibility or historical experiments and are not the current GitHub Pages semantic provider.

## Product scope

LawLens is a research and legal-analytics workflow. It is not legal advice, an outcome-prediction system, or an automated judicial decision system.
