import { t } from '../../i18n'
import { newChatId } from './storage'

export const CHAT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,text/markdown'

export const CHAT_MAX_FILES = 4
export const CHAT_MAX_BYTES = 5 * 1024 * 1024

const TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  markdown: 'text/markdown',
}

const ALLOWED = new Set(Object.values(TYPE_BY_EXT))

export type PreparedFile = {
  id: string
  name: string
  media_type: string
  data: string
  previewUrl: string
}


function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function sniffMediaType(file: File): string | null {
  const raw = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  if (ALLOWED.has(raw)) return raw
  const mapped = TYPE_BY_EXT[extOf(file.name)]
  return mapped ?? null
}

export function isImageType(mediaType: string): boolean {
  return mediaType.startsWith('image/')
}

function readAsAttachment(file: File, mediaType: string): Promise<PreparedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const previewUrl = typeof reader.result === 'string' ? reader.result : ''
      const comma = previewUrl.indexOf(',')
      const data = comma >= 0 ? previewUrl.slice(comma + 1) : previewUrl
      resolve({
        id: newChatId(),
        name: file.name,
        media_type: mediaType,
        data,
        previewUrl,
      })
    }
    reader.onerror = () => reject(new Error('read'))
    reader.readAsDataURL(file)
  })
}

export async function prepareFiles(
  incoming: File[],
  already: number,
): Promise<{ accepted: PreparedFile[]; message: string }> {
  const accepted: PreparedFile[] = []
  let message = ''
  for (const file of incoming) {
    if (already + accepted.length >= CHAT_MAX_FILES) {
      message = t('chat.fileLimit')
      break
    }
    const mediaType = sniffMediaType(file)
    if (!mediaType) {
      message = t('chat.fileType')
      continue
    }
    if (file.size > CHAT_MAX_BYTES) {
      message = t('chat.fileSize')
      continue
    }
    try {
      accepted.push(await readAsAttachment(file, mediaType))
    } catch {
      message = 'Could not read that file.'
    }
  }
  return { accepted, message }
}
