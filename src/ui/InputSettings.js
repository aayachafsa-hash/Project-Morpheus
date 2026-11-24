import { INPUT_DEFAULTS, DEFAULT_BINDINGS, BINDING_METADATA } from '../gameplay/RotationInput.js';
import { goldButton, styleSlider } from './components/index.js';
import { keyText } from './ControlHints.js';
export function createInputSettings(onChange, {confirmReset, pieceCount=1}={}) {
  let saved={};try{saved=JSON.parse(localStorage.getItem('morpheus.rotation')??'{}');}catch{}
  // Persist user preferences, not old internal response constants.
  const settings={...INPUT_DEFAULTS};
  for(const key of ['sensitivity','invertX','invertY','AXIS_FRAME','assemblyMode','fineMode']){
    if(saved.settings?.[key]!==undefined)settings[key]=saved.settings[key];
  }
  const bindings={...structuredClone(DEFAULT_BINDINGS),...saved.bindings};
  const bindingButtons=new Map();
  const fields=new Map();
  let cancelCapture;
  const panel=document.querySelector('#input-settings');
  function save(){try{localStorage.setItem('morpheus.rotation',JSON.stringify({settings,bindings}));}catch{}onChange?.();}
  for(const [key,label,type] of [
    ['sensitivity','Sensitivity','range'],['invertX','Invert horizontal','checkbox'],['invertY','Invert vertical','checkbox'],
    ['AXIS_FRAME','Rotation frame','frame'],['assemblyMode','Assembly modifier','mode'],['fineMode','Fine modifier','mode'],
  ]){
    if(key==='assemblyMode'&&pieceCount<2)continue;
    const row=document.createElement('label');row.className='mp-text-body';row.textContent=label+' ';
    const field=document.createElement(type==='mode'||type==='frame'?'select':'input');
    if(type==='mode'||type==='frame')for(const value of type==='frame'?['projector','camera']:['hold','toggle']){const option=document.createElement('option');option.value=option.textContent=value;field.append(option);}
    else field.type=type;
    if(type==='range'){field.min='.25';field.max='2';field.step='.05';}
    let refreshSlider;
    const refresh=()=>{if(type==='checkbox')field.checked=settings[key];else field.value=settings[key];refreshSlider?.();};
    refresh();fields.set(key,refresh);
    if(type==='range')refreshSlider=styleSlider(field);
    field.addEventListener('input',()=>{settings[key]=type==='checkbox'?field.checked:type==='range'?Number(field.value):field.value;save();});
    row.append(field);panel.append(row);
  }
  const help=document.createElement('small');help.className='mp-text-body';help.textContent='Select a binding, then press its replacement. Escape cancels.';panel.append(help);
  for(const action of Object.keys(bindings)){
    if(!BINDING_METADATA[action] || BINDING_METADATA[action].multi && pieceCount<2)continue;
    const row=document.createElement('label');row.className='mp-text-body';row.textContent=BINDING_METADATA[action].label+' ';
    const button=goldButton({tone:'quiet',chevron:false});
    const text=button.querySelector('.mp-btn__label');
    button.setAttribute('aria-label',`Rebind ${BINDING_METADATA[action].label}`);
    const label=()=>{text.textContent=([...new Set([bindings[action]].flat().filter(Boolean).map(keyText))].join(' / ')||'Unbound');};
    label();bindingButtons.set(action,label);
    button.addEventListener('click',()=>{
      cancelCapture?.();
      text.textContent='Press a key or mouse button';
      const mouse=action==='TumbleDelta'||action==='TwistDelta';
      const capture=e=>{
        if(!mouse && e.type!=='keydown')return;
        if(mouse && e.type!=='pointerdown' && e.code!=='Escape')return;
        e.preventDefault();e.stopImmediatePropagation();
        const key=mouse?(e.button===0?'MouseLeft':e.button===2?'MouseRight':null):`${e.ctrlKey||e.metaKey?'Control+':''}${e.code}`;
        if(e.code!=='Escape'&&key){
          if(mouse){const other=action==='TumbleDelta'?'TwistDelta':'TumbleDelta';if(bindings[other]===key)bindings[other]=bindings[action];bindings[action]=key;}
          else {
            for(const [other,keys] of Object.entries(bindings))if(other!==action&&Array.isArray(keys))bindings[other]=keys.filter(value=>value!==key);
            bindings[action]=[key];
          }
          bindingButtons.forEach(refresh=>refresh());save();
        }
        cancelCapture();
      };
      cancelCapture=()=>{
        window.removeEventListener('keydown',capture,true);window.removeEventListener('pointerdown',capture,true);label();
        cancelCapture=null;
      };
      window.addEventListener('keydown',capture,true);window.addEventListener('pointerdown',capture,true);
    });row.append(button);panel.append(row);
  }
  panel.append(goldButton({label:'Reset to defaults',tone:'quiet',chevron:false,onClick:()=>confirmReset?.(()=>{
    Object.assign(settings,INPUT_DEFAULTS);
    Object.assign(bindings,structuredClone(DEFAULT_BINDINGS));
    fields.forEach(refresh=>refresh());
    bindingButtons.forEach(refresh=>refresh());
    save();
  })}));
  return {settings,bindings,cancelCapture:()=>cancelCapture?.()};
}

