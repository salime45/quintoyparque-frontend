import importlib.util
import unittest

spec = importlib.util.spec_from_file_location("photos", "scripts/national/extract-photos.py")
photos = importlib.util.module_from_spec(spec)
spec.loader.exec_module(photos)


class PhotoTests(unittest.TestCase):
    def test_extracts_only_venue_photo_references(self):
        data = photos.extract_photos("tests/fixtures/national.osm")
        self.assertEqual(data, {"node/6": {
            "image": "https://example.org/local.jpg",
            "wikimedia_commons": "File:Café de prueba.jpg",
        }})
