// Hero avatar.
//
// Three modes, in order of preference:
//   1. A rigged .glb (settings.avatarModel). Head and neck bones follow the pointer,
//      arms/legs are animated procedurally for the dance, and ARKit-style blendshapes
//      drive blinking and smiling when the model provides them.
//   2. An illustrated portrait (settings.avatarImage) on a gently bowed plane, which
//      keeps the artwork's own shading and parallaxes toward the pointer.
//   3. Otherwise a built-in figure — jeans, tee, open blazer, sneakers — built from
//      lathed profiles, with the same behaviour.
//
// Both are bundled at build time; nothing is fetched from a third party at runtime.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { player, hasPlaylist, currentAction, sample as samplePlayer } from './player.js';

const stage = document.getElementById('stage');
if (stage) init(stage);

function init(stage) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const bn = document.documentElement.lang === 'bn';
  const lerp = THREE.MathUtils.lerp;
  const clamp = THREE.MathUtils.clamp;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // filmic tone mapping — soft highlight rolloff instead of clipped whites
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  stage.prepend(renderer.domElement);

  // ── studio environment: soft image-based lighting for believable materials ──
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // the environment supplies reflections and soft bounce only — the key light
  // still shapes the figure, so keep its contribution low or everything flattens
  scene.environmentIntensity = 0.3;

  // ── lights ──
  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x6e6a5c, 0.35));
  const key = new THREE.DirectionalLight(0xfff6ea, 2.1);
  key.position.set(3.2, 6, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -1;
  key.shadow.radius = 8;
  key.shadow.bias = -0.0006;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd6e8ff, 0.7);
  fill.position.set(-3.5, 2.2, 3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xe6432d, 1.5);
  rim.position.set(-3.5, 4, -4.5);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ opacity: 0.16 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  function syncRim() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    try { rim.color.set(c); } catch { /* keep previous */ }
  }
  syncRim();
  addEventListener('zbchange', syncRim);

  /* ═══════════════ built-in figure ═══════════════ */
  function buildFigure() {
    const P = (opts) => new THREE.MeshPhysicalMaterial({ metalness: 0, ...opts });

    // woven cloth: matte, with a soft sheen at grazing angles
    const cloth = (color, rough, sheenColor) => P({
      color, roughness: rough, sheen: 0.55, sheenRoughness: 0.75, sheenColor
    });
    const blazer = cloth(0x2b3038, 0.88, 0x93a3b8);
    const blazerDark = cloth(0x21252c, 0.9, 0x7f8ea3);
    const tee = cloth(0xb6babf, 0.95, 0xffffff);
    const denim = cloth(0x47678d, 0.93, 0x9fc0e0);
    const denimDark = cloth(0x3b587b, 0.94, 0x8fb0d4);
    // skin: slight clearcoat reads as the natural sheen of skin
    const skin = P({ color: 0xac7853, roughness: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.62, sheen: 0.25, sheenColor: 0xff9c74 });
    const skinDark = P({ color: 0x976542, roughness: 0.66, clearcoat: 0.22, clearcoatRoughness: 0.65 });
    const hair = P({ color: 0x191512, roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.42 });
    const dark = P({ color: 0x15171b, roughness: 0.55 });
    const mouthMat = P({ color: 0x5b3226, roughness: 0.5 });
    const white = P({ color: 0xf8f6f0, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    const iris = P({ color: 0x3d2716, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    const frameMat = P({ color: 0x40301f, roughness: 0.3, metalness: 0.45, clearcoat: 0.5 });
    const soleMat = P({ color: 0xeceae3, roughness: 0.65 });
    const sneaker = cloth(0x74787e, 0.88, 0xb8c2cc);

    const cast = (m) => { m.castShadow = true; return m; };
    const cap = (r, len, mat) => cast(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 20), mat));
    const sph = (r, mat, w = 28, h = 22) => cast(new THREE.Mesh(new THREE.SphereGeometry(r, w, h), mat));
    const cyl = (rt, rb, h, mat, s = 24) => cast(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), mat));
    // a lathed profile gives smooth, tapered body forms instead of straight tubes
    const lathe = (profile, mat, phiStart = 0, phiLength = Math.PI * 2, seg = 32) => {
      const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
      const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
      const m = cast(new THREE.Mesh(g, mat));
      if (phiLength < Math.PI * 2) m.material = mat.clone(), m.material.side = THREE.DoubleSide;
      return m;
    };

    const root = new THREE.Group();

    // LatheGeometry starts its sweep at +Z, so phi = 0 is already the front
    const FRONT = 0;
    const GAP = Math.PI * 0.14;

    // ── legs: jeans + sneakers ──
    const mkLeg = (side) => {
      const g = new THREE.Group();
      g.position.set(0.165 * side, 1.16, 0);
      const thigh = lathe([[0.001, 0.04], [0.155, 0], [0.15, -0.16], [0.132, -0.36], [0.118, -0.52], [0.001, -0.55]], denim);
      const knee = new THREE.Group(); knee.position.y = -0.54;
      const shin = lathe([[0.001, 0.03], [0.115, 0], [0.108, -0.16], [0.09, -0.36], [0.082, -0.48], [0.001, -0.5]], denimDark);
      const ankle = cyl(0.078, 0.072, 0.05, denimDark); ankle.position.y = -0.49;
      const shoe = cap(0.088, 0.19, sneaker);
      shoe.rotation.x = Math.PI / 2;
      shoe.position.set(0, -0.55, 0.085);
      const sole = cast(new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.055, 0.34, 2, 2, 2), soleMat));
      sole.position.set(0, -0.6, 0.075);
      knee.add(shin, ankle, shoe, sole);
      g.add(thigh, knee);
      g.userData.knee = knee;
      return g;
    };
    const legL = mkLeg(-1), legR = mkLeg(1);
    root.add(legL, legR);

    // ── torso ──
    const torso = new THREE.Group();
    torso.position.y = 1.16;
    root.add(torso);

    // hips fill the gap between the legs so they read as one body
    const hips = lathe([[0.0, -0.16], [0.19, -0.12], [0.25, -0.04], [0.26, 0.06], [0.001, 0.1]], denim);
    torso.add(hips);

    // grey tee: a full tapered shell under the jacket
    const teeProfile = [
      [0.001, -0.02], [0.255, 0.02], [0.27, 0.2], [0.285, 0.45], [0.29, 0.66],
      [0.275, 0.84], [0.24, 0.95], [0.155, 1.0]
    ];
    torso.add(lathe(teeProfile, tee));
    const teeCollar = cast(new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.026, 10, 24), tee));
    teeCollar.rotation.x = Math.PI / 2;
    teeCollar.position.y = 1.0;
    torso.add(teeCollar);

    // open blazer: the same silhouette, slightly larger, with a V left open at the front
    const coatProfile = [
      [0.29, -0.06], [0.3, 0.12], [0.315, 0.38], [0.325, 0.62],
      [0.318, 0.82], [0.29, 0.94], [0.2, 1.02]
    ];
    torso.add(lathe(coatProfile, blazer, FRONT + GAP, Math.PI * 2 - GAP * 2));

    // lapels: narrow darker bands running down each side of the opening
    const lapelProfile = [
      [0.322, 0.42], [0.332, 0.62], [0.326, 0.82], [0.3, 0.94], [0.21, 1.02]
    ];
    torso.add(lathe(lapelProfile, blazerDark, FRONT + GAP * 0.86, Math.PI * 0.13));
    torso.add(lathe(lapelProfile, blazerDark, FRONT - GAP * 0.86 - Math.PI * 0.13, Math.PI * 0.13));

    // shoulders: a rounded yoke so the arms attach believably
    const shoulders = cast(new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), blazer));
    shoulders.position.y = 0.9;
    shoulders.scale.set(1.24, 0.62, 1.02);
    torso.add(shoulders);

    // ── arms ──
    const mkArm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(0.36 * side, 0.94, 0);
      const cap0 = sph(0.115, blazer, 20, 16);
      cap0.scale.set(1, 0.9, 1);
      const upper = lathe([[0.001, 0.03], [0.105, 0], [0.1, -0.16], [0.088, -0.34], [0.082, -0.46], [0.001, -0.49]], blazer);
      const elbow = new THREE.Group(); elbow.position.y = -0.48;
      const fore = lathe([[0.001, 0.03], [0.084, 0], [0.08, -0.14], [0.07, -0.3], [0.066, -0.4], [0.001, -0.43]], blazer);
      const cuff = cyl(0.072, 0.07, 0.05, blazerDark); cuff.position.y = -0.41;

      // hand: palm + four curled fingers + an opposed thumb
      const hand = new THREE.Group();
      hand.position.y = -0.45;
      const palm = sph(0.066, skin, 20, 16);
      palm.scale.set(1, 1.12, 0.6);
      hand.add(palm);
      for (let i = 0; i < 4; i++) {
        const f = cap(0.017, 0.05, skin);
        f.position.set((i - 1.5) * 0.028, -0.078, 0.004);
        f.rotation.x = 0.3 + i * 0.04;
        hand.add(f);
      }
      const thumb = cap(0.02, 0.034, skin);
      thumb.position.set(0.05 * side, -0.03, 0.026);
      thumb.rotation.set(0.28, 0, -0.85 * side);
      hand.add(thumb);

      elbow.add(fore, cuff, hand);
      sh.add(cap0, upper, elbow);
      sh.userData.elbow = elbow;
      return sh;
    };
    const armL = mkArm(-1), armR = mkArm(1);
    torso.add(armL, armR);

    // ── head ──
    const neck = lathe([[0.001, -0.02], [0.098, 0], [0.094, 0.1], [0.105, 0.2], [0.001, 0.24]], skin);
    neck.position.y = 0.98;
    torso.add(neck);

    const head = new THREE.Group();
    head.position.y = 1.42;
    torso.add(head);

    const skull = sph(0.37, skin, 36, 28);
    skull.scale.set(0.93, 1.06, 0.97);
    const jaw = sph(0.28, skin, 26, 20);
    jaw.scale.set(0.93, 0.74, 0.92);
    jaw.position.set(0, -0.18, 0.035);

    // hair: cap set back off the forehead, with a small quiff
    const hairCap = cast(new THREE.Mesh(
      new THREE.SphereGeometry(0.386, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.42), hair));
    hairCap.scale.set(0.96, 1.03, 0.99);
    hairCap.position.set(0, 0.09, -0.045);
    const quiff = sph(0.14, hair, 20, 16);
    quiff.scale.set(1.5, 0.48, 0.92);
    quiff.position.set(0, 0.34, 0.13);
    quiff.rotation.x = -0.26;
    const napeHair = cast(new THREE.Mesh(
      new THREE.SphereGeometry(0.375, 24, 16, Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.28, Math.PI * 0.36), hair));
    napeHair.position.set(0, 0.02, 0);

    // beard: hugs the jaw only, so the cheeks stay skin
    const beard = cast(new THREE.Mesh(
      new THREE.SphereGeometry(0.362, 32, 24, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), hair));
    beard.scale.set(0.97, 1.32, 0.98);
    beard.position.set(0, -0.015, 0.03);
    const sideburnL = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.1, 4, 10), hair));
    sideburnL.position.set(-0.3, -0.03, 0.055);
    const sideburnR = sideburnL.clone(); sideburnR.position.x = 0.3;
    const stache = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.115, 5, 14), hair));
    stache.rotation.z = Math.PI / 2;
    stache.position.set(0, -0.128, 0.315);
    const mouth = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.07, 4, 10), mouthMat));
    mouth.rotation.z = Math.PI / 2;
    mouth.position.set(0, -0.172, 0.318);

    const earL = sph(0.05, skinDark, 16, 14);
    earL.scale.set(0.48, 1.1, 0.82);
    earL.position.set(-0.345, 0.005, 0);
    const earR = earL.clone(); earR.position.x = 0.345;

    const nose = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.062, 6, 14), skinDark));
    nose.position.set(0, -0.025, 0.345);

    const mkEye = (side) => {
      const g = new THREE.Group();
      g.position.set(0.125 * side, 0.075, 0.295);
      const ball = sph(0.05, white, 20, 16);
      ball.scale.set(1.16, 1, 0.66);
      const ir = sph(0.024, iris, 16, 12); ir.position.z = 0.033;
      const pu = sph(0.012, dark, 12, 10); pu.position.z = 0.05;
      const lid = cast(new THREE.Mesh(
        new THREE.SphereGeometry(0.054, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.34), skin));
      lid.scale.set(1.16, 1, 0.7);
      lid.position.y = 0.006;
      g.add(ball, ir, pu, lid);
      return g;
    };
    const eyeL = mkEye(-1), eyeR = mkEye(1);

    const browL = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.085, 5, 12), hair));
    browL.rotation.z = Math.PI / 2 + 0.1;
    browL.position.set(-0.125, 0.175, 0.315);
    const browR = browL.clone();
    browR.position.x = 0.125; browR.rotation.z = Math.PI / 2 - 0.1;

    const mkFrame = (side) => {
      const f = cast(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.0095, 12, 28), frameMat));
      f.position.set(0.128 * side, 0.075, 0.345);
      f.scale.set(1.3, 1.06, 1);
      return f;
    };
    const frameL = mkFrame(-1), frameR = mkFrame(1);
    const bridge = cast(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.012), frameMat));
    bridge.position.set(0, 0.1, 0.352);
    const templeL = cast(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.28), frameMat));
    templeL.position.set(-0.275, 0.095, 0.215);
    templeL.rotation.y = 0.2;
    const templeR = templeL.clone();
    templeR.position.x = 0.275; templeR.rotation.y = -0.2;

    head.add(skull, jaw, hairCap, quiff, napeHair, beard, sideburnL, sideburnR, stache, mouth,
      earL, earR, nose, eyeL, eyeR, browL, browR, frameL, frameR, bridge, templeL, templeR);

    return {
      kind: 'figure',
      root,
      height: 3.0,
      parts: { torso, head, armL, armR, legL, legR, eyeL, eyeR }
    };
  }

  /* ═══════════════ 2.5D artwork avatar ═══════════════
     An illustrated portrait on a subtly curved plane. It keeps the artwork's own
     shading (so a rendered/painted avatar looks exactly as drawn) and tilts toward
     the pointer for parallax. Optionally keys out a flat white backdrop. */
  function loadImageAvatar(url, cutout) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const iw = tex.image.width || 1, ih = tex.image.height || 1;
        const height = 3.0;
        const width = height * (iw / ih);

        // a gentle cylindrical bow gives the flat artwork a sense of volume
        const geo = new THREE.PlaneGeometry(width, height, 32, 32);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i) / (width / 2);
          pos.setZ(i, -0.18 * x * x);
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, alphaTest: 0.02, toneMapped: false
        });
        if (cutout) {
          mat.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <alphatest_fragment>',
              `{
                 float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
                 float mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
                 if (mx > 0.88 && (mx - mn) < 0.10) discard;
               }
               #include <alphatest_fragment>`
            );
          };
        }

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = height / 2;

        // soft contact shadow, since a plane cannot cast a believable one
        const blob = new THREE.Mesh(
          new THREE.CircleGeometry(width * 0.28, 32),
          new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.13, toneMapped: false })
        );
        blob.rotation.x = -Math.PI / 2;
        blob.position.y = 0.01;

        const root = new THREE.Group();
        root.add(mesh, blob);
        resolve({ kind: 'image', root, mesh, blob, height });
      }, undefined, reject);
    });
  }

  /* ═══════════════ rigged .glb ═══════════════ */
  const BONES = {
    head: ['head'], neck: ['neck'],
    spine: ['spine2', 'spine1', 'spine', 'chest', 'upperchest'],
    hips: ['hips', 'pelvis'],
    armL: ['leftarm', 'leftupperarm', 'left_arm'],
    armR: ['rightarm', 'rightupperarm', 'right_arm'],
    foreL: ['leftforearm', 'leftlowerarm'],
    foreR: ['rightforearm', 'rightlowerarm'],
    legL: ['leftupleg', 'leftupperleg'],
    legR: ['rightupleg', 'rightupperleg']
  };

  function collectBones(model) {
    const found = {};
    const morphs = [];
    model.traverse((o) => {
      if (o.isMesh && o.morphTargetDictionary) morphs.push(o);
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; }
      if (!o.isBone) return;
      const n = o.name.toLowerCase().replace(/^mixamorig[:_]?/, '').replace(/[_\s.]/g, '');
      for (const [slot, names] of Object.entries(BONES)) {
        if (found[slot]) continue;
        if (names.some((x) => n === x || n.endsWith(x))) found[slot] = o;
      }
    });
    for (const b of Object.values(found)) b.userData.rest = b.quaternion.clone();
    return { bones: found, morphs };
  }

  function loadModel(url) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => {
        const model = gltf.scene;
        const { bones, morphs } = collectBones(model);

        // normalize: sit on the floor, centered, scaled to a consistent height
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const scale = size.y > 0 ? 3.0 / size.y : 1;
        model.scale.setScalar(scale);
        const bbox2 = new THREE.Box3().setFromObject(model);
        model.position.y -= bbox2.min.y;
        model.position.x -= (bbox2.min.x + bbox2.max.x) / 2;

        const root = new THREE.Group();
        root.add(model);
        resolve({ kind: 'glb', root, height: 3.0, bones, morphs, clips: gltf.animations || [] });
      }, undefined, reject);
    });
  }

  /* ═══════════════ shared driving ═══════════════ */
  const target = new THREE.Vector2(0, 0);
  let zbDance = 'zb' in document.documentElement.dataset ? 1 : 0;
  let burstUntil = 0;
  let dance = zbDance;
  let touchDragging = false;
  const hintEl = document.getElementById('stageHint');

  addEventListener('zbchange', (e) => { zbDance = e.detail.on ? 1 : 0; });

  if (!coarse) {
    addEventListener('pointermove', (e) => {
      target.x = (e.clientX / innerWidth) * 2 - 1;
      target.y = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
    if (hintEl) hintEl.textContent = bn ? 'কার্সর নাড়ান — ও তাকিয়ে আছে' : 'move your cursor — he’s watching';
  } else {
    stage.style.touchAction = 'pan-y';
    stage.style.cursor = 'pointer';
    let moved = false, sx = 0, sy = 0, bx = 0, by = 0;
    stage.addEventListener('pointerdown', (e) => {
      touchDragging = true; moved = false;
      sx = e.clientX; sy = e.clientY; bx = target.x; by = target.y;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!touchDragging) return;
      if (Math.abs(e.clientX - sx) > 6 || Math.abs(e.clientY - sy) > 6) moved = true;
      target.x = clamp(bx + (e.clientX - sx) / stage.clientWidth * 2.4, -1, 1);
      target.y = clamp(by + (e.clientY - sy) / stage.clientHeight * 2.4, -1, 1);
    });
    stage.addEventListener('pointerup', () => {
      if (touchDragging && !moved) {
        burstUntil = performance.now() + 6000;
        if (hintEl) hintEl.textContent = bn ? 'এই তো নাচ!' : 'there you go';
      }
      touchDragging = false;
    });
    stage.addEventListener('pointercancel', () => { touchDragging = false; });
    if (hintEl) hintEl.textContent = bn ? 'ট্যাপ করুন — ও নাচবে · টেনে ঘোরান' : 'tap him to dance · drag to turn';
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  // Priority: rigged model → illustrated portrait → built-in figure.
  const modelUrl = (stage.dataset.model || '').trim();
  const imageUrl = (stage.dataset.image || '').trim();
  const cutout = stage.dataset.cutout !== 'false';

  const pick = modelUrl
    ? loadModel(modelUrl).catch(() => (imageUrl ? loadImageAvatar(imageUrl, cutout) : buildFigure()))
    : imageUrl
      ? loadImageAvatar(imageUrl, cutout).catch(() => buildFigure())
      : Promise.resolve(buildFigure());

  pick.then((subject) => run(subject)).catch(() => run(buildFigure()));

  function run(subject) {
    scene.add(subject.root);
    camera.position.set(0.35, subject.height * 0.68, subject.height * 2.55);
    camera.lookAt(0, subject.height * 0.55, 0);
    resize();

    const BPM = 96;
    const clock = new THREE.Clock();
    let elapsed = 0;
    let nextBlink = 2, blinkT = -1;

    /* ── beat context ──
       Driven by the playlist when one is playing, otherwise by the synth tempo. */
    const pose = {};
    let stepOffset = 0;
    addEventListener('trackchange', () => { stepOffset = (stepOffset + 1 + Math.floor(Math.random() * 3)) % 5; });
    const ctx = { t: 0, beat: 0, phase: 0, bar: 0, step: 0, energy: 0, pulse: 0, d: 0, hx: 0 };

    const energyNow = () => ctx.energy;
    const actionNow = () => {
      if (!hasPlaylist() || !player.playing) return 'dance';
      return currentAction();
    };

    // eased 0..1 ramps used to shape a step within each beat
    const bounce = (p) => Math.abs(Math.sin(p * Math.PI));
    const sway = (p) => Math.sin(p * Math.PI * 2);

    /* ── dance steps ──
       Shoulder x stays within roughly [-1.5, 0.4] so the hands never travel
       behind the back; sideways reach comes from shoulder z instead. */
    const STEPS = [
      // 0 — two-step: weight shifts side to side, arms pump low
      (P, c) => {
        const s = Math.sin(c.beat * Math.PI);
        P.rootY = bounce(c.phase) * 0.1 * c.amp;
        P.rootZ = s * 0.05;
        P.torsoY = s * 0.22;
        P.torsoZ = -s * 0.06;
        P.shLX = -0.35 + s * 0.35; P.shRX = -0.35 - s * 0.35;
        P.shLZ = 0.42 + Math.abs(s) * 0.12; P.shRZ = -0.42 - Math.abs(s) * 0.12;
        P.elLX = -0.9 - s * 0.3; P.elRX = -0.9 + s * 0.3;
        P.legLX = s * 0.16; P.legRX = -s * 0.16;
        P.kneeL = Math.max(0, s) * 0.5; P.kneeR = Math.max(0, -s) * 0.5;
        P.headZ = s * 0.08;
      },
      // 1 — knee lifts with alternating arm reach across the body
      (P, c) => {
        const s = Math.sin(c.beat * Math.PI);
        const up = s > 0;
        P.rootY = bounce(c.phase) * 0.14 * c.amp;
        P.torsoY = s * 0.3;
        P.shLX = up ? -1.15 : -0.25; P.shRX = up ? -0.25 : -1.15;
        P.shLZ = 0.3; P.shRZ = -0.3;
        P.elLX = up ? -1.5 : -0.7; P.elRX = up ? -0.7 : -1.5;
        P.legLX = up ? -0.5 : 0.08; P.legRX = up ? 0.08 : -0.5;
        P.kneeL = up ? 1.0 : 0.12; P.kneeR = up ? 0.12 : 1.0;
        P.headY += s * 0.15;
      },
      // 2 — hands up, swaying overhead
      (P, c) => {
        const s = sway(c.phase);
        P.rootY = bounce(c.phase) * 0.08 * c.amp;
        P.rootZ = s * 0.07;
        P.torsoZ = s * 0.1;
        P.shLX = -1.45; P.shRX = -1.45;
        P.shLZ = 0.55 + s * 0.18; P.shRZ = -0.55 + s * 0.18;
        P.elLX = -0.5 + s * 0.2; P.elRX = -0.5 - s * 0.2;
        P.legLX = 0.05; P.legRX = 0.05;
        P.kneeL = 0.22 + bounce(c.phase) * 0.2; P.kneeR = 0.22 + bounce(c.phase) * 0.2;
        P.headZ = s * 0.12;
      },
      // 3 — twist: hips and shoulders counter-rotate, arms trail
      (P, c) => {
        const s = Math.sin(c.beat * Math.PI * 0.5);
        P.rootY = bounce(c.phase) * 0.07 * c.amp;
        P.rootYaw = s * 0.35;
        P.torsoY = -s * 0.5;
        P.shLX = -0.6 - s * 0.25; P.shRX = -0.6 + s * 0.25;
        P.shLZ = 0.5; P.shRZ = -0.5;
        P.elLX = -1.25; P.elRX = -1.25;
        P.legLX = 0.06; P.legRX = 0.06;
        P.kneeL = 0.3; P.kneeR = 0.3;
        P.headY += -s * 0.2;
      },
      // 4 — clap on the beat, heels bouncing
      (P, c) => {
        const hit = 1 - Math.min(1, c.phase * 3);
        P.rootY = bounce(c.phase) * 0.09 * c.amp;
        P.shLX = -1.1; P.shRX = -1.1;
        P.shLZ = 0.18 + hit * 0.3; P.shRZ = -0.18 - hit * 0.3;
        P.elLX = -1.5; P.elRX = -1.5;
        P.torsoX = -0.06 - hit * 0.05;
        P.legLX = 0.04; P.legRX = 0.04;
        P.kneeL = 0.18 + bounce(c.phase) * 0.28; P.kneeR = 0.18 + bounce(c.phase) * 0.28;
      }
    ];

    function poseDance(P, c) {
      c.amp = 0.7 + c.energy * 0.9 + c.pulse * 0.3;
      STEPS[c.step % STEPS.length](P, c);
    }

    function poseSway(P, c) {
      const s = Math.sin(c.t * 1.1);
      P.rootZ = s * 0.04;
      P.torsoY = s * 0.14;
      P.shLX = -0.15; P.shRX = -0.15;
      P.shLZ = 0.16 + s * 0.05; P.shRZ = -0.16 + s * 0.05;
      P.elLX = -0.5; P.elRX = -0.5;
      P.kneeL = 0.06; P.kneeR = 0.06;
      P.headZ = s * 0.06;
    }

    // sitting on a stool, strumming: left hand up the neck, right hand strums
    function poseGuitar(P, c) {
      const strum = Math.sin(c.beat * Math.PI * 2);
      P.torsoLift = -0.42;               // sit down onto the stool
      P.torsoX = -0.08;
      P.torsoY = 0.16;
      P.legLX = -1.35; P.legRX = -1.15;  // thighs forward
      P.kneeL = 1.3; P.kneeR = 1.15;     // shins down
      P.shLX = -0.75; P.shLZ = 0.85;     // fretting hand out along the neck
      P.elLX = -1.35;
      P.shRX = -0.5 + strum * 0.16; P.shRZ = -0.32;
      P.elRX = -1.15 - strum * 0.2;      // strumming wrist
      P.headX = 0.12; P.headY = -0.32;   // looking down at the fretboard
      P.rootY = 0;
    }

    // turned away, face buried, shoulders shaking
    function poseSad(P, c) {
      const sob = Math.sin(c.t * 6.5) * 0.5 + Math.sin(c.t * 11) * 0.5;
      P.rootYaw = Math.PI * 0.82;        // mostly turned from the viewer
      P.torsoX = 0.3 + sob * 0.02;       // hunched forward
      P.torsoLift = -0.06;
      P.shLX = -1.45; P.shRX = -1.45;    // hands up to the face
      P.shLZ = 0.34; P.shRZ = -0.34;
      P.elLX = -1.9; P.elRX = -1.9;
      P.headX = 0.34;
      P.headY = 0; P.headZ = sob * 0.03;
      P.legLX = 0.04; P.legRX = 0.04;
      P.kneeL = 0.1; P.kneeR = 0.1;
      P.rootY = Math.abs(sob) * 0.012;
    }

    /* ── props: a stool and a guitar, built once and shown per action ── */
    let props = null;
    function buildProps() {
      const wood = new THREE.MeshPhysicalMaterial({ color: 0x6b4a2f, roughness: 0.55, clearcoat: 0.3, metalness: 0 });
      const woodDark = new THREE.MeshPhysicalMaterial({ color: 0x4a3320, roughness: 0.6, metalness: 0 });
      const metal = new THREE.MeshPhysicalMaterial({ color: 0xb9bdc4, roughness: 0.3, metalness: 0.85 });

      const stool = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 28), woodDark);
      seat.position.y = 0.74; seat.castShadow = true;
      stool.add(seat);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.76, 12), woodDark);
        leg.position.set(Math.cos(a) * 0.2, 0.37, Math.sin(a) * 0.2);
        leg.rotation.z = -Math.cos(a) * 0.14;
        leg.rotation.x = Math.sin(a) * 0.14;
        leg.castShadow = true;
        stool.add(leg);
      }
      stool.position.set(0, 0, -0.05);

      const guitar = new THREE.Group();
      const bodyG = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18), wood);
      bodyG.scale.set(1, 1.18, 0.34);
      bodyG.castShadow = true;
      const waist = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 10, 24), wood);
      waist.scale.set(1, 1.15, 0.4);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24),
        new THREE.MeshBasicMaterial({ color: 0x140d07 }));
      hole.position.set(0, 0.03, 0.083);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.72, 0.05), woodDark);
      neck.position.set(0, 0.55, 0.02); neck.castShadow = true;
      const headstock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, 0.04), woodDark);
      headstock.position.set(0, 0.98, 0.02);
      const strings = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.15, 0.006), metal);
      strings.position.set(0, 0.42, 0.055);
      guitar.add(bodyG, waist, hole, neck, headstock, strings);
      // held across the body, neck up to the left
      guitar.position.set(-0.02, 1.12, 0.34);
      guitar.rotation.set(0.22, 0.1, 0.62);

      props = { stool, guitar };
      subject.root.add(stool, guitar);
    }

    function setProps(action, d) {
      const wantGuitar = action === 'guitar' && d > 0.05;
      if (!props) {
        if (!wantGuitar) return;
        buildProps();
      }
      props.stool.visible = wantGuitar;
      props.guitar.visible = wantGuitar;
    }

    // morph-target indices for blink / smile, when the model provides them
    const morphSet = (name, value) => {
      if (subject.kind !== 'glb') return;
      for (const mesh of subject.morphs) {
        const i = mesh.morphTargetDictionary[name];
        if (i !== undefined) mesh.morphTargetInfluences[i] = value;
      }
    };
    const eul = new THREE.Euler();
    const q = new THREE.Quaternion();
    const setBone = (bone, x, y, z) => {
      if (!bone) return;
      eul.set(x, y, z);
      q.setFromEuler(eul);
      bone.quaternion.copy(bone.userData.rest).multiply(q);
    };

    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;
      const t = elapsed;
      const wantDance = Math.max(zbDance, performance.now() < burstUntil ? 1 : 0);
      dance += (wantDance - dance) * Math.min(1, dt * 3);
      const d = (reduced ? 0 : dance);

      // beat + loudness come from the playlist when it is playing, else from the
      // fixed tempo of the generative synth
      samplePlayer(dt);
      const live = hasPlaylist() && player.playing;
      const beat = live ? player.beat : (t * BPM) / 60;
      const swing = Math.sin(beat * Math.PI);
      ctx.t = t;
      ctx.beat = beat;
      ctx.phase = live ? player.beatPhase : (beat % 1);
      ctx.bar = Math.floor(beat / 4);
      ctx.energy = live ? player.energy : 0.45;
      ctx.pulse = live ? player.pulse : 0;
      ctx.d = d;
      // change step every four bars, and on every track change
      ctx.step = (Math.floor(ctx.bar / 4) + stepOffset) % 5;

      if (coarse && !touchDragging) {
        target.x += ((Math.sin(t * 0.42) * 0.75) - target.x) * Math.min(1, dt * 0.9);
        target.y += ((Math.sin(t * 0.31) * 0.35) - target.y) * Math.min(1, dt * 0.9);
      }
      const hx = clamp(target.x, -1, 1);
      const hy = clamp(target.y, -1, 1);

      if (subject.kind !== 'figure') {
        subject.root.position.y = Math.abs(swing) * 0.17 * d;
        subject.root.rotation.z = swing * 0.05 * d;
        subject.root.rotation.y += ((hx * 0.16) - subject.root.rotation.y) * Math.min(1, dt * 3);
      }

      const breathe = Math.sin(t * 1.5) * 0.012;

      if (subject.kind === 'image') {
        // parallax tilt toward the pointer, a slow idle float, and a beat bounce
        const m = subject.mesh;
        m.rotation.y += ((hx * 0.3) - m.rotation.y) * Math.min(1, dt * 4);
        m.rotation.x += ((hy * 0.13) - m.rotation.x) * Math.min(1, dt * 4);
        m.rotation.z = lerp(Math.sin(t * 0.7) * 0.012, swing * 0.07, d);
        m.position.y = subject.height / 2 + Math.sin(t * 1.25) * 0.035 + Math.abs(swing) * 0.06 * d;
        m.position.x = lerp(hx * -0.06, swing * 0.09, d);
        const squash = 1 + Math.sin(beat * Math.PI * 2) * 0.02 * d;
        m.scale.set(1 / squash, squash, 1);
        subject.blob.scale.setScalar(1 - (m.position.y - subject.height / 2) * 0.5);
        subject.blob.material.opacity = 0.13 - (m.position.y - subject.height / 2) * 0.06;
      } else if (subject.kind === 'figure') {
        const { torso, head, armL, armR, legL, legR, eyeL, eyeR } = subject.parts;
        const elbowL = armL.userData.elbow, elbowR = armR.userData.elbow;
        const kneeL = legL.userData.knee, kneeR = legR.userData.knee;

        // Pose targets, filled by the active action, then eased into.
        // Shoulder x is kept in a forward-biased range so hands never swing
        // behind the torso; z swings the arm out to the side instead.
        const P = pose;
        P.headX = hy * 0.3; P.headY = hx * 0.55; P.headZ = 0;
        P.torsoX = 0; P.torsoY = 0; P.torsoZ = 0; P.torsoLift = 0;
        P.shLX = 0; P.shLZ = 0.1; P.elLX = -0.45;
        P.shRX = 0; P.shRZ = -0.1; P.elRX = -0.45;
        P.legLX = 0; P.legRX = 0; P.kneeL = 0; P.kneeR = 0;
        P.rootY = 0; P.rootZ = 0; P.rootYaw = 0;

        if (d > 0.01) {
          const A = actionNow();
          if (A === 'guitar') poseGuitar(P, ctx);
          else if (A === 'sad') poseSad(P, ctx);
          else if (A === 'sway') poseSway(P, ctx);
          else poseDance(P, ctx);
        } else {
          // idle: breathing and a slow weight shift
          P.torsoZ = Math.sin(t * 0.5) * 0.03;
          P.shLZ = 0.1 + breathe; P.shRZ = -0.1 - breathe;
        }

        setProps(actionNow(), d);

        const k = Math.min(1, dt * (12 + 10 * energyNow()));
        head.rotation.x += (P.headX - head.rotation.x) * Math.min(1, dt * 6);
        head.rotation.y += (P.headY - head.rotation.y) * Math.min(1, dt * 6);
        head.rotation.z += (P.headZ - head.rotation.z) * k;
        eyeL.position.x = -0.135 + hx * 0.02;
        eyeR.position.x = 0.135 + hx * 0.02;

        torso.rotation.x += (P.torsoX - torso.rotation.x) * k;
        torso.rotation.y += (P.torsoY - torso.rotation.y) * k;
        torso.rotation.z += (P.torsoZ - torso.rotation.z) * k;
        torso.position.y = 1.16 + P.torsoLift;
        torso.scale.y = 1 + breathe * (1 - d);

        armL.rotation.x += (P.shLX - armL.rotation.x) * k;
        armR.rotation.x += (P.shRX - armR.rotation.x) * k;
        armL.rotation.z += (P.shLZ - armL.rotation.z) * k;
        armR.rotation.z += (P.shRZ - armR.rotation.z) * k;
        elbowL.rotation.x += (P.elLX - elbowL.rotation.x) * k;
        elbowR.rotation.x += (P.elRX - elbowR.rotation.x) * k;

        legL.rotation.x += (P.legLX - legL.rotation.x) * k;
        legR.rotation.x += (P.legRX - legR.rotation.x) * k;
        kneeL.rotation.x += (P.kneeL - kneeL.rotation.x) * k;
        kneeR.rotation.x += (P.kneeR - kneeR.rotation.x) * k;

        subject.root.position.y = P.rootY;
        subject.root.rotation.z = P.rootZ;
        subject.root.rotation.y += ((hx * 0.16 + P.rootYaw) - subject.root.rotation.y) * Math.min(1, dt * 3);

        nextBlink -= dt;
        if (nextBlink <= 0) { blinkT = 0; nextBlink = 2.4 + Math.random() * 3; }
        if (blinkT >= 0) {
          blinkT += dt;
          const p = blinkT / 0.16;
          const s = p < 1 ? Math.max(0.08, Math.abs(1 - 2 * Math.min(p, 1))) : 1;
          eyeL.scale.y = eyeR.scale.y = s;
          if (p >= 1) { blinkT = -1; eyeL.scale.y = eyeR.scale.y = 1; }
        }
      } else {
        const b = subject.bones;
        setBone(b.head, hy * 0.32 + (d > 0.01 ? Math.sin(beat * Math.PI * 2) * 0.1 * d : 0), hx * 0.45, 0);
        setBone(b.neck, hy * 0.12, hx * 0.18, 0);
        setBone(b.spine, breathe * (1 - d), Math.sin(beat * Math.PI * 0.5) * 0.3 * d, Math.sin(t * 0.5) * 0.03 * (1 - d));
        // arms hang at rest (z pushes them outward), then pump on the beat
        setBone(b.armL, lerp(0, -0.5 + swing * 0.8, d), 0, lerp(0.06, 0.5, d));
        setBone(b.armR, lerp(0, -0.5 - swing * 0.8, d), 0, lerp(-0.06, -0.5, d));
        setBone(b.foreL, lerp(0, -0.9 + swing * 0.5, d), 0, 0);
        setBone(b.foreR, lerp(0, -0.9 - swing * 0.5, d), 0, 0);
        setBone(b.legL, swing * 0.22 * d, 0, 0);
        setBone(b.legR, -swing * 0.22 * d, 0, 0);

        nextBlink -= dt;
        if (nextBlink <= 0) { blinkT = 0; nextBlink = 2.4 + Math.random() * 3; }
        if (blinkT >= 0) {
          blinkT += dt;
          const p = blinkT / 0.16;
          const v = p < 1 ? 1 - Math.abs(1 - 2 * Math.min(p, 1)) : 0;
          morphSet('eyeBlinkLeft', v);
          morphSet('eyeBlinkRight', v);
          if (p >= 1) { blinkT = -1; morphSet('eyeBlinkLeft', 0); morphSet('eyeBlinkRight', 0); }
        }
        morphSet('mouthSmile', d * 0.6);
      }

      renderer.render(scene, camera);
    });
  }
}
