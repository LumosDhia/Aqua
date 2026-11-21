import { t } from '../../i18n'
import {
  MARKET_PHOTO_ACCEPT,
  readPhotoDataUrl,
  sniffPhotoType,
  stripDataUrl,
} from '../market/photos'

export const SKETCH_ACCEPT = MARKET_PHOTO_ACCEPT
export const SKETCH_MAX_BYTES = 6 * 1024 * 1024

export async function readSketch(file: File): Promise<
  { ok: true; data: string; previewUrl: string; name: string } | { ok: false; message: string }
> {
  if (!sniffPhotoType(file)) return { ok: false, message: t('onboarding.pictureType') }
  if (file.size > SKETCH_MAX_BYTES) return { ok: false, message: t('onboarding.pictureSize') }
  try {
    const previewUrl = await readPhotoDataUrl(file)
    return { ok: true, data: stripDataUrl(previewUrl), previewUrl, name: file.name }
  } catch {
    return { ok: false, message: t('common.errorFileRead') }
  }
}
