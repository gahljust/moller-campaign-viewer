#!/usr/bin/env python3
"""Check portable PE histograms and their exact moments without ROOT."""
import gzip,json,math,sys
from pathlib import Path
from publish import verify_site

def verify(site):
    site=Path(site);manifest=verify_site(site);channels=groups=available=missing=0
    for key,item in manifest['products'].items():
        if not key.startswith('pe-histograms?'):continue
        data=json.loads(gzip.decompress((site/item['path']).read_bytes()))
        if not data['available']:
            assert data['reason'] and not data['tiles'];missing+=1;continue
        available+=1
        assert len(data['tiles'])==len(data['rows'])==252
        for tile,row in zip(data['tiles'],data['rows']):
            assert tile['detector']==row['detector'] and tile['bin_width']==1
            channels+=1
            for name,g in tile['groups'].items():
                w,s1,s2=g['moments'];groups+=1
                assert math.isclose(sum(v for _,v in g['bins']),w,rel_tol=1e-9,abs_tol=1e-7)
                assert all(isinstance(b,int) and b>=0 and math.isfinite(v) and v>=0 for b,v in g['bins'])
                assert math.isclose(g['current_nA'],s1*1.602176634e-10,rel_tol=1e-12,abs_tol=1e-14)
                if w:
                    mean=s1/w;rms=math.sqrt(max(0,s2/w-mean*mean))
                    assert math.isclose(g['mean'],mean,rel_tol=1e-12,abs_tol=1e-12)
                    assert math.isclose(g['rms'],rms,rel_tol=1e-12,abs_tol=1e-12)
                if name=='gamma':assert g['available']==(row['system']=='showermax')
    assert available==4,available
    print(f'PASS: {available} PE selections, {channels} tiles, {groups} populations; {missing} explicitly unavailable campaigns.')

if __name__=='__main__':verify(sys.argv[1])
