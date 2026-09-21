# Semantic Resolution Experiment Archive — September 2026

**Snapshot date:** 2026-09-20 (Asia/Taipei)
**Status:** frozen documentation archive; no parser or resolver logic was changed for this task

This document preserves the semantic-resolution experiments completed before
the archive was created. It is intended to be usable as source material for a
technical report. The companion registry, [EXPERIMENT_LOG.md](./EXPERIMENT_LOG.md),
contains the required one-row-per-experiment log for E01–E14.

## Scope and Evidence Policy

The archive covers the rules-only baseline, full-resolver model experiments,
prompt and contract calibration, task identity plumbing, structured judgment
context, focused-context diagnostics, Stage 1 relationship selection, Stage 2
outcome classification, end-to-end staged resolution, and reproducibility
replay.

Only supplied historical results and facts recoverable from the current
repository are recorded. Missing values are written exactly as `Not recorded /
unavailable`; no accuracy, date, provider, model, payload, or error category is
inferred from an incomplete record. In particular, this archive does not
re-run an API, reconstruct a provider response, change a prompt, or change a
confidence threshold.

For E07–E10 and E12, the supplied categories account for all recorded runs;
any zero residual shown in the registry is arithmetic from that complete stated
partition, not an independently persisted raw field. Categories that were not
fully accounted for remain `Not recorded / unavailable`.

The exact experiment dates were not recorded. The date above is the archive
snapshot date, not a claim that every experiment ran on that date.

## Frozen Experiment Results

### Historical baseline and diagnostics

E01 established that a rules-only approach suffers from long-tail semantic
branching. E02 showed the central limitation of a full LLM resolver: claim →
judgment relationship mapping was conservative and unstable. E03–E06 then
focused on the control surface around the resolver: strict output contracts,
target identity, structured `cpjg` / `fxgc` judgment context, and focused
source context. Exact run counts and quantitative outcomes for E01–E06 were
not recorded / unavailable.

The repository supports the architectural interpretation of these diagnostics:
Stage 1 has a strict relationship-selection result with candidate-ID checks,
claim-ID checks, evidence checks, unresolved reason codes, and an admission
threshold. Stage 2 has a separate outcome-classification result that accepts
only supplied judgment IDs and validates evidence against the supplied
judgment context. These implementation facts are not substitutes for missing
historical run counts.

### Model comparison

The recorded six-case model comparison was:

| Run | Provider / model | Result | Interpretation |
|---|---|---|---|
| E07 | DeepSeek Flash | `0/6 correct`; `6/6 unresolved` | No correct result was recorded in this six-case run. |
| E08 | DeepSeek V4 Pro, non-thinking | `0/6 correct`; `6/6 unresolved` | Non-thinking V4 Pro did not improve the recorded result. |
| E09 | DeepSeek V4 Pro, thinking-high | `0/6 correct`; `3 unresolved`; `3 timeout` | More reasoning did not produce a reliable resolution; timeouts are technical outcomes, not wrong classifications. |
| E10 | xAI Grok full resolver | `1/6 correct explicit`; `3 unresolved`; `2 timeout` | One explicit correct result was recorded, but the full resolver remained incomplete and operationally unstable. |

These results do not support a claim that a stronger model or a reasoning mode
reliably solves claim-to-judgment relationship mapping. The experiment record
also does not contain enough persisted raw responses to perform a later
provider-level error analysis.

### Staged resolver experiments

The staged experiments separated the problem into two decisions:

1. **Stage 1 — relationship selection:** select only existing judgment item
   IDs for the supplied target claim, or return unresolved with a reason code.
2. **Stage 2 — outcome classification:** after the relationship is supplied,
   classify the disposition as supported, partially supported, not supported,
   or unresolved/unclear when the wording is insufficient or conflicting.

The recorded results were:

| Experiment | Target | Result | What it establishes |
|---|---|---|---|
| E11 | `case_raw_laborinfo_383577 / claim_3` | Early historical result: `4/5 correct` | A small-sample positive result existed and must be retained. It was not reproducible in the later replay. |
| E11 | `case_raw_laborinfo_383669 / claim_3` | `5/5 safe unresolved` | Safe refusal is available when first-instance relationship context is insufficient. |
| E12 | Gold relationship supplied | `5/5 correct outcome` | Stage 2 was stable when relationship selection was removed from its task. |
| E13 | `383577` end-to-end | `0/5 correct classified` | End-to-end failure remained attributable to the staged relationship/classification path; the record does not preserve a finer error breakdown. |
| E13 | `383669` end-to-end | `5/5 safe unresolved` | The pipeline preserved the expected unresolved state rather than fabricating a relationship. |
| E14 | Isolated replay | `0/10 gold` | The early small-sample result was not reproduced in isolation. |
| E14 | Orchestrated replay | `0/10 gold` | The early small-sample result was not reproduced in orchestration. |
| E14 | Combined replay | `0/20 gold` | The aggregate replay also failed to reproduce the historical gold results. |

The early `4/5` result is therefore historical evidence, not a deleted result
and not a reproducible benchmark. The later replay must be reported alongside
it.

## Case-Level Ground Truth Records

### Case 383577

**Case ID:** `case_raw_laborinfo_383577`
**Target:** `claim_3`
**Gold relationship:** `judgment-claim-1-2`
**Expected outcome:** `not_supported`

This case is the key positive relationship-selection target. Its early Stage 1
record was `4/5 correct`; the later end-to-end record was `0/5 correct
classified`. The exact historical payload bytes, provider raw responses, and
some evidence text were not persisted, so the archive does not attempt to
explain the discrepancy beyond the documented reproducibility limitation.

### Case 383669

**Case ID:** `case_raw_laborinfo_383669`
**Target:** `claim_3`
**Expected relationship status:** `unresolved`
**Expected selected relationship IDs:** `[]`
**Expected reason:** `appellate dependency / insufficient first-instance relationship context`

This case is the key safe-refusal target. Stage 1 recorded `5/5 safe
unresolved`, and the end-to-end run also recorded `5/5 safe unresolved`.

## Key Technical Conclusions

1. Rules-only suffers from long-tail semantic branching.

2. Full LLM resolver is conservative / unstable on claim → judgment
   relationship mapping.

3. Stronger models and reasoning did not reliably solve the issue.

4. Stage 2 outcome classification is stable once the correct relationship is
   supplied.

5. Main semantic bottleneck is Stage 1 relationship selection.

6. Schema / Contract / Audit successfully prevent many unsafe outputs from
   silently entering analytics.

7. Competition architecture therefore moves toward:

   `Deterministic Parser`
   `→ LLM Assisted Candidate Extraction`
   `→ Strict Schema`
   `→ Validator`
   `→ Human Review`
   `→ Verified Dataset`
   `→ Deterministic Analytics`

The conclusions are intentionally narrower than a production accuracy claim.
The evidence supports the location of the bottleneck and the value of safe
admission controls; it does not establish a generalizable model accuracy rate.

## Reproducibility Limitations

- Task 8A original temporary harness deleted.
- Original historical payload bytes unavailable.
- Later canonical reconstruction showed isolated/orchestrated payload equality.
- Some historical provider raw responses were not persisted.
- Some `sourceEvidence.text` values unavailable.
- API keys were session-only and must never be documented.

These limitations prevent a complete byte-for-byte replay of all historical
provider calls. They do not justify deleting the early `4/5` result; they
require it to be labeled as a historical small-sample result that could not be
reproduced.

## Git Metadata

The documentation snapshot recorded:

```text
git rev-parse HEAD
15ecae217413aedc84af57fcb2ac648101cba437
```

The experiments were conducted on an uncommitted working tree. The final
`git status --short` observed after adding this archive was:

```text
 M src/App.tsx
 M src/components/PipelineWorkspace.tsx
 M src/services/analytics/AnalyticsAdmission.ts
 M src/services/dataSource/LaborInfoAdapter.ts
 M src/services/dataset/LaborCaseDatasetBuilder.ts
 M src/services/parser/LaborInfoParserAdapter.ts
 M src/services/presentation/PipelineStagePresentation.ts
 M src/services/semantic/LlmRuntimeService.ts
 M src/services/semantic/SemanticPrompt.ts
 M src/services/semantic/SemanticResolutionOrchestrator.ts
 M src/services/semantic/SemanticResult.ts
 M src/services/semantic/SemanticResultAudit.ts
 M src/services/semantic/SemanticResultFallback.ts
 M src/services/semantic/SemanticReviewQueue.ts
 M src/services/semantic/types.ts
 M src/types.ts
 M tests/semantic/analytics-admission.test.ts
 M tests/semantic/llm-runtime-service.test.ts
 M tests/semantic/pipeline-workspace.test.ts
 M tests/semantic/semantic-resolver.test.ts
 M tests/semantic/semantic-result-audit.test.ts
 M tests/semantic/semantic-review-queue.test.ts
?? docs/
?? src/services/semantic/ClaimOutcomeClassification.ts
?? src/services/semantic/JudgmentRelationshipSelection.ts
?? src/services/semantic/SemanticWorkflowState.ts
?? src/services/semantic/StagedSemanticDiagnostic.ts
?? tests/semantic/claim-outcome-classification.test.ts
?? tests/semantic/judgment-relationship-selection.test.ts
?? tests/semantic/staged-semantic-diagnostic.test.ts
?? tests/semantic/structured-judgment-context.test.ts
```

From the repository root, Git reports the new untracked `docs/experiments/`
subtree as `?? docs/`; the two archive files are the only files added by this
documentation task.

No commit and no push were performed. The existing implementation changes were
not overwritten, staged, or otherwise modified by the archival task.

## Technical Report Summary

The research question was whether labor-dispute claim outcomes could be
resolved reliably from source judgments when the relevant claim and judgment
item are expressed indirectly, globally, or across procedural layers. The
initial architecture combined deterministic parsing with a full LLM semantic
resolver. The rules-only baseline exposed long-tail semantic branching, while
the full resolver exposed a different limitation: conservative and unstable
claim-to-judgment relationship mapping.

The experimental design progressively isolated the variables that could affect
that result. Prompt contract calibration, explicit task identity, structured
`cpjg` and `fxgc` context, and focused-context diagnostics were treated as
control and observability work. The later model comparison evaluated DeepSeek
Flash, DeepSeek V4 Pro in non-thinking and thinking-high modes, and an xAI Grok
full resolver on six recorded real-case attempts. The results were 0/6 correct
with 6/6 unresolved for DeepSeek Flash, 0/6 correct with 6/6 unresolved for
V4 Pro non-thinking, 0/6 correct with 3 unresolved and 3 timeouts for V4 Pro
thinking-high, and 1/6 explicit correct with 3 unresolved and 2 timeouts for
Grok.

The staged resolver experiment then separated relationship selection from
outcome classification. Stage 1 selected existing judgment IDs or returned a
typed unresolved result. Stage 2 received a gold relationship and classified
the supplied disposition. Stage 2 achieved 5/5 correct outcomes in the
recorded gold-relationship experiment, while the end-to-end result remained
0/5 correct classified for case 383577 and 5/5 safe unresolved for case 383669.
This contrast identifies relationship selection, not disposition wording
alone, as the main semantic bottleneck.

The case records provide a concrete boundary for interpretation. For
`case_raw_laborinfo_383577 / claim_3`, the gold relationship was
`judgment-claim-1-2` and the expected outcome was `not_supported`. For
`case_raw_laborinfo_383669 / claim_3`, the expected result was unresolved with
an empty relationship list because of appellate dependency and insufficient
first-instance relationship context. The early 383577 Stage 1 result of 4/5 is
preserved, but the isolated, orchestrated, and combined replay produced 0/10,
0/10, and 0/20 gold respectively; the historical small-sample result could
not be reproduced.

The safety design is therefore part of the result, not an incidental detail.
Strict schema validation, task and ID contracts, source-evidence checks,
admission auditing, typed unresolved reasons, and human review prevent many
unsafe outputs from silently entering analytics. These controls support a
verified dataset boundary even when the semantic resolver cannot establish a
relationship. Missing payload bytes, non-persisted provider responses, and
unavailable evidence text limit the strength of any retrospective causal
diagnosis.

The final decision is to keep the semantic experiment history frozen and move
the competition architecture toward a human-in-the-loop pipeline:
Deterministic Parser → LLM Assisted Candidate Extraction → Strict Schema →
Validator → Human Review → Verified Dataset → Deterministic Analytics. This
is a decision about containment and auditability, not a claim that the current
resolver has achieved general-purpose semantic accuracy.
