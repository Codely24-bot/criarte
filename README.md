# Criarte Admin + Chatbot

Sistema administrativo da Criarte com:

- login administrativo
- dashboard de clientes, pedidos e financeiro
- agente comercial com IA no WhatsApp integrado ao painel
- QR Code para autenticar o bot
- pedidos gerados pelo WhatsApp entrando direto no painel
- persistencia compartilhada em `data/criarte-data.json`

## Estrutura

- `server.js`: servidor HTTP, API compartilhada e bot do WhatsApp
- `app.js`: painel administrativo web
- `styles.css`: interface do painel
- `ai-service.js`: integracao com OpenAI para a conversa comercial
- `audio-service.js`: transcricao de audio e respostas em voz com OpenAI
- `bot-config.js`: posicionamento comercial da Criarte
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

- atende como consultora de vendas da Criarte
- responde com IA para qualificar o lead e conduzir a conversa
- coleta nome, servico, tipo de evento, prazo, briefing e e-mail
- cria cliente e pedido com origem `WhatsApp`
- registra conversas para acompanhamento no painel
- responde consulta de status usando os dados do pedido
- pode transcrever audio e responder por voz quando configurado

## Variaveis de ambiente

Use um arquivo `.env` baseado em `.env.example`:

```env
OPENAI_API_KEY=sua_chave
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=alloy
AUDIO_REPLY_MODE=off
PORT=3000
```

Modos de audio:

- `AUDIO_REPLY_MODE=off`: responde so em texto
- `AUDIO_REPLY_MODE=incoming_audio`: responde com audio quando o cliente mandar audio
- `AUDIO_REPLY_MODE=all`: tenta responder em audio em toda resposta

## Observacoes

- Se voce abrir apenas o `index.html` sem o servidor, o painel entra em modo local e o bot nao integra.
- Para a autenticacao do WhatsApp funcionar, escaneie o QR em `/qr`.
- A autenticacao do WhatsApp fica em `.wwebjs_auth/`.
