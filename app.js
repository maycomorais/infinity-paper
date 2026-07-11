// ============================================================
// PAPELARIA MANAGER — app.js
// SPA Router + Auth + Módulos
// ============================================================

'use strict';

// ── SUPABASE INIT ─────────────────────────────────────────
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.sb = sb;
window.supa = sb; // também para compatibilidade

// ── LOG DE AUDITORIA ───────────────────────────────────────
// Registra ações administrativas (criar/editar/bloquear/excluir etc.)
// Não bloqueia o fluxo principal se falhar — apenas avisa no console.
async function registrarLog(acao, entidade, entidade_id, detalhes = {}) {
  try {
    await sb.from('logs_admin').insert({
      usuario_id: State.user?.id || null,
      usuario_email: State.user?.email || null,
      acao,
      entidade,
      entidade_id: entidade_id != null ? String(entidade_id) : null,
      detalhes,
    });
  } catch (e) {
    console.warn('[Log] Falha ao registrar log de auditoria:', e);
  }
}
window.registrarLog = registrarLog;

// ── PERSISTÊNCIA DO CARRINHO NO SESSIONSTORAGE ──────────
const PDV_STORAGE_KEY = 'pm_pdv_state';

function salvarEstadoPdv() {
  try {
    const estado = {
      carrinho: PdvState.carrinho,
      desconto: PdvState.desconto,
      pagamento: PdvState.pagamento,
      impressoraSelecionada: PdvState.impressoraSelecionada,
      tipoCopia: PdvState.tipoCopia,
      quantidade: PdvState.quantidade,
      frenteVerso: PdvState.frenteVerso,
      paginasPorDocumento: PdvState.paginasPorDocumento,
      step: PdvState.step,
      aba: PdvState.aba,
    };
    sessionStorage.setItem(PDV_STORAGE_KEY, JSON.stringify(estado));
  } catch (e) { /* ignora */ }
}

function carregarEstadoPdv() {
  try {
    const raw = sessionStorage.getItem(PDV_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function limparEstadoPdv() {
  sessionStorage.removeItem(PDV_STORAGE_KEY);
}

// ── MENSAGENS DE ERRO AMIGÁVEIS ────────────────────────────
// Traduz erros técnicos do Postgres/Supabase para algo que o usuário entenda.
// A mensagem original sempre vai pro console, pra não perder o debug.
function mensagemErroAmigavel(error, contexto = '') {
  console.error(`[Erro${contexto ? ' — ' + contexto : ''}]`, error);
  const msg = (error?.message || '').toLowerCase();

  if (msg.includes('duplicate key') || msg.includes('already registered') || msg.includes('já existe')) {
    return 'Já existe um registro com esses dados.';
  }
  if (msg.includes('violates foreign key') || msg.includes('foreign key constraint')) {
    return 'Não é possível concluir: existem outros registros vinculados a este item.';
  }
  if (msg.includes('permission denied') || msg.includes('acesso negado') || msg.includes('rls')) {
    return 'Você não tem permissão para realizar esta ação.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')) {
    return 'Falha de conexão. Verifique sua internet e tente novamente.';
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (msg.includes('password') && msg.includes('short')) {
    return 'A senha é muito curta (mínimo 6 caracteres).';
  }
  // Sem tradução conhecida: mostra algo genérico, sem expor SQL/estrutura interna
  return 'Ocorreu um erro ao processar sua solicitação. Tente novamente ou contate o suporte.';
}
window.mensagemErroAmigavel = mensagemErroAmigavel;

// ── STATE GLOBAL ──────────────────────────────────────────
const State = {
  user: null,
  userProfile: null,
  empresa: null,
  caixaSessao: null,
  impressoras: [],
  precosCopia: [],
  currentPage: null,
};

const STORAGE_KEY = 'pm_last_page';

// ── NAV CONFIG ────────────────────────────────────────────
const NAV = [
  { group: 'Principal' },
  { id: 'dashboard',    label: 'Dashboard',     icon: '📊', page: renderDashboard, roles: ['admin', 'funcionario'] },
  { id: 'copias',       label: 'PDV',           icon: '🖨️', page: renderCopias,   pdv: true, roles: ['admin', 'funcionario'] },
  { id: 'passagens',    label: 'Passagens NSA', icon:'🚌', page: renderPassagens, roles: ['admin', 'funcionario'] },
  { group: 'Produção' },
  { id: 'fila',         label: 'Fila de Produção', icon:'🖨️', page: renderFilaProducao, pdv: true, roles: ['admin', 'funcionario'] },
  
  { group: 'Cadastros' },
  { id: 'usuarios', label: 'Usuários', icon: '👥', page: renderUsuarios, roles: ['admin'] },


  { group: 'Gestão' },
  { id: 'caixa',        label: 'Caixa',         icon: '💰', page: renderCaixa, roles: ['admin', 'funcionario'] },
  { id: 'fiado',        label: 'Fiado',         icon: '📒', page: renderFiado, roles: ['admin', 'funcionario'] },
  { id: 'relatorios',   label: 'Relatórios',    icon: '📊', page: renderRelatorios, roles: ['admin', 'funcionario'] },
  { id: 'estoque',      label: 'Estoque',       icon: '📦', page: renderEstoque, roles: ['admin', 'funcionario'] },
  { id: 'contas',       label: 'Contas',        icon: '📋', page: renderContas, roles: ['admin'] },
  { id: 'compras',      label: 'Compras',       icon: '🛒', page: renderCompras, roles: ['admin'] },
  { id: 'producao', label: 'Produção', icon: '🏭', page: renderProducao, roles: ['admin', 'funcionario'] },

  { group: 'Cadastros' },
  { id: 'clientes',     label: 'Clientes',      icon: '👥', page: renderClientes, roles: ['admin'] },
  { id: 'funcionarios', label: 'Funcionários',  icon: '👔', page: renderFuncionarios, roles: ['admin'] },
  { id: 'fornecedores', label: 'Fornecedores',  icon: '🏭', page: renderFornecedores, roles: ['admin'] },
  { id: 'impressoras',  label: 'Impressoras',   icon: '🖥️', page: renderImpressoras, roles: ['admin', 'funcionario'] },
  { id: 'precos',       label: 'Tabela de Preços', icon:'💲', page: renderPrecos, roles: ['admin', 'funcionario'] },

  { group: 'Sistema' },
{ id: 'assinatura', label: 'Assinatura', icon: '🔐', page: renderAssinatura, roles: ['adminMaster'] },
];

// ── BOOT ──────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    State.user = session.user;
    await initApp();
  } else {
    showLogin();
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    console.log('Auth event:', _event, session?.user?.email);
    if (session) {
      State.user = session.user;
      await initApp();
    } else {
      State.user = null;
      showLogin();
    }
  });
})();

// ── AUTH ──────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const pwd = document.getElementById('login-password').value;
  if (!email || !pwd) { toast('Preencha e-mail e senha', 'warning'); return; }
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Entrando...';
  const { error } = await sb.auth.signInWithPassword({ email, password: pwd });
  if (error) { toast(error.message || 'Erro ao entrar', 'error'); }
  btn.disabled = false;
  btn.textContent = 'Entrar';
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  State.user = null;
  State.userProfile = null;
});

// ── INIT APP ──────────────────────────────────────────────
async function initApp() {
  console.log('🔵 initApp iniciado');
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';

  // Carrega dados base
  await Promise.all([loadEmpresa(), loadImpressoras(), loadPrecosCopia()]);
   console.log('✅ Dados base carregados');

  // Cotação BRL: fonte única é a coluna empresa.cotacao_brl.
  // Fallback pro campo antigo (config.cotacao_brl) só pra não perder valor já salvo por instalações antigas.
  const cotacaoDoBanco = State.empresa?.cotacao_brl ?? State.empresa?.config?.cotacao_brl;
  if (cotacaoDoBanco) {
    setCotacao(cotacaoDoBanco);
    const input = document.getElementById('input-cotacao');
    if (input) input.value = cotacaoDoBanco;
  }

  if (State.user) {
    console.log('👤 Usuário encontrado:', State.user.email);
    State.userProfile = await loadUserProfile(State.user.id);
    console.log('📦 Perfil carregado:', State.userProfile);
  }

  State.userProfile = await loadUserProfile(State.user.id);
  if (!State.userProfile) {
    // Caso extremo: cria um perfil em memória
    State.userProfile = { id: State.user.id, role: 'funcionario', nome: 'Operador', ativo: true };
  }

  if (State.userProfile) {
    console.log('🎯 Perfil OK, role:', State.userProfile.role);
    window.perfilUsuario = State.userProfile.role;
    window._operadorNome = State.user.email; // para registrar quem confirma pagamento

  // Inicializa a UI de assinatura (não bloqueia o fluxo)
  window.SubscriptionUI.inicializar({
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_ANON_KEY,
    contatoFone: '+595976771714', // seu WhatsApp
    contatoNome: 'Suporte',
    perfil: State.userProfile.role,
  }).catch(err => console.warn('Assinatura:', err));

  // Verifica se o usuário está bloqueado (pelo perfil)
  if (!State.userProfile.ativo) {
    toast('⚠️ Seu usuário está bloqueado. Contate o administrador.', 'error');
    await sb.auth.signOut();
    showLogin();
    return;
  }
}
  
  // Sidebar
  buildBottomNav();
  buildSidebar();
  document.getElementById('user-name-sidebar').textContent = State.user?.email?.split('@')[0] || 'Operador';
  document.getElementById('user-role-sidebar').textContent = State.userProfile?.role || 'Operador';

  // Widget de cotação BRL na topbar
  renderCotacaoWidget();
  const lastPage = localStorage.getItem(STORAGE_KEY) || 'dashboard';
  navigate(lastPage);
  
  renderCaixaStatusWidget();

  // Alerta de contas próximas do vencimento (não bloqueia o carregamento)
  verificarContasProximasVencimento();

  // Sidebar collapse
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
if (collapseBtn) {
  collapseBtn.addEventListener('click', function(e) {
    e.preventDefault();
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('collapsed');
    const collapsed = sb.classList.contains('collapsed');
    document.getElementById('sidebar-toggle-icon').textContent = collapsed ? '▶' : '◀';
    document.getElementById('sidebar-toggle-label').textContent = collapsed ? 'Expandir' : 'Recolher';
  });
} else {
  console.error('❌ Botão de recolher não encontrado no DOM');
  console.warn('⚠️ Nenhum perfil carregado');
}

  // Modal close
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('global-modal').addEventListener('click', e => {
    if (e.target.id === 'global-modal') closeModal();
  });
}

function userHasRole(requiredRoles) {
  const role = State.userProfile?.role || 'funcionario';
  if (role === 'adminMaster') return true; // sempre permitido
  return requiredRoles.includes(role);
}

// ── CONFIGURAÇÕES DE CAIXA ──────────────────────────────
const CONFIG = {
  getLimiteSangria: async () => {
    const { data, error } = await sb.from('empresa').select('config').single();
    if (error) return 1000000; // fallback
    return data?.config?.limite_sangria || 1000000;
  },
  setLimiteSangria: async (valor) => {
    const { data, error } = await sb.from('empresa').select('config').single();
    if (error) return;
    const config = data?.config || {};
    config.limite_sangria = valor;
    await sb.from('empresa').update({ config }).eq('id', data.id);
  }
};

async function loadUserProfile(userId) {
  if (!userId) {
    console.warn('loadUserProfile chamado sem userId');
    return { role: 'funcionario', nome: 'Anônimo', ativo: true };
  }
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); // use maybeSingle() em vez de single() para retornar null se não encontrado

    if (error) {
      console.error('Erro ao buscar perfil:', error);
      throw error;
    }

    if (data) {
      return data;
    }

    // Perfil não existe: criar
    console.log('Perfil não encontrado, criando...');
    const { data: newProfile, error: insertError } = await sb
      .from('profiles')
      .insert({
        id: userId,
        role: 'funcionario',
        nome: State.user?.user_metadata?.nome || State.user?.email?.split('@')[0] || 'Usuário',
        ativo: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Erro ao criar perfil:', insertError);
      // Fallback: retorna um perfil em memória para não travar o app
      return { id: userId, role: 'funcionario', nome: 'Usuário', ativo: true };
    }

    return newProfile;
  } catch (err) {
    console.error('Falha crítica em loadUserProfile:', err);
    // Retorna perfil mínimo para permitir uso, mas o usuário pode ter restrições
    return { id: userId, role: 'funcionario', nome: 'Usuário', ativo: true };
  }
}

async function loadEmpresa() {
  const { data } = await sb.from('empresa').select('*').limit(1).single();
  if (data) {
    State.empresa = data;
    document.getElementById('empresa-nome-login').textContent = data.nome;
    document.getElementById('empresa-nome-sidebar').textContent = data.nome;
  }
}
async function loadImpressoras() {
  const { data } = await sb.from('impressoras').select('*').eq('ativa', true).order('nome');
  State.impressoras = data || [];
}
async function loadPrecosCopia() {
  const { data } = await sb.from('precos_copia').select('*').eq('ativo', true);
  State.precosCopia = data || [];
}

// ── SIDEBAR ───────────────────────────────────────────────
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  const items = getVisibleNavItems();

  let html = '';
  let currentGroup = null;
  const grupos = {};

  // Precisamos dos grupos também, então vamos filtrar separadamente
  const allItems = NAV.filter(item => {
  if (item.group) return true;
  return !item.roles || userHasRole(item.roles);
});

  allItems.forEach(item => {
    if (item.group) {
      currentGroup = item.group;
      if (!grupos[currentGroup]) {
        grupos[currentGroup] = true;
        html += `<div class="nav-group-label">${item.group}</div>`;
      }
    } else {
      html += `<div class="nav-item" data-page="${item.id}" role="button" tabindex="0">
        <span class="nav-item-icon">${item.icon}</span>
        <span class="nav-item-label">${item.label}</span>
      </div>`;
    }
  });

  nav.innerHTML = html;

  nav.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
    el.addEventListener('keydown', e => e.key === 'Enter' && navigate(el.dataset.page));
  });

  console.log('allItems:', allItems.map(i => i.id));
  
  // Marca o item ativo após construir
  if (State.currentPage) updateActiveNav(State.currentPage);
}

function buildBottomNav() {
  const container = document.getElementById('bottom-nav');
  if (!container) return;

  const items = getVisibleNavItems();

  if (items.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Limita a, no máximo, 6 itens (opcional, para não poluir)
  // Mas vamos mostrar todos; em telas muito pequenas pode rolar,
  // mas com `justify-content: space-around` ele se ajusta.

  let html = '';
  items.forEach(item => {
    html += `
      <button class="bottom-nav-item" data-page="${item.id}" role="button" tabindex="0">
        <span class="bottom-nav-icon">${item.icon}</span>
        <!-- Se quiser um label pequeno, descomente a linha abaixo -->
        <!-- <span class="bottom-nav-label">${item.label}</span> -->
      </button>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.bottom-nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
    el.addEventListener('keydown', e => e.key === 'Enter' && navigate(el.dataset.page));
  });

  // Atualiza estado ativo
  if (State.currentPage) updateActiveNav(State.currentPage);
}

function updateActiveNav(pageId) {
  // Sidebar
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });

  // Bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });
}


// ── WIDGET DE COTAÇÃO BRL ─────────────────────────────────
// ── WIDGET DE STATUS DO CAIXA (sempre visível na topbar) ──
// Antes havia um mutex booleano (`_renderingWidget`) que simplesmente
// ABORTAVA chamadas concorrentes em vez de enfileirá-las. Como várias
// partes do app chamam renderCaixaStatusWidget() sem `await`
// (fecharCaixa, registrarMovimento, navigate()...), era comum a segunda
// chamada ser descartada silenciosamente e o widget ficar mostrando o
// status antigo ("Caixa Aberto") até a próxima navegação manual.
//
// Agora usamos um "request token": cada chamada gera um número; só a
// resposta da chamada MAIS RECENTE tem permissão de atualizar o DOM.
// Chamadas concorrentes não são mais descartadas, e uma resposta lenta
// e desatualizada nunca sobrescreve uma mais nova.
let _widgetRequestId = 0;

async function renderCaixaStatusWidget() {
  const meuId = ++_widgetRequestId;

  const actions = document.getElementById('topbar-actions');
  if (!actions) {
    console.warn('[CaixaStatus] topbar-actions não encontrado');
    return;
  }

  try {
    const status = await getStatusCaixa();

    // Chegou uma resposta mais nova enquanto esperávamos essa — descarta.
    if (meuId !== _widgetRequestId) return;

    const oldWidget = document.getElementById('caixa-status-widget');
    if (oldWidget) oldWidget.remove();

    const widget = document.createElement('div');
    widget.id = 'caixa-status-widget';
    widget.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--r-md);padding:6px 12px;font-size:var(--t-xs);cursor:pointer';

    if (status.aberto) {
      const cor = status.travado ? 'var(--c-warning)' : 'var(--c-success)';
      const texto = status.travado ? '🔒 Caixa Travado' : '🟢 Caixa Aberto';
      widget.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:${cor};display:inline-block;"></span>
        <span style="white-space:nowrap">${texto}</span>
      `;
      widget.onclick = () => navigate('caixa');
    } else {
      widget.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:var(--c-danger);display:inline-block;"></span>
        <span style="white-space:nowrap;color:var(--c-danger);font-weight:600">🔴 Caixa Fechado — Abrir</span>
      `;
      widget.onclick = () => navigate('caixa');
    }

    actions.prepend(widget);
  } catch (error) {
    if (meuId !== _widgetRequestId) return;
    console.error('[CaixaStatus] Erro ao renderizar widget:', error);
    const oldWidget = document.getElementById('caixa-status-widget');
    if (oldWidget) oldWidget.remove();
    const widget = document.createElement('div');
    widget.id = 'caixa-status-widget';
    widget.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--r-md);padding:6px 12px;font-size:var(--t-xs);cursor:pointer';
    widget.innerHTML = `<span>⚠️ Status do caixa indisponível</span>`;
    actions.prepend(widget);
  }
}

function renderCotacaoWidget() {
  console.log('renderCotacaoWidget chamada');
  const actions = document.getElementById('topbar-actions');
  console.log('topbar-actions:', actions);
  if (!actions) return;
  // Evita duplicar
   if (document.getElementById('cotacao-widget')) {
    console.log('Widget já existe');
    return;
  }

  const widget = document.createElement('div');
  widget.id = 'cotacao-widget';
  widget.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--r-md);padding:6px 12px;font-size:var(--t-xs)';
  widget.innerHTML = `
    <span style="color:var(--c-text-3);white-space:nowrap">🇧🇷 R$1 =</span>
    <input type="number" id="input-cotacao"
      value="${APP_CONFIG.cotacaoBRL}"
      step="10" min="100" max="9999"
      style="width:70px;background:var(--c-bg);border:1.5px solid var(--c-border);border-radius:6px;padding:4px 6px;color:var(--c-text);font-size:var(--t-xs);font-family:var(--font-mono,monospace);font-weight:700;text-align:center"
      title="Cotação do Real em Guaranis"
    />
    <span style="color:var(--c-text-3);white-space:nowrap">₲</span>
    <button onclick="salvarCotacao()" style="background:var(--c-primary);color:#fff;border:none;border-radius:5px;padding:3px 8px;font-size:10px;font-weight:600;cursor:pointer">OK</button>
  `;
  // Insere ANTES do primeiro filho (topbar-actions normalmente vazio no load)
   console.log('Widget criado');
  actions.prepend(widget);
}

window.salvarCotacao = async function() {
  const val = parseFloat(document.getElementById('input-cotacao')?.value);
  if (!val || val < 100) { toast('Cotação inválida', 'warning'); return; }

  // Cache local (usado como valor inicial instantâneo antes do banco responder)
  setCotacao(val);

  // Fonte de verdade: coluna dedicada empresa.cotacao_brl
  const { data: empresa } = await sb.from('empresa').select('id').single();
  if (empresa) {
    const { error } = await sb.from('empresa').update({ cotacao_brl: val }).eq('id', empresa.id);
    if (error) { toast(mensagemErroAmigavel(error, 'salvar cotação'), 'error'); return; }
    State.empresa.cotacao_brl = val;
    await registrarLog('editar', 'cotacao_brl', empresa.id, { valor: val });
  }

  toast(`Cotação atualizada: R$1 = ₲${val.toLocaleString('es-PY')}`, 'success');
};

// ── ROUTER ────────────────────────────────────────────────
async function navigate(pageId) {
  State.currentPage = pageId;
  localStorage.setItem(STORAGE_KEY, pageId);

  updateActiveNav(pageId);

  const item = NAV.find(n => n.id === pageId);
  if (!item) return;


  const userRole = State.userProfile?.role || 'funcionario';
  if (item.roles && !userHasRole(item.roles)) {
  toast('Acesso negado.', 'error');
  return navigate('dashboard');
}

  // Topbar title
  document.getElementById('page-title').textContent = item.label;
  document.getElementById('topbar-actions').innerHTML = '';
  // Recria os widgets (cotação + status do caixa, sempre visíveis)
  renderCotacaoWidget();
  renderCaixaStatusWidget();
  // Render
  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="loading-overlay"><div class="spinner"></div></div>`;

  if (item.pdv) {
    content.classList.add('pdv-mode');
  } else {
    content.classList.remove('pdv-mode');
  }

  try {
    await item.page(content);
  } catch (err) {
    content.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Erro ao carregar</div>
      <div class="empty-state-sub">${err.message}</div>
    </div>`;
    console.error(err);
  }
}

async function loadFolhasDisponiveis() {
  const { data } = await sb
    .from('produtos')
    .select('id, nome, unidade, estoque_atual')
    .eq('usado_na_impressao', true)  // apenas o flag
    .order('nome');
  State.folhasDisponiveis = data || [];
}

async function getStatusCaixa() {
  try {
    // Busca a sessão mais recente que esteja aberta (fechado_em IS NULL)
    const { data, error } = await sb
      .from('caixa_sessoes')
      .select('id, travado, aberto_em')
      .is('fechado_em', null)
      .order('aberto_em', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[getStatusCaixa] Erro na consulta:', error);
      return { aberto: false, travado: false };
    }

    // Se data for um array, pega o primeiro (ou null)
    const sessao = Array.isArray(data) ? data[0] : data;

    // Se encontrou mais de uma (o limit(1) já garante 1, mas só por segurança)
    if (Array.isArray(data) && data.length > 1) {
      console.warn('[getStatusCaixa] Atenção: múltiplas sessões abertas encontradas. Usando a mais recente.');
    }

    return {
      aberto: !!sessao,
      travado: sessao?.travado || false,
    };
  } catch (e) {
    console.error('[getStatusCaixa] Exceção:', e);
    return { aberto: false, travado: false };
  }
}

// Mantido por compatibilidade com o nome antigo, onde ainda for chamado.
async function isCaixaTravado() {
  const status = await getStatusCaixa();
  return status.travado;
}

function alertarCaixaFechado() {
  openModal('🔴 Caixa Fechado', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4);text-align:center;padding:var(--sp-2)">
      <div style="font-size:2.5rem">🔒</div>
      <div style="font-weight:700;font-size:var(--t-lg)">Abra o caixa antes de vender</div>
      <div style="color:var(--c-text-3);font-size:var(--t-sm)">Nenhuma sessão de caixa está aberta hoje. Toda venda (cópia ou produto) precisa de um caixa aberto para ser registrada.</div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="closeModal(); navigate('caixa');">
        💰 Ir para o Caixa
      </button>
    </div>
  `);
}

// ── MODAL ─────────────────────────────────────────────────
// Guarda opcional chamada antes de fechar o modal (X, clique fora, ESC).
// Se retornar false, o fechamento é cancelado. Usado pra impedir que a
// tela de pagamento do carrinho seja fechada "sem querer" depois que o
// pedido já foi entregue, deixando a venda sem forma de pagamento.
let _modalOnBeforeClose = null;

function openModal(title, bodyHTML, size = '', onBeforeClose = null) {
  _modalOnBeforeClose = onBeforeClose;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  const inner = document.getElementById('global-modal-inner');
  inner.className = `modal ${size}`;
  document.getElementById('global-modal').classList.add('open');
}
function closeModal() {
  if (_modalOnBeforeClose) {
    const podeFechar = _modalOnBeforeClose();
    if (podeFechar === false) return; // guarda bloqueou o fechamento
  }
  _modalOnBeforeClose = null;
  document.getElementById('global-modal').classList.remove('open');
}
window.openModal = openModal;
window.closeModal = closeModal;

// ============================================================
// ── MÓDULO: DASHBOARD ─────────────────────────────────────
// ============================================================
// ── Total efetivamente realizado num período ──────────────
// Vendas em 'fiado' NÃO contam como receita enquanto não forem
// quitadas — contam no dia em que o cliente realmente pagar
// (quitado_em), não no dia da venda original.
async function getTotalRealizado(tabela, dataInicioISO) {
  const [{ data: normais }, { data: quitados }] = await Promise.all([
    sb.from(tabela).select('total').eq('status', 'concluido').neq('forma_pagamento', 'fiado').gte('created_at', dataInicioISO),
    sb.from(tabela).select('total').eq('forma_pagamento', 'fiado').eq('fiado_quitado', true).gte('quitado_em', dataInicioISO),
  ]);
  const total = (normais || []).reduce((a, b) => a + (b.total || 0), 0)
              + (quitados || []).reduce((a, b) => a + (b.total || 0), 0);
  const count = (normais || []).length + (quitados || []).length;
  return { total, count };
}

// ── Breakdown por forma de pagamento num período ──────────
// Mesma regra do getTotalRealizado: fiado pendente não entra; fiado
// quitado entra no dia da quitação, sob a forma de pagamento real
// usada pra quitar (forma_pagamento_quitacao).
async function getBreakdownPagamento(dataInicioISO) {
  const grupos = {};
  const soma = (fp, valor) => { grupos[fp] = (grupos[fp] || 0) + (valor || 0); };

  for (const tabela of ['pedidos_copia', 'vendas']) {
    const [{ data: normais }, { data: quitados }] = await Promise.all([
      sb.from(tabela).select('total,forma_pagamento').eq('status', 'concluido').neq('forma_pagamento', 'fiado').gte('created_at', dataInicioISO),
      sb.from(tabela).select('total,forma_pagamento_quitacao').eq('forma_pagamento', 'fiado').eq('fiado_quitado', true).gte('quitado_em', dataInicioISO),
    ]);
    (normais || []).forEach(r => soma(r.forma_pagamento || 'dinheiro', r.total));
    (quitados || []).forEach(r => soma(r.forma_pagamento_quitacao || 'dinheiro', r.total));
  }
  return grupos;
}

async function renderDashboard(el) {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.setHours(0,0,0,0)).toISOString();
  const fimHoje = new Date(hoje.setHours(23,59,59,999)).toISOString();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

  const [
    { total: totalCopiasHoje, count: qtdCopiasHoje },
    { total: totalCopiasMes, count: qtdCopiasMes },
    { total: totalVendasHoje },
    { data: contasVencer },
    { data: estoqueCritico },
  ] = await Promise.all([
    getTotalRealizado('pedidos_copia', inicioHoje),
    getTotalRealizado('pedidos_copia', inicioMes),
    getTotalRealizado('vendas', inicioHoje),
    sb.from('contas').select('id').eq('status','pendente').lte('vencimento', new Date(Date.now()+7*86400000).toISOString().split('T')[0]),
    sb.from('vw_estoque_critico').select('id'),
  ]);

  // Últimos pedidos de cópia
  const { data: ultimosPedidos } = await sb.from('pedidos_copia')
    .select('*, impressoras(nome)')
    .order('created_at', { ascending: false })
    .limit(8);

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card stat-card--primary">
        <div class="stat-card-header">
          <span class="stat-card-label">Cópias Hoje</span>
          <span class="stat-card-icon">🖨️</span>
        </div>
        <div class="stat-card-value">${formatMoney(totalCopiasHoje)}</div>
        <div class="stat-card-sub">${qtdCopiasHoje} pedidos realizados</div>
      </div>
      <div class="stat-card stat-card--success">
        <div class="stat-card-header">
          <span class="stat-card-label">Vendas Hoje</span>
          <span class="stat-card-icon">🛍️</span>
        </div>
        <div class="stat-card-value">${formatMoney(totalVendasHoje)}</div>
        <div class="stat-card-sub">Produtos da loja</div>
      </div>
      <div class="stat-card stat-card--accent">
        <div class="stat-card-header">
          <span class="stat-card-label">Cópias no Mês</span>
          <span class="stat-card-icon">📅</span>
        </div>
        <div class="stat-card-value">${formatMoney(totalCopiasMes)}</div>
        <div class="stat-card-sub">${qtdCopiasMes} pedidos este mês</div>
      </div>
      <div class="stat-card stat-card--danger">
        <div class="stat-card-header">
          <span class="stat-card-label">Alertas</span>
          <span class="stat-card-icon">⚠️</span>
        </div>
        <div class="stat-card-value">${(contasVencer||[]).length + (estoqueCritico||[]).length}</div>
        <div class="stat-card-sub">${(contasVencer||[]).length} contas · ${(estoqueCritico||[]).length} estoque crítico</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 280px;gap:var(--sp-4)">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Últimos Pedidos de Cópia</span>
          <button class="btn btn--ghost btn--sm" onclick="navigate('copias')">Ver PDV →</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Tipo</th><th>Qtd</th><th>Impressora</th><th>Total</th><th>Status</th><th>Hora</th>
              </tr>
            </thead>
            <tbody>
              ${(ultimosPedidos||[]).length === 0
                ? `<tr><td colspan="7"><div class="empty-state" style="padding:var(--sp-6)"><div class="empty-state-icon">📄</div><div class="empty-state-sub">Nenhum pedido ainda hoje</div></div></td></tr>`
                : (ultimosPedidos||[]).map(p => `
                  <tr>
                    <td class="td-mono">#${p.numero_pedido}</td>
                    <td>${labelTipoCopia(p.tipo)}</td>
                    <td>${p.quantidade}</td>
                    <td>${p.impressoras?.nome || '—'}</td>
                    <td style="color:var(--c-accent);font-weight:600">${formatMoney(p.total)}</td>
                    <td>${badgeStatus(p.status)}</td>
                    <td class="td-mono">${formatDateTime(p.created_at)}</td>
                  </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <div class="card">
          <div class="card-header"><span class="card-title">Impressoras</span></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:var(--sp-3)">
            ${State.impressoras.map(imp => `
              <div style="display:flex;align-items:center;gap:var(--sp-3)">
                <div class="printer-status-dot ${imp.status}"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:var(--t-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${imp.nome}</div>
                  <div style="font-size:var(--t-xs);color:var(--c-text-3)">${imp.modelo||''}</div>
                </div>
                <span class="badge badge--${imp.status === 'online' ? 'success' : imp.status === 'offline' ? 'danger' : 'warning'}">${imp.status}</span>
              </div>
            `).join('') || '<div class="empty-state" style="padding:var(--sp-4)"><div class="empty-state-sub">Nenhuma impressora cadastrada</div></div>'}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Ações Rápidas</span></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:var(--sp-2)">
            <button class="btn btn--primary" style="width:100%;justify-content:center" onclick="navigate('copias')">🖨️ Registrar Cópias</button>
            <button class="btn btn--ghost" style="width:100%;justify-content:center" onclick="navigate('copias')">🛍️ Nova Venda</button>
            <button class="btn btn--ghost" style="width:100%;justify-content:center" onclick="navigate('caixa')">💰 Ver Caixa</button>
            <button class="btn btn--ghost" style="width:100%;justify-content:center" onclick="navigate('contas')">📋 Contas a Pagar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// ============================================================
// ── MÓDULO: PDV UNIFICADO (Cópias + Produtos) ─────────────
// ============================================================
// Um único carrinho mistura itens de impressão ('copia') e
// itens de produto ('produto'). Regra de finalização:
//   • Carrinho só com cópias  → envia para a Fila de Produção
//     (pedidos_copia, status 'na_fila'), igual ao fluxo anterior.
//   • Carrinho com produto(s) → registra a venda de produtos
//     imediatamente (vendas/venda_itens, status 'concluido',
//     baixa de estoque) e, se também houver cópias, essas
//     cópias são enviadas para a fila normalmente. Ou seja: o
//     carrinho "finaliza" tudo em uma única ação, mas cada
//     parte segue para onde já era controlada financeiramente
//     — assim não há risco de contar a mesma venda duas vezes
//     nos relatórios de caixa.
const PdvState = {
  // aba ativa no painel esquerdo
  aba: 'copia', // 'copia' | 'produto'
  // seleção de impressão (equivalente ao antigo passo 1→ removido)
  impressoraSelecionada: null,
  tipoCopia: null,
  quantidade: 1,
  frenteVerso: false,
  folhaSelecionada: null,
  paginasPorDocumento: 1,
  // passo do "mini-stepper" de impressão: 1 = tipo, 2 = quantidade
  // (o antigo passo 1 — escolher impressora — foi removido; a
  // impressora é escolhida por um seletor compacto sempre visível)
  step: 1,
  // carrinho único
  carrinho: [],
  pagamento: null, // nenhuma forma pré-selecionada — usuário precisa escolher
  desconto: 0,
  clienteId: null,
};

async function renderCopias(el) {
    // Restaura estado salvo, se existir
  const estadoSalvo = carregarEstadoPdv();
  if (estadoSalvo) {
    Object.assign(PdvState, estadoSalvo);
  } else {
    // Valores padrão (caso não haja estado salvo)
    PdvState.step = 1;
    PdvState.carrinho = [];
    PdvState.desconto = 0;
    PdvState.pagamento = null; // nenhuma forma pré-selecionada — usuário precisa escolher
    PdvState.impressoraSelecionada = null;
    PdvState.tipoCopia = null;
    PdvState.quantidade = 1;
    PdvState.frenteVerso = false;
    PdvState.paginasPorDocumento = 1;
    PdvState.aba = 'copia';
  }

  await loadImpressoras();
  await loadPrecosCopia();
  await carregarProdutosPdv();
  await loadFolhasDisponiveis();

  if (!PdvState.impressoraSelecionada) {
    const online = State.impressoras.find(i => i.status === 'online') || State.impressoras[0];
    PdvState.impressoraSelecionada = online?.id || null;
  }

  PdvState.step = 1;
  if (!PdvState.impressoraSelecionada) {
    const online = State.impressoras.find(i => i.status === 'online') || State.impressoras[0];
    PdvState.impressoraSelecionada = online?.id || null;
  }

  const statusCaixa = await getStatusCaixa();

  el.innerHTML = `
  <div class="pdv-layout">
    <!-- ESQUERDA -->
    <div class="pdv-left">
      ${!statusCaixa.aberto ? `
        <div style="background:var(--c-danger-s,rgba(239,68,68,.12));border:1.5px solid var(--c-danger);border-radius:var(--r-md);padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-3);display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);flex-wrap:wrap">
          <span style="color:var(--c-danger);font-weight:600">🔒 Caixa fechado — abra o caixa antes de vender.</span>
          <button class="btn btn--danger btn--sm" onclick="navigate('caixa')">Ir para o Caixa</button>
        </div>
      ` : statusCaixa.travado ? `
        <div style="background:var(--c-warning-s,rgba(245,158,11,.12));border:1.5px solid var(--c-warning);border-radius:var(--r-md);padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-3)">
          <span style="color:var(--c-warning);font-weight:600">🔒 Caixa travado — peça a um administrador para liberar.</span>
        </div>
      ` : ''}
      <div class="chip-row" style="margin-bottom:var(--sp-3)">
        <span class="chip ${PdvState.aba==='copia'?'active':''}" onclick="pdvMudarAba('copia',this)">🖨️ Impressões</span>
        <span class="chip ${PdvState.aba==='produto'?'active':''}" onclick="pdvMudarAba('produto',this)">📦 Produtos</span>
      </div>
      <div id="pdv-aba-content"></div>
    </div>

    <!-- DIREITA: Carrinho único -->
    <div class="pdv-right">
      <div class="pdv-panel-header">
        <div style="font-size:var(--t-md);font-weight:700">🧾 Carrinho</div>
        <div style="font-size:var(--t-xs);color:var(--c-text-3)" id="carrinho-count">0 itens</div>
      </div>
      <div class="pdv-panel-items" id="pdv-items">
        <div class="empty-state">
          <div class="empty-state-icon">🧾</div>
          <div class="empty-state-sub">Carrinho vazio</div>
        </div>
      </div>
      <div class="pdv-panel-footer">
        <div class="field" style="margin-bottom:var(--sp-2)">
          <label>Desconto (₲)</label>
          <input type="number" class="input" id="input-desconto" min="0" step="100" value="${PdvState.desconto || ''}"
                 placeholder="0" oninput="aplicarDesconto(this.value)" />
        </div>
        <div class="pdv-total-row" style="font-size:var(--t-sm);color:var(--c-text-3)">
          <span>Subtotal</span>
          <span id="pdv-subtotal-value">${formatMoney(0)}</span>
        </div>
        <div class="pdv-total-row">
          <span class="pdv-total-label">Total</span>
          <span class="pdv-total-value" id="pdv-total-value">${formatMoney(0)}</span>
        </div>
        <div id="pdv-total-brl" style="display:none; text-align:right; font-size:var(--t-xs); color:var(--c-text-3); margin-top:-4px; margin-bottom:4px">
          🇧🇷 ≈ <span id="pdv-total-brl-value">R$ 0,00</span>
        </div>
        <div class="field">
          <label>Forma de Pagamento</label>
          <div class="payment-methods" id="payment-methods">
            ${['dinheiro','pix','pix_brl','cartao_debito','cartao_credito','transferencia','fiado'].map(p => `
              <button class="payment-btn ${PdvState.pagamento===p?'selected':''}"
                      onclick="selecionarPagamento('${p}')" data-pag="${p}">
                ${labelPagamento(p)}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="field" style="margin-bottom:var(--sp-2)">
          <label>Cliente / Identificação</label>
          <input type="text" class="input" id="input-cliente-nome-pdv"
                 placeholder="Nome para identificar o pedido (opcional)" />
        </div>
        <div id="troco-row" style="display:none">...</div>
        <div id="pix-brl-row" style="display:none">...</div>
        <button class="btn btn--success btn--lg" style="width:100%;justify-content:center" id="btn-finalizar-venda" onclick="finalizarVenda()" ${(!PdvState.carrinho.some(i=>i.tipo_item==='copia') && !PdvState.pagamento) ? 'disabled' : ''}>
          <span id="btn-finalizar-label">📋 Enviar para Fila</span> — <span id="btn-total">${formatMoney(0)}</span>
        </button>
        <div id="pdv-pagamento-aviso" style="display:${(!PdvState.carrinho.some(i=>i.tipo_item==='copia') && !PdvState.pagamento) ? 'block' : 'none'};font-size:var(--t-xs);color:var(--c-warning);text-align:center;margin-top:-4px">
          ⚠ Selecione a forma de pagamento para continuar
        </div>
        <button class="btn btn--ghost btn--sm" style="width:100%;justify-content:center" onclick="limparCarrinho()">
          🗑️ Limpar carrinho
        </button>
      </div>
    </div>
  </div>
`;

  renderAbaPdv();
  atualizarCarrinhoUI();
}

// ── Alternância de abas ───────────────────────────────────
window.pdvMudarAba = function(aba, el) {
  PdvState.aba = aba;
  document.querySelectorAll('.pdv-left .chip').forEach(c => c.classList.remove('active'));
  el?.classList.add('active');
  renderAbaPdv();
  salvarEstadoPdv()
};

function renderAbaPdv() {
  const container = document.getElementById('pdv-aba-content');
  if (!container) return;
  container.innerHTML = PdvState.aba === 'copia' ? renderAbaCopia() : renderAbaProduto();
  if (PdvState.aba === 'copia') {
    renderPassoCopia(PdvState.step);
  } else {
    // Garante foco no leitor de código de barras assim que a aba abre
    setTimeout(() => document.getElementById('input-barcode-scan')?.focus(), 50);
  }
}

// ── ABA: IMPRESSÕES (2 passos — impressora já vem pré-selecionada) ──
function renderAbaCopia() {
  const impressoras = State.impressoras || [];
  return `
    <div class="field" style="margin-bottom:var(--sp-3)">
      <label>Impressora</label>
      <select class="input" id="select-impressora-pdv" onchange="selecionarImpressora(this.value)">
        ${impressoras.map(imp => `
          <option value="${imp.id}" ${PdvState.impressoraSelecionada===imp.id?'selected':''} ${imp.status!=='online'?'disabled':''}>
            ${imp.status==='online'?'🟢':'🔴'} ${imp.nome}${imp.status!=='online'?' (offline)':''}
          </option>
        `).join('') || '<option value="">Cadastre uma impressora</option>'}
      </select>
    </div>
    <div class="stepper-header">
      <div class="step-indicators">
        <span class="step-dot ${PdvState.step === 1 ? 'active' : ''}" data-step="1">1</span>
        <span class="step-line"></span>
        <span class="step-dot ${PdvState.step === 2 ? 'active' : ''}" data-step="2">2</span>
      </div>
      <div class="step-label">${getStepLabel(PdvState.step)}</div>
    </div>
    <div id="step-content"></div>
    <div class="step-nav">
      <button class="btn btn--ghost" id="step-back" style="${PdvState.step === 1 ? 'display:none' : ''}">← Voltar</button>
      <button class="btn btn--primary" id="step-next">
        ${PdvState.step === 2 ? '➕ Adicionar ao Carrinho' : 'Avançar →'}
      </button>
    </div>
  `;
}

function renderPassoCopia(step) {
  const container = document.getElementById('step-content');
  if (!container) return;
  container.innerHTML = step === 1 ? renderStepTipoCopia() : renderStepQuantidade();
  atualizarPreviewPdv();

  document.getElementById('step-back')?.addEventListener('click', () => {
    if (PdvState.step > 1) { PdvState.step--; renderAbaCopia_refresh(); }
  });
  document.getElementById('step-next')?.addEventListener('click', () => {
    if (PdvState.step === 1 && !PdvState.tipoCopia) { toast('Selecione o tipo de cópia', 'warning'); return; }
    if (PdvState.step === 2) { adicionarAoCarrinho(); return; }
    if (PdvState.step < 2) { PdvState.step++; renderAbaCopia_refresh(); }
  });
}

// Reconstrói apenas a parte da aba impressão (evita re-renderizar o carrinho)
function renderAbaCopia_refresh() {
  const container = document.getElementById('pdv-aba-content');
  if (!container) return;
  container.innerHTML = renderAbaCopia();
  renderPassoCopia(PdvState.step);
}

function getStepLabel(step) {
  const labels = { 1: 'Tipo de Cópia', 2: 'Quantidade e Opções' };
  return labels[step] || '';
}

window.selecionarImpressora = function(id) {
  PdvState.impressoraSelecionada = id;
  salvarEstadoPdv()
};

window.selecionarTipoCopia = function(tipo) {
  PdvState.tipoCopia = tipo;
  document.querySelectorAll('.tipo-copia-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.tipo === tipo);
  });
  if (PdvState.step === 1) { PdvState.step = 2; renderAbaCopia_refresh(); }
  else atualizarPreviewPdv();
  salvarEstadoPdv()
};

window.ajustarQtd = function(delta) {
  PdvState.quantidade = Math.max(1, (PdvState.quantidade||1) + delta);
  const input = document.getElementById('input-qtd');
  if (input) input.value = PdvState.quantidade;
  atualizarPreviewPdv();
  salvarEstadoPdv()
};

function getPrecoCopiaAtual() {
  if (!PdvState.tipoCopia) return { base: 0, cartao: null };
  const preco = State.precosCopia.find(p => p.tipo === PdvState.tipoCopia);
  if (!preco) return { base: 0, cartao: null };
  let base = preco.preco_unitario;
  if (preco.preco_desconto && PdvState.quantidade >= preco.qtd_desconto) base = preco.preco_desconto;
  return { base, cartao: preco.preco_cartao || null };
}

// Retorna o preço unitário efetivo considerando a forma de pagamento.
// Cartão de crédito/débito usa preco_cartao (valor fixo cadastrado)
// quando ele existir; caso contrário cai no preço normal.
function precoComPagamento(base, precoCartao, pagamento) {
  const ehDiferenciado = ['cartao_debito', 'cartao_credito', 'pix'].includes(pagamento);
  const valorBase = parseFloat(base) || 0;
  if (ehDiferenciado && precoCartao != null && precoCartao > 0) return precoCartao;
  return valorBase;
}

// Quando o pagamento é Pix (R$ — brasileiros no Paraguai), grava também o
// valor em reais e a cotação usada no momento da venda, pra exibir depois
// no histórico sem depender da cotação ATUAL (que muda com o tempo).
// QR (₲) não usa isso — é um método de pagamento paraguaio, sem conversão.
function camposBRL(pagamento, totalGs) {
  if (pagamento !== 'pix_brl') return {};
  const cotacao = State.empresa?.cotacao_brl ?? State.empresa?.config?.cotacao_brl;
  if (!cotacao) return {};
  return {
    valor_brl: Math.round((totalGs / cotacao) * 100) / 100,
    cotacao_brl: cotacao,
  };
}

function atualizarPreviewPdv() {
  const preview = document.getElementById('preview-pdv');
  if (!preview) return;
  if (!PdvState.tipoCopia) { preview.innerHTML=''; return; }

  const { base, cartao } = getPrecoCopiaAtual();
  const precoUnit = precoComPagamento(base, cartao, PdvState.pagamento);
  const total = precoUnit * PdvState.quantidade;
  const preco = State.precosCopia.find(p => p.tipo === PdvState.tipoCopia);
  const paginasPorDoc = PdvState.paginasPorDocumento || 1;
  const totalPaginas = PdvState.quantidade * paginasPorDoc;
  const folhas = Math.ceil(totalPaginas / (PdvState.frenteVerso ? 2 : 1));

  const totalPagEl = document.getElementById('total-paginas-preview');
  const folhasEl = document.getElementById('folhas-preview');
  if (totalPagEl) totalPagEl.value = totalPaginas;
  if (folhasEl) folhasEl.value = folhas;

  preview.innerHTML = `
    <div style="background:var(--c-bg);border:1.5px solid var(--c-primary);border-radius:var(--r-md);padding:var(--sp-4);display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:var(--t-sm);color:var(--c-text-2)">${preco?.descricao||''}</div>
        <div style="font-size:var(--t-xs);color:var(--c-text-3)">${PdvState.quantidade} × ${formatMoney(precoUnit)}${cartao ? ' <span style="opacity:.7">(preço cartão aplicado se pagar no cartão)</span>' : ''}</div>
        <div style="font-size:var(--t-xs);color:var(--c-text-3)">📄 ${totalPaginas} páginas · ${folhas} folhas</div>
        ${PdvState.frenteVerso ? '<div style="font-size:10px;color:var(--c-accent)">✓ Frente e Verso</div>' : ''}
      </div>
      <div style="font-size:var(--t-2xl);font-weight:800;color:var(--c-success)">${formatMoney(total)}</div>
    </div>
  `;
}

window.adicionarAoCarrinho = function() {
  if (!PdvState.impressoraSelecionada) { toast('Selecione uma impressora', 'warning'); return; }
  if (!PdvState.tipoCopia) { toast('Selecione o tipo de cópia', 'warning'); return; }
  if (!PdvState.quantidade || PdvState.quantidade < 1) { toast('Informe a quantidade', 'warning'); return; }

  const preco = State.precosCopia.find(p => p.tipo === PdvState.tipoCopia);
  const impressora = State.impressoras.find(i => i.id === PdvState.impressoraSelecionada);
  const { base, cartao } = getPrecoCopiaAtual();
  const paginasPorDoc = PdvState.paginasPorDocumento || 1;
  const totalPaginas = PdvState.quantidade * paginasPorDoc;
  const folhas = Math.ceil(totalPaginas / (PdvState.frenteVerso ? 2 : 1));
  const folhaSelect = document.getElementById('select-folha');
  const folhaId = folhaSelect?.value;
  const folhaNome = folhaSelect?.options[folhaSelect.selectedIndex]?.dataset?.nome || null;

  if (!folhaId) {
    toast('Selecione o tipo de folha', 'warning');
    return;
  }

  PdvState.carrinho.push({
    id: uuid(),
    tipo_item: 'copia',
    impressora_id: PdvState.impressoraSelecionada,
    impressora_nome: impressora?.nome || '—',
    tipo: PdvState.tipoCopia,
    tipo_label: preco?.descricao || PdvState.tipoCopia,
    quantidade: PdvState.quantidade,
    frente_verso: PdvState.frenteVerso,
    preco_base: base,
    preco_cartao: cartao,
    paginas_por_documento: paginasPorDoc,
    total_folhas: folhas,
    folha_id: folhaId,
    folha_nome: folhaNome,
  });

  atualizarCarrinhoUI();
  toast(`${PdvState.quantidade} cópias adicionadas`, 'success');

  // Reinicia o mini-stepper para o próximo item
  PdvState.step = 1;
  PdvState.tipoCopia = null;
  PdvState.quantidade = 1;
  PdvState.folhaSelecionada = null;
  renderAbaCopia_refresh();
  salvarEstadoPdv()
};

// ── ABA: PRODUTOS (busca + leitor de código de barras) ────
async function carregarProdutosPdv() {
  const { data } = await sb.from('produtos')
    .select('*')
    .eq('ativo', true)
    .in('tipo', ['produto', 'ambos'])
    .order('nome');
  State.produtosPdv = data || [];
}

function renderAbaProduto() {
  const produtos = State.produtosPdv || [];
  return `
    <div class="card" style="margin-bottom:var(--sp-3)">
      <div class="card-body" style="display:flex;flex-direction:column;gap:var(--sp-3)">
        <div class="field" style="margin-bottom:0">
          <label>📷 Leitor de código de barras</label>
          <input type="text" class="input" id="input-barcode-scan" autocomplete="off"
                 placeholder="Escaneie o código de barras e pressione Enter..."
                 onkeydown="if(event.key==='Enter'){event.preventDefault(); pdvLerCodigoBarras(this.value); this.value='';}" />
        </div>
        <div class="search-bar">
          <span class="search-bar-icon">🔍</span>
          <input type="text" class="input" placeholder="Buscar produto pelo nome..." id="busca-produto-venda" oninput="filtrarProdutosVenda(this.value)" />
        </div>
      </div>
    </div>
    <div class="printer-grid" id="lista-produtos-venda" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));">
      ${produtos.map(p => `
        <div class="tipo-copia-btn" data-id="${p.id}" data-nome="${p.nome}" onclick="pdvAdicionarProduto('${p.id}')">
          <div style="font-size:1.5rem;margin-bottom:var(--sp-2)">📦</div>
          <div style="font-weight:600;font-size:var(--t-sm)">${p.nome} ${p.usado_na_impressao ? '<span class="badge badge--accent" style="font-size:8px;padding:1px 6px">📄</span>' : ''}</div>
          <div style="font-size:var(--t-xs);color:var(--c-text-3)">${p.categoria}</div>
          <div style="font-size:var(--t-sm);font-weight:700;color:var(--c-accent);margin-top:var(--sp-2)">${formatMoney(p.preco_venda||0)}</div>
          ${p.preco_cartao ? `<div style="font-size:10px;color:var(--c-text-3)">💳 ${formatMoney(p.preco_cartao)}</div>` : ''}
          <div style="font-size:10px;color:var(--c-text-3)">Estoque: ${p.estoque_atual} ${p.unidade}</div>
        </div>
      `).join('') || '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-sub">Nenhum produto cadastrado</div></div>'}
    </div>
  `;
}

window.filtrarProdutosVenda = function(q) {
  document.querySelectorAll('#lista-produtos-venda .tipo-copia-btn').forEach(el => {
    const nome = el.dataset.nome?.toLowerCase() || '';
    el.style.display = nome.includes(q.toLowerCase()) ? '' : 'none';
  });
};

// Lê um código de barras escaneado e adiciona o produto correspondente
window.pdvLerCodigoBarras = async function(codigo) {
  const valor = (codigo || '').trim();
  if (!valor) return;

  // Primeiro tenta na lista já carregada (mais rápido)
  let produto = (State.produtosPdv || []).find(p => p.codigo_barras === valor);

  // Se não achou (produto pode estar fora do cache), busca no banco
  if (!produto) {
    const { data } = await sb.from('produtos').select('*').eq('codigo_barras', valor).eq('ativo', true).in('tipo', ['produto', 'ambos']).maybeSingle();
    produto = data || null;
  }

  if (!produto) {
    toast(`Nenhum produto encontrado para o código "${valor}"`, 'warning');
    document.getElementById('input-barcode-scan')?.focus();
    return;
  }

  pdvAdicionarProduto(produto.id, produto);
  document.getElementById('input-barcode-scan')?.focus();
};

window.pdvAdicionarProduto = function(id, produtoPreCarregado) {
  const produto = produtoPreCarregado || (State.produtosPdv || []).find(p => p.id === id);
  if (!produto) { toast('Produto não encontrado', 'error'); return; }

  const existing = PdvState.carrinho.find(i => i.tipo_item === 'produto' && i.produto_id === id);
  if (existing) {
    existing.quantidade++;
  } else {
    PdvState.carrinho.push({
      id: uuid(),
      tipo_item: 'produto',
      produto_id: produto.id,
      nome: produto.nome,
      quantidade: 1,
      preco_base: produto.preco_venda || 0,
      preco_cartao: produto.preco_cartao || null,
    });
  }
  atualizarCarrinhoUI();
  toast(`${produto.nome} adicionado`, 'success');
};

// ── Preço/total efetivo de um item do carrinho, dado o pagamento atual ──
function itemPrecoUnitario(item) {
  return precoComPagamento(item.preco_base, item.preco_cartao, PdvState.pagamento);
}
function itemTotal(item) {
  return itemPrecoUnitario(item) * item.quantidade;
}

// ── CARRINHO ÚNICO ─────────────────────────────────────────
function atualizarCarrinhoUI() {
  const itemsEl = document.getElementById('pdv-items');
  const countEl = document.getElementById('carrinho-count');
  const subtotalEl = document.getElementById('pdv-subtotal-value');
  const totalEl = document.getElementById('pdv-total-value');
  const btnTotalEl = document.getElementById('btn-total');
  const btnLabelEl = document.getElementById('btn-finalizar-label');
  if (!itemsEl) return;

  const subtotal = Math.round(PdvState.carrinho.reduce((a,b) => a + itemTotal(b), 0));
  const desconto = Math.min(PdvState.desconto || 0, subtotal);
  const total = Math.max(0, subtotal - desconto);

  if (countEl) countEl.textContent = `${PdvState.carrinho.length} ite${PdvState.carrinho.length===1?'m':'ns'}`;
  if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
  if (totalEl) totalEl.textContent = formatMoney(total);
  if (btnTotalEl) btnTotalEl.textContent = formatMoney(total);

  const temCopia = PdvState.carrinho.some(i => i.tipo_item === 'copia');
  if (btnLabelEl) btnLabelEl.textContent = temCopia ? '📋 Enviar para Fila' : '✅ Finalizar Venda';

  // A forma de pagamento só é obrigatória aqui quando a venda é finalizada
  // na hora (carrinho só com produtos). Quando há impressão, o pedido vai
  // para a fila e a forma de pagamento real só é escolhida na retirada
  // (depois da conferência) — exigir aqui não faz sentido.
  const btnFinalizarEl = document.getElementById('btn-finalizar-venda');
  const avisoPagEl = document.getElementById('pdv-pagamento-aviso');
  const faltaPagamento = !temCopia && !PdvState.pagamento;
  if (btnFinalizarEl) btnFinalizarEl.disabled = faltaPagamento || PdvState.carrinho.length === 0;
  if (avisoPagEl) avisoPagEl.style.display = (faltaPagamento && PdvState.carrinho.length > 0) ? 'block' : 'none';

  const brlEl = document.getElementById('pdv-total-brl');
  const brlValEl = document.getElementById('pdv-total-brl-value');
  if (brlEl && brlValEl) {
    const isPix = PdvState.pagamento === 'pix' || PdvState.pagamento === 'pix_brl';
    brlEl.style.display = isPix ? 'block' : 'none';
    if (isPix) brlValEl.textContent = formatBRL(gsToBRL(total));
  }

  if (PdvState.carrinho.length === 0) {
    itemsEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🧾</div><div class="empty-state-sub">Carrinho vazio</div></div>`;
    return;
  }

  itemsEl.innerHTML = PdvState.carrinho.map(item => {
    const precoUnit = itemPrecoUnitario(item);
    const tot = itemTotal(item);
    if (item.tipo_item === 'copia') {
      return `
        <div class="pdv-item">
          <div class="pdv-item-info">
            <div class="pdv-item-name">🖨️ ${item.tipo_label}</div>
            <div class="pdv-item-sub">${item.impressora_nome} · ${item.quantidade} cópias${item.frente_verso?' · F/V':''}</div>
            <div class="pdv-item-sub">📄 Folha: ${item.folha_nome || '—'}</div>
            <div class="pdv-item-sub">${formatMoney(precoUnit)}/un</div>
          </div>
          <div class="pdv-item-price">${formatMoney(tot)}</div>
          <button class="pdv-remove-btn" onclick="removerDoCarrinho('${item.id}')">✕</button>
        </div>`;
    }
    return `
      <div class="pdv-item">
        <div class="pdv-item-info">
          <div class="pdv-item-name">📦 ${item.nome}</div>
          <div class="pdv-item-sub">
            <button class="qty-btn" style="padding:2px 8px" onclick="alterarQtdCarrinho('${item.id}',-1)">−</button>
            ${item.quantidade} × ${formatMoney(precoUnit)}
            <button class="qty-btn" style="padding:2px 8px" onclick="alterarQtdCarrinho('${item.id}',1)">+</button>
          </div>
        </div>
        <div class="pdv-item-price">${formatMoney(tot)}</div>
        <button class="pdv-remove-btn" onclick="removerDoCarrinho('${item.id}')">✕</button>
      </div>`;
  }).join('');

  salvarEstadoPdv()
}

window.alterarQtdCarrinho = function(id, delta) {
  const item = PdvState.carrinho.find(i => i.id === id);
  if (!item) return;
  item.quantidade = Math.max(1, item.quantidade + delta);
  atualizarCarrinhoUI();
};

window.removerDoCarrinho = function(id) {
  PdvState.carrinho = PdvState.carrinho.filter(i => i.id !== id);
  atualizarCarrinhoUI();
  salvarEstadoPdv()
};

window.limparCarrinho = function() {
  PdvState.carrinho = [];
  PdvState.tipoCopia = null;
  PdvState.quantidade = 1;
  PdvState.desconto = 0;
  const descInput = document.getElementById('input-desconto');
  if (descInput) descInput.value = '';
  atualizarCarrinhoUI();
  salvarEstadoPdv()
};

window.aplicarDesconto = function(valor) {
  PdvState.desconto = Math.max(0, Math.round(parseFloat(valor) || 0));
  atualizarCarrinhoUI();
  salvarEstadoPdv()
};

window.selecionarPagamento = function(pag) {
  PdvState.pagamento = pag;
  document.querySelectorAll('.payment-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.pag === pag);
  });
  const trocoRow  = document.getElementById('troco-row');
  const pixBrlRow = document.getElementById('pix-brl-row');
  const cotEl     = document.getElementById('cotacao-atual-pdv');
  if (trocoRow)  trocoRow.style.display  = pag === 'dinheiro' ? 'block' : 'none';
  if (pixBrlRow) pixBrlRow.style.display = pag === 'pix_brl'  ? 'block' : 'none';
  if (cotEl)     cotEl.textContent = APP_CONFIG.cotacaoBRL.toLocaleString('es-PY');
  // Recalcula preços do carrinho e da prévia de impressão (preço cartão!)
  // (atualizarCarrinhoUI() logo abaixo também libera o botão de finalizar)
  atualizarCarrinhoUI();
  atualizarPreviewPdv();
  salvarEstadoPdv()
};

window.calcularPixBRL = function() {
  const brl = parseFloat(document.getElementById('input-brl-pix')?.value || 0);
  const gs  = brlToGs(brl);
  const el  = document.getElementById('pix-gs-equiv');
  if (el) el.textContent = formatMoney(gs);
};

window.calcularTroco = function() {
  const subtotal = PdvState.carrinho.reduce((a,b) => a + itemTotal(b), 0);
  const total    = Math.max(0, subtotal - (PdvState.desconto || 0));
  const recebido = Math.round(parseFloat(document.getElementById('input-valor-recebido')?.value || 0));
  const troco    = Math.max(0, recebido - total);
  const el = document.getElementById('troco-value');
  if (el) el.textContent = formatMoney(troco);
};

// ── FINALIZAÇÃO ────────────────────────────────────────────
// Regra:
//  • Carrinho só com produto(s)  → finaliza AGORA (venda concluída,
//    forma de pagamento já escolhida no painel do PDV).
//  • Carrinho com cópia (com ou sem produto) → cria um "carrinho
//    pendente", manda as cópias pra fila com preço/pagamento
//    PROVISÓRIOS (a forma de pagamento real só é escolhida na
//    retirada, depois da conferência — ver finalizarCarrinhoPendente).
// ── FINALIZAÇÃO (CORRIGIDA) ──────────────────────────────
// ── FINALIZAÇÃO (CORRIGIDA) ──────────────────────────────
window.finalizarVenda = async function() {
  // 1. Verificações iniciais
  const statusCaixa = await getStatusCaixa();
  if (!statusCaixa.aberto) {
    alertarCaixaFechado();
    return;
  }
  if (statusCaixa.travado) {
    toast('⚠️ Caixa travado! Libere com senha de administrador para realizar vendas.', 'error');
    return;
  }
  if (PdvState.carrinho.length === 0) {
    toast('Carrinho vazio', 'warning');
    return;
  }
  const temCopiaCheck = PdvState.carrinho.some(i => i.tipo_item === 'copia');
  if (!temCopiaCheck && !PdvState.pagamento) {
    toast('Selecione a forma de pagamento antes de finalizar.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-finalizar-venda');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processando...';
  }

  // 2. Obtém o nome do cliente (se houver)
  const clienteNomePDV = document.getElementById('input-cliente-nome-pdv')?.value?.trim() || null;

  // 3. Separa itens do carrinho
  const itensCopia   = PdvState.carrinho.filter(i => i.tipo_item === 'copia');
  const itensProduto = PdvState.carrinho.filter(i => i.tipo_item === 'produto');

  try {
    // ── CASO 1: Apenas produtos ──────────────────────────
    if (itensCopia.length === 0) {
      const pagamentoDb = PdvState.pagamento;
      const subtotal = itensProduto.reduce((a, b) => a + itemTotal(b), 0);
      const desconto = Math.min(PdvState.desconto || 0, subtotal);

      const vendaId = await processarVendaProdutos(itensProduto, subtotal, desconto, pagamentoDb, clienteNomePDV);
      if (vendaId === null) {
        // erro já foi mostrado em processarVendaProdutos
        if (btn) btn.disabled = false;
        return;
      }

      toast('✅ Venda registrada!', 'success', 3500);
      limparCarrinho();
      limparEstadoPdv();
      renderAbaCopia_refresh();
      if (btn) btn.disabled = false;
      return;
    }

    // ── CASO 2: Há cópias (com ou sem produtos) ──────────
    // 4. Cria o carrinho pendente (uma única vez)
    const { data: carrinho, error: errCarrinho } = await sb
      .from('carrinhos_pendentes')
      .insert({
        itens: PdvState.carrinho,          // todos os itens (cópias + produtos)
        cliente_nome: clienteNomePDV,
        desconto: PdvState.desconto || 0,
        observacoes: '',
      })
      .select()
      .single();

    if (errCarrinho || !carrinho) {
      console.error('❌ Erro ao criar carrinho pendente:', errCarrinho);
      throw new Error('Erro ao criar carrinho pendente: ' + (errCarrinho?.message || 'desconhecido'));
    }
    console.log('✅ Carrinho pendente criado com ID:', carrinho.id);

    // 5. Insere cada pedido de cópia com referência ao carrinho
    for (const item of itensCopia) {
      const { error } = await sb.from('pedidos_copia').insert({
        impressora_id:   item.impressora_id,
        tipo:            item.tipo,
        quantidade:      item.quantidade,
        frente_verso:    item.frente_verso,
        preco_unitario:  Math.round(item.preco_base),
        preco_base:      item.preco_base,
        preco_cartao:    item.preco_cartao,
        desconto:        0,  // provisório – será recalculado na retirada
        total:           Math.round(item.preco_base * item.quantidade),
        status:          'na_fila',
        forma_pagamento: null,
        cliente_nome_pdv: clienteNomePDV,
        paginas_por_documento: item.paginas_por_documento || 1,
        total_folhas:    item.total_folhas,
        carrinho_id:     carrinho.id,
        insumo_folha_id: item.folha_id || null,
        insumo_folha_nome: item.folha_nome || null,
      });
      if (error) {
        console.error('❌ Erro ao inserir pedido de cópia:', error);
        throw error;
      }
    }

    // 6. Mensagem de sucesso
    const msgProduto = itensProduto.length > 0
      ? ` + ${itensProduto.length} produto(s) aguardando retirada`
      : '';
    toast(`✅ ${itensCopia.length} impressão(ões) enviada(s) para a fila${msgProduto}!`, 'success', 4500);

    // 7. Limpa estado do PDV
    limparCarrinho();
    limparEstadoPdv();
    renderAbaCopia_refresh();

  } catch (err) {
    console.error('❌ Erro em finalizarVenda:', err);
    toast('Erro ao finalizar: ' + err.message, 'error');
  } finally {
    // 8. Reabilita o botão sempre
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📋 Enviar para Fila';
    }
  }
};

// Busca o carrinho pendente associado a um pedido de cópia
async function obterCarrinhoPendentePorPedido(pedidoId) {
  const { data: pedido } = await sb
    .from('pedidos_copia')
    .select('carrinho_id')
    .eq('id', pedidoId)
    .single();

  if (!pedido?.carrinho_id) return null;

  const { data: carrinho } = await sb
    .from('carrinhos_pendentes')
    .select('*')
    .eq('id', pedido.carrinho_id)
    .single();

  return carrinho;
}

// Distribui um valor total entre N pesos, arredondando e ajustando o
// último item para que a soma bata exatamente (evita erro de centavos).
function distribuirValor(total, pesos) {
  const somaPesos = pesos.reduce((a,b) => a+b, 0);
  if (total <= 0 || somaPesos <= 0) return pesos.map(() => 0);
  const partes = pesos.map(p => Math.round(total * (p / somaPesos)));
  const diff = total - partes.reduce((a,b) => a+b, 0);
  partes[partes.length - 1] += diff;
  return partes;
}

// Processa a parte de produtos do carrinho: consome insumos vinculados
// (composição do produto — combos/kits), registra a venda e baixa o
// estoque do produto final. Retorna o id da venda criada, ou null em erro.
async function processarVendaProdutos(itensProduto, subtotal, desconto, pagamento, clienteNomePDV, carrinhoId = null) {
  // Consumo de insumos vinculados (ex.: produto composto por matérias-primas).
  // Isso é independente da produção de cópias — um produto de prateleira
  // pode ter composição própria mesmo sem nenhuma impressão no carrinho.
  for (const item of itensProduto) {
    const { data: vinculos } = await sb.from('produto_insumos')
      .select('*, insumos:insumo_id(id, nome, estoque_atual)')
      .eq('produto_id', item.produto_id);

    if (vinculos && vinculos.length > 0) {
      for (const v of vinculos) {
        const consumo = v.quantidade * item.quantidade;
        if (v.insumos.estoque_atual < consumo) {
          toast(`Insumo insuficiente: ${v.insumos.nome} (necessário ${consumo}, disponível ${v.insumos.estoque_atual})`, 'error');
          return null;
        }
      }
      for (const v of vinculos) {
        const consumo = v.quantidade * item.quantidade;
        await sb.from('produtos').update({ estoque_atual: v.insumos.estoque_atual - consumo }).eq('id', v.insumo_id);
      }
    }
  }

  const total = Math.max(0, Math.round(subtotal) - desconto);
  const { data: venda, error } = await sb.from('vendas').insert({
    subtotal: Math.round(subtotal),
    desconto,
    total,
    forma_pagamento: pagamento,
    status: 'concluido',
    cliente_nome_pdv: clienteNomePDV,
    carrinho_id: carrinhoId,
    ...camposBRL(pagamento, total),
  }).select().single();

  if (error) { toast('Erro ao registrar venda: ' + error.message, 'error'); return null; }

  const itens = itensProduto.map(i => {
    const precoUnit = precoComPagamento(i.preco_base, i.preco_cartao, pagamento);
    return {
      venda_id: venda.id,
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      preco_unitario: Math.round(precoUnit),
      total: Math.round(precoUnit * i.quantidade),
    };
  });
  await sb.from('venda_itens').insert(itens);

  // Baixa estoque do produto final
  for (const item of itensProduto) {
    const { data: produto } = await sb.from('produtos').select('estoque_atual').eq('id', item.produto_id).single();
    if (produto) {
      const novoEstoque = Math.max(0, produto.estoque_atual - item.quantidade);
      await sb.from('produtos').update({ estoque_atual: novoEstoque }).eq('id', item.produto_id);
    }
  }

  return venda.id;
}

window.verDetalhesCarrinho = async function(identificador) {
  if (identificador && identificador.startsWith('single-')) {
    const id = identificador.replace('single-', '');
    let { data: venda } = await sb.from('vendas').select('*, clientes(nome)').eq('id', id).maybeSingle();
    if (venda) {
      verVenda(venda.id);
      return;
    }
    let { data: pedido } = await sb.from('pedidos_copia').select('*, impressoras(nome)').eq('id', id).maybeSingle();
    if (pedido) {
      verPedidoCopiaHistorico(pedido.id);
      return;
    }
    toast(`Item #${id} não encontrado`, 'error');
    return;
  }

  const carrinhoId = identificador;
  if (!carrinhoId || carrinhoId === 'undefined' || carrinhoId === 'null') {
    toast('Identificador inválido', 'error');
    return;
  }

  // Tenta buscar o carrinho pendente
  const { data: carrinho } = await sb.from('carrinhos_pendentes').select('*').eq('id', carrinhoId).maybeSingle();
  if (carrinho) {
    // Usa a função que decide entre finalização e visualização
    await verCarrinhoPorId(carrinhoId);
    return;
  }

  // Se não encontrou carrinho pendente, busca registros finalizados
  await exibirResumoCarrinhoFinalizado(carrinhoId);
};

async function carregarHistoricoVendas() {
  const [{ data: vendas }, { data: copias }] = await Promise.all([
    sb.from('vendas')
      .select('*, clientes(nome), carrinho_id')
      .order('created_at', { ascending: false })
      .limit(100),
    sb.from('pedidos_copia')
      .select('*, carrinho_id')
      .eq('status', 'concluido')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  // Monta um mapa agrupado por carrinho_id (quando existir)
  const map = new Map();

  const processarItem = (item, origem) => {
    // Se carrinho_id for null/undefined, cria chave única com prefixo
    const key = item.carrinho_id ? item.carrinho_id : `single-${item.id}`;
    if (!map.has(key)) {
      map.set(key, {
        itens: [],
        total: 0,
        cliente: item.cliente_nome_pdv || 'Consumidor',
        data: item.created_at,
        carrinho_id: item.carrinho_id || null,
        numero: null,
      });
    }
    const grupo = map.get(key);
    grupo.itens.push({ ...item, origem });
    grupo.total += item.total || 0;
    if (!grupo.numero) {
      grupo.numero = item.numero_pedido || item.numero_venda || '—';
    }
    if (new Date(item.created_at) > new Date(grupo.data)) {
      grupo.data = item.created_at;
    }
  };

  (vendas || []).forEach(v => processarItem(v, 'venda'));
  (copias || []).forEach(c => processarItem(c, 'copia'));

  // Converte para array e ordena por data decrescente
  const grupos = Array.from(map.values())
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .slice(0, 30);

  const container = document.getElementById('historico-vendas');
  if (!container) return;

  if (grupos.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-sub">Nenhuma venda registrada</div></div>`;
    return;
  }

  const isAdmin = State.userProfile?.role === 'admin' || State.userProfile?.role === 'adminMaster';

  container.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Origem</th><th>Cliente</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Data</th><th></th></tr></thead>
      <tbody>
        ${grupos.map(g => {
          // Exibe a primeira forma de pagamento (ou 'Misto')
          const pagamentos = [...new Set(g.itens.map(i => i.forma_pagamento).filter(Boolean))];
          const semPagamento = pagamentos.length === 0;
          const pagamentoLabel = pagamentos.length > 1 ? 'Misto' : (pagamentos[0] ? labelPagamento(pagamentos[0]) : '—');
          // Pix (R$) é a única forma que mostra equivalência em reais —
          // QR (₲) é um método paraguaio, não precisa de conversão.
          const somaBRL = g.itens.reduce((a, i) => a + (i.valor_brl || 0), 0);
          const mostrarBRL = pagamentos.length === 1 && pagamentos[0] === 'pix_brl' && somaBRL > 0;
          // Status: se algum item não estiver concluído, mostra pendente
          const todosConcluidos = g.itens.every(i => i.status === 'concluido');
          const statusLabel = todosConcluidos ? 'Concluído' : 'Pendente';
          const badgeStatus = todosConcluidos ? 'badge--success' : 'badge--warning';
          // Identificador para o botão "Ver"
          const verId = g.carrinho_id ? g.carrinho_id : `single-${g.itens[0]?.id}`;
          return `
            <tr>
              <td class="td-mono">#${g.numero}</td>
              <td>${g.itens.some(i => i.origem === 'copia') ? '🖨️ Cópia' : ''} ${g.itens.some(i => i.origem === 'venda') ? '📦 Produto' : ''}</td>
              <td>${g.cliente}</td>
              <td><span class="badge ${semPagamento ? 'badge--danger' : 'badge--primary'}">${pagamentoLabel}</span>${mostrarBRL ? `<div style="font-size:10px;color:var(--c-text-3);margin-top:2px">🇧🇷 R$ ${somaBRL.toFixed(2)}</div>` : ''}</td>
              <td style="color:var(--c-success);font-weight:600">${formatMoney(g.total)}</td>
              <td><span class="badge ${badgeStatus}">${statusLabel}</span></td>
              <td class="td-mono">${formatDateTime(g.data)}</td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="btn btn--ghost btn--sm" onclick="verDetalhesCarrinho('${verId}')">Ver</button>
                  ${(isAdmin && semPagamento) ? `<button class="btn btn--ghost btn--sm" style="color:var(--c-warning)" onclick="corrigirPagamentoHistorico('${verId}')" title="Definir forma de pagamento">💳</button>` : ''}
                  ${isAdmin ? `<button class="btn btn--ghost btn--sm" style="color:var(--c-danger)" onclick="excluirGrupoHistorico('${verId}')" title="Excluir (erro/duplicado)">🗑️</button>` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

window.verPedidoCopiaHistorico = async function(pedidoId) {
  const { data: p } = await sb.from('pedidos_copia').select('*, impressoras(nome)').eq('id', pedidoId).single();
  if (!p) { toast('Pedido não encontrado', 'error'); return; }

  openModal(`Cópia #${p.numero_pedido ?? '—'}`, `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="display:flex;justify-content:space-between">
        <div>
          <div style="color:var(--c-text-3)">Cliente</div>
          <div style="font-weight:700">${p.cliente_nome_pdv || 'Consumidor'}</div>
        </div>
        <div>
          <div style="color:var(--c-text-3)">Data</div>
          <div>${formatDateTime(p.created_at)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <div>
          <div style="color:var(--c-text-3)">Pagamento</div>
          <div>${p.forma_pagamento ? labelPagamento(p.forma_pagamento) : '—'} ${p.forma_pagamento==='fiado' ? (p.fiado_quitado ? '✅ Quitado' : '⚠️ Pendente') : ''}</div>
          ${p.forma_pagamento === 'pix_brl' && p.valor_brl ? `<div style="font-size:var(--t-xs);color:var(--c-text-3)">🇧🇷 R$ ${p.valor_brl.toFixed(2)} @ ₲${p.cotacao_brl?.toLocaleString('es-PY')}/R$</div>` : ''}
        </div>
        <div>
          <div style="color:var(--c-text-3)">Total</div>
          <div style="font-size:var(--t-xl);font-weight:700;color:var(--c-success)">${formatMoney(p.total)}</div>
        </div>
      </div>
      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-3)">
        <div>${labelTipoCopia(p.tipo)} — ${p.quantidade} cópias${p.frente_verso ? ' (frente e verso)' : ''}</div>
        <div style="font-size:var(--t-xs);color:var(--c-text-3)">Impressora: ${p.impressoras?.nome || '—'} · ${p.total_folhas || 0} folhas</div>
        ${p.desconto > 0 ? `<div style="font-size:var(--t-xs);color:var(--c-danger)">Desconto: ${formatMoney(p.desconto)}</div>` : ''}
      </div>
    </div>
  `);
};

// ============================================================
// ── AÇÕES ADMINISTRATIVAS DO HISTÓRICO (CAIXA) ──────────────
// Apenas admin/adminMaster: corrigir pagamento faltante ou
// excluir um lançamento por engano/duplicidade. A exclusão
// devolve ao estoque o que foi consumido, quando aplicável.
// ============================================================
function _souAdminCaixa() {
  const ok = State.userProfile?.role === 'admin' || State.userProfile?.role === 'adminMaster';
  if (!ok) toast('Apenas administradores podem fazer isso.', 'warning');
  return ok;
}

// Resolve um identificador do histórico (carrinho_id ou 'single-<id>')
// para a lista de { tabela, id } que ele representa.
async function _resolverItensHistorico(identificador) {
  if (identificador.startsWith('single-')) {
    const id = identificador.replace('single-', '');
    const { data: venda } = await sb.from('vendas').select('id, total').eq('id', id).maybeSingle();
    if (venda) return [{ tabela: 'venda', id, total: venda.total }];
    const { data: pedido } = await sb.from('pedidos_copia').select('id, total').eq('id', id).maybeSingle();
    if (pedido) return [{ tabela: 'copia', id, total: pedido.total }];
    return [];
  }
  const carrinhoId = identificador;
  const [{ data: vendasDoCarrinho }, { data: pedidosDoCarrinho }] = await Promise.all([
    sb.from('vendas').select('id, total').eq('carrinho_id', carrinhoId),
    sb.from('pedidos_copia').select('id, total').eq('carrinho_id', carrinhoId),
  ]);
  return [
    ...(vendasDoCarrinho || []).map(v => ({ tabela: 'venda', id: v.id, total: v.total })),
    ...(pedidosDoCarrinho || []).map(p => ({ tabela: 'copia', id: p.id, total: p.total })),
  ];
}

window.corrigirPagamentoHistorico = async function(identificador) {
  if (!_souAdminCaixa()) return;
  const itens = await _resolverItensHistorico(identificador);
  if (itens.length === 0) { toast('Registro não encontrado.', 'error'); return; }

  openModal('💳 Corrigir Forma de Pagamento', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="section-sub">Este lançamento foi concluído sem forma de pagamento (provavelmente um pedido que ficou órfão do carrinho). Selecione a forma de pagamento correta para regularizar o caixa.</div>
      <div class="field">
        <label>Forma de Pagamento</label>
        <select class="input" id="corrigir-pagamento-select">
          <option value="" selected disabled>Selecione…</option>
          ${['dinheiro','pix','pix_brl','cartao_debito','cartao_credito','transferencia','fiado'].map(fp => `<option value="${fp}">${labelPagamento(fp)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--success btn--lg" style="width:100%;justify-content:center" onclick="salvarCorrecaoPagamentoHistorico('${identificador}')">✅ Salvar</button>
    </div>
  `);
};

window.salvarCorrecaoPagamentoHistorico = async function(identificador) {
  let forma = document.getElementById('corrigir-pagamento-select')?.value || '';
  if (!forma) { toast('Selecione a forma de pagamento.', 'warning'); return; }

  const itens = await _resolverItensHistorico(identificador);
  for (const it of itens) {
    const tabela = it.tabela === 'venda' ? 'vendas' : 'pedidos_copia';
    await sb.from(tabela).update({ forma_pagamento: forma, ...camposBRL(forma, it.total || 0) }).eq('id', it.id);
  }
  await registrarLog('corrigir_pagamento', 'historico_caixa', identificador, { forma_pagamento: forma });
  toast('Forma de pagamento corrigida!', 'success');
  closeModal();
  await carregarHistoricoVendas();
};

window.excluirGrupoHistorico = async function(identificador) {
  if (!_souAdminCaixa()) return;
  if (!confirm('Excluir este lançamento do caixa? Essa ação não pode ser desfeita. O estoque consumido (produtos e folhas) será devolvido automaticamente.')) return;

  try {
    const itens = await _resolverItensHistorico(identificador);
    if (itens.length === 0) { toast('Registro não encontrado.', 'error'); return; }

    for (const it of itens) {
      if (it.tabela === 'venda') {
        await _excluirVendaEReverterEstoque(it.id);
      } else {
        await _excluirPedidoCopiaEReverterEstoque(it.id);
      }
    }

    toast('Lançamento excluído e estoque devolvido.', 'success');
    await carregarHistoricoVendas();
  } catch (err) {
    toast('Erro ao excluir: ' + err.message, 'error');
  }
};

async function _excluirVendaEReverterEstoque(vendaId) {
  const { data: itensVenda } = await sb.from('venda_itens').select('*').eq('venda_id', vendaId);
  for (const it of (itensVenda || [])) {
    const { data: prod } = await sb.from('produtos').select('estoque_atual').eq('id', it.produto_id).single();
    if (prod) {
      await sb.from('produtos').update({ estoque_atual: (prod.estoque_atual || 0) + it.quantidade }).eq('id', it.produto_id);
    }
  }
  await sb.from('venda_itens').delete().eq('venda_id', vendaId);
  await sb.from('vendas').delete().eq('id', vendaId);
  await registrarLog('excluir', 'venda', vendaId, { motivo: 'excluído via histórico do caixa' });
}

async function _excluirPedidoCopiaEReverterEstoque(pedidoId) {
  const { data: p } = await sb.from('pedidos_copia').select('*').eq('id', pedidoId).single();
  if (!p) return;

  if (p.status === 'concluido') {
    const folhasConsumidas = p.folhas_usadas || p.total_folhas || 0;

    // Devolve a folha (papel) específica usada nesta impressão
    if (p.insumo_folha_id && folhasConsumidas > 0) {
      const { data: folha } = await sb.from('produtos').select('estoque_atual').eq('id', p.insumo_folha_id).single();
      if (folha) {
        await sb.from('produtos').update({ estoque_atual: (folha.estoque_atual || 0) + folhasConsumidas }).eq('id', p.insumo_folha_id);
      }
    }

    // Devolve outros insumos vinculados a este tipo de cópia (toner, tinta etc.)
    if (p.tipo && folhasConsumidas > 0) {
      const { data: vinculos } = await sb.from('copia_insumos').select('*').eq('tipo_copia', p.tipo);
      for (const v of (vinculos || [])) {
        const consumo = v.quantidade * folhasConsumidas;
        const { data: ins } = await sb.from('produtos').select('estoque_atual').eq('id', v.insumo_id).single();
        if (ins) {
          await sb.from('produtos').update({ estoque_atual: (ins.estoque_atual || 0) + consumo }).eq('id', v.insumo_id);
        }
      }
    }
  }

  await sb.from('pedidos_copia').delete().eq('id', pedidoId);
  await registrarLog('excluir', 'pedido_copia', pedidoId, { motivo: 'excluído via histórico do caixa' });
}

// ── ITENS VISÍVEIS POR PERFIL ────────────────────────────
function getVisibleNavItems() {
  const userRole = State.userProfile?.role || 'funcionario';
  return NAV.filter(item => {
    if (item.group) return false; // não incluir grupos
    return !item.roles || item.roles.includes(userRole);
  });
}

// ── MÓDULO: CAIXA (VERSÃO COMPLETA) ──────────────────────
// ============================================================

async function renderCaixa(el) {
  // Carrega sessões e dados da empresa
  const [{ data: sessoes }, { data: empresa }] = await Promise.all([
    sb.from('caixa_sessoes').select('*, funcionarios(nome)').order('aberto_em', { ascending: false }).limit(10),
    sb.from('empresa').select('config').single()
  ]);

  const sessaoAberta = sessoes?.find(s => !s.fechado_em);
  const limiteSangria = empresa?.config?.limite_sangria || 1000000;

  // Se houver sessão aberta, busca os movimentos e calcula saldo
  let movimentos = [];
  let saldoAtual = 0;
  let totalVendasDinheiro = 0;
  let totalSuprimentos = 0;
  let totalRetiradas = 0;
  let totalDespesas = 0;
  let totalSangrias = 0;

  if (sessaoAberta) {
    // Buscar movimentos
    const { data: mov } = await sb.from('caixa_movimentos')
      .select('*')
      .eq('sessao_id', sessaoAberta.id)
      .order('created_at', { ascending: false });
    movimentos = mov || [];

    // Calcular totais via view ou diretamente
    const { data: totals } = await sb.rpc('calcular_saldo_esperado', { sessao_id: sessaoAberta.id });
    saldoAtual = totals || 0;

    // Buscar totais por tipo (usando a view)
    const { data: viewData } = await sb.from('vw_caixa_sessao_atual').select('*').eq('id', sessaoAberta.id).single();
    if (viewData) {
      totalSuprimentos = viewData.total_suprimentos || 0;
      totalRetiradas = viewData.total_retiradas || 0;
      totalDespesas = viewData.total_despesas || 0;
      totalSangrias = viewData.total_sangrias || 0;
      totalVendasDinheiro = (viewData.total_vendas_copias_dinheiro || 0) + (viewData.total_vendas_produtos_dinheiro || 0);
    }
  }

  // HTML
  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">💰 Controle de Caixa</div>
        <div class="section-sub">Abertura, movimentações e fechamento</div>
      </div>
      <div>
        ${sessaoAberta 
          ? `<button class="btn btn--danger" onclick="fecharCaixa('${sessaoAberta.id}')">🔒 Fechar Caixa</button>`
          : `<button class="btn btn--success" onclick="abrirCaixa()">🔓 Abrir Caixa</button>`
        }
        <button class="btn btn--ghost" onclick="irConfiguracoes()">⚙️ Configurações</button>
      </div>
    </div>

    <!-- Status da sessão atual -->
    <div class="card" style="border-color:${sessaoAberta ? 'var(--c-success)' : 'var(--c-danger)'}; margin-bottom: var(--sp-4)">
      <div class="card-body">
        <div style="display:flex; align-items:center; gap: var(--sp-4); flex-wrap:wrap">
          <div style="display:flex; align-items:center; gap: var(--sp-3)">
            <div style="width:12px;height:12px;border-radius:50%;background:${sessaoAberta ? 'var(--c-success)' : 'var(--c-danger)'}; ${sessaoAberta ? 'animation: pulse 1.5s infinite' : ''}"></div>
            <span style="font-weight:700; font-size:var(--t-lg); height: auto;">${sessaoAberta ? '🟢 Caixa Aberto' : '🔴 Caixa Fechado'}</span>
          </div>
          ${sessaoAberta ? `
            <div style="display:flex; gap: var(--sp-6); flex-wrap:wrap">
              <div><span style="color:var(--c-text-3)">Abertura:</span> ${formatMoney(sessaoAberta.valor_abertura)}</div>
              <div><span style="color:var(--c-text-3)">Saldo atual:</span> <strong style="color:var(--c-accent)">${formatMoney(saldoAtual)}</strong></div>
              <div><span style="color:var(--c-text-3)">Limite sangria:</span> ${formatMoney(limiteSangria)}</div>
              ${sessaoAberta.travado ? `<span class="badge badge--danger" style="font-weight:700">🔒 TRAVADO</span>` : ''}
            </div>
          ` : ''}
          ${sessaoAberta?.travado ? `<button class="btn btn--warning" onclick="liberarCaixa('${sessaoAberta.id}')">🔓 Liberar (Admin)</button>` : ''}
        </div>
      </div>
    </div>

    <!-- Botões de ação (apenas se caixa aberto) -->
    ${sessaoAberta && !sessaoAberta.travado ? `
    <div style="display:flex; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-4)">
      <button class="btn btn--primary" onclick="abrirModalSuprimento('${sessaoAberta.id}')">💰 Suprimento</button>
      <button class="btn btn--ghost" onclick="abrirModalRetirada('${sessaoAberta.id}')">💸 Retirada</button>
      <button class="btn btn--danger" onclick="abrirModalDespesa('${sessaoAberta.id}')">📋 Despesa</button>
      <button class="btn btn--accent" onclick="abrirModalSangria('${sessaoAberta.id}')">🏦 Sangria</button>
    </div>
    ` : ''}

    <!-- Movimentos do dia (se houver sessão aberta) -->
    ${sessaoAberta ? `
    <div class="card" style="margin-bottom: var(--sp-4)">
      <div class="card-header"><span class="card-title">📋 Movimentações do Dia</span></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Tipo</th><th>Valor</th><th>Descrição</th><th>Hora</th></tr>
          </thead>
          <tbody>
            ${movimentos.length === 0 
              ? `<tr><td colspan="4"><div class="empty-state" style="padding:var(--sp-6)"><div class="empty-state-sub">Nenhuma movimentação ainda</div></div></td></tr>`
              : movimentos.map(m => `
                <tr>
                  <td><span class="badge ${m.tipo === 'suprimento' ? 'badge--success' : m.tipo === 'retirada' ? 'badge--warning' : m.tipo === 'despesa' ? 'badge--danger' : 'badge--accent'}">${m.tipo}</span></td>
                  <td style="color:${m.tipo === 'suprimento' ? 'var(--c-success)' : 'var(--c-danger)'}">${formatMoney(m.valor)}</td>
                  <td>${m.descricao || '—'}</td>
                  <td class="td-mono">${formatDateTime(m.created_at)}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Histórico de Vendas -->
    <div class="card" style="margin-top: var(--sp-4);">
      <div class="card-header"><span class="card-title">📋 Histórico de Vendas</span></div>
      <div class="table-wrap" id="historico-vendas"></div>
    </div>

    <!-- Histórico de caixas (já existente) -->
    <div class="card" style="margin-top: var(--sp-4);">
      <div class="card-header"><span class="card-title">Histórico de Caixas</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Abertura</th><th>Fechamento</th><th>Fundo</th><th>Total Cópias</th><th>Total Vendas</th><th>Quebra</th><th>Status</th></tr></thead>
          <tbody>
            ${(sessoes||[]).map(s => `
              <tr>
                <td class="td-mono">${formatDateTime(s.aberto_em)}</td>
                <td class="td-mono">${s.fechado_em ? formatDateTime(s.fechado_em) : '—'}</td>
                <td>${formatMoney(s.valor_abertura)}</td>
                <td style="color:var(--c-primary)">${formatMoney(s.total_copias)}</td>
                <td style="color:var(--c-success)">${formatMoney(s.total_vendas)}</td>
                <td style="color:${(s.quebra || 0) > 0 ? 'var(--c-success)' : (s.quebra || 0) < 0 ? 'var(--c-danger)' : 'var(--c-text-3)'}">${formatMoney(s.quebra || 0)}</td>
                <td>${s.fechado_em ? '<span class="badge badge--success">Fechado</span>' : '<span class="badge badge--warning">Aberto</span>'}</td>
              </tr>
            `).join('') || '<tr><td colspan="7"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-sub">Nenhum caixa registrado</div></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>     

  `;
  await carregarHistoricoVendas();
}

// ── ABRIR CAIXA ───────────────────────────────────────────
window.abrirCaixa = function() {
  openModal('Abrir Caixa', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field">
        <label>Fundo de Caixa (dinheiro inicial) *</label>
        <input type="number" class="input" id="fundo-caixa" min="0" step="0.01" placeholder="0" required />
      </div>
      <div class="field">
        <label>Observações (opcional)</label>
        <input type="text" class="input" id="obs-abertura" placeholder="Ex: Início do expediente" />
      </div>
      <button class="btn btn--success btn--lg" id="btn-confirmar-abertura" style="width:100%;justify-content:center" onclick="confirmarAbrirCaixa()">
        🔓 Confirmar Abertura
      </button>
    </div>
  `);
};

window.confirmarAbrirCaixa = async function() {
  const valorAbertura = parseFloat(document.getElementById('fundo-caixa').value) || 0;
  if (valorAbertura <= 0) { toast('Informe um valor válido', 'warning'); return; }
  const obs = document.getElementById('obs-abertura').value || null;

  const btn = document.getElementById('btn-confirmar-abertura');
  if (btn) { btn.disabled = true; btn.textContent = 'Abrindo...'; }

  try {
    // Trava de segurança no client: nunca abrir um novo caixa se já existe
    // um aberto (evita sessões órfãs / "caixa que nunca fecha").
    // A garantia definitiva fica por conta do índice único no banco
    // (ux_caixa_sessoes_uma_aberta) — se cair aqui, o insert vai falhar
    // com erro de constraint mesmo que essa checagem passe por uma corrida.
    const statusAtual = await getStatusCaixa();
    if (statusAtual.aberto) {
      toast('Já existe um caixa aberto. Feche-o antes de abrir outro.', 'error');
      closeModal();
      navigate('caixa');
      return;
    }

    const { data, error } = await sb.from('caixa_sessoes').insert({
      valor_abertura: valorAbertura,
      observacoes: obs,
      saldo_atual: valorAbertura // já define saldo inicial
    }).select().single();

    if (error) {
      // Se bateu no índice único (23505), é porque outra sessão já abriu
      // o caixa entre a checagem acima e este insert — mensagem amigável.
      if (error.code === '23505') {
        toast('Já existe um caixa aberto (detectado no banco). Recarregando...', 'error');
      } else {
        toast('Erro: ' + error.message, 'error');
      }
      return;
    }

    toast('Caixa aberto com sucesso!', 'success');
    closeModal();
    navigate('caixa');
    await renderCaixaStatusWidget();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔓 Confirmar Abertura'; }
  }
};

// ── MODAL SUPRIMENTO ──────────────────────────────────────
window.abrirModalSuprimento = function(sessaoId) {
  openModal('💰 Suprimento de Caixa', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field">
        <label>Valor *</label>
        <input type="number" class="input" id="mov-valor" min="0.01" step="0.01" placeholder="0,00" />
      </div>
      <div class="field">
        <label>Descrição</label>
        <input type="text" class="input" id="mov-desc" placeholder="Ex: Troco do banco" />
      </div>
      <button class="btn btn--success btn--lg" style="width:100%;justify-content:center" onclick="registrarMovimento('${sessaoId}','suprimento')">
        ✅ Confirmar Suprimento
      </button>
    </div>
  `);
};

// ── MODAL RETIRADA ────────────────────────────────────────
window.abrirModalRetirada = function(sessaoId) {
  openModal('💸 Retirada de Caixa', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field">
        <label>Valor *</label>
        <input type="number" class="input" id="mov-valor" min="0.01" step="0.01" placeholder="0,00" />
      </div>
      <div class="field">
        <label>Descrição</label>
        <input type="text" class="input" id="mov-desc" placeholder="Ex: Pagamento de fornecedor (avulso)" />
      </div>
      <button class="btn btn--warning btn--lg" style="width:100%;justify-content:center" onclick="registrarMovimento('${sessaoId}','retirada')">
        ✅ Confirmar Retirada
      </button>
    </div>
  `);
};

// ── MODAL DESPESA ─────────────────────────────────────────
window.abrirModalDespesa = function(sessaoId) {
  openModal('📋 Despesa', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field">
        <label>Valor *</label>
        <input type="number" class="input" id="mov-valor" min="0.01" step="0.01" placeholder="0,00" />
      </div>
      <div class="field">
        <label>Categoria</label>
        <select class="input" id="mov-categoria">
          <option value="aluguel">Aluguel</option>
          <option value="fornecedor">Fornecedor</option>
          <option value="funcionario">Funcionário</option>
          <option value="pro-labore">Pró-labore</option>
          <option value="diversos">Diversos</option>
          <option value="outros">Outros</option>
        </select>
      </div>
      <div class="field">
        <label>Descrição</label>
        <input type="text" class="input" id="mov-desc" placeholder="Ex: Conta de luz" />
      </div>
      <button class="btn btn--danger btn--lg" style="width:100%;justify-content:center" onclick="registrarMovimento('${sessaoId}','despesa')">
        ✅ Confirmar Despesa
      </button>
    </div>
  `);
};

// ── MODAL SANGRIA ──────────────────────────────────────────
window.abrirModalSangria = function(sessaoId) {
  openModal('🏦 Sangria (Retirada para Cofre)', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field">
        <label>Valor *</label>
        <input type="number" class="input" id="mov-valor" min="0.01" step="0.01" placeholder="0,00" />
      </div>
      <div class="field">
        <label>Descrição</label>
        <input type="text" class="input" id="mov-desc" placeholder="Ex: Sangria para cofre" />
      </div>
      <button class="btn btn--accent btn--lg" style="width:100%;justify-content:center" onclick="registrarMovimento('${sessaoId}','sangria')">
        ✅ Confirmar Sangria
      </button>
    </div>
  `);
};

// ── REGISTRAR MOVIMENTO E VERIFICAR TRAVA ──────────────
window.registrarMovimento = async function(sessaoId, tipo) {
  const valor = parseFloat(document.getElementById('mov-valor').value) || 0;
  if (valor <= 0) { toast('Informe um valor válido', 'warning'); return; }
  const descricao = document.getElementById('mov-desc')?.value || null;
  const categoria = document.getElementById('mov-categoria')?.value || null;

  const payload = {
    sessao_id: sessaoId,
    tipo,
    valor,
    descricao,
    categoria_despesa: categoria,
    forma_pagamento: 'dinheiro'
  };

  
  const { error } = await sb.from('caixa_movimentos').insert(payload);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  // A trava (travado = true/false) agora é decidida pelo trigger do banco
  // (fn_verificar_trava_caixa, disparado por este INSERT em caixa_movimentos)
  // — assim ela vale pra qualquer inserção, inclusive vendas feitas pelo
  // PDV, e não depende do client rodar o JS certo. Aqui só recalculamos
  // o saldo pra manter o campo de exibição atualizado.
  const { data: saldo } = await sb.rpc('calcular_saldo_esperado', { sessao_id: sessaoId });
  await sb.from('caixa_sessoes').update({ saldo_atual: saldo }).eq('id', sessaoId);

  // Relê o status já refletindo a decisão do trigger.
  const statusPosMovimento = await getStatusCaixa();
  if (statusPosMovimento.travado) {
    toast('⚠️ Atingiu o limite de sangria! O caixa foi travado. Libere com senha de admin.', 'error');
  } else {
    toast('Movimento registrado!', 'success');
  }

  closeModal();
  navigate('caixa');
  renderCaixaStatusWidget()
};

// ── LIBERAR CAIXA (SENHA ADMIN) ─────────────────────────
window.liberarCaixa = async function(sessaoId) {
  openModal('🔓 Liberar Caixa - Senha Administrador', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="background:var(--c-warning-s);padding:var(--sp-4);border-radius:var(--r-md);font-size:var(--t-sm)">
        O caixa atingiu o valor de sangria. Para liberar, informe a senha do administrador.
      </div>
      <div class="field">
        <label>Senha do Administrador *</label>
        <input type="password" class="input" id="admin-senha" placeholder="••••••••" />
      </div>
      <button class="btn btn--warning btn--lg" style="width:100%;justify-content:center" onclick="confirmarLiberacao('${sessaoId}')">
        🔓 Verificar e Liberar
      </button>
    </div>
  `);
};

window.confirmarLiberacao = async function(sessaoId) {
  const senha = document.getElementById('admin-senha').value;
  if (!senha) { toast('Informe a senha', 'warning'); return; }

  // Verifica se a senha corresponde à senha do admin logado
  const { data, error } = await sb.auth.signInWithPassword({
    email: State.user.email,
    password: senha
  });

  if (error) {
    toast('Senha incorreta!', 'error');
    return;
  }

  // Libera caixa. `liberado_manualmente: true` avisa o trigger do banco
  // (fn_verificar_trava_caixa) pra não travar de novo automaticamente
  // nesta sessão, mesmo que o saldo continue acima do limite — a
  // liberação do admin vale até o fechamento do caixa.
  const { error: errLiberar } = await sb.from('caixa_sessoes')
    .update({ travado: false, liberado_manualmente: true })
    .eq('id', sessaoId);
  if (errLiberar) { toast('Erro ao liberar: ' + errLiberar.message, 'error'); return; }

  await registrarLog('liberar_caixa', 'caixa_sessoes', sessaoId, {});
  toast('Caixa liberado!', 'success');
  closeModal();
  navigate('caixa');
  renderCaixaStatusWidget()
};

// (fecharCaixa foi movido pra baixo — versão completa com conferência,
// breakdown por forma de pagamento e movimentações do dia)

// ── CONFIGURAÇÕES (limite de sangria) ────────────────────
window.irConfiguracoes = async function() {
  const { data: empresa } = await sb.from('empresa').select('config').single();
  const limiteAtual = empresa?.config?.limite_sangria || 1000000;

  openModal('⚙️ Configurações do Caixa', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="background:var(--c-warning-s);padding:var(--sp-4);border-radius:var(--r-md);font-size:var(--t-sm)">
        <strong>Limite de Sangria:</strong> Quando o saldo em caixa atingir este valor, o caixa será travado automaticamente.
      </div>
      <div class="field">
        <label>Valor de Sangria (gatilho) ₲</label>
        <input type="number" class="input" id="limite-sangria-input" value="${limiteAtual}" step="1000" min="1000" />
      </div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarLimiteSangria()">
        💾 Salvar Configuração
      </button>
    </div>
  `);
};

window.salvarLimiteSangria = async function() {
  const valor = parseFloat(document.getElementById('limite-sangria-input').value) || 1000000;
  if (valor < 1000) { toast('Valor deve ser maior que 1000', 'warning'); return; }

  const { data: empresa } = await sb.from('empresa').select('id, config').single();
  const config = empresa?.config || {};
  config.limite_sangria = valor;
  const { error } = await sb.from('empresa').update({ config }).eq('id', empresa.id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Configuração salva!', 'success');
  closeModal();
  navigate('caixa');
};

window.fecharCaixa = async function(sessaoId) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const inicioHojeISO = hoje.toISOString();

  let totalCopias, totalVendas, saldoEsperado, movimentos, sessao, breakdown;
  try {
    [
      { total: totalCopias },
      { total: totalVendas },
      { data: saldoEsperado },
      { data: movimentos },
      { data: sessao },
      breakdown,
    ] = await Promise.all([
      getTotalRealizado('pedidos_copia', inicioHojeISO),
      getTotalRealizado('vendas', inicioHojeISO),
      sb.rpc('calcular_saldo_esperado', { sessao_id: sessaoId }),
      sb.from('caixa_movimentos').select('*').eq('sessao_id', sessaoId),
      sb.from('caixa_sessoes').select('*').eq('id', sessaoId).single(),
      getBreakdownPagamento(inicioHojeISO),
    ]);
  } catch (err) {
    console.error('[fecharCaixa] Erro ao carregar dados de fechamento:', err);
    toast('Não foi possível carregar os dados do fechamento. Verifique sua conexão e tente novamente.', 'error');
    return;
  }

  const totalGeral = totalCopias + totalVendas;
  const totalSuprimentos = (movimentos || []).filter(m => m.tipo === 'suprimento').reduce((a, b) => a + b.valor, 0);
  const totalRetiradas   = (movimentos || []).filter(m => m.tipo === 'retirada').reduce((a, b) => a + b.valor, 0);
  const totalDespesas    = (movimentos || []).filter(m => m.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);
  const totalSangrias    = (movimentos || []).filter(m => m.tipo === 'sangria').reduce((a, b) => a + b.valor, 0);
  const valorAbertura    = sessao?.valor_abertura || 0;

  openModal('🔒 Fechar Caixa', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">

      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-sm);color:var(--c-text-2);margin-bottom:var(--sp-3)">💰 Entradas do dia (todas as formas)</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--sp-2)">
          <span style="color:var(--c-text-3)">🖨️ Cópias / Impressões</span>
          <span style="font-weight:600;color:var(--c-primary)">${formatMoney(totalCopias)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--sp-2)">
          <span style="color:var(--c-text-3)">📦 Produtos</span>
          <span style="font-weight:600;color:var(--c-success)">${formatMoney(totalVendas)}</span>
        </div>
        <div class="divider"></div>
        <div style="display:flex;justify-content:space-between">
          <span style="font-weight:700">Total do dia</span>
          <span style="font-size:var(--t-xl);font-weight:800;color:var(--c-accent)">${formatMoney(totalGeral)}</span>
        </div>
      </div>

      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-sm);color:var(--c-text-2);margin-bottom:var(--sp-3)">💳 Por forma de pagamento</div>
        ${Object.keys(breakdown).length === 0 ? `<div style="color:var(--c-text-3);font-size:var(--t-xs)">Nenhuma venda hoje</div>` :
          Object.entries(breakdown).map(([fp, valor]) => `
            <div style="display:flex;justify-content:space-between;margin-bottom:var(--sp-2);font-size:var(--t-sm)">
              <span>${labelPagamento(fp)}</span>
              <span style="font-weight:600">${formatMoney(valor)}</span>
            </div>
          `).join('')}
      </div>

      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-sm);color:var(--c-text-2);margin-bottom:var(--sp-3)">🏦 Movimentações do caixa</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--sp-2);font-size:var(--t-sm)">
          <span style="color:var(--c-text-3)">Abertura (fundo de caixa)</span>
          <span style="font-weight:600">${formatMoney(valorAbertura)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--sp-2);font-size:var(--t-sm)">
          <span style="color:var(--c-text-3)">+ Suprimentos</span>
          <span style="font-weight:600;color:var(--c-success)">${formatMoney(totalSuprimentos)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--sp-2);font-size:var(--t-sm)">
          <span style="color:var(--c-text-3)">− Retiradas</span>
          <span style="font-weight:600;color:var(--c-danger)">${formatMoney(totalRetiradas)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--sp-2);font-size:var(--t-sm)">
          <span style="color:var(--c-text-3)">− Despesas</span>
          <span style="font-weight:600;color:var(--c-danger)">${formatMoney(totalDespesas)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:var(--t-sm)">
          <span style="color:var(--c-text-3)">− Sangrias</span>
          <span style="font-weight:600;color:var(--c-danger)">${formatMoney(totalSangrias)}</span>
        </div>
      </div>

      <div style="background:var(--c-bg);border:1.5px solid var(--c-primary);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-xs);color:var(--c-text-3);margin-bottom:var(--sp-3)">🔍 Conferência final (dinheiro físico)</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--sp-3)">
          <span>Saldo esperado em caixa</span>
          <span style="font-weight:700;color:var(--c-accent)" id="valor-esperado-display">${formatMoney(saldoEsperado || 0)}</span>
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Valor real contado na gaveta *</label>
          <input type="number" class="input" id="valor-conferido" value="${saldoEsperado || 0}" step="0.01" min="0"
                 oninput="atualizarQuebraPreview(${saldoEsperado || 0})" />
        </div>
        <div id="quebra-preview" style="margin-top:var(--sp-2);font-size:var(--t-sm);color:var(--c-text-3)"></div>
      </div>

      <div class="field">
        <label>Observações do fechamento</label>
        <textarea class="input" id="obs-fechamento" rows="3" placeholder="Ocorrências, divergências..."></textarea>
      </div>

      <button class="btn btn--danger btn--lg" style="width:100%;justify-content:center"
        onclick="confirmarFecharCaixa('${sessaoId}', ${totalCopias}, ${totalVendas}, ${saldoEsperado || 0})">
        ✅ Confirmar Fechamento
      </button>
    </div>
  `);
  renderCaixaStatusWidget()
};

window.atualizarQuebraPreview = function(saldoEsperado) {
  const conferido = parseFloat(document.getElementById('valor-conferido')?.value) || 0;
  const quebra = conferido - saldoEsperado; // positivo = sobra, negativo = falta
  const el = document.getElementById('quebra-preview');
  if (!el) return;
  if (quebra === 0) el.innerHTML = `<span style="color:var(--c-text-3)">✅ Bate certinho com o esperado</span>`;
  else if (quebra > 0) el.innerHTML = `<span style="color:var(--c-success)">✅ Sobra de ${formatMoney(quebra)}</span>`;
  else el.innerHTML = `<span style="color:var(--c-danger)">⚠️ Falta ${formatMoney(Math.abs(quebra))}</span>`;
};

window.confirmarFecharCaixa = async function(sessaoId, totalCopias, totalVendas, saldoEsperado) {
  const obs = document.getElementById('obs-fechamento')?.value || '';
  const valorConferido = parseFloat(document.getElementById('valor-conferido')?.value) || 0;
  const quebra = valorConferido - saldoEsperado; // positivo = sobra, negativo = falta

  const { error } = await sb.from('caixa_sessoes').update({
    fechado_em: new Date().toISOString(),
    total_copias: totalCopias,
    total_vendas: totalVendas,
    valor_esperado: saldoEsperado,
    valor_conferido: valorConferido,
    quebra: quebra,
    observacoes: obs,
  }).eq('id', sessaoId);

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  if (quebra > 0) toast(`✅ Caixa fechado com sobra de ${formatMoney(quebra)}!`, 'success');
  else if (quebra < 0) toast(`⚠️ Caixa fechado com falta de ${formatMoney(Math.abs(quebra))}!`, 'error');
  else toast('✅ Caixa fechado — bateu certinho!', 'success');

  closeModal();
  renderCaixaStatusWidget();
  navigate('caixa');
};

// ============================================================
// ── MÓDULO: RELATÓRIOS ────────────────────────────────────
// ============================================================
// Exportação em CSV (abre certinho no Excel/Sheets, separador ";" pra
// não conflitar com vírgula decimal do pt-BR/es-PY).
function exportarCSV(filename, headers, linhas) {
  const escapar = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escapar).join(';'), ...linhas.map(l => l.map(escapar).join(';'))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let _ultimoRelatorioVendas = [];
let _ultimoRelatorioCaixas = [];

async function renderRelatorios(el) {
  const hoje = new Date().toISOString().split('T')[0];
  const f = State.relatorioFiltro || { inicio: hoje, fim: hoje, tipo: 'todos', pagamento: 'todos' };
  State.relatorioFiltro = f;

  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">📊 Relatórios</div>
        <div class="section-sub">Vendas, cópias e caixa — filtre e exporte em CSV</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--sp-4)">
      <div class="card-body" style="display:flex;gap:var(--sp-3);flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>De</label><input type="date" class="input" id="rel-data-inicio" value="${f.inicio}" /></div>
        <div class="field" style="margin-bottom:0"><label>Até</label><input type="date" class="input" id="rel-data-fim" value="${f.fim}" /></div>
        <div class="field" style="margin-bottom:0">
          <label>Tipo</label>
          <select class="input" id="rel-tipo">
            <option value="todos" ${f.tipo==='todos'?'selected':''}>Todos</option>
            <option value="copia" ${f.tipo==='copia'?'selected':''}>🖨️ Só Impressões</option>
            <option value="produto" ${f.tipo==='produto'?'selected':''}>📦 Só Produtos</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Pagamento</label>
          <select class="input" id="rel-pagamento">
            <option value="todos" ${f.pagamento==='todos'?'selected':''}>Todos</option>
            ${['dinheiro','pix','pix_brl','cartao_debito','cartao_credito','transferencia','fiado'].map(p => `<option value="${p}" ${f.pagamento===p?'selected':''}>${labelPagamento(p)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn--primary" onclick="aplicarFiltroRelatorio()">🔍 Filtrar</button>
        <button class="btn btn--ghost" onclick="exportarRelatorioVendas()">⬇️ Exportar Vendas CSV</button>
      </div>
    </div>

    <div id="relatorio-resumo"></div>
    <div class="card" style="margin-bottom:var(--sp-4)">
      <div class="card-header"><span class="card-title">Vendas no período</span></div>
      <div class="table-wrap" id="relatorio-vendas-tabela"></div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Aberturas e Fechamentos de Caixa</span>
        <button class="btn btn--ghost btn--sm" onclick="exportarRelatorioCaixas()">⬇️ Exportar CSV</button>
      </div>
      <div class="table-wrap" id="relatorio-caixas-tabela"></div>
    </div>
  `;

  await aplicarFiltroRelatorio();
}

window.aplicarFiltroRelatorio = async function() {
  const inicio = document.getElementById('rel-data-inicio')?.value || State.relatorioFiltro.inicio;
  const fim    = document.getElementById('rel-data-fim')?.value    || State.relatorioFiltro.fim;
  const tipo      = document.getElementById('rel-tipo')?.value      || 'todos';
  const pagamento = document.getElementById('rel-pagamento')?.value || 'todos';
  State.relatorioFiltro = { inicio, fim, tipo, pagamento };

  const inicioISO = new Date(inicio + 'T00:00:00').toISOString();
  const fimISO    = new Date(fim + 'T23:59:59').toISOString();

  const [{ data: copias }, { data: vendas }, { data: sessoes }] = await Promise.all([
    sb.from('pedidos_copia').select('*').eq('status', 'concluido').gte('created_at', inicioISO).lte('created_at', fimISO),
    sb.from('vendas').select('*, clientes(nome)').eq('status', 'concluido').gte('created_at', inicioISO).lte('created_at', fimISO),
    sb.from('caixa_sessoes').select('*, funcionarios(nome)').gte('aberto_em', inicioISO).lte('aberto_em', fimISO).order('aberto_em', { ascending: false }),
  ]);

  let linhas = [
    ...(tipo !== 'produto' ? (copias || []).map(p => ({
      origem: 'copia', numero: p.numero_pedido, cliente: p.cliente_nome_pdv || 'Consumidor',
      descricao: `${labelTipoCopia(p.tipo)} × ${p.quantidade}`, pagamento: p.forma_pagamento,
      fiadoQuitado: p.fiado_quitado, total: p.total || 0, data: p.created_at,
    })) : []),
    ...(tipo !== 'copia' ? (vendas || []).map(v => ({
      origem: 'venda', numero: v.numero_venda, cliente: v.clientes?.nome || v.cliente_nome_pdv || 'Consumidor',
      descricao: 'Venda de produto(s)', pagamento: v.forma_pagamento,
      fiadoQuitado: v.fiado_quitado, total: v.total || 0, data: v.created_at,
    })) : []),
  ];

  if (pagamento !== 'todos') linhas = linhas.filter(l => l.pagamento === pagamento);
  linhas.sort((a, b) => new Date(b.data) - new Date(a.data));
  _ultimoRelatorioVendas = linhas;
  _ultimoRelatorioCaixas = sessoes || [];

  // ── Resumo ──
  const totalGeral = linhas.reduce((a, b) => a + b.total, 0);
  const totalCopia = linhas.filter(l => l.origem === 'copia').reduce((a, b) => a + b.total, 0);
  const totalVenda = linhas.filter(l => l.origem === 'venda').reduce((a, b) => a + b.total, 0);
  const resumoEl = document.getElementById('relatorio-resumo');
  if (resumoEl) {
    resumoEl.innerHTML = `
      <div class="stat-grid" style="margin-bottom:var(--sp-4)">
        <div class="stat-card">
          <div class="stat-card-label">Total no período</div>
          <div class="stat-card-value" style="color:var(--c-accent)">${formatMoney(totalGeral)}</div>
          <div class="stat-card-sub">${linhas.length} transações</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">🖨️ Cópias</div>
          <div class="stat-card-value" style="color:var(--c-primary)">${formatMoney(totalCopia)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">📦 Produtos</div>
          <div class="stat-card-value" style="color:var(--c-success)">${formatMoney(totalVenda)}</div>
        </div>
      </div>
    `;
  }

  // ── Tabela de vendas ──
  const tabelaEl = document.getElementById('relatorio-vendas-tabela');
  if (tabelaEl) {
    tabelaEl.innerHTML = linhas.length === 0
      ? `<div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-sub">Nenhuma transação no período/filtro selecionado</div></div>`
      : `
      <table>
        <thead><tr><th>#</th><th>Origem</th><th>Cliente</th><th>Descrição</th><th>Pagamento</th><th>Total</th><th>Data</th></tr></thead>
        <tbody>
          ${linhas.map(l => `
            <tr>
              <td class="td-mono">#${l.numero ?? '—'}</td>
              <td>${l.origem === 'copia' ? '🖨️ Cópia' : '📦 Produto'}</td>
              <td>${l.cliente}</td>
              <td>${l.descricao}</td>
              <td>
                <span class="badge badge--primary">${l.pagamento ? labelPagamento(l.pagamento) : '—'}</span>
                ${l.pagamento === 'fiado' ? (l.fiadoQuitado ? ' <span class="badge badge--success">Quitado</span>' : ' <span class="badge badge--danger">Pendente</span>') : ''}
              </td>
              <td style="color:var(--c-success);font-weight:600">${formatMoney(l.total)}</td>
              <td class="td-mono">${formatDateTime(l.data)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // ── Tabela de caixas ──
  const caixasEl = document.getElementById('relatorio-caixas-tabela');
  if (caixasEl) {
    caixasEl.innerHTML = (sessoes || []).length === 0
      ? `<div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-sub">Nenhum caixa aberto no período</div></div>`
      : `
      <table>
        <thead><tr><th>Operador</th><th>Abertura</th><th>Fechamento</th><th>Fundo</th><th>Total Cópias</th><th>Total Vendas</th><th>Quebra</th><th>Status</th></tr></thead>
        <tbody>
          ${sessoes.map(s => `
            <tr>
              <td>${s.funcionarios?.nome || '—'}</td>
              <td class="td-mono">${formatDateTime(s.aberto_em)}</td>
              <td class="td-mono">${s.fechado_em ? formatDateTime(s.fechado_em) : '—'}</td>
              <td>${formatMoney(s.valor_abertura)}</td>
              <td style="color:var(--c-primary)">${formatMoney(s.total_copias)}</td>
              <td style="color:var(--c-success)">${formatMoney(s.total_vendas)}</td>
              <td style="color:${(s.quebra||0)>0?'var(--c-success)':(s.quebra||0)<0?'var(--c-danger)':'var(--c-text-3)'}">${formatMoney(s.quebra||0)}</td>
              <td>${s.fechado_em ? '<span class="badge badge--success">Fechado</span>' : '<span class="badge badge--warning">Aberto</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
};

window.exportarRelatorioVendas = function() {
  if (_ultimoRelatorioVendas.length === 0) { toast('Nada para exportar neste filtro', 'warning'); return; }
  const linhas = _ultimoRelatorioVendas.map(l => [
    l.numero ?? '', l.origem === 'copia' ? 'Cópia' : 'Produto', l.cliente, l.descricao,
    l.pagamento ? labelPagamento(l.pagamento).replace(/[^\w\s()À-ú]/g, '').trim() : '',
    l.pagamento === 'fiado' ? (l.fiadoQuitado ? 'Quitado' : 'Pendente') : '',
    l.total, formatDateTime(l.data),
  ]);
  const f = State.relatorioFiltro;
  exportarCSV(`vendas_${f.inicio}_a_${f.fim}.csv`,
    ['#', 'Origem', 'Cliente', 'Descrição', 'Pagamento', 'Status Fiado', 'Total (₲)', 'Data'], linhas);
};

window.exportarRelatorioCaixas = function() {
  if (_ultimoRelatorioCaixas.length === 0) { toast('Nada para exportar neste período', 'warning'); return; }
  const linhas = _ultimoRelatorioCaixas.map(s => [
    s.funcionarios?.nome || '', formatDateTime(s.aberto_em), s.fechado_em ? formatDateTime(s.fechado_em) : '',
    s.valor_abertura, s.total_copias || 0, s.total_vendas || 0, s.valor_conferido ?? '', s.quebra ?? '', s.observacoes || '',
  ]);
  const f = State.relatorioFiltro;
  exportarCSV(`caixas_${f.inicio}_a_${f.fim}.csv`,
    ['Operador', 'Abertura', 'Fechamento', 'Fundo Abertura', 'Total Cópias', 'Total Vendas', 'Valor Conferido', 'Quebra', 'Observações'], linhas);
};

// ============================================================
// ── MÓDULO: FIADO ──────────────────────────────────────────
// ============================================================
// Vendas em fiado contam como venda realizada (produto sai, cópia é
// produzida), mas NÃO como receita — até o cliente pagar. Esta tela
// lista o que está pendente, agrupado por cliente, e permite "Quitar"
// (uma linha ou tudo de um cliente), momento em que o valor passa a
// contar no financeiro (Dashboard/Caixa), usando quitado_em como data.
async function renderFiado(el) {
  const [{ data: vendasFiado }, { data: copiasFiado }] = await Promise.all([
    sb.from('vendas').select('*').eq('forma_pagamento', 'fiado').eq('fiado_quitado', false).eq('status', 'concluido').order('created_at', { ascending: false }),
    sb.from('pedidos_copia').select('*').eq('forma_pagamento', 'fiado').eq('fiado_quitado', false).eq('status', 'concluido').order('created_at', { ascending: false }),
  ]);

  const itens = [
    ...(vendasFiado || []).map(v => ({
      origem: 'venda', id: v.id, cliente: v.cliente_nome_pdv || 'Consumidor',
      descricao: `Venda #${v.numero_venda ?? '—'}`, total: v.total, created_at: v.created_at,
    })),
    ...(copiasFiado || []).map(p => ({
      origem: 'copia', id: p.id, cliente: p.cliente_nome_pdv || 'Consumidor',
      descricao: `Cópia #${p.numero_pedido ?? '—'} · ${labelTipoCopia(p.tipo)} (${p.quantidade})`, total: p.total, created_at: p.created_at,
    })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const totalPendenteGeral = itens.reduce((a, b) => a + (b.total || 0), 0);

  // Agrupa por cliente
  const porCliente = {};
  itens.forEach(i => {
    if (!porCliente[i.cliente]) porCliente[i.cliente] = [];
    porCliente[i.cliente].push(i);
  });
  const clientes = Object.keys(porCliente).sort((a, b) =>
    porCliente[b].reduce((s, i) => s + i.total, 0) - porCliente[a].reduce((s, i) => s + i.total, 0));

  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">📒 Fiado</div>
        <div class="section-sub">Vendas pendentes de pagamento — não entram no financeiro até serem quitadas</div>
      </div>
      <div class="stat-card stat-card--danger" style="padding:var(--sp-3) var(--sp-4)">
        <div class="stat-card-label">Total Pendente</div>
        <div class="stat-card-value" style="font-size:var(--t-xl)">${formatMoney(totalPendenteGeral)}</div>
      </div>
    </div>

    ${clientes.length === 0 ? `
      <div class="card"><div class="card-body"><div class="empty-state" style="padding:var(--sp-8)">
        <div class="empty-state-icon">📒</div>
        <div class="empty-state-sub">Nenhum fiado pendente 🎉</div>
      </div></div></div>
    ` : clientes.map(cliente => {
      const linhas = porCliente[cliente];
      const totalCliente = linhas.reduce((a, b) => a + b.total, 0);
      return `
        <div class="card" style="margin-bottom:var(--sp-4)">
          <div class="card-header">
            <span class="card-title">👤 ${cliente}</span>
            <div style="display:flex;align-items:center;gap:var(--sp-3)">
              <span style="font-weight:700;color:var(--c-danger)">${formatMoney(totalCliente)}</span>
              <button class="btn btn--success btn--sm" onclick="abrirQuitarFiado(null, '${cliente.replace(/'/g,"\\'")}')">✅ Quitar Tudo</button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Descrição</th><th>Valor</th><th>Data</th><th></th></tr></thead>
              <tbody>
                ${linhas.map(i => `
                  <tr>
                    <td>${i.descricao}</td>
                    <td style="color:var(--c-danger);font-weight:600">${formatMoney(i.total)}</td>
                    <td class="td-mono">${formatDateTime(i.created_at)}</td>
                    <td><button class="btn btn--ghost btn--sm" onclick="abrirQuitarFiado({origem:'${i.origem}',id:'${i.id}',total:${i.total}}, '${cliente.replace(/'/g,"\\'")}')">Quitar</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// item = null → quita tudo do cliente; item = {origem,id,total} → quita só essa linha
window.abrirQuitarFiado = function(item, cliente) {
  const total = item ? item.total : null;
  openModal(`✅ Quitar — ${cliente}`, `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="section-sub">${item ? 'Confirma o pagamento desta pendência?' : 'Confirma o pagamento de TODAS as pendências deste cliente?'}</div>
      <div class="field">
        <label>Forma de pagamento recebida agora</label>
        <select class="input" id="quitar-pagamento">
          ${['dinheiro','pix','pix_brl','cartao_debito','cartao_credito','transferencia'].map(p => `<option value="${p}">${labelPagamento(p)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--success btn--lg" style="width:100%;justify-content:center"
        onclick="confirmarQuitarFiado(${item ? `'${item.origem}','${item.id}'` : 'null,null'}, '${cliente.replace(/'/g,"\\'")}')">
        ✅ Confirmar Quitação
      </button>
    </div>
  `);
};

window.confirmarQuitarFiado = async function(origem, id, cliente) {
  const pagamento = document.getElementById('quitar-pagamento')?.value || 'dinheiro';
  const agora = new Date().toISOString();

  try {
    if (origem && id) {
      // Quita só uma linha
      const tabela = origem === 'venda' ? 'vendas' : 'pedidos_copia';
      const { error } = await sb.from(tabela).update({
        fiado_quitado: true, quitado_em: agora, forma_pagamento_quitacao: pagamento,
      }).eq('id', id);
      if (error) throw error;
    } else {
      // Quita tudo do cliente (vendas + cópias). Quando não há nome
      // (mostrado como "Consumidor" na tela), o filtro precisa ser
      // IS NULL — .eq() nunca casa com NULL no Postgres.
      const aplicarFiltroCliente = (query) =>
        cliente === 'Consumidor' ? query.is('cliente_nome_pdv', null) : query.eq('cliente_nome_pdv', cliente);

      const { error: e1 } = await aplicarFiltroCliente(
        sb.from('vendas').update({ fiado_quitado: true, quitado_em: agora, forma_pagamento_quitacao: pagamento })
          .eq('forma_pagamento', 'fiado').eq('fiado_quitado', false)
      );
      if (e1) throw e1;

      const { error: e2 } = await aplicarFiltroCliente(
        sb.from('pedidos_copia').update({ fiado_quitado: true, quitado_em: agora, forma_pagamento_quitacao: pagamento })
          .eq('forma_pagamento', 'fiado').eq('fiado_quitado', false)
      );
      if (e2) throw e2;
    }

    toast('✅ Fiado quitado! Já entra no financeiro de hoje.', 'success');
    closeModal();
    navigate('fiado');
  } catch (err) {
    toast('Erro ao quitar: ' + err.message, 'error');
  }
};

// ============================================================
// ── MÓDULO: ESTOQUE ───────────────────────────────────────
// ============================================================
async function renderEstoque(el) {
  const { data: produtosRaw } = await sb.from('produtos')
    .select('*, fornecedores(nome)')
    .order('nome');

  // Produtos "excluídos" viram inativos (ativo=false) e somem da lista,
  // mas continuam no banco para não quebrar vínculos com vendas/insumos.
  const produtos = (produtosRaw || []).filter(p => p.ativo !== false);

  // Funcionário pode VER itens de tipo Insumo (e "Ambos"), mas não pode
  // editar/ajustar/compor esses itens — apenas administradores. Itens
  // puramente "Produto" continuam liberados para edição por funcionário.
  const isFuncionario = State.userProfile?.role === 'funcionario';
  const isAdmin = State.userProfile?.role === 'admin' || State.userProfile?.role === 'adminMaster';
  const ehInsumoOuAmbos = (p) => p.tipo === 'insumo' || p.tipo === 'ambos';

  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Estoque de Produtos</div>
        <div class="section-sub">Papéis, toneres, tintas e materiais</div>
      </div>
      <div style="display:flex;gap:var(--sp-2)">
        <button class="btn btn--ghost" onclick="abrirGeradorEtiquetas()">🏷️ Gerar Etiquetas</button>
        <button class="btn btn--primary" onclick="abrirModalProduto()">+ Cadastrar Produto</button>
      </div>
    </div>

    <!-- ABAS DE FILTRO -->
    <div class="tabs" style="margin-bottom:var(--sp-4);">
      <button class="tab-btn active" data-tipo="todos" onclick="filtrarEstoquePorTipo('todos', this)">Todos</button>
      <button class="tab-btn" data-tipo="produto" onclick="filtrarEstoquePorTipo('produto', this)">Produtos</button>
      <button class="tab-btn" data-tipo="insumo" onclick="filtrarEstoquePorTipo('insumo', this)">Insumos</button>
      <button class="tab-btn" data-tipo="folha" onclick="filtrarEstoquePorTipo('folha', this)">📄 Folhas</button>
    </div>

    <div class="card" style="margin-bottom:var(--sp-4); height: auto;">
      <div class="card-body" style="padding:var(--sp-3) var(--sp-5)">
        <div class="search-bar">
          <span class="search-bar-icon">🔍</span>
          <input type="text" class="input" placeholder="Buscar produto..." id="busca-produto"
                 oninput="filtrarTabelaProdutos(this.value)" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table id="tabela-produtos">
          <thead>
            <tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Mín.</th><th>Venda</th><th>Custo</th><th>Fornecedor</th><th></th></tr>
          </thead>
          <tbody>
            ${(produtos||[]).map(p => `
  <tr data-tipo="${p.tipo || 'produto'}" data-usado-impressao="${p.usado_na_impressao || false}">
    <td style="font-weight:500">${p.nome}${p.tipo === 'ambos' ? '<span class="badge badge--accent" title="Vendido no balcão e também consumido como insumo">🔁 Ambos</span>' : ''}${p.usado_na_impressao ? '<span class="badge badge--accent">📄 Folha</span>' : ''}</td>
    <td><span class="badge badge--primary">${p.categoria}</span></td>
    <td>
      <span style="font-family:var(--font-mono);font-weight:600;color:${p.estoque_atual <= p.estoque_minimo ? 'var(--c-danger)' : 'var(--c-success)'}">
        ${p.estoque_atual} ${p.unidade}
      </span>
      ${p.estoque_atual <= p.estoque_minimo ? '<span class="badge badge--danger" style="margin-left:4px">Crítico</span>' : ''}
    </td>
    <td class="td-mono">${p.estoque_minimo} ${p.unidade}</td>
    <td style="color:var(--c-accent);font-weight:600">${formatMoney(p.preco_venda)}</td>
    <td class="td-mono">${formatMoney(p.preco_custo)}</td>
    <td style="color:var(--c-text-3)">${p.fornecedores?.nome||'—'}</td>
    <td>
      ${(ehInsumoOuAmbos(p) && isFuncionario) ? `
        <span class="badge" style="color:var(--c-text-3)" title="Apenas administradores podem editar insumos">🔒 Somente visualização</span>
      ` : `
      <div style="display:flex;gap:4px">
        <button class="btn btn--ghost btn--sm" onclick="editarProduto('${p.id}')">✏️</button>
        <button class="btn btn--ghost btn--sm" onclick="ajusteEstoque('${p.id}','${p.nome.replace(/'/g,"\\'")}',${p.estoque_atual},'${p.unidade}','${p.tipo||'produto'}')">±</button>
        <button class="btn btn--ghost btn--sm" onclick="gerenciarComposicao('${p.id}','${p.nome.replace(/'/g,"\\'")}','${p.tipo||'produto'}')" title="Gerenciar insumos">🧩</button>
        ${isAdmin ? `<button class="btn btn--ghost btn--sm" style="color:var(--c-danger)" onclick="excluirProduto('${p.id}','${p.nome.replace(/'/g,"\\'")}')" title="Excluir">🗑️</button>` : ''}
      </div>
      `}
    </td>
  </tr>
`).join('') || '<tr><td colspan="8"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-icon">📦</div><div class="empty-state-sub">Nenhum produto cadastrado</div></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Adiciona a função de filtro por tipo
  window.filtrarEstoquePorTipo = function(tipo, btn) {
  // Atualiza classe ativa das abas
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Filtra as linhas da tabela
  document.querySelectorAll('#tabela-produtos tbody tr').forEach(tr => {
    if (tipo === 'todos') {
      tr.style.display = '';
    } else if (tipo === 'folha') {
      const usadoNaImpressao = tr.dataset.usadoImpressao === 'true';
      tr.style.display = usadoNaImpressao ? '' : 'none';
    } else {
      // Itens "ambos" contam nas duas abas: Produtos E Insumos
      const tipoProduto = tr.dataset.tipo || 'produto';
      tr.style.display = (tipoProduto === tipo || tipoProduto === 'ambos') ? '' : 'none';
    }
  });
};

  // Inicializa com a aba 'Todos' ativa (já está ativa por padrão)
}

// ============================================================
// ── MÓDULO: CAIXA (UI MELHORADA E CORRIGIDA) ─────────────
// ============================================================

window.verVenda = async function(vendaId) {
  // Busca dados da venda e itens
  const { data: venda, error: errVenda } = await sb.from('vendas')
    .select('*, clientes(nome)')
    .eq('id', vendaId)
    .single();

  if (errVenda || !venda) {
    toast('Venda não encontrada', 'error');
    return;
  }

  const { data: itens, error: errItens } = await sb.from('venda_itens')
    .select('*, produtos(nome, unidade)')
    .eq('venda_id', vendaId);

  if (errItens) {
    toast('Erro ao carregar itens', 'error');
    return;
  }

  // Abre modal com detalhes
  openModal(`Venda #${venda.numero_venda}`, `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="display:flex;justify-content:space-between">
        <div>
          <div style="color:var(--c-text-3)">Cliente</div>
          <div style="font-weight:700">${venda.clientes?.nome || 'Consumidor'}</div>
        </div>
        <div>
          <div style="color:var(--c-text-3)">Data</div>
          <div>${formatDateTime(venda.created_at)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <div>
          <div style="color:var(--c-text-3)">Pagamento</div>
          <div>${labelPagamento(venda.forma_pagamento)}</div>
          ${venda.forma_pagamento === 'pix_brl' && venda.valor_brl ? `<div style="font-size:var(--t-xs);color:var(--c-text-3)">🇧🇷 R$ ${venda.valor_brl.toFixed(2)} @ ₲${venda.cotacao_brl?.toLocaleString('es-PY')}/R$</div>` : ''}
        </div>
        <div>
          <div style="color:var(--c-text-3)">Total</div>
          <div style="font-size:var(--t-xl);font-weight:700;color:var(--c-success)">${formatMoney(venda.total)}</div>
        </div>
      </div>
      <div class="divider-text">Itens</div>
      ${(itens||[]).map(item => `
        <div style="display:flex;justify-content:space-between;padding:var(--sp-2) 0;border-bottom:1px solid var(--c-border)">
          <span>${item.produtos?.nome || '—'} × ${item.quantidade}</span>
          <span style="font-weight:600">${formatMoney(item.total)}</span>
        </div>
      `).join('') || '<div style="color:var(--c-text-3)">Nenhum item</div>'}
    </div>
  `, 'modal--lg');
};

window.filtrarTabelaProdutos = debounce(function(q) {
  document.querySelectorAll('#tabela-produtos tbody tr').forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}, 200);

// ============================================================
// ── GERADOR DE ETIQUETAS DE CÓDIGO DE BARRAS ──────────────
// ============================================================
// Usa a biblioteca JsBarcode (carregada via CDN no index.html) para
// desenhar códigos Code128 em SVG. Gera uma folha de etiquetas
// pronta para impressão (window.print), respeitando o layout de
// etiqueta configurado (padrão 40mm × 25mm, 3 colunas).
window.abrirGeradorEtiquetas = async function() {
  const { data: produtos } = await sb.from('produtos')
    .select('id, nome, codigo_barras, preco_venda')
    .eq('ativo', true)
    .order('nome');

  const comCodigo = (produtos || []).filter(p => p.codigo_barras);
  const semCodigo = (produtos || []).filter(p => !p.codigo_barras);

  openModal('🏷️ Gerador de Etiquetas', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="section-sub">Selecione os produtos e a quantidade de etiquetas de cada um. Produtos sem código de barras cadastrado não aparecem aqui — cadastre o código em "Editar Produto".</div>
      <div class="search-bar">
        <span class="search-bar-icon">🔍</span>
        <input type="text" class="input" placeholder="Buscar produto..." oninput="filtrarEtiquetasLista(this.value)" />
      </div>
      <div id="etiquetas-lista" style="max-height:280px;overflow-y:auto;border:1px solid var(--c-border);border-radius:var(--r-md)">
        ${comCodigo.map(p => `
          <div class="pdv-item" data-nome="${p.nome.toLowerCase()}" style="padding:var(--sp-2) var(--sp-3)">
            <div class="pdv-item-info">
              <div class="pdv-item-name">${p.nome}</div>
              <div class="pdv-item-sub td-mono">${p.codigo_barras} · ${formatMoney(p.preco_venda||0)}</div>
            </div>
            <input type="number" class="input etiqueta-qtd" data-id="${p.id}" data-nome="${p.nome.replace(/"/g,'&quot;')}"
                   data-codigo="${p.codigo_barras}" data-preco="${p.preco_venda||0}"
                   value="0" min="0" style="width:70px" />
          </div>
        `).join('') || '<div class="empty-state" style="padding:var(--sp-6)"><div class="empty-state-sub">Nenhum produto com código de barras cadastrado</div></div>'}
      </div>
      ${semCodigo.length > 0 ? `<div style="font-size:var(--t-xs);color:var(--c-text-3)">⚠️ ${semCodigo.length} produto(s) sem código de barras não listado(s).</div>` : ''}
      <label style="display:flex;align-items:center;gap:var(--sp-3);cursor:pointer">
        <input type="checkbox" id="etiqueta-mostrar-preco" checked> <span>Mostrar preço na etiqueta</span>
      </label>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="gerarFolhaEtiquetas()">
        🖨️ Gerar e Imprimir Etiquetas
      </button>
    </div>
  `, 'modal--lg');
};

window.filtrarEtiquetasLista = function(q) {
  document.querySelectorAll('#etiquetas-lista .pdv-item').forEach(el => {
    el.style.display = (el.dataset.nome || '').includes(q.toLowerCase()) ? '' : 'none';
  });
};

window.toggleCampoImpressao = function() {
  // const tipo = document.getElementById('prod-tipo').value;
  // const campo = document.getElementById('campo-usado-impressao');
  // if (campo) campo.style.display = tipo === 'insumo' ? '' : 'none';
};

window.gerarFolhaEtiquetas = function() {
  if (typeof JsBarcode === 'undefined') {
    toast('Biblioteca de código de barras não carregou. Verifique sua conexão.', 'error');
    return;
  }

  const mostrarPreco = document.getElementById('etiqueta-mostrar-preco')?.checked;
  const linhas = [];
  document.querySelectorAll('.etiqueta-qtd').forEach(input => {
    const qtd = parseInt(input.value) || 0;
    if (qtd <= 0) return;
    for (let i = 0; i < qtd; i++) {
      linhas.push({ nome: input.dataset.nome, codigo: input.dataset.codigo, preco: parseFloat(input.dataset.preco) || 0 });
    }
  });

  if (linhas.length === 0) { toast('Informe a quantidade de pelo menos um produto', 'warning'); return; }
  if (linhas.length > 300) { toast('Máximo de 300 etiquetas por folha. Gere em lotes menores.', 'warning'); return; }

  const janela = window.open('', '_blank', 'width=900,height=700');
  if (!janela) { toast('Permita pop-ups para gerar as etiquetas', 'warning'); return; }

  janela.document.write(`
    <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquetas</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 8mm; font-family: Arial, sans-serif; }
      .folha { display: flex; flex-wrap: wrap; gap: 2mm; }
      .etiqueta {
        width: 40mm; height: 25mm; border: 1px dashed #ccc;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 1mm; overflow: hidden; page-break-inside: avoid;
      }
      .etiqueta .nome { font-size: 7.5px; font-weight: 700; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .etiqueta .preco { font-size: 9px; font-weight: 700; margin-top: 1mm; }
      svg { max-width: 100%; height: 12mm; }
      @media print { .etiqueta { border: none; } }
    </style>
    </head><body>
      <div class="folha" id="folha"></div>
    </body></html>
  `);
  janela.document.close();

  const folha = janela.document.getElementById('folha');
  linhas.forEach((item, idx) => {
    const div = janela.document.createElement('div');
    div.className = 'etiqueta';
    const nomeDiv = janela.document.createElement('div');
    nomeDiv.className = 'nome';
    nomeDiv.textContent = item.nome;
    const svg = janela.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', `barcode-${idx}`);
    div.appendChild(nomeDiv);
    div.appendChild(svg);
    if (mostrarPreco) {
      const precoDiv = janela.document.createElement('div');
      precoDiv.className = 'preco';
      precoDiv.textContent = formatMoney(item.preco);
      div.appendChild(precoDiv);
    }
    folha.appendChild(div);
    try {
      JsBarcode(svg, item.codigo, { format: 'CODE128', width: 1.3, height: 30, displayValue: true, fontSize: 9, margin: 0 });
    } catch (e) {
      nomeDiv.textContent += ' (código inválido)';
    }
  });

  setTimeout(() => { janela.focus(); janela.print(); }, 300);
};

window.abrirModalProduto = async function(produtoId) {
  const { data: fornecedores } = await sb.from('fornecedores').select('id,nome').eq('ativo',true).order('nome');
  let p = {};
  if (produtoId) {
    const { data } = await sb.from('produtos').select('*').eq('id',produtoId).single();
    p = data || {};
    if ((p.tipo === 'insumo' || p.tipo === 'ambos') && State.userProfile?.role === 'funcionario') {
      toast('Apenas administradores podem editar insumos.', 'warning');
      return;
    }
  }

  openModal(produtoId ? 'Editar Produto' : 'Novo Produto', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="form-row form-row--2">
        <div class="field"><label>Nome *</label><input type="text" class="input" id="prod-nome" value="${p.nome||''}" placeholder="Ex: Papel A4 500fls" /></div>
        <div class="field"><label>Código de Barras</label><input type="text" class="input" id="prod-barras" value="${p.codigo_barras||''}" placeholder="EAN-13..." /></div>
      </div>
      <div class="field">
        <label>Tipo</label>
        <select class="input" id="prod-tipo" onchange="toggleCampoImpressao()">
          <option value="produto" ${(!p.tipo || p.tipo==='produto')?'selected':''}>Produto (venda)</option>
          <option value="insumo" ${p.tipo==='insumo'?'selected':''}>Insumo (consumo)</option>
          <option value="ambos" ${p.tipo==='ambos'?'selected':''}>Ambos (vendido e também consumido como insumo)</option>
        </select>
        <div style="font-size:var(--t-xs);color:var(--c-text-3);margin-top:4px">
          "Ambos" é para itens como papel A4: você vende avulso no balcão e também usa o mesmo estoque para imprimir/produzir. Um único saldo de estoque para as duas coisas.
        </div>
        <div class="field" id="campo-usado-impressao" style="display:block"}">
          <label style="display:flex;align-items:center;gap:var(--sp-3);cursor:pointer;padding:9px 12px;border:1.5px solid var(--c-border);border-radius:var(--r-md);background:var(--c-bg)">
            <input type="checkbox" id="prod-usado-impressao" ${p.usado_na_impressao ? 'checked' : ''}>
            <span>Este item pode ser usado como <strong>folha</strong> nas impressões (ex: papel A4, ofício, adesivo)</span>
          </label>
        </div>
      </div>
      <div class="form-row form-row--3">
        <div class="field"><label>Categoria</label>
          <select class="input" id="prod-categoria">
            ${['papel','toner','tinta','encadernacao','plastificacao','material_escritorio','escolar','limpeza','outros'].map(c=>`<option value="${c}" ${p.categoria===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Unidade</label><input type="text" class="input" id="prod-unidade" value="${p.unidade||'un'}" placeholder="un, kg, cx..." /></div>
        <div class="field"><label>Fornecedor</label>
          <select class="input" id="prod-fornecedor">
            <option value="">— Nenhum —</option>
            ${(fornecedores||[]).map(f=>`<option value="${f.id}" ${p.fornecedor_id===f.id?'selected':''}>${f.nome}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row form-row--2">
        <div class="field"><label>Preço de Venda</label><input type="number" class="input" id="prod-venda" value="${p.preco_venda||''}" step="0.01" min="0" placeholder="0,00" /></div>
        <div class="field"><label>Preço de Custo</label><input type="number" class="input" id="prod-custo" value="${p.preco_custo||''}" step="0.01" min="0" placeholder="0,00" /></div>
      </div>
      <div class="form-row form-row--2">
        <div class="field">
          <label>💳 Preço no Cartão (opcional)</label>
          <input type="number" class="input" id="prod-preco-cartao" value="${p.preco_cartao||''}" step="0.01" min="0" placeholder="Deixe vazio para usar o preço normal" />
          <div style="font-size:var(--t-xs);color:var(--c-text-3)">Valor fixo cobrado quando o pagamento for em cartão (débito ou crédito).</div>
        </div>
      </div>
      <div class="form-row form-row--2">
        <div class="field"><label>Estoque Atual</label><input type="number" class="input" id="prod-estoque" value="${p.estoque_atual||0}" step="0.001" /></div>
        <div class="field"><label>Estoque Mínimo</label><input type="number" class="input" id="prod-estoque-min" value="${p.estoque_minimo||0}" step="0.001" /></div>
      </div>
      <div class="field"><label>Descrição</label><textarea class="input" id="prod-desc" rows="2">${p.descricao||''}</textarea></div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarProduto('${produtoId||''}')">
        💾 Salvar Produto
      </button>
    </div>
  `, 'modal--lg');
};

window.gerenciarComposicao = async function(produtoId, nomeProduto, tipo = 'produto') {
  if ((tipo === 'insumo' || tipo === 'ambos') && State.userProfile?.role === 'funcionario') {
    toast('Apenas administradores podem editar insumos.', 'warning');
    return;
  }
  // Busca insumos já vinculados
  const { data: vinculos } = await sb.from('produto_insumos')
    .select('*, insumos:insumo_id(id, nome, unidade, estoque_atual)')
    .eq('produto_id', produtoId);

  // Busca todos os insumos cadastrados (inclui itens "ambos", que também são consumíveis)
  const { data: insumos } = await sb.from('produtos')
    .select('id, nome, unidade, estoque_atual')
    .in('tipo', ['insumo', 'ambos'])
    .order('nome');

  openModal(`Composição de "${nomeProduto}"`, `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="font-size:var(--t-sm);color:var(--c-text-3)">Informe quais insumos são consumidos para produzir 1 unidade deste produto.</div>
      <div id="lista-vinculos" style="display:flex;flex-direction:column;gap:var(--sp-2)">
        ${(vinculos||[]).map(v => `
          <div style="display:flex;align-items:center;gap:var(--sp-3);background:var(--c-bg);padding:var(--sp-3);border-radius:var(--r-md)">
            <span style="flex:1">${v.insumos.nome}</span>
            <input type="number" class="input" id="qtd-${v.insumo_id}" value="${v.quantidade}" step="0.1" min="0.001" style="width:80px" />
            <span>por unidade</span>
            <button class="pdv-remove-btn" onclick="removerInsumoVinculo('${v.id}','${produtoId}')">✕</button>
          </div>
        `).join('') || '<div style="color:var(--c-text-3);font-size:var(--t-xs)">Nenhum insumo vinculado ainda.</div>'}
      </div>
      <div style="display:flex;gap:var(--sp-2);align-items:center">
        <select class="input" id="novo-insumo-id" style="flex:1">
          <option value="">— Adicionar insumo —</option>
          ${(insumos||[]).map(i => `<option value="${i.id}">${i.nome} (${i.unidade}) – Estoque: ${i.estoque_atual}</option>`).join('')}
        </select>
        <button class="btn btn--ghost" onclick="adicionarInsumoVinculo('${produtoId}')">+ Adicionar</button>
      </div>
      <button class="btn btn--primary" onclick="salvarVinculos('${produtoId}')">💾 Salvar Composição</button>
    </div>
  `, 'modal--lg');
};

window.removerInsumoVinculo = async function(vinculoId, produtoId) {
  if (!confirm('Remover este insumo da composição?')) return;
  await sb.from('produto_insumos').delete().eq('id', vinculoId);
  toast('Insumo removido', 'info');
  gerenciarComposicao(produtoId);
};

window.adicionarInsumoVinculo = function(produtoId) {
  const insumoId = document.getElementById('novo-insumo-id').value;
  if (!insumoId) { toast('Selecione um insumo', 'warning'); return; }
  // apenas adiciona na interface; o salvamento será feito em lote
  // Busca o nome do insumo para exibir
  const select = document.getElementById('novo-insumo-id');
  const nome = select.options[select.selectedIndex].text;
  const lista = document.getElementById('lista-vinculos');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;gap:var(--sp-3);background:var(--c-bg);padding:var(--sp-3);border-radius:var(--r-md)';
  div.dataset.insumoId = insumoId;
  div.innerHTML = `
    <span style="flex:1">${nome}</span>
    <input type="number" class="input" id="qtd-${insumoId}" value="1" step="0.1" min="0.001" style="width:80px" />
    <span>por unidade</span>
    <button class="pdv-remove-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  lista.appendChild(div);
  // Limpa o select
  select.value = '';
};

window.salvarVinculos = async function(produtoId) {
  // Coleta todos os pares (insumo_id, quantidade) da interface
  const itens = [];
  document.querySelectorAll('#lista-vinculos > div').forEach(div => {
    const insumoId = div.dataset.insumoId || div.querySelector('input[type="number"]')?.id?.replace('qtd-', '');
    if (!insumoId) return;
    const qtd = parseFloat(div.querySelector('input[type="number"]')?.value || 0);
    if (qtd > 0) {
      itens.push({ insumo_id: insumoId, quantidade: qtd });
    }
  });

  // Para cada item, verifica se já existe vínculo, se sim atualiza, senão insere
  for (const item of itens) {
    const { data: existing } = await sb.from('produto_insumos')
      .select('id')
      .eq('produto_id', produtoId)
      .eq('insumo_id', item.insumo_id)
      .maybeSingle();
    if (existing) {
      await sb.from('produto_insumos')
        .update({ quantidade: item.quantidade })
        .eq('id', existing.id);
    } else {
      await sb.from('produto_insumos')
        .insert({ produto_id: produtoId, insumo_id: item.insumo_id, quantidade: item.quantidade });
    }
  }

  // Remove vínculos que não estão mais na lista (opcional, mas pode ser feito)
  // Vamos simplesmente recarregar a tela.
  toast('Composição salva!', 'success');
  closeModal();
  // Recarregar a página de estoque para atualizar a listagem
  navigate('estoque');
};

window.editarProduto = function(id) { abrirModalProduto(id); };

// ── Composição de insumos por TIPO DE CÓPIA (papel, toner, etc.) ──
// Consumo é definido "por folha impressa" e é baixado do estoque na
// conferência/entrega (confirmarConferencia), quando sabemos a quantidade
// real de folhas usadas.
window.gerenciarInsumosCopia = async function(tipoCopia, descricao) {
  const { data: vinculos } = await sb.from('copia_insumos')
    .select('*, insumos:insumo_id(id, nome, unidade, estoque_atual)')
    .eq('tipo_copia', tipoCopia);

  const { data: insumos } = await sb.from('produtos')
    .select('id, nome, unidade, estoque_atual')
    .in('tipo', ['insumo', 'ambos'])
    .eq('usado_na_impressao', false)
    .order('nome');

  openModal(`Insumos de "${descricao}"`, `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="font-size:var(--t-sm);color:var(--c-text-3)">Informe quantos de cada insumo são consumidos por <strong>folha impressa</strong> deste tipo de cópia.</div>
      <div id="lista-vinculos-copia" style="display:flex;flex-direction:column;gap:var(--sp-2)">
        ${(vinculos||[]).map(v => `
          <div style="display:flex;align-items:center;gap:var(--sp-3);background:var(--c-bg);padding:var(--sp-3);border-radius:var(--r-md)">
            <span style="flex:1">${v.insumos.nome}</span>
            <input type="number" class="input" id="qtd-copia-${v.insumo_id}" value="${v.quantidade}" step="0.01" min="0.001" style="width:80px" />
            <span>por folha</span>
            <button class="pdv-remove-btn" onclick="removerInsumoVinculoCopia('${v.id}','${tipoCopia}','${descricao.replace(/'/g,"\\'")}')">✕</button>
          </div>
        `).join('') || '<div style="color:var(--c-text-3);font-size:var(--t-xs)">Nenhum insumo vinculado ainda.</div>'}
      </div>
      <div style="display:flex;gap:var(--sp-2);align-items:center">
        <select class="input" id="novo-insumo-copia-id" style="flex:1">
          <option value="">— Adicionar insumo —</option>
          ${(insumos||[]).map(i => `<option value="${i.id}">${i.nome} (${i.unidade}) – Estoque: ${i.estoque_atual}</option>`).join('')}
        </select>
        <button class="btn btn--ghost" onclick="adicionarInsumoVinculoCopia()">+ Adicionar</button>
      </div>
      <button class="btn btn--primary" onclick="salvarVinculosCopia('${tipoCopia}')">💾 Salvar</button>
    </div>
  `, 'modal--lg');
};

window.removerInsumoVinculoCopia = async function(vinculoId, tipoCopia, descricao) {
  if (!confirm('Remover este insumo do tipo de cópia?')) return;
  await sb.from('copia_insumos').delete().eq('id', vinculoId);
  toast('Insumo removido', 'info');
  gerenciarInsumosCopia(tipoCopia, descricao);
};

window.adicionarInsumoVinculoCopia = function() {
  const select = document.getElementById('novo-insumo-copia-id');
  const insumoId = select.value;
  if (!insumoId) { toast('Selecione um insumo', 'warning'); return; }
  const nome = select.options[select.selectedIndex].text;
  const lista = document.getElementById('lista-vinculos-copia');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;gap:var(--sp-3);background:var(--c-bg);padding:var(--sp-3);border-radius:var(--r-md)';
  div.dataset.insumoId = insumoId;
  div.innerHTML = `
    <span style="flex:1">${nome}</span>
    <input type="number" class="input" id="qtd-copia-${insumoId}" value="1" step="0.01" min="0.001" style="width:80px" />
    <span>por folha</span>
    <button class="pdv-remove-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  lista.appendChild(div);
  select.value = '';
};

window.salvarVinculosCopia = async function(tipoCopia) {
  const itens = [];
  document.querySelectorAll('#lista-vinculos-copia > div').forEach(div => {
    const insumoId = div.dataset.insumoId || div.querySelector('input[type="number"]')?.id?.replace('qtd-copia-', '');
    if (!insumoId) return;
    const qtd = parseFloat(div.querySelector('input[type="number"]')?.value || 0);
    if (qtd > 0) itens.push({ insumo_id: insumoId, quantidade: qtd });
  });

  for (const item of itens) {
    const { data: existing } = await sb.from('copia_insumos')
      .select('id')
      .eq('tipo_copia', tipoCopia)
      .eq('insumo_id', item.insumo_id)
      .maybeSingle();
    if (existing) {
      await sb.from('copia_insumos').update({ quantidade: item.quantidade }).eq('id', existing.id);
    } else {
      await sb.from('copia_insumos').insert({ tipo_copia: tipoCopia, insumo_id: item.insumo_id, quantidade: item.quantidade });
    }
  }
  toast('Insumos da cópia salvos!', 'success');
  closeModal();
  navigate('precos');
};


// excluirProduto(): exclusão "suave" — marca o produto como inativo
// (ativo=false) em vez de apagar de verdade. Produtos podem estar
// vinculados a vendas, insumos de outros produtos ou pedidos de cópia
// antigos; um DELETE de verdade quebraria essas referências (foreign key)
// e apagaria histórico. Assim, o produto some da lista de Estoque mas o
// histórico continua íntegro.
window.excluirProduto = async function(id, nome) {
  if (!confirm(`Excluir "${nome}"? Ele deixará de aparecer no estoque, mas o histórico de vendas/produção será preservado.`)) return;
  const { error } = await sb.from('produtos').update({ ativo: false }).eq('id', id);
  if (error) { toast(mensagemErroAmigavel(error, 'excluir produto'), 'error'); return; }
  await registrarLog('excluir', 'produto', id, { nome });
  toast('Produto excluído!', 'success');
  navigate('estoque');
};

window.salvarProduto = async function(id) {
  const payload = {
    nome: document.getElementById('prod-nome').value.trim(),
    codigo_barras: document.getElementById('prod-barras').value||null,
    categoria: document.getElementById('prod-categoria').value,
    unidade: document.getElementById('prod-unidade').value||'un',
    fornecedor_id: document.getElementById('prod-fornecedor').value||null,
    preco_venda: parseFloat(document.getElementById('prod-venda').value)||null,
    preco_custo: parseFloat(document.getElementById('prod-custo').value)||null,
    preco_cartao: parseFloat(document.getElementById('prod-preco-cartao').value)||null,
    estoque_atual: parseFloat(document.getElementById('prod-estoque').value)||0,
    estoque_minimo: parseFloat(document.getElementById('prod-estoque-min').value)||0,
    descricao: document.getElementById('prod-desc').value||null,
    tipo: document.getElementById('prod-tipo').value,
    usado_na_impressao: document.getElementById('prod-usado-impressao')?.checked || false,
  };
  if (!payload.nome) { toast('Nome obrigatório','warning'); return; }
  const { error } = id
    ? await sb.from('produtos').update(payload).eq('id',id)
    : await sb.from('produtos').insert(payload);
  if (error) { toast('Erro: '+error.message,'error'); return; }
  toast('Produto salvo!','success');
  closeModal();
  navigate('estoque');
};

async function renderProducao(el) {
  // Busca todos os produtos finais (tipo = 'produto' ou 'ambos')
  const { data: produtos } = await sb.from('produtos')
    .select('id, nome, estoque_atual, unidade')
    .in('tipo', ['produto', 'ambos'])
    .order('nome');

  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">🏭 Produção para Estoque</div>
        <div class="section-sub">Registre a produção de produtos finais, consumindo insumos automaticamente.</div>
      </div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="form-row form-row--2" style="align-items:end">
          <div class="field">
            <label>Produto a produzir *</label>
            <select class="input" id="producao-produto">
              <option value="">— Selecione —</option>
              ${(produtos||[]).map(p => `<option value="${p.id}">${p.nome} (Estoque atual: ${p.estoque_atual} ${p.unidade})</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Quantidade *</label>
            <input type="number" class="input" id="producao-qtd" min="1" value="1" />
          </div>
        </div>
        <div style="margin-top:var(--sp-4)">
          <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="confirmarProducao()">
            🏭 Produzir e Baixar Insumos
          </button>
        </div>
        <div id="preview-producao" style="margin-top:var(--sp-4)"></div>
      </div>
    </div>
    <div class="card" style="margin-top:var(--sp-4)">
      <div class="card-header"><span class="card-title">Histórico de Produções</span></div>
      <div class="table-wrap" id="tabela-producoes">
        <table>
          <thead><tr><th>Produto</th><th>Quantidade</th><th>Data</th><th>Observações</th></tr></thead>
          <tbody id="tbody-producoes">
            <tr><td colspan="4"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-sub">Carregando...</div></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Carrega histórico
  await carregarHistoricoProducao();

  // Preview quando selecionar produto
  document.getElementById('producao-produto')?.addEventListener('change', previewProducao);
}

async function carregarHistoricoProducao() {
  const { data: producoes } = await sb.from('producoes')
    .select('*, produtos(nome)')
    .order('data_producao', { ascending: false })
    .limit(20);

  const tbody = document.getElementById('tbody-producoes');
  if (!tbody) return;
  if (!producoes || producoes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-sub">Nenhuma produção registrada ainda</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = producoes.map(p => `
    <tr>
      <td>${p.produtos?.nome || '—'}</td>
      <td>${p.quantidade_produzida}</td>
      <td class="td-mono">${formatDate(p.data_producao)}</td>
      <td>${p.observacoes || '—'}</td>
    </tr>
  `).join('');
}

window.previewProducao = async function() {
  const produtoId = document.getElementById('producao-produto').value;
  const qtd = parseInt(document.getElementById('producao-qtd').value) || 1;
  const preview = document.getElementById('preview-producao');
  if (!produtoId) { preview.innerHTML = ''; return; }

  // Busca insumos da composição
  const { data: vinculos } = await sb.from('produto_insumos')
    .select('*, insumos:insumo_id(id, nome, unidade, estoque_atual)')
    .eq('produto_id', produtoId);

  if (!vinculos || vinculos.length === 0) {
    preview.innerHTML = `<div style="color:var(--c-warning)">⚠️ Este produto não possui insumos cadastrados. Nenhum consumo será registrado.</div>`;
    return;
  }

  // Calcula consumo total
  let html = `<div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
    <div style="font-weight:600;margin-bottom:var(--sp-3)">📦 Consumo de insumos para ${qtd} unidade(s):</div>
    <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--sp-2)">`;
  let podeProduzir = true;
  vinculos.forEach(v => {
    const total = v.quantidade * qtd;
    const estoque = v.insumos?.estoque_atual || 0;
    const suficiente = estoque >= total;
    if (!suficiente) podeProduzir = false;
    html += `<li style="display:flex;justify-content:space-between;padding:var(--sp-2) var(--sp-3);background:${suficiente ? 'var(--c-success-s)' : 'var(--c-danger-s)'};border-radius:var(--r-sm)">
      <span>${v.insumos?.nome || '—'} (${v.insumos?.unidade || 'un'})</span>
      <span>${total} <span style="color:${suficiente ? 'var(--c-success)' : 'var(--c-danger)'}">${suficiente ? '✅' : '❌ falta ' + (total - estoque)}</span></span>
    </li>`;
  });
  html += `</ul>
    ${podeProduzir ? `<div style="margin-top:var(--sp-3);color:var(--c-success)">✅ Todos os insumos estão disponíveis.</div>` :
                    `<div style="margin-top:var(--sp-3);color:var(--c-danger)">⚠️ Estoque insuficiente para alguns insumos. Produção não permitida.</div>`}
  </div>`;
  preview.innerHTML = html;
  preview.dataset.podeProduzir = podeProduzir ? 'true' : 'false';
};

window.confirmarProducao = async function() {
  const produtoId = document.getElementById('producao-produto').value;
  const qtd = parseInt(document.getElementById('producao-qtd').value) || 1;
  if (!produtoId) { toast('Selecione um produto', 'warning'); return; }
  if (qtd < 1) { toast('Quantidade inválida', 'warning'); return; }

  const preview = document.getElementById('preview-producao');
  if (preview.dataset.podeProduzir !== 'true') {
    toast('Verifique o preview: insumos insuficientes.', 'error');
    return;
  }

  if (!confirm(`Produzir ${qtd} unidade(s) deste produto? Os insumos serão baixados do estoque.`)) return;

  try {
    // 1. Buscar insumos
    const { data: vinculos } = await sb.from('produto_insumos')
      .select('*, insumos:insumo_id(id, estoque_atual)')
      .eq('produto_id', produtoId);

    if (!vinculos || vinculos.length === 0) {
      toast('Este produto não tem insumos. Produção cancelada.', 'warning');
      return;
    }

    // 2. Baixar insumos (atualizar estoque)
    for (const v of vinculos) {
      const total = v.quantidade * qtd;
      const novoEstoque = v.insumos.estoque_atual - total;
      if (novoEstoque < 0) throw new Error(`Estoque insuficiente de ${v.insumos.nome}`);
      await sb.from('produtos')
        .update({ estoque_atual: novoEstoque })
        .eq('id', v.insumo_id);
    }

    // 3. Aumentar estoque do produto final
    const { data: prod } = await sb.from('produtos')
      .select('estoque_atual')
      .eq('id', produtoId)
      .single();
    await sb.from('produtos')
      .update({ estoque_atual: (prod.estoque_atual || 0) + qtd })
      .eq('id', produtoId);

    // 4. Registrar produção
    await sb.from('producoes').insert({
      produto_id: produtoId,
      quantidade_produzida: qtd,
      observacoes: `Produção automática via sistema`
    });

    toast(`✅ Produção de ${qtd} unidade(s) concluída!`, 'success');
    // Recarregar página
    navigate('producao');
  } catch (err) {
    toast('Erro na produção: ' + err.message, 'error');
  }
};

window.ajusteEstoque = function(id, nome, atual, unidade, tipo = 'produto') {
  if ((tipo === 'insumo' || tipo === 'ambos') && State.userProfile?.role === 'funcionario') {
    toast('Apenas administradores podem editar insumos.', 'warning');
    return;
  }
  openModal('Ajuste de Estoque', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-weight:600">${nome}</div>
        <div style="color:var(--c-text-3);font-size:var(--t-sm)">Estoque atual: <strong style="color:var(--c-text)">${atual} ${unidade}</strong></div>
      </div>
      <div class="field">
        <label>Tipo de ajuste</label>
        <div class="tabs">
          <button class="tab-btn active" id="tab-entrada" onclick="this.classList.add('active');document.getElementById('tab-saida').classList.remove('active')">+ Entrada</button>
          <button class="tab-btn" id="tab-saida" onclick="this.classList.add('active');document.getElementById('tab-entrada').classList.remove('active')">− Saída</button>
        </div>
      </div>
      <div class="field">
        <label>Quantidade</label>
        <input type="number" class="input" id="ajuste-qtd" step="0.001" min="0.001" placeholder="0" />
      </div>
      <div class="field"><label>Motivo</label><input type="text" class="input" id="ajuste-motivo" placeholder="Inventário, compra, dano..." /></div>
      <button class="btn btn--primary" style="width:100%;justify-content:center" onclick="confirmarAjusteEstoque('${id}',${atual},'${unidade}')">Confirmar Ajuste</button>
    </div>
  `);
};

window.confirmarAjusteEstoque = async function(id, atual, unidade) {
  const qtd = parseFloat(document.getElementById('ajuste-qtd').value)||0;
  if (!qtd) { toast('Informe a quantidade','warning'); return; }
  const isEntrada = document.getElementById('tab-entrada').classList.contains('active');
  const novoEstoque = isEntrada ? atual + qtd : Math.max(0, atual - qtd);
  const { error } = await sb.from('produtos').update({ estoque_atual: novoEstoque }).eq('id',id);
  if (error) { toast('Erro: '+error.message,'error'); return; }
  toast('Estoque ajustado!','success');
  closeModal();
  navigate('estoque');
};

// ============================================================
// ── ALERTA: CONTAS PRÓXIMAS DO VENCIMENTO ──────────────────
// Roda no boot do app (apenas para quem tem acesso à página de
// Contas) e avisa sobre contas vencidas ou vencendo nos
// próximos 3 dias. Não bloqueia o fluxo se a consulta falhar.
// ============================================================
async function verificarContasProximasVencimento() {
  if (State.userProfile?.role !== 'admin' && State.userProfile?.role !== 'adminMaster') return;

  const hojeStr = new Date().toISOString().split('T')[0];
  const limiteStr = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

  const { data: contas, error } = await sb.from('contas')
    .select('id, descricao, valor, vencimento')
    .eq('status', 'pendente')
    .lte('vencimento', limiteStr)
    .order('vencimento', { ascending: true });

  if (error || !contas || contas.length === 0) return;

  const vencidas = contas.filter(c => c.vencimento < hojeStr);
  const proximas = contas.filter(c => c.vencimento >= hojeStr);

  if (vencidas.length > 0) {
    toast(`⚠️ ${vencidas.length} conta${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''}! Confira em Contas.`, 'error', 6000);
  }
  if (proximas.length > 0) {
    toast(`📋 ${proximas.length} conta${proximas.length > 1 ? 's' : ''} vencendo nos próximos 3 dias.`, 'warning', 6000);
  }
}
window.verificarContasProximasVencimento = verificarContasProximasVencimento;

// ============================================================
// ── MÓDULO: CONTAS ────────────────────────────────────────
// ============================================================
async function renderContas(el) {
  const { data: contas } = await sb.from('contas')
    .select('*, fornecedores(nome), funcionarios(nome)')
    .order('vencimento', { ascending: true });

  const hojeStr = new Date().toISOString().split('T')[0];
  const limiteStr = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
  const contasAlerta = (contas || []).filter(c => !c.pago_em && c.vencimento <= limiteStr);
  const alertaVencidas = contasAlerta.filter(c => c.vencimento < hojeStr);
  const alertaProximas = contasAlerta.filter(c => c.vencimento >= hojeStr);

  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Contas a Pagar / Receber</div>
      <div class="section-sub">Controle financeiro de obrigações</div></div>
      <button class="btn btn--primary" onclick="abrirModalConta()">+ Nova Conta</button>
    </div>
    ${contasAlerta.length > 0 ? `
    <div class="card" style="margin-bottom:var(--sp-4);border-left:4px solid var(--c-danger);background:var(--c-bg)">
      <div class="card-body" style="padding:var(--sp-4)">
        <div style="font-weight:600;color:var(--c-danger);display:flex;align-items:center;gap:6px">⚠️ Atenção: contas próximas do vencimento</div>
        <div style="margin-top:var(--sp-2);display:flex;flex-direction:column;gap:4px">
          ${alertaVencidas.map(c => `<div style="font-size:var(--t-sm)"><strong style="color:var(--c-danger)">Vencida</strong> — ${c.descricao} · ${formatMoney(c.valor)} · venceu em ${formatDate(c.vencimento)}</div>`).join('')}
          ${alertaProximas.map(c => `<div style="font-size:var(--t-sm)"><strong style="color:var(--c-warning)">Vence em breve</strong> — ${c.descricao} · ${formatMoney(c.valor)} · vencimento ${formatDate(c.vencimento)}</div>`).join('')}
        </div>
      </div>
    </div>
    ` : ''}
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Categoria</th><th></th></tr>
          </thead>
          <tbody>
            ${(contas||[]).map(c => {
              const vencida = !c.pago_em && new Date(c.vencimento) < new Date();
              const status = c.pago_em ? 'paga' : vencida ? 'vencida' : 'pendente';
              return `<tr>
                <td style="font-weight:500">${c.descricao} ${c.fixa ? '<span class="badge badge--accent" title="Conta fixa — repete todo mês">🔁 Fixa</span>' : ''}</td>
                <td><span class="badge ${c.tipo==='receita'?'badge--success':'badge--danger'}">${c.tipo==='receita'?'Receita':'Despesa'}</span></td>
                <td style="font-weight:600;color:${c.tipo==='receita'?'var(--c-success)':'var(--c-danger)'}">${formatMoney(c.valor)}</td>
                <td class="td-mono" style="color:${vencida&&!c.pago_em?'var(--c-danger)':''}">${formatDate(c.vencimento)}</td>
                <td><span class="badge badge--${status==='paga'?'success':status==='vencida'?'danger':'warning'}">${status}</span></td>
                <td style="color:var(--c-text-3)">${c.categoria||'—'}</td>
                <td>
                  <button class="btn btn--ghost btn--sm" onclick="abrirModalConta('${c.id}')">✏ Editar</button>
                  ${!c.pago_em ? `<button class="btn btn--success btn--sm" onclick="pagarConta('${c.id}',${c.valor})">✓ Pagar</button>` : ''}
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="7"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-icon">📋</div><div class="empty-state-sub">Nenhuma conta cadastrada</div></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// abrirModalConta(): cria uma nova conta.
// abrirModalConta(id): abre a mesma tela já preenchida para edição
// (evita ter que excluir e recriar por causa de erro de digitação).
window.abrirModalConta = async function(contaId = null) {
  let c = null;
  if (contaId) {
    const { data, error } = await sb.from('contas').select('*').eq('id', contaId).single();
    if (error || !data) { toast('Conta não encontrada', 'error'); return; }
    c = data;
  }

  openModal(contaId ? '✏ Editar Conta' : 'Nova Conta', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="form-row form-row--2">
        <div class="field"><label>Descrição *</label><input type="text" class="input" id="conta-desc" placeholder="Ex: Aluguel loja" value="${c?.descricao ? c.descricao.replace(/"/g,'&quot;') : ''}" /></div>
        <div class="field"><label>Tipo</label>
          <select class="input" id="conta-tipo">
            <option value="despesa" ${c?.tipo!=='receita'?'selected':''}>Despesa</option>
            <option value="receita" ${c?.tipo==='receita'?'selected':''}>Receita</option>
          </select>
        </div>
      </div>
      <div class="form-row form-row--2">
        <div class="field"><label>Valor *</label><input type="number" class="input" id="conta-valor" step="0.01" min="0" placeholder="0,00" value="${c?.valor ?? ''}" /></div>
        <div class="field"><label>Vencimento *</label><input type="date" class="input" id="conta-vencimento" value="${c?.vencimento || ''}" /></div>
      </div>
      <div class="form-row form-row--2">
        <div class="field"><label>Categoria</label><input type="text" class="input" id="conta-categoria" placeholder="Aluguel, água, luz, salário..." value="${c?.categoria ? c.categoria.replace(/"/g,'&quot;') : ''}" /></div>
        <div class="field"><label>Forma de Pagamento</label>
          <select class="input" id="conta-pagamento">
            ${['dinheiro','pix','cartao_debito','cartao_credito','cheque','transferencia'].map(p=>`<option value="${p}" ${c?.forma_pagamento===p?'selected':''}>${labelPagamento(p)}</option>`).join('')}
          </select>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;padding:var(--sp-3);background:var(--c-bg);border-radius:var(--r-md)">
        <input type="checkbox" id="conta-fixa" ${c?.fixa?'checked':''} />
        <div>
          <div style="font-weight:600">🔁 Conta fixa (repete todo mês)</div>
          <div style="font-size:var(--t-xs);color:var(--c-text-3)">Ao marcar como paga, uma nova conta com o mesmo valor já é criada automaticamente para o mês seguinte, na mesma data.</div>
        </div>
      </label>
      <div class="field"><label>Observações</label><textarea class="input" id="conta-obs" rows="2">${c?.observacoes || ''}</textarea></div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarConta(${contaId ? `'${contaId}'` : 'null'})">💾 ${contaId ? 'Salvar Alterações' : 'Salvar Conta'}</button>
    </div>
  `);
};

window.salvarConta = async function(contaId = null) {
  const payload = {
    descricao: document.getElementById('conta-desc').value.trim(),
    tipo: document.getElementById('conta-tipo').value,
    valor: parseFloat(document.getElementById('conta-valor').value)||0,
    vencimento: document.getElementById('conta-vencimento').value,
    categoria: document.getElementById('conta-categoria').value||null,
    forma_pagamento: document.getElementById('conta-pagamento').value,
    observacoes: document.getElementById('conta-obs').value||null,
    fixa: document.getElementById('conta-fixa')?.checked || false,
  };
  if (!payload.descricao || !payload.valor || !payload.vencimento) { toast('Preencha os campos obrigatórios','warning'); return; }

  const { error } = contaId
    ? await sb.from('contas').update(payload).eq('id', contaId)
    : await sb.from('contas').insert(payload);

  if (error) { toast('Erro: '+error.message,'error'); return; }
  toast(contaId ? 'Conta atualizada!' : 'Conta salva!', 'success');
  closeModal();
  navigate('contas');
};

window.pagarConta = function(id, valor) {
  openModal('Registrar Pagamento', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field"><label>Valor Pago</label><input type="number" class="input" id="pag-valor" value="${valor}" step="0.01" /></div>
      <div class="field"><label>Data do Pagamento</label><input type="date" class="input" id="pag-data" value="${new Date().toISOString().split('T')[0]}" /></div>
      <div class="field"><label>Forma de Pagamento</label>
        <select class="input" id="pag-forma">
          ${['dinheiro','pix','cartao_debito','cartao_credito','cheque','transferencia'].map(p=>`<option value="${p}">${labelPagamento(p)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--success btn--lg" style="width:100%;justify-content:center" onclick="confirmarPagamentoConta('${id}')">✅ Confirmar Pagamento</button>
    </div>
  `);
};

window.confirmarPagamentoConta = async function(id) {
  // Busca a conta original antes de marcar como paga — precisamos dela
  // (descrição, valor, categoria, vencimento...) para, se for fixa,
  // gerar automaticamente a ocorrência do mês seguinte.
  const { data: contaOriginal, error: errBusca } = await sb.from('contas').select('*').eq('id', id).single();
  if (errBusca || !contaOriginal) { toast('Conta não encontrada', 'error'); return; }

  const { error } = await sb.from('contas').update({
    pago_em: document.getElementById('pag-data').value,
    valor_pago: parseFloat(document.getElementById('pag-valor').value)||0,
    forma_pagamento: document.getElementById('pag-forma').value,
    status: 'paga',
  }).eq('id', id);
  if (error) { toast('Erro: '+error.message,'error'); return; }

  // ── Conta fixa: gera automaticamente a próxima ocorrência (mesmo dia, mês seguinte) ──
  if (contaOriginal.fixa) {
    const vencOriginal = new Date(contaOriginal.vencimento + 'T00:00:00');
    const proximoVencimento = new Date(vencOriginal);
    proximoVencimento.setMonth(proximoVencimento.getMonth() + 1);

    await sb.from('contas').insert({
      descricao: contaOriginal.descricao,
      tipo: contaOriginal.tipo,
      valor: contaOriginal.valor,
      vencimento: proximoVencimento.toISOString().split('T')[0],
      categoria: contaOriginal.categoria,
      forma_pagamento: contaOriginal.forma_pagamento,
      observacoes: contaOriginal.observacoes,
      fixa: true,
    });
    toast('✅ Pagamento registrado! Próxima conta fixa já criada para ' + formatDate(proximoVencimento.toISOString().split('T')[0]) + '.', 'success', 4500);
  } else {
    toast('Pagamento registrado!','success');
  }

  closeModal();
  navigate('contas');
};

// ============================================================
// ── MÓDULO: COMPRAS ───────────────────────────────────────
// ============================================================
async function renderCompras(el) {
  const { data: compras } = await sb.from('compras')
    .select('*, fornecedores(nome)')
    .order('data_compra', { ascending: false })
    .limit(20);

  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Compras de Insumos</div>
      <div class="section-sub">Registro de compras para reabastecimento de estoque</div></div>
      <button class="btn btn--primary" onclick="abrirModalCompra()">+ Nova Compra</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Fornecedor</th><th>NF</th><th>Total</th><th>Pagamento</th></tr></thead>
          <tbody>
            ${(compras||[]).map(c=>`
              <tr>
                <td class="td-mono">${formatDateTime(c.data_compra)}</td>
                <td>${c.fornecedores?.nome||'—'}</td>
                <td class="td-mono">${c.nota_fiscal||'—'}</td>
                <td style="font-weight:600;color:var(--c-accent)">${formatMoney(c.total)}</td>
                <td><span class="badge badge--primary">${labelPagamento(c.forma_pagamento)}</span></td>
              </tr>
            `).join('')||'<tr><td colspan="5"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-icon">🛒</div><div class="empty-state-sub">Nenhuma compra registrada</div></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.abrirModalCompra = async function() {
  const [{ data: fornecedores }, { data: produtos }] = await Promise.all([
    sb.from('fornecedores').select('id,nome').eq('ativo',true).order('nome'),
    sb.from('produtos').select('id,nome,unidade,preco_custo').eq('ativo',true).order('nome'),
  ]);
  window._compraItens = [];

  openModal('Nova Compra', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="form-row form-row--2">
        <div class="field"><label>Fornecedor</label>
          <select class="input" id="compra-forn">
            <option value="">— Selecione —</option>
            ${(fornecedores||[]).map(f=>`<option value="${f.id}">${f.nome}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Nota Fiscal</label><input type="text" class="input" id="compra-nf" placeholder="Número da NF..." /></div>
      </div>
      <div class="field"><label>Forma de Pagamento</label>
        <select class="input" id="compra-pag">
          ${['dinheiro','pix','pix_brl','cartao_credito','cheque','transferencia'].map(p=>`<option value="${p}">${labelPagamento(p)}</option>`).join('')}
        </select>
      </div>
      <div class="divider-text">Itens da Compra</div>
      <div style="display:flex;gap:var(--sp-2)">
        <select class="input" id="compra-prod-sel" style="flex:1">
          <option value="">Selecionar produto...</option>
          ${(produtos||[]).map(p=>`<option value="${p.id}" data-custo="${p.preco_custo||0}" data-un="${p.unidade}">${p.nome} (${p.unidade})</option>`).join('')}
        </select>
        <button class="btn btn--ghost" onclick="adicionarItemCompra()">+ Add</button>
      </div>
      <div id="compra-itens-lista" style="display:flex;flex-direction:column;gap:var(--sp-2)"></div>
      <div style="display:flex;justify-content:space-between;font-weight:700;padding:var(--sp-2) 0">
        <span>Total</span><span id="compra-total">${formatMoney(0)}</span>
      </div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarCompra()">💾 Registrar Compra</button>
    </div>
  `, 'modal--lg');
};

window.adicionarItemCompra = function() {
  const sel = document.getElementById('compra-prod-sel');
  if (!sel.value) return;
  const opt = sel.options[sel.selectedIndex];
  window._compraItens.push({
    produto_id: sel.value,
    nome: opt.text.split(' (')[0],
    quantidade: 1,
    preco_unitario: parseFloat(opt.dataset.custo)||0,
    unidade: opt.dataset.un,
    total: parseFloat(opt.dataset.custo)||0,
  });
  renderCompraItens();
};

function renderCompraItens() {
  const el = document.getElementById('compra-itens-lista');
  const totalEl = document.getElementById('compra-total');
  if (!el) return;
  el.innerHTML = window._compraItens.map((item,i)=>`
    <div style="display:flex;align-items:center;gap:var(--sp-2);background:var(--c-bg);padding:var(--sp-3);border-radius:var(--r-md)">
      <div style="flex:1;font-size:var(--t-sm);font-weight:500">${item.nome}</div>
      <input type="number" value="${item.quantidade}" min="0.001" step="0.001" style="width:70px" class="input"
             oninput="window._compraItens[${i}].quantidade=parseFloat(this.value)||0;window._compraItens[${i}].total=window._compraItens[${i}].quantidade*window._compraItens[${i}].preco_unitario;renderCompraItens()" />
      <span style="color:var(--c-text-3);font-size:var(--t-xs)">×</span>
      <input type="number" value="${item.preco_unitario}" min="0" step="0.01" style="width:80px" class="input"
             oninput="window._compraItens[${i}].preco_unitario=parseFloat(this.value)||0;window._compraItens[${i}].total=window._compraItens[${i}].quantidade*window._compraItens[${i}].preco_unitario;renderCompraItens()" />
      <span style="font-weight:600;color:var(--c-accent);min-width:70px;text-align:right">${formatMoney(item.total)}</span>
      <button class="pdv-remove-btn" onclick="window._compraItens.splice(${i},1);renderCompraItens()">✕</button>
    </div>
  `).join('');
  const total = window._compraItens.reduce((a,b)=>a+b.total,0);
  if (totalEl) totalEl.textContent = formatMoney(total);
}
window.renderCompraItens = renderCompraItens;

window.salvarCompra = async function() {
  if (!window._compraItens.length) { toast('Adicione ao menos um item','warning'); return; }
  const total = window._compraItens.reduce((a,b)=>a+b.total,0);
  const { data: compra, error } = await sb.from('compras').insert({
    fornecedor_id: document.getElementById('compra-forn').value||null,
    nota_fiscal: document.getElementById('compra-nf').value||null,
    forma_pagamento: document.getElementById('compra-pag').value,
    total,
  }).select().single();
  if (error) { toast('Erro: '+error.message,'error'); return; }
  await sb.from('compra_itens').insert(
    window._compraItens.map(i=>({ compra_id: compra.id, ...i }))
  );
  // Atualiza estoque
  for (const i of window._compraItens) {
    const { data: prod } = await sb.from('produtos').select('estoque_atual').eq('id',i.produto_id).single();
    if (prod) await sb.from('produtos').update({ estoque_atual: (prod.estoque_atual||0)+i.quantidade }).eq('id',i.produto_id);
  }
  toast('Compra registrada e estoque atualizado!','success');
  closeModal();
  navigate('compras');
};

// ============================================================
// ── MÓDULO: CLIENTES ──────────────────────────────────────
// ============================================================
async function renderClientes(el) {
  const { data: clientes } = await sb.from('clientes').select('*').order('nome');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Clientes</div></div>
      <button class="btn btn--primary" onclick="abrirModalCliente()">+ Novo Cliente</button>
    </div>
    <div class="card" style="height: auto;">
      <div class="card-body" style="padding:var(--sp-3) var(--sp-5)">
        <div class="search-bar"><span class="search-bar-icon">🔍</span>
          <input type="text" class="input" placeholder="Buscar cliente..." oninput="filtrarTabela(this.value,'tabela-clientes')" />
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:var(--sp-4)">
      <div class="table-wrap">
        <table id="tabela-clientes">
          <thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>E-mail</th><th>Fiado</th><th></th></tr></thead>
          <tbody>
            ${(clientes||[]).map(c=>`
              <tr>
                <td style="font-weight:500">${c.nome}</td>
                <td class="td-mono">${c.cpf||'—'}</td>
                <td>${c.telefone||'—'}</td>
                <td style="color:var(--c-text-3)">${c.email||'—'}</td>
                <td style="color:${(c.saldo_fiado||0)>0?'var(--c-danger)':'var(--c-text-3)'};font-weight:600">${formatMoney(c.saldo_fiado||0)}</td>
                <td><button class="btn btn--ghost btn--sm" onclick="editarCliente('${c.id}')">✏️</button></td>
              </tr>
            `).join('')||'<tr><td colspan="6"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-icon">👥</div><div class="empty-state-sub">Nenhum cliente cadastrado</div></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.abrirModalCliente = function(c={}) {
  openModal(c.id?'Editar Cliente':'Novo Cliente',`
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field"><label>Nome *</label><input type="text" class="input" id="cli-nome" value="${c.nome||''}" /></div>
      <div class="form-row form-row--2">
        <div class="field"><label>CPF</label><input type="text" class="input" id="cli-cpf" value="${c.cpf||''}" /></div>
        <div class="field"><label>Telefone</label><input type="text" class="input" id="cli-tel" value="${c.telefone||''}" /></div>
      </div>
      <div class="field"><label>E-mail</label><input type="email" class="input" id="cli-email" value="${c.email||''}" /></div>
      <div class="field"><label>Endereço</label><input type="text" class="input" id="cli-end" value="${c.endereco||''}" /></div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarCliente('${c.id||''}')">💾 Salvar</button>
    </div>
  `);
};
window.editarCliente = async function(id) {
  const {data} = await sb.from('clientes').select('*').eq('id',id).single();
  abrirModalCliente(data||{});
};
window.salvarCliente = async function(id) {
  const p = {
    nome: document.getElementById('cli-nome').value.trim(),
    cpf: document.getElementById('cli-cpf').value||null,
    telefone: document.getElementById('cli-tel').value||null,
    email: document.getElementById('cli-email').value||null,
    endereco: document.getElementById('cli-end').value||null,
  };
  if(!p.nome){toast('Nome obrigatório','warning');return;}
  const {error} = id ? await sb.from('clientes').update(p).eq('id',id) : await sb.from('clientes').insert(p);
  if(error){toast('Erro: '+error.message,'error');return;}
  toast('Cliente salvo!','success');closeModal();navigate('clientes');
};

// ============================================================
// ── MÓDULO: FUNCIONÁRIOS ──────────────────────────────────
// ============================================================
async function renderFuncionarios(el) {
  const { data: funcs, error } = await sb.rpc('get_usuarios');

  const isAdminMaster = State.userProfile?.role === 'adminMaster';
  const funcionariosFiltrados = isAdminMaster 
    ? funcs 
    : (funcs || []).filter(f => f.role !== 'adminMaster');

  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Funcionários</div></div>
      <button class="btn btn--primary" onclick="abrirModalFuncionario()">+ Novo Funcionário</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Cargo</th><th>Salário</th><th>Admissão</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${(funcs||[]).map(f=>`
              <tr>
                <td style="font-weight:500">${f.nome}</td>
                <td>${f.cargo||'—'}</td>
                <td style="color:var(--c-success);font-weight:600">${formatMoney(f.salario)}</td>
                <td class="td-mono">${formatDate(f.data_admissao)}</td>
                <td><span class="badge badge--${f.ativo?'success':'danger'}">${f.ativo?'Ativo':'Inativo'}</span></td>
                <td><button class="btn btn--ghost btn--sm" onclick="editarFuncionario('${f.id}')">✏️</button></td>
              </tr>
            `).join('')||'<tr><td colspan="6"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-icon">👔</div><div class="empty-state-sub">Nenhum funcionário cadastrado</div></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.abrirModalFuncionario = function(f={}) {
  openModal(f.id?'Editar Funcionário':'Novo Funcionário',`
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field"><label>Nome *</label><input type="text" class="input" id="func-nome" value="${f.nome||''}" /></div>
      <div class="form-row form-row--2">
        <div class="field"><label>Cargo</label><input type="text" class="input" id="func-cargo" value="${f.cargo||''}" /></div>
        <div class="field"><label>Salário</label><input type="number" class="input" id="func-salario" value="${f.salario||''}" step="0.01" /></div>
      </div>
      <div class="form-row form-row--2">
        <div class="field"><label>CPF</label><input type="text" class="input" id="func-cpf" value="${f.cpf||''}" /></div>
        <div class="field"><label>Telefone</label><input type="text" class="input" id="func-tel" value="${f.telefone||''}" /></div>
      </div>
      <div class="form-row form-row--2">
        <div class="field"><label>E-mail</label><input type="email" class="input" id="func-email" value="${f.email||''}" /></div>
        <div class="field"><label>Admissão</label><input type="date" class="input" id="func-admissao" value="${f.data_admissao||''}" /></div>
      </div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarFuncionario('${f.id||''}')">💾 Salvar</button>
    </div>
  `);
};
window.editarFuncionario = async function(id) {
  const {data} = await sb.from('funcionarios').select('*').eq('id',id).single();
  abrirModalFuncionario(data||{});
};
window.salvarFuncionario = async function(id) {
  const p = {
    nome: document.getElementById('func-nome').value.trim(),
    cargo: document.getElementById('func-cargo').value||null,
    salario: parseFloat(document.getElementById('func-salario').value)||null,
    cpf: document.getElementById('func-cpf').value||null,
    telefone: document.getElementById('func-tel').value||null,
    email: document.getElementById('func-email').value||null,
    data_admissao: document.getElementById('func-admissao').value||null,
  };
  if(!p.nome){toast('Nome obrigatório','warning');return;}
  const {error} = id ? await sb.from('funcionarios').update(p).eq('id',id) : await sb.from('funcionarios').insert(p);
  if(error){toast('Erro: '+error.message,'error');return;}
  toast('Funcionário salvo!','success');closeModal();navigate('funcionarios');
};

// ============================================================
// ── MÓDULO: FORNECEDORES ──────────────────────────────────
// ============================================================
async function renderFornecedores(el) {
  const {data: forns} = await sb.from('fornecedores').select('*').order('nome');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Fornecedores</div></div>
      <button class="btn btn--primary" onclick="abrirModalFornecedor()">+ Novo Fornecedor</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>CNPJ</th><th>Contato</th><th>Telefone</th><th>Tipo</th><th></th></tr></thead>
          <tbody>
            ${(forns||[]).map(f=>`
              <tr>
                <td style="font-weight:500">${f.nome}</td>
                <td class="td-mono">${f.cnpj||'—'}</td>
                <td>${f.contato||'—'}</td>
                <td>${f.telefone||'—'}</td>
                <td><span class="badge badge--primary">${f.tipo}</span></td>
                <td><button class="btn btn--ghost btn--sm" onclick="editarFornecedor('${f.id}')">✏️</button></td>
              </tr>
            `).join('')||'<tr><td colspan="6"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-icon">🏭</div><div class="empty-state-sub">Nenhum fornecedor cadastrado</div></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.abrirModalFornecedor = function(f={}) {
  openModal(f.id?'Editar Fornecedor':'Novo Fornecedor',`
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field"><label>Nome *</label><input type="text" class="input" id="forn-nome" value="${f.nome||''}" /></div>
      <div class="form-row form-row--2">
        <div class="field"><label>CNPJ</label><input type="text" class="input" id="forn-cnpj" value="${f.cnpj||''}" /></div>
        <div class="field"><label>Tipo</label>
          <select class="input" id="forn-tipo">
            ${['produto','servico','ambos'].map(t=>`<option value="${t}" ${f.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row form-row--2">
        <div class="field"><label>Contato (pessoa)</label><input type="text" class="input" id="forn-contato" value="${f.contato||''}" /></div>
        <div class="field"><label>Telefone</label><input type="text" class="input" id="forn-tel" value="${f.telefone||''}" /></div>
      </div>
      <div class="field"><label>E-mail</label><input type="email" class="input" id="forn-email" value="${f.email||''}" /></div>
      <div class="field"><label>Endereço</label><input type="text" class="input" id="forn-end" value="${f.endereco||''}" /></div>
      <div class="field"><label>Observações</label><textarea class="input" id="forn-obs" rows="2">${f.observacoes||''}</textarea></div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarFornecedor('${f.id||''}')">💾 Salvar</button>
    </div>
  `);
};
window.editarFornecedor = async function(id) {
  const {data} = await sb.from('fornecedores').select('*').eq('id',id).single();
  abrirModalFornecedor(data||{});
};
window.salvarFornecedor = async function(id) {
  const p = {
    nome: document.getElementById('forn-nome').value.trim(),
    cnpj: document.getElementById('forn-cnpj').value||null,
    tipo: document.getElementById('forn-tipo').value,
    contato: document.getElementById('forn-contato').value||null,
    telefone: document.getElementById('forn-tel').value||null,
    email: document.getElementById('forn-email').value||null,
    endereco: document.getElementById('forn-end').value||null,
    observacoes: document.getElementById('forn-obs').value||null,
  };
  if(!p.nome){toast('Nome obrigatório','warning');return;}
  const {error} = id ? await sb.from('fornecedores').update(p).eq('id',id) : await sb.from('fornecedores').insert(p);
  if(error){toast('Erro: '+error.message,'error');return;}
  toast('Fornecedor salvo!','success');closeModal();navigate('fornecedores');
};

// ============================================================
// ── MÓDULO: IMPRESSORAS ───────────────────────────────────
// ============================================================
// ============================================================
// ── MÓDULO: IMPRESSORAS ───────────────────────────────────
// ============================================================
// (renderStepImpressoras foi removido — a escolha de impressora agora
// é feita por um seletor compacto sempre visível na aba "Impressões"
// do PDV, ver renderAbaCopia(). O PDV passou a iniciar direto no
// antigo "passo 2": escolha do tipo de cópia.)

function renderStepTipoCopia() {
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">Escolha o tipo de cópia</span></div>
      <div class="card-body">
        <div class="tipo-copia-grid" id="tipo-copia-grid">
          ${State.precosCopia.map(p => `
            <div class="tipo-copia-btn ${PdvState.tipoCopia === p.tipo ? 'selected' : ''}"
                 data-tipo="${p.tipo}"
                 onclick="selecionarTipoCopia('${p.tipo}')">
              <div class="tipo-copia-btn-icon">${iconeTipoCopia(p.tipo)}</div>
              <div class="tipo-copia-btn-name">${p.descricao}</div>
              <div class="tipo-copia-btn-price">${formatMoney(p.preco_unitario)} /cópia</div>
              ${p.preco_desconto ? `<div style="font-size:10px;color:var(--c-text-3)">≥${p.qtd_desconto} pçs: ${formatMoney(p.preco_desconto)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderStepQuantidade() {
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">Quantidade e Opções</span></div>
      <div class="card-body">
        <div class="form-row form-row--3" style="align-items:end">
          <div class="field">
            <label>Quantidade de Cópias</label>
            <div class="qty-control">
              <button class="qty-btn" onclick="ajustarQtd(-10)">−10</button>
              <button class="qty-btn" onclick="ajustarQtd(-1)">−</button>
              <input type="number" id="input-qtd" class="input qty-input" value="${PdvState.quantidade}" min="1" max="9999"
                     onchange="PdvState.quantidade = parseInt(this.value)||1; atualizarPreviewPdv()" />
              <button class="qty-btn" onclick="ajustarQtd(1)">+</button>
              <button class="qty-btn" onclick="ajustarQtd(10)">+10</button>
            </div>
            <div class="field">
          <label>📄 Tipo de Folha *</label>
          <select class="input" id="select-folha" onchange="selecionarFolha(this.value)">
            <option value="">— Selecione uma folha —</option>
            ${(State.folhasDisponiveis || []).map(f => `
              <option value="${f.id}" data-nome="${f.nome}" ${PdvState.folhaSelecionada === f.id ? 'selected' : ''}>
                ${f.nome} (estoque: ${f.estoque_atual} ${f.unidade})
              </option>
            `).join('')}
          </select>
        </div>
          </div>
          <div class="field">
            <label>Frente e Verso?</label>
            <label style="display:flex;align-items:center;gap:var(--sp-3);cursor:pointer;padding:9px 12px;border:1.5px solid var(--c-border);border-radius:var(--r-md);background:var(--c-bg)">
              <input type="checkbox" id="chk-frente-verso" ${PdvState.frenteVerso?'checked':''}
                     onchange="PdvState.frenteVerso=this.checked;atualizarPreviewPdv()">
              <span>Sim (2 lados)</span>
            </label>
          </div>
          <div class="field">
            <label>Cliente (opcional)</label>
            <input type="text" class="input" id="input-cliente-busca" placeholder="Buscar cliente..." />
          </div>
        </div>

        <!-- NOVO CAMPO: Páginas por documento -->
        <div class="form-row form-row--3" style="margin-top:var(--sp-4)">
          <div class="field">
            <label>Páginas por documento</label>
            <input type="number" id="input-paginas-doc" class="input"
                   value="${PdvState.paginasPorDocumento}" min="1" max="9999"
                   onchange="PdvState.paginasPorDocumento = parseInt(this.value)||1; atualizarPreviewPdv()" />
          </div>
          <div class="field">
            <label>Total de páginas</label>
            <input type="text" class="input" id="total-paginas-preview" value="—" disabled style="background:var(--c-bg);opacity:.7" />
          </div>
          <div class="field">
            <label>Folhas estimadas</label>
            <input type="text" class="input" id="folhas-preview" value="—" disabled style="background:var(--c-bg);opacity:.7" />
          </div>
        </div>

        <div style="margin-top:var(--sp-4)" id="preview-pdv">
          <!-- Atualizado dinamicamente -->
        </div>
      </div>
    </div>
  `;
}

async function renderImpressoras(el) {
  await loadImpressoras();
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Gerenciar Impressoras</div>
      <div class="section-sub">Monitoramento de status e contadores em rede</div></div>
      <button class="btn btn--primary" onclick="abrirModalImpressora()">+ Cadastrar Impressora</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-sm);color:var(--c-text-3);margin-bottom:var(--sp-2)">ℹ️ Sobre integração em rede</div>
        <div style="font-size:var(--t-xs);color:var(--c-text-3);line-height:1.7">
          As impressoras são cadastradas com IP de rede. O sistema registra contadores manualmente via PDV.
          Para integração com contadores reais via SNMP/JMX, é necessário um proxy local (Node.js) rodando na mesma rede.
          <a href="#" onclick="verInstrucoesSNMP()" style="color:var(--c-primary)">Ver instruções →</a>
        </div>
      </div>
      <div class="printer-grid">
        ${State.impressoras.map(imp=>`
          <div class="printer-card">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div style="display:flex;align-items:center;gap:var(--sp-2)">
                <div class="printer-status-dot ${imp.status}"></div>
                <span class="badge badge--${imp.status==='online'?'success':imp.status==='offline'?'danger':'warning'}">${imp.status}</span>
              </div>
              <div style="display:flex;gap:4px">
                <button class="btn btn--ghost btn--sm" onclick="editarImpressora('${imp.id}')">✏️</button>
                <select class="input" style="width:auto;padding:2px 4px;font-size:var(--t-xs)" 
                        onchange="mudarStatusImpressora('${imp.id}', this.value)">
                  <option value="online" ${imp.status==='online'?'selected':''}>🟢 Online</option>
                  <option value="offline" ${imp.status==='offline'?'selected':''}>🔴 Offline</option>
                  <option value="manutencao" ${imp.status==='manutencao'?'selected':''}>🟠 Manutenção</option>
                  <option value="sem_papel" ${imp.status==='sem_papel'?'selected':''}>📄 Sem Papel</option>
                  <option value="sem_toner" ${imp.status==='sem_toner'?'selected':''}>🖨️ Sem Toner</option>
                </select>
              </div>
            </div>
            <div class="printer-card-name">${imp.nome}</div>
            <div class="printer-card-model">${imp.marca||''} ${imp.modelo||''}</div>
            <div style="margin-top:var(--sp-2);font-size:var(--t-xs);color:var(--c-text-3)">
              📍 ${imp.localizacao||'—'}<br>
              🌐 IP: <span style="font-family:var(--font-mono)">${imp.ip_rede||'—'}</span><br>
              🖨️ ${imp.tipo} · ${imp.colorida?'Colorida':'Preto e Branco'}
            </div>
            <div class="printer-counters">
              <div class="printer-counter">
                <div class="printer-counter-val">${(imp.contador_pb_total||0).toLocaleString()}</div>
                <div class="printer-counter-label">P&B Total</div>
              </div>
              <div class="printer-counter">
                <div class="printer-counter-val">${(imp.contador_cor_total||0).toLocaleString()}</div>
                <div class="printer-counter-label">Cor Total</div>
              </div>
            </div>
          </div>
        `).join('')||'<div class="empty-state" style="grid-column:1/-1;padding:var(--sp-10)"><div class="empty-state-icon">🖥️</div><div class="empty-state-sub">Nenhuma impressora cadastrada</div></div>'}
      </div>
    </div>
  `;
}

window.selecionarFolha = function(folhaId) {
  PdvState.folhaSelecionada = folhaId;
  salvarEstadoPdv();
};

window.abrirModalImpressora = function(imp={}) {
  openModal(imp.id?'Editar Impressora':'Nova Impressora',`
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="form-row form-row--2">
        <div class="field"><label>Nome *</label><input type="text" class="input" id="imp-nome" value="${imp.nome||''}" placeholder="Ex: Impressora 1" /></div>
        <div class="field"><label>Localização</label><input type="text" class="input" id="imp-local" value="${imp.localizacao||''}" placeholder="Balcão, fundo..." /></div>
      </div>
      <div class="form-row form-row--3">
        <div class="field"><label>Marca</label><input type="text" class="input" id="imp-marca" value="${imp.marca||''}" placeholder="HP, Epson..." /></div>
        <div class="field"><label>Modelo</label><input type="text" class="input" id="imp-modelo" value="${imp.modelo||''}" /></div>
        <div class="field"><label>IP da Rede</label><input type="text" class="input" id="imp-ip" value="${imp.ip_rede||''}" placeholder="192.168.1.10" /></div>
      </div>
      <div class="form-row form-row--2">
        <div class="field"><label>Tipo</label>
          <select class="input" id="imp-tipo">
            <option value="laser" ${imp.tipo==='laser'?'selected':''}>Laser</option>
            <option value="tinta" ${imp.tipo==='tinta'?'selected':''}>Jato de Tinta</option>
          </select>
        </div>
        <div class="field"><label>Impressão Colorida?</label>
          <label style="display:flex;align-items:center;gap:var(--sp-3);cursor:pointer;padding:9px 12px;border:1.5px solid var(--c-border);border-radius:var(--r-md);background:var(--c-bg)">
            <input type="checkbox" id="imp-colorida" ${imp.colorida?'checked':''}>
            <span>Sim, imprime colorido</span>
          </label>
        </div>
      </div>
      <div class="field"><label>Observações / Último serviço</label><textarea class="input" id="imp-obs" rows="2">${imp.observacoes||''}</textarea></div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarImpressora('${imp.id||''}')">💾 Salvar Impressora</button>
    </div>
  `);
};
window.editarImpressora = async function(id) {
  const imp = State.impressoras.find(i=>i.id===id)||{};
  abrirModalImpressora(imp);
};
window.salvarImpressora = async function(id) {
  const p = {
    nome: document.getElementById('imp-nome').value.trim(),
    localizacao: document.getElementById('imp-local').value||null,
    marca: document.getElementById('imp-marca').value||null,
    modelo: document.getElementById('imp-modelo').value||null,
    ip_rede: document.getElementById('imp-ip').value||null,
    tipo: document.getElementById('imp-tipo').value,
    colorida: document.getElementById('imp-colorida').checked,
    observacoes: document.getElementById('imp-obs').value||null,
  };
  if(!p.nome){toast('Nome obrigatório','warning');return;}
  const {error} = id ? await sb.from('impressoras').update(p).eq('id',id) : await sb.from('impressoras').insert(p);
  if(error){toast('Erro: '+error.message,'error');return;}
  toast('Impressora salva!','success');
  await loadImpressoras();
  closeModal();navigate('impressoras');
};

window.mudarStatusImpressora = async function(id, novoStatus) {
  await sb.from('impressoras').update({ status: novoStatus }).eq('id', id);
  await loadImpressoras();
  navigate('impressoras');
};

window.verInstrucoesSNMP = function() {
  openModal('Integração SNMP / Contadores', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4);font-size:var(--t-sm);line-height:1.7;color:var(--c-text-2)">
      <p>Para leitura automática de contadores das impressoras via rede, você precisa de um <strong>proxy local em Node.js</strong> rodando na mesma rede local da loja.</p>
      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4);font-family:var(--font-mono);font-size:var(--t-xs)">
        npm install net-snmp express cors<br>
        node snmp-proxy.js
      </div>
      <p>O proxy faz requisições SNMP para cada impressora via OID padrão <code>1.3.6.1.2.1.43.10.2.1.4</code> (contador de páginas) e expõe via HTTP para este sistema.</p>
      <p><strong>Impressoras HP, Epson, Brother e Canon</strong> geralmente suportam SNMP v1/v2 nativamente quando conectadas à rede.</p>
      <p>Por enquanto, os contadores são atualizados automaticamente a cada pedido registrado no PDV de Cópias.</p>
    </div>
  `, 'modal--lg');
};

// ============================================================
// ── MÓDULO: PREÇOS DE CÓPIA ───────────────────────────────
// ============================================================
async function renderPrecos(el) {
  const {data: precos} = await sb.from('precos_copia').select('*').order('tipo');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Tabela de Preços de Cópias</div>
      <div class="section-sub">Configure os preços por tipo de cópia e desconto por volume</div></div>
    </div>
    <button class="btn btn--primary" onclick="abrirModalNovoPreco()">+ Novo Tipo de Cópia</button>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tipo</th><th>Descrição</th><th>Preço Unit.</th><th>Preço Desconto</th><th>A partir de</th><th>💳 Cartão</th><th>Ativo</th><th>Ações</th></tr></thead>
          <tbody>
            ${(precos||[]).map(p=>`
              <tr>
                <td class="td-mono">${p.tipo}</td>
                <td>${p.descricao}</td>
                <td style="color:var(--c-accent);font-weight:600">${formatMoney(p.preco_unitario)}</td>
                <td>${p.preco_desconto ? formatMoney(p.preco_desconto) : '—'}</td>
                <td>${p.qtd_desconto||'—'} cópias</td>
                <td>${p.preco_cartao ? formatMoney(p.preco_cartao) : '—'}</td>
                <td><span class="badge badge--${p.ativo?'success':'danger'}">${p.ativo?'Sim':'Não'}</span></td>
                <td style="display:flex;gap:4px">
                  <button class="btn btn--ghost btn--sm" onclick="editarPreco('${p.id}')">✏️</button>
                  <button class="btn btn--ghost btn--sm" onclick="gerenciarInsumosCopia('${p.tipo}','${p.descricao.replace(/'/g,"\\'")}')" title="Vincular insumos consumidos por folha">🧩</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.abrirModalNovoPreco = function() {
  openModal('Novo Tipo de Cópia', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field">
        <label>Identificador (tipo) *</label>
        <input type="text" class="input" id="novo-tipo" placeholder="ex: pb_laser, a3_colorida" />
        <div style="font-size:var(--t-xs);color:var(--c-text-3)">Use letras minúsculas, underscore para espaços. Ex: <code>a4_colorida_frente_verso</code></div>
      </div>
      <div class="field">
        <label>Descrição *</label>
        <input type="text" class="input" id="novo-desc" placeholder="Cópia Colorida A4 Frente e Verso" />
      </div>
      <div class="form-row form-row--3">
        <div class="field"><label>Preço Unitário (₲) *</label><input type="number" class="input" id="novo-unit" step="100" min="0" /></div>
        <div class="field"><label>Preço com Desconto</label><input type="number" class="input" id="novo-desc-val" step="100" min="0" /></div>
        <div class="field"><label>A partir de (qtd)</label><input type="number" class="input" id="novo-qtd" value="100" min="1" /></div>
      </div>
      <div class="field">
        <label>💳 Preço no Cartão (opcional)</label>
        <input type="number" class="input" id="novo-preco-cartao" step="100" min="0" placeholder="Deixe vazio para usar o preço normal" />
      </div>
      <label style="display:flex;align-items:center;gap:var(--sp-3);cursor:pointer">
        <input type="checkbox" id="novo-ativo" checked> <span>Ativo no PDV</span>
      </label>
      <button class="btn btn--primary btn--lg" onclick="salvarNovoPreco()">💾 Criar Tipo de Cópia</button>
    </div>
  `, 'modal--lg');
};

window.salvarNovoPreco = async function() {
  const tipo = document.getElementById('novo-tipo').value.trim();
  const descricao = document.getElementById('novo-desc').value.trim();
  const preco_unitario = parseFloat(document.getElementById('novo-unit').value) || 0;
  const preco_desconto = parseFloat(document.getElementById('novo-desc-val').value) || null;
  const qtd_desconto = parseInt(document.getElementById('novo-qtd').value) || 100;
  const preco_cartao = parseFloat(document.getElementById('novo-preco-cartao').value) || null;
  const ativo = document.getElementById('novo-ativo').checked;

  if (!tipo || !descricao || preco_unitario <= 0) {
    toast('Preencha tipo, descrição e preço unitário', 'warning');
    return;
  }

  // Verifica se já existe um tipo com esse identificador
  const { data: existente } = await sb.from('precos_copia').select('id').eq('tipo', tipo).maybeSingle();
  if (existente) {
    toast('Já existe um tipo com esse identificador', 'error');
    return;
  }

  const { error } = await sb.from('precos_copia').insert({
    tipo,
    descricao,
    preco_unitario,
    preco_desconto,
    qtd_desconto,
    preco_cartao,
    ativo
  });

  if (error) {
    toast('Erro ao criar: ' + error.message, 'error');
    return;
  }

  toast('Novo tipo de cópia criado!', 'success');
  closeModal();
  await loadPrecosCopia(); // recarrega o state
  navigate('precos');       // re-renderiza a página
};

window.editarPreco = async function(id) {
  const {data} = await sb.from('precos_copia').select('*').eq('id',id).single();
  if(!data) return;
  openModal('Editar Preço — '+data.descricao,`
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field"><label>Descrição</label><input type="text" class="input" id="preco-desc" value="${data.descricao}" /></div>
      <div class="form-row form-row--3">
        <div class="field"><label>Preço Unitário *</label><input type="number" class="input" id="preco-unit" value="${data.preco_unitario}" step="0.01" min="0" /></div>
        <div class="field"><label>Preço c/ Desconto</label><input type="number" class="input" id="preco-desc-val" value="${data.preco_desconto||''}" step="0.01" min="0" /></div>
        <div class="field"><label>A partir de (qtd)</label><input type="number" class="input" id="preco-qtd" value="${data.qtd_desconto||100}" min="1" /></div>
      </div>
      <div class="field">
        <label>💳 Preço no Cartão (opcional)</label>
        <input type="number" class="input" id="preco-cartao" value="${data.preco_cartao||''}" step="0.01" min="0" placeholder="Deixe vazio para usar o preço normal" />
      </div>
      <label style="display:flex;align-items:center;gap:var(--sp-3);cursor:pointer">
        <input type="checkbox" id="preco-ativo" ${data.ativo?'checked':''}> <span>Ativo no PDV</span>
      </label>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarPreco('${id}')">💾 Salvar Preço</button>
    </div>
  `);
};
window.salvarPreco = async function(id) {
  const p = {
    descricao: document.getElementById('preco-desc').value.trim(),
    preco_unitario: parseFloat(document.getElementById('preco-unit').value)||0,
    preco_desconto: parseFloat(document.getElementById('preco-desc-val').value)||null,
    qtd_desconto: parseInt(document.getElementById('preco-qtd').value)||100,
    preco_cartao: parseFloat(document.getElementById('preco-cartao').value)||null,
    ativo: document.getElementById('preco-ativo').checked,
  };
  const {error} = await sb.from('precos_copia').update(p).eq('id',id);
  if(error){toast('Erro: '+error.message,'error');return;}
  await loadPrecosCopia();
  toast('Preço atualizado!','success');closeModal();navigate('precos');
};

// ============================================================
// ── HELPERS GLOBAIS ───────────────────────────────────────
// ============================================================
function labelPagamento(p) {
  const m = {
    dinheiro:      '💵 Efectivo',
    pix:           '☑ QR (₲)',
    pix_brl:       '🇧🇷 Pix (R$)',
    cartao_debito: '💳 Débito',
    cartao_credito:'💳 Crédito',
    fiado:         '📒 Fiado',
    // cheque:        '📄 Cheque',
    transferencia: '🔄 Transfer.',
  };
  return m[p] || p;
}
function labelTipoCopia(tipo) {
  const m = { pb_laser:'P&B Laser', pb_tinta:'P&B Tinta', colorida_laser:'Colorida Laser', colorida_tinta:'Colorida Tinta', foto_laser:'Foto Laser', foto_tinta:'Foto Tinta', a3_pb:'A3 P&B', a3_colorida:'A3 Colorida' };
  return m[tipo] || tipo;
}
function iconeTipoCopia(tipo) {
  if (tipo.startsWith('colorida') || tipo === 'a3_colorida') return '🎨';
  if (tipo.startsWith('foto')) return '📷';
  if (tipo.startsWith('a3')) return '📐';
  return '📄';
}
function badgeStatus(status) {
  const m = {
    aguardando:  'badge--warning',
    processando: 'badge--info',
    concluido:   'badge--success',
    cancelado:   'badge--danger',
    erro:        'badge--danger',
    vendida:     'badge--primary',
    embarcada:   'badge--success',
  };
  const labels = {
    vendida:'Vendida', embarcada:'Embarcada', cancelada:'Cancelada',
    concluido:'Concluído', aguardando:'Aguardando', cancelado:'Cancelado',
  };
  return `<span class="badge ${m[status]||'badge--primary'}">${labels[status]||status}</span>`;
}
window.filtrarTabela = debounce(function(q, tableId) {
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}, 200);


// ============================================================
// ── MÓDULO: PASSAGENS DE ÔNIBUS (NSA) ────────────────────
// ============================================================

// ============================================================
// ── MÓDULO: PASSAGENS (REFATORADO) ──────────────────────
// ============================================================

async function renderPassagens(el) {
  // Roles de visibilidades
  const userRole = State.userProfile?.role || 'funcionario';
  const isAdmin = userRole === 'admin'
  
  // Carrega configurações de comissão
  const { data: comissoes } = await sb.from('config_comissoes').select('*');
  const mapComissao = {};
  (comissoes || []).forEach(c => mapComissao[c.forma_pagamento] = c.percentual_comissao);

  // Busca passagens
  const { data: passagens, error } = await sb.from('passagens_onibus')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-sub">Erro ao carregar passagens</div></div>`;
    return;
  }

  // Filtro de período (inicial: todos)
  let periodo = 'todos';

  // Monta HTML
  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">🚌 Passagens NSA</div>
        <div class="section-sub">Registro de venda de passagens — agência credenciada NSA</div>
      </div>
      <div style="display:flex;gap:var(--sp-3)">
        ${isAdmin ? `<button class="btn btn--ghost" onclick="abrirConfigComissoes()">⚙️ Configurar Comissões</button>` : ''}
        <button class="btn btn--primary" onclick="abrirModalPassagem()">+ Nova Passagem</button>
      </div>
    </div>

    <!-- Cards de resumo (calculados em tempo real) -->
    <div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin-bottom:var(--sp-5)">
      <div class="stat-card stat-card--primary">
        <div class="stat-card-header"><span class="stat-card-label">Vendas (total)</span><span class="stat-card-icon">🎫</span></div>
        <div class="stat-card-value" id="total-vendido">${formatMoney(0)}</div>
        <div class="stat-card-sub" id="total-vendido-count">0 passagens</div>
      </div>
      <div class="stat-card stat-card--danger">
        <div class="stat-card-header"><span class="stat-card-label">Repasse Pendente</span><span class="stat-card-icon">⏳</span></div>
        <div class="stat-card-value" id="total-repasse-pendente">${formatMoney(0)}</div>
        <div class="stat-card-sub" id="total-repasse-count">0 passagens</div>
      </div>
      <div class="stat-card stat-card--success">
        <div class="stat-card-header"><span class="stat-card-label">Comissão Confirmada</span><span class="stat-card-icon">✅</span></div>
        <div class="stat-card-value" id="total-comissao-confirmada">${formatMoney(0)}</div>
        <div class="stat-card-sub" id="total-comissao-count">0 passagens</div>
      </div>
    </div>

    <!-- Filtros e ações em lote -->
    <div style="display:flex;gap:var(--sp-3);margin-bottom:var(--sp-4);flex-wrap:wrap;align-items:center">
      <div class="chip-row">
        <span class="chip active" onclick="filtrarPassagensPeriodo(this,'todos')">Todas</span>
        <span class="chip" onclick="filtrarPassagensPeriodo(this,'hoje')">Hoje</span>
        <span class="chip" onclick="filtrarPassagensPeriodo(this,'semana')">Esta semana</span>
        <span class="chip" onclick="filtrarPassagensPeriodo(this,'mes')">Este mês</span>
      </div>
      <div style="margin-left:auto;display:flex;gap:var(--sp-2)">
        <button class="btn btn--success btn--sm" onclick="confirmarRepasseLote()">✅ Confirmar Repasse (selecionados)</button>
        <button class="btn btn--danger btn--sm" onclick="cancelarPassagensLote()">✕ Cancelar (selecionados)</button>
      </div>
    </div>

    <!-- Tabela -->
    <div class="card">
      <div class="table-wrap">
        <table id="tabela-passagens">
          <thead>
            <tr>
              <th style="width:32px"><input type="checkbox" id="select-all-passagens" onchange="toggleSelectAllPassagens()" /></th>
              <th>#</th>
              <th>Origem</th>
              <th>Destino</th>
              <th>Data da Compra</th>
              <th>Valor Total</th>
              <th>Forma de Pagamento</th>
              <th>Comissão</th>
              <th>Repasse</th>
              <th>Status</th>
              <th>Repasse Confirmado</th>
            </tr>
          </thead>
          <tbody id="tbody-passagens">
            <!-- Preenchido via JS -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Função para renderizar linhas com base no período
  window._renderLinhasPassagens = function(passagens, periodo) {
    const tbody = document.getElementById('tbody-passagens');
    if (!tbody) return;

    const now = new Date();
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay()); // domingo
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

    const filtradas = passagens.filter(p => {
      const data = new Date(p.created_at);
      if (periodo === 'hoje') return data >= hoje;
      if (periodo === 'semana') return data >= inicioSemana;
      if (periodo === 'mes') return data >= inicioMes;
      return true;
    });

    // Atualiza cards de resumo
    const totalVendido = filtradas.reduce((s, p) => s + p.valor_total, 0);
    const totalRepassePendente = filtradas.filter(p => p.status !== 'cancelada' && !p.repasse_confirmado).reduce((s, p) => s + p.valor_repasse, 0);
    const totalComissaoConfirmada = filtradas.filter(p => p.repasse_confirmado).reduce((s, p) => s + p.valor_comissao, 0);

    document.getElementById('total-vendido').textContent = formatMoney(totalVendido);
    document.getElementById('total-vendido-count').textContent = `${filtradas.length} passagens`;
    document.getElementById('total-repasse-pendente').textContent = formatMoney(totalRepassePendente);
    document.getElementById('total-repasse-count').textContent = `${filtradas.filter(p => p.status !== 'cancelada' && !p.repasse_confirmado).length} passagens`;
    document.getElementById('total-comissao-confirmada').textContent = formatMoney(totalComissaoConfirmada);
    document.getElementById('total-comissao-count').textContent = `${filtradas.filter(p => p.repasse_confirmado).length} passagens`;

    if (filtradas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-sub">Nenhuma passagem encontrada</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtradas.map(p => {
      const isCancelada = p.status === 'cancelada';
      return `
        <tr data-id="${p.id}" data-status="${p.status}" data-repasse="${p.repasse_confirmado}" style="${isCancelada ? 'opacity:0.5' : ''}">
          <td><input type="checkbox" class="checkbox-passagem" data-id="${p.id}" ${isCancelada ? 'disabled' : ''} /></td>
          <td class="td-mono">#${p.numero_venda}</td>
          <td>${p.origem || '—'}</td>
          <td>${p.destino || '—'}</td>
          <td class="td-mono">${formatDateTime(p.created_at)}</td>
          <td style="font-weight:700">${formatMoney(p.valor_total)}</td>
          <td><span class="badge badge--primary">${labelPagamento(p.forma_pagamento)}</span></td>
          <td style="color:${p.repasse_confirmado ? 'var(--c-success)' : 'var(--c-warning)'}">${formatMoney(p.valor_comissao)}</td>
          <td style="color:var(--c-danger)">${formatMoney(p.valor_repasse)}</td>
          <td>${badgeStatus(p.status)}</td>
          <td>${p.repasse_confirmado ? '<span class="badge badge--success">✓</span>' : '<span class="badge badge--warning">⏳</span>'}</td>
        </tr>
      `;
    }).join('');
  };

  // Renderiza inicial
  window._renderLinhasPassagens(passagens, 'todos');

  // Guarda dados globalmente para filtros
  window._passagensData = passagens;

  // Função de filtro
  window.filtrarPassagensPeriodo = function(chip, periodo) {
    document.querySelectorAll('.chip-row .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    window._renderLinhasPassagens(window._passagensData, periodo);
  };
}

// ── Selecionar todos ──────────────────────────────────────
window.toggleSelectAllPassagens = function() {
  const checked = document.getElementById('select-all-passagens').checked;
  document.querySelectorAll('.checkbox-passagem').forEach(cb => {
    if (!cb.disabled) cb.checked = checked;
  });
};

// ── Obter IDs selecionados ───────────────────────────────
function getIdsSelecionados() {
  const ids = [];
  document.querySelectorAll('.checkbox-passagem:checked').forEach(cb => {
    ids.push(cb.dataset.id);
  });
  return ids;
}

// ── Confirmar Repasse em Lote ────────────────────────────
window.confirmarRepasseLote = async function() {
  const ids = getIdsSelecionados();
  if (ids.length === 0) { toast('Selecione ao menos uma passagem', 'warning'); return; }

  if (!confirm(`Confirmar repasse de ${ids.length} passagem(ns)?`)) return;

  try {
    for (const id of ids) {
      // Buscar dados da passagem
      const { data: p } = await sb.from('passagens_onibus').select('*').eq('id', id).single();
      if (!p || p.repasse_confirmado || p.status === 'cancelada') continue;

      // Marcar repasse confirmado
      await sb.from('passagens_onibus').update({
        repasse_confirmado: true,
        repasse_confirmado_em: new Date().toISOString()
      }).eq('id', id);

      // Marcar conta de repasse como paga (se existir)
      if (p.conta_repasse_id) {
        await sb.from('contas').update({
          pago_em: new Date().toISOString().split('T')[0],
          valor_pago: p.valor_repasse,
          status: 'paga'
        }).eq('id', p.conta_repasse_id);
      }

      // Registrar comissão como receita (se ainda não registrada)
      // Evitar duplicidade verificando se já existe conta com passagem_id
      const { data: existing } = await sb.from('contas')
        .select('id')
        .eq('passagem_id', id)
        .eq('tipo_interno', 'comissao_nsa')
        .maybeSingle();
      if (!existing) {
        await sb.from('contas').insert({
          descricao: `Comissão NSA — Passagem #${p.numero_venda}`,
          tipo: 'receita',
          valor: p.valor_comissao,
          vencimento: new Date().toISOString().split('T')[0],
          pago_em: new Date().toISOString().split('T')[0],
          valor_pago: p.valor_comissao,
          categoria: 'Comissão NSA',
          tipo_interno: 'comissao_nsa',
          passagem_id: id,
          status: 'paga'
        });
      }
    }
    toast(`✅ ${ids.length} repasse(s) confirmado(s)!`, 'success');
    navigate('passagens');
  } catch (err) {
    toast('Erro ao confirmar repasses: ' + err.message, 'error');
  }
};

// ── Cancelar em Lote ──────────────────────────────────────
window.cancelarPassagensLote = async function() {
  const ids = getIdsSelecionados();
  if (ids.length === 0) { toast('Selecione ao menos uma passagem', 'warning'); return; }

  if (!confirm(`Cancelar ${ids.length} passagem(ns)? Esta ação não pode ser desfeita.`)) return;

  try {
    for (const id of ids) {
      const { data: p } = await sb.from('passagens_onibus').select('conta_repasse_id').eq('id', id).single();
      await sb.from('passagens_onibus').update({ status: 'cancelada' }).eq('id', id);
      if (p?.conta_repasse_id) {
        await sb.from('contas').update({ status: 'cancelada' }).eq('id', p.conta_repasse_id);
      }
    }
    toast(`🚫 ${ids.length} passagem(ns) cancelada(s)!`, 'info');
    navigate('passagens');
  } catch (err) {
    toast('Erro ao cancelar: ' + err.message, 'error');
  }
};

window.abrirModalPassagem = async function() {
  const { data: comissoes } = await sb.from('config_comissoes').select('forma_pagamento, percentual_comissao');

  openModal('🚌 Nova Venda de Passagem NSA', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="divider-text">Dados da Passagem</div>
      <div class="form-row form-row--2">
        <div class="field"><label>Origem *</label><input type="text" class="input" id="pas-origem" placeholder="Ex: Asunción" /></div>
        <div class="field"><label>Destino *</label><input type="text" class="input" id="pas-destino" placeholder="Ex: Ciudad del Este" /></div>
      </div>
      <div class="field">
        <label>Valor Total (₲) *</label>
        <input type="number" class="input" id="pas-valor-total" placeholder="0" step="500" min="0" oninput="atualizarBRLPassagem()" />
      </div>
      <div class="field">
        <label>Forma de Pagamento</label>
        <select class="input" id="pas-pagamento" onchange="atualizarBRLPassagem()">
          ${(comissoes||[]).map(c => `
            <option value="${c.forma_pagamento}">${labelPagamento(c.forma_pagamento)}</option>
          `).join('')}
        </select>
      </div>
      <!-- Exibição do BRL -->
      <div id="pas-total-brl" style="display:none; text-align:right; font-size:var(--t-xs); color:var(--c-text-3); margin-top:4px">
        🇧🇷 ≈ <span id="pas-total-brl-value">R$ 0,00</span>
      </div>
      <div class="field">
        <label>Observações</label>
        <textarea class="input" id="pas-obs" rows="2" placeholder="Informações adicionais..."></textarea>
      </div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarPassagem()">
        🎫 Registrar Venda de Passagem
      </button>
    </div>
  `, 'modal--lg');

  // Define a função global para atualizar o BRL (e também a comissão, se quiser)
  window.atualizarBRLPassagem = function() {
    const total = parseFloat(document.getElementById('pas-valor-total')?.value || 0);
    const pagamento = document.getElementById('pas-pagamento')?.value;
    const isPix = pagamento === 'pix' || pagamento === 'pix_brl';

    const brlDiv = document.getElementById('pas-total-brl');
    const brlVal = document.getElementById('pas-total-brl-value');
    if (brlDiv && brlVal) {
      brlDiv.style.display = isPix ? 'block' : 'none';
      if (isPix) {
        const valorBRL = gsToBRL(total);
        brlVal.textContent = formatBRL(valorBRL);
      }
    }
  };

  // Inicializa o estado
  setTimeout(atualizarBRLPassagem, 100);
};



// ── Filtro por status ─────────────────────────────────────
window.filtrarPassagemStatus = function(chip, filtro) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  document.querySelectorAll('#tabela-passagens tbody tr').forEach(tr => {
    if (!filtro) { tr.style.display = ''; return; }
    const status  = tr.dataset.status || '';
    const repasse = tr.dataset.repasse === 'false';
    if (filtro === 'repasse_pendente') {
      tr.style.display = (status !== 'cancelada' && repasse) ? '' : 'none';
    } else {
      tr.style.display = status === filtro ? '' : 'none';
    }
  });
};


// ── Toggle ida/volta ──────────────────────────────────────
window.toggleIdaVolta = function() {
  const tipo = document.getElementById('pas-tipo-trecho')?.value;
  const campos = document.getElementById('campos-volta');
  if (campos) campos.style.display = tipo === 'ida_volta' ? 'block' : 'none';
};

// ── Toggle Pix BRL na passagem ────────────────────────────
window.togglePixBrlPassagem = function() {
  const pag = document.getElementById('pas-pagamento')?.value;
  const campo = document.getElementById('campo-brl-passagem');
  if (campo) campo.style.display = pag === 'pix_brl' ? 'block' : 'none';
};

window.mostrarEquivBRLPassagem = function() {
  const brl = parseFloat(document.getElementById('pas-valor-brl')?.value || 0);
  const gs  = brlToGs(brl);
  const el  = document.getElementById('equiv-brl-passagem');
  if (el) el.textContent = `≈ ${formatMoney(gs)} (cotação ₲${APP_CONFIG.cotacaoBRL.toLocaleString('es-PY')}/R$)`;
};

// ── Calcular preview financeiro ───────────────────────────
window.calcularComissaoPassagem = function() {
  const total = Math.round(parseFloat(document.getElementById('pas-valor-total')?.value || 0));
  const perc  = parseFloat(document.getElementById('pas-perc-comissao')?.value || 0);
  const preview = document.getElementById('preview-financeiro-passagem');

  if (!total || total <= 0) { if (preview) preview.style.display = 'none'; return; }

  const comissao = Math.round(total * perc / 100);
  const repasse  = total - comissao;

  const elTotal    = document.getElementById('prev-total');
  const elRepasse  = document.getElementById('prev-repasse');
  const elComissao = document.getElementById('prev-comissao');

  if (elTotal)    elTotal.textContent    = formatMoney(total);
  if (elRepasse)  elRepasse.textContent  = formatMoney(repasse);
  if (elComissao) elComissao.textContent = formatMoney(comissao);
  if (preview)    preview.style.display  = 'block';
};

// ── Salvar passagem ───────────────────────────────────────
window.salvarPassagem = async function() {
  const origem = document.getElementById('pas-origem')?.value.trim();
  const destino = document.getElementById('pas-destino')?.value.trim();
  const valorTotal = Math.round(parseFloat(document.getElementById('pas-valor-total')?.value || 0));
  const formaPagamento = document.getElementById('pas-pagamento')?.value;

  if (!origem || !destino) { toast('Informe origem e destino', 'warning'); return; }
  if (!valorTotal) { toast('Informe o valor total', 'warning'); return; }

  // Busca a comissão configurada para a forma de pagamento escolhida
  const { data: config } = await sb.from('config_comissoes')
    .select('percentual_comissao')
    .eq('forma_pagamento', formaPagamento)
    .single();

  const percComissao = config?.percentual_comissao || 0;
  const valorComissao = Math.round(valorTotal * percComissao / 100);
  const valorRepasse = valorTotal - valorComissao;

  const payload = {
    origem,
    destino,
    valor_total: valorTotal,
    valor_repasse: valorRepasse,
    valor_comissao: valorComissao,
    percentual_comissao: percComissao,
    forma_pagamento: formaPagamento,
    status: 'vendida',
    repasse_confirmado: false,
    observacoes: document.getElementById('pas-obs')?.value || null,
    // Campos não mais usados, mas mantidos para compatibilidade
    cliente_nome: null,
    numero_passagem: null,
    data_viagem: null,
    horario_saida: null,
    tipo_trecho: 'ida',
    numero_assento: null,
  };

  const { data: passagem, error } = await sb.from('passagens_onibus').insert(payload).select().single();
  if (error) { toast('Erro ao registrar: ' + error.message, 'error'); return; }

  // Criar conta a pagar (repasse NSA)
  const vencRepasse = new Date();
  vencRepasse.setDate(vencRepasse.getDate() + 7);
  await sb.from('contas').insert({
    descricao: `Repasse NSA — Passagem #${passagem.numero_venda}`,
    tipo: 'despesa',
    valor: valorRepasse,
    vencimento: vencRepasse.toISOString().split('T')[0],
    categoria: 'Repasse NSA',
    tipo_interno: 'repasse_nsa',
    passagem_id: passagem.id,
    status: 'pendente'
  });

  toast('✅ Passagem registrada!', 'success', 4000);
  closeModal();
  navigate('passagens');
};

window.abrirConfigComissoes = async function() {
  const { data: comissoes } = await sb.from('config_comissoes').select('*').order('forma_pagamento');

  openModal('⚙️ Configurar Comissões por Forma de Pagamento', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="font-size:var(--t-sm);color:var(--c-text-3)">Ajuste o percentual de comissão para cada forma de pagamento. O valor é aplicado sobre o total da passagem.</div>
      ${(comissoes||[]).map(c => `
        <div style="display:flex;align-items:center;gap:var(--sp-3);background:var(--c-bg);padding:var(--sp-3);border-radius:var(--r-md)">
          <span style="flex:1;font-weight:600">${labelPagamento(c.forma_pagamento)}</span>
          <input type="number" class="input" id="comissao-${c.id}" value="${c.percentual_comissao}" step="0.5" min="0" max="100" style="width:100px" />
          <span>%</span>
        </div>
      `).join('')}
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarConfigComissoes()">💾 Salvar Configurações</button>
    </div>
  `, 'modal--lg');
};

window.salvarConfigComissoes = async function() {
  const inputs = document.querySelectorAll('[id^="comissao-"]');
  const updates = [];
  inputs.forEach(input => {
    const id = input.id.replace('comissao-', '');
    const valor = parseFloat(input.value);
    if (!isNaN(valor) && valor >= 0) {
      updates.push({ id, percentual_comissao: valor });
    }
  });
  for (const u of updates) {
    await sb.from('config_comissoes').update({ percentual_comissao: u.percentual_comissao }).eq('id', u.id);
  }
  toast('Configurações salvas!', 'success');
  closeModal();
  navigate('passagens');
};

window.salvarConfigComissoes = async function() {
  const inputs = document.querySelectorAll('[id^="comissao-"]');
  const updates = [];
  inputs.forEach(input => {
    const id = input.id.replace('comissao-', '');
    const valor = parseFloat(input.value);
    if (!isNaN(valor) && valor >= 0) {
      updates.push({ id, percentual_comissao: valor });
    }
  });
  for (const u of updates) {
    await sb.from('config_comissoes').update({ percentual_comissao: u.percentual_comissao }).eq('id', u.id);
  }
  toast('Configurações salvas!', 'success');
  closeModal();
  navigate('passagens');
};

// ── Confirmar Repasse NSA ─────────────────────────────────
window.confirmarRepasseNSA = function(id, clienteNome, valorRepasse, valorComissao) {
  openModal('Confirmar Repasse NSA', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-sm);color:var(--c-text-2);margin-bottom:var(--sp-3)">
          Passageiro: <strong>${clienteNome}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--sp-2)">
          <span style="color:var(--c-text-3)">Repasse para NSA</span>
          <span style="font-weight:700;color:var(--c-danger)">${formatMoney(valorRepasse)}</span>
        </div>
        <div class="divider"></div>
        <div style="display:flex;justify-content:space-between">
          <span style="font-weight:600">Comissão que fica na loja</span>
          <span style="font-size:var(--t-xl);font-weight:800;color:var(--c-success)">${formatMoney(valorComissao)}</span>
        </div>
      </div>

      <div class="field">
        <label>Data do Repasse</label>
        <input type="date" class="input" id="repasse-data" value="${new Date().toISOString().split('T')[0]}" />
      </div>
      <div class="field">
        <label>Forma de Pagamento do Repasse</label>
        <select class="input" id="repasse-forma">
          ${['dinheiro','pix','transferencia','cheque'].map(p=>`<option value="${p}">${labelPagamento(p)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Observações</label>
        <input type="text" class="input" id="repasse-obs" placeholder="Comprovante, referência..." />
      </div>

      <div style="background:var(--c-success-s);border:1px solid var(--c-success);border-radius:var(--r-md);padding:var(--sp-3);font-size:var(--t-sm);color:var(--c-success)">
        ✅ Ao confirmar, a comissão <strong>${formatMoney(valorComissao)}</strong> será registrada como lucro realizado
        e a conta de repasse será marcada como paga.
      </div>

      <button class="btn btn--success btn--lg" style="width:100%;justify-content:center"
              onclick="executarConfirmacaoRepasse('${id}', ${valorRepasse}, ${valorComissao})">
        ✅ Confirmar Pagamento do Repasse
      </button>
    </div>
  `);
};

window.executarConfirmacaoRepasse = async function(passagemId, valorRepasse, valorComissao) {
  const dataRepasse = document.getElementById('repasse-data')?.value;
  const formaRepasse = document.getElementById('repasse-forma')?.value;
  const obsRepasse   = document.getElementById('repasse-obs')?.value;

  // 1. Marca a passagem como repasse confirmado
  const { error: e1 } = await sb.from('passagens_onibus').update({
    repasse_confirmado:    true,
    repasse_confirmado_em: new Date().toISOString(),
  }).eq('id', passagemId);
  if (e1) { toast('Erro: ' + e1.message, 'error'); return; }

  // 2. Busca a conta de repasse vinculada e marca como paga
  const { data: passagem } = await sb.from('passagens_onibus')
    .select('conta_repasse_id, numero_venda').eq('id', passagemId).single();

  if (passagem?.conta_repasse_id) {
    await sb.from('contas').update({
      pago_em:         dataRepasse,
      valor_pago:      valorRepasse,
      forma_pagamento: formaRepasse,
      status:          'paga',
      observacoes:     obsRepasse || null,
    }).eq('id', passagem.conta_repasse_id);
  }

  // 3. Registra a comissão como receita confirmada
  await sb.from('contas').insert({
    descricao:    `Comissão NSA — Passagem #${passagem?.numero_venda || '?'}`,
    tipo:         'receita',
    valor:        valorComissao,
    vencimento:   dataRepasse,
    pago_em:      dataRepasse,
    valor_pago:   valorComissao,
    categoria:    'Comissão NSA',
    tipo_interno: 'comissao_nsa',
    passagem_id:  passagemId,
    status:       'paga',
  });

  toast('🎉 Repasse confirmado! Comissão registrada como receita.', 'success', 5000);
  closeModal();
  navigate('passagens');
};

// ── Ver detalhe da passagem ───────────────────────────────
window.verDetalhePassagem = async function(id) {
  const { data: p } = await sb.from('passagens_onibus').select('*').eq('id', id).single();
  if (!p) return;

  openModal(`Passagem #${p.numero_venda} — ${p.numero_passagem}`, `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4);font-size:var(--t-sm)">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)">
        <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
          <div style="font-size:var(--t-xs);color:var(--c-text-3);margin-bottom:var(--sp-3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Passageiro</div>
          <div style="font-weight:700;font-size:var(--t-md)">${p.cliente_nome}</div>
          ${p.cliente_cpf ? `<div style="color:var(--c-text-3)">${p.cliente_cpf}</div>` : ''}
          ${p.cliente_telefone ? `<div style="color:var(--c-text-3)">${p.cliente_telefone}</div>` : ''}
        </div>
        <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
          <div style="font-size:var(--t-xs);color:var(--c-text-3);margin-bottom:var(--sp-3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Passagem</div>
          <div style="font-weight:700;color:var(--c-primary);font-family:var(--font-mono)">${p.numero_passagem}</div>
          <div style="margin-top:4px">${badgeStatus(p.status)}</div>
        </div>
      </div>

      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-xs);color:var(--c-text-3);margin-bottom:var(--sp-3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Trajeto</div>
        <div style="font-size:var(--t-lg);font-weight:700">${p.origem} → ${p.destino}</div>
        <div style="display:flex;gap:var(--sp-6);margin-top:var(--sp-3)">
          <div>
            <div style="color:var(--c-text-3);font-size:var(--t-xs)">Ida</div>
            <div style="font-weight:600">${formatDate(p.data_viagem)} às ${p.horario_saida?.slice(0,5)}</div>
            <div style="color:var(--c-text-3)">Assento: <strong>${p.numero_assento||'—'}</strong></div>
          </div>
          ${p.tipo_trecho === 'ida_volta' ? `
          <div style="border-left:1px solid var(--c-border);padding-left:var(--sp-6)">
            <div style="color:var(--c-text-3);font-size:var(--t-xs)">Volta</div>
            <div style="font-weight:600">${formatDate(p.data_retorno)||'—'} às ${p.horario_retorno?.slice(0,5)||'—'}</div>
            <div style="color:var(--c-text-3)">Assento: <strong>${p.numero_assento_volta||'—'}</strong></div>
          </div>` : ''}
        </div>
        <div style="margin-top:var(--sp-3)">
          <span class="badge ${p.tipo_trecho==='ida_volta'?'badge--accent':'badge--info'}">
            ${p.tipo_trecho==='ida_volta'?'↔ Ida e Volta':'→ Somente Ida'}
          </span>
        </div>
      </div>

      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-xs);color:var(--c-text-3);margin-bottom:var(--sp-3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Financeiro</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--sp-3);text-align:center">
          <div>
            <div style="font-size:var(--t-xs);color:var(--c-text-3)">Valor Total</div>
            <div style="font-weight:700;font-size:var(--t-lg)">${formatMoney(p.valor_total)}</div>
          </div>
          <div>
            <div style="font-size:var(--t-xs);color:var(--c-text-3)">Repasse NSA</div>
            <div style="font-weight:700;font-size:var(--t-lg);color:var(--c-danger)">${formatMoney(p.valor_repasse)}</div>
          </div>
          <div>
            <div style="font-size:var(--t-xs);color:var(--c-text-3)">Comissão (${p.percentual_comissao||'—'}%)</div>
            <div style="font-weight:700;font-size:var(--t-lg);color:${p.repasse_confirmado?'var(--c-success)':'var(--c-warning)'}">${formatMoney(p.valor_comissao)}</div>
          </div>
        </div>
        <div style="margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:1px solid var(--c-border);display:flex;justify-content:space-between">
          <span>Pagamento: <span class="badge badge--primary">${labelPagamento(p.forma_pagamento)}</span></span>
          <span>Repasse: ${p.repasse_confirmado
            ? `<span class="badge badge--success">✓ Confirmado em ${formatDate(p.repasse_confirmado_em)}</span>`
            : '<span class="badge badge--warning">⏳ Pendente</span>'
          }</span>
        </div>
        ${p.valor_brl ? `<div style="margin-top:var(--sp-2);font-size:var(--t-xs);color:var(--c-text-3)">🇧🇷 Pago em R$ ${p.valor_brl.toFixed(2)} @ ₲${p.cotacao_brl?.toLocaleString('es-PY')}/R$</div>` : ''}
      </div>

      ${p.observacoes ? `
      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-xs);color:var(--c-text-3);margin-bottom:var(--sp-2)">Observações</div>
        <div>${p.observacoes}</div>
      </div>` : ''}

      <div style="display:flex;gap:var(--sp-3)">
        ${p.status === 'vendida' && !p.repasse_confirmado
          ? `<button class="btn btn--success" style="flex:1;justify-content:center"
                     onclick="closeModal();confirmarRepasseNSA('${p.id}','${p.cliente_nome.replace(/'/g,"\'")}',${p.valor_repasse},${p.valor_comissao})">
               ⏳ Confirmar Repasse
             </button>`
          : ''}
        ${p.status === 'vendida'
          ? `<button class="btn btn--ghost" style="justify-content:center"
                     onclick="marcarEmbarcada('${p.id}')">✈️ Marcar como Embarcado</button>` : ''}
      </div>
    </div>
  `, 'modal--lg');
};

// ── Marcar como embarcado ─────────────────────────────────
window.marcarEmbarcada = async function(id) {
  const { error } = await sb.from('passagens_onibus').update({ status: 'embarcada' }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Passagem marcada como embarcada!', 'success');
  closeModal();
  navigate('passagens');
};

// ── Cancelar passagem ─────────────────────────────────────
window.cancelarPassagem = async function(id) {
  if (!confirm('Cancelar esta passagem? Esta ação não pode ser desfeita.')) return;
  const { error } = await sb.from('passagens_onibus').update({ status: 'cancelada' }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  // Cancela também a conta de repasse vinculada
  const { data: p } = await sb.from('passagens_onibus').select('conta_repasse_id').eq('id', id).single();
  if (p?.conta_repasse_id) {
    await sb.from('contas').update({ status: 'cancelada' }).eq('id', p.conta_repasse_id);
  }
  toast('Passagem cancelada.', 'info');
  navigate('passagens');
};

// ── Configurar comissão padrão ────────────────────────────
window.abrirConfigPassagens = async function() {
  const { data: config } = await sb.from('config_passagens').select('*').eq('ativo', true).single();
  openModal('⚙️ Configuração de Comissão NSA', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4);font-size:var(--t-sm);color:var(--c-text-3);line-height:1.7">
        O percentual de comissão é o quanto <strong style="color:var(--c-success)">fica para a sua loja</strong>.
        O restante é o repasse que você deve fazer para a NSA.
        Por exemplo: se a comissão é 10% e a passagem vale ₲100.000,
        você repassa ₲90.000 para a NSA e fica com ₲10.000 de lucro.
      </div>
      <div class="field">
        <label>% de Comissão da Loja (padrão para novas vendas)</label>
        <input type="number" class="input" id="cfg-perc"
               value="${config?.percentual_comissao || 10}"
               step="0.5" min="0" max="50" />
      </div>
      <div class="field">
        <label>Nome da Empresa de Ônibus</label>
        <input type="text" class="input" id="cfg-empresa" value="${config?.empresa_onibus || 'NSA'}" />
      </div>
      <div class="field">
        <label>Observações</label>
        <textarea class="input" id="cfg-obs" rows="2">${config?.observacoes || ''}</textarea>
      </div>
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center"
              onclick="salvarConfigPassagens('${config?.id || ''}')">
        💾 Salvar Configuração
      </button>
    </div>
  `);
};

window.salvarConfigPassagens = async function(id) {
  const payload = {
    percentual_comissao: parseFloat(document.getElementById('cfg-perc')?.value || 10),
    empresa_onibus:      document.getElementById('cfg-empresa')?.value || 'NSA',
    observacoes:         document.getElementById('cfg-obs')?.value || null,
  };
  const { error } = id
    ? await sb.from('config_passagens').update(payload).eq('id', id)
    : await sb.from('config_passagens').insert(payload);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Configuração salva!', 'success');
  closeModal();
};


// ============================================================
// ── MÓDULO: FILA DE PRODUÇÃO ─────────────────────────────
// ============================================================
// Arquitetura de estados:
//   na_fila      → pedido registrado no PDV, aguardando operador iniciar
//   imprimindo   → operador iniciou a impressão
//   conferencia  → impressão terminou, aguardando conferência física
//   concluido    → conferido e entregue (contadores e caixa atualizados)
//   erro         → falha durante impressão, aguardando reprocessamento
//   cancelado    → pedido cancelado
// ============================================================

// Intervalo de auto-refresh da fila (ms)
const FILA_REFRESH_MS = 60000;
let _filaRefreshTimer = null;

async function renderFilaProducao(el) {
  // Limpa timer anterior se existir
  if (_filaRefreshTimer) { clearInterval(_filaRefreshTimer); _filaRefreshTimer = null; }

  await loadImpressoras();

  el.innerHTML = `
    <div class="fila-layout">

      <!-- Topbar da fila -->
      <div class="fila-topbar">
        <div class="live-dot" title="Atualização automática a cada ${FILA_REFRESH_MS/1000}s"></div>
        <span style="font-size:var(--t-sm);font-weight:600">Fila de Produção</span>
        <span style="font-size:var(--t-xs);color:var(--c-text-3)" id="fila-ultima-atualizacao"></span>
        <span style="font-size:var(--t-xs);color:var(--c-text-3)">💡 Arraste um pedido sobre outro para juntá-los no mesmo carrinho</span>
        <button class="btn btn--ghost btn--sm" onclick="limparConcluidos()">🧹 Limpar Concluídos</button>

        <div style="margin-left:auto;display:flex;gap:var(--sp-2);flex-wrap:wrap">
          <!-- Filtro de status -->
          <div class="chip-row" id="fila-filtros">
            <span class="chip active" onclick="filtrarFila(this,'todos')">Todos</span>
            <span class="chip" onclick="filtrarFila(this,'na_fila')">🟡 Na Fila</span>
            <span class="chip" onclick="filtrarFila(this,'imprimindo')">🔵 Imprimindo</span>
            <span class="chip" onclick="filtrarFila(this,'conferencia')">🟠 Conferência</span>
            <span class="chip" onclick="filtrarFila(this,'concluido')">🟢 Concluídos</span>
          </div>
          <button class="btn btn--ghost btn--sm" onclick="refreshFila()" id="btn-refresh-fila">↻ Atualizar</button>
        </div>
      </div>

      <!-- Colunas por impressora -->
      <div class="fila-body" id="fila-body">
        <div style="display:flex;align-items:center;justify-content:center;flex:1;color:var(--c-text-3)">
          <div class="spinner"></div>
        </div>
      </div>

    </div>
  `;

  // Carrega pedidos e renderiza
  await refreshFila();

  // Auto-refresh
  _filaRefreshTimer = setInterval(async () => {
    if (State.currentPage === 'fila') await refreshFila();
    else { clearInterval(_filaRefreshTimer); _filaRefreshTimer = null; }
  }, FILA_REFRESH_MS);
}

window.limparConcluidos = async function() {
  if (!confirm('Remover todos os pedidos concluídos da fila?')) return;
  const { error } = await sb
    .from('pedidos_copia')
    .delete()
    .eq('status', 'concluido');
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Pedidos concluídos removidos!', 'success');
  refreshFila();
};

// ── Carrega e renderiza pedidos por impressora ─────────────
window.refreshFila = async function() {
  const btn = document.getElementById('btn-refresh-fila');
  if (btn) btn.disabled = true;

  const { data: pedidos, error } = await sb
    .from('pedidos_copia')
    .select('*, impressoras(nome, status, colorida, tipo)')
    .in('status', ['na_fila', 'imprimindo', 'conferencia', 'concluido', 'erro'])
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) { toast('Erro ao carregar fila: ' + error.message, 'error'); return; }

  // IDs de carrinhos ainda pendentes (venda não finalizada — sem forma de
  // pagamento escolhida ainda). Um pedido 'concluido' cujo carrinho ainda
  // está aqui não pode sumir da fila: a impressão terminou, mas a venda
  // não. Ele só desaparece quando finalizarCarrinhoPendente() de fato
  // roda e apaga o carrinho.
  // Não depende mais da linha em carrinhos_pendentes existir: se ela não
  // puder ser apagada (FK a partir de pedidos_copia/vendas — comum quando
  // o schema não usa ON DELETE SET NULL), o carrinho ficaria "pendente
  // pra sempre". O sinal real de "pago" é forma_pagamento gravado no
  // pedido, que só acontece dentro de finalizarCarrinhoPendente().
  const aguardaPagamento = (p) => p.status === 'concluido' && !!p.carrinho_id && !p.forma_pagamento;

  const filaBody = document.getElementById('fila-body');
  if (!filaBody) return;

  const porImpressora = {};
  State.impressoras.forEach(imp => { porImpressora[imp.id] = { impressora: imp, pedidos: [] }; });

  (pedidos || []).forEach(p => {
    const key = p.impressora_id || '__sem_impressora__';
    if (!porImpressora[key]) {
      porImpressora[key] = { impressora: p.impressoras || { nome: 'Impressora removida', status: 'offline' }, pedidos: [] };
    }
    porImpressora[key].pedidos.push(p);
  });

  const filtroAtivo = document.querySelector('#fila-filtros .chip.active')?.dataset?.filtro || 'todos';

  // Mapa global: carrinho_id → quantidade total de pedidos com esse
  // carrinho, em QUALQUER impressora. Usado pra saber se um carrinho
  // juntado (drag-and-drop) está "espalhado" em mais de uma coluna.
  const carrinhoTotalJobs = {};
  (pedidos || []).forEach(p => {
    if (!p.carrinho_id) return;
    carrinhoTotalJobs[p.carrinho_id] = (carrinhoTotalJobs[p.carrinho_id] || 0) + 1;
  });

  // Construir as colunas usando um loop for...of com await
  const colunasHtml = [];
  for (const { impressora, pedidos: peds } of Object.values(porImpressora)) {
    const pedidosFiltrados = filtroAtivo === 'todos'
      ? peds.filter(p => p.status !== 'concluido' || aguardaPagamento(p))
      : peds.filter(p => p.status === filtroAtivo);

    const counts = {
      na_fila:     peds.filter(p => p.status === 'na_fila').length,
      imprimindo:  peds.filter(p => p.status === 'imprimindo').length,
      conferencia: peds.filter(p => p.status === 'conferencia').length,
      erro:        peds.filter(p => p.status === 'erro').length,
    };
    const totalAtivos = counts.na_fila + counts.imprimindo + counts.conferencia + counts.erro;
    const aguardandoPagCount = peds.filter(aguardaPagamento).length;

    let bodyHtml = '';
    if (pedidosFiltrados.length === 0) {
      bodyHtml = `<div class="fila-empty">
        <div class="fila-empty-icon">✅</div>
        <div class="fila-empty-text">${filtroAtivo === 'todos' ? 'Fila livre' : 'Nenhum pedido'}</div>
      </div>`;
    } else {
      // Agrupa os pedidos DESTA coluna por carrinho_id — quando o cliente
      // juntou dois pedidos (drag-and-drop) na mesma impressora, isso vira
      // um card só em vez de dois. `pedidosFiltrados` já está em ordem
      // crescente de created_at, então o primeiro de cada grupo é sempre
      // o pedido mais antigo (define o número/posição do card).
      const gruposMap = new Map();
      pedidosFiltrados.forEach(p => {
        const key = p.carrinho_id || `solo-${p.id}`;
        if (!gruposMap.has(key)) gruposMap.set(key, []);
        gruposMap.get(key).push(p);
      });

      const cards = await Promise.all(
        Array.from(gruposMap.values()).map(grupo => {
          const carrinhoId = grupo[0].carrinho_id;
          // "Espalhado" = o carrinho tem mais pedidos do que os que
          // apareceram aqui nesta coluna → o resto está em outra impressora.
          const espalhado = !!carrinhoId && (carrinhoTotalJobs[carrinhoId] || 0) > grupo.length;
          return grupo.length > 1
            ? renderPedidoCardGroup(grupo, espalhado)
            : renderPedidoCard(grupo[0], espalhado);
        })
      );
      bodyHtml = cards.join('');
    }

    colunasHtml.push(`
      <div class="fila-coluna">
        <div class="fila-coluna-header">
          <div class="printer-status-dot ${impressora.status || 'offline'}"></div>
          <div class="fila-coluna-nome">${impressora.nome}</div>
          ${totalAtivos > 0 ? `<span class="badge badge--warning">${totalAtivos} ativo${totalAtivos>1?'s':''}</span>` : ''}
          ${counts.imprimindo > 0 ? `<span class="badge badge--primary">⚡ Imprimindo</span>` : ''}
          ${aguardandoPagCount > 0 ? `<span class="badge badge--accent">🛒 ${aguardandoPagCount} aguardando pagamento</span>` : ''}
        </div>
        <div class="fila-coluna-body">
          ${bodyHtml}
        </div>
      </div>
    `);
  }

  filaBody.innerHTML = colunasHtml.join('') || `<div class="fila-empty" style="flex:1"><div class="fila-empty-icon">🖥️</div><div class="fila-empty-text">Nenhuma impressora cadastrada</div></div>`;

  const tsEl = document.getElementById('fila-ultima-atualizacao');
  if (tsEl) tsEl.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`;

  if (btn) btn.disabled = false;
};

window.verCarrinhoPendente = async function(pedidoId) {
  const carrinho = await obterCarrinhoPendentePorPedido(pedidoId);
  if (!carrinho) {
    // Carrinho pendente não existe mais (delete funcionou) — mostra o resumo já finalizado.
    const { data: pedido } = await sb.from('pedidos_copia').select('carrinho_id').eq('id', pedidoId).single();
    if (pedido?.carrinho_id) { await exibirResumoCarrinhoFinalizado(pedido.carrinho_id); return; }
    toast('Carrinho não encontrado.', 'error');
    return;
  }

  // Busca os pedidos de cópia vinculados a este carrinho
  const { data: pedidos, error } = await sb
    .from('pedidos_copia')
    .select('status, forma_pagamento')
    .eq('carrinho_id', carrinho.id);

  if (error) {
    toast('Erro ao verificar status dos pedidos', 'error');
    return;
  }

  // Se já foi pago (forma_pagamento gravada), a linha em carrinhos_pendentes
  // só não foi apagada por causa de FK — trata como finalizado, não reabre
  // a tela de pagamento.
  const jaPago = (pedidos || []).length > 0 && pedidos.every(p => p.forma_pagamento);
  if (jaPago) { await exibirResumoCarrinhoFinalizado(carrinho.id); return; }

  _carrinhoPendenteAtual = carrinho;

  // Verifica se todos estão concluídos ou cancelados
  const todosProntos = (pedidos || []).every(p => p.status === 'concluido' || p.status === 'cancelado');

  // Renderiza o modal com base no status
  const modalBody = renderCarrinhoPendenteModalBody(carrinho, '', todosProntos);
  openModal(`🛒 Carrinho de ${carrinho.cliente_nome || 'Cliente'}`, modalBody, 'modal--lg', _avisarFecharCarrinhoSemPagamento);
};

// Exibe o carrinho pendente a partir do ID do carrinho (não do pedido)
window.verCarrinhoPorId = async function(carrinhoId) {
  if (!carrinhoId) {
    toast('Carrinho não encontrado', 'error');
    return;
  }

  // Busca o carrinho pendente
  const { data: carrinho, error } = await sb
    .from('carrinhos_pendentes')
    .select('*')
    .eq('id', carrinhoId)
    .maybeSingle();

  if (error) {
    toast('Erro ao buscar carrinho: ' + error.message, 'error');
    return;
  }

  // Se o carrinho não existe, busca os registros finalizados
  if (!carrinho) {
    await exibirResumoCarrinhoFinalizado(carrinhoId);
    return;
  }

  // Verifica se todos os pedidos de cópia vinculados estão concluídos ou cancelados
  const { data: pedidos } = await sb
    .from('pedidos_copia')
    .select('status, forma_pagamento')
    .eq('carrinho_id', carrinhoId);

  // Já pago, mas a linha do carrinho não foi apagada (FK) — trata como finalizado.
  const jaPago = (pedidos || []).length > 0 && pedidos.every(p => p.forma_pagamento);
  if (jaPago) { await exibirResumoCarrinhoFinalizado(carrinhoId); return; }

  const todosProntos = (pedidos || []).every(p => p.status === 'concluido' || p.status === 'cancelado');

  // Se todos estão prontos, o carrinho já foi finalizado – exibe apenas visualização
  if (todosProntos && pedidos && pedidos.length > 0) {
    await exibirResumoCarrinhoFinalizado(carrinhoId);
    return;
  }

  // Caso contrário, exibe o modal de finalização (com opções de edição)
  _carrinhoPendenteAtual = carrinho;
  const modalBody = renderCarrinhoPendenteModalBody(carrinho, '', todosProntos);
  openModal(`🛒 Carrinho de ${carrinho.cliente_nome || 'Cliente'}`, modalBody, 'modal--lg', _avisarFecharCarrinhoSemPagamento);
};

// Aviso (não-bloqueante) ao fechar o modal de pagamento do carrinho sem
// ter escolhido a forma de pagamento ainda. Fechar aqui é sempre seguro:
// nada é gravado no banco até finalizarCarrinhoPendente() rodar de fato
// (a venda dos produtos e a forma de pagamento das cópias só são escritas
// no clique em "Finalizar Venda"). Então, em vez de travar o operador com
// um confirm() nativo, só avisamos e deixamos fechar — o card continua
// ali na fila, com o 🛒 Carrinho pronto pra retomar quando o cliente
// (que pode estar indeciso, querendo somar mais produtos) decidir de vez.
function _avisarFecharCarrinhoSemPagamento() {
  toast('🛒 Carrinho continua pendente na fila — toque em "Carrinho" pra retomar e adicionar mais itens antes de finalizar.', 'info', 4500);
  return true; // nunca bloqueia o fechamento
}

// Função auxiliar para exibir resumo de carrinho finalizado (read-only)
async function exibirResumoCarrinhoFinalizado(carrinhoId) {
  const [pedidosResult, vendasResult] = await Promise.all([
    sb.from('pedidos_copia')
      .select('*, impressoras(nome)')
      .eq('carrinho_id', carrinhoId),
    sb.from('vendas')
      .select('*, clientes(nome)')
      .eq('carrinho_id', carrinhoId)
  ]);

  const pedidos = pedidosResult.data || [];
  const vendas = vendasResult.data || [];

  if (pedidos.length === 0 && vendas.length === 0) {
    toast('Carrinho não encontrado', 'error');
    return;
  }

  // Busca os itens vendidos (produtos) de todas as vendas deste carrinho,
  // para exibir o que realmente foi vendido em vez do número/cliente da venda.
  let itensPorVenda = {};
  if (vendas.length > 0) {
    const { data: vendaItens } = await sb.from('venda_itens')
      .select('*, produtos(nome)')
      .in('venda_id', vendas.map(v => v.id));
    (vendaItens || []).forEach(vi => {
      if (!itensPorVenda[vi.venda_id]) itensPorVenda[vi.venda_id] = [];
      itensPorVenda[vi.venda_id].push(vi);
    });
  }

  // Monta modal de visualização (read-only)
  let html = `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="section-sub" style="color:var(--c-text-3);font-size:var(--t-sm)">
        Este carrinho já foi finalizado. Abaixo os itens consolidados:
      </div>
  `;

  if (pedidos.length > 0) {
    html += `<div><strong>🖨️ Cópias</strong></div>`;
    pedidos.forEach(p => {
      html += `
        <div style="display:flex;justify-content:space-between;padding:var(--sp-2) 0;border-bottom:1px solid var(--c-border)">
          <span>#${p.numero_pedido} - ${p.quantidade} × ${labelTipoCopia(p.tipo)}</span>
          <span style="font-weight:600">${formatMoney(p.total)}</span>
        </div>
      `;
    });
  }

  if (vendas.length > 0) {
    html += `<div><strong>📦 Produtos</strong></div>`;
    vendas.forEach(v => {
      const itens = itensPorVenda[v.id] || [];
      if (itens.length > 0) {
        itens.forEach(item => {
          html += `
            <div style="display:flex;justify-content:space-between;padding:var(--sp-2) 0;border-bottom:1px solid var(--c-border)">
              <span>${item.produtos?.nome || 'Produto'} × ${item.quantidade}</span>
              <span style="font-weight:600">${formatMoney(item.total)}</span>
            </div>
          `;
        });
      } else {
        // Venda sem itens detalhados (fallback) — ainda mostra o total
        html += `
          <div style="display:flex;justify-content:space-between;padding:var(--sp-2) 0;border-bottom:1px solid var(--c-border)">
            <span>Venda #${v.numero_venda ?? '—'}</span>
            <span style="font-weight:600">${formatMoney(v.total)}</span>
          </div>
        `;
      }
    });
  }

  // Total geral
  const totalGeral = pedidos.reduce((a, p) => a + p.total, 0) + vendas.reduce((a, v) => a + v.total, 0);
  html += `
    <div style="border-top:2px solid var(--c-border);padding-top:var(--sp-3);display:flex;justify-content:space-between;font-size:var(--t-lg);font-weight:700">
      <span>Total Geral</span>
      <span style="color:var(--c-success)">${formatMoney(totalGeral)}</span>
    </div>
  `;

  // Forma de pagamento (pega a primeira que aparecer, ou 'Misto')
  const pagamentos = [...new Set([...pedidos.map(p => p.forma_pagamento), ...vendas.map(v => v.forma_pagamento)].filter(Boolean))];
  const pagamentoLabel = pagamentos.length > 1 ? 'Misto' : (pagamentos[0] ? labelPagamento(pagamentos[0]) : '—');
  const somaBRL = [...pedidos, ...vendas].reduce((a, x) => a + (x.valor_brl || 0), 0);
  const mostrarBRL = pagamentos.length === 1 && pagamentos[0] === 'pix_brl' && somaBRL > 0;
  html += `
    <div style="display:flex;justify-content:space-between;padding-top:var(--sp-2);border-top:1px solid var(--c-border)">
      <span style="color:var(--c-text-3)">Pagamento</span>
      <span style="text-align:right">
        <span class="badge badge--primary">${pagamentoLabel}</span>
        ${mostrarBRL ? `<div style="font-size:var(--t-xs);color:var(--c-text-3);margin-top:4px">🇧🇷 R$ ${somaBRL.toFixed(2)}</div>` : ''}
      </span>
    </div>
  `;

  html += `</div>`;

  openModal('📋 Detalhes do Carrinho (Finalizado)', html, 'modal--lg');
}

// Estado local só pra evitar re-buscar o carrinho a cada troca de forma de pagamento no modal
let _carrinhoPendenteAtual = null;

function renderCarrinhoPendenteModalBody(carrinho, pagamento, todosProntos = true, readonly = false) {
  const itens = carrinho.itens || [];
  const subtotal = itens.reduce((acc, i) => acc + precoComPagamento(i.preco_base, i.preco_cartao, pagamento) * i.quantidade, 0);
  const desconto = Math.min(carrinho.desconto || 0, subtotal);
  const total = Math.max(0, subtotal - desconto);

  // Quando a forma de pagamento é Pix (R$), os valores são exibidos
  // convertidos em reais (mesma cotação usada no resto do sistema),
  // já que em guaranis não faz sentido pro cliente que está pagando em R$.
  const emBRL = pagamento === 'pix_brl';
  const fmt = (v) => emBRL ? formatBRL(gsToBRL(v)) : formatMoney(v);

  const htmlItens = itens.map(i => {
    const precoUnit = precoComPagamento(i.preco_base, i.preco_cartao, pagamento);
    const ehProduto = i.tipo_item !== 'copia';
    return `
    <div class="pdv-item" style="padding:var(--sp-2) 0">
      <div class="pdv-item-info">
        <div class="pdv-item-name">${i.tipo_item === 'copia' ? '🖨️ ' + (i.tipo_label || i.tipo) : '📦 ' + i.nome}</div>
        <div class="pdv-item-sub">
          ${(ehProduto && !readonly) ? `<button class="qty-btn" style="padding:2px 8px" onclick="alterarQtdItemCarrinhoPendente('${carrinho.id}','${i.id}',-1)">−</button>` : ''}
          ${i.quantidade} × ${fmt(precoUnit)}
          ${(ehProduto && !readonly) ? `<button class="qty-btn" style="padding:2px 8px" onclick="alterarQtdItemCarrinhoPendente('${carrinho.id}','${i.id}',1)">+</button>` : ''}
        </div>
      </div>
      <div class="pdv-item-price">${fmt(precoUnit * i.quantidade)}</div>
      ${!readonly ? `<button class="pdv-remove-btn" onclick="removerItemCarrinhoPendente('${carrinho.id}','${i.id}')">✕</button>` : ''}
    </div>`;
  }).join('');

  let aviso = '';
  if (!todosProntos && !readonly) {
    aviso = `
      <div style="background:var(--c-warning-s);border:1px solid var(--c-warning);border-radius:var(--r-md);padding:var(--sp-4);margin-bottom:var(--sp-3)">
        <span style="color:var(--c-warning);font-weight:600">⏳ Aguardando conclusão da impressão</span>
        <div style="font-size:var(--t-xs);color:var(--c-text-3);margin-top:4px">
          O pagamento só pode ser finalizado após todos os pedidos serem conferidos e entregues.
        </div>
      </div>
    `;
  }

  const notaBRL = emBRL ? `<div style="font-size:var(--t-xs);color:var(--c-text-3)">🇧🇷 Cotação: ₲${APP_CONFIG.cotacaoBRL.toLocaleString('es-PY')}/R$</div>` : '';

  if (readonly) {
    return `
      <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <div class="section-sub">Este carrinho já foi finalizado. Visualização apenas.</div>
        <div id="carrinho-pendente-itens">
          ${htmlItens || '<div class="empty-state"><div class="empty-state-sub">Nenhum item</div></div>'}
        </div>
        <div class="pdv-total-row" style="font-size:var(--t-sm);color:var(--c-text-3)">
          <span>Subtotal</span><span id="cp-subtotal">${fmt(subtotal)}</span>
        </div>
        ${desconto > 0 ? `<div class="pdv-total-row" style="font-size:var(--t-sm);color:var(--c-danger)"><span>Desconto</span><span id="cp-desconto">− ${fmt(desconto)}</span></div>` : ''}
        <div class="pdv-total-row">
          <span class="pdv-total-label">Total</span>
          <span class="pdv-total-value" id="cp-total">${fmt(total)}</span>
        </div>
        ${notaBRL}
        <div style="margin-top:var(--sp-3);font-size:var(--t-sm);color:var(--c-text-3);text-align:center">
          ✅ Carrinho finalizado em ${new Date().toLocaleString()}
        </div>
      </div>
    `;
  }

  // Modo normal (com ações)
  return `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="section-sub">Itens pendentes neste carrinho (cópias já na fila + produtos). O preço muda automaticamente se a forma de pagamento for cartão.</div>
      ${aviso}
      <div id="carrinho-pendente-itens">
        ${htmlItens || '<div class="empty-state"><div class="empty-state-sub">Nenhum item</div></div>'}
      </div>
      <div class="pdv-total-row" style="font-size:var(--t-sm);color:var(--c-text-3)">
        <span>Subtotal</span><span id="cp-subtotal">${fmt(subtotal)}</span>
      </div>
      ${desconto > 0 ? `<div class="pdv-total-row" style="font-size:var(--t-sm);color:var(--c-danger)"><span>Desconto</span><span id="cp-desconto">− ${fmt(desconto)}</span></div>` : ''}
      <div class="pdv-total-row">
        <span class="pdv-total-label">Total</span>
        <span class="pdv-total-value" id="cp-total">${fmt(total)}</span>
      </div>
      ${notaBRL}
      <div class="field">
        <label>Forma de Pagamento</label>
        <select class="input" id="carrinho-pendente-pagamento" onchange="atualizarPreviewCarrinhoPendente(this.value)">
          <option value="" ${!pagamento ? 'selected' : ''} disabled>Selecione a forma de pagamento…</option>
          ${['dinheiro','pix','pix_brl','cartao_debito','cartao_credito','transferencia','fiado'].map(p => `<option value="${p}" ${p===pagamento?'selected':''}>${labelPagamento(p)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--success btn--lg" style="width:100%;justify-content:center" onclick="finalizarCarrinhoPendente('${carrinho.id}')" ${(!todosProntos || !pagamento) ? 'disabled' : ''}>
        ${!todosProntos ? '⏳ Aguardando conferência' : (!pagamento ? '⚠ Selecione a forma de pagamento' : '✅ Finalizar Venda — <span id="cp-total-btn">'+fmt(total)+'</span>')}
      </button>
      <button class="btn btn--ghost btn--sm" style="width:100%;justify-content:center;color:var(--c-danger)" onclick="cancelarCarrinhoPendente('${carrinho.id}')">
        ✕ Cancelar Carrinho
      </button>
    </div>
  `;
}

// Cancela um carrinho pendente inteiro: cancela todos os pedidos de cópia
// vinculados (preserva histórico) e apaga o registro de carrinhos_pendentes.
window.cancelarCarrinhoPendente = async function(carrinhoId) {
  if (!confirm('Cancelar este carrinho inteiro? Todos os pedidos de cópia vinculados serão cancelados. Essa ação não pode ser desfeita.')) return;

  const { error: errPedidos } = await sb
    .from('pedidos_copia')
    .update({ status: 'cancelado' })
    .eq('carrinho_id', carrinhoId)
    .neq('status', 'concluido');
  if (errPedidos) { toast(mensagemErroAmigavel(errPedidos, 'cancelar carrinho'), 'error'); return; }

  const { error: errCarrinho } = await sb
    .from('carrinhos_pendentes')
    .delete()
    .eq('id', carrinhoId);
  if (errCarrinho) { toast(mensagemErroAmigavel(errCarrinho, 'cancelar carrinho'), 'error'); return; }

  await registrarLog('cancelar', 'carrinho_pendente', carrinhoId);
  toast('Carrinho cancelado.', 'info');
  _modalOnBeforeClose = null;
  closeModal();
  _carrinhoPendenteAtual = null;
  if (State.currentPage === 'fila') await refreshFila();
};

window.atualizarPreviewCarrinhoPendente = function(pagamento) {
  if (!_carrinhoPendenteAtual) return;
  const modalBody = document.getElementById('modal-body');
  if (modalBody) modalBody.innerHTML = renderCarrinhoPendenteModalBody(_carrinhoPendenteAtual, pagamento);
};

window.alterarQtdItemCarrinhoPendente = async function(carrinhoId, itemId, delta) {
  const { data: carrinho } = await sb
    .from('carrinhos_pendentes')
    .select('itens')
    .eq('id', carrinhoId)
    .single();

  if (!carrinho) { toast('Carrinho não encontrado', 'error'); return; }

  const itens = (carrinho.itens || []).map(i =>
    i.id === itemId ? { ...i, quantidade: Math.max(1, (i.quantidade || 1) + delta) } : i
  );
  await sb.from('carrinhos_pendentes')
    .update({ itens })
    .eq('id', carrinhoId);

  verCarrinhoPorId(carrinhoId); // recarrega o modal
};

window.removerItemCarrinhoPendente = async function(carrinhoId, itemId) {
  const { data: carrinho } = await sb
    .from('carrinhos_pendentes')
    .select('itens')
    .eq('id', carrinhoId)
    .single();

  if (!carrinho) { toast('Carrinho não encontrado', 'error'); return; }

  const itens = (carrinho.itens || []).filter(i => i.id !== itemId);
  await sb.from('carrinhos_pendentes')
    .update({ itens })
    .eq('id', carrinhoId);

  toast('Item removido', 'info');
  verCarrinhoPorId(carrinhoId); // recarrega o modal (carrinhoId, não pedidoId!)
};

window.finalizarCarrinhoPendente = async function(carrinhoId) {
  console.log('🔍 Buscando pedidos para carrinho:', carrinhoId);
  // Verifica se todos os pedidos estão prontos
  const { data: pedidos, error: errCheck } = await sb
    .from('pedidos_copia')
    .select('status')
    .eq('carrinho_id', carrinhoId);

  if (errCheck) {
    toast('Erro ao verificar status dos pedidos', 'error');
    return;
  }
  
  const todosProntos = (pedidos || []).every(p => p.status === 'concluido' || p.status === 'cancelado');
  if (!todosProntos) {
    toast('Aguardando conclusão da impressão para finalizar o pagamento.', 'warning');
    return;
  }
  
  const { data: carrinho } = await sb
    .from('carrinhos_pendentes')
    .select('*')
    .eq('id', carrinhoId)
    .single();
    
    if (!carrinho) { toast('Carrinho não encontrado', 'error'); return; }
    
    const itens = carrinho.itens || [];
    const itensProduto = itens.filter(i => i.tipo_item === 'produto');
    const clienteNome = carrinho.cliente_nome || null;
    
  const pagamentoSelect = document.getElementById('carrinho-pendente-pagamento')?.value || '';
  if (!pagamentoSelect) {
    toast('Selecione a forma de pagamento antes de finalizar.', 'warning');
    return;
  }
  const pagamentoDb = pagamentoSelect;
  
  const btn = document.querySelector('#global-modal .btn--success');
  if (btn) { btn.disabled = true; }
  
  try {
    // Busca os pedidos de cópia reais vinculados a este carrinho
    const { data: pedidosCopia, error: errPedidos } = await sb
    .from('pedidos_copia')
    .select('*')
    .eq('carrinho_id', carrinhoId)
    .neq('status', 'cancelado');
    if (errPedidos) throw errPedidos;
    console.log(`📦 Encontrados ${pedidosCopia?.length || 0} pedidos de cópia.`);

    console.log('🔍 Pedidos encontrados:', pedidosCopia);

    // Idempotência: se um clique anterior já processou tudo (cópias com
    // forma_pagamento já gravada e/ou venda de produtos já registrada pra
    // este carrinho), mas o DELETE final falhou/foi reclicado, não
    // reprocessa (evita duplicar venda/desconto) — só tenta remover o
    // carrinho pendente de novo.
    const copiasJaProcessadas = (pedidosCopia || []).length > 0 && pedidosCopia.every(p => p.forma_pagamento);
    let vendaJaExiste = false;
    if (itensProduto.length > 0) {
      const { data: vendaExistente } = await sb.from('vendas').select('id').eq('carrinho_id', carrinhoId).maybeSingle();
      vendaJaExiste = !!vendaExistente;
    }

    if (!(copiasJaProcessadas && (itensProduto.length === 0 || vendaJaExiste))) {
    const subtotalCopia = (pedidosCopia || []).reduce(
      (a, p) => a + precoComPagamento(p.preco_base, p.preco_cartao, pagamentoDb) * p.quantidade, 0);
      const subtotalProduto = itensProduto.reduce(
        (a, i) => a + precoComPagamento(i.preco_base, i.preco_cartao, pagamentoDb) * i.quantidade, 0);
        const subtotalGeral = subtotalCopia + subtotalProduto;
        const descontoTotal   = Math.min(carrinho.desconto || 0, subtotalGeral);
        
        let descontoPorPedido = [];
        let descontoProduto   = 0;
        
        if (pedidosCopia && pedidosCopia.length > 0) {
      const pesos = pedidosCopia.map(p => precoComPagamento(p.preco_base, p.preco_cartao, pagamentoDb) * p.quantidade);
      descontoPorPedido = distribuirValor(descontoTotal, pesos);
      const somaDescontoCopias = descontoPorPedido.reduce((a, b) => a + b, 0);
      descontoProduto = descontoTotal - somaDescontoCopias;

      // ★ ATUALIZA OS PEDIDOS DE CÓPIA
      for (let idx = 0; idx < pedidosCopia.length; idx++) {
        const p = pedidosCopia[idx];
        const precoUnit = precoComPagamento(p.preco_base, p.preco_cartao, pagamentoDb);
        const totalItem = Math.round(precoUnit * p.quantidade) - descontoPorPedido[idx];
        console.log(`🔄 Atualizando pedido ${p.id}: precoUnit=${precoUnit}, desconto=${descontoPorPedido[idx]}, total=${totalItem}, pagamento=${pagamentoDb}`);
        const { error } = await sb.from('pedidos_copia').update({
          preco_unitario:  Math.round(precoUnit),
          desconto:        descontoPorPedido[idx],
          total:           totalItem,
          forma_pagamento: pagamentoDb,
          ...camposBRL(pagamentoDb, totalItem),
        }).eq('id', p.id);
        if (error) {
          console.error('❌ Erro ao atualizar pedido:', error);
          throw error;
        }
      }
    } else {
      // Se não houver cópias, todo o desconto vai para produtos
      descontoProduto = descontoTotal;
    }

    // ── Registra a venda dos produtos, se houver ──
    let vendaId = null;
    if (itensProduto.length > 0) {
      vendaId = await processarVendaProdutos(itensProduto, subtotalProduto, descontoProduto, pagamentoDb, clienteNome, carrinhoId);
      if (vendaId === null) { if (btn) btn.disabled = false; return; }
    }
    }

    // Remove o carrinho pendente (best-effort). Se falhar por violação de
    // FK (pedidos_copia/vendas ainda referenciam carrinho_id — comum se o
    // schema não usa ON DELETE SET NULL), isso é esperado e NÃO é um erro
    // real: a venda já foi gravada acima (forma_pagamento nas cópias +
    // registro em vendas), que é o sinal que refreshFila() usa pra saber
    // que o carrinho não está mais pendente. Não bloqueia o fluxo por isso.
    const { error: errDelete } = await sb
      .from('carrinhos_pendentes')
      .delete()
      .eq('id', carrinhoId);
    if (errDelete) {
      console.warn('[finalizarCarrinhoPendente] Não foi possível apagar o carrinho pendente (FK?). Venda já está gravada e não fica mais pendente na fila:', errDelete);
    }

    toast('✅ Venda finalizada com sucesso!', 'success');
    _modalOnBeforeClose = null; // pagamento já foi escolhido — pode fechar sem confirmar
    closeModal();
    _carrinhoPendenteAtual = null;
    await refreshFila();
  } catch (err) {
    toast('Erro ao finalizar: ' + err.message, 'error');
    if (btn) { btn.disabled = false; }
  }
};

// ── Renderiza um card de pedido individual (não juntado, ou cujo
//    carrinho está espalhado em outra impressora) ─────────
async function renderPedidoCard(p, espalhado = false) {
  const folhasEsperadas = p.paginas_por_documento
    ? Math.ceil((p.quantidade * p.paginas_por_documento) / (p.frente_verso ? 2 : 1))
    : calcularFolhas(p.quantidade, p.frente_verso);
  const clienteLabel = p.cliente_nome_pdv || `Pedido #${p.numero_pedido}`;

  let totalCarrinho = 0;
  let carrinho = null;
  if (p.carrinho_id) {
    carrinho = await obterCarrinhoPendentePorPedido(p.id);
    if (carrinho) {
      // Prévia com preço normal (sem cartão) — a forma de pagamento só é
      // escolhida na retirada, em finalizarCarrinhoPendente().
      const subtotalPreview = carrinho.itens.reduce((acc, i) => acc + i.preco_base * i.quantidade, 0);
      totalCarrinho = Math.max(0, subtotalPreview - (carrinho.desconto || 0));
    }
  }

  // ── Fila simplificada: um único botão "Confirmar" leva direto ao
  //    modal de conferência/entrega, que por sua vez abre o carrinho
  //    para pagamento. Não há mais etapas manuais de iniciar/conferir.
  const acaoConfirmar = `<button class="btn btn--success btn--sm" onclick="abrirModalConferencia('${p.id}')">✅ Confirmar</button>
                  <button class="btn btn--ghost btn--sm" onclick="acaoFila('cancelar','${p.id}')">✕</button>
                  <button class="btn btn--ghost btn--sm" onclick="verCarrinhoPendente('${p.id}')">🛒 Carrinho</button>`;

  const acoes = {
    na_fila:     acaoConfirmar,
    imprimindo:  acaoConfirmar,
    conferencia: acaoConfirmar,
    erro:        acaoConfirmar,
    // Impressão entregue, mas a venda só é considerada finalizada quando o
    // carrinho é de fato fechado com forma de pagamento (finalizarCarrinhoPendente
    // apaga o carrinho_pendente ao concluir). Enquanto esse carrinho existir,
    // o card continua na fila com o botão de carrinho em destaque — nada
    // desaparece "sozinho" antes da venda ser realmente fechada.
    concluido: carrinho
      ? `<button class="btn btn--success btn--sm" onclick="verCarrinhoPendente('${p.id}')">🛒 Finalizar Venda</button>`
      : `<span style="font-size:var(--t-xs);color:var(--c-success)">✓ Entregue às ${formatDateTime(p.concluido_at)}</span>`,
  };

  const podeArrastar = p.status !== 'concluido' && p.status !== 'cancelado';

  return `
    <div class="pedido-card pedido-card--${p.status}" id="pedido-${p.id}"
         ${podeArrastar ? `draggable="true" ondragstart="filaDragStart(event,'${p.id}')"` : ''}
         ondragover="filaDragOver(event)" ondragleave="filaDragLeave(event)" ondrop="filaDrop(event,'${p.id}')">
      <div class="pedido-card-header">
        <span class="pedido-card-num">#${p.numero_pedido}</span>
        <span class="pedido-card-cliente">${clienteLabel}</span>
        <span class="status-fila status-fila--${p.status}">${labelStatusFila(p.status)}</span>
      </div>
      <div class="pedido-card-body">
        <div><strong>${p.quantidade}</strong> cópias · ${labelTipoCopia(p.tipo)}${p.frente_verso ? ' · F/V' : ''}</div>
        <div style="color:var(--c-text-3)">📄 ~${folhasEsperadas} folha${folhasEsperadas!==1?'s':''} esperadas</div>
        ${p.observacoes ? `<div style="color:var(--c-text-3);font-style:italic">${p.observacoes}</div>` : ''}
        <div style="color:var(--c-text-3);font-size:10px;margin-top:2px">
          Recebido: ${formatDateTime(p.created_at)}
          ${p.forma_pagamento ? ` · ${labelPagamento(p.forma_pagamento)}` : ''}
        </div>
        ${carrinho ? `<div style="font-size:var(--t-xs);color:var(--c-accent)">🛒 Carrinho pendente: ≈ ${formatMoney(totalCarrinho)}</div>` : ''}
        ${espalhado ? `<div style="font-size:10px;color:var(--c-accent)">🔗 Este carrinho também tem pedido(s) em outra impressora</div>` : ''}
      </div>
      <div class="pedido-card-footer">
        ${acoes[p.status] || ''}
        ${(p.status !== 'concluido' && p.status !== 'cancelado') || carrinho ? `<button class="btn btn--ghost btn--sm" onclick="abrirMiniCarrinhoFila('${p.id}','${(p.cliente_nome_pdv||'').replace(/'/g,"\\'")}','${p.impressora_id||''}')">🛒 +</button>` : ''}
        <span class="pedido-card-valor">${formatMoney(p.total)}</span>
      </div>
      ${p.status === 'imprimindo' && p.folhas_usadas !== null ? `
      <div style="font-size:10px;color:var(--c-text-3)">
        ⏳ ${p.folhas_usadas || 0} / ${p.total_folhas_esperadas} folhas
      </div>` : ''}
    </div>
  `;
}

// ── Renderiza um card ÚNICO para vários pedidos que foram
//    juntados no mesmo carrinho (via drag-and-drop). Cada trabalho
//    mantém sua própria conferência (✅), mas o carrinho, o total e
//    o botão de pagamento são únicos pro grupo inteiro.
//    `grupo` já vem ordenado do mais antigo pro mais novo (a query
//    de refreshFila busca com order by created_at ascending) — por
//    isso grupo[0] é sempre o pedido mais antigo, e é ele que define
//    o número/posição do card na fila.
async function renderPedidoCardGroup(grupo, espalhado = false) {
  const principal = grupo[0];
  const carrinhoId = principal.carrinho_id;
  const clienteLabel = principal.cliente_nome_pdv || `Pedido #${principal.numero_pedido}`;

  // Total do carrinho inteiro (inclui produtos avulsos adicionados via 🛒 +,
  // não só a soma dos pedidos de cópia deste grupo).
  let totalCarrinho = grupo.reduce((acc, p) => acc + (p.total || 0), 0);
  const carrinho = await obterCarrinhoPendentePorPedido(principal.id);
  if (carrinho) {
    const subtotalPreview = carrinho.itens.reduce((acc, i) => acc + i.preco_base * i.quantidade, 0);
    totalCarrinho = Math.max(0, subtotalPreview - (carrinho.desconto || 0));
  }

  const prontos = grupo.filter(p => p.status === 'concluido' || p.status === 'cancelado').length;
  const todosProntos = prontos === grupo.length;

  const subitens = grupo.map(p => {
    const folhasEsperadas = p.paginas_por_documento
      ? Math.ceil((p.quantidade * p.paginas_por_documento) / (p.frente_verso ? 2 : 1))
      : calcularFolhas(p.quantidade, p.frente_verso);
    const finalizado = p.status === 'concluido' || p.status === 'cancelado';
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--sp-2);padding:6px 0;border-top:1px solid var(--c-border)">
        <div style="min-width:0">
          <div style="font-size:var(--t-sm)"><strong>#${p.numero_pedido}</strong> · ${p.quantidade} ${labelTipoCopia(p.tipo)}${p.frente_verso ? ' · F/V' : ''}</div>
          <div style="font-size:10px;color:var(--c-text-3)">
            ${labelStatusFila(p.status)} · ~${folhasEsperadas} folha${folhasEsperadas !== 1 ? 's' : ''}
            ${p.impressora_id !== principal.impressora_id ? ` · 🖨️ ${p.impressoras?.nome || 'outra impressora'}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${!finalizado ? `
            <button class="btn btn--success btn--sm" style="padding:2px 8px" onclick="abrirModalConferencia('${p.id}')" title="Confirmar">✅</button>
            <button class="btn btn--ghost btn--sm" style="padding:2px 8px" onclick="acaoFila('cancelar','${p.id}')" title="Cancelar">✕</button>
          ` : `<span style="color:var(--c-success);font-size:var(--t-xs)">✓</span>`}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="pedido-card" id="pedido-grupo-${carrinhoId || principal.id}"
         draggable="true" ondragstart="filaDragStart(event,'${principal.id}')"
         ondragover="filaDragOver(event)" ondragleave="filaDragLeave(event)" ondrop="filaDrop(event,'${principal.id}')">
      <div class="pedido-card-header">
        <span class="pedido-card-num">#${principal.numero_pedido}</span>
        <span class="pedido-card-cliente">${clienteLabel}</span>
        <span class="badge badge--accent" title="${grupo.length} pedidos juntados no mesmo carrinho">🛒 ${grupo.length} pedidos</span>
      </div>
      <div class="pedido-card-body">
        ${subitens}
        ${espalhado ? `<div style="font-size:10px;color:var(--c-accent);margin-top:4px">🔗 Este carrinho também tem pedido(s) em outra impressora</div>` : ''}
        ${!todosProntos ? `<div style="font-size:10px;color:var(--c-text-3);margin-top:4px">⏳ ${prontos}/${grupo.length} prontos</div>` : ''}
      </div>
      <div class="pedido-card-footer">
        <button class="btn btn--ghost btn--sm" onclick="verCarrinhoPorId('${carrinhoId}')">🛒 Carrinho</button>
        <button class="btn btn--ghost btn--sm" onclick="abrirMiniCarrinhoFila('${principal.id}','${(principal.cliente_nome_pdv || '').replace(/'/g, "\\'")}','${principal.impressora_id || ''}')">🛒 +</button>
        <span class="pedido-card-valor">${formatMoney(totalCarrinho)}</span>
      </div>
    </div>
  `;
}

// ============================================================
// ── DRAG-AND-DROP: JUNTAR PEDIDOS NO MESMO CARRINHO ─────────
// Arrastar um card de pedido sobre outro move o pedido de
// origem (e todo o carrinho dele, se tiver) para o carrinho do
// pedido de destino. Útil quando o cliente pediu duas coisas
// separadas e quer pagar tudo junto na retirada.
// ============================================================
window.filaDragStart = function(ev, pedidoId) {
  ev.dataTransfer.setData('text/plain', pedidoId);
  ev.dataTransfer.effectAllowed = 'move';
};

window.filaDragOver = function(ev) {
  ev.preventDefault();
  ev.currentTarget.style.outline = '2px dashed var(--c-accent)';
  ev.currentTarget.style.outlineOffset = '-2px';
};

window.filaDragLeave = function(ev) {
  ev.currentTarget.style.outline = '';
};

window.filaDrop = async function(ev, destinoId) {
  ev.preventDefault();
  ev.currentTarget.style.outline = '';
  const origemId = ev.dataTransfer.getData('text/plain');
  if (!origemId || origemId === destinoId) return;
  await mesclarPedidosNaFila(origemId, destinoId);
};

window.mesclarPedidosNaFila = async function(origemId, destinoId) {
  try {
    const [{ data: origem }, { data: destino }] = await Promise.all([
      sb.from('pedidos_copia').select('id, carrinho_id, cliente_nome_pdv, status').eq('id', origemId).single(),
      sb.from('pedidos_copia').select('id, carrinho_id, cliente_nome_pdv, status').eq('id', destinoId).single(),
    ]);
    if (!origem || !destino) { toast('Pedido não encontrado.', 'error'); return; }
    if (['concluido', 'cancelado'].includes(origem.status) || ['concluido', 'cancelado'].includes(destino.status)) {
      toast('Não é possível juntar pedidos já concluídos ou cancelados.', 'warning');
      return;
    }
    if (origem.carrinho_id && origem.carrinho_id === destino.carrinho_id) {
      toast('Esses pedidos já estão no mesmo carrinho.', 'info');
      return;
    }

    // Garante que o destino tenha um carrinho pra receber o pedido de origem
    let destinoCarrinhoId = destino.carrinho_id;
    if (!destinoCarrinhoId) {
      const { data: novoCarrinho, error: errNovo } = await sb.from('carrinhos_pendentes')
        .insert({ itens: [], cliente_nome: destino.cliente_nome_pdv || null, desconto: 0 })
        .select().single();
      if (errNovo || !novoCarrinho) throw errNovo || new Error('Falha ao criar carrinho');
      destinoCarrinhoId = novoCarrinho.id;
      await sb.from('pedidos_copia').update({ carrinho_id: destinoCarrinhoId }).eq('id', destinoId);
    }

    if (origem.carrinho_id) {
      // Origem já tinha um carrinho próprio — junta os produtos/desconto dele
      // e move TODOS os pedidos de cópia que estavam nesse carrinho junto.
      const [{ data: origemCarrinho }, { data: destinoCarrinho }] = await Promise.all([
        sb.from('carrinhos_pendentes').select('*').eq('id', origem.carrinho_id).maybeSingle(),
        sb.from('carrinhos_pendentes').select('*').eq('id', destinoCarrinhoId).single(),
      ]);
      if (origemCarrinho) {
        const itensMerge = [...(destinoCarrinho.itens || []), ...(origemCarrinho.itens || [])];
        const descontoMerge = (destinoCarrinho.desconto || 0) + (origemCarrinho.desconto || 0);
        await sb.from('carrinhos_pendentes').update({ itens: itensMerge, desconto: descontoMerge }).eq('id', destinoCarrinhoId);
        await sb.from('pedidos_copia').update({ carrinho_id: destinoCarrinhoId }).eq('carrinho_id', origem.carrinho_id);
        await sb.from('carrinhos_pendentes').delete().eq('id', origem.carrinho_id);
      } else {
        // carrinho_id do pedido apontava pra um carrinho que não existe mais
        await sb.from('pedidos_copia').update({ carrinho_id: destinoCarrinhoId }).eq('id', origemId);
      }
    } else {
      // Pedido avulso, sem carrinho — só move ele para o carrinho de destino
      await sb.from('pedidos_copia').update({ carrinho_id: destinoCarrinhoId }).eq('id', origemId);
    }

    await registrarLog('mesclar_carrinho', 'pedido_copia', origemId, { destino: destinoId });
    toast('🛒 Pedidos juntados no mesmo carrinho!', 'success');
    await refreshFila();
  } catch (err) {
    toast('Erro ao juntar pedidos: ' + err.message, 'error');
  }
};

// ── Mini-carrinho dentro do card da fila ──────────────────
// Permite, sem sair da tela de produção, vender um produto extra
// ou adicionar mais uma impressão para o mesmo cliente do pedido.
let _filaMiniCarrinho = [];

window.abrirMiniCarrinhoFila = async function(pedidoId, clienteNome, impressoraId) {
  _filaMiniCarrinho = [];
  if (!State.produtosPdv || State.produtosPdv.length === 0) await carregarProdutosPdv();
  if (!State.folhasDisponiveis || State.folhasDisponiveis.length === 0) await loadFolhasDisponiveis();
  const produtos = State.produtosPdv || [];
  const precos = State.precosCopia || [];
  const folhas = State.folhasDisponiveis || [];

  openModal(`🛒 Adicionar para ${clienteNome || 'este pedido'}`, `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="section-sub">Adicione produtos ou uma nova impressão para o mesmo cliente, sem sair da fila.</div>

      <div class="divider-text">📦 Produtos</div>
      <div class="search-bar">
        <span class="search-bar-icon">🔍</span>
        <input type="text" class="input" placeholder="Buscar produto..." oninput="filtrarFilaMiniProdutos(this.value)" />
      </div>
      <div id="fila-mini-produtos" style="max-height:160px;overflow-y:auto;border:1px solid var(--c-border);border-radius:var(--r-md)">
        ${produtos.map(p => `
          <div class="tipo-copia-btn" data-id="${p.id}" data-nome="${p.nome}" onclick="filaMiniAdicionarProduto('${p.id}','${p.nome.replace(/'/g,"\\'")}',${p.preco_venda||0})">
            <div style="font-size:1.5rem;margin-bottom:var(--sp-2)">📦</div>
            <div style="font-weight:600;font-size:var(--t-sm)">${p.nome} ${p.usado_na_impressao ? '<span class="badge badge--accent" style="font-size:8px;padding:1px 6px">📄</span>' : ''}</div>
            <div style="font-size:var(--t-xs);color:var(--c-text-3)">${p.categoria}</div>
            <div style="font-size:var(--t-sm);font-weight:700;color:var(--c-accent);margin-top:var(--sp-2)">${formatMoney(p.preco_venda||0)}</div>
            ${p.preco_cartao ? `<div style="font-size:10px;color:var(--c-text-3)">💳 ${formatMoney(p.preco_cartao)}</div>` : ''}
            <div style="font-size:10px;color:var(--c-text-3)">Estoque: ${p.estoque_atual} ${p.unidade}</div>
          </div>
        `).join('') || '<div class="empty-state" style="padding:var(--sp-4)"><div class="empty-state-sub">Nenhum produto cadastrado</div></div>'}
      </div>
      <div id="fila-mini-carrinho-itens"></div>

      <div class="divider-text">🖨️ Nova impressão (mesma impressora)</div>
      <div class="form-row form-row--2">
        <div class="field">
          <label>Tipo de cópia</label>
          <select class="input" id="fila-mini-tipo">
            <option value="">— Nenhuma —</option>
            ${precos.map(p => `<option value="${p.tipo}">${p.descricao} (${formatMoney(p.preco_unitario)})</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Quantidade</label>
          <input type="number" class="input" id="fila-mini-qtd" min="1" value="1" />
        </div>
      </div>
      <div class="field">
        <label>Folha (papel)</label>
        <select class="input" id="fila-mini-folha">
          <option value="">— Selecione o papel —</option>
          ${folhas.map(f => `<option value="${f.id}" data-nome="${f.nome}">${f.nome} (estoque: ${f.estoque_atual} ${f.unidade})</option>`).join('')}
        </select>
      </div>

      <div class="field" style="margin-bottom:0">
        <div style="font-size:var(--t-xs);color:var(--c-text-3)">💡 A forma de pagamento é escolhida na retirada (quando o carrinho inteiro é finalizado), não aqui.</div>
      </div>

      <button class="btn btn--success btn--lg" style="width:100%;justify-content:center" onclick="confirmarMiniCarrinhoFila('${pedidoId}','${(clienteNome||'').replace(/'/g,"\\'")}','${impressoraId||''}')">
        ✅ Confirmar
      </button>
    </div>
  `, 'modal--lg');
};

window.filtrarFilaMiniProdutos = function(q) {
  document.querySelectorAll('#fila-mini-produtos .tipo-copia-btn').forEach(el => {
    const nome = el.dataset.nome?.toLowerCase() || '';
    el.style.display = nome.includes(q.toLowerCase()) ? '' : 'none';
  });
};

window.filaMiniAdicionarProduto = function(id, nome, preco) {
  const existing = _filaMiniCarrinho.find(i => i.produto_id === id);
  if (existing) existing.quantidade++;
  else _filaMiniCarrinho.push({ produto_id: id, nome, quantidade: 1, preco_unitario: preco });
  renderFilaMiniCarrinhoItens();
};

function renderFilaMiniCarrinhoItens() {
  const el = document.getElementById('fila-mini-carrinho-itens');
  if (!el) return;
  if (_filaMiniCarrinho.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = _filaMiniCarrinho.map((i, idx) => `
    <div class="pdv-item" style="padding:var(--sp-2) 0">
      <div class="pdv-item-info">
        <div class="pdv-item-name">${i.nome}</div>
        <div class="pdv-item-sub">${i.quantidade} × ${formatMoney(i.preco_unitario)}</div>
      </div>
      <div class="pdv-item-price">${formatMoney(i.quantidade * i.preco_unitario)}</div>
      <button class="pdv-remove-btn" onclick="_filaMiniCarrinho.splice(${idx},1);renderFilaMiniCarrinhoItens()">✕</button>
    </div>
  `).join('');
}

window.confirmarMiniCarrinhoFila = async function(pedidoIdOrigem, clienteNome, impressoraId) {
  const tipoNovo   = document.getElementById('fila-mini-tipo')?.value || '';
  const qtdNovo    = parseInt(document.getElementById('fila-mini-qtd')?.value) || 1;
  const folhaSelect = document.getElementById('fila-mini-folha');
  const folhaId    = folhaSelect?.value || null;
  const folhaNome  = folhaId ? (folhaSelect.selectedOptions[0]?.dataset.nome || null) : null;

  if (_filaMiniCarrinho.length === 0 && !tipoNovo) {
    toast('Adicione ao menos um produto ou uma impressão', 'warning');
    return;
  }
  if (tipoNovo && !folhaId) {
    toast('Selecione a folha (papel) usada nesta impressão.', 'warning');
    return;
  }

  try {
    // 1. Buscar o carrinho pendente associado ao pedido
    const { data: pedido } = await sb
      .from('pedidos_copia')
      .select('carrinho_id')
      .eq('id', pedidoIdOrigem)
      .single();

    if (!pedido?.carrinho_id) {
      toast('Carrinho pendente não encontrado.', 'error');
      return;
    }

    const { data: carrinho } = await sb
      .from('carrinhos_pendentes')
      .select('itens')
      .eq('id', pedido.carrinho_id)
      .single();

    if (!carrinho) {
      toast('Carrinho pendente não encontrado.', 'error');
      return;
    }

    // 2. Produtos → só entram no espelho JSON do carrinho (cobrados na retirada)
    const novosItensProduto = [];
    for (const item of _filaMiniCarrinho) {
      const produto = State.produtosPdv?.find(p => p.id === item.produto_id);
      if (!produto) continue;
      novosItensProduto.push({
        id: uuid(),
        tipo_item: 'produto',
        produto_id: produto.id,
        nome: produto.nome,
        quantidade: item.quantidade,
        preco_base: produto.preco_venda || 0,
        preco_cartao: produto.preco_cartao || null,
      });
    }
    if (novosItensProduto.length > 0) {
      const itensAtualizados = [...(carrinho.itens || []), ...novosItensProduto];
      await sb.from('carrinhos_pendentes').update({ itens: itensAtualizados }).eq('id', pedido.carrinho_id);
    }

    // 3. Nova cópia → precisa virar um pedido_copia de verdade, senão nunca
    //    entra na fila de produção física.
    if (tipoNovo) {
      const preco = State.precosCopia.find(p => p.tipo === tipoNovo);
      const precoBase = preco ? preco.preco_unitario : 0;
      const precoCartao = preco?.preco_cartao || null;
      const totalFolhas = calcularFolhas(qtdNovo, false);
      const { error } = await sb.from('pedidos_copia').insert({
        impressora_id:   impressoraId || null,
        tipo:            tipoNovo,
        quantidade:      qtdNovo,
        frente_verso:    false,
        preco_unitario:  Math.round(precoBase),
        preco_base:      precoBase,
        preco_cartao:    precoCartao,
        desconto:        0,
        total:           Math.round(precoBase * qtdNovo),
        status:          'na_fila',
        forma_pagamento: null, // definido na finalização do carrinho, na retirada
        cliente_nome_pdv: clienteNome || null,
        paginas_por_documento: 1,
        total_folhas:    totalFolhas,
        carrinho_id:     pedido.carrinho_id,
        insumo_folha_id: folhaId,
        insumo_folha_nome: folhaNome,
      });
      if (error) throw error;
    }

    toast('✅ Itens adicionados ao carrinho!', 'success');
    _filaMiniCarrinho = [];
  } catch (err) {
    toast('Erro ao adicionar: ' + err.message, 'error');
  }
  closeModal();
  await refreshFila();
};

// ── Calcula folhas esperadas ──────────────────────────────
function calcularFolhas(quantidade, frenteVerso) {
  // Frente/verso = 2 páginas por folha
  return frenteVerso ? Math.ceil(quantidade / 2) : quantidade;
}

// ── Labels de status ──────────────────────────────────────
function labelStatusFila(status) {
  const m = {
    na_fila:     '🟡 Na Fila',
    imprimindo:  '🔵 Imprimindo',
    conferencia: '🟠 Conferência',
    concluido:   '🟢 Concluído',
    erro:        '🔴 Erro',
    cancelado:   '⚫ Cancelado',
  };
  return m[status] || status;
}


// ── Ações simples de estado ───────────────────────────────
// (fila simplificada: a única transição manual restante é o cancelamento;
//  concluir/entregar acontece via abrirModalConferencia → confirmarConferencia)
window.acaoFila = async function(acao, pedidoId) {
  if (acao === 'cancelar') {
    if (!confirm('Cancelar este pedido? O cliente deverá ser informado.')) return;
    await sb.from('pedidos_copia').update({ status: 'cancelado' }).eq('id', pedidoId);
    toast('Pedido cancelado.', 'info');
    await refreshFila();
    return;
  }
};

// ── Modal de Conferência e Entrega ────────────────────────
window.abrirModalConferencia = async function(pedidoId) {
  const { data: p } = await sb.from('pedidos_copia').select('*').eq('id', pedidoId).single();
  if (!p) return;

  const paginasPorDoc = p.paginas_por_documento || 1;
  const totalPaginas = p.quantidade * paginasPorDoc;
  const folhasEsperadas = Math.ceil(totalPaginas / (p.frente_verso ? 2 : 1));
  const clienteLabel     = p.cliente_nome_pdv || `Pedido #${p.numero_pedido}`;

  openModal('✅ Conferência e Entrega', `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">

      <!-- Resumo do pedido -->
      <div style="background:var(--c-bg);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-xs);color:var(--c-text-3);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-3)">Pedido #${p.numero_pedido}</div>
        <div style="font-size:var(--t-lg);font-weight:700;margin-bottom:var(--sp-1)">${clienteLabel}</div>
        <div style="color:var(--c-text-2)">${p.quantidade} cópias · ${labelTipoCopia(p.tipo)}${p.frente_verso?' · Frente/Verso':''}</div>
      </div>

      <!-- Stats esperado vs real -->
      <div class="conferencia-grid">
        <div class="conf-stat">
          <div class="conf-stat-val" style="color:var(--c-primary)">${p.quantidade}</div>
          <div class="conf-stat-label">Cópias solicitadas</div>
        </div>
        <div class="conf-stat">
          <div class="conf-stat-val" style="color:var(--c-accent)">${folhasEsperadas}</div>
          <div class="conf-stat-label">Folhas esperadas</div>
        </div>
      </div>

      <!-- Conferência real -->
      <div style="background:var(--c-warning-s);border:1.5px solid var(--c-warning);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-sm);font-weight:600;color:var(--c-warning);margin-bottom:var(--sp-3)">
          ⚠ Confira antes de entregar
        </div>
        <div class="form-row form-row--2">
          <div class="field">
            <label>Cópias realmente impressas</label>
            <input type="number" class="input" id="conf-qtd-real"
                   value="${p.quantidade}" min="0" max="${p.quantidade * 2}"
                   oninput="calcularFolhasConferencia(${p.frente_verso?1:0})" />
          </div>
          <div class="field">
            <label>Folhas usadas (real)</label>
            <input type="number" class="input" id="conf-folhas-real"
                   value="${folhasEsperadas}" min="0" />
          </div>
        </div>
      </div>

      ${!p.carrinho_id ? `
      <div style="background:var(--c-danger-s);border:1.5px solid var(--c-danger);border-radius:var(--r-md);padding:var(--sp-4)">
        <div style="font-size:var(--t-sm);font-weight:600;color:var(--c-danger);margin-bottom:var(--sp-2)">
          ⚠ Este pedido não está vinculado a um carrinho — o pagamento não será pedido depois. Selecione agora:
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Forma de Pagamento</label>
          <select class="input" id="conf-forma-pagamento">
            <option value="" selected disabled>Selecione a forma de pagamento…</option>
            ${['dinheiro','pix','pix_brl','cartao_debito','cartao_credito','transferencia','fiado'].map(fp => `<option value="${fp}">${labelPagamento(fp)}</option>`).join('')}
          </select>
        </div>
      </div>
      ` : ''}

      <!-- Resultado da conferência -->
      <div>
        <label style="font-size:var(--t-xs);font-weight:600;color:var(--c-text-2);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:var(--sp-2)">
          Resultado da Conferência
        </label>
        <div style="display:flex;flex-direction:column;gap:var(--sp-2)">
          <label style="display:flex;align-items:center;gap:var(--sp-3);cursor:pointer;padding:var(--sp-3);background:var(--c-success-s);border:1.5px solid var(--c-success);border-radius:var(--r-md)">
            <input type="radio" name="conf-resultado" value="ok" checked />
            <div>
              <div style="font-weight:600;color:var(--c-success)">✅ Tudo certo — entregar ao cliente</div>
              <div style="font-size:var(--t-xs);color:var(--c-text-3)">Quantidade e qualidade conferidas</div>
            </div>
          </label>
          <label style="display:flex;align-items:center;gap:var(--sp-3);cursor:pointer;padding:var(--sp-3);background:var(--c-danger-s);border:1.5px solid var(--c-border);border-radius:var(--r-md)">
            <input type="radio" name="conf-resultado" value="parcial" />
            <div>
              <div style="font-weight:600;color:var(--c-warning)">↺ Precisa reimprimir parte</div>
              <div style="font-size:var(--t-xs);color:var(--c-text-3)">Informe quantas precisam ser refeitas</div>
            </div>
          </label>
          <label style="display:flex;align-items:center;gap:var(--sp-3);cursor:pointer;padding:var(--sp-3);background:var(--c-danger-s);border:1.5px solid var(--c-border);border-radius:var(--r-md)">
            <input type="radio" name="conf-resultado" value="refazer" />
            <div>
              <div style="font-weight:600;color:var(--c-danger)">🔴 Refazer tudo</div>
              <div style="font-size:var(--t-xs);color:var(--c-text-3)">Todo o lote saiu com defeito</div>
            </div>
          </label>
        </div>
      </div>

      <div class="field">
        <label>Quantidade a reimprimir (se parcial)</label>
        <input type="number" class="input" id="conf-qtd-reimp" value="0" min="0" placeholder="0 = nenhuma" />
      </div>

      <div class="field">
        <label>Observações de qualidade</label>
        <textarea class="input" id="conf-obs" rows="2" placeholder="Mancha, papel preso, cor falhando..."></textarea>
      </div>

      <button class="btn btn--success btn--lg" style="width:100%;justify-content:center"
              onclick="confirmarConferencia('${pedidoId}', ${p.quantidade}, ${folhasEsperadas}, '${p.impressora_id}', ${p.tipo.startsWith('colorida')||p.tipo.startsWith('foto')||p.tipo==='a3_colorida'?'true':'false'}, '${p.carrinho_id||''}')">
        ✅ Confirmar e Finalizar Pedido
      </button>
    </div>
  `, 'modal--lg');
};

window.calcularFolhasConferencia = function(frenteVerso) {
  const qtd = parseInt(document.getElementById('conf-qtd-real')?.value || 0);
  const folhas = frenteVerso ? Math.ceil(qtd / 2) : qtd;
  const el = document.getElementById('conf-folhas-real');
  if (el) el.value = folhas;
};

// ── Confirmar conferência e finalizar pedido ──────────────
window.confirmarConferencia = async function(pedidoId, qtdOriginal, folhasEsperadas, impressoraId, isColor, carrinhoId) {
  // 🔍 Busca o pedido atual
  const { data: pedidoAtual, error: errPed } = await sb
    .from('pedidos_copia')
    .select('tipo, insumo_folha_id, total')
    .eq('id', pedidoId)
    .single();

  if (errPed) {
    toast('Erro ao buscar pedido: ' + errPed.message, 'error');
    return;
  }

  const resultado = document.querySelector('input[name="conf-resultado"]:checked')?.value || 'ok';
  const qtdReal = parseInt(document.getElementById('conf-qtd-real')?.value || qtdOriginal);
  const folhasReal = parseInt(document.getElementById('conf-folhas-real')?.value || folhasEsperadas);
  const qtdReimp = parseInt(document.getElementById('conf-qtd-reimp')?.value || 0);
  const obs = document.getElementById('conf-obs')?.value || null;

  // Pedido sem carrinho: nunca vai passar por finalizarCarrinhoPendente,
  // então o pagamento precisa ser definido agora, senão ele "conclui" sem
  // forma de pagamento e some do controle do caixa.
  let formaPagamentoStandalone = null;
  if (!carrinhoId && resultado !== 'refazer') {
    formaPagamentoStandalone = document.getElementById('conf-forma-pagamento')?.value || '';
    if (!formaPagamentoStandalone) {
      toast('Selecione a forma de pagamento antes de concluir este pedido.', 'warning');
      return;
    }
  }

  if (resultado === 'refazer') {
    await sb.from('pedidos_copia').update({
      status: 'na_fila',
      observacoes: `[REIMPRESSÃO TOTAL] ${obs || ''}`.trim(),
    }).eq('id', pedidoId);
    toast('↺ Pedido voltou para a fila para reimpressão total.', 'warning');
    closeModal();
    await refreshFila();
    return;
  }

  // Consumo da folha específica (se houver)
  if (pedidoAtual.insumo_folha_id) {
    const { data: folhaProd } = await sb
      .from('produtos')
      .select('estoque_atual')
      .eq('id', pedidoAtual.insumo_folha_id)
      .single();

    if (folhaProd) {
      const novoEstoque = Math.max(0, folhaProd.estoque_atual - folhasReal);
      await sb.from('produtos')
        .update({ estoque_atual: novoEstoque })
        .eq('id', pedidoAtual.insumo_folha_id);
    }
  }

  if (resultado === 'parcial' && qtdReimp > 0) {
    // Cria novo pedido de reimpressão
    const { data: pedidoOriginal } = await sb.from('pedidos_copia').select('*').eq('id', pedidoId).single();
    if (pedidoOriginal) {
      await sb.from('pedidos_copia').insert({
        impressora_id: pedidoOriginal.impressora_id,
        tipo: pedidoOriginal.tipo,
        quantidade: qtdReimp,
        frente_verso: pedidoOriginal.frente_verso,
        preco_unitario: 0,
        total: 0,
        status: 'na_fila',
        cliente_nome_pdv: pedidoOriginal.cliente_nome_pdv,
        observacoes: `[REIMPRESSÃO PARCIAL de #${pedidoOriginal.numero_pedido}] ${obs || ''}`.trim(),
        forma_pagamento: pedidoOriginal.forma_pagamento,
        // Mantém o carrinho_id do pedido original: é gratuita (total 0),
        // mas precisa passar pela finalização do carrinho para receber a
        // forma de pagamento correta e não ficar com "—" no histórico/caixa.
        carrinho_id: pedidoOriginal.carrinho_id || null,
      });
    }
  }

  // ★ Atualiza contadores da impressora
  const campo = isColor ? 'contador_cor_sessao' : 'contador_pb_sesssao';
  const campoTotal = isColor ? 'contador_cor_total' : 'contador_pb_total';
  const imp = State.impressoras.find(i => i.id === impressoraId);

  if (imp) {
    await sb.from('impressoras').update({
      [campo]: (imp[campo] || 0) + folhasReal,
      [campoTotal]: (imp[campoTotal] || 0) + folhasReal,
    }).eq('id', impressoraId);
    // atualiza state local
    if (imp[campo] !== undefined) imp[campo] += folhasReal;
    if (imp[campoTotal] !== undefined) imp[campoTotal] += folhasReal;
  }

  // Consumo de insumos vinculados ao tipo de cópia
  if (pedidoAtual.tipo) {
    const { data: vinculosInsumo } = await sb.from('copia_insumos')
      .select('*, insumos:insumo_id(id, nome, estoque_atual)')
      .eq('tipo_copia', pedidoAtual.tipo);
    for (const v of (vinculosInsumo || [])) {
      const consumo = v.quantidade * folhasReal;
      const estoqueAtual = v.insumos?.estoque_atual || 0;
      if (estoqueAtual < consumo) {
        toast(`⚠️ Estoque de "${v.insumos?.nome}" ficou negativo (usado além do disponível).`, 'warning', 5000);
      }
      await sb.from('produtos').update({ estoque_atual: Math.max(0, estoqueAtual - consumo) }).eq('id', v.insumo_id);
    }
  }

  // Marca pedido como concluído
  await sb.from('pedidos_copia').update({
    status: 'concluido',
    concluido_at: new Date().toISOString(),
    observacoes: obs ? `[Conferência] ${obs}` : null,
    ...(formaPagamentoStandalone ? { forma_pagamento: formaPagamentoStandalone, ...camposBRL(formaPagamentoStandalone, pedidoAtual.total || 0) } : {}),
  }).eq('id', pedidoId);

  closeModal();
  await refreshFila();

  // Verifica se todos os pedidos do carrinho estão prontos
  if (carrinhoId) {
    const { data: irmaos } = await sb.from('pedidos_copia').select('status').eq('carrinho_id', carrinhoId);
    const todosProntos = (irmaos || []).every(x => x.status === 'concluido' || x.status === 'cancelado');
    if (todosProntos) {
      toast('🎉 Pedido pronto! Abrindo carrinho para pagamento...', 'success', 3000);
      setTimeout(() => verCarrinhoPendente(pedidoId), 400);
      return;
    }
  }

  toast('🎉 Pedido entregue e finalizado! Estoque de folhas atualizado.', 'success', 4000);
};

// ── Filtro de status ──────────────────────────────────────
window.filtrarFila = function(chip, filtro) {
  document.querySelectorAll('#fila-filtros .chip').forEach(c => {
    c.classList.remove('active');
    c.dataset.filtro = c.onclick?.toString()?.match(/'([^']+)'\)/)?.[1] || '';
  });
  chip.classList.add('active');
  chip.dataset.filtro = filtro;
  refreshFila();
};

async function renderAssinatura(el) {
  el.innerHTML = `<div id="painel-assinatura" style="padding:20px;"></div>`;
  if (typeof carregarPainelAssinatura === 'function') {
    await carregarPainelAssinatura();
  } else {
    el.innerHTML = '<div class="empty-state">Módulo de assinatura não carregado.</div>';
  }
}

window.navigate = navigate;

// Estado local da tabela de usuários (busca + paginação)
const _usuariosState = { termo: '', pagina: 1, porPagina: 8, todos: [] };

async function renderUsuarios(el) {
  el.innerHTML = `<div class="loading-overlay"><div class="spinner"></div></div>`;

  // Carrega lista via RPC (função segura)
  const { data: usuarios, error } = await sb.rpc('get_usuarios');
  if (error) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-sub">${mensagemErroAmigavel(error, 'carregar usuários')}</div></div>`;
    return;
  }

  const isAdminMaster = State.userProfile?.role === 'adminMaster';
  _usuariosState.todos = isAdminMaster
    ? (usuarios || [])
    : (usuarios || []).filter(u => u.role !== 'adminMaster');

  _renderTabelaUsuarios(el);
}

function _renderTabelaUsuarios(el) {
  const { termo, pagina, porPagina, todos } = _usuariosState;

  const filtrados = termo
    ? todos.filter(u =>
        (u.nome || '').toLowerCase().includes(termo) ||
        (u.email || '').toLowerCase().includes(termo))
    : todos;

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  const pagina_atual_itens = filtrados.slice(inicio, inicio + porPagina);

  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Gerenciar Usuários</div>
        <div class="section-sub">Crie, edite, bloqueie ou exclua funcionários</div>
      </div>
      <button class="btn btn--primary" onclick="abrirModalUsuario()">+ Novo Usuário</button>
    </div>

    <div class="card">
      <div style="padding:var(--sp-4);border-bottom:1px solid var(--c-border)">
        <input type="text" class="input" id="usuarios-busca" placeholder="🔎 Buscar por nome ou e-mail..."
          value="${termo}" oninput="filtrarUsuarios(this.value)" style="max-width:320px" />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Criado em</th><th>Ações</th></tr>
          </thead>
          <tbody>
            ${pagina_atual_itens.map(u => `
              <tr>
                <td><strong>${u.nome || '—'}</strong></td>
                <td>${u.email || '—'}</td>
                <td><span class="badge ${u.role === 'adminMaster' ? 'badge--danger' : (u.role === 'admin' ? 'badge--primary' : 'badge--info')}">${u.role === 'adminMaster' ? 'Admin Master' : (u.role === 'admin' ? 'Admin' : 'Funcionário')}</span></td>
                <td>
                  <span class="badge ${u.ativo ? 'badge--success' : 'badge--danger'}">
                    ${u.ativo ? 'Ativo' : 'Bloqueado'}
                  </span>
                </td>
                <td class="td-mono">${formatDate(u.created_at)}</td>
                <td>
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="btn btn--ghost btn--sm" onclick="editarUsuario('${u.id}')" title="Editar">✏️</button>
                    ${u.ativo
                      ? `<button class="btn btn--ghost btn--sm" onclick="bloquearUsuario('${u.id}')" title="Bloquear">🔒</button>`
                      : `<button class="btn btn--ghost btn--sm" onclick="desbloquearUsuario('${u.id}')" title="Desbloquear">🔓</button>`
                    }
                    ${u.role !== 'admin' ? `<button class="btn btn--ghost btn--sm" style="color:var(--c-danger)" onclick="excluirUsuario('${u.id}')" title="Excluir">🗑️</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('') || `<tr><td colspan="6"><div class="empty-state" style="padding:var(--sp-8)"><div class="empty-state-sub">${termo ? 'Nenhum usuário encontrado para "' + termo + '"' : 'Nenhum usuário cadastrado'}</div></div></td></tr>`}
          </tbody>
        </table>
      </div>
      ${filtrados.length > porPagina ? `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--sp-3) var(--sp-4);border-top:1px solid var(--c-border)">
        <span style="font-size:var(--t-xs);color:var(--c-text-3)">Página ${paginaAtual} de ${totalPaginas} (${filtrados.length} usuário${filtrados.length !== 1 ? 's' : ''})</span>
        <div style="display:flex;gap:6px">
          <button class="btn btn--ghost btn--sm" ${paginaAtual <= 1 ? 'disabled' : ''} onclick="mudarPaginaUsuarios(${paginaAtual - 1})">← Anterior</button>
          <button class="btn btn--ghost btn--sm" ${paginaAtual >= totalPaginas ? 'disabled' : ''} onclick="mudarPaginaUsuarios(${paginaAtual + 1})">Próxima →</button>
        </div>
      </div>` : ''}
    </div>
  `;
}

window.filtrarUsuarios = debounce((valor) => {
  _usuariosState.termo = (valor || '').trim().toLowerCase();
  _usuariosState.pagina = 1;
  _renderTabelaUsuarios(document.getElementById('page-content'));
  // Mantém o foco no campo de busca após o re-render
  const input = document.getElementById('usuarios-busca');
  if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
}, 250);

window.mudarPaginaUsuarios = function(novaPagina) {
  _usuariosState.pagina = novaPagina;
  _renderTabelaUsuarios(document.getElementById('page-content'));
};

window.abrirModalUsuario = function(usuarioId) {
  const isEdit = !!usuarioId;
  let userData = {};

  if (isEdit) {
    // Precisamos buscar da view ou da tabela profiles
    sb.from('profiles').select('*').eq('id', State.user.id).maybeSingle()
    .then(result => console.log('Perfil:', result))
    .catch(err => console.error('Erro:', err));
  } else {
    abrirModalUsuarioForm(isEdit, { nome: '', role: 'funcionario', email: '', senha: '' });
  }
};

function abrirModalUsuarioForm(isEdit, data) {
  openModal(
    isEdit ? 'Editar Usuário' : 'Novo Usuário',
    `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      <div class="field">
        <label>Nome *</label>
        <input type="text" class="input" id="user-nome" value="${data.nome || ''}" placeholder="Nome completo" />
      </div>
      <div class="field">
        <label>E-mail</label>
        <input type="email" class="input" id="user-email" value="${data.email || ''}" placeholder="email@exemplo.com" ${isEdit ? 'disabled' : ''} />
        ${isEdit ? '<div style="font-size:var(--t-xs);color:var(--c-text-3)">O e-mail não pode ser alterado</div>' : ''}
      </div>
      ${!isEdit ? `
      <div class="field">
        <label>Senha *</label>
        <input type="password" class="input" id="user-password" placeholder="Mínimo 6 caracteres" />
      </div>
      ` : ''}
      <div class="field">
        <label>Perfil</label>
        <select class="input" id="user-role">
          <option value="funcionario" ${data.role === 'funcionario' ? 'selected' : ''}>Funcionário</option>
          <option value="admin" ${data.role === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
      </div>
      ${isEdit ? `
      <div class="field">
        <label>Status</label>
        <select class="input" id="user-ativo">
          <option value="true" ${data.ativo ? 'selected' : ''}>Ativo</option>
          <option value="false" ${!data.ativo ? 'selected' : ''}>Bloqueado</option>
        </select>
      </div>
      ` : ''}
      <button class="btn btn--primary btn--lg" style="width:100%;justify-content:center" onclick="salvarUsuario('${isEdit ? data.id : ''}')">
        💾 ${isEdit ? 'Salvar Alterações' : 'Criar Usuário'}
      </button>
    </div>
    `,
    'modal--lg'
  );
}
window.abrirModalUsuario = abrirModalUsuario;

window.salvarUsuario = async function(id) {
  const nome = document.getElementById('user-nome').value.trim();
  const role = document.getElementById('user-role').value;
  const ativo = document.getElementById('user-ativo')?.value === 'true';

  if (!nome) { toast('Nome é obrigatório', 'warning'); return; }

  if (id) {
    // Editar perfil existente
    const { error } = await sb.from('profiles').update({ nome, role, ativo }).eq('id', id);
    if (error) { toast(mensagemErroAmigavel(error, 'editar usuário'), 'error'); return; }
    await registrarLog('editar', 'usuario', id, { nome, role, ativo });
    toast('Usuário atualizado!', 'success');
    closeModal();
    navigate('usuarios');
    return;
  }

  // Criar novo usuário
  const email = document.getElementById('user-email').value.trim();
  const password = document.getElementById('user-password').value;
  if (!email) { toast('E-mail é obrigatório', 'warning'); return; }
  if (!password || password.length < 6) { toast('Senha deve ter pelo menos 6 caracteres', 'warning'); return; }

  // A criação de usuário precisa de privilégio de service_role, que não pode
  // ficar no navegador — por isso chamamos uma Edge Function que roda no servidor.
  const { data: sessionData } = await sb.auth.getSession();
  const { data: resultado, error: fnError } = await sb.functions.invoke('criar-usuario', {
    body: { nome, email, password, role },
    headers: { Authorization: `Bearer ${sessionData?.session?.access_token}` },
  });

  if (fnError || resultado?.error) {
    // FunctionsHttpError não traz a mensagem real automaticamente — precisa ler o corpo da resposta.
    let mensagemReal = resultado?.error || fnError?.message;
    if (fnError?.context && typeof fnError.context.json === 'function') {
      try {
        const body = await fnError.context.json();
        mensagemReal = body?.error || mensagemReal;
      } catch (_) { /* corpo não era JSON, mantém a mensagem padrão */ }
    }
    console.error('[criar-usuario] erro real:', mensagemReal);
    toast(mensagemErroAmigavel({ message: mensagemReal }, 'criar usuário'), 'error');
    return;
  }

  await registrarLog('criar', 'usuario', resultado?.id, { nome, email, role });
  toast('Usuário criado com sucesso!', 'success');
  closeModal();
  navigate('usuarios');
};
window.salvarUsuario = salvarUsuario;

window.bloquearUsuario = async function(id) {
  if (!confirm('Bloquear este usuário? Ele não poderá mais acessar o sistema.')) return;
  const { error } = await sb.from('profiles').update({ ativo: false }).eq('id', id);
  if (error) { toast(mensagemErroAmigavel(error, 'bloquear usuário'), 'error'); return; }
  await registrarLog('bloquear', 'usuario', id);
  toast('Usuário bloqueado!', 'success');
  navigate('usuarios');
};

window.desbloquearUsuario = async function(id) {
  const { error } = await sb.from('profiles').update({ ativo: true }).eq('id', id);
  if (error) { toast(mensagemErroAmigavel(error, 'desbloquear usuário'), 'error'); return; }
  await registrarLog('desbloquear', 'usuario', id);
  toast('Usuário desbloqueado!', 'success');
  navigate('usuarios');
};

window.excluirUsuario = async function(id) {
  if (!confirm('Excluir este usuário? Ele perderá o acesso ao sistema, mas o histórico de ações dele será preservado.')) return;
  // Soft delete: marca como arquivado em vez de apagar de verdade.
  // Preserva histórico (vendas, pedidos, logs) e permite auditoria futura.
  const { error } = await sb.from('profiles').update({ arquivado_em: new Date().toISOString(), ativo: false }).eq('id', id);
  if (error) { toast(mensagemErroAmigavel(error, 'excluir usuário'), 'error'); return; }
  await registrarLog('excluir', 'usuario', id);
  toast('Usuário excluído!', 'success');
  navigate('usuarios');
};