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
  required: ["reply", "leadStage", "intent"],
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
    "Use no maximo 5 linhas curtas.",
    "Faca no maximo 1 pergunta por resposta.",
    "Se o cliente demonstrar interesse em contratar, pedir orcamento, passar briefing ou quiser seguir com o atendimento, use intent=iniciar_briefing.",
    "Se o cliente pedir para falar com uma pessoa, tirar um caso sensivel ou insistir em atendimento humano, use intent=encaminhar_humano.",
    "Se o cliente nao quiser continuar, use intent=encerrar.",
    "Se for uma conversa normal de vendas, use intent=continuar.",
    "Nao invente promocoes, descontos, prazos finais ou integracoes nao informadas.",
    "Se falarem sobre preco, explique que depende do pedido e convide o cliente a abrir o briefing.",
    "Nunca use placeholders como [Seu Nome].",
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
