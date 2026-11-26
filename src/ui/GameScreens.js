import { backdrop, glassPanel, goldButton, hudCard, laurelTitle, menuItem, starRating, tabBar } from './index.js';
import { h } from './dom.js';
import { controlsReference } from './ControlHints.js';
import { createDialogManager } from './DialogManager.js';
import { getScreenTransition } from './ScreenTransition.js';
import { menuBehaviour } from './hoverFocus.js';
import { createDuelScreens } from './DuelScreens.js';

import { nextLevel, STARS_ENABLED, USE_GALLERY_MESHES } from '../gameplay/LevelRegistry.js';
import { starsFor } from '../gameplay/LevelProgress.js';
import { createLevelSelect } from './LevelSelect.js';

export const RESULTS_DELAY_MS = 1200;
const $ = selector => document.querySelector(selector);
const title = text => h('h2',{class:'mp-text-title'},text);
const rows = (...items) => h('div',{class:'mp-dialog__rows'},items);

export function createGameScreens(flow, canvas, game, menu) {
  const dialogs=createDialogManager(flow,[game,menu]);
  const transition=getScreenTransition();
  const preferences=$('#input-settings');
  const credits=$('.mp-credits');
  const creditsHeading=$('#mp-credits-title');
  const creditsLink=credits.querySelector('.gallery-link');
  let actions, reference, settingsSession, atmosphere, changing=false;
  let resultsTimer;
  const duelUi=createDuelScreens({dialogs,flow,canvas,confirm:(...args)=>confirm(...args),change:(...args)=>change(...args),
    leave:(...args)=>leave(...args),getDuel:()=>actions.duel,isChanging:()=>changing});

  async function change(apply, focus) {
    if(changing)return;
    changing=true;
    try { await transition.run(async()=>{await apply();dialogs.closeAll();});focus?.(); }
    catch(error){const alert=$('#error');alert.textContent=error.message;alert.hidden=false;}
    finally { changing=false; }
  }

  function confirm(heading, text, label, accept) {
    const cancel=goldButton({label:'Cancel',onClick:()=>dialogs.close('confirm')});
    const proceed=goldButton({label,onClick:()=>{
      dialogs.close('confirm');
      accept();
    }});
    dialogs.open('confirm',{heading:title(heading),
      content:rows(h('p',{class:'mp-text-body'},text),cancel,proceed),primary:cancel,menu:true});
  }

  function leave(next,level=actions.activeLevel(),after) {
    const apply=()=>{
      if(changing)return;
      const prepared=next==='playing'?actions.prepareLevel(level).then(data=>({data}),error=>({error})):null;
      return change(async()=>{
        if(prepared){
          const ready=await prepared;
          if(ready.error)throw ready.error;
          await actions.loadLevel(level,ready.data);
        }else actions.reset();
        if(next!==flow.state)flow.go(next);
      },next==='playing'?()=>canvas.focus():()=>{play.focus();after?.();});
    };
    if(flow.state==='paused'&&actions.hasMoves())confirm('Leave this puzzle?', 'Progress on it will be lost.', 'Leave',apply);
    else apply();
  }

  function openLevels(){
    const select=createLevelSelect(actions.progress,level=>leave('playing',level),()=>dialogs.close('levels'),actions.progress.resume());
    dialogs.open('levels',{heading:title('Levels'),...select});
  }

  function openSettings() {
    if(changing||flow.top==='settings')return;
    const launchState=flow.state;
    if(launchState==='playing')flow.go('paused');
    if(!['mainMenu','paused','playing'].includes(launchState))return;
    const close=goldButton({label:'Back',tone:'quiet',onClick:()=>dialogs.close('settings')});
    const tabs=tabBar({tabs:[{id:'controls',text:'Controls'}]});
    const referenceSlot=h('div',{},reference);
    const resetProgress=goldButton({label:'Reset progress',tone:'quiet',onClick:()=>confirm(
      'Reset progress?', 'All puzzle completions and stars will be cleared. Active play will return to the main menu.', 'Reset',()=>{
        actions.progress.reset();
        if(flow.state==='paused')change(()=>{actions.reset();flow.go('mainMenu');},()=>play.focus());
      })});
    const panel=h('div',{id:tabs.panelId('controls'),role:'tabpanel','aria-labelledby':tabs.tabId('controls')},
      referenceSlot,preferences,resetProgress);
    settingsSession=referenceSlot;
    dialogs.open('settings',{heading:title('Settings'),content:rows(tabs,panel,close),primary:tabs.querySelector('button'),
      onClose(){
        actions.cancelCapture();
        settingsSession=null;
        if(launchState==='playing'&&!changing)flow.go('playing');
      }});
  }

  function openPause() {
    if(flow.state!=='playing'||changing)return;
    if(actions.duel?.active)return duelUi.openPause();
    flow.go('paused');
    const resume=goldButton({label:'Resume',onClick:()=>dialogs.close('pause')});
    dialogs.open('pause',{heading:title('Paused'),primary:resume,menu:true,
      content:rows(resume,
        menuItem({label:'Restart puzzle',onClick:()=>leave('playing')}),
        menuItem({label:'Settings',onClick:openSettings}),
        menuItem({label:'Controls',onClick:openSettings}),
        menuItem({label:'Levels',onClick:()=>leave('mainMenu',undefined,openLevels)}),
        menuItem({label:'Main Menu',onClick:()=>leave('mainMenu')})),
      onClose(){if(!changing)flow.go('playing');}});
  }

  function openCredits() {
    const back=goldButton({label:'Back',onClick:()=>dialogs.close('credits')});
    const provenance=h('ul',{class:'mp-text-body mp-provenance'},
      h('li',{},'Aquafish and Airplane 1 are converted Shadowmatic meshes. Airplane 1 is unused in this build. Licensing is unverified.'),
      USE_GALLERY_MESHES&&h('li',{},'Teapot, Baby Carriage, Horse and Karate use the supplied Shadowmatic Gallery meshes in this academic prototype. Their target masks and poses were calibrated in Morpheus.'),
      h('li',{},'Morpheus Room is a project Blender export. Individual decor origins and licenses are unverified.'),
      h('li',{},'Projection and effects are generated by Morpheus. Selection shells reuse the Aquafish geometry.'),
      h('li',{},'The linked gallery contains converted Shadowmatic meshes from the commercial game.'));
    dialogs.open('credits',{dialog:credits,heading:creditsHeading,content:rows(
      h('p',{class:'mp-text-body'},'Morpheus · ENSAM Studios'),provenance,creditsLink,back),primary:back});
  }

  function showResult(state, target, level, completion) {
    if(!flow.go('solved'))return;
    resultsTimer=setTimeout(()=>{
      if(flow.state!=='solved')return;
      const image=h('canvas',{role:'img','aria-label':level.name+' silhouette'});
      image.width=target.width;image.height=target.height;
      image.getContext('2d').drawImage(target,0,0);
      const card=hudCard({title:level.name, value:state.displayPercent,
        media:h('div',{class:'mp-target-tile'},image)});
      const next=nextLevel(level);
      const advance=next&&goldButton({label:'Next Level',onClick:()=>leave('playing',next)});
      const replay=goldButton({label:'Play Again',tone:next?'quiet':'gold',onClick:()=>leave('playing')});
      dialogs.open('results',{heading:laurelTitle({text:'Victory',level:2}),primary:advance||replay,menu:true,
        content:rows(card,STARS_ENABLED&&starRating({value:starsFor(completion)}),
          state.assisted&&h('p',{class:'mp-text-caption'},'Solved with assistance'),advance||null,replay,
          menuItem({label:'Levels',onClick:()=>leave('mainMenu',undefined,openLevels)}),
          menuItem({label:'Main Menu',onClick:()=>leave('mainMenu')})),
        onDismiss:()=>leave('mainMenu')});
    },RESULTS_DELAY_MS);
  }

  const play=goldButton({label:'Play',onClick:()=>leave('playing',actions.progress.resume())});
  const list=rows(play,menuItem({label:'Duel',onClick:duelUi.openSetup}),menuItem({label:'Levels',onClick:openLevels}),menuItem({label:'Settings',onClick:openSettings}),menuItem({label:'Credits',onClick:openCredits}));
  menu.append(glassPanel({className:'mp-main-menu__content',children:[
    h('h1',{class:'mp-text-display'},'Morpheus'),list]}));
  menuBehaviour(list, { home: () => play }); // PLAY is the default row: active whenever no other row is hovered
  flow.subscribe(()=>{
    const visible=flow.state==='mainMenu';
    if(menu.hidden===visible){
      menu.hidden=!visible;
      game.hidden=visible;
      if(visible){atmosphere=backdrop();menu.prepend(atmosphere);}
      else {atmosphere?.destroy();atmosphere=null;}
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.defaultPrevented&&flow.escape()?.open==='pause'){
      event.preventDefault();
      openPause();
    }
  });
  const autoPause=()=>{if(flow.state==='playing'&&!flow.top)openPause();};
  window.addEventListener('blur',autoPause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});

  return {
    bind(next){actions=next;},
    settings:openSettings,
    togglePause:openPause,
    ready(){flow.go('mainMenu');play.focus();},
    reset(){clearTimeout(resultsTimer);},
    showResult,
    showDuelRound:duelUi.showRound,
    showDuelSummary:duelUi.showSummary,
    confirmDefaults(accept){confirm('Reset to defaults?', 'Your control preferences will return to their defaults.', 'Reset',accept);},
    setReference(bindings,count,tier){
      reference=controlsReference(bindings,count,tier);
      settingsSession?.replaceChildren(reference);
    },
  };
}
