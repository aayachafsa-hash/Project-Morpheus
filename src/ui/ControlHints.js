import { describeBindings } from '../gameplay/RotationInput.js';
import { h } from './dom.js';
import { icon, keyCap } from './index.js';

const mouseIcons = { MouseLeft:'mouse-left', MouseRight:'mouse-right' };
const arrows = { ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→' };
export function keyText(key) {
  const mac = /Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform ?? navigator.platform);
  return ({MouseLeft:'Left mouse',MouseRight:'Right mouse',...arrows})[key] ?? key.replace(/Key|Digit|(?<=Shift)Left|(?<=Shift)Right/g,'').replace('Control+',mac?'⌘+':'Ctrl+');
}
function keyNode(key) {
  return keyCap(mouseIcons[key] ? icon(mouseIcons[key],{label:key==='MouseLeft'?'Left mouse button':'Right mouse button'}) : keyText(key));
}
function keyNodes(keys) {
  const labels=new Set();
  return keys.filter(key=>{const label=keyText(key);if(labels.has(label))return false;labels.add(label);return true;}).map(keyNode);
}

export function controlsReference(bindings, count, tier) {
  const table=h('table',{class:'mp-control-reference'},
    h('thead',{},h('tr',{},...['Action','Mouse','Keyboard'].map(text=>h('th',{class:'mp-text-caption',scope:'col'},text)))));
  const groups=new Map();
  const order=['Rotate','Twist','Nudge','Fine','Undo','Assembly','Select'];
  for(const entry of describeBindings(bindings,{count,tier})) {
    const keys=groups.get(entry.group)??[];
    keys.push(...entry.keys);
    groups.set(entry.group,keys);
  }
  const rows=order.filter(name=>groups.has(name)).map(name=>{
    const keys=groups.get(name);
    const mouse=keyNodes(keys.filter(key=>mouseIcons[key]));
    const keyboard=keyNodes(keys.filter(key=>!mouseIcons[key]));
    return h('tr',{},h('th',{scope:'row',class:'mp-text-label'},name),
      h('td',{class:'mp-text-body'},mouse.length?mouse:'—'),h('td',{class:'mp-text-body'},keyboard.length?keyboard:'—'));
  });
  table.append(h('tbody',{},rows));
  return table;
}

export function createControlHints(root) {
  const keys=h('div',{class:'mp-hint-pill__keys'});
  const help=h('button',{type:'button',class:'mp-icon-btn mp-hint-pill__help','aria-label':'Show keyboard hints'},
    h('span',{class:'mp-icon-btn__ring mp-text-label','aria-hidden':'true'},'?'));
  root.replaceChildren(keys,help);
  let now=0, brightUntil=10000, idleSince=0, idleShown=false, shown=true, dim=false;
  const reveal=()=>{brightUntil=now+10000;};
  help.addEventListener('click',reveal);
  document.addEventListener('keydown',event=>{
    if(event.key==='?'&&!root.closest('[inert], [hidden]')&&!document.querySelector('dialog[open]'))reveal();
  });
  return {
    reset(){now=idleSince=0;brightUntil=10000;idleShown=false;},
    bind(bindings,count,tier) {
      keys.replaceChildren(...describeBindings(bindings,{count,tier,primaryOnly:true}).map(entry=>
        h('span',{class:'mp-key-hint'},keyNode(entry.keys[0]),h('span',{class:'mp-text-label'},entry.label))));
    },
    tick(time, dragging, active) {
      now=time;
      if(active){idleSince=now;idleShown=false;}
      if(!idleShown&&now-idleSince>=20000){idleShown=true;reveal();}
      if(shown===dragging){shown=!dragging;root.hidden=dragging;}
      const fade=now>=brightUntil;
      if(dim!==fade){dim=fade;root.toggleAttribute('data-dim',fade);}
    },
  };
}
