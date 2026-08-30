# Tom de voz institucional e client-facing

Regras de escrita para qualquer texto produzido em nome da empresa: relatório, e-mail
institucional, proposta, documentação para público externo, apresentação, material de
comunicação, e texto de interface (microcopy) — inclusive quando gerado por um agente construtor
de UI. Cobre apenas mecânica de escrita: gramática, clareza, estrutura, tratamento de termo
técnico e estrangeiro, texto de interface e linguagem inclusiva. Não define adjetivo, traço de
personalidade ou "voz de marca" — isso é decisão de posicionamento fora do escopo deste documento.

## Quando aplicar

Aplique estas regras ao escrever ou revisar:

- Relatório, proposta ou documento entregue a cliente ou parceiro externo.
- E-mail institucional ou comunicação client-facing.
- Documentação voltada a um público fora do time técnico interno.
- Apresentação ou material de comunicação da empresa.
- Texto de interface — rótulo de botão, mensagem de erro/sucesso, texto de formulário, estado
  vazio — inclusive quando gerado por um agente construtor de UI, não só por uma pessoa.

Não use estas regras para a própria resposta do agente a um desenvolvedor dentro de uma sessão de
trabalho técnica — comunicação interna entre agente e desenvolvedor segue
`.claude/conventions/agent-tone-of-voice.md`, com regras diferentes (idioma de raciocínio, formato de
resposta técnica), que não é substituída nem sobreposta por este documento.

## Idioma e estrangeirismos

Escreva em português. Não traduza termo técnico de domínio (TI, infraestrutura, engenharia de
software) que, na prática da comunidade técnica brasileira, é usado no idioma original — quase
sempre inglês — em vez de sua tradução literal.

Um termo fica no idioma original quando é jargão técnico consagrado e um profissional da área,
falando em português no dia a dia de trabalho, diria o termo em inglês em vez de traduzi-lo. Tudo o
que não se qualificar como esse tipo de jargão — frases, explicações, conectivos, vocabulário geral
— é escrito em português. Não é uma lista fechada: na dúvida, julgue pelo uso real observado na
comunidade técnica brasileira, nunca pela tradução literal de dicionário.

Exemplos de termos que permanecem no original: API, gateway, load balancer, backend, frontend,
endpoint, webhook, deploy, pipeline, container, cluster, cache, token, request, response, payload,
merge, commit, rollback. Nome próprio de produto, protocolo ou tecnologia (Docker, Kubernetes,
PostgreSQL, HTTP, JWT, OAuth) segue a mesma regra — nunca é traduzido.

Um termo estrangeiro consagrado pelo uso corrente não leva aspas, itálico ou qualquer marcação
especial — marcar visualmente sinaliza que o termo é estranho ao texto, e um termo já consagrado
não é. Um termo estrangeiro pouco conhecido do público leitor, e de tradução difícil, deve vir
acompanhado de uma explicação curta na primeira ocorrência. Essa decisão é sobre a audiência do
documento, não sobre o idioma do termo: para um relatório técnico lido por outro time técnico,
nenhuma explicação é necessária; para um documento lido por alguém fora de TI, vale explicar o
termo uma vez, na primeira menção.

Isso não é licença para escrever em inglês por padrão nem para importar termo técnico em inglês só
porque existe uma versão em inglês do conceito. A regra cobre apenas o jargão que a comunidade
técnica brasileira já usa assim, no dia a dia — não uma preferência geral por inglês.

## Gramática e mecânica do português

Regras objetivas de gramática e formatação para texto institucional em português brasileiro:
relatórios, e-mails a cliente, propostas, documentação, apresentações. O objetivo é eliminar
ambiguidade e erro de norma culta, não impor um estilo pessoal.

### Crase

Use crase (`à`, `às`) quando há fusão da preposição "a" com o artigo feminino "a"/"as" — ou seja,
quando o termo regido é feminino e admite o artigo "a" antes dele.

- **Obrigatória**: "Enviamos o relatório à diretoria." (a diretoria → à diretoria)
- **Obrigatória diante de locuções femininas**: à tarde, às vezes, à disposição, à medida que.
- **Proibida diante de palavra masculina**: "Entregamos a prazo" (não "à prazo").
- **Proibida antes de verbo**: "Começamos a implementar" (não "à implementar").
- **Facultativa antes de nome próprio feminino e de possessivo feminino**: "Reportamos a/à Ana",
  "Enviamos a/à sua equipe" — nesses dois casos, qualquer uma das duas formas é aceita; escolha uma
  e mantenha consistência dentro do mesmo documento.

Teste rápido: troque a palavra regida por uma equivalente masculina. Se o "a" virar "ao", há crase
("Fomos à reunião" → "Fomos ao encontro" → crase confirmada). Se não virar "ao", não há crase.

### Colocação pronominal

Em português brasileiro escrito formal, o padrão recomendado é a próclise (pronome antes do verbo)
sempre que houver uma palavra atrativa antes do verbo — negação, advérbio, conjunção subordinativa,
pronome relativo ou indefinido:

- "Não se aplica a este caso." (não: "Não aplica-se")
- "Ainda se aguarda a resposta do cliente."
- "O relatório que se anexa contém..."

Sem palavra atrativa, e no início de frase, use a ênclise (pronome depois do verbo):

- "Aguarda-se o retorno do cliente."
- "Envie-nos a documentação atualizada."

Evite iniciar frase com pronome oblíquo átono ("Se aplica", "Lhe informamos") — é forma coloquial,
fora do registro de um documento institucional.

### Concordância verbal e nominal

- O verbo concorda com o núcleo do sujeito, não com um adjunto ou com a palavra mais próxima:
  "A lista de pendências foi enviada" (não "foram enviadas" — o núcleo é "lista", não
  "pendências").
- Com sujeito composto anteposto ao verbo, o verbo vai para o plural: "O gerente e o analista
  aprovaram a proposta."
- Expressões partitivas ("a maioria de", "grande parte de") admitem concordância com o núcleo
  singular ou com o especificador plural — escolha uma forma e mantenha consistência: "A maioria
  dos clientes aprovou" ou "A maioria dos clientes aprovaram" são ambas aceitas pela norma culta;
  a primeira é mais formal.
- Adjetivo que qualifica dois ou mais substantivos de gêneros diferentes vai para o masculino
  plural se vier depois deles: "Relatório e planilha revisados." Se vier antes, concorda com o mais
  próximo: "Revisada planilha e relatório."

### Gerundismo

Use o gerúndio apenas para uma ação em andamento, simultânea a outra, ou para indicar meio/modo:

- Correto: "Estamos revisando o contrato" (ação em curso agora).
- Correto: "Identificamos o problema analisando os logs" (indica o meio).

Evite o gerúndio como substituto de futuro ou de obrigação — construção conhecida como
"gerundismo", marcada como coloquial e imprecisa em texto formal:

- Evite: "Vamos estar enviando o relatório até sexta."
- Prefira: "Enviaremos o relatório até sexta." ou "Vamos enviar o relatório até sexta."

### Maiúsculas e minúsculas

- Cargos e funções ficam em minúscula em texto corrido, mesmo referindo-se a uma pessoa específica:
  "o diretor de operações", "a coordenadora do projeto" — exceção apenas em campos de assinatura ou
  endereçamento formal de carta/ofício.
- Nomes de departamentos, times e produtos internos seguem a grafia oficial definida pela empresa;
  na ausência de uma convenção própria, use maiúscula inicial só no nome próprio, minúscula no
  substantivo comum que o acompanha: "o time de Engenharia", não "o Time de Engenharia".
- Siglas de uso corrente na área (ex.: sigla de uma norma, de um órgão regulador, de um protocolo)
  mantêm a grafia usual da sigla; não inventar variação de caixa.

### Siglas

Defina toda sigla por extenso na primeira ocorrência do documento, seguida da sigla entre
parênteses: "Lei Geral de Proteção de Dados (LGPD)". Da segunda menção em diante, use só a sigla.
Exceção: siglas de uso geral e amplamente reconhecidas pelo público leitor do documento (ex.: em um
relatório técnico lido só por outro time técnico, siglas técnicas já dominadas por esse público não
precisam de expansão).

### Numerais, data e moeda

- Números de zero a nove são escritos por extenso em texto corrido; a partir de 10, use algarismo
  — exceto quando o número abre a frase, caso em que deve ser escrito por extenso ou a frase deve
  ser reestruturada para não começar por número.
- Valores monetários: símbolo da moeda antes do valor, sem espaço, vírgula como separador decimal e
  ponto como separador de milhar: `R$ 12.500,00`.
- Datas no padrão brasileiro: dia/mês/ano, com zero à esquerda em dia e mês de um dígito:
  `05/03/2026`. Em texto corrido, o mês pode ser escrito por extenso: "5 de março de 2026".
- Percentuais: algarismo seguido do símbolo sem espaço: `12%`, nunca "12 %" nem "doze por cento" em
  texto técnico com múltiplos números.
- Intervalos numéricos usam travessão sem espaço: `10–15 dias úteis`.

### Clichês e vícios de linguagem a evitar

Expressões que soam grandiosas mas carregam pouca informação real enfraquecem um texto técnico ou
institucional. Evite substituí-las por afirmação concreta e verificável:

| Evite | Prefira |
|---|---|
| "solução robusta e escalável" | descrever o que a solução efetivamente resolve e sob que carga foi testada |
| "de ponta", "de última geração" | o nome e a versão da tecnologia usada |
| "impacto significativo" | o número ou percentual do impacto |
| "em um cenário ideal" | a condição específica em que o resultado vale |
| "no fim do dia" | remover — raramente acrescenta sentido |
| "vale ressaltar que" | remover, ou ir direto ao ponto ressaltado |
| "a nível de" | "em nível de" (a expressão com "a" é erro de regência) ou reescrever sem a locução |

Evite também garantia e superlativo absoluto sem lastro factual: "100% seguro", "nunca falha", "o
melhor do mercado". Prefira afirmação factual e verificável, apoiada em dado ou teste concreto.

### Regência e confusões comuns

- **"a par" vs. "ao par"**: "estar a par de um assunto" (informado sobre); "câmbio ao par" (valor
  equivalente). Não confundir.
- **"onde" vs. "aonde"**: "onde" indica lugar em que algo permanece ("o servidor onde os dados
  ficam"); "aonde" indica lugar para onde há movimento ("aonde o usuário é direcionado após o
  login").
- **"mal" vs. "mau"**: "mal" é advérbio (oposto de "bem") ou substantivo abstrato ("o mal do
  sistema é a latência"); "mau" é adjetivo, oposto de "bom" ("um mau design").
- **"há" vs. "a"** em expressões de tempo: "há dois dias" (tempo decorrido, verbo haver); "daqui a
  dois dias" (tempo futuro, preposição).
- **plural de estrangeirismo não aportuguesado**: siga o plural da língua de origem quando o termo
  ainda não tem grafia aportuguesada consolidada (ex.: "backups", não "backup's"); quando existir
  forma já incorporada ao português, use-a.

### Tratamento

Em texto client-facing (e-mail, relatório entregue a cliente, proposta), use "você" como pronome de
tratamento padrão — é o registro corporativo brasileiro predominante, formal o suficiente sem soar
distante. Reserve "senhor(a)" para correspondência protocolar com autoridade pública, contrato
jurídico formal ou pedido explícito do destinatário. Evite "tu" em qualquer contexto corporativo
escrito, independentemente da variedade regional do autor ou do leitor — é inconsistente com o
restante da conjugação verbal em português escrito formal brasileiro, que segue a terceira pessoa.

## Clareza, tom e estrutura

Práticas de redação para tornar um texto institucional mais fácil de ler e mais direto, sem virar
informal. Isso não é uma definição de personalidade de marca — é mecânica de escrita, aplicável a
qualquer texto em nome da empresa, independentemente de quem o produz.

### Voz ativa

Prefira voz ativa: o sujeito pratica a ação, não a sofre. Voz ativa deixa claro quem fez o quê —
importante em relatório técnico, onde responsabilidade e autoria da constatação importam.

- Evite: "Foi identificada uma inconsistência nos dados."
- Prefira: "Identificamos uma inconsistência nos dados."

Use voz passiva de forma deliberada só quando o agente da ação é irrelevante ou desconhecido, ou
quando o objeto da ação é o foco real da frase: "O sistema foi descontinuado em 2024" (o agente —
quem descontinuou — não é o ponto).

### Uma ideia por frase

Frases longas com múltiplas orações subordinadas dificultam a leitura, mesmo quando gramaticalmente
corretas. Quebre uma frase complexa em duas ou três frases curtas sempre que isso não perder
nuance:

- Evite: "Considerando que o prazo original não pôde ser cumprido em razão de uma dependência
  externa que só foi resolvida na semana anterior à entrega, propomos uma nova data que já
  contempla uma margem de segurança adicional."
- Prefira: "O prazo original não pôde ser cumprido porque dependíamos de um terceiro, resolvido só
  na semana anterior à entrega. Por isso, propomos uma nova data, já com margem de segurança."

### Jargão e explicação de termos técnicos

Jargão técnico consagrado (ver a seção "Idioma e estrangeirismos" acima) não precisa de tradução,
mas pode precisar de explicação — a decisão depende de quem lê, não do termo em si:

- Documento lido por outro time técnico: não explique termos que esse público já domina.
- Documento lido por alguém fora de TI (cliente, área de negócio, jurídico): explique o termo na
  primeira menção, em poucas palavras, sem soar didático demais — a explicação cabe entre vírgulas
  ou em uma frase curta logo depois do termo.

### Evite promessa exagerada e hedge vazio

Dois erros opostos enfraquecem um texto institucional:

- **Promessa exagerada**: garantias absolutas, superlativos sem lastro ("garantido", "sem nenhum
  risco", "a melhor opção do mercado"). Prefira afirmação factual, apoiada em dado verificável.
- **Hedge vazio**: linguagem de defesa excessiva que dilui a mensagem sem reduzir risco real
  ("pode ser que talvez seja necessário considerar a possibilidade de..."). Se algo é incerto, diga
  isso uma vez, de forma direta ("ainda não confirmamos X — dependemos de Y"), sem empilhar
  qualificadores.

### Tom por contexto

O mesmo remetente varia o grau de formalidade e de acolhimento conforme o momento da comunicação,
sem deixar de soar como a mesma organização:

- **Abertura e fechamento de um documento ou e-mail**: tom mais próximo e acolhedor é apropriado —
  agradecer o contato, colocar-se à disposição.
- **Corpo técnico** (resultados, análise, recomendação): tom neutro, objetivo, sem adjetivo
  subjetivo desnecessário.
- **Comunicação de erro ou problema**: tom mais sério e direto que o de uma comunicação de sucesso
  — reconhecer o problema em vez de suavizá-lo, explicar a causa quando apurada, indicar o próximo
  passo.
- **Onboarding ou primeira comunicação**: tom mais leve e explicativo é aceitável, já que o leitor
  ainda não tem contexto.
- **Comunicação de compliance ou obrigação regulatória**: a linguagem exigida pela norma entra como
  está, mas é seguida de uma explicação em linguagem simples do que aquilo significa na prática
  para quem lê. Ver também a seção "Conteúdo legal e regulatório" abaixo.

### Estrutura para leitura rápida

Um leitor corporativo raramente lê um documento inteiro de forma linear na primeira passada — ele
escaneia em busca do que importa para ele. Estruture para isso:

- **Títulos descritivos**: um título deve dizer do que a seção trata, não só nomear uma categoria
  genérica ("Resultados da análise de latência", não "Análise").
- **Parágrafos curtos**: três a cinco linhas por parágrafo; um parágrafo, uma ideia central.
- **Listas para itens paralelos**: quando há três ou mais itens do mesmo tipo (etapas, requisitos,
  opções), use lista, não uma frase corrida com "e" repetido.
- **Um assunto por comunicação**: um e-mail ou uma seção de relatório trata de um tópico; se
  surgirem dois assuntos não relacionados, separe em duas comunicações ou duas seções com títulos
  próprios — não misture no mesmo bloco de texto.
- **Resumo no início de documentos longos**: um relatório com mais de uma página abre com um
  resumo de três a cinco linhas do achado principal e da recomendação, antes do detalhamento.

## Microcopy de interface

Regras para o texto curto que aparece dentro de uma interface: botões, mensagens de erro e
sucesso, rótulos de formulário, estados vazios, confirmações. Esse texto é lido em contexto, em
poucas palavras, geralmente sob alguma tensão (o usuário está tentando concluir uma tarefa) — a
tolerância a ambiguidade e a texto longo é muito menor do que em um relatório ou e-mail. Esta seção
é a mais relevante para um agente construtor de interface — aplique-a diretamente ao gerar texto de
UI.

### Botões e ações

- O rótulo do botão nomeia a ação, não o objeto: "Salvar alteração", não "Alteração". "Enviar
  proposta", não "Proposta".
- Use verbo no infinitivo ou no imperativo de forma consistente dentro da mesma interface — não
  misture "Salvar" numa tela e "Salve" em outra.
- Ações destrutivas ou irreversíveis (excluir, cancelar, revogar acesso) nomeiam explicitamente o
  que será afetado: "Excluir relatório", não só "Excluir" — especialmente quando há mais de uma
  ação destrutiva possível na mesma tela.
- Evite rótulo vago em botão de confirmação: "OK" ou "Confirmar" sozinhos exigem que o usuário
  releia o texto acima para saber o que está confirmando; prefira repetir a ação: "Confirmar
  exclusão".

### Mensagens de erro

- Diga o que aconteceu, por que (quando souber a causa real) e o que fazer a seguir — nessa ordem.
- Nunca atribua a causa a uma hipótese não verificada como se fosse fato. Se a causa não foi
  apurada, diga isso: "Não foi possível salvar. Tente novamente em instantes" é honesto; "Erro de
  conexão" quando a causa real não foi confirmada não é.
- Não culpe o usuário nem use tom de repreensão: "Campo obrigatório não preenchido", não "Você
  esqueceu de preencher um campo obrigatório."
- Seja específico sobre qual campo ou ação falhou quando a interface permitir apontar isso: "O CPF
  informado tem um formato inválido", não "Dados inválidos."
- Evite jargão técnico de sistema em mensagem voltada ao usuário final (código de erro interno,
  nome de exceção, stack trace) — isso vai para o log, não para a tela; a mensagem ao usuário
  descreve o problema em termos da tarefa dele.

### Mensagens de sucesso e confirmação

- Confirme o que foi feito, de forma específica: "Relatório enviado ao cliente", não só "Sucesso."
- Tom mais leve é aceitável aqui — é o momento de menor tensão da interação — mas sem exagero
  celebratório em contexto corporativo (evite excesso de exclamação ou emoji em produto B2B
  voltado a uso profissional).

### Rótulos de formulário e texto de apoio

- O rótulo do campo diz o que se espera dali, sem precisar de exemplo na maioria dos casos: "CNPJ
  da empresa", não "Digite aqui".
- Texto de apoio (helper text) abaixo do campo é usado só quando o rótulo sozinho não basta —
  formato esperado, restrição, ou por que o dado é pedido: "Usamos esse número só para emitir a
  nota fiscal."
- Campo opcional é marcado como opcional; não deixe a obrigatoriedade implícita ou inconsistente
  entre campos da mesma tela.

### Estados vazios

Uma tela ou lista vazia é uma oportunidade de orientar, não só um vazio sem contexto:

- Diga por que está vazio: "Nenhum relatório gerado ainda" é melhor que uma tela em branco sem
  texto algum.
- Quando há uma ação óbvia para sair do estado vazio, ofereça-a: "Nenhum relatório gerado ainda —
  crie o primeiro."
- Não confunda estado vazio por ausência de dado com estado vazio por erro de carregamento — são
  duas mensagens diferentes; misturar as duas engana o usuário sobre o que está de fato acontecendo.

### Confirmação antes de ação irreversível

Para qualquer ação que não pode ser desfeita (excluir, cancelar assinatura, revogar acesso), a
interface confirma antes de executar, e o texto de confirmação nomeia a consequência real, não uma
generalidade: "Essa ação exclui o relatório permanentemente" comunica mais que "Tem certeza?".

### Consistência de vocabulário dentro do produto

Um mesmo conceito é nomeado da mesma forma em toda a interface — não alterne entre "usuário",
"conta" e "perfil" para a mesma entidade dentro do mesmo produto. Inconsistência de nome aumenta a
carga cognitiva de quem está tentando concluir uma tarefa, mesmo quando cada termo isoladamente
está correto.

## Linguagem inclusiva e acessibilidade

Regras para não excluir, generalizar de forma incorreta ou usar termo ofensivo ao escrever sobre
pessoas, e para tornar o texto legível por quem usa tecnologia assistiva.

### Princípio geral

Mencione uma característica pessoal (idade, deficiência, gênero, origem, condição de saúde) só
quando ela for relevante para o conteúdo. Fora desse caso, não a mencione — inclusive em exemplo,
persona fictícia ou caso de uso ilustrativo usado em documentação.

### Idade

Não use adjetivo etário como qualificador ("jovem", "idoso") para descrever uma pessoa fora de
contexto em que a idade é diretamente relevante. Quando a idade for relevante, cite o número
específico em vez do adjetivo: "o cliente, de 68 anos" em vez de "o cliente idoso".

### Deficiência

- Evite expressão idiomática que banaliza deficiência ("isso não vai colar", em referência a
  audição; qualquer uso figurado de "cego para X", "surdo a Y" quando o sentido literal envolveria
  uma pessoa real com essa condição).
- Não use "sofre de", "vítima de" ou "portador de" para descrever uma condição — prefira "tem
  deficiência visual", "é surdo", conforme o caso. Quando a preferência pessoal do indivíduo for
  conhecida entre linguagem centrada na pessoa ("pessoa com deficiência") e linguagem centrada na
  identidade ("pessoa surda", "pessoa autista"), use a que essa pessoa preferir; na ausência dessa
  informação, linguagem centrada na pessoa é a opção mais segura por padrão.
- Mencione uma deficiência apenas quando for relevante ao conteúdo — por exemplo, ao descrever um
  recurso de acessibilidade do próprio produto.

### Gênero

- Não presuma o gênero de uma pessoa a partir do nome, cargo ou qualquer outro dado indireto.
  Quando o gênero da pessoa mencionada não for conhecido, use construção neutra (nome completo,
  "a pessoa", reformulação da frase) em vez de escolher um pronome por suposição.
- Em texto voltado a um público amplo e não identificado (ex.: manual de usuário, mensagem de
  sistema), use "você" e evite pronome de terceira pessoa marcado por gênero quando a frase puder
  ser reformulada sem ele.
- Não use expressão que reforce estereótipo de gênero associado a cargo ou atividade.

### Origem, raça e nacionalidade

Não use gentílico, nacionalidade ou origem étnica como qualificador de comportamento, competência
ou caráter. Cite a nacionalidade de uma pessoa ou empresa só quando isso for factualmente relevante
ao conteúdo (ex.: jurisdição legal aplicável).

### Condições médicas e cognitivas

Não use termo de condição médica ou cognitiva em sentido figurado ou pejorativo ("é meio bipolar",
"tem TOC de organização"). Ao descrever de fato uma condição de uma pessoa real, faça-o apenas
quando relevante ao conteúdo, com o termo clínico correto.

### Acessibilidade textual

- **Texto alternativo de imagem**: descreva o conteúdo e a função da imagem, não a aparência
  decorativa; se a imagem é puramente decorativa, marque-a como tal em vez de forçar uma descrição.
- **Links**: o texto do link descreve o destino ("veja o relatório completo"), nunca "clique aqui"
  isolado — leitor de tela lista links fora de contexto, e "clique aqui" repetido não diferencia um
  do outro.
- **Hierarquia de títulos**: use os níveis de título (H1, H2, H3...) em ordem, sem pular nível só
  por efeito visual — tecnologia assistiva usa a hierarquia para navegação.
- **Contraste e dependência de cor**: nunca comunique uma informação só por cor ("os itens em
  vermelho estão atrasados") sem um segundo indicador textual ou de ícone junto.
- **Linguagem simples**: frase curta, palavra comum em vez de erudita quando ambas comunicam o
  mesmo, voz ativa — são também requisitos de acessibilidade cognitiva, não só de estilo. Ver a
  seção "Clareza, tom e estrutura" acima para o detalhamento dessas práticas.

## Conteúdo legal e regulatório

Ao redigir trecho que envolve obrigação legal ou regulatória (termo de uso, aviso de privacidade,
cláusula contratual, comunicação sobre uma exigência de órgão regulador):

- Use linguagem simples em vez de juridiquês sempre que a validade jurídica do texto não depender
  do termo técnico específico. Quando um termo técnico for indispensável (porque a lei ou a
  jurisprudência exige aquele termo exato para o documento ter efeito), mantenha-o e acrescente uma
  explicação em linguagem simples logo em seguida.
- Defina o termo que vai se repetir ao longo do documento uma única vez, no início ("a empresa,
  doravante 'nós'; o cliente, doravante 'você'"), e use a forma definida no restante do texto.
- Separe a informação que é uma exigência legal (não pode ser reformulada) da explicação em
  linguagem simples do que ela significa na prática — deixe claro ao leitor qual é qual.
- Nunca redija um trecho como se fosse aconselhamento jurídico ao destinatário. Um texto
  institucional informa sobre uma obrigação ou um direito; não orienta o destinatário sobre o que
  fazer diante de uma situação jurídica específica dele — isso é papel do time jurídico responsável
  pelo caso.

## Checklist de revisão

Antes de publicar ou enviar um texto em nome da empresa, verifique:

- [ ] Todo termo técnico em inglês usado é realmente consagrado na comunidade técnica brasileira —
      não uma tradução evitada por preferência pessoal.
- [ ] Todo termo pouco conhecido do público leitor foi explicado na primeira menção.
- [ ] As frases estão em voz ativa, salvo os poucos casos em que o agente da ação é irrelevante.
- [ ] Nenhuma frase tenta carregar mais de uma ideia complexa.
- [ ] Não há garantia absoluta, superlativo sem lastro ou clichê esvaziado de sentido.
- [ ] O tom do trecho é compatível com o momento da comunicação (abertura acolhedora, corpo neutro,
      erro tratado com seriedade, não com eufemismo).
- [ ] Crase, colocação pronominal, concordância e gerundismo foram checados nos pontos de dúvida.
- [ ] Números, data e moeda seguem o padrão brasileiro.
- [ ] Nenhuma característica pessoal (idade, deficiência, gênero, origem) é mencionada sem
      necessidade.
- [ ] Se o texto é de interface: todo botão nomeia a ação, toda mensagem de erro diz o que
      aconteceu e o que fazer a seguir, nenhum link usa "clique aqui" sozinho.
- [ ] Se o texto envolve obrigação legal: a linguagem exigida está separada da explicação em
      linguagem simples, e nada foi redigido como aconselhamento jurídico ao leitor.
