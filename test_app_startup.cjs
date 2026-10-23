// Early navigation must wait for a known campaign instead of requesting undefined data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'assets/app.js'),'utf8');
const start=source.indexOf('async function showTab(name)'),end=source.indexOf('async function showResults()',start);
(async()=>{
 for(const state of [{catalog:undefined,run:undefined},{catalog:{runs:[]},run:undefined}]){
  const context=vm.createContext({...state,tab:'results'});
  vm.runInContext(source.slice(start,end),context);
  for(const name of ['maps','analysis','secondaries']){
   await vm.runInContext(`showTab('${name}')`,context);
   assert.equal(context.tab,name);
  }
 }
 console.log('Startup navigation waits for the campaign and retains the requested tab.');
})().catch(e=>{console.error(e);process.exitCode=1});
