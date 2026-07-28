(function () {
  "use strict";

  const SUPABASE_URL = 'https://irbdmpuhajxspbrvqzre.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_rKELxoeBY1oRFwy8kbnSlw_m2g9rXV9';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const PRAZO_DIAS_ATRASO = 3;
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const fmtDateLong = (iso) => { const [y, m, d] = iso.split('-'); return `${parseInt(d, 10)} de ${MESES[parseInt(m, 10) - 1]} de ${y}`; };

  let mapaLvUnidades = {};
  let mapaBdUnidades = {};
  let unidadesLista = ['Unidade', 'Kg', 'Pacote', 'Caixa', 'Litro'];
  let remessasCache = [];
  let dashboardCache = {};
  let cacheItensLv = [];
  let cacheItensBd = [];

  function toast(msg, type) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.25s'; setTimeout(() => el.remove(), 250); }, 2600);
  }

  /* ================= UNIDADES DE MEDIDA ================= */
  async function loadUnidades() {
    const { data, error } = await sb.from('unidades_medida').select('*').order('nome');
    if (!error && data && data.length > 0) {
      unidadesLista = data.map(u => u.nome);
    }
    populateUnitSelects();
  }

  function populateUnitSelects() {
    const unitSelects = document.querySelectorAll('.select-unidade-dynamic');
    unitSelects.forEach(selectEl => {
      const currentVal = selectEl.value;
      selectEl.innerHTML = '';
      unidadesLista.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        selectEl.appendChild(opt);
      });
      if (currentVal && unidadesLista.includes(currentVal)) {
        selectEl.value = currentVal;
      }
    });
  }

  /* ================= AUTH ================= */
  const loginGate = document.getElementById('login-gate');
  const logoutBtn = document.getElementById('logout-btn');

  document.getElementById('login-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const erroEl = document.getElementById('login-erro');
    if (erroEl) erroEl.style.display = 'none';
    if (!email || !senha) { if (erroEl) { erroEl.textContent = 'Preencha e-mail e senha'; erroEl.style.display = 'block'; } return; }

    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      if (erroEl) {
        erroEl.textContent = 'E-mail ou senha incorretos';
        erroEl.style.display = 'block';
      }
      return;
    }
    onLoggedIn();
  });

  logoutBtn?.addEventListener('click', async () => {
    await sb.auth.signOut();
    location.reload();
  });

  function onLoggedIn() {
    if (loginGate) loginGate.classList.remove('open');
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    loadUnidades().then(() => {
      loadLavanderia();
      loadBrindes();
    });
  }

  async function checkSession() {
    const { data } = await sb.auth.getSession();
    if (data.session) onLoggedIn();
    else if (loginGate) loginGate.classList.add('open');
  }

  /* ================= UI GERAL & NAVEGAÇÃO ================= */
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      const targetPanel = document.getElementById('panel-' + btn.dataset.tab);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  function fillSelect(selectEl, options, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = placeholder; ph.disabled = true; ph.selected = true;
    selectEl.appendChild(ph);
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      selectEl.appendChild(o);
    });
  }

  const lvItemSelect = document.getElementById('lv-item');
  const bdItemSelect = document.getElementById('bd-item');
  const lvDataEl = document.getElementById('lv-data');
  if (lvDataEl) lvDataEl.value = todayISO();

  lvItemSelect?.addEventListener('change', (e) => {
    const itemNome = e.target.value;
    if (mapaLvUnidades[itemNome]) {
      const lvUnidade = document.getElementById('lv-unidade');
      if (lvUnidade) lvUnidade.value = mapaLvUnidades[itemNome];
    }
  });

  bdItemSelect?.addEventListener('change', (e) => {
    const itemNome = e.target.value;
    if (mapaBdUnidades[itemNome]) {
      const bdUnidade = document.getElementById('bd-unidade');
      if (bdUnidade) bdUnidade.value = mapaBdUnidades[itemNome];
    }
  });

  /* ================= MODAL NOVO ITEM ================= */
  const modalNovoItem = document.getElementById('modal-novo-item');
  const modalItemOrigem = document.getElementById('modal-item-origem');

  document.getElementById('btn-open-modal-lv')?.addEventListener('click', () => {
    if (modalItemOrigem) modalItemOrigem.value = 'lavanderia';
    const title = document.getElementById('modal-item-title');
    if (title) title.textContent = 'Cadastrar Item de Lavanderia';
    const inputNome = document.getElementById('new-item-nome');
    if (inputNome) inputNome.value = '';
    modalNovoItem?.classList.add('open');
  });

  document.getElementById('btn-open-modal-bd')?.addEventListener('click', () => {
    if (modalItemOrigem) modalItemOrigem.value = 'brindes';
    const title = document.getElementById('modal-item-title');
    if (title) title.textContent = 'Cadastrar Item de Brinde / Material';
    const inputNome = document.getElementById('new-item-nome');
    if (inputNome) inputNome.value = '';
    modalNovoItem?.classList.add('open');
  });

  document.getElementById('modal-item-cancelar')?.addEventListener('click', () => modalNovoItem?.classList.remove('open'));

  document.getElementById('modal-item-salvar')?.addEventListener('click', async () => {
    const nome = document.getElementById('new-item-nome')?.value.trim();
    const unidade = document.getElementById('new-item-unidade')?.value;
    const origem = modalItemOrigem?.value;

    if (!nome) { toast('Digite o nome do item', 'danger'); return; }

    if (origem === 'lavanderia') {
      const { error } = await sb.from('lavanderia_itens').insert({ nome, unidade_padrao: unidade });
      if (error) { toast('Erro ao cadastrar item na lavanderia', 'danger'); return; }
      await loadLavanderia();
      if (lvItemSelect) lvItemSelect.value = nome;
      const lvUnidade = document.getElementById('lv-unidade');
      if (lvUnidade) lvUnidade.value = unidade;
    } else {
      const { error } = await sb.from('brindes_itens').insert({ nome, unidade_padrao: unidade });
      if (error) { toast('Erro ao cadastrar item nos brindes', 'danger'); return; }
      await loadBrindes();
      if (bdItemSelect) bdItemSelect.value = nome;
      const bdUnidade = document.getElementById('bd-unidade');
      if (bdUnidade) bdUnidade.value = unidade;
    }

    modalNovoItem?.classList.remove('open');
    toast('Novo material cadastrado com sucesso!', 'success');
  });

  /* ================= MODAL GERENCIADOR DE CADASTROS ================= */
  const modalGerenciador = document.getElementById('modal-gerenciador');
  const modalEditarItem = document.getElementById('modal-editar-item');

  document.getElementById('btn-open-gerenciador')?.addEventListener('click', () => {
    renderGerenciador();
    modalGerenciador?.classList.add('open');
  });

  document.getElementById('btn-close-gerenciador')?.addEventListener('click', () => modalGerenciador?.classList.remove('open'));

  // Alternar Subabas no Gerenciador
  document.querySelectorAll('.subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetSubtab = document.getElementById(btn.dataset.subtab);
      if (targetSubtab) targetSubtab.classList.add('active');
    });
  });

  function renderGerenciador() {
    renderTabelaMateriais('tbl-gerenciar-lavanderia', cacheItensLv, 'lavanderia_itens');
    renderTabelaMateriais('tbl-gerenciar-brindes', cacheItensBd, 'brindes_itens');
    renderGerenciadorUnidades();
  }

  function renderTabelaMateriais(elementId, listaItens, tabela) {
    const tbody = document.getElementById(elementId);
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!listaItens || listaItens.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted)">Nenhum material cadastrado.</td></tr>';
      return;
    }

    listaItens.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-strong">${item.nome}</td>
        <td>${item.unidade_padrao || 'Unidade'}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm btn-icon" data-edit-item-id="${item.id}" data-tabela="${tabela}" data-nome="${item.nome}" data-unidade="${item.unidade_padrao || 'Unidade'}">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon" data-del-item-id="${item.id}" data-tabela="${tabela}">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderGerenciadorUnidades() {
    const tbody = document.getElementById('tbl-gerenciar-unidades');
    if (!tbody) return;
    tbody.innerHTML = '';

    unidadesLista.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-strong">${u}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm btn-icon" data-del-unit="${u}">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Função auxiliar para delegar edição e exclusão de materiais
  async function handleMaterialActions(e) {
    const btnEdit = e.target.closest('[data-edit-item-id]');
    const btnDel = e.target.closest('[data-del-item-id]');

    if (btnEdit) {
      // Fecha o gerenciador e abre o modal de edição
      modalGerenciador?.classList.remove('open');
      
      const editId = document.getElementById('edit-item-id');
      const editTipo = document.getElementById('edit-item-tipo');
      const editNome = document.getElementById('edit-item-nome');
      const editUnidade = document.getElementById('edit-item-unidade');

      if (editId) editId.value = btnEdit.dataset.editItemId;
      if (editTipo) editTipo.value = btnEdit.dataset.tabela;
      if (editNome) editNome.value = btnEdit.dataset.nome;
      if (editUnidade) editUnidade.value = btnEdit.dataset.unidade;
      
      modalEditarItem?.classList.add('open');
    } else if (btnDel) {
      if (confirm('Deseja realmente apagar este material cadastrado?')) {
        const id = btnDel.dataset.delItemId;
        const tabela = btnDel.dataset.tabela;
        await sb.from(tabela).delete().eq('id', id);
        toast('Material removido!', 'success');
        await loadLavanderia();
        await loadBrindes();
        renderGerenciador();
      }
    }
  }

  document.getElementById('tbl-gerenciar-lavanderia')?.addEventListener('click', handleMaterialActions);
  document.getElementById('tbl-gerenciar-brindes')?.addEventListener('click', handleMaterialActions);

  // Cancelar Edição -> Reabre o Gerenciador
  document.getElementById('edit-item-cancelar')?.addEventListener('click', () => {
    modalEditarItem?.classList.remove('open');
    modalGerenciador?.classList.add('open');
  });

  // Salvar Edição do Material -> Reabre o Gerenciador com os dados atualizados
  document.getElementById('edit-item-salvar')?.addEventListener('click', async () => {
    const id = document.getElementById('edit-item-id')?.value;
    const tabela = document.getElementById('edit-item-tipo')?.value;
    const nome = document.getElementById('edit-item-nome')?.value.trim();
    const unidade_padrao = document.getElementById('edit-item-unidade')?.value;

    if (!nome) { toast('Nome não pode ficar vazio', 'danger'); return; }

    const { error } = await sb.from(tabela).update({ nome, unidade_padrao }).eq('id', id);
    if (error) { toast('Erro ao atualizar material', 'danger'); return; }

    modalEditarItem?.classList.remove('open');
    toast('Cadastro de material corrigido!', 'success');
    
    await loadLavanderia();
    await loadBrindes();
    renderGerenciador();
    
    modalGerenciador?.classList.add('open');
  });

  // Adicionar e Remover Unidade de Medida
  document.getElementById('btn-add-unidade')?.addEventListener('click', async () => {
    const input = document.getElementById('new-unit-input');
    const nome = input?.value.trim();

    if (!nome) { toast('Digite o nome da unidade', 'danger'); return; }

    const { error } = await sb.from('unidades_medida').insert({ nome });
    if (error) { toast('Erro ao adicionar unidade ou já existente', 'danger'); return; }

    if (input) input.value = '';
    toast('Nova unidade adicionada!', 'success');
    await loadUnidades();
    renderGerenciadorUnidades();
  });

  document.getElementById('tbl-gerenciar-unidades')?.addEventListener('click', async (e) => {
    const btnDel = e.target.closest('[data-del-unit]');
    if (btnDel) {
      const unitNome = btnDel.dataset.delUnit;
      if (confirm(`Remover a unidade "${unitNome}"?`)) {
        await sb.from('unidades_medida').delete().eq('nome', unitNome);
        toast('Unidade removida', 'success');
        await loadUnidades();
        renderGerenciadorUnidades();
      }
    }
  });

  /* ================= LAVANDERIA ================= */
  async function loadLavanderia() {
    const { data: itens } = await sb.from('lavanderia_itens').select('*').order('nome');
    const { data: remessas } = await sb.from('vw_lavanderia_remessas_status').select('*').order('data_saida', { ascending: false });
    const { data: dash } = await sb.from('vw_lavanderia_dashboard').select('*').single();

    cacheItensLv = itens || [];
    mapaLvUnidades = {};
    cacheItensLv.forEach(i => { mapaLvUnidades[i.nome] = i.unidade_padrao || 'Unidade'; });

    fillSelect(lvItemSelect, cacheItensLv.map(i => i.nome), 'Selecione um item...');
    remessasCache = remessas || [];
    dashboardCache = dash || {};

    renderLavanderia();
  }

  function calcularStatus(it) {
    if (it.status_calculado === 'entregue' || it.data_retorno) return 'entregue';
    const dataSaida = new Date(it.data_saida);
    const hoje = new Date();
    const diffDias = Math.floor((hoje - dataSaida) / (1000 * 60 * 60 * 24));
    return diffDias > PRAZO_DIAS_ATRASO ? 'atrasado' : 'aguardando';
  }

  function renderLavanderia() {
    const searchVal = document.getElementById('lv-search')?.value.toLowerCase().trim() || '';
    const searchDateVal = document.getElementById('lv-search-date')?.value || '';
    const statusVal = document.getElementById('lv-filter-status')?.value || 'todos';

    let filtradas = remessasCache.filter(it => {
      const matchSearch = it.item ? it.item.toLowerCase().includes(searchVal) : false;
      const matchDate = !searchDateVal || it.data_saida === searchDateVal;
      const st = calcularStatus(it);
      const matchStatus = (statusVal === 'todos') || (st === statusVal);
      return matchSearch && matchDate && matchStatus;
    });

    const container = document.getElementById('lv-timeline');
    const emptyEl = document.getElementById('lv-empty');
    if (!container) return;
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = filtradas.length === 0 ? 'block' : 'none';

    const groups = [];
    const groupMap = new Map();
    filtradas.forEach(it => {
      if (!groupMap.has(it.data_saida)) {
        const g = { data: it.data_saida, itens: [] };
        groupMap.set(it.data_saida, g);
        groups.push(g);
      }
      groupMap.get(it.data_saida).itens.push(it);
    });

    groups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'timeline-group';

      const itemsHtml = group.itens.map(it => {
        const diff = Number(it.diferenca);
        const stCalculado = calcularStatus(it);
        const isDone = stCalculado === 'entregue';
        const isLate = stCalculado === 'atrasado';

        let badge = `<span class="badge badge-wait">⏳ Aguardando</span>`;
        if (isDone) badge = `<span class="badge badge-done">✔ Entregue</span>`;
        else if (isLate) badge = `<span class="badge badge-late">⚠️ Atrasado</span>`;

        let diffLabel = '0 (exato)';
        let diffColor = 'var(--text-muted)';
        if (isDone) {
          if (diff > 0) { diffLabel = `+${diff} (sobrou)`; diffColor = 'var(--success)'; }
          else if (diff < 0) { diffLabel = `${diff} (faltou)`; diffColor = 'var(--danger)'; }
        }

        const retCol = isDone ? `${it.qtd_retornada} ${it.unidade} em ${fmtDate(it.data_retorno)}` : `0 ${it.unidade}`;

        return `
          <div class="tl-item">
            <div class="tl-col-item">${it.item}</div>
            <div class="tl-col-enviado">${it.qtd_saida} ${it.unidade}</div>
            <div class="tl-col-retornada">${retCol}</div>
            <div class="tl-col-status">${badge}</div>
            <div class="tl-col-diff" style="color:${diffColor}">${diffLabel}</div>
            <div class="tl-col-actions">
              ${!isDone ? `<button class="btn btn-ghost btn-sm" data-action="retorno" data-id="${it.id}" data-item="${it.item}" data-restante="${it.qtd_saida}">Baixa</button>` : ''}
              <button class="btn btn-ghost btn-sm btn-icon" data-action="del-lv" data-id="${it.id}">🗑️</button>
            </div>
          </div>`;
      }).join('');

      groupEl.innerHTML = `
        <div class="tl-gutter">
          <div class="tl-dot"></div>
          <div class="tl-line"></div>
        </div>
        <div class="tl-card">
          <div class="tl-date">${fmtDateLong(group.data)}</div>
          ${itemsHtml}
        </div>`;
      container.appendChild(groupEl);
    });

    const totalEnviado = Number(dashboardCache.total_enviado || 0);
    const totalRetornado = Number(dashboardCache.total_retornado || 0);
    const aguardando = Number(dashboardCache.aguardando_retorno || 0);
    const diferencaTotal = Number(dashboardCache.diferenca_total || 0);

    const totalEnvEl = document.getElementById('lv-total-enviado');
    const aguardEl = document.getElementById('lv-aguardando');
    if (totalEnvEl) totalEnvEl.innerHTML = `${totalEnviado} <span>peças</span>`;
    if (aguardEl) aguardEl.innerHTML = `${aguardando} <span>peças</span>`;

    const diffEl = document.getElementById('lv-diferenca');
    if (diffEl) {
      const sinal = diferencaTotal > 0 ? '+' : '';
      diffEl.innerHTML = `${sinal}${diferencaTotal} <span>peças</span>`;
      diffEl.style.color = diferencaTotal < 0 ? 'var(--danger)' : (diferencaTotal > 0 ? 'var(--success)' : '');
    }

    const pct = totalEnviado > 0 ? Math.round((totalRetornado / totalEnviado) * 100) : 0;
    const circumference = 169.6;
    const ringProg = document.getElementById('lv-ring-progress');
    const ringLbl = document.getElementById('lv-ring-label');
    if (ringProg) ringProg.style.strokeDashoffset = circumference - (circumference * pct / 100);
    if (ringLbl) ringLbl.textContent = pct + '%';
  }

  document.getElementById('lv-search')?.addEventListener('input', renderLavanderia);
  document.getElementById('lv-search-date')?.addEventListener('change', renderLavanderia);
  document.getElementById('lv-filter-status')?.addEventListener('change', renderLavanderia);

  document.getElementById('form-saida')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = lvItemSelect?.value;
    const qtd = parseFloat(document.getElementById('lv-qtd')?.value);
    const unidade = document.getElementById('lv-unidade')?.value;
    const data_saida = document.getElementById('lv-data')?.value;

    if (!item || !qtd) { toast('Preencha os campos obrigatórios', 'danger'); return; }

    let { data: itemRow } = await sb.from('lavanderia_itens').select('id').eq('nome', item).maybeSingle();
    let itemId = itemRow ? itemRow.id : null;

    if (!itemId) {
      const { data: novo, error: eIns } = await sb.from('lavanderia_itens').insert({ nome: item, unidade_padrao: unidade }).select('id').single();
      if (eIns) { toast('Erro ao criar item', 'danger'); return; }
      itemId = novo.id;
    }

    const { error } = await sb.from('lavanderia_remessas').insert({ item_id: itemId, qtd_saida: qtd, unidade, data_saida });
    if (error) { toast('Erro ao registrar saída', 'danger'); return; }

    e.target.reset();
    const lvData = document.getElementById('lv-data');
    if (lvData) lvData.value = todayISO();
    await loadLavanderia();
    toast('Saída registrada com sucesso', 'success');
  });

  let retornoTarget = null;
  const modalRetorno = document.getElementById('modal-retorno');

  document.getElementById('lv-timeline')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.dataset.action === 'retorno') {
      retornoTarget = id;
      const retQtd = document.getElementById('ret-qtd');
      const retData = document.getElementById('ret-data');
      if (retQtd) retQtd.value = btn.dataset.restante;
      if (retData) retData.value = todayISO();
      modalRetorno?.classList.add('open');
    } else if (btn.dataset.action === 'del-lv') {
      if (confirm('Deseja excluir esta remessa?')) {
        await sb.from('lavanderia_remessas').delete().eq('id', id);
        toast('Remessa excluída', 'success');
        await loadLavanderia();
      }
    }
  });

  document.getElementById('ret-cancelar')?.addEventListener('click', () => modalRetorno?.classList.remove('open'));
  document.getElementById('ret-confirmar')?.addEventListener('click', async () => {
    const qtd = parseFloat(document.getElementById('ret-qtd')?.value);
    const data_retorno = document.getElementById('ret-data')?.value;

    if (isNaN(qtd) || !data_retorno) { toast('Informe quantidade e data válidas', 'danger'); return; }

    const { error } = await sb.from('lavanderia_remessas').update({ qtd_retornada: qtd, data_retorno, status: 'entregue' }).eq('id', retornoTarget);
    if (error) { toast('Erro ao registrar retorno', 'danger'); return; }

    modalRetorno?.classList.remove('open');
    await loadLavanderia();
    toast('Retorno registrado!', 'success');
  });

  /* ================= EXPORTAÇÃO ================= */
  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    const dados = remessasCache.map(r => ({
      'Data Saída': fmtDate(r.data_saida),
      'Item': r.item,
      'Qtd Saída': r.qtd_saida,
      'Unidade': r.unidade,
      'Data Retorno': fmtDate(r.data_retorno),
      'Qtd Retornada': r.qtd_retornada || 0,
      'Diferença': r.diferenca || 0,
      'Status': calcularStatus(r).toUpperCase()
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conciliação");
    XLSX.writeFile(wb, `eLogistica_Conciliacao_${todayISO()}.xlsx`);
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Relatório de Conciliação de Lavanderia", 14, 15);

    const tableRows = remessasCache.map(r => [
      fmtDate(r.data_saida),
      r.item,
      `${r.qtd_saida} ${r.unidade}`,
      r.qtd_retornada ? `${r.qtd_retornada} ${r.unidade}` : '—',
      fmtDate(r.data_retorno),
      r.diferenca || 0,
      calcularStatus(r).toUpperCase()
    ]);

    doc.autoTable({
      head: [['Data Saída', 'Item', 'Qtd Enviada', 'Qtd Devolvida', 'Data Retorno', 'Dif.', 'Status']],
      body: tableRows,
      startY: 20
    });
    doc.save(`eLogistica_Conciliacao_${todayISO()}.pdf`);
  });

  /* ================= BRINDES ================= */
  async function loadBrindes() {
    const { data: itens } = await sb.from('brindes_itens').select('*').order('nome');
    const { data: estoque } = await sb.from('vw_brindes_estoque').select('*');

    cacheItensBd = itens || [];
    mapaBdUnidades = {};
    cacheItensBd.forEach(i => { mapaBdUnidades[i.nome] = i.unidade_padrao || 'Unidade'; });

    fillSelect(bdItemSelect, cacheItensBd.map(i => i.nome), 'Selecione um brinde...');
    renderBrindes(estoque || []);
  }

  function renderBrindes(estoque) {
    const tbody = document.getElementById('bd-tbody');
    const emptyEl = document.getElementById('bd-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (emptyEl) emptyEl.style.display = estoque.length === 0 ? 'block' : 'none';

    let totalItens = estoque.length;
    let totalPecas = 0;

    estoque.forEach(row => {
      const qtd = Number(row.qtd_total || 0);
      totalPecas += qtd;
      const isLow = qtd < 5;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Material" class="cell-strong">${row.item}</td>
        <td data-label="Quantidade">${qtd}</td>
        <td data-label="Unidade" class="cell-muted">${row.unidade || 'Unidade'}</td>
        <td data-label="Status">${isLow ? '<span class="badge badge-low">⚠️ Estoque Baixo</span>' : '<span class="badge badge-ok">✔ OK</span>'}</td>
        <td data-label="Ações"><button class="btn btn-ghost btn-sm btn-icon" data-del-bd="${row.item_id}">🗑️</button></td>
      `;
      tbody.appendChild(tr);
    });

    const totalItensEl = document.getElementById('bd-total-itens');
    const totalEstoqueEl = document.getElementById('bd-total-estoque');
    if (totalItensEl) totalItensEl.textContent = totalItens;
    if (totalEstoqueEl) totalEstoqueEl.textContent = totalPecas;
  }

  document.getElementById('bd-tbody')?.addEventListener('click', async (e) => {
    const btnDel = e.target.closest('[data-del-bd]');
    if (btnDel) {
      if (confirm('Deseja realmente apagar este item de brinde?')) {
        const id = btnDel.dataset.delBd;
        await sb.from('brindes_itens').delete().eq('id', id);
        toast('Item removido!', 'success');
        await loadBrindes();
      }
    }
  });

  document.getElementById('form-brinde')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = bdItemSelect?.value;
    const tipo = document.getElementById('bd-tipo')?.value;
    const qtd = parseFloat(document.getElementById('bd-qtd')?.value);
    const unidade = document.getElementById('bd-unidade')?.value;

    if (!item || !qtd) return;

    let { data: itemRow } = await sb.from('brindes_itens').select('id').eq('nome', item).single();
    if (!itemRow) { toast('Brinde não encontrado', 'danger'); return; }
    
    const factor = tipo === 'saida' ? -1 : 1;

    await sb.from('brindes_movimentacoes').insert({
      item_id: itemRow.id,
      qtd: qtd * factor,
      unidade
    });

    e.target.reset();
    await loadBrindes();
    toast('Estoque atualizado!', 'success');
  });

  checkSession();
})();
