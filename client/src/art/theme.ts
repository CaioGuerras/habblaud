// Temas de sala (puros): paletas claras e bem distintas. Sementes consecutivas (slots vizinhos)
// recebem temas diferentes; a ordem da lista alterna famílias de cor de propósito.
import type { RoomTheme } from './api';

import { HEISUCA } from './heisuca';

const THEMES: readonly RoomTheme[] = Array.from({ length: 10 }, (_, i) => {
  const t = i % 2 === 0 ? HEISUCA.shikkoku : HEISUCA.hisui;
  return { carpet: t.raised, carpet2: t.border, wall: { base: t.surface, trim: t.border, pattern: i % 3 === 0 ? 'plain' : i % 3 === 1 ? 'stripes' : 'wood_panel' }, accent: t.accent, deskVariant: i % 2 === 0 ? 'dark' : 'white', chairVariant: i % 2 === 0 ? 'gray' : 'green' };
});

export const THEME_COUNT = THEMES.length;

export function roomTheme(seed: number): RoomTheme {
  const n = THEMES.length;
  const t = THEMES[((Math.floor(seed) % n) + n) % n];
  return { ...t, wall: { ...t.wall } };
}
