#!/usr/bin/env python3
"""Check the published LH2 dilution covariance end to end from batch moments."""
import gzip
import hashlib
import json
from pathlib import Path
import numpy as np
from audit_statistics import DATA_ROOT, reference_templates
from prepare_showermax import sha, write


def verify():
    base = DATA_ROOT / 'background_campaign/research'
    source = base / 'browser'
    manifest = json.loads((source / 'manifest.json').read_text())
    audit = json.loads((base / 'statistics_audit/audit.json').read_text())
    if audit['source_manifest_sha256'] != sha(source / 'manifest.json'):
        raise ValueError('Audit and export do not describe the same inputs')
    blocks = {}
    inputs = {}
    for run in audit['runs']:
        if run['target'] != 'lh2':
            continue
        if run['channel'] in blocks or str(run['energy_mev']) != '11000':
            raise ValueError('This closure check requires one 11 GeV LH2 configuration per channel')
        if not run['main_statistics_checks'] or any(
                check['maximum_scaled_mean_difference'] > 1e-9 or
                check['maximum_correlation_scaled_covariance_difference'] > 1e-8
                for check in run['main_statistics_checks']):
            raise ValueError('Unverified ROOT moments')
        folder = DATA_ROOT / 'background_campaign/runs/showermax_live' / run['run']
        moments = []
        for identity in run['inputs']:
            root = folder / identity['root']['name']
            if root.stat().st_size != identity['root']['bytes'] or root.stat().st_mtime_ns != identity['root']['mtime_ns']:
                raise ValueError('ROOT changed after audit')
            if sha(folder / 'analysis_receipt.json') != identity['receipt_sha256']:
                raise ValueError('Receipt changed after audit')
            path = folder / (root.stem + '.neyman_metrics.tsv.templates.tsv')
            moments.append(reference_templates(path))
            inputs[str(path.relative_to(DATA_ROOT))] = sha(path)
        count = len(moments)
        blocks[run['channel']] = (sum(m[0] for m in moments) / count,
                                  sum(m[1] for m in moments) / count**2)
    if set(blocks) != {'moller', 'ep_elastic', 'ep_inelastic'}:
        raise ValueError('Exactly the three LH2 source campaigns are required')
    order = ['moller', 'ep_elastic', 'ep_inelastic']
    y = np.concatenate([blocks[key][0] for key in order])
    covariance = np.zeros((90, 90))
    offset = 0
    for key in order:
        block = blocks[key][1]
        n = len(block)
        covariance[offset:offset+n, offset:offset+n] = block
        offset += n
    # Independent category-major permutation and block ratio Jacobian.
    permutation = np.arange(90).reshape(5, 18).T.ravel()
    y = y[permutation].reshape(18, 5)
    covariance = covariance[np.ix_(permutation, permutation)]
    total = y.sum(axis=1)
    f = y / total[:, None]
    jacobian = np.zeros((90, 90))
    for row in range(18):
        section = slice(5*row, 5*row+5)
        jacobian[section, section] = (np.eye(5) - f[row, :, None]) / total[row]
    propagated = jacobian @ covariance @ jacobian.T
    count = 0
    max_fraction_error = max_covariance_error = 0.
    for key, item in manifest['products'].items():
        if not key.startswith('results?'):
            continue
        raw = gzip.decompress((source / item['path']).read_bytes())
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Export product hash mismatch')
        product = json.loads(raw)
        if product['scope']['target'] != 'lh2':
            continue
        published = product['dilution']
        expected_order = ['moller', 'ep_elastic', 'ep_inelastic_delta', 'ep_inelastic_resonance', 'ep_inelastic_continuum']
        if published['components'] != expected_order:
            raise ValueError('Unexpected published component order')
        expected_categories = [f'ring{ring}_{region}' for ring in range(1, 7) for region in ['closed', 'transition', 'open']]
        if published['categories'] != expected_categories:
            raise ValueError('Unexpected published category order')
        values = np.array([[row['components'][c]['dilution'] for c in expected_order] for row in published['rows']])
        standard_errors = np.array([[row['components'][c]['dilution_standard_error'] for c in expected_order] for row in published['rows']])
        actual = np.asarray(published['dilution_covariance'])
        sd = np.sqrt(np.diag(propagated))
        difference = float(np.max(abs(actual-propagated) / np.outer(sd, sd)))
        np.testing.assert_allclose(actual, propagated, atol=1e-17, rtol=1e-10)
        np.testing.assert_allclose(values, f, atol=1e-14, rtol=1e-12)
        np.testing.assert_allclose(standard_errors.ravel(), sd, atol=1e-14, rtol=1e-12)
        max_covariance_error = max(max_covariance_error, difference)
        max_fraction_error = max(max_fraction_error, float(np.max(abs(values-f))))
        count += 1
    if not count:
        raise ValueError('No LH2 exported results checked')
    result = {'schema': 'lh2_dilution_closure_v1', 'selections': count,
              'source_manifest_sha256': sha(source / 'manifest.json'),
              'crossing_audit_sha256': sha(base / 'statistics_audit/audit.json'),
              'verifier_sha256': sha(Path(__file__)), 'batch_template_sha256': inputs,
              'maximum_fraction_difference': max_fraction_error,
              'maximum_correlation_scaled_covariance_difference': max_covariance_error,
              'rank': int(np.linalg.matrix_rank(propagated)), 'status': 'PASS'}
    write(base / 'statistics_audit/dilution_closure.json', result)
    print(f'PASS: {count} LH2 selections; all 90 dilution values/errors and 8,100 covariance entries match batch propagation; rank {result["rank"]}.')
    return result


if __name__ == '__main__':
    verify()
