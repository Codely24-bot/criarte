const model = process.env.OPENAI_MODEL || "gpt-4.1-mini"
const rawApiKey = (process.env.OPENAI_API_KEY || "").trim()
const apiKey =
  rawApiKey && rawApiKey !== "coloque_sua_chave_aqui" && rawApiKey !== "sua_chave" ? rawApiKey : null

const providerName = "OpenAI"
const isAIEnabled = Boolean(apiKey)
const aiStatusReason = isAIEnabled
  ? `sim (${providerName} - ${model})`
  : "nao - defina OPENAI_API_KEY no .env ou nas variaveis de ambiente"

let lastLoggedErrorSignature = null
let lastLoggedErrorAt = 0

const responseSchema = {
  type: "object",
  properties: {
    reply: {
      type: "string"
    },
    leadStage: {
      type: "string",
      enum: ["novo", "qualificando", "interessado", "quente", "fechamento", "encerrado"]
    },
    intent: {
      type: "string",
      enum: ["continuar", "iniciar_briefing", "encaminhar_humano", "encerrar"]
    },
    summary: {
      type: "string"
    }
  },
  required: ["reply", "leadStage", "intent", "summary"],
  additionalProperties: false
}

const shouldLogError = (signature) => {
  const now = Date.now()
  const isNewSignature = signature !== lastLoggedErrorSignature
  const isExpired = now - lastLoggedErrorAt > 5 * 60 * 1000

  if (isNewSignature || isExpired) {
    lastLoggedErrorSignature = signature
    lastLoggedErrorAt = now
    return true
  }

  return false
}

const logAIError = (error) => {
  const status = error?.status || null
  const code = error?.code || "sem_codigo"
  const signature = `${status}:${code}:${error?.message || ""}`

  if (!shouldLogError(signature)) return

  if (status === 429) {
    console.log("OpenAI indisponivel no momento: a conta ou projeto atingiu limite, quota ou rate limit.")
    return
  }

  if (status === 401 || status === 403) {
    console.log("OpenAI indisponivel: a OPENAI_API_KEY parece invalida ou sem permissao para este modelo.")
    return
  }

  if ((error?.message || "").toLowerCase().includes("fetch failed")) {
    console.log("OpenAI indisponivel: houve falha de conexao com a API. Verifique rede, firewall ou restricoes.")
    return
  }

  console.log(
    `Falha ao gerar resposta com OpenAI: status=${status || "n/a"} code=${code} message=${error?.message || "erro desconhecido"}`
  )
}

const formatHistory = (history = []) =>
  history
    .slice(-10)
    .map((item) => `${item.role === "user" ? "Cliente" : "Consultora"}: ${item.content}`)
    .join("\n")

const buildSalesPrompt = ({ message, history, salesConfig, leadName, leadStage }) =>
  [
    `Voce e ${salesConfig.assistantName}, da empresa ${salesConfig.companyName}.`,
    `Nome do lead no WhatsApp: ${leadName || "nao identificado"}.`,
    `Publico atendido: ${salesConfig.targetAudience}.`,
    `Posicionamento comercial: ${salesConfig.positioning}.`,
    `Servicos principais: ${salesConfig.serviceCatalog.join("; ")}.`,
    `Beneficios que voce pode destacar: ${salesConfig.benefits.join("; ")}.`,
    `Objetivos de qualificacao: ${salesConfig.qualificationGoals.join("; ")}.`,
    `CTA preferida: ${salesConfig.preferredCta}.`,
    `Estagio atual do lead: ${leadStage || "novo"}.`,
    "Fale em portugues do Brasil com tom humano, vendedor, consultivo e objetivo.",
    "Nao se apresente como chatbot, robo de menu ou central automatizada.",
    "Atue como uma consultora de vendas real da Criarte.",
    "So se apresente como consultora da Criarte no inicio da conversa ou quando isso fizer sentido; depois converse de forma fluida, sem repetir a apresentacao.",
    "Use no maximo 5 linhas curtas.",
    "Faca no maximo 1 pergunta por resposta.",
    "Use poucos emojis, no maximo 1 por resposta, e so quando isso soar natural. Ao longo de uma conversa inteira, mantenha algo em torno de 3 a 4 emojis no total.",
    "Evite textos engessados. Responda como uma consultora que entendeu o pedido e esta conduzindo o atendimento com seguranca.",
    "Quando o cliente disser o que quer criar, prefira primeiro entender a ideia dele antes de partir para perguntas cadastrais.",
    "Quando o cliente ja tiver explicado tema, estilo, cores ou referencia, valide a proposta e peca a data do evento ou o prazo ideal de entrega.",
    "Depois de entender o prazo, peca o briefing de forma natural, citando itens concretos como nome, idade, horario, local, texto principal, referencias e detalhes importantes.",
    "Use intent=continuar durante a conversa comercial normal, inclusive quando estiver entendendo tema, estilo, objetivo, referencias e tirando duvidas iniciais.",
    "Use intent=iniciar_briefing somente quando o cliente aceitar avancar no atendimento ou quando a proxima resposta ja deva entrar na coleta organizada para registrar o pedido.",
    "Se o cliente pedir para falar com uma pessoa, tirar um caso sensivel ou insistir em atendimento humano, use intent=encaminhar_humano.",
    "Se o cliente nao quiser continuar, use intent=encerrar.",
    "Se for uma conversa normal de vendas, use intent=continuar.",
    "Nao invente promocoes, descontos, prazos finais ou integracoes nao informadas.",
    "Se falarem sobre preco, explique que depende do pedido e convide o cliente a abrir o briefing.",
    "Nao responda em formato de menu, lista de opcoes numeradas ou fluxo de chatbot.",
    "Nunca use placeholders como [Seu Nome].",
    "Exemplo de cadencia desejada:",
    'Cliente: "Oi, queria fazer um convite digital para aniversario infantil."',
    'Consultora: "Oi. Eu sou a consultora de vendas da Criarte ✨ Posso te ajudar com isso, sim. Me conta um pouco do que voce imaginou para esse convite."',
    'Cliente: "Vai ser da Minnie, em tons rosa, para abril."',
    'Consultora: "Perfeito. Ja entendi bem a proposta. Agora me diga a data do evento ou o prazo ideal de entrega, para eu organizar seu atendimento."',
    'Cliente: "Dia 18 de abril."',
    'Consultora: "Otimo 💕 Agora me passe o briefing que voce ja tem: nome, idade, horario, local e qualquer detalhe importante que queira colocar."',
    "",
    history?.length ? "Historico recente:" : "Historico recente: sem contexto anterior.",
    history?.length ? formatHistory(history) : "",
    "",
    `Mensagem atual do cliente: ${message}`
  ].join("\n")

const extractOutputText = (payload) => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const output = Array.isArray(payload?.output) ? payload.output : []

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []

    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text.trim()
      }

      if (part?.json && typeof part.json === "object") {
        return JSON.stringify(part.json)
      }
    }
  }

  return null
}

const generateSalesReply = async ({ message, history, salesConfig, leadName, leadStage }) => {
  if (!apiKey) {
    return null
  }

  const prompt = buildSalesPrompt({ message, history, salesConfig, leadName, leadStage })

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "sales_reply",
            strict: true,
            schema: responseSchema
          }
        }
      })
    })

    const payload = await response.json()

    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Erro HTTP ${response.status}`)
      error.status = response.status
      error.code = payload?.error?.type || payload?.error?.code || "openai_error"
      throw error
    }

    const outputText = extractOutputText(payload)
    if (!outputText) {
      return null
    }

    return JSON.parse(outputText)
  } catch (error) {
    logAIError(error)
    return null
  }
}

module.exports = {
  aiStatusReason,
  generateSalesReply,
  isAIEnabled,
  model,
  providerName
}
