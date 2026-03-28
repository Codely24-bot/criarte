const APP_KEY = "criarte_admin_data_v2"
const SESSION_KEY = "criarte_admin_session"
const THEME_KEY = "criarte_admin_theme"
const DATA_ENDPOINT = "/api/data"
const BOT_STATUS_ENDPOINT = "/api/bot/status"
const HEALTH_ENDPOINT = "/api/health"
const SERVER_ORIGIN_CANDIDATES = Array.from(
  new Set([window.location.origin, "http://localhost:3000", "http://127.0.0.1:3000"])
)

const SERVICE_OPTIONS = [
  "Convite digital",
  "Mascotinho personalizado",
  "Arte para redes sociais",
  "Arte para Instagram",
  "Arte personalizada",
  "Logotipo",
  "Identidade visual"
]
const PAYMENT_METHOD_OPTIONS = ["A definir", "PIX", "Cartao", "Boleto", "Dinheiro", "Transferencia"]
const PAYMENT_STATUS_OPTIONS = ["Pago", "50% pago", "Pendente"]
const ORDER_STATUS_OPTIONS = ["Novo lead", "Aguardando pagamento", "Em criacao", "Em aprovacao", "Finalizado", "Entregue"]
const ORDER_DONE_STATUSES = ["Finalizado", "Entregue"]
const ORDER_ACTIVE_STATUSES = ["Novo lead", "Aguardando pagamento", "Em criacao", "Em aprovacao"]
const MANUAL_SOURCE_OPTIONS = ["Manual", "WhatsApp", "Instagram", "Site"]

const root = document.getElementById("app")

const state = {
  users: [],
  clients: [],
  orders: [],
  conversations: [],
  editingClientId: null,
  editingOrderId: null,
  currentView: "dashboard",
  storageMode: "browser",
  serverOrigin: "",
  lastSyncAt: "",
  syncMessage: "Modo local",
  botStatus: {
    enabled: false,
    dependenciesReady: false,
    connected: false,
    status: "indisponivel",
    statusLabel: "Indisponivel",
    qrPagePath: "/qr",
    qrImagePath: "/qr.png",
    updatedAt: "",
    lastError: "",
    botOrders: 0,
    pendingHuman: 0
  }
}

const BOT_QR_REFRESH_MS = 10000
let botPanelRefreshTimer = null
let serverOriginLookupPromise = null

const nowDate = () => new Date().toISOString().slice(0, 10)
const nowIso = () => new Date().toISOString()
const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`
const getSession = () => localStorage.getItem(SESSION_KEY)
const setSession = (userId) => localStorage.setItem(SESSION_KEY, userId)
const clearSession = () => localStorage.removeItem(SESSION_KEY)
const getTheme = () => (localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light")

const normalizePhone = (value = "") => String(value).replace(/\D/g, "")
const comparablePhone = (value = "") => {
  const digits = normalizePhone(value)
  if (!digits) return ""
  return digits.length > 11 ? digits.slice(-11) : digits
}

const formatMoney = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const formatDate = (value) => {
  if (!value) return "-"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("pt-BR")
}

const formatDateTime = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("pt-BR")
}

const truncateText = (value = "", max = 120) => {
  const text = String(value || "").trim()
  if (text.length <= max) return text || "-"
  return `${text.slice(0, max - 1)}...`
}

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const joinUrl = (origin, pathname) => `${String(origin || "").replace(/\/+$/, "")}${pathname}`

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

const normalizeClient = (client = {}) => ({
  id: String(client.id || id("c")),
  fullName: String(client.fullName || "").trim(),
  phone: normalizePhone(client.phone || ""),
  email: String(client.email || "").trim(),
  eventDate: String(client.eventDate || ""),
  eventType: String(client.eventType || ""),
  notes: String(client.notes || "").trim(),
  source: String(client.source || "Manual"),
  createdAt: String(client.createdAt || nowIso())
})

const normalizeOrder = (order = {}) => ({
  id: String(order.id || id("o")),
  clientId: String(order.clientId || ""),
  serviceType: String(order.serviceType || ""),
  serviceValue: Number(order.serviceValue || 0),
  paymentMethod: PAYMENT_METHOD_OPTIONS.includes(order.paymentMethod) ? order.paymentMethod : "A definir",
  paymentStatus: PAYMENT_STATUS_OPTIONS.includes(order.paymentStatus) ? order.paymentStatus : "Pendente",
  orderStatus: ORDER_STATUS_OPTIONS.includes(order.orderStatus) ? order.orderStatus : "Novo lead",
  startDate: String(order.startDate || nowDate()),
  dueDate: String(order.dueDate || ""),
  finalFileName: String(order.finalFileName || ""),
  finalFileData: typeof order.finalFileData === "string" ? order.finalFileData : "",
  briefing: String(order.briefing || "").trim(),
  source: String(order.source || "Manual"),
  contactPhone: normalizePhone(order.contactPhone || ""),
  conversationId: String(order.conversationId || ""),
  createdAt: String(order.createdAt || nowIso()),
  updatedAt: String(order.updatedAt || nowIso())
})

const normalizeConversation = (conversation = {}) => ({
  id: String(conversation.id || id("conv")),
  phone: normalizePhone(conversation.phone || ""),
  stage: String(conversation.stage || "conversa"),
  status: String(conversation.status || "ativo"),
  displayName: String(conversation.displayName || ""),
  orderId: String(conversation.orderId || ""),
  clientId: String(conversation.clientId || ""),
  needsHuman: Boolean(conversation.needsHuman),
  updatedAt: String(conversation.updatedAt || nowIso()),
  summary: String(conversation.summary || ""),
  messages: Array.isArray(conversation.messages)
    ? conversation.messages.map((message) => ({
        direction: message.direction === "bot" ? "bot" : "user",
        text: String(message.text || ""),
        timestamp: String(message.timestamp || nowIso())
      }))
    : []
})

const applyData = (data = {}) => {
  const fallback = defaultData()
  state.users = Array.isArray(data.users) && data.users.length ? data.users : fallback.users
  state.clients = (Array.isArray(data.clients) ? data.clients : fallback.clients).map(normalizeClient)
  state.orders = (Array.isArray(data.orders) ? data.orders : fallback.orders).map(normalizeOrder)
  state.conversations = (Array.isArray(data.conversations) ? data.conversations : []).map(normalizeConversation)
}

const snapshotData = () => ({
  users: state.users,
  clients: state.clients,
  orders: state.orders,
  conversations: state.conversations
})

const backupLocalData = (data) => {
  localStorage.setItem(APP_KEY, JSON.stringify(data))
}

const loadLocalData = () => {
  const raw = localStorage.getItem(APP_KEY)
  if (!raw) return defaultData()

  try {
    return JSON.parse(raw)
  } catch (error) {
    return defaultData()
  }
}

const requestJson = async (url, options = {}) => {
  const headers = { ...(options.headers || {}) }
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers,
    ...options
  })

  if (!response.ok) {
    throw new Error(`Falha na requisicao: ${response.status}`)
  }

  return response.json()
}

const findServerOrigin = async () => {
  for (const origin of SERVER_ORIGIN_CANDIDATES) {
    try {
      const response = await fetch(joinUrl(origin, HEALTH_ENDPOINT), { cache: "no-store" })
      if (response.ok) return origin
    } catch (error) {
      continue
    }
  }

  return ""
}

const ensureServerOrigin = async (force = false) => {
  if (state.serverOrigin && !force) return state.serverOrigin
  if (serverOriginLookupPromise && !force) return serverOriginLookupPromise

  serverOriginLookupPromise = findServerOrigin()
    .then((origin) => {
      state.serverOrigin = origin
      return origin
    })
    .finally(() => {
      serverOriginLookupPromise = null
    })

  return serverOriginLookupPromise
}

const buildServerUrl = (pathname, origin = state.serverOrigin) => {
  if (!origin) return pathname
  return joinUrl(origin, pathname)
}

const getQrPageUrl = () => buildServerUrl(state.botStatus.qrPagePath || "/qr")
const getQrImageUrl = () => buildServerUrl(state.botStatus.qrImagePath || "/qr.png")

const loadData = async () => {
  try {
    const serverOrigin = await ensureServerOrigin()
    if (!serverOrigin) throw new Error("Servidor integrado nao encontrado")

    const data = await requestJson(buildServerUrl(DATA_ENDPOINT, serverOrigin))
    applyData(data)
    backupLocalData(snapshotData())
    state.storageMode = "server"
    state.serverOrigin = serverOrigin
    state.lastSyncAt = nowIso()
    state.syncMessage = "Sincronizado com o servidor"
    return
  } catch (error) {
    applyData(loadLocalData())
    state.storageMode = "browser"
    state.syncMessage = "Modo local sem integracao com bot"
  }
}

const saveData = async () => {
  const data = snapshotData()
  backupLocalData(data)

  if (state.storageMode !== "server") {
    state.lastSyncAt = nowIso()
    return
  }

  try {
    const serverOrigin = await ensureServerOrigin()
    if (!serverOrigin) throw new Error("Servidor integrado nao encontrado")

    const saved = await requestJson(buildServerUrl(DATA_ENDPOINT, serverOrigin), {
      method: "PUT",
      body: JSON.stringify(data)
    })
    applyData(saved)
    backupLocalData(snapshotData())
    state.serverOrigin = serverOrigin
    state.lastSyncAt = nowIso()
    state.syncMessage = "Dados sincronizados"
  } catch (error) {
    state.storageMode = "browser"
    state.syncMessage = "Falha ao sincronizar. Dados mantidos no navegador."
  }
}

const loadBotStatus = async () => {
  const serverOrigin = await ensureServerOrigin()
  if (!serverOrigin) {
    state.serverOrigin = ""
    state.botStatus = {
      ...state.botStatus,
      enabled: false,
      dependenciesReady: false,
      connected: false,
      status: "indisponivel",
      statusLabel: "Indisponivel",
      updatedAt: "",
      lastError: "",
      botOrders: state.orders.filter((order) => order.source === "WhatsApp").length,
      pendingHuman: state.conversations.filter((conversation) => conversation.needsHuman).length
    }
    return
  }

  try {
    state.serverOrigin = serverOrigin
    state.botStatus = await requestJson(buildServerUrl(BOT_STATUS_ENDPOINT, serverOrigin))
  } catch (error) {
    state.botStatus = {
      ...state.botStatus,
      connected: false,
      status: "erro",
      statusLabel: "Erro ao consultar bot",
      lastError: error.message
    }
  }
}

const setTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme)
  localStorage.setItem(THEME_KEY, theme)
  const toggle = document.getElementById("themeToggle")
  if (toggle) toggle.textContent = theme === "light" ? "Tema escuro" : "Tema claro"
  const loginToggle = document.getElementById("themeToggleLogin")
  if (loginToggle) loginToggle.textContent = theme === "light" ? "Tema escuro" : "Tema claro"
}

const getClientById = (clientId) => state.clients.find((client) => client.id === clientId) || null
const clientName = (clientId) => getClientById(clientId)?.fullName || "-"

const getConversationById = (conversationId) =>
  state.conversations.find((conversation) => conversation.id === conversationId) || null

const isLateOrder = (order) => !ORDER_DONE_STATUSES.includes(order.orderStatus) && order.dueDate && order.dueDate < nowDate()

const daysUntil = (dateStr) => {
  if (!dateStr) return 999
  const ms = new Date(dateStr).getTime() - new Date(nowDate()).getTime()
  return Math.ceil(ms / 86400000)
}

const paymentReceivedValue = (order) => {
  const value = Number(order.serviceValue || 0)
  if (order.paymentStatus === "Pago") return value
  if (order.paymentStatus === "50% pago") return value * 0.5
  return 0
}

const monthlyRevenue = () => {
  const month = new Date().toISOString().slice(0, 7)
  return state.orders
    .filter((order) => (order.startDate || "").slice(0, 7) === month)
    .reduce((acc, order) => acc + paymentReceivedValue(order), 0)
}

const ordersByMonth = () => {
  const result = Array.from({ length: 12 }, (_, month) => ({ month, count: 0 }))
  state.orders.forEach((order) => {
    if (!order.startDate) return
    const month = new Date(order.startDate).getMonth()
    if (!Number.isNaN(month)) result[month].count += 1
  })
  return result
}

const getAlerts = () => {
  const dueSoon = state.orders.filter((order) => {
    const days = daysUntil(order.dueDate)
    return days >= 0 && days <= 2 && !ORDER_DONE_STATUSES.includes(order.orderStatus)
  })
  const pendingPayments = state.orders.filter((order) => order.paymentStatus !== "Pago" && Number(order.serviceValue || 0) > 0)
  const late = state.orders.filter(isLateOrder)
  return { dueSoon, pendingPayments, late }
}

const dashboardKPIs = () => {
  const activeOrders = state.orders.filter((order) => !ORDER_DONE_STATUSES.includes(order.orderStatus)).length
  const inProgress = state.orders.filter((order) => ["Em criacao", "Em aprovacao"].includes(order.orderStatus)).length
  const completed = state.orders.filter((order) => ORDER_DONE_STATUSES.includes(order.orderStatus)).length
  const pendingPayments = state.orders.filter((order) => order.paymentStatus !== "Pago" && Number(order.serviceValue || 0) > 0).length
  const botLeads = state.orders.filter((order) => order.source === "WhatsApp").length

  return {
    totalClients: state.clients.length,
    activeOrders,
    inProgress,
    completed,
    pendingPayments,
    botLeads,
    monthlyRevenue: monthlyRevenue()
  }
}

const openFileForWhatsAppAttach = (order) => {
  if (!order.finalFileData) return
  const fileWindow = window.open(order.finalFileData, "_blank")
  if (!fileWindow) {
    alert("Nao foi possivel abrir o arquivo automaticamente. Verifique o bloqueador de pop-up.")
  }
}

const notifyFinishedOrder = (order) => {
  const client = getClientById(order.clientId)
  if (!client) return

  const rawPhone = comparablePhone(client.phone)
  if (!rawPhone) {
    alert("Pedido finalizado, mas o cliente nao possui telefone valido para WhatsApp.")
    return
  }

  const hasFile = Boolean(order.finalFileName && order.finalFileData)
  const message = [
    `Ola, ${client.fullName}!`,
    `Seu pedido de ${order.serviceType} foi finalizado pela Criarte.`,
    hasFile ? `Arquivo pronto: ${order.finalFileName}.` : "O arquivo final ainda nao foi anexado no sistema.",
    "Equipe Criarte."
  ].join(" ")

  const shouldOpenWhatsApp = confirm(
    hasFile
      ? "Pedido marcado como Finalizado. Deseja abrir o WhatsApp e o arquivo para envio ao cliente?"
      : "Pedido marcado como Finalizado. Deseja abrir o WhatsApp para avisar o cliente?"
  )

  if (!shouldOpenWhatsApp) return

  window.open(`https://wa.me/55${rawPhone}?text=${encodeURIComponent(message)}`, "_blank")
  if (hasFile) {
    openFileForWhatsAppAttach(order)
    alert("WhatsApp aberto. O arquivo foi aberto em outra aba para voce anexar na conversa.")
  } else {
    alert("WhatsApp aberto. Anexe o arquivo antes de enviar a mensagem ao cliente.")
  }
}

const readFileAsDataUrl = (file) =>
  new Promise((resolve) => {
    if (!file) {
      resolve({ name: "", data: "" })
      return
    }

    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, data: String(reader.result || "") })
    reader.onerror = () => resolve({ name: file.name, data: "" })
    reader.readAsDataURL(file)
  })

const sourceBadgeClass = (source) => {
  if (source === "WhatsApp") return "success"
  if (source === "Instagram") return "warning"
  if (source === "Site") return "source-site"
  return ""
}

const botStatusClass = () => {
  if (state.botStatus.connected) return "success"
  if (state.botStatus.status === "qr_disponivel") return "warning"
  if (["erro", "dependencias_ausentes"].includes(state.botStatus.status)) return "danger"
  return ""
}

const renderSyncPill = () =>
  `<div class="sync-pill ${state.storageMode === "server" ? "success" : "warning"}">
    ${state.storageMode === "server" ? "Modo integrado" : "Modo local"}
  </div>`

const renderTopbarActions = () => `
  <div class="topbar-actions">
    ${renderSyncPill()}
    <button id="refreshDataBtn" class="btn secondary" type="button">Sincronizar</button>
  </div>
`

const renderBotSummary = () => `
  <div class="status-row">
    <span class="status-dot ${botStatusClass()}"></span>
    <strong>${escapeHtml(state.botStatus.statusLabel || "Indisponivel")}</strong>
  </div>
  <p class="helper">
    ${state.storageMode === "server" ? "O painel esta ligado a mesma base do agente de IA." : "Abra via servidor para integrar com o agente de IA no WhatsApp."}
  </p>
  <div class="row">
    <button class="btn secondary small" data-action="open-qr" type="button">Abrir QR</button>
    <button class="btn secondary small" data-action="goto-bot" type="button">Ver agente de IA</button>
  </div>
`

const renderBotQrPanel = () => {
  if (state.storageMode !== "server") {
    return `
      <div class="qr-panel-empty">
        <strong>QR indisponivel no modo local</strong>
        <p class="helper">Abra o painel pelo servidor para carregar o QR do WhatsApp aqui dentro.</p>
      </div>
    `
  }

  if (state.botStatus.connected) {
    return `
      <div class="qr-panel-empty success">
        <strong>WhatsApp conectado</strong>
        <p class="helper">O agente de IA da Criarte ja esta autenticado e pronto para atender.</p>
      </div>
    `
  }

  if (state.botStatus.status === "qr_disponivel") {
    const qrSrc = `${getQrImageUrl()}?t=${encodeURIComponent(state.botStatus.updatedAt || nowIso())}`
    return `
      <div class="qr-panel">
        <a class="qr-preview-link" href="${getQrPageUrl()}" target="_blank" rel="noreferrer">
          <img class="qr-preview" src="${qrSrc}" alt="QR Code do WhatsApp da Criarte" />
        </a>
        <p class="helper">Escaneie com o WhatsApp da Criarte. Esta area atualiza sozinha enquanto a aba do agente de IA estiver aberta.</p>
      </div>
    `
  }

  return `
    <div class="qr-panel-empty">
      <strong>Aguardando novo QR</strong>
      <p class="helper">Assim que o WhatsApp gerar um codigo, ele aparece aqui no painel.</p>
    </div>
  `
}

const renderLogin = () => {
  stopBotPanelAutoRefresh()
  root.innerHTML = `
    <div class="login-screen">
      <div class="card login-card">
        <div class="section-head">
          <h2>Criarte Admin</h2>
          <button id="themeToggleLogin" class="btn secondary small" type="button"></button>
        </div>
        <p class="helper">Acesso ao painel administrativo e ao atendimento integrado da Criarte.</p>
        <form id="loginForm" class="list">
          <div>
            <label for="email">E-mail</label>
            <input id="email" class="input" type="email" required />
          </div>
          <div>
            <label for="password">Senha</label>
            <input id="password" class="input" type="password" required />
          </div>
          <button class="btn" type="submit">Entrar</button>
          <button id="forgotPass" class="btn secondary" type="button">Recuperar senha</button>
          <div id="loginError" class="helper"></div>
          <div class="helper">Credenciais iniciais: admin@criarte.com / 123456</div>
        </form>
      </div>
    </div>
  `

  setTheme(getTheme())

  document.getElementById("themeToggleLogin").addEventListener("click", () => {
    setTheme(getTheme() === "light" ? "dark" : "light")
  })

  document.getElementById("forgotPass").addEventListener("click", () => {
    const email = prompt("Digite seu e-mail para recuperar a senha:")
    if (!email) return
    const user = state.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase())
    alert(user ? `Senha atual: ${user.password}` : "E-mail nao encontrado.")
  })

  document.getElementById("loginForm").addEventListener("submit", (event) => {
    event.preventDefault()
    const email = document.getElementById("email").value.trim().toLowerCase()
    const password = document.getElementById("password").value
    const user = state.users.find((item) => item.email.toLowerCase() === email && item.password === password)

    if (!user) {
      document.getElementById("loginError").textContent = "Credenciais invalidas."
      return
    }

    setSession(user.id)
    renderApp()
  })
}

const renderChart = () => {
  const canvas = document.getElementById("ordersChart")
  if (!canvas) return

  const ctx = canvas.getContext("2d")
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const data = ordersByMonth()
  const max = Math.max(1, ...data.map((item) => item.count))
  const padding = 24
  const chartW = width - padding * 2
  const chartH = height - padding * 2
  const gap = 8
  const barW = chartW / 12 - gap

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-soft")
  ctx.font = "12px Poppins"

  data.forEach((item, index) => {
    const x = padding + index * (barW + gap)
    const h = (item.count / max) * (chartH - 20)
    const y = height - padding - h
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary")
    ctx.fillRect(x, y, barW, h)
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-soft")
    ctx.fillText(String(item.count), x + Math.max(2, barW / 2 - 4), y - 4)
    ctx.fillText(String(index + 1), x + Math.max(2, barW / 2 - 3), height - 8)
  })
}

const renderDashboardSection = () => {
  const kpis = dashboardKPIs()
  const alerts = getAlerts()
  const nearDeliveries = state.orders
    .filter((order) => {
      const days = daysUntil(order.dueDate)
      return days >= 0 && days <= 7
    })
    .sort((left, right) => (left.dueDate || "").localeCompare(right.dueDate || ""))
    .slice(0, 8)

  return `
    <section class="list">
      <div class="grid-6">
        <div class="card kpi"><h3>Total de clientes</h3><p>${kpis.totalClients}</p></div>
        <div class="card kpi"><h3>Pedidos ativos</h3><p>${kpis.activeOrders}</p></div>
        <div class="card kpi"><h3>Em andamento</h3><p>${kpis.inProgress}</p></div>
        <div class="card kpi"><h3>Concluidos</h3><p>${kpis.completed}</p></div>
        <div class="card kpi"><h3>Pagamentos pendentes</h3><p>${kpis.pendingPayments}</p></div>
        <div class="card kpi"><h3>Leads via bot</h3><p>${kpis.botLeads}</p></div>
        <div class="card kpi"><h3>Faturamento mensal</h3><p>${formatMoney(kpis.monthlyRevenue)}</p></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="section-head"><h2>Pedidos por mes</h2></div>
          <canvas id="ordersChart"></canvas>
        </div>
        <div class="card">
          <div class="section-head"><h2>Entregas proximas</h2></div>
          <div class="list">
            ${
              nearDeliveries.length
                ? nearDeliveries
                    .map((order) => {
                      const client = getClientById(order.clientId)
                      return `<div class="list-item">
                        <strong>${escapeHtml(client?.fullName || "-")}</strong>
                        <br />
                        <small>${escapeHtml(order.serviceType)} - Prazo ${formatDate(order.dueDate)}</small>
                      </div>`
                    })
                    .join("")
                : '<div class="list-item">Sem entregas para os proximos 7 dias.</div>'
            }
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card helper-card">
          <div class="section-head"><h2>Agente de IA Criarte</h2></div>
          ${renderBotSummary()}
          <div class="mini-stats">
            <div class="mini-stat"><span>Pedidos via WhatsApp</span><strong>${state.botStatus.botOrders || kpis.botLeads}</strong></div>
            <div class="mini-stat"><span>Chamados humanos</span><strong>${state.botStatus.pendingHuman || state.conversations.filter((conversation) => conversation.needsHuman).length}</strong></div>
            <div class="mini-stat"><span>Ultima sincronizacao</span><strong>${formatDateTime(state.lastSyncAt)}</strong></div>
          </div>
        </div>
        <div class="card">
          <div class="section-head"><h2>Alertas inteligentes</h2></div>
          <div class="list">
            <div class="alert warning">Prazos em ate 2 dias: ${alerts.dueSoon.length}</div>
            <div class="alert">Pagamentos pendentes com valor definido: ${alerts.pendingPayments.length}</div>
            <div class="alert danger">Pedidos atrasados: ${alerts.late.length}</div>
          </div>
        </div>
      </div>
    </section>
  `
}

const renderClientsSection = () => {
  const editing = state.clients.find((client) => client.id === state.editingClientId)

  return `
    <section class="list">
      <div class="card">
        <div class="section-head"><h2>${editing ? "Editar cliente" : "Cadastro de clientes"}</h2></div>
        <form id="clientForm" class="grid-2">
          <div>
            <label>Nome completo</label>
            <input class="input" name="fullName" value="${escapeHtml(editing?.fullName || "")}" required />
          </div>
          <div>
            <label>Telefone</label>
            <input class="input" name="phone" value="${escapeHtml(editing?.phone || "")}" required />
          </div>
          <div>
            <label>E-mail</label>
            <input class="input" type="email" name="email" value="${escapeHtml(editing?.email || "")}" />
          </div>
          <div>
            <label>Data do evento</label>
            <input class="input" type="date" name="eventDate" value="${escapeHtml(editing?.eventDate || "")}" />
          </div>
          <div>
            <label>Tipo de evento</label>
            <input class="input" name="eventType" value="${escapeHtml(editing?.eventType || "")}" placeholder="Ex.: Casamento, aniversario, campanha" />
          </div>
          <div>
            <label>Origem</label>
            <select name="source">
              ${MANUAL_SOURCE_OPTIONS.map((item) => `<option ${editing?.source === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <div style="grid-column:1/-1">
            <label>Observacoes</label>
            <textarea name="notes">${escapeHtml(editing?.notes || "")}</textarea>
          </div>
          <div class="row">
            <button class="btn" type="submit">${editing ? "Salvar alteracoes" : "Cadastrar cliente"}</button>
            ${editing ? '<button id="cancelClientEdit" type="button" class="btn secondary">Cancelar</button>' : ""}
          </div>
        </form>
      </div>

      <div class="card">
        <div class="section-head"><h2>Clientes cadastrados</h2></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Contato</th>
                <th>Evento</th>
                <th>Origem</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              ${
                state.clients.length
                  ? state.clients
                      .map(
                        (client) => `
                          <tr>
                            <td>${escapeHtml(client.fullName)}<br /><small>${truncateText(client.notes, 80)}</small></td>
                            <td>${escapeHtml(client.phone || "-")}<br /><small>${escapeHtml(client.email || "-")}</small></td>
                            <td>${escapeHtml(client.eventType || "-")}<br /><small>${formatDate(client.eventDate)}</small></td>
                            <td><span class="badge ${sourceBadgeClass(client.source)}">${escapeHtml(client.source || "Manual")}</span></td>
                            <td>
                              <div class="row">
                                <a class="btn secondary small" href="https://wa.me/55${normalizePhone(client.phone)}" target="_blank" rel="noreferrer">WhatsApp</a>
                                <button class="btn secondary small" data-action="edit-client" data-id="${client.id}" type="button">Editar</button>
                                <button class="btn danger small" data-action="delete-client" data-id="${client.id}" type="button">Excluir</button>
                                <button class="btn secondary small" data-action="history-client" data-id="${client.id}" type="button">Historico</button>
                              </div>
                            </td>
                          </tr>
                        `
                      )
                      .join("")
                  : '<tr><td colspan="5">Nenhum cliente cadastrado.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `
}

const renderOrdersSection = () => {
  const editing = state.orders.find((order) => order.id === state.editingOrderId)
  const serviceOptions =
    editing?.serviceType && !SERVICE_OPTIONS.includes(editing.serviceType) ? [editing.serviceType, ...SERVICE_OPTIONS] : SERVICE_OPTIONS

  return `
    <section class="list">
      <div class="card">
        <div class="section-head"><h2>${editing ? "Editar pedido" : "Gestao de pedidos"}</h2></div>
        <form id="orderForm" class="grid-2">
          <div>
            <label>Cliente vinculado</label>
            <select name="clientId" required>
              <option value="">Selecione</option>
              ${state.clients.map((client) => `<option value="${client.id}" ${editing?.clientId === client.id ? "selected" : ""}>${escapeHtml(client.fullName)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Origem</label>
            <select name="source" required>
              ${MANUAL_SOURCE_OPTIONS.map((item) => `<option ${editing?.source === item ? "selected" : !editing && item === "Manual" ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Tipo de servico</label>
            <select name="serviceType" required>
              ${serviceOptions.map((item) => `<option ${editing?.serviceType === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Valor do servico</label>
            <input class="input" type="number" step="0.01" min="0" name="serviceValue" value="${escapeHtml(editing?.serviceValue || "")}" />
          </div>
          <div>
            <label>Forma de pagamento</label>
            <select name="paymentMethod" required>
              ${PAYMENT_METHOD_OPTIONS.map((item) => `<option ${editing?.paymentMethod === item ? "selected" : !editing && item === "A definir" ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Status do pagamento</label>
            <select name="paymentStatus" required>
              ${PAYMENT_STATUS_OPTIONS.map((item) => `<option ${editing?.paymentStatus === item ? "selected" : !editing && item === "Pendente" ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Status do pedido</label>
            <select name="orderStatus" required>
              ${ORDER_STATUS_OPTIONS.map((item) => `<option ${editing?.orderStatus === item ? "selected" : !editing && item === "Aguardando pagamento" ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Data de inicio</label>
            <input class="input" type="date" name="startDate" value="${escapeHtml(editing?.startDate || nowDate())}" required />
          </div>
          <div>
            <label>Prazo de entrega</label>
            <input class="input" type="date" name="dueDate" value="${escapeHtml(editing?.dueDate || "")}" />
          </div>
          <div style="grid-column:1/-1">
            <label>Briefing / observacoes do pedido</label>
            <textarea name="briefing">${escapeHtml(editing?.briefing || "")}</textarea>
          </div>
          <div>
            <label>Upload arte final</label>
            <input class="input" type="file" name="finalFile" />
            ${editing?.finalFileName ? `<small>Arquivo atual: ${escapeHtml(editing.finalFileName)}</small>` : ""}
          </div>
          <div class="row" style="margin-top:24px">
            <button class="btn" type="submit">${editing ? "Salvar pedido" : "Cadastrar pedido"}</button>
            ${editing ? '<button id="cancelOrderEdit" type="button" class="btn secondary">Cancelar</button>' : ""}
          </div>
        </form>
      </div>

      <div class="card">
        <div class="section-head"><h2>Pedidos</h2></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Servico</th>
                <th>Briefing</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Prazo</th>
                <th>Arquivo</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              ${
                state.orders.length
                  ? state.orders
                      .map((order) => {
                        const client = getClientById(order.clientId)
                        return `
                          <tr class="${isLateOrder(order) ? "order-late" : ""}">
                            <td>
                              <strong>${escapeHtml(client?.fullName || "-")}</strong>
                              <br />
                              <small>${escapeHtml(client?.phone || order.contactPhone || "-")}</small>
                            </td>
                            <td>
                              ${escapeHtml(order.serviceType)}
                              <br />
                              <small><span class="badge ${sourceBadgeClass(order.source)}">${escapeHtml(order.source || "Manual")}</span></small>
                            </td>
                            <td>${truncateText(order.briefing || "-", 110)}</td>
                            <td>
                              ${order.serviceValue ? formatMoney(order.serviceValue) : "A definir"}
                              <br />
                              <small>${escapeHtml(order.paymentMethod)} - ${escapeHtml(order.paymentStatus)}</small>
                            </td>
                            <td><span class="badge">${escapeHtml(order.orderStatus)}</span></td>
                            <td>${formatDate(order.dueDate)} ${isLateOrder(order) ? '<span class="badge danger">Atrasado</span>' : ""}</td>
                            <td>${escapeHtml(order.finalFileName || "-")}</td>
                            <td>
                              <div class="row">
                                <button class="btn secondary small" data-action="edit-order" data-id="${order.id}" type="button">Editar</button>
                                <button class="btn danger small" data-action="delete-order" data-id="${order.id}" type="button">Excluir</button>
                              </div>
                            </td>
                          </tr>
                        `
                      })
                      .join("")
                  : '<tr><td colspan="8">Nenhum pedido cadastrado.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `
}

const renderFinanceSection = () => `
  <section class="list">
    <div class="card">
      <div class="section-head"><h2>Controle financeiro</h2></div>
      <form id="financeFilter" class="row">
        <div>
          <label>De</label>
          <input type="date" class="input" name="start" />
        </div>
        <div>
          <label>Ate</label>
          <input type="date" class="input" name="end" />
        </div>
        <div class="row" style="margin-top:20px">
          <button type="submit" class="btn secondary">Filtrar</button>
          <button id="exportPdf" type="button" class="btn">Exportar PDF</button>
        </div>
      </form>
      <div id="financeResult" class="grid-2" style="margin-top:12px"></div>
    </div>
  </section>
`

const renderBotSection = () => {
  const recentOrders = state.orders
    .filter((order) => order.source === "WhatsApp")
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, 8)

  const recentConversations = [...state.conversations]
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, 8)

  return `
    <section class="list">
      <div class="grid-2">
        <div class="card helper-card">
          <div class="section-head"><h2>Status do WhatsApp</h2></div>
          <div class="status-row">
            <span class="status-dot ${botStatusClass()}"></span>
            <strong>${escapeHtml(state.botStatus.statusLabel || "Indisponivel")}</strong>
          </div>
          <p class="helper">${escapeHtml(state.syncMessage)}</p>
          <div class="mini-stats">
            <div class="mini-stat"><span>Pedidos do bot</span><strong>${state.botStatus.botOrders || recentOrders.length}</strong></div>
            <div class="mini-stat"><span>Chamados humanos</span><strong>${state.botStatus.pendingHuman || state.conversations.filter((conversation) => conversation.needsHuman).length}</strong></div>
            <div class="mini-stat"><span>Atualizado em</span><strong>${formatDateTime(state.botStatus.updatedAt || state.lastSyncAt)}</strong></div>
          </div>
          <div class="row">
            <button class="btn" data-action="open-qr" type="button">Abrir QR</button>
            <button class="btn secondary" data-action="refresh-now" type="button">Atualizar status</button>
          </div>
          ${state.botStatus.lastError ? `<p class="helper">Ultimo erro: ${escapeHtml(state.botStatus.lastError)}</p>` : ""}
        </div>
        <div class="card helper-card">
          <div class="section-head"><h2>QR Code no painel</h2></div>
          ${renderBotQrPanel()}
        </div>
        <div class="card helper-card">
          <div class="section-head"><h2>Como o fluxo esta integrado</h2></div>
          <div class="list">
            <div class="list-item">A IA da Criarte conduz a conversa comercial e abre o briefing pelo WhatsApp.</div>
            <div class="list-item">Cada atendimento confirmado vira um cliente e um pedido com origem WhatsApp.</div>
            <div class="list-item">O painel consegue editar esses pedidos e o cliente pode pedir status pelo mesmo numero.</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-head"><h2>Pedidos recebidos pelo WhatsApp</h2></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Servico</th>
                <th>Status</th>
                <th>Prazo</th>
                <th>Briefing</th>
              </tr>
            </thead>
            <tbody>
              ${
                recentOrders.length
                  ? recentOrders
                      .map((order) => {
                        const client = getClientById(order.clientId)
                        return `
                          <tr>
                            <td>${escapeHtml(order.id)}</td>
                            <td>${escapeHtml(client?.fullName || "-")}<br /><small>${escapeHtml(client?.phone || order.contactPhone || "-")}</small></td>
                            <td>${escapeHtml(order.serviceType)}</td>
                            <td><span class="badge">${escapeHtml(order.orderStatus)}</span></td>
                            <td>${formatDate(order.dueDate)}</td>
                            <td>${truncateText(order.briefing, 140)}</td>
                          </tr>
                        `
                      })
                      .join("")
                  : '<tr><td colspan="6">Nenhum pedido do bot ainda.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="section-head"><h2>Conversas recentes</h2></div>
        <div class="list">
          ${
            recentConversations.length
              ? recentConversations
                  .map((conversation) => {
                    const linkedOrder = conversation.orderId ? state.orders.find((order) => order.id === conversation.orderId) : null
                    const label = conversation.displayName || conversation.phone || "Contato sem nome"
                    const lastMessage = conversation.messages[conversation.messages.length - 1]
                    return `
                      <div class="list-item">
                        <div class="conversation-head">
                          <strong>${escapeHtml(label)}</strong>
                          <span class="badge ${conversation.needsHuman ? "warning" : ""}">${escapeHtml(conversation.stage || "conversa")}</span>
                        </div>
                        <div class="helper">Telefone: ${escapeHtml(conversation.phone || "-")} | Atualizado: ${formatDateTime(conversation.updatedAt)}</div>
                        <div>${truncateText(conversation.summary || lastMessage?.text || "Sem resumo", 180)}</div>
                        ${linkedOrder ? `<div class="helper">Pedido vinculado: ${escapeHtml(linkedOrder.id)} - ${escapeHtml(linkedOrder.orderStatus)}</div>` : ""}
                      </div>
                    `
                  })
                  .join("")
              : '<div class="list-item">Nenhuma conversa registrada ainda.</div>'
          }
        </div>
      </div>
    </section>
  `
}

const renderSection = () => {
  if (state.currentView === "clients") return renderClientsSection()
  if (state.currentView === "orders") return renderOrdersSection()
  if (state.currentView === "finance") return renderFinanceSection()
  if (state.currentView === "bot") return renderBotSection()
  return renderDashboardSection()
}

const renderApp = () => {
  const session = getSession()
  if (!session) {
    renderLogin()
    return
  }

  const user = state.users.find((item) => item.id === session)
  if (!user) {
    clearSession()
    renderLogin()
    return
  }

  root.innerHTML = `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="brand">Criarte <span>Admin</span></div>
        <nav class="nav">
          <button class="nav-btn ${state.currentView === "dashboard" ? "active" : ""}" data-nav="dashboard">Dashboard</button>
          <button class="nav-btn ${state.currentView === "clients" ? "active" : ""}" data-nav="clients">Clientes</button>
          <button class="nav-btn ${state.currentView === "orders" ? "active" : ""}" data-nav="orders">Pedidos</button>
          <button class="nav-btn ${state.currentView === "finance" ? "active" : ""}" data-nav="finance">Financeiro</button>
          <button class="nav-btn ${state.currentView === "bot" ? "active" : ""}" data-nav="bot">Agente de IA</button>
        </nav>
        <div class="sidebar-footer">
          <button id="themeToggle" class="btn secondary" type="button"></button>
          <button id="logoutBtn" class="btn danger" type="button">Sair</button>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div class="title">
            <h1>Painel Criarte - Convites e Artes Digitais</h1>
            <p>Bem-vindo(a), ${escapeHtml(user.name)}.</p>
          </div>
          ${renderTopbarActions()}
        </div>
        ${renderSection()}
      </main>
    </div>
  `

  setTheme(getTheme())
  bindGlobalEvents()
  bindSectionEvents()
  if (state.currentView === "bot") startBotPanelAutoRefresh()
  else stopBotPanelAutoRefresh()
  renderChart()
}

const refreshAll = async () => {
  await loadData()
  await loadBotStatus()
}

const openQrInNewTab = async () => {
  const popup = window.open("", "_blank", "noopener,noreferrer")
  if (!popup) {
    alert("Nao foi possivel abrir uma nova aba. Verifique se o navegador bloqueou pop-ups.")
    return
  }

  popup.document.open()
  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>QR Code Criarte</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #fcf6f1;
            color: #34251f;
            font-family: Arial, sans-serif;
            padding: 24px;
          }
          main {
            max-width: 420px;
            width: 100%;
            text-align: center;
            background: #fffdfa;
            border-radius: 24px;
            padding: 24px;
            box-shadow: 0 18px 40px rgba(52, 37, 31, 0.12);
          }
          p {
            color: #7a6155;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Abrindo QR Code...</h1>
          <p>Estou localizando o servidor do agente de IA da Criarte.</p>
        </main>
      </body>
    </html>
  `)
  popup.document.close()

  const serverOrigin = await ensureServerOrigin()
  if (!serverOrigin) {
    popup.document.body.innerHTML = `
      <main style="max-width:420px;width:100%;text-align:center;background:#fffdfa;border-radius:24px;padding:24px;box-shadow:0 18px 40px rgba(52,37,31,0.12);margin:auto;">
        <h1>Servidor nao encontrado</h1>
        <p style="color:#7a6155;line-height:1.5;">Inicie o sistema com <strong>npm start</strong> para gerar o QR Code em uma nova aba.</p>
      </main>
    `
    return
  }

  popup.location.replace(buildServerUrl(state.botStatus.qrPagePath || "/qr", serverOrigin))
}

const stopBotPanelAutoRefresh = () => {
  if (!botPanelRefreshTimer) return
  window.clearInterval(botPanelRefreshTimer)
  botPanelRefreshTimer = null
}

const startBotPanelAutoRefresh = () => {
  stopBotPanelAutoRefresh()

  if (state.currentView !== "bot" || state.storageMode !== "server") return

  botPanelRefreshTimer = window.setInterval(async () => {
    if (state.currentView !== "bot") {
      stopBotPanelAutoRefresh()
      return
    }

    await refreshAll()
    if (state.currentView === "bot") {
      renderApp()
    }
  }, BOT_QR_REFRESH_MS)
}

const bindGlobalEvents = () => {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.currentView = button.dataset.nav
      state.editingClientId = null
      state.editingOrderId = null
      if (state.currentView === "bot") {
        await refreshAll()
      }
      renderApp()
    })
  })

  document.getElementById("themeToggle").addEventListener("click", () => {
    setTheme(getTheme() === "light" ? "dark" : "light")
    renderChart()
  })

  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearSession()
    renderLogin()
  })

  document.getElementById("refreshDataBtn").addEventListener("click", async () => {
    await refreshAll()
    renderApp()
  })

  document.querySelectorAll('[data-action="goto-bot"]').forEach((button) => {
    button.addEventListener("click", async () => {
      state.currentView = "bot"
      await refreshAll()
      renderApp()
    })
  })

  document.querySelectorAll('[data-action="open-qr"]').forEach((button) => {
    button.addEventListener("click", async () => {
      await openQrInNewTab()
    })
  })
}

const bindSectionEvents = () => {
  if (state.currentView === "clients") bindClientEvents()
  if (state.currentView === "orders") bindOrderEvents()
  if (state.currentView === "finance") bindFinanceEvents()
  if (state.currentView === "bot") bindBotEvents()
}

const bindClientEvents = () => {
  const form = document.getElementById("clientForm")
  if (!form) return

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const payload = {
      fullName: String(data.get("fullName") || "").trim(),
      phone: normalizePhone(data.get("phone") || ""),
      email: String(data.get("email") || "").trim(),
      eventDate: String(data.get("eventDate") || ""),
      eventType: String(data.get("eventType") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
      source: String(data.get("source") || "Manual"),
      createdAt: state.editingClientId ? state.clients.find((client) => client.id === state.editingClientId)?.createdAt || nowIso() : nowIso()
    }

    if (state.editingClientId) {
      state.clients = state.clients.map((client) => (client.id === state.editingClientId ? { ...client, ...payload } : client))
      state.editingClientId = null
    } else {
      state.clients.unshift({ id: id("c"), ...payload })
    }

    await saveData()
    renderApp()
  })

  const cancel = document.getElementById("cancelClientEdit")
  if (cancel) {
    cancel.addEventListener("click", () => {
      state.editingClientId = null
      renderApp()
    })
  }

  document.querySelectorAll('[data-action="edit-client"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.editingClientId = button.dataset.id
      renderApp()
    })
  })

  document.querySelectorAll('[data-action="delete-client"]').forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir cliente e pedidos vinculados?")) return
      const clientId = button.dataset.id
      state.clients = state.clients.filter((client) => client.id !== clientId)
      state.orders = state.orders.filter((order) => order.clientId !== clientId)
      await saveData()
      renderApp()
    })
  })

  document.querySelectorAll('[data-action="history-client"]').forEach((button) => {
    button.addEventListener("click", () => {
      const clientId = button.dataset.id
      const history = state.orders.filter((order) => order.clientId === clientId)
      const message = history.length
        ? history.map((order) => `${order.serviceType} - ${order.orderStatus} - ${order.serviceValue ? formatMoney(order.serviceValue) : "A definir"}`).join("\n")
        : "Nenhum pedido para este cliente."
      alert(message)
    })
  })
}

const bindOrderEvents = () => {
  const form = document.getElementById("orderForm")
  if (!form) return

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const file = data.get("finalFile")
    const parsedFile = await readFileAsDataUrl(file && file.size ? file : null)
    const base = state.editingOrderId ? state.orders.find((order) => order.id === state.editingOrderId) : null
    const linkedClient = getClientById(String(data.get("clientId") || ""))

    const payload = {
      clientId: String(data.get("clientId") || ""),
      source: String(data.get("source") || "Manual"),
      serviceType: String(data.get("serviceType") || ""),
      serviceValue: Number(data.get("serviceValue") || 0),
      paymentMethod: String(data.get("paymentMethod") || "A definir"),
      paymentStatus: String(data.get("paymentStatus") || "Pendente"),
      orderStatus: String(data.get("orderStatus") || "Aguardando pagamento"),
      startDate: String(data.get("startDate") || nowDate()),
      dueDate: String(data.get("dueDate") || ""),
      briefing: String(data.get("briefing") || "").trim(),
      finalFileName: parsedFile.name || base?.finalFileName || "",
      finalFileData: parsedFile.data || base?.finalFileData || "",
      contactPhone: linkedClient?.phone || base?.contactPhone || "",
      conversationId: base?.conversationId || "",
      createdAt: base?.createdAt || nowIso(),
      updatedAt: nowIso()
    }

    const transitionedToFinished = payload.orderStatus === "Finalizado" && base?.orderStatus !== "Finalizado"
    let savedOrder = null

    if (state.editingOrderId) {
      state.orders = state.orders.map((order) => {
        if (order.id !== state.editingOrderId) return order
        savedOrder = { ...order, ...payload }
        return savedOrder
      })
      state.editingOrderId = null
    } else {
      savedOrder = { id: id("o"), ...payload }
      state.orders.unshift(savedOrder)
    }

    await saveData()
    if (savedOrder && (transitionedToFinished || (!base && savedOrder.orderStatus === "Finalizado"))) {
      notifyFinishedOrder(savedOrder)
    }
    renderApp()
  })

  const cancel = document.getElementById("cancelOrderEdit")
  if (cancel) {
    cancel.addEventListener("click", () => {
      state.editingOrderId = null
      renderApp()
    })
  }

  document.querySelectorAll('[data-action="edit-order"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.editingOrderId = button.dataset.id
      renderApp()
    })
  })

  document.querySelectorAll('[data-action="delete-order"]').forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir pedido?")) return
      const orderId = button.dataset.id
      state.orders = state.orders.filter((order) => order.id !== orderId)
      await saveData()
      renderApp()
    })
  })
}

const bindFinanceEvents = () => {
  const form = document.getElementById("financeFilter")
  const result = document.getElementById("financeResult")
  if (!form || !result) return

  const calculate = (start, end) => {
    const filtered = state.orders.filter((order) => {
      if (!order.startDate) return false
      if (start && order.startDate < start) return false
      if (end && order.startDate > end) return false
      return true
    })

    const totalReceived = filtered.reduce((acc, order) => acc + paymentReceivedValue(order), 0)
    const totalPending = filtered.reduce((acc, order) => acc + Number(order.serviceValue || 0) - paymentReceivedValue(order), 0)

    result.innerHTML = `
      <div class="card kpi"><h3>Total recebido</h3><p>${formatMoney(totalReceived)}</p></div>
      <div class="card kpi"><h3>Total pendente</h3><p>${formatMoney(totalPending)}</p></div>
      <div class="card" style="grid-column:1/-1">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Data</th><th>Servico</th><th>Recebido</th><th>Pendente</th></tr></thead>
            <tbody>
              ${
                filtered.length
                  ? filtered
                      .map((order) => {
                        const received = paymentReceivedValue(order)
                        return `<tr>
                          <td>${escapeHtml(clientName(order.clientId))}</td>
                          <td>${formatDate(order.startDate)}</td>
                          <td>${escapeHtml(order.serviceType)}</td>
                          <td>${formatMoney(received)}</td>
                          <td>${formatMoney(Number(order.serviceValue || 0) - received)}</td>
                        </tr>`
                      })
                      .join("")
                  : '<tr><td colspan="5">Sem dados no periodo.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `

    return { filtered, totalReceived, totalPending, start, end }
  }

  let latest = calculate("", "")

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const data = new FormData(form)
    latest = calculate(String(data.get("start") || ""), String(data.get("end") || ""))
  })

  document.getElementById("exportPdf").addEventListener("click", () => {
    const html = `
      <html>
        <head>
          <title>Relatorio Financeiro Criarte</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Relatorio Financeiro Criarte</h1>
          <p>Periodo: ${latest.start || "Inicio"} ate ${latest.end || "Hoje"}</p>
          <p>Total recebido: ${formatMoney(latest.totalReceived)}</p>
          <p>Total pendente: ${formatMoney(latest.totalPending)}</p>
          <table>
            <thead><tr><th>Cliente</th><th>Data</th><th>Servico</th><th>Valor</th><th>Pagamento</th></tr></thead>
            <tbody>
              ${latest.filtered.map((order) => `<tr><td>${escapeHtml(clientName(order.clientId))}</td><td>${formatDate(order.startDate)}</td><td>${escapeHtml(order.serviceType)}</td><td>${formatMoney(order.serviceValue)}</td><td>${escapeHtml(order.paymentStatus)}</td></tr>`).join("")}
            </tbody>
          </table>
          <script>window.onload=function(){window.print();}</script>
        </body>
      </html>
    `
    const popup = window.open("", "_blank")
    if (!popup) return
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
  })
}

const bindBotEvents = () => {
  document.querySelectorAll('[data-action="refresh-now"]').forEach((button) => {
    button.addEventListener("click", async () => {
      await refreshAll()
      renderApp()
    })
  })
}

const bootstrap = async () => {
  await loadData()
  await loadBotStatus()
  setTheme(getTheme())
  renderApp()
}

bootstrap()
