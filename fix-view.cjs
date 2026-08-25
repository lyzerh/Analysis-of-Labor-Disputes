const fs = require('fs');
let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

// fix employerDefenses
code = code.replace(/def\.type/g, 'def.defenseType || def.type');
code = code.replace(/def\.text/g, 'def.matchedText || def.text');

// fix evidences -> evidence
code = code.replace(/record\.evidences/g, 'record.evidence');
code = code.replace(/ev\.type/g, 'ev.name || ev.type');
code = code.replace(/ev\.text/g, 'ev.matchedText || ev.text');

// fix courtReasoning mapping (if it's a string, we can split it or just render it directly)
const reasoningRegex = /\{record\.courtReasoning && record\.courtReasoning\.length > 0 \? \([\s\S]*?<\/ul>/;
const newReasoningStr = `{record.courtReasoning && record.courtReasoning.length > 0 ? (
                        <div className="text-xs text-slate-700 bg-white p-2 border border-slate-100 rounded leading-relaxed">
                          {record.courtReasoning}
                        </div>`;
code = code.replace(reasoningRegex, newReasoningStr);

// fix claims
code = code.replace(/claim\.type/g, 'claim.claimType || claim.type');
code = code.replace(/claim\.text/g, 'claim.requestAmount || claim.text'); // Wait, LaborInfoClaimItem has claimType, requestAmount, supportStatus
code = code.replace(/claim\.supportStatus === 'supported'/g, 'claim.supportStatus === "supported" || claim.status === "supported"');

fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
console.log('Fixed CaseAnalysisView');
