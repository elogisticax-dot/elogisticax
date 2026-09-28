(function () {
  "use strict";

  const SUPABASE_URL = "https://irbdmpuhajxspbrvqzre.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_rKELxoeBY1oRFwy8kbnSlw_m2g9rXV9";

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const PRAZO_DIAS_ATRASO = 3;
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const ITENS_FIXOS_LAVANDERIA = ['Camisola', 'MOP Branco', 'MOP Vermelho'];
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
  let estoqueCache = [];

  // Modal de confirmação
  let confirmCallback = null;
  const modalConfirm = document.getElementById('modal-confirm');
  const modalConfirmMsg = document.getElementById('modal-confirm-msg');
  const modalConfirmTitle = document.getElementById('modal-confirm-title');
  const modalConfirmSim = document.getElementById('modal-confirm-sim');
  const modalConfirmCancelar = document.getElementById('modal-confirm-cancelar');

  modalConfirmCancelar?.addEventListener('click', () => {
    modalConfirm?.classList.remove('open');
    confirmCallback = null;
  });

  modalConfirmSim?.addEventListener('click', () => {
    modalConfirm?.classList.remove('open');
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });

  function confirmCustom(msg, callback, title = 'Confirmar ação') {
    if (modalConfirmMsg) modalConfirmMsg.textContent = msg;
    if (modalConfirmTitle) modalConfirmTitle.textContent = title;
    confirmCallback = callback;
    modalConfirm?.classList.add('open');
  }

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
    if (title) title.textContent = 'Cadastrar item de lavanderia';
    const inputNome = document.getElementById('new-item-nome');
    if (inputNome) inputNome.value = '';
    modalNovoItem?.classList.add('open');
  });

  document.getElementById('btn-open-modal-bd')?.addEventListener('click', () => {
    if (modalItemOrigem) modalItemOrigem.value = 'brindes';
    const title = document.getElementById('modal-item-title');
    if (title) title.textContent = 'Cadastrar item de brinde / material';
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
      const { error } = await sb.from('brindes_itens').insert({ nome, unidade, unidade_padrao: unidade });
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
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--muted)">Nenhum material cadastrado.</td></tr>';
      return;
    }

    listaItens.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-strong">${item.nome}</td>
        <td>${item.unidade_padrao || 'Unidade'}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm btn-icon" data-edit-item-id="${item.id}" data-tabela="${tabela}" data-nome="${item.nome}" data-unidade="${item.unidade_padrao || 'Unidade'}" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn btn-ghost btn-sm btn-icon" data-del-item-id="${item.id}" data-tabela="${tabela}" title="Excluir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
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
          <button class="btn btn-ghost btn-sm btn-icon" data-del-unit="${u}" title="Excluir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function excluirComFilhos(tabela, id) {
    if (tabela === 'lavanderia_itens') {
      await sb.from('lavanderia_remessas').delete().eq('item_id', id);
    } else if (tabela === 'brindes_itens') {
      await sb.from('brindes_movimentacoes').delete().eq('item_id', id);
    }
    return sb.from(tabela).delete().eq('id', id);
  }

  async function handleMaterialActions(e) {
    const btnEdit = e.target.closest('[data-edit-item-id]');
    const btnDel = e.target.closest('[data-del-item-id]');

    if (btnEdit) {
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
      confirmCustom(
        'Deseja realmente apagar este material cadastrado? Isso também remove o histórico de saídas/movimentações associado a ele.',
        async () => {
          const id = btnDel.dataset.delItemId;
          const tabela = btnDel.dataset.tabela;
          const { error } = await excluirComFilhos(tabela, id);
          if (error) { toast('Erro ao remover material', 'danger'); return; }
          toast('Material removido!', 'success');
          await loadLavanderia();
          await loadBrindes();
          renderGerenciador();
        },
        'Excluir material'
      );
    }
  }

  document.getElementById('tbl-gerenciar-lavanderia')?.addEventListener('click', handleMaterialActions);
  document.getElementById('tbl-gerenciar-brindes')?.addEventListener('click', handleMaterialActions);

  document.getElementById('edit-item-cancelar')?.addEventListener('click', () => {
    modalEditarItem?.classList.remove('open');
    modalGerenciador?.classList.add('open');
  });

  document.getElementById('edit-item-salvar')?.addEventListener('click', async () => {
    const id = document.getElementById('edit-item-id')?.value;
    const tabela = document.getElementById('edit-item-tipo')?.value;
    const nome = document.getElementById('edit-item-nome')?.value.trim();
    const unidade_padrao = document.getElementById('edit-item-unidade')?.value;

    if (!nome) { toast('Nome não pode ficar vazio', 'danger'); return; }

    const { error } = await sb.from(tabela).update({ nome, unidade_padrao }).eq('id', id);
    if (error) { toast('Erro ao atualizar material', 'danger'); return; }

    modalEditarItem?.classList.remove('open');
    toast('Cadastro de material atualizado!', 'success');

    await loadLavanderia();
    await loadBrindes();
    renderGerenciador();

    modalGerenciador?.classList.add('open');
  });

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
      confirmCustom(
        `Remover a unidade "${unitNome}"?`,
        async () => {
          await sb.from('unidades_medida').delete().eq('nome', unitNome);
          toast('Unidade removida', 'success');
          await loadUnidades();
          renderGerenciadorUnidades();
        },
        'Excluir unidade'
      );
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

    const semFiltroAtivo = !searchVal && !searchDateVal && statusVal === 'todos';

    groups.forEach(group => {
      if (semFiltroAtivo) {
        ITENS_FIXOS_LAVANDERIA.forEach(nomeFixo => {
          const jaTem = group.itens.some(it => it.item === nomeFixo);
          if (!jaTem) {
            group.itens.push({ id: `placeholder-${group.data}-${nomeFixo}`, item: nomeFixo, placeholder: true });
          }
        });
      }
      group.itens.sort((a, b) => a.item.localeCompare(b.item, 'pt-BR'));
    });

    groups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'timeline-group';

      const itemsHtml = group.itens.map(it => {
        if (it.placeholder) {
          return `
            <div class="tl-item tl-item-placeholder">
              <div class="tl-col-item">${it.item}</div>
              <div class="tl-col-enviado cell-muted">—</div>
              <div class="tl-col-retornada cell-muted">—</div>
              <div class="tl-col-status"><span class="badge badge-muted">Sem lançamento</span></div>
              <div class="tl-col-diff cell-muted">—</div>
              <div class="tl-col-actions"></div>
            </div>`;
        }

        const diff = Number(it.diferenca);
        const stCalculado = calcularStatus(it);
        const isDone = stCalculado === 'entregue';
        const isLate = stCalculado === 'atrasado';

        let badge = `<span class="badge badge-wait">Aguardando</span>`;
        if (isDone) badge = `<span class="badge badge-done">Entregue</span>`;
        else if (isLate) badge = `<span class="badge badge-late">Atrasado</span>`;

        let diffLabel = '—';
        let diffColor = 'var(--muted)';
        if (isDone) {
          if (diff > 0) { diffLabel = `+${diff} (sobrou)`; diffColor = 'var(--success)'; }
          else if (diff < 0) { diffLabel = `${diff} (faltou)`; diffColor = 'var(--danger)'; }
          else { diffLabel = '0 (exato)'; }
        }

        const retCol = isDone ? `${it.qtd_retornada} ${it.unidade} em ${fmtDate(it.data_retorno)}` : `— ${it.unidade}`;

        return `
          <div class="tl-item">
            <div class="tl-col-item">${it.item}</div>
            <div class="tl-col-enviado">${it.qtd_saida} ${it.unidade}</div>
            <div class="tl-col-retornada">${retCol}</div>
            <div class="tl-col-status">${badge}</div>
            <div class="tl-col-diff" style="color:${diffColor}">${diffLabel}</div>
            <div class="tl-col-actions">
              ${!isDone ? `<button class="btn btn-ghost btn-sm" data-action="retorno" data-id="${it.id}" data-item="${it.item}" data-restante="${it.qtd_saida}">Baixa</button>` : ''}
              <button class="btn btn-ghost btn-sm btn-icon" data-action="del-lv" data-id="${it.id}" title="Excluir">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
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

    // Contagens do dashboard
    let emAberto = 0, atrasadas = 0, entreguesMes = 0;
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    remessasCache.forEach(it => {
      const st = calcularStatus(it);
      if (st === 'aguardando' || st === 'atrasado') emAberto++;
      if (st === 'atrasado') atrasadas++;
      if (st === 'entregue' && it.data_retorno) {
        const dataRet = new Date(it.data_retorno);
        if (dataRet >= inicioMes) entreguesMes++;
      }
    });

    const emAbertoEl = document.getElementById('lv-em-aberto');
    const atrasadasEl = document.getElementById('lv-atrasadas');
    const entreguesMesEl = document.getElementById('lv-entregues-mes');
    if (emAbertoEl) emAbertoEl.textContent = emAberto;
    if (atrasadasEl) atrasadasEl.textContent = atrasadas;
    if (entreguesMesEl) entreguesMesEl.textContent = entreguesMes;

    const alertBox = document.getElementById('lv-alert-atrasadas');
    const alertText = document.getElementById('lv-alert-text');
    if (alertBox && alertText) {
      if (atrasadas > 0) {
        alertText.textContent = `${atrasadas} remessa${atrasadas > 1 ? 's' : ''} atrasada${atrasadas > 1 ? 's' : ''} — vale confirmar com a lavanderia.`;
        alertBox.style.display = 'block';
      } else {
        alertBox.style.display = 'none';
      }
    }
  }

  document.getElementById('lv-search')?.addEventListener('input', renderLavanderia);
  document.getElementById('lv-search-date')?.addEventListener('change', renderLavanderia);
  document.getElementById('lv-filter-status')?.addEventListener('change', renderLavanderia);

  document.getElementById('btn-clear-date')?.addEventListener('click', () => {
    const dateInput = document.getElementById('lv-search-date');
    if (dateInput) dateInput.value = '';
    renderLavanderia();
  });

  document.getElementById('form-saida')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const item = lvItemSelect?.value;
    const qtd = parseFloat(document.getElementById('lv-qtd')?.value);
    const unidade = document.getElementById('lv-unidade')?.value;
    const data_saida = document.getElementById('lv-data')?.value;

    if (!item || isNaN(qtd) || qtd < 0) { toast('Preencha os campos obrigatórios', 'danger'); return; }

    if (qtd === 0) {
      confirmCustom(
        `Você está registrando uma saída de 0 ${unidade} para "${item}".\n\nIsso é usado quando um material retorna da lavanderia sem ter sido enviado antes. Deseja continuar?`,
        async () => {
          if (submitBtn) submitBtn.disabled = true;
          try {
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
          } finally {
            if (submitBtn) submitBtn.disabled = false;
          }
        },
        'Confirmar saída'
      );
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
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
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
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
      confirmCustom(
        'Deseja excluir esta remessa?',
        async () => {
          await sb.from('lavanderia_remessas').delete().eq('id', id);
          toast('Remessa excluída', 'success');
          await loadLavanderia();
        },
        'Excluir remessa'
      );
    }
  });

  document.getElementById('ret-cancelar')?.addEventListener('click', () => modalRetorno?.classList.remove('open'));
  document.getElementById('ret-confirmar')?.addEventListener('click', async () => {
    const btnConfirmar = document.getElementById('ret-confirmar');
    const qtd = parseFloat(document.getElementById('ret-qtd')?.value);
    const data_retorno = document.getElementById('ret-data')?.value;

    if (isNaN(qtd) || !data_retorno) { toast('Informe quantidade e data válidas', 'danger'); return; }

    if (btnConfirmar) btnConfirmar.disabled = true;
    try {
      const { error } = await sb.from('lavanderia_remessas').update({ qtd_retornada: qtd, data_retorno, status: 'entregue' }).eq('id', retornoTarget);
      if (error) { toast('Erro ao registrar retorno', 'danger'); return; }

      modalRetorno?.classList.remove('open');
      await loadLavanderia();
      toast('Retorno registrado!', 'success');
    } finally {
      if (btnConfirmar) btnConfirmar.disabled = false;
    }
  });

  /* ================= EXPORTAÇÃO ================= */
  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { toast('Biblioteca de Excel não carregou — verifique sua conexão', 'danger'); return; }
    try {
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
    } catch (err) {
      console.error(err);
      toast('Erro ao gerar o Excel', 'danger');
    }
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    if (!window.jspdf) { toast('Biblioteca de PDF não carregou — verifique sua conexão', 'danger'); return; }
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.text("Relatório de Conciliação de Lavanderia", 14, 15);

      const tableRows = remessasCache.map(r => [
        fmtDate(r.data_saida),
        r.item,
        `${r.qtd_saida} ${r.unidade}`,
        r.qtd_retornada ? `${r.qtd_retornada} ${r.unidade}` : '0',
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
    } catch (err) {
      console.error(err);
      toast('Erro ao gerar o PDF', 'danger');
    }
  });

  /* ================= BRINDES ================= */
  /* ================= BRINDES ================= */
  async function loadBrindes() {
    const { data: itens, error: errItens } = await sb.from('brindes_itens').select('*').order('nome');
    const { data: estoque, error: errEstoque } = await sb.from('vw_brindes_estoque').select('*');

    if (errItens || errEstoque) {
      console.error('Erro ao carregar brindes:', errItens || errEstoque);
      toast('Erro ao buscar estoque de brindes', 'danger');
    }

    cacheItensBd = itens || [];
    mapaBdUnidades = {};
    // Ordenar itens por nome
    cacheItensBd.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    cacheItensBd.forEach(i => { mapaBdUnidades[i.nome] = i.unidade_padrao || 'Unidade'; });

    estoqueCache = estoque || [];
    // Ordenar estoque por nome
    estoqueCache.sort((a, b) => (a.item || '').localeCompare(b.item || '', 'pt-BR'));

    fillSelect(bdItemSelect, cacheItensBd.map(i => i.nome), 'Selecione um item...');
    renderBrindes(estoqueCache);
    renderAlertaEstoque(estoqueCache);
  }

  // Filtros da tabela de brindes
  document.getElementById('bd-search')?.addEventListener('input', () => renderBrindes(estoqueCache));
  document.getElementById('bd-filter-status')?.addEventListener('change', () => renderBrindes(estoqueCache));

  function renderAlertaEstoque(estoque) {
    const alertaBox = document.getElementById('bd-alerta-estoque');
    const alertaMsg = document.getElementById('bd-alerta-msg');
    const alertaLista = document.getElementById('bd-alerta-lista');
    
    if (!alertaBox || !alertaMsg || !alertaLista) return;

    const itensBaixo = estoque.filter(r => {
      const qtd = Number(r.qtd_total || 0);
      return qtd > 0 && qtd < 5;
    });

    const itensZerados = estoque.filter(r => {
      const qtd = Number(r.qtd_total || 0);
      return qtd === 0;
    });

    const totalCritico = itensBaixo.length + itensZerados.length;

    if (totalCritico === 0) {
      alertaBox.style.display = 'none';
      return;
    }

    alertaBox.style.display = 'block';
    
    let msg = `${totalCritico} item${totalCritico > 1 ? 's' : ''} com estoque crítico.`;
    if (itensZerados.length > 0) {
      msg += ` ${itensZerados.length} zerado${itensZerados.length > 1 ? 's' : ''}.`;
    }
    if (itensBaixo.length > 0) {
      msg += ` ${itensBaixo.length} com estoque baixo.`;
    }
    
    alertaMsg.textContent = msg;

    // Lista de itens críticos
    alertaLista.innerHTML = '';
    
    itensZerados.forEach(item => {
      const badge = document.createElement('span');
      badge.className = 'bd-alert-item zerado';
      badge.textContent = item.item || '—';
      alertaLista.appendChild(badge);
    });

    itensBaixo.forEach(item => {
      const badge = document.createElement('span');
      badge.className = 'bd-alert-item';
      badge.textContent = `${item.item} (${Number(item.qtd_total || 0)} ${item.unidade})`;
      alertaLista.appendChild(badge);
    });
  }

  function renderBrindes(estoque) {
    const tbody = document.getElementById('bd-tbody');
    const emptyEl = document.getElementById('bd-empty');
    const searchVal = document.getElementById('bd-search')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('bd-filter-status')?.value || 'todos';
    
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filtrar
    let filtrado = estoque.filter(row => {
      const matchSearch = (row.item || '').toLowerCase().includes(searchVal);
      const qtd = Number(row.qtd_total || 0);
      let matchStatus = true;
      
      if (statusFilter === 'ok') matchStatus = qtd >= 5;
      else if (statusFilter === 'baixo') matchStatus = qtd > 0 && qtd < 5;
      else if (statusFilter === 'zerado') matchStatus = qtd === 0;
      
      return matchSearch && matchStatus;
    });

    // Ordenar por nome
    filtrado.sort((a, b) => (a.item || '').localeCompare(b.item || '', 'pt-BR'));

    if (emptyEl) emptyEl.style.display = filtrado.length === 0 ? 'block' : 'none';

    let totalItens = filtrado.length;
    let totalPecas = 0;
    let countBaixo = 0;
    let countZerado = 0;

    filtrado.forEach(row => {
      const qtd = Number(row.qtd_total || 0);
      totalPecas += qtd;
      const isLow = qtd > 0 && qtd < 5;
      const isZero = qtd === 0;
      
      if (isLow) countBaixo++;
      if (isZero) countZerado++;

      let statusBadge = '<span class="badge badge-ok">OK</span>';
      let rowClass = 'estoque-ok';
      
      if (isZero) {
        statusBadge = '<span class="badge badge-late">Zerado</span>';
        rowClass = 'estoque-zerado';
      } else if (isLow) {
        statusBadge = '<span class="badge badge-low">Estoque baixo</span>';
        rowClass = 'estoque-baixo';
      }

      const tr = document.createElement('tr');
      tr.className = rowClass;
      tr.innerHTML = `
        <td data-label="Material" class="cell-strong">${row.item || '—'}</td>
        <td data-label="Quantidade" style="font-family:ui-monospace; font-weight:600">${qtd}</td>
        <td data-label="Unidade" class="cell-muted">${row.unidade || 'Unidade'}</td>
        <td data-label="Status">${statusBadge}</td>
        <td data-label="Ações">
          <button class="btn btn-ghost btn-sm btn-icon" data-del-bd="${row.item_id}" title="Excluir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Atualizar contadores
    const totalItensEl = document.getElementById('bd-total-itens');
    const totalEstoqueEl = document.getElementById('bd-total-estoque');
    const estoqueBaixoEl = document.getElementById('bd-estoque-baixo');
    const zeradosEl = document.getElementById('bd-zerados');
    
    if (totalItensEl) totalItensEl.textContent = totalItens;
    if (totalEstoqueEl) totalEstoqueEl.textContent = totalPecas;
    if (estoqueBaixoEl) estoqueBaixoEl.textContent = countBaixo;
    if (zeradosEl) zeradosEl.textContent = countZerado;
  }

  document.getElementById('bd-tbody')?.addEventListener('click', async (e) => {
    const btnDel = e.target.closest('[data-del-bd]');
    if (btnDel) {
      confirmCustom(
        'Deseja realmente apagar este item de brinde? Isso também remove o histórico de movimentações dele.',
        async () => {
          const id = btnDel.dataset.delBd;
          const { error } = await excluirComFilhos('brindes_itens', id);
          if (error) { toast('Erro ao remover item', 'danger'); return; }
          toast('Item removido!', 'success');
          await loadBrindes();
        },
        'Excluir item'
      );
    }
  });

  document.getElementById('form-brinde')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const item = bdItemSelect?.value;
    const tipo = document.getElementById('bd-tipo')?.value || 'entrada';
    const qtd = parseFloat(document.getElementById('bd-qtd')?.value);

    if (!item || isNaN(qtd) || qtd <= 0) {
      toast('Informe um item e uma quantidade válida', 'danger');
      return;
    }

    if (tipo === 'saida') {
      const linhaEstoque = estoqueCache.find(r => r.item === item);
      const saldoAtual = linhaEstoque ? Number(linhaEstoque.qtd_total || 0) : 0;
      if (qtd > saldoAtual) {
        toast(`Estoque insuficiente: só há ${saldoAtual} disponível`, 'danger');
        return;
      }
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      let { data: itemRow, error: errItem } = await sb
        .from('brindes_itens')
        .select('id')
        .eq('nome', item)
        .maybeSingle();

      if (errItem || !itemRow) {
        toast('Item não encontrado nos cadastros', 'danger');
        return;
      }

      const { error: errMov } = await sb.from('brindes_movimentacoes').insert({
        item_id: itemRow.id,
        tipo: tipo,
        quantidade: qtd,
        data_mov: todayISO()
      });

      if (errMov) {
        console.error('Erro Supabase:', errMov);
        toast(`Erro ao salvar: ${errMov.message}`, 'danger');
        return;
      }

      e.target.reset();
      await loadBrindes();
      toast('Estoque atualizado com sucesso!', 'success');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  checkSession();
})();
