"""Independent checks of geometry faces and the covariance audit's failure gates."""
import tempfile
import unittest
from pathlib import Path
import numpy as np
from audit_statistics import boundary_planes, check_moments


class StatisticsAuditTests(unittest.TestCase):
    def test_faces_contain_solid_and_distinguish_entry_from_exit(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            vertices = [(1, 2), (-1, 2), (-1, -2), (1, -2)] * 2
            coordinates = ' '.join(f'v{i}x="{x}" v{i}y="{y}"' for i, (x, y) in enumerate(vertices, 1))
            for det in range(224):
                (folder / f'Quartz{det}.gdml').write_text(
                    f'<gdml><solids><arb8 dz="3" {coordinates}/></solids><structure>'
                    f'<volume name="tile{det}"><auxiliary auxtype="DetNo" auxvalue="{det}"/>'
                    '</volume></structure></gdml>')
            output = folder / 'faces.tsv'
            names, _ = boundary_planes(folder, output)
            self.assertEqual(len(names), 224)
            faces = np.loadtxt(output)[:6]
            normals, distances = faces[:, 2:5], faces[:, 5]
            self.assertTrue(np.all(distances > 0))  # origin is inside every face
            self.assertAlmostEqual(np.min(abs(normals @ [0, 0, -3] - distances)), 0)
            self.assertAlmostEqual(np.min(abs(normals @ [0, 0, 3] - distances)), 0)
            self.assertLess(normals[0] @ [0, 0, 1], 0)  # forward entrance
            self.assertGreater(normals[1] @ [0, 0, 1], 0)  # forward exit
            (folder / 'Quartz223.gdml').unlink()
            with self.assertRaisesRegex(ValueError, '224'):
                boundary_planes(folder, output)

    def reference(self, folder, covariance):
        path = Path(folder) / 'reference.tsv'
        lines = ['kind\tleft\tright\tvalue', 'meta\t2\t0\t0', 'sum\t0\t0\t10', 'sum\t1\t0\t20']
        lines += [f'covariance\t{i}\t{j}\t{covariance[i][j]}' for i in range(2) for j in range(i, 2)]
        path.write_text('\n'.join(lines) + '\n')
        return path

    def test_rejects_lost_cross_terms_even_when_variances_agree(self):
        with tempfile.TemporaryDirectory() as folder:
            covariance = np.array([[4., 2.], [2., 9.]])
            path = self.reference(folder, covariance)
            self.assertEqual(check_moments([10, 20], covariance, path)['maximum_scaled_mean_difference'], 0)
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                check_moments([10, 20], np.diag(np.diag(covariance)), path)
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                check_moments([10, 21], covariance, path)

    def test_rejects_indefinite_covariance_in_small_units(self):
        with tempfile.TemporaryDirectory() as folder:
            covariance = np.array([[1., 2.], [2., 1.]]) * 1e-24
            path = self.reference(folder, covariance)
            with self.assertRaisesRegex(ValueError, 'Indefinite'):
                check_moments([10, 20], covariance, path)


if __name__ == '__main__':
    unittest.main()
