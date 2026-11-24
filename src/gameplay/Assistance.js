import * as THREE from 'three';
import { MAGNET_START, MAGNET_RADIUS_DEG, MAGNET_EASE_MS, MAGNET_IDLE_MS, ASSIST_DURATION_MS } from './AssistConstants.js';
// Consumer only: this module cannot modify masks, score samples, or thresholds.
export function createAssistance(pieces,solutions,invalidate) {
  const candidates=solutions.map(s=>s.rotations.map(r=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r))));
  let animation=null,lastInput=performance.now(),assistedSinceInput=false;
  function nearest(){
    let best=null;
    for(const rotations of candidates){
      if(rotations.length!==pieces.length)continue;
      const angles=pieces.map((p,i)=>p.mesh.quaternion.angleTo(rotations[i]));
      const distance=angles.reduce((sum,a)=>sum+a*a,0);
      if(!best||distance<best.distance)best={rotations,angles,distance};
    }return best;
  }
  function start(kind,now,duration,target){
    animation={kind,start:now,duration,from:pieces.map(p=>p.mesh.quaternion.clone()),to:target.rotations.map(q=>q.clone())};
  }
  return {
    input(now=performance.now()){lastInput=now;animation=null;assistedSinceInput=false;},
    assist(now=performance.now()){const target=nearest();if(!target)return;start('assist',now,ASSIST_DURATION_MS,target);},
    reset(now=performance.now()){animation=null;assistedSinceInput=false;lastInput=now;},
    get assisted(){return animation?.kind==='assist'||assistedSinceInput;},
    update(now,match,interacting,allowMagnet=true){
      if(interacting){lastInput=now;if(animation?.kind==='magnet')animation=null;}
      if(allowMagnet&&!animation&&match>=MAGNET_START&&!interacting&&now-lastInput>=MAGNET_IDLE_MS){
        const target=nearest();
        if(target&&target.angles.every(a=>a<=THREE.MathUtils.degToRad(MAGNET_RADIUS_DEG))&&target.distance>1e-10)start('magnet',now,MAGNET_EASE_MS,target);
      }
      if(!animation)return false;
      const t=Math.min(1,Math.max(0,(now-animation.start)/animation.duration));const ease=t*t*(3-2*t);
      pieces.forEach((p,i)=>{p.mesh.quaternion.slerpQuaternions(animation.from[i],animation.to[i],ease);p.targetRotation.copy(p.mesh.quaternion);});
      if(t===1){assistedSinceInput ||= animation.kind==='assist';animation=null;}
      invalidate();return true;
    },
  };
}
