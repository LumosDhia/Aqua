import type { AppView } from './view'

/** When true, non-admin accounts stay on their own farm's work and community hashes bounce home.
 *  False shows Water market, Jobs, Messages and Members for every signed-in account.
 *  The Admin entry stays limited to admin accounts.
 */
export const FARMER_FARM_WORK_ONLY = false

const OUTSIDE_FARM_WORK: ReadonlySet<AppView> = new Set(['market', 'jobs', 'messages', 'members', 'admin'])

export function farmWorkOnly(user: { role: string }): boolean {
  return FARMER_FARM_WORK_ONLY && user.role !== 'admin'
}

/** Admin stays admin-only. Community hashes bounce home only while farm-work mode is on. */
export function workspaceView(view: AppView, user: { role: string }): AppView {
  if (view === 'admin' && user.role !== 'admin') return 'dashboard'
  if (farmWorkOnly(user) && OUTSIDE_FARM_WORK.has(view)) return 'dashboard'
  return view
}

/** Farm-work accounts always open the farm they belong to. Admins keep the current choice. */
export function pinnedFarmId<T extends { id: number }>(
  farms: readonly T[],
  user: { role: string },
  currentId: number | null,
  preferredId: number | null,
): number | null {
  if (farmWorkOnly(user)) return farms[0]?.id ?? null
  if (currentId != null && farms.some((farm) => farm.id === currentId)) return currentId
  if (preferredId != null && farms.some((farm) => farm.id === preferredId)) return preferredId
  return farms[0]?.id ?? null
}
