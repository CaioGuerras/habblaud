# Painel local do CGSERVER

A aba **Painel** é somente leitura. A troca entre cinza-lilás e verde claro fica no cabeçalho dela e vale para a interface inteira. As salas usam os tokens das duas paletas em `client/src/art/heisuca.ts`; a interface usa os tokens em `client/src/ui/painel.css`.

## Elenco e placas

O arquivo padrão é `~/.habblaud/elenco.json`. Com `HABBLAUD_DATA_DIR`, o arquivo fica nesse diretório de estado, permitindo testar sem alterar a configuração real. `elenco.example.json` contém oito personagens de exemplo e suas peças em pixel art; os nomes de conta são exemplos e devem ser conferidos com as contas reais do Habblaud.

Cada entrada tem `name`, `account`, `look` e, opcionalmente, `sessionId`, `front` e `parts`. `account` corresponde exatamente a `AgentInfo.account`, e `sessionId` a `AgentInfo.sessionId`. Não é caminho nem comando. Em uma conta com várias sessões principais vivas, `sessionId` é obrigatório para um vínculo inequívoco. Duas entradas da mesma conta precisam de sessões distintas. Uma configuração inválida é recusada inteira e aparece como inválida no Painel.

`front`, até 48 caracteres, aparece na placa da mesa; sem ele, usa-se o título da sessão. O nome e a aparência são aplicados apenas no navegador, sobre uma sessão principal real. O cadastro de uma pessoa não cria agente, sala, atividade ou contagem: sem uma sessão real identificável, o personagem fica somente no cartão do elenco, sem vínculo. A configuração é relida pelo servidor com cache de 15 segundos, quando o navegador consulta o Painel. Reabra a aba para atualizar a configuração após editá-la.

O Habblaud continua com as fontes reais que já possui (Claude e Codex). O cadastro de Stark, Banner e Shuri não implementa uma fonte Gemini nem finge que ela existe. Nenhuma personalização local foi adicionada à projeção enviada ao Habblaud World.

## Fontes e segurança

O único endpoint novo é `GET /api/painel`, sem parâmetros. Outros métodos retornam 405; qualquer query retorna 400. A porta remota com login do Habblaud não disponibiliza a rota. A guarda existente de Host/Origin continua sendo aplicada antes dela.

As fontes são fechadas no servidor:

- `~/cgflix/handoffs/`: até cinco arquivos `.md` mais novos por mtime, somente nome e data; sem corpo.
- `~/cgflix/gerente/codex_AAAA-MM-DD/codex_ultima.md`: até três registros recentes, cinco primeiras linhas.
- `~/cgflix/gerente/casos/diario/`: o `.md` mais novo, cinco primeiras linhas.
- `/proc/<pid>/stat`: contagem de processos com nome exato `claude`, `codex`, `gemini` ou `agy` e de threads, pertencentes ao mesmo UID do servidor. Não lê `cmdline`, ambiente nem credenciais. Wrappers com outro nome não entram na contagem de processos de IA. Em um namespace isolado, conta apenas os processos visíveis ao servidor, como os rótulos informam; não é o total do host.
- `elenco.json` no diretório de estado local, descrito acima.

Não chama `cgf-vaga`: a versão instalada não tem modo `status`. Não chama `cgmind saldo`: consulta adiada para evitar custo ou rede. Não há shell nem execução de comandos no Painel. Nomes vindos dos diretórios são filtrados; raízes e diretórios simbólicos são recusados; arquivos são abertos com `O_NOFOLLOW`. Leituras são limitadas a 8 KiB, arquivos grandes são recusados e cada linha exibida tem no máximo 180 caracteres. Uma prévia com indício de credencial é omitida inteira. Respostas usam `no-store`; erros não retornam conteúdo nem caminhos internos. O filtro é conservador e não substitui manter os arquivos operacionais sem segredos.

## Teste isolado

Não rodar `npm run build` enquanto `dist/` serve a produção. Usar:

```sh
npm run typecheck
TZ=UTC bash -c 'umask 022; npm test -- --maxWorkers=2'
npm run i18n:check
npm run build:test
```

O fuso e a umask explícitos são necessários nesta bancada: o ambiente herdado tem `TZ` em formato de caminho e umask 027; testes existentes esperam um identificador IANA e arquivos 0644. Dois workers evitam uma explosão de threads no servidor compartilhado. O teste sazonal de World agora fixa o tema inicial antes de testar a mudança para Natal, inclusive em novembro/dezembro.

A build de teste escreve somente em `dist-teste/`, não limpa saídas anteriores e identifica seu próprio cliente e carimbo de build, separados de `dist/`. Se a porta 18095 estiver livre:

```sh
HABBLAUD_HOST=127.0.0.1 HABBLAUD_PORT=18095 \
HABBLAUD_DATA_DIR="$PWD/dist-teste/state" \
HABBLAUD_WORLD=0 HABBLAUD_UPDATE_CHECK=0 HABBLAUD_TERMINAL=0 \
HABBLAUD_MENSAGENS=0 HABBLAUD_PTY=0 HABBLAUD_TIMELINE=0 \
node dist-teste/server/index.js
```

O diretório `dist-teste/state/` guarda exclusivamente o estado da cópia de teste. Não sobrescrever o `elenco.json` real com o exemplo sem conferir os vínculos.

`scripts/painel-shots.mjs` usa Playwright já presente, aceita `HABBLAUD_CHROMIUM` e `HABBLAUD_SHOTS_DIR` e bloqueia pedidos externos do navegador. Captura Painel nos dois temas, início e detalhes, a 1440 e 412 px, e escritório em demonstração para preservar conversas privadas. Verifica oito cartões de elenco, ausência de transbordamento/erros JS e contraste AA dos novos botões com as cores efetivamente renderizadas. Não instala nem baixa navegadores.
