import { Router } from 'express'
import { receiveHealthKitWebhook } from '../controllers/webhook.controller.js'

const router = Router()

router.post('/healthkit', receiveHealthKitWebhook)

export default router