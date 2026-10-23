const assert=require('node:assert/strict');
const {rebin,histogram,peTicks}=require('./assets/analysis.js');
const {pickDetector,projectPoint}=require('./assets/hit-map-3d.js');
const g={bins:[[0,2],[4,3],[1000,7]],rate:12,entries:3,available:true,mean:3,rms:1,rms_over_mean:1/3};
const b=rebin(g,.5,500);assert.equal(b.bins.reduce((a,b)=>a+b),12);assert.equal(b.width,1);assert.equal(b.bins[500],7);assert.equal(b.bins.length,501);
assert.ok(histogram(g,.5,500,'All','#077d9e').includes('RMS/Mean'));
assert.ok(histogram({...g,available:false},.5,500,'Gamma','#077d9e').includes('PE response unavailable'));
assert.ok(histogram({...g,rate:0},.5,500,'All','#077d9e').includes('No accepted entries'));
const face=z=>[[-.1,-.1,z],[.1,-.1,z],[.1,.1,z],[-.1,.1,z]];
const camera={yaw:0,pitch:0,zoom:1,pan:[0,0]};
assert.equal(pickDetector([{detector:1,points:face(0)},{detector:2,points:face(1)}],0,0,camera,800,600),2);
assert.equal(pickDetector([{detector:1,points:face(0)}],300,200,camera,800,600),null);
for(const yaw of [.2,1.1,Math.PI])for(const pitch of [-.3,.4])for(const zoom of [1,5]){
 const c={yaw,pitch,zoom,pan:[25,-41]},p=[.5,.2,.1],points=face(0).map(q=>q.map((v,i)=>v+p[i]));
 const screen=projectPoint(p,c,900,700);
 assert.equal(pickDetector([{detector:7,points}],screen[0],screen[1],c,900,700),7);
}
console.log('Analysis plots and perspective tile picking tests passed.');

assert.deepEqual(peTicks(53),{max:60,values:[0,20,40,60]});
for(const max of [1,4,17,53,180,1200]){const t=peTicks(max);assert.ok(t.max>=max);assert.ok(t.values.every(Number.isInteger));}
assert.throws(()=>rebin(g,10,500));
const log=histogram(g,.5,500,'All','#077d9e',true);
assert.ok(log.includes('logarithmic Y axis'));assert.ok(!/NaN|Infinity/.test(log));

// Gamma is offered for ShowerMax only; switching tiles preserves log settings.
const {AnalysisView}=require('./assets/analysis.js');
for(const system of ['ring5','showermax']){
 const nodes={},element={querySelector:s=>nodes[s]??=(s==='.pePlots'?{querySelectorAll:()=>[]}:{})};
 const group={...g,bins:[[0,2],[1,10]],maximum:2};
 const view={element,selected:1,logY:{all:true,primaries:false,charged:true,gamma:true},data:{rows:[{detector:1,system}],tiles:[{detector:1,bin_width:1,groups:{all:group,primaries:group,charged:group,gamma:group}}]}};
 AnalysisView.prototype.renderPlots.call(view);
 assert.equal(nodes['.pePlots'].innerHTML.includes('Secondaries · gamma'),system==='showermax');
 assert.equal(nodes['.peLogAll'].indeterminate,true);
 assert.equal((nodes['.pePlots'].innerHTML.match(/linear Y axis/g)||[]).length,1);
 view.selected=null;AnalysisView.prototype.renderPlots.call(view);
 assert.ok(nodes['.pePlots'].innerHTML.includes('Click a tile'));
}
