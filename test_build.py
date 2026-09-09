"""Portable export checks: cohort isolation, integrity, and real sample counts."""
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from build import build

class SharedBuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / 'research'
        self.source.mkdir()
        self.output = self.root / 'shared'
        self.manifest = {'cohort': 'current:field', 'products': {}}
        self.put('catalog?', {'runs': [{'name': 'a', 'cohort': 'current:field'}, {'name': 'old', 'cohort': 'old:field'}],
                              'combined': [], 'default': 'a'})
        self.put('transport-catalog?', {'runs': [{'name': 'a', 'cohort': 'current:field'}, {'name': 'old', 'cohort': 'old:field'}]})
        self.bank = {'provenance': {'source': {'cohort': 'current:field'}},
                     'sample': {'histories_scanned': 100, 'selected_histories': 1, 'crossing_paths': 2},
                     'events': [{'batch': 0, 'entry': 5, 'tracks': [{'id': 1}, {'id': 1}]}]}
        self.put('transport?name=a', self.bank)
        self.put('transport?name=old', {'excluded': True})
        self.put('results?run=a', {'dilution': None})
        self.put('results?run=old', {'excluded': True})
        self.put('optics?run=a', {'excluded_model': True})
        self.put('maps?plane=circle&run=a&tile=', {'bins': [[0, 0, 5]], 'regions': {'available': False}})
        self.put('geometry?', {'rings': []})

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, key, value):
        raw = json.dumps(value).encode()
        digest = hashlib.sha256(raw).hexdigest()
        body = gzip.compress(raw)
        filename = digest + '.json.gz'
        (self.source / filename).write_bytes(body)
        self.manifest['products'][key] = {'path': filename, 'sha256': digest, 'bytes': len(body)}
        (self.source / 'manifest.json').write_text(json.dumps(self.manifest))

    def test_only_selected_cohort_and_supported_features_are_exported(self):
        result = build(self.source, self.output)
        self.assertNotIn('optics?run=a', result['products'])
        self.assertNotIn('results?run=old', result['products'])
        self.assertNotIn('transport?name=old', result['products'])
        totals = result['animation_sample']
        self.assertEqual(totals['histories_scanned'], 100)
        self.assertEqual(totals['selected_histories'], 1)
        self.assertEqual(totals['crossing_paths'], 2)
        self.assertEqual(totals['unique_tracks'], 1)
        for item in result['products'].values():
            raw = gzip.decompress((self.output / item['path']).read_bytes())
            self.assertEqual(hashlib.sha256(raw).hexdigest(), item['sha256'])
        self.assertTrue((self.output / '.nojekyll').exists())

    def test_corrupted_source_does_not_replace_last_valid_site(self):
        build(self.source, self.output)
        before = (self.output / 'manifest.json').read_bytes()
        item = self.manifest['products']['results?run=a']
        item['sha256'] = '0' * 64
        (self.source / 'manifest.json').write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            build(self.source, self.output)
        self.assertEqual((self.output / 'manifest.json').read_bytes(), before)

    def test_inconsistent_animation_totals_are_rejected(self):
        self.bank['sample']['crossing_paths'] = 3
        self.put('transport?name=a', self.bank)
        with self.assertRaisesRegex(ValueError, 'sample counts'):
            build(self.source, self.output)
        self.assertFalse(self.output.exists())

    def test_showermax_supplement_is_bound_to_export_and_keeps_main_matrix(self):
        main = {'dilution_covariance': [[1.0]]}
        self.put('results?run=a', {'dilution': main})
        extra = {'components': ['moller'], 'rows': [{'region': 'open', 'components': {'moller': {'dilution': 1., 'dilution_standard_error': 0.}}}]}
        path = self.root/'showermax.json'
        value = {'schema': 'showermax_regional_dilution_v1', 'cohort': 'current:field',
                 'source_manifest_sha256': hashlib.sha256((self.source/'manifest.json').read_bytes()).hexdigest(),
                 'selections': {'a': extra}}
        path.write_text(json.dumps(value))
        result = build(self.source, self.output, path)
        payload = json.loads(gzip.decompress((self.output/result['products']['results?run=a']['path']).read_bytes()))
        self.assertEqual(payload['dilution'], main)
        self.assertEqual(payload['showermax_dilution'], extra)
        value['source_manifest_sha256'] = 'stale'
        path.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, 'do not match'):
            build(self.source, self.output, path)

if __name__ == '__main__':
    unittest.main()
