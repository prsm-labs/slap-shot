import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { downloadData, etStamp, mb, offlineSupported, readMeta, removeSnapshot, saveSnapshot } from '../lib/offline.js'
import './Offline.css'

// 2026-11-02 (user): 📦 Offline & data -- the last item in the ☰ menu opens this panel; OfflineBanner sits under the header and
// shows only while the page is running on a saved snapshot. Same file in CourtIQ, Slap Shot, Six Points and Final Lap.
const metaListeners = new Set()
const announce = () => metaListeners.forEach((f) => f(readMeta()))
function useMeta() {
  const [meta, setMeta] = useState(readMeta)
  useEffect(() => { metaListeners.add(setMeta); return () => metaListeners.delete(setMeta) }, [])
  return meta
}

export function OfflineMenuButton({ config, onOpen }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="tm-item off-menu" onClick={() => { onOpen?.(); setOpen(true) }}>📦 Offline &amp; data</button>
      {open && createPortal(<OfflinePanel config={config} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function OfflinePanel({ config, onClose }) {
  const meta = useMeta()
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const can = offlineSupported()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const save = async () => {
    setBusy('save'); setMsg(null)
    try {
      const m = await saveSnapshot(config, (d, n, label) => setMsg(n ? `${label} ${d} of ${n}` : label))
      announce()
      setMsg(`Saved ${m.files} files (${mb(m.bytes)}).${m.missing ? ` ${m.missing} app files couldn’t be saved — some pages may not open offline.` : ''}`)
    } catch (e) { setMsg(e.message || 'Couldn’t save the offline copy.') }
    setBusy(null)
  }
  const remove = async () => {
    setBusy('remove'); await removeSnapshot(); announce(); setMsg('Offline copy removed from this device.'); setBusy(null)
  }
  const download = async () => {
    setBusy('dl'); setMsg(null)
    try { const r = await downloadData(config); setMsg(`Downloaded ${r.tables} tables (${mb(r.bytes)}).`) } catch (e) { setMsg(e.message || 'Couldn’t build the download.') }
    setBusy(null)
  }

  return (
    <div className="off-wrap" role="dialog" aria-modal="true" aria-label="Offline and data">
      <div className="off-backdrop" onClick={onClose} />
      <div className="off-panel">
        <div className="off-head">
          <span>📦 Offline &amp; data</span>
          <button type="button" className="off-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <section>
          <h3>Save for offline</h3>
          <p>Keeps a copy of {config.app} and {config.what || 'today’s data'} on this device, so it opens with no connection.</p>
          {meta
            ? <p className="off-status">Saved <b>{etStamp(meta.at)}</b>{meta.slate ? <> · {meta.slate}</> : null} · {mb(meta.bytes)}</p>
            : <p className="off-status muted">No offline copy on this device.</p>}
          <div className="off-btns">
            <button type="button" className="off-btn primary" disabled={!can || !!busy} onClick={save}>{busy === 'save' ? 'Saving…' : meta ? 'Update snapshot' : 'Save for offline'}</button>
            {meta && <button type="button" className="off-btn" disabled={!!busy} onClick={remove}>Remove</button>}
          </div>
          <p className="off-warn">⚠️ A snapshot is frozen at the time it was saved: no live scores, lineups, injuries or re-sims. Update it (or tap 🔄) when you’re back online.</p>
          {!can && <p className="off-warn">This browser can’t keep an offline copy — the download below still works.</p>}
          <p className="off-fine">iPhone: add the app to your Home Screen so Safari keeps the copy longer.</p>
        </section>

        <section>
          <h3>Download data</h3>
          <p>Spreadsheet files (CSV, in a .zip) of {config.tablesWhat || 'today’s numbers'}, time-stamped, with a read-me.</p>
          <div className="off-btns">
            <button type="button" className="off-btn" disabled={!!busy} onClick={download}>{busy === 'dl' ? 'Building…' : '⬇ Download data (.zip)'}</button>
          </div>
          <p className="off-fine">For research only — not betting advice, nothing is a lock or guaranteed. Our own numbers only: sportsbook odds and third-party lineup / news data aren’t included.</p>
        </section>

        {msg && <p className="off-msg" role="status">{msg}</p>}
      </div>
    </div>
  )
}

export function OfflineBanner() {
  const meta = useMeta()
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const [served, setServed] = useState(false)
  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    const sw = navigator.serviceWorker
    const onMsg = (e) => { if (e.data?.type === 'offline-status' && e.data.fromCache) setServed(true) }
    sw?.addEventListener('message', onMsg)
    sw?.startMessages?.() // messages sent before this point are held until it's called
    sw?.controller?.postMessage({ type: 'offline-status' })
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); sw?.removeEventListener('message', onMsg) }
  }, [])
  if (!meta || !(offline || served)) return null
  return (
    <div className="off-banner" role="status">
      <b>📦 Offline snapshot</b> · saved {etStamp(meta.at)}{meta.slate ? ` · ${meta.slate}` : ''}.{' '}
      Not live — scores, lineups and injuries won’t update{offline ? '' : ' (couldn’t reach the server)'}. Tap 🔄 when you’re back online.
    </div>
  )
}
