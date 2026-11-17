import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { CONFIG } from '../config.js';

export function createPieceMovement(piece) {
  const { platform, mesh } = piece;
  const positions = mesh.geometry.attributes.position;
  const points = Array.from({ length: positions.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i));
  const hull = new ConvexHull().setFromPoints(points);
  const hullPoints = new Set();
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      hullPoints.add(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  const vertices = [...hullPoints];
  const rotated = vertices.map(point => point.clone());
  const lastRotation = new THREE.Quaternion(0, 0, 0, 0);
  // The plate's elliptical rim is a 32-sided mesh. Use its inscribed ellipse.
  const rimInset = Math.cos(Math.PI / 32);
  const radiusX = platform.size.x * 0.5 * rimInset - CONFIG.movement.clearance;
  const radiusZ = platform.size.z * 0.5 * rimInset - CONFIG.movement.clearance;
  let lowest = 0;
  let footprintRadius = 0;
  let span = 0;

  function updateFootprint(rotation) {
    if (!lastRotation.equals(rotation)) {
      lowest = Infinity;
      let highest = -Infinity;
      footprintRadius = 0;
      for (let i = 0; i < vertices.length; i++) {
        const point = rotated[i].copy(vertices[i]).applyQuaternion(rotation);
        lowest = Math.min(lowest, point.y);
        highest = Math.max(highest, point.y);
        footprintRadius = Math.max(footprintRadius, Math.hypot(point.x, point.z));
      }
      span = highest - lowest;
      lastRotation.copy(rotation);
    }
  }

  function groundHeight(rotation, clearance) {
    updateFootprint(rotation);
    return platform.y + CONFIG.movement.clearance + clearance - lowest;
  }

  function containsFootprint(position, rotation) {
    updateFootprint(rotation);
    const offsetX = position.x - platform.center.x;
    const offsetZ = position.z - platform.center.z;
    return rotated.every(point => {
      const u = (point.x + offsetX) / radiusX;
      const v = (point.z + offsetZ) / radiusZ;
      return u * u + v * v <= 1;
    });
  }

  const trialPosition = new THREE.Vector3();
  const trialRotation = new THREE.Quaternion();
  function constrain(from, fromRotation, to, toRotation) {
    to.y = THREE.MathUtils.clamp(to.y, 0, CONFIG.movement.maxHeight);
    if (containsFootprint(to, toRotation)) return;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 10; i++) {
      const fraction = (low + high) / 2;
      trialPosition.lerpVectors(from, to, fraction);
      trialRotation.slerpQuaternions(fromRotation, toRotation, fraction);
      if (containsFootprint(trialPosition, trialRotation)) low = fraction;
      else high = fraction;
    }
    // Height remains independent of the footprint even when rotation or
    // translation is pinned against the rim.
    to.x = THREE.MathUtils.lerp(from.x, to.x, low);
    to.z = THREE.MathUtils.lerp(from.z, to.z, low);
    toRotation.slerpQuaternions(fromRotation, trialRotation.copy(toRotation), low);
  }

  return {
    groundHeight,
    constrain,
    getDimensions(rotation, dimensions) {
      updateFootprint(rotation);
      dimensions.set(footprintRadius, span);
    },
  };
}
