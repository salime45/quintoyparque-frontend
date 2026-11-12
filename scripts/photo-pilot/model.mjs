export const PRICE = Object.freeze({
  checkedAt: "2026-11-12", currency: "USD", sku: "Places UI Kit Query",
  perThousand: 1, monthlyFreeEvents: 10000,
  source: "https://developers.google.com/maps/billing-and-pricing/pricing",
});
export const VERDICTS = ["foto_correcta", "sin_foto", "local_incorrecto", "dudoso", "error"];

export function validateSample(sample) {
  if (sample?.version !== 1 || !Array.isArray(sample.venues) || sample.venues.length !== 300)
    throw Error("El piloto requiere una muestra de 300 locales");
  const ids = new Set();
  for (const row of sample.venues) {
    if (!/^(node|way|relation)\/[0-9]+$/.test(row.id) || ids.has(row.id) ||
        typeof row.name !== "string" || !["ciudades", "entornos_pueblos"].includes(row.group) ||
        !Number.isFinite(row.lat) || !Number.isFinite(row.lon) ||
        Math.abs(row.lat) > 90 || Math.abs(row.lon) > 180) throw Error("Local de muestra inválido");
    ids.add(row.id);
  }
  for (const group of ["ciudades", "entornos_pueblos"])
    if (sample.venues.filter((row) => row.group === group).length !== 150)
      throw Error("La muestra debe contener 150 locales por grupo");
}

export function validateState(state, sample) {
  if (state.version !== 1 || state.sampleRevision !== sample.revision ||
      !Array.isArray(state.attempts) || !Array.isArray(state.reviews) ||
      !Number.isInteger(state.maxQueries) || state.maxQueries < 1 || state.maxQueries > 600 ||
      state.attempts.length > state.maxQueries) throw Error("Progreso del piloto inválido");
  const ids = new Set(sample.venues.map((row) => row.id));
  const attempts = new Set();
  for (const attempt of state.attempts) {
    if (!ids.has(attempt.venueId) || typeof attempt.id !== "string" || attempts.has(attempt.id))
      throw Error("Intento de consulta inválido");
    attempts.add(attempt.id);
  }
  const reviewed = new Set();
  for (const review of state.reviews) {
    if (!ids.has(review.venueId) || reviewed.has(review.venueId) || !VERDICTS.includes(review.verdict) ||
        !state.attempts.some((attempt) => attempt.id === review.attemptId && attempt.venueId === review.venueId) ||
        (review.placeId !== undefined && (typeof review.placeId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(review.placeId))) ||
        (["foto_correcta", "sin_foto"].includes(review.verdict) && !review.placeId)) throw Error("Evaluación inválida");
    reviewed.add(review.venueId);
  }
}

export function buildReport(sample, state) {
  validateSample(sample);
  validateState(state, sample);
  const count = (rows) => {
    const reviews = state.reviews.filter((review) => rows.some((row) => row.id === review.venueId));
    const correct = reviews.filter((review) => review.verdict === "foto_correcta").length;
    return { total: rows.length, reviewed: reviews.length, correctPhotos: correct,
      pending: rows.length - reviews.length,
      verifiedPercentOfSample: Number((100 * correct / rows.length).toFixed(2)),
      verdicts: Object.fromEntries(VERDICTS.map((value) => [value, reviews.filter((review) => review.verdict === value).length])) };
  };
  const total = count(sample.venues);
  const potentialMaximum = total.correctPhotos + total.pending;
  const outcome = total.reviewed < total.total ? "pendiente_de_revision"
    : total.correctPhotos >= 270 ? "objetivo_observado_en_muestra" : "objetivo_no_alcanzado";
  return { version: 1, sampleRevision: sample.revision, generatedAt: new Date().toISOString(),
    targetPercent: 90, outcome, total,
    canStillReachTarget: potentialMaximum >= 270,
    groups: Object.fromEntries(["ciudades", "entornos_pueblos"].map((group) => [group, count(sample.venues.filter((row) => row.group === group))])),
    usage: { initiatedQueries: state.attempts.length, maxQueries: state.maxQueries,
      remainingQueries: state.maxQueries - state.attempts.length },
    cost: { ...PRICE,
      estimatedGrossUsd: Number((state.attempts.length * PRICE.perThousand / 1000).toFixed(4)),
      configuredGrossEstimateUsd: state.maxQueries * PRICE.perThousand / 1000,
      projectionFor46903QueriesUsd: 46903 * PRICE.perThousand / 1000,
      note: "Estimación de las consultas iniciadas, sin descontar franquicias ni incluir impuestos, reintentos internos del proveedor o futuras visitas. No es una factura ni un límite de gasto de Google Cloud." },
    limitations: [
      "Muestra exploratoria equilibrada por entornos; no permite garantizar un 90 % nacional.",
      "La identidad y la foto se confirman visualmente; cargar un resultado no cuenta como éxito.",
      "Los pendientes, errores, locales sin nombre y casos dudosos permanecen en el denominador.",
      "Los entornos son radios de selección, no límites municipales ni una clasificación oficial de población.",
    ],
    compatibility: { component: "Places UI Kit (Place Search Element)",
      source: "https://developers.google.com/maps/comms/eea/places",
      note: "Para integrar en Leaflet, utilizar componentes oficiales y sus atribuciones. No reutilizar las imágenes como archivos propios ni como tags.image en Firestore." },
    reviews: state.reviews,
  };
}
