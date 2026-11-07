(function(root){'use strict';
const VERSION=3;
const LEGACY_VERSION=2;
const REASONS=['未标注','知识缺口','读题','计算','时间','未知','未归因','概念','策略'];
const EVENT_TYPES=['answer','clear','flag','unflag','skip','jump','revisit','submit','timeout','summary'];
const ROLES=['planned','planned-review','mistake-merged','mistake-replace'];
const MAX_EVENTS=60;
const KEEP_EVENTS=30;
const MAX_IMPORT_EVENTS=200;
const MAX_ACTIVE_MS=1200000;
const SOFT_CHARS=380000;

function defaults(){return {schema:VERSION,settings:{week:1,startDate:'2026-11-07',pins:[]},history:[],active:null,notes:{},snapshots:{}}}
function dayKey(t){return new Date(t+8*3600000).toISOString().slice(0,10)}
function remaining(deadline,now){return Math.max(0,Math.ceil((deadline-now)/1000))}
function phase(a,now){if(a.phase==='review')return 'review';if(now>=a.solveDeadline)return 'submit';if(now>=a.learnEnd)return 'solve';return 'learn'}
function htmlEscape(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function zeros(){return [0,0,0,0,0]}
function clone(x){return JSON.parse(JSON.stringify(x))}

function score(ids,answers,bank){let correct=0,blank=0;const topics={};ids.forEach((id,i)=>{const q=bank[id];if(!q)throw Error('未知题号');const yes=answers[i]===q.correct;correct+=Number(yes);blank+=Number(answers[i]===null||answers[i]===undefined);const o=topics[q.topic]||(topics[q.topic]={correct:0,total:0,blank:0});o.total++;o.correct+=Number(yes);o.blank+=Number(answers[i]===null||answers[i]===undefined)});return {correct,total:ids.length,blank,wrong:ids.length-correct-blank,topics}}

function outcome(answer,correct){if(answer===null||answer===undefined)return 'blank';return answer===correct?'correct':'wrong'}

function mistakes(history,bank,now=Date.now()){
 const out={};
 for(const h of history)h.ids.forEach((id,i)=>{
  const q=bank[id];if(!q)return;
  const kind=outcome(h.answers[i],q.correct);
  if(!out[id])out[id]={id,first:null,last:h.finished,lastWeek:h.week,streak:0,lastCorrect:null,wrong:0,blank:0,correct:0,attempts:0,attemptIds:[],missKind:null};
  const m=out[id];
  m.attempts++;
  if(m.attemptIds.length<12)m.attemptIds.push(h.id);
  if(kind==='correct'){
   m.correct++;
   const date=dayKey(h.finished),prev=dayKey(m.last);
   if(m.wrong+m.blank>0&&date>prev&&date!==m.lastCorrect){m.streak++;m.lastCorrect=date}
   m.last=h.finished;m.lastWeek=h.week;
  }else{
   if(kind==='blank')m.blank++;else m.wrong++;
   if(m.first==null)m.first=h.finished;
   m.streak=0;m.lastCorrect=null;m.missKind=kind;m.last=h.finished;m.lastWeek=h.week;
  }
 });
 return Object.values(out).filter(m=>m.wrong+m.blank>0).map(m=>({...m,mastered:m.streak>=2,eligible:m.streak<2&&dayKey(now)>dayKey(m.last),memory:true,variant:false})).sort((a,b)=>a.last-b.last)
}

function sessionQuestions(week,history,bank,now,pins){
 pins=Array.isArray(pins)?pins:[];
 const ids=week.ids.slice(),planned=week.ids.slice();
 const maxExtra=week.checkpoint?1:2;
 const pending=mistakes(history,bank,now).filter(m=>{
  if(dayKey(now)<=dayKey(m.last)||m.lastWeek>=week.week)return false;
  if(pins.includes(m.id))return true;
  return m.eligible;
 }).sort((a,b)=>(pins.includes(b.id)-pins.includes(a.id))||(a.last-b.last));
 const replacements=[];
 const merged=[];
 for(const m of pending){
  if(merged.length+replacements.length>=maxExtra)break;
  if(ids.includes(m.id))merged.push(m);
 }
 const slots=[];
 if(week.reviewId){const ri=planned.indexOf(week.reviewId);if(ri>=0)slots.push(ri)}
 if(!week.checkpoint){for(let i=4;i>=3;i--)if(!slots.includes(i))slots.push(i)}
 for(const m of pending){
  if(merged.length+replacements.length>=maxExtra)break;
  if(ids.includes(m.id))continue;
  for(const idx of slots){
   if(replacements.some(r=>r.index===idx))continue;
   const removed=ids[idx];
   const types=ids.map((id,i)=>i===idx?bank[m.id].type:bank[id].type);
   if(new Set(types).size!==5)continue;
   ids[idx]=m.id;
   replacements.push({index:idx,plannedId:removed,usedId:m.id,postponedMethod:bank[removed].methodName,postponedTopic:bank[removed].topic,fromWeek:m.lastWeek,kind:m.missKind,pinned:pins.includes(m.id),memory:true,variant:false});
   break;
  }
 }
 const roles=ids.map((id,i)=>{
  if(replacements.some(r=>r.index===i))return 'mistake-replace';
  if(merged.some(m=>m.id===id))return 'mistake-merged';
  if(id===week.reviewId)return 'planned-review';
  return 'planned';
 });
 const reviewIds=[];
 ids.forEach((id,i)=>{if(roles[i]!=='planned')reviewIds.push(id)});
 const origins=ids.map((id,i)=>{
  const rep=replacements.find(r=>r.index===i);
  if(rep)return {week:rep.fromWeek,kind:rep.kind,variant:false,pinned:rep.pinned};
  if(roles[i]==='mistake-merged'){const m=merged.find(x=>x.id===id);return {week:m.lastWeek,kind:m.missKind,variant:false,pinned:pins.includes(id)}}
  if(roles[i]==='planned-review')return {week:week.reviewFrom||null,kind:'planned',variant:false,pinned:false};
  return null;
 });
 return {ids,planned,reviewIds,replaced:replacements.length>0,replacements,roles,origins,kept:planned.filter(id=>ids.includes(id))};
}

function suggestion(h,bank){if(!h)return '先从第1周的5题观察起，不另外做诊断。';const sc=score(h.ids,h.answers,bank);if(sc.correct<=2)return '先不赶进度。下次周六可以重练同一周，或在这30分钟里多画图、少追题数。';if(sc.correct<=4)return '下次周六最多把1–2道到期错题换进原来的5题，不另加时间。其它工作日不用补练。';return '可以手动进入下一周。能说清关键方法，比记住五个答案更重要。'}

function countEvents(list,into){
 for(const e of list){
  if(e.type==='summary'&&e.counts){for(const k of Object.keys(into))into[k]+=e.counts[k]||0}
  else if(into[e.type]!=null)into[e.type]++;
 }
}
function emptyCounts(){return {answer:0,clear:0,flag:0,unflag:0,skip:0,jump:0,revisit:0,submit:0,timeout:0}}
function logEvent(events,ev){
 const list=Array.isArray(events)?events.slice():[];
 const seq=list.reduce((m,e)=>Math.max(m,e.seq||0),0)+1;
 list.push({seq,t:ev.t,type:ev.type,i:ev.i==null?null:ev.i,id:ev.id||null,a:ev.a==null?null:ev.a,b:ev.b==null?null:ev.b});
 if(list.length<=MAX_EVENTS)return list;
 const head=list.slice(0,list.length-KEEP_EVENTS),tail=list.slice(list.length-KEEP_EVENTS);
 const counts=emptyCounts();
 countEvents(head,counts);
 return [{seq:head[0].seq,t:head[0].t,type:'summary',i:null,id:null,a:null,b:null,counts,folded:head.length}].concat(tail);
}

function timeView(ms,open,index,now,active){
 const out=(ms||zeros()).slice();
 let slot=open;
 if(slot&&(!active||slot.i!==index)){
  const add=Math.max(0,Math.min(MAX_ACTIVE_MS,now-slot.t));
  out[slot.i]=Math.max(0,Math.min(MAX_ACTIVE_MS,(out[slot.i]||0)+add));
  slot=null;
 }
 if(active&&!slot)slot={i:index,t:now};
 return {ms:out,open:slot};
}

function snapshotOf(q,source){return {id:q.id,topic:q.topic,methodName:q.methodName,method:q.method,prompt:q.prompt,options:q.options.slice(),correct:q.correct,answer:q.answer,explanation:q.explanation,source:source||'presented'}}

function bucket(){return {correct:0,total:0,blank:0,wrong:0}}
function addBucket(b,answer,correct){b.total++;if(answer===correct)b.correct++;else if(answer==null)b.blank++;else b.wrong++}

function analyze(state,data,now){
 now=now||Date.now();
 const history=state.history||[];
 const bank=data.bank;
 const acc=bucket();
 const topics={};
 const fresh=bucket(),review=bucket();
 let unrecordedSplit=false;
 const byWeek={};
 history.forEach(h=>{
  h.ids.forEach((id,i)=>{
   const q=bank[id];if(!q)return;
   const answer=h.answers[i];
   addBucket(acc,answer,q.correct);
   const topic=topics[q.topic]||(topics[q.topic]=Object.assign(bucket(),{topic:q.topic,ids:[]}));
   addBucket(topic,answer,q.correct);
   if(!topic.ids.includes(id))topic.ids.push(id);
   const role=h.roles?h.roles[i]:null;
   if(!role)unrecordedSplit=true;
   else if(role==='planned')addBucket(fresh,answer,q.correct);
   else addBucket(review,answer,q.correct);
  });
  const w=byWeek[h.week]||(byWeek[h.week]={week:h.week,attempts:0,latest:null});
  w.attempts++;
  if(!w.latest||h.finished>=w.latest.finished)w.latest=h;
 });
 const weeks=Object.values(byWeek).sort((a,b)=>a.week-b.week);
 let trend;
 if(!history.length)trend='还没有交卷记录，看不出各周变化。';
 else if(weeks.length<2)trend='目前只有第'+weeks[0].week+'周的记录，看不出各周变化。';
 else trend='各周最近一次的答对题数可以并排列出。次数少，不能当成稳定变化，也不是正式考试的结论。';
 const weekRows=weeks.map(w=>{
  const sc=score(w.latest.ids,w.latest.answers,bank);
  return {week:w.week,attempts:w.attempts,latestId:w.latest.id,correct:sc.correct,total:sc.total,blank:sc.blank,wrong:sc.wrong};
 });
 const due=mistakes(history,bank,now).filter(m=>m.eligible);
 const repeated=mistakes(history,bank,now).filter(m=>m.wrong+m.blank>=2);
 const priorities=[];
 const pool=(repeated.length?repeated:due).slice().sort((a,b)=>(b.wrong+b.blank)-(a.wrong+a.blank)||a.last-b.last);
 for(const m of pool){
  if(priorities.length>=2)break;
  const q=bank[m.id];
  priorities.push({id:m.id,methodName:q.methodName,topic:q.topic,wrong:m.wrong,blank:m.blank,attempts:m.attempts,attemptIds:m.attemptIds.slice(),mastered:m.mastered,kind:m.missKind,reason:repeated.length?'这道题有多次答错或未作答':'这道题到了另一个日期，可以在下次周六的5题里替换进去'});
 }
 const topicRows=Object.values(topics).map(t=>({topic:t.topic,correct:t.correct,total:t.total,blank:t.blank,wrong:t.wrong,sample:t.total,ids:t.ids.slice(),limited:t.total<2}));
 return {attempts:history.length,weeks:weeks.length,trend,accuracy:acc,topics:topicRows,fresh:unrecordedSplit&&!fresh.total&&!review.total?null:fresh,review:unrecordedSplit&&!fresh.total&&!review.total?null:review,unrecordedSplit,weekRows,priorities,due:due.map(m=>m.id),repeated:repeated.map(m=>m.id),noVariant:true};
}

function integer(n,a,b){return Number.isInteger(n)&&n>=a&&n<=b}
function timeOk(n){return Number.isFinite(n)&&n>0&&n<4102444800000}
function isId(id,bank){return typeof id==='string'&&Object.hasOwn(bank,id)}

function cleanEvents(events,bank,allowNull){
 if(events==null){if(allowNull)return null;throw Error('作答过程缺失')}
 if(!Array.isArray(events)||events.length>MAX_IMPORT_EVENTS)throw Error('作答过程过长或格式错误');
 return events.map(e=>{
  if(!e||typeof e!=='object'||Array.isArray(e)||!EVENT_TYPES.includes(e.type)||!integer(e.seq,1,1000000)||!timeOk(e.t))throw Error('作答过程格式错误');
  if(!(e.i==null||integer(e.i,0,4)))throw Error('作答过程题号错误');
  if(!(e.id==null||isId(e.id,bank)))throw Error('作答过程题目错误');
  if(!(e.a==null||integer(e.a,0,4))||!(e.b==null||integer(e.b,0,4)))throw Error('作答过程选项错误');
  const out={seq:e.seq,t:e.t,type:e.type,i:e.i==null?null:e.i,id:e.id||null,a:e.a==null?null:e.a,b:e.b==null?null:e.b};
  if(e.type==='summary'){
   if(!e.counts||typeof e.counts!=='object'||Array.isArray(e.counts))throw Error('过程摘要格式错误');
   out.counts=emptyCounts();
   for(const k of Object.keys(out.counts)){const n=e.counts[k]||0;if(!integer(n,0,100000))throw Error('过程摘要格式错误');out.counts[k]=n}
   if(e.folded!=null){if(!integer(e.folded,1,100000))throw Error('过程摘要格式错误');out.folded=e.folded}
  }
  return out;
 });
}

function cleanReasons(obj,bank){
 const notes={};
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('错因标签格式错误');
 for(const [id,v] of Object.entries(obj)){if(!isId(id,bank)||!REASONS.includes(v))throw Error('错因标签不合法');notes[id]=v}
 return notes;
}

function baseAttempt(o,bank){
 if(!o||!integer(o.week,1,12)||!Array.isArray(o.ids)||o.ids.length!==5||new Set(o.ids).size!==5||!o.ids.every(id=>isId(id,bank))||!Array.isArray(o.answers)||o.answers.length!==5||!o.answers.every(a=>a===null||integer(a,0,4))||!Array.isArray(o.flags)||o.flags.length!==5||!o.flags.every(a=>typeof a==='boolean')||!timeOk(o.started))throw Error('作答数据不合法');
 return {week:o.week,ids:o.ids.slice(),answers:o.answers.slice(),flags:o.flags.slice(),started:o.started};
}

function cleanChoiceRow(row){
 if(row==null)return null;
 if(!Array.isArray(row)||row.length!==5||!row.every(a=>a===null||integer(a,0,4)))throw Error('最初选择格式错误');
 return row.slice();
}
function cleanBoolRow(row){
 if(row==null)return null;
 if(!Array.isArray(row)||row.length!==5||!row.every(a=>typeof a==='boolean'))throw Error('标记格式错误');
 return row.slice();
}
function cleanMs(row){
 if(row==null)return null;
 if(!Array.isArray(row)||row.length!==5||!row.every(n=>Number.isFinite(n)&&n>=0&&n<=MAX_ACTIVE_MS))throw Error('在屏时间格式错误');
 return row.slice();
}
function cleanOrigins(list){
 if(list==null)return null;
 if(!Array.isArray(list)||list.length>5)throw Error('回看来源不合法');
 return list.map(o=>{
  if(o==null)return null;
  if(!o||typeof o!=='object'||Array.isArray(o))throw Error('回看来源不合法');
  return {week:integer(o.week,1,12)?o.week:null,kind:o.kind==='blank'?'blank':o.kind==='wrong'?'wrong':o.kind==='planned'?'planned':null,variant:false,pinned:o.pinned===true};
 });
}
function cleanRoles(row){
 if(row==null)return null;
 if(!Array.isArray(row)||row.length!==5||!row.every(r=>ROLES.includes(r)))throw Error('题目安排格式错误');
 return row.slice();
}
function cleanReplacements(list,bank){
 if(list==null)return [];
 if(!Array.isArray(list)||list.length>2)throw Error('替换记录过多');
 return list.map(r=>{
  if(!r||!integer(r.index,0,4)||!isId(r.plannedId,bank)||!isId(r.usedId,bank))throw Error('替换记录不合法');
  return {index:r.index,plannedId:r.plannedId,usedId:r.usedId,postponedMethod:String(r.postponedMethod||'').slice(0,80),postponedTopic:String(r.postponedTopic||'').slice(0,80),fromWeek:integer(r.fromWeek,1,12)?r.fromWeek:null,kind:r.kind==='blank'?'blank':r.kind==='wrong'?'wrong':null,pinned:r.pinned===true,memory:true,variant:false};
 });
}
function textField(v,n){if(typeof v!=='string'||v.length>n)throw Error('题目快照不合法');return v}

function cleanSnapshots(obj,bank){
 const out={};
 if(obj==null)return out;
 if(typeof obj!=='object'||Array.isArray(obj))throw Error('题目快照不合法');
 for(const [id,q] of Object.entries(obj)){
  if(!isId(id,bank)||!q||typeof q!=='object'||Array.isArray(q))throw Error('题目快照不合法');
  if(!Array.isArray(q.options)||q.options.length!==5)throw Error('题目快照不合法');
  out[id]={id,topic:textField(q.topic,80),methodName:textField(q.methodName,80),method:textField(q.method,2000),prompt:textField(q.prompt,2000),options:q.options.map(o=>textField(o,400)),correct:integer(q.correct,0,4)?q.correct:0,answer:textField(q.answer,400),explanation:textField(q.explanation,4000),source:q.source==='migrated-from-bank'?'migrated-from-bank':'presented'};
  if(!integer(q.correct,0,4))throw Error('题目快照不合法');
 }
 return out;
}

function cleanPins(pins,bank){
 if(pins==null)return [];
 if(!Array.isArray(pins)||pins.length>2||new Set(pins).size!==pins.length||!pins.every(id=>isId(id,bank)))throw Error('回看标记不合法');
 return pins.slice();
}

function historyItem(h,bank){
 const o=baseAttempt(h,bank);
 if(typeof h.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(h.id)||!timeOk(h.finished)||h.finished<o.started||!Number.isFinite(h.duration)||h.duration<0||h.duration>1200||typeof h.reviewDone!=='boolean')throw Error('历史记录时间或编号错误');
 const sc=score(o.ids,o.answers,bank);
 return Object.assign(o,{id:h.id,finished:h.finished,duration:h.duration,score:sc.correct,total:sc.total,reviewDone:h.reviewDone,reason:h.reason==='timeout'?'timeout':'manual',events:cleanEvents(h.events===undefined?null:h.events,bank,true),activeMs:cleanMs(h.activeMs===undefined?null:h.activeMs),initial:cleanChoiceRow(h.initial===undefined?null:h.initial),initialUnknown:cleanBoolRow(h.initialUnknown===undefined?null:h.initialUnknown),roles:cleanRoles(h.roles===undefined?null:h.roles),replacements:cleanReplacements(h.replacements,bank),origins:Array.isArray(h.origins)?h.origins.slice(0,5):null,reasons:h.reasons?cleanReasons(h.reasons,bank):{},legacy:h.legacy===true,origins:cleanOrigins(h.origins)});
}

function cleanActive(a,bank,history){
 if(a==null)return null;
 const o=baseAttempt(a,bank);
 if(!['learn','solve','review'].includes(a.phase)||!integer(a.index,0,4)||!timeOk(a.learnEnd)||!timeOk(a.solveDeadline)||!timeOk(a.deadline)||a.learnEnd!==o.started+180000||a.solveDeadline!==o.started+1380000||a.deadline!==o.started+1800000)throw Error('不是3+20+7分钟的有效计时记录');
 if(a.phase==='review'&&!history.some(h=>h.id===a.historyId))throw Error('复盘记录缺失');
 return Object.assign(o,{phase:a.phase,index:a.index,learnEnd:a.learnEnd,solveDeadline:a.solveDeadline,deadline:a.deadline,historyId:typeof a.historyId==='string'?a.historyId:null,reviewIds:Array.isArray(a.reviewIds)?a.reviewIds.filter(id=>o.ids.includes(id)):[],replaced:a.replaced===true,events:cleanEvents(a.events==null?[]:a.events,bank,false),activeMs:a.activeMs==null?null:cleanMs(a.activeMs),viewOpen:null,initial:a.initial==null?null:cleanChoiceRow(a.initial),initialUnknown:a.initialUnknown==null?null:cleanBoolRow(a.initialUnknown),roles:cleanRoles(a.roles==null?null:a.roles),replacements:cleanReplacements(a.replacements,bank),origins:cleanOrigins(a.origins),visited:cleanBoolRow(a.visited==null?[false,false,false,false,false]:a.visited),timingKnown:a.timingKnown!==false,legacy:a.legacy===true});
}

function cleanV3(x,data){
 const bank=data.bank;
 const s=x.settings;if(!s||!integer(s.week,1,12)||typeof s.startDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate))throw Error('周次或开始日不合法');
 const dt=new Date(s.startDate+'T00:00:00Z');if(isNaN(dt.getTime())||dt.toISOString().slice(0,10)!==s.startDate||dt.getUTCDay()!==6)throw Error('请选择有效的周六作为参考开始日');
 if(!Array.isArray(x.history)||x.history.length>1000)throw Error('历史记录过多或格式错误');
 const history=x.history.map(h=>historyItem(h,bank));
 if(new Set(history.map(h=>h.id)).size!==history.length)throw Error('历史编号重复');
 const notes=cleanReasons(x.notes||{},bank);
 const active=cleanActive(x.active,bank,history);
 return {schema:VERSION,settings:{week:s.week,startDate:s.startDate,pins:cleanPins(s.pins,bank)},history,active,notes,snapshots:cleanSnapshots(x.snapshots,bank)};
}

function migrateV2(x,data){
 const bank=data.bank;
 if(!x||typeof x!=='object'||Array.isArray(x)||x.schema!==LEGACY_VERSION)throw Error('不是可迁入的每周30分钟旧进度');
 const old=cleanV2(x,data);
 const snapshots={};
 const take=id=>{if(bank[id]&&!snapshots[id])snapshots[id]=snapshotOf(bank[id],'migrated-from-bank')};
 old.history.forEach(h=>h.ids.forEach(take));
 if(old.active)old.active.ids.forEach(take);
 const history=old.history.map(h=>({id:h.id,week:h.week,ids:h.ids,answers:h.answers,flags:h.flags,started:h.started,finished:h.finished,duration:h.duration,score:h.score,total:h.total,reviewDone:h.reviewDone,reason:h.reason,events:null,activeMs:null,initial:null,initialUnknown:null,roles:null,replacements:[],origins:null,reasons:Object.fromEntries(h.ids.filter(id=>old.notes[id]).map(id=>[id,old.notes[id]])),legacy:true}));
 let active=null;
 if(old.active){
  const a=old.active;
  active={week:a.week,ids:a.ids,answers:a.answers,flags:a.flags,started:a.started,phase:a.phase,index:a.index,learnEnd:a.learnEnd,solveDeadline:a.solveDeadline,deadline:a.deadline,historyId:a.historyId,reviewIds:a.reviewIds,replaced:a.replaced,events:[],activeMs:null,viewOpen:null,initial:null,initialUnknown:[true,true,true,true,true],roles:null,replacements:[],origins:null,visited:[false,false,false,false,false],timingKnown:false,legacy:true};
 }
 return cleanV3({schema:VERSION,settings:{week:old.settings.week,startDate:old.settings.startDate,pins:[]},history,active,notes:old.notes,snapshots},data);
}

function cleanV2(x,data){
 const bank=data.bank;
 const integerOk=integer,time=timeOk;
 const s=x.settings;if(!s||!integerOk(s.week,1,12)||typeof s.startDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate))throw Error('周次或开始日不合法');
 const dt=new Date(s.startDate+'T00:00:00Z');if(isNaN(dt.getTime())||dt.toISOString().slice(0,10)!==s.startDate||dt.getUTCDay()!==6)throw Error('请选择有效的周六作为参考开始日');
 function base(o){if(!o||!integerOk(o.week,1,12)||!Array.isArray(o.ids)||o.ids.length!==5||new Set(o.ids).size!==5||!o.ids.every(id=>isId(id,bank))||!Array.isArray(o.answers)||o.answers.length!==5||!o.answers.every(a=>a===null||integerOk(a,0,4))||!Array.isArray(o.flags)||o.flags.length!==5||!o.flags.every(a=>typeof a==='boolean')||!time(o.started))throw Error('作答数据不合法');return {week:o.week,ids:o.ids.slice(),answers:o.answers.slice(),flags:o.flags.slice(),started:o.started}}
 if(!Array.isArray(x.history)||x.history.length>1000)throw Error('历史记录过多或格式错误');
 const history=x.history.map(h=>{const o=base(h);if(typeof h.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(h.id)||!time(h.finished)||h.finished<o.started||!Number.isFinite(h.duration)||h.duration<0||h.duration>1200||typeof h.reviewDone!=='boolean')throw Error('历史记录时间或编号错误');const sc=score(o.ids,o.answers,bank);return Object.assign(o,{id:h.id,finished:h.finished,duration:h.duration,score:sc.correct,total:sc.total,reviewDone:h.reviewDone,reason:h.reason==='timeout'?'timeout':'manual'})});
 if(new Set(history.map(h=>h.id)).size!==history.length)throw Error('历史编号重复');
 const notes={};if(!x.notes||typeof x.notes!=='object'||Array.isArray(x.notes))throw Error('错因标签格式错误');
 for(const [id,v] of Object.entries(x.notes)){if(!isId(id,bank)||!['读题','概念','计算','策略','时间','未归因'].includes(v))throw Error('错因标签不合法');notes[id]=v}
 let active=null;
 if(x.active!==null){const a=x.active,o=base(a);if(!['learn','solve','review'].includes(a.phase)||!integerOk(a.index,0,4)||!time(a.learnEnd)||!time(a.solveDeadline)||!time(a.deadline)||a.learnEnd!==o.started+180000||a.solveDeadline!==o.started+1380000||a.deadline!==o.started+1800000)throw Error('不是3+20+7分钟的有效计时记录');if(a.phase==='review'&&!history.some(h=>h.id===a.historyId))throw Error('复盘记录缺失');active=Object.assign(o,{phase:a.phase,index:a.index,learnEnd:a.learnEnd,solveDeadline:a.solveDeadline,deadline:a.deadline,historyId:typeof a.historyId==='string'?a.historyId:null,reviewIds:Array.isArray(a.reviewIds)?a.reviewIds.filter(id=>o.ids.includes(id)):[],replaced:a.replaced===true})}
 return {schema:LEGACY_VERSION,settings:{week:s.week,startDate:s.startDate},history,active,notes};
}

function cleanState(x,data){
 if(x&&x.schema===1)throw Error('这是旧版每日训练进度，不能作为每周30分钟的完成记录。请保留旧备份，从新版第1周开始。');
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('不是每周30分钟版的有效进度文件');
 if(x.schema===LEGACY_VERSION)return migrateV2(x,data);
 if(x.schema!==VERSION)throw Error('不是每周30分钟版的有效进度文件');
 return cleanV3(x,data);
}

function compact(state){
 const next=clone(state);
 const older=next.history.slice(0,-6);
 older.forEach(h=>{
  if(Array.isArray(h.events)&&h.events.length){
   const counts=emptyCounts();
   countEvents(h.events,counts);
   h.events=[{seq:1,t:h.started,type:'summary',i:null,id:null,a:null,b:null,counts,folded:h.events.length}];
  }
 });
 return next;
}
function stateChars(state){return JSON.stringify(state).length}

const api={VERSION,LEGACY_VERSION,REASONS,defaults,dayKey,remaining,phase,score,mistakes,sessionQuestions,suggestion,logEvent,timeView,analyze,cleanState,migrateV2,compact,stateChars,snapshotOf,htmlEscape,outcome};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AMC=api;
})(typeof globalThis==='undefined'?this:globalThis);
