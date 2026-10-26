#!/usr/bin/env python3
"""Replace only deconvolution products in an existing verified website export."""
import argparse,copy,gzip,hashlib,json,os,shutil
from pathlib import Path
HERE=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def update(source,payload,output):
 source,payload,output=(Path(p).resolve() for p in (source,payload,output))
 if output.exists():raise ValueError('Use a new output directory')
 config=json.loads((HERE/'deconvolution_dataset.json').read_text())
 if sha(payload)!=config['payload_sha256']:raise ValueError('Unverified replacement payload')
 data=json.loads(payload.read_text());old=json.loads((source/'manifest.json').read_text())
 if sha(source/'manifest.json')!=data['source_manifest_sha256']:raise ValueError('Unexpected baseline website')
 if data['dataset']!=config['dataset']:raise ValueError('Dataset identity mismatch')
 required={'deconvolution?','deconvolution?response=0','deconvolution?response=2'}
 if set(data['products'])!=required:raise ValueError('Replace both response modes and their default together')
 # Immutable products and video are shared locally; edited metadata/assets are copied.
 output.mkdir();(output/'data').mkdir();shutil.copytree(HERE/'assets',output/'assets')
 shutil.move(output/'assets/index.html',output/'index.html');(output/'.nojekyll').touch()
 def link(a,b):
  try:os.link(a,b)
  except OSError:shutil.copyfile(a,b)
 link(source/'assets/deconvolution.mp4',output/'assets/deconvolution.mp4')
 new=copy.deepcopy(old);new['deconvolution_dataset']=data['dataset']
 for key,product in data['products'].items():
  if product['tiles']['dataset']!=data['dataset'] or product['tiles']['histories']!=data['dataset']['histories']:raise ValueError('Wrong product cohort')
  raw=json.dumps(product,separators=(',',':'),allow_nan=False).encode();digest=hashlib.sha256(raw).hexdigest();body=gzip.compress(raw,mtime=0);name='data/'+digest[:24]+'.json.gz'
  (output/name).write_bytes(body);new['products'][key]=dict(path=name,sha256=digest,bytes=len(body))
 for key,record in old['products'].items():
  if key in required:continue
  assert new['products'][key]==record
  target=output/record['path']
  if not target.exists():link(source/record['path'],target)
 unique={r['path']:r for r in new['products'].values()};new['compressed_bytes']=sum(r['bytes'] for r in unique.values());new['largest_asset_bytes']=max(r['bytes'] for r in unique.values())
 (output/'manifest.json').write_text(json.dumps(new,separators=(',',':')))
 print('READY: replaced three deconvolution routes; every other product unchanged')
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--payload',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();update(a.source,a.payload,a.output)
