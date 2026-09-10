import dotenv from 'dotenv';
import { describe, expect, it } from 'vitest';
import { GeminiSemanticResolver } from '../../src/services/semantic/GeminiSemanticResolver';
import { resolveAndValidateSemanticReferences } from '../../src/services/semantic/SemanticResolver';
import type { SemanticResolutionInput } from '../../src/services/semantic/types';

dotenv.config({ quiet: true });
const apiKey = process.env.GEMINI_API_KEY;
const hasCredential = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');

describe.skipIf(!hasCredential)('Gemini semantic resolver integration', () => {
  it('resolves a cross-sentence reference without producing an outcome', async () => {
    const sourceText = '关于加班工资问题，双方对此存在争议。结合现有证据，本院认为劳动者未能完成相应举证责任。故该项请求本院不予支持。';
    const input: SemanticResolutionInput = {
      caseId: 'public-synthetic-integration-fixture',
      claims: [
        { id: 'claim_1', order: 1, claimType: 'overtime_pay', claimantRole: 'employee', sourceText: '要求支付加班工资' },
        { id: 'claim_2', order: 2, claimType: 'economic_compensation', claimantRole: 'employee', sourceText: '要求支付经济补偿金' },
      ],
      unresolvedFragments: [{
        id: 'fragment_1', sourceText, surroundingText: sourceText,
        resolutionMethod: 'unresolved', needsSemanticResolution: true,
      }],
    };
    const resolver = new GeminiSemanticResolver({
      apiKey: apiKey as string,
      modelName: process.env.GEMINI_SEMANTIC_MODEL,
    });
    const result = await resolveAndValidateSemanticReferences(resolver, input);
    expect(result.accepted.map((item) => item.candidate)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fragmentId: 'fragment_1',
        referencedClaimIds: ['claim_1'],
        courtTreatment: 'rejected',
        resolutionMethod: 'llm',
      }),
    ]));
  }, 30_000);
});
