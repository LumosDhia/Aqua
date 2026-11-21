import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Snowflake,
  Sun,
  Thermometer,
  Wind,
  type LucideIcon,
} from 'lucide-react'

const CONDITION_ICONS: Record<string, LucideIcon> = {
  clear: Sun,
  partly_cloudy: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  thunder: CloudLightning,
}

const ALERT_ICONS: Record<string, LucideIcon> = {
  heat: Thermometer,
  frost: Snowflake,
  wind: Wind,
  rain: CloudRain,
}

export function weatherIcon(key: string): LucideIcon {
  return CONDITION_ICONS[key] ?? Cloud
}

export function alertKindIcon(kind: string): LucideIcon {
  return ALERT_ICONS[kind] ?? CloudRain
}
