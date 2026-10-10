/* Việt Nam Quest · trip planner on open map data.
   Search: built-in popular places + Photon (OSM) + Nominatim on demand. Driving times + routes: OSRM.
   Map: Leaflet + OpenStreetMap tiles. Everything runs in the browser; trips live in localStorage
   and can be shared as a link. */
(function(){
'use strict';

/* ---------------------------------------------------------------- helpers */
const $=id=>document.getElementById(id);
const DAY_COLORS=['#ff4f9a','#11b3ae','#ff8a1f','#7a6cf0','#e8423f','#2f9e44','#1c7ed6','#c2255c'];
const dayColor=i=>DAY_COLORS[i%DAY_COLORS.length];
const WD=['CN','T2','T3','T4','T5','T6','T7'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,10);
function fmtDur(min){min=Math.max(0,Math.round(min));const h=Math.floor(min/60),m=min%60;return h?(m?`${h}h${String(m).padStart(2,'0')}`:`${h}h`):`${m} phút`;}
function fmtKm(m){const km=m/1000;return km<10?km.toFixed(1).replace('.',',')+' km':Math.round(km)+' km';}
function fmtClock(min){min=Math.round(min);const d=Math.floor(min/1440);min-=d*1440;return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}${d?' (+'+d+')':''}`;}
function parseClock(s){const [h,m]=String(s||'07:30').split(':').map(Number);return (h||0)*60+(m||0);}
function haversine(a,b){const R=6371e3,r=x=>x*Math.PI/180,dl=r(b.lat-a.lat),dn=r(b.lng-a.lng);
  const h=Math.sin(dl/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function addDays(iso,n){const d=new Date((iso||isoDate(new Date()))+'T00:00:00');d.setDate(d.getDate()+n);return isoDate(d);}
function tripDays(t){
  const a=new Date(t.date+'T00:00:00'),b=new Date(t.endDate+'T00:00:00');
  if(isNaN(a)||isNaN(b))return 1;
  return Math.max(1,Math.min(30,Math.round((b-a)/864e5)+1));
}
function dayLabel(t,i){
  const d=new Date(t.date+'T00:00:00');if(isNaN(d))return `Ngày ${i+1}`;
  d.setDate(d.getDate()+i);return `Ngày ${i+1} · ${WD[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`;
}
/* lower-case, no Vietnamese tone marks: "Sống lưng" → "song lung" */
const norm=s=>String(s||'').replace(/[đĐ]/g,'d').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
let toastTimer=0;
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},3600);}
const debounce=(fn,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};

/* ---------------------------------------------------------------- trips: model + storage
   trip = {id,name,date,endDate,dayStart,maxDrive,end:'loop'|'free',optimize,start:Stop|null,stops:[Stop],plan}
   Stop = {id,name,sub,lat,lng,stay(min),night} */
const KEY='vnq-trips-v1',CUR='vnq-current';
const store={
  load(){try{const v=JSON.parse(localStorage.getItem(KEY));return Array.isArray(v)?v:[];}catch(e){return [];}},
  save(list){try{localStorage.setItem(KEY,JSON.stringify(list));return true;}catch(e){return false;}},
  cur(){try{return localStorage.getItem(CUR);}catch(e){return null;}},
  setCur(id){try{localStorage.setItem(CUR,id);}catch(e){}}
};
/* older saved trips used "stops[0] = start", "days" and "terrain" */
function normalizeTrip(t){
  if(!('start' in t)){t.start=t.stops&&t.stops.length?t.stops.shift():null;t.plan=null;}
  if(!t.date)t.date=addDays(isoDate(new Date()),7);
  if(!t.endDate)t.endDate=addDays(t.date,Math.max(1,+t.days||1)-1);
  delete t.days;delete t.terrain;
  const okPt=s=>s&&isFinite(s.lat)&&isFinite(s.lng);             /* Leaflet throws on NaN coordinates */
  if(t.start&&!okPt(t.start))t.start=null;
  t.stops=(t.stops||[]).filter(okPt);t.end=t.end==='free'?'free':'loop';t.optimize=t.optimize!==false;
  t.dayStart=t.dayStart||'07:30';t.maxDrive=+t.maxDrive||5;
  return t;
}
const allStops=t=>t.start?[t.start,...t.stops]:t.stops.slice();
const stopById=(t,id)=>allStops(t).find(s=>s.id===id);

const S=(name,sub,lat,lng,stay,night,day)=>({id:uid(),name,sub,lat,lng,stay,night:!!night,day:Number.isInteger(day)?day:null});
function sampleHaGiang(){
  return {id:uid(),name:'Hà Giang 3N2Đ (chuyến mẫu)',date:'2026-10-11',endDate:'2026-10-13',dayStart:'07:30',maxDrive:6,end:'loop',optimize:true,
    start:S('Cột mốc Km0 Hà Giang','TP Hà Giang',22.82639,104.98361,0),
    stops:[
      S('Rừng thông Yên Minh','Thị trấn Yên Minh',23.1172,105.1491,60,false,0),
      S('Thung lũng Sủng Là','Nhà của Pao, ruộng tam giác mạch',23.2326,105.2163,45,false,0),
      S('Dinh Vua Mèo','Thung lũng Sà Phìn',23.2562,105.2621,60,false,0),
      S('Cột cờ Lũng Cú','Điểm cực Bắc',23.36346,105.31633,60,false,0),
      S('Làng Lô Lô Chải','Homestay nhà trình tường',23.3642,105.3101,30,true,0),
      S('Phố cổ Đồng Văn','Cháo ấu tẩu, bánh cuốn trứng',23.27967,105.36078,60,false,1),
      S('Đèo Mã Pì Lèng','Ngắm vực Tu Sản',23.24196,105.39792,45,false,1),
      S('Thuyền sông Nho Quế','Hẻm Tu Sản',23.2290,105.4120,90,false,1),
      S('Phố núi Mèo Vạc','Ăn trưa, đổ xăng',23.1633,105.4104,60,false,1),
      S('Núi Đôi · Tam Sơn','Quản Bạ',23.0727,104.9876,30,true,1),
      S('Cổng Trời Quản Bạ','Ngắm toàn cảnh thung lũng',23.04932,104.99302,45,false,2),
      S('Thạch Sơn Thần','Rừng đá Quản Bạ',23.0257,104.9707,30,false,2),
      S('Dốc Bắc Sum','Cung đường ziczac',22.9882,104.9359,20,false,2)
    ]};
}
function blankTrip(){
  const d=addDays(isoDate(new Date()),7);
  return {id:uid(),name:'Chuyến đi mới',date:d,endDate:addDays(d,1),dayStart:'07:30',maxDrive:5,end:'loop',optimize:true,start:null,stops:[]};
}

/* ---------------------------------------------------------------- services */
const OSRM=['https://router.project-osrm.org','https://routing.openstreetmap.de/routed-car'];
const PHOTON='https://photon.komoot.io',NOMINATIM='https://nominatim.openstreetmap.org';
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
/* OSRM assumes free-flowing car speeds. Real Vietnamese roads are slower and mountain passes much slower,
   so each leg is scaled by how winding it is (road distance ÷ straight line): ~1.2× on highways, up to 2.3× on passes. */
function slowFactor(a,b,roadDist){
  const line=haversine(a,b);
  if(line<3000||!roadDist)return 1.35;
  return Math.max(1.2,Math.min(2.3,1.2+(roadDist/line-1.25)*1.1));
}

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

/* ---------------------------------------------------------------- place search */
const PLACES=(window.VNQ_PLACES||[]).map(([name,sub,lat,lng,aka])=>({name,sub,lat,lng,key:norm(`${name} ${sub} ${aka||''}`),nkey:norm(name)}));
/* every query word must start a word somewhere in the entry, and at least one must be in the name itself
   ("Hà Nội" should not match "Chùa Hương, Hà Nội" or "Đại Nội Huế") */
const words=s=>norm(s).split(' ').filter(Boolean);
const hasWord=(ws,t)=>ws.some(w=>w.startsWith(t));
function localSearch(q){
  const toks=words(q);if(!toks.length)return [];
  return PLACES.filter(p=>{const all=p.key.split(' '),nm=p.nkey.split(' ');return toks.every(t=>hasWord(all,t))&&toks.some(t=>hasWord(nm,t));})
    .map(p=>({p,score:toks.filter(t=>hasWord(p.nkey.split(' '),t)).length}))
    .sort((a,b)=>b.score-a.score||a.p.name.length-b.p.name.length)
    .slice(0,5).map(({p})=>({name:p.name,sub:p.sub,lat:p.lat,lng:p.lng,badge:'Nổi tiếng'}));
}
/* drop Photon's loose fuzzy hits (e.g. "Chung cư … đường Song Hành, Long Trường" for "sống lưng khủng long") */
function relevant(q,p){
  const toks=words(q).filter(t=>t.length>1);if(!toks.length)return true;
  const nm=words(p.name),inName=toks.filter(t=>hasWord(nm,t)).length;
  return inName/toks.length>=.5||toks.every(t=>hasWord(nm.concat(words(p.sub)),t));
}
async function photonSearch(q){
  const j=await fetchJson(`${PHOTON}/api/?limit=12&lang=default&bbox=${VN_BBOX}&q=${encodeURIComponent(q)}`,8000);
  const out=[];
  (j.features||[]).filter(f=>(f.properties||{}).countrycode==='VN').map(featureToPlace)
    .forEach(p=>{if(p&&relevant(q,p)&&!out.some(o=>norm(o.name)===norm(p.name)&&near(o,p)))out.push(p);});   /* OSM often has the same place 2–3 times */
  return out.slice(0,7);
}
/* Nominatim only on an explicit "search harder" click (its usage policy forbids search-as-you-type) */
async function nominatimSearch(q){
  const j=await fetchJson(`${NOMINATIM}/search?format=jsonv2&limit=8&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(q)}`,10000);
  return (j||[]).map(r=>{const parts=String(r.display_name||'').split(',').map(s=>s.trim());
    return {name:r.name||parts[0],sub:parts.slice(1,4).join(', '),lat:+r.lat,lng:+r.lon};}).filter(p=>p.name&&isFinite(p.lat));
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
/* coordinates or a Google Maps link pasted into the search box */
function parseCoords(s){
  s=String(s).trim();
  const m=s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)||s.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
    ||s.match(/[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i)
    ||s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{2,3}(?:\.\d+)?)$/);
  if(!m)return null;
  const lat=+m[1],lng=+m[2];
  return lat>5&&lat<25&&lng>100&&lng<112?{lat,lng}:null;
}
const isShortLink=s=>/^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(String(s).trim());
const near=(a,b)=>Math.abs(a.lat-b.lat)<.003&&Math.abs(a.lng-b.lng)<.003;
const TIPS='Không thấy? Thử tên ngắn hơn hoặc tên xã/bản gần đó, rồi kéo ghim cho đúng chỗ và bấm ✎ để đổi tên. Cũng có thể mở Google Maps, giữ tay lên vị trí để copy tọa độ (dạng 21.30, 104.47) rồi dán vào đây.';

/* Combobox: built-in places first, then Photon; coordinates/links are understood directly. */
function makeSearch(input,list,onPick){
  let hits=[],sel=-1,seq=0;
  const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
  function show(items,{status,more,tips}={}){
    hits=items;sel=items.length?0:-1;
    let html=items.map((p,i)=>`<li role="option" id="${list.id}-${i}" aria-selected="${i===sel}" data-i="${i}"><b>${esc(p.name)}${p.badge?`<span class="badge">${esc(p.badge)}</span>`:''}</b>${p.sub?`<small>${esc(p.sub)}</small>`:''}</li>`).join('');
    if(status)html+=`<li class="tips" aria-disabled="true">${esc(status)}</li>`;
    if(more)html+=`<li class="tips" aria-disabled="true"><button type="button" class="more" data-more="1">🔎 Tìm kỹ hơn trên OpenStreetMap</button></li>`;
    if(tips)html+=`<li class="tips" aria-disabled="true">${esc(TIPS)}</li>`;
    list.innerHTML=html;list.hidden=false;input.setAttribute('aria-expanded','true');
    if(sel>=0)input.setAttribute('aria-activedescendant',`${list.id}-${sel}`);else input.removeAttribute('aria-activedescendant');
  }
  const run=debounce(async()=>{
    const text=input.value.trim(),my=++seq;
    if(text.length<2){close();return;}
    const c=parseCoords(text);
    if(c){show([{name:'📍 Vị trí theo tọa độ',sub:`${c.lat}, ${c.lng}`,lat:c.lat,lng:c.lng,needName:true}]);return;}
    if(isShortLink(text)){show([],{status:'Link rút gọn (maps.app.goo.gl) không đọc được tọa độ. Mở link đó, giữ tay lên vị trí để copy tọa độ rồi dán vào đây.'});return;}
    const local=localSearch(text);
    show(local,{status:'Đang tìm…'});
    let remote=[];
    try{remote=await photonSearch(text);}catch(e){if(my===seq)show(local,{status:'Không kết nối được dịch vụ tìm kiếm.',more:true,tips:!local.length});return;}
    if(my!==seq)return;
    /* an exact name match from the map (typing "Hà Nội" → the city) goes first */
    const exact=remote.filter(r=>norm(r.name)===norm(text)),rest=remote.filter(r=>!exact.includes(r));
    const merged=exact.concat(local.filter(l=>!exact.some(e=>near(e,l))),rest.filter(r=>!local.some(l=>near(l,r)))).slice(0,8);
    show(merged,{more:true,tips:merged.length<2});
  },350);
  async function deep(){
    const text=input.value.trim(),my=++seq;if(!text)return;
    show(hits,{status:'Đang tìm kỹ hơn…'});
    try{const r=await nominatimSearch(text);if(my!==seq)return;
      const merged=hits.concat(r.filter(x=>!hits.some(h=>near(h,x)))).slice(0,10);
      show(merged,{status:r.length?'':'OpenStreetMap cũng chưa có tên này.',tips:true});}
    catch(e){if(my===seq)show(hits,{status:'Không kết nối được, thử lại sau.',tips:true});}
    input.focus();
  }
  async function pick(i){
    const p=hits[i];if(!p)return;
    input.value='';close();
    if(p.needName){const r=await reversePlace(p.lat,p.lng);onPick({name:r.name,sub:r.sub||`${p.lat}, ${p.lng}`,lat:p.lat,lng:p.lng});}
    else onPick({name:p.name,sub:p.sub||'',lat:p.lat,lng:p.lng});
  }
  input.addEventListener('input',run);
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){close();return;}
    if(list.hidden||!hits.length){if(e.key==='Enter'){e.preventDefault();if(input.value.trim().length>=2)deep();}return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();sel=(sel+(e.key==='ArrowDown'?1:-1)+hits.length)%hits.length;
      list.querySelectorAll('li[data-i]').forEach((li,i)=>li.setAttribute('aria-selected',String(i===sel)));
      input.setAttribute('aria-activedescendant',`${list.id}-${sel}`);list.querySelector(`#${list.id}-${sel}`)?.scrollIntoView({block:'nearest'});}
    else if(e.key==='Enter'){e.preventDefault();pick(sel);}
  });
  list.addEventListener('mousedown',e=>{
    if(e.target.closest('[data-more]')){e.preventDefault();deep();return;}
    const li=e.target.closest('li[data-i]');if(li){e.preventDefault();pick(+li.dataset.i);}
    else if(e.target.closest('.tips'))e.preventDefault();
  });
  input.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==input)close();},180));
}

/* ---------------------------------------------------------------- planning
   Node 0 is the fixed start. D is a matrix of minutes (already scaled for road speed).
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
   into a day (least detour, keeping days balanced), then improve by moving/swapping stops between days. */
function anchorPlan(D,stays,nights,loop){
  const n=D.length,others=[];for(let v=1;v<n;v++)if(!nights.includes(v))others.push(v);
  /* every night order is tried only while that stays cheap: each try runs a full local search,
     so 5 nights × 30+ stops would freeze the page for seconds on a phone */
  const tries=nights.length<=3||(nights.length<=5&&n<=16)?permutations(nights)
    :(o=>[o,o.slice().reverse()])(orderPath(D,0,nights,loop?0:-1));
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
    /* from here only the day of each stop is searched; the order inside a day is always the optimal one (days are small) */
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
    if(!best||cur<best.score)best={score:cur,days};
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
  if(m<K)warnings.push(`Chỉ có ${m} chặng cho ${K} ngày nên lịch gói gọn trong ${m} ngày.`);
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
/* The user put some stops on given days. Unassigned stops go to the day whose places are closest,
   then each day runs from where the previous day ended (its last stop, or the 🌙 stop) in the best order. */
const dayOfStop=(s,K)=>Number.isInteger(s.day)&&s.day>=0&&s.day<K?s.day:null;
function dayPlan(D,stays,pts,K,loop,optimize){
  const sets=[...Array(K)].map(()=>[]),pool=[];
  for(let i=1;i<pts.length;i++){const d=dayOfStop(pts[i],K);(d===null?pool:sets[d]).push(i);}
  const close=(v,us)=>us.length?Math.min(...us.map(u=>Math.min(D[u][v],D[v][u]))):Infinity;
  for(const v of pool){
    let best=0,bv=Infinity;
    for(let d=0;d<K;d++){
      const own=sets[d].slice();if(d===0)own.push(0);if(d===K-1&&loop)own.push(0);
      /* an empty day borrows its neighbours' places as reference and gets a small bonus so it fills up */
      const ref=own.length?own:[...(sets[d-1]||[]),...(sets[d+1]||[])];
      const load=sets[d].reduce((a,u)=>a+stays[u],0);
      const score=close(v,ref)+.3*load-(sets[d].length?0:60);
      if(score<bv){bv=score;best=d;}
    }
    sets[best].push(v);
  }
  const seq=[],groups=[],warnings=[];let prev=0;
  for(let d=0;d<K;d++){
    const last=d===K-1,nodes=sets[d];
    const night=last?undefined:nodes.find(v=>pts[v].night);
    const end=last?(loop?0:-1):(night!==undefined?night:-1);
    let daySeq;
    if(!optimize){                                  /* manual: keep the user's order exactly, the day ends at its last stop */
      daySeq=last&&loop?nodes.concat([0]):nodes.slice();
      if(night!==undefined&&nodes[nodes.length-1]!==night)
        warnings.push(`Ngày ${d+1}: điểm 🌙 “${pts[night].name}” không nằm cuối ngày nên lịch tính ngủ ở điểm cuối của ngày. Dùng ↑ ↓ để đưa nó xuống cuối.`);
    }else{
      const rest=nodes.filter(v=>v!==end);
      /* an open day end should lean towards where tomorrow starts */
      const next=sets.slice(d+1).find(s=>s.length)||(loop?[0]:[]);
      const ordered=end>=0?orderPath(D,prev,rest,end):orderPathE(D,prev,rest,v=>next.length?Math.min(...next.map(w=>D[v][w])):0);
      daySeq=end>=0?ordered.concat([end]):ordered;
    }
    const a=seq.length;daySeq.forEach(v=>seq.push(v));groups.push([a,seq.length]);
    if(daySeq.length)prev=daySeq[daySeq.length-1];
  }
  return {seq,groups,warnings};
}
function orderPathE(D,start,nodes,endCost){
  if(!nodes.length)return [];
  const idx=[start,...nodes],Dl=idx.map(a=>idx.map(b=>D[a][b])),E=idx.map(a=>endCost(a));
  return solveOrder(Dl,E).map(j=>idx[j]);
}
function planSig(t){
  const K=tripDays(t);
  return JSON.stringify([allStops(t).map(s=>[s.lat,s.lng,s.stay,s.night,dayOfStop(s,K)]),K,t.dayStart,t.maxDrive,t.end,t.optimize]);
}
async function buildPlan(t){
  const pts=allStops(t);
  if(!t.start)throw new Error('Chọn nơi xuất phát trước nhé.');
  if(pts.length<2)throw new Error('Thêm ít nhất 1 điểm muốn đến.');
  const loop=t.end==='loop',K=tripDays(t);
  const M=await getMatrix(pts);
  const D=M.dur.map((r,i)=>r.map((s,j)=>i===j?0:s/60*slowFactor(pts[i],pts[j],M.dist[i][j])));
  const stays=pts.map((s,i)=>i?(+s.stay||0):0),nights=[];pts.forEach((s,i)=>{if(i&&s.night)nights.push(i);});
  let seq,groups,warnings=[];
  if(pts.some(s=>dayOfStop(s,K)!==null)){
    ({seq,groups,warnings}=dayPlan(D,stays,pts,K,loop,t.optimize));
  }else if(t.optimize&&nights.length){
    ({seq,groups}=anchorPlan(D,stays,nights,loop));
    if(groups.length!==K)warnings.push(`Có ${nights.length} chỗ ngủ cố định nên lịch chia thành ${groups.length} ngày, trong khi chuyến của bạn dài ${K} ngày. Bấm 🌙 ở thêm/bớt chỗ ngủ cho khớp.`);
  }else{
    const order=t.optimize?solveOrder(D,D.map(r=>loop?r[0]:0)):pts.slice(1).map((_,i)=>i+1);
    seq=loop?order.concat([0]):order;
    const sp=splitDays(seq.map((idx,pos)=>({load:D[pos?seq[pos-1]:0][idx]+stays[idx],night:nights.includes(idx)})),K);
    groups=sp.groups;warnings=sp.warnings;
  }
  const items=seq.map((idx,pos)=>({idx,drive:D[pos?seq[pos-1]:0][idx],stay:stays[idx]}));
  let estimated=M.estimated;const days=[];let prevIdx=0;const start=parseClock(t.dayStart),maxD=(+t.maxDrive||5)*60;
  for(const [a,b] of groups){
    if(b===a){days.push({from:pts[prevIdx].id,depart:start,rows:[],drive:0,dist:0,end:start,over:false,late:false,geom:[],free:true});continue;}
    const g=items.slice(a,b),dayPts=[pts[prevIdx],...g.map(it=>pts[it.idx])];
    const r=await getRoute(dayPts);estimated=estimated||r.estimated;
    let tm=start,drive=0,dist=0;const rows=[];
    g.forEach((it,i)=>{
      const leg=r.legs[i],dm=leg?leg.dur/60*slowFactor(dayPts[i],dayPts[i+1],leg.dist):it.drive,dd=leg?leg.dist:0;
      tm+=dm;drive+=dm;dist+=dd;
      const arrive=tm;tm+=it.stay;
      rows.push({id:pts[it.idx].id,ret:it.idx===0,arrive,leave:tm,drive:dm,dist:dd});
    });
    days.push({from:pts[prevIdx].id,depart:start,rows,drive,dist,end:tm,over:drive>maxD,late:tm>21*60,geom:r.coords});
    prevIdx=g[g.length-1].idx;
  }
  days.forEach((d,i)=>{
    if(d.free&&!(i===days.length-1&&t.end!=='loop'))warnings.push(`${dayLabel(t,i).split(' · ')[0]} chưa có điểm nào (ngày tự do). Bấm “＋ Thêm điểm” ở ${dayLabel(t,i).split(' · ')[0]} để điền.`);
    if(d.over)warnings.push(`${dayLabel(t,i).split(' · ')[0]}: chạy xe khoảng ${fmtDur(d.drive)}, quá mức ${fmtDur(maxD)} bạn đặt.`);
    else if(d.late)warnings.push(`${dayLabel(t,i).split(' · ')[0]}: tới nơi cuối khoảng ${fmtClock(d.end)}, khá muộn.`);
  });
  if(estimated)warnings.unshift('Không kết nối được máy chủ tính đường nên một phần thời gian chạy xe đang ước tính theo đường chim bay.');
  return {sig:planSig(t),at:Date.now(),estimated,days,warnings};
}

/* ---------------------------------------------------------------- state */
let trips=store.load().map(normalizeTrip),trip=null,busy=false;
function persist(){if(!store.save(trips))toast('Không lưu được vào trình duyệt (bộ nhớ bị chặn hoặc đầy).');}
const persistSoon=debounce(persist,300);
/* closing the tab inside the debounce window must not lose the last edit */
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist();});
/* another tab saved: take its list so our next save does not wipe its changes.
   Trip objects keep their identity, so a plan being computed sees the edit and is dropped. */
window.addEventListener('storage',e=>{
  if(e.key!==KEY||!trip)return;
  const byId=new Map(trips.map(x=>[x.id,x]));
  trips=store.load().map(normalizeTrip).map(f=>{const o=byId.get(f.id);if(!o)return f;Object.keys(o).forEach(k=>delete o[k]);return Object.assign(o,f);});
  if(!trips.length)trips.push(sampleHaGiang());
  const cur=trips.find(x=>x.id===trip.id);
  if(!cur){useTrip(trips[0]);return;}
  trip=cur;fillForm();renderTripSel();renderStops();renderMap(false);renderPlan();
});
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
  allStops(trip).forEach((s,idx)=>{
    const isStart=!!trip.start&&idx===0,st=info.get(s.id);
    const label=isStart?'★':st?String(st.n):String(trip.start?idx:idx+1),color=st?dayColor(st.day):'#9a9dc8';
    const m=L.marker([s.lat,s.lng],{icon:pinIcon(label,color,isStart),title:s.name,keyboard:true,draggable:true,autoPan:true}).addTo(layer);
    const time=st&&!isStart?`<br>${esc(dayLabel(trip,st.day))} · ${fmtClock(st.arrive)}${st.stay?`–${fmtClock(st.leave)}`:''}`:'';
    m.bindPopup(`<b>${esc(s.name)}</b>${isStart?' <span style="color:#5b5f8f">(xuất phát)</span>':''}${s.sub?`<br><span style="color:#5b5f8f">${esc(s.sub)}</span>`:''}${time}${s.night?'<br>🌙 Ngủ đêm tại đây':''}<br><small style="color:#5b5f8f">Kéo ghim để chỉnh vị trí</small>`);
    m.on('dragend',()=>{const ll=m.getLatLng();s.lat=+ll.lat.toFixed(5);s.lng=+ll.lng.toFixed(5);changed();toast(`Đã chỉnh vị trí “${s.name}”.`);});
    markers.set(s.id,m);bounds.push([s.lat,s.lng]);
  });
  if(fit&&bounds.length){if(bounds.length===1)map.setView(bounds[0],11);else map.fitBounds(bounds,{padding:[36,36],maxZoom:13});}
  renderLegend(plan);
}
function renderLegend(plan){
  const lg=$('legend');
  if(!plan){lg.innerHTML='<span class="hint">Bấm lên bản đồ để thêm điểm · kéo ghim để chỉnh vị trí.</span>';return;}
  lg.innerHTML=plan.days.map((d,i)=>`<span><i style="background:${dayColor(i)}"></i>${esc(dayLabel(trip,i))}</span>`).join('');
}
/* stamp number / day / times for each stop in the current plan */
function stampInfo(plan){
  const info=new Map();if(!plan||!trip.start)return info;
  info.set(trip.start.id,{n:1,day:0,arrive:plan.days[0].depart,leave:plan.days[0].depart,stay:0});
  let n=1;
  plan.days.forEach((d,i)=>d.rows.forEach(r=>{if(r.ret)return;n++;info.set(r.id,{n,day:i,arrive:r.arrive,leave:r.leave,stay:r.leave>r.arrive});}));
  return info;
}
/* a click that only closes an open popup should not also add a stop */
let popupClosedAt=0;
map.on('popupclose',()=>{popupClosedAt=Date.now();});
map.on('click',async e=>{
  if(busy||Date.now()-popupClosedAt<350)return;
  const {lat,lng}=e.latlng,t=trip;
  const p=await reversePlace(+lat.toFixed(5),+lng.toFixed(5));
  if(trip!==t)return;                                         /* switched trips while the name was loading */
  if(!trip.start)setStart(p);else addStop(p);
});

/* ---------------------------------------------------------------- passport (shared with the Quest view) */
function passportStamps(t,plan){
  const out=[{id:t.start.id,day:0,arrive:plan.days[0].depart,leave:plan.days[0].depart,stay:0,start:true}];
  plan.days.forEach((d,i)=>d.rows.forEach(r=>out.push({id:r.id,day:i,arrive:r.arrive,leave:r.leave,stay:r.leave-r.arrive,drive:r.drive,dist:r.dist,ret:r.ret})));
  return out;
}
/* Builds the day-by-day passport. opts.quest marks rows as done/current; opts.onPick(stampIndex) on click. */
function renderPassport(box,t,plan,opts){
  opts=opts||{};
  const stamps=passportStamps(t,plan),get=id=>stopById(t,id)||{name:'?'};
  let html='',k=0;
  plan.days.forEach((d,i)=>{
    const col=dayColor(i);
    html+=`<div class="logday" style="--dc:${col}"><span>${esc(dayLabel(t,i))}</span><span class="sum${d.over?' over':''}">🛵 ${fmtDur(d.drive)} · ${fmtKm(d.dist)}</span></div>`;
    if(i===0){const s=stamps[0];html+=row(k++,s,get(s.id),'★',fmtClock(s.leave),'Xuất phát',col);}
    else if(!d.free)html+=`<div class="logleg"><span class="ic">🌅</span><span class="t">${fmtClock(d.depart)}</span><span class="n">Rời ${esc(get(d.from).name)}</span></div>`;
    if(d.free)html+=`<div class="logleg"><span class="ic">☕</span><span class="t">Cả ngày</span><span class="n">Ngày tự do quanh ${esc(get(d.from).name)}</span></div>`;
    d.rows.forEach(r=>{
      const s=stamps[k];
      html+=`<div class="logleg"><span class="ic">🛵</span><span class="t">${fmtDur(r.drive)}</span><span class="n">${fmtKm(r.dist)}</span></div>`;
      const time=s.stay>0?`${fmtClock(s.arrive)}<br>–${fmtClock(s.leave)}`:fmtClock(s.arrive);
      html+=row(k++,s,get(s.id),s.ret?'↩':String(k),time,s.ret?'Về lại nơi xuất phát':'',col);
    });
    if(i<plan.days.length-1){const lastId=d.rows.length?d.rows[d.rows.length-1].id:d.from;
      html+=`<div class="lognight">🌙 Ngủ tại ${esc(get(lastId).name)}${d.rows.length?` · tới lúc ${fmtClock(d.end)}`:''}</div>`;}
    if(!opts.quest){const url=gmapsUrl(t,d);if(url)html+=`<div class="daylinks"><a class="gmap" href="${url}" target="_blank" rel="noopener">Mở ${esc(dayLabel(t,i).split(' · ')[0].toLowerCase())} trong Google Maps ↗</a></div>`;}
  });
  box.innerHTML=html;
  box.querySelectorAll('.logrow').forEach(b=>b.addEventListener('click',()=>{if(opts.onPick)opts.onPick(+b.dataset.k);}));
  function row(i,s,st,label,time,note,col){
    const cls=opts.quest?(i<=opts.current?' done':'')+(i===opts.current?' current':''):'';
    const sub=note||st.sub||'';
    return `<button type="button" class="logrow${cls}" data-k="${i}" style="--sc:${col}"><span class="stamp">${label}</span><span class="t">${time}</span><span class="n">${esc(st.name)}${sub?`<small>${esc(sub)}</small>`:''}</span></button>`;
  }
  return stamps;
}
/* Google Maps directions link for one day (no API key needed). URLs allow up to 9 waypoints. */
function gmapsUrl(t,d){
  const pts=[stopById(t,d.from),...d.rows.map(r=>stopById(t,r.id))].filter(Boolean);
  if(pts.length<2)return '';
  const ll=p=>`${p.lat},${p.lng}`,mid=pts.slice(1,-1).slice(0,9);
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${ll(pts[0])}&destination=${ll(pts[pts.length-1])}${mid.length?`&waypoints=${encodeURIComponent(mid.map(ll).join('|'))}`:''}`;
}

/* ---------------------------------------------------------------- editor UI */
function fillForm(){
  $('tripName').value=trip.name;$('tripDate').value=trip.date;$('tripEnd').value=trip.endDate;$('tripEnd').min=trip.date;
  $('dayStart').value=trip.dayStart;$('maxDrive').value=String(trip.maxDrive);$('endMode').value=trip.end;
  document.querySelector(`input[name="orderMode"][value="${trip.optimize?'auto':'manual'}"]`).checked=true;
  renderDaysHint();renderOrderHint();renderStart();
}
function renderDaysHint(){const n=tripDays(trip);$('daysHint').textContent=`→ ${n} ngày${n>1?` ${n-1} đêm`:' (đi về trong ngày)'}`;}
function renderOrderHint(){
  $('orderHint').textContent=trip.optimize
    ?'Trong mỗi ngày, app tự sắp thứ tự đi cho đỡ vòng vèo. Điểm để “App tự xếp” sẽ được đưa vào ngày hợp lý nhất.'
    :'Giữ đúng thứ tự bạn sắp trong từng ngày (dùng nút ↑ ↓). App chỉ tính giờ chạy xe.';
}
/* "Thêm điểm vào" select: auto or a given day */
let addTo='auto';
function renderAddDay(){
  const K=tripDays(trip),sel=$('addDay');
  if(addTo!=='auto'&&+addTo>=K)addTo='auto';
  sel.innerHTML=`<option value="auto">🧭 App tự xếp vào ngày hợp lý</option>`+[...Array(K)].map((_,d)=>`<option value="${d}">${esc(dayLabel(trip,d))}</option>`).join('');
  sel.value=addTo;
}
$('addDay').addEventListener('change',()=>{addTo=$('addDay').value;renderStops();});
function renderStart(){
  const s=trip.start;
  $('startBox').hidden=!s;$('fromWrap').hidden=!!s;
  if(s){$('startName').textContent=s.name;$('startSub').textContent=s.sub||'';}
}
function renderTripSel(){
  $('tripSel').innerHTML=trips.map(t=>`<option value="${t.id}"${t.id===trip.id?' selected':''}>${esc(t.name)}</option>`).join('');
}
const STAYS=[0,15,30,45,60,90,120,180,240,360];
/* The stops grouped by day: "Ngày 1", "Ngày 2"… then the ones left for the app to place. */
function renderStops(){
  const ul=$('stops'),K=tripDays(trip);
  renderAddDay();
  const info=stampInfo(!isStale()?trip.plan:null),manual=!trip.optimize;
  const groups=[...Array(K)].map(()=>[]),pool=[];
  trip.stops.forEach(s=>{const d=dayOfStop(s,K);(d===null?pool:groups[d]).push(s);});
  const dayOpts=s=>{const d=dayOfStop(s,K);
    return `<option value="auto"${d===null?' selected':''}>🧭 App tự xếp</option>`+groups.map((_,k)=>`<option value="${k}"${d===k?' selected':''}>Ngày ${k+1}</option>`).join('');};
  const item=(s,list,i)=>{
    const st=info.get(s.id),stay=STAYS.includes(+s.stay)?+s.stay:45,auto=dayOfStop(s,K)===null;
    return `<li class="stop" data-id="${s.id}">
      <span class="num" style="${st?`background:${dayColor(st.day)}`:''}">${st?st.n:'•'}</span>
      <div class="min-w-0"><div class="nm">${esc(s.name)}${auto&&st?`<span class="autotag">→ Ngày ${st.day+1}</span>`:''}</div>${s.sub?`<div class="sb">${esc(s.sub)}</div>`:''}</div>
      <div class="ctl">
        ${manual?`<button class="iconbtn" type="button" data-act="up" aria-label="Đưa ${esc(s.name)} lên" ${i===0?'disabled':''}>↑</button>
        <button class="iconbtn" type="button" data-act="down" aria-label="Đưa ${esc(s.name)} xuống" ${i===list.length-1?'disabled':''}>↓</button>`:''}
        <button class="iconbtn" type="button" data-act="rename" aria-label="Đổi tên ${esc(s.name)}">✎</button>
        <button class="iconbtn" type="button" data-act="del" aria-label="Xóa ${esc(s.name)}">✕</button>
      </div>
      <div class="opts">
        <select data-act="day" aria-label="Ngày đi ${esc(s.name)}">${dayOpts(s)}</select>
        <select data-act="stay" aria-label="Thời gian dừng ở ${esc(s.name)}">${STAYS.map(v=>`<option value="${v}"${v===stay?' selected':''}>${v?`Dừng ${fmtDur(v)}`:'Chỉ đi qua'}</option>`).join('')}</select>
        <button class="nightbtn" type="button" data-act="night" aria-pressed="${s.night?'true':'false'}">🌙 ${s.night?'Ngủ ở đây':'Ngủ ở đây?'}</button>
      </div>
    </li>`;
  };
  let html='';
  groups.forEach((list,d)=>{
    const on=addTo===String(d);
    html+=`<li class="dayhead${on?' on':''}" style="--dc:${dayColor(d)}"><span>${esc(dayLabel(trip,d))}</span><small>${list.length?`${list.length} điểm · `:''}<button class="addday" type="button" data-addday="${d}" aria-pressed="${on}">${on?'✓ Đang thêm vào đây':'＋ Thêm điểm'}</button></small></li>`;
    html+=list.length?list.map((s,i)=>item(s,list,i)).join('')
      :`<li class="dayempty" style="--dc:${dayColor(d)}"><button type="button" data-addday="${d}">${on?'Gõ tên địa điểm ở ô tìm kiếm phía trên, hoặc bấm lên bản đồ.':`＋ Thêm điểm cho Ngày ${d+1}`}</button></li>`;
  });
  if(pool.length){
    html+=`<li class="dayhead" style="--dc:var(--muted)"><span>🧭 App tự xếp ngày</span><small>${pool.length} điểm</small></li>`;
    html+=pool.map((s,i)=>item(s,pool,i)).join('');
  }
  ul.innerHTML=html;
}
/* swap with the previous/next stop that is in the same day group */
function moveInGroup(i,dir){
  const K=tripDays(trip),d=dayOfStop(trip.stops[i],K);
  for(let j=i+dir;j>=0&&j<trip.stops.length;j+=dir)
    if(dayOfStop(trip.stops[j],K)===d){[trip.stops[i],trip.stops[j]]=[trip.stops[j],trip.stops[i]];return;}
}
function startRename(li){
  const s=trip.stops.find(x=>x.id===li.dataset.id);if(!s)return;
  const box=li.querySelector('.nm');const inp=document.createElement('input');
  inp.className='nmedit';inp.value=s.name;inp.maxLength=120;inp.setAttribute('aria-label','Tên mới');
  box.replaceWith(inp);inp.focus();inp.select();
  let done=false;
  const finish=save=>{if(done)return;done=true;const v=inp.value.trim();if(save&&v&&v!==s.name){s.name=v;changed();}else renderStops();};
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}});
  inp.addEventListener('blur',()=>finish(true));
}
$('stops').addEventListener('click',e=>{
  const ad=e.target.closest('[data-addday]');
  if(ad){
    addTo=addTo===ad.dataset.addday?'auto':ad.dataset.addday;
    renderStops();
    if(addTo!=='auto'){const q=$('q');q.scrollIntoView({behavior:'smooth',block:'center'});q.focus({preventScroll:true});}
    return;
  }
  const b=e.target.closest('[data-act]');if(!b||b.tagName==='SELECT')return;
  const li=b.closest('.stop'),id=li.dataset.id,i=trip.stops.findIndex(s=>s.id===id);if(i<0)return;
  const act=b.dataset.act;
  if(act==='rename'){startRename(li);return;}
  if(act==='up')moveInGroup(i,-1);
  else if(act==='down')moveInGroup(i,1);
  else if(act==='del')trip.stops.splice(i,1);
  else if(act==='night')trip.stops[i].night=!trip.stops[i].night;
  changed();
  const again=$('stops').querySelector(`[data-id="${id}"] [data-act="${act}"]`);if(again&&!again.disabled)again.focus();
});
$('stops').addEventListener('change',e=>{
  const sel=e.target.closest('select[data-act]');if(!sel)return;
  const s=trip.stops.find(x=>x.id===sel.closest('.stop').dataset.id);if(!s)return;
  if(sel.dataset.act==='stay')s.stay=+sel.value;
  else if(sel.dataset.act==='day'){s.day=sel.value==='auto'?null:+sel.value;}
  changed();
  if(sel.dataset.act==='day')$('stops').querySelector(`[data-id="${s.id}"] select[data-act="day"]`)?.focus();
});
const dup=p=>allStops(trip).find(s=>near(s,p));
function addStop(p){
  const d=dup(p);if(d){toast(`“${d.name}” đã có trong chuyến.`);return;}
  const day=addTo==='auto'?null:+addTo;
  trip.stops.push({id:uid(),name:p.name,sub:p.sub||'',lat:p.lat,lng:p.lng,stay:45,night:false,day});
  changed(true);toast(`Đã thêm “${p.name}”${day===null?'':` vào Ngày ${day+1}`}.`);
}
function setStart(p){
  const d=trip.stops.find(s=>near(s,p));if(d){trip.stops=trip.stops.filter(s=>s!==d);}
  trip.start={id:uid(),name:p.name,sub:p.sub||'',lat:p.lat,lng:p.lng,stay:0,night:false};
  renderStart();changed(true);toast(`Xuất phát từ “${p.name}”.`);
}
function changed(fit){trip.updated=Date.now();persistSoon();renderStops();renderMap(!!fit);renderPlan();}
makeSearch($('q'),$('results'),p=>{addStop(p);map.setView([p.lat,p.lng],Math.max(map.getZoom(),10));});
makeSearch($('fromQ'),$('fromResults'),p=>setStart(p));
$('startChange').addEventListener('click',()=>{$('startBox').hidden=true;$('fromWrap').hidden=false;$('fromQ').focus();});
$('fromQ').addEventListener('keydown',e=>{if(e.key==='Escape'&&trip.start&&!$('fromQ').value){renderStart();$('startChange').focus();}});

$('tripName').addEventListener('input',()=>{trip.name=$('tripName').value.trim()||'Chuyến đi';renderTripSel();trip.updated=Date.now();persistSoon();});
$('tripDate').addEventListener('change',()=>{
  const v=$('tripDate').value;if(!v){$('tripDate').value=trip.date;return;}
  const len=tripDays(trip);trip.date=v;
  if(trip.endDate<v)trip.endDate=addDays(v,len-1);            /* keep the trip length when the start moves past the end */
  else if(trip.endDate>addDays(v,29)){trip.endDate=addDays(v,29);toast('Tối đa 30 ngày cho một chuyến, đã dời ngày về cho khớp.');}
  $('tripEnd').value=trip.endDate;$('tripEnd').min=v;renderDaysHint();changed();
});
$('tripEnd').addEventListener('change',()=>{
  const v=$('tripEnd').value;
  if(!v){$('tripEnd').value=trip.endDate;return;}
  if(v<trip.date){toast('Ngày về phải sau hoặc bằng ngày đi.');$('tripEnd').value=trip.endDate;return;}
  if(Math.round((new Date(v+'T00:00:00')-new Date(trip.date+'T00:00:00'))/864e5)+1>30){toast('Tối đa 30 ngày cho một chuyến.');$('tripEnd').value=trip.endDate;return;}
  trip.endDate=v;renderDaysHint();changed();
});
$('dayStart').addEventListener('change',()=>{if($('dayStart').value){trip.dayStart=$('dayStart').value;changed();}else $('dayStart').value=trip.dayStart;});
$('maxDrive').addEventListener('change',()=>{trip.maxDrive=+$('maxDrive').value;changed();});
$('endMode').addEventListener('change',()=>{trip.end=$('endMode').value;changed();});
document.querySelectorAll('input[name="orderMode"]').forEach(r=>r.addEventListener('change',()=>{trip.optimize=r.value==='auto';renderOrderHint();changed();}));

/* ---------------------------------------------------------------- plan panel */
function renderPlan(){
  const log=$('planLog'),chips=$('planChips'),banners=$('planBanners');
  const plan=trip.plan,stale=isStale();
  $('questBtn').disabled=!plan||stale;
  if(!plan){chips.innerHTML='';banners.innerHTML='';log.innerHTML='<p class="hint">Chọn nơi xuất phát, thêm điểm muốn đến rồi bấm “Lên lịch trình”. Lịch từng ngày sẽ hiện ở đây.</p>';return;}
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
  if(!trip.start){toast('Chọn nơi xuất phát trước nhé.');$('fromQ').focus();return;}
  if(!trip.stops.length){toast('Thêm ít nhất 1 điểm muốn đến.');$('q').focus();return;}
  if(trip.stops.length>39){toast('Tối đa 39 điểm đến cho một chuyến.');return;}
  busy=true;const b=$('planBtn');b.disabled=true;b.textContent='Đang tính đường…';
  /* the trip can be switched or edited while the routes load: only keep a plan that still matches */
  const t=trip,sig0=planSig(t);
  try{
    const plan=await buildPlan(t);
    if(planSig(t)!==sig0){toast('Chuyến đi vừa thay đổi trong lúc tính đường. Bấm “Lên lịch trình” lại nhé.');return;}
    if(t.optimize){                                            /* list the stops in the order they will be visited */
      const order=plan.days.flatMap(d=>d.rows.filter(r=>!r.ret).map(r=>r.id));
      t.stops.sort((a,c)=>order.indexOf(a.id)-order.indexOf(c.id));plan.sig=planSig(t);
    }
    t.plan=plan;t.updated=Date.now();persist();
    if(trip!==t){toast(`Đã lên lịch cho “${t.name}”.`);return;}
    renderStops();renderMap(true);renderPlan();
    toast(plan.estimated?'Đã lên lịch (một phần là ước tính).':'Đã lên lịch trình!');
    if(window.matchMedia('(max-width:980px)').matches)$('planCard').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){toast(e.message||'Không lên lịch được, thử lại nhé.');}
  finally{busy=false;b.disabled=false;b.textContent='✨ Lên lịch trình';}
});

/* ---------------------------------------------------------------- trips: switch / new / delete / share */
function useTrip(t){trip=t;store.setCur(t.id);disarmDel();addTo='auto';fillForm();renderTripSel();renderStops();renderMap(true);renderPlan();}
$('tripSel').addEventListener('change',()=>{const t=trips.find(x=>x.id===$('tripSel').value);if(t)useTrip(t);});
$('newBtn').addEventListener('click',()=>{const t=blankTrip();trips.unshift(t);persist();useTrip(t);$('tripName').select();});
let delArmed=0;
/* switching trips cancels a pending "click again to delete" */
function disarmDel(){clearTimeout(delArmed);delArmed=0;$('delBtn').textContent='Xóa';}
$('delBtn').addEventListener('click',()=>{
  const b=$('delBtn');
  if(!delArmed){delArmed=setTimeout(disarmDel,3000);b.textContent='Bấm lần nữa để xóa';return;}
  disarmDel();
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
const packStop=s=>[s.name,s.sub,+(+s.lat).toFixed(5),+(+s.lng).toFixed(5),s.stay,s.night?1:0,Number.isInteger(s.day)?s.day:-1];
const unpackStop=a=>({id:uid(),name:String(a[0]||'Điểm').slice(0,120),sub:String(a[1]||'').slice(0,160),lat:+a[2],lng:+a[3],stay:Math.max(0,Math.min(720,+a[4]||0)),night:!!a[5],day:Number.isInteger(a[6])&&a[6]>=0&&a[6]<30?a[6]:null});
$('shareBtn').addEventListener('click',async()=>{
  if(!trip.start&&!trip.stops.length){toast('Chuyến này chưa có điểm nào để chia sẻ.');return;}
  const data={v:2,name:trip.name,date:trip.date,endDate:trip.endDate,dayStart:trip.dayStart,maxDrive:trip.maxDrive,end:trip.end,optimize:trip.optimize,
    start:trip.start?packStop(trip.start):null,stops:trip.stops.map(packStop)};
  const url=location.href.split('#')[0]+'#t='+await pack(data);
  try{
    if(navigator.share&&window.matchMedia('(pointer:coarse)').matches){await navigator.share({title:trip.name,text:`Lịch trình “${trip.name}” trên Việt Nam Quest`,url});return;}
    await navigator.clipboard.writeText(url);toast('Đã sao chép link chia sẻ. Gửi cho bạn đi cùng là mở được ngay.');
  }catch(e){if(e&&e.name==='AbortError')return;window.prompt('Sao chép link này để chia sẻ:',url);}
});
async function importFromHash(){
  const m=location.hash.match(/^#t=([A-Za-z0-9_-]+)/);if(!m)return null;
  history.replaceState(null,'',location.pathname+location.search);
  try{
    const d=await unpack(m[1]);
    let stops=(d.stops||[]).slice(0,40).map(unpackStop).filter(s=>isFinite(s.lat)&&isFinite(s.lng));
    let start=d.start?unpackStop(d.start):null;
    if(start&&!(isFinite(start.lat)&&isFinite(start.lng)))start=null;   /* a broken start would crash the map on every load */
    if(d.v!==2&&!start&&stops.length)start=stops.shift();          /* v1 links: the first stop was the start */
    if(start)start.stay=0;
    const date=/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')?d.date:addDays(isoDate(new Date()),7);
    const endDate=/^\d{4}-\d{2}-\d{2}$/.test(d.endDate||'')&&d.endDate>=date?d.endDate:addDays(date,Math.max(1,Math.min(30,+d.days||1))-1);
    return normalizeTrip({id:uid(),name:String(d.name||'Chuyến được chia sẻ').slice(0,80),date,endDate,dayStart:/^\d{2}:\d{2}$/.test(d.dayStart||'')?d.dayStart:'07:30',
      maxDrive:Math.max(3,Math.min(8,Math.round(+d.maxDrive)||5)),end:d.end==='free'?'free':'loop',optimize:d.optimize!==false,start,stops});
  }catch(e){toast('Link chia sẻ bị hỏng hoặc thiếu, không mở được.');return null;}
}

/* ---------------------------------------------------------------- boot */
(async function boot(){
  if(!trips.length){trips.push(sampleHaGiang());persist();}
  const shared=await importFromHash();
  if(shared){trips.unshift(shared);persist();useTrip(shared);toast(`Đã mở chuyến “${shared.name}” được chia sẻ và lưu vào máy bạn.`);
    if(shared.start&&shared.stops.length)$('planBtn').click();return;}
  persist();                                                    /* save any migrated old trips */
  /* links from the home screen: ?new=1 · ?trip=<id> · &quest=1 */
  const qs=new URLSearchParams(location.search);
  if(qs.get('new')){
    const t=blankTrip();trips.unshift(t);persist();useTrip(t);
    history.replaceState(null,'',`${location.pathname}?trip=${encodeURIComponent(t.id)}`);    /* a reload must not create another trip */
    $('fromQ').focus();return;
  }
  useTrip(trips.find(t=>t.id===qs.get('trip'))||trips.find(t=>t.id===store.cur())||trips[0]);
  if(qs.get('quest')){
    history.replaceState(null,'',`${location.pathname}?trip=${encodeURIComponent(trip.id)}`);
    /* quest.js loads right after this file */
    const go=()=>{if(trip.plan&&!isStale()&&window.Quest)window.Quest.open(trip,trip.plan);else toast('Chuyến này cần bấm “Lên lịch trình” lại trước khi xem kiểu Quest.');};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go,{once:true});else setTimeout(go,0);
  }
})();

/* used by quest.js */
window.VNQ={getTrip:()=>trip,isStale,dayColor,dayLabel,fmtDur,fmtKm,fmtClock,esc,renderPassport,passportStamps,toast,allStops,stopById};
$('questBtn').addEventListener('click',()=>{if(trip.plan&&!isStale()&&window.Quest)window.Quest.open(trip,trip.plan);});
})();
