// One keyboard, two players. Binding names are the ones the solo input layer already understands, so the
// same nudge code drives both players. Pitch/Yaw tilt the object, Roll twists it, Fine slows everything down.
export const DUEL_PLAYERS = Object.freeze([
  {
    id: 'p1', name: 'Player 1',
    bindings: Object.freeze({
      PitchUp: ['KeyW'], PitchDown: ['KeyS'], YawLeft: ['KeyA'], YawRight: ['KeyD'],
      RollLeft: ['KeyQ'], RollRight: ['KeyE'], Fine: ['ShiftLeft'],
    }),
    hints: Object.freeze([
      { keys: ['W', 'A', 'S', 'D'], text: 'Rotate' }, { keys: ['Q', 'E'], text: 'Twist' }, { keys: ['Left Shift'], text: 'Fine' },
    ]),
  },
  {
    id: 'p2', name: 'Player 2',
    bindings: Object.freeze({
      PitchUp: ['ArrowUp'], PitchDown: ['ArrowDown'], YawLeft: ['ArrowLeft'], YawRight: ['ArrowRight'],
      RollLeft: ['KeyJ'], RollRight: ['KeyL'], Fine: ['ShiftRight'],
    }),
    hints: Object.freeze([
      { keys: ['↑', '↓', '←', '→'], text: 'Rotate' }, { keys: ['J', 'L'], text: 'Twist' }, { keys: ['Right Shift'], text: 'Fine' },
    ]),
  },
]);
