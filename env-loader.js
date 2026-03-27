const fs = require("fs")
const path = require("path")

let envLoaded = false

const stripWrappingQuotes = (value = "") => {
  const trimmed = String(value).trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

const loadEnvFile = (filename = ".env") => {
  if (envLoaded) return
  envLoaded = true

  const filePath = path.join(__dirname, filename)
  if (!fs.existsSync(filePath)) {
    return
  }

  const content = fs.readFileSync(filePath, "utf8")

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separatorIndex = line.indexOf("=")
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue

    const value = line.slice(separatorIndex + 1)
    process.env[key] = stripWrappingQuotes(value)
  }
}

module.exports = {
  loadEnvFile
}
