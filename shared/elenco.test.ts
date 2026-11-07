import { describe, expect, it } from 'vitest';
import { decorateElenco, elencoAgent, parseElenco } from './elenco';
import type { AgentInfo, OfficeSnapshot } from './types';
const agent = (id: string, account = '.codex', sessionId = 'real'): AgentInfo => ({ id, account, sessionId, kind: 'main', name: 'Original', status: 'working', stats: { toolCalls: 2, tokensIn: 100, tokensOut: 20, subagents: 0 }, title: 'Habblaud', roomId: 'office', look: 'f', role: 'Agente principal', recent: [], tasks: [], startedAt: 1, lastEventAt: 2, statusSince: 1, seed: 123 });
describe('elenco local sem inventar sessões', () => {
  it('valida configuração, rejeita entradas inválidas, nomes repetidos e paths', () => {
    for (const raw of [null, {}, [{ name: 'A', account: '../segredo' }], [{ name: 'A', account: '.codex', parts: { top: 'red' } }], [{ name: 'A', account: '.a' }, { name: 'A', account: '.b' }]]) expect(parseElenco(raw)).toEqual([]);
    expect(parseElenco([{ name: 'Jocasta', account: '.codex' }])).toHaveLength(1);
  });
  it('não adivinha a sessão quando uma conta tem mais de uma', () => {
    const [entry] = parseElenco([{ name: 'Jocasta', account: '.codex' }]);
    expect(elencoAgent(entry, [agent('1'), agent('2', '.codex', 'other')])).toBeUndefined();
    expect(elencoAgent({ ...entry, sessionId: 'real' }, [agent('1'), agent('2', '.codex', 'other')])?.id).toBe('1');
  });
  it('decora apenas agente principal vivo e preserva status, contagem, tokens e origem', () => {
    const entries = parseElenco([{ name: 'Jocasta', account: '.codex', front: 'Habblaud' }, { name: 'Ausente', account: '.other' }]);
    const original = { agents: [agent('1'), { ...agent('sub'), kind: 'sub' }], rooms: [], rev: 2, serverTime: 1, accounts: [], meta: { demo: false, sources: [], startedAt: 1, version: '1.0.3' } } satisfies OfficeSnapshot;
    const result = decorateElenco(original, entries);
    expect(result.agents).toHaveLength(2);
    expect(result.agents[0]).toMatchObject({ name: 'Jocasta', deskLabel: 'Habblaud', status: 'working', stats: { toolCalls: 2, tokensIn: 100, tokensOut: 20, subagents: 0 }, sessionId: 'real' });
    expect(result.agents[1].name).toBe('Original');
    expect(original.agents[0].name).toBe('Original');
  });
});
