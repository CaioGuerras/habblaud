// Personalização local: não cria sessões nem altera o que é enviado ao World.
import { parseAppearanceParts, parseCharacterName, type AppearanceParts } from './appearance';
import { hash32 } from './hash';
import type { AgentInfo, OfficeSnapshot } from './types';

export interface ElencoEntry {
  name: string;
  account: string;
  sessionId?: string;
  front?: string;
  look: 'f' | 'm';
  seed: number;
  parts?: AppearanceParts;
}
export function parseElenco(raw: unknown): ElencoEntry[] {
  if (!Array.isArray(raw) || raw.length > 32) return [];
  const result: ElencoEntry[] = [];
  for (const value of raw) {
    if (!value || typeof value !== 'object') return [];
    const v = value as Record<string, unknown>;
    const name = parseCharacterName(v.name);
    if (!name || typeof v.account !== 'string' || !/^[\w.-]{1,80}$/.test(v.account)) return [];
    if (v.sessionId !== undefined && (typeof v.sessionId !== 'string' || !/^[\w:.-]{1,160}$/.test(v.sessionId))) return [];
    if (v.front !== undefined && (typeof v.front !== 'string' || v.front.length > 48 || /[\p{Cc}]/u.test(v.front))) return [];
    const parts = v.parts === undefined ? undefined : parseAppearanceParts(v.parts);
    if (parts === null || (v.look !== undefined && v.look !== 'f' && v.look !== 'm')) return [];
    if (result.some(e => e.name === name || (e.account === v.account && (!e.sessionId || !v.sessionId || e.sessionId === v.sessionId)))) return [];
    result.push({ name, account: v.account, sessionId: v.sessionId as string | undefined,
      front: v.front as string | undefined, look: v.look === 'f' ? 'f' : 'm', seed: hash32(name), parts });
  }
  return result;
}
export function elencoAgent(entry: ElencoEntry, agents: readonly AgentInfo[]): AgentInfo | undefined {
  const matches = agents.filter(a => a.kind === 'main' && a.account === entry.account && (!entry.sessionId || a.sessionId === entry.sessionId) && a.status !== 'offline' && a.status !== 'done');
  // Conta com duas sessões: exigir sessionId, sem escolher uma IA arbitrariamente.
  return matches.length === 1 ? matches[0] : undefined;
}
export function decorateElenco(snap: OfficeSnapshot, entries: readonly ElencoEntry[]): OfficeSnapshot {
  const mapped = new Map<string, ElencoEntry>();
  for (const entry of entries) {
    const a = elencoAgent(entry, snap.agents);
    if (a && !mapped.has(a.id)) mapped.set(a.id, entry);
  }
  return { ...snap, agents: snap.agents.map(a => {
    const e = mapped.get(a.id);
    return e ? { ...a, name: e.name, look: e.look, seed: e.seed, parts: e.parts, deskLabel: e.front || a.title?.slice(0, 48) } : a;
  }) };
}
