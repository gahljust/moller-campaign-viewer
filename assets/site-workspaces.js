/* Layout only: measured space, with no changes to plot data or camera math. */
(()=>{
 let pending=false;
 const set=(el,name,value)=>{if(el.style.getPropertyValue(name)!==value)el.style.setProperty(name,value)};
 function fit(){
  pending=false;
  const header=document.getElementById('siteHeader').getBoundingClientRect().height;
  const main=document.querySelector('body>main');
  for(const page of document.querySelectorAll('#maps,#secondaries,#transport')){
   if(page.hidden)continue;
   const workspace=page.id==='transport'?page:page.querySelector('.detectorWorkspace');
   if(!workspace)continue;
   const offset=workspace.getBoundingClientRect().top-main.getBoundingClientRect().top;
   const filters=page.querySelector('.workspaceFilters');
   const setup=filters?workspace.getBoundingClientRect().top-filters.getBoundingClientRect().top:0;
   set(workspace,'--workspace-height',(page.id==='transport'?Math.max(180,innerHeight-header-offset-28):Math.max(320,innerHeight-setup-24))+'px');
  }
  const tilePanel=document.querySelector('#maps:not([hidden]) #workspaceTilePanel:not([hidden])');
  if(tilePanel){
   const plots=tilePanel.querySelectorAll('.pePlot'),rows=Math.ceil(plots.length/2);
   if(rows){
    const other=[...tilePanel.children].filter(x=>!x.classList.contains('pePlots')).reduce((n,x)=>n+x.getBoundingClientRect().height,0);
    const chartHeight=(tilePanel.clientHeight-other-42-(rows-1)*8)/rows-24;
    set(tilePanel,'--pe-plot-width',Math.max(165,chartHeight*430/250)+'px');
   }
  }
  const energy=document.querySelector('#secondaries:not([hidden]) #secondaryEnergyPanel:not([hidden])');
  if(energy){
   const direction=energy.querySelector('.directionTable');
   const available=energy.clientHeight-(direction?direction.getBoundingClientRect().height+16:0)-50;
   set(energy,'--energy-width',Math.min(energy.clientWidth-24,Math.max(80,available)*650/410)+'px');
  }
  const stage=document.querySelector('#transport:not([hidden]) .transportStage');
  if(stage)set(stage,'--transport-canvas-width',Math.min(stage.clientWidth,stage.clientHeight*1200/550)+'px');
 }
 const schedule=()=>{if(!pending){pending=true;requestAnimationFrame(fit)}};
 new ResizeObserver(schedule).observe(document.querySelector('main'));
 new ResizeObserver(schedule).observe(document.getElementById('siteHeader'));
 new MutationObserver(schedule).observe(document.querySelector('main'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 const stage=document.querySelector('.transportStage');if(stage)new ResizeObserver(schedule).observe(stage);
 addEventListener('resize',schedule);schedule();
})();
