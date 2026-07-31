// Shared slideout registry — deliberately centralizing what Going Yard's real App.jsx repeats by
// hand at every call site (see slap-shot-build.md §1 / §6): openAtBatSlide()/openPitcherSlide()
// are independent module-level listeners with no shared "only one open at a time" guarantee, so
// every cross-nav call site has to remember to call `openPitcherSlide(null)` before
// `openAtBatSlide(...)`. Here, opening any slide automatically closes every other registered one,
// so a single z-index (see .slide-panel in App.css) is safe and no caller has to remember anything.

const listeners = {}; // key -> setState function, registered by the slide's own component

export function registerSlide(key, setStateFn) {
  listeners[key] = setStateFn;
  return () => {
    if (listeners[key] === setStateFn) delete listeners[key];
  };
}

export function openSlide(key, payload) {
  for (const [k, setState] of Object.entries(listeners)) {
    if (k !== key) setState(null);
  }
  if (listeners[key]) listeners[key](payload);
}

export function closeAllSlides() {
  for (const setState of Object.values(listeners)) setState(null);
}

export function openSkaterSlide(skater) {
  openSlide("skater", skater);
}

export function openGoalieSlide(goalie) {
  openSlide("goalie", goalie);
}
