import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeGlasses, disposeModel, textureFromCanvas } from './glasses.js';

function matShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(80, 80, 0, 80, 80, 80);
  gradient.addColorStop(0, '#37333575');
  gradient.addColorStop(.58, '#37333547');
  gradient.addColorStop(1, '#37333500');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 160, 160);
  const shadow = new T.Mesh(new T.PlaneGeometry(2.55, 1.62), new T.MeshBasicMaterial({
    map: textureFromCanvas(canvas), transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(.06, -.384, -.53);
  return shadow;
}

export function createPhotoStudio(renderer) {
  const scene = new T.Scene();
  scene.background = new T.Color('#dad6cc');
  scene.fog = new T.Fog('#e2ddd4', 8, 23);
  const room = new RoomEnvironment();
  const generator = new T.PMREMGenerator(renderer);
  scene.environment = generator.fromScene(room, .07).texture;
  scene.environmentIntensity = .73;
  generator.dispose();
  room.dispose();

  const floor = new T.Mesh(new T.PlaneGeometry(100, 100), new T.MeshStandardMaterial({
    color: '#c6bfb4', roughness: .88, metalness: 0,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.386;
  floor.receiveShadow = true;
  scene.add(floor, matShadow());
  const key = new T.DirectionalLight('#fff9f4', 1.65);
  key.position.set(-3, 7, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.camera.left = key.shadow.camera.bottom = -3;
  key.shadow.camera.right = key.shadow.camera.top = 3;
  key.shadow.bias = -.00015;
  key.shadow.normalBias = .009;
  key.shadow.intensity = .31;
  scene.add(key, new T.HemisphereLight('#f6f2ed', '#9c9190', .72));

  const camera = new T.PerspectiveCamera(23, 1100 / 690, .1, 100);
  camera.position.set(3.24, 2.08, 4.34);
  camera.lookAt(0, -.085, -.51);
  let model;
  return {
    capture(design, logo) {
      if (model) {
        scene.remove(model);
        disposeModel(model);
      }
      model = makeGlasses(design, logo, { photo: true });
      model.rotation.x = -.17;
      model.position.set(0, .006, -.03);
      scene.add(model);
      renderer.setSize(1100, 690, false);
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
  };
}
