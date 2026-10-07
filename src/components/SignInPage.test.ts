// The one sign-in page, drawn from what the host gives it: one button per way by
// its exact name, the language menu, and every state before using the app.
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

import SignInPage from './SignInPage.vue'
import { messages } from '../plugin'
import type { SignInWay } from '../lib/signin'

const ways: SignInWay[] = [
  { key: 'webEid', flow: 'card', name: 'eID' },
  { key: 'upstream', flow: 'redirect', name: 'Microsoft Entra' },
]
const languages = [
  { code: 'en', name: 'English' },
  { code: 'lv', name: 'Latviešu' },
]

function page(props: Record<string, unknown> = {}, locale = 'en') {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: structuredClone(messages) })

  return mount(SignInPage, {
    props: { product: 'acme', title: 'Sign in to acme', lead: 'Sign in to see your work.', ways, languages, language: locale, ...props },
    slots: { mark: '<svg data-mark />' },
    global: { plugins: [i18n] },
  })
}

const wayButtons = (w: ReturnType<typeof page>) => w.findAll('[data-way]')

describe('the sign-in page', () => {
  it('draws one button per way, by its exact name, in the order given', () => {
    const w = page()
    expect(wayButtons(w).map((b) => b.text())).toEqual(['eID', 'Microsoft Entra'])
    expect(wayButtons(w)[0].classes()).toContain('bg-ink')
    expect(wayButtons(w)[1].classes()).not.toContain('bg-ink')
  })

  it('says what each way does, by its name', () => {
    expect(page().text()).toContain(
      'eID is your ID card, read by the card software on this computer; it asks for your PIN. Microsoft Entra opens your company’s own sign-in page.',
    )
  })

  it('tells the host which way was chosen, and runs nothing itself', async () => {
    const w = page()
    await wayButtons(w)[1].trigger('click')
    expect(w.emitted('start')).toEqual([[ways[1]]])
  })

  it('waits on the card with every way held, saying so on the card’s own button', () => {
    const w = page({ waitingFor: 'webEid' })
    expect(wayButtons(w)[0].text()).toBe('Waiting for the card…')
    for (const b of wayButtons(w)) expect(b.attributes('disabled')).toBeDefined()
  })

  it('draws the host’s mark on the brand’s ink tile, beside the product’s name', () => {
    const w = page()
    const tile = w.get('[data-mark]').element.parentElement!
    expect(tile.classList.contains('bg-ink')).toBe(true)
    expect(tile.getAttribute('style')).toContain('width: 30px')
    expect(tile.parentElement!.textContent).toContain('acme')
  })

  it('carries the host’s heading, its lead, its tag and a link to the everyday app', () => {
    const w = page({ tag: 'admin', link: { label: 'Open acme →', href: 'https://app.example.test/' } })
    expect(w.get('h1').text()).toBe('Sign in to acme')
    expect(w.text()).toContain('Sign in to see your work.')
    expect(w.text()).toContain('admin')
    expect(w.get('a[href="https://app.example.test/"]').text()).toBe('Open acme →')
  })

  it.each([
    ['cancelled', 'alert', 'The sign-in was cancelled. Nothing happened — you can try again.'],
    ['notMember', 'alert', 'This account is not a member of this workspace. Ask its administrator to invite you, then sign in again.'],
    ['providerError', 'alert', 'The identity provider could not complete the sign-in. Try again; if it keeps failing, it is on their side rather than yours.'],
    ['incomplete', 'alert', 'The sign-in came back incomplete. Start it again from here.'],
    ['expired', 'alert', 'That sign-in took too long and has expired. Start a fresh one.'],
    ['unmatched', 'alert', 'That sign-in could not be matched to the one that started. Start a fresh one.'],
    ['failed', 'alert', 'The sign-in could not be completed. Try again.'],
    ['unknown', 'alert', 'The sign-in did not complete. Try again.'],
    ['cardFailed', 'alert', 'That did not complete. Check the card is in the reader and try again.'],
    ['ended', 'status', 'Your sign-in has ended. Sign in again.'],
  ])('says %s in its own words, announced as %s', (message, role, words) => {
    const w = page({ message })
    const said = w.get(`[role="${role}"]`)
    expect(said.text()).toBe(words)
    expect(said.attributes('data-said')).toBe(message)
  })

  it('says a sign-out happened, naming the app as the host words it', () => {
    const w = page({ message: 'signedOut', signedOutOf: 'the admin app' })
    expect(w.get('[role="status"]').text()).toBe(
      'You are signed out of the admin app. If you used your company’s own sign-in, it stays signed in on this computer: on a shared computer, sign out of it too.',
    )
  })

  it('tones a refusal apart from a sign-out and an ended sign-in', () => {
    expect(page({ message: 'notMember' }).get('[data-said]').classes()).toContain('border-l-status-late')
    expect(page({ message: 'signedOut' }).get('[data-said]').classes()).toContain('border-l-status-ontrack')
    expect(page({ message: 'ended' }).get('[data-said]').classes()).toContain('border-l-ink')
  })

  it('says the card software is missing as a step to take, with where to get it', () => {
    const w = page({ softwareMissing: true })
    const box = w.get('[data-said="softwareMissing"]')
    expect(box.attributes('role')).toBe('alert')
    expect(box.text()).toContain('The card software is not running')
    expect(box.get('a').attributes('href')).toMatch(/^https:\/\//)
  })

  it('says so when the deployment offers no way to sign in, and draws no button', () => {
    const w = page({ ways: [] })
    expect(wayButtons(w)).toHaveLength(0)
    expect(w.text()).toContain('No way to sign in is set up here. Tell whoever runs this deployment.')
  })

  it('speaks the language it is given', () => {
    const w = page({ message: 'ended' }, 'lv')
    expect(w.get('[role="status"]').text()).toBe('Jūsu pieslēgšanās ir beigusies. Pieslēdzieties vēlreiz.')
    expect(w.text()).toContain('eID ir jūsu ID karte')
  })

  it('offers the language menu, naming the language in use in itself, and reports a choice', async () => {
    const w = page({}, 'lv')
    expect(w.get('[role="group"]').attributes('aria-label')).toBe('Valoda')
    expect(w.get('button[aria-haspopup]').text()).toContain('Latviešu')
    w.findComponent({ name: 'LanguageMenu' }).vm.$emit('update:modelValue', 'en')
    expect(w.emitted('update:language')).toEqual([['en']])
  })

  it('offers no language menu when there is only one language', () => {
    expect(page({ languages: [languages[0]] }).find('button[aria-haspopup]').exists()).toBe(false)
  })
})
