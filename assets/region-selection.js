/* Regional unions use saved physical membership and additive signal totals. */
(function(root){
'use strict';
const regions=['open','closed','transition'];
function read(element){return Array.from(element.querySelectorAll('input:checked'),box=>box.value);}
function parameter(selected){return selected.length===3?'all':selected;}
function label(selected){return selected.length===3?'All regions':selected.length?selected.map(r=>r[0].toUpperCase()+r.slice(1)).join(' + '):'No regions';}
function summary(h,selected,momentum){
 if(selected.length===3)return {regional:h,selected:momentum==='all'?h:h.secondary_momentum?.[momentum]};
 const parts=selected.map(r=>h.secondary_regions?.[r]);
 if(parts.some(p=>!p))return {};
 const slices=parts.map(p=>momentum==='all'?p:p.secondary_momentum?.[momentum]);
 if(slices.some(p=>!p))return {};
 const weight=parts.reduce((a,p)=>a+p.weight,0),secondaryWeight=slices.reduce((a,p)=>a+p.secondary_weight,0),groups=new Map();
 if(parts.length===1)return {regional:parts[0],selected:slices[0]};
 for(const slice of slices)for(const g of slice.volume_groups||[]){
  const dest=groups.get(g.name)||{name:g.name,signal:0,members:[],volume_count:0,remaining_fraction:0,details_unavailable:true};
  dest.signal+=g.fraction*slice.secondary_weight;groups.set(g.name,dest);
 }
 return {regional:{weight},selected:{secondary_weight:secondaryWeight,volume_groups:[...groups.values()].map(g=>({...g,fraction:secondaryWeight?g.signal/secondaryWeight:0}))}};
}
const api={regions,read,parameter,label,summary};root.RegionSelection=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
