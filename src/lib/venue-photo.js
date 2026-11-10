// Las referencias proceden del propio local en OSM, nunca de búsquedas por nombre.
function commonsPhoto(value) {
  let title = value;
  if (!/^File:/i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.hostname !== "commons.wikimedia.org") return null;
      title = decodeURIComponent(url.pathname.replace(/^\/wiki\//, ""));
    } catch {
      return null;
    }
  }
  if (!/^File:.+\.(jpe?g|png|webp|gif)$/i.test(title)) return null;
  const file = encodeURIComponent(title.slice(5));
  return {
    src: `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=640`,
    source: `https://commons.wikimedia.org/wiki/File:${file}`,
    label: "Wikimedia Commons · Autoría y licencia",
  };
}

export function venuePhoto(venue) {
  const tags = venue?.tags || {};
  for (const value of [tags.wikimedia_commons, tags.image]) {
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    const commons = commonsPhoto(trimmed);
    if (commons) return commons;
    // Una categoría de Commons o una página web no es una imagen.
    if (value !== tags.image) continue;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" || url.username || url.password ||
          !/\.(jpe?g|png|webp|gif)$/i.test(url.pathname)) continue;
      return { src: url.href, source: url.href, label: "Fuente de la foto" };
    } catch {
      // Referencias incompletas o protocolos no admitidos: conservar la ficha sin foto.
    }
  }
  return null;
}
