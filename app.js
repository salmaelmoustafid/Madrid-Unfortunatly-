/* Madrid, unfortunately. — static edition with Supabase-backed player authentication. Shared data sync is the next integration stage. */
(() => {
  const $ = (s, root=document) => root.querySelector(s), $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const STORE = 'madrid-unfortunately-static-v1';
  const initialAdventures = [
    ['Go to a museum','Museums','Museo del Prado'],['Go to a club','Nightlife',''],['Wear wigs and go out','Chaotic',''],['Have a picnic in El Retiro','Explore','Parque del Retiro'],['Try a new cuisine','Food & Drink',''],['Go to a rooftop bar','Nightlife',''],['Take a day trip','Explore',''],['Go to a concert','Culture',''],['Visit a market','Food & Drink','El Rastro'],['Do something random','Chaotic','']
  ].map((a,i)=>({id:'a'+i,title:a[0],category:a[1],place:a[2],description:'',completedBy:[]}));
  const seedQuests = [
    ['Take a photo of a street cat','📸',5],['Order something you have never tried before','☕',5],['Speak Spanish all day — no English allowed','💬',10],['Find a random event in Madrid','⭐',10],['Do something spontaneous','🪽',15],['Make a playlist titled “Madrid, unfortunately.”','♫',5]
  ];
  const museums=['Museo del Prado','Museo Reina Sofía','Museo Thyssen-Bornemisza','Museo Sorolla','Museo Arqueológico Nacional','Museo Cerralbo','Museo del Romanticismo','Museo de América'];
  const sideIdeas=['Invent an elaborate history for an old building. Accuracy is not expected.','Find a street you have never walked down. Revolutionary.','Visit a bookshop and judge books by their covers.','Take a different route home. Try not to get lost.','Find the most dramatic doorway in your neighbourhood.','Have an unplanned afternoon. No committee meeting required.','Find the prettiest tiled doorway you can.','Go somewhere just because the name sounds interesting.','Ask for a recommendation and actually follow it.','Find a tiny hidden square and sit there for ten minutes.'];
  const places=[
    ['Museo del Prado',40.4138,-3.6921,'Museums'],['Museo Reina Sofía',40.4086,-3.6940,'Museums'],['Museo Thyssen-Bornemisza',40.4160,-3.6947,'Museums'],['Parque del Retiro',40.4153,-3.6844,'Explore'],['Puerta del Sol',40.4169,-3.7035,'Explore'],['El Rastro',40.4087,-3.7074,'Food & Drink'],['Malasaña',40.4260,-3.7040,'Nightlife'],['Chueca',40.4220,-3.6970,'Nightlife'],['La Latina',40.4110,-3.7080,'Explore']
  ];
  let state = load(), currentUser='', selectedCharacter='alisha', activeFilter='All', memoryFilter='All', map=null, markers=[], pendingPin=false, dragged=null, toastTimer;
  const authPlayers = { alisha: 'alisha@madrid-unfortunately.invalid', eva: 'eva@madrid-unfortunately.invalid' };
  const supabaseClient = window.supabase && window.MADRID_SUPABASE_CONFIG?.url && window.MADRID_SUPABASE_CONFIG?.publishableKey
    ? window.supabase.createClient(window.MADRID_SUPABASE_CONFIG.url, window.MADRID_SUPABASE_CONFIG.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;
  function load(){try{const x=JSON.parse(localStorage.getItem(STORE));if(x)return {...x,adventures:x.adventures||initialAdventures,quests:x.quests||[],memories:x.memories||[],customPlaces:x.customPlaces||[],currentActivity:x.currentActivity||null,profilePhotos:x.profilePhotos||{}}}catch(e){}return {adventures:initialAdventures,quests:[],memories:[],customPlaces:[],currentActivity:null,profilePhotos:{}}}
  function save(){localStorage.setItem(STORE,JSON.stringify(state));updateStats();renderLatest();renderBucket();renderQuests();renderScrapbook();renderCurrentActivity();}
  const playerEmail = {alisha:'alisha@madrid-unfortunately.invalid',eva:'eva@madrid-unfortunately.invalid'};
  let realtimeChannel=null, sharedSyncBusy=false;
  async function persistAdventure(a){
    if(!supabaseClient || !currentUser) return;
    const row={id:uuidOrNull(a.id),title:a.title,category:a.category||'Explore',place:a.place||null,description:a.description||null,status:(a.completedBy||[]).length?'completed':'planned',created_by:a.createdBy||currentUser,completed_by:a.completedBy||[],completed_at:(a.completedBy||[]).length?(a.completedAt||new Date().toISOString()):null,completion_comment:a.completionComment||null};
    if(!row.id) delete row.id;
    const {error}=await supabaseClient.from('adventures').upsert(row);
    if(error){console.error(error);toast('Could not sync adventure: '+error.message)}
  }
  function uuidOrNull(id){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''))?id:null}
  async function persistPin(pin){
    if(!supabaseClient || !currentUser) return;
    const row={id:uuidOrNull(pin.id),title:pin.name||pin.title||'Custom place',category:pin.category||'Custom',latitude:Number(pin.lat),longitude:Number(pin.lng),note:pin.note||null,created_by:currentUser};
    if(!row.id) delete row.id;
    const {error}=await supabaseClient.from('map_pins').upsert(row);
    if(error){console.error(error);toast('Could not sync map pin: '+error.message)}
  }
  async function persistSideQuest(q){
    if(!supabaseClient || !currentUser) return;
    const row={id:uuidOrNull(q.id),title:q.title,icon:q.icon||'✦',points:q.points||10,completed_by:(q.completedBy||[currentUser])[0]||currentUser,completion_comment:q.completionComment||null};
    if(!row.id) delete row.id;
    const {error}=await supabaseClient.from('side_quests').upsert(row);
    if(error){console.error(error);toast('Could not sync side quest: '+error.message)}
  }
  async function syncSharedData(){
    if(!supabaseClient || !currentUser || sharedSyncBusy) return;
    sharedSyncBusy=true;
    try{
      const [aRes,qRes,pRes]=await Promise.all([
        supabaseClient.from('adventures').select('*').order('created_at',{ascending:true}),
        supabaseClient.from('side_quests').select('*').order('completed_at',{ascending:true}),
        supabaseClient.from('map_pins').select('*').order('created_at',{ascending:true})
      ]);
      for(const r of [aRes,qRes,pRes]) if(r.error) throw r.error;
      // First authenticated visit: move this browser's existing list into the shared database.
      if(!aRes.data.length && state.adventures.length){
        for(const a of state.adventures) await persistAdventure(a);
        const {data,error}=await supabaseClient.from('adventures').select('*').order('created_at',{ascending:true});
        if(error) throw error;
        aRes.data=data;
      }
      if(!qRes.data.length && state.quests.length){
        for(const q of state.quests) await persistSideQuest(q);
        const {data,error}=await supabaseClient.from('side_quests').select('*').order('completed_at',{ascending:true});
        if(error) throw error;
        qRes.data=data;
      }
      if(!pRes.data.length && state.customPlaces.length){
        for(const pin of state.customPlaces) await persistPin(pin);
        const {data,error}=await supabaseClient.from('map_pins').select('*').order('created_at',{ascending:true});
        if(error) throw error;
        pRes.data=data;
      }
      state.adventures=(aRes.data||[]).map(r=>({id:r.id,title:r.title,category:r.category,place:r.place||'',description:r.description||'',completedBy:r.completed_by||[],createdBy:r.created_by,completedAt:r.completed_at,completionComment:r.completion_comment||''}));
      state.quests=(qRes.data||[]).map(r=>({id:r.id,title:r.title,icon:r.icon||'✦',points:r.points||0,completedBy:[r.completed_by],detail:'Side quest',completionComment:r.completion_comment||''}));
      state.customPlaces=(pRes.data||[]).map(r=>({id:r.id,name:r.title,lat:r.latitude,lng:r.longitude,category:r.category,note:r.note}));
      localStorage.setItem(STORE,JSON.stringify(state));
      updateStats();renderLatest();renderBucket();renderQuests();renderScrapbook();renderCurrentActivity();if(map)drawMarkers();
      $('#statusText').textContent='SIGNED IN · SHARED DATA SYNCED';
      startRealtime();
    }catch(err){
      console.error('Shared data sync failed:',err);
      $('#statusText').textContent='SIGNED IN · SYNC ERROR';
      toast('Supabase sync failed. Check database permissions.');
    }finally{sharedSyncBusy=false}
  }
  function startRealtime(){
    if(!supabaseClient || realtimeChannel) return;
    realtimeChannel=supabaseClient.channel('madrid-shared-data')
      .on('postgres_changes',{event:'*',schema:'public',table:'adventures'},()=>syncSharedData())
      .on('postgres_changes',{event:'*',schema:'public',table:'side_quests'},()=>syncSharedData())
      .on('postgres_changes',{event:'*',schema:'public',table:'map_pins'},()=>syncSharedData())
      .subscribe();
  }

  function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
  function showModal(title,html){$('#modalTitle').textContent=title;$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.add('open')}
  function closeModal(){$('#modalBackdrop').classList.remove('open');$('#modalContent').innerHTML=''}
  function page(id){$$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+id));$$('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));$('#sidebar').classList.remove('open');if(id==='map'&&map)setTimeout(()=>map.invalidateSize(),120);if(id==='bucket')renderBucket();if(id==='quests')renderQuests();if(id==='scrapbook')renderScrapbook();if(id==='characters')renderCharacter(selectedCharacter)}
  function updateStats(){const done=state.adventures.filter(a=>a.completedBy?.length).length;$('#progressCount').textContent=`${done} / ${state.adventures.length}`;$('#progressFill').style.width=(state.adventures.length?done/state.adventures.length*100:0)+'%';$('#plannedCount').textContent=state.adventures.length-done;$('#doneCount').textContent=done;$('#questCount').textContent=state.quests.length;$('#memoryCount').textContent=state.memories.length}
  function renderLatest(){const el=$('#latestMemories');if(!state.memories.length){el.innerHTML='<p class="empty-small">No memories yet. The evidence will arrive eventually.</p>';return}el.innerHTML=state.memories.slice(-3).reverse().map(m=>`<div class="latest-item"><img src="${m.url}" alt=""><small>${esc(m.caption||m.name||'A Madrid memory')}</small></div>`).join('')}
  function suggestedComment(title, category=''){
    const t=(title||'').toLowerCase(), c=(category||'').toLowerCase();
    if(/museum|prado|reina sof[ií]a|thyssen/.test(t)) return 'You voluntarily entered an educational building. Look at you.';
    if(/club|rooftop|bar|nightlife|concert|party/.test(t)||c==='nightlife') return 'Sleep schedule: officially a historical document.';
    if(/picnic|retiro|park|walk|street|explore/.test(t)||c==='explore') return 'Great, you left the house. Character development.';
    if(/food|cuisine|restaurant|eat|try|order/.test(t)||c==='food & drink') return 'A brave culinary decision. The stomach has been informed.';
    if(/market|rastro|shop|bookshop/.test(t)) return 'You went shopping. The economy thanks you.';
    if(/day trip|train|travel/.test(t)) return 'You left the city limits. Madrid will manage without you.';
    if(/cat|photo|picture/.test(t)) return 'You collected evidence. The paparazzi era begins.';
    if(/spanish|language|speak/.test(t)) return 'You spoke Spanish all day? Who are you trying to impress?';
    if(/spontaneous|random|unplanned/.test(t)) return 'You made plans without a plan. Somehow, it worked.';
    if(/playlist|music|song/.test(t)) return 'The soundtrack has been secured. Critics are pending.';
    const options=[
      'Against all odds, you actually did the thing.',
      'Task completed. Please update your very important imaginary CV.',
      'Look at you, following through on a plan.',
      'A questionable use of your time. You would absolutely do it again.',
      'You came, you saw, you made it everyone’s problem.',
      'Another extremely niche achievement unlocked. Well done, you.'
    ];
    let hash=0; for(let i=0;i<(title||'').length;i++) hash=(hash*31+title.charCodeAt(i))|0;
    return options[Math.abs(hash)%options.length];
  }
  function renderBucket(){const list=$('#adventureList');if(!list)return;const rows=state.adventures.filter(a=>activeFilter==='All'||a.category===activeFilter);list.innerHTML=rows.map(a=>{const done=a.completedBy?.length;return `<article class="adventure-card ${done?'done':''}"><button class="quest-check" data-complete="${a.id}" aria-label="Mark complete">${done?'✓':''}</button><div class="adventure-copy"><b>${esc(a.title)}</b><small>${esc(a.category)}${a.place?' · '+esc(a.place):''}</small>${a.description?`<p>${esc(a.description)}</p>`:''}${done?`<p class="done-stamp">✓ COMPLETED BY ${a.completedBy.map(x=>x.toUpperCase()).join(' + ')}</p>`:`<button class="mini-action" data-start-adventure="${a.id}">CURRENTLY DOING THIS →</button>`}</div></article>`}).join('')||'<div class="empty-state">Nothing in this category yet.</div>';$('#museumList').innerHTML=museums.map(m=>`<button class="museum-button" data-museum="${esc(m)}">＋ ${esc(m)}</button>`).join('')}
  function renderQuests(){const el=$('#questHistory');if(!el)return;if(!state.quests.length){el.innerHTML='<div class="empty-state"><div style="font-size:28px">✧</div><b>NO SIDE QUESTS COMPLETED… YET.</b><p>Generate a random side quest from Quick Actions on the map. Once completed, it will be recorded here.</p></div>';return}el.innerHTML=[...state.quests].reverse().map(q=>`<article class="quest-row"><span class="quest-icon">${q.icon||'✦'}</span><div><b>${esc(q.title)}</b><small>${esc(q.detail||'Side quest')} · ${esc((q.completedBy||[]).map(x=>x.toUpperCase()).join(' + ')||'Completed')}</small>${q.completionComment?`<p class="completion-snark">“${esc(q.completionComment)}”</p>`:''}</div><span class="points">+${q.points||0} PTS</span></article>`).join('')}
  function renderScrapbook(){const el=$('#scrapbookGrid');if(!el){return}const rows=state.memories.filter(m=>memoryFilter==='All'||m.by===memoryFilter);el.innerHTML=rows.length?rows.map(m=>`<article class="memory-card"><img src="${m.url}" alt="${esc(m.caption||'Memory')}"><input data-caption="${m.id}" value="${esc(m.caption||'') }" placeholder="Add a caption…"><div class="memory-meta"><span>${(m.by||'').toUpperCase()} · ${esc(m.date||'')}</span><button class="text-link" data-delete-memory="${m.id}">REMOVE</button></div></article>`).join(''):'<div class="empty-state" style="grid-column:1/-1"><div style="font-size:28px">ʚɞ</div><b>THE SCRAPBOOK IS WAITING.</b><p>Upload your first photo. No sample memories — only your actual evidence.</p></div>'}
  function renderCharacter(who){
    selectedCharacter=who;$$('.character-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.character===who));
    const name=who==='alisha'?'Alisha':'Eva', photo=state.profilePhotos?.[who]||'';
    const done=state.adventures.filter(a=>(a.completedBy||[]).includes(who)).length;
    const questCount=state.quests.filter(q=>(q.completedBy||[]).includes(who)).length;
    const photoCount=state.memories.filter(m=>m.by===who||m.by==='both').length;
    const achievements=[['First steps','Complete your first adventure',done>=1],['Culture vulture','Visit a museum',state.adventures.some(a=>a.category==='Museums'&&(a.completedBy||[]).includes(who))],['Out after dark','Complete a nightlife adventure',state.adventures.some(a=>a.category==='Nightlife'&&(a.completedBy||[]).includes(who))],['Side quester','Complete a side quest',questCount>=1],['Memory collector','Add a scrapbook memory',photoCount>=1],['Madrid local-ish','Complete five adventures',done>=5]];
    $('#characterProfile').innerHTML=`<div class="profile-art"><div class="profile-avatar">${photo?`<img src="${photo}" alt="${name} profile picture">`:'<span>ʚɞ</span>'}</div><label class="pixel-button profile-upload">＋ ADD PICTURE<input id="profilePhotoUpload" type="file" accept="image/*" hidden></label></div><div class="profile-info"><p class="eyebrow">PLAYER PROFILE</p><h2>${name.toUpperCase()}</h2><div class="stat-grid"><div><b>${done}</b><small>ADVENTURES</small></div><div><b>${questCount}</b><small>SIDE QUESTS</small></div><div><b>${photoCount}</b><small>MEMORIES</small></div></div><h3 class="achievement-heading">ACHIEVEMENTS</h3><div class="achievement-grid">${achievements.map(a=>`<div class="achievement ${a[2]?'':'locked'}"><b>${a[2]?'✧':'□'} ${a[0]}</b>${a[1]}</div>`).join('')}</div></div>`;
    $('#profilePhotoUpload').onchange=async e=>{const f=e.target.files[0];if(!f)return;const url=await new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(f)});state.profilePhotos=state.profilePhotos||{};state.profilePhotos[who]=url;save();renderCharacter(who)};
  }
  function renderCurrentActivity(){
    const el=$('#currentActivity');if(!el)return;const a=state.currentActivity;
    if(!a){el.innerHTML='<p class="empty-small">Nothing underway. Pick an adventure or accept a side quest.</p>';return}
    el.innerHTML=`<div class="current-label">${esc(a.type.toUpperCase())}</div><b class="current-title">${esc(a.title)}</b><small>Started by ${(a.startedBy||currentUser).toUpperCase()}</small><div class="current-actions"><button class="mini-action" id="finishCurrent">MARK COMPLETE</button><button class="mini-action muted" id="clearCurrent">CLEAR</button></div>`;
    $('#finishCurrent').onclick=()=>{
      if(a.type==='BUCKET LIST'){const item=state.adventures.find(x=>x.id===a.id);if(item){showModal('ADVENTURE COMPLETED',`<p>Who completed this adventure?</p><div class="completion-options"><label><input type="radio" name="who" value="alisha"> Alisha</label><label><input type="radio" name="who" value="eva"> Eva</label><label><input type="radio" name="who" value="both"> Both</label></div><div class="modal-actions"><button class="secondary-button" id="cancelModal">CANCEL</button><button class="pixel-button" id="confirmDone">CONFIRM</button></div>`);$('#confirmDone').onclick=()=>{const who=$('input[name="who"]:checked');if(!who)return toast('Choose who completed it.');item.completedBy=who.value==='both'?['alisha','eva']:[who.value];item.completedAt=new Date().toISOString();state.currentActivity=null;save();persistAdventure(item);closeModal();toast('Adventure completed!')}}}
      else {showModal('SIDE QUEST COMPLETED',`<p style="font: bold 15px Georgia,serif">${esc(a.title)}</p><label class="form-field">YOUR COMMENT<input id="completionComment" maxlength="180" value="${esc(suggestedComment(a.title,'Side Quest'))}"></label><div class="modal-actions"><button class="secondary-button" id="cancelModal">CANCEL</button><button class="pixel-button" id="saveSideQuest">SAVE COMPLETION</button></div>`);$('#saveSideQuest').onclick=()=>{const completedQuest={id:crypto.randomUUID(),title:a.title,detail:'Side quest',icon:'✦',points:10,completedBy:[currentUser],completionComment:$('#completionComment').value.trim()||suggestedComment(a.title,'Side Quest')};state.quests.push(completedQuest);state.currentActivity=null;save();persistSideQuest(completedQuest);closeModal();toast('Quest completed. Historic, really.')}}
    };
    $('#clearCurrent').onclick=()=>{state.currentActivity=null;save();toast('Current activity cleared.')};
  }
  function addAdventureForm(){showModal('ADD AN ADVENTURE',`<form id="adventureForm"><label class="form-field">ADVENTURE NAME<input name="title" required placeholder="What should we do?"></label><label class="form-field">CATEGORY<select name="category">${['Museums','Nightlife','Explore','Food & Drink','Culture','Chaotic'].map(x=>`<option>${x}</option>`).join('')}</select></label><label class="form-field">PLACE (OPTIONAL)<input name="place" placeholder="Specific place in Madrid"></label><label class="form-field">NOTES (OPTIONAL)<textarea name="description" placeholder="Any details or ideas…"></textarea></label><div class="modal-actions"><button type="button" class="secondary-button" id="cancelModal">CANCEL</button><button class="pixel-button">ADD TO BUCKET LIST</button></div></form>`);$('#adventureForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);state.adventures.push({id:crypto.randomUUID(),title:f.get('title').trim(),category:f.get('category'),place:f.get('place').trim(),description:f.get('description').trim(),completedBy:[],createdBy:currentUser});const added=state.adventures[state.adventures.length-1];save();persistAdventure(added);if(map)drawMarkers();closeModal();toast('Adventure added. Make it happen.')}}
  function completionForm(id){
    const a=state.adventures.find(x=>x.id===id);if(!a)return;
    showModal('ADVENTURE COMPLETED',`<p style="font: bold 15px Georgia,serif">${esc(a.title)}</p><p style="font-size:11px">Who completed this adventure?</p><div class="completion-options"><label><input type="radio" name="who" value="alisha" ${a.completedBy?.includes('alisha')?'checked':''}> Alisha</label><label><input type="radio" name="who" value="eva" ${a.completedBy?.includes('eva')?'checked':''}> Eva</label><label><input type="radio" name="who" value="both" ${a.completedBy?.length===2?'checked':''}> Both</label></div><label class="form-field">YOUR COMMENT<input id="completionComment" maxlength="180" value="${esc(a.completionComment||suggestedComment(a.title,a.category))}"></label><div class="modal-actions"><button class="secondary-button" id="cancelModal">CANCEL</button><button class="pixel-button" id="confirmDone">CONFIRM</button></div>`);
    $('#confirmDone').onclick=()=>{const who=$('input[name="who"]:checked');if(!who){toast('Choose who completed it.');return}a.completedBy=who.value==='both'?['alisha','eva']:[who.value];a.completedAt=new Date().toISOString();a.completionComment=$('#completionComment').value.trim()||suggestedComment(a.title,a.category);save();persistAdventure(a);closeModal();if(map)drawMarkers();toast(a.completionComment)};
  }
  function generateQuest(){const idea=sideIdeas[Math.floor(Math.random()*sideIdeas.length)];showModal('RANDOM SIDE QUEST',`<div style="text-align:center;padding:10px"><div style="font-size:35px">🎲</div><p class="eyebrow">YOUR NEXT QUESTIONABLE MISSION</p><h2 style="font: bold 20px Georgia,serif;line-height:1.4">${esc(idea)}</h2><p style="font-size:10px;color:#81768b">Worth 10 points · Complete it to add it to Side Quests.</p></div><div class="modal-actions"><button class="secondary-button" id="rerollQuest">REROLL</button><button class="pixel-button" id="acceptQuest">ACCEPT QUEST</button></div>`);$('#rerollQuest').onclick=generateQuest;$('#acceptQuest').onclick=()=>{state.currentActivity={id:crypto.randomUUID(),type:'SIDE QUEST',title:idea,startedBy:currentUser};save();closeModal();toast('Added to CURRENTLY. Go forth.')};}
  function initMap(){if(!window.L)return;if(map){setTimeout(()=>map.invalidateSize(),120);drawMarkers();return}map=L.map('map',{zoomControl:true}).setView([40.4168,-3.7038],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(map);map.on('click',e=>{if(!pendingPin)return;pendingPin=false;const label=prompt('Name this place on the map:','Custom place');if(!label){toast('Map pin cancelled.');return}const place={id:crypto.randomUUID(),name:label.trim(),lat:e.latlng.lat,lng:e.latlng.lng,category:'Custom'};state.customPlaces.push(place);save();persistPin(place);drawMarkers();toast('Custom map pin saved and shared.');});drawMarkers()}
  function drawMarkers(){
    if(!map)return;markers.forEach(m=>map.removeLayer(m));markers=[];
    const all=[...places.map(p=>({name:p[0],lat:p[1],lng:p[2],category:p[3],predefined:true})),...state.customPlaces.map(p=>({name:p.name,lat:p.lat,lng:p.lng,category:p.category||'Custom',id:p.id}))];
    all.forEach(p=>{
      const related=state.adventures.filter(a=>a.place&&a.place.toLowerCase()===p.name.toLowerCase());
      const completed=related.some(a=>(a.completedBy||[]).length);
      const planned=related.length>0&&!completed;
      const symbol=completed?'✦':planned?'◆':p.category==='Custom'?'📍':'ʚɞ';
      const icon=L.divIcon({className:'',html:`<span style="font-size:22px;color:${completed?'#37a8a2':planned?'#d62eb8':'#8a59c7'};text-shadow:1px 1px #fff, -1px -1px #fff;filter:drop-shadow(1px 2px 1px #aaa)">${symbol}</span>`,iconSize:[28,28],iconAnchor:[14,24]});
      const status=completed?'Completed adventure':planned?'Planned adventure':'Madrid place';
      const popup=`<b>${esc(p.name)}</b><br>${status}<br><button onclick="window.addPlaceFromPopup('${String(p.name).replace(/'/g,"\\'")}','${p.category}')">＋ Add to bucket list</button>`;
      const marker=L.marker([p.lat,p.lng],{icon}).addTo(map).bindPopup(popup);markers.push(marker);
    });
  }
  window.addPlaceFromPopup=(name,cat)=>{if(!state.adventures.some(a=>a.title===`Visit ${name}`)){const a={id:crypto.randomUUID(),title:`Visit ${name}`,category:cat,place:name,description:'',completedBy:[],createdBy:currentUser};state.adventures.push(a);save();persistAdventure(a);toast('Added to your bucket list.')}};
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function showCodeStep(chosen){selectedCharacter=chosen;const name=chosen==='alisha'?'ALISHA':'EVA';$('#chosenName').textContent=name;$('#playerStep').classList.add('hidden');$('#codeStep').classList.remove('hidden');$('#loginError').textContent='';$('#accessCode').value='';requestAnimationFrame(()=>$('#accessCode').focus());}
  function showPlayerStep(){$('#codeStep').classList.add('hidden');$('#playerStep').classList.remove('hidden');$('#loginError').textContent='';$('#accessCode').value='';}
  async function login(){
    const chosen=selectedCharacter, code=$('#accessCode').value.trim(), button=$('#loginForm button[type=submit]');
    if(!supabaseClient){$('#loginError').textContent='Login is not configured yet. Please try again later.';return}
    if(!code){$('#loginError').textContent='Enter your secret code to continue.';return}
    button.disabled=true;button.textContent='…';$('#loginError').textContent='';
    try{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email:authPlayers[chosen],password:code});
      if(error) throw error;
      currentUser=chosen;
      await openApp(chosen);
    }catch(err){
      console.error('Supabase login failed:',err);
      $('#loginError').textContent='That code is not quite right. Try again.';
      $('#accessCode').select();
    }finally{button.disabled=false;button.textContent='➜'}
  }
  async function openApp(player){
    currentUser=player;$('#loginScreen').classList.add('hidden');$('#app').classList.remove('hidden');
    $('#signedIn').textContent='PLAYER: '+player.toUpperCase();
    initMap();updateStats();renderLatest();renderBucket();renderQuests();renderScrapbook();renderCurrentActivity();renderCharacter(player);
    $('#statusText').textContent='SIGNED IN · CONNECTING…';
    await syncSharedData();
  }
  async function logout(){
    if(realtimeChannel&&supabaseClient){await supabaseClient.removeChannel(realtimeChannel);realtimeChannel=null;}
    if(supabaseClient) await supabaseClient.auth.signOut();
    currentUser='';$('#app').classList.add('hidden');$('#loginScreen').classList.remove('hidden');showPlayerStep();
    $$('.character-choice').forEach(b=>b.classList.remove('selected'));
  }
  // Two-stage entrance: player selection first, secret code second.
  $$('.character-choice').forEach(b=>b.addEventListener('click',()=>{showCodeStep(b.dataset.login)}));$('#backToPlayers').onclick=showPlayerStep;$('#loginForm').addEventListener('submit',e=>{e.preventDefault();login()});$('#logout').onclick=logout;
  $$('.nav-button').forEach(b=>b.onclick=()=>page(b.dataset.page));$$('[data-go]').forEach(b=>b.onclick=()=>page(b.dataset.go));$('#menuToggle').onclick=()=>$('#sidebar').classList.toggle('open');
  // Window controls and dragging
  $$('[data-min]').forEach(b=>b.onclick=()=>{$(`[data-window="${b.dataset.min}"]`).classList.toggle('minimized')});$$('[data-close]').forEach(b=>b.onclick=()=>{$(`[data-window="${b.dataset.close}"]`).classList.add('closed')});$('#restoreWindows').onclick=()=>{$$('.window').forEach(w=>w.classList.remove('closed','minimized'));toast('All map windows restored.')};$$('.window').forEach(w=>{const bar=$('.window-bar',w);bar.addEventListener('pointerdown',e=>{if(e.target.closest('button')||innerWidth<650)return;const r=w.getBoundingClientRect();dragged={w,x:e.clientX,y:e.clientY,left:r.left,top:r.top};bar.setPointerCapture(e.pointerId)});bar.addEventListener('pointermove',e=>{if(!dragged||dragged.w!==w)return;w.style.left=Math.max(0,dragged.left+e.clientX-dragged.x)+'px';w.style.top=Math.max(62,dragged.top+e.clientY-dragged.y)+'px';w.style.right='auto';w.style.bottom='auto'});bar.addEventListener('pointerup',()=>dragged=null);});
  // Main actions
  $('#quickAdd').onclick=$('#addAdventure').onclick=addAdventureForm;$('#quickRandom').onclick=$('#questGenerator').onclick=generateQuest;$('#quickPin').onclick=()=>{pendingPin=true;page('map');toast('Click anywhere on the map to drop a custom pin.')};$('#modalClose').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};
  $('#bucketFilters').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;activeFilter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderBucket()};$('#adventureList').onclick=e=>{const done=e.target.closest('[data-complete]');if(done){completionForm(done.dataset.complete);return}const start=e.target.closest('[data-start-adventure]');if(start){const a=state.adventures.find(x=>x.id===start.dataset.startAdventure);if(a){state.currentActivity={id:a.id,type:'BUCKET LIST',title:a.title,startedBy:currentUser};save();toast('Added to CURRENTLY.')}}};$('#museumList').onclick=e=>{const b=e.target.closest('[data-museum]');if(!b)return;const name=b.dataset.museum;if(!state.adventures.some(a=>a.title===`Visit ${name}`)){const a={id:crypto.randomUUID(),title:`Visit ${name}`,category:'Museums',place:name,description:'',completedBy:[],createdBy:currentUser};state.adventures.push(a);save();persistAdventure(a);toast(`${name} added to your bucket list.`)}else toast('That museum is already on the list.')};
  $('#memoryFilters').onclick=e=>{const b=e.target.closest('[data-memory-filter]');if(!b)return;memoryFilter=b.dataset.memoryFilter;$$('[data-memory-filter]').forEach(x=>x.classList.toggle('active',x===b));renderScrapbook()};$('#photoUpload').onchange=async e=>{for(const file of [...e.target.files]){if(!file.type.startsWith('image/'))continue;const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});state.memories.push({id:crypto.randomUUID(),url,name:file.name,caption:'',by:currentUser,date:new Date().toLocaleDateString()})}save();e.target.value='';toast('Photo added to the scrapbook.')};$('#scrapbookGrid').addEventListener('change',e=>{const id=e.target.dataset.caption;if(!id)return;const m=state.memories.find(x=>x.id===id);if(m){m.caption=e.target.value;save()}});$('#scrapbookGrid').onclick=e=>{const b=e.target.closest('[data-delete-memory]');if(!b)return;const m=state.memories.find(x=>x.id===b.dataset.deleteMemory);if(m&&confirm('Remove this memory from this browser?')){state.memories=state.memories.filter(x=>x.id!==m.id);save()}};$$('.character-tabs button').forEach(b=>b.onclick=()=>renderCharacter(b.dataset.character));
  // Modal cancel buttons are injected dynamically.
  document.addEventListener('click',e=>{if(e.target.id==='cancelModal')closeModal()});
  // Supabase persists the authenticated session on this device.
  renderBucket();renderQuests();renderScrapbook();
  (async()=>{
    if(!supabaseClient){$('#loginError').textContent='Authentication setup is incomplete.';return}
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(session){const email=session.user.email;const player=Object.keys(authPlayers).find(k=>authPlayers[k]===email);if(player)await openApp(player);else await supabaseClient.auth.signOut()}
  })();
})();
