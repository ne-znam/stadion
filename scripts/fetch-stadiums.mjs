// Fetches stadium footprints (outline, pitch, stands) from OpenStreetMap via Overpass
// and writes them to src/data/stadiums.json. Run with: npm run fetch-data
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'

const STADIUMS = [
  { id: 'maksimir', name: 'Stadion Maksimir', club: 'Dinamo Zagreb', city: 'Zagreb', capacity: 24851, lat: 45.8187, lon: 16.0181 },
  { id: 'poljud', name: 'Poljud', club: 'Hajduk Split', city: 'Split', capacity: 33987, lat: 43.5197, lon: 16.4318 },
  { id: 'rujevica', name: 'Stadion Rujevica', club: 'HNK Rijeka', city: 'Rijeka', capacity: 8279, lat: 45.3477, lon: 14.4022 },
  { id: 'opus-arena', name: 'Opus Arena', club: 'NK Osijek', city: 'Osijek', capacity: 13005, lat: 45.5665, lon: 18.6578 },
  { id: 'marakana', name: 'Rajko Mitić', club: 'Red Star Belgrade', city: 'Belgrade', capacity: 51755, lat: 44.7832, lon: 20.4648 },
  { id: 'stozice', name: 'Stožice', club: 'Olimpija Ljubljana', city: 'Ljubljana', capacity: 16038, lat: 46.0805, lon: 14.5249 },
  { id: 'ernst-happel', name: 'Ernst-Happel-Stadion', club: 'Austria NT', city: 'Vienna', capacity: 50865, lat: 48.2074, lon: 16.4206 },
  { id: 'camp-nou', name: 'Spotify Camp Nou', club: 'FC Barcelona', city: 'Barcelona', capacity: 105000, lat: 41.3809, lon: 2.1228 },
  { id: 'bernabeu', name: 'Santiago Bernabéu', club: 'Real Madrid', city: 'Madrid', capacity: 83186, lat: 40.4531, lon: -3.6883 },
  { id: 'wembley', name: 'Wembley Stadium', club: 'England NT', city: 'London', capacity: 90000, lat: 51.5560, lon: -0.2796 },
  { id: 'old-trafford', name: 'Old Trafford', club: 'Manchester United', city: 'Manchester', capacity: 74197, lat: 53.4631, lon: -2.2913 },
  { id: 'anfield', name: 'Anfield', club: 'Liverpool', city: 'Liverpool', capacity: 61276, lat: 53.4308, lon: -2.9608 },
  { id: 'tottenham', name: 'Tottenham Hotspur Stadium', club: 'Tottenham', city: 'London', capacity: 62850, lat: 51.6043, lon: -0.0664 },
  { id: 'celtic-park', name: 'Celtic Park', club: 'Celtic', city: 'Glasgow', capacity: 60411, lat: 55.8497, lon: -4.2055 },
  { id: 'allianz', name: 'Allianz Arena', club: 'Bayern Munich', city: 'Munich', capacity: 75024, lat: 48.2188, lon: 11.6247 },
  { id: 'signal-iduna', name: 'Signal Iduna Park', club: 'Borussia Dortmund', city: 'Dortmund', capacity: 81365, lat: 51.4926, lon: 7.4519 },
  { id: 'olympiastadion', name: 'Olympiastadion', club: 'Hertha BSC', city: 'Berlin', capacity: 74475, lat: 52.5147, lon: 13.2395 },
  { id: 'san-siro', name: 'San Siro', club: 'AC Milan / Inter', city: 'Milan', capacity: 75817, lat: 45.4781, lon: 9.1240 },
  { id: 'parc-des-princes', name: 'Parc des Princes', club: 'Paris Saint-Germain', city: 'Paris', capacity: 47929, lat: 48.8414, lon: 2.2530 },
  { id: 'stade-de-france', name: 'Stade de France', club: 'France NT', city: 'Saint-Denis', capacity: 80698, lat: 48.9245, lon: 2.3602 },
  { id: 'johan-cruijff', name: 'Johan Cruijff ArenA', club: 'Ajax', city: 'Amsterdam', capacity: 55865, lat: 52.3144, lon: 4.9415 },
  { id: 'luzhniki', name: 'Luzhniki', club: 'Russia NT', city: 'Moscow', capacity: 81000, lat: 55.7158, lon: 37.5537 },
  { id: 'maracana', name: 'Maracanã', club: 'Flamengo / Fluminense', city: 'Rio de Janeiro', capacity: 78838, lat: -22.9122, lon: -43.2302 },
  { id: 'azteca', name: 'Estadio Azteca', club: 'Club América', city: 'Mexico City', capacity: 83264, lat: 19.3029, lon: -99.1505 },
  { id: 'mcg', name: 'Melbourne Cricket Ground', club: 'AFL / Cricket', city: 'Melbourne', capacity: 100024, lat: -37.8200, lon: 144.9834 },
  { id: 'rungrado', name: 'Rungrado 1st of May', club: 'North Korea NT', city: 'Pyongyang', capacity: 114000, lat: 39.0494, lon: 125.7755 },
  { id: 'michigan', name: 'Michigan Stadium', club: 'Michigan Wolverines', city: 'Ann Arbor', capacity: 107601, lat: 42.2658, lon: -83.7487 },
]

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']

async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length]
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'stadion-overlay/0.1', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(90_000),
      })
      if (res.ok) return await res.json()
      console.warn(`  ${url} -> ${res.status}, retrying`)
    } catch (e) {
      console.warn(`  ${url} -> ${e.message}, retrying`)
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
  }
  throw new Error('Overpass failed')
}

// Converts a way/relation with `out geom` into an array of rings ([[lat, lon], ...]).
function rings(el) {
  if (el.type === 'way') return [el.geometry.map((p) => [p.lat, p.lon])]
  // Relation: stitch outer members into closed rings.
  const segs = el.members.filter((m) => m.role !== 'inner' && m.geometry).map((m) => m.geometry.map((p) => [p.lat, p.lon]))
  const out = []
  const same = (a, b) => a[0] === b[0] && a[1] === b[1]
  while (segs.length) {
    let ring = segs.shift()
    let grown = true
    while (!same(ring[0], ring[ring.length - 1]) && grown) {
      grown = false
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        const end = ring[ring.length - 1]
        if (same(end, s[0])) ring = ring.concat(s.slice(1))
        else if (same(end, s[s.length - 1])) ring = ring.concat(s.slice(0, -1).reverse())
        else continue
        segs.splice(i, 1)
        grown = true
        break
      }
    }
    out.push(ring)
  }
  return out
}

// Planar area in m² of a ring, using a local equirectangular projection.
function areaM2(ring) {
  const lat0 = (ring.reduce((s, p) => s + p[0], 0) / ring.length) * (Math.PI / 180)
  const R = 6371008.8
  const xy = ring.map(([lat, lon]) => [lon * (Math.PI / 180) * R * Math.cos(lat0), lat * (Math.PI / 180) * R])
  let a = 0
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i]
    const [x2, y2] = xy[(i + 1) % xy.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  const upper = []
  for (const p of pts) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop()
    lower.push(p)
  }
  for (const p of pts.reverse()) {
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop()
    upper.push(p)
  }
  const ring = lower.slice(0, -1).concat(upper.slice(0, -1))
  return ring.concat([ring[0]])
}

// Some leisure=stadium areas cover the whole grounds (car parks, forecourts) with no single
// building around the pitch, e.g. Celtic Park. When the stands and pitch are mapped, their
// hull is a far better footprint; for correctly mapped stadiums the two agree within ~10%.
function tightenOutline(r) {
  if (r.buildings.length < 3 || !r.pitch) return r
  const hull = convexHull([...r.pitch, ...r.buildings.flat()])
  const hullArea = areaM2(hull)
  if (r.outlineArea < hullArea * 1.6) return r
  return { ...r, outline: [round(hull)], outlineArea: Math.round(hullArea), outlineSource: 'hull of stands' }
}

const round = (r) => r.map(([a, b]) => [+a.toFixed(7), +b.toFixed(7)])

function pointInRing([lat, lon], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const centroid = (ring) => [ring.reduce((t, p) => t + p[0], 0) / ring.length, ring.reduce((t, p) => t + p[1], 0) / ring.length]

async function fetchStadium(s) {
  const around = `around:450,${s.lat},${s.lon}`
  const data = await overpass(`[out:json][timeout:90];
(way(${around})[leisure=stadium];relation(${around})[leisure=stadium];
 way(${around})[leisure=pitch];
 way(${around})[building];);
out geom;`)
  const stadiumEls = data.elements.filter((e) => e.tags?.leisure === 'stadium')
  if (!stadiumEls.length) throw new Error('no leisure=stadium found')
  const candidates = stadiumEls
    .map((e) => ({ e, rings: rings(e) }))
    .map((x) => ({ ...x, area: x.rings.reduce((t, r) => t + areaM2(r), 0), contains: x.rings.some((r) => pointInRing([s.lat, s.lon], r)) }))
    .filter((x) => x.area > 8000)
  if (!candidates.length) throw new Error('no stadium polygon big enough')
  // Nested stadium areas are common (inner bowl, stadium, whole grounds). Take the largest one that
  // contains the pitch but is still stadium-sized; the building check below trims oversized grounds.
  const containing = candidates.filter((x) => x.contains).sort((a, b) => b.area - a.area)
  let stadium = containing.find((x) => x.area < 100000) ?? containing.at(-1) ?? candidates.sort((a, b) => a.area - b.area)[0]
  // leisure=stadium often covers the whole grounds (car parks, training pitches). When a single
  // building encloses the pitch, its outline is the true structure footprint, so prefer that.
  const enclosing = data.elements
    .filter((e) => e.tags?.building && e.tags?.leisure !== 'stadium')
    .map((e) => ({ e, rings: rings(e) }))
    .map((x) => ({ ...x, area: x.rings.reduce((t, r) => t + areaM2(r), 0) }))
    .filter((x) => x.area > 15000 && x.area < stadium.area * 0.95 && x.rings.some((r) => pointInRing([s.lat, s.lon], r)))
    .sort((a, b) => b.area - a.area)
  const grounds = stadium
  if (enclosing[0]) stadium = { ...enclosing[0], e: { ...enclosing[0].e, tags: { ...enclosing[0].e.tags, name: grounds.e.tags?.name } } }
  const insideStadium = (ring) => stadium.rings.some((r) => pointInRing(centroid(ring), r))

  const inner = data.elements.filter((e) => e.tags?.leisure !== 'stadium' && e.id !== stadium.e.id && insideStadium(rings(e)[0]))
  const pitches = inner.filter((e) => e.tags?.leisure === 'pitch').map((e) => ({ rings: rings(e), tags: e.tags }))
    .map((p) => ({ ...p, area: areaM2(p.rings[0]) }))
    .filter((p) => p.area > 5000 && p.area < 11000)
    .sort((a, b) => b.area - a.area)
  const buildings = inner.filter((e) => e.tags?.building).flatMap((e) => rings(e))
    .filter((r) => areaM2(r) > 60)

  return {
    ...s,
    osm: `${stadium.e.type}/${stadium.e.id}`,
    osmName: stadium.e.tags?.name ?? null,
    outline: stadium.rings.map(round),
    outlineArea: Math.round(stadium.area),
    pitch: pitches[0] ? round(pitches[0].rings[0]) : null,
    pitchArea: pitches[0] ? Math.round(pitches[0].area) : null,
    buildings: buildings.map(round),
  }
}

const OUT = 'src/data/stadiums.json'
const force = process.argv.includes('--force')
const cached = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const out = []
for (const s of STADIUMS) {
  const hit = !force && cached.find((c) => c.id === s.id)
  if (hit) {
    out.push(tightenOutline({ ...hit, ...s }))
    continue
  }
  process.stdout.write(`${s.name}… `)
  try {
    const r = tightenOutline(await fetchStadium(s))
    out.push(r)
    mkdirSync('src/data', { recursive: true })
    writeFileSync(OUT, JSON.stringify(out))
    console.log(`${r.osm} "${r.osmName}" outline ${r.outlineArea} m², pitch ${r.pitchArea ?? '—'} m², ${r.buildings.length} buildings`)
  } catch (e) {
    // Keep the previous data rather than dropping the stadium when a refetch fails.
    const prev = cached.find((c) => c.id === s.id)
    if (prev) out.push({ ...prev, ...s })
    console.log(`FAILED: ${e.message}${prev ? ' (kept cached)' : ''}`)
  }
  await new Promise((r) => setTimeout(r, 1500))
}
mkdirSync('src/data', { recursive: true })
writeFileSync(OUT, JSON.stringify(out))
console.log(`\nWrote ${out.length}/${STADIUMS.length} stadiums to src/data/stadiums.json`)
