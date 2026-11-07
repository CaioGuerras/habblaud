import type { ElencoEntry } from './elenco';
export interface PanelFile { name: string; date: number; lines?: string[] }
export interface PanelData {
  at: number;
  processes: { sessions: number; threads: number; available: boolean };
  handoffs: PanelFile[];
  codex: PanelFile[];
  diary: PanelFile[];
  elenco: ElencoEntry[];
  elencoState: 'loaded' | 'missing' | 'invalid';
  unavailable: string[];
}
