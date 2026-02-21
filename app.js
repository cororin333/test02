(()=> {
  'use strict';

  const VERSION = 'mkworld_full_8_12_noimg_v1';
  const LS_KEY = 'mkworld:' + location.pathname;

  const SELECT_COLORS = [
    {name:'未選択', color:''},
    {name:'赤', color:'#FE3C4F'},
    {name:'青', color:'#498CF0'},
    {name:'黄', color:'#FFF200'},
    {name:'緑', color:'#57C544'},
  ];
  const AUTO_COLORS = ['#FF7CD5','#7BE0FF','#FD8600','#AD6BFF','#ACF243','#B58464','#FFB5EC','#CCCCCC'];
  const CPU_COLOR = '#4C4C4C';

  const POINTS_12 = [15,12,10,9,8,7,6,5,4,3,2,1];
  const POINTS_24 = [15,12,10,9,9,8,8,7,7,6,6,6,5,5,5,4,4,4,3,3,3,2,2,1];

  const FORMATS = {
    12: [
      {id:'FFA', label:'FFA', teamCount:12},
      {id:'2v2', label:'2v2', teamCount:6},
      {id:'3v3', label:'3v3', teamCount:4},
      {id:'4v4', label:'4v4', teamCount:3},
      {id:'6v6', label:'6v6', teamCount:2},
    ],
    24: [
      {id:'FFA', label:'FFA', teamCount:24},
      {id:'2v2', label:'2v2', teamCount:12},
      {id:'3v3', label:'3v3', teamCount:8},
      {id:'4v4', label:'4v4', teamCount:6},
      {id:'6v6', label:'6v6', teamCount:4},
      {id:'8v8', label:'8v8', teamCount:3},
      {id:'12v12', label:'12v12', teamCount:2},
    ]
  };

  const MAXDIFF = {
    12: {FFA:14,'2v2':24,'3v3':31,'4v4':36,'6v6':40},
    24: {FFA:14,'2v2':24,'3v3':32,'4v4':38,'6v6':49,'8v8':56,'12v12':62},
  };

  const $ = (s)=>document.querySelector(s);

  const selMode = $('#selMode');
  const inpQualify = $('#inpQualify');
  const btnResetTags = $('#btnResetTags');
  const dupKeyMsg = $('#dupKeyMsg');
  const tagTable = $('#tagTable');
  const inpCpuKey = $('#inpCpuKey');

  const btnResetAll = $('#btnResetAll');
  const btnPin = $('#btnPin');
  const pinPreview = $('#pinPreview');
  const pinBar = $('#pinBar');
  const pinBarContent = $('#pinBarContent');
  const btnPinClose = $('#btnPinClose');

  const rankWrap = $('#rankWrap');
  const spMaxDiff = $('#spMaxDiff');

  const outMain = $('#outMain');
  const outOpt = $('#outOpt');
  const btnCopyMain = $('#btnCopyMain');
  const btnCopyOpt = $('#btnCopyOpt');

  const chkShowSum = $('#chkShowSum');
  const chkShowCert = $('#chkShowCert');
  const certText = $('#certText');

  const selView = $('#selView');
  const chkShowOthers = $('#chkShowOthers');
  const autoCopyMsg = $('#autoCopyMsg');

  const logAdj = $('#logAdj');
  const logCourse = $('#logCourse');
  const chkShowCourseLog = $('#chkShowCourseLog');

  const btnSpec = $('#btnSpec');
  const modalSpec = $('#modalSpec');
  const btnSpecClose = $('#btnSpecClose');

  const state = {
    players: 12,
    races: 8,
    mode: 'FFA',
    qualify: '',
    cpuCalc: 'MKB',
    teams: [],
    cpuKey: 'y',
    cells: {},
    courses: {},
    locks: {},
    adjLog: [],
    showSum: false,
    showCert: false,
    viewTeam: 'none',
    showOthers: true,
    showCourseLog: false,
    lastUpdated: 0,
    autosaveOff: false,
  };

  function nowMs(){ return Date.now(); }
  function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

  function toHalfWidth(s){
    return s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
            .replace(/　/g, ' ');
  }
  function normalizeKey(s){
    if(!s) return '';
    s = toHalfWidth(String(s)).trim();
    if(!s) return '';
    s = Array.from(s)[0];
    if(/[A-Z]/.test(s)) s = s.toLowerCase();
    return s;
  }
  function sanitizeIntInput(s){
    s = toHalfWidth(String(s ?? ''));
    s = s.replace(/[^0-9+\-\.]/g,'');
    let m = s.match(/^([+\-]?)(\d+)(?:\.(\d*))?$/);
    if(!m){
      m = s.match(/^([+\-]?)(\d+)/);
      if(!m) return '';
      return m[1] + m[2];
    }
    return m[1] + m[2];
  }
  function safeParseInt(s){
    if(s === '' || s == null) return 0;
    const n = parseInt(s,10);
    return Number.isFinite(n) ? n : 0;
  }

  function getPlayers(){ return Number(document.querySelector('input[name="players"]:checked')?.value || 12); }
  function getRaces(){ return Number(document.querySelector('input[name="races"]:checked')?.value || 8); }
  function getCpuCalc(){ return String(document.querySelector('input[name="cpuCalc"]:checked')?.value || 'MKB'); }

  function derived(players, modeId){
    const fmt = FORMATS[players].find(f=>f.id===modeId) || FORMATS[players][0];
    const teams = Array.from({length: fmt.teamCount}, (_,i)=>({id:String(i), name:'', key:'', color:'', adj:''}));
    return {fmt, teams};
  }

  function shouldShowColorPicker(players, modeId, teamCount){
    if(players===24 && modeId==='FFA') return false;
    return teamCount <= 4;
  }
  function teamAutoColor(i){ return AUTO_COLORS[i % AUTO_COLORS.length]; }

  let saveTimer = null;
  function scheduleSave(){
    if(state.autosaveOff) return;
    state.lastUpdated = nowMs();
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 500);
  }
  function doSave(){
    saveTimer = null;
    if(state.autosaveOff) return;
    try{
      const obj = {
        version: VERSION,
        lastUpdated: state.lastUpdated,
        players: state.players,
        races: state.races,
        mode: state.mode,
        qualify: state.qualify,
        cpuCalc: state.cpuCalc,
        teams: state.teams.map(t=>({name:t.name,key:t.key,color:t.color,adj:t.adj})),
        cpuKey: state.cpuKey,
        cells: state.cells,
        courses: state.courses,
        adjLog: state.adjLog,
        showSum: state.showSum,
        showCert: state.showCert,
        viewTeam: state.viewTeam,
        showOthers: state.showOthers,
        showCourseLog: state.showCourseLog,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    }catch(e){
      state.autosaveOff = true;
    }
  }

  function isAllRacesFilledForReset(obj){
    const players = obj.players;
    const races = obj.races;
    if(!(races===8 || races===12)) return false;
    const cells = obj.cells || {};
    for(let r=0;r<races;r++){
      for(let p=0;p<players;p++){
        const v = (cells?.[r]?.[p] ?? '');
        if(v === '') return false;
      }
    }
    return true;
  }

  function loadSaved(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return false;
      const obj = JSON.parse(raw);

      if(obj && typeof obj.lastUpdated === 'number'){
        const remaining0 = isAllRacesFilledForReset(obj);
        if(remaining0 && (nowMs() - obj.lastUpdated) >= 48*60*60*1000){
          localStorage.removeItem(LS_KEY);
          return false;
        }
      }

      if(!obj || obj.version !== VERSION){
        localStorage.removeItem(LS_KEY);
        return false;
      }

      state.players = obj.players;
      state.races = obj.races;
      state.mode = obj.mode;
      state.qualify = obj.qualify ?? '';
      state.cpuCalc = obj.cpuCalc ?? 'MKB';

      const d = derived(state.players, state.mode);
      state.teams = d.teams;
      for(let i=0;i<state.teams.length;i++){
        const src = obj.teams?.[i];
        if(src){
          state.teams[i].name = src.name ?? '';
          state.teams[i].key = src.key ?? '';
          state.teams[i].color = src.color ?? '';
          state.teams[i].adj = src.adj ?? '';
        }
      }

      state.cpuKey = obj.cpuKey ?? 'y';
      state.cells = obj.cells ?? {};
      state.courses = obj.courses ?? {};
      state.adjLog = Array.isArray(obj.adjLog) ? obj.adjLog : [];

      state.showSum = !!obj.showSum;
      state.showCert = !!obj.showCert;
      state.viewTeam = obj.viewTeam ?? 'none';
      state.showOthers = (obj.showOthers !== false);
      state.showCourseLog = !!obj.showCourseLog;

      state.lastUpdated = obj.lastUpdated ?? 0;
      return true;
    }catch(e){
      return false;
    }
  }

  function buildModeOptions(){
    selMode.innerHTML = '';
    for(const f of FORMATS[state.players]){
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.label;
      selMode.appendChild(opt);
    }
    selMode.value = state.mode;
  }

  function getTeamColor(t){
    const {fmt} = derived(state.players, state.mode);
    const showPicker = shouldShowColorPicker(state.players, state.mode, fmt.teamCount);
    if(state.players===24 && state.mode==='FFA') return '';
    if(showPicker) return t.color || '';
    return teamAutoColor(Number(t.id));
  }

  function buildViewOptions(){
    selView.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = 'none';
    o0.textContent = '表示選択';
    selView.appendChild(o0);
    for(const t of state.teams){
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.name?.trim() ? t.name.trim() : ('チーム' + (Number(t.id)+1));
      selView.appendChild(o);
    }
    const os = document.createElement('option');
    os.value = 'sum';
    os.textContent = '合計のみ';
    selView.appendChild(os);
    selView.value = state.viewTeam;
  }

  function applyColorCell(td, color){
    td.style.background = color || '';
  }

  function checkDuplicateKeys(){
    const keys = state.teams.map(t=>t.key).filter(Boolean);
    const set = new Set();
    let dup = false;
    for(const k of keys){
      if(set.has(k)){ dup = true; break; }
      set.add(k);
    }
    dupKeyMsg.textContent = dup ? '異なるキーを設定してください' : '';
    return !dup;
  }

  function getKeyMap(){
    const m = new Map();
    for(const t of state.teams){
      if(t.key) m.set(t.key, t.id);
    }
    return m;
  }

  function renderPinPreview(){
    pinPreview.innerHTML = '';
    for(const t of state.teams){
      const badge = document.createElement('div');
      badge.className = 'badge';
      const top = document.createElement('div');
      top.className = 'badgeTop';
      top.textContent = t.name?.trim() ? t.name.trim() : ('チーム' + (Number(t.id)+1));
      const bot = document.createElement('div');
      bot.className = 'badgeBot';
      bot.textContent = t.key || '';
      const bg = getTeamColor(t);
      if(bg){ top.style.background = bg; bot.style.background = bg; }
      badge.appendChild(top); badge.appendChild(bot);
      pinPreview.appendChild(badge);
    }
    const cpu = document.createElement('div');
    cpu.className = 'badge';
    const top = document.createElement('div');
    top.className = 'badgeTop';
    top.textContent = '★CPU';
    top.style.background = CPU_COLOR;
    top.style.color = '#fff';
    const bot = document.createElement('div');
    bot.className = 'badgeBot';
    bot.textContent = state.cpuKey || '';
    cpu.appendChild(top); cpu.appendChild(bot);
    pinPreview.appendChild(cpu);
  }

  function buildPinBar(){
    pinBarContent.innerHTML = '';
    for(const t of state.teams){
      const badge = document.createElement('div');
      badge.className = 'badge';
      const top = document.createElement('div');
      top.className = 'badgeTop';
      top.textContent = t.name?.trim() ? t.name.trim() : ('チーム' + (Number(t.id)+1));
      const bot = document.createElement('div');
      bot.className = 'badgeBot';
      bot.textContent = t.key || '';
      const bg = getTeamColor(t);
      if(bg){ top.style.background = bg; bot.style.background = bg; }
      badge.appendChild(top); badge.appendChild(bot);
      pinBarContent.appendChild(badge);
    }
    const cpu = document.createElement('div');
    cpu.className = 'badge';
    const top = document.createElement('div');
    top.className = 'badgeTop';
    top.textContent = '★CPU';
    top.style.background = CPU_COLOR;
    top.style.color = '#fff';
    const bot = document.createElement('div');
    bot.className = 'badgeBot';
    bot.textContent = state.cpuKey || '';
    cpu.appendChild(top); cpu.appendChild(bot);
    pinBarContent.appendChild(cpu);
  }

  function buildTagTable(){
    const {fmt} = derived(state.players, state.mode);
    tagTable.innerHTML = '';
    const tbody = document.createElement('tbody');

    const rows = [
      {head:'タグ', kind:'name'},
      {head:'色選択', kind:'color'},
      {head:'キー', kind:'key'},
      {head:'点数補正', kind:'adj'},
    ];

    const showPicker = shouldShowColorPicker(state.players, state.mode, fmt.teamCount);

    for(const row of rows){
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'rowHead';
      th.textContent = row.head;
      tr.appendChild(th);

      for(let i=0;i<fmt.teamCount;i++){
        const td = document.createElement('td');

        if(row.kind==='name'){
          const inp = document.createElement('input');
          inp.className = 'cellInp smalltxt';
          inp.value = state.teams[i]?.name ?? '';
          inp.maxLength = 12;
          inp.autocomplete = 'off';
          inp.addEventListener('input', ()=>{
            state.teams[i].name = inp.value;
            buildViewOptions();
            renderPinPreview();
            recalcAll(true);
            scheduleSave();
          });
          td.appendChild(inp);
        }

        if(row.kind==='color'){
          if(state.players===24 && state.mode==='FFA'){
            td.textContent = '';
          }else if(showPicker){
            const sel = document.createElement('select');
            sel.className = 'colorSel';
            sel.tabIndex = -1;
            for(const c of SELECT_COLORS){
              const opt = document.createElement('option');
              opt.value = c.color;
              opt.textContent = c.name;
              sel.appendChild(opt);
            }
            sel.value = state.teams[i]?.color ?? '';
            applyColorCell(td, sel.value);
            sel.addEventListener('change', ()=>{
              state.teams[i].color = sel.value;
              buildPinBar();
              renderPinPreview();
              recalcAll(true);
              scheduleSave();
            });
            td.appendChild(sel);
          }else{
            const c = teamAutoColor(i);
            applyColorCell(td, c);
            td.textContent = '';
          }
        }

        if(row.kind==='key'){
          const inp = document.createElement('input');
          inp.className = 'cellInp';
          inp.value = state.teams[i]?.key ?? '';
          inp.maxLength = 2;
          inp.autocomplete = 'off';
          inp.addEventListener('input', ()=>{
            const v = normalizeKey(inp.value);
            inp.value = v;
            state.teams[i].key = v;
            checkDuplicateKeys();
            renderPinPreview();
            buildPinBar();
            recalcAll(true);
            scheduleSave();
          });
          td.appendChild(inp);
        }

        if(row.kind==='adj'){
          const inp = document.createElement('input');
          inp.className = 'cellInp';
          inp.value = state.teams[i]?.adj ?? '';
          inp.autocomplete = 'off';
          inp.inputMode = 'numeric';
          inp.addEventListener('input', ()=>{
            const v = sanitizeIntInput(inp.value);
            inp.value = v;
            state.teams[i].adj = v;
            recalcAll(true);
            scheduleSave();
          });
          td.appendChild(inp);
        }

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    tagTable.appendChild(tbody);

    inpCpuKey.value = state.cpuKey ?? 'y';
    inpCpuKey.addEventListener('input', ()=>{
      const v = normalizeKey(inpCpuKey.value);
      inpCpuKey.value = v;
      state.cpuKey = v;
      renderPinPreview();
      buildPinBar();
      recalcAll(true);
      scheduleSave();
    });

    checkDuplicateKeys();
    renderPinPreview();
    buildPinBar();
  }

  function buildRankTable(){
    rankWrap.innerHTML = '';
    const players = state.players;
    const races = state.races;
    const points = (players===12) ? POINTS_12 : POINTS_24;

    const tbl = document.createElement('table');
    tbl.className = 'rankTable';

    const tr0 = document.createElement('tr');
    const thPts = document.createElement('th'); thPts.className='ptsCol headTop'; thPts.textContent='得点';
    const thRank = document.createElement('th'); thRank.className='rankCol headTop'; thRank.textContent='順位';
    tr0.appendChild(thPts); tr0.appendChild(thRank);
    const thRace = document.createElement('th');
    thRace.className='headTop';
    thRace.colSpan = races;
    thRace.textContent='レース数';
    tr0.appendChild(thRace);
    tbl.appendChild(tr0);

    const tr1 = document.createElement('tr');
    const thA = document.createElement('th'); thA.className='ptsCol'; thA.textContent='';
    const thB = document.createElement('th'); thB.className='rankCol'; thB.textContent='';
    tr1.appendChild(thA); tr1.appendChild(thB);
    for(let r=0;r<races;r++){
      const th = document.createElement('th');
      th.textContent = String(r+1);
      tr1.appendChild(th);
    }
    tbl.appendChild(tr1);

    for(let p=0;p<players;p++){
      const tr = document.createElement('tr');
      if(players===24 && p===12) tr.classList.add('sepRow');

      const tdPts = document.createElement('td'); tdPts.className='ptsCol'; tdPts.textContent = String(points[p]);
      const tdRank = document.createElement('td'); tdRank.className='rankCol'; tdRank.textContent = String(p+1);
      tr.appendChild(tdPts); tr.appendChild(tdRank);

      for(let r=0;r<races;r++){
        const td = document.createElement('td');
        td.classList.add('thin');

        const inp = document.createElement('input');
        inp.className = 'rankInput';
        inp.maxLength = 2;
        inp.autocomplete = 'off';
        inp.value = state.cells?.[r]?.[p] ?? '';
        inp.dataset.race = String(r);
        inp.dataset.pos = String(p);

        inp.addEventListener('input', ()=>{
          const v = normalizeKey(inp.value);
          inp.value = v;
          if(!state.cells[r]) state.cells[r] = {};
          state.cells[r][p] = v;
          if(v !== '') focusNextCell(r,p);
          recalcAll(true);
          scheduleSave();
        });

        td.appendChild(inp);
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }

    const trC = document.createElement('tr');
    const tdC0 = document.createElement('td'); tdC0.className='ptsCol'; tdC0.textContent='コース名'; tdC0.colSpan=2;
    trC.appendChild(tdC0);
    for(let r=0;r<races;r++){
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.className='courseInp';
      inp.value = state.courses?.[r] ?? '';
      inp.dataset.race=String(r);
      inp.autocomplete='off';
      inp.addEventListener('input', ()=>{
        state.courses[r] = inp.value;
        recalcAll(true);
        scheduleSave();
      });
      td.appendChild(inp);
      trC.appendChild(td);
    }
    tbl.appendChild(trC);

    const trR = document.createElement('tr');
    const tdR0 = document.createElement('td'); tdR0.className='ptsCol'; tdR0.textContent='残りレース数'; tdR0.colSpan=2;
    trR.appendChild(tdR0);
    for(let r=0;r<races;r++){ trR.appendChild(document.createElement('td')); }
    tbl.appendChild(trR);

    const trM = document.createElement('tr');
    const tdM0 = document.createElement('td'); tdM0.className='ptsCol missCol'; tdM0.textContent=''; tdM0.colSpan=2;
    trM.appendChild(tdM0);
    for(let r=0;r<races;r++){
      const td = document.createElement('td');
      td.className='missCol';
      td.id = 'miss_'+r;
      trM.appendChild(td);
    }
    tbl.appendChild(trM);

    const trL = document.createElement('tr');
    const tdL0 = document.createElement('td'); tdL0.className='ptsCol'; tdL0.textContent=''; tdL0.colSpan=2;
    trL.appendChild(tdL0);
    for(let r=0;r<races;r++){
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.className='lockBtn';
      btn.type='button';
      btn.textContent = state.locks[r] ? '🔒' : '🔓';
      btn.addEventListener('click', ()=>{
        state.locks[r] = !state.locks[r];
        btn.textContent = state.locks[r] ? '🔒' : '🔓';
        applyLocks();
      });
      td.appendChild(btn);
      trL.appendChild(td);
    }
    tbl.appendChild(trL);

    rankWrap.appendChild(tbl);
    applyLocks();
  }

  function applyLocks(){
    const tbl = rankWrap.querySelector('table');
    if(!tbl) return;
    for(let r=0;r<state.races;r++){
      const locked = !!state.locks[r];
      tbl.querySelectorAll(`input.rankInput[data-race="${r}"]`).forEach(inp=>{
        inp.disabled = locked;
        inp.tabIndex = locked ? -1 : 0;
      });
      const course = tbl.querySelector(`input.courseInp[data-race="${r}"]`);
      if(course){
        course.disabled = locked;
        course.tabIndex = locked ? -1 : 0;
      }
    }
  }

  function focusNextCell(r,p){
    let nr = r, np = p+1;
    if(np >= state.players){ np = 0; nr = r+1; }
    if(nr >= state.races) return;
    const next = rankWrap.querySelector(`input.rankInput[data-race="${nr}"][data-pos="${np}"]`);
    if(next && !next.disabled) next.focus();
  }

  function clearRaceErrors(){
    for(let r=0;r<state.races;r++){
      const miss = document.getElementById('miss_'+r);
      if(miss) miss.textContent = '';
    }
    rankWrap.querySelectorAll('.cellErr').forEach(el=>el.classList.remove('cellErr'));
  }
  function markRaceError(r, msg){
    const miss = document.getElementById('miss_'+r);
    if(miss) miss.textContent = msg;
    rankWrap.querySelectorAll(`input.rankInput[data-race="${r}"]`).forEach(inp=>{
      inp.parentElement?.classList.add('cellErr');
    });
  }
  function freezeOutputs(){
    // outputs remain as-is
  }

  function allCellsFilled(r){
    for(let p=0;p<state.players;p++){
      if((state.cells?.[r]?.[p] ?? '') === '') return false;
    }
    return true;
  }
  function countEmpties(r){
    let c=0;
    for(let p=0;p<state.players;p++){
      if((state.cells?.[r]?.[p] ?? '') === '') c++;
    }
    return c;
  }

  function buildCertText(standings, remaining){
    const maxDiff = MAXDIFF[state.players][state.mode] ?? 0;
    if(standings.length < 2) return '';
    const diff12 = standings[0].displayTotal - standings[1].displayTotal;
    const win = diff12 > maxDiff * remaining;

    if(standings.length === 2){
      return win ? '▶︎勝利確定' : '';
    }
    const q = safeParseInt(sanitizeIntInput(state.qualify));
    if(q > 0){
      if(win) return '▶︎1位確定';
      const k = clamp(q,1,standings.length-1);
      const a = standings[k-1];
      const b = standings[k];
      const diff = a.displayTotal - b.displayTotal;
      const qual = diff > maxDiff * remaining;
      return qual ? '▶︎通過確定' : '';
    }
    return win ? '▶︎1位確定' : '';
  }

  function buildCopyLine(standings, remaining){
    const view = state.viewTeam;
    const showOthers = state.showOthers;
    const selfId = (view !== 'none' && view !== 'sum') ? view : null;

    const parts = [];
    for(const s of standings){
      const label = (selfId && s.teamId===selfId) ? `【${s.name}】` : s.name;
      if(!showOthers && selfId && s.teamId!==selfId) continue;
      parts.push(`${label} ${s.displayTotal}`);
    }

    let rankLabel = '';
    if(selfId){
      const idx = standings.findIndex(x=>x.teamId===selfId);
      if(idx >= 0) rankLabel = (remaining===0) ? `最終${idx+1}位` : `現在${idx+1}位`;
    }

    let course = '';
    for(let r=state.races-1;r>=0;r--){
      const c = (state.courses?.[r] ?? '').trim();
      if(c){ course = c; break; }
    }

    let line = parts.join('／');
    if(rankLabel) line += `／${rankLabel}`;
    if(course) line += `／${course}`;
    line += `@${remaining}(補正込)`;
    return line;
  }

  function renderAdjLog(){
    const lines = [];
    for(const t of state.teams){
      const v = sanitizeIntInput(t.adj);
      if(v && v !== '0'){
        const name = t.name?.trim() ? t.name.trim() : ('チーム' + (Number(t.id)+1));
        lines.push(`${name} ${v}`);
      }
    }
    logAdj.textContent = lines.join('\n');
  }

  function renderCourseLog(courseLog){
    if(!state.showCourseLog){
      logCourse.textContent = '';
      return;
    }
    const lines = [];
    for(let r=0;r<state.races;r++){
      const c = (courseLog?.[r] ?? '').trim();
      if(c) lines.push(`${r+1}レース目 ${c}`);
    }
    logCourse.textContent = lines.join('\n');
  }

  async function copyText(text){
    try{
      await navigator.clipboard.writeText(text);
      return true;
    }catch(e){
      try{
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      }catch(e2){
        return false;
      }
    }
  }

  async function maybeAutoCopy(){
    autoCopyMsg.textContent = '';
    autoCopyMsg.className = 'autoCopyMsg';
    if(state.showOthers) return;
    if(state.viewTeam === 'none' || state.viewTeam === 'sum') return;

    const ok = await copyText(outOpt.textContent);
    if(ok){
      autoCopyMsg.textContent = '★自動コピーしました';
      autoCopyMsg.classList.add('ok');
      setTimeout(()=>{
        if(autoCopyMsg.textContent === '★自動コピーしました'){
          autoCopyMsg.textContent = '';
          autoCopyMsg.className = 'autoCopyMsg';
        }
      }, 10000);
    }else{
      autoCopyMsg.textContent = '★自動コピーできませんでした';
      autoCopyMsg.classList.add('ng');
    }
  }

  function recalcAll(doAutoCopy=false){
    clearRaceErrors();
    if(!checkDuplicateKeys()){
      freezeOutputs();
      return;
    }

    const players = state.players;
    const races = state.races;
    const points = (players===12) ? POINTS_12 : POINTS_24;
    const keyMap = getKeyMap();

    const teamCount = state.teams.length;
    const teamTotals = Array(teamCount).fill(0);
    const raceScores = {};
    const courseLog = [];

    const requiredPerTeam = Math.floor(players / teamCount);

    let frozen = false;

    for(let r=0;r<races;r++){
      const filled = allCellsFilled(r);
      const empties = countEmpties(r);

      const counts = Array(teamCount).fill(0);
      let cpuCount = 0;
      let hasInvalid = false;

      for(let p=0;p<players;p++){
        const raw = state.cells?.[r]?.[p] ?? '';
        if(raw === '') continue;
        if(raw === state.cpuKey && raw !== ''){ cpuCount++; continue; }
        const tid = keyMap.get(raw);
        if(tid == null){ hasInvalid = true; continue; }
        counts[Number(tid)]++;
      }

      const shortages = counts.map(c=> requiredPerTeam - c);
      const overage = shortages.some(x=>x<0);
      const shortageSum = shortages.reduce((a,b)=> a + Math.max(0,b), 0);
      const shortageTeams = shortages.map((s,i)=> s>0 ? i : -1).filter(i=>i>=0);

      const canAuto = (
        cpuCount === 0 &&
        !overage &&
        shortageTeams.length === 1 &&
        empties > 0 &&
        shortageSum === empties
      );

      const complete = filled || canAuto;

      if(complete){
        if((cpuCount>0 || shortageSum>0) && cpuCount !== shortageSum){
          markRaceError(r,'入力ミス');
          frozen = true;
          continue;
        }
      }

      if(!complete){
        continue;
      }

      if(hasInvalid){
        markRaceError(r,'入力ミス');
        frozen = true;
        continue;
      }

      const teamScore = Array(teamCount).fill(0);

      for(let p=0;p<players;p++){
        const raw = state.cells?.[r]?.[p] ?? '';
        let teamIdx = null;

        if(raw === ''){
          if(canAuto) teamIdx = shortageTeams[0];
        }else if(raw === state.cpuKey){
          continue;
        }else{
          const tid = keyMap.get(raw);
          if(tid != null) teamIdx = Number(tid);
        }

        if(teamIdx != null){
          teamScore[teamIdx] += points[p];
        }
      }

      if(shortageSum > 0){
        const cpuPoints = [];
        for(let p=0;p<players;p++){
          const raw = state.cells?.[r]?.[p] ?? '';
          if(raw === state.cpuKey) cpuPoints.push(points[p]);
        }
        let adopted = 0;
        if(cpuPoints.length){
          if(state.cpuCalc === 'MKB') adopted = Math.min(...cpuPoints);
          else adopted = Math.floor(cpuPoints.reduce((a,b)=>a+b,0) / cpuPoints.length);
        }
        for(let i=0;i<teamCount;i++){
          const s = shortages[i];
          if(s>0) teamScore[i] += adopted * s;
        }
      }

      raceScores[r] = {};
      for(let i=0;i<teamCount;i++){
        teamTotals[i] += teamScore[i];
        raceScores[r][String(i)] = teamScore[i];
      }
      courseLog[r] = state.courses?.[r] ?? '';
    }

    if(frozen){
      freezeOutputs();
      return;
    }

    const adjVals = state.teams.map(t=> safeParseInt(t.adj));
    const displayTotals = teamTotals.map((t,i)=> t + adjVals[i]);

    const standings = state.teams.map((t,i)=>({
      teamId: t.id,
      name: (t.name?.trim() ? t.name.trim() : ('チーム' + (i+1))),
      total: teamTotals[i],
      displayTotal: displayTotals[i],
      color: getTeamColor(t),
    })).sort((a,b)=> b.displayTotal - a.displayTotal);

    const completed = Object.keys(raceScores).length;
    const remaining = clamp(races - completed, 0, races);

    certText.textContent = state.showCert ? buildCertText(standings, remaining) : '';

    const line = buildCopyLine(standings, remaining);
    outMain.textContent = line;
    outOpt.textContent = line;

    renderAdjLog();
    renderCourseLog(courseLog);

    if(doAutoCopy) maybeAutoCopy();
  }

  function pruneInputs(){
    const players = state.players;
    const races = state.races;

    const newCells = {};
    for(let r=0;r<races;r++){
      const row = state.cells?.[r] ?? {};
      const nr = {};
      for(let p=0;p<players;p++){
        nr[p] = row?.[p] ?? '';
      }
      newCells[r] = nr;
    }
    state.cells = newCells;

    const nc = {};
    for(let r=0;r<races;r++){
      nc[r] = state.courses?.[r] ?? '';
    }
    state.courses = nc;

    const nl = {};
    for(let r=0;r<races;r++) nl[r] = !!state.locks?.[r];
    state.locks = nl;
  }

  function onRuleChange(){
    const prevPlayers = state.players;
    const prevMode = state.mode;

    state.players = getPlayers();
    state.races = getRaces();
    state.cpuCalc = getCpuCalc();

    const list = FORMATS[state.players];
    if(!list.some(x=>x.id===state.mode)) state.mode = list[0].id;

    buildModeOptions();

    if(prevPlayers !== state.players || prevMode !== state.mode){
      // delete adjustment/log on players or mode change
      for(const t of state.teams) t.adj = '';
      state.adjLog = [];
    }

    const d = derived(state.players, state.mode);
    const old = state.teams;
    state.teams = d.teams;
    for(let i=0;i<state.teams.length;i++){
      if(old[i]){
        state.teams[i].name = old[i].name ?? '';
        state.teams[i].key = old[i].key ?? '';
        state.teams[i].color = old[i].color ?? '';
        state.teams[i].adj = old[i].adj ?? '';
      }
    }

    pruneInputs();

    spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');

    buildTagTable();
    buildViewOptions();
    buildRankTable();
    recalcAll(true);
    scheduleSave();
  }

  function resetTags(){
    const q = 'qwertyuiopasdfghjklzxcvbnm';
    for(let i=0;i<state.teams.length;i++){
      state.teams[i].name = '';
      state.teams[i].key = (i < q.length) ? q[i] : '';
      state.teams[i].color = '';
      state.teams[i].adj = '';
    }
    state.cpuKey = 'y';
    inpCpuKey.value = state.cpuKey;
    state.adjLog = [];
    buildTagTable();
    buildViewOptions();
    recalcAll(true);
    scheduleSave();
  }

  function resetAll(){
    try{ localStorage.removeItem(LS_KEY); }catch(e){}
    location.reload();
  }

  function openModal(){ modalSpec.classList.remove('hidden'); modalSpec.setAttribute('aria-hidden','false'); }
  function closeModal(){ modalSpec.classList.add('hidden'); modalSpec.setAttribute('aria-hidden','true'); }

  function showPin(){ buildPinBar(); pinBar.classList.remove('hidden'); pinBar.setAttribute('aria-hidden','false'); }
  function hidePin(){ pinBar.classList.add('hidden'); pinBar.setAttribute('aria-hidden','true'); }

  function init(){
    const restored = loadSaved();

    document.querySelectorAll('input[name="players"]').forEach(r=>{
      r.checked = (Number(r.value) === state.players);
      r.addEventListener('change', onRuleChange);
    });
    document.querySelectorAll('input[name="races"]').forEach(r=>{
      r.checked = (Number(r.value) === state.races);
      r.addEventListener('change', onRuleChange);
    });
    document.querySelectorAll('input[name="cpuCalc"]').forEach(r=>{
      r.checked = (r.value === state.cpuCalc);
      r.addEventListener('change', onRuleChange);
    });

    buildModeOptions();
    selMode.value = state.mode;
    selMode.addEventListener('change', ()=>{ state.mode = selMode.value; onRuleChange(); });

    inpQualify.value = state.qualify ?? '';
    inpQualify.addEventListener('input', ()=>{
      const v = sanitizeIntInput(inpQualify.value);
      inpQualify.value = v;
      state.qualify = v;
      recalcAll(true);
      scheduleSave();
    });

    btnResetTags.addEventListener('click', resetTags);
    btnResetAll.addEventListener('click', resetAll);

    btnCopyMain.addEventListener('click', async ()=>{ await copyText(outMain.textContent); });
    btnCopyOpt.addEventListener('click', async ()=>{ await copyText(outOpt.textContent); });

    chkShowSum.checked = state.showSum;
    chkShowCert.checked = state.showCert;
    chkShowOthers.checked = state.showOthers;
    chkShowCourseLog.checked = state.showCourseLog;

    chkShowSum.addEventListener('change', ()=>{ state.showSum = chkShowSum.checked; recalcAll(true); scheduleSave(); });
    chkShowCert.addEventListener('change', ()=>{ state.showCert = chkShowCert.checked; recalcAll(true); scheduleSave(); });
    chkShowOthers.addEventListener('change', ()=>{ state.showOthers = chkShowOthers.checked; recalcAll(true); scheduleSave(); });
    chkShowCourseLog.addEventListener('change', ()=>{ state.showCourseLog = chkShowCourseLog.checked; recalcAll(true); scheduleSave(); });

    selView.addEventListener('change', ()=>{ state.viewTeam = selView.value; recalcAll(true); scheduleSave(); });

    btnPin.addEventListener('click', showPin);
    btnPinClose.addEventListener('click', hidePin);

    btnSpec.addEventListener('click', openModal);
    btnSpecClose.addEventListener('click', closeModal);
    modalSpec.querySelector('.modalBack')?.addEventListener('click', closeModal);

    if(!state.teams.length){
      const d = derived(state.players, state.mode);
      state.teams = d.teams;
      resetTags();
    }

    spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');

    buildTagTable();
    buildViewOptions();
    buildRankTable();
    recalcAll(false);

    if(!restored){
      state.lastUpdated = nowMs();
      doSave();
    }
  }

  init();
})();