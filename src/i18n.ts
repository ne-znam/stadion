// UI strings in English and Croatian. Language is picked from ?lang=, then the viewer's
// last choice, then the browser language.

export type Lang = 'en' | 'hr'

const en = {
  pageTitle: 'Stadium Overlay',
  title: 'Stadium Overlay',
  subtitle: 'True-scale footprints laid over <strong>Stadion Maksimir</strong>, Zagreb',
  searchLabel: 'Add any stadium or area from OpenStreetMap',
  searchPlaceholder: 'e.g. Estádio da Luz, Hyde Park…',
  search: 'Search',
  stadiums: 'Stadiums',
  sortArea: 'Sort: footprint',
  sortCapacity: 'Sort: capacity',
  sortName: 'Sort: name',
  opacity: 'Overlay opacity',
  basemap: 'Basemap',
  satellite: 'Satellite',
  streets: 'Streets',
  hint: 'Drag an overlay to move it. Footprint data © OpenStreetMap contributors.',
  togglePanel: 'Toggle panel',
  reference: 'Reference',
  footprint: 'Footprint',
  capacity: 'Capacity',
  pitch: 'Pitch',
  empty: 'Pick a stadium below to lay it over Maksimir.',
  ratioTitle: 'Footprint vs Maksimir',
  rotate: 'Rotate',
  recentre: 'Re-centre',
  recentreTitle: "Snap back onto Maksimir's pitch",
  remove: 'Remove overlay',
  custom: 'custom',
  deleteCustom: 'Delete custom area',
  searching: 'Searching…',
  noResults: 'No areas found (only results with a polygon outline can be overlaid).',
  searchFailed: 'Search failed — check your connection.',
}

type Strings = typeof en

const hr: Strings = {
  pageTitle: 'Usporedba stadiona',
  title: 'Usporedba stadiona',
  subtitle: 'Tlocrti stadiona u stvarnom mjerilu preko <strong>Stadiona Maksimir</strong> u Zagrebu',
  searchLabel: 'Dodaj bilo koji stadion ili područje s OpenStreetMapa',
  searchPlaceholder: 'npr. Estádio da Luz, Park Maksimir…',
  search: 'Traži',
  stadiums: 'Stadioni',
  sortArea: 'Poredaj: tlocrt',
  sortCapacity: 'Poredaj: kapacitet',
  sortName: 'Poredaj: ime',
  opacity: 'Prozirnost preklopa',
  basemap: 'Podloga',
  satellite: 'Satelit',
  streets: 'Karta',
  hint: 'Povuci preklop mišem da ga pomakneš. Podaci o tlocrtima © OpenStreetMap suradnici.',
  togglePanel: 'Prikaži ili sakrij izbornik',
  reference: 'Referenca',
  footprint: 'Tlocrt',
  capacity: 'Kapacitet',
  pitch: 'Teren',
  empty: 'Odaberi stadion s popisa i postavi ga preko Maksimira.',
  ratioTitle: 'Tlocrt u odnosu na Maksimir',
  rotate: 'Rotacija',
  recentre: 'Centriraj',
  recentreTitle: 'Vrati na teren Maksimira',
  remove: 'Ukloni preklop',
  custom: 'vlastito',
  deleteCustom: 'Obriši vlastito područje',
  searching: 'Tražim…',
  noResults: 'Nema rezultata (preklopiti se mogu samo područja s ucrtanim obrisom).',
  searchFailed: 'Pretraga nije uspjela — provjeri internetsku vezu.',
}

/** Croatian names for built-in stadiums' club and city fields, keyed by stadium id. */
const hrStadiumMeta: Record<string, { club?: string; city?: string }> = {
  poljud: { city: 'Split' },
  marakana: { club: 'Crvena zvezda', city: 'Beograd' },
  'ernst-happel': { club: 'Reprezentacija Austrije', city: 'Beč' },
  wembley: { club: 'Reprezentacija Engleske' },
  allianz: { club: 'Bayern München', city: 'München' },
  'san-siro': { city: 'Milano' },
  'parc-des-princes': { city: 'Pariz' },
  'stade-de-france': { club: 'Reprezentacija Francuske' },
  luzhniki: { club: 'Reprezentacija Rusije', city: 'Moskva' },
  azteca: { city: 'Ciudad de México' },
  mcg: { club: 'AFL / kriket' },
  rungrado: { club: 'Reprezentacija Sjeverne Koreje', city: 'Pjongjang' },
  'johan-cruijff': { city: 'Amsterdam' },
}

const dicts: Record<Lang, Strings> = { en, hr }
const LANG_KEY = 'stadion.lang'

function detect(): Lang {
  const param = new URLSearchParams(location.search).get('lang')
  if (param === 'hr' || param === 'en') return param
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'hr' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  return navigator.languages?.some((l) => /^(hr|bs|sr|sh)\b/i.test(l)) ? 'hr' : 'en'
}

export let lang: Lang = detect()

export function setLang(next: Lang) {
  lang = next
  try {
    localStorage.setItem(LANG_KEY, next)
  } catch {
    /* storage unavailable: choice just won't persist */
  }
  const url = new URL(location.href)
  if (next === 'en') url.searchParams.delete('lang')
  else url.searchParams.set('lang', next)
  history.replaceState(null, '', url)
}

export const t = (key: keyof Strings) => dicts[lang][key]
export const locale = () => (lang === 'hr' ? 'hr-HR' : 'en-US')

export function stadiumMeta(id: string, club?: string, city?: string) {
  const o = lang === 'hr' ? hrStadiumMeta[id] : undefined
  return [o?.club ?? club, o?.city ?? city].filter(Boolean).join(' · ')
}

/** Fills every [data-i18n] element's text (or [data-i18n-html], [data-i18n-placeholder], [data-i18n-aria]). */
export function applyStatic() {
  document.documentElement.lang = lang
  document.title = t('pageTitle')
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n as keyof Strings)))
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml as keyof Strings)))
  document
    .querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')
    .forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder as keyof Strings)))
  document
    .querySelectorAll<HTMLElement>('[data-i18n-aria]')
    .forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria as keyof Strings)))
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)))
}
