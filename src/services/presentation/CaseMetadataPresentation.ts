import { normalizeCaseLevel } from '../case/CaseLibraryFilter';
import type { AnalysisCaseRecord } from '../../types';
import type { TFunction } from 'i18next';
import { getCaseLevelLabel, getDisputeTypeLabel } from './domainLabels';

const UNKNOWN_VALUES = new Set(['', '-', '未知', '未识别', '未载明案号', '未载明日期']);
const INVALID_PARTY_FRAGMENTS = /^(?:为其成员|系.+|依法.+|应当.+|可以.+|不得.+)$/;

function hasValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function formatCaseNumber(value: string | null | undefined): string {
  const normalized = value?.trim() || '';
  return UNKNOWN_VALUES.has(normalized) ? '未识别' : normalized;
}

export function formatCaseDate(value: string | null | undefined): string {
  const normalized = value?.trim() || '';
  return hasValidCalendarDate(normalized) ? normalized : '未识别';
}

export function formatCaseLevel(value: string | null | undefined): string {
  const labels = {
    first: '一审/初裁',
    second: '二审',
    retrial: '再审',
    unknown: '未识别',
  } as const;
  return labels[normalizeCaseLevel(value)];
}

export function formatPartyName(value: string | null | undefined): string {
  const normalized = value?.trim() || '';
  if (UNKNOWN_VALUES.has(normalized) || INVALID_PARTY_FRAGMENTS.test(normalized)) return '未识别';
  return normalized;
}

export interface CaseSummaryPresentation {
  primary?: string;
  secondary?: string;
}

export function createCaseSummaryPresentation(
  record: Pick<AnalysisCaseRecord, 'employeeParty' | 'employerParty' | 'caseLevel' | 'disputeType' | 'claims' | 'outcomeDiagnostics' | 'employerDefenses'>,
  t?: TFunction,
): CaseSummaryPresentation {
  const primaryParts: string[] = [];
  const employee = formatPartyName(record.employeeParty);
  const employer = formatPartyName(record.employerParty);
  const level = t && normalizeCaseLevel(record.caseLevel) !== 'unknown'
    ? getCaseLevelLabel(record.caseLevel, t)
    : formatCaseLevel(record.caseLevel);
  const disputes = (record.disputeType || []).filter((item) => item && item !== '未知' && item !== '未识别');

  if (employee !== '未识别') primaryParts.push(t ? t('domain.summary.employee', { name: employee }) : `劳动者 ${employee}`);
  if (employer !== '未识别') primaryParts.push(t ? t('domain.summary.employer', { name: employer }) : `用人单位 ${employer}`);
  if (level !== '未识别') primaryParts.push(level);
  if (disputes.length > 0) primaryParts.push((t ? disputes.map((value) => getDisputeTypeLabel(value, t)) : disputes).join('、'));

  const secondaryParts: string[] = [];
  const claims = record.claims || [];
  const employerDefenses = record.employerDefenses || [];
  if (claims.length > 0) secondaryParts.push(t ? t('domain.summary.claims', { count: claims.length }) : `${claims.length} 项诉求`);
  const reviewCount = (record.outcomeDiagnostics || []).filter((item) => item.needsReview).length;
  if (reviewCount > 0) secondaryParts.push(t ? t('domain.summary.pending', { count: reviewCount }) : `${reviewCount} 项待复核`);
  if (employerDefenses.length > 0) secondaryParts.push(t ? t('domain.summary.defenses', { count: employerDefenses.length }) : `已识别 ${employerDefenses.length} 项企业抗辩`);

  return {
    primary: primaryParts.length > 0 ? (t ? t('domain.summary.case', { details: primaryParts.join('｜') }) : `本案：${primaryParts.join('｜')}`) : undefined,
    secondary: secondaryParts.length > 0 ? (t ? t('domain.summary.extracted', { details: secondaryParts.join('｜') }) : `识别结果：${secondaryParts.join('｜')}`) : undefined,
  };
}
