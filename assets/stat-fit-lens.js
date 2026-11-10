/* Click-local PE range statistics and descriptive trend fits, entirely offline. */
(function(root){
'use strict';
const plots=root.ScalePlots;if(!plots)return;
const {unit}=root.PlotAxesMath,cat=plots.catalog,finite=Number.isFinite;
const escaped=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(v)?Number(v.toPrecision(4)).toString():'—';
const rate=v=>{const [scale,label]=v>=1e9?[1e9,'GHz']:v>=1e6?[1e6,'MHz']:v>=1e3?[1e3,'kHz']:[1,'s⁻¹'];return num(v/scale)+' '+label;};
const rgba=c=>`rgb(${c.slice(0,3).map(v=>Math.round(v*255)).join(',')})`;
const fits=new Map(),pending=new Map(),bound=new WeakSet();let active=null,serial=0,worker=null,clickTimer=null,placementQueued=false;
const menu=document.createElement('div');menu.className='fit-menu';menu.hidden=true;menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Curve fitting');document.body.append(menu);
const workerURL=new URL('fit-core.js',document.currentScript.src);
function receive(data){const s=pending.get(data.id);pending.delete(data.id);if(!s||s.ticket!==data.id||fits.get(keyOf(s))!==s)return;s.busy=false;s.result=data.result||null;s.error=data.error||null;if(s===active)renderResult();s.figure.requestDraw();}
try{worker=new Worker(workerURL);worker.onmessage=e=>receive(e.data);worker.onerror=()=>{worker.terminate();worker=null;if(active?.busy)compute();};}catch{/* file:// browsers can disallow workers; small fits still work offline. */}
function sourcePoints(line){
 if(line.fit.kind==='histogram'){const {edges,values}=line.fit;return values.map((y,i)=>[(edges[i]+edges[i+1])/2,y,edges[i],edges[i+1]]);}
 const x=cat.arrays[line.x],y=cat.arrays[line.y];return x.map((v,i)=>[v,y[i]]).filter(p=>p.every(v=>typeof v==='number'&&finite(v)));
}
function states(f,axis){return [f.states.get(axis.x.group),f.states.get(axis.y.group)];}
function position(f,axis,x,y){const [xs,ys]=states(f,axis),[a,b,w,h]=axis.rect;return [a+unit(x,xs)*w,b+(1-unit(y,ys))*h];}
function queuePlace(){if(placementQueued||menu.hidden)return;placementQueued=true;requestAnimationFrame(()=>{placementQueued=false;placeMenu();});}
function placeMenu(){
 if(menu.hidden||!active)return;
 const f=active.figure,b=f.img.getBoundingClientRect(),[x,y,w,h]=active.axis.rect;
 FitLayout.place(menu,{left:b.left+x*b.width/f.model.width-24,top:b.top+y*b.height/f.model.height-18,right:b.left+(x+w)*b.width/f.model.width+8,bottom:b.top+(y+h)*b.height/f.model.height+22});
}
function screenPoint(f,event){const b=f.img.getBoundingClientRect();return [(event.clientX-b.left)*f.model.width/b.width,(event.clientY-b.top)*f.model.height/b.height];}
function inverse(u,state){return state.mode==='log'?Math.exp(Math.log(state.domain[0])+u*Math.log(state.domain[1]/state.domain[0])):state.domain[0]+u*(state.domain[1]-state.domain[0]);}
function nearest(f,event){
 const axis=f.axisAt(event);if(!axis)return null;const [mx,my]=screenPoint(f,event),box=f.img.getBoundingClientRect(),sx=box.width/f.model.width,sy=box.height/f.model.height;
 const curves=[];
 for(const line of axis.lines){
  if(!line.fit||line.alpha===0)continue;
  // Preserve missing samples as gaps. A zoomed line may cross the plot even
  // when both of its saved endpoints are outside the visible axis range.
  const raw=line.fit.kind==='histogram'?sourcePoints(line):cat.arrays[line.x].map((x,i)=>[x,cat.arrays[line.y][i]]);
  const points=raw.map(p=>p.every(v=>typeof v==='number'&&finite(v))?position(f,axis,...p).map((v,i)=>v*(i?sy:sx)):[NaN,NaN]);
  curves.push({line,raw,points,stroke:line.stroke,width:line.width*sx,
   markerRadius:line.marker&&!['none',''].includes(String(line.marker).toLowerCase())?line.marker_size*sx/2:0});
 }
 const [a,b,w,h]=axis.rect,hit=root.FitPicking.nearest(curves,[mx*sx,my*sy],[a*sx,b*sy,(a+w)*sx,(b+h)*sy]);
 return hit?{figure:f,axis,line:hit.curve.line,point:hit.curve.raw[hit.index],distance:hit.distance}:null;
}
function removeHandles(s){s.handles?.forEach(h=>h.remove());s.handles=[];}
function keyOf(s){return s.figure.name+':'+s.figure.model.axes.indexOf(s.axis);}
function select(hit,event){
 if(active)removeHandles(active);
 const points=sourcePoints(hit.line),hist=hit.line.fit.kind==='histogram';
 const [xs]=states(hit.figure,hit.axis);let range=[Math.max(points[0][0],xs.domain[0]),Math.min(points.at(-1)[0],xs.domain[1])];
 if(hist){
  const i=points.indexOf(points.find(p=>p[0]===hit.point[0])),height=hit.point[1];let l=i,r=i;
  while(l>0&&points[l-1][1]>=height*.2)l--;
  while(r<points.length-1&&points[r+1][1]>=height*.2)r++;
  l=Math.max(0,l-2);r=Math.min(points.length-1,Math.max(r+2,l+5));range=[points[l][2],points[r][3]];
 }
 const previous=fits.get(keyOf(hit));
 active=previous?.line===hit.line?previous:{...hit,points,hist,range,model:hist?'gaussian':null,result:null};
 fits.set(keyOf(active),active);makeMenu(event);makeHandles(active);if(hist)compute();active.figure.requestDraw();
}
function makeMenu(event){
 active.layoutStamp=null;active.menuLocal=null;
 const s=active,meta=s.line.fit,names=s.hist?[['gaussian','Gaussian']]:[['auto','Auto'],['constant','Constant'],['power','Power law']];
 const label=s.hist?meta.label.split(' · ').slice(2).join(' · ').replace('Secondaries · charged','Charged secondaries'):meta.label;
 menu.setAttribute('aria-label',s.hist?'Gaussian fit':'Curve fitting');
 const note='Descriptive fit';
 const help='Least squares in original bin/point units. Gaussian is integrated over bins; σ is fitted width. No parameter error or confidence interval is calculated.';
 menu.innerHTML=`<div class="fit-menu-head"><div class="fit-name" title="${escaped(meta.label+' · '+(meta.component||''))}">${escaped(label||meta.label)}</div><button class="fit-close" aria-label="Close ${s.hist?'PE statistics':'fitting options'}">×</button></div>${names.length?`<div class="fit-actions">${names.map(([key,label])=>`<button data-fit="${key}" aria-pressed="${key===s.model}">${label}</button>`).join('')}</div>`:''}<div class="fit-sliders"><label>From<input type="range" aria-label="Fit interval start slider"><output></output></label><label>To<input type="range" aria-label="Fit interval end slider"><output></output></label></div><div class="fit-result" aria-live="polite"></div><div class="fit-footer"><span class="fit-note" title="${help}">${note}</span><button class="fit-clear">Clear</button></div>`;
 menu.querySelector('.fit-close').onclick=dismiss;menu.querySelector('.fit-clear').onclick=clear;
 menu.querySelectorAll('[data-fit]').forEach(b=>b.onclick=()=>{s.model=b.dataset.fit;menu.querySelectorAll('[data-fit]').forEach(q=>q.setAttribute('aria-pressed',String(q===b)));compute();});
 menu.querySelectorAll('.fit-sliders input').forEach((input,i)=>{
  input.min=s.hist?s.points[0][2]:s.points[0][0];input.max=s.hist?s.points.at(-1)[3]:s.points.at(-1)[0];input.step=s.hist?s.points[0][3]-s.points[0][2]:'any';
  input.oninput=()=>{const min=+input.min,max=+input.max,gap=+input.step||1e-6;
   s.range[i]=i?Math.min(max,Math.max(s.range[0]+gap,+input.value)):Math.max(min,Math.min(s.range[1]-gap,+input.value));
   if(s.model)compute();else renderResult();s.figure.requestDraw();};
 });
 menu.hidden=false;renderResult();
 queuePlace();
}
function dismiss(){menu.hidden=true;if(active)active.layoutStamp=null;}
function clear(){if(!active)return;const f=active.figure;removeHandles(active);fits.delete(keyOf(active));active=null;dismiss();f.requestDraw();}
function compute(){
 if(!active?.model)return;const s=active;s.ticket=++serial;s.error=null;
 s.busy=true;renderResult();
 pending.set(s.ticket,s);
 const message={id:s.ticket,input:{kind:s.model,range:s.range,points:s.points,histogram:s.hist}};
 if(worker)worker.postMessage(message);else setTimeout(()=>{try{receive({id:message.id,result:root.CurveFit.fit(message.input)})}catch(e){receive({id:message.id,error:e.message})}},0);
}
function renderResult(){
 if(!active)return;const s=active,out=menu.querySelector('.fit-result');if(!out)return;
 menu.dataset.fitState=s.busy?'fitting':s.error?'error':s.result?'ready':'select';menu.dataset.fitKind=s.result?.kind||'';
 menu.querySelectorAll('.fit-sliders input').forEach((input,i)=>{input.value=s.range[i];input.nextElementSibling.textContent=num(s.range[i])+(s.hist?' PE':' M');});
 if(s.busy){out.textContent='Fitting…';return;}if(s.error){out.textContent=s.error;return;}if(!s.result){out.textContent='';return;}
 const r=s.result,p=r.params;
 if(s.hist){
  const cells=[['Mean',num(r.mean)+' PE'],['σ',num(r.rms)+' PE'],['σ/Mean',r.mean>0?num(r.rms/r.mean):'—']];
  out.innerHTML=`<div class="fit-range-bar"><span>${num(r.range[0])}–${num(r.range[1])} PE</span><button class="fit-full">Full range</button></div><div class="fit-stats">${cells.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>${r.boundary?'<div>Fit reached a limit</div>':''}`;
  out.querySelector('.fit-full').onclick=e=>{e.stopPropagation();s.range=[s.points[0][2],s.points.at(-1)[3]];compute();};
 }else{
 const formula=r.kind==='constant'?`y = ${num(p[0])}`:r.kind==='power'?`y = ${num(p[0])} (N / ${num(p[2])})<sup>${num(-p[1])}</sup>`:r.kind==='gaussian'?'Gaussian':'Lognormal';
 const detail=s.hist?`Mean ${num(r.mean)} · width ${num(r.rms)} PE`:`N: ${num(r.range[0])}–${num(r.range[1])} M`;
 out.innerHTML=`<div class="fit-formula">${formula}</div><div class="fit-detail">${detail}</div>${r.boundary?'<div class="fit-detail">Fit reached search limit</div>':''}`;
 }
 queuePlace();
}
function makeHandles(s){
 removeHandles(s);s.handles=[0,1].map(i=>{
  const h=document.createElement('button');h.className='fit-range';h.setAttribute('aria-label',(s.hist?'PE range':'Fit interval')+(i?' end':' start'));h.dataset.fitEndpoint=i;
  h.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()});h.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation()});
  const change=x=>{const minimum=s.hist?s.points[0][2]:s.points[0][0],maximum=s.hist?s.points.at(-1)[3]:s.points.at(-1)[0];
   if(s.hist){
    const edges=s.line.fit.edges,other=edges.indexOf(s.range[1-i]);
    let index=edges.reduce((best,v,j)=>Math.abs(v-x)<Math.abs(edges[best]-x)?j:best,0);
    index=i?Math.max(other+1,index):Math.min(other-1,index);s.range[i]=edges[index];
    compute();return;
   }
   const required=3;
   const edge=i?s.points.filter(p=>p[0]>=s.range[0])[required-1]:s.points.filter(p=>p[0]<=s.range[1]).at(-required);
   if(!edge)return;
   const limit=s.hist?edge[i?3:2]:edge[0];
   s.range[i]=i?Math.max(limit,Math.min(maximum,x)):Math.min(limit,Math.max(minimum,x));
   compute();s.figure.requestDraw();
  };
  h.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;e.preventDefault();e.stopPropagation();h.setPointerCapture(e.pointerId);
   const move=q=>{const [x]=screenPoint(s.figure,q),[xs]=states(s.figure,s.axis),[left,,width]=s.axis.rect;change(inverse((x-left)/width,xs));};
   const end=()=>{h.removeEventListener('pointermove',move);h.removeEventListener('pointerup',end);h.removeEventListener('pointercancel',end);};
   h.addEventListener('pointermove',move);h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);
  });
  h.addEventListener('keydown',e=>{if(e.key==='Escape'){dismiss();h.blur();return;}if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const span=s.range[1]-s.range[0];change(s.range[i]+(e.key==='ArrowRight'?1:-1)*(s.hist?1:span*.05));});
  s.figure.element.append(h);return h;
 });
}
function drawFigure(f){
 for(const s of fits.values()){
  if(s.figure!==f)continue;if(!f.model.axes.includes(s.axis)){removeHandles(s);continue;}
  const ctx=f.ctx,[left,top,w,h]=s.axis.rect,css=f.img.clientWidth/f.model.width;
  const [xs]=states(f,s.axis),x=v=>left+unit(v,xs)*w;
  ctx.save();ctx.beginPath();ctx.rect(left,top,w,h);ctx.clip();
  if(s===active){ctx.fillStyle='#a329700b';ctx.fillRect(x(s.range[0]),top,x(s.range[1])-x(s.range[0]),h);}
  // Highlight only the selected measured trace; fitting never replaces data.
  ctx.strokeStyle=rgba(s.line.color);ctx.lineWidth=1.5/css;ctx.globalAlpha=.8;ctx.beginPath();let pen=false;
  for(const p of s.points){const q=position(f,s.axis,...p);if(!q.every(finite)||p[0]<s.range[0]||p[0]>s.range[1]){pen=false;continue;}
   if(s.hist){ctx.moveTo(q[0]+1.2/css,q[1]);ctx.arc(q[0],q[1],1.2/css,0,2*Math.PI);}
   else{if(pen)ctx.lineTo(...q);else ctx.moveTo(...q);pen=true;}
  }ctx.stroke();ctx.globalAlpha=1;
  if(s.result){
   const points=[];for(let i=0;i<=180;i++){const v=s.range[0]+i/180*(s.range[1]-s.range[0]);points.push(position(f,s.axis,v,root.CurveFit.predict(s.result,v,s.hist?s.points[0][3]-s.points[0][2]:1)));}
   for(const [color,width] of [['white',4],['#a32970',2]]){
    ctx.strokeStyle=color;ctx.lineWidth=width/css;ctx.setLineDash([5/css,3/css]);ctx.beginPath();pen=false;
    for(const q of points){if(!q.every(finite)){pen=false;continue;}if(pen)ctx.lineTo(...q);else ctx.moveTo(...q);pen=true;}ctx.stroke();
   }
  }
  if(s.result){
   const r=s.result,p=r.params;
   const lines=r.kind==='constant'?[`y = ${num(p[0])}`]:r.kind==='power'?[`y = ${num(p[0])} (N/${num(p[2])})^${num(-p[1])}`]:[`Fit μ = ${num(r.mean)} PE`,`σ = ${num(r.rms)} PE`];
   const font=Math.min(10/css,(w-20)/(Math.max(...lines.map(v=>v.length))*.62));
   ctx.font=`600 ${font}px Arial,sans-serif`;
   const size=[Math.max(...lines.map(v=>ctx.measureText(v).width))+4,lines.length*font*1.35+4],segments=[],boxes=[];
   const [,ys]=states(f,s.axis),project=(p,space)=>[left+(space[0]==='axes'?p[0]:unit(p[0],xs))*w,top+(1-(space[1]==='axes'?p[1]:unit(p[1],ys)))*h];
   for(const line of s.axis.lines){if(line.alpha===0)continue;let prev=null;const xx=cat.arrays[line.x],yy=cat.arrays[line.y];
    for(let i=0;i<xx.length;i++){const q=project([xx[i],yy[i]],line.space);if(!q.every(finite)){prev=null;continue;}
     if(prev)segments.push([prev[0]-left,prev[1]-top,q[0]-left,q[1]-top]);prev=q;}
   }
   for(const t of s.axis.texts){const q=project(t.position,t.space);if(q.every(finite))boxes.push([q[0]-left-10,q[1]-top-10,t.text.length*font*.5,font*1.4]);}
   const at=root.CurveFit.popoverBox({width:w,height:h,size,segments,boxes,anchor:[w,0]})||[8,8];
   ctx.setLineDash([]);ctx.lineWidth=3/css;ctx.strokeStyle='white';ctx.fillStyle='#c32732';ctx.textAlign='left';ctx.textBaseline='top';
   lines.forEach((line,i)=>{const px=left+at[0],py=top+at[1]+i*font*1.35;ctx.strokeText(line,px,py);ctx.fillText(line,px,py);});
  }
  if(s===active){ctx.strokeStyle='#a3297080';ctx.lineWidth=1/css;ctx.setLineDash([2/css,3/css]);for(const v of s.range){ctx.beginPath();ctx.moveTo(x(v),top);ctx.lineTo(x(v),top+h);ctx.stroke();}}
  ctx.restore();
  if(s===active){
   const py=(top+h-12/css)*f.img.clientHeight/f.model.height;
   s.handles?.forEach((handle,i)=>{const px=x(s.range[i])*css;handle.hidden=px<left*css||px>(left+w)*css;handle.style.left=px+'px';handle.style.top=py+'px';handle.title=num(s.range[i])+(s.hist?' PE':'M events');});
  }
 }
 if(active?.figure===f)queuePlace();
}
function attach(){
 for(const f of plots.figures.values()){
  if(bound.has(f))continue;bound.add(f);
  f.element.addEventListener('click',e=>{
   if(e.target.closest('button')||e.detail>1)return;const hit=nearest(f,e);if(!hit)return;
   clearTimeout(clickTimer);clickTimer=setTimeout(()=>select(hit,e),210);e.stopPropagation();
  });
  f.element.addEventListener('dblclick',()=>{clearTimeout(clickTimer);for(const [key,s]of fits){if(s.figure===f){removeHandles(s);fits.delete(key);if(active===s)active=null;}}dismiss();f.requestDraw();});
 }
}
document.addEventListener('click',e=>{if(!menu.contains(e.target))dismiss();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')dismiss();});
root.addEventListener('scroll',queuePlace,{passive:true});root.addEventListener('resize',queuePlace,{passive:true});
// A tall embedded sheet does not scroll when its containing page scrolls.
// Keep the popup in the portion of the iframe that is actually on screen.
try{let w=root;while(w.parent!==w){w=w.parent;w.addEventListener('scroll',queuePlace,{passive:true});w.addEventListener('resize',queuePlace,{passive:true});}}catch{}
root.visualViewport?.addEventListener('resize',queuePlace,{passive:true});
root.visualViewport?.addEventListener('scroll',queuePlace,{passive:true});
document.querySelector('[data-reset-plots]')?.addEventListener('dblclick',()=>{for(const s of fits.values()){removeHandles(s);s.figure.requestDraw();}fits.clear();active=null;dismiss();});
root.FitLens={drawFigure,dismiss,refresh:attach};attach();
})(window);
