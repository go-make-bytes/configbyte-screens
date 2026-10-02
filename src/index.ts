// The shared screens of a deployment's admin app.
export { default as AdminFrame } from './AdminFrame.vue'
export { configbyteScreens, messages, type HostTranslator } from './plugin'
export { adminRoutes, EXPORT_IMPORT } from './routes'
export type { AdminEntry, AdminOptions, PartWord, SectionWords } from './options'
export { useAdminSession, type Identity } from './stores/session'
