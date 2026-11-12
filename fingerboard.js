/* =====================================================================
   TEMPE SKATE ROYALE — FINGERBOARD (add-on module)
   Top-down 16-bit fingerboard session on a flat plaza. There are no
   buttons: movement and every trick come from touch gestures on the
   board itself (two-finger push / steer / twist, tail press + flick).

   Sections (independent systems, all tuned through CFG):
     CONFIG   every threshold and physics value (sensitivity, accessibility)
     INPUT    multitouch Pointer Events, mouse fallback, finger history
     PHYSICS  board kinematics: push, steer, friction, tilt, air, bail
     TRICKS   rigid-body tricks: a tail/nose snap is an impulse at the finger's contact
              point, air drags are friction forces, a touch is a catch spring; landing
              and bail are judged on the real orientation (no pre-baked rotations)
              landing evaluation
     SCORE    trick names, combo multiplier, popups, best score
     ANIM     plaza, pseudo-3D deck (flip / shove / tilt), shadow, HUD

   Hooks into the game through window.__tsrScope (the bridge line inside
   index.html, same as graffiti.js). index.html routes the minigame kind
   'finger' to FB.frame() and startSkateJam() to FB.start().
   ===================================================================== */
(function(){
'use strict';
const S=window.__tsrScope;
if(typeof S!=='function'){console.warn('[fingerboard] game bridge missing');return;}
const LV=S(`({get MGM(){return MGM},get ARCADE(){return ARCADE},get gameMode(){return gameMode},get player(){return player},get rollG(){return rollG},get rollF(){return rollF}})`);
function gfn(n){try{const f=S(n);return typeof f==='function'?f:null;}catch(e){return null;}}
function call(n,...a){const f=gfn(n);if(f){try{return f(...a);}catch(e){console.warn('[fingerboard]',n,e);}}}
const sfx=(n,v)=>call('sfx',n,v);
const TAU=Math.PI*2,DEG=Math.PI/180;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const wrapA=a=>{a=(a+Math.PI)%TAU;if(a<0)a+=TAU;return a-Math.PI;};
const ease=(rate,dt)=>1-Math.exp(-rate*dt);
const fwd=th=>({x:Math.cos(th),y:Math.sin(th)});
const rgt=th=>({x:-Math.sin(th),y:Math.cos(th)});           /* right of the nose (screen y points down) */
const mk=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,w|0);c.height=Math.max(1,h|0);return c;};
const nowS=()=>performance.now()/1000;
function lsGet(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

/* ============================== CONFIG ============================== */
/* Units: distances in board lengths (L) unless noted, speeds in L/s,
   angles in degrees for gesture cones. `sensitivity` > 1 makes flicks
   easier (lower speed/distance thresholds, more tolerant tail hold). */
const CFG={
  /* view + camera (vpx = virtual 16-bit pixels) */
  viewShort:215,boardLen:108,boardWid:30,anchorY:0.56,camFollow:9,camMaxOff:10,
  /* True Skate camera: the view turns with the board so the nose always points up the screen (swipe down = tail) */
  camRot:7,camFlipSpeed:0.3,camMaxRate:30,
  /* flips and shove spins finish on their own: the spin rate is nudged so the board comes round flat for touchdown */
  flipAssist:5,flip2Rate:12.5,flip3Rate:22,shoveBias:0.2,
  focal:420,liftK:0.32,shadowX:0.22,shadowY:0.38,baseZ:4,deckThick:3,
  /* input */
  sensitivity:1,inputSmooth:0.045,pressRamp:0.05,
  deckU:1.12,deckW:1.6,           /* a touch-down inside this (board-local, x half-length/half-width) is ON the deck, else GROUND */
  /* movement */
  pushGain:2.4,steerGain:1.5,twistGain:0.7,lateralPush:0.2,maxSpeed:8,
  restDrag:0.45,carveGain:1.2,prepDamp:0.25,
  /* ground friction: rolling = resistance + v^2 drag; lateral = static grip, kinetic slide above the break speed */
  rollRes:0.1,vDrag:0.035,staticGrip:22,slideBreak:0.7,kineticDecel:3.2,mass:1,
  /* kick push: one finger on the deck, one on the ground swiping toward the tail */
  kickGain:2.0,kickRefSpeed:3,kickTop:4.2,kickMaxPerPush:1.4,kickNoDeck:0.5,brakeGain:2.5,
  /* tilt (nose/tail/side pressure, board-local) */
  tailStart:0.45,tipEnd:1.0,sideStart:0.35,maxPitch:0.24,maxRoll:0.2,tiltResp:16,truckU:0.31,
  /* physics tricks (lengths in board lengths L, speeds L/s, rates rad/s).
     finger roles from where they land: TAIL u<-roleTail*L, NOSE u>roleTail*L, MID between, GROUND off the deck */
  roleTail:0.1,velWin:0.08,dragWin:0.045,
  /* pop: a tail (nose) finger snapping toward its end. vz = popGain*snap*(1+popSpeedBonus*v/topSpeed)*preload */
  popSnapMin:0.8,popMinDist:0.05,popGain:1.05,popVzMin:1.6,popVzMax:4.4,popSpeedBonus:0.25,topSpeed:4.5,
  preloadT:0.25,preloadBonus:0.15,popPitchGain:1.6,trickConfirm:0.03,companion:0.5,
  /* lateral part of the snap = impulse at the contact point -> yaw (shove-it); dead band keeps a slightly angled ollie straight */
  popLatGain:0.75,popLatDead:0.3,rollLeak:0.012,
  /* plank inertia (per unit mass): I_yaw=(L^2+W^2)/12, I_roll=(W^2+T^2)/12, I_pitch=(L^2+T^2)/12, each scaled */
  yawIScale:1,rollIScale:1,pitchIScale:1,
  /* air: friction from a finger dragging over the deck. Roll speed it can reach = rollSpeedK*v_lateral/(W/2);
     strongest when sliding OUT over a side edge, weak when dragging inward; the same lateral force yaws via lever u */
  fricD:30,rollSpeedK:0.3,edgeMin:0.25,inwardFric:0.12,yawCoupling:0.4,pitchLevelK:2.2,
  airDrag:0.05,angDrag:0.12,pitchSpring:28,pitchDamp:7,airTwistGrip:22,
  /* catch: a (slow) finger on the drawn board = critically damped spring toward the nearest clean roll and
     yaw aligned with travel (regular or fakie) */
  catchW:55,catchYawW:34,catchMaxAcc:1000,catchMaxSpeed:0.9,catchStillMove:0.03,catchMinAge:0.07,catchRamp:0.02,contactW:0.3,
  /* air (shared) */
  gravity:9,hMax:0.95,popShoveH:0.3,airPush:0.35,
  /* landing */
  landRollTol:15,landYawTol:20,landRollRateMax:40,cleanTol:6,
  bailTime:1.4,bailBounce:0.35,bailTumble:0.08,bailYawK:0.8,bailFric:3,bailSettle:60,
  /* manual */
  manualMinSpeed:0.6,manualLo:0.3,manualHi:0.95,manualHold:0.35,manualGrace:0.15,manualWobble:0.1,
  /* score */
  pts:{'OLLIE':100,'NOLLIE':130,'SHOVE-IT':150,'POP SHOVE-IT':220,'360 SHOVE-IT':320},
  flipPts:250,multiFlipBonus:150,varialBonus:100,
  rot180:150,manualRate:120,noseManualRate:150,heightBonus:0.6,cleanBonus:0.15,
  comboWindow:1.4,comboMax:8,
  /* session */
  session:90,storyTarget:1500,payDiv:220,payMax:60,bestKey:'tsr_fb_best',cfgKey:'tsr_fb_cfg'
};
{const o=lsGet(CFG.cfgKey,null);if(o&&typeof o==='object')for(const k in o)if(k in CFG&&typeof o[k]===typeof CFG[k])CFG[k]=o[k];}
const thr=n=>CFG[n]/CFG.sensitivity;

let M=null;                         /* the live minigame object (MGM) */
const cvs=()=>document.getElementById('mgc');
const active=()=>{const m=LV.MGM;return !!(m&&m.kind==='finger');};

/* gesture verdicts for the debug overlay ("why did / didn't that pop?") */
const Why={add(text,kind){if(!M||!M.why)return;const w=M.why,l=w[w.length-1],t=nowS(),key=s=>s.replace(/[\d.]+/g,'#');if(l&&key(l.text)===key(text)&&t-l.t<0.8)return;
  w.push({t,text,kind:kind||'no'});if(w.length>7)w.shift();if(kind!=='ok'&&kind!=='info'){M.log.push({t:+t.toFixed(3),ev:'reject',why:text});}if(M.log.length>500)M.log.splice(0,M.log.length-400);}};
const DBG_KEY='tsr_fb_debug',HINT_KEY='tsr_fb_hint7';

/* rotating camera: the world draws into a square canvas (D x D) that is rotated onto the screen about the anchor.
   Game coords = that canvas (camera-relative, turned by phi). toW: screen(view) -> game, toV: game -> screen. */
const Cam={phi:0,w:0,D:1,ax:0,ay:0,init:false,
  toW(p){const c=Math.cos(this.phi),s=Math.sin(this.phi),dx=p.x-this.ax,dy=p.y-this.ay;return{x:this.D/2+c*dx-s*dy,y:this.D/2+s*dx+c*dy};},
  toV(q){const c=Math.cos(this.phi),s=Math.sin(this.phi),dx=q.x-this.D/2,dy=q.y-this.D/2;return{x:this.ax+c*dx+s*dy,y:this.ay-s*dx+c*dy};}};

/* =============================== INPUT ============================== */
const Input={
  F:new Map(),mouse:null,wheel:0,type:(navigator.maxTouchPoints>0)?'touch':'mouse',pair:null,acc:{x:0,y:0,a:0},
  reset(){this.F.clear();this.gone=[];this.mouse=null;this.wheel=0;this.pair=null;this.acc={x:0,y:0,a:0};},
  pos(e){const c=cvs(),r=c.getBoundingClientRect(),V=M.view;return Cam.toW({x:(e.clientX-r.left)/r.width*V.W,y:(e.clientY-r.top)/r.height*V.H});},
  add(id,p,t,src,force){const f={id,x:p.x,y:p.y,px:p.x,py:p.y,t0:t,hist:[{t,x:p.x,y:p.y}],p:0,force:force==null?null:force,src,used:M.b.st==='bail',up:0,cancel:false,
    born:M.b.st,thd:M.b.th,zone:'ground',deck:false,un:0,wn:0,un0:0,inTail:false,tailFrom:0,depth:0,sw:null,swR:0,sp:0,vu:0,vw:0,disp:0,pushed:0,pushSfx:0,logged:0};
    /* deck or ground is decided at touch-down (against the deck as drawn) and sticks for the whole touch,
       so a resting front finger stays "on board" while the board rolls under it */
    const l=Board.local(p.x,p.y);f.deck=src==='mouse'||(Math.abs(l.un)<=CFG.deckU&&Math.abs(l.wn)<=CFG.deckW);
    /* role from where it lands: TAIL / NOSE / MID on the deck, GROUND off it */
    const ru=2*CFG.roleTail;f.role=!f.deck?'ground':l.un<-ru?'tail':l.un>ru?'nose':'mid';f.lu=l.un;f.lw=l.wn;
    this.F.set(id,f);Board.localize(f,t);return f;},
  move(id,p,t,force){const f=this.F.get(id);if(!f||f.up)return;f.x=p.x;f.y=p.y;const h=f.hist;if(h.length&&t<h[h.length-1].t)t=h[h.length-1].t;h.push({t,x:p.x,y:p.y});if(h.length>48)h.shift();if(force!=null)f.force=force;},
  /* the release position is a real sample: flicks usually end with the finger leaving the glass at speed */
  up(id,t,p,cancel){const f=this.F.get(id);if(!f||f.up)return;const h=f.hist,l=h[h.length-1];
    if(p&&(p.x!==l.x||p.y!==l.y)){t=Math.max(t,l.t+1e-4);h.push({t,x:p.x,y:p.y});f.x=p.x;f.y=p.y;}
    f.up=Math.max(t,f.t0+1e-3);f.cancel=!!cancel;if(cancel)Why.add('pointer '+f.id+' cancelled by the browser (flick still evaluated)','info');},
  /* finger position at time t (held between samples: no events = no motion) */
  at(f,t){const h=f.hist;if(t>=h[h.length-1].t)return h[h.length-1];let i=h.length-1;while(i>0&&h[i].t>t)i--;const a=h[i],b=h[i+1];
    if(!b||a.t>=t)return a;if(b.t-a.t>0.05)return a;const k=(t-a.t)/(b.t-a.t);return{t,x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k};},
  /* finger velocity = least-squares slope over the last `win` seconds of event samples (coalesced samples and the
     release position included). The window starts with a point interpolated across any gap, so a frame stall spreads
     the motion over the gap instead of faking a super-fast flick. */
  /* a finger held still on the glass while the camera turns sweeps an arc in game coords: take that out, so finger
     motion is always measured against the screen (= against the board, which the camera follows) */
  vel(f,tEnd,win){const v=this.vel0(f,tEnd,win),w=Cam.w;if(!w||(v.x===0&&v.y===0&&tEnd-f.hist[f.hist.length-1].t>win))return v;
    const q=f.hist[f.hist.length-1];return{x:v.x+w*(q.y-Cam.D/2),y:v.y-w*(q.x-Cam.D/2)};},
  vel0(f,tEnd,win){const h=f.hist,last=h[h.length-1];if(tEnd-last.t>win)return{x:0,y:0};const t0=tEnd-win,pts=[];let j=h.length-1;
    while(j>=0&&h[j].t>=t0){pts.push(h[j]);j--;}
    if(j>=0){const a=h[j],b=pts.length?pts[pts.length-1]:last;if(b.t>a.t){const k=clamp((t0-a.t)/(b.t-a.t),0,1);pts.push({t:t0,x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k});}}
    const n=pts.length;if(n<2)return{x:0,y:0};const span=pts[0].t-pts[n-1].t;
    if(span<0.03){const a=pts[n-1],dt=Math.max(0.03,span);return{x:(pts[0].x-a.x)/dt,y:(pts[0].y-a.y)/dt};}
    let mt=0,mx=0,my=0;for(const q of pts){mt+=q.t;mx+=q.x;my+=q.y;}mt/=n;mx/=n;my/=n;let tt=0,tx=0,ty=0;
    for(const q of pts){const d=q.t-mt;tt+=d*d;tx+=d*(q.x-mx);ty+=d*(q.y-my);}return{x:tx/tt,y:ty/tt};},
  disp(f,tEnd,win){const h=f.hist,last=h[h.length-1];const a=this.at(f,tEnd-win);return Math.hypot(last.x-a.x,last.y-a.y);},
  /* desktop: left-drag = one finger (exactly like a touch); right- or modifier-drag = two-finger grip (push/steer) */
  mouseDown(e,p,t){if(this.mouse)return;const grip=e.button===2||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey;
    if(!grip){this.add('m1',p,t,'mouse1');this.mouse={mode:'one'};return;}
    const f=fwd(M.b.th),o=CFG.boardLen*0.2;this.add('m1',{x:p.x-f.x*o,y:p.y-f.y*o},t,'mouse');this.add('m2',{x:p.x+f.x*o,y:p.y+f.y*o},t,'mouse');this.mouse={mode:'grip',lx:p.x,ly:p.y};},
  mouseMove(p,t){const m=this.mouse;if(!m)return;if(m.mode==='one'){this.move('m1',p,t);return;}const dx=p.x-m.lx,dy=p.y-m.ly;m.lx=p.x;m.ly=p.y;
    for(const id of['m1','m2']){const f=this.F.get(id);if(f)this.move(id,{x:f.x+dx,y:f.y+dy},t);}},
  mouseUp(t,p){const m=this.mouse;if(!m)return;this.up('m1',t,m.mode==='one'?p:null);this.up('m2',t);this.mouse=null;},
  /* per-frame: pressure ramp, board-local coords, zones, tail tracking; drop lifted fingers */
  gone:[],   /* recently lifted fingers (1 s), so a just-lifted twist/steer partner still vetoes a "single-finger" trick */
  update(now){this.gone=this.gone.filter(f=>now-f.up<1);for(const[id,f]of this.F){if(f.up&&now-f.up>0.15){this.F.delete(id);this.gone.push(f);continue;}
    if(!f.up)f.p=Math.min(1,(now-f.t0)/CFG.pressRamp);Board.localize(f,now);}}
};
function forceOf(e){if(e.pointerType!=='touch'&&e.pointerType!=='pen')return null;const p=e.pressure;return(p>0&&p!==0.5&&p!==1)?p:null;}

/* =============================== BOARD ============================== */
/* screen transform of the board + local (rotated) coordinates for fingers */
const Board={
  bs:{x:0,y:0},
  xf(){const b=M.b,L=CFG.boardLen;const air=b.st==='air';const pv=air?0:(b.pitch>0?-CFG.truckU*L:CFG.truckU*L);
    const rr=b.roll+b.flip;return{f:fwd(b.th),r:rgt(b.th),pv,cp:Math.cos(b.pitch),sp:Math.sin(b.pitch),cr:Math.cos(rr),sr:Math.sin(rr),z0:CFG.baseZ+b.h,bx:this.bs.x,by:this.bs.y,nz:Math.cos(rr)*Math.cos(b.pitch)};},
  X3(T,u,w,z){const w1=w*T.cr+z*T.sr,z1=z*T.cr-w*T.sr;const du=u-T.pv;const u2=du*T.cp-z1*T.sp+T.pv,z2=du*T.sp+z1*T.cp;
    return{X:u2*T.f.x+w1*T.r.x,Y:u2*T.f.y+w1*T.r.y,Z:z2+T.z0};},
  proj(T,p){const k=CFG.focal/Math.max(40,CFG.focal-p.Z);return{x:T.bx+p.X*k,y:T.by+p.Y*k-p.Z*CFG.liftK};},
  shadow(T,p){return{x:T.bx+p.X+p.Z*CFG.shadowX,y:T.by+p.Y+p.Z*CFG.shadowY};},
  centre(){const b=M.b,Z=CFG.baseZ+b.h,k=CFG.focal/Math.max(40,CFG.focal-Z);return{x:this.bs.x,y:this.bs.y-Z*CFG.liftK,k};},
  /* the deck exactly as drawn this frame (camera, perspective, lift, pitch); flip excluded so it never degenerates mid-flip */
  fr:null,
  frameOf(){const b=M.b,T=this.xf();T.cr=Math.cos(b.roll);T.sr=Math.sin(b.roll);const L=CFG.boardLen,W=CFG.boardWid,t=CFG.deckThick/2;
    const a=this.proj(T,this.X3(T,-L/2,0,t)),n=this.proj(T,this.X3(T,L/2,0,t)),c=this.proj(T,this.X3(T,0,0,t)),s=this.proj(T,this.X3(T,0,W/2,t));
    return{a,n,m:{x:(a.x+n.x)/2,y:(a.y+n.y)/2},ax:{x:n.x-a.x,y:n.y-a.y},c,sw:{x:s.x-c.x,y:s.y-c.y}};},
  local(x,y){const Fr=this.fr||(this.fr=this.frameOf());const dx=x-Fr.m.x,dy=y-Fr.m.y,a2=Math.max(1,Fr.ax.x*Fr.ax.x+Fr.ax.y*Fr.ax.y);
    const ex=x-Fr.c.x,ey=y-Fr.c.y,s2=Math.max(1,Fr.sw.x*Fr.sw.x+Fr.sw.y*Fr.sw.y);return{un:2*(dx*Fr.ax.x+dy*Fr.ax.y)/a2,wn:(ex*Fr.sw.x+ey*Fr.sw.y)/s2};},
  /* local coords against the deck rotated to heading th (a drag is read in the board frame from when that finger
     touched: the foot contact moves with the board, so a fast shove spin doesn't scramble a flip drag) */
  localTh(x,y,th){const b=M.b,keep=b.th,fr=this.fr;b.th=th;this.fr=null;const l=this.local(x,y);b.th=keep;this.fr=fr;return l;},
  unAt(f,t){const p=Input.at(f,t);return this.local(p.x,p.y).un;},
  localize(f,now){const l=this.local(f.x,f.y);f.un=l.un;f.wn=l.wn;
    if(!f.deck){f.zone='ground';f.inTail=false;return;}
    f.zone=f.un<-CFG.tailStart?'tail':f.un>CFG.tailStart?'nose':f.wn<-CFG.sideStart?'left':f.wn>CFG.sideStart?'right':'center';
    if(f.up)return;
    if(f.zone==='tail'){if(!f.inTail){f.inTail=true;f.tailFrom=(now-f.t0<0.06)?f.t0:now;f.depth=0;}
      f.depth=Math.max(f.depth,clamp((-f.un-CFG.tailStart)/(1-CFG.tailStart),0,1));}
    else f.inTail=false;}
};

/* ============================== PHYSICS ============================= */
const Phys={
  step(dt,now){const b=M.b,L=CFG.boardLen;const all=[...Input.F.values()],act=all.filter(f=>!f.up&&f.deck),grd=all.filter(f=>!f.deck);   /* ground touches never steer or trick */
    /* two-finger pair: centroid motion + twist */
    let dx=0,dy=0,dA=0,pairMoving=false,sweep=0;
    const ctl=b.st==='bail'?[]:act.filter(f=>!(f.used&&b.st==='ground'&&f.born==='bail'));
    if(ctl.length>=2){const a=ctl[0],c=ctl[1],key=a.id+'|'+c.id,cx=(a.x+c.x)/2,cy=(a.y+c.y)/2,ang=Math.atan2(c.y-a.y,c.x-a.x);const P=Input.pair;
      if(P&&P.key===key){dx=cx-P.cx;dy=cy-P.cy;dA=wrapA(ang-P.ang);const ma=Math.hypot(a.x-P.ax,a.y-P.ay),mc=Math.hypot(c.x-P.bx,c.y-P.by);
        const da=Input.disp(a,now,0.1),dc=Input.disp(c,now,0.1);   /* both fingers moving over the last 0.1 s = a twist (robust to late/coalesced events) */
        pairMoving=Math.max(da,dc)>0.02*L&&Math.min(da,dc)>=0.35*Math.max(da,dc)&&(ma+mc)>0;}
      Input.pair={key,cx,cy,ang,ax:a.x,ay:a.y,bx:c.x,by:c.y};}else Input.pair=null;
    const C=Board.centre();
    const wheel=Input.wheel;Input.wheel=0;
    const A=Input.acc;A.x+=dx;A.y+=dy;A.a+=dA;const k=ease(1/CFG.inputSmooth,dt);const sx=A.x*k,sy=A.y*k,sa=A.a*k;A.x-=sx;A.y-=sy;A.a-=sa;
    if(b.st!=='ground')for(const g of grd){g.px=g.x;g.py=g.y;}
    if(b.st==='ground')this.ground(dt,now,ctl,sx,sy,sa,wheel,grd);
    else if(b.st==='air')this.air(dt,now,act,sx,sy,pairMoving?dA:0,wheel);
    else this.bail(dt,now);
    const sp=Math.hypot(b.vx,b.vy),mx=CFG.maxSpeed*L;if(sp>mx){b.vx*=mx/sp;b.vy*=mx/sp;}   /* safety cap only; drag sets the real top speed */
    if(b.st!=='air'&&b.st!=='bail'){b.x+=b.vx*dt;b.y+=b.vy*dt;}
    const rg=LV.rollG,rf=LV.rollF;if(rg){try{rg.gain.value=b.st==='ground'?clamp(sp/(4*L),0,1)*0.12:0;if(rf)rf.frequency.value=220+sp*1.4;}catch(e){}}},
  ground(dt,now,act,sx,sy,sa,wheel,grd){const b=M.b,L=CFG.boardLen;const f=fwd(b.th),r=rgt(b.th);
    let vf=b.vx*f.x+b.vy*f.y,vl=b.vx*r.x+b.vy*r.y;
    /* steering vs tricks: a pinned tail + moving finger damps push/steer/twist; an armed flick freezes them */
    const gm=Tricks.pend?0:Tricks.prep?CFG.prepDamp:1;
    const df=(sx*f.x+sy*f.y)*gm,dl=(sx*r.x+sy*r.y)*gm;
    vf+=CFG.pushGain*df;vl+=CFG.pushGain*CFG.lateralPush*dl;
    const dir=vf<-0.15*L?-1:1;
    b.th+=CFG.steerGain*dl/L*dir+(sa*gm+wheel)*CFG.twistGain;
    vf=Kick.apply(now,grd,act.length,f,vf);
    if(b.snap){const s=b.snap*ease(25,dt);b.th+=s;b.snap-=s;if(Math.abs(b.snap)<1e-3)b.snap=0;}
    /* rolling: rolling resistance + v^2 air drag (+ a little drag from a two-finger grip) */
    {const dec=(CFG.rollRes*L+CFG.vDrag*vf*vf/L)*dt;vf=Math.abs(vf)<=dec?0:vf-Math.sign(vf)*dec;if(act.length>=2)vf*=Math.exp(-CFG.restDrag*dt);}
    /* lateral: static grip below the break speed, kinetic slide (powerslide) above it */
    if(Math.abs(vl)<=CFG.slideBreak*L){vl*=Math.exp(-CFG.staticGrip*dt);b.slide=0;}
    else{const dec=CFG.kineticDecel*L*dt;vl=Math.abs(vl)<=dec?0:vl-Math.sign(vl)*dec;b.slide=Math.abs(vl)/L;if(Math.random()<0.5)Anim.dust(1);}
    b.th+=CFG.carveGain*(b.roll/CFG.maxRoll)*(vf/L)*dt;
    const f2=fwd(b.th),r2=rgt(b.th);b.vx=f2.x*vf+r2.x*vl;b.vy=f2.y*vf+r2.y*vl;
    Tilt.update(dt,act,now);Manual.update(dt,now);
    if(b.land>0)b.land=Math.max(0,b.land-dt*4);},
  /* rigid body in the air: momentum and angular rates are conserved apart from small drag; fingers on the deck add
     friction forces (dragging) or a catch spring (resting) */
  air(dt,now,act,sx,sy,dA,wheel){const b=M.b,a=b.air,L=CFG.boardLen,I=Tricks.inertia(),rE=CFG.boardWid/2/L;a.t+=dt;
    b.vx+=CFG.airPush*CFG.pushGain*sx;b.vy+=CFG.airPush*CFG.pushGain*sy;
    /* two deck fingers twisting together grip the board's yaw (in-air 180s); the mouse wheel does the same */
    if(dA){b.yawRate+=(dA/dt-b.yawRate)*ease(CFG.airTwistGrip,dt);a.twisted=true;}
    if(wheel){b.yawRate+=wheel/Math.max(dt,1/60)*0.5;a.twisted=true;}
    let catching=null,catchK=0;
    if(!dA)for(const f of act){if(f.popper){f.lastT=null;continue;}const segs=Tricks.sweep(f);
      /* a finger resting on the board catches it; the grip builds up over catchRamp once it has been still for
         catchMinAge, so a drag that starts moving right away never brakes the spin */
      const vs=Input.vel(f,now,CFG.dragWin),stillNow=Math.hypot(vs.x,vs.y)/L<CFG.catchMaxSpeed&&Input.disp(f,now,0.06)/L<CFG.catchStillMove;
      if(Tricks.onBoard(f)&&stillNow){f.still=(f.still||0)+dt;const k=clamp((f.still-CFG.catchMinAge)/CFG.catchRamp,0,1);if(k>0&&(!catching||k>catchK)){catching=f;catchK=k;}continue;}
      f.still=0;
      /* friction drag along each swept segment: lateral slip spins the roll toward rollSpeedK*v/(W/2);
         strongest sliding OUT over a side edge, weak dragging inward */
      for(const seg of segs){const vwN=seg.vw;
      const out=vwN*seg.wm>0,ef=out?CFG.edgeMin+(1-CFG.edgeMin)*clamp((Math.abs(seg.wm)-0.2)/0.7,0,1):CFG.inwardFric;
      const tgt=CFG.rollSpeedK*vwN/rE,dw=(tgt-b.rollRate)*(1-Math.exp(-CFG.fricD*ef*seg.len));
      {b.rollRate+=dw;if(Math.abs(b.rollRate)>(a.rollPeak||0)){a.rollPeak=Math.abs(b.rollRate);a.rollSign=Math.sign(b.rollRate);}                                              /* friction pulls the deck toward the finger's slip */
        const J=dw*I.roll/rE;                                        /* lateral impulse that took (per unit mass) */
        b.yawRate+=CFG.yawCoupling*(seg.um*0.5)*J/I.yaw;              /* same force, lever u along the board */
        a.dragJ=(a.dragJ||0)+Math.abs(J);a.dragV=f.vw;}
      /* front finger sliding toward the nose levels the pitch */
      if(seg.um>0&&seg.vu>0)b.pitchRate-=CFG.pitchLevelK*seg.vu*seg.len/Math.max(0.5,Math.abs(seg.vu))*(b.pitch>0?1:0.3)/I.pitchS;}}
    if(catching&&catchK>=1&&!a.caught&&(Math.abs(b.rollRate)>3||Math.abs(wrapA(b.flip))>0.35||Math.abs(b.yawRate)>2||Math.abs(Tricks.yawErr())>0.2)){a.caught=true;a.catchAt={roll:+(b.flip/DEG).toFixed(0),rate:+b.rollRate.toFixed(1)};sfx('hop',0.3);
      Why.add('CATCH at roll '+(b.flip/DEG).toFixed(0)+'° (rate '+b.rollRate.toFixed(1)+' rad/s), yaw err '+(Tricks.yawErr()/DEG).toFixed(0)+'°','ok');M.log.push({t:+now.toFixed(3),ev:'catch',roll:+(b.flip/DEG).toFixed(0)});}
    a.catching=!!catching;
    /* flip / shove assist (no catch needed): aim the spin so the board comes round to the nearest flat roll and the
       nearest straight yaw exactly at touchdown, so landing doesn't hinge on split-second timing */
    if(!catching&&!dA&&!wheel&&CFG.flipAssist>0){const g=CFG.gravity*L,tl=(b.vz+Math.sqrt(Math.max(0,b.vz*b.vz+2*g*b.h)))/g;
      if(tl>0.03){const k=ease(CFG.flipAssist,dt);
        /* flips: how many turns comes from how hard the flick was (its peak spin), not from how long you're in the air */
        {const r=b.rollRate;let tg;
          if((a.rollPeak||0)>2){const n=a.rollPeak<CFG.flip2Rate?1:a.rollPeak<CFG.flip3Rate?2:3,sg=a.rollSign;tg=sg*n*TAU;if((tg-b.flip)*sg<-0.6)tg+=sg*TAU;}
          else tg=Math.round((b.flip+r*tl)/TAU)*TAU;
          let want=(tg-b.flip)/tl;if(Math.abs(r)>2)want=Math.sign(want||r)*clamp(Math.abs(want),0.3*Math.abs(r),2.5*Math.abs(r));b.rollRate+=(want-r)*k;}
        /* shove spin: 180 or 360 was decided at the pop (a.yawN); otherwise straighten to the nearest line */
        if(!a.twisted){const y=b.yawRate;let want;
          if(a.yawN){const tg=a.yawTh+a.yawSign*a.yawN*Math.PI;want=(tg-b.th)/tl;want=Math.sign(want||y)*clamp(Math.abs(want),0.3*Math.abs(y)||0.5,2.5*Math.abs(y)+3);}
          else{const e=Tricks.yawErr(),pe=e+y*tl,res=pe-Math.round(pe/Math.PI)*Math.PI;want=y-res/tl;}
          b.yawRate+=(want-y)*k;}}}
    /* integrate in substeps (the catch spring is stiff) */
    const n=4,h=dt/n,dr=Math.exp(-CFG.angDrag*h),dl=Math.exp(-CFG.airDrag*h);
    for(let i=0;i<n;i++){
      if(catching){const sp=(e,w,r)=>catchK*clamp(-w*w*e-2*w*r,-CFG.catchMaxAcc,CFG.catchMaxAcc);
        b.rollRate+=sp(b.flip-Math.round(b.flip/TAU)*TAU,CFG.catchW,b.rollRate)*h;
        b.yawRate+=sp(Tricks.yawErr(),CFG.catchYawW,b.yawRate)*h;
        b.pitchRate+=sp(b.pitch,CFG.catchW,b.pitchRate)*h;}
      b.pitchRate+=(-CFG.pitchSpring*b.pitch-CFG.pitchDamp*b.pitchRate)*h;
      b.rollRate*=dr;b.yawRate*=dr;b.vx*=dl;b.vy*=dl;
      b.flip+=b.rollRate*h;b.th+=b.yawRate*h;b.pitch+=b.pitchRate*h;
      b.vz-=CFG.gravity*L*h;b.h+=b.vz*h;b.x+=b.vx*h;b.y+=b.vy*h;
      if(b.h<=0&&b.vz<0){b.h=0;Tricks.land(now);return;}}
    a.maxH=Math.max(a.maxH,b.h);b.roll*=Math.exp(-10*dt);},
  /* bail: the board bounces and tumbles with heavy ground friction, settles grip-up or grip-down, then resets */
  bail(dt,now){const b=M.b,L=CFG.boardLen,I=Tricks.inertia(),n=4,h=dt/n;b.bailT-=dt;
    for(let i=0;i<n;i++){b.vz-=CFG.gravity*L*h;b.h+=b.vz*h;
      if(b.h<=0){b.h=0;if(b.vz<-0.3*L){b.vz=-b.vz*CFG.bailBounce;b.rollRate*=-0.5;Anim.dust(4);}else b.vz=0;}
      const onG=b.h<=0.5;
      if(onG){const k=Math.exp(-CFG.bailFric*h);b.vx*=k;b.vy*=k;b.yawRate*=Math.exp(-5*h);
        b.rollRate+=(-CFG.bailSettle*Math.sin(2*b.flip)/2)*h;b.rollRate*=Math.exp(-6*h);}
      b.pitchRate+=(-CFG.pitchSpring*b.pitch-CFG.pitchDamp*b.pitchRate)*h;
      b.flip+=b.rollRate*h;b.th+=b.yawRate*h;b.pitch+=b.pitchRate*h;b.x+=b.vx*h;b.y+=b.vy*h;}
    b.roll*=Math.exp(-8*dt);
    if(b.bailT<0.3){b.flip+=(Math.round(b.flip/TAU)*TAU-b.flip)*ease(16,dt);b.rollRate=0;}   /* pick the board back up */
    if(b.bailT<=0){b.st='ground';b.flip=0;b.pitch=0;b.roll=0;b.rollRate=b.yawRate=b.pitchRate=0;b.h=0;b.vz=0;Tricks.rearm(now);}}
};
/* kick push: ground finger swiping toward the tail = push along the heading (scaled by swipe speed and length,
   capped per push, diminishing near top speed); swiping toward the nose = foot brake */
const Kick={
  apply(now,grd,nDeck,f,vf){const L=CFG.boardLen;
    for(const g of grd){const dx=g.x-g.px,dy=g.y-g.py;g.px=g.x;g.py=g.y;
      if(dx||dy){const along=dx*f.x+dy*f.y,sd=along<0?1:-1;          /* sd: +1 push nose-first, -1 push tail-first (fakie) */
        if(sd*vf>=-0.2*L){const v=Input.vel(g,g.up||now,0.08),spd=Math.max(0,-sd*(v.x*f.x+v.y*f.y))/L;
          const sf=clamp(spd/CFG.kickRefSpeed,0.5,1.5),dim=sd*vf>0?Math.max(0,1-sd*vf/(CFG.kickTop*L)):1;
          const dv=Math.max(0,Math.min(CFG.kickGain*Math.abs(along)*sf*dim*(nDeck?1:CFG.kickNoDeck),CFG.kickMaxPerPush*L-g.pushed));
          if(dv>0){g.pushed+=dv;vf+=sd*dv;Anim.scuff(g,dx,dy);if(!g.pushSfx&&g.pushed>0.25*L){g.pushSfx=1;sfx('step',0.45);}}}
        else{const br=CFG.brakeGain*Math.abs(along);vf=vf>0?Math.max(0,vf-br):Math.min(0,vf+br);if(Math.abs(vf)>0.2*L)Anim.scuff(g,dx,dy);g.braked=(g.braked||0)+br;}}
      if(g.up&&!g.logged){g.logged=1;if(g.pushed>0||g.braked){M.log.push({t:+now.toFixed(3),ev:g.pushed>0?'kick':'brake',dv:+((g.pushed||g.braked||0)/L).toFixed(2)});Why.add((g.pushed>0?'KICK PUSH +':'FOOT BRAKE -')+((g.pushed||g.braked)/L).toFixed(2)+' L/s','ok');}}}
    return vf;}
};
const Tilt={
  update(dt,act,now){const b=M.b;let tail=0,nose=0,side=0,n=0;const on=act.filter(f=>f.deck&&Math.abs(f.un)<=1.35&&Math.abs(f.wn)<=2.2);
    if(on.length){let rear=on[0],front=on[0];for(const f of on){if(f.un<rear.un)rear=f;if(f.un>front.un)front=f;}
      const amt=v=>clamp((v-CFG.tailStart)/(CFG.tipEnd-CFG.tailStart),0,1),fk=f=>f.force==null?1:clamp(0.6+0.8*f.force,0.6,1.2);
      tail=Math.min(1,amt(-rear.un)*rear.p*fk(rear));nose=Math.min(1,amt(front.un)*front.p*fk(front));
      if(rear===front){if(rear.un<0)nose=0;else tail=0;}
      for(const f of on){const a=Math.abs(f.wn);if(a>CFG.sideStart)side+=Math.sign(f.wn)*clamp((a-CFG.sideStart)/(1-CFG.sideStart),0,1)*f.p;n++;}side=clamp(side/n,-1,1);}
    let pt=(tail-nose)*CFG.maxPitch;
    if(Manual.on){const t=now*1;pt+=Math.sign(pt||1)*CFG.manualWobble*CFG.maxPitch*Math.sin(t*2.3)*Math.sin(t*0.7+1);}
    b.pitch+=(pt-b.pitch)*ease(CFG.tiltResp,dt);b.roll+=(side*CFG.maxRoll-b.roll)*ease(CFG.tiltResp,dt);
    M.tilt={tail,nose,side};}
};

/* ============================== TRICKS ============================== */
const Tricks={
  prep:false,pend:null,
  inertia(){const w=CFG.boardWid/CFG.boardLen,t=CFG.deckThick/CFG.boardLen;
    return{yaw:(1+w*w)/12*CFG.yawIScale,roll:(w*w+t*t)/12*CFG.rollIScale,pitch:(1+t*t)/12*CFG.pitchIScale,pitchS:CFG.pitchIScale};},
  /* the finger is on the drawn board (narrower while it is edge-on mid-flip) */
  onBoard(f){return Math.abs(f.un)<=1.08&&Math.abs(f.wn)<=this.wLim();},
  wLim(){return Math.max(0.3,Math.abs(Math.cos(M.b.flip)))+CFG.contactW;},
  /* the finger's path since last frame, segment by segment between its actual event samples (coalesced ones too),
     read in the board frame from when it touched: for each segment the part on the deck (length L), its middle (u,v
     normalised) and its own lateral velocity. Sampling- and frame-rate independent. */
  sweep(f){const h=f.hist,out=[],W=this.wLim(),Lw=CFG.boardWid/2/CFG.boardLen;let i=h.length-1;while(i>0&&h[i-1].t>(f.lastT??-1))i--;
    if(f.lastT==null){f.lastT=Math.max(h[0].t,M.b.air?M.b.air.tOff:0);i=1;}   /* never replay what happened before the pop */
    for(;i<h.length;i++){const a=h[i-1],c=h[i];if(c.t<=f.lastT)continue;f.lastT=c.t;
      const p=Board.localTh(a.x,a.y,f.thd),q=Board.localTh(c.x,c.y,f.thd),du=q.un-p.un,dw=q.wn-p.wn;let t0=0,t1=1,ok=true;
      for(const[x,d,lim]of[[p.un,du,1.08],[p.wn,dw,W]]){if(Math.abs(d)<1e-9){if(Math.abs(x)>lim)ok=false;continue;}
        let ta=(-lim-x)/d,tb=(lim-x)/d;if(ta>tb)[ta,tb]=[tb,ta];t0=Math.max(t0,ta);t1=Math.min(t1,tb);}
      if(!ok||t1<=t0)continue;const k=t1-t0,tm=(t0+t1)/2,dt=Math.max(0.004,c.t-a.t);
      out.push({len:k*Math.hypot(du*0.5,dw*Lw),um:p.un+du*tm,wm:p.wn+dw*tm,vw:dw*Lw/dt,vu:du*0.5/dt});}
    return out;},
  /* yaw error against the travel direction, period pi (regular or fakie); at a standstill against the take-off heading */
  yawErr(){const b=M.b,sp=Math.hypot(b.vx,b.vy),ref=sp>0.4*CFG.boardLen?Math.atan2(b.vy,b.vx):(b.air?b.air.th0:b.th);
    let e=wrapA(b.th-ref);if(e>Math.PI/2)e-=Math.PI;else if(e<-Math.PI/2)e+=Math.PI;return e;},
  measure(f,now,L,fw,rg){const te=f.up||now;const v=Input.vel(f,te,CFG.velWin);f.vu=(v.x*fw.x+v.y*fw.y)/L;f.vw=(v.x*rg.x+v.y*rg.y)/L;f.sp=Math.hypot(f.vu,f.vw);
    f.disp=Input.disp(f,te,0.15)/L;},
  /* pop trigger: the only thing detected is a tail (nose) finger snapping toward its end fast enough. Everything that
     follows (height, spin, pitch, roll leak) is the impulse it delivers at its contact point. */
  detect(now){const b=M.b;if(M.over||b.st==='bail'){this.pend=null;return;}
    const L=CFG.boardLen,fw=fwd(b.th),rg=rgt(b.th);
    const deck=[...Input.F.values()].filter(f=>f.deck&&(!f.up||now-f.up<0.1));
    for(const f of deck)this.measure(f,now,L,fw,rg);
    if(b.st!=='ground'){this.pend=null;return;}
    if(this.pend){const P=this.pend,F=P.F,snap=P.e*F.vu;if(snap>P.peak){P.peak=snap;P.vu=F.vu;P.vw=F.vw;}
      if(!P.fireAt){if(F.up||snap<0.55*P.peak||now-P.t0>=0.08||!Input.F.has(F.id))P.fireAt=now+CFG.trickConfirm;return;}
      if(now<P.fireAt)return;this.pend=null;F.disp=Input.disp(F,F.up||now,now-P.t0+0.12)/L;
      if(this.mate(F,now,P.t0)){Why.add('NO POP: another deck finger moved with it (steering / twist)');return;}
      this.launch(now,P);return;}
    const minS=thr('popSnapMin'),minD=thr('popMinDist');let reason='';
    const cand=deck.filter(f=>!f.used&&(f.role==='tail'||f.role==='nose')).map(f=>({f,e:f.role==='tail'?-1:1})).map(o=>(o.s=o.e*o.f.vu,o)).sort((x,y)=>y.s-x.s);
    for(const{f:F,e,s}of cand){if(s<minS*0.6)break;
      if(this.mate(F,now)){reason='two fingers moving = steering / twist';continue;}
      if(s<minS){reason=(e<0?'tail':'nose')+' snap '+s.toFixed(1)+' L/s under '+minS.toFixed(1)+' (slow drag = tilt / manual)';continue;}
      if(F.disp<minD){reason='snap too short ('+F.disp.toFixed(2)+' L)';continue;}
      this.pend={F,e,t0:now,peak:s,vu:F.vu,vw:F.vw};if(F.up)this.detect(now);return;}
    if(reason)Why.add('NO POP: '+reason);},
  /* any other deck finger whose touch overlapped this snap and moved a comparable amount = two-finger gesture */
  mate(F,now,before){const L=CFG.boardLen,from=F.t0-0.3,end=F.up||now;
    return[...Input.F.values(),...Input.gone].find(o=>o!==F&&o.deck&&o.t0<(before||end)&&(!o.up||o.up>from)&&
      ((!o.up&&o.sp>=CFG.companion*F.sp)||Input.disp(o,o.up||now,(o.up||now)-Math.max(o.t0,from))/L>=Math.max(0.08,0.35*F.disp)));},
  /* the pop impulse, applied at the finger's contact point r=(u,v) on the board */
  launch(now,P){const b=M.b,L=CFG.boardLen,I=Tricks.inertia(),F=P.F,snap=P.peak,lat=P.vw;
    const vf=Math.abs(b.vx*Math.cos(b.th)+b.vy*Math.sin(b.th))/L,speedF=1+CFG.popSpeedBonus*clamp(vf/CFG.topSpeed,0,1);
    const hold=clamp((P.t0-0.06-F.t0)/CFG.preloadT,0,1),preF=1+CFG.preloadBonus*hold;
    const vz=clamp(CFG.popGain*snap*speedF*preF,CFG.popVzMin,CFG.popVzMax);
    const ru=clamp(F.lu,-1,1)*0.5,rv=clamp(F.lw,-1,1)*CFG.boardWid/2/L;          /* contact point in L */
    const dead=CFG.popLatDead*snap,jl=Math.sign(lat)*Math.max(0,Math.abs(lat)-dead)*CFG.popLatGain;
    Manual.finish(now);
    b.yawRate=ru*jl/I.yaw;                                  /* lateral impulse x lever along the board = shove spin */
    b.rollRate=-rv*vz*CFG.rollLeak/I.roll;                  /* off-centre strike leaks a little roll */
    b.pitchRate=-P.e*CFG.popPitchGain*snap/I.pitchS;         /* striking the tail kicks the nose up */
    b.st='air';b.h=0.01;b.vz=vz*L;b.snap=0;F.used=true;F.popper=true;Input.acc={x:0,y:0,a:0};
    for(const g of Input.F.values())g.lastT=null;
    b.air={t:0,tOff:now,th0:b.th,fakie:(b.vx*Math.cos(b.th)+b.vy*Math.sin(b.th))<-0.3*L,pop:P.e<0?'OLLIE':'NOLLIE',maxH:0,caught:false,twisted:false,snap,vz,jl,yaw0:b.yawRate,roll0:b.rollRate};
    {const y=b.yawRate,Tair=2*vz/CFG.gravity;if(Math.abs(y)>2){const a=b.air;a.yawSign=Math.sign(y);a.yawN=Math.max(1,Math.round(Math.abs(y)*Tair/Math.PI-CFG.shoveBias));a.yawTh=b.th-Tricks.yawErr();}}
    sfx('ollie',0.3+0.15*vz);
    const H=vz*vz/(2*CFG.gravity);
    M.log.push({t:+now.toFixed(3),ev:'pop',kind:b.air.pop,snap:+snap.toFixed(2),lat:+lat.toFixed(2),vz:+vz.toFixed(2),H:+H.toFixed(2),yawRate:+b.yawRate.toFixed(2),rollRate:+b.rollRate.toFixed(2),speed:+vf.toFixed(2),pre:+preF.toFixed(2)});
    Why.add('POP '+b.air.pop+': snap '+snap.toFixed(1)+' L/s · vz '+vz.toFixed(1)+' (H '+H.toFixed(2)+' L) · lat '+jl.toFixed(2)+' → yaw '+b.yawRate.toFixed(1)+' rad/s','ok');},
  /* touchdown: land if the board is wheels-down within landRollTol, aligned with travel within landYawTol and not still
     spinning hard; the trick is named from the rotation that actually happened */
  land(now){const b=M.b,a=b.air,L=CFG.boardLen;b.h=0;
    const rollErr=Math.abs(b.flip-Math.round(b.flip/TAU)*TAU)/DEG,yawErr=Math.abs(this.yawErr())/DEG,rr=Math.abs(b.rollRate);
    let why=null;if(rollErr>CFG.landRollTol)why=(Math.cos(b.flip)<0?'LANDED UPSIDE DOWN':'LANDED ON THE EDGE')+' ('+rollErr.toFixed(0)+'°)';
    else if(yawErr>CFG.landYawTol)why='LANDED SIDEWAYS ('+yawErr.toFixed(0)+'°)';
    else if(rr>CFG.landRollRateMax)why='STILL FLIPPING ('+rr.toFixed(1)+' rad/s)';
    const turns=Math.round(b.flip/TAU),yawAcc=b.th-a.th0,nh=Math.round(yawAcc/Math.PI);
    M.log.push({t:+now.toFixed(3),ev:'land',rollErr:+rollErr.toFixed(1),yawErr:+yawErr.toFixed(1),rollRate:+rr.toFixed(1),turns,halfs:nh,caught:a.caught,why});
    Why.add((why?'BAIL: '+why:'LANDED')+' · roll err '+rollErr.toFixed(0)+'° yaw err '+yawErr.toFixed(0)+'° roll rate '+rr.toFixed(1),why?'no':'ok');
    if(why){this.bail(why,now);return;}
    const vzIn=b.vz;b.vz=0;b.st='ground';b.air=null;
    b.roll=clamp(b.flip-turns*TAU,-0.3,0.3);b.flip=0;b.rollRate=b.yawRate=b.pitchRate=0;b.pitch=-0.05;b.land=1;   /* leftover tilt eases out */
    const info={fakie:a.fakie,pop:a.pop,turns:Math.abs(turns),kick:turns<0,half:a.twisted?0:Math.abs(nh),bs:nh>0,popShove:a.maxH>=CFG.popShoveH*L,extra:a.twisted?nh:0,
      hN:a.maxH/(CFG.hMax*L),clean:rollErr<CFG.cleanTol&&yawErr<CFG.cleanTol,caught:a.caught};
    Score.land(info,now);this.rearm(now);sfx('land',clamp(-vzIn/(4*L),0.3,0.8));Anim.dust(10);},
  /* bad touchdown: the edge hits first at offset (W/2)sin(roll) -> bounce + tumble */
  bail(why,now){const b=M.b,L=CFG.boardLen;Manual.cancel();const vzIn=Math.abs(b.vz)/L,s=Math.sin(b.flip),d=CFG.boardWid/2/L*s;
    b.st='bail';b.air=null;b.bailT=CFG.bailTime;b.h=0;
    b.vz=CFG.bailBounce*vzIn*(0.4+Math.abs(s))*L;
    b.rollRate+=Math.sign(s||1)*CFG.bailTumble*vzIn*Math.abs(d)/Tricks.inertia().roll;
    b.yawRate+=Math.sign(b.yawRate||s||1)*CFG.bailYawK*vzIn*(0.3+Math.abs(s));b.vx*=0.7;b.vy*=0.7;
    Score.bail(why,now);sfx('bail');M.shake=0.35;Anim.dust(16);for(const f of Input.F.values()){f.used=true;f.born='bail';}},
  rearm(now){this.pend=null;for(const f of Input.F.values()){f.used=false;f.born='ground';f.popper=false;}}
};
const Manual={
  on:null,cand:0,candKind:null,
  update(dt,now){const b=M.b,pn=b.pitch/CFG.maxPitch,spd=Math.hypot(b.vx,b.vy)/CFG.boardLen;
    const kind=(pn>=CFG.manualLo&&pn<=CFG.manualHi)?'MANUAL':(-pn>=CFG.manualLo&&-pn<=CFG.manualHi)?'NOSE MANUAL':null;
    const m=this.on;
    if(!m){if(kind&&spd>=CFG.manualMinSpeed){if(this.candKind===kind)this.cand+=dt;else{this.candKind=kind;this.cand=dt;}
        if(this.cand>=CFG.manualHold){this.on={kind,t:this.cand,out:0};Score.touch();M.log.push({t:+now.toFixed(3),ev:'manualStart',kind});}}
      else{this.cand=0;this.candKind=null;}return;}
    if(kind===m.kind){m.t+=dt;m.out=0;}else m.out+=dt;
    Score.touch();
    if(m.out>CFG.manualGrace||spd<CFG.manualMinSpeed*0.7)this.finish(now);},
  finish(now){const m=this.on;this.on=null;this.cand=0;this.candKind=null;if(m&&m.t>=CFG.manualHold)Score.manual(m.kind,m.t,now);},
  cancel(){this.on=null;this.cand=0;this.candKind=null;}
};

/* =============================== SCORE ============================== */
const Score={
  init(){M.sc={score:0,best:+lsGet(CFG.bestKey,0)||0,list:[],pts:0,win:0,tricks:0,newBest:false,bestCombo:0};M.score=0;},
  mult(){return Math.min(CFG.comboMax,Math.max(1,M.sc.list.length));},
  touch(){M.sc.win=CFG.comboWindow;},
  add(name,pts,now,ex){const s=M.sc;s.list.push(name);s.pts+=pts;s.win=CFG.comboWindow;s.tricks++;
    Anim.pop(name,'+'+pts+(s.list.length>1?'  x'+this.mult():''),ex&&ex.clean?'#7dff6a':'#ffc23d',ex&&ex.caught?'CAUGHT':ex&&ex.clean?'CLEAN':'');
    M.log.push({t:+now.toFixed(3),ev:'trick',name,pts,mult:this.mult(),clean:!!(ex&&ex.clean)});},
  /* names come from what actually happened in the air: pop (ollie/nollie) + shove spin + flip turns + body 180s
     BS shove + kickflip = varial kickflip, FS shove + kickflip = hardflip, FS shove + heelflip = varial heelflip,
     BS shove + heelflip = inward heelflip, BS 360 shove + kickflip = 360 flip, FS 360 shove + heelflip = laser flip */
  name(i){return(i.fakie?'FAKIE ':'')+this.name0(i);},
  name0(i){const nol=i.pop==='NOLLIE'?'NOLLIE ':'';let core='';
    if(i.turns){const m=i.turns===2?'DOUBLE ':i.turns>=3?'TRIPLE ':'',k=i.kick;
      core=m+(!i.half?(k?'KICKFLIP':'HEELFLIP'):i.half===1?(k?(i.bs?'VARIAL KICKFLIP':'HARDFLIP'):(i.bs?'INWARD HEELFLIP':'VARIAL HEELFLIP'))
        :(k?(i.bs?'360 FLIP':'360 HARDFLIP'):(i.bs?'360 INWARD HEELFLIP':'LASER FLIP')));}
    else if(i.half)core=(i.bs?'':'FS ')+(i.half>=2?'360 SHOVE-IT':i.popShove?'POP SHOVE-IT':'SHOVE-IT');
    if(i.extra){const pre=(i.extra>0?'FS ':'BS ')+(180*Math.abs(i.extra));return nol+pre+(core?' '+core:'');}
    return core?nol+core:i.pop;},
  land(info,now){const name=this.name(info);let pts=info.half?(info.half>=2?CFG.pts['360 SHOVE-IT']:info.popShove?CFG.pts['POP SHOVE-IT']:CFG.pts['SHOVE-IT']):CFG.pts[info.pop];
    if(info.half&&info.pop==='NOLLIE')pts+=30;
    if(info.turns)pts+=info.turns*CFG.flipPts+(info.turns-1)*CFG.multiFlipBonus+(info.half?CFG.varialBonus*info.half:0);
    if(info.extra)pts+=CFG.rot180*Math.abs(info.extra);
    pts*=1+CFG.heightBonus*clamp(info.hN,0,1);if(info.clean)pts*=1+CFG.cleanBonus;
    this.add(name,Math.round(pts/10)*10,now,info);},
  manual(kind,t,now){const pts=Math.round((kind==='MANUAL'?CFG.manualRate:CFG.noseManualRate)*t/10)*10;this.add(kind,Math.max(10,pts),now,null);},
  update(dt,now){const s=M.sc,b=M.b;if(!s.list.length)return;if(b.st==='ground'&&!Manual.on){s.win-=dt;if(s.win<=0)this.bank(now);}},
  bank(now){const s=M.sc;if(!s.list.length)return;const m=this.mult(),tot=Math.round(s.pts*m);s.score+=tot;s.bestCombo=Math.max(s.bestCombo,tot);
    if(s.list.length>1){Anim.pop('COMBO x'+m,'+'+tot,'#ff3d9a','',true);sfx('ok',0.4);}
    M.log.push({t:+(now||0).toFixed(3),ev:'bank',tot,mult:m,n:s.list.length});s.list=[];s.pts=0;s.win=0;M.score=s.score;
    if(s.score>s.best){s.best=s.score;s.newBest=true;lsSet(CFG.bestKey,s.best);}},
  bail(why,now){const s=M.sc,lost=s.list.length;s.list=[];s.pts=0;s.win=0;Anim.pop('BAIL!',why+(lost?' · COMBO LOST':''),'#ff5a5a','',true);
    M.log.push({t:+now.toFixed(3),ev:'bail',why,lost});}
};

/* =============================== ANIM =============================== */
/* 16-bit look: the world renders into a low-res canvas scaled up with
   nearest-neighbour; HUD text renders crisp on top. */
const TEX={grip:null,bottom:null};
function deckInside(L,W,x,y){const u=x+0.5-L/2,w=y+0.5-W/2,R=W/2,cu=clamp(u,-(L/2-R),L/2-R);return R-Math.hypot(u-cu,w);}
/* Board sprites. Everything is FLAT art painted on the two faces of the deck:
   the trucks and wheels are part of the underside picture (no 3D boxes hanging
   off the board), so a flip just turns a flat card over. Textures are PAD px
   taller on each side so the wheels can peek out past the deck edge. */
const PAD=3;
function makeTex(){const L=CFG.boardLen,W=CFG.boardWid,H=W+2*PAD,tU=Math.round(CFG.truckU*L);
  const hsh=(x,y,s)=>{let h=(x*374761393+y*668265263+s*982451653)|0;h=(h^(h>>>13))*1274126177|0;return((h^(h>>>16))>>>0)/4294967296;};
  const box=(g,x,y,w,h,col,oc)=>{if(oc){g.fillStyle=oc;g.fillRect(x-1,y-1,w+2,h+2);}g.fillStyle=col;g.fillRect(x,y,w,h);};
  /* wheel nubs that peek out past the deck edge (same flat pixels on both faces) */
  const nubs=(g,full)=>{for(const s of[-1,1]){const x=Math.round(L/2+s*tU)-3;
    for(const top of[true,false]){const y=top?(full?0:0):(full?PAD+W-4:PAD+W),h=full?PAD+4:PAD;
      box(g,x,y,7,h,'#efe6d2','#14101a');g.fillStyle='#c9bea8';g.fillRect(x+5,y,2,h);g.fillStyle='#fffaf0';g.fillRect(x+1,y,1,h);}}};
  /* ---------- grip side ---------- */
  {const c=mk(L,H),g=c.getContext('2d');                                       /* grip side: no wheels showing */
    const id=g.getImageData(0,0,L,H),d=id.data;
    for(let y=0;y<W;y++)for(let x=0;x<L;x++){const ins=deckInside(L,W,x,y);if(ins<0)continue;const i=((y+PAD)*L+x)*4;let r=48,gg=45,bb=56;const h=hsh(x,y,1);
      if(h<0.14){r=70;gg=66;bb=80;}else if(h<0.26){r=33;gg=30;bb=40;}
      const u=x+0.5-L/2,kick=Math.abs(u)>L/2-17;
      if(kick){r*=0.78;gg*=0.78;bb*=0.84;}                                      /* kicktails turn up = a touch darker */
      if(Math.abs(Math.abs(u)-(L/2-17))<0.6){r=78;gg=74;bb=86;}                 /* bend line where the kick starts */
      if(u<-L/2+14&&hsh(x,y,7)<0.3){r=98;gg=94;bb=104;}                        /* tail wear from pops */
      const wv=y+0.5-W/2;if(!kick&&Math.abs(wv)>W/2-4){r*=1.12;gg*=1.12;bb*=1.1;} /* concave: rails catch the light */
      if(ins<1.2){r=14;gg=11;bb=18;}else if(ins<2.2&&y<W/2){r+=16;gg+=16;bb+=18;}
      d[i]=r;d[i+1]=gg;d[i+2]=bb;d[i+3]=255;}
    g.putImageData(id,0,0);
    for(const s of[-1,1])for(const du of[-3,3])for(const dw of[-4,4]){const x=Math.round(L/2+s*tU+du),y=PAD+Math.round(W/2+dw)-1;g.fillStyle='#5a5a66';g.fillRect(x,y+1,1,1);g.fillStyle='#d8dce4';g.fillRect(x,y,1,1);}
    g.fillStyle='#ffc627';const nx=L-12,cy=PAD+W/2;for(let k=0;k<4;k++){g.fillRect(nx-k,cy-1-k,1,1);g.fillRect(nx-k,cy+k,1,1);}g.fillRect(nx+1,cy-1,1,2);
    TEX.grip=c;}
  /* ---------- underside: graphic + flat trucks and wheels (authored upside down: the flip mirrors it back) ---------- */
  {const c=mk(L,H),g=c.getContext('2d');
    const id=g.getImageData(0,0,L,H),d=id.data;
    for(let y=0;y<W;y++)for(let x=0;x<L;x++){const ins=deckInside(L,W,x,y);if(ins<0)continue;const i=((y+PAD)*L+x)*4;let col=[140,29,64];
      const u=x+0.5-L/2,w=y+0.5-W/2;
      if(Math.abs(w)<3.5)col=[255,198,39];else if(Math.abs(w)<4.5)col=[110,20,48];
      if(u>L/2-30&&Math.abs(w)<((L/2-u)*0.5)&&((x>>1)+(y>>1))%3===0)col=[255,61,154];
      if(ins<1.6)col=[226,184,122];if(ins<0.8)col=[176,128,74];if(ins<0.4)col=[20,14,22];   /* plywood rim */
      d[i]=col[0];d[i+1]=col[1];d[i+2]=col[2];d[i+3]=255;}
    g.putImageData(id,0,0);
    const GL={T:['111','010','010','010','010'],S:['111','100','111','001','111'],R:['110','101','110','101','101']};
    let gx=Math.round(L/2-11);for(const ch of'TSR'){const gl=GL[ch];for(let yy=0;yy<5;yy++)for(let xx=0;xx<3;xx++)if(gl[yy][xx]==='1'){g.fillStyle='#14101a';g.fillRect(gx+xx*2+1,PAD+Math.round(W/2-5)+yy*2+1,2,2);g.fillStyle='#fbeef6';g.fillRect(gx+xx*2,PAD+Math.round(W/2-5)+yy*2,2,2);}gx+=8;}
    /* trucks, drawn flat: baseplate, hanger across the deck, kingpin, axle nuts; wheels already painted by nubs() */
    for(const s of[-1,1]){const cx=Math.round(L/2+s*tU),cy=PAD+W/2;
      box(g,cx-5,cy-5,10,10,'#7d838e','#14101a');                                   /* baseplate */
      g.fillStyle='#14101a';for(const bx of[-3,2])for(const by of[-4,3])g.fillRect(cx+bx,cy+by,1,1);
      box(g,cx-2,PAD+1,4,W-2,'#c6ccd4','#14101a');                                  /* hanger */
      g.fillStyle='#eef1f5';g.fillRect(cx-2,PAD+1,1,W-2);g.fillStyle='#8f96a1';g.fillRect(cx+1,PAD+1,1,W-2);
      box(g,cx-s*4-1,cy-2,3,4,'#ff7a3d','#14101a');                                 /* bushing */
      g.fillStyle='#ffc23d';g.fillRect(cx-s*4,cy-1,1,2);                            /* kingpin */
      g.fillStyle='#3a3f48';}
    nubs(g,true);                                                                   /* wheels sit over the hanger ends */
    for(const s of[-1,1]){const cx=Math.round(L/2+s*tU);g.fillStyle='#3a3f48';g.fillRect(cx-1,0,2,1);g.fillRect(cx-1,H-1,2,1);}  /* axle nuts */
    const f=mk(L,H),fg=f.getContext('2d');fg.translate(0,H);fg.scale(1,-1);fg.drawImage(c,0,0);TEX.bottom=f;}
}
const OUTLINE=(()=>{const L=CFG.boardLen,W=CFG.boardWid,R=W/2,a=L/2-R,p=[];for(let i=0;i<=10;i++){const t=-Math.PI/2+Math.PI*i/10;p.push([a+Math.cos(t)*R,Math.sin(t)*R]);}
  for(let i=0;i<=10;i++){const t=Math.PI/2+Math.PI*i/10;p.push([-a+Math.cos(t)*R,Math.sin(t)*R]);}return p;})();

/* procedural plaza: concrete slabs, brick bands, gum, cracks, skate marks, palm shadows */
const Plaza={
  C:128,cache:new Map(),
  hash(a,b,s){let h=(a*73856093^b*19349663^s*83492791)|0;h=Math.imul(h^(h>>>15),2246822519);h=Math.imul(h^(h>>>13),3266489917);return((h^(h>>>16))>>>0)/4294967296;},
  rng(seed){let s=(seed>>>0)||1;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};},
  chunk(cx,cy){const key=cx+','+cy;let c=this.cache.get(key);if(c){this.cache.delete(key);this.cache.set(key,c);return c;}
    c=this.gen(cx,cy);this.cache.set(key,c);if(this.cache.size>48)this.cache.delete(this.cache.keys().next().value);return c;},
  gen(cx,cy){const C=this.C,c=mk(C,C),g=c.getContext('2d'),id=g.createImageData(C,C),d=id.data;const md=(v,m)=>((v%m)+m)%m;
    for(let y=0;y<C;y++)for(let x=0;x<C;x++){const wx=cx*C+x,wy=cy*C+y,i=(y*C+x)*4;let col;
      const bandY=md(Math.floor(wy/32),7)===3,bandX=md(Math.floor(wx/32),9)===4;
      if(bandY||bandX){const lx=bandY?wx:wy,ly=md(bandY?wy:wx,32),row=Math.floor(ly/8),bx=md(lx+(row%2)*8,16);
        if(ly%8===0||bx===0)col=[118,96,84];else{const hb=this.hash(Math.floor((lx+(row%2)*8)/16),Math.floor((bandY?wy:wx)/8),5);col=hb<0.33?[168,92,70]:hb<0.66?[152,80,60]:[180,102,78];if(this.hash(wx,wy,9)<0.12)col=col.map(v=>v-14);}}
      else{const jx=md(wx,32),jy=md(wy,32);if(jx===0||jy===0)col=[138,130,118];else if(jx===1||jy===1)col=[204,197,184];
        else{const h=this.hash(wx,wy,3);col=h<0.14?[198,190,177]:h<0.3?[172,164,151]:h<0.33?[160,152,140]:[186,178,165];}}
      d[i]=col[0];d[i+1]=col[1];d[i+2]=col[2];d[i+3]=255;}
    g.putImageData(id,0,0);
    const R=this.rng((cx*928371+cy*12345701)^0x5bd1e995),px=(x,y,cl)=>{g.fillStyle=cl;g.fillRect(x|0,y|0,1,1);},ri=(a,b)=>a+Math.floor(R()*(b-a+1));
    if(R()<0.4){const ox=ri(20,108),oy=ri(20,108),rr=ri(6,12);g.fillStyle='rgba(40,34,30,0.10)';for(let k=0;k<5;k++){g.beginPath();g.ellipse(ox+ri(-3,3),oy+ri(-2,2),rr*(0.5+R()*0.6),rr*(0.35+R()*0.4),R()*3,0,TAU);g.fill();}}
    for(let k=0;k<26;k++){const x=ri(2,125),y=ri(2,125);px(x,y,R()<0.5?'#6e6962':'#57524c');if(R()<0.3)px(x+1,y,'#6e6962');}
    for(let k=0;k<ri(0,2);k++){let x=ri(10,118),y=ri(10,118);const n=ri(10,34);let ang=R()*TAU;for(let s=0;s<n;s++){px(x,y,'#7c756b');ang+=(R()-0.5)*0.9;x=clamp(x+Math.cos(ang),3,124);y=clamp(y+Math.sin(ang),3,124);}}
    if(R()<0.55){const x0=ri(10,90),y0=ri(10,118),n=ri(14,30),dy=(R()-0.5)*0.4;g.globalAlpha=0.35;for(let s=0;s<n;s++){px(x0+s,y0+s*dy,'#3e3834');px(x0+s,y0+s*dy+3,'#3e3834');}g.globalAlpha=1;}
    if(R()<0.4){const x0=ri(10,100),y0=ri(10,118),n=ri(8,18);for(let s=0;s<n;s++)px(x0+s,y0,'#d6d0c5');}
    for(let k=0;k<ri(1,4);k++){const x=ri(4,122),y=ri(4,122);const lc=['#8a9a3a','#b8862e','#6d7d2e','#c8a040'][ri(0,3)];px(x,y,lc);px(x+1,y,lc);if(R()<0.6)px(x,y+1,lc);}
    if(R()<0.15){const gx=ri(1,2)*32+8,gy=ri(1,2)*32+12;g.fillStyle='#9a948a';g.fillRect(gx-1,gy-1,16,8);g.fillStyle='#3a3530';g.fillRect(gx,gy,14,6);g.fillStyle='#211d1a';for(let k=0;k<14;k+=2)g.fillRect(gx+k,gy,1,6);}
    if(R()<0.08){const GL={T:['111','010','010','010','010'],S:['111','100','111','001','111'],R:['110','101','110','101','101']};let gx=ri(16,80);const gy=ri(16,100);
      for(const ch of'TSR'){const gl=GL[ch];for(let yy=0;yy<5;yy++)for(let xx=0;xx<3;xx++)if(gl[yy][xx]==='1'&&R()>0.15){g.fillStyle='rgba(232,184,48,0.75)';g.fillRect(gx+xx*3,gy+yy*3,3,3);}gx+=12;}}
    if(R()<0.3){const ox=ri(46,82),oy=ri(46,82),n=ri(7,9),a0=R()*TAU;g.strokeStyle='rgba(40,28,52,0.16)';g.lineCap='round';
      g.fillStyle='rgba(40,28,52,0.13)';
      for(let k=0;k<n;k++){const a=a0+k*TAU/n+(R()-0.5)*0.3,len=ri(28,42),bend=(R()-0.5)*0.5;
        for(let s=4;s<len;s+=2){const q=s/len,an=a+bend*q*q,x=ox+Math.cos(an)*s,y=oy+Math.sin(an)*s,lf=Math.max(1,(1-q)*7*Math.sin(Math.PI*Math.min(1,q*1.3)));
          const nx=-Math.sin(an),ny=Math.cos(an);for(const sd of[-1,1]){g.beginPath();g.moveTo(x,y);g.lineTo(x+nx*sd*lf+Math.cos(an)*lf*0.6,y+ny*sd*lf+Math.sin(an)*lf*0.6);g.lineTo(x+Math.cos(an)*1.5,y+Math.sin(an)*1.5);g.fill();}}}
      g.beginPath();g.arc(ox,oy,4,0,TAU);g.fill();}
    return c;},
  draw(lg,ox,oy,W,H){const C=this.C;const x0=Math.floor(ox/C),y0=Math.floor(oy/C),x1=Math.floor((ox+W)/C),y1=Math.floor((oy+H)/C);
    for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++)lg.drawImage(this.chunk(cx,cy),cx*C-ox,cy*C-oy);}
};

const Anim={
  lc:null,lg:null,PX:0,vig:null,
  view(c){const PX=Math.max(1,Math.round(Math.min(c.width,c.height)/CFG.viewShort)),W=Math.ceil(c.width/PX),H=Math.ceil(c.height/PX);
    const D=Math.ceil(2*Math.hypot(W/2,H*Math.max(CFG.anchorY,1-CFG.anchorY)))+6;
    if(!this.lc||this.lc.width!==D||this.PX!==PX||!this.vig||this.vig.width!==W||this.vig.height!==H){this.lc=mk(D,D);this.lg=this.lc.getContext('2d');this.lg.imageSmoothingEnabled=false;this.PX=PX;this.vig=null;}
    Cam.D=D;Cam.ax=W/2;Cam.ay=H*CFG.anchorY;M.view={W,H,PX};},
  camera(dt){const b=M.b,cm=M.cam,D=Cam.D;const k=ease(CFG.camFollow,dt);cm.x+=(b.x-cm.x)*k;cm.y+=(b.y-cm.y)*k;
    const dx=b.x-cm.x,dy=b.y-cm.y,d=Math.hypot(dx,dy);if(d>CFG.camMaxOff){cm.x=b.x-dx/d*CFG.camMaxOff;cm.y=b.y-dy/d*CFG.camMaxOff;}
    /* turn with the board on the ground (nose up the screen); hold still in the air and during a bail */
    const vfw=(b.vx*Math.cos(b.th)+b.vy*Math.sin(b.th))/CFG.boardLen;if(!Cam.init)M.camDir=1;if(b.st==='ground'&&[...Input.F.values()].filter(f=>f.deck&&!f.up).length<2){if(vfw<-CFG.camFlipSpeed)M.camDir=-1;else if(vfw>CFG.camFlipSpeed)M.camDir=1;}   /* not mid two-finger stroke */
    const tgt=b.th+M.camDir*Math.PI/2;if(!Cam.init||!dt){if(!Cam.init){Cam.phi=tgt;Cam.init=true;}Cam.w=0;}
    else{let d0=b.st==='ground'?wrapA(tgt-Cam.phi)*ease(CFG.camRot,dt):0;const mx=CFG.camMaxRate*dt;d0=clamp(d0,-mx,mx);Cam.phi+=d0;Cam.w=d0/dt;}
    M.ox=Math.round(cm.x-D/2);M.oy=Math.round(cm.y-D/2);Board.bs={x:b.x-M.ox,y:b.y-M.oy};Board.fr=null;},
  /* ground-finger scuff: dust kicked up where the push swipe drags (world coords) */
  scuff(g,dx,dy){if(M.parts.length>160)return;for(let i=0;i<3;i++)M.parts.push({x:g.x+M.ox+(Math.random()-0.5)*6,y:g.y+M.oy+(Math.random()-0.5)*6,vx:dx*5+(Math.random()-0.5)*36,vy:dy*5+(Math.random()-0.5)*36,t:0.35+Math.random()*0.3,c:['#7a6e5e','#5e5448','#9a8c78'][i],s:3});
    M.marks.push({x:g.x+M.ox,y:g.y+M.oy,t:1.2});if(M.marks.length>60)M.marks.shift();},
  pop(txt,sub,col,tag,big){M.pops.push({txt,sub,col,tag,big:!!big,t:0,life:big?1.6:1.25,x:Board.bs.x,y:Board.bs.y});if(M.pops.length>6)M.pops.shift();},
  dust(n){const b=M.b;for(let i=0;i<n;i++){const a=Math.random()*TAU,s=10+Math.random()*30;M.parts.push({x:b.x+Math.cos(a)*CFG.boardLen*0.3*Math.random(),y:b.y+Math.sin(a)*12,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0.35+Math.random()*0.3});}},
  rect3(lg,T,u,w,z,su,sw,col,oc){const p=Board.proj(T,Board.X3(T,u,w,z)),pu=Board.proj(T,Board.X3(T,u+1,w,z)),pw=Board.proj(T,Board.X3(T,u,w+1,z));
    lg.setTransform(pu.x-p.x,pu.y-p.y,pw.x-p.x,pw.y-p.y,p.x,p.y);if(oc){lg.fillStyle=oc;lg.fillRect(-su/2-0.8,-sw/2-0.8,su+1.6,sw+1.6);}lg.fillStyle=col;lg.fillRect(-su/2,-sw/2,su,sw);lg.setTransform(1,0,0,1,0,0);},
  board(lg){const b=M.b,T=Board.xf(),L=CFG.boardLen,W=CFG.boardWid,t=CFG.deckThick/2,tU=CFG.truckU*L;const up=T.nz>=0,faceZ=up?t:-t,backZ=up?-t:t;
    /* shadow (ground plane), softer and lighter the higher the board */
    {const hN=clamp(b.h/(CFG.hMax*L),0,1),al=0.34-0.14*hN;lg.fillStyle='#160c1c';
      const sp=OUTLINE.map(([u,w])=>Board.shadow(T,Board.X3(T,u,w,0)));
      for(const[gr,aa]of[[1.08,al*0.45],[1,al*0.75]]){const cx=sp.reduce((s,p)=>s+p.x,0)/sp.length,cy=sp.reduce((s,p)=>s+p.y,0)/sp.length;lg.globalAlpha=aa;lg.beginPath();sp.forEach((p,i)=>{const x=cx+(p.x-cx)*gr,y=cy+(p.y-cy)*gr;i?lg.lineTo(x,y):lg.moveTo(x,y);});lg.closePath();lg.fill();}
      for(const su of[-1,1])for(const sw of[-1,1]){const p=Board.shadow(T,Board.X3(T,su*tU,sw*(W/2+1.5),0));lg.globalAlpha=al*0.8;lg.fillRect(Math.round(p.x-2.5),Math.round(p.y-1.5),5,3);}
      lg.globalAlpha=1;}
    /* deck edge (ply) = the far face silhouette */
    {const ep=OUTLINE.map(([u,w])=>Board.proj(T,Board.X3(T,u,w,backZ)));lg.fillStyle='#d9ad6e';lg.strokeStyle='#14101a';lg.lineWidth=1;lg.beginPath();ep.forEach((p,i)=>i?lg.lineTo(p.x,p.y):lg.moveTo(p.x,p.y));lg.closePath();lg.fill();lg.stroke();}
    /* visible face as perspective strips (grip side or graphic side) */
    {const tex=up?TEX.grip:TEX.bottom,N=18,sw=L/N;for(let i=0;i<N;i++){const u0=-L/2+i*sw,u1=u0+sw;
      const WP=W+2*PAD,p00=Board.proj(T,Board.X3(T,u0,-WP/2,faceZ)),p10=Board.proj(T,Board.X3(T,u1,-WP/2,faceZ)),p01=Board.proj(T,Board.X3(T,u0,WP/2,faceZ));
      const ex=i<N-1?1:0;lg.setTransform((p10.x-p00.x)/sw,(p10.y-p00.y)/sw,(p01.x-p00.x)/WP,(p01.y-p00.y)/WP,p00.x,p00.y);lg.drawImage(tex,i*sw,0,sw+ex,WP,0,0,sw+ex,WP);}
      lg.setTransform(1,0,0,1,0,0);}
  },
  draw(g,c,dt){const V=M.view,lg=this.lg;if(!TEX.grip)makeTex();
    let sx=0,sy=0;if(M.shake>0){M.shake-=dt;sx=Math.round((Math.random()-0.5)*4);sy=Math.round((Math.random()-0.5)*4);}
    lg.setTransform(1,0,0,1,0,0);lg.globalAlpha=1;Plaza.draw(lg,M.ox+sx,M.oy+sy,Cam.D,Cam.D);
    lg.save();lg.translate(-sx,-sy);
    for(const p of M.parts){p.t-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=0.9;p.vy*=0.9;}M.parts=M.parts.filter(p=>p.t>0);
    for(const p of M.parts){lg.globalAlpha=clamp(p.t*2,0,0.7);lg.fillStyle=p.c||'#e6dfd2';lg.fillRect(Math.round(p.x-M.ox),Math.round(p.y-M.oy),p.s||2,p.s||2);}
    /* faint shoe-scuff streaks left by kick pushes */
    for(const m of M.marks){m.t-=dt;lg.globalAlpha=clamp(m.t,0,0.45);lg.fillStyle='#4a4238';lg.fillRect(Math.round(m.x-M.ox)-1,Math.round(m.y-M.oy)-1,3,3);}M.marks=M.marks.filter(m=>m.t>0);lg.globalAlpha=1;
    lg.restore();
    {const bs0=Board.bs;Board.bs={x:bs0.x-sx,y:bs0.y-sy};this.board(lg);Board.bs=bs0;}
    /* touch glow: where each finger is on the deck, with a short trail (like True Skate's foot marks) */
    for(const f of Input.F.values()){if(f.up||!f.deck)continue;const h=f.hist,n=h.length;
      lg.strokeStyle='rgba(255,150,50,0.45)';lg.lineWidth=2;lg.lineCap='round';lg.beginPath();for(let i=Math.max(0,n-6);i<n;i++){i>Math.max(0,n-6)?lg.lineTo(h[i].x-sx,h[i].y-sy):lg.moveTo(h[i].x-sx,h[i].y-sy);}lg.stroke();
      lg.fillStyle='rgba(255,140,40,0.32)';lg.beginPath();lg.arc(f.x-sx,f.y-sy,6,0,TAU);lg.fill();lg.fillStyle='rgba(255,196,96,0.85)';lg.beginPath();lg.arc(f.x-sx,f.y-sy,2.5,0,TAU);lg.fill();}
    if(!this.vig){const v=mk(V.W,V.H),vg=v.getContext('2d'),gr=vg.createRadialGradient(V.W/2,V.H*0.55,Math.min(V.W,V.H)*0.35,V.W/2,V.H*0.55,Math.max(V.W,V.H)*0.75);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(20,8,30,0.38)');vg.fillStyle=gr;vg.fillRect(0,0,V.W,V.H);this.vig=v;}
    g.setTransform(1,0,0,1,0,0);g.imageSmoothingEnabled=false;g.fillStyle='#0a060e';g.fillRect(0,0,c.width,c.height);
    g.setTransform(V.PX,0,0,V.PX,0,0);g.translate(Cam.ax,Cam.ay);g.rotate(-Cam.phi);g.drawImage(this.lc,-Cam.D/2,-Cam.D/2);
    g.setTransform(V.PX,0,0,V.PX,0,0);g.drawImage(this.vig,0,0);g.setTransform(1,0,0,1,0,0);
    HUD.draw(g,c,dt);}
};

/* ================================ HUD =============================== */
const HUD={
  txt(g,s,x,y,size,col,align,oc){g.font=size+'px Silkscreen, monospace';g.textAlign=align||'left';g.textBaseline='alphabetic';g.lineJoin='round';g.lineWidth=Math.max(1.6,size*0.28);g.strokeStyle=oc||'#14101a';g.strokeText(s,x,y);g.fillStyle=col;g.fillText(s,x,y);},
  fit(g,s,size,maxW){g.font=size+'px Silkscreen, monospace';const w=g.measureText(s).width;return w>maxW?Math.max(4,size*maxW/w):size;},
  safeTop(){try{const x=document.getElementById('mgX').getBoundingClientRect(),r=cvs().getBoundingClientRect();return Math.max(0,(x.top-10-r.top))*M.view.W/r.width;}catch(e){return 0;}},
  closeLeft(){try{const x=document.getElementById('mgX').getBoundingClientRect(),r=cvs().getBoundingClientRect();return(x.left-r.left)*M.view.W/r.width;}catch(e){return M.view.W-40;}},
  draw(g,c,dt){const V=M.view,PX=V.PX,W=V.W,H=V.H,sc=M.sc;g.setTransform(PX,0,0,PX,0,0);
    const y0=this.safeTop(),cl=this.closeLeft();
    g.fillStyle='rgba(10,6,14,0.62)';g.fillRect(0,0,W,y0+16);
    /* pause button (top-left) */
    const pb={x:4,y:y0+2.5,w:15,h:11};M.ui.pause=pb;g.fillStyle='#14101a';g.fillRect(pb.x-1,pb.y-1,pb.w+2,pb.h+2);g.fillStyle=M.paused?'#ffc23d':'#2a1a30';g.fillRect(pb.x,pb.y,pb.w,pb.h);
    g.fillStyle=M.paused?'#14101a':'#fbeef6';if(M.paused){g.beginPath();g.moveTo(pb.x+5,pb.y+2);g.lineTo(pb.x+11,pb.y+5.5);g.lineTo(pb.x+5,pb.y+9);g.fill();}else{g.fillRect(pb.x+4.5,pb.y+2.5,2,6);g.fillRect(pb.x+8.5,pb.y+2.5,2,6);}
    /* score display */
    this.txt(g,String(sc.score).padStart(6,'0'),24,y0+11.5,8,'#fbeef6');
    const tm=Math.max(0,Math.ceil(M.time)),ts=Math.floor(tm/60)+':'+String(tm%60).padStart(2,'0');
    this.txt(g,ts,Math.min(W/2,cl-30),y0+11.5,8,tm<=10&&!M.over?'#ff5a5a':'#ffc23d','center');
    this.txt(g,'BEST '+String(sc.best).padStart(6,'0'),24,y0+24,5,sc.newBest?'#7dff6a':'#b9a3bf');
    /* combo line */
    if(sc.list.length){const m=Score.mult(),names=sc.list.slice(-3).join(' + ')+(sc.list.length>3?' …':'');const fs=this.fit(g,names,6,W-20);
      this.txt(g,names,W/2,y0+36,fs,'#e8e2da','center');this.txt(g,'x'+m+'  '+Math.round(sc.pts*m),W/2,y0+47,8,'#ffc23d','center');
      g.fillStyle='#14101a';g.fillRect(W/2-30,y0+50,60,3);g.fillStyle='#ff3d9a';g.fillRect(W/2-29.5,y0+50.5,59*clamp(sc.win/CFG.comboWindow,0,1),2);}
    /* manual balance meter */
    {const b=M.b,on=Manual.on;const pn=b.pitch/CFG.maxPitch;if(b.st==='ground'&&(on||Manual.cand>0.05||Math.abs(pn)>0.2)){const C=Object.assign(Board.centre(),Cam.toV(Board.centre())),mx=clamp(C.x+CFG.boardWid*0.9+10,8,W-12),my=clamp(C.y-24,y0+30,H-60),mh=48;
      g.fillStyle='#14101a';g.fillRect(mx-3,my-1,6,mh+2);g.fillStyle='#2a1a30';g.fillRect(mx-2,my,4,mh);
      const yy=v=>my+mh/2-v*mh/2;g.fillStyle='rgba(125,255,106,0.5)';g.fillRect(mx-2,yy(CFG.manualHi),4,yy(CFG.manualLo)-yy(CFG.manualHi));g.fillRect(mx-2,yy(-CFG.manualLo),4,yy(-CFG.manualHi)-yy(-CFG.manualLo));
      g.fillStyle=on?'#7dff6a':'#fbeef6';g.fillRect(mx-4,yy(clamp(pn,-1,1))-1,8,2);
      if(on)this.txt(g,(on.kind==='MANUAL'?'MANUAL ':'NOSE MANUAL ')+on.t.toFixed(1)+'s',W/2,clamp(C.y+CFG.boardLen*0.62,y0+60,H-34),7,'#7dff6a','center');}}
    /* trick popups near the board */
    for(const p of M.pops){p.t+=dt;}M.pops=M.pops.filter(p=>p.t<p.life);
    {let k=0;for(let i=M.pops.length-1;i>=0;i--){const p=M.pops[i],a=clamp((p.life-p.t)*3,0,1),rise=p.t*14;g.globalAlpha=a;const C=Object.assign(Board.centre(),Cam.toV(Board.centre()));
      const px=clamp(C.x,40,W-40),py=clamp(C.y-CFG.boardLen*0.62*C.k-12-rise-k*20,y0+62,H-20);const sz=p.big?11:9;const fs=this.fit(g,p.txt,sz*(p.t<0.12?1+0.6*(0.12-p.t)/0.12:1),W-12);
      this.txt(g,p.txt,px,py,fs,p.col,'center');if(p.sub)this.txt(g,p.sub,px,py+9,this.fit(g,p.sub,6,W-12),'#fbeef6','center');if(p.tag)this.txt(g,p.tag,px,py-fs-1,5,'#7dff6a','center');k++;}g.globalAlpha=1;}
    if(M.hint&&!M.over)this.card(g,W,H,'HOW TO SKATE','TAP TO SKATE');
    if(M.paused&&!M.over&&!M.hint)this.card(g,W,H,'PAUSED','TAP TO KEEP SKATING');
    if(M.over){const nb=sc.newBest?'NEW BEST!':'BEST '+sc.best;this.card(g,W,H,'SESSION OVER',null,[[sc.score+' PTS','#5ee08a',9],[nb,sc.newBest?'#7dff6a':'#b9a3bf',6],['BIGGEST COMBO '+sc.bestCombo,'#e8e2da',6],[M.target&&LV.gameMode==='story'?(sc.score>=M.target?'TARGET '+M.target+' · NAILED IT':'TARGET '+M.target):'', sc.score>=M.target?'#7dff6a':'#ff9a7a',6],[M.overT>0.8?'TAP TO EXIT':'','#b9a3bf',6]]);}
    if(M.debug)this.debug(g,W,H);},
  /* gesture list (text only, never a control): first-run card + pause card */
  guide(g,x0,top,gw){const touch=Input.type!=='mouse';
    const L=touch?['SWIPE DOWN ON THE TAIL = POP','HARDER / FASTER ROLLING = HIGHER','ANGLE THE SNAP = SHOVE-IT SPIN','IN AIR: DRAG OFF A SIDE EDGE = FLIP',
        'FLIPS COME ROUND ON THEIR OWN','TOUCH THE BOARD IN AIR = CATCH IT','GROUND SWIPE = PUSH (EITHER WAY)','2 FINGERS = STEER · HOLD TAIL = MANUAL']
      :['LEFT-DRAG = ONE FINGER, SAME AS TOUCH','SNAP THE TAIL OFF ITS END = POP','ANGLE THE SNAP = SHOVE-IT SPIN','IN AIR: DRAG OFF A SIDE EDGE = FLIP',
        'FLIPS COME ROUND ON THEIR OWN','CLICK THE BOARD IN AIR = CATCH IT','DRAG ON GROUND TOWARD TAIL = PUSH','RIGHT-DRAG = STEER · WHEEL = 180'];
    let y=top+10;for(const s of L){this.txt(g,s,x0+gw/2,y,this.fit(g,s,6,gw-10),'#fbeef6','center');y+=8;}},
  guideH(){return 8*8+6;},
  card(g,W,H,t1,t2,rows){const w=Math.min(W-20,200),h=rows?44+rows.length*10:30+this.guideH()+18,x=(W-w)/2,y=H*0.3;g.fillStyle='rgba(10,6,14,0.84)';g.fillRect(x,y,w,h);g.fillStyle='#ffc23d';g.fillRect(x,y,w,2);
    this.txt(g,t1,W/2,y+20,this.fit(g,t1,12,w-12),'#ffc23d','center');
    if(rows){let yy=y+36;for(const[s,col,sz]of rows){if(s)this.txt(g,s,W/2,yy,this.fit(g,s,sz,w-14),col,'center');yy+=sz+5;}}
    else{this.guide(g,x,y+28,w);this.txt(g,t2,W/2,y+28+this.guideH()+12,6,'#b9a3bf','center');}},
  /* debug overlay (off by default): localStorage tsr_fb_debug=1, ?fbdebug, ` / F2, or a 5-finger tap */
  debug(g,W,H){const Fr=Board.fr||Board.frameOf(),zc={tail:'#ff3d9a',nose:'#4fc3f7',ground:'#ff9a3a',mid:'#7dff6a',left:'#7dff6a',right:'#7dff6a',center:'#7dff6a'};
    /* deck frame as used for zones: tail tip → nose tip, tail-zone line */
    g.lineWidth=0.8;g.strokeStyle='rgba(255,255,255,0.7)';g.beginPath();g.moveTo(Fr.a.x,Fr.a.y);g.lineTo(Fr.n.x,Fr.n.y);g.stroke();
    {const k=(1-CFG.tailStart)/2,tx=Fr.a.x+Fr.ax.x*k,ty=Fr.a.y+Fr.ax.y*k,sx=Fr.sw.x*1.4,sy=Fr.sw.y*1.4;g.strokeStyle='#ff3d9a';g.beginPath();g.moveTo(tx-sx,ty-sy);g.lineTo(tx+sx,ty+sy);g.stroke();
      const nx=Fr.n.x-Fr.ax.x*k,ny=Fr.n.y-Fr.ax.y*k;g.strokeStyle='#4fc3f7';g.beginPath();g.moveTo(nx-sx,ny-sy);g.lineTo(nx+sx,ny+sy);g.stroke();
      this.txt(g,'TAIL',Fr.a.x,Fr.a.y+8,4,'#ff3d9a','center');this.txt(g,'NOSE',Fr.n.x,Fr.n.y-4,4,'#4fc3f7','center');}
    const b0=M.b;for(const f of Input.F.values()){const c=f.used&&f.deck?'#888':zc[f.role]||zc[f.zone]||'#fff';g.strokeStyle=c;g.lineWidth=1.2;g.beginPath();g.arc(f.x,f.y,7,0,TAU);g.stroke();
      if(f.sp>0.3){g.beginPath();g.moveTo(f.x,f.y);const F=fwd(M.b.th),R=rgt(M.b.th),k=6;g.lineTo(f.x+(F.x*f.vu+R.x*f.vw)*k,f.y+(F.y*f.vu+R.y*f.vw)*k);g.stroke();}
      this.txt(g,(f.role||'ground').toUpperCase()+(f.used&&f.deck?' (used)':'')+(b0.st==='air'&&f.deck&&!f.popper?(Tricks.onBoard(f)?(f.sp<CFG.catchMaxSpeed?' CATCH':' DRAG'):' OFF'):''),f.x,f.y-10,5,c,'center');
      this.txt(g,'u'+f.un.toFixed(2)+' w'+f.wn.toFixed(2)+' '+(f.sp||0).toFixed(1)+'L/s',f.x,f.y+15,4,'#fff','center');}
    const b=M.b,L=CFG.boardLen,last=M.log.filter(e=>e.ev==='pop').slice(-1)[0],ld=M.log.filter(e=>e.ev==='land').slice(-1)[0],f1=v=>(+v).toFixed(1);
    const ls=['FINGERBOARD DEBUG · 5-finger tap hides',
      'ST '+b.st+'  SPD '+f1(Math.hypot(b.vx,b.vy)/L)+' L/s  H '+(b.h/L).toFixed(2)+'  vz '+f1(b.vz/L)+(b.slide?'  SLIDE '+f1(b.slide):''),
      'RATES roll '+f1(b.rollRate||0)+' yaw '+f1(b.yawRate||0)+' pitch '+f1(b.pitchRate||0)+' rad/s · flip '+(b.flip/DEG).toFixed(0)+'° yaw err '+(Tricks.yawErr()/DEG).toFixed(0)+'°'+(b.air&&b.air.catching?' · CATCHING':''),
      last?'POP '+last.kind+': snap '+last.snap+' lat '+last.lat+' → vz '+last.vz+' (H '+last.H+') yaw '+last.yawRate+' roll '+last.rollRate:'POP needs a tail/nose snap ≥'+thr('popSnapMin').toFixed(1)+' L/s',
      ld?'LANDING roll err '+ld.rollErr+'° (≤'+CFG.landRollTol+') yaw err '+ld.yawErr+'° (≤'+CFG.landYawTol+') roll rate '+ld.rollRate+(ld.why?' → BAIL':' → OK'):''];
    const ph=(ls.length+M.why.length)*7+6,top=H-ph-2+7;g.fillStyle='rgba(0,0,0,0.6)';g.fillRect(2,top-7,W-4,ph);let y=top;for(const s of ls){this.txt(g,s,5,y,4.5,'#ffc23d');y+=7;}
    for(const w of M.why.slice().reverse()){this.txt(g,w.text,5,y,this.fit(g,w.text,4.5,W-10),w.kind==='ok'?'#7dff6a':w.kind==='info'?'#4fc3f7':'#ff9a7a');y+=7;}}
};

/* =============================== GAME =============================== */
function start(){const P=(LV.player&&LV.player.P)||null;Cam.init=false;
  call('mgOpen','finger',{title:'FINGERBOARD',P,target:CFG.storyTarget,score:0,over:false});
  const m=LV.MGM;if(!m||m.kind!=='finger')return false;M=m;
  Object.assign(M,{b:{x:0,y:0,th:-Math.PI/2,vx:0,vy:0,h:0,vz:0,pitch:0,roll:0,flip:0,rollRate:0,yawRate:0,pitchRate:0,st:'ground',air:null,bailT:0,snap:0,land:0,slide:0},
    cam:{x:0,y:0},view:{W:215,H:400,PX:1},ox:0,oy:0,pops:[],parts:[],marks:[],log:[],ui:{},tilt:{tail:0,nose:0,side:0},time:CFG.session,paused:false,over:false,overT:0,shake:0,
    why:[],hint:!lsGet(HINT_KEY,0),debug:/[?&]fbdebug/.test(location.search)||!!window.__fbDebug||lsGet(DBG_KEY,0)===1});
  Page.lock();
  Input.reset();Tricks.prep=false;Manual.cancel();Score.init();
  const c=cvs();if(c){Anim.view(c);Anim.camera(0);}
  return true;}
function frame(g,c,dt){const m=LV.MGM;if(!m||m.kind!=='finger')return;if(M!==m){M=m;if(!M.b){return;}}
  const now=nowS();Anim.view(c);
  if(!M.paused&&!M.over&&!M.hint){
    Anim.camera(dt);Input.update(now);Tricks.detect(now);Phys.step(dt,now);Score.update(dt,now);
    M.time-=dt;if(M.time<=0&&M.b.st==='ground'){M.time=0;Manual.finish(now);Score.bank(now);M.over=true;M.overT=0;sfx('ok',0.6);
      M.log.push({t:+now.toFixed(3),ev:'over',score:M.sc.score});}}
  else{if(M.over)M.overT+=dt;Anim.camera(0);Input.update(now);
    const rg=LV.rollG;if(rg)try{rg.gain.value=0;}catch(e){}}
  Anim.draw(g,c,dt);}
function finish(){const s=M.sc,pay=Math.min(CFG.payMax,Math.floor(s.score/CFG.payDiv));if(pay)call('addCash',pay);call('mgClose');
  call('banner','FINGERBOARD',s.score+' PTS'+(pay?' · +$'+pay:''),2.2);}
function setPaused(v){if(!M||M.over)return;M.paused=!!v;Input.reset();}
/* UI taps: pause button, pause card, session-over card. Returns true when consumed. */
function uiTap(p,e){if(M.hint){M.hint=false;lsSet(HINT_KEY,1);Input.reset();return true;}   /* first-run card: shown once, any tap dismisses */
  if(M.over){if(M.overT>0.8)M.exitArm=e.pointerId;return true;}   /* exit on the tap's pointerup so it can't leak into the world */if(M.paused){setPaused(false);return true;}
  const r=M.ui.pause;if(r&&p.x>=r.x-4&&p.x<=r.x+r.w+4&&p.y>=r.y-4&&p.y<=r.y+r.h+4){setPaused(true);return true;}return false;}

/* while skating: no pull-to-refresh / overscroll / panning anywhere up the tree (restored when the game closes) */
const Page={on:false,prev:null,lock(){if(this.on)return;const h=document.documentElement,b=document.body;this.prev=[h.style.touchAction,h.style.overscrollBehavior,b.style.overscrollBehavior];
  h.style.touchAction='none';h.style.overscrollBehavior='none';b.style.overscrollBehavior='none';this.on=true;},
  unlock(){if(!this.on)return;const h=document.documentElement,b=document.body;[h.style.touchAction,h.style.overscrollBehavior,b.style.overscrollBehavior]=this.prev;this.on=false;}};
setInterval(()=>{if(Page.on&&!active())Page.unlock();},500);

/* ---- DOM wiring: capture on the overlay so the generic host never sees our pointers ---- */
function wire(){const o=document.getElementById('mgo');if(!o||o.__fb)return;o.__fb=1;
  const mine=e=>active()&&M&&M.b&&(e.target===cvs()||Input.F.has(e.pointerId)||(e.pointerType==='mouse'&&Input.mouse));
  o.addEventListener('pointerdown',e=>{if(!active()||!M||!M.b||e.target!==cvs())return;e.preventDefault();e.stopPropagation();try{cvs().setPointerCapture(e.pointerId);}catch(_){}
    const t=e.timeStamp/1000,p=Input.pos(e);Input.type=e.pointerType;if(uiTap(p,e))return;
    if(e.pointerType==='mouse'){Input.mouseDown(e,p,t);return;}Input.add(e.pointerId,p,t,'touch',forceOf(e));
    if([...Input.F.values()].filter(f=>!f.up&&f.src==='touch').length>=5){M.debug=!M.debug;lsSet(DBG_KEY,M.debug?1:0);Input.reset();Why.add('debug overlay '+(M.debug?'on':'off'),'info');}},{capture:true,passive:false});
  o.addEventListener('pointermove',e=>{if(!mine(e))return;e.preventDefault();e.stopPropagation();if(M.paused||M.over)return;
    const list=(e.getCoalescedEvents&&e.getCoalescedEvents().length)?e.getCoalescedEvents():[e];
    for(const ce of list){const p=Input.pos(ce),t=(ce.timeStamp||e.timeStamp)/1000;if(e.pointerType==='mouse')Input.mouseMove(p,t);else Input.move(e.pointerId,p,t,forceOf(ce));}},{capture:true,passive:false});
  const up=e=>{if(active()&&M&&M.exitArm!=null&&M.exitArm===e.pointerId){e.preventDefault();e.stopPropagation();M.exitArm=null;if(e.type==='pointerup')setTimeout(()=>{if(active())finish();},30);return;}
    if(!mine(e))return;e.preventDefault();e.stopPropagation();const t=e.timeStamp/1000;if(e.pointerType==='mouse'){Input.mouseUp(t,Input.pos(e));return;}
    const cancel=e.type==='pointercancel';Input.up(e.pointerId,t,cancel?null:Input.pos(e),cancel);};
  o.addEventListener('pointerup',up,{capture:true,passive:false});o.addEventListener('pointercancel',up,{capture:true,passive:false});
  o.addEventListener('contextmenu',e=>{if(active())e.preventDefault();},{capture:true});
  o.addEventListener('wheel',e=>{if(!active()||!M||!M.b)return;e.preventDefault();Input.wheel+=clamp(e.deltaY,-120,120)*0.0035;Input.type='mouse';},{capture:true,passive:false});
  /* no page scroll / pinch-zoom while skating (touch-action:none is already on #mgo) */
  for(const ev of['touchstart','touchmove'])o.addEventListener(ev,e=>{if(active()&&e.target===cvs()&&e.cancelable)e.preventDefault();},{capture:true,passive:false});
  for(const ev of['gesturestart','gesturechange'])document.addEventListener(ev,e=>{if(active())e.preventDefault();},{passive:false});
  window.addEventListener('keydown',e=>{if(!active()||!M||!M.b)return;const k=e.key;if(k==='`'||k==='F2'){M.debug=!M.debug;e.preventDefault();}else if(k==='p'||k==='P'){setPaused(!M.paused);}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active()&&M&&M.b&&!M.over)setPaused(true);});
  window.addEventListener('blur',()=>{if(active()&&M&&M.b&&!M.over&&Input.F.size)Input.reset();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();

/* local (un,wn) on the deck → client coords (handy for tests and tooling) */
function toClient(un,wn){const T=Board.xf(),p=Cam.toV(Board.proj(T,Board.X3(T,un*CFG.boardLen/2,wn*CFG.boardWid/2,CFG.deckThick/2))),r=cvs().getBoundingClientRect(),V=M.view;
  return{x:r.left+p.x/V.W*r.width,y:r.top+p.y/V.H*r.height};}
window.FB={start,frame,cfg:CFG,state:()=>M,toClient,pause:setPaused,_in:Input,
  info:()=>M&&M.b?{st:M.b.st,th:M.b.th,rollRate:M.b.rollRate,yawRate:M.b.yawRate,pitchRate:M.b.pitchRate,vz:M.b.vz/CFG.boardLen,x:M.b.x,y:M.b.y,v:Math.hypot(M.b.vx,M.b.vy)/CFG.boardLen,h:M.b.h/CFG.boardLen,pitch:M.b.pitch,roll:M.b.roll,flip:M.b.flip,
    score:M.sc.score,best:M.sc.best,combo:M.sc.list.slice(),manual:Manual.on&&Manual.on.kind,tilt:M.tilt,fingers:[...Input.F.values()].map(f=>({id:f.id,zone:f.zone,un:+f.un.toFixed(2),wn:+f.wn.toFixed(2),used:f.used}))}:null};
})();
