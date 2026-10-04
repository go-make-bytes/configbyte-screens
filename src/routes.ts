// The shared screens' routes. The host adds them to its router beside its own.
import type { RouteRecordRaw } from 'vue-router'

/** The route name of Export / Import, which the frame's first entry opens. */
export const EXPORT_IMPORT = 'configbyte-export-import'
/** The route name of History. */
export const HISTORY = 'configbyte-history'
/** The route name of People & access. */
export const PEOPLE_ACCESS = 'configbyte-people-access'

export function adminRoutes(): RouteRecordRaw[] {
  return [
    { path: '/', redirect: { name: EXPORT_IMPORT } },
    { path: '/export-import', name: EXPORT_IMPORT, component: () => import('./views/ExportImportView.vue') },
    { path: '/history', name: HISTORY, component: () => import('./views/HistoryView.vue') },
    { path: '/people', name: PEOPLE_ACCESS, component: () => import('./views/PeopleAccessView.vue') },
  ]
}
