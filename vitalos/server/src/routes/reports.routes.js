import { Router } from 'express'
import { getReport } from '../controllers/reports.controller.js'

const router = Router()

router.get('/', getReport)

export default router
