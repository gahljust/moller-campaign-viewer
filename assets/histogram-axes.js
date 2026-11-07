/* Axis gestures for saved PE and energy bins. No rebinning or new statistics. */
(function(root){
'use strict';
const A=root.PlotAxesMath,NS='http://www.w3.org/2000/svg',charts=new Map();
if(!A)throw Error('Plot axis helpers are unavailable.');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=Number.isFinite;
function coordinates(model,states){
 const [l,t,w,h]=model.rect;
 return {x:v=>l+A.unit(v,states.x)*w,y:v=>t+h-A.unit(v,states.y)*h};
}
function binsPath(model,states){
 const {x,y}=coordinates(model,states),bottom=model.rect[1]+model.rect[3];
 let path='',open=false;
 for(let i=0;i<model.values.length;i++){
  const a=x(model.edges[i]),b=x(model.edges[i+1]),v=y(model.values[i]);
  if(!finite(a)||!finite(b)||!finite(v)){if(open)path+=`V${bottom}Z`;open=false;continue;}
  path+=open?`L${a} ${v}H${b}`:`M${a} ${bottom}V${v}H${b}`;open=true;
 }
 if(open)path+=`V${bottom}Z`;
 return path;
}
class Chart{
 constructor(svg,model){
  this.svg=svg;this.id='hist-clip-'+Chart.count++;this.set(model);
  svg.style.userSelect='none';svg.style.width='100%';svg.style.height='auto';
  svg.addEventListener('dblclick',e=>{
   if(e.target.closest('[data-plot-axis]'))return;
   const p=this.point(e),[x,y,w,h]=this.model.rect;
   if(p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h){e.preventDefault();this.reset();}
  });
 }
 set(model){
  this.model=model;this.states={};
  for(const d of ['x','y'])this.states[d]={domain:[...model[d].domain],mode:model[d].mode,original:model[d],remembered:{},touched:false};
  this.svg.querySelector('[data-hist-drawing]')?.remove();
  this.svg.querySelector('[data-plot-controls]')?.remove();
  this.drawing=document.createElementNS(NS,'g');this.drawing.setAttribute('data-hist-drawing','');this.svg.prepend(this.drawing);
  const controls=document.createElementNS(NS,'g');controls.setAttribute('data-plot-controls','');
  const [x,y,w,h]=model.rect;this.handles={};
  for(const d of ['x','y']){
   const handle=document.createElementNS(NS,'rect'),box=d==='x'?[x+6,y+h-4,w-6,28]:[x-51,y,57,h-5];
   ['x','y','width','height'].forEach((key,i)=>handle.setAttribute(key,box[i]));
   handle.setAttribute('fill','transparent');handle.setAttribute('data-plot-axis',d);handle.setAttribute('role','button');handle.setAttribute('tabindex','0');
   handle.setAttribute('aria-label',`${d.toUpperCase()} axis: wheel or pinch to zoom, drag to scale, double click for log, Escape to reset`);
   handle.style.touchAction='none';handle.style.cursor='default';this.handles[d]=handle;
   const state=this.states[d],values=d==='x'?model.edges:model.values;
   const toggle=()=>{A.toggle(state,values);this.draw();this.syncMode(d);};
   handle.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();if(e.shiftKey){A.reset(state);this.draw();this.syncMode(d);}else toggle();});
   handle.addEventListener('wheel',e=>{
    e.preventDefault();e.stopPropagation();if(this.gesture)return;
    state.domain=A.zoomRange(state,this.anchor(e,d),A.wheelFactor(e,this.svg.getBoundingClientRect()[d==='x'?'width':'height']));state.touched=true;this.request();
   },{passive:false});
   handle.addEventListener('gesturestart',e=>{e.preventDefault();e.stopPropagation();this.gesture={state,start:{mode:state.mode,domain:[...state.domain]},anchor:this.anchor(e,d)};},{passive:false});
   handle.addEventListener('gesturechange',e=>{if(!this.gesture||!finite(e.scale)||e.scale<=0)return;e.preventDefault();e.stopPropagation();const g=this.gesture;g.state.domain=A.zoomRange(g.start,g.anchor,1/e.scale);g.state.touched=true;this.request();},{passive:false});
   handle.addEventListener('gestureend',e=>{e.preventDefault();e.stopPropagation();this.gesture=null;},{passive:false});
   handle.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;e.preventDefault();handle.setPointerCapture(e.pointerId);
    const start={mode:state.mode,domain:[...state.domain]},origin=d==='x'?e.clientX:e.clientY;
    const r=this.svg.getBoundingClientRect(),extent=d==='x'?w*r.width/model.width:h*r.height/model.height;
    const move=v=>{const delta=d==='x'?v.clientX-origin:origin-v.clientY;if(Math.abs(delta)<3)return;state.domain=A.scaledRange(start,delta,extent);state.touched=true;this.request();};
    const end=()=>{handle.removeEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(name,end);};
    handle.addEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,end);
   });
   handle.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){toggle();}
    else if(e.key==='Escape'||e.key==='Home'){A.reset(state);this.draw();this.syncMode(d);}
    else if([d==='x'?'ArrowLeft':'ArrowDown',d==='x'?'ArrowRight':'ArrowUp'].includes(e.key)){state.domain=A.scaledRange(state,['ArrowRight','ArrowUp'].includes(e.key)?8:-8,200);state.touched=true;this.request();}
    else return;e.preventDefault();
   });
   controls.append(handle);
  }
  this.svg.append(controls);this.draw();
 }
 point(e){const r=this.svg.getBoundingClientRect();return {x:(e.clientX-r.left)*this.model.width/r.width,y:(e.clientY-r.top)*this.model.height/r.height};}
 anchor(e,d){const p=this.point(e),[x,y,w,h]=this.model.rect;return d==='x'?(p.x-x)/w:1-(p.y-y)/h;}
 syncMode(d){
  if(d!=='y')return;
  const key=this.svg.dataset.peKey;
  if(key)this.svg.dispatchEvent(new CustomEvent('plot-axis-mode',{bubbles:true,detail:{key,log:this.states.y.mode==='log'}}));
 }
 reset(){for(const s of Object.values(this.states))A.reset(s);this.draw();this.syncMode('y');}
 request(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.draw();});}
 draw(){
  const m=this.model,s=this.states,[l,t,w,h]=m.rect,b=t+h,r=l+w,{x,y}=coordinates(m,s);
  const xt=A.ticks(s.x,5).filter(v=>!m.integerX||Number.isInteger(v)),yt=A.ticks(s.y,4);
  const font=m.font||11,pad=m.font?9:7;let grid='',labels='';
  for(const v of yt){grid+=`<path d="M${l} ${y(v)}H${r}"/>`;labels+=`<text x="${l-pad}" y="${y(v)+4}" text-anchor="end">${A.label(v)}</text>`;}
  for(const v of xt){grid+=`<path d="M${x(v)} ${t}V${b}"/>`;labels+=`<text x="${x(v)}" y="${b+font+7}" text-anchor="middle">${m.integerX?v.toLocaleString('en-US'):A.label(v)}</text>`;}
  this.drawing.innerHTML=`<defs><clipPath id="${this.id}"><rect x="${l}" y="${t}" width="${w}" height="${h}"/></clipPath></defs><g stroke="#d9dee6" stroke-width=".7" fill="none">${grid}</g><g clip-path="url(#${this.id})"><path d="${binsPath(m,s)}" fill="${m.fill===false?'none':m.color}" fill-opacity=".20" stroke="${m.color}" stroke-width="${m.font?2.5:1.5}"/></g><path d="M${l} ${t}V${b}H${r}" fill="none" stroke="#455065"/><g fill="#455065" font-size="${font}">${labels}<text x="${(l+r)/2}" y="${m.height-6}" text-anchor="middle">${esc(m.xLabel)}</text>${m.font?`<text x="${l}" y="22">${esc(m.yLabel)}</text>`:`<text transform="translate(13 ${(t+b)/2}) rotate(-90)" text-anchor="middle">${esc(m.yLabel)}</text>`}</g>`;
  for(const d of ['x','y']){this.handles[d].dataset.mode=s[d].mode;this.handles[d].dataset.range=JSON.stringify(s[d].domain);}
  this.onDraw?.();
 }
}
Chart.count=0;
function mount(svg,model){let c=charts.get(svg);if(c)c.set(model);else{c=new Chart(svg,model);charts.set(svg,c);}return c;}
function scan(){
 for(const [svg]of charts)if(!svg.isConnected)charts.delete(svg);
 for(const svg of document.querySelectorAll('svg[data-histogram]'))if(!charts.has(svg))mount(svg,JSON.parse(svg.dataset.histogram));
}
function energy(element,model){
 let wrapper=element;
 if(element.tagName.toLowerCase()!=='div'){wrapper=document.createElement('div');wrapper.id=element.id;element.replaceWith(wrapper);}
 let svg=wrapper.querySelector('svg');
 if(!svg){svg=document.createElementNS(NS,'svg');svg.setAttribute('role','img');wrapper.append(svg);}
 wrapper.hidden=false;svg.setAttribute('viewBox',`0 0 ${model.width} ${model.height}`);svg.setAttribute('aria-label','Secondary kinetic energy histogram');mount(svg,model);
}
root.HistogramAxes={energy,binsPath,coordinates,get:svg=>charts.get(svg)};
document.addEventListener('dblclick',e=>{
 if(e.target.closest('h1')){e.preventDefault();for(const c of charts.values())c.reset();return;}
 const header=e.target.closest('header');if(!header)return;
 const plot=header.closest('.pePlot');if(plot){e.preventDefault();const c=charts.get(plot.querySelector('svg'));if(c)c.reset();}
});
new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('svg[data-histogram]')||n.querySelector?.('svg[data-histogram]')))))scan();}).observe(document.body,{childList:true,subtree:true});
scan();
})(window);
