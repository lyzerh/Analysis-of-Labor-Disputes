# Representative Cases: What the Workflow Can and Cannot Establish

These are short, anonymized engineering examples drawn from public-judgment material and the repository's experiment archive. They are not legal advice or new model-evaluation results. A court's disposition, a historical Gold/Benchmark label, and a **current-code reconstruction** have different evidentiary status.

## 1. Employer as plaintiff, employee as counterclaimant

**Source:** Public first-instance labor judgment, source record `raw_laborinfo_723140`. The original disposition dismisses the employer-plaintiff's request, orders payment of RMB 144,420 to the employee-counterclaimant, and dismisses the employee's other requests. Party names and unnecessary personal details are omitted here.

**Why it is difficult:** “Plaintiff” does not mean “employee.” The document has a claim and a counterclaim, and the payment order applies to the counterclaimant. Collapsing procedural role into employment role could reverse the research interpretation.

**Rule-based structure:** Current deterministic reconstruction identifies employer and employee claimants separately. It produces claim categories for unlawful-termination compensation, economic compensation, and annual-leave pay. The reconstruction is marked `current_code_from_raw_document`, `notHistoricalExact: true`; its claim IDs are not evidence of the original Benchmark input.

**Semantic/review contribution:** A semantic candidate must be checked against *whose* request and *which* disposition it describes. The historical v0.3 record labels `claim_1` as unlawful-termination compensation with Gold `partially_supported` and AI `not_supported`. The current reconstruction gives that same ID a different claimant perspective and `not_supported`. That discrepancy is a **claim-identity question**, not proof that the model simply misread a clear payment order. A reviewer must verify the underlying target before using either label.

**Research-ready representation:** Store separate claim ownership and outcome per party; admit only identity-checked, determinate claims through the normal gate. The judgment itself supports the payment/dismissal facts above, but this documentation does **not** assert that the historical `claim_1` has been reconciled.

## 2. Two appeals and a shifted claim ID

**Source:** Public second-instance labor judgment, `raw_laborinfo_728156`. The appellate disposition dismisses both appeals and maintains the first-instance decision. The reasoning discusses unpaid wages, termination timing, and the difference in double wages for no written contract.

**Why it is difficult:** An appeal request and the underlying employee entitlement are different objects. “Appeal dismissed” does not by itself tell us the final support status of every underlying monetary claim.

**Rule-based structure:** Current-code reconstruction recognizes an employer-side double-wage-difference claim, a termination-confirmation claim, and a procedural appeal. In that reconstructed object, `claim_3` is procedural. The archived v0.3 Gold/AI pair instead identifies `claim_3` as double-wage difference (Gold `not_supported`, AI `partially_supported`). The historical structured case and exact semantic task were unavailable when the reconstruction was made.

**Semantic/review contribution:** Before attributing the archived disagreement to outcome reasoning, the system needs to bind the Gold target to the same substantive claim in the current case. Claim Identity and manual verification provide that check; the model cannot repair it by guessing from a reused ID.

**Research-ready representation:** Keep procedural appeals out of substantive outcome statistics and preserve the identity mismatch for review. This case illustrates a provenance boundary, **not** a measured correction of the historical model result.

## 3. Safe unresolved result in an appeal

**Evidence:** The archived [September 2026 semantic-resolution experiment](experiments/semantic-resolution-2026-09.md) records `case_raw_laborinfo_383669 / claim_3` as an appellate-dependency case. The expected relationship state was `unresolved`, with no selected judgment relationship IDs because first-instance context was insufficient. The archive reports 5/5 safe-unresolved Stage 1 trials and 5/5 safe-unresolved end-to-end trials for this specific target.

**Why it is difficult:** An appellate passage can discuss a request without supplying enough information to map the underlying claim to a final judgment item.

**Rule/semantic/review contribution:** The experiment's relationship selector did not fabricate a link. The available archive supports the **unresolved relationship outcome**; it does not provide a complete current production `AnalysisCaseRecord` or establish an overall model reliability rate. In the product workflow, such uncertainty remains reviewable and cannot be counted as a definite supported/not-supported result merely because an API call succeeded.

**Research-ready representation:** No determinate claim outcome is asserted from the archived relationship test alone. A human can consult the original judgment and missing first-instance context; a reviewed final value still passes Analytics Admission.

## Evidence boundaries

The first two case descriptions distinguish source-document facts from the locally exported current-code reconstruction and historical v0.3 labels. The reconstruction is **not** a byte-for-byte recovery of the old Benchmark input, and it has not been written back into the project database. The third case is an archived experiment, not part of the eight-claim Gold Benchmark summarized in the [README](../README.md).
