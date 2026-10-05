const $=s=>document.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={
  source:null, fileName:"",
  messages:[], tabs:new Map(), chars:new Map(), avatarCSS:"",
  deleted:new Set(), added:[], selectedMessage:null,
  channelEls:new Map(), charEls:new Map()
};

function esc(s){return String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]))}
function safeFile(s){return (s||"cocororia_edited").replace(/[\\/:*?"<>|]/g,"_").replace(/\.html?$/i,"")+".html"}

function avatarRules(doc){
  const out=[];
  $$("style",doc).forEach(st=>{
    const css=st.textContent||"";
    const re=/\.avatar-image-[A-Za-z0-9_-]+\s*\{[^}]*background-image\s*:\s*url\([\s\S]*?\)[^}]*\}/g;
    let m; while((m=re.exec(css))) out.push(m[0]);
  });
  return out.join("\n");
}
function originalAvatar(article){
  const a=article.querySelector(".avatar");
  return a?.className.match(/avatar-image-[A-Za-z0-9_-]+/)?.[0]||"";
}
function channelName(id){return state.tabs.get(id)?.name||id||"main"}

$("#file").addEventListener("change",async e=>{
  const f=e.target.files[0]; if(!f)return;
  state.source=new DOMParser().parseFromString(await f.text(),"text/html");
  state.fileName=f.name;
  state.messages=[]; state.tabs.clear(); state.chars.clear(); state.deleted.clear(); state.added=[];
  state.avatarCSS=avatarRules(state.source);

  const arts=$$("main.message-list > article.message",state.source);
  arts.forEach((a,i)=>{
    const sys=a.classList.contains("system");
    const sp=a.querySelector(".speaker")?.textContent.trim()||"";
    const ch=a.dataset.channel||"main";
    const av=originalAvatar(a);
    const d={id:"m"+i,source:a,system:sys,speaker:sp,channel:ch,avatar:av,html:a.querySelector(".message-text")?.innerHTML||"",deleted:false};
    a.dataset.editorId=d.id;
    state.messages.push(d);
    const label=a.querySelector(".channel-name")?.textContent.trim()||ch;
    if(!state.tabs.has(ch)) state.tabs.set(ch,{id:ch,name:label,color:"#ffffff",deleted:false});
    if(sp && !state.chars.has(sp)) state.chars.set(sp,{name:sp,color:a.querySelector(".speaker")?.style.getPropertyValue("--speaker-color")?.trim()||"#333333",image:null,narration:false,avatars:new Set()});
    if(sp) state.chars.get(sp).avatars.add(av);
  });

  $("#empty").hidden=true; $("#chat").hidden=false; $("#download").disabled=false; $("#addMessage").disabled=false;
  $("#filename").value=safeFile(f.name);
  renderAll();
});

function renderAll(){
  renderTabs(); renderChars(); renderChat(); fillAddForm();
}
function renderTabs(){
  const box=$("#tabs"); box.innerHTML="";
  for(const t of state.tabs.values()){
    const el=document.createElement("div"); el.className="tab"+(t.deleted?" deleted":"");
    el.innerHTML=`<div class="tab-row">
      <input class="tab-color" type="color" value="${t.color}">
      <div class="tab-name">${esc(t.name)}</div>
      <button title="이 탭의 채팅 전체 삭제">전체 삭제</button>
      <button class="restore" title="삭제한 탭 복구" ${t.deleted?"":"hidden"}>복구</button>
    </div>`;
    const color=el.querySelector(".tab-color");
    color.addEventListener("input",e=>{
      t.color=e.target.value;
      // 색상 변경은 전체를 다시 그리지 않고 해당 탭의 DOM만 갱신
      requestAnimationFrame(()=>state.channelEls.get(t.id)?.forEach(x=>x.style.backgroundColor=t.color));
    });
    el.querySelector("button").addEventListener("click",()=>{
      t.deleted=true;
      state.channelEls.get(t.id)?.forEach(x=>x.classList.add("deleted"));
      el.classList.add("deleted"); el.querySelector(".restore").hidden=false;
    });
    el.querySelector(".restore").addEventListener("click",()=>{
      t.deleted=false;
      state.channelEls.get(t.id)?.forEach(x=>x.classList.remove("deleted"));
      el.classList.remove("deleted"); el.querySelector(".restore").hidden=true;
    });
    box.appendChild(el);
  }
}
function renderChars(){
  const box=$("#chars"); box.innerHTML="";
  for(const c of state.chars.values()){
    const el=document.createElement("div"); el.className="char";
    el.innerHTML=`<div class="char-row">
      <div class="char-preview"></div><input class="char-name-edit" value="${esc(c.name)}" aria-label="캐릭터 이름">
    </div>
    <div class="char-tools">
      <input class="char-color" type="color" value="${c.color}">
      <label><input class="narr" type="checkbox" ${c.narration?"checked":""}> 나레이션</label>
      <input class="img" type="file" accept="image/*">
      <button class="reset" title="원본 이미지로 되돌리기">원본</button>
    </div>`;
    const p=el.querySelector(".char-preview");
    const first=[...c.avatars].find(Boolean); if(first) p.classList.add(first);
    if(c.image)p.style.backgroundImage=`url("${c.image}")`;
    el.querySelector(".char-name-edit").addEventListener("change",e=>{
      const old=c.name, next=e.target.value.trim()||old;
      if(next!==old && !state.chars.has(next)){
        state.chars.delete(old); c.name=next; state.chars.set(next,c);
        state.messages.forEach(d=>{if(d.speaker===old)d.speaker=next});
        state.added.forEach(d=>{if(d.speaker===old)d.speaker=next});
        renderChars(); renderChat(); fillAddForm();
      }else e.target.value=old;
    });
    el.querySelector(".char-color").addEventListener("input",e=>{
      c.color=e.target.value;
      requestAnimationFrame(()=>state.charEls.get(c.name)?.forEach(m=>m.querySelector(".speaker")?.style.setProperty("color",c.color)));
    });
    el.querySelector(".narr").addEventListener("change",e=>{
      c.narration=e.target.checked;
      state.charEls.get(c.name)?.forEach(m=>m.classList.toggle("narration",c.narration));
    });
    el.querySelector(".img").addEventListener("change",e=>{
      const f=e.target.files[0]; if(!f)return;
      const rd=new FileReader(); rd.onload=()=>{
        c.image=rd.result; p.style.backgroundImage=`url("${c.image}")`;
        state.charEls.get(c.name)?.forEach(m=>m.querySelector(".avatar")&&(m.querySelector(".avatar").style.backgroundImage=`url("${c.image}")`));
      }; rd.readAsDataURL(f);
    });
    el.querySelector(".reset").addEventListener("click",()=>{
      c.image=null; p.style.backgroundImage="";
      state.charEls.get(c.name)?.forEach(m=>{
        const a=m.querySelector(".avatar"); if(a)a.style.backgroundImage="";
      });
    });
    box.appendChild(el);
  }
}
function makeRow(d){
  const t=state.tabs.get(d.channel), c=state.chars.get(d.speaker);
  const row=document.createElement("article");
  row.className="message"+(d.system?" system":"")+(d.deleted||t?.deleted?" deleted":"");
  row.dataset.id=d.id; row.dataset.channel=d.channel; row.dataset.speaker=d.speaker;
  row.style.backgroundColor=t?.color||"#fff";
  row.innerHTML=`<button class="msg-delete" title="이 메시지 삭제">삭제</button>
    <div class="msg-grid">
      <div class="avatar ${d.avatar||""}"></div>
      <div><div class="meta"><span class="speaker"></span><span class="time">${d.time||""}</span><span>[${esc(d.channel)}]</span></div>
      <div class="text" contenteditable="true" spellcheck="false"></div></div>
    </div>`;
  if(c){
    row.querySelector(".speaker").textContent=c.name;
    row.querySelector(".speaker").style.color=c.color;
    if(c.image)row.querySelector(".avatar").style.backgroundImage=`url("${c.image}")`;
    if(c.narration)row.classList.add("narration");
  }
  if(d.system){
    row.querySelector(".text").innerHTML=d.html;
  }else row.querySelector(".text").innerHTML=d.html;
  row.querySelector(".text").addEventListener("input",()=>d.html=row.querySelector(".text").innerHTML);
  row.querySelector(".msg-delete").addEventListener("click",()=>{d.deleted=true;row.classList.add("deleted")});
  return row;
}
function renderChat(){
  const box=$("#chat"); box.innerHTML="";
  state.channelEls.clear(); state.charEls.clear();
  const frag=document.createDocumentFragment();
  let prevSig="";
  for(const d of state.messages){
    const row=makeRow(d);
    const sig=d.system?"system":`${d.speaker}|${d.channel}|${d.avatar}`;
    if(sig===prevSig && !d.system)row.classList.add("cont");
    prevSig=sig;
    (state.channelEls.get(d.channel)||state.channelEls.set(d.channel,[]).get(d.channel)).push(row);
    if(d.speaker)(state.charEls.get(d.speaker)||state.charEls.set(d.speaker,[]).get(d.speaker)).push(row);
    frag.appendChild(row);
  }
  for(const d of state.added){
    const row=makeRow(d); frag.appendChild(row);
    (state.channelEls.get(d.channel)||state.channelEls.set(d.channel,[]).get(d.channel)).push(row);
    if(d.speaker)(state.charEls.get(d.speaker)||state.charEls.set(d.speaker,[]).get(d.speaker)).push(row);
  }
  box.appendChild(frag);
  if(state.avatarCSS){
    let st=$("#avatarStyle"); if(!st){st=document.createElement("style");st.id="avatarStyle";document.head.appendChild(st)}
    st.textContent=state.avatarCSS;
  }
}
function fillAddForm(){
  $("#addChannel").innerHTML=[...state.tabs.values()].map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  $("#addSpeaker").innerHTML=[...state.chars.keys()].map(n=>`<option>${esc(n)}</option>`).join("");
}
$("#addMessage").addEventListener("click",()=>$("#addDialog").showModal());
$("#addSystem").addEventListener("change",e=>$("#addSpeaker").disabled=e.target.checked);
$("#addForm").addEventListener("submit",e=>{
  if(e.submitter?.value!=="default")return;
  e.preventDefault();
  const d={id:"a"+Date.now()+Math.random().toString(36).slice(2),channel:$("#addChannel").value,speaker:$("#addSpeaker").value,system:$("#addSystem").checked,html:esc($("#addText").value).replace(/\n/g,"<br>"),avatar:"",deleted:false};
  if(!d.system)d.avatar=[...(state.chars.get(d.speaker)?.avatars||[])].find(Boolean)||"";
  state.added.push(d); $("#addText").value=""; $("#addDialog").close(); renderChat();
});
$("#filename").addEventListener("input",e=>{e.target.value=e.target.value.replace(/[\\/:*?"<>|]/g,"_")});

$("#download").addEventListener("click",()=>{
  if(!state.source)return;
  const doc=state.source.cloneNode(true);
  const list=doc.querySelector("main.message-list");
  if(!list)return;
  // 원본 메시지는 editor-id로 정확히 대응합니다.
  state.messages.forEach(d=>{
    const m=doc.querySelector(`main.message-list > article.message[data-editor-id="${d.id}"]`);
    if(!m)return;
    if(d.deleted){m.remove();return}
    const text=m.querySelector(".message-text"); if(text)text.innerHTML=d.html;
    const c=state.chars.get(d.speaker);
    if(c){
      const sp=m.querySelector(".speaker");
      if(sp){sp.textContent=c.name;sp.style.setProperty("--speaker-color",c.color);sp.style.color=c.color}
      const av=m.querySelector(".avatar");
      if(av && c.image)av.style.backgroundImage=`url("${c.image}")`;
      if(c.narration)m.classList.add("cr-narration"); else m.classList.remove("cr-narration");
    }
    const tab=state.tabs.get(d.channel);
    if(tab){
      m.dataset.channel=d.channel;
      m.style.backgroundColor=tab.color;
      if(tab.deleted)m.remove();
    }
  });
  // 추가 메시지는 원본 형식으로 최소한의 구조를 생성
  for(const d of state.added){
    if(state.tabs.get(d.channel)?.deleted)continue;
    const c=state.chars.get(d.speaker);
    const m=doc.createElement("article"); m.className="message"+(d.system?" system":""); m.dataset.channel=d.channel;
    const avatar=d.avatar?`<span class="avatar ${d.avatar}" aria-hidden="true"></span>`:"<span class=\"avatar avatar-spacer\" aria-hidden=\"true\"></span>";
    const meta=d.system?`<div class="message-header"><span class="channel-name">[${esc(d.channel)}]</span></div>`:`<div class="message-header"><span class="speaker" style="--speaker-color:${c?.color||"#333"}">${esc(c?.name||d.speaker)}</span><span class="timestamp"></span><span class="channel-name">[${esc(d.channel)}]</span></div>`;
    m.innerHTML=`${avatar}<div class="message-content">${meta}<div class="message-text">${d.html}</div></div>`;
    if(c?.image){const av=m.querySelector(".avatar");if(av)av.style.backgroundImage=`url("${c.image}")`}
    if(c?.narration)m.classList.add("cr-narration");
    m.style.backgroundColor=state.tabs.get(d.channel)?.color||"#fff";
    list.appendChild(m);
  }
  const st=doc.createElement("style"); st.textContent=`
body,.message,.message-text{font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif!important}
.cr-narration{display:block!important;width:100%!important;box-sizing:border-box!important;text-align:center!important;padding:12px 20px!important;background:var(--cr-tab-bg,#eee)!important}
.cr-narration .message-header,.cr-narration .avatar,.cr-narration .avatar-spacer{display:none!important}
.cr-narration .message-content,.cr-narration .message-text{width:100%!important;max-width:none!important;text-align:center!important}
.message.system{display:block!important;width:100%!important;box-sizing:border-box!important;text-align:center!important;background:inherit!important}
.message.system .message-header{display:none!important}
.message.system .message-text:before,.message.system .message-text:after{content:"";display:block;width:60px;height:1px;background:#ddd;margin-left:auto;margin-right:auto}
.message.system .message-text:before{margin-bottom:18px}.message.system .message-text:after{margin-top:18px}
`;
  doc.head.appendChild(st);
  const blob=new Blob(["<!doctype html>\n"+doc.documentElement.outerHTML],{type:"text/html;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=safeFile($("#filename").value);a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
