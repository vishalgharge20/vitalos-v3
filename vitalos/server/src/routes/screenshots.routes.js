import { Router } from 'express'
import { listScreenshots, getScreenshotImage, deleteScreenshot } from '../controllers/screenshots.controller.js'

const router = Router()

router.get('/', listScreenshots)
router.get('/:id/image', getScreenshotImage)
router.delete('/:id', deleteScreenshot)

export default router
