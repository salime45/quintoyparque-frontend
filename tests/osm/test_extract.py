import unittest
from extract import extract

class ExtractTests(unittest.TestCase):
    def test_nodes_ways_relations_and_incomplete_geometry(self):
        data = extract("tests/fixtures/national.osm")
        places = {(item["type"], item["id"]): item for item in data["elements"]}
        self.assertIn(("node", 5), places)
        self.assertEqual(places[("node", 6)]["tags"]["name"], "Café de prueba")
        self.assertAlmostEqual(places[("way", 11)]["lon"], -0.375)
        areas = {(item["type"], item["id"]): item for item in data["boundaries"]}
        self.assertEqual(len(areas[("way", 10)]["geometry"]), 5)
        self.assertEqual(areas[("relation", 20)]["members"][0]["role"], "outer")
        self.assertNotIn(("way", 12), areas)
        self.assertNotIn(("relation", 21), areas)
        self.assertEqual(data["incompleteGeometries"], 2)
