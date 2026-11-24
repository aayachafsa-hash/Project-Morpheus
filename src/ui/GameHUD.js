import { CONFIG } from '../config.js';
import { LEVELS, levelNumber } from '../gameplay/LevelRegistry.js';
import { goldButton, hudCard, objectTray } from './components/index.js';
import { createMenu } from './Menu.js';
import { createPoseReadout } from './PoseReadout.js';
import { createControlHints } from './ControlHints.js';
import { createGameState } from '../app/GameState.js';
import { createGameScreens } from './GameScreens.js';
import { paintReference } from './TargetThumbnail.js';
import { createAuthoringPanel } from './AuthoringPanel.js';

export const ENABLE_CHECK_BUTTON = false;
const $ = selector => document.querySelector(selector);

export function createUI() {
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const authoring = new URLSearchParams(location.search).get('authoring') === '1';
  if(debug) document.querySelectorAll('.mp-debug').forEach(element=>{element.hidden=false;});
  const poseReadout=debug ? createPoseReadout() : null;
  const study=$('.study'), preview=study.querySelector('.target-preview'), targetImage=$('#target');
  preview.classList.add('mp-target-tile');
  const card=hudCard({title:levelNumber(LEVELS[0])+' · '+LEVELS[0].name,media:preview});
  card.querySelector('output').setAttribute('aria-live','off');
  const controls=document.createElement('div');
  controls.className='mp-study-controls';
  controls.append(...study.children);
  card.append(controls);
  study.append(card);
  const status=$('#match-status');
  status.removeAttribute('role');
  status.classList.add('mp-text-caption');
  const dots=[...$('#progress-dots').children];
  const announce=$('#mp-match-announcement');
  const assist=$('#assist'), solution=$('#show-solution');
  const check=ENABLE_CHECK_BUTTON ? goldButton({id:'check',label:'Check Shadow',tone:'teal'}) : null;
  if(check){$('#check-action').append(check);$('#check-action').hidden=false;}
  const menu=createMenu();
  const hints=createControlHints($('.mp-binding-hints'));
  const flow=createGameState();
  const stage=$('#stage');
  let screens, authoringPanel;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let displayed=0, from=0, target=0, started=0, painted;
  let lastState, lastPaused, lastCanAssist, lastMilestone=0, tray, active;
  return {
    stage, flow,
    get debug(){return debug;},
    get authoring(){return authoring;},
    isAuthoring(level){return authoring&&level.id!=='aquafish';},
    bindAuthoring(view,shadows,readActive){
      if(authoring)authoringPanel=createAuthoringPanel(view,shadows,readActive);
    },
    bindControls(actions){
      screens=createGameScreens(flow,stage.querySelector('canvas'),$('.mp-game-layer'),$('.mp-main-menu'));
      screens.bind(actions);
      menu.bindButtons({...actions,settings:screens.settings,togglePause:screens.togglePause});
    },
    ready(){screens.ready();},
    setPaused:menu.setPaused,
    confirmDefaults(accept){screens.confirmDefaults(accept);},
    showResult(state,level,completion){screens.showResult(state,targetImage,level,completion);},
    hintsTick:hints.tick,
    setPose(pieces,index,now){
      poseReadout?.update(pieces,index,now);
      if(tray&&index!==active){tray.select(index);active=index;}
    },
    setMode(){},setRotationAxis(){},
    bindPieces(pieces, select){
      if(pieces.length<2)return;
      tray=objectTray({items:pieces.map((piece,i)=>({id:i,label:piece.mesh.name||`piece ${i+1}`,showIcon:false})),
        onSelect:select});
      study.append(tray);
    },
    setBindings(next,count,tier){
      hints.bind(next,count,tier);
      screens.setReference(next,count,tier);
    },
    async prepareTarget(level){
      const image=document.createElement('canvas');
      await paintReference(image,level.silhouetteSource);
      return image;
    },
    setLevel(level,image){
      authoringPanel?.setLevel(level);
      const title=levelNumber(level)+' · '+level.name;
      card.querySelector('.mp-hud-card__head span').textContent=title;
      card.setAttribute('aria-label',title+' match');
      targetImage.setAttribute('aria-label',level.name+' target silhouette');
      targetImage.width=image.width;targetImage.height=image.height;
      targetImage.getContext('2d').drawImage(image,0,0);
    },
    async drawTargetMask(_mask,level=LEVELS[0]){
      this.setLevel(level,await this.prepareTarget(level));
    },
    resetProgress(){
      screens.reset();
      hints.reset();
      displayed=from=target=0;
      painted=undefined;
      lastState=undefined;
      lastMilestone=0;
      announce.textContent='';
    },
    showHint(){},
    useHint(){},
    setProgress(state,message,completed,canAssist,paused){
      const now=performance.now(),next=state?.displayPercent??0;
      if(next!==target){from=displayed;target=next;started=now;}
      const t=reduced.matches ? 1 : Math.min(1,(now-started)/400);
      displayed=from+(target-from)*(1-(1-t)**3);
      const percent=state ? Math.round(displayed) : null;
      if(percent!==painted){card.update(percent);painted=percent;}
      if(state===lastState&&paused===lastPaused&&canAssist===lastCanAssist)return;
      const solved=state?.solved??completed;
      const caption=solved ? (state?.assisted?'Solved with assistance':'Solved') : paused ? 'Paused' : message;
      status.textContent=caption;
      CONFIG.scoring.progressDots.forEach((threshold,i)=>dots[i].classList.toggle('lit',next>=threshold));
      dots.at(-1).classList.toggle('lit',solved);
      assist.disabled=!canAssist;solution.disabled=paused||solved;
      if(tray)tray.inert=paused||solved;
      check?.setDisabled(paused||solved);
      const milestone=Math.floor(next/25)*25;
      if(solved&&!lastState?.solved)announce.textContent=`${caption}. ${next}% match.`;
      else if(!solved&&milestone>lastMilestone)announce.textContent=`${milestone}% match.`;
      lastMilestone=Math.max(lastMilestone,milestone);
      lastState=state;lastPaused=paused;lastCanAssist=canAssist;
    },
    setPerformance(message){if(debug)$('#performance').textContent=message;},
    showError(message){$('#error').hidden=false;$('#error').textContent=message;},
  };
}
