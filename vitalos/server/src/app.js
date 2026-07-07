import express from 'express'
import cors from 'cors'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'
import recordsRoutes from './routes/records.routes.js'
import screenshotsRoutes from './routes/screenshots.routes.js'
import reportsRoutes from './routes/reports.routes.js'
import importRoutes from './routes/import.routes.js'
import workoutsRoutes from './routes/workouts.routes.js'

export function createApp({ clientUrl = 'http://localhost:5173' } = {}) {
  const app = express()

  app.use(cors({ origin: clientUrl }))
  // Bulk Apple Health imports are still just small JSON aggregates per day
  // (no images here), but years of history can add up — 15mb covers even
  // multi-year exports comfortably.
  app.use(express.json({ limit: '15mb' }))

  app.get('/', (req, res) => {
  res.send('🚀 VitalOS Server Running');
})
  
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'vitalos-api' })
  })

  app.use('/api/records', recordsRoutes)
  app.use('/api/screenshots', screenshotsRoutes)
  app.use('/api/reports', reportsRoutes)
  app.use('/api/import', importRoutes)
  app.use('/api/workouts', workoutsRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
