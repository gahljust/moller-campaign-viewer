#!/usr/bin/env python3
"""Preview the built shared site locally. Stop with Ctrl+C in this terminal."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from build import defaults

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8781)
    parser.add_argument('--directory', type=Path)
    args = parser.parse_args()
    directory = args.directory or defaults()[1]
    if not (directory / 'manifest.json').is_file():
        parser.error('Build the shared viewer first with build.py.')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(SimpleHTTPRequestHandler, directory=str(directory)))
    print(f'Shared viewer: http://127.0.0.1:{args.port}/', flush=True)
    print('Stop: press Ctrl+C in this terminal. This serves saved files only.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShared preview stopped.', flush=True)
    finally:
        server.server_close()
