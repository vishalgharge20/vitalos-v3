import express from 'express'
import cors from 'cors'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'
import recordsRoutes from './routes/records.routes.js'
import screenshotsRoutes from './routes/screenshots.routes.js'
import reportsRoutes from './routes/reports.routes.js'
import importRoutes from './routes/import.routes.js'
import workoutsRoutes from './routes/workouts.routes.js'
import webhookRoutes from './routes/webhook.routes.js'


export function createApp({ clientUrl = 'http://localhost:5173' } = {}) {
  const app = express()

  const allowedOrigins = clientUrl.split(',').map(origin => origin.trim());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

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

  app.use('/api/webhook', webhookRoutes)


  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}


