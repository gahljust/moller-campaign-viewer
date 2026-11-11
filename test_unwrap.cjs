// Geometry/picking regression checks using the saved viewer product; no browser dependencies.
// Run from any directory: node test_unwrap.cjs /path/to/prepared/site
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const assets=path.join(__dirname,'assets');
const site=process.argv[2]||path.resolve(__dirname,'../../../rootfiles/local_work/background_campaign/research/shared_viewer');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'manifest.json')));
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(site,manifest.products['deconvolution?'].path)))).tiles;
const context=new Proxy({}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
const callbacks=new Map();let id=0;
const sandbox={window:{},document:{getElementById:()=>({getContext:()=>context})},performance,
 requestAnimationFrame:f=>(callbacks.set(++id,f),id),cancelAnimationFrame:i=>callbacks.delete(i),console};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(site,'assets/detector-geometry.js'),'utf8'),sandbox);
sandbox.window.DATA={rows:data.rows,C:data.forecast.category_asymmetry_covariance_ppb2,meshes:sandbox.window.DETECTOR_MESHES};
const src=fs.readFileSync(path.join(assets,'detector-correlations.js'),'utf8');
const pure=src.slice(0,src.indexOf("\ndocument.querySelector('.ramp').style.background="))+src.slice(src.indexOf('function polygon('),src.indexOf('function coords('));
vm.runInContext(pure,sandbox);
vm.runInContext(`
W=1440;H=760;fitUnwrap();values=rows.map(()=>0);
const near=(a,b,tol=1e-8)=>{if(Math.abs(a-b)>tol)throw Error('Mismatch '+a+' vs '+b)};
let projectionChecks=0,pickChecks=0;
function legacy(){return faces.map(f=>({index:f.index,screen:f.p.map(p=>project(unfoldPoint(p,f.index)))})).map(f=>({...f,z:f.screen.reduce((s,p)=>s+p[2],0)/f.screen.length})).sort((a,b)=>a.z-b.z)}
function linearPick(x,y){for(let k=projectedFaces.length-1;k>=0;k--){const f=projectedFaces[k];if(focusGroup!=='all'&&rows[f.index].system!==focusGroup)continue;if(inside(x,y,f.screen))return f.index}return -1}
for(const t of [0,.25,.5,.8125,.9,.95,1])for(const z of [1,2.5]){
 unwrapAmount=t;zoom=z;yaw=.93;pitch=.32;pan=[23,-17];
 const projected=projectedGeometry(),reference=legacy();
 // Compare each channel's vertex multiset, independent of equal-depth painter ties.
 const vertices=arr=>{const groups=Array.from({length:rows.length},()=>[]);for(const f of arr)for(const p of f.screen)groups[f.index].push(p);for(const g of groups)g.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);return groups};
 const actual=vertices(projected),expected=vertices(reference);
 for(let i=0;i<rows.length;i++)for(let j=0;j<actual[i].length;j++)for(let k=0;k<3;k++){near(actual[i][j][k],expected[i][j][k]);projectionChecks++}
 if(projectedGeometry()!==projected)throw Error('Projection cache not reused');
 for(const focus of ['all','ring5','showermax']){focusGroup=focus;
  for(let y=7;y<H;y+=29)for(let x=11;x<W;x+=31){if(pick(x,y)!==linearPick(x,y))throw Error('Picking mismatch');pickChecks++}
 }
}
// Angles invert to the requested azimuth on every ring, independent of radius.
for(const b of stripGroups)for(let j=0;j<7;j++){
 const p=stripAnglePoint(b,j*TAU/7);near(((1-p[0]/b.radius+unwrapSeam)%TAU+TAU)%TAU,j*TAU/7);
}
// Rigid meshes preserve lengths and toggle back to original placements.
let maxEdgeError=0;
for(const t of [0,.25,.5,.8125,.9,.95,1]){
 
 for(const f of faces)for(let j=0;j<f.p.length;j++){
  const a=f.p[j],b=f.p[(j+1)%f.p.length],u=unfoldPoint(a,f.index,t),v=unfoldPoint(b,f.index,t);
  const expected=Math.hypot(...a.map((x,k)=>x-b[k]));
  const error=Math.abs(Math.hypot(...u.map((x,k)=>x-v[k]))-expected);maxEdgeError=Math.max(maxEdgeError,error);near(error,0);
  if(t===0)u.forEach((x,k)=>near(x,transformed(a,rows[f.index].system)[k]));
 }
}
focusGroup='all';unwrapAmount=1;zoom=1;pan=[0,0];projectedGeometry();
const points=Array.from({length:5000},(_,i)=>[(i*173)%W,(i*97)%H]);
let start=performance.now();for(const p of points)linearPick(...p);const oldMs=performance.now()-start;
start=performance.now();for(const p of points)pick(...p);const newMs=performance.now()-start;
console.log(JSON.stringify({projectionChecks,pickChecks,maxEdgeError,pickBenchmark:{queries:points.length,linearMs:+oldMs.toFixed(1),indexedMs:+newMs.toFixed(1)}}));
`,sandbox);
// A burst of redraw requests produces exactly one callback and stops when drawn.
vm.runInContext('for(let i=0;i<100;i++)requestDraw()',sandbox);assert.equal(callbacks.size,1);
let pending=[...callbacks.values()][0];callbacks.clear();pending();assert.equal(callbacks.size,0);
// Full transition and rapid reversal both finish and release their callbacks.
vm.runInContext('unwrapAmount=0;animateUnwrap(true)',sandbox);pending=[...callbacks.values()][0];callbacks.clear();pending(performance.now()+2000);
assert.equal(vm.runInContext('unwrapAmount',sandbox),1);assert.equal(callbacks.size,0);
vm.runInContext('animateUnwrap(false);animateUnwrap(true)',sandbox);assert.equal(callbacks.size,0);
console.log('PASS: 252 channels; projection equivalence, rigid geometry, angular ticks, picking, frame coalescing and animation lifecycle.');

const surface=require("./assets/hit-map-3d.js");
assert.ok(Math.abs(surface.shortestAngle(2*Math.PI+.1,0)-(2*Math.PI))<1e-12);
assert.ok(Math.abs(surface.shortestAngle(-2*Math.PI-.1,0)+2*Math.PI)<1e-12);

// Exercise the actual surface renderer's animation step from all camera presets,
// including cameras rotated multiple turns by dragging.
for(const initial of [0,Math.PI,Math.PI+.45,8*Math.PI+.7,-8*Math.PI-.7]){
 const target=surface.shortestAngle(initial,surface.unwrapCamera.yaw);
 const view={unwrapped:true,unwrapAmount:0,yaw:target,pitch:surface.unwrapCamera.pitch,
 zoom:1,pan:[0,0],camera:{yaw:initial,pitch:.22,zoom:1,pan:[0,0]}};
 let last=0,travel=0;
 for(let frame=0;frame<600;frame++){
  const before=view.camera.yaw;
  const aligned=Math.abs(view.yaw-before)<.015&&Math.abs(view.pitch-view.camera.pitch)<.015;
  const moving=surface.advanceUnwrap(view,16);
  if(!aligned)assert.equal(view.unwrapAmount,0,'Tiles move before camera alignment');
  assert.ok(view.unwrapAmount>=last,'Unfold must be monotonic');
  travel+=Math.abs(view.camera.yaw-before);last=view.unwrapAmount;
  if(!moving)break;
 }
 assert.equal(view.unwrapAmount,1);assert.ok(travel<=Math.PI+1e-6,'Unnecessary full camera revolution');
 view.unwrapped=false;view.yaw=surface.shortestAngle(view.camera.yaw,initial);view.pitch=.22;
 last=1;
 for(let frame=0;frame<600;frame++){
  const before=view.camera.yaw;const moving=surface.advanceUnwrap(view,16);
  assert.ok(view.unwrapAmount<=last,'Refold must be monotonic');
  if(view.unwrapAmount>.001)assert.equal(view.camera.yaw,before,'Camera moves before tiles close');
  last=view.unwrapAmount;if(!moving)break;
 }
 assert.equal(view.unwrapAmount,0);
 assert.ok(Math.abs(Math.sin((view.camera.yaw-initial)/2))<1e-6);
}
console.log('PASS: surface camera alignment, shortest turn, monotonic unfold/refold, and original view restoration.');


// The seam stays anchored; neighboring azimuths straighten in order, with no flip phase.
for(const t of [0,.1,.5,.9,.99,1]){
 const zero={angle:0,radius:1,center:[1,0,0],target:[1,0,0]};
 const p=surface.unrollCenter(zero,t);p.forEach((v,i)=>assert.ok(Math.abs(v-zero.center[i])<1e-10));
}
for(const theta of [0,.01,Math.PI/2,Math.PI,2*Math.PI-.01]){
 const tile={angle:theta,radius:1,center:[Math.cos(theta),Math.sin(theta),0],target:[1-theta,0,0]};
 surface.unwrapPoint(tile.center,tile,0).forEach((v,i)=>assert.ok(Math.abs(v-tile.center[i])<1e-10));
 surface.unwrapPoint(tile.center,tile,1).forEach((v,i)=>assert.ok(Math.abs(v-tile.target[i])<1e-10));
 for(const t of [.1,.5,.9]){
  const p=[tile.center[0]+.1,tile.center[1]+.2,0],q=surface.unwrapPoint(p,tile,t),c=surface.unrollCenter(tile,t);
  assert.ok(Math.abs(Math.hypot(...q.map((v,i)=>v-c[i]))-Math.hypot(.1,.2))<1e-10);
 }
}
vm.runInContext(`
 const zero={angle:0,radius:1,center:[1,0,0],target:[1,0,0]};
 for(const t of [0,.1,.5,.9,.99,1])unrollCenter(zero,t).forEach((v,i)=>near(v,zero.center[i]));
 for(let i=0;i<rows.length;i++)unfoldPoint(tileUnwrap[i].center,i,1).forEach((v,j)=>near(v,tileUnwrap[i].target[j]));
 unwrapAmount=1;yaw=.93;pitch=.32;
 const b=stripGroups[0];let last=-Infinity;
 for(let j=0;j<7;j++){const x=project(stripAnglePoint(b,j*TAU/7))[0];if(x<=last)throw Error('Angles must increase left to right');last=x;}
`,sandbox);
console.log('PASS: fixed zero seam, original 3D positions, rigid dimensions and increasing left-to-right azimuths.');
