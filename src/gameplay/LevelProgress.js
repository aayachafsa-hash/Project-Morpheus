import { LEVELS } from './LevelRegistry.js';

export const PROGRESS_KEY='morpheus.progress';
const VERSION=1;
const fresh=()=>({version:VERSION,lastPlayed:null,levels:{}});

export function readProgress(value) {
  try {
    const parsed=JSON.parse(value);
    if(!parsed||![0,VERSION].includes(parsed.version)||typeof parsed.levels!=='object'||!parsed.levels)return fresh();
    const data=fresh();
    const known=new Set(LEVELS.map(level=>level.id));
    data.lastPlayed=known.has(parsed.lastPlayed)?parsed.lastPlayed:null;
    for(const [id,record] of Object.entries(parsed.levels)){
      if(!known.has(id)||!record||record.solved!==true)continue;
      data.levels[id]={
        solved:true,assisted:record.assisted===true,usedShowSolution:record.usedShowSolution===true,
        bestMatch:Number.isFinite(record.bestMatch)?Math.min(100,Math.max(0,record.bestMatch)):0,
        firstSolvedAt:typeof record.firstSolvedAt==='string'&&!Number.isNaN(Date.parse(record.firstSolvedAt))?record.firstSolvedAt:null,
      };
    }
    return data;
  }catch{return fresh();}
}

export const starsFor=record=>!record?.solved?0:record.usedShowSolution?1:record.assisted?2:3;

export function createLevelProgress(storage, unlockAll=false) {
  let data;
  try{data=readProgress(storage.getItem(PROGRESS_KEY));}catch{data=fresh();}
  function save(){try{storage.setItem(PROGRESS_KEY,JSON.stringify(data));}catch{}}
  return {
    record:level=>data.levels[level.id],
    unlocked(level){return unlockAll||LEVELS.slice(0,LEVELS.indexOf(level)).every(previous=>data.levels[previous.id]?.solved);},
    resume(){return LEVELS.find(level=>!data.levels[level.id]?.solved)??LEVELS.find(level=>level.id===data.lastPlayed)??LEVELS[0];},
    played(level){data.lastPlayed=level.id;save();},
    solved(level,{assisted,usedShowSolution,bestMatch}){
      const previous=data.levels[level.id];
      const result={solved:true,assisted,usedShowSolution,bestMatch,firstSolvedAt:previous?.firstSolvedAt??new Date().toISOString()};
      const medal=starsFor(previous)>starsFor(result)?previous:result;
      data.levels[level.id]={...medal,bestMatch:Math.max(bestMatch,previous?.bestMatch??0)};
      save();
      return result;
    },
    reset(){data=fresh();save();},
  };
}
