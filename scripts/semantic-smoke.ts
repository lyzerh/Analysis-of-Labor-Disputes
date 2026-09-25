import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { GeminiSemanticResultResolver, type GeminiSemanticResultClient } from '../src/services/semantic/GeminiSemanticResultResolver';
import { auditSemanticResolutionResult } from '../src/services/semantic/SemanticResultAudit';
import { DEFAULT_SEMANTIC_MODEL } from '../src/services/semantic/SemanticPrompt';
import type { UnresolvedSemanticTask } from '../src/services/semantic/SemanticResult';

dotenv.config({ quiet: true });

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
  console.error('Semantic smoke skipped: GEMINI_API_KEY is not configured in the server environment.');
  process.exitCode = 2;
} else {
  const task: UnresolvedSemanticTask = {
    status: 'unresolved',
    caseId: 'fixture-case-001',
    reasonCodes: ['payment_direction_unclear'],
    rawText: '合成劳动争议演示文书。原告：劳动者甲。被告：某公司。原告因被告拖欠劳动报酬未付，向法院提起诉讼，请求判令：被告向原告支付业务提成费57060元。本院认为被告应向原告支付业务费57060元。判决如下：被告向原告支付业务费用57060元。',
    context: '判决如下：被告向原告支付业务费用57060元。',
    knownParties: [
      {
        id: 'party-employee',
        name: '劳动者甲',
        laborRole: 'employee',
        proceduralRoles: ['plaintiff'],
      },
      {
        id: 'party-employer',
        name: '某公司',
        laborRole: 'employer',
        proceduralRoles: ['defendant'],
      },
    ],
    knownClaims: [{
      id: 'claim-wage',
      claimantPartyIds: ['party-employee'],
      claimantRole: 'employee',
      claimType: '拖欠/未付劳动报酬',
      claimText: '请求被告支付业务提成费57060元',
      requestedAmount: 57060,
      currency: 'CNY',
    }],
    knownJudgmentItems: [{
      id: 'judgment-payment',
      text: '被告向原告支付业务费用57060元',
      awardedAmount: 57060,
      currency: 'CNY',
    }],
    unresolvedTargets: [{
      type: 'claim_resolution',
      id: 'claim-wage',
      reasonCode: 'payment_direction_unclear',
    }],
  };

  const startedAt = Date.now();
  const googleClient = new GoogleGenAI({ apiKey });
  const client = googleClient as unknown as GeminiSemanticResultClient;
  const resolver = new GeminiSemanticResultResolver({
    apiKey,
    modelName: DEFAULT_SEMANTIC_MODEL,
    client,
  });

  resolver.resolve(task).then((result) => {
    const audit = auditSemanticResolutionResult(result, {
      rawText: task.rawText,
      knownParties: task.knownParties,
      knownClaims: task.knownClaims,
      knownJudgmentItems: task.knownJudgmentItems,
    });
    const schemaResult = result.resolverErrorCode === 'schema_invalid' || result.resolverErrorCode === 'invalid_json'
      ? 'fail'
      : result.resolverErrorCode ? 'not_evaluated' : 'pass';
    const finalRouting = result.status === 'resolved' && audit.decision === 'pass' ? 'safe' : 'review';
    console.info(JSON.stringify({
      caseId: task.caseId,
      model: DEFAULT_SEMANTIC_MODEL,
      durationMs: Date.now() - startedAt,
      resolverStatus: result.status,
      schema: schemaResult,
      audit: audit.decision,
      auditReasonCodes: audit.reasonCodes,
      finalRouting,
      unresolvedReasonCodes: result.unresolvedReasonCodes || [],
      resolverErrorCode: result.resolverErrorCode,
    }, null, 2));
    if (result.resolverErrorCode || audit.decision === 'fail') process.exitCode = 1;
  }).catch((error: unknown) => {
    console.error(JSON.stringify({
      caseId: task.caseId,
      model: DEFAULT_SEMANTIC_MODEL,
      resolverStatus: 'unresolved',
      finalRouting: 'review',
      resolverErrorCode: 'provider_error',
      message: error instanceof Error ? error.message : 'provider request failed',
    }, null, 2));
    process.exitCode = 1;
  });
}
