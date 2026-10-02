// The shared screens' routes. The host adds them to its router beside its own.
import type { RouteRecordRaw } from 'vue-router'

/** The route name of Export / Import, which the frame's first entry opens. */
export const EXPORT_IMPORT = 'configbyte-export-import'

export function adminRoutes(): RouteRecordRaw[] {
  return [
    { path: '/', redirect: { name: EXPORT_IMPORT } },
    { path: '/export-import', name: EXPORT_IMPORT, component: () => import('./views/ExportImportView.vue') },
  ]
}
