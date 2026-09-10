import type {
  SemanticResolutionInput,
  SemanticUnresolvedFragment,
} from '../../../src/services/semantic';

const claims: SemanticResolutionInput['claims'] = [
  { id: 'claim-1', order: 1, claimType: 'overtime_pay', claimantRole: 'employee', claimantPartyId: 'employee-1' },
  { id: 'claim-2', order: 2, claimType: 'severance', claimantRole: 'employee', claimantPartyId: 'employee-1' },
  { id: 'claim-3', order: 3, claimType: 'unused_leave_pay', claimantRole: 'employee', claimantPartyId: 'employee-1' },
  { id: 'claim-4', order: 4, claimType: 'social_insurance', claimantRole: 'employee', claimantPartyId: 'employee-1' },
];

const fragment = (id: string, sourceText: string): SemanticUnresolvedFragment => ({
  id,
  sourceText,
  resolutionMethod: 'unresolved',
  needsSemanticResolution: true,
});

export const semanticInput = (
  sourceText: string,
  judgmentItems: SemanticResolutionInput['judgmentItems'] = [],
): SemanticResolutionInput => ({
  caseId: 'case-semantic-1',
  claims,
  unresolvedFragments: [fragment('fragment-1', sourceText)],
  judgmentItems,
});

export interface OrdinalFixture {
  name: string;
  input: SemanticResolutionInput;
  expectedStatus: 'resolved' | 'unresolved';
  expectedRelations: Array<{
    ids: string[];
    treatment?: string;
    action?: string;
    reasoningType?: string;
  }>;
  expectedReason?: string;
  expectedValidationDecision: 'accepted' | 'unresolved';
}

export const ordinalFixtures: OrdinalFixture[] = [
  {
    name: 'separates mixed treatment for first and second claims',
    input: semanticInput('上述两项请求中，第一项缺乏依据，第二项予以支持'),
    expectedStatus: 'resolved',
    expectedRelations: [
      { ids: ['claim-1'], treatment: 'rejected' },
      { ids: ['claim-2'], treatment: 'accepted' },
    ],
    expectedValidationDecision: 'accepted',
  },
  {
    name: 'maps a multi-ordinal expression to two claims',
    input: semanticInput('对于前述三项请求，本院认为第一、三项有事实依据，第二项不予支持'),
    expectedStatus: 'resolved',
    expectedRelations: [
      { ids: ['claim-1', 'claim-3'], treatment: 'accepted' },
      { ids: ['claim-2'], treatment: 'rejected' },
    ],
    expectedValidationDecision: 'accepted',
  },
  {
    name: 'maps the first two claims',
    input: semanticInput('前两项请求予以支持'),
    expectedStatus: 'resolved',
    expectedRelations: [{ ids: ['claim-1', 'claim-2'], treatment: 'accepted' }],
    expectedValidationDecision: 'accepted',
  },
  {
    name: 'maps a numeric ordinal',
    input: semanticInput('第2项请求不能成立'),
    expectedStatus: 'resolved',
    expectedRelations: [{ ids: ['claim-2'], treatment: 'rejected' }],
    expectedValidationDecision: 'accepted',
  },
  {
    name: 'maps the tenth syntax but leaves an unavailable claim unresolved',
    input: semanticInput('第十项请求予以支持'),
    expectedStatus: 'unresolved',
    expectedRelations: [],
    expectedReason: 'ordinal_out_of_range',
    expectedValidationDecision: 'unresolved',
  },
  {
    name: 'rejects a simple out-of-range ordinal',
    input: semanticInput('第五项请求予以支持'),
    expectedStatus: 'unresolved',
    expectedRelations: [],
    expectedReason: 'ordinal_out_of_range',
    expectedValidationDecision: 'unresolved',
  },
  {
    name: 'does not hard-guess cross-sentence anaphora',
    input: semanticInput('关于加班工资问题，本院认为证据不足。故该项请求不予支持'),
    expectedStatus: 'unresolved',
    expectedRelations: [],
    expectedReason: 'non_deterministic_anaphora',
    expectedValidationDecision: 'unresolved',
  },
  {
    name: 'does not hard-guess a previous-request reference',
    input: semanticInput('前述请求没有事实依据'),
    expectedStatus: 'unresolved',
    expectedRelations: [],
    expectedValidationDecision: 'unresolved',
  },
  {
    name: 'does not hard-guess a this-request reference',
    input: semanticInput('该项请求，本院不予支持'),
    expectedStatus: 'unresolved',
    expectedRelations: [],
    expectedValidationDecision: 'unresolved',
  },
  {
    name: 'resolves remaining claims only after prior claim mappings exist',
    input: semanticInput('驳回其余诉讼请求', [
      { id: 'item-1', action: 'support', sourceText: '支持第一项', referencedClaimIds: ['claim-1'] },
      { id: 'item-2', action: 'pay', sourceText: '支付第二项', referencedClaimIds: ['claim-2'] },
    ]),
    expectedStatus: 'resolved',
    expectedRelations: [{ ids: ['claim-3', 'claim-4'], treatment: 'rejected' }],
    expectedValidationDecision: 'accepted',
  },
  {
    name: 'keeps remaining claims unresolved without prior mappings',
    input: semanticInput('驳回其余诉讼请求'),
    expectedStatus: 'unresolved',
    expectedRelations: [],
    expectedReason: 'remaining_claims_without_prior_mapping',
    expectedValidationDecision: 'unresolved',
  },
  {
    name: 'maps appellate maintain and revoke actions without inventing claim treatment',
    input: semanticInput('维持一审判决第一项；撤销第二项'),
    expectedStatus: 'resolved',
    expectedRelations: [
      { ids: ['claim-1'], treatment: 'unclear', action: 'maintain', reasoningType: 'appeal_mapping' },
      { ids: ['claim-2'], treatment: 'unclear', action: 'revoke', reasoningType: 'appeal_mapping' },
    ],
    expectedValidationDecision: 'accepted',
  },
  {
    name: 'does not distribute a plural partial-support statement across claims',
    input: semanticInput('对上述请求，本院部分予以支持'),
    expectedStatus: 'unresolved',
    expectedRelations: [],
    expectedValidationDecision: 'unresolved',
  },
  {
    name: 'keeps all relations unresolved when any ordinal in a group is invalid',
    input: semanticInput('第一、五项请求予以支持'),
    expectedStatus: 'unresolved',
    expectedRelations: [],
    expectedReason: 'ordinal_out_of_range',
    expectedValidationDecision: 'unresolved',
  },
];
