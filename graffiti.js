/* =====================================================================
   TEMPE SKATE ROYALE — GRAFFITI LAB + WALL TAGGING (add-on module)
   - Graffiti editor (text mode + freehand paint mode, layers, stickers)
   - Black Book: save / edit / duplicate / delete designs, per-character
     Small / Large / XL slots (default = TSR logo)
   - Tag walls around Tempe; Cobra Doug scrubs player tags off over time
   Hooks into the game through window.__tsrScope (one bridge line inside
   index.html) by wrapping existing game functions. Fully offline.
   ===================================================================== */
(function(){
'use strict';
const S=window.__tsrScope;
if(typeof S!=='function'){console.warn('[graffiti] game bridge missing');return;}
const G=n=>{try{return S(n);}catch(e){return undefined;}};
const setG=S('(function(__n,__v){return eval(__n+"=__v");})');
const LV=S(`({get player(){return player},get state(){return state},set state(v){state=v},get gameMode(){return gameMode},get npcs(){return npcs},get cam(){return cam},get VW(){return VW},get VH(){return VH},get ground(){return ground},get buildings(){return buildings},get selChar(){return selChar},get act(){return act}})`);
const TAU=Math.PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const D=(a,b,c,d)=>Math.hypot(a-c,b-d);
const uid=()=>Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36);
function rng(seed){let s=(seed>>>0)||1;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function cv(w,h,smooth){const c=document.createElement('canvas');c.width=Math.max(1,w|0);c.height=Math.max(1,h|0);const g=c.getContext('2d',{willReadFrequently:true});if(smooth){g.__smoothOK=true;g.imageSmoothingEnabled=true;}return c;}
function ctx2(c,smooth){const g=c.getContext('2d');if(smooth){g.__smoothOK=true;g.imageSmoothingEnabled=true;}return g;}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hexRgb(h){h=String(h||'#000').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h.slice(0,6),16)||0;return[n>>16&255,n>>8&255,n&255];}
function rgbHex(r,g,b){return'#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');}
function shadeHex(h,k){const[r,g,b]=hexRgb(h);const t=k<0?0:255,a=Math.abs(k);return rgbHex(r+(t-r)*a,g+(t-g)*a,b+(t-b)*a);}
function g_(name){const f=G(name);return typeof f==='function'?f:null;}
function call(name,...a){const f=g_(name);if(f){try{return f(...a);}catch(e){console.warn('[graffiti]',name,e);}}}

/* ---------------- storage ---------------- */
const K={on:'tsr_graf_on',idx:'tsr_graf_idx',d:'tsr_graf_d_',tx:'tsr_graf_tx_',slots:'tsr_graf_slots',tags:'tsr_graf_tags',clock:'tsr_graf_clock',cfg:'tsr_graf_cfg'};
function lsGet(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){}}
const MAX_DESIGNS=18,MAX_LAYERS=6;
const SIZES={
  small:{W:256,H:256,tw:128,th:128,ww:22,wh:22,spray:2.4,clean:6,label:'SMALL',rows:3},/* owner: small is square (1:1) */
  large:{W:384,H:192,tw:192,th:96,ww:52,wh:26,spray:4.2,clean:9,label:'MEDIUM',rows:4},
  xl:{W:480,H:200,tw:240,th:100,ww:65,wh:27,spray:6.8,clean:13,label:'LARGE',rows:5}};/* owner: three sizes: small, medium, large. Large = the CALL DAFI! billboard (65 x 27 on the map) */
const SIZE_KEYS=['small','large','xl'];
const CFG=Object.assign({cleanAfter:300},lsGet(K.cfg,{}));

/* ---------------- TSR logo (default graffiti for every character) ---------------- */
const LOGO_SRC='data:image/webp;base64,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';
const LOGO=new Image();let LOGO_OK=false;LOGO.onload=()=>{LOGO_OK=true;TAGC.clear();refreshPieceColors();};LOGO.src=LOGO_SRC;

/* ---------------- design index + textures ---------------- */
let IDX=lsGet(K.idx,[]);if(!Array.isArray(IDX))IDX=[];
let SLOTS=lsGet(K.slots,{});if(!SLOTS||typeof SLOTS!=='object')SLOTS={};
const TEX=new Map();/* id -> {img,ok,src,col} (LRU) */
function texGet(id){if(!id||id==='tsr')return LOGO_OK?{img:LOGO,ok:true,col:'#ff8a70'}:null;let t=TEX.get(id);if(t){TEX.delete(id);TEX.set(id,t);return t.ok?t:null;}
  const src=lsGet(K.tx+id,null);if(!src)return null;t={img:new Image(),ok:false,src,col:'#ff3d9a'};t.img.onload=()=>{t.ok=true;t.col=domColor(t.img);TAGC.clear();refreshPieceColors();};t.img.src=src;TEX.set(id,t);
  while(TEX.size>24){const k=TEX.keys().next().value;TEX.delete(k);}return null;}
function texSrc(id){if(!id||id==='tsr')return LOGO_SRC;return lsGet(K.tx+id,null)||LOGO_SRC;}
function domColor(img){try{const c=cv(24,12,true),g=ctx2(c,true);g.drawImage(img,0,0,24,12);const d=g.getImageData(0,0,24,12).data;let best=null,bs=-1;for(let i=0;i<d.length;i+=4){if(d[i+3]<120)continue;const r=d[i],gg=d[i+1],b=d[i+2],mx=Math.max(r,gg,b),mn=Math.min(r,gg,b);const s=(mx-mn)+mx*0.25;if(s>bs){bs=s;best=[r,gg,b];}}return best?rgbHex(...best):'#ff3d9a';}catch(e){return'#ff3d9a';}}
function designMeta(id){return IDX.find(d=>d.id===id)||null;}
function curChar(){const p=LV.player;return(p&&p.P&&p.P.id)||LV.selChar||'dylan';}
function charName(id){const C=G('CHARS');const c=C&&C[id];return((c&&c.name)||String(id||'?')).toUpperCase();}
function slotOf(cid,size){const s=SLOTS[cid];const id=s&&s[size];return id&&designMeta(id)?id:null;}
function setSlot(cid,size,id){SLOTS[cid]=SLOTS[cid]||{};if(id)SLOTS[cid][size]=id;else delete SLOTS[cid][size];lsSet(K.slots,SLOTS);TAGC.clear();refreshPieceColors();}
function charKey(cid,size){return slotOf(cid,size)||'tsr';}
function refreshPieceColors(){const P=G('PIECE'),C=G('CHARS');if(!P||!C)return;for(const k of Object.keys(C)){const id=slotOf(k,'small')||slotOf(k,'large')||slotOf(k,'xl');let col='#ff8a70';if(id){const t=texGet(id);if(t)col=t.col;}P[k]={c1:col};}}

/* ---------------- text engine ---------------- */
const STYLES={
  graffiti:{label:'GRAFFITI',font:'"TSR Drip", "Rubik Wet Paint", Impact, "Arial Black", sans-serif',w:'400',infl:0,join:'round',slant:0,sy:1,solid:true},
  bubble:{label:'BUBBLE',font:'"TSR Bubble", "Bungee", "Arial Black", sans-serif',w:'400',infl:0,join:'round',slant:0,sy:1,bob:0.07,solid:true},
  block:{label:'BLOCK',font:'"TSR Block", "Bebas Neue", Impact, "Arial Black", sans-serif',w:'400',infl:0,join:'miter',slant:0,sy:1,solid:true},
  wild:{label:'WILDSTYLE',font:'"TSR Wild", "Bungee", Impact, "Arial Black", sans-serif',w:'400',infl:0,join:'miter',slant:0,sy:1,jit:0.12,solid:true},
  hand:{label:'HANDSTYLE',font:'"TSR Hand", "Pacifico", "Lobster", cursive',w:'400',infl:0,join:'round',slant:0,sy:1,solid:true}};
/* lettering traced from the owner's alphabet sheets (vector fonts in web/fonts/) */
const TSR_FONTS=[['TSR Block','block'],['TSR Bubble','bubble'],['TSR Hand','hand'],['TSR Wild','wild'],['TSR Drip','graffiti']];
const PALS={
  RUDIE:['#ff3d9a','#ffd23d','#14101a','#ffffff','#4fc3f7'],
  TOXIC:['#b6ff3a','#1e7a2a','#0c1408','#f4ff9a','#2a0a3a'],
  SUNSET:['#ffb03a','#ff3d6a','#2a0e2a','#fff1c8','#6a1a4a'],
  ICE:['#bff4ff','#3a8cff','#0a1430','#ffffff','#1a2a6a'],
  CHROME:['#f4f4f4','#8a8a9a','#14101a','#ffffff','#3a3a4a'],
  SUNDEVIL:['#ffc627','#8c1d40','#14101a','#fff6d8','#4a0e22'],
  BUBBLEGUM:['#ff9ad8','#9a6aff','#2a1040','#ffffff','#ff3d9a'],
  FIRE:['#fff03a','#ff3a1a','#2a0a00','#ffffff','#7a1a00']};
/* Lettering data. Word-level fields (T.*) apply to the whole word ("ALL"), letter fields (T.letters[i].*) to one character.
   v2 (JSR shape editor) adds: rx/ry/rz (3D rotation), ext (extrusion), lens (focal), z (push), bulge (lens bulge),
   wsx/wsy (word scale W/H), wp (4-corner warp, px offsets TL,TR,BR,BL) and bend. Old designs get these defaults on load. */
const WP0=()=>[0,0,0,0,0,0,0,0];
const LDEF=()=>({dx:0,dy:0,rot:0,sx:1,sy:1,sk:0,c1:'',c2:'',rx:0,ry:0,z:0,ext:null,lens:null,bulge:0,wp:WP0(),bend:0,lz:0,fx:false,fy:false});/* lz: layer order (higher = drawn on top), fx/fy: mirror the glyph in its own frame */
const TDEF={rx:0,ry:0,rz:0,ext:0,lens:0.35,z:0,bulge:0,wsx:1,wsy:1,bend:0,max7:false};
const TCOL={fill:'#ffd23d',fill2:'#ff3d9a',outlineC:'#14101a',borderC:'#ffffff',shadowC:'#000000',depthC:'#4a1a6a'};
function newText(str,W,H){return Object.assign({str:str||'TEMPE',style:'graffiti',size:Math.round(H*0.42),spacing:0,overlap:4,curve:0,slant:0,x:W/2,y:H/2,
  fill:TCOL.fill,fill2:TCOL.fill2,grad:true,outline:Math.round(H*0.035)+2,outlineC:TCOL.outlineC,border:Math.round(H*0.025)+1,borderC:TCOL.borderC,
  shadow:Math.round(H*0.03),shadowC:TCOL.shadowC,depth:Math.round(H*0.04),depthC:TCOL.depthC,depthA:0.8,highlight:true,distress:0,drips:0,stack:false,outlineOnly:false,flipX:false,flipY:false,seed:(Math.random()*1e6)|0,letters:[]},TDEF,{wp:WP0()});}
function migrateText(T){for(const k in TDEF)if(T[k]===undefined||T[k]===null)T[k]=TDEF[k];if(!Array.isArray(T.wp)||T.wp.length!==8)T.wp=WP0();if(!Array.isArray(T.letters))T.letters=[];
  for(let i=0;i<T.letters.length;i++){const q=T.letters[i]&&typeof T.letters[i]==='object'?T.letters[i]:{};const d=LDEF();for(const k in d)if(q[k]===undefined)q[k]=d[k];if(!Array.isArray(q.wp)||q.wp.length!==8)q.wp=WP0();T.letters[i]=q;}return T;}
function syncLetters(T){migrateText(T);const n=[...T.str].length;while(T.letters.length<n)T.letters.push(LDEF());if(T.letters.length>n)T.letters.length=n;}
/* string edits that keep every other letter's settings attached to the right character */
function insChar(T,i,c){syncLetters(T);const a=[...T.str];i=clamp(i,0,a.length);a.splice(i,0,c);T.letters.splice(i,0,LDEF());T.str=a.join('');}
function delChar(T,i){syncLetters(T);const a=[...T.str];if(i<0||i>=a.length)return false;a.splice(i,1);T.letters.splice(i,1);T.str=a.join('');return true;}
function setStr(T,s){syncLetters(T);const a=[...T.str],b=[...s];let p=0;while(p<a.length&&p<b.length&&a[p]===b[p])p++;let q=0;while(q<a.length-p&&q<b.length-p&&a[a.length-1-q]===b[b.length-1-q])q++;
  const ins=b.length-p-q,del=a.length-p-q;T.letters.splice(p,del,...Array.from({length:ins},LDEF));T.str=s;syncLetters(T);}
function lensF(H,v){return H/(0.06+clamp(+v||0,0,1)*1.6);}
const MEAS=cv(4,4).getContext('2d');
/* Geometry: lays the word out and builds the projection for every letter:
   glyph-local (x,y, extrusion z) -> corner warp + bend -> stretch/skew/roll -> letter 3D rotation -> letter position/push
   -> word scale -> word warp/bend/bulge -> word 3D rotation -> push -> perspective (focal) -> flip. */
function layoutText(T,W,H){syncLetters(T);const st=STYLES[T.style]||STYLES.graffiti;const chars=[...T.str];const n=chars.length;
  const font=`${st.w} ${T.size}px ${st.font}`;MEAS.font=font;const ws=chars.map(c=>c===' '?T.size*0.35:Math.max(T.size*0.25,MEAS.measureText(c).width));
  const infl=T.size*st.infl;const gap=T.spacing-T.overlap;const total=n?ws.reduce((a,b)=>a+b,0)+gap*(n-1):0;let cur=T.x-total/2;const r=rng(T.seed);const L=[];
  for(let i=0;i<n;i++){const u=n>1?(i/(n-1))*2-1:0;const half=Math.max(1,total/2);const oy=-T.curve*(1-u*u);const ang=Math.atan(2*T.curve*u/half);
    let bob=st.bob?(i%2?1:-1)*T.size*st.bob:0;const jit=st.jit?(r()-0.5)*st.jit:0;r();
    const Lt=T.letters[i];const cx=cur+ws[i]/2;cur+=ws[i]+gap;
    L.push({ch:chars[i],w:ws[i],x:cx+Lt.dx,y:T.y+oy+bob+Lt.dy,rot:ang+jit+Lt.rot,sk:st.slant+T.slant+Lt.sk,sx:Lt.sx,sy:Lt.sy*st.sy,lz:+Lt.lz||0,fx:!!Lt.fx,fy:!!Lt.fy,c1:Lt.c1||T.fill,c2:Lt.c2||(T.grad?T.fill2:(Lt.c1||T.fill)),i,Lt,sp:st.spikes?[r(),r(),r(),r()]:null,dr:[r(),r(),r(),r(),r()]});}
  const wcx=T.x,wcy=T.y,hwW=Math.max(T.size*0.5,total/2+T.size*0.15),hhW=T.size*0.6+Math.abs(T.curve)*0.5;
  const wsx=T.wsx,wsy=T.wsy,wz=(Math.abs(wsx)+Math.abs(wsy))/2;const crz=Math.cos(T.rz),srz=Math.sin(T.rz),cry=Math.cos(T.ry),sry=Math.sin(T.ry),crx=Math.cos(T.rx),srx=Math.sin(T.rx);
  const WP=T.wp,WB=T.bend,BU=T.bulge,PZ=T.z,bw=Math.max(1,hwW*Math.abs(wsx)),bh=Math.max(1,hhW*Math.abs(wsy));const fT=lensF(H,T.lens);
  const word=(X,Y,Z,f)=>{let dx=(X-wcx)*wsx,dy=(Y-wcy)*wsy,z=Z*wz;const u=(dx/bw+1)/2,v=(dy/bh+1)/2;
    dx+=(1-u)*(1-v)*WP[0]+u*(1-v)*WP[2]+u*v*WP[4]+(1-u)*v*WP[6];dy+=(1-u)*(1-v)*WP[1]+u*(1-v)*WP[3]+u*v*WP[5]+(1-u)*v*WP[7];
    if(WB){const s=2*u-1;dy-=WB*(1-s*s);}if(BU){const q=1-((dx/bw)**2+(dy/bh)**2);if(q>0)z-=BU*q;}
    const x1=dx*crz-dy*srz,y1=dx*srz+dy*crz;const x2=x1*cry+z*sry,z2=-x1*sry+z*cry;const y3=y1*crx-z2*srx;let z3=y1*srx+z2*crx+PZ;
    const s=f/Math.max(f*0.08,f+z3);let px=wcx+x2*s,py=wcy+y3*s;if(T.flipX)px=W-px;if(T.flipY)py=H-py;return[px,py,z3];};
  for(const l of L){const Lt=l.Lt,hw=Math.max(1,l.w/2),hh=T.size/2,wp=Lt.wp,bd=Lt.bend,bu=Lt.bulge;const cr=Math.cos(l.rot),sr=Math.sin(l.rot),sk=l.sk,sx=l.sx,sy=l.sy;
    const cY=Math.cos(Lt.ry),sY=Math.sin(Lt.ry),cX=Math.cos(Lt.rx),sX=Math.sin(Lt.rx);const f=lensF(H,Lt.lens!=null?Lt.lens:T.lens),lz=Lt.z;
    l.hw=hw;l.hh=hh;l.ext=Lt.ext!=null?Lt.ext:T.ext;
    l.fn=(lx,ly,e)=>{const u=(lx/hw+1)/2,v=(ly/hh+1)/2;let x=lx+(1-u)*(1-v)*wp[0]+u*(1-v)*wp[2]+u*v*wp[4]+(1-u)*v*wp[6];let y=ly+(1-u)*(1-v)*wp[1]+u*(1-v)*wp[3]+u*v*wp[5]+(1-u)*v*wp[7];
      if(bd){const s=2*u-1;y-=bd*(1-s*s);}x*=sx;y*=sy;x+=sk*y;const xr=x*cr-y*sr,yr=x*sr+y*cr;let z=e||0;if(bu){const q=1-((lx/hw)**2+(ly/hh)**2);if(q>0)z-=bu*q;}
      const x2=xr*cY+z*sY,z2=-xr*sY+z*cY;const y3=yr*cX-z2*sX,z3=yr*sX+z2*cX;return word(l.x+x2,l.y+y3,lz+z3,f);};}
  const wordQ=[word(wcx-hwW,wcy-hhW,0,fT),word(wcx+hwW,wcy-hhW,0,fT),word(wcx+hwW,wcy+hhW,0,fT),word(wcx-hwW,wcy+hhW,0,fT)];
  const boxes=L.map(l=>{const c=l.fn(0,0,0);const q=[l.fn(-l.hw,-l.hh,0),l.fn(l.hw,-l.hh,0),l.fn(l.hw,l.hh,0),l.fn(-l.hw,l.hh,0)];let r=0;for(const p of q)r=Math.max(r,D(p[0],p[1],c[0],c[1]));return{x:c[0],y:c[1],r:Math.max(T.size*0.25,r*0.78),q};});
  return{st,font,infl,L,n,word,wordQ,hwW,hhW,fT,boxes,W,H,wcx,wcy};}
/* handles for direct warp manipulation: 4 corners + bend (top middle) */
/* combined screen box of several letters (multi-select warp) */
function selBox(lay,idx){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const i of idx){const l=lay.L[i];if(!l||l.ch===' ')continue;for(const p of[[-l.hw,-l.hh],[l.hw,-l.hh],[l.hw,l.hh],[-l.hw,l.hh]]){const q=l.fn(p[0],p[1],0);x0=Math.min(x0,q[0]);y0=Math.min(y0,q[1]);x1=Math.max(x1,q[0]);y1=Math.max(y1,q[1]);}}return x1>x0?{x0,y0,x1,y1}:null;}
function warpHandles(lay,i){if(Array.isArray(i)){if(i.length===1)i=i[0];else if(!i.length)i=-1;else{const b=selBox(lay,i);if(!b)return[];return[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1],[(b.x0+b.x1)/2,b.y0]].map((p,k)=>({k:k<4?k:'b',x:p[0],y:p[1]}));}}
  if(i>=0){const l=lay.L[i];if(!l)return[];return[[-l.hw,-l.hh],[l.hw,-l.hh],[l.hw,l.hh],[-l.hw,l.hh],[0,-l.hh]].map((p,k)=>{const q=l.fn(p[0],p[1],0);return{k:k<4?k:'b',x:q[0],y:q[1]};});}
  const w=lay.word,hw=lay.hwW,hh=lay.hhW;return[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh],[0,-hh]].map((p,k)=>{const q=w(lay.wcx+p[0],lay.wcy+p[1],0,lay.fT);return{k:k<4?k:'b',x:q[0],y:q[1]};});}
/* ---- projection helpers ---- */
function affineOf(fn,b,e){const p00=fn(b.x0,b.y0,e),p10=fn(b.x1,b.y0,e),p01=fn(b.x0,b.y1,e);const dw=b.x1-b.x0,dh=b.y1-b.y0;
  const a=(p10[0]-p00[0])/dw,bb=(p10[1]-p00[1])/dw,c=(p01[0]-p00[0])/dh,d=(p01[1]-p00[1])/dh;const ee=p00[0]-a*b.x0-c*b.y0,f=p00[1]-bb*b.x0-d*b.y0;
  for(const[u,v]of[[1,1],[0.5,0.5],[0.5,0],[0,0.5],[1,0.5],[0.5,1]]){const x=b.x0+dw*u,y=b.y0+dh*v;const q=fn(x,y,e);if(Math.abs(a*x+c*y+ee-q[0])+Math.abs(bb*x+d*y+f-q[1])>0.35)return null;}
  return[a,bb,c,d,ee,f];}
function triDraw(g,img,s0,s1,s2,d0,d1,d2){const sx1=s1[0]-s0[0],sy1=s1[1]-s0[1],sx2=s2[0]-s0[0],sy2=s2[1]-s0[1];const det=sx1*sy2-sx2*sy1;if(Math.abs(det)<1e-9)return;
  const dx1=d1[0]-d0[0],dy1=d1[1]-d0[1],dx2=d2[0]-d0[0],dy2=d2[1]-d0[1];if(Math.abs(dx1*dy2-dx2*dy1)<0.01)return;
  const a=(dx1*sy2-dx2*sy1)/det,c=(dx2*sx1-dx1*sx2)/det,b=(dy1*sy2-dy2*sy1)/det,d=(dy2*sx1-dy1*sx2)/det;const e=d0[0]-a*s0[0]-c*s0[1],f=d0[1]-b*s0[0]-d*s0[1];
  /* grow the clip triangle so every edge moves out ~0.9px (miter, capped): no hairline gaps between neighbouring triangles */const ex=(V,P,Q)=>{let ax=P[0]-V[0],ay=P[1]-V[1],bx=Q[0]-V[0],by=Q[1]-V[1];const la=Math.hypot(ax,ay)||1,lb=Math.hypot(bx,by)||1;ax/=la;ay/=la;bx/=lb;by/=lb;let mx=-(ax+bx),my=-(ay+by);const lm=Math.hypot(mx,my)||1;const c=ax*bx+ay*by;const k=Math.min(3,0.9/Math.sqrt(Math.max(1e-4,(1-c)/2)));return[V[0]+mx/lm*k,V[1]+my/lm*k];};const e0=ex(d0,d1,d2),e1=ex(d1,d2,d0),e2=ex(d2,d0,d1);
  g.save();g.setTransform(1,0,0,1,0,0);g.beginPath();g.moveTo(e0[0],e0[1]);g.lineTo(e1[0],e1[1]);g.lineTo(e2[0],e2[1]);g.closePath();g.clip();g.setTransform(a,b,c,d,e,f);
  const x0=Math.max(0,Math.floor(Math.min(s0[0],s1[0],s2[0])-1)),y0=Math.max(0,Math.floor(Math.min(s0[1],s1[1],s2[1])-1)),x1=Math.min(img.width,Math.ceil(Math.max(s0[0],s1[0],s2[0])+1)),y1=Math.min(img.height,Math.ceil(Math.max(s0[1],s1[1],s2[1])+1));
  if(x1>x0&&y1>y0)g.drawImage(img,x0,y0,x1-x0,y1-y0,x0,y0,x1-x0,y1-y0);g.restore();}
function meshDraw(g,spr,fn,e,ox,oy,N){const b=spr.b,ss=spr.ss;const S=[],P=[];for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const lx=b.x0+(b.x1-b.x0)*i/N,ly=b.y0+(b.y1-b.y0)*j/N;S.push([lx*ss+spr.cx,ly*ss+spr.cy]);const q=fn(lx,ly,e);P.push([q[0]+ox,q[1]+oy]);}
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=j*(N+1)+i,k1=k+1,k2=k+N+1,k3=k2+1;triDraw(g,spr.c,S[k],S[k1],S[k3],P[k],P[k1],P[k3]);triDraw(g,spr.c,S[k],S[k3],S[k2],P[k],P[k3],P[k2]);}}
const SPR=new Map();/* glyph sprites for perspective/warped letters (LRU) */
let FASTR=false;/* cheaper preview while a drag / slider is live; full quality on release */
try{if(window.FontFace&&document.fonts)for(const[f,k]of TSR_FONTS){const ff=new FontFace(f,'url(fonts/tsr-'+k+'.woff2)',{weight:'100 900'});document.fonts.add(ff);ff.load().then(()=>{SPR.clear();if(ED)for(const l of ED.layers)if(l.type==='text')l._dirty=true;render();}).catch(()=>{});}}catch(e){}
try{document.fonts&&document.fonts.addEventListener&&document.fonts.addEventListener('loadingdone',()=>{SPR.clear();if(ED)for(const l of ED.layers)if(l.type==='text')l._dirty=true;render();});}catch(e){}
function renderText(T,W,H,out){out=out&&out.width===W&&out.height===H?out:cv(W,H,true);const g0=ctx2(out,true);g0.setTransform(1,0,0,1,0,0);g0.clearRect(0,0,W,H);
  let g=g0;const lay=layoutText(T,W,H);const{st,font,infl,L,n}=lay;out._boxes=lay.boxes;out._wordQ=lay.wordQ;if(!n)return out;
  const tf=(gg,l,ox,oy)=>{const m=l._m;gg.setTransform(m[0],m[1],m[2],m[3],m[4]+(ox||0),m[5]+(oy||0));};
  const sil=(gg,l,extra,style,ox,oy)=>{if(l.ch===' ')return;tf(gg,l,ox,oy);gg.font=font;gg.textAlign='center';gg.textBaseline='middle';gg.lineJoin=st.join;gg.miterLimit=3;gg.fillStyle=style;gg.strokeStyle=style;
    const fl=l.fx||l.fy,fsx=l.fx?-1:1,fsy=l.fy?-1:1;if(fl)gg.scale(fsx,fsy);/* per-letter mirror: only the glyph (and its spikes) flip, gradient / drips / shine stay upright */
    gg.fillText(l.ch,0,0);const lw=infl*2+extra*2;if(lw>0.5){gg.lineWidth=lw;gg.strokeText(l.ch,0,0);}
    if(l.sp){const s=T.size;for(let k=0;k<2;k++){const a=l.sp[k],sgn=k?-1:1;gg.beginPath();const bx=sgn*l.w*0.28,by=-sgn*s*0.28;const tx=bx+sgn*s*(0.32+a*0.25),ty=by-sgn*s*(0.2+l.sp[k+2]*0.2);gg.moveTo(bx-s*0.06,by);gg.lineTo(tx,ty);gg.lineTo(bx+s*0.06,by+sgn*s*0.08);gg.closePath();gg.fill();if(lw>0.5)gg.stroke();
      const hx=tx,hy=ty,ang=Math.atan2(ty-by,tx-bx);gg.beginPath();gg.moveTo(hx+Math.cos(ang)*s*0.1,hy+Math.sin(ang)*s*0.1);gg.lineTo(hx+Math.cos(ang+2.4)*s*0.12,hy+Math.sin(ang+2.4)*s*0.12);gg.lineTo(hx+Math.cos(ang-2.4)*s*0.12,hy+Math.sin(ang-2.4)*s*0.12);gg.closePath();gg.fill();if(lw>0.5)gg.stroke();}}
    if(fl)gg.scale(fsx,fsy);
    if(T.drips>0){const s=T.size;for(let k=0;k<3;k++){if(l.dr[k]>T.drips/10+0.15)continue;const dx=(l.dr[k+1]-0.5)*l.w*0.7,len=s*(0.15+l.dr[k]*0.45)*(T.drips/6);const w=Math.max(2,s*0.06)+extra*2+infl;gg.fillRect(dx-w/2,s*0.25,w,len);gg.beginPath();gg.arc(dx,s*0.25+len,w*0.75,0,TAU);gg.fill();}}};
  const hiPoly=(gg,l)=>{const s=T.size;tf(gg,l);gg.fillStyle='rgba(255,255,255,0.55)';gg.beginPath();gg.moveTo(-l.w*0.6,-s*0.42);gg.lineTo(l.w*0.6,-s*0.42);gg.lineTo(l.w*0.6,-s*0.3);gg.lineTo(-l.w*0.6,-s*0.16);gg.closePath();gg.fill();};
  const sparkle=(gg,l)=>{const s=T.size;tf(gg,l);gg.fillStyle='#ffffff';const x=l.w*0.32,y=-s*0.36,R=Math.max(2,s*0.07);gg.beginPath();for(let k=0;k<8;k++){const a=k/8*TAU,rr=k%2?R*0.28:R;gg.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}gg.closePath();gg.fill();};
  const fillBody=(gg,l,hi)=>{tf(gg,l);const g2=gg.createLinearGradient(0,-T.size*0.45,0,T.size*0.45);g2.addColorStop(0,l.c1);g2.addColorStop(1,l.c2);sil(gg,l,0,g2);
    if(hi&&T.highlight){gg.globalCompositeOperation='source-atop';hiPoly(gg,l);gg.globalCompositeOperation='source-over';if(!(l.i%2))sparkle(gg,l);}};
  const outer=T.outline+T.border;const da=T.depthA;
  const wordWarped=T.bend||T.bulge||T.wp.some(v=>v);
  const styleKey=[font,T.size,st.join,infl,T.outline,T.border,T.drips,T.highlight?1:0,T.shadow,T.depth,T.depthA,T.shadowC,T.borderC,T.outlineC,T.depthC].join('|');
  for(const l of L){const s=T.size,pad=(st.spikes?s*0.8:s*0.15)+outer+infl+3+Math.max(T.shadow,T.depth)*1.3;l.b={x0:-(l.w/2+pad),x1:l.w/2+pad,y0:-(s*0.8+pad),y1:s*0.8+pad+(T.drips>0?s*1.05:0)};
    l.M0=affineOf(l.fn,l.b,0);const Lt=l.Lt;l.N=FASTR?3:(wordWarped||Lt.bend||Lt.bulge||Lt.wp.some(v=>v))?5:4;
    const c=l.fn(0,0,0),px=l.fn(1,0,0),py=l.fn(0,1,0);l.zc=c[2];l.ss=clamp(Math.round(Math.max(D(c[0],c[1],px[0],px[1]),D(c[0],c[1],py[0],py[1]))*1.15*2)/2,1,2);}
  const sprite=(l,key,body)=>{const k=key+'|'+styleKey+'|'+JSON.stringify([l.ch,Math.round(l.w*10),l.c1,l.c2,l.i%2,l.sp,l.dr,l.ss,l.fx?1:0,l.fy?1:0]);let s=SPR.get(k);if(s){SPR.delete(k);SPR.set(k,s);return s;}
    const b=l.b,ss=l.ss;const c=cv(Math.min(1400,Math.ceil((b.x1-b.x0)*ss)),Math.min(1400,Math.ceil((b.y1-b.y0)*ss)),true);const gg=ctx2(c,true);const keep=l._m;l._m=[ss,0,0,ss,-b.x0*ss,-b.y0*ss];body(gg);l._m=keep;gg.setTransform(1,0,0,1,0,0);
    s={c,ss,cx:-b.x0*ss,cy:-b.y0*ss,b};SPR.set(k,s);while(SPR.size>140){const q=SPR.keys().next().value;SPR.delete(q);}return s;};
  /* draw one pass of one letter: plain affine canvas transform when the projection is affine (flat letters, exact old look),
     otherwise a cached glyph sprite mapped through a subdivided perspective mesh */
  const pass=(gg,l,key,body,e,ox,oy)=>{const M=e?affineOf(l.fn,l.b,e):l.M0;if(M){l._m=[M[0],M[1],M[2],M[3],M[4]+(ox||0),M[5]+(oy||0)];body(gg);return;}
    meshDraw(gg,sprite(l,key,body),l.fn,e||0,ox||0,oy||0,e?2:l.N);};
  const F=cv(W,H,true),fg=ctx2(F,true);
  const fillPass=list=>{fg.setTransform(1,0,0,1,0,0);fg.clearRect(0,0,W,H);
    for(const l of list){if(l.ch===' ')continue;if(l.M0){l._m=l.M0;fillBody(fg,l,false);}else pass(fg,l,'fi',gg=>fillBody(gg,l,true),0);}
    if(T.highlight){fg.setTransform(1,0,0,1,0,0);fg.globalCompositeOperation='source-atop';for(const l of list){if(l.ch===' '||!l.M0)continue;l._m=l.M0;hiPoly(fg,l);}
      fg.globalCompositeOperation='source-over';fg.setTransform(1,0,0,1,0,0);for(const l of list){if(l.ch===' '||l.i%2||!l.M0)continue;l._m=l.M0;sparkle(fg,l);}}
    g.setTransform(1,0,0,1,0,0);g.drawImage(F,0,0);};
  /* genuine extrusion: the letter's silhouette re-projected at increasing depth behind its face, back to front */
  const extPass=l=>{const e=l.ext;if(!(Math.abs(e)>0.5)||l.ch===' ')return;const p0=l.fn(0,0,0),p1=l.fn(0,0,e),q0=l.fn(l.hw,l.hh,0),q1=l.fn(l.hw,l.hh,e);
    const shift=Math.max(D(p0[0],p0[1],p1[0],p1[1]),D(q0[0],q0[1],q1[0],q1[1]));const N=clamp(Math.ceil(shift/(FASTR?2.6:1.25)),2,FASTR?10:24);const dark=shadeHex(T.depthC,-0.45),mid=shadeHex(T.depthC,-0.12);
    for(let k=N;k>=1;k--){const d=e*k/N;const c=k===N?T.outlineC:(k>N*0.55?dark:mid);pass(g,l,'ex'+c,gg=>sil(gg,l,outer,c),d);}};
  /* perspective letters: shadow + offset depth + border + outline baked into one sprite (offsets in the letter's plane) */
  const underBody=(gg,l)=>{const k=l._m[0];if(T.shadow>0)sil(gg,l,outer,T.shadowC+'99',T.shadow*0.9*k,T.shadow*k);
    if(T.depth>0)for(let d=Math.ceil(T.depth);d>=1;d--)sil(gg,l,outer,shadeHex(T.depthC,-0.35*d/Math.max(1,T.depth)),Math.cos(da)*d*k,Math.sin(da)*d*k);
    if(T.border>0)sil(gg,l,outer,T.borderC);if(T.outline>0)sil(gg,l,T.outline,T.outlineC);};
  const passes=list=>{const flat=list.filter(l=>l.M0),mesh=list.filter(l=>!l.M0&&l.ch!==' ');
    if(T.shadow>0)for(const l of flat)pass(g,l,'sh',gg=>sil(gg,l,outer,T.shadowC+'99'),0,T.shadow*0.9,T.shadow);
    for(const l of list)extPass(l);
    if(T.depth>0)for(let d=Math.ceil(T.depth);d>=1;d--){const k=d/Math.max(1,T.depth);const c=shadeHex(T.depthC,-0.35*k);for(const l of flat)pass(g,l,'ld'+c,gg=>sil(gg,l,outer,c),0,Math.cos(da)*d,Math.sin(da)*d);}
    for(const l of mesh)pass(g,l,'un',gg=>underBody(gg,l),0);
    if(T.border>0)for(const l of flat)pass(g,l,'bo',gg=>sil(gg,l,outer,T.borderC),0);
    if(T.outline>0)for(const l of flat)pass(g,l,'ol',gg=>sil(gg,l,T.outline,T.outlineC),0);
    fillPass(list);};
  /* OUTLINE ONLY: just the outline-colour edge of every letter's shape, see-through inside (no fill / border / shadow / depth / shine) */
  const olPasses=(list,mask)=>{const ow=Math.max(1,T.outline),oc=T.outlineC||'#14101a';
    for(const l of list)if(l.ch!==' ')pass(g,l,'ol',gg=>sil(gg,l,ow,oc),0);
    if(mask){mask.setTransform(1,0,0,1,0,0);mask.clearRect(0,0,W,H);mask.drawImage(g.canvas,0,0);}
    g.globalCompositeOperation='destination-out';for(const l of list)if(l.ch!==' ')pass(g,l,'oi',gg=>sil(gg,l,0,'#000'),0);g.globalCompositeOperation='source-over';g.setTransform(1,0,0,1,0,0);};
  /* painter's order: layer order first (a letter tapped last is raised on top), then farthest letter first */
  const order=L.slice().sort((a,b)=>(a.lz-b.lz)||(b.zc-a.zc));
  /* keep letter counters open (the holes in D O A P R B Q 4 6 8 9 0 ...): inflation, outline and border strokes grow into the
     hole from every side and close it. Find each letter's real holes from its plain glyph, then re-open them: a ring of
     outline colour where the fill meets the hole and see-through in the middle, never eating more than ~60% of the hole. */
  const cutCounters=list=>{const oc=T.outlineC||'#14101a',HOLES=[];
    for(const l of list){if(l.ch===' '||!/[A-Za-z0-9&@%#$]/.test(l.ch))continue;
      const mc=cv(W,H,true),mg=ctx2(mc,true);const raw=gg=>{tf(gg,l);gg.font=font;gg.textAlign='center';gg.textBaseline='middle';gg.fillStyle='#000';if(l.fx||l.fy)gg.scale(l.fx?-1:1,l.fy?-1:1);gg.fillText(l.ch,0,0);};
      if(l.M0){l._m=l.M0;raw(mg);}else pass(mg,l,'raw',raw,0);mg.setTransform(1,0,0,1,0,0);
      const md=mg.getImageData(0,0,W,H).data,N=W*H,A=new Uint8Array(N);let any=0;for(let i=0;i<N;i++){A[i]=md[i*4+3];if(A[i]>127)any=1;}if(!any)continue;
      /* outside = non-glyph pixels reachable from the edge; holes = the rest */const out=new Uint8Array(N),q=new Int32Array(N);let qh=0,qt=0;const push=i=>{if(A[i]<128&&!out[i]){out[i]=1;q[qt++]=i;}};
      for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}for(let y=0;y<H;y++){push(y*W);push(y*W+W-1);}
      while(qh<qt){const i=q[qh++],x=i%W;if(x>0)push(i-1);if(x<W-1)push(i+1);if(i>=W)push(i-W);if(i<N-W)push(i+W);}
      const lab=new Int32Array(N);let nc=0;const area=[0];
      for(let i=0;i<N;i++){if(A[i]>127||out[i]||lab[i])continue;nc++;area[nc]=0;qh=0;qt=0;lab[i]=nc;q[qt++]=i;while(qh<qt){const j=q[qh++],x=j%W;area[nc]++;for(const k of[x>0?j-1:-1,x<W-1?j+1:-1,j-W,j+W]){if(k<0||k>=N||A[k]>127||out[k]||lab[k])continue;lab[k]=nc;q[qt++]=k;}}}
      if(!nc)continue;
      const c0=l.fn(0,0,0),c1=l.fn(1,0,0),ks=Math.max(0.3,l.M0?Math.sqrt(Math.abs(l.M0[0]*l.M0[3]-l.M0[1]*l.M0[2])):D(c0[0],c0[1],c1[0],c1[1]));const ol=Math.max(1,(T.outline||1.5)*ks),inflPx=infl*ks;
      for(let c=1;c<=nc;c++){if(area[c]<3)continue;
        /* the hole's exact outline (marching squares on the glyph's coverage, sub-pixel), so the ring can be stroked as a real path:
           even thickness everywhere, mitred corners for block / wildstyle, round corners for the soft styles */
        const f=(x,y)=>{if(x<0||y<0||x>=W||y>=H)return 255;const i=y*W+x;return lab[i]===c?A[i]:Math.max(A[i],255*(lab[i]!==c&&A[i]<128?1:0));};
        const segs=new Map(),key=(x,y)=>Math.round(x*64)+','+Math.round(y*64),P=[];const lerp=(a,b)=>(128-a)/((b-a)||1);
        let x0=W,x1=0,y0=H,y1=0;for(let i=0;i<N;i++)if(lab[i]===c){const x=i%W,y=(i/W)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
        const add=(a,b)=>{P.push([a,b]);};
        for(let y=y0-1;y<=y1;y++)for(let x=x0-1;x<=x1;x++){const tl=f(x,y),tr=f(x+1,y),br=f(x+1,y+1),bl=f(x,y+1);const idx=(tl<128?8:0)|(tr<128?4:0)|(br<128?2:0)|(bl<128?1:0);if(idx===0||idx===15)continue;
          const T_=[x+lerp(tl,tr),y],R_=[x+1,y+lerp(tr,br)],B_=[x+lerp(bl,br),y+1],L_=[x,y+lerp(tl,bl)];
          switch(idx){case 1:case 14:add(L_,B_);break;case 2:case 13:add(B_,R_);break;case 3:case 12:add(L_,R_);break;case 4:case 11:add(T_,R_);break;case 6:case 9:add(T_,B_);break;case 7:case 8:add(L_,T_);break;case 5:add(L_,T_);add(B_,R_);break;case 10:add(T_,R_);add(L_,B_);break;}}
        /* chain the segments into closed loops */const adj=new Map();P.forEach((sg,k)=>{for(const e of[0,1]){const kk=key(sg[e][0],sg[e][1]);if(!adj.has(kk))adj.set(kk,[]);adj.get(kk).push(k);}});
        const used=new Uint8Array(P.length),loops=[];for(let k0=0;k0<P.length;k0++){if(used[k0])continue;used[k0]=1;const loop=[P[k0][0],P[k0][1]];let cur=P[k0][1];for(let guard=0;guard<P.length;guard++){const nb=(adj.get(key(cur[0],cur[1]))||[]).find(k=>!used[k]);if(nb==null)break;used[nb]=1;const sg=P[nb];const nx=key(sg[0][0],sg[0][1])===key(cur[0],cur[1])?sg[1]:sg[0];loop.push(nx);cur=nx;}if(loop.length>3)loops.push(loop);}
        /* straighten pixel stair-steps so block letters get crisp straight edges and real corners */
        const rdp=(pts,eps)=>{if(pts.length<3)return pts;let dm=0,ix=0;const a=pts[0],b=pts[pts.length-1],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;for(let k=1;k<pts.length-1;k++){const d=Math.abs((pts[k][0]-a[0])*dy-(pts[k][1]-a[1])*dx)/L;if(d>dm){dm=d;ix=k;}}return dm>eps?rdp(pts.slice(0,ix+1),eps).slice(0,-1).concat(rdp(pts.slice(ix),eps)):[a,b];};
        const eps=st.join==='miter'?0.7:0.35;
        const rdpC=(lp,e)=>{let fi=0,fd=0;for(let k=1;k<lp.length;k++){const d=Math.hypot(lp[k][0]-lp[0][0],lp[k][1]-lp[0][1]);if(d>fd){fd=d;fi=k;}}if(fi<2)return lp;return rdp(lp.slice(0,fi+1),e).slice(0,-1).concat(rdp(lp.slice(fi),e));};
        const polys=loops.map(lp=>rdpC(lp,eps).map(q=>[q[0]+0.5,q[1]+0.5]));let per=0;for(const pl of polys)for(let k=0;k<pl.length;k++){const a=pl[k],b=pl[(k+1)%pl.length];per+=Math.hypot(b[0]-a[0],b[1]-a[1]);}
        const rin=2*area[c]/Math.max(1,per);/* ~ half the hole's width */
        HOLES.push({polys,rin,ol});}}
    /* one ring thickness for the whole word, so every counter (A, D, O, P...) matches; only a counter too narrow to hold it gets a thinner ring.
       The counter keeps the letter's real hole shape (the puffy fill / outline / border never fill it); the ring sits just inside it. */
    if(!HOLES.length)return;
    if(st.solid&&!T.outlineOnly){g.save();g.setTransform(1,0,0,1,0,0);g.fillStyle=oc;for(const h of HOLES){g.beginPath();for(const pl of h.polys){pl.forEach((p2,n)=>n?g.lineTo(p2[0],p2[1]):g.moveTo(p2[0],p2[1]));g.closePath();}g.fill();}g.restore();return;}const rs=HOLES.map(h=>h.rin).sort((a,b)=>a-b),r25=rs[Math.floor(rs.length*0.25)];const t0=Math.max(1.6,Math.min(HOLES[0].ol,r25*0.8));const J=st.join==='miter'?'miter':'round';
    const shape=(polys,e)=>{const c2=cv(W,H,true),q=ctx2(c2,true);q.beginPath();for(const pl of polys){pl.forEach((p2,n)=>n?q.lineTo(p2[0],p2[1]):q.moveTo(p2[0],p2[1]));q.closePath();}q.fillStyle='#000';q.fill();
      if(e>0){q.lineJoin=J;q.miterLimit=2.6;q.lineWidth=e*2;q.strokeStyle='#000';q.globalCompositeOperation='destination-out';q.stroke();q.globalCompositeOperation='source-over';}return c2;};
    g.save();g.setTransform(1,0,0,1,0,0);
    for(const h of HOLES){const t=Math.min(t0,h.rin*0.75);const ring=shape(h.polys,0);{const q=ctx2(ring,true);q.globalCompositeOperation='source-in';q.fillStyle=oc;q.fillRect(0,0,W,H);}
      g.globalCompositeOperation='destination-out';g.drawImage(shape(h.polys,0),0,0);g.globalCompositeOperation='source-over';g.drawImage(ring,0,0);g.globalCompositeOperation='destination-out';g.drawImage(shape(h.polys,t),0,0);g.globalCompositeOperation='source-over';}
    g.restore();};
  /* letters that share a layer level are drawn together (their outlines fuse, the classic look); a raised letter / STACKED gets its own
     passes, composited over the ones below so its outline, border and counters cover them */
  const groups=[];if(T.stack)for(const l of order)groups.push([l]);else for(const l of order){const gl=groups[groups.length-1];if(gl&&gl[0].lz===l.lz)gl.push(l);else groups.push([l]);}
  if(groups.length<=1){if(T.outlineOnly)olPasses(order);else passes(order);cutCounters(order);}
  else{const GC=cv(W,H,true),MC=T.outlineOnly?cv(W,H,true):null,mg=MC&&ctx2(MC,true);
    for(const grp of groups){g=ctx2(GC,true);g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.clearRect(0,0,W,H);
      if(T.outlineOnly)olPasses(grp,mg);else passes(grp);cutCounters(grp);g.setTransform(1,0,0,1,0,0);
      if(MC){g0.globalCompositeOperation='destination-out';g0.drawImage(MC,0,0);g0.globalCompositeOperation='source-over';}g0.drawImage(GC,0,0);}
    g=g0;}
  if(T.distress>0){const r2=rng(T.seed+99);g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-out';const N=Math.round(T.distress*W*H/900);for(let i=0;i<N;i++){g.globalAlpha=0.4+r2()*0.6;const x=r2()*W,y=r2()*H,s=0.6+r2()*2.2;g.fillRect(x,y,s,s);}
    g.lineWidth=0.8;for(let i=0;i<T.distress*3;i++){g.globalAlpha=0.6;g.beginPath();let x=r2()*W,y=r2()*H;g.moveTo(x,y);for(let k=0;k<5;k++){x+=(r2()-0.5)*20;y+=(r2()-0.3)*8;g.lineTo(x,y);}g.stroke();}g.globalAlpha=1;g.globalCompositeOperation='source-over';}
  g.setTransform(1,0,0,1,0,0);return out;}
function randomizeText(T,W,H){const r=Math.random;const ks=Object.keys(STYLES);T.style=ks[(r()*ks.length)|0];const pk=Object.keys(PALS);const P=PALS[pk[(r()*pk.length)|0]];
  T.fill=P[0];T.fill2=P[1];T.outlineC=P[2];T.borderC=P[3];T.depthC=P[4];T.grad=r()<0.75;T.curve=Math.round((r()-0.5)*H*0.35);T.slant=(r()-0.5)*0.3;T.overlap=Math.round(r()*T.size*0.15);T.spacing=0;
  T.depth=Math.round(r()*H*0.07);T.depthA=r()<0.5?0.8:2.3;T.shadow=Math.round(r()*H*0.04);T.border=Math.round(r()*H*0.035);T.outline=Math.round(H*0.02+r()*H*0.03);T.highlight=r()<0.7;T.drips=r()<0.4?Math.round(r()*8):0;T.stack=r()<0.35;T.seed=(r()*1e6)|0;
  syncLetters(T);for(const l of T.letters){l.dx=(r()-0.5)*T.size*0.12;l.dy=(r()-0.5)*T.size*0.3;l.rot=(r()-0.5)*0.6;l.sx=0.85+r()*0.4;l.sy=0.85+r()*0.45;l.sk=(r()-0.5)*0.4;l.c1='';l.c2='';}
  fitText(T,W,H);}
function fitText(T,W,H){/* shrink so the word fits the canvas */for(let k=0;k<30;k++){const b=layoutText(T,W,H).boxes;if(!b.length)return;let x0=1e9,x1=-1e9;for(const q of b){x0=Math.min(x0,q.x-q.r);x1=Math.max(x1,q.x+q.r);}if(x1-x0<W*0.94)return;T.size=Math.max(8,Math.round(T.size*0.9));T.outline=Math.max(0,Math.round(T.outline*0.92));T.border=Math.max(0,Math.round(T.border*0.92));}}

/* ---------------- stickers / decorations ---------------- */
const STICKERS={
  star:g=>{g.beginPath();for(let k=0;k<10;k++){const a=k/10*TAU-Math.PI/2,r=k%2?20:48;g.lineTo(Math.cos(a)*r,Math.sin(a)*r);}g.closePath();},
  crown:g=>{g.beginPath();g.moveTo(-46,30);g.lineTo(-46,-26);g.lineTo(-24,4);g.lineTo(0,-36);g.lineTo(24,4);g.lineTo(46,-26);g.lineTo(46,30);g.closePath();},
  arrow:g=>{g.beginPath();g.moveTo(-48,-12);g.lineTo(10,-12);g.lineTo(10,-34);g.lineTo(48,0);g.lineTo(10,34);g.lineTo(10,12);g.lineTo(-48,12);g.closePath();},
  bubble:g=>{g.beginPath();g.ellipse(0,-8,48,32,0,0,TAU);g.moveTo(-16,18);g.lineTo(-30,44);g.lineTo(4,22);g.closePath();},
  heart:g=>{g.beginPath();g.moveTo(0,40);g.bezierCurveTo(-60,0,-36,-52,0,-18);g.bezierCurveTo(36,-52,60,0,0,40);g.closePath();},
  bolt:g=>{g.beginPath();g.moveTo(10,-48);g.lineTo(-30,6);g.lineTo(-4,6);g.lineTo(-14,48);g.lineTo(30,-8);g.lineTo(4,-8);g.closePath();},
  burst:g=>{g.beginPath();for(let k=0;k<24;k++){const a=k/24*TAU,r=k%2?28:48;g.lineTo(Math.cos(a)*r,Math.sin(a)*r);}g.closePath();},
  sparkle:g=>{g.beginPath();g.moveTo(0,-48);g.quadraticCurveTo(6,-6,48,0);g.quadraticCurveTo(6,6,0,48);g.quadraticCurveTo(-6,6,-48,0);g.quadraticCurveTo(-6,-6,0,-48);g.closePath();},
  skull:g=>{g.beginPath();g.arc(0,-8,38,Math.PI*0.85,Math.PI*0.15);g.lineTo(22,40);g.lineTo(-22,40);g.closePath();g.moveTo(-14,-6);g.arc(-14,-6,10,0,TAU,true);g.moveTo(24,-6);g.arc(14,-6,10,0,TAU,true);g.moveTo(0,10);g.lineTo(-6,22);g.lineTo(6,22);g.closePath();},
  splat:g=>{const r=rng(77);g.beginPath();for(let k=0;k<18;k++){const a=k/18*TAU,rr=k%2?22+r()*8:34+r()*16;g.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}g.closePath();for(let k=0;k<6;k++){const a=r()*TAU,d=44+r()*8;g.moveTo(Math.cos(a)*d+5,Math.sin(a)*d);g.arc(Math.cos(a)*d,Math.sin(a)*d,3+r()*4,0,TAU);}},
  flame:g=>{g.beginPath();g.moveTo(0,48);g.bezierCurveTo(-44,40,-40,0,-14,-24);g.bezierCurveTo(-14,-6,-4,-2,0,-48);g.bezierCurveTo(18,-20,40,0,34,22);g.bezierCurveTo(30,40,14,48,0,48);g.closePath();},
  halo:g=>{g.beginPath();g.ellipse(0,0,48,18,0,0,TAU);g.ellipse(0,0,34,10,0,0,TAU,true);},
  drop:g=>{g.beginPath();g.moveTo(0,-48);g.bezierCurveTo(10,-20,34,6,34,20);g.arc(0,20,34,0,Math.PI);g.bezierCurveTo(-34,6,-10,-20,0,-48);g.closePath();},
  cloud:g=>{g.beginPath();g.arc(-24,8,20,Math.PI*0.5,Math.PI*1.5);g.arc(-4,-14,24,Math.PI,Math.PI*1.9);g.arc(24,-2,20,Math.PI*1.3,Math.PI*0.4);g.lineTo(-24,28);g.closePath();},
  eye:g=>{g.beginPath();g.moveTo(-48,0);g.quadraticCurveTo(0,-44,48,0);g.quadraticCurveTo(0,44,-48,0);g.closePath();g.moveTo(16,0);g.arc(0,0,16,0,TAU,true);},
  can:g=>{g.beginPath();g.rect(-18,-24,36,64);g.moveTo(-12,-24);g.lineTo(-8,-38);g.lineTo(8,-38);g.lineTo(12,-24);g.closePath();g.rect(-4,-46,8,8);}};
function drawSticker(g,kind,x,y,size,rot,col,fx,fy,outline){const f=STICKERS[kind];if(!f)return;g.save();g.translate(x,y);g.rotate(rot||0);g.scale((fx?-1:1)*size/100,(fy?-1:1)*size/100);f(g);g.lineJoin='round';
  if(outline){g.lineWidth=12;g.strokeStyle='#14101a';g.stroke();}g.fillStyle=col;g.fill('evenodd');
  g.save();g.clip('evenodd');g.fillStyle='rgba(255,255,255,0.35)';g.fillRect(-60,-60,120,34);g.restore();
  if(outline){g.lineWidth=4;g.strokeStyle='rgba(255,255,255,0.8)';g.save();g.translate(-3,-3);f(g);g.restore();}g.restore();}

/* =====================================================================
   EDITOR
   ===================================================================== */
const CSS=`
#grafUI{position:fixed;inset:0;z-index:10050;display:none;flex-direction:column;background:#140a1e;color:#fff;font-family:'Silkscreen','Courier New',monospace;touch-action:none;-webkit-user-select:none;user-select:none;
 background-image:radial-gradient(circle at 20% 10%,#ff3d9a33 0,transparent 40%),radial-gradient(circle at 90% 80%,#4fc3f733 0,transparent 45%),radial-gradient(#ffffff10 1px,transparent 1.5px);background-size:auto,auto,7px 7px}
#grafUI *{box-sizing:border-box}
#grafUI .gf-gh{display:flex;align-items:center;gap:6px;padding:calc(env(safe-area-inset-top,0px) + 6px) 8px 6px;background:linear-gradient(90deg,#ff3d9a,#ffc23d 55%,#b6ff3a);border-bottom:3px solid #000;box-shadow:0 3px 0 #0006}
#grafUI .gf-gt{flex:1;font-family:'Rubik Wet Paint',Impact,'Arial Black',sans-serif;font-size:21px;color:#fff;text-shadow:2px 2px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#grafUI button{font-family:inherit;font-size:10px;color:#fff;background:#2a1440;border:2px solid #000;border-radius:3px;box-shadow:2px 2px 0 #000,inset 0 0 0 1px #ffffff30;padding:7px 8px;min-height:36px;cursor:pointer;touch-action:manipulation;text-transform:uppercase;line-height:1.1}
#grafUI button:active{transform:translate(1px,1px);box-shadow:1px 1px 0 #000}
#grafUI button.gf-on{background:#ff3d9a;color:#fff;box-shadow:2px 2px 0 #000,inset 0 0 0 2px #ffd23d}
#grafUI button.gf-y{background:#ffd23d;color:#14101a}
#grafUI button.gf-g{background:#5ad04a;color:#0c1408}
#grafUI button.gf-c{background:#3ab8ff;color:#06121e}
#grafUI button.gf-r{background:#e8323a}
#grafUI button.gf-k{background:#14101a}
#grafUI button:disabled{opacity:.35}
#grafUI .gf-x{background:#14101a;font-size:14px;min-width:38px}
#grafUI .gf-tabs{display:flex;gap:3px;padding:5px 6px 0;background:#0c0612}
#grafUI .gf-tabs button{flex:1;transform:skewX(-8deg);font-size:10px;padding:6px 2px;border-bottom:none;border-radius:4px 4px 0 0}
#grafUI .gf-stage{position:relative;flex:1 1 40%;min-height:150px;background:#0c0612;border-top:3px solid #000;border-bottom:3px solid #000;overflow:hidden}
#grafUI .gf-stage>canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}
#grafUI .gf-zoom{position:absolute;right:6px;top:6px;display:flex;flex-direction:column;gap:4px}
#grafUI .gf-zoom button{min-height:30px;min-width:34px;padding:2px;font-size:13px}
#grafUI .gf-hist{position:absolute;left:6px;top:6px;display:flex;gap:4px}
#grafUI .gf-hist button{min-height:30px;padding:3px 8px}
#grafUI .gf-prev{position:absolute;left:6px;bottom:6px;border:2px solid #000;box-shadow:2px 2px 0 #000;background:#000;line-height:0}
#grafUI .gf-prev span{position:absolute;left:2px;top:2px;font-size:8px;line-height:1;color:#ffd23d;text-shadow:1px 1px 0 #000}
#grafUI .gf-panel{flex:0 1 auto;max-height:46%;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;padding:6px 8px calc(env(safe-area-inset-bottom,0px) + 10px);background:#1c0f2a;-webkit-overflow-scrolling:touch}
#grafUI .gf-row{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0;align-items:center}
#grafUI .gf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:5px;margin:4px 0}
#grafUI .gf-lbl{font-size:9px;color:#ffd23d;text-shadow:1px 1px 0 #000;margin:7px 0 2px;letter-spacing:.06em}
#grafUI .gf-sl{display:flex;align-items:center;gap:6px;font-size:9px;margin:3px 0}
#grafUI .gf-sl span{width:74px;flex:none;color:#e8dcff}
#grafUI .gf-sl b{width:34px;flex:none;text-align:right;color:#b6ff3a;font-weight:400}
#grafUI input[type=range]{flex:1;min-width:60px;height:26px;accent-color:#ff3d9a;touch-action:pan-x}
#grafUI input[type=text]{font-family:inherit;font-size:14px;background:#fff;color:#14101a;border:2px solid #000;box-shadow:2px 2px 0 #000;padding:7px;border-radius:3px;-webkit-user-select:text;user-select:text;min-width:0;flex:1}
#grafUI .gf-sw{width:30px;height:30px;min-height:30px;padding:0;border-radius:50%;border:2px solid #000;box-shadow:1px 1px 0 #000}
#grafUI .gf-sw.gf-on{outline:3px solid #fff;outline-offset:1px}
#grafUI .gf-cc{display:flex;gap:6px;align-items:center}
#grafUI .gf-cc .gf-big{width:38px;height:38px;border:3px solid #000;border-radius:6px;box-shadow:2px 2px 0 #000;position:relative}
#grafUI input[type=color]{width:44px;height:36px;border:2px solid #000;padding:0;background:#fff;border-radius:3px}
#grafUI .gf-lay{display:flex;align-items:center;gap:5px;padding:4px;margin:3px 0;background:#2a1440;border:2px solid #000;border-radius:4px}
#grafUI .gf-lay.gf-on{background:#4a1a6a;outline:2px solid #ffd23d}
#grafUI .gf-lay canvas{width:64px;height:32px;background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/8px 8px;border:1px solid #000;flex:none}
#grafUI .gf-lay .gf-nm{flex:1;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#grafUI .gf-book{flex:1;overflow-y:auto;touch-action:pan-y;padding:8px 10px calc(env(safe-area-inset-bottom,0px) + 16px)}
#grafUI .gf-card{background:#2a1440;border:3px solid #000;box-shadow:3px 3px 0 #000;border-radius:5px;padding:6px;display:flex;flex-direction:column;gap:5px}
#grafUI .gf-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px}
#grafUI .gf-thumb{height:70px;border:2px solid #000;background:#b5654a;background-image:linear-gradient(#0000 90%,#7a3e2c 90%),linear-gradient(90deg,#0000 94%,#7a3e2c 94%);background-size:24px 10px,24px 10px;display:flex;align-items:center;justify-content:center;overflow:hidden}
#grafUI .gf-thumb img{max-width:92%;max-height:90%;image-rendering:auto}
#grafUI .gf-badge{display:inline-block;font-size:8px;padding:2px 5px;background:#ffd23d;color:#14101a;border:1px solid #000;transform:skewX(-8deg)}
#grafUI .gf-nm2{font-size:11px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#grafUI .gf-h2{font-family:'Rubik Wet Paint',Impact,'Arial Black',sans-serif;font-size:19px;margin:12px 0 5px;color:#ffd23d;text-shadow:2px 2px 0 #000}
#grafUI .gf-note{font-size:9px;color:#cbb8e8;line-height:1.5}
#grafUI .gf-modal{position:absolute;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:5;padding:16px}
#grafUI .gf-modal .gf-box{background:#2a1440;border:3px solid #000;box-shadow:4px 4px 0 #ff3d9a;padding:12px;max-width:380px;width:100%;max-height:80%;overflow-y:auto;touch-action:pan-y}
#grafUI .gf-modal p{font-size:11px;line-height:1.5;margin:0 0 8px}
@media (orientation:landscape) and (max-height:560px){
 #grafUI .gf-ebody{flex-direction:row!important}
 #grafUI .gf-stage{flex:1 1 58%;border-right:3px solid #000;border-bottom:none}
 #grafUI .gf-panel{max-height:none;flex:0 0 42%;}
 #grafUI .gf-gh{padding-top:4px;padding-bottom:4px}
 #grafUI .gf-gt{font-size:17px}
}
#grafUI .gf-nav{position:sticky;top:-6px;z-index:3;display:flex;flex-wrap:wrap;gap:5px;margin:-6px -8px 4px;padding:6px 8px 5px;background:#1c0f2a;border-bottom:2px solid #000}
#grafUI .gf-nav button{flex:1 1 auto}
#grafUI .gf-tools{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:4px 0}
#grafUI .gf-tools button{padding:6px 1px;font-size:11px;min-height:38px}
#grafUI .gf-keys{display:grid;grid-template-columns:repeat(10,1fr);gap:3px;margin:4px 0}
#grafUI .gf-keys button{padding:0;min-height:34px;font-size:13px;font-family:'Silkscreen','Noto Sans JP','Hiragino Sans',sans-serif;text-transform:none}
#grafUI .gf-word{display:flex;flex-wrap:wrap;gap:3px;align-items:center;min-height:44px;padding:4px;background:#0c0612;border:2px solid #000;border-radius:3px}
#grafUI .gf-word button{min-width:28px;min-height:34px;padding:2px 4px;font-size:15px;text-transform:none;font-family:'Silkscreen','Noto Sans JP',sans-serif}
#grafUI .gf-word .gf-caret{width:3px;min-width:3px;height:30px;background:#ffd23d;box-shadow:0 0 6px #ffd23d;animation:gfblink 1s steps(2) infinite}
@keyframes gfblink{50%{opacity:0}}
#grafUI .gf-scope{display:flex;flex-wrap:wrap;gap:3px;align-items:center;margin:4px 0}
#grafUI .gf-scope button{min-width:30px;padding:4px 5px;font-size:13px;text-transform:none}
#grafUI .gf-scope .gf-all{font-size:11px;min-width:46px}
#grafUI .gf-sizes{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0}
#grafUI .gf-sizes button{display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 3px;min-height:96px}
#grafUI .gf-sizes i{display:block;background:#b5654a;border:2px solid #000}
#grafUI .gf-fb{position:absolute;right:6px;bottom:6px;display:flex;gap:3px}
#grafUI .gf-fb button{min-height:30px;padding:3px 7px}
#grafUI .gf-zoom button.gf-on{background:#ff3d9a}
#grafUI .gf-hint{font-size:9px;color:#b6ff3a;margin:3px 0;line-height:1.4}
#grafBtn{pointer-events:auto;font-family:'Silkscreen',monospace;font-size:9px;background:linear-gradient(135deg,#ff3d9a,#ffc23d);color:#14101a;border:2px solid #000;box-shadow:2px 2px 0 #000;padding:4px 7px;display:none;align-items:center;gap:4px;margin-top:2px}
.grafpick{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:7px;margin:8px 0}
.grafpick button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:5px!important;min-height:0!important}
.grafpick .th{width:100%;height:52px;background:#b5654a;border:2px solid #000;display:flex;align-items:center;justify-content:center}
.grafpick img{max-width:94%;max-height:90%}
.grafpick small{font-size:9px;line-height:1.2}
`;
let UI=null;
function el(tag,attrs,kids){const e=document.createElement(tag);if(attrs)for(const k in attrs){const v=attrs[k];if(k==='style')e.style.cssText=v;else if(k==='cls')e.className=String(v).split(' ').filter(Boolean).map(t=>'gf-'+t).join(' ');else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='html')e.innerHTML=v;else if(k==='text')e.textContent=v;else e.setAttribute(k,v);}
  if(kids)for(const c of[].concat(kids)){if(c==null||c===false)continue;e.appendChild(typeof c==='string'?document.createTextNode(c):c);}return e;}
function btn(label,fn,cls,title){return el('button',{cls:cls||'',type:'button',onclick:e=>{e.preventDefault();fn(e);},title:title||label},label);}
function ensureUI(){if(UI)return UI;const st=el('style',{text:CSS});document.head.appendChild(st);const root=el('div',{id:'grafUI'});document.body.appendChild(root);
  for(const ev of['keydown','keyup','keypress'])root.addEventListener(ev,e=>e.stopPropagation());root.addEventListener('keydown',e=>{try{edKey(e);}catch(err){console.warn(err);}});
  for(const ev of['pointerdown','touchstart','mousedown','click','wheel'])root.addEventListener(ev,e=>e.stopPropagation());
  UI={root,view:null,prevState:null};return UI;}
function showRoot(){const u=ensureUI();if(u.root.style.display!=='flex'){u.root.style.display='flex';const s=LV.state;if(s==='play'){u.prevState=s;LV.state='graf';}else u.prevState=null;}}
function hideRoot(){if(!UI)return;UI.root.style.display='none';UI.root.innerHTML='';if(UI.prevState&&LV.state==='graf')LV.state=UI.prevState;UI.prevState=null;stopLoop();}
function modal(html,buttons){const u=ensureUI();const m=el('div',{cls:'modal'});const box=el('div',{cls:'box'});box.appendChild(el('div',{html}));const row=el('div',{cls:'row'});
  for(const[b,fn,cls]of buttons)row.appendChild(btn(b,()=>{m.remove();fn&&fn();},cls));box.appendChild(row);m.appendChild(box);u.root.appendChild(m);return m;}

/* ---------------- editor state ---------------- */
let ED=null;
function newLayer(type,name){const l={id:uid(),name:name||(type==='text'?'TEXT':'PAINT'),type,vis:true,op:1};if(type==='paint')l.c=cv(ED.W,ED.H);else{l.text=newText(charName(curChar()),ED.W,ED.H);fitText(l.text,ED.W,ED.H);l.c=null;l._dirty=true;}return l;}
function layerCanvas(l){if(l.type==='text'){if(l._dirty||!l._tc){const fast=!!(ED&&(ED.drag&&ED.drag.moved||ED._sliding));FASTR=fast;try{l._tc=renderText(l.text,ED.W,ED.H,l._tc);}finally{FASTR=false;}l._dirty=false;l._fast=fast;}return l._tc;}return l.c;}
function fullQuality(){if(!ED)return;for(const l of ED.layers)if(l.type==='text'&&l._fast)l._dirty=true;render();}
function curLayer(){return ED.layers[ED.cur];}
function flatten(scaleW,scaleH){const c=cv(scaleW||ED.W,scaleH||ED.H,true),g=ctx2(c,true);for(const l of ED.layers){if(!l.vis)continue;g.globalAlpha=l.op;g.drawImage(layerCanvas(l),0,0,c.width,c.height);}g.globalAlpha=1;return c;}

function openEditor(opts){opts=opts||{};if(ED&&ED._ro)window.removeEventListener('resize',ED._ro);if(ED&&ED._rso)ED._rso.disconnect();const size=SIZES[opts.size]?opts.size:'small';const Z=SIZES[size];ensureUI();showRoot();
  ED={size,W:Z.W,H:Z.H,layers:[],cur:0,id:null,name:'',owner:curChar(),tab:'text',tool:'spray',ptool:'spray',col:'#ff3d9a',col2:'#ffd23d',which:0,bsize:Math.round(Z.H*0.08),opac:1,dens:1,sym:'off',autoDrip:true,fillGrad:false,
    stk:'star',stkRot:0,stkFx:false,stkFy:false,stkOut:true,stkSize:Math.round(Z.H*0.35),ctarget:'fill',selLetter:-1,selSet:[],multi:false,
    zoom:1,ox:0,oy:0,hist:[],fut:[],pending:null,drips:[],dirty:false,savedId:null,onDone:opts.onDone||null,title:opts.title||'',fromBook:!!opts.fromBook,assign:true,recent:[],
    /* JSR workflow */lockSize:!!opts.lockSize,wtool:'po',wmode:'all',cursor:0,kb:'abc',esize:Math.round(Z.H*0.06),zl:0,handOn:false,lockAR:false,fcol:'#ffd23d',ftarget:'fill'};
  const fin=()=>{buildEditor();fitView();render();startLoop();};
  if(opts.designId&&designMeta(opts.designId)){ED.layers=[];ED.tab='layers';buildEditor();loadProject(opts.designId).then(ok=>{if(!ED)return;if(!ok){toastIn('Could not load that design.');ED.layers=[newLayer('paint','BACK PAINT'),newLayer('text','LETTERS'),newLayer('paint','FRONT PAINT')];ED.cur=1;}
    ED.tab=ED.layers.some(l=>l.type==='text')?'warp':'paint';const tl=ED.layers.find(l=>l.type==='text');ED.cursor=tl?[...tl.text.str].length:0;ED.hist=[];ED.fut=[];ED.dirty=false;buildEditor();fin();});return;}
  ED.layers=[newLayer('paint','BACK PAINT'),newLayer('text','LETTERS'),newLayer('paint','FRONT PAINT')];ED.cur=1;ED.name=charName(ED.owner)+' '+Z.label;ED.tab=opts.tab||'size';ED.cursor=[...ED.layers[1].text.str].length;fin();}
function loadProject(id){const P=lsGet(K.d+id,null);const m=designMeta(id);if(!P||!m)return Promise.resolve(false);const Z=SIZES[P.size]||SIZES.small;
  ED.size=P.size in SIZES?P.size:'small';ED.W=Z.W;ED.H=Z.H;ED.id=id;ED.savedId=id;ED.name=P.name||m.name;ED.owner=P.owner||m.owner||curChar();ED.layers=[];
  const jobs=[];for(const L of(P.layers||[])){const l={id:L.id||uid(),name:L.name||'LAYER',type:L.type==='text'?'text':'paint',vis:L.vis!==false,op:L.op==null?1:L.op};
    if(l.type==='text'){l.text=Object.assign(newText('',ED.W,ED.H),L.text||{});syncLetters(l.text);l._dirty=true;}else{l.c=cv(ED.W,ED.H);if(L.img)jobs.push(new Promise(res=>{const im=new Image();im.onload=()=>{l.c.getContext('2d').drawImage(im,0,0,ED.W,ED.H);res();};im.onerror=res;im.src=L.img;}));}
    ED.layers.push(l);}
  if(!ED.layers.length)ED.layers.push(newLayer('paint'));ED.cur=ED.layers.length-1;return Promise.all(jobs).then(()=>true);}

/* ---------------- history ---------------- */
function snapFull(){return{cur:ED.cur,layers:ED.layers.map(l=>({id:l.id,name:l.name,type:l.type,vis:l.vis,op:l.op,text:l.type==='text'?JSON.stringify(l.text):null,img:l.type==='paint'?l.c.getContext('2d').getImageData(0,0,ED.W,ED.H):null}))};}
function applyFull(s){ED.layers=s.layers.map(o=>{const l={id:o.id,name:o.name,type:o.type,vis:o.vis,op:o.op};if(o.type==='text'){l.text=JSON.parse(o.text);l._dirty=true;}else{l.c=cv(ED.W,ED.H);l.c.getContext('2d').putImageData(o.img,0,0);}return l;});ED.cur=clamp(s.cur,0,ED.layers.length-1);}
function histPush(e){ED.hist.push(e);ED.fut.length=0;let mem=0;for(const h of ED.hist)mem+=h.t==='full'?ED.W*ED.H*4*ED.layers.length*2:h.t==='px'?ED.W*ED.H*8:2000;while(ED.hist.length>1&&(ED.hist.length>30||mem>60e6)){const x=ED.hist.shift();mem-=x.t==='full'?ED.W*ED.H*8*ED.layers.length:ED.W*ED.H*8;}ED.dirty=true;updHist();}
function beginPx(l){commitPending();const e={t:'px',lid:l.id,before:l.c.getContext('2d').getImageData(0,0,ED.W,ED.H),after:null};ED.pending=e;histPush(e);}
function commitPending(){const e=ED.pending;if(!e)return;ED.pending=null;const l=ED.layers.find(q=>q.id===e.lid);if(l&&l.c)e.after=l.c.getContext('2d').getImageData(0,0,ED.W,ED.H);}
function fullBefore(){commitPending();ED.drips.length=0;return snapFull();}
function fullCommit(before){histPush({t:'full',before,after:snapFull()});}
function textBefore(l){return{lid:l.id,s:JSON.stringify(l.text)};}
function textCommit(b){const l=ED.layers.find(q=>q.id===b.lid);if(!l)return;const a=JSON.stringify(l.text);if(a===b.s)return;commitPending();histPush({t:'text',lid:b.lid,before:b.s,after:a});}
function undo(){commitPending();ED.drips.length=0;const e=ED.hist.pop();if(!e)return;applyHist(e,'before');ED.fut.push(e);updHist();refreshPanel();render();}
function redo(){commitPending();const e=ED.fut.pop();if(!e)return;applyHist(e,'after');ED.hist.push(e);updHist();refreshPanel();render();}
function applyHist(e,k){ED.dirty=true;if(e.t==='full'){applyFull(e[k]);return;}const l=ED.layers.find(q=>q.id===e.lid);if(!l)return;if(e.t==='px'){if(e[k])l.c.getContext('2d').putImageData(e[k],0,0);}else{l.text=JSON.parse(e[k]);l._dirty=true;}}
function updHist(){if(!ED||!ED.ui)return;ED.ui.undo.disabled=!ED.hist.length;ED.ui.redo.disabled=!ED.fut.length;}

/* ---------------- build editor DOM ---------------- */
function buildEditor(){const u=ensureUI();u.root.innerHTML='';u.view='editor';const Z=SIZES[ED.size];
  const head=el('div',{cls:'gh'},[btn('✕',()=>closeEditor(false),'x','Close'),el('div',{cls:'gt',text:ED.title||'GRAFFITI LAB'}),el('span',{cls:'badge',text:Z.label+' '+Z.W+'×'+Z.H})]);
  const tabs=el('div',{cls:'tabs'});const TABS=[['size','SIZE'],['text','TEXT'],['warp','WARP'],['paint','PAINT'],['layers','LAYERS'],['save','SAVE']];const tb={};
  for(const[k,l]of TABS){tb[k]=btn(l,()=>setTab(k));tabs.appendChild(tb[k]);}
  const stage=el('div',{cls:'stage'});const can=el('canvas');stage.appendChild(can);
  const undoB=btn('↶ UNDO',undo,'k'),redoB=btn('REDO ↷',redo,'k');stage.appendChild(el('div',{cls:'hist'},[undoB,redoB]));
  const zb=[0,1,2].map(i=>btn(['1×','2×','4×'][i],()=>zoomLevel(i),'k','Zoom level '+(i+1)));const handB=btn('✋',()=>{ED.handOn=!ED.handOn;handB.classList.toggle('gf-on',ED.handOn);},'k','Pan (drag to move a zoomed canvas)');
  stage.appendChild(el('div',{cls:'zoom'},zb.concat([handB])));const fbw=el('div',{cls:'fb'});stage.appendChild(fbw);
  const pv=cv(132,66);const pvw=el('div',{cls:'prev'},[pv,el('span',{text:'ON THE WALL'})]);stage.appendChild(pvw);
  const panel=el('div',{cls:'panel'});
  const body=el('div',{cls:'ebody',style:'flex:1;display:flex;flex-direction:column;min-height:0'},[stage,panel]);
  u.root.appendChild(head);u.root.appendChild(tabs);u.root.appendChild(body);
  ED.ui={can,stage,panel,tb,undo:undoB,redo:redoB,pv,zb,handB,fbw,title:head.querySelector('.gf-gt'),badge:head.querySelector('.gf-badge')};u.root.tabIndex=-1;u.root.style.outline='none';try{u.root.focus({preventScroll:true});}catch(e){}
  bindCanvas(can);updHist();setTab(ED.tab);
  if(!ED._ro){ED._ro=()=>{if(ED&&ED.ui){fitCanvas();render();}};window.addEventListener('resize',ED._ro);}
  if(ED._rso)ED._rso.disconnect();if(window.ResizeObserver){ED._rso=new ResizeObserver(()=>{if(ED&&ED.ui&&ED.ui.stage===stage){fitCanvas();draw();}});ED._rso.observe(stage);}
  fitCanvas();}
function fitCanvas(){const c=ED.ui.can,r=ED.ui.stage.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(10,Math.round(r.width*dpr)),h=Math.max(10,Math.round(r.height*dpr));if(c.width!==w||c.height!==h){
  /* keep the zoom and the point under the view center when the stage changes size (panel height differs per screen) */const first=!ED._fitted,u=(c.width/2-ED.ox)/ED.zoom,v=(c.height/2-ED.oy)/ED.zoom;c.width=w;c.height=h;ED.dpr=dpr;ED._fitted=true;if(first||ED.zl===0)fitView();else{ED.ox=w/2-u*ED.zoom;ED.oy=h/2-v*ED.zoom;clampPan();}}}
function fitZoom(){const c=ED.ui.can;return Math.min(c.width/ED.W,c.height/ED.H)*0.92;}
function fitView(){if(!ED||!ED.ui)return;const c=ED.ui.can;const z=fitZoom();ED.zoom=z;ED.ox=(c.width-ED.W*z)/2;ED.oy=(c.height-ED.H*z)/2;ED.zl=0;updZoom();}
/* classic editor: three fixed zoom levels (pinch / wheel give anything in between). Only the view changes, never the design size. */
function zoomLevel(i){if(!ED||!ED.ui)return;if(i===0){fitView();render();return;}const c=ED.ui.can;const z=fitZoom()*[1,2,4][i];const cx=c.width/2,cy=c.height/2;const u=(cx-ED.ox)/ED.zoom,v=(cy-ED.oy)/ED.zoom;ED.zoom=z;ED.ox=cx-u*z;ED.oy=cy-v*z;clampPan();ED.zl=i;updZoom();render();}
function updZoom(){if(!ED||!ED.ui||!ED.ui.zb)return;ED.ui.zb.forEach((b,i)=>b.classList.toggle('gf-on',ED.zl===i));}
function clampPan(){const c=ED.ui.can,w=ED.W*ED.zoom,h=ED.H*ED.zoom,m=40;ED.ox=w<c.width?clamp(ED.ox,-w+m,c.width-m):clamp(ED.ox,c.width-w-m,m);ED.oy=h<c.height?clamp(ED.oy,-h+m,c.height-m):clamp(ED.oy,c.height-h-m,m);}
function zoomBy(k,cx,cy){const c=ED.ui.can;if(cx==null){cx=c.width/2;cy=c.height/2;}const z0=ED.zoom,z=clamp(z0*k,0.2,16);const u=(cx-ED.ox)/z0,v=(cy-ED.oy)/z0;ED.zoom=z;ED.ox=cx-u*z;ED.oy=cy-v*z;clampPan();ED.zl=-1;updZoom();render();}
function textIdx(){const l=curLayer();if(l&&l.type==='text')return ED.cur;return ED.layers.findIndex(q=>q.type==='text');}
function selectText(){const i=textIdx();if(i>=0)ED.cur=i;}
/* F/B: the paint layer just behind or just in front of the lettering (created if missing) */
function fbIndex(which,create){const ti=textIdx();if(ti<0){for(let j=ED.layers.length-1;j>=0;j--)if(ED.layers[j].type==='paint')return j;return -1;}
  if(which==='front'){for(let j=ti+1;j<ED.layers.length;j++)if(ED.layers[j].type==='paint')return j;}else{for(let j=ti-1;j>=0;j--)if(ED.layers[j].type==='paint')return j;}
  if(!create||ED.layers.length>=MAX_LAYERS)return -1;const b=fullBefore();const at=which==='front'?ti+1:ti;ED.layers.splice(at,0,newLayer('paint',which==='front'?'FRONT PAINT':'BACK PAINT'));fullCommit(b);return at;}
function curFB(){const ti=ED.layers.findIndex(q=>q.type==='text');const l=curLayer();if(ti<0||!l||l.type!=='paint')return null;return ED.cur>ti?'front':'back';}
function setFB(which){commitPending();const i=fbIndex(which,true);if(i<0){toastIn('Max '+MAX_LAYERS+' layers');return;}ED.cur=i;ED.fb=which;updFB();refreshPanel();render();}
function updFB(){const w=ED.ui&&ED.ui.fbw;if(!w)return;w.innerHTML='';
  if(ED.tab==='text'||ED.tab==='warp'){if(curText())w.appendChild(btn(ED.multi?'MULTI ✔':'MULTI',()=>{ED.multi=!ED.multi;updFB();toastIn(ED.multi?'MULTI: tap letters on the canvas to add / remove them':'MULTI off: a tap selects one letter');},ED.multi?'on':'k','Multi-select: canvas taps add / remove letters'));return;}
  if(ED.tab!=='paint')return;const f=curFB();
  w.appendChild(btn('B · BEHIND',()=>setFB('back'),f==='back'?'on':'k','Paint behind the letters'));w.appendChild(btn('F · FRONT',()=>setFB('front'),f==='front'?'on':'k','Paint in front of the letters'));}
function setTab(k){commitPending();if(ED.tab==='text'&&k!=='text'){const tl=curText();if(tl)ED.selLetter=ED.wmode==='one'?ED.selLetter:-1;}ED.tab=k;for(const t in ED.ui.tb)ED.ui.tb[t].classList.toggle('gf-on',t===k);ED.drag=null;
  if(k==='text'){ED.tool='move';selectText();const tl=curText();if(tl){const n=[...tl.text.str].length;ED.cursor=clamp(ED.cursor,0,n);}}
  else if(k==='warp'){ED.tool='warp';selectText();const tl=curText();if(tl&&ED.wmode==='one'&&!(ED.selLetter>=0&&ED.selLetter<tl.text.letters.length)){ED.wmode='all';ED.selLetter=-1;}}
  else if(k==='paint'){ED.tool=ED.ptool;const l=curLayer();if(!l||l.type!=='paint'){const i=fbIndex(ED.fb||'front',true);if(i>=0)ED.cur=i;}}
  else if(k==='size'){ED.tool='none';}
  updFB();refreshPanel();render();}
function refreshPanel(){if(!ED||!ED.ui)return;if(ED._sliding){ED._sliding=false;fullQuality();}const p=ED.ui.panel;const sc=p.scrollTop;p.innerHTML='';const k=ED.tab;
  if(k==='size')panelSize(p);else if(k==='text')panelText(p);else if(k==='warp')panelWarp(p);else if(k==='paint')panelPaint(p);else if(k==='layers')panelLayers(p);else panelSave(p);p.scrollTop=sc;updFB();
  /* keep keyboard focus inside the editor when the focused button was rebuilt */const ae=document.activeElement;if(UI&&(!ae||ae===document.body||!UI.root.contains(ae)))try{UI.root.focus({preventScroll:true});}catch(e){}}
function lbl(t){return el('div',{cls:'lbl',text:t});}
function slider(label,min,max,step,get,set,commit,fmt){const v=get();const out=el('b',{text:fmt?fmt(v):String(Math.round(v*100)/100)});const r=el('input',{type:'range',min,max,step,value:v});let began=null;
  r.addEventListener('input',()=>{if(!began)began=commit?commit.begin():true;if(ED)ED._sliding=true;const x=parseFloat(r.value);set(x);out.textContent=fmt?fmt(x):String(Math.round(x*100)/100);render();});
  r.addEventListener('change',()=>{if(ED)ED._sliding=false;if(began&&commit)commit.end(began);began=null;fullQuality();});return el('div',{cls:'sl'},[el('span',{text:label}),r,out]);}
const SWATCHES=['#14101a','#ffffff','#8a8a9a','#ff3d9a','#e8323a','#ff7a1a','#ffc23d','#fff03a','#b6ff3a','#3ad06a','#1e7a2a','#3ab8ff','#4fc3f7','#2a4cff','#9a6aff','#c46bff','#ff9ad8','#8c1d40','#7a4a2a','#d8b48a','#00e5d0','#f4f0e8','#4a1a6a','#ffd23d'];
function colorRow(onPick,cur){const box=el('div');const row=el('div',{cls:'row'});const all=SWATCHES.concat(ED.recent.filter(c=>!SWATCHES.includes(c)));
  for(const c of all){const b=el('button',{cls:'sw'+(cur&&cur.toLowerCase()===c?' on':''),type:'button',style:'background:'+c,title:c,onclick:e=>{e.preventDefault();onPick(c);}});row.appendChild(b);}
  const ci=el('input',{type:'color',value:/^#[0-9a-f]{6}$/i.test(cur||'')?cur:'#ff3d9a',title:'Custom color'});ci.addEventListener('change',()=>{const c=ci.value.toLowerCase();if(!ED.recent.includes(c)){ED.recent.unshift(c);ED.recent.length=Math.min(ED.recent.length,8);}onPick(c);});
  row.appendChild(el('span',{cls:'note',text:'CUSTOM'}));row.appendChild(ci);box.appendChild(row);return box;}
function toastIn(s){const u=ensureUI();const t=el('div',{style:'position:absolute;left:50%;top:70px;transform:translateX(-50%);background:#14101a;border:2px solid #000;box-shadow:3px 3px 0 #ff3d9a;padding:8px 12px;font-size:11px;z-index:9;max-width:90%;text-align:center',text:s});u.root.appendChild(t);setTimeout(()=>t.remove(),2200);}

/* ---------------- TEXT panel ---------------- */
function curText(){const l=curLayer();return l&&l.type==='text'?l:null;}
function panelStyle(p){const l=curText();
  if(!l){p.appendChild(el('p',{cls:'note',text:'The selected layer is a paint layer. Add a text layer to write letters.'}));p.appendChild(el('div',{cls:'row'},[btn('+ ADD TEXT LAYER',()=>{if(ED.layers.length>=MAX_LAYERS){toastIn('Max '+MAX_LAYERS+' layers');return;}const b=fullBefore();ED.layers.splice(ED.cur+1,0,newLayer('text','LETTERS'));ED.cur++;fullCommit(b);refreshPanel();render();},'y')]));
    const ti=ED.layers.findIndex(q=>q.type==='text');if(ti>=0)p.appendChild(el('div',{cls:'row'},[btn('EDIT TEXT LAYER "'+ED.layers[ti].name+'"',()=>{ED.cur=ti;refreshPanel();render();},'c')]));return;}
  const T=l.text;const W=ED.W,H=ED.H;const TC={begin:()=>textBefore(l),end:b=>textCommit(b)};const ch=()=>{l._dirty=true;ED.dirty=true;};
  p.appendChild(el('div',{cls:'row'},[btn('🎲 RANDOM',()=>{const b=textBefore(l);randomizeText(T,W,H);ch();textCommit(b);refreshPanel();render();},'y'),btn('FIT',()=>{const b=textBefore(l);T.size=Math.round(H*0.6);fitText(T,W,H);ch();textCommit(b);refreshPanel();render();},'c')]));
  p.appendChild(lbl('LETTER STYLE'));const sr=el('div',{cls:'row'});for(const k in STYLES){sr.appendChild(btn(STYLES[k].label,()=>{const b=textBefore(l);T.style=k;fitText(T,W,H);ch();textCommit(b);refreshPanel();render();},T.style===k?'on':''));}p.appendChild(sr);
  p.appendChild(lbl('PRESETS'));const pr=el('div',{cls:'row'});for(const k in PALS){const P=PALS[k];pr.appendChild(el('button',{type:'button',style:`background:linear-gradient(135deg,${P[0]} 0 45%,${P[1]} 45% 75%,${P[2]} 75%);color:${P[2]};text-shadow:0 0 2px #fff`,onclick:()=>{const b=textBefore(l);T.fill=P[0];T.fill2=P[1];T.outlineC=P[2];T.borderC=P[3];T.depthC=P[4];for(const q of T.letters){q.c1='';q.c2='';}ch();textCommit(b);refreshPanel();render();}},k));}p.appendChild(pr);
  p.appendChild(lbl('LAYOUT'));
  p.appendChild(slider('SIZE',8,Math.round(H*0.9),1,()=>T.size,v=>{T.size=v;ch();},TC));
  p.appendChild(slider('SPACING',-20,Math.round(W*0.12),1,()=>T.spacing,v=>{T.spacing=v;ch();},TC));
  p.appendChild(slider('OVERLAP',0,Math.round(T.size*0.6)+10,1,()=>T.overlap,v=>{T.overlap=v;ch();},TC));
  p.appendChild(slider('CURVE',-Math.round(H*0.4),Math.round(H*0.4),1,()=>T.curve,v=>{T.curve=v;ch();},TC));
  p.appendChild(slider('SLANT',-0.8,0.8,0.02,()=>T.slant,v=>{T.slant=v;ch();},TC));
  p.appendChild(el('div',{cls:'row'},[btn(T.stack?'STACKED ✔':'STACKED',()=>{const b=textBefore(l);T.stack=!T.stack;ch();textCommit(b);refreshPanel();render();},T.stack?'on':''),btn('⇆ FLIP',()=>{const b=textBefore(l);T.flipX=!T.flipX;ch();textCommit(b);render();}),btn('⇅ FLIP',()=>{const b=textBefore(l);T.flipY=!T.flipY;ch();textCommit(b);render();}),btn('CENTER',()=>{const b=textBefore(l);T.x=W/2;T.y=H/2;ch();textCommit(b);render();})]));
  p.appendChild(lbl('EFFECTS'));
  p.appendChild(slider('OUTLINE',0,Math.round(H*0.12),1,()=>T.outline,v=>{T.outline=v;ch();},TC));
  p.appendChild(slider('2ND BORDER',0,Math.round(H*0.1),1,()=>T.border,v=>{T.border=v;ch();},TC));
  p.appendChild(slider('SHADOW',0,Math.round(H*0.12),1,()=>T.shadow,v=>{T.shadow=v;ch();},TC));
  p.appendChild(slider('OFFSET DEPTH',0,Math.round(H*0.15),1,()=>T.depth,v=>{T.depth=v;ch();},TC));
  p.appendChild(slider('OFFSET ANGLE',0,6.28,0.05,()=>T.depthA,v=>{T.depthA=v;ch();},TC,v=>Math.round(v*57.3)+'°'));
  p.appendChild(slider('DRIPS',0,10,1,()=>T.drips,v=>{T.drips=v;ch();},TC));
  p.appendChild(slider('DISTRESS',0,10,1,()=>T.distress,v=>{T.distress=v;ch();},TC));
  p.appendChild(el('div',{cls:'row'},[btn(T.highlight?'HIGHLIGHT ✔':'HIGHLIGHT',()=>{const b=textBefore(l);T.highlight=!T.highlight;ch();textCommit(b);refreshPanel();render();},T.highlight?'on':''),btn(T.grad?'GRADIENT ✔':'GRADIENT',()=>{const b=textBefore(l);T.grad=!T.grad;ch();textCommit(b);refreshPanel();render();},T.grad?'on':''),outlineBtn(l)]));
  p.appendChild(el('p',{cls:'note',text:'Colors live in the FILL tool. Letter placement, size, warp and 3D live in PO / SC / WARP / 3D / FC.'}));}

/* =====================================================================
   JSR WORKFLOW: 1 SIZE -> 2 TEXT -> 3 WARP / SHAPE -> 4 PAINT -> 5 SAVE
   ===================================================================== */
function navRow(items){return el('div',{cls:'nav'},items);}
function saveBtn(){return btn('💾 SAVE',()=>saveCurrent(false),'g','Save (you stay in the editor)');}
function addTextLayer(){if(ED.layers.length>=MAX_LAYERS){toastIn('Max '+MAX_LAYERS+' layers');return;}const b=fullBefore();let at=ED.layers.length;const bi=ED.layers.findIndex(q=>q.type==='paint');if(bi>=0)at=bi+1;ED.layers.splice(at,0,newLayer('text','LETTERS'));ED.cur=at;fullCommit(b);refreshPanel();render();}
function noText(p){p.appendChild(el('p',{cls:'note',text:'This design has no lettering layer.'}));p.appendChild(el('div',{cls:'row'},[btn('+ ADD LETTERING',addTextLayer,'y')]));}

/* ---- 1. SIZE ---- */
function panelSize(p){p.appendChild(navRow([btn('TEXT ▶',()=>setTab('text'),'y')]));
  p.appendChild(lbl('1 · SELECT SIZE'));const g=el('div',{cls:'sizes'});
  for(const k of SIZE_KEYS){const Z=SIZES[k];const dis=ED.lockSize&&k!==ED.size;const b=el('button',{type:'button',cls:ED.size===k?'on':'',onclick:()=>changeSize(k)},
      [el('i',{style:`width:${Math.round(Z.ww*1.15)}px;height:${Math.round(Z.wh*1.15)}px`}),el('span',{text:Z.label}),el('small',{style:'font-size:8px;color:#e8dcff',text:Z.W+'×'+Z.H})]);if(dis)b.disabled=true;g.appendChild(b);}
  p.appendChild(g);
  p.appendChild(el('p',{cls:'note',text:(ED.lockSize?'This wall takes '+SIZES[ED.size].label+' pieces. ':'')+'Small walls tag fastest, X-Large pieces take longest. Changing size rescales anything you already made.'}));
  p.appendChild(el('p',{cls:'hint',text:'FLOW: SIZE → TEXT → WARP → PAINT → SAVE'}));}
function scaleText(T,f){syncLetters(T);for(const k of['size','spacing','overlap','curve','x','y','outline','border','shadow','depth','ext','z','bulge','bend'])T[k]=(+T[k]||0)*f;
  for(const k of['size','outline','border','shadow','depth'])T[k]=Math.round(T[k]);T.size=Math.max(8,T.size);T.wp=T.wp.map(v=>v*f);
  for(const q of T.letters){for(const k of['dx','dy','z','bulge','bend'])q[k]=(+q[k]||0)*f;if(q.ext!=null)q.ext*=f;q.wp=q.wp.map(v=>v*f);}}
function changeSize(k){if(!ED||k===ED.size||!SIZES[k]||ED.lockSize)return;commitPending();ED.drips.length=0;const Z=SIZES[k],f=Z.H/ED.H;
  for(const l of ED.layers){if(l.type==='paint'){const c=cv(Z.W,Z.H);ctx2(c,true).drawImage(l.c,0,0,Z.W,Z.H);l.c=c;}else{scaleText(l.text,f);l._dirty=true;l._tc=null;}}
  if(ED.name===charName(ED.owner)+' '+SIZES[ED.size].label)ED.name=charName(ED.owner)+' '+Z.label;
  ED.size=k;ED.W=Z.W;ED.H=Z.H;ED.bsize=Math.max(1,Math.round(ED.bsize*f));ED.esize=Math.max(1,Math.round(ED.esize*f));ED.stkSize=Math.round(ED.stkSize*f);
  ED.hist=[];ED.fut=[];updHist();ED.dirty=true;if(ED.ui.badge)ED.ui.badge.textContent=Z.label+' '+Z.W+'×'+Z.H;fitView();refreshPanel();render();}

/* OUTLINE ONLY: the word is drawn as its black (outline colour) edges only, see-through inside, to paint the letters in underneath */
function outlineBtn(l){const T=l.text;return btn(T.outlineOnly?'OUTLINE ONLY ✔':'OUTLINE ONLY',()=>{const b=textBefore(l);T.outlineOnly=!T.outlineOnly;l._dirty=true;ED.dirty=true;textCommit(b);refreshPanel();render();},T.outlineOnly?'on':'','Only the outline of the letters: no fill, border, shadow or 3D, so you can paint them in');}
/* ---- 2. TEXT ENTRY ---- */
const KB={abc:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',low:'abcdefghijklmnopqrstuvwxyz',sym:"!?&-.'\"#@$%+=*/~:;,()<>^_★☆♥♪♦♠♣✌",
  hira:'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんゃゅょっー',
  kata:'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンャュョッー'};
const KBN=[['abc','ABC'],['low','abc'],['sym','#?!'],['hira','ひらがな'],['kata','カタカナ']];
function maxLen(T){return T.max7?7:16;}
function syncSel(){const l=curText();if(!l)return;const n=[...l.text.str].length;ED.cursor=clamp(ED.cursor,0,n);ED.selLetter=ED.cursor<n?ED.cursor:-1;ED.selSet=ED.selLetter>=0?[ED.selLetter]:[];}
function typeChar(c){const l=curText();if(!l)return;const T=l.text;const n=[...T.str].length;if(n>=maxLen(T)){toastIn(T.max7?'CLASSIC MODE: 7 CHARACTERS MAX':maxLen(T)+' CHARACTERS MAX');return;}
  const b=textBefore(l);insChar(T,ED.cursor,c);ED.cursor++;fitText(T,ED.W,ED.H);l._dirty=true;textCommit(b);syncSel();refreshPanel();render();}
function kanaMark(mark){const l=curText();if(!l)return;const T=l.text;const a=[...T.str];const i=Math.max(0,ED.cursor-1);if(!a[i])return;
  const base=a[i].normalize('NFD').replace(/[゙゚]/g,'');const c=(base+mark).normalize('NFC');if([...c].length!==1){toastIn('No '+(mark==='゙'?'゛':'゜')+' form for '+a[i]);return;}
  const b=textBefore(l);a[i]=c;T.str=a.join('');l._dirty=true;textCommit(b);refreshPanel();render();}
function delSel(back){const l=curText();if(!l)return;const T=l.text;const n=[...T.str].length;const i=back?ED.cursor-1:(ED.cursor<n?ED.cursor:ED.cursor-1);if(i<0||i>=n)return;
  const b=textBefore(l);delChar(T,i);ED.cursor=i;l._dirty=true;textCommit(b);syncSel();refreshPanel();render();}
function moveCursor(d){if(!curText())return;ED.cursor+=d;syncSel();refreshPanel();render();}
function panelText(p){const l=curText();
  p.appendChild(navRow([btn('◀ BACK',()=>setTab('size'),'k','Back to size'),btn('WARP ▶',()=>setTab('warp'),'y','Lettering shape editor'),btn('PAINT ▶',()=>setTab('paint'),'c','Straight to spray painting')]));
  if(!l){noText(p);return;}const T=l.text;syncLetters(T);
  const head=lbl('');p.appendChild(head);const wd=el('div',{cls:'word'});p.appendChild(wd);
  const fill=()=>{const chars=[...T.str],n=chars.length;ED.cursor=clamp(ED.cursor,0,n);head.textContent='2 · ENTER TEXT  '+n+'/'+maxLen(T)+(T.max7?' · CLASSIC':'');wd.innerHTML='';
    const sel=ED.selLetter>=0?selFix():[];
    chars.forEach((c,i)=>{wd.appendChild(btn(c===' '?'␣':c,()=>{selToggle(i);ED.cursor=ED.selLetter>=0?ED.selLetter:n;refreshPanel();render();},sel.includes(i)?'on':'','Select character '+(i+1)+' (tap more letters to edit them together)'));});
    const end=el('button',{type:'button',title:'End of the word',style:'min-width:22px;padding:0;background:transparent;box-shadow:none;border:none',onclick:()=>{ED.cursor=n;syncSel();refreshPanel();render();}},ED.cursor===n?[el('span',{cls:'caret',style:'display:inline-block'})]:['·']);wd.appendChild(end);};
  fill();
  p.appendChild(flipRow(T));
  p.appendChild(el('div',{cls:'row'},[btn('◀',()=>moveCursor(-1),'k','Cursor left'),btn('▶',()=>moveCursor(1),'k','Cursor right'),btn('DEL',()=>delSel(false),'r','Delete the selected character'),btn('SPACE',()=>typeChar(' '),'k'),
    btn(T.max7?'CLASSIC 7 ✔':'CLASSIC 7',()=>{const b=textBefore(l);T.max7=!T.max7;if(T.max7&&[...T.str].length>7){setStr(T,[...T.str].slice(0,7).join(''));toastIn('Trimmed to 7 characters (UNDO brings them back)');}l._dirty=true;textCommit(b);syncSel();refreshPanel();render();},T.max7?'on':'','Original 7-character limit')]));
  const kr=el('div',{cls:'row'});for(const[k,n]of KBN){const b=btn(n,()=>{ED.kb=k;refreshPanel();},ED.kb===k?'on':'k',k==='low'?'Lowercase':k==='hira'?'Hiragana':k==='kata'?'Katakana':k==='sym'?'Symbols':'Uppercase');b.style.textTransform='none';kr.appendChild(b);}p.appendChild(kr);
  const keys=el('div',{cls:'keys'});for(const c of KB[ED.kb]||KB.abc)keys.appendChild(btn(c,()=>typeChar(c),'',c));
  if(ED.kb==='hira'||ED.kb==='kata'){keys.appendChild(btn('゛',()=>kanaMark('゙'),'c','Dakuten on the previous kana'));keys.appendChild(btn('゜',()=>kanaMark('゚'),'c','Handakuten on the previous kana'));}
  p.appendChild(keys);
  p.appendChild(el('p',{cls:'hint',text:'Tap a character to select it, tap more to select several (tap a selected one again to drop it). The last tapped letter goes on top. New characters go in front of the selected one; DEL removes it. Each letter keeps its own warp, 3D and color.'}));
  const inp=el('input',{type:'text',value:T.str,maxlength:String(maxLen(T)),placeholder:'OR TYPE WITH YOUR KEYBOARD'});let tb=null;
  inp.addEventListener('focus',()=>{tb=textBefore(l);});inp.addEventListener('input',()=>{setStr(T,[...inp.value].slice(0,maxLen(T)).join(''));fitText(T,ED.W,ED.H);l._dirty=true;ED.dirty=true;ED.cursor=[...T.str].length;syncSel();fill();render();});
  inp.addEventListener('change',()=>{if(tb)textCommit(tb);tb=null;});p.appendChild(lbl('DEVICE KEYBOARD'));p.appendChild(el('div',{cls:'row'},[inp,btn('FIT',()=>{const b=textBefore(l);T.size=Math.round(ED.H*0.6);fitText(T,ED.W,ED.H);l._dirty=true;textCommit(b);render();},'c')]));}
function edKey(e){if(!ED||!ED.ui||!UI||UI.view!=='editor')return;const t=e.target;const typing=t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA');
  if((e.ctrlKey||e.metaKey)&&!typing&&/^[zy]$/i.test(e.key)){e.preventDefault();if(e.key.toLowerCase()==='y'||e.shiftKey)redo();else undo();return;}
  if(ED.tab!=='text'||typing||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='ArrowLeft'){e.preventDefault();moveCursor(-1);}else if(e.key==='ArrowRight'){e.preventDefault();moveCursor(1);}
  else if(e.key==='Backspace'){e.preventDefault();delSel(true);}else if(e.key==='Delete'){e.preventDefault();delSel(false);}
  else if(e.key.length===1||[...e.key].length===1){e.preventDefault();typeChar(e.key);}}

/* ---- 3. WARP / SHAPE EDITOR ---- */
const WTOOLS=[['warp','WARP','CUSTOM FONT / WARP: drag the pink corner handles to stretch, squash or skew; drag the green handle to bend. Drag elsewhere: left/right skews, up/down bends.'],
  ['po','PO','POSITION: drag to move the selected letter, or the whole word in ALL mode.'],
  ['sc','SC','SCALE: drag left/right for width, up/down for height. LOCK keeps the proportions.'],
  ['3d','3D','3D: drag to rotate around the vertical / horizontal axis. EXTRUDE gives the letters real depth.'],
  ['fc','FC','FOCAL / LENS: drag up/down to push the lettering back or pull it forward, left/right for lens strength.'],
  ['fill','FILL','COLOR / FILL: pick what to color, then tap a swatch. Applies to the selected letter or ALL.'],
  ['style','STYLE','STYLE: font, outline, shadow, drips and other whole-word lettering effects.']];
/* ---- letter selection: ED.selSet = the selected letters in tap order, ED.selLetter = the primary (last tapped) one.
   Code that only sets ED.selLetter still works: selFix() turns that into a single selection. ---- */
function selFix(){if(!Array.isArray(ED.selSet))ED.selSet=[];const i=ED.selLetter;if(!(i>=0)){ED.selSet=[];return ED.selSet;}if(!ED.selSet.includes(i))ED.selSet=[i];return ED.selSet;}
function selIdx(T){if(ED.wmode!=='one')return[];return selFix().filter(k=>!!T.letters[k]);}
/* what a letter button (flip) works on: the selected letters, or every letter when nothing / ALL is selected */
function targetIdx(T){const s=ED.tab==='text'?(ED.selLetter>=0?selFix().filter(k=>!!T.letters[k]):[]):selIdx(T);return s.length?s:T.letters.map((_,k)=>k);}
/* a tapped letter becomes the top layer (lz = max + 1; values kept compact) */
function raiseLetter(tl,i){const T=tl.text;const q=T.letters[i];if(!q)return;const v=z=>+z.lz||0;let mx=0;for(const z of T.letters)mx=Math.max(mx,v(z));
  if(mx>0&&v(q)===mx&&T.letters.filter(z=>v(z)===mx).length===1)return;q.lz=mx+1;
  const vals=[...new Set(T.letters.map(v))].sort((a,b)=>a-b),off=vals[0]===0?0:1;for(const z of T.letters)z.lz=vals.indexOf(v(z))+off;tl._dirty=true;ED.dirty=true;}
function selOnly(i){const tl=curText();ED.wmode='one';ED.selLetter=i;ED.selSet=[i];if(tl)raiseLetter(tl,i);}
function selAll(){ED.wmode='all';ED.selLetter=-1;ED.selSet=[];}
/* add / remove one letter (letter buttons, or canvas taps with MULTI on). Removing the only selected letter goes back to ALL. */
function selToggle(i){const tl=curText();const cur=ED.wmode==='one'&&ED.selLetter>=0?selFix().slice():[];
  if(cur.includes(i)){const r=cur.filter(k=>k!==i);if(!r.length){selAll();return false;}ED.selSet=r;ED.selLetter=r[r.length-1];ED.wmode='one';return false;}
  cur.push(i);ED.selSet=cur;ED.selLetter=i;ED.wmode='one';if(tl)raiseLetter(tl,i);return true;}
function scopeL(T){return ED.wmode==='one'&&T.letters[ED.selLetter]?T.letters[ED.selLetter]:null;}
function setScope(i){if(i>=0)selOnly(i);else selAll();refreshPanel();render();}
function selName(T){const c=[...T.str];return selIdx(T).map(k=>c[k]).join(' ');}
function flipSel(ax){const l=curText();if(!l)return;const T=l.text;syncLetters(T);const b=textBefore(l);const k=ax==='x'?'fx':'fy';for(const i of targetIdx(T))T.letters[i][k]=!T.letters[i][k];l._dirty=true;ED.dirty=true;textCommit(b);refreshPanel();render();}
function flipRow(T){const n=targetIdx(T).length,all=n===T.letters.length;return el('div',{cls:'row'},[btn('FLIP ↔',()=>flipSel('x'),'','Mirror '+(all?'every letter':'the selected letters')+' sideways'),btn('FLIP ↕',()=>flipSel('y'),'','Mirror '+(all?'every letter':'the selected letters')+' upside down'),el('span',{cls:'note',text:all?'ALL LETTERS':n+' LETTER'+(n>1?'S':'')})]);}
function panelWarp(p){const l=curText();
  p.appendChild(navRow([btn('◀ RETURN',()=>setTab('text'),'k','Back to text entry'),btn('SPRAY ▶',()=>setTab('paint'),'y','Paint mode'),saveBtn()]));
  if(!l){noText(p);return;}const T=l.text;syncLetters(T);const W=ED.W,H=ED.H;const TC={begin:()=>textBefore(l),end:b=>{textCommit(b);}};const ch=()=>{l._dirty=true;ED.dirty=true;};
  const tg=el('div',{cls:'tools'});for(const[k,n,h]of WTOOLS)tg.appendChild(btn(n,()=>{ED.wtool=k;refreshPanel();render();},ED.wtool===k?'on':'',h.split(':')[0]));p.appendChild(tg);
  const tool=WTOOLS.find(t=>t[0]===ED.wtool)||WTOOLS[1];
  const SI=selIdx(T),SEL=SI.map(k=>T.letters[k]),L=SEL.length?(T.letters[ED.selLetter]||SEL[SEL.length-1]):null;
  if(ED.wtool!=='style'){const sc=el('div',{cls:'scope'});sc.appendChild(btn('ALL',()=>setScope(-1),ED.wmode==='all'||!SI.length?'on all':'k all','Edit the whole word'));
    [...T.str].forEach((c,i)=>{if(c===' ')return;sc.appendChild(btn(c,()=>{selToggle(i);refreshPanel();render();},SI.includes(i)?'on':'','Tap to add / remove this letter (tap the only selected one again for ALL)'));});p.appendChild(sc);
    p.appendChild(flipRow(T));}
  const who=ED.wtool==='style'?'WHOLE WORD':SEL.length>1?SEL.length+' LETTERS "'+selName(T)+'"':L?'LETTER "'+[...T.str][ED.selLetter]+'"':'ALL LETTERS';
  p.appendChild(el('div',{cls:'hint',text:tool[2]}));p.appendChild(lbl(tool[1]+' · '+who));
  const tgt=L||T;const S=(label,min,max,step,get,set,fmt)=>p.appendChild(slider(label,min,max,step,get,v=>{set(v);ch();},TC,fmt));const deg=v=>Math.round(v*57.3)+'°';const pct=v=>Math.round(v*100)+'%';
  /* letter slider: shows the primary letter, moves every selected letter by the same amount */
  const LS=(label,min,max,step,get,set,fmt)=>S(label,min,max,step,()=>get(L),v=>{const d=v-get(L);for(const q of SEL)set(q,q===L?v:clamp(get(q)+d,min,max));},fmt);
  const X=(label,min,max,step,key,fmt)=>L?LS(label,min,max,step,q=>q[key],(q,v)=>q[key]=v,fmt):S(label,min,max,step,()=>T[key],v=>T[key]=v,fmt);
  const t=ED.wtool;
  if(t==='po'){if(L){LS('MOVE X',-Math.round(W*0.6),Math.round(W*0.6),1,q=>q.dx,(q,v)=>q.dx=v);LS('MOVE Y',-Math.round(H*0.7),Math.round(H*0.7),1,q=>q.dy,(q,v)=>q.dy=v);}
    else{S('X',0,W,1,()=>T.x,v=>T.x=v);S('Y',0,H,1,()=>T.y,v=>T.y=v);}}
  else if(t==='sc'){if(L){const sv=(kx,ky)=>v=>{const r=v/(L[kx]||1);for(const q of SEL){const o=q[kx];q[kx]=q===L?v:clamp(o*r,0.15,3.5);if(ED.lockAR&&o)q[ky]=clamp(q[ky]*q[kx]/o,0.15,3.5);}};
      S('WIDTH',0.15,3.5,0.01,()=>L.sx,sv('sx','sy'),pct);S('HEIGHT',0.15,3.5,0.01,()=>L.sy,sv('sy','sx'),pct);}
    else{const kx='wsx',ky='wsy';
    S('WIDTH',0.15,3.5,0.01,()=>tgt[kx],v=>{if(ED.lockAR&&tgt[kx])tgt[ky]=clamp(tgt[ky]*v/tgt[kx],0.15,3.5);tgt[kx]=v;},pct);
    S('HEIGHT',0.15,3.5,0.01,()=>tgt[ky],v=>{if(ED.lockAR&&tgt[ky])tgt[kx]=clamp(tgt[kx]*v/tgt[ky],0.15,3.5);tgt[ky]=v;},pct);}
    p.appendChild(el('div',{cls:'row'},[btn(ED.lockAR?'🔒 LOCK RATIO ✔':'🔓 LOCK RATIO',()=>{ED.lockAR=!ED.lockAR;refreshPanel();},ED.lockAR?'on':'','Keep width and height in proportion')]));}
  else if(t==='3d'){X('TILT ↕ (X)',-1.55,1.55,0.01,'rx',deg);X('TURN ↔ (Y)',-1.55,1.55,0.01,'ry',deg);
    if(L)LS('ROLL',-3.14,3.14,0.01,q=>q.rot,(q,v)=>q.rot=v,deg);else S('ROLL',-3.14,3.14,0.01,()=>T.rz,v=>T.rz=v,deg);
    if(L)LS('EXTRUDE',0,Math.round(H*0.4),1,q=>q.ext!=null?q.ext:T.ext,(q,v)=>q.ext=v);else S('EXTRUDE',0,Math.round(H*0.4),1,()=>T.ext,v=>T.ext=v);
    p.appendChild(el('p',{cls:'note',text:'Real 3D: letters are rotated in space and drawn with perspective; EXTRUDE builds solid sides behind each face (side color: FILL › 3D SIDE). Strength of the perspective is the FC tool.'}));}
  else if(t==='fc'){const mm=v=>Math.round(14+186*(1-v))+'mm';if(L)LS('LENS',0,1,0.01,q=>q.lens!=null?q.lens:T.lens,(q,v)=>q.lens=v,mm);else S('LENS',0,1,0.01,()=>T.lens,v=>T.lens=v,mm);
    X('PUSH ↔ PULL',-Math.round(H*0.7),Math.round(H*2),1,'z',v=>(v>0?'BACK ':v<0?'FWD ':'')+Math.abs(Math.round(v)));
    X('BULGE',-Math.round(H*0.6),Math.round(H*0.6),1,'bulge');
    p.appendChild(el('p',{cls:'note',text:'Focal length is separate from rotation and scale: low mm = strong perspective. PUSH moves the lettering into the distance or toward you, BULGE curves it like a fish-eye lens.'}));}
  else if(t==='warp'){if(L)LS('SKEW',-1.5,1.5,0.01,q=>q.sk,(q,v)=>q.sk=v);else S('SKEW',-1.2,1.2,0.01,()=>T.slant,v=>T.slant=v);
    X('BEND',-Math.round(H*0.6),Math.round(H*0.6),1,'bend');const R=Math.round(H*0.5);
    const tap=[q=>(q.wp[0]-q.wp[2])/2,(q,v)=>{const wp=q.wp,m=(wp[0]+wp[2])/2;wp[0]=m+v;wp[2]=m-v;}],fla=[q=>(q.wp[5]-q.wp[3])/2,(q,v)=>{const wp=q.wp,mr=(wp[3]+wp[5])/2;wp[3]=mr-v;wp[5]=mr+v;}];
    if(L){LS('TAPER',-R,R,1,tap[0],tap[1]);LS('FLARE',-R,R,1,fla[0],fla[1]);}else{S('TAPER',-R,R,1,()=>tap[0](T),v=>tap[1](T,v));S('FLARE',-R,R,1,()=>fla[0](T),v=>fla[1](T,v));}}
  else if(t==='fill'){const TG=L?[['fill','FILL'],['fill2','FILL 2']]:[['fill','FILL'],['fill2','FILL 2'],['outlineC','OUTLINE'],['borderC','BORDER'],['shadowC','SHADOW'],['depthC','3D SIDE']];
    if(!TG.some(q=>q[0]===ED.ftarget))ED.ftarget='fill';const cur=k=>L?(k==='fill'?(L.c1||T.fill):(L.c2||(T.grad?T.fill2:(L.c1||T.fill)))):T[k];
    const tr=el('div',{cls:'row'});for(const[k,n]of TG){const b=btn(n,()=>{ED.ftarget=k;refreshPanel();},ED.ftarget===k?'on':'');b.style.borderBottom='5px solid '+cur(k);tr.appendChild(b);}p.appendChild(tr);
    const c0=cur(ED.ftarget);p.appendChild(el('div',{cls:'cc'},[el('div',{cls:'big',style:'background:'+c0}),el('span',{cls:'note',text:'PREVIEW · '+(TG.find(q=>q[0]===ED.ftarget)||['',''])[1]+' '+c0})]));
    p.appendChild(colorRow(c=>{const b=textBefore(l);const k=ED.ftarget;if(L){for(const q of SEL){if(k==='fill')q.c1=c;else q.c2=c;}}else{T[k]=c;if(k==='fill')for(const q of T.letters)q.c1='';if(k==='fill2'){T.grad=true;for(const q of T.letters)q.c2='';}}ch();textCommit(b);refreshPanel();render();},c0));
    if(!L)p.appendChild(el('div',{cls:'row'},[btn(T.grad?'GRADIENT ✔':'GRADIENT',()=>{const b=textBefore(l);T.grad=!T.grad;ch();textCommit(b);refreshPanel();render();},T.grad?'on':'','Use FILL 2 for a top-to-bottom gradient')]));
    p.appendChild(el('p',{cls:'note',text:'Lettering fill is separate from spray paint: it stays editable and never mixes into the paint layers.'}));}
  else if(t==='style'){panelStyle(p);}
  p.appendChild(el('div',{cls:'row',style:'margin-top:8px'},[btn('DEFAULT',toolDefault,'c','Restore this tool\'s setting for '+who),btn('RESET LETTERING',resetLettering,'r','Reset the whole arrangement (keeps text, colors and saves)')]));}
function toolDefault(){const l=curText();if(!l)return;const T=l.text;const SL=selIdx(T).map(k=>T.letters[k]);const b=textBefore(l);const t=ED.wtool;for(const q of SL.length?SL:[null]){
  if(t==='po'){if(q){q.dx=0;q.dy=0;}else{T.x=ED.W/2;T.y=ED.H/2;}}
  else if(t==='sc'){if(q){q.sx=1;q.sy=1;}else{T.wsx=1;T.wsy=1;}}
  else if(t==='3d'){if(q){q.rx=0;q.ry=0;q.rot=0;q.ext=null;}else{T.rx=0;T.ry=0;T.rz=0;T.ext=0;}}
  else if(t==='fc'){if(q){q.lens=null;q.z=0;q.bulge=0;}else{T.lens=TDEF.lens;T.z=0;T.bulge=0;}}
  else if(t==='warp'){if(q){q.wp=WP0();q.bend=0;q.sk=0;}else{T.wp=WP0();T.bend=0;T.slant=0;}}
  else if(t==='fill'){if(q){q.c1='';q.c2='';}else{const k=ED.ftarget;T[k]=TCOL[k];if(k==='fill')for(const z of T.letters)z.c1='';if(k==='fill2')for(const z of T.letters)z.c2='';}}
  else if(t==='style'){const d=newText('',ED.W,ED.H);for(const k of['style','outline','border','shadow','depth','depthA','drips','distress','highlight','grad','curve','slant','spacing','overlap','stack','outlineOnly','flipX','flipY'])T[k]=d[k];fitText(T,ED.W,ED.H);break;}}
  l._dirty=true;textCommit(b);refreshPanel();render();toastIn('Default restored');}
function resetLettering(){const l=curText();if(!l)return;modal('<p>Reset the whole lettering arrangement (position, scale, warp, 3D, focal, curve) to default?</p><p>Your text, colors, paint and saved designs are kept, and UNDO brings it back.</p>',[['RESET',()=>{const T=l.text;const b=textBefore(l);const m7=T.max7;
    Object.assign(T,TDEF,{wp:WP0(),x:ED.W/2,y:ED.H/2,curve:0,slant:0,flipX:false,flipY:false,max7:m7});for(const q of T.letters){const c1=q.c1,c2=q.c2;Object.assign(q,LDEF(),{c1,c2});}l._dirty=true;textCommit(b);refreshPanel();render();toastIn('Lettering reset');},'r'],['CANCEL',null,'k']]);}
/* canvas gestures in the shape editor */
function jsolve(T,pos,apply,sdx,sdy){const W=ED.W,H=ED.H;const p0=pos(layoutText(T,W,H));apply(1,0);const p1=pos(layoutText(T,W,H));apply(-1,0);apply(0,1);const p2=pos(layoutText(T,W,H));apply(0,-1);
  const a=p1[0]-p0[0],b=p1[1]-p0[1],c=p2[0]-p0[0],d=p2[1]-p0[1];const det=a*d-b*c;if(Math.abs(det)<1e-4)return false;apply(clamp((sdx*d-c*sdy)/det,-80,80),clamp((a*sdy-b*sdx)/det,-80,80));return true;}
function dragHandle(T,i,k,dx,dy){const L=i>=0?T.letters[i]:null;const tgt=L||T;const pos=lay=>{const o=warpHandles(lay,i).find(h=>h.k===k);return o?[o.x,o.y]:[0,0];};
  if(k==='b'){const p0=pos(layoutText(T,ED.W,ED.H));tgt.bend+=1;const p1=pos(layoutText(T,ED.W,ED.H));tgt.bend-=1;const jx=p1[0]-p0[0],jy=p1[1]-p0[1],jj=jx*jx+jy*jy;if(jj>1e-6)tgt.bend=clamp(tgt.bend+(dx*jx+dy*jy)/jj,-ED.H,ED.H);return;}
  const wp=tgt.wp;jsolve(T,pos,(a,b)=>{wp[k*2]+=a;wp[k*2+1]+=b;},dx,dy);const lim=T.size*3;for(let j=0;j<8;j++)wp[j]=clamp(wp[j],-lim,lim);}
/* multi-select warp: the selected letters act like one piece in their combined box. A corner drag moves each letter's own corners
   by the share a bilinear warp of that box gives them; the green handle arches the group (centre letters move most). */
function dragGroupHandle(T,idx,k,dx,dy){const lay=layoutText(T,ED.W,ED.H);const b=selBox(lay,idx);if(!b)return;const bw=Math.max(1,b.x1-b.x0),bh=Math.max(1,b.y1-b.y0);
  for(const i of idx){const l=lay.L[i];if(!l||l.ch===' ')continue;
    if(k==='b'){const c=l.fn(0,0,0);const s=clamp(2*(c[0]-b.x0)/bw-1,-1,1),w=1-s*s;if(w<0.02)continue;const Lt=T.letters[i];jsolve(T,ly=>ly.L[i].fn(0,0,0),(a,bb)=>{Lt.dx+=a;Lt.dy+=bb;},dx*w,dy*w);continue;}
    const cs=[[-l.hw,-l.hh],[l.hw,-l.hh],[l.hw,l.hh],[-l.hw,l.hh]].map(p=>l.fn(p[0],p[1],0));
    cs.forEach((q,j)=>{const u=clamp((q[0]-b.x0)/bw,0,1),v=clamp((q[1]-b.y0)/bh,0,1);const w=[(1-u)*(1-v),u*(1-v),u*v,(1-u)*v][k];if(w>0.01)dragHandle(T,i,j,dx*w,dy*w);});}}
function hitLetter(tl,q){layerCanvas(tl);const bx=tl._tc._boxes||[];const ch=[...tl.text.str];let hit=-1,bd=1e9;bx.forEach((b,i)=>{if(ch[i]===' ')return;const d=D(b.x,b.y,q.x,q.y);if(d<b.r*1.1&&d<bd){bd=d;hit=i;}});return hit;}
function warpDown(q){const tl=curText();if(!tl)return;const T=tl.text;const hit=hitLetter(tl,q);let h=null,added=false;
  if(ED.wtool==='warp'){const hs=warpHandles(layoutText(T,ED.W,ED.H),selIdx(T));let bd=18*(ED.dpr||1)/ED.zoom;for(const o of hs){const d=D(o.x,o.y,q.x,q.y);if(d<bd){bd=d;h=o.k;}}}
  /* press on a letter outside the selection: it becomes the selection (MULTI: joins it), so a drag moves it right away */
  if(h==null&&ED.wmode==='one'&&hit>=0&&!selIdx(T).includes(hit)){if(ED.multi)selToggle(hit);else selOnly(hit);added=true;refreshPanel();}
  ED.drag={b:textBefore(tl),x:q.x,y:q.y,x0:q.x,y0:q.y,moved:false,h,hit,added};render();}
function warpMove(q){const d=ED.drag,tl=curText();if(!d||!tl)return;if(!d.moved&&D(q.x,q.y,d.x0,d.y0)<3*(ED.dpr||1)/ED.zoom)return;
  const T=tl.text;const dx=q.x-d.x,dy=q.y-d.y;d.moved=true;d.x=q.x;d.y=q.y;const SI=selIdx(T),SL=SI.map(k=>T.letters[k]),t=ED.wtool,W=ED.W,H=ED.H;
  if(t==='warp'){if(d.h!=null){if(SI.length>1)dragGroupHandle(T,SI,d.h,dx,dy);else dragHandle(T,SI.length?SI[0]:-1,d.h,dx,dy);}
    else if(SL.length){for(const L of SL){L.sk=clamp(L.sk+dx/T.size,-1.5,1.5);L.bend=clamp(L.bend-dy,-H,H);}}else{T.slant=clamp(T.slant+dx/(T.size*1.5),-1.2,1.2);T.bend=clamp(T.bend-dy,-H,H);}}
  else if(t==='po'||t==='style'){if(SL.length){SI.forEach((i,n)=>{const L=SL[n];jsolve(T,lay=>lay.L[i].fn(0,0,0),(a,b)=>{L.dx+=a;L.dy+=b;},dx,dy);});}else jsolve(T,lay=>lay.word(lay.wcx,lay.wcy,0,lay.fT),(a,b)=>{T.x+=a;T.y+=b;},dx,dy);}
  else if(t==='sc'){let kx=Math.exp(dx/(W*0.25)),ky=Math.exp(-dy/(H*0.25));if(ED.lockAR){const k=Math.abs(dx)>Math.abs(dy)?kx:ky;kx=ky=k;}const a=SL.length?'sx':'wsx',b=SL.length?'sy':'wsy';for(const tg of SL.length?SL:[T]){tg[a]=clamp(tg[a]*kx,0.15,3.5);tg[b]=clamp(tg[b]*ky,0.15,3.5);}}
  else if(t==='3d'){for(const tg of SL.length?SL:[T]){tg.ry=clamp(tg.ry+dx*0.012,-1.55,1.55);tg.rx=clamp(tg.rx-dy*0.012,-1.55,1.55);}}
  else if(t==='fc'){if(SL.length)for(const L of SL){L.z=clamp(L.z+dy*1.5,-H*0.7,H*2);L.lens=clamp((L.lens!=null?L.lens:T.lens)+dx/(W*0.8),0,1);}else{T.z=clamp(T.z+dy*1.5,-H*0.7,H*2);T.lens=clamp(T.lens+dx/(W*0.8),0,1);}}
  else return;tl._dirty=true;ED.dirty=true;render();}
function warpUp(){const d=ED.drag,tl=curText();ED.drag=null;fullQuality();if(!d||!tl)return;if(d.moved){textCommit(d.b);refreshPanel();}
  else if(d.h==null){/* tap: select only that letter (MULTI on: add / remove it), or tap empty canvas for ALL */
    if(d.hit<0)selAll();else if(ED.multi){if(!d.added)selToggle(d.hit);}else selOnly(d.hit);refreshPanel();}render();}

/* ---------------- PAINT panel ---------------- */
const TOOLS=[['spray','SPRAY'],['eraser','ERASER'],['air','AIRBRUSH'],['marker','MARKER'],['pencil','PENCIL'],['drip','DRIP'],['splat','SPLATTER'],['bucket','BUCKET'],['picker','PICKER'],['sticker','STICKER'],['hand','PAN']];
function panelPaint(p){const fb=curFB();p.appendChild(navRow([btn('◀ TEXT',()=>setTab('text'),'k','Back to text entry (paint is kept)'),btn('◀ EFFECTS',()=>setTab('warp'),'k','Back to the lettering shape editor (paint is kept)'),btn('F/B: '+(fb==='back'?'BEHIND':fb==='front'?'FRONT':'—'),()=>setFB(fb==='back'?'front':'back'),'c','Toggle painting behind / in front of the letters'),saveBtn()]));
  const l=curLayer();if(!l||l.type!=='paint'){p.appendChild(el('p',{cls:'note',text:'Paint tools draw on paint layers. Select or add one.'}));p.appendChild(el('div',{cls:'row'},[btn('+ ADD PAINT LAYER',()=>addPaintLayer(),'y')]));return;}
  p.appendChild(el('div',{cls:'note',text:'LAYER: '+l.name+(fb?' · painting '+(fb==='back'?'BEHIND':'IN FRONT OF')+' the letters':'')}));
  const g=el('div',{cls:'grid'});for(const[k,n]of TOOLS)g.appendChild(btn(n,()=>{ED.tool=ED.ptool=k;refreshPanel();render();},ED.tool===k?'on':''));p.appendChild(g);
  if(ED.tool==='sticker'){panelStick(p);return;}
  const isE=ED.tool==='eraser';const sk=isE?'esize':'bsize';const SM=Math.max(2,Math.round(ED.H*(isE?0.03:0.035))),LG=Math.round(ED.H*(isE?0.14:0.13));
  p.appendChild(lbl(isE?'ERASER SIZE':'CAN SIZE'));p.appendChild(el('div',{cls:'row'},[btn('SMALL',()=>{ED[sk]=SM;refreshPanel();render();},ED[sk]===SM?'on':''),btn('LARGE',()=>{ED[sk]=LG;refreshPanel();render();},ED[sk]===LG?'on':''),el('span',{cls:'note',text:isE?'Eraser removes paint back to transparent.':'Hold / drag on the canvas to spray.'})]));
  p.appendChild(slider(isE?'ERASER':'SIZE',1,Math.round(ED.H*0.3),1,()=>ED[sk],v=>{ED[sk]=v;}));
  const pc=el('div',{cls:'cc'},[el('button',{type:'button',cls:'big'+(ED.which===0?' on':''),style:'background:'+ED.col+(ED.which===0?';outline:3px solid #fff':''),title:'Primary',onclick:()=>{ED.which=0;refreshPanel();}}),el('button',{type:'button',cls:'big',style:'background:'+ED.col2+(ED.which===1?';outline:3px solid #fff':''),title:'Secondary',onclick:()=>{ED.which=1;refreshPanel();}}),btn('⇄ SWAP',()=>{const t=ED.col;ED.col=ED.col2;ED.col2=t;refreshPanel();}),el('span',{cls:'note',text:'COLOR 1 / COLOR 2 (gradients)'})]);
  p.appendChild(lbl('COLOR'));p.appendChild(pc);p.appendChild(colorRow(c=>{if(ED.which)ED.col2=c;else ED.col=c;refreshPanel();},ED.which?ED.col2:ED.col));
  p.appendChild(lbl('BRUSH'));
  p.appendChild(slider('OPACITY',0.05,1,0.01,()=>ED.opac,v=>{ED.opac=v;},null,v=>Math.round(v*100)+'%'));
  p.appendChild(slider('DENSITY',0.2,3,0.05,()=>ED.dens,v=>{ED.dens=v;},null,v=>Math.round(v*100)+'%'));
  p.appendChild(lbl('SYMMETRY'));const sy=el('div',{cls:'row'});for(const[k,n]of[['off','OFF'],['x','MIRROR ⇆'],['y','MIRROR ⇅'],['xy','QUAD ✛']])sy.appendChild(btn(n,()=>{ED.sym=k;refreshPanel();render();},ED.sym===k?'on':''));p.appendChild(sy);
  p.appendChild(el('div',{cls:'row'},[btn(ED.autoDrip?'SPRAY DRIPS ✔':'SPRAY DRIPS',()=>{ED.autoDrip=!ED.autoDrip;refreshPanel();},ED.autoDrip?'on':''),btn(ED.fillGrad?'BUCKET: GRADIENT':'BUCKET: SOLID',()=>{ED.fillGrad=!ED.fillGrad;refreshPanel();},ED.fillGrad?'on':'')]));
  {const tl=ED.layers.find(q=>q.type==='text');if(tl){p.appendChild(lbl('LETTERS'));p.appendChild(el('div',{cls:'row'},[outlineBtn(tl),el('span',{cls:'note',text:'Outline only: paint BEHIND to color the letters in.'})]));}}
  p.appendChild(lbl('LAYER FX'));p.appendChild(el('div',{cls:'row'},[btn('⇆ FLIP',()=>flipLayer(l,true)),btn('⇅ FLIP',()=>flipLayer(l,false)),btn('DISTRESS',()=>distressLayer(l)),btn('OUTLINE IT',()=>outlineLayer(l)),btn('CLEAR',()=>{beginPx(l);l.c.getContext('2d').clearRect(0,0,ED.W,ED.H);commitPending();render();},'r')]));}
function addPaintLayer(){if(ED.layers.length>=MAX_LAYERS){toastIn('Max '+MAX_LAYERS+' layers');return;}const b=fullBefore();ED.layers.splice(ED.cur+1,0,newLayer('paint','PAINT '+(ED.layers.length+1)));ED.cur++;fullCommit(b);refreshPanel();render();}
function flipLayer(l,h){if(l.type==='text'){const b=textBefore(l);if(h)l.text.flipX=!l.text.flipX;else l.text.flipY=!l.text.flipY;l._dirty=true;textCommit(b);render();return;}beginPx(l);const t=cv(ED.W,ED.H);t.getContext('2d').drawImage(l.c,0,0);const g=l.c.getContext('2d');g.clearRect(0,0,ED.W,ED.H);g.save();g.translate(h?ED.W:0,h?0:ED.H);g.scale(h?-1:1,h?1:-1);g.drawImage(t,0,0);g.restore();commitPending();render();}
function distressLayer(l){beginPx(l);const g=l.c.getContext('2d');const r=rng((Math.random()*1e9)|0);g.save();g.globalCompositeOperation='destination-out';const N=ED.W*ED.H/60;for(let i=0;i<N;i++){g.globalAlpha=0.3+r()*0.7;const s=0.6+r()*2.4;g.fillRect(r()*ED.W,r()*ED.H,s,s);}g.lineWidth=1;for(let i=0;i<14;i++){g.globalAlpha=0.7;g.beginPath();let x=r()*ED.W,y=r()*ED.H;g.moveTo(x,y);for(let k=0;k<6;k++){x+=(r()-0.5)*30;y+=(r()-0.3)*10;g.lineTo(x,y);}g.stroke();}g.restore();commitPending();render();}
function outlineLayer(l){beginPx(l);const src=cv(ED.W,ED.H);src.getContext('2d').drawImage(l.c,0,0);const sil=cv(ED.W,ED.H),sg=sil.getContext('2d');sg.drawImage(src,0,0);sg.globalCompositeOperation='source-in';sg.fillStyle=ED.col2;sg.fillRect(0,0,ED.W,ED.H);
  const g=l.c.getContext('2d');g.clearRect(0,0,ED.W,ED.H);const R=Math.max(1,Math.round(ED.bsize*0.2));for(let a=0;a<16;a++)g.drawImage(sil,Math.round(Math.cos(a/16*TAU)*R),Math.round(Math.sin(a/16*TAU)*R));g.drawImage(src,0,0);commitPending();render();}

/* ---------------- STICKER panel ---------------- */
function panelStick(p){const l=curLayer();if(!l||l.type!=='paint'){p.appendChild(el('p',{cls:'note',text:'Stickers stamp onto a paint layer.'}));p.appendChild(el('div',{cls:'row'},[btn('+ ADD PAINT LAYER',()=>addPaintLayer(),'y')]));return;}
  p.appendChild(el('p',{cls:'note',text:'Pick a decoration, then tap / drag on the canvas to place it (lift to stamp).'}));
  const g=el('div',{cls:'grid'});for(const k in STICKERS){const c=cv(56,40,true),cg=ctx2(c,true);drawSticker(cg,k,28,20,34,0,ED.col,false,false,true);const b=el('button',{type:'button',cls:ED.stk===k?'on':'',style:'display:flex;flex-direction:column;align-items:center;padding:3px',onclick:()=>{ED.stk=k;ED.tool='sticker';refreshPanel();}},[c,el('span',{style:'font-size:8px',text:k})]);g.appendChild(b);}p.appendChild(g);
  p.appendChild(lbl('COLOR'));p.appendChild(colorRow(c=>{ED.col=c;refreshPanel();},ED.col));
  p.appendChild(slider('SIZE',8,Math.round(ED.H*0.9),1,()=>ED.stkSize,v=>{ED.stkSize=v;}));
  p.appendChild(slider('ROTATE',-3.14,3.14,0.02,()=>ED.stkRot,v=>{ED.stkRot=v;},null,v=>Math.round(v*57.3)+'°'));
  p.appendChild(el('div',{cls:'row'},[btn(ED.stkFx?'MIRROR ⇆ ✔':'MIRROR ⇆',()=>{ED.stkFx=!ED.stkFx;refreshPanel();},ED.stkFx?'on':''),btn(ED.stkFy?'FLIP ⇅ ✔':'FLIP ⇅',()=>{ED.stkFy=!ED.stkFy;refreshPanel();},ED.stkFy?'on':''),btn(ED.stkOut?'OUTLINE ✔':'OUTLINE',()=>{ED.stkOut=!ED.stkOut;refreshPanel();},ED.stkOut?'on':'')]));
  p.appendChild(lbl('SYMMETRY (shared with paint)'));const sy=el('div',{cls:'row'});for(const[k,n]of[['off','OFF'],['x','⇆'],['y','⇅'],['xy','✛']])sy.appendChild(btn(n,()=>{ED.sym=k;refreshPanel();render();},ED.sym===k?'on':''));p.appendChild(sy);}

/* ---------------- LAYERS panel ---------------- */
function panelLayers(p){p.appendChild(el('div',{cls:'row'},[btn('+ PAINT',()=>addPaintLayer(),'y'),btn('+ TEXT',()=>{if(ED.layers.length>=MAX_LAYERS){toastIn('Max '+MAX_LAYERS+' layers');return;}const b=fullBefore();ED.layers.splice(ED.cur+1,0,newLayer('text','LETTERS'));ED.cur++;fullCommit(b);refreshPanel();render();},'y'),
    btn('DUPLICATE',()=>{if(ED.layers.length>=MAX_LAYERS){toastIn('Max '+MAX_LAYERS+' layers');return;}const b=fullBefore();const s=curLayer();const n={id:uid(),name:s.name+' COPY',type:s.type,vis:s.vis,op:s.op};if(s.type==='text'){n.text=JSON.parse(JSON.stringify(s.text));n._dirty=true;}else{n.c=cv(ED.W,ED.H);n.c.getContext('2d').drawImage(s.c,0,0);}ED.layers.splice(ED.cur+1,0,n);ED.cur++;fullCommit(b);refreshPanel();render();}),
    btn('MERGE DOWN',()=>{if(ED.cur<1){toastIn('Nothing below to merge into');return;}const b=fullBefore();const top=curLayer(),bot=ED.layers[ED.cur-1];let dst=bot;if(bot.type==='text'){dst={id:bot.id,name:bot.name,type:'paint',vis:bot.vis,op:1,c:cv(ED.W,ED.H)};const g=dst.c.getContext('2d');g.globalAlpha=bot.op;g.drawImage(layerCanvas(bot),0,0);ED.layers[ED.cur-1]=dst;}
      const g=dst.c.getContext('2d');g.globalAlpha=top.vis?top.op/(dst.op||1):0;g.drawImage(layerCanvas(top),0,0);g.globalAlpha=1;ED.layers.splice(ED.cur,1);ED.cur--;fullCommit(b);refreshPanel();render();}),
    btn('FLIP ALL ⇆',()=>{const b=fullBefore();for(const l of ED.layers){if(l.type==='text'){l.text.flipX=!l.text.flipX;l._dirty=true;}else{const t=cv(ED.W,ED.H);t.getContext('2d').drawImage(l.c,0,0);const g=l.c.getContext('2d');g.clearRect(0,0,ED.W,ED.H);g.save();g.translate(ED.W,0);g.scale(-1,1);g.drawImage(t,0,0);g.restore();}}fullCommit(b);render();}),
    btn('FLIP ALL ⇅',()=>{const b=fullBefore();for(const l of ED.layers){if(l.type==='text'){l.text.flipY=!l.text.flipY;l._dirty=true;}else{const t=cv(ED.W,ED.H);t.getContext('2d').drawImage(l.c,0,0);const g=l.c.getContext('2d');g.clearRect(0,0,ED.W,ED.H);g.save();g.translate(0,ED.H);g.scale(1,-1);g.drawImage(t,0,0);g.restore();}}fullCommit(b);render();})]));
  p.appendChild(el('p',{cls:'note',text:'Top of the list = front. Tap a layer to select it. '+ED.layers.length+'/'+MAX_LAYERS+' layers.'}));
  for(let i=ED.layers.length-1;i>=0;i--){const l=ED.layers[i];const th=cv(64,32,true);ctx2(th,true).drawImage(layerCanvas(l),0,0,64,32);
    const row=el('div',{cls:'lay'+(i===ED.cur?' on':'')},[btn(l.vis?'👁':'—',()=>{const b=fullBefore();l.vis=!l.vis;fullCommit(b);refreshPanel();render();},l.vis?'g':'k','Show/hide'),th,el('div',{cls:'nm',text:(l.type==='text'?'✎ ':'🖌 ')+l.name}),
      btn('▲',()=>{if(i>=ED.layers.length-1)return;const b=fullBefore();ED.layers.splice(i,1);ED.layers.splice(i+1,0,l);ED.cur=i+1;fullCommit(b);refreshPanel();render();},'k','Move up'),
      btn('▼',()=>{if(i<=0)return;const b=fullBefore();ED.layers.splice(i,1);ED.layers.splice(i-1,0,l);ED.cur=i-1;fullCommit(b);refreshPanel();render();},'k','Move down'),
      btn('✕',()=>{if(ED.layers.length<=1){toastIn('A design needs at least one layer');return;}const b=fullBefore();ED.layers.splice(i,1);ED.cur=clamp(ED.cur>=i?ED.cur-1:ED.cur,0,ED.layers.length-1);fullCommit(b);refreshPanel();render();},'r','Delete layer')]);
    row.addEventListener('click',e=>{if(e.target.closest('button'))return;ED.cur=i;refreshPanel();render();});p.appendChild(row);
    if(i===ED.cur){let ob=null;p.appendChild(slider('OPACITY',0,1,0.01,()=>l.op,v=>{l.op=v;},{begin:()=>fullBefore(),end:b=>fullCommit(b)},v=>Math.round(v*100)+'%'));
      const ni=el('input',{type:'text',value:l.name,maxlength:'18'});ni.addEventListener('change',()=>{const b=fullBefore();l.name=(ni.value||'LAYER').toUpperCase().slice(0,18);fullCommit(b);refreshPanel();});void ob;p.appendChild(el('div',{cls:'row'},[el('span',{cls:'note',text:'NAME'}),ni]));}}}

/* ---------------- SAVE panel ---------------- */
function panelSave(p){const cid=curChar();const Z=SIZES[ED.size];
  const ni=el('input',{type:'text',value:ED.name,maxlength:'24',placeholder:'DESIGN NAME'});ni.addEventListener('input',()=>{ED.name=ni.value.slice(0,24);ED.dirty=true;});
  p.appendChild(lbl('NAME'));p.appendChild(el('div',{cls:'row'},[ni]));
  const as=btn(ED.assign?'✔ USE AS '+charName(cid)+"'S "+Z.label+' GRAFFITI':'USE AS '+charName(cid)+"'S "+Z.label+' GRAFFITI',()=>{ED.assign=!ED.assign;refreshPanel();},ED.assign?'on':'');
  p.appendChild(el('div',{cls:'row'},[as]));
  p.appendChild(el('div',{cls:'row'},[btn('💾 SAVE',()=>saveCurrent(false),'g'),btn('SAVE AS COPY',()=>saveCurrent(true),'c'),btn('SAVE & CLOSE',()=>{if(saveCurrent(false))closeEditor(true);},'y')]));
  p.appendChild(el('div',{cls:'row'},[btn('📖 BLACK BOOK',()=>{if(ED.dirty)modal('<p>Leave without saving your changes?</p>',[['LEAVE',()=>{ED.dirty=false;closeEditor(false,true);},'r'],['STAY',null,'k']]);else closeEditor(false,true);},'k'),btn('NEW BLANK',()=>{const go=()=>{const o={size:ED.size,onDone:ED.onDone,title:ED.title,fromBook:ED.fromBook};ED.onDone=null;openEditor(o);};if(ED.dirty)modal('<p>Start over? Unsaved changes will be lost.</p>',[['START OVER',go,'r'],['CANCEL',null,'k']]);else go();},'r')]));
  const used=IDX.length;p.appendChild(el('p',{cls:'note',html:`Saved designs: ${used}/${MAX_DESIGNS}. Designs are stored on this device with full layer data, so you can reopen and edit them any time.<br>${ED.savedId?'This design is saved as <b>'+esc(designMeta(ED.savedId)?designMeta(ED.savedId).name:'')+'</b>.':'Not saved yet.'}`}));}

function layerDataURL(c){const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;let any=false;for(let i=3;i<d.length;i+=4)if(d[i]){any=true;break;}if(!any)return'';let u=c.toDataURL('image/webp',0.9);if(!u.startsWith('data:image/webp'))u=c.toDataURL('image/png');return u;}
function saveCurrent(asCopy){commitPending();const Z=SIZES[ED.size];const isNew=asCopy||!ED.savedId;if(isNew&&IDX.length>=MAX_DESIGNS){modal(`<p>Your Black Book is full (${MAX_DESIGNS} designs). Delete an old design first.</p>`,[['OK',null,'k']]);return false;}
  const id=isNew?uid():ED.savedId;const name=(ED.name||'UNTITLED').toUpperCase().slice(0,24)+(asCopy&&ED.savedId?' COPY':'');
  const proj={v:2,fmt:'jsr',id,name,size:ED.size,W:ED.W,H:ED.H,owner:ED.owner,updated:Date.now(),layers:ED.layers.map(l=>({id:l.id,name:l.name,type:l.type,vis:l.vis,op:l.op,text:l.type==='text'?l.text:undefined,img:l.type==='paint'?layerDataURL(l.c):undefined}))};
  const flat=flatten(Z.tw,Z.th);let tx=flat.toDataURL('image/webp',0.88);if(!tx.startsWith('data:image/webp'))tx=flat.toDataURL('image/png');
  const prevP=localStorage.getItem(K.d+id),prevT=localStorage.getItem(K.tx+id);
  if(!lsSet(K.d+id,proj)||!lsSet(K.tx+id,tx)){/* quota: restore */try{if(prevP!=null)localStorage.setItem(K.d+id,prevP);else lsDel(K.d+id);if(prevT!=null)localStorage.setItem(K.tx+id,prevT);else lsDel(K.tx+id);}catch(e){}
    modal('<p>Not enough storage space on this device to save this design. Delete some old designs from your Black Book, or simplify this one (fewer layers), then try again.</p>',[['OK',null,'k']]);return false;}
  const meta={id,name,size:ED.size,updated:proj.updated,owner:ED.owner};const i=IDX.findIndex(d=>d.id===id);if(i>=0)IDX[i]=meta;else IDX.unshift(meta);lsSet(K.idx,IDX);
  TEX.delete(id);TAGC.clear();ED.savedId=id;ED.name=name;ED.dirty=false;
  if(ED.assign)setSlot(curChar(),ED.size,id);else refreshPieceColors();
  toastIn('Saved "'+name+'"'+(ED.assign?' · now '+charName(curChar())+"'s "+Z.label+' graffiti':''));call('sfx','ok',0.5);if(ED.tab==='save')refreshPanel();return true;}
function closeEditor(saved,toBook){const go=()=>{commitPending();const cb=ED.onDone,id=ED.savedId,fromBook=ED.fromBook||toBook;if(ED._ro)window.removeEventListener('resize',ED._ro);if(ED._rso)ED._rso.disconnect();ED=null;
    if(fromBook&&!cb){openBook();return;}hideRoot();if(cb){try{cb(id||null);}catch(e){console.warn(e);}}};
  if(!saved&&ED.dirty){modal('<p>Close without saving? Your unsaved changes will be lost.</p>',[['DISCARD',go,'r'],['SAVE & CLOSE',()=>{if(saveCurrent(false))go();},'g'],['KEEP EDITING',null,'k']]);return;}go();}

/* ---------------- canvas rendering ---------------- */
let LOOP=0,lastT=0;
function startLoop(){if(LOOP)return;lastT=performance.now();const f=t=>{if(!ED){LOOP=0;return;}LOOP=requestAnimationFrame(f);const dt=Math.min(0.05,(t-lastT)/1000);lastT=t;tickEditor(dt);};LOOP=requestAnimationFrame(f);}
function stopLoop(){if(LOOP)cancelAnimationFrame(LOOP);LOOP=0;}
let needR=false;function render(){needR=true;}
let CHK=null;
function draw(){if(!ED||!ED.ui)return;const c=ED.ui.can,g=ctx2(c,true);g.setTransform(1,0,0,1,0,0);g.fillStyle='#0c0612';g.fillRect(0,0,c.width,c.height);
  const z=ED.zoom,ox=ED.ox,oy=ED.oy;g.save();g.translate(ox,oy);g.scale(z,z);
  if(!CHK){CHK=cv(16,16);const q=CHK.getContext('2d');q.fillStyle='#d8d4e0';q.fillRect(0,0,16,16);q.fillStyle='#f4f2f8';q.fillRect(0,0,8,8);q.fillRect(8,8,8,8);}
  g.fillStyle=g.createPattern(CHK,'repeat');g.fillRect(0,0,ED.W,ED.H);g.imageSmoothingEnabled=z<2;
  for(let i=0;i<ED.layers.length;i++){const l=ED.layers[i];if(!l.vis)continue;g.globalAlpha=l.op;g.drawImage(layerCanvas(l),0,0);
    if(i===ED.cur&&ED.stroke&&ED.stroke.buf){g.globalAlpha=l.op*ED.opac;g.drawImage(ED.stroke.buf,0,0);}}
  g.globalAlpha=1;
  if(ED.tool==='sticker'&&ED.stkPrev){const s=ED.stkPrev;g.globalAlpha=0.75;for(const[x,y,fx,fy]of symPts(s.x,s.y))drawSticker(g,ED.stk,x,y,ED.stkSize,ED.stkRot*(fx!==fy?-1:1),ED.col,ED.stkFx!==fx,ED.stkFy!==fy,ED.stkOut);g.globalAlpha=1;}
  g.lineWidth=1/z;g.strokeStyle='#000';g.strokeRect(0,0,ED.W,ED.H);
  if(ED.sym!=='off'&&(ED.tab==='paint'||ED.tab==='stick')){g.setLineDash([6/z,4/z]);g.strokeStyle='#ff3d9acc';g.beginPath();if(ED.sym!=='y'){g.moveTo(ED.W/2,0);g.lineTo(ED.W/2,ED.H);}if(ED.sym!=='x'){g.moveTo(0,ED.H/2);g.lineTo(ED.W,ED.H/2);}g.stroke();g.setLineDash([]);}
  const tl=curText(),px=(ED.dpr||1)/z;if((ED.tab==='text'||ED.tab==='warp')&&tl&&tl._tc&&tl._tc._boxes){const B=tl._tc._boxes;g.lineWidth=2/z;g.setLineDash([5/z,3/z]);g.strokeStyle='#ffd23d';
    const quad=qq=>{g.beginPath();qq.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.stroke();};
    if(ED.tab==='warp'){const si=selIdx(tl.text).filter(k=>B[k]);if(si.length){for(const k of si){g.strokeStyle=k===ED.selLetter?'#ffd23d':'#ff9ad8';quad(B[k].q);}
        if(si.length>1){const bb=selBox(layoutText(tl.text,ED.W,ED.H),si);if(bb){g.strokeStyle='#4fc3f7';quad([[bb.x0,bb.y0],[bb.x1,bb.y0],[bb.x1,bb.y1],[bb.x0,bb.y1]]);}}}
      else if(tl._tc._wordQ){g.strokeStyle='#4fc3f7';quad(tl._tc._wordQ);}}
    else{const si=ED.selLetter>=0?selFix().filter(k=>B[k]):[];if(si.length){for(const k of si){const b=B[k];g.strokeStyle=k===ED.selLetter?'#ffd23d':'#ff9ad8';g.beginPath();g.arc(b.x,b.y,b.r,0,TAU);g.stroke();}}else if(B.length&&ED.cursor>=B.length){const lb=B[B.length-1];g.setLineDash([]);g.lineWidth=3*px;g.beginPath();g.moveTo(lb.x+lb.r*0.85,lb.y-lb.r*0.7);g.lineTo(lb.x+lb.r*0.85,lb.y+lb.r*0.7);g.stroke();}}
    g.setLineDash([]);
    if(ED.tab==='warp'&&ED.wtool==='warp'){for(const o of warpHandles(layoutText(tl.text,ED.W,ED.H),selIdx(tl.text))){g.fillStyle=o.k==='b'?'#b6ff3a':'#ff3d9a';g.strokeStyle='#000';g.lineWidth=2*px;g.beginPath();if(o.k==='b'){const r=8*px;g.moveTo(o.x,o.y-r);g.lineTo(o.x+r,o.y);g.lineTo(o.x,o.y+r);g.lineTo(o.x-r,o.y);g.closePath();}else g.arc(o.x,o.y,7*px,0,TAU);g.fill();g.stroke();}}}
  if(ED.hover&&(ED.tab==='paint')&&['spray','air','marker','pencil','drip','eraser','splat'].includes(ED.tool)){const hx=ED.hover.x,hy=ED.hover.y,t=ED.tool;const R=Math.max(1,t==='eraser'?ED.esize/2:t==='pencil'?Math.max(1,ED.bsize*0.15):ED.bsize/(t==='spray'||t==='air'?1:2));
    g.lineWidth=1/z;g.strokeStyle='#000';g.beginPath();g.arc(hx,hy,R+1/z,0,TAU);g.stroke();g.strokeStyle='#fff';g.beginPath();g.arc(hx,hy,R,0,TAU);g.stroke();
    /* spray-can / eraser cursor */const cx=hx+R*0.72+3*px,cy=hy-R*0.72-3*px;g.save();g.translate(cx,cy);g.rotate(0.6);g.fillStyle='#000';if(t==='eraser'){g.fillRect(-1*px,-14*px,12*px,16*px);g.fillStyle='#ff9ad8';g.fillRect(0,-13*px,10*px,9*px);g.fillStyle='#fff';g.fillRect(0,-4*px,10*px,5*px);}
    else{g.fillRect(-1*px,-22*px,11*px,21*px);g.fillStyle=ED.col;g.fillRect(0,-17*px,9*px,15*px);g.fillStyle='#ddd';g.fillRect(1*px,-21*px,7*px,4*px);g.fillStyle='#000';g.fillRect(3*px,-24*px,3*px,3*px);}g.restore();}
  g.restore();
  /* live wall preview */const pv=ED.ui.pv,pg=ctx2(pv,true);paintWallFace(pg,'brick',pv.width,pv.height,7);const f=flatten(SIZES[ED.size].tw,SIZES[ED.size].th);const sc=Math.min((pv.width-6)/f.width,(pv.height-6)/f.height);pg.drawImage(f,(pv.width-f.width*sc)/2,(pv.height-f.height*sc)/2,f.width*sc,f.height*sc);}
let pvT=0;
function tickEditor(dt){if(ED.stroke&&ED.stroke.down&&(ED.tool==='spray'||ED.tool==='air')){const s=ED.stroke;s.hold=(s.hold||0)+dt;if(s.hold>0.03){dabAt(s.lx,s.ly,s.hold*14);s.hold=0;needR=true;}}
  if(ED.drips.length){tickDrips(dt);needR=true;}
  if(needR){needR=false;pvT+=dt;draw();}}

/* ---------------- brushes ---------------- */
function symPts(x,y){const W=ED.W,H=ED.H,o=[[x,y,false,false]];if(ED.sym==='x'||ED.sym==='xy')o.push([W-x,y,true,false]);if(ED.sym==='y'||ED.sym==='xy')o.push([x,H-y,false,true]);if(ED.sym==='xy')o.push([W-x,H-y,true,true]);return o;}
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(TAU*v);}
function sprayDab(g,x,y,R,col,op,dens,amt){const n=Math.min(400,Math.round(R*R*0.18*dens*amt+3));g.fillStyle=col;
  g.globalAlpha=op*0.05*amt;const gr=g.createRadialGradient(x,y,0,x,y,R*0.7);gr.addColorStop(0,col);gr.addColorStop(1,col+'00');g.fillStyle=gr;g.beginPath();g.arc(x,y,R*0.7,0,TAU);g.fill();g.fillStyle=col;
  for(let i=0;i<n;i++){const r=Math.abs(gauss())*R*0.42,a=Math.random()*TAU;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;const s=0.5+Math.random()*1.3;g.globalAlpha=op*(0.25+Math.random()*0.6);g.fillRect(px-s/2,py-s/2,s,s);}
  const m=Math.round(n*0.08);for(let i=0;i<m;i++){const r=R*(0.8+Math.random()*0.7),a=Math.random()*TAU;g.globalAlpha=op*0.5*Math.random();const s=0.5+Math.random();g.fillRect(x+Math.cos(a)*r,y+Math.sin(a)*r,s,s);}g.globalAlpha=1;}
function airDab(g,x,y,R,col,op,amt){g.globalAlpha=clamp(op*0.12*amt,0,1);const gr=g.createRadialGradient(x,y,0,x,y,R);gr.addColorStop(0,col);gr.addColorStop(0.5,col+'88');gr.addColorStop(1,col+'00');g.fillStyle=gr;g.beginPath();g.arc(x,y,R,0,TAU);g.fill();g.globalAlpha=1;}
function dabAt(x,y,amt){const l=curLayer();if(!l||l.type!=='paint')return;const g=l.c.getContext('2d');const t=ED.tool;for(const[px,py]of symPts(x,y)){
    if(t==='spray'){sprayDab(g,px,py,ED.bsize,ED.col,ED.opac,ED.dens,amt);if(ED.autoDrip)dripAccum(px,py,amt);}else if(t==='air')airDab(g,px,py,ED.bsize,ED.col,ED.opac,amt*ED.dens);}}
function dripAccum(x,y,amt){const s=ED.stroke;if(!s)return;s.acc=s.acc||{};const k=((x/12)|0)+','+((y/12)|0);s.acc[k]=(s.acc[k]||0)+amt*ED.dens;if(s.acc[k]>9){s.acc[k]=0;spawnDrip(x+(Math.random()-0.5)*ED.bsize*0.5,y+ED.bsize*0.2,Math.max(1,ED.bsize*0.09),ED.col);}}
function spawnDrip(x,y,w,col){if(ED.drips.length>60)return;const l=curLayer();if(!l||l.type!=='paint')return;ED.drips.push({lid:l.id,x,y,w,col,v:20+Math.random()*30,life:0.6+Math.random()*1.4,op:ED.opac});}
function tickDrips(dt){for(let i=ED.drips.length-1;i>=0;i--){const d=ED.drips[i];const l=ED.layers.find(q=>q.id===d.lid);if(!l||!l.c){ED.drips.splice(i,1);continue;}const g=l.c.getContext('2d');const y0=d.y;d.y+=d.v*dt;d.v*=0.985;d.life-=dt;
  g.globalAlpha=d.op;g.fillStyle=d.col;g.fillRect(d.x-d.w/2,y0,d.w,d.y-y0+0.5);if(d.life<=0||d.y>ED.H){g.beginPath();g.arc(d.x,d.y,d.w*0.8,0,TAU);g.fill();ED.drips.splice(i,1);}g.globalAlpha=1;}}
function lineSeg(g,x0,y0,x1,y1,w,col,op,cap){g.globalAlpha=op;g.strokeStyle=col;g.lineWidth=w;g.lineCap=cap||'round';g.lineJoin='round';g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();g.globalAlpha=1;}
function strokeTo(x,y){const s=ED.stroke,l=curLayer();if(!s||!l||l.type!=='paint')return;const t=ED.tool;const x0=s.lx,y0=s.ly;const dist=D(x0,y0,x,y);
  if(t==='spray'||t==='air'){const step=Math.max(1,ED.bsize*0.3);const n=Math.max(1,Math.ceil(dist/step));for(let i=1;i<=n;i++){const k=i/n;dabAt(x0+(x-x0)*k,y0+(y-y0)*k,0.6);}}
  else if(t==='marker'||t==='drip'){const bg=s.buf.getContext('2d');for(const[a,b]of pairs(x0,y0,x,y))lineSeg(bg,a[0],a[1],b[0],b[1],ED.bsize,ED.col,1);if(t==='drip'){s.dd=(s.dd||0)+dist;if(s.dd>ED.bsize*1.2){s.dd=0;for(const[px,py]of symPts(x,y))if(Math.random()<0.8)spawnDripStroke(px,py+ED.bsize*0.3);}}}
  else if(t==='pencil'){const g=l.c.getContext('2d');for(const[a,b]of pairs(x0,y0,x,y))lineSeg(g,a[0],a[1],b[0],b[1],Math.max(1,ED.bsize*0.15),ED.col,ED.opac);}
  else if(t==='eraser'){const g=l.c.getContext('2d');g.save();g.globalCompositeOperation='destination-out';for(const[a,b]of pairs(x0,y0,x,y))lineSeg(g,a[0],a[1],b[0],b[1],ED.esize,'#000',ED.opac);g.restore();}
  else if(t==='splat'){s.dd=(s.dd||0)+dist;if(s.dd>ED.bsize*1.5){s.dd=0;for(const[px,py]of symPts(x,y))splatAt(l.c.getContext('2d'),px,py);}}
  s.lx=x;s.ly=y;render();}
function spawnDripStroke(x,y){const l=curLayer();if(!l)return;if(ED.drips.length>60)return;ED.drips.push({lid:l.id,x,y,w:Math.max(1,ED.bsize*0.35),col:ED.col,v:25+Math.random()*30,life:0.6+Math.random()*1.6,op:ED.opac});}
function pairs(x0,y0,x1,y1){const a=symPts(x0,y0),b=symPts(x1,y1);return a.map((p,i)=>[p,b[i]]);}
function splatAt(g,x,y){const R=ED.bsize*0.8;g.fillStyle=ED.col;g.globalAlpha=ED.opac;g.beginPath();const n=14;for(let k=0;k<n;k++){const a=k/n*TAU,r=R*(0.55+Math.random()*0.6);g.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}g.closePath();g.fill();
  const m=8+Math.round(Math.random()*10);for(let i=0;i<m;i++){const a=Math.random()*TAU,d=R*(1+Math.random()*1.8),s=Math.max(0.6,R*(0.06+Math.random()*0.16));g.beginPath();g.arc(x+Math.cos(a)*d,y+Math.sin(a)*d,s,0,TAU);g.fill();}g.globalAlpha=1;
  if(ED.autoDrip&&Math.random()<0.6)ED.drips.push({lid:curLayer().id,x:x+(Math.random()-0.5)*R,y:y+R*0.4,w:Math.max(1,R*0.18),col:ED.col,v:25+Math.random()*25,life:0.5+Math.random(),op:ED.opac});}
function bucketFill(x,y){const l=curLayer();if(!l||l.type!=='paint')return;x|=0;y|=0;if(x<0||y<0||x>=ED.W||y>=ED.H)return;beginPx(l);const W=ED.W,H=ED.H;
  const comp=flatten().getContext('2d').getImageData(0,0,W,H).data;const g=l.c.getContext('2d');const id=g.getImageData(0,0,W,H);const d=id.data;
  const i0=(y*W+x)*4;const sr=comp[i0],sg=comp[i0+1],sb=comp[i0+2],sa=comp[i0+3];const tol=48;const same=i=>{const a=comp[i+3];if(sa<20&&a<20)return true;return Math.abs(comp[i]-sr)+Math.abs(comp[i+1]-sg)+Math.abs(comp[i+2]-sb)+Math.abs(a-sa)<=tol*1.6;};
  const mask=new Uint8Array(W*H);const st=[x,y];while(st.length){const yy=st.pop(),xx=st.pop();let xl=xx;while(xl>=0&&!mask[yy*W+xl]&&same((yy*W+xl)*4))xl--;xl++;let xr=xx;while(xr<W&&!mask[yy*W+xr]&&same((yy*W+xr)*4))xr++;
    for(let k=xl;k<xr;k++){mask[yy*W+k]=1;if(yy>0&&!mask[(yy-1)*W+k]&&same(((yy-1)*W+k)*4))st.push(k,yy-1);if(yy<H-1&&!mask[(yy+1)*W+k]&&same(((yy+1)*W+k)*4))st.push(k,yy+1);}}
  /* grow 1px into anti-aliased edges */const m2=mask.slice();for(let yy=1;yy<H-1;yy++)for(let xx=1;xx<W-1;xx++){const q=yy*W+xx;if(!mask[q]&&(mask[q-1]||mask[q+1]||mask[q-W]||mask[q+W]))m2[q]=1;}
  let y0=H,y1=0;for(let q=0;q<W*H;q++)if(m2[q]){const yy=(q/W)|0;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}
  const c1=hexRgb(ED.col),c2=hexRgb(ED.col2);const op=ED.opac;
  for(let q=0;q<W*H;q++){if(!m2[q])continue;const yy=(q/W)|0;let c=c1;if(ED.fillGrad){const k=y1>y0?(yy-y0)/(y1-y0):0;c=[c1[0]+(c2[0]-c1[0])*k,c1[1]+(c2[1]-c1[1])*k,c1[2]+(c2[2]-c1[2])*k];}
    const i=q*4,da=d[i+3]/255,a=op+da*(1-op);if(a<=0)continue;d[i]=(c[0]*op+d[i]*da*(1-op))/a;d[i+1]=(c[1]*op+d[i+1]*da*(1-op))/a;d[i+2]=(c[2]*op+d[i+2]*da*(1-op))/a;d[i+3]=a*255;}
  g.putImageData(id,0,0);commitPending();render();}
function pickColor(x,y){x|=0;y|=0;if(x<0||y<0||x>=ED.W||y>=ED.H)return;const d=flatten().getContext('2d').getImageData(x,y,1,1).data;if(d[3]<10){toastIn('Nothing painted there');return;}const c=rgbHex(d[0],d[1],d[2]);if(ED.which)ED.col2=c;else ED.col=c;if(!ED.recent.includes(c)){ED.recent.unshift(c);ED.recent.length=Math.min(8,ED.recent.length);}ED.tool=ED.ptool=ED.prevTool||'spray';toastIn('Picked '+c);refreshPanel();}

/* ---------------- pointer input ---------------- */
function bindCanvas(c){const P=new Map();let pinch=null;
  const doc=e=>{const r=c.getBoundingClientRect();const sx=(e.clientX-r.left)*(c.width/r.width),sy=(e.clientY-r.top)*(c.height/r.height);return{sx,sy,x:(sx-ED.ox)/ED.zoom,y:(sy-ED.oy)/ED.zoom};};
  c.addEventListener('pointerdown',e=>{e.preventDefault();try{c.setPointerCapture(e.pointerId);}catch(_){}const q=doc(e);P.set(e.pointerId,q);
    if(P.size===2){/* switch to pinch: cancel stroke in progress */cancelStroke();if(ED.drag){const tl=curText();if(tl&&ED.drag.b){tl.text=JSON.parse(ED.drag.b.s);tl._dirty=true;}ED.drag=null;refreshPanel();}const[a,b]=[...P.values()];pinch={d:D(a.sx,a.sy,b.sx,b.sy),mx:(a.sx+b.sx)/2,my:(a.sy+b.sy)/2,z:ED.zoom,ox:ED.ox,oy:ED.oy};return;}
    if(P.size>2)return;if(e.button===1||e.button===2||ED.tool==='hand'||ED.handOn){ED.pan={sx:q.sx,sy:q.sy,ox:ED.ox,oy:ED.oy};return;}startTool(q);});
  c.addEventListener('pointermove',e=>{const q=doc(e);ED.hover=q;if(!P.has(e.pointerId)){if(ED.tab==='paint')render();if(ED.tool==='sticker'){ED.stkPrev={x:q.x,y:q.y};render();}return;}P.set(e.pointerId,q);
    if(pinch&&P.size>=2){const[a,b]=[...P.values()];const d=D(a.sx,a.sy,b.sx,b.sy),mx=(a.sx+b.sx)/2,my=(a.sy+b.sy)/2;const z=clamp(pinch.z*d/Math.max(10,pinch.d),0.2,16);const u=(pinch.mx-pinch.ox)/pinch.z,v=(pinch.my-pinch.oy)/pinch.z;ED.zoom=z;ED.ox=mx-u*z;ED.oy=my-v*z;clampPan();ED.zl=-1;updZoom();render();return;}
    if(ED.pan){ED.ox=ED.pan.ox+(q.sx-ED.pan.sx);ED.oy=ED.pan.oy+(q.sy-ED.pan.sy);clampPan();render();return;}moveTool(q);});
  const up=e=>{if(!P.has(e.pointerId))return;P.delete(e.pointerId);if(pinch){if(P.size<2)pinch=null;if(ED.drag&&ED.tab==='warp')ED.drag=null;return;}if(ED.pan){ED.pan=null;return;}endTool(doc(e));};
  c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);c.addEventListener('pointerleave',()=>{ED.hover=null;if(ED.tool==='sticker'&&!ED.stroke){ED.stkPrev=null;}render();});
  c.addEventListener('wheel',e=>{e.preventDefault();const q=doc(e);zoomBy(e.deltaY<0?1.15:1/1.15,q.sx,q.sy);},{passive:false});
  c.addEventListener('contextmenu',e=>e.preventDefault());}
function startTool(q){const t=ED.tool,l=curLayer();if(ED.tab==='warp'){warpDown(q);return;}if(t==='none'||t==='warp')return;
  if(t==='move'){const tl=curText();if(!tl)return;layerCanvas(tl);const bx=tl._tc._boxes||[];let hit=-1,bd=1e9;bx.forEach((b,i)=>{const d=D(b.x,b.y,q.x,q.y);if(d<b.r*1.1&&d<bd){bd=d;hit=i;}});
    let added=false;if(hit>=0&&!(ED.selLetter>=0&&selFix().includes(hit))){if(ED.multi&&ED.wmode==='one')selToggle(hit);else selOnly(hit);added=true;if(ED.tab==='text')ED.cursor=hit;refreshPanel();}
    ED.drag={b:textBefore(tl),i:hit,x:q.x,y:q.y,moved:false,added};render();return;}
  if(!l||l.type!=='paint'){toastIn('Select a paint layer first (LAYERS tab)');return;}
  if(t==='bucket'){bucketFill(q.x,q.y);return;}if(t==='picker'){pickColor(q.x,q.y);return;}
  if(t==='sticker'){ED.stkPrev={x:q.x,y:q.y};ED.stroke={down:true,stk:true};render();return;}
  beginPx(l);ED.stroke={down:true,lx:q.x,ly:q.y,buf:(t==='marker'||t==='drip')?cv(ED.W,ED.H):null};
  if(t==='spray'||t==='air')dabAt(q.x,q.y,1);else if(t==='splat'){for(const[px,py]of symPts(q.x,q.y))splatAt(l.c.getContext('2d'),px,py);}else if(t==='pencil'||t==='eraser'||t==='marker'||t==='drip')strokeTo(q.x+0.01,q.y+0.01);render();}
function moveTool(q){const t=ED.tool;if(ED.tab==='warp'){warpMove(q);return;}if(t==='move'&&ED.drag){const tl=curText();if(!tl)return;const dx=q.x-ED.drag.x,dy=q.y-ED.drag.y;ED.drag.x=q.x;ED.drag.y=q.y;ED.drag.moved=true;const T=tl.text;const sx=T.flipX?-1:1,sy=T.flipY?-1:1;
    if(ED.drag.i>=0){const sel=ED.selLetter>=0?selFix():[];for(const k of sel.includes(ED.drag.i)?sel:[ED.drag.i]){const L=T.letters[k];if(!L)continue;L.dx+=dx*sx;L.dy+=dy*sy;}}else{T.x+=dx*sx;T.y+=dy*sy;}tl._dirty=true;render();return;}
  if(t==='sticker'&&ED.stroke){ED.stkPrev={x:q.x,y:q.y};render();return;}if(ED.stroke&&ED.stroke.down)strokeTo(q.x,q.y);}
function endTool(q){const t=ED.tool;if(ED.tab==='warp'){warpUp(q);return;}if(t==='move'&&ED.drag){const tl=curText();if(tl&&ED.drag.moved)textCommit(ED.drag.b);if(!ED.drag.moved&&ED.drag.i<0&&(ED.selLetter>=0||ED.tab==='text')){selAll();if(ED.tab==='text'&&tl)ED.cursor=[...tl.text.str].length;refreshPanel();}
  else if(!ED.drag.moved&&ED.drag.i>=0&&!ED.drag.added){/* tap on a selected letter: MULTI drops it, otherwise it becomes the only one */if(ED.multi)selToggle(ED.drag.i);else selOnly(ED.drag.i);if(ED.tab==='text'&&tl)ED.cursor=ED.selLetter>=0?ED.selLetter:[...tl.text.str].length;refreshPanel();render();}ED.drag=null;fullQuality();return;}
  const s=ED.stroke;if(!s)return;ED.stroke=null;const l=curLayer();
  if(s.stk){if(l&&l.type==='paint'){beginPx(l);const g=l.c.getContext('2d');for(const[x,y,fx,fy]of symPts(q.x,q.y))drawSticker(g,ED.stk,x,y,ED.stkSize,ED.stkRot*(fx!==fy?-1:1),ED.col,ED.stkFx!==fx,ED.stkFy!==fy,ED.stkOut);commitPending();call('sfx','pick',0.3);}ED.stkPrev=null;render();return;}
  if(s.buf&&l&&l.c){const g=l.c.getContext('2d');g.globalAlpha=ED.opac;g.drawImage(s.buf,0,0);g.globalAlpha=1;}
  if(!ED.drips.length)commitPending();render();}
function cancelStroke(){const s=ED.stroke;if(!s)return;ED.stroke=null;if(s.stk){ED.stkPrev=null;return;}/* roll back the partial stroke */const e=ED.pending;if(e){const l=ED.layers.find(q=>q.id===e.lid);if(l)l.c.getContext('2d').putImageData(e.before,0,0);ED.pending=null;ED.hist.pop();updHist();}ED.drips.length=0;render();}

/* =====================================================================
   BLACK BOOK (library + character slots + settings)
   ===================================================================== */
function openBook(opts){opts=opts||{};ensureUI();showRoot();const u=UI;u.view='book';u.root.innerHTML='';const cid=curChar();
  u.root.appendChild(el('div',{cls:'gh'},[btn('✕',()=>hideRoot(),'x','Close'),el('div',{cls:'gt',text:'BLACK BOOK'}),el('span',{cls:'badge',text:charName(cid)})]));
  const B=el('div',{cls:'book'});u.root.appendChild(B);
  B.appendChild(el('div',{cls:'h2',text:charName(cid)+"'S GRAFFITI"}));
  B.appendChild(el('p',{cls:'note',text:'Each size slot is what you spray on walls of that size. Empty slots use the TSR logo.'}));
  const sl=el('div',{cls:'cards'});for(const sz of SIZE_KEYS){const id=slotOf(cid,sz);const m=id&&designMeta(id);
    sl.appendChild(el('div',{cls:'card'},[el('div',{},[el('span',{cls:'badge',text:SIZES[sz].label}),' ',el('span',{cls:'nm2',text:m?m.name:'TSR LOGO (DEFAULT)'})]),el('div',{cls:'thumb'},[el('img',{src:texSrc(id),alt:''})]),
      el('div',{cls:'row'},[btn('CHANGE',()=>pickForSlot(cid,sz),'c'),m?btn('EDIT',()=>{hideRoot();openEditor({designId:id,fromBook:true});},''):null,m?btn('USE TSR',()=>{setSlot(cid,sz,null);openBook();},'k'):btn('CREATE',()=>{openEditor({size:sz,fromBook:true});},'y')])]));}
  B.appendChild(sl);
  B.appendChild(el('div',{cls:'h2',text:'NEW DESIGN'}));B.appendChild(el('div',{cls:'row'},SIZE_KEYS.map(sz=>btn('+ '+SIZES[sz].label+' ('+SIZES[sz].W+'×'+SIZES[sz].H+')',()=>{if(IDX.length>=MAX_DESIGNS){modal(`<p>Black Book full (${MAX_DESIGNS}). Delete a design first.</p>`,[['OK',null,'k']]);return;}openEditor({size:sz,fromBook:true});},'y'))));
  B.appendChild(el('div',{cls:'h2',text:'SAVED DESIGNS ('+IDX.length+'/'+MAX_DESIGNS+')'}));
  if(!IDX.length)B.appendChild(el('p',{cls:'note',text:'No designs yet. Create one above.'}));
  const cards=el('div',{cls:'cards'});for(const m of IDX){const users=Object.keys(SLOTS).filter(k=>SIZE_KEYS.some(s=>SLOTS[k][s]===m.id));
    cards.appendChild(el('div',{cls:'card'},[el('div',{},[el('span',{cls:'badge',text:SIZES[m.size]?SIZES[m.size].label:m.size}),' ',el('span',{cls:'nm2',text:m.name})]),el('div',{cls:'thumb'},[el('img',{src:texSrc(m.id),alt:''})]),
      el('div',{cls:'note',text:'BY '+charName(m.owner)+(users.length?' · USED BY '+users.map(charName).join(', '):'')}),
      el('div',{cls:'row'},[btn('EDIT',()=>{openEditor({designId:m.id,fromBook:true});}),btn('USE',()=>{setSlot(cid,m.size,m.id);toastIn(charName(cid)+"'s "+SIZES[m.size].label+' graffiti set');openBook();},'g'),btn('COPY',()=>dupDesign(m.id),'c'),btn('DEL',()=>modal('<p>Delete "'+esc(m.name)+'"? Walls already showing it switch to the owner\'s current graffiti.</p>',[['DELETE',()=>{delDesign(m.id);openBook();},'r'],['CANCEL',null,'k']]),'r')])]));}
  B.appendChild(cards);
  B.appendChild(el('div',{cls:'h2',text:'STREETS'}));const live=Object.keys(TAGS).length;
  B.appendChild(el('p',{cls:'note',text:`Live tags on Tempe walls: ${live}. Total tags sprayed: ${tagTotal()}. Cobra Doug starts scrubbing a tag after this much play time:`}));
  const cr=el('div',{cls:'row'});for(const[s,l]of[[60,'1 MIN'],[180,'3 MIN'],[300,'5 MIN'],[600,'10 MIN'],[1200,'20 MIN']])cr.appendChild(btn(l,()=>{CFG.cleanAfter=s;lsSet(K.cfg,CFG);openBook();},CFG.cleanAfter===s?'on':''));B.appendChild(cr);
  let bytes=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('tsr_graf'))bytes+=(localStorage.getItem(k)||'').length;}}catch(e){}
  B.appendChild(el('p',{cls:'note',text:'Graffiti storage used on this device: '+(bytes/1024).toFixed(0)+' KB'}));}
function pickForSlot(cid,sz){const list=IDX.filter(m=>m.size===sz);const html='<p>Choose '+charName(cid)+"'s "+SIZES[sz].label+' graffiti</p><div class="grafpick">'+['tsr'].concat(list.map(m=>m.id)).map(id=>`<button type="button" data-g="${esc(id)}"><div class="th"><img src="${texSrc(id==='tsr'?null:id)}"></div><small>${esc(id==='tsr'?'TSR LOGO':designMeta(id).name)}</small></button>`).join('')+'</div>';
  const m=modal(html,[['CANCEL',null,'k']]);m.querySelectorAll('[data-g]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.g;setSlot(cid,sz,id==='tsr'?null:id);m.remove();openBook();}));}
function dupDesign(id){if(IDX.length>=MAX_DESIGNS){modal(`<p>Black Book full (${MAX_DESIGNS}). Delete a design first.</p>`,[['OK',null,'k']]);return null;}const P=lsGet(K.d+id,null),t=lsGet(K.tx+id,null),m=designMeta(id);if(!P||!m)return null;
  const nid=uid();P.id=nid;P.name=(m.name+' COPY').slice(0,24);P.updated=Date.now();if(!lsSet(K.d+nid,P)||!lsSet(K.tx+nid,t)){lsDel(K.d+nid);lsDel(K.tx+nid);modal('<p>Not enough storage space to duplicate. Delete a design first.</p>',[['OK',null,'k']]);return null;}
  IDX.unshift({id:nid,name:P.name,size:m.size,updated:P.updated,owner:m.owner});lsSet(K.idx,IDX);if(UI&&UI.view==='book')openBook();return nid;}
function delDesign(id){IDX=IDX.filter(m=>m.id!==id);lsSet(K.idx,IDX);lsDel(K.d+id);lsDel(K.tx+id);TEX.delete(id);for(const k in SLOTS)for(const s of SIZE_KEYS)if(SLOTS[k][s]===id)delete SLOTS[k][s];lsSet(K.slots,SLOTS);
  /* walls keep their tag but fall back to the owner's current graffiti */for(const w in TAGS)if(TAGS[w].d===id)TAGS[w].d='char';saveTags();TAGC.clear();refreshPieceColors();}

/* =====================================================================
   WORLD: tag walls, tags, Cobra Doug cleaning
   ===================================================================== */
let WALLS=null,WGRID=null;
let TAGS=lsGet(K.tags,{});if(!TAGS||typeof TAGS!=='object'||Array.isArray(TAGS))TAGS={};
let CLOCK=+lsGet(K.clock,0)||0;let clockSaveT=0;
function saveTags(){lsSet(K.tags,TAGS);}
function tagTotal(){return+lsGet('tsr_graf_total',0)||0;}
function unlocked(){return!!lsGet(K.on,0);}
const SIGN_TXT='CALL DAFI!';
/* hand-placed graffiti spots */
const WALL_PLACED=[{id:'w1912_884',x:1922,y:884,size:'xl',kind:'sign',legs:4,name:'CALL DAFI! SIGN'},{x:2035,y:790,size:'large',scale:0.87,kind:'brick',name:'LAWN WALL BY MULLETT'},{x:1783,y:450,size:'small',kind:'elec',name:'ELECTRICAL BOX BY DUMB BROTHERS'},{x:1471,y:428,size:'xl',kind:'sign',legs:4,name:'CALL DAFI! SIGN · MARINA HEIGHTS 2'},{x:137,y:442,size:'large',scale:0.75,kind:'brick',name:'LAWN WALL BY THE ARTS CENTER'},{x:1640,y:1844,size:'small',kind:'elec',name:'ELECTRICAL BOX BY THE BANK'}];
const WALL_KINDS=['brick','brick','concrete','cinder','stucco','plywood','shutter'];
function genWalls(){const buildings=LV.buildings||[];const isFree=g_('isFree'),inB=g_('inBuilding'),onRoad=g_('onRoad'),onStreet=g_('onStreet'),inWater=g_('inWater');const W=2400,H=2160;
  if(!isFree||!buildings.length||!LV.ground)return null;let ctags=[];try{const f=g_('cobraBrickSpots');ctags=f?f():[];}catch(e){}const COBRA={tags:ctags};const AP=G('APRONS')||[];const r=rng(90210);const gctx=LV.ground.getContext('2d');const out=[];
  /* owner: all auto-placed walls removed; walls are now placed by hand, one by one, in WALL_PLACED: {x,y,size:'small'|'large'(medium)|'xl'(large),kind,name} */
  const want=[];for(const w of WALL_PLACED)out.push(Object.assign({id:'w'+w.x+'_'+w.y,kind:'brick',seed:(w.x*31+w.y)|0,name:'GRAFFITI WALL'},w));
  const bdist=(x,y)=>{let best=1e9,bb=null;for(const b of buildings){if(b.trip||b.hwHidden)continue;const dx=Math.max(b.x-x,0,x-(b.x+b.w)),dy=Math.max(b.y-y,0,y-(b.y+b.h));const d=Math.hypot(dx,dy);if(d<best){best=d;bb=b;}}return[best,bb];};
  const ok=(x,y,sz,pass)=>{const Z=SIZES[sz],hw=Z.ww/2+8;if(x<100||x>W-100||y<140||y>H-80)return false;if(!isFree(x,y,4))return false;if(onRoad&&onRoad(x,y+10))return false;
    for(const w of out)if(D(w.x,w.y,x,y)<170)return false;for(const t of(COBRA.tags||[]))if(D(t.x,t.y,x,y)<80)return false;
    for(const b of buildings){if(b.dc&&D(b.dc.x,b.dc.y,x,y)<64)return false;if(b.doorOut&&D(b.doorOut.x,b.doorOut.y,x,y)<64)return false;}
    for(const a of AP)if(x+hw>a[0]&&x-hw<a[0]+a[2]&&y+20>a[1]&&y-Z.wh-10<a[1]+a[3])return false;
    for(let xx=x-hw;xx<=x+hw;xx+=6)for(const yy of[y-Z.wh-8,y-Z.wh/2,y-3,y+8,y+18]){if(!isFree(xx,yy,3))return false;if(inB&&inB(xx,yy))return false;if(onRoad&&onRoad(xx,yy))return false;if(onStreet&&onStreet(xx,yy))return false;if(inWater&&inWater(xx,yy))return false;}
    const[bd]=bdist(x,y);if(pass===0&&(bd<10||bd>64))return false;if(bd<8)return false;
    /* stand on pavement / alleys, never across sports-field lines or the middle of a lawn */
    try{const gx=Math.round(x-hw),gy=Math.round(y-Z.wh-6),gw=Math.round(hw*2),gh=Math.round(Z.wh+26);const d=gctx.getImageData(gx,gy,gw,gh).data;let n=0,gray=0,white=0,green=0;
      for(let yy=0;yy<gh;yy+=3)for(let xx=0;xx<gw;xx+=3){const i=(yy*gw+xx)*4,R=d[i],G2=d[i+1],B=d[i+2],mx=Math.max(R,G2,B),mn=Math.min(R,G2,B);n++;if(mn>222)white++;else if(mx-mn<30)gray++;if(G2>R+14&&G2>B+10)green++;}
      if(white/n>0.01)return false;if(pass===0&&gray/n<0.7)return false;if(green/n>0.55)return false;}catch(e){}
    return true;};
  for(const sz of want){let placed=false;for(const pass of[0,1]){for(let k=0;k<700&&!placed;k++){const x=Math.round(120+r()*(W-240)),y=Math.round(160+r()*(H-260));if(ok(x,y,sz,pass)){const[,bb]=bdist(x,y);out.push({id:'w'+x+'_'+y,x,y,size:sz,kind:WALL_KINDS[(r()*WALL_KINDS.length)|0],seed:(r()*1e6)|0,name:bb&&bb.name?'WALL BY '+String(bb.name).toUpperCase():'BACK ALLEY WALL'});placed=true;}}if(placed)break;}}
  WGRID=new Map();for(const w of out){const Z=SIZES[w.size];const x0=Math.floor((w.x-Z.ww/2-8)/64),x1=Math.floor((w.x+Z.ww/2+8)/64),y0=Math.floor((w.y-16)/64),y1=Math.floor((w.y+8)/64);for(let gx=x0;gx<=x1;gx++)for(let gy=y0;gy<=y1;gy++){const k=gx+','+gy;if(!WGRID.has(k))WGRID.set(k,[]);WGRID.get(k).push(w);}}
  return out;}/* saved tags are kept, so a wall placed back at the same spot keeps its piece */
function walls(){if(!WALLS&&LV.gameMode==='story'){const w=genWalls();if(w)WALLS=w;}return WALLS||[];}
function wallsActive(){return unlocked()&&LV.gameMode==='story';}
function wallHit(x,y){if(!WGRID)return null;const l=WGRID.get(Math.floor(x/64)+','+Math.floor(y/64));if(!l)return null;for(const w of l){const hw=SIZES[w.size].ww/2+2;if(x>w.x-hw&&x<w.x+hw&&y>w.y-7&&y<w.y+2)return w;}return null;}
function wallCross(ox,oy,nx,ny){if(!WGRID)return null;const l=WGRID.get(Math.floor(nx/64)+','+Math.floor(ny/64));if(!l)return null;for(const w of l){const hw=SIZES[w.size].ww/2+2;const top=w.y-7,bot=w.y+2;if(((oy<=top&&ny>=bot)||(oy>=bot&&ny<=top))&&nx>w.x-hw&&nx<w.x+hw)return w;}return null;}

/* ---- wall art ---- */
function paintWallFace(g,kind,W,H,seed){const r=rng(seed||1);const R=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};g.setTransform(1,0,0,1,0,0);
  if(kind==='elec'){/* utility / electrical box: painted steel, panel seams, vents, a warning sticker */R(0,0,W,H,'#7a8a7e');for(let i=0;i<W*H/14;i++)R(r()*W,r()*H,1,1,r()<0.5?'#6e7e72':'#86968a');
    R(Math.round(W/2),0,1,H,'#56645a');R(0,0,W,1,'#9aaa9e');for(let k=0;k<4;k++)R(Math.round(W*0.12),Math.round(H*0.14)+k*Math.max(2,Math.round(H*0.06)),Math.round(W*0.26),1,'#4a564e');
    R(Math.round(W*0.62),Math.round(H*0.18),Math.max(4,Math.round(W*0.22)),Math.max(3,Math.round(H*0.14)),'#ffc23d');R(Math.round(W*0.62)+1,Math.round(H*0.18)+1,Math.max(2,Math.round(W*0.22))-2,1,'#14101a');
    R(Math.round(W/2)-3,Math.round(H*0.55),2,Math.max(3,Math.round(H*0.12)),'#3a443e');R(Math.round(W/2)+2,Math.round(H*0.55),2,Math.max(3,Math.round(H*0.12)),'#3a443e');}
  else   if(kind==='sign'){/* owner: red board, white letters */R(0,0,W,H,'#c8202a');for(let i=0;i<W*H/16;i++)R(r()*W,r()*H,1,1,r()<0.5?'#b81a24':'#d42a34');R(0,0,W,Math.max(1,H/24),'#e04a52');R(0,H-Math.max(1,H/24),W,Math.max(1,H/24),'#8a1018');
    g.fillStyle='#ffffff';g.textAlign='center';g.textBaseline='middle';let fs=Math.round(H*0.5);g.font=`900 ${fs}px "Arial Black", Impact, sans-serif`;while(g.measureText(SIGN_TXT).width>W*0.9&&fs>6){fs--;g.font=`900 ${fs}px "Arial Black", Impact, sans-serif`;}g.fillText(SIGN_TXT,W/2,H/2+1);}
  else if(kind==='brick'){R(0,0,W,H,'#b5654a');const bh=Math.max(4,Math.round(H/7)),bw=bh*2.4;for(let y=0,row=0;y<H;y+=bh,row++){for(let x=-(row%2)*bw/2;x<W;x+=bw){R(x+1,y+1,bw-2,bh-2,['#b5654a','#a85a40','#c0704f','#9e5440'][(r()*4)|0]);}R(0,y,W,1,'#7a3e2c');}}
  else if(kind==='concrete'){R(0,0,W,H,'#a8a49c');for(let i=0;i<W*H/14;i++)R(r()*W,r()*H,1,1,r()<0.5?'#9a968e':'#b8b4ac');const pw=Math.round(W/3);for(let x=pw;x<W;x+=pw)R(x,0,1,H,'#86827a');R(0,Math.round(H*0.62),W,1,'#8e8a82');g.fillStyle='rgba(60,50,40,0.18)';for(let i=0;i<3;i++)g.fillRect(r()*W,H*0.6,2+r()*3,H*0.4);}
  else if(kind==='cinder'){R(0,0,W,H,'#9a9690');const bh=Math.max(5,Math.round(H/5)),bw=bh*2;for(let y=0,row=0;y<H;y+=bh,row++)for(let x=-(row%2)*bw/2;x<W;x+=bw)R(x+1,y+1,bw-2,bh-2,['#c4bcb0','#bab2a6','#ccc4b8'][(r()*3)|0]);}
  else if(kind==='stucco'){R(0,0,W,H,'#d8c3a0');for(let i=0;i<W*H/8;i++)R(r()*W,r()*H,1,1,r()<0.5?'#c8b290':'#e6d4b4');R(0,H-3,W,3,'#b89a74');}
  else if(kind==='plywood'){R(0,0,W,H,'#c89a5a');const pw=Math.round(W/4);for(let x=0;x<W;x+=pw){R(x,0,1,H,'#8a6230');for(let k=0;k<5;k++)R(x+2+r()*(pw-4),r()*H,r()*8+2,1,'#b6884a');R(x+3,3,1,1,'#555');R(x+3,H-4,1,1,'#555');}}
  else{R(0,0,W,H,'#8a9298');const rh=Math.max(3,Math.round(H/9));for(let y=0;y<H;y+=rh){R(0,y,W,1,'#6a7278');R(0,y+1,W,1,'#a2aab0');}R(0,H-4,W,4,'#5a6268');}
  g.fillStyle='rgba(0,0,0,0.12)';g.fillRect(0,H-2,W,2);}
const BASEC=new Map();
const CAP=5;
function wallBase(w){let c=BASEC.get(w.id);if(c)return c;const Z=SIZES[w.size],cap=0;/* owner: every spot is all face, no top cap, so the piece reaches the top */c=cv(Z.ww*2,(Z.wh+cap)*2);const g=c.getContext('2d');const W2=c.width,H2=c.height,ch=cap*2;
  const cc={elec:'#5e6c62',sign:'#8a1018',brick:'#9a9894',concrete:'#d4d0c8',cinder:'#e0d8cc',stucco:'#e4d0ac',plywood:'#ecc88a',shutter:'#c0c8ce'}[w.kind]||'#aaa';
  g.fillStyle=cc;g.fillRect(0,0,W2,ch);const r=rng(w.seed+3);g.fillStyle='rgba(0,0,0,0.07)';for(let i=0;i<W2*ch/10;i++)g.fillRect(r()*W2,r()*ch,1,1);
  g.fillStyle='rgba(255,255,255,0.45)';g.fillRect(0,0,W2,2);g.fillStyle='rgba(0,0,0,0.18)';g.fillRect(0,ch-3,W2,1);g.fillStyle='rgba(0,0,0,0.45)';g.fillRect(0,ch-1,W2,2);
  g.save();g.translate(0,ch+1);paintWallFace(g,w.kind,W2,Z.wh*2-1,w.seed);g.setTransform(1,0,0,1,0,0);g.restore();
  g.fillStyle='rgba(0,0,0,0.6)';g.fillRect(0,0,2,H2);g.fillRect(W2-2,0,2,H2);g.fillRect(0,0,W2,1);g.fillRect(0,H2-2,W2,2);
  BASEC.set(w.id,c);if(BASEC.size>40){const k=BASEC.keys().next().value;BASEC.delete(k);}return c;}
/* resolve a tag's design to a texture key */
function tagKey(t){if(!t)return'tsr';if(t.d&&t.d!=='char'&&t.d!=='tsr'&&designMeta(t.d))return t.d;if(t.d==='tsr')return'tsr';return charKey(t.c,t.s);}
const TAGC=new Map();/* composite (tag painted onto the wall face) cache, LRU */
function tagComposite(w,key){const ck=w.id+'|'+key;let c=TAGC.get(ck);if(c){TAGC.delete(ck);TAGC.set(ck,c);return c;}const tx=texGet(key);if(!tx)return null;const Z=SIZES[w.size];const W=Z.ww*2,H=Z.wh*2;c=cv(W,H,true);const g=ctx2(c,true);
  const im=tx.img,iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height;const sc=Math.min((W-4)/iw,(H-4)/ih);const FIT=[0,0,W,H];/* on a sign the piece fills the whole board */g.drawImage(im,...FIT);
  /* paint soaks into the surface: wall texture shows through */g.globalCompositeOperation='source-atop';const tmp=cv(W,H);const tg=tmp.getContext('2d');paintWallFace(tg,w.kind,W,H,w.seed);g.globalAlpha=0.22;g.globalCompositeOperation='multiply';
  try{g.drawImage(tmp,0,0);}catch(e){}g.globalCompositeOperation='destination-in';g.globalAlpha=1;const m=cv(W,H,true),mg=ctx2(m,true);mg.drawImage(im,...FIT);g.drawImage(m,0,0);g.globalCompositeOperation='source-over';
  TAGC.set(ck,c);while(TAGC.size>20){const k=TAGC.keys().next().value;TAGC.delete(k);}return c;}
const MASKC={};
function maskedTag(w,comp,mask){const Z=SIZES[w.size];let t=MASKC[w.size];if(!t){t=MASKC[w.size]=cv(Z.ww*2,Z.wh*2);}const g=t.getContext('2d');g.globalCompositeOperation='source-over';g.clearRect(0,0,t.width,t.height);g.drawImage(comp,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);g.globalCompositeOperation='source-over';return t;}
function drawWall(g,w){const Z0=SIZES[w.size],sc=w.scale||1,Z={ww:Math.round(Z0.ww*sc),wh:Math.round(Z0.wh*sc*(w.hscale||1))},cap=1,x0=w.x-Z.ww/2,y0=w.y-Z.wh;if(w.legs){/* sign posts down to the ground */const L=w.legs;g.fillStyle='rgba(10,8,16,0.3)';g.fillRect(x0+4,w.y+L-1,Z.ww-8,3);for(const px of[x0+Z.ww*0.18,x0+Z.ww*0.82-3]){g.fillStyle='#14101a';g.fillRect(px-1,w.y-2,5,L+2);g.fillStyle='#8a8f98';g.fillRect(px,w.y-2,3,L+1);g.fillStyle='#c8ccd2';g.fillRect(px,w.y-2,1,L+1);}}g.fillStyle='rgba(10,8,16,0.32)';g.fillRect(x0-1,w.y-1,Z.ww+5,4);g.fillStyle='rgba(10,8,16,0.22)';g.fillRect(x0+Z.ww,y0-cap+3,4,Z.wh+cap);g.fillRect(x0+1,w.y+3,Z.ww+3,2);
  g.drawImage(wallBase(w),x0,y0-cap,Z.ww,Z.wh+cap);
  const t=TAGS[w.id];const sp=SPRAY&&SPRAY.w===w?SPRAY:null;const cl=CLEAN&&CLEAN.w===w?CLEAN:null;
  /* where the piece goes: on a sign, exactly the red board (inside its 1px rim), clipped so nothing bleeds off it */
  let TX=x0+1,TY=y0,TW=Z.ww-2,TH=Z.wh-1;g.save();g.beginPath();g.rect(TX,TY,TW,TH);g.clip();/* every spot: the piece fills the face inside its rim and never bleeds off */
  if(sp){const comp=tagComposite(w,sp.key);if(comp)g.drawImage(maskedTag(w,comp,sp.mask),TX,TY,TW,TH);}
  else if(t){const comp=tagComposite(w,tagKey(t));if(comp){if(cl&&cl.mask)g.drawImage(maskedTag(w,comp,cl.mask),TX,TY,TW,TH);else g.drawImage(comp,TX,TY,TW,TH);}}
  g.restore();
  {const gr=g.createLinearGradient(0,y0,0,w.y);gr.addColorStop(0,'rgba(255,255,255,0.10)');gr.addColorStop(0.55,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,0.28)');g.fillStyle=gr;g.fillRect(x0+1,y0,Z.ww-2,Z.wh-1);}
  if(sp){const p=sp.p;g.fillStyle='#14101a';g.fillRect(w.x-16,y0-cap-8,32,5);g.fillStyle='#ff3d9a';g.fillRect(w.x-15,y0-cap-7,30*p,3);call('txtPx',g,'TAG '+Math.floor(p*100)+'%',w.x,y0-cap-10,'#ffd23d');
    const n=sp.nozzle;if(n){g.fillStyle='rgba(255,255,255,0.5)';g.beginPath();g.arc(n.x,n.y,1.6,0,TAU);g.fill();}}
  if(cl&&cl.ph==='clean'){const p=cl.p;g.fillStyle='#14101a';g.fillRect(w.x-16,y0-cap-8,32,5);g.fillStyle='#7ab830';g.fillRect(w.x-15,y0-cap-7,30*(1-p),3);
    const s=cl.nozzle;if(s){g.fillStyle='#ffe85a';g.fillRect(s.x-2,s.y-1.5,4,3);g.fillStyle='rgba(255,255,255,0.85)';for(let i=0;i<4;i++){const a=performance.now()/200+i*1.7;g.beginPath();g.arc(s.x+Math.cos(a)*3,s.y+Math.sin(a)*2-1,0.9+((i*7)%3)*0.3,0,TAU);g.fill();}}}}
function drawBucket(g,x,y){g.fillStyle='rgba(0,0,0,0.25)';g.fillRect(x-3,y,7,2);g.fillStyle='#3a6ab8';g.fillRect(x-3,y-6,6,6);g.fillStyle='#5a8ad8';g.fillRect(x-3,y-6,6,1);g.fillStyle='#e8f4ff';g.fillRect(x-2,y-7,4,1);g.strokeStyle='#14101a';g.lineWidth=0.5;g.beginPath();g.arc(x,y-6,3,Math.PI,0);g.stroke();}

/* ---- tagging ---- */
let SPRAY=null;
function sprayPath(w,p){const Z=SIZES[w.size],rows=Z.rows;const rp=p*rows;const row=Math.min(rows-1,Math.floor(rp)),f=rp-row;const u=row%2?1-f:f;return{u,v:(row+0.5)/rows};}
function startSpray(w,key){const p=LV.player;if(!p)return;const Z=SIZES[w.size];const mask=cv(Z.ww*2,Z.wh*2,true);SPRAY={w,key,p:0,dur:Z.spray,mask,x:p.x,y:p.y,hp:p.hp,sfxT:0,nozzle:null};p.face=1;call('sfx','spray',0.7);texGet(key);}
function stopSpray(msg){if(!SPRAY)return;SPRAY=null;if(msg){call('toast',msg);call('sfx','deny',0.5);}}
function sprayTick(dt){const s=SPRAY;if(!s)return;const p=LV.player;if(!p||!p.alive){stopSpray('Tag interrupted.');return;}if(D(p.x,p.y,s.x,s.y)>14){stopSpray('Tag interrupted — you moved away.');return;}if(p.hp<s.hp-0.5){stopSpray('Tag interrupted — you got hit!');return;}
  const Z=SIZES[s.w.size];const p0=s.p;s.p=Math.min(1,s.p+dt/s.dur);const g=s.mask.getContext('2d');g.fillStyle='#fff';const R=Z.wh*2/Z.rows*0.75;
  const steps=Math.max(1,Math.ceil((s.p-p0)*Z.rows*30));for(let k=1;k<=steps;k++){const q=sprayPath(s.w,p0+(s.p-p0)*k/steps);const cx=q.u*Z.ww*2,cy=q.v*Z.wh*2;g.globalAlpha=0.9;g.beginPath();g.arc(cx,cy,R,0,TAU);g.fill();for(let i=0;i<10;i++){const rr=Math.abs(gauss())*R*0.9,a=Math.random()*TAU;g.globalAlpha=0.4+Math.random()*0.6;g.fillRect(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,1.5,1.5);}}
  g.globalAlpha=1;const q=sprayPath(s.w,s.p);const wx=s.w.x-Z.ww/2+q.u*Z.ww,wy=s.w.y-Z.wh+q.v*Z.wh;s.nozzle={x:wx,y:wy};
  const tx=texGet(s.key);const col=tx?tx.col:'#ff3d9a';const hx=p.x+(wx<p.x?-4:4),hy=p.y-16;p.face=wx<p.x?-1:1;
  for(let i=0;i<3;i++){const a=Math.atan2(wy-hy,wx-hx)+(Math.random()-0.5)*0.4,v=60+Math.random()*50;call('part',hx,p.y,16,Math.cos(a)*v,Math.sin(a)*v*0.6,(Math.random()-0.3)*10,0.18+Math.random()*0.12,Math.random()<0.25?'#ffffff':col,1);}
  s.sfxT-=dt;if(s.sfxT<=0){s.sfxT=0.32;call('sfx','spray',0.45);}
  if(s.p>=1){g.globalAlpha=1;g.fillRect(0,0,s.mask.width,s.mask.height);finishTag(s);}}
function finishTag(s){SPRAY=null;const cid=curChar();const key=s.key;TAGS[s.w.id]={d:key==='tsr'?'tsr':key,c:cid,s:s.w.size,t:CLOCK,at:Date.now()};saveTags();lsSet('tsr_graf_total',tagTotal()+1);lsSet(K.clock,CLOCK);
  call('floatText',s.w.x,s.w.y-SIZES[s.w.size].wh-12,'TAGGED!','#ffd23d');call('sfx','ok',0.6);call('noiseAt',s.w.x,s.w.y,50);
  try{const me=G('mEvent');if(typeof me==='function')me('graftag');else if(window.mEvent)window.mEvent('graftag');}catch(e){console.warn(e);}
  try{document.dispatchEvent(new CustomEvent('graf:tag',{detail:{wallId:s.w.id,designId:key}}));}catch(e){}}
function tagMenu(w){const cid=curChar();const sz=w.size;const mine=charKey(cid,sz);const list=[{k:mine,n:(mine==='tsr'?'TSR LOGO':designMeta(mine).name),me:true}];
  for(const m of IDX)if(m.size===sz&&m.id!==mine)list.push({k:m.id,n:m.name});if(mine!=='tsr')list.push({k:'tsr',n:'TSR LOGO'});
  const html=`<p class="who2">TAG · ${esc(SIZES[sz].label)} WALL</p><p class="say" style="margin:2px 0">${esc(w.name)}${TAGS[w.id]?' · spray over your old tag?':''}</p><div class="grafpick">`+list.map((o,i)=>`<button class="pbtn" type="button" data-gi="${i}"><div class="th"><img src="${texSrc(o.k==='tsr'?null:o.k)}"></div><small>${esc(o.n)}${o.me?'<br>★ '+esc(charName(cid))+"'S "+esc(SIZES[sz].label):''}</small></button>`).join('')+
    `</div><div class="row"><button class="pbtn" type="button" data-gnew="1">🎨 NEW ${esc(SIZES[sz].label)} DESIGN</button><button class="pbtn" type="button" data-gbook="1">📖 BLACK BOOK</button><button class="pbtn ghost" data-a="close">CANCEL</button></div>`;
  call('sheetOpen',html);const sh=G('sheet');if(!sh)return;
  sh.querySelectorAll('[data-gi]').forEach(b=>b.addEventListener('click',()=>{const o=list[+b.dataset.gi];call('sheetClose');if(o)startSpray(w,o.k);}));
  const nb=sh.querySelector('[data-gnew]');if(nb)nb.addEventListener('click',()=>{call('sheetClose');openEditor({size:sz,lockSize:true,title:'NEW '+SIZES[sz].label+' PIECE',onDone:id=>{if(id)setTimeout(()=>tagMenu(w),50);}});});
  const bb=sh.querySelector('[data-gbook]');if(bb)bb.addEventListener('click',()=>{call('sheetClose');openBook();});}
function nearWall(p){let best=null,bd=1e9;for(const w of walls()){const Z=SIZES[w.size];const dx=Math.abs(p.x-w.x);if(dx>Z.ww/2+10)continue;const dy=p.y-w.y;if(dy<-1||dy>24)continue;const d=Math.max(0,dx-Z.ww/2)+Math.abs(dy-8)*0.6;if(d<bd){bd=d;best=w;}}return best?{w:best,d:bd}:null;}

/* ---- Cobra Doug: the cleaner ---- */
let CLEAN=null,cleanScanT=0;
function eligible(){const out=[];for(const id in TAGS){const t=TAGS[id];if(CLOCK-t.t>=CFG.cleanAfter){const w=walls().find(q=>q.id===id);if(w)out.push({w,t});}}out.sort((a,b)=>a.t.t-b.t.t);return out;}
function onScreen(x,y,m){const c=LV.cam;if(!c)return false;m=m||40;return x>c.x-m&&x<c.x+LV.VW+m&&y>c.y-m&&y<c.y+LV.VH+m;}
function cleanTick(dt){const COBRA=G('COBRA');const n=COBRA&&COBRA.n;if(!n||!n.alive){CLEAN=null;return;}
  if(!CLEAN){cleanScanT-=dt;if(cleanScanT>0)return;cleanScanT=2;const e=eligible();if(!e.length)return;CLEAN={w:e[0].w,ph:'go',p:0,stuck:0,best:1e9,mask:null,nozzle:null};}
  const c=CLEAN;if(!TAGS[c.w.id]){CLEAN=null;return;}
  if(c.ph==='go'){const tx=c.w.x+(n.x<c.w.x?-6:6),ty=c.w.y+9;const d=D(n.x,n.y,tx,ty);
    if(!onScreen(n.x,n.y,80)&&!onScreen(tx,ty,60)){/* off-screen: simulate the walk */const st=Math.min(d,46*dt);if(d>0){n.x+=(tx-n.x)/d*st;n.y+=(ty-n.y)/d*st;}n.vx=n.vy=0;}
    if(d<7){c.ph='clean';c.p=0;}
    else if(d<c.best-2){c.best=d;c.stuck=0;}else{c.stuck+=dt;if(c.stuck>8){const sp=g_('cobraSpawnPt');if(!onScreen(tx,ty,60)&&sp){const q=sp(tx,ty);n.x=q.x;n.y=q.y;}c.stuck=0;c.best=1e9;}}}
  if(c.ph==='clean'){const Z=SIZES[c.w.size];const vis=onScreen(c.w.x,c.w.y,60);c.p=Math.min(1,c.p+dt/Z.clean);
    if(vis){if(!c.mask){c.mask=cv(Z.ww*2,Z.wh*2);const g=c.mask.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.mask.width,c.mask.height);}const g=c.mask.getContext('2d');g.globalCompositeOperation='destination-out';
      const q=sprayPath(c.w,c.p);const cx=(1-q.u)*Z.ww*2,cy=q.v*Z.wh*2;const R=Z.wh*2/Z.rows*0.8;for(let i=0;i<6;i++){g.globalAlpha=0.35;g.beginPath();g.arc(cx+(Math.random()-0.5)*R,cy+(Math.random()-0.5)*R*0.6,R*(0.5+Math.random()*0.5),0,TAU);g.fill();}g.globalAlpha=1;g.globalCompositeOperation='source-over';
      c.nozzle={x:c.w.x-Z.ww/2+(1-q.u)*Z.ww,y:c.w.y-Z.wh+q.v*Z.wh};n.face=c.nozzle.x<n.x?-1:1;if(Math.random()<dt*14)call('part',c.nozzle.x,c.w.y,Math.max(2,(c.w.y-c.nozzle.y)),(Math.random()-0.5)*30,8+Math.random()*10,-5,0.5+Math.random()*0.4,Math.random()<0.5?'#ffffff':'#bfe8ff',1);
      if(Math.random()<dt*0.6)call('floatText',n.x,n.y-44,'*scrub scrub*','#bfe8ff');}
    if(c.p>=1){delete TAGS[c.w.id];saveTags();if(vis){call('toast','Cobra Doug scrubbed your tag off. The wall is clean again.');call('sfx','deny',0.4);}const COB=n;COB.hx=COB.x;COB.hy=COB.y;CLEAN=null;cleanScanT=3;}}}
function cobraBusy(n){return CLEAN&&n===((G('COBRA')||{}).n);}

/* =====================================================================
   HOOKS (wrap game functions)
   ===================================================================== */
function wrap(name,mk){const orig=G(name);if(typeof orig!=='function'){console.warn('[graffiti] cannot hook',name);return false;}setG(name,mk(orig));return true;}
const HOOKED=[];
function hooks(){
  /* per-character graffiti on covered Cobra Doug tags (drawPiece delegates to GRAF.drawCover) */
  /* TAG interactions near walls (story mode, after unlock) */
  if(wrap('cobraActs',o=>function(cand,p){const r=o.apply(this,arguments);try{if(SPRAY){cand(0,999,'STOP TAG',()=>stopSpray('Tag stopped.'),{x:SPRAY.w.x,y:SPRAY.w.y+62});return r;}if(!wallsActive()||!p)return r;const q=nearWall(p);if(q){const busy=CLEAN&&CLEAN.w===q.w&&CLEAN.ph==='clean';
      const tg={x:q.w.x,y:q.w.y-SIZES[q.w.size].wh-CAP-3+44};if(busy)cand(q.d+2,22,'COBRA IS SCRUBBING',()=>call('toast','Wait for Cobra Doug to finish scrubbing — or splatter him.'),tg);else cand(q.d,22,TAGS[q.w.id]?'RETAG':'TAG',()=>tagMenu(q.w),tg);}}catch(e){console.warn(e);}return r;}))HOOKED.push('cobraActs');
  /* world clock, spraying, Cobra cleaning routine */
  if(wrap('cobraTick',o=>function(dt){const r=o.apply(this,arguments);try{if(LV.gameMode==='story'&&LV.state==='play'){CLOCK+=dt;clockSaveT+=dt;if(clockSaveT>5){clockSaveT=0;lsSet(K.clock,CLOCK);}if(SPRAY)sprayTick(dt);if(unlocked()||Object.keys(TAGS).length)cleanTick(dt);}}catch(e){console.warn(e);}return r;}))HOOKED.push('cobraTick');
  /* Cobra Doug walks to tagged walls with his own movement code */
  if(wrap('cobraUpdate',o=>function(n,dt){try{const c=CLEAN;const p=LV.player;const d=p&&p.alive?D(n.x,n.y,p.x,p.y):1e9;
      if(c&&n.alive&&!(n.angryT>0)&&d>=85&&n===(G('COBRA')||{}).n){n.hitCd-=dt;n.yelled=0;if(c.ph==='go'){const tx=c.w.x+(n.x<c.w.x?-6:6),ty=c.w.y+9;if(onScreen(n.x,n.y,80)||onScreen(tx,ty,60)){const goal=g_('cobraGoal'),mv=g_('cobraMove');const Gp=goal?goal(n,{x:tx,y:ty}):{x:tx,y:ty};const a=Math.atan2(Gp.y-n.y,Gp.x-n.x);if(mv)mv(n,Math.cos(a)*40,Math.sin(a)*40,dt);n.face=Math.cos(a)<0?-1:1;}}else{n.vx=n.vy=0;}return;}}catch(e){console.warn(e);}return o.apply(this,arguments);}))HOOKED.push('cobraUpdate');
  /* draw walls in the depth-sorted world list */
  if(wrap('campList',o=>function(list,inV,tm){const r=o.apply(this,arguments);try{if(wallsActive()){for(const w of walls()){const Z=SIZES[w.size];if(!inV(w.x,w.y-Z.wh/2,Z.ww))continue;list.push({y:w.y,k:11,o:{draw:g=>drawWall(g,w)}});}
      const n=(G('COBRA')||{}).n;if(CLEAN&&CLEAN.ph==='clean'&&n&&inV(n.x,n.y,30)){const bx=n.x+(n.face<0?7:-7),by=n.y+2;list.push({y:by,k:11,o:{draw:g=>drawBucket(g,bx,by)}});}}}catch(e){console.warn(e);}return r;}))HOOKED.push('campList');
  /* walls are solid */
  if(wrap('moveE',o=>function(e,dx,dy){const ox=e.x,oy=e.y;const r=o.apply(this,arguments);try{if(WGRID&&wallsActive()&&!(e.z>3)&&!e.roof&&!e.car){if((wallHit(e.x,e.y)||wallCross(ox,oy,e.x,e.y))&&!wallHit(ox,oy)){if(!wallHit(ox,e.y)&&!wallCross(ox,oy,ox,e.y))e.x=ox;else if(!wallHit(e.x,oy))e.y=oy;else{e.x=ox;e.y=oy;}}}}catch(err){}return r;}))HOOKED.push('moveE');
  /* Cowboy Goonface sells paint: his sheet links to the Black Book once unlocked */
  if(wrap('goonTalk',o=>function(){const r=o.apply(this,arguments);try{if(unlocked()){const sh=G('sheet');const row=sh&&sh.querySelector('.row');if(row){const b=document.createElement('button');b.className='pbtn';b.type='button';b.textContent='🎨 GRAFFITI BOOK';b.addEventListener('click',()=>{call('sheetClose');openBook();});row.insertBefore(b,row.firstChild);}}}catch(e){console.warn(e);}return r;}))HOOKED.push('goonTalk');
  /* stop a tag in progress when a new run starts */
  if(wrap('spawnCobra0',o=>function(){SPRAY=null;CLEAN=null;return o.apply(this,arguments);}))HOOKED.push('spawnCobra0');}

/* covered Cobra Doug tags: draw the covering character's current graffiti */
function drawCover(g,t){const key=slotOf(t.cov,'small')||slotOf(t.cov,'large')||slotOf(t.cov,'xl')||'tsr';const tx=texGet(key);if(!tx)return;const im=tx.img,iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height;const k=0.3+0.7*(t.covT==null?1:t.covT);const w=64*k,h=w*ih/iw;
  const ck='cov|'+key;let c=TAGC.get(ck);if(!c){c=cv(128,Math.max(1,Math.round(128*ih/iw)),true);ctx2(c,true).drawImage(im,0,0,c.width,c.height);TAGC.set(ck,c);}g.drawImage(c,t.x-w/2,t.y-h/2,w,h);}

/* HUD button (story mode, after unlock) */
let HB=null;
function hudBtn(){if(!HB){const tr=document.getElementById('tr');if(!tr)return;HB=document.createElement('button');HB.id='grafBtn';HB.type='button';HB.innerHTML='<svg width="14" height="14" viewBox="0 0 16 16"><rect x="4" y="5" width="8" height="10" rx="1" fill="#14101a"/><rect x="6" y="2" width="4" height="3" fill="#14101a"/><circle cx="12.5" cy="2.5" r="1.2" fill="#fff"/><circle cx="14.5" cy="4.5" r="0.8" fill="#fff"/></svg>GRAFFITI';
    HB.addEventListener('pointerdown',e=>e.stopPropagation());HB.addEventListener('click',e=>{e.stopPropagation();if(LV.state==='play')openBook();});const fd=document.getElementById('feed');tr.insertBefore(HB,fd||null);}
  /* owner: no GRAFFITI button on the HUD. The black book opens from the main menu or by talking to Cowboy Goonface */HB.style.display='none';}
setInterval(()=>{try{hudBtn();if(wallsActive()&&!WALLS&&LV.state==='play')walls();}catch(e){}},500);

/* =====================================================================
   PUBLIC API
   ===================================================================== */
const GRAF={
  openEditor(o){o=o||{};openEditor({size:o.size,title:o.title,onDone:o.onDone,designId:o.designId,lockSize:o.lockSize,tab:o.tab});},
  openBook(){openBook();},
  unlock(){const was=unlocked();lsSet(K.on,1);try{hudBtn();}catch(e){}if(!was){call('banner','GRAFFITI UNLOCKED','Editor + wall tagging are live',3.2);call('toast','Design pieces from the main menu or by talking to Cowboy Goonface · find a wall and hit TAG');call('sfx','ok',0.7);}return true;},
  unlocked,
  designs(){return IDX.map(m=>({id:m.id,name:m.name,size:m.size,updated:m.updated,owner:m.owner}));},
  tagCount(){return Object.keys(TAGS).length;},
  tagTotal,
  walls(){return walls().map(w=>({id:w.id,x:w.x,y:w.y,size:w.size,name:w.name,tagged:!!TAGS[w.id]}));},
  nearestWall(x,y,size){let b=null,bd=1e9;for(const w of walls()){if(size&&w.size!==size)continue;const d=D(x,y,w.x,w.y);if(d<bd){bd=d;b=w;}}return b?{id:b.id,x:b.x,y:b.y,size:b.size,name:b.name,tagged:!!TAGS[b.id]}:null;},
  slot(cid,size){return slotOf(cid||curChar(),size||'small');},
  assign(cid,size,id){if(id&&!designMeta(id))return false;setSlot(cid||curChar(),size,id||null);return true;},
  config(o){if(o&&typeof o==='object'){if(o.cleanAfter!=null)CFG.cleanAfter=Math.max(1,+o.cleanAfter||300);lsSet(K.cfg,CFG);}return Object.assign({},CFG);},
  drawCover,
  /* internals exposed for tests / debugging */
  _s:{get TAGS(){return TAGS;},get CLEAN(){return CLEAN;},get SPRAY(){return SPRAY;},get CLOCK(){return CLOCK;},set CLOCK(v){CLOCK=v;},get ED(){return ED;},walls,startSpray,tagMenu,hooked:HOOKED,texGet,charKey,flatten:()=>ED&&flatten(),saveCurrent:a=>saveCurrent(a),closeEditor:(s,b)=>closeEditor(s,b),layoutText:(T,W,H)=>layoutText(T,W,H),warpHandles,setTab:k=>setTab(k),zoomLevel:i=>zoomLevel(i),setFB:w=>setFB(w),cleanTick:dt=>cleanTick(dt),drawWall:(g,w)=>drawWall(g,w),loadProject:id=>loadProject(id),undo:()=>undo(),redo:()=>redo()}};
window.GRAF=GRAF;
hooks();refreshPieceColors();
})();
