# Escopo de diretório

O diretório raiz deste projeto (`$CLAUDE_PROJECT_DIR`) é o limite de navegação desta sessão. Dentro dele, visibilidade é total: qualquer subdiretório sob a raiz, incluindo `project/` e tudo que estiver abaixo dele, está no escopo, sem precisar de entrada individual em allowlist. Nunca saia da raiz.

São proibidos, sem exceção:

- `cd ..`, `pushd ..` ou qualquer navegação relativa cujo resultado fique fora da raiz.
- Caminhos absolutos (leitura, escrita, execução, busca) que apontem para fora da raiz — incluindo repositórios irmãos que não fazem parte deste workspace, o diretório home do usuário, `/etc`, ou qualquer outro caminho do sistema.
- Seguir symlinks cujo destino resolvido fique fora da raiz.

Duas exceções explícitas, exigidas pelo próprio harness e não por necessidade da tarefa:

- O diretório de scratchpad da sessão atual.
- O diretório de auto-memory (`~/.claude/projects/.../memory/`).

Fora dessas duas exceções, qualquer necessidade aparente de sair da raiz — acessar outro repositório, um caminho do sistema, um diretório de outro projeto — deve ser sinalizada ao usuário em vez de executada diretamente.

Este limite não é só orientação: o guard `enforce-path-allowlist` nega mecanicamente qualquer chamada de tool cujo caminho resolva fora da raiz, das duas exceções acima, ou de uma entrada em `.claude/hooks/enforce-path-allowlist/path-allowlist.json`. Esse arquivo é a única forma de conceder visibilidade extra, e só um humano pode editá-lo — o próprio guard nega escrita nele pelo agente. Ao encontrar uma necessidade legítima de sair do escopo atual, a orientação correta não é mais "sinalizar e aguardar": é pedir para um humano adicionar o caminho a `.claude/hooks/enforce-path-allowlist/path-allowlist.json`, já que a chamada será negada de qualquer forma até que isso aconteça.
