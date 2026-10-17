import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


MAX_BODY_BYTES = 1_048_576
MAX_RESTAURANTS = 500
MAX_NAME_LENGTH = 100
MAX_NOTE_LENGTH = 500
LIST_PATH = re.compile(r"^/api/lists/([0-9a-f-]{36})$", re.IGNORECASE)
RESTAURANT_ID = re.compile(r"^[A-Za-z0-9-]{1,100}$")


class RequestError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def validate_restaurants(value):
    if not isinstance(value, list) or len(value) > MAX_RESTAURANTS:
        raise RequestError(400, f"Restaurant list must contain at most {MAX_RESTAURANTS} entries.")

    cleaned = []
    ids = set()
    names = set()
    for item in value:
        if not isinstance(item, dict):
            raise RequestError(400, "Each restaurant must be an object.")
        restaurant_id = item.get("id")
        name = item.get("name")
        note = item.get("note", "")
        included = item.get("included")
        created_at = item.get("createdAt")
        updated_at = item.get("updatedAt")
        if not isinstance(restaurant_id, str) or not RESTAURANT_ID.fullmatch(restaurant_id):
            raise RequestError(400, "A restaurant has an invalid ID.")
        if restaurant_id in ids:
            raise RequestError(400, "Restaurant IDs must be unique.")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= MAX_NAME_LENGTH:
            raise RequestError(400, f"Restaurant names must contain 1-{MAX_NAME_LENGTH} characters.")
        normalized_name = name.strip().casefold()
        if normalized_name in names:
            raise RequestError(400, "Restaurant names must be unique, ignoring case and surrounding spaces.")
        if not isinstance(note, str) or len(note) > MAX_NOTE_LENGTH:
            raise RequestError(400, f"Restaurant notes must be at most {MAX_NOTE_LENGTH} characters.")
        if not isinstance(included, bool):
            raise RequestError(400, "Restaurant inclusion state must be true or false.")
        for field_name, timestamp in (("createdAt", created_at), ("updatedAt", updated_at)):
            if not isinstance(timestamp, str) or len(timestamp) > 40:
                raise RequestError(400, f"Restaurant {field_name} must be an ISO timestamp.")
            try:
                datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError as error:
                raise RequestError(400, f"Restaurant {field_name} must be an ISO timestamp.") from error

        ids.add(restaurant_id)
        names.add(normalized_name)
        cleaned.append({
            "id": restaurant_id,
            "name": name.strip(),
            "note": note.strip(),
            "included": included,
            "createdAt": created_at,
            "updatedAt": updated_at,
        })
    return cleaned


class Database:
    def __init__(self, path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS family_lists (
                    list_id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL,
                    restaurants TEXT NOT NULL CHECK (json_valid(restaurants)),
                    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        try:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA busy_timeout = 10000")
            yield connection
        finally:
            connection.close()

    @staticmethod
    def token_hash(token):
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def create(self, restaurants):
        list_id = str(uuid.uuid4())
        token = secrets.token_urlsafe(32)
        now = datetime.now().astimezone().isoformat()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO family_lists (list_id, token_hash, restaurants, revision, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?)
                """,
                (list_id, self.token_hash(token), json.dumps(restaurants, ensure_ascii=False), now, now),
            )
        return {"id": list_id, "token": token, "restaurants": restaurants, "revision": 0}

    def get(self, list_id, token):
        with self.connect() as connection:
            row = connection.execute(
                "SELECT token_hash, restaurants, revision FROM family_lists WHERE list_id = ?",
                (list_id,),
            ).fetchone()
        if row is None or not hmac.compare_digest(row["token_hash"], self.token_hash(token)):
            raise RequestError(404, "Family list not found. Check that you have the complete invitation link.")
        return {"restaurants": json.loads(row["restaurants"]), "revision": row["revision"]}

    def update(self, list_id, token, restaurants, expected_revision):
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT token_hash, restaurants, revision FROM family_lists WHERE list_id = ?",
                (list_id,),
            ).fetchone()
            if row is None or not hmac.compare_digest(row["token_hash"], self.token_hash(token)):
                connection.rollback()
                raise RequestError(404, "Family list not found. Check that you have the complete invitation link.")

            if row["revision"] != expected_revision:
                connection.commit()
                return {
                    "saved": False,
                    "latest": {
                        "restaurants": json.loads(row["restaurants"]),
                        "revision": row["revision"],
                    },
                }

            new_revision = row["revision"] + 1
            connection.execute(
                """
                UPDATE family_lists
                SET restaurants = ?, revision = ?, updated_at = ?
                WHERE list_id = ?
                """,
                (json.dumps(restaurants, ensure_ascii=False), new_revision, datetime.now().astimezone().isoformat(), list_id),
            )
            connection.commit()
        return {"saved": True, "revision": new_revision}

    def delete(self, list_id, token):
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM family_lists WHERE list_id = ? AND token_hash = ?",
                (list_id, self.token_hash(token)),
            )
            return cursor.rowcount == 1


class FamilyListHandler(BaseHTTPRequestHandler):
    server_version = "DinnerDecider/1"
    sys_version = ""

    @property
    def database(self):
        return self.server.database

    @property
    def allowed_origins(self):
        return self.server.allowed_origins

    def log_message(self, _format, *_args):
        return

    def send_json(self, status, payload=None, include_cors=True):
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Length", str(len(body)))
        origin = self.headers.get("Origin")
        if include_cors and origin in self.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def authorize_origin(self):
        origin = self.headers.get("Origin")
        if origin and origin not in self.allowed_origins:
            raise RequestError(403, "This site is not allowed to access the family-list service.")

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise RequestError(400, "Invalid request body length.") from error
        if length < 1 or length > MAX_BODY_BYTES:
            raise RequestError(413, "Request body is empty or too large.")
        try:
            value = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise RequestError(400, "Request body must be valid JSON.") from error
        if not isinstance(value, dict):
            raise RequestError(400, "Request body must be a JSON object.")
        return value

    def dispatch(self, callback):
        try:
            self.authorize_origin()
            callback()
        except RequestError as error:
            self.send_json(error.status, {"error": str(error)})
        except sqlite3.Error:
            self.send_json(500, {"error": "The family-list database is unavailable. Please try again."})

    def do_OPTIONS(self):
        try:
            self.authorize_origin()
        except RequestError as error:
            self.send_json(error.status, {"error": str(error)}, include_cors=False)
            return
        origin = self.headers.get("Origin")
        self.send_response(204)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Family-Key")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        def handle():
            path = urlsplit(self.path).path
            if path == "/health":
                self.send_json(200, {"status": "ok"})
                return
            match = LIST_PATH.fullmatch(path)
            if not match:
                raise RequestError(404, "Endpoint not found.")
            token = self.headers.get("X-Family-Key", "")
            self.send_json(200, self.database.get(match.group(1).lower(), token))
        self.dispatch(handle)

    def do_POST(self):
        def handle():
            if urlsplit(self.path).path != "/api/lists":
                raise RequestError(404, "Endpoint not found.")
            self.server.check_create_rate_limit(self.client_address[0])
            body = self.read_json()
            restaurants = validate_restaurants(body.get("restaurants"))
            self.send_json(201, self.database.create(restaurants))
        self.dispatch(handle)

    def do_PUT(self):
        def handle():
            match = LIST_PATH.fullmatch(urlsplit(self.path).path)
            if not match:
                raise RequestError(404, "Endpoint not found.")
            token = self.headers.get("X-Family-Key", "")
            body = self.read_json()
            expected_revision = body.get("expectedRevision")
            if isinstance(expected_revision, bool) or not isinstance(expected_revision, int) or expected_revision < 0:
                raise RequestError(400, "Expected revision must be a non-negative integer.")
            restaurants = validate_restaurants(body.get("restaurants"))
            result = self.database.update(match.group(1).lower(), token, restaurants, expected_revision)
            self.send_json(200 if result["saved"] else 409, result)
        self.dispatch(handle)


class FamilyListServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, database, allowed_origins):
        super().__init__(address, FamilyListHandler)
        self.database = database
        self.allowed_origins = frozenset(allowed_origins)
        self.create_attempts = {}

    def check_create_rate_limit(self, address):
        now = time.monotonic()
        attempts = [timestamp for timestamp in self.create_attempts.get(address, []) if now - timestamp < 3600]
        if len(attempts) >= 10:
            raise RequestError(429, "Too many family lists were created from this connection. Try again later.")
        attempts.append(now)
        self.create_attempts[address] = attempts


def main():
    db_path = os.environ.get("DINNER_DECIDER_DB", "/data/dinner-decider.sqlite3")
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    origins = [origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]
    if not origins:
        raise SystemExit("Set ALLOWED_ORIGINS to the exact HTTPS origin of the GitHub Pages site.")

    server = FamilyListServer((host, port), Database(db_path), origins)
    print(f"Dinner Decider API listening on {host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
