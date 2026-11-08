/* Local results: matrix tabs, then the detector correlation viewer. */
const LocalTiles=(()=>{
 let activeMatrix='deconvolution',deconGrouping='tiles',deconConfiguration='all';
 let data=null,regional=null,uncertaintyUnit='percent',matrixSystems={covariance:'all',correlation:'all'},hSystem='all',dilutionSystem='all',dilutionLayout='tiles';
 const systems=['ring1','ring2','ring3','ring4','ring5','ring6','showermax'];
 const activeSystems=()=>systems.filter(s=>deconConfiguration==='all'||s!=='ring5');
 const systemName=s=>s==='all'?'All detectors':s==='showermax'?'ShowerMax':`Ring ${s.slice(4)}`;
 const options=(all=false)=>(all?['all',...activeSystems()]:activeSystems()).map(s=>`<option value="${s}">${systemName(s)}</option>`).join('');
 const rowName=r=>r.detector===null?r.label:`${systemName(r.system)} · ${r.detector} · ${r.region}`;
 const categoryName=s=>s.replace(/^ring(\d)_/,'Ring $1 · ').replace(/^showermax_/,'ShowerMax · ').replaceAll('_',' ');
 const labels=()=>data.components.map(c=>names[c]||c);
 const matrix=(m)=>table(['Interaction',...labels()],m.map((row,i)=>[esc(labels()[i]),...row.map(v=>esc(fmt(v)))]));
 const combinedCovariance=f=>f.covariance_ppb2.map((row,i)=>row.map((v,j)=>v+f.template_mc_covariance_ppb2[i][j]));
 async function show(saved,token){
  const bundle=await api('deconvolution',{response:detectorResponse});if(token!==revision)return true;
  let response=bundle.tiles,tileResponse=response;saved=bundle.regional;const responseNotice='';
  if(deconConfiguration==='without_ring5'){
   const r=await fetch(`grouped/${ViewerDatasets.active}-no-ring5.json`,{cache:'no-cache'});
   if(!r.ok)throw Error('Detector configuration unavailable.');
   const variants=(await r.json())[detectorResponse];if(!variants)throw Error('Detector response unavailable.');
   response=variants[deconGrouping];tileResponse=variants.tiles;if(token!==revision)return true;
  }else if(deconGrouping==='regions'){const r=await fetch(`grouped/${ViewerDatasets.active}.json`,{cache:'no-cache'});if(!r.ok)throw Error('Regional deconvolution unavailable.');response=(await r.json())[detectorResponse];if(!response)throw Error('Regional response unavailable.');if(token!==revision)return true;}
  const isRegion=deconGrouping==='regions',rowLabel=isRegion?'Region':'Tile',replaced=deconConfiguration==='without_ring5';
  for(const key of Object.keys(matrixSystems))if(replaced&&matrixSystems[key]==='ring5')matrixSystems[key]='all';
  if(replaced&&hSystem==='ring5')hSystem='all';if(replaced&&dilutionSystem==='ring5')dilutionSystem='all';
  if(!response.available){
   $('resultTitle').textContent='Deconvolution';
   $('resultScope').textContent=`${targetLabel(saved.scope.target)} · ${+saved.scope.energy_mev/1000} GeV`;
   $('resultBody').innerHTML=`<p class="empty">${esc(response.reason)}</p>${saved.dilution?'<section class="resultSection"><h2>Dilution factors</h2>'+dilutionTable(saved.dilution)+'</section>':''}`;
   return true;
  }
  data=response;regional=saved;
  const f=data.forecast,combined=combinedCovariance(f);
  const sampleLabel=(ViewerDatasets.active==='current'?'Sampled · 9 million events':data.dataset?.label)||`${Number(data.histories/1e6).toLocaleString('en-US',{maximumFractionDigits:2})} million simulated events total · Møller, ep-elastic & ep-inelastic`;
  resultData={...saved,individual_tiles:data,combined_forecast:{covariance_ppb2:combined,standard_error_ppb:combined.map((r,i)=>Math.sqrt(r[i])),method:'Projected experimental statistics plus independent template MC covariance; first-order propagation at the simulated reference, fixed forecast weights.'}};
  $('resultTitle').textContent='Deconvolution';
  $('resultScope').innerHTML=`<b>LH2 · 11 GeV</b><span>${isRegion?`${replaced?15:22} main regions + 3 ShowerMax regions`:`${replaced?140:224} quartz tiles + 28 ShowerMax modules`}</span>`;
  $('resultBody').innerHTML=`<section class="resultSection deconvolutionLead"><div class="editorialResultHeading"><div><h2>Deconvolution matrix M</h2><p class="resultMeta">${esc(sampleLabel)}</p></div>
   <div class="deconvolutionEquation"><span>M = Hᵀ C⁻¹ H</span><span>5 interactions × 5 interactions · ppb⁻²</span></div></div>
   <p class="resultMeta">H is the asymmetry-adjusted dilution matrix. C includes same-event correlations across ${data.rows.length} ${isRegion?'ring and region groups':'detector channels'}.</p>
   ${matrix(f.matrix)}
  </section><section class="uncertaintyLead">
   <div class="heading"><h2>Asymmetry uncertainties</h2><label>Units<select id="uncertaintyUnit"><option value="percent">Relative [%]</option><option value="ppb">Absolute [ppb]</option></select></label></div>
   <p class="resultMeta">${esc(sampleLabel)} · Assumed exposure: ${f.beam_days} beam days · ${100*f.polarization}% polarization · ${f.current_uA} µA</p>
   <p class="resultMeta">σ = √diag(M⁻¹) · Reference: each interaction’s Ring 5 Open asymmetry</p>
   <div id="uncertaintyTable"></div><div id="mcExplanation" class="resultMeta"></div>
   <p class="resultCaution">Expected PE only; optical/electronics fluctuations and model systematics excluded. Finite MC can make the forecast optimistic.</p>
  </section>

  <section class="resultSection"><div class="heading"><h2>Dilution-factor matrices</h2><div class="matrixControls"><label>Detector<select id="dilutionSystem">${options(true)}</select></label></div></div>
   <p class="resultMeta">Main quartz: ${Number(data.response_mode||0)>=2?'fractions of predicted PE signal':'fractions of crossing rate'}. ShowerMax: fractions of PE-weighted response. Values ± 1σ MC.</p><div id="dilutionMatrix" class="matrixTable"></div>
  </section>
  <section class="resultSection"><div class="heading"><h2>Asymmetry-adjusted dilution matrix H</h2><label>Detector<select id="hSystem">${options(true)}</select></label></div>
   <p class="matrixFormula">H<sub>ri</sub> = f<sub>ri</sub> × A<sub>ri</sub> / A<sub>i,ref</sub></p>
   <p class="resultMeta">${rowLabel} dilution × simulated asymmetry relative to Ring 5 open. Rows are ${isRegion?'regions':'tiles'}; columns are interactions.</p><div id="hTable" class="matrixTable"></div>
  </section>
  ${['covariance','correlation'].map(scale=>`<section class="resultSection"><div class="heading"><h2>${scale==='covariance'?rowLabel+' asymmetry covariance C':rowLabel+' correlation matrix'}</h2><label>Detector<select id="${scale}System">${options(true)}</select></label></div>
   <p class="resultMeta">${scale==='covariance'?'Cᵢⱼ = 10¹⁸ Bᵢⱼ / (Polarization² × Time × Rᵢ × Rⱼ) · ppb² · projected experimental statistics':'ρᵢⱼ = Cᵢⱼ / √(Cᵢᵢ Cⱼⱼ) · dimensionless · normalized from the same covariance'}</p>
   <div class="covarianceExplorer"><div class="matrixGraphic"><canvas id="${scale}Map" width="660" height="630" tabindex="0" role="img" aria-label="Tile ${scale} matrix; use arrow keys to inspect cells"></canvas><p class="matrixLegend" id="${scale}Legend"></p></div><div class="matrixReadout"><h3>Selected pair</h3><div id="${scale}Readout" aria-live="polite"></div></div></div>
  </section>`).join('')}`;
  if(data.response_comparison){
   const comparison=document.createElement('section');comparison.className='resultSection';
   const modes=data.response_comparison.modes;
   comparison.innerHTML='<h2>Rate and PE-weighted results</h2>'+table(['Main detector response','Main only','Main + ShowerMax','Main + ShowerMax: with MC σ'],modes.map(m=>[esc(m.name),... [m.fits.main_only.experimental_covariance.sigma_percent[0],m.fits.main_plus_showermax.experimental_covariance.sigma_percent[0],m.fits.main_plus_showermax.combined_covariance.sigma_percent[0]].map(v=>v.toFixed(4)+'%')]));
   $('resultBody').append(comparison);
  }
  const panels=[...$('resultBody').children];
  const tabs=[['deconvolution','Deconvolution'],['asymmetry','Asymmetry uncertainties'],['dilution','Dilution F'],['adjusted','Adjusted dilution H'],['covariance','Covariance C'],['correlation','Correlation']];
  if(data.response_comparison)tabs.push(['response','Response comparison']);
  const tablist=document.createElement('div');tablist.className='matrixTabs';tablist.setAttribute('role','tablist');tablist.setAttribute('aria-label','Deconvolution matrices');
  tablist.innerHTML=tabs.map(([id,label])=>`<button id="matrixTab-${id}" role="tab" aria-controls="matrixPanel-${id}" data-matrix="${id}">${label}</button>`).join('');
  const explorer=document.createElement('section');explorer.id='detectorExplorer';explorer.className='detectorExplorer';explorer.setAttribute('aria-label','Detector correlations');
  const workspace=document.createElement('div');workspace.className='matrixWorkspace';workspace.id='matrixWorkspace';workspace.append(tablist,...panels);$('resultBody').append(workspace,explorer);
  {
   const control=document.createElement('section');control.className='resultSection responseChoice';
   const choices=data.response_options||[{id:'0',label:'Rate weighting'}];
   control.innerHTML=`<div class="heading"><label>Grouping<select id="deconGrouping"><option value="tiles">Tiles · ${replaced?168:252}</option><option value="regions">Regions · ${replaced?18:25}</option></select></label><label title="Main detector weighting">Weighting<select id="mainResponse" ${data.response_mode==='2'?'title="Rate × predicted photoelectrons per crossing" aria-description="Rate × predicted photoelectrons per crossing"':''}>${choices.map(o=>`<option value="${esc(o.id)}">${esc(o.id==='2'?'Rate × PE':o.id==='0'?'Rate':o.label)}</option>`).join('')}</select></label><label>Detectors<select id="deconConfiguration" title="Excludes Ring 5 measurement channels. Simulated geometry and Ring 5 Open reference stay unchanged."><option value="all">All rings + SM</option><option value="without_ring5">SM replaces Ring 5</option></select></label></div>${responseNotice?`<p class="resultCaution">${esc(responseNotice)}</p>`:''}`;
   $('deconControls').replaceChildren(control);$('mainResponse').value=data.response_mode||'0';
   $('deconGrouping').value=deconGrouping;
   $('deconConfiguration').value=deconConfiguration;
   $('deconConfiguration').onchange=()=>{deconConfiguration=$('deconConfiguration').value;revision++;showResults().catch(fail)};
   $('deconGrouping').onchange=()=>{deconGrouping=$('deconGrouping').value;revision++;showResults().catch(fail)};
   $('mainResponse').onchange=()=>changeResponse($('mainResponse').value).catch(fail);
  }
  window.DetectorCorrelationData={rows:tileResponse.rows,C:tileResponse.forecast.category_asymmetry_covariance_ppb2,histories:data.histories};
  window.DisplayCovarianceData={rows:data.rows,C:f.category_asymmetry_covariance_ppb2,grouping:deconGrouping,configuration:deconConfiguration};
  window.ComparisonCovarianceMaximum=null;
  const detectorFrame=document.createElement('iframe');detectorFrame.title='Interactive detector correlations';detectorFrame.className='detectorCorrelationsFrame';detectorFrame.loading='lazy';detectorFrame.src='assets/detector-correlations.html?v=d71ad0a71ccd'+(document.documentElement.classList.contains('correlationsPanel')?'&compact=1':'');explorer.append(detectorFrame);
  const buttons=[...tablist.children];
  function selectMatrix(id,focus=false,align=false){
   activeMatrix=id;
   tabs.forEach(([key],i)=>{const selected=key===id;panels[i].hidden=!selected;buttons[i].setAttribute('aria-selected',String(selected));buttons[i].tabIndex=selected?0:-1;if(selected&&focus)buttons[i].focus()});
   requestAnimationFrame(()=>{fitMatrixCanvases();if(align&&!ViewerDatasets.panel)workspace.scrollIntoView({block:"start",behavior:"smooth"})});
  }
  tabs.forEach(([id],i)=>{const panel=panels[i];panel.id=`matrixPanel-${id}`;panel.classList.add('matrixPanel');panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`matrixTab-${id}`);buttons[i].onclick=()=>selectMatrix(id,false,true);buttons[i].onkeydown=e=>{let j;if(e.key==='ArrowRight')j=(i+1)%tabs.length;else if(e.key==='ArrowLeft')j=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=tabs.length-1;else return;e.preventDefault();selectMatrix(tabs[j][0],true,true)}});
  selectMatrix(tabs.some(([id])=>id===activeMatrix)?activeMatrix:'deconvolution');
  for(const [id,current,update] of [
   ['uncertaintyUnit',uncertaintyUnit,v=>{uncertaintyUnit=v;drawUncertainties()}],
   ...['covariance','correlation'].map(scale=>[`${scale}System`,matrixSystems[scale],v=>{matrixSystems[scale]=v;drawCovariance(scale)}]),
   ['hSystem',hSystem,v=>{hSystem=v;drawH()}],
   ['dilutionSystem',dilutionSystem,v=>{dilutionSystem=v;drawDilutions()}]]){
   $(id).value=current;$(id).onchange=()=>update($(id).value);
  }
  drawUncertainties();drawCovariance('covariance');drawCovariance('correlation');drawH();drawDilutions();
  workspaceResize?.disconnect();workspaceResize=new ResizeObserver(()=>{fitMatrixCanvases()});workspaceResize.observe(workspace);return true;
 }
 function drawUncertainties(){
  const f=data.forecast,relative=uncertaintyUnit==='percent',unit=relative?'%':'ppb';
  $('uncertaintyTable').innerHTML=table(['Interaction',`Projected experimental σ [${unit}]`,`Propagated MC error [${unit}]`,`Combined σ [${unit}]`],labels().map((label,i)=>{
   const scale=relative?100/Math.abs(f.reference_asymmetry_ppb[i].value):1;
   const a=f.covariance_ppb2[i][i],b=f.template_mc_covariance_ppb2[i][i];
   return [esc(label),... [a,b,a+b].map((v,j)=>{const text=relative?(Math.sqrt(v)*scale).toFixed(2):fmt(Math.sqrt(v),4);return j===2?`<strong>${text}</strong>`:text})];
  }));
  $('mcExplanation').innerHTML='<span title="Finite simulation uncertainty in dilution factors and calculated asymmetries, propagated through H."><b>MC:</b> uncertainty in H from finite simulation.</span><span>σ<sub>total</sub> = √(σ<sub>experimental</sub>² + σ<sub>MC</sub>²)</span>';
 }
 let workspaceResize=null;
 function drawH(){
  const rows=data.rows.filter(r=>hSystem==='all'||r.system===hSystem);
  $('hTable').innerHTML=table([deconGrouping==='regions'?'Region':'Tile',...labels()],rows.map(r=>[esc(rowName(r)),...data.forecast.forward_design[r.index].map(v=>esc(fmt(v)))]));
 }
 function drawDilutions(){
  const rows=data.rows.filter(r=>dilutionSystem==='all'||r.system===dilutionSystem);
  $('dilutionMatrix').innerHTML=table([deconGrouping==='regions'?'Region':'Tile',...labels()],rows.map(r=>[esc(rowName(r)),...r.components.map(c=>dilutionCell(c.dilution.value,c.dilution.standard_error))]));
 }
 function dilutionCell(value,error){
  const text=percentError(value,error),parts=text.split(' ± ');
  return parts.length===2?`<span class="dilutionValue">${esc(parts[0])}</span><span class="dilutionError"> ± ${esc(parts[1])}</span>`:esc(text);
 }
 function fitMatrixCanvases(){
  for(const id of ['covariance','correlation']){const canvas=$(`${id}Map`);if(!canvas||canvas.closest('[hidden]'))continue;
   const wrap=canvas.parentElement,legend=$(`${id}Legend`),h=wrap.clientHeight-legend.getBoundingClientRect().height-6;
   const width=Math.max(1,Math.min(wrap.clientWidth,h*660/630));canvas.style.width=width+'px';canvas.style.height=(width*630/660)+'px';
  }
 }

 function drawCovariance(matrixScale){
  let cell=[0,0];const matrixSystem=matrixSystems[matrixScale];
  const canvas=$(`${matrixScale}Map`),ctx=canvas.getContext('2d'),rows=data.rows.filter(r=>matrixSystem==='all'||r.system===matrixSystem),n=rows.length,c=data.forecast.category_asymmetry_covariance_ppb2;
  const x0=92,y0=35,size=520,step=size/n;
  const corr=(i,j)=>c[i][j]/Math.sqrt(c[i][i]*c[j][j]);
  let max=1;if(matrixScale==='covariance')max=window.ComparisonCovarianceMaximum?.[matrixSystem]||Math.max(...rows.map(r=>c[r.index][r.index]));
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
   const value=matrixScale==='correlation'?corr(rows[i].index,rows[j].index):c[rows[i].index][rows[j].index]/max;
   const rgb=value<0?[7,125,158]:[244,120,31],alpha=Math.min(1,Math.abs(value));ctx.fillStyle=`rgb(${rgb.map(v=>Math.round(255+(v-255)*alpha)).join(',')})`;
   ctx.fillRect(x0+j*step,y0+i*step,step+.2,step+.2);
  }
  ctx.font='13px system-ui';ctx.textBaseline='middle';
  const groups=[];for(let i=0;i<n;i++){let g=groups.at(-1);if(!g||g.system!==rows[i].system)groups.push({system:rows[i].system,start:i,end:i+1});else g.end=i+1}
  for(const g of groups){const pos=(g.start+g.end)/2*step;ctx.fillStyle='#455065';ctx.textAlign='right';ctx.fillText(g.system==='showermax'?'SM':systemName(g.system),x0-10,y0+pos);ctx.textAlign='center';ctx.fillText(g.system==='showermax'?'SM':systemName(g.system),x0+pos,y0+size+20);ctx.strokeStyle='#d9dee6';ctx.beginPath();ctx.moveTo(x0+g.start*step,y0);ctx.lineTo(x0+g.start*step,y0+size);ctx.moveTo(x0,y0+g.start*step);ctx.lineTo(x0+size,y0+g.start*step);ctx.stroke()}
  ctx.strokeStyle='#8c95a1';ctx.strokeRect(x0,y0,size,size);
  $(`${matrixScale}Legend`).innerHTML=matrixScale==='correlation'?'<span class="correlationRamp"></span> −1 · 0 · +1':`<span class="covarianceRamp"></span> 0 to ${esc(fmt(max))} ppb²`;
  function inspect(){
   const [i,j]=cell.map(v=>Math.max(0,Math.min(n-1,v))),a=rows[i],b=rows[j];cell=[i,j];
   $(`${matrixScale}Readout`).innerHTML=`<p><strong>${esc(rowName(a))}</strong><br>with<br><strong>${esc(rowName(b))}</strong></p><dl><dt>Covariance</dt><dd>${esc(fmt(c[a.index][b.index]))} ppb²</dd><dt>Correlation</dt><dd>${esc(fmt(corr(a.index,b.index)))}</dd></dl>`;
  }
  function pointer(e){const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*canvas.width/rect.width,y=(e.clientY-rect.top)*canvas.height/rect.height;if(x<x0||x>=x0+size||y<y0||y>=y0+size)return;cell=[Math.floor((y-y0)/step),Math.floor((x-x0)/step)];inspect()}
  canvas.onpointermove=pointer;canvas.onclick=pointer;canvas.onkeydown=e=>{const delta={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];if(delta){e.preventDefault();cell=cell.map((v,i)=>v+delta[i]);inspect()}};
  inspect();
 }
 document.addEventListener('comparison-scale',()=>{if(data&&$('covarianceMap'))drawCovariance('covariance')});
 return {show};
})();
