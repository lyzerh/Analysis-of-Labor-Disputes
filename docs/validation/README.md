# Competition Validation Snapshots

“导出验证快照”生成一个只读 JSON 文件，用于冻结当前比赛版的案例、语义准入、人工复核和 AnalysisRun 状态，供后续 Gold Set 与验证报告使用。

快照会在导出时重新执行当前的 Semantic Audit，并同时保留复核项历史 Audit。人工审核后的结果是快照中的权威语义值；Analytics Gate 的当前准入结果决定工作流统计。

快照不包含 API Key、Authorization header、sessionStorage 凭据、隐藏推理内容或完整 provider 调试 payload。导出只发生在浏览器本地，不会上传快照。

文件名格式：

```text
lawlens-validation-snapshot-YYYY-MM-DD.json
```

`librarySummary` 是本地案例库规模，`cases` 与 `workflowSummary` 是当前页面/分析集范围，`analysisRuns` 则按各自的输入案例重新统计；三者不应混作同一个分母。
