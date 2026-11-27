import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { colors } from './order.js';

const profiles = {
  square: [.445, .335, .52],
  round: [.402, .389, 1],
  oval: [.478, .302, .87],
};

function outline(frame, scale = 1) {
  const [rx, ry, curve] = profiles[frame];
  return Array.from({ length: 100 }, (_, i) => {
    const angle = i * Math.PI / 50;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new T.Vector2(
      Math.sign(cos) * Math.abs(cos) ** curve * rx * scale,
      Math.sign(sin) * Math.abs(sin) ** curve * ry * scale,
    );
  });
}

function shape(points, Path = T.Shape) {
  return new Path(points);
}

function physical(color, extra = {}) {
  return new T.MeshPhysicalMaterial({ color, roughness: .28, metalness: .1, clearcoat: .7, ...extra });
}

export function mesh(parent, geometry, material, x, y, z) {
  const part = new T.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.castShadow = true;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

export function box(parent, size, position, material, radius = .06) {
  return mesh(parent, new RoundedBoxGeometry(...size, 2, radius), material, ...position);
}

export function rod(parent, points, radius, material) {
  const curve = new T.CatmullRomCurve3(points.map(point => new T.Vector3(...point)));
  return mesh(parent, new T.TubeGeometry(curve, 18, radius, 9, false), material, 0, 0, 0);
}

export function textureFromCanvas(canvas) {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function makeCutScore(frame) {
  const lines = new T.Group();
  const material = new T.LineBasicMaterial({ color: '#9dfff3', transparent: true, opacity: 0, depthWrite: false });
  const spacing = frame === 'oval' ? .55 : .519;
  for (const side of [-1, 1]) {
    for (const edge of [1, .82]) {
      const points = outline(frame, edge).map(point =>
        new T.Vector3((side * spacing + point.x) * .59, .044, -point.y * .59));
      lines.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(points), material));
    }
  }
  lines.userData.material = material;
  return lines;
}

function setUnformedTemple(tube) {
  const { geometry } = tube;
  const { tubularSegments, radialSegments, radius } = geometry.parameters;
  const points = [];
  for (let row = 0; row <= tubularSegments; row++) {
    for (let column = 0; column <= radialSegments; column++) {
      const angle = column * Math.PI * 2 / radialSegments;
      points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, -.04 - 1.20 * row / tubularSegments);
    }
  }
  geometry.morphAttributes.position = [new T.Float32BufferAttribute(points, 3)];
  tube.updateMorphTargets();
}

export function makeGlasses(design, logoImage, { photo = false } = {}) {
  const model = new T.Group();
  model.userData.temples = [];
  const color = colors[design.color].hex;
  const bridgeFinish = physical(color, photo ? { roughness: .21, metalness: .01, clearcoat: .92, clearcoatRoughness: .17 } : {});
  const rimFinishes = [];
  const templeFinishes = [];
  const hinge = physical('#a8aa97', { metalness: .72, roughness: .28 });
  const glass = physical(photo ? '#f8fafc' : '#cfdbef', photo ?
    { transmission: .95, roughness: .07, thickness: .026, ior: 1.52, side: T.DoubleSide, metalness: 0 } :
    { transparent: true, opacity: .22, side: T.DoubleSide, depthWrite: false, metalness: 0 });
  const rimShape = shape(outline(design.frame));
  rimShape.holes.push(shape(outline(design.frame, .83).reverse(), T.Path));
  const extruded = new T.ExtrudeGeometry(rimShape, {
    depth: .075, bevelEnabled: true, bevelSize: .024, bevelThickness: .023, bevelSegments: 5, steps: 1,
  });
  const rim = mergeVertices(extruded.deleteAttribute('normal').deleteAttribute('uv'));
  extruded.dispose();
  rim.computeVertexNormals();
  const lens = new T.ShapeGeometry(shape(outline(design.frame, .85)), 24);
  const offset = design.frame === 'oval' ? .55 : .519;
  const logoMaterials = [];
  for (const side of [-1, 1]) {
    const rimFinish = bridgeFinish.clone();
    const templeFinish = bridgeFinish.clone();
    rimFinishes.push(rimFinish);
    templeFinishes.push(templeFinish);
    mesh(model, rim, rimFinish, side * offset, 0, 0);
    const lensPart = mesh(model, lens, glass, side * offset, 0, .046);
    lensPart.castShadow = false;
    const start = side * (offset + profiles[design.frame][0] * .91);
    box(model, [.124, .116, .15], [start, .068, -.04], rimFinish, .032);
    const temple = new T.Group();
    temple.position.set(start, .068, -.04);
    model.add(temple);
    model.userData.temples.push(temple);
    const earpiece = [
      [0, 0, -.04], [side * .034, -.003, -.33],
      [side * .035, -.015, -.67], [-side * .01, -.058, -1],
      [-side * .115, -.194, -1.19], [-side * .154, -.248, -1.24],
    ];
    const tube = rod(temple, earpiece, .057, templeFinish);
    if (!photo) setUnformedTemple(tube);
    temple.userData.tube = tube;
    box(temple, [.099, .106, .53], [side * .025, -.005, -.346], templeFinish, .035);
    mesh(model, new T.SphereGeometry(.019, 10, 8), hinge, start, .084, .109);
    if (logoImage) logoMaterials.push(addLogo(temple, logoImage, side));
  }
  rod(model, [[-.159, .074, .039], [-.086, .155, .049], [0, .168, .051], [.086, .155, .049], [.159, .074, .039]], .049, bridgeFinish);
  Object.assign(model.userData, { bridgeFinish, rimFinishes, templeFinishes, glass, logoMaterials });
  return model;
}

function addLogo(temple, image, side) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const scale = Math.min(492 / image.width, 108 / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, (512 - width) / 2, (128 - height) / 2, width, height);
  const logo = mesh(temple, new T.PlaneGeometry(.4, .098), new T.MeshBasicMaterial({
    map: textureFromCanvas(canvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }), side * .101, -.005, -.344);
  logo.rotation.y = side * Math.PI / 2;
  logo.castShadow = false;
  return logo.material;
}

export function disposeModel(model) {
  const geometries = new Set();
  const materials = new Set();
  model.traverse(part => {
    if (!part.isMesh && !part.isLine) return;
    geometries.add(part.geometry);
    materials.add(part.material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    material.map?.dispose();
    material.dispose();
  }
}

export function drawFlatPreview(design, image) {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  const color = colors[design.color].hex;
  const background = ctx.createLinearGradient(0, 0, 900, 520);
  background.addColorStop(0, '#f3f5dd');
  background.addColorStop(1, '#c8d79d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 900, 520);
  ctx.strokeStyle = color;
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  for (const center of [300, 562]) {
    ctx.beginPath();
    for (const [index, point] of outline(design.frame).entries()) {
      ctx[index ? 'lineTo' : 'moveTo'](center + point.x * 244, 284 - point.y * 252);
    }
    ctx.closePath();
    ctx.fillStyle = '#d6ddd2';
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(403, 268);
  ctx.quadraticCurveTo(431, 225, 460, 268);
  ctx.moveTo(667, 263);
  ctx.quadraticCurveTo(760, 228, 806, 158);
  ctx.moveTo(194, 262);
  ctx.lineTo(165, 215);
  ctx.stroke();
  if (image) {
    const logo = Math.min(61 / image.width, 23 / image.height);
    ctx.save();
    ctx.translate(732, 228);
    ctx.rotate(-.48);
    ctx.drawImage(image, -image.width * logo / 2, -image.height * logo / 2, image.width * logo, image.height * logo);
    ctx.restore();
  }
  return canvas.toDataURL('image/png');
}
