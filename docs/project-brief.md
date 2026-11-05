# LawLens Project Brief

## Problem

Public labor-dispute judgments are a promising source for empirical legal research, but they are written for adjudication rather than data analysis. A document may present a worker's request, an employer's response, a counterclaim, a procedural appeal, judicial reasoning, and a final order in different sections. Simple keyword extraction can mistake a defense or a court's explanation for the original request. A language model can help connect passages, but a fluent answer is not necessarily a reliable research fact. The research problem is therefore not just extracting text: it is producing structured data whose scope, provenance, uncertainty, and inclusion rules can be examined.

## My Role

I led LawLens as an individual project, designing and implementing its legal-data workflow, browser interface, validation and review steps, research population model, and evaluation tools. I used established frameworks and third-party services rather than training a foundation model. My contribution lies in how those components are composed into an auditable research system. The repository's code and tests substantiate the implementation; this brief does not imply a deployed institutional service or a multi-person engineering team.

## Technical Approach

LawLens imports public judgments as raw documents and applies deterministic parsing to build initial case records. The parser keeps party roles, claims, source sections, and judgment-related text distinguishable. A semantic resolver can then request a model-generated candidate for difficult claim/outcome relationships. That candidate passes a result contract, identity and relationship checks, and audit logic. A human reviewer can confirm an outcome when the model is uncertain or fails technically. Analytics Admission separately decides whether a record is safe to include. Research populations and analysis runs freeze the selected case set; deterministic programs then calculate distributions and associations, with links back to individual cases.

The interface offers Chinese and English labels. Domain labels are translated only for display, leaving canonical values and statistical keys intact. An optional, user-triggered English translation produces a cached reading copy of a Chinese judgment. The copy is isolated from parsing, Gold annotation, Benchmark evaluation, and statistics. The original Chinese source remains the basis for factual claims.

## Trustworthy AI Design

The central rule is: AI proposes; programs validate; people review; deterministic code calculates. Model output is never treated as a legal finding merely because it conforms to JSON. The workflow distinguishes a semantic uncertainty from a provider or schema failure, preserves technical-failure history, and allows manual-only review. Claim Identity prevents a historical Gold label from being silently applied to a different current claim. Unclear outcomes are blocked from analytics even after a review item has been processed. These choices make abstention and provenance visible rather than hiding them behind a single success rate.

## Evaluation

The small rules-only annotation sample contains 26 extracted substantive claim records: 12 were labeled correct, 4 wrong type, and 10 spurious. Thus 12/26 describes correctness **among extracted records**; missed claims and recall were not measured. A separate Gold Benchmark contained 10 cases and eight eligible, identity-verified claims. All eight model calls completed; five produced definite candidates, three remained unresolved for human review, and all five definite candidates matched their human Gold labels. The 5/5 agreement applies only to that definite subset. Different denominators, tasks, and selection rules prevent treating these figures as an improvement from 46.2% to 100%, or as a general legal-outcome accuracy estimate.

## What I Learned

The hardest errors were often about *identity* before classification: which party made a request, whether the passage was a request or a defense, and whether an appellate claim matched the Gold target. I learned to test these boundaries with real documents, to retain an explicit “unavailable source text” state, and to separate reproducible computation from model interpretation. The project also showed that documentation of failure and uncertainty is part of evaluation, not merely an implementation detail.

## Relevance to Graduate Study

LawLens connects legal reasoning with trustworthy AI, data quality, human-in-the-loop design, privacy boundaries, and reproducible analytics. Its methods are relevant to LegalTech, technology law, data governance, GRC, AI governance, and cybersecurity governance, while the project itself is **not** a cybersecurity defense system. I would use graduate study to develop stronger evaluation designs, broader cross-region samples, and clearer governance rules for when model-assisted legal data can support research claims.
