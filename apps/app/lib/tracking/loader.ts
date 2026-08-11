export const LOADER_SOURCE = `(function(){
var s=document.currentScript||document.querySelector("script[src*='/t/crm.js']");
if(!s||!s.src)return;
var u;
try{u=new URL(s.src)}catch(e){return}
var site=s.getAttribute("data-site")||u.searchParams.get("site");
if(!site||!/^cmp_[0-9a-f]{8}$/.test(site))return;
var id="crm-tracker-"+site;
if(document.getElementById(id))return;
var t=document.createElement("script");
t.id=id;
t.async=!0;
t.defer=!0;
t.src=u.origin+"/t/"+site+".js";
(document.head||document.documentElement).appendChild(t);
})();
`;
