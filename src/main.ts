import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './style.css'
import rawStadiums from './data/stadiums.json'
import { type LatLon, type XY, toLocal, fromLocal, areaLatLon, centroid, longAxisBearing, dimensions } from './geo'

interface Stadium {
  id: string
  name: string
  club?: string
  city?: string
  capacity?: number | null
  outline: LatLon[][]
  pitch: LatLon[] | null
  buildings: LatLon[][]
  custom?: boolean
}

/** A stadium normalised to local metres, long axis pointing north, centred on its pitch. */
interface Shape {
  stadium: Stadium
  outline: XY[][]
  pitch: XY[] | null
  buildings: XY[][]
  area: number
  pitchDims: { length: number; width: number } | null
}

interface Overlay {
  shape: Shape
  color: string
  anchor: LatLon
  rotation: number
  group: L.LayerGroup
  outlines: L.Polygon[]
  pitch: L.Polygon | null
  buildings: L.Polygon[]
}

const REFERENCE_ID = 'maksimir'
const COLORS = ['#ff5a36', '#ffd23f', '#3ddc97', '#c77dff', '#ff66b3', '#4cc9f0', '#f9844a', '#b5e48c']
const DINAMO = '#1e6fd9'
const CUSTOM_KEY = 'stadion.custom'

function prepare(stadium: Stadium): Shape {
  const axisRing = stadium.pitch ?? stadium.outline[0]
  const anchor = centroid(axisRing)
  const axis = longAxisBearing(axisRing)
  // Rotate by -axis so every shape's long axis points north; placement re-applies the target axis.
  const norm = (r: LatLon[]) => canonical(toLocal(r, anchor), axis)
  return {
    stadium,
    outline: stadium.outline.map(norm),
    pitch: stadium.pitch ? norm(stadium.pitch) : null,
    buildings: stadium.buildings.map(norm),
    area: stadium.outline.reduce((t, r) => t + areaLatLon(r), 0),
    pitchDims: stadium.pitch ? dimensions(stadium.pitch) : null,
  }
}

function canonical(ring: XY[], axisDeg: number): XY[] {
  const a = (-axisDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return ring.map(([x, y]) => [x * c + y * s, -x * s + y * c])
}

// ---------- data ----------

const builtIn = (rawStadiums as unknown as Stadium[]).filter((s) => s.outline?.length)
const loadCustom = (): Stadium[] => {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]')
  } catch {
    return []
  }
}
const saveCustom = () => {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(library.filter((s) => s.stadium.custom).map((s) => s.stadium)))
  } catch {
    /* storage unavailable: custom areas just won't persist */
  }
}

const library: Shape[] = [...builtIn, ...loadCustom()].map(prepare)
const found = library.find((s) => s.stadium.id === REFERENCE_ID)
if (!found) throw new Error('Reference stadium missing from data')
const refShape: Shape = found
const refStadium = refShape.stadium
const refAnchor = centroid(refStadium.pitch ?? refStadium.outline[0])
const refAxis = longAxisBearing(refStadium.pitch ?? refStadium.outline[0])

// ---------- map ----------

const map = L.map('map', { zoomControl: false, zoomSnap: 0.25 }).setView(refAnchor, 17)
L.control.zoom({ position: 'bottomright' }).addTo(map)
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map)

const basemaps = {
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    maxNativeZoom: 18,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  }),
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    maxNativeZoom: 18,
    attribution: '© OpenStreetMap contributors',
  }),
}
basemaps.sat.addTo(map)

// Reference drawn from its real coordinates, so it lines up with the imagery exactly.
const refLayer = L.layerGroup().addTo(map)
refStadium.outline.forEach((r) =>
  L.polygon(r, { color: DINAMO, weight: 3, fillColor: DINAMO, fillOpacity: 0.12, interactive: false }).addTo(refLayer),
)
if (refStadium.pitch)
  L.polygon(refStadium.pitch, { color: '#ffffff', weight: 2, dashArray: '6 4', fill: false, interactive: false }).addTo(refLayer)

// ---------- overlays ----------

const overlays = new Map<string, Overlay>()
let opacity = 0.35

function place(o: Overlay) {
  const rot = refAxis + o.rotation
  const s = o.shape
  s.outline.forEach((r, i) => o.outlines[i].setLatLngs(fromLocal(r, o.anchor, rot)))
  s.buildings.forEach((r, i) => o.buildings[i].setLatLngs(fromLocal(r, o.anchor, rot)))
  if (s.pitch && o.pitch) o.pitch.setLatLngs(fromLocal(s.pitch, o.anchor, rot))
}

function nextColor() {
  const used = new Set([...overlays.values()].map((o) => o.color))
  return COLORS.find((c) => !used.has(c)) ?? COLORS[overlays.size % COLORS.length]
}

function addOverlay(shape: Shape) {
  const id = shape.stadium.id
  if (overlays.has(id) || id === REFERENCE_ID) return
  const color = nextColor()
  const group = L.layerGroup().addTo(map)
  const o: Overlay = {
    shape,
    color,
    anchor: refAnchor,
    rotation: 0,
    group,
    outlines: shape.outline.map(() =>
      L.polygon([], { color, weight: 2.5, fillColor: color, fillOpacity: opacity, className: 'overlay-shape' }).addTo(group),
    ),
    buildings: shape.buildings.map(() =>
      L.polygon([], { color, weight: 1, opacity: 0.9, fillOpacity: opacity * 0.6, fillColor: color, interactive: false }).addTo(group),
    ),
    pitch: shape.pitch
      ? L.polygon([], { color, weight: 2, dashArray: '2 5', fill: false, interactive: false }).addTo(group)
      : null,
  }
  o.outlines.forEach((p) => {
    p.bindTooltip(shape.stadium.name, { sticky: true, className: 'tip' })
    p.on('mousedown', (e: L.LeafletMouseEvent) => startDrag(o, e))
  })
  overlays.set(id, o)
  place(o)
  render()
}

function removeOverlay(id: string) {
  const o = overlays.get(id)
  if (!o) return
  o.group.remove()
  overlays.delete(id)
  render()
}

function applyOpacity() {
  overlays.forEach((o) => {
    o.outlines.forEach((p) => p.setStyle({ fillOpacity: opacity }))
    o.buildings.forEach((p) => p.setStyle({ fillOpacity: opacity * 0.6 }))
  })
}

// Drag an overlay around the map. Deltas are applied in lat/lon, which is exact enough
// over a few hundred metres and keeps the shape's metric size fixed (it's re-projected
// from local metres at the new anchor).
let drag: { o: Overlay; start: L.LatLng; anchor: LatLon } | null = null
function startDrag(o: Overlay, e: L.LeafletMouseEvent) {
  L.DomEvent.stop(e)
  drag = { o, start: e.latlng, anchor: o.anchor }
  map.dragging.disable()
  map.getContainer().classList.add('dragging')
}
map.on('mousemove', (e: L.LeafletMouseEvent) => {
  if (!drag) return
  drag.o.anchor = [drag.anchor[0] + e.latlng.lat - drag.start.lat, drag.anchor[1] + e.latlng.lng - drag.start.lng]
  place(drag.o)
})
const endDrag = () => {
  if (!drag) return
  drag = null
  map.dragging.enable()
  map.getContainer().classList.remove('dragging')
}
map.on('mouseup', endDrag)
document.addEventListener('mouseup', endDrag)

// ---------- UI ----------

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
const fmtArea = (m2: number) => (m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2)} km²` : `${fmtInt(m2)} m²`)
const ratio = (s: Shape) => s.area / refShape.area
const fmtRatio = (r: number) => `${r >= 1 ? '×' + r.toFixed(2) : Math.round(r * 100) + '%'}`
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function dimsText(s: Shape) {
  return s.pitchDims ? `${Math.round(s.pitchDims.length)} × ${Math.round(s.pitchDims.width)} m` : '—'
}

function renderReference() {
  $('#reference').innerHTML = `
    <div class="swatch" style="--c:${DINAMO}"></div>
    <div class="ref-body">
      <div class="eyebrow">Reference</div>
      <div class="name">${esc(refStadium.name)}</div>
      <div class="meta">${esc(refStadium.club ?? '')}</div>
      <dl class="stats">
        <div><dt>Footprint</dt><dd>${fmtArea(refShape.area)}</dd></div>
        <div><dt>Capacity</dt><dd>${refStadium.capacity ? fmtInt(refStadium.capacity) : '—'}</dd></div>
        <div><dt>Pitch</dt><dd>${dimsText(refShape)}</dd></div>
      </dl>
    </div>`
}

function renderActive() {
  const el = $('#active')
  if (!overlays.size) {
    el.innerHTML = `<p class="empty">Pick a stadium below to lay it over Maksimir.</p>`
    return
  }
  el.innerHTML = [...overlays.values()]
    .map((o) => {
      const s = o.shape
      const r = ratio(s)
      const cap = s.stadium.capacity
      const capDiff = cap && refStadium.capacity ? cap - refStadium.capacity : null
      return `
      <div class="card overlay" data-id="${esc(s.stadium.id)}">
        <div class="swatch" style="--c:${o.color}"></div>
        <div class="ov-body">
          <div class="ov-top">
            <div>
              <div class="name">${esc(s.stadium.name)}</div>
              <div class="meta">${esc([s.stadium.club, s.stadium.city].filter(Boolean).join(' · '))}</div>
            </div>
            <div class="big-ratio ${r >= 1 ? 'up' : 'down'}" title="Footprint vs Maksimir">${fmtRatio(r)}</div>
          </div>
          <dl class="stats">
            <div><dt>Footprint</dt><dd>${fmtArea(s.area)}</dd></div>
            <div><dt>Capacity</dt><dd>${cap ? fmtInt(cap) : '—'}${capDiff !== null ? ` <span class="${capDiff >= 0 ? 'up' : 'down'}">${capDiff >= 0 ? '+' : '−'}${fmtInt(Math.abs(capDiff))}</span>` : ''}</dd></div>
            <div><dt>Pitch</dt><dd>${dimsText(s)}</dd></div>
          </dl>
          <div class="controls">
            <label class="rot"><span>Rotate <output>${o.rotation}°</output></span>
              <input type="range" min="-180" max="180" step="1" value="${o.rotation}" data-act="rotate" />
            </label>
            <button data-act="reset" title="Snap back onto Maksimir's pitch">Re-centre</button>
            <button data-act="remove" class="ghost" title="Remove overlay">✕</button>
          </div>
        </div>
      </div>`
    })
    .join('')
}

function renderLibrary() {
  const sort = $<HTMLSelectElement>('#sort').value
  const items = library
    .filter((s) => s.stadium.id !== REFERENCE_ID)
    .sort((a, b) =>
      sort === 'name'
        ? a.stadium.name.localeCompare(b.stadium.name)
        : sort === 'capacity'
          ? (b.stadium.capacity ?? 0) - (a.stadium.capacity ?? 0)
          : b.area - a.area,
    )
  $('#library').innerHTML = items
    .map((s) => {
      const o = overlays.get(s.stadium.id)
      return `
      <li class="${o ? 'on' : ''}" data-id="${esc(s.stadium.id)}" style="${o ? `--c:${o.color}` : ''}">
        <button class="lib-item">
          <span class="dot"></span>
          <span class="lib-text">
            <span class="name">${esc(s.stadium.name)}${s.stadium.custom ? ' <em>custom</em>' : ''}</span>
            <span class="meta">${esc([s.stadium.club, s.stadium.city].filter(Boolean).join(' · '))}</span>
          </span>
          <span class="lib-num">
            <span>${fmtRatio(ratio(s))}</span>
            <span class="meta">${s.stadium.capacity ? fmtInt(s.stadium.capacity) : fmtArea(s.area)}</span>
          </span>
        </button>
        ${s.stadium.custom ? `<button class="del ghost" data-act="delete" title="Delete custom area">✕</button>` : ''}
      </li>`
    })
    .join('')
}

function render() {
  renderActive()
  renderLibrary()
  syncHash()
}

$('#active').addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement
  if (t.dataset.act !== 'rotate') return
  const o = overlays.get(t.closest<HTMLElement>('[data-id]')!.dataset.id!)!
  o.rotation = +t.value
  t.parentElement!.querySelector('output')!.textContent = `${o.rotation}°`
  place(o)
})
$('#active').addEventListener('change', syncHash)
$('#active').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-act]')
  if (!btn) return
  const id = btn.closest<HTMLElement>('[data-id]')!.dataset.id!
  const o = overlays.get(id)!
  if (btn.dataset.act === 'remove') removeOverlay(id)
  if (btn.dataset.act === 'reset') {
    o.anchor = refAnchor
    o.rotation = 0
    place(o)
    render()
    map.flyTo(refAnchor, Math.max(map.getZoom(), 16))
  }
})

$('#library').addEventListener('click', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-id]')
  if (!li) return
  const id = li.dataset.id!
  if ((e.target as HTMLElement).closest('[data-act="delete"]')) {
    removeOverlay(id)
    library.splice(library.findIndex((s) => s.stadium.id === id), 1)
    saveCustom()
    render()
    return
  }
  if (overlays.has(id)) removeOverlay(id)
  else addOverlay(library.find((s) => s.stadium.id === id)!)
  fitToOverlays()
})

$('#sort').addEventListener('change', renderLibrary)
$('#opacity').addEventListener('input', (e) => {
  opacity = +(e.target as HTMLInputElement).value
  applyOpacity()
})
$('#basemap').addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value as keyof typeof basemaps
  Object.values(basemaps).forEach((l) => l.remove())
  basemaps[v].addTo(map)
})
$('#panel-toggle').addEventListener('click', () => document.body.classList.toggle('panel-hidden'))

function fitToOverlays() {
  const b = L.latLngBounds(refStadium.outline.flat())
  overlays.forEach((o) => o.outlines.forEach((p) => b.extend(p.getBounds())))
  const panel = document.body.classList.contains('panel-hidden') || window.innerWidth < 720 ? 0 : 380
  map.flyToBounds(b, { paddingTopLeft: [panel + 24, 24], paddingBottomRight: [24, 24], maxZoom: 18, duration: 0.6 })
}

// ---------- OSM search (Nominatim) ----------

interface NominatimResult {
  osm_type: string
  osm_id: number
  display_name: string
  name?: string
  type: string
  category?: string
  geojson?: { type: string; coordinates: any }
  extratags?: Record<string, string>
}

function geojsonRings(g: NominatimResult['geojson']): LatLon[][] {
  if (!g) return []
  const toLL = (ring: [number, number][]) => ring.map(([lon, lat]) => [lat, lon] as LatLon)
  if (g.type === 'Polygon') return [toLL(g.coordinates[0])]
  if (g.type === 'MultiPolygon') return g.coordinates.map((p: [number, number][][]) => toLL(p[0]))
  return []
}

let searchResults: NominatimResult[] = []
$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const q = $<HTMLInputElement>('#q').value.trim()
  const list = $('#search-results')
  if (!q) return
  list.innerHTML = `<li class="status">Searching…</li>`
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&extratags=1&limit=8&q=${encodeURIComponent(q)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const all: NominatimResult[] = await res.json()
    searchResults = all.filter((r) => geojsonRings(r.geojson).length)
    list.innerHTML = searchResults.length
      ? searchResults
          .map(
            (r, i) => `<li><button data-i="${i}"><span class="name">${esc(r.name || r.display_name.split(',')[0])}</span>
            <span class="meta">${esc(r.type)} · ${esc(r.display_name.split(',').slice(1, 3).join(',').trim())} · ${fmtArea(geojsonRings(r.geojson).reduce((t, x) => t + areaLatLon(x), 0))}</span></button></li>`,
          )
          .join('')
      : `<li class="status">No areas found (only results with a polygon outline can be overlaid).</li>`
  } catch {
    list.innerHTML = `<li class="status">Search failed — check your connection.</li>`
  }
})

$('#search-results').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-i]')
  if (!btn) return
  const r = searchResults[+btn.dataset.i!]
  const id = `osm-${r.osm_type}-${r.osm_id}`
  let shape = library.find((s) => s.stadium.id === id)
  if (!shape) {
    const cap = r.extratags?.capacity ? parseInt(r.extratags.capacity, 10) : null
    const parts = r.display_name.split(',').map((s) => s.trim())
    shape = prepare({
      id,
      name: r.name || parts[0],
      city: parts.slice(1, 3).join(', '),
      capacity: Number.isFinite(cap) ? cap : null,
      outline: geojsonRings(r.geojson),
      pitch: null,
      buildings: [],
      custom: true,
    })
    library.push(shape)
    saveCustom()
  }
  addOverlay(shape)
  fitToOverlays()
  $('#search-results').innerHTML = ''
  $<HTMLInputElement>('#q').value = ''
})

// ---------- shareable URL: #s=id@rotation,id@rotation ----------

function syncHash() {
  const parts = [...overlays.values()].map((o) => o.shape.stadium.id + (o.rotation ? `@${o.rotation}` : ''))
  history.replaceState(null, '', parts.length ? `#s=${parts.join(',')}` : location.pathname)
}

function restoreHash() {
  const m = location.hash.match(/s=([^&]+)/)
  if (!m) return false
  decodeURIComponent(m[1])
    .split(',')
    .forEach((p) => {
      const [id, rot] = p.split('@')
      const shape = library.find((s) => s.stadium.id === id)
      if (!shape) return
      addOverlay(shape)
      const o = overlays.get(id)
      if (o && rot) {
        o.rotation = +rot || 0
        place(o)
      }
    })
  return overlays.size > 0
}

renderReference()
const DEFAULT_OVERLAYS = ['camp-nou', 'allianz']
if (!restoreHash()) DEFAULT_OVERLAYS.forEach((id) => {
  const shape = library.find((s) => s.stadium.id === id)
  if (shape) addOverlay(shape)
})
render()
fitToOverlays()
