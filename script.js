(function(){
  "use strict";

  const SUPABASE_URL = 'https://irbdmpuhajxspbrvqzre.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_rKELxoeBY1oRFwy8kbnSlw_m2g9rXV9';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const todayISO = () => new Date().toISOString().slice(0,10);
  const fmtDate = (iso) => { if(!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; };

  function toast(msg, type){
    const stack = document.getElementById('toast-stack');
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' '+type : '');
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transition='.25s'; setTimeout(()=>el.remove(),250); }, 2600);
  }

  /* ================= LOGIN / AUTH ================= */
  const loginGate = document.getElementById('login-gate');
  const logoutBtn = document.getElementById('logout-btn');

  document.getElementById('login-btn').addEventListener('click', async ()=>{
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const erroEl = document.getElementById('login-erro');
    erroEl.style.display = 'none';
    if(!email || !senha){ erroEl.textContent = 'Preencha e-mail e senha'; erroEl.style.display='block'; return; }

    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if(error){
      erroEl.textContent = 'E-mail ou senha incorretos';
      erroEl.style.display = 'block';
      return;
    }
    onLoggedIn();
  });

  logoutBtn.addEventListener('click', async ()=>{
    await sb.auth.signOut();
    location.reload();
  });

  function onLoggedIn(){
    loginGate.classList.remove('open');
    logoutBtn.style.display = 'inline-flex';
    loadLavanderia();
    loadBrindes();
  }

  async function checkSession(){
    const { data } = await sb.auth.getSession();
    if(data.session){
      onLoggedIn();
    } else {
      loginGate.classList.add('open');
    }
  }

  /* ================= UI GERAL ================= */
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      tabBtns.forEach(b=>b.setAttribute('aria-selected','false'));
      btn.setAttribute('aria-selected','true');
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
      document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
    });
  });

  function fillSelect(selectEl, options, placeholder){
    selectEl.innerHTML = '';
    const ph = document.createElement('option');
    ph.value=''; ph.textContent = placeholder; ph.disabled=true; ph.selected=true;
    selectEl.appendChild(ph);
    options.forEach(opt=>{
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      selectEl.appendChild(o);
    });
  }

  const lvItemSelect = document.getElementById('lv-item');
  const bdItemSelect = document.getElementById('bd-item');
  document.getElementById('lv-data').value = todayISO();

  /* ================= LAVANDERIA ================= */

  async function loadLavanderia(){
    const { data: itens, error: e1 } = await sb.from('lavanderia_itens').select('nome').order('nome');
    const { data: remessas, error: e2 } = await sb.from('vw_lavanderia_remessas_status').select('*').order('data_saida', { ascending:false });
    const { data: dash, error: e3 } = await sb.from('vw_lavanderia_dashboard').select('*').single();
    if(e1||e2||e3){ toast('Erro ao carregar dados da lavanderia', 'danger'); console.error(e1||e2||e3); return; }
    fillSelect(lvItemSelect, itens.map(i=>i.nome), 'Selecione um item...');
    renderLavanderia(remessas, dash);
  }

  function renderLavanderia(remessas, dashboard){
    const tbody = document.getElementById('lv-tbody');
    const emptyEl = document.getElementById('lv-empty');
    tbody.innerHTML = '';
    emptyEl.style.display = remessas.length === 0 ? 'block' : 'none';

    remessas.forEach(it=>{
      const diff = Number(it.diferenca);
      const isDone = it.status_calculado === 'entregue';
      const isLate = it.status_calculado === 'atrasado';

      let badge = `<span class="badge badge-wait">⏳ Aguardando</span>`;
      if(isDone) badge = `<span class="badge badge-done">✔ Entregue</span>`;
      else if(isLate) badge = `<span class="badge badge-late">⚠ Atrasado</span>`;

      let diffLabel = '—';
      let diffColor = 'var(--text-muted)';
      if(isDone){
        if(diff > 0){ diffLabel = `+${diff} (sobrou)`; diffColor = 'var(--success)'; }
        else if(diff < 0){ diffLabel = `${diff} (faltou)`; diffColor = 'var(--danger)'; }
        else { diffLabel = '0 (exato)'; }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Item" class="cell-strong">${it.item}</td>
        <td data-label="Qtd. saída">${it.qtd_saida} ${it.unidade}</td>
        <td data-label="Data saída" class="cell-muted">${fmtDate(it.data_saida)}</td>
        <td data-label="Status">${badge}</td>
        <td data-label="Qtd. retornada">${it.qtd_retornada > 0 ? it.qtd_retornada + ' ' + it.unidade : '—'}</td>
        <td data-label="Diferença" style="color:${diffColor};font-weight:700">${diffLabel}</td>
        <td data-label="Ações">
          <div class="actions-cell">
            ${!isDone ? `<button class="btn btn-ghost btn-sm" data-action="retorno" data-id="${it.id}" data-item="${it.item}" data-unidade="${it.unidade}" data-restante="${it.qtd_saida}">Registrar retorno</button>` : ''}
            <button class="btn btn-ghost btn-sm btn-icon" data-action="del-lv" data-id="${it.id}" title="Excluir">🗑</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });

    const totalEnviado = Number(dashboard.total_enviado);
    const totalRetornado = Number(dashboard.total_retornado);
    const aguardando = Number(dashboard.aguardando_retorno);
    const diferencaTotal = Number(dashboard.diferenca_total);

    document.getElementById('lv-total-enviado').innerHTML = `${totalEnviado} <span>peças</span>`;
    document.getElementById('lv-aguardando').innerHTML = `${aguardando} <span>peças</span>`;

    const diffEl = document.getElementById('lv-diferenca');
    const sinal = diferencaTotal > 0 ? '+' : '';
    diffEl.innerHTML = `${sinal}${diferencaTotal} <span>peças</span>`;
    diffEl.style.color = diferencaTotal < 0 ? 'var(--danger)' : (diferencaTotal > 0 ? 'var(--success)' : '');

    const pct = totalEnviado > 0 ? Math.round((totalRetornado/totalEnviado)*100) : 0;
    const circumference = 169.6;
    document.getElementById('lv-ring-progress').style.strokeDashoffset = circumference - (circumference * pct / 100);
    document.getElementById('lv-ring-label').textContent = pct + '%';
  }

  document.getElementById('form-saida').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const item = lvItemSelect.value;
    const qtd = parseFloat(document.getElementById('lv-qtd').value);
    const unidade = document.getElementById('lv-unidade').value;
    const data_saida = document.getElementById('lv-data').value;
    if(!item){ toast('Selecione um item antes de registrar', 'danger'); return; }
    if(!qtd || qtd <= 0){ toast('Informe uma quantidade válida', 'danger'); return; }

    let { data: itemRow } = await sb.from('lavanderia_itens').select('id').eq('nome', item).maybeSingle();
    let itemId = itemRow ? itemRow.id : null;
    if(!itemId){
      const { data: novo, error: eIns } = await sb.from('lavanderia_itens').insert({ nome:item }).select('id').single();
      if(eIns){ toast('Erro ao criar item', 'danger'); return; }
      itemId = novo.id;
    }
    const { error } = await sb.from('lavanderia_remessas').insert({
      item_id: itemId, qtd_saida: qtd, unidade, data_saida
    });
    if(error){ toast('Erro ao registrar saída', 'danger'); console.error(error); return; }

    e.target.reset();
    document.getElementById('lv-data').value = todayISO();
    await loadLavanderia();
    toast('Saída registrada com sucesso', 'success');
  });

  document.querySelectorAll('[data-add]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const targetId = btn.dataset.add;
      const label = targetId === 'lv-item' ? 'novo item ou peça' : 'novo brinde';
      const name = prompt(`Nome do ${label}:`);
      if(!name || !name.trim()) return;
      const clean = name.trim();
      if(targetId === 'lv-item'){
        const { error } = await sb.from('lavanderia_itens').upsert({ nome: clean }, { onConflict:'nome' });
        if(error){ toast('Erro ao adicionar item', 'danger'); return; }
        await loadLavanderia();
        lvItemSelect.value = clean;
      } else {
        const { error } = await sb.from('brindes_itens').upsert({ nome: clean }, { onConflict:'nome' });
        if(error){ toast('Erro ao adicionar brinde', 'danger'); return; }
        await loadBrindes();
        bdItemSelect.value = clean;
      }
      toast('Item adicionado à lista', 'success');
    });
  });

  let retornoTarget = null;
  const modalRetorno = document.getElementById('modal-retorno');

  document.getElementById('lv-tbody').addEventListener('click', async (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;

    if(btn.dataset.action === 'retorno'){
      retornoTarget = id;
      document.getElementById('modal-retorno-sub').textContent = `${btn.dataset.item} · enviado ${btn.dataset.restante} ${btn.dataset.unidade}`;
      document.getElementById('ret-qtd').value = btn.dataset.restante;
      document.getElementById('ret-data').value = todayISO();
      modalRetorno.classList.add('open');
    }

    if(btn.dataset.action === 'del-lv'){
      if(confirm('Excluir este registro de remessa?')){
        await sb.from('lavanderia_retornos').delete().eq('remessa_id', id);
        const { error } = await sb.from('lavanderia_remessas').delete().eq('id', id);
        if(error){ toast('Erro ao excluir', 'danger'); return; }
        await loadLavanderia();
        toast('Remessa excluída', 'success');
      }
    }
  });

  document.getElementById('ret-cancelar').addEventListener('click', ()=>{ modalRetorno.classList.remove('open'); retornoTarget=null; });
  document.getElementById('ret-confirmar').addEventListener('click', async ()=>{
    const qtd = parseFloat(document.getElementById('ret-qtd').value);
    const data_retorno = document.getElementById('ret-data').value;
    if(qtd === null || isNaN(qtd) || qtd < 0){ toast('Informe uma quantidade válida', 'danger'); return; }

    const { data: remessa, error: eSel } = await sb.from('lavanderia_remessas').select('*').eq('id', retornoTarget).single();
    if(eSel){ toast('Erro ao buscar remessa', 'danger'); return; }

    const novaQtdRetornada = Number(remessa.qtd_retornada) + qtd;

    const { error: eUpd } = await sb.from('lavanderia_remessas').update({
      qtd_retornada: novaQtdRetornada, data_retorno, status: 'entregue'
    }).eq('id', retornoTarget);
    if(eUpd){ toast('Erro ao registrar retorno', 'danger'); return; }

    await sb.from('lavanderia_retornos').insert({ remessa_id: retornoTarget, qtd_retornada: qtd, data_retorno });

    modalRetorno.classList.remove('open');
    retornoTarget = null;
    await loadLavanderia();
    toast('Retorno registrado com sucesso', 'success');
  });

  /* ================= BRINDES ================= */

  async function loadBrindes(){
    const { data: itens, error: e1 } = await sb.from('brindes_itens').select('*').order('nome');
    const { data: dash, error: e2 } = await sb.from('vw_brindes_dashboard').select('*').single();
    if(e1||e2){ toast('Erro ao carregar brindes', 'danger'); console.error(e1||e2); return; }
    fillSelect(bdItemSelect, itens.map(i=>i.nome), 'Selecione um brinde...');
    renderBrindes(itens, dash);
  }

  function renderBrindes(itens, dashboard){
    const tbody = document.getElementById('bd-tbody');
    const emptyEl = document.getElementById('bd-empty');
    tbody.innerHTML = '';
    emptyEl.style.display = itens.length === 0 ? 'block' : 'none';

    itens.forEach(it=>{
      const low = Number(it.quantidade) < Number(it.estoque_min);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Material / brinde" class="cell-strong">${it.nome}</td>
        <td data-label="Quantidade">${it.quantidade}</td>
        <td data-label="Unidade" class="cell-muted">${it.unidade}</td>
        <td data-label="Status">${low ? '<span class="badge badge-low">⚠ Estoque baixo</span>' : '<span class="badge badge-ok">✔ Regular</span>'}</td>
        <td data-label="Ações">
          <div class="actions-cell">
            <button class="btn btn-ghost btn-sm btn-icon" data-action="del-bd" data-id="${it.id}" title="Excluir">🗑</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });

    document.getElementById('bd-total-itens').textContent = dashboard.total_itens_cadastrados;
    document.getElementById('bd-total-estoque').textContent = dashboard.total_pecas_estoque;
  }

  document.getElementById('form-brinde').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const nome = bdItemSelect.value;
    const tipo = document.getElementById('bd-tipo').value;
    const qtd = parseFloat(document.getElementById('bd-qtd').value);
    const unidade = document.getElementById('bd-unidade').value;
    if(!nome){ toast('Selecione um brinde antes de salvar', 'danger'); return; }
    if(!qtd || qtd <= 0){ toast('Informe uma quantidade válida', 'danger'); return; }

    const { data: itemRow } = await sb.from('brindes_itens').select('*').eq('nome', nome).maybeSingle();
    let itemId, currentQty;
    if(!itemRow){
      if(tipo === 'saida'){ toast('Não é possível dar saída em um item ainda não cadastrado', 'danger'); return; }
      const { data: novo, error: eIns } = await sb.from('brindes_itens').insert({ nome, unidade, quantidade:0 }).select('*').single();
      if(eIns){ toast('Erro ao criar brinde', 'danger'); return; }
      itemId = novo.id; currentQty = 0;
    } else {
      itemId = itemRow.id; currentQty = Number(itemRow.quantidade);
    }

    const delta = tipo === 'entrada' ? qtd : -qtd;
    const novaQtd = Math.max(0, currentQty + delta);

    const { error: eUpd } = await sb.from('brindes_itens').update({ quantidade: novaQtd, unidade }).eq('id', itemId);
    if(eUpd){ toast('Erro ao atualizar estoque', 'danger'); return; }

    await sb.from('brindes_movimentacoes').insert({ item_id:itemId, tipo, quantidade:qtd, data_mov: todayISO() });

    e.target.reset();
    document.getElementById('bd-tipo').value = 'entrada';
    await loadBrindes();
    toast('Estoque atualizado com sucesso', 'success');
  });

  document.getElementById('bd-tbody').addEventListener('click', async (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    if(btn.dataset.action === 'del-bd'){
      if(confirm('Excluir este item do inventário?')){
        await sb.from('brindes_movimentacoes').delete().eq('item_id', btn.dataset.id);
        const { error } = await sb.from('brindes_itens').delete().eq('id', btn.dataset.id);
        if(error){ toast('Erro ao excluir', 'danger'); return; }
        await loadBrindes();
        toast('Item excluído', 'success');
      }
    }
  });

  /* ---------- Init ---------- */
  checkSession();
})();
