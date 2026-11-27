import * as T from 'three';
import { gsap } from 'gsap';
import { box, disposeModel, drawFlatPreview, makeCutScore, makeGlasses } from './glasses.js';
import { buildWorkshop, dockPoint, home } from './workshop.js';
import { animatePair, animateReceipt, createRobotMotion, dockApproach, framingHome, resetPair, walk } from './choreography.js';
import { createPhotoStudio } from './photo.js';
import { defaultDesign, pairPhaseAt, pairRate, pairSeconds, receiptTiming, rechargeSeconds, recordDispatch } from './order.js';

function rendererFor(host) {
  const attributes = { alpha: false, antialias: true, preserveDrawingBuffer: true };
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', attributes);
  if (!context) return null;
  const renderer = new T.WebGLRenderer({ canvas, context, ...attributes });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  host.append(canvas);
  return renderer;
}

function viewCamera(position, target) {
  const camera = new T.OrthographicCamera(-4, 4, 2, -2, .12, 55);
  camera.position.set(...position);
  camera.lookAt(...target);
  return camera;
}

function fitCamera(camera, aspect, width, height) {
  const fullHeight = Math.max(height, width / aspect);
  const fullWidth = aspect * fullHeight;
  camera.left = -fullWidth / 2;
  camera.right = fullWidth / 2;
  camera.top = fullHeight / 2;
  camera.bottom = -fullHeight / 2;
  camera.updateProjectionMatrix();
}

function createProductStage() {
  const scene = new T.Scene();
  scene.background = new T.Color('#0d162d');
  scene.fog = new T.Fog('#0f1930', 8, 28);
  const camera = viewCamera([4.75, 2.62, 5.4], [0, -.11, -.45]);
  const key = new T.DirectionalLight('#e8faff', 3);
  key.position.set(-3, 6, 5);
  const rim = new T.DirectionalLight('#ff7ac4', 2.15);
  rim.position.set(4, 2, -4);
  scene.add(key, rim, new T.HemisphereLight('#b9f9ff', '#7e4483', 1.5));
  const mat = new T.MeshStandardMaterial({ color: '#273953', roughness: .45 });
  const floor = new T.Mesh(new T.PlaneGeometry(100, 100), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.79;
  scene.add(floor);
  box(scene, [2.69, .23, 1.87], [0, -.65, -.43], mat, .092);
  box(scene, [2.68, .019, 1.86], [0, -.69, -.43], new T.MeshBasicMaterial({color: '#4cfff1'}), .009);
  const pivot = new T.Group();
  pivot.position.z = -.44;
  const cradle = new T.Group();
  cradle.position.z = .44;
  pivot.add(cradle);
  scene.add(pivot);
  return { scene, camera, pivot, cradle };
}

function idleAnimation(actors, motion) {
  const idle = gsap.timeline({ repeat: -1, paused: true });
  const head = actors.head.rotation;
  const hand = motion.right.pose;
  idle.to(head, { y: .37, x: -.07, duration: 1.16, ease: 'sine.inOut' })
    .to(hand, { x: -.93, y: 1.14, z: .59, duration: .96 }, .35)
    .to(head, { y: -.27, x: .08, duration: 1.25, ease: 'sine.inOut' }, 1.3)
    .to(hand, { x: -.86, y: .79, z: .44, duration: 1.12 }, 1.65)
    .to(motion.left.pose, { y: .91, z: .34, duration: .69, repeat: 1, yoyo: true }, 2.3)
    .call(actors.faceStyle, [9], 2.7)
    .call(actors.faceStyle, [80], 2.86)
    .to(head, { y: 0, x: 0, duration: 1.05 }, 3.34);
  return idle;
}

export function createStage(host, onRobotState) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = rendererFor(host);
  const workshop = renderer ? new T.Scene() : null;
  const actors = workshop ? buildWorkshop(workshop) : null;
  const motion = actors ? createRobotMotion(actors) : null;
  const product = workshop ? new T.Group() : null;
  const workshopCamera = workshop ? viewCamera([3.9, 4.4, 12.4], [framingHome.x, framingHome.y, framingHome.z]) : null;
  const framing = { ...framingHome };
  const preview = renderer ? createProductStage() : null;
  const idle = actors ? idleAnimation(actors, motion) : null;
  let design;
  let image;
  let panel = 'workshop';
  let playhead;
  let paused = false;
  let active = true;
  let flatImage;
  let captures = {};
  let photoStudio;
  let previewMotion;
  let robotTravel;
  let chargeTimer;
  let robotState = 'ready';
  let batch;
  let pending;
  let pointer;

  function notify(state, remaining) {
    const changed = robotState !== state;
    robotState = state;
    onRobotState?.(state, remaining, changed);
  }

  function render() {
    if (!renderer || panel === 'photo') return;
    if (panel === 'product') {
      renderer.render(preview.scene, preview.camera);
      return;
    }
    motion.apply();
    if (workshopCamera.zoom !== framing.zoom) {
      workshopCamera.zoom = framing.zoom;
      workshopCamera.updateProjectionMatrix();
    }
    const lift = framing.lift;
    workshopCamera.position.set(3.9 - lift * .13, 4.4 + lift, 12.4 - lift * .50);
    workshopCamera.lookAt(framing.x, framing.y, framing.z);
    renderer.render(workshop, workshopCamera);
  }

  function tick() {
    const moving = panel === 'product' ? previewMotion?.isActive() :
      idle?.isActive() || playhead?.isActive() || robotTravel?.isActive();
    if (active && moving && !paused && !reducedMotion.matches) render();
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    fitCamera(workshopCamera, aspect, 12.15, 5.35);
    fitCamera(preview.camera, aspect, 3.35, 2.02);
    render();
  }

  function setDesign(next, logoImage) {
    const frameChanged = design && next.frame !== design.frame;
    const colorChanged = design && next.color !== design.color;
    const logoChanged = design && next.logo !== design.logo;
    const quantityChanged = design && next.quantity !== design.quantity;
    const modelChanged = !design || frameChanged || colorChanged || logoChanged;
    actors?.screenPaint(quantityChanged ? 'QTY SET' : 'READY', next);
    design = { ...next };
    image = logoImage;
    if (modelChanged) {
      captures = {};
      if (renderer) {
        if (!actors.cutScore || frameChanged) {
          if (actors.cutScore) {
            actors.billet.remove(actors.cutScore);
            disposeModel(actors.cutScore);
          }
          actors.cutScore = makeCutScore(design.frame);
          actors.billet.add(actors.cutScore);
        }
        for (const group of [product, preview.cradle]) {
          for (const previous of [...group.children]) {
            group.remove(previous);
            disposeModel(previous);
          }
          group.add(makeGlasses(design, image));
        }
        product.visible = false;
        if (robotState === 'ready' && !batch) resetPair(actors, product);
        if (!paused && !reducedMotion.matches && (frameChanged || colorChanged || logoChanged)) {
          previewMotion?.kill();
          const angle = logoChanged ? -.29 : frameChanged ? .24 : -.16;
          previewMotion = gsap.fromTo(preview.pivot.rotation, { y: angle }, {
            y: 0, duration: .85, ease: 'power2.out', onComplete: render,
          });
        }
      }
    }
    if (flatImage && panel === 'product') flatImage.src = capture('product');
    render();
  }

  function capture(view = 'photo') {
    if (captures[view]) return captures[view];
    if (!renderer) {
      const flat = drawFlatPreview(design, image);
      captures = { photo: flat, product: flat };
      return flat;
    }
    if (view === 'photo') {
      photoStudio ??= createPhotoStudio(renderer);
      captures.photo = photoStudio.capture(design, image);
    } else {
      renderer.setSize(940, 550, false);
      fitCamera(preview.camera, 940 / 550, 3.06, 1.92);
      const angle = preview.pivot.rotation.y;
      preview.pivot.rotation.y = 0;
      renderer.render(preview.scene, preview.camera);
      captures.product = renderer.domElement.toDataURL('image/png');
      preview.pivot.rotation.y = angle;
    }
    resize();
    return captures[view];
  }

  function setView(view) {
    panel = view;
    host.dataset.orbit = String(Boolean(renderer && view === 'product'));
    if (renderer) renderer.domElement.hidden = view === 'photo';
    else {
      if (!flatImage && view === 'product') {
        flatImage = document.createElement('img');
        flatImage.className = 'fallback-product';
        flatImage.alt = '';
        host.append(flatImage);
      }
      if (flatImage) {
        flatImage.hidden = view !== 'product';
        if (view === 'product') flatImage.src = capture('product');
      }
    }
    updateMotion();
  }

  function updateMotion() {
    idle?.paused(robotState !== 'ready' || paused || !active || reducedMotion.matches || panel !== 'workshop');
    if (previewMotion?.progress() < 1) {
      if (reducedMotion.matches) previewMotion.progress(1);
      else previewMotion.paused(paused || !active || panel !== 'product');
    }
    if (playhead?.progress() < 1) playhead.paused(paused);
    render();
  }

  function reset() {
    if (playhead) playhead.kill();
    playhead = null;
    previewMotion?.kill();
    if (actors) {
      actors.ticket.visible = false;
      actors.reaction.visible = false;
      preview.pivot.rotation.y = 0;
      Object.assign(framing, framingHome);
    }
    updateMotion();
  }

  function leaveDock() {
    clearInterval(chargeTimer);
    chargeTimer = undefined;
    notify('waking');
    actors?.chargeLevel(1, false);
    actors?.faceStyle(80);
    actors?.setDoorDisplay(null);
    render();
    function arrive() {
      if (pending) {
        const job = pending;
        pending = null;
        beginReceipt(job);
      } else {
        notify('ready');
        updateMotion();
      }
    }
    if (!actors) {
      robotTravel = gsap.delayedCall(1.15, arrive);
      return;
    }
    robotTravel = gsap.timeline({ onComplete: arrive });
    robotTravel.to(actors.shutter.scale,{y:.016,duration:.75,ease:'power2.inOut'},0);
    walk(robotTravel, actors, motion, [dockPoint[0], dockPoint[1] + .032, dockApproach()[2]], 0, .80, 1.03);
    robotTravel.to(motion.gait,{fold:0,duration:.46},1.84);
    walk(robotTravel, actors, motion, home, 1.14, 1.84, 1.21);
    robotTravel.to(actors.robot.rotation, {y:.02,duration:.27},3.05)
      .to(framing, {...framingHome, duration:1.32, ease:'power1.inOut'},1.84);
  }

  function charge() {
    if (pending) {
      leaveDock();
      return;
    }
    notify('charging', rechargeSeconds);
    actors?.faceStyle(11);
    actors?.chargeLevel(0, true);
    actors?.setDoorDisplay(rechargeSeconds);
    render();
    const deadline = Date.now() + rechargeSeconds * 1000;
    let previous = rechargeSeconds;
    chargeTimer = setInterval(() => {
      const seconds = Math.max(0, (deadline - Date.now()) / 1000);
      const remaining = Math.ceil(seconds);
      if (remaining !== previous) {
        previous = remaining;
        notify('charging', remaining);
        actors?.chargeLevel(1 - seconds / rechargeSeconds, true);
        actors?.setDoorDisplay(remaining);
        render();
      }
      if (seconds === 0) leaveDock();
    }, 100);
  }

  function returnToDock() {
    notify('returning');
    if (!actors) {
      robotTravel = gsap.delayedCall(3.6, charge);
      return;
    }
    motion.clear();
    robotTravel = gsap.timeline({ onComplete: charge });
    walk(robotTravel, actors, motion, [1.83, .17, 2.23], -.52, 0, .57);
    walk(robotTravel, actors, motion, [dockPoint[0], .17, 2.23], -1.52, .58, 2.46);
    walk(robotTravel, actors, motion, dockApproach(), -Math.PI, 3.05, .86);
    robotTravel.to(motion.gait,{fold:1,duration:.56},3.10);
    robotTravel.to(framing,{x:-2.56,y:1.54,z:.11,zoom:1.23,duration:1.49,ease:'power1.inOut'},3.08);
    robotTravel.to(actors.robot.position,{y:dockPoint[1]+.032,duration:.24},3.92);
    walk(robotTravel, actors, motion, [dockPoint[0], dockPoint[1] + .032, dockPoint[2]], -Math.PI, 4.18, 1.12);
    robotTravel.to(actors.robot.rotation, {y:.02,duration:.42},5.32)
      .to(actors.head.rotation, {y:.02,x:.12,duration:.39},5.32)
      .to(motion.right.pose,{x:-.57,y:.82,z:.30,duration:.36},5.36)
      .to(motion.left.pose,{x:.57,y:.82,z:.30,duration:.36},5.36)
      .to(actors.shutter.scale,{y:1,duration:.78,ease:'power2.inOut'},5.83);
  }

  function emit(phase, extra = {}) {
    batch?.callbacks.update({
      phase,
      completed: batch.completed,
      total: batch.order.design.quantity,
      rate: pairRate(batch.order.design.quantity, batch.completed, batch.override),
      ...extra,
    });
    if (reducedMotion.matches) render();
  }

  function beginReceipt(job) {
    batch = job;
    idle?.pause(0, true);
    motion?.clear();
    actors?.faceStyle(80);
    if (actors) resetPair(actors, product);
    Object.assign(framing, { x: -1.61, y: 1.57, z: .76, zoom: 1.23, lift: 0 });
    notify('working');
    const timing = receiptTiming(job.order.design.quantity);
    let lastPart;
    playhead = gsap.timeline({
      paused:true, onComplete:beginPair,
      onUpdate() {
        const time = this.time();
        const part = time >= timing.insertAt ? 'insert' : time >= timing.readAt ? 'read' :
          time >= timing.printAt + timing.seconds ? 'take' : 'print';
        if (lastPart !== part) {
          lastPart = part;
          emit('ticket',{part,receipt:timing});
        }
      },
    });
    playhead.to({}, {duration:timing.duration},0);
    if (actors) animateReceipt(playhead, actors, motion, job.order, timing);
    updateMotion();
  }

  function beginPair() {
    const job = batch;
    const total = job.order.design.quantity;
    const nextBox = job.completed > 0;
    motion?.clear();
    if (actors) resetPair(actors, product, nextBox);
    let lastPhase;
    let lastSecond = -1;
    playhead = gsap.timeline({
      paused: true,
      onUpdate() {
        const position = this.time();
        const phase = pairPhaseAt(position);
        if (phase !== lastPhase) {
          lastPhase = phase;
          emit(phase);
        }
        const second = Math.floor(position);
        if (reducedMotion.matches && second !== lastSecond) {
          lastSecond = second;
          render();
        }
      },
      onComplete() {
        job.completed = recordDispatch(job.completed, total);
        if (job.completed < total) {
          beginPair();
        } else {
          Object.assign(framing, framingHome);
          emit('complete');
          batch = null;
          returnToDock();
          job.callbacks.complete();
        }
      },
    });
    playhead.to({}, {duration:pairSeconds},0);
    if (actors) animatePair(playhead, actors, motion, product, job.order, framing, nextBox);
    playhead.timeScale(pairRate(total, job.completed, job.override));
    emit('loading');
    updateMotion();
  }

  function start(order, callbacks) {
    reset();
    const job = { order, callbacks, completed:0, override:undefined };
    if (robotState === 'ready') {
      beginReceipt(job);
    } else {
      pending = job;
      callbacks.update({phase:'waiting',completed:0,total:order.design.quantity,rate:1});
      if (robotState === 'charging') leaveDock();
    }
  }

  function status(mode, order) {
    actors?.screenPaint(mode, order.design, order);
    render();
  }

  if (renderer) {
    workshop.add(product);
    gsap.ticker.add(tick);
    new ResizeObserver(resize).observe(host);
    new IntersectionObserver(([entry]) => {
      active = entry.isIntersecting;
      updateMotion();
    }).observe(host);
    reducedMotion.addEventListener('change', updateMotion);
    host.addEventListener('pointerdown', event => {
      if (panel !== 'product' || event.button !== 0) return;
      previewMotion?.kill();
      host.setPointerCapture(event.pointerId);
      pointer = { id: event.pointerId, start: event.clientX, angle: preview.pivot.rotation.y };
    });
    host.addEventListener('pointermove', event => {
      if (pointer?.id !== event.pointerId || panel !== 'product') return;
      preview.pivot.rotation.y = pointer.angle + (event.clientX - pointer.start) * .012;
      render();
    });
    host.addEventListener('lostpointercapture', () => { pointer = null; });
    resize();
    updateMotion();
  }
  setDesign(defaultDesign);

  return {
    enabled: Boolean(renderer), setDesign, setView, capture, start, status, reset,
    pause(value) { paused = value; updateMotion(); },
    speed(value) {
      const job = batch ?? pending;
      if (!job) return;
      job.override = value;
      if (batch && playhead?.duration() >= pairSeconds) playhead.timeScale(value);
    },
  };
}
