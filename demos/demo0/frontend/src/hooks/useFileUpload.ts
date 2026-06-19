/**
 * useFileUpload — uploads a file to POST /upload via XMLHttpRequest
 * so we can track upload progress (0-100 %).
 */

import { useCallback, useState } from 'react'
import type { AgentId } from '@/types/agent'
import type { FileRef } from '@/types/session'
import { AGENTS } from '@/config/agents'

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true'

interface UseFileUploadReturn {
  uploadFile: (file: File, caseId?: string) => Promise<FileRef | null>
  fileRef: FileRef | null
  isUploading: boolean
  uploadProgress: number
  error: string | null
  reset: () => void
}

export function useFileUpload(agentId: AgentId): UseFileUploadReturn {
  const [fileRef, setFileRef] = useState<FileRef | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const uploadFile = useCallback(
    async (file: File, caseId?: string): Promise<FileRef | null> => {
      setError(null)
      setUploadProgress(0)
      setIsUploading(true)
      setFileRef(null)

      // Mock path — use the mock API client
      if (USE_MOCK) {
        const { createMockClient } = await import('@/api/mock')
        try {
          // Simulate progress
          for (let p = 10; p <= 90; p += 20) {
            await new Promise<void>((r) => setTimeout(r, 150))
            setUploadProgress(p)
          }
          const ref = await createMockClient(agentId).postUpload(file, caseId)
          setUploadProgress(100)
          setFileRef(ref)
          return ref
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload failed')
          return null
        } finally {
          setIsUploading(false)
        }
      }

      // Real XHR upload
      return new Promise<FileRef | null>((resolve) => {
        const agent = AGENTS.find((a) => a.id === agentId)
        if (!agent) {
          setError(`Unknown agent: ${agentId}`)
          setIsUploading(false)
          resolve(null)
          return
        }

        const form = new FormData()
        form.append('file', file)
        form.append('user_id', 'demo')
        if (caseId) form.append('case_id', caseId)

        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${agent.apiUrl.replace(/\/$/, '')}/upload`)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          setIsUploading(false)
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const ref = JSON.parse(xhr.responseText) as FileRef
              setFileRef(ref)
              setUploadProgress(100)
              resolve(ref)
            } catch {
              setError('Invalid response from server')
              resolve(null)
            }
          } else {
            setError(`Upload failed: ${xhr.status} ${xhr.statusText}`)
            resolve(null)
          }
        }

        xhr.onerror = () => {
          setIsUploading(false)
          setError('Network error during upload')
          resolve(null)
        }

        xhr.send(form)
      })
    },
    [agentId],
  )

  const reset = useCallback(() => {
    setFileRef(null)
    setIsUploading(false)
    setUploadProgress(0)
    setError(null)
  }, [])

  return { uploadFile, fileRef, isUploading, uploadProgress, error, reset }
}
