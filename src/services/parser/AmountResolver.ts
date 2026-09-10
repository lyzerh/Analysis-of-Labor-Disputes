import type { ClaimSupportStatus } from '../../types';

const AMOUNT_PATTERN = /(?:人民币\s*)?([0-9][0-9,]*(?:\.\d+)?)\s*元/;

export class AmountResolver {
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
    for (const alias of [...aliases].sort((a, b) => b.length - a.length)) {
      const index = text.indexOf(alias);
      if (index < 0) continue;
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
    if (requestedAmount === undefined || awardedAmount === undefined || requestedAmount < 0 || awardedAmount < 0) {
      return undefined;
    }
    if (awardedAmount === 0) return 'not_supported';
    if (awardedAmount < requestedAmount) return 'partially_supported';
    return 'supported';
  }
}
