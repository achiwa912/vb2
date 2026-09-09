import { describe, it, expect, vi } from 'vitest'
import { PracEngine, type PracStoreLike } from './pracengine'
import type { components } from '@/types/api'

type PracticeSchema = components['schemas']['PracticeSchema']

function makePractice(overrides: Partial<PracticeSchema> = {}): PracticeSchema {
  return {
    direction: 'wd',
    due_counter: null,
    due_dates: null,
    id: null,
    last_edited: new Date().toISOString(),
    last_practiced: null,
    status: 'new',
    user_id: 1,
    word_id: 0,
    ...overrides,
  }
}

function makeStore(overrides: Partial<PracStoreLike> = {}): PracStoreLike {
  return {
    pracs: [],
    words: [],
    wordsNoPrac: [],
    pracDir: 'wd',
    lastSyncTime: null,
    userId: 1,
    createWordsNoPrac: vi.fn(),
    syncServer: vi.fn(async () => {}),
    isNextDayOrLater: vi.fn(() => false),
    ...overrides,
  }
}

// ====== tests from here ==================================

describe('PracEngine', () => {
  it('only one item in LW should set isFlipped as false', async () => {
    const store = makeStore({
      pracs: [makePractice({ status: 'new' }),],
      wordsNoPrac: [],
    })

    const engine = new PracEngine(store, {
      lwsize: 5,
      wwsize: 5,
      random: () => 0.2,
    })
    await engine.doPrac()
    engine.isFlipped = true
    await engine.onceMore()  // 'learning'
    expect(engine.isFlipped).toBe(false)
    engine.isFlipped = true
    await engine.okay() // 'learning' -> 'waiting'
    expect(engine.isFlipped).toBe(false)
  })
  
  it('moves due items into LW first', async () => {

    const store = makeStore({
      pracs: [
	makePractice({ status: "review", due_counter: 0 }),
	makePractice({ status: 'new' }),
	makePractice({ status: 'new' }),
      ],
      wordsNoPrac: [],
    })

    const engine = new PracEngine(store, {
      lwsize: 2,
      wwsize: 1,
      random: () => 0,
    })

    await engine.doPrac()

    expect(engine.lw).toHaveLength(2)
    expect(engine.ww).toHaveLength(1)
    expect(store.pracs[engine.lw[0]!]!.status).toBe('review')
    expect(engine.pracIdx).toBe(engine.lw[0])
  })

  it('marks a new card as waiting on okay', async () => {
    const store = makeStore({
      pracs: [
	makePractice({ status: 'new', word_id: 0 }),
	makePractice({ status: 'new', word_id: 1 }),
	makePractice({ status: 'new', word_id: 2 }),
      ],
      wordsNoPrac: [],
    })

    const engine = new PracEngine(store, {
      lwsize: 2,
      wwsize: 1,
      random: () => 0,
    })

    await engine.doPrac()
    const firstIdx = engine.pracIdx!
    await engine.okay()
    
    expect(store.pracs[firstIdx]!.status).toBe('waiting')
    expect(engine.ww).toContain(firstIdx)
    expect(engine.ww).toHaveLength(1)
  })

  it('doubles due counter on memorized for review cards', async () => {
    const store = makeStore({
      pracs: [
	makePractice({ status: 'review', due_counter: 0, due_dates: 1 }),
	makePractice({ status: 'new' })
      ],
      wordsNoPrac: [],
    })

    const engine = new PracEngine(store, {
      lwsize: 2,
      wwsize: 1,
      random: () => 0,
    })

    await engine.doPrac()
    const idx = engine.pracIdx!
    await engine.memorized()

    expect(store.pracs[idx]!.due_dates).toBe(2)
    expect(store.pracs[idx]!.due_counter).toBe(2)
  })

  it('okay for "waiting" and "review"', async () => {
    const store = makeStore({
      pracs: [
	makePractice({ status: 'review', due_counter: 0, due_dates: 2 }), // 1st
	makePractice({ status: 'learning' }),  // 2nd
	makePractice({ status: 'waiting' }),  // 3rd
      ],
      wordsNoPrac: [],
    })

    const engine = new PracEngine(store, {
      lwsize: 2,
      wwsize: 1,
      random: () => 0.5,
    })
    
    await engine.doPrac()
    
    const idx0 = engine.pracIdx!
    await engine.okay()
    expect(store.pracs[idx0]!.status).toBe('review')
    expect(store.pracs[idx0]!.due_dates).toBe(4)
    
    const idx1 = engine.pracIdx!
    await engine.okay()
    expect(store.pracs[idx1]!.status).toBe('waiting')

    const idx2 = engine.pracIdx!
    await engine.okay()
    expect(store.pracs[idx2]!.status).toBe('review')
    expect(store.pracs[idx2]!.due_counter).toBe(1)
  })

  it ('"new" item gets promoted to "learning" when moves from WW to LW', async () => {
    const store = makeStore({
      pracs: [
	makePractice({ status: 'waiting' }),
	makePractice({ status: 'new' }),
      ],
      wordsNoPrac: [],
    })
    const engine = new PracEngine(store, {
      lwsize: 1,
      wwsize: 1,
      random: () => 0.2,
    })

    await engine.doPrac()
    const idx0 = engine.pracIdx!
    await engine.okay()
    const idx1 = engine.pracIdx!
    expect(store.pracs[idx0]!.status).toBe('review')
    expect(store.pracs[idx1]!.status).toBe('learning')
  })


  it ('okay else branch, non-empty case', async () => {
    const store = makeStore({
      pracs: [
	makePractice({ status: 'new' }),
	makePractice({ status: 'new' }),
      ],
      wordsNoPrac: [],
    })
    const engine = new PracEngine(store, {
      lwsize: 1,
      wwsize: 1,
      random: () => 0.7,
    })

    await engine.doPrac()
    const idx0 = engine.pracIdx!
    await engine.okay()
    const idx1 = engine.pracIdx!
    expect(store.pracs[idx0]!.status).toBe('waiting')
    expect(store.pracs[idx1]!.status).toBe('learning')
  })
  
  it('creates new practices with correct word_id and user_id', async () => {
    const words = [
      { id: 10, book_id: 1, word: 'a', definition: 'A', sample: '', 'last_edited': '2026-08-14T12:07:47.836246Z' },
      { id: 20, book_id: 1, word: 'b', definition: 'B', sample: '', 'last_edited': '2026-08-14T12:07:47.836246Z' },
    ];
    const store = makeStore({
      words,
      pracs: [],
      wordsNoPrac: [0, 1],
      createWordsNoPrac: vi.fn(() => {
	store.wordsNoPrac = [0, 1];
      }),
    });

    const engine = new PracEngine(store, {
      lwsize: 2,
      wwsize: 1,
      random: () => 0.5,
    });

    await engine.doPrac();

    expect(store.pracs.length).toBeGreaterThan(0);
    expect(store.pracs[0]!.word_id).toBe(words[0]!.id);
    expect(store.pracs[0]!.user_id).toBe(1);
  })

  it ('oncemore puts the item to lw, not ww', async () => {
    const store = makeStore({
      pracs: [
	makePractice({ status: 'new' }),
	makePractice({ status: 'new' }),
      ],
      wordsNoPrac: [],
    })
    const engine = new PracEngine(store, {
      lwsize: 1,
      wwsize: 1,
      random: () => 0.6,
    })

    await engine.doPrac()
    const idx0 = engine.pracIdx!
    await engine.onceMore()
    expect(engine.lw).toContain(idx0)
    expect(engine.ww).not.toContain(idx0)
    expect(engine.pracIdx).toBe(idx0)
    expect(store.pracs[idx0]!.status).toBe('learning')
  })
    
  
})

