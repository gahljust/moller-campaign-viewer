#!/usr/bin/env python3
"""Publish a verified static bundle from shared-viewer to GitHub Pages."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile

from build import HERE, BUDGET, PRODUCT_LIMIT, build, defaults

BRANCH = 'shared-viewer'
REPOSITORY = 'gahljust/moller-campaign-viewer'


def command(*args):
    return subprocess.check_output(args, cwd=HERE, text=True).strip()


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def source_commit():
    if command('git', 'branch', '--show-current') != BRANCH:
        raise ValueError('Publish from shared-viewer; main is for local work.')
    if command('git', 'status', '--porcelain'):
        raise ValueError('Commit shared-viewer changes before publishing.')
    return command('git', 'rev-parse', 'HEAD')


def verify_site(site):
    site = Path(site)
    manifest = json.loads((site / 'manifest.json').read_text())
    if manifest.get('schema') != 'moller_shared_viewer_v1':
        raise ValueError('Not a shared viewer build.')
    expected = {'index.html', 'manifest.json', '.nojekyll'}
    expected.update('assets/' + p.name for p in (HERE / 'assets').iterdir() if p.name != 'index.html')
    products = {}
    for item in manifest['products'].values():
        name = item['path']
        if not re.fullmatch(r'data/[a-f0-9]{24}\.json\.gz', name):
            raise ValueError('Invalid product path.')
        if name in products and products[name] != item:
            raise ValueError('Conflicting product records.')
        products[name] = item
    expected.update(products)
    actual = {p.relative_to(site).as_posix() for p in site.rglob('*') if p.is_file()}
    if actual - {'deployment.json'} != expected or any(p.is_symlink() for p in site.rglob('*')):
        raise ValueError('Missing or unexpected public files.')
    total = 0
    for name, item in products.items():
        payload = (site / name).read_bytes()
        if len(payload) != item['bytes'] or len(payload) > PRODUCT_LIMIT:
            raise ValueError('Product size mismatch: ' + name)
        if hashlib.sha256(gzip.decompress(payload)).hexdigest() != item['sha256']:
            raise ValueError('Product hash mismatch: ' + name)
        total += len(payload)
    if total != manifest['compressed_bytes'] or total > BUDGET:
        raise ValueError('Site data budget or total mismatch.')
    for source in (HERE / 'assets').iterdir():
        target = site / ('index.html' if source.name == 'index.html' else 'assets/' + source.name)
        if digest(source) != digest(target):
            raise ValueError('Rebuild the site: asset differs from source: ' + source.name)
    return manifest


def pack(site, output):
    commit = source_commit()
    site, output = Path(site).resolve(), Path(output).resolve()
    if HERE == output or HERE in output.parents or site in output.parents:
        raise ValueError('Keep generated archives outside source and site directories.')
    manifest = verify_site(site)
    receipt = {'schema': 'moller_pages_deployment_v1', 'source_branch': BRANCH,
               'source_commit': commit, 'manifest_sha256': digest(site / 'manifest.json'),
               'cohort': manifest['cohort']}
    with tempfile.TemporaryDirectory() as temp:
        metadata = Path(temp) / 'deployment.json'
        metadata.write_text(json.dumps(receipt, indent=2) + '\n')
        with tarfile.open(output, 'w:gz') as archive:
            for path in sorted(site.rglob('*')):
                if path.is_file() and path.name != 'deployment.json':
                    archive.add(path, arcname=path.relative_to(site), recursive=False)
            archive.add(metadata, arcname='deployment.json')
    checksum = digest(output)
    print('READY: verified website bundle; SHA256 ' + checksum, flush=True)
    return checksum


def unpack(archive_path, output, checksum, commit):
    if digest(archive_path) != checksum:
        raise ValueError('Deployment archive checksum mismatch.')
    output = Path(output)
    if output.exists():
        raise ValueError('Extraction directory must not already exist.')
    with tarfile.open(archive_path, 'r:gz') as archive:
        members = archive.getmembers()
        names = set()
        total = 0
        for member in members:
            path = PurePosixPath(member.name)
            if (not member.isfile() or path.is_absolute() or '..' in path.parts
                    or member.name in names or '\\' in member.name):
                raise ValueError('Unsafe or duplicate archive member.')
            names.add(member.name)
            total += member.size
        if total > BUDGET + 4 * 1024 * 1024:
            raise ValueError('Deployment archive exceeds site budget.')
        output.mkdir(parents=True)
        for member in members:
            destination = output / member.name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(archive.extractfile(member).read())
    receipt = json.loads((output / 'deployment.json').read_text())
    if (receipt.get('schema') != 'moller_pages_deployment_v1'
            or receipt.get('source_branch') != BRANCH
            or receipt.get('source_commit') != commit
            or receipt.get('manifest_sha256') != digest(output / 'manifest.json')):
        raise ValueError('Bundle does not match the publishing source commit.')
    verify_site(output)
    print('READY: source commit, website assets, and all data hashes verified.', flush=True)


def publish(site=None):
    commit = source_commit()
    remote = command('gh', 'api', f'repos/{REPOSITORY}/git/ref/heads/{BRANCH}', '--jq', '.object.sha')
    if remote != commit:
        raise ValueError('Push shared-viewer to GitHub before publishing.')
    if site is None:
        source, site = defaults()
        build(source, site, source.parent / 'showermax_dilution/summary.json')
    tag = datetime.now(timezone.utc).strftime('site-%Y%m%dT%H%M%SZ-') + commit[:8]
    with tempfile.TemporaryDirectory(prefix='moller-pages-') as temp:
        archive = Path(temp) / 'site.tar.gz'
        checksum = pack(site, archive)
        notes = Path(temp) / 'notes.md'
        notes.write_text(f'Frozen shared viewer website.\n\nSource: `{commit}` on `{BRANCH}`.\n\n'
                         f'Archive SHA256: `{checksum}`.\n')
        command('gh', 'release', 'create', tag, str(archive), '--repo', REPOSITORY,
                '--target', commit, '--title', tag, '--notes-file', str(notes))
        command('gh', 'workflow', 'run', 'pages.yml', '--repo', REPOSITORY, '--ref', BRANCH,
                '-f', 'release_tag=' + tag, '-f', 'bundle_sha256=' + checksum)
    print(f'QUEUED: {tag}\nFollow deployment: https://github.com/{REPOSITORY}/actions\n'
          'Website: https://gahljust.github.io/moller-campaign-viewer/', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('pack', help='Verify and package a built site without uploading')
    p.add_argument('--site', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p = sub.add_parser('unpack', help='Verify and extract a deployment bundle in CI')
    p.add_argument('--archive', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--sha256', required=True)
    p.add_argument('--commit', required=True)
    p = sub.add_parser('publish', help='Build, release, and deploy the current shared-viewer commit')
    p.add_argument('--site', type=Path, help='Use a previously built site instead of rebuilding')
    args = parser.parse_args()
    try:
        if args.action == 'pack':
            pack(args.site, args.output)
        elif args.action == 'unpack':
            unpack(args.archive, args.output, args.sha256, args.commit)
        else:
            publish(args.site)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(1, 'NOT PUBLISHED: ' + str(exc) + '\n')
