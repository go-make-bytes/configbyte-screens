// @vitest-environment node
// Reads the area's pages off disk. Each page folds by the width of its own container,
// never by the width of the screen: a page beside a list is narrow on any screen, and a
// 32-inch screen can still hold a narrow page. jsdom draws no layout, so this is what can
// be checked here; the look at about 880 pixels is the walk's to see. The pages that stand
// alone, before any menu, are named too: the first run, the page that closes the app to a
// person, and the sign-in tab's own page.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const pages = [
  'CompaniesList.vue',
  'CompanyPage.vue',
  'OpenCompanyPage.vue',
  'DeploymentAdminsPage.vue',
  'SignInAgainPage.vue',
  '../../components/FirstRun.vue',
  '../../components/SignInPage.vue',
  '../../components/SignInTab.vue',
]

describe('the area’s pages', () => {
  it.each(pages)('%s has the container of its page at its root, and no screen-size switch', (file) => {
    const source = readFileSync(join(HERE, file), 'utf8')
    const template = source.slice(source.indexOf('<template>'))
    expect(template).toMatch(/<(section|main) class="@container\/page /)
    expect(template).not.toMatch(/\b(sm|md|lg|xl|2xl):/)
  })
})
