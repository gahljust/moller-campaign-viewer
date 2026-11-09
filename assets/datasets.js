/* Separate saved datasets; never fall back silently to a different sample. */
window.ViewerDatasets=(()=>{
 const query=new URLSearchParams(location.search);
 const correlationPanel=query.get('panel')==='correlations';
 const panel=correlationPanel||query.get('panel')==='deconvolution';
 let active=query.get('dataset')==='farm'?'farm':'current',compare=query.get('compare')==='1'&&!panel,epoch=0;
 const manifests=new Map(),scales=new Map();
 async function manifest(dataset=active){
  if(!manifests.has(dataset)){
   const path=dataset==='farm'?'farm/manifest.json':'manifest.json';
   const request=fetch(path,{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('Farm results are not ready.');return r.json()});
   manifests.set(dataset,request);request.catch(()=>manifests.delete(dataset));
  }
  return manifests.get(dataset);
 }
 function sync(tab){
  const choice=document.getElementById('datasetChoice');
  if(tab==='results'&&!panel)document.getElementById('deconToolbar').prepend(choice);else if(tab==='maps'||tab==='secondaries')document.querySelector('#'+tab+' .workspaceHeading').prepend(choice);else if(tab==='transport'&&document.querySelector('#transport .studySetup'))document.querySelector('#transport .studySetup').prepend(choice);else document.getElementById('datasetHome').after(choice);
  document.getElementById('compareDatasets').hidden=tab!=='results';
  document.getElementById('datasetChoice').hidden=panel||tab==='changelog'||tab==='statistics'||tab==='overview';
  document.getElementById('datasetDetails').textContent=active==='farm'&&!['results','overview','statistics','changelog'].includes(tab)?(tab==='secondaries'?'Origins inferred from creation vertices · trigger scintillators included.':'Trigger scintillators included.') : '';
  document.getElementById('deconDatasetNote').textContent=tab==='results'&&!panel&&(compare||active==='farm')?'Farm: trigger scintillators included.':'';
  for(const b of document.querySelectorAll('[data-dataset]'))b.setAttribute('aria-pressed',String(b.dataset.dataset===(compare&&tab==='results'?'compare':active)));
 }
 async function choose(value){
  const ticket=++epoch,preferred=catalog?.runs.find(r=>r.name===run);
  compare=value==='compare';if(!compare)active=value;
  const url=new URL(location.href);url.searchParams.set('dataset',active);if(compare)url.searchParams.set('compare','1');else url.searchParams.delete('compare');history.replaceState(null,'',url);
  sync(tab);revision++;mapRevision++;secondaryRevision++;
  cache.clear();sourceMapCache.clear();surfaceCache.clear();
  if(detectorWorkspace){detectorWorkspace.histCache.clear();detectorWorkspace.sequence++;}
  mapData=null;staticManifest=null;
  playing=false;trackData=null;eventBank=null;geo=null;projectedTracks=null;sceneCache=null;
  document.getElementById('trackRun').innerHTML='';
  document.body.classList.add('datasetLoading');
  try{
   if(compare){await showResults();return;}
   const loaded=await manifest();if(ticket!==epoch)return;
   staticManifest=loaded;catalog=null;await initialize(preferred);
  }finally{if(ticket===epoch)document.body.classList.remove('datasetLoading');}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  if(panel){
   document.documentElement.classList.add('comparisonPanel');if(correlationPanel)document.documentElement.classList.add('correlationsPanel');document.getElementById('datasetChoice').hidden=true;
   const video=document.getElementById('deconvolutionVideo');video.removeAttribute('src');video.load();
  }
  document.querySelectorAll('[data-dataset]').forEach(b=>b.onclick=()=>choose(b.dataset.dataset).catch(fail));
  sync(tab);
  if(panel&&!correlationPanel){
   let last='',scheduled=false;
   const height=()=>{scheduled=false;const h=Math.ceil(document.querySelector('main').getBoundingClientRect().height+8),compact=!!document.querySelector('.matrixWorkspace.compactMatrix'),key=`${h}:${compact}`;if(key!==last){last=key;parent.postMessage({type:'decon-height',dataset:active,height:h,compact},location.origin)}};
   new ResizeObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(height)}}).observe(document.getElementById('resultBody'));
   let lastData=null;
   new MutationObserver(()=>{
    const data=window.DisplayCovarianceData;if(!data||data===lastData)return;lastData=data;
    const maxima={all:0};for(const r of data.rows){const v=data.C[r.index][r.index];maxima[r.system]=Math.max(maxima[r.system]||0,v);maxima.all=Math.max(maxima.all,v);}
    parent.postMessage({type:'decon-scales',dataset:active,response:detectorResponse,grouping:data.grouping,configuration:data.configuration,maxima},location.origin);
   }).observe(document.getElementById('resultBody'),{childList:true,subtree:true});
   document.addEventListener('click',e=>{const b=e.target.closest('[data-matrix]');if(b)parent.postMessage({type:'decon-select',matrix:b.dataset.matrix},location.origin)});
   document.addEventListener('change',e=>{if(['mainResponse','deconGrouping','deconConfiguration','uncertaintyUnit','dilutionLayout','dilutionSystem','hSystem','covarianceSystem','correlationSystem'].includes(e.target.id))parent.postMessage({type:'decon-control',id:e.target.id,value:e.target.value},location.origin)});
   window.addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==parent)return;
    const d=e.data;
    if(d.type==='decon-scale'){window.ComparisonCovarianceMaximum=d.maxima;document.dispatchEvent(new Event('comparison-scale'));}
    if(d.type==='decon-select'){
     const b=document.querySelector(`[data-matrix="${CSS.escape(d.matrix)}"]`);
     if(b?.getAttribute('aria-selected')!=='true')b?.click();
    }
    if(d.type==='decon-control'){
     const control=document.getElementById(d.id);
     if(control&&control.value!==d.value){control.value=d.value;control.dispatchEvent(new Event('change'));}
    }
   });
  }
  if(correlationPanel)window.addEventListener('message',e=>{
   if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='decon-control')return;
   const control=document.getElementById(e.data.id);
   if(control&&control.value!==e.data.value){control.value=e.data.value;control.dispatchEvent(new Event('change'));}
  });
 });
 window.addEventListener('message',e=>{
  if(panel||e.origin!==location.origin)return;
  const frames=[...document.querySelectorAll('.datasetCompare iframe')];
  if(!frames.some(f=>f.contentWindow===e.source))return;
  if(e.data?.type==='decon-height'){
   const frame=frames.find(f=>f.contentWindow===e.source);frame.dataset.compact=String(e.data.compact===true);frame.style.setProperty('--comparison-content-height',Math.min(9000,Math.max(1,e.data.height))+'px');
  }else if(e.data?.type==='decon-scales'){
   scales.set(e.data.dataset,e.data);
   const a=scales.get('current'),b=scales.get('farm');
   if(a&&b&&a.response===b.response&&a.grouping===b.grouping&&a.configuration===b.configuration){const maxima=Object.fromEntries(Object.keys(a.maxima).map(k=>[k,Math.max(a.maxima[k],b.maxima[k])]));for(const f of frames)f.contentWindow.postMessage({type:'decon-scale',maxima},location.origin);}
  }else if(['decon-select','decon-control'].includes(e.data?.type)){
   if(e.data.type==='decon-select')document.querySelector('.datasetCompare')?.scrollIntoView({block:'start'});
   if(e.data.type==='decon-control')for(const f of document.querySelectorAll('.correlationCompare iframe'))f.contentWindow.postMessage(e.data,location.origin);
   // A recipient already on the requested tab does not need another click.
   for(const f of frames)if(f.contentWindow!==e.source){
    const d=e.data;
    if(d.type==='decon-select'&&f.contentDocument?.querySelector(`[data-matrix="${CSS.escape(d.matrix)}"]`)?.getAttribute('aria-selected')==='true')continue;
    f.contentWindow.postMessage(d,location.origin);
   }
  }
 });
 function showComparison(){
  scales.clear();
  document.getElementById('resultTitle').textContent='Deconvolution';
  document.getElementById('resultScope').textContent='LH2 · 11 GeV · same cuts and exposure';
  document.getElementById('resultBody').innerHTML=`<div class="datasetCompare">${[['current','Sampled · 9M'],['farm','Farm · 29.79 million events']].map(([id,label])=>`<section><h2>${label}</h2><iframe title="${label}: deconvolution" src="?dataset=${id}&panel=deconvolution#deconvolution"></iframe></section>`).join('')}</div><div id="detectorExplorer" class="correlationCompare">${[['current','Sampled · 9M'],['farm','Farm · 29.79M']].map(([id,label])=>`<section><h2>${label}</h2><iframe title="${label}: detector correlations" src="?dataset=${id}&panel=correlations#deconvolution"></iframe></section>`).join('')}</div><p class="analysisToolFooter">Want to view your own ROOT files this way? <a href="https://github.com/gahljust/gdml-geometry-viewer" target="_blank" rel="noopener noreferrer">Analysis/Viewing tool here.</a></p>`;
 }
 return {get active(){return active},get epoch(){return epoch},get compare(){return compare&&!panel},manifest,sync,choose,showComparison,panel};
})();
