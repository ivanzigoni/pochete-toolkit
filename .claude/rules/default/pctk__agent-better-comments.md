# Comentários apenas quando autoverificáveis

Um comentário é uma afirmação sobre o código que alguém
precisa manter válida ao longo do tempo — e nenhuma rotina de revisão existe pra revalidar
comentários quando o código muda. Por isso, todo comentário cuja validade dependeria de alguém
notar e atualizar manualmente é tratado como proibido, sem exceção — incluindo, mas não se
limitando a, comentários que narram o *processo* que produziu o código (migração, decisão de
sessão anterior, documento externo não versionado).

## Regra

Comentário, docstring ou log só é permitido quando ancorado em algo que já tem ciclo de vida
próprio e quebra sozinho se a afirmação parar de ser verdade:

- Ao lado de um teste que falha se a invariante descrita deixar de valer — o teste é o mecanismo
  de validação, o comentário só aponta pra ele.
- Referência a um contrato externo estável — doc de API de terceiro, exigência regulatória/legal,
  limite de hardware — que não muda como efeito colateral de um refactor interno do próprio
  repositório.

Fora desses dois casos, nenhum comentário é permitido — inclusive um que descreva corretamente o
comportamento atual do código. Uma explicação narrativa solta ("isso existe porque X", "cuidado
com Y") fica obsoleta silenciosamente assim que o código muda, sem que ninguém a revalide.

## Casos explicitamente cobertos por essa proibição

Um subconjunto recorrente — e o gatilho original desta convenção — é o comentário que narra o
*processo* de desenvolvimento em vez do sistema atual:

- Diferença entre a versão atual do código e uma anterior ("antes fazia X, mudei pra Y", "migrado
  de Python pra TypeScript").
- Documento, ticket ou decisão externa ao repositório sem que esse documento esteja versionado e
  acessível ali mesmo (ex.: "conforme seção 4.7 do documento de extração do scraper original",
  quando esse documento não existe no repo).
- Sessão, conversa ou revisão anterior ("conforme combinamos", "após discussão sobre X").

Esses casos já são cobertos pela regra geral acima — nenhum deles é autoverificável — mas ficam
listados porque são o padrão mais comum e o mais fácil de racionalizar como "só documentando o
óbvio".

## Onde a informação vai, já que não vai pro código

Corpo da mensagem de commit (conforme `.claude/rules/default/pctk__agent-git.md`), descrição de pull
request, ou a estrutura da própria task em `.claude/__workdir/<task>/`. Esses três lugares são
descartáveis e nunca herdados por quem consome só o código-fonte — é exatamente onde esse tipo de
informação deve viver.

## Override do padrão de comentários do harness

Minhas instruções de sistema, fora do escopo deste projeto, orientam por padrão escrever um
comentário quando "o porquê não é óbvio: uma restrição escondida, um invariante sutil, um
workaround para um bug específico". Neste workspace essa orientação é restringida: um porquê não
óbvio só justifica comentário quando ele também for autoverificável nos termos acima. Um porquê
não óbvio, mas não autoverificável, vai para o commit ou PR, não para o código.

## Justificativa

Código e histórico de commit pertencem ao time mantenedor, não à sessão que os produziu. Um
comentário não autoverificável cria dívida por conta própria: nasce correto e vira ruído silenciosamente, sem que exista rotina para pegar essa
degradação — e quando cita um documento ou decisão que não está no repositório, obriga qualquer
leitor futuro, humano ou outra sessão de agente, a investigar uma referência morta antes de
conseguir confiar no código. Manter o comentário atrelado a um teste ou a um contrato externo
estável desloca a responsabilidade de revalidação pra um mecanismo que já existe (a suíte de
testes, o contrato externo em si), em vez de criar uma nova obrigação de auditoria manual.
