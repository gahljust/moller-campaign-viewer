#!/usr/bin/env python3
"""Build the shared site from a verified research export; no ROOT or services."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
from urllib.parse import parse_qs

HERE = Path(__file__).resolve().parent
BUDGET = 64 * 1024 * 1024
PRODUCT_LIMIT = 2 * 1024 * 1024
ROUTES = {'catalog', 'results', 'maps', 'transport-catalog', 'transport', 'geometry'}


def build(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output or source in output.parents or output in source.parents:
        raise ValueError('Source export and shared output must be separate directories.')
    manifest = json.loads((source / 'manifest.json').read_text())
    cohort = manifest['cohort']
    if cohort == 'unverified-history':
        raise ValueError('Shared exports require a verified producing cohort.')

    def load(key):
        item = manifest['products'][key]
        path = (source / item['path']).resolve()
        if source not in path.parents:
            raise ValueError('Product path leaves the source export.')
        body = path.read_bytes()
        if len(body) != item['bytes'] or len(body) > PRODUCT_LIMIT:
            raise ValueError('Product size mismatch: ' + key)
        raw = gzip.decompress(body)
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Product hash mismatch: ' + key)
        return json.loads(raw)

    catalog = load('catalog?')
    runs = [r for r in catalog['runs'] if r['cohort'] == cohort]
    names = {r['name'] for r in runs}
    if not names or len(names) != len(runs):
        raise ValueError('Empty or duplicate campaign catalog.')
    combined = [r for r in catalog.get('combined', []) if r['cohort'] == cohort and not r['blocked']]
    if any(not set(r['members']) <= names for r in combined):
        raise ValueError('Combined view references a different cohort.')
    selected = names | {r['name'] for r in combined}
    catalog = {'runs': runs, 'combined': combined,
               'default': catalog['default'] if catalog['default'] in names else runs[0]['name']}
    transport = load('transport-catalog?')
    transport['runs'] = [r for r in transport['runs'] if r['name'] in names and r['cohort'] == cohort]
    if not transport['runs']:
        raise ValueError('No transport banks match the selected cohort.')
    transport_names = {r['name'] for r in transport['runs']}
    if len(transport_names) != len(transport['runs']):
        raise ValueError('Duplicate transport campaign.')
    totals = {'histories_scanned': 0, 'selected_histories': 0, 'crossing_paths': 0, 'unique_tracks': 0}

    # Prepare in a sibling directory; a failed verification leaves the last
    # successful site untouched. Bulk outputs stay outside the source tree.
    staging = output.with_name(output.name + '.building')
    if staging.exists():
        raise ValueError('An unfinished shared build exists: ' + str(staging))
    staging.mkdir(parents=True)
    result = {'schema': 'moller_shared_viewer_v1', 'cohort': cohort, 'products': {},
              'compressed_bytes': 0, 'largest_asset_bytes': 0,
              'source_manifest_sha256': hashlib.sha256((source / 'manifest.json').read_bytes()).hexdigest()}
    written = set()

    def put(key, value):
        raw = json.dumps(value, separators=(',', ':'), allow_nan=False).encode()
        digest = hashlib.sha256(raw).hexdigest()
        body = gzip.compress(raw, compresslevel=6, mtime=0)
        if len(body) > PRODUCT_LIMIT:
            raise ValueError('Shared product exceeds 2 MiB: ' + key)
        name = digest[:24] + '.json.gz'
        if name not in written:
            written.add(name)
            result['compressed_bytes'] += len(body)
            result['largest_asset_bytes'] = max(result['largest_asset_bytes'], len(body))
            if result['compressed_bytes'] > BUDGET:
                raise ValueError('Shared package exceeds 64 MiB.')
            (staging / 'data' / name).write_bytes(body)
        result['products'][key] = {'path': 'data/' + name, 'sha256': digest, 'bytes': len(body)}

    try:
        (staging / 'data').mkdir()
        shutil.copytree(HERE / 'assets', staging / 'assets')
        shutil.move(staging / 'assets' / 'index.html', staging / 'index.html')
        (staging / '.nojekyll').touch()
        put('catalog?', catalog)
        for key in manifest['products']:
            route, _, query = key.partition('?')
            if route not in ROUTES or route in ('catalog', 'transport-catalog'):
                continue
            args = parse_qs(query)
            if route in ('maps', 'results') and args.get('run', [''])[0] not in selected:
                continue
            if route == 'transport' and args.get('name', [''])[0] not in transport_names:
                continue
            value = load(key)
            if route == 'maps' and not set(value.get('map_sources', [])) <= names:
                raise ValueError('Map recipe references an excluded campaign.')
            if route == 'transport':
                if value['provenance']['source']['cohort'] != cohort:
                    raise ValueError('Transport provenance has a different cohort.')
                sample = value['sample']
                events = {(e['batch'], e['entry']) for e in value['events']}
                tracks = {(e['batch'], e['entry'], t['id']) for e in value['events'] for t in e['tracks']}
                paths = sum(len(e['tracks']) for e in value['events'])
                if paths != sample['crossing_paths'] or len(events) != sample['selected_histories']:
                    raise ValueError('Transport sample counts disagree with the saved bank.')
                totals['histories_scanned'] += sample['histories_scanned']
                totals['selected_histories'] += len(events)
                totals['crossing_paths'] += paths
                totals['unique_tracks'] += len(tracks)
            put(key, value)
        transport['sample_totals'] = totals
        put('transport-catalog?', transport)
        result['animation_sample'] = {'configurations': len(transport_names), **totals}
        (staging / 'manifest.json').write_text(json.dumps(result, separators=(',', ':')))
        # Only replace a previously generated shared site, never an arbitrary directory.
        if output.exists():
            old = output / 'manifest.json'
            if not old.is_file() or json.loads(old.read_text()).get('schema') != result['schema']:
                raise ValueError('Output is not an existing shared viewer build.')
            shutil.rmtree(output)
        staging.replace(output)
    except BaseException:
        shutil.rmtree(staging)
        raise
    print(f"READY: {len(runs)} campaigns + {len(combined)} combined views; {result['compressed_bytes']/1024/1024:.2f} MiB; largest product {result['largest_asset_bytes']/1024:.0f} KiB")
    print(f"Animation: {totals['histories_scanned']:,} simulated events; {totals['crossing_paths']:,} sampled track paths; {len(transport_names)} configurations.")
    print('Site:', output)
    return result


def defaults():
    import sys
    sys.path.insert(0, str(HERE.parents[1]))
    from tools.workspace_paths import DATA_ROOT
    root = DATA_ROOT / 'background_campaign/research'
    return root / 'browser', root / 'shared_viewer'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Prepared research browser export')
    parser.add_argument('--output', type=Path, help='Separate generated shared site directory')
    args = parser.parse_args()
    source, output = (args.source, args.output) if args.source and args.output else defaults()
    build(args.source or source, args.output or output)
