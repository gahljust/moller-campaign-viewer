/* Pick the visible ink of a curve in CSS pixels, including zoomed segments. */
(function(root){
'use strict';
const valid=p=>p&&p.every(Number.isFinite);
function segmentDistance(p,a,b,clip){
 const dx=b[0]-a[0],dy=b[1]-a[1];let lo=0,hi=1;
 for(const [v,q]of [[-dx,a[0]-clip[0]],[dx,clip[2]-a[0]],[-dy,a[1]-clip[1]],[dy,clip[3]-a[1]]]){
  if(v===0){if(q<0)return Infinity;continue;}
  const t=q/v;if(v<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
  if(lo>hi)return Infinity;
 }
 const d=dx*dx+dy*dy;
 const t=Math.max(lo,Math.min(hi,d?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d:0));
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function nearest(curves,point,clip,tolerance=6){
 if(!valid(point)||point[0]<clip[0]||point[0]>clip[2]||point[1]<clip[1]||point[1]>clip[3])return null;
 let best=null;
 // Curves arrive in painting order. Visible foreground ink wins a tie.
 curves.forEach((curve,order)=>{
  let distance=Infinity,index=-1,previous=null;
  curve.points.forEach((p,i)=>{
   if(!valid(p)){previous=null;return;}
   let d=Infinity;
   if(curve.stroke&&previous){d=segmentDistance(point,previous,p,clip)-curve.width/2;}
   if(p[0]>=clip[0]&&p[0]<=clip[2]&&p[1]>=clip[1]&&p[1]<=clip[3]){
    const radius=Math.max(curve.stroke?curve.width/2:0,curve.markerRadius||0);
    d=Math.min(d,Math.hypot(point[0]-p[0],point[1]-p[1])-radius);
   }
   if(d<distance){distance=d;index=i;}previous=p;
  });
  distance=Math.max(0,distance);
  if(distance<=tolerance&&(!best||distance<best.distance-.5||Math.abs(distance-best.distance)<=.5&&order>best.order))
   best={curve,index,distance,order};
 });
 return best;
}
const api={nearest,segmentDistance};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitPicking=api;
})(typeof window==='undefined'?globalThis:window);
