# Seshat - VS Code Extension

**Seshat VSCode** é uma extensão para o Visual Studio Code que integra o poder da CLI do Seshat diretamente no seu editor, permitindo a geração de commits convencionais (*Conventional Commits*) de forma inteligente, impulsionada por IA.

## 🚀 Recursos

- **✨ Seshat Commit:** Gera mensagens de commit semânticas e padronizadas analisando as mudanças atuais no seu repositório Git.
- **Integração Nativa:** Um botão interativo (`✨`) fica disponível na aba de Controle de Código-Fonte (Source Control), tornando a geração de commits muito mais ágil.
- **Atalhos de Teclado:** Acione a geração do commit a qualquer momento com o atalho `Ctrl+Alt+S` (Windows/Linux) ou `Cmd+Alt+S` (macOS).

## 📋 Requisitos

Para utilizar esta extensão, é necessário ter a ferramenta de linha de comando `seshat` instalada no seu sistema. Certifique-se de que ela está acessível globalmente pelo seu `PATH` do sistema. Se o executável estiver instalado num local específico, você pode configurar o caminho nas opções da extensão.

## ⚙️ Configurações da Extensão

Esta extensão disponibiliza as seguintes configurações (settings):

- `seshat.executablePath`: Caminho para o executável gerador dos commits (padrão: `seshat`). Altere para o caminho absoluto caso o comando não esteja sendo encontrado automaticamente.
- `seshat.autoOpenPanel`: Define se o painel interativo do Seshat deve ou não abrir automaticamente ao iniciar a geração de um commit (padrão: `true`).

## 🛠️ Como Usar

1. Realize modificações no seu projeto.
2. Acesse a aba de **Controle de Código-Fonte / Source Control** na barra lateral.
3. Adicione os arquivos que deseja incluir no commit para área de *stage* (Preparados).
4. Clique no ícone de estrela de brilho (`✨`) localizado no cabeçalho aba do painel do Git, ou simplesmente pressione o atalho local (`Ctrl+Alt+S` / `Cmd+Alt+S`).
5. A extensão consultará a CLI e irá preencher a sua caixa de texto de commit com uma mensagem gerada por IA detalhando as suas mudanças.

## 💻 Desenvolvimento

Se desejar alterar a extensão, os seguintes scripts estão disponíveis (utilizando o `pnpm`):

- `pnpm run build`: Compila o código TypeScript em um pacote JavaScript utilizável.
- `pnpm run watch`: Executa o *esbuild* em modo "watch", reconstruindo automaticamente as mudanças enquanto você as digita.
- `pnpm run package`: Monta (empacota) a versão optimizada de produção para distribuir como extensão (`.vsix`).
