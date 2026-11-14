// What the package hands to a host: the page that asks which workspace to work in and the module
// of the workspace a page was opened for, beside everything it handed out before.
import { describe, expect, it } from 'vitest'

import * as screens from './index'

describe('what the package exports', () => {
  it('exports the page to choose a workspace and the module of the workspace a page was opened for', () => {
    expect(screens.ChooseWorkspace).toBeTruthy()
    for (const name of ['workspaceHeaders', 'isOtherWorkspace', 'whenWorkspaceMoves', 'workspaceMoved', 'workspaceOpenedFor']) {
      expect(typeof (screens as Record<string, unknown>)[name], name).toBe('function')
    }
    expect(screens.WORKSPACE_HEADER).toBe('Workspace-Id')
    expect(screens.OTHER_WORKSPACE).toBe('err:session:otherWorkspace')
  })

  it('still exports everything it exported before', () => {
    const before = [
      'AdminFrame',
      'configbyteScreens',
      'messages',
      'adminRoutes',
      'DEPLOYMENT_ADMINS',
      'DEPLOYMENT_COMPANIES',
      'DEPLOYMENT_COMPANY',
      'DEPLOYMENT_COMPANY_NEW',
      'DEPLOYMENT_SIGN_IN_TAB',
      'EXPORT_IMPORT',
      'PEOPLE_ACCESS',
      'PEOPLE_ASSISTANT',
      'PEOPLE_ASSISTANTS',
      'PEOPLE_ROLE',
      'PEOPLE_ROLE_NEW',
      'PEOPLE_ROLES',
      'PEOPLE_USER',
      'PEOPLE_USER_TYPE',
      'PEOPLE_USER_TYPE_NEW',
      'PEOPLE_USER_TYPES',
      'ApiError',
      'useAdminSession',
      'SignInPage',
      'keepLanguage',
      'keptLanguage',
      'languageBeforeSignIn',
      'messageOfMarker',
      'noteSignedOut',
      'takeSignedOut',
      'wayName',
    ]
    const exported = screens as Record<string, unknown>
    expect(before.filter((name) => exported[name] === undefined)).toEqual([])
  })
})
