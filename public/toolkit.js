(function(){
var START="2026-11-02",DAY90="2027-01-30",TARGET_PIPE=1000,TARGET_WIN=25,TARGET_TAT=3,TARGET_ASSESS=20;
var REG=["India","Gulf","US","Europe","Asia"];
var SVC=["Product Engineering","Applied AI","Cloud & Platform","ERP","Cyber"];
var SRC=["Outbound","LinkedIn","Website","Webinar","Referral","Partner","Event","Clutch"];
var STAGES=["Lead","Qualified","Proposal","Negotiation"],PROB={Lead:0.1,Qualified:0.2,Proposal:0.4,Negotiation:0.6};
var OFFERS=["AI Value Sprint","Software Health Check","DevOps Health Check","Cloud Cost & Operations Health Check","ERP Health Check","Security Assessment","Other"];
var MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var COLL=["deals","proposals","assessments","leads","spend","activities","prospects"];
var LSTAT=["New","Contacted","Engaged","Qualified","Meeting booked","Converted","Disqualified"],OPEN_LSTAT=["New","Contacted","Engaged","Qualified"],DQ=["Not our ideal client","No budget","Bad timing","Chose another provider","No response after sequence","Duplicate or spam","Other"];var salesSettings={owners:[],industries:[],priority:["Gulf","US","Europe"]};
var data={deals:[],proposals:[],assessments:[],leads:[],spend:[],activities:[],prospects:[]};
var TABS=[["scorecard","Scorecard"],["pipeline","Pipeline"],["proposals","Proposals"],["assessments","Paid assessments"],["leads","Leads and spend"],["outreach","Outreach"],["engine","Lead engine"],["myai","My AI"]];
var tab="scorecard";
try{var h=location.hash.replace("#","");if(TABS.some(function(t){return t[0]===h;}))tab=h;}catch(e){}
var mode="loading",canWrite=true,edit=null,draft={},err="",status="",pending=false,leadReg="All";
var root=document.getElementById("root");
function el(tag,attrs,kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){var v=attrs[k];if(v===null||v===undefined||v===false)continue;if(k==="text")e.textContent=v;else if(k.slice(0,2)==="on")e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?"":v);}(kids||[]).forEach(function(c){if(c===null||c===undefined||c===false)return;e.appendChild(typeof c==="string"||typeof c==="number"?document.createTextNode(String(c)):c);});return e;}
function pd(s){if(!s)return null;var a=s.split("-");return new Date(+a[0],+a[1]-1,+(a[2]||1));}
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function today(){var t=new Date();t.setHours(0,0,0,0);return t;}
function fd(s){var d=pd(s);return d?d.getDate()+" "+MO[d.getMonth()]+" "+d.getFullYear():"";}
function money(v){v=+v||0;if(Math.abs(v)>=100){return "₹"+(Math.round(v)/100).toFixed(2).replace(/\.?0+$/,"")+" Cr";}return "₹"+(Math.round(v*10)/10)+" lakh";}
function wdays(a,b){var d=pd(a),e=b?pd(b):today();if(!d||!e||e<=d)return 0;var n=0,x=new Date(d);while(x<e){x.setDate(x.getDate()+1);var g=x.getDay();if(g!==0&&g!==6)n++;}return n;}
function bar(c,n,amber){var b=el("div",{class:"bar"+(amber?" amber":"")});var s=el("span");s.style.width=Math.min(100,n?Math.round(c/n*100):0)+"%";b.appendChild(s);return b;}
function planDay(){return Math.round((today()-pd(START))/864e5)+1;}
function cmpDate(f){return function(a,b){return (b[f]||"").localeCompare(a[f]||"");};}
/* storage: the MindSuite server */
function api(method,url,body){
 return fetch(url,{method:method,headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined,credentials:"same-origin"}).then(function(r){
  if(!r.ok)return r.json().catch(function(){return {};}).then(function(j){throw new Error(j.error||("HTTP "+r.status));});
  return r.json();
 });
}
function upsert(c,r){var i=-1;data[c].forEach(function(x,k){if(x.id===r.id)i=k;});if(i>=0)data[c][i]=r;else data[c].push(r);}
function save(c,obj){
 var id=obj.id,body={};for(var k in obj)if(["id","created","updated"].indexOf(k)<0)body[k]=obj[k];
 setStatus("Saving…");
 return api(id?"PUT":"POST","/api/toolkit/"+c+(id?"/"+encodeURIComponent(id):""),body).then(function(r){upsert(c,r);setStatus("Saved");schedule();return r.id;}).catch(function(e){setStatus("Couldn’t save: "+e.message);throw e;});
}
function remove(c,id){
 return api("DELETE","/api/toolkit/"+c+"/"+encodeURIComponent(id)).then(function(){data[c]=data[c].filter(function(x){return x.id!==id;});setStatus("Deleted");schedule();}).catch(function(e){setStatus("Couldn’t delete: "+e.message);});
}
function setStatus(s){status=s;var e=document.querySelector(".status");if(e)e.textContent=s;}
function schedule(){var a=document.activeElement;if(a&&a.closest&&a.closest(".form")){pending=true;return;}render();}
document.addEventListener("focusout",function(){setTimeout(function(){if(pending){var a=document.activeElement;if(!(a&&a.closest&&a.closest(".form"))){pending=false;render();}}},0);});
var loadErr="";
api("GET","/api/toolkit").then(function(d){COLL.forEach(function(c){data[c]=d[c]||[];});if(d.settings)salesSettings=d.settings;mode="server";render();}).catch(function(e){mode="error";loadErr=e.message;render();});
if(window.EventSource){var es=new EventSource("/api/events");es.addEventListener("toolkit",function(ev){try{var d=JSON.parse(ev.data);COLL.forEach(function(c){data[c]=d[c]||[];});if(d.settings)salesSettings=d.settings;if(tab==="engine"&&engineStatus)api("GET","/api/engine").then(function(s){engineStatus=s;render();}).catch(function(){});schedule();}catch(e){}});}
/* metrics */
function metrics(){
 var open=data.deals.filter(function(d){return d.stage!=="Won"&&d.stage!=="Lost"&&d.stage!=="Lead";});
 var pipe=open.reduce(function(s,d){return s+(+d.value||0);},0);
 var weighted=open.reduce(function(s,d){return s+(+d.value||0)*(PROB[d.stage]||0);},0);
 var decided=data.proposals.filter(function(p){return p.status==="Won"||p.status==="Lost";});
 var won=decided.filter(function(p){return p.status==="Won";}).length;
 var win=decided.length?Math.round(won/decided.length*100):null;
 var sent=data.proposals.filter(function(p){return p.sent;});
 var tats=sent.map(function(p){return wdays(p.requested,p.sent);});
 var tat=tats.length?Math.round(tats.reduce(function(a,b){return a+b;},0)/tats.length*10)/10:null;
 var ontime=tats.filter(function(t){return t<=TARGET_TAT;}).length;
 var signed=data.assessments.length;
 var conv=data.assessments.filter(function(a){return a.converted==="Yes";}).length;
 var convDecided=data.assessments.filter(function(a){return a.converted==="Yes"||a.converted==="No";}).length;
 return {pipe:pipe,weighted:weighted,open:open.length,win:win,won:won,decided:decided.length,tat:tat,ontime:ontime,sentN:sent.length,signed:signed,conv:conv,convDecided:convDecided};
}
/* forms */
var FORMS={
 deals:{title:"deal",fields:[["company","Company","text",1],["contact","Contact person","text"],["region","Region","select",1,REG],["service","Department","select",1,SVC],["value","Annual value (₹ lakh)","number",1],["stage","Stage","select",1,STAGES.concat(["Won","Lost"])],["source","Lead source","select",0,SRC],["nextStep","Next step","text"],["nextDate","Next step date","date"],["notes","Notes","textarea"]],def:function(){return {region:"India",service:"Product Engineering",stage:"Qualified",source:"Outbound"};}},
 proposals:{title:"proposal",fields:[["company","Company","text",1],["value","Proposal value (₹ lakh)","number",1],["service","Department","select",1,SVC],["requested","Date the client asked for it","date",1],["sent","Date sent","date"],["status","Status","select",1,["Drafting","Sent","Won","Lost"]],["reason","Why it was won or lost","text"]],def:function(){return {requested:iso(today()),status:"Drafting",service:"Product Engineering"};}},
 assessments:{title:"paid assessment",fields:[["company","Company","text",1],["offer","Offer","select",1,OFFERS],["price","Price (₹ lakh)","number",1],["signed","Date signed","date",1],["status","Status","select",1,["Signed","In progress","Delivered"]],["converted","Became a project?","select",1,["Pending","Yes","No"]],["followOn","Follow-on project value (₹ lakh)","number"]],def:function(){return {offer:"AI Value Sprint",signed:iso(today()),status:"Signed",converted:"Pending"};}},
 leads:{title:"lead",fields:[["company","Company","text",1],["contact","Contact person","text"],["title","Job title","text"],["email","Email","text"],["phone","Phone","text"],["country","Country","text"],["region","Region","select",1,REG],["source","Source","select",1,SRC],["date","Date received","date",1],["interest","Interested in","select",0,["Not sure"].concat(SVC)],["timeline","Wants to start","select",0,["Not sure","Within 3 months","3–6 months","Later"]],["industry","Industry","text"],["employees","Company size (employees)","number"],["status","Status","select",0,LSTAT],["owner","Owner","text"],["disqualReason","Reason, if disqualified","select",0,[""].concat(DQ)],["notes","Notes","textarea"]],def:function(){return {region:"India",source:"Outbound",date:iso(today()),qualified:false,meeting:false};}},
 spend:{title:"marketing spend",fields:[["month","Month","month",1],["region","Region","select",1,REG],["channel","Channel","select",1,SRC.concat(["Agency or appointment setter","Tools"])],["amount","Amount (₹ lakh)","number",1],["note","Note","text"]],def:function(){var t=today();return {month:t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0"),region:"Gulf",channel:"Event"};}}
};
function openForm(c,rec){edit={c:c,id:rec?rec.id:null};draft=Object.assign({},rec||FORMS[c].def());err="";render();var f=document.querySelector(".form input,.form select");if(f){f.focus();document.querySelector(".form").scrollIntoView({block:"start"});}}
function form(c){
 var F=FORMS[c],g=el("div",{class:"fgrid"});
 F.fields.forEach(function(f){
  var k=f[0],lab=f[1],type=f[2],req=f[3],opts=f[4],input;
  if(type==="select"){input=el("select",{onchange:function(e){draft[k]=e.target.value;}},(opts||[]).map(function(o){return el("option",{value:o,selected:draft[k]===o},[o]);}));if(draft[k]===undefined)draft[k]=opts[0];}
  else if(type==="textarea")input=el("textarea",{rows:"2",oninput:function(e){draft[k]=e.target.value;}},[draft[k]||""]);
  else if(type==="check"){input=el("input",{type:"checkbox",checked:!!draft[k],onchange:function(e){draft[k]=e.target.checked;}});g.appendChild(el("label",{class:"chk wide"},[input,lab]));return;}
  else input=el("input",{type:type,value:draft[k]===undefined?"":draft[k],step:type==="number"?"0.1":null,min:type==="number"?"0":null,oninput:function(e){draft[k]=e.target.value;err="";var x=document.querySelector(".err");if(x)x.textContent="";}});
  g.appendChild(el("label",{class:type==="textarea"?"wide":""},[lab+(req?"":" (optional)"),input]));
 });
 return el("section",{class:"form","aria-label":(edit.id?"Edit ":"Add a ")+F.title},[
  el("h3",{text:(edit.id?"Edit ":"Add a ")+F.title}),g,el("div",{class:"err",role:"alert",text:err}),
  el("div",{class:"formbtns"},[
   el("button",{class:"p",text:edit.id?"Save changes":"Add "+F.title,onclick:function(){submit(c);}}),
   el("button",{class:"b",text:"Cancel",onclick:function(){edit=null;pending=false;render();}}),
   edit.id?el("button",{class:"b",text:"Delete",onclick:function(){if(confirm("Delete this "+F.title+"?")){var id=edit.id;edit=null;remove(c,id);render();}}}):null])]);
}
function submit(c){
 var F=FORMS[c];
 for(var i=0;i<F.fields.length;i++){var f=F.fields[i];if(f[3]&&f[2]!=="check"&&(draft[f[0]]===undefined||String(draft[f[0]]).trim()==="")){err="Enter "+f[1].toLowerCase().replace(/ \(.*\)$/,"")+" first.";render();return;}}
 ["value","price","followOn","amount"].forEach(function(k){if(draft[k]!==undefined&&draft[k]!=="")draft[k]=Math.round(parseFloat(draft[k])*10)/10;});
 if(c==="proposals"&&draft.status!=="Drafting"&&!draft.sent){err="Add the date it was sent, or set the status back to Drafting.";render();return;}
 if(c==="proposals"&&draft.sent&&draft.requested&&draft.sent<draft.requested){err="The sent date can’t be before the request date.";render();return;}
 var rec=Object.assign({},draft);if(edit.id)rec.id=edit.id;
 save(c,rec).then(function(){edit=null;pending=false;render();}).catch(function(e){err=e.message;render();});
}
function addBtn(c,label){return canWrite?el("button",{class:"p",text:label,onclick:function(){openForm(c,null);}}):null;}
/* views */
function goalCard(label,value,target,state,extra){return el("div",{class:"goal"+(state?" "+state:"")},[el("span",{class:"gl",text:label}),el("span",{class:"gv",text:value}),el("span",{class:"gt",text:target})].concat(extra||[]));}
function scorecard(w){
 var m=metrics(),pdn=planDay(),left=Math.round((pd(DAY90)-today())/864e5);
 var pipeState=m.pipe>=TARGET_PIPE?"ok":(left<0?"bad":"");
 w.appendChild(el("div",{class:"goals"},[
  goalCard("Open pipeline",money(m.pipe),"Goal ₹10 Cr by Day 90 ("+fd(DAY90)+")"+(left>=0?", "+left+" days left":", deadline passed"),pipeState,[bar(m.pipe,TARGET_PIPE,m.pipe<TARGET_PIPE),el("span",{class:"gt",text:"Weighted by stage: "+money(m.weighted)+" across "+m.open+" open deals"})]),
  goalCard("Proposal win rate",m.win===null?"No results yet":m.win+"%","Goal 25% or higher"+(m.decided?", "+m.won+" won of "+m.decided+" decided":""),m.win===null?"":m.win>=TARGET_WIN?"ok":"bad",m.win===null?[]:[bar(m.win,TARGET_WIN,m.win<TARGET_WIN)]),
  goalCard("Proposal turnaround",m.tat===null?"No proposals sent":m.tat+" days","Goal 3 working days or less"+(m.sentN?", "+m.ontime+" of "+m.sentN+" on time":""),m.tat===null?"":m.tat<=TARGET_TAT?"ok":"bad",m.sentN?[bar(m.ontime,m.sentN,m.ontime<m.sentN)]:[]),
  goalCard("Paid assessments",m.signed+" of 20","Goal 20 this year"+(m.convDecided?", "+m.conv+" of "+m.convDecided+" became projects":""),m.signed>=TARGET_ASSESS?"ok":"",[bar(m.signed,TARGET_ASSESS,m.signed<TARGET_ASSESS)])
 ]));
 var att=attention();
 var left2=el("div",{},[el("div",{class:"panel"},[el("h3",{text:"Needs attention"}),att.length?el("ul",{class:"att"},att.map(function(a){return el("li",{},[el("span",{},[el("b",{text:a.who+" "}),a.what]),el("button",{class:"link",text:"Open",onclick:a.go})]);})):el("p",{class:"empty",text:"Nothing overdue. Every open deal has a next step and every proposal is on time."})])]);
 var rows=REG.map(function(r){
  var L=data.leads.filter(function(x){return x.region===r;});
  var q=L.filter(function(x){return x.qualified;}).length,mt=L.filter(function(x){return x.meeting;}).length;
  var sp=data.spend.filter(function(x){return x.region===r;}).reduce(function(s,x){return s+(+x.amount||0);},0);
  var wonD=data.deals.filter(function(d){return d.region===r&&d.stage==="Won";});
  return el("tr",{},[el("td",{text:r}),el("td",{class:"n",text:L.length}),el("td",{class:"n",text:q}),el("td",{class:"n",text:mt}),el("td",{class:"n",text:sp?money(sp):"–"}),el("td",{class:"n",text:mt&&sp?money(sp/mt):"–"}),el("td",{class:"n",text:wonD.length?wonD.length+" ("+money(wonD.reduce(function(s,d){return s+(+d.value||0);},0))+")":"0"})]);
 });
 var right=el("div",{},[el("div",{class:"panel"},[el("h3",{text:"Marketing by region"}),el("div",{class:"scroll"},[el("table",{},[el("thead",{},[el("tr",{},[el("th",{text:"Region"}),el("th",{class:"n",text:"Leads"}),el("th",{class:"n",text:"Qualified"}),el("th",{class:"n",text:"Meetings"}),el("th",{class:"n",text:"Spend"}),el("th",{class:"n",text:"Cost per meeting"}),el("th",{class:"n",text:"Won"})])]),el("tbody",{},rows)])]),
  el("p",{class:"muted",style:"font-size:13px;margin:10px 0 0",text:"Year 1 goal: about 220 leads. Move budget each quarter towards the region with the lowest cost per meeting that turns into signed deals."})]),
  stageFunnel()]);
 w.appendChild(el("div",{class:"grid2"},[left2,right]));
}
function stageFunnel(){
 var p=el("div",{class:"panel"},[el("h3",{text:"Pipeline by stage"})]);
 STAGES.forEach(function(s){var ds=data.deals.filter(function(d){return d.stage===s;}),v=ds.reduce(function(a,d){return a+(+d.value||0);},0);p.appendChild(el("div",{style:"margin:8px 0"},[el("div",{style:"display:flex;justify-content:space-between;font-size:14px"},[el("span",{text:s+" ("+ds.length+")"}),el("span",{text:money(v)})]),bar(v,Math.max(TARGET_PIPE,1),true)]));});
 return p;
}
function attention(){
 var t=iso(today()),out=[];
 data.deals.forEach(function(d){if(d.stage==="Won"||d.stage==="Lost")return;if(!d.nextDate)out.push({who:d.company,what:"has no next step date",go:function(){tab="pipeline";openForm("deals",d);}});else if(d.nextDate<t)out.push({who:d.company,what:"next step was due "+fd(d.nextDate),go:function(){tab="pipeline";openForm("deals",d);}});});
 data.proposals.forEach(function(p){if(p.status==="Drafting"&&wdays(p.requested)>TARGET_TAT)out.push({who:p.company,what:"proposal is "+wdays(p.requested)+" working days old and not sent",go:function(){tab="proposals";openForm("proposals",p);}});});
 data.assessments.forEach(function(a){if(a.status==="Delivered"&&a.converted==="Pending")out.push({who:a.company,what:"assessment delivered; propose the follow-on project",go:function(){tab="assessments";openForm("assessments",a);}});});
 data.leads.forEach(function(l){if(l.qualified&&!l.meeting)out.push({who:l.company,what:"qualified lead with no meeting booked",go:function(){tab="leads";openForm("leads",l);}});});
 return out.slice(0,15);
}
function pipeline(w){
 w.appendChild(el("div",{class:"toolbar"},[el("p",{class:"muted",style:"margin:0;font-size:14px",text:"Open pipeline counts Qualified, Proposal and Negotiation deals. Every open deal needs a next step and a date."}),addBtn("deals","Add deal")]));
 var t=iso(today()),board=el("div",{class:"board"});
 STAGES.forEach(function(s,si){
  var ds=data.deals.filter(function(d){return d.stage===s;}).sort(function(a,b){return (+b.value||0)-(+a.value||0);});
  var col=el("div",{class:"col"},[el("h3",{},[s,el("span",{text:ds.length+", "+money(ds.reduce(function(a,d){return a+(+d.value||0);},0))})])]);
  if(!ds.length)col.appendChild(el("p",{class:"empty",text:si===0?"New leads you’re still qualifying go here.":"No deals at this stage."}));
  ds.forEach(function(d){col.appendChild(dealCard(d,t));});
  board.appendChild(col);
 });
 w.appendChild(board);
 var closed=el("div",{class:"closed"});
 ["Won","Lost"].forEach(function(s){var ds=data.deals.filter(function(d){return d.stage===s;}).sort(cmpDate("updatedDate"));var p=el("div",{class:"panel"},[el("h3",{text:s+" ("+ds.length+", "+money(ds.reduce(function(a,d){return a+(+d.value||0);},0))+")"})]);if(!ds.length)p.appendChild(el("p",{class:"empty",text:"None yet."}));ds.forEach(function(d){p.appendChild(el("div",{style:"display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:14px"},[el("span",{text:d.company+", "+d.region}),el("button",{class:"link",text:money(d.value),onclick:function(){openForm("deals",d);}})]));});closed.appendChild(p);});
 w.appendChild(closed);
}
function dealCard(d,t){
 var late=d.nextDate&&d.nextDate<t;
 var sel=canWrite?el("select",{class:"sm","aria-label":"Move "+d.company+" to stage",onchange:function(e){var r=Object.assign({},d);r.stage=e.target.value;r.updatedDate=iso(today());save("deals",r);}},STAGES.concat(["Won","Lost"]).map(function(s){return el("option",{value:s,selected:d.stage===s},[s]);})):null;
 return el("div",{class:"card"},[el("b",{text:d.company}),el("span",{class:"meta",text:money(d.value)+", "+d.region+", "+d.service}),
  el("div",{class:"next"+(late?" warn":"")},[d.nextStep?d.nextStep:"No next step set",d.nextDate?el("span",{class:"meta"+(late?" warn":""),text:" by "+fd(d.nextDate)}):null]),
  el("div",{class:"acts"},[sel,canWrite?el("button",{class:"link",text:"Edit",onclick:function(){openForm("deals",d);}}):null])]);
}
function proposals(w){
 w.appendChild(el("div",{class:"toolbar"},[el("p",{class:"muted",style:"margin:0;font-size:14px",text:"Turnaround counts working days from the client’s request to the day the proposal is sent. Goal: 3 or fewer."}),addBtn("proposals","Add proposal request")]));
 var list=data.proposals.slice().sort(cmpDate("requested"));
 var body=list.map(function(p){
  var days=wdays(p.requested,p.sent||null),late=days>TARGET_TAT;
  var tatCell=p.sent?el("span",{class:"pill "+(late?"warn":"good"),text:days+(days===1?" day":" days")}):el("span",{class:"pill"+(late?" warn":""),text:late?days+" working days, late":"Day "+days+" of 3"});
  return el("tr",{},[el("td",{},[el("b",{text:p.company}),el("div",{class:"muted",style:"font-size:12px","data-dept":window.MSDept.idFor(p.service),title:"Right-click to see what this department does",text:p.service||""})]),el("td",{class:"n",text:money(p.value)}),el("td",{text:fd(p.requested)}),el("td",{text:p.sent?fd(p.sent):"Not sent"}),el("td",{},[tatCell]),el("td",{text:p.status+(p.reason?": "+p.reason:"")}),
   el("td",{},[canWrite&&p.status==="Drafting"?el("button",{class:"b",text:"Mark sent today",onclick:function(){var r=Object.assign({},p);r.sent=iso(today());r.status="Sent";save("proposals",r);}}):null," ",canWrite?el("button",{class:"link",text:"Edit",onclick:function(){openForm("proposals",p);}}):null])]);
 });
 w.appendChild(el("div",{class:"grid2"},[
  el("div",{class:"panel"},[el("h3",{text:"Proposals"}),list.length?el("div",{class:"scroll"},[el("table",{},[el("thead",{},[el("tr",{},["Company","Value","Requested","Sent","Turnaround","Status",""].map(function(h,i){return el("th",{class:i===1?"n":null,text:h});}))]),el("tbody",{},body)])]):el("p",{class:"empty",text:"Log each proposal request the day a client asks, so the 3-day clock starts."})]),
  el("div",{class:"panel"},[el("h3",{text:"The 3-day proposal routine"}),el("ol",{class:"steps"},[
   el("li",{text:"Day 0: log the request here and confirm scope questions with the client the same day."}),
   el("li",{text:"Day 1: the department lead writes the scope and effort estimate from the standard templates."}),
   el("li",{text:"Day 2: price it from the rate card, check margin is at least 25%, and get CEO sign-off if below the floor rate."}),
   el("li",{text:"Day 3: send it, book the review call, and mark it sent here."})]),
   el("h3",{text:"Every proposal includes",style:"margin-top:14px"}),el("ul",{class:"steps"},[el("li",{text:"The client’s problem in their own words"}),el("li",{text:"Scope, deliverables and what’s out of scope"}),el("li",{text:"Timeline and team"}),el("li",{text:"Price, payment terms and a paid first step if possible"}),el("li",{text:"One relevant case study with numbers"})])])]));
}
function assessments(w){
 var m=metrics();
 w.appendChild(el("div",{class:"toolbar"},[el("p",{class:"muted",style:"margin:0;font-size:14px",text:m.signed+" of 20 signed this year. When one is delivered, propose the follow-on project within a week."}),addBtn("assessments","Add paid assessment")]));
 var list=data.assessments.slice().sort(cmpDate("signed"));
 var body=list.map(function(a){return el("tr",{},[el("td",{},[el("b",{text:a.company})]),el("td",{text:a.offer}),el("td",{class:"n",text:money(a.price)}),el("td",{text:fd(a.signed)}),el("td",{text:a.status}),el("td",{},[el("span",{class:"pill"+(a.converted==="Yes"?" good":a.converted==="No"?" warn":""),text:a.converted})]),el("td",{class:"n",text:a.followOn?money(a.followOn):"–"}),el("td",{},[canWrite?el("button",{class:"link",text:"Edit",onclick:function(){openForm("assessments",a);}}):null])]);});
 var byOffer=OFFERS.map(function(o){var L=data.assessments.filter(function(a){return a.offer===o;});return L.length?el("tr",{},[el("td",{text:o}),el("td",{class:"n",text:L.length}),el("td",{class:"n",text:L.filter(function(a){return a.converted==="Yes";}).length})]):null;}).filter(Boolean);
 w.appendChild(el("div",{class:"grid2"},[
  el("div",{class:"panel"},[el("h3",{text:"Assessments"}),list.length?el("div",{class:"scroll"},[el("table",{},[el("thead",{},[el("tr",{},["Company","Offer","Price","Signed","Status","Became a project","Follow-on",""].map(function(h,i){return el("th",{class:i===2||i===6?"n":null,text:h});}))]),el("tbody",{},body)])]):el("p",{class:"empty",text:"Add each paid assessment the day it’s signed."})]),
  el("div",{class:"panel"},[el("h3",{text:"Which offers convert"}),byOffer.length?el("table",{},[el("thead",{},[el("tr",{},[el("th",{text:"Offer"}),el("th",{class:"n",text:"Signed"}),el("th",{class:"n",text:"Became projects"})])]),el("tbody",{},byOffer)]):el("p",{class:"empty",text:"This fills in as you add assessments, so you can see which entry offers lead to projects."})])]));
}
/* ---------- Lead lifecycle, outreach sequences, templates and AI drafting ---------- */
var ACT={},OFFER_FOR={},TPL={},SEQ={};
api("GET","/api/outreach/library").then(function(L){ACT=L.ACT;OFFER_FOR=L.OFFER_FOR;TPL=L.TPL;SEQ=L.SEQ;LSTAT=L.LSTAT;OPEN_LSTAT=L.OPEN_LSTAT;DQ=L.DQ;render();}).catch(function(){});
function leadStatus(l){return l.status||(l.dealId?"Converted":l.meeting?"Meeting booked":l.qualified?"Qualified":"New");}
function engagement(l){var n=0;data.activities.forEach(function(a){if(a.leadId===l.id&&ACT[a.type])n+=ACT[a.type].p;});return Math.min(50,n);}
function addDays(isoD,n){var d=pd(isoD);d.setDate(d.getDate()+n);return iso(d);}
function seqStep(l){if(!l.seq||l.seq.done||!SEQ[l.seq.id])return null;var S=SEQ[l.seq.id],st=S.steps[l.seq.step];if(!st)return null;return {S:S,st:st,n:l.seq.step,due:addDays(l.seq.start,st[0])};}
function withStatus(l,s,extra){
 var r=Object.assign({},l,extra||{});r.status=s;
 r.qualified=["Qualified","Meeting booked","Converted"].indexOf(s)>=0;r.meeting=["Meeting booked","Converted"].indexOf(s)>=0;
 if(s!=="New"&&!r.firstContact)r.firstContact=Date.now();
 if(["Engaged","Meeting booked","Converted","Disqualified"].indexOf(s)>=0&&r.seq&&!r.seq.done)r.seq=Object.assign({},r.seq,{done:true,stopped:s});
 return r;
}
function logActivity(l,type,note){
 var info=ACT[type]||{};
 var a={leadId:l.id,type:type,date:iso(today()),at:Date.now(),note:note||""};
 return save("activities",a).then(function(){
  var st=leadStatus(l),r=Object.assign({},l);
  if(info.out&&!r.firstContact)r.firstContact=Date.now();
  if(type==="Replied")r=withStatus(r,["Qualified","Meeting booked","Converted"].indexOf(st)>=0?st:"Engaged");
  else if(type==="Meeting booked")r=withStatus(r,"Meeting booked");
  else if(info.out&&st==="New")r=withStatus(r,"Contacted");
  return save("leads",r);
 });
}
function startSeq(l,id){var r=Object.assign({},l,{seq:{id:id,step:0,start:iso(today())}});if(leadStatus(l)==="Disqualified")r=withStatus(r,"New");return save("leads",r);}
function advance(l,skipped){
 var x=seqStep(l);if(!x)return Promise.resolve();
 var p=skipped?Promise.resolve():logActivity(l,x.st[1]==="Email"?"Email sent":x.st[1]==="LinkedIn"?"LinkedIn message":"Call, no answer",x.S.name+": "+x.st[2]);
 return p.then(function(){var cur=data.leads.filter(function(z){return z.id===l.id;})[0]||l;var r=Object.assign({},cur);var nx=r.seq.step+1;r.seq=Object.assign({},r.seq,{step:nx,done:nx>=x.S.steps.length});if(r.seq.done&&leadStatus(r)!=="Engaged"&&OPEN_LSTAT.indexOf(leadStatus(r))>=0)r.seq.finished=true;return save("leads",r);});
}
function fill(key,l){
 var t=TPL[key]?TPL[key].text:"";var first=String(l.contact||"").trim().split(/\s+/)[0]||"[first name]";
 var interest=l.interest&&l.interest!=="Not sure"?l.interest:"your technology plans";
 var map={first_name:first,company:l.company||"[company]",region:l.region||"",interest:interest,interest_lower:interest==="your technology plans"?"technology":interest,offer:OFFER_FOR[l.interest]||"AI Value Sprint",event:l.source==="Event"?"[event name]":"[event name]",sender:l.owner||"[your name]",title_or_role:l.title?l.title.split(/[,(]/)[0].trim():"technology leader"};
 return t.replace(/\{\{(\w+)\}\}/g,function(m,k){return map[k]!==undefined?map[k]:m;});
}
function copyText(ta){var t=ta.value;function fb(){ta.focus();ta.select();try{document.execCommand("copy");setStatus("Copied");}catch(e){setStatus("Select the text and copy it");}}
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){setStatus("Copied");},fb);else fb();}
var aiStatus=null;api("GET","/api/ai/status").then(function(s){aiStatus=s;render();}).catch(function(){});
var drafts={},openMsg={};
function aiDraft(l,x,ta,btn){
 btn.disabled=true;btn.textContent="Drafting…";
 api("POST","/api/ai/draft",{leadId:l.id}).then(function(r){ta.value=r.text;drafts[l.id]=r.text;btn.disabled=false;btn.textContent="Draft again with AI";setStatus("Drafted with "+r.model);})
  .catch(function(e){btn.disabled=false;btn.textContent="Draft with AI";setStatus(e.message);});
}
function msgBox(l,x){
 var ta=el("textarea",{rows:"9",class:"msgbox","aria-label":"Message for "+l.company});ta.value=drafts[l.id]||fill(x.st[3],l);
 ta.addEventListener("input",function(){drafts[l.id]=ta.value;});
 var aiBtn=aiStatus&&aiStatus.enabled&&canWrite?el("button",{class:"b",text:"Draft with AI",title:"Uses "+aiStatus.model+" through OpenRouter",onclick:function(){aiDraft(l,x,ta,aiBtn);}}):null;
 return el("div",{class:"msgwrap"},[ta,el("div",{class:"formbtns"},[el("button",{class:"b",text:"Copy",onclick:function(){copyText(ta);}}),aiBtn,el("button",{class:"link",text:"Reset to template",onclick:function(){delete drafts[l.id];ta.value=fill(x.st[3],l);}})]),
  el("p",{class:"muted",style:"font-size:12px;margin:6px 0 0",text:"Fill in anything in [square brackets] before sending. Nothing is sent from here: copy it into email, LinkedIn or your notes for the call."+(aiStatus&&!aiStatus.enabled?" AI drafting is off: add your OpenRouter key under My AI.":"")})]);
}
function seqPicker(l){
 if(!canWrite)return null;
 return el("select",{class:"sm","aria-label":"Start a sequence for "+l.company,onchange:function(e){if(e.target.value)startSeq(l,e.target.value);}},[el("option",{value:"",text:"Start a sequence…"})].concat(Object.keys(SEQ).map(function(k){return el("option",{value:k,text:SEQ[k].name});})));
}
function outreach(w){
 var t=iso(today()),items=[],fresh=[],owners=(salesSettings.owners||[]);
 data.leads.forEach(function(l){var x=seqStep(l);if(x&&x.due<=t&&(outOwner==="All"||l.owner===outOwner))items.push({l:l,x:x});
  if(leadStatus(l)==="New"&&!(l.seq&&!l.seq.done)&&(outOwner==="All"||l.owner===outOwner))fresh.push(l);});
 items.sort(function(a,b){return a.x.due.localeCompare(b.x.due)||(b.l.score||0)-(a.l.score||0);});
 fresh.sort(function(a,b){return (a.created||0)-(b.created||0);});
 var touches=data.activities.filter(function(a){return a.date===t&&ACT[a.type]&&ACT[a.type].out;}).length;
 var target=25*Math.max(1,owners.length||1);
 var late=fresh.filter(function(l){return l.created&&Date.now()-l.created>864e5;}).length;
 w.appendChild(el("div",{class:"goals"},[
  goalCard("Due today",String(items.length),"Sequence steps due today or earlier",items.length?"":"ok"),
  goalCard("Touches today",touches+" of "+target,"Daily minimum: 25 personalised touches per salesperson",touches>=target?"ok":"",[bar(touches,target,touches<target)]),
  goalCard("Waiting for a first reply",String(fresh.length),late?late+" waiting more than 24 hours":"Reply to every new lead within 24 hours",late?"bad":fresh.length?"":"ok")]));
 if(owners.length)w.appendChild(el("div",{class:"chips",role:"group","aria-label":"Owner",style:"margin-bottom:14px"},["All"].concat(owners).map(function(o){return el("button",{class:"chip","aria-pressed":String(outOwner===o),text:o==="All"?"Everyone":o,onclick:function(){outOwner=o;render();}});})));
 var dueP=el("div",{class:"panel"},[el("h3",{text:"Today’s outreach"})]);
 if(!items.length)dueP.appendChild(el("p",{class:"empty",text:data.leads.length?"Nothing due. Start a sequence for new leads below, or from the Leads tab.":"Add leads first, then start an outreach sequence for each one."}));
 items.forEach(function(it){
  var l=it.l,x=it.x,od=Math.round((pd(t)-pd(x.due))/864e5);
  var card=el("div",{class:"ocard"},[
   el("div",{class:"ohead"},[el("div",{},[el("b",{text:l.company}),el("div",{class:"muted",style:"font-size:13px",text:[l.contact,l.title,l.region].filter(Boolean).join(", ")})]),el("span",{class:"pill"+(l.score>=60?" good":""),text:"Fit "+(l.score||0)+(engagement(l)?", +"+engagement(l)+" engaged":"")})]),
   el("p",{class:"ostep",text:x.st[1]+": "+x.st[2]}),
   el("p",{class:"muted",style:"font-size:12px;margin:2px 0 8px",text:x.S.name+", step "+(x.n+1)+" of "+x.S.steps.length+(od>0?", "+od+(od===1?" day":" days")+" overdue":"")}),
   openMsg[l.id]?msgBox(l,x):null,
   canWrite?el("div",{class:"formbtns"},[
    el("button",{class:"b",text:openMsg[l.id]?"Hide message":"Show message",onclick:function(){openMsg[l.id]=!openMsg[l.id];render();}}),
    el("button",{class:"p",text:"Done",onclick:function(){delete openMsg[l.id];delete drafts[l.id];advance(l,false);}}),
    el("button",{class:"b",text:"They replied",onclick:function(){delete openMsg[l.id];logActivity(l,"Replied",x.S.name);}}),
    el("button",{class:"b",text:"Meeting booked",onclick:function(){delete openMsg[l.id];logActivity(l,"Meeting booked",x.S.name);}}),
    el("button",{class:"link",text:"Skip step",onclick:function(){advance(l,true);}}),
    el("button",{class:"link",text:"Open lead",onclick:function(){tab="leads";openForm("leads",l);}})]):null]);
  dueP.appendChild(card);
 });
 var freshP=el("div",{class:"panel"},[el("h3",{text:"New leads waiting for a first reply"})]);
 if(!fresh.length)freshP.appendChild(el("p",{class:"empty",text:"Every new lead has been contacted or is in a sequence."}));
 else{var ft=el("ul",{class:"att"});fresh.forEach(function(l){var hrs=l.created?Math.floor((Date.now()-l.created)/36e5):0;ft.appendChild(el("li",{},[el("span",{},[el("b",{text:l.company+" "}),el("span",{class:hrs>=24?"warn":"muted",text:hrs>=24?"waiting "+Math.floor(hrs/24)+(hrs<48?" day":" days"):"received "+(hrs<1?"just now":hrs+"h ago")})," ",el("span",{class:"muted",text:"Fit "+(l.score||0)})]),seqPicker(l)]));});freshP.appendChild(ft);}
 var seqP=el("details",{class:"panel guide"},[el("summary",{},[el("h3",{text:"Sequences"})]),el("p",{class:"muted",text:"A sequence spaces out your touches across email, LinkedIn and calls. Each step appears in Today’s outreach on its day. A reply, a booked meeting or disqualifying the lead stops the sequence."})].concat(Object.keys(SEQ).map(function(k){var S=SEQ[k];return el("div",{class:"seqdef"},[el("h4",{text:S.name}),el("p",{class:"muted",text:S.use}),el("ol",{class:"steps"},S.steps.map(function(s){return el("li",{text:"Day "+s[0]+", "+s[1]+": "+s[2]});}))]);})));
 var tplP=el("details",{class:"panel guide"},[el("summary",{},[el("h3",{text:"Message templates"})]),el("p",{class:"muted",text:"Placeholders in double braces fill in from the lead. Replace anything in [square brackets] before sending."})].concat(Object.keys(TPL).map(function(k){return el("details",{class:"tpl"},[el("summary",{text:TPL[k].name}),el("pre",{class:"code"},[el("code",{text:TPL[k].text})])]);})));
 var setP=el("details",{class:"panel guide"},[el("summary",{},[el("h3",{text:"Team and targets"})]),settingsForm()]);
 w.appendChild(el("div",{class:"grid2"},[el("div",{},[dueP]),el("div",{},[freshP,seqP,tplP,setP])]));
}
var outOwner="All",setDraft=null;
function settingsForm(){
 var S=salesSettings;if(!setDraft)setDraft={owners:(S.owners||[]).join(", "),industries:(S.industries||[]).join(", "),priority:(S.priority||["Gulf","US","Europe"]).slice()};
 var pr=el("div",{class:"chips"},REG.map(function(r){return el("button",{class:"chip","aria-pressed":String(setDraft.priority.indexOf(r)>=0),text:r,disabled:!canWrite,onclick:function(){var i=setDraft.priority.indexOf(r);if(i>=0)setDraft.priority.splice(i,1);else setDraft.priority.push(r);render();}});}));
 return el("div",{class:"fgrid",style:"grid-template-columns:1fr"},[
  el("label",{},["Sales team members (comma-separated), used for lead owners and the daily touch target",el("input",{type:"text",value:setDraft.owners,disabled:!canWrite,oninput:function(e){setDraft.owners=e.target.value;}})]),
  el("label",{},["Target industries (comma-separated), adds 10 points to matching leads",el("input",{type:"text",value:setDraft.industries,placeholder:"e.g. Banking, Logistics, Healthcare, Retail",disabled:!canWrite,oninput:function(e){setDraft.industries=e.target.value;}})]),
  el("div",{},[el("p",{class:"muted",style:"margin:0 0 6px;font-size:13px",text:"Priority regions, worth 15 points instead of 10"}),pr]),
  canWrite?el("div",{class:"formbtns"},[el("button",{class:"p",text:"Save team and targets",onclick:function(){var o={owners:setDraft.owners.split(",").map(function(s){return s.trim();}).filter(Boolean),industries:setDraft.industries.split(",").map(function(s){return s.trim();}).filter(Boolean),priority:setDraft.priority.slice()};api("PUT","/api/settings/sales",o).then(function(s){salesSettings=s;setDraft=null;setStatus("Saved. Lead scores updated.");render();},function(e){setStatus("Couldn’t save: "+e.message);});}})]):null]);
}
function activityPanel(id){
 var l=data.leads.filter(function(x){return x.id===id;})[0];if(!l)return null;
 var acts=data.activities.filter(function(a){return a.leadId===id;}).sort(function(a,b){return (b.at||0)-(a.at||0);});
 var x=seqStep(l),note=el("input",{type:"text",placeholder:"Optional note, e.g. what they said","aria-label":"Activity note"});
 return el("div",{class:"panel"},[el("h3",{text:"Activity for "+l.company}),
  el("p",{class:"muted",style:"margin:0 0 10px;font-size:14px",text:"Status: "+leadStatus(l)+". Fit "+(l.score||0)+", engagement "+engagement(l)+"."+(x?" In “"+x.S.name+"”, next: "+x.st[1]+" on "+fd(x.due)+".":l.seq&&l.seq.done?" Sequence finished.":"")+(l.firstContact&&l.created?" First reply after "+Math.max(0,Math.round((l.firstContact-l.created)/36e5))+" hours.":"")}),
  canWrite?el("div",{class:"formbtns",style:"align-items:center"},[note].concat(Object.keys(ACT).map(function(k){return el("button",{class:"b",text:k,onclick:function(){logActivity(l,k,note.value);}});})).concat([!x?seqPicker(l):null])):null,
  acts.length?el("ul",{class:"att",style:"margin-top:10px"},acts.map(function(a){return el("li",{},[el("span",{},[el("b",{text:a.type}),a.note?" — "+a.note:""]),el("span",{class:"muted",text:fd(a.date)})]);})):el("p",{class:"empty",text:"No activity logged yet."})]);
}

/* ---------- Lead engine: prospects for reps, and the engine's settings ---------- */
var engineStatus=null,engineDraft=null,prospectOwner="All",prospectView="Suggested",engineRunning=false,pAccept={};
var SEQ_FOR_REGION={Gulf:"gulf",India:"gulf",US:"west",Europe:"west",Asia:"west"};
function loadEngine(){return api("GET","/api/engine").then(function(s){engineStatus=s;engineRunning=s.running;if(!engineDraft)engineDraft=JSON.parse(JSON.stringify({enabled:s.enabled,intervalMinutes:s.intervalMinutes,sources:s.sources,feeds:s.feeds,regionOwners:s.regionOwners,hunts:s.hunts}));render();}).catch(function(e){setStatus("Couldn’t load the lead engine: "+e.message);});}
function fmtTime(t){if(!t)return "never";var d=new Date(t);return d.getDate()+" "+MO[d.getMonth()]+", "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}
function runEngine(){engineRunning=true;render();api("POST","/api/engine/run").then(function(){setStatus("The engine is searching. New prospects appear here as soon as it finishes.");var poll=setInterval(function(){api("GET","/api/engine").then(function(s){engineStatus=s;if(!s.running){clearInterval(poll);engineRunning=false;var r=s.runs[0];setStatus(r?("Finished: "+r.added+" new prospect"+(r.added===1?"":"s")+(r.errors.length?", with "+r.errors.length+" problem"+(r.errors.length===1?"":"s")+" (see Engine runs)":"")+"."):"Finished.");render();}});},3000);}).catch(function(e){engineRunning=false;setStatus(e.message);render();});}
function prospectCard(p){
 var owners=salesSettings.owners||[],sig=(engineStatus&&engineStatus.signals&&engineStatus.signals[p.signalType])||p.signalType;
 if(!pAccept[p.id])pAccept[p.id]={seq:SEQ_FOR_REGION[p.region]||"",reason:"Not our ideal client"};
 var st=pAccept[p.id],host="";try{host=new URL(p.evidenceUrl).host.replace(/^www\./,"");}catch(e){}
 var acts=null;
 if(p.status==="Suggested"&&canWrite)acts=el("div",{class:"pacts"},[
  el("label",{class:"muted",style:"font-size:13px"},["Then ",el("select",{class:"sm",onchange:function(e){st.seq=e.target.value;}},[el("option",{value:"",text:"don’t start a sequence"})].concat(Object.keys(SEQ).map(function(k){return el("option",{value:k,selected:st.seq===k,text:"start "+SEQ[k].name});})))]),
  el("button",{class:"p",text:"Accept as lead",onclick:function(){api("POST","/api/prospects/"+p.id+"/accept",{sequence:st.seq||undefined}).then(function(r){setStatus(p.company+" is now a lead"+(st.seq?" and its sequence has started.":"."));},function(e){setStatus(e.message);});}}),
  el("span",{class:"sep"}),
  el("select",{class:"sm","aria-label":"Reason for rejecting "+p.company,onchange:function(e){st.reason=e.target.value;}},["Not our ideal client","Too small for us","Wrong region","Already working with a competitor","Not a real buying signal","Duplicate","Other"].map(function(r){return el("option",{value:r,selected:st.reason===r,text:r});})),
  el("button",{class:"b",text:"Reject",onclick:function(){api("POST","/api/prospects/"+p.id+"/reject",{reason:st.reason}).then(function(){setStatus("Rejected. The engine will avoid similar suggestions.");},function(e){setStatus(e.message);});}}),
  owners.length?el("select",{class:"sm","aria-label":"Assign "+p.company,onchange:function(e){api("POST","/api/prospects/"+p.id+"/assign",{owner:e.target.value});}},[el("option",{value:"",text:"Unassigned"})].concat(owners.map(function(o){return el("option",{value:o,selected:p.owner===o,text:"For "+o});}))):null]);
 return el("article",{class:"pcard"},[
  el("div",{class:"ohead"},[el("div",{},[el("b",{class:"pco",text:p.company}),el("div",{class:"muted",style:"font-size:13px",text:[p.industry,p.country||p.region,p.region!==p.country?p.region:""].filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;}).join(", ")})]),
   el("div",{class:"pbadges"},[el("span",{class:"pill sig",text:sig}),el("span",{class:"pill"+(p.score>=70?" good":""),title:p.scoreReasons||"",text:"Score "+p.score})])]),
  el("p",{class:"psum",text:p.summary}),
  p.whyNow?el("p",{class:"pwhy"},[el("b",{text:"Why now: "}),p.whyNow]):null,
  p.roles?el("p",{class:"muted",style:"font-size:13px;margin:4px 0 0",text:"Who to approach: "+p.roles+". Find the person through LinkedIn Sales Navigator or your licensed contact database."}):null,
  el("p",{class:"muted",style:"font-size:12px;margin:8px 0 0"},["Evidence: ",el("a",{href:p.evidenceUrl,target:"_blank",rel:"noopener noreferrer",text:host||"source"}),p.published?", "+String(p.published).replace(/ \d\d:\d\d:\d\d.*$/,""):"",". Found by “"+p.huntName+"” via "+p.source+" on "+fmtTime(p.foundAt)+(p.owner?", for "+p.owner:", unassigned")+"."]),
  p.status==="Rejected"?el("p",{class:"muted",style:"font-size:13px",text:"Rejected: "+(p.rejectReason||"")}):p.status==="Accepted"?el("p",{class:"good",style:"font-size:13px",text:"Accepted as a lead"}):null,
  acts]);
}
function engineTab(w){
 if(!engineStatus){w.appendChild(el("p",{class:"notice",text:"Loading the lead engine…"}));loadEngine();return;}
 var S=engineStatus,owners=salesSettings.owners||[];
 var mine=data.prospects.filter(function(p){return (prospectOwner==="All"||(prospectOwner==="Unassigned"?!p.owner:p.owner===prospectOwner));});
 var suggested=data.prospects.filter(function(p){return p.status==="Suggested";});
 var lastRun=S.runs[0];
 w.appendChild(el("div",{class:"goals"},[
  goalCard("Waiting for review",String(suggested.length),"Prospects the engine found that no rep has accepted or rejected yet",suggested.length?"":"ok"),
  goalCard("Engine",S.running||engineRunning?"Searching…":S.enabled?"On":"Off",S.enabled?("Runs every "+(S.intervalMinutes>=60?(S.intervalMinutes/60)+" hours":S.intervalMinutes+" minutes")+". Next: "+fmtTime(S.nextRunAt)):"Turn it on below to search automatically, or select Run now.",S.enabled?"ok":""),
  goalCard("Last run",lastRun?lastRun.added+" new":"None yet",lastRun?("Checked "+lastRun.found+", skipped "+lastRun.skipped+" already known or weak, "+fmtTime(lastRun.finishedAt)):"",lastRun&&lastRun.errors.length?"bad":"")]));
 var views=["Suggested","Accepted","Rejected"];
 w.appendChild(el("div",{class:"toolbar"},[
  el("div",{class:"chips",role:"group","aria-label":"Prospect status"},views.map(function(v){return el("button",{class:"chip","aria-pressed":String(prospectView===v),text:v+" ("+mine.filter(function(p){return p.status===v;}).length+")",onclick:function(){prospectView=v;render();}});})),
  el("div",{class:"formbtns",style:"align-items:center"},[owners.length?el("select",{class:"sm","aria-label":"Whose prospects",onchange:function(e){prospectOwner=e.target.value;render();}},["All","Unassigned"].concat(owners).map(function(o){return el("option",{value:o,selected:prospectOwner===o,text:o==="All"?"Everyone’s prospects":o==="Unassigned"?"Unassigned":"For "+o});})):null,
   canWrite?el("button",{class:"p",text:S.running||engineRunning?"Searching…":"Run now",disabled:S.running||engineRunning||!S.aiReady,onclick:runEngine}):null])]));
 if(!S.aiReady)w.appendChild(el("p",{class:"notice",text:"The lead engine needs an OpenRouter key. Add yours under My AI."}));
 var list=mine.filter(function(p){return p.status===prospectView;}).sort(function(a,b){return prospectView==="Suggested"?(b.score||0)-(a.score||0):(b.foundAt||"").localeCompare(a.foundAt||"");});
 var inbox=el("div",{},list.length?list.slice(0,60).map(prospectCard):[el("div",{class:"panel"},[el("p",{class:"empty",text:prospectView==="Suggested"?(data.prospects.length?"Nothing waiting. The engine will add new prospects on its next run.":"No prospects yet. Check the hunts and sources on the right, then select Run now."):"None yet."})])]);
 w.appendChild(el("div",{class:"grid2"},[inbox,el("div",{},[engineSettings(),engineRuns()])]));
}
function engineSettings(){
 var S=engineStatus,D=engineDraft,owners=salesSettings.owners||[];
 function huntEditor(h,i){
  return el("div",{class:"hunt"},[
   el("div",{class:"hrow"},[el("label",{class:"chk"},[el("input",{type:"checkbox",checked:h.active,disabled:!canWrite,onchange:function(e){h.active=e.target.checked;}})," Active"]),el("button",{class:"link",text:"Remove",onclick:function(){D.hunts.splice(i,1);render();}})]),
   el("label",{},["Name",el("input",{type:"text",value:h.name,oninput:function(e){h.name=e.target.value;}})]),
   el("label",{},["What to look for (use OR between ideas)",el("input",{type:"text",value:h.query,oninput:function(e){h.query=e.target.value;}})]),
   el("div",{class:"chips",style:"margin:6px 0"},REG.map(function(r){return el("button",{class:"chip","aria-pressed":String(h.regions.indexOf(r)>=0),text:r,onclick:function(){var k=h.regions.indexOf(r);if(k>=0)h.regions.splice(k,1);else h.regions.push(r);render();}});})),
   el("label",{},["Department it’s for",el("select",{onchange:function(e){h.interest=e.target.value;}},SVC.map(function(s){return el("option",{value:s,selected:h.interest===s,text:s});}))])]);
 }
 var srcRow=function(k,label,ready,help){return el("label",{class:"chk",style:"margin:4px 0"},[el("input",{type:"checkbox",checked:!!D.sources[k],disabled:!canWrite,onchange:function(e){D.sources[k]=e.target.checked;}})," ",el("span",{},[el("b",{text:label}),el("span",{class:"muted",style:"font-size:13px",text:" "+help+(D.sources[k]&&!ready?" Not ready yet.":"")})])]);};
 return el("details",{class:"panel guide",open:!data.prospects.length},[
  el("summary",{},[el("h3",{text:"Engine settings"})]),
  el("p",{class:"muted",text:"The engine searches for companies with a reason to buy now: a tender, an AI or digital programme, new funding, expansion, tech hiring or new regulation. AI reads each item, keeps only real signals in your regions, drops companies you already know, scores what’s left and sends it to the right rep. Nothing becomes a lead until a rep accepts it. It finds companies, not people’s personal details."}),
  el("div",{class:"fgrid",style:"grid-template-columns:1fr 1fr"},[
   el("label",{class:"chk"},[el("input",{type:"checkbox",checked:D.enabled,disabled:!canWrite,onchange:function(e){D.enabled=e.target.checked;}})," Search automatically"]),
   el("label",{},["Every",el("select",{onchange:function(e){D.intervalMinutes=Number(e.target.value);}},[[60,"hour"],[180,"3 hours"],[360,"6 hours"],[720,"12 hours"],[1440,"day"]].map(function(o){return el("option",{value:o[0],selected:D.intervalMinutes===o[0],text:o[1]});}))])]),
  el("h4",{text:"Sources"}),
  srcRow("web","Web search through OpenRouter.","Uses your OpenRouter key; each search costs a little extra on your OpenRouter bill.",S.sourcesReady.web||(S.aiReady&&D.sources.web)),
  srcRow("brave","Brave News Search.",S.braveKeySet?"Key is set.":"Needs BRAVE_SEARCH_API_KEY on the server.",S.braveKeySet),
  srcRow("rss","RSS feeds you choose.","Industry news sites, tender portals and press-release feeds.",D.feeds.length>0),
  el("label",{style:"display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);margin-top:6px"},["RSS feed addresses, one per line",el("textarea",{rows:"3",oninput:function(e){D.feeds=e.target.value.split(/\n+/).map(function(s){return s.trim();}).filter(Boolean);}},[D.feeds.join("\n")])]),
  owners.length?el("h4",{text:"Who gets each region’s prospects"}):null,
  owners.length?el("div",{class:"fgrid",style:"grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"},REG.map(function(r){return el("label",{},[r,el("select",{onchange:function(e){if(e.target.value)D.regionOwners[r]=e.target.value;else delete D.regionOwners[r];}},[el("option",{value:"",text:"Share between reps"})].concat(owners.map(function(o){return el("option",{value:o,selected:D.regionOwners[r]===o,text:o});})))]);})):el("p",{class:"muted",style:"font-size:13px",text:"Add your sales team under Outreach, Team and targets, to route prospects to reps."}),
  el("h4",{text:"Hunts: what the engine looks for"}),
  el("div",{},D.hunts.map(huntEditor)),
  canWrite?el("div",{class:"formbtns",style:"margin-top:10px"},[
   el("button",{class:"b",text:"Add hunt",onclick:function(){D.hunts.push({id:"hunt-"+Date.now().toString(36),name:"New hunt",query:"",regions:["Gulf"],interest:"Applied AI",active:true});render();}}),
   el("button",{class:"p",text:"Save engine settings",onclick:function(){api("PUT","/api/engine",D).then(function(s){engineStatus=s;engineDraft=null;loadEngine();setStatus("Engine settings saved.");},function(e){setStatus("Couldn’t save: "+e.message);});}})]):null]);
}
function engineRuns(){
 var runs=(engineStatus.runs||[]).slice(0,10);
 return el("details",{class:"panel guide"},[el("summary",{},[el("h3",{text:"Engine runs"})]),
  runs.length?el("ul",{class:"att"},runs.map(function(r){return el("li",{},[el("span",{},[el("b",{text:fmtTime(r.finishedAt||r.startedAt)+" "}),r.trigger==="schedule"?"(automatic) ":"(manual) ","checked "+r.found+", added "+r.added+", skipped "+r.skipped,r.errors.length?el("div",{class:"warn",style:"font-size:12px",text:r.errors.slice(0,3).join(" | ")}):null])]);})):el("p",{class:"empty",text:"No runs yet."})]);
}

/* ---------- My AI: each rep's own OpenRouter key and model choices ---------- */
var myAi=null,myMe=null,aiModels=null,aiModelsErr="",myKeyInput="",myModelDraft=null,myAiMsg="",myAiTesting="";
function loadMyAi(){Promise.all([api("GET","/api/ai/settings"),api("GET","/api/me")]).then(function(r){myAi=r[0];myMe=r[1];if(!myModelDraft)myModelDraft={model:myAi.model||"",researchModel:myAi.researchModel||""};render();}).catch(function(e){myAiMsg="Couldn’t load your AI settings: "+e.message;render();});
 if(!aiModels&&!aiModelsErr)api("GET","/api/ai/models").then(function(m){aiModels=m;render();}).catch(function(e){aiModelsErr=e.message;render();});}
function refreshAiStatus(){api("GET","/api/ai/status").then(function(s){aiStatus=s;}).catch(function(){});if(typeof engineStatus!=="undefined"&&engineStatus)api("GET","/api/engine").then(function(s){engineStatus=s;}).catch(function(){});}
function modelInfo(id){if(!aiModels||!id)return null;return aiModels.filter(function(m){return m.id===id;})[0]||null;}
function priceText(m){if(!m)return "";var p=[];if(m.promptPrice!==null)p.push("$"+m.promptPrice+" per million tokens in");if(m.completionPrice!==null)p.push("$"+m.completionPrice+" out");return m.name+(p.length?", "+p.join(", "):"")+(m.context?", "+Math.round(m.context/1000)+"k context":"");}
function testModel(which){myAiTesting=which;myAiMsg="Testing…";render();api("POST","/api/ai/test",{which:which}).then(function(r){myAiTesting="";myAiMsg="It works: "+r.model+" answered using "+(r.keySource==="yours"?"your key":"the company key")+".";render();},function(e){myAiTesting="";myAiMsg=e.message;render();});}
function myAiTab(w){
 if(!myAi){w.appendChild(el("p",{class:"notice",text:myAiMsg||"Loading your AI settings…"}));if(!myAiMsg)loadMyAi();return;}
 var A=myAi,D=myModelDraft;
 var who=myMe&&myMe.signIn?"Signed in as "+myMe.user+". These settings are yours only.":"This app has no sign-in set up, so these settings apply to everyone using it. Ask your administrator to add APP_USERS so each rep has their own.";
 var keyState=A.hasKey?"Your key ending "+A.keyHint+" is saved.":A.companyKeySet?"You haven’t added a key, so the company key is used.":"No key yet. Add yours to use Draft with AI and the lead engine.";
 var keyIn=el("input",{type:"password",autocomplete:"off",spellcheck:"false",placeholder:"sk-or-…","aria-label":"Your OpenRouter key",value:myKeyInput,oninput:function(e){myKeyInput=e.target.value;}});
 var list=aiModels?el("datalist",{id:"or-models"},aiModels.map(function(m){return el("option",{value:m.id,label:priceText(m)});})):null;
 function modelField(k,label,help){var info=modelInfo(D[k]);return el("label",{class:"mfield"},[el("span",{class:"mlabel",text:label}),el("input",{type:"text",list:"or-models",value:D[k],placeholder:A.companyModel?"Company default: "+A.companyModel:"provider/model-name",autocomplete:"off",spellcheck:"false",oninput:function(e){D[k]=e.target.value.trim();}}),el("span",{class:"muted",style:"font-size:12px",text:info?priceText(info):help})]);}
 w.appendChild(el("p",{class:"sub",style:"margin:0 0 16px",text:who}));
 w.appendChild(el("div",{class:"grid2"},[
  el("div",{},[
   el("div",{class:"panel"},[el("h3",{text:"Your OpenRouter key"}),
    el("p",{class:"muted",style:"margin:0 0 10px;font-size:14px",text:keyState}),
    A.allowUserKeys?el("div",{class:"formbtns",style:"align-items:center"},[keyIn,el("button",{class:"p",text:A.hasKey?"Replace key":"Save key",onclick:function(){if(!myKeyInput.trim()){myAiMsg="Paste your key first.";render();return;}api("PUT","/api/ai/settings",{apiKey:myKeyInput.trim()}).then(function(r){myKeyInput="";myAi.hasKey=r.hasKey;myAi.keyHint=r.keyHint;myAiMsg="Key saved. Select Test to check it works.";refreshAiStatus();render();},function(e){myAiMsg=e.message;render();});}}),
     A.hasKey?el("button",{class:"b",text:"Remove my key",onclick:function(){if(!confirm("Remove your OpenRouter key from MindSuite?"))return;api("PUT","/api/ai/settings",{apiKey:null}).then(function(){myAi.hasKey=false;myAi.keyHint=null;myAiMsg="Your key was removed.";refreshAiStatus();render();});}}):null]):el("p",{class:"muted",text:"Personal keys are turned off on this server; the company key is used."}),
    el("ul",{class:"steps",style:"margin-top:12px;font-size:13px;color:var(--muted)"},[
     el("li",{text:"Get a key at openrouter.ai: sign in, add credit, then create a key under Keys. Set a monthly spending limit on it."}),
     el("li",{text:"Your key is encrypted on the MindSuite server and never shown again in full, not even to you. Nobody else’s requests use it."}),
     el("li",{text:"What you use is billed to your OpenRouter account. Never paste the key into chat, email or documents."})])]),
   myAiMsg?el("p",{class:"notice",role:"status",text:myAiMsg}):null]),
  el("div",{},[el("div",{class:"panel"},[el("h3",{text:"Your models"}),
   el("p",{class:"muted",style:"margin:0 0 10px;font-size:14px",text:"Start typing a model’s name or ID and pick from OpenRouter’s list, or paste an ID from openrouter.ai/models. Leave a box empty to use the company default."}),
   list,aiModelsErr?el("p",{class:"warn",style:"font-size:13px",text:aiModelsErr}):!aiModels?el("p",{class:"muted",style:"font-size:13px",text:"Loading OpenRouter’s model list…"}):null,
   modelField("model","For writing messages (Draft with AI in Outreach)","Used for emails, LinkedIn messages and call notes."),
   modelField("researchModel","For research (Run now in the Lead engine)","Used to search and judge news. Leave empty to use your writing model."),
   el("div",{class:"formbtns",style:"margin-top:12px"},[
    el("button",{class:"p",text:"Save models",onclick:function(){api("PUT","/api/ai/settings",{model:D.model,researchModel:D.researchModel}).then(function(r){myAi.model=r.model;myAi.researchModel=r.researchModel;myAiMsg="Models saved.";refreshAiStatus();render();},function(e){myAiMsg=e.message;render();});}}),
    el("button",{class:"b",text:myAiTesting==="writing"?"Testing…":"Test writing model",disabled:!!myAiTesting,onclick:function(){testModel("writing");}}),
    el("button",{class:"b",text:myAiTesting==="research"?"Testing…":"Test research model",disabled:!!myAiTesting,onclick:function(){testModel("research");}})]),
   el("p",{class:"muted",style:"font-size:12px;margin:10px 0 0",text:"Save before testing. A test sends one tiny request, which costs a fraction of a cent. Automatic lead engine runs use the company key."})])])]));
}

function leadGuide(){
 var src=[["Outbound","Sales","Personal LinkedIn and email messages to the target lists for each region. Appointment setters book the calls.","~80"],
  ["Events","CEO and Marketing","LEAP, London Tech Week and GITEX. Log every conversation worth a follow-up the same day.","~35"],
  ["Referrals","CEO and account owners","Introductions from happy clients, and new needs raised in quarterly business reviews.","~30"],
  ["Partners","Department heads","AWS and Azure marketplaces, the ERP and cyber partner firms, and European consultancies.","~25"],
  ["Webinars","Marketing","Attendees who ask a question or request a follow-up.","~25"],
  ["Inbound","Marketing","Website enquiries and bookings, LinkedIn messages and Clutch.","~25"]];
 var tbl=el("table",{},[el("thead",{},[el("tr",{},[el("th",{text:"Source"}),el("th",{text:"Who brings it in"}),el("th",{text:"What counts"}),el("th",{class:"n",text:"A year"})])]),
  el("tbody",{},src.map(function(s){return el("tr",{},[el("td",{},[el("b",{text:s[0]})]),el("td",{text:s[1]}),el("td",{text:s[2]}),el("td",{class:"n",text:s[3]})]);}))]);
 function ol(items){return el("ol",{class:"steps"},items.map(function(t){return el("li",{text:t});}));}
 function ul(items){return el("ul",{class:"steps"},items.map(function(t){return el("li",{text:t});}));}
 return el("details",{class:"panel guide",open:data.leads.length<5},[
  el("summary",{},[el("h3",{text:"How the sales team creates leads"})]),
  el("p",{class:"muted",text:"Every lead goes into this list on the day it arrives. That’s how the scorecard counts leads, works out cost per meeting, and shows which sources and regions turn into deals. The year 1 goal is about 220 leads."}),
  el("h4",{text:"Where leads come from"}),el("div",{class:"scroll"},[tbl]),
  el("div",{class:"guidecols"},[
   el("div",{},[el("h4",{text:"Adding a lead"}),ol([
    "Filter by region and check the company isn’t already in the list.",
    "Select Add lead. Enter the company, the contact’s name and job title, the region, the source and the date it arrived.",
    "Reply to the lead within 24 hours.",
    "Tick Qualified once it passes the check on the right.",
    "Tick Meeting when a discovery call is booked.",
    "Select Create deal. The lead moves to the Pipeline as a Qualified deal. Open it there and add the value, department, next step and date."])]),
   el("div",{},[el("h4",{text:"A lead is qualified when"}),ul([
    "It fits the target profile: the right industry and company size, in India, the Gulf, the US, Europe or Asia.",
    "It has a real problem that one of our services solves.",
    "You can reach the person who decides on, or controls, the budget.",
    "They want to start within the next 6 months."]),
    el("h4",{text:"If it doesn’t qualify"}),el("p",{class:"muted",text:"Leave it in the list with Qualified unticked. Don’t delete it: it still counts towards measuring which sources work. Revisit it after 90 days."}),
    el("h4",{text:"Every week"}),ul(["Thursday: Marketing hands qualified leads to Sales.","Friday: lead, meeting and cost-per-meeting numbers for each region go into the scorecard."])])])
 ]);
}
function leadIntegrations(){
 var o=location.origin;
 function code(t){return el("pre",{class:"code"},[el("code",{text:t})]);}
 return el("details",{class:"panel guide"},[
  el("summary",{},[el("h3",{text:"Lead generation API: bring leads in automatically"})]),
  el("p",{class:"muted",text:"Leads from these routes appear in this list on their own, scored from 0 to 100 against the ideal client profile, with the region worked out from the country or phone number and duplicates merged. A score of 60 or more shows “check”: confirm it and tick Qualified."}),
  el("h4",{text:"1. Website enquiry form"}),
  el("p",{class:"muted",text:"Paste this where the form should appear on mindsuite.in, and add the website’s address to LEAD_FORM_ORIGINS on the server. A ready-made page is also at "+o+"/forms/contact (add ?source=LinkedIn to links you share on LinkedIn)."}),
  code('<div data-mindsuite-lead-form data-source="Website" data-interest="Applied AI"></div>\n<script src="'+o+'/embed/lead-form.js" async></script>'),
  el("h4",{text:"2. Other tools (Zapier, Make, LinkedIn lead forms, event apps, partners)"}),
  el("p",{class:"muted",text:"Send each lead as JSON with the X-API-Key header. Keys are set in LEAD_API_KEYS. For booked meetings, send to /api/webhooks/meetings with the person’s email."}),
  code('POST '+o+'/api/webhooks/leads\nX-API-Key: your-key\nContent-Type: application/json\n\n{"name":"Aisha Khan","email":"aisha@gulfbank.ae","company":"Gulf Bank",\n "title":"Head of Digital","country":"AE","interest":"Applied AI","source":"LinkedIn"}'),
  el("h4",{text:"3. Lists from events and outbound research"}),
  el("p",{class:"muted",text:"Upload a CSV with a header row. Columns you can use: company, contact, title, email, phone, country, region, source, interest, timeline, employees, message, notes."}),
  code('curl -u user:password -H "Content-Type: text/csv" --data-binary @gitex-contacts.csv \\\n  "'+o+'/api/leads/import?source=Event"'),
  el("div",{class:"formbtns",style:"margin-top:12px"},[el("a",{class:"b",href:o+"/api/leads/export.csv",text:"Download all leads (CSV)"}),el("a",{class:"b",href:o+"/api/leads/openapi.json",target:"_blank",rel:"noopener",text:"API reference (OpenAPI)"})])
 ]);
}
var leadView="Open",leadOwner="All",leadSort="Newest";
function leads(w){
 w.appendChild(el("div",{class:"toolbar"},[el("div",{class:"chips",role:"group","aria-label":"Region"},["All"].concat(REG).map(function(r){return el("button",{class:"chip","aria-pressed":String(leadReg===r),text:r,onclick:function(){leadReg=r;render();}});})),el("div",{class:"formbtns"},[addBtn("spend","Add spend"),addBtn("leads","Add lead")])]));
 if(edit&&edit.c==="leads"&&edit.id){var ap=activityPanel(edit.id);if(ap)w.appendChild(ap);}
 w.appendChild(leadGuide());
 w.appendChild(leadIntegrations());
 var VIEWS={"Open":function(l){return OPEN_LSTAT.indexOf(leadStatus(l))>=0;},"Hot":function(l){return (l.score||0)>=60&&OPEN_LSTAT.indexOf(leadStatus(l))>=0;},"Needs first reply":function(l){return leadStatus(l)==="New";},"In a sequence":function(l){return !!seqStep(l);},"Meetings":function(l){return leadStatus(l)==="Meeting booked";},"Converted":function(l){return leadStatus(l)==="Converted";},"Disqualified":function(l){return leadStatus(l)==="Disqualified";},"All":function(){return true;}};
 var owners=salesSettings.owners||[];
 var list=data.leads.filter(function(l){return (leadReg==="All"||l.region===leadReg)&&VIEWS[leadView](l)&&(leadOwner==="All"||(leadOwner==="Unassigned"?!l.owner:l.owner===leadOwner));});
 list.sort(leadSort==="Highest score"?function(a,b){return (b.score||0)+engagement(b)-((a.score||0)+engagement(a));}:leadSort==="Oldest first"?function(a,b){return (a.created||0)-(b.created||0);}:function(a,b){return (b.date||"").localeCompare(a.date||"")||(b.created||0)-(a.created||0);});
 var bar2=el("div",{class:"toolbar",style:"margin-top:4px"},[el("div",{class:"chips",role:"group","aria-label":"View"},Object.keys(VIEWS).map(function(v){var n=data.leads.filter(function(l){return (leadReg==="All"||l.region===leadReg)&&VIEWS[v](l);}).length;return el("button",{class:"chip","aria-pressed":String(leadView===v),text:v+" ("+n+")",onclick:function(){leadView=v;render();}});})),
  el("div",{class:"formbtns",style:"align-items:center"},[owners.length?el("select",{class:"sm","aria-label":"Owner",onchange:function(e){leadOwner=e.target.value;render();}},["All","Unassigned"].concat(owners).map(function(o){return el("option",{value:o,selected:leadOwner===o,text:o==="All"?"All owners":o});})):null,el("select",{class:"sm","aria-label":"Sort",onchange:function(e){leadSort=e.target.value;render();}},["Newest","Highest score","Oldest first"].map(function(o){return el("option",{value:o,selected:leadSort===o,text:"Sort: "+o});}))])]);
 var body=list.map(function(l){
  var st=leadStatus(l),eng=engagement(l),x=seqStep(l),hrs=l.created?(Date.now()-l.created)/36e5:0;
  var speed=st==="New"?(hrs>=24?el("span",{class:"pill warn",text:"Reply overdue"}):el("span",{class:"pill",text:"Reply in "+Math.max(1,Math.ceil(24-hrs))+"h"})):null;
  var statusSel=canWrite?el("select",{class:"sm","aria-label":"Status of "+l.company,onchange:function(e){var v=e.target.value;if(v==="Disqualified"){var r0=withStatus(l,"Disqualified");if(!r0.disqualReason)r0.disqualReason=DQ[0];openForm("leads",r0);return;}save("leads",withStatus(l,v));}},LSTAT.map(function(s){return el("option",{value:s,selected:st===s,text:s});})):el("span",{text:st});
  return el("tr",{},[
   el("td",{},[fd(l.date),speed?el("div",{style:"margin-top:4px"},[speed]):null]),
   el("td",{},[el("b",{text:l.company}),(l.contact||l.title)?el("div",{class:"muted",style:"font-size:12px",text:[l.contact,l.title].filter(Boolean).join(", ")}):null,l.email?el("div",{class:"muted",style:"font-size:12px",text:l.email}):null,l.industry?el("div",{class:"muted",style:"font-size:12px",text:l.industry}):null]),
   el("td",{text:l.region}),el("td",{text:l.source}),
   el("td",{},[typeof l.score==="number"?el("span",{class:"pill"+(l.score>=60?" good":""),title:(l.scoreReasons||"")+(eng?"; engagement +"+eng:""),text:"Fit "+l.score+(eng?", +"+eng:"")+(l.suggestedQualified&&OPEN_LSTAT.indexOf(st)>=0&&st!=="Qualified"?", check":"")}):el("span",{class:"muted",text:"–"})]),
   el("td",{},[statusSel,st==="Disqualified"&&l.disqualReason?el("div",{class:"muted",style:"font-size:12px",text:l.disqualReason}):null,x?el("div",{class:"muted",style:"font-size:12px",text:x.S.name.split(":")[0]+", step "+(x.n+1)+"/"+x.S.steps.length}):null]),
   el("td",{text:l.owner||"–"}),
   el("td",{},[canWrite&&!x&&OPEN_LSTAT.indexOf(st)>=0?seqPicker(l):null,canWrite&&(st==="Qualified"||st==="Meeting booked")&&!l.dealId?el("button",{class:"b",text:"Create deal",onclick:function(){save("deals",{company:l.company,contact:l.contact||"",region:l.region,service:SVC.indexOf(l.interest)>=0?l.interest:"Product Engineering",value:0,stage:"Qualified",source:l.source,nextStep:"Discovery meeting",nextDate:iso(today())}).then(function(id){var r=withStatus(l,"Converted");r.dealId=id||"yes";save("leads",r);tab="pipeline";render();});}}):l.dealId?el("span",{class:"pill good",text:"In pipeline"}):null," ",canWrite?el("button",{class:"link",text:"Open",onclick:function(){openForm("leads",l);window.scrollTo(0,0);}}):null])]);
 });
 var sp=data.spend.slice().sort(cmpDate("month"));
 var spBody=sp.map(function(s){var d=pd(s.month);return el("tr",{},[el("td",{text:d?MO[d.getMonth()]+" "+d.getFullYear():""}),el("td",{text:s.region}),el("td",{text:s.channel}),el("td",{class:"n",text:money(s.amount)}),el("td",{},[canWrite?el("button",{class:"link",text:"Edit",onclick:function(){openForm("spend",s);}}):null])]);});
 w.appendChild(el("div",{},[
  el("div",{class:"panel"},[el("h3",{text:"Leads"+(leadReg==="All"?"":", "+leadReg)+", "+leadView.toLowerCase()+" ("+list.length+")"}),bar2,list.length?el("div",{class:"scroll"},[el("table",{},[el("thead",{},[el("tr",{},["Received","Company","Region","Source","Score","Status","Owner",""].map(function(h){return el("th",{text:h});}))]),el("tbody",{},body)])]):el("p",{class:"empty",text:data.leads.length?"No leads in this view.":"Log every lead the day it arrives, with its region and source, so cost per meeting can be worked out."})]),
  el("div",{class:"panel"},[el("h3",{text:"Marketing spend"}),sp.length?el("div",{class:"scroll"},[el("table",{},[el("thead",{},[el("tr",{},["Month","Region","Channel","Amount",""].map(function(h,i){return el("th",{class:i===3?"n":null,text:h});}))]),el("tbody",{},spBody)])]):el("p",{class:"empty",text:"Add spend by month, region and channel: events, agencies, tools and ads."})])]));
}

function render(){
 root.innerHTML="";
 var w=el("div",{class:"wrap"});root.appendChild(w);
 var pdn=planDay();
 w.appendChild(el("header",{class:"top"},[el("div",{},[el("h1",{text:"Sales and marketing toolkit"}),el("p",{class:"sub",text:"Pipeline, proposals, paid assessments, leads and spend in one place, measured against this year’s sales goals."})]),
  el("div",{class:"clock"},[el("b",{text:pdn<1?"Plan starts "+fd(START):pdn>365?"Plan year complete":"Day "+pdn+" of 365"}),el("span",{text:"Day 90 pipeline deadline: "+fd(DAY90)})])]));
 if(mode==="loading")w.appendChild(el("p",{class:"notice",text:"Loading your team’s data…"}));
 if(mode==="error")w.appendChild(el("p",{class:"notice",text:"Couldn’t load data from the server ("+loadErr+"). Check the server is running and refresh."}));
 var tabs=el("div",{class:"tabs",role:"tablist"});
 TABS.forEach(function(t){tabs.appendChild(el("button",{role:"tab","aria-selected":String(tab===t[0]),text:t[1],onclick:function(){tab=t[0];edit=null;render();}}));});
 w.appendChild(tabs);
 var formColl={pipeline:["deals"],proposals:["proposals"],assessments:["assessments"],leads:["leads","spend"],outreach:["leads"],engine:[],myai:[],scorecard:["deals","proposals","assessments","leads"]}[tab];
 if(edit&&formColl.indexOf(edit.c)>=0)w.appendChild(form(edit.c));
 ({scorecard:scorecard,pipeline:pipeline,proposals:proposals,assessments:assessments,leads:leads,outreach:outreach,engine:engineTab,myai:myAiTab})[tab](w);
 w.appendChild(el("div",{class:"status",role:"status",text:status}));
}
render();
})();
