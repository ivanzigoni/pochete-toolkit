<img src="pochete.png" alt="pochete-toolkit" width="120" />

# pochete-toolkit

[![Última release](https://img.shields.io/github/v/release/ivanzigoni/pochete-toolkit)](https://github.com/ivanzigoni/pochete-toolkit/releases)
[![Licença](https://img.shields.io/github/license/ivanzigoni/pochete-toolkit)](LICENSE)
[![Status do workflow de tag](https://img.shields.io/github/actions/workflow/status/ivanzigoni/pochete-toolkit/tag.yml)](https://github.com/ivanzigoni/pochete-toolkit/actions/workflows/tag.yml)
[![Data da última release](https://img.shields.io/github/release-date/ivanzigoni/pochete-toolkit)](https://github.com/ivanzigoni/pochete-toolkit/releases)

A pochete-toolkit é uma biblioteca (quase) não opinativa, criada para quem pratica codificação
agêntica com o Claude Code. Ela não impõe como você organiza seu conhecimento, seus processos ou
seu jeito de trabalhar. Em vez disso, oferece uma estrutura generalista que apoia em duas frentes:
ferramentas que ampliam as capacidades do humano e do agente, e contenções mecânicas que bloqueiam
comportamentos indesejados.

## Visibilidade de ponta a ponta

Com a pochete-toolkit, você e seu agente ganham visibilidade sobre:

- Frontend
  - Código-fonte.
  - Runtime, via Playwright.
- Backend
  - Código-fonte.
  - Runtime, via portainer-logs e logs locais, através do scratchpad.
- Banco de dados
  - Código-fonte (schema, entidades etc.).
  - Runtime, via safe-query, com consulta segura e anonimizada conforme a Lei Geral de Proteção de
    Dados (LGPD).

## Ferramentas

A pochete-toolkit dá ao agente capacidades adicionais: mais fontes de contexto para as tarefas
que ele executa, diretamente ou delegadas a um subagente. Grande parte desse contexto vem de
fontes externas ao código-fonte e complementa a decisão tanto do agente quanto do humano, durante a tarefa.

| Ferramenta | O que faz |
|---|---|
| `bitbucket-open-pr` | Abre um pull request no Bitbucket. |
| `delegate-reasoning` | Expõe modelos de linguagem externos via HTTP, indicado para economia de tokens e paralelização de tarefas. |
| `jira-add-comment` | Adiciona um comentário a um issue no Jira Cloud. |
| `jira-create-issue` | Cria um issue no Jira Cloud. |
| `jira-get-issue` | Lê os dados de um issue no Jira Cloud. |
| `jira-search-issues` | Busca issues no Jira Cloud a partir de uma consulta JQL. |
| `portainer-get-container-logs` | Obtém logs em tempo real de containers de serviços no Portainer, para diagnóstico de problemas em produção e testes E2E. |
| `railway-safe-cli` | Executa comandos allowlisted da Railway CLI, localmente instalada, injetando token e projeto/ambiente sem exigir `railway login`. |
| `safe-curl` | Executa requisições curl autenticadas. |
| `safe-query` | Executa consultas SQL somente leitura, com uma camada de redação de dados sensíveis conforme a LGPD. |

## Instalação

### Onde colocar os projetos

Clone cada repositório de aplicação dentro do diretório `project/`, um por subdiretório — por
exemplo, `project/meu-servico/`. Esse diretório fica fora do controle de versão deste repositório
(veja `.gitignore`): a pochete-toolkit distribui só o workspace do agente, não o código das suas
aplicações.

Se o seu projeto tiver vários repositórios, clone todos dentro de `project/`, lado a lado. Veja
"Projetos com vários repositórios", abaixo, para como o agente acumula conhecimento de domínio
entre eles.

### Instalar o RTK

O RTK (rtk-ai/rtk) reduz o volume de tokens gasto pelo agente ao filtrar e compactar a saída de
comandos executados no terminal. O hook que ativa esse comportamento e os filtros do projeto já
vêm versionados neste repositório — falta só instalar o binário na sua máquina.

Siga as instruções de instalação em [github.com/rtk-ai/rtk](https://github.com/rtk-ai/rtk).

Confirme a instalação com `rtk --version`. Não é preciso rodar nenhum comando de configuração
adicional: assim que o binário estiver no PATH, o Claude Code passa a usar o RTK automaticamente
nas próximas sessões abertas neste repositório.

### Instalar o CodeGraph

O CodeGraph (colbymchenry/codegraph) mantém, por projeto, um grafo de conhecimento em SQLite dos
símbolos, arestas e arquivos do código-fonte, exposto ao agente pela tool `codegraph_explore`. O
registro do servidor MCP e as permissões que o tornam padrão (sem prompt de confirmação a cada
chamada) já vêm versionados neste repositório, em `.mcp.json` e `.claude/settings.json` — falta só
instalar o binário e inicializar o índice em cada repositório de aplicação.

Siga as instruções de instalação em
[github.com/colbymchenry/codegraph](https://github.com/colbymchenry/codegraph).

Confirme a instalação com `codegraph --version`. Não rode `codegraph install`: esse comando serve
para cadastrar o servidor MCP no agente, e aqui esse cadastro já está versionado em `.mcp.json` e
`.claude/settings.json`.

Depois de clonar cada repositório de aplicação dentro de `project/` (veja "Onde colocar os
projetos", acima), rode `codegraph init` na raiz de cada um deles para construir o índice inicial.
Esse índice fica em `.codegraph/`, local a cada máquina — o próprio `codegraph init` já grava ali
dentro um `.gitignore` que impede o commit do índice, então não é preciso (nem esperado) editar o
`.gitignore` de cada repositório de aplicação por causa disso.

### Instalar a Railway CLI

A tool `railway-safe-cli` executa o binário real da [Railway CLI](https://docs.railway.com/guides/cli),
instalado localmente por você, nunca autenticado via `railway login` — o token de cada projeto
fica num `.env` próprio da tool e é injetado por chamada. Todo comando nasce bloqueado: um hook
dedicado impede o agente de invocar `railway` fora dessa tool, e um segundo arquivo decide quais
subcomandos estão liberados nesta sessão.

Siga as instruções de instalação em [docs.railway.com/guides/cli](https://docs.railway.com/guides/cli).
Confirme a instalação com `railway --version` no seu próprio terminal — não peça para o agente
confirmar por você, o hook bloqueia esse tipo de invocação de propósito.

Depois, em `.claude/mcp/local/src/tools/railway-safe-cli/`, copie os três arquivos de exemplo para
os seus equivalentes reais (gitignorados) e preencha à mão: `.env.example` → `.env` (token por
projeto), `auth-profiles.example.json` → `auth-profiles.json` (projeto/ambiente por profile) e
`command-allowlist.example.json` → `command-allowlist.json` (subcomandos liberados — nasce vazio).

## Projetos com vários repositórios

A pochete-toolkit funciona bem em projetos com vários repositórios. Você acumula conhecimento de
domínio em `.claude/rules/user/` ao longo do tempo, o que melhora a precisão do agente.

## Extensões de domínio

A pochete-toolkit distribui suas próprias skills e rules com prefixo `pctk__` e suas próprias
conventions com prefixo `pctk__agent-` (versionadas, mantidas pelo framework). Você pode criar as
três coisas com conteúdo específico do domínio de negócio do seu workspace, usando prefixo
`user__` — path exato, mecanismo de descoberta e passo a passo para conventions em
`.claude/rules/default/pctk__agent-user-extensions.md`.

Tudo isso fica automaticamente fora do controle de versão deste repositório (veja `.gitignore`),
sem nenhuma configuração adicional.

## Fluxo de trabalho

O fluxo de trabalho usa a estrutura de diretórios com prefixo `_`, dentro de `.claude`.

## Segurança

A pochete-toolkit segue os princípios da filosofia zero trust: aplica opt-in por meio de allowlists para a navegação entre diretórios, os comandos de git permitidos, e a execução de CLIs externas fora da tool que as encapsula (ex.: a Railway CLI, só via `railway-safe-cli`).

A pochete-toolkit bloqueia comportamentos indesejados de forma mecânica. O agente não consegue ler arquivos .env, chaves de API, arquivos de credenciais e senhas, nem outros artefatos sensíveis relacionados à autenticação.

## Licença

Distribuído sob a licença Apache 2.0. Veja [LICENSE](LICENSE).
