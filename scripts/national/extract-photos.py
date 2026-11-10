"""Una pasada sobre fuentes locales; extrae solo referencias de fotos de locales."""
import json
import sys
import osmium


def extract_photos(path):
    result = {}
    objects = osmium.FileProcessor(path).with_filter(
        osmium.filter.KeyFilter("image", "wikimedia_commons")
    ).with_filter(osmium.filter.TagFilter(
        *[("amenity", value) for value in ("cafe", "bar", "restaurant", "fast_food")]
    ))
    for obj in objects:
        kind = "node" if obj.is_node() else "way" if obj.is_way() else "relation"
        tags = {key: obj.tags[key] for key in ("image", "wikimedia_commons")
                if key in obj.tags and len(obj.tags[key]) <= 2048}
        if tags:
            result[f"{kind}/{obj.id}"] = tags
    return result


if __name__ == "__main__":
    with open(sys.argv[2], "w", encoding="utf-8") as output:
        json.dump(extract_photos(sys.argv[1]), output, ensure_ascii=False)
