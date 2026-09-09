#!/usr/bin/env python3
"""Prepare compact regional PE dilution statistics from immutable ROOT inputs."""
import argparse
import csv
import gzip
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
REGIONS = ('open', 'closed', 'transition')
INELASTIC = ['ep_inelastic_delta', 'ep_inelastic_resonance', 'ep_inelastic_continuum']


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False))
    tmp.replace(path)


def average(batches):
    """Equal average of independent complete design estimators, as in maps."""
    count = len(batches)
    if not count:
        raise ValueError('No accepted batches')
    return [[{key: sum(b[r][c][key] for b in batches) / (count if key == 'estimate' else count**2)
              for key in ('estimate', 'variance', 'covariance_with_total')}
             for c in range(len(batches[0][r]))] for r in range(3)]


def dilution(sources):
    """Propagate numerator/denominator uncertainty without forming a fit matrix."""
    components = list(dict.fromkeys(c for s in sources for c in s['components']))
    rows = []
    for r, region in enumerate(REGIONS):
        moments = {c: {k: 0. for k in ('estimate', 'variance', 'covariance_with_total')} for c in components}
        for source in sources:
            for c, value in zip(source['components'], source['moments'][r]):
                for key in value:
                    moments[c][key] += value[key]
        total = sum(v['estimate'] for v in moments.values())
        variance_total = sum(v['covariance_with_total'] for v in moments.values())
        values = {}
        for c, v in moments.items():
            fraction = v['estimate']/total if total > 0 else None
            error = None
            if fraction is not None:
                terms = [v['variance'], -2*fraction*v['covariance_with_total'], fraction**2*variance_total]
                variance = sum(terms)
                if variance < -1e-10*max(sum(abs(t) for t in terms), 1e-300):
                    raise ValueError('Invalid negative ratio variance: ' + c)
                error = math.sqrt(max(0, variance))/total
            values[c] = {'dilution': fraction, 'dilution_standard_error': error}
        rows.append({'region': region, 'components': values})
    return {'components': components, 'rows': rows, 'unit': 'fraction',
            'weighting': 'Forward ShowerMax PE response',
            'uncertainty': 'One MC standard error; history scores, fixed-quota strata, and independent batches. Shared response-model systematics are not included.'}


def prepare(source, output, runs_root, reroot, response, only_target=None):
    manifest_path = source/'manifest.json'
    manifest = json.loads(manifest_path.read_text())

    def product(key):
        item = manifest['products'][key]
        path = (source/item['path']).resolve()
        if source.resolve() not in path.parents:
            raise ValueError('Export path outside source')
        body = path.read_bytes()
        raw = gzip.decompress(body)
        if len(body) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Export product hash mismatch: ' + key)
        return json.loads(raw)

    catalog = product('catalog?')
    runs = [r for r in catalog['runs'] if r['cohort'] == manifest['cohort']]
    dependencies = [HERE/'scan_showermax.C', Path(__file__),
                    HERE.parent/'showermax_live/analyze_response_batch.C',
                    *sorted((HERE.parent/'acceptance_strata').glob('*.C')),
                    *sorted(response.glob('fit_param_xy_*.csv'))]
    version = hashlib.sha256(''.join(sha(p) for p in dependencies).encode()).hexdigest()
    results = {}
    for run in runs:
        if only_target and run['target'] != only_target:
            continue
        name = run['name']; folder = runs_root/name
        receipt_path = folder/'analysis_receipt.json'
        receipt = json.loads(receipt_path.read_text())
        metadata = json.loads((folder/'campaign.json').read_text())
        if not receipt.get('healthy') or metadata.get('transport_sampler') != 'fixed_quota_neyman_v1':
            raise ValueError(name + ': healthy fixed-quota receipt required')
        if metadata.get('source_commit') != run['source_commit'] or metadata.get('field_transport') != run.get('field_transport'):
            raise ValueError(name + ': producing identity mismatch')
        components = INELASTIC if run['channel'] == 'ep_inelastic' else [run['channel']]
        batches = []; inputs = []
        for batch in receipt['batches']:
            if batch['status'] != 'accepted_fixed_quota':
                raise ValueError(name + ': batch is not accepted fixed-quota data')
            stem = f"batch_{batch['batch']:05d}"
            root = folder/(stem+'.root'); plan = folder/(stem+'.neyman.tsv')
            stat = root.stat()
            identity = {'root': {'name': root.name, 'bytes': stat.st_size, 'mtime_ns': stat.st_mtime_ns},
                        'plan_sha256': sha(plan), 'campaign_sha256': sha(folder/'campaign.json'),
                        'receipt_sha256': sha(receipt_path), 'analyzer_sha256': version,
                        'cohort': run['cohort']}
            cache = output.parent/'batches'/name/(stem+'.json')
            old = json.loads(cache.read_text()) if cache.exists() else {}
            if old.get('source') == identity:
                moments = old['moments']
            else:
                print('Extracting', name, stem, flush=True)
                with tempfile.TemporaryDirectory(prefix='showermax-moments-') as temp:
                    destination = Path(temp)/'moments.tsv'
                    args = [root, plan, response, destination, run['channel']]
                    invocation = str(HERE/'scan_showermax.C')+'('+','.join(json.dumps(str(v)) for v in args)+','+str(batch['events'])+')'
                    process = subprocess.run([str(reroot), '-l', '-b', '-q', invocation], capture_output=True, text=True, cwd=HERE.parents[2])
                    if process.returncode or 'SHOWERMAX_MOMENTS_OK' not in process.stdout:
                        raise RuntimeError((process.stdout+process.stderr)[-4000:])
                    moments = [[None for _ in components] for _ in REGIONS]
                    main_check = {}
                    with destination.open() as stream:
                        for row in csv.DictReader(stream, delimiter='\t'):
                            if row['region'] == '3':
                                main_check[int(row['component'])] = float(row['estimate'])
                                continue
                            moments[int(row['region'])][int(row['component'])] = {k: float(row[k]) for k in ('estimate', 'variance', 'covariance_with_total')}
                    if run['target'] == 'lh2':
                        reference = folder/(stem+'.neyman_metrics.tsv.templates.tsv')
                        expected = [0.]*len(components)
                        with reference.open() as stream:
                            for row in csv.DictReader(stream, delimiter='\t'):
                                if row['kind'] == 'sum':
                                    expected[int(row['left'])//18] += float(row['value'])
                        if any(not math.isclose(main_check[c], value, rel_tol=1e-8, abs_tol=1e-12) for c,value in enumerate(expected)):
                            raise ValueError(name + ': W-component check against main-detector templates failed')
                    if any(v is None or any(not math.isfinite(x) for x in v.values()) for row in moments for v in row):
                        raise ValueError('Missing or nonfinite regional moments')
                write(cache, {'source': identity, 'moments': moments})
            batches.append(moments); inputs.append(identity)
        moments = average(batches)
        map_data = product('maps?plane=circle&run='+name+'&tile=')
        scale = map_data['normalization']['signal_scale']
        # Match every region to the independently prepared diagnostic pass.
        regions = map_data['regions']
        if not regions.get('available'):
            raise ValueError(name + ': independent regional reference unavailable')
        for r, region in enumerate(REGIONS):
            expected = next(v['estimate'] for v in regions['rows'] if v['region'] == region)
            observed = sum(v['estimate'] for v in moments[r])*scale
            if not math.isclose(observed, expected, rel_tol=1e-8, abs_tol=1e-12):
                raise ValueError(name + ': PE closure failed in ' + region)
            for value in moments[r]:
                for key in value:
                    value[key] *= scale if key == 'estimate' else scale**2
        results[name] = {'components': components, 'moments': moments, 'inputs': inputs}
        print('READY', name, len(batches), 'batches; all three region totals verified', flush=True)
    # Scope definitions use the same catalog as the frozen shared export.
    scopes = {}
    for definition in catalog.get('combined', []):
        if definition['cohort'] != manifest['cohort'] or definition['blocked']:
            continue
        if not set(definition['members']) <= results.keys():
            continue
        value = dilution([results[n] for n in definition['members']])
        value['missing'] = definition['missing']
        value['source_runs'] = definition['members']
        scopes[definition['name']] = value
        for name in definition['members']:
            if definition['target'] != 'optics_all':
                scopes[name] = value
    result = {'schema': 'showermax_regional_dilution_v1', 'cohort': manifest['cohort'],
              'source_manifest_sha256': sha(manifest_path), 'runs': results, 'selections': scopes}
    write(output, result)
    print('READY:', len(results), 'campaigns;', len(scopes), 'selections;', output.stat().st_size, 'bytes;', output, flush=True)
    return result


if __name__ == '__main__':
    sys.path.insert(0, str(HERE.parents[1]))
    from tools.workspace_paths import DATA_ROOT, REROOT_EXECUTABLE, SHOWERMAX_RESPONSE_DATA
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', help='Limit extraction while developing; cached batches are reused')
    args = parser.parse_args()
    base = DATA_ROOT/'background_campaign/research'
    prepare(base/'browser', base/'showermax_dilution/summary.json',
            DATA_ROOT/'background_campaign/runs/showermax_live', REROOT_EXECUTABLE,
            SHOWERMAX_RESPONSE_DATA, args.target)
