---
paths:
  - "**/*.{js,jsx,ts,tsx}"
---

# Convenções JavaScript/TypeScript

`safe-javascript.md` e `safe-typescript.md` estabelecem uma postura de segurança (boundary,
vouching, strictness, loud failure), válida para qualquer projeto na linguagem, com ou sem
tipos. Este arquivo trata de outra coisa: escolhas de biblioteca e de estilo já tomadas para
não serem retomadas a cada sessão — qual lib resolve qual categoria de problema, o que nunca
deve ser reimplementado do zero, e quais convenções de lint carregam opinião além de
formatação pura. Aplica-se sempre que o projeto não tiver uma decisão própria e explícita que
contradiga o que está aqui; uma convenção de projeto mais específica prevalece sobre este
arquivo.

## Mapa de bibliotecas por categoria de problema

Antes de escrever uma função utilitária, validação, manipulação de data, chamada HTTP ou
lógica numérica do zero, considere se a categoria abaixo já resolve o problema.

| Categoria | Lib | Quando usar |
|---|---|---|
| Validação de boundary externo | `zod` | Body de request, resposta de API terceira, `JSON.parse`, query params, variável de ambiente, formulário de usuário — qualquer valor que cruzou um boundary de processo. |
| Dinheiro e decimais | `decimal.js` | Cálculo monetário, percentual composto, ou qualquer operação onde erro de ponto flutuante é inaceitável. `BigInt` nativo é alternativa aceitável quando o domínio permite representar o valor como inteiro (ex.: centavos). |
| Datas e horários | `Temporal` nativo (Node ≥26) ou `date-fns` (browser, enquanto `Temporal` não estabiliza em todos os browsers-alvo) | Qualquer aritmética de data. Criar/formatar um valor simples com `Date` nativo (`new Date().toISOString()`) é aceitável; aritmética manual com `Date` não é. |
| Utilitários funcionais (deep clone, debounce, groupBy) | `es-toolkit` | Só depois de descartar equivalente nativo: `structuredClone`, `Object.groupBy`, `Array.prototype.flatMap`, `?.`, `??`. |
| IDs únicos | `nanoid` | Padrão. Usar `uuid` só quando um sistema externo exige formato UUID especificamente. |
| Retry e concorrência assíncrona | `p-retry`, `p-limit`, `p-map` | Retry com backoff, limitar concorrência de N operações simultâneas, map assíncrono com concorrência controlada. Nunca reimplementar retry manual com `setTimeout` + contador. |
| Chamadas HTTP | `ky` | Wrapper fino sobre `fetch` nativo, funciona em Node ≥18 e em qualquer browser moderno. `fetch` puro é aceitável para requisição trivial sem retry, interceptor ou tratamento automático de status non-2xx. |
| Logging | `pino` | Nunca `console.log` em código que não seja descartável/debug temporário. |
| Variáveis de ambiente | `zod` + `znv` | Ver seção própria abaixo. |
| Testes | `vitest` | Sem exceção — não instalar `jest` em paralelo, nem em subpacote. |

## Bibliotecas banidas

Não importar, independente do contexto — mesmo como solução rápida ou temporária.

| Lib | Motivo | Usar no lugar |
|---|---|---|
| `moment`, `moment-timezone` | Descontinuada, mutável, bundle pesado | `date-fns` / `Temporal` |
| `bluebird` | Redundante com `Promise` nativo + `async`/`await` | nativo; `p-limit`/`p-map` para concorrência |
| `lodash`, `underscore` | Substituídas por alternativa mais moderna e leve | `es-toolkit` |
| `request` | Descontinuada desde 2020 | `fetch` nativo / `ky` |
| `axios` | Redundante com `fetch` + wrapper leve | `ky` |

Uma dessas libs aparecer como dependência transitiva (não import direto) é aceitável — a
proibição vale para import direto no código do projeto.

Antes de instalar qualquer dependência nova fora deste mapa, prefira uma com manutenção ativa
recente, zero ou poucas dependências transitivas, e suporte a ESM com tipagem própria (evitar
depender de `@types/*` desatualizado).

## Variáveis de ambiente

Toda leitura de `process.env` passa por um schema centralizado num único módulo — nunca
espalhada como `process.env.X` direto no código de negócio. O schema usa `zod` para a forma
de cada variável e `znv` para o parsing, falhando alto na inicialização do processo se uma
variável obrigatória estiver ausente ou malformada, em vez de deixar o valor inválido
propagar como `string | undefined` pelo resto do código.

## Convenções de lint com carga de opinião

Formatação (espaçamento, indentação, aspas) é jurisdição do Prettier — nenhuma dessas
convenções compete com isso. O que segue é opinião sobre estrutura e legibilidade, não
estética:

- Em TypeScript, import de tipo usa `import type`, separado do import de valor
  (`consistent-type-imports`) — deixa explícito no import o que existe só em tempo de
  compilação.
- Ordem de import agrupada por origem (builtin, external, internal, parent, sibling, index) e
  alfabetizada dentro de cada grupo — elimina bikeshedding sobre ordem manual e mantém diffs
  de import previsíveis.
- Nome de arquivo em `kebab-case`, sem exceção por tipo de arquivo.
- `console.log` é erro de lint fora de código descartável; `console.warn`/`console.error`
  são aceitáveis pontualmente, mas logging estruturado é `pino` (ver mapa de bibliotecas).
- Um `// eslint-disable` sem comentário explicando o motivo é tratado como se a regra
  nunca tivesse sido desligada — a justificativa faz parte do silenciamento, não é opcional.
- Limite de complexidade cognitiva e ciclomática por função (sonarjs) é sinal de que a
  função deveria ser quebrada, não de que o limite deveria subir. Uma função no limite é uma
  função para extrair, não para reconfigurar a regra.
