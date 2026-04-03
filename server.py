import json
import os
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from tools.extract_billing_seed import build_seed_from_workbook
from tools.workbook_sync import sync_state_to_workbook


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "4173"))
HOST = "0.0.0.0"
WORKBOOK = ROOT / "Sai Nivas expendeature.xlsx"
SEED_FILE = ROOT / "billing-seed.json"


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/sync":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length)
                state = json.loads(raw.decode("utf-8"))
                sync_state_to_workbook(state)
                self._send_json(200, {"message": "Excel workbook synced successfully."})
            except Exception as error:
                self._send_json(500, {"error": str(error)})
            return

        if parsed.path == "/api/import" or self.path.startswith("/api/import"):
            try:
                query = parse_qs(parsed.query)
                file_name = query.get("name", ["uploaded.xlsx"])[0]
                if not file_name.lower().endswith(".xlsx"):
                    raise ValueError("Please upload an .xlsx file.")

                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length)
                with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as temp_file:
                    temp_path = Path(temp_file.name)
                    temp_file.write(raw)
                build_seed_from_workbook(temp_path, SEED_FILE)
                WORKBOOK.write_bytes(temp_path.read_bytes())
                temp_path.unlink(missing_ok=True)
                self._send_json(200, {"message": "Excel workbook imported and latest sheet loaded."})
            except Exception as error:
                self._send_json(500, {"error": str(error)})
            return

        self._send_json(404, {"error": "Not found"})


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"Serving on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
