# MORPHEUS UI kit, Step 1

Design tokens, typography and reusable components. Vanilla ES modules + CSS, no build step, no dependencies.
This step does **not** touch `index.html`, `style.css`, `main.js` or any gameplay file.

## Files

| File | Purpose |
|---|---|
| `src/ui/tokens.css` | CSS variables: colors, type families/scale/tracking, spacing, radii, glows, motion, focus ring |
| `src/ui/ui.css` | Typography roles (`.mp-text-*`) and component styles. Everything is `.mp-` prefixed |
| `src/ui/dom.js` | `h()` element helper, `uid`, `cx`, `prefersReducedMotion` |
| `src/ui/icons.js` | Thin-line icons: person, group, infinity, laurel, gift, lock, chevron, reset, pause, play, check, star + placeholder silhouettes |
| `src/ui/components/panel.js` | `glassPanel`, `screenTitle` |
| `src/ui/components/buttons.js` | `goldButton`, `menuItem`, `iconButton` |
| `src/ui/components/display.js` | `keyCap`, `keyHint`, `statBadge`, `hudCard`, `progressBar`, `starRating`, `laurelTitle` |
| `src/ui/components/nav.js` | `tabBar`, `levelTile`, `objectTray` |
| `src/ui/components/backdrop.js` | `backdrop`: gradients, light shafts, grain, capped dust, vignette, parallax |
| `src/ui/index.js` | Single import point |
| `ui-kit.html` | Test page showing every token and component |
| `tests/smoke.test.mjs` | 27 automated checks (needs `npm i jsdom` once) |

Not in this step (by design): the screen manager / `ScreenTransition` (Step 2), the 34 screens, the bridge to `main.js`.

## Test it

1. Serve the folder over HTTP (modules need it): `python -m http.server 8001`, then open `http://localhost:8001/ui-kit.html`.
   Needs internet for the Google Fonts link (Cinzel + Jost), like the existing project.
2. Press **Tab** through the page: every control shows a gold focus ring. Arrow keys / Home / End work on the tabs.
3. Drag the P1 / P2 / Solo sliders: each card updates independently. "Clear" shows an em dash.
4. Use the Backdrop variant select (warm / dim / fail / win). Enable "reduce motion" in your OS to confirm shimmer, dust, parallax and pulses stop.
5. Optional automated checks: `npm i jsdom && node tests/smoke.test.mjs`.

## Using it later (integration notes)

```html
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./src/ui/tokens.css">
<link rel="stylesheet" href="./src/ui/ui.css">
```
```js
import { hudCard, objectTray, goldButton } from './src/ui/index.js';
const p1 = hudCard({ player: 'p1' });   // later: p1.update(stateFromGameplay.p1.accuracy)
```
Components are display-only: they render what they are given and never compute scores, winners or thresholds.
Stateful ones expose small methods (`update`, `setSelected`, `setPressed`, `select`, `setItems`, `destroy`).

---

# Step 2: screen manager

`src/ui/screens/` owns the stage and the navigation state for every MORPHEUS screen. It is display-side only: it never reads gameplay state, never decides a winner or a next level (the caller does, e.g. `ui.go('victory')`), and it is not wired into `main.js` yet. It does not hard-code any screen list or count.

Link `src/ui/screens/screens.css` after `ui.css`. Demo: `screens-demo.html`. Tests: `node tests/screens.test.mjs`.

| File | Purpose |
|---|---|
| `screens/screen-manager.js` | `createScreenManager(options)`: stage, navigation, overlays, lifecycle, focus, declarative nav |
| `screens/registry.js` | Definition validation and defaults, `to` graph check |
| `screens/history.js` | Pure back-stack logic (no DOM) |
| `screens/transitions.js` | One-at-a-time, interruptible transition runner (injectable scheduler) |
| `screens/keys.js` | Keyboard routing decision (pure) |
| `screens/focus.js`, `announcer.js` | Focus helpers, ARIA live region |
| `screens/screens.css` | Stage layers, transition states, reduced motion |

## Registering a screen

```js
import { createScreenManager } from './src/ui/index.js';
const ui = createScreenManager({ root: document.body });   // options: backdrop (false | backdrop() options), transitionMs (750),
                                                           // reducedMotion (fn), schedule (fn), warn (fn)
ui.register({
  id: 'main-menu',                 // lowercase kebab-case
  title: 'Main menu',              // string | params => string; announced on enter
  to: ['play', 'settings'],        // REQUIRED: allowed destinations from this screen (go/open), or '*'
  presentation: 'screen',          // 'screen' (default) | 'overlay' | 'both'
  persistent: false,               // keep the instance (and its DOM/listeners) across visits
  backdrop: 'warm',                // 'warm' | 'dim' | 'fail' | 'win' | false (hide the shared backdrop, e.g. gameplay)
  keys: 'manager',                 // 'manager' (default) | 'passthrough' (screens only)
  escape: true,                    // Escape = back() / close() when this is the topmost layer
  history: true,                   // false = this screen is never a back target (see History)
  transitionMs: undefined,         // per-screen override of the manager default
  create(ctx) { /* return { el, initialFocus?, onKey?, enter?, leave?, destroy? } */ },
});
ui.validate();   // after registering everything: lists `to` ids that were never registered
```

Invalid definitions throw `TypeError` at `register`. Navigation never throws: it returns `Promise<{ ok, reason?, interrupted? }>`.
`reason` is one of `not-registered`, `not-allowed`, `wrong-presentation`, `same-screen`, `already-open`, `no-screen`, `empty-history`, `no-overlay`, `create-failed`, `destroyed`. A rejected request changes nothing.
Retrying the current screen is `same-screen`: route through an intermediate screen (the reference sheet has Retry Level and Next Level screens for exactly this).

## API

| Call | Meaning |
|---|---|
| `ui.go(id, params?, { replace, history, reset, transitionMs })` | Navigate to a screen. Closes any open overlays. Validated against the topmost layer's `to`. |
| `ui.open(id, params?, { opener, transitionMs })` | Open an overlay above the topmost layer (validated against its `to`). `opener` = element to refocus on close (default: the focused element). |
| `ui.close()` | Close the topmost overlay. |
| `ui.back()` | Closes the topmost overlay if there is one, otherwise pops history. Not validated against `to`. |
| `ui.current`, `ui.overlays`, `ui.history`, `ui.canGoBack`, `ui.transitioning` | Read-only state. |
| `ui.subscribe(fn)` | `fn({ current, overlays })` after every change; returns an unsubscribe function. |
| `ui.destroy()` | Leaves and destroys everything (persistent instances included), removes listeners and the stage. |

Declarative: inside the interactive layer, `data-go="id"`, `data-open="id"`, `data-back`, `data-close`, plus `data-params='{"level":7}'`, `data-replace`, `data-reset`, `data-no-history`. `aria-disabled="true"` elements are ignored.

## Lifecycle

`create(ctx)` returns `{ el, initialFocus?, onKey?, enter?, leave?, destroy? }`. `ctx` = `{ id, params, presentation, manager, announce(msg), listen(target, type, fn, opts), onDestroy(fn) }`. Use `ctx.listen` / `ctx.onDestroy` for anything that must be undone: it is undone automatically at `destroy`.

| Hook | When | Non-persistent | Persistent |
|---|---|---|---|
| `create(ctx)` | before the outgoing screen leaves | every visit | once |
| `enter(params, { from, reason, presentation })` | instance becomes active | every visit | every visit |
| `leave({ to, reason })` | instance stops being active (transition starts) | every visit | every visit |
| `destroy()` | after the leave transition ends | every visit | only on `ui.destroy()` |

Order for `go`: incoming `create` → outgoing `leave` → incoming `enter` → (transition) → outgoing `destroy`. The same order holds with a 0 ms transition. `reason` is `go | back | open | close | destroy`.
Presentations are never shared: the same definition shown as a screen and as an overlay gets two separate instances (`ctx.presentation` tells them apart). `open()` of the id that is the current screen is `already-open`.
A persistent instance's element is detached on `leave` and re-attached on `enter`; it keeps its state and listeners, and nothing is created again, so revisiting never duplicates DOM or listeners.
`create` throwing makes the request `create-failed` with no state change. Errors thrown by `enter`, `leave`, `destroy`, `onKey` are caught and reported through `warn`.

## Re-entrant navigation (calls made from hooks)

`create`, `enter`, `leave`, `destroy`, `onKey` and `subscribe` callbacks may call `go`, `open`, `close`, `back` or `destroy`. While the manager is mutating state, such a call is **queued** (FIFO) and runs right after the current operation has completed, so two transitions are never interleaved. The call still returns a promise, which resolves when the queued request has run.
- A queued request is validated **when it runs** (against the settled state and the then-topmost layer's `to`), not when it was made. A redirect from `create()`/`enter()` therefore needs the redirecting screen's `to` to allow the target; use `{ replace: true }` if the redirecting screen should not stay in history.
- If a queued request starts while the previous transition is still animating, that transition is finished instantly (same rule as any interruption), so the earlier promise resolves `{ ok: true, interrupted: true }`.
- `ui.destroy()` called from a hook is deferred until the running operation is done; queued requests after it resolve `destroyed`.
- Calls made outside any hook are unchanged and still run synchronously.

## History: `replace`, `history`, `reset`

Written for the screen being left (S), going to D:

1. `reset: true` empties the back stack first.
2. S is pushed only if S was recorded **and** `replace` is not set **and** `reset` is not set.
3. D becomes current and is recorded unless `history: false`, which comes from the call option, else D's definition, else `true`.
4. `back()` pops the top entry and re-creates that screen with its saved `params`.

| You want | Use |
|---|---|
| Screen X can never be reached with Back (boot, loading, gameplay, result screens) | `history: false` in X's definition |
| This one navigation should not leave S behind | `replace: true` |
| Start a fresh stack (e.g. Pause → Main menu) | `reset: true` |
| This one visit to D should not be recorded | `history: false` in the call (overrides the definition, either way) |

`reset` makes `replace` redundant. `history: false` still applies to D under `reset`. Example: gameplay and result screens defined with `history: false` mean Next Level and Retry never leave a finished puzzle in the stack, so Back from the new puzzle goes to the screen before the original one.

## Overlays

Overlays stack above the screen. Only the topmost layer is interactive: lower layers get `inert` and `aria-hidden`. On open the manager remembers the opener; on close it restores focus to it (falling back to the layer below). `go()` closes every open overlay.

## Keyboard

One `keydown` listener on `document` (bubble phase). The manager never calls `stopPropagation` and never touches the gameplay key handlers. Only the topmost layer is consulted:

1. `keys: 'passthrough'` on the topmost screen: the manager does nothing at all (no `onKey`, no Escape, no `preventDefault`, no Tab trap). The screen's own HUD buttons call `ui.open('pause')`.
2. The layer's `onKey(event, ui)`; returning `true` (or calling `preventDefault`) means handled.
3. Defaults: Escape → `back()` (screen with history) or `close()` (overlay), unless `escape: false`; Tab is trapped inside overlays.

Overlays are modal: keys they don't handle do not fall through to the screen below. Events that are already prevented, composing, or have Ctrl/Meta/Alt are ignored. Because the manager cannot stop other listeners, pausing gameplay while an overlay is open is the bridge's job (use `ui.subscribe` or the `enter`/`leave` hooks), not the manager's.

## Transitions and reduced motion

A transition is a fade driven by `data-state` (`entering` / `active` / `leaving`) and `--mp-screen-ms`, timed by a timer rather than `transitionend`. Duration: call option > definition > manager default (750 ms = `--mp-dur-screen`).
Reduced motion (`reducedMotion()`, default `prefers-reduced-motion`, read at each navigation) forces 0 ms: the navigation completes synchronously, no timer, no animated state.
Interruption: a new request first finishes the running transition instantly (outgoing destroyed/detached, incoming fully active), then runs. The interrupted request's promise resolves `{ ok: true, interrupted: true }`. At most one transition is ever in flight and exactly one screen is ever interactive.

## Backdrop and stage

The manager owns **one** `backdrop()` (no duplicate SVG ids). The screen's `backdrop` sets its variant; `false` hides it. Overlays never change it. Screens render inside `.mp-screen` wrappers in `.mp-stage` (`position: fixed`, `pointer-events: none`). A `passthrough` screen's wrapper is `pointer-events: none`, so its own controls must opt back in with `pointer-events: auto` for the canvas underneath to keep receiving pointer events.

## Known limitations

- Not integrated with `main.js`; the global prototype `style.css` (bare `button`, `h1`, `kbd`, `*:focus-visible` rules) would affect `mp-` components if both load on one page. That belongs to the bridge step.
- Focus is restored for overlays and for persistent screens. A non-persistent screen re-entered with `back()` focuses its `initialFocus`, not the previous control.
- `params` are stored by reference in history; pass plain data.
- jsdom does not implement `inert`; tests assert the attribute, and real browsers enforce it.
