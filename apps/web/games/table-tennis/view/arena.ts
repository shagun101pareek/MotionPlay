import * as THREE from 'three';
import { TABLE } from '../TableTennisPhysics';

export function createArena(): THREE.Group {
  const root = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0x2f6fad, roughness: 0.92, metalness: 0 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1f3f66, roughness: 0.78, metalness: 0.02 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.35, metalness: 0.65 });
  const blue = new THREE.MeshPhysicalMaterial({
    color: 0x1a78c7,
    roughness: 0.28,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
  });
  const white = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.4, metalness: 0.02 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.18, 16), floorMat);
  floor.position.set(0, -0.09, 1.2);
  floor.receiveShadow = true;
  root.add(floor);

  const back = new THREE.Mesh(new THREE.BoxGeometry(14, 4.8, 0.2), wall);
  back.position.set(0, 2.35, 6.4);
  back.receiveShadow = true;
  root.add(back);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.8, 12), wall);
  left.position.set(-6.4, 2.35, 1);
  root.add(left);
  const right = left.clone();
  right.position.x = 6.4;
  root.add(right);

  // Soft room glow panels instead of arcade beams.
  for (const x of [-2.2, 0, 2.2]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.05, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xf4f7ff, emissive: 0xdde7ff, emissiveIntensity: 1.1, roughness: 0.45 }),
    );
    panel.position.set(x, 4.45, 0.4);
    root.add(panel);
  }

  root.add(table(blue, white, metal));
  root.add(lights());
  return root;
}

function table(blue: THREE.Material, white: THREE.Material, metal: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, 0.028, TABLE.length), blue);
  top.position.y = TABLE.surfaceY - 0.014;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE.width + 0.04, 0.08, TABLE.length + 0.04),
    new THREE.MeshStandardMaterial({ color: 0x0f1a28, roughness: 0.55, metalness: 0.2 }),
  );
  apron.position.y = TABLE.surfaceY - 0.06;
  apron.castShadow = true;
  group.add(apron);

  const lineY = TABLE.surfaceY + 0.002;
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, TABLE.length - 0.02), white);
  side.position.set(-(TABLE.halfWidth - 0.01), lineY, 0);
  const sideRight = side.clone();
  sideRight.position.x = TABLE.halfWidth - 0.01;
  const end = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width - 0.02, 0.003, 0.018), white);
  end.position.set(0, lineY, -(TABLE.halfLength - 0.01));
  const endFar = end.clone();
  endFar.position.z = TABLE.halfLength - 0.01;
  const center = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.003, TABLE.length - 0.06), white);
  center.position.set(0, lineY, 0);
  group.add(side, sideRight, end, endFar, center);

  const legGeo = new THREE.BoxGeometry(0.05, TABLE.surfaceY - 0.08, 0.05);
  for (const x of [-0.58, 0.58]) {
    for (const z of [-1.12, 1.12]) {
      const leg = new THREE.Mesh(legGeo, metal);
      leg.position.set(x, (TABLE.surfaceY - 0.08) / 2, z);
      leg.castShadow = true;
      group.add(leg);
    }
  }

  const netWidth = TABLE.width + TABLE.netOverhang * 2;
  const net = new THREE.Mesh(new THREE.PlaneGeometry(netWidth, TABLE.netHeight), netMaterial());
  net.position.set(0, TABLE.surfaceY + TABLE.netHeight / 2, 0);
  group.add(net);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(netWidth, 0.01, 0.01), white);
  tape.position.set(0, TABLE.surfaceY + TABLE.netHeight, 0);
  group.add(tape);
  for (const x of [-(TABLE.halfWidth + 0.012), TABLE.halfWidth + 0.012]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, TABLE.netHeight + 0.03, 10), metal);
    post.position.set(x, TABLE.surfaceY + TABLE.netHeight / 2, 0);
    post.castShadow = true;
    group.add(post);
  }
  return group;
}

function netMaterial(): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0xd5deea, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(244, 247, 251, 0.88)';
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= canvas.width; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 7) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.15,
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0,
  });
}

function lights(): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.AmbientLight(0xd7e6f7, 0.42));
  group.add(new THREE.HemisphereLight(0xe8f2ff, 0x2a4060, 0.55));
  const sun = new THREE.DirectionalLight(0xfff8ef, 1.55);
  sun.position.set(-1.8, 5.8, -1.2);
  sun.target.position.set(0, 0.76, 0.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 12;
  sun.shadow.camera.left = -2.8;
  sun.shadow.camera.right = 2.8;
  sun.shadow.camera.top = 2.8;
  sun.shadow.camera.bottom = -2.8;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.02;
  group.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xb9d6ff, 0.45);
  fill.position.set(2.4, 3.2, 2.5);
  group.add(fill);
  for (const x of [-0.8, 0.8]) {
    const spot = new THREE.SpotLight(0xf7f4ff, 28, 10, 0.6, 0.7, 1.5);
    spot.position.set(x, 4.2, 0.15);
    spot.target.position.set(x * 0.15, 0.76, 0);
    group.add(spot, spot.target);
  }
  return group;
}
