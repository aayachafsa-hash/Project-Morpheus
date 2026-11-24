import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createFireflies(spotlight, lens, piece) {
  const settings = CONFIG.fireflies;
  const group = new THREE.Group();
  group.name = 'Projector-front fireflies';
  const origin = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const fallback = new THREE.Vector3();
  const lamp = new THREE.Vector3();
  const objectCenter = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const away = new THREE.Vector3();
  const viewport = new THREE.Vector2();
  const beamUp = new THREE.Vector3();
  let beamLength = 1;
  let slope = 1;
  let time = 0;

  function syncBeam() {
    spotlight.getWorldPosition(origin);
    spotlight.target.getWorldPosition(axis);
    axis.sub(origin);
    beamLength = axis.length();
    axis.normalize();
    slope = Math.tan(spotlight.angle);
    fallback.set(0, 1, 0).cross(axis);
    if (fallback.lengthSq() < 0.001) fallback.set(1, 0, 0);
    fallback.normalize();
    beamUp.crossVectors(axis, fallback).normalize();
    lens.getWorldPosition(lamp);
  }

  function avoidBeam(point, extraMargin = 0) {
    relative.subVectors(point, origin);
    const along = relative.dot(axis);
    const margin = settings.keepOutMargin + extraMargin;
    if (along < -margin || along > beamLength + margin) return;
    radial.copy(relative).addScaledVector(axis, -along);
    const radius = Math.max(0.12, along * slope) + margin;
    const distance = radial.length();
    if (distance >= radius) return;
    if (distance < 0.0001) radial.copy(fallback);
    else radial.multiplyScalar(1 / distance);
    point.addScaledVector(radial, radius - distance);
  }

  syncBeam();
  function setHome(home, offset) {
    home.copy(lamp).addScaledVector(axis, settings.forwardDistance + offset.z)
      .addScaledVector(fallback, offset.x).addScaledVector(beamUp, offset.y);
  }
  function stayInFront(point) {
    const along = relative.subVectors(point, lamp).dot(axis);
    if (along < 0.25) point.addScaledVector(axis, 0.25 - along);
  }

  const count = THREE.MathUtils.clamp(Math.round(settings.count), 8, 15);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const brightness = new Float32Array(count);
  const fireflies = [];
  const green = new THREE.Color(settings.glowColor);
  const amber = new THREE.Color(settings.amberColor);
  const lightCount = Math.min(4, Math.max(0, settings.lightCount), count);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = settings.clusterRadius * (0.8 + Math.random() * 0.4);
    const homeOffset = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius,
      (Math.random() - 0.5) * settings.depthSpread);
    const home = new THREE.Vector3();
    setHome(home, homeOffset);
    avoidBeam(home, 0.08);
    const color = green.clone().lerp(amber, Math.random() * 0.8);
    color.toArray(colors, i * 3);
    const light = i < lightCount ? new THREE.PointLight(color, 0, settings.lightRange, 2) : null;
    if (light) {
      light.name = 'Firefly leaf glow';
      light.castShadow = false;
      group.add(light);
    }
    fireflies.push({
      home, homeOffset, position: home.clone(), scatter: new THREE.Vector3(),
      phase: Math.random() * Math.PI * 2, speed: 0.18 + Math.random() * 0.22,
      amplitude: new THREE.Vector3(0.18 + Math.random() * 0.18, 0.15 + Math.random() * 0.2, 0.12 + Math.random() * 0.15),
      peak: light ? 1 : 0.7 + Math.random() * 0.2, light,
      attracted: i % 3 === 0,
    });
    home.toArray(positions, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const glowAttribute = new THREE.BufferAttribute(brightness, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('glow', glowAttribute);
  const material = new THREE.ShaderMaterial({
    uniforms: { pointScale: { value: 1 } },
    vertexShader: `
      uniform float pointScale;
      attribute vec3 color;
      attribute float glow;
      varying vec3 tint;
      varying float strength;
      void main() {
        tint = color;
        strength = glow;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(pointScale / max(-view.z, 0.1), 5.0, 20.0);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      varying vec3 tint;
      varying float strength;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float halo = exp(-4.5 * radius * radius) * (1.0 - smoothstep(0.65, 1.0, radius));
        float core = exp(-42.0 * radius * radius);
        gl_FragColor = vec4(tint * (1.0 + core * 2.0), strength * (halo * 0.65 + core * 0.8));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  });
  const sprites = new THREE.Points(geometry, material);
  sprites.name = 'Firefly sprites';
  sprites.frustumCulled = false;
  sprites.castShadow = false;
  sprites.raycast = () => {};
  group.add(sprites);

  function update(delta, renderer, camera, selection) {
    const dt = Math.min(delta, 0.1);
    time += dt;
    syncBeam();
    piece.mesh.getWorldPosition(objectCenter);
    renderer.getDrawingBufferSize(viewport);
    material.uniforms.pointScale.value = settings.size * viewport.y * camera.projectionMatrix.elements[5] * 0.5;
    const blend = 1 - Math.exp(-3 * dt);
    for (let i = 0; i < fireflies.length; i++) {
      const fly = fireflies[i];
      const t = time * fly.speed + fly.phase;
      setHome(fly.home, fly.homeOffset);
      goal.copy(fly.home);
      goal.x += Math.sin(t) * fly.amplitude.x;
      goal.y += Math.sin(t * 1.37 + fly.phase) * fly.amplitude.y;
      goal.z += Math.sin(t * 0.83 + fly.phase * 0.7) * fly.amplitude.z;
      if (!selection.active && fly.attracted) goal.lerp(lamp, 0.12 + 0.04 * Math.sin(t * 0.4));
      away.subVectors(fly.position, objectCenter);
      const distance = away.length();
      if (selection.active && distance < settings.scatterRadius) {
        if (distance < 0.001) away.copy(fallback);
        else away.multiplyScalar(1 / distance);
        away.multiplyScalar(0.85 * (1 - distance / settings.scatterRadius));
        fly.scatter.lerp(away, 1 - Math.exp(-5 * dt));
      } else {
        fly.scatter.multiplyScalar(Math.exp(-0.65 * dt));
      }
      goal.add(fly.scatter);
      // Anticipatory steering softens the approach. The final projection
      // guarantees even a changing spotlight cannot envelop a sprite.
      stayInFront(goal);
      avoidBeam(goal, 0.08);
      fly.position.lerp(goal, blend);
      stayInFront(fly.position);
      avoidBeam(fly.position);
      fly.position.toArray(positions, i * 3);
      const pulse = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(time * settings.pulseSpeed * (0.8 + fly.speed) + fly.phase), 2);
      brightness[i] = fly.peak * pulse;
      if (fly.light) {
        fly.light.position.copy(fly.position);
        fly.light.intensity = settings.lightIntensity * brightness[i];
      }
    }
    positionAttribute.needsUpdate = true;
    glowAttribute.needsUpdate = true;
  }

  return { group, update };
}
