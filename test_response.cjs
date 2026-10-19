/* Exercise the actual static API's response routing without a browser server. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),{webcrypto}=require('node:crypto');
const app=fs.readFileSync(__dirname+'/assets/app.js','utf8');
const source=app.slice(app.indexOf('async function api('),app.indexOf('function download('));
const products={},bodies=new Map();
function put(key,value){const raw=Buffer.from(JSON.stringify(value)),sha=require('node:crypto').createHash('sha256').update(raw).digest('hex'),path=sha+'.gz';bodies.set(path,zlib.gzipSync(raw));products[key]={path,sha256:sha};}
put('maps?plane=ring5&run=a&tile=',{unit:'crossings/s'});
put('maps?plane=ring5&response=2&run=a&tile=',{unit:'PE/s'});
put('maps?plane=circle&run=a&tile=',{unit:'PE/s',unchanged:true});
put('secondary-sources?plane=ring5&run=a',{unit:'crossings/s'});
put('secondary-sources?plane=ring5&response=2&run=a',{unit:'PE/s'});
put('deconvolution?response=0',{mode:'0'});put('deconvolution?response=2',{mode:'2'});
const context={staticManifest:{products,main_detector_response:{runs:['a']}},URLSearchParams,Response,DecompressionStream,TextDecoder,crypto:webcrypto,fetch:async path=>new Response(bodies.get(path)),M:{}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
 for(const route of ['maps','secondary-sources'])for(const response of ['0','2']){
  const args={run:'a',plane:'ring5',response};if(route==='maps')args.tile='';
  assert.equal((await context.api(route,args)).unit,response==='0'?'crossings/s':'PE/s');assert.equal(args.response,response);
 }
 assert.equal((await context.api('maps',{run:'a',plane:'circle',tile:'',response:'2'})).unchanged,true);
 for(const response of ['0','2'])assert.equal((await context.api('deconvolution',{response})).mode,response);
 await assert.rejects(context.api('maps',{run:'missing',plane:'ring5',tile:'',response:'2'}),/unavailable/);
 console.log('PASS: static rate/PE routing, unchanged ShowerMax, fit selection and missing-product rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
