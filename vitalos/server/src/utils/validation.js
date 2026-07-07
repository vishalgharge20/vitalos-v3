const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateString(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return false
  const d = new Date(date + 'T00:00:00Z')
  return !Number.isNaN(d.getTime())
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
