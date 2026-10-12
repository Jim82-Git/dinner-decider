import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from server import Database, FamilyListServer


def sample_restaurant(name="Noodle House", restaurant_id="restaurant-1"):
    timestamp = "2026-10-12T05:00:00+00:00"
    return {
        "id": restaurant_id,
        "name": name,
        "note": "Dumplings",
        "included": True,
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


class FamilyListApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        database = Database(Path(self.temp_dir.name) / "test.sqlite3")
        self.server = FamilyListServer(("127.0.0.1", 0), database, ["https://family.example"])
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp_dir.cleanup()

    def request(self, method, path, body=None, token=None, origin="https://family.example"):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        headers = {"Origin": origin}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if token:
            headers["X-Family-Key"] = token
        encoded_body = None if body is None else json.dumps(body)
        connection.request(method, path, body=encoded_body, headers=headers)
        response = connection.getresponse()
        payload = response.read()
        result = json.loads(payload) if payload else None
        status = response.status
        connection.close()
        return status, result

    def create_list(self, restaurants=None):
        status, created = self.request("POST", "/api/lists", {"restaurants": restaurants or []})
        self.assertEqual(status, 201)
        self.assertEqual(created["revision"], 0)
        return created

    def test_shared_list_is_saved_and_persists_between_database_connections(self):
        restaurant = sample_restaurant()
        created = self.create_list([restaurant])

        status, data = self.request(
            "GET",
            f"/api/lists/{created['id']}",
            token=created["token"],
        )
        self.assertEqual(status, 200)
        self.assertEqual(data, {"restaurants": [restaurant], "revision": 0})

        updated = {**restaurant, "included": False}
        status, result = self.request(
            "PUT",
            f"/api/lists/{created['id']}",
            {"restaurants": [updated], "expectedRevision": 0},
            token=created["token"],
        )
        self.assertEqual(status, 200)
        self.assertEqual(result, {"saved": True, "revision": 1})

        status, data = self.request(
            "GET",
            f"/api/lists/{created['id']}",
            token=created["token"],
        )
        self.assertEqual(status, 200)
        self.assertEqual(data, {"restaurants": [updated], "revision": 1})

    def test_stale_edit_returns_current_family_list(self):
        created = self.create_list([sample_restaurant()])
        self.request(
            "PUT",
            f"/api/lists/{created['id']}",
            {"restaurants": [], "expectedRevision": 0},
            token=created["token"],
        )

        status, result = self.request(
            "PUT",
            f"/api/lists/{created['id']}",
            {"restaurants": [sample_restaurant()], "expectedRevision": 0},
            token=created["token"],
        )
        self.assertEqual(status, 409)
        self.assertEqual(result, {"saved": False, "latest": {"restaurants": [], "revision": 1}})

    def test_invalid_invitation_key_cannot_read_or_change_list(self):
        created = self.create_list()
        status, _ = self.request("GET", f"/api/lists/{created['id']}", token="wrong-key")
        self.assertEqual(status, 404)

        status, _ = self.request(
            "PUT",
            f"/api/lists/{created['id']}",
            {"restaurants": [], "expectedRevision": 0},
            token="wrong-key",
        )
        self.assertEqual(status, 404)

    def test_duplicate_restaurants_are_rejected(self):
        created = self.create_list()
        restaurants = [
            sample_restaurant("Noodle House", "restaurant-1"),
            sample_restaurant(" noodle house ", "restaurant-2"),
        ]
        status, error = self.request(
            "PUT",
            f"/api/lists/{created['id']}",
            {"restaurants": restaurants, "expectedRevision": 0},
            token=created["token"],
        )
        self.assertEqual(status, 400)
        self.assertIn("unique", error["error"])

    def test_unapproved_browser_origin_is_rejected(self):
        status, error = self.request("GET", "/health", origin="https://other.example")
        self.assertEqual(status, 403)
        self.assertIn("not allowed", error["error"])


if __name__ == "__main__":
    unittest.main()
