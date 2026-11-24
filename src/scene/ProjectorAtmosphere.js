import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createProjectorAtmosphere(spotlight, wall) {
  const settings = CONFIG.atmosphere;
  const group = new THREE.Group();
  group.name = 'Projector haze and dust';
  const color = new THREE.Color(settings.color);
  const origin = new THREE.Vector3();
  const target = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const localForward = new THREE.Vector3(0, 0, -1);
  const wallPoint = new THREE.Vector3();
  const wallNormal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const wallBounds = new THREE.Box3();

  const geometry = new THREE.ConeGeometry(1, 1, 48, 1, true);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, -0.5);
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: color },
      opacity: { value: settings.beamOpacity },
      origin: { value: origin },
      axis: { value: axis },
      beamLength: { value: 1 },
      slope: { value: 1 },
      wallPoint: { value: wallPoint },
      wallNormal: { value: wallNormal },
    },
    vertexShader: `
      varying vec3 worldPoint;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        worldPoint = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 tint, origin, axis, wallPoint, wallNormal;
      uniform float opacity, beamLength, slope;
      varying vec3 worldPoint;
      void main() {
        vec3 ray = normalize(worldPoint - cameraPosition);
        vec3 offset = cameraPosition - origin;
        // Closest point of the view ray to the cone axis gives a soft,
        // center-weighted haze without outlining the cone's surface.
        float alignment = dot(ray, axis);
        float denominator = max(1.0 - alignment * alignment, 0.001);
        float travel = max(0.0, (alignment * dot(offset, axis) - dot(offset, ray)) / denominator);
        vec3 closest = offset + ray * travel;
        float along = dot(closest, axis);
        float radial = length(closest - axis * along) / max(along * slope, 0.001);
        float edge = 1.0 - smoothstep(0.05, 1.0, radial);
        float distanceFade = exp(-1.2 * max(along, 0.0) / beamLength);
        float ends = smoothstep(0.0, 0.012 * beamLength, along)
          * (1.0 - smoothstep(0.82 * beamLength, beamLength, along));
        vec3 surfaceNormal = normalize(cross(dFdx(worldPoint), dFdy(worldPoint)));
        float fresnel = pow(1.0 - abs(dot(surfaceNormal, -ray)), 2.0);
        float wallClip = step(0.0, dot(worldPoint - wallPoint, wallNormal));
        gl_FragColor = vec4(tint, opacity * edge * distanceFade * ends * (0.6 + 0.4 * fresnel) * wallClip);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(geometry, beamMaterial);
  beam.name = 'Faint projector beam';
  group.add(beam);

  const count = settings.dustCount;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Reserve some motes for the lamp end instead of filling mostly the far wall.
    const t = i % 3 === 0 ? 0.025 + Math.random() * 0.25 : 0.06 + Math.cbrt(Math.random()) * 0.88;
    const radius = Math.sqrt(Math.random()) * t;
    const angle = Math.random() * Math.PI * 2;
    positions.set([radius * Math.cos(angle), radius * Math.sin(angle), -t], i * 3);
    sizes[i] = 0.65 + Math.random() * 0.7;
  }
  const dustGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  dustGeometry.setAttribute('position', positionAttribute);
  dustGeometry.setAttribute('particleSize', new THREE.BufferAttribute(sizes, 1));
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: color },
      opacity: { value: settings.dustOpacity },
      pointScale: { value: 1 },
      innerCos: { value: 1 },
      outerCos: { value: 1 },
      slope: { value: 1 },
      wallPoint: { value: wallPoint },
      wallNormal: { value: wallNormal },
    },
    vertexShader: `
      uniform float pointScale, innerCos, outerCos, slope;
      uniform vec3 wallPoint, wallNormal;
      attribute float particleSize;
      varying float brightness;
      void main() {
        float along = -position.z;
        float radial = length(position.xy) / max(along, 0.001);
        float cosine = inversesqrt(1.0 + radial * radial * slope * slope);
        brightness = smoothstep(outerCos, innerCos, cosine)
          * smoothstep(0.01, 0.04, along)
          * (1.0 - smoothstep(0.85, 0.98, along));
        vec4 world = modelMatrix * vec4(position, 1.0);
        brightness *= step(0.0, dot(world.xyz - wallPoint, wallNormal));
        vec4 view = viewMatrix * world;
        gl_PointSize = clamp(pointScale * particleSize / max(-view.z, 0.1), 1.0, 3.5);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      uniform float opacity;
      varying float brightness;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float softDot = exp(-4.0 * radius * radius) * (1.0 - smoothstep(0.65, 1.0, radius));
        gl_FragColor = vec4(tint, softDot * brightness * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.name = 'Projector dust motes';
  dust.frustumCulled = false;
  beam.raycast = dust.raycast = () => {};
  // Mesh/Points defaults leave both shadow flags disabled.
  group.add(dust);
  const viewport = new THREE.Vector2();
  const offset = new THREE.Vector3();

  function update(delta, renderer, camera) {
    spotlight.updateWorldMatrix(true, false);
    spotlight.target.updateWorldMatrix(true, false);
    spotlight.getWorldPosition(origin);
    spotlight.target.getWorldPosition(target);
    axis.subVectors(target, origin).normalize();
    wall.updateWorldMatrix(true, false);
    wallBounds.setFromObject(wall, true);
    wallBounds.getCenter(wallPoint);
    wallNormal.set(0, 0, 1).applyNormalMatrix(normalMatrix.getNormalMatrix(wall.matrixWorld));
    if (wallNormal.dot(offset.subVectors(origin, wallPoint)) < 0) wallNormal.negate();
    const distance = wallNormal.dot(offset.subVectors(wallPoint, origin)) / axis.dot(wallNormal);
    const length = Math.max(0.01, distance);
    const slope = Math.tan(spotlight.angle);
    group.position.copy(origin);
    group.quaternion.setFromUnitVectors(localForward, axis);
    group.scale.set(length * slope, length * slope, length);
    beamMaterial.uniforms.beamLength.value = length;
    beamMaterial.uniforms.slope.value = slope;
    dustMaterial.uniforms.slope.value = slope;
    dustMaterial.uniforms.outerCos.value = Math.cos(spotlight.angle);
    dustMaterial.uniforms.innerCos.value = Math.cos(spotlight.angle * (1 - spotlight.penumbra));
    renderer.getDrawingBufferSize(viewport);
    dustMaterial.uniforms.pointScale.value = settings.dustSize * viewport.y * camera.projectionMatrix.elements[5] * 0.5;

    const dt = Math.min(delta, 0.1);
    const damping = Math.exp(-1.5 * dt);
    const noise = Math.sqrt(1 - damping * damping);
    for (let i = 0; i < positions.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        velocities[i + j] = damping * velocities[i + j] + noise * (Math.random() * 2 - 1);
        positions[i + j] += velocities[i + j] * dt * settings.driftSpeed / group.scale.getComponent(j);
      }
      const t = -positions[i + 2];
      if (t < 0.02) positions[i + 2] = -0.95;
      if (t > 0.96) positions[i + 2] = -0.025;
      const radius = Math.hypot(positions[i], positions[i + 1]);
      const boundary = -positions[i + 2];
      if (radius > boundary) {
        positions[i] *= -0.98 * boundary / radius;
        positions[i + 1] *= -0.98 * boundary / radius;
      }
    }
    positionAttribute.needsUpdate = true;
  }

  return { group, update };
}
