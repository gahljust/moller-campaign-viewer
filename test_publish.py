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
    def test_styles_and_scripts_resolve_beneath_pages_subdirectory(self):
        from html.parser import HTMLParser
        from urllib.parse import urljoin, urlsplit
        class Assets(HTMLParser):
            def __init__(self): super().__init__(); self.urls = []
            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == 'script' and 'src' in attrs: self.urls.append(attrs['src'])
                if tag == 'link' and attrs.get('rel') == 'stylesheet': self.urls.append(attrs['href'])
        for source in (publish.HERE / 'assets').glob('*.html'):
            page = '/moller-campaign-viewer/' + ('' if source.name == 'index.html' else 'assets/') + source.name
            parser = Assets(); parser.feed(source.read_text())
            for value in parser.urls:
                target = urlsplit(urljoin('https://example.test' + page, value))
                self.assertTrue(target.path.startswith('/moller-campaign-viewer/'), value)
                rel = target.path.removeprefix('/moller-campaign-viewer/')
                self.assertTrue((publish.HERE / rel).is_file(), rel)

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

    @patch.object(publish, "extension_index", return_value={})
    def test_valid_bundle_roundtrip_and_data_corruption(self, _extensions):
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
            manifest['deconvolution_dataset'] = json.loads((publish.HERE / 'deconvolution_dataset.json').read_text())['dataset']
            (site / 'manifest.json').write_text(json.dumps(manifest))
            extra = site / 'grouped/test.json'
            extra.parent.mkdir()
            extra.write_text('{}')
            entry = {'grouped/test.json': {'bytes': 2, 'sha256': publish.digest(extra)}}
            with patch.object(publish, 'extension_index', return_value=entry):
                publish.verify_site(site)
                extra.write_text('[]')
                with self.assertRaises(ValueError): publish.verify_site(site)
            extra.unlink()
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
