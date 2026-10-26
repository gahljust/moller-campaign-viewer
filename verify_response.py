#!/usr/bin/env python3
"""Check portable rate/PE routes, recipes and signal closure before deployment."""
import argparse, gzip, json, math
from pathlib import Path
from urllib.parse import urlencode
from publish import verify_site

def verify(site):
    site=Path(site);manifest=verify_site(site);info=manifest['main_detector_response'];cache={}
    def load(route,**args):
        key=route+'?'+urlencode(sorted(args.items()))
        if key not in cache:
            item=manifest['products'][key]
            cache[key]=json.loads(gzip.decompress((site/item['path']).read_bytes()))
        return cache[key]
    def close(a,b,tol=1e-9):
        if not math.isclose(a,b,rel_tol=tol,abs_tol=1e-6):raise ValueError(f'Signal closure failed: {a} != {b}')
    def source_weight(name,plane,mode):
        args={'run':name,'plane':plane}
        if mode=='2':args['response']=mode
        value=load('secondary-sources',**args)
        if 'source_runs' in value:return sum(source_weight(n,plane,mode) for n in value['source_runs'])
        if 'source_planes' in value:return sum(source_weight(name,p,mode) for p in value['source_planes'])
        expected='PE/s' if mode=='2' else 'crossings/s'
        if value['unit']!=expected:raise ValueError('Mixed source response units')
        total=0
        for source in value['sources'].values():
            w=sum(sum(row) for row in source['weights']);total+=w
            # Only display pixels are rounded; exact weights remain authoritative.
            energy=sum(source['energy_pixels'][1::2]) if 'energy_pixels' in source else sum(row[3] for row in source['energy'])
            close(energy,w,2e-5)
        return total
    checks=0
    for mode in ('0','2'):
        fit=load('deconvolution',response=mode)['tiles']
        dataset=manifest.get('deconvolution_dataset')
        expected_histories=dataset['histories'] if dataset else info['histories']
        if fit['response_mode']!=mode or fit['histories']!=expected_histories:raise ValueError('Fit response identity mismatch')
        if dataset and fit.get('dataset')!=dataset:raise ValueError('Fit dataset identity mismatch')
        if [v['id'] for v in fit['response_options']]!=['0','2']:raise ValueError('Unexpected response choices')
        for name in info['runs']:
            for plane in ['main_detector',*[f'ring{i}' for i in range(1,7)]]:
                args={'run':name,'plane':plane,'tile':''}
                if mode=='2':args['response']=mode
                d=load('maps',**args);h=d['histograms']['data']
                if d['unit']!=('PE/s' if mode=='2' else 'crossings/s'):raise ValueError('Mixed map response units')
                scale=d.get('normalization',{}).get('signal_scale',1)
                close(source_weight(name,plane,mode),h['secondary_weight']*scale)
                estimate=(d.get('signal_summary') or d['interaction_summary'])['estimate']
                close(h['weight']*scale,estimate)
                close(sum(h['secondary_energy']),h['secondary_weight'])
                close(sum(h['energy']),h['weight'])
                if 'bins' in d:close(sum(row[2] for row in d['bins']),estimate)
                else:
                    close(sum(sum(row[2] for row in load('maps',run=n,plane=plane,tile='')['bins']) for n in d['map_sources']),estimate)
                checks+=1
    rate=load('deconvolution',response='0')['tiles'];pe=load('deconvolution',response='2')['tiles']
    if rate['forecast']['category_asymmetry_covariance_ppb2']==pe['forecast']['category_asymmetry_covariance_ppb2']:raise ValueError('Correlation input did not change with PE response')
    print(f'PASS: {checks} rate/PE map and secondary selections; both fits and correlation inputs; all bundle hashes.')
    return checks

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('site',type=Path)
    verify(parser.parse_args().site)
