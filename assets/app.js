const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  formations: [],
  formation: null,
  subject: null,
  sessions: [],
  joinToken: null,
  joinSession: null,
  learner: null,
  liveTimer: null,
  liveSessionId: null,
};

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
function normalized(value) { return String(value || '').trim().toLocaleLowerCase('fr-FR'); }

async function boot() {
  const join = new URLSearchParams(window.location.search).get('join');
  if (join) return showStudentJoin(join);
  const { user } = await api('/api/me');
  if (!user) return showLogin();
  state.user = user;
  await showTeacher();
}

async function showStudentJoin(token) {
  state.joinToken = token;
  show('student-view', true); show('login-view', false); show('teacher-view', false); show('logout', false);
  try {
    const { session } = await api(`/api/join?token=${encodeURIComponent(token)}`);
    state.joinSession = session;
    $('student-session-title').textContent = `${session.formation_label} · ${session.subject_label}`;
    $('student-session-context').textContent = `Séance ${session.session_number}${session.title ? ` · ${session.title}` : ''} · ${session.group_label}`;
    if (session.subject_id === 'ada-francais') {
      await startAdaFrench(session);
    } else {
      $('student-session-message').innerHTML = '<p class="learner-prompt">Le parcours de cette matière sera branché ici.</p>';
    }
  } catch (error) {
    $('student-session-title').textContent = 'Lien invalide';
    $('student-session-context').textContent = error.message;
    $('student-session-message').innerHTML = '<p>Demande un nouveau lien ou QR à ton professeur.</p>';
  }
}

function learnerStorageKey(sessionId) { return `portail-learner:${sessionId}`; }
function storedLearner(sessionId) {
  try { return JSON.parse(localStorage.getItem(learnerStorageKey(sessionId)) || 'null'); }
  catch { return null; }
}
function saveLearner(learner) {
  try { localStorage.setItem(learnerStorageKey(learner.class_session_id), JSON.stringify({ id: learner.id })); }
  catch { /* localStorage is optional; the activity still works. */ }
}
function clearStoredLearner(sessionId) {
  try { localStorage.removeItem(learnerStorageKey(sessionId)); }
  catch { /* no-op */ }
}

async function startAdaFrench(session) {
  const saved = storedLearner(session.id);
  if (saved?.id) {
    try {
      const { learner } = await api('/api/join/learners', {
        method: 'POST',
        body: JSON.stringify({ token: state.joinToken, learner_id: saved.id }),
      });
      state.learner = learner;
      return renderOwnNameActivity();
    } catch {
      clearStoredLearner(session.id);
    }
  }
  renderLearnerEntry();
}

function speakFrench(text) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = 0.86;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}

async function trackEvent(eventType, itemId = '', payload = {}) {
  if (!state.learner || !state.joinToken) return null;
  try {
    return await api('/api/join/events', {
      method: 'POST',
      body: JSON.stringify({
        token: state.joinToken,
        learner_id: state.learner.id,
        event_type: eventType,
        item_id: itemId,
        payload,
      }),
    });
  } catch {
    return null;
  }
}

function audioButton(label, text, itemId = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn secondary audio-btn';
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    button.textContent = 'Audio indisponible';
    button.disabled = true;
    button.title = 'Ce navigateur ne fournit pas de synthèse vocale.';
    return button;
  }
  button.textContent = `🔊 ${label}`;
  button.addEventListener('click', () => {
    speakFrench(text);
    trackEvent('audio_played', itemId, { text });
  });
  return button;
}

function renderLearnerEntry() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <h3>Bienvenue</h3>
      <p class="learner-prompt">Ton prénom</p>
      <div id="entry-audio"></div>
      <input id="learner-first-name" class="input learner-input" maxlength="60" autocomplete="given-name" aria-label="Ton prénom" />
      <button id="learner-start" class="btn primary">Continuer</button>
      <p class="learner-help">Si besoin, le professeur peut aider à écrire le prénom cette première fois.</p>
      <p id="learner-entry-status" class="status"></p>
    </div>`;
  $('entry-audio').appendChild(audioButton('Écouter', 'Écris ton prénom. Si tu veux, demande au professeur de t’aider.'));
  $('learner-start').addEventListener('click', registerLearnerFromEntry);
  $('learner-first-name').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') registerLearnerFromEntry();
  });
  $('learner-first-name').focus();
}

async function registerLearnerFromEntry() {
  const firstName = $('learner-first-name').value.trim();
  $('learner-entry-status').textContent = '';
  if (!firstName) {
    $('learner-entry-status').textContent = 'Entre ton prénom pour continuer.';
    speakFrench('Entre ton prénom pour continuer.');
    return;
  }
  try {
    const { learner } = await api('/api/join/learners', {
      method: 'POST',
      body: JSON.stringify({ token: state.joinToken, first_name: firstName }),
    });
    state.learner = learner;
    saveLearner(learner);
    await trackEvent('activity_started', 'positioning-v1', {});
    renderOwnNameActivity();
  } catch (error) {
    $('learner-entry-status').textContent = error.message;
  }
}

function shuffledChoices(answer, pool, count = 4) {
  const unique = [answer];
  for (const value of pool) {
    if (unique.some((item) => normalized(item) === normalized(value))) continue;
    unique.push(value);
    if (unique.length >= count) break;
  }
  return unique.sort(() => Math.random() - 0.5);
}

function renderOwnNameActivity() {
  const firstName = state.learner.first_name;
  const choices = shuffledChoices(firstName, ['Mariam', 'Moussa', 'Amina', 'Sofiane', 'Fatou', 'Karim']);
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <p class="eyebrow">1 · Mon prénom</p>
      <h3>Écoute. Retrouve ton prénom.</h3>
      <div id="own-name-audio"></div>
      <div id="own-name-choices" class="choice-grid"></div>
      <p id="own-name-feedback" class="feedback" aria-live="assertive"></p>
      <button id="own-name-next" class="btn primary hidden">Continuer</button>
    </div>`;
  $('own-name-audio').appendChild(audioButton('Écouter mon prénom', firstName, 'own-name'));
  const grid = $('own-name-choices');
  choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = choice;
    button.addEventListener('click', async () => {
      const correct = normalized(choice) === normalized(firstName);
      await trackEvent('answer', 'own-name', { correct, choice });
      grid.querySelectorAll('.choice-button').forEach((item) => item.classList.remove('bad'));
      if (correct) {
        button.classList.add('good');
        grid.querySelectorAll('.choice-button').forEach((item) => { item.disabled = true; });
        $('own-name-feedback').className = 'feedback good';
        $('own-name-feedback').textContent = 'Oui. C’est ton prénom.';
        speakFrench(`Oui. ${firstName}. C'est ton prénom.`);
        await trackEvent('activity_completed', 'own-name', { attempts_finished: true });
        show('own-name-next', true);
      } else {
        button.classList.add('bad');
        $('own-name-feedback').className = 'feedback bad';
        $('own-name-feedback').textContent = 'Essaie encore. Écoute ton prénom.';
        speakFrench(`Essaie encore. Écoute. ${firstName}.`);
      }
    });
    grid.appendChild(button);
  });
  $('own-name-next').addEventListener('click', renderFirstLetterActivity);
  speakFrench(`Écoute. ${firstName}. Retrouve ton prénom.`);
}

function renderFirstLetterActivity() {
  const firstName = state.learner.first_name;
  const firstLetter = Array.from(firstName.trim())[0]?.toLocaleUpperCase('fr-FR') || '';
  const choices = shuffledChoices(firstLetter, ['A', 'M', 'S', 'K', 'L', 'R', 'B', 'N', 'D', 'F', 'T', 'O', 'E', 'I']);
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <p class="eyebrow">2 · Première lettre</p>
      <h3>Quelle est la première lettre de ton prénom&nbsp;?</h3>
      <div id="first-letter-audio"></div>
      <div id="first-letter-choices" class="choice-grid"></div>
      <p id="first-letter-feedback" class="feedback" aria-live="assertive"></p>
    </div>`;
  $('first-letter-audio').appendChild(audioButton('Écouter', `Ton prénom est ${firstName}. Il commence par la lettre ${firstLetter}. Trouve la lettre ${firstLetter}.`, 'first-letter'));
  const grid = $('first-letter-choices');
  choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = choice;
    button.addEventListener('click', async () => {
      const correct = choice === firstLetter;
      await trackEvent('answer', 'first-letter', { correct, choice });
      grid.querySelectorAll('.choice-button').forEach((item) => item.classList.remove('bad'));
      if (correct) {
        button.classList.add('good');
        grid.querySelectorAll('.choice-button').forEach((item) => { item.disabled = true; });
        $('first-letter-feedback').className = 'feedback good';
        $('first-letter-feedback').textContent = `Oui. ${firstName} commence par ${firstLetter}.`;
        speakFrench(`Oui. ${firstName} commence par ${firstLetter}.`);
        await trackEvent('activity_completed', 'first-letter', {});
        setTimeout(renderPositioningFinish, 900);
      } else {
        button.classList.add('bad');
        $('first-letter-feedback').className = 'feedback bad';
        $('first-letter-feedback').textContent = 'Essaie encore.';
        speakFrench(`Essaie encore. ${firstName} commence par la lettre ${firstLetter}.`);
      }
    });
    grid.appendChild(button);
  });
  speakFrench(`Ton prénom est ${firstName}. Il commence par la lettre ${firstLetter}. Trouve la lettre ${firstLetter}.`);
}

function renderPositioningFinish() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <div class="finish-card">
        <p class="eyebrow">Terminé pour maintenant</p>
        <h3>Bravo ${esc(state.learner.first_name)}.</h3>
        <p class="muted">Ton professeur voit ton avancée et peut te donner la suite.</p>
        <div id="finish-audio"></div>
      </div>
    </div>`;
  $('finish-audio').appendChild(audioButton('Écouter', `Bravo ${state.learner.first_name}. C'est terminé pour maintenant.`, 'positioning-v1'));
  trackEvent('activity_completed', 'positioning-v1', {});
  speakFrench(`Bravo ${state.learner.first_name}. C'est terminé pour maintenant.`);
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
  const internal = state.subject.mode === 'internal';
  $('show-create-session').disabled = !internal;
  $('show-live-sessions').disabled = !internal;
  $('show-create-session').querySelector('span').textContent = state.subject.mode === 'external'
    ? 'Les séances restent pour l’instant gérées par le site existant.'
    : state.subject.mode === 'planned'
      ? 'Le parcours doit d’abord être construit.'
      : 'Préparer un groupe, un lien élève et un QR.';
  $('subject-workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadSessions() {
  const { sessions } = await api('/api/sessions');
  state.sessions = sessions;
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
        ${s.subject_id === 'ada-francais' ? `<button class="btn primary" data-live="${esc(s.id)}">Suivi</button>` : ''}
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
  $('sessions-list').querySelectorAll('[data-live]').forEach((button) => {
    button.addEventListener('click', () => openLiveView(button.dataset.live));
  });
}

async function openLiveView(sessionId) {
  clearLivePolling();
  state.liveSessionId = sessionId;
  const session = state.sessions.find((item) => item.id === sessionId);
  $('live-title').textContent = session ? `${session.formation_label} · ${session.subject_label} · Séance ${session.session_number}` : 'Séance';
  $('live-context').textContent = session ? `${session.group_label}${session.title ? ` · ${session.title}` : ''}` : '';
  $('live-learners').innerHTML = '';
  $('live-status').textContent = 'Chargement…';
  $('live-dialog').showModal();
  await refreshLiveView();
  state.liveTimer = window.setInterval(refreshLiveView, 4000);
}

async function refreshLiveView() {
  if (!state.liveSessionId || !$('live-dialog').open) return;
  try {
    const { learners } = await api(`/api/sessions/${encodeURIComponent(state.liveSessionId)}/activity`);
    $('live-status').textContent = learners.length ? `${learners.length} élève${learners.length > 1 ? 's' : ''} connecté${learners.length > 1 ? 's' : ''}` : 'En attente des élèves…';
    $('live-learners').innerHTML = learners.map((learner) => `
      <article class="live-row">
        <div>
          <strong>${esc(learner.first_name)}${learner.last_name ? ` ${esc(learner.last_name)}` : ''}</strong>
          <small>${learner.last_activity_at ? `Dernière activité ${new Date(learner.last_activity_at).toLocaleTimeString('fr-FR')}` : 'Connecté, pas encore de réponse'}</small>
        </div>
        <div class="progress-badge">${learner.completed_items}/3 étapes · ${learner.correct_answers}/${learner.attempts} réponses justes</div>
      </article>`).join('');
  } catch (error) {
    $('live-status').textContent = error.message;
  }
}

function clearLivePolling() {
  if (state.liveTimer) window.clearInterval(state.liveTimer);
  state.liveTimer = null;
  state.liveSessionId = null;
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
$('show-live-sessions').addEventListener('click', () => $('recent-sessions-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }));
$('refresh-sessions').addEventListener('click', loadSessions);
$('live-dialog').addEventListener('close', clearLivePolling);
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
