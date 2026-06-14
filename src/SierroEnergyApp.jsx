import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Home, TrendingUp, Settings, Bell, Plus, ChevronLeft, ChevronRight, ChevronDown,
  Zap, Refrigerator, Server, Lamp, Car, Cable, Router, Wind, X, Check, Info,
  AlertCircle as CircleAlert, Sun, Moon, Share2, Pencil, MoreHorizontal, Mail, User, Bluetooth,
  Globe, QrCode, CheckCircle2 as CircleCheck, XCircle as CircleX, Trash2, MessageSquareText, PowerOff,
  BatteryLow, SunMedium, Gem, CalendarDays
} from "lucide-react";

/* ═════════════════════════════════════════════════════════════════
   API MODULE — Solar of Things Open API  v2
   Base:    https://solar.siseli.com/openapis
   签名:    仅登录/注册类接口需要（IOT-Open-AppID/Nonce/Sign）
   认证:    其余接口需 IOT-Token: <accessToken>
   成功码:  code === 0 或 '0'
   密码:    明文 → MD5(UTF-8) → lowercase hex 后传输
   ═══════════════════════════════════════════════════════════════ */
const API_BASE   = 'https://solar.siseli.com/openapis';
const API_ID     = 'rYGQpmYU5k';
const API_SECRET = 'GhJXQYEHphHlyiqYnBGE';

/* ── compact pure-JS MD5 (RFC 1321) — browser-safe, no deps ── */
function _md5(buf) {
  const S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0);
  function r32(x,n){return(x<<n)|(x>>>(32-n))}
  function add(...ns){return ns.reduce((a,b)=>(a+b)|0,0)}
  const msg=[...buf]; const ml=msg.length;
  msg.push(0x80); while(msg.length%64!==56)msg.push(0);
  const hl=ml*8; for(let i=0;i<4;i++)msg.push((hl>>>(i*8))&0xff);
  for(let i=0;i<4;i++)msg.push(0);
  let a=0x67452301,b=0xEFCDAB89|0,c=0x98BADCFE|0,d=0x10325476|0;
  for(let i=0;i<msg.length;i+=64){
    const M=Array.from({length:16},(_,j)=>{const o=i+j*4;return (msg[o])|(msg[o+1]<<8)|(msg[o+2]<<16)|(msg[o+3]<<24);});
    let[A,B,C,D]=[a,b,c,d];
    for(let j=0;j<64;j++){
      let F,g;
      if(j<16){F=(B&C)|(~B&D);g=j;}
      else if(j<32){F=(D&B)|(~D&C);g=(5*j+1)%16;}
      else if(j<48){F=B^C^D;g=(3*j+5)%16;}
      else{F=C^(B|~D);g=(7*j)%16;}
      const t=add(A,F,M[g]>>>0,K[j]);
      A=D;D=C;C=B;B=add(B,r32(t,S[j]));
    }
    a=add(a,A);b=add(b,B);c=add(c,C);d=add(d,D);
  }
  return[a,b,c,d].map(v=>[0,8,16,24].map(s=>((v>>>s)&0xff).toString(16).padStart(2,'0')).join('')).join('');
}
/** 字符串 → MD5 hex（UTF-8），与 CryptoJS.MD5(s).toString() 完全一致 */
function _md5str(text){ return _md5(new TextEncoder().encode(text)); }

/* ── SHA-256 via Web Crypto API ── */
async function _sha256hex(text){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
/* ── HMAC-SHA256 → raw Uint8Array ── */
async function _hmacSHA256raw(text,secret){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)));
}
/* ── UTF-8 safe Base64 ── */
function _b64utf8(str){
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,(_,p1)=>String.fromCharCode('0x'+p1)));
}
/* ── 32-char random nonce ── */
function _nonce(){
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
/** 七步签名 */
async function _buildSign(urlParams={}, bodyText=''){
  const nonce=_nonce();
  const bodyHash = bodyText ? await _sha256hex(bodyText) : '';
  const params={'IOT-Open-AppID':API_ID,'IOT-Open-Nonce':nonce,'IOT-Open-Body-Hash':bodyHash,...urlParams};
  const sorted=Object.keys(params).sort().map(k=>`${k}=${params[k]}`).join('&');
  const base64=_b64utf8(sorted);
  const hmacBytes=await _hmacSHA256raw(base64,API_SECRET);
  const sign=_md5(hmacBytes);
  return {sign, nonce};
}

/* ─── Token 存储（内存 + sessionStorage 持久化）─── */
const _ss = (k, v) => { try { if(v===undefined) return sessionStorage.getItem(k)||''; sessionStorage.setItem(k,v); } catch{ return ''; } };
const tokenStore = {
  _access:  _ss('iot_access_token'),
  _refresh: _ss('iot_refresh_token'),
  _userId:  _ss('iot_user_id'),
  get()         { return this._access; },
  getRefresh()  { return this._refresh; },
  getUserId()   { return this._userId; },
  set(t)        { this._access=t;  _ss('iot_access_token',t); },
  setRefresh(t) { this._refresh=t; _ss('iot_refresh_token',t); },
  setUserId(id) { this._userId=String(id); _ss('iot_user_id',String(id)); },
  clear()       { this._access=''; this._refresh=''; this._userId='';
                  _ss('iot_access_token',''); _ss('iot_refresh_token',''); _ss('iot_user_id',''); },
  isLoggedIn()  { return !!this._access; },
};

/* ─── 核心请求函数 ─── */

/**
 * POST —— 需签名、不带 IOT-Token（登录/注册/验证码等拦截接口）
 * 对应文档中的 api.postSkipAuth
 */
async function apiPostSkipAuth(path, body={}){
  const bodyText=JSON.stringify(body);
  const {sign,nonce}=await _buildSign({},bodyText);
  const res=await fetch(`${API_BASE}${path}`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json;charset=UTF-8',
      'IOT-Open-AppID':API_ID,
      'IOT-Open-Nonce':nonce,
      'IOT-Open-Sign':sign,
    },
    body:bodyText,
  });
  const json=await res.json().catch(async()=>({ code:-1, message:await res.text().catch(()=>'Parse error') }));
  return json;
}

/**
 * POST —— 带 IOT-Token、不带签名（已登录用户的普通接口）
 * 对应文档中的 api.post
 */
async function apiPostAuth(path, body={}){
  const token=tokenStore.get();
  const res=await fetch(`${API_BASE}${path}`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json;charset=UTF-8',
      ...(token ? {'IOT-Token':token} : {}),
    },
    body:JSON.stringify(body),
  });
  return res.json().catch(async()=>({ code:-1, message:await res.text().catch(()=>'Parse error') }));
}

/**
 * GET —— 带 IOT-Token（已登录用户的 GET 接口）
 * 对应文档中的 api.get
 */
async function apiGetAuth(path, params={}){
  const token=tokenStore.get();
  const qs=Object.keys(params).length?'?'+new URLSearchParams(params).toString():'';
  const res=await fetch(`${API_BASE}${path}${qs}`,{
    headers:{ ...(token ? {'IOT-Token':token} : {}) },
  });
  return res.json().catch(async()=>({ code:-1, message:'Parse error' }));
}

/** 判断业务是否成功（code 0 或 '0'） */
function _isOk(resp){ return resp?.code===0 || resp?.code==='0'; }

/* ═══════ 具体 API 函数 ═══════ */

/** 账号密码登录 — 密码自动 MD5 加密 */
async function apiLogin(account, plainPassword){
  const resp=await apiPostSkipAuth('/login/account',{
    account,
    password: _md5str(plainPassword),
  });
  if(_isOk(resp) && resp.data){
    if(resp.data.accessToken)  tokenStore.set(resp.data.accessToken);
    if(resp.data.refreshToken) tokenStore.setRefresh(resp.data.refreshToken);
    if(resp.data.userId)       tokenStore.setUserId(resp.data.userId);
  }
  return resp;
}

/** 邮箱验证码登录（先调 apiSendEmailCaptcha 获取 iotCaptchaId） */
async function apiLoginByEmail(email, iotCaptchaId, verifyCode){
  const resp=await apiPostSkipAuth('/login/email',{ email, captchaId:iotCaptchaId, verifyCode });
  if(_isOk(resp) && resp.data){
    if(resp.data.accessToken)  tokenStore.set(resp.data.accessToken);
    if(resp.data.refreshToken) tokenStore.setRefresh(resp.data.refreshToken);
    if(resp.data.userId)       tokenStore.setUserId(resp.data.userId);
  }
  return resp;
}

/** 短信验证码登录 */
async function apiLoginBySms(cellphone, countryCode, iotCaptchaId, verifyCode){
  const resp=await apiPostSkipAuth('/login/sms',{
    cellphone,
    countryTelephoneCode: countryCode.replace(/^\+/,''),
    captchaId:iotCaptchaId,
    verifyCode,
  });
  if(_isOk(resp) && resp.data){
    if(resp.data.accessToken)  tokenStore.set(resp.data.accessToken);
    if(resp.data.refreshToken) tokenStore.setRefresh(resp.data.refreshToken);
    if(resp.data.userId)       tokenStore.setUserId(resp.data.userId);
  }
  return resp;
}

/** 退出登录 */
async function apiLogout(){
  const token=tokenStore.get(), userId=tokenStore.getUserId();
  try{
    if(token && userId){
      await apiPostAuth('/login/logout',{ accessToken:token, userId:Number(userId) });
    }
  }catch(e){ console.warn('[API] logout error:',e); }
  finally{ tokenStore.clear(); }
}

/** 刷新 Access Token */
async function apiRefreshToken(){
  const resp=await apiPostSkipAuth('/login/refresh/access/token',{
    accessToken:  tokenStore.get(),
    refreshToken: tokenStore.getRefresh(),
  });
  if(_isOk(resp) && resp.data){
    if(resp.data.accessToken)  tokenStore.set(resp.data.accessToken);
    if(resp.data.refreshToken) tokenStore.setRefresh(resp.data.refreshToken);
  }
  return resp;
}

/** 获取当前用户信息 */
async function apiFetchUserInfo(){
  return apiPostAuth('/user/select/iotUserInfo');
}

/** 修改密码（均需 MD5 加密） */
async function apiUpdatePassword(oldPlain, newPlain){
  return apiPostAuth('/user/update/authPassword',{
    oldPassword: _md5str(oldPlain),
    newPassword: _md5str(newPlain),
  });
}

/** 找回密码 */
async function apiResetPassword(account, newPlain, verifyCode, captchaId){
  return apiPostSkipAuth('/user/reset/password',{
    account,
    newPassword: _md5str(newPlain),
    verifyCode,
    captchaId,
  });
}

/** 发送邮箱验证码 — 字段名为 address，返回 iotCaptchaId */
async function apiSendEmailCaptcha(email, intent='1'){
  return apiPostSkipAuth('/user/send/email/captcha',{ address:email, intent });
}

/** 发送短信验证码 — 返回 iotCaptchaId */
async function apiSendSmsCaptcha(cellphone, countryCode='1', intent='1'){
  return apiPostSkipAuth('/user/send/sms/captcha',{
    cellphone,
    countryTelephoneCode: countryCode.replace(/^\+/,''),
    intent,
  });
}

/** 邮箱注册 */
async function apiRegisterByEmail(account, plainPwd, email, verifyCode, captchaId){
  return apiPostSkipAuth('/user/register/email',{
    account, password:_md5str(plainPwd), email, verifyCode, captchaId,
  });
}

/** 手机注册 */
async function apiRegisterByCellphone(account, plainPwd, cellphone, countryCode, verifyCode, captchaId){
  return apiPostSkipAuth('/user/register/cellphone',{
    account, password:_md5str(plainPwd),
    cellphone, countryTelephoneCode:countryCode.replace(/^\+/,''),
    verifyCode, captchaId,
  });
}

/** 校验账号是否存在 */
async function apiCheckAccount(account){
  return apiGetAuth(`/user/account/check`,{ account });
}

/** 校验邮箱是否存在 */
async function apiCheckEmail(email){
  return apiGetAuth(`/user/email/check`,{ email });
}

/** 验证当前 session 是否有效 */
async function apiVerifySession(){
  if(!tokenStore.isLoggedIn()) return false;
  try{ const r=await apiFetchUserInfo(); return _isOk(r); }
  catch{ return false; }
}

/* ═══════════════════════════════════════════════════════════════ */
/* ───────── Design tokens (PRD §11 / Figma) ───────── */
const BG = "#141414";
const CARD = "#262626";
const CARD2 = "#1E1E1E";
const ACCENT = "#01D6BE";
const ORANGE = "#FF9500";
const RED = "#FF3B30";
const GOLD = "#FFD700";
const SUB = "#A0A0A5";
const LINE = "#3A3A3C";

const ICONS = {
  zap: Zap, fridge: Refrigerator, nas: Server, lamp: Lamp,
  ev: Car, cable: Cable, router: Router, cpap: Wind,
};
const ICON_KEYS = Object.keys(ICONS);

const levelColor = (lv) => (lv >= 60 ? ACCENT : lv >= 20 ? ORANGE : RED);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtDur = (h) => {
  if (!isFinite(h) || h <= 0) return "";
  const H = Math.floor(h), M = Math.round((h - H) * 60);
  return `${H}h ${String(M).padStart(2, "0")}m`;
};
const fmtClock = (h) => {
  const hh = ((h % 24) + 24) % 24;
  if (hh === 0) return "12 AM"; if (hh === 12) return "12 PM";
  return hh < 12 ? `${hh} AM` : `${hh - 12} PM`;
};

/* ───────── Primitives ───────── */
const IconBtn = ({ icon: I, onClick, dot, dim, size = 38 }) => (
  <button onClick={onClick} className="relative flex items-center justify-center rounded-full active:scale-95 transition"
    style={{ width: size, height: size, background: CARD }}>
    <I size={18} color={dim ? SUB : "#fff"} />
    {dot && <span className="absolute rounded-full" style={{ width: 8, height: 8, background: RED, top: 4, right: 5 }} />}
  </button>
);

const Toggle = ({ on, onChange, disabled }) => (
  <button disabled={disabled} onClick={(e) => { e.stopPropagation(); onChange && onChange(!on); }}
    aria-label={on ? "On" : "Off"}
    className="relative rounded-full transition-colors duration-200 shrink-0"
    style={{ width: 52, height: 32, background: on ? ACCENT : "#39393D", opacity: disabled ? 0.4 : 1 }}>
    <span className="absolute rounded-full bg-white transition-all duration-200"
      style={{ width: 28, height: 28, top: 2, left: on ? 22 : 2, boxShadow: "0 2px 4px rgba(0,0,0,.4)" }} />
  </button>
);

const PrimaryBtn = ({ children, onClick, disabled, danger, className = "" }) => (
  <button onClick={onClick} disabled={disabled}
    className={"w-full rounded-xl py-3.5 text-base font-semibold transition active:scale-[.98] " + className}
    style={{
      background: danger ? RED : disabled ? "#0E5F55" : ACCENT,
      color: danger ? "#fff" : disabled ? "#5A8F88" : "#062B26",
    }}>{children}</button>
);

const OutlineBtn = ({ children, onClick }) => (
  <button onClick={onClick} className="rounded-lg px-4 py-2 text-sm font-medium active:scale-95 transition"
    style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}>{children}</button>
);

const Row = ({ title, sub, value, onClick, danger, right, first, last }) => (
  <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3.5 text-left active:opacity-70"
    style={{
      background: CARD,
      borderTopLeftRadius: first ? 12 : 0, borderTopRightRadius: first ? 12 : 0,
      borderBottomLeftRadius: last ? 12 : 0, borderBottomRightRadius: last ? 12 : 0,
      borderBottom: last ? "none" : `1px solid ${BG}`,
    }}>
    <div className="min-w-0 pr-3">
      <div className="text-[15px] font-medium truncate" style={{ color: danger ? RED : "#fff" }}>{title}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: SUB }}>{sub}</div>}
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      {value && <span className="text-sm truncate max-w-[140px]" style={{ color: SUB }}>{value}</span>}
      {right !== undefined ? right : !danger && <ChevronRight size={17} color={SUB} />}
    </div>
  </button>
);

const TopBar = ({ title, onBack, right, center }) => (
  <div className="flex items-center px-4 pt-3 pb-2" style={{ minHeight: 56 }}>
    <div className="w-20 flex">{onBack && <IconBtn icon={ChevronLeft} onClick={onBack} />}</div>
    <div className="flex-1 text-center text-[16px] font-semibold text-white">{center || title}</div>
    <div className="w-20 flex justify-end items-center gap-2">{right}</div>
  </div>
);

const Toast = ({ toast, onClose }) => {
  if (!toast) return null;
  const map = {
    positive: { bg: "#0E3B33", icon: <CircleCheck size={16} color={ACCENT} />, border: "#14655A" },
    negative: { bg: "#3E1512", icon: <CircleAlert size={16} color={RED} />, border: "#6E2620" },
    neutral: { bg: "#2C2C2E", icon: <Info size={16} color={SUB} />, border: "#3A3A3C" },
  };
  const s = map[toast.type] || map.neutral;
  return (
    <div className="absolute left-4 right-4 z-50" style={{ bottom: 96 }}>
      <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{ background: s.bg, border: `1px solid ${s.border}` }}>
        {s.icon}
        <span className="flex-1 text-[13px] text-white">{toast.msg}</span>
        <button onClick={onClose}><X size={15} color="#fff" /></button>
      </div>
    </div>
  );
};

const Dialog = ({ open, title, body, cancel = "Cancel", confirm, danger, onCancel, onConfirm }) => {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-8" style={{ background: "rgba(0,0,0,.6)" }}>
      <div className="w-full rounded-2xl p-4" style={{ background: "#2C2C2E" }}>
        <div className="text-[15px] font-semibold text-white">{title}</div>
        <div className="text-[13px] mt-1.5 leading-snug" style={{ color: SUB }}>{body}</div>
        <div className="flex gap-2.5 mt-4">
          <button onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-medium text-white" style={{ background: "#48484A" }}>{cancel}</button>
          <button onClick={onConfirm} className="flex-1 rounded-lg py-2.5 text-sm font-semibold"
            style={{ background: danger ? RED : ACCENT, color: danger ? "#fff" : "#062B26" }}>{confirm}</button>
        </div>
      </div>
    </div>
  );
};

const Sheet = ({ open, onClose, children, title }) => {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" style={{ background: "rgba(0,0,0,.55)" }} onClick={onClose}>
      <div className="rounded-t-3xl px-5 pt-4 pb-7 max-h-[85%] overflow-y-auto" style={{ background: "#1C1C1E" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[17px] font-semibold text-white">{title}</div>
          <button onClick={onClose} className="rounded-full p-1.5" style={{ background: "#3A3A3C" }}><X size={15} color="#ddd" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* ───────── BatteryRing (PRD §5.1 — 9 states) ───────── */
const BatteryRing = ({ level, charging, connected, capacity, outPower, inPower, size = 190 }) => {
  const sw = 13, r = (size - sw) / 2, C = 2 * Math.PI * r;
  const pct = connected ? level : 0;
  const col = connected ? levelColor(level) : "#48484A";
  let sub = "";
  if (!connected) sub = "Disconnected";
  else if (level >= 100) sub = "";
  else if (charging) sub = inPower > 0 ? `${fmtDur((capacity * (100 - level)) / 100 / inPower)} to full` : "";
  else sub = outPower > 0 ? `${fmtDur((capacity * level) / 100 / outPower)} remaining` : "";
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}
      role="img" aria-label={connected ? `Battery ${level}%` : "Disconnected"}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2E2E30" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 1s ease-in-out, stroke 1s ease-in-out" }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        {connected && charging && <Zap size={16} color={level >= 100 ? ACCENT : "#fff"} fill={level >= 100 ? ACCENT : "#fff"} />}
        {connected ? (
          <div className="text-white font-semibold" style={{ fontSize: 40, lineHeight: 1.05 }}>
            {level}<span className="text-base font-medium" style={{ color: SUB }}>%</span>
          </div>
        ) : (
          <div className="text-white font-semibold" style={{ fontSize: 44, lineHeight: 1 }}>-</div>
        )}
        {sub && <div className="text-xs mt-1" style={{ color: SUB }}>{sub}</div>}
      </div>
    </div>
  );
};

/* ───────── BatteryTag (horizontal pill, 9 states) ───────── */
const BatteryTag = ({ level, charging, connected }) => {
  if (!connected) return <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ color: RED, background: "rgba(255,59,48,.12)" }}>Disconnected</span>;
  const col = levelColor(level);
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md" style={{ background: "#1A1A1A", color: "#fff" }}>
      <span className="relative flex items-center">
        <span className="relative rounded-[3px] flex items-center" style={{ width: 22, height: 11, border: `1.5px solid ${SUB}`, padding: 1 }}>
          <span className="rounded-[1.5px] h-full" style={{ width: `${level}%`, background: col }} />
          {charging && <Zap size={8} color="#fff" fill="#fff" className="absolute left-1/2 -translate-x-1/2" />}
        </span>
        <span style={{ width: 2, height: 5, background: SUB, borderRadius: 1, marginLeft: 1 }} />
      </span>
      {level}%
    </span>
  );
};

/* ───────── Bottom Navigation (floating pill) ───────── */
const BottomNav = ({ tab, setTab }) => {
  const items = [["device", Home], ["insights", TrendingUp], ["setting", Settings]];
  return (
    <div className="absolute left-0 right-0 flex justify-center z-30" style={{ bottom: 18 }}>
      <div className="flex items-center gap-2 px-3 py-2 rounded-full"
        style={{ background: "#0D2723", border: "1px solid #15473F", boxShadow: "0 8px 24px rgba(0,0,0,.5)" }}>
        {items.map(([k, I]) => (
          <button key={k} onClick={() => setTab(k)} aria-label={k}
            className="flex items-center justify-center rounded-full transition-all duration-200"
            style={{ width: 48, height: 48, background: tab === k ? "rgba(1,214,190,.18)" : "transparent", border: tab === k ? "1px solid rgba(1,214,190,.5)" : "1px solid transparent" }}>
            <I size={20} color={tab === k ? ACCENT : "#5A6B68"} />
          </button>
        ))}
      </div>
    </div>
  );
};

/* ───────── Charts ───────── */
const smoothPath = (pts) => {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  return d;
};
const toPts = (data, w, h, pad = 4, max) => {
  const m = max || Math.max(...data, 1);
  return data.map((v, i) => [pad + (i * (w - pad * 2)) / (data.length - 1), h - pad - (v / m) * (h - pad * 2 - 8)]);
};

/* ═════════ AUTH & ONBOARDING (PRD §4.7) ═════════ */
const AuthFlow = ({ onDone }) => {
  const [step, setStep] = useState("login"); // login | email | otp | name | firstDevice
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpErr, setOtpErr] = useState(false);
  const [resend, setResend] = useState(59);
  const [name, setName] = useState("");
  // API 状态
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError,   setApiError]   = useState("");
  const [apiToken,   setApiToken]   = useState(null);

  useEffect(() => {
    if (step !== "otp") return;
    setResend(59);
    const t = setInterval(() => setResend((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  /* ── 真实 API 登录（密码 MD5 由 apiLogin 内部处理）── */
  const doApiLogin = async () => {
    setApiLoading(true); setApiError("");
    try {
      const resp = await apiLogin(email.trim(), password);
      // 成功码为 0 或 '0'；token 字段为 accessToken
      if (_isOk(resp) && resp.data) {
        const token  = resp.data.accessToken || '';
        const uname  = resp.data.account || email.split('@')[0];
        onDone(uname, email, false, token, resp.data);
      } else {
        // code 7 = 密码错误（明文密码），其余显示 message
        const msg = resp?.message || resp?.msg || `Error code ${resp?.code ?? 'unknown'}`;
        setApiError(msg);
      }
    } catch(e) {
      const isCors = e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError');
      setApiError(isCors
        ? 'Network/CORS error — API unreachable from this origin.'
        : (e.message || 'Unknown error'));
      console.error('[SierroAPI] Login error:', e);
    } finally { setApiLoading(false); }
  };

  /* ── 账号 + 密码一步登录（不走 OTP）── */
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);

  /* ── 邮箱验证码登录所需状态 ── */
  const [captchaId, setCaptchaId] = useState("");   // 后端返回的 iotCaptchaId
  const [sending, setSending]     = useState(false); // 验证码发送中

  /* 发送邮箱验证码（intent=3 登录） */
  const doSendEmailCaptcha = async () => {
    if (!/.+@.+\..+/.test(email)) { setEmailErr(true); return; }
    setSending(true); setApiError("");
    try {
      const resp = await apiSendEmailCaptcha(email.trim(), "3");
      if (_isOk(resp)) {
        setCaptchaId(resp.data?.iotCaptchaId || "");
        setOtp(""); setOtpErr(false);
        setStep("otp");
      } else {
        setApiError(resp?.message || resp?.msg || `Failed to send code (${resp?.code})`);
      }
    } catch(e) {
      const isCors = e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError');
      setApiError(isCors ? 'Network/CORS error — API unreachable.' : (e.message || 'Unknown error'));
    } finally { setSending(false); }
  };

  /* 邮箱验证码登录 */
  const doEmailOtpLogin = async () => {
    setApiLoading(true); setOtpErr(false); setApiError("");
    try {
      const resp = await apiLoginByEmail(email.trim(), captchaId, otp);
      if (_isOk(resp) && resp.data) {
        const token = resp.data.accessToken || '';
        const uname = resp.data.account || email.split('@')[0];
        onDone(uname, email, false, token, resp.data);
      } else {
        setOtpErr(true);
        setApiError(resp?.message || resp?.msg || 'Invalid verification code.');
      }
    } catch(e) {
      setApiError(e.message || 'Unknown error');
    } finally { setApiLoading(false); }
  };

  const Btn3rd = ({ icon, label, onClick }) => (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl px-4 py-3.5 active:opacity-70"
      style={{ background: CARD }}>
      {icon}<span className="text-[15px] font-medium text-white">{label}</span>
    </button>
  );

  if (step === "login") return (
    <div className="flex flex-col h-full px-5 pt-16">
      <div className="flex flex-col items-center mb-8">
        <div className="rounded-2xl flex items-center justify-center mb-4" style={{ width: 56, height: 56, background: "rgba(1,214,190,.12)" }}>
          <Zap size={28} color={ACCENT} fill={ACCENT} />
        </div>
        <h1 className="text-[26px] font-bold text-white text-center">Sign up or log in</h1>
      </div>

      {/* 主入口：账号密码登录 */}
      <button onClick={() => { setStep("account"); setApiError(""); }}
        className="w-full flex items-center gap-3 rounded-xl px-4 py-3.5 active:opacity-80 mb-3"
        style={{ background: ACCENT }}>
        <User size={18} color="#062B26" />
        <span className="text-[15px] font-semibold" style={{ color: "#062B26" }}>Sign in with Account</span>
      </button>

      {/* 备选：邮箱验证码登录 */}
      <Btn3rd icon={<Mail size={18} color="#fff" />} label="Continue with Email"
        onClick={() => { setStep("email"); setApiError(""); }} />

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px" style={{ background: LINE }} /><span className="text-xs" style={{ color: SUB }}>OR</span><div className="flex-1 h-px" style={{ background: LINE }} />
      </div>
      <div className="space-y-3">
        <Btn3rd icon={<span className="text-[16px]">🇬</span>} label="Continue with Google" onClick={() => setStep("name")} />
        <Btn3rd icon={<span className="text-[16px]"></span>} label="Continue with Apple" onClick={() => setStep("name")} />
      </div>
      <p className="text-[11px] text-center mt-6" style={{ color: SUB }}>
        By continuing, you agree to our <span style={{ color: ACCENT }}>Terms of Use</span> and <span style={{ color: ACCENT }}>Privacy Policy</span>
      </p>
    </div>
  );

  /* ── 账号密码登录（POST /login/account）── */
  if (step === "account") return (
    <div className="flex flex-col h-full">
      <TopBar onBack={() => { setStep("login"); setApiError(""); setPassword(""); }} />
      <div className="px-5 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">Sign in</h1>
        <p className="text-[13px] text-center mt-1 mb-6" style={{ color: SUB }}>
          Enter your account and password.
        </p>

        {/* 账号输入 */}
        <label className="text-[12px] font-medium block mb-1.5 px-1" style={{ color: SUB }}>Account</label>
        <div className="rounded-xl px-4 py-3.5 flex items-center mb-4"
          style={{ background: CARD, border: emailErr ? `1px solid ${RED}` : "1px solid transparent" }}>
          <User size={16} color={SUB} className="mr-2.5 shrink-0" />
          <input value={email} autoFocus
            onChange={(e) => { setEmail(e.target.value); setEmailErr(false); setApiError(""); }}
            placeholder="Account or email" type="text" autoCapitalize="none" autoCorrect="off"
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
          {email && <button onClick={() => setEmail("")}><CircleX size={16} color={SUB} /></button>}
        </div>

        {/* 密码输入（含显示/隐藏切换） */}
        <label className="text-[12px] font-medium block mb-1.5 px-1" style={{ color: SUB }}>Password</label>
        <div className="rounded-xl px-4 py-3.5 flex items-center"
          style={{ background: CARD, border: apiError ? `1px solid ${RED}` : "1px solid transparent" }}>
          <span className="mr-2.5 shrink-0 text-[15px]" style={{ color: SUB }}>🔒</span>
          <input value={password}
            onChange={(e) => { setPassword(e.target.value); setApiError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && email.trim() && password.trim() && !apiLoading) doApiLogin(); }}
            placeholder="Password" type={showPwd ? "text" : "password"}
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
          <button onClick={() => setShowPwd(v => !v)} className="ml-2 shrink-0">
            <span className="text-[11px] font-medium" style={{ color: SUB }}>{showPwd ? "Hide" : "Show"}</span>
          </button>
        </div>

        {/* 忘记密码 */}
        <div className="flex justify-end mt-2">
          <button className="text-[12px] font-medium" style={{ color: ACCENT }}
            onClick={() => setStep("forgot")}>Forgot password?</button>
        </div>

        {/* MD5 加密说明 */}
        <div className="flex items-center gap-1.5 mt-3 px-1">
          <span className="rounded-sm flex items-center justify-center" style={{ width: 14, height: 14, background: "#1A3A34" }}>
            <Check size={10} color={ACCENT} />
          </span>
          <span className="text-[10px]" style={{ color: "#4A8A80" }}>
            Password encrypted with MD5 before transmission
          </span>
        </div>

        {/* API 错误提示 */}
        {apiError && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mt-3"
            style={{ background: "#3E1512", border: `1px solid #6E2620` }}>
            <CircleAlert size={14} color={RED} />
            <span className="text-[12px] text-white flex-1">{apiError}</span>
          </div>
        )}
      </div>

      <div className="px-5 pb-8">
        <PrimaryBtn
          disabled={!email.trim() || !password.trim() || apiLoading}
          onClick={doApiLogin}>
          {apiLoading ? "Signing in…" : "Sign In"}
        </PrimaryBtn>
        <p className="text-[12px] text-center mt-4" style={{ color: SUB }}>
          No account yet? <button className="font-medium" style={{ color: ACCENT }} onClick={() => setStep("register")}>Create one</button>
        </p>
      </div>
    </div>
  );

  if (step === "email") return (
    <div className="flex flex-col h-full">
      <TopBar onBack={() => { setStep("login"); setApiError(""); }} />
      <div className="px-5 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">Enter your email</h1>
        <p className="text-[13px] text-center mt-1 mb-6" style={{ color: SUB }}>
          We'll send a verification code to your email.
        </p>
        <div className="rounded-xl px-4 py-3.5 flex items-center"
          style={{ background: CARD, border: emailErr ? `1px solid ${RED}` : "1px solid transparent" }}>
          <Mail size={16} color={SUB} className="mr-2.5 shrink-0" />
          <input value={email} autoFocus type="email" autoCapitalize="none" autoCorrect="off"
            onChange={(e) => { setEmail(e.target.value); setEmailErr(false); setApiError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !sending) doSendEmailCaptcha(); }}
            placeholder="name@example.com"
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
          {email && <button onClick={() => setEmail("")}><CircleX size={16} color={SUB} /></button>}
        </div>
        {emailErr && <p className="text-[11px] mt-1.5" style={{ color: RED }}>Please enter a valid email address.</p>}
        {apiError && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mt-3"
            style={{ background: "#3E1512", border: `1px solid #6E2620` }}>
            <CircleAlert size={14} color={RED} />
            <span className="text-[12px] text-white flex-1">{apiError}</span>
          </div>
        )}
      </div>
      <div className="px-5 pb-8">
        <PrimaryBtn disabled={!email.trim() || sending} onClick={doSendEmailCaptcha}>
          {sending ? "Sending…" : "Continue"}
        </PrimaryBtn>
      </div>
    </div>
  );

  if (step === "otp") return (
    <div className="flex flex-col h-full">
      <TopBar onBack={() => { setStep("email"); setApiError(""); }} />
      <div className="px-5 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">Enter verification code</h1>
        <p className="text-[13px] text-center mt-1 mb-6" style={{ color: SUB }}>
          We sent a 6-digit verification code to<br /><b className="text-white">{email}</b>
        </p>
        <div className="relative">
          <div className="flex gap-2 justify-center">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-center rounded-lg text-lg font-semibold text-white"
                style={{ width: 46, height: 52, background: otpErr ? "#3E1512" : CARD, border: `1px solid ${otpErr ? RED : i === otp.length ? ACCENT : LINE}` }}>
                {otp[i] || ""}
              </div>
            ))}
          </div>
          <input autoFocus value={otp} inputMode="numeric" maxLength={6}
            onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpErr(false); setApiError(""); }}
            className="absolute inset-0 opacity-0 w-full" />
        </div>
        {(otpErr || apiError) && <p className="text-[11px] text-center mt-2" style={{ color: RED }}>{apiError || "Invalid verification code."}</p>}
        <button disabled={resend > 0 || sending} onClick={doSendEmailCaptcha}
          className="block mx-auto mt-3 text-[12px]" style={{ color: resend > 0 ? "#3F6B65" : ACCENT }}>
          {sending ? "Sending…" : `Resend Code${resend > 0 ? ` (${resend})` : ""}`}
        </button>
      </div>
      <div className="px-5 pb-8">
        <PrimaryBtn disabled={otp.length < 6 || apiLoading} onClick={doEmailOtpLogin}>
          {apiLoading ? "Verifying…" : "Continue"}
        </PrimaryBtn>
      </div>
    </div>
  );

  /* ── 注册（邮箱注册，POST /user/register/email）── */
  if (step === "register") return (
    <div className="flex flex-col h-full">
      <TopBar onBack={() => { setStep("account"); setApiError(""); }} />
      <div className="px-5 flex-1 overflow-y-auto">
        <h1 className="text-[22px] font-bold text-white text-center">Create account</h1>
        <p className="text-[13px] text-center mt-1 mb-6" style={{ color: SUB }}>
          Register with your email and a password.
        </p>
        <label className="text-[12px] font-medium block mb-1.5 px-1" style={{ color: SUB }}>Account name</label>
        <div className="rounded-xl px-4 py-3.5 flex items-center mb-4" style={{ background: CARD }}>
          <User size={16} color={SUB} className="mr-2.5 shrink-0" />
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Choose an account name"
            autoCapitalize="none" className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
        </div>
        <label className="text-[12px] font-medium block mb-1.5 px-1" style={{ color: SUB }}>Email</label>
        <div className="rounded-xl px-4 py-3.5 flex items-center mb-4"
          style={{ background: CARD, border: emailErr ? `1px solid ${RED}` : "1px solid transparent" }}>
          <Mail size={16} color={SUB} className="mr-2.5 shrink-0" />
          <input value={email} type="email" autoCapitalize="none"
            onChange={(e) => { setEmail(e.target.value); setEmailErr(false); }} placeholder="name@example.com"
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
        </div>
        <label className="text-[12px] font-medium block mb-1.5 px-1" style={{ color: SUB }}>Password</label>
        <div className="rounded-xl px-4 py-3.5 flex items-center" style={{ background: CARD }}>
          <span className="mr-2.5 shrink-0 text-[15px]" style={{ color: SUB }}>🔒</span>
          <input value={password} type={showPwd ? "text" : "password"}
            onChange={(e) => { setPassword(e.target.value); setApiError(""); }} placeholder="Create a password"
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
          <button onClick={() => setShowPwd(v => !v)} className="ml-2 shrink-0">
            <span className="text-[11px] font-medium" style={{ color: SUB }}>{showPwd ? "Hide" : "Show"}</span>
          </button>
        </div>
        {apiError && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mt-3"
            style={{ background: "#3E1512", border: `1px solid #6E2620` }}>
            <CircleAlert size={14} color={RED} />
            <span className="text-[12px] text-white flex-1">{apiError}</span>
          </div>
        )}
      </div>
      <div className="px-5 pb-8">
        <PrimaryBtn disabled={!name.trim() || !email.trim() || !password.trim() || apiLoading}
          onClick={async () => {
            if (!/.+@.+\..+/.test(email)) { setEmailErr(true); return; }
            setApiLoading(true); setApiError("");
            try {
              const resp = await apiRegisterByEmail(name.trim(), password, email.trim());
              if (_isOk(resp)) { setPassword(""); setStep("account"); setApiError(""); }
              else setApiError(resp?.message || resp?.msg || `Register failed (${resp?.code})`);
            } catch(e) { setApiError(e.message || 'Unknown error'); }
            finally { setApiLoading(false); }
          }}>
          {apiLoading ? "Creating…" : "Create Account"}
        </PrimaryBtn>
        <p className="text-[12px] text-center mt-4" style={{ color: SUB }}>
          Already have an account? <button className="font-medium" style={{ color: ACCENT }} onClick={() => setStep("account")}>Sign in</button>
        </p>
      </div>
    </div>
  );

  /* ── 忘记密码（POST /user/reset/password）── */
  if (step === "forgot") return (
    <div className="flex flex-col h-full">
      <TopBar onBack={() => { setStep("account"); setApiError(""); }} />
      <div className="px-5 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">Reset password</h1>
        <p className="text-[13px] text-center mt-1 mb-6" style={{ color: SUB }}>
          Enter your account and a new password.
        </p>
        <label className="text-[12px] font-medium block mb-1.5 px-1" style={{ color: SUB }}>Account</label>
        <div className="rounded-xl px-4 py-3.5 flex items-center mb-4" style={{ background: CARD }}>
          <User size={16} color={SUB} className="mr-2.5 shrink-0" />
          <input value={email} autoFocus onChange={(e) => { setEmail(e.target.value); setApiError(""); }}
            placeholder="Account or email" autoCapitalize="none"
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
        </div>
        <label className="text-[12px] font-medium block mb-1.5 px-1" style={{ color: SUB }}>New password</label>
        <div className="rounded-xl px-4 py-3.5 flex items-center" style={{ background: CARD }}>
          <span className="mr-2.5 shrink-0 text-[15px]" style={{ color: SUB }}>🔒</span>
          <input value={password} type={showPwd ? "text" : "password"}
            onChange={(e) => { setPassword(e.target.value); setApiError(""); }} placeholder="New password"
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
          <button onClick={() => setShowPwd(v => !v)} className="ml-2 shrink-0">
            <span className="text-[11px] font-medium" style={{ color: SUB }}>{showPwd ? "Hide" : "Show"}</span>
          </button>
        </div>
        {apiError && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mt-3"
            style={{ background: "#3E1512", border: `1px solid #6E2620` }}>
            <CircleAlert size={14} color={RED} />
            <span className="text-[12px] text-white flex-1">{apiError}</span>
          </div>
        )}
      </div>
      <div className="px-5 pb-8">
        <PrimaryBtn disabled={!email.trim() || !password.trim() || apiLoading}
          onClick={async () => {
            setApiLoading(true); setApiError("");
            try {
              const resp = await apiResetPassword(email.trim(), password);
              if (_isOk(resp)) { setPassword(""); setStep("account"); setApiError(""); }
              else setApiError(resp?.message || resp?.msg || `Reset failed (${resp?.code})`);
            } catch(e) { setApiError(e.message || 'Unknown error'); }
            finally { setApiLoading(false); }
          }}>
          {apiLoading ? "Submitting…" : "Reset Password"}
        </PrimaryBtn>
      </div>
    </div>
  );

  if (step === "name") return (
    <div className="flex flex-col h-full">
      <TopBar onBack={() => setStep("login")} />
      <div className="px-5 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">What should we call you?</h1>
        <p className="text-[13px] text-center mt-1 mb-6" style={{ color: SUB }}>Help personalize your Sierro experience.</p>
        <div className="rounded-xl px-4 py-3.5 flex items-center" style={{ background: CARD }}>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Your name"
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
          {name && <button onClick={() => setName("")}><CircleX size={16} color={SUB} /></button>}
        </div>
      </div>
      <div className="px-5 pb-8">
        <PrimaryBtn disabled={!name.trim()} onClick={() => setStep("firstDevice")}>Continue</PrimaryBtn>
      </div>
    </div>
  );

  // firstDevice
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-3" style={{ minHeight: 56 }}>
        <IconBtn icon={ChevronLeft} onClick={() => setStep("name")} />
        <button className="text-[14px] font-medium" style={{ color: ACCENT }} onClick={() => onDone(name || email.split("@")[0] || "User", email, true)}>Skip for now</button>
      </div>
      <div className="px-5 flex-1 flex flex-col items-center">
        <h1 className="text-[22px] font-bold text-white text-center">Add Your First Device</h1>
        <p className="text-[13px] text-center mt-1" style={{ color: SUB }}>Connect your first Sierro device to monitor battery status and stay prepared during power outages.</p>
        <div className="flex-1 flex items-center">
          <div className="rounded-2xl flex items-center justify-center" style={{ width: 140, height: 140, background: "#3A3A3C" }}>
            <Zap size={44} color="#5A5A5E" />
          </div>
        </div>
      </div>
      <div className="px-5 pb-8">
        <PrimaryBtn onClick={() => onDone(name || "User", email, false)}>Connect Device</PrimaryBtn>
      </div>
    </div>
  );
};

/* ═════════ ADD DEVICE FLOW (PRD §4.2.4) ═════════ */
const AddDeviceFlow = ({ onClose, onAdded, existingNames, firstTime }) => {
  const [step, setStep] = useState(firstTime ? "permission" : "scan");
  const [found, setFound] = useState([]);
  const [noResult, setNoResult] = useState(false);
  const [picked, setPicked] = useState(null);
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState(false);
  const [icon, setIcon] = useState("zap");
  const [failToast, setFailToast] = useState(false);

  useEffect(() => {
    if (step !== "scan") return;
    setFound([]); setNoResult(false);
    const t1 = setTimeout(() => setFound([{ model: "Sierro 1000", serial: "SN84B2K" }]), 1800);
    const t2 = setTimeout(() => setFound((f) => [...f, { model: "Sierro 2000", serial: "SN19X4C" }]), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step]);

  const Radar = () => (
    <div className="relative flex items-center justify-center my-8" style={{ height: 200 }}>
      {[150, 230, 310].map((d, i) => (
        <div key={d} className="absolute rounded-full animate-pulse" style={{ width: d, height: d, border: "1px solid #2E2E30", animationDelay: `${i * 0.4}s` }} />
      ))}
      <div className="rounded-2xl flex items-center justify-center" style={{ width: 56, height: 96, background: "#0A0A0A", border: "1px solid #333" }}>
        <Bluetooth size={16} color={ACCENT} />
      </div>
    </div>
  );

  if (step === "permission") return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <TopBar onBack={onClose} />
      <div className="px-6 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">Before We Get Started</h1>
        <p className="text-[13px] text-center mt-1 mb-8" style={{ color: SUB }}>To connect your Sierro device, we'll need:</p>
        {[[Bluetooth, "Bluetooth", "Find and connect nearby devices."], [Globe, "Local Network", "Connect your device to your home network."]].map(([I, t, s]) => (
          <div key={t} className="flex items-center gap-3.5 py-3.5">
            <span className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, background: CARD }}><I size={18} color={ACCENT} /></span>
            <div><div className="text-[15px] font-medium text-white">{t}</div><div className="text-xs mt-0.5" style={{ color: SUB }}>{s}</div></div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-8"><PrimaryBtn onClick={() => setStep("scan")}>Continue</PrimaryBtn></div>
    </div>
  );

  if (step === "scan" || step === "qr") return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <div className="flex items-center px-4 pt-3" style={{ minHeight: 56 }}>
        <div className="w-20"><IconBtn icon={ChevronLeft} onClick={onClose} /></div>
        <div className="flex-1 text-center text-[16px] font-semibold text-white">Add Device</div>
        <div className="w-20 text-right">
          <button className="text-[13px] font-medium" style={{ color: ACCENT }} onClick={() => setStep("qrscan")}>Scan QR</button>
        </div>
      </div>
      <div className="px-5 flex-1 overflow-y-auto pb-6">
        <h2 className="text-[19px] font-bold text-white text-center mt-2">{noResult ? "No Devices Found" : "Searching for nearby devices..."}</h2>
        <p className="text-[12px] text-center mt-1" style={{ color: SUB }}>
          {noResult ? "We couldn't find any nearby devices. Make sure your Sierro device is powered on and nearby." : "Keep your phone near the Sierro device and make sure it's powered on."}
        </p>
        <Radar />
        {found.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold text-white mb-2">Found Devices ({found.length})</div>
            {found.map((d) => (
              <div key={d.serial} className="flex items-center justify-between rounded-xl px-4 py-3 mb-2.5" style={{ background: CARD }}>
                <div><div className="text-[14px] font-medium text-white">{d.model}</div><div className="text-[11px]" style={{ color: SUB }}>{d.serial}</div></div>
                <button onClick={() => { setPicked(d); setStep("name"); }}
                  className="text-[12px] font-semibold px-3.5 py-1.5 rounded-full active:scale-95"
                  style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}>Connect</button>
              </div>
            ))}
          </div>
        )}
        {failToast && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mt-2" style={{ background: "#3E1512", border: "1px solid #6E2620" }}>
            <CircleAlert size={15} color={RED} /><span className="flex-1 text-[12px] text-white">Failed to connect to device. Please try again.</span>
            <button onClick={() => setFailToast(false)}><X size={14} color="#fff" /></button>
          </div>
        )}
      </div>
    </div>
  );

  if (step === "qrscan") return (
    <div className="flex flex-col h-full" style={{ background: "#0A0A0A" }}>
      <TopBar onBack={() => setStep("scan")} center={<span className="text-white font-semibold">Scan QR Code</span>} />
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="relative rounded-2xl" style={{ width: 230, height: 230, background: "#1A1A1A" }}>
          {[["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].map(([v, h]) => (
            <span key={v + h} className="absolute" style={{
              [v]: -2, [h]: -2, width: 34, height: 34,
              [`border${v[0].toUpperCase() + v.slice(1)}`]: `4px solid ${ACCENT}`,
              [`border${h[0].toUpperCase() + h.slice(1)}`]: `4px solid ${ACCENT}`,
              borderRadius: 10,
            }} />
          ))}
          <QrCode size={110} color="#3A3A3C" className="absolute inset-0 m-auto" />
        </div>
        <h2 className="text-[18px] font-bold text-white mt-10">Scan the QR Code on Your Device</h2>
        <p className="text-[12px] text-center mt-1.5" style={{ color: SUB }}>The QR code is located on the side of your Sierro device near the power outlet.</p>
        <button className="mt-6 text-[13px] font-medium" style={{ color: ACCENT }}
          onClick={() => { setPicked({ model: "Sierro 1000", serial: "SNQR88X" }); setStep("confirm"); }}>
          Simulate scan success
        </button>
      </div>
    </div>
  );

  if (step === "confirm") return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <TopBar onBack={() => setStep("qrscan")} />
      <div className="px-5 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">Device Ready to Connect</h1>
        <p className="text-[13px] text-center mt-1 mb-6" style={{ color: SUB }}>We identified your Sierro device. Review the details below before connecting.</p>
        <div className="flex justify-center my-6">
          <div className="rounded-xl flex items-center justify-center" style={{ width: 90, height: 130, background: "#E8E8E8" }}>
            <Zap size={26} color={ACCENT} />
          </div>
        </div>
        {[["Model", picked?.model], ["Serial Number", picked?.serial]].map(([k, v], i) => (
          <div key={k} className="flex items-center justify-between px-4 py-3.5 rounded-xl mb-2" style={{ background: CARD }}>
            <span className="text-[14px] text-white">{k}</span><span className="text-[14px]" style={{ color: SUB }}>{v}</span>
          </div>
        ))}
      </div>
      <div className="px-5 pb-8 flex gap-3">
        <button onClick={() => setStep("qrscan")} className="flex-1 rounded-xl py-3.5 text-[15px] font-semibold" style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}>Rescan</button>
        <button onClick={() => setStep("name")} className="flex-1 rounded-xl py-3.5 text-[15px] font-semibold" style={{ background: ACCENT, color: "#062B26" }}>Connect Device</button>
      </div>
    </div>
  );

  if (step === "name") return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <TopBar onBack={() => setStep("scan")} />
      <div className="px-5 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">Name Your Device</h1>
        <p className="text-[13px] text-center mt-1 mb-6" style={{ color: SUB }}>Choose a name to help identify this device in the app.</p>
        <div className="rounded-xl px-4 py-3.5 flex items-center" style={{ background: CARD, border: nameErr ? `1px solid ${RED}` : "1px solid transparent" }}>
          <input value={name} autoFocus placeholder="Enter device name"
            onChange={(e) => { setName(e.target.value); setNameErr(false); }}
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder:text-neutral-500" />
          {name && <button onClick={() => setName("")}><CircleX size={16} color={SUB} /></button>}
        </div>
        {nameErr && <p className="text-[11px] mt-1.5" style={{ color: RED }}>Device name already exists.</p>}
      </div>
      <div className="px-5 pb-8">
        <PrimaryBtn disabled={!name.trim()} onClick={() => {
          if (existingNames.includes(name.trim())) { setNameErr(true); return; }
          setStep("icon");
        }}>Next</PrimaryBtn>
      </div>
    </div>
  );

  // icon
  return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <TopBar onBack={() => setStep("name")} />
      <div className="px-5 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">Choose an Icon</h1>
        <p className="text-[13px] text-center mt-1 mb-7" style={{ color: SUB }}>Select an icon that best represents this device.</p>
        <div className="grid grid-cols-4 gap-3.5">
          {ICON_KEYS.map((k) => {
            const I = ICONS[k], sel = icon === k;
            return (
              <button key={k} onClick={() => setIcon(k)} aria-label={k}
                className="rounded-2xl flex items-center justify-center active:scale-95 transition"
                style={{ height: 64, background: sel ? ACCENT : CARD }}>
                <I size={22} color={sel ? "#062B26" : "#fff"} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-5 pb-8">
        <PrimaryBtn onClick={() => onAdded({ name: name.trim(), icon, model: picked?.model || "Sierro 1000", serial: picked?.serial || "SNXXXX" })}>Finish</PrimaryBtn>
      </div>
    </div>
  );
};

/* ═════════ DEVICE TAB (PRD §4.2) ═════════ */
const DevicePage = ({ devices, toggleDevice, openOverview, openAdd, notifications, openNotifs, dismissBanner, banner }) => {
  const unread = notifications.some((n) => !n.read);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h1 className="text-[26px] font-bold text-white">Device</h1>
        <div className="flex gap-2.5">
          <IconBtn icon={Plus} onClick={openAdd} />
          <IconBtn icon={Bell} onClick={openNotifs} dot={unread} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {banner && (
          <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 mb-3" style={{ background: "#3E1512", border: "1px solid #6E2620" }}>
            <BatteryLow size={16} color={RED} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-white">{banner.title}</div>
              <div className="text-[12px] mt-0.5" style={{ color: "#E8B4AF" }}>{banner.body}</div>
            </div>
            <button onClick={dismissBanner}><X size={15} color="#fff" /></button>
          </div>
        )}
        {devices.length === 0 ? (
          <div className="flex flex-col items-center pt-20">
            <div className="rounded-2xl" style={{ width: 120, height: 150, background: "#3A3A3C" }} />
            <div className="text-[16px] font-semibold text-white mt-6">No devices yet</div>
            <p className="text-[12px] text-center mt-1 mb-5" style={{ color: SUB, maxWidth: 240 }}>Add your first Sierro device to start monitoring and receiving alerts.</p>
            <OutlineBtn onClick={openAdd}><span className="flex items-center gap-1"><Plus size={14} /> Add Device</span></OutlineBtn>
          </div>
        ) : devices.map((d) => {
          const I = ICONS[d.icon] || Zap;
          return (
            <button key={d.id} onClick={() => openOverview(d.id)}
              className="w-full rounded-2xl p-4 mb-3 text-left active:scale-[.99] transition" style={{ background: CARD }}>
              <div className="flex items-start justify-between">
                <span className="rounded-lg flex items-center justify-center" style={{ width: 38, height: 38, background: "#1A1A1A" }}>
                  <I size={18} color="#fff" />
                </span>
                <BatteryTag level={d.level} charging={d.charging} connected={d.connected} />
              </div>
              <div className="flex items-end justify-between mt-3">
                <div className="min-w-0 pr-3">
                  <div className="text-[15px] font-semibold text-white leading-snug" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.name}</div>
                  <div className="text-[12px] mt-1" style={{ color: SUB }}>{d.model}</div>
                </div>
                <Toggle on={d.on} disabled={!d.connected} onChange={() => toggleDevice(d.id)} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ═════════ NOTIFICATIONS (PRD §4.2.5) ═════════ */
const NotificationsPage = ({ onBack, notifications, markRead, remove }) => {
  const [swiped, setSwiped] = useState(null);
  useEffect(() => () => markRead(), []);
  const ICON_MAP = { low: BatteryLow, solarOn: SunMedium, solarOff: SunMedium, outage: PowerOff };
  return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <TopBar onBack={onBack} title="Notifications" />
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center pt-24">
            <div className="rounded-xl" style={{ width: 100, height: 130, background: "#3A3A3C" }} />
            <div className="text-[15px] font-semibold text-white mt-6">No notifications yet</div>
            <p className="text-[12px] text-center mt-1" style={{ color: SUB, maxWidth: 240 }}>You'll see battery alerts, power outage notifications, and device updates here.</p>
          </div>
        ) : notifications.map((n) => {
          const I = ICON_MAP[n.kind] || Info;
          const open = swiped === n.id;
          return (
            <div key={n.id} className="relative overflow-hidden mb-1 rounded-lg">
              <div className="absolute inset-y-0 right-0 flex items-center justify-center" style={{ width: 64, background: RED }}>
                <button onClick={() => { remove(n.id); setSwiped(null); }}><Trash2 size={18} color="#fff" /></button>
              </div>
              <div onClick={() => setSwiped(open ? null : n.id)}
                className="relative flex gap-3 px-1 py-3 transition-transform duration-200"
                style={{ background: BG, transform: open ? "translateX(-64px)" : "none", borderBottom: "1px solid #232323" }}>
                <span className="rounded-full flex items-center justify-center shrink-0" style={{ width: 34, height: 34, background: CARD }}>
                  <I size={15} color="#fff" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-white truncate">{n.title}</span>
                    {!n.read && <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: RED }} />}
                    <span className="ml-auto text-[11px] shrink-0" style={{ color: SUB }}>{n.time}</span>
                  </div>
                  <div className="text-[12px] mt-0.5 leading-snug" style={{ color: SUB }}>{n.body}</div>
                </div>
              </div>
            </div>
          );
        })}
        {notifications.length > 0 && <p className="text-[11px] text-center mt-4" style={{ color: "#5A5A5E" }}>Tap a notification to reveal delete</p>}
      </div>
    </div>
  );
};

/* ═════════ OVERVIEW — Energy Cockpit (PRD §4.1) ═════════ */
const OverviewPage = ({ device, devices, switchDevice, onBack, openSettings, openNotifs, history, unread }) => {
  const [series, setSeries] = useState("battery");
  const [dropOpen, setDropOpen] = useState(false);
  const d = device;
  const conn = d.connected;
  const data = history[d.id]?.[series] || [];
  const W = 320, H = 110;
  const pts = data.length > 1 ? toPts(data, W, H) : [];
  const line = smoothPath(pts);
  const area = line ? `${line} L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z` : "";
  const tags = [["battery", "Battery"], ["ac", "AC"], ["solar", "Solar"], ["output", "Output"]];

  return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <div className="flex items-center px-4 pt-3" style={{ minHeight: 56 }}>
        <IconBtn icon={ChevronLeft} onClick={onBack} />
        <div className="flex-1 flex flex-col items-center relative">
          <button className="flex items-center gap-1" onClick={() => devices.length > 1 && setDropOpen(!dropOpen)}>
            <span className="text-[16px] font-semibold text-white">{d.name}</span>
            {devices.length > 1 && <ChevronDown size={15} color="#fff" />}
          </button>
          <span className="text-[11px]" style={{ color: conn ? ACCENT : RED }}>{conn ? "Connected" : "Disconnected"}</span>
          {dropOpen && (
            <div className="absolute top-12 z-40 rounded-xl overflow-hidden w-48" style={{ background: "#2C2C2E", boxShadow: "0 10px 30px rgba(0,0,0,.5)" }}>
              {devices.map((x) => (
                <button key={x.id} onClick={() => { switchDevice(x.id); setDropOpen(false); }}
                  className="w-full flex items-center justify-between px-3.5 py-3 text-left" style={{ borderBottom: "1px solid #3A3A3C" }}>
                  <span className="text-[13px] text-white truncate">{x.name}</span>
                  <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: x.connected ? ACCENT : "#5A5A5E" }} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <IconBtn icon={Settings} onClick={openSettings} />
          <IconBtn icon={Bell} onClick={openNotifs} dot={unread} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-10">
        {/* Data trust system (PRD §数据信任): source indicator + last sync */}
        {conn && d.source === "demo" && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 mt-1"
            style={{ background: "rgba(255,214,10,.1)", border: "1px dashed #FFD60A" }}>
            <CircleAlert size={13} color="#FFD60A" />
            <span className="text-[11px] font-semibold" style={{ color: "#FFD60A" }}>DEMO MODE</span>
            <span className="text-[10px]" style={{ color: SUB }}>Simulated data for preview only</span>
          </div>
        )}
        {conn && (
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className="flex items-center gap-1.5 text-[10px]" style={{ color: SUB }}>
              <span className="rounded-full" style={{ width: 6, height: 6, background: d.source === "demo" ? "#FFD60A" : d.source === "modbus" ? "#0A84FF" : "#30D158" }} />
              {d.source === "demo" ? "Demo" : d.source === "modbus" ? "Modbus RTU" : "BLE Direct"}
            </span>
            <span className="text-[10px]" style={{ color: "#5A5A5E" }}>Last sync {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>
          </div>
        )}
        <div className="rounded-3xl pt-7 pb-5 px-5 mt-2"
          style={{ background: CARD2, border: conn && d.source === "demo" ? "1px dashed rgba(255,214,10,.45)" : "1px solid transparent" }}>
          <div className="flex justify-center">
            <BatteryRing level={d.level} charging={d.charging} connected={conn} capacity={d.capacity} outPower={d.output} inPower={d.ac + d.solar} />
          </div>
          <div className="flex items-end justify-between mt-6">
            <div>
              <div className="text-[11px] mb-1.5" style={{ color: SUB }}>Input</div>
              <div className="flex items-center gap-1.5">
                {[["AC", d.ac], ["Solar", d.solar]].map(([k, v], i) => (
                  <React.Fragment key={k}>
                    {i > 0 && <span className="text-[13px]" style={{ color: SUB }}>+</span>}
                    <span className="rounded-lg px-2.5 py-1.5 text-center" style={{ background: "#2C2C2E" }}>
                      <span className="text-[14px] font-semibold text-white">{conn ? v : "-"}</span>
                      <span className="text-[10px]" style={{ color: SUB }}>{conn ? "W" : ""}</span>
                      <div className="text-[9px]" style={{ color: SUB }}>{k}</div>
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] mb-1.5" style={{ color: SUB }}>Output</div>
              <span className="rounded-lg px-2.5 py-1.5 inline-block" style={{ background: "#2C2C2E" }}>
                <span className="text-[14px] font-semibold text-white">{conn ? d.output : "-"}</span>
                <span className="text-[10px]" style={{ color: SUB }}>{conn ? "W" : ""}</span>
                <div className="text-[9px]" style={{ color: SUB }}>&nbsp;</div>
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl p-4 mt-3" style={{ background: CARD2 }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[14px] font-semibold text-white">Real-Time Power</span>
            <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#2C2C2E", color: "#fff" }}>{conn ? `${d.level}%` : "-"}</span>
          </div>
          {conn ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
              <defs>
                <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {area && <path d={area} fill="url(#pg)" />}
              {line && <path d={line} fill="none" stroke="#EDEDED" strokeWidth="1.8" />}
            </svg>
          ) : (
            <div className="flex flex-col items-center py-8">
              <CircleAlert size={26} color={RED} />
              <div className="text-[14px] font-semibold text-white mt-3">Device disconnected</div>
              <div className="text-[12px] mt-1" style={{ color: SUB }}>Reconnect the device to view chart data.</div>
            </div>
          )}
          {conn && (
            <div className="flex justify-between text-[10px] px-1 mt-1" style={{ color: SUB }}>
              {["2am", "4am", "6am", "8am", "10am", "12pm", "2pm"].map((t) => <span key={t}>{t}</span>)}
            </div>
          )}
          <div className="flex gap-1.5 mt-3 rounded-full p-1" style={{ background: "#161616" }}>
            {tags.map(([k, label]) => (
              <button key={k} onClick={() => setSeries(k)} disabled={!conn}
                className="flex-1 rounded-full py-2 text-[11px] font-medium transition"
                style={{ background: series === k ? "#3A3A3C" : "transparent", color: !conn ? "#48484A" : series === k ? "#fff" : SUB }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═════════ 24H CLOCK (PRD §4.3.7.4) ═════════ */
const Clock24 = ({ peak, offPeak, editable, onChange, size = 270 }) => {
  const cx = size / 2, cy = size / 2;
  const rOuter = size * 0.46, rInner = size * 0.30, rBand = (rOuter + rInner) / 2, bandW = rOuter - rInner - 6;
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const a = (h) => ((h / 24) * 360 - 90) * (Math.PI / 180);
  const pt = (h, r) => [cx + r * Math.cos(a(h)), cy + r * Math.sin(a(h))];
  const arc = (h1, h2, r) => {
    let span = ((h2 - h1) % 24 + 24) % 24; if (span === 0) span = 0.001;
    const [x1, y1] = pt(h1, r), [x2, y2] = pt(h1 + span, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const hourFromEvent = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left - (rect.width / size) * cx;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top - (rect.height / size) * cy;
    let deg = (Math.atan2(y, x) * 180) / Math.PI + 90; if (deg < 0) deg += 360;
    return Math.round(deg / 15) % 24;
  };
  const onMove = (e) => {
    if (!dragRef.current || !editable) return;
    e.preventDefault();
    const h = hourFromEvent(e);
    const { seg, end } = dragRef.current;
    const next = { peak: { ...peak }, offPeak: { ...offPeak } };
    next[seg][end] = h;
    onChange(next.peak, next.offPeak);
  };
  const now = new Date();
  const nowH = now.getHours() + now.getMinutes() / 60;
  const Handle = ({ seg, end, color }) => {
    const h = seg === "peak" ? peak[end] : offPeak[end];
    const [x, y] = pt(h, rBand);
    return (
      <circle cx={x} cy={y} r={bandW / 2 + 3} fill={color} stroke="#141414" strokeWidth="3"
        style={{ cursor: "grab", touchAction: "none" }}
        onPointerDown={(e) => { dragRef.current = { seg, end }; e.target.setPointerCapture(e.pointerId); }}
        onPointerUp={() => (dragRef.current = null)} />
    );
  };
  return (
    <svg ref={svgRef} width={size} height={size} className="select-none"
      onPointerMove={onMove} onPointerUp={() => (dragRef.current = null)} style={{ touchAction: editable ? "none" : "auto" }}>
      <circle cx={cx} cy={cy} r={rOuter + 8} fill="#0E0E0E" />
      <circle cx={cx} cy={cy} r={rBand} fill="none" stroke="#1C1C1C" strokeWidth={bandW + 8} />
      {Array.from({ length: 24 }).map((_, h) => {
        const [x1, y1] = pt(h, rInner - 8), [x2, y2] = pt(h, rInner - (h % 6 === 0 ? 16 : 12));
        return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke={h % 6 === 0 ? "#6A6A6E" : "#3A3A3C"} strokeWidth={h % 6 === 0 ? 2 : 1} />;
      })}
      {[["12am", 0], ["6am", 6], ["12pm", 12], ["6pm", 18]].map(([t, h]) => {
        const [x, y] = pt(h, rInner - 28);
        return <text key={t} x={x} y={y + 3} textAnchor="middle" fontSize="10" fill="#9A9A9E" fontWeight="600">{t}</text>;
      })}
      {[2, 4, 8, 10].map((n) => [n, n + 12]).flat().map((h) => {
        const [x, y] = pt(h, rInner - 22);
        return <text key={h} x={x} y={y + 3} textAnchor="middle" fontSize="8" fill="#5A5A5E">{h % 12}</text>;
      })}
      <path d={arc(offPeak.start, offPeak.end, rBand)} fill="none" stroke={ACCENT} strokeWidth={bandW} strokeLinecap="round" />
      <path d={arc(peak.start, peak.end, rBand)} fill="none" stroke={ORANGE} strokeWidth={bandW} strokeLinecap="round" />
      {editable ? (
        <>
          <Handle seg="peak" end="start" color={ORANGE} /><Handle seg="peak" end="end" color={ORANGE} />
          <Handle seg="offPeak" end="start" color={ACCENT} /><Handle seg="offPeak" end="end" color={ACCENT} />
          {(() => { const [x, y] = pt(0, rInner - 44); return <Moon size={13} color="#C8C8CC" x={x - 6.5} y={y - 6.5} />; })()}
          {(() => { const [x, y] = pt(12, rInner - 44); return <Sun size={13} color="#C8C8CC" x={x - 6.5} y={y - 6.5} />; })()}
        </>
      ) : (
        <>
          <line x1={cx} y1={cy} x2={pt(nowH, rInner - 18)[0]} y2={pt(nowH, rInner - 18)[1]} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="4.5" fill="#fff" />
        </>
      )}
    </svg>
  );
};

const inRange = (h, s, e) => { const span = ((e - s) % 24 + 24) % 24; const d = ((h - s) % 24 + 24) % 24; return d >= 0 && d < span; };

/* ═════════ SMART SCHEDULE (PRD §4.3.7) ═════════ */
const SmartSchedulePage = ({ onBack, device, schedule, setSchedule, showToast }) => {
  const [info, setInfo] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [conflict, setConflict] = useState(false);
  const s = schedule;
  const startEdit = () => { setDraft(JSON.parse(JSON.stringify(s))); setEditing(true); };
  const d = editing ? draft : s;

  /* Conflict detection (PRD §4.3.7): schedule windows vs Sleep Mode window */
  const sleepToH = (t) => { const [h, m] = (t || "0:0").split(":").map(Number); return h + m / 60; };
  const hasConflict = (sch) => {
    if (!device.sleep.on) return false;
    const ss = sleepToH(device.sleep.from), se = sleepToH(device.sleep.to);
    for (let h = 0; h < 24; h++) {
      if (!inRange(h, ss, se)) continue;
      if (inRange(h, sch.peak.start, sch.peak.end) || inRange(h, sch.offPeak.start, sch.offPeak.end)) return true;
    }
    return false;
  };
  const doSave = () => { setSchedule({ ...draft, configured: true }); setEditing(false); setConflict(false); showToast("Smart schedule updated"); };

  const savings = (sch) => {
    const p = parseFloat(sch.peakPrice), o = parseFloat(sch.offPrice);
    if (!isFinite(p) || !isFinite(o)) return null;
    const daily = (p - o) * (device.capacity / 1000) * 1 * 0.95 * 0.90 * 0.85;
    return { d: daily, m: daily * 30, y: daily * 365 };
  };
  const sv = savings(d);
  const idleRanges = (() => {
    const occ = Array.from({ length: 24 }, (_, h) => inRange(h, d.peak.start, d.peak.end) || inRange(h, d.offPeak.start, d.offPeak.end));
    const out = []; let st = null;
    for (let h = 0; h < 25; h++) {
      const free = h < 24 && !occ[h];
      if (free && st === null) st = h;
      if (!free && st !== null) { out.push([st, h % 24]); st = null; }
    }
    return out;
  })();
  const nowH = new Date().getHours();
  const mode = inRange(nowH, d.peak.start, d.peak.end) ? "peak" : inRange(nowH, d.offPeak.start, d.offPeak.end) ? "off" : "idle";

  const Num = ({ label, k, unit, def }) => (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "#1A1A1A" }}>
      <div className="text-[10px]" style={{ color: SUB }}>{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <input type="number" value={draft.params[k]} onChange={(e) => setDraft({ ...draft, params: { ...draft.params, [k]: e.target.value } })}
          className="bg-transparent outline-none text-[15px] font-semibold text-white w-16" />
        <span className="text-[10px]" style={{ color: SUB }}>{unit}</span>
      </div>
    </div>
  );
  const LegendCard = ({ color, title, lines, desc, outline }) => (
    <div className="rounded-xl p-3 flex-1" style={{ background: "#1A1A1A", border: outline ? `1px solid ${color}` : "1px solid transparent" }}>
      <div className="flex items-center gap-1.5">
        <span className="rounded-full" style={{ width: 8, height: 8, background: color }} />
        <span className="text-[12px] font-semibold" style={{ color }}>{title}</span>
      </div>
      {lines.map((l) => <div key={l} className="text-[12px] font-semibold text-white mt-1">{l}</div>)}
      <div className="text-[10px] mt-1 leading-snug" style={{ color: SUB }}>{desc}</div>
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <div className="flex items-center px-4 pt-3" style={{ minHeight: 56 }}>
        <div className="w-20"><IconBtn icon={ChevronLeft} onClick={() => editing ? setEditing(false) : onBack()} /></div>
        <div className="flex-1 text-center text-[16px] font-semibold text-white">Smart Schedule</div>
        <div className="w-20 flex justify-end gap-2">
          <IconBtn icon={Info} onClick={() => setInfo(true)} />
          {s.on && !editing && <IconBtn icon={Pencil} onClick={startEdit} />}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-28">
        <div className="flex items-center justify-between rounded-xl px-4 py-3.5" style={{ background: CARD }}>
          <span className="text-[15px] font-medium text-white">{editing ? "Smart Schedule" : "Schedule"}</span>
          <Toggle on={editing ? draft.on : s.on} onChange={(v) => {
            if (editing) setDraft({ ...draft, on: v });
            else if (v && !s.configured) { setSchedule({ ...s, on: true }); startEdit(); }
            else setSchedule({ ...s, on: v });
          }} />
        </div>

        {d.on && (
          <>
            {!editing && (
              <div className="mt-4">
                <div className="text-[13px] font-semibold text-white mb-2">Estimated Savings</div>
                <div className="flex gap-2">
                  {[["Daily", sv?.d], ["Monthly", sv?.m], ["Yearly", sv?.y]].map(([k, v]) => (
                    <div key={k} className="flex-1 rounded-xl px-3 py-2.5" style={{ background: CARD }}>
                      <div className="text-[10px]" style={{ color: SUB }}>{k}</div>
                      <div className="text-[15px] font-semibold text-white mt-0.5">{v == null ? "-" : `$${v.toFixed(2)}`}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-center mt-5">
              <Clock24 peak={d.peak} offPeak={d.offPeak} editable={editing}
                onChange={(p, o) => setDraft({ ...draft, peak: p, offPeak: o })} />
            </div>
            <div className="flex gap-2 mt-4">
              <LegendCard color={ORANGE} title="Peak" outline={!editing && mode === "peak"}
                lines={[`${fmtClock(d.peak.start)} - ${fmtClock(d.peak.end)}`]}
                desc="Sierro discharging, powering your connected devices with stored energy." />
              <LegendCard color={ACCENT} title="Off-Peak" outline={!editing && mode === "off"}
                lines={[`${fmtClock(d.offPeak.start)} - ${fmtClock(d.offPeak.end)}`]}
                desc="Sierro charging, storing cheap grid electricity overnight." />
            </div>
            <div className="mt-2">
              <LegendCard color="#8E8E93" title="Idle" outline={!editing && mode === "idle"}
                lines={idleRanges.map(([a2, b2]) => `${fmtClock(a2)} - ${fmtClock(b2)}`)}
                desc="Grid powers devices directly. Sierro stays idle." />
            </div>

            {editing && (
              <>
                <div className="flex items-center justify-between mt-6 mb-2">
                  <span className="text-[13px] font-semibold text-white">Price</span>
                  <button className="text-[11px] font-medium" style={{ color: ACCENT }}>Add Part-Peak Price</button>
                </div>
                {[["Peak Price", "peakPrice"], ["Off-Peak Price", "offPrice"]].map(([label, k]) => (
                  <div key={k} className="flex items-center justify-between rounded-xl px-4 py-3 mb-2" style={{ background: CARD }}>
                    <span className="text-[13px] text-white">{label}</span>
                    <span className="flex items-baseline gap-1">
                      <span className="text-[13px]" style={{ color: SUB }}>$</span>
                      <input type="number" step="0.01" placeholder="0.00" value={draft[k]}
                        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                        className="bg-transparent outline-none text-right text-[14px] font-semibold text-white w-16" />
                      <span className="text-[11px]" style={{ color: SUB }}>/kWh</span>
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between mt-5 mb-2">
                  <span className="text-[13px] font-semibold text-white">Parameters</span>
                  <button className="text-[11px] font-medium" style={{ color: ACCENT }}
                    onClick={() => setDraft({ ...draft, params: { maxCharge: 400, maxDischarge: 500, minSoc: 0, maxSoc: 100 } })}>Optimize</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Num label="Max Charge" k="maxCharge" unit="W" />
                  <Num label="Max Discharge" k="maxDischarge" unit="W" />
                  <Num label="Min SOC" k="minSoc" unit="%" />
                  <Num label="Max SOC" k="maxSoc" unit="%" />
                </div>
                <div className="text-[13px] font-semibold text-white mt-5 mb-2">Estimated Savings</div>
                <div className="flex gap-2">
                  {[["Daily", sv?.d], ["Monthly", sv?.m], ["Yearly", sv?.y]].map(([k, v]) => (
                    <div key={k} className="flex-1 rounded-xl px-3 py-2.5" style={{ background: CARD }}>
                      <div className="text-[10px]" style={{ color: SUB }}>{k}</div>
                      <div className="text-[14px] font-semibold text-white mt-0.5">{v == null ? "-" : `$${v.toFixed(2)}`}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {editing && (
        <div className="absolute left-0 right-0 px-5" style={{ bottom: 20 }}>
          <PrimaryBtn onClick={() => (hasConflict(draft) ? setConflict(true) : doSave())}>Save</PrimaryBtn>
        </div>
      )}
      <Dialog open={conflict} title="Schedule conflict"
        body={`Smart Schedule overlaps with Sleep Mode (${device.sleep.from} – ${device.sleep.to}). Sleep Mode takes priority during the overlap, so charging or discharging may be limited.`}
        confirm="Save Anyway" onCancel={() => setConflict(false)} onConfirm={doSave} />
      <Sheet open={info} onClose={() => setInfo(false)} title="">
        {[
          ["How Smart Schedule Works?", "During off-peak hours, the system charges the battery using grid power at lower rates. During peak hours, the battery discharges to power your devices, reducing your electricity costs. Smart Schedule automatically optimizes charge/discharge timing based on your local TOU rates."],
          ["How is estimated savings calculated?", "Formula: (Peak − Off-Peak) × Capacity × Cycles × Efficiency(95%) × DoD(90%) × Execution(85%)"],
        ].map(([t, b]) => (
          <div key={t} className="mb-4">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-white"><Zap size={13} color={ACCENT} />{t}</div>
            <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: SUB }}>{b}</p>
          </div>
        ))}
        <div className="flex items-center gap-2 text-[14px] font-semibold text-white mb-1.5"><Zap size={13} color={ACCENT} />Parameters</div>
        {[["Max Charge", "Maximum power rate (W) for charging the battery during off-peak hours."],
          ["Max Discharge", "Maximum power rate (W) for discharging the battery during peak hours."],
          ["Min SOC", "Minimum battery level, prevents full discharge to protect battery longevity."],
          ["Max SOC", "Maximum battery level to charge to, extends battery lifespan over time."]].map(([t, b]) => (
          <div key={t} className="ml-1 mb-2">
            <span className="text-[12px] font-semibold text-white">• {t}</span>
            <p className="text-[11px] ml-3 leading-snug" style={{ color: SUB }}>{b}</p>
          </div>
        ))}
      </Sheet>
    </div>
  );
};

/* ═════════ DEVICE SETTINGS (PRD §4.3) ═════════ */
const DeviceSettingsPage = ({ onBack, device, update, removeDevice, showToast, openSchedule, schedule }) => {
  const [page, setPage] = useState("main");
  const [nameDraft, setNameDraft] = useState(device.name);
  const [iconPick, setIconPick] = useState(null);
  const [batPick, setBatPick] = useState(null);
  const [sleepDraft, setSleepDraft] = useState(null);
  const [delOpen, setDelOpen] = useState(false);

  if (page === "name") return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <div className="flex items-center px-4 pt-3" style={{ minHeight: 56 }}>
        <div className="w-20"><IconBtn icon={ChevronLeft} onClick={() => { setNameDraft(device.name); setPage("main"); }} /></div>
        <div className="flex-1 text-center text-[16px] font-semibold text-white">Device Name</div>
        <div className="w-20 text-right">
          <button disabled={nameDraft.trim() === device.name || !nameDraft.trim()}
            onClick={() => { update({ name: nameDraft.trim() }); showToast("Device name updated"); setPage("main"); }}
            className="text-[14px] font-medium"
            style={{ color: nameDraft.trim() !== device.name && nameDraft.trim() ? ACCENT : "#3F6B65" }}>Save</button>
        </div>
      </div>
      <div className="px-5">
        <div className="rounded-xl px-4 py-3.5 flex items-center" style={{ background: CARD }}>
          <input value={nameDraft} autoFocus onChange={(e) => setNameDraft(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[15px] text-white" />
          {nameDraft && <button onClick={() => setNameDraft("")}><CircleX size={16} color={SUB} /></button>}
        </div>
      </div>
    </div>
  );

  if (page === "info") {
    const rows = [["Model", device.model], ["Serial Number", device.serial], ["Capacity", `${device.capacity / 1000} kWh`],
      ["Battery Type", "LFP"], ["Charging Power", "400W"], ["Output Power", "500W"], ["Voltage", "120V"], ["Frequency", "60Hz"],
      ["Battery Health", "96%"], ["Cycles", "288"], ["Temperature", "82.4°F"], ["Wi-Fi Status", device.connected ? "Connected" : "Disconnected"]];
    return (
      <div className="flex flex-col h-full" style={{ background: BG }}>
        <TopBar onBack={() => setPage("main")} title="Device Info" />
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="rounded-xl overflow-hidden">
            {rows.map(([k, v], i) => (
              <div key={k} className="flex items-center justify-between px-4 py-3.5"
                style={{ background: CARD, borderBottom: i < rows.length - 1 ? `1px solid ${BG}` : "none" }}>
                <span className="text-[14px] text-white">{k}</span><span className="text-[13px]" style={{ color: SUB }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (page === "sleep") {
    const sd = sleepDraft;
    const changed = JSON.stringify(sd) !== JSON.stringify(device.sleep);
    return (
      <div className="flex flex-col h-full" style={{ background: BG }}>
        <div className="flex items-center px-4 pt-3" style={{ minHeight: 56 }}>
          <div className="w-20"><IconBtn icon={ChevronLeft} onClick={() => setPage("main")} /></div>
          <div className="flex-1 text-center text-[16px] font-semibold text-white">Sleep Mode</div>
          <div className="w-20 text-right">
            <button disabled={!changed} onClick={() => { update({ sleep: sd }); showToast("Sleep Mode updated"); setPage("main"); }}
              className="text-[14px] font-medium" style={{ color: changed ? ACCENT : "#3F6B65" }}>Save</button>
          </div>
        </div>
        <div className="px-4">
          <div className="flex items-center justify-between rounded-xl px-4 py-3.5" style={{ background: CARD }}>
            <div><div className="text-[15px] font-medium text-white">Sleep Mode</div><div className="text-[11px] mt-0.5" style={{ color: SUB }}>Low power standby · 5W output</div></div>
            <Toggle on={sd.on} onChange={(v) => setSleepDraft({ ...sd, on: v })} />
          </div>
          {sd.on && (
            <>
              <div className="text-[13px] font-semibold text-white mt-5 mb-2">Time</div>
              {[["From", "from"], ["To", "to"]].map(([label, k]) => (
                <div key={k} className="flex items-center justify-between rounded-xl px-4 py-3 mb-2" style={{ background: CARD }}>
                  <span className="text-[14px] text-white">{label}</span>
                  <input type="time" value={sd[k]} onChange={(e) => setSleepDraft({ ...sd, [k]: e.target.value })}
                    className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold outline-none"
                    style={{ background: "#3A3A3C", color: k === "from" ? ACCENT : "#fff", colorScheme: "dark", border: "none" }} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  // main
  const I = ICONS[device.icon] || Zap;
  return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <TopBar onBack={onBack} title="Device Settings" />
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="rounded-xl overflow-hidden mb-2">
          <Row first title="Device Name" value={device.name} onClick={() => { setNameDraft(device.name); setPage("name"); }} />
          <Row title="Display Icon" right={<span className="flex items-center gap-1.5"><I size={16} color="#fff" /><ChevronRight size={17} color={SUB} /></span>} onClick={() => setIconPick(device.icon)} />
          <Row last title="Device Info" onClick={() => setPage("info")} />
        </div>
        <div className="rounded-xl overflow-hidden mb-2">
          <Row first title="Sleep Mode" value={device.sleep.on ? "On" : "Off"} onClick={() => { setSleepDraft({ ...device.sleep }); setPage("sleep"); }} />
          <Row title="Battery Priority" value={device.batteryMode === "backup" ? "Backup Mode" : "Saving Mode"} onClick={() => setBatPick(device.batteryMode)} />
          <Row last title="Smart Schedule" value={schedule.on ? "On" : "Off"} onClick={openSchedule} />
        </div>
        <button onClick={() => setDelOpen(true)} className="w-full rounded-xl py-3.5 text-[14px] font-medium" style={{ background: CARD, color: RED }}>Delete Device</button>
      </div>

      <Sheet open={iconPick !== null} onClose={() => setIconPick(null)} title="Select Display Icon">
        <div className="grid grid-cols-4 gap-3 mb-5">
          {ICON_KEYS.map((k) => {
            const Ik = ICONS[k], sel = iconPick === k;
            return (
              <button key={k} onClick={() => setIconPick(k)} className="rounded-2xl flex items-center justify-center" style={{ height: 58, background: sel ? ACCENT : "#2C2C2E" }}>
                <Ik size={20} color={sel ? "#062B26" : "#fff"} />
              </button>
            );
          })}
        </div>
        <PrimaryBtn disabled={iconPick === device.icon}
          onClick={() => { update({ icon: iconPick }); setIconPick(null); showToast("Display icon updated"); }}>Save</PrimaryBtn>
      </Sheet>

      <Sheet open={batPick !== null} onClose={() => setBatPick(null)} title="Select Battery Priority">
        {[["backup", "Backup", "Reserve 100% for backup"], ["saving", "Savings", "Reserve 60% for backup"]].map(([k, t, sub]) => (
          <button key={k} onClick={() => setBatPick(k)} className="w-full rounded-xl py-3 mb-2.5 text-center"
            style={{ background: batPick === k ? "#0E3B33" : "#2C2C2E", border: batPick === k ? `1px solid ${ACCENT}` : "1px solid transparent" }}>
            <div className="text-[14px] font-semibold" style={{ color: batPick === k ? ACCENT : "#8E8E93" }}>{t}</div>
            <div className="text-[11px] mt-0.5" style={{ color: SUB }}>{sub}</div>
          </button>
        ))}
        <PrimaryBtn disabled={batPick === device.batteryMode}
          onClick={() => { update({ batteryMode: batPick }); setBatPick(null); showToast("Battery Priority updated"); }}>Save</PrimaryBtn>
      </Sheet>

      <Dialog open={delOpen} title={`Delete ${device.name}?`}
        body="This device will be removed from your account. You can add it again at any time."
        confirm="Delete" danger onCancel={() => setDelOpen(false)}
        onConfirm={() => { setDelOpen(false); removeDevice(); }} />
    </div>
  );
};

/* ═════════ INSIGHTS (PRD §4.4) ═════════ */
const seedRand = (n) => { const x = Math.sin(n * 9973) * 10000; return x - Math.floor(x); };
const InsightsPage = ({ devices, openShare }) => {
  const [period, setPeriod] = useState("Day");
  const [offset, setOffset] = useState(0); // 0 = current
  const [range, setRange] = useState({ start: "2026-03-13", end: "2026-06-13" }); // default: 3 months back (PRD §4.4.2)
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeDraft, setRangeDraft] = useState(range);
  const [rangeErr, setRangeErr] = useState("");
  const empty = devices.length === 0;
  const now = new Date("2026-06-13T16:00:00");
  const MS = 86400000;
  const fmtD = (dt) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  let title = "", co2 = 0;
  if (period === "Day") { const dt = new Date(now.getTime() + offset * MS); title = fmtD(dt); co2 = 5 + seedRand(offset + 1) * 3; }
  else if (period === "Week") {
    const start = new Date(now.getTime() + offset * 7 * MS - now.getDay() * MS);
    const end = new Date(start.getTime() + 6 * MS);
    title = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.getMonth() === start.getMonth() ? end.getDate() : end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${end.getFullYear()}`;
    co2 = 12 + seedRand(offset + 2) * 6;
  } else if (period === "Month") {
    const dt = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    title = dt.toLocaleDateString("en-US", { month: "long", year: "numeric" }); co2 = 28 + seedRand(offset + 3) * 10;
  } else {
    title = `${fmtD(new Date(range.start + "T00:00"))} – ${fmtD(new Date(range.end + "T00:00"))}`;
    co2 = 96 + seedRand(4) * 12;
  }

  const n = period === "Day" ? 24 : period === "Week" ? 7 : 30;
  const input = Array.from({ length: n }, (_, i) => 30 + seedRand(i + offset * 31 + (period === "Day" ? 0 : 100)) * 60);
  const output = Array.from({ length: n }, (_, i) => 25 + seedRand(i * 3 + offset * 17 + 7) * 70);
  const W = 320, H = 120;
  const ip = toPts(input, W, H, 6, 110), op = toPts(output, W, H, 6, 110);
  const opArea = `${smoothPath(op)} L ${op[op.length - 1][0]} ${H} L ${op[0][0]} ${H} Z`;
  const xlabels = period === "Day" ? ["12am", "4am", "8am", "12pm", "4pm", "8pm", "12am"]
    : period === "Week" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : period === "Month" ? ["Jun 1", "Jun 8", "Jun 15", "Jun 22", "Jun 29"] : ["March", "April", "May"];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <h1 className="text-[26px] font-bold text-white">Insights</h1>
        <IconBtn icon={Share2} onClick={openShare} dim={empty} />
      </div>
      {empty ? (
        <div className="flex-1 flex flex-col items-center pt-20">
          <div className="rounded-2xl" style={{ width: 120, height: 150, background: "#3A3A3C" }} />
          <div className="text-[16px] font-semibold text-white mt-6">No data available</div>
          <p className="text-[12px] text-center mt-1 mb-5" style={{ color: SUB, maxWidth: 240 }}>Connect a Sierro device to start tracking battery performance and power usage.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-32">
          <div className="flex flex-col items-center my-3">
            <div className="flex items-baseline gap-1.5">
              <Zap size={18} color={ACCENT} fill={ACCENT} />
              <span className="text-[34px] font-bold text-white">128</span>
              <span className="text-[13px]" style={{ color: SUB }}>Days</span>
            </div>
            <span className="text-[11px]" style={{ color: SUB }}>Reliable backup power since Jan 2026</span>
          </div>
          <div className="flex rounded-full p-1 mb-3" style={{ background: "#1E1E1E" }}>
            {["Day", "Week", "Month", "Range"].map((p) => (
              <button key={p} onClick={() => { setPeriod(p); setOffset(0); }}
                className="flex-1 rounded-full py-1.5 text-[12px] font-medium transition"
                style={{ background: period === p ? "#fff" : "transparent", color: period === p ? "#111" : SUB }}>{p}</button>
            ))}
          </div>
          <div className="flex items-center justify-between px-1 mb-3">
            {period !== "Range" ? <IconBtn icon={ChevronLeft} size={32} onClick={() => setOffset(offset - 1)} /> : <span style={{ width: 32 }} />}
            {period === "Range" ? (
              <button onClick={() => { setRangeDraft(range); setRangeErr(""); setRangeOpen(true); }}
                className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold text-white">{title}</span>
                <ChevronDown size={14} color={ACCENT} />
              </button>
            ) : (
              <span className="text-[14px] font-semibold text-white">{title}</span>
            )}
            {offset < 0 && period !== "Range" ? <IconBtn icon={ChevronRight} size={32} onClick={() => setOffset(offset + 1)} /> : <span style={{ width: 32 }} />}
          </div>
          <div className="rounded-2xl px-4 py-3.5 mb-3 flex items-center justify-between" style={{ background: CARD2 }}>
            <div>
              <span className="text-[26px] font-bold text-white">{co2.toFixed(1)}</span>
              <span className="text-[12px] ml-1" style={{ color: SUB }}>Kg</span>
              <div className="text-[10px]" style={{ color: SUB }}>Equal to planting {Math.round(co2 / 0.4)} trees</div>
            </div>
            <span className="text-[12px]" style={{ color: SUB }}>CO₂ Reduced</span>
          </div>
          <div className="rounded-2xl p-4" style={{ background: CARD2 }}>
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-[13px] font-semibold text-white">Input vs. Output</div>
                <div className="text-[10px]" style={{ color: SUB }}>{period === "Week" ? "Highest usage recorded on Wednesday" : "Output peaked at 2pm"}</div>
              </div>
              <div className="flex gap-2.5 text-[10px]" style={{ color: SUB }}>
                <span className="flex items-center gap-1"><span className="rounded-full" style={{ width: 6, height: 6, background: ACCENT }} />Input</span>
                <span className="flex items-center gap-1"><span className="rounded-full" style={{ width: 6, height: 6, background: ORANGE }} />Output</span>
              </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 130 }}>
              <defs>
                <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ORANGE} stopOpacity="0.5" /><stop offset="100%" stopColor="#3D2200" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#2A2A2A" strokeWidth="1" />)}
              {period === "Week" ? (
                input.map((v, i) => {
                  const bw = 12, gap = (W - 7 * (bw * 2 + 4)) / 8, x = gap + i * (bw * 2 + 4 + gap);
                  return (
                    <g key={i}>
                      <rect x={x} y={H - (v / 110) * H} width={bw} height={(v / 110) * H} rx="3" fill={ACCENT} />
                      <rect x={x + bw + 4} y={H - (output[i] / 110) * H} width={bw} height={(output[i] / 110) * H} rx="3" fill={ORANGE} />
                    </g>
                  );
                })
              ) : (
                <>
                  <path d={opArea} fill="url(#og)" />
                  <path d={smoothPath(op)} fill="none" stroke={ORANGE} strokeWidth="1.8" />
                  <path d={smoothPath(ip)} fill="none" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="4 3" />
                </>
              )}
            </svg>
            <div className="flex justify-between text-[9px] px-1 mt-1.5" style={{ color: SUB }}>
              {xlabels.map((t) => <span key={t}>{t}</span>)}
            </div>
          </div>
        </div>
      )}
      {/* Range picker (PRD §4.4.2: default 3 months back, max 3-month span) */}
      <Sheet open={rangeOpen} onClose={() => setRangeOpen(false)} title="Select Date Range">
        {[["Start", "start"], ["End", "end"]].map(([label, k]) => (
          <div key={k} className="flex items-center justify-between rounded-xl px-4 py-3 mb-2" style={{ background: "#2C2C2E" }}>
            <span className="text-[14px] text-white">{label}</span>
            <input type="date" value={rangeDraft[k]} min="2026-01-01" max="2026-06-13"
              onChange={(e) => { setRangeDraft({ ...rangeDraft, [k]: e.target.value }); setRangeErr(""); }}
              className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold outline-none"
              style={{ background: "#3A3A3C", color: "#fff", colorScheme: "dark", border: "none" }} />
          </div>
        ))}
        {rangeErr && <p className="text-[11px] mb-2" style={{ color: RED }}>{rangeErr}</p>}
        <PrimaryBtn onClick={() => {
          const a = new Date(rangeDraft.start), b = new Date(rangeDraft.end);
          if (!(a <= b)) { setRangeErr("Start date must be before end date."); return; }
          if ((b - a) / MS > 92) { setRangeErr("Date range can't exceed 3 months."); return; }
          setRange(rangeDraft); setRangeOpen(false);
        }}>Apply</PrimaryBtn>
      </Sheet>
    </div>
  );
};

/* ═════════ SETTING TAB (PRD §4.5) ═════════ */
const Avatar = ({ user, size = 44, editable, onEdit }) => {
  const ring = user.founder ? GOLD : ACCENT;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="rounded-full flex items-center justify-center overflow-hidden w-full h-full"
        style={{ border: `2px solid ${ring}`, background: "#1A1A1A" }}>
        {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" />
          : user.founder ? <Gem size={size * 0.42} color={GOLD} /> : <Zap size={size * 0.42} color={ACCENT} fill={ACCENT} />}
      </div>
      {editable && (
        <button onClick={onEdit} className="absolute rounded-full flex items-center justify-center"
          style={{ width: 22, height: 22, bottom: -2, right: -2, background: "#3A3A3C", border: "2px solid #141414" }}>
          <Pencil size={10} color="#fff" />
        </button>
      )}
    </div>
  );
};

const FounderTag = ({ n }) => (
  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,215,0,.15)", color: GOLD, border: "1px solid rgba(255,215,0,.4)" }}>
    🏅 Founding Member #{n}
  </span>
);

const NotifSettingPage = ({ kind, onBack, cfg, save }) => {
  const [draft, setDraft] = useState({ ...cfg });
  const changed = JSON.stringify(draft) !== JSON.stringify(cfg);
  const meta = {
    outage: ["Power Outage", "Get alerted during outages"],
    low: ["Low Battery", draft.on ? `Get alerted when battery falls below ${draft.threshold}%` : "Get notified when battery gets low"],
    solar: ["Solar Status", "Get alerted when solar connects or disconnects"],
  }[kind];
  return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <div className="flex items-center px-4 pt-3" style={{ minHeight: 56 }}>
        <div className="w-20"><IconBtn icon={ChevronLeft} onClick={onBack} /></div>
        <div className="flex-1 text-center text-[16px] font-semibold text-white">{meta[0]}</div>
        <div className="w-20 text-right">
          <button disabled={!changed} onClick={() => save(draft)} className="text-[14px] font-medium" style={{ color: changed ? ACCENT : "#3F6B65" }}>Save</button>
        </div>
      </div>
      <div className="px-4">
        <div className="flex items-center justify-between rounded-xl px-4 py-3.5" style={{ background: CARD }}>
          <div><div className="text-[15px] font-medium text-white">{meta[0]}</div><div className="text-[11px] mt-0.5" style={{ color: SUB }}>{meta[1]}</div></div>
          <Toggle on={draft.on} onChange={(v) => setDraft({ ...draft, on: v })} />
        </div>
        {kind === "low" && draft.on && (
          <>
            <div className="text-[13px] font-semibold text-white mt-5 mb-2">Battery Threshold</div>
            <div className="rounded-xl overflow-hidden">
              {[30, 20, 10].map((t, i) => (
                <button key={t} onClick={() => setDraft({ ...draft, threshold: t })}
                  className="w-full flex items-center justify-between px-4 py-3.5"
                  style={{ background: CARD, borderBottom: i < 2 ? `1px solid ${BG}` : "none" }}>
                  <span className="text-[14px] text-white">{t}%</span>
                  {draft.threshold === t && <Check size={17} color={ACCENT} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const SettingPage = ({ user, notifCfg, openSub, openProfile, openFeedback, onExport }) => (
  <div className="flex flex-col h-full">
    <div className="flex-1 overflow-y-auto px-4 pt-5 pb-32">
      <button onClick={openProfile} className="w-full flex items-center gap-3 mb-6 text-left">
        <Avatar user={user} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-semibold text-white truncate">{user.name}</span>
            {user.founder && <FounderTag n={user.founder} />}
          </div>
          <span className="text-[12px] flex items-center gap-0.5" style={{ color: SUB }}>Manage my account <ChevronRight size={12} /></span>
        </div>
      </button>
      <div className="text-[13px] font-semibold text-white mb-2">Push Notifications</div>
      <div className="rounded-xl overflow-hidden mb-6">
        {[["outage", PowerOff, "Power Outage", "Get alerted during outages"],
          ["low", BatteryLow, "Low Battery", notifCfg.low.on ? `Get alerted when battery falls below ${notifCfg.low.threshold}%` : "Get notified when battery gets low"],
          ["solar", SunMedium, "Solar Status", "Get alerted when solar connects or disconnects"]].map(([k, I, t, s], i, arr) => (
          <button key={k} onClick={() => openSub(k)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            style={{ background: CARD, borderBottom: i < arr.length - 1 ? `1px solid ${BG}` : "none" }}>
            <span className="rounded-full flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#1A1A1A" }}><I size={14} color="#fff" /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-white">{t}</div>
              <div className="text-[11px] mt-0.5 truncate" style={{ color: SUB }}>{s}</div>
            </div>
            <span className="text-[12px]" style={{ color: SUB }}>{notifCfg[k].on ? "On" : "Off"}</span>
            <ChevronRight size={15} color={SUB} />
          </button>
        ))}
      </div>
      <div className="text-[13px] font-semibold text-white mb-2">Support</div>
      <div className="rounded-xl overflow-hidden mb-7">
        <button onClick={openFeedback} className="w-full flex items-center gap-3 px-4 py-3.5 text-left" style={{ background: CARD, borderBottom: `1px solid ${BG}` }}>
          <span className="rounded-full flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#1A1A1A" }}><MessageSquareText size={14} color="#fff" /></span>
          <div><div className="text-[14px] font-medium text-white">Feedback</div><div className="text-[11px] mt-0.5" style={{ color: SUB }}>Send feedback to the Sierro team</div></div>
        </button>
        <button onClick={onExport} className="w-full flex items-center gap-3 px-4 py-3.5 text-left" style={{ background: CARD }}>
          <span className="rounded-full flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#1A1A1A" }}><Share2 size={14} color="#fff" /></span>
          <div><div className="text-[14px] font-medium text-white">Export Data</div><div className="text-[11px] mt-0.5" style={{ color: SUB }}>Download your devices and history as JSON</div></div>
        </button>
      </div>
      <div className="text-center text-[11px]" style={{ color: ACCENT }}>
        <span>Privacy Policy</span><span className="mx-2" style={{ color: "#48484A" }}>|</span><span>Terms of Use</span>
      </div>
      <div className="text-center text-[10px] mt-1.5" style={{ color: "#5A5A5E" }}>Sierro App v3.10.0 ©2026 Sierro Inc.</div>
    </div>
  </div>
);

/* ═════════ PROFILE (PRD §4.6) ═════════ */
const ProfilePage = ({ onBack, user, setUser, showToast, signOut }) => {
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(null); // signout | delete
  const [page, setPage] = useState("main");
  const [nameDraft, setNameDraft] = useState(user.name);
  const [emailDraft, setEmailDraft] = useState(user.email);
  const [emailErr, setEmailErr] = useState(false);
  const [otp, setOtp] = useState("");
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState(false);
  const [google, setGoogle] = useState(false);
  const [apple, setApple] = useState(true);
  const fileRef = useRef(null);

  const SubEdit = ({ title, value, setValue, err, errMsg, btn, onSubmit, type }) => (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <TopBar onBack={() => setPage("main")} title={title} />
      <div className="px-5 flex-1">
        <div className="rounded-xl px-4 py-3.5 flex items-center" style={{ background: CARD, border: err ? `1px solid ${RED}` : "1px solid transparent" }}>
          <input value={value} autoFocus type={type || "text"} onChange={(e) => setValue(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[15px] text-white" />
          {value && <button onClick={() => setValue("")}><CircleX size={16} color={SUB} /></button>}
        </div>
        {err && <p className="text-[11px] mt-1.5" style={{ color: RED }}>{errMsg}</p>}
      </div>
      <div className="px-5 pb-8"><PrimaryBtn disabled={!value.trim()} onClick={onSubmit}>{btn}</PrimaryBtn></div>
    </div>
  );

  if (page === "name") return <SubEdit title="Name" value={nameDraft} setValue={setNameDraft} btn="Save"
    onSubmit={() => { setUser({ ...user, name: nameDraft.trim() }); showToast("Name updated"); setPage("main"); }} />;

  if (page === "email") return <SubEdit title="Linked Email" value={emailDraft} setValue={(v) => { setEmailDraft(v); setEmailErr(false); }}
    err={emailErr} errMsg="Please enter a valid email address." btn="Verify New Email" type="email"
    onSubmit={() => /.+@.+\..+/.test(emailDraft) ? setPage("otp") : setEmailErr(true)} />;

  if (page === "otp") return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <TopBar onBack={() => setPage("email")} />
      <div className="px-5 flex-1">
        <h1 className="text-[22px] font-bold text-white text-center">Enter verification code</h1>
        <p className="text-[13px] text-center mt-1 mb-6" style={{ color: SUB }}>We sent a 6-digit verification code to<br /><b className="text-white">{emailDraft}</b></p>
        <div className="relative">
          <div className="flex gap-2 justify-center">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-center rounded-lg text-lg font-semibold text-white"
                style={{ width: 46, height: 52, background: CARD, border: `1px solid ${i === otp.length ? ACCENT : LINE}` }}>{otp[i] || ""}</div>
            ))}
          </div>
          <input autoFocus value={otp} inputMode="numeric" maxLength={6} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="absolute inset-0 opacity-0 w-full" />
        </div>
      </div>
      <div className="px-5 pb-8">
        <PrimaryBtn disabled={otp.length < 6} onClick={() => { setUser({ ...user, email: emailDraft }); showToast("Email updated"); setOtp(""); setPage("main"); }}>Verify New Email</PrimaryBtn>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: BG }}>
      <div className="flex items-center px-4 pt-3" style={{ minHeight: 56 }}>
        <div className="w-20"><IconBtn icon={ChevronLeft} onClick={onBack} /></div>
        <div className="flex-1 text-center text-[16px] font-semibold text-white">Profile</div>
        <div className="w-20 flex justify-end relative">
          <IconBtn icon={MoreHorizontal} onClick={() => setMenu(!menu)} />
          {menu && (
            <div className="absolute top-11 right-0 z-40 rounded-xl overflow-hidden w-44" style={{ background: "#3A3A3C", boxShadow: "0 10px 30px rgba(0,0,0,.5)" }}>
              <button onClick={() => { setMenu(false); setDialog("signout"); }} className="w-full text-left px-4 py-3 text-[13px] text-white" style={{ borderBottom: "1px solid #48484A" }}>Sign out</button>
              <button onClick={() => { setMenu(false); setDialog("delete"); }} className="w-full text-left px-4 py-3 text-[13px]" style={{ color: RED }}>Delete Account</button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-10" onClick={() => menu && setMenu(false)}>
        <div className="flex flex-col items-center mt-3 mb-6">
          <Avatar user={user} size={76} editable onEdit={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const r = new FileReader();
            r.onload = () => { setUser({ ...user, avatar: r.result }); showToast("Profile photo updated"); };
            r.readAsDataURL(f);
          }} />
          {user.founder && <div className="mt-2.5"><FounderTag n={user.founder} /></div>}
        </div>
        <div className="text-[13px] font-semibold text-white mb-2">Personal Info</div>
        <div className="rounded-xl overflow-hidden mb-6">
          <Row first title="Name" value={user.name} onClick={() => { setNameDraft(user.name); setPage("name"); }}
            right={<span className="flex items-center gap-1.5"><span className="text-sm truncate max-w-[120px]" style={{ color: SUB }}>{user.name}</span><ChevronRight size={16} color={SUB} /></span>} />
          <Row last title="Linked Email" onClick={() => { setEmailDraft(user.email); setPage("email"); }}
            right={<span className="flex items-center gap-1.5"><span className="text-sm truncate max-w-[140px]" style={{ color: SUB }}>{user.email}</span><ChevronRight size={16} color={SUB} /></span>} />
        </div>
        <div className="text-[13px] font-semibold text-white mb-2">Link Accounts</div>
        <div className="rounded-xl overflow-hidden mb-5">
          {[["Google", google, setGoogle], ["Apple", apple, setApple]].map(([t, linked, set], i) => (
            <div key={t} className="flex items-center justify-between px-4 py-3.5" style={{ background: CARD, borderBottom: i === 0 ? `1px solid ${BG}` : "none" }}>
              <span className="text-[14px] font-medium text-white">{t}</span>
              <button onClick={() => { set(!linked); showToast(linked ? `${t} account unlinked` : `${t} account is now linked.`); }}
                className="text-[11px] font-semibold px-3.5 py-1.5 rounded-full"
                style={linked ? { border: `1px solid ${ACCENT}`, color: ACCENT } : { background: ACCENT, color: "#062B26" }}>
                {linked ? "Unlink" : "Link"}
              </button>
            </div>
          ))}
        </div>
        {!user.founder && (
          <p className="text-center text-[12px]" style={{ color: SUB }}>
            Have a founder code? <button className="font-medium" style={{ color: ACCENT }} onClick={() => { setCode(""); setCodeErr(false); setRedeemOpen(true); }}>Redeem founder badge</button>
          </p>
        )}
      </div>

      <Dialog open={dialog === "signout"} title="Sign out?" body="You'll need to sign in again to access your account."
        confirm="Sign Out" onCancel={() => setDialog(null)} onConfirm={async () => { setDialog(null); await apiLogout(); signOut(); }} />
      <Dialog open={dialog === "delete"} title="Delete account?" body="This will permanently delete your account and saved data. This action can't be undone."
        confirm="Delete" danger onCancel={() => setDialog(null)} onConfirm={async () => { setDialog(null); await apiLogout(); signOut(); }} />

      <Sheet open={redeemOpen} onClose={() => setRedeemOpen(false)} title="Redeem Founder Badge">
        <div className="rounded-xl px-4 py-3" style={{ background: "#2C2C2E", border: codeErr ? `1px solid ${RED}` : "1px solid transparent" }}>
          <div className="text-[10px]" style={{ color: SUB }}>Activation Code</div>
          <input value={code} autoFocus placeholder="e.g. FOUNDER2024" onChange={(e) => { setCode(e.target.value); setCodeErr(false); }}
            className="w-full bg-transparent outline-none text-[14px] text-white mt-0.5 placeholder:text-neutral-600" />
        </div>
        {codeErr && <p className="text-[11px] mt-1.5" style={{ color: RED }}>Invalid activation code. Please try again.</p>}
        <div className="mt-4">
          <PrimaryBtn disabled={!code.trim()} onClick={() => {
            if (/^founder/i.test(code.trim())) { setUser({ ...user, founder: 42 }); setRedeemOpen(false); showToast("Founder badge activated"); }
            else setCodeErr(true);
          }}>Activate Badge</PrimaryBtn>
        </div>
      </Sheet>
    </div>
  );
};

/* ═════════ ROOT APP ═════════ */
const seedDevices = [
  { id: "d1", name: "Fridge", icon: "fridge", model: "Sierro 2000", serial: "SR-2024-08842", capacity: 2000, level: 14, charging: true, connected: true, on: true, ac: 100, solar: 30, output: 420, sleep: { on: false, from: "22:00", to: "09:00" }, batteryMode: "backup", source: "ble" },
  { id: "d2", name: "NAS", icon: "nas", model: "Sierro 1000", serial: "SR-2024-11203", capacity: 1000, level: 100, charging: false, connected: true, on: false, ac: 0, solar: 0, output: 65, sleep: { on: false, from: "23:00", to: "07:00" }, batteryMode: "backup", source: "demo" },
  { id: "d3", name: "A Very Very Very Very Very Very Very Very Very Very Long Nameeee...", icon: "cpap", model: "Sierro 1000", serial: "SR-2024-00917", capacity: 1000, level: 45, charging: false, connected: false, on: false, ac: 0, solar: 0, output: 0, sleep: { on: false, from: "22:00", to: "08:00" }, batteryMode: "backup", source: "ble" },
];
const seedNotifs = [
  { id: 1, kind: "low", title: "Low Battery", body: "Fish Tank • Battery below 30%, estimated remaining time: 1h 24m", time: "2 mins ago", read: false },
  { id: 2, kind: "solarOn", title: "Solar Connected", body: "Fridge • Solar input detected, charging started.", time: "Today 3:42 PM", read: true },
  { id: 3, kind: "solarOff", title: "Solar Disconnected", body: "CPAP • Solar input lost, charging stopped.", time: "May 3", read: true },
  { id: 4, kind: "outage", title: "Power Outage Detected", body: "NAS • Switched to backup power automatically. Estimated runtime: 10h.", time: "April 5", read: true },
];

export default function SierroEnergyApp() {
  const [user, setUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false); // 防止登录闪烁
  const [tab, setTab] = useState("device");
  const [view, setView] = useState(null);
  const [devices, setDevices] = useState(seedDevices);
  const [selected, setSelected] = useState("d1");
  const [notifications, setNotifications] = useState(seedNotifs);
  const [banner, setBanner] = useState({ title: "Low Battery", body: "Fish Tank • Battery below 30%, estimated remaining time: 1h 24m" });
  const [toast, setToast] = useState(null);
  const [notifSheet, setNotifSheet] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [notifCfg, setNotifCfg] = useState({ outage: { on: true }, low: { on: true, threshold: 30 }, solar: { on: true } });
  const [schedules, setSchedules] = useState({});
  const [history, setHistory] = useState({});
  const toastTimer = useRef(null);

  const showToast = useCallback((msg, type = "positive") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── App 启动：尝试从 sessionStorage 恢复已登录会话 ── */
  useEffect(() => {
    (async () => {
      if (tokenStore.isLoggedIn()) {
        try {
          const info = await apiFetchUserInfo();
          if (_isOk(info) && info.data) {
            setUser({
              name:    info.data.nickname || info.data.account || 'User',
              email:   info.data.email    || info.data.account || '',
              founder: null,
              avatar:  info.data.avatarUrl || null,
              apiData: info.data,
            });
          } else {
            tokenStore.clear(); // token 已过期
          }
        } catch { tokenStore.clear(); }
      }
      setSessionChecked(true);
    })();
  }, []);

  /* Real-time simulator — 1s refresh (PRD §10.1) */
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      setDevices((ds) => ds.map((d) => {
        if (!d.connected || !d.on) return d;
        const solar = clamp(Math.round(d.solar + (Math.random() - 0.5) * 12), 0, 120);
        const ac = d.charging ? 100 : 0;
        const output = clamp(Math.round(d.output + (Math.random() - 0.5) * 40), 40, 900);
        let level = d.level + (d.charging ? 0.04 : -0.015);
        let charging = d.charging;
        if (level >= 100) { level = 100; charging = false; }
        if (level <= 10) { charging = true; }
        return { ...d, solar, ac, output, level: Math.round(level * 10) / 10 };
      }));
      setHistory((h) => {
        const next = { ...h };
        devices.forEach((d) => {
          if (!d.connected) return;
          const cur = next[d.id] || { battery: [], ac: [], solar: [], output: [] };
          const push = (arr, v) => [...arr.slice(-39), v];
          next[d.id] = {
            battery: push(cur.battery, d.level),
            ac: push(cur.ac, d.ac + Math.random() * 6),
            solar: push(cur.solar, d.solar + Math.random() * 4),
            output: push(cur.output, d.output),
          };
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [user, devices]);

  /* 登录中或会话恢复中：显示启动屏 */
  if (!sessionChecked) return (
    <div className="w-full flex justify-center" style={{ background: "#000", minHeight: "100vh" }}>
      <div className="relative w-full max-w-md flex flex-col items-center justify-center overflow-hidden" style={{ background: BG, height: "100vh", maxHeight: 880 }}>
        <Zap size={40} color={ACCENT} fill={ACCENT} className="animate-pulse" />
        <div className="text-[13px] mt-4" style={{ color: SUB }}>Loading…</div>
      </div>
    </div>
  );

  if (!user) return (
    <div className="w-full flex justify-center" style={{ background: "#000", minHeight: "100vh" }}>
      <div className="relative w-full max-w-md flex flex-col overflow-hidden" style={{ background: BG, height: "100vh", maxHeight: 880 }}>
        <AuthFlow onDone={(name, email, skipped, token, apiData) => {
          setUser({ name, email: email || '', founder: null, avatar: null, apiData });
          if (!skipped) setView({ name: "add", firstTime: true });
        }} />
      </div>
    </div>
  );

  const dev = devices.find((d) => d.id === selected) || devices[0];
  const unread = notifications.some((n) => !n.read);
  const getSchedule = (id) => schedules[id] || { on: false, configured: false, peak: { start: 10, end: 24 % 24 }, offPeak: { start: 1, end: 9 }, peakPrice: "", offPrice: "", params: { maxCharge: 400, maxDischarge: 500, minSoc: 0, maxSoc: 100 } };

  const overlay = () => {
    if (!view) return null;
    if (view.name === "add") return (
      <AddDeviceFlow firstTime={view.firstTime} existingNames={devices.map((d) => d.name)}
        onClose={() => setView(null)}
        onAdded={(nd) => {
          const id = "d" + Date.now();
          setDevices((ds) => [{ id, ...nd, capacity: nd.model.includes("2000") ? 2000 : 1000, level: 82, charging: false, connected: true, on: true, ac: 0, solar: 20, output: 120, sleep: { on: false, from: "22:00", to: "08:00" }, batteryMode: "backup" }, ...ds]);
          setView(null); setTab("device");
          showToast("Device added successfully");
          setTimeout(() => setNotifSheet(true), 1200);
        }} />
    );
    if (view.name === "notifs") return (
      <NotificationsPage onBack={() => setView(view.from === "overview" ? { name: "overview" } : null)}
        notifications={view.from === "overview" ? notifications.filter((n) => n.body.startsWith(dev.name.split(" ")[0])) : notifications}
        markRead={() => { setNotifications((ns) => ns.map((n) => ({ ...n, read: true }))); setBanner(null); }}
        remove={(id) => setNotifications((ns) => ns.filter((n) => n.id !== id))} />
    );
    if (view.name === "overview") return (
      <OverviewPage device={dev} devices={devices} switchDevice={setSelected}
        onBack={() => setView(null)} history={history} unread={unread}
        openSettings={() => setView({ name: "devSettings" })}
        openNotifs={() => setView({ name: "notifs", from: "overview" })} />
    );
    if (view.name === "devSettings") return (
      <DeviceSettingsPage device={dev} schedule={getSchedule(dev.id)}
        onBack={() => setView({ name: "overview" })}
        update={(patch) => setDevices((ds) => ds.map((d) => (d.id === dev.id ? { ...d, ...patch } : d)))}
        removeDevice={() => { setDevices((ds) => ds.filter((d) => d.id !== dev.id)); setView(null); setTab("device"); showToast(`${dev.name} deleted`, "neutral"); }}
        showToast={showToast}
        openSchedule={() => setView({ name: "schedule" })} />
    );
    if (view.name === "schedule") return (
      <SmartSchedulePage device={dev} schedule={getSchedule(dev.id)}
        setSchedule={(s) => setSchedules((m) => ({ ...m, [dev.id]: s }))}
        onBack={() => setView({ name: "devSettings" })} showToast={showToast} />
    );
    if (view.name === "notifSub") return (
      <NotifSettingPage kind={view.kind} cfg={notifCfg[view.kind]}
        onBack={() => setView(null)}
        save={(d) => {
          setNotifCfg((c) => ({ ...c, [view.kind]: d })); setView(null);
          showToast({ outage: "Power outage alerts updated", low: "Low battery alerts updated", solar: "Solar alerts updated" }[view.kind]);
        }} />
    );
    if (view.name === "profile") return (
      <ProfilePage user={user} setUser={setUser} showToast={showToast}
        onBack={() => setView(null)}
        signOut={() => { setUser(null); setView(null); setTab("device"); }} />
    );
    return null;
  };
  const ov = overlay();

  return (
    <div className="w-full flex justify-center" style={{ background: "#000", minHeight: "100vh" }}>
      <div className="relative w-full max-w-md flex flex-col overflow-hidden" style={{ background: BG, height: "100vh", maxHeight: 880 }}>
        {ov || (
          <>
            {tab === "device" && (
              <DevicePage devices={devices} banner={banner} dismissBanner={() => setBanner(null)}
                toggleDevice={(id) => setDevices((ds) => ds.map((d) => (d.id === id ? { ...d, on: !d.on } : d)))}
                openOverview={(id) => { setSelected(id); setView({ name: "overview" }); }}
                openAdd={() => setView({ name: "add", firstTime: false })}
                notifications={notifications}
                openNotifs={() => setView({ name: "notifs" })} />
            )}
            {tab === "insights" && <InsightsPage devices={devices} openShare={() => devices.length && setShareOpen(true)} />}
            {tab === "setting" && (
              <SettingPage user={user} notifCfg={notifCfg}
                openSub={(k) => setView({ name: "notifSub", kind: k })}
                openProfile={() => setView({ name: "profile" })}
                openFeedback={() => { setFeedback(""); setFeedbackOpen(true); }}
                onExport={() => {
                  const payload = { exportedAt: new Date().toISOString(), user: { name: user.name, email: user.email }, devices, notifications, schedules };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "sierro-export.json"; a.click();
                  URL.revokeObjectURL(url);
                  showToast("Data exported");
                }} />
            )}
            <BottomNav tab={tab} setTab={setTab} />
          </>
        )}

        <Toast toast={toast} onClose={() => setToast(null)} />

        {/* Enable Notifications bottom sheet (after adding a device) */}
        <Sheet open={notifSheet} onClose={() => setNotifSheet(false)} title="">
          <div className="flex flex-col items-center text-center px-2">
            <div className="rounded-3xl px-5 py-6 mb-5 w-full" style={{ background: "#111", border: "1px solid #2A2A2A" }}>
              {[["Low battery alerts", ACCENT], ["Power outage alerts", ACCENT], ["Solar status updates", ACCENT]].map(([t], i) => (
                <div key={t} className="rounded-full px-3 py-1.5 text-[11px] font-medium text-white inline-block m-1" style={{ background: "#2C2C2E", border: "1px solid #3A3A3C" }}>
                  <span className="inline-block rounded-sm mr-1.5 align-middle" style={{ width: 10, height: 10, background: ACCENT }} />{t}
                </div>
              ))}
            </div>
            <div className="text-[17px] font-semibold text-white">Stay informed about your device</div>
            <div className="mt-3 mb-5 space-y-2 w-full">
              <div className="flex items-center gap-2 justify-center text-[12px]" style={{ color: SUB }}><CircleCheck size={14} color={ACCENT} /> Important device alerts</div>
              <div className="flex items-center gap-2 justify-center text-[12px]" style={{ color: SUB }}><CircleX size={14} color={RED} /> Ads and promotional messages</div>
            </div>
            <PrimaryBtn onClick={() => setNotifSheet(false)}>Enable Notifications</PrimaryBtn>
          </div>
        </Sheet>

        {/* Feedback sheet (PRD §4.5.4.2) */}
        <Sheet open={feedbackOpen} onClose={() => setFeedbackOpen(false)} title="Feedback">
          <div className="rounded-xl px-4 py-3 mb-2.5" style={{ background: "#2C2C2E" }}>
            <div className="text-[10px]" style={{ color: SUB }}>Your Contact Email</div>
            <input defaultValue={user.email} className="w-full bg-transparent outline-none text-[14px] text-white mt-0.5" />
          </div>
          <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "#2C2C2E" }}>
            <div className="text-[10px]" style={{ color: SUB }}>Your Feedback</div>
            <textarea value={feedback} autoFocus onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe your issue or suggestion..." rows={4}
              className="w-full bg-transparent outline-none text-[14px] text-white mt-0.5 resize-none placeholder:text-neutral-600"
              style={{ maxHeight: 210, overflowY: "auto" }} />
          </div>
          <PrimaryBtn disabled={!feedback.trim()} onClick={() => { setFeedbackOpen(false); showToast("Thanks for your feedback. We'll review and get back to you soon."); }}>Send Feedback</PrimaryBtn>
        </Sheet>

        {/* Share sheet (PRD §4.4.4 — Web Share API fallback) */}
        <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Share Insights">
          <div className="rounded-2xl p-5 mb-4" style={{ background: BG, border: "1px solid #2A2A2A" }}>
            <div className="flex items-baseline gap-1.5 justify-center">
              <Zap size={16} color={ACCENT} fill={ACCENT} />
              <span className="text-[28px] font-bold text-white">128</span>
              <span className="text-[12px]" style={{ color: SUB }}>Days</span>
            </div>
            <div className="text-center text-[10px]" style={{ color: SUB }}>Reliable backup power since Jan 2026</div>
            <div className="text-center mt-3"><span className="text-[20px] font-bold text-white">6.4</span><span className="text-[11px] ml-1" style={{ color: SUB }}>Kg CO₂ Reduced</span></div>
            <div className="text-center text-[11px] font-bold tracking-widest mt-4" style={{ color: "#5A5A5E" }}>SIERRO</div>
          </div>
          <PrimaryBtn onClick={() => {
            if (navigator.share) navigator.share({ title: "Sierro Insights", text: "128 days of reliable backup power · 6.4 kg CO₂ reduced" }).catch(() => {});
            setShareOpen(false);
          }}>Share</PrimaryBtn>
        </Sheet>
      </div>
    </div>
  );
}
