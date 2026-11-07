// Somente leitura. Lista branca fechada; nenhum caminho/comando vem do navegador.
import { constants } from 'node:fs';
import { open, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseElenco } from '../shared/elenco';
import type { PanelData, PanelFile } from '../shared/painel';
import { tr } from '../shared/i18n';

const MAX_BYTES = 8192;
// Se houver indício de credencial, omitir a linha inteira, inclusive a continuação.
export function safeLines(text: string): string[] {
  const lines = text.split(/\r?\n/).slice(0, 5);
  const risky = /segred|senha|password|passwd|token|api[_ -]?key|authorization|bearer|cookie|secret|credential|private.key|BEGIN .*KEY|sk-[\w-]+|gh[pousr]_|AIza|AKIA|eyJ[A-Za-z0-9_-]+\.|https?:\/\/[^\s]*[@?]|[A-Za-z0-9_+\/=-]{32,}/i;
  if (lines.some(line => risky.test(line))) return [tr('Prévia omitida por segurança.')];
  return lines.map(line => line.replace(/[\p{Cc}]/gu, '').slice(0, 180));
}
async function checkedRoot(root: string): Promise<string> {
  const canonical = await realpath(root);
  if (canonical !== join(await realpath(dirname(root)), basename(root))) throw new Error('symlink root');
  return canonical;
}
// Não seguir links nem permitir escape da raiz, inclusive por diretórios intermediários.
async function boundedRead(root: string, path: string): Promise<string> {
  const canonicalRoot = await checkedRoot(root);
  const expected = resolve(canonicalRoot, relative(root, path));
  const canonical = await realpath(path);
  if (!canonical.startsWith(canonicalRoot + sep) || canonical !== expected) throw new Error('outside allowlist');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = await handle.stat();
    if (!st.isFile() || st.size > 256 * 1024) throw new Error('not a small regular file');
    const buffer = Buffer.alloc(MAX_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAX_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}
async function files(root: string, directory: string, preview: boolean, limit: number): Promise<PanelFile[]> {
  if (await realpath(directory) !== resolve(await checkedRoot(root), relative(root, directory))) throw new Error('symlink directory');
  const names = (await readdir(directory, { withFileTypes: true })).filter(e => e.isFile() && /^[\p{L}\p{N}_. -]+\.md$/u.test(e.name)).slice(0, 2000);
  const entries = await Promise.all(names.map(async e => {
    const path = join(directory, e.name);
    const st = await stat(path);
    return { name: e.name, date: st.mtimeMs, path };
  }));
  entries.sort((a, b) => b.date - a.date || a.name.localeCompare(b.name));
  return Promise.all(entries.slice(0, limit).map(async ({ name, date, path }) => ({ name, date, ...(preview ? { lines: safeLines(await boundedRead(root, path)) } : {}) })));
}
async function processes(): Promise<PanelData['processes']> {
  let sessions = 0, threads = 0, available = false;
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const st = await stat(`/proc/${name}`);
      if (st.uid !== process.getuid?.()) continue;
      const text = await boundedRead('/proc', `/proc/${name}/stat`);
      const end = text.lastIndexOf(')');
      const comm = text.slice(text.indexOf('(') + 1, end);
      const fields = text.slice(end + 2).split(' ');
      threads += Number(fields[17]) || 0;
      if (/^(claude|codex|gemini|agy)$/.test(comm)) sessions++;
      available = true;
    } catch { /* processo encerrou durante a leitura */ }
  }
  return { sessions, threads, available };
}
export function createPanelReader(home = homedir(), elencoDir = join(home, '.habblaud')): () => Promise<PanelData> {
  const root = join(home, 'cgflix');
  let cached: Promise<PanelData> | undefined, until = 0;
  return () => {
    if (cached && Date.now() < until) return cached;
    until = Date.now() + 15_000;
    cached = (async () => {
      const data: PanelData = { at: Date.now(), processes: { sessions: 0, threads: 0, available: false }, handoffs: [], codex: [], diary: [], elenco: [], elencoState: 'missing', unavailable: [] };
      await Promise.all([
        (async () => { try { data.handoffs = await files(root, join(root, 'handoffs'), false, 5); } catch { data.unavailable.push('handoffs'); } })(),
        (async () => { try { data.diary = await files(root, join(root, 'gerente/casos/diario'), true, 1); } catch { data.unavailable.push('diary'); } })(),
        (async () => { try {
          const directory = join(root, 'gerente');
          if (await realpath(directory) !== join(await checkedRoot(root), 'gerente')) throw new Error('symlink');
          const dirs = (await readdir(directory, { withFileTypes: true })).filter(e => e.isDirectory() && /^codex_[\d-]+$/.test(e.name)).slice(0, 120);
          const found = await Promise.all(dirs.map(async d => {
            const path = join(directory, d.name, 'codex_ultima.md');
            try { const date = (await stat(path)).mtimeMs; return { name: `${d.name}/codex_ultima.md`, date, path }; } catch { return null; }
          }));
          const latest = found.filter(e => e !== null).sort((a,b) => b.date - a.date).slice(0,3);
          data.codex = await Promise.all(latest.map(async e => ({ name: e.name, date: e.date, lines: safeLines(await boundedRead(root, e.path)) })));
        } catch { data.unavailable.push('codex'); } })(),
        (async () => { try { data.processes = await processes(); } catch { data.unavailable.push('processes'); } })(),
        (async () => { try {
          const text = await boundedRead(elencoDir, join(elencoDir, 'elenco.json'));
          const raw: unknown = JSON.parse(text);
          data.elenco = parseElenco(raw);
          data.elencoState = Array.isArray(raw) && (raw.length === 0 || data.elenco.length > 0) ? 'loaded' : 'invalid';
        } catch (error) { data.elencoState = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid'; } })(),
      ]);
      return data;
    })();
    return cached;
  };
}
export function createPanelHandler(read = createPanelReader()) {
  return (req: IncomingMessage, res: ServerResponse, url: URL): boolean => {
    if (url.pathname !== '/api/painel') return false;
    const send = (code: number, value: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); send(405, { error: tr('Somente leitura.') }); return true; }
    if (url.search) { send(400, { error: tr('O Painel não aceita parâmetros.') }); return true; }
    void read().then(data => send(200, data), () => send(503, { error: tr('Painel indisponível.') }));
    return true;
  };
}
