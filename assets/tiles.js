/* Local results: video, deconvolution, then the input matrices. */
const LocalTiles=(()=>{
 let data=null,regional=null,uncertaintyUnit='percent',matrixSystems={covariance:'all',correlation:'all'},hSystem='all',dilutionSystem='all',dilutionLayout='tiles';
 const systems=['ring1','ring2','ring3','ring4','ring5','ring6','showermax'];
 const systemName=s=>s==='all'?'All detectors':s==='showermax'?'ShowerMax':`Ring ${s.slice(4)}`;
 const options=(all=false)=>(all?['all',...systems]:systems).map(s=>`<option value="${s}">${systemName(s)}</option>`).join('');
 const rowName=r=>`${systemName(r.system)} · ${r.detector} · ${r.region}`;
 const categoryName=s=>s.replace(/^ring(\d)_/,'Ring $1 · ').replace(/^showermax_/,'ShowerMax · ').replaceAll('_',' ');
 const labels=()=>data.components.map(c=>names[c]||c);
 const matrix=(m)=>table(['Interaction',...labels()],m.map((row,i)=>[esc(labels()[i]),...row.map(v=>esc(fmt(v)))]));
 const combinedCovariance=f=>f.covariance_ppb2.map((row,i)=>row.map((v,j)=>v+f.template_mc_covariance_ppb2[i][j]));
 async function show(saved,token){

  const response=await api('deconvolution');if(token!==revision)return true;
  if(!response.available){
   $('resultTitle').textContent='Deconvolution';
   $('resultScope').textContent=`${targetLabel(saved.scope.target)} · ${+saved.scope.energy_mev/1000} GeV`;
   $('resultBody').innerHTML=`<p class="empty">${esc(response.reason)}</p>${saved.dilution?'<section class="resultSection"><h2>Dilution factors</h2>'+dilutionTable(saved.dilution)+'</section>':''}`;
   return true;
  }
  data=response.tiles;regional=response.regional;
  const f=data.forecast,combined=combinedCovariance(f);
  resultData={...saved,individual_tiles:data,combined_forecast:{covariance_ppb2:combined,standard_error_ppb:combined.map((r,i)=>Math.sqrt(r[i])),method:'Projected experimental statistics plus independent template MC covariance; first-order propagation at the simulated reference, fixed forecast weights.'}};
  $('resultTitle').textContent='Deconvolution';
  $('resultScope').textContent=`LH2 · 11 GeV · 224 quartz tiles + 28 ShowerMax modules`;
  $('resultBody').innerHTML=`<section class="resultSection deconvolutionLead"><h2>Deconvolution matrix M</h2>
   <div class="deconvolutionEquation"><span>M = Hᵀ C⁻¹ H</span><span>5 interactions × 5 interactions · ppb⁻²</span></div>
   <p class="resultMeta">H is the asymmetry-adjusted dilution matrix below. C includes same-event correlations across all 252 detector channels.</p>
   ${matrix(f.matrix)}
  </section><section class="uncertaintyLead">
   <div class="heading"><h2>Asymmetry uncertainties</h2><label>Units<select id="uncertaintyUnit"><option value="percent">Relative [%]</option><option value="ppb">Absolute [ppb]</option></select></label></div>
   <p class="resultMeta">Assumed exposure · ${f.beam_days} beam days · ${100*f.polarization}% polarization · ${f.current_uA} µA</p>
   <p class="resultMeta">Projected statistical covariance = M⁻¹ · σ = √(diagonal of M⁻¹)</p>
   <div id="uncertaintyTable"></div>
   <details><summary>Extracted-asymmetry covariance · ppb²</summary><label>Contribution<select id="fitCovariance"><option value="combined">Combined</option><option value="counting">Projected experimental statistics</option><option value="mc">Simulation MC</option></select></label><div id="fitCovarianceTable"></div></details>
   <div class="uncertaintyKey"><span><b>Projected experimental σ:</b> predicted from simulated rates and event correlations for the assumed exposure</span><span><b>MC:</b> finite simulation statistics in H</span><span><b>Combined:</b> both, added in quadrature</span></div>
  </section>

  <section class="resultSection"><div class="heading"><h2>Dilution-factor matrices</h2><div class="matrixControls"><label>Grouping<select id="dilutionLayout"><option value="regions">Ring & region</option><option value="tiles">Individual tiles</option></select></label><label>Detector<select id="dilutionSystem">${options(true)}</select></label></div></div>
   <p class="resultMeta">Main quartz: fractions of crossing rate. ShowerMax: fractions of PE-weighted response. Values ± 1σ MC.</p><div id="dilutionMatrix" class="matrixTable"></div>
  </section>
  <section class="resultSection"><div class="heading"><h2>Asymmetry-adjusted dilution matrix H</h2><label>Detector<select id="hSystem">${options(true)}</select></label></div>
   <p class="matrixFormula">H<sub>ri</sub> = f<sub>ri</sub> × A<sub>ri</sub> / A<sub>i,ref</sub></p>
   <p class="resultMeta">Tile dilution × simulated asymmetry relative to Ring 5 open. Rows are tiles; columns are interactions.</p><div id="hTable" class="matrixTable"></div>
  </section>
  ${['covariance','correlation'].map(scale=>`<section class="resultSection"><div class="heading"><h2>${scale==='covariance'?'Tile asymmetry covariance C':'Tile correlation matrix'}</h2><label>Detector<select id="${scale}System">${options(true)}</select></label></div>
   <p class="resultMeta">${scale==='covariance'?'Cᵢⱼ = 10¹⁸ Bᵢⱼ / (Polarization² × Time × Rᵢ × Rⱼ) · ppb² · projected experimental statistics':'ρᵢⱼ = Cᵢⱼ / √(Cᵢᵢ Cⱼⱼ) · dimensionless · normalized from the same covariance'}</p>
   <div class="covarianceExplorer"><div><canvas id="${scale}Map" width="660" height="630" tabindex="0" role="img" aria-label="Tile ${scale} matrix; use arrow keys to inspect cells"></canvas><p class="matrixLegend" id="${scale}Legend"></p></div><div class="matrixReadout"><h3>Inspect a tile pair</h3><p class="resultMeta">Point, tap, or use arrow keys. Display filters leave the full fit unchanged.</p><div id="${scale}Readout" aria-live="polite"></div></div></div>
  </section>`).join('')}`;
  for(const [id,current,update] of [
   ['uncertaintyUnit',uncertaintyUnit,v=>{uncertaintyUnit=v;drawUncertainties()}],
   ...['covariance','correlation'].map(scale=>[`${scale}System`,matrixSystems[scale],v=>{matrixSystems[scale]=v;drawCovariance(scale)}]),
   ['hSystem',hSystem,v=>{hSystem=v;drawH()}],
   ['dilutionLayout',dilutionLayout,v=>{dilutionLayout=v;drawDilutions()}],
   ['dilutionSystem',dilutionSystem,v=>{dilutionSystem=v;drawDilutions()}]]){
   $(id).value=current;$(id).onchange=()=>update($(id).value);
  }
  const drawFitCovariance=()=>{$('fitCovarianceTable').innerHTML=matrix($('fitCovariance').value==='counting'?f.covariance_ppb2:$('fitCovariance').value==='mc'?f.template_mc_covariance_ppb2:combined)};
  $('fitCovariance').onchange=drawFitCovariance;
  drawUncertainties();drawFitCovariance();drawCovariance('covariance');drawCovariance('correlation');drawH();drawDilutions();return true;
 }
 function drawUncertainties(){
  const f=data.forecast,relative=uncertaintyUnit==='percent',unit=relative?'%':'ppb';
  $('uncertaintyTable').innerHTML=table(['Interaction',`Projected experimental σ [${unit}]`,`Simulation MC σ [${unit}]`,`Combined σ [${unit}]`],labels().map((label,i)=>{
   const scale=relative?100/Math.abs(f.reference_asymmetry_ppb[i].value):1;
   const a=f.covariance_ppb2[i][i],b=f.template_mc_covariance_ppb2[i][i];
   return [esc(label),... [a,b,a+b].map((v,j)=>{const text=relative?(Math.sqrt(v)*scale).toFixed(2):fmt(Math.sqrt(v),4);return j===2?`<strong>${text}</strong>`:text})];
  }));
 }
 function drawH(){
  const rows=data.rows.filter(r=>hSystem==='all'||r.system===hSystem);
  $('hTable').innerHTML=table(['Tile',...labels()],rows.map(r=>[esc(rowName(r)),...data.forecast.forward_design[r.index].map(v=>esc(fmt(v)))]));
 }
 function drawDilutions(){
  if(dilutionLayout==='tiles'){
   const rows=data.rows.filter(r=>dilutionSystem==='all'||r.system===dilutionSystem);
   $('dilutionMatrix').innerHTML=table(['Tile',...labels()],rows.map(r=>[esc(rowName(r)),...r.components.map(c=>esc(percentError(c.dilution.value,c.dilution.standard_error)))]));
  }else{
   const p=regional.dilution;
   if(!p){$('dilutionMatrix').innerHTML='<p>Regional dilution factors are unavailable.</p>';return}
   const rows=p.rows.filter(r=>dilutionSystem==='all'||r.category.startsWith(dilutionSystem+'_'));
   $('dilutionMatrix').innerHTML=table(['Region',...labels()],rows.map(r=>[esc(categoryName(r.category)),...data.components.map(c=>esc(percentError(r.components[c].dilution,r.components[c].dilution_standard_error)))]));
  }
 }
 function drawCovariance(matrixScale){
  let cell=[0,0];const matrixSystem=matrixSystems[matrixScale];
  const canvas=$(`${matrixScale}Map`),ctx=canvas.getContext('2d'),rows=data.rows.filter(r=>matrixSystem==='all'||r.system===matrixSystem),n=rows.length,c=data.forecast.category_asymmetry_covariance_ppb2;
  const x0=92,y0=35,size=520,step=size/n;
  const corr=(i,j)=>c[i][j]/Math.sqrt(c[i][i]*c[j][j]);
  let max=1;if(matrixScale==='covariance')max=Math.max(...rows.map(r=>c[r.index][r.index]));
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
 return {show};
})();
