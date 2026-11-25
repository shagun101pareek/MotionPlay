import * as THREE from 'three';

export function createRacket(rubberColor: number, scale = 1): THREE.Group {
  const root = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xc2a06a, roughness: 0.48, metalness: 0.04 });
  const rubber = new THREE.MeshStandardMaterial({ color: rubberColor, roughness: 0.52, metalness: 0.02 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.78 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * scale, 0.017 * scale, 0.11 * scale, 12), grip);
  handle.position.y = 0.02 * scale;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.078 * scale, 0.08 * scale, 0.009 * scale, 32), rubber);
  blade.rotation.x = Math.PI / 2;
  blade.position.set(0, 0.118 * scale, 0);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.076 * scale, 0.0045 * scale, 6, 32), wood);
  edge.position.copy(blade.position);
  root.add(handle, blade, edge);
  blade.castShadow = true;
  return root;
}

/** First-person arm and racket, matching a natural holding pose. */
export function createPlayerRacket(): THREE.Group {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a57c, roughness: 0.58 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a3344, roughness: 0.72 });

  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.18, 4, 10), skin);
  forearm.position.set(0.02, -0.16, 0.12);
  forearm.rotation.x = 1.12;
  forearm.rotation.z = 0.22;

  const cuff = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.05, 3, 10), sleeve);
  cuff.position.set(0.05, -0.28, 0.2);
  cuff.rotation.x = 1.05;
  cuff.rotation.z = 0.18;

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 12), skin);
  hand.scale.set(1.1, 0.7, 1.2);
  hand.position.set(0.01, -0.03, 0.01);

  const racket = createRacket(0x14171c, 1.05);
  racket.position.set(0, 0.03, -0.01);
  racket.rotation.x = -0.12;
  racket.rotation.z = -0.08;
  root.add(cuff, forearm, hand, racket);
  return root;
}
