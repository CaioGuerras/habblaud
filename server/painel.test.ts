import { mkdir, mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPanelHandler, createPanelReader, safeLines } from './painel';
const closers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of closers.splice(0)) await close(); });
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'habblaud-painel-'));
  for (const path of ['cgflix/handoffs','cgflix/gerente/casos/diario','cgflix/gerente/codex_2026-11-07','.habblaud']) await mkdir(join(home,path), {recursive:true});
  return home;
}
describe('Painel: fontes fixas e conteúdo limitado', () => {
  it('lê apenas os arquivos permitidos e cinco primeiras linhas, nunca o corpo dos handoffs', async () => {
    const home = await fixture();
    for (let i=0;i<7;i++) await writeFile(join(home,`cgflix/handoffs/teste${i}.md`), 'conteúdo que não deve sair');
    await writeFile(join(home,'cgflix/gerente/codex_2026-11-07/codex_ultima.md'), '1\n2\n3\n4\n5\nNÃO MOSTRAR');
    await writeFile(join(home,'cgflix/gerente/casos/diario/hoje.md'), '# Diário\nTudo certo');
    await writeFile(join(home,'.habblaud/elenco.json'), '[{"name":"Jocasta","account":".codex"}]');
    const data = await createPanelReader(home)();
    expect(data.handoffs).toHaveLength(5);
    expect(data.handoffs.every(f => !f.lines)).toBe(true);
    expect(data.codex[0].lines).toEqual(['1','2','3','4','5']);
    expect(data.diary[0].lines).toEqual(['# Diário','Tudo certo']);
    expect(data.elencoState).toBe('loaded');
    expect(JSON.stringify(data)).not.toContain('NÃO MOSTRAR');
  });
  it('recusa symlinks de arquivos e diretórios e não permite raiz redirecionada', async () => {
    const home = await fixture();
    const outside = await mkdtemp(join(tmpdir(),'habblaud-fora-'));
    await writeFile(join(outside,'codex_ultima.md'), 'NÃO LER');
    await symlink(join(outside,'codex_ultima.md'),join(home,'cgflix/handoffs/link.md'));
    await symlink(outside,join(home,'cgflix/gerente/codex_2026-11-08'));
    await symlink(join(outside,'codex_ultima.md'),join(home,'.habblaud/elenco.json'));
    const data = await createPanelReader(home)();
    expect(data.handoffs).toEqual([]);
    expect(data.codex).toEqual([]);
    expect(data.elencoState).toBe('invalid');
    expect(JSON.stringify(data)).not.toContain('NÃO LER');
  });
  it('degrada sem revelar exceções, arquivos grandes ou fontes ausentes', async () => {
    const home = await fixture();
    await writeFile(join(home,'cgflix/gerente/casos/diario/grande.md'), 'a'.repeat(300_000));
    const data = await createPanelReader(home)();
    expect(data.unavailable).toContain('diary');
    expect(data.elencoState).toBe('missing');
    expect(data.diary).toEqual([]);
  });
  it('mascara credenciais e textos longos antes da serialização', () => {
    for (const text of ['senha: abc', 'TOKEN=abc','Bearer abc', 'sk-1234567890', 'https://user:pass@host', 'a'.repeat(64)]) expect(safeLines(text).join()).not.toContain(text);
    expect(safeLines('Olá\nTudo bem')).toEqual(['Olá','Tudo bem']);
    expect(safeLines('x'.repeat(200).split('').join(' '))[0].length).toBe(180);
  });
  it('recusa parâmetros, métodos de escrita e rotas livres sem chamar leitor', async () => {
    const read = vi.fn(async () => ({ at: 1 } as never));
    const handle = createPanelHandler(read);
    const server = createServer((req,res) => { if (!handle(req,res,new URL(req.url!, 'http://localhost'))) { res.writeHead(404); res.end(); } });
    await new Promise<void>(r => server.listen(0,'127.0.0.1',r));
    closers.push(() => new Promise<void>(r => server.close(() => r())));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    for (const path of ['/api/painel?path=/etc/passwd','/api/painel?cmd=whoami','/api/painel?file=../../segredos']) expect((await fetch(base+path)).status).toBe(400);
    for (const method of ['POST','PUT','DELETE','PATCH']) expect((await fetch(base+'/api/painel',{method})).status).toBe(405);
    expect((await fetch(base+'/api/painel/qualquer.md')).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
    const result = await fetch(base+'/api/painel');
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.json()).toEqual({at:1});
    expect(read).toHaveBeenCalledTimes(1);
  });
});

it('recusa a raiz cgflix simbólica antes mesmo de listar nomes de handoffs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'habblaud-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'habblaud-root-fora-'));
  await mkdir(join(outside, 'handoffs'));
  await writeFile(join(outside, 'handoffs/NAO-EXIBIR.md'), 'fora');
  await symlink(outside, join(home, 'cgflix'));
  const data = await createPanelReader(home)();
  expect(data.handoffs).toEqual([]);
  expect(data.unavailable).toContain('handoffs');
  expect(JSON.stringify(data)).not.toContain('NAO-EXIBIR');
});
