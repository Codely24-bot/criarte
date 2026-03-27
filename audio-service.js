let MessageMedia = null

try {
  ;({ MessageMedia } = require("whatsapp-web.js"))
} catch (error) {
  MessageMedia = null
}

const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe"
const ttsModel = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts"
const rawApiKey = (process.env.OPENAI_API_KEY || "").trim()
const apiKey = rawApiKey && rawApiKey !== "coloque_sua_chave_aqui" && rawApiKey !== "sua_chave" ? rawApiKey : null
const ttsVoice = (process.env.OPENAI_TTS_VOICE || "alloy").trim()

const normalizeAudioReplyMode = (value = "") => {
  const normalized = value.trim().toLowerCase()

  if (["off", "incoming_audio", "all"].includes(normalized)) {
    return normalized
  }

  return "off"
}

const audioReplyMode = normalizeAudioReplyMode(process.env.AUDIO_REPLY_MODE || "off")
const isAudioTranscriptionEnabled = Boolean(apiKey)
const isAudioReplyEnabled = Boolean(apiKey) && audioReplyMode !== "off" && Boolean(MessageMedia)

const audioTranscriptionStatusReason = isAudioTranscriptionEnabled
  ? `sim (OpenAI - ${transcribeModel})`
  : "nao - defina OPENAI_API_KEY para transcrever notas de voz"

const audioReplyStatusReason = isAudioReplyEnabled
  ? `sim (OpenAI - ${ttsModel}, modo=${audioReplyMode}, voz=${ttsVoice})`
  : "nao - defina OPENAI_API_KEY e AUDIO_REPLY_MODE para enviar resposta em audio"

const sanitizeMimeType = (mimetype = "application/octet-stream") => mimetype.split(";")[0].trim().toLowerCase()

const inferExtension = (mimeType = "") => {
  if (mimeType.includes("ogg")) return "ogg"
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3"
  if (mimeType.includes("mp4")) return "mp4"
  if (mimeType.includes("wav")) return "wav"
  if (mimeType.includes("webm")) return "webm"
  if (mimeType.includes("m4a")) return "m4a"
  return "bin"
}

const stripTextForSpeech = (text = "") =>
  text
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim()

const isIncomingAudioMessage = (msg) => Boolean(msg?.hasMedia && ["audio", "ptt"].includes(msg.type))

const shouldSendAudioReply = (messageType) =>
  audioReplyMode === "all" || (audioReplyMode === "incoming_audio" && ["audio", "ptt"].includes(messageType))

const buildErrorFromResponse = async (response) => {
  const contentType = response.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const payload = await response.json()
    const error = new Error(payload?.error?.message || `Erro HTTP ${response.status}`)
    error.status = response.status
    error.code = payload?.error?.type || payload?.error?.code || "openai_error"
    return error
  }

  const text = await response.text()
  const error = new Error(text || `Erro HTTP ${response.status}`)
  error.status = response.status
  error.code = "openai_error"
  return error
}

const transcribeAudioMessage = async (media) => {
  if (!isAudioTranscriptionEnabled || !media?.data) {
    return null
  }

  const mimeType = sanitizeMimeType(media.mimetype)

  try {
    const audioBuffer = Buffer.from(media.data, "base64")
    const blob = new Blob([audioBuffer], { type: mimeType })
    const formData = new FormData()

    formData.append("model", transcribeModel)
    formData.append("file", blob, `audio.${inferExtension(mimeType)}`)

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      throw await buildErrorFromResponse(response)
    }

    const payload = await response.json()
    const transcript = typeof payload?.text === "string" ? payload.text.trim() : ""

    return transcript || null
  } catch (error) {
    console.log(`Falha ao transcrever audio com OpenAI: ${error.message}`)
    return null
  }
}

const synthesizeSpeech = async (text) => {
  if (!isAudioReplyEnabled || !MessageMedia || !text?.trim()) {
    return null
  }

  try {
    const textForSpeech = stripTextForSpeech(text) || text.trim()

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: ttsModel,
        voice: ttsVoice,
        input: textForSpeech
      })
    })

    if (!response.ok) {
      throw await buildErrorFromResponse(response)
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer())

    if (!audioBuffer.length) {
      return null
    }

    return new MessageMedia("audio/mpeg", audioBuffer.toString("base64"), "resposta.mp3", audioBuffer.length)
  } catch (error) {
    console.log(`Falha ao gerar resposta em audio com OpenAI: ${error.message}`)
    return null
  }
}

module.exports = {
  audioReplyMode,
  audioReplyStatusReason,
  audioTranscriptionStatusReason,
  isAudioReplyEnabled,
  isAudioTranscriptionEnabled,
  isIncomingAudioMessage,
  shouldSendAudioReply,
  synthesizeSpeech,
  transcribeAudioMessage
}
