import mongoose from 'mongoose'

mongoose.set('strictQuery', true)

/**
 * Connects to MongoDB Atlas. Retries a few times on startup in case the
 * cluster is still waking up (common on shared/free tiers), then lets the
 * process crash so a process manager (or Render) can restart it — cleaner
 * than running with a half-connected DB.
 */
export async function connectDB(uri, { retries = 5, delayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri)
      console.log('[db] Connected to MongoDB')
      return
    } catch (err) {
      console.error(`[db] Connection attempt ${attempt}/${retries} failed: ${err.message}`)
      if (attempt === retries) throw err
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

export default mongoose
