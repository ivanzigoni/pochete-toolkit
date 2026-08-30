---
name: pctk__workflow__diagnostico
description: "Conduz um diagnóstico abrangente (técnico e de negócio) a partir de informações de um problema fornecidas pelo humano — mensagem de erro, payload, print de conversa com contexto de negócio, comando curl reproduzindo a falha, ou qualquer combinação dessas fontes. Usa código-fonte (Read/Grep/Glob/codegraph_explore), portainer-get-container-logs, safe-query e safe-curl para investigar e confirmar hipóteses, mas nunca propõe solução de implementação — entrega só o entendimento do que está acontecendo (causa técnica, fluxo de negócio afetado, evidências coletadas, lacunas em aberto), para alinhar contexto antes de qualquer decisão sobre correção. safe-curl fica restrito a chamadas de leitura/idempotentes; nunca reproduz a chamada mutante que causou o problema. Manual only — invoca só quando chamado explicitamente pelo nome (ex.: 'roda o pctk__workflow__diagnostico nisso', 'usa a skill de diagnóstico aqui'), nunca por correspondência automática de descrição."
disable-model-invocation: true
---

Conduz um diagnóstico técnico e de negócio a partir de informações de um problema fornecidas pelo
humano, usando código-fonte, `portainer-get-container-logs`, `safe-query` e `safe-curl`. **Esta skill nunca
propõe correção, patch, ou próximo passo de implementação** — qualquer rascunho de solução que
surgir durante a investigação fica fora do relatório final. Essa é a regra que mais separa esta
skill de um fluxo normal de bugfix, e vale para toda a investigação, não só para o relatório.

**Teste operacional da fronteira diagnóstico/solução:** se uma frase do rascunho do relatório
começa com verbo no imperativo apontando para ação futura no sistema ("alterar", "adicionar",
"corrigir", "rodar", "criar"), é solução e sai do relatório. Descrever o que está errado — mesmo
com relação causal explícita ("a tabela X está vazia porque a migração Y não populou os dados") —
continua sendo diagnóstico legítimo, desde que a frase não recomende uma ação.

## Insumo

Qualquer informação de um problema conta como insumo: mensagem de erro, payload JSON, print de
conversa (descrito em texto ou colado como imagem), comando `curl` de reprodução, narrativa livre,
ou qualquer combinação dessas fontes. Nunca pedir um formato específico; tratar o que foi dado como
fato de partida.

**Perguntar vs. registrar lacuna.** Só pára e pergunta ao humano quando falta algo que impede
*começar* a investigação — qual ambiente (ver "Ambiente" abaixo), qual repositório/serviço, ou o
próprio sintoma incompreensível. Uma lacuna descoberta *durante* a investigação (uma hipótese que
não dá para confirmar, um log inconclusivo) nunca pára o fluxo — vai para "Lacunas em aberto" no
relatório final.

**Escopo de repositório.** Este workspace tem 11 repositórios. Esta skill não usa nenhum mapa
hardcoded de palavras-chave por repositório — o repositório/serviço a investigar é derivado do
próprio insumo (path de URL, ex. `.../cem-billing-service/...`; nome de serviço citado; stack
trace). Só pergunta ao humano qual repositório quando o insumo não deixa isso claro; nunca faz grep
cego nos 11 repositórios como default.

## Investigação

1. **Código-fonte primeiro.** `codegraph_explore` quando o projeto tiver `.codegraph/`; senão
   `Grep`/`Glob`/`Read`. Localiza o trecho relevante ao problema antes de qualquer checagem ao
   vivo.

2. **`portainer-get-container-logs`**, com critério concreto de quando usar: consultar quando o insumo tiver
   stack trace, exceção não tratada, timeout, ou resposta 5xx/erro genérico. Pular quando o erro já
   é uma rejeição de regra de negócio bem identificada (4xx com `messageCode`/mensagem própria
   explicando o motivo) — nesse caso a causa já está na lógica de aplicação, não numa falha de
   runtime.

3. **`safe-query`/`safe-curl`** para confirmar ou refutar hipóteses contra dado ao vivo, só quando
   a leitura estática deixa algo ambíguo — nunca como primeiro passo, nunca substituindo a leitura
   de código. Live check nunca via conexão de banco crua ou `curl` bruto — só pelas duas tools MCP.

4. **`safe-curl` restrito a leitura/idempotência.** Nunca reproduz a chamada mutante original
   (POST/PUT/DELETE) que causou o problema, contra nenhum ambiente — isso já é uma ação com efeito
   colateral real, não diagnóstico passivo. Quando confirmar a hipótese exigiria reproduzir essa
   chamada, a skill não executa: registra como lacuna em aberto ("não foi possível reproduzir sem
   mutar dado real") em vez de decidir sozinha que vale a pena.

5. **Condição de parada.** A investigação termina quando (a) uma hipótese de causa foi confirmada
   por verificação ao vivo, ou (b) todas as vias abertas pelo insumo e pela leitura estática já
   foram checadas sem confirmação total. No caso (b), o relatório sai com a hipótese mais
   sustentada e as lacunas explícitas — nunca em loop tentando alcançar certeza total.

## Ambiente (dev/prd)

Antes da primeira chamada a `safe-query` ou `safe-curl` na run — e só nessa primeira chamada —
confirmar qual ambiente usar. Produção é permitida sem bloqueio, mas nunca é o default silencioso.

**Exceção:** se o insumo já nomeia o ambiente explicitamente (a palavra "produção"/"prd"/
"homologação"/"hml", ou um nome de connection profile como `cemiterio_prd`), isso já conta como
confirmação — não pergunta de novo. A confirmação só é obrigatória quando o insumo deixa o
ambiente implícito ou ambíguo (ex.: só uma URL, sem palavra explícita — o domínio de uma URL não é
garantia de qual ambiente/engine está por trás dela, e não deve ser tratado como confirmação).

## Formato do relatório

```markdown
## Diagnóstico — sem proposta de solução

### Resumo
<1-2 frases: o que está acontecendo, em termos que um não-técnico entende>

### Contexto de negócio
<fluxo/operação afetada, quem é impactado, por que isso importa>

### Evidências coletadas
- 📄 <trecho de código, file:line, o que ele mostra>
- 🔎 <resultado ao vivo de safe-query/safe-curl/portainer-get-container-logs, marcado como verificado>

### Hipótese(s) de causa
- <hipótese, com rótulo de confiança: confirmada / provável / especulativa>

### Lacunas em aberto
- ⚠️ [????] <o que não foi possível confirmar e por quê>
```

Uma hipótese sem verificação ao vivo nunca aparece como "confirmada" — a distinção de confiança é
obrigatória em cada item, não decorativa.

## Non-negotiables

- Nunca propor solução, patch, ou próximo passo de implementação (ver teste operacional acima).
- `safe-query`/`safe-curl`/`portainer-get-container-logs` são o único caminho para checagem ao vivo — nunca
  conexão crua ou curl bruto.
- `safe-curl` só para chamadas de leitura/idempotentes. Nunca reproduz a chamada mutante original
  que causou o problema — vira lacuna em aberto, não uma execução.
- Ambiente é sempre confirmado explicitamente antes da primeira checagem ao vivo, exceto quando o
  próprio insumo já o nomeia.
- Só pára para perguntar ao humano quando falta algo que impede começar a investigação; lacunas
  descobertas durante a investigação vão para o relatório, nunca travam o fluxo.
- Toda afirmação no relatório é marcada como código-fonte, dado ao vivo, ou hipótese — nunca
  misturado sem rótulo.

## Out of scope

- Propor correção, patch, ou plano de implementação — em nenhuma circunstância.
- Persistência do relatório em arquivo/archive — o relatório vive só na conversa.
- Dependência de `cartografo` ou de qualquer `references/` externo a este arquivo.
