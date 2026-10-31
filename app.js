
/* Madrid, unfortunately. — static edition with Supabase-backed player authentication. Shared data sync is the next integration stage. */
(() => {
  const $ = (s, root=document) => root.querySelector(s), $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const STORE = 'madrid-unfortunately-static-v1';
  const initialAdventures = [
    ['Go to a museum','Museums',''],['Go to a club','Nightlife',''],['Wear wigs and go out','Chaotic',''],['Have a picnic in El Retiro','Explore','Parque del Retiro'],['Try a new cuisine','Food & Drink',''],['Go to a rooftop bar','Nightlife',''],['Take a day trip','Explore',''],['Go to a concert','Culture',''],['Visit a market','Food & Drink','El Rastro'],['Do something random','Chaotic','']
  ].map((a,i)=>({id:'a'+i,title:a[0],category:a[1],place:a[2],description:'',completedBy:[]}));
  const seedQuests = [
    ['Take a photo of a street cat','📸',5],['Order something you have never tried before','☕',5],['Speak Spanish all day — no English allowed','💬',10],['Find a random event in Madrid','⭐',10],['Do something spontaneous','🪽',15],['Make a playlist titled “Madrid, unfortunately.”','♫',5]
  ];
  const museums=['Museo del Prado','Museo Reina Sofía','Museo Thyssen-Bornemisza','Museo Sorolla','Museo Arqueológico Nacional','Museo Cerralbo','Museo del Romanticismo','Museo de América'];
  const sideIdeas=[
    'Invent an elaborate history for an old building. Accuracy is not expected.',
    'Find a street you have never walked down. Revolutionary.',
    'Visit a bookshop and judge books by their covers.',
    'Take a different route home. Try not to get lost.',
    'Find the most dramatic doorway in your neighbourhood.',
    'Have an unplanned afternoon. No committee meeting required.',
    'Find the prettiest tiled doorway you can.',
    'Go somewhere just because the name sounds interesting.',
    'Ask for a recommendation and actually follow it.',
    'Find a tiny hidden square and sit there for ten minutes.',
    'Find a mural you have never noticed before.',
    'Buy a pastry from a bakery you have never tried.',
    'Take a photo of something that looks like an album cover.',
    'Go somewhere without checking the reviews first.',
    'Find a place that feels like a film set.'
  ];

  const authPlayers = {
    alisha: 'alisha@madrid-unfortunately.invalid',
    eva: 'eva@madrid-unfortunately.invalid'
  };

  const SUPABASE_URL = 'https://aqacqrqnrfryezhrvgtl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BkmphdZNnUPwGwn1vSsbyQ_L9BAylwo';

  const supabaseClient = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  let state = load();
  let currentPlayer = null;
  let map = null;
  let markers = [];
  let activeBucket = 'all';
  let activeCharacter = 'alisha';

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORE));
      if(saved)return {...saved,adventures:saved.adventures||initialAdventures,quests:saved.quests||seedQuests.map((q,i)=>({id:'q'+i,title:q[0],emoji:q[1],points:q[2],completedBy:[]})),memories:saved.memories||[],pins:saved.pins||[],profilePhotos:saved.profilePhotos||{}};
    }catch(error){}
    return {
      adventures:initialAdventures,
      quests:seedQuests.map((q,i)=>({id:'q'+i,title:q[0],emoji:q[1],points:q[2],completedBy:[]})),
      memories:[],
      pins:[],
      profilePhotos:{},
      players:{
        alisha:{points:0,completed:0},
        eva:{points:0,completed:0}
      }
    };
  }

  function save(){
    localStorage.setItem(STORE,JSON.stringify(state));
  }

  function escapeHTML(value){
    return String(value??'').replace(/[&<>"']/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[char]);
  }

  function playerName(player){
    return player==='alisha'?'Alisha':'Eva';
  }

  function playerData(player){
    if(!state.players[player])state.players[player]={points:0,completed:0};
    return state.players[player];
  }

  function notify(message){
    const el=$('#toast');
    if(!el)return;
    el.textContent=message;
    el.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer=setTimeout(()=>el.classList.remove('show'),2600);
  }

  async function login(player){
    if(!supabaseClient){
      $('#loginError').textContent='Authentication setup is incomplete.';
      return;
    }
    const email=authPlayers[player];
    const password=$('#loginPassword').value;
    if(!password){
      $('#loginError').textContent='Please enter your password.';
      return;
    }
    $('#loginError').textContent='Signing in…';
    const {error}=await supabaseClient.auth.signInWithPassword({email,password});
    if(error){
      $('#loginError').textContent=error.message;
      return;
    }
    await openApp(player);
  }

  async function openApp(player){
    currentPlayer=player;
    activeCharacter=player;
    $('#loginScreen')?.classList.add('hidden');
    $('#app')?.classList.remove('hidden');
    $('#currentPlayerName').textContent=playerName(player);
    $('#welcomeName').textContent=playerName(player);
    renderAll();
    initMap();
  }

  async function logout(){
    if(supabaseClient)await supabaseClient.auth.signOut();
    currentPlayer=null;
    $('#app')?.classList.add('hidden');
    $('#loginScreen')?.classList.remove('hidden');
    $('#loginPassword').value='';
  }

  function renderAll(){
    renderStats();
    renderAdventures();
    renderQuests();
    renderScrapbook();
    renderPins();
    renderCharacter(activeCharacter);
    renderBucket();
  }

  function renderStats(){
    const alisha=playerData('alisha');
    const eva=playerData('eva');
    $('#alishaPoints').textContent=alisha.points;
    $('#evaPoints').textContent=eva.points;
    $('#alishaCompleted').textContent=alisha.completed;
    $('#evaCompleted').textContent=eva.completed;
    $('#totalAdventures').textContent=state.adventures.length;
    $('#totalPins').textContent=state.pins.length;
  }

  function renderAdventures(){
    const list=$('#adventureList');
    if(!list)return;
    list.innerHTML=state.adventures.map(adventure=>{
      const completed=adventure.completedBy||[];
      return `
        <article class="adventure-card">
          <div class="adventure-card-main">
            <div class="adventure-category">${escapeHTML(adventure.category||'Adventure')}</div>
            <h3>${escapeHTML(adventure.title)}</h3>
            ${adventure.place?`<p>${escapeHTML(adventure.place)}</p>`:''}
            ${adventure.description?`<p>${escapeHTML(adventure.description)}</p>`:''}
            <div class="completion-label">
              ${completed.length?`Completed by ${completed.map(playerName).join(' and ')}`:'Not completed yet'}
            </div>
          </div>
          <div class="adventure-actions">
            ${['alisha','eva'].map(player=>`
              <button class="pixel-button ${completed.includes(player)?'completed':''}" data-complete-adventure="${escapeHTML(adventure.id)}" data-player="${player}">
                ${completed.includes(player)?'✓':'+'} ${playerName(player)}
              </button>
            `).join('')}
          </div>
        </article>
      `;
    }).join('');
  }

  function completeAdventure(id,player){
    const adventure=state.adventures.find(a=>a.id===id);
    if(!adventure)return;
    adventure.completedBy=adventure.completedBy||[];
    if(adventure.completedBy.includes(player)){
      notify('Already completed!');
      return;
    }
    adventure.completedBy.push(player);
    playerData(player).completed++;
    playerData(player).points+=10;
    save();
    renderAll();
    notify(`${playerName(player)} completed an adventure! +10 points`);
  }

  function addAdventure(){
    const title=$('#adventureTitle').value.trim();
    if(!title){
      notify('Give your adventure a name first.');
      return;
    }
    state.adventures.push({
      id:'a'+Date.now(),
      title,
      category:$('#adventureCategory').value,
      place:$('#adventurePlace').value.trim(),
      description:$('#adventureDescription').value.trim(),
      completedBy:[]
    });
    save();
    renderAdventures();
    renderStats();
    $('#adventureModal').classList.add('hidden');
    $('#adventureForm').reset();
    notify('Adventure added!');
  }

  function renderQuests(){
    const list=$('#questList');
    if(!list)return;
    list.innerHTML=state.quests.map(quest=>{
      const completed=quest.completedBy||[];
      return `
        <article class="quest-card">
          <span class="quest-emoji">${escapeHTML(quest.emoji||'⭐')}</span>
          <div class="quest-content">
            <h3>${escapeHTML(quest.title)}</h3>
            <p>${quest.points} points</p>
            <div class="quest-completions">
              ${completed.map(playerName).join(' · ')||'Waiting to be completed'}
            </div>
          </div>
          <div class="quest-actions">
            ${['alisha','eva'].map(player=>`
              <button class="pixel-button" data-complete-quest="${escapeHTML(quest.id)}" data-player="${player}" ${completed.includes(player)?'disabled':''}>
                ${completed.includes(player)?'✓':playerName(player)}
              </button>
            `).join('')}
          </div>
        </article>
      `;
    }).join('');
  }

  function completeQuest(id,player){
    const quest=state.quests.find(q=>q.id===id);
    if(!quest)return;
    quest.completedBy=quest.completedBy||[];
    if(quest.completedBy.includes(player))return;
    quest.completedBy.push(player);
    playerData(player).points+=quest.points;
    playerData(player).completed++;
    save();
    renderAll();
    notify(`${playerName(player)} earned ${quest.points} points!`);
  }

  function addQuest(){
    const title=$('#questTitle').value.trim();
    if(!title)return notify('Give your side quest a name.');
    state.quests.push({
      id:'q'+Date.now(),
      title,
      emoji:$('#questEmoji').value||'⭐',
      points:Number($('#questPoints').value)||5,
      completedBy:[]
    });
    save();
    renderQuests();
    $('#questModal').classList.add('hidden');
    $('#questForm').reset();
    notify('Side quest added!');
  }

  function renderScrapbook(){
    const grid=$('#scrapbookGrid');
    if(!grid)return;
    grid.innerHTML=state.memories.map(memory=>`
      <article class="memory-card">
        ${memory.image?`<img src="${memory.image}" alt="${escapeHTML(memory.caption||'Memory')}">`:''}
        <p>${escapeHTML(memory.caption||'A Madrid memory')}</p>
        <small>${escapeHTML(memory.by||'Alisha and Eva')}</small>
        <button class="delete-memory" data-delete-memory="${escapeHTML(memory.id)}" aria-label="Delete memory">×</button>
      </article>
    `).join('');
    $('#memoryCount').textContent=state.memories.length;
  }

  function compressImage(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>{
        const image=new Image();
        image.onload=()=>{
          const canvas=document.createElement('canvas');
          const max=1100;
          const ratio=Math.min(1,max/Math.max(image.width,image.height));
          canvas.width=Math.round(image.width*ratio);
          canvas.height=Math.round(image.height*ratio);
          canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg',0.78));
        };
        image.onerror=reject;
        image.src=reader.result;
      };
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }

  async function addMemory(){
    const file=$('#memoryImage').files[0];
    const caption=$('#memoryCaption').value.trim();
    if(!file&&!caption)return notify('Add a photo or a caption first.');
    let image='';
    if(file){
      try{image=await compressImage(file)}
      catch(error){return notify('Could not load that image.')}
    }
    state.memories.unshift({
      id:'m'+Date.now(),
      image,
      caption,
      by:playerName(currentPlayer||'alisha'),
      createdAt:new Date().toISOString()
    });
    save();
    renderScrapbook();
    $('#memoryModal').classList.add('hidden');
    $('#memoryForm').reset();
    notify('Memory saved!');
  }

  function renderPins(){
    const list=$('#pinList');
    if(list){
      list.innerHTML=state.pins.map(pin=>`
        <div class="pin-list-item">
          <div><strong>${escapeHTML(pin.name||'A place in Madrid')}</strong><small>${escapeHTML(pin.address||'')}</small></div>
          <button data-delete-pin="${escapeHTML(pin.id)}" aria-label="Delete pin">×</button>
        </div>
      `).join('');
    }
    renderStats();
    drawMarkers();
  }

  function addPin(pin){
    state.pins.push({
      id:'p'+Date.now(),
      name:pin.name||'A place in Madrid',
      address:pin.address||'',
      lat:pin.lat,
      lng:pin.lng,
      by:currentPlayer||'alisha'
    });
    save();
    renderPins();
    notify('Place saved to your map!');
  }

  function deletePin(id){
    state.pins=state.pins.filter(pin=>pin.id!==id);
    save();
    renderPins();
    notify('Pin removed.');
  }

  function drawMarkers(){
    if(!map||!window.L)return;
    markers.forEach(marker=>map.removeLayer(marker));
    markers=[];
    state.pins.forEach(pin=>{
      if(typeof pin.lat!=='number'||typeof pin.lng!=='number')return;
      const marker=L.marker([pin.lat,pin.lng]).addTo(map);
      marker.bindPopup(`
        <div class="map-popup">
          <strong>${escapeHTML(pin.name)}</strong>
          <p>${escapeHTML(pin.address)}</p>
          <small>Saved by ${escapeHTML(playerName(pin.by))}</small>
          <button class="popup-delete" data-delete-pin="${escapeHTML(pin.id)}">Remove pin</button>
        </div>
      `);
      markers.push(marker);
    });
  }

  function configureMapTouchGestures(){
    if(!map)return;
    const container=map.getContainer();
    const mobile=window.matchMedia('(max-width: 650px)').matches;

    if(mobile){
      if(map.dragging && map.dragging.enabled())map.dragging.disable();
      if(map.touchZoom && map.touchZoom.enabled())map.touchZoom.disable();
    }else{
      if(map.dragging && !map.dragging.enabled())map.dragging.enable();
      if(map.touchZoom && !map.touchZoom.enabled())map.touchZoom.enable();
    }

    if(container._twoFingerMapGesturesBound)return;
    container._twoFingerMapGesturesBound=true;

    let previous=null;
    const midpoint=(a,b)=>({
      x:(a.clientX+b.clientX)/2,
      y:(a.clientY+b.clientY)/2
    });
    const distance=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);

    container.addEventListener('touchstart',event=>{
      if(!window.matchMedia('(max-width: 650px)').matches||event.touches.length!==2){
        previous=null;
        return;
      }
      const a=event.touches[0],b=event.touches[1],mid=midpoint(a,b);
      previous={mid,distance:distance(a,b)};
    },{passive:true});

    container.addEventListener('touchmove',event=>{
      if(!window.matchMedia('(max-width: 650px)').matches||event.touches.length!==2){
        previous=null;
        return;
      }
      const a=event.touches[0],b=event.touches[1],mid=midpoint(a,b),dist=distance(a,b);
      if(!previous){
        previous={mid,distance:dist};
        return;
      }
      event.preventDefault();

      const dx=mid.x-previous.mid.x;
      const dy=mid.y-previous.mid.y;

      if(Math.abs(dx)+Math.abs(dy)>0){
        map.panBy([-dx,-dy],{animate:false});
      }

      if(previous.distance>0&&dist>0){
        const zoomDelta=Math.log2(dist/previous.distance);
        if(Math.abs(zoomDelta)>0.015){
          const next=Math.max(11,Math.min(19,map.getZoom()+zoomDelta));
          map.setZoom(next,{animate:false});
        }
      }
      previous={mid,distance:dist};
    },{passive:false});

    const reset=()=>{previous=null};
    container.addEventListener('touchend',reset,{passive:true});
    container.addEventListener('touchcancel',reset,{passive:true});
  }

  function initMap(){
    if(!window.L)return;

    if(map){
      configureMapTouchGestures();
      setTimeout(()=>map.invalidateSize(),120);
      drawMarkers();
      return;
    }

    map=L.map('map',{
      zoomControl:true,
      zoomSnap:0.25
    }).setView([40.4168,-3.7038],13);

    configureMapTouchGestures();

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap contributors',
      maxZoom:19
    }).addTo(map);

    map.on('click',async e=>{
      const lat=e.latlng.lat,lng=e.latlng.lng;
      const popup=L.popup().setLatLng(e.latlng)
        .setContent('<b>Finding location…</b>').openOn(map);
      let address='Coordinates: '+lat.toFixed(5)+', '+lng.toFixed(5);
      let placeName='Selected place';

      try{
        const response=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+lat+'&lon='+lng);
        if(response.ok){
          const data=await response.json();
          address=data.display_name||address;
          placeName=data.name||(data.address&&(data.address.amenity||data.address.shop||data.address.road))||placeName;
        }
      }catch(error){}

      const content=document.createElement('div');
      content.className='map-popup';
      const title=document.createElement('strong');
      title.textContent=placeName;
      const addressText=document.createElement('p');
      addressText.textContent=address;
      const button=document.createElement('button');
      button.className='popup-save';
      button.textContent='Save this place';
      button.addEventListener('click',()=>{
        addPin({name:placeName,address,lat,lng});
        map.closePopup();
      });
      content.append(title,addressText,button);
      popup.setContent(content);
    });

    drawMarkers();
  }

  function renderCharacter(player){
    activeCharacter=player;
    const character=$('#characterProfile');
    if(!character)return;
    const data=playerData(player);
    const photo=state.profilePhotos[player]||'';
    character.innerHTML=`
      <div class="profile-art">
        ${photo?`<img src="${photo}" alt="${playerName(player)}'s profile photo">`:`<img src="./mu-v22-${player}-sprite-${player==='alisha'?'7f3a':'9c2d'}.png" alt="${playerName(player)}">`}
      </div>
      <div class="profile-details">
        <p class="eyebrow">YOUR MADRID ALTER EGO</p>
        <h2>${playerName(player)}</h2>
        <div class="profile-stat"><strong>${data.points}</strong><span>Points earned</span></div>
        <div class="profile-stat"><strong>${data.completed}</strong><span>Things completed</span></div>
        <label class="upload-photo">Change profile photo<input type="file" accept="image/*" data-profile-photo="${player}"></label>
      </div>
    `;
    $$('.character-tabs button').forEach(button=>{
      button.classList.toggle('active',button.dataset.character===player);
    });
  }

  function renderBucket(){
    const buttons=$$('.bucket-filter');
    buttons.forEach(button=>{
      button.classList.toggle('active',button.dataset.bucket===activeBucket);
    });
  }

  function searchMap(){
    const query=$('#mapSearch').value.trim();
    if(!query)return;
    fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(query+', Madrid, Spain'))
      .then(response=>response.json())
      .then(results=>{
        if(!results.length)return notify('Could not find that place.');
        const result=results[0];
        const lat=Number(result.lat),lng=Number(result.lon);
        map.setView([lat,lng],16);
        L.popup().setLatLng([lat,lng])
          .setContent(`<strong>${escapeHTML(result.name||query)}</strong><p>${escapeHTML(result.display_name)}</p><button class="popup-save" data-search-save="1">Save this place</button>`)
          .openOn(map);
        map.once('popupopen',event=>{
          const button=event.popup.getElement().querySelector('[data-search-save]');
          if(button)button.addEventListener('click',()=>{
            addPin({name:result.name||query,address:result.display_name,lat,lng});
            map.closePopup();
          });
        });
      })
      .catch(()=>notify('Map search is unavailable right now.'));
  }

  function showPage(page){
    $$('.page').forEach(element=>element.classList.add('hidden'));
    const target=$(`#${page}Page`);
    if(target)target.classList.remove('hidden');
    $$('.nav-button').forEach(button=>{
      button.classList.toggle('active',button.dataset.page===page);
    });
    $('#sidebar')?.classList.remove('open');
    if(page==='map')setTimeout(()=>initMap(),100);
    if(page==='scrapbook')renderScrapbook();
    if(page==='adventures')renderAdventures();
    if(page==='quests')renderQuests();
    if(page==='characters')renderCharacter(activeCharacter);
  }

  function openModal(id){
    const modal=$(id);
    if(modal)modal.classList.remove('hidden');
  }

  function closeModal(id){
    const modal=$(id);
    if(modal)modal.classList.add('hidden');
  }

  function bindEvents(){
    $('#loginButton')?.addEventListener('click',()=>login($('#loginPlayer').value));
    $('#loginPassword')?.addEventListener('keydown',event=>{
      if(event.key==='Enter')login($('#loginPlayer').value);
    });
    $('#logoutButton')?.addEventListener('click',logout);
    $('#menuToggle')?.addEventListener('click',()=>$('#sidebar')?.classList.toggle('open'));

    $$('.nav-button').forEach(button=>{
      button.addEventListener('click',()=>showPage(button.dataset.page));
    });

    $('#adventureList')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-complete-adventure]');
      if(button)completeAdventure(button.dataset.completeAdventure,button.dataset.player);
    });

    $('#questList')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-complete-quest]');
      if(button)completeQuest(button.dataset.completeQuest,button.dataset.player);
    });

    $('#addAdventureButton')?.addEventListener('click',()=>openModal('#adventureModal'));
    $('#addQuestButton')?.addEventListener('click',()=>openModal('#questModal'));
    $('#addMemoryButton')?.addEventListener('click',()=>openModal('#memoryModal'));

    $('#adventureForm')?.addEventListener('submit',event=>{
      event.preventDefault();
      addAdventure();
    });

    $('#questForm')?.addEventListener('submit',event=>{
      event.preventDefault();
      addQuest();
    });

    $('#memoryForm')?.addEventListener('submit',event=>{
      event.preventDefault();
      addMemory();
    });

    $('#mapSearchButton')?.addEventListener('click',searchMap);
    $('#mapSearch')?.addEventListener('keydown',event=>{
      if(event.key==='Enter')searchMap();
    });

    $('#pinList')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-delete-pin]');
      if(button)deletePin(button.dataset.deletePin);
    });

    $('#scrapbookGrid')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-delete-memory]');
      if(!button)return;
      const memory=state.memories.find(item=>item.id===button.dataset.deleteMemory);
      if(memory&&confirm('Remove this memory from this browser?')){
        state.memories=state.memories.filter(item=>item.id!==memory.id);
        save();
        renderScrapbook();
      }
    });

    $$('.character-tabs button').forEach(button=>{
      button.addEventListener('click',()=>renderCharacter(button.dataset.character));
    });

    document.addEventListener('click',event=>{
      const close=event.target.closest('[data-close-modal]');
      if(close){
        const modal=close.closest('.modal-backdrop');
        if(modal)modal.classList.add('hidden');
      }

      const cancel=event.target.closest('[data-cancel]');
      if(cancel){
        const modal=cancel.closest('.modal-backdrop');
        if(modal)modal.classList.add('hidden');
      }

      const deletePinButton=event.target.closest('[data-delete-pin]');
      if(deletePinButton&&!deletePinButton.closest('#pinList')){
        deletePin(deletePinButton.dataset.deletePin);
        map?.closePopup();
      }
    });

    document.addEventListener('change',async event=>{
      const profileInput=event.target.closest('[data-profile-photo]');
      if(profileInput){
        const file=profileInput.files[0];
        if(!file)return;
        try{
          state.profilePhotos[profileInput.dataset.profilePhoto]=await compressImage(file);
          save();
          renderCharacter(profileInput.dataset.profilePhoto);
          notify('Profile photo updated.');
        }catch(error){
          notify('Could not load that image.');
        }
      }

      const bucket=event.target.closest('[data-bucket]');
      if(bucket){
        activeBucket=bucket.dataset.bucket;
        renderBucket();
      }
    });
  }

  bindEvents();

  // Supabase persists the authenticated session on this device.
  renderBucket();
  renderQuests();
  renderScrapbook();

  (async()=>{
    if(!supabaseClient){
      $('#loginError').textContent='Authentication setup is incomplete.';
      return;
    }
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(session){
      const email=session.user.email;
      const player=Object.keys(authPlayers).find(key=>authPlayers[key]===email);
      if(player)await openApp(player);
      else await supabaseClient.auth.signOut();
    }
  })();

  // Re-enable normal desktop map dragging when the viewport changes.
  window.addEventListener('resize',()=>{
    if(map)configureMapTouchGestures();
  });
})();
