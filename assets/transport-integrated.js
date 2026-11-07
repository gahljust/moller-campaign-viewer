/* Accepted integrated layout, scoped to Particle transport only. */
(()=>{
 const d=document,w=window,mode='instrument';
 const make=(doc,tag,cls)=>{const e=doc.createElement(tag);e.className=cls;return e};
   const style=d.createElement('link');style.rel='stylesheet';style.href='/assets/transport-integrated.css';d.head.append(style);d.body.classList.add('study',mode);
   const transport=d.getElementById('transport'),controls=transport.querySelector('.transportControls');
   const setup=make(d,'div','studySetup'),campaign=controls.querySelector('label');setup.append(campaign);transport.prepend(setup);
   const instrument=make(d,'div','studyInstrument'),top=make(d,'div','studyTop'),rail=make(d,'aside','studyRail'),bottom=make(d,'div','studyBottom'),legends=make(d,'div','studyLegends');
   const particles=transport.querySelector('.particleControls'),stage=transport.querySelector('.transportStage'),rings=transport.querySelector('.ringControls'),playback=transport.querySelector('.playback'),inset=transport.querySelector('.ringInset');
   transport.append(instrument);instrument.append(top,stage,rail,bottom);
   if(mode==='instrument'){top.append(particles,controls);bottom.append(rings,playback);}
   else{top.append(particles);rail.append(controls,rings,inset);bottom.append(playback);}
   legends.append(d.getElementById('trackLegend'),d.getElementById('geometryLegend'));bottom.append(legends);
   const help=transport.querySelector('.viewerHelp'),details=make(d,'details','studyHelp'),summary=make(d,'summary','');summary.textContent='Controls';details.append(summary,help);bottom.append(details);
   transport.append(d.getElementById('animationSummary'));
   // Redundant stream captions give way to the visible selection and playback state.
   let pending=false;
   const size=()=>{pending=false;
    if(!transport.hidden){if(!setup.contains(d.getElementById('datasetChoice')))setup.prepend(d.getElementById('datasetChoice'));instrument.style.setProperty('--study-height',Math.max(340,w.innerHeight-instrument.getBoundingClientRect().top-32)+'px');}
   };
   const schedule=()=>{if(!pending){pending=true;w.requestAnimationFrame(size)}};
   new w.MutationObserver(schedule).observe(d.querySelector('main'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','disabled']});
   new w.ResizeObserver(schedule).observe(d.body);w.addEventListener('resize',schedule);style.onload=schedule;
})();
