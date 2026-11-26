import { Color, Vector3 } from 'three';
import { colors, pairCues as cue, pairSeconds } from './order.js';
import { dockPoint, home } from './workshop.js';

const neutral = new Color('#87949d');
const parked = { left: [.83, .78, .22], right: [-.83, .78, .45] };
export const framingHome = { x: .04, y: 1.53, z: .20, zoom: 1, lift: 0 };
const stockClosed = -.16;
const stockOpen = 1.39;
const workPosition = [-1.09, .17, 1.51];
const jigPositions = [[-.98, .638, 1.17], [-.88, .638, 1.34]];
const cartonHeight = 1.14;

export function createRobotMotion(actors) {
  const makeHand = side => ({
    pose: new Vector3(...parked[side]),
    grip: { weight: 0, target: null, offset: new Vector3() },
  });
  const left = makeHand('left');
  const right = makeHand('right');
  const hands = [['left', left, actors.armLeft], ['right', right, actors.armRight]];
  const targetPosition = new Vector3();
  const gait = { phase: 0, weight: 0 };
  return {
    left, right, gait,
    clear() {
      for (const [side, hand] of hands) {
        hand.pose.set(...parked[side]);
        hand.grip.weight = 0;
        hand.grip.target = null;
      }
      gait.weight = 0;
    },
    apply() {
      actors.legs.forEach((leg, index) => {
        const swing = Math.sin(gait.phase + index * Math.PI);
        leg.position.z = swing * .205 * gait.weight;
        leg.position.y = Math.max(0, swing) * .13 * gait.weight;
        leg.rotation.x = swing * .14 * gait.weight;
      });
      hands.forEach(([, { pose, grip }, arm], index) => {
        const hand = arm.hand.copy(pose);
        if (grip.target && grip.weight) {
          grip.target.getWorldPosition(targetPosition).add(grip.offset);
          actors.robot.worldToLocal(targetPosition);
          hand.lerp(targetPosition, grip.weight);
        } else {
          hand.z += Math.sin(gait.phase + index * Math.PI) * .15 * gait.weight;
        }
        arm.update();
      });
    },
  };
}

export function walk(timeline, actors, motion, to, turn, time, duration) {
  timeline
    .to(actors.robot.rotation, { y: turn, duration: Math.min(.32, duration), ease: 'sine.inOut' }, time)
    .to(motion.gait, { weight: 1, duration: .18 }, time)
    .to(motion.gait, { phase: '+=' + (Math.max(2, Math.round(duration * 3.2)) * Math.PI), duration, ease: 'none' }, time)
    .to(actors.robot.position, { x: to[0], y: to[1], z: to[2], duration, ease: 'power1.inOut' }, time)
    .to(motion.gait, { weight: 0, duration: .21 }, time + duration - .21);
}

function gripAt(timeline, hand, target, start, offset, duration = .22) {
  timeline.call(() => {
    hand.grip.target = target;
    hand.grip.offset.set(...offset);
  }, [], start);
  timeline.to(hand.grip, { weight: 1, duration }, start);
}

function releaseAt(timeline, hand, time) {
  timeline.to(hand.grip, { weight: 0, duration: .19 }, time);
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
  carton.scale.setScalar(1);
  lid.rotation.x = -1.35;
  actors.lever.rotation.x = 0;
  actors.gantry.position.set(-.23, 2.42, .052);
  actors.beamMaterial.color.set('#74fff1');
  actors.beamMaterial.opacity = 0;
  actors.light.intensity = 0;
}

export function animateReceipt(timeline, actors, motion, order, timing) {
  const { ticket, robot, head, reaction } = actors;
  const { printAt, readAt, insertAt, length, seconds, reaction: surprise } = timing;
  actors.printTicket(order, timing);
  reaction.visible = false;
  ticket.position.set(-1.04, 1.276, 1.169);
  ticket.rotation.set(0, 0, 0);
  ticket.scale.set(1, .012, 1);

  // Walk into the front aisle before turning the right shoulder toward the printer.
  walk(timeline, actors, motion, [home[0], .17, 1.50], .13, 0, .73);
  walk(timeline, actors, motion, [-2.01, .17, 1.66], 2.96, .74, .86);
  timeline.set(ticket, { visible: true }, printAt)
    .to(ticket.scale, { y: length, duration: seconds, ease: 'none' }, printAt)
    .to(head.rotation, { y: -.29, x: .28, duration: .41 }, 1.52);

  const takeAt = printAt + seconds;
  gripAt(timeline, motion.right, ticket, takeAt, [-.15, -.08, .115], .26);
  timeline.to(ticket.position, { x: -1.43, y: 2.36, z: 1.76, duration: .50, ease: 'power2.out' }, takeAt + .28)
    .to(ticket.position, { x: -2.65, y: 2.32, z: 2.29, duration: .61, ease: 'power1.inOut' }, takeAt + .78)
    .to(head.rotation, { y: -.16, x: .24, duration: .46 }, takeAt + .88);
  walk(timeline, actors, motion, [-2.05, .17, 1.61], .19, takeAt + .66, .78);

  if (surprise) {
    timeline.call(() => actors.faceStyle(86 + surprise * 15, true), [], readAt)
      .set(reaction, { visible: true }, readAt)
      .fromTo(reaction.scale, { x: .1, y: .1, z: .1 }, {
        x: .72 + surprise * .24, y: .72 + surprise * .24, z: .72 + surprise * .24,
        duration: .31, ease: 'back.out(2)',
      }, readAt)
      .to(head.rotation, { y: surprise > 1 ? -.13 : .14, x: -.13, duration: .38 }, readAt)
      .set(reaction, { visible: false }, insertAt)
      .call(() => actors.faceStyle(80), [], insertAt);
  } else {
    timeline.to(head.rotation, { x: .31, duration: .24, yoyo: true, repeat: 1 }, readAt);
  }

  // Keep the sheet in front of the machine until it aligns with the slot.
  walk(timeline, actors, motion, [-1.53, .17, 1.60], 2.59, insertAt, .87);
  timeline.to(head.rotation, { y: -.28, x: .04, duration: .42 }, insertAt + .37)
    .to(ticket.position, { x: -1.17, y: 2.45, z: 1.94, duration: .84, ease: 'power1.inOut' }, insertAt + .03)
    .to(ticket.position, { x: -.75, y: 2.48, z: .672, duration: .68, ease: 'power2.inOut' }, insertAt + .92)
    .to(ticket.rotation, { x: -.34, duration: .49 }, insertAt + 1.03)
    .to(ticket.scale, { y: .012, duration: .42, ease: 'power2.in' }, insertAt + 1.60)
    .set(ticket, { visible: false }, insertAt + 2.02);
  releaseAt(timeline, motion.right, insertAt + 2.03);
}

function animateLoading(timeline, actors, motion, product, frame, nextBox) {
  const { head, drawer, billet, scraps, lever, gantry, light, beamMaterial: beam, carton } = actors;
  if (nextBox) {
    timeline.to(carton.position, { y: cartonHeight, duration: .68, ease: 'power2.in' }, .02)
      .to(carton.position, { y: cartonHeight + .046, duration: .10, ease: 'power1.out' }, .70)
      .to(carton.position, { y: cartonHeight, duration: .14, ease: 'power1.in' }, .80);
  }
  walk(timeline, actors, motion, workPosition, 1.08, 0, 1.45);
  timeline.to(frame, { x: -.14, y: 1.30, z: .66, zoom: 1.12, duration: 1.1 }, .25)
    .to(head.rotation, { x: .39, y: -.10, duration: .42 }, 1.31);
  gripAt(timeline, motion.right, drawer, 1.45, [-.37, .088, .866]);
  timeline.to(drawer.position, { z: stockOpen, duration: 1.15, ease: 'power2.inOut' }, 1.71)
    .to(billet.position, { z: stockOpen, duration: 1.15, ease: 'power2.inOut' }, 1.71);
  releaseAt(timeline, motion.right, 2.88);
  gripAt(timeline, motion.right, billet, 3.16, [-.56, .10, .16]);
  timeline.to(billet.position, { y: 1.53, duration: .60, ease: 'power2.inOut' }, 3.42)
    .to(billet.position, { z: .44, duration: .69, ease: 'power2.inOut' }, 4.02)
    .to(billet.position, { y: 1.23, duration: .35, ease: 'power1.in' }, 4.71);
  releaseAt(timeline, motion.right, 5.07);
  gripAt(timeline, motion.right, drawer, 5.29, [-.37, .088, .866], .13);
  timeline.to(drawer.position, { z: stockClosed, duration: .56, ease: 'power2.inOut' }, 5.43);
  releaseAt(timeline, motion.right, 5.99);

  gripAt(timeline, motion.left, lever, cue.cutting + .21, [0, .25, .085], .18);
  timeline.to(lever.rotation, { x: .35, duration: .24, yoyo: true, repeat: 1 }, cue.cutting + .41)
    .to(frame, { x: .18, y: 1.52, z: .42, zoom: 1.24, duration: .96 }, 6.32)
    .to(beam, { opacity: .81, duration: .24 }, 6.82)
    .to(light, { intensity: 5.4, duration: .28 }, 6.82)
    .to(gantry.position, { x: .30, duration: .52, repeat: 4, yoyo: true, ease: 'sine.inOut' }, 6.95)
    .to(actors.cutScore.userData.material, { opacity: 1, duration: .77 }, 7.25)
    .to(billet.scale, { y: .2, duration: .82 }, 7.82)
    .set(product, { visible: true }, 8.64)
    .set(scraps, { visible: true }, 8.64)
    .set(billet, { visible: false }, 8.64)
    .fromTo(product.rotation, { x: -1.13 }, { x: 0, duration: 1.05, ease: 'power1.inOut', immediateRender: false }, 8.68)
    .fromTo(product.position, { y: 1.26 }, { y: 1.49, duration: 1.02, ease: 'power1.out', immediateRender: false }, 8.68)
    .to(beam, { opacity: 0, duration: .30 }, 9.62)
    .to(light, { intensity: 0, duration: .30 }, 9.62);
  releaseAt(timeline, motion.left, 7.14);
}

function animateTemples(timeline, actors, motion, product, frame) {
  const { head, scraps, robot } = actors;
  const model = product.children[0];
  const { temples, assemblyPoints } = model.userData;
  const first = temples[1];
  const second = temples[0];
  const left = motion.left;
  const right = motion.right;
  const handoff = model.worldToLocal(new Vector3(-.99, 1.33, 1.93));

  timeline.to(head.rotation, { y: -.23, x: .40, duration: .46 }, cue.temples);
  for (const [index, start, temple] of [[0, 10, first], [1, 12.68, second]]) {
    const raw = scraps[index];
    const [x, y, z] = jigPositions[index];
    gripAt(timeline, left, raw, start, [-.28, .07, .08]);
    timeline.to(raw.position, { y: 1.50, duration: .23 }, start + .21)
      .to(raw.position, { x, y: y + .11, z, duration: .50, ease: 'power1.inOut' }, start + .43)
      .to(raw.scale, { x: .74, z: .55, duration: .32 }, start + .93)
      .set(raw, { visible: false }, start + 1.25)
      .call(() => {
        temple.position.copy(model.worldToLocal(new Vector3(x - .15, y + .11, z)));
        temple.rotation.set(0, -Math.PI / 2, 0);
        temple.visible = true;
        left.grip.target = temple;
        left.grip.offset.set(-.17, .04, -.07);
      }, [], start + 1.25);
    if (index === 0) {
      timeline.to(temple.position, { x: handoff.x, y: handoff.y, z: handoff.z, duration: .61, ease: 'power1.inOut' }, start + 1.33);
      gripAt(timeline, right, temple, start + 1.94, [.09, .06, .15], .34);
      releaseAt(timeline, left, start + 2.28);
      timeline.call(() => robot.attach(temple), [], start + 2.49)
        .to(temple.position, { x: -.51, y: 1.00, z: .61, duration: .38 }, start + 2.51)
        .to(temple.rotation, { x: 0, y: -1.36, z: 0, duration: .38 }, start + 2.51);
    } else {
      timeline.call(() => robot.attach(temple), [], start + 1.32)
        .to(temple.position, { x: .50, y: 1.02, z: .61, duration: .48 }, start + 1.35)
        .to(temple.rotation, { x: 0, y: 1.36, z: 0, duration: .48 }, start + 1.35);
    }
  }

  // Each finished temple rides with its hand while the robot moves into position.
  walk(timeline, actors, motion, [.32, .17, 1.69], 1.46, cue.assembly, 1.33);
  walk(timeline, actors, motion, [.32, .17, 1.65], Math.PI, 16.54, .57);
  timeline.to(frame, { x: .32, y: 1.32, z: .82, zoom: 1.23, lift: 12.5, duration: 1.38, ease: 'power2.inOut' }, 15.40)
    .to(head.rotation, { y: 0, x: .18, duration: .44 }, 16.92);

  for (const [index, hand] of [[0, left], [1, right]]) {
    const temple = temples[index];
    const hinge = assemblyPoints[index];
    const side = index ? 1 : -1;
    timeline.call(() => {
      model.attach(temple);
      hand.grip.offset.set(side * .12, .055, .15);
    }, [], 17.22)
      .to(temple.position, { x: hinge.x + side * .32, y: hinge.y + .13, z: hinge.z + .28, duration: .70, ease: 'power1.inOut' }, 17.23)
      .to(temple.rotation, { x: 0, y: 0, z: 0, duration: .66 }, 17.23)
      .to(temple.position, { x: hinge.x, y: hinge.y, z: hinge.z, duration: .57, ease: 'power2.inOut' }, 17.99);
    releaseAt(timeline, hand, 18.61);
  }
  walk(timeline, actors, motion, workPosition, -1.47, 18.90, 1.05);
  timeline.to(frame, { x: .16, y: 1.52, z: .46, zoom: 1.20, lift: 0, duration: 1.22, ease: 'power2.inOut' }, 18.76);
}

function animatePaint(timeline, actors, motion, model, order) {
  const { robot, head, guns, beamMaterial: beam } = actors;
  const { bridgeFinish, rimFinishes, templeFinishes, glass, logoMaterials } = model.userData;
  const finish = new Color(colors[order.design.color].hex);
  const paintStart = 22.13;

  timeline.to(robot.rotation, { y: 1.14, duration: .46, ease: 'power1.inOut' }, cue.color)
    .to(head.rotation, { x: .14, y: .05, duration: .53 }, cue.color + .20);
  const stations = [
    { side: 'left', start: [-.56, 1.61, .82, .80], end: [-.33, 1.52, .92, .99] },
    { side: 'right', start: [.21, 1.56, 1.27, 1.08], end: [.06, 1.51, 1.21, 1.36] },
  ];
  for (const [index, { side, start, end }] of stations.entries()) {
    const { gun, parked, mist } = guns[side];
    const hand = motion[side];
    gripAt(timeline, hand, gun, cue.color + .46, [-.09, -.058, index ? .07 : -.055], .36);
    timeline.to(gun.position, { x: parked.x, y: parked.y + .42, z: parked.z, duration: .40 }, 20.88)
      .to(gun.position, { x: start[0], y: start[1], z: start[2], duration: .76, ease: 'power2.inOut' }, 21.30)
      .to(gun.rotation, { y: start[3], duration: .47 }, 21.45)
      .set(mist.color, { r: finish.r + .18, g: finish.g + .18, b: finish.b + .18 }, paintStart)
      .to(mist, { opacity: .67, duration: .19 }, paintStart)
      .to(gun.position, { x: end[0], y: end[1], z: end[2], duration: 1.83, ease: 'sine.inOut' }, paintStart + .12)
      .to(gun.rotation, { y: end[3], duration: 1.83, ease: 'sine.inOut' }, paintStart + .12)
      .to(mist, { opacity: 0, duration: .20 }, 24.11)
      .to(gun.position, { x: parked.x, y: parked.y + .29, z: parked.z, duration: .83, ease: 'power1.inOut' }, 24.43)
      .to(gun.rotation, { y: 0, duration: .61 }, 24.48)
      .to(gun.position, { y: parked.y, duration: .48, ease: 'power1.inOut' }, 25.28);
    releaseAt(timeline, hand, 25.79);

    for (const [material, delay] of [[templeFinishes[index], .20], [rimFinishes[index], .68]]) {
      timeline.to(material.color, { r: finish.r, g: finish.g, b: finish.b, duration: .76 }, paintStart + delay)
        .to(material, { roughness: .23, duration: .72 }, paintStart + delay);
    }
  }
  timeline.to(bridgeFinish.color, { r: finish.r, g: finish.g, b: finish.b, duration: .64 }, 23.45)
    .to(bridgeFinish, { roughness: .23, duration: .64 }, 23.45)
    .to(glass, { opacity: .22, duration: .68 }, 24.34);
  if (logoMaterials.length) {
    timeline.set(beam.color, { r: 1, g: .11, b: .52 }, cue.marking)
      .to(beam, { opacity: .45, duration: .44, yoyo: true, repeat: 1 }, 26.70)
      .to(logoMaterials, { opacity: 1, duration: .76 }, 26.86);
  }
}

function animatePacking(timeline, actors, motion, product, frame) {
  const { head, carton, lidGrip, lid, rollers } = actors;
  const { temples } = product.children[0].userData;
  gripAt(timeline, motion.right, product, cue.inspection, [-.35, .044, .028]);
  timeline.to(product.position, { x: .08, y: 1.80, z: 1.43, duration: .67, ease: 'power2.out' }, cue.inspection + .25)
    .to(product.rotation, { y: -.56, x: .11, duration: .90 }, cue.inspection + .63)
    .to(head.rotation, { y: .02, x: -.17, duration: .46 }, cue.inspection + .88)
    .to(frame, { x: .56, y: 1.52, z: .85, zoom: 1.19, duration: 1.06 }, cue.inspection + 1.06);

  const pack = cue.packing;
  walk(timeline, actors, motion, [1.91, .17, 1.43], 1.21, pack, 1.95);
  timeline.to(product.position, { x: 2.89, y: 1.85, z: .77, duration: 1.95, ease: 'power1.inOut' }, pack)
    .to(frame, { x: 1.48, y: 1.48, z: .45, zoom: 1.07, duration: 1.8 }, pack + .12)
    .to(temples[0].rotation, { y: -1.39, duration: .62 }, pack + 1.35)
    .to(temples[1].rotation, { y: 1.51, duration: .65 }, pack + 1.52)
    .to(product.rotation, { y: 0, x: -Math.PI / 2, duration: .58 }, pack + 1.70)
    .to(product.scale, { x: .42, y: .42, z: .42, duration: .52 }, pack + 1.72)
    .to(product.position, { y: 1.48, z: .655, duration: .45, ease: 'power2.inOut' }, pack + 2.14);
  releaseAt(timeline, motion.right, pack + 2.63);
  gripAt(timeline, motion.left, lidGrip, pack + 2.91, [-.03, .085, .058], .15);
  timeline.to(lid.rotation, { x: 0, duration: .57, ease: 'power2.inOut' }, pack + 3.07)
    .set(product, { visible: false }, pack + 3.65);
  releaseAt(timeline, motion.left, pack + 3.72);
  timeline.to(carton.position, { x: 3.09, duration: 1.91, ease: 'sine.inOut' }, cue.conveyor)
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
