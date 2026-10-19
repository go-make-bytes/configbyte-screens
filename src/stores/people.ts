// The workspace's people and what each holds, as the membership register keeps
// them, read and changed through the coordinator on the administrator's own
// authority. The register judges every act; the screen only says, in plain
// words, what it did or why it was refused.
//
// A refusal is worded by the act that was made and the status that came back,
// never by the register's own text: the same status can mean several things,
// and only the act knows which one the person needs to hear.
//
// Roles, user types and positions may carry names in other languages beside the
// name as entered (`labels`); a register that keeps none answers without them.
// These screens show the name as entered.
//
// Each list is read once a visit. An act reads again only the list it changed.
import { defineStore } from 'pinia'

import { ApiError, del, get, post, put, relay, segment } from '../lib/api'
import type { DeclaringService } from '../lib/boxes'
import { calledAlike, readsAlike, type Labels, type Named } from '../lib/names'
import en from '../locales/en.json'
import type { FieldBox, RoleSetting } from '../options'

/** The languages these screens have a word for, so a sentence can name one. */
const NAMED_LANGUAGES = Object.keys(en.configbyte.people.inLanguage)

/** A person or a machine that is a member of the workspace. */
export interface Member {
  id: string
  subjectKey: string
  displayName: string
  kind: 'person' | 'service'
  status: 'invited' | 'active' | 'revoked'
  administrator: boolean
  arrival: boolean
  tenantRoles: { id: string; name: string; labels?: Labels }[]
  userType: { id: string; name: string; labels?: Labels } | null
  /** The user type the person's position in the chart gives, which is then the one in force. */
  chartUserType: { id: string; name: string; labels?: Labels } | null
  /** The day the register last gave the member access, `YYYY-MM-DD`. */
  lastSignedInOn: string | null
}

/** One of the workspace's own roles, with every box it holds. */
export interface Role {
  id: string
  seed?: string
  name: string
  labels?: Labels
  description: string
  permissions: string[]
}

/** A user type: the one thing every person holds. */
export interface UserType {
  id: string
  name: string
  labels?: Labels
  description: string
  permissions: string[]
  corporateLoginDefault: boolean
  workspaceDefault: boolean
}

/** A position in the chart of authority: who sits in it, and the user type it gives. */
export interface Position {
  id: string
  name: string
  labels?: Labels
  /** The user type the position gives to whoever sits in it; empty when it gives none. */
  userTypeId?: string
  /** Whoever sits in it, by the register's member id. */
  people?: { userId: string }[]
}

/** What the host's setting holds now: read, being read, or not readable. */
export interface SettingValue {
  state: 'reading' | 'read' | 'unread'
  /** The role chosen now; empty for none. */
  roleId: string
}

/**
 * Words to show after an act: a key below `configbyte.people.said` or `.refused`,
 * and what it names. A sentence the host worded is a key of the host's own
 * translator (`hostKey`), which then stands in for the screens' key.
 */
export interface Said {
  kind: 'said' | 'refused'
  key: string
  values: Record<string, string | number>
  /** A language the words name, by its code: said in the reader's own word for it. */
  language?: string
  /** The host's own sentence, a key of its translator. */
  hostKey?: string
}

/** The acts whose refusals read differently. */
type Act =
  | 'userType'
  | 'giveRole'
  | 'takeRole'
  | 'administrator'
  | 'takeAll'
  | 'saveRole'
  | 'deleteRole'
  | 'saveUserType'
  | 'deleteUserType'
  | 'corporateLogin'
  | 'setting'

/** The three lists the register keeps for a workspace. */
type List = 'access' | 'roles' | 'user-types'

function unanswered(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 502 || e.status === 503 || e.status === 504

  return e instanceof TypeError
}

export const usePeople = defineStore('configbyte-people', {
  state: () => ({
    /** The section the register answers under, and the workspace it keeps. */
    section: '',
    tenant: '',
    members: [] as Member[],
    roles: [] as Role[],
    userTypes: [] as UserType[],
    services: [] as DeclaringService[],
    positions: [] as Position[],
    /** Whether the chart's positions were asked for in this visit. */
    positionsRead: false,
    /** The restricted fields' boxes; null when they could not be read. */
    fields: null as FieldBox[] | null,
    /** Whether the restricted fields were asked for in this visit, and whether that read is still under way. */
    fieldsRead: false,
    fieldsReading: false,
    /** The host's role settings, by key. */
    settings: {} as Record<string, SettingValue>,
    settingsRead: false,
    loading: false,
    loaded: false,
    /**
     * Why the register could not be read, as a kind: it did not answer, the person
     * is no longer an administrator, or something else (then `failedReason` holds
     * the refusal's own words, when it had any). Empty means it was read.
     */
    failed: '' as '' | 'unanswered' | 'notAdministrator' | 'other',
    failedReason: '',
    /** Which visit is the latest; an answer to an earlier one is dropped. */
    visit: 0,
    /** The words after the last act. */
    said: null as Said | null,
  }),
  getters: {
    byId: (state) => (id: string) => state.members.find((m) => m.id === id),
    bySubject: (state) => (subject: string) => state.members.find((m) => m.subjectKey === subject),
    people: (state) => state.members.filter((m) => m.kind === 'person'),
    machines: (state) => state.members.filter((m) => m.kind === 'service' && m.status !== 'revoked'),
    /** The administrators whose access is not revoked. */
    administrators: (state) => state.members.filter((m) => m.administrator && m.status !== 'revoked'),
    /** The user type every arrival receives. */
    workspaceDefault: (state) => state.userTypes.find((u) => u.workspaceDefault) ?? null,
    /** The restricted fields have been answered, one way or the other. */
    fieldsSettled: (state) => state.fieldsRead && !state.fieldsReading,
  },
  actions: {
    path(rest: string): string {
      return relay(this.section, rest)
    },

    tenantPath(rest: string): string {
      return this.path(`tenants/${segment(this.tenant)}/${rest}`)
    },

    /**
     * Start a visit: read the people, roles and user types, which are needed, and
     * the vocabulary, which only makes the boxes read better, so a failure there
     * leaves it empty. The chart and the restricted fields are read when a screen
     * first needs them.
     */
    async open(input: { section: string; tenant: string }) {
      // Another section or workspace shows nothing of the one before while it is read.
      if (input.section !== this.section || input.tenant !== this.tenant) {
        this.members = []
        this.roles = []
        this.userTypes = []
        this.services = []
        this.loaded = false
      }
      this.visit += 1
      const visit = this.visit
      this.section = input.section
      this.tenant = input.tenant
      this.loading = true
      this.failed = ''
      this.failedReason = ''
      this.positions = []
      this.positionsRead = false
      this.fields = null
      this.fieldsRead = false
      this.fieldsReading = false
      this.settings = {}
      this.settingsRead = false
      const [access, roles, types, vocabulary] = await Promise.allSettled([
        get<{ members: Member[] }>(this.tenantPath('access')),
        get<{ roles: Role[] }>(this.tenantPath('roles')),
        get<{ userTypes: UserType[] }>(this.tenantPath('user-types')),
        get<{ services: DeclaringService[] }>(this.path('config')),
      ])
      if (visit !== this.visit) return
      if (access.status === 'rejected' || roles.status === 'rejected' || types.status === 'rejected') {
        const why = [access, roles, types].find((r) => r.status === 'rejected') as PromiseRejectedResult
        const e = why.reason
        if (unanswered(e)) this.failed = 'unanswered'
        else if (e instanceof ApiError && e.status === 403) this.failed = 'notAdministrator'
        else {
          this.failed = 'other'
          // The refusal's title is words; the status line stands in for one when it had none.
          this.failedReason = e instanceof ApiError && !/^HTTP \d+$/.test(e.message) ? e.message : ''
        }
        this.loading = false

        return
      }
      this.members = access.value.members ?? []
      this.roles = roles.value.roles ?? []
      this.userTypes = types.value.userTypes ?? []
      this.services = vocabulary.status === 'fulfilled' ? (vocabulary.value.services ?? []) : []
      this.loaded = true
      this.loading = false
    },

    /** Start a visit and read everything a screen that names positions and fields needs. */
    async load(input: { section: string; tenant: string; fields?: () => Promise<FieldBox[]> }) {
      await this.open(input)
      if (!this.loaded || this.failed) return
      await Promise.all([this.ensurePositions(), this.ensureFields(input.fields)])
    },

    /** The chart's positions, once a visit; a chart that cannot be read leaves them empty. */
    async ensurePositions() {
      if (this.positionsRead) return
      this.positionsRead = true
      const visit = this.visit
      try {
        const chart = await get<{ positions: Position[] }>(this.tenantPath('chart/positions'))
        if (visit === this.visit) this.positions = chart.positions ?? []
      } catch {
        if (visit === this.visit) this.positions = []
      }
    },

    /** The boxes of the restricted fields, once a visit; null when the host could not read them. */
    async ensureFields(read?: () => Promise<FieldBox[]>) {
      if (this.fieldsRead) return
      this.fieldsRead = true
      this.fieldsReading = true
      const visit = this.visit
      try {
        const boxes = read ? await read() : []
        if (visit === this.visit) this.fields = boxes
      } catch {
        if (visit === this.visit) this.fields = null
      } finally {
        if (visit === this.visit) this.fieldsReading = false
      }
    },

    /** What each of the host's role settings holds now, once a visit. */
    async readSettings(list: RoleSetting[]) {
      if (this.settingsRead) return
      this.settingsRead = true
      const visit = this.visit
      await Promise.all(
        list.map(async (s) => {
          this.settings[s.key] = { state: 'reading', roleId: '' }
          try {
            const roleId = await s.read()
            if (visit === this.visit) this.settings[s.key] = { state: 'read', roleId }
          } catch {
            if (visit === this.visit) this.settings[s.key] = { state: 'unread', roleId: '' }
          }
        }),
      )
    },

    /** Read again only the lists an act changed. */
    async reread(which: List[]) {
      try {
        const [access, roles, types] = await Promise.all([
          which.includes('access') ? get<{ members: Member[] }>(this.tenantPath('access')) : undefined,
          which.includes('roles') ? get<{ roles: Role[] }>(this.tenantPath('roles')) : undefined,
          which.includes('user-types') ? get<{ userTypes: UserType[] }>(this.tenantPath('user-types')) : undefined,
        ])
        if (access) this.members = access.members ?? []
        if (roles) this.roles = roles.roles ?? []
        if (types) this.userTypes = types.userTypes ?? []
      } catch {
        // The act itself went through; what is shown is a moment old until the next read.
      }
    },

    /**
     * One act on the register. Answers whether it was accepted; either way the
     * words to show are in `said`. `reread` names the lists it changed.
     */
    async act(
      act: Act,
      call: () => Promise<unknown>,
      said: Said['key'],
      values: Said['values'],
      extra: { reread: List[]; about?: Record<string, string | number>; naming?: Named },
    ) {
      this.said = null
      try {
        await call()
      } catch (e) {
        this.said = this.refusal(act, e, { ...values, ...(extra.about ?? {}) }, extra.naming)

        return false
      }
      this.said = { kind: 'said', key: said, values }
      await this.reread(extra.reread)

      return true
    },

    /**
     * The words for a refused act. A Save's `naming` is the role or user type as it
     * would stand after the Save, to tell which other one its name collides with.
     */
    refusal(act: Act, e: unknown, values: Said['values'], naming?: Named): Said {
      const refused = (key: string, extra: Said['values'] = {}): Said => ({ kind: 'refused', key, values: { ...values, ...extra } })
      // A name is taken when another item is called the same, or already reads
      // that way in a language. Which one is worked out from the list already
      // read; when that cannot tell, the plain sentence stays.
      const taken = (list: Named[], plain: string, alike: string): Said => {
        if (!naming || calledAlike(list, naming)) return refused(plain)
        const found = readsAlike(list, naming, NAMED_LANGUAGES)

        return found ? { ...refused(alike, { other: found.other.name, reads: found.reads }), language: found.language } : refused(plain)
      }
      if (unanswered(e)) return refused('unanswered')
      if (!(e instanceof ApiError)) return refused('unreadable')
      // The register, or the coordinator before it, no longer counts this person
      // as an administrator of the workspace.
      if (e.status === 403) return refused('notAdministrator')
      if (e.status === 409) {
        switch (act) {
          case 'administrator':
          case 'takeAll':
            return refused('lastAdministrator')
          case 'saveRole':
            return taken(this.roles, 'roleNameTaken', 'roleReadsAlike')
          case 'deleteRole':
            return Number(values.n ?? 0) > 0 ? refused('roleHeld') : refused('rolePlaced')
          case 'saveUserType':
            return taken(this.userTypes, 'typeNameTaken', 'typeReadsAlike')
          case 'deleteUserType':
            if (values.workspaceDefault) return refused('typeIsDefault')
            if (values.corporateLogin) return refused('typeIsCorporate')
            if (Number(values.n ?? 0) > 0) return refused('typeHeld')

            return refused('typeInChart')
        }
      }
      if (e.status === 400 && (act === 'saveRole' || act === 'saveUserType')) return refused('setupBox')

      return refused('other', { reason: e.message })
    },

    setUserType(member: Member, type: UserType) {
      return this.act(
        'userType',
        () => put(this.tenantPath(`users/${segment(member.id)}/user-type`), { userTypeId: type.id }),
        'userType',
        { name: member.displayName, type: type.name },
        { reread: ['access'] },
      )
    },

    giveRole(member: Member, role: Role) {
      return this.act(
        'giveRole',
        () => post(this.path(`users/${segment(member.id)}/roles?tenant=${segment(this.tenant)}`), { roleId: role.id }),
        'roleGiven',
        { name: member.displayName, role: role.name },
        { reread: ['access'] },
      )
    },

    takeRole(member: Member, role: { id: string; name: string }) {
      return this.act(
        'takeRole',
        () => del(this.path(`users/${segment(member.id)}/roles?roleId=${segment(role.id)}&tenant=${segment(this.tenant)}`)),
        'roleTaken',
        { name: member.displayName, role: role.name },
        { reread: ['access'] },
      )
    },

    setAdministrator(member: Member, on: boolean) {
      const path = this.tenantPath(`administrators/${segment(member.id)}`)

      return this.act(
        'administrator',
        () => (on ? put(path) : del(path)),
        on ? 'administrator' : 'administratorOff',
        { name: member.displayName },
        { reread: ['access'] },
      )
    },

    takeAll(member: Member) {
      return this.act(
        'takeAll',
        () => del(this.path(`users/${segment(member.id)}?tenant=${segment(this.tenant)}`)),
        'takenAll',
        { name: member.displayName },
        { reread: ['access'] },
      )
    },

    /**
     * Save a role: its name and what it is for when either changed, then its whole
     * set of boxes when that changed. A new role is made first, with both, holding
     * nothing. Answers the role's id when it was saved, or an empty string. Only
     * the roles are read again, and the people too when the name changed, since
     * each person's roles carry it.
     */
    async saveRole(input: {
      id: string
      name: string
      was: string
      description: string
      wasDescription: string
      permissions: string[]
      changed: boolean
    }): Promise<string> {
      let id = input.id
      // A Save sends no names in other languages, so a role keeps its own.
      const kept = this.roles.find((r) => r.id === input.id)?.labels
      const renamed = input.id !== '' && input.name !== input.was
      const ok = await this.act(
        'saveRole',
        async () => {
          const words = { name: input.name, description: input.description }
          if (!id) {
            const made = await post<{ id: string }>(this.tenantPath('roles'), words)
            id = made.id
          } else if (input.name !== input.was || input.description !== input.wasDescription) {
            await put(this.tenantPath(`roles/${segment(id)}`), words)
          }
          if (input.changed) await put(this.tenantPath(`roles/${segment(id)}/permissions`), { permissions: input.permissions })
        },
        'roleSaved',
        { name: input.name },
        { reread: renamed ? ['roles', 'access'] : ['roles'], naming: { id: input.id, name: input.name, labels: kept } },
      )

      return ok ? id : ''
    },

    /**
     * Delete a role. `holds` is the host's sentence for a setting that holds the
     * role: the register counts that as a place the role is kept, and refuses, so
     * the refusal is said in the setting's words. A refusal nobody holds the role for
     * may be a role the workspace came with: the roles are read again, and one that
     * now carries its `seed` is said to be shipped, which no setting can change.
     */
    async deleteRole(role: Role, holds?: string) {
      const held = this.members.filter((m) => m.status !== 'revoked' && m.tenantRoles.some((r) => r.id === role.id)).length
      const ok = await this.act('deleteRole', () => del(this.tenantPath(`roles/${segment(role.id)}`)), 'roleDeleted', { role: role.name }, {
        reread: ['roles'],
        about: { n: held },
      })
      if (!ok && this.said?.key === 'rolePlaced') {
        await this.reread(['roles'])
        if (this.roles.find((r) => r.id === role.id)?.seed) {
          this.said = { kind: 'refused', key: 'roleShipped', values: { role: role.name } }

          return ok
        }
      }
      if (!ok && holds && this.said?.key === 'rolePlaced') this.said = { ...this.said, hostKey: holds }

      return ok
    },

    /**
     * Save a user type: made, or changed. Answers its id when it was saved, or an
     * empty string. Only the user types are read again, and the people too when
     * the name changed, since each person carries it.
     */
    async saveUserType(input: { id: string; name: string; was: string; description: string; permissions: string[] }): Promise<string> {
      const body = { name: input.name, description: input.description, permissions: input.permissions }
      // A Save sends no names in other languages, so a user type keeps its own.
      const kept = this.userTypes.find((u) => u.id === input.id)?.labels
      let id = input.id
      const renamed = input.id !== '' && input.name !== input.was
      const ok = await this.act(
        'saveUserType',
        async () => {
          if (id) await put(this.tenantPath(`user-types/${segment(id)}`), body)
          else id = (await post<{ id?: string }>(this.tenantPath('user-types'), body))?.id ?? ''
        },
        'typeSaved',
        { name: input.name },
        { reread: renamed ? ['user-types', 'access'] : ['user-types'], naming: { id: input.id, name: input.name, labels: kept } },
      )
      if (!ok) return ''

      return id || (this.userTypes.find((u) => u.name === input.name)?.id ?? '')
    },

    /**
     * Delete a user type. How many hold it is counted from the people already
     * read: persons whose access is not revoked and whose own user type it is.
     */
    deleteUserType(type: UserType) {
      const held = this.members.filter((m) => m.kind === 'person' && m.status !== 'revoked' && m.userType?.id === type.id).length

      return this.act('deleteUserType', () => del(this.tenantPath(`user-types/${segment(type.id)}`)), 'typeDeleted', { type: type.name }, {
        reread: ['user-types'],
        about: {
          n: held,
          workspaceDefault: type.workspaceDefault ? 1 : 0,
          corporateLogin: type.corporateLoginDefault ? 1 : 0,
        },
      })
    },

    setCorporateLogin(typeId: string) {
      return this.act(
        'corporateLogin',
        () => put(this.tenantPath('corporate-login-default'), { userTypeId: typeId }),
        'corporateLogin',
        {},
        { reread: ['user-types'] },
      )
    },
  },
})
