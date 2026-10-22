const encode = (value) => {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  throw Error("Valor no serializable para Firestore");
};
const decode = (value) => {
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("nullValue" in value) return null;
  return value.stringValue ?? value.booleanValue ?? value.doubleValue;
};

// REST público: una sola petición con plazo de 30 s y sin reintentar la cuota.
// Cada commit conserva documentos, manifiesto de bloque y progreso atómicos.
export function createRestStore({ projectId, emulator, token = async () => "", fetcher = fetch }) {
  const database = `projects/${projectId}/databases/(default)`;
  const host = emulator ? `http://${emulator}` : "https://firestore.googleapis.com";
  const base = `${host}/v1/${database}/documents`;
  function name(path) {
    if (!(path === "osmCatalogTest/espana" || path.startsWith("osmCatalogTest/espana/")) || path.includes("..")) throw Error("Ruta fuera del catálogo nacional");
    return `${database}/documents/${path}`;
  }
  async function request(url, method = "GET", body) {
    const accessToken = await token();
    const response = await fetcher(url, { method, headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    if (response.status === 404 && method === "GET") return null;
    const result = await response.json();
    if (!response.ok) {
      const error = Error(`${result.error?.status || response.status}: ${result.error?.message || "Firestore rechazó la operación"}`);
      error.code = result.error?.status || response.status;
      throw error;
    }
    return result;
  }
  return {
    async get(path) {
      name(path);
      const result = await request(`${host}/v1/${name(path)}`);
      return result ? { data: decode({ mapValue: { fields: result.fields } }), updateTime: result.updateTime } : null;
    },
    async commit(operations) {
      const writes = operations.map(({ path, data, precondition }) => ({
        ...(data === undefined ? { delete: name(path) } : { update: { name: name(path), fields: encode(data).mapValue.fields } }),
        ...(precondition ? { currentDocument: precondition } : {}),
      }));
      await request(`${base}:commit`, "POST", { writes });
    },
  };
}
