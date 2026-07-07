import { useState } from 'react'
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle } from 'react-icons/hi2'
import Modal from './Modal'
import FileDropzone from './FileDropzone'
import { extractXmlText, parseAppleHealthXML } from '@/utils/appleHealthParser'
import { importRecords, importWorkouts } from '@/api/client'

export default function ImportModal({ open, onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null) // null | 'parsing' | 'uploading' | 'success' | 'error'
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')

  const reset = () => {
    setFile(null)
    setStatus(null)
    setProgress(0)
    setStatusMessage('')
  }

  const handleClose = () => {
    if (status === 'parsing' || status === 'uploading') return // don't let them close mid-import
    reset()
    onClose()
  }

  const handleImport = async () => {
    if (!file) return
    try {
      setStatus('parsing')
      setStatusMessage('Reading file…')
      setProgress(2)

      const xmlText = await extractXmlText(file)

      setStatusMessage('Parsing records — large exports can take a minute…')
      const result = await parseAppleHealthXML(xmlText, (pct) => setProgress(Math.round(pct * 0.6)))

      if (!result.days.length) {
        throw new Error('No recognizable health records found in that file.')
      }

      setStatus('uploading')
      setStatusMessage(`Saving ${result.days.length} days to your database…`)
      await importRecords(result.days, (pct) => setProgress(60 + Math.round(pct * 0.3)))

      if (result.workouts.length) {
        setStatusMessage(`Saving ${result.workouts.length} workouts…`)
        await importWorkouts(result.workouts)
      }

      setProgress(100)
      setStatus('success')
      setStatusMessage(`Imported ${result.days.length} days of data.`)
      onImported?.()
      setTimeout(() => {
        reset()
        onClose()
      }, 1000)
    } catch (err) {
      setStatus('error')
      setStatusMessage(
        err.response?.data?.error || err.message || 'Import failed — make sure the VitalOS server is running.'
      )
    }
  }

  const busy = status === 'parsing' || status === 'uploading'

  return (
    <Modal open={open} onClose={handleClose} title="Import Apple Health Export" subtitle="Runs entirely in your browser">
      <div className="space-y-5">
        <div className="glass rounded-xl p-4 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          <b className="text-[var(--color-text-primary)]">1.</b> Open the Health app → tap your profile picture →{' '}
          <b className="text-[var(--color-text-primary)]">Export All Health Data</b>
          <br />
          <b className="text-[var(--color-text-primary)]">2.</b> AirDrop or save <span className="font-mono">export.zip</span> to this device
          <br />
          <b className="text-[var(--color-text-primary)]">3.</b> Drop it below
        </div>

        <FileDropzone onFileSelected={setFile} selectedFile={file} disabled={busy} accept=".xml,.zip" />

        {(status === 'parsing' || status === 'uploading') && (
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                className="h-full rounded-full bg-[var(--color-ion-500)] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{statusMessage}</p>
          </div>
        )}
        {status === 'success' && (
          <p className="flex items-center gap-2 text-sm text-[var(--color-vital-teal)]">
            <HiOutlineCheckCircle size={16} /> {statusMessage}
          </p>
        )}
        {status === 'error' && (
          <p className="flex items-center gap-2 text-sm text-[var(--color-vital-rose)]">
            <HiOutlineExclamationTriangle size={16} /> {statusMessage}
          </p>
        )}

        <button
          onClick={handleImport}
          disabled={!file || busy}
          className="w-full rounded-xl bg-[var(--color-ion-500)] py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? statusMessage : 'Import'}
        </button>
      </div>
    </Modal>
  )
}
