const fs = require("fs")
const http = require("http")
const path = require("path")
const { URL } = require("url")
const { loadEnvFile } = require("./env-loader")

loadEnvFile()

const { mensagens, salesConfig } = require("./bot-config")
const {
  audioReplyStatusReason,
  audioTranscriptionStatusReason,
  isIncomingAudioMessage,
  shouldSendAudioReply,
  synthesizeSpeech,
  transcribeAudioMessage
} = require("./audio-service")
const {
  aiStatusReason,
  generateSalesReply,
  isAIEnabled,
  model: aiModel,
  providerName: aiProviderName
} = require("./ai-service")

const APP_DIR = __dirname
const DATA_DIR = path.join(APP_DIR, "data")
const DATA_FILE = path.join(DATA_DIR, "criarte-data.json")
const PORT = Number(process.env.PORT) || 3000

const APP_NAME = "Criarte"
const APP_DESCRIPTION = "Criacao de artes e convites digitais"
const ORDER_STATUS_OPTIONS = ["Novo lead", "Aguardando pagamento", "Em criacao", "Em aprovacao", "Finalizado", "Entregue"]
const PAYMENT_METHOD_OPTIONS = ["A definir", "PIX", "Cartao", "Boleto", "Dinheiro", "Transferencia"]
const PAYMENT_STATUS_OPTIONS = ["Pendente", "50% pago", "Pago"]
const SERVICE_OFFERS = {
  convite: {
    name: "Convite digital",
    emoji: "💌",
    price: 89,
    keywords: ["convite", "convites", "digital", "aniversario", "casamento", "cha", "chá", "festa"],
    pitch: "Ideal para quem quer um convite bonito, organizado e com cara profissional para enviar pelo WhatsApp e redes sociais."
  },
  mascotinho: {
    name: "Mascotinho personalizado",
    emoji: "🧸",
    price: 47.5,
    keywords: ["mascotinho", "mascote", "mascot", "personagem", "bonequinho"],
    pitch: "Uma arte exclusiva que ajuda a deixar a festa mais encantadora, padronizada e com identidade propria."
  },
  instagram: {
    name: "Arte para redes sociais",
    emoji: "📱",
    price: 35,
    keywords: ["instagram", "post", "story", "stories", "rede social", "redes sociais"],
    pitch: "Perfeito para divulgar produtos, servicos, promocoes e fortalecer a presenca visual da sua marca."
  },
  personalizada: {
    name: "Arte personalizada",
    emoji: "✨",
    price: 120,
    keywords: ["personalizada", "personalizado", "arte", "arte sob medida", "banner", "criacao"],
    pitch: "Uma criacao sob medida para sua necessidade, com liberdade visual e atencao aos detalhes do seu projeto."
  },
  logotipo: {
    name: "Logotipo",
    emoji: "🧠",
    price: 180,
    keywords: ["logo", "logotipo", "marca"],
    pitch: "Uma opcao para quem precisa apresentar sua marca com mais profissionalismo, memorabilidade e identidade."
  },
  identidade: {
    name: "Identidade visual",
    emoji: "🏷️",
    price: 420,
    keywords: ["identidade", "identidade visual", "branding", "brand", "papelaria"],
    pitch: "Pensada para negocios que precisam de uma comunicacao visual consistente e com mais valor percebido."
  }
}

const STATIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js"
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
}

const headersSemCache = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
}

const nowDate = () => new Date().toISOString().slice(0, 10)
const nowIso = () => new Date().toISOString()
const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

const normalizePhone = (value = "") => String(value).replace(/\D/g, "")
const comparablePhone = (value = "") => {
  const digits = normalizePhone(value)
  if (!digits) return ""
  return digits.length > 11 ? digits.slice(-11) : digits
}

const isSamePhone = (left, right) => {
  const a = comparablePhone(left)
  const b = comparablePhone(right)
  return Boolean(a && b && a === b)
}

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const trimText = (value = "", max = 600) => String(value || "").trim().slice(0, max)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const normalizeSpaces = (value = "") => String(value).replace(/\s+/g, " ").trim()

const parseFlexibleDate = (value = "") => {
  const text = String(value).trim()
  if (!text) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const brMatch = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (!brMatch) return ""

  const [, day, month, year] = brMatch
  const iso = `${year}-${month}-${day}`
  const parsedDate = new Date(iso)
  return Number.isNaN(parsedDate.getTime()) ? "" : iso
}

const getLeadNameFromContact = (contact) => {
  const rawName = normalizeSpaces(contact?.pushname || contact?.shortName || contact?.name || "")
  return rawName || null
}

const applyLeadNameToReply = (text = "", leadName = null) => {
  const safeText = String(text || "")
  const normalizedName = normalizeSpaces(leadName || "")

  if (!normalizedName) {
    return safeText.replace(/\[Seu Nome\]/gi, APP_NAME)
  }

  return safeText.replace(/\[Seu Nome\]/gi, normalizedName)
}

const createEmptyDraft = (phone = "") => ({
  phone: comparablePhone(phone)
})

const getSession = (phone) => {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      stage: DEFAULT_CONVERSATION_STAGE,
      draft: createEmptyDraft(phone),
      history: [],
      leadName: null,
      leadStage: "novo"
    })
  }

  return sessions.get(phone)
}

const pushHistory = (session, role, content) => {
  if (!content) return
  session.history.push({ role, content: trimText(content, 1200) })
  session.history = session.history.slice(-12)
}

const startBriefingTriggers = [
  "orcamento",
  "pedido",
  "quero contratar",
  "quero fechar",
  "vamos fechar",
  "vamos seguir",
  "quero fazer",
  "quero criar",
  "podemos seguir"
]
const statusTriggers = ["acompanhar", "status", "meu pedido", "andamento"]
const humanTriggers = ["atendente", "humano", "pessoa", "suporte"]
const stopTriggers = ["parar", "sair", "nao quero", "sem interesse", "nao tenho interesse"]
const priceTriggers = ["preco", "precos", "valor", "valores", "quanto custa", "investimento"]
const serviceTriggers = ["servico", "servicos", "catalogo", "portfolio", "convite", "arte", "logo", "identidade"]
const inviteTriggers = ["convite", "convites", "aniversario", "festa", "casamento", "cha", "chá"]
const mascotTriggers = ["mascotinho", "mascote", "mascot", "personagem", "bonequinho"]
const socialArtTriggers = ["rede social", "redes sociais", "instagram", "post", "posts", "banner", "story", "stories"]
const thinkingTriggers = ["vou pensar", "deixa eu pensar", "vou ver", "depois eu vejo", "depois eu chamo"]
const expensiveTriggers = ["ta caro", "tá caro", "muito caro", "achei caro"]
const paymentInfoTriggers = ["pix", "pagamento", "pagar", "chave pix"]
const greetingTriggers = /^(oi|ola|bom dia|boa tarde|boa noite|opa)$/i
const collectingStages = new Set([
  "collect_name",
  "collect_service",
  "collect_event_date",
  "collect_briefing",
  "collect_email",
  "confirm_order"
])
const DEFAULT_CONVERSATION_STAGE = "conversa"

const defaultData = () => ({
  users: [{ id: "u-1", email: "admin@criarte.com", password: "123456", name: "Admin Criarte" }],
  clients: [
    {
      id: "c-1",
      fullName: "Carla Mendes",
      phone: "11999998888",
      email: "carla@email.com",
      eventDate: nowDate(),
      eventType: "Aniversario",
      notes: "Cliente recorrente",
      source: "Manual",
      createdAt: nowIso()
    }
  ],
  orders: [
    {
      id: "o-1",
      clientId: "c-1",
      serviceType: "Convite digital",
      serviceValue: 350,
      paymentMethod: "PIX",
      paymentStatus: "50% pago",
      orderStatus: "Em criacao",
      startDate: nowDate(),
      dueDate: nowDate(),
      finalFileName: "",
      finalFileData: "",
      briefing: "Convite digital para aniversario infantil.",
      source: "Manual",
      contactPhone: "11999998888",
      conversationId: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ],
  conversations: []
})

const sanitizeClient = (client = {}) => ({
  id: String(client.id || createId("c")),
  fullName: trimText(client.fullName || "Cliente sem nome", 120),
  phone: normalizePhone(client.phone || ""),
  email: trimText(client.email || "", 160),
  eventDate: trimText(client.eventDate || "", 20),
  eventType: trimText(client.eventType || "", 120),
  notes: trimText(client.notes || "", 2000),
  source: trimText(client.source || "Manual", 60) || "Manual",
  createdAt: trimText(client.createdAt || nowIso(), 80)
})

const sanitizeOrder = (order = {}) => ({
  id: String(order.id || createId("o")),
  clientId: String(order.clientId || ""),
  serviceType: trimText(order.serviceType || "Servico a definir", 120),
  serviceValue: Number(order.serviceValue || 0),
  paymentMethod: PAYMENT_METHOD_OPTIONS.includes(order.paymentMethod) ? order.paymentMethod : "A definir",
  paymentStatus: PAYMENT_STATUS_OPTIONS.includes(order.paymentStatus) ? order.paymentStatus : "Pendente",
  orderStatus: ORDER_STATUS_OPTIONS.includes(order.orderStatus) ? order.orderStatus : "Novo lead",
  startDate: trimText(order.startDate || nowDate(), 20),
  dueDate: trimText(order.dueDate || "", 20),
  finalFileName: trimText(order.finalFileName || "", 200),
  finalFileData: typeof order.finalFileData === "string" ? order.finalFileData : "",
  briefing: trimText(order.briefing || "", 4000),
  source: trimText(order.source || "Manual", 60) || "Manual",
  contactPhone: normalizePhone(order.contactPhone || ""),
  conversationId: trimText(order.conversationId || "", 120),
  createdAt: trimText(order.createdAt || nowIso(), 80),
  updatedAt: trimText(order.updatedAt || nowIso(), 80)
})

const sanitizeConversation = (conversation = {}) => ({
  id: String(conversation.id || createId("conv")),
  phone: normalizePhone(conversation.phone || ""),
  stage: trimText(conversation.stage || DEFAULT_CONVERSATION_STAGE, 60) || DEFAULT_CONVERSATION_STAGE,
  status: trimText(conversation.status || "ativo", 60) || "ativo",
  displayName: trimText(conversation.displayName || "", 120),
  orderId: trimText(conversation.orderId || "", 120),
  clientId: trimText(conversation.clientId || "", 120),
  needsHuman: Boolean(conversation.needsHuman),
  updatedAt: trimText(conversation.updatedAt || nowIso(), 80),
  summary: trimText(conversation.summary || "", 1200),
  messages: Array.isArray(conversation.messages)
    ? conversation.messages.slice(-30).map((message) => ({
        direction: message.direction === "bot" ? "bot" : "user",
        text: trimText(message.text || "", 800),
        timestamp: trimText(message.timestamp || nowIso(), 80)
      }))
    : []
})

const sanitizeData = (data = {}) => {
  const fallback = defaultData()
  return {
    users: Array.isArray(data.users) && data.users.length ? data.users : fallback.users,
    clients: Array.isArray(data.clients) ? data.clients.map(sanitizeClient) : fallback.clients.map(sanitizeClient),
    orders: Array.isArray(data.orders) ? data.orders.map(sanitizeOrder) : fallback.orders.map(sanitizeOrder),
    conversations: Array.isArray(data.conversations) ? data.conversations.map(sanitizeConversation) : []
  }
}

const ensureDataFile = () => {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData(), null, 2), "utf8")
  }
}

const readData = () => {
  ensureDataFile()
  try {
    return sanitizeData(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")))
  } catch (error) {
    const fallback = sanitizeData(defaultData())
    fs.writeFileSync(DATA_FILE, JSON.stringify(fallback, null, 2), "utf8")
    return fallback
  }
}

const writeData = (nextData) => {
  const cleanData = sanitizeData(nextData)
  ensureDataFile()
  fs.writeFileSync(DATA_FILE, JSON.stringify(cleanData, null, 2), "utf8")
  return cleanData
}

const readBody = async (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    ...headersSemCache,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  })
  res.end(body)
}

const sendText = (res, statusCode, body, contentType = "text/plain; charset=utf-8") => {
  res.writeHead(statusCode, {
    ...headersSemCache,
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body)
  })
  res.end(body)
}

const botRuntime = {
  enabled: !["1", "true", "yes"].includes(String(process.env.DISABLE_WHATSAPP || "").toLowerCase()),
  dependenciesReady: false,
  connected: false,
  status: "inicializando",
  qrDataUrl: null,
  qrPngBuffer: null,
  qrUpdatedAt: null,
  lastError: "",
  serverStartedAt: nowIso()
}

const sessions = new Map()
const antiSpam = new Map()

let whatsappClient = null
let QRCode = null
let qrcodeTerminal = null
let whatsappBootstrapError = null

const ensureConversation = (data, phone, patch = {}) => {
  const normalizedPhone = comparablePhone(phone)
  let conversation = data.conversations.find((item) => isSamePhone(item.phone, normalizedPhone))

  if (!conversation) {
    conversation = sanitizeConversation({
      id: createId("conv"),
      phone: normalizedPhone,
      stage: DEFAULT_CONVERSATION_STAGE,
      status: "ativo",
      updatedAt: nowIso()
    })
    data.conversations.unshift(conversation)
  }

  Object.assign(conversation, patch, { phone: normalizedPhone, updatedAt: nowIso() })
  return conversation
}

const appendConversationMessage = (phone, direction, text, patch = {}) => {
  if (!text) return
  const data = readData()
  const conversation = ensureConversation(data, phone, patch)
  conversation.messages.push({
    direction: direction === "bot" ? "bot" : "user",
    text: trimText(text, 800),
    timestamp: nowIso()
  })
  conversation.messages = conversation.messages.slice(-30)
  if (patch.summary) {
    conversation.summary = trimText(patch.summary, 1200)
  }
  writeData(data)
}

const findClientByPhone = (data, phone) => data.clients.find((client) => isSamePhone(client.phone, phone)) || null

const getLatestOrderForClient = (data, clientId) =>
  [...data.orders]
    .filter((order) => order.clientId === clientId)
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))[0] || null

const upsertClientFromLead = (data, draft, phone) => {
  const existingClient = findClientByPhone(data, phone)
  const notes = [draft.notes ? `Resumo do atendimento: ${draft.notes}` : "", draft.briefing ? `Briefing: ${draft.briefing}` : ""]
    .filter(Boolean)
    .join("\n")

  if (existingClient) {
    existingClient.fullName = draft.fullName || existingClient.fullName
    existingClient.email = draft.email || existingClient.email
    existingClient.eventDate = draft.eventDate || existingClient.eventDate
    existingClient.eventType = draft.eventType || existingClient.eventType
    existingClient.notes = [existingClient.notes, notes].filter(Boolean).join("\n\n").slice(0, 2000)
    existingClient.source = "WhatsApp"
    return existingClient
  }

  const client = sanitizeClient({
    id: createId("c"),
    fullName: draft.fullName || "Cliente WhatsApp",
    phone,
    email: draft.email || "",
    eventDate: draft.eventDate || "",
    eventType: draft.eventType || "",
    notes,
    source: "WhatsApp",
    createdAt: nowIso()
  })

  data.clients.unshift(client)
  return client
}

const buildOrderBriefing = (draft) =>
  [
    draft.eventType ? `Objetivo: ${draft.eventType}` : "",
    draft.eventDate ? `Prazo/evento: ${draft.eventDate}` : "",
    draft.briefing ? `Detalhes: ${draft.briefing}` : "",
    draft.notes ? `Observacoes do cliente: ${draft.notes}` : ""
  ]
    .filter(Boolean)
    .join("\n")

const createOrderFromLead = (data, client, draft, conversationId) => {
  const order = sanitizeOrder({
    id: createId("o"),
    clientId: client.id,
    serviceType: draft.serviceType || "Servico a definir",
    serviceValue: 0,
    paymentMethod: "A definir",
    paymentStatus: "Pendente",
    orderStatus: "Novo lead",
    startDate: nowDate(),
    dueDate: draft.eventDate || "",
    finalFileName: "",
    finalFileData: "",
    briefing: buildOrderBriefing(draft),
    source: "WhatsApp",
    contactPhone: client.phone,
    conversationId,
    createdAt: nowIso(),
    updatedAt: nowIso()
  })

  data.orders.unshift(order)
  return order
}

const humanizeStatus = (status) => {
  if (status === "conectado") return "Conectado"
  if (status === "qr_disponivel") return "Aguardando leitura do QR"
  if (status === "dependencias_ausentes") return "Dependencias nao instaladas"
  if (status === "desativado") return "Bot desativado"
  if (status === "erro") return "Erro"
  return "Inicializando"
}

const getBotStatusPayload = () => {
  const data = readData()
  return {
    enabled: botRuntime.enabled,
    dependenciesReady: botRuntime.dependenciesReady,
    connected: botRuntime.connected,
    status: botRuntime.status,
    statusLabel: humanizeStatus(botRuntime.status),
    qrPagePath: "/qr",
    qrImagePath: "/qr.png",
    updatedAt: botRuntime.qrUpdatedAt,
    lastError: botRuntime.lastError,
    aiEnabled: isAIEnabled,
    aiProvider: isAIEnabled ? aiProviderName : null,
    aiModel: isAIEnabled ? aiModel : null,
    aiStatusReason,
    audioReplyStatusReason,
    audioTranscriptionStatusReason,
    botOrders: data.orders.filter((order) => order.source === "WhatsApp").length,
    pendingHuman: data.conversations.filter((conversation) => conversation.needsHuman).length
  }
}

const sendBotMessage = async (chatId, text, patch = {}) => {
  if (!whatsappClient) return
  await whatsappClient.sendMessage(chatId, text)
  appendConversationMessage(chatId, "bot", text, patch)
}

const sendTyping = async (chat) => {
  await chat.sendStateTyping()
  await delay(1200)
}

const buildFallbackSalesReply = (text, leadName, isFirstContact = false) => {
  let reply = mensagens.fallback

  if (stopTriggers.some((item) => text.includes(item))) {
    reply = mensagens.semInteresse
  } else if (thinkingTriggers.some((item) => text.includes(item))) {
    reply = mensagens.objecaoPensar
  } else if (expensiveTriggers.some((item) => text.includes(item))) {
    reply = mensagens.objecaoPreco
  } else if (paymentInfoTriggers.some((item) => text.includes(item))) {
    reply = mensagens.pagamento
  } else if (mascotTriggers.some((item) => text.includes(item))) {
    reply = mensagens.mascotinho
  } else if (inviteTriggers.some((item) => text.includes(item))) {
    reply = `${mensagens.convite}\n\n${mensagens.upsellConvite}`
  } else if (socialArtTriggers.some((item) => text.includes(item))) {
    reply = mensagens.redesSociais
  } else if (priceTriggers.some((item) => text.includes(item))) {
    reply = mensagens.preco
  } else if (serviceTriggers.some((item) => text.includes(item))) {
    reply = mensagens.funcionalidades
  } else if (greetingTriggers.test(text)) {
    reply = mensagens.abertura
  }

  const shouldPrependOpening = isFirstContact && reply !== mensagens.abertura
  const finalReply = shouldPrependOpening ? `${mensagens.abertura}\n\n${reply}` : reply

  return applyLeadNameToReply(finalReply, leadName)
}

const respondToLead = async ({ chat, incomingMessage, text, patch = {} }) => {
  await sendTyping(chat)
  await sendBotMessage(incomingMessage.from, text, patch)

  if (!shouldSendAudioReply(incomingMessage.type)) {
    return
  }

  const audio = await synthesizeSpeech(text)
  if (!audio) {
    return
  }

  await chat.sendStateRecording()
  await delay(1200)
  await whatsappClient.sendMessage(incomingMessage.from, audio, { sendAudioAsVoice: true })
  await chat.clearState().catch(() => null)
}

const replyAndTrack = async ({ chat, incomingMessage, session, text, patch = {} }) => {
  await respondToLead({ chat, incomingMessage, text, patch })
  pushHistory(session, "assistant", text)
  return text
}

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  })

const detectServiceOffer = (text) =>
  Object.entries(SERVICE_OFFERS).find(([, offer]) => offer.keywords.some((keyword) => text.includes(normalizeText(keyword))))?.[0] || ""

const inferServiceFromSession = (session) => {
  const context = normalizeText(
    (session?.history || [])
      .slice(-8)
      .map((item) => item.content)
      .join(" ")
  )
  const detectedOffer = detectServiceOffer(context)
  return detectedOffer ? SERVICE_OFFERS[detectedOffer].name : ""
}

const timelineKeywords = [
  "hoje",
  "amanha",
  "semana",
  "mes",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
  "janeiro",
  "fevereiro",
  "marco"
]

const looksLikeEventDateText = (value = "") => {
  const text = normalizeText(value)
  if (!text) return false
  if (parseFlexibleDate(value)) return true
  return /\d/.test(text) && timelineKeywords.some((keyword) => text.includes(keyword))
}

const inferEventDateFromSession = (session) =>
  (session?.history || [])
    .filter((item) => item.role === "user")
    .slice(-4)
    .map((item) => trimText(item.content, 120))
    .reverse()
    .find((content) => looksLikeEventDateText(content)) || ""

const buildPromptForStage = (stage) => {
  if (stage === "collect_event_date") {
    return "Agora me diga a data do evento ou o prazo ideal de entrega, para eu organizar seu atendimento."
  }

  if (stage === "collect_briefing") {
    return "Otimo 💕\n\nAgora me passe o briefing que voce ja tem: nome, idade, horario, local, texto principal, referencias e qualquer detalhe importante que queira colocar."
  }

  if (stage === "collect_name") {
    return "Perfeito. Para eu registrar tudo certinho no sistema da Criarte, qual nome completo devo colocar no seu atendimento?"
  }

  if (stage === "collect_email") {
    return "Perfeito. Se fizer sentido para voce, agora me passe um e-mail para contato. Se preferir seguir sem e-mail, pode escrever pular."
  }

  return "Perfeito. Vou organizar seu atendimento por aqui.\n\nMe diga qual material voce quer criar e, se quiser, ja me conte um pouco do que voce imaginou."
}

const stageAlreadyRequestedInMessage = (text = "", stage) => {
  const normalized = normalizeText(text)

  if (stage === "collect_event_date") {
    return normalized.includes("data do evento") || normalized.includes("prazo")
  }

  if (stage === "collect_briefing") {
    return normalized.includes("briefing")
  }

  if (stage === "collect_name") {
    return normalized.includes("nome completo") || normalized.includes("qual nome")
  }

  if (stage === "collect_email") {
    return normalized.includes("e-mail") || normalized.includes("email")
  }

  return normalized.includes("qual material") || normalized.includes("o que voce quer criar")
}

const getFlowPatchForStage = (stage) => {
  if (stage === "collect_event_date") {
    return { stage, status: "coletando_prazo" }
  }

  if (stage === "collect_briefing") {
    return { stage, status: "coletando_briefing" }
  }

  if (stage === "collect_name") {
    return { stage, status: "coletando_nome" }
  }

  if (stage === "collect_email") {
    return { stage, status: "coletando_email" }
  }

  return { stage: "collect_service", status: "coletando_servico" }
}

const resolveBriefingStage = ({ introMessage = "", hasService, hasEventDate }) => {
  const normalized = normalizeText(introMessage)

  if (normalized.includes("e-mail") || normalized.includes("email")) {
    return "collect_email"
  }

  if (normalized.includes("nome completo") || normalized.includes("qual nome")) {
    return "collect_name"
  }

  if (normalized.includes("briefing")) {
    return "collect_briefing"
  }

  if (normalized.includes("data do evento") || normalized.includes("prazo")) {
    return "collect_event_date"
  }

  if (hasService && hasEventDate) {
    return "collect_briefing"
  }

  if (hasService) {
    return "collect_event_date"
  }

  return "collect_service"
}

const servicePriceGuide = Object.values(SERVICE_OFFERS)
  .map((offer) => `${offer.emoji} ${offer.name} - a partir de ${formatCurrency(offer.price)}`)
  .join("\n")

const buildServiceOfferMessage = (offerKey) => {
  const offer = SERVICE_OFFERS[offerKey]
  if (!offer) return ""

  return [
    `${offer.emoji} *${offer.name} na ${APP_NAME}*`,
    ``,
    `${offer.pitch}`,
    ``,
    `💸 Valor-base: *a partir de ${formatCurrency(offer.price)}*`,
    `📌 O valor final pode variar conforme personalizacao, prazo e quantidade de ajustes.`,
    ``,
    `Se quiser, responda *orcamento* e eu ja abro seu atendimento.`
  ].join("\n")
}

const welcomeMessage = `✨ Ola! Eu sou o assistente virtual da *${APP_NAME}*.\n\n🎨 Criamos artes personalizadas e convites digitais para deixar sua ideia linda, profissional e pronta para encantar.\n\nEscolha uma opcao:\n1. 💌 Quero pedir um orcamento\n2. 🎨 Ver servicos\n3. 📦 Acompanhar meu pedido\n4. 👩‍💼 Falar com atendente`

const servicesMessage = `🎨 *Servicos da ${APP_NAME}*\n\n${servicePriceGuide}\n\n💬 Todas as artes sao feitas de forma personalizada, com foco em beleza, organizacao visual e impacto.\n\nSe quiser, eu posso abrir seu orcamento agora. Responda *orcamento* ou digite *1*.`

const pricingMessage = `💸 *Valores-base da ${APP_NAME}*\n\n${servicePriceGuide}\n\n✨ Cada pedido recebe um valor final conforme nivel de personalizacao, prazo e quantidade de ajustes.\n\nSe quiser seu valor agora, responda *orcamento* e eu monto seu atendimento.`

const portfolioMessage = `🖼️ *Nosso estilo de atendimento*\n\nNa ${APP_NAME}, cada projeto e pensado para ficar bonito, claro e com identidade.\n\n💌 Convites digitais\n📱 Artes para redes sociais\n🧠 Logos e identidades visuais\n✨ Artes sob medida para eventos e negocios\n\nSe quiser, eu posso registrar seu briefing agora para a equipe te atender mais rapido.`

const paymentMessage = `💳 *Formas de pagamento*\n\nTrabalhamos com opcoes como:\n• PIX\n• Cartao\n• Transferencia\n• Dinheiro\n\n📌 O formato exato e combinado no atendimento conforme o pedido.\n\nSe quiser receber uma proposta, digite *orcamento*.`

const urgencyMessage = `⚡ *Pedido com urgencia?*\n\nSem problema. Me envie seu briefing e o prazo desejado para a equipe avaliar a melhor janela de entrega.\n\n📅 Quanto antes voce enviar os detalhes, mais rapido conseguimos organizar sua demanda.`

const handoffMessage = `👩‍💼 Perfeito! Registrei aqui que voce quer falar com a equipe humana da *${APP_NAME}*.\n\n📲 Um atendente pode continuar por este mesmo numero assim que estiver disponivel.\n\nSe quiser adiantar seu pedido, digite *orcamento* e eu deixo tudo organizado.`

const buildStatusReply = (order, client) => {
  if (!order) {
    return "Ainda nao encontrei um pedido vinculado a este numero.\n\nSe voce quiser, eu posso organizar um novo atendimento por aqui."
  }

  return [
    `Encontrei seu pedido na ${APP_NAME}.`,
    `Cliente: ${client?.fullName || "Cliente"}`,
    `Servico: ${order.serviceType}`,
    `Status: ${order.orderStatus}`,
    `Pagamento: ${order.paymentStatus}`,
    `Prazo: ${order.dueDate || "A definir"}`,
    order.briefing ? `Resumo: ${order.briefing}` : "",
    "",
    "Se quiser ajustar algo, me avise que eu sinalizo a equipe."
  ]
    .filter(Boolean)
    .join("\n")
}

const buildConfirmationSummary = (draft) =>
  [
    "Vou registrar seu atendimento com estes dados:",
    `Nome: ${draft.fullName || "Nao informado"}`,
    `Servico: ${draft.serviceType || "Nao informado"}`,
    `Objetivo/evento: ${draft.eventType || "Nao informado"}`,
    `Prazo/data: ${draft.eventDate || "A definir"}`,
    `Briefing: ${draft.briefing || "Nao informado"}`,
    `E-mail: ${draft.email || "Nao informado"}`,
    "",
    "Se estiver tudo certo, me responda com confirmo.",
    "Se quiser ajustar algo, me diga o que precisa mudar ou escreva cancelar."
  ].join("\n")

const parseServiceChoice = (value) => {
  const text = normalizeText(value)
  if (text === "1") return SERVICE_OFFERS.convite.name
  if (text === "2") return SERVICE_OFFERS.instagram.name
  if (text === "3") return SERVICE_OFFERS.personalizada.name
  if (text === "4") return SERVICE_OFFERS.logotipo.name
  if (text === "5") return SERVICE_OFFERS.identidade.name

  const detectedOffer = detectServiceOffer(text)
  if (detectedOffer) return SERVICE_OFFERS[detectedOffer].name

  return trimText(value, 120)
}

const startBotFlow = async (msg, chat, session, introMessage = "") => {
  session.draft = createEmptyDraft(msg.from)
  const inferredService = inferServiceFromSession(session)
  const inferredEventDate = inferEventDateFromSession(session)

  if (inferredService) {
    session.draft.serviceType = inferredService
    session.draft.eventType = inferredService
  }

  if (inferredEventDate) {
    session.draft.eventDate = inferredEventDate
  }

  session.stage = resolveBriefingStage({
    introMessage,
    hasService: Boolean(inferredService),
    hasEventDate: Boolean(inferredEventDate)
  })

  const baseMessage = buildPromptForStage(session.stage)
  const message =
    introMessage && stageAlreadyRequestedInMessage(introMessage, session.stage)
      ? introMessage
      : [introMessage, baseMessage].filter(Boolean).join("\n\n")
  const patch = getFlowPatchForStage(session.stage)

  await respondToLead({
    chat,
    incomingMessage: msg,
    text: message,
    patch
  })
  return message
}

const markHumanHandoff = (phone, session) => {
  const data = readData()
  const conversation = ensureConversation(data, phone, {
    stage: "aguardando_humano",
    status: "aguardando_humano",
    needsHuman: true
  })
  if (session?.draft?.fullName) {
    conversation.displayName = session.draft.fullName
  }
  writeData(data)
}

const registerLead = (phone, session) => {
  const data = readData()
  const conversation = ensureConversation(data, phone, {
    stage: "novo_pedido",
    status: "aguardando_contato",
    needsHuman: true,
    displayName: session.draft.fullName || ""
  })

  const client = upsertClientFromLead(data, session.draft, phone)
  const order = createOrderFromLead(data, client, session.draft, conversation.id)

  conversation.clientId = client.id
  conversation.orderId = order.id
  conversation.summary = buildOrderBriefing(session.draft)
  writeData(data)

  return { client, order, conversation }
}

const handleIncomingWhatsAppMessage = async (msg) => {
  const incomingAudio = isIncomingAudioMessage(msg)

  if (!msg.from || msg.from === "status@broadcast" || msg.from.endsWith("@g.us") || msg.fromMe || (!msg.body && !incomingAudio)) {
    return
  }

  const now = Date.now()
  const lastMessageAt = antiSpam.get(msg.from) || 0
  if (now - lastMessageAt < 2500) return
  antiSpam.set(msg.from, now)

  const chat = await msg.getChat()
  if (chat.isGroup) return

  const contact = await msg.getContact()
  const session = getSession(msg.from)
  const leadName = getLeadNameFromContact(contact)
  if (leadName) {
    session.leadName = leadName
  }

  let textOriginal = trimText(msg.body || "", 800)

  if (incomingAudio) {
    const media = await msg.downloadMedia()
    textOriginal = trimText((await transcribeAudioMessage(media)) || "", 800)

    if (!textOriginal) {
      await replyAndTrack({
        chat,
        incomingMessage: msg,
        session,
        text: applyLeadNameToReply(mensagens.audioNaoEntendido, session.leadName),
        patch: {
          stage: session.stage || DEFAULT_CONVERSATION_STAGE,
          status: "audio_nao_entendido",
          displayName: session.leadName || ""
        }
      })
      return
    }
  }

  if (!textOriginal) {
    return
  }

  const text = normalizeText(textOriginal)
  const userMessageText = incomingAudio ? `[audio] ${textOriginal}` : textOriginal

  appendConversationMessage(msg.from, "user", userMessageText, {
    stage: session.stage || DEFAULT_CONVERSATION_STAGE,
    status: "ativo",
    displayName: session.leadName || ""
  })
  pushHistory(session, "user", userMessageText)

  if (humanTriggers.some((item) => text.includes(item))) {
    session.stage = DEFAULT_CONVERSATION_STAGE
    session.leadStage = "fechamento"
    markHumanHandoff(msg.from, session)
    await replyAndTrack({
      chat,
      incomingMessage: msg,
      session,
      text: applyLeadNameToReply(mensagens.humano, session.leadName),
      patch: {
        stage: "aguardando_humano",
        status: "aguardando_humano",
        needsHuman: true,
        displayName: session.leadName || session.draft.fullName || ""
      }
    })
    return
  }

  if (statusTriggers.some((item) => text.includes(item))) {
    const data = readData()
    const client = findClientByPhone(data, msg.from)
    const order = client ? getLatestOrderForClient(data, client.id) : null

    await replyAndTrack({
      chat,
      incomingMessage: msg,
      session,
      text: buildStatusReply(order, client),
      patch: {
        stage: DEFAULT_CONVERSATION_STAGE,
        status: order ? "status_enviado" : "sem_pedido",
        displayName: session.leadName || client?.fullName || ""
      }
    })
    return
  }

  if (startBriefingTriggers.some((item) => text.includes(item))) {
    const flowMessage = await startBotFlow(msg, chat, session)
    pushHistory(session, "assistant", flowMessage)
    return
  }

  if (session.stage === "collect_name") {
    if (textOriginal.length < 3) {
      await replyAndTrack({
        chat,
        incomingMessage: msg,
        session,
        text: "Preciso de um nome um pouco mais completo para registrar seu atendimento. Pode me enviar novamente?",
        patch: { stage: "collect_name", status: "coletando_nome", displayName: session.leadName || "" }
      })
      return
    }

    session.draft.fullName = trimText(textOriginal, 120)
    session.stage = "collect_email"
    await replyAndTrack({
      chat,
      incomingMessage: msg,
      session,
      text: "Perfeito. Se fizer sentido para voce, agora me passe um e-mail para contato. Se preferir seguir sem e-mail, pode escrever pular.",
      patch: { stage: "collect_email", status: "coletando_email", displayName: session.draft.fullName }
    })
    return
  }

  if (session.stage === "collect_service") {
    session.draft.serviceType = parseServiceChoice(textOriginal)
    session.draft.eventType = session.draft.eventType || session.draft.serviceType
    session.stage = "collect_event_date"
    await replyAndTrack({
      chat,
      incomingMessage: msg,
      session,
      text: "Perfeito. Agora me diga a data do evento ou o prazo ideal de entrega, para eu organizar seu atendimento.",
      patch: { stage: "collect_event_date", status: "coletando_prazo", displayName: session.draft.fullName || "" }
    })
    return
  }

  if (session.stage === "collect_event_date") {
    if (text.includes("definir") || text.includes("nao sei") || text.includes("nao tenho")) {
      session.draft.eventDate = ""
    } else {
      const parsedDate = parseFlexibleDate(textOriginal)
      if (parsedDate) {
        session.draft.eventDate = parsedDate
      } else if (looksLikeEventDateText(textOriginal) || textOriginal.length >= 4) {
        session.draft.eventDate = trimText(textOriginal, 120)
      } else {
        await replyAndTrack({
          chat,
          incomingMessage: msg,
          session,
          text: "Nao consegui entender a data. Se preferir, pode me dizer de forma natural, como dia 18 de abril, ou informar que ainda vai definir.",
          patch: { stage: "collect_event_date", status: "coletando_prazo", displayName: session.draft.fullName || "" }
        })
        return
      }
    }

    session.stage = "collect_briefing"
    await replyAndTrack({
      chat,
      incomingMessage: msg,
      session,
      text:
        "Otimo 💕\n\nAgora me passe o briefing que voce ja tem: nome, idade, horario, local, texto principal, referencias e qualquer detalhe importante que queira colocar.",
      patch: { stage: "collect_briefing", status: "coletando_briefing", displayName: session.draft.fullName || "" }
    })
    return
  }

  if (session.stage === "collect_briefing") {
    if (textOriginal.length < 8) {
      await replyAndTrack({
        chat,
        incomingMessage: msg,
        session,
        text: "Pode me contar um pouco mais sobre o que voce precisa? Isso ajuda a equipe da Criarte a receber um briefing completo.",
        patch: { stage: "collect_briefing", status: "coletando_briefing", displayName: session.draft.fullName || "" }
      })
      return
    }

    session.draft.briefing = trimText(textOriginal, 1200)
    session.draft.eventType = session.draft.eventType || trimText(textOriginal, 120)
    session.stage = "collect_name"
    await replyAndTrack({
      chat,
      incomingMessage: msg,
      session,
      text: "Perfeito. Para eu registrar tudo certinho no sistema da Criarte, qual nome completo devo colocar no seu atendimento?",
      patch: { stage: "collect_name", status: "coletando_nome", displayName: session.leadName || "" }
    })
    return
  }

  if (session.stage === "collect_email") {
    if (text === "pular") {
      session.draft.email = ""
    } else {
      const email = trimText(textOriginal, 160)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await replyAndTrack({
          chat,
          incomingMessage: msg,
          session,
          text: "Esse e-mail parece invalido. Pode enviar novamente ou digitar pular.",
          patch: { stage: "collect_email", status: "coletando_email", displayName: session.draft.fullName || "" }
        })
        return
      }

      session.draft.email = email
    }

    session.stage = "confirm_order"
    await replyAndTrack({
      chat,
      incomingMessage: msg,
      session,
      text: buildConfirmationSummary(session.draft),
      patch: { stage: "confirm_order", status: "confirmando", displayName: session.draft.fullName || "" }
    })
    return
  }

  if (session.stage === "confirm_order") {
    if (text.includes("cancel")) {
      session.stage = DEFAULT_CONVERSATION_STAGE
      session.draft = createEmptyDraft(msg.from)
      await replyAndTrack({
        chat,
        incomingMessage: msg,
        session,
        text: "Tudo certo. Nao registrei o pedido.\n\nSe quiser retomar depois, eu continuo por aqui.",
        patch: { stage: DEFAULT_CONVERSATION_STAGE, status: "ativo", displayName: session.leadName || "" }
      })
      return
    }

    if (!["confirmo", "confirmar", "pode seguir", "sim", "ok"].some((item) => text.includes(item))) {
      await replyAndTrack({
        chat,
        incomingMessage: msg,
        session,
        text: "Se estiver tudo certo, me responda confirmo. Se quiser mudar algo, me diga o ajuste ou escreva cancelar.",
        patch: { stage: "confirm_order", status: "confirmando", displayName: session.draft.fullName || "" }
      })
      return
    }

    const { client, order } = registerLead(msg.from, session)
    session.stage = DEFAULT_CONVERSATION_STAGE
    session.draft = createEmptyDraft(msg.from)
    session.leadStage = "fechamento"

    await replyAndTrack({
      chat,
      incomingMessage: msg,
      session,
      text:
        `Perfeito. Seu atendimento foi registrado com sucesso na ${APP_NAME} ✨\n\nNumero do pedido: ${order.id}\nCliente: ${client.fullName}\nServico: ${order.serviceType}\nStatus inicial: ${order.orderStatus}\n\nNossa equipe pode continuar por este mesmo WhatsApp.`,
      patch: {
        stage: "novo_pedido",
        status: "aguardando_contato",
        needsHuman: true,
        clientId: client.id,
        orderId: order.id,
        summary: order.briefing,
        displayName: client.fullName
      }
    })
    return
  }

  const aiReply = await generateSalesReply({
    message: textOriginal,
    history: session.history.slice(0, -1),
    leadName: session.leadName,
    leadStage: session.leadStage,
    salesConfig
  })

  if (aiReply?.leadStage) {
    session.leadStage = aiReply.leadStage
  }

  if (aiReply?.intent === "encaminhar_humano") {
    session.stage = DEFAULT_CONVERSATION_STAGE
    markHumanHandoff(msg.from, session)

    await replyAndTrack({
      chat,
      incomingMessage: msg,
      session,
      text: applyLeadNameToReply(aiReply.reply || mensagens.humano, session.leadName),
      patch: {
        stage: "aguardando_humano",
        status: "aguardando_humano",
        needsHuman: true,
        summary: trimText(aiReply.summary || "", 1200),
        displayName: session.leadName || session.draft.fullName || ""
      }
    })
    return
  }

  if (aiReply?.intent === "iniciar_briefing") {
    const flowMessage = await startBotFlow(
      msg,
      chat,
      session,
      applyLeadNameToReply(aiReply.reply || mensagens.demonstracao, session.leadName)
    )
    pushHistory(session, "assistant", flowMessage)
    return
  }

  const replyText = applyLeadNameToReply(
    aiReply?.reply || buildFallbackSalesReply(text, session.leadName, session.history.length <= 1),
    session.leadName
  )

  await replyAndTrack({
    chat,
    incomingMessage: msg,
    session,
    text: replyText,
    patch: {
      stage: collectingStages.has(session.stage) ? session.stage : DEFAULT_CONVERSATION_STAGE,
      status: aiReply?.leadStage || "ativo",
      summary: trimText(aiReply?.summary || "", 1200),
      displayName: session.leadName || session.draft.fullName || ""
    }
  })
}

const safeRequireWhatsApp = () => {
  try {
    const { Client, LocalAuth } = require("whatsapp-web.js")
    qrcodeTerminal = require("qrcode-terminal")
    QRCode = require("qrcode")
    botRuntime.dependenciesReady = true
    return { Client, LocalAuth }
  } catch (error) {
    whatsappBootstrapError = error
    botRuntime.dependenciesReady = false
    botRuntime.status = "dependencias_ausentes"
    botRuntime.lastError = error.message
    return null
  }
}

const startWhatsApp = () => {
  if (!botRuntime.enabled) {
    botRuntime.status = "desativado"
    return
  }

  const dependencies = safeRequireWhatsApp()
  if (!dependencies) {
    console.log("WhatsApp nao iniciado. Instale as dependencias com npm install.")
    return
  }

  const { Client, LocalAuth } = dependencies

  whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    }
  })

  whatsappClient.on("qr", async (qr) => {
    botRuntime.connected = false
    botRuntime.status = "qr_disponivel"
    botRuntime.qrUpdatedAt = nowIso()

    try {
      qrcodeTerminal.generate(qr, { small: false })
      botRuntime.qrDataUrl = await QRCode.toDataURL(qr, { errorCorrectionLevel: "H", margin: 2, width: 420 })
      botRuntime.qrPngBuffer = await QRCode.toBuffer(qr, { errorCorrectionLevel: "H", margin: 2, width: 420 })
      console.log("Novo QR gerado. Abra /qr para escanear.")
    } catch (error) {
      botRuntime.lastError = error.message
      botRuntime.qrDataUrl = null
      botRuntime.qrPngBuffer = null
    }
  })

  whatsappClient.on("ready", () => {
    botRuntime.connected = true
    botRuntime.status = "conectado"
    botRuntime.qrDataUrl = null
    botRuntime.qrPngBuffer = null
    botRuntime.qrUpdatedAt = nowIso()
    botRuntime.lastError = ""
    console.log("Bot WhatsApp da Criarte conectado.")
    console.log(`IA habilitada: ${aiStatusReason}`)
    console.log(`Transcricao de audio: ${audioTranscriptionStatusReason}`)
    console.log(`Resposta em audio: ${audioReplyStatusReason}`)
  })

  whatsappClient.on("auth_failure", (error) => {
    botRuntime.connected = false
    botRuntime.status = "erro"
    botRuntime.lastError = String(error || "Falha de autenticacao")
  })

  whatsappClient.on("disconnected", (reason) => {
    botRuntime.connected = false
    botRuntime.status = "erro"
    botRuntime.lastError = String(reason || "Desconectado")
    botRuntime.qrDataUrl = null
    botRuntime.qrPngBuffer = null
  })

  whatsappClient.on("message", async (msg) => {
    try {
      return await handleIncomingWhatsAppMessage(msg)
      if (!msg.from || msg.from === "status@broadcast" || msg.from.endsWith("@g.us") || msg.fromMe || !msg.body) {
        return
      }

      const now = Date.now()
      const lastMessageAt = antiSpam.get(msg.from) || 0
      if (now - lastMessageAt < 2500) return
      antiSpam.set(msg.from, now)

      const chat = await msg.getChat()
      if (chat.isGroup) return

      const textOriginal = trimText(msg.body, 800)
      const text = normalizeText(textOriginal)
      appendConversationMessage(msg.from, "user", textOriginal)

      if (!sessions.has(msg.from)) {
        sessions.set(msg.from, { stage: "menu", draft: { phone: comparablePhone(msg.from) } })
      }

      const session = sessions.get(msg.from)
      const menuTriggers = /^(menu|oi|ola|ol[aá]|bom dia|boa tarde|boa noite|orcamento|pedido)$/i
      const servicesTriggers = ["servico", "servicos", "catalogo", "portfolio", "convite", "arte", "logo", "identidade"]
      const statusTriggers = ["acompanhar", "status", "meu pedido", "andamento"]
      const humanTriggers = ["atendente", "humano", "pessoa", "suporte"]
      const pricingTriggers = ["preco", "precos", "valor", "valores", "quanto custa", "investimento"]
      const paymentTriggers = ["pix", "cartao", "cartão", "pagamento", "parcelado", "sinal", "entrada"]
      const urgencyTriggers = ["urgente", "urgencia", "urgência", "pra hoje", "pra amanha", "pra amanhã", "rapido", "rápido"]
      const portfolioTriggers = ["portfolio", "portifolio", "portfólio", "exemplos", "modelos", "trabalhos"]
      const serviceOfferKey = detectServiceOffer(text)

      if (menuTriggers.test(text)) {
        session.stage = "menu"
        session.draft = { phone: comparablePhone(msg.from) }
        await sendTyping(chat)
        await sendBotMessage(msg.from, welcomeMessage, { stage: "menu", status: "ativo" })
        return
      }

      if (humanTriggers.some((item) => text.includes(item)) || (session.stage === "menu" && text === "4")) {
        session.stage = "menu"
        markHumanHandoff(msg.from, session)
        await sendTyping(chat)
        await sendBotMessage(msg.from, handoffMessage, {
          stage: "aguardando_humano",
          status: "aguardando_humano",
          needsHuman: true
        })
        return
      }

      if (pricingTriggers.some((item) => text.includes(item)) && session.stage === "menu") {
        await sendTyping(chat)
        await sendBotMessage(msg.from, pricingMessage, { stage: "menu", status: "venda_preco" })
        return
      }

      if (paymentTriggers.some((item) => text.includes(item)) && session.stage === "menu") {
        await sendTyping(chat)
        await sendBotMessage(msg.from, paymentMessage, { stage: "menu", status: "venda_pagamento" })
        return
      }

      if (urgencyTriggers.some((item) => text.includes(item)) && session.stage === "menu") {
        await sendTyping(chat)
        await sendBotMessage(msg.from, urgencyMessage, { stage: "menu", status: "venda_urgencia" })
        return
      }

      if (portfolioTriggers.some((item) => text.includes(item)) && session.stage === "menu") {
        await sendTyping(chat)
        await sendBotMessage(msg.from, portfolioMessage, { stage: "menu", status: "venda_portfolio" })
        return
      }

      if (serviceOfferKey && session.stage === "menu") {
        await sendTyping(chat)
        await sendBotMessage(msg.from, buildServiceOfferMessage(serviceOfferKey), {
          stage: "menu",
          status: `oferta_${serviceOfferKey}`
        })
        return
      }

      if ((servicesTriggers.some((item) => text.includes(item)) || (session.stage === "menu" && text === "2"))) {
        await sendTyping(chat)
        await sendBotMessage(msg.from, servicesMessage, { stage: "menu", status: "ativo" })
        return
      }

      if ((statusTriggers.some((item) => text.includes(item)) || (session.stage === "menu" && text === "3"))) {
        const data = readData()
        const client = findClientByPhone(data, msg.from)
        const order = client ? getLatestOrderForClient(data, client.id) : null
        await sendTyping(chat)
        await sendBotMessage(msg.from, buildStatusReply(order, client), {
          stage: "menu",
          status: order ? "status_enviado" : "sem_pedido"
        })
        return
      }

      if ((text === "1" && session.stage === "menu") || text.includes("orcamento")) {
        await startBotFlow(msg, chat, session)
        return
      }

      if (session.stage === "collect_name") {
        if (textOriginal.length < 3) {
          await sendTyping(chat)
          await sendBotMessage(msg.from, "🙂 Preciso de um nome um pouco mais completo para registrar seu atendimento. Pode me enviar novamente?")
          return
        }

        session.draft.fullName = trimText(textOriginal, 120)
        session.stage = "collect_service"
        await sendTyping(chat)
        await sendBotMessage(
          msg.from,
          "🎨 Qual servico voce quer pedir?\n\n1. 💌 Convite digital\n2. 📱 Arte para Instagram\n3. ✨ Arte personalizada\n4. 🧠 Logotipo\n5. 🏷️ Identidade visual\n\nSe preferir, pode responder com seu proprio texto."
        )
        return
      }

      if (session.stage === "collect_service") {
        session.draft.serviceType = parseServiceChoice(textOriginal)
        const selectedOfferKey = detectServiceOffer(session.draft.serviceType)
        session.stage = "collect_event_type"
        await sendTyping(chat)
        await sendBotMessage(
          msg.from,
          `${selectedOfferKey ? `${buildServiceOfferMessage(selectedOfferKey)}\n\n` : ""}🎯 Perfeito! Agora me conte o tipo de evento ou objetivo dessa arte.`
        )
        return
      }

      if (session.stage === "collect_event_type") {
        session.draft.eventType = trimText(textOriginal, 120)
        session.stage = "collect_event_date"
        await sendTyping(chat)
        await sendBotMessage(
          msg.from,
          "📅 Qual a data do evento ou o prazo ideal de entrega?\n\nVoce pode responder no formato DD/MM/AAAA ou digitar *a definir*."
        )
        return
      }

      if (session.stage === "collect_event_date") {
        if (text.includes("definir") || text.includes("nao sei") || text.includes("nao tenho")) {
          session.draft.eventDate = ""
        } else {
          const parsedDate = parseFlexibleDate(textOriginal)
          if (!parsedDate) {
            await sendTyping(chat)
            await sendBotMessage(msg.from, "📅 Nao consegui entender a data. Pode enviar no formato DD/MM/AAAA ou responder *a definir*?")
            return
          }
          session.draft.eventDate = parsedDate
        }

        session.stage = "collect_briefing"
        await sendTyping(chat)
        await sendBotMessage(
          msg.from,
          "📝 Agora me envie um briefing rapido.\n\nExemplo: tema, cores, texto principal, publico, referencias e qualquer detalhe importante."
        )
        return
      }

      if (session.stage === "collect_briefing") {
        if (textOriginal.length < 8) {
          await sendTyping(chat)
          await sendBotMessage(msg.from, "✨ Pode me contar um pouco mais sobre o que voce precisa? Isso ajuda a equipe da Criarte a receber um briefing completo.")
          return
        }

        session.draft.briefing = trimText(textOriginal, 1200)
        session.stage = "collect_email"
        await sendTyping(chat)
        await sendBotMessage(msg.from, "📩 Se quiser, me passe um e-mail para contato. Se preferir pular, digite *pular*.")
        return
      }

      if (session.stage === "collect_email") {
        if (text === "pular") {
          session.draft.email = ""
        } else {
          const email = trimText(textOriginal, 160)
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            await sendTyping(chat)
            await sendBotMessage(msg.from, "📩 Esse e-mail parece invalido. Pode enviar novamente ou digitar *pular*.")
            return
          }
          session.draft.email = email
        }

        session.stage = "confirm_order"
        await sendTyping(chat)
        await sendBotMessage(msg.from, buildConfirmationSummary(session.draft))
        return
      }

      if (session.stage === "confirm_order") {
        if (text === "2" || text.includes("cancel")) {
          session.stage = "menu"
          session.draft = { phone: comparablePhone(msg.from) }
          await sendTyping(chat)
          await sendBotMessage(msg.from, "Tudo certo 😊 O pedido nao foi registrado.\n\nSe quiser recomecar, digite *orcamento*.")
          return
        }

        if (text !== "1" && !text.includes("confirm")) {
          await sendTyping(chat)
          await sendBotMessage(msg.from, "✅ Para concluir, responda com *1* para confirmar ou *2* para cancelar.")
          return
        }

        const { client, order } = registerLead(msg.from, session)
        session.stage = "menu"
        session.draft = { phone: comparablePhone(msg.from) }

        await sendTyping(chat)
        await sendBotMessage(
          msg.from,
          `🎉 Pronto! Seu atendimento foi registrado com sucesso na *${APP_NAME}*.\n\n🧾 Numero do pedido: ${order.id}\n👤 Cliente: ${client.fullName}\n🎨 Servico: ${order.serviceType}\n📍 Status inicial: ${order.orderStatus}\n\n💬 Nossa equipe pode continuar por este mesmo WhatsApp.`,
          {
            stage: "novo_pedido",
            status: "aguardando_contato",
            needsHuman: true,
            clientId: client.id,
            orderId: order.id,
            summary: order.briefing
          }
        )
        return
      }

      await sendTyping(chat)
      await sendBotMessage(
        msg.from,
        "🤍 Nao entendi essa mensagem.\n\nDigite *menu* para ver as opcoes, *orcamento* para abrir um pedido ou *status* para acompanhar seu atendimento.",
        { stage: session.stage || "menu", status: "ativo" }
      )
    } catch (error) {
      botRuntime.status = "erro"
      botRuntime.lastError = error.message
      console.log("Erro no bot:", error)
    }
  })

  whatsappClient.initialize().catch((error) => {
    botRuntime.status = "erro"
    botRuntime.lastError = error.message
    console.log("Falha ao iniciar WhatsApp:", error)
  })
}

const serveQrPage = (res) => {
  const payload = getBotStatusPayload()
  const page = botRuntime.qrDataUrl
    ? `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="15" />
    <title>QR WhatsApp Criarte</title>
    <style>
      :root {
        --bg: #fcf6f1;
        --card: #fffdfa;
        --text: #34251f;
        --muted: #7a6155;
        --accent: #d95f4d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top, rgba(217, 95, 77, 0.14), transparent 32%),
          linear-gradient(180deg, #fff4eb 0%, var(--bg) 100%);
        color: var(--text);
        font-family: Arial, sans-serif;
      }
      main {
        width: min(100%, 560px);
        background: var(--card);
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 18px 40px rgba(52, 37, 31, 0.12);
        text-align: center;
      }
      h1 { margin: 0 0 8px; font-size: 28px; }
      p { margin: 0 0 14px; line-height: 1.5; color: var(--muted); }
      img {
        width: min(100%, 420px);
        height: auto;
        padding: 16px;
        border-radius: 18px;
        background: #fff;
      }
      .status {
        display: inline-block;
        margin-top: 16px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(217, 95, 77, 0.12);
        color: var(--accent);
        font-size: 14px;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Escaneie o QR Code</h1>
      <p>Use o WhatsApp da Criarte para autenticar o bot. Esta pagina atualiza sozinha.</p>
      <img src="/qr.png?t=${encodeURIComponent(botRuntime.qrUpdatedAt || "")}" alt="QR Code do WhatsApp" />
      <div class="status">Atualizado em: ${escapeHtml(botRuntime.qrUpdatedAt || "")}</div>
    </main>
  </body>
</html>`
    : payload.connected
    ? `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="20" />
    <title>WhatsApp conectado</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: linear-gradient(180deg, #f2fff9 0%, #e8f8ef 100%);
        color: #14532d;
        font-family: Arial, sans-serif;
      }
      main {
        max-width: 480px;
        background: #fcfffd;
        border-radius: 24px;
        padding: 28px;
        text-align: center;
        box-shadow: 0 18px 40px rgba(20, 83, 45, 0.12);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>WhatsApp conectado</h1>
      <p>O agente de IA da Criarte ja esta autenticado e pronto para atender.</p>
      <p>Atualizado em: ${escapeHtml(payload.updatedAt || nowIso())}</p>
    </main>
  </body>
</html>`
    : `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="10" />
    <title>Aguardando QR</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #fcf6f1;
        color: #34251f;
        font-family: Arial, sans-serif;
      }
      main {
        max-width: 480px;
        background: #fffdfa;
        border-radius: 24px;
        padding: 24px;
        text-align: center;
        box-shadow: 0 18px 40px rgba(52, 37, 31, 0.12);
      }
      p { color: #7a6155; }
    </style>
  </head>
  <body>
    <main>
      <h1>Aguardando QR Code</h1>
      <p>${escapeHtml(payload.statusLabel)}.</p>
      <p>Assim que o WhatsApp gerar um novo QR, ele aparece aqui automaticamente.</p>
      ${payload.lastError ? `<p>Ultimo erro: ${escapeHtml(payload.lastError)}</p>` : ""}
    </main>
  </body>
</html>`

  sendText(res, 200, page, "text/html; charset=utf-8")
}

const serveQrPng = (res) => {
  if (!botRuntime.qrPngBuffer) {
    sendJson(res, 404, { status: botRuntime.status })
    return
  }

  res.writeHead(200, {
    ...headersSemCache,
    "Content-Type": "image/png",
    "Content-Length": botRuntime.qrPngBuffer.length
  })
  res.end(botRuntime.qrPngBuffer)
}

const serveStatic = (pathname, res) => {
  const target = STATIC_FILES[pathname]
  if (!target) {
    sendText(res, 404, "Arquivo nao encontrado.")
    return
  }

  const filePath = path.join(APP_DIR, target)
  const ext = path.extname(filePath)
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream"
  const content = fs.readFileSync(filePath)
  res.writeHead(200, { ...headersSemCache, "Content-Type": contentType })
  res.end(content)
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
    const { pathname } = requestUrl

    if (req.method === "OPTIONS") {
      res.writeHead(204, headersSemCache)
      res.end()
      return
    }

    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        app: APP_NAME,
        description: APP_DESCRIPTION,
        startedAt: botRuntime.serverStartedAt
      })
      return
    }

    if (req.method === "GET" && pathname === "/api/data") {
      sendJson(res, 200, readData())
      return
    }

    if (req.method === "PUT" && pathname === "/api/data") {
      const body = await readBody(req)
      const parsed = JSON.parse(body || "{}")
      const saved = writeData(parsed)
      sendJson(res, 200, saved)
      return
    }

    if (req.method === "GET" && pathname === "/api/bot/status") {
      sendJson(res, 200, getBotStatusPayload())
      return
    }

    if (req.method === "GET" && pathname === "/qr") {
      serveQrPage(res)
      return
    }

    if (req.method === "GET" && pathname === "/qr.png") {
      serveQrPng(res)
      return
    }

    if (req.method === "GET" && (pathname in STATIC_FILES)) {
      serveStatic(pathname, res)
      return
    }

    if (req.method === "GET" && pathname === "/favicon.ico") {
      res.writeHead(204)
      res.end()
      return
    }

    sendText(res, 404, "Rota nao encontrada.")
  } catch (error) {
    sendJson(res, 500, { error: error.message, details: whatsappBootstrapError?.message || "" })
  }
})

ensureDataFile()
startWhatsApp()

server.listen(PORT, () => {
  console.log(`${APP_NAME} ativo em http://localhost:${PORT}`)
  console.log("Painel web e API compartilhada inicializados.")
})
