// Coberturas rectangulares aproximadas; no son límites administrativos.
export const catalogRegions = [
  {
    id: "valencia", label: "Valencia y alrededores",
    center: [39.4699, -0.3763],
    coverage: { south: 39.28, west: -0.62, north: 39.67, east: -0.20 },
    snapshot: "osm-places.json", rows: 2, columns: 2,
  },
  {
    id: "madrid", label: "Madrid y área metropolitana",
    center: [40.4168, -3.7038],
    coverage: { south: 40.16, west: -4.03, north: 40.72, east: -3.20 },
    snapshot: "osm-madrid.json", rows: 4, columns: 4,
  },
];

export function getCatalogRegion(id = "valencia") {
  const region = catalogRegions.find((item) => item.id === id);
  if (!region) throw Error(`Zona de catálogo desconocida: ${id}`);
  return region;
}

export function containsPosition(coverage, position) {
  return position.lat >= coverage.south && position.lat <= coverage.north &&
    position.lng >= coverage.west && position.lng <= coverage.east;
}

export function regionForPosition(position) {
  return catalogRegions.find((region) => containsPosition(region.coverage, position));
}

export function catalogPath(id = "valencia") {
  return `osmCatalogTest/${getCatalogRegion(id).id}`;
}

export function regionTiles(region) {
  const { south, north, west, east } = region.coverage;
  return Array.from({ length: region.rows * region.columns }, (_, index) => {
    const row = Math.floor(index / region.columns), column = index % region.columns;
    return [
      south + (north - south) * row / region.rows,
      west + (east - west) * column / region.columns,
      south + (north - south) * (row + 1) / region.rows,
      west + (east - west) * (column + 1) / region.columns,
    ];
  });
}

export function regionsFromArgs(args) {
  const option = args.find((argument) => argument.startsWith("--region="));
  const id = option?.slice("--region=".length) || "valencia";
  return id === "all" ? catalogRegions : [getCatalogRegion(id)];
}

export const nationalCoverage = { south: 27.5, west: -18.3, north: 43.9, east: 4.6 };
// Extensiones aproximadas de las fuentes; los lugares proceden del extracto OSM.
export const nationalAreas = [
  { south: 35.95, west: -9.6, north: 43.9, east: 4.6 },
  { south: 27.5, west: -18.3, north: 29.5, east: -13.3 },
  { south: 35.85, west: -5.4, north: 35.94, east: -5.23 },
  { south: 35.25, west: -2.99, north: 35.34, east: -2.9 },
];
export const withinNationalArea = (position) => nationalAreas.some((area) => containsPosition(area, position));
