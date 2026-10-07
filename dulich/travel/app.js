/* Việt Nam Quest · trip planner on open map data.
   Search: Photon (OSM). Driving times + routes: OSRM public servers. Map: Leaflet + CARTO tiles.
   Everything runs in the browser; trips live in localStorage and can be shared as a link. */
(function(){
'use strict';

/* ---------------------------------------------------------------- helpers */
const $=id=>document.getElementById(id);
const DAY_COLORS=['#ff4f9a','#11b3ae','#ff8a1f','#7a6cf0','#e8423f','#2f9e44','#1c7ed6','#c2255c'];
const dayColor=i=>DAY_COLORS[i%DAY_COLORS.length];
/* OSRM assumes free-flowing car speeds; Vietnamese roads (and mountain passes even more) are much slower */
const TERRAIN={plain:1.3,mountain:2.0};
const WD=['CN','T2','T3','T4','T5','T6','T7'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,10);
function fmtDur(min){min=Math.max(0,Math.round(min));const h=Math.floor(min/60),m=min%60;return h?(m?`${h}h${String(m).padStart(2,'0')}`:`${h}h`):`${m} phút`;}
function fmtKm(m){const km=m/1000;return km<10?km.toFixed(1).replace('.',',')+' km':Math.round(km)+' km';}
function fmtClock(min){min=Math.round(min);const d=Math.floor(min/1440);min-=d*1440;return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}${d?' (+'+d+')':''}`;}
function parseClock(s){const [h,m]=String(s||'07:30').split(':').map(Number);return (h||0)*60+(m||0);}
function haversine(a,b){const R=6371e3,r=x=>x*Math.PI/180,dl=r(b.lat-a.lat),dn=r(b.lng-a.lng);
  const h=Math.sin(dl/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function dayLabel(trip,i){
  if(!trip.date)return `Ngày ${i+1}`;
  const d=new Date(trip.date+'T00:00:00');if(isNaN(d))return `Ngày ${i+1}`;
  d.setDate(d.getDate()+i);return `Ngày ${i+1} · ${WD[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`;
}
let toastTimer=0;
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},3200);}
const debounce=(fn,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};

/* ---------------------------------------------------------------- storage */
const KEY='vnq-trips-v1',CUR='vnq-current';
const store={
  load(){try{const v=JSON.parse(localStorage.getItem(KEY));return Array.isArray(v)?v:[];}catch(e){return [];}},
  save(list){try{localStorage.setItem(KEY,JSON.stringify(list));return true;}catch(e){return false;}},
  cur(){try{return localStorage.getItem(CUR);}catch(e){return null;}},
  setCur(id){try{localStorage.setItem(CUR,id);}catch(e){}}
};

/* ---------------------------------------------------------------- sample trip */
const S=(name,sub,lat,lng,stay,night)=>({id:uid(),name,sub,lat,lng,stay,night:!!night});
function sampleHaGiang(){
  return {id:uid(),name:'Hà Giang 3N2Đ (chuyến mẫu)',date:'2026-10-11',days:3,dayStart:'07:30',maxDrive:6,terrain:'mountain',end:'loop',optimize:true,
    stops:[
      S('TP Hà Giang · Cột mốc Km0','Thành phố Hà Giang',22.8233,104.9836,30),
      S('Rừng thông Yên Minh','Thị trấn Yên Minh',23.1172,105.1491,60),
      S('Thung lũng Sủng Là','Nhà của Pao, ruộng tam giác mạch',23.2326,105.2163,45),
      S('Dinh Vua Mèo','Thung lũng Sà Phìn',23.2562,105.2621,60),
      S('Cột cờ Lũng Cú','Điểm cực Bắc',23.3635,105.3163,60),
      S('Làng Lô Lô Chải','Homestay nhà trình tường',23.3642,105.3101,30,true),
      S('Phố cổ Đồng Văn','Cháo ấu tẩu, bánh cuốn trứng',23.2797,105.3608,60),
      S('Đèo Mã Pì Lèng','Ngắm vực Tu Sản',23.2420,105.3979,45),
      S('Thuyền sông Nho Quế','Hẻm Tu Sản',23.2290,105.4120,90),
      S('Phố núi Mèo Vạc','Ăn trưa, đổ xăng',23.1633,105.4104,60),
      S('Núi Đôi · Tam Sơn','Quản Bạ',23.0727,104.9876,30,true),
      S('Cổng Trời Quản Bạ','Ngắm toàn cảnh thung lũng',23.0493,104.9930,45),
      S('Thạch Sơn Thần','Rừng đá Quản Bạ',23.0257,104.9707,30),
      S('Dốc Bắc Sum','Cung đường ziczac',22.9882,104.9359,20)
    ]};
}
function blankTrip(){
  const d=new Date();d.setDate(d.getDate()+7);
  return {id:uid(),name:'Chuyến đi mới',date:d.toISOString().slice(0,10),days:2,dayStart:'07:30',maxDrive:5,terrain:'plain',end:'free',optimize:true,stops:[]};
}

/* ---------------------------------------------------------------- services */
const OSRM=['https://router.project-osrm.org','https://routing.openstreetmap.de/routed-car'];
const PHOTON='https://photon.komoot.io';
const VN_BBOX='102.1,8.2,109.6,23.5';
async function fetchJson(url,ms){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms||12000);
  try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
  finally{clearTimeout(t);}
}
async function osrm(path){
  let err;
  for(const base of OSRM){try{const j=await fetchJson(base+path,15000);if(j.code==='Ok')return j;err=new Error(j.code||'osrm');}catch(e){err=e;}}
  throw err;
}
const coordStr=pts=>pts.map(p=>`${(+p.lng).toFixed(6)},${(+p.lat).toFixed(6)}`).join(';');
/* straight-line fallback when the routing servers are unreachable */
const estDist=(a,b)=>haversine(a,b)*1.35;
const estDur=(a,b)=>estDist(a,b)/(45/3.6);

async function getMatrix(pts){
  const n=pts.length;
  try{
    const j=await osrm(`/table/v1/driving/${coordStr(pts)}?annotations=duration,distance`);
    const dur=[],dist=[];let holes=0;
    for(let i=0;i<n;i++){dur.push([]);dist.push([]);for(let k=0;k<n;k++){
      let du=j.durations?.[i]?.[k],di=j.distances?.[i]?.[k];
      if(du==null||di==null){du=estDur(pts[i],pts[k]);di=estDist(pts[i],pts[k]);if(i!==k)holes++;}
      dur[i].push(du);dist[i].push(di);}}
    return {dur,dist,estimated:holes>0};
  }catch(e){
    const dur=pts.map(a=>pts.map(b=>estDur(a,b))),dist=pts.map(a=>pts.map(b=>estDist(a,b)));
    return {dur,dist,estimated:true};
  }
}
async function getRoute(pts){
  try{
    const j=await osrm(`/route/v1/driving/${coordStr(pts)}?overview=full&geometries=geojson&steps=false`);
    const r=j.routes[0];
    return {coords:simplify(r.geometry.coordinates.map(([x,y])=>[+y.toFixed(5),+x.toFixed(5)]),500),legs:r.legs.map(l=>({dur:l.duration,dist:l.distance})),estimated:false};
  }catch(e){
    const legs=[];for(let i=1;i<pts.length;i++)legs.push({dur:estDur(pts[i-1],pts[i]),dist:estDist(pts[i-1],pts[i])});
    return {coords:pts.map(p=>[p.lat,p.lng]),legs,estimated:true};
  }
}
/* keep at most `max` points (evenly sampled, always keeping both ends) */
function simplify(coords,max){
  if(coords.length<=max)return coords;
  const out=[],step=(coords.length-1)/(max-1);
  for(let i=0;i<max;i++)out.push(coords[Math.round(i*step)]);
  return out;
}
async function searchPlaces(q){
  const j=await fetchJson(`${PHOTON}/api/?limit=7&lang=default&bbox=${VN_BBOX}&q=${encodeURIComponent(q)}`,8000);
  return (j.features||[]).map(featureToPlace).filter(Boolean);
}
async function reversePlace(lat,lng){
  try{const j=await fetchJson(`${PHOTON}/reverse?lat=${lat}&lon=${lng}&limit=1&lang=default`,8000);const p=(j.features||[]).map(featureToPlace)[0];if(p){p.lat=lat;p.lng=lng;return p;}}catch(e){}
  return {name:`Điểm ${lat.toFixed(4)}, ${lng.toFixed(4)}`,sub:'Chọn trên bản đồ',lat,lng};
}
function featureToPlace(f){
  const p=f.properties||{},c=f.geometry&&f.geometry.coordinates;if(!c)return null;
  const name=p.name||[p.street,p.housenumber].filter(Boolean).join(' ')||p.city||p.county||p.state;if(!name)return null;
  const sub=[p.street&&p.name?p.street:null,p.district,p.city&&p.city!==name?p.city:null,p.county&&p.county!==name?p.county:null,p.state&&p.state!==name?p.state:null]
    .filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
  return {name,sub,lat:+c[1],lng:+c[0]};
}

/* ---------------------------------------------------------------- planning
   Node 0 is the fixed start. D is a matrix of minutes (already scaled for terrain).
   solveOrder visits nodes 1..n-1 starting at 0; E[v] is the cost of finishing at v (0 = open end). */
function routeCost(D,order,E){let c=0,p=0;for(const v of order){c+=D[p][v];p=v;}return c+E[p];}
function solveOrder(D,E){
  const n=D.length,m=n-1;
  if(m<=1)return m===1?[1]:[];
  if(m<=11){                                   /* exact: Held–Karp over the stops */
    const FULL=1<<m,INF=1e15,dp=new Float64Array(FULL*m).fill(INF),par=new Int16Array(FULL*m).fill(-1);
    for(let j=0;j<m;j++)dp[(1<<j)*m+j]=D[0][j+1];
    for(let mask=1;mask<FULL;mask++)for(let j=0;j<m;j++){
      const cur=dp[mask*m+j];if(cur>=INF||!(mask&(1<<j)))continue;
      for(let k=0;k<m;k++){if(mask&(1<<k))continue;const nm=mask|(1<<k),v=cur+D[j+1][k+1];if(v<dp[nm*m+k]){dp[nm*m+k]=v;par[nm*m+k]=j;}}
    }
    let best=INF,last=0;
    for(let j=0;j<m;j++){const v=dp[(FULL-1)*m+j]+E[j+1];if(v<best){best=v;last=j;}}
    const order=[];let mask=FULL-1,j=last;
    while(j>=0){order.push(j+1);const p=par[mask*m+j];mask&=~(1<<j);j=p;}
    return order.reverse();
  }
  /* larger trips: nearest neighbour, then 2-opt + relocate until nothing improves */
  const left=new Set([...Array(m)].map((_,i)=>i+1)),order=[];let p=0;
  while(left.size){let b=-1,bv=Infinity;for(const v of left)if(D[p][v]<bv){bv=D[p][v];b=v;}order.push(b);left.delete(b);p=b;}
  let best=routeCost(D,order,E),improved=true,guard=0;
  while(improved&&guard++<60){
    improved=false;
    for(let i=0;i<order.length-1;i++)for(let k=i+1;k<order.length;k++){
      const cand=order.slice(0,i).concat(order.slice(i,k+1).reverse(),order.slice(k+1)),c=routeCost(D,cand,E);
      if(c<best-1e-9){order.splice(0,order.length,...cand);best=c;improved=true;}
    }
    for(let i=0;i<order.length;i++)for(let k=0;k<order.length;k++){
      if(i===k)continue;const cand=order.slice();const [v]=cand.splice(i,1);cand.splice(k,0,v);const c=routeCost(D,cand,E);
      if(c<best-1e-9){order.splice(0,order.length,...cand);best=c;improved=true;}
    }
  }
  return order;
}
/* best order for `nodes` on a path from `start` that must finish at `end` (-1 = finish anywhere) */
function orderPath(D,start,nodes,end){
  if(!nodes.length)return [];
  const idx=[start,...nodes],Dl=idx.map(a=>idx.map(b=>D[a][b])),E=idx.map(a=>end>=0?D[a][end]:0);
  return solveOrder(Dl,E).map(j=>idx[j]);
}
function permutations(a){if(a.length<=1)return [a.slice()];const out=[];a.forEach((v,i)=>permutations(a.filter((_,k)=>k!==i)).forEach(p=>out.push([v,...p])));return out;}
/* With fixed nights, the nights are the day boundaries: try each order of the nights, slot every other stop
   into the day where it adds the least detour (keeping days balanced), then reorder inside each day. */
function anchorPlan(D,stays,nights,loop){
  const n=D.length,others=[];for(let v=1;v<n;v++)if(!nights.includes(v))others.push(v);
  const tries=nights.length<=5?permutations(nights):[orderPath(D,0,nights,loop?0:-1)];
  const totalStay=stays.reduce((a,b)=>a+b,0);
  let best=null;
  for(const nightOrder of tries){
    const K=nightOrder.length+1;
    const days=[...Array(K)].map((_,d)=>({from:d?nightOrder[d-1]:0,to:d<K-1?nightOrder[d]:(loop?0:-1),seq:[]}));
    const load=d=>{let c=0,p=d.from;for(const v of d.seq){c+=D[p][v]+stays[v];p=v;}if(d.to>=0)c+=D[p][d.to]+stays[d.to];return c;};
    const loads=days.map(load);
    const left=new Set(others);
    while(left.size){
      const target=(loads.reduce((a,b)=>a+b,0)+[...left].reduce((a,v)=>a+stays[v],0))/K;
      let pick=null;
      for(const v of left)days.forEach((d,di)=>{
        for(let p=0;p<=d.seq.length;p++){
          const a=p?d.seq[p-1]:d.from,b=p<d.seq.length?d.seq[p]:d.to;
          const delta=D[a][v]+stays[v]+(b>=0?D[v][b]-D[a][b]:0),score=delta+1.5*Math.max(0,loads[di]+delta-target);
          if(!pick||score<pick.score)pick={v,di,p,score};
        }
      });
      days[pick.di].seq.splice(pick.p,0,pick.v);loads[pick.di]=load(days[pick.di]);left.delete(pick.v);
    }
    /* From here only the day of each stop is searched; the order inside a day is always the optimal one (days are small). */
    const cache=new Map();
    const dayBest=(d,set)=>{
      const key=d.from+'|'+d.to+'|'+set.slice().sort((a,b)=>a-b).join(',');
      let r=cache.get(key);
      if(!r){const seq=orderPath(D,d.from,set,d.to);r={seq,load:load({from:d.from,to:d.to,seq})};cache.set(key,r);}
      return r;
    };
    const sets=days.map(d=>d.seq.slice());
    /* total driving + the heaviest day; a day that ends at a hotel should not be tiny (arriving at 11am).
       A short last day is fine, it is the way home. */
    const scoreOf=()=>{const ls=sets.map((s,i)=>dayBest(days[i],s).load),drive=ls.reduce((a,b)=>a+b,0)-totalStay,mean=(drive+totalStay)/K;
      return drive+Math.max(...ls)+2*ls.reduce((a,l,i)=>a+(i<K-1?Math.max(0,mean*.75-l):0),0);};
    let cur=scoreOf(),moved=true,guard=0;
    while(moved&&guard++<60){moved=false;
      for(let di=0;di<K;di++)for(let i=0;i<sets[di].length;i++)for(let dj=0;dj<K;dj++){   /* relocate one stop */
        if(dj===di)continue;const v=sets[di][i];
        sets[di].splice(i,1);sets[dj].push(v);const s=scoreOf();
        if(s<cur-1e-6){cur=s;moved=true;i--;break;}
        sets[dj].pop();sets[di].splice(i,0,v);
      }
      for(let di=0;di<K;di++)for(let dj=di+1;dj<K;dj++)for(let i=0;i<sets[di].length;i++)for(let j=0;j<sets[dj].length;j++){   /* swap two stops */
        const u=sets[di][i],v=sets[dj][j];sets[di][i]=v;sets[dj][j]=u;const s=scoreOf();
        if(s<cur-1e-6){cur=s;moved=true;}else{sets[di][i]=u;sets[dj][j]=v;}
      }
    }
    days.forEach((d,i)=>{d.seq=dayBest(d,sets[i]).seq;});
    const score=cur;
    if(!best||score<best.score)best={score,days};
  }
  /* flatten into the same shape splitDays returns */
  const seq=[],groups=[];
  best.days.forEach(d=>{const a=seq.length;d.seq.forEach(v=>seq.push(v));if(d.to>=0)seq.push(d.to);groups.push([a,seq.length]);});
  return {seq,groups:groups.filter(([a,b])=>b>a)};
}
/* Split the ordered items into K consecutive days, as evenly as possible (min sum of squared day loads).
   A stop marked as a fixed night must close its day. */
function splitDays(items,K){
  const m=items.length,forced=items.map((it,i)=>it.night&&i<m-1),need=forced.filter(Boolean).length+1;
  const warnings=[];
  let k=Math.max(1,Math.min(K,m));
  if(need>k){warnings.push(`Có ${need-1} đêm ngủ cố định nên chuyến cần ít nhất ${need} ngày. Đã tính theo ${need} ngày.`);k=need;}
  if(m<K)warnings.push(`Chỉ có ${m} điểm cho ${K} ngày nên chia thành ${m} ngày.`);
  const pre=[0];items.forEach(it=>pre.push(pre[pre.length-1]+it.load));
  const fpre=[0];forced.forEach(f=>fpre.push(fpre[fpre.length-1]+(f?1:0)));
  const INF=1e18,best=[...Array(k+1)].map(()=>new Array(m+1).fill(INF)),from=[...Array(k+1)].map(()=>new Array(m+1).fill(-1));
  best[0][0]=0;
  for(let d=1;d<=k;d++)for(let j=d;j<=m;j++)for(let i=d-1;i<j;i++){
    if(best[d-1][i]>=INF)continue;
    if(fpre[j-1]-fpre[i]>0)continue;                       /* a fixed night inside the day (not at its end) */
    const load=pre[j]-pre[i],v=best[d-1][i]+load*load;
    if(v<best[d][j]){best[d][j]=v;from[d][j]=i;}
  }
  const groups=[];let j=m;
  for(let d=k;d>=1;d--){const i=from[d][j];groups.unshift([i,j]);j=i;}
  return {groups,warnings};
}
function planSig(trip){
  return JSON.stringify([trip.stops.map(s=>[s.lat,s.lng,s.stay,s.night]),trip.days,trip.dayStart,trip.terrain,trip.end,trip.optimize]);
}
async function buildPlan(trip){
  const stops=trip.stops;
  if(stops.length<2)throw new Error('Cần ít nhất 2 điểm: điểm xuất phát và 1 điểm đến.');
  const loop=trip.end==='loop',k=TERRAIN[trip.terrain]||1.3;
  const M=await getMatrix(stops);
  const D=M.dur.map(r=>r.map(s=>s/60*k));
  const stays=stops.map((s,i)=>i?(+s.stay||0):0),nights=[];stops.forEach((s,i)=>{if(i&&s.night)nights.push(i);});
  const K=Math.max(1,+trip.days||1);
  let seq,groups,warnings=[];
  if(trip.optimize&&nights.length){
    ({seq,groups}=anchorPlan(D,stays,nights,loop));
    if(groups.length!==K)warnings.push(`Có ${nights.length} chỗ ngủ cố định nên chuyến được chia thành ${groups.length} ngày (bạn đặt ${K} ngày). Muốn thêm ngày thì bấm 🌙 ở thêm chỗ ngủ.`);
  }else{
    const order=trip.optimize?solveOrder(D,D.map(r=>loop?r[0]:0)):stops.slice(1).map((_,i)=>i+1);
    seq=loop?order.concat([0]):order;
    const sp=splitDays(seq.map((idx,pos)=>({load:D[pos?seq[pos-1]:0][idx]+stays[idx],night:nights.includes(idx)})),K);
    groups=sp.groups;warnings=sp.warnings;
  }
  const items=seq.map((idx,pos)=>({idx,drive:D[pos?seq[pos-1]:0][idx],stay:stays[idx]}));
  let estimated=M.estimated;const days=[];let prevIdx=0;const start=parseClock(trip.dayStart),maxD=(+trip.maxDrive||5)*60;
  for(const [a,b] of groups){
    const g=items.slice(a,b),pts=[stops[prevIdx],...g.map(it=>stops[it.idx])];
    const r=await getRoute(pts);estimated=estimated||r.estimated;
    let t=start,drive=0,dist=0;const rows=[];
    g.forEach((it,i)=>{
      const leg=r.legs[i]||{dur:it.drive*60/k,dist:0},dm=leg.dur/60*k;
      t+=dm;drive+=dm;dist+=leg.dist;
      const arrive=t;t+=it.stay;
      rows.push({id:stops[it.idx].id,ret:it.idx===0,arrive,leave:t,drive:dm,dist:leg.dist});
    });
    days.push({from:stops[prevIdx].id,depart:start,rows,drive,dist,end:t,over:drive>maxD,late:t>21*60,geom:r.coords});
    prevIdx=g[g.length-1].idx;
  }
  days.forEach((d,i)=>{
    if(d.over)warnings.push(`${dayLabel(trip,i).split(' · ')[0]}: chạy xe khoảng ${fmtDur(d.drive)}, quá mức ${fmtDur(maxD)} bạn đặt.`);
    else if(d.late)warnings.push(`${dayLabel(trip,i).split(' · ')[0]}: tới nơi cuối khoảng ${fmtClock(d.end)}, khá muộn.`);
  });
  if(estimated)warnings.unshift('Không kết nối được máy chủ tính đường nên một phần thời gian chạy xe đang ước tính theo đường chim bay.');
  return {sig:planSig(trip),at:Date.now(),estimated,days,warnings};
}

/* ---------------------------------------------------------------- state */
let trips=store.load(),trip=null,busy=false;
function persist(){if(!store.save(trips))toast('Không lưu được vào trình duyệt (bộ nhớ bị chặn hoặc đầy).');}
const persistSoon=debounce(persist,300);
const byId=id=>trip.stops.find(s=>s.id===id);
const isStale=()=>!trip.plan||trip.plan.sig!==planSig(trip);

/* ---------------------------------------------------------------- map */
const map=L.map('map',{zoomControl:true,attributionControl:true}).setView([16.2,106.3],6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const layer=L.layerGroup().addTo(map);
const markers=new Map();
function pinIcon(label,color,start){
  return L.divIcon({className:'',iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-14],
    html:`<div class="pin${start?' start':''}" style="--pc:${color}">${esc(label)}</div>`});
}
function renderMap(fit){
  layer.clearLayers();markers.clear();
  const plan=!isStale()?trip.plan:null,bounds=[];
  if(plan){
    plan.days.forEach((d,i)=>{
      if(d.geom.length>1){L.polyline(d.geom,{color:'#fff',weight:9,opacity:.95}).addTo(layer);
        L.polyline(d.geom,{color:dayColor(i),weight:5,opacity:1,dashArray:d.geom.length===d.rows.length+1?'8 8':null}).addTo(layer);}
      d.geom.forEach(p=>bounds.push(p));
    });
  }
  const info=stampInfo(plan);
  trip.stops.forEach((s,idx)=>{
    const st=info.get(s.id);
    const label=idx===0?'★':st?String(st.n):String(idx+1),color=st?dayColor(st.day):'#9a9dc8';
    const m=L.marker([s.lat,s.lng],{icon:pinIcon(label,color,idx===0),title:s.name,keyboard:true}).addTo(layer);
    const time=st?`<br>${esc(dayLabel(trip,st.day))} · ${fmtClock(st.arrive)}${st.stay?`–${fmtClock(st.leave)}`:''}`:'';
    m.bindPopup(`<b>${esc(s.name)}</b>${s.sub?`<br><span style="color:#5b5f8f">${esc(s.sub)}</span>`:''}${time}${s.night?'<br>🌙 Ngủ đêm tại đây':''}`);
    markers.set(s.id,m);bounds.push([s.lat,s.lng]);
  });
  if(fit&&bounds.length){if(bounds.length===1)map.setView(bounds[0],12);else map.fitBounds(bounds,{padding:[36,36],maxZoom:13});}
  renderLegend(plan);
}
function renderLegend(plan){
  const lg=$('legend');
  if(!plan){lg.innerHTML='<span class="hint">Bấm lên bản đồ để thêm điểm ngay tại chỗ đó.</span>';return;}
  lg.innerHTML=plan.days.map((d,i)=>`<span><i style="background:${dayColor(i)}"></i>${esc(dayLabel(trip,i))}</span>`).join('');
}
/* stamp number / day / times for each stop in the current plan */
function stampInfo(plan){
  const info=new Map();if(!plan)return info;
  const start=trip.stops[0];if(start)info.set(start.id,{n:1,day:0,arrive:plan.days[0].depart,leave:plan.days[0].depart,stay:0});
  let n=1;
  plan.days.forEach((d,i)=>d.rows.forEach(r=>{if(r.ret)return;n++;info.set(r.id,{n,day:i,arrive:r.arrive,leave:r.leave,stay:r.leave>r.arrive});}));
  return info;
}
/* a click that only closes an open popup should not also add a stop */
let popupClosedAt=0;
map.on('popupclose',()=>{popupClosedAt=Date.now();});
map.on('click',async e=>{
  if(busy||Date.now()-popupClosedAt<350)return;
  const {lat,lng}=e.latlng;
  const p=await reversePlace(+lat.toFixed(5),+lng.toFixed(5));
  addStop(p);
});

/* ---------------------------------------------------------------- passport (shared with the Quest view) */
/* Builds the day-by-day passport. opts.quest marks rows as done/current; opts.onPick(stampIndex) on click. */
function passportStamps(t,plan){
  const out=[],start=t.stops[0];
  out.push({id:start.id,day:0,arrive:plan.days[0].depart,leave:plan.days[0].depart,stay:0,start:true});
  plan.days.forEach((d,i)=>d.rows.forEach(r=>out.push({id:r.id,day:i,arrive:r.arrive,leave:r.leave,stay:r.leave-r.arrive,drive:r.drive,dist:r.dist,ret:r.ret})));
  return out;
}
function renderPassport(box,t,plan,opts){
  opts=opts||{};
  const stamps=passportStamps(t,plan),get=id=>t.stops.find(s=>s.id===id)||{name:'?'};
  let html='',k=0;
  plan.days.forEach((d,i)=>{
    const col=dayColor(i);
    html+=`<div class="logday" style="--dc:${col}"><span>${esc(dayLabel(t,i))}</span><span class="sum${d.over?' over':''}">🛵 ${fmtDur(d.drive)} · ${fmtKm(d.dist)}</span></div>`;
    if(i===0){const s=stamps[0],st=get(s.id);
      html+=row(k++,s,st,'★',`${fmtClock(s.leave)}`,'Xuất phát',col);}
    else html+=`<div class="logleg"><span class="ic">🌅</span><span class="t">${fmtClock(d.depart)}</span><span class="n">Rời ${esc(get(d.from).name)}</span></div>`;
    d.rows.forEach(r=>{
      const s=stamps[k],st=get(s.id);
      html+=`<div class="logleg"><span class="ic">🛵</span><span class="t">${fmtDur(r.drive)}</span><span class="n">${fmtKm(r.dist)}</span></div>`;
      const time=s.stay>0?`${fmtClock(s.arrive)}<br>–${fmtClock(s.leave)}`:fmtClock(s.arrive);
      html+=row(k++,s,st,s.ret?'↩':String(k),time,s.ret?'Về lại điểm xuất phát':'',col);
    });
    if(i<plan.days.length-1){const last=d.rows[d.rows.length-1];html+=`<div class="lognight">🌙 Ngủ tại ${esc(get(last.id).name)} · tới lúc ${fmtClock(d.end)}</div>`;}
    if(!opts.quest){const url=gmapsUrl(t,d);if(url)html+=`<div class="daylinks"><a class="gmap" href="${url}" target="_blank" rel="noopener">Mở ${esc(dayLabel(t,i).split(' · ')[0].toLowerCase())} trong Google Maps ↗</a></div>`;}
  });
  box.innerHTML=html;
  box.querySelectorAll('.logrow').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.k;if(opts.onPick)opts.onPick(i);}));
  function row(i,s,st,label,time,note,col){
    const cls=opts.quest?(i<=opts.current?' done':'')+(i===opts.current?' current':''):'';
    const sub=note||st.sub||'';
    return `<button type="button" class="logrow${cls}" data-k="${i}" style="--sc:${col}"><span class="stamp">${label}</span><span class="t">${time}</span><span class="n">${esc(st.name)}${sub?`<small>${esc(sub)}</small>`:''}</span></button>`;
  }
  return stamps;
}
/* Google Maps directions link for one day (no API key needed). URLs allow up to 9 waypoints. */
function gmapsUrl(t,d){
  const pts=[t.stops.find(s=>s.id===d.from),...d.rows.map(r=>t.stops.find(s=>s.id===r.id))].filter(Boolean);
  if(pts.length<2)return '';
  const ll=p=>`${p.lat},${p.lng}`,mid=pts.slice(1,-1).slice(0,9);
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${ll(pts[0])}&destination=${ll(pts[pts.length-1])}${mid.length?`&waypoints=${encodeURIComponent(mid.map(ll).join('|'))}`:''}`;
}

/* ---------------------------------------------------------------- editor UI */
function fillForm(){
  $('tripName').value=trip.name;$('tripDate').value=trip.date||'';$('tripDays').value=trip.days;
  $('dayStart').value=trip.dayStart;$('maxDrive').value=String(trip.maxDrive);$('terrain').value=trip.terrain;
  $('endMode').value=trip.end;$('optimize').checked=!!trip.optimize;
}
function renderTripSel(){
  $('tripSel').innerHTML=trips.map(t=>`<option value="${t.id}"${t.id===trip.id?' selected':''}>${esc(t.name)}</option>`).join('');
}
const STAYS=[0,15,30,45,60,90,120,180,240];
function renderStops(){
  const ul=$('stops');
  if(!trip.stops.length){ul.innerHTML='<li class="emptystops">Chưa có điểm nào. Tìm ở ô phía trên hoặc bấm lên bản đồ.</li>';return;}
  const info=stampInfo(!isStale()?trip.plan:null);
  ul.innerHTML=trip.stops.map((s,i)=>{
    const st=info.get(s.id),start=i===0;
    const stay=STAYS.includes(+s.stay)?+s.stay:45;
    return `<li class="stop${start?' start':''}" data-id="${s.id}">
      <span class="num" style="${start?'background:var(--ink);color:var(--sun)':st?`background:${dayColor(st.day)}`:''}">${start?'★':st?st.n:i+1}</span>
      <div style="min-width:0">${start?'<span class="tag">Xuất phát</span>':''}<div class="nm">${esc(s.name)}</div>${s.sub?`<div class="sb">${esc(s.sub)}</div>`:''}</div>
      <div class="ctl">
        <button class="iconbtn" type="button" data-act="up" aria-label="Đưa ${esc(s.name)} lên" ${i===0?'disabled':''}>↑</button>
        <button class="iconbtn" type="button" data-act="down" aria-label="Đưa ${esc(s.name)} xuống" ${i===trip.stops.length-1?'disabled':''}>↓</button>
        <button class="iconbtn" type="button" data-act="del" aria-label="Xóa ${esc(s.name)}">✕</button>
      </div>
      ${start?'':`<div class="opts">
        <select data-act="stay" aria-label="Thời gian dừng ở ${esc(s.name)}">${STAYS.map(v=>`<option value="${v}"${v===stay?' selected':''}>${v?`Dừng ${fmtDur(v)}`:'Chỉ đi qua'}</option>`).join('')}</select>
        <button class="nightbtn" type="button" data-act="night" aria-pressed="${s.night?'true':'false'}">🌙 ${s.night?'Ngủ ở đây':'Ngủ ở đây?'}</button>
      </div>`}
    </li>`;}).join('');
}
$('stops').addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b||b.tagName==='SELECT')return;
  const id=b.closest('.stop').dataset.id,i=trip.stops.findIndex(s=>s.id===id);if(i<0)return;
  const act=b.dataset.act;
  if(act==='up'&&i>0)[trip.stops[i-1],trip.stops[i]]=[trip.stops[i],trip.stops[i-1]];
  else if(act==='down'&&i<trip.stops.length-1)[trip.stops[i+1],trip.stops[i]]=[trip.stops[i],trip.stops[i+1]];
  else if(act==='del')trip.stops.splice(i,1);
  else if(act==='night')trip.stops[i].night=!trip.stops[i].night;
  changed();
  const again=$('stops').querySelector(`[data-id="${id}"] [data-act="${act}"]`);if(again&&!again.disabled)again.focus();
});
$('stops').addEventListener('change',e=>{
  const sel=e.target.closest('select[data-act="stay"]');if(!sel)return;
  const s=byId(sel.closest('.stop').dataset.id);if(s){s.stay=+sel.value;changed();}
});
function addStop(p){
  if(trip.stops.some(s=>Math.abs(s.lat-p.lat)<1e-4&&Math.abs(s.lng-p.lng)<1e-4)){toast(`“${p.name}” đã có trong danh sách.`);return;}
  trip.stops.push({id:uid(),name:p.name,sub:p.sub||'',lat:p.lat,lng:p.lng,stay:trip.stops.length?45:0,night:false});
  changed(true);toast(trip.stops.length===1?`Đã đặt “${p.name}” làm điểm xuất phát.`:`Đã thêm “${p.name}”.`);
}
function changed(fit){trip.updated=Date.now();persistSoon();renderStops();renderMap(!!fit);renderPlan();}
[['tripName','name'],['tripDate','date'],['tripDays','days'],['dayStart','dayStart'],['maxDrive','maxDrive'],['terrain','terrain'],['endMode','end']].forEach(([id,key])=>{
  $(id).addEventListener('input',()=>{
    let v=$(id).value;
    if(key==='days'){v=Math.max(1,Math.min(30,Math.round(+v)||1));}
    if(key==='maxDrive')v=+v;
    if(key==='dayStart'&&!v)return;
    trip[key]=v;
    if(key==='name')renderTripSel();
    changed();
  });
});
$('tripDays').addEventListener('change',()=>{$('tripDays').value=trip.days;});
$('optimize').addEventListener('change',()=>{trip.optimize=$('optimize').checked;changed();});

/* search box (combobox) */
const q=$('q'),res=$('results');let hits=[],sel=-1,seq=0;
function showResults(list,msg){
  hits=list;sel=list.length?0:-1;
  res.innerHTML=list.length?list.map((p,i)=>`<li role="option" id="r${i}" aria-selected="${i===sel}" data-i="${i}"><b>${esc(p.name)}</b>${p.sub?`<small>${esc(p.sub)}</small>`:''}</li>`).join('')
    :`<li class="empty" aria-disabled="true">${esc(msg||'Không tìm thấy, thử gõ tên khác hoặc bấm lên bản đồ.')}</li>`;
  res.hidden=false;q.setAttribute('aria-expanded','true');q.setAttribute('aria-activedescendant',sel>=0?'r'+sel:'');
}
function hideResults(){res.hidden=true;q.setAttribute('aria-expanded','false');q.removeAttribute('aria-activedescendant');}
const runSearch=debounce(async()=>{
  const text=q.value.trim(),my=++seq;
  if(text.length<2){hideResults();return;}
  showResults([],'Đang tìm…');
  try{const list=await searchPlaces(text);if(my===seq)showResults(list);}
  catch(e){if(my===seq)showResults([],'Không kết nối được dịch vụ tìm kiếm. Thử lại sau, hoặc bấm lên bản đồ để thêm điểm.');}
},350);
q.addEventListener('input',runSearch);
q.addEventListener('keydown',e=>{
  if(res.hidden||!hits.length){if(e.key==='Escape')hideResults();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();sel=(sel+(e.key==='ArrowDown'?1:-1)+hits.length)%hits.length;
    res.querySelectorAll('li').forEach((li,i)=>li.setAttribute('aria-selected',String(i===sel)));q.setAttribute('aria-activedescendant','r'+sel);
    res.querySelector(`#r${sel}`)?.scrollIntoView({block:'nearest'});}
  else if(e.key==='Enter'){e.preventDefault();pick(sel);}
  else if(e.key==='Escape'){hideResults();}
});
res.addEventListener('mousedown',e=>{const li=e.target.closest('li[data-i]');if(li){e.preventDefault();pick(+li.dataset.i);}});
q.addEventListener('blur',()=>setTimeout(hideResults,150));
function pick(i){const p=hits[i];if(!p)return;addStop(p);q.value='';hideResults();map.setView([p.lat,p.lng],Math.max(map.getZoom(),10));}

/* ---------------------------------------------------------------- plan panel */
function renderPlan(){
  const log=$('planLog'),chips=$('planChips'),banners=$('planBanners');
  const plan=trip.plan,stale=isStale();
  $('questBtn').disabled=!plan||stale;
  if(!plan){chips.innerHTML='';banners.innerHTML='';log.innerHTML='<p class="hint">Thêm điểm rồi bấm “Lên lịch trình”, lịch từng ngày sẽ hiện ở đây.</p>';return;}
  const drive=plan.days.reduce((a,d)=>a+d.drive,0),dist=plan.days.reduce((a,d)=>a+d.dist,0);
  chips.innerHTML=`<span class="chip">${plan.days.length} ngày</span><span class="chip">🛵 ${fmtDur(drive)}</span><span class="chip">${fmtKm(dist)}</span>`;
  banners.innerHTML=(stale?'<div class="banner">Bạn vừa sửa chuyến đi. Bấm “Lên lịch trình” để cập nhật lịch bên dưới.</div>':'')
    +plan.warnings.map(w=>`<div class="banner warn" style="margin-top:8px">⚠️ ${esc(w)}</div>`).join('');
  try{renderPassport(log,trip,plan,{onPick:k=>{const s=passportStamps(trip,plan)[k];const m=s&&markers.get(s.id);if(m){map.setView(m.getLatLng(),Math.max(map.getZoom(),11));m.openPopup();$('map').scrollIntoView({behavior:'smooth',block:'nearest'});}}});}
  catch(e){log.innerHTML='<p class="hint">Lịch cũ không còn khớp với danh sách điểm. Bấm “Lên lịch trình” để tính lại.</p>';}
  log.style.opacity=stale?.55:1;
}
$('planBtn').addEventListener('click',async()=>{
  if(busy)return;
  if(trip.stops.length<2){toast('Thêm ít nhất 2 điểm: điểm xuất phát và 1 điểm đến.');return;}
  if(trip.stops.length>40){toast('Tối đa 40 điểm cho một chuyến.');return;}
  busy=true;const b=$('planBtn');b.disabled=true;b.textContent='Đang tính đường…';
  try{
    const plan=await buildPlan(trip);
    if(trip.optimize){                                         /* show the stops in the order they will be visited */
      const order=[trip.stops[0].id,...plan.days.flatMap(d=>d.rows.filter(r=>!r.ret).map(r=>r.id))];
      trip.stops.sort((a,c)=>order.indexOf(a.id)-order.indexOf(c.id));plan.sig=planSig(trip);
    }
    trip.plan=plan;trip.updated=Date.now();persist();
    renderStops();renderMap(true);renderPlan();
    toast(plan.estimated?'Đã lên lịch (một phần là ước tính).':'Đã lên lịch trình!');
    if(window.matchMedia('(max-width:980px)').matches)$('planCard').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){toast(e.message||'Không lên lịch được, thử lại nhé.');}
  finally{busy=false;b.disabled=false;b.textContent='✨ Lên lịch trình';}
});

/* ---------------------------------------------------------------- trips: switch / new / delete / share */
function useTrip(t){trip=t;store.setCur(t.id);fillForm();renderTripSel();renderStops();renderMap(true);renderPlan();}
$('tripSel').addEventListener('change',()=>{const t=trips.find(x=>x.id===$('tripSel').value);if(t)useTrip(t);});
$('newBtn').addEventListener('click',()=>{const t=blankTrip();trips.unshift(t);persist();useTrip(t);$('tripName').select();});
let delArmed=0;
$('delBtn').addEventListener('click',()=>{
  const b=$('delBtn');
  if(!delArmed){delArmed=setTimeout(()=>{delArmed=0;b.textContent='Xóa';},3000);b.textContent='Bấm lần nữa để xóa';return;}
  clearTimeout(delArmed);delArmed=0;b.textContent='Xóa';
  const name=trip.name;trips=trips.filter(x=>x.id!==trip.id);
  if(!trips.length)trips.push(sampleHaGiang());
  persist();useTrip(trips[0]);toast(`Đã xóa “${name}”.`);
});
/* share link: the trip (without the computed plan) packed into the URL hash */
const b64u={enc:u8=>{let s='';u8.forEach(c=>s+=String.fromCharCode(c));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');},
  dec:s=>{s=s.replace(/-/g,'+').replace(/_/g,'/');const b=atob(s);return Uint8Array.from(b,c=>c.charCodeAt(0));}};
async function pack(obj){
  const raw=new TextEncoder().encode(JSON.stringify(obj));
  if(window.CompressionStream){try{const buf=await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();return 'z'+b64u.enc(new Uint8Array(buf));}catch(e){}}
  return 'j'+b64u.enc(raw);
}
async function unpack(s){
  const kind=s[0],bytes=b64u.dec(s.slice(1));
  if(kind==='z'){const buf=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();return JSON.parse(new TextDecoder().decode(buf));}
  return JSON.parse(new TextDecoder().decode(bytes));
}
$('shareBtn').addEventListener('click',async()=>{
  if(!trip.stops.length){toast('Chuyến này chưa có điểm nào để chia sẻ.');return;}
  const data={v:1,name:trip.name,date:trip.date,days:trip.days,dayStart:trip.dayStart,maxDrive:trip.maxDrive,terrain:trip.terrain,end:trip.end,optimize:trip.optimize,
    stops:trip.stops.map(s=>[s.name,s.sub,+s.lat.toFixed(5),+s.lng.toFixed(5),s.stay,s.night?1:0])};
  const url=location.href.split('#')[0]+'#t='+await pack(data);
  try{
    if(navigator.share&&window.matchMedia('(pointer:coarse)').matches){await navigator.share({title:trip.name,text:`Lịch trình “${trip.name}” trên Việt Nam Quest`,url});return;}
    await navigator.clipboard.writeText(url);toast('Đã sao chép link chia sẻ. Gửi cho bạn đi cùng là mở được ngay.');
  }catch(e){if(e&&e.name==='AbortError')return;window.prompt('Sao chép link này để chia sẻ:',url);}
});
async function importFromHash(){
  const m=location.hash.match(/^#t=([A-Za-z0-9_-]+)/);if(!m)return null;
  try{
    const d=await unpack(m[1]);
    const t={id:uid(),name:String(d.name||'Chuyến được chia sẻ').slice(0,80),date:d.date||'',days:+d.days||1,dayStart:d.dayStart||'07:30',maxDrive:+d.maxDrive||5,
      terrain:d.terrain==='mountain'?'mountain':'plain',end:d.end==='loop'?'loop':'free',optimize:d.optimize!==false,
      stops:(d.stops||[]).slice(0,40).map(a=>({id:uid(),name:String(a[0]||'Điểm').slice(0,120),sub:String(a[1]||'').slice(0,160),lat:+a[2],lng:+a[3],stay:+a[4]||0,night:!!a[5]}))
        .filter(s=>isFinite(s.lat)&&isFinite(s.lng))};
    history.replaceState(null,'',location.pathname+location.search);
    return t;
  }catch(e){toast('Link chia sẻ bị hỏng hoặc thiếu, không mở được.');history.replaceState(null,'',location.pathname+location.search);return null;}
}

/* ---------------------------------------------------------------- boot */
(async function boot(){
  if(!trips.length){trips.push(sampleHaGiang());persist();}
  const shared=await importFromHash();
  if(shared){trips.unshift(shared);persist();useTrip(shared);toast(`Đã mở chuyến “${shared.name}” được chia sẻ và lưu vào máy bạn.`);
    if(shared.stops.length>1)$('planBtn').click();return;}
  const cur=trips.find(t=>t.id===store.cur())||trips[0];
  useTrip(cur);
})();

/* used by quest.js */
window.VNQ={getTrip:()=>trip,isStale,dayColor,dayLabel,fmtDur,fmtKm,fmtClock,esc,renderPassport,passportStamps,toast};
$('questBtn').addEventListener('click',()=>{if(trip.plan&&!isStale()&&window.Quest)window.Quest.open(trip,trip.plan);});
})();
