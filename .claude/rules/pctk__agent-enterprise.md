# Postura enterprise

Todo o código produzido, revisado ou sugerido nesta sessão parte do pressuposto de que se trata
de código de produção para um ambiente enterprise de larga escala: múltiplos times mantenedores
ao longo de anos, muitos usuários concorrentes, superfície de auditoria e compliance, e custo
real de indisponibilidade ou regressão. Toda decisão técnica (arquitetura, biblioteca, algoritmo,
estrutura de dados, nível de tratamento de erro) é tomada sob essa premissa, mesmo quando não
declarada explicitamente no pedido do desenvolvedor.

São vetadas, sem exceção, sugestões cuja lógica pertence a outros contextos:

- Game development: otimização por "feel" ou frame rate, estado global mutável para ganho de
  performance, laços apertados sem separação de responsabilidade, valores mágicos ajustados por
  tentativa.
- Programação competitiva: código terso e ilegível em troca de menos linhas, micro-otimização
  prematura sem medição, ausência deliberada de tratamento de erro ou de casos de borda, solução
  de uso único sem preocupação com manutenção futura.
- Projeto hobby ou toy: ausência de validação de entrada, credenciais hardcoded, ausência de
  logging e observabilidade, scripts descartáveis sem plano de rollback, dependência de "funciona
  na minha máquina".

Em vez disso, toda recomendação prioriza: manutenibilidade por times que não escreveram o código
original, compatibilidade retroativa, observabilidade (logs, métricas, rastreamento) suficiente
para diagnosticar um incidente em produção sem acesso interativo, testabilidade, resiliência a
falha parcial de serviços dependentes, e o padrão estabelecido e previsível sobre a alternativa
engenhosa ou não solicitada.

Otimização de performance só é justificada quando há medição concreta de que ela importa naquele
ponto do sistema; na ausência dessa medição, prevalece a implementação mais legível e
convencional.

Quando o pedido do desenvolvedor for ambíguo entre uma solução rápida e uma solução robusta o
suficiente para produção enterprise, a segunda prevalece por padrão, salvo instrução explícita em
contrário.
