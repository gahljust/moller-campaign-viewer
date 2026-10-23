/* Tile PE distributions: exact weighted moments, compact saved histograms. */
(function(root){
'use strict';
const categories=[['all','All'],['primaries','Primaries'],['charged','Secondaries · charged'],['gamma','Secondaries · gamma']];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>x==null||!Number.isFinite(x)?'—':x===0?'0':Math.abs(x)>=1e4||Math.abs(x)<.01?x.toExponential(2):Number(x.toPrecision(3)).toString();
const label=r=>(r.system==='showermax'?'ShowerMax':'Ring '+r.system.slice(4))+' · '+r.detector+' · '+r.region;
function rebin(group,width,max){
 const size=1,step=size/width;
 if(!Number.isInteger(step)||step<1)throw new Error('Rebuild PE histograms with 1 PE bins.');
 const bins=Array(Math.max(1,Math.floor(max/size)+1)).fill(0);
 for(const [b,w] of group.bins)bins[Math.floor(b/step)]+=w;
 return {bins,width:size,max:bins.length*size};
}
function peTicks(max){
 const target=Math.max(1,max/5),base=10**Math.floor(Math.log10(target));
 const step=Math.max(1,[1,2,5,10].find(v=>v*base>=target)*base);
 const end=Math.ceil(max/step)*step;
 return {max:end,values:Array.from({length:Math.round(end/step)+1},(_,i)=>i*step)};
}
function histogram(group,width,max,title,color,log=false,key='all'){
 const header=`<header class="pePlotHeader"><h2>${title}</h2><label><input type="checkbox" data-pe-log="${key}" ${log?'checked':''}> Log Y</label></header>`;
 if(!group?.available)return `<article class="pePlot">${header}<div class="peEmpty">PE response unavailable</div></article>`;
 if(!(group.rate>0))return `<article class="pePlot">${header}<div class="peEmpty">No accepted entries</div></article>`;
 const d=rebin(group,width,max),xt=peTicks(d.max),W=430,H=250,left=80,right=416,top=18,bottom=204,plotW=right-left,plotH=bottom-top;
 const positive=d.bins.filter(v=>v>0),peak=Math.max(...positive)*1.12;
 const low=log?Math.floor(Math.log10(Math.min(...positive))):0,high=log?Math.max(low+1,Math.ceil(Math.log10(peak))):peak;
 const x=v=>left+v/xt.max*plotW;
 const y=v=>log?(v>0?bottom-(Math.log10(v)-low)/(high-low)*plotH:bottom):bottom-v/peak*plotH;
 const yValues=log?Array.from({length:high-low+1},(_,i)=>low+i).filter((v,i)=>i%Math.ceil((high-low)/5)===0||v===high).map(v=>10**v):Array.from({length:5},(_,i)=>peak*i/4);
 let grid='',ticks='';
 for(const v of yValues){const yy=y(v);grid+=`<path d="M${left} ${yy}H${right}"/>`;ticks+=`<text x="${left-7}" y="${yy+4}" text-anchor="end">${number(v)}</text>`;}
 for(const v of xt.values)ticks+=`<text x="${x(v)}" y="${bottom+18}" text-anchor="middle">${v.toLocaleString('en-US',{maximumFractionDigits:0})}</text>`;
 let path=`M${left} ${bottom}`;d.bins.forEach((v,i)=>{path+=`V${y(v)}H${x((i+1)*d.width)}`});path+=`V${bottom}Z`;
 const stats=[['Entries',group.entries.toLocaleString('en-US')],['Mean',number(group.mean)],['RMS',number(group.rms)],['RMS/Mean',number(group.rms_over_mean)]];
 return `<article class="pePlot">${header}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} PE histogram, ${log?'logarithmic':'linear'} Y axis. Mean ${number(group.mean)}, RMS ${number(group.rms)}, RMS over mean ${number(group.rms_over_mean)}."><g class="peGrid">${grid}</g><path d="${path}" fill="${color}" fill-opacity=".20" stroke="${color}" stroke-width="1.5"/><path d="M${left} ${top}V${bottom}H${right}" class="peAxis"/><g class="peTicks">${ticks}<text x="${(left+right)/2}" y="244" text-anchor="middle">PE / entry</text><text transform="translate(13 114) rotate(-90)" text-anchor="middle">Entry rate [s⁻¹ / 1 PE]</text></g><g class="peStatBox"><rect x="268" y="23" width="143" height="76" rx="3"/>${stats.map(([k,v],i)=>`<text x="277" y="39" dy="${i*17}">${k}</text><text x="403" y="39" dy="${i*17}" text-anchor="end"${i===3?' class="peRatio"':''}>${v}</text>`).join('')}</g></svg></article>`;
}
class AnalysisView{
 constructor(element,{load}){
  this.element=element;this.load=load;this.metric='current';this.plane='all_detectors';this.selected=null;this.sequence=0;this.logY={all:false,primaries:false,charged:false,gamma:false};
  element.innerHTML=`<div class="analysisHeading"><h1>Analysis</h1><span class="analysisScope"></span></div><div id="analysisCampaign"></div><div class="analysisControls"><label>Detector<select class="analysisPlane"><option value="all_detectors">All detectors</option>${[1,2,3,4,5,6].map(r=>`<option value="ring${r}">Ring ${r}</option>`).join('')}<option value="circle">ShowerMax</option></select></label><div class="segmented" role="group" aria-label="Tile colors"><button data-pe-metric="current" aria-pressed="true">Cathode Current</button><button data-pe-metric="ratio" aria-pressed="false">RMS/Mean</button></div><label class="analysisTileLabel">Tile<select class="analysisTile"><option value="">Select a tile</option></select></label></div><p class="analysisStatus" role="status"></p><div class="analysisWorkspace"><article class="analysisGeometry"><div class="analysisSurface surfaceMap"></div></article><article class="analysisDistributions"><div class="peDistributionHeader"><div class="peSelected">Select a tile</div><label><input type="checkbox" class="peLogAll"> Log Y · all plots</label></div><div class="pePlots"></div><p class="peScope"></p></article></div>`;
  element.querySelector('.peLogAll').onchange=e=>{for(const [key] of categories)this.logY[key]=e.target.checked;this.renderPlots();};
  this.surface=new HitMap3D.SurfaceView(element.querySelector('.analysisSurface'),{onSelect:det=>{this.selected=det;this.renderPlots();}});
  this.surface.element.querySelector('.surfaceNavigation>span').textContent='Click a tile to inspect';
  element.querySelector('.analysisPlane').onchange=e=>{this.plane=e.target.value;this.surface.selectedDetector=null;this.selected=null;this.surface.fit();this.render();};
  element.querySelector('.analysisTile').onchange=e=>{if(e.target.value)this.surface.selectDetector(+e.target.value);else this.surface.clearSelection();};
  element.querySelectorAll('[data-pe-metric]').forEach(b=>b.onclick=()=>{this.metric=b.dataset.peMetric;element.querySelectorAll('[data-pe-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));this.renderGeometry();});
 }
 async show(run){
  const ticket=++this.sequence;this.element.querySelector('.analysisStatus').textContent='Loading PE distributions…';
  try{const data=await this.load(run);if(ticket!==this.sequence)return;this.data=data;this.render();}
  catch(e){if(ticket!==this.sequence)return;this.data=null;this.surface.clear('Data unavailable');this.element.querySelector('.analysisStatus').textContent=e.message;this.element.querySelector('.pePlots').innerHTML='';}
 }
 rows(){return (this.data?.rows||[]).filter(r=>this.plane==='all_detectors'||(this.plane==='circle'?r.system==='showermax':r.system===this.plane));}
 render(){
  const d=this.data;if(!d)return;
  const select=this.element.querySelector('.analysisTile'),rows=this.rows();
  if(!rows.some(r=>r.detector===this.selected))this.selected=null;
  select.innerHTML='<option value="">Select a tile</option>'+rows.map(r=>`<option value="${r.detector}">${esc(label(r))}</option>`).join('');
  this.element.querySelector('.analysisScope').textContent='';
  this.element.querySelector('.analysisStatus').textContent=d.available?'':d.reason;
  this.renderGeometry();this.renderPlots();
 }
 renderGeometry(){
  const d=this.data;if(!d)return;if(!d.available){this.surface.clear(d.reason||'PE distributions unavailable');return;}const values={};
  for(const t of d.tiles||[]){const g=t.groups.all;values[t.detector]=this.metric==='current'?g.current_nA:g.rms_over_mean;}
  this.surface.setData({faces:d.faces,rows:d.rows,cells:[],cell_mm:10,plane:this.plane,tileValues:values,linear:this.metric==='ratio',unit:this.metric==='current'?'nA':'',total:d.available?1:0,
   legendLabel:this.metric==='current'?'Cathode current [nA] / tile · log color':'RMS/Mean · linear color'});
 }
 renderPlots(){
  const d=this.data,row=d?.rows.find(r=>r.detector===this.selected),tile=d?.tiles?.find(t=>t.detector===this.selected);
  this.element.querySelector('.analysisTile').value=this.selected??'';
  this.element.querySelector('.peSelected').textContent=row?label(row):'Select a tile';
  const plots=this.element.querySelector('.pePlots'),scope=this.element.querySelector('.peScope');
  if(!row){plots.innerHTML='<div class="pePickPrompt">Click a tile to see its PE distributions</div>';scope.textContent='';return;}
  if(!tile){plots.innerHTML='<div class="pePickPrompt">PE histograms unavailable for this selection</div>';scope.textContent='';return;}
  const max=Math.max(tile.bin_width,tile.groups.all.maximum);
  const shownCategories=row.system==='showermax'?categories:categories.filter(([key])=>key!=='gamma');
  plots.innerHTML=shownCategories.map(([key,title],i)=>histogram(tile.groups[key],tile.bin_width,max,title,['#077d9e','#455065','#e77c2b','#8b6aa7'][i],this.logY[key],key)).join('');
  plots.querySelectorAll('[data-pe-log]').forEach(box=>box.onchange=()=>{this.logY[box.dataset.peLog]=box.checked;this.renderPlots();});
  const all=this.element.querySelector('.peLogAll'),n=shownCategories.filter(([key])=>this.logY[key]).length;all.checked=n===shownCategories.length;all.indeterminate=n>0&&n<shownCategories.length;
  scope.textContent=(row.system==='showermax'?'Supported forward entries':'Forward e−/e+ · kinetic energy > 1.1 MeV')+' · RMS = standard deviation of expected PE.';
 }
}
const api={AnalysisView,rebin,peTicks,histogram};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TileAnalysis=api;
})(typeof window!=='undefined'?window:globalThis);
