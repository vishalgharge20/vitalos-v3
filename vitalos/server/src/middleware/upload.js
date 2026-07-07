import multer from 'multer'

const MAX_FILE_SIZE = 8 * 1024 * 1024 // 8MB — keeps well under Mongo's 16MB document cap

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic'])

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Only PNG, JPEG, WEBP, or HEIC screenshots are supported.'))
  }
}

// Memory storage: the file buffer is written straight into a Screenshot
// document rather than touching disk, since Render's filesystem is
// ephemeral anyway.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
})
