import { tr } from '../../../shared/i18n';
import { elencoAgent } from '../../../shared/elenco';
import type { PanelData, PanelFile } from '../../../shared/painel';
import type { OfficeStore } from '../net/store';
import { h } from './dom';
import { createAvatar } from './avatar';

export function mountPanel(root: HTMLElement, group: HTMLElement, store: OfficeStore): void {
  let data: PanelData | null = null;
  let busy = false;
  let generation = 0;
  const body = h('div', { class: 'cg-panel__body' });
  const status = h('p', { role: 'status', attrs: { 'aria-live': 'polite' } });
  const actions = h('div', { class: 'cg-panel__actions' });
  const panel = h('section', { class: 'cg-panel', hidden: true, role: 'region', attrs: { id: 'cg-panel', 'aria-label': tr('Painel') } },
    h('header', {}, h('div', {}, h('h1', { text: tr('Painel') }), h('p', { text: tr('O escritório em um olhar. Somente leitura.') })),
      actions), status, body);
  actions.append(h('button', { type: 'button', class: 'ui-btn', text: tr('Voltar ao escritório'), on: { click: () => toggle(false) } }));
  const button = h('button', { type: 'button', class: 'ui-btn cg-panel-button', text: tr('Painel'), attrs: { 'aria-expanded': 'false', 'aria-controls': 'cg-panel' }, on: { click: () => toggle(panel.hidden !== false) } });
  function toggle(open: boolean) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) { void refresh(); panel.querySelector('button')?.focus(); }
    else button.focus();
  }
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); toggle(false); } });
  group.prepend(button);
  root.append(panel);
  const theme = h('button', { type: 'button', class: 'ui-btn cg-theme-button', text: tr('Verde claro'), attrs: { 'aria-pressed': 'false' }, on: { click: () => {
    const light = document.documentElement.dataset.cgTheme !== 'hisui';
    document.documentElement.dataset.cgTheme = light ? 'hisui' : 'shikkoku';
    theme.textContent = light ? tr('Cinza-lilás') : tr('Verde claro');
    theme.setAttribute('aria-pressed', String(light));
    try { localStorage.setItem('habblaud.cg-theme', light ? 'hisui' : 'shikkoku'); } catch { /* preferências indisponíveis */ }
  } } });
  try { if (localStorage.getItem('habblaud.cg-theme') === 'hisui') theme.click(); } catch { /* preferências indisponíveis */ }
  actions.prepend(theme);
  const formatDate = (date: number) => new Date(date).toLocaleString(document.documentElement.lang);
  function card(title: string, entries: PanelFile[]): HTMLElement {
    return h('article', { class: 'cg-card' }, h('h2', { text: title }), ...(!entries.length ? [h('p', { class: 'cg-muted', text: tr('Nenhum registro disponível.') })] : entries.map(file => h('div', { class: 'cg-file' },
      h('strong', { text: file.name }), h('time', { text: formatDate(file.date), attrs: { datetime: new Date(file.date).toISOString() } }),
      ...(file.lines ? [h('pre', { text: file.lines.join('\n') })] : [])))));
  }
  function render() {
    if (!data) return;
    const snap = store.liveSnapshot;
    const real = store.mock ? [] : snap?.agents.filter(a => a.kind === 'main' && !['offline','done'].includes(a.status)) ?? [];
    const roster = h('article', { class: 'cg-card cg-roster' }, h('h2', { text: tr('Elenco') }));
    if (data.elencoState !== 'loaded') roster.append(h('p', { class: 'cg-muted', text: data.elencoState === 'missing' ? tr('Elenco ainda não configurado.') : tr('Configuração do elenco inválida.') }));
    for (const entry of data.elenco) {
      const agent = elencoAgent(entry, real);
      roster.append(h('div', { class: 'cg-person' }, createAvatar({ ...entry, kind: 'main' }, 'md'),
        h('div', {}, h('strong', { text: entry.name }), h('p', { class: 'cg-muted', text: agent ? entry.front || agent.title || tr('Sessão vinculada') : tr('Sem sessão vinculada') })),
        h('span', { class: agent ? 'cg-person__live' : 'cg-muted', text: agent ? tr('Presente') : tr('Ausente') })));
    }
    body.replaceChildren(
      h('div', { class: 'cg-summary' },
        h('article', { class: 'cg-card' }, h('strong', { text: String(real.length) }), h('p', { text: tr('Sessões no escritório') })),
        h('article', { class: 'cg-card' }, h('strong', { text: data.processes.available ? String(data.processes.sessions) : '—' }), h('p', { text: tr('Processos de IA visíveis') })),
        h('article', { class: 'cg-card' }, h('strong', { text: data.processes.available ? String(data.processes.threads) : '—' }), h('p', { text: tr('Threads visíveis no /proc') }))),
      h('div', { class: 'cg-grid' }, roster, card(tr('Handoffs recentes'), data.handoffs), card(tr('Tarefas do Codex'), data.codex), card(tr('Diário do gerente'), data.diary),
        h('article', { class: 'cg-card' }, h('h2', { text: tr('Saldo do cgmind') }), h('p', { class: 'cg-muted', text: tr('Consulta adiada para evitar custo ou acesso externo.') }))));
    status.textContent = tr('Atualizado em {0}', [formatDate(data.at)]) + (data.unavailable.length ? ' · ' + tr('Algumas fontes estão indisponíveis.') : '');
  }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    const current = ++generation;
    try {
      const response = await fetch('/api/painel', { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!response.ok) throw new Error();
      const next = await response.json() as PanelData;
      if (current !== generation) return;
      data = next;
      if (!store.mock) store.setElenco(data.elenco);
      render();
    } catch { status.textContent = tr('Painel indisponível. Tentando novamente em instantes.'); }
    finally { busy = false; }
  }
  store.on('snapshot', () => { if (!panel.hidden) render(); });
  // A primeira consulta carrega os avatares; depois atualiza somente a aba visível.
  void refresh();
  setInterval(() => { if (!panel.hidden) void refresh(); }, 15_000);
}
