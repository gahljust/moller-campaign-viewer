#!/usr/bin/env python3
"""Check published 3D surface sums and physical tile tables against accepted maps."""
import gzip,json,math,sys
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode
from publish import verify_site

def verify(site):
    site=Path(site);manifest=verify_site(site)
    @lru_cache(maxsize=128)
    def load(route,name,plane,response=''):
        args={'run':name,'plane':plane}
        if route=='maps':args['tile']=''
        if response:args['response']=response
        item=manifest['products'][route+'?'+urlencode(sorted(args.items()))]
        return json.loads(gzip.decompress((site/item['path']).read_bytes()))
    def surface_sum(name,plane,mode):
        d=load('surface-maps',name,plane)
        if 'source_runs' in d:return sum(surface_sum(n,plane,mode) for n in d['source_runs'])
        if 'source_planes' in d:return sum(surface_sum(name,p,mode) for p in d['source_planes'])
        return sum(c[7 if mode=='2' else 6] for c in d['cells'])
    def close(a,b,tol=1e-8):
        if not math.isclose(a,b,rel_tol=tol,abs_tol=1e-6):raise ValueError(f'Signal mismatch: {a} != {b}')
    checks=0
    for name in manifest['main_detector_response']['runs']:
        for mode in ('0','2'):
            for plane in ['main_detector',*[f'ring{i}' for i in range(1,7)],'circle']:
                d=load('maps',name,plane,'2' if mode=='2' and plane!='circle' else '')
                total=(d.get('signal_summary') or d['interaction_summary'])['estimate']
                close(surface_sum(name,plane,mode),total,5e-6)
                assert d['regions']['grouping']=='physical_tiles'
                close(sum(r['estimate'] for r in d['regions']['rows']),total)
                if plane=='ring5':
                    close(sum(p['estimate'] for p in d['regions']['open_placements']),next(r['estimate'] for r in d['regions']['rows'] if r['region']=='open'))
                checks+=1
    print(f'PASS: {checks} 3D rate/PE totals and physical region tables, including Ring 5 Open placements.')

if __name__=='__main__':verify(sys.argv[1])
