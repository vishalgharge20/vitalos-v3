import axios from 'axios'

// Vite exposes env vars prefixed with VITE_ on import.meta.env.
// Falls back to localhost so `npm run dev` works before .env is set up.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export const api = axios.create({
  baseURL: API_BASE_URL,
})

export function screenshotImageUrl(id) {
  return `${API_BASE_URL}/api/screenshots/${id}/image`
}

// ---- records ---------------------------------------------------------------

export const getRecords = (params) => api.get('/api/records', { params }).then((r) => r.data)
export const getRecord = (date) => api.get(`/api/records/${date}`).then((r) => r.data)
export const upsertRecord = (date, payload) =>
  api.post(`/api/records/${date}`, payload).then((r) => r.data)
export const updateNotes = (date, notes) =>
  api.patch(`/api/records/${date}/notes`, { notes }).then((r) => r.data)
export const deleteRecord = (date) => api.delete(`/api/records/${date}`).then((r) => r.data)
export const deleteAllRecords = () => api.delete('/api/records').then((r) => r.data)

// ---- screenshots -------------------------------------------------------------

export const listScreenshots = (params) =>
  api.get('/api/screenshots', { params }).then((r) => r.data)

export const uploadScreenshot = (date, type, file, onProgress) => {
  const formData = new FormData()
  formData.append('type', type)
  formData.append('file', file)

  return api
    .post(`/api/records/${date}/screenshots`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
    })
    .then((r) => r.data)
}

export const deleteScreenshot = (id) => api.delete(`/api/screenshots/${id}`).then((r) => r.data)

// ---- reports ------------------------------------------------------------------

export const getReport = (params) => api.get('/api/reports', { params }).then((r) => r.data)

// ---- Apple Health import ---------------------------------------------------

const IMPORT_CHUNK_SIZE = 1000 // stays well under the server's 5000-day bulk cap

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function importRecords(days, onProgress) {
  const chunks = chunk(days, IMPORT_CHUNK_SIZE)
  let imported = 0
  for (let i = 0; i < chunks.length; i++) {
    const { data } = await api.post('/api/import/records', { days: chunks[i] })
    imported += data.imported
    onProgress?.(Math.round(((i + 1) / chunks.length) * 100))
  }
  return { imported }
}

export async function importWorkouts(workouts) {
  if (!workouts.length) return { imported: 0 }
  const { data } = await api.post('/api/import/workouts', { workouts })
  return data
}

export const getWorkouts = (limit = 15) =>
  api.get('/api/workouts', { params: { limit } }).then((r) => r.data)
