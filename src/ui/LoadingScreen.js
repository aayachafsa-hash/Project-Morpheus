import { getScreenTransition } from './ScreenTransition.js';

export function createLoadingScreen() {
  const screen=document.querySelector('#loading-screen');
  const bar=document.querySelector('#loading-progress');
  const fill=document.querySelector('#loading-fill');
  const percent=document.querySelector('#loading-percent');
  const status=document.querySelector('#loading-status');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let progress=0,displayed=0,velocity=0,frame=0,lastTime=0,lastNumber=-1;
  let settleResolvers=[],completion;
  const blockInput=event=>{
    if(event.target.closest?.('#loading-retry'))return;
    if((event.ctrlKey||event.metaKey)&&event.code!=='KeyZ')return;
    event.preventDefault();event.stopImmediatePropagation();
  };
  window.addEventListener('keydown',blockInput,true);
  function paint() {
    fill.style.transform=`scaleX(${displayed})`;
    const number=Math.floor(displayed*100+.0001);
    if(number!==lastNumber){percent.textContent=`${number}%`;bar.setAttribute('aria-valuenow',String(number));lastNumber=number;}
  }
  function tick(now) {
    const dt=lastTime?Math.min((now-lastTime)/1000,.064):1/60;
    lastTime=now;
    // Critically damped response keeps velocity continuous across real load events.
    const offset=displayed-progress,step=(velocity+12*offset)*dt,decay=Math.exp(-12*dt);
    const next=progress+(offset+step)*decay;
    velocity=(velocity-12*step)*decay;
    displayed=Math.max(displayed,Math.min(progress,next));
    if(reduced||progress-displayed<.0005){displayed=progress;velocity=0;}
    paint();
    if(displayed<progress)frame=requestAnimationFrame(tick);
    else {frame=0;lastTime=0;const resolvers=settleResolvers;settleResolvers=[];resolvers.forEach(resolve=>resolve());}
  }
  const api={
    update(value,message) {
      progress=Math.max(progress,Math.min(1,value));
      if(!frame)frame=requestAnimationFrame(tick);
      if(message&&message!==status.textContent){
        status.textContent=message;
        if(!reduced)status.animate([{opacity:.35},{opacity:1}],{duration:320,easing:'ease-out'});
      }
    },
    complete(onReady) {
      if(completion)return completion;
      completion=(async()=>{
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        api.update(1,'The gallery awaits');
        await new Promise(resolve=>{if(displayed===1)resolve();else settleResolvers.push(resolve);});
        await getScreenTransition().run(()=>{
          screen.remove();
          document.body.classList.remove('is-loading');
          window.removeEventListener('keydown',blockInput,true);
          onReady?.();
        },{cover:420,reveal:820,hold:100});
      })();
      return completion;
    },
  };
  return api;
}
