import * as THREE from 'three';
import { adaptiveGain } from './RotationInput.js';
export function createRotationController({view,settings,bindings,level,onInput,onHint}) {
  const pieces=view.pieces??[view.piece],canvas=view.canvas;
  let active=0,assembly=false,fine=false,gesture=false,changed=false,pending=[],lastTwist=null,inertia=null,enabled=true;
  let inertiaAllowed=true,twistUnlocked=level.tier>1;
  const stack=[];const ray=new THREE.Raycaster();const pointer=new THREE.Vector2();
  const frameQuaternion=new THREE.Quaternion(),frameMatrix=new THREE.Matrix4();
  const origin=new THREE.Vector3(),target=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  const axes=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  const center=new THREE.Vector3(),deltaQuaternion=new THREE.Quaternion();
  const allIndices=pieces.map((_,i)=>i),activeIndices=[0];
  const snapshot=()=>pieces.map(p=>({position:p.mesh.position.clone(),quaternion:p.mesh.quaternion.clone()}));
  let before=null;
  const save=()=>{if(before&&changed){stack.push(before);if(stack.length>settings.UNDO_DEPTH)stack.shift();}before=null;changed=false;};
  function select(index){active=(index+pieces.length)%pieces.length;activeIndices[0]=active;pieces.forEach((p,i)=>{p.outline.visible=i===active;});onHint('selection');view.invalidateRender();}
  function frame(){
    if(settings.AXIS_FRAME==='camera')return view.camera.getWorldQuaternion(frameQuaternion);
    view.spotlight.getWorldPosition(origin);view.spotlight.target.getWorldPosition(target);
    frameMatrix.lookAt(origin,target,up);
    return frameQuaternion.setFromRotationMatrix(frameMatrix);
  }
  const axis=i=>axes[i].set(i===0?1:0,i===1?1:0,i===2?-1:0).applyQuaternion(frame()).normalize();
  function scopeIndices(whole){
    if(!whole||level.tier<2)return activeIndices;
    const group=level.tier>=4?level.linkedGroups?.find(g=>g.includes(active)):null;
    return group??allIndices;
  }
  function rotate(index,angle,whole){
    if(level.tier>=4 && scopeIndices(whole).some(i=>level.lockedAxes?.[i]?.includes(['pitch','yaw','roll'][index])))return;
    if(!angle)return;
    const indices=scopeIndices(whole);center.set(0,0,0);
    indices.forEach(i=>center.add(pieces[i].mesh.position));center.multiplyScalar(1/indices.length);
    const q=deltaQuaternion.setFromAxisAngle(axis(index),angle);
    for(const i of indices){const p=pieces[i];p.mesh.quaternion.premultiply(q).normalize();
      if(indices.length>1)p.mesh.position.sub(center).applyQuaternion(q).add(center);
      p.targetRotation.copy(p.mesh.quaternion);p.targetPosition.copy(p.mesh.position);
    }
    changed=true;view.invalidateShadows();
  }
  function accept(a){
    if(a.type==='AssemblyScope'||a.type==='Fine'){
      if(a.type==='AssemblyScope')assembly=a.value;else fine=a.value;
      inertia=null;pending=[];lastTwist=null;onInput();onHint(a.type==='Fine'?'fine':'assembly');return;
    }
    if(a.type==='Cancel'){pending=[];inertia=null;lastTwist=null;gesture=false;save();return;}
    if(!enabled)return;
    onInput();
    if(a.type==='Begin'||a.type==='BeginNudge'){
      save();before=snapshot();gesture=true;inertia=null;lastTwist=null;
      if(a.type==='Begin'){
        const rect=canvas.getBoundingClientRect();pointer.set((a.x-rect.left)/rect.width*2-1,-(a.y-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,view.camera);
        const hit=ray.intersectObjects(pieces.map(p=>p.mesh),false)[0];if(hit&&level.tier>=2)select(pieces.findIndex(p=>p.mesh===hit.object));
      }return;
    }
    if(a.type==='End'||a.type==='EndNudge'){
      // Pending deltas from the release frame are deliberately discarded.
      pending=[];gesture=false;lastTwist=null;
      if(a.type==='EndNudge'||fine||assembly||!inertiaAllowed||performance.now()-(inertia?.lastMotion??0)>80)inertia=null;
      save();return;
    }
    if(a.type==='SelectNext'){if(level.tier>=2)select(active+1);return;}
    if(a.type==='SelectIndex'){if((level.tier>=3||a.fromTray)&&a.index<pieces.length)select(a.index);return;}
    if(a.type==='Undo'){
      if(level.tier<3)return;pending=[];inertia=null;save();const previous=stack.pop();
      previous?.forEach((pose,i)=>{pieces[i].mesh.position.copy(pose.position);pieces[i].mesh.quaternion.copy(pose.quaternion);pieces[i].targetRotation.copy(pose.quaternion);pieces[i].targetPosition.copy(pose.position);});view.invalidateShadows();onHint('undo');return;
    }
    if(a.type==='Nudge'){
      const index=a.axis.startsWith('Pitch')?0:a.axis.startsWith('Yaw')?1:2;
      if(index===2&&!twistUnlocked)return;
      const direction=/Up|Right/.test(a.axis)?1:-1;
      rotate(index,THREE.MathUtils.degToRad((a.fine?settings.NUDGE_FINE_DEG:settings.NUDGE_DEG)*direction),a.assembly);onHint('tumble');return;
    }
    if(a.type==='TumbleDelta'||a.type==='TwistDelta')pending.push(a);
  }
  select(0);
  return {accept,
    get active(){return active;},get interacting(){return gesture;},
    setEnabled(value){enabled=value;if(!value)accept({type:'Cancel'});},
    setInertiaAllowed(value){inertiaAllowed=value;if(!value)inertia=null;},
    unlockTwist(){twistUnlocked=true;},
    resetOrientation(rotations) {
      accept({type:'Cancel'});
      before=snapshot();
      pieces.forEach((piece,i)=>{
        changed ||= piece.mesh.quaternion.angleTo(rotations[i]) > 1e-7;
        piece.mesh.quaternion.copy(rotations[i]);
        piece.targetRotation.copy(rotations[i]);
      });
      save();
      view.invalidateShadows();
    },
    reset(){pending=[];inertia=null;stack.length=0;before=null;gesture=false;changed=false;select(0);},
    update(dt){
      if(!enabled)return false;let moved=false;
      for(const a of pending){
        const gain=settings.SENSITIVITY_DEG_PER_PX*settings.sensitivity*(a.fine?settings.FINE_MULT:adaptiveGain(a.speed,settings));
        if(a.type==='TumbleDelta'){
          const pitch=THREE.MathUtils.degToRad(a.dy*gain*(settings.invertY?-1:1));
          const yaw=THREE.MathUtils.degToRad(a.dx*gain*(settings.invertX?-1:1));
          rotate(1,yaw,a.assembly);rotate(0,pitch,a.assembly);onHint('tumble');
          inertia=!a.fine&&!a.assembly&&a.speed>settings.FLICK_SPEED&&inertiaAllowed?{pitch:pitch/a.dt,yaw:yaw/a.dt,time:0,lastMotion:performance.now()}:null;
        }else if(twistUnlocked){
          const rect=canvas.getBoundingClientRect();const p=pieces[active].mesh.getWorldPosition(new THREE.Vector3()).project(view.camera);
          const x=a.x-(rect.left+(p.x+1)*rect.width/2),y=a.y-(rect.top+(1-p.y)*rect.height/2);
          const angle=Math.atan2(y,x);
          if(Math.hypot(x,y)>settings.TWIST_DEAD_ZONE){if(lastTwist!==null){const d=Math.atan2(Math.sin(angle-lastTwist),Math.cos(angle-lastTwist));rotate(2,d*settings.sensitivity*(a.fine?settings.FINE_MULT:adaptiveGain(a.speed,settings)),a.assembly);}lastTwist=angle;}else lastTwist=null;
          inertia=null;onHint('twist');
        }moved=true;
      }pending=[];
      if(!gesture&&inertia&&inertiaAllowed){
        const duration=settings.FLICK_DECAY;const step=duration*(Math.exp(-inertia.time/duration)-Math.exp(-(inertia.time+dt)/duration));
        rotate(1,inertia.yaw*step,false);rotate(0,inertia.pitch*step,false);inertia.time+=dt;moved=true;if(inertia.time>duration*3)inertia=null;
      }
      return moved;
    },
  };
}

