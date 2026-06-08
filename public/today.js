// =====================================================================
// Grove · today.js  (browser ESM — for the STATIC dashboard)
// The "Today at a glance" strip above the launcher grid. It reads other
// apps' schemas READ-ONLY (via schemaClient) and shows a few glanceable
// stats for whoever is signed in. Nothing here writes; tapping a card
// just deep-links into the owning app.
//
// DESIGN NOTES
// - Each source loads independently and fails safe: if its schema/table
//   isn't reachable, that one card simply doesn't render — the page (and
//   every other card) is unaffected. This mirrors the launcher grid's
//   "keep the local default" fallback.
// - To add a source, drop another object into SOURCES. A source returns
//   null to opt out (wrong person, not set up, no data) or a card object.
// - Person mapping: core.people has names "Mav"/"Ren"; the per-person
//   apps key on the lowercased name ('mav'/'ren'). Single-user apps
//   (journal = Ren, quest = Mav) gate via personKey.
// =====================================================================

import { whoami, schemaClient } from '/grove-core.js'

// ---- tiny local date helpers (same semantics as the apps) ----
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localDayBounds(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0, 0)
  const end = new Date(y, m - 1, d, 23, 59, 59, 999)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// Fitness category id → label (mirror of the Fitness app; separate repo).
const FITNESS_CATEGORY_LABEL = {
  general: 'General', cardio: 'Cardio', pilates_yoga: 'Pilates / Yoga',
  legs: 'Legs', arms: 'Arms', core: 'Chest / Abs / Back', rest: 'Rest / Walk',
}

// =====================================================================
// SOURCES — each: async (ctx) => card | null
// ctx = { person, personKey, today }
// card = { label, value, sub, accent, href }
// =====================================================================
const SOURCES = [
  // ---- FITNESS: streak + whether you've trained today (per person) ----
  async function fitness({ personKey, today }) {
    const db = schemaClient('fitness')
    if (!db || !personKey) return null
    const { startISO, endISO } = localDayBounds(today)
    const [{ data: prof }, { data: w }] = await Promise.all([
      db.from('profiles').select('current_streak').eq('person', personKey).maybeSingle(),
      db.from('workouts').select('category, duration_minutes')
        .eq('person', personKey).gte('performed_at', startISO).lte('performed_at', endISO)
        .order('performed_at', { ascending: false }).limit(1),
    ])
    const streak = prof?.current_streak ?? 0
    const todays = w?.[0]
    return {
      label: 'Workout',
      value: todays ? '✓ Done' : (streak > 0 ? `🔥 ${streak}` : '—'),
      sub: todays
        ? `${FITNESS_CATEGORY_LABEL[todays.category] || todays.category}${todays.duration_minutes ? ` · ${todays.duration_minutes} min` : ''}`
        : (streak > 0 ? `${streak}-day streak — keep it going` : 'Nothing logged yet today'),
      accent: '#4FA06F',
      href: 'https://fitness.reilly.live',
    }
  },

  // ---- CYCLE: phase + days to next period (Ren only) ----
  async function cycle({ personKey, today }) {
    if (personKey !== 'ren') return null
    const db = schemaClient('journal')
    if (!db) return null
    const { data } = await db.from('period_starts').select('start_date')
    const starts = (data || []).map(r => r.start_date).sort()
    if (!starts.length) return null

    const d = new Date(today + 'T00:00:00')
    let last = null
    for (const s of starts) { const sd = new Date(s + 'T00:00:00'); if (sd <= d) last = sd; else break }
    if (!last) return null
    const dayOfCycle = Math.floor((d - last) / 86400000) + 1

    let cycleLength = 28
    if (starts.length >= 2) {
      const gaps = []
      for (let i = 1; i < starts.length; i++) {
        gaps.push(Math.round((new Date(starts[i] + 'T00:00:00') - new Date(starts[i - 1] + 'T00:00:00')) / 86400000))
      }
      const recent = gaps.slice(-3)
      cycleLength = Math.round(recent.reduce((a, g) => a + g, 0) / recent.length)
      if (cycleLength < 21 || cycleLength > 40) cycleLength = 28
    }

    let phase = 'luteal'
    if (dayOfCycle <= 5) phase = 'menstrual'
    else if (dayOfCycle <= 13) phase = 'follicular'
    else if (dayOfCycle <= 16) phase = 'ovulation'
    if (dayOfCycle > cycleLength + 5) phase = null  // late — don't guess

    const daysToNext = Math.max(0, cycleLength - dayOfCycle + 1)
    return {
      label: 'Cycle',
      value: phase ? cap(phase) : `Day ${dayOfCycle}`,
      sub: phase
        ? `Day ${dayOfCycle} · ~${daysToNext}d to next period`
        : 'Period may be late',
      accent: '#D06A82',
      href: 'https://ren.reilly.live',
    }
  },

  // ---- QUEST: daily quests done + level (Mav only) ----
  async function quest({ personKey, today }) {
    if (personKey !== 'mav') return null
    const db = schemaClient('quest')
    if (!db) return null
    const TOTAL_HABITS = 5  // DEFAULT_HABITS in the quest app
    const [{ data: done }, { data: gs }] = await Promise.all([
      db.from('habit_completions').select('habit_id').eq('date', today),
      db.from('game_state').select('total_xp').eq('id', 'current').maybeSingle(),
    ])
    // level = highest L where xpForLevel(L) <= total_xp; xpForLevel(L)=50(L-1)+25(L-1)^2
    const xp = gs?.total_xp ?? 0
    let level = 1
    while (50 * level + 25 * level * level <= xp) level++
    const n = (done || []).length
    return {
      label: 'Quests',
      value: `${n}/${TOTAL_HABITS}`,
      sub: `Level ${level}${n >= TOTAL_HABITS ? ' · all done today' : ' · daily quests'}`,
      accent: '#A877B8',
      href: 'https://mav.reilly.live',
    }
  },

  // =================================================================
  // NOT YET WIRED — schema/columns unverified for these apps. Each is a
  // one-function add once the schema name + shape are confirmed; until
  // then they're left out of SOURCES so the dashboard never ships a
  // query that errors in the console.
  //
  //   • ledger   "bills due this week / unpaid"  (schema?: 'budget'; bills + bill_payments)
  //   • pantry   "tonight's dinner"              (schema?: 'pantry'; shopping_state.meal_plan + recipes)
  //   • calendar "next event today"              (schema + tables unknown)
  //   • pets     "next feeding / meds due"       (schema + tables unknown)
  // =================================================================
]

// =====================================================================
// RENDER
// =====================================================================
function cardEl(card) {
  const a = document.createElement('a')
  a.className = 'glance-card'
  a.href = card.href || '#'
  a.target = '_blank'; a.rel = 'noopener noreferrer'
  if (card.accent) a.style.setProperty('--gc', card.accent)
  a.innerHTML =
    `<span class="gc-label">${card.label}</span>` +
    `<span class="gc-value">${card.value}</span>` +
    `<span class="gc-sub">${card.sub || ''}</span>`
  return a
}

export async function renderToday() {
  const section = document.getElementById('today')
  const wrap = document.getElementById('glance')
  if (!section || !wrap) return
  try {
    const { person } = await whoami()
    const personKey = (person?.name || '').trim().toLowerCase()
    const ctx = { person, personKey, today: todayStr() }

    // Each source resolves independently; a thrown source becomes null.
    const cards = await Promise.all(
      SOURCES.map(fn => fn(ctx).catch(() => null)),
    )
    const visible = cards.filter(Boolean)
    if (!visible.length) return  // nothing to show — leave the strip hidden

    wrap.replaceChildren(...visible.map(cardEl))
    section.hidden = false
  } catch { /* leave hidden */ }
}
