import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  SphereGeometry,
} from "three";

function makeBumpTexture(seed = 1) {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const grit = (x * 37 + y * 61 + ((x * y + seed * 19) % 29) * 17) % 39;
      const value = 104 + grit * 2;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

const asphaltBump = makeBumpTexture(7);
asphaltBump.repeat.set(10, 2);
const pavementBump = makeBumpTexture(13);
pavementBump.repeat.set(3, 3);

const standard = (color, roughness = 0.82, metalness = 0, extras = {}) =>
  new MeshStandardMaterial({ color, roughness, metalness, ...extras });

export const CITY_GEOMETRIES = Object.freeze({
  box: new BoxGeometry(1, 1, 1),
  cone: new ConeGeometry(0.5, 1, 6),
  cylinder: new CylinderGeometry(0.5, 0.5, 1, 10),
  taperedCylinder: new CylinderGeometry(0.27, 0.47, 1, 10),
  sphere: new SphereGeometry(0.5, 10, 7),
});

export const CITY_MATERIALS = Object.freeze({
  asphalt: standard("#343a3a", 0.98, 0, { bumpMap: asphaltBump, bumpScale: 0.018 }),
  wetAsphalt: standard("#344b58", 0.34, 0.18, { transparent: true, opacity: 0.3, depthWrite: false }),
  roadTile: standard("#303637", 0.97, 0, { bumpMap: asphaltBump, bumpScale: 0.022 }),
  sidewalk: standard("#aaa99d", 0.92, 0, { bumpMap: pavementBump, bumpScale: 0.018 }),
  curb: standard("#8d918a", 0.94),
  roadPaint: standard("#ded9c4", 0.88),
  centerPaint: standard("#e2d39a", 0.86),
  concrete: standard("#8a8d86", 0.91, 0, { bumpMap: pavementBump, bumpScale: 0.012 }),
  foundation: standard("#80786d", 0.95),
  warmWalls: ["#d6aa79", "#c98d69", "#d8c7a2", "#b9b5a5"].map((color) => standard(color, 0.91)),
  roof: ["#7c4937", "#51565a", "#94604a", "#687273"].map((color) => standard(color, 0.88)),
  whiteWalls: ["#e6e3d9", "#d9dfdd"].map((color) => standard(color, 0.9)),
  schoolWalls: ["#ddc99c", "#cbbf9f"].map((color) => standard(color, 0.91)),
  factoryWalls: ["#8e9996", "#929b9b", "#9d968a"].map((color) => standard(color, 0.92)),
  windowFrame: standard("#d3d7d1", 0.75, 0.2),
  darkFrame: standard("#43504f", 0.65, 0.35),
  glass: ["#80aeb7", "#759ca8", "#91b9bd"].map((color) => standard(color, 0.23, 0.16, { emissive: "#d5a767", emissiveIntensity: 0 })),
  darkGlass: standard("#365866", 0.22, 0.2),
  timber: standard("#704d37", 0.88),
  redRoof: standard("#984f43", 0.89),
  schoolTrim: standard("#8a5148", 0.82),
  hospitalWall: standard("#e7eeeb", 0.82),
  hospitalAccent: standard("#599aaa", 0.68, 0.1),
  emergencyRed: standard("#bd4d50", 0.65),
  factoryMetal: standard("#535e5d", 0.62, 0.46),
  roofMetal: standard("#66716e", 0.68, 0.32),
  steel: standard("#626c69", 0.55, 0.54),
  solarFrame: standard("#55605d", 0.53, 0.6),
  solarCell: standard("#1d5273", 0.2, 0.48, { emissive: "#0b2635", emissiveIntensity: 0.12 }),
  solarGrid: standard("#91b6bb", 0.34, 0.5),
  water: standard("#5893a0", 0.45, 0.32),
  leaf: standard("#ffffff", 0.94),
  leafColors: ["#33764b", "#438454", "#58864e", "#2d6844", "#65915a"],
  grass: standard("#536b52", 0.99, 0, { bumpMap: pavementBump, bumpScale: 0.008 }),
  parkGrass: standard("#477b4e", 0.98, 0, { bumpMap: pavementBump, bumpScale: 0.012 }),
  shrub: standard("#ffffff", 0.96),
  parkPath: standard("#c2b69e", 0.98),
  parkBench: standard("#73583f", 0.88),
  parkFlower: standard("#d4b871", 0.88),
  lightPole: standard("#57615e", 0.58, 0.4),
  lampGlow: standard("#f1d58e", 0.45, 0, { emissive: "#f4bd71", emissiveIntensity: 0.12 }),
  zone: Object.freeze({
    residential: standard("#92b88e", 0.96),
    commercial: standard("#90aebe", 0.96),
    institutional: standard("#c6b88d", 0.96),
    recreation: standard("#73a879", 0.96),
    industrial: standard("#a8a9a1", 0.96),
    utility: standard("#7b9da1", 0.96),
  }),
});
