<img src="pochete.png" alt="pochete-toolkit" width="120" />

# pochete-toolkit

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

## Segurança

A pochete-toolkit segue os princípios da filosofia zero trust: aplica opt-in por meio de allowlists tanto para a navegação entre diretórios quanto para os comandos de git permitidos.

A pochete-toolkit bloqueia comportamentos indesejados de forma mecânica. O agente não consegue ler arquivos .env, chaves de API, arquivos de credenciais e senhas, nem outros artefatos sensíveis relacionados à autenticação.

## Projetos com vários repositórios

A pochete-toolkit funciona bem em projetos com vários repositórios. Você acumula conhecimento de
domínio em `DICTIONARY.md` ao longo do tempo, o que melhora a precisão do agente.

## Fluxo de trabalho

O fluxo de trabalho usa a estrutura de diretórios com prefixo `_`, dentro de `.claude`.

## Versionamento

A pochete-toolkit segue [Semantic Versioning](https://semver.org/lang/pt-BR/). As tags são
criadas automaticamente a partir da `main`, via
[.github/workflows/tag.yml](.github/workflows/tag.yml), com o tipo de bump calculado a partir dos
conventional commits desde a última tag.

## Licença

Distribuído sob a licença Apache 2.0. Veja [LICENSE](LICENSE).
