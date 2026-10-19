// The streams the History screen reads: the membership register's, and each the
// host names. Each is read a page at a time, newest first, through the
// coordinator, and keeps its own place: the next page asks for the lines older
// than the last one it read. A stream is read only when the screen asks for it,
// and can be restarted for one person's lines.
import { defineStore } from 'pinia'

import { ApiError, get, relay } from '../lib/api'
import { newStream, type Stream } from '../lib/history'
import type { HistoryLine, HistorySource } from '../options'

/** The area the membership register's lines sit under. */
export const REGISTER_FILTER = 'people'

/** A page as an owner answers it: the register says `events`, the others `items`. */
interface Page {
  events?: HistoryLine[]
  items?: HistoryLine[]
  more?: boolean
}

function unanswered(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 502 || e.status === 503 || e.status === 504

  return e instanceof TypeError
}

async function readPage(stream: Stream, actor: string) {
  const last = stream.lines[stream.lines.length - 1]
  const query = [stream.query, actor ? `actor=${encodeURIComponent(actor)}` : '', last ? `before=${encodeURIComponent(last.id)}` : '']
    .filter(Boolean)
    .join('&')
  const epoch = stream.epoch
  try {
    const page = await get<Page>(relay(stream.section, `history${query ? `?${query}` : ''}`))
    // A restart while this was out: its page is of the person asked for before.
    if (stream.epoch !== epoch) return
    const lines = (page.events ?? page.items ?? []).map((l) => ({ ...l, section: stream.section }))
    stream.lines.push(...lines)
    stream.more = page.more === true
    stream.failed = ''
    stream.reason = ''
    stream.status = 0
  } catch (e) {
    if (stream.epoch !== epoch) return
    stream.more = false
    if (unanswered(e)) {
      stream.failed = 'unanswered'
      stream.reason = ''
      stream.status = 0
    } else {
      stream.failed = 'refused'
      // The refusal's words, never its code; a refusal without words has only its status, and
      // anything that is not a refusal (an answer that was not one) has neither, so it is said as a failure.
      stream.reason = e instanceof ApiError ? (/^HTTP \d+$/.test(e.message) ? '' : e.message) : ''
      stream.status = e instanceof ApiError ? e.status : 0
    }
  }
}

export const useHistory = defineStore('configbyte-history', {
  state: () => ({
    streams: [] as Stream[],
    /** The member key whose lines are asked for, or `operator`; empty asks for everyone's. */
    actor: '',
    loading: false,
  }),
  actions: {
    /** Set the streams up, none read yet. */
    open(input: { register?: string; sources: HistorySource[]; actor: string }) {
      const streams: Stream[] = []
      if (input.register) streams.push(newStream({ key: 'register', section: input.register, query: '', filter: REGISTER_FILTER }))
      input.sources.forEach((s, i) => {
        streams.push(newStream({ key: `source-${i}`, section: s.section, query: s.query ?? '', filter: s.filter }))
      })
      this.streams = streams
      this.actor = input.actor
    },

    /** Read the first page of every wanted stream not read yet. */
    async ensure(wanted: (s: Stream) => boolean) {
      const todo = this.streams.filter((s) => wanted(s) && !s.started)
      if (!todo.length) return
      todo.forEach((s) => {
        s.started = true
      })
      this.loading = true
      try {
        await Promise.all(todo.map((s) => readPage(s, this.actor)))
      } finally {
        this.loading = false
      }
    },

    /** Forget what was read and ask every stream for another person's lines. */
    restart(actor: string) {
      this.actor = actor
      for (const s of this.streams) {
        s.epoch += 1
        s.lines = []
        s.more = false
        s.started = false
        s.failed = ''
        s.reason = ''
        s.status = 0
      }
    },

    /** The next page of every shown stream that has older lines. */
    async older(shown: (s: Stream) => boolean) {
      this.loading = true
      try {
        await Promise.all(this.streams.filter((s) => s.more && shown(s)).map((s) => readPage(s, this.actor)))
      } finally {
        this.loading = false
      }
    },
  },
})
