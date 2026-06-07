// =====================================================================
// Grove · Settings.jsx
// The Settings view for the home dashboard (home.reilly.live).
// Surface it from a "Settings" tile/card on the grid → renders this.
//
// Reads/writes the `core` schema via core.js helpers. Styled with the
// Grove tokens already in App.css (BRAND-GUIDE §5); a scoped block below
// covers Settings-specific layout only.
// =====================================================================

import { useEffect, useState } from 'react'
import {
  Sun, Moon, MonitorSmartphone, Users, LayoutGrid, Info,
  ChevronUp, ChevronDown, Trash2, Plus, Check, ArrowLeft, ExternalLink,
} from 'lucide-react'
import {
  whoami, getPeople, getApps, setTheme, cachedTheme, core,
} from './core.js'

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Sun },
  { id: 'household',  label: 'Household',  icon: Users },
  { id: 'apps',       label: 'Apps',       icon: LayoutGrid },
  { id: 'about',      label: 'About',      icon: Info },
]

const GROVE_VERSION = '1.0.0'

export default function Settings({ onClose }) {
  const [section, setSection] = useState('appearance')
  const [me, setMe] = useState(null)
  const [people, setPeople] = useState([])
  const [apps, setApps] = useState([])
  const [theme, setThemeState] = useState(cachedTheme())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const who = await whoami()
        setMe(who.person)
        const [pp, aa] = await Promise.all([getPeople(), getApps()])
        setPeople(pp)
        setApps(aa)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function chooseTheme(next) {
    setThemeState(next)
    await setTheme(me?.id, next)
  }

  return (
    <div className="settings">
      <SettingsStyles />

      <header className="settings-head">
        {onClose && (
          <button className="btn ghost sm icon-btn" onClick={onClose} aria-label="Back to dashboard">
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <h1>Settings</h1>
          <p className="sub">{me ? `Signed in as ${me.name}` : 'Grove household'}</p>
        </div>
      </header>

      <nav className="settings-tabs" role="tablist">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={section === id}
            className={`settings-tab ${section === id ? 'on' : ''}`}
            onClick={() => setSection(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="empty"><span className="big">🌿</span><p>Loading Grove…</p></div>
      ) : (
        <div className="settings-body">
          {section === 'appearance' && (
            <Appearance theme={theme} onChoose={chooseTheme} />
          )}
          {section === 'household' && (
            <Household people={people} setPeople={setPeople} me={me} />
          )}
          {section === 'apps' && (
            <Apps apps={apps} setApps={setApps} />
          )}
          {section === 'about' && (
            <About apps={apps} />
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Appearance — the one cross-app preference. Segmented control.
// ---------------------------------------------------------------------
function Appearance({ theme, onChoose }) {
  const opts = [
    { id: 'auto',  label: 'Auto',  icon: MonitorSmartphone, hint: 'Follows your device' },
    { id: 'light', label: 'Light', icon: Sun,  hint: 'Daytime mode' },
    { id: 'dark',  label: 'Dark',  icon: Moon, hint: 'Grove default' },
  ]
  return (
    <section className="card">
      <h2 className="card-title">Theme</h2>
      <p className="sub">Applies across every Grove app and follows you between devices.</p>
      <div className="segmented">
        {opts.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`segment ${theme === id ? 'on' : ''}`}
            onClick={() => onChoose(id)}
            aria-pressed={theme === id}
          >
            <Icon size={18} />
            <span>{label}</span>
            {theme === id && <Check size={14} className="seg-check" />}
          </button>
        ))}
      </div>
      <p className="sub note">{opts.find(o => o.id === theme)?.hint}</p>
    </section>
  )
}

// ---------------------------------------------------------------------
// Household — people CRUD. Email is read-only (Cloudflare identity).
// Delete is de-emphasized + confirmed (UI-POLISH §4).
// ---------------------------------------------------------------------
function Household({ people, setPeople, me }) {
  const [confirmId, setConfirmId] = useState(null)

  async function patch(id, fields) {
    setPeople(ps => ps.map(p => (p.id === id ? { ...p, ...fields } : p)))
    await core.from('people').update(fields).eq('id', id)
  }

  async function addPerson() {
    const { data } = await core
      .from('people')
      .insert({ name: 'New member', color: '#9B82BE', sort_order: people.length })
      .select().single()
    if (data) setPeople(ps => [...ps, data])
  }

  async function removePerson(id) {
    setConfirmId(null)
    setPeople(ps => ps.filter(p => p.id !== id))
    await core.from('people').delete().eq('id', id)
  }

  return (
    <section className="card">
      <h2 className="card-title">Members</h2>
      <p className="sub">Shared across every app — colors tag transactions, entries, and more.</p>

      <div className="rows">
        {people.map(p => (
          <div className="row person" key={p.id}>
            <label className="swatch" style={{ '--swatch': p.color }} aria-label={`${p.name} color`}>
              <input
                type="color"
                value={p.color}
                onChange={e => patch(p.id, { color: e.target.value })}
              />
            </label>
            <div className="grow">
              <input
                className="inline-input title"
                value={p.name}
                onChange={e => patch(p.id, { name: e.target.value })}
                onBlur={e => patch(p.id, { name: e.target.value.trim() || 'Member' })}
              />
              <span className="sub mono">{p.email || 'no Cloudflare email set'}</span>
            </div>
            {me?.id === p.id && <span className="tag">you</span>}
            {confirmId === p.id ? (
              <div className="confirm">
                <button className="btn danger sm" onClick={() => removePerson(p.id)}>
                  Remove {p.name}
                </button>
                <button className="btn ghost sm" onClick={() => setConfirmId(null)}>Keep</button>
              </div>
            ) : (
              <button
                className="btn ghost sm icon-btn danger-text"
                onClick={() => setConfirmId(p.id)}
                aria-label={`Remove ${p.name}`}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button className="btn ghost block" onClick={addPerson}>
        <Plus size={16} /> Add member
      </button>
      <p className="sub note">
        The email must match the address allowed in the Cloudflare Access “Household” policy,
        or that person won’t be recognized when they open an app.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------
// Apps — the registry that drives the dashboard grid.
// Enable toggle is paired with a second cue (dimmed + label), reorder
// via up/down, inline edit of name/subdomain/accent.
// ---------------------------------------------------------------------
function Apps({ apps, setApps }) {
  const [editId, setEditId] = useState(null)

  async function patch(id, fields) {
    setApps(as => as.map(a => (a.id === id ? { ...a, ...fields } : a)))
    await core.from('apps').update(fields).eq('id', id)
  }

  async function move(id, dir) {
    const idx = apps.findIndex(a => a.id === id)
    const swap = idx + dir
    if (swap < 0 || swap >= apps.length) return
    const next = [...apps]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    const reordered = next.map((a, i) => ({ ...a, sort_order: i }))
    setApps(reordered)
    await Promise.all(
      reordered.map(a => core.from('apps').update({ sort_order: a.sort_order }).eq('id', a.id)),
    )
  }

  return (
    <section className="card">
      <h2 className="card-title">App tiles</h2>
      <p className="sub">Reorder, rename, or hide a tile from the home grid.</p>

      <div className="rows">
        {apps.map((a, i) => (
          <div className={`row app ${a.enabled ? '' : 'is-off'}`} key={a.id}>
            <span className="dot" style={{ '--dot': a.accent_hex || 'var(--accent)' }} />
            <div className="grow">
              {editId === a.id ? (
                <div className="edit-grid">
                  <input className="inline-input title" value={a.name}
                    onChange={e => patch(a.id, { name: e.target.value })} placeholder="Name" />
                  <input className="inline-input mono" value={a.subdomain}
                    onChange={e => patch(a.id, { subdomain: e.target.value })} placeholder="sub.reilly.live" />
                  <div className="accent-edit">
                    <input type="color" value={a.accent_hex || '#4FA06F'}
                      onChange={e => patch(a.id, { accent_hex: e.target.value })} />
                    <input className="inline-input" value={a.accent_name || ''}
                      onChange={e => patch(a.id, { accent_name: e.target.value })} placeholder="Accent name" />
                  </div>
                </div>
              ) : (
                <>
                  <span className="title">{a.name}</span>
                  <span className="sub mono">{a.subdomain}</span>
                </>
              )}
            </div>

            <div className="app-actions">
              <button className="btn ghost sm icon-btn" onClick={() => move(a.id, -1)}
                disabled={i === 0} aria-label="Move up"><ChevronUp size={16} /></button>
              <button className="btn ghost sm icon-btn" onClick={() => move(a.id, 1)}
                disabled={i === apps.length - 1} aria-label="Move down"><ChevronDown size={16} /></button>
              <button
                className={`toggle ${a.enabled ? 'on' : ''}`}
                onClick={() => patch(a.id, { enabled: !a.enabled })}
                aria-pressed={a.enabled}
              >
                <span className="knob" />
                <span className="toggle-label">{a.enabled ? 'Shown' : 'Hidden'}</span>
              </button>
              <button className="btn ghost sm" onClick={() => setEditId(editId === a.id ? null : a.id)}>
                {editId === a.id ? 'Done' : 'Edit'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------
// About — version, repos, light reachability check.
// ---------------------------------------------------------------------
function About({ apps }) {
  const [status, setStatus] = useState({})

  async function checkAll() {
    const next = {}
    await Promise.all(apps.map(async a => {
      next[a.id] = 'checking'
      try {
        // no-cors: we can't read the response, but a resolved fetch means
        // the host answered. A reject means unreachable.
        await fetch(`https://${a.subdomain}`, { mode: 'no-cors' })
        next[a.id] = 'up'
      } catch {
        next[a.id] = 'down'
      }
    }))
    setStatus({ ...next })
  }

  return (
    <section className="card">
      <h2 className="card-title">About Grove</h2>
      <p className="sub">Version <span className="mono">{GROVE_VERSION}</span> · the reilly.live home suite.</p>

      <div className="rows">
        {apps.map(a => (
          <a className="row link-row" key={a.id}
             href={`https://${a.subdomain}`} target="_blank" rel="noreferrer">
            <span className="dot" style={{ '--dot': a.accent_hex || 'var(--accent)' }} />
            <div className="grow">
              <span className="title">{a.name}</span>
              <span className="sub mono">{a.subdomain}</span>
            </div>
            {status[a.id] && (
              <span className={`pill ${status[a.id]}`}>
                {status[a.id] === 'up' ? 'reachable'
                  : status[a.id] === 'down' ? 'no answer'
                  : '…'}
              </span>
            )}
            <ExternalLink size={15} className="ext" />
          </a>
        ))}
      </div>

      <button className="btn ghost block" onClick={checkAll}>Check reachability</button>
      <p className="sub note">
        A reachability check only confirms the host answered — Cloudflare Access still gates
        the actual app behind your household login.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------
// Scoped styles — Grove tokens only, no raw hex.
// ---------------------------------------------------------------------
function SettingsStyles() {
  return (
    <style>{`
    .settings { max-width: 640px; margin: 0 auto; padding: var(--sp-4); }
    .settings-head { display:flex; align-items:center; gap:var(--sp-3); margin-bottom: var(--sp-5); }
    .settings-head h1 { font-family: var(--font-display); font-size: var(--fs-2xl); font-weight: var(--fw-title); margin:0; color: var(--text); }
    .settings .sub { font-size: var(--fs-sm); color: var(--text-soft); margin:0; }
    .settings .mono { font-family: var(--font-mono); }
    .settings .note { margin-top: var(--sp-3); }

    /* section tabs */
    .settings-tabs { display:grid; grid-auto-columns:1fr; grid-auto-flow:column; gap: var(--sp-2);
      background: var(--bg-sunken); padding: var(--sp-1); border-radius: var(--r-md); margin-bottom: var(--sp-5); }
    .settings-tab { display:flex; align-items:center; justify-content:center; gap:var(--sp-2);
      padding: var(--sp-2) var(--sp-3); border:0; background:transparent; border-radius: var(--r-sm);
      color: var(--text-soft); font-family: var(--font-body); font-size: var(--fs-sm); cursor:pointer; }
    .settings-tab.on { background: var(--bg-elevated); color: var(--accent); font-weight: var(--fw-med); }
    .settings-tab span { white-space:nowrap; }

    .card { background: var(--bg-paper); border:1px solid var(--border);
      border-radius: var(--r-lg); padding: var(--sp-5); margin-bottom: var(--sp-4); }
    .card-title { font-family: var(--font-display); font-size: var(--fs-lg);
      font-weight: var(--fw-title); color: var(--text); margin:0 0 var(--sp-1); }

    /* segmented theme control */
    .segmented { display:grid; grid-template-columns:repeat(3,1fr); gap: var(--sp-2);
      margin-top: var(--sp-4); }
    .segment { position:relative; display:flex; flex-direction:column; align-items:center; gap:var(--sp-2);
      padding: var(--sp-4) var(--sp-2); border:1px solid var(--border); background: var(--bg-sunken);
      border-radius: var(--r-md); color: var(--text-soft); cursor:pointer; font-family: var(--font-body);
      font-size: var(--fs-sm); transition: all 160ms cubic-bezier(.2,.8,.2,1); }
    .segment.on { border-color: var(--accent); color: var(--text);
      background: var(--accent-weak); }
    .seg-check { position:absolute; top: var(--sp-2); right: var(--sp-2); color: var(--accent); }

    /* rows */
    .rows { display:flex; flex-direction:column; gap: var(--sp-3); margin-top: var(--sp-4); }
    .row { display:flex; align-items:center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4);
      background: var(--bg-sunken); border-radius: var(--r-md); }
    .row .grow { flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }
    .row .title { font-family: var(--font-display); font-size: var(--fs-base); color: var(--text); }
    .row .sub { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .swatch { position:relative; width:32px; height:32px; border-radius: var(--r-sm);
      background: var(--swatch); border:1px solid var(--border); cursor:pointer; flex:none; }
    .swatch input { position:absolute; inset:0; opacity:0; cursor:pointer; }
    .dot { width:12px; height:12px; border-radius: var(--r-full); background: var(--dot); flex:none; }

    .inline-input { background: var(--bg-elevated); border:1px solid var(--border);
      border-radius: var(--r-sm); padding: 6px 8px; color: var(--text); font-family: var(--font-body);
      font-size: var(--fs-base); width:100%; }
    .inline-input.title { font-family: var(--font-display); }
    .inline-input.mono { font-family: var(--font-mono); font-size: var(--fs-sm); }

    .tag { font-size: var(--fs-xs); color: var(--accent); background: var(--accent-weak);
      padding: 2px 8px; border-radius: var(--r-full); font-family: var(--font-body); }
    .confirm { display:flex; gap: var(--sp-2); align-items:center; }

    /* apps */
    .row.app.is-off { opacity:.55; }
    .app-actions { display:flex; align-items:center; gap: var(--sp-2); }
    .edit-grid { display:flex; flex-direction:column; gap: var(--sp-2); }
    .accent-edit { display:flex; gap: var(--sp-2); align-items:center; }
    .accent-edit input[type=color] { width:36px; height:36px; border:1px solid var(--border);
      border-radius: var(--r-sm); background:none; padding:2px; }

    /* toggle: color + label + knob position (paired cues, UI-POLISH §2) */
    .toggle { display:inline-flex; align-items:center; gap: var(--sp-2); padding: 4px 10px 4px 4px;
      border:1px solid var(--border); border-radius: var(--r-full); background: var(--bg-elevated);
      cursor:pointer; }
    .toggle .knob { width:14px; height:14px; border-radius: var(--r-full); background: var(--text-soft);
      transition: all 160ms cubic-bezier(.2,.8,.2,1); }
    .toggle.on { border-color: var(--accent); background: var(--accent-weak); }
    .toggle.on .knob { background: var(--accent); }
    .toggle-label { font-size: var(--fs-xs); color: var(--text-soft); font-family: var(--font-body); }
    .toggle.on .toggle-label { color: var(--accent); }

    /* about */
    .link-row { text-decoration:none; }
    .link-row .ext { color: var(--text-soft); flex:none; }
    .pill { font-size: var(--fs-xs); padding: 2px 8px; border-radius: var(--r-full);
      font-family: var(--font-mono); }
    .pill.up { color: var(--ok); background: color-mix(in srgb, var(--ok) 16%, transparent); }
    .pill.down { color: var(--danger); background: color-mix(in srgb, var(--danger) 16%, transparent); }

    /* buttons (fallbacks if .btn isn't already in App.css) */
    .btn { display:inline-flex; align-items:center; justify-content:center; gap: var(--sp-2);
      font-family: var(--font-body); font-size: var(--fs-sm); padding: var(--sp-2) var(--sp-4);
      border-radius: var(--r-md); border:1px solid var(--border); background: var(--bg-elevated);
      color: var(--text); cursor:pointer; }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
    .btn.ghost { background:transparent; }
    .btn.danger { background: var(--danger); border-color: var(--danger); color: var(--bg); }
    .btn.danger-text { color: var(--danger); }
    .btn.sm { padding: 6px 10px; font-size: var(--fs-xs); }
    .btn.block { width:100%; margin-top: var(--sp-4); }
    .btn.icon-btn { padding: 6px; }
    .btn:disabled { opacity:.35; cursor:default; }

    .empty { text-align:center; padding: var(--sp-8) 0; color: var(--text-soft); }
    .empty .big { font-size: var(--fs-3xl); display:block; margin-bottom: var(--sp-3); }

    @media (max-width: 480px) {
      .settings-tab span { display:none; }
      .app-actions { flex-wrap:wrap; justify-content:flex-end; }
    }
    `}</style>
  )
}
