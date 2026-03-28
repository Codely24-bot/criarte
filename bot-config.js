const inviteCatalogLink = (process.env.INVITE_CATALOG_LINK || "").trim()
const pixKey = (process.env.PIX_KEY || "").trim()

const salesConfig = {
  companyName: "Criarte",
  assistantName: "agente de vendas da Criarte",
  targetAudience:
    "clientes que buscam convites digitais personalizados, mascotinhos personalizados e artes para redes sociais",
  positioning:
    "especialista em vendas da Criarte, com foco em atendimento encantador, rapido, persuasivo e humano, conduzindo a cliente ate o fechamento",
  features: [
    "convites digitais personalizados",
    "mascotinhos personalizados para festas e marcas",
    "artes para redes sociais",
    "logos, banners e criacoes personalizadas",
    "atendimento acolhedor no WhatsApp",
    "organizacao do briefing para o painel administrativo"
  ],
  benefits: [
    "mostrar valor antes do preco",
    "entender a necessidade da cliente com clareza",
    "oferecer solucoes completas e encantadoras",
    "sugerir combos para aumentar o valor percebido",
    "conduzir a conversa com leveza ate o fechamento"
  ],
  qualificationGoals: [
    "identificar se a cliente quer convite, mascotinho ou arte para redes sociais",
    "coletar os dados essenciais do pedido",
    "mostrar exemplos ou catalogo antes do preco sempre que possivel",
    "sugerir combo de convite com mascotinho quando fizer sentido",
    "conduzir para confirmacao e pagamento"
  ],
  preferredCta: "levar a cliente ao fechamento com um convite claro para enviar os dados e confirmar o pedido",
  serviceCatalog: [
    "Convite digital personalizado",
    "Mascotinho personalizado",
    "Arte para redes sociais",
    "Logotipo",
    "Banner"
  ],
  preferredEmojis: ["💖", "✨", "🎉", "🧸", "📲"],
  mascotPrice: "R$47,50",
  inviteCatalogLink,
  pixKey
}

const inviteCatalogReference = inviteCatalogLink
  ? `📚 Catálogo de convites: ${inviteCatalogLink}`
  : "📚 Catálogo de convites: envio no atendimento"

const pixReference = pixKey ? `💳 Pix: ${pixKey}` : "💳 Pix: chave enviada na confirmação do pagamento"

const mensagens = {
  abertura:
    "Olá! 👋 Seja bem-vinda 💖\n\nTrabalhamos com:\n🎉 Convites digitais personalizados\n🧸 Mascotinhos personalizados\n📱 Artes para redes sociais\n\nMe conta o que você deseja hoje para eu te ajudar da melhor forma ✨",
  convite:
    "Perfeito 😍\n\nTemos vários modelos lindos de convites para diferentes temas ✨\nVou te enviar nosso catálogo para você escolher o estilo que mais combina com sua festa 🎉\n\n" +
    `${inviteCatalogReference}\n\n` +
    "Depois que você escolher, me envie:\n👉 Nome\n👉 Idade\n👉 Tema\n👉 Data\n👉 Horário\n👉 Endereço (opcional)\n\nAssim eu deixo tudo personalizado e lindo para você 💖",
  mascotinho:
    "Perfeito 😍\n\nO mascotinho personalizado fica no valor de *R$47,50* ✨\n\nÉ uma arte exclusiva feita com muito carinho, que você pode usar em vários detalhes da festa como:\n🎉 decoração\n🍬 lembrancinhas\n📸 painel\n💌 convite\n📱 redes sociais\n\nOu seja, além de deixar a festa muito mais bonita, ele cria uma identidade única e encantadora 💖\n\nSe quiser, já posso dar início no seu agora mesmo ✨\nÉ só me enviar:\n👉 Foto\n👉 Tema\n👉 Nome",
  redesSociais:
    "Perfeito! 🚀\n\nCriamos artes profissionais que valorizam sua marca e ajudam a atrair mais clientes 💼✨\n\nMe fala:\n👉 Tipo de negócio\n👉 O que você precisa (post, logo, banner, etc)\n\nQue já te mostro algumas ideias incríveis 😍",
  modelo:
    "Olha esse modelo 😍👇\n(ENVIAR IMAGEM)\n\nConsigo personalizar com seus dados e deixar do jeitinho que você quiser ✨",
  upsellConvite:
    "Só uma dica 💡\n\nSe você quiser, também posso fazer o mascotinho combinando com o convite 😍\n\nAssim a festa fica toda padronizada, muito mais bonita e encantadora 💖",
  fechamento:
    "Perfeito 😍 vamos fazer o seu!\n\nMe envia:\n✔ Nome\n✔ Idade\n✔ Tema\n✔ Data\n\n(E se for mascotinho:)\n✔ Foto\n\nQue já começo sua arte agora 🚀✨",
  pagamento:
    "Agora é só confirmar o pagamento que já inicio sua arte 🎨✨\n\n" +
    `${pixReference}\n\n` +
    "Assim que enviar, já começo e te mando rapidinho 🚀",
  objecaoPensar:
    "Claro 😊\n\nSó te aviso porque essa promoção é bem procurada e pode sair rápido 👀\n\nSe quiser, posso deixar seu modelo separado sem compromisso 💖",
  objecaoPreco:
    "Entendo 😊\n\nMas aqui você recebe:\n✨ Arte personalizada\n💖 Qualidade profissional\n⚡ Entrega rápida\n\nE um resultado que realmente faz diferença na festa 🎉\n\nSe quiser, posso te mostrar mais opções também 😉",
  posVenda:
    "Seu pedido está pronto 😍✨\n\nMuito obrigado pela confiança 💖\n\nSe puder, me manda um feedback depois 🙏\nE se conhecer alguém que precise, me indica também 🥰",
  preco:
    "Antes de te passar o valor certinho, eu gosto de entender o pedido para te orientar da melhor forma 💖\n\nAssim eu consigo te mostrar o que faz mais sentido, destacar o valor da arte e montar a melhor solução para você ✨",
  funcionalidades:
    "Posso te ajudar com convites digitais, mascotinhos personalizados e artes para redes sociais 💖\n\nMe conta o que você deseja hoje que eu já sigo com o melhor atendimento para você ✨",
  semInteresse:
    "Sem problema 😊\n\nQuando quiser retomar, é só me chamar por aqui que eu continuo seu atendimento com carinho 💖",
  audioNaoEntendido:
    "Recebi seu áudio 💖\n\nMas não consegui entender direitinho. Se puder, me escreve por texto ou manda novamente que eu continuo te ajudando ✨",
  fallback:
    "Me conta o que você deseja hoje que eu vou te ajudar da melhor forma 💖\n\nSe for convite, mascotinho ou arte para redes sociais, eu já consigo te orientar rapidinho ✨",
  humano:
    "Perfeito 💖\n\nVou sinalizar sua conversa para a equipe humana continuar por aqui com você o quanto antes ✨"
}

module.exports = {
  mensagens,
  salesConfig
}
