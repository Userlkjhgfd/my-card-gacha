(() => {
"use strict";
const SAVE_KEY = "myIdolGachaSave";
const VERSION = 3;
const $ = id => document.getElementById(id);
const RARITIES = ["N","R","SR","SSR"];
const CAPS = {N:20,R:30,SR:40,SSR:50};
const EXP_NEXT = lv => 50 + 10 * (lv - 1);
const MAX_STAMINA = 100, STAMINA_MS = 5 * 60 * 1000, TICKET_MS = 60 * 60 * 1000;
const uid = () => "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const now = () => Date.now();
let state, currentTeamId = null, lastTick = now();

function defaultState(){return {version:VERSION,characters:[],owned:[],teams:[],tickets:1,ticketUpdatedAt:now(),stamina:100,staminaUpdatedAt:now(),specialDate:localDate(),specialUsed:0};}
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function safeParse(s){try{return JSON.parse(s)}catch{return null}}
function normalizeCharacter(c){
  if(!c||typeof c!=="object") return null;
  const name=String(c.name??c.characterName??c.title??"").trim();
  if(!name)return null;
  const rarity=RARITIES.includes(c.rarity)?c.rarity:"N";
  return {id:String(c.id||c.characterId||uid()),name,rarity,looks:clamp(Number(c.looks??c.baseLooks??c.stats?.looks??50),0,100),style:clamp(Number(c.style??c.baseStyle??c.stats?.style??50),0,100),image:typeof c.image==="string"?c.image:(typeof c.imageData==="string"?c.imageData:""),createdAt:c.createdAt||now()};
}
function clamp(v,min,max){return Math.max(min,Math.min(max,Number.isFinite(v)?v:min));}
function normalizeOwned(o, chars){
  if(!o||typeof o!=="object")return null;
  const characterId=String(o.characterId||o.charId||o.id||"");
  const ch=chars.find(c=>c.id===characterId) || chars.find(c=>c.name===o.name);
  if(!ch)return null;
  return {id:String(o.id||uid()),characterId:ch.id,level:clamp(Math.floor(Number(o.level)||1),1,CAPS[ch.rarity]),exp:Math.max(0,Number(o.exp??o.experience)||0),awakenings:clamp(Math.floor(Number(o.awakenings??o.awakening)||0),0,5),favorite:!!o.favorite,obtainedAt:o.obtainedAt||now()};
}
function normalizeState(raw){
  const s=defaultState();
  if(!raw||typeof raw!=="object")return s;
  s.characters=(Array.isArray(raw.characters)?raw.characters:Array.isArray(raw.characterList)?raw.characterList:[]).map(normalizeCharacter).filter(Boolean);
  s.owned=(Array.isArray(raw.owned)?raw.owned:Array.isArray(raw.cards)?raw.cards:Array.isArray(raw.inventory)?raw.inventory:[]).map(o=>normalizeOwned(o,s.characters)).filter(Boolean);
  s.teams=Array.isArray(raw.teams)?raw.teams.map(t=>({id:String(t.id||uid()),name:String(t.name||"マイチーム"),memberIds:Array.isArray(t.memberIds)?t.memberIds.filter(id=>s.owned.some(o=>o.id===id)):Array.isArray(t.members)?t.members.filter(id=>s.owned.some(o=>o.id===id)):[],leaderId:t.leaderId||null})): [];
  s.tickets=Math.max(0,Math.floor(Number(raw.tickets??raw.gachaTickets??1)||0));
  s.ticketUpdatedAt=Number(raw.ticketUpdatedAt)||now();
  s.stamina=clamp(Number(raw.stamina??100),0,MAX_STAMINA);
  s.staminaUpdatedAt=Number(raw.staminaUpdatedAt)||now();
  s.specialDate=raw.specialDate||localDate();s.specialUsed=clamp(Number(raw.specialUsed)||0,0,3);
  // Carry across optional future fields and migration metadata.
  return s;
}
function findLegacy(){
  const keys=[SAVE_KEY,"idolGachaSave","idolGachaData","my-card-gacha-save","gachaGameData","gachaData","idolGacha"];
  for(const key of keys){const parsed=safeParse(localStorage.getItem(key));if(parsed && (parsed.characters||parsed.characterList||parsed.owned||parsed.cards||parsed.inventory))return parsed;}
  // Conservative fallback: look for a recognizable old JSON save without deleting it.
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k)continue;const p=safeParse(localStorage.getItem(k));if(p&&typeof p==="object"&&(p.characters||p.characterList)&&!Array.isArray(p))return p;}
  return null;
}
function load(){
  let raw=safeParse(localStorage.getItem(SAVE_KEY));
  if(!raw){raw=findLegacy();}
  state=normalizeState(raw);
  save();
}
function save(){state.version=VERSION;try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch(e){console.error(e);setText("backupMessage","保存容量が不足している可能性があります。画像を小さくするかバックアップしてください。");}}
function setText(id,txt){const el=$(id);if(el)el.textContent=txt;}
function charForOwned(o){return state.characters.find(c=>c.id===o.characterId);}
function displayName(o){const c=charForOwned(o);return c?c.name:"不明なカード";}
function effectiveStats(o){const c=charForOwned(o);if(!c)return {looks:0,style:0};const delta=(o.level-1)*.5;return {looks:Math.floor(Math.min(100,c.looks+delta)),style:Math.floor(Math.min(100,c.style+delta))};}
function totalExpForNext(o){return EXP_NEXT(o.level);}
function addOwned(ch){state.owned.push({id:uid(),characterId:ch.id,level:1,exp:0,awakenings:0,favorite:false,obtainedAt:now()});}
function tick(){
  const t=now();
  if(state.stamina<MAX_STAMINA){const elapsed=Math.max(0,t-(state.staminaUpdatedAt||t));const recovered=Math.floor(elapsed/STAMINA_MS);if(recovered>0){const newVal=Math.min(MAX_STAMINA,state.stamina+recovered);state.stamina=newVal;state.staminaUpdatedAt=newVal>=MAX_STAMINA?t:(state.staminaUpdatedAt+recovered*STAMINA_MS);}}
  else state.staminaUpdatedAt=t;
  const ticketElapsed=Math.max(0,t-(state.ticketUpdatedAt||t));const gained=Math.floor(ticketElapsed/TICKET_MS);if(gained>0){state.tickets+=gained;state.ticketUpdatedAt+=gained*TICKET_MS;}
  if(state.specialDate!==localDate()){state.specialDate=localDate();state.specialUsed=0;}
  save();renderResources();
}
function renderResources(){
  setText("tickets",state.tickets);setText("stamina",`${Math.floor(state.stamina)}/${MAX_STAMINA}`);
  if(state.stamina>=MAX_STAMINA)setText("staminaTimer","満タン");
  else {const rem=STAMINA_MS-Math.max(0,now()-state.staminaUpdatedAt)%STAMINA_MS;setText("staminaTimer",`次の回復 ${fmtTime(rem)}`);}
  setText("homeChars",state.characters.length);setText("homeOwned",state.owned.length);setText("homeFavs",state.owned.filter(o=>o.favorite).length);
}
function fmtTime(ms){const s=Math.ceil(ms/1000);return `${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;}
function imgMarkup(ch,locked=false){if(ch?.image)return `<img alt="" src="${ch.image}">`;return `<div class="portrait-placeholder">${locked?"?":"✦"}</div>`;}
function ownedCardHTML(o,actions=true){
  const ch=charForOwned(o);if(!ch)return "";
  const stats=effectiveStats(o);
  return `<article class="idol-card r-${ch.rarity}"><div class="card-art">${imgMarkup(ch)}</div><div class="rarity">${ch.rarity} ${"✦".repeat(o.awakenings)}</div><h4>${esc(ch.name)}</h4><div class="small">Lv.${o.level}/${CAPS[ch.rarity]}</div><div class="small">ルックス ${stats.looks} · スタイル ${stats.style}</div>${actions?`<div class="card-actions"><button class="secondary" data-fav="${o.id}">${o.favorite?"★":"☆"}</button><button class="secondary" data-details="${o.id}">詳細</button></div>`:""}</article>`;
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderCollection(){
  const q=($("searchCards").value||"").trim().toLowerCase(),rarity=$("rarityFilter").value,filter=$("ownedFilter").value;
  const catalog=state.characters.filter(c=>(!q||c.name.toLowerCase().includes(q))&&(!rarity||c.rarity===rarity)).map(ch=>{
    const copies=state.owned.filter(o=>o.characterId===ch.id);if(filter==="owned"&&!copies.length)return "";if(filter==="missing"&&copies.length)return "";if(filter==="fav"&&!copies.some(o=>o.favorite))return "";
    if(!copies.length)return `<article class="idol-card r-${ch.rarity} locked"><div class="card-art">${imgMarkup(ch,true)}<div class="locked-label">🔒</div></div><div class="rarity">${ch.rarity}</div><h4>未入手アイドル</h4><div class="small">図鑑登録済み</div></article>`;
    return copies.map(o=>ownedCardHTML(o)).join("");
  }).join("");
  $("catalog").innerHTML=catalog||'<p class="muted">該当するカードがありません。</p>';
  $("ownedCards").innerHTML=state.owned.map(o=>ownedCardHTML(o)).join("")||'<p class="muted">まだカードを所持していません。キャラクター登録後、ガチャを引いてみよう。</p>';
  bindCardButtons();
}
function renderTrainingSelect(){
  const select=$("trainingCard"),prev=select.value;
  select.innerHTML=state.owned.map(o=>`<option value="${o.id}">${esc(displayName(o))}（Lv.${o.level}）</option>`).join("");
  if(state.owned.some(o=>o.id===prev))select.value=prev;
  renderTrainingInfo();
}
function renderTrainingInfo(){
  const o=state.owned.find(x=>x.id===$("trainingCard").value),el=$("trainingInfo");
  if(!o){el.innerHTML='<p class="muted">育成できる所持カードがありません。先にガチャを引いてね。</p>';return;}
  const ch=charForOwned(o),stats=effectiveStats(o),need=EXP_NEXT(o.level),cap=CAPS[ch.rarity],atCap=o.level>=cap;
  const pct=atCap?100:Math.min(100,o.exp/need*100);
  const preview={looks:Math.floor(Math.min(100,ch.looks+(o.level)*.5)),style:Math.floor(Math.min(100,ch.style+(o.level)*.5))};
  el.innerHTML=`<div class="team-member">${imgMarkup(ch)}<div class="grow"><b>${esc(ch.name)} · ${ch.rarity}</b><div>Lv.${o.level}/${cap}</div><div class="progress"><span style="width:${pct}%"></span></div><div class="small">${atCap?"最大レベルです":`${o.exp} / ${need} EXP`}</div></div></div><div class="form-grid"><div>ルックス <b>${stats.looks}</b>${!atCap?` <span class="small">→ ${preview.looks}</span>`:""}</div><div>スタイル <b>${stats.style}</b>${!atCap?` <span class="small">→ ${preview.style}</span>`:""}</div></div><p class="small muted">次のレベルで内部値が各+0.5（表示は小数点以下切り捨て）。</p>`;
  document.querySelectorAll("[data-lesson]").forEach(b=>b.disabled=!state.owned.length||atCap);
}
function doLesson(kind){
  const o=state.owned.find(x=>x.id===$("trainingCard").value);if(!o){setText("lessonMessage","先に所持カードを選んでね。");return;}
  const ch=charForOwned(o),cost={vocal:20,dance:30,special:50}[kind],gain=cost;
  if(o.level>=CAPS[ch.rarity]){setText("lessonMessage","このカードは最大レベルです。");return;}
  if(state.stamina<cost){setText("lessonMessage",`スタミナが足りません（必要 ${cost}）。`);return;}
  if(kind==="special"&&state.specialUsed>=3){setText("lessonMessage","今日の特別レッスンは3回使い切りました。");return;}
  state.stamina-=cost;state.staminaUpdatedAt=state.stamina>=MAX_STAMINA?now():state.staminaUpdatedAt;
  if(kind==="special")state.specialUsed++;
  o.exp+=gain;let levels=0;
  while(o.level<CAPS[ch.rarity]&&o.exp>=EXP_NEXT(o.level)){o.exp-=EXP_NEXT(o.level);o.level++;levels++;}
  if(o.level>=CAPS[ch.rarity])o.exp=0;
  save();renderResources();renderTrainingSelect();renderCollection();
  setText("lessonMessage",`${kind==="vocal"?"ボーカル":kind==="dance"?"ダンス":"特別"}レッスン完了！ +${gain} EXP${levels?` · ${levels}レベルアップ！`:""}`);
}
function rarityRoll(){const r=Math.random();return r<.03?"SSR":r<.15?"SR":r<.50?"R":"N";}
function pull(count){
  if(state.tickets<count){setText("stage","ガチャ権が足りません");return;}
  const pool=[];for(const rarity of RARITIES){state.characters.filter(c=>c.rarity===rarity).forEach(c=>pool.push(c));}
  if(!pool.length){setText("stage","先に「カード管理」でキャラクターを登録してね");return;}
  state.tickets-=count;const results=[];
  for(let i=0;i<count;i++){const rarity=rarityRoll();let candidates=state.characters.filter(c=>c.rarity===rarity);if(!candidates.length)candidates=pool;const ch=candidates[Math.floor(Math.random()*candidates.length)];addOwned(ch);results.push({ch,o:state.owned[state.owned.length-1]});}
  save();renderResources();renderCollection();renderTrainingSelect();
  const best=results.reduce((a,x)=>RARITIES.indexOf(x.ch.rarity)>RARITIES.indexOf(a.ch.rarity)?x:a,results[0]);
  const stage=$("stage");stage.className=`stage reveal ${best.ch.rarity.toLowerCase()}`;stage.innerHTML=`<div class="spotlight"></div><div class="stage-text">${best.ch.rarity==="SSR"?"SPECIAL LIVE!":best.ch.rarity==="SR"?"ENCORE!":"LIVE START!"}</div><div class="penlights">✦ ✧ ✦ ✧ ✦ ✧ ✦</div>`;
  const show=$("skipShow").checked;const resultsEl=$("gachaResults");
  resultsEl.innerHTML=results.map(({ch,o},i)=>`<article class="idol-card result-card r-${ch.rarity}" style="animation-delay:${show?0:i*.12}s">${imgMarkup(ch)}<div class="rarity">${ch.rarity}</div><h4>${esc(ch.name)}</h4><div class="small">${state.owned.filter(x=>x.characterId===ch.id).length>1?"重複カード":"NEW!"}</div></article>`).join("");
  if(!show){stage.scrollIntoView({behavior:"smooth",block:"center"});}
}
function bindCardButtons(){
  document.querySelectorAll("[data-fav]").forEach(b=>b.onclick=()=>{const o=state.owned.find(x=>x.id===b.dataset.fav);if(o){o.favorite=!o.favorite;save();renderCollection();renderResources();}});
  document.querySelectorAll("[data-details]").forEach(b=>b.onclick=()=>showDetails(b.dataset.details));
}
function showDetails(id){
  const o=state.owned.find(x=>x.id===id),ch=o&&charForOwned(o);if(!o||!ch)return;
  const stats=effectiveStats(o);
  $("modalContent").innerHTML=`${imgMarkup(ch)}<p class="rarity">${ch.rarity}</p><h2>${esc(ch.name)}</h2><p>Lv.${o.level}/${CAPS[ch.rarity]} · 覚醒 ${o.awakenings}/5</p><p>ルックス ${stats.looks} · スタイル ${stats.style}</p><div class="button-row"><button id="detailFav">${o.favorite?"お気に入り解除":"お気に入り登録"}</button><button id="awaken" class="secondary">重複カードで覚醒</button></div><p class="small muted">覚醒は同じレアリティのカードを1枚消費。能力値は上がらず、見た目の演出用です。</p><p id="detailMessage" class="message"></p>`;
  $("modal").hidden=false;
  $("detailFav").onclick=()=>{o.favorite=!o.favorite;save();$("modal").hidden=true;renderCollection();renderResources();};
  $("awaken").onclick=()=>{const material=state.owned.find(x=>x.id!==o.id&&charForOwned(x)?.rarity===ch.rarity);if(o.awakenings>=5){setText("detailMessage","最大覚醒です。");return;}if(!material){setText("detailMessage","同じレアリティの重複カードが必要です。");return;}state.owned=state.owned.filter(x=>x.id!==material.id);o.awakenings++;save();$("modal").hidden=true;renderCollection();renderTrainingSelect();};
}
function renderTeams(){
  if(!state.teams.length)state.teams.push({id:uid(),name:"メインチーム",memberIds:[],leaderId:null});
  if(!currentTeamId||!state.teams.some(t=>t.id===currentTeamId))currentTeamId=state.teams[0].id;
  $("teamSelect").innerHTML=state.teams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join("");$("teamSelect").value=currentTeamId;
  const t=state.teams.find(x=>x.id===currentTeamId);
  $("teamEditor").innerHTML=`<label>チーム名<input id="editTeamName" value="${esc(t.name)}" maxlength="50"></label><button id="saveTeamName" class="secondary">チーム名を保存</button><h3>メンバーを選択</h3><p class="small muted">チーム人数に固定上限はありません。リーダーはチームメンバーから選びます。</p>${state.owned.map(o=>{const ch=charForOwned(o),checked=t.memberIds.includes(o.id);return `<div class="team-member">${imgMarkup(ch)}<div class="grow"><b>${esc(displayName(o))}</b><div class="small">Lv.${o.level} · ${ch.rarity}</div></div><button data-team-toggle="${o.id}" class="secondary">${checked?"解除":"追加"}</button>${t.leaderId===o.id?'<span title="リーダー">👑</span>':checked?`<button data-leader="${o.id}" class="secondary">リーダー</button>`:""}</div>`;}).join("")||'<p class="muted">カードを所持すると選択できます。</p>'}<button id="deleteTeam" class="danger">このチームを削除</button>`;
  $("saveTeamName").onclick=()=>{t.name=$("editTeamName").value.trim()||"マイチーム";save();renderTeams();};
  document.querySelectorAll("[data-team-toggle]").forEach(b=>b.onclick=()=>{const id=b.dataset.teamToggle;if(t.memberIds.includes(id)){t.memberIds=t.memberIds.filter(x=>x!==id);if(t.leaderId===id)t.leaderId=null;}else t.memberIds.push(id);save();renderTeams();});
  document.querySelectorAll("[data-leader]").forEach(b=>b.onclick=()=>{t.leaderId=b.dataset.leader;save();renderTeams();});
  $("deleteTeam").onclick=()=>{if(state.teams.length===1){t.name="メインチーム";t.memberIds=[];t.leaderId=null;}else{state.teams=state.teams.filter(x=>x.id!==t.id);currentTeamId=state.teams[0].id;}save();renderTeams();};
}
function exportBackup(){
  const blob=new Blob([JSON.stringify({app:"My Idol Gacha",version:VERSION,exportedAt:new Date().toISOString(),data:state},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`my-idol-gacha-backup-${localDate()}.json`;a.click();URL.revokeObjectURL(url);setText("backupMessage","バックアップを書き出しました。ファイルを安全な場所に保管してください。");
}
function importBackup(file){
  const reader=new FileReader();reader.onload=()=>{const parsed=safeParse(reader.result);const raw=parsed?.data||parsed;if(!raw||typeof raw!=="object"||(!Array.isArray(raw.characters)&&!Array.isArray(raw.characterList))){setText("backupMessage","バックアップ形式を読み取れませんでした。元のJSONファイルを選んでください。");return;}if(!confirm("現在の保存データをバックアップの内容に置き換えます。先に現在のデータを書き出しましたか？"))return;state=normalizeState(raw);save();renderAll();setText("backupMessage","バックアップを復元しました。");};reader.readAsText(file);}
function registerCharacter(e){
  e.preventDefault();const name=$("charName").value.trim();if(!name)return;
  const file=$("charImage").files[0],base={id:uid(),name,rarity:$("charRarity").value,looks:clamp(Number($("charLooks").value),0,100),style:clamp(Number($("charStyle").value),0,100),image:"",createdAt:now()};
  const finish=()=>{state.characters.push(base);save();renderAll();$("characterForm").reset();$("charLooks").value=50;$("charStyle").value=50;setText("registerMessage",`${name} を図鑑に登録しました。ガチャで入手できるようになりました。`);};
  if(file){if(file.size>2.5*1024*1024){setText("registerMessage","画像が大きすぎます。2.5MB以下の画像を選んでください。");return;}const r=new FileReader();r.onload=()=>{base.image=r.result;finish();};r.readAsDataURL(file);}else finish();
}
function renderAll(){renderResources();renderCollection();renderTrainingSelect();renderTeams();}
function switchTab(name){document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===name));document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));if(name==="teams")renderTeams();if(name==="training")renderTrainingSelect();if(name==="collection"||name==="manage")renderCollection();}
function init(){
  load();tick();renderAll();
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>switchTab(b.dataset.go));
  $("pullOne").onclick=()=>pull(1);$("pullTen").onclick=()=>pull(10);
  $("characterForm").addEventListener("submit",registerCharacter);
  $("trainingCard").onchange=renderTrainingInfo;
  document.querySelectorAll("[data-lesson]").forEach(b=>b.onclick=()=>doLesson(b.dataset.lesson));
  ["searchCards","rarityFilter","ownedFilter"].forEach(id=>$(id).addEventListener(id==="searchCards"?"input":"change",renderCollection));
  $("createTeam").onclick=()=>{const name=$("newTeamName").value.trim()||`チーム${state.teams.length+1}`;const t={id:uid(),name,memberIds:[],leaderId:null};state.teams.push(t);currentTeamId=t.id;$("newTeamName").value="";save();renderTeams();};
  $("teamSelect").onchange=()=>{currentTeamId=$("teamSelect").value;renderTeams();};
  $("exportBackup").onclick=exportBackup;$("backupTop").onclick=()=>{switchTab("manage");$("backupPanel").scrollIntoView({behavior:"smooth"});};
  $("importButton").onclick=()=>$("importFile").click();$("importFile").onchange=e=>{if(e.target.files[0])importBackup(e.target.files[0]);e.target.value="";};
  $("resetData").onclick=()=>{if(confirm("本当にすべての保存データを削除しますか？先にバックアップを取ることをおすすめします。")&&confirm("この操作は取り消せません。本当に削除しますか？")){localStorage.removeItem(SAVE_KEY);state=defaultState();save();renderAll();setText("backupMessage","このアプリの保存データを削除しました。");}};
  $("closeModal").onclick=()=>$("modal").hidden=true;$("modal").onclick=e=>{if(e.target===$("modal"))$("modal").hidden=true;};
  setInterval(()=>{tick();if($("training").classList.contains("active"))renderTrainingInfo();},1000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){tick();renderAll();}});
}
init();
})();