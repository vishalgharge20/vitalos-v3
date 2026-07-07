import { Router } from 'express'
import { listWorkouts } from '../controllers/workouts.controller.js'

const router = Router()

router.get('/', listWorkouts)

export default router
