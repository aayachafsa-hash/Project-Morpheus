import * as THREE from 'three';
import { LEVELS, UNLOCK_ALL } from '../gameplay/LevelRegistry.js';
import { createLevelProgress } from '../gameplay/LevelProgress.js';
import { loadTargetMask } from '../gameplay/TargetMask.js';
import { createScoreTracker } from '../gameplay/PuzzleValidator.js';
import { createMatchState, fractionToPercent } from '../gameplay/MatchState.js';
import * as SCORING from '../gameplay/ScoringConstants.js';
import { LEVEL } from '../gameplay/PuzzleDefinition.js';
import { createInputLayer } from '../gameplay/RotationInput.js';
import { createRotationController } from '../gameplay/RotationController.js';
import { createAssistance } from '../gameplay/Assistance.js';
import { MAGNET_START } from '../gameplay/AssistConstants.js';

export async function startGameSession(view,shadows,ui,createInputSettings) {
  const pieces=view.pieces??[view.piece];
  let level=LEVELS[0];
  let target=await loadTargetMask(level.mask256);
  const progress=createLevelProgress(localStorage,ui.authoring||ui.debug&&UNLOCK_ALL);
  const tracker=createScoreTracker(SCORING);
  const { flow }=ui;
  const preferences=createInputSettings(()=>{
    input.clear();
    ui.setBindings(preferences.bindings, pieces.length, LEVEL.tier);
  },{confirmReset:ui.confirmDefaults,pieceCount:pieces.length});
  let initialRotations=[new THREE.Quaternion().setFromEuler(new THREE.Euler(...level.startPose))];
  let initialPositions=[new THREE.Vector3().fromArray(level.anchor)];
  let clockMs=0, matchState=null, result=null, pending=false, epoch=0, fault=false;
  let scoreAt=-Infinity, lastImprove=0, best=0;
  let assistance=createAssistance(pieces,level.solutions,()=>shadows.invalidateShadows());
  let usedAssist=false, usedShowSolution=false;
  let updatingInput=false, playerActive=false;
  const controls=createRotationController({view,...preferences,level:LEVEL,
    onInput(){
      if(updatingInput&&flow.canSimulate){
        playerActive=true;
        assistance.input(clockMs);
      }
    },onHint:ui.useHint,
  });
  function accept(action) {
    updatingInput=true;
    try{controls.accept(action);}finally{updatingInput=false;}
  }
  const input=createInputLayer(view.canvas,accept,preferences.settings,preferences.bindings,
    {pieceCount:pieces.length,isEnabled:()=>flow.canSimulate&&!fault});
  const selection={mode:'rotate',active:false,direction:0,paused:false,piece:pieces[0]};
  let running=false;
  flow.subscribe(()=>{
    const next=flow.canSimulate&&!fault;
    if(next!==running){
      epoch++;
      running=next;
      controls.setEnabled(next);
      input.clear();
    }
    ui.setPaused(flow.state==='paused');
  });
  controls.setEnabled(false);

  function reset(){
    epoch++;input.clear();controls.reset();view.resetSolvedPulse();
    clockMs=0;assistance.reset(clockMs);tracker.reset();
    pieces.forEach((p,i)=>{
      p.mesh.position.copy(initialPositions[i]);
      p.mesh.quaternion.copy(initialRotations[i]);
      p.targetPosition.copy(p.mesh.position);p.targetRotation.copy(p.mesh.quaternion);
    });
    usedAssist=usedShowSolution=false;fault=false;result=null;scoreAt=-Infinity;best=0;lastImprove=0;matchState=null;
    ui.resetProgress();shadows.invalidateShadows();
  }

  function resetOrientation(){
    if(!running)return;
    epoch++;input.clear();assistance.reset(clockMs);tracker.reset();result=null;matchState=null;scoreAt=-Infinity;
    controls.resetOrientation(initialRotations);
  }

  async function prepareLevel(next){
    if(next===level)return null;
    const [mask,image]=await Promise.all([loadTargetMask(next.mask256),ui.prepareTarget(next)]);
    return {mask,image,geometry:await view.prepareLevel(next)};
  }

  async function loadLevel(next,prepared){
    if(next!==level){
      const {mask,image,geometry}=prepared;
      view.replaceLevel(geometry,next);
      level=next;
      target=mask;
      initialPositions=[new THREE.Vector3().fromArray(next.anchor)];
      initialRotations=[new THREE.Quaternion().setFromEuler(new THREE.Euler(...next.startPose))];
      assistance=createAssistance(pieces,next.solutions,()=>shadows.invalidateShadows());
      shadows.initializeGuide(target);
      ui.setLevel(next,image);
    }
    reset();
    if(!ui.isAuthoring(level))progress.played(level);
  }

  function assist(show=false){
    if(!running)return;
    if(show)usedShowSolution=true;
    else usedAssist=true;
    input.clear();assistance.assist(clockMs);
  }
  ui.bindControls({reset,resetOrientation,assist:()=>assist(),showSolution:()=>assist(true),cancelCapture:preferences.cancelCapture,prepareLevel,loadLevel,progress,activeLevel:()=>level,
    hasMoves:()=>pieces.some((p,i)=>p.mesh.position.distanceToSquared(initialPositions[i])>1e-12||
      p.mesh.quaternion.angleTo(initialRotations[i])>1e-6),
    check(){scoreAt=Math.min(scoreAt,clockMs-SCORING.UPDATE_MS);},
  });
  ui.setBindings(preferences.bindings, pieces.length, LEVEL.tier);
  ui.bindPieces(pieces, index=>accept({type:'SelectIndex',index,fromTray:true}));
  ui.bindAuthoring(view,shadows,()=>({level,activePiece:controls.active}));
  await ui.drawTargetMask(target,level);
  shadows.initializeGuide(target);shadows.setGuideVisible(false);reset();view.resize();

  const clock=new THREE.Clock();let fpsFrames=0,fpsTime=0;
  view.setAnimationLoop(()=>{
    const raw=clock.getDelta(),dt=Math.min(raw,.05),now=performance.now();
    if(document.hidden||flow.state==='mainMenu')return;
    if(ui.debug){
      fpsFrames++;fpsTime+=raw;
      if(fpsTime>=1){ui.setPerformance(`${Math.round(fpsFrames/fpsTime)} FPS`);fpsFrames=0;fpsTime=0;}
    }
    if(running){
      clockMs+=dt*1000;
      input.update(dt);controls.setInertiaAllowed((result?.match??0)<MAGNET_START);
      const moved=controls.update(dt);
      assistance.update(clockMs,result?.match??0,controls.interacting,!ui.isAuthoring(level));
      ui.hintsTick(clockMs,input.dragging,playerActive||moved||controls.interacting);
      playerActive=false;
      if(LEVEL.tier===1&&clockMs-lastImprove>15000)controls.unlockTwist();
    }
    if(running&&!pending&&clockMs-scoreAt>=SCORING.UPDATE_MS){
      pending=true;scoreAt=clockMs;const version=epoch, sampledAt=clockMs;
      shadows.captureShadowMask(now).then(mask=>{
        if(!mask||version!==epoch||!running)return;
        result=tracker.push(target,mask,sampledAt);
        if(result.match>best+.005){best=result.match;lastImprove=clockMs;}
        matchState=createMatchState(result, assistance.assisted);
        if(ui.isAuthoring(level)){
          matchState={...matchState,solved:false,displayPercent:fractionToPercent(result.match)};
          return;
        }
        if(result.justSolved){
          const completion=progress.solved(level,{assisted:usedAssist||usedShowSolution||matchState.assisted,
            usedShowSolution,bestMatch:Math.round(result.match*100)});
          view.playSolvedPulse(mask);
          ui.showResult(matchState,level,completion);
        }
      }).catch(error=>{
        if(version!==epoch)return;
        ui.showError(`Silhouette scoring failed: ${error.message}`);
        fault=true;running=false;controls.setEnabled(false);input.clear();
      }).finally(()=>{pending=false;});
    }
    selection.active=running&&controls.interacting;selection.paused=!running;selection.piece=pieces[controls.active];
    ui.setPose(pieces,controls.active,now);
    ui.setProgress(matchState,'',flow.state==='solved',running,flow.state==='paused');
    view.renderSelection(selection,dt,Boolean(flow.top));
  });
}
