import 'dotenv/config'
import { createApp } from './app.js'
import { connectDB } from './config/db.js'

const PORT = process.env.PORT || 5000
const MONGODB_URI = process.env.MONGODB_URI
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

if (!MONGODB_URI) {
  console.error('[startup] MONGODB_URI is not set. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

async function start() {
  await connectDB(MONGODB_URI)
  const app = createApp({ clientUrl: CLIENT_URL })
  app.listen(PORT, () => {
    console.log(`[startup] VitalOS API listening on port ${PORT}`)
  })
}

start().catch((err) => {
  console.error('[startup] Failed to start server:', err.message)
  process.exit(1)
})
