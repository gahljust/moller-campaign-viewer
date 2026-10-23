const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {aggregate,clipCell}=require('./assets/hit-map-3d.js');
// Distinct faces at identical x/y bins must stay distinct (overlapping tiles).
const face={polygon:[[0,0],[20,0],[20,20],[0,20]],detector:150251};
const data={faces:[face,{...face,detector:150252}],rows:[],cell_mm:10,sources:['Quartz','Window'],cells:[
 [0,0,0,-1,2,0,2,20],[0,0,0,0,2,0,3,30],[1,0,0,1,2,1,5,50]]};
let a=aggregate([data],{mode:'0'});assert.equal(a.total,10);assert.equal(a.cells.length,2);
a=aggregate([data,data],{secondary:true,source:['Quartz','Window'],region:'open',momentum:'all',mode:'2'});assert.equal(a.total,160);
assert.equal(aggregate([data],{secondary:true,source:'Window',momentum:'forward'}).total,0);
assert.equal(aggregate([data],{secondary:true,momentum:'backward'}).total,5);
assert.equal(clipCell(face,3,3,10).length,0);
assert.equal(clipCell(face,0,0,10).length,4);
// Real products: independently saved 2D-source marginals must agree with 3D selections.
if(process.argv[2]){
 const folder=process.argv[2],peFolder=process.argv[3];
 const read=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));
 const manifest=read(path.join(folder,'manifest.json.gz'));
 let checked=0;
 for(const relative of Object.keys(manifest.products)){
  if(relative.endsWith('/circle.json.gz'))continue;
  const d=read(path.join(folder,relative));
  const sources=read(path.join(peFolder,relative.replace('.json.gz','_sources.json.gz')));
  for(const [source,item] of Object.entries(sources.sources))for(const [r,region] of ['closed','transition','open'].entries()){
   const expected=item.weights[r].reduce((a,b)=>a+b,0);
   const actual=aggregate([d],{secondary:true,source,region,mode:'2',plane:d.plane}).total;
   assert.ok(Math.abs(actual-expected)<=Math.max(1e-5,Math.abs(expected)*5e-6),`${relative}: ${source}, ${region}`);checked++;
  }
 }
 console.log(`Verified ${checked} real source/region selections against the existing PE maps.`);
}
console.log('Surface map tests passed.');

const {unwrapGeometry,unwrapPoint}=require('./assets/hit-map-3d.js');
const testFaces=[0,Math.PI/2,Math.PI].map((a,i)=>({detector:i,system:'ring5',origin:[1000*Math.cos(a),1000*Math.sin(a),22000+i*20],u:[Math.cos(a),Math.sin(a),0],v:[-Math.sin(a),Math.cos(a),0],normal:[0,0,1],polygon:[[-50,-30],[50,-30],[50,30],[-50,30]]}));
const layout=unwrapGeometry(testFaces,22000);
assert.equal(layout.tiles.size,3);
for(const tile of layout.tiles.values())for(const amount of [0,.3,1]){
 const p=tile.points[0],q=tile.points[1],u=unwrapPoint(p,tile,amount),v=unwrapPoint(q,tile,amount);
 assert.ok(Math.abs(Math.hypot(...p.map((x,i)=>x-q[i]))-Math.hypot(...u.map((x,i)=>x-v[i])))<1e-12);
 if(amount===0)assert.deepEqual(unwrapPoint(tile.center,tile,0),tile.center);
 if(amount===1)assert.deepEqual(unwrapPoint(tile.center,tile,1),tile.target);
}

// Unwrapping must keep the PE signal buffers and their normalization intact.
// The default unwrapped camera must face entry surfaces, not the opaque backs.
const {SurfaceView,unwrapCamera,rotatePoint}=require('./assets/hit-map-3d.js');
const front={detector:150252,system:'ring5',origin:[1000,0,22000],u:[1,0,0],v:[0,1,0],normal:[0,0,-1],polygon:[[0,0],[20,0],[20,20],[0,20]]};
const back={...front,origin:[1000,0,22010],normal:[0,0,1]};
const product={faces:[front,back],rows:[],cell_mm:10,sources:[],cells:[[0,0,0,-1,2,0,2,70],[0,1,1,-1,2,0,3,150]]};
const pe=aggregate([product],{mode:'2',plane:'ring5'});
const nodes={};let buffers=[];
const view={gl:{TRIANGLES:4,LINES:1},element:{querySelector:s=>nodes[s]??={style:{}}},focusedDetector:null,selectedDetector:null,
 release:()=>{buffers=[]},buffer:(values,mode)=>buffers.push({values,mode}),status:()=>{},draw:()=>{}};
SurfaceView.prototype.setData.call(view,pe);
const before=JSON.stringify(buffers),legend=nodes['.surfaceMaximum'].textContent;
view.unwrapped=true;view.unwrapAmount=1;
SurfaceView.prototype.setData.call(view,pe);
assert.equal(JSON.stringify(buffers),before);
assert.equal(nodes['.surfaceMaximum'].textContent,legend);
assert.equal(pe.total,220);
assert.ok(buffers[2].values.length>0);
const tile=view.unwrapLayout.tiles.get(front.detector);
const frontDepth=rotatePoint(unwrapPoint([1.01,.01,0],tile,1),unwrapCamera.yaw,unwrapCamera.pitch)[2];
const backDepth=rotatePoint(unwrapPoint([1.01,.01,.01],tile,1),unwrapCamera.yaw,unwrapCamera.pitch)[2];
assert.ok(frontDepth>backDepth,'Entry heat map must be in front of the opaque rear face');
