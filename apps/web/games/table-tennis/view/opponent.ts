import * as THREE from 'three';
import { clamp } from '@motionplay/shared';
import { TABLE } from '../TableTennisPhysics';
import type { OpponentAnim } from '../TableTennisAI';
import { createRacket } from './racket';

export interface OpponentVisual {
  x: number;
  anim: OpponentAnim;
  swing: number;
  hand: 'forehand' | 'backhand';
  ballX: number;
  ballY: number;
  ballZ: number;
}

interface Rig {
  object: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  armR: THREE.Group;
  elbowR: THREE.Group;
  armL: THREE.Group;
  elbowL: THREE.Group;
  thighL: THREE.Group;
  shinL: THREE.Group;
  thighR: THREE.Group;
  shinR: THREE.Group;
}

export function createOpponent(): { object: THREE.Group; apply: (visual: OpponentVisual, time: number) => void } {
  const rig = buildRig();
  return {
    object: rig.object,
    apply(visual, time) {
      rig.object.position.set(visual.x, 0, TABLE.halfLength + 0.4);
      const pose = poseFor(visual, time);
      const breath = Math.sin(time * 1.7) * 0.006;
      rig.chest.position.y = 1.02 + breath;
      rig.chest.rotation.set(pose.pitch, pose.yaw, pose.roll);
      rig.head.rotation.set(pose.headPitch, pose.headYaw, 0);
      rig.armR.rotation.set(pose.armR[0], pose.armR[1], pose.armR[2]);
      rig.elbowR.rotation.set(pose.elbowR, 0, 0);
      rig.armL.rotation.set(pose.armL[0], pose.armL[1], pose.armL[2]);
      rig.elbowL.rotation.set(pose.elbowL, 0, 0);
      rig.thighL.rotation.set(pose.hipL, 0, 0.04);
      rig.shinL.rotation.set(pose.kneeL, 0, 0);
      rig.thighR.rotation.set(pose.hipR, 0, -0.04);
      rig.shinR.rotation.set(pose.kneeR, 0, 0);
    },
  };
}

function buildRig(): Rig {
  const skin = standard(0xd2a07a, 0.58);
  const shirt = standard(0x8d939b, 0.62);
  const jeans = standard(0x3b5f8a, 0.7);
  const shoeMat = standard(0xf2f2f0, 0.42);
  const hairMat = standard(0x1a130f, 0.75);
  const object = new THREE.Group();
  const chest = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.2), shirt);
  torso.position.y = 0.2;
  torso.castShadow = true;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skin);
  neck.position.y = 0.45;
  chest.add(torso, neck);
  const head = new THREE.Group();
  head.position.y = 0.52;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), skin);
  skull.castShadow = true;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 12), hairMat);
  hair.position.set(0, 0.035, 0.02);
  hair.scale.set(1.02, 0.62, 0.92);
  const eyeMat = standard(0x1a1d24, 0.4);
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), eyeMat);
  leftEye.position.set(0.038, 0.02, -0.1);
  const rightEye = leftEye.clone();
  rightEye.position.x = -0.038;
  head.add(skull, hair, leftEye, rightEye);
  chest.add(head);

  const armR = hang(0.26, 0.042, shirt);
  armR.position.set(-0.22, 0.36, 0.02);
  const elbowR = hang(0.24, 0.036, skin);
  elbowR.position.y = -0.26;
  const racket = createRacket(0x9d1c28, 1);
  racket.position.set(0, -0.28, -0.02);
  racket.rotation.x = 1.25;
  elbowR.add(racket);
  armR.add(elbowR);

  const armL = hang(0.28, 0.045, shirt);
  armL.position.set(0.24, 0.38, 0);
  const elbowL = hang(0.26, 0.038, skin);
  elbowL.position.y = -0.28;
  armL.add(elbowL);
  chest.add(armR, armL);

  const thighL = hang(0.42, 0.055, jeans, 8);
  thighL.position.set(0.1, 0.92, 0);
  const shinL = hang(0.4, 0.045, jeans, 8);
  shinL.position.y = -0.42;
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.18), shoeMat);
  shoeL.position.set(0, -0.42, -0.03);
  shinL.add(shoeL);
  thighL.add(shinL);

  const thighR = hang(0.42, 0.055, jeans, 8);
  thighR.position.set(-0.1, 0.92, 0);
  const shinR = hang(0.4, 0.045, jeans, 8);
  shinR.position.y = -0.4;
  const shoeR = shoeL.clone();
  shinR.add(shoeR);
  thighR.add(shinR);

  object.add(chest, thighL, thighR);
  return { object, chest, head, armR, elbowR, armL, elbowL, thighL, shinL, thighR, shinR };
}

interface Pose {
  pitch: number;
  yaw: number;
  roll: number;
  headPitch: number;
  headYaw: number;
  armR: [number, number, number];
  elbowR: number;
  armL: [number, number, number];
  elbowL: number;
  hipL: number;
  kneeL: number;
  hipR: number;
  kneeR: number;
}

function poseFor(visual: OpponentVisual, time: number): Pose {
  const ready = basePose(visual);
  const stride = visual.anim === 'move' ? Math.sin(time * 7) * 0.28 : 0;
  ready.hipL += stride;
  ready.hipR -= stride;
  ready.kneeL = 0.22 + Math.max(0, stride);
  ready.kneeR = 0.22 + Math.max(0, -stride);
  if (visual.anim === 'win') {
    return { ...ready, pitch: -0.18, armR: [-1.15, 0.1, 0.2], elbowR: 0.2, armL: [-0.4, 0, -0.2], elbowL: 0.3 };
  }
  if (visual.anim === 'lose') {
    return { ...ready, pitch: 0.28, yaw: 0.15, headPitch: 0.35, armR: [0.4, 0.1, 0.7], elbowR: 1.2 };
  }
  if (visual.anim === 'recover') {
    const follow = visual.hand === 'backhand' ? backhandPose(1) : forehandPose(1);
    return blend(follow, ready, 1 - visual.swing);
  }
  if (visual.anim === 'forehand' || visual.anim === 'forehand-prep') {
    return forehandPose(visual.anim === 'forehand-prep' ? 0.08 : visual.swing);
  }
  if (visual.anim === 'backhand' || visual.anim === 'backhand-prep') {
    return backhandPose(visual.anim === 'backhand-prep' ? 0.08 : visual.swing);
  }
  return ready;
}

function basePose(visual: OpponentVisual): Pose {
  return {
    pitch: -0.08,
    yaw: clamp(-visual.ballX * 0.12, -0.2, 0.2),
    roll: 0,
    headPitch: visual.ballZ < 0 ? 0.16 : 0.04,
    headYaw: clamp(-visual.ballX * 0.4, -0.45, 0.45),
    armR: [1.05, 0.15, 0.22],
    elbowR: 0.28,
    armL: [0.45, -0.1, -0.35],
    elbowL: 0.45,
    hipL: 0.18,
    kneeL: 0.38,
    hipR: 0.18,
    kneeR: 0.38,
  };
}

function forehandPose(t: number): Pose {
  return {
    pitch: -0.04,
    yaw: -0.55 + t * 1.15,
    roll: 0.12 - t * 0.28,
    headPitch: 0.08,
    headYaw: -0.2 + t * 0.3,
    armR: [0.45 - t * 0.55, -0.7 + t * 1.5, 1.15 - t * 1.3],
    elbowR: 1.35 - t * 1.05,
    armL: [0.3, 0.1, -0.3],
    elbowL: 0.8,
    hipL: 0.08,
    kneeL: 0.28,
    hipR: 0.2,
    kneeR: 0.18,
  };
}

function backhandPose(t: number): Pose {
  return {
    pitch: -0.02,
    yaw: 0.5 - t * 1.05,
    roll: -0.08 + t * 0.2,
    headPitch: 0.1,
    headYaw: 0.2 - t * 0.25,
    armR: [0.55, 0.85 - t * 1.4, 0.2 + t * 0.4],
    elbowR: 1.2 - t * 0.7,
    armL: [0.5, -0.2, -0.5],
    elbowL: 0.6,
    hipL: 0.2,
    kneeL: 0.2,
    hipR: 0.08,
    kneeR: 0.26,
  };
}

function blend(from: Pose, to: Pose, amount: number): Pose {
  const t = clamp(amount, 0, 1);
  return {
    pitch: lerp(from.pitch, to.pitch, t),
    yaw: lerp(from.yaw, to.yaw, t),
    roll: lerp(from.roll, to.roll, t),
    headPitch: lerp(from.headPitch, to.headPitch, t),
    headYaw: lerp(from.headYaw, to.headYaw, t),
    armR: [lerp(from.armR[0], to.armR[0], t), lerp(from.armR[1], to.armR[1], t), lerp(from.armR[2], to.armR[2], t)],
    elbowR: lerp(from.elbowR, to.elbowR, t),
    armL: [lerp(from.armL[0], to.armL[0], t), lerp(from.armL[1], to.armL[1], t), lerp(from.armL[2], to.armL[2], t)],
    elbowL: lerp(from.elbowL, to.elbowL, t),
    hipL: lerp(from.hipL, to.hipL, t),
    kneeL: lerp(from.kneeL, to.kneeL, t),
    hipR: lerp(from.hipR, to.hipR, t),
    kneeR: lerp(from.kneeR, to.kneeR, t),
  };
}

function hang(length: number, radius: number, material: THREE.Material, segments = 8): THREE.Group {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.04, length - radius * 2), 3, segments), material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

function standard(color: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
