import { LEVELS, STARS_ENABLED, levelNumber } from '../gameplay/LevelRegistry.js';
import { starsFor } from '../gameplay/LevelProgress.js';
import { glassPanel, goldButton, levelTile, starRating } from './index.js';
import { h } from './dom.js';
import { paintReference } from './TargetThumbnail.js';

export function createLevelSelect(progress,onPlay,onBack,initial) {
  const grid=h('div',{class:'mp-level-grid','aria-label':'Puzzles'});
  const detail=glassPanel({className:'mp-level-detail'});
  const play=goldButton({label:'Play',onClick:()=>onPlay(active)});
  const back=goldButton({label:'Back',tone:'quiet',onClick:onBack});
  let active=initial;
  const tiles=LEVELS.map((level,index)=>{
    const locked=!progress.unlocked(level);
    const record=progress.record(level);
    const glyph=locked||level.glyphSvg==='fish'?null:h('span',{class:'mp-level-glyph','aria-hidden':'true'});
    glyph?.style.setProperty('--mp-level-glyph',`url("${level.glyphSvg}")`);
    const tile=levelTile({number:level.order,name:level.name,thumb:glyph,
      state:locked?'locked':record?'complete':'available',showStars:STARS_ENABLED&&Boolean(record),stars:starsFor(record),
      onClick:()=>select(index)});
    tile.addEventListener('focus',()=>select(index));
    const tooltip=locked?h('span',{id:'mp-level-lock-'+level.id,class:'mp-toolbar__tooltip mp-text-caption',role:'tooltip'},
      `Solve ${LEVELS[index-1].name} to unlock`):null;
    if(tooltip)tile.setAttribute('aria-describedby',tooltip.id);
    grid.append(h('div',{class:'mp-level-tile-wrap mp-toolbar__item'},tile,tooltip));
    return tile;
  });
  function select(index){
    active=LEVELS[index];
    const locked=!progress.unlocked(active);
    tiles.forEach((tile,i)=>{
      tile.tabIndex=i===index?0:-1;
      tile.toggleAttribute('data-mp-selected',i===index);
      tile.setAttribute('aria-pressed',String(i===index));
    });
    const label=play.querySelector('.mp-btn__label');
    label.textContent=locked?'Locked':'Play';
    play.setDisabled(locked);
    const record=progress.record(active);
    const image=h('canvas',{role:'img','aria-label':active.name+' silhouette'});
    detail.replaceChildren(...[h('h3',{class:'mp-text-title'},levelNumber(active)+' · '+active.name),
      !locked&&h('div',{class:'mp-target-tile'},image),
      locked&&h('p',{class:'mp-text-caption'},`Solve ${LEVELS[index-1].name} to unlock`),
      STARS_ENABLED&&!locked&&starRating({value:starsFor(record)}),play].filter(Boolean));
    if(!locked)paintReference(image,active.silhouetteSource).catch(()=>{
      image.replaceWith(h('p',{class:'mp-text-body'},'Preview unavailable'));
    });
  }
  grid.addEventListener('keydown',event=>{
    const i=tiles.indexOf(event.target);
    if(i<0)return;
    if(event.key==='Enter'){
      event.preventDefault();
      if(progress.unlocked(active))onPlay(active);
      return;
    }
    const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const index={Home:0,End:tiles.length-1,ArrowLeft:i-1,ArrowRight:i+1,ArrowUp:i-columns,ArrowDown:i+columns}[event.key];
    if(index==null)return;
    event.preventDefault();
    tiles[Math.max(0,Math.min(tiles.length-1,index))].focus();
  });
  const index=Math.max(0,LEVELS.indexOf(active));
  select(index);
  return {content:h('div',{class:'mp-level-select'},grid,detail,back),primary:tiles[index]};
}
