/* One detector workspace. Reuses the published products and plot calculations. */
(function(root){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=r=>(r.system==='showermax'?'ShowerMax':'Ring '+r.system.slice(4))+' · '+r.detector+' · '+r.region;
const matches=(row,plane)=>plane==='all_detectors'||(plane==='main_detector'?row.system!=='showermax':plane==='circle'?row.system==='showermax':row.system===plane.slice(0,5)&&(!plane.endsWith('_bf')||row.detector<150000)&&(!plane.endsWith('_ff')||row.detector>=150000));
const categories=[['all','All','#077d9e'],['primaries','Primaries','#455065'],['charged','Secondaries · charged','#e77c2b'],['gamma','Secondaries · gamma','#8b6aa7']];

class DetectorWorkspace{
 constructor(element,services){
  this.element=element;this.services=services;this.metric='pattern';this.panel='regions';this.selected=null;this.sequence=0;this.plane='main_detector';this.detector='main_detector';this.ring='all';this.regions=['open','closed','transition'];this.logY={all:false,primaries:false,charged:false,gamma:false};this.histCache=new Map();
  this.q=s=>element.querySelector(s);
  this.surface=new HitMap3D.SurfaceView(this.q('#mainSurfaceMap'),{onSelect:det=>this.select(det)});
  this.surface.element.querySelector('.surfaceNavigation>span').textContent='Select a tile to inspect';
  const cameraBar=document.createElement('div');cameraBar.className='workspaceCameraBar';
  const toolbar=this.surface.element.querySelector('.surfaceToolbar'),navigation=this.surface.element.querySelector('.surfaceNavigation');
  toolbar.before(cameraBar);cameraBar.append(toolbar,navigation);
  this.q('#plane').onchange=()=>{this.selected=null;this.surface.selectedDetector=null;this.surface.fit();this.setPanel('regions');this.show(this.run);};
  this.q('#mapRing').onchange=this.q('#plane').onchange;
  this.q('#mapRegions').onchange=()=>{
   this.regions=RegionSelection.read(this.q('#mapRegions'));
   if(this.selected!==null&&!this.rows().some(r=>r.detector===this.selected))this.surface.clearSelection();
   this.populateTiles();this.updateDisplay();
  };
  this.q('.workspaceTile').onchange=e=>{if(e.target.value)this.surface.selectDetector(+e.target.value);else this.surface.clearSelection();};
  this.q('.clearTile').onclick=()=>this.surface.clearSelection();
  this.q('.pePlots').addEventListener('plot-axis-mode',e=>{this.logY[e.detail.key]=e.detail.log;});
  element.querySelectorAll('[data-workspace-panel]').forEach(b=>b.onclick=()=>this.setPanel(b.dataset.workspacePanel));
  this.q('.inspectorTabs').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||!e.target.matches('[role=tab]'))return;e.preventDefault();const panel=e.key==='Home'?'regions':e.key==='End'?'tile':this.panel==='regions'?'tile':'regions';this.setPanel(panel);this.q(`[data-workspace-panel="${panel}"]`).focus();};
  element.querySelectorAll('[data-map-metric]').forEach(b=>b.onclick=()=>{this.metric=b.dataset.mapMetric;this.renderGeometry();});
  this.q('.workspaceSignalUnits').onclick=e=>{const b=e.target.closest('[data-signal-display]');if(b){services.setSignal(b.dataset.signalDisplay);this.updateDisplay();}};
  this.q('#regionTable').onclick=e=>{const b=e.target.closest('[data-aggregation]');if(b){services.setAggregation(b.dataset.aggregation);this.renderRegions();}};
 }
 async histograms(run){
  if(!this.histCache.has(run)){
   const request=this.services.histograms(run);this.histCache.set(run,request);
   request.catch(()=>this.histCache.delete(run));
   while(this.histCache.size>3)this.histCache.delete(this.histCache.keys().next().value);
  }return this.histCache.get(run);
 }
 async show(run){
  const ticket=++this.sequence;this.run=run;this.detector=this.q('#plane').value||'main_detector';this.ring=this.q('#mapRing').value||'all';
  const mode=this.services.mode();
  // A common color scale must never mix quartz crossings/s with ShowerMax PE/s.
  if(mode==='0'&&this.detector==='all_detectors'){this.detector='main_detector';this.q('#plane').value=this.detector;}
  this.plane=this.detector==='main_detector'&&this.ring!=='all'?this.ring:this.detector;
  this.q('#mapRing').parentElement.hidden=this.detector==='circle';
  this.q('#mapsResponse').parentElement.hidden=this.detector==='circle';
  const planes=this.plane==='all_detectors'?[this.ring==='all'?'main_detector':this.ring,'circle']:[this.plane];
  this.maps=[];this.hist=null;this.surfaceData=null;this.histReason='Loading PE distributions…';
  this.q('.workspaceStatus').textContent='Loading saved data…';this.q('#mapScope').textContent='';this.q('#regionTable').innerHTML='';
  this.surface.clear();this.renderPlots();
  this.q('.workspaceTile').disabled=true;
  this.qAllMetrics(true);
  const mapsRequest=Promise.all(planes.map(p=>this.services.map(run,p)));
  const surfaceRequest=Promise.all(planes.map(p=>this.services.surfaces(run,p,mode)));
  const histRequest=this.histograms(run);
  // Settle each source separately: unavailable PE spectra must not hide a valid hit map.
  const outcomes=await Promise.allSettled([mapsRequest,surfaceRequest,histRequest]);
  if(ticket!==this.sequence)return;
  const [maps,surfaces,hist]=outcomes;
  const problems=[];
  if(maps.status==='fulfilled'){
   this.maps=maps.value;this.services.onMap(this.maps[0]);this.updatePlanes(this.maps[0].planes,mode);
  }else problems.push('Regional data unavailable: '+maps.reason.message);
  if(surfaces.status==='fulfilled')this.surfaceData=HitMap3D.aggregate(surfaces.value.flat(),{mode,plane:this.plane});
  else problems.push('Hit pattern unavailable: '+surfaces.reason.message);
  if(hist.status==='fulfilled'&&hist.value.available){this.hist=hist.value;this.histReason='';}
  else this.histReason=hist.status==='rejected'?hist.reason.message:hist.value.reason||'PE distributions unavailable for this selection.';
  const rows=this.rows();
  if(!rows.some(r=>r.detector===this.selected)){this.selected=null;this.surface.selectedDetector=null;this.surface.focusedDetector=null;}
  this.populateTiles();
  this.qAllMetrics(!this.hist);
  if(!this.hist&&this.metric!=='pattern')this.metric='pattern';
  this.q('.workspaceStatus').textContent=problems.join(' ');
  this.updateDisplay();
 }
 populateTiles(){
  const select=this.q('.workspaceTile'),rows=this.rows();
  select.innerHTML='<option value="">Select a tile…</option>'+['ring1','ring2','ring3','ring4','ring5','ring6','showermax'].map(system=>{
   const group=rows.filter(r=>r.system===system);if(!group.length)return '';
   return `<optgroup label="${system==='showermax'?'ShowerMax':'Ring '+system.slice(4)}">${group.map(r=>`<option value="${r.detector}">${r.detector} · ${esc(r.region)}</option>`).join('')}</optgroup>`;
  }).join('');select.disabled=!rows.length;select.value=this.selected??'';
 }
 qAllMetrics(disabled){for(const b of this.element.querySelectorAll('[data-map-metric]'))if(b.dataset.mapMetric!=='pattern')b.disabled=disabled;}
 systems(){return this.detector==='circle'?['showermax']:[...(this.ring==='all'?['ring1','ring2','ring3','ring4','ring5','ring6']:[this.ring]),...(this.detector==='all_detectors'?['showermax']:[])];}
 accepts(row){return this.systems().includes(row.system)&&this.regions.includes(row.region);}
 rows(){return (this.hist?.rows||this.surfaceData?.rows||[]).filter(r=>this.accepts(r));}
 updatePlanes(planes,mode){
  const select=this.q('#plane'),main=['main_detector','circle'].filter(p=>planes.includes(p));
  const option=p=>`<option value="${p}">${p==='main_detector'?'Main detector':p==='circle'?'ShowerMax':this.services.planeLabel(p)}</option>`;
  select.innerHTML=`<option value="all_detectors" ${mode==='0'?'disabled':''}>All detectors</option>`+main.map(option).join('');
  select.value=this.detector;
  const rings=this.q('#mapRing');rings.innerHTML='<option value="all">All rings</option>'+[1,2,3,4,5,6].filter(n=>planes.includes('ring'+n)).map(n=>`<option value="ring${n}">Ring ${n}</option>`).join('');rings.value=this.ring;
 }
 select(det){
  this.selected=det;this.q('.workspaceTile').value=det??'';
  this.setPanel(det===null?'regions':'tile');this.renderPlots();
 }
 setPanel(panel){
  this.panel=panel;
  for(const b of this.element.querySelectorAll('[data-workspace-panel]')){const active=b.dataset.workspacePanel===panel;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}
  this.q('#workspaceRegions').hidden=panel!=='regions';this.q('#workspaceTilePanel').hidden=panel!=='tile';
 }
 updateDisplay(){
  const isPE=this.maps.some(d=>d.unit==='PE/s');
  this.q('.workspaceSignalUnits').hidden=!isPE;
  this.q('[data-map-metric="signal"]').textContent=this.services.signal()==='current'?'Tile current':'Tile PE';
  for(const b of this.element.querySelectorAll('.workspaceSignalUnits button'))b.setAttribute('aria-pressed',String(b.dataset.signalDisplay===this.services.signal()));
  this.renderRegions();this.renderGeometry();this.renderPlots();
 }
 renderRegions(){
  const panel=this.q('#regionTable');
  panel.innerHTML=this.maps.map(d=>`<section class="workspaceRegionBlock">${this.maps.length>1?`<h3>${d.plane==='circle'?'ShowerMax':'Main detector'}</h3>`:''}${this.services.regionPanel(d)}</section>`).join('');
  // PE/current units are shared with the map; retain Total/Average beside the table.
  panel.querySelectorAll('.signalToggle').forEach(e=>e.remove());
  for(const row of panel.querySelectorAll('tr'))Array.from(row.children).forEach((cell,i)=>{if(i>0)cell.hidden=!this.regions.includes(['open','closed','transition'][i-1]);});
  panel.querySelectorAll('table').forEach(t=>t.hidden=!this.regions.length);
  this.q('.workspaceHint').textContent=this.regions.length?'Select a tile to see its PE distributions.':'Select at least one region.';
  const d=this.maps[0];
  if(this.maps.length===1&&d){const a=this.regions.length===3?d.signal_summary||d.interaction_summary:d.regions?.available?{estimate:d.regions.rows.filter(r=>this.regions.includes(r.region)).reduce((n,r)=>n+r.estimate,0)}:null,u=this.services.units(d.unit);this.q('#mapScope').innerHTML=a?`${this.regions.length===3?'Total':'Selected regions'} <strong>${this.services.number(a.estimate*u.factor)} <span>${esc(u.unit)}</span></strong>`:'';}
  else this.q('#mapScope').textContent='';
 }
 renderGeometry(){
  for(const b of this.element.querySelectorAll('[data-map-metric]'))b.setAttribute('aria-pressed',String(b.dataset.mapMetric===this.metric));
  let data=this.surfaceData;
  if(!this.regions.length){this.surface.clear('Select at least one region');return;}
  if(this.metric!=='pattern'&&this.hist){
   const values={};for(const t of this.hist.tiles||[]){if(this.accepts(t))values[t.detector]=this.metric==='ratio'?t.groups.all.rms_over_mean:t.groups.all.moments[1];}
   const u=this.services.units('PE/s');
   data={faces:this.hist.faces,rows:this.hist.rows,cells:[],cell_mm:10,plane:this.plane,tileValues:values,linear:this.metric==='ratio',unit:this.metric==='ratio'?'':'PE/s',total:1,legendLabel:this.metric==='ratio'?'RMS/Mean · linear color':`${u.label} [${u.unit}] / tile · log color`};
  }
  if(data)this.surface.setData({...data,signalDisplay:this.services.signal(),regionFilter:this.regions,systemFilter:this.systems()});
  else this.surface.clear('Hit pattern unavailable for this selection');
 }
 renderPlots(){
  const row=this.rows().find(r=>r.detector===this.selected),tile=this.hist?.tiles?.find(t=>t.detector===this.selected);
  this.q('.clearTile').hidden=this.selected===null;
  this.q('.workspaceSelected').textContent=row?label(row):'PE distributions';
  this.q('.workspaceTile').value=this.selected??'';
  const plots=this.q('.pePlots'),scope=this.q('.peScope');
  if(!row||!tile){
   plots.innerHTML=`<div class="workspaceEmpty"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 8h32v48H16zM10 14v42M22 2h32v48"/><path d="M25 39v9m8-23v23m8-33v33"/></svg><strong>${row?'PE distributions unavailable':'Select a tile'}</strong><span>${row?esc(this.histReason):'Click the detector or choose a tile above.'}</span></div>`;scope.textContent='';return;
  }
  const shown=categories.filter(([key])=>key!=='gamma'||row.system==='showermax');
  const max=Math.max(tile.bin_width,tile.groups.all.maximum);
  plots.innerHTML=shown.map(([key,title,color])=>TileAnalysis.histogram(tile.groups[key],tile.bin_width,max,title,color,this.logY[key],key)).join('');
  scope.textContent=(row.system==='showermax'?'Supported forward entries':'Forward e−/e+ · kinetic energy > 1.1 MeV')+' · RMS = standard deviation of expected PE.';
 }
}
root.DetectorWorkspace=DetectorWorkspace;
if(typeof module!=='undefined'&&module.exports)module.exports={matches};
})(typeof window!=='undefined'?window:globalThis);

// Keep each embedded tool inside the space below the actual sticky header.
(()=>{const header=document.getElementById('siteHeader');if(!header)return;
 const sizeHeader=()=>document.documentElement.style.setProperty('--site-header-height',`${header.getBoundingClientRect().height}px`);
 new ResizeObserver(sizeHeader).observe(header);sizeHeader();})();
