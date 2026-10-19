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
      ],
    },
  ]
}
