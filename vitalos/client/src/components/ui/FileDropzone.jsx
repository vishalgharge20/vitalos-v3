import { useRef, useState } from 'react'
import { HiOutlineArrowUpTray, HiOutlineDocumentText } from 'react-icons/hi2'

export default function FileDropzone({ onFileSelected, selectedFile, disabled, accept }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = (files) => {
    const file = files?.[0]
    if (file) onFileSelected(file)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (!disabled) handleFiles(e.dataTransfer.files)
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
        dragOver
          ? 'border-[var(--color-ion-500)] bg-[var(--color-ion-glow)]/10'
          : 'border-[var(--color-border-strong)] hover:border-[var(--color-ion-500)]/60'
      } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {selectedFile ? (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-ion-glow)]/20 text-[var(--color-ion-400)]">
            <HiOutlineDocumentText size={22} />
          </span>
          <div>
            <p className="text-sm font-medium">{selectedFile.name}</p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB — click to choose a different file
            </p>
          </div>
        </>
      ) : (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-ion-glow)]/20 text-[var(--color-ion-400)]">
            <HiOutlineArrowUpTray size={20} />
          </span>
          <div>
            <p className="text-sm font-medium">Drop export.zip or export.xml here</p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              The .zip works directly — no need to unzip it yourself
            </p>
          </div>
        </>
      )}
    </div>
  )
}
