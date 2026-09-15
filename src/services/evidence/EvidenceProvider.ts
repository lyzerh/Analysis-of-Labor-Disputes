import type { EvidenceItem, EvidenceProvider } from '../../types';

const CANONICAL_PROVIDERS: readonly EvidenceProvider[] = [
  'employee',
  'employer',
  'court',
  'third_party',
  'unknown',
];

export function normalizeEvidenceProvider(provider: unknown): EvidenceProvider {
  return typeof provider === 'string' && CANONICAL_PROVIDERS.includes(provider as EvidenceProvider)
    ? provider as EvidenceProvider
    : 'unknown';
}

export function isEmployerProvidedEvidence(evidence: EvidenceItem): boolean {
  return normalizeEvidenceProvider(evidence.provider) === 'employer';
}

export function evidenceProviderLabel(provider: unknown): string {
  const labels: Record<EvidenceProvider, string> = {
    employee: '劳动者',
    employer: '企业',
    court: '法院',
    third_party: '第三方',
    unknown: '来源未识别',
  };
  return labels[normalizeEvidenceProvider(provider)];
}
