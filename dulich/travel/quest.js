/* Việt Nam Quest · "Quest" view: the planned trip as an illustrated adventure map with a passport.
   Real route geometry is projected onto a 1200×800 drawing; a 🛵 badge rides along it stop by stop. */
(function(){
'use strict';
const V=window.VNQ;if(!V)return;
const $=id=>document.getElementById(id);
const NS='http://www.w3.org/2000/svg',W=1200,H=800,PAD=90;
const ov=$('quest'),svg=$('qsvg');
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let Q=null;                       /* state of the open quest */

function el(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;}
function rnd(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const dist2=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
function polyLen(pts){let L=0;for(let i=1;i<pts.length;i++)L+=Math.sqrt(dist2(pts[i-1],pts[i]));return L;}
function pointAt(pts,len){
  for(let i=1;i<pts.length;i++){const d=Math.sqrt(dist2(pts[i-1],pts[i]));if(len<=d||i===pts.length-1){const t=d?Math.min(1,len/d):1;
    return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t];}len-=d;}
  return pts[pts.length-1];
}
const pathD=pts=>pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join('');

/* equirectangular projection fitted into the drawing */
function makeProjection(latlngs){
  let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;
  latlngs.forEach(([la,ln])=>{a=Math.min(a,la);b=Math.max(b,la);c=Math.min(c,ln);d=Math.max(d,ln);});
  const kx=Math.cos((a+b)/2*Math.PI/180),w=Math.max((d-c)*kx,1e-4),h=Math.max(b-a,1e-4);
  const s=Math.min((W-2*PAD)/w,(H-2*PAD)/h),ox=(W-w*s)/2,oy=(H-h*s)/2;
  return ([la,ln])=>[ox+(ln-c)*kx*s,oy+(b-la)*s];
}

/* Cut each day's route into one segment per stamp, using the leg distances to find where each stop sits on the line. */
function buildSegments(trip,plan,stamps,P){
  const pos=stamps.map(s=>{const st=V.stopById(trip,s.id);return P([st.lat,st.lng]);});
  const segs=[null];let k=1;
  plan.days.forEach(d=>{
    const G=d.geom.map(P),cum=[0];for(let i=1;i<G.length;i++)cum.push(cum[i-1]+Math.sqrt(dist2(G[i-1],G[i])));
    const total=cum[cum.length-1]||1,legSum=d.rows.reduce((a,r)=>a+(r.dist||0),0);
    let last=0,acc=0;
    d.rows.forEach((r,j)=>{
      acc+=legSum?r.dist:legSum/d.rows.length;
      const target=legSum?acc/legSum*total:(j+1)/d.rows.length*total;
      let guess=cum.findIndex(v=>v>=target);if(guess<0)guess=G.length-1;
      const win=Math.max(6,Math.round(G.length*.08)),me=pos[k];let bi=Math.max(last,guess),bv=Infinity;
      for(let i=Math.max(last,guess-win);i<=Math.min(G.length-1,guess+win);i++){const v=dist2(G[i],me);if(v<bv){bv=v;bi=i;}}
      if(j===d.rows.length-1)bi=G.length-1;
      const seg=[pos[k-1],...G.slice(last,bi+1),me];
      segs.push(seg);last=bi;k++;
    });
  });
  return {pos,segs};
}

/* ---------------------------------------------------------------- drawing */
function draw(){
  const {trip,plan,stamps}=Q;
  svg.innerHTML='';
  const all=[];plan.days.forEach(d=>d.geom.forEach(p=>all.push(p)));V.allStops(trip).forEach(s=>all.push([s.lat,s.lng]));
  const P=makeProjection(all);
  const {pos,segs}=buildSegments(trip,plan,stamps,P);
  Q.pos=pos;Q.segs=segs;
  const r=rnd(V.allStops(trip).length*977+Math.round(all[0][0]*1000));
  /* land, soft fields */
  el('rect',{x:0,y:0,width:W,height:H,fill:'#a8d86e'},svg);
  const land=el('g',{},svg);
  for(let i=0;i<9;i++)el('ellipse',{cx:r()*W,cy:r()*H,rx:120+r()*180,ry:70+r()*110,fill:r()<.5?'#b6e27c':'#98ce5f',opacity:.75},land);
  /* scenery kept away from the route */
  const routePts=[];segs.forEach(s=>s&&s.forEach((p,i)=>{if(i%2===0)routePts.push(p);}));pos.forEach(p=>routePts.push(p));
  const free=(x,y,m)=>routePts.every(p=>dist2(p,[x,y])>m*m);
  const deco=el('g',{},svg);
  for(let i=0,placed=0;i<500&&placed<90;i++){
    const x=30+r()*(W-60),y=40+r()*(H-70);if(!free(x,y,46))continue;placed++;
    const t=r(),s=.7+r()*.7;
    if(t<.5){const c=r()<.5?['#7fa9a2','#5f8f86']:['#6f9a5a','#4f7f42'];
      el('path',{d:`M${x-26*s},${y} C${x-22*s},${y-24*s} ${x-10*s},${y-48*s} ${x},${y-50*s} C${x+10*s},${y-48*s} ${x+22*s},${y-24*s} ${x+26*s},${y} Z`,fill:c[0]},deco);
      el('path',{d:`M${x},${y-50*s} C${x-8*s},${y-40*s} ${x-14*s},${y-20*s} ${x-12*s},${y} L${x-26*s},${y} C${x-22*s},${y-24*s} ${x-10*s},${y-48*s} ${x},${y-50*s} Z`,fill:c[1],opacity:.6},deco);}
    else if(t<.85){el('rect',{x:x-2,y:y-10*s,width:4,height:10*s,fill:'#8a5a2b'},deco);el('circle',{cx:x,cy:y-16*s,r:11*s,fill:r()<.5?'#3c8a4a':'#4f9f5a'},deco);}
    else{el('rect',{x:x-11,y:y-12,width:22,height:12,fill:'#f4e1c1',stroke:'#1d2160','stroke-width':1.5},deco);el('path',{d:`M${x-15},${y-11} L${x},${y-24} L${x+15},${y-11} Z`,fill:'#b5523b',stroke:'#1d2160','stroke-width':1.5},deco);}
  }
  /* compass */
  const cp=el('g',{transform:`translate(${W-62},${H-62})`},svg);
  el('circle',{r:30,fill:'#fff',stroke:'#1d2160','stroke-width':3},cp);
  el('path',{d:'M0,-22 L7,0 L0,22 L-7,0 Z',fill:'#ff4f9a',stroke:'#1d2160','stroke-width':2},cp);
  el('text',{y:-34,'text-anchor':'middle','font-family':'Baloo 2, sans-serif','font-weight':800,'font-size':14,fill:'#1d2160'},cp).textContent='B';
  /* route: faint full trail + coloured progress per segment */
  const trail=el('g',{},svg),prog=el('g',{},svg);
  Q.prog=[null];
  segs.forEach((s,i)=>{if(!s)return;
    const d=pathD(s),col=V.dayColor(stamps[i].day);
    el('path',{d,fill:'none',stroke:'#fff',opacity:.9,'stroke-width':10,'stroke-linecap':'round','stroke-linejoin':'round'},trail);
    el('path',{d,fill:'none',stroke:'#c8cbe8','stroke-width':4,'stroke-dasharray':'2 9','stroke-linecap':'round'},trail);
    const p=el('path',{d,fill:'none',stroke:col,'stroke-width':6,'stroke-linecap':'round','stroke-linejoin':'round'},prog);
    const L=p.getTotalLength?p.getTotalLength():polyLen(s);
    p.setAttribute('stroke-dasharray',`${L} ${L}`);p.setAttribute('stroke-dashoffset',L);
    Q.prog.push({p,L});
  });
  /* pins + labels (one per place; the return-to-start row reuses the start pin) */
  const pins=el('g',{},svg);Q.pins=[];
  const placed=[];
  stamps.forEach((s,i)=>{
    if(s.ret){Q.pins.push(Q.pins[0]);return;}
    const [x,y]=pos[i],st=V.stopById(trip,s.id);
    const g=el('g',{transform:`translate(${x.toFixed(1)},${y.toFixed(1)})`},pins);
    const pulse=el('circle',{r:16,fill:'none',stroke:V.dayColor(s.day),'stroke-width':4,class:'qpulse',opacity:0},g);
    const dot=el('circle',{r:15,fill:'#fff',stroke:'#1d2160','stroke-width':3},g);
    const tx=el('text',{y:5,'text-anchor':'middle','font-family':'Baloo 2, sans-serif','font-weight':800,'font-size':14,fill:'#9a9dc8'},g);
    tx.textContent=s.start?'★':String(i+1);
    const above=placed.some(p=>Math.abs(p[0]-x)<120&&p[1]>y&&p[1]-y<44);
    const lb=el('text',{y:above?-24:34,'text-anchor':'middle','font-family':'Baloo 2, sans-serif','font-weight':800,'font-size':15,fill:'#1d2160',
      stroke:'#fff','stroke-width':4,'paint-order':'stroke','stroke-linejoin':'round'},g);
    lb.textContent=st.name.length>26?st.name.slice(0,25)+'…':st.name;
    placed.push([x,y]);
    Q.pins.push({pulse,dot,tx,day:s.day});
  });
  /* traveller badge */
  Q.rider=el('g',{},svg);
  const inner=el('g',{class:'bob'},Q.rider);
  el('ellipse',{cx:0,cy:20,rx:16,ry:5,fill:'rgba(20,30,60,.25)'},inner);
  el('circle',{r:19,fill:'#fff',stroke:'#1d2160','stroke-width':3},inner);
  el('text',{y:7,'text-anchor':'middle','font-size':21},inner).textContent='🛵';
  $('qLegend').innerHTML=plan.days.map((d,i)=>`<span><i style="background:${V.dayColor(i)}"></i>${V.esc(V.dayLabel(trip,i).split(' · ')[0])}</span>`).join('');
}
function placeRider([x,y]){Q.rider.setAttribute('transform',`translate(${x.toFixed(1)},${(y-30).toFixed(1)})`);follow(x);}
function follow(x){const sc=$('qScroll');if(sc.scrollWidth<=sc.clientWidth+2)return;sc.scrollLeft=x/W*sc.scrollWidth-sc.clientWidth/2;}
function paintPins(){
  Q.pins.forEach((p,i)=>{if(!p||Q.stamps[i].ret)return;
    const done=i<=Q.cur;p.dot.setAttribute('fill',done?V.dayColor(p.day):'#fff');p.tx.setAttribute('fill',done?'#fff':'#9a9dc8');
    p.pulse.setAttribute('opacity',(i===Q.cur||(Q.stamps[Q.cur].ret&&i===0))?1:0);});
}

/* ---------------------------------------------------------------- panel */
const CHEERS=['Tới nơi rồi, chụp ảnh nào!','Đẹp quá trời luôn!','Nghỉ chân chút nhé!','Check-in thôi cả nhà!','Ở đây có gì ngon ta?','Gió mát ghê!'];
function panel(){
  const {trip,plan,stamps,cur}=Q,s=stamps[cur],st=V.stopById(trip,s.id);
  const day=plan.days[s.day],lastOfDay=day.rows.length&&day.rows[day.rows.length-1].id===s.id&&!s.start&&s.day<plan.days.length-1;
  const chip=$('qDay');chip.textContent=V.dayLabel(trip,s.day);chip.style.background=V.dayColor(s.day);
  $('qTime').textContent=s.start?`Xuất phát ${V.fmtClock(s.leave)}`:s.stay>0?`${V.fmtClock(s.arrive)}–${V.fmtClock(s.leave)}`:`Tới ${V.fmtClock(s.arrive)}`;
  $('qCount').textContent=`Điểm ${cur+1} / ${stamps.length}`;
  $('qName').textContent=s.ret?`Về lại ${st.name}`:st.name;
  $('qSub').textContent=st.sub||'';$('qSub').hidden=!st.sub;
  $('qGreet').textContent='“'+(s.start?'Lên đường thôi!':s.ret?'Về tới nơi rồi, chuyến đi tuyệt quá!':lastOfDay?'Nghỉ ngơi đã, mai đi tiếp nhé!':CHEERS[cur%CHEERS.length])+'”';
  const bits=[];
  if(!s.start)bits.push(`🛵 Chặng vừa rồi: ${V.fmtDur(s.drive)} · ${V.fmtKm(s.dist)}.`);
  if(s.stay>0&&!s.start)bits.push(`Dừng ${V.fmtDur(s.stay)}.`);
  if(lastOfDay)bits.push('🌙 Ngủ đêm tại đây.');
  if(s.start)bits.push(`${plan.days.length} ngày · ${stamps.length} điểm dừng đang chờ phía trước.`);
  $('qInfo').textContent=bits.join(' ');
  V.renderPassport($('qLog'),trip,plan,{quest:true,current:cur,onPick:k=>{stopAuto();if(k===Q.cur+1)travel(k);else jump(k);}});
  const row=$('qLog').querySelector('.logrow.current');
  if(row){const box=$('qLog');box.scrollTop=row.offsetTop-box.offsetTop-box.clientHeight/2+row.offsetHeight/2;}
  $('qStamps').textContent=`${cur+1} / ${stamps.length} dấu`;$('qBar').style.width=`${(cur+1)/stamps.length*100}%`;
  $('qPrev').disabled=Q.moving||cur===0;$('qNext').disabled=Q.moving;
  $('qNext').textContent=cur===stamps.length-1?'Hoàn thành 🎉':'Đi tiếp ›';
}

/* ---------------------------------------------------------------- moves */
function showProgress(upto){Q.prog.forEach((g,i)=>{if(g)g.p.setAttribute('stroke-dashoffset',i<=upto?0:g.L);});}
function jump(i){
  cancelAnimationFrame(Q.raf);Q.moving=false;$('qFinale').hidden=true;
  Q.cur=Math.max(0,Math.min(Q.stamps.length-1,i));
  showProgress(Q.cur);placeRider(Q.pos[Q.cur]);paintPins();panel();
}
function travel(i){
  if(Q.moving||i<1||i>=Q.stamps.length)return;
  const seg=Q.segs[i],L=polyLen(seg),g=Q.prog[i];
  Q.moving=true;$('qPrev').disabled=true;$('qNext').disabled=true;
  const dur=reduce?0:Math.min(3200,Math.max(700,L/240*1000)),t0=performance.now();
  const step=now=>{
    const p=dur?Math.min(1,(now-t0)/dur):1,e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    placeRider(pointAt(seg,e*L));if(g)g.p.setAttribute('stroke-dashoffset',g.L*(1-e));
    if(p<1){Q.raf=requestAnimationFrame(step);return;}
    Q.moving=false;Q.cur=i;paintPins();panel();
    if(Q.auto)Q.timer=setTimeout(next,2600);
  };
  Q.raf=requestAnimationFrame(step);
}
function next(){if(!Q||Q.moving)return;if(Q.cur>=Q.stamps.length-1){finale();return;}travel(Q.cur+1);}
function finale(){
  stopAuto();
  const {trip,plan,stamps}=Q,drive=plan.days.reduce((a,d)=>a+d.drive,0),dist=plan.days.reduce((a,d)=>a+d.dist,0);
  $('qFinTitle').textContent=`Hoàn thành “${trip.name}”!`;
  $('qFinText').textContent=`${stamps.length} con dấu · ${plan.days.length} ngày · 🛵 ${V.fmtDur(drive)} · ${V.fmtKm(dist)}`;
  $('qFinale').hidden=false;$('qReplay').focus({preventScroll:true});
}
function setAuto(on){Q.auto=on;clearTimeout(Q.timer);const b=$('qAuto');b.setAttribute('aria-pressed',String(on));b.textContent=on?'❚❚ Tạm dừng':'▶ Tự động';}
function stopAuto(){if(Q)setAuto(false);}

/* ---------------------------------------------------------------- open / close */
function open(trip,plan){
  Q={trip,plan,stamps:V.passportStamps(trip,plan),cur:0,moving:false,auto:false,timer:0,raf:0};
  $('qTitle').textContent=trip.name;
  ov.hidden=false;document.documentElement.style.overflow='hidden';ov.scrollTop=0;
  try{draw();}catch(e){close();V.toast('Không vẽ được bản đồ Quest cho chuyến này.');return;}
  setAuto(false);jump(0);$('qNext').focus({preventScroll:true});
}
function close(){
  if(!Q)return;cancelAnimationFrame(Q.raf);clearTimeout(Q.timer);Q=null;
  ov.hidden=true;document.documentElement.style.overflow='';$('questBtn').focus({preventScroll:true});
}
$('qClose').addEventListener('click',close);
$('qNext').addEventListener('click',()=>{stopAuto();next();});
$('qPrev').addEventListener('click',()=>{if(!Q||Q.moving)return;stopAuto();jump(Q.cur-1);});
$('qAuto').addEventListener('click',()=>{if(!Q)return;const on=!Q.auto;
  if(on&&!$('qFinale').hidden)jump(0);
  setAuto(on);if(on&&!Q.moving)Q.timer=setTimeout(next,600);});
$('qReplay').addEventListener('click',()=>{jump(0);setAuto(true);Q.timer=setTimeout(next,800);});
document.addEventListener('keydown',e=>{
  if(!Q||ov.hidden)return;
  if(e.key==='Escape'){e.preventDefault();close();}
  else if(e.key==='ArrowRight'&&!e.target.closest('select,input')){e.preventDefault();stopAuto();next();}
  else if(e.key==='ArrowLeft'&&!e.target.closest('select,input')){e.preventDefault();if(!Q.moving){stopAuto();jump(Q.cur-1);}}
});
window.Quest={open,close};
})();
