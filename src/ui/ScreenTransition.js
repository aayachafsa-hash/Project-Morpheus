export const TRANSITION = { cover: 320, reveal: 640, hold: 90, easing: 'cubic-bezier(.45,0,.2,1)' };
let shared;

export function getScreenTransition() {
  if(shared)return shared;
  const curtain=document.querySelector('#screen-blackout');
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running=null;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function fade(opacity,duration) {
    const animation=curtain.animate([{opacity:curtain.style.opacity||'0'},{opacity:String(opacity)}],
      {duration:reduced()?0:duration,easing:TRANSITION.easing,fill:'forwards'});
    try { await animation.finished; }
    finally { curtain.style.opacity=String(opacity);animation.cancel(); }
  }
  const block=event=>{event.preventDefault();event.stopImmediatePropagation();};
  shared={
    run(change,options={}) {
      // Ignore duplicate clicks until the current screen change is revealed.
      if(running)return running;
      running=(async()=>{
        document.body.classList.add('is-transitioning');
        curtain.style.pointerEvents='auto';
        const events=['keydown','keyup','pointerdown','wheel'];
        events.forEach(type=>window.addEventListener(type,block,{capture:true,passive:false}));
        try {
          await fade(1,options.cover??TRANSITION.cover);
          await change();
          // New scene/UI state paints while fully hidden behind black.
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          if(!reduced())await wait(options.hold??TRANSITION.hold);
        } finally {
          try { await fade(0,options.reveal??TRANSITION.reveal); }
          finally {
            curtain.style.pointerEvents='none';
            document.body.classList.remove('is-transitioning');
            events.forEach(type=>window.removeEventListener(type,block,true));
            running=null;
          }
        }
      })();
      return running;
    },
  };
  return shared;
}
