#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HOST = "127.0.0.1"
PORT = 8000
WORKSPACE_DIR = Path(__file__).resolve().parent
UPSTREAM_URL = "https://ai.ecovis.yanipro.ai/apis/chat/database"
SUBSCRIPTION_KEY = os.environ.get("YANI_API_KEY", "")
STATIC_FILES = {
    "/": "auditvare_database_chat_tester.html",
    "/auditvare_database_chat_tester.html": "auditvare_database_chat_tester.html",
    "/auditvare_database_chat_tester.css": "auditvare_database_chat_tester.css",
    "/auditvare_database_chat_tester.js": "auditvare_database_chat_tester.js",
}
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
}


class YaniDemoHandler(BaseHTTPRequestHandler):
    server_version = "YaniDemo/1.0"

    def do_OPTIONS(self) -> None:
        if self.path == "/api/chat/database":
            self.send_response(204)
            self._send_cors_headers()
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            return

        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        relative_path = STATIC_FILES.get(self.path)
        if not relative_path:
            self.send_error(404, "Not found")
            return

        file_path = WORKSPACE_DIR / relative_path
        if not file_path.exists():
            self.send_error(404, "Not found")
            return

        content = file_path.read_bytes()
        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Type", CONTENT_TYPES.get(file_path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self) -> None:
        if self.path != "/api/chat/database":
            self.send_error(404, "Not found")
            return

        if not SUBSCRIPTION_KEY:
            self._send_json_response(
                500,
                {
                    "status": "error",
                    "code": 500,
                    "message": "YANI_API_KEY is not configured on the server",
                    "data": None,
                },
            )
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            json.loads(raw_body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json_response(400, {"status": "error", "code": 400, "message": "Invalid JSON body", "data": None})
            return

        upstream_request = Request(
            UPSTREAM_URL,
            data=raw_body,
            headers={
                "Content-Type": "application/json",
                "Ocp-Apim-Subscription-Key": SUBSCRIPTION_KEY,
            },
            method="POST",
        )

        try:
            with urlopen(upstream_request, timeout=120) as response:
                payload = response.read()
                self.send_response(response.status)
                self._send_cors_headers()
                self.send_header("Content-Type", response.headers.get_content_type() + "; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except HTTPError as error:
            payload = error.read() or json.dumps(
                {"status": "error", "code": error.code, "message": str(error), "data": None}
            ).encode("utf-8")
            self.send_response(error.code)
            self._send_cors_headers()
            self.send_header("Content-Type", error.headers.get_content_type() + "; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except URLError as error:
            self._send_json_response(
                502,
                {
                    "status": "error",
                    "code": 502,
                    "message": f"Upstream request failed: {error.reason}",
                    "data": None,
                },
            )

    def log_message(self, format: str, *args) -> None:
        super().log_message(format, *args)

    def _send_cors_headers(self) -> None:
        origin = self.headers.get("Origin") or "*"
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")

    def _send_json_response(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), YaniDemoHandler)
    print(f"Serving Yani APIs Demo on http://{HOST}:{PORT}/auditvare_database_chat_tester.html")
    server.serve_forever()


if __name__ == "__main__":
    main()
