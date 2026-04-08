/**
 * overUnderParser.ts
 *
 * Parses a bet selection string to extract Over/Under information.
 * Supports English and Italian phrasing:
 *   "Over 2.5 Goals", "Under 4 Cartellini", "Over 24.5 Points",
 *   "Più di 2.5 Gol", "Meno di 9.5 Calci d'angolo"
 */

export type OverUnderDirection = 'over' | 'under';

export type StatType =
  | 'goals'
  | 'corners'
  | 'cards'
  | 'shots_on_target'
  | 'total_shots'
  | 'fouls'
  | 'points'
  | 'rebounds'
  | 'assists'
  | 'passing_yards'
  | 'rushing_yards'
  | 'unknown';

export interface OverUnderInfo {
  direction: OverUnderDirection;
  threshold: number;
  statType: StatType;
  /** Whether this stat comes from match score (goals/points) or needs a detailed stats API */
  source: 'score' | 'detailed_stats';
}

// ─── Stat-type detection ────────────────────────────────────────────

const STAT_PATTERNS: { pattern: RegExp; type: StatType; source: 'score' | 'detailed_stats' }[] = [
  // Soccer — detailed
  { pattern: /corner|calci?\s*d['']?\s*angolo|angoli/i, type: 'corners', source: 'detailed_stats' },
  { pattern: /card|cartellini?|ammonizion/i, type: 'cards', source: 'detailed_stats' },
  { pattern: /shots?\s*on\s*target|tiri?\s*in\s*porta/i, type: 'shots_on_target', source: 'detailed_stats' },
  { pattern: /total\s*shots?|tiri?\s*total/i, type: 'total_shots', source: 'detailed_stats' },
  { pattern: /foul|falli?/i, type: 'fouls', source: 'detailed_stats' },

  // Basketball
  { pattern: /rebound/i, type: 'rebounds', source: 'detailed_stats' },
  { pattern: /assist/i, type: 'assists', source: 'detailed_stats' },

  // American Football
  { pattern: /passing\s*yard/i, type: 'passing_yards', source: 'detailed_stats' },
  { pattern: /rushing\s*yard/i, type: 'rushing_yards', source: 'detailed_stats' },

  // Score-based (must be AFTER the specific ones above)
  { pattern: /goal|gol|reti/i, type: 'goals', source: 'score' },
  { pattern: /point|punti|pts/i, type: 'points', source: 'score' },
];

function detectStatType(text: string): { type: StatType; source: 'score' | 'detailed_stats' } {
  for (const { pattern, type, source } of STAT_PATTERNS) {
    if (pattern.test(text)) return { type, source };
  }
  return { type: 'unknown', source: 'score' };
}

// ─── Main parser ────────────────────────────────────────────────────

/**
 * Attempts to parse an Over/Under bet from a selection string.
 * Returns null if the string doesn't match any Over/Under pattern.
 *
 * Examples:
 *   "Over 2.5"           → { direction: 'over', threshold: 2.5, statType: 'unknown', source: 'score' }
 *   "Over 2.5 Goals"     → { direction: 'over', threshold: 2.5, statType: 'goals', source: 'score' }
 *   "Under 4 Cartellini" → { direction: 'under', threshold: 4, statType: 'cards', source: 'detailed_stats' }
 *   "Più di 9.5 Corner"  → { direction: 'over', threshold: 9.5, statType: 'corners', source: 'detailed_stats' }
 */
export function parseOverUnder(selectionText: string): OverUnderInfo | null {
  if (!selectionText) return null;

  const text = selectionText.trim();

  // English pattern:  Over/Under <number>
  const enMatch = text.match(/\b(over|under)\s+(\d+(?:[.,]\d+)?)\b/i);
  if (enMatch) {
    const direction: OverUnderDirection = enMatch[1].toLowerCase() === 'over' ? 'over' : 'under';
    const threshold = parseFloat(enMatch[2].replace(',', '.'));
    const { type, source } = detectStatType(text);

    // If stat type is 'unknown', try to infer from context:
    // if the threshold is small (< 15) and no other keyword, assume goals
    const finalType = type === 'unknown' && threshold < 15 ? 'goals' : type;
    const finalSource = finalType === 'goals' ? 'score' : source;

    return { direction, threshold, statType: finalType, source: finalSource };
  }

  // Italian pattern:  Più di / Meno di <number>
  const itMatch = text.match(/\b(pi[uù]\s*di|meno\s*di)\s+(\d+(?:[.,]\d+)?)\b/i);
  if (itMatch) {
    const direction: OverUnderDirection = itMatch[1].toLowerCase().startsWith('pi') ? 'over' : 'under';
    const threshold = parseFloat(itMatch[2].replace(',', '.'));
    const { type, source } = detectStatType(text);

    const finalType = type === 'unknown' && threshold < 15 ? 'goals' : type;
    const finalSource = finalType === 'goals' ? 'score' : source;

    return { direction, threshold, statType: finalType, source: finalSource };
  }

  // Short form: "O 2.5" / "U 4.5"
  const shortMatch = text.match(/^([OU])\s*(\d+(?:[.,]\d+)?)\b/i);
  if (shortMatch) {
    const direction: OverUnderDirection = shortMatch[1].toUpperCase() === 'O' ? 'over' : 'under';
    const threshold = parseFloat(shortMatch[2].replace(',', '.'));
    const { type, source } = detectStatType(text);

    const finalType = type === 'unknown' && threshold < 15 ? 'goals' : type;
    const finalSource = finalType === 'goals' ? 'score' : source;

    return { direction, threshold, statType: finalType, source: finalSource };
  }

  return null;
}

/**
 * Determines if a given current value is winning or losing relative to an Over/Under bet.
 * For "Over", winning means current >= threshold (or will pass it).
 * For "Under", winning means current <= threshold (still under).
 *
 * Note: during a live match the bet hasn't settled yet, so for Under bets
 * we consider it "winning" as long as current < threshold (strictly less, since
 * the match could still end under). For Over, winning once current > threshold.
 */
export function isOverUnderWinning(
  direction: OverUnderDirection,
  currentValue: number,
  threshold: number,
): boolean {
  if (direction === 'over') {
    return currentValue > threshold;
  } else {
    return currentValue < threshold;
  }
}

/**
 * Returns a human-readable label for a stat type.
 */
export function statTypeLabel(statType: StatType): string {
  switch (statType) {
    case 'goals': return 'GOALS';
    case 'corners': return 'CORNERS';
    case 'cards': return 'CARDS';
    case 'shots_on_target': return 'SHOTS ON TARGET';
    case 'total_shots': return 'TOTAL SHOTS';
    case 'fouls': return 'FOULS';
    case 'points': return 'POINTS';
    case 'rebounds': return 'REBOUNDS';
    case 'assists': return 'ASSISTS';
    case 'passing_yards': return 'PASS YDS';
    case 'rushing_yards': return 'RUSH YDS';
    default: return '';
  }
}
