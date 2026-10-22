"""Tres pasadas: etiquetas, vías de relaciones y coordenadas necesarias.
No indexa en memoria todos los nodos del país ni consulta Firebase.
"""
import argparse
import json
import os
import osmium

TAGS = [("leisure", value) for value in ("playground", "park", "garden")] + [
    ("amenity", value) for value in ("cafe", "bar", "restaurant", "fast_food")]
KEYS = ("name", "leisure", "amenity", "outdoor_seating", "wheelchair", "addr:street", "addr:housenumber")


def extract(path):
    points, ways, relations = {}, {}, {}
    for obj in osmium.FileProcessor(path).with_filter(osmium.filter.TagFilter(*TAGS)):
        tags = {key: obj.tags[key][:220] for key in KEYS if key in obj.tags}
        if obj.is_node():
            if obj.location.valid():
                points[obj.id] = {"type": "node", "id": obj.id, "lat": obj.location.lat, "lon": obj.location.lon, "tags": tags}
        elif obj.is_way():
            ways[obj.id] = {"refs": [node.ref for node in obj.nodes], "tags": tags}
        elif obj.is_relation():
            relations[obj.id] = {"members": [{"type": member.type, "ref": member.ref, "role": member.role} for member in obj.members], "tags": tags}
    needed_ways = {member["ref"] for rel in relations.values() for member in rel["members"] if member["type"] == "w"} - ways.keys()
    if needed_ways:
        for obj in osmium.FileProcessor(path, osmium.osm.WAY).with_filter(osmium.filter.IdFilter(needed_ways)):
            ways[obj.id] = {"refs": [node.ref for node in obj.nodes], "tags": {}}
    needed_nodes = {ref for way in ways.values() for ref in way["refs"]}
    needed_nodes.update(member["ref"] for rel in relations.values() for member in rel["members"] if member["type"] == "n")
    coordinates = {}
    for obj in osmium.FileProcessor(path, osmium.osm.NODE).with_filter(osmium.filter.IdFilter(needed_nodes)):
        if obj.location.valid():
            coordinates[obj.id] = {"lat": obj.location.lat, "lon": obj.location.lon}

    def geometry(way):
        # No cerrar ni completar geometrías con referencias ausentes.
        if not way["refs"] or any(ref not in coordinates for ref in way["refs"]):
            return None
        return [coordinates[ref] for ref in way["refs"]]

    def center(vertices):
        return {"lat": (min(v["lat"] for v in vertices) + max(v["lat"] for v in vertices)) / 2,
                "lon": (min(v["lon"] for v in vertices) + max(v["lon"] for v in vertices)) / 2}

    elements, boundaries, incomplete = [], [], 0
    def is_place(tags):
        return tags.get("leisure") == "playground" or tags.get("amenity") in ("cafe", "bar", "restaurant", "fast_food")
    for point in points.values():
        if is_place(point["tags"]):
            elements.append(point)
    for ident, way in ways.items():
        tags = way["tags"]
        if not tags:
            continue
        vertices = geometry(way)
        if vertices is None:
            incomplete += 1
            continue
        if is_place(tags):
            elements.append({"type": "way", "id": ident, "tags": tags, **center(vertices)})
        if tags.get("leisure") in ("park", "garden"):
            boundaries.append({"type": "way", "id": ident, "tags": tags, "geometry": vertices})
    for ident, rel in relations.items():
        members, vertices, missing = [], [], False
        for member in rel["members"]:
            if member["type"] == "w":
                geom = geometry(ways[member["ref"]]) if member["ref"] in ways else None
                if geom is None:
                    missing = True
                    break
                members.append({"type": "way", "role": member["role"], "geometry": geom})
                vertices.extend(geom)
            elif member["type"] == "n":
                if member["ref"] not in coordinates:
                    missing = True
                    break
                vertices.append(coordinates[member["ref"]])
            else:
                # No inventar geometría de relaciones anidadas.
                missing = True
                break
        if missing or not vertices:
            incomplete += 1
            continue
        if is_place(rel["tags"]):
            elements.append({"type": "relation", "id": ident, "tags": rel["tags"], **center(vertices)})
        if rel["tags"].get("leisure") in ("park", "garden"):
            boundaries.append({"type": "relation", "id": ident, "tags": rel["tags"], "members": members})
    reader = osmium.io.Reader(path)
    timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    return {"dataTimestamp": timestamp, "elements": elements, "boundaries": boundaries, "incompleteGeometries": incomplete}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    args = parser.parse_args()
    result = extract(args.input)
    with open(args.output + ".part", "w", encoding="utf8") as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(",", ":"))
    os.replace(args.output + ".part", args.output)
    print(json.dumps({"file": args.input, "places": len(result["elements"]), "boundaries": len(result["boundaries"]), "incomplete": result["incompleteGeometries"]}), flush=True)
