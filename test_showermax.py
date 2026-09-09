import unittest
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from prepare_showermax import average, dilution


class ShowerMaxTests(unittest.TestCase):
    def source(self, components, moments):
        return {'components': components, 'moments': [moments]*3}

    def test_ratio_error_keeps_correlated_inelastic_denominator(self):
        # Cov(a,b)=-2 from mutually exclusive components in the same sample.
        # Independent elastic c: covariance [[4,-2,0],[-2,9,0],[0,0,16]].
        sources = [self.source(['a','b'], [
            {'estimate': 10, 'variance': 4, 'covariance_with_total': 2},
            {'estimate': 20, 'variance': 9, 'covariance_with_total': 7}]),
            self.source(['c'], [{'estimate': 30, 'variance': 16, 'covariance_with_total': 16}])]
        rows = dilution(sources)['rows']
        cov = [[4,-2,0],[-2,9,0],[0,0,16]]
        for row in rows:
            self.assertAlmostEqual(sum(v['dilution'] for v in row['components'].values()), 1)
            for i, (name, value) in enumerate(row['components'].items()):
                gradient = [(int(i==j)-(i+1)/6)/60 for j in range(3)]
                expected = sum(gradient[j]*cov[j][k]*gradient[k] for j in range(3) for k in range(3))
                self.assertAlmostEqual(value['dilution_standard_error']**2, expected)
        self.assertNotIn('covariance', dilution(sources))

    def test_independent_batch_average_and_scale_invariance(self):
        batch = [[{'estimate': 2., 'variance': 9., 'covariance_with_total': 9.}]]*3
        pooled = average([batch, batch])
        self.assertEqual(pooled[0][0]['estimate'], 2)
        self.assertEqual(pooled[0][0]['variance'], 4.5)
        a = self.source(['a'], pooled[0])
        b = self.source(['b'], [{'estimate': 3, 'variance': 4, 'covariance_with_total': 4}])
        before = dilution([a,b])
        # Multiplying PE normalization/current changes no dilution or error.
        for s in [a,b]:
            s['moments'] = [[{k: v*(65 if k=='estimate' else 65**2) for k,v in m.items()} for m in row] for row in s['moments']]
        after = dilution([a,b])
        for x,y in zip(before['rows'],after['rows']):
            for c in x['components']:
                for key in x['components'][c]:
                    self.assertAlmostEqual(x['components'][c][key],y['components'][c][key])

    def test_empty_region_is_unavailable(self):
        value = dilution([self.source(['a'], [{'estimate': 0,'variance': 0,'covariance_with_total': 0}])])
        self.assertIsNone(value['rows'][0]['components']['a']['dilution'])

    def test_root_history_scores_and_split_w_branch(self):
        here = Path(__file__).resolve().parent
        if not (here.parents[1]/'tools/workspace_paths.py').is_file():
            self.skipTest('ROOT integration check requires the remoll workspace')
        sys.path.insert(0, str(here.parents[1]))
        from tools.workspace_paths import REROOT_EXECUTABLE, SHOWERMAX_RESPONSE_DATA
        with tempfile.TemporaryDirectory(prefix='showermax-fixture-') as temp:
            invocation = str(here/'test_showermax_scan.C')+'('+json.dumps(temp)+','+json.dumps(str(SHOWERMAX_RESPONSE_DATA))+')'
            p = subprocess.run([str(REROOT_EXECUTABLE),'-l','-b','-q',invocation], capture_output=True, text=True)
            self.assertEqual(p.returncode, 0, (p.stdout+p.stderr)[-3000:])
            self.assertIn('SHOWERMAX_FIXTURE_OK', p.stdout)


if __name__ == '__main__':
    unittest.main()
