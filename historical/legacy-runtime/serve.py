"""Optional localhost-only server for the static prototype. No dependencies."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8000)
args = parser.parse_args()
if not 1 <= args.port <= 65535:
    parser.error('Port must be between 1 and 65535.')
handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).parent))
try:
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
except OSError as exc:
    parser.error(f'Cannot bind the local server: {exc}. Try another --port.')
print(f'Open http://127.0.0.1:{args.port}/index.html')
print('Local visualization only. Press Ctrl+C to stop.')
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
