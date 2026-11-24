import { CONFIG } from '../config.js';
import { LEVEL } from './PuzzleDefinition.js';
import teapot from '../assets/levels/teapot/level.json' with {type:'json'};
import teapotGallery from '../assets/levels/teapot/gallery/level.json' with {type:'json'};
import carriage from '../assets/levels/baby-carriage/level.json' with {type:'json'};
import carriageGallery from '../assets/levels/baby-carriage/gallery/level.json' with {type:'json'};
import horse from '../assets/levels/horse/level.json' with {type:'json'};
import horseGallery from '../assets/levels/horse/gallery/level.json' with {type:'json'};
import karate from '../assets/levels/karate/level.json' with {type:'json'};
import karateGallery from '../assets/levels/karate/gallery/level.json' with {type:'json'};
import originalFish from '../assets/levels/aquafish-original/level.json' with {type:'json'};

export const USE_ORIGINAL_AQUAFISH = false;
export const USE_GALLERY_MESHES = true;
export const UNLOCK_ALL = false;
export const STARS_ENABLED = true;

const legacy = {
  id:'aquafish', order:1, name:'Aquafish', difficulty:1, pieces:1,
  silhouetteSource:CONFIG.puzzle.referenceImage, mask256:CONFIG.puzzle.targetMask, glyphSvg:CONFIG.puzzle.referenceImage,
  mesh:CONFIG.puzzle.url, scale:CONFIG.puzzle.size, anchor:LEVEL.anchors[0],
  startPose:CONFIG.initial.rotation, solutions:LEVEL.solutions, format:'glb',
};
const asset=(directory,file)=>new URL(`../assets/levels/${directory}/${file}`,import.meta.url).href;
function original(id,order,name,data,directory=id) {
  return {
    ...data,id,order,name,difficulty:order,pieces:1,format:'geometry',
    silhouetteSource:asset(directory,'thumbnail.png'),mask256:asset(directory,'mask.png'),
    glyphSvg:asset(directory,'glyph.svg'),mesh:asset(directory,'mesh.json'),
  };
}

function puzzle(id,order,name,originalData,galleryData) {
  if(!USE_GALLERY_MESHES)return original(id,order,name,originalData);
  return {...original(id,order,name,galleryData,id+'/gallery'),
    format:'glb',mesh:asset(id+'/gallery','mesh.glb')};
}

export const LEVELS = Object.freeze([
  USE_ORIGINAL_AQUAFISH ? original('aquafish',1,'Aquafish',originalFish,'aquafish-original') : legacy,
  puzzle('teapot',2,'Teapot',teapot,teapotGallery),
  puzzle('baby-carriage',3,'Baby Carriage',carriage,carriageGallery),
  puzzle('horse',4,'Horse',horse,horseGallery),
  puzzle('karate',5,'Karate',karate,karateGallery),
].map(Object.freeze));
export const nextLevel=level=>LEVELS[LEVELS.indexOf(level)+1]??null;
export const levelNumber=level=>String(level.order).padStart(2,'0');
