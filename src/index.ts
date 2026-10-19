// The shared screens of a deployment's admin app.
export { default as AdminFrame } from './AdminFrame.vue'
export { configbyteScreens, messages, type HostTranslator } from './plugin'
export {
  adminRoutes,
  EXPORT_IMPORT,
  PEOPLE_ACCESS,
  PEOPLE_ROLE,
  PEOPLE_ROLE_NEW,
  PEOPLE_ROLES,
  PEOPLE_USER,
  PEOPLE_USER_TYPE,
  PEOPLE_USER_TYPE_NEW,
  PEOPLE_USER_TYPES,
} from './routes'
export type {
  AdminEntry,
  AdminOptions,
  HistoryLine,
  HistoryNames,
  HistoryOptions,
  HistorySource,
  LineWords,
  PartWord,
  RoleBoxOptions,
  RoleSetting,
  SectionWords,
  TransferOptions,
  TransferRow,
  TransferWords,
} from './options'
// What a host's `write` throws when a change is refused, so the refusal is said in words.
export { ApiError } from './lib/api'
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
