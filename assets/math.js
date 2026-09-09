/* Pure display algebra. Smoothing never changes a quoted statistical error. */
(function(root){
const sum=a=>a.reduce((s,v)=>s+v,0);
function sumMaps(products){
 let bins=new Map();for(let p of products)for(let[x,y,v]of p.bins){let k=x+','+y;bins.set(k,(bins.get(k)||0)+v)}
 return [...bins].map(([k,v])=>[...k.split(',').map(Number),v]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
function sample(a,n,x,y){if(x<-.5||y<-.5||x>n-.5||y>n-.5)return 0;x=Math.max(0,Math.min(n-1,x));y=Math.max(0,Math.min(n-1,y));let i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j;return a[j*n+i]*(1-u)*(1-v)+a[j*n+Math.min(n-1,i+1)]*u*(1-v)+a[Math.min(n-1,j+1)*n+i]*(1-u)*v+a[Math.min(n-1,j+1)*n+Math.min(n-1,i+1)]*u*v}
function normalize(a,target){let t=sum(a);if(t>0)for(let i=0;i<a.length;i++)a[i]*=target/t;return a}
function fold(a,n,axis=0){let b=new Float64Array(a.length),c=(n-1)/2;for(let y=0;y<n;y++)for(let x=0;x<n;x++){let r=Math.hypot(x-c,y-c),p=Math.atan2(y-c,x-c),v=0;for(let k=0;k<7;k++){let q=p+2*Math.PI*k/7;v+=sample(a,n,c+r*Math.cos(q),c+r*Math.sin(q));q=2*axis-p+2*Math.PI*k/7;v+=sample(a,n,c+r*Math.cos(q),c+r*Math.sin(q))}b[y*n+x]=v/14}return normalize(b,sum(a))}
// Source-normalized Gaussian kernels conserve every source bin. A support
// mask is geometric acceptance, never inferred from noisy empty data bins.
function smoothSupported(a,n,sigma,support){
 if(sigma<=0)return a.slice();if(!support)return gaussian(a,n,sigma);
 let radius=Math.ceil(3*sigma),out=new Float64Array(a.length),kernel=[];
 for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)kernel.push([dx,dy,Math.exp(-.5*(dx*dx+dy*dy)/(sigma*sigma))]);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  let value=a[y*n+x];if(!value)continue;let weights=[],total=0;
  for(let[dx,dy,k]of kernel){let xx=x+dx,yy=y+dy;if(xx<0||xx>=n||yy<0||yy>=n)continue;let j=yy*n+xx,w=k*support[j];if(w>0){weights.push([j,w]);total+=w}}
  if(total)for(let[j,w]of weights)out[j]+=value*w/total;else out[y*n+x]+=value;
 }
 return out;
}
function cameraPoint(p,c,width=1200,height=550){
 let z=p[2]-c.center[2],x=p[0]-c.center[0],y=p[1]-c.center[1],a=Math.cos(c.yaw),b=Math.sin(c.yaw),u=z*a+x*b,depth=-z*b+x*a;
 return [width/2+c.pan[0]+c.scale*u,height/2+c.pan[1]-c.scale*(y*Math.cos(c.pitch)+depth*Math.sin(c.pitch))];
}
function gaussian(a,n,sigma){if(sigma<=0)return a.slice();let radius=Math.ceil(sigma*3),kernel=Array.from({length:radius*2+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2)),ks=sum(kernel);kernel=kernel.map(v=>v/ks);let tmp=new Float64Array(a.length),out=new Float64Array(a.length);for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let k=-radius;k<=radius;k++){let xx=x+k;if(xx>=0&&xx<n)tmp[y*n+x]+=a[y*n+xx]*kernel[k+radius]}for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let k=-radius;k<=radius;k++){let yy=y+k;if(yy>=0&&yy<n)out[y*n+x]+=tmp[yy*n+x]*kernel[k+radius]}return normalize(out,sum(a))}
function profile(a,n){let sw=new Float64Array(56),sr=new Float64Array(56),c=(n-1)/2;for(let y=0;y<n;y++)for(let x=0;x<n;x++){let p=(Math.atan2(y-c,x-c)+2*Math.PI)%(2*Math.PI),k=Math.floor(p/(2*Math.PI)*56),w=a[y*n+x];sw[k]+=w;sr[k]+=w*Math.hypot(x-c,y-c)}let fallback=sum(sr)/(sum(sw)||1);return Array.from(sw,(w,i)=>w?sr[i]/w:fallback)}
function warp(a,n,delta,t){let b=new Float64Array(a.length),c=(n-1)/2;for(let y=0;y<n;y++)for(let x=0;x<n;x++){let r=Math.hypot(x-c,y-c),p=(Math.atan2(y-c,x-c)+2*Math.PI)%(2*Math.PI),q=p/(2*Math.PI)*56,k=Math.floor(q),d=delta[k]*(1-(q-k))+delta[(k+1)%56]*(q-k),rr=r-t*d;b[y*n+x]=rr>=0?sample(a,n,c+rr*Math.cos(p),c+rr*Math.sin(p)):0}return normalize(b,sum(a))}
function blend(a,b,n,t){if(t<=0)return a.slice();if(t>=1)return b.slice();t=t*t*(3-2*t);let sa=sum(a),sb=sum(b),pa=profile(a,n),pb=profile(b,n),d=pa.map((v,i)=>pb[i]-v),aa=warp(a,n,d,t),bb=warp(b,n,d,t-1),target=sa>0&&sb>0?Math.exp(Math.log(sa)*(1-t)+Math.log(sb)*t):sa*(1-t)+sb*t,out=Float64Array.from(aa,(v,i)=>(sa?v/sa*(1-t):0)+(sb?bb[i]/sb*t:0));return normalize(out,target)}
function predict(model,row,target,energy){let z={c12_us:-5124.627,c12_ms:-4499.873,c12_ds:-3875.373,lh2:-4500}[target];if(z==null)throw Error('Unsupported target');let raw=[row[0]/1000,Math.sin(7*row[1]),Math.cos(7*row[1]),row[2],row[0]*row[3],energy/11,z/5000],x=raw.map((v,i)=>(v-model.mean[i])/model.scale[i]),dist=model.centers.map(c=>c.reduce((s,v,i)=>s+(v-x[i])**2,0)),k=model.coefficients[0];for(let i=0;i<dist.length;i++)k+=model.coefficients[i+1]*Math.exp(-.5*dist[i]/model.sigma**2);return {k,nearest:Math.sqrt(Math.min(...dist)),status:energy<model.energy_range[0]||energy>model.energy_range[1]?'outside_energy_support':Math.sqrt(Math.min(...dist))>model.distance_limit?'outside_training_support':'historical_model_prediction'}}
function gaussianResolution(model,row,target,energy,sigma){
 let first=0,second=0,points=[-Math.sqrt(3),0,Math.sqrt(3)],weights=[1/6,2/3,1/6];
 // Tensor Gauss-Hermite quadrature, 81 points, for independent Gaussian errors.
 for(let i=0;i<81;i++){let code=i,w=1,q=row.slice();for(let j=0;j<4;j++){let k=code%3;code=Math.floor(code/3);q[j]+=points[k]*sigma[j];w*=weights[k]}let v=predict(model,q,target,energy).k;first+=w*v;second+=w*v*v}
 return {mean:first,sigma:Math.sqrt(Math.max(0,second-first*first)),method:'81_point_gauss_hermite_diagonal_track_covariance'};
}
const api={sum,sumMaps,sample,normalize,fold,gaussian,smoothSupported,cameraPoint,blend,predict,gaussianResolution};if(typeof module!=='undefined')module.exports=api;root.ResearchMath=api;
})(typeof globalThis!=='undefined'?globalThis:this);
