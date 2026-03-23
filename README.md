# Criarte Admin + Chatbot

Sistema administrativo da Criarte com:

- login administrativo
- dashboard de clientes, pedidos e financeiro
- chatbot de WhatsApp integrado ao painel
- QR Code para autenticar o bot
- pedidos gerados pelo WhatsApp entrando direto no painel
- persistencia compartilhada em `data/criarte-data.json`

## Estrutura

- `server.js`: servidor HTTP, API compartilhada e bot do WhatsApp
- `app.js`: painel administrativo web
- `styles.css`: interface do painel
- `data/criarte-data.json`: base de usuarios, clientes, pedidos e conversas

## Como rodar

1. Instale as dependencias:

```bash
npm install
```

2. Inicie o sistema:

```bash
npm start
```

3. Abra no navegador:

```text
http://localhost:3000
```

4. Credenciais iniciais:

- E-mail: `admin@criarte.com`
- Senha: `123456`

## Rotas uteis

- Painel: `/`
- Status do bot: `/api/bot/status`
- QR do WhatsApp: `/qr`
- API de dados: `/api/data`

## Como o chatbot funciona

O fluxo do bot foi adaptado para a Criarte. Ele:

- apresenta os servicos da empresa
- coleta nome, servico, tipo de evento, prazo e briefing
- cria cliente e pedido com origem `WhatsApp`
- registra conversas para acompanhamento no painel
- responde consulta de status usando os dados do pedido

## Observacoes

- Se voce abrir apenas o `index.html` sem o servidor, o painel entra em modo local e o bot nao integra.
- Para a autenticacao do WhatsApp funcionar, escaneie o QR em `/qr`.
- A autenticacao do WhatsApp fica em `.wwebjs_auth/`.
