export const INPUT_DEFAULTS = {
  SENSITIVITY_DEG_PER_PX: .38, FINE_MULT: .2, SLOW_SPEED: 80, FAST_SPEED: 650,
  // Keyboard: a tap turns NUDGE_DEG; holding a key turns smoothly at a speed that ramps from MIN to MAX (deg/s).
  SLOW_GAIN: .70, NUDGE_DEG: 2, NUDGE_FINE_DEG: .5, UNDO_DEPTH: 50,
  NUDGE_SPEED_MIN: 70, NUDGE_SPEED_MAX: 190, NUDGE_RAMP_S: .6, NUDGE_HOLD_DELAY_S: .12,
  AXIS_FRAME: 'projector', TWIST_DEAD_ZONE: 18, FLICK_SPEED: 1100, FLICK_DECAY: .075,
  sensitivity: 1, invertX: false, invertY: false, assemblyMode: 'hold', fineMode: 'hold', shadowTint: false,
};
export const DEFAULT_BINDINGS = {
  TumbleDelta: 'MouseLeft', TwistDelta: 'MouseRight', AssemblyScope: ['Space'], Fine: ['ShiftLeft','ShiftRight'],
  PitchUp: ['KeyW','ArrowUp'], PitchDown: ['KeyS','ArrowDown'], YawLeft: ['KeyA','ArrowLeft'],
  YawRight: ['KeyD','ArrowRight'], RollLeft: ['KeyQ'], RollRight: ['KeyE'], SelectNext: ['Tab'],
  SelectIndex1: ['Digit1'], SelectIndex2: ['Digit2'], SelectIndex3: ['Digit3'], Undo: ['Control+KeyZ'],
};
export const BINDING_METADATA = {
  TumbleDelta: {label:'Rotate', primary:true, priority:1, group:'Rotate'},
  TwistDelta: {label:'Twist', primary:true, priority:2, group:'Twist'},
  Fine: {label:'Fine', primary:true, priority:3, group:'Fine', minTier:3},
  Undo: {label:'Undo', primary:true, priority:4, group:'Undo', minTier:3},
  AssemblyScope: {label:'Assembly', primary:true, priority:5, group:'Assembly', multi:true, minTier:2},
  SelectNext: {label:'Switch piece', primary:true, priority:6, group:'Select', multi:true, minTier:2},
  ...Object.fromEntries(['PitchUp','PitchDown','YawLeft','YawRight'].map(name=>[name,{label:name,primary:false,priority:3,group:'Nudge'}])),
  RollLeft: {label:'Roll left',primary:false,priority:2,group:'Twist'},
  RollRight: {label:'Roll right',primary:false,priority:2,group:'Twist'},
  ...Object.fromEntries([1,2,3].map(index=>[`SelectIndex${index}`,{label:`Select piece ${index}`,primary:false,priority:6,group:'Select',multi:true,minTier:3,index}])),
};

export function describeBindings(bindings, { count = 1, tier = 3, primaryOnly = false } = {}) {
  const seen = new Set();
  return Object.entries(BINDING_METADATA)
    .filter(([,entry])=>(!entry.multi||count>1)&&tier>=(entry.minTier??1)&&
      (entry.index??0)<=count&&(!primaryOnly||entry.primary))
    .sort(([,a],[,b])=>a.priority-b.priority)
    .flatMap(([action,entry])=>{
      const keys=[bindings[action]].flat().filter(Boolean);
      const key=keys.find(value=>!seen.has(value));
      if(primaryOnly && !key)return [];
      if(primaryOnly)seen.add(key);
      return [{action,...entry,keys:primaryOnly?[key]:keys}];
    });
}
export function adaptiveGain(speed, settings) {
  const t=Math.max(0,Math.min(1,(speed-settings.SLOW_SPEED)/(settings.FAST_SPEED-settings.SLOW_SPEED)));
  return settings.SLOW_GAIN+(1-settings.SLOW_GAIN)*t*t*(3-2*t);
}
// This layer emits semantic actions only. It cannot access puzzle scores or poses.
export function createInputLayer(canvas, emit, settings, bindings, {pieceCount=1, isEnabled=()=>true}={}) {
  const held=new Map(); let drag=null, assembly=false, fine=false, hadLock=false;
  // Only real text/value controls swallow gameplay keys. A focused button (Pause, Reset, Assist, or whatever a closed
  // dialog gave focus back to) used to block every key until the canvas was clicked; it now only keeps Space/Enter.
  const editable=e=>e.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) ||
    /^(BUTTON|SUMMARY|A)$/.test(e.target.tagName)&&(e.code==='Space'||e.code==='Enter');
  const actionFor=e=>Object.entries(bindings).find(([,keys])=>Array.isArray(keys)&&keys.includes(`${e.ctrlKey||e.metaKey?'Control+':''}${e.code}`))?.[0];
  function scope(name,down,repeat=false){
    const mode=name==='AssemblyScope'?settings.assemblyMode:settings.fineMode;
    if(mode==='toggle'){if(down&&!repeat){if(name==='AssemblyScope')assembly=!assembly;else fine=!fine;}}
    else if(name==='AssemblyScope')assembly=down;else fine=down;
    emit({type:name,value:name==='AssemblyScope'?assembly:fine});
  }
  canvas.addEventListener('pointerdown',e=>{
    if(!isEnabled())return;
    const button=e.button===0?'MouseLeft':e.button===2?'MouseRight':null;
    const type=button===bindings.TumbleDelta?'TumbleDelta':button===bindings.TwistDelta?'TwistDelta':null;
    if(!type||drag)return; e.preventDefault();canvas.focus({preventScroll:true});
    drag={id:e.pointerId,type,x:e.clientX,y:e.clientY,time:e.timeStamp};
    emit({type:'Begin',x:e.clientX,y:e.clientY,gesture:type});
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    if(type==='TumbleDelta'&&canvas.requestPointerLock){
      try{const result=canvas.requestPointerLock();result?.catch(()=>{});}catch{}
    }
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const locked=document.pointerLockElement===canvas;
    const dx=locked?e.movementX:e.clientX-drag.x,dy=locked?e.movementY:e.clientY-drag.y;
    const dt=Math.max(.001,(e.timeStamp-drag.time)/1000);
    emit({type:drag.type,dx,dy,x:e.clientX,y:e.clientY,speed:Math.hypot(dx,dy)/dt,dt,assembly,fine});
    drag.x=e.clientX;drag.y=e.clientY;drag.time=e.timeStamp;
  });
  function end(e,cancel=false){
    if(!drag||e.pointerId!==drag.id)return; const id=drag.id;drag=null;
    emit({type:cancel?'Cancel':'End'});
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  }
  canvas.addEventListener('pointerup',e=>end(e));
  canvas.addEventListener('pointercancel',e=>end(e,true));
  canvas.addEventListener('lostpointercapture',e=>{if(document.pointerLockElement!==canvas)end(e,true);});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointerlockchange',()=>{
    const locked=document.pointerLockElement===canvas;
    if(!drag&&locked)document.exitPointerLock();
    if(hadLock&&!locked&&drag)end({pointerId:drag.id},true);
    hadLock=locked;
  });
  addEventListener('keydown',e=>{
    if(!isEnabled()||e.defaultPrevented||document.querySelector('dialog[open]'))return;
    const action=actionFor(e);if(!action)return;
    if(editable(e)&&!(action==='Undo'&&e.target.closest?.('.actions')))return;
    if(e.code==='Tab'&&(pieceCount<2||e.target!==canvas||e.shiftKey))return;
    e.preventDefault();
    if(action==='Fine'||action==='AssemblyScope'){scope(action,true,e.repeat);return;}
    if(e.repeat)return;
    if(/^(Pitch|Yaw|Roll)/.test(action)){
      if(!held.size)emit({type:'BeginNudge'});
      held.set(e.code,{action,time:0});
      emit({type:'Nudge',axis:action,assembly,fine,degrees:(fine?settings.NUDGE_FINE_DEG:settings.NUDGE_DEG)*(settings.sensitivity??1)});
    }else if(action==='SelectNext')emit({type:'SelectNext'});
    else if(action.startsWith('SelectIndex'))emit({type:'SelectIndex',index:Number(action.at(-1))-1});
    else emit({type:action});
  });
  addEventListener('keyup',e=>{
    // Track physical release even when focus or modifiers changed mid-gesture.
    const plain=Object.entries(bindings).find(([,keys])=>Array.isArray(keys)&&keys.includes(e.code))?.[0];
    if(plain==='Fine'||plain==='AssemblyScope')scope(plain,false);
    if(held.delete(e.code)&&!held.size)emit({type:'EndNudge'});
  });
  function clear(){if(drag)end({pointerId:drag.id},true);held.clear();assembly=fine=false;emit({type:'Cancel'});emit({type:'AssemblyScope',value:false});emit({type:'Fine',value:false});}
  addEventListener('blur',clear);document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  return {clear,get dragging(){return Boolean(drag);},update(dt){for(const item of held.values()){
    item.time+=dt;
    if(item.time<settings.NUDGE_HOLD_DELAY_S)continue;
    // Time-based, so the turn rate is the same at 30 and 144 fps.
    const t=Math.min(1,(item.time-settings.NUDGE_HOLD_DELAY_S)/settings.NUDGE_RAMP_S);
    const speed=settings.NUDGE_SPEED_MIN+(settings.NUDGE_SPEED_MAX-settings.NUDGE_SPEED_MIN)*t*t*(3-2*t);
    emit({type:'Nudge',axis:item.action,assembly,fine,degrees:speed*dt*(settings.sensitivity??1)*(fine?settings.FINE_MULT:1)});
  }}};
}
