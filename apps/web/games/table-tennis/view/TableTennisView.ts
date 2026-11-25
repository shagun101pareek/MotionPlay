import * as THREE from 'three';
import { TABLE } from '../TableTennisPhysics';
import type { TableFrame } from '../TableTennisMatch';
import { createArena } from './arena';
import { createOpponent } from './opponent';
import { createPlayerRacket } from './racket';

const EYE_Y = 1.52;
const EYE_Z = -2.0;

export class TableTennisView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly eyeSmooth = new THREE.Vector3(0, EYE_Y, EYE_Z);
  private readonly lookSmooth = new THREE.Vector3(0, 0.9, 0.3);
  private readonly ball: THREE.Mesh;
  private readonly ballMaterial: THREE.MeshStandardMaterial;
  private readonly spark: THREE.PointLight;
  private readonly trail: THREE.Mesh[] = [];
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly racket: THREE.Group;
  private readonly opponent: ReturnType<typeof createOpponent>;
  private readonly reduceMotion: boolean;
  private disposed = false;
  private environment: THREE.Texture | null = null;

  constructor(parent: HTMLElement) {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x2f6fad);
    this.renderer.domElement.className = 'block h-full w-full';
    this.renderer.domElement.setAttribute('aria-label', 'First-person table tennis');
    parent.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.05, 40);
    this.camera.position.copy(this.eyeSmooth);
    this.scene.background = new THREE.Color(0x2f6fad);
    this.scene.fog = new THREE.Fog(0x2f6fad, 7, 14);
    this.scene.add(createArena());

    this.ballMaterial = new THREE.MeshStandardMaterial({
      color: 0xf27a2c,
      roughness: 0.38,
      metalness: 0.03,
      emissive: 0x4a1800,
      emissiveIntensity: 0,
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(TABLE.ballRadius, 28, 20), this.ballMaterial);
    this.ball.castShadow = true;
    this.ball.scale.setScalar(1.85);
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(0.012, 0.0016, 6, 18),
      new THREE.MeshStandardMaterial({ color: 0xd86a20, roughness: 0.5 }),
    );
    seam.rotation.y = 0.7;
    this.ball.add(seam);
    this.spark = new THREE.PointLight(0xfff4df, 0, 1.5, 2);
    this.ball.add(this.spark);
    this.scene.add(this.ball);

    const trailGeo = new THREE.SphereGeometry(TABLE.ballRadius * 0.7, 8, 8);
    for (let i = 0; i < 12; i += 1) {
      const material = new THREE.MeshBasicMaterial({ color: 0xf27a2c, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(trailGeo, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.trail.push(mesh);
      this.scene.add(mesh);
    }

    this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6e8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.055, 28), this.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.opponent = createOpponent();
    this.scene.add(this.opponent.object);

    this.racket = createPlayerRacket();
    this.camera.add(this.racket);
    this.scene.add(this.camera);
    const face = new THREE.PointLight(0xfff8ef, 0.55, 2.4, 2);
    face.position.set(0.08, -0.02, -0.2);
    this.camera.add(face);

    this.resize(parent.clientWidth, parent.clientHeight);
    void this.loadEnvironment();
  }

  resize(width: number, height: number): void {
    if (width < 2 || height < 2) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(width, height, false);
  }

  render(frame: TableFrame, dt: number, time: number): void {
    if (this.disposed) return;
    const ball = frame.ball;
    const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
    const heat = Math.min(1, speed / 9);
    const bob = this.reduceMotion ? 0 : Math.sin(time * 1.5) * 0.004 * (0.35 + heat);
    const pulled = frame.phase === 'point' || frame.phase === 'matchover' ? -0.05 : 0;
    this.eye.set(frame.playerX * 0.12, EYE_Y + bob + (frame.phase === 'serve' ? -0.02 : 0), EYE_Z + pulled);
    const track = ball.z < 0.15 ? 0.26 : 0.07;
    this.look.set(
      ball.x * track + frame.opponentX * 0.05,
      0.82 + Math.max(0, ball.y - TABLE.surfaceY) * (ball.z < 0 ? 0.14 : 0.03) - frame.impact * (this.reduceMotion ? 0 : 0.03),
      0.18,
    );
    const blend = 1 - Math.exp(-5 * dt);
    this.eyeSmooth.lerp(this.eye, blend);
    this.lookSmooth.lerp(this.look, blend);
    this.camera.position.copy(this.eyeSmooth);
    this.camera.lookAt(this.lookSmooth);
    if (!this.reduceMotion) {
      this.camera.rotateZ(-frame.playerX * 0.028);
      this.camera.rotateX(frame.impact * 0.01);
    }

    this.poseRacket(frame);
    this.ball.position.set(ball.x, ball.y, ball.z);
    this.ball.rotateX(ball.vz * dt * 2.4);
    this.ball.rotateZ(-ball.vx * dt * 2.4);
    this.ballMaterial.emissiveIntensity = frame.impact * 0.7;
    this.spark.intensity = frame.impact * 6;
    this.opponent.apply(
      {
        x: frame.opponentX,
        anim: frame.opponentAnim,
        swing: frame.opponentSwing,
        hand: frame.opponentHand,
        ballX: ball.x,
        ballY: ball.y,
        ballZ: ball.z,
      },
      time,
    );
    this.poseTrail(frame);
    this.ring.visible = frame.impact > 0.04;
    this.ring.position.set(ball.x, Math.max(ball.y, TABLE.surfaceY + 0.01), ball.z);
    const spread = 0.35 + (1 - frame.impact) * 1.8;
    this.ring.scale.setScalar(spread);
    this.ringMaterial.opacity = frame.impact * 0.65;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of list) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private poseRacket(frame: TableFrame): void {
    const swing = strokeAmount(frame.strokeAge);
    const backhand = (frame.strokeKind === 'backhand' && swing > 0) || (swing === 0 && frame.playerAngle < -0.35);
    // Keep the racket low in frame, closer to a real first-person hold.
    this.racket.position.set(0.22 + frame.playerX * 0.18, -0.38 + frame.playerY * 0.04 + swing * 0.04, -0.42);
    if (backhand) {
      this.racket.rotation.set(-0.55 - frame.playerY * 0.2, 0.42 - swing * 1.25, 0.7 - swing * 1.55);
    } else {
      this.racket.rotation.set(-0.5 - frame.playerY * 0.18 - frame.impact * 0.08, -0.22 + swing * 1.15, -0.42 + swing * 1.25);
    }
    this.racket.rotation.z += frame.playerAngle * 0.5;
  }

  private poseTrail(frame: TableFrame): void {
    const fast = Math.hypot(frame.ball.vx, frame.ball.vy, frame.ball.vz) > 3.2 && frame.phase === 'playing';
    for (let i = 0; i < this.trail.length; i += 1) {
      const point = frame.trail[frame.trail.length - 1 - i];
      const mesh = this.trail[i];
      if (!fast || !point) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(point.x, point.y, point.z);
      mesh.scale.setScalar(1 - i / (this.trail.length + 2));
      (mesh.material as THREE.MeshBasicMaterial).opacity = (1 - i / this.trail.length) * 0.28;
    }
  }

  private async loadEnvironment(): Promise<void> {
    try {
      const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
      if (this.disposed) return;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
      if (this.disposed) {
        target.texture.dispose();
        pmrem.dispose();
        return;
      }
      this.environment = target.texture;
      this.scene.environment = target.texture;
      pmrem.dispose();
    } catch {
      this.environment = null;
    }
  }
}

function strokeAmount(age: number): number {
  if (age < 0 || age > 0.42) return 0;
  if (age < 0.13) return age / 0.13;
  return 1 - (age - 0.13) / 0.29;
}
