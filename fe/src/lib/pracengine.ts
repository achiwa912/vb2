import type { components } from '@/types/api'

type PracticeSchema = components['schemas']['PracticeSchema']
type WordSchema = components['schemas']['WordSchema']
type PracDir = components['schemas']['PracDir']

export interface PracStoreLike {
  pracs: PracticeSchema[]
  words: WordSchema[]
  wordsNoPrac: number[]
  pracDir: PracDir | null
  lastSyncTime: Date | null
  userId: number | null
  createWordsNoPrac(): void
  syncServer(): Promise<void>
  isNextDayOrLater(date: Date | null, now?: Date): boolean
}

export interface PracEngineOptions {
  lwsize?: number
  wwsize?: number
  random?: () => number
  now?: () => Date
}

export class PracEngine {
  lw: number[]
  ww: number[]
  pracIdx: number | null
  infoTried: number
  infoMem: number

  private store: PracStoreLike
  private lwsize: number
  private wwsize: number
  private random: () => number
  private now: () => Date

  constructor(store: PracStoreLike, options: PracEngineOptions = {}) {
    this.store = store
    this.lwsize = options.lwsize ?? 5
    this.wwsize = options.wwsize ?? 5
    this.random = options.random ?? Math.random
    this.now = options.now ?? (() => new Date())

    this.lw = []
    this.ww = []
    this.pracIdx = null
    this.infoTried = 0
    this.infoMem = 0
  }

  resetWindows() {
    this.lw = []
    this.ww = []
    this.pracIdx = null
  }

  moveToWins(pracs: number[]): boolean {
    const ps = [...pracs]
    for (let i = ps.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i+1));
      [ps[i], ps[j]] = [ps[j]!, ps[i]!]
    }

    while (ps.length && this.lw.length < this.lwsize) {
      const pix = ps.pop()! // TS non-null (undefined) assertion operator
      if (!['review', 'waiting'].includes(this.store.pracs[pix]!.status)) {
	this.store.pracs[pix]!.status = 'learning'
      }
      this.lw.push(pix)
    }

    while (ps.length && this.ww.length < this.wwsize) {
      const pix = ps.pop()!
      this.ww.push(pix)
    }

    // if both lw & ww are fully populated
    return this.lw.length >= this.lwsize && this.ww.length >= this.wwsize
  }
  
  statusMove(status: string): boolean {
    const ps: number[] = []
    const currentWindows = [...this.lw, ...this.ww]

    for (const [ix, p] of this.store.pracs.entries()) {
      if (
	p.direction === this.store.pracDir &&
	  p.status === status &&
	  !currentWindows.includes(ix)
      ) {
	ps.push(ix)
      }
    }
    return this.moveToWins(ps)
  }

  fillWins() {
    this.store.createWordsNoPrac()

    while (this.lw.length > this.lwsize) {
      const p = this.lw.pop()!
      this.ww.unshift(p)
    }
    while (this.ww.length > this.wwsize) {
      this.ww.pop()
    }

    // due pracs
    const currentWindows = [...this.lw, ...this.ww]
    const due: number[] = []
    for (const [ix, p] of this.store.pracs.entries()) {
      if (
	p.direction === this.store.pracDir &&
	  p.status === 'review' &&
	  p.due_counter === 0 &&
	  !currentWindows.includes(ix)
      ) {
	due.unshift(ix)
      }
    }
    if (this.moveToWins(due)) return

    // move from ww to lw
    while (this.ww.length && this.lw.length < this.lwsize) {
      const pix = this.ww.shift()!
      if (!['review', 'waiting'].includes(this.store.pracs[pix]!.status)) {
	this.store.pracs[pix]!.status = 'learning'
      }
      this.lw.push(pix)
      this.store.createWordsNoPrac()  // why here?
    }

    if (this.statusMove('learning')) return
    if (this.statusMove('waiting')) return
    if (this.statusMove('new')) return

    // words w/o practices
    const wnp = [...this.store.wordsNoPrac]
    for (const wix of this.store.wordsNoPrac) {
      const p: PracticeSchema = {
	direction: this.store.pracDir!,
	due_counter: null,
	due_dates: null,
	id: null,
	last_edited: this.now().toISOString(),
	last_practiced: null,
	status: 'new',
	user_id: this.store.userId ?? 0,
	word_id: this.store.words[wix]!.id,
      }

      const idx = wnp.indexOf(wix)
      if (idx !== -1) wnp.splice(idx, 1)

      this.store.pracs.push(p)
      const pix = this.store.pracs.length - 1

      if (this.lw.length < this.lwsize) {
	this.store.pracs[pix]!.status = 'learning'
	this.lw.push(pix)
      } else if (this.ww.length < this.wwsize) {
	this.ww.push(pix)
      }

      if (this.lw.length === this.lwsize && this.ww.length === this.wwsize) {
	break
      }
    }
    this.store.wordsNoPrac = [...wnp]
  }

  async doPrac() {
    // if the session is very long
    if (this.store.isNextDayOrLater(this.store.lastSyncTime, this.now())) {
      this.resetWindows()
      await this.store.syncServer()
    }

    this.fillWins()
    if (this.lw.length === 0) { // no more prac
      this.pracIdx = null
      return
    }

    this.pracIdx = this.lw[0]!
  }

  async onceMore() {
    this.infoTried++
    const idx = this.lw.shift() ?? null
    if (idx === null) return
    this.pracIdx = idx
    this.lw.push(idx)
    this.store.pracs[idx]!.status = 'learning'
    this.store.pracs[idx]!.last_edited = this.now().toISOString()
    this.store.pracs[idx]!.last_practiced = this.now().toISOString()
    await this.doPrac()
  }

  async memorized() {
    this.infoTried++
    this.infoMem++
    const idx = this.pracIdx
    if (idx === null) return

    if (this.store.pracs[idx]!.status === 'review') {
      this.store.pracs[idx]!.due_dates = (this.store.pracs[idx]!.due_dates ?? 1) * 2
      this.store.pracs[idx]!.due_counter = this.store.pracs[idx]!.due_dates
    } else {
      this.store.pracs[idx]!.status = 'review'
      this.store.pracs[idx]!.due_dates = 1
      this.store.pracs[idx]!.due_counter = 1
    }

    this.lw.shift()
    this.store.pracs[idx]!.last_edited = this.now().toISOString()
    this.store.pracs[idx]!.last_practiced = this.now().toISOString()
    await this.doPrac()
  }

  async okay() {
    this.infoTried++
    this.infoMem++
    const idx = this.pracIdx
    if (idx === null) return

    const prac = this.store.pracs[idx]!
    if (prac.status === 'review') {
      prac.due_dates = (prac.due_dates ?? 1) * 2
      prac.due_counter = prac.due_dates
      this.lw.shift()
    } else if (prac.status === 'waiting') {
      prac.status = 'review'
      prac.due_dates = 1
      prac.due_counter = 1
      this.lw.shift()

      const pix = this.ww.shift()
      if (pix !== undefined) {
	if (this.store.pracs[pix]!.status === 'new') {
	  this.store.pracs[pix]!.status = 'learning'
	}
	this.lw.push(pix)
      }
    } else { // 'learning' or 'new'
      prac.status = 'waiting'
      this.ww.push(this.lw.shift()!)
      const pix = this.ww.shift()!
      if (this.store.pracs[pix]!.status === 'new') {
	this.store.pracs[pix]!.status = 'learning'
      }
      this.lw.push(pix)
     }

    prac.last_edited = this.now().toISOString()
    prac.last_practiced = this.now().toISOString()
    await this.doPrac()
  }

  getInfoDue(): number {
    return (
      this.store.pracs.filter(
	(p) => 
	  p.direction === this.store.pracDir &&
	    p.status === 'review' &&
	    p.due_counter === 0
      ).length
    )
  }

  getInfoRemain(): number {
    return (
      this.store.wordsNoPrac.length +
	this.getInfoDue() +
	this.store.pracs.filter(
	  (p) => p.direction === this.store.pracDir && p.status !== 'review'
	).length
    )
  }

  getInfoWithin3(): number {
    return (
      this.store.pracs.filter(
	(p) =>
	  p.direction === this.store.pracDir &&
	    p.status === 'review' &&
	    p.due_counter !== null &&
	    p.due_counter <= 3 &&
	    p.due_counter !== 0
      ).length
    )
  }
  
}
