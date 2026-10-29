(function(){
"use strict";
function boot(DATA,ST,KIT){
ST.done=ST.done||{};
var OWN=["CEO","Sales","Marketing","Delivery","HR","Finance"];
var WD=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
var MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var MOL=["January","February","March","April","May","June","July","August","September","October","November","December"];
var DEPS=DATA.deps;
var scope="all",period="week",filt="All",status="",lastDay=null,findQ="";
function pd(s){var a=s.split("-");return new Date(+a[0],+a[1]-1,+a[2]);}
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function dateOf(n){var d=pd(ST.start);d.setDate(d.getDate()+n-1);return d;}
function dayN(date){return Math.round((date-pd(ST.start))/864e5)+1;}
function fmt(d){return d.getDate()+" "+MO[d.getMonth()];}
function todayN(){var t=new Date();t.setHours(0,0,0,0);return dayN(t);}
function clampN(n){return Math.min(365,Math.max(1,n));}
function items(day){var a=[];if(day.min)a.push({id:day.d+"-m",o:"Everyone",t:"Daily minimums done (see list)"});day.t.forEach(function(x,i){a.push({id:day.d+"-"+i,o:x[0],t:x[1],dep:x[2]});});(day.s||[]).forEach(function(x,i){a.push({id:day.d+"-s"+i,o:x[0],t:x[1],s:1,dep:x[2]});});return a;}
function inScope(x){return scope==="all"||x.dep===scope;}
function vis(x){return inScope(x)&&(filt==="All"||(filt==="Stretch"?x.s:x.o===filt));}
function isDone(x){return !!ST.done[x.id];}
var TOTAL=0;DATA.days.forEach(function(d){TOTAL+=items(d).length;});
var tn=todayN(),cur=clampN(tn);
var root=document.getElementById("root");
function el(tag,attrs,kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){if(k==="text")e.textContent=attrs[k];else if(k==="html")e.innerHTML=attrs[k];else if(k.slice(0,2)==="on")e.addEventListener(k.slice(2),attrs[k]);else e.setAttribute(k,attrs[k]);}(kids||[]).forEach(function(c){if(c)e.appendChild(typeof c==="string"?document.createTextNode(c):c);});return e;}
function chip(label,on,fn){return el("button",{class:"chip","aria-pressed":String(!!on),text:label,onclick:fn});}
function bar(c,n){var b=el("div",{class:"bar"});var s=el("span",{});s.style.width=(n?Math.round(c/n*100):0)+"%";b.appendChild(s);return b;}
function weekRange(n){var w=Math.ceil(n/7);return [(w-1)*7+1,Math.min(w*7,365)];}
function monthRange(n){var dt=dateOf(n);return [Math.max(1,dayN(new Date(dt.getFullYear(),dt.getMonth(),1))),Math.min(365,dayN(new Date(dt.getFullYear(),dt.getMonth()+1,0)))];}
function range(){if(period==="day")return [cur,cur];if(period==="week")return weekRange(cur);if(period==="month")return monthRange(cur);return [1,365];}
function planMonth(n){var w=Math.ceil(n/7);return DATA.months.filter(function(m){return w>=m.weeks[0]&&w<=m.weeks[1];})[0];}
function scopeName(){if(scope==="all")return "Director view";return DEPS.filter(function(d){return d.id===scope;})[0].name;}
function depStats(id){var n=0,c=0,od=0;DATA.days.forEach(function(d){items(d).forEach(function(x){if(x.dep!==id)return;n++;if(isDone(x))c++;else if(d.d<tn)od++;});});return {n:n,c:c,od:od};}
function overdueList(){var out=[];DATA.days.forEach(function(d){if(d.d>=tn)return;items(d).forEach(function(x){if(vis(x)&&!isDone(x))out.push({x:x,d:d});});});return out;}
function taskRow(x,d,withDate){
 var cb=el("input",{type:"checkbox",id:"t"+x.id});cb.checked=isDone(x);
 cb.addEventListener("change",function(){var on=cb.checked;if(on)ST.done[x.id]=1;else delete ST.done[x.id];lastDay=d.d;rerender();setStatus("Saving…");api("PUT","/api/tasks/"+encodeURIComponent(x.id),{done:on}).then(saved,failed);});
 var lb=el("label",{for:"t"+x.id,text:x.t});
 if(withDate)lb.appendChild(el("small",{text:"Day "+d.d+", "+WD[d.wd]+" "+fmt(dateOf(d.d))}));
 else if(scope==="all"&&x.dep)lb.appendChild(el("small",{"data-dept":x.dep,text:DEPS.filter(function(D){return D.id===x.dep;})[0].name}));
 return el("li",{class:(isDone(x)?"done":"")+(x.s?" st":"")},[cb,lb,x.s?el("span",{class:"stag",text:"Stretch"}):null,el("span",{class:"own",text:x.o})]);
}
function dayCard(d){
 var its=items(d).filter(vis),ul=el("ul",{class:"tasks"});
 its.forEach(function(x){ul.appendChild(taskRow(x,d,false));});
 var dt=dateOf(d.d);
 var num=el("button",{class:"dnum",title:"Open this day",onclick:function(){cur=d.d;period="day";render();window.scrollTo(0,0);}},[el("b",{text:"Day "+d.d}),el("span",{text:WD[d.wd]+" "+fmt(dt)+" "+dt.getFullYear()})]);
 if(d.d===tn)num.appendChild(el("em",{text:"Today"}));
 return el("article",{class:"day"+(d.d===tn?" istoday":"")+(d.wd===6?" rest":""),id:"day"+d.d},[num,its.length?ul:el("div",{class:"none",text:"Nothing scheduled here for this view."})]);
}
function calendar(r){
 var dt=dateOf(r[0]),y=dt.getFullYear(),m=dt.getMonth();
 var off=(new Date(y,m,1).getDay()+6)%7,len=new Date(y,m+1,0).getDate();
 var g=el("div",{class:"cal",role:"grid","aria-label":MOL[m]+" "+y});
 WD.forEach(function(h){g.appendChild(el("div",{class:"calh",text:h}));});
 for(var i=0;i<off;i++)g.appendChild(el("div",{class:"calc out"}));
 var list=[];for(var k=1;k<=len;k++)list.push(k);
 list.forEach(function(dd){
  var n=dayN(new Date(y,m,dd));
  if(n<1||n>365){g.appendChild(el("div",{class:"calc out"},[el("span",{class:"cd",text:String(dd)})]));return;}
  var day=DATA.days[n-1],its=items(day).filter(vis),c=its.filter(isDone).length;
  var sn=el("ul",{class:"sn"});its.slice(0,2).forEach(function(x){sn.appendChild(el("li",{class:isDone(x)?"done":"",text:x.t}));});
  if(its.length>2)sn.appendChild(el("li",{class:"more",text:"+"+(its.length-2)+" more"}));
  g.appendChild(el("button",{class:"calc"+(n===tn?" today":"")+(its.length&&c===its.length?" full":"")+(n===lastDay?" last":""),"aria-label":"Day "+n+", "+dd+" "+MOL[m]+", "+c+" of "+its.length+" done",onclick:function(){cur=n;period="day";render();window.scrollTo(0,0);}},[
   el("span",{class:"cd"},[String(dd),el("small",{text:"Day "+n})]),
   its.length?el("span",{class:"cc",text:c+" of "+its.length}):el("span",{class:"cc",text:"No tasks"}),
   its.length?bar(c,its.length):null,its.length?sn:null]));
 });
 var tail=(7-((off+len)%7))%7;for(var j=0;j<tail;j++)g.appendChild(el("div",{class:"calc out"}));
 return el("div",{class:"calwrap"},[g]);
}
function render(scrollDay){
 tn=todayN();
 var doneN=0;for(var k in ST.done)if(ST.done[k])doneN++;
 root.innerHTML="";
 var w=el("div",{class:"wrap"});root.appendChild(w);
 var dayLabel=tn<1?"Starts in "+(1-tn)+(1-tn===1?" day":" days"):tn>365?"Plan complete":"Day "+tn;
 var startInput=el("input",{type:"date",value:ST.start,"aria-label":"Plan start date",onchange:function(e){if(!e.target.value)return;var d=pd(e.target.value);d.setDate(d.getDate()-(d.getDay()+6)%7);ST.start=iso(d);rerender();setStatus("Saving…");api("PUT","/api/state/start",{start:ST.start}).then(saved,failed);}});
 w.appendChild(el("header",{class:"top"},[
  el("div",{},[el("h1",{text:"365 days to a ₹10 Cr run rate"}),el("p",{class:"sub",text:"MindSuite’s operating plan, from about ₹5 Cr today. Switch between the director’s view of the whole company and each department’s own calendar, by day, week, month or the full year."})]),
  el("div",{class:"stats"},[
   el("div",{class:"stat"},[el("b",{text:dayLabel}),el("span",{text:"of 365"})]),
   el("div",{class:"stat"},[el("b",{text:Math.round(doneN/TOTAL*100)+"%"}),el("span",{text:doneN+" of "+TOTAL+" tasks"})]),
   el("label",{class:"start"},["Day 1 (a Monday)",startInput])])]));
 var sc=el("div",{class:"chips scope",role:"group","aria-label":"Whose plan"});
 sc.appendChild(chip("Director view",scope==="all",function(){scope="all";render();}));
 DEPS.forEach(function(D){var c=chip(D.name,scope===D.id,function(){scope=D.id;render();});c.setAttribute("data-dept",D.id);c.title="Right-click to see what this department does";sc.appendChild(c);});
 var seg=el("div",{class:"seg",role:"group","aria-label":"Period"});
 [["day","Day"],["week","Week"],["month","Month"],["year","365 days"]].forEach(function(p){seg.appendChild(el("button",{"aria-pressed":String(period===p[0]),text:p[1],onclick:function(){period=p[0];render(p[0]==="year"?clampN(tn):null);}}));});
 var r=range(),a=dateOf(r[0]),b=dateOf(r[1]),label;
 if(period==="day")label="Day "+cur+", "+["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][DATA.days[cur-1].wd]+" "+fmt(a)+" "+a.getFullYear();
 else if(period==="week")label="Week "+Math.ceil(cur/7)+", "+fmt(a)+" to "+fmt(b)+" "+b.getFullYear();
 else if(period==="month")label=MOL[a.getMonth()]+" "+a.getFullYear();
 else label="All 365 days, "+fmt(a)+" "+a.getFullYear()+" to "+fmt(b)+" "+b.getFullYear();
 function step(dir){if(period==="day")cur=clampN(cur+dir);else if(period==="week")cur=clampN(weekRange(cur)[0]+7*dir);else if(period==="month"){var mr=monthRange(cur);cur=dir<0?monthRange(clampN(mr[0]-1))[0]:clampN(mr[1]+1);}render();}
 var nav=el("div",{class:"btns"},period==="year"?[el("button",{class:"b",text:"Go to today",onclick:function(){var s=document.getElementById("day"+clampN(tn));if(s)s.scrollIntoView({block:"center"});}})]:[
  el("button",{class:"b",text:"Previous",onclick:function(){step(-1);}}),
  el("button",{class:"b",text:"Today",onclick:function(){cur=clampN(tn);render();}}),
  el("button",{class:"b",text:"Next",onclick:function(){step(1);}})]);
 w.appendChild(el("section",{class:"ctrl","aria-label":"View controls"},[
  el("div",{class:"ctrlrow"},[el("span",{class:"lbl",text:"View"}),sc]),
  el("p",{class:"hint",text:"Right-click any department name to see what it does, its KPIs and which services it delivers."}),
  el("div",{class:"ctrlrow"},[el("span",{class:"lbl",text:"Period"}),seg]),
  el("div",{class:"ctrlrow"},[el("label",{class:"lbl",for:"plan-find",text:"Find"}),el("div",{class:"findbox"},[el("input",{type:"search",id:"plan-find",value:findQ,placeholder:"Search all 365 days, e.g. GITEX, rate card, ISO",autocomplete:"off",oninput:function(e){findQ=e.target.value;var y=window.scrollY;render();window.scrollTo(0,y);var si=root.querySelector("#plan-find");if(si){si.focus();si.setSelectionRange(findQ.length,findQ.length);}}}),findQ?el("button",{class:"b",text:"Clear",onclick:function(){findQ="";render();}}):null])])]));
 var year=el("section",{class:"year","aria-label":scopeName()+", year at a glance"});
 var qs=el("div",{class:"qs"});
 DATA.quarters.forEach(function(q,qi){
  var g=el("div",{class:"grid"});
  DATA.days.filter(function(d){return d.q===qi+1;}).forEach(function(d){
   var its=items(d).filter(inScope),c=its.filter(isDone).length;
   var cls="cell"+(!its.length?" z":c===its.length?" f":c>0?" p":"")+(period!=="year"&&d.d>=r[0]&&d.d<=r[1]?" sel":"")+(d.d===tn?" today":"");
   var cell=el("button",{class:cls,"aria-label":"Day "+d.d+", "+WD[d.wd]+" "+fmt(dateOf(d.d))+", "+c+" of "+its.length+" done",title:"Day "+d.d+": "+fmt(dateOf(d.d))+", "+c+" of "+its.length+" done",onclick:function(){cur=d.d;render(period==="year"?d.d:null);}});
   cell.style.gridRow=String(d.wd+1);cell.style.gridColumn=String(d.w-(q.weeks[0]-1));g.appendChild(cell);
  });
  qs.appendChild(el("div",{class:"qb"},[el("h3",{},[el("strong",{text:q.name+" "}),q.title]),g]));
 });
 year.appendChild(el("div",{class:"yhead"},[el("h2",{text:scopeName()}),el("span",{class:"dates",text:"Year at a glance"})]));
 year.appendChild(qs);
 year.appendChild(el("div",{class:"legend"},[el("span",{html:'<i style="background:var(--empty)"></i>Not started'}),el("span",{html:'<i style="background:var(--partial)"></i>In progress'}),el("span",{html:'<i style="background:var(--done)"></i>All done'}),el("span",{html:'<i class="zl"></i>No tasks'}),el("span",{html:'<i style="background:transparent;outline:2px solid var(--accent)"></i>Today'}),el("span",{text:"Rows run Monday to Sunday. Select a day to open it."})]));
 w.appendChild(year);
 var fc=el("div",{class:"chips"});
 ["All","Stretch"].concat(OWN).forEach(function(o){fc.appendChild(chip(o==="Stretch"?"₹20 Cr stretch":o,filt===o,function(){filt=o;render();}));});
 var side=el("aside",{class:"side"});
 if(scope==="all"){
  var dl=el("div",{class:"deplist"});
  DEPS.forEach(function(D){var s=depStats(D.id);dl.appendChild(el("button",{class:"deprow","data-dept":D.id,title:"Right-click to see what this department does",onclick:function(){scope=D.id;render();}},[el("span",{class:"dn",text:D.name}),el("span",{class:"dc",text:s.c+" of "+s.n+(s.od?", "+s.od+" overdue":"")}),bar(s.c,s.n)]));});
  side.appendChild(el("div",{class:"panel"},[el("h3",{text:"Departments"}),dl]));
  side.appendChild(salesPanel());
  var m=planMonth(cur),q=DATA.quarters[Math.min(3,Math.ceil(Math.ceil(cur/7)/13)-1)];
  side.appendChild(el("div",{class:"panel"},[el("h3",{text:"Plan month "+m.n+" targets"}),el("dl",{class:"kv"},[
   el("dt",{text:"Run rate"}),el("dd",{text:"₹"+m.run+" lakh/mo"}),el("dt",{text:"Headcount"}),el("dd",{text:String(m.heads)}),el("dt",{text:"New clients so far"}),el("dd",{text:String(m.clients)}),el("dt",{text:"Paid assessments"}),el("dd",{text:String(m.assess)}),
   el("dt",{class:"sk",text:"Stretch run rate"}),el("dd",{class:"sk",text:"₹"+m.srun+" lakh/mo"}),el("dt",{class:"sk",text:"Stretch headcount"}),el("dd",{class:"sk",text:String(m.sheads)})])]));
  side.appendChild(el("div",{class:"panel"},[el("h3",{text:"Daily minimums, "+q.name}),el("ul",{},q.daily.map(function(t){return el("li",{text:t});}))]));
 }else{
  var D=DEPS.filter(function(x){return x.id===scope;})[0],s=depStats(D.id);
  side.appendChild(el("div",{class:"panel dephead"},[el("h3",{text:D.name,"data-dept":D.id,title:"Right-click to see what this department does"}),el("p",{class:"sub",text:D.what}),el("dl",{class:"kv"},[
   el("dt",{text:"Team"}),el("dd",{text:D.team}),el("dt",{text:"Year 1 target"}),el("dd",{text:D.rev}),el("dt",{text:"Tasks done"}),el("dd",{text:s.c+" of "+s.n+" ("+(s.n?Math.round(s.c/s.n*100):0)+"%)"}),el("dt",{text:"Overdue"}),el("dd",{class:s.od?"warn":"",text:String(s.od)})]),
   bar(s.c,s.n),el("h3",{text:"Goals",style:"margin-top:14px"}),el("ul",{},D.goals.map(function(g){return el("li",{text:g});})),
   el("button",{class:"deflink",text:"What this department does",onclick:function(e){window.MSDept.show(D.id,0,0,e.currentTarget);}})]));
 }
 if(scope==="sales"||scope==="mkt")side.appendChild(salesPanel());
 side.appendChild(el("div",{class:"panel"},[el("h3",{text:"Show tasks for"}),fc]));
 side.appendChild(el("div",{class:"status",role:"status",text:status}));
 var main=el("div",{class:"days"});
 if(findQ.trim().length>=2){
  var term=findQ.trim().toLowerCase(),hits=[];
  DATA.days.forEach(function(d){items(d).filter(vis).forEach(function(x){var dn=x.dep?(DEPS.filter(function(D){return D.id===x.dep;})[0]||{}).name||"":"";if((x.t+" "+dn+" "+x.o).toLowerCase().indexOf(term)>=0)hits.push({x:x,d:d});});});
  main.appendChild(el("div",{class:"weekhead"},[el("h2",{text:hits.length+(hits.length===1?" task matches":" tasks match")+" “"+findQ.trim()+"”"}),el("div",{class:"btns"},[el("button",{class:"b",text:"Clear search",onclick:function(){findQ="";render();}})])]));
  if(!hits.length)main.appendChild(el("p",{class:"sub",text:"Nothing found"+(scope!=="all"||filt!=="All"?" in this view. Try the Director view with all owners.":". Try a shorter word.")}));
  var ul=el("ul",{class:"tasks"});
  hits.slice(0,80).forEach(function(y){var li=taskRow(y.x,y.d,true);li.appendChild(el("button",{class:"openday",text:"Open day",onclick:function(){findQ="";cur=y.d.d;period="day";render();window.scrollTo(0,0);}}));ul.appendChild(li);});
  if(hits.length>80)ul.appendChild(el("li",{class:"more",text:"and "+(hits.length-80)+" more. Add another word to narrow it down."}));
  if(hits.length)main.appendChild(el("article",{class:"day one"},[ul]));
  w.appendChild(el("div",{class:"cols"},[side,main]));
  return;
 }
 main.appendChild(el("div",{class:"weekhead"},[el("h2",{text:label}),nav]));
 if(period!=="year"){var od=overdueList();if(od.length){var u=el("ul",{class:"tasks"});od.slice(0,10).forEach(function(y){u.appendChild(taskRow(y.x,y.d,true));});if(od.length>10)u.appendChild(el("li",{class:"more",text:"and "+(od.length-10)+" more overdue"}));main.appendChild(el("article",{class:"day overdue"},[el("div",{class:"dnum"},[el("b",{text:String(od.length)}),el("span",{text:"Overdue"})]),u]));}}
 if(period==="day")main.appendChild(dayCard(DATA.days[cur-1]));
 else if(period==="week"){for(var i=r[0];i<=r[1];i++)main.appendChild(dayCard(DATA.days[i-1]));}
 else if(period==="month"){
  main.appendChild(calendar(r));
  var any=false;for(var j=r[0];j<=r[1];j++){if(items(DATA.days[j-1]).filter(vis).length){if(!any){main.appendChild(el("h3",{class:"listh",text:"Every task this month"}));any=true;}main.appendChild(dayCard(DATA.days[j-1]));}}
 }else{
  var lastM=-1;
  DATA.days.forEach(function(d){
   var its=items(d).filter(vis);
   if(scope==="all"){var qn=DATA.quarters.filter(function(x){return (x.weeks[0]-1)*7+1===d.d;})[0];if(qn)main.appendChild(el("div",{class:"qnote"},[el("h3",{text:qn.name+" "+qn.title}),el("p",{text:qn.goal}),el("p",{class:"sp",text:"Stretch: "+qn.stretch}),el("p",{text:"Daily minimums: "+qn.daily.join("; ")+"."})]));}
   var dt=dateOf(d.d);
   if(dt.getMonth()!==lastM){lastM=dt.getMonth();var mr=monthRange(d.d),c=0,n=0;for(var k2=mr[0];k2<=mr[1];k2++)items(DATA.days[k2-1]).filter(vis).forEach(function(x){n++;if(isDone(x))c++;});main.appendChild(el("div",{class:"mhead"},[el("h3",{text:MOL[dt.getMonth()]+" "+dt.getFullYear()}),el("p",{text:c+" of "+n+" tasks done"})]));}
   if(its.length||scope==="all")main.appendChild(dayCard(d));
  });
 }
 w.appendChild(el("div",{class:"cols"},[side,main]));
 if(scrollDay){var t=document.getElementById("day"+scrollDay);if(t&&t.scrollIntoView)t.scrollIntoView({block:"center"});}
}
function setStatus(s){status=s;var e=document.querySelector(".status");if(e)e.textContent=s;}
function money(v){v=+v||0;if(v>=100)return "₹"+(Math.round(v)/100).toFixed(2).replace(/\.?0+$/,"")+" Cr";return "₹"+(Math.round(v*10)/10)+" lakh";}
function salesPanel(){
 var link=el("a",{class:"kitlink",href:scope==="mkt"?"/toolkit#leads":"/toolkit",text:"Open the sales and marketing toolkit"});
 if(!KIT)return el("div",{class:"panel"},[el("h3",{text:"Live sales numbers"}),el("p",{class:"sub",text:"Sales numbers appear here once the toolkit has data."}),link]);
 var g=KIT.goals,rows=[
  ["Open pipeline",money(KIT.pipeline.open)+" of ₹10 Cr",KIT.pipeline.open>=g.pipelineLakh],
  ["Win rate",KIT.winRate.percent===null?"No results yet":KIT.winRate.percent+"% (goal 25%)",KIT.winRate.percent!==null&&KIT.winRate.percent>=g.winRate],
  ["Proposal turnaround",KIT.turnaround.averageDays===null?"None sent yet":KIT.turnaround.averageDays+" working days (goal 3)",KIT.turnaround.averageDays!==null&&KIT.turnaround.averageDays<=g.turnaroundDays],
  ["Paid assessments",KIT.assessments.signed+" of 20",KIT.assessments.signed>=g.assessments],
  ["Leads",KIT.leads.total+" of about 220",KIT.leads.total>=g.leads]];
 var dl=el("dl",{class:"kv"});rows.forEach(function(r){dl.appendChild(el("dt",{text:r[0]}));dl.appendChild(el("dd",{class:r[2]?"good":"",text:r[1]}));});
 var kids=[el("h3",{text:"Live sales numbers"}),dl];
 if(KIT.turnaround.lateDrafts)kids.push(el("p",{class:"sub warnline",text:KIT.turnaround.lateDrafts+(KIT.turnaround.lateDrafts===1?" proposal is":" proposals are")+" past 3 working days."}));
 kids.push(link);
 return el("div",{class:"panel"},kids);
}
function rerender(){var y=window.scrollY;render();window.scrollTo(0,y);}
function saved(){setStatus("Saved");}
function failed(e){setStatus("Couldn’t save ("+(e&&e.message?e.message:"server unreachable")+"). Reloading the latest data.");api("GET","/api/state").then(function(s){ST.start=s.start;ST.done=s.done||{};rerender();}).catch(function(){});}
render(period==="year"?clampN(tn):null);
if(window.EventSource){var es=new EventSource("/api/events");es.addEventListener("state",function(ev){try{var s=JSON.parse(ev.data);ST.start=s.start;ST.done=s.done||{};rerender();}catch(e){}});es.addEventListener("toolkit",function(){api("GET","/api/toolkit/summary").then(function(s){KIT=s;rerender();}).catch(function(){});});}
}
function api(method,url,body){
 return fetch(url,{method:method,headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined,credentials:"same-origin"}).then(function(r){
  if(!r.ok)return r.json().catch(function(){return {};}).then(function(j){throw new Error(j.error||("HTTP "+r.status));});
  return r.json();
 });
}
Promise.all([api("GET","/api/plan"),api("GET","/api/state"),api("GET","/api/toolkit/summary").catch(function(){return null;})]).then(function(res){boot(res[0],res[1],res[2]);}).catch(function(e){
 var r=document.getElementById("root");r.textContent="";var p=document.createElement("p");p.className="wrap";p.textContent="Couldn’t load the plan from the server: "+e.message+". Check that the server is running and refresh.";r.appendChild(p);
});
})();
