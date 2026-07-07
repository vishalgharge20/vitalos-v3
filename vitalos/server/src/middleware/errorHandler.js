import multer from 'multer'
import { ApiError } from '../utils/validation.js'

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Screenshot is too large (8MB max).' : err.message
    return res.status(400).json({ error: message })
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message })
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message })
  }

  if (err.code === 11000) {
    return res.status(409).json({ error: 'A record for this date already exists.' })
  }

  console.error('[error]', err)
  res.status(500).json({ error: 'Something went wrong on the server.' })
}
