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

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Human relative date for a YYYY-MM-DD: Today / Tomorrow / weekday (this wk) / Mon D
function relDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.round((d - now) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
function fmtMoney(n) {
  if (n == null) return ''
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

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

  // ---- MEALS: tonight's planned dinner (shared) ----
  // shopping.shopping_state.meal_plan is keyed by day-offset from this week's
  // Sunday (startOfWeek = today - today.getDay()), so today's key = getDay().
  async function meals() {
    const db = schemaClient('shopping')
    if (!db) return null
    const { data: st } = await db.from('shopping_state').select('meal_plan').eq('id', 'current').maybeSingle()
    const plan = st?.meal_plan || {}
    const offset = new Date().getDay()
    const recipeId = plan[String(offset)] || plan[offset]
    if (!recipeId) return null
    const { data: r } = await db.from('recipes').select('name').eq('id', recipeId).maybeSingle()
    if (!r?.name) return null
    return { label: 'Tonight', value: r.name, sub: 'Planned dinner', accent: '#CB7A4F', href: 'https://shopping.reilly.live', text: true }
  },

  // ---- BILLS: next unpaid bill due (shared) ----
  // Reached through the Almanac's budget views: v_bills (real payment rows,
  // meta.paid) + v_bills_projected (future months not yet opened, all unpaid).
  async function bills() {
    const db = schemaClient('almanac')
    if (!db) return null
    const today = todayStr()
    const [{ data: real }, { data: proj }] = await Promise.all([
      db.from('v_bills').select('title, event_date, amount, meta').gte('event_date', today).order('event_date').limit(30),
      db.from('v_bills_projected').select('title, event_date, amount').gte('event_date', today).order('event_date').limit(30),
    ])
    const unpaid = [
      ...(real || []).filter(b => b.meta?.paid !== true),  // paid false / missing
      ...(proj || []),
    ]
    // dedupe by title|date, then sort soonest-first
    const seen = new Set(), list = []
    for (const b of unpaid.sort((a, c) => a.event_date < c.event_date ? -1 : 1)) {
      const k = `${b.title}|${b.event_date}`
      if (!seen.has(k)) { seen.add(k); list.push(b) }
    }
    if (!list.length) return null
    const next = list[0]
    const weekOut = addDaysStr(today, 7)
    const dueThisWeek = list.filter(b => b.event_date <= weekOut).length
    return {
      label: 'Bills',
      value: fmtMoney(next.amount),
      sub: `${next.title} · ${relDate(next.event_date)}${dueThisWeek > 1 ? ` · +${dueThisWeek - 1} more this week` : ''}`,
      accent: '#6F86C2',
      href: 'https://budget.reilly.live',
    }
  },

  // ---- CALENDAR: next thing on the shared calendar (shared) ----
  // Almanac's unified timeline (family events, paydays, goal targets…), minus
  // pet items, which get their own card below.
  async function calendar() {
    const db = schemaClient('almanac')
    if (!db) return null
    const { data } = await db.from('v_timeline')
      .select('title, event_date, event_time, source')
      .neq('source', 'pet').gte('event_date', todayStr())
      .order('event_date').limit(1)
    const e = data?.[0]
    if (!e) return null
    let sub = relDate(e.event_date)
    if (e.event_time) sub += ' · ' + new Date(e.event_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return { label: 'Calendar', value: e.title, sub, accent: '#79B45F', href: 'https://almanac.reilly.live', text: true }
  },

  // ---- PETS: next reminder / vaccine / med refill (shared) ----
  async function pets() {
    const db = schemaClient('almanac')
    if (!db) return null
    const { data } = await db.from('v_timeline')
      .select('title, event_date')
      .eq('source', 'pet').gte('event_date', todayStr())
      .order('event_date').limit(1)
    const p = data?.[0]
    if (!p) return null
    return { label: 'Pets', value: p.title, sub: relDate(p.event_date), accent: '#D8A24F', href: 'https://pets.reilly.live', text: true }
  },
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
    `<span class="gc-value${card.text ? ' is-text' : ''}">${card.value}</span>` +
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
