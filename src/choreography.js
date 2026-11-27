import { Color, Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { colors, pairCues as cue, pairSeconds } from './order.js';
import { dockPoint, home } from './workshop.js';

const neutral = new Color('#87949d');
const parked = { left: [.83, .78, .22], right: [-.83, .78, .45] };
export const framingHome = { x: .04, y: 1.53, z: .20, zoom: 1, lift: 0 };
const stockClosed = -.16;
const stockOpen = 1.39;
const stockPosition = [-1.00, .17, 1.44];
const workPosition = [-1.55, .17, 1.56];
const jigPositions = [[-.77, .73, 1.04], [-.87, .75, 1.32]];
const cartonHeight = 1.14;

export function createRobotMotion(actors) {
  const makeHand = side => ({
    pose: new Vector3(...parked[side]),
    arm: side === 'left' ? actors.armLeft : actors.armRight,
    grip: { weight: 0, aperture: .75, target: null, offset: new Vector3(), angle: new Quaternion() },
  });
  const left = makeHand('left');
  const right = makeHand('right');
  const hands = [['left', left, actors.armLeft], ['right', right, actors.armRight]];
  const targetPosition = new Vector3();
  const torsoInverse = new Quaternion();
  const targetRotation = new Quaternion();
  const restRotation = new Quaternion();
  const gait = { phase: 0, weight: 0, fold: 0 };
  return {
    left, right, gait,
    clear() {
      for (const [side, hand] of hands) {
        hand.pose.set(...parked[side]);
        hand.grip.weight = 0;
        hand.grip.aperture = .75;
        hand.grip.target = null;
      }
      gait.weight = 0;
      gait.fold = 0;
    },
    apply() {
      actors.legs.forEach((leg, index) => {
        const swing = Math.sin(gait.phase + index * Math.PI);
        leg.position.z = swing * .205 * gait.weight;
        leg.position.y = Math.max(0, swing) * .13 * gait.weight;
        leg.rotation.x = swing * .14 * gait.weight;
      });
      actors.robot.getWorldQuaternion(torsoInverse).invert();
      hands.forEach(([, { pose, grip }, arm], index) => {
        const hand = arm.hand.copy(pose);
        hand.y += arm.anchor.position.y;
        hand.z += arm.anchor.position.z + Math.sin(gait.phase + index * Math.PI) * .15 * gait.weight;
        targetRotation.identity();
        if (grip.target && grip.weight) {
          grip.target.localToWorld(targetPosition.copy(grip.offset));
          actors.robot.worldToLocal(targetPosition);
          hand.lerp(targetPosition, grip.weight);
          grip.target.getWorldQuaternion(targetRotation);
          targetRotation.multiply(grip.angle).premultiply(torsoInverse);
          targetRotation.slerp(restRotation, 1 - grip.weight);
        }
        arm.update(gait.fold, targetRotation, grip.aperture, true);
      });
    },
  };
}

export function walk(timeline, actors, motion, to, turn, time, duration) {
  timeline
    .to(actors.robot.rotation, { y: turn, duration: Math.min(1.20, duration), ease: 'sine.inOut' }, time)
    .to(motion.gait, { weight: 1, duration: .18 }, time)
    .to(motion.gait, { phase: '+=' + (Math.max(2, Math.round(duration * 3.2)) * Math.PI), duration, ease: 'none' }, time)
    .to(actors.robot.position, { x: to[0], y: to[1], z: to[2], duration, ease: 'power1.inOut' }, time)
    .to(motion.gait, { weight: 0, duration: .21 }, time + duration - .21);
}

function gripAt(timeline, hand, target, start, offset, duration = .32, angles = [0, 1.12, 0]) {
  timeline.call(() => {
    hand.grip.target = target;
    hand.grip.offset.set(...offset);
    hand.grip.angle.setFromEuler(new Euler(...angles));
  }, [], start);
  timeline.to(hand.grip, { weight: 1, duration, ease: 'sine.inOut' }, start)
    .to(hand.grip, { aperture: .08, duration: .15 }, start + duration - .08);
}

function releaseAt(timeline, hand, time) {
  timeline.to(hand.grip, { aperture: .78, duration: .16 }, time)
    .to(hand.grip, { weight: 0, duration: .36, ease: 'sine.inOut' }, time + .11);
}

function worldGuide(object) {
  const guide = new Object3D();
  object.getWorldPosition(guide.position);
  object.getWorldQuaternion(guide.quaternion);
  return guide;
}

function graspAt(timeline, motion, hand, carrier, time) {
  timeline.call(() => {
    motion.apply();
    hand.arm.anchor.attach(carrier);
  }, [], time);
}

function graspReleaseAt(timeline, motion, hand, object, parent, time) {
  timeline.call(() => {
    motion.apply();
    parent.attach(object);
  }, [], time);
  releaseAt(timeline, hand, time);
}

function aimAtCurrentGrip(hand, guide) {
  hand.arm.anchor.getWorldPosition(guide.position);
  hand.arm.anchor.getWorldQuaternion(guide.quaternion);
  hand.grip.target = guide;
  hand.grip.offset.set(0, 0, 0);
  hand.grip.angle.identity();
}

function placementPose(object, parent, localPosition) {
  const expected = new Matrix4().makeTranslation(localPosition.x, localPosition.y, localPosition.z);
  parent.updateWorldMatrix(true, false);
  object.updateMatrix();
  const matrix = parent.matrixWorld.clone().multiply(expected).multiply(object.matrix.clone().invert());
  const position = new Vector3();
  const orientation = new Quaternion();
  matrix.decompose(position, orientation, new Vector3());
  return { position, orientation };
}

function moveGuide(timeline, guide, getGoal, at, duration) {
  const origin = new Vector3();
  const rotation = new Quaternion();
  const clock = { fraction: 0 };
  let goal;
  timeline.to(clock, { fraction: 1, duration, ease: 'sine.inOut',
    onStart() {
      origin.copy(guide.position);
      rotation.copy(guide.quaternion);
      goal = getGoal();
    },
    onUpdate() {
      if (!goal) return;
      guide.position.lerpVectors(origin, goal.position, clock.fraction);
      guide.quaternion.slerpQuaternions(rotation, goal.orientation, clock.fraction);
    },
  }, at);
}

function resetUnfinishedMaterial(material) {
  material.color.copy(neutral);
  material.roughness = .66;
}

export function resetPair(actors, product, nextBox = false) {
  const model = product.children[0];
  if (!model) return;
  const { bridgeFinish, rimFinishes, templeFinishes, glass, logoMaterials, temples } = model.userData;
  model.userData.assemblyPoints ??= temples.map(temple => temple.position.clone());
  [bridgeFinish, ...rimFinishes, ...templeFinishes].forEach(resetUnfinishedMaterial);
  glass.opacity = 0;
  logoMaterials.forEach(material => { material.opacity = 0; });
  temples.forEach((temple, index) => {
    if (temple.parent !== model) model.add(temple);
    temple.position.copy(model.userData.assemblyPoints[index]);
    temple.rotation.set(0, 0, 0);
    temple.scale.setScalar(1);
    temple.visible = false;
    if (temple.userData.tube.morphTargetInfluences) temple.userData.tube.morphTargetInfluences[0] = 0;
  });
  product.visible = false;
  product.position.set(.32, 1.49, .43);
  product.rotation.set(0, -.11, 0);
  product.scale.setScalar(.60);
  const { billet, drawer, scraps, guns, carton, lid } = actors;
  drawer.position.z = stockClosed;
  billet.visible = true;
  billet.position.set(.32, .654, stockClosed);
  billet.rotation.set(0, 0, 0);
  billet.scale.setScalar(1);
  actors.cutScore.userData.material.opacity = 0;
  scraps.forEach((scrap, index) => {
    scrap.visible = false;
    scrap.position.set(.32, 1.24, index ? .88 : .10);
    scrap.rotation.set(0, 0, 0);
    scrap.scale.setScalar(1);
  });
  for (const { gun, parked, mist } of Object.values(guns)) {
    gun.position.copy(parked);
    gun.rotation.set(0, 0, 0);
    mist.opacity = 0;
  }
  carton.visible = true;
  carton.position.set(0, nextBox ? cartonHeight + 2.9 : cartonHeight, .045);
  carton.scale.set(1.28, 1.06, 1);
  lid.rotation.x = -1.35;
  actors.lever.rotation.x = 0;
  actors.gantry.position.set(-.23, 2.42, .052);
  actors.beamMaterial.color.set('#74fff1');
  actors.beamMaterial.opacity = 0;
  actors.light.intensity = 0;
}

export function animateReceipt(timeline, actors, motion, order, timing) {
  const { ticket, head, reaction, robot } = actors;
  const { printAt, readAt, insertAt, length, seconds, reaction: surprise } = timing;
  const right = motion.right;
  const stage = ticket.parent;
  actors.printTicket(order, timing);
  reaction.visible = false;
  ticket.position.set(-1.04, 1.276, 1.169);
  ticket.rotation.set(0, 0, 0);
  ticket.scale.set(1, .012, 1);
  const paper = worldGuide(ticket);

  walk(timeline, actors, motion, [home[0], .17, 1.46], .26, 0, .82);
  walk(timeline, actors, motion, [-1.92, .17, 1.82], 2.35, .83, .92);
  timeline.set(ticket, { visible: true }, printAt)
    .to(ticket.scale, { y: length, duration: seconds, ease: 'none' }, printAt)
    .to(head.rotation, { y: -.13, x: .30, duration: .42 }, 1.66);

  const take = printAt + seconds;
  gripAt(timeline, right, paper, take, [-.13, -.04, .015], .36, [0, 2.26, 0]);
  graspAt(timeline, motion, right, ticket, take + .38);
  timeline.to(paper.position, { x: -1.045, y: 1.45, z: 1.50, duration: .33, ease: 'sine.inOut' }, take + .39)
    .to(paper.position, { x: -.98, y: 1.82, z: 1.67, duration: .37, ease: 'sine.inOut' }, take + .72);
  walk(timeline, actors, motion, [-1.92, .17, 1.79], 1.18, take + 1.04, .86);
  timeline.to(paper.position, { x: -1.16, y: 1.91, z: 2.18, duration: .74, ease: 'sine.inOut' }, take + 1.13)
    .to(paper.rotation, { y: .60, duration: .64 }, take + 1.15)
    .to(head.rotation, { y: -.51, x: .19, duration: .57 }, take + 1.60);

  if (surprise) {
    timeline.call(() => actors.faceStyle(86 + surprise * 15, true), [], readAt)
      .set(reaction, { visible: true }, readAt)
      .fromTo(reaction.scale, { x: .1, y: .1, z: .1 }, {
        x: .72 + surprise * .24, y: .72 + surprise * .24, z: .72 + surprise * .24,
        duration: .31, ease: 'back.out(2)', immediateRender: false,
      }, readAt)
      .to(head.rotation, { y: -.64, x: -.08, duration: .34 }, readAt)
      .set(reaction, { visible: false }, insertAt)
      .call(() => actors.faceStyle(80), [], insertAt);
  } else {
    timeline.to(head.rotation, { x: .31, duration: .24, yoyo: true, repeat: 1 }, readAt);
  }

  walk(timeline, actors, motion, [-1.47, .17, 1.55], 2.27, insertAt, .88);
  timeline.to(paper.position, { x: -.70, y: 1.89, z: 1.75, duration: .86, ease: 'sine.inOut' }, insertAt + .03)
    .to(paper.rotation, { x: -1.44, y: 0, duration: .68, ease: 'sine.inOut' }, insertAt + .30)
    .to(head.rotation, { x: .12, y: -.36, duration: .51 }, insertAt + .31)
    .to(paper.position, { x: -.724, y: 1.963, z: 1.20, duration: .57, ease: 'sine.inOut' }, insertAt + .96)
    .to(paper.position, { z: .978, duration: .48, ease: 'sine.inOut' }, insertAt + 1.57);
  graspReleaseAt(timeline, motion, right, ticket, stage, insertAt + 2.10);
  timeline.to(ticket.scale, { y: .012, duration: .48, ease: 'power2.in' }, insertAt + 2.24)
    .set(ticket, { visible: false }, insertAt + 2.73)
    .to(robot.rotation, { y: 1.49, duration: .31 }, insertAt + 2.75);
}

function animateLoading(timeline, actors, motion, product, frame, nextBox) {
  const { head, drawer, billet, scraps, lever, gantry, light, beamMaterial: beam, carton } = actors;
  const left = motion.left;
  const stage = billet.parent;
  const board = worldGuide(billet);
  board.position.z = stockOpen;
  const handle = [-.61, .086, .836];
  const down = [1.12, 0, 0];
  if (nextBox) {
    timeline.to(carton.position, { y: cartonHeight, duration: .68, ease: 'power2.in' }, .02)
      .to(carton.position, { y: cartonHeight + .046, duration: .10, ease: 'power1.out' }, .70)
      .to(carton.position, { y: cartonHeight, duration: .14, ease: 'power1.in' }, .80);
  }
  walk(timeline, actors, motion, stockPosition, 1.04, 0, 1.1);
  timeline.to(frame, { x: -.14, y: 1.30, z: .66, zoom: 1.12, duration: 1.1 }, .25)
    .to(head.rotation, { x: .39, y: -.10, duration: .42 }, 1.05);
  gripAt(timeline, left, drawer, 1.15, handle, .34, down);
  walk(timeline, actors, motion, [-1.0, .17, 2.20], 1.04, 1.59, 1.04);
  timeline.to(drawer.position, { z: stockOpen, duration: 1.04, ease: 'power1.inOut' }, 1.59)
    .to(billet.position, { z: stockOpen, duration: 1.04, ease: 'power1.inOut' }, 1.59);
  releaseAt(timeline, left, 2.65);

  gripAt(timeline, left, board, 3.13, [-.55, .035, .08], .34, down);
  graspAt(timeline, motion, left, billet, 3.50);
  timeline.to(board.position, { y: 1.56, duration: .63, ease: 'sine.inOut' }, 3.53)
    .to(board.position, { z: .44, duration: .93, ease: 'power1.inOut' }, 4.23)
    .to(board.position, { y: 1.233, duration: .43, ease: 'sine.inOut' }, 5.18);
  walk(timeline, actors, motion, stockPosition, 1.04, 4.23, .93);
  graspReleaseAt(timeline, motion, left, billet, stage, 5.63);

  walk(timeline, actors, motion, [-1.0, .17, 2.18], 1.04, 5.98, .67);
  gripAt(timeline, left, drawer, 6.60, handle, .29, down);
  walk(timeline, actors, motion, stockPosition, 1.04, 6.96, 1.02);
  timeline.to(drawer.position, { z: stockClosed, duration: 1.02, ease: 'power1.inOut' }, 6.96);
  releaseAt(timeline, left, 8.01);

  gripAt(timeline, left, lever, cue.cutting + .09, [0, .28, .06], .43, [0, 1.6, 0]);
  timeline.to(lever.rotation, { x: .35, duration: .21, yoyo: true, repeat: 1 }, cue.cutting + .54)
    .to(frame, { x: .18, y: 1.52, z: .42, zoom: 1.24, duration: .96 }, 8.65)
    .to(beam, { opacity: .81, duration: .24 }, 9.02)
    .to(light, { intensity: 5.4, duration: .28 }, 9.02)
    .to(gantry.position, { x: .30, duration: .42, repeat: 4, yoyo: true, ease: 'sine.inOut' }, 9.21)
    .to(actors.cutScore.userData.material, { opacity: 1, duration: .61 }, 9.40)
    .to(billet.scale, { y: .2, duration: .66 }, 10.19)
    .set(product.rotation, { x: -1.13 }, 10.84)
    .set(product.position, { y: 1.26 }, 10.84)
    .set(product, { visible: true }, 10.84)
    .set(scraps, { visible: true }, 10.84)
    .set(billet, { visible: false }, 10.84)
    .to(product.rotation, { x: 0, duration: .91, ease: 'sine.inOut' }, 10.86)
    .to(product.position, { y: 1.49, duration: .91, ease: 'sine.inOut' }, 10.86)
    .to(scraps[0].position, { x: -.27, z: .87, duration: .48 }, 10.96)
    .to(scraps[1].position, { x: -.20, z: .51, duration: .51 }, 10.96)
    .to(scraps[1].rotation, { y: .72, duration: .51 }, 10.96)
    .to(beam, { opacity: 0, duration: .30 }, 11.76)
    .to(light, { intensity: 0, duration: .30 }, 11.76);
  releaseAt(timeline, left, 9.38);
  walk(timeline, actors, motion, workPosition, 1.38, 10.75, 1.17);
}

function animateTemples(timeline, actors, motion, product, frame) {
  const { head, scraps, robot } = actors;
  const stage = robot.parent;
  const model = product.children[0];
  const { temples, assemblyPoints } = model.userData;
  const [second, first] = temples;
  const { left, right } = motion;
  const leftGuide = new Object3D();
  const rightGuide = new Object3D();
  const receiver = new Object3D();
  receiver.position.set(0, -.017, -.41);
  first.add(receiver);

  timeline.to(head.rotation, { y: -.10, x: .36, duration: .48 }, cue.temples);
  for (const [index, start, temple] of [[0, cue.temples, first], [1, 16.47, second]]) {
    const raw = scraps[index];
    const rawGuide = worldGuide(raw);
    rawGuide.position.set(index ? -.20 : -.27, 1.24, index ? .51 : .87);
    if (index) rawGuide.rotation.y = .72;
    const [x, y, z] = jigPositions[index];
    const tube = temple.userData.tube;
    gripAt(timeline, left, rawGuide, start, [-.23, .035, .015], .38, [1.15, 0, 0]);
    graspAt(timeline, motion, left, raw, start + .40);
    timeline.to(rawGuide.position, { y: 1.43, duration: .33, ease: 'sine.inOut' }, start + .43)
      .to(rawGuide.position, { x, y: y + .14, z, duration: .59, ease: 'sine.inOut' }, start + .82)
      .to(rawGuide.rotation, { y: 0, duration: .52 }, start + .87)
      .call(() => {
        motion.apply();
        stage.attach(raw);
        raw.visible = false;
        left.arm.anchor.add(temple);
        temple.position.set(0, 0, 0);
        temple.scale.setScalar(.60);
        temple.quaternion.setFromEuler(new Euler(0, index ? Math.PI : 3.62, 0));
        const inverse = left.arm.anchor.getWorldQuaternion(new Quaternion()).invert();
        temple.quaternion.premultiply(inverse);
        tube.morphTargetInfluences[0] = 1;
        temple.visible = true;
        aimAtCurrentGrip(left, leftGuide);
      }, [], start + 1.45)
      .to(tube.morphTargetInfluences, { 0: 0, duration: .76, ease: 'sine.inOut' }, start + 1.47)
      .to(leftGuide.position, { x: -.74, y: 1.45, z: index ? 1.12 : 1.40, duration: .67, ease: 'sine.inOut' }, start + 2.24);
  }

  gripAt(timeline, right, receiver, 15.22, [0, 0, 0], .39, [0, -1.55, 0]);
  timeline.call(() => {
    motion.apply();
    aimAtCurrentGrip(right, rightGuide);
    right.arm.anchor.attach(first);
  }, [], 15.81);
  releaseAt(timeline, left, 15.86);

  // Keep the guides fixed in front of their own shoulder while walking.
  timeline.call(() => {
    robot.attach(rightGuide);
    robot.attach(leftGuide);
  }, [], 19.56);
  for (const [hand, guide, temple, side] of [[right, rightGuide, first, -1], [left, leftGuide, second, 1]]) {
    moveGuide(timeline, guide, () => ({
      position: new Vector3(side * .63, 1.17, .67),
      orientation: new Quaternion().setFromEuler(new Euler(-1.42, 0, 0)).multiply(temple.quaternion.clone().invert()),
    }), 19.57, .77);
  }

  walk(timeline, actors, motion, [.32, .17, 1.66], 1.46, cue.assembly, 1.47);
  walk(timeline, actors, motion, [.32, .17, 1.37], Math.PI, 22.01, .89);
  timeline.to(frame, { x: .32, y: 1.39, z: .77, zoom: 1.36, lift: 10.8, duration: 1.6, ease: 'sine.inOut' }, 21.0)
    .to(head.rotation, { y: 0, x: .22, duration: .48 }, 22.53)
    .call(() => {
      stage.attach(leftGuide);
      stage.attach(rightGuide);
    }, [], 22.94);

  for (const [index, hand, guide] of [[0, left, leftGuide], [1, right, rightGuide]]) {
    const temple = temples[index];
    const hinge = assemblyPoints[index];
    const approach = hinge.clone().add(new Vector3(index ? .26 : -.26, .21, .28));
    moveGuide(timeline, guide, () => placementPose(temple, model, approach), 23.06, .78);
    moveGuide(timeline, guide, () => placementPose(temple, model, hinge), 23.96, .66);
    graspReleaseAt(timeline, motion, hand, temple, model, 24.73);
  }
  walk(timeline, actors, motion, workPosition, 1.10, 25.19, 1.27);
  timeline.to(frame, { x: .16, y: 1.52, z: .46, zoom: 1.20, lift: 0, duration: 1.22, ease: 'sine.inOut' }, 24.84);
  timeline.call(() => {
    stage.remove(leftGuide, rightGuide);
    first.remove(receiver);
  }, [], 25.98);
}

function animatePaint(timeline, actors, motion, model, order) {
  const { head, guns, beamMaterial: beam } = actors;
  const { bridgeFinish, rimFinishes, templeFinishes, glass, logoMaterials } = model.userData;
  const finish = new Color(colors[order.design.color].hex);
  const paintStart = 28.96;
  const sidePosition = [-.73, .17, 1.53];

  timeline.to(head.rotation, { x: .16, y: .04, duration: .54 }, cue.color + .20);
  walk(timeline, actors, motion, sidePosition, 1.10, 27.30, .95);
  walk(timeline, actors, motion, workPosition, 1.10, 31.12, 1.04);

  const stations = [
    { side: 'left', start: [-.53, 1.58, .82, .80], end: [-.32, 1.53, .93, .99], parkAngle: -.18 },
    { side: 'right', start: [.15, 1.56, 1.35, 1.04], end: [.04, 1.54, 1.23, 1.34], parkAngle: .34 },
  ];
  for (const [index, { side, start, end, parkAngle }] of stations.entries()) {
    const { gun, parked, mist } = guns[side];
    const mount = gun.parent;
    const guide = worldGuide(gun);
    const hand = motion[side];
    gripAt(timeline, hand, guide, 26.58, [-.083, -.018, .015], .32, [1.0, parkAngle, 0]);
    graspAt(timeline, motion, hand, gun, 26.93);
    timeline.to(guide.position, { y: parked.y + .34, duration: .35, ease: 'sine.inOut' }, 26.95)
      .to(guide.position, { x: start[0], y: start[1], z: start[2], duration: 1.21, ease: 'sine.inOut' }, 27.34)
      .to(guide.rotation, { y: start[3], duration: .62 }, 27.75)
      .set(mist.color, { r: finish.r + .18, g: finish.g + .18, b: finish.b + .18 }, paintStart)
      .to(mist, { opacity: .67, duration: .19 }, paintStart)
      .to(guide.position, { x: end[0], y: end[1], z: end[2], duration: 1.42, ease: 'sine.inOut' }, paintStart + .12)
      .to(guide.rotation, { y: end[3], duration: 1.42, ease: 'sine.inOut' }, paintStart + .12)
      .to(mist, { opacity: 0, duration: .20 }, 30.53)
      .to(guide.position, { x: parked.x, y: parked.y + .29, z: parked.z, duration: .99, ease: 'sine.inOut' }, 31.13)
      .to(guide.rotation, { y: 0, duration: .74 }, 31.24)
      .to(guide.position, { y: parked.y, duration: .44, ease: 'sine.inOut' }, 32.14);
    graspReleaseAt(timeline, motion, hand, gun, mount, 32.63);

    for (const [material, delay] of [[templeFinishes[index], .18], [rimFinishes[index], .58]]) {
      timeline.to(material.color, { r: finish.r, g: finish.g, b: finish.b, duration: .76 }, paintStart + delay)
        .to(material, { roughness: .23, duration: .72 }, paintStart + delay);
    }
  }
  timeline.to(bridgeFinish.color, { r: finish.r, g: finish.g, b: finish.b, duration: .62 }, 30.11)
    .to(bridgeFinish, { roughness: .23, duration: .62 }, 30.11)
    .to(glass, { opacity: .22, duration: .63 }, 31.0);
  if (logoMaterials.length) {
    timeline.set(beam.color, { r: 1, g: .11, b: .52 }, cue.marking)
      .to(beam, { opacity: .45, duration: .44, yoyo: true, repeat: 1 }, 33.20)
      .to(logoMaterials, { opacity: 1, duration: .76 }, 33.45);
  }
  walk(timeline, actors, motion, [-.55, .17, 1.50], 1.08, 33.25, 1.18);
}

function animatePacking(timeline, actors, motion, product, frame) {
  const { head, carton, lidGrip, lid, rollers } = actors;
  const { temples } = product.children[0].userData;
  const stage = product.parent;
  const glasses = worldGuide(product);
  const hand = motion.left;
  gripAt(timeline, hand, glasses, cue.inspection, [-.49, .055, .087], .37, [.06, 1.3, 0]);
  graspAt(timeline, motion, hand, product, cue.inspection + .40);
  timeline.to(glasses.position, { x: .44, y: 1.58, z: 1.26, duration: .64, ease: 'sine.inOut' }, cue.inspection + .45)
    .to(glasses.rotation, { y: -.43, x: .11, duration: .77 }, cue.inspection + .70)
    .to(head.rotation, { y: -.21, x: -.15, duration: .46 }, cue.inspection + .89)
    .to(frame, { x: .56, y: 1.52, z: .85, zoom: 1.19, duration: 1.06 }, cue.inspection + 1.06);

  const pack = cue.packing;
  walk(timeline, actors, motion, [2.03, .17, 1.41], 1.12, pack, 1.95);
  timeline.to(glasses.position, { x: 2.90, y: 1.68, z: .89, duration: 1.95, ease: 'sine.inOut' }, pack)
    .to(frame, { x: 1.48, y: 1.48, z: .45, zoom: 1.07, duration: 1.8 }, pack + .12)
    .to(temples[0].rotation, { y: -1.39, duration: .62 }, pack + 1.35)
    .to(temples[1].rotation, { y: 1.51, duration: .65 }, pack + 1.52)
    .to(glasses.rotation, { y: 0, x: -Math.PI / 2, duration: .64 }, pack + 1.82)
    .to(glasses.position, { z: .655, duration: .42, ease: 'sine.inOut' }, pack + 2.16)
    .to(glasses.position, { y: 1.462, duration: .48, ease: 'sine.inOut' }, pack + 2.61);
  graspReleaseAt(timeline, motion, hand, product, stage, pack + 3.12);

  gripAt(timeline, hand, lidGrip, pack + 3.62, [-.01, .028, .012], .40, [.82, .62, 0]);
  timeline.to(lid.rotation, { x: 0, duration: .62, ease: 'sine.inOut' }, pack + 4.03)
    .set(product, { visible: false }, pack + 4.68);
  releaseAt(timeline, hand, pack + 4.71);
  timeline.to(carton.position, { x: 3.27, duration: 1.91, ease: 'sine.inOut' }, cue.conveyor)
    .to(rollers.map(roll => roll.rotation), { y: '-=' + Math.PI * 7.8, duration: 1.91, ease: 'sine.inOut' }, cue.conveyor)
    .to(frame, { x: 2.17, y: 1.46, z: .49, zoom: 1.06, duration: 1.05 }, cue.conveyor)
    .set(carton, { visible: false }, pairSeconds - .05);
}

export function animatePair(timeline, actors, motion, product, order, frame, nextBox) {
  animateLoading(timeline, actors, motion, product, frame, nextBox);
  animateTemples(timeline, actors, motion, product, frame);
  animatePaint(timeline, actors, motion, product.children[0], order);
  animatePacking(timeline, actors, motion, product, frame);
}

export function dockApproach() {
  return [dockPoint[0], .17, .69];
}
