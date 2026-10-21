/* Detector-resolved surface heat maps. WebGL draws binned signal, never tracks. */
(function(root){
'use strict';
// Current magnitude at the photocathode, before PMT multiplication. Exact SI charge.
function displaySignal(unit,display='current'){if(unit==='PE/s'&&display==='pe')return {factor:1,unit,label:'PE rate'};return unit==='PE/s'?{factor:1.602176634e-10,unit:'nA',label:'Cathode current'}:{factor:1,unit,label:'Rate'}}
const regions=['closed','transition','open'],directions=['forward','backward','zero','uncertain'];
const sum=(a,b)=>a.map((v,i)=>v+b[i]),scale=(a,s)=>a.map(v=>v*s);
function viridis(t){const s=[[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];t=Math.max(0,Math.min(.999999,t))*4;const i=Math.floor(t),f=t-i;return s[i].map((v,k)=>(v+(s[i+1][k]-v)*f)/255)}
function aggregate(products,{secondary=false,source=null,region='all',momentum='all',mode='0',plane='main_detector'}={}){
 const first=products[0];if(!first)return null;
 const cells=new Map(),selected=Array.isArray(source)?new Set(source):source==null?null:new Set([source]);
 let total=0;
 for(const data of products){
  if(data.faces.length!==first.faces.length||data.cell_mm!==first.cell_mm)throw Error('Surface geometry mismatch');
  const column=mode==='2'?7:6;
  for(const c of data.cells){
   if(secondary&&c[3]<0)continue;
   if(selected&&(c[3]<0||!selected.has(data.sources[c[3]])))continue;
   if(region!=='all'&&regions[c[4]]!==region)continue;
   if(momentum!=='all'&&directions[c[5]]!==momentum)continue;
   const f=data.faces[c[0]];
   if(plane.endsWith('_bf')&&f.detector>=150000||plane.endsWith('_ff')&&f.detector<150000)continue;
   const value=c[column];if(value<=0)continue;
   const key=c.slice(0,3).join(',');const old=cells.get(key);
   if(old)old[3]+=value;else cells.set(key,[c[0],c[1],c[2],value]);total+=value;
  }
 }
 return {faces:first.faces,rows:first.rows,cell_mm:first.cell_mm,cells:[...cells.values()],total,plane,
  unit:plane==='circle'||mode==='2'?'PE/s':'crossings/s',linear:secondary};
}
function clipCell(face,x,y,size){
 let p=[[x*size,y*size],[(x+1)*size,y*size],[(x+1)*size,(y+1)*size],[x*size,(y+1)*size]];
 const boundary=face.polygon;
 let area=0;for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];area+=a[0]*b[1]-b[0]*a[1]}
 const sign=area>=0?1:-1;
 for(let i=0;i<boundary.length&&p.length;i++){
  const a=boundary[i],b=boundary[(i+1)%boundary.length],side=q=>sign*((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]));
  const out=[];
  for(let j=0;j<p.length;j++){const u=p[j],v=p[(j+1)%p.length],du=side(u),dv=side(v),inside=du>=-1e-8;
   if(inside)out.push(u);if(inside!==(dv>=-1e-8)){const t=du/(du-dv);out.push([u[0]+t*(v[0]-u[0]),u[1]+t*(v[1]-u[1])])}}
  p=out;
 }
 return p;
}
function point(face,uv,outset=0){return face.origin.map((v,i)=>v+face.u[i]*uv[0]+face.v[i]*uv[1]+face.normal[i]*outset)}
// Screen-space anchoring keeps the point under the pointer stationary while zooming.
function zoomCamera(zoom,pan,next,anchor=[0,0],center=false){
 const value=Math.max(.3,Math.min(32,next)),ratio=value/zoom;
 return {zoom:value,pan:anchor.map((a,i)=>(center?0:a)-(a-pan[i])*ratio)};
}
class SurfaceView{
 constructor(element){
  this.element=element;this.yaw=Math.PI+.45;this.pitch=.22;this.zoom=1;this.pan=[0,0];this.exploded=false;this.meshes=[];this.data=null;this.pending=false;this.dragMode='rotate';this.camera={yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,pan:[...this.pan]};
  element.innerHTML=`<div class="surfaceToolbar"><div role="group" aria-label="Camera view"><button data-camera="oblique" aria-pressed="true">Oblique</button><button data-camera="upstream" aria-pressed="false">Upstream</button><button data-camera="downstream" aria-pressed="false">Downstream</button></div><label><input type="checkbox"> Exploded</label></div><div class="surfaceNavigation"><div role="group" aria-label="Drag action"><button data-drag="rotate" aria-pressed="true">Rotate</button><button data-drag="pan" aria-pressed="false">Pan</button></div><span>Double click to focus</span><div role="group" aria-label="Zoom"><button data-zoom="out" aria-label="Zoom out">−</button><button data-zoom="in" aria-label="Zoom in">+</button><button data-zoom="fit">Fit</button></div></div><div class="surfaceStage"><canvas tabindex="0" aria-label="3D detector hit map. Drag to rotate or choose Pan. Right drag or shift drag pans. Scroll zooms at the pointer. Double click focuses. Arrow keys rotate; shift arrows pan; Home fits."></canvas><div class="surfaceMessage" role="status"></div><div class="surfaceLegend"><div class="surfaceRamp"></div><div class="surfaceEnds"><span>0</span><span class="surfaceMaximum"></span></div><span class="surfaceUnit"></span></div><span class="surfaceHelp">Scroll to zoom · Shift drag to pan</span></div>`;
  this.canvas=element.querySelector('canvas');this.message=element.querySelector('.surfaceMessage');
  this.gl=this.canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true});
  if(!this.gl){this.message.textContent='This browser does not support WebGL 2.';return;}
  const gl=this.gl;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
  const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
   in vec3 position; in vec3 color; out vec3 rgb;
   uniform vec2 angle; uniform vec2 screen; uniform vec2 pan; uniform float zoom;
   void main(){float cy=cos(angle.x),sy=sin(angle.x),cp=cos(angle.y),sp=sin(angle.y);
    vec3 p=vec3(cy*position.x+sy*position.z,position.y,-sy*position.x+cy*position.z);
    p=vec3(p.x,cp*p.y-sp*p.z,sp*p.y+cp*p.z);float d=6.-p.z;float s=min(screen.x,screen.y)/3.05*zoom;
    gl_Position=vec4(12.*s*p.x/screen.x+2.*pan.x/screen.x*d,12.*s*p.y/screen.y-2.*pan.y/screen.y*d,1.004008*d-.2004008,d);rgb=color;}`);
  const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
   precision highp float;in vec3 rgb;out vec4 outputColor;void main(){outputColor=vec4(rgb,1.);}`);
  this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  this.uniforms=Object.fromEntries(['angle','screen','pan','zoom'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
  element.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{this.yaw=b.dataset.camera==='oblique'?Math.PI+.45:b.dataset.camera==='upstream'?0:Math.PI;this.pitch=b.dataset.camera==='oblique'?.22:0;this.zoom=1;this.pan=[0,0];element.querySelectorAll('[data-camera]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));this.draw()});
  element.querySelector('input').onchange=e=>{this.exploded=e.target.checked;if(this.data)this.setData(this.data);};
  element.querySelectorAll('[data-drag]').forEach(b=>b.onclick=()=>{this.dragMode=b.dataset.drag;element.querySelectorAll('[data-drag]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  element.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{if(b.dataset.zoom==='fit')this.fit();else this.zoomAt(this.zoom*(b.dataset.zoom==='in'?1.5:1/1.5));});
  const position=e=>{const r=this.canvas.getBoundingClientRect();return [e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2]};
  const pointers=new Map();let drag=null;
  const pair=()=>{const p=[...pointers.values()];return {center:[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2],distance:Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1])}};
  this.canvas.oncontextmenu=e=>e.preventDefault();
  this.canvas.onpointerdown=e=>{if(e.button>2)return;e.preventDefault();this.canvas.focus({preventScroll:true});pointers.set(e.pointerId,position(e));drag={x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button===1||e.button===2||this.dragMode==='pan'};this.canvas.classList.add('dragging');this.canvas.setPointerCapture(e.pointerId)};
  this.canvas.onpointermove=e=>{if(!pointers.has(e.pointerId))return;
   if(pointers.size===2){const before=pair();pointers.set(e.pointerId,position(e));const after=pair();if(before.distance>0)this.zoomAt(this.zoom*after.distance/before.distance,before.center);this.pan=this.pan.map((v,i)=>v+after.center[i]-before.center[i]);this.draw();return;}
   pointers.set(e.pointerId,position(e));if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
   if(drag.pan||e.shiftKey){this.pan[0]+=dx;this.pan[1]+=dy}else{this.yaw+=dx*.006;this.pitch=Math.max(-1.5,Math.min(1.5,this.pitch+dy*.006));}
   drag.x=e.clientX;drag.y=e.clientY;this.draw();};
  this.canvas.onpointerup=this.canvas.onpointercancel=this.canvas.onlostpointercapture=e=>{pointers.delete(e.pointerId);drag=null;if(!pointers.size)this.canvas.classList.remove('dragging');};
  this.canvas.addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.canvas.clientHeight:1);this.zoomAt(this.zoom*Math.exp(-Math.max(-500,Math.min(500,delta))*.0018),position(e));},{passive:false});
  this.canvas.ondblclick=e=>{e.preventDefault();this.zoomAt(this.zoom*2,position(e),true)};
  this.canvas.onkeydown=e=>{if(e.key==='Home'||e.key==='0'){e.preventDefault();this.fit();return}if(['+','=','-','_'].includes(e.key)){e.preventDefault();this.zoomAt(this.zoom*(['-','_'].includes(e.key)?1/1.4:1.4));return}if(!e.key.startsWith('Arrow'))return;e.preventDefault();
   if(e.shiftKey){this.pan[0]+=e.key==='ArrowLeft'?-30:e.key==='ArrowRight'?30:0;this.pan[1]+=e.key==='ArrowUp'?-30:e.key==='ArrowDown'?30:0;}
   else{if(e.key==='ArrowLeft')this.yaw-=.08;if(e.key==='ArrowRight')this.yaw+=.08;if(e.key==='ArrowUp')this.pitch-=.08;if(e.key==='ArrowDown')this.pitch+=.08;}this.draw();};
  this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(this.canvas);
 }
 zoomAt(next,anchor=[0,0],center=false){const view=zoomCamera(this.zoom,this.pan,next,anchor,center);this.zoom=view.zoom;this.pan=view.pan;this.draw();}
 fit(){this.zoom=1;this.pan=[0,0];this.draw();}
 status(text){this.message.textContent=text;this.message.hidden=!text;}
 clear(text='Loading 3D hit map…'){this.data=null;this.release();this.status(text);this.element.querySelector('.surfaceLegend').hidden=true;this.draw();}
 release(){if(!this.gl)return;for(const m of this.meshes){this.gl.deleteBuffer(m.buffer);this.gl.deleteVertexArray(m.vao)}this.meshes=[];}
 dispose(){this.disposed=true;this.release();this.observer?.disconnect();this.gl?.getExtension('WEBGL_lose_context')?.loseContext();}
 buffer(values,mode){const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);for(const [name,offset] of [['position',0],['color',12]]){const a=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,offset)}this.meshes.push({vao,buffer,mode,count:values.length/6});}
 setData(data){
  this.data=data;if(!this.gl)return;this.release();
  const plane=data.plane,allowed=f=>plane==='main_detector'?f.system!=='showermax':plane==='circle'?f.system==='showermax':f.system===plane.slice(0,5)&&(!plane.endsWith('_bf')||f.detector<150000)&&(!plane.endsWith('_ff')||f.detector>=150000);
  const selectedFaces=data.faces.filter(allowed),zs=selectedFaces.map(f=>f.origin[2]),centerZ=(Math.min(...zs)+Math.max(...zs))/2;
  const systems=[...new Set(selectedFaces.map(f=>f.system))],centers=Object.fromEntries(systems.map(s=>{const z=selectedFaces.filter(f=>f.system===s).map(f=>f.origin[2]);return [s,(Math.min(...z)+Math.max(...z))/2]}));
  const world=(p,system)=>[p[0]/1000,p[1]/1000,this.exploded?(p[2]-centers[system])/1000+(systems.indexOf(system)-(systems.length-1)/2)*.42:(p[2]-centerZ)/1000];
  const background=[],edges=[],signal=[];
  const triangle=(dst,a,b,c,color,sys)=>{for(const p of [a,b,c])dst.push(...world(p,sys),...color)};
  const polygon=(dst,p,color,sys)=>{for(let j=1;j+1<p.length;j++)triangle(dst,p[0],p[j],p[j+1],color,sys)};
  for(const f of selectedFaces){const p=f.polygon.map(uv=>point(f,uv));const shade=.20+.08*Math.abs(f.normal[0]*.3+f.normal[1]*.4+f.normal[2]*.86);polygon(background,p,[shade*.8,shade*.95,shade*1.12],f.system);for(let j=0;j<p.length;j++)edges.push(...world(p[j],f.system),.34,.43,.51,...world(p[(j+1)%p.length],f.system),.34,.43,.51);}
  let max=0;for(const c of data.cells)max=Math.max(max,c[3]);
  for(const [fi,x,y,w] of data.cells){const f=data.faces[fi];if(!allowed(f))continue;const p=clipCell(f,x,y,data.cell_mm).map(uv=>point(f,uv,.035));if(p.length<3)continue;const t=data.linear?w/max:Math.log1p(w/max*999)/Math.log(1000);polygon(signal,p,viridis(t),f.system);}
  this.buffer(background,this.gl.TRIANGLES);this.buffer(edges,this.gl.LINES);this.buffer(signal,this.gl.TRIANGLES);
  this.status(data.total>0?'':'No hits for this selection');
  const legend=this.element.querySelector('.surfaceLegend');legend.hidden=!(max>0);
  const display=displaySignal(data.unit,data.signalDisplay);
  this.element.querySelector('.surfaceMaximum').textContent=(max*display.factor).toLocaleString('en-US',{maximumSignificantDigits:3});
  this.element.querySelector('.surfaceUnit').textContent=`${display.unit} / surface bin${data.linear?'':' · log color'}`;
  this.element.querySelector('.surfaceRamp').style.background='linear-gradient(90deg,'+Array.from({length:12},(_,i)=>`rgb(${viridis(i/11).map(x=>Math.round(x*255)).join(',')})`).join(',')+')';
  this.draw();
 }
 draw(){if(!this.gl||this.pending||this.disposed)return;this.pending=true;requestAnimationFrame(now=>{this.pending=false;if(this.disposed)return;
 const dt=this.lastDraw?Math.min(50,now-this.lastDraw):16;this.lastDraw=now;
 const alpha=1-Math.exp(-dt/65),c=this.camera;let moving=false;
 for(const key of ['yaw','pitch','zoom']){const d=this[key]-c[key];if(Math.abs(d)>1e-5){c[key]+=d*alpha;moving=true}else c[key]=this[key];}
 for(let i=0;i<2;i++){const d=this.pan[i]-c.pan[i];if(Math.abs(d)>.02){c.pan[i]+=d*alpha;moving=true}else c.pan[i]=this.pan[i];}
const gl=this.gl,r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(2,root.devicePixelRatio||1),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}gl.viewport(0,0,w,h);gl.clearColor(.047,.078,.125,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.useProgram(this.program);gl.uniform2f(this.uniforms.angle,c.yaw,c.pitch);gl.uniform2f(this.uniforms.screen,r.width,r.height);gl.uniform2f(this.uniforms.pan,...c.pan);gl.uniform1f(this.uniforms.zoom,c.zoom);for(const m of this.meshes){gl.bindVertexArray(m.vao);gl.drawArrays(m.mode,0,m.count)}gl.bindVertexArray(null);if(moving)this.draw();});}
}
const api={SurfaceView,aggregate,clipCell,viridis,displaySignal,zoomCamera};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HitMap3D=api;
})(typeof window!=='undefined'?window:globalThis);
