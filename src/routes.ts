// The shared screens' routes. The host adds them to its router beside its own.
import type { RouteRecordRaw } from 'vue-router'

/** The route name of Export / Import, which the frame's first entry opens. */
export const EXPORT_IMPORT = 'configbyte-export-import'
/** The route name of History. */
export const HISTORY = 'configbyte-history'
/** The route name of People & access: the Users list. */
export const PEOPLE_ACCESS = 'configbyte-people-access'
/** One person open, beside the Users list or alone: `/people/users/:id`. */
export const PEOPLE_USER = 'configbyte-people-user'
/** The Roles list. */
export const PEOPLE_ROLES = 'configbyte-people-roles'
/** A role being made. */
export const PEOPLE_ROLE_NEW = 'configbyte-people-role-new'
/** One role, on a page of its own: `/people/roles/:id`. */
export const PEOPLE_ROLE = 'configbyte-people-role'
/** The User types list. */
export const PEOPLE_USER_TYPES = 'configbyte-people-user-types'
/** A user type being made. */
export const PEOPLE_USER_TYPE_NEW = 'configbyte-people-user-type-new'
/** One user type, on a page of its own: `/people/user-types/:id`. */
export const PEOPLE_USER_TYPE = 'configbyte-people-user-type'
/** The Assistants list. */
export const PEOPLE_ASSISTANTS = 'configbyte-people-assistants'
/** One assistant open, beside the Assistants list or alone: `/people/assistants/:id`. */
export const PEOPLE_ASSISTANT = 'configbyte-people-assistant'

/** The companies a deployment serves: `/deployment/companies`. */
export const DEPLOYMENT_COMPANIES = 'configbyte-deployment-companies'
/** Opening a company: `/deployment/companies/new`. */
export const DEPLOYMENT_COMPANY_NEW = 'configbyte-deployment-company-new'
/** One company on a page of its own: `/deployment/companies/:id`. */
export const DEPLOYMENT_COMPANY = 'configbyte-deployment-company'
/** The people who manage the deployment: `/deployment/admins`. */
export const DEPLOYMENT_ADMINS = 'configbyte-deployment-admins'

/** The tab a sign-in again is made in, opened from a page that must keep what was typed: `/deployment/sign-in-again`. */
export const DEPLOYMENT_SIGN_IN_TAB = 'configbyte-deployment-sign-in-tab'

/**
 * The places inside People & access are children of its one screen, so that
 * screen stays as it is while a person, a role or a user type is opened, and
 * the sidebar's entry stays marked on every one of them. The screen draws the
 * place from the route's name; the children draw nothing themselves.
 */
const place = { render: () => null }

export function adminRoutes(): RouteRecordRaw[] {
  return [
    { path: '/', redirect: { name: EXPORT_IMPORT } },
    { path: '/export-import', name: EXPORT_IMPORT, component: () => import('./views/ExportImportView.vue') },
    { path: '/history', name: HISTORY, component: () => import('./views/HistoryView.vue') },
    { path: '/deployment/companies', name: DEPLOYMENT_COMPANIES, component: () => import('./views/deployment/CompaniesView.vue') },
    { path: '/deployment/companies/new', name: DEPLOYMENT_COMPANY_NEW, component: () => import('./views/deployment/OpenCompanyView.vue') },
    { path: '/deployment/companies/:id', name: DEPLOYMENT_COMPANY, component: () => import('./views/deployment/CompanyView.vue') },
    { path: '/deployment/admins', name: DEPLOYMENT_ADMINS, component: () => import('./views/deployment/DeploymentAdminsView.vue') },
    // The sign-in tab is drawn by the frame, as a page of its own without the menu; the place draws nothing.
    { path: '/deployment/sign-in-again', name: DEPLOYMENT_SIGN_IN_TAB, component: place },
    {
      path: '/people',
      name: PEOPLE_ACCESS,
      component: () => import('./views/PeopleAccessView.vue'),
      children: [
        { path: 'users/:id', name: PEOPLE_USER, component: place },
        { path: 'roles', name: PEOPLE_ROLES, component: place },
        { path: 'roles/new', name: PEOPLE_ROLE_NEW, component: place },
        { path: 'roles/:id', name: PEOPLE_ROLE, component: place },
        { path: 'user-types', name: PEOPLE_USER_TYPES, component: place },
        { path: 'user-types/new', name: PEOPLE_USER_TYPE_NEW, component: place },
        { path: 'user-types/:id', name: PEOPLE_USER_TYPE, component: place },
        { path: 'assistants', name: PEOPLE_ASSISTANTS, component: place },
        { path: 'assistants/:id', name: PEOPLE_ASSISTANT, component: place },
      ],
    },
  ]
}
