import { OddsFormat } from '../types';

export interface ParsedOdds {
  decimal: number;
  format: OddsFormat;
}

const AMERICAN_PATTERN = /^[+-]\d{3,}$/;

function stripTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

export function americanToDecimal(american: number): number {
  if (american >= 100) {
    return 1 + american / 100;
  }
  if (american <= -100) {
    return 1 + 100 / Math.abs(american);
  }
  return 0;
}

export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) return 0;
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  }
  return Math.round(-100 / (decimal - 1));
}

export function parseOddsInput(raw: string): ParsedOdds {
  if (!raw) return { decimal: 0, format: 'decimal' };
  const cleaned = raw.replace('@', '').replace(',', '.').trim();
  if (!cleaned) return { decimal: 0, format: 'decimal' };

  if (AMERICAN_PATTERN.test(cleaned)) {
    const value = parseInt(cleaned, 10);
    if (!Number.isNaN(value) && Math.abs(value) >= 100) {
      return { decimal: americanToDecimal(value), format: 'american' };
    }
  }

  const numeric = Number(cleaned);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return { decimal: 0, format: 'decimal' };
  }

  return { decimal: numeric, format: 'decimal' };
}

export function formatOdds(decimal: number, format: OddsFormat): string {
  if (!decimal || decimal <= 0) return '--';
  if (format === 'american') {
    const american = decimalToAmerican(decimal);
    if (american === 0) return '--';
    return `${american > 0 ? '+' : ''}${american}`;
  }
  const precision = decimal >= 10 ? 1 : 2;
  return stripTrailingZeros(decimal.toFixed(precision));
}

export function oddsInputFromStored(decimal: number, format: OddsFormat): string {
  if (!decimal || decimal <= 0) return '';
  if (format === 'american') {
    const american = decimalToAmerican(decimal);
    return `${american > 0 ? '+' : ''}${american}`;
  }
  return stripTrailingZeros(decimal.toString());
}

export function formatOddsWithAt(decimal: number, format: OddsFormat): string {
  const formatted = formatOdds(decimal, format);
  return formatted === '--' ? formatted : `@${formatted}`;
}
