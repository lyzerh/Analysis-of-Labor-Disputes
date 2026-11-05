# LawLens Interview Notes

These are short speaking prompts. Adapt the wording to the audience and do not present the small evaluation as a population-level accuracy result.

## 1. 30-second introduction

LawLens is my legal-analytics project for public labor-dispute judgments. It turns free-form documents into traceable case records using rules and optional model assistance. Validators and human review decide what is safe to analyze, and the statistics themselves are calculated by deterministic code. The aim is research-ready data, not legal advice or outcome prediction.

## 2. 90-second introduction

Labor judgments contain useful research information, but the same document can contain a claim, a defense, a counterclaim, appellate arguments, judicial reasoning, and the final order. LawLens first parses a document into a structured case record with provenance and party roles. A third-party language model may propose a claim outcome where the relationship is difficult; its answer is checked against a strict result contract, identity and evidence rules, and an analytics admission gate. Reviewers can resolve uncertainty, including cases where the AI call fails. A frozen research population makes the resulting statistics reproducible and lets a researcher trace a chart back to the included cases. The interface is bilingual; optional English translations help reading but never feed the fact pipeline. My main design decision was to make uncertainty visible instead of reporting every model output as a fact.

## 3. Why not use LLM-only extraction?

Models can confuse an employer's appeal with an employee's underlying claim or turn judicial reasoning into request text. Rules preserve clear structural boundaries; the model is useful for harder semantic links, but its output still needs validation and review.

## 4. Why deterministic analytics?

A statistical result should be reproducible from a defined set of accepted records. The model helps prepare candidates; code computes counts and rates from the frozen analysis set.

## 5. How do you prevent hallucinations from entering statistics?

I constrain the model's output shape, check IDs and relationships, audit the result, and use Analytics Admission. Unclear or conflicting values remain blocked until they can be resolved through the normal review path.

## 6. What is the role of Human Review?

Reviewers provide the authoritative claim outcome when necessary. They can work without a successful AI candidate, but their result still passes the same analytics gate; an “unclear” label does not become a definite fact.

## 7. What was the hardest engineering problem?

Claim identity across procedural roles and revisions. A reused `claim_3` in an old Gold record can refer to a different claim in a current parse. Hashing and manual identity confirmation keep that mismatch visible.

## 8. What are the current limitations?

The Gold sample is small, published judgments have selection bias, rules can miss claims, and semantic candidates can be wrong. The current evidence does not establish general accuracy, recall, or cross-region performance.

## 9. How does bilingual mode work?

The interface uses Chinese and English resources; known taxonomy labels are translated for display. Stored business values and analytics keys stay the same, and unknown labels fall back to their source value.

## 10. How is translation isolated?

The user explicitly requests an English reading copy of Chinese judgment text. That cached copy is separate from the parser, Gold, Benchmark, and analytics inputs. The Chinese original remains accessible and authoritative.

## 11. What would you improve with more time?

I would enlarge the identity-verified Gold Set, evaluate across regions and sources, improve claim-to-disposition alignment, and separately measure translation quality and extraction recall.

## 12. Why is this relevant to graduate study?

It brought legal interpretation together with AI governance, data-quality controls, privacy choices, human review, and reproducible analysis. Those methods transfer to LegalTech and broader technology-governance research.
