// 2026-10-28 (user: the explanation box at the top of each page -- collapsed by default, with a glowing border for people who
// haven't read it yet). Same file in CourtIQ, Slap Shot, Six Points and Final Lap. Works on the page as rendered: every
// explanation box (.note with 120+ characters, outside slideouts / pop-ups / tables) shows two lines with a fade and a
// "More" button; tapping the box or the button opens it, "Less" folds it again. A box this browser hasn't opened yet glows in
// the app's accent until it is opened once; the "read" mark is kept per box text (numbers ignored, so a changing count
// doesn't re-glow it, but a rewritten note does). Nothing here is React-managed: it only adds classes and one button to boxes
// React already drew, and re-checks whenever the page changes.
const KEY = 'notesRead'
const MIN_CHARS = 120
const SKIP = '.slide, .slide-panel, .slideout-panel, .tm-panel, [role="dialog"], table, .fp, .modal, .pick-menu'

let read
const loadRead = () => {
  if (read) return read
  try { read = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')) } catch { read = new Set() }
  return read
}
const saveRead = () => { try { localStorage.setItem(KEY, JSON.stringify([...read].slice(-400))) } catch { /* private mode */ } }

// stable id for a note's text: digits and spacing dropped, first 160 letters, small hash
function noteId(el) {
  const t = (el.textContent || '').replace(/(More|Less)\s*[▾▴]?$/, '').replace(/[\d\s.,:%+\-–—·]+/g, ' ').trim().slice(0, 160)
  let h = 5381
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function setOpen(el, open) {
  el.classList.toggle('nc-open', open)
  const b = el.querySelector(':scope > .nc-btn')
  if (b) { b.textContent = open ? 'Less ▴' : 'More ▾'; b.setAttribute('aria-expanded', String(open)) }
  if (open && el.classList.contains('nc-unread')) {
    el.classList.remove('nc-unread')
    loadRead().add(el.dataset.ncId)
    saveRead()
  }
}

function enhance(el) {
  if (el.dataset.ncId) {
    // React may have rewritten the text (new night / filter): re-key it, keep open / closed as it was
    const id = noteId(el)
    if (id !== el.dataset.ncId) { el.dataset.ncId = id; el.classList.toggle('nc-unread', !loadRead().has(id) && !el.classList.contains('nc-open')) }
    if (!el.querySelector(':scope > .nc-btn')) addButton(el)
    return
  }
  if (el.closest(SKIP)) return
  if ((el.textContent || '').trim().length < MIN_CHARS) return
  el.dataset.ncId = noteId(el)
  el.classList.add('nc')
  if (!loadRead().has(el.dataset.ncId)) el.classList.add('nc-unread')
  addButton(el)
  el.addEventListener('click', (e) => {
    if (el.classList.contains('nc-open')) return
    if (e.target.closest('a, button:not(.nc-btn), input, select, label')) return
    e.preventDefault()
    setOpen(el, true)
  })
}

function addButton(el) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'nc-btn'
  b.textContent = el.classList.contains('nc-open') ? 'Less ▴' : 'More ▾'
  b.setAttribute('aria-expanded', String(el.classList.contains('nc-open')))
  b.addEventListener('click', (e) => { e.stopPropagation(); setOpen(el, !el.classList.contains('nc-open')) })
  el.appendChild(b)
}

// a box that already fits in its two closed lines has nothing to open: no button, no fade, no glow
function fit(el) {
  if (!el.classList.contains('nc') || el.classList.contains('nc-open')) return
  el.classList.remove('nc-fits')
  const fits = el.scrollHeight <= el.clientHeight + 4
  el.classList.toggle('nc-fits', fits)
}

let queued = false
function scan() {
  queued = false
  document.querySelectorAll('.note').forEach((el) => { enhance(el); fit(el) })
}
export function startNoteCollapse() {
  if (typeof document === 'undefined') return
  const run = () => { if (!queued) { queued = true; requestAnimationFrame(scan) } }
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true, characterData: true })
  window.addEventListener('resize', run)
  run()
}
