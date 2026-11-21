import { t } from '../../i18n'
import type { CvData, CvEducation, CvExperience, CvLanguage, CvSource } from '../../api'
import { readPhotoDataUrl, stripDataUrl } from '../market/photos'

export const CV_NAME_MAX = 120
export const CV_SUMMARY_MAX = 1500
export const CV_EXPERIENCE_MAX = 15
export const CV_ROLE_MAX = 80
export const CV_EMPLOYER_MAX = 120
export const CV_PLACE_MAX = 80
export const CV_DATE_MAX = 20
export const CV_JOB_DESC_MAX = 600
export const CV_EDUCATION_MAX = 8
export const CV_SCHOOL_MAX = 120
export const CV_DEGREE_MAX = 120
export const CV_YEAR_MAX = 20
export const CV_SKILLS_MAX = 20
export const CV_SKILL_LEN = 30
export const CV_LANGS_MAX = 6
export const CV_LANG_LEN = 30
export const CV_CERTS_MAX = 8
export const CV_CERT_LEN = 80
export const CV_DESCRIBE_MIN = 10
export const CV_DESCRIBE_MAX = 4000
export const CV_FIX_MIN = 3
export const CV_FIX_MAX = 1000
export const CV_FILE_MAX_BYTES = 8 * 1024 * 1024
export const CV_FILE_ACCEPT = '.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp'

export const LANG_LEVELS = ['Basic', 'Good', 'Fluent', 'Native'] as const

export type LangLevel = (typeof LANG_LEVELS)[number]

const levelKeys: Record<LangLevel, string> = {
  Basic: 'cv.languages.basic',
  Good: 'cv.languages.good',
  Fluent: 'cv.languages.fluent',
  Native: 'cv.languages.native',
}

export function languageLevelLabel(level: string): string {
  return isLangLevel(level) ? t(levelKeys[level]) : level
}

export function isLangLevel(value: string): value is LangLevel {
  return (LANG_LEVELS as readonly string[]).includes(value)
}

export function blankExperience(): CvExperience {
  return { role: '', employer: '', place: '', start: '', end: '', description: '' }
}

export function blankEducation(): CvEducation {
  return { school: '', degree: '', year: '' }
}

export function blankLanguage(): CvLanguage {
  return { name: '', level: '' }
}

export function asCvSource(raw: string | null | undefined): CvSource {
  if (raw === 'uploaded' || raw === 'described' || raw === 'manual') return raw
  return 'manual'
}

export function emptyCv(fullName = ''): CvData {
  return {
    full_name: fullName.slice(0, CV_NAME_MAX),
    summary: '',
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
  }
}

function clip(value: unknown, max: number): string {
  return (typeof value === 'string' ? value : '').slice(0, max)
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function normalizeCv(raw: CvData | null | undefined, fallbackName = ''): CvData {
  const data = raw ?? emptyCv(fallbackName)
  return {
    full_name: clip(data.full_name, CV_NAME_MAX) || fallbackName.slice(0, CV_NAME_MAX),
    summary: clip(data.summary, CV_SUMMARY_MAX),
    experience: asList<CvExperience>(data.experience)
      .slice(0, CV_EXPERIENCE_MAX)
      .map((row) => ({
        role: clip(row.role, CV_ROLE_MAX),
        employer: clip(row.employer, CV_EMPLOYER_MAX),
        place: clip(row.place, CV_PLACE_MAX),
        start: clip(row.start, CV_DATE_MAX),
        end: clip(row.end, CV_DATE_MAX),
        description: clip(row.description, CV_JOB_DESC_MAX),
      })),
    education: asList<CvEducation>(data.education)
      .slice(0, CV_EDUCATION_MAX)
      .map((row) => ({
        school: clip(row.school, CV_SCHOOL_MAX),
        degree: clip(row.degree, CV_DEGREE_MAX),
        year: clip(row.year, CV_YEAR_MAX),
      })),
    skills: asList<string>(data.skills)
      .map((s) => clip(s, CV_SKILL_LEN).trim())
      .filter(Boolean)
      .slice(0, CV_SKILLS_MAX),
    languages: asList<CvLanguage>(data.languages)
      .map((row) => ({
        name: clip(row.name, CV_LANG_LEN),
        level: clip(row.level, CV_LANG_LEN),
      }))
      .filter((row) => row.name.trim())
      .slice(0, CV_LANGS_MAX),
    certifications: asList<string>(data.certifications)
      .map((s) => clip(s, CV_CERT_LEN).trim())
      .filter(Boolean)
      .slice(0, CV_CERTS_MAX),
  }
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function isCvFile(file: File): boolean {
  const type = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  const ext = extOf(file.name)
  if (type === 'application/pdf' || ext === 'pdf') return true
  if (type === 'application/msword' || ext === 'doc') return true
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return true
  }
  if (type === 'text/plain' || ext === 'txt') return true
  if (type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return true
  if (type === 'image/png' || ext === 'png') return true
  if (type === 'image/webp' || ext === 'webp') return true
  return false
}

export async function readCvFile(file: File): Promise<
  { ok: true; name: string; data: string } | { ok: false; message: string }
> {
  if (!isCvFile(file)) return { ok: false, message: t('cv.file.typeError') }
  if (file.size > CV_FILE_MAX_BYTES) return { ok: false, message: t('cv.file.sizeError') }
  try {
    const dataUrl = await readPhotoDataUrl(file)
    const data = stripDataUrl(dataUrl)
    if (!data) return { ok: false, message: t('common.errorFileRead') }
    return { ok: true, name: file.name.slice(0, 120), data }
  } catch {
    return { ok: false, message: t('common.errorFileRead') }
  }
}
