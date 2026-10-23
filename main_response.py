"""Export the validated local rate/PE comparison into portable site products."""
import json
from pathlib import Path
import sys
from urllib.parse import urlencode

def products(cohort, selected):
    workspace=Path(__file__).resolve().parents[2]
    sys.path.insert(0,str(workspace))
    from background_campaign.main_detector_response import map_product, viewer_product
    from background_campaign.deconvolution.tile_product import product as tile_product
    from background_campaign.showermax_live import research
    from background_campaign.showermax_live import detector_maps, pe_histograms
    from background_campaign.showermax_live.export_research import compact_secondary_display
    from background_campaign.showermax_live.secondary_sources import compact
    manifest=research.read(map_product.OUT/'manifest.json')
    runs=set(manifest['runs'])
    if not runs <= selected:raise ValueError('PE source campaigns are missing from the website export.')
    if any(v['cohort']!=cohort for v in manifest['runs'].values()):raise ValueError('PE cohort differs from website cohort.')
    combined=[r for r in research.catalog()['combined'] if r['cohort']==cohort and set(r['members'])==runs and not r['blocked']]
    if len(combined)!=1 or combined[0]['name'] not in selected:raise ValueError('Expected one matching combined PE selection.')
    names=sorted(runs)+[combined[0]['name']]
    values={}
    def put(route,args,value):
        # The portable product contains relative provenance only, as in the
        # existing research export. No ROOT files or local services are exposed.
        raw=json.dumps(value,allow_nan=False).replace(str(workspace.parent)+'/', '')
        if '/Users/' in raw or '/Volumes/' in raw:raise ValueError('Local path in public response product')
        values[route+'?'+urlencode(sorted(args.items()))]=json.loads(raw)
    for name in names:
        map_product.selection(name,research.RUNS)
        for plane in [*map_product.PLANES, 'circle']:
            # Refresh rate products as well: never reuse a stale combined summary.
            base=map_product.response('maps',{'run':[name],'plane':[plane],'response':['0']})
            if name==combined[0]['name']:
                base.pop('bins');base['map_recipe']='sum_source_maps_v1'
            put('maps',{'run':name,'plane':plane,'tile':''},compact_secondary_display(base))
            if plane!='circle':
                pe=map_product.response('maps',{'run':[name],'plane':[plane],'response':['2']})
                put('maps',{'run':name,'plane':plane,'tile':'','response':'2'},compact_secondary_display(pe))
            surface=({'schema':'detector_surface_recipe_v1','source_planes':[plane[:-3]],'run':name}
                if plane.endswith(('_bf','_ff')) else detector_maps.surfaces(name,plane,'0',research.RUNS))
            # Both display weightings use the same cells; do not duplicate geometry/data.
            surface.pop('response_mode',None)
            put('surface-maps',{'run':name,'plane':plane},surface)
        for plane in ['main_detector',*[f'ring{i}' for i in range(1,7)]]:
            put('secondary-sources',{'run':name,'plane':plane,'response':'2'},compact(map_product.sources(name,plane)))
    # Histograms retain exact unbinned moments and 1 PE display bins.
    for name in sorted(selected):
        if name in names:
            hist=pe_histograms.product(name)
            if not hist.get('available'):raise ValueError(hist.get('reason','PE histograms unavailable'))
            if any(t['bin_width']!=1 for t in hist['tiles']):raise ValueError('Expected 1 PE histogram bins')
        else:
            hist={'schema':'tile_pe_analysis_v1','available':False,'run':name,
                  'reason':'PE distributions are not available for this campaign.',
                  'faces':[],'rows':[],'tiles':[]}
        put('pe-histograms',{'run':name},hist)
    name=next(n for n in runs if manifest['runs'][n]['metadata']['channel']=='moller')
    baseline=tile_product(name)
    regional=research.results(name)
    for mode in ('0','2'):
        tiles=viewer_product.product(baseline,mode)
        if not tiles.get('available'):raise ValueError(tiles.get('reason','PE deconvolution unavailable'))
        put('deconvolution',{'response':mode},{'available':True,'tiles':tiles,'regional':regional})
    return values,{'schema':'main_detector_response_v1','runs':names,'histories':manifest['histories'],
        'options':[{'id':'0','label':'Rate weighting'},{'id':'2','label':'Rate × PE response'}],
        'map_manifest_sha256':map_product.sha(map_product.OUT/'manifest.json'),
        'viewer_manifest_sha256':map_product.sha(viewer_product.OUT/'viewer_manifest.json')}
