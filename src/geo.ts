// Geometry helpers. Shapes are kept in local metres (x = east, y = north) around an
// anchor point, so they can be re-placed anywhere on Earth at true size: Web Mercator
// would otherwise stretch a stadium from Manchester vs one from Rio differently.

export type LatLon = [number, number]
export type XY = [number, number]

const R = 6371008.8
const RAD = Math.PI / 180

export function toLocal(ring: LatLon[], anchor: LatLon): XY[] {
  const k = Math.cos(anchor[0] * RAD)
  return ring.map(([lat, lon]) => [(lon - anchor[1]) * RAD * R * k, (lat - anchor[0]) * RAD * R])
}

export function fromLocal(ring: XY[], anchor: LatLon, rotationDeg: number): LatLon[] {
  const k = Math.cos(anchor[0] * RAD)
  const c = Math.cos(rotationDeg * RAD)
  const s = Math.sin(rotationDeg * RAD)
  return ring.map(([x, y]) => {
    // Positive rotation = clockwise on the map (compass convention).
    const rx = x * c + y * s
    const ry = -x * s + y * c
    return [anchor[0] + ry / R / RAD, anchor[1] + rx / (R * k) / RAD]
  })
}

export function areaXY(ring: XY[]): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

export function areaLatLon(ring: LatLon[]): number {
  return areaXY(toLocal(ring, centroid(ring)))
}

export function centroid(ring: LatLon[]): LatLon {
  // Vertex mean is fine for anchoring; exact polygon centroid isn't needed here.
  const pts = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring
  return [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length]
}

/** Compass bearing (0–180°) of a ring's long axis, via principal component analysis of its edges. */
export function longAxisBearing(ring: LatLon[]): number {
  const xy = toLocal(ring, centroid(ring))
  // Weight by edge vectors rather than vertices so uneven vertex density doesn't skew it.
  let sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < xy.length - 1; i++) {
    const dx = xy[i + 1][0] - xy[i][0]
    const dy = xy[i + 1][1] - xy[i][1]
    const len = Math.hypot(dx, dy) || 1
    sxx += (dx * dx) / len
    syy += (dy * dy) / len
    sxy += (dx * dy) / len
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy) // angle from east, counter-clockwise
  const bearing = 90 - theta / RAD
  return ((bearing % 180) + 180) % 180
}

/** Axis-aligned extent (length × width) of a ring after rotating its long axis north. */
export function dimensions(ring: LatLon[]): { length: number; width: number } {
  const b = longAxisBearing(ring)
  const xy = toLocal(ring, centroid(ring))
  const rotated = fromLocalXY(xy, -b)
  const xs = rotated.map((p) => p[0])
  const ys = rotated.map((p) => p[1])
  const w = Math.max(...xs) - Math.min(...xs)
  const l = Math.max(...ys) - Math.min(...ys)
  return { length: Math.max(l, w), width: Math.min(l, w) }
}

function fromLocalXY(ring: XY[], rotationDeg: number): XY[] {
  const c = Math.cos(rotationDeg * RAD)
  const s = Math.sin(rotationDeg * RAD)
  return ring.map(([x, y]) => [x * c + y * s, -x * s + y * c])
}

export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos(lat * RAD)) / 2 ** zoom
}
