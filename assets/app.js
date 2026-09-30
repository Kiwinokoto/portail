const $ = (id) => document.getElementById(id);
const state = { user: null, formations: [], formation: null, subject: null };

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
  return data;
}

function show(id, yes = true) { $(id).classList.toggle('hidden', !yes); }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function boot() {
  const join = new URLSearchParams(window.location.search).get('join');
  if (join) return showStudentJoin(join);
  const { user } = await api('/api/me');
  if (!user) return showLogin();
  state.user = user;
  await showTeacher();
}

async function showStudentJoin(token) {
  show('student-view', true); show('login-view', false); show('teacher-view', false); show('logout', false);
  try {
    const { session } = await api(`/api/join?token=${encodeURIComponent(token)}`);
    $('student-session-title').textContent = `${session.formation_label} · ${session.subject_label}`;
    $('student-session-context').textContent = `Séance ${session.session_number}${session.title ? ` · ${session.title}` : ''} · ${session.group_label}`;
  } catch (error) {
    $('student-session-title').textContent = 'Lien invalide';
    $('student-session-context').textContent = error.message;
    $('student-session-message').textContent = 'Demande un nouveau lien ou QR à ton professeur.';
  }
}

function showLogin() {
  show('student-view', false); show('login-view', true); show('teacher-view', false); show('logout', false);
}

async function showTeacher() {
  show('login-view', false); show('teacher-view', true); show('logout', true);
  $('welcome').textContent = `Bonjour ${state.user.display_name}`;
  show('admin-open', state.user.role === 'admin');
  const data = await api('/api/catalog');
  state.formations = data.formations;
  renderFormations();
  await loadSessions();
}

function renderFormations() {
  $('formation-grid').innerHTML = state.formations.map((f) => `
    <button class="card-button" data-formation="${esc(f.id)}">
      <strong>${esc(f.label)}</strong>
      <span>${f.subjects.length} matière${f.subjects.length > 1 ? 's' : ''} disponible${f.subjects.length > 1 ? 's' : ''}</span>
    </button>`).join('');
  $('formation-grid').querySelectorAll('[data-formation]').forEach((button) => {
    button.addEventListener('click', () => selectFormation(button.dataset.formation));
  });
}

function selectFormation(id) {
  state.formation = state.formations.find((f) => f.id === id) || null;
  state.subject = null;
  if (!state.formation) return;
  $('subjects-title').textContent = `${state.formation.label} · matières`;
  $('subject-grid').innerHTML = state.formation.subjects.map((s) => `
    <button class="card-button" data-subject="${esc(s.id)}">
      <strong>${esc(s.label)}</strong>
      <span>${esc(s.description)}</span>
      ${s.mode === 'planned' ? '<span class="pill">à construire</span>' : s.mode === 'external' ? '<span class="pill">cours existant</span>' : ''}
    </button>`).join('');
  $('subject-grid').querySelectorAll('[data-subject]').forEach((button) => {
    button.addEventListener('click', () => selectSubject(button.dataset.subject));
  });
  show('subjects-panel', true); show('subject-workspace', false); show('back-formations', true);
  $('subjects-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectSubject(id) {
  state.subject = state.formation?.subjects.find((s) => s.id === id) || null;
  if (!state.subject) return;
  $('workspace-title').textContent = `${state.formation.label} · ${state.subject.label}`;
  $('workspace-description').textContent = state.subject.description;
  if (state.subject.external_url) {
    $('external-course').href = state.subject.external_url;
    show('external-course', true);
  } else show('external-course', false);
  show('subject-workspace', true);
  show('session-form', false);
  $('show-create-session').disabled = state.subject.mode !== 'internal';
  $('show-create-session').querySelector('span').textContent = state.subject.mode === 'external'
    ? 'Les séances restent pour l’instant gérées par le site existant.'
    : state.subject.mode === 'planned'
      ? 'Le parcours doit d’abord être construit.'
      : 'Préparer un groupe, un lien élève et un QR.';
  $('subject-workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadSessions() {
  const { sessions } = await api('/api/sessions');
  if (!sessions.length) {
    $('sessions-list').innerHTML = '<p class="muted">Aucune séance créée pour le moment.</p>';
    return;
  }
  $('sessions-list').innerHTML = sessions.map((s) => `
    <article class="session-row">
      <div class="meta">
        <strong>${esc(s.formation_label)} · ${esc(s.subject_label)} · Séance ${s.session_number}${s.title ? ` · ${esc(s.title)}` : ''}</strong>
        <small>${esc(s.group_label)} · créée ${new Date(s.created_at).toLocaleString('fr-FR')}</small>
      </div>
      <div class="session-actions">
        <button class="btn ghost" data-copy="${esc(s.join_url)}">Copier le lien élève</button>
        <a class="btn secondary" href="/api/sessions/${encodeURIComponent(s.id)}/qr.svg" target="_blank">QR</a>
      </div>
    </article>`).join('');
  $('sessions-list').querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      const original = button.textContent; button.textContent = 'Copié ✓';
      setTimeout(() => { button.textContent = original; }, 1400);
    });
  });
}

async function loadUsers() {
  const { users } = await api('/api/admin/users');
  $('users-list').innerHTML = users.map((u) => `
    <article class="user-row">
      <div class="meta"><strong>${esc(u.display_name)}</strong><small>${esc(u.role)} · ${u.active ? 'actif' : 'désactivé'}</small></div>
      <div class="user-actions">
        <button class="btn ghost" data-rotate="${u.id}">Régénérer l'accès</button>
        <button class="btn ghost ${u.active ? 'danger' : 'success'}" data-active="${u.id}" data-next="${u.active ? '0' : '1'}">${u.active ? 'Désactiver' : 'Réactiver'}</button>
      </div>
    </article>`).join('');
  $('users-list').querySelectorAll('[data-rotate]').forEach((button) => button.addEventListener('click', () => rotateToken(button.dataset.rotate)));
  $('users-list').querySelectorAll('[data-active]').forEach((button) => button.addEventListener('click', () => setUserActive(button.dataset.active, button.dataset.next === '1')));
}

function revealToken(name, token) {
  $('new-token-box').innerHTML = `<strong>Accès de ${esc(name)}</strong><p>Copie ce token maintenant : il ne sera plus affiché ensuite.</p><code>${esc(token)}</code>`;
  show('new-token-box', true);
}

async function rotateToken(userId) {
  if (!confirm('Régénérer cet accès ? Les sessions ouvertes de ce collègue seront fermées.')) return;
  const { token } = await api(`/api/admin/users/${userId}/rotate-token`, { method:'POST', body:'{}' });
  const user = (await api('/api/admin/users')).users.find((u) => String(u.id) === String(userId));
  revealToken(user?.display_name || 'ce collègue', token);
  await loadUsers();
}

async function setUserActive(userId, active) {
  await api(`/api/admin/users/${userId}/active`, { method:'POST', body:JSON.stringify({ active }) });
  await loadUsers();
}

$('login-button').addEventListener('click', async () => {
  $('login-status').textContent = '';
  try {
    const { user } = await api('/api/auth/login', { method:'POST', body:JSON.stringify({ token:$('login-token').value }) });
    $('login-token').value = ''; state.user = user; await showTeacher();
  } catch (error) { $('login-status').textContent = error.message; }
});
$('login-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-button').click(); });
$('logout').addEventListener('click', async () => { await api('/api/auth/logout', { method:'POST', body:'{}' }); state.user = null; showLogin(); });
$('back-formations').addEventListener('click', () => { state.formation = null; state.subject = null; show('subjects-panel', false); show('subject-workspace', false); show('back-formations', false); });
$('show-create-session').addEventListener('click', () => show('session-form', true));
$('refresh-sessions').addEventListener('click', loadSessions);
$('session-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('session-status').textContent = '';
  try {
    await api('/api/sessions', { method:'POST', body:JSON.stringify({
      formation_id: state.formation.id, subject_id: state.subject.id,
      session_number: Number($('session-number').value), title:$('session-title').value, group_label:$('session-group').value,
    })});
    $('session-status').textContent = 'Séance créée ✓'; $('session-title').value = ''; $('session-group').value = '';
    await loadSessions();
  } catch (error) { $('session-status').textContent = error.message; }
});
$('admin-open').addEventListener('click', async () => { show('new-token-box', false); await loadUsers(); $('admin-dialog').showModal(); });
$('create-user').addEventListener('click', async () => {
  $('admin-status').textContent = '';
  try {
    const name = $('new-user-name').value;
    const { user, token } = await api('/api/admin/users', { method:'POST', body:JSON.stringify({ display_name:name, role:$('new-user-role').value }) });
    revealToken(user.display_name, token); $('new-user-name').value = ''; await loadUsers();
  } catch (error) { $('admin-status').textContent = error.message; }
});

boot().catch((error) => { $('login-status').textContent = error.message; showLogin(); });
