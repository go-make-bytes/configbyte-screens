// The streams the History screen reads: the membership register's, and each the
// host names. Each is read a page at a time, newest first, through the
// coordinator, and keeps its own place: the next page asks for the lines older
// than the last one it read.
import { defineStore } from 'pinia'

import { ApiError, get, relay } from '../lib/api'
import type { Stream } from '../lib/history'
import type { HistoryLine, HistorySource } from '../options'

/** The shared filter the membership register's lines sit under. */
export const REGISTER_FILTER = 'configbyte-people'

/** A page as an owner answers it: the register says `events`, the others `items`. */
interface Page {
  events?: (HistoryLine & { userId?: string })[]
  items?: HistoryLine[]
  more?: boolean
}

function unanswered(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 502 || e.status === 503 || e.status === 504

  return e instanceof TypeError
}

async function readPage(stream: Stream) {
  const last = stream.lines[stream.lines.length - 1]
  const query = [stream.query, last ? `before=${encodeURIComponent(last.id)}` : ''].filter(Boolean).join('&')
  try {
    const page = await get<Page>(relay(stream.section, `history${query ? `?${query}` : ''}`))
    const lines = (page.events ?? page.items ?? []).map((l) => ({ ...l, section: stream.section }))
    stream.lines.push(...lines)
    stream.more = page.more === true
    stream.failed = ''
  } catch (e) {
    stream.more = false
    stream.failed = unanswered(e) ? 'unanswered' : e instanceof ApiError ? e.code || e.message : String(e)
  }
}

export const useHistory = defineStore('configbyte-history', {
  state: () => ({
    streams: [] as Stream[],
    loading: false,
  }),
  actions: {
    /** Open the screen: the first page of every stream. */
    async start(input: { register?: string; sources: HistorySource[] }) {
      const streams: Stream[] = []
      if (input.register) {
        streams.push({ key: 'register', section: input.register, query: '', filter: REGISTER_FILTER, chip: '', lines: [], more: false, failed: '' })
      }
      input.sources.forEach((s, i) => {
        streams.push({ key: `source-${i}`, section: s.section, query: s.query ?? '', filter: s.filter, chip: s.chip, lines: [], more: false, failed: '' })
      })
      this.streams = streams
      this.loading = true
      await Promise.all(this.streams.map((s) => readPage(s)))
      this.loading = false
    },

    /** The next page of every shown stream that has older lines. */
    async older(shown: (s: Stream) => boolean) {
      this.loading = true
      await Promise.all(this.streams.filter((s) => s.more && shown(s)).map((s) => readPage(s)))
      this.loading = false
    },
  },
})
