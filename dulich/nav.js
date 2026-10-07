/* Việt Nam Quest · shared app navigation.
   <script src="../nav.js" data-base="../" data-active="plan" data-z="1500"></script>
   Top bar on wide screens, bottom tab bar on phones. Also handles "install app" (PWA) prompts. */
(function(){
  'use strict';
  const me=document.currentScript,base=me.dataset.base||'./',active=me.dataset.active||'',z=me.dataset.z||'100';
  const tabs=[
    {id:'home',href:base,icon:'🏠',label:'Trang chủ'},
    {id:'plan',href:base+'plan/',icon:'🗺️',label:'Lên lịch'},
    {id:'hagiang',href:base+'ha-giang/',icon:'🏔️',label:'Hà Giang'}
  ];
  const css=`
.vnq-nav{position:sticky;top:0;z-index:${z};display:flex;align-items:center;gap:10px;padding:10px 16px;padding-top:calc(10px + env(safe-area-inset-top,0px));
  background:rgba(20,22,70,.92);border-bottom:2px solid rgba(255,255,255,.12);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  font-family:"Baloo 2","Trebuchet MS",system-ui,sans-serif}
.vnq-brand{display:flex;align-items:center;gap:8px;color:#fff;text-decoration:none;font-weight:800;font-size:19px;line-height:1;margin-right:auto;white-space:nowrap}
.vnq-brand b{color:#ffc531}
.vnq-brand svg{width:30px;height:30px;flex:none}
.vnq-tabs{display:flex;gap:6px}
.vnq-tab{display:inline-flex;align-items:center;gap:6px;padding:8px 13px 6px;border-radius:999px;border:2px solid rgba(255,255,255,.4);color:#fff;text-decoration:none;
  font-weight:800;font-size:14px;line-height:1;white-space:nowrap;background:transparent;cursor:pointer}
.vnq-tab:hover{background:rgba(255,255,255,.12)}
.vnq-tab[aria-current="page"]{background:#ffc531;border-color:#1d2160;color:#1d2160;box-shadow:0 3px 0 #1d2160}
.vnq-tab:focus-visible,.vnq-install:focus-visible{outline:3px solid #ffc531;outline-offset:2px}
.vnq-install{display:inline-flex;align-items:center;gap:6px;padding:8px 13px 6px;border-radius:999px;border:2px solid #1d2160;background:#ff4f9a;color:#fff;
  font:800 14px/1 "Baloo 2","Trebuchet MS",system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 0 #1d2160;white-space:nowrap}
.vnq-tip{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:${+z+1};max-width:calc(100% - 32px);width:340px;
  background:#fff;color:#1d2160;border:3px solid #1d2160;border-radius:16px;padding:12px 14px;font:600 14px/1.45 "Be Vietnam Pro",system-ui,sans-serif;box-shadow:0 6px 0 rgba(10,12,40,.4)}
/* phones: the tabs move to a bottom bar. It lives outside the top bar because backdrop-filter
   would turn the top bar into the containing block of anything position:fixed inside it. */
.vnq-bottom{display:none}
@media (max-width:720px){
  .vnq-nav .vnq-tabs{display:none}
  .vnq-bottom{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:${z};justify-content:space-around;padding:6px 8px;padding-bottom:calc(6px + env(safe-area-inset-bottom,0px));
    background:rgba(20,22,70,.97);border-top:2px solid rgba(255,255,255,.14);font-family:"Baloo 2","Trebuchet MS",system-ui,sans-serif}
  .vnq-bottom .vnq-tab{flex:1;flex-direction:column;gap:3px;border:0;border-radius:12px;padding:6px 4px 5px;font-size:12px}
  .vnq-bottom .vnq-tab span:first-child{font-size:20px;line-height:1}
  .vnq-bottom .vnq-tab[aria-current="page"]{box-shadow:none}
  body{padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}
}
@media (max-width:420px){.vnq-brand{font-size:17px}}`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const logo='<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#2e3384"/><path d="M4 54 C12 30 18 16 26 14 C32 16 36 28 40 34 C44 26 48 22 52 22 C56 26 60 40 62 54 Z" fill="#4f8f68"/><path d="M12 56 C20 46 30 50 36 42 C42 34 50 38 56 30" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1 7"/><circle cx="46" cy="14" r="7" fill="#ff4f9a"/></svg>';
  const nav=document.createElement('nav');nav.className='vnq-nav';nav.setAttribute('aria-label','Việt Nam Quest');
  nav.innerHTML=`<a class="vnq-brand" href="${base}">${logo}<span>Việt Nam <b>Quest</b></span></a>
    <button class="vnq-install" type="button" hidden>📲 Cài app</button>
    <div class="vnq-tabs">${tabs.map(t=>`<a class="vnq-tab" href="${t.href}"${t.id===active?' aria-current="page"':''}><span aria-hidden="true">${t.icon}</span><span>${t.label}</span></a>`).join('')}</div>`;
  document.body.insertBefore(nav,document.body.firstChild);
  const bottom=document.createElement('nav');bottom.className='vnq-bottom';bottom.setAttribute('aria-label','Điều hướng');
  bottom.innerHTML=nav.querySelector('.vnq-tabs').innerHTML;
  document.body.appendChild(bottom);

  /* install: Chrome/Android gives a prompt event; iOS needs "Share → Add to Home Screen" */
  const btn=nav.querySelector('.vnq-install');
  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  let deferred=null,tip=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;if(!standalone)btn.hidden=false;});
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)&&!/crios|fxios/i.test(navigator.userAgent);
  if(ios&&!standalone)btn.hidden=false;
  btn.addEventListener('click',async()=>{
    if(deferred){deferred.prompt();try{await deferred.userChoice;}catch(e){}deferred=null;btn.hidden=true;return;}
    if(tip){tip.remove();tip=null;return;}
    tip=document.createElement('div');tip.className='vnq-tip';tip.setAttribute('role','status');
    tip.textContent='Trên iPhone: bấm nút Chia sẻ (ô vuông có mũi tên) ở thanh dưới Safari, rồi chọn “Thêm vào MH chính”. App sẽ có icon riêng như ứng dụng thật.';
    document.body.appendChild(tip);setTimeout(()=>{if(tip){tip.remove();tip=null;}},9000);
  });
  window.addEventListener('appinstalled',()=>{btn.hidden=true;});
})();
