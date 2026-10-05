(() => {
  'use strict';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const state = {
    doc:null, fileName:'', tabs:new Map(), chars:new Map(), activeTab:null, avatarBackgrounds:new Map(),
    systemNarration:true, joinSameExpression:true, hideDeletedTabs:true
  };

  const fileInput=$('#fileInput'), fileInput2=$('#fileInput2');
  const outputFileName=$('#outputFileName');
  fileInput.addEventListener('change', e=>loadFile(e.target.files[0]));
  fileInput2.addEventListener('change', e=>loadFile(e.target.files[0]));
  $('#systemNarration').addEventListener('change', e=>{state.systemNarration=e.target.checked; render();});
  $('#joinSameExpression').addEventListener('change', e=>{state.joinSameExpression=e.target.checked; render();});
  $('#hideDeletedTabs').addEventListener('change', e=>{state.hideDeletedTabs=e.target.checked; render();});
  $('#downloadBtn').addEventListener('click', downloadResult);
  outputFileName.addEventListener('input', e=>{ e.target.value=e.target.value.replace(/[\\/:*?"<>|]/g,''); });
  $('#resetBtn').addEventListener('click', resetState);

  async function loadFile(file){
    if(!file) return;
    const text=await file.text();
    const parser=new DOMParser();
    const doc=parser.parseFromString(text,'text/html');
    if(!doc.querySelector('.message-list')){alert('COCORORIA 로그 형식의 HTML을 찾지 못했습니다.');return;}
    state.doc=doc; state.fileName=file.name; state.tabs=new Map(); state.chars=new Map(); state.avatarBackgrounds=new Map(); collectAvatarBackgrounds(doc);
    collectData(doc);
    $('#emptyState').hidden=true; $('#previewArea').hidden=false; $('#downloadBtn').disabled=false;
    $('#fileName').textContent=file.name;
    outputFileName.disabled=false;
    outputFileName.value=file.name.replace(/\.html?$/i,'')+'_변환';
    renderEditors(); render();
  }

  function collectAvatarBackgrounds(doc){
    $$('style',doc).forEach(st=>{
      const css=st.textContent||'';
      const re=/\.((?:avatar-image|avatar)-[^\s{]+)\s*\{[^}]*background-image\s*:\s*url\(\"?([^\")]+)\"?\)\s*;?/g;
      let m; while((m=re.exec(css))) state.avatarBackgrounds.set(m[1], `url(\"${m[2]}\")`);
    });
  }

  function collectData(doc){
    const articles=$$('.message',doc);
    const channelSet=new Set();
    articles.forEach(m=>{
      const channel=(m.dataset.channel||'main').trim()||'main';
      channelSet.add(channel);
      if(m.classList.contains('system')) return;
      const sp=$('.speaker',m); if(!sp) return;
      const name=sp.textContent.trim(); if(!name) return;
      const color=getSpeakerColor(sp); const avatar=getAvatar(m);
      if(!state.chars.has(name)) state.chars.set(name,{name,originalName:name,color,image:null,narration:false,count:0,defaultAvatar:avatar,expressions:new Map()});
      const c=state.chars.get(name); c.count++; if(!c.defaultAvatar && avatar) c.defaultAvatar=avatar;
      if(avatar) c.expressions.set(avatar,(c.expressions.get(avatar)||0)+1);
      if(!c.color) c.color=color||'#eee';
    });
    [...channelSet].forEach((name,i)=>state.tabs.set(name,{name,originalName:name,color:tabColor(i),deleted:false}));
    state.activeTab=[...state.tabs.keys()][0]||null;
  }

  function getSpeakerColor(sp){
    const inline=sp.getAttribute('style')||''; const m=inline.match(/--speaker-color\s*:\s*(#[0-9a-fA-F]{3,8})/); return m?m[1]:'#eee';
  }
  function getAvatar(m){
    const av=$('.avatar',m); if(!av) return '';
    const cls=av.className.match(/avatar-image-[^\s"']+/); if(cls) return cls[0];
    const bg=(av.getAttribute('style')||'').match(/background-image\s*:\s*url\(([^)]+)\)/); return bg?bg[1]:'';
  }
  function tabColor(i){return ['#777777','#9b6b6b','#6b8f9b','#8d7b59','#6f8f68','#806f9b'][i%6];}

  function renderEditors(){
    const tabsEditor=$('#tabsEditor'); tabsEditor.innerHTML='';
    for(const [id,t] of state.tabs){
      const row=$('#tabTemplate').content.firstElementChild.cloneNode(true);
      $('.tab-name',row).value=t.name; $('.tab-color',row).value=toHex(t.color);
      if(t.deleted) row.classList.add('deleted');
      $('.tab-name',row).addEventListener('input',e=>{t.name=e.target.value;render();});
      $('.tab-color',row).addEventListener('input',e=>{t.color=e.target.value;render();});
      $('.delete-tab',row).addEventListener('click',()=>{t.deleted=!t.deleted;renderEditors();render();});
      $('.delete-tab',row).textContent=t.deleted?'↶':'×'; $('.delete-tab',row).title=t.deleted?'탭 되살리기':'탭 삭제';
      tabsEditor.appendChild(row);
    }
    const chars=$('#charactersEditor'); chars.innerHTML='';
    for(const c of state.chars.values()){
      const card=$('#characterTemplate').content.firstElementChild.cloneNode(true);
      const av=$('.character-avatar',card); setAvatarBackground(av,c.image||c.defaultAvatar);
      $('.character-name',card).value=c.name; $('.character-count',card).textContent=`${c.count}개 메시지`;
      $('.character-color',card).value=toHex(c.color||'#eeeeee'); $('.character-narration',card).checked=c.narration;
      $('.character-name',card).addEventListener('input',e=>{c.name=e.target.value;render();});
      $('.character-color',card).addEventListener('input',e=>{c.color=e.target.value;render();});
      $('.character-narration',card).addEventListener('change',e=>{c.narration=e.target.checked;render();});
      $('.character-image',card).addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;c.image=await readDataURL(f);renderEditors();render();});
      $('.delete-character',card).addEventListener('click',()=>{c.name=c.originalName;c.color=getOriginalColor(c.originalName)||c.color;c.image=null;c.narration=false;renderEditors();render();});
      chars.appendChild(card);
    }
  }
  function getOriginalColor(name){return state.doc&&[...state.doc.querySelectorAll('.speaker')].find(s=>s.textContent.trim()===name)?getSpeakerColor([...state.doc.querySelectorAll('.speaker')].find(s=>s.textContent.trim()===name)):null;}
  function readDataURL(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});}
  function toHex(v){if(/^#[0-9a-f]{6}$/i.test(v||''))return v;return '#888888';}

  function render(){
    if(!state.doc)return;
    renderTabs();
    const preview=$('#preview'); preview.innerHTML='';
    const root=state.doc.querySelector('.message-list');
    const articles=$$('.message',root);
    let currentTab=null, prevSig=null, count=0;
    articles.forEach(m=>{
      const channel=(m.dataset.channel||'main').trim()||'main'; const tab=state.tabs.get(channel);
      if(!tab || (state.hideDeletedTabs&&tab.deleted)) return;
      if(currentTab!==channel){currentTab=channel;prevSig=null;}
      const out=makeMessage(m); if(!out)return;
      const isNarr=out.classList.contains('narration-row')||out.classList.contains('system-row');
      const sig=out.dataset.signature||'';
      if(state.joinSameExpression && prevSig && sig && sig===prevSig){out.classList.add('continuation');}
      else if(isNarr && prevSig && sig===prevSig){out.classList.add('continuation');}
      prevSig=sig; count++;
      let holder=preview.querySelector(`[data-tab-holder="${CSS.escape(channel)}"]`);
      if(!holder){holder=document.createElement('div');holder.className='message-list tab-holder';holder.dataset.tabHolder=channel;holder.hidden=state.activeTab!==channel;preview.appendChild(holder);}
      holder.appendChild(out);
    });
    $('#stats').textContent=` · ${count}개 메시지`;
    if(!preview.querySelector('.tab-holder')) preview.innerHTML='<div class="empty-state"><h2>표시할 메시지가 없습니다.</h2></div>';
  }

  function renderTabs(){
    const nav=$('#previewTabs');nav.innerHTML='';
    for(const [id,t] of state.tabs){if(state.hideDeletedTabs&&t.deleted)continue;const b=document.createElement('button');b.className='preview-tab';b.textContent=t.name;b.style.borderBottomColor=t.color;if(state.activeTab===id)b.classList.add('active');b.addEventListener('click',()=>{state.activeTab=id;renderTabs();render();});nav.appendChild(b);}
  }

  function makeMessage(m){
    if(m.classList.contains('system')){
      if(!state.systemNarration)return cloneNormal(m);
      const r=document.createElement('article');r.className='system-row';
      const text=$('.message-text',m);
      if(text){ const cloned=cloneText(text); r.appendChild(cloned); r.dataset.signature='system'; }
      return r;
    }
    const sp=$('.speaker',m);const text=$('.message-text',m);if(!sp||!text)return null;
    const original=sp.textContent.trim();const c=state.chars.get(original);if(!c)return null;
    const r=document.createElement('article');r.className='message-row';
    const avatar=document.createElement('div');avatar.className='message-avatar';setAvatarBackground(avatar,c.image||getAvatar(m));r.appendChild(avatar);
    const main=document.createElement('div');main.className='message-main';
    const meta=document.createElement('div');meta.className='message-meta';
    const speaker=document.createElement('span');speaker.className='message-speaker';speaker.textContent=c.name;speaker.style.color=c.color||'#eee';meta.appendChild(speaker);
    const time=$('.timestamp',m);if(time){const t=document.createElement('span');t.className='message-time';t.textContent=time.textContent;meta.appendChild(t);}
    const ch=document.createElement('span');ch.className='message-channel';ch.textContent=`[${(m.dataset.channel||'main')}]`;meta.appendChild(ch);
    main.appendChild(meta);main.appendChild(cloneText(text));r.appendChild(main);
    const avatarSig=getAvatar(m)||'no-avatar';r.dataset.signature=c.narration?'narration':`${original}|${c.image?'custom':avatarSig}`;
    if(c.narration){r.className='message-row narration-row';}
    return r;
  }
  function cloneNormal(m){
    const r=document.createElement('article');r.className='message-row';
    const avatar=document.createElement('div');avatar.className='message-avatar';setAvatarBackground(avatar,getAvatar(m));r.appendChild(avatar);
    const main=document.createElement('div');main.className='message-main';const meta=document.createElement('div');meta.className='message-meta';
    const sp=$('.speaker',m);if(sp){const s=document.createElement('span');s.className='message-speaker';s.textContent=sp.textContent;s.style.color=getSpeakerColor(sp);meta.appendChild(s);}main.appendChild(meta);const text=$('.message-text',m);if(text)main.appendChild(cloneText(text));r.appendChild(main);r.dataset.signature=getAvatar(m)||'normal';return r;
  }
  function cloneText(el){const d=document.createElement('div');d.className='message-text';d.innerHTML=el.innerHTML;return d;}
  function setAvatarBackground(el,src){if(!src){el.style.backgroundImage='none';return;}if(src.startsWith('data:')||src.startsWith('http')||src.startsWith('url(')){el.style.backgroundImage=src.startsWith('url(')?src:`url("${src}")`;return;}const av=state.doc&&state.doc.querySelector('.'+CSS.escape(src));if(av){const cs=state.doc.defaultView?state.doc.defaultView.getComputedStyle(av):null;const bg=cs&&cs.backgroundImage&&cs.backgroundImage!=='none'?cs.backgroundImage:'';if(bg){el.style.backgroundImage=bg;return;}}el.style.backgroundImage='none';}

  function buildOutput(){
    const doc=state.doc.cloneNode(true);
    const root=doc.querySelector('.message-list'); if(!root)return doc;
    const style=doc.createElement('style');style.textContent=`
      .cr-hidden-tab{display:none!important}
      .cr-narration,.cr-system{display:block!important;width:100%!important;box-sizing:border-box!important;background:#f5f5f5!important;margin:0!important;padding:14px 24px!important;border:0!important;text-align:center!important}
      .cr-narration .message-header,.cr-narration .avatar,.cr-narration .avatar-spacer,.cr-system .message-header{display:none!important}
      .cr-narration .message-content,.cr-narration .message-text,.cr-system .message-text{width:100%!important;max-width:none!important;box-sizing:border-box!important;text-align:center!important}
      .cr-system{background:#fff!important;padding:34px 20px 32px!important}
      .cr-system .message-text{display:flex!important;flex-direction:column!important;align-items:center!important;font-size:16px!important}
      .cr-system .message-text:before,.cr-system .message-text:after{content:"";display:block;width:60px;height:1px;background:#ddd}
      .cr-system .message-text:before{margin-bottom:20px}
      .cr-system .message-text:after{margin-top:20px}
      .cr-continuation{padding-top:2px!important;padding-bottom:2px!important;border-bottom-color:transparent!important}
    `;doc.head.appendChild(style);
    const articles=[...root.querySelectorAll('.message')]; let currentTab=null,prevSig=null;
    articles.forEach(m=>{
      const channel=(m.dataset.channel||'main').trim()||'main';const tab=state.tabs.get(channel);if(!tab)return;
      if(state.hideDeletedTabs&&tab.deleted){m.classList.add('cr-hidden-tab');return;}
      if(currentTab!==channel){currentTab=channel;prevSig=null;}
      m.classList.remove('cr-narration','cr-system','cr-continuation');
      if(m.classList.contains('system')){if(state.systemNarration){m.classList.add('cr-system');const sig='system';if(state.joinSameExpression&&sig===prevSig)m.classList.add('cr-continuation');prevSig=sig;}return;}
      const sp=m.querySelector('.speaker');if(!sp)return;const c=state.chars.get(sp.textContent.trim());if(!c)return;
      sp.textContent=c.name;sp.style.setProperty('--speaker-color',c.color||'#eee');
      const av=m.querySelector('.avatar');
      if(c.image&&av)av.style.backgroundImage=`url("${c.image}")`;
      if(c.narration){m.classList.add('cr-narration');const sig='narration';if(state.joinSameExpression&&sig===prevSig)m.classList.add('cr-continuation');prevSig=sig;}
      else{const sig=`${sp.textContent.trim()}|${c.image?'custom':getAvatar(m)}`;if(state.joinSameExpression&&sig===prevSig)m.classList.add('cr-continuation');prevSig=sig;}
    });
    doc.title=(doc.title||state.fileName.replace(/\.html?$/i,''))+' - 변환';
    return doc;
  }
  function downloadResult(){
    const doc=buildOutput();
    const html='<!doctype html>\n'+doc.documentElement.outerHTML;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    let name=(outputFileName.value||state.fileName.replace(/\.html?$/i,'')+'_변환').trim();
    name=name.replace(/[\\/:*?"<>|]/g,'');
    if(!name) name='변환된_로그';
    if(!/\.html?$/i.test(name)) name+='.html';
    a.download=name;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function resetState(){if(!state.doc)return;collectData(state.doc);renderEditors();render();}
})();
