import * as THREE from 'three';

export function createPoseReadout() {
  const label=document.querySelector('#pose-name');
  const values=document.querySelector('#pose-values');
  const button=document.querySelector('#copy-pose');
  const fallback=document.querySelector('#pose-json');
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
  const rotation=new THREE.Euler(0,0,0,'XYZ');
  let pieces=[],active=0,lastUpdate=-Infinity,lastText='',feedbackTimer;
  const rounded=values=>values.map(value=>Number(value.toFixed(8)));
  function pose(piece) {
    piece.mesh.updateWorldMatrix(true,false);
    piece.mesh.matrixWorld.decompose(position,quaternion,scale);
    rotation.setFromQuaternion(quaternion,'XYZ');
    return {
      name:piece.mesh.name||'Piece', position:rounded(position.toArray()),
      rotation:rounded([rotation.x,rotation.y,rotation.z]), rotationOrder:'XYZ',
      quaternion:rounded(quaternion.toArray()), scale:rounded(scale.toArray()),
    };
  }
  button.addEventListener('click',async()=>{
    if(!pieces.length)return;
    // Snapshot at the click, independently of the throttled display.
    const snapshot=pieces.map(pose);
    const text=JSON.stringify({space:'world',rotationUnits:'radians',activePiece:active,
      pieces:snapshot,rotations:snapshot.map(p=>p.rotation)},null,2);
    try {
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);button.textContent='Copied';fallback.hidden=true;
    } catch {
      fallback.value=text;fallback.hidden=false;fallback.focus();fallback.select();button.textContent='Press Ctrl+C';
    }
    clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>{button.textContent='Copy pose';},1800);
  });
  return {
    update(nextPieces,index,now) {
      pieces=nextPieces;const changed=index!==active;active=index;
      if(!changed&&now-lastUpdate<100)return;
      lastUpdate=now;
      const current=pose(pieces[active]);
      const xyz=values=>values.map(value=>(Math.abs(value)<.00005?0:value).toFixed(4)).join('  ');
      const text=`Position XYZ\n${xyz(current.position)}\nRotation XYZ (degrees)\n${xyz(current.rotation.map(THREE.MathUtils.radToDeg))}\nRotation XYZ (radians)\n${xyz(current.rotation)}`;
      if(text!==lastText){values.textContent=text;lastText=text;}
      const name=`${active+1} / ${current.name}`;
      if(label.textContent!==name)label.textContent=name;
    },
  };
}
