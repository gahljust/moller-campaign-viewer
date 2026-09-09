/* Illustrative continuous transport: retained paths, seven rotations, repeated
 * launches. Copies are display instances, never independent simulated events.
 * Playback durations are expanded for short secondary paths, not a rate clock.
 */
(function(root){
 'use strict';
 const wrap=x=>((x%1)+1)%1;
 function rotate(p,sector){let a=sector*2*Math.PI/7,c=Math.cos(a),s=Math.sin(a);return [p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]]}
 function prepare(bank,targetMoving=2100){
  let tracks=[];
  for(let [eventIndex,event]of bank.events.entries())for(let t of event.tracks){
   if(t.points.length<2)continue;
   const first=t.points[0][3],last=t.points.at(-1)[3],span=Math.max(last-first,1e-12),max=Math.max(event.time_max_ns,1);
   let duration=Math.min(.85,Math.max(t.parent?.065:.3,span/max*.75));
   tracks.push({source:t,eventIndex,secondary:t.parent!==0,birth:first/max*.75,
    duration,offset:((Math.imul(t.id^event.entry,2654435761))>>>0)/4294967296,times:t.points.map((p,i)=>last>first?(p[3]-first)/span:i/(t.points.length-1))});
  }
  let duty=[false,true].map(secondary=>tracks.reduce((n,t)=>n+(t.secondary===secondary?t.duration:0),0)*7);
  // All retained tracks participate; repeated launches fill the stream without
  // multiplying downloads or constructing fictional intermediate ancestors.
  let repeats=duty.map((d,i)=>Math.max(1,Math.ceil((i?targetMoving:900)/Math.max(d,1))));
  for(let t of tracks)t.repeats=repeats[+t.secondary];
  return {weighted:bank.schema==='research_weighted_transport_v2',tracks,expectedMoving:duty.reduce((n,d,i)=>n+d*repeats[i],0),sourceTracks:tracks.length,
   displayPaths:tracks.reduce((n,t)=>n+t.repeats*7,0)};
 }
 function configure(stream,mode='all',origin='all',detector=0,targetMoving=3000){
  const key=[mode,origin,detector].join('|');if(stream.selection===key)return;stream.selection=key;
  if(!stream.weighted)return;
  let duty=0;
  for(let t of stream.tracks){
   let allowed=visible(t,mode,origin)&&(!detector||t.source.detector===detector);
   t.displayWeight=allowed?(mode==='secondaries'&&origin!=='all'?t.source.weight+t.source.origin_weight:t.source.weight):0;
   duty+=t.displayWeight*t.duration*7;
  }
  for(let t of stream.tracks)t.repeats=duty?t.displayWeight*targetMoving/duty:0;
  stream.expectedMoving=duty?targetMoving:0;
 }
 function phases(track,clock,repeats=track.repeats){
  if(!(repeats>0))return [];
  // Fractional launch frequency preserves crossing weights. No rounding of
  // low-rate sources into equally bright streams, and no wrap discontinuity.
  const interval=1/repeats,base=clock-track.offset*interval-track.birth;
  let age=((base%interval)+interval)%interval,out=[];
  while(age<track.duration){out.push(age/track.duration);age+=interval}
  return out;
 }
 function visible(track,mode,origin){return mode==='primaries'?!track.secondary:mode==='secondaries'?track.secondary&&(origin==='all'||(track.source.creation_group||track.source.volume)===origin):true}
 const api={wrap,rotate,prepare,configure,phases,visible};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TransportStream=api;
})(typeof globalThis!=='undefined'?globalThis:this);
