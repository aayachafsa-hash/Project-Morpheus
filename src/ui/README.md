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
