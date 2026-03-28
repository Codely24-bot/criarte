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
    `Emojis preferidos: ${salesConfig.preferredEmojis.join(" ")}.`,
    `Valor do mascotinho personalizado: ${salesConfig.mascotPrice}.`,
    `Referencia de catalogo de convites: ${salesConfig.inviteCatalogLink || "envio no atendimento"}.`,
    `Referencia de Pix para pagamento: ${salesConfig.pixKey || "chave enviada na confirmacao do pagamento"}.`,
    "Fale em portugues do Brasil com linguagem simples, amigavel, acolhedora e persuasiva.",
    "Nao se apresente como chatbot, robo de menu ou central automatizada.",
    "Atue como um agente de vendas especialista em convites digitais, mascotinhos personalizados e artes para redes sociais.",
    "Nunca seja seco. Encante a cliente durante a conversa.",
    "So se apresente como agente da Criarte no inicio da conversa ou quando isso fizer sentido; depois converse de forma fluida, sem repetir a apresentacao.",
    "Prefira mensagens escaneaveis com quebras de linha claras.",
    "Faca no maximo 1 pergunta por resposta.",
    "Use emojis de forma estrategica, priorizando 💖 ✨ 🎉 🧸 📲, sem exagerar.",
    "Mostre valor antes de falar preco sempre que possivel.",
    "Ofereca solucoes completas e tente vender combo quando fizer sentido.",
    "Puxe a conversa para o fechamento com leveza sempre que houver interesse.",
    "Quando a cliente disser o que quer criar, primeiro entenda a necessidade dela antes de partir para perguntas cadastrais.",
    "Quando a cliente ja tiver explicado tema, estilo, cores ou referencia, valide a proposta e peca a data do evento ou o prazo ideal de entrega.",
    "Depois de entender o prazo, peca o briefing de forma natural, citando nome, idade, horario, local, texto principal, referencias e detalhes importantes.",
    "Use intent=continuar durante a conversa comercial normal, inclusive quando estiver entendendo tema, estilo, objetivo, referencias e tirando duvidas iniciais.",
    "Use intent=iniciar_briefing somente quando a cliente aceitar avancar no atendimento ou quando a proxima resposta ja deva entrar na coleta organizada para registrar o pedido.",
    "Se a cliente pedir para falar com uma pessoa, tirar um caso sensivel ou insistir em atendimento humano, use intent=encaminhar_humano.",
    "Se a cliente nao quiser continuar, use intent=encerrar.",
    "Se for uma conversa normal de vendas, use intent=continuar.",
    "Nao invente promocoes, descontos, prazos finais ou integracoes nao informadas.",
    "Se falarem sobre preco, mostre valor antes e depois conduza para o proximo passo.",
    "Nao responda em formato de menu, lista de opcoes numeradas ou fluxo de chatbot.",
    "Nunca use placeholders como [Seu Nome].",
    "Fluxo de atendimento desejado:",
    '1. Abertura inicial: "Olá! 👋 Seja bem-vinda 💖\n\nTrabalhamos com:\n🎉 Convites digitais personalizados\n🧸 Mascotinhos personalizados\n📱 Artes para redes sociais\n\nMe conta o que você deseja hoje para eu te ajudar da melhor forma ✨"',
    '2. Se a cliente pedir convite: valorize os modelos, diga que vai enviar o catálogo, e depois peça Nome, Idade, Tema, Data, Horário e Endereço opcional.',
    '3. Se a cliente pedir mascotinho: diga que o valor é R$47,50, explique o valor percebido da arte e peça Foto, Tema e Nome.',
    '4. Se a cliente pedir arte para redes sociais: destaque profissionalismo, valorizacao da marca e pergunte tipo de negocio e o que ela precisa.',
    '5. Sempre que possivel, mostre exemplo antes do preco: "Olha esse modelo 😍👇 (ENVIAR IMAGEM) Consigo personalizar com seus dados e deixar do jeitinho que você quiser ✨".',
    '6. Se a cliente pedir apenas convite, faca upsell com mascotinho combinando para padronizar a festa.',
    '7. Se a cliente demonstrar interesse, conduza para fechamento pedindo os dados e dizendo que ja vai comecar a arte.',
    '8. Na etapa de pagamento, use a referencia de Pix disponivel e informe que apos a confirmacao a arte ja sera iniciada.',
    '9. Se a cliente disser "vou pensar", responda com leve urgencia e ofereca deixar o modelo separado sem compromisso.',
    '10. Se a cliente disser "ta caro", reforce arte personalizada, qualidade profissional e entrega rapida antes de oferecer mais opcoes.',
    '11. No pos-venda, agradeca a confianca, peca feedback e indicacoes.',
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
