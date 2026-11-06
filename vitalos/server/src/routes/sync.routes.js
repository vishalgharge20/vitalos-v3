import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  receiveHealthKitSync,
  getSyncStatus,
  generateNewSyncToken,
} from '../controllers/sync.controller.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const shortcutFilePath = path.resolve(__dirname, '../../public/VitalOS-Sync.shortcut')

const router = Router()

// Ingestion endpoints
router.post('/healthkit', receiveHealthKitSync)

// Status & configuration endpoints for the dashboard
router.get('/status', getSyncStatus)
router.post('/generate-token', generateNewSyncToken)

// Direct download endpoint for the ready-made iOS Shortcut file
router.get('/download-shortcut', (req, res) => {
  res.download(shortcutFilePath, 'VitalOS-Sync.shortcut')
})

export default router
