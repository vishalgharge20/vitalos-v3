import { Router } from 'express'
import {
  listRecords,
  getRecord,
  upsertRecord,
  updateNotes,
  deleteRecord,
  deleteAllRecords,
} from '../controllers/records.controller.js'
import { uploadScreenshot } from '../controllers/screenshots.controller.js'
import { upload } from '../middleware/upload.js'

const router = Router()

router.get('/', listRecords)
router.delete('/', deleteAllRecords) // Settings > Delete All Data

router.get('/:date', getRecord)
router.post('/:date', upsertRecord)
router.patch('/:date/notes', updateNotes)
router.delete('/:date', deleteRecord)

router.post('/:date/screenshots', upload.single('file'), uploadScreenshot)

export default router
