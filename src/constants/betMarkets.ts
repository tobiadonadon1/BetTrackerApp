/**
 * Complete Italian betting markets list.
 * Extracted from the official Sisal/bookmaker PDF reference.
 *
 * Each market has a title (used as the section header in the picker UI)
 * and an array of selectable options.
 *
 * When the user taps a market title, the options expand below.
 * Tapping an option populates the "Selection" field on the bet form.
 */

export interface MarketDefinition {
  id: string;
  label: string;
  options: string[];
  category: 'match_result' | 'goals' | 'half_time' | 'exact_score' | 'handicap' | 'combo' | 'other';
}

export const ITALIAN_MARKETS: MarketDefinition[] = [
  // ─── MATCH RESULT ───
  {
    id: 'esito_finale_1x2',
    label: 'Esito Finale 1X2',
    options: ['1', 'X', '2'],
    category: 'match_result',
  },
  {
    id: 'doppia_chance_finale',
    label: 'Doppia Chance Finale',
    options: ['1X', 'X2', '12'],
    category: 'match_result',
  },
  {
    id: 'draw_no_bet',
    label: 'Draw No Bet',
    options: ['1 Draw No Bet', '2 Draw No Bet'],
    category: 'match_result',
  },

  // ─── GOALS ───
  {
    id: 'under_over',
    label: 'Under / Over',
    options: [
      'Under 0.5', 'Over 0.5',
      'Under 1.5', 'Over 1.5',
      'Under 2.5', 'Over 2.5',
      'Under 3.5', 'Over 3.5',
      'Under 4.5', 'Over 4.5',
      'Under 5.5', 'Over 5.5',
      'Under 6.5', 'Over 6.5',
    ],
    category: 'goals',
  },
  {
    id: 'gol_no_gol',
    label: 'Gol / No Gol',
    options: ['Gol', 'No Gol'],
    category: 'goals',
  },
  {
    id: 'multi_gol',
    label: 'Multi Gol',
    options: [
      'Multi Gol 0-1', 'Multi Gol 0-2', 'Multi Gol 0-3', 'Multi Gol 0-4', 'Multi Gol 0-5', 'Multi Gol 0-6',
      'Multi Gol 1-2', 'Multi Gol 1-3', 'Multi Gol 1-4', 'Multi Gol 1-5', 'Multi Gol 1-6',
      'Multi Gol 2-3', 'Multi Gol 2-4', 'Multi Gol 2-5', 'Multi Gol 2-6',
      'Multi Gol 3-4', 'Multi Gol 3-5', 'Multi Gol 3-6',
      'Multi Gol 4-5', 'Multi Gol 4-6',
      'Multi Gol 5-6',
      'Altro',
    ],
    category: 'goals',
  },
  {
    id: 'numero_gol_totali',
    label: 'Numero Gol Totali',
    options: ['0', '1', '2', '3', '4', '5', 'Più di 5', 'Più di 6', 'Più di 7'],
    category: 'goals',
  },
  {
    id: 'segna_primo_gol',
    label: 'Segna Primo Gol',
    options: ['Casa', 'Nessuno', 'Ospite'],
    category: 'goals',
  },
  {
    id: 'pari_dispari',
    label: 'Pari / Dispari',
    options: ['Pari', 'Dispari'],
    category: 'goals',
  },

  // ─── EXACT SCORE ───
  {
    id: 'risultato_esatto',
    label: 'Risultato Esatto',
    options: [
      '1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '4-0', '4-1', '4-2', '4-3',
      '0-0', '1-1', '2-2', '3-3', '4-4',
      '0-1', '0-2', '1-2', '0-3', '1-3', '2-3', '0-4', '1-4', '2-4', '3-4',
      'Altro',
    ],
    category: 'exact_score',
  },
  {
    id: 'risultato_esatto_primo_tempo',
    label: 'Risultato Esatto Primo Tempo',
    options: ['1-0', '2-0', '2-1', '0-0', '1-1', '2-2', '0-1', '0-2', '1-2', 'Altro'],
    category: 'exact_score',
  },
  {
    id: 'risultato_esatto_secondo_tempo',
    label: 'Risultato Esatto Secondo Tempo',
    options: ['1-0', '2-0', '2-1', '0-0', '1-1', '2-2', '0-1', '0-2', '1-2', 'Altro'],
    category: 'exact_score',
  },

  // ─── HANDICAP ───
  {
    id: 'handicap',
    label: 'Handicap',
    options: [
      '1 (Casa -1)', 'X (Casa -1)', '2 (Casa -1)',
      '1 (Ospite -1)', 'X (Ospite -1)', '2 (Ospite -1)',
      '1 (Casa -2)', 'X (Casa -2)', '2 (Casa -2)',
      '1 (Ospite -2)', 'X (Ospite -2)', '2 (Ospite -2)',
    ],
    category: 'handicap',
  },
  {
    id: 'handicap_primo_tempo',
    label: 'Handicap Primo Tempo',
    options: [
      '1 (Casa -1)', 'X (Casa -1)', '2 (Casa -1)',
      '1 (Ospite -1)', 'X (Ospite -1)', '2 (Ospite -1)',
      '1 (Casa -2)', 'X (Casa -2)', '2 (Casa -2)',
      '1 (Ospite -2)', 'X (Ospite -2)', '2 (Ospite -2)',
    ],
    category: 'handicap',
  },
  {
    id: 'handicap_secondo_tempo',
    label: 'Handicap Secondo Tempo',
    options: [
      '1 (Casa -1)', 'X (Casa -1)', '2 (Casa -1)',
      '1 (Ospite -1)', 'X (Ospite -1)', '2 (Ospite -1)',
      '1 (Casa -2)', 'X (Casa -2)', '2 (Casa -2)',
      '1 (Ospite -2)', 'X (Ospite -2)', '2 (Ospite -2)',
    ],
    category: 'handicap',
  },

  // ─── HALF TIME ───
  {
    id: 'esito_primo_tempo',
    label: 'Esito Primo Tempo',
    options: ['1', 'X', '2'],
    category: 'half_time',
  },
  {
    id: 'esito_secondo_tempo',
    label: 'Esito Secondo Tempo',
    options: ['1', 'X', '2'],
    category: 'half_time',
  },
  {
    id: 'doppia_chance_primo_tempo',
    label: 'Doppia Chance Primo Tempo',
    options: ['1X', 'X2', '12'],
    category: 'half_time',
  },
  {
    id: 'doppia_chance_secondo_tempo',
    label: 'Doppia Chance Secondo Tempo',
    options: ['1X', 'X2', '12'],
    category: 'half_time',
  },
  {
    id: 'primo_tempo_finale',
    label: 'Primo Tempo / Finale',
    options: [
      '1-1', '1-X', '1-2',
      'X-1', 'X-X', 'X-2',
      '2-1', '2-X', '2-2',
    ],
    category: 'half_time',
  },
  {
    id: 'under_over_primo_tempo',
    label: 'Under / Over Primo Tempo',
    options: [
      'Under 0.5', 'Over 0.5',
      'Under 1.5', 'Over 1.5',
      'Under 2.5', 'Over 2.5',
      'Under 3.5', 'Over 3.5',
      'Under 4.5', 'Over 4.5',
      'Under 5.5', 'Over 5.5',
    ],
    category: 'half_time',
  },
  {
    id: 'under_over_secondo_tempo',
    label: 'Under / Over Secondo Tempo',
    options: [
      'Under 0.5', 'Over 0.5',
      'Under 1.5', 'Over 1.5',
      'Under 2.5', 'Over 2.5',
      'Under 3.5', 'Over 3.5',
      'Under 4.5', 'Over 4.5',
      'Under 5.5', 'Over 5.5',
    ],
    category: 'half_time',
  },
  {
    id: 'gol_no_gol_primo_tempo',
    label: 'Gol / No Gol Primo Tempo',
    options: ['Gol', 'No Gol'],
    category: 'half_time',
  },
  {
    id: 'gol_no_gol_secondo_tempo',
    label: 'Gol / No Gol Secondo Tempo',
    options: ['Gol', 'No Gol'],
    category: 'half_time',
  },

  // ─── HOME / AWAY SPECIFIC ───
  {
    id: 'under_over_casa',
    label: 'Under / Over Casa',
    options: [
      'Casa Under 0.5', 'Casa Over 0.5',
      'Casa Under 1.5', 'Casa Over 1.5',
      'Casa Under 2.5', 'Casa Over 2.5',
      'Casa Under 3.5', 'Casa Over 3.5',
      'Casa Under 4.5', 'Casa Over 4.5',
      'Casa Under 5.5', 'Casa Over 5.5',
    ],
    category: 'goals',
  },
  {
    id: 'under_over_ospite',
    label: 'Under / Over Ospite',
    options: [
      'Ospite Under 0.5', 'Ospite Over 0.5',
      'Ospite Under 1.5', 'Ospite Over 1.5',
      'Ospite Under 2.5', 'Ospite Over 2.5',
      'Ospite Under 3.5', 'Ospite Over 3.5',
      'Ospite Under 4.5', 'Ospite Over 4.5',
      'Ospite Under 5.5', 'Ospite Over 5.5',
    ],
    category: 'goals',
  },
  {
    id: 'segna_casa_primo_tempo',
    label: 'Segna Casa Primo Tempo',
    options: ['Si', 'No'],
    category: 'half_time',
  },
  {
    id: 'segna_casa_secondo_tempo',
    label: 'Segna Casa Secondo Tempo',
    options: ['Si', 'No'],
    category: 'half_time',
  },
  {
    id: 'segna_ospite_primo_tempo',
    label: 'Segna Ospite Primo Tempo',
    options: ['Si', 'No'],
    category: 'half_time',
  },
  {
    id: 'segna_ospite_secondo_tempo',
    label: 'Segna Ospite Secondo Tempo',
    options: ['Si', 'No'],
    category: 'half_time',
  },
  {
    id: 'segna_squadra_casa',
    label: 'Segna Squadra Casa',
    options: ['Si', 'No'],
    category: 'goals',
  },
  {
    id: 'segna_squadra_ospite',
    label: 'Segna Squadra Ospite',
    options: ['Si', 'No'],
    category: 'goals',
  },
  {
    id: 'casa_segna_entrambi_tempi',
    label: 'Casa Segna Entrambi i Tempi',
    options: ['Si', 'No'],
    category: 'half_time',
  },
  {
    id: 'ospite_segna_entrambi_tempi',
    label: 'Ospite Segna Entrambi i Tempi',
    options: ['Si', 'No'],
    category: 'half_time',
  },

  // ─── SPECIAL ───
  {
    id: 'squadra_casa_vince_entrambi_tempi',
    label: 'Squadra Casa Vince Entrambi i Tempi',
    options: ['Si', 'No'],
    category: 'other',
  },
  {
    id: 'squadra_ospite_vince_entrambi_tempi',
    label: 'Squadra Ospite Vince Entrambi i Tempi',
    options: ['Si', 'No'],
    category: 'other',
  },
  {
    id: 'squadra_casa_vince_a_zero',
    label: 'Squadra Casa Vince a 0',
    options: ['Si', 'No'],
    category: 'other',
  },
  {
    id: 'squadra_ospite_vince_a_zero',
    label: 'Squadra Ospite Vince a 0',
    options: ['Si', 'No'],
    category: 'other',
  },
  {
    id: 'tempo_con_piu_gol',
    label: 'Tempo con più gol',
    options: ['Primo', 'Secondo', 'Parità'],
    category: 'other',
  },
  {
    id: 'pari_dispari_primo_tempo',
    label: 'Pari / Dispari Primo Tempo',
    options: ['Pari', 'Dispari'],
    category: 'other',
  },
  {
    id: 'pari_dispari_secondo_tempo',
    label: 'Pari / Dispari Secondo Tempo',
    options: ['Pari', 'Dispari'],
    category: 'other',
  },
  {
    id: 'multi_gol_casa',
    label: 'Multi Gol Casa',
    options: [
      'Multi Gol 0-1', 'Multi Gol 0-2', 'Multi Gol 0-3',
      'Multi Gol 1-2', 'Multi Gol 1-3',
      'Multi Gol 2-3',
      'Altro',
    ],
    category: 'goals',
  },
  {
    id: 'multi_gol_ospite',
    label: 'Multi Gol Ospite',
    options: [
      'Multi Gol 0-1', 'Multi Gol 0-2', 'Multi Gol 0-3',
      'Multi Gol 1-2', 'Multi Gol 1-3',
      'Multi Gol 2-3',
      'Altro',
    ],
    category: 'goals',
  },
  {
    id: 'numero_gol_casa',
    label: 'Numero Gol Casa',
    options: ['0', '1', '2', 'Più di 2'],
    category: 'goals',
  },
  {
    id: 'numero_gol_ospite',
    label: 'Numero Gol Ospite',
    options: ['0', '1', '2', 'Più di 2'],
    category: 'goals',
  },
  {
    id: 'numero_gol_primo_tempo',
    label: 'Numero Gol Primo Tempo',
    options: ['0', '1', '2', 'Più di 2'],
    category: 'half_time',
  },
  {
    id: 'numero_gol_secondo_tempo',
    label: 'Numero Gol Secondo Tempo',
    options: ['0', '1', '2', 'Più di 2'],
    category: 'half_time',
  },
];

/** Group markets by category for section-list rendering */
export const MARKET_CATEGORIES: { key: MarketDefinition['category']; label: string }[] = [
  { key: 'match_result', label: 'Risultato Partita' },
  { key: 'goals', label: 'Gol' },
  { key: 'exact_score', label: 'Risultato Esatto' },
  { key: 'handicap', label: 'Handicap' },
  { key: 'half_time', label: 'Primo / Secondo Tempo' },
  { key: 'other', label: 'Altro' },
];

export function getMarketsByCategory(cat: MarketDefinition['category']): MarketDefinition[] {
  return ITALIAN_MARKETS.filter(m => m.category === cat);
}
