/**
 * FileUpload — drag-and-drop zone + browse button.
 *
 * Accepted types: .pdf, .png, .jpg, .jpeg, .docx
 * Shows a progress bar while uploading.
 * Calls onUploaded(fileRef) when done.
 */

import { useCallback, useRef, useState, DragEvent, ChangeEvent } from 'react'
import type { FileRef } from '@/types/session'
import { useFileUpload } from '@/hooks/useFileUpload'
import type { AgentId } from '@/types/agent'

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.docx'
const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

interface FileUploadProps {
  agentId: AgentId
  caseId?: string
  onUploaded: (ref: FileRef) => void
}

export function FileUpload({ agentId, caseId, onUploaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const { uploadFile, isUploading, uploadProgress, error, fileRef } = useFileUpload(agentId)

  const handleFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.has(file.type)) return
      const ref = await uploadFile(file, caseId)
      if (ref) onUploaded(ref)
    },
    [uploadFile, caseId, onUploaded],
  )

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }

  const onDragLeave = () => setDragging(false)

  if (fileRef) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <span>✓</span>
        <span className="truncate font-medium">{fileRef.file_ref.split('/').pop()}</span>
        <span className="text-green-600">uploaded</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-sm cursor-pointer transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
        } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-gray-600">
          {isUploading ? 'Uploading…' : 'Drag & drop or click to browse'}
        </p>
        <p className="text-xs text-gray-400">PDF, PNG, JPG, DOCX</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {/* Progress bar */}
      {isUploading && (
        <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-200"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
