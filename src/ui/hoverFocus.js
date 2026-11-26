/**
 * Menus keep exactly ONE active row, and that row is the focused one (CSS paints menu rows from :focus only,
 * never from :hover, so the two can never disagree).
 *
 *  - Pointer enters a row  -> focus moves there, so the highlight follows the mouse.
 *  - Pointer leaves it for something that is not a row -> focus returns to the menu's default row (PLAY in the
 *    main menu, the primary button in a dialog). Moving straight from one row to another never flashes the default.
 *  - Keyboard wins: if focus already moved away (arrow keys), or sits in a non-row control (slider, tab, input),
 *    leaving a row never steals it.
 *
 * Only menu rows follow the pointer (gold buttons and menu items); tiles, tabs and inputs keep their own behaviour.
 */
const ROW = '.mp-btn, .mp-menu-item';
const enabled = button => !button.disabled && button.getAttribute('aria-disabled') !== 'true';

/**
 * @param container element whose rows follow the pointer
 * @param home      () => the default row to fall back to (re-read on every use, so reusable dialogs can change it)
 */
export function focusOnHover(container, home = () => null) {
  let hovered = null; // the row the pointer is on, as far as this menu knows
  const rowOf = target => {
    const row = target?.closest?.(ROW);
    return row && container.contains(row) && enabled(row) ? row : null;
  };

  container.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    const row = rowOf(event.target);
    if (!row) return;
    hovered = row;
    if (document.activeElement !== row) row.focus({ preventScroll: true });
  });

  container.addEventListener('pointerout', event => {
    if (event.pointerType === 'touch' || !hovered) return;
    if (rowOf(event.relatedTarget)) return; // into another row (or a child of this one): pointerover takes over
    // Into the gap between rows (still inside this menu): keep the current row. Handing focus to the default row here
    // and taking it back a few pixels later is what made the highlight flicker. `hovered` stays set so that leaving
    // the menu from the gap still falls back to the default row.
    const to = event.relatedTarget;
    if (to && container.contains(to) && !to.closest?.(ROW)) return; // a disabled row is not a gap: it counts as nothing
    const left = hovered;
    hovered = null;
    if (document.activeElement !== left) return; // keyboard already moved on, or focus is in a non-row control
    const fallback = home();
    if (fallback && fallback !== left && fallback.isConnected && fallback.matches(ROW) && enabled(fallback)) {
      fallback.focus({ preventScroll: true });
    }
  });
}

/** ArrowUp / ArrowDown walk the rows of a menu (wrapping). Ignored when something else already handled the key. */
export function arrowNavigation(container, active = () => true) {
  container.addEventListener('keydown', event => {
    if (!active() || event.defaultPrevented || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const rows = [...container.querySelectorAll('button')].filter(enabled);
    const index = rows.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    rows[(index + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length].focus();
  });
}

/**
 * The single menu behaviour shared by the main menu and every dialog.
 * Each menu declares its default row with `home` (e.g. `{ home: () => play }`).
 */
export function menuBehaviour(container, { arrows = () => true, home = () => null } = {}) {
  focusOnHover(container, home);
  arrowNavigation(container, arrows);
}
