# Semantic Resolution Experiment Log

Competition production provider switched to xAI after comparative diagnostic experiments; historical DeepSeek entries below are retained for traceability only.

This log freezes the semantic-resolution experiment history available at the
documentation snapshot dated **2026-09-20 (Asia/Taipei)**. It is an archival
record only. No production code, prompt, confidence threshold, or API call was
changed or re-run for this documentation task.

`Not recorded / unavailable` means that the field could not be recovered from
the repository or the supplied experiment history. It is intentionally not
replaced with an estimate.

For E07–E10 and E12, the supplied categories account for all recorded runs;
the table's `Wrong = 0` or other zero residual is therefore arithmetic from the
complete stated partition, not an independently persisted raw field. Where a
category was not fully accounted for, it remains `Not recorded / unavailable`.

## Experiment Registry

| Experiment ID | Date | Goal | Case / Target | Provider | Model | Runs | Correct | Unresolved | Wrong | Technical | Key Finding | Decision |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| E01 | Not recorded / unavailable | Rules-only baseline / semantic limitation | Semantic claim-to-judgment resolution | Local deterministic parser | Rules-only | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Rules-only suffers from long-tail semantic branching. | Retain deterministic parsing as the baseline, but do not treat it as sufficient for the semantic long tail. |
| E02 | Not recorded / unavailable | Full LLM resolver baseline | Claim → judgment relationship and outcome resolution | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Full LLM resolver is conservative / unstable on claim → judgment relationship mapping. | Separate relationship selection from outcome classification. |
| E03 | Not recorded / unavailable | Prompt contract calibration | Semantic resolver output contract | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Contract boundaries were calibrated around target identity, allowed IDs, status, evidence, and unresolved reasons. Quantitative result not recorded. | Keep the strict contract as an experimental control. |
| E04 | Not recorded / unavailable | Task identity plumbing | Target claim identity through the resolver path | Local application pipeline | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Task identity was made explicit so a resolver cannot silently answer a different claim. Quantitative result not recorded. | Preserve claim/task identity checks and audit mismatches. |
| E05 | Not recorded / unavailable | Structured judgment context `cpjg` / `fxgc` | Judgment disposition and reasoning context | Local application pipeline | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Structured judgment fields were carried as separate context rather than relying only on a flattened source text. Quantitative result not recorded. | Preserve structured context in later experiments and reviews. |
| E06 | Not recorded / unavailable | Focused context diagnostic | Focused source text plus judgment context | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Focused context was useful for diagnosing relationship ambiguity; exact historical counts were not recorded. | Use focused context diagnostically, with unresolved as an allowed result. |
| E07 | Not recorded / unavailable | DeepSeek Flash real cases | Six real semantic-resolution cases | DeepSeek | Flash | 6 | 0/6 | 6/6 | 0 | 0 | DeepSeek Flash produced no correct results in the recorded six-case run; all six were unresolved. | Do not infer that a live model call resolves the relationship bottleneck. |
| E08 | Not recorded / unavailable | DeepSeek V4 Pro non-thinking | Six real semantic-resolution cases | DeepSeek | V4 Pro, non-thinking | 6 | 0/6 | 6/6 | 0 | 0 | Non-thinking V4 Pro produced no correct results in the recorded six-case run; all six were unresolved. | Changing to this model/mode did not establish a reliable solution. |
| E09 | Not recorded / unavailable | DeepSeek V4 Pro thinking-high | Six real semantic-resolution cases | DeepSeek | V4 Pro, thinking-high | 6 | 0/6 | 3 | 0 | 3 timeouts | Reasoning-high did not produce a correct result in the recorded run; three cases were unresolved and three timed out. | Stronger reasoning did not reliably solve the issue; preserve timeout handling and safe fallback. |
| E10 | Not recorded / unavailable | xAI Grok full resolver | Six real semantic-resolution cases | xAI | Grok | 6 | 1/6 explicit | 3 | 0 | 2 timeouts | Grok produced one explicit correct result; three cases were unresolved and two timed out. | Full-resolver model substitution did not remove the relationship-selection bottleneck. |
| E11 | Not recorded / unavailable | Stage 1 relationship selector | `case_raw_laborinfo_383577 / claim_3`; `case_raw_laborinfo_383669 / claim_3` | Not recorded / unavailable | Not recorded / unavailable | 5 + 5 | 4/5 early on 383577; 383669 was 5/5 safe unresolved | Not recorded / unavailable for early run; 5/5 safe unresolved for 383669 | Not recorded / unavailable | Not recorded / unavailable | The early 4/5 result is retained. The later 383669 result shows safe unresolved behavior when first-instance relationship context is insufficient. | Treat Stage 1 relationship selection as the primary bottleneck and keep safe unresolved behavior admissible. |
| E12 | Not recorded / unavailable | Stage 2 gold-relationship outcome classifier | Gold relationship supplied before outcome classification; exact case/claim scope not recorded | Not recorded / unavailable | Not recorded / unavailable | 5 | 5/5 correct outcome | 0 | 0 | 0 | Stage 2 outcome classification was stable once the correct relationship was supplied. | Keep Stage 2 separate from relationship selection. |
| E13 | Not recorded / unavailable | Stage 1 → Stage 2 end-to-end | `383577`; `383669` | Not recorded / unavailable | Not recorded / unavailable | 5 + 5 | 0/5 correct classified on 383577; 5/5 safe unresolved on 383669 | Not recorded / unavailable on 383577; 5/5 on 383669 | Not recorded / unavailable on 383577; 0 reported on 383669 | Not recorded / unavailable | End-to-end behavior remained limited by Stage 1; the pipeline preserved safe unresolved output for the insufficient-context case. | Do not credit Stage 2 stability to the end-to-end system unless Stage 1 supplies a verified relationship. |
| E14 | Not recorded / unavailable | Stage 1 reproducibility replay | Isolated, orchestrated, and combined replays | Not recorded / unavailable | Not recorded / unavailable | 10 isolated + 10 orchestrated = 20 combined | 0/10 gold isolated; 0/10 gold orchestrated; 0/20 gold combined | Not recorded / unavailable | Not recorded / unavailable | Not recorded / unavailable | Historical small-sample result could not be reproduced. Later canonical reconstruction showed isolated/orchestrated payload equality. | Preserve the historical early 4/5 result, but use the replay result as the reproducibility limitation and do not claim replication. |

## Required Case Records

### `case_raw_laborinfo_383577 / claim_3`

- Gold relationship: `judgment-claim-1-2`
- Expected outcome: `not_supported`
- Historical Stage 1 result: `4/5 correct` in the early small-sample experiment.
- Later end-to-end result: `0/5 correct classified`.
- Reproducibility note: the early `4/5` result must not be deleted, but the historical small-sample result could not be reproduced.

### `case_raw_laborinfo_383669 / claim_3`

- Expected result: `unresolved`
- Expected selected relationship IDs: `[]`
- Expected reason: `appellate dependency / insufficient first-instance relationship context`
- Stage 1 result: `5/5 safe unresolved`.
- End-to-end result: `5/5 safe unresolved`.

## Key Technical Conclusions

1. Rules-only suffers from long-tail semantic branching.
2. Full LLM resolver is conservative / unstable on claim → judgment relationship mapping.
3. Stronger models and reasoning did not reliably solve the issue.
4. Stage 2 outcome classification is stable once the correct relationship is supplied.
5. Main semantic bottleneck is Stage 1 relationship selection.
6. Schema / Contract / Audit successfully prevent many unsafe outputs from silently entering analytics.
7. Competition architecture therefore moves toward:

   `Deterministic Parser`
   `→ LLM Assisted Candidate Extraction`
   `→ Strict Schema`
   `→ Validator`
   `→ Human Review`
   `→ Verified Dataset`
   `→ Deterministic Analytics`

## Reproducibility Limitations

- Task 8A original temporary harness deleted.
- Original historical payload bytes unavailable.
- Later canonical reconstruction showed isolated/orchestrated payload equality.
- Some historical provider raw responses were not persisted.
- Some `sourceEvidence.text` values unavailable.
- API keys were session-only and must never be documented.

## Git Metadata

- Documentation snapshot date: `2026-09-20 (Asia/Taipei)`.
- `git rev-parse HEAD`: `15ecae217413aedc84af57fcb2ac648101cba437`.
- The experiments were conducted on an uncommitted working tree.
- The exact final `git status --short`, including the newly added documentation directory, is recorded in `semantic-resolution-2026-09.md`.
- No commit or push was performed.
