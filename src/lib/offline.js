// 2026-11-02 (user): 📦 offline snapshot + research download. Same file in CourtIQ, Slap Shot, Six Points and Final Lap; each app's
// src/lib/offlineConfig.js says which data files make up its snapshot and which tables go in the download.
//   Save for offline  -- copies the app (index + build files) and today's data into Cache Storage and registers public/offline-sw.js,
//                        which serves that copy only when the network fails. A frozen copy, time-stamped; Update re-saves it.
//   Download data     -- a .zip of CSV tables (our own numbers only -- no sportsbook odds or third-party lineups / news) + a read-me.
export const CACHE = 'degen-offline-v1'
const META_KEY = 'degenOffline'
const SW = '/offline-sw.js'

export const offlineSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'caches' in window
export function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || 'null') } catch { return null }
}
function writeMeta(m) {
  try { if (m) localStorage.setItem(META_KEY, JSON.stringify(m)); else localStorage.removeItem(META_KEY) } catch { /* private mode */ }
}

// main.jsx: keep the worker registered while a snapshot is saved (nobody else ever gets one)
export function bootOffline() {
  if (offlineSupported() && readMeta()) navigator.serviceWorker.register(SW, { scope: '/' }).catch(() => {})
}

export const etStamp = (iso, opts = {}) => new Date(iso).toLocaleString('en-US', {
  timeZone: 'America/New_York', weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', ...opts,
}).replace(',', '') + ' ET'
export const mb = (b) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`

const ASSET_RE = /\/?assets\/[\w.-]+\.(?:js|css|woff2?|ttf|png|svg|jpe?g|webp|gif)/g
const path = (u) => { try { const x = new URL(u, location.href); return x.origin === location.origin ? x.pathname : null } catch { return null } }

// The app itself: index, every build file it references (followed through the JS / CSS for chunks, fonts, images), icons
async function shellPaths(extra) {
  const out = new Set(['/', '/favicon.ico', '/favicon.svg', ...extra])
  document.querySelectorAll('script[src], link[href], img[src], source[srcset]').forEach((el) => {
    const p = path(el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('srcset'))
    if (p && !p.startsWith('/api/')) out.add(p)
  })
  for (const e of performance.getEntriesByType('resource')) {
    const p = path(e.name)
    if (p && !p.startsWith('/api/') && !p.startsWith('/data/')) out.add(p)
  }
  const done = new Set(), texts = new Map()
  let todo = [...out].filter((p) => /\.(js|css)$/.test(p))
  while (todo.length) {
    const next = []
    for (const p of todo) {
      if (done.has(p)) continue
      done.add(p)
      try {
        const t = await (await fetch(p)).text()
        texts.set(p, t)
        for (const m of t.match(ASSET_RE) || []) {
          const q = m.startsWith('/') ? m : `/${m}`
          if (!out.has(q)) { out.add(q); if (/\.(js|css)$/.test(q)) next.push(q) }
        }
      } catch { /* listed anyway; the save step reports it */ }
    }
    todo = next
  }
  return [...out]
}

// Data the viewer already opened this visit (a past night, a team's with / without file ...) rides along too
const seenData = () => [...new Set(performance.getEntriesByType('resource').map((e) => path(e.name)).filter((p) => p && p.startsWith('/data/')))]

export async function saveSnapshot(config, onProgress = () => {}) {
  if (!offlineSupported()) throw new Error('This browser can’t keep an offline copy.')
  await navigator.serviceWorker.register(SW, { scope: '/' })
  onProgress(0, 0, 'Listing files…')
  const [shell, data] = await Promise.all([shellPaths(config.shell || []), config.files()])
  const urls = [...new Set([...shell, ...data, ...seenData()])]
  const got = [], failed = []
  let bytes = 0, done = 0
  const one = async (u) => {
    try {
      const r = await fetch(u, { cache: 'no-cache' })
      if (!r.ok) throw new Error(r.status)
      const blob = await r.blob()
      got.push([u, new Response(blob, { headers: { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream' } })])
      bytes += blob.size
    } catch { failed.push(u) }
    onProgress(++done, urls.length, 'Saving…')
  }
  const queue = [...urls]
  await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await one(queue.shift()) }))
  if (!got.some(([u]) => u === '/')) throw new Error('Couldn’t reach the app — check the connection and try again.')
  await caches.delete(CACHE)
  const cache = await caches.open(CACHE)
  for (const [u, res] of got) await cache.put(u, res)
  const meta = { at: new Date().toISOString(), slate: (await config.label?.()) || '', files: got.length, bytes, missing: failed.filter((u) => !u.startsWith('/data/')).length }
  writeMeta(meta)
  try { await navigator.storage?.persist?.() } catch { /* not offered */ }
  return meta
}

export async function removeSnapshot() {
  try { await caches.delete(CACHE) } catch { /* none */ }
  writeMeta(null)
  try {
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) {
      if ((r.active || r.waiting || r.installing)?.scriptURL?.endsWith(SW)) await r.unregister()
    }
  } catch { /* none */ }
}

// ── download: CSV tables in a .zip (stored, no compression -- no library needed) ─────────────────────────────────────────────
const cell = (v) => {
  if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
// table = { name, cols: [[header, row => value], ...], rows }
export const toCsv = ({ cols, rows }) => '﻿' + [cols.map((c) => cell(c[0])).join(','), ...rows.map((r) => cols.map((c) => cell(c[1](r))).join(','))].join('\r\n') + '\r\n'
export const pct = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 1000) / 10)

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0 }
export function zipFiles(files) {
  const enc = new TextEncoder(), parts = [], central = []
  const d = new Date()
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  let off = 0
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, time, true); h.setUint16(12, date, true)
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true)
    parts.push(h, name, data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, time, true); c.setUint16(14, date, true)
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true)
    central.push(c, name)
    off += 30 + name.length + data.length
  }
  const size = central.reduce((s, p) => s + p.byteLength, 0)
  const e = new DataView(new ArrayBuffer(22))
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true)
  return new Blob([...parts, ...central, e], { type: 'application/zip' })
}

export async function downloadData(config) {
  const at = new Date().toISOString()
  const tables = (await config.tables()).filter((t) => t.rows?.length)
  const slate = (await config.label?.()) || ''
  const readme = [
    `${config.app} (${config.league}) -- data snapshot`,
    `Saved: ${etStamp(at)}${slate ? `   (${slate})` : ''}`,
    '',
    'A frozen copy: nothing in these files updates. Download again from the app for newer numbers.',
    'For research and personal use only. Not betting advice -- nothing here is a lock or a guarantee.',
    'Chances are our model estimates; the app\'s Track Record shows how they have done.',
    'Sportsbook odds and third-party lineup / news data are not included.',
    '',
    'Files:',
    ...tables.map((t) => `  ${t.name} -- ${t.about || ''} (${t.rows.length} rows)`),
    '',
    `Degen Labs -- a PRISM venture. ${config.url || ''}`,
    'Please don\'t resell or republish these files.',
    '',
  ].join('\r\n')
  const blob = zipFiles([{ name: 'README.txt', text: readme }, ...tables.map((t) => ({ name: t.name, text: toCsv(t) }))])
  const stamp = new Date(at).toLocaleString('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/[^\d]+/g, '')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${config.app.replace(/\s+/g, '')}_data_${stamp.slice(0, 8)}_${stamp.slice(8, 12)}ET.zip`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 4000)
  return { tables: tables.length, bytes: blob.size }
}
