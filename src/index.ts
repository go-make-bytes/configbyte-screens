// The shared screens of a deployment's admin app.
export { default as AdminFrame } from './AdminFrame.vue'
export { configbyteScreens, messages, type HostTranslator } from './plugin'
export {
  adminRoutes,
  DEPLOYMENT_ADMINS,
  DEPLOYMENT_COMPANIES,
  DEPLOYMENT_COMPANY,
  DEPLOYMENT_COMPANY_NEW,
  DEPLOYMENT_SIGN_IN_TAB,
  EXPORT_IMPORT,
  PEOPLE_ACCESS,
  PEOPLE_ASSISTANT,
  PEOPLE_ASSISTANTS,
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
export { useAdminSession, type DeploymentState, type Identity } from './stores/session'

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
