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
| `portainer-get-container-logs` | Obtém logs em tempo real de containers de serviços no Portainer, para diagnóstico de problemas em produção e testes E2E. |
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

Escolha um dos métodos oficiais:

- Instalação rápida (Linux/macOS): `curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh`
- Homebrew (macOS/Linux): `brew install rtk-ai/tap/rtk`
- Cargo, se você já tem o toolchain Rust: `cargo install --git https://github.com/rtk-ai/rtk --branch master rtk`

Confirme a instalação com `rtk --version`. Não é preciso rodar nenhum comando de configuração
adicional: assim que o binário estiver no PATH, o Claude Code passa a usar o RTK automaticamente
nas próximas sessões abertas neste repositório.

## Projetos com vários repositórios

A pochete-toolkit funciona bem em projetos com vários repositórios. Você acumula conhecimento de
domínio em `DICTIONARY.md` ao longo do tempo, o que melhora a precisão do agente.

## Fluxo de trabalho

O fluxo de trabalho usa a estrutura de diretórios com prefixo `_`, dentro de `.claude`.

## Segurança

A pochete-toolkit segue os princípios da filosofia zero trust: aplica opt-in por meio de allowlists tanto para a navegação entre diretórios quanto para os comandos de git permitidos.

A pochete-toolkit bloqueia comportamentos indesejados de forma mecânica. O agente não consegue ler arquivos .env, chaves de API, arquivos de credenciais e senhas, nem outros artefatos sensíveis relacionados à autenticação.

## Licença

Distribuído sob a licença Apache 2.0. Veja [LICENSE](LICENSE).
