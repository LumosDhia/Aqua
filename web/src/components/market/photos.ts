export const MARKET_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
export const MARKET_PHOTO_MAX = 5
export const MARKET_PHOTO_MAX_BYTES = 3 * 1024 * 1024

const TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}


function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function sniffPhotoType(file: File): string | null {
  const raw = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  if (raw === 'image/jpeg' || raw === 'image/png' || raw === 'image/webp') return raw
  return TYPE_BY_EXT[extOf(file.name)] ?? null
}

export function readPhotoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => reject(new Error('read'))
    reader.readAsDataURL(file)
  })
}

export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}
