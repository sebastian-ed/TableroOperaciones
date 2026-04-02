// ── Clean It Ops – ops-app.js ─────────────────────────────────────────
// Panel de comunicación operativa con Supabase en tiempo real.
// ─────────────────────────────────────────────────────────────────────

(() => {
  'use strict';

  // ── PIN DE ADMIN ─────────────────────────────────────────────────
  // Cambiá este valor para establecer tu propia contraseña de admin:
  const ADMIN_PIN = 'Seba02069437892498.';
  const SESSION_ROLE_KEY = 'ci_role';

  // ── ESTADO ──────────────────────────────────────────────────────────
  let supabase = null;
  let role = null;
  let cards = [];
  let activeFilter = 'all';
  let editingCardId = null;
  let deadlineTimers = [];
  let chatPollInterval = null;
  let lastChatTimestamp = null;
  let authConfirmHandler = null;

  // ── ELEMENTOS DOM ─────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const loginOverlay    = $('loginOverlay');
  const appShell        = $('appShell');
  const loginAdminBtn   = $('loginAdminBtn');
  const loginOpBtn      = $('loginOperarioBtn');
  const roleIcon        = $('roleIcon');
  const roleLabel       = $('roleLabel');
  const roleSwitchBtn   = $('roleSwitchBtn');
  const statusDot       = $('statusDot');
  const statusText      = $('statusText');
  const supabaseConfig  = $('supabaseConfig');
  const supabaseUrlIn   = $('supabaseUrl');
  const supabaseKeyIn   = $('supabaseKey');
  const connectBtn      = $('connectBtn');
  const sidebarEl       = $('sidebar');
  const sidebarToggle   = $('sidebarToggle');
  const sidebarClose    = $('sidebarClose');
  const sidebarOverlay  = $('sidebarOverlay');
  const cardsGrid       = $('cardsGrid');
  const emptyState      = $('emptyState');
  const newCardBtn      = $('newCardBtn');
  const chatToggleBtn   = $('chatToggleBtn');
  const chatPanel       = $('chatPanel');
  const chatCloseBtn    = $('chatCloseBtn');
  const chatMessages_el = $('chatMessages');
  const chatInput       = $('chatInput');
  const chatSendBtn     = $('chatSendBtn');
  const chatName        = $('chatName');
  const backHomeBtn     = $('backHomeBtn');
  const cardModal       = $('cardModal');
  const modalTitle      = $('modalTitle');
  const modalClose      = $('modalClose');
  const cancelModalBtn  = $('cancelModalBtn');
  const saveCardBtn     = $('saveCardBtn');
  const deleteCardBtn   = $('deleteCardBtn');
  const topbarDate      = $('topbarDate');
  const statTotal       = $('statTotal');
  const statPending     = $('statPending');
  const statDone        = $('statDone');
  const statCritical    = $('statCritical');
  const filterChips     = document.querySelectorAll('.filter-chip');
  const adminOnlyEls    = document.querySelectorAll('.admin-only');
  const authModal       = $('authModal');
  const authModalTitle  = $('authModalTitle');
  const authModalText   = $('authModalText');
  const authPassword    = $('authPassword');
  const authConfirmBtn  = $('authConfirmBtn');
  const authCancelBtn   = $('authCancelBtn');
  const authModalClose  = $('authModalClose');

  // ── INIT ─────────────────────────────────────────────────────────
  function init() {
    updateClock();
    setInterval(updateClock, 30000);

    const savedUrl  = localStorage.getItem('ci_sb_url')   || '';
    const savedKey  = localStorage.getItem('ci_sb_key')   || '';
    const savedName = localStorage.getItem('ci_chat_name') || '';
    const savedRole = localStorage.getItem(SESSION_ROLE_KEY);

    if (savedUrl)  supabaseUrlIn.value = savedUrl;
    if (savedKey)  supabaseKeyIn.value = savedKey;
    if (savedName) chatName.value = savedName;

    chatName.addEventListener('change', () => {
      localStorage.setItem('ci_chat_name', chatName.value.trim());
    });

    bindAuthModal();

    if (savedRole === 'admin' || savedRole === 'operario') {
      startApp(savedRole, { preserveSession: true });
    }
  }

  function updateClock() {
    const now = new Date();
    const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' };
    topbarDate.textContent = now.toLocaleDateString('es-AR', opts);
  }

  // ── LOGIN / ROL ───────────────────────────────────────────────────
  loginAdminBtn.addEventListener('click', () => {
    askAdminPassword({
      title: 'Acceso administrador',
      text: 'Ingresá la contraseña de administrador para entrar al panel.',
      confirmText: 'Ingresar',
      onSuccess: () => startApp('admin')
    });
  });

  loginOpBtn.addEventListener('click', () => startApp('operario'));

  function startApp(selectedRole, options = {}) {
    role = selectedRole;
    if (!options.preserveSession) {
      localStorage.setItem(SESSION_ROLE_KEY, selectedRole);
    }
    loginOverlay.style.display = 'none';
    appShell.style.display = '';
    applyRole();
    loadLocalCards();
  }

  function applyRole() {
    if (role === 'admin') {
      roleIcon.textContent = '🔑';
      roleLabel.textContent = 'Admin';
      roleSwitchBtn.style.display = '';
      roleSwitchBtn.title = 'Cambiar a vista operario';
    } else {
      roleIcon.textContent = '👷';
      roleLabel.textContent = 'Operario';
      roleSwitchBtn.style.display = '';
      roleSwitchBtn.title = 'Cambiar a vista admin';
    }
    adminOnlyEls.forEach(el => {
      el.style.display = role === 'admin' ? '' : 'none';
    });
    renderCards();
  }

  roleSwitchBtn.addEventListener('click', () => {
    if (role === 'admin') {
      role = 'operario';
      localStorage.setItem(SESSION_ROLE_KEY, 'operario');
      applyRole();
      return;
    }

    askAdminPassword({
      title: 'Cambiar a Admin',
      text: 'Ingresá la contraseña de administrador para acceder al panel de creación y edición.',
      confirmText: 'Acceder',
      onSuccess: () => {
        role = 'admin';
        localStorage.setItem(SESSION_ROLE_KEY, 'admin');
        applyRole();
      }
    });
  });

  backHomeBtn.addEventListener('click', goToHome);

  function goToHome() {
    role = null;
    localStorage.removeItem(SESSION_ROLE_KEY);
    loginOverlay.style.display = 'flex';
    appShell.style.display = 'none';
    closeModal();
    closeAuthModal();
    closeSidebar();
  }

  function bindAuthModal() {
    authConfirmBtn.addEventListener('click', handleAuthConfirm);
    authCancelBtn.addEventListener('click', closeAuthModal);
    authModalClose.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', e => {
      if (e.target === authModal) closeAuthModal();
    });
    authPassword.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAuthConfirm();
      }
      if (e.key === 'Escape') closeAuthModal();
    });
  }

  function askAdminPassword({ title, text, confirmText, onSuccess }) {
    authConfirmHandler = onSuccess;
    authModalTitle.textContent = title || 'Acceso administrador';
    authModalText.textContent = text || 'Ingresá la contraseña de administrador para continuar.';
    authConfirmBtn.textContent = confirmText || 'Ingresar';
    authPassword.value = '';
    authModal.style.display = 'flex';
    setTimeout(() => authPassword.focus(), 50);
  }

  function handleAuthConfirm() {
    const pin = authPassword.value;
    if (pin === ADMIN_PIN) {
      const handler = authConfirmHandler;
      closeAuthModal();
      if (typeof handler === 'function') handler();
    } else {
      alert('Contraseña incorrecta.');
      authPassword.select();
    }
  }

  function closeAuthModal() {
    authModal.style.display = 'none';
    authPassword.value = '';
    authConfirmHandler = null;
  }

  // ── SUPABASE ──────────────────────────────────────────────────────
  connectBtn.addEventListener('click', connectSupabase);

  async function connectSupabase() {
    const url = supabaseUrlIn.value.trim();
    const key = supabaseKeyIn.value.trim();
    if (!url || !key) { alert('Ingresá la URL y la Key de Supabase.'); return; }

    connectBtn.textContent = 'Conectando...';
    connectBtn.disabled = true;

    try {
      supabase = window.supabase.createClient(url, key);

      const { error } = await supabase.from('ops_cards').select('id').limit(1);
      if (error && error.code !== 'PGRST116') throw error;

      localStorage.setItem('ci_sb_url', url);
      localStorage.setItem('ci_sb_key', key);

      setStatus('connected', 'Conectado');
      supabaseConfig.style.display = 'none';

      startRealtimeCards();
      await fetchCards();
      await fetchChatFull();
      startChatPolling();

    } catch (e) {
      setStatus('error', 'Error de conexión');
      console.error(e);
      alert('No se pudo conectar. Verificá la URL y la Key.\n\n' + (e.message || e));
    } finally {
      connectBtn.textContent = 'Conectar';
      connectBtn.disabled = false;
    }
  }

  function setStatus(state, text) {
    statusDot.className = 'status-dot' + (state ? ' ' + state : '');
    statusText.textContent = text;
  }

  // ── REALTIME TARJETAS ─────────────────────────────────────────────
  function startRealtimeCards() {
    if (!supabase) return;
    supabase.channel('ops_cards_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ops_cards' }, () => {
        fetchCards();
      })
      .subscribe();
  }

  // ── CHAT: POLLING cada 3s ─────────────────────────────────────────
  function startChatPolling() {
    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(pollNewMessages, 3000);
  }

  async function pollNewMessages() {
    if (!supabase) return;
    let query = supabase
      .from('ops_chat')
      .select('*')
      .order('created_at', { ascending: true });

    if (lastChatTimestamp) {
      query = query.gt('created_at', lastChatTimestamp);
    }

    const { data, error } = await query;
    if (error) { console.error('Poll error:', error); return; }
    if (data && data.length > 0) {
      data.forEach(m => appendChatMessage(m));
      lastChatTimestamp = data[data.length - 1].created_at;
    }
  }

  // ── CARDS: FETCH ──────────────────────────────────────────────────
  async function fetchCards() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('ops_cards')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    cards = data || [];
    saveLocalCards();
    renderCards();
    updateStats();
  }

  function saveLocalCards() {
    localStorage.setItem('ci_cards', JSON.stringify(cards));
  }

  function loadLocalCards() {
    const raw = localStorage.getItem('ci_cards');
    if (raw) {
      try { cards = JSON.parse(raw); } catch { cards = []; }
      renderCards(); updateStats();
    }
    const url = localStorage.getItem('ci_sb_url');
    const key = localStorage.getItem('ci_sb_key');
    if (url && key) {
      supabaseUrlIn.value = url;
      supabaseKeyIn.value = key;
      connectSupabase();
    }
  }

  // ── CARDS: RENDER ─────────────────────────────────────────────────
  function renderCards() {
    deadlineTimers.forEach(clearInterval);
    deadlineTimers = [];
    cardsGrid.innerHTML = '';

    const filtered = activeFilter === 'all'
      ? cards
      : cards.filter(c => c.urgency === activeFilter);

    if (filtered.length === 0) {
      emptyState.style.display = '';
    } else {
      emptyState.style.display = 'none';
      filtered.forEach(card => cardsGrid.appendChild(buildCard(card)));
    }
  }

  const URGENCY_LABEL = { critical: '🔴 Crítico', high: '🟠 Urgente', normal: '🔵 Normal', info: '⚪ Info' };
  const STATUS_LABEL  = { pending: '⏳ Pendiente', inprogress: '🔄 En progreso', done: '✅ Completada' };
  const STATUS_CLASS  = { pending: 'status-pending', inprogress: 'status-inprogress', done: 'status-done' };

  function buildCard(card) {
    const el = document.createElement('div');
    el.className = `task-card${card.status === 'done' ? ' done' : ''}`;
    el.dataset.urgency = card.urgency || 'normal';
    el.dataset.id = card.id;

    const isAdmin = role === 'admin';
    const urgencyLabel = URGENCY_LABEL[card.urgency] || 'Normal';
    const statusLabel  = STATUS_LABEL[card.status]   || 'Pendiente';
    const statusClass  = STATUS_CLASS[card.status]   || 'status-pending';

    el.innerHTML = `
      <div class="card-header">
        <div class="card-title">${escHtml(card.title)}</div>
        <div class="card-actions">
          ${isAdmin ? `<button class="card-btn edit-btn" title="Editar">✏️</button>` : ''}
        </div>
      </div>
      <span class="urgency-badge ${card.urgency || 'normal'}">${urgencyLabel}</span>
      ${card.description ? `<div class="card-desc">${escHtml(card.description)}</div>` : ''}
      <div class="card-meta">
        ${card.to_person ? `
          <div class="card-meta-row">
            <span class="card-meta-icon">👤</span>
            <span>Para: <strong>${escHtml(card.to_person)}</strong></span>
          </div>` : ''}
        ${card.sector ? `
          <div class="card-meta-row">
            <span class="card-meta-icon">📍</span>
            <span>Sector: <strong>${escHtml(card.sector)}</strong></span>
          </div>` : ''}
        ${card.deadline ? `
          <div class="card-meta-row">
            <span class="card-meta-icon">⏱️</span>
            <span class="deadline-display deadline-ok" id="dl-${card.id}">Calculando...</span>
          </div>` : ''}
      </div>
      <div class="card-footer">
        ${isAdmin
          ? `<span class="status-badge ${statusClass}">${statusLabel}</span>`
          : `<label class="status-control">
              <span class="status-control-label">Estado</span>
              <select class="operator-status-select" data-card-id="${card.id}" aria-label="Cambiar estado de la tarjeta">
                <option value="pending" ${card.status === 'pending' ? 'selected' : ''}>⏳ Pendiente</option>
                <option value="inprogress" ${card.status === 'inprogress' ? 'selected' : ''}>🔄 En proceso</option>
                <option value="done" ${card.status === 'done' ? 'selected' : ''}>✅ Completada</option>
              </select>
            </label>`}
        <span style="font-size:11px;color:#9ca3af">${formatRelative(card.created_at)}</span>
      </div>
    `;

    const editBtn = el.querySelector('.edit-btn');
    if (editBtn) editBtn.addEventListener('click', () => openModal(card));

    const statusSelect = el.querySelector('.operator-status-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', async e => {
        await updateCardStatus(card.id, e.target.value, e.target);
      });
    }

    if (card.deadline) {
      updateDeadline(card.id, card.deadline);
      const timer = setInterval(() => updateDeadline(card.id, card.deadline), 30000);
      deadlineTimers.push(timer);
    }

    return el;
  }

  async function updateCardStatus(cardId, newStatus, selectEl) {
    const originalValue = cards.find(c => c.id === cardId)?.status || 'pending';
    if (selectEl) selectEl.disabled = true;

    try {
      if (supabase) {
        const { error } = await supabase
          .from('ops_cards')
          .update({ status: newStatus })
          .eq('id', cardId);
        if (error) throw error;
        await fetchCards();
      } else {
        const idx = cards.findIndex(c => c.id === cardId);
        if (idx >= 0) cards[idx].status = newStatus;
        saveLocalCards();
        renderCards();
        updateStats();
      }
    } catch (e) {
      console.error(e);
      alert('No se pudo actualizar el estado: ' + e.message);
      if (selectEl) selectEl.value = originalValue;
    } finally {
      if (selectEl) selectEl.disabled = false;
    }
  }

  function updateDeadline(id, deadlineStr) {
    const el = document.getElementById('dl-' + id);
    if (!el) return;
    const now  = new Date();
    const end  = new Date(deadlineStr);
    const diff = end - now;

    if (diff <= 0) {
      el.textContent = '⚠️ Vencido';
      el.className = 'deadline-display deadline-over';
      return;
    }
    const hours = Math.floor(diff / 3600000);
    const mins  = Math.floor((diff % 3600000) / 60000);
    const days  = Math.floor(hours / 24);
    let text;
    if (days > 0)       text = `Vence en ${days}d ${hours % 24}h`;
    else if (hours > 0) text = `Vence en ${hours}h ${mins}m`;
    else                text = `Vence en ${mins}m`;

    el.textContent = text;
    el.className = 'deadline-display ' + (days < 1 && hours < 4 ? 'deadline-warn' : 'deadline-ok');
  }

  // ── STATS ─────────────────────────────────────────────────────────
  function updateStats() {
    statTotal.textContent    = cards.length;
    statPending.textContent  = cards.filter(c => c.status !== 'done').length;
    statDone.textContent     = cards.filter(c => c.status === 'done').length;
    statCritical.textContent = cards.filter(c => c.urgency === 'critical').length;
  }

  // ── FILTERS ───────────────────────────────────────────────────────
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderCards();
    });
  });

  // ── MODAL ─────────────────────────────────────────────────────────
  newCardBtn.addEventListener('click', () => openModal(null));
  modalClose.addEventListener('click', closeModal);
  cancelModalBtn.addEventListener('click', closeModal);
  cardModal.addEventListener('click', e => { if (e.target === cardModal) closeModal(); });

  function openModal(card) {
    editingCardId = card ? card.id : null;
    modalTitle.textContent = card ? 'Editar tarjeta' : 'Nueva tarjeta';
    $('hidden-id').value        = card?.id || '';
    $('cardTitle').value        = card?.title || '';
    $('cardDesc').value         = card?.description || '';
    $('cardTo').value           = card?.to_person || '';
    $('cardUrgency').value      = card?.urgency || 'normal';
    $('cardSector').value       = card?.sector || '';
    $('cardStatus').value       = card?.status || 'pending';
    if (card?.deadline) {
      const d = new Date(card.deadline);
      $('cardDeadline').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
    } else {
      $('cardDeadline').value = '';
    }
    deleteCardBtn.style.display = card ? '' : 'none';
    cardModal.style.display = 'flex';
    setTimeout(() => $('cardTitle').focus(), 50);
  }

  function closeModal() {
    cardModal.style.display = 'none';
    editingCardId = null;
  }

  saveCardBtn.addEventListener('click', saveCard);
  deleteCardBtn.addEventListener('click', async () => {
    if (!editingCardId) return;
    if (!confirm('¿Eliminar esta tarjeta?')) return;
    await deleteCard(editingCardId);
    closeModal();
  });

  async function saveCard() {
    const title = $('cardTitle').value.trim();
    if (!title) { alert('El título es obligatorio.'); return; }

    const deadlineVal = $('cardDeadline').value;
    const payload = {
      title,
      description: $('cardDesc').value.trim(),
      to_person:   $('cardTo').value.trim(),
      urgency:     $('cardUrgency').value,
      sector:      $('cardSector').value.trim(),
      status:      $('cardStatus').value,
      deadline:    deadlineVal ? new Date(deadlineVal).toISOString() : null,
    };

    saveCardBtn.disabled = true;
    saveCardBtn.textContent = 'Guardando...';

    try {
      if (supabase) {
        if (editingCardId) {
          const { error } = await supabase.from('ops_cards').update(payload).eq('id', editingCardId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('ops_cards').insert(payload);
          if (error) throw error;
        }
        await fetchCards();
      } else {
        if (editingCardId) {
          const idx = cards.findIndex(c => c.id === editingCardId);
          if (idx >= 0) cards[idx] = { ...cards[idx], ...payload };
        } else {
          cards.unshift({ id: Date.now().toString(), ...payload, created_at: new Date().toISOString() });
        }
        saveLocalCards();
        renderCards();
        updateStats();
      }
      closeModal();
    } catch(e) {
      console.error(e);
      alert('Error al guardar: ' + e.message);
    } finally {
      saveCardBtn.disabled = false;
      saveCardBtn.textContent = 'Guardar tarjeta';
    }
  }

  async function deleteCard(id) {
    if (supabase) {
      const { error } = await supabase.from('ops_cards').delete().eq('id', id);
      if (error) throw error;
      await fetchCards();
    } else {
      cards = cards.filter(c => c.id !== id);
      saveLocalCards();
      renderCards();
      updateStats();
    }
  }

  // ── CHAT ──────────────────────────────────────────────────────────
  chatToggleBtn.addEventListener('click', () => chatPanel.classList.toggle('hidden'));
  chatCloseBtn.addEventListener('click', () => chatPanel.classList.add('hidden'));
  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  async function sendChatMessage() {
    const text = chatInput.value.trim();
    const name = chatName.value.trim() || (role === 'admin' ? 'Admin' : 'Operario');
    if (!text) return;

    chatInput.value = '';
    chatInput.focus();

    const msg = { name, role, message: text };

    if (supabase) {
      const { error } = await supabase.from('ops_chat').insert(msg);
      if (error) {
        console.error('Error al enviar mensaje:', error);
        alert('No se pudo enviar el mensaje: ' + error.message);
        chatInput.value = text;
      }
    } else {
      appendChatMessage({ ...msg, created_at: new Date().toISOString() });
    }
  }

  async function fetchChatFull() {
    if (!supabase) return;
    chatMessages_el.innerHTML = '';
    lastChatTimestamp = null;

    const { data, error } = await supabase
      .from('ops_chat')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) { console.error('Error cargando chat:', error); return; }
    if (data && data.length > 0) {
      data.forEach(m => appendChatMessage(m));
      lastChatTimestamp = data[data.length - 1].created_at;
    }
  }

  function appendChatMessage(msg) {
    const isAdmin = msg.role === 'admin';
    const div = document.createElement('div');
    div.className = `chat-msg ${isAdmin ? 'admin' : 'operario'}`;
    div.innerHTML = `
      <div class="chat-bubble">${escHtml(msg.message)}</div>
      <div class="chat-meta">${escHtml(msg.name)} · ${formatRelative(msg.created_at)}</div>
    `;
    chatMessages_el.appendChild(div);
    chatMessages_el.scrollTop = chatMessages_el.scrollHeight;
  }

  // ── SIDEBAR TOGGLE ────────────────────────────────────────────────
  sidebarToggle.addEventListener('click', () => {
    sidebarEl.classList.add('open');
    sidebarOverlay.classList.add('open');
  });
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);
  function closeSidebar() {
    sidebarEl.classList.remove('open');
    sidebarOverlay.classList.remove('open');
  }

  // ── UTILS ─────────────────────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatRelative(isoStr) {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr);
    if (diff < 60000)    return 'Ahora';
    if (diff < 3600000)  return Math.floor(diff / 60000) + 'm';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    return Math.floor(diff / 86400000) + 'd';
  }

  // ── ARRANQUE ──────────────────────────────────────────────────────
  init();

})();

/* ── SQL PARA SUPABASE (ejecutar en el SQL Editor de tu proyecto) ──────
CREATE TABLE IF NOT EXISTS ops_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  urgency     text DEFAULT 'normal',
  to_person   text,
  sector      text,
  deadline    timestamptz,
  status      text DEFAULT 'pending',
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE ops_cards REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS ops_chat (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  role       text,
  message    text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ops_chat REPLICA IDENTITY FULL;

ALTER TABLE ops_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_ops_cards" ON ops_cards FOR ALL USING (true);

ALTER TABLE ops_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_ops_chat" ON ops_chat FOR ALL USING (true);
──────────────────────────────────────────────────────────────────────── */
