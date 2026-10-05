// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The Niva in three.js primitives, its headlights and their beams, which the
// scene sets down and tilts on the exaggerated relief. Imported by scene.ts
// only (the dynamic three.js chunk). Model frame: front towards +z, left
// towards +x, up +y, origin on the ground between the axles.

import * as THREE from 'three'
import { NIVA } from './niva.ts'

const PAINT = '#4d5d3a'

export type NivaLights = { low: boolean; bar: boolean }

type NivaUserData = {
  wheels: THREE.Object3D[]
  steering: THREE.Object3D[]
  lens: THREE.MeshStandardMaterial
  led: THREE.MeshStandardMaterial
  tail: THREE.MeshStandardMaterial
  beams: { low: THREE.SpotLight[]; bull: THREE.SpotLight[]; roof: THREE.SpotLight[] }
  cones: { low: THREE.Mesh[]; roof: THREE.Mesh[] }
}

export function nivaParts(model: THREE.Object3D): NivaUserData {
  return model.userData as NivaUserData
}

export function buildNivaModel(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'niva'
  const paint = new THREE.MeshStandardMaterial({ color: PAINT, roughness: 0.92, metalness: 0.05 })
  const black = new THREE.MeshStandardMaterial({ color: '#1b1c1a', roughness: 0.75, metalness: 0.15 })
  const tube = new THREE.MeshStandardMaterial({ color: '#151615', roughness: 0.45, metalness: 0.55 })
  const glass = new THREE.MeshStandardMaterial({ color: '#16222b', roughness: 0.12, metalness: 0.4 })
  const rubber = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.95 })
  const rim = new THREE.MeshStandardMaterial({ color: '#3e4636', roughness: 0.6, metalness: 0.3 })
  const lens = new THREE.MeshStandardMaterial({ color: '#d9e2e6', roughness: 0.2, emissive: '#fff4d6', emissiveIntensity: 0 })
  const led = new THREE.MeshStandardMaterial({ color: '#c9d3da', roughness: 0.3, emissive: '#f2f7ff', emissiveIntensity: 0 })
  const tail = new THREE.MeshStandardMaterial({ color: '#7a1414', roughness: 0.4, emissive: '#ff2a1a', emissiveIntensity: 0 })
  const amber = new THREE.MeshStandardMaterial({ color: '#d9822b', roughness: 0.4 })

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return mesh
  }
  const box = (w: number, h: number, l: number, material: THREE.Material, x: number, y: number, z: number, parent?: THREE.Object3D) =>
    add(new THREE.BoxGeometry(w, h, l), material, x, y, z, parent)

  // The body: a low block, the cabin as a trapezium on top.
  box(1.66, 0.6, 3.6, paint, 0, 0.72, -0.02)
  const profile = new THREE.Shape()
  profile.moveTo(-1.84, 0)
  profile.lineTo(0.8, 0)
  profile.lineTo(0.3, 0.6)
  profile.lineTo(-1.78, 0.6)
  profile.closePath()
  const cabin = new THREE.ExtrudeGeometry(profile, { depth: 1.56, bevelEnabled: false })
  cabin.rotateY(-Math.PI / 2)
  cabin.translate(0.78, 1.02, 0)
  add(cabin, paint, 0, 0, 0)

  // The windows.
  const windshield = box(1.42, 0.7, 0.02, glass, 0, 1.32, 0.56)
  windshield.rotation.x = -0.69
  windshield.position.add(new THREE.Vector3(0, 0.637, 0.77).multiplyScalar(0.012))
  for (const side of [1, -1]) {
    box(0.02, 0.44, 0.66, glass, side * 0.785, 1.31, -0.02)
    box(0.02, 0.44, 1.22, glass, side * 0.785, 1.31, -1.1)
    // Mirrors.
    box(0.05, 0.11, 0.15, black, side * 0.87, 1.14, 0.6)
  }
  box(1.3, 0.44, 0.02, glass, 0, 1.31, -1.83)

  // Grille, round headlights, indicators, bumpers.
  box(0.92, 0.17, 0.02, black, 0, 0.87, 1.79)
  const headlights: THREE.Mesh[] = []
  for (const side of [1, -1]) {
    headlights.push(add(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 24).rotateX(Math.PI / 2), lens, side * 0.62, 0.87, 1.79))
    add(new THREE.TorusGeometry(0.095, 0.012, 8, 24), tube, side * 0.62, 0.87, 1.815)
    box(0.13, 0.05, 0.02, amber, side * 0.62, 0.68, 1.79)
    box(0.2, 0.15, 0.03, tail, side * 0.69, 0.8, -1.83)
  }
  box(1.72, 0.16, 0.14, black, 0, 0.5, 1.87)
  box(1.72, 0.16, 0.14, black, 0, 0.5, -1.89)

  // The bull bar: two uprights, two cross bars, an LED bar on top.
  for (const side of [1, -1]) add(new THREE.CylinderGeometry(0.032, 0.032, 0.72, 10), tube, side * 0.42, 0.78, 1.98)
  add(new THREE.CylinderGeometry(0.032, 0.032, 0.9, 10).rotateZ(Math.PI / 2), tube, 0, 1.13, 1.98)
  add(new THREE.CylinderGeometry(0.032, 0.032, 1.36, 10).rotateZ(Math.PI / 2), tube, 0, 0.66, 2.0)
  box(0.72, 0.075, 0.08, black, 0, 1.19, 1.98)
  box(0.66, 0.045, 0.01, led, 0, 1.19, 2.025)

  // The roof light bar on two rails.
  box(1.5, 0.04, 0.05, black, 0, 1.645, 0.05)
  box(1.5, 0.04, 0.05, black, 0, 1.645, -1.25)
  box(1.22, 0.1, 0.13, black, 0, 1.71, 0.1)
  box(1.14, 0.06, 0.01, led, 0, 1.71, 0.17)

  // The plates.
  const plateMaterial = new THREE.MeshStandardMaterial({ map: plateTexture('SEMISTO'), roughness: 0.5 })
  add(new THREE.PlaneGeometry(0.52, 0.11), plateMaterial, 0, 0.5, 1.942)
  const rearPlate = add(new THREE.PlaneGeometry(0.52, 0.11), plateMaterial, 0, 0.5, -1.962)
  rearPlate.rotation.y = Math.PI

  // The wheels: a steering pivot at the front, a rolling rotation.
  const wheels: THREE.Object3D[] = []
  const steering: THREE.Object3D[] = []
  // The wheel arches: a dark disc on both sides, per axle.
  for (const z of [1.1, -1.1]) {
    add(new THREE.CylinderGeometry(0.4, 0.4, 1.672, 24).rotateZ(Math.PI / 2), rubber, 0, NIVA.wheelRadius, z)
  }
  for (const [x, z] of [[0.765, 1.1], [-0.765, 1.1], [0.765, -1.1], [-0.765, -1.1]]) {
    const pivot = new THREE.Group()
    pivot.position.set(x, NIVA.wheelRadius, z)
    root.add(pivot)
    const spin = new THREE.Group()
    pivot.add(spin)
    add(new THREE.CylinderGeometry(NIVA.wheelRadius, NIVA.wheelRadius, 0.2, 28).rotateZ(Math.PI / 2), rubber, 0, 0, 0, spin)
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.205, 18).rotateZ(Math.PI / 2), rim, 0, 0, 0, spin)
    // A light spoke: the wheel is seen turning.
    box(0.21, 0.3, 0.05, tube, 0, 0, 0, spin)
    wheels.push(spin)
    if (z > 0) steering.push(pivot)
  }

  // The cast shadow: a soft patch under the body.
  const shadow = add(new THREE.PlaneGeometry(2.6, 4.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }), 0, 0.04, 0)
  shadow.renderOrder = 1

  // The light: two headlights, the bull bar LED, the roof bar.
  const spot = (color: string, distance: number, angle: number, x: number, y: number, z: number, aimY: number, aimZ: number) => {
    const light = new THREE.SpotLight(color, 0, distance, angle, 0.55, 1.3)
    light.position.set(x, y, z)
    light.target.position.set(x, aimY, aimZ)
    root.add(light, light.target)
    return light
  }
  const beams = {
    low: [spot('#fff1d0', 90, 0.42, 0.62, 0.87, 1.85, 0.1, 30), spot('#fff1d0', 90, 0.42, -0.62, 0.87, 1.85, 0.1, 30)],
    bull: [spot('#eef4ff', 45, 0.95, 0, 1.19, 2.05, 0, 14)],
    roof: [spot('#f2f6ff', 150, 0.62, 0, 1.71, 0.2, 0.2, 45)],
  }
  const cones = {
    low: headlights.map((h) => add(lightCone(18, 3.4), coneMaterial('#fff1c9'), h.position.x, 0.87, 1.84)),
    roof: [add(lightCone(26, 9), coneMaterial('#e9f1ff'), 0, 1.71, 0.2)],
  }
  for (const cone of [...cones.low, ...cones.roof]) cone.visible = false

  const data: NivaUserData = { wheels, steering, lens, led, tail, beams, cones }
  root.userData = data
  return root
}

/** On or off: `low` headlights, `bar` bull bar and roof bar; `braking` lights the rear lamps. */
export function setNivaLights(model: THREE.Object3D, { low, bar, night, braking }: NivaLights & { night: boolean; braking: boolean }) {
  const { lens, led, tail, beams, cones } = nivaParts(model)
  lens.emissiveIntensity = low ? 2.4 : 0
  led.emissiveIntensity = bar ? 3 : 0
  tail.emissiveIntensity = braking ? 2.2 : (low ? 0.8 : 0)
  for (const light of beams.low) light.intensity = low ? (night ? 150 : 20) : 0
  for (const light of beams.bull) light.intensity = bar ? (night ? 60 : 12) : 0
  for (const light of beams.roof) light.intensity = bar ? (night ? 160 : 40) : 0
  for (const cone of cones.low) cone.visible = low && night
  for (const cone of cones.roof) cone.visible = bar && night
}

/** A beam seen in the night: an open cone, opaque at the source and clear at the end, added to the scene. */
function lightCone(length: number, radius: number): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(radius, length, 28, 6, true)
  geometry.translate(0, -length / 2, 0)
  geometry.rotateX(-Math.PI / 2)
  geometry.rotateX(0.06)
  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 4)
  for (let i = 0; i < position.count; i++) {
    const along = Math.min(1, Math.max(0, position.getZ(i) / length))
    colors.set([1, 1, 1, (1 - along) ** 1.6], i * 4)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  return geometry
}

function coneMaterial(color: string): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color, vertexColors: true, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  })
}

/** A plate: white background, blue band, black characters. */
function plateTexture(text: string): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 520
  canvas.height = 110
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 520, 110)
  ctx.fillStyle = '#1d4ea8'
  ctx.fillRect(0, 0, 46, 110)
  ctx.fillStyle = '#111111'
  ctx.font = 'bold 70px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 283, 58)
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, 516, 106)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function shadowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const gradient = ctx.createRadialGradient(32, 64, 3, 32, 64, 31)
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)')
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.3)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.setTransform(1, 0, 0, 2, 0, -64)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 128)
  return new THREE.CanvasTexture(canvas)
}
