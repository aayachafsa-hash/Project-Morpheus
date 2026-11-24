import * as THREE from 'three';
// A brief geometric selection pulse, then a steady cyan rim. No idle redraw loop.
export function createSelectionGizmo(piece) {
  const gizmo=new THREE.Group();gizmo.visible=false;
  let selected=null,time=0;
  return {gizmo,update(selection,delta){
    const next=selection.piece??piece;
    if(next!==selected){if(selected)selected.outline.scale.setScalar(1);selected=next;time=0;}
    selected.outline.visible=true;
    const wasPulsing=time<.8;time+=delta;
    const scale=selection.paused||time>=.8?1:1+.009*Math.sin(Math.PI*time/.8);
    selected.outline.scale.setScalar(scale);
    return !selection.paused && wasPulsing;
  }};
}
