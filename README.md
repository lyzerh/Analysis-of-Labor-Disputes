# Analysis of Labor Disputes

> A local-first legal analytics tool for analyzing Chinese labor dispute cases, with reproducible sampling, research provenance, and quality-aware statistical analysis.

Designed to help legal and HR users explore dispute patterns, compare case groups, and inspect employer-side defense outcomes without treating statistical associations as legal advice.

[Live Demo](https://lyzerh.github.io/Analysis-of-Labor-Disputes/) · [Current Milestone: v0.5.0-stage5](https://github.com/lyzerh/Analysis-of-Labor-Disputes/tree/v0.5.0-stage5) · [Repository](https://github.com/lyzerh/Analysis-of-Labor-Disputes)

## Overview

Analysis of Labor Disputes is a local-first LegalTech project that turns public Chinese labor-dispute data into structured, inspectable analysis. It supports fixed case populations, full-corpus or sampled analysis, comparisons by city, year, and court level, employer-side outcome and defense associations, and traceable research inputs.

The project is built for exploration and research, not automated legal judgment. Its statistics describe patterns in the selected cases; they are not legal advice or predictions of future court outcomes.

## Why This Project

Traditional case analysis can become difficult to trust when the remote dataset changes, sampling choices are undocumented, analysis inputs are not fixed, or unrelated local records silently enter a calculation. Results can also be misleading when sample size, missing records, and unclear outcomes are hidden.

This project separates four steps so each formal result has a stable and reviewable basis:

```text
Candidate Snapshot
        → Reproducible Sampling
        → Fixed Analysis Run
        → Quality-aware Analytics
```

## Core Workflow

```text
LaborInfoCN metadata
        ↓
Candidate Pool Snapshot
        ↓
Full Corpus or Reproducible Sample
        ↓
Fixed AnalysisRun Inputs
        ↓
Research-aware Analytics
        ↓
Quality Guardrails + Provenance
```

When cases are prepared for analysis, the selected IDs remain authoritative:

```text
Selected case IDs
        → Exact-ID preparation
        → Structured AnalysisCaseRecord
```

## Current Features

### Dataset and Reproducibility

- Candidate Pool Snapshots with fixed candidate IDs
- Candidate hashes and dataset fingerprints
- Metadata-only candidate enumeration
- Explicit complete, partial, failed, and cancelled snapshot states

### Sampling

- Seeded random sampling
- Stratified seeded sampling
- Proportional and balanced allocation
- Deterministic sample hashes
- Stored sampling provenance

### Analysis

- Exhaustive corpus analysis
- Reproducible sampled analysis
- Fixed AnalysisRun inputs
- Isolation of a sample from unrelated local records
- City, year, and court-level composition
- Employer-side outcome and defense association analysis

### Quality and Auditability

- Small-sample and unclear-outcome warnings
- Missing-record and failed-record warnings
- Stratum attrition checks
- AnalysisRun provenance
- Visible input N, usable N, and unknown-outcome N

### Local-first Architecture

- Browser-based storage with IndexedDB and Dexie
- PWA-oriented local-first frontend
- No API key stored in the static client
- Deterministic legal-outcome and analytics logic
- Optional semantic resolver isolated from the GitHub Pages client build

## Research Reliability

### Case Scope

The system first freezes the candidate population. Later analysis therefore does not silently change when remote data changes or when unrelated cases are added to the local database. Internally, this frozen scope is stored as a `CandidatePoolSnapshot`.

### Analysis Method

Users can analyze all eligible cases, create a reproducible random sample, or build a stratified comparison sample. The sample definition and its provenance are stored as a `SamplingRun`.

### Analysis Run

Each formal analysis stores:

- Fixed case IDs
- Dataset fingerprint
- Sampling provenance
- Parser and ruleset versions
- Semantic configuration
- Result summary

This record is an `AnalysisRun`. The same research design can be reproduced later instead of silently re-querying a changing dataset.

## Example Use Cases

- Compare labor-dispute patterns across Guangzhou, Shenzhen, and Dongguan
- Compare first-instance and second-instance cases
- Inspect the distribution of dispute types
- Examine employer-favorable and employer-unfavorable outcome patterns
- Review defense-strategy co-occurrence with case outcomes
- Build a reproducible comparison sample instead of manually selecting cases

Defense findings are associations and co-occurrences in the analyzed cases. They do not establish court adoption, causal effects, winning strategies, or predictive power.

## Screenshots

> Screenshots will be updated during the upcoming frontend stabilization phase.

## Tech Stack

- React 19
- TypeScript
- Vite
- IndexedDB and Dexie
- PWA / local-first architecture
- LaborInfoCN public data API
- Vitest
- GitHub Actions
- GitHub Pages
- Optional Gemini-based semantic resolution for ambiguous references

The Gemini resolver is disabled by default, runs server-side only, and is not included as a runtime dependency of the static GitHub Pages client. Final legal outcomes and statistical results remain deterministic.

## Architecture Principle

> LLMs may help resolve ambiguous semantic relationships, but deterministic code decides legal outcomes and statistical results.

> The agent or model can decide what to inspect; deterministic functions decide what is true.

## Validation

The `v0.5.0-stage5` baseline was validated with:

- 297 / 297 tests passed
- 17 / 17 test files passed
- Production build passed
- GitHub Pages build and asset-path verification passed
- Real-browser exhaustive analysis E2E passed
- Real-browser sampled analysis E2E passed
- Sample isolation verified
- Browser persistence after reload verified
- No runtime browser errors observed in the final E2E

## Current Release

### [v0.5.0-stage5](https://github.com/lyzerh/Analysis-of-Labor-Disputes/tree/v0.5.0-stage5)

The published milestone tag establishes the reproducible legal analytics research foundation:

- Candidate Snapshot
- Reproducible Sampling
- AnalysisRun provenance
- Research-aware Analytics
- Quality Guardrails
- Research Workspace
- Real-browser E2E validation

## Quick Start

To run the project locally:

```bash
npm install
npm run dev
```

Then use the research workflow:

1. Open **Research Workspace**.
2. Define a case scope.
3. Create a Candidate Snapshot.
4. Prepare the selected cases by their exact IDs.
5. Choose full-corpus analysis or a reproducible sample.
6. Create an `AnalysisRun` and run the analysis.
7. Review the analytics, quality warnings, and provenance.

Application data is stored in the browser's IndexedDB. Clearing site data or switching browsers can remove or separate the local workspace.

Useful validation commands:

```bash
npm run test:outcome
npm run lint
npm run build
npm run build:pages
```

## Data Source

The project uses the LaborInfoCN public API as a public labor-dispute data source. Remote availability, metadata quality, and coverage depend on the upstream source; LaborInfoCN is not presented here as an official government database.

## Known Limitations

- Year-filter interaction bug
- Case-level filter interaction bug
- Data-management count semantics need redesign
- Pending-review cases cannot currently be opened or processed from the case-library UI. The page reports a pending/manual-review count, but only renders records already admitted to the analysis set; users cannot inspect exclusion reasons, correct extracted fields, approve a record, or reject it. The labels are also misleading because "structured" includes both admitted and pending records while the visible list contains admitted records only.
- The raw-judgment viewer is planned for removal
- Research terminology is currently too technical for ordinary users
- The sampling workflow needs UX simplification
- GitHub Pages remote Snapshot creation has not yet been fully validated against the deployed origin
- Weighted analytics are not implemented
- Confidence intervals are not implemented
- Formal AnalysisResult persistence is not implemented

## Next Phase

### Product Reality & Frontend Debug Unit

The next phase will focus on product and frontend reality rather than expanding the research architecture:

- Fix frontend interaction bugs
- Simplify user-facing terminology
- Audit practical applicability for HR and legal users
- Balance rigorous sampling with practical workflows
- Remove low-value UI
- Improve first-time usability

The underlying reproducibility contract will remain intact.

## Disclaimer

> This project is intended for educational, research, and legal-analytics demonstration purposes only.

> Statistical associations shown by the system do not constitute legal advice, do not predict case outcomes, and should not be interpreted as causal relationships.

本项目仅用于教育、研究与法律数据分析演示。系统展示的统计关联不构成法律意见，不预测案件结果，也不应被解释为因果关系。
