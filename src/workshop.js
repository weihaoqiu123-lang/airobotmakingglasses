import * as T from 'three';
import { createArmSolver, upperArmLength, forearmLength } from './arm.js';
import { box, mesh, rod, textureFromCanvas } from './glasses.js';
import { colors, frames } from './order.js';

const v = (x, y, z) => new T.Vector3(x, y, z);
const ink = '#111729';
const metal = (color, extra = {}) => new T.MeshStandardMaterial({
  color, metalness: .16, roughness: .38, ...extra,
});
const shell = metal('#74829f', { roughness: .32 });
const trim = metal('#34496a');
const graphite = metal('#192338', { roughness: .48 });
const dark = metal(ink);
const green = metal('#28afa8', { roughness: .3, emissive: '#19aab2', emissiveIntensity: .42 });
const silver = metal('#93a2be', { metalness: .46, roughness: .3 });
const mint = metal('#64ffe7', { emissive: '#2ae9e4', emissiveIntensity: 1.26 });
const pink = metal('#f33ca1', { emissive: '#d72a9c', emissiveIntensity: 1.4 });

function add(parent, position = [0, 0, 0]) {
  const group = new T.Group();
  group.position.set(...position);
  parent.add(group);
  return group;
}

function cylinder(parent, radius, height, material, position, base = radius, sides = 24) {
  return mesh(parent, new T.CylinderGeometry(radius, base, height, sides), material, ...position);
}

function ball(parent, radius, material, position) {
  return mesh(parent, new T.SphereGeometry(radius, 18, 12), material, ...position);
}

function canvasPlane(parent, pixels, dimensions, position) {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = pixels;
  const texture = textureFromCanvas(canvas);
  const material = new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const face = mesh(parent, new T.PlaneGeometry(...dimensions), material, ...position);
  face.castShadow = false;
  face.receiveShadow = false;
  face.renderOrder = 4;
  const ctx = canvas.getContext('2d');
  return {
    face,
    draw(paint) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paint(ctx, canvas.width, canvas.height);
      texture.needsUpdate = true;
    },
  };
}

function label(parent, text, dimensions, position, color = '#c6efff') {
  const face = canvasPlane(parent, [512, 120], dimensions, position);
  face.draw(ctx => {
    ctx.font = 'bold 66px monospace';
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 2, 60);
  });
  return face.face;
}

function addLights(scene) {
  scene.add(new T.HemisphereLight('#aecbff', '#2a184d', 1.82));
  const key = new T.DirectionalLight('#d4eaff', 2.1);
  key.position.set(-3.5, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.normalBias = .017;
  key.shadow.bias = -.00015;
  key.shadow.intensity = .54;
  scene.add(key);
  const rim = new T.DirectionalLight('#fa70c8', 2.85);
  rim.position.set(4.4, 4, -4.4);
  const fill = new T.DirectionalLight('#45e3ff', 1.18);
  fill.position.set(-5, 3, -1);
  scene.add(rim, fill);
}

function shadow(parent, x, z, width, depth, opacity = .43) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const alpha = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  alpha.addColorStop(0, 'rgba(2,5,15,.88)');
  alpha.addColorStop(.42, 'rgba(2,5,15,.72)');
  alpha.addColorStop(1, 'rgba(2,5,15,0)');
  ctx.fillStyle = alpha;
  ctx.fillRect(0, 0, 128, 128);
  const face = mesh(parent, new T.PlaneGeometry(width, depth), new T.MeshBasicMaterial({
    map: textureFromCanvas(canvas), transparent: true, opacity, depthWrite: false,
  }), x, .016, z);
  face.rotation.x = -Math.PI / 2;
  face.castShadow = false;
  face.renderOrder = 2;
  return face;
}

function roundBot(parent) {
  const robot = add(parent, [-2.35, .17, .08]);
  const legs = [];
  for (const side of [-1, 1]) {
    const x = side * .278;
    const leg = add(robot, [x, 0, 0]);
    legs.push(leg);
    box(leg, [.56, .18, .77], [0, .12, .153], graphite, .058);
    box(leg, [.52, .22, .69], [0, .245, .165], shell, .09);
    box(leg, [.3, .075, .036], [0, .275, .518], mint, .014);
    cylinder(leg, .126, .47, silver, [0, .49, .025]);
    ball(leg, .153, graphite, [0, .47, .029]);
    box(leg, [.27, .29, .26], [0, .585, .017], trim, .058);
  }
  box(robot, [.75, .29, .49], [0, .738, 0], graphite, .12);
  const chest = add(robot, [0, 1.13, 0]);
  box(chest, [1.02, .94, .7], [0, 0, 0], shell, .238);
  box(chest, [.655, .405, .06], [0, -.032, .35], graphite, .09);
  box(chest, [.59, .347, .053], [0, -.032, .388], green, .067);
  label(chest, 'FORM.', [.397, .105], [-.01, -.02, .419]);
  for (let i = 0; i < 3; i++) {
    box(chest, [.055, .033, .022], [-.12 + .12 * i, -.123, .423], i === 0 ? mint : graphite, .01);
  }
  box(chest, [.54, .54, .27], [0, .03, -.33], graphite, .1);
  cylinder(robot, .215, .19, silver, [0, 1.64, 0]);
  cylinder(robot, .23, .075, graphite, [0, 1.69, 0]);
  const head = add(robot, [0, 2.045, .026]);
  box(head, [1.27, .86, .79], [0, 0, 0], shell, .24);
  box(head, [1.081, .62, .15], [0, -.019, .355], graphite, .19);
  box(head, [.984, .549, .09], [0, -.019, .421], dark, .145);
  for (const side of [-1, 1]) {
    const ear = cylinder(head, .23, .155, graphite, [side * .609, -.04, -.008]);
    ear.rotation.z = Math.PI / 2;
    const earCap = cylinder(head, .161, .082, green, [side * .706, -.04, -.008]);
    earCap.rotation.z = Math.PI / 2;
    box(head, [.155, .079, .014], [side * .49, -.132, .351], green, .009);
  }
  const face = canvasPlane(head, [600, 250], [.88, .365], [0, -.018, .481]);
  const faceStyle = (eyeHeight, surprise = false) => face.draw((ctx, width, height) => {
    const sheen = ctx.createLinearGradient(0, 0, 0, height);
    sheen.addColorStop(0, '#6ba9d071');
    sheen.addColorStop(.64, '#0b4e7366');
    sheen.addColorStop(1, '#142e4400');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 70);
    ctx.fill();
    ctx.fillStyle = '#aafff4';
    ctx.shadowColor = '#1cf6ff';
    ctx.shadowBlur = 19;
    for (const x of [166, 375]) {
      ctx.beginPath();
      ctx.roundRect(x, 102 - eyeHeight / 2, 62, eyeHeight, Math.min(21, eyeHeight / 2));
      ctx.fill();
    }
    ctx.beginPath();
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#8ffef4';
    if (surprise) ctx.ellipse(301, 173, eyeHeight * .11, eyeHeight * .17, 0, 0, 2 * Math.PI);
    else {
      ctx.moveTo(275, 154);
      ctx.quadraticCurveTo(301, 181, 327, 154);
    }
    ctx.stroke();
  });
  faceStyle(80);
  rod(head, [[-.31, .34, -.06], [-.37, .53, -.087], [-.42, .65, -.086]], .028, graphite);
  ball(head, .078, mint, [-.42, .65, -.086]);
  // With +Z forward, the robot's right side is -X.
  const armLeft = robotArm(robot, 1);
  const armRight = robotArm(robot, -1);
  const reaction = add(robot, [.45, 2.78, .36]);
  const alert = canvasPlane(reaction, [96, 96], [.49, .49], [0, 0, 0]);
  alert.draw(ctx => {
    ctx.fillStyle = '#100d28';
    ctx.strokeStyle = '#fd84c9';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(7, 7, 82, 82, 20);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffa4de';
    ctx.font = '900 66px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('!', 48, 72);
  });
  reaction.visible = false;
  return { robot, legs, chest, head, faceStyle, armLeft, armRight, reaction };
}

function robotArm(robot, side) {
  const shoulder = v(side * .54, 1.38, .018);
  const right = side < 0;
  ball(robot, .173, graphite, shoulder.toArray());
  const upper = cylinder(robot, .142, upperArmLength, shell, [0, 0, 0], .117);
  const under = cylinder(robot, .12, forearmLength, shell, [0, 0, 0], .091);
  const elbowJoint = ball(robot, .131, graphite, [0, 0, 0]);
  const wrist = ball(robot, .106, silver, [0, 0, 0]);
  const gripper = add(robot);
  box(gripper, [.255, .195, .204], [0, 0, 0], green, .06);
  const fingers = [];
  for (const digit of [-1, 1]) {
    const finger = box(gripper, [.08, .075, .189], [digit * .095, -.074, .106], graphite, .028);
    fingers.push({ digit, finger });
  }
  const anchor = add(gripper, [0, -.065, .163]);
  const hand = v(side * .83, .78, right ? .45 : .22);
  const goal = v(0, 0, 0);
  const target = v(0, 0, 0);
  const heldOffset = v(0, 0, 0);
  const restRotation = new T.Quaternion();
  const solve = createArmSolver(shoulder, side);
  function align(arm, a, b) {
    goal.subVectors(b, a);
    arm.position.copy(a).addScaledVector(goal, .5);
    arm.quaternion.setFromUnitVectors(T.Object3D.DEFAULT_UP, goal.normalize());
  }
  function update(fold = 0, rotation = restRotation, aperture = .7, contact = false) {
    target.copy(hand);
    if (contact) target.sub(heldOffset.copy(anchor.position).applyQuaternion(rotation));
    const { elbow, wrist: wristPosition } = solve(target, fold);
    align(upper, shoulder, elbow);
    align(under, elbow, wristPosition);
    elbowJoint.position.copy(elbow);
    wrist.position.copy(wristPosition);
    gripper.position.copy(wristPosition);
    gripper.quaternion.copy(rotation);
    for (const { digit, finger } of fingers) {
      finger.position.x = digit * (.063 + aperture * .054);
      finger.rotation.y = digit * (.035 + aperture * .26);
    }
  }
  update();
  return { hand, gripper, anchor, shoulder, elbowJoint, upper, under, wrist, update };
}

function eyeFactory(parent) {
  const unit = add(parent, [.55, .16, -.28]);
  box(unit, [3.16, .29, 2.04], [0, .15, 0], graphite, .12);
  box(unit, [3.04, .18, 1.88], [0, .79, 0], shell, .077);
  for (const x of [-1.31, 1.30]) box(unit, [.44, .57, 1.88], [x, .5, 0], shell, .066);
  box(unit, [1.75, .52, .087], [-.23, .55, -.92], dark, .04);
  box(unit, [2.83, .095, 1.74], [0, .91, 0], silver, .043);
  box(unit, [2.885, .057, .064], [0, .772, .918], green, .025);
  box(unit, [2.84, 2.31, .34], [0, 1.99, -.725], shell, .17);
  box(unit, [.38, 1.83, 1.57], [-1.275, 1.79, .05], shell, .115);
  box(unit, [.72, 1.86, 1.59], [1.08, 1.79, .055], shell, .15);
  box(unit, [2.85, .57, 1.69], [0, 2.973, .024], shell, .19);
  box(unit, [2.71, .116, 1.556], [0, 3.211, .018], trim, .052);
  box(unit, [2.556, .239, .06], [0, 2.953, .866], graphite, .05);
  box(unit, [.756, .052, .023], [-.921, 3.015, .907], green, .018);
  label(unit, 'F / FABRICATOR', [1.22, .227], [-.48, 2.924, .9], '#b9f9ff');
  label(unit, 'LAB-01', [.625, .17], [.928, 2.924, .9], '#ff83c0');
  box(unit, [.33, .081, .63], [1.28, 3.296, -.415], graphite, .027);
  cylinder(unit, .112, .14, mint, [1.252, 3.384, -.403]);
  cylinder(unit, .116, .042, graphite, [1.252, 3.313, -.403]);
  box(unit, [1.799, 1.744, .035], [-.223, 1.82, -.526], graphite, .1);
  box(unit, [1.774, .036, 1.34], [-.222, .966, .136], dark, .02);
  for (const x of [-1.001, .54]) {
    box(unit, [.057, 1.684, .062], [x, 1.815, -.18], mint, .019);
    box(unit, [.049, .036, 1.05], [x, .995, .28], trim, .011);
  }
  for (const y of [1.12, 1.2, 1.28, 1.36, 1.44, 1.52, 1.6, 1.68, 1.76, 1.84, 1.92, 2, 2.08, 2.16, 2.24, 2.32, 2.4]) {
    box(unit, [1.56, .017, .026], [-.231, y, -.497], trim, .004);
  }
  const gantry = add(unit, [-.23, 2.42, .052]);
  box(unit, [1.66, .108, .27], [-.235, 2.568, -.03], silver, .02);
  box(gantry, [.49, .28, .58], [0, .01, 0], graphite, .07);
  box(gantry, [.411, .099, .49], [0, -.107, .008], green, .033);
  cylinder(gantry, .147, .145, silver, [0, -.22, .09], .092);
  cylinder(gantry, .051, .103, graphite, [0, -.323, .09], .026);
  const beamMaterial = new T.MeshBasicMaterial({ color: '#74fff1', transparent: true, opacity: 0, depthWrite: false });
  const beam = mesh(gantry, new T.CylinderGeometry(.014, .065, .72, 12), beamMaterial, 0, -.738, .09);
  beam.castShadow = false;
  const light = new T.PointLight('#49ecff', 0, 2);
  light.position.set(0, -.66, .14);
  gantry.add(light);
  const platform = box(unit, [1.48, .077, 1.18], [-.231, 1.015, .306], silver, .04);
  box(unit, [1.46, .035, .052], [-.231, 1.04, .921], green, .013);
  box(unit, [.432, .56, .113], [1.08, 2.14, .867], graphite, .064);
  const screen = canvasPlane(unit, [300, 340], [.398, .506], [1.08, 2.14, .931]);
  const screenPaint = (mode, design, order) => screen.draw((ctx, width, height) => {
    ctx.fillStyle = '#09162a';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 22);
    ctx.fill();
    ctx.fillStyle = '#125267';
    ctx.fillRect(23, 88, 254, 4);
    ctx.fillStyle = '#95fff0';
    ctx.font = 'bold 33px monospace';
    ctx.fillText(mode, 23, 62);
    ctx.font = 'bold 27px monospace';
    [order?.id ?? 'FORM LAB', frames[design.frame].english, colors[design.color].english, 'QTY / ' + design.quantity].forEach((line, index) => {
      ctx.fillText(line, 23, 136 + 47 * index);
    });
  });
  for (const [x, material] of [[.939, green], [1.089, trim], [1.239, graphite]]) {
    ball(unit, .046, material, [x, 1.753, .881]);
  }
  for (let index = 0; index < 6; index++) {
    box(unit, [.039, .135, .025], [.878 + index * .074, 1.2, .861], graphite, .005);
  }
  box(unit, [.36, .139, .31], [-1.276, 1.795, 1.05], graphite, .025);
  box(unit, [.269, .033, .023], [-1.276, 1.8, 1.213], mint, .009);
  const lever = add(unit, [-1.37, 1.733, .846]);
  ball(lever, .096, dark, [0, 0, 0]);
  cylinder(lever, .033, .27, silver, [0, .14, 0]);
  ball(lever, .064, pink, [0, .281, 0]);
  for (const x of [-1.27, 1.24]) {
    box(unit, [.28, .107, .32], [x, .006, .67], dark, .028);
  }
  return { gantry, beamMaterial, light, platform, screenPaint, lever };
}

function ticketPrinter(parent) {
  const printer = add(parent, [-1.04, .17, .76]);
  box(printer, [.74, .132, .71], [0, .06, 0], graphite, .063);
  box(printer, [.575, .795, .54], [0, .499, 0], trim, .097);
  box(printer, [.706, .293, .673], [0, .961, .032], shell, .086);
  box(printer, [.44, .036, .109], [0, 1.105, .348], graphite, .008);
  box(printer, [.199, .032, .027], [-.09, .967, .373], green, .009);
  label(printer, 'ORDER', [.4, .142], [-.005, .844, .344]);
  const ticket = add(parent, [-1.04, 1.276, 1.169]);
  box(ticket, [.38, .368, .012], [0, -.184, 0], metal('#fffce9', { roughness: .83, metalness: 0 }), .005);
  const print = canvasPlane(ticket, [325, 625], [.351, .351], [0, -.184, .01]);
  const printTicket = (order, spec) => print.draw(ctx => {
    ctx.save();
    ctx.fillStyle = '#2b3525';
    ctx.font = 'bold 40px monospace';
    const height = 1 / spec.length;
    ctx.scale(1, height);
    ctx.fillText('FORM.', 17, 52);
    ctx.fillRect(17, 76, 290, 4);
    ctx.font = 'bold 29px monospace';
    const lines = [
      order.id, frames[order.design.frame].english, colors[order.design.color].english,
      'LOGO / ' + (order.design.logo ? 'YES' : '—'), 'QTY / ' + order.design.quantity,
    ];
    lines.forEach((line, index) => ctx.fillText(line, 17, 125 + index * 43));
    for (let i = 0; i < 29; i++) ctx.fillRect(18 + i * 10, 471, 3 + i % 4, 44);
    ctx.font = 'bold 51px monospace';
    ctx.fillText('×' + order.design.quantity, 17, 420);
    ctx.restore();
  });
  ticket.visible = false;
  return { ticket, printTicket };
}

function packingStation(parent) {
  const stand = add(parent, [2.9, .158, .61]);
  box(stand, [1.19, .132, 1.12], [0, .067, 0], graphite, .065);
  box(stand, [.907, .8, .83], [0, .53, 0], trim, .108);
  box(stand, [1.249, .216, 1.17], [0, .982, 0], shell, .065);
  box(stand, [1.09, .043, 1.061], [0, 1.107, 0], graphite, .044);
  const carton = add(stand, [0, 1.14, .045]);
  const kraft = metal('#222338', { roughness: .63, metalness: 0 });
  const edge = metal('#5b4a70', { roughness: .57, metalness: 0 });
  box(carton, [1.125, .086, .841], [0, .049, 0], kraft, .031);
  for (const x of [-.532, .532]) box(carton, [.055, .187, .798], [x, .14, 0], edge, .022);
  for (const z of [-.398, .398]) box(carton, [1.108, .187, .05], [0, .14, z], edge, .024);
  label(carton, 'FORM / OPTICS', [.91, .159], [0, .143, .427]);
  const lid = add(carton, [0, .24, -.407]);
  box(lid, [1.135, .053, .85], [0, .015, .408], edge, .029);
  box(lid, [.258, .055, .846], [-.343, .02, .407], green, .017);
  box(lid, [.099, .057, .845], [-.15, .02, .407], green, .017);
  const lidGrip = add(lid, [-.36, .055, .755]);
  lid.rotation.x = -1.26;
  const conveyor = add(parent, [4.46, 1.20, .655]);
  box(conveyor, [3.24, .13, 1.07], [0, 0, 0], graphite, .04);
  for (const z of [-.51, .51]) {
    box(conveyor, [3.22, .045, .041], [0, .06, z], trim, .015);
  }
  const rollers = Array.from({ length: 15 }, (_, i) => {
    const roll = cylinder(conveyor, .052, .95, i % 2 === 0 ? silver : shell, [-1.52 + i * .219, .036, 0], .052, 14);
    roll.rotation.x = Math.PI / 2;
    return roll;
  });
  for (const x of [.37, 1.46]) {
    box(conveyor, [.125, 1.12, .59], [x, -.57, 0], trim, .025);
  }
  const outfeed = add(conveyor, [.68, .074, 0]);
  box(outfeed, [.42, .09, 1.11], [0, .85, 0], shell, .024);
  for (const z of [-.53, .53]) box(outfeed, [.42, .82, .077], [0, .38, z], trim, .018);
  box(outfeed, [.32, .022, .042], [0, .79, .567], mint, .009);
  label(outfeed, 'OUT', [.34, .14], [0, .86, .564]);
  return { lid, lidGrip, carton, rollers };
}

export const home = [-2.35, .17, .08];
export const dockPoint = [-4.22, .22, -.81];

function chargingStation(parent) {
  const dock = add(parent, dockPoint);
  box(dock, [2.12, .12, 1.51], [0, 0, .09], graphite, .055);
  box(dock, [2.08, 3.02, .18], [0, 1.51, -.63], trim, .071);
  box(dock, [2.22, .4, 1.48], [0, 3.14, .09], shell, .078);
  const charge = pink.clone();
  charge.emissiveIntensity = .35;
  for (const side of [-1, 1]) {
    box(dock, [.13, 2.99, 1.44], [side * 1.027, 1.505, .008], graphite, .033);
    box(dock, [.043, 2.74, .03], [side * .989, 1.49, .788], charge, .01);
    box(dock, [.047, .023, .98], [side * .82, .069, .131], mint, .013);
  }
  box(dock, [1.9, .025, .063], [0, 2.94, .8], charge, .012);
  label(dock, 'CHARGE / 01', [1.49, .29], [0, 3.15, .846], '#ffa8d8');
  const bars = Array.from({ length: 5 }, (_, i) =>
    box(dock, [.104, .064, .035], [-.246 + i * .123, 2.993, .842], charge.clone(), .009));
  const shutter = add(dock, [0, 3.0, .755]);
  const slats = 12;
  for (let index = 0; index < slats; index++) {
    box(shutter, [1.92, .242, .101], [0, -.122 - index * .244, 0], index % 2 ? trim : graphite, .009);
  }
  const doorScreen = canvasPlane(shutter, [400, 174], [1.09, .47], [0, -1.27, .061]);
  function setDoorDisplay(remaining) {
    doorScreen.draw(ctx => {
      ctx.fillStyle = '#100e25';
      ctx.beginPath();
      ctx.roundRect(0, 0, 400, 174, 22);
      ctx.fill();
      ctx.fillStyle = '#ffa1d8';
      ctx.textAlign = 'center';
      ctx.font = 'bold 48px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
      ctx.fillText(remaining == null ? '充电仓' : '充电中', 200, 71);
      ctx.font = 'bold 36px monospace';
      ctx.fillText(remaining == null ? 'POWER BAY' : '00:' + String(remaining).padStart(2, '0'), 200, 134);
    });
  }
  shutter.scale.y = .016;
  setDoorDisplay(null);
  const light = new T.PointLight('#eb3fae', 0, 2.6);
  light.position.set(0, 1.95, .44);
  dock.add(light);
  function chargeLevel(progress, active) {
    charge.emissiveIntensity = active ? 1.75 : .35;
    light.intensity = active ? 4.4 : .18;
    bars.forEach((bar, index) => {
      bar.material.emissiveIntensity = active && progress >= (index + 1) / 5 ? 2.2 : .1;
    });
  }
  chargeLevel(0, false);
  return { shutter, chargeLevel, setDoorDisplay };
}

function toolStation(scene) {
  const stock = metal('#a4a9b7', { roughness: .58 });
  const drawer = add(scene, [.32, .565, -.16]);
  box(drawer, [1.54, .085, 1.37], [0, 0, 0], dark, .026);
  for (const x of [-.752, .752]) box(drawer, [.045, .126, 1.33], [x, .064, 0], silver, .013);
  box(drawer, [1.57, .31, .087], [0, .048, .69], trim, .027);
  box(drawer, [.26, .065, .105], [-.61, .086, .78], silver, .023);
  label(drawer, 'STOCK', [.36, .12], [.42, .06, .741], '#8cf7e9');
  for (const x of [-.54, .54]) {
    const rail = box(scene, [.048, .052, 1.52], [.32 + x, .51, .65], graphite, .009);
    rail.castShadow = false;
  }
  const billet = box(scene, [1.30, .074, 1.30], [.32, .654, -.16], stock, .019);
  const scraps = [-1, 1].map((side, index) =>
    box(scene, [.74, .071, .132], [.32, 1.23, index ? .87 : .02], stock, .018));
  const jig = add(scene, [-.93, .17, 1.05]);
  box(jig, [.58, .39, .61], [0, .21, 0], trim, .044);
  box(jig, [.72, .07, .64], [0, .42, .11], dark, .028);
  box(jig, [.71, .022, .049], [0, .457, .428], mint, .009);
  const guns = {
    left: sprayGun(scene, [-.40, 1.075, .91], green, true),
    right: sprayGun(scene, [-1.52, .92, 2.96], pink),
  };
  return { drawer, billet, scraps, guns };
}

function sprayGun(scene, parked, finish, mounted = false) {
  const [x, y, z] = parked;
  const gun = add(scene, parked);
  if (mounted) {
    box(scene, [.29, .055, .42], [x, y - .057, z - .11], graphite, .023);
  } else {
    box(scene, [.23, y - .07, .28], [x, (y - .07) / 2, z], trim, .027);
    box(scene, [.29, .055, .33], [x, y - .057, z], graphite, .023);
  }
  box(gun, [.30, .13, .116], [0, .061, 0], finish, .03);
  box(gun, [.098, .136, .106], [-.078, -.025, 0], graphite, .029);
  box(gun, [.1, .052, .075], [.156, .061, 0], silver, .016);
  const mist = new T.MeshBasicMaterial({ color: '#86e3ea', transparent: true, opacity: 0, depthWrite: false });
  const cone = mesh(gun, new T.ConeGeometry(.118, .72, 18, 1, true), mist, .56, .061, 0);
  cone.rotation.z = Math.PI / 2;
  cone.castShadow = false;
  return { gun, parked: gun.position.clone(), mist };
}

function city(parent) {
  const towers = add(parent, [0, 0, -6.6]);
  const windows = [mint, pink, green];
  for (let i = 0; i < 15; i++) {
    const width = .83 + .17 * (i % 3);
    const height = 2.8 + (i * 23 % 12) * .34;
    const x = -10.3 + i * 1.43;
    const z = i % 2 ? -.78 : 0;
    box(towers, [width, height, .75], [x, height / 2, z], dark, .04);
    for (let row = 0; row < 8; row++) {
      if ((row * 7 + i * 3) % 5 === 0) continue;
      const y = height - .25 - row * .27;
      box(towers, [width * (row % 2 ? .45 : .65), .035, .026], [x, y, z + .39], windows[(i + row * 3) % windows.length], .004);
    }
  }
  const backbar = add(parent, [0, 0, -2.4]);
  box(backbar, [12.6, .11, .14], [0, .69, 0], trim, .025);
  box(backbar, [12.1, .023, .039], [0, .717, .08], pink, .009);
  for (const x of [-5.25, -2.94, 2.16, 4.32]) {
    box(backbar, [.058, .73, .074], [x, .39, 0], trim, .013);
  }
}

export function buildWorkshop(scene) {
  scene.background = new T.Color('#101630');
  scene.fog = new T.Fog('#151d3b', 12, 31);
  addLights(scene);
  city(scene);
  const ground = mesh(scene, new T.PlaneGeometry(100, 100), metal('#141d38', { metalness: .2, roughness: .56 }), 0, 0, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  const grid = new T.GridHelper(26, 32, '#2f75a2', '#22537a');
  grid.material.opacity = .34;
  grid.material.transparent = true;
  grid.position.y = .006;
  scene.add(grid);
  const base = box(scene, [12.4, .14, 4.5], [.22, .072, .32], metal('#243555', { roughness: .55 }), .1);
  base.castShadow = false;
  shadow(scene, -2.35, .1, 2.6, 1.65, .35).position.y = .151;
  shadow(scene, .55, -.14, 4.6, 2.8, .41).position.y = .151;
  shadow(scene, 2.9, .62, 1.75, 1.38, .27).position.y = .151;
  box(scene, [3.2, .021, .055], [.88, .152, 2.105], mint, .011);
  box(scene, [2.21, .021, .055], [-3.58, .152, 2.105], pink, .011);
  for (let i = 0; i < 8; i++) {
    const dash = box(scene, [.135, .022, .055], [-2.11 + i * .186, .152, 2.105], green, .013);
    dash.rotation.y = -.53;
  }
  const bot = roundBot(scene);
  const machine = eyeFactory(scene);
  const printing = ticketPrinter(scene);
  const packing = packingStation(scene);
  const charging = chargingStation(scene);
  return { ...bot, ...machine, ...printing, ...packing, ...charging, ...toolStation(scene) };
}
