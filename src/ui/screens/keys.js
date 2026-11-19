// Keyboard routing. Pure decision logic; the manager supplies the actions.
//
// Only the TOPMOST layer is consulted (an overlay if one is open, otherwise the current screen).
// Overlays are modal, so keys they do not handle never fall through to the screen underneath.
//
//   1. layer.def.keys === 'passthrough'  -> the manager does nothing at all (no onKey, no defaults, no preventDefault).
//   2. layer's onKey(event)              -> returning true (or calling preventDefault) means handled.
//   3. manager defaults                  -> Escape = back()/close() when the layer allows it.
// Events that are already handled, composing, or carry Ctrl/Meta/Alt are ignored.
//
// Returns: 'ignored' | 'passthrough' | 'layer' | 'default' | 'unhandled'

export function routeKey(event, layer, { onKey, back, canGoBack }) {
  if (!layer) return 'ignored';
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return 'ignored';
  if (layer.def.keys === 'passthrough') return 'passthrough';
  if (onKey(layer, event) === true || event.defaultPrevented) return 'layer';
  if (event.key === 'Escape' && layer.def.escape !== false) {
    if (layer.presentation === 'overlay' || canGoBack()) { event.preventDefault(); back(); return 'default'; }
  }
  return 'unhandled';
}
