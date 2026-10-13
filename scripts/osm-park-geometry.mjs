/**
 * Geometría de zonas verdes obtenida de OpenStreetMap (Overpass "out geom").
 * Los emparejamientos se calculan en la actualización semanal del catálogo:
 * NO hay excepciones, coordenadas ni nombres de establecimientos manuales.
 *
 * Para una relación multipolígono, los tramos se cosen por sus extremos.
 * Los huecos "inner" se respetan y las partes exteriores disjuntas no se
 * consideran un único recinto. Las geometrías abiertas se descartan.
 */
const EPS = 1e-7;
const isNumber = v => Number.isFinite(v);
const near = (a,b) => Math.abs(a[0]-b[0]) <= EPS && Math.abs(a[1]-b[1]) <= EPS;
const point = p => isNumber(p?.lat) && isNumber(p?.lon);
const isParkArea = tags => ["park","garden"].includes(tags?.leisure);
const isPlayground = o => o?.tags?.leisure === "playground";
const isVenue = o => ["cafe","bar","restaurant"].includes(o?.tags?.amenity);
const distance = (a,b) => 111195 * Math.hypot(
  a.lat-b.lat, (a.lon-b.lon)*Math.cos((a.lat+b.lat)*Math.PI/360)
);
function vertices(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2 || !geometry.every(point)) return [];
  return geometry.map(v=>[v.lon,v.lat]);
}
function segmentRings(rawSegments) {
  const remaining=rawSegments.map(vertices).filter(x=>x.length>=2);
  const rings=[];
  while(remaining.length){
    const chain=remaining.shift().slice();
    let changed=true;
    while(!near(chain[0],chain.at(-1)) && changed){
      changed=false;
      for(let i=0;i<remaining.length;i++){
        const seg=remaining[i],first=chain[0],last=chain.at(-1);
        if(near(last,seg[0])) chain.push(...seg.slice(1));
        else if(near(last,seg.at(-1))) chain.push(...seg.slice(0,-1).reverse());
        else if(near(first,seg.at(-1))) chain.unshift(...seg.slice(0,-1));
        else if(near(first,seg[0])) chain.unshift(...seg.slice(1).reverse());
        else continue;
        remaining.splice(i,1);
        changed=true;
        break;
      }
    }
    // No cerrar artificialmente trazados incompletos.
    if(chain.length>=4 && near(chain[0],chain.at(-1)))rings.push(chain);
  }
  return rings;
}
function boundsOf(ring){
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
  return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
function insideBounds(o,b){
  return o.lon>=b[0]&&o.lon<=b[2]&&o.lat>=b[1]&&o.lat<=b[3];
}
function onSegment(x,y,a,b) {
  const cross=(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);
  return Math.abs(cross)<=1e-12 &&
    x>=Math.min(a[0],b[0])-EPS && x<=Math.max(a[0],b[0])+EPS &&
    y>=Math.min(a[1],b[1])-EPS && y<=Math.max(a[1],b[1])+EPS;
}
export function pointInRing(o,ring){
  if(!point(o)||!Array.isArray(ring)||ring.length<4)return false;
  const x=o.lon,y=o.lat;
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];
    if(onSegment(x,y,a,b))return true;
    if((a[1]>y)!==(b[1]>y) &&
      x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function normalizeParkArea(osm){
  if(!osm || !["way","relation"].includes(osm.type) || !isParkArea(osm.tags))return null;
  const outer=osm.type==="way"
    ?segmentRings([osm.geometry])
    :segmentRings((osm.members||[])
        .filter(m=>m.type==="way"&&m.role==="outer").map(m=>m.geometry));
  if(!outer.length)return null;
  const inner=osm.type==="relation"
    ?segmentRings((osm.members||[])
        .filter(m=>m.type==="way"&&m.role==="inner").map(m=>m.geometry))
    :[];
  return {
    id:osm.type+"/"+osm.id,
    name:typeof osm.tags.name==="string"?osm.tags.name.slice(0,120):"Parque",
    components:outer.map(ring=>({
      ring,
      bounds:boundsOf(ring),
      holes:inner.filter(h=>pointInRing({lon:h[0][0],lat:h[0][1]},ring))
    })),
  };
}
function insideComponent(o,component){
  return insideBounds(o,component.bounds)&&pointInRing(o,component.ring)&&
    !component.holes.some(h=>pointInRing(o,h));
}
/**
 * Requiere que el local Y la zona infantil pertenezcan al mismo componente
 * del parque, no solo a su caja o a una relación multipolígono discontinua.
 * Almacena un vínculo por establecimiento, con la zona infantil más próxima
 * dentro de un recinto válido. El radio de 60 m se aplica aparte en cliente.
 */
export function computeParkMatches(elements,parkAreas){
  const playgrounds=elements.filter(o=>point(o)&&isPlayground(o));
  const venues=elements.filter(o=>point(o)&&isVenue(o));
  const chosen=new Map();
  for(const area of parkAreas){
    for(const component of area.components){
      const play=playgrounds.filter(o=>insideComponent(o,component));
      if(!play.length)continue;
      const localVenues=venues.filter(o=>insideComponent(o,component));
      for(const venue of localVenues){
        let closest=null,metres=Infinity;
        for(const playground of play){
          const d=distance(venue,playground);
          if(d<metres){closest=playground;metres=d;}
        }
        const previous=chosen.get(venue.id);
        if(!previous || metres<previous.distance){
          chosen.set(venue.id,{
            venueId:venue.id,
            playgroundId:closest.id,
            parkId:area.id,
            parkName:area.name,
            distance:Math.round(metres)
          });
        }
      }
    }
  }
  return [...chosen.values()].sort((a,b)=>a.venueId.localeCompare(b.venueId))
    .map(({distance,...record})=>record);
}
