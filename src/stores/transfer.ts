// The configuration carried out as one file, and back in.
//
// Kept in a store rather than in the screen so the file a person chose and the
// answer they are reading outlive anything the host re-reads after an Apply. They
// do not outlive leaving the screen: the screen clears them on the way out.
//
// An Apply names the versions its own preview answered, which is the whole point
// of it: what lands is exactly the document the person reviewed, or nothing.
// Those versions live here and nowhere else — not in the address, not in the
// browser's storage, and never on screen.
import { defineStore } from 'pinia'

import { API_ROOT, ApiError, postText, read, refusalOf } from '../lib/api'
import { aboutDocument, canApply, downloadName, expectFrom, withExpect, type ImportAnswer } from '../lib/transfer'

const EXPORT = `${API_ROOT}/config/export`
const IMPORT = `${API_ROOT}/config/import`

/**
 * Why a document was stopped before any answer about it: it is not a
 * configuration document (`bad`), the configuration moved after its preview or
 * an Apply named no versions (`moved` — both mean "preview again"), or anything
 * else, with the coordinator's words (`other`).
 */
export interface Stop {
  kind: 'bad' | 'moved' | 'other'
  during: 'preview' | 'apply'
  reason: string
}

/** A file handed to the browser to save. Its own function so a test can watch it. */
export function offerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export const useTransfer = defineStore('configbyte-transfer', {
  state: () => ({
    exporting: false,
    /** What the last export handed over: its name, its size, how many sections. */
    exported: null as { name: string; bytes: number; sections: number } | null,
    exportFailed: '',

    /** The chosen file, held so a preview can be asked again without choosing it again. */
    fileName: '',
    fileBytes: 0,
    fileText: '',
    /** Why a drop was not taken, as the file drop reported it. */
    rejected: '' as '' | 'type' | 'count',

    working: '' as '' | 'previewing' | 'applying',
    /** The last dry run's answer — the document as the person is reading it. */
    preview: null as ImportAnswer | null,
    /** The Apply's answer, once there is one. */
    answer: null as ImportAnswer | null,
    stop: null as Stop | null,
  }),
  getters: {
    /** Whether the person can apply what they are reading. */
    applicable: (state): boolean =>
      state.working === '' && state.answer === null && state.stop === null && state.preview !== null && canApply(state.preview),
    /** What the chosen file says about itself — informative, never a check. */
    about: (state) => aboutDocument(state.fileText),
  },
  actions: {
    /** The whole configuration, downloaded under the name the coordinator gives it. */
    async exportNow() {
      this.exporting = true
      this.exportFailed = ''
      try {
        const resp = await read(EXPORT)
        if (!resp.ok) throw await refusalOf(resp)
        const blob = await resp.blob()
        const name = downloadName(resp.headers.get('Content-Disposition') ?? '', 'configuration.json')
        offerDownload(blob, name)
        this.exported = { name, bytes: blob.size, sections: aboutDocument(await blob.text()).sections }
      } catch (e) {
        this.exportFailed = e instanceof Error ? e.message : String(e)
      } finally {
        this.exporting = false
      }
    },

    /** A file was chosen or dropped: hold it, and ask what it would do. */
    async choose(file: File) {
      this.clearImport()
      this.fileName = file.name
      this.fileBytes = file.size
      this.fileText = await file.text()
      await this.previewNow()
    },

    /** A drop the file drop did not take. Nothing is held and nothing is asked. */
    refuseDrop(reason: 'type' | 'count') {
      this.rejected = reason
    },

    /**
     * Ask what the held file would do, writing nothing. Also the one way on after
     * every Apply that did not land whole: the new answer replaces the old, and an
     * Apply after it carries the new versions.
     */
    async previewNow() {
      if (!this.fileText) return
      this.working = 'previewing'
      this.stop = null
      this.answer = null
      this.rejected = ''
      try {
        this.preview = await postText<ImportAnswer>(`${IMPORT}?dryRun=true`, this.fileText)
      } catch (e) {
        this.preview = null
        this.stop = stopOf(e, 'preview')
      } finally {
        this.working = ''
      }
    },

    /**
     * Apply exactly what the preview showed — the file, with the preview's
     * versions. `applied` is told when anything may now be in force, so the host
     * re-reads what it shows.
     */
    async apply(applied?: () => void) {
      if (!this.applicable || this.preview === null) return
      this.working = 'applying'
      try {
        const answer = await postText<ImportAnswer>(IMPORT, withExpect(this.fileText, expectFrom(this.preview)))
        this.answer = answer
        if (answer.outcome === 'applied' || answer.outcome === 'partial' || answer.outcome === 'rolledBack') {
          applied?.()
        }
      } catch (e) {
        this.stop = stopOf(e, 'apply')
      } finally {
        this.working = ''
      }
    },

    /** Drop the chosen file and everything said about it. */
    clearImport() {
      this.fileName = ''
      this.fileBytes = 0
      this.fileText = ''
      this.rejected = ''
      this.working = ''
      this.preview = null
      this.answer = null
      this.stop = null
    },
  },
})

function stopOf(e: unknown, during: Stop['during']): Stop {
  if (e instanceof ApiError) {
    if (e.status === 422) return { kind: 'bad', during, reason: e.message }
    if (e.status === 412 || e.status === 428) return { kind: 'moved', during, reason: e.message }

    return { kind: 'other', during, reason: e.code ? `${e.code} — ${e.message}` : e.message }
  }

  return { kind: 'other', during, reason: e instanceof Error ? e.message : String(e) }
}
