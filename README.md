# Stadium Overlay

Lays real stadium footprints over Stadion Maksimir (Dinamo Zagreb) at true scale, so you can compare their size on satellite imagery.

```sh
npm install
npm run dev          # http://localhost:5173
npm run fetch-data   # refresh src/data/stadiums.json from OpenStreetMap (--force refetches all)
```

- Each stadium's outline, pitch and stand buildings come from OpenStreetMap (`leisure=stadium`, `leisure=pitch`, `building`).
- Shapes are converted to local metres and re-projected at Maksimir's latitude, so Web Mercator doesn't distort sizes (a stadium from Manchester and one from Rio are both drawn at true size).
- Every overlay starts centred on Maksimir's pitch, with its long axis aligned to Maksimir's. You can drag it or rotate it with the slider.
- The search box adds any OSM area that has a polygon, such as another stadium, a park or a building. It uses Nominatim, and custom areas are kept in localStorage.
- The URL hash (`#s=camp-nou,wembley@30`) records the active overlays and their rotations, so you can share a comparison as a link.

To add a stadium to the built-in list, add an entry to `STADIUMS` in `scripts/fetch-stadiums.mjs` with a point inside the stadium, then run `npm run fetch-data`.
