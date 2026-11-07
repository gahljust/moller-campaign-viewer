/* Isolated saved statistics: no fit controls and no dependency on a local service. */
window.StatisticalPage=(()=>{
 const frame=document.getElementById('statisticsFrame');
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame.contentWindow)return;
  if(e.data?.type==='statistics-height'&&Number.isFinite(e.data.height))frame.style.height=Math.max(500,Math.min(18000,e.data.height))+'px';
 });
 return {show(visible){
  if(visible&&!frame.hasAttribute('src'))frame.src=frame.dataset.src;
 }};
})();
