import { t } from '../../i18n'
import type { ComponentType } from 'react'
import type { WaterKind } from '../../api'
import {
  BoreholeIcon,
  CanalIcon,
  NetworkIcon,
  RainTankIcon,
  TankIcon,
  WellIcon,
  type WaterSourceIconProps,
} from '../icons/WaterSourceIcons'

type KindIcon = ComponentType<WaterSourceIconProps>

export const WATER_KINDS: { id: WaterKind; label: string; Icon: KindIcon }[] = [
  { id: 'tank', get label() { return t('water.tank') }, Icon: TankIcon },
  { id: 'well', get label() { return t('water.well') }, Icon: WellIcon },
  { id: 'borehole', get label() { return t('water.borehole') }, Icon: BoreholeIcon },
  { id: 'rain_tank', get label() { return t('market.rainTank') }, Icon: RainTankIcon },
  { id: 'network', get label() { return t('water.publicNetwork') }, Icon: NetworkIcon },
  { id: 'canal', get label() { return t('water.canal') }, Icon: CanalIcon },
]

const FALLBACK: { label: string; Icon: KindIcon } = { get label() { return t('water.tank') }, Icon: TankIcon }

export function isWaterKind(value: string): value is WaterKind {
  return WATER_KINDS.some((k) => k.id === value)
}

export function waterKindMeta(kind: WaterKind): { label: string; Icon: KindIcon } {
  return WATER_KINDS.find((k) => k.id === kind) ?? FALLBACK
}
