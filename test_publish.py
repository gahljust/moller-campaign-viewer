"""Deployment guards: damaged data and unsafe archives cannot reach Pages."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import publish


class PublishGuards(unittest.TestCase):
    def test_local_branch_and_dirty_source_are_rejected(self):
        for replies in (['main'], ['shared-viewer', ' M assets/app.js']):
            with patch.object(publish, 'command', side_effect=replies):
                with self.assertRaises(ValueError):
                    publish.source_commit()

    def test_checksum_path_traversal_and_links_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = root / 'bundle.tar.gz'
            for name, link in (('../escape', False), ('link', True)):
                with tarfile.open(archive, 'w:gz') as bundle:
                    item = tarfile.TarInfo(name)
                    if link:
                        item.type = tarfile.SYMTYPE
                        item.linkname = '/tmp/escape'
                    bundle.addfile(item, io.BytesIO())
                for checksum in ('wrong', publish.digest(archive)):
                    with self.assertRaises(ValueError):
                        publish.unpack(archive, root / 'site', checksum, 'a' * 40)
                self.assertFalse((root / 'site').exists())

    def test_valid_bundle_roundtrip_and_data_corruption(self):
        import gzip
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            site = root / 'site'
            (site / 'assets').mkdir(parents=True)
            (site / 'data').mkdir()
            for source in (publish.HERE / 'assets').iterdir():
                target = site / ('index.html' if source.name == 'index.html' else 'assets/' + source.name)
                target.write_bytes(source.read_bytes())
            (site / '.nojekyll').touch()
            raw = b'{"example":1}'
            sha = hashlib.sha256(raw).hexdigest()
            name = 'data/' + sha[:24] + '.json.gz'
            payload = gzip.compress(raw)
            (site / name).write_bytes(payload)
            manifest = {'schema': 'moller_shared_viewer_v1', 'cohort': 'test',
                        'compressed_bytes': len(payload), 'products': {
                            'catalog?': {'path': name, 'sha256': sha, 'bytes': len(payload)}}}
            (site / 'manifest.json').write_text(json.dumps(manifest))
            commit = 'a' * 40
            archive = root / 'site.tar.gz'
            with patch.object(publish, 'source_commit', return_value=commit):
                checksum = publish.pack(site, archive)
            publish.unpack(archive, root / 'unpacked', checksum, commit)
            with self.assertRaises(ValueError):
                publish.unpack(archive, root / 'wrong-source', checksum, 'b' * 40)
            (site / name).write_bytes(payload[:-1])
            with self.assertRaises(ValueError):
                publish.verify_site(site)


if __name__ == '__main__':
    unittest.main()
