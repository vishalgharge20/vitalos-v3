import { Router } from 'express'
import { importRecords, importWorkouts } from '../controllers/import.controller.js'

const router = Router()

router.post('/records', importRecords)
router.post('/workouts', importWorkouts)

export default router
