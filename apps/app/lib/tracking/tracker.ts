import { COOKIE_FIRST_TOUCH } from "@crm/db/attribution";
import type { TrackingConfig } from "@crm/db/tracking";
import {
	COOKIE_NAME,
	LINKER_MAX_AGE_SECONDS,
	MAX_BODY_BYTES,
	MAX_EVENTS_PER_BATCH,
} from "@crm/db/tracking";

export function trackerSource(
	config: TrackingConfig,
	endpoint: string,
): string {
	return `(function(){
var C=${JSON.stringify(config)},E=${JSON.stringify(endpoint)},N=${JSON.stringify(COOKIE_NAME)},FS=${JSON.stringify(COOKIE_FIRST_TOUCH)};
var B=${MAX_BODY_BYTES},M=${MAX_EVENTS_PER_BATCH};
var d=document,w=window,loc=w.location;
if(w.__crmT)return;w.__crmT=1;
function host(){return loc.hostname.toLowerCase()}
function known(h){
 for(var i=0;i<C.hosts.length;i++){var e=C.hosts[i];
  if(e.scope==="SITE_AND_SUBDOMAINS"){if(h===e.host||h.slice(-(e.host.length+1))==="."+e.host)return!0}
  else if(h===e.host)return!0}
 return!1}
function allowed(h){return!C.limitToDomains||known(h)}
if(!allowed(host()))return;
if(C.honourDnt&&(navigator.doNotTrack==="1"||w.doNotTrack==="1"||navigator.globalPrivacyControl))return;
if(navigator.webdriver||d.visibilityState==="prerender")return;
function decode(v){try{return decodeURIComponent(v)}catch(e){return null}}
function read(){var m=d.cookie.match(new RegExp("(?:^|; )"+N+"=([^;]*)"));return m?decode(m[1]):null}
function cookieDomain(){
 if(C.cookieSubdomains)return null;
 var h=host();
 for(var i=0;i<C.hosts.length;i++){var e=C.hosts[i];
  if(e.scope!=="SITE_AND_SUBDOMAINS")continue;
  if(h===e.host||h.slice(-(e.host.length+1))==="."+e.host)return "."+e.host}
 return null}
function write(v){
 var p=N+"="+encodeURIComponent(v)+"; path=/; samesite=lax";
 if(C.cookieDays>0)p+="; max-age="+C.cookieDays*86400;
 if(C.secureCookies&&loc.protocol==="https:")p+="; secure";
 var dom=cookieDomain();
 if(dom)p+="; domain="+dom;
 d.cookie=p}
function mint(){
 if(w.crypto&&w.crypto.randomUUID)return w.crypto.randomUUID().replace(/-/g,"");
 return Math.random().toString(36).slice(2)+Date.now().toString(36)}
var existing=read(),linked=null;
if(C.crossDomain){
 var m=loc.hash.match(/_crm=([A-Za-z0-9_-]{8,64})\\.(\\d{10})/);
 if(m){
  var age=Math.floor(Date.now()/1000)-parseInt(m[2],10);
  if(age>=0&&age<=${LINKER_MAX_AGE_SECONDS}&&!existing)linked=m[1];
  try{history.replaceState(null,"",loc.href.replace(/[#&]_crm=[A-Za-z0-9_.-]+/,""))}catch(e){}}}
var vid=linked||existing||mint();
write(vid);
function param(q,k){var m=q.match(new RegExp("[?&]"+k+"=([^&]*)"));if(!m)return undefined;var v=decode(m[1].replace(/\\+/g," "));return v?v.slice(0,120):undefined}
function touch(){
 var q=loc.search,t={landing:loc.pathname.slice(0,120),at:Date.now()};
 var s=param(q,"utm_source"),m=param(q,"utm_medium");
 if(s)t.source=s;
 if(m)t.medium=m;
 var c=param(q,"utm_campaign");if(c)t.campaign=c;
 var tm=param(q,"utm_term");if(tm)t.term=tm;
 var ct=param(q,"utm_content");if(ct)t.content=ct;
 var gc=param(q,"gclid");if(gc&&!s){t.source="Google";t.medium="cpc"}
 var r=d.referrer;
 if(r){try{if(new URL(r).hostname.toLowerCase()!==host())t.referrer=r.slice(0,300)}catch(e){}}
 return t}
function readFirst(){
 var m=d.cookie.match(new RegExp("(?:^|; )"+FS+"=([^;]*)"));
 if(!m)return null;
 var v=decode(m[1]);
 if(!v)return null;
 try{return JSON.parse(v)}catch(e){return null}}
function writeFirst(t){
 var p=FS+"="+encodeURIComponent(JSON.stringify(t))+"; path=/; samesite=lax";
 if(C.cookieDays>0)p+="; max-age="+C.cookieDays*86400;
 if(C.secureCookies&&loc.protocol==="https:")p+="; secure";
 var dom=cookieDomain();
 if(dom)p+="; domain="+dom;
 d.cookie=p}
var last=touch();
var first=readFirst();
if(!first){first=last;writeFirst(first)}
var q=[],timer=null;
function pack(evts){return JSON.stringify({siteId:C.siteId,visitorId:vid,events:evts})}
function bytes(s){try{return new Blob([s]).size}catch(e){return s.length*3}}
function shrink(e,body){
 var keys=e.fields?Object.keys(e.fields):[];
 while(keys.length>1&&bytes(body)>B){delete e.fields[keys.pop()];body=pack([e])}
 return body}
function post(body){
 try{
  if(navigator.sendBeacon&&navigator.sendBeacon(E,new Blob([body],{type:"text/plain"})))return;
  fetch(E,{method:"POST",body:body,keepalive:!0,mode:"no-cors",headers:{"content-type":"text/plain"}})
 }catch(e){}}
function flush(){
 clearTimeout(timer);
 while(q.length){
  var take=q.splice(0,M),body=pack(take);
  while(bytes(body)>B&&take.length>1){q.unshift(take.pop());body=pack(take)}
  if(bytes(body)>B)body=shrink(take[0],body);
  if(bytes(body)<=B)post(body)}}
function send(e){
 e.host=host();e.at=Date.now();
 q.push(e);
 if(q.length>=M){flush();return}
 clearTimeout(timer);timer=setTimeout(flush,2000)}
function view(){send({type:"page_view",path:loc.pathname,referrer:d.referrer||undefined,touch:last})}
function label(el){
 var t=(el.getAttribute("aria-label")||el.textContent||"").replace(/\\s+/g," ").trim();
 return t?t.slice(0,80):undefined}
function onClick(ev){
 var el=ev.target;
 while(el&&el!==d.body){
  if(el.hasAttribute&&el.hasAttribute("data-crm-track")){send({type:"click",path:loc.pathname,label:el.getAttribute("data-crm-track")||label(el)});return}
  if(el.tagName==="A"||el.tagName==="BUTTON"){
   var href=el.getAttribute&&el.getAttribute("href")||"";
   var out=/^https?:/i.test(href)&&href.indexOf(loc.origin)!==0;
   if(out||el.tagName==="BUTTON")send({type:"click",path:loc.pathname,label:label(el)});
   return}
  el=el.parentElement}}
function onSubmit(ev){
 var f=ev.target;
 if(!f||f.tagName!=="FORM")return;
 var fields={},n=0;
 for(var i=0;i<f.elements.length&&n<40;i++){
  var el=f.elements[i],name=el.name||el.id;
  if(!name||!el.value)continue;
  var type=(el.type||"").toLowerCase();
  if(type==="password"||type==="hidden"||type==="file")continue;
  if(type==="checkbox"||type==="radio"){if(!el.checked)continue}
  fields[name]=String(el.value).slice(0,512);n++}
 if(!n)return;
 send({type:"form_submit",path:loc.pathname,fields:fields,touch:last,firstTouch:first});
 flush()}
function decorate(){
 if(!C.crossDomain)return;
 d.addEventListener("mousedown",function(ev){
  var el=ev.target;
  while(el&&el.tagName!=="A")el=el.parentElement;
  if(!el||!el.href)return;
  var u;try{u=new URL(el.href)}catch(e){return}
  if(u.hostname.toLowerCase()===host()||!known(u.hostname.toLowerCase()))return;
  u.hash=u.hash.replace(/[#&]?_crm=[A-Za-z0-9_.-]+/,"");
  u.hash=(u.hash?u.hash+"&":"")+"_crm="+vid+"."+Math.floor(Date.now()/1000);
  el.href=u.toString()},!0)}
function start(){
 view();
 d.addEventListener("click",onClick,!0);
 d.addEventListener("submit",onSubmit,!0);
 d.addEventListener("visibilitychange",function(){if(d.visibilityState==="hidden")flush()});
 w.addEventListener("pagehide",flush);
 decorate();
 var push=history.pushState,rep=history.replaceState;
 function spa(fn){return function(){var r=fn.apply(this,arguments);setTimeout(view,0);return r}}
 try{history.pushState=spa(push);history.replaceState=spa(rep)}catch(e){}
 w.addEventListener("popstate",view)}
if(w.requestIdleCallback)requestIdleCallback(start,{timeout:2000});else setTimeout(start,0);
})();
`;
}
