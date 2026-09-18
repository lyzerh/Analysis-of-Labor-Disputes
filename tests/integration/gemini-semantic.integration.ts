import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  GeminiSemanticResolver,
  type GeminiGenerateClient,
} from '../../src/services/semantic/GeminiSemanticResolver';
import { resolveAndValidateSemanticReferences } from '../../src/services/semantic/SemanticResolver';
import { minimizeSemanticResolutionInput } from '../../src/services/semantic/SemanticPrompt';
import { DEFAULT_SEMANTIC_MODEL } from '../../src/services/semantic/SemanticPrompt';
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
    let upstreamError: {
      name?: string;
      status?: number;
      code?: number | string;
      category?: string;
      safeMessage?: string;
    } | undefined;
    const googleClient = new GoogleGenAI({ apiKey: apiKey as string });
    const model = DEFAULT_SEMANTIC_MODEL;
    const diagnosticClient: GeminiGenerateClient = {
      models: {
        generateContent: async (request) => {
          try {
            return await googleClient.models.generateContent(request);
          } catch (error) {
            const candidate = error as {
              name?: string;
              status?: number;
              code?: number | string;
              message?: string;
            };
            const message = `${candidate.name || ''} ${candidate.message || ''}`.toLowerCase();
            const safeMessage = candidate.message
              ?.replaceAll(apiKey as string, '[REDACTED]')
              .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
              .replace(/authorization\s*[:=]\s*[^,\s}]+/gi, 'authorization=[REDACTED]');
            upstreamError = {
              name: candidate.name,
              status: candidate.status,
              code: candidate.code,
              category: message.includes('schema') ? 'schema'
                : message.includes('model') ? 'model'
                  : message.includes('permission') || message.includes('api key') ? 'authentication_or_permission'
                    : message.includes('quota') || candidate.status === 429 ? 'quota_or_rate_limit'
                      : message.includes('network') || message.includes('fetch') ? 'network'
                        : message.includes('timeout')
                          || message.includes('abort')
                          || message.includes('deadline') ? 'timeout'
                          : 'other',
              safeMessage,
            };
            throw error;
          }
        },
      },
    };
    const resolver = new GeminiSemanticResolver({
      apiKey: apiKey as string,
      modelName: model,
      client: diagnosticClient,
    });
    const result = await resolveAndValidateSemanticReferences(resolver, input);
    const minimizedInput = minimizeSemanticResolutionInput(input);
    const safeCandidates = [
      ...result.accepted.map((item) => ({
        fragmentId: item.candidate.fragmentId,
        referencedClaimIds: item.candidate.referencedClaimIds,
        courtTreatment: item.candidate.courtTreatment,
        confidence: item.candidate.confidence,
        reasoningType: item.candidate.reasoningType,
        resolutionMethod: item.candidate.resolutionMethod,
        validatorDecision: item.validatorDecision,
        validatorRejectionReasons: item.validationReasons,
      })),
      ...result.humanReview.map((item) => ({
        fragmentId: item.candidate.fragmentId,
        referencedClaimIds: item.candidate.referencedClaimIds,
        courtTreatment: item.candidate.courtTreatment,
        confidence: item.candidate.confidence,
        reasoningType: item.candidate.reasoningType,
        resolutionMethod: item.candidate.resolutionMethod,
        validatorDecision: item.validatorDecision,
        validatorRejectionReasons: item.validationReasons,
      })),
      ...result.rejected.map((item) => ({
        fragmentId: item.candidate?.fragmentId,
        referencedClaimIds: item.candidate?.referencedClaimIds,
        courtTreatment: item.candidate?.courtTreatment,
        confidence: item.candidate?.confidence,
        reasoningType: item.candidate?.reasoningType,
        resolutionMethod: item.candidate?.resolutionMethod,
        validatorDecision: 'rejected' as const,
        validatorRejectionReasons: item.reasons,
      })),
    ];

    console.info('Gemini semantic integration diagnostics', {
      resolverStatus: result.status,
      errorCode: result.errorCode,
      model,
      attemptCount: result.attemptCount ?? resolver.getAttemptCount(),
      acceptedCount: result.accepted.length,
      humanReviewCount: result.humanReview.length,
      rejectedCount: result.rejected.length,
      unresolvedCount: result.unresolvedFragments.length,
      upstreamError,
      candidates: safeCandidates,
      sentContext: {
        surroundingTextPresent: minimizedInput.unresolvedFragments[0]?.surroundingText === sourceText,
        fragmentSourceTextPresent: minimizedInput.unresolvedFragments[0]?.sourceText === sourceText,
        claimSourceTextsPresent: minimizedInput.claims.map((claim) => Boolean(claim.sourceText)),
      },
      providerResponseShape: result.status === 'completed' && safeCandidates.length === 0
        ? { candidates: [] }
        : undefined,
    });

    const providerContractCandidates = [...result.accepted, ...result.humanReview]
      .map((item) => item.candidate);
    expect(providerContractCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fragmentId: 'fragment_1',
        referencedClaimIds: ['claim_1'],
        courtTreatment: 'rejected',
        resolutionMethod: 'llm',
      }),
    ]));
  }, 30_000);
});
