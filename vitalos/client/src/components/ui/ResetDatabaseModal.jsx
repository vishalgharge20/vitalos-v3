import { useState } from 'react'
import {
  HiOutlineTrash,
  HiOutlineExclamationTriangle,
  HiOutlineCheckCircle,
  HiOutlineArrowPath,
} from 'react-icons/hi2'
import Modal from './Modal'
import { deleteAllRecords } from '@/api/client'

export default function ResetDatabaseModal({ open, onClose, onResetComplete }) {
  const [isResetting, setIsResetting] = useState(false)
  const [status, setStatus] = useState(null) // null | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('')

  const handleReset = async () => {
    try {
      setIsResetting(true)
      setStatus(null)
      setErrorMessage('')

      // 1. Wipe backend database (all collections + initialize today to 0)
      await deleteAllRecords()

      // 2. Clear browser cache
      try {
        localStorage.removeItem('vitalos_cache_v1')
      } catch {
        // non-fatal
      }

      setStatus('success')

      // 3. Trigger app reload
      setTimeout(() => {
        onResetComplete?.()
        setIsResetting(false)
        setStatus(null)
        onClose()
      }, 1200)
    } catch (err) {
      setIsResetting(false)
      setStatus('error')
      setErrorMessage(err.response?.data?.message || err.message || 'Failed to reset database.')
    }
  }

  const handleClose = () => {
    if (isResetting) return
    setStatus(null)
    setErrorMessage('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Reset Database"
      subtitle="Permanently wipe all health data and start fresh"
      maxWidth="max-w-md"
    >
      <div className="space-y-5">
        {status === 'success' ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-vital-teal)]/15 text-[var(--color-vital-teal)]">
              <HiOutlineCheckCircle size={32} />
            </div>
            <p className="mt-4 text-base font-semibold text-white">Database Reset Complete!</p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              All collections wiped. Today has been initialized to 0. Reloading dashboard…
            </p>
          </div>
        ) : (
          <>
            {/* Warning Box */}
            <div className="rounded-2xl border border-[var(--color-vital-rose)]/30 bg-[var(--color-vital-rose)]/10 p-4">
              <div className="flex items-start gap-3">
                <HiOutlineExclamationTriangle className="mt-0.5 shrink-0 text-[var(--color-vital-rose)]" size={20} />
                <div className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  <p className="font-semibold text-[var(--color-vital-rose)]">Warning: Irreversible Action</p>
                  <p className="mt-1">
                    This will permanently delete all records from your MongoDB Atlas database:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[var(--color-text-tertiary)]">
                    <li>All historical daily records and logging streaks</li>
                    <li>All workouts, raw samples, and uploaded screenshots</li>
                    <li>Live sync history and device counters</li>
                  </ul>
                  <p className="mt-2 text-[var(--color-vital-teal)]">
                    Today&apos;s record will be cleanly reset to 0 so you can start syncing fresh.
                  </p>
                </div>
              </div>
            </div>

            {status === 'error' && (
              <div className="rounded-xl border border-[var(--color-vital-rose)]/40 bg-[var(--color-vital-rose)]/10 p-3 text-xs text-[var(--color-vital-rose)]">
                {errorMessage}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isResetting}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-hover)] hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting}
                className="flex items-center gap-2 rounded-xl bg-[var(--color-vital-rose)] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[var(--color-vital-rose)]/20 transition hover:opacity-90 disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <HiOutlineArrowPath className="animate-spin" size={16} />
                    <span>Resetting Database…</span>
                  </>
                ) : (
                  <>
                    <HiOutlineTrash size={16} />
                    <span>Yes, Reset Everything</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
