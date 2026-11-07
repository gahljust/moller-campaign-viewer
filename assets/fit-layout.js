/* Shared UI geometry. Does not alter fitting or histogram statistics. */
(function(root){
'use strict';
function outsideBox({plot,size,bounds,obstacles=[]}){
 const [w,h]=size,gap=10,[l,t,r,b]=bounds;
 const clamp=(v,a,z)=>Math.max(a,Math.min(z,v));
 const candidates=[
  [plot.right+gap,clamp(plot.top,t,b-h)],
  [plot.left-w-gap,clamp(plot.top,t,b-h)],
  [clamp(plot.left,l,r-w),plot.bottom+gap],
  [clamp(plot.left,l,r-w),plot.top-h-gap]
 ];
 const valid=candidates.filter(([x,y])=>x>=l&&y>=t&&x+w<=r&&y+h<=b&&
  (x+w<=plot.left||x>=plot.right||y+h<=plot.top||y>=plot.bottom));
 const covered=([x,y])=>obstacles.reduce((n,p)=>n+Math.max(0,Math.min(x+w,p.right)-Math.max(x,p.left))*Math.max(0,Math.min(y+h,p.bottom)-Math.max(y,p.top)),0);
 valid.sort((a,b)=>covered(a)-covered(b));return valid[0]||null;
}
function place(menu,plot,obstacles=[...document.querySelectorAll('.pePlot')].map(el=>el.getBoundingClientRect())){
 const p=outsideBox({plot,size:[menu.offsetWidth,menu.offsetHeight],bounds:[8,8,innerWidth-8,innerHeight-8],obstacles});
 menu.style.visibility='visible';
 if(p){menu.style.position='fixed';menu.style.left=p[0]+'px';menu.style.top=p[1]+'px';}
 else{menu.style.position='absolute';menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,plot.left))+scrollX+'px';menu.style.top=plot.bottom+scrollY+10+'px';}
}
const api={outsideBox,place};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitLayout=api;
})(typeof window==='undefined'?globalThis:window);
