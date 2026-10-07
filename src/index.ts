// The shared screens of a deployment's admin app.
export { default as AdminFrame } from './AdminFrame.vue'
export { configbyteScreens, messages, type HostTranslator } from './plugin'
export { adminRoutes, EXPORT_IMPORT } from './routes'
export type { AdminEntry, AdminOptions, PartWord, SectionWords } from './options'
export { useAdminSession, type Identity } from './stores/session'

// The one sign-in page, for every app of a deployment, and what it reads.
export { default as SignInPage } from './components/SignInPage.vue'
export {
  keepLanguage,
  keptLanguage,
  languageBeforeSignIn,
  messageOfMarker,
  noteSignedOut,
  takeSignedOut,
  wayName,
  type SignInFlow,
  type SignInMessage,
  type SignInWay,
} from './lib/signin'
export { CARD_SOFTWARE_URL, CardError, isCardSoftwareMissing, signChallenge } from './lib/webeid'
