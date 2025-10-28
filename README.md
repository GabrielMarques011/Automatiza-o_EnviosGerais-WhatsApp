# 📱 Automação de Envios Gerais - WhatsApp

Sistema de automação para envio de mensagens pelo WhatsApp, facilitando comunicações em massa de forma rápida, organizada e eficiente.

## 📋 Sobre o Projeto

Este projeto foi desenvolvido para automatizar o processo de envio de mensagens via WhatsApp, permitindo comunicações em larga escala de maneira profissional e organizada. Ideal para empresas, equipes de marketing, atendimento ao cliente e qualquer situação que demande envios em massa.

## ✨ Funcionalidades

- 🚀 Envio automatizado de mensagens em massa
- 📊 Gestão organizada de contatos
- ⚡ Processamento rápido e eficiente
- 📝 Personalização de mensagens
- 🔄 Sistema de controle de envios
- 📈 Monitoramento de entregas

## 🛠️ Tecnologias Utilizadas

- Node.js
- API Sistem IXC
- WhatsApp Web API
- JavaScript/TypeScript

## 📦 Pré-requisitos

Antes de começar, certifique-se de ter instalado em sua máquina:

- Node.js 14 ou superior
- npm ou yarn

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone https://github.com/GabrielMarques011/Automatiza-o_EnviosGerais-WhatsApp.git
```

2. Acesse o diretório do projeto:
```bash
cd Automatiza-o_EnviosGerais-WhatsApp
```

3. Instale as dependências:
```bash
npm install
```

## 🚀 Como Usar

1. Prepare sua lista de contatos em um arquivo CSV ou JSON com as seguintes colunas:
   - Nome
   - Número de telefone (com código do país)
   - Mensagem (opcional, caso queira personalizar)

2. Configure o arquivo de configurações com seus parâmetros

3. Execute o script principal:
```bash
node bot.js
```

4. Escaneie o QR Code do WhatsApp Web quando solicitado

5. Aguarde o processo de envio ser concluído

## ⚙️ Configuração

Edite o arquivo `whatsappCliente.js` / `constants.js` ou `bot.js` para ajustar:

- Intervalo entre mensagens
- Tempo de espera
- Caminho dos arquivos
- Mensagens padrão
- Variaveis de Ambiente Global

## 📊 Estrutura de Dados

Exemplo de formato esperado para o arquivo de contatos:

```csv
Nome,Telefone,Mensagem
João Silva,5511999999999,Olá {nome}, tudo bem?
Maria Santos,5521988888888,Oi {nome}, como vai?
```

## ⚠️ Avisos Importantes

- ⚖️ **Uso Responsável**: Este sistema deve ser usado de forma ética e respeitando as políticas do WhatsApp
- 🚫 **Anti-Spam**: Evite envios excessivos para não ser bloqueado
- 🔒 **Privacidade**: Respeite a LGPD e não compartilhe dados de terceiros sem autorização
- ⏱️ **Limites**: Configure intervalos adequados entre envios

## 🤝 Contribuindo

Contribuições são sempre bem-vindas! Para contribuir:

1. Faça um Fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/NovaFuncionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/NovaFuncionalidade`)
5. Abra um Pull Request

## 👤 Autor

**Gabriel Marques**

- GitHub: [@GabrielMarques011](https://github.com/GabrielMarques011)

## 🙏 Agradecimentos

- Comunidade Node.js
- Desenvolvedores das bibliotecas utilizadas
- Todos que contribuíram com feedback e melhorias

## 📞 Suporte

Se você tiver alguma dúvida ou sugestão, sinta-se à vontade para abrir uma [Issue](https://github.com/GabrielMarques011/Automatiza-o_EnviosGerais-WhatsApp/issues) no repositório. Ou entre em contato atraves do [Linkedin](https://www.linkedin.com/in/gabriel-marques-6bb222174/) 

---

⭐ Se este projeto foi útil para você, considere dar uma estrela no repositório!