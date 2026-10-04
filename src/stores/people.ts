// The workspace's people and what each holds, as the membership register keeps
// them, read and changed through the coordinator on the administrator's own
// authority. The register judges every act; the screen only says, in plain
// words, what it did or why it was refused.
//
// A refusal is worded by the act that was made and the status that came back,
// never by the register's own text: the same status can mean several things,
// and only the act knows which one the person needs to hear.
import { defineStore } from 'pinia'

import { ApiError, del, get, post, put, relay, segment } from '../lib/api'
import type { DeclaringService } from '../lib/boxes'
import type { FieldBox } from '../options'

/** A person or a machine that is a member of the workspace. */
export interface Member {
  id: string
  subjectKey: string
  displayName: string
  kind: 'person' | 'service'
  status: 'invited' | 'active' | 'revoked'
  administrator: boolean
  arrival: boolean
  tenantRoles: { id: string; name: string }[]
  userType: { id: string; name: string } | null
  /** The user type the person's position in the chart gives, which is then the one in force. */
  chartUserType: { id: string; name: string } | null
  /** The day the register last gave the member access, `YYYY-MM-DD`. */
  lastSignedInOn: string | null
}

/** One of the workspace's own roles, with every box it holds. */
export interface Role {
  id: string
  seed?: string
  name: string
  description: string
  permissions: string[]
}

/** A user type: the one thing every person holds. */
export interface UserType {
  id: string
  name: string
  description: string
  permissions: string[]
  members: number
  corporateLoginDefault: boolean
  workspaceDefault: boolean
}

/** A position in the chart of authority, for naming it in a history line. */
export interface Position {
  id: string
  name: string
}

/** Words to show after an act: a key below `configbyte.people.said` or `.refused`, and what it names. */
export interface Said {
  kind: 'said' | 'refused'
  key: string
  values: Record<string, string | number>
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
    /** The restricted fields' boxes; null when they could not be read. */
    fields: null as FieldBox[] | null,
    loading: false,
    loaded: false,
    /** Why the register could not be read: its code or the reason given. Empty means it was. */
    failed: '',
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
  },
  actions: {
    path(rest: string): string {
      return relay(this.section, rest)
    },

    tenantPath(rest: string): string {
      return this.path(`tenants/${segment(this.tenant)}/${rest}`)
    },

    /**
     * Read everything the screens show. The people, roles and user types are
     * needed; the vocabulary, the chart and the restricted fields only make the
     * boxes and the history read better, so a failure there leaves them empty.
     */
    async load(input: { section: string; tenant: string; fields?: () => Promise<FieldBox[]> }) {
      this.section = input.section
      this.tenant = input.tenant
      this.loading = true
      this.failed = ''
      try {
        const [access, roles, types] = await Promise.all([
          get<{ members: Member[] }>(this.tenantPath('access')),
          get<{ roles: Role[] }>(this.tenantPath('roles')),
          get<{ userTypes: UserType[] }>(this.tenantPath('user-types')),
        ])
        this.members = access.members ?? []
        this.roles = roles.roles ?? []
        this.userTypes = types.userTypes ?? []
        this.loaded = true
      } catch (e) {
        this.failed = e instanceof ApiError ? e.code || e.message : String(e)
        this.loading = false

        return
      }
      const [vocabulary, chart, fields] = await Promise.allSettled([
        get<{ services: DeclaringService[] }>(this.path('config')),
        get<{ positions: Position[] }>(this.tenantPath('chart/positions')),
        input.fields ? input.fields() : Promise.resolve([] as FieldBox[]),
      ])
      this.services = vocabulary.status === 'fulfilled' ? (vocabulary.value.services ?? []) : []
      this.positions = chart.status === 'fulfilled' ? (chart.value.positions ?? []) : []
      this.fields = fields.status === 'fulfilled' ? fields.value : null
      this.loading = false
    },

    /** Read the people, roles and user types again after an act. */
    async refresh() {
      try {
        const [access, roles, types] = await Promise.all([
          get<{ members: Member[] }>(this.tenantPath('access')),
          get<{ roles: Role[] }>(this.tenantPath('roles')),
          get<{ userTypes: UserType[] }>(this.tenantPath('user-types')),
        ])
        this.members = access.members ?? []
        this.roles = roles.roles ?? []
        this.userTypes = types.userTypes ?? []
      } catch {
        // The act itself went through; what is shown is a moment old until the next read.
      }
    },

    /**
     * One act on the register. Answers whether it was accepted; either way the
     * words to show are in `said`.
     */
    async act(act: Act, call: () => Promise<unknown>, said: Said['key'], values: Said['values'], about?: Record<string, string | number>) {
      this.said = null
      try {
        await call()
      } catch (e) {
        this.said = this.refusal(act, e, { ...values, ...(about ?? {}) })

        return false
      }
      this.said = { kind: 'said', key: said, values }
      await this.refresh()

      return true
    },

    /** The words for a refused act. */
    refusal(act: Act, e: unknown, values: Said['values']): Said {
      const refused = (key: string, extra: Said['values'] = {}): Said => ({ kind: 'refused', key, values: { ...values, ...extra } })
      if (unanswered(e)) return refused('unanswered')
      if (!(e instanceof ApiError)) return refused('other', { reason: String(e) })
      // The register, or the coordinator before it, no longer counts this person
      // as an administrator of the workspace.
      if (e.status === 403) return refused('notAdministrator')
      if (e.status === 409) {
        switch (act) {
          case 'administrator':
          case 'takeAll':
            return refused('lastAdministrator')
          case 'saveRole':
            return refused('roleNameTaken')
          case 'deleteRole':
            return Number(values.n ?? 0) > 0 ? refused('roleHeld') : refused('rolePlaced')
          case 'saveUserType':
            return refused('typeNameTaken')
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
      )
    },

    giveRole(member: Member, role: Role) {
      return this.act(
        'giveRole',
        () => post(this.path(`users/${segment(member.id)}/roles?tenant=${segment(this.tenant)}`), { roleId: role.id }),
        'roleGiven',
        { name: member.displayName, role: role.name },
      )
    },

    takeRole(member: Member, role: { id: string; name: string }) {
      return this.act(
        'takeRole',
        () => del(this.path(`users/${segment(member.id)}/roles?roleId=${segment(role.id)}&tenant=${segment(this.tenant)}`)),
        'roleTaken',
        { name: member.displayName, role: role.name },
      )
    },

    setAdministrator(member: Member, on: boolean) {
      const path = this.tenantPath(`administrators/${segment(member.id)}`)

      return this.act('administrator', () => (on ? put(path) : del(path)), on ? 'administrator' : 'administratorOff', {
        name: member.displayName,
      })
    },

    takeAll(member: Member) {
      return this.act(
        'takeAll',
        () => del(this.path(`users/${segment(member.id)}?tenant=${segment(this.tenant)}`)),
        'takenAll',
        { name: member.displayName },
      )
    },

    /**
     * Save a role: its name when it changed, then its whole set of boxes when that
     * changed. A new role is made first, holding nothing. Answers the role's id
     * when it was saved, or an empty string.
     */
    async saveRole(input: { id: string; name: string; was: string; permissions: string[]; changed: boolean }): Promise<string> {
      let id = input.id
      const ok = await this.act(
        'saveRole',
        async () => {
          if (!id) {
            const made = await post<{ id: string }>(this.tenantPath('roles'), { name: input.name })
            id = made.id
          } else if (input.name !== input.was) {
            await put(this.tenantPath(`roles/${segment(id)}`), { name: input.name })
          }
          if (input.changed) await put(this.tenantPath(`roles/${segment(id)}/permissions`), { permissions: input.permissions })
        },
        'roleSaved',
        { name: input.name },
      )

      return ok ? id : ''
    },

    deleteRole(role: Role) {
      const held = this.members.filter((m) => m.status !== 'revoked' && m.tenantRoles.some((r) => r.id === role.id)).length

      return this.act('deleteRole', () => del(this.tenantPath(`roles/${segment(role.id)}`)), 'roleDeleted', { role: role.name }, { n: held })
    },

    saveUserType(input: { id: string; name: string; description: string; permissions: string[] }) {
      const body = { name: input.name, description: input.description, permissions: input.permissions }

      return this.act(
        'saveUserType',
        () => (input.id ? put(this.tenantPath(`user-types/${segment(input.id)}`), body) : post(this.tenantPath('user-types'), body)),
        'typeSaved',
        { name: input.name },
      )
    },

    deleteUserType(type: UserType) {
      return this.act(
        'deleteUserType',
        () => del(this.tenantPath(`user-types/${segment(type.id)}`)),
        'typeDeleted',
        { type: type.name },
        {
          n: type.members,
          workspaceDefault: type.workspaceDefault ? 1 : 0,
          corporateLogin: type.corporateLoginDefault ? 1 : 0,
        },
      )
    },

    setCorporateLogin(typeId: string) {
      return this.act(
        'corporateLogin',
        () => put(this.tenantPath('corporate-login-default'), { userTypeId: typeId }),
        'corporateLogin',
        {},
      )
    },
  },
})
