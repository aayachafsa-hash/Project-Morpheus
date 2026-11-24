import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createSolvedPulse(piece, wall) {
  const settings = CONFIG.solvedPulse;
  const scoring = CONFIG.scoring;
  const color = new THREE.Color(settings.color ?? CONFIG.selection.cyan);
  const texture = new THREE.DataTexture(new Uint8Array(scoring.width * scoring.height), scoring.width, scoring.height, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      mask: { value: texture },
      cyan: { value: color },
      strength: { value: 0 },
    },
    vertexShader: `
      varying vec2 maskUV;
      void main() {
        maskUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D mask;
      uniform vec3 cyan;
      uniform float strength;
      varying vec2 maskUV;
      float silhouette(vec2 uv) {
        if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
        return texture2D(mask, uv).r;
      }
      void main() {
        float inside = silhouette(maskUV);
        gl_FragColor = vec4(cyan * strength, inside * 0.65);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(scoring.right - scoring.left, scoring.top - scoring.bottom), material);
  overlay.name = 'Solved shadow pulse';
  overlay.position.set((scoring.left + scoring.right) / 2, (scoring.bottom + scoring.top) / 2,
    new THREE.Box3().setFromObject(wall, true).max.z + 0.022);
  overlay.visible = false;
  overlay.castShadow = overlay.receiveShadow = false;
  overlay.raycast = () => {};
  const originals = new Map();
  let fired = false;
  let elapsed = 0;
  let active = false;

  function envelope(time) {
    if (time < 0 || time >= settings.attack + settings.decay) return 0;
    if (time < settings.attack) {
      const t = time / settings.attack;
      return t * t * (3 - 2 * t);
    }
    const t = (time - settings.attack) / settings.decay;
    return (1 - t) ** 3;
  }

  function restore() {
    for (const [material, original] of originals) {
      material.emissive.copy(original.color);
      material.emissiveIntensity = original.intensity;
    }
    originals.clear();
    overlay.visible = false;
    material.uniforms.strength.value = 0;
    active = false;
  }

  return {
    overlay,
    play(mask) {
      if (fired) return false;
      fired = true;
      elapsed = 0;
      active = true;
      piece.mesh.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material.emissive && !originals.has(material)) {
            originals.set(material, { color: material.emissive.clone(), intensity: material.emissiveIntensity });
          }
        }
      });
      for (let i = 0; i < texture.image.data.length; i++) texture.image.data[i] = mask[i] ? 255 : 0;
      texture.needsUpdate = true;
      return true;
    },
    reset() {
      restore();
      fired = false;
      elapsed = 0;
    },
    update(delta) {
      if (!active) return false;
      elapsed += delta;
      const level = envelope(elapsed);
      for (const [material, original] of originals) {
        material.emissive.copy(original.color).lerp(color, level);
        material.emissiveIntensity = original.intensity + settings.peakIntensity * level;
      }
      const shadowLevel = envelope(elapsed - settings.shadowDelay);
      overlay.visible = shadowLevel > 0;
      material.uniforms.strength.value = shadowLevel * settings.peakIntensity;
      if (elapsed >= settings.shadowDelay + settings.attack + settings.decay) restore();
      // Request the final frame too, so no glow remains on a stopped renderer.
      return true;
    },
  };
}
