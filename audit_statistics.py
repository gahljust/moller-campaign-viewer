#!/usr/bin/env python3
"""Independently audit saved detector moments and physical entry semantics."""
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
import xml.etree.ElementTree as ET
import numpy as np
from prepare_showermax import sha, write, HERE

sys.path.insert(0, str(HERE.parents[1]))
from tools.workspace_paths import DATA_ROOT, REROOT_EXECUTABLE, SHOWERMAX_RESPONSE_DATA
from background_campaign.showermax_live.volume_categories import category


def boundary_planes(geometry, output):
    """Convex planar arb8 faces, using recorded detector-local coordinates."""
    files = sorted(geometry.glob('*Quartz*.gdml'))
    records = []; names = {}
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    for path in files:
        root = ET.parse(path).getroot(); volume = root.find('./structure/volume')
        det = int(next(v.attrib['auxvalue'] for v in volume.findall('auxiliary') if v.attrib['auxtype']=='DetNo'))
        solid = root.find('./solids/arb8')
        if solid is None:
            raise ValueError('Unsupported quartz solid: '+path.name)
        p = solid.attrib; dz = float(p['dz'])
        vertices = np.array([[float(p[f'v{i}x']),float(p[f'v{i}y']),-dz if i<=4 else dz] for i in range(1,9)])
        center = vertices.mean(axis=0)
        for i, indices in enumerate(faces):
            v = vertices[list(indices)]; normal = np.cross(v[1]-v[0],v[2]-v[0]);normal /= np.linalg.norm(normal)
            if normal@(center-v[0])>0:normal = -normal
            distance = normal@v[0]
            if max(abs(v@normal-distance))>1e-8:
                raise ValueError('Nonplanar face: '+path.name)
            records.append([det,i,*normal,distance])
        if det in names:raise ValueError('Duplicate detector ID')
        names[det] = volume.attrib['name']
    if len(names)!=224:raise ValueError('Expected 224 separately instrumented quartz tiles')
    output.write_text('\n'.join(' '.join(map(str,r)) for r in records)+'\n')
    return names, {p.name:sha(p) for p in files}


def reference_templates(path):
    rows = list(csv.DictReader(path.open(), delimiter='\t'))
    meta = next(r for r in rows if r['kind']=='meta');n=int(meta['left'])
    mean=np.zeros(n);cov=np.zeros((n,n))
    for row in rows:
        if row['kind']=='sum':mean[int(row['left'])]=float(row['value'])
        if row['kind']=='covariance':
            i,j=int(row['left']),int(row['right']);cov[i,j]=cov[j,i]=float(row['value'])
    return mean,cov


def check_moments(mean,covariance,path):
    expected,reference=reference_templates(path);mean=np.asarray(mean);covariance=np.asarray(covariance)
    scale=max(float(np.max(np.abs(expected))),1e-300)
    mean_error=float(np.max(np.abs(mean-expected)))/scale
    # Normalize by coordinate standard deviations, not a unit-dependent floor.
    sd=np.sqrt(np.maximum(np.diag(reference),0));den=np.outer(sd,sd)
    residual=np.abs(covariance-reference)
    if np.any(residual[den==0]>1e-12*max(float(np.max(np.abs(reference))),1e-300)):
        raise ValueError('Nonzero variance where reference has zero variance')
    covariance_error=float(np.max(np.divide(residual,den,out=np.zeros_like(residual),where=den>0)))
    if mean_error>1e-9 or covariance_error>1e-8:
        raise ValueError(f'Main detector moment mismatch: {mean_error}, {covariance_error}')
    correlation=np.divide(reference,den,out=np.zeros_like(reference),where=den>0)
    minimum=float(np.linalg.eigvalsh(correlation).min())
    if minimum<-1e-8:raise ValueError('Indefinite history covariance')
    return {'maximum_scaled_mean_difference':mean_error,'maximum_correlation_scaled_covariance_difference':covariance_error,
            'minimum_correlation_eigenvalue':minimum,'dimensions':len(mean)}


def audit(target=None):
    base=DATA_ROOT/'background_campaign/research';source=base/'browser';out=base/'statistics_audit'
    manifest=json.loads((source/'manifest.json').read_text())
    item=manifest['products']['catalog?'];raw=gzip.decompress((source/item['path']).read_bytes())
    if hashlib.sha256(raw).hexdigest()!=item['sha256']:raise ValueError('Catalog hash mismatch')
    catalog=json.loads(raw);runs=[r for r in catalog['runs'] if r['cohort']==manifest['cohort'] and (not target or r['target']==target)]
    repo=HERE.parents[2];geometry=repo/'geometry/detector/ThinQuartz/DetectorArray'
    if subprocess.check_output(['git','diff','HEAD','--name-only','--','geometry','src/remollGenericDetector.cc'],cwd=repo,text=True).strip():
        raise ValueError('Geometry/detector implementation differs from producing commit')
    if any(r['source_commit']!=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip() for r in runs):
        raise ValueError('Geometry checkout does not match producing cohort')
    dependencies=[Path(__file__),HERE/'audit_crossings.C',HERE.parent/'showermax_live/analyze_response_batch.C',*sorted((HERE.parent/'acceptance_strata').glob('*.C')), *sorted(SHOWERMAX_RESPONSE_DATA.glob('fit_param_xy_*.csv'))]
    fingerprint=hashlib.sha256(''.join(sha(p) for p in dependencies).encode()).hexdigest()
    products=[]
    with tempfile.TemporaryDirectory(prefix='detector-audit-') as temp:
        temp=Path(temp);plane_path=temp/'faces.tsv';names,geometry_hashes=boundary_planes(geometry,plane_path)
        for run in runs:
            folder=DATA_ROOT/'background_campaign/runs/showermax_live'/run['name'];receipt_path=folder/'analysis_receipt.json'
            receipt=json.loads(receipt_path.read_text())
            if not receipt['healthy']:raise ValueError(run['name']+': unhealthy input')
            batches=[];checks=[]
            for batch in receipt['batches']:
                if batch['status']!='accepted_fixed_quota':raise ValueError('Non-fixed-quota input')
                stem=f"batch_{batch['batch']:05d}";root=folder/(stem+'.root');plan=folder/(stem+'.neyman.tsv');macro=folder/(stem+'.mac')
                commands=macro.read_text()
                for det in [*names,*range(73001,73029)]:
                    if f'/remoll/SD/detect surfacehits {det}\n' not in commands:
                        raise ValueError(f'{run["name"]}: detector {det} entry-only recording not established')
                identity={'root':{'name':root.name,'bytes':root.stat().st_size,'mtime_ns':root.stat().st_mtime_ns},
                          'receipt_sha256':sha(receipt_path),'plan_sha256':sha(plan),'macro_sha256':sha(macro),
                          'geometry_sha256':sha(plane_path),'analyzer_sha256':fingerprint,'source_commit':run['source_commit']}
                cached=out/'batches'/run['name']/(stem+'.json')
                value=json.loads(cached.read_text()) if cached.exists() else {}
                if value.get('source')!=identity:
                    print('AUDITING',run['name'],stem,flush=True)
                    result=temp/'audit.tsv';args=[root,plan,plane_path,result,run['channel'],SHOWERMAX_RESPONSE_DATA]
                    invocation=str(HERE/'audit_crossings.C')+'('+','.join(json.dumps(str(v)) for v in args)+','+str(batch['events'])+')'
                    process=subprocess.run([str(REROOT_EXECUTABLE),'-l','-b','-q',invocation],capture_output=True,text=True,cwd=repo)
                    if process.returncode or 'CROSSING_AUDIT_OK' not in process.stdout:raise RuntimeError((process.stdout+process.stderr)[-4000:])
                    n=54 if run['channel']=='ep_inelastic' else 18;mean=np.zeros(n);cov=np.zeros((n,n));metrics={};volumes={}
                    for row in csv.DictReader(result.open(),delimiter='\t'):
                        if row['kind']=='mean':mean[int(row['left'])]=float(row['value'])
                        elif row['kind']=='covariance':cov[int(row['left']),int(row['right'])]=float(row['value'])
                        elif row['kind']=='metric':metrics[row['key']]={k:float(row[k]) for k in ('value','variance','maximum','count')}
                        elif row['kind']=='volume':
                            group=category(row['key']);volumes[group]=volumes.get(group,0)+float(row['value'])
                    check=check_moments(mean,cov,folder/(stem+'.neyman_metrics.tsv.templates.tsv')) if run['target']=='lh2' else None
                    value={'source':identity,'metrics':metrics,'backward_creation_groups':volumes,'statistics_check':check}
                    write(cached,value)
                batches.append(value)
                if value['statistics_check']:checks.append(value['statistics_check'])
            count=len(batches);metrics={}
            for key in batches[0]['metrics']:
                metrics[key]={'estimate':sum(b['metrics'][key]['value'] for b in batches)/count,
                              'standard_error':math.sqrt(max(0,sum(b['metrics'][key]['variance'] for b in batches)))/count,
                              'recorded_entries':int(sum(b['metrics'][key]['count'] for b in batches)),
                              'largest_history_contribution':max(b['metrics'][key]['maximum'] for b in batches)/count}
            volumes={}
            for b in batches:
                for key,value in b['backward_creation_groups'].items():volumes[key]=volumes.get(key,0)+value/count
            products.append({'run':run['name'],'target':run['target'],'channel':run['channel'],'energy_mev':run['energy_mev'],
                             'events':sum(b['events'] for b in receipt['batches']),'metrics':metrics,'backward_creation_groups':volumes,
                             'main_statistics_checks':checks,'inputs':[b['source'] for b in batches]})
            print('VERIFIED',run['name'],count,'batches',flush=True)
    result={'schema':'detector_statistics_audit_v1','source_manifest_sha256':sha(source/'manifest.json'),
            'detector_implementation_sha256':sha(repo/'src/remollGenericDetector.cc'),'quartz_geometry':geometry_hashes,
            'runs':products,'scope':'Recorded physical entries and existing fixed-quota estimator; not a PE-response calibration or finite-sample coverage certificate.'}
    write(out/'audit.json',result)
    print('READY:',len(products),'campaigns;',sum(len(r['inputs']) for r in products),'batches;',out/'audit.json',flush=True)
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--target');args=parser.parse_args();audit(args.target)
