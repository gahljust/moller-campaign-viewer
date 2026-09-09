'use strict';
const $=id=>document.getElementById(id),M=ResearchMath,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={all:'All interactions',ep_inelastic:'ep inelastic',moller:'Møller',ep_elastic:'ep elastic',ep_inelastic_delta:'ep inelastic · Δ',ep_inelastic_resonance:'ep inelastic · resonance',ep_inelastic_continuum:'ep inelastic · continuum',c12_elastic:'C12 elastic',c12_inelastic:'C12 inelastic'};
const fmt=(v,d=4)=>v==null||!Number.isFinite(+v)?'Unavailable':(+v===0?'0':Math.abs(v)<.001||Math.abs(v)>1e5?(+v).toExponential(d-1):(+v).toPrecision(d));
let presentation={percentFormat:'{value}% ± {error}%',valueDigits:4,uncertaintyDigits:3,labels:{}},presentationError='';
const targetLabel=t=>t==='optics_all'?(presentation.labels.allOpticsFoils||'All optics foils'):t==='lh2'?'LH2':String(t).replace('c12_','Carbon ').toUpperCase();
function percentError(value,error){
 if(value==null||!Number.isFinite(value))return 'Unavailable';
 if(error==null||!Number.isFinite(error))return fmt(value*100,presentation.valueDigits)+'% · uncertainty unavailable';
 return presentation.percentFormat.replaceAll('{value}',fmt(value*100,presentation.valueDigits)).replaceAll('{error}',fmt(error*100,presentation.uncertaintyDigits));
}
async function loadPresentation(){
 try{let response=await fetch('assets/presentation.json',{cache:'no-store'});if(!response.ok)throw Error();let p=await response.json();
 if(typeof p.percentFormat!=='string'||!p.percentFormat.includes('{value}')||!p.percentFormat.includes('{error}')||p.percentFormat.length>100)throw Error();
 for(let key of ['valueDigits','uncertaintyDigits'])if(!Number.isInteger(p[key])||p[key]<2||p[key]>8)throw Error();
 if(!p.labels||typeof p.labels!=='object'||!Object.values(p.labels).every(v=>typeof v==='string'&&v.length<100))throw Error();
 presentation=p;presentationError='';names.all=p.labels.allInteractions||'All interactions';
 for(let b of document.querySelectorAll('nav button')){let text=p.labels[b.dataset.tab+'Tab'];if(text)b.textContent=text}
 }catch(e){presentationError='Presentation settings could not be read; keeping the current display settings.'}
}
const label=r=>`${targetLabel(r.target)} · ${+r.energy_mev/1000} GeV · ${names[r.channel]||r.channel} · ${r.target==='lh2'?'LH2':`sieve ${r.sieve}`} · ${r.cohort==='unverified-history'?'historical, unverified':r.source_commit?.slice(0,8)||r.cohort.slice(0,8)}`;
let catalog,run,tab='maps',revision=0,resultData,mapData,bank,trackData,geo,playing=false,lastFrame=0,framePending=false,mapRevision=0;
const cache=new Map();
let staticManifest;
async function api(route,args={}){
 staticManifest=staticManifest||await (await fetch('manifest.json')).json();
 let key=route+'?'+new URLSearchParams(Object.entries(args).sort(([a],[b])=>a.localeCompare(b))),item=staticManifest.products[key];
 if(!item)throw Error('This saved product is unavailable.');
 let response=await fetch(item.path);if(!response.ok)throw Error('Unable to load saved product.');
 let raw=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('');
 if(digest!==item.sha256)throw Error('Saved product hash mismatch.');
 let value=JSON.parse(new TextDecoder().decode(raw));
 if(value.map_recipe==='sum_source_maps_v1'){
  let sources=await Promise.all(value.map_sources.map(name=>api('maps',{run:name,plane:args.plane,tile:''})));
  if(sources.some(s=>JSON.stringify(s.grid)!==JSON.stringify(value.grid)||s.unit!==value.unit))throw Error('Combined source grid or unit mismatch.');
  value.bins=M.sumMaps(sources);
 }
 return value;
}
function download(name,data,type='application/json'){let url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data)],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function table(headers,rows){return `<div class="scroll"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function warning(text){return `<div class="warning">${esc(text)}</div>`}
function card(title,value,note=''){return `<div class="card"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`}
function fail(e){$(tab==='transport'?'transportNotice':'notice').innerHTML=warning(e.message||e)}
async function initialize(){try{await loadPresentation();catalog=await api('catalog');catalog.runs=[...catalog.runs,...(catalog.combined||[])];let before=run;$('run').innerHTML=catalog.runs.map(r=>`<option value="${esc(r.name)}">${esc(label(r))}</option>`).join('');run=catalog.runs.some(r=>r.name===before)?before:catalog.default;$('run').value=run;setupSelection();cache.clear();await changeRun()}catch(e){fail(e)}}
function setupSelection(){setPhysicalPickers(catalog.runs.find(x=>x.name===run))}
function setPhysicalPickers(preferred={}){let rows=catalog.runs;for(let [id,key] of [['targetSelect','target'],['energySelect','energy_mev'],['processSelect','channel'],['sieveSelect','sieve']]){let values=[...new Set(rows.map(r=>String(r[key])))],wanted=String(preferred[key]??$(id).value),choice=values.includes(wanted)?wanted:values[0];$(id).innerHTML=values.map(v=>`<option value="${esc(v)}">${esc(key==='energy_mev'?+v/1000+' GeV':key==='channel'?names[v]||v:key==='target'?targetLabel(v):v==='none'?'Not applicable':v)}</option>`).join('');$(id).value=choice;rows=rows.filter(r=>String(r[key])===choice)}if(rows.length){run=rows[0].name;$('run').value=run}}
for(let id of ['targetSelect','energySelect','processSelect','sieveSelect'])$(id).onchange=()=>{setPhysicalPickers();changeRun().catch(fail)};
async function changeRun(){
 revision++;mapRevision++;run=$('run').value;let r=catalog.runs.find(r=>r.name===run);
 $('identity').textContent='';
 let warnings=[];
 if(r.cohort==='unverified-history')warnings.push('Historical reference: producing commit is unverified.');
 if(r.blocked?.length)warnings.push('Combined view unavailable: '+r.blocked.join('; '));
 else if(r.health?.blocking_issue_count)warnings.push('Analysis incomplete: do not quote this campaign.');
 if(presentationError)warnings.push(presentationError);
 $('notice').innerHTML=warnings.map(warning).join('');resultData=null;mapData=null;await showTab(tab);
}
function interactionPanel(d,unit='PE/s',current=null){
 let a=d?.interaction_summary;if(!a)return '';let colors=['#077d9e','#f4781f','#455065','#239d93','#8b6aa7'];
 let sigma=(v,e)=>fmt(v)+(e==null?' · uncertainty unavailable':' ± '+fmt(e,3));
 return `<div class="combinedPanel"><h2>Interaction contributions</h2><div class="cards">${card('Recorded signal',sigma(a.estimate,a.standard_error)+' '+unit,current==null?'Independent source runs':current+' µA beam current')}${card('Interactions',a.components.length,'Fractions of the recorded signal')}</div><div class="contributionStack" role="img" aria-label="Interaction fractions">${a.components.map((r,i)=>`<span style="width:${100*(r.fraction||0)}%;background:${colors[i%colors.length]}" title="${esc(names[r.channel]||r.channel)}: ${esc(percentError(r.fraction,r.fraction_standard_error))}"></span>`).join('')}</div>${table(['Interaction',`Signal [${unit}]`,'Signal fraction ± MC error'],a.components.map((r,i)=>[`<span class="processKey" style="background:${colors[i%colors.length]}"></span>${esc(names[r.channel]||r.channel)}`,esc(sigma(r.estimate,r.standard_error)),`<strong>${esc(percentError(r.fraction,r.fraction_standard_error))}</strong>`]))}</div>`;
}
async function showTab(name){tab=name;$('identity').textContent='';$('analysisSelection').hidden=tab==='transport';$('notice').hidden=tab==='transport';playing=false;$('play').textContent='Play';document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==tab);document.querySelectorAll('nav button').forEach(e=>e.setAttribute('aria-selected',String(e.dataset.tab===tab)));try{if(tab==='results')await showResults();if(tab==='maps')await loadMap();if(tab==='transport')await initTransport()}catch(e){fail(e)}}
async function showResults(){
 let token=revision,selection=catalog.runs.find(r=>r.name===run);
 $('resultBody').innerHTML='<p>Loading saved dilution factors…</p>';
 let combined=catalog.runs.find(r=>r.kind==='combined'&&r.target===selection.target&&+r.energy_mev===+selection.energy_mev&&(r.target==='lh2'||r.sieve===selection.sieve));
 let [d,shower]=await Promise.all([api('results',{run}),fetchMap(combined?.name||run,'circle')]);
 if(token!==revision||tab!=='results')return;
 let a=shower.interaction_summary;
 resultData={...d,showermax:shower};
 $('resultScope').textContent=`${targetLabel(d.scope.target)} · ${+d.scope.energy_mev/1000} GeV · ± 1σ MC`;
 let rows=a?.components||[],missing=shower.combination?.missing||[];
 let tableRows=rows.map(r=>[esc(names[r.channel]||r.channel),`<strong>${esc(percentError(r.fraction,r.fraction_standard_error))}</strong>`]);
 for(let item of missing){let[target,ch]=item.split(': ');tableRows.push([esc((selection.target==='optics_all'?targetLabel(target)+' · ':'')+(names[ch]||ch)),'Unavailable'])}
 let hasCov=!!a?.fraction_covariance;
 let overview=`<h2>ShowerMax PE-weighted dilution</h2><p class="statusline">Share of ${missing.length?'included':'total'} PE signal · ${shower.normalization?.display_current_uA??''} µA</p><div class="two"><article>${table(['Interaction','Dilution ± MC error'],tableRows)}</article><article><h3>ShowerMax dilution correlations</h3>${hasCov?'<div class="matrixWrap"><canvas id="showerCovMap" width="450" height="450"></canvas><div id="showerCovTip"><p>Blue −1 · white 0 · orange +1</p></div></div>':'<p>Covariance unavailable.</p>'}</article></div>`;
 let p=d.dilution;
 let main=p?`<h2>Main detector dilution</h2>${table(['Category',...p.components.map(c=>names[c]||c)],p.rows.map(row=>[esc(row.category.replaceAll('_',' ')),...p.components.map(c=>{let v=row.components[c];return `<strong>${esc(percentError(v.dilution,v.dilution_standard_error))}</strong>`})]))}<h3>Main detector dilution correlations</h3><div class="matrixWrap"><canvas id="covMap" width="450" height="450"></canvas><div id="covTip"><p>Blue −1 · white 0 · orange +1</p></div></div>`:'<h2>Main detector dilution</h2><p>Unavailable for this selection.</p>';
 $('resultBody').innerHTML=overview+main;
 if(a)compactUncertainty(a.estimate,a.standard_error);
 if(hasCov)drawCov({dilution_covariance:a.fraction_covariance,coordinate_order:rows.map(r=>({category:'ShowerMax',component:r.channel}))},'showerCovMap','showerCovTip');
 if(p)drawCov(p);
}
function drawCov(p,id='covMap',tip='covTip'){let cv=$(id),cx=cv.getContext('2d'),n=p.dilution_covariance.length,w=cv.width/n;for(let i=0;i<n;i++)for(let j=0;j<n;j++){let v=p.dilution_covariance[i][j],den=Math.sqrt(p.dilution_covariance[i][i]*p.dilution_covariance[j][j]),r=den?v/den:0,a=Math.min(1,Math.abs(r)),color=r<0?[7,125,158]:[244,120,31];cx.fillStyle=`rgb(${color.map(c=>Math.round(255+(c-255)*a)).join(',')})`;cx.fillRect(j*w,i*w,w+.3,w+.3)}cv.onmousemove=e=>{let b=cv.getBoundingClientRect(),j=Math.min(n-1,Math.floor((e.clientX-b.left)/b.width*n)),i=Math.min(n-1,Math.floor((e.clientY-b.top)/b.height*n)),v=p.dilution_covariance[i][j],den=Math.sqrt(p.dilution_covariance[i][i]*p.dilution_covariance[j][j]);$(tip).innerHTML=`<p>${esc(p.coordinate_order[i].category)} · ${esc(names[p.coordinate_order[i].component])}<br>with ${esc(p.coordinate_order[j].category)} · ${esc(names[p.coordinate_order[j].component])}</p><p>Correlation: <strong>${den?fmt(v/den):'Undefined (zero variance)'}</strong><br>Covariance: ${fmt(v)} (fraction²)</p>`}}
function planeLabel(p){return p==='circle'?'ShowerMax PE response':p==='full_plane'?'ShowerMax virtual plane 30':p.replaceAll('_',' ')}
async function fetchMap(name,plane,tile=''){let key=[name,plane,tile].join('|');if(cache.has(key))return cache.get(key);let d=await api('maps',{run:name,plane,tile});cache.set(key,d);while(cache.size>5)cache.delete(cache.keys().next().value);return d}
async function loadMap(){
 let token=++mapRevision,plane=$('plane').value||'circle',tile=$('tile').value||'';
 $('identity').textContent='';$('mapScope').textContent='Loading saved map…';$('regionTable').innerHTML='';
 let d=await fetchMap(run,plane,tile);if(token!==mapRevision)return;mapData=d;
 $('plane').innerHTML=d.planes.map(p=>`<option value="${esc(p)}">${esc(planeLabel(p))}</option>`).join('');$('plane').value=d.planes.includes(plane)?plane:d.planes[0];
 $('tile').innerHTML='<option value="">Whole plane</option>'+d.tiles.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');$('tile').value=tile;
 if(!d.planes.includes(plane)&&d.planes.length){await loadMap();return}
 $('foldSectors').disabled=!!tile||!Number.isFinite(d.mirror_axis_rad);
 drawMaps(d);showMapDetails(d);
}
function dense(d){let a=new Float64Array(d.grid.nx*d.grid.ny);for(let[x,y,v]of d.bins)if(x>=0&&y>=0&&x<d.grid.nx&&y<d.grid.ny)a[y*d.grid.nx+x]+=v;return a}
function compactUncertainty(estimate,error){
 $('identity').textContent=error==null?'MC error unavailable':estimate>0?'MC ±'+fmt(error/estimate*100,3)+'%':'MC ±'+fmt(error,3);
 $('identity').title='One Monte Carlo standard error on the selected signal; model and normalization systematics are separate.';
}
function drawMaps(d=mapData){
 if(!d)return;let raw=dense(d),folded=$('foldSectors').checked&&!$('foldSectors').disabled;
 let display=folded?M.fold(raw,d.grid.nx,d.mirror_axis_rad):raw;
 $('mapTitle').textContent=folded?'Sector-pooled hit map':'Raw simulation';
 drawMap('rawMap',display,d.grid,Math.max(...display,1e-30),false,d.unit);
 let a=d.signal_summary||d.interaction_summary||{estimate:M.sum(raw),standard_error:null};
 compactUncertainty(a.estimate,a.standard_error);
 $('mapScope').innerHTML=`<strong>${fmt(a.estimate)}${a.standard_error==null?'':' ± '+fmt(a.standard_error,3)} ${esc(d.unit)}</strong>${d.normalization?.display_current_uA!=null?' · '+fmt(d.normalization.display_current_uA,3)+' µA':''}`;
 $('regionTable').innerHTML=regionPanel(d);
}
function regionPanel(d){
 const colors=['#077d9e','#f4781f','#455065','#239d93','#8b6aa7'],regions=['open','closed','transition'];
 let sources=d.contributions||[{target:d.metadata.target,channel:d.metadata.channel,regions:d.regions}];
 let rows=[],channels=[...new Set(sources.map(r=>r.channel))];
 for(let ch of channels){let parts=sources.filter(r=>r.channel===ch);rows.push({label:names[ch]||ch,values:regions.map(region=>{
  let values=parts.map(p=>p.regions?.available?p.regions.rows.find(r=>r.region===region):null);
  if(values.some(v=>!v))return null;
  return {estimate:M.sum(values.map(v=>v.estimate)),standard_error:values.every(v=>v.standard_error!=null)?Math.sqrt(M.sum(values.map(v=>v.standard_error**2))):null};
 })})}
 const missing=d.combination?.missing||[];
 for(let item of missing){let[target,ch]=item.split(': ');rows.push({label:(d.metadata.target==='optics_all'?targetLabel(target)+' · ':'')+(names[ch]||ch),values:[null,null,null],missing:true})}
 let values=rows.flatMap(r=>r.values.filter(Boolean)),max=Math.max(...values.map(v=>v.estimate),0);
 let power=max>0?Math.floor(Math.log10(max)/3)*3:0,scale=10**power;
 const cell=v=>v?`<strong>${fmt(v.estimate/scale)}</strong>${v.standard_error==null?'':`<small>± ${fmt(v.standard_error/scale,3)}</small>`}`:'<span class="unavailable">Unavailable</span>';
 let tableRows=rows.map((r,i)=>[`${r.missing?'':`<span class="processKey" style="background:${colors[i%colors.length]}"></span>`}${esc(r.label)}`,...r.values.map(cell)]);
 if(channels.length>1&&d.regions?.available)tableRows.push(['<strong>Included total</strong>',...d.regions.rows.map(cell)]);
 let note=values.some(v=>v.standard_error==null)?'Regional errors unavailable.':values.length?'± 1σ MC':'';
 if(!values.length)note=d.regions?.reason||'No saved region split for this selection.';
 return `<h2>${d.unit==='PE/s'?'Signal':'Rate'} by region</h2><p class="regionUnits">${power?`×10<sup>${power}</sup> `:''}${esc(d.unit)}${note==='± 1σ MC'?' · '+note:''}</p>${table(['Interaction','Open','Closed','Transition'],tableRows)}${note&&note!=='± 1σ MC'?`<p class="statusline">${esc(note)}</p>`:''}`;
}
function viridis(t){const stops=[[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];t=Math.max(0,Math.min(.999999,t))*4;let i=Math.floor(t),f=t-i;return stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*f))}
function drawMap(id,a,g,max,smooth,unit,support=null){let cv=$(id),cx=cv.getContext('2d'),L=65,T=20,S=445;cx.clearRect(0,0,cv.width,cv.height);cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);if(!a||!M.sum(a)){cx.fillStyle='#455065';cx.font='16px Calibri';cx.fillText(a?'No map recorded for this selection':'Choose a whole plane for folding',85,230);return}let im=cx.createImageData(S,S);for(let y=0;y<S;y++)for(let x=0;x<S;x++){let xx=(x+.5)/S*g.nx-.5,yy=(1-(y+.5)/S)*g.ny-.5,v=smooth&&g.nx===g.ny?M.sample(a,g.nx,xx,yy):a[Math.max(0,Math.min(g.ny-1,Math.round(yy)))*g.nx+Math.max(0,Math.min(g.nx-1,Math.round(xx)))],rgb=v>0&&(!support||support[Math.max(0,Math.min(g.ny-1,Math.round(yy)))*g.nx+Math.max(0,Math.min(g.nx-1,Math.round(xx)))])?viridis(Math.log1p(v/max*999)/Math.log(1000)):[255,255,255],k=(y*S+x)*4;im.data.set([...rgb,255],k)}cx.putImageData(im,L,T);cx.strokeStyle='#d9dee6';cx.strokeRect(L,T,S,S);cx.font='14px Calibri';cx.fillStyle='#455065';for(let i=0;i<=4;i++){let f=i/4,x=L+f*S,y=T+(1-f)*S;cx.textAlign='center';cx.fillText(Math.round(g.x[0]+f*(g.x[1]-g.x[0])),x,T+S+23);cx.textAlign='right';cx.fillText(Math.round(g.y[0]+f*(g.y[1]-g.y[0])),L-8,y+5)}cx.textAlign='center';cx.fillText((g.nx===16?'Local':'Global')+' x [mm]',L+S/2,T+S+53);cx.save();cx.translate(16,T+S/2);cx.rotate(-Math.PI/2);cx.fillText((g.nx===16?'Local':'Global')+' y [mm]',0,0);cx.restore();for(let y=0;y<S;y++){cx.fillStyle=`rgb(${viridis(1-y/S)})`;cx.fillRect(535,T+y,14,1)}cx.textAlign='left';cx.fillStyle='#455065';cx.fillText(fmt(max,3),555,30);cx.fillText('0',555,T+S);cx.fillText('log color · '+unit+'/bin',L,T+S+78);cv.onmousemove=e=>{let b=cv.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*cv.width,y=(e.clientY-b.top)/b.height*cv.height,i=Math.floor((x-L)/S*g.nx),j=Math.floor((1-(y-T)/S)*g.ny);cv.title=i>=0&&j>=0&&i<g.nx&&j<g.ny?fmt(a[j*g.nx+i])+' '+unit+'/bin':''}}
function showMapDetails(d){
 let dec=d.decomposition,k=d.kinematics?.calculated,parts=[],h=d.histograms?.available?d.histograms.data:null;
 if(h){
  parts.push(`<div class="cards">${card('Secondary share',h.secondary_fraction==null?'Unavailable':fmt(h.secondary_fraction*100)+'%',d.unit==='PE/s'?'Fraction of PE response':'Fraction of crossing rate')}${card('Crossings',h.entries.toLocaleString(),'Recorded sample')}${card('Mean kinetic energy',fmt(h.mean_mev)+' MeV','Signal weighted')}${card('Energy RMS',fmt(h.rms_mev)+' MeV','Signal weighted')}</div>`);
  parts.push('<div class="two histogramGrid"><article><h2>Secondary creation volumes</h2><p class="statusline"><strong>Share of secondary signal [%]</strong></p><div id="volumePlot"></div></article><article><h2>Kinetic energy at the detector</h2><canvas id="energyPlot" width="650" height="410"></canvas><p id="energyTail" class="statusline"></p></article></div>');
 }else{
  parts.push('<div class="empty"><strong>Creation-volume histogram unavailable</strong><br>'+esc(d.histograms?.reason||'No saved creation-volume analysis.')+'</div>');
  if(d.energy_spectra&&Object.keys(d.energy_spectra).length)parts.push('<h2>Historical ShowerMax energy spectrum</h2><p>'+esc(d.energy_scope)+'</p><canvas id="energyPlot" width="650" height="410"></canvas>');
 }
 if(k)parts.push(`<div class="cards">${card('Calculated asymmetry',fmt(k.asymmetry_ppb)+' ppb','± '+fmt(k.asymmetry_error_ppb)+' ppb (MC)')}${card('Kinematic factor K',fmt(k.kinematic_factor),'± '+fmt(k.kinematic_factor_error)+' (MC)')}</div>`);
 if(dec){let total=Object.values(dec.classes||{}).reduce((s,x)=>s+x.signal,0);parts.push('<details><summary>Origin and particle composition</summary>'+table(['Origin / particle','Signal fraction','Recorded crossings'],[...Object.entries(dec.classes||{}),...Object.entries(dec.particles||{})].map(([key,x])=>[esc(({'11':'Electron','22':'Photon','-11':'Positron','2112':'Neutron'})[key]||key),fmt(x.signal/(total||1)*100)+'%',fmt(x.hits)]))+'</details>')}
 if(d.track_kinematics)parts.push('<details><summary>Track kinematics</summary>'+table(['Coordinate','Mean','RMS'],Object.entries(d.track_kinematics.metrics||{}).filter(([key])=>!key.startsWith('gem_')).map(([key,v])=>[esc(key),fmt(v.mean),fmt(v.rms)]))+'</details>');
 $('mapDetails').innerHTML=parts.join('');
 if(h){drawVolumes(h);drawEnergy(h)}else if($('energyPlot')){
  let all=new Float64Array(62),sec=new Float64Array(62);for(let rows of Object.values(d.energy_spectra))for(let[b,h,hs,w,ws]of rows)if(b<60)all[b+1]+=w;
  drawEnergy({energy:all,secondary_energy:sec,weight:M.sum(all),legacy:true});
 }
}
function drawVolumes(h){
 const groups=h.volume_groups||h.volumes.map(([name,fraction])=>({name,fraction,members:[],volume_count:1})),max=Math.max(...groups.map(g=>g.fraction),1e-30);
 const row=g=>`<details class="volumeGroup"><summary class="volumeRow"><span>${esc(g.name)}</span><div class="volumeTrack"><i style="width:${g.fraction/max*100}%"></i></div><strong>${fmt(g.fraction*100,3)}%</strong></summary><div class="volumeMembers"><strong>${g.volume_count} exact volume${g.volume_count===1?'':'s'}</strong>${g.members.map(([n,f])=>`<div><span>${esc(n)}</span><b>${fmt(f*100,3)}%</b></div>`).join('')}${g.volume_count>3?`<small>Plus ${g.volume_count-3} volumes contributing ${fmt(g.remaining_fraction*100,3)}%. Largest three shown.</small>`:''}</div></details>`;
 $('volumePlot').innerHTML=h.secondary_weight?`<div class="volumeRows">${groups.slice(0,10).map(row).join('')}${groups.length>10?`<details class="smallerVolumes"><summary>Show ${groups.length-10} smaller components · ${fmt(M.sum(groups.slice(10).map(g=>g.fraction))*100,3)}%</summary>${groups.slice(10).map(row).join('')}</details>`:''}</div><small>${h.volume_count} creation volumes · grouped before ranking<br>Select a component to inspect its largest source volumes.</small>`:'<div class="empty">No secondary signal in this sample.</div>';
}
function drawEnergy(h){
 let cv=$('energyPlot'),cx=cv.getContext('2d'),L=72,R=625,T=65,B=325,total=h.weight||1,all=Array.from(h.energy).slice(1,61).map(v=>v/total*100),sec=Array.from(h.secondary_energy).slice(1,61).map(v=>v/total*100),max=Math.max(...all,.01)*1.12;
 cx.clearRect(0,0,650,410);cx.font='15px Calibri';cx.fillStyle='#455065';cx.fillText('Signal / bin [%]',L,22);
 for(let j=0;j<=4;j++){let y=B-j/4*(B-T);cx.strokeStyle='#d9dee6';cx.beginPath();cx.moveTo(L,y);cx.lineTo(R,y);cx.stroke();cx.textAlign='right';cx.fillText(fmt(max*j/4,3),L-9,y+5)}
 for(let j=-3;j<=4;j++){let x=L+(j+3)/7.30102999566*(R-L);cx.strokeStyle='#d9dee6';cx.beginPath();cx.moveTo(x,T);cx.lineTo(x,B);cx.stroke();cx.textAlign='center';cx.fillStyle='#455065';cx.fillText(j>=0?String(10**j):String(10**j),x,B+25)}
 for(let[a,color]of[[all,'#077d9e'],[sec,'#f4781f']]){cx.strokeStyle=color;cx.lineWidth=2.5;cx.beginPath();cx.moveTo(L,B);for(let i=0;i<60;i++){let y=B-a[i]/max*(B-T);cx.lineTo(L+i/60*(R-L),y);cx.lineTo(L+(i+1)/60*(R-L),y)}cx.lineTo(R,B);cx.stroke()}
 cx.textAlign='right';cx.fillStyle='#077d9e';cx.fillText('━ All crossings',R,20);if(!h.legacy){cx.fillStyle='#f4781f';cx.fillText('━ Secondaries',R,43)}
 cx.fillStyle='#455065';cx.textAlign='center';cx.fillText('Kinetic energy [MeV] · logarithmic bins',(L+R)/2,385);
 if($('energyTail'))$('energyTail').textContent=`Below 1 keV: ${fmt(h.energy[0]/total*100,3)}% · At least 20 GeV: ${fmt(h.energy[61]/total*100,3)}%`;
}
let eventBank=null,selectedSector=0,particleMode='all',streamClock=0,streamStats={},animationFramePending=false;
async function initTransport(){
 if(!$('trackRun').options.length){
  let d=await api('transport-catalog');$('animationSummary').innerHTML=`Based on <strong>${(d.sample_totals.histories_scanned/1e6).toFixed(2)} million simulated events</strong>, with <strong>${d.sample_totals.crossing_paths.toLocaleString()} sampled track paths</strong> across ${d.runs.length} configurations.`;$('trackRun').innerHTML=d.runs.map(r=>`<option value="${esc(r.name)}">${esc(targetLabel(r.target)+' · '+(+r.energy_mev/1000)+' GeV · '+(names[r.channel]||r.channel)+(r.target==='lh2'?'':' · sieve '+r.sieve))}</option>`).join('');
  if(!d.runs.length){$('transportNotice').textContent='No prepared particle transport is available.';return}
  let selected=catalog.runs.find(r=>r.name===run),choice=(selected?.members||[run]).find(n=>d.runs.some(r=>r.name===n));if(choice)$('trackRun').value=choice;
  await loadTracks();
 }else drawTracks();
 if(trackData&&tab==='transport')startStream();
}
async function loadTracks(){
 playing=false;$('play').textContent='Play';let name=$('trackRun').value;$('transportNotice').textContent='Loading particle paths…';trackData=null;
 let [d,g]=await Promise.all([api('transport',{name}),geo?Promise.resolve(geo):api('geometry')]);if($('trackRun').value!==name)return;
 $('transportNotice').textContent='';eventBank=d;geo=g;trackData=TransportStream.prepare(d);projectedTracks=null;sceneCache=null;selectedRing=0;selectedSector=0;streamClock=0;
 $('ringControls').innerHTML='<span>Detector</span><button data-ring="0" aria-pressed="true">All</button>'+g.rings.map(r=>`<button data-ring="${r.ring}" aria-pressed="false"><i style="background:${ringColors[r.ring-1]}"></i>${esc(r.name)}</button>`).join('');
 $('ringControls').onclick=e=>{let b=e.target.closest('button[data-ring]');if(b)selectDetector(+b.dataset.ring)};
 updateOrigins();
 $('transportScope').innerHTML='<strong>'+esc(targetLabel(d.meta.target)+' · '+(+d.meta.energy_mev/1000)+' GeV · '+(names[d.meta.channel]||d.meta.channel))+'</strong> · continuous particle stream';

 resetCamera();if(tab==='transport')startStream();
}
function startStream(){if(playing)return;playing=true;$('play').textContent='Pause';lastFrame=0;scheduleAnimation()}
function updateOrigins(){
 let before=$('trackOrigin').value,counts=new Map();for(let t of trackData.tracks)if(t.secondary&&(!trackData.weighted||!selectedRing||t.source.detector===selectedRing)){let v=t.source.creation_group||t.source.volume,w=trackData.weighted?t.source.weight+t.source.origin_weight:1;if(w>0)counts.set(v,(counts.get(v)||0)+w)}
 $('trackOrigin').innerHTML='<option value="all">All components</option>'+[...counts].sort((a,b)=>b[1]-a[1]).map(([v])=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(counts.has(before))$('trackOrigin').value=before;
}
function selectDetector(value){selectedRing=value;updateOrigins();for(let x of $('ringControls').querySelectorAll('button'))x.setAttribute('aria-pressed',String(+x.dataset.ring===selectedRing));selectedSector=0;sceneCache=null;drawTracks()}
$('particleMode').onclick=e=>{let b=e.target.closest('button[data-mode]');if(!b)return;particleMode=b.dataset.mode;for(let x of $('particleMode').querySelectorAll('button'))x.setAttribute('aria-pressed',String(x.dataset.mode===particleMode));$('originControl').hidden=particleMode!=='secondaries';drawTracks()};
$('trackOrigin').onchange=drawTracks;
// Developer-only geometry check. No inspection controls appear in the viewer.
function inspectTiles(sector=1){if(!selectedRing)selectDetector(5);selectedSector=sector;let r=geo.rings.find(r=>r.ring===selectedRing),tiles=r.tiles.filter(t=>t.sector===sector);if(!tiles.length)return;camera.center=[0,1,2].map(i=>M.sum(tiles.map(t=>t.center_mm[i]))/tiles.length/1000);camera.yaw=.85;camera.pitch=.15;camera.scale=selectedRing===7?360:420;camera.pan=[-120,20];sceneCache=null;drawTracks()}
const camera={yaw:-.35,pitch:.25,scale:110,pan:[-90,0],center:[0,0,22]};
const geometryColors={'target':'#f4781f','collimator':'#9baec2','toroid/magnet':'#31b1c3','GEM tracking':'#90ddeb','main detector':'#d6e2ed','showermax':'#c8d3e0'};
const ringColors=['#699bd3','#66b9d6','#81cfcd','#bdcfde','#f4781f','#d6b974','#78d3dc'];
let selectedRing=0,sceneCache=null,projectedTracks=null,headSprites=null,birthSprites=null;
function resetCamera(){
 camera.pan=[0,0];camera.center=[0,0,9.5];camera.scale=30;camera.yaw=0;camera.pitch=0;
 if($('camera').value==='orbit'){camera.yaw=-.22;camera.pitch=.45}
 if($('camera').value==='end'){camera.yaw=Math.PI/2;camera.scale=63}
 let focus=$('trackFocus').value;selectedSector=0;
 if(focus==='detectors'){camera.center=[0,0,22];camera.scale=$('camera').value==='end'?100:125;camera.pan=[-110,0]}
 else if(focus!=='all'&&geo?.info?.[focus]){camera.center=geo.info[focus].centroid_mm.map(v=>v/1000);camera.scale=focus==='target'?125:focus==='showermax'?145:65}
 drawTracks();
}
function project(p){return M.cameraPoint(p,camera)}
function depth(p){let z=p[2]-camera.center[2],x=p[0]-camera.center[0],y=p[1]-camera.center[1];return (-z*Math.sin(camera.yaw)+x*Math.cos(camera.yaw))*Math.cos(camera.pitch)-y*Math.sin(camera.pitch)}
function line(cx,a,b){cx.moveTo(a[0],a[1]);cx.lineTo(b[0],b[1])}
function surface(cx,points){cx.beginPath();cx.moveTo(...points[0]);for(let p of points.slice(1))cx.lineTo(...p);cx.closePath();cx.fill()}
function geometryProject(p,assembly){let shifts=geo.configurations?.[assembly],key=assembly==='targetLadder'?eventBank?.meta.target:eventBank?.meta.sieve,delta=shifts?.[key]||[0,0,0];return project(p.map((v,i)=>(v+delta[i])/1000))}
function makeScene(ratio){
 let cv=document.createElement('canvas');cv.width=1200*ratio;cv.height=550*ratio;let cx=cv.getContext('2d');cx.scale(ratio,ratio);
 let bg=cx.createLinearGradient(0,0,0,550);bg.addColorStop(0,'#0b1529');bg.addColorStop(1,'#182b45');cx.fillStyle=bg;cx.fillRect(0,0,1200,550);
 cx.lineWidth=.6;cx.strokeStyle='#2b4059';cx.beginPath();
 for(let z=-10;z<=30;z+=2)line(cx,project([-4,-3.2,z]),project([4,-3.2,z]));for(let x=-4;x<=4;x+=2)line(cx,project([x,-3.2,-10]),project([x,-3.2,30]));cx.stroke();
 cx.strokeStyle='#566b83';cx.setLineDash([8,9]);cx.beginPath();line(cx,project([0,0,-8]),project([0,0,28]));cx.stroke();cx.setLineDash([]);
 // Context structures recede; sensitive quartz volumes retain every edge.
 for(let group=0;group<geo.systems.length;group++){
  let name=geo.systems[group],important=!!geometryColors[name];cx.strokeStyle=geometryColors[name]||'#59728d';cx.globalAlpha=selectedSector?.09:important?(name==='showermax'?.26:.43):.16;cx.lineWidth=important?.85:.6;cx.beginPath();
  for(let i=0;i<geo.segments.length;i++){if(geo.groups[i]!==group)continue;let s=geo.segments[i];line(cx,geometryProject(s.slice(0,3),geo.assemblies?.[i]),geometryProject(s.slice(3,6),geo.assemblies?.[i]))}cx.stroke();
 }
 let faces=[];for(let r of geo.rings){let source=selectedSector?(r.ring===selectedRing?r.tiles.filter(t=>t.sector===selectedSector).flatMap(t=>t.faces.map(p=>({p,color:r.ring===7?ringColors[6]:t.center_mm[2]<r.center_mm[2]?'#78d3dc':'#f4781f'}))):[]):r.faces.map(p=>({p,color:ringColors[r.ring-1]}));for(let f of source){let p=f.p.map(v=>v.map(x=>x/1000));faces.push({ring:r.ring,p,color:f.color,d:M.sum(p.map(depth))/p.length})}}faces.sort((a,b)=>a.d-b.d);
 for(let f of faces){let active=!selectedRing||f.ring===selectedRing;cx.fillStyle=f.color;cx.globalAlpha=active?(selectedSector?.23:.16):.025;surface(cx,f.p.map(project))}
 for(let r of geo.rings){let active=!selectedRing||r.ring===selectedRing;cx.globalAlpha=active?.84:.13;cx.lineWidth=r.ring===selectedRing?1.8:1.05;
  if(selectedSector){if(r.ring===selectedRing)for(let tile of r.tiles.filter(t=>t.sector===selectedSector)){cx.strokeStyle=r.ring===7?ringColors[6]:tile.center_mm[2]<r.center_mm[2]?'#78d3dc':'#f4781f';cx.beginPath();for(let face of tile.faces)for(let i=0;i<face.length;i++)line(cx,project(face[i].map(x=>x/1000)),project(face[(i+1)%face.length].map(x=>x/1000)));cx.stroke()}}
  else{cx.strokeStyle=ringColors[r.ring-1];cx.beginPath();for(let s of r.segments)line(cx,project(s.slice(0,3).map(x=>x/1000)),project(s.slice(3,6).map(x=>x/1000)));cx.stroke()}
 }
 cx.globalAlpha=1;cx.font='15px Calibri, sans-serif';
 let placed=[];for(let [name,label,y]of [['target','Target',90],['toroid/magnet','Magnets',90],['GEM tracking','GEM planes',490],['main detector','Quartz rings',515],['showermax','ShowerMax',465]]){
  let info=geo.info?.[name];if(!info)continue;let c=project(info.centroid_mm.map(v=>v/1000)),w=cx.measureText(label).width;if(c[0]<30||c[0]>920||c[1]<15||c[1]>540)continue;let x=Math.max(20,Math.min(880-w,c[0]-w/2));if(placed.some(b=>Math.abs(b[0]-x)<w+20&&b[1]===y))continue;placed.push([x,y]);cx.strokeStyle=geometryColors[name];cx.globalAlpha=.45;cx.beginPath();line(cx,c,[x+w/2,y-12]);cx.stroke();cx.globalAlpha=1;cx.fillStyle='#101e33';cx.fillRect(x-6,y-17,w+12,23);cx.fillStyle=geometryColors[name];cx.fillText(label,x,y);
 }
 // A metric scale changes with zoom, without rescaling the geometry itself.
 let meters=camera.scale>170?.5:camera.scale>70?1:camera.scale>20?2:5,px=meters*camera.scale;cx.strokeStyle='#a0b4c9';cx.lineWidth=1.5;cx.beginPath();line(cx,[24,514],[24+px,514]);line(cx,[24,510],[24,518]);line(cx,[24+px,510],[24+px,518]);cx.stroke();cx.fillStyle='#a0b4c9';cx.fillText(meters+' m',24,539);
 return cv;
}
function drawInset(heads){
 const cv=$('ringInset'),cx=cv.getContext('2d'),ratio=Math.min(window.devicePixelRatio||1,2);if(cv.width!==240*ratio){cv.width=240*ratio;cv.height=240*ratio}cx.setTransform(ratio,0,0,ratio,0,0);cx.clearRect(0,0,240,240);
 const xy=p=>[120+p[0]/1000*67,120-p[1]/1000*67];
 for(let r of geo.rings.filter(r=>selectedRing===7?r.ring===7:r.ring<7)){let active=!selectedRing||r.ring===selectedRing;cx.fillStyle=ringColors[r.ring-1];cx.globalAlpha=active?.1:.015;for(let f of r.faces)surface(cx,f.map(xy));cx.strokeStyle=ringColors[r.ring-1];cx.lineWidth=active?.85:.5;cx.globalAlpha=active?.8:.13;cx.beginPath();for(let s of r.segments)line(cx,xy(s.slice(0,3)),xy(s.slice(3,6)));cx.stroke()}
 cx.globalAlpha=1;cx.font='12px Calibri, sans-serif';cx.textAlign='center';
 for(let r of geo.rings){if(r.ring===7||selectedRing&&r.ring!==selectedRing)continue;let theta=(195-r.ring*31)*Math.PI/180,rad=(r.r_mm[0]+r.r_mm[1])/2000*67,a=[120+rad*Math.cos(theta),120-rad*Math.sin(theta)],b=[120+108*Math.cos(theta),120-108*Math.sin(theta)];cx.strokeStyle=ringColors[r.ring-1];cx.beginPath();line(cx,a,b);cx.stroke();cx.fillStyle='#101e33';cx.beginPath();cx.arc(...b,8,0,2*Math.PI);cx.fill();cx.fillStyle=ringColors[r.ring-1];cx.fillText(String(r.ring),b[0],b[1]+4)}cx.textAlign='left';
 cx.globalAlpha=1;for(let h of heads){if(h.progress<.8)continue;cx.fillStyle=h.secondary?'#ffb573':'#77d1e1';let p=xy((h.impact||h.p).map(v=>v*1000));cx.beginPath();cx.arc(...p,1.4,0,2*Math.PI);cx.fill()}
 cx.strokeStyle='#647c95';cx.lineWidth=.7;cx.beginPath();line(cx,[114,120],[126,120]);line(cx,[120,114],[120,126]);cx.stroke();
 $('ringCaption').textContent=selectedRing===7?'ShowerMax quartz layers':selectedRing?'Ring '+selectedRing+' arrivals':'Main detector arrivals';$('insetTitle').textContent=selectedRing===7?'ShowerMax · along beam':'Main detector · along beam';
}
function drawTracks(){
 if(!trackData||!geo)return;
 let cv=$('tracks'),cx=cv.getContext('2d'),ratio=Math.min(window.devicePixelRatio||1,2),key=JSON.stringify([camera,selectedRing,selectedSector,ratio]);
 if(cv.width!==1200*ratio){cv.width=1200*ratio;cv.height=550*ratio}cx.setTransform(ratio,0,0,ratio,0,0);
 if(!sceneCache||sceneCache.key!==key)sceneCache={key,image:makeScene(ratio)};cx.drawImage(sceneCache.image,0,0,1200,550);
 if(!projectedTracks||projectedTracks.key!==key)projectedTracks={key,paths:trackData.tracks.map(t=>Array.from({length:7},(_,k)=>{let world=t.source.points.map(p=>TransportStream.rotate(p,k));return {world,screen:world.map(project),birth:project(TransportStream.rotate(t.source.vertex,k))}}))};
 TransportStream.configure(trackData,particleMode,$('trackOrigin').value,selectedRing);
 let energy=$('trackColor').value==='energy',buckets=Array.from({length:36},()=>[]),heads=[],births=[],moving=0,secondaries=0;
 for(let [j,t]of trackData.tracks.entries()){
  if(!TransportStream.visible(t,particleMode,$('trackOrigin').value)||trackData.weighted&&selectedRing&&t.source.detector!==selectedRing)continue;
  let phases=TransportStream.phases(t,streamClock);if(!phases.length)continue;
  for(let u of phases){moving+=7;if(t.secondary)secondaries+=7;let trail=t.secondary?.6:.24,lo=Math.max(0,u-trail);
   for(let k=0;k<7;k++){
    let path=projectedTracks.paths[j][k],head=null,worldHead=null;
    for(let i=1;i<t.times.length;i++){
     let ta=t.times[i-1],tb=t.times[i];if(ta>u)break;if(tb<lo||tb<=ta)continue;
     let a=path.screen[i-1],b=path.screen[i],f0=Math.max(0,(lo-ta)/(tb-ta)),f1=Math.min(1,(u-ta)/(tb-ta));
     let x0=a[0]+(b[0]-a[0])*f0,y0=a[1]+(b[1]-a[1])*f0,x1=a[0]+(b[0]-a[0])*f1,y1=a[1]+(b[1]-a[1])*f1;
     let gap=t.source.modes[i-1]===2,color=energy?Math.round(Math.max(0,Math.min(1,(Math.log10(Math.max(t.source.points[i][4],.01))+2)/6))*15):t.secondary?16:17;
     if(!(Math.max(x0,x1)<0||Math.min(x0,x1)>1200||Math.max(y0,y1)<0||Math.min(y0,y1)>550))buckets[color+(gap?18:0)].push(x0,y0,x1,y1);
     if(u>=ta&&u<tb){head=[x1,y1];worldHead=path.world[i-1].map((v,q)=>v+(path.world[i][q]-v)*f1)}
    }
    if(head&&head[0]>-5&&head[0]<1205&&head[1]>-5&&head[1]<555)heads.push({screen:head,p:worldHead,secondary:t.secondary,progress:u,impact:path.world.at(-1)});
    if(t.secondary&&u<.18)births.push({p:path.birth,age:u/.18});
   }
  }
 }
 for(let [style,lines]of buckets.entries()){
  if(!lines.length)continue;let color=style%18,gap=style>=18;
  cx.globalAlpha=gap?.13:color===17?.52:.34;cx.strokeStyle=color===16?'#ffae70':color===17?'#61c1d4':'rgb('+viridis(color/15)+')';cx.lineWidth=gap?.6:color===17?1.45:.9;cx.setLineDash(gap?[4,7]:[]);cx.beginPath();for(let i=0;i<lines.length;i+=4){cx.moveTo(lines[i],lines[i+1]);cx.lineTo(lines[i+2],lines[i+3])}cx.stroke();
 }
 cx.setLineDash([]);
 // Reuse tiny sprites: one enormous overlapping circle path becomes costly
 // precisely where a shower is dense. Sprite work stays linear in head count.
 if(!headSprites||headSprites.ratio!==ratio)headSprites={ratio,images:[false,true].map(secondary=>{let c=document.createElement('canvas');c.width=c.height=12*ratio;let x=c.getContext('2d');x.scale(ratio,ratio);for(let halo of [true,false]){x.globalAlpha=halo?.1:.86;x.fillStyle=halo?(secondary?'#ffae70':'#61c1d4'):(secondary?'#ffe1bd':'#bcf0f6');x.beginPath();x.arc(6,6,halo?(secondary?2.7:3.6):(secondary?.85:1.3),0,2*Math.PI);x.fill()}return c})};
 cx.globalAlpha=1;for(let h of heads)cx.drawImage(headSprites.images[+h.secondary],h.screen[0]-6,h.screen[1]-6,12,12);
 if(!birthSprites||birthSprites.ratio!==ratio)birthSprites={ratio,images:Array.from({length:6},(_,i)=>{let c=document.createElement('canvas');c.width=c.height=22*ratio;let x=c.getContext('2d');x.scale(ratio,ratio);x.strokeStyle='#ffbd83';x.globalAlpha=.6*(1-i/7);x.lineWidth=1.2;x.beginPath();x.arc(11,11,2+i*1.25,0,2*Math.PI);x.stroke();return c})};
 cx.globalAlpha=1;for(let b of births)cx.drawImage(birthSprites.images[Math.min(5,Math.floor(b.age*6))],b.p[0]-11,b.p[1]-11,22,22);

 drawInset(heads);streamStats={moving,secondaries,visibleHeads:heads.length};
 $('trackStageTitle').textContent=selectedRing?(selectedRing===7?'ShowerMax':'Ring '+selectedRing+' quartz'):'Continuous particle stream';
 $('trackLegend').innerHTML=energy?'Kinetic energy <span class="viridis"></span> 10 keV → 10 GeV':'<span><i class="trackKey primaryKey"></i>Primary</span><span><i class="trackKey secondaryKey"></i>Secondary</span><span>Expanding circles mark secondary births</span>';
 if(!$('geometryLegend').children.length)$('geometryLegend').innerHTML=Object.entries(geometryColors).filter(([name])=>name!=='main detector').map(([name,color])=>`<span><i style="background:${color}"></i>${esc(name)}</span>`).join('');
}
// Pointer capture keeps dragging smooth when the pointer leaves the canvas.
const pointers=new Map();let gesture,transportFramePending=false;
function queueTracks(){if(transportFramePending)return;transportFramePending=true;requestAnimationFrame(()=>{transportFramePending=false;drawTracks()})}
function gestureStart(){let points=[...pointers.values()];gesture={points,pan:camera.pan.slice(),scale:camera.scale,yaw:camera.yaw,pitch:camera.pitch}}
$('tracks').onpointerdown=e=>{e.preventDefault();$('tracks').focus({preventScroll:true});$('tracks').setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);gestureStart()};
$('tracks').onpointermove=e=>{
 if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);let points=[...pointers.values()],b=$('tracks').getBoundingClientRect(),sx=1200/b.width,sy=550/b.height;
 if(points.length===2&&gesture.points.length===2){let mid=a=>[(a[0][0]+a[1][0])/2,(a[0][1]+a[1][1])/2],a=mid(gesture.points),q=mid(points);camera.pan=[gesture.pan[0]+(q[0]-a[0])*sx,gesture.pan[1]+(q[1]-a[1])*sy];camera.scale=Math.max(8,Math.min(1800,gesture.scale*Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])/Math.max(1,Math.hypot(gesture.points[1][0]-gesture.points[0][0],gesture.points[1][1]-gesture.points[0][1]))))}
 else{let dx=points[0][0]-gesture.points[0][0],dy=points[0][1]-gesture.points[0][1];if(e.shiftKey||e.buttons===2||e.buttons===4)camera.pan=[gesture.pan[0]+dx*sx,gesture.pan[1]+dy*sy];else{camera.yaw=gesture.yaw+dx*.006;camera.pitch=Math.max(-1.5,Math.min(1.5,gesture.pitch+dy*.006))}}
 queueTracks();
};
for(let event of ['pointerup','pointercancel','lostpointercapture'])$('tracks').addEventListener(event,e=>{pointers.delete(e.pointerId);gestureStart()});
$('tracks').oncontextmenu=e=>e.preventDefault();
$('tracks').addEventListener('wheel',e=>{e.preventDefault();let b=$('tracks').getBoundingClientRect(),x=(e.clientX-b.left)*1200/b.width-600,y=(e.clientY-b.top)*550/b.height-275,scale=Math.max(8,Math.min(1800,camera.scale*Math.exp(-e.deltaY*.0015))),ratio=scale/camera.scale;camera.pan=[x-(x-camera.pan[0])*ratio,y-(y-camera.pan[1])*ratio];camera.scale=scale;queueTracks()},{passive:false});
$('tracks').onkeydown=e=>{let keys={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(keys[e.key]){e.preventDefault();let[x,y]=keys[e.key];if(e.shiftKey){camera.pan[0]+=x*25;camera.pan[1]+=y*25}else{camera.yaw+=x*.08;camera.pitch=Math.max(-1.5,Math.min(1.5,camera.pitch+y*.08))}queueTracks()}if(e.key==='Home'){e.preventDefault();resetCamera()}};
$('trackColor').onchange=drawTracks;
function scheduleAnimation(){if(animationFramePending)return;animationFramePending=true;requestAnimationFrame(animate)}
function animate(now){animationFramePending=false;if(playing&&tab==='transport'){if(lastFrame)streamClock+=Math.min(now-lastFrame,100)/18000*+$('speed').value;drawTracks()}lastFrame=now;if(playing)scheduleAnimation()}
$('run').onchange=()=>changeRun().catch(fail);document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));$('download').onclick=()=>resultData&&download('dilution_covariance.json',resultData);$('plane').onchange=()=>{$('tile').value='';loadMap().catch(fail)};$('tile').onchange=()=>loadMap().catch(fail);$('foldSectors').onchange=()=>{try{drawMaps()}catch(e){fail(e)}};$('trackRun').onchange=()=>loadTracks().catch(fail);$('camera').onchange=resetCamera;$('trackFocus').onchange=resetCamera;$('resetCamera').onclick=resetCamera;$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';if(playing){lastFrame=0;scheduleAnimation()}};$('restart').onclick=()=>{streamClock=0;lastFrame=0;drawTracks()};document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;$('play').textContent='Play'}});initialize();
