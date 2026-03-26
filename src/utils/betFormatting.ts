import { BetSource } from '../types';

const SOURCE_LABELS: Record<BetSource, string> = {
  manual: 'Manual',
  'scan-camera': 'Scan',
  'scan-gallery': 'Upload',
};

export function getSourceLabel(source: BetSource): string {
  return SOURCE_LABELS[source] || 'Manual';
}

export function formatBetDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
