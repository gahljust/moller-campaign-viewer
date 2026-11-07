/* Descriptive Gaussian fits to saved PE bins; controls never cover the plot. */
(function(){
'use strict';
const fits=new WeakMap(),NS='http://www.w3.org/2000/svg';let active=null,timer;
const fmt=x=>Number(x).toLocaleString('en-US',{maximumSignificantDigits:4});
const box=document.createElement('form');box.className='peFitBox';box.hidden=true;box.setAttribute('aria-label','Gaussian fit');
box.innerHTML='<header><strong>Gaussian fit</strong><button type="button" class="fitClose" aria-label="Close fit controls">×</button></header><div class="peFitRange"><label>From<input aria-label="Fit lower PE" type="number" step="1" required></label><label>To<input aria-label="Fit upper PE" type="number" step="1" required></label><span>PE</span></div><label class="fitSlider">From<input aria-label="Fit lower PE slider" type="range"></label><label class="fitSlider">To<input aria-label="Fit upper PE slider" type="range"></label><div class="peFitActions"><button type="submit">Fit</button><button type="button" class="fitFull">Full range</button><button type="button" class="fitClear">Clear</button></div><output aria-live="polite"></output>';
box.title='Descriptive Gaussian fit to bin rates; least squares, integrated over each bin. σ is fitted width, not an error on the mean.';
document.body.append(box);
const numbers=[...box.querySelectorAll('input[type=number]')],sliders=[...box.querySelectorAll('input[type=range]')];
function place(){if(!box.hidden&&active){if(!active.chart.svg.isConnected){box.hidden=true;return;}FitLayout.place(box,active.chart.svg.getBoundingClientRect());}}
function draw(chart,state){
 chart.svg.querySelector('[data-pe-fit-curve]')?.remove();chart.svg.querySelector('[data-pe-fit-label]')?.remove();
 if(state.model!==chart.model){state.result=null;if(active===state)box.hidden=true;return;}
 if(!state.result)return;
 const {x,y}=HistogramAxes.coordinates(chart.model,chart.states),r=state.result,[l,t,w,h]=chart.model.rect;
 const width=chart.model.edges[1]-chart.model.edges[0];let path='',previous=null;const segments=[],boxes=[];
 for(let i=0;i<=300;i++){
  const value=r.range[0]+(r.range[1]-r.range[0])*i/300,px=x(value),py=y(CurveFit.predict(r,value,width));
  if(Number.isFinite(px)&&Number.isFinite(py)){path+=(path?'L':'M')+px+' '+py;if(previous)segments.push([previous[0]-l,previous[1]-t,px-l,py-t]);previous=[px,py];}
 }
 const group=document.createElementNS(NS,'g');group.dataset.peFitCurve='';group.setAttribute('clip-path',`url(#${chart.id})`);group.style.pointerEvents='none';
 group.innerHTML=`<path d="${path}" fill="none" stroke="#c32732" stroke-width="2"/>`;chart.drawing.append(group);
 // Avoid the histogram's filled area as well as the existing moment box.
 for(let i=0;i<chart.model.values.length;i++){
  const a=x(chart.model.edges[i]),b=x(chart.model.edges[i+1]),v=y(chart.model.values[i]);
  if([a,b,v].every(Number.isFinite)&&b>l&&a<l+w)boxes.push([Math.max(l,a)-l,Math.max(t,v)-t,Math.min(l+w,b)-Math.max(l,a),Math.max(0,t+h-Math.max(t,v))]);
 }
 const stats=chart.svg.querySelector('.peStatBox');if(stats){const b=stats.getBBox();boxes.push([b.x-l,b.y-t,b.width,b.height]);}
 const lines=[`Fit μ = ${fmt(r.mean)} PE`,`σ = ${fmt(r.rms)} PE`,`σ/μ = ${r.mean>0?fmt(r.rms/r.mean):'—'}`];
 const size=[Math.max(...lines.map(s=>s.length))*6.3,43];
 const at=CurveFit.popoverBox({width:w,height:h,size,segments,boxes,anchor:[w,0]})||[8,8];
 const label=document.createElementNS(NS,'g');label.dataset.peFitLabel='';label.style.pointerEvents='none';
 lines.forEach((s,i)=>{const text=document.createElementNS(NS,'text');text.setAttribute('x',l+at[0]);text.setAttribute('y',t+at[1]+12+i*14);text.setAttribute('fill','#c32732');text.setAttribute('font-size','12');text.setAttribute('font-weight','600');text.setAttribute('stroke','white');text.setAttribute('stroke-width','2.5');text.setAttribute('paint-order','stroke');text.textContent=s;label.append(text);});
 chart.drawing.append(label);place();
}
function sync(){numbers.forEach((input,i)=>input.value=active.range[i]);sliders.forEach((input,i)=>input.value=active.range[i]);}
function compute(){
 if(!active)return;const state=active,chart=state.chart,edges=chart.model.edges,output=box.querySelector('output');
 try{
  const points=chart.model.values.map((v,i)=>[(edges[i]+edges[i+1])/2,v,edges[i],edges[i+1]]);
  state.result=CurveFit.fit({kind:'gaussian',histogram:true,points,range:state.range});
  const r=state.result;output.textContent=r.boundary?'Fit reached a limit':'';
 }catch(error){state.result=null;output.textContent=error.message;}
 draw(chart,state);place();
}
function open(svg){
 const chart=HistogramAxes.get(svg);if(!chart)return;
 let state=fits.get(svg);const edges=chart.model.edges,domain=chart.states.x.domain;
 if(!state||state.model!==chart.model){state={chart,model:chart.model,result:null,range:[Math.max(edges[0],Math.ceil(domain[0])),Math.min(edges.at(-1),Math.floor(domain[1]))]};fits.set(svg,state);chart.onDraw=()=>draw(chart,state);}
 active=state;numbers.concat(sliders).forEach(input=>{input.min=edges[0];input.max=edges.at(-1);input.step=edges[1]-edges[0];});sync();box.hidden=false;box.querySelector('output').textContent='';place();
}
function change(i,value){
 if(!active)return;const edges=active.chart.model.edges,step=edges[1]-edges[0];
 const snapped=edges.reduce((best,v)=>Math.abs(v-value)<Math.abs(best-value)?v:best,edges[0]);
 active.range[i]=i?Math.max(active.range[0]+step,snapped):Math.min(active.range[1]-step,snapped);sync();compute();
}
sliders.forEach((input,i)=>input.oninput=()=>change(i,+input.value));numbers.forEach((input,i)=>input.onchange=()=>change(i,+input.value));
box.onsubmit=e=>{e.preventDefault();compute();};
box.querySelector('.fitClose').onclick=()=>box.hidden=true;
box.querySelector('.fitClear').onclick=()=>{if(!active)return;active.result=null;box.querySelector('output').textContent='';draw(active.chart,active);};
box.querySelector('.fitFull').onclick=()=>{if(!active)return;const e=active.chart.model.edges;active.range=[e[0],e.at(-1)];sync();compute();};
document.addEventListener('click',e=>{
 const svg=e.target.closest('.pePlots svg[data-pe-key]');if(!svg||e.target.closest('[data-plot-axis],.peStatBox'))return;
 const chart=HistogramAxes.get(svg);if(!chart)return;
 const p=chart.point(e),[x,y,w,h]=chart.model.rect;if(p.x<x||p.x>x+w||p.y<y||p.y>y+h)return;
 clearTimeout(timer);timer=setTimeout(()=>{if(svg.isConnected)open(svg);},240);
});
document.addEventListener('dblclick',()=>clearTimeout(timer));
document.addEventListener('keydown',e=>{if(e.key==='Escape')box.hidden=true;});
document.addEventListener('scroll',place,true);addEventListener('resize',place);
new MutationObserver(()=>{if(active&&!active.chart.svg.isConnected)box.hidden=true;}).observe(document.body,{childList:true,subtree:true});
})();
