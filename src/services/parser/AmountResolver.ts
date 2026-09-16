import type { ClaimSupportStatus } from '../../types';

const AMOUNT_PATTERN = /(?:人民币\s*)?([0-9][0-9,]*(?:\.\d+)?)\s*元/;

export class AmountResolver {
  public static countAmounts(text: string | undefined): number {
    if (!text) return 0;
    return (text.match(/(?:人民币\s*)?[0-9][0-9,]*(?:\.\d+)?\s*元/g) || []).length;
  }

  public static extractFirstAmount(text: string): number | undefined {
    const match = text.match(AMOUNT_PATTERN);
    if (!match) return undefined;
    const amount = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(amount) ? amount : undefined;
  }

  public static extractRequestedAmount(text: string): number | undefined {
    const match = text.match(/(?:请求|主张|要求)[^。；;]*?(?:人民币\s*)?([0-9][0-9,]*(?:\.\d+)?)\s*元/);
    if (!match) return undefined;
    const amount = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(amount) ? amount : undefined;
  }

  public static extractAmountNearAliases(text: string, aliases: string[]): number | undefined {
    const candidates = aliases
      .map((alias) => ({ alias, index: text.indexOf(alias) }))
      .filter((candidate) => candidate.index >= 0)
      .sort((left, right) => left.index - right.index || right.alias.length - left.alias.length);
    for (const { alias, index } of candidates) {
      const nearbyText = text.slice(index, index + alias.length + 48);
      const amount = this.extractFirstAmount(nearbyText);
      if (amount !== undefined) return amount;
    }
    return undefined;
  }

  public static extractAwardedAmount(text: string): number | undefined {
    const match = text.match(/(?:支付|支持|补缴|补发|判付)[^。；;]*?(?:人民币\s*)?([0-9][0-9,]*(?:\.\d+)?)\s*元/);
    if (!match) return undefined;
    const amount = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(amount) ? amount : undefined;
  }

  public static resolveAmountOutcome(
    requestedAmount: number | undefined,
    awardedAmount: number | undefined,
  ): ClaimSupportStatus | undefined {
    if (requestedAmount === undefined || awardedAmount === undefined || !Number.isFinite(requestedAmount) || !Number.isFinite(awardedAmount) || requestedAmount <= 0 || awardedAmount < 0) {
      return undefined;
    }
    if (awardedAmount === 0) return 'not_supported';
    if (awardedAmount < requestedAmount) return 'partially_supported';
    return 'supported';
  }
}
