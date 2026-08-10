// Hero avatar.
//
// Two modes:
//   1. A rigged .glb dropped in from the admin (settings.avatarModel). Its head
//      bone follows the pointer, its arms/legs are animated procedurally for the
//      dance, and ARKit-style blendshapes drive blinking and smiling if present.
//   2. Otherwise a built-in low-poly figure — jeans, tee, open blazer, sneakers —
//      with the same behaviour.
//
// Both are bundled at build time; nothing is fetched from a third party at runtime.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
  stage.prepend(renderer.domElement);

  // ── lights ──
  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x6e6a5c, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.85);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -1;
  key.shadow.radius = 6;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe4ff, 0.55);
  fill.position.set(-3, 2, 3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xe6432d, 0.9);
  rim.position.set(-4, 3, -4);
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
    const M = (color, rough = 0.75, opts = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.03, ...opts });

    const blazer = M(0x33383f, 0.85);
    const blazerDark = M(0x282c33, 0.88);
    const tee = M(0xb9bcc0, 0.9);
    const denim = M(0x5b7ea8, 0.9);
    const denimDark = M(0x4a6a90, 0.9);
    const skin = M(0xa9744f, 0.55);
    const skinDark = M(0x94603d, 0.6);
    const hair = M(0x171310, 0.95);
    const dark = M(0x14161a, 0.6);
    const white = M(0xf7f4ec, 0.35);
    const iris = M(0x3a2415, 0.4);
    const frameMat = M(0x3c2d1d, 0.35, { metalness: 0.35 });
    const soleMat = M(0xe8e5dd, 0.7);
    const sneaker = M(0x6f7378, 0.85);

    const cast = (m) => { m.castShadow = true; return m; };
    const cap = (r, len, mat) => cast(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 18), mat));
    const sph = (r, mat, w = 26, h = 20) => cast(new THREE.Mesh(new THREE.SphereGeometry(r, w, h), mat));
    const box = (w, h, d, mat) => cast(new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), mat));
    const cyl = (rt, rb, h, mat, s = 22) => cast(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), mat));

    const root = new THREE.Group();

    // ── legs: jeans + sneakers ──
    const mkLeg = (side) => {
      const g = new THREE.Group();
      g.position.set(0.19 * side, 1.12, 0);
      const thigh = cap(0.145, 0.44, denim); thigh.position.y = -0.31;
      const knee = new THREE.Group(); knee.position.y = -0.62;
      const shin = cap(0.115, 0.42, denimDark); shin.position.y = -0.26;
      const shoe = cap(0.105, 0.2, sneaker);
      shoe.rotation.x = Math.PI / 2;
      shoe.position.set(0, -0.49, 0.09);
      const sole = box(0.21, 0.06, 0.38, soleMat);
      sole.position.set(0, -0.56, 0.08);
      knee.add(shin, shoe, sole);
      g.add(thigh, knee);
      g.userData.knee = knee;
      return g;
    };
    const legL = mkLeg(-1), legR = mkLeg(1);
    root.add(legL, legR);

    // ── torso ──
    const torso = new THREE.Group();
    torso.position.y = 1.12;
    root.add(torso);

    // grey tee underneath
    const teeMesh = cyl(0.3, 0.33, 0.95, tee);
    teeMesh.position.y = 0.52;
    const teeCollar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 8, 20), tee);
    teeCollar.rotation.x = Math.PI / 2;
    teeCollar.position.y = 1.0;
    // open blazer: two front panels + back shell
    const back = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.4, 1.06, 22, 1, true, Math.PI * 0.42, Math.PI * 1.16), blazer);
    back.position.y = 0.55;
    const panelL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.345, 0.4, 1.06, 14, 1, true, Math.PI * 1.62, Math.PI * 0.4), blazer);
    panelL.position.y = 0.55;
    const panelR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.345, 0.4, 1.06, 14, 1, true, Math.PI * 1.02, Math.PI * 0.4), blazer);
    panelR.position.y = 0.55;
    [back, panelL, panelR].forEach((m) => { m.castShadow = true; m.material.side = THREE.DoubleSide; });
    // lapels: thin darker strips following the jacket opening
    const mkLapel = (side) => {
      const l = cast(new THREE.Mesh(
        new THREE.CylinderGeometry(0.352, 0.36, 0.62, 10, 1, true,
          side < 0 ? Math.PI * 1.58 : Math.PI * 1.28, Math.PI * 0.14), blazerDark));
      l.material.side = THREE.DoubleSide;
      l.position.y = 0.76;
      return l;
    };
    const lapL = mkLapel(-1), lapR = mkLapel(1);
    const shoulders = cast(new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), blazer));
    shoulders.position.y = 1.02;
    shoulders.scale.set(1.16, 0.5, 0.98);
    torso.add(teeMesh, teeCollar, back, panelL, panelR, lapL, lapR, shoulders);

    // ── arms ──
    const mkArm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(0.42 * side, 1.0, 0);
      const upper = cap(0.1, 0.4, blazer); upper.position.y = -0.29;
      const elbow = new THREE.Group(); elbow.position.y = -0.56;
      const fore = cap(0.085, 0.34, blazer); fore.position.y = -0.23;
      const cuff = cyl(0.088, 0.088, 0.05, tee); cuff.position.y = -0.42;
      const hand = sph(0.09, skin, 18, 14);
      hand.scale.set(1, 1.15, 0.75);
      hand.position.y = -0.5;
      const thumb = cap(0.028, 0.05, skin);
      thumb.position.set(0.06 * side, -0.46, 0.03);
      thumb.rotation.z = -0.7 * side;
      elbow.add(fore, cuff, hand, thumb);
      sh.add(upper, elbow);
      sh.userData.elbow = elbow;
      return sh;
    };
    const armL = mkArm(-1), armR = mkArm(1);
    torso.add(armL, armR);

    // ── head ──
    const neck = cyl(0.1, 0.13, 0.2, skin);
    neck.position.y = 1.14;
    torso.add(neck);

    const head = new THREE.Group();
    head.position.y = 1.5;
    torso.add(head);

    const skull = sph(0.4, skin, 30, 24);
    skull.scale.set(0.92, 1.07, 0.96);
    const jaw = sph(0.3, skin, 20, 16);
    jaw.scale.set(0.92, 0.72, 0.9);
    jaw.position.set(0, -0.2, 0.04);

    const hairCap = cast(new THREE.Mesh(
      new THREE.SphereGeometry(0.415, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.44), hair));
    hairCap.scale.set(0.96, 1.02, 0.99);
    hairCap.position.set(0, 0.1, -0.05);
    const quiff = sph(0.15, hair, 18, 14);
    quiff.scale.set(1.55, 0.5, 0.95);
    quiff.position.set(0, 0.38, 0.14);
    quiff.rotation.x = -0.28;

    // beard shell around the jaw, cheeks left clear
    const beard = cast(new THREE.Mesh(
      new THREE.SphereGeometry(0.395, 28, 20, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), hair));
    beard.scale.set(0.94, 1.18, 0.95);
    beard.position.set(0, -0.05, 0.05);
    const stache = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.12, 4, 12), hair));
    stache.rotation.z = Math.PI / 2;
    stache.position.set(0, -0.145, 0.35);

    const earL = sph(0.055, skinDark, 14, 12);
    earL.scale.set(0.5, 1.05, 0.8);
    earL.position.set(-0.37, 0.01, 0);
    const earR = earL.clone(); earR.position.x = 0.37;

    const nose = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.075, 5, 12), skinDark));
    nose.position.set(0, -0.015, 0.38);

    const mkEye = (side) => {
      const g = new THREE.Group();
      g.position.set(0.135 * side, 0.09, 0.32);
      const ball = sph(0.055, white, 18, 14);
      ball.scale.set(1.15, 1, 0.7);
      const ir = sph(0.026, iris, 14, 10); ir.position.z = 0.037;
      const pu = sph(0.013, dark, 10, 8); pu.position.z = 0.056;
      g.add(ball, ir, pu);
      return g;
    };
    const eyeL = mkEye(-1), eyeR = mkEye(1);

    const browL = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.095, 4, 10), hair));
    browL.rotation.z = Math.PI / 2 + 0.1;
    browL.position.set(-0.135, 0.2, 0.345);
    const browR = browL.clone();
    browR.position.x = 0.135; browR.rotation.z = Math.PI / 2 - 0.1;

    const mkFrame = (side) => {
      const f = cast(new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.011, 10, 26), frameMat));
      f.position.set(0.14 * side, 0.09, 0.375);
      f.scale.set(1.3, 1.05, 1);
      return f;
    };
    const frameL = mkFrame(-1), frameR = mkFrame(1);
    const bridge = box(0.075, 0.014, 0.014, frameMat);
    bridge.position.set(0, 0.12, 0.385);
    const templeL = box(0.014, 0.014, 0.3, frameMat);
    templeL.position.set(-0.3, 0.11, 0.23);
    templeL.rotation.y = 0.22;
    const templeR = templeL.clone();
    templeR.position.x = 0.3; templeR.rotation.y = -0.22;

    head.add(skull, jaw, hairCap, quiff, beard, stache, earL, earR, nose,
      eyeL, eyeR, browL, browR, frameL, frameR, bridge, templeL, templeR);

    return {
      kind: 'figure',
      root,
      height: 3.0,
      parts: { torso, head, armL, armR, legL, legR, eyeL, eyeR }
    };
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

  const modelUrl = (stage.dataset.model || '').trim();
  (modelUrl ? loadModel(modelUrl).catch(() => buildFigure()) : Promise.resolve(buildFigure()))
    .then((subject) => run(subject));

  function run(subject) {
    scene.add(subject.root);
    camera.position.set(0.35, subject.height * 0.68, subject.height * 2.55);
    camera.lookAt(0, subject.height * 0.55, 0);
    resize();

    const BPM = 96;
    const clock = new THREE.Clock();
    let elapsed = 0;
    let nextBlink = 2, blinkT = -1;

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
      const beat = (t * BPM) / 60;
      const swing = Math.sin(beat * Math.PI);
      const d = (reduced ? 0 : dance);

      if (coarse && !touchDragging) {
        target.x += ((Math.sin(t * 0.42) * 0.75) - target.x) * Math.min(1, dt * 0.9);
        target.y += ((Math.sin(t * 0.31) * 0.35) - target.y) * Math.min(1, dt * 0.9);
      }
      const hx = clamp(target.x, -1, 1);
      const hy = clamp(target.y, -1, 1);

      subject.root.position.y = Math.abs(swing) * 0.17 * d;
      subject.root.rotation.z = swing * 0.05 * d;
      subject.root.rotation.y += ((hx * 0.16) - subject.root.rotation.y) * Math.min(1, dt * 3);

      const breathe = Math.sin(t * 1.5) * 0.012;

      if (subject.kind === 'figure') {
        const { torso, head, armL, armR, legL, legR, eyeL, eyeR } = subject.parts;
        head.rotation.y += ((hx * 0.55) - head.rotation.y) * Math.min(1, dt * 6);
        head.rotation.x += ((hy * 0.3) - head.rotation.x) * Math.min(1, dt * 6);
        if (d > 0.01) head.rotation.x += Math.sin(beat * Math.PI * 2) * 0.08 * d;

        eyeL.position.x = -0.135 + hx * 0.02;
        eyeR.position.x = 0.135 + hx * 0.02;

        torso.scale.y = 1 + breathe * (1 - d);
        torso.rotation.z = Math.sin(t * 0.5) * 0.03 * (1 - d);
        torso.rotation.y = Math.sin(beat * Math.PI * 0.5) * 0.35 * d;

        const POCKET = { shX: -0.1, shZ: 0.1, elX: -0.45 };
        armL.rotation.x = lerp(POCKET.shX, -0.7 + swing * 1.0, d);
        armR.rotation.x = lerp(POCKET.shX, -0.7 - swing * 1.0, d);
        armL.rotation.z = lerp(POCKET.shZ + breathe, 0.55 + Math.abs(swing) * 0.35, d);
        armR.rotation.z = lerp(-POCKET.shZ - breathe, -0.55 - Math.abs(swing) * 0.35, d);
        armL.userData.elbow.rotation.x = lerp(POCKET.elX, -1.2 + swing * 0.5, d);
        armR.userData.elbow.rotation.x = lerp(POCKET.elX, -1.2 - swing * 0.5, d);
        legL.rotation.x = swing * 0.26 * d;
        legR.rotation.x = -swing * 0.26 * d;
        legL.userData.knee.rotation.x = Math.max(0, -swing) * 0.35 * d;
        legR.userData.knee.rotation.x = Math.max(0, swing) * 0.35 * d;

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
