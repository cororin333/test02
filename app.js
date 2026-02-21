(()=> {
  'use strict';

  const VERSION = 'mkworld_8_12_noimg_v2_fixed_prod';
  const LS_KEY = 'mkworld:' + location.pathname;

  const SELECT_COLORS = [
    {name:'未選択', color:''},
    {name:'🔴赤', color:'#FE3C4F'},
    {name:'🔵青', color:'#498CF0'},
    {name:'🟡黄', color:'#FFF200'},
    {name:'🟢緑', color:'#57C544'},
  ];

  // 自動割り当て 優先順位（確定）
  const AUTO_COLORS = [
    '#FE3C4F',
    '#498CF0',
    '#FFF200',
    '#57C544',
    '#FF7CD5',
    '#7BE0FF',
    '#FD8600',
    '#AD6BFF',
    '#ACF243',
    '#B58464',
    '#FFB5EC',
    '#CCCCCC'
  ];

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

  const tagTables = $('#tagTables');

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
  const copyFailMsg = $('#copyFailMsg');

  const chkShowSum = $('#chkShowSum');
  const chkShowCert = $('#chkShowCert');
  const certText = $('#certText');

  const selView = $('#selView');

  const logAdj = $('#logAdj');
  const logCourse = $('#logCourse');
  const chkShowCourseLog = $('#chkShowCourseLog');

  const btnSpec = $('#btnSpec');
  const modalSpec = $('#modalSpec');
  const btnSpecClose = $('#btnSpecClose');

  // 入力バグ（全角で増殖）対策：IME合成中は書き換えない
  let composingQualify = false;

  const state = {
    players: 24,      // デフォルト確定
    races: 12,        // デフォルト確定
    mode: '6v6',      // デフォルト確定
    qualify: '',
    cpuCalc: 'MKB',
    teams: [],
    cpuKey: 'y',
    cells: {},
    courses: {},
    locks: {},
    adjLog: [],
    showSum: false,
    showCert: true,
    optViewTeam: 'none',
    showCourseLog: false,
    dispMode: 'normal', // normal / sumOnly
    lastUpdated: 0,
    autosaveOff: false,
  };

  function nowMs(){ return Date.now(); }
  function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

  function toHalfWidth(s){
    return String(s ?? '')
      .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
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

  // 全角数字増殖対策：IME中は触らない（呼び出し側で制御）
  function sanitizeIntInput(s){
    s = toHalfWidth(String(s ?? ''));
    s = s.replace(/[^0-9+\-]/g,'');
    // 先頭以外の符号を除去
    const m = s.match(/^([+\-]?)(\d*)/);
    if(!m) return '';
    return (m[1] || '') + (m[2] || '');
  }

  function safeParseInt(s){
    if(s === '' || s == null) return 0;
    const n = parseInt(s,10);
    return Number.isFinite(n) ? n : 0;
  }

  function getPlayers(){ return Number(document.querySelector('input[name="players"]:checked')?.value || 24); }
  function getRaces(){ return Number(document.querySelector('input[name="races"]:checked')?.value || 12); }
  function getCpuCalc(){ return String(document.querySelector('input[name="cpuCalc"]:checked')?.value || 'MKB'); }
  function getDispMode(){ return String(document.querySelector('input[name="dispMode"]:checked')?.value || 'normal'); }

  function derived(players, modeId){
    const fmt = FORMATS[players].find(f=>f.id===modeId) || FORMATS[players][0];
    const teams = Array.from({length: fmt.teamCount}, (_,i)=>({id:String(i), name:'', key:'', color:'', adj:''}));
    return {fmt, teams};
  }

  // 色選択あり/なし：チーム数4以下のみ（確定）
  function hasColorSelect(teamCount){
    return teamCount <= 4;
  }

  function teamAutoColor(i){ return AUTO_COLORS[i % AUTO_COLORS.length]; }

  function getTeamColorForScoreCell(teamIndex){
    const {fmt} = derived(state.players, state.mode);
    const t = state.teams[teamIndex];
    if(!t) return '';
    if(hasColorSelect(fmt.teamCount)){
      return t.color || '';
    }
    return teamAutoColor(teamIndex);
  }

  let saveTimer = null;
  function scheduleSave(){
    if(state.autosaveOff) return;
    state.lastUpdated = nowMs();
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 300);
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
        locks: state.locks,
        adjLog: state.adjLog,
        showSum: state.showSum,
        showCert: state.showCert,
        optViewTeam: state.optViewTeam,
        showCourseLog: state.showCourseLog,
        dispMode: state.dispMode,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    }catch(e){
      state.autosaveOff = true;
    }
  }

  function loadSaved(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return false;
      const obj = JSON.parse(raw);

      if(!obj || obj.version !== VERSION){
        localStorage.removeItem(LS_KEY);
        return false;
      }

      state.players = obj.players ?? 24;
      state.races = obj.races ?? 12;
      state.mode = obj.mode ?? '6v6';
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
      state.locks = obj.locks ?? {};
      state.adjLog = Array.isArray(obj.adjLog) ? obj.adjLog : [];

      state.showSum = !!obj.showSum;
      state.showCert = (obj.showCert !== false);
      state.optViewTeam = obj.optViewTeam ?? 'none';
      state.showCourseLog = !!obj.showCourseLog;
      state.dispMode = obj.dispMode ?? 'normal';

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

  function getTeamName(i){
    const t = state.teams[i];
    if(!t) return '';
    const nm = (t.name ?? '').trim();
    return nm ? nm : ('チーム' + (i+1));
  }

  /* ===== タグテーブル（横スクなし / 12以上は2段） ===== */

  function splitTeamIndexes(teamCount){
    if(teamCount <= 12){
      return [Array.from({length:teamCount},(_,i)=>i)];
    }
    return [
      Array.from({length:12},(_,i)=>i),
      Array.from({length:teamCount-12},(_,i)=>i+12),
    ];
  }

  function buildTagTables(){
    const {fmt} = derived(state.players, state.mode);
    const teamCount = fmt.teamCount;
    const colorOn = hasColorSelect(teamCount);

    tagTables.innerHTML = '';

    const groups = splitTeamIndexes(teamCount);

    // チームテーブル（1段 or 2段）
    for(const idxs of groups){
      const tbl = document.createElement('table');
      tbl.className = 'sheet';
      const tbody = document.createElement('tbody');

      const rows = [];
      rows.push({head:'タグ', kind:'name'});
      if(colorOn) rows.push({head:'色選択', kind:'color'});
      rows.push({head:'キー', kind:'key'});
      rows.push({head:'点数補正', kind:'adj'});

      for(const row of rows){
        const tr = document.createElement('tr');

        const th = document.createElement('th');
        th.className = 'rowHead';
        th.textContent = row.head;
        tr.appendChild(th);

        for(const i of idxs){
          const td = document.createElement('td');

          if(row.kind==='name'){
            const inp = document.createElement('input');
            inp.className = 'cellInp smalltxt';
            inp.value = state.teams[i]?.name ?? '';
            inp.maxLength = 12;
            inp.autocomplete = 'off';
            inp.addEventListener('input', ()=>{
              state.teams[i].name = inp.value;
              renderPinPreview();
              buildPinBar();
              buildOptViewOptions();
              recalcAll(true);
              recalcOptIfNeeded(true);
              scheduleSave();
            });
            td.appendChild(inp);
          }

          if(row.kind==='color'){
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
            // 背景を塗らない（確定）
            sel.addEventListener('change', ()=>{
              state.teams[i].color = sel.value;
              renderPinPreview();
              buildPinBar();
              recalcAll(true);
              recalcOptIfNeeded(true);
              scheduleSave();
            });
            td.appendChild(sel);
          }

          if(row.kind==='key'){
            const inp = document.createElement('input');
            inp.className = 'cellInp';
            inp.value = state.teams[i]?.key ?? '';
            inp.maxLength = 2;
            inp.autocomplete = 'off';
            inp.addEventListener('input', ()=>{
              const v = normalizeKey(inp.value);
              if(inp.value !== v) inp.value = v;
              state.teams[i].key = v;
              checkDuplicateKeys();
              renderPinPreview();
              buildPinBar();
              buildOptViewOptions();
              recalcAll(true);
              recalcOptIfNeeded(true);
              scheduleSave();
            });
            td.appendChild(inp);
          }

          if(row.kind==='adj'){
            let composingAdj = false;

            const inp = document.createElement('input');
            inp.className = 'cellInp';
            inp.value = state.teams[i]?.adj ?? '';
            inp.autocomplete = 'off';
            inp.inputMode = 'numeric';

            inp.addEventListener('compositionstart', ()=>{ composingAdj = true; });
            inp.addEventListener('compositionend', ()=>{
              composingAdj = false;
              const v = sanitizeIntInput(inp.value);
              if(inp.value !== v) inp.value = v;
              state.teams[i].adj = v;
              recalcAll(true);
              recalcOptIfNeeded(true);
              scheduleSave();
            });

            inp.addEventListener('input', ()=>{
              if(composingAdj) return;
              const v = sanitizeIntInput(inp.value);
              if(inp.value !== v) inp.value = v;
              state.teams[i].adj = v;
              recalcAll(true);
              recalcOptIfNeeded(true);
              scheduleSave();
            });

            td.appendChild(inp);
          }

          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      }

      tbl.appendChild(tbody);
      tagTables.appendChild(tbl);
    }

    // ★CPUテーブル（サイズ同一 / 1段分）
    const cpuTbl = document.createElement('table');
    cpuTbl.className = 'sheet';
    const cpuBody = document.createElement('tbody');

    const cpuRows = [];
    cpuRows.push({head:'タグ', kind:'tag'});
    if(colorOn) cpuRows.push({head:'色選択', kind:'colorFixed'});
    cpuRows.push({head:'キー', kind:'key'});

    for(const row of cpuRows){
      const tr = document.createElement('tr');

      const th = document.createElement('th');
      th.className = 'rowHead';
      th.textContent = row.head;
      tr.appendChild(th);

      const td = document.createElement('td');

      if(row.kind==='tag'){
        td.style.background = CPU_COLOR;
        td.style.color = '#fff';
        td.style.fontWeight = '900';
        td.textContent = '★CPU';
      }

      if(row.kind==='colorFixed'){
        td.style.background = CPU_COLOR;
      }

      if(row.kind==='key'){
        const inp = document.createElement('input');
        inp.className = 'cellInp';
        inp.maxLength = 2;
        inp.autocomplete = 'off';
        inp.value = state.cpuKey ?? 'y';
        inp.addEventListener('input', ()=>{
          const v = normalizeKey(inp.value);
          if(inp.value !== v) inp.value = v;
          state.cpuKey = v;
          renderPinPreview();
          buildPinBar();
          recalcAll(true);
          recalcOptIfNeeded(true);
          scheduleSave();
        });
        td.appendChild(inp);
      }

      tr.appendChild(td);
      cpuBody.appendChild(tr);
    }

    cpuTbl.appendChild(cpuBody);
    tagTables.appendChild(cpuTbl);

    checkDuplicateKeys();
    renderPinPreview();
    buildPinBar();
  }

  /* ===== タグ見本（★CPU 3倍間隔 / 24FFAは指定並び） ===== */

  function makeBadge(i){
    const badge = document.createElement('div');
    badge.className = 'badge';

    const top = document.createElement('div');
    top.className = 'badgeTop';
    top.textContent = getTeamName(i);

    const {fmt} = derived(state.players, state.mode);
    const bg = hasColorSelect(fmt.teamCount) ? (state.teams[i].color || '') : teamAutoColor(i);
    if(bg){
      top.style.background = bg;
      top.style.color = '#000';
    }

    const bot = document.createElement('div');
    bot.className = 'badgeBot';
    bot.textContent = state.teams[i].key || '';

    badge.appendChild(top);
    badge.appendChild(bot);
    return badge;
  }

  function makeCpuBadge(){
    const badge = document.createElement('div');
    badge.className = 'badge';

    const top = document.createElement('div');
    top.className = 'badgeTop';
    top.textContent = '★CPU';
    top.style.background = CPU_COLOR;
    top.style.color = '#fff';

    const bot = document.createElement('div');
    bot.className = 'badgeBot';
    bot.textContent = state.cpuKey || '';

    badge.appendChild(top);
    badge.appendChild(bot);
    return badge;
  }

  function renderPinPreview(){
    pinPreview.innerHTML = '';
    const {fmt} = derived(state.players, state.mode);
    const teamCount = fmt.teamCount;

    // 24人制FFA：1段目 12チーム + (間隔3倍) + CPU / 2段目 12チーム
    if(state.players===24 && state.mode==='FFA'){
      const row1 = document.createElement('div');
      row1.style.display = 'flex';
      row1.style.gap = '6px';
      row1.style.alignItems = 'flex-start';
      row1.style.flexWrap = 'nowrap';

      for(let i=0;i<12;i++) row1.appendChild(makeBadge(i));

      const sp = document.createElement('div');
      sp.className = 'cpuSpacer';
      row1.appendChild(sp);

      row1.appendChild(makeCpuBadge());

      const row2 = document.createElement('div');
      row2.style.display = 'flex';
      row2.style.gap = '6px';
      row2.style.alignItems = 'flex-start';
      row2.style.flexWrap = 'wrap';
      row2.style.marginTop = '6px';

      for(let i=12;i<24;i++) row2.appendChild(makeBadge(i));

      pinPreview.appendChild(row1);
      pinPreview.appendChild(row2);
      return;
    }

    // その他：チーム→(間隔3倍)→CPU（wrapはCSS任せ）
    for(let i=0;i<teamCount;i++){
      pinPreview.appendChild(makeBadge(i));
    }
    const sp = document.createElement('div');
    sp.className = 'cpuSpacer';
    pinPreview.appendChild(sp);
    pinPreview.appendChild(makeCpuBadge());
  }

  function buildPinBar(){
    pinBarContent.innerHTML = '';
    // プレビューと同内容で生成
    const {fmt} = derived(state.players, state.mode);
    const teamCount = fmt.teamCount;

    if(state.players===24 && state.mode==='FFA'){
      const row1 = document.createElement('div');
      row1.style.display = 'flex';
      row1.style.gap = '6px';
      row1.style.alignItems = 'flex-start';
      row1.style.flexWrap = 'nowrap';

      for(let i=0;i<12;i++) row1.appendChild(makeBadge(i));
      const sp = document.createElement('div');
      sp.className = 'cpuSpacer';
      row1.appendChild(sp);
      row1.appendChild(makeCpuBadge());

      const row2 = document.createElement('div');
      row2.style.display = 'flex';
      row2.style.gap = '6px';
      row2.style.alignItems = 'flex-start';
      row2.style.flexWrap = 'wrap';
      row2.style.marginTop = '6px';

      for(let i=12;i<24;i++) row2.appendChild(makeBadge(i));

      pinBarContent.appendChild(row1);
      pinBarContent.appendChild(row2);
      return;
    }

    for(let i=0;i<teamCount;i++){
      pinBarContent.appendChild(makeBadge(i));
    }
    const sp = document.createElement('div');
    sp.className = 'cpuSpacer';
    pinBarContent.appendChild(sp);
    pinBarContent.appendChild(makeCpuBadge());
  }

  function showPin(){ buildPinBar(); pinBar.classList.remove('hidden'); pinBar.setAttribute('aria-hidden','false'); }
  function hidePin(){ pinBar.classList.add('hidden'); pinBar.setAttribute('aria-hidden','true'); }

  /* ===== 集計オプション ===== */

  function buildOptViewOptions(){
    selView.innerHTML = '';

    const o0 = document.createElement('option');
    o0.value = 'none';
    o0.textContent = '表示なし';
    selView.appendChild(o0);

    for(const t of state.teams){
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = (t.name?.trim() ? t.name.trim() : ('チーム' + (Number(t.id)+1)));
      selView.appendChild(o);
    }

    selView.value = state.optViewTeam;
  }

  /* ===== 順位入力（得点／順位1セル・角丸・罫線調整） ===== */

  function getRankTd(r,p){
    const tbl = rankWrap.querySelector('table');
    if(!tbl) return null;
    return tbl.querySelector(`input.rankKey[data-race="${r}"][data-pos="${p}"]`)?.closest('td') ?? null;
  }

  function updateRankCellDisplay(td, r, p){
    const disp = td.querySelector('.rankDisp');
    const raw = (state.cells?.[r]?.[p] ?? '').trim();

    let label = '';
    let bg = '';

    if(raw === ''){
      label = '';
      bg = '';
    }else if(raw === state.cpuKey){
      label = '★CPU';
      bg = CPU_COLOR;
    }else{
      const keyMap = getKeyMap();
      const tid = keyMap.get(raw);
      if(tid == null){
        label = raw;
        bg = '';
      }else{
        const idx = Number(tid);
        label = getTeamName(idx);
        bg = getTeamColorForScoreCell(idx);
      }
    }

    disp.textContent = label;
    td.style.background = bg || '';
  }

  function applyLocks(){
    const tbl = rankWrap.querySelector('table');
    if(!tbl) return;
    for(let r=0;r<state.races;r++){
      const locked = !!state.locks[r];
      tbl.querySelectorAll(`input.rankKey[data-race="${r}"]`).forEach(inp=>{
        inp.disabled = locked;
      });
      const course = tbl.querySelector(`input.courseInp[data-race="${r}"]`);
      if(course) course.disabled = locked;
    }
  }

  function focusNextCell(r,p){
    let nr = r, np = p+1;
    if(np >= state.players){ np = 0; nr = r+1; }
    if(nr >= state.races) return;
    const next = rankWrap.querySelector(`input.rankKey[data-race="${nr}"][data-pos="${np}"]`);
    if(next && !next.disabled) next.focus();
  }

  function rebuildTabOrder(){
    // タグ設定：左→右（タグ→キー→点数補正）
    // 順位入力：1レース 1位→…→最下位→コース→次レース
    // 色選択はTab対象外

    inpQualify.tabIndex = -1;
    document.querySelectorAll('.colorSel').forEach(el => el.tabIndex = -1);

    // まず入力系 -1
    document.querySelectorAll('input,select,button').forEach(el=>{
      if(
        el.classList.contains('cellInp') ||
        el.classList.contains('rankKey') ||
        el.classList.contains('courseInp')
      ){
        el.tabIndex = -1;
      }
    });

    let tab = 1;

    // タグ設定：タグ→キー→点数補正（左→右）
    const nameIns = Array.from(tagTables.querySelectorAll('input.cellInp.smalltxt'));
    for(const inp of nameIns) inp.tabIndex = tab++;

    const keyIns = Array.from(tagTables.querySelectorAll('input.cellInp:not(.smalltxt)')).filter(x=>{
      // 点数補正と区別するため、adjは inputMode numeric だがclass同じ。ここはDOM順で「キー行→点数補正行」になってるのでOK
      return true;
    });
    // ただし adj も含まれるので、後で上書きする
    for(const inp of keyIns) inp.tabIndex = tab++;

    const adjIns = Array.from(tagTables.querySelectorAll('table.sheet tr')).filter(tr=>{
      const th = tr.querySelector('th.rowHead');
      return th && th.textContent.trim()==='点数補正';
    }).flatMap(tr=>Array.from(tr.querySelectorAll('input.cellInp')));
    for(const inp of adjIns) inp.tabIndex = tab++;

    // 順位入力
    for(let r=0;r<state.races;r++){
      for(let p=0;p<state.players;p++){
        const inp = rankWrap.querySelector(`input.rankKey[data-race="${r}"][data-pos="${p}"]`);
        if(inp && !inp.disabled) inp.tabIndex = tab++;
      }
      const course = rankWrap.querySelector(`input.courseInp[data-race="${r}"]`);
      if(course && !course.disabled) course.tabIndex = tab++;
    }
  }

  function clearRaceErrors(){
    rankWrap.querySelectorAll('.missMsg').forEach(x=> x.textContent = '');
  }
  function markRaceError(r, msg){
    const miss = document.getElementById('miss_'+r);
    if(miss) miss.textContent = msg;
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

  function buildRankTable(){
    rankWrap.innerHTML = '';
    const players = state.players;
    const races = state.races;
    const points = (players===12) ? POINTS_12 : POINTS_24;

    const tbl = document.createElement('table');
    tbl.className = 'rankTable';

    // header row 1
    const tr0 = document.createElement('tr');

    const thSR = document.createElement('th');
    thSR.className = 'rankHeadTd srHead';
    thSR.textContent = '得点／順位';
    tr0.appendChild(thSR);

    for(let r=0;r<races;r++){
      const th = document.createElement('th');
      th.className = 'rankHeadTd';
      th.textContent = (r===0) ? 'レース数' : ''; // 左寄せ感を壊さないため、先頭だけ
      if(r===7) th.classList.add('raceSplit');
      tr0.appendChild(th);
    }
    tbl.appendChild(tr0);

    // header row 2 (race nums)
    const tr1 = document.createElement('tr');
    const thBlank = document.createElement('th');
    thBlank.className = 'rankHeadTd srHead';
    thBlank.textContent = '';
    tr1.appendChild(thBlank);

    for(let r=0;r<races;r++){
      const th = document.createElement('th');
      th.className = 'rankHeadTd';
      th.textContent = String(r+1);
      if(r===7) th.classList.add('raceSplit');
      tr1.appendChild(th);
    }
    tbl.appendChild(tr1);

    // rows
    for(let p=0;p<players;p++){
      const tr = document.createElement('tr');

      const tdSR = document.createElement('td');
      tdSR.className = 'srCol rankCellTd';
      tdSR.textContent = `${points[p]}/${p+1}`;
      if(players===24 && p===12) tdSR.classList.add('sepTop');
      tr.appendChild(tdSR);

      for(let r=0;r<races;r++){
        const td = document.createElement('td');
        td.className = 'rankCellTd';
        if(players===24 && p===12) td.classList.add('sepTop');
        if(r===7) td.classList.add('raceSplit');

        const box = document.createElement('div');
        box.className = 'rankCell';

        const inp = document.createElement('input');
        inp.className = 'rankKey';
        inp.autocomplete = 'off';
        inp.inputMode = 'text';
        inp.value = state.cells?.[r]?.[p] ?? '';
        inp.dataset.race = String(r);
        inp.dataset.pos = String(p);

        inp.addEventListener('focus', ()=>{ try{ inp.select(); }catch(e){} });

        inp.addEventListener('input', ()=>{
          const v = normalizeKey(inp.value);
          if(inp.value !== v) inp.value = v;
          if(!state.cells[r]) state.cells[r] = {};
          state.cells[r][p] = v;

          updateRankCellDisplay(td, r, p);

          if(v !== '') focusNextCell(r,p);

          const ok = recalcAll(true);
          if(ok) maybeAutoCopyMain();
          recalcOptIfNeeded(true);
          scheduleSave();
        });

        const disp = document.createElement('div');
        disp.className = 'rankDisp';

        box.appendChild(inp);
        box.appendChild(disp);
        td.appendChild(box);
        tr.appendChild(td);
      }

      tbl.appendChild(tr);
    }

    // course row
    const trC = document.createElement('tr');

    const tdC0 = document.createElement('td');
    tdC0.className = 'srCol rankCellTd';
    tdC0.textContent = 'コース名';
    trC.appendChild(tdC0);

    for(let r=0;r<races;r++){
      const td = document.createElement('td');
      td.className = 'rankCellTd';
      if(r===7) td.classList.add('raceSplit');

      const inp = document.createElement('input');
      inp.className='courseInp';
      inp.value = state.courses?.[r] ?? '';
      inp.dataset.race=String(r);
      inp.autocomplete='off';
      inp.addEventListener('input', ()=>{
        state.courses[r] = inp.value;
        const ok = recalcAll(true);
        if(ok) maybeAutoCopyMain();
        recalcOptIfNeeded(true);
        scheduleSave();
      });

      td.appendChild(inp);
      trC.appendChild(td);
    }
    tbl.appendChild(trC);

    // miss row (no border)
    const trM = document.createElement('tr');
    const tdM0 = document.createElement('td');
    tdM0.className = 'missTd';
    tdM0.textContent = '';
    trM.appendChild(tdM0);

    for(let r=0;r<races;r++){
      const td = document.createElement('td');
      td.className = 'missTd';
      const div = document.createElement('div');
      div.className = 'missMsg';
      div.id = 'miss_' + r;
      td.appendChild(div);
      trM.appendChild(td);
    }
    tbl.appendChild(trM);

    // lock row (no border)
    const trL = document.createElement('tr');
    const tdL0 = document.createElement('td');
    tdL0.className = 'lockTd';
    tdL0.textContent = '';
    trL.appendChild(tdL0);

    for(let r=0;r<races;r++){
      const td = document.createElement('td');
      td.className = 'lockTd';

      const btn = document.createElement('button');
      btn.className='lockBtn';
      btn.type='button';
      btn.textContent = state.locks[r] ? '🔒' : '🔓';
      btn.addEventListener('click', ()=>{
        state.locks[r] = !state.locks[r];
        btn.textContent = state.locks[r] ? '🔒' : '🔓';
        applyLocks();
        rebuildTabOrder();
        scheduleSave();
      });

      td.appendChild(btn);
      trL.appendChild(td);
    }
    tbl.appendChild(trL);

    rankWrap.appendChild(tbl);

    for(let r=0;r<state.races;r++){
      for(let p=0;p<state.players;p++){
        const td = getRankTd(r,p);
        if(td) updateRankCellDisplay(td, r, p);
      }
    }

    applyLocks();
    rebuildTabOrder();
  }

  /* ===== 計算 ===== */

  function buildCertText(standings, remaining, qualifyRaw){
    const maxDiff = MAXDIFF[state.players][state.mode] ?? 0; // 常に指定表と一致
    if(standings.length < 2) return '';
    const diff12 = standings[0].displayTotal - standings[1].displayTotal;
    const win = diff12 > maxDiff * remaining;

    if(standings.length === 2){
      return win ? '▶︎勝利確定' : '';
    }
    const q = safeParseInt(sanitizeIntInput(qualifyRaw));
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

  function hasAnyAdjInput(){
    for(const t of state.teams){
      const v = sanitizeIntInput(t.adj);
      if(v && v !== '0') return true;
    }
    return false;
  }

  function renderAdjLog(){
    const lines = [];
    for(const t of state.teams){
      const v = sanitizeIntInput(t.adj);
      if(v && v !== '0'){
        const idx = Number(t.id);
        const name = getTeamName(idx);
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

  function calcStandings(){
    clearRaceErrors();

    if(!checkDuplicateKeys()){
      return {ok:false, reason:'dup'};
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
      return {ok:false, reason:'race'};
    }

    const adjVals = state.teams.map(t=> safeParseInt(t.adj));
    const displayTotals = teamTotals.map((t,i)=> t + adjVals[i]);

    const standings = state.teams.map((t,i)=>({
      idx: i,
      name: getTeamName(i),
      total: teamTotals[i],
      displayTotal: displayTotals[i],
    })).sort((a,b)=> b.displayTotal - a.displayTotal);

    const completed = Object.keys(raceScores).length;
    const remaining = clamp(races - completed, 0, races);

    return {ok:true, standings, remaining, courseLog};
  }

  function buildMainLine(standings, remaining){
    const selfIdx = 0;
    const self = standings.find(s=>s.idx===selfIdx);
    const selfTotal = self ? self.displayTotal : 0;

    const showSum = !!state.showSum;
    const parts = [];

    for(const s of standings){
      if(s.idx === selfIdx){
        parts.push(`【${s.name}】 ${s.displayTotal}`);
        continue;
      }
      const diff = s.displayTotal - selfTotal;
      const sign = (diff>=0) ? `+${diff}` : `${diff}`;
      if(showSum){
        parts.push(`${s.name} ${s.displayTotal}(${sign})`);
      }else{
        parts.push(`${s.name} ${sign}`);
      }
    }

    let rankLabel = '';
    if(self){
      const idx = standings.findIndex(x=>x.idx===selfIdx);
      rankLabel = (remaining===0) ? `最終${idx+1}位` : `現在${idx+1}位`;
    }

    let course = '';
    for(let r=state.races-1;r>=0;r--){
      const c = (state.courses?.[r] ?? '').trim();
      if(c){ course = c; break; }
    }

    let line = parts.join('／');
    if(rankLabel) line += `／${rankLabel}`;
    if(course) line += `／${course}`;
    line += `＠${remaining}`;

    if(hasAnyAdjInput()){
      line += ` (補正込)`;
    }

    if(state.showCert){
      const cert = buildCertText(standings, remaining, state.qualify);
      if(cert) line += cert;
    }

    return line;
  }

  // 合計のみ（自チーム概念なし、順位/勝ち確/コース/@remainingなし）
  function buildSumOnlyLine(standings){
    return standings.map(s=>`${s.name} ${s.displayTotal}`).join('／');
  }

  function buildOptLine(standings, remaining, baseIdx){
    const base = standings.find(s=>s.idx===baseIdx);
    const baseTotal = base ? base.displayTotal : 0;

    const showSum = !!state.showSum;
    const parts = [];

    for(const s of standings){
      if(s.idx === baseIdx){
        parts.push(`【${s.name}】 ${s.displayTotal}`);
        continue;
      }
      const diff = s.displayTotal - baseTotal;
      const sign = (diff>=0) ? `+${diff}` : `${diff}`;
      if(showSum){
        parts.push(`${s.name} ${s.displayTotal}(${sign})`);
      }else{
        parts.push(`${s.name} ${sign}`);
      }
    }

    let rankLabel = '';
    if(base){
      const idx = standings.findIndex(x=>x.idx===baseIdx);
      rankLabel = (remaining===0) ? `最終${idx+1}位` : `現在${idx+1}位`;
    }

    let course = '';
    for(let r=state.races-1;r>=0;r--){
      const c = (state.courses?.[r] ?? '').trim();
      if(c){ course = c; break; }
    }

    let line = parts.join('／');
    if(rankLabel) line += `／${rankLabel}`;
    if(course) line += `／${course}`;
    line += `＠${remaining}`;

    if(hasAnyAdjInput()){
      line += ` (補正込)`;
    }

    if(state.showCert){
      const cert = buildCertText(standings, remaining, state.qualify);
      if(cert) line += cert;
    }

    return line;
  }

  function recalcAll(doLogs){
    spMaxDiff.textContent = String(MAXDIFF[state.players][state.mode] ?? '--');

    const res = calcStandings();
    if(!res.ok){
      certText.textContent = '';
      renderAdjLog();
      if(!state.showCourseLog) logCourse.textContent = '';
      return false;
    }

    const {standings, remaining, courseLog} = res;

    if(state.dispMode === 'sumOnly'){
      certText.textContent = '';
      outMain.textContent = buildSumOnlyLine(standings);
    }else{
      certText.textContent = state.showCert ? buildCertText(standings, remaining, state.qualify) : '';
      outMain.textContent = buildMainLine(standings, remaining);
    }

    renderAdjLog();
    renderCourseLog(courseLog);

    return true;
  }

  function recalcOptIfNeeded(){
    // 合計のみ中はオプション空
    if(state.dispMode === 'sumOnly'){
      outOpt.textContent = '';
      return;
    }
    if(state.optViewTeam === 'none'){
      outOpt.textContent = '';
      return;
    }
    const baseIdx = Number(state.optViewTeam);
    if(!Number.isFinite(baseIdx) || baseIdx < 0 || baseIdx >= state.teams.length){
      outOpt.textContent = '';
      return;
    }

    const res = calcStandings();
    if(!res.ok){
      outOpt.textContent = '';
      return;
    }

    const {standings, remaining} = res;
    outOpt.textContent = buildOptLine(standings, remaining, baseIdx);
  }

  // 自動コピーは現状維持（使わない）
  async function maybeAutoCopyMain(){}

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

    if(state.optViewTeam !== 'none'){
      const n = Number(state.optViewTeam);
      if(!Number.isFinite(n) || n < 0 || n >= state.teams.length){
        state.optViewTeam = 'none';
      }
    }

    buildTagTables();
    buildOptViewOptions();
    buildRankTable();

    recalcAll(true);
    recalcOptIfNeeded(true);

    scheduleSave();
  }

  function resetTags(){
    for(let i=0;i<state.teams.length;i++){
      state.teams[i].name = '';
      state.teams[i].key = '';   // デフォルト空（確定）
      state.teams[i].color = '';
      state.teams[i].adj = '';
    }
    state.cpuKey = 'y';
    state.adjLog = [];

    buildTagTables();
    buildOptViewOptions();

    for(let r=0;r<state.races;r++){
      for(let p=0;p<state.players;p++){
        const td = getRankTd(r,p);
        if(td) updateRankCellDisplay(td, r, p);
      }
    }

    recalcAll(true);
    recalcOptIfNeeded(true);

    scheduleSave();
  }

  function resetAll(){
    try{ localStorage.removeItem(LS_KEY); }catch(e){}
    location.reload();
  }

  function openModal(){ modalSpec.classList.remove('hidden'); modalSpec.setAttribute('aria-hidden','false'); }
  function closeModal(){ modalSpec.classList.add('hidden'); modalSpec.setAttribute('aria-hidden','true'); }

  function init(){
    const restored = loadSaved();

    // ルール設定（デフォルト：24/6v6/12）
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

    // 通過組数：全角増殖対策（IME中は触らない）
    inpQualify.value = state.qualify ?? '';
    inpQualify.addEventListener('compositionstart', ()=>{ composingQualify = true; });
    inpQualify.addEventListener('compositionend', ()=>{
      composingQualify = false;
      const v = sanitizeIntInput(inpQualify.value);
      if(inpQualify.value !== v) inpQualify.value = v;
      state.qualify = v;
      recalcAll(true);
      recalcOptIfNeeded(true);
      scheduleSave();
    });
    inpQualify.addEventListener('input', ()=>{
      if(composingQualify) return;
      const v = sanitizeIntInput(inpQualify.value);
      if(inpQualify.value !== v) inpQualify.value = v;
      state.qualify = v;
      recalcAll(true);
      recalcOptIfNeeded(true);
      scheduleSave();
    });

    // 表示オプション：合計のみ
    document.querySelectorAll('input[name="dispMode"]').forEach(r=>{
      r.checked = (r.value === (state.dispMode ?? 'normal'));
      r.addEventListener('change', ()=>{
        state.dispMode = getDispMode();
        recalcAll(true);
        recalcOptIfNeeded(true);
        scheduleSave();
      });
    });

    btnResetTags.addEventListener('click', resetTags);
    btnResetAll.addEventListener('click', resetAll);

    // コピー失敗表示は集計結果横
    btnCopyMain.addEventListener('click', async ()=>{
      copyFailMsg.textContent = '';
      const ok = await copyText(outMain.textContent);
      if(!ok) copyFailMsg.textContent = '★コピーできませんでした';
    });

    btnCopyOpt.addEventListener('click', async ()=>{
      await copyText(outOpt.textContent);
    });

    chkShowSum.checked = state.showSum;
    chkShowCert.checked = state.showCert;
    chkShowCourseLog.checked = state.showCourseLog;

    chkShowSum.addEventListener('change', ()=>{
      state.showSum = chkShowSum.checked;
      recalcAll(true);
      recalcOptIfNeeded(true);
      scheduleSave();
    });
    chkShowCert.addEventListener('change', ()=>{
      state.showCert = chkShowCert.checked;
      recalcAll(true);
      recalcOptIfNeeded(true);
      scheduleSave();
    });
    chkShowCourseLog.addEventListener('change', ()=>{
      state.showCourseLog = chkShowCourseLog.checked;
      recalcAll(true);
      recalcOptIfNeeded(true);
      scheduleSave();
    });

    buildOptViewOptions();
    selView.addEventListener('change', ()=>{
      state.optViewTeam = selView.value;
      recalcOptIfNeeded(true);
      scheduleSave();
    });

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

    buildTagTables();
    buildOptViewOptions();
    buildRankTable();

    recalcAll(false);
    recalcOptIfNeeded(false);

    if(!restored){
      state.lastUpdated = nowMs();
      doSave();
    }else{
      rebuildTabOrder();
    }
  }

  init();
})();
