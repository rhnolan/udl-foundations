/* =====================================================================
   CONFIGURATION: paste your Google Apps Script web app URL (ends in /exec).
   While the placeholder is unchanged, analytics are silently disabled.
   ===================================================================== */
var ANALYTICS_ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbwi4V3TDO3aou6FDi5pisTtsDwnO04XDDUNtIJG4ZhF1cdKNmBtrLIPp6IMt-rszmyt/exec";

/* =====================================================================
   Learner analytics. Each event carries the name the learner typed (no password)
   plus a random session id. No emails or other personal data are collected.
   Events: module_started, knowledge_check_submitted, module_completed,
   reflection_started, reflection_exited, reflection_completed, certificate_issued
   ===================================================================== */
var AN=(function(){
var NAMES=["Introduction","Engagement","Representation","Action & Expression","Plan, Try, Reflect","Final Assessment","Review & Reflect"];
var IDLE_MS=120000,KEY="udl_an",last=Date.now();
function ss(op,k,v){try{return op==="g"?sessionStorage.getItem(k):sessionStorage.setItem(k,v)}catch(e){return null}}
function rid(){try{if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();var a=new Uint8Array(16);crypto.getRandomValues(a);return Array.prototype.map.call(a,function(b){return("0"+b.toString(16)).slice(-2)}).join("")}catch(e){return"s"+Math.random().toString(16).slice(2)+Date.now().toString(16)}}
function load(){try{var o=JSON.parse(ss("g",KEY)||"null");if(o&&o.sid&&o.m)return o}catch(e){}return{sid:rid(),m:{}}}
var st={sid:rid(),m:{}};
function setLearner(n){KEY="udl_an:"+String(n).toLowerCase();st=load()}
function save(){ss("s",KEY,JSON.stringify(st))}
function mod(n){return st.m[n]||(st.m[n]={started:0,done:0,sec:0,att:0,err:0,q:{}})}
function cur(){return S.v==="mod"?S.m+1:S.v==="final"?6:0}
function ready(){var u=ANALYTICS_ENDPOINT_URL;return typeof u==="string"&&/^https:\/\//.test(u)&&u.indexOf("REPLACE_WITH")<0}
function firstOk(m){var k=Object.keys(m.q);return k.length>0&&k.every(function(x){return m.q[x].f===true})}
function send(n,type,extra){
  try{
    if(!ready()||!LEARNER)return;
    var m=mod(n),p={timestamp:new Date().toISOString(),session_id:st.sid,learner_name:LEARNER,module_number:n,module_name:NAMES[n-1],event_type:type,
      time_spent_seconds:m.sec,first_attempt_correct:"",error_count:m.err,total_attempts:m.att};
    for(var k in extra)p[k]=extra[k];
    fetch(ANALYTICS_ENDPOINT_URL,{method:"POST",mode:"no-cors",keepalive:true,
      headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(p)}).catch(function(){});
  }catch(e){}
}
/* learner entered a module view (first time this session only) */
function enter(){try{var n=cur();if(!n)return;var m=mod(n);if(m.started)return;m.started=1;save();send(n,"module_started",{time_spent_seconds:0})}catch(e){}}
/* modules 1-5: one call per answered knowledge-check question */
function answer(id,ok,n){try{var m=mod(n),q=m.q[id]||(m.q[id]={a:0,f:null});q.a++;m.att++;if(!ok)m.err++;if(q.f===null)q.f=!!ok;save();
  send(n,"knowledge_check_submitted",{question_id:id,attempt_correct:!!ok,first_attempt_correct:q.f})}catch(e){}}
/* modules 1-5: summary screen reached */
function complete(n){try{var m=mod(n);if(m.done)return;m.done=1;save();send(n,"module_completed",{first_attempt_correct:firstOk(m)})}catch(e){}}
/* module 6: whole assessment submitted; rs = array of true/false per question (blank counts as an error) */
function final(rs){try{var m=mod(6),right=0;rs.forEach(function(ok,i){var q=m.q["f"+i]||(m.q["f"+i]={a:0,f:null});q.a++;m.att++;if(ok)right++;else m.err++;if(q.f===null)q.f=!!ok});save();
  send(6,"knowledge_check_submitted",{attempt_correct:right===rs.length,score:right,first_attempt_correct:firstOk(m)});
  if(!m.done){m.done=1;save();send(6,"module_completed",{first_attempt_correct:firstOk(m)})}}catch(e){}}
/* active time: counts only while the tab is visible and the learner is interacting (or audio is playing) */
try{
  ["pointerdown","keydown","scroll","touchstart","mousemove","click"].forEach(function(ev){document.addEventListener(ev,function(){last=Date.now()},{passive:true,capture:true})});
  var ticks=0;
  setInterval(function(){try{
    var n=cur();if(!n||document.hidden)return;var m=mod(n);if(!m.started||m.done)return;
    var talking=window.speechSynthesis&&speechSynthesis.speaking;
    if(Date.now()-last>IDLE_MS&&!talking)return;
    m.sec++;if(++ticks%5===0)save();
  }catch(e){}},1000);
  document.addEventListener("visibilitychange",function(){if(document.hidden)save()});
  window.addEventListener("pagehide",save);
}catch(e){}
return{enter:enter,answer:answer,complete:complete,final:final,setLearner:setLearner,log:function(type,extra){send(7,type,extra)}};
})();


/* =====================================================================
   Progress sync: lets a learner pick up where they left off on any device.
   Sends a small progress snapshot (modules done, flashcards mastered, final
   score; never reflection notes) and looks it up again by full name at login.
   ===================================================================== */
var SYNC=(function(){
var timer=null,lastSig="",pending=false;
function ready(){var u=ANALYTICS_ENDPOINT_URL;return typeof u==="string"&&/^https:\/\//.test(u)&&u.indexOf("REPLACE_WITH")<0}
function snap(reset){return{timestamp:new Date().toISOString(),event_type:"progress_snapshot",learner_name:LEARNER,reset:!!reset,
  progress:{done:Object.keys(P.done||{}),known:Object.keys(P.known||{}),final:P.final==null?null:P.final}}}
function post(reset){try{pending=false;if(!ready()||!LEARNER)return;
  fetch(ANALYTICS_ENDPOINT_URL,{method:"POST",mode:"no-cors",keepalive:true,headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(snap(reset))}).catch(function(){})}catch(e){}}
function push(reset){try{if(!ready()||!LEARNER)return;
  var sig=JSON.stringify(snap().progress);if(!reset&&sig===lastSig)return;lastSig=sig;
  clearTimeout(timer);pending=true;if(reset){post(true)}else{timer=setTimeout(function(){post(false)},1500)}}catch(e){}}
function flush(){if(pending){clearTimeout(timer);post(false)}}
function pull(name,cb){
  var finished=false;function fin(r){if(!finished){finished=true;cb(r)}}
  if(!ready()){fin(null);return}
  var to=setTimeout(function(){fin(null)},8000);
  try{fetch(ANALYTICS_ENDPOINT_URL+"?action=resume&name="+encodeURIComponent(name),{method:"GET",cache:"no-store"})
    .then(function(r){return r.json()})
    .then(function(j){clearTimeout(to);fin(j&&j.ok&&j.found?j:null)})
    .catch(function(){clearTimeout(to);fin(null)})}catch(e){clearTimeout(to);fin(null)}}
function reset(){lastSig=""}
try{document.addEventListener("visibilitychange",function(){if(document.hidden)flush()});window.addEventListener("pagehide",flush)}catch(e){}
return{push:push,pull:pull,reset:reset};
})();

var $=function(s){return document.querySelector(s)};
var LEARNER="",MEMNAME="";
var P={done:{},known:{},notes:{},refl:{},pref:{fs:0,th:"auto"}};
try{var gp=JSON.parse(localStorage.getItem("udl_pref")||"null");if(gp)P.pref=gp}catch(e){}
function cleanName(s){return String(s||"").replace(/\s+/g," ").trim().slice(0,60)}
function pkey(){return "udl:"+LEARNER.toLowerCase()}
function getSess(){try{return sessionStorage.getItem("udl_learner")||MEMNAME}catch(e){return MEMNAME}}
function loadP(){var pf=P.pref;P={};try{P=JSON.parse(localStorage.getItem(pkey())||"{}")||{}}catch(e){}
P.done=P.done||{};P.known=P.known||{};P.notes=P.notes||{};P.pref=pf;
P.name=LEARNER;P.refl=P.refl||{};MEMNAME=LEARNER;
try{sessionStorage.setItem("udl_learner",LEARNER);localStorage.setItem("udl_last",LEARNER)}catch(e){}
if(window.UDLScorm)UDLScorm.load(P)}
function save(){try{localStorage.setItem("udl_pref",JSON.stringify(P.pref));if(LEARNER)localStorage.setItem(pkey(),JSON.stringify(P))}catch(e){}if(window.UDLScorm&&LEARNER)UDLScorm.save(P);if(LEARNER)SYNC.push()}
function renderWho(){var w=$("#who");if(!w)return;w.innerHTML=LEARNER?'<span class="pill">👤 '+esc(LEARNER)+'</span> <button data-a="switch">Switch learner</button>':""}
function renderGate(focus){var last="";try{last=localStorage.getItem("udl_last")||""}catch(e){}
$("#nav").innerHTML="";$("#pbi").style.width="0%";$("#pb").setAttribute("aria-valuenow",0);
$("#main").className="";
$("#main").innerHTML='<h2>Welcome to UDL Foundations</h2><p>Please enter your <strong>full name</strong> (first and last) to begin. There is no password. Your name is also used so your instructor can see your progress.</p><form id="gate" novalidate><label for="nm"><strong>Your full name</strong></label><p class="hint" id="nmh">Enter your full name to save your progress and return later on this browser. Your name will appear on your completion certificate exactly as entered.</p><input type="text" id="nm" autocomplete="name" maxlength="60" required aria-describedby="nmh nme" value="'+esc(last).replace(/"/g,"&quot;")+'"><p class="fb no" id="nme" role="alert"></p><div class="row"><button class="p" type="submit">Start or continue</button></div></form>';
if(focus!==0){var i=$("#nm");if(i){i.focus();i.select()}}}
function switchLearner(){rrStop(true);LEARNER="";MEMNAME="";try{sessionStorage.removeItem("udl_learner")}catch(e){}
P={done:{},known:{},notes:{},refl:{},pref:P.pref};S={v:"home",m:0,s:0,cor:{}};renderWho();render(1)}
var S={v:"home",m:0,s:0,cor:{}},Q={};

var M=[
{t:"What is UDL?",c:[
{t:"Barriers live in the design, not the learner",b:"Universal Design for Learning (UDL) is a framework from CAST for designing learning experiences so that everyone can take part and grow. It starts from a simple shift: when a learner struggles, look first at the design of the goals, methods, materials and assessments.",e:"Example: a text-only reading is a barrier for many readers. Adding audio removes it for everyone."},
{t:"Variability is the norm",b:"Learners differ in background, language, attention, interests, strengths and the way they process information. These differences are predictable, so we plan for them from the start rather than retrofitting later.",e:"Think of ramps: built in from the start, they help wheelchair users, parents with strollers and travellers with suitcases."},
{t:"The goal: expert learners",b:"UDL aims to nurture learners who are purposeful and motivated, resourceful and knowledgeable, and strategic and goal-directed. The UDL Guidelines 3.0 organize this around three principles: Engagement, Representation, and Action & Expression.",e:"Remember: the why (engage), the what (represent), the how (act & express)."}],
ap:{q:"A student struggles with a 10-page, text-only reading. Which response reflects UDL?",o:["Send the student to a specialist for a different task","Offer the text with audio, a glossary and a chunked version for the whole class","Shorten the reading for that student only","Ask the student to try harder"],a:1,fb:"UDL builds flexible options in from the start, available to everyone.",w:"UDL looks for barriers in the design, and adds options rather than lowering the goal for one learner."},
qz:[{q:"UDL is best described as…",o:["A set of tools for students with disabilities","A framework for designing flexible learning that reduces barriers","A single teaching method","A test of learner ability"],a:1,fb:"UDL is a design framework for all learners.",w:"Re-read card 1: UDL focuses on design."},
{q:"In UDL, where do barriers primarily come from?",o:["The learner’s deficits","The learner’s motivation","The design of the learning environment","The learner’s family"],a:2,fb:"The mismatch is in the design, so we change the design.",w:"Think about the shift from ‘fixing’ learners to fixing design."}],
k:"UDL = proactive, flexible design that reduces barriers for all learners."},
{t:"Engagement: the why",c:[
{t:"Welcoming interests and identities",b:"Offer meaningful choice, make learning relevant and authentic to learners’ lives, and create a space where identities are respected and learners feel safe to take risks.",e:"Example: in a persuasive-writing unit, let students pick a topic they care about."},
{t:"Sustaining effort and persistence",b:"Keep goals visible, foster collaboration, and give frequent feedback that focuses on growth and strategies rather than ability. Vary demands so the challenge stays within reach.",e:"Example: weekly checkpoints with a short ‘what is my next step?’ note."},
{t:"Emotional capacity",b:"Help learners recognise and manage emotions, reflect on what motivates them, and build a sense of belonging in the community.",e:"Example: a two-minute ‘how am I feeling about this task?’ check-in before a hard assignment."}],
ap:{q:"Students seem disengaged in a persuasive-writing unit. Which is the best first move?",o:["Add more worksheets","Offer guided topic and format choices tied to their lives, plus goal-setting checkpoints","Remove all structure and let them do anything","Grade harder to raise stakes"],a:1,fb:"Relevance, choice and goal-setting support interest and persistence together.",w:"Look for options that connect to interests AND keep effort going."},
qz:[{q:"Which best supports sustaining effort and persistence?",o:["A single high-stakes final","Frequent, growth-focused feedback and visible goals","Removing all challenge","Public ranking of scores"],a:1,fb:"Feedback on progress and clear goals keep learners going.",w:"Think about what helps learners keep trying."},
{q:"Choice in UDL works best when it is…",o:["Unlimited and unguided","Meaningful and supported with guidance","Only for advanced learners","Offered once a year"],a:1,fb:"Too many unguided options can overwhelm; guided choice builds agency.",w:"Re-read card 1: choice must be meaningful."}],
k:"Engagement: offer relevant choice, keep goals and feedback visible, support emotions and belonging."},
{t:"Representation: the what",c:[
{t:"Perception",b:"Make information perceivable in more than one way: captions and transcripts for audio, text alternatives for images, and adjustable size, contrast and speed.",e:"Example: a science video with captions, a transcript and a labelled diagram."},
{t:"Language and symbols",b:"Clarify vocabulary, notation and structure. Support multilingual learners and show ideas in several forms, such as words, images, diagrams and examples.",e:"Example: pre-teach key terms and link each to a picture."},
{t:"Building knowledge",b:"Connect new ideas to prior knowledge, highlight patterns and big ideas, and help learners transfer what they learn to new situations.",e:"Example: a KWL chart or concept map at the start of a unit."}],
ap:{q:"Your science video has no captions. Which fix best reflects UDL?",o:["Tell students to turn up the volume","Add captions and a transcript, plus a key-terms list","Remove the video","Ask students to find their own video"],a:1,fb:"Captions and transcripts serve deaf learners, multilingual learners and anyone in a noisy room.",w:"Aim for multiple ways to perceive and understand the same content."},
qz:[{q:"Which is an example of the Perception guideline?",o:["A group project","Captions and adjustable text size","A growth-mindset poster","A final exam"],a:1,fb:"Perception is about making information accessible to the senses in flexible ways.",w:"Perception = how information is received."},
{q:"A KWL chart or concept map mainly supports…",o:["Building knowledge","Emotional capacity","Physical interaction","Grading"],a:0,fb:"Activating prior knowledge and showing connections builds knowledge.",w:"Which guideline is about connecting ideas?"}],
k:"Representation: present content in multiple formats, clarify language, connect ideas."},
{t:"Action & Expression: the how",c:[
{t:"Interaction",b:"Provide varied ways to navigate materials and respond, including keyboard access, touch, voice and assistive technology.",e:"Example: students can answer by typing, speaking or selecting."},
{t:"Expression and communication",b:"Let learners show what they know through multiple media and tools, with scaffolds that fade as fluency grows.",e:"Example: essay, podcast or annotated timeline, all with the same rubric."},
{t:"Strategy development",b:"Teach goal-setting, planning, organizing information and monitoring progress so learners become strategic.",e:"Example: a planning checklist and a mid-project self-check."}],
ap:{q:"The goal: ‘explain the causes of World War I’. Currently only essays are accepted. What change fits UDL?",o:["Keep essays only for fairness","Offer essay, podcast or annotated timeline with one rubric on understanding, plus a planning checklist","Let students choose any topic","Drop the assessment"],a:1,fb:"The goal stays fixed while the means of expression flex.",w:"Keep the goal and rubric constant; vary the way learners show it."},
qz:[{q:"When is a single format acceptable?",o:["Never","When the format itself is the learning goal (e.g., writing an essay)","Only for older learners","Only for tests"],a:1,fb:"Flexibility applies to the means, not to the goal itself.",w:"Ask: is the format the goal, or just the vehicle?"},
{q:"A planning template with milestones supports…",o:["Perception","Strategy development","Language and symbols","Welcoming identities"],a:1,fb:"Planning and monitoring tools build strategic learners.",w:"Which guideline covers planning and monitoring?"}],
k:"Action & Expression: vary how learners interact and show learning, and teach strategies."},
{t:"Plan, try, reflect",c:[
{t:"Start with a clear goal",b:"Separate the goal (what learners must achieve) from the means (how they get there). Clear goals make it easier to see where flexibility is safe.",e:"Goal: ‘compare two sources’. Means: reading, listening or watching."},
{t:"Anticipate barriers, add options",b:"For one lesson, ask where learners may get stuck. Add at least one option for engagement, one for representation and one for action and expression.",e:"Barrier: dense text. Option: audio plus a summary table."},
{t:"Try, gather feedback, iterate",b:"Start small, ask learners what helped, and adjust. UDL is a continuous practice, not a one-time checklist.",e:"Ask: ‘Which option did you use, and why?’"}],
ap:{q:"You’re new to UDL. What is the best first step?",o:["Redesign your whole course next week","Pick one lesson, name one barrier, add one option, and ask learners what helped","Buy new software","Wait for a perfect plan"],a:1,fb:"Small, tested changes build confidence and evidence.",w:"Start small and learn from learners."},
qz:[{q:"Which statement is true?",o:["UDL removes rigor","UDL keeps high goals and adds flexible paths","UDL means one-size-fits-all","UDL is only for special education"],a:1,fb:"High expectations stay; barriers go.",w:"Re-read the key idea of module 1."},
{q:"After trying a new option you should…",o:["Never change it","Ask learners for feedback and iterate","Apply it to everything at once","Ignore results"],a:1,fb:"Reflection and learner voice drive improvement.",w:"UDL is a cycle."}],
k:"Plan from the goal, anticipate barriers, add options, test, and iterate."}];

var MC=["#b45309","#0f766e","#6d28d9","#1d4ed8","#be123c"],MI=["🧭","💡","👁️","🛠️","🔁"],MT=["Foundation","Engagement · Why","Representation · What","Action & Expression · How","Practice"],FC=[0,0,0,0,1,2,3,4,4];
function hero(){return '<img class="hero" src="hero.svg" alt="Diagram: three UDL principles, Engagement (the why), Representation (the what), and Action and Expression (the how), all lead to expert learners">'}
function key(){return '<div class="key" aria-label="Color key">'+MT.map(function(t,i){return '<span class="c'+i+'">'+MI[i]+' '+t+'</span>'}).join('')+'</div>'}
function badges(){return '<ul class="badges">'+M.map(function(m,i){var g=P.done["m"+i];return '<li class="c'+i+(g?' got':'')+'"><b aria-hidden="true">'+MI[i]+'</b>'+m.t+'<span class="sr">'+(g?' earned':' not yet earned')+'</span></li>'}).join('')+'</ul>'}
var F=[{q:"What is UDL?",a:"A framework for designing flexible learning that reduces barriers for all learners."},
{q:"Name the three UDL principles.",a:"Engagement (why), Representation (what), Action & Expression (how)."},
{q:"What is the goal of UDL?",a:"Expert learners: purposeful and motivated, resourceful and knowledgeable, strategic and goal-directed."},
{q:"Where do barriers come from, according to UDL?",a:"From the design of goals, methods, materials and assessments, not from the learner."},
{q:"Give one Engagement strategy.",a:"Guided choice, relevance, visible goals, growth-focused feedback, or building belonging."},
{q:"Give one Representation strategy.",a:"Captions, transcripts, glossaries, multiple formats, or concept maps."},
{q:"Give one Action & Expression strategy.",a:"Multiple ways to respond (essay, podcast, timeline), planning tools, and assistive tech access."},
{q:"What stays fixed and what flexes?",a:"The goal stays fixed; the means flex."},
{q:"What is a good first step in practice?",a:"One lesson, one barrier, one added option, then ask learners."}];

var FQ=[{q:"What is the aim of UDL?",o:["Faster test completion","Expert learners who are motivated, resourceful and strategic","Uniform instruction","Reducing teacher workload"],a:1,fb:"UDL develops expert learners."},
{q:"Which set names the three UDL principles?",o:["Plan, Teach, Assess","Engagement, Representation, Action & Expression","Read, Write, Speak","Access, Equity, Inclusion"],a:1,fb:"Engagement, Representation, Action & Expression."},
{q:"A teacher offers an article, a podcast or a video to build the same understanding. This is mainly…",o:["Representation","Emotional capacity","Grading","Differentiated goals"],a:0,fb:"Multiple formats for the same content is Representation."},
{q:"What is the best first step when applying UDL to a lesson?",o:["Pick tools","Identify likely barriers in goals, methods, materials and assessment","Cut content","Add more homework"],a:1,fb:"Find barriers first, then add options."},
{q:"Why design options for everyone instead of only accommodating individuals?",o:["It’s cheaper only","Proactive design reduces barriers up front and helps many learners","It lowers expectations","It avoids feedback"],a:1,fb:"Proactive design benefits everyone and reduces retrofitting."}];

function pct(){var n=Object.keys(P.done).length;return Math.round(n/6*100)}
function unlocked(i){return i===0||P.done["m"+(i-1)]}
function fin(){return P.done.m4}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")}
function say(t){$("#live").textContent=t}

function qh(id,it,mode){Q[id]=it;var h='<fieldset data-id="'+id+'"><legend>'+esc(it.q)+'</legend>';
it.o.forEach(function(o,i){h+='<label class="opt"><input type="radio" name="'+id+'" value="'+i+'" data-q="'+id+'" data-mode="'+mode+'"><span>'+esc(o)+'</span></label>'});
return h+'<p class="fb" id="fb-'+id+'" role="status"></p></fieldset>'}

function renderNav(){var h="";
M.forEach(function(m,i){var ok=unlocked(i),d=P.done["m"+i];
h+='<li><button class="c'+i+'" data-a="mod" data-v="'+i+'"'+(ok?"":" disabled")+(S.v==="mod"&&S.m===i?' aria-current="page"':"")+'>'+(d?"✓ ":ok?"":"🔒 ")+(i+1)+". "+m.t+'</button></li>'});
[["final","Final assessment",fin()],["review","Review & reflect",1],["cert","Certificate",!!R().done],["res","Resources",1]].forEach(function(x){
var ok=x[2];h+='<li><button data-a="go" data-v="'+x[0]+'"'+(ok?"":" disabled")+(S.v===x[0]?' aria-current="page"':"")+'>'+(((x[0]==="final"&&P.final!=null)||(x[0]==="review"&&!!R().done)||(x[0]==="cert"&&!!R().done))?"✓ ":ok?"":"🔒 ")+x[1]+'</button></li>'});
$("#nav").innerHTML=h;$("#pbi").style.width=pct()+"%";$("#pb").setAttribute("aria-valuenow",pct());
$("#pb").setAttribute("aria-valuetext",pct()+"% complete")}

function render(focus){if(!LEARNER){renderGate(focus);return}if(S.v==="cert"&&!R().done)S.v="review";if(S.v!=="review")rrStop(true);var h="",m=M[S.m];Q={};AN.enter();
if(S.v==="home"){var next=0;while(next<5&&P.done["m"+next])next++;
h='<h2>Welcome'+(Object.keys(P.done).length?' back':'')+', '+esc(LEARNER)+'</h2>'+(RESTORED?'<div class="box" role="status">✅ Your saved progress was found and restored.</div>':'')+'<p>Learn the essentials of <strong>Universal Design for Learning</strong>, based on the CAST UDL Guidelines (cast.org). Each module is a 5-minute micro-lesson: three short cards, one real-world practice scenario, and a quick check with instant feedback.</p>'+hero()+'<h3>Color key: each color is one idea family</h3>'+key()+'<h3>Your badges</h3>'+badges()+'<div class="box"><strong>How this course supports you</strong><ul><li>Scaffolded path: each module unlocks after the one before.</li><li>Keyboard friendly, screen-reader labelled, adjustable text size, themes, and easy-read spacing (top of page).</li><li>Listen buttons read each card aloud when your device supports it.</li><li>Progress saves in this browser.</li></ul></div><p><strong>Path:</strong> 5 modules → final assessment → review cards & reflection → completion certificate (0.75 professional development hours).</p><div class="row"><button class="p" data-a="'+(next<5?"mod":"go")+'" data-v="'+(next<5?next:"final")+'">'+(Object.keys(P.done).length?"Continue":"Start")+' course</button><button data-a="reset">Reset progress</button></div>'}
else if(S.v==="mod"){var steps=6,s=S.s;
h='<div class="ban"><span class="big" aria-hidden="true">'+MI[S.m]+'</span><div><small>Module '+(S.m+1)+' of 5 · '+MT[S.m]+' · ~5 min</small><h2>'+m.t+'</h2></div></div><ol class="dots" aria-hidden="true">'+[0,1,2,3,4,5].map(function(k){return '<li'+(k<=s?' class="on"':'')+'></li>'}).join('')+'</ol><p class="pill" aria-live="polite">Step '+(s+1)+' of '+steps+'</p><div class="chips" aria-label="Concepts in this module">'+m.c.map(function(c,k){return '<span class="chip'+(k===s?' cur':'')+'">'+(k+1)+'. '+c.t+'</span>'}).join('')+'</div>';
if(s<3){var c=m.c[s];h+='<div class="cardv"><h3><span class="num" aria-hidden="true">'+(s+1)+'</span>'+c.t+'</h3><p>'+c.b+'</p><div class="box">'+c.e+'</div><button data-a="say" data-v="'+esc(c.t+". "+c.b)+'">🔊 Listen</button></div>'}
else if(s===3){h+='<h3>Try it: apply the idea now</h3>'+qh("ap"+S.m,m.ap,"ap")}
else if(s===4){h+='<h3>Quick check</h3>';m.qz.forEach(function(q,i){h+=qh("q"+S.m+"_"+i,q,"qz")})}
else{P.done["m"+S.m]=1;save();AN.complete(S.m+1);h+='<div class="ban"><span class="big" aria-hidden="true">🏅</span><div><small>Badge earned</small><h2>'+m.t+'</h2></div></div><div class="box"><strong>Key takeaway:</strong> '+m.k+'</div><p>Module complete. Your flashcards for this topic are now in <em>Review & reflect</em>.</p>'}
h+='<div class="row">'+(s>0?'<button data-a="prev">← Back</button>':"")+(s<5?'<button class="p" id="nx" data-a="next"'+(s>=3?" disabled":"")+'>'+(s===4?"Finish module":"Next →")+'</button>':(S.m<4?'<button class="p" data-a="mod" data-v="'+(S.m+1)+'">Next module →</button>':'<button class="p" data-a="go" data-v="final">Go to final assessment →</button>'))+'</div>'}
else if(S.v==="final"){h='<h2>Final assessment</h2><p>Answer all five questions, then submit. Aim for 4 of 5.</p>';
FQ.forEach(function(q,i){h+=qh("f"+i,q,"f")});h+='<div class="row"><button class="p" data-a="sub">Submit answers</button></div><div id="res" role="status"></div>'}
else if(S.v==="review"){h=reviewHTML()}
else if(S.v==="cert"){h=certHTML()}
else{h='<h2>Resources</h2><p>Go deeper with CAST, the organization behind UDL.</p><ul><li><a href="https://udlguidelines.cast.org" target="_blank" rel="noopener">UDL Guidelines 3.0 (udlguidelines.cast.org)</a>: the full guidelines and checkpoints.</li><li><a href="https://www.cast.org" target="_blank" rel="noopener">CAST (cast.org)</a>: research, tools and professional learning.</li><li><a href="https://www.cast.org/impact/universal-design-for-learning-udl" target="_blank" rel="noopener">About UDL at CAST</a>: overview and background.</li></ul><div class="box">Tip: spend 10 minutes this week reading one guideline and sketching one change.</div>'}
RESTORED="";$("#main").innerHTML=h;$("#main").className=S.v==="mod"?"c"+S.m:"";renderNav();if(S.v==="review")rrResume();if(focus){$("#main").focus();window.scrollTo(0,0)}}

document.addEventListener("change",function(e){var t=e.target,id=t.getAttribute&&t.getAttribute("data-q");
if(id){var it=Q[id],ok=+t.value===it.a,f=$("#fb-"+id);
if(t.dataset.mode==="f"){return}AN.answer(id,ok,S.m+1);
f.className="fb "+(ok?"ok":"no");f.textContent=ok?"✓ Correct. "+it.fb:"✗ Not quite. "+it.w+" Try again.";S.cor[id]=ok;
var all=Object.keys(Q).every(function(k){return S.cor[k]});var nx=$("#nx");if(nx)nx.disabled=!all;say(f.textContent)}
else if(t.id==="theme"){P.pref.th=t.value;pref();save()}
else if(t.id==="dys"){P.pref.dys=t.checked;pref();save()}
else if(t.id==="calm"){P.pref.calm=t.checked;pref();save()}});
document.addEventListener("input",function(e){var n=e.target.getAttribute&&e.target.getAttribute("data-note");if(n){P.notes[n]=e.target.value;save()}});
document.addEventListener("click",function(e){var b=e.target.closest("button[data-a]");if(!b)return;var a=b.dataset.a,v=b.dataset.v;
if(a==="fs"){P.pref.fs=Math.max(-2,Math.min(5,(P.pref.fs||0)+ +v));pref();save();return}
if(a==="mod"){S.v="mod";S.m=+v;S.s=0;S.cor={};render(1)}
else if(a==="go"){S.v=v;S.fc=0;render(1)}
else if(a==="next"){S.s++;S.cor={};render(1)}
else if(a==="prev"){S.s--;S.cor={};render(1)}
else if(a==="say"){if("speechSynthesis" in window){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(v))}else say("Listen is not supported on this device.")}
else if(a==="sub"){var n=0,h="",rs=[];FQ.forEach(function(q,i){var c=document.querySelector('input[name="f'+i+'"]:checked');var ok=c&&+c.value===q.a;rs.push(!!ok);if(ok)n++;
var f=$("#fb-f"+i);f.className="fb "+(ok?"ok":"no");f.textContent=(c?(ok?"✓ Correct. ":"✗ Not quite. "):"No answer. ")+q.fb});
P.final=n;P.done.final=1;save();AN.final(rs);$("#res").innerHTML='<div class="box"><strong>Score: '+n+' / 5.</strong> '+(n>=4?"Great work! You’ve met the course goal. Keep going with Review & reflect.":"Review the modules and flashcards, then retake: every attempt strengthens recall.")+'</div>';renderNav();say("Score "+n+" of 5")}
else if(a==="show"){$("#ans").hidden=false;$("#gb").hidden=false;$("#ab").hidden=false;b.hidden=true}
else if(a==="got"){P.known[v]=1;save();render()}
else if(a==="again"){S.fc=(S.fc||0)+1;render()}
else if(a==="rf"){P.known={};save();render()}
else if(a==="copy"){var pl=$("#plan");if(!pl)return;var t=pl.value;try{navigator.clipboard.writeText(t);say("Plan copied")}catch(x){$("#plan").select();say("Select and copy the text")}}
else if(a==="rstart"){rrStart()}else if(a==="rdone"){rrComplete(false)}else if(a==="rforce"){rrComplete(true)}else if(a==="rkeep"){rrKeep()}else if(a==="print"){window.print()}else if(a==="cont"){startLogin(PENDING,false)}else if(a==="fresh"){freshStart()}else if(a==="gate"){renderGate(1)}
else if(a==="switch"){switchLearner()}else if(a==="reset"){if(confirm("Reset all progress, notes and your certificate?")){RR.run=0;P={done:{},known:{},notes:{},refl:{},pref:P.pref,name:P.name};save();SYNC.push(true);S={v:"home",m:0,s:0,cor:{}};render(1)}}});
function pref(){var r=document.documentElement;r.style.fontSize=(100+(P.pref.fs||0)*10)+"%";
if(P.pref.th==="auto")r.removeAttribute("data-theme");else r.setAttribute("data-theme",P.pref.th);
document.body.classList.toggle("dys",!!P.pref.dys);document.body.classList.toggle("calm",!!P.pref.calm);
$("#theme").value=P.pref.th||"auto";$("#dys").checked=!!P.pref.dys;$("#calm").checked=!!P.pref.calm}
/* =====================================================================
   Added features
   1. Full-name gate: "Continue Saved Progress" vs "Start Fresh"
   2. Review & Reflect: Start / Complete buttons and exact time tracking
   3. Built-in relevance check for the short-answer boxes (no external AI)
   4. Printable completion certificate (0.75 PD hours + unique saved code)
   ===================================================================== */
(function(){try{var s=document.createElement("style");s.id="udl-extra";s.textContent=[
'.hint{color:var(--mut);font-size:.95rem;margin:.2rem 0 .6rem;max-width:60ch}',
'.fb.soft{color:var(--fg);font-weight:500}',
'.rr-time{font-variant-numeric:tabular-nums}',
'.cert{border:6px double var(--ac);border-radius:12px;padding:2rem 1.2rem;text-align:center;background:var(--card);font-family:Georgia,"Times New Roman",serif;margin:1rem 0}',
'.cert p{margin:.5rem 0}',
'.cert .cert-k{font-size:.95rem;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}',
'.cert .cert-name{font-size:2rem;font-weight:700;line-height:1.25;overflow-wrap:anywhere;border-bottom:2px solid var(--bd);display:inline-block;padding:0 1rem .2rem;max-width:100%}',
'.cert h2{font-size:1.9rem;margin:.4rem 0}',
'.cert .cert-cr{font-size:1.1rem}',
'.cert code{font-size:1.05rem;font-weight:700;letter-spacing:.05em;overflow-wrap:anywhere}',
'@page{margin:1.5cm}',
'@media print{',
'header,nav,.skip,.row,.noprint,#who,.sr{display:none!important}',
'html,body{background:#fff!important;color:#000!important;font-size:100%!important}',
'.wrap{display:block!important;max-width:none!important;padding:0!important}',
'main{border:0!important;padding:0!important;background:#fff!important}',
'.cert{background:#fff!important;border-color:#000!important;color:#000!important;break-inside:avoid;margin:0}',
'.cert *{color:#000!important;border-color:#000!important}',
'}'
].join("\n");document.head.appendChild(s)}catch(e){}})();

var RR={run:0,lastSent:-1,tk:0};
var PENDING="";

/* ---------- 1. saved-progress choice ---------- */
function peekLocal(n){try{return JSON.parse(localStorage.getItem("udl:"+n.toLowerCase())||"null")}catch(e){return null}}
function hasSaved(o){if(!o||typeof o!=="object")return false;
  return Object.keys(o.done||{}).length>0||Object.keys(o.known||{}).length>0||(o.final!=null)||!!(o.refl&&o.refl.started)||
    Object.keys(o.notes||{}).some(function(k){return String(o.notes[k]||"").trim()!==""})}
function renderChoice(o,n){var d=Object.keys(o.done||{}).length;
  $("#main").className="";
  $("#main").innerHTML='<h2>Welcome back</h2><div class="box" role="status">We found saved progress for <strong>'+esc(n)+'</strong> on this browser ('+d+' of 6 course steps complete'+(o.refl&&o.refl.done?"; reflection finished":"")+').</div><p>Would you like to pick up where you left off, or begin again?</p><div class="row"><button class="p" data-a="cont" id="cont">Continue Saved Progress</button><button data-a="fresh">Start Fresh</button><button data-a="gate">Use a different name</button></div><p class="hint">Start Fresh clears the saved progress, notes and certificate for this name on this browser.</p>';
  var b=$("#cont");if(b)b.focus()}
function startLogin(n,fresh){if(!n)return;
  $("#main").innerHTML='<p role="status">'+(fresh?"Starting fresh…":"Looking for your saved progress…")+'</p>';
  if(fresh)login(n,null,true);else SYNC.pull(n,function(rec){login(n,rec)})}
function freshStart(){if(!PENDING)return;
  if(confirm("Start fresh? This permanently clears the saved progress, notes and certificate for this name on this browser."))startLogin(PENDING,true)}

/* ---------- 2. Review & Reflect timing ---------- */
function R(){return P.refl||(P.refl={})}
function fmt(sec){var m=Math.floor(sec/60),s=sec%60;return m+":"+("0"+s).slice(-2)}
function rrSec(){var r=R();return Math.round(((r.ms||0)+(RR.run?Date.now()-RR.run:0))/1000)}
function rrPause(){var r=R();if(!RR.run)return false;r.ms=(r.ms||0)+(Date.now()-RR.run);RR.run=0;save();return true}
function rrResume(){var r=R();if(S.v==="review"&&r.started&&!r.done&&!document.hidden&&!RR.run)RR.run=Date.now()}
/* stop the clock (leaving the section, hiding the tab, closing the page) and report time so far */
function rrStop(sendExit){var r=R(),was=rrPause();
  if(sendExit&&was&&LEARNER&&r.started&&!r.done){var s=rrSec();if(s!==RR.lastSent){RR.lastSent=s;AN.log("reflection_exited",{time_spent_seconds:s})}}}
function rrStart(){var r=R();if(r.started)return;
  r.started=1;r.startedAt=new Date().toISOString();r.ms=0;RR.run=Date.now();RR.lastSent=-1;save();
  AN.log("reflection_started",{time_spent_seconds:0});say("Reflection started");render(0);
  var t=$("#n0");if(t)t.focus()}
try{
  setInterval(function(){try{var r=R();if(S.v!=="review"||!r.started||r.done||document.hidden)return;
    if(RR.run){var n=Date.now();r.ms=(r.ms||0)+(n-RR.run);RR.run=n;if(++RR.tk%5===0)save()}
    var t=$("#rrt");if(t)t.textContent=fmt(rrSec())}catch(e){}},1000);
  document.addEventListener("visibilitychange",function(){if(document.hidden)rrStop(true);else rrResume()});
  window.addEventListener("pagehide",function(){rrStop(true)});
}catch(e){}

/* ---------- 3. relevance check (client-side only; answer text is never sent) ---------- */
var RV=[
{id:"n0",k:"reflection_1",min:12,need:2,terms:["barrier","obstacle","stuck","struggl","challeng","access","option","choice","flexib","alternativ","scaffold","caption","audio","transcript","format","learner","student","udl","universal","engag","represent","express","action","variab","design"]},
{id:"n1",k:"reflection_2",min:12,need:2,terms:["principle","engag","represent","express","action","natural","stretch","challeng","comfortable","easier","harder","motivat","interest","choice","perception","language","format","interact","strateg","udl","learner","student","variab","barrier"]},
{id:"plan",k:"action_plan",min:20,need:3,terms:["goal","lesson","barrier","option","principle","engag","represent","express","action","learner","student","variab","strateg","choice","caption","audio","scaffold","flexib","feedback","udl","design"]}];
function chk(v,text){
  var t=String(text||"").trim(),w=t?t.split(/\s+/):[],wc=w.length,hits=0,s="passed";
  if(!wc)return{id:v.id,k:v.k,s:"empty",wc:0,hits:0,min:v.min};
  v.terms.forEach(function(x){if(new RegExp("\\b"+x,"i").test(t))hits++});
  var u={};w.forEach(function(x){u[x.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]/g,"")]=1});var uq=Object.keys(u).length;
  if(wc<v.min)s="too_short";else if(wc>=8&&uq/wc<0.5)s="repetitive";else if(hits<v.need)s="off_topic";
  return{id:v.id,k:v.k,s:s,wc:wc,hits:hits,min:v.min}}
function msgFor(x){
  if(x.s==="passed")return"✓ Thank you, this looks thoughtful and on topic.";
  if(x.s==="empty")return"💡 This box is still empty. Even a sentence or two will help you get more from the reflection.";
  if(x.s==="too_short")return"💡 Thanks for starting! Try adding a little more detail (aim for about "+x.min+" words; you have "+x.wc+" so far).";
  if(x.s==="repetitive")return"💡 This repeats a few words quite a lot. Try describing your idea another way, with a specific example.";
  return"💡 This might be drifting from the prompt. Try connecting it to ideas from the course, such as barriers, learner variability, engagement, representation, or action & expression."}
function rrKeep(){var p=$("#rrfb");if(p)p.innerHTML="";var f=document.querySelector(".fb.soft");
  var id=f?f.id.replace("rf-",""):"n0",t=$("#"+id);if(t)t.focus()}
function rrComplete(force){var r=R();if(r.done||!r.started)return;
  var res=RV.map(function(v){var el=$("#"+v.id);return chk(v,el?el.value:(P.notes[v.id]||""))});
  var bad=res.filter(function(x){return x.s!=="passed"});
  res.forEach(function(x){var f=$("#rf-"+x.id);if(f){f.className="fb "+(x.s==="passed"?"ok":"soft");f.textContent=msgFor(x)}});
  if(bad.length&&!force){
    $("#rrfb").innerHTML='<div class="box" role="status"><p><strong>Almost there!</strong> A few answers could use a little more detail or a clearer link to the prompts (see the notes above). You are welcome to keep editing, or submit exactly as they are.</p><div class="row"><button data-a="rkeep">Keep editing</button><button class="p" data-a="rforce">Submit anyway</button></div></div>';
    say("Some answers could use more detail. You can keep editing or submit anyway.");return}
  rrPause();var sec=rrSec();
  r.done=1;r.doneAt=new Date().toISOString();r.sec=sec;
  var st=bad.length?"submitted_with_suggestions":"passed";
  var notes=res.map(function(x){return x.k+":"+x.s+" ("+x.wc+" words, "+x.hits+" topic terms)"}).join("; ");
  r.rel={status:st,notes:notes};save();
  AN.log("reflection_completed",{time_spent_seconds:sec,relevance_check_status:st,relevance_notes:notes});
  certEnsure();S.v="cert";render(1);say("Reflection complete. Your certificate is ready.")}
function reviewHTML(){var r=R(),h='<h2>Review & reflect</h2><h3>Spaced-practice flashcards</h3>';
  var due=F.map(function(f,i){return i}).filter(function(i){return!P.known[i]});
  if(!due.length)h+='<p>🎉 All cards mastered. Come back in a few days and reset to retrieve them again.</p><button data-a="rf">Reset flashcards</button>';
  else{var i=due[(S.fc||0)%due.length];h+='<p>'+(F.length-due.length)+' of '+F.length+' mastered</p><div class="fc c'+FC[i]+'"><span class="tg">'+MI[FC[i]]+' '+MT[FC[i]]+'</span><p><strong>'+esc(F[i].q)+'</strong></p><p id="ans" hidden>'+esc(F[i].a)+'</p></div><div class="row"><button data-a="show">Show answer</button><button class="p" data-a="got" data-v="'+i+'" id="gb" hidden>Got it</button><button data-a="again" id="ab" hidden>Again later</button></div>'}
  h+='<h3>Reflection</h3>';
  if(r.done){
    var d="";try{d=new Date(r.doneAt).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}catch(e){}
    h+='<div class="box" role="status">✅ Reflection completed'+(d?" on "+d:"")+'. Time spent: <span class="rr-time">'+fmt(r.sec||0)+'</span>.</div><div class="row"><button class="p" data-a="go" data-v="cert">View your certificate</button></div>'}
  else if(!r.started){
    h+='<div class="box"><p>Next come two reflection prompts and a one-lesson action plan. Press <strong>Start Reflection</strong> when you are ready. Your reflection time is counted while this page is open and visible, from the moment you start until you press <strong>Complete Reflection</strong> or leave the page.</p></div><div class="row"><button class="p" data-a="rstart">Start Reflection</button></div>'}
  else{
    h+='<p class="pill">Reflection in progress · Time on reflection: <span class="rr-time" id="rrt">'+fmt(rrSec())+'</span></p>'}
  if(r.started||r.done){
    ["Which barrier in your own setting could a UDL option remove first?","Which of the three principles feels most natural, and which stretches you?"].forEach(function(t,i){
      h+='<label for="n'+i+'">'+t+'</label><textarea id="n'+i+'" data-note="n'+i+'" aria-describedby="rf-n'+i+'">'+esc(P.notes["n"+i]||"")+'</textarea><p class="fb" id="rf-n'+i+'" role="status"></p>'});
    h+='<h3>My 1-lesson UDL action plan</h3><p>Lesson goal, one barrier, and one option for each principle.</p><label for="plan" class="sr">Action plan</label><textarea id="plan" data-note="plan" rows="5" aria-describedby="rf-plan">'+esc(P.notes.plan||"")+'</textarea><p class="fb" id="rf-plan" role="status"></p><div class="row"><button data-a="copy">Copy plan</button></div>';
    if(!r.done)h+='<div class="row"><button class="p" data-a="rdone">Complete Reflection</button></div><div id="rrfb"></div>'}
  h+='<h3>Optional stretch challenges</h3><ul><li>Audit one handout using the checkpoints at udlguidelines.cast.org.</li><li>Ask three learners which option they used and why.</li><li>Explain UDL to a colleague in 60 seconds (teach-back).</li></ul>';
  return h}

/* ---------- 4. completion certificate ---------- */
function newCode(){var c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",o="";
  try{var u=new Uint8Array(5);crypto.getRandomValues(u);for(var i=0;i<5;i++)o+=c[u[i]%c.length]}catch(e){for(var j=0;j<5;j++)o+=c[Math.floor(Math.random()*c.length)]}
  return"UDL-075-"+Date.now().toString(36).toUpperCase()+"-"+o}
/* creates the code once, keeps it in localStorage, and logs it once */
function certEnsure(){var r=R(),c=P.cert;
  if(!c||!c.code){c=P.cert={code:newCode(),iso:r.doneAt||new Date().toISOString(),logged:0};save()}
  if(!c.logged){c.logged=1;save();AN.log("certificate_issued",{certificate_code:c.code,pd_credit:"0.75 PD hours",time_spent_seconds:r.sec||0})}
  return c}
function certHTML(){var c=certEnsure(),ds="";
  try{ds=new Date(c.iso).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}catch(e){ds=String(c.iso).slice(0,10)}
  return'<h2 class="noprint">Your completion certificate</h2><p class="noprint">Congratulations, '+esc(LEARNER)+'! Use the button below to print this page or save it as a PDF. Your certificate code is saved in this browser, so you will see the same one when you return.</p><div class="cert" id="cert" role="group" aria-label="Certificate of completion"><p class="cert-k">Certificate of Completion</p><p>This certifies that</p><p><span class="cert-name">'+esc(LEARNER)+'</span></p><p>has completed</p><h2>UDL Foundations</h2><p class="cert-cr"><strong>Equivalent to 0.75 professional development hours</strong></p><p>Completion date: '+esc(ds)+'</p><p>Certificate code: <code>'+esc(c.code)+'</code></p></div><div class="row"><button class="p" data-a="print">Print / Save as PDF</button><button data-a="go" data-v="review">Back to Review &amp; reflect</button></div>'}

var RESTORED="";
function login(n,rec,fresh){
  LEARNER=n;
  if(fresh){try{localStorage.removeItem("udl:"+n.toLowerCase());sessionStorage.removeItem("udl_an:"+n.toLowerCase())}catch(x){}}
  loadP();
  if(fresh)rec=null;
  RR.run=0;RR.lastSent=-1;RR.tk=0;
  var added=0,g=rec&&rec.progress;
  if(g){
    (g.done||[]).forEach(function(k){if(/^(m[0-4]|final)$/.test(String(k))&&!P.done[k]){P.done[k]=1;added++}});
    (g.known||[]).forEach(function(k){if(/^\d+$/.test(String(k))&&!P.known[k]){P.known[k]=1;added++}});
    if(g.final!=null&&(P.final==null||g.final>P.final)){P.final=g.final;added++}
  }
  RESTORED=added>0?"restored":"";
  MEMNAME=LEARNER;try{sessionStorage.setItem("udl_learner",LEARNER);localStorage.setItem("udl_last",LEARNER)}catch(x){}
  SYNC.reset();save();if(fresh)SYNC.push(true);AN.setLearner(LEARNER);S={v:"home",m:0,s:0,cor:{}};renderWho();pref();render(1);
}
document.addEventListener("submit",function(e){if(e.target.id!=="gate")return;e.preventDefault();
var n=cleanName($("#nm").value),err=$("#nme");
if(n.length<2||n.split(" ").length<2){err.className="fb no";err.textContent="Please enter your full name, first and last (for example, Ada Lovelace).";$("#nm").focus();return}
var saved=peekLocal(n);if(hasSaved(saved)){PENDING=n;renderChoice(saved,n);return}
var btn=e.target.querySelector("button[type=submit]");btn.disabled=true;err.className="fb";err.textContent="Looking for your saved progress…";
SYNC.pull(n,function(rec){login(n,rec)})});
LEARNER=cleanName(getSess());if(LEARNER){loadP();AN.setLearner(LEARNER)}
renderWho();pref();render(0);
