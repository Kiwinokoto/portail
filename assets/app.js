const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  formations: [],
  formation: null,
  subject: null,
  sessions: [],
  externalSessions: [],
  externalSessionsStatus: 'idle',
  joinToken: null,
  joinSession: null,
  roster: [],
  learner: null,
  liveTimer: null,
  liveSessionId: null,
  liveLearners: [],
  livePollInFlight: false,
  reportSessionId: null,
  previewMode: false,
  positioningItemId: '',
  learnerStart: null,
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
function rosterLabel(learner) {
  const suffix = learner.last_initial || (learner.last_name ? `${Array.from(learner.last_name)[0]?.toLocaleUpperCase('fr-FR') || ''}.` : '');
  return [learner.first_name, suffix].filter(Boolean).join(' ');
}

function ssoContinuation() {
  const value = new URLSearchParams(window.location.search).get('continue') || '';
  return value.startsWith('/api/sso/authorize?') ? value : '';
}

function teacherPreviewSubject() {
  const params = new URLSearchParams(window.location.search);
  const subjectId = params.get('subject') || '';
  if (params.get('preview') !== 'teacher') return '';
  return ['psr-maths', 'ada-francais', 'ada-maths'].includes(subjectId) ? subjectId : '';
}

const TEACHER_WORKSPACES = ['seances', 'parcours', 'corrections', 'live', 'reports'];

function requestedTeacherWorkspace() {
  const params = new URLSearchParams(window.location.search);
  const subjectId = params.get('subject') || '';
  const workspace = params.get('workspace') || '';
  if (!subjectId || !TEACHER_WORKSPACES.includes(workspace)) return null;
  return { subjectId, workspace };
}

function teacherWorkspaceHref(subjectId, workspace) {
  if (workspace === 'parcours') {
    return `/?preview=teacher&subject=${encodeURIComponent(subjectId)}`;
  }
  return `/?subject=${encodeURIComponent(subjectId)}&workspace=${encodeURIComponent(workspace)}`;
}

function renderTeacherWorkspaceNav(subjectId, active = 'parcours', navId = 'teacher-workspace-nav') {
  const nav = $(navId);
  const items = [
    ['seances', 'Séances'],
    ['parcours', 'Parcours'],
    ['corrections', 'Corrigés'],
    ['live', 'Suivi en direct'],
    ['reports', 'Rapports'],
  ];
  nav.innerHTML = [
    '<a class="teacher-home-link" href="/">Accueil</a>',
    ...items.map(([id, label]) => `<a href="${teacherWorkspaceHref(subjectId, id)}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`),
  ].join('');
  show(navId, true);
}

function focusedWorkspaceCopy(workspace) {
  if (workspace === 'seances') return ['Séances', 'Créer, préparer, partager ou reprendre une séance.', 'Séances de la matière'];
  if (workspace === 'corrections') return ['Corrigés', 'Choisir quand les solutions deviennent visibles pour chaque groupe.', 'Séances et corrigés'];
  if (workspace === 'live') return ['Suivi en direct', 'Préparer la liste puis suivre les élèves pendant la séance.', 'Séances à suivre'];
  if (workspace === 'reports') return ['Rapports', 'Retrouver les synthèses de groupe et le détail par élève.', 'Séances et rapports'];
  return ['Parcours', 'Inspecter le cours et sa séquence.', 'Mes séances récentes'];
}

function enterFocusedTeacherWorkspace(subjectId, workspace) {
  const [workspaceLabel, description, recentTitle] = focusedWorkspaceCopy(workspace);
  show('teacher-home-hero', false);
  show('teacher-selectors', false);
  show('teacher-focused-header', true);
  show('teacher-home-actions', false);
  $('teacher-focused-title').textContent = `${state.formation.label} · ${state.subject.label} · ${workspaceLabel}`;
  $('teacher-focused-description').textContent = description;
  renderTeacherWorkspaceNav(subjectId, workspace, 'teacher-main-nav');
  $('recent-sessions-eyebrow').textContent = workspace === 'seances' ? 'Organiser' : workspace === 'live' ? 'Piloter' : workspace === 'corrections' ? 'Contrôler' : 'Analyser';
  $('recent-sessions-title').textContent = recentTitle;
  document.body.dataset.teacherWorkspace = workspace;
  renderRecentSessions();
}

function leaveFocusedTeacherWorkspace() {
  show('teacher-home-hero', true);
  show('teacher-selectors', true);
  show('teacher-focused-header', false);
  show('teacher-home-actions', true);
  $('recent-sessions-eyebrow').textContent = 'Reprendre';
  $('recent-sessions-title').textContent = 'Mes séances récentes';
  delete document.body.dataset.teacherWorkspace;
}

async function applyRequestedTeacherWorkspace() {
  const requested = requestedTeacherWorkspace();
  if (!requested) {
    leaveFocusedTeacherWorkspace();
    return;
  }
  const formation = state.formations.find((item) =>
    item.subjects.some((subject) => subject.id === requested.subjectId)
  );
  if (!formation) return;
  selectFormation(formation.id);
  selectSubject(requested.subjectId);

  if (requested.workspace === 'parcours') {
    window.location.replace(teacherWorkspaceHref(requested.subjectId, 'parcours'));
    return;
  }

  enterFocusedTeacherWorkspace(requested.subjectId, requested.workspace);
  show('session-form', requested.workspace === 'seances');

  if (requested.workspace === 'reports') {
    await openReports();
    return;
  }
  revealOnNarrowScreen('teacher-focused-header');
}

function configureLearnerPath(session) {
  if (session.subject_id === 'psr-maths') {
    state.positioningItemId = 'psr-maths-rentree-v1';
    state.learnerStart = renderPsrMathsPathwayHome;
    return true;
  }
  if (session.subject_id === 'ada-francais') {
    if (session.pathway_id === 'practice-v1') {
      state.positioningItemId = 'practice-v1';
      state.learnerStart = renderLearningPracticeHome;
    } else {
      state.positioningItemId = 'positioning-v1';
      state.learnerStart = () => renderOralComprehensionActivity(0);
    }
    return true;
  }
  if (session.subject_id === 'ada-maths') {
    state.positioningItemId = 'numeracy-v1';
    state.learnerStart = renderNumeracyQuantityActivity;
    return true;
  }
  state.positioningItemId = '';
  state.learnerStart = null;
  return false;
}

function showTeacherPreview(subjectId) {
  const isPsrMaths = subjectId === 'psr-maths';
  const isAdaMaths = subjectId === 'ada-maths';
  const isAdaFrench = subjectId === 'ada-francais';
  state.previewMode = true;
  state.joinToken = null;
  $('student-view').classList.add('teacher-preview-mode');
  renderTeacherWorkspaceNav(subjectId, 'parcours');
  state.joinSession = {
    id: 'teacher-preview',
    formation_id: isPsrMaths ? 'psr' : 'ada',
    formation_label: isPsrMaths ? 'PSR' : 'ADA',
    subject_id: subjectId,
    subject_label: (isPsrMaths || isAdaMaths) ? 'Mathématiques' : 'Français',
    pathway_id: isPsrMaths ? 'rentree-v1' : isAdaMaths ? 'numeracy-v1' : 'positioning-v1',
    session_number: 1,
    title: isPsrMaths ? 'Diagnostic de rentrée' : 'Aperçu du positionnement',
    group_label: 'Aperçu professeur',
  };
  state.learner = {
    id: 'teacher-preview-learner',
    class_session_id: 'teacher-preview',
    first_name: 'Amina',
    last_name: '',
  };
  state.roster = [
    { id:'preview-amina', first_name:'Amina', last_initial:'D.' },
    { id:'preview-moussa', first_name:'Moussa', last_initial:'T.' },
    { id:'preview-sofia', first_name:'Sofia', last_initial:'' },
  ];
  configureLearnerPath(state.joinSession);

  show('student-view', true);
  show('login-view', false);
  show('teacher-view', false);
  show('logout', false);
  show('teacher-preview-banner', true);
  $('student-session-title').textContent = `${state.joinSession.formation_label} · ${state.joinSession.subject_label} — aperçu professeur`;
  $('student-session-context').textContent = 'Navigation libre · aucune donnée élève enregistrée';
  if (isPsrMaths) renderPsrMathsPathwayHome();
  else if (isAdaFrench) renderAdaTeacherPreviewHome();
  else state.learnerStart?.();
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const join = params.get('join');
  if (join) return showStudentJoin(join);
  const { user } = await api('/api/me');
  if (!user) return showLogin();
  state.user = user;
  const continuation = ssoContinuation();
  if (continuation) {
    window.location.assign(continuation);
    return;
  }
  const previewSubject = teacherPreviewSubject();
  if (previewSubject) return showTeacherPreview(previewSubject);
  await showTeacher();
  await applyRequestedTeacherWorkspace();
}

async function showStudentJoin(token) {
  state.previewMode = false;
  state.joinToken = token;
  $('student-view').classList.remove('teacher-preview-mode');
  show('teacher-workspace-nav', false);
  show('teacher-preview-banner', false);
  show('student-view', true); show('login-view', false); show('teacher-view', false); show('logout', false);
  try {
    const { session } = await api(`/api/join?token=${encodeURIComponent(token)}`);
    state.joinSession = session;
    $('student-session-title').textContent = `${session.formation_label} · ${session.subject_label}`;
    $('student-session-context').textContent = `Séance ${session.session_number}${session.title ? ` · ${session.title}` : ''} · ${session.group_label}`;
    if (configureLearnerPath(session)) {
      await startPreparedLearnerPath(session);
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

async function fetchJoinRoster() {
  const { learners } = await api(`/api/join/roster?token=${encodeURIComponent(state.joinToken)}`);
  state.roster = learners;
  return learners;
}

async function startPreparedLearnerPath(session) {
  await fetchJoinRoster();
  const saved = storedLearner(session.id);
  if (saved?.id) {
    try {
      const { learner } = await api('/api/join/learners', {
        method: 'POST',
        body: JSON.stringify({ token: state.joinToken, learner_id: saved.id }),
      });
      state.learner = learner;
      await trackEvent('activity_started', state.positioningItemId, { entry: 'resume' });
      return state.learnerStart?.();
    } catch {
      clearStoredLearner(session.id);
    }
  }
  if (state.roster.length) renderRosterSelection();
  else renderRosterMissing();
}

const SARTUS85_AUDIO_WORDS = new Set([
  'arbre', 'assiette', 'banane', 'bol', 'bus', 'bébé', 'casserole', 'chaise', 'chat',
  'chaussure', 'chemise', 'chien', 'clé', 'couteau', 'cuillère', 'douche', 'eau', 'enfant',
  'fleur', 'four', 'fourchette', 'frigo', 'lait', 'lampe', 'lit', 'livre', 'magasin', 'main',
  'maison', 'manteau', 'montre', 'moto', 'nez', 'pain', 'pantalon', 'parc', 'pharmacie',
  'pied', 'pomme', 'porte', 'poêle', 'riz', 'robinet', 'rue', 'sac', 'savon', 'serviette',
  'stylo', 'table', 'tasse', 'tomate', 'train', 'téléphone', 'verre', 'voiture', 'vélo',
  'école', 'œil', 'œuf'
]);
const HUMAN_AUDIO_OVERRIDES = {
  'brosse à dents': { file:'LL-Q150 (fra)-Pamputt-brosse à dents.wav', speaker:'Pamputt', license:'CC0' },
  'toilettes': { file:'LL-Q150 (fra)-Justforoc-toilettes.wav', speaker:'Justforoc', license:'CC BY-SA 4.0' },
};
let activeFrenchAudio = null;

function normalizedAudioWord(text) {
  return String(text || '').trim().toLocaleLowerCase('fr-FR').replace(/[.!?…]+$/u, '').trim();
}

function humanAudioForText(text) {
  const word = normalizedAudioWord(text);
  if (SARTUS85_AUDIO_WORDS.has(word)) {
    return {
      word,
      file:`LL-Q150 (fra)-Sartus85-${word}.wav`,
      speaker:'Sartus85',
      license:'CC BY-SA 4.0',
    };
  }
  const override = HUMAN_AUDIO_OVERRIDES[word];
  return override ? { word, ...override } : null;
}

function humanAudioAssetId(word) {
  return normalizedAudioWord(word)
    .replaceAll('œ', 'oe')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function localHumanAudioUrl(word) {
  return '/assets/audio/fr/' + humanAudioAssetId(word) + '.wav';
}

function stopFrenchAudio() {
  if (activeFrenchAudio) {
    activeFrenchAudio.pause();
    activeFrenchAudio.currentTime = 0;
    activeFrenchAudio = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

async function speakFrench(text, hooks = {}) {
  stopFrenchAudio();
  const human = humanAudioForText(text);
  if (human) {
    const audio = new Audio(localHumanAudioUrl(human.word));
    activeFrenchAudio = audio;
    audio.preload = 'auto';
    audio.addEventListener('playing', () => hooks.onStart?.({ mode:'human', ...human }), { once:true });
    audio.addEventListener('ended', () => {
      if (activeFrenchAudio === audio) activeFrenchAudio = null;
      hooks.onEnd?.({ mode:'human', ...human });
    }, { once:true });
    audio.addEventListener('error', () => hooks.onError?.(), { once:true });
    try {
      await audio.play();
      return true;
    } catch {
      if (activeFrenchAudio === audio) activeFrenchAudio = null;
    }
  }

  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    hooks.onError?.();
    return false;
  }
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    hooks.onError?.();
    return false;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = 0.86;
  utterance.pitch = 1;
  utterance.voice = voices.find((voice) => /^fr(?:-|$)/i.test(voice.lang || '')) || null;
  utterance.onstart = () => hooks.onStart?.({ mode:'browser' });
  utterance.onend = () => hooks.onEnd?.({ mode:'browser' });
  utterance.onerror = () => hooks.onError?.();
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
  const idleLabel = `🔊 ${label}`;
  button.textContent = idleLabel;
  button.addEventListener('click', async () => {
    button.textContent = '🔊 Lecture…';
    const available = await speakFrench(text, {
      onEnd: () => { button.textContent = idleLabel; },
      onError: () => {
        button.textContent = 'Audio indisponible';
        button.title = 'Aucune source audio utilisable sur cet appareil.';
      },
    });
    if (!available) {
      button.textContent = 'Audio indisponible';
      button.title = 'Aucune source audio utilisable sur cet appareil.';
    }
    trackEvent('audio_played', itemId, { text, available });
  });
  return button;
}

function renderRosterMissing() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <p class="eyebrow">Avant de commencer</p>
      <h3>La liste des prénoms n’est pas encore prête.</h3>
      <div id="roster-missing-audio"></div>
      <p class="learner-help">Demande au professeur de préparer la liste, puis actualise ici.</p>
      <button id="roster-refresh" class="btn primary">Actualiser la liste</button>
      <p id="roster-refresh-status" class="status"></p>
    </div>`;
  $('roster-missing-audio').appendChild(audioButton(
    'Écouter',
    'La liste des prénoms n’est pas encore prête. Demande au professeur, puis appuie sur Actualiser.'
  ));
  $('roster-refresh').addEventListener('click', refreshRosterSelection);
  speakFrench('La liste des prénoms n’est pas encore prête. Demande au professeur.');
}

async function refreshRosterSelection() {
  $('roster-refresh-status').textContent = 'Actualisation…';
  try {
    const learners = await fetchJoinRoster();
    if (learners.length) renderRosterSelection();
    else $('roster-refresh-status').textContent = 'La liste n’est pas encore prête.';
  } catch (error) {
    $('roster-refresh-status').textContent = error.message;
  }
}

function renderRosterSelection() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <p class="eyebrow">Avant de commencer</p>
      <h3>Choisis ton prénom.</h3>
      <div id="roster-instruction-audio"></div>
      <p class="learner-help">Tu peux écouter un prénom avec le bouton 🔊. Si deux personnes ont le même prénom, regarde l’initiale du nom.</p>
      <div id="roster-choice-grid" class="roster-choice-grid"></div>
      <p id="roster-choice-status" class="status" aria-live="assertive"></p>
    </div>`;
  $('roster-instruction-audio').appendChild(audioButton(
    'Écouter',
    'Choisis ton prénom. Tu peux appuyer sur le haut-parleur pour écouter chaque prénom.'
  ));
  const grid = $('roster-choice-grid');
  state.roster.forEach((learner) => {
    const card = document.createElement('article');
    card.className = 'learner-choice-card';

    const name = document.createElement('strong');
    name.className = 'learner-choice-name';
    name.textContent = rosterLabel(learner);

    const actions = document.createElement('div');
    actions.className = 'learner-choice-actions';

    const listen = audioButton('Écouter', learner.first_name);
    listen.classList.add('compact-audio');
    listen.addEventListener('click', (event) => event.stopPropagation());

    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'btn primary';
    choose.textContent = 'C’est moi';
    choose.addEventListener('click', () => chooseRosterLearner(learner.id));

    actions.append(listen, choose);
    card.append(name, actions);
    grid.appendChild(card);
  });
  speakFrench('Choisis ton prénom. Tu peux écouter les prénoms.');
}

async function chooseRosterLearner(learnerId) {
  $('roster-choice-status').textContent = '';
  $('roster-choice-grid').querySelectorAll('button').forEach((button) => { button.disabled = true; });
  try {
    const { learner } = await api('/api/join/learners', {
      method: 'POST',
      body: JSON.stringify({ token: state.joinToken, learner_id: learnerId }),
    });
    state.learner = learner;
    saveLearner(learner);
    await trackEvent('activity_started', state.positioningItemId, { entry: 'roster' });
    state.learnerStart?.();
  } catch (error) {
    $('roster-choice-status').textContent = error.message;
    $('roster-choice-grid').querySelectorAll('button').forEach((button) => { button.disabled = false; });
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
  const rosterNames = state.roster.map((learner) => learner.first_name);
  const choices = shuffledChoices(
    firstName,
    [...rosterNames, 'Mariam', 'Moussa', 'Amina', 'Sofiane', 'Fatou', 'Karim'],
  );
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <p class="eyebrow">2 · Mon prénom</p>
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
      <p class="eyebrow">3 · Première lettre</p>
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
        setTimeout(renderVisualDiscriminationActivity, 900);
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


function renderVisualDiscriminationActivity() {
  const target = 'BUS';
  const choices = ['BUS', 'BVS', '8US', 'SUB'].sort(() => Math.random() - 0.5);
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <p class="eyebrow">4 · Regarder</p>
      <h3>Trouve exactement le même.</h3>
      <div id="visual-discrimination-audio"></div>
      <div class="visual-model-card">
        <small>Modèle</small>
        <div class="visual-model-word">${target}</div>
      </div>
      <div id="visual-discrimination-choices" class="word-choice-grid"></div>
      <p id="visual-discrimination-feedback" class="feedback" aria-live="assertive"></p>
      <p class="learner-help">Ici, il n’est pas nécessaire de savoir lire : on regarde seulement si les formes sont identiques.</p>
    </div>`;
  const instruction = 'Regarde le modèle. Tu n’as pas besoin de lire. Touche exactement la même forme.';
  $('visual-discrimination-audio').appendChild(audioButton('Écouter', instruction, 'visual-discrimination'));
  const grid = $('visual-discrimination-choices');
  choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'word-choice-button';
    button.textContent = choice;
    button.addEventListener('click', async () => {
      const correct = choice === target;
      await trackEvent('answer', 'visual-discrimination', { correct, choice, target });
      grid.querySelectorAll('.word-choice-button').forEach((item) => item.classList.remove('bad'));
      if (correct) {
        button.classList.add('good');
        grid.querySelectorAll('.word-choice-button').forEach((item) => { item.disabled = true; });
        $('visual-discrimination-feedback').className = 'feedback good';
        $('visual-discrimination-feedback').textContent = 'Oui. C’est exactement le même.';
        speakFrench('Oui. C’est exactement le même.');
        await trackEvent('activity_completed', 'visual-discrimination', {});
        setTimeout(renderGuidedSoundLetterActivity, 850);
      } else {
        button.classList.add('bad');
        $('visual-discrimination-feedback').className = 'feedback bad';
        $('visual-discrimination-feedback').textContent = 'Regarde encore le modèle.';
        speakFrench('Regarde encore le modèle.');
      }
    });
    grid.appendChild(button);
  });
  speakFrench(instruction);
}

function renderGuidedSoundLetterActivity() {
  const target = 'M';
  const choices = ['M', 'N', 'A', 'S'].sort(() => Math.random() - 0.5);
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <p class="eyebrow">5 · Écouter un son</p>
      <h3>Écoute, puis touche la lettre.</h3>
      <div id="sound-letter-audio"></div>
      <div class="sound-letter-cue">
        <strong>maman</strong>
        <span>On te donne le son et la lettre à chercher. Ce n’est pas encore un exercice de lecture autonome.</span>
      </div>
      <div id="sound-letter-choices" class="choice-grid"></div>
      <p id="sound-letter-feedback" class="feedback" aria-live="assertive"></p>
    </div>`;
  const instruction = 'Écoute : maman. Maman commence par le son mmm. Touche la lettre M.';
  $('sound-letter-audio').appendChild(audioButton('Écouter', instruction, 'sound-letter-guided'));
  const grid = $('sound-letter-choices');
  choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = choice;
    button.addEventListener('click', async () => {
      const correct = choice === target;
      await trackEvent('answer', 'sound-letter-guided', { correct, choice, target, word:'maman' });
      grid.querySelectorAll('.choice-button').forEach((item) => item.classList.remove('bad'));
      if (correct) {
        button.classList.add('good');
        grid.querySelectorAll('.choice-button').forEach((item) => { item.disabled = true; });
        $('sound-letter-feedback').className = 'feedback good';
        $('sound-letter-feedback').textContent = 'Oui. M.';
        speakFrench('Oui. La lettre M.');
        await trackEvent('activity_completed', 'sound-letter-guided', { guided:true });
        setTimeout(renderUsefulWordActivity, 850);
      } else {
        button.classList.add('bad');
        $('sound-letter-feedback').className = 'feedback bad';
        $('sound-letter-feedback').textContent = 'Écoute encore.';
        speakFrench(instruction);
      }
    });
    grid.appendChild(button);
  });
  speakFrench(instruction);
}

function renderUsefulWordActivity() {
  const target = 'SORTIE';
  const choices = ['SORTIE', 'SERVICE', 'CUISINE', 'BUS'].sort(() => Math.random() - 0.5);
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <p class="eyebrow">6 · Un mot utile</p>
      <h3>Écoute. Retrouve le mot.</h3>
      <div id="useful-word-audio"></div>
      <div id="useful-word-choices" class="word-choice-grid"></div>
      <p id="useful-word-feedback" class="feedback" aria-live="assertive"></p>
      <p class="learner-help">Ce petit test porte seulement sur la reconnaissance de ce mot précis.</p>
    </div>`;
  const instruction = 'Touche le mot SORTIE. C’est le mot qu’on voit pour trouver la sortie.';
  $('useful-word-audio').appendChild(audioButton('Écouter', instruction, 'useful-word'));
  const grid = $('useful-word-choices');
  choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'word-choice-button';
    button.textContent = choice;
    button.addEventListener('click', async () => {
      const correct = choice === target;
      await trackEvent('answer', 'useful-word', { correct, choice, target });
      grid.querySelectorAll('.word-choice-button').forEach((item) => item.classList.remove('bad'));
      if (correct) {
        button.classList.add('good');
        grid.querySelectorAll('.word-choice-button').forEach((item) => { item.disabled = true; });
        $('useful-word-feedback').className = 'feedback good';
        $('useful-word-feedback').textContent = 'Oui. SORTIE.';
        speakFrench('Oui. SORTIE.');
        await trackEvent('activity_completed', 'useful-word', { word:target });
        setTimeout(renderWritingGestureActivity, 850);
      } else {
        button.classList.add('bad');
        $('useful-word-feedback').className = 'feedback bad';
        $('useful-word-feedback').textContent = 'Écoute encore le mot.';
        speakFrench(instruction);
      }
    });
    grid.appendChild(button);
  });
  speakFrench(instruction);
}

function renderWritingGestureActivity() {
  const firstName = state.learner?.first_name || 'Amina';
  const guide = Array.from(firstName.trim())[0]?.toLocaleUpperCase('fr-FR') || 'A';
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <p class="eyebrow">7 · Le geste d’écriture</p>
      <h3>Essaie de repasser sur la lettre.</h3>
      <div id="writing-audio"></div>
      <div class="writing-card">
        <div class="writing-canvas-wrap">
          <div class="writing-guide" aria-hidden="true">${esc(guide)}</div>
          <canvas id="writing-canvas" class="writing-canvas" aria-label="Zone pour tracer la lettre ${esc(guide)}"></canvas>
        </div>
        <div class="writing-actions">
          <button id="writing-clear" class="btn ghost" type="button">Effacer</button>
          <button id="writing-done" class="btn primary" type="button" disabled>J’ai essayé</button>
          <span id="writing-status" class="status"></span>
        </div>
        <p class="writing-hint">On enregistre seulement que le geste a été essayé. Le dessin n’est ni noté ni analysé.</p>
      </div>
    </div>`;
  const instruction = `Essaie de repasser sur la grande lettre ${guide}. Tu peux recommencer autant de fois que tu veux.`;
  $('writing-audio').appendChild(audioButton('Écouter', instruction, 'writing-gesture'));

  const canvas = $('writing-canvas');
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6550a4';

  let drawing = false;
  let lastPoint = null;
  let drawnDistance = 0;
  let strokes = 0;
  const pointFromEvent = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return { x:event.clientX - bounds.left, y:event.clientY - bounds.top };
  };
  const finishStroke = () => {
    if (!drawing) return;
    drawing = false;
    lastPoint = null;
  };

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    drawing = true;
    strokes += 1;
    lastPoint = pointFromEvent(event);
    canvas.setPointerCapture?.(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing || !lastPoint) return;
    event.preventDefault();
    const next = pointFromEvent(event);
    drawnDistance += Math.hypot(next.x - lastPoint.x, next.y - lastPoint.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastPoint = next;
    if (drawnDistance >= 30) $('writing-done').disabled = false;
  });
  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointercancel', finishStroke);
  canvas.addEventListener('pointerleave', finishStroke);

  $('writing-clear').addEventListener('click', () => {
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawnDistance = 0;
    strokes = 0;
    $('writing-done').disabled = true;
    $('writing-status').textContent = '';
  });
  $('writing-done').addEventListener('click', async () => {
    $('writing-done').disabled = true;
    $('writing-status').textContent = 'Merci.';
    await trackEvent('activity_completed', 'writing-gesture', {
      attempted:true,
      strokes,
      guide,
    });
    setTimeout(renderPositioningFinish, 700);
  });
  speakFrench(instruction);
}

const ORAL_COMPREHENSION_CHOICES = [
  { id: 'telephone', label: 'téléphone', icon: '📱' },
  { id: 'cle', label: 'clé', icon: '🔑' },
  { id: 'bus', label: 'bus', icon: '🚌' },
  { id: 'chaussure', label: 'chaussure', icon: '👟' },
];

const ORAL_COMPREHENSION_ROUNDS = [
  { target: 'telephone', instruction: 'Touche le téléphone.', spoken: 'téléphone' },
  { target: 'cle', instruction: 'Touche la clé.', spoken: 'clé' },
  { target: 'bus', instruction: 'Touche le bus.', spoken: 'bus' },
];

function shuffledVisualChoices() {
  return [...ORAL_COMPREHENSION_CHOICES].sort(() => Math.random() - 0.5);
}

function renderOralComprehensionActivity(roundIndex = 0) {
  const round = ORAL_COMPREHENSION_ROUNDS[roundIndex];
  if (!round) {
    trackEvent('activity_completed', 'oral-comprehension', { rounds: ORAL_COMPREHENSION_ROUNDS.length });
    return renderOwnNameActivity();
  }

  const choices = shuffledVisualChoices();
  $('student-session-message').innerHTML = `
    <div class="learner-stage oral-stage">
      <p class="eyebrow">1 · J'écoute</p>
      <h3>Écoute et touche la bonne image.</h3>
      <div id="oral-audio"></div>
      <div id="oral-choices" class="visual-choice-grid"></div>
      <p id="oral-feedback" class="feedback" aria-live="assertive"></p>
      <p class="learner-help">${roundIndex + 1} / ${ORAL_COMPREHENSION_ROUNDS.length}</p>
    </div>`;

  $('oral-audio').appendChild(audioButton('Réécouter', round.spoken, 'oral-comprehension'));
  const grid = $('oral-choices');
  choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'visual-choice-button';
    button.textContent = choice.icon;
    button.setAttribute('aria-label', choice.label);
    button.title = choice.label;
    button.addEventListener('click', async () => {
      const correct = choice.id === round.target;
      await trackEvent('answer', 'oral-comprehension', {
        correct,
        round: roundIndex + 1,
        target: round.target,
        choice: choice.id,
      });
      grid.querySelectorAll('.visual-choice-button').forEach((item) => item.classList.remove('bad'));
      if (correct) {
        button.classList.add('good');
        grid.querySelectorAll('.visual-choice-button').forEach((item) => { item.disabled = true; });
        $('oral-feedback').className = 'feedback good';
        $('oral-feedback').textContent = 'Oui.';
        speakFrench('Oui.');
        setTimeout(() => renderOralComprehensionActivity(roundIndex + 1), 700);
      } else {
        button.classList.add('bad');
        $('oral-feedback').className = 'feedback bad';
        $('oral-feedback').textContent = 'Essaie encore.';
        speakFrench(round.spoken);
      }
    });
    grid.appendChild(button);
  });
  speakFrench(round.spoken);
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


function renderNumeracyProbe({
  step,
  itemId,
  title,
  instruction,
  choices,
  target,
  help = '',
  next,
}) {
  $('student-session-message').innerHTML = `
    <div class="learner-stage numeracy-stage">
      <p class="eyebrow">${step}</p>
      <h3>${esc(title)}</h3>
      <div id="numeracy-audio"></div>
      <div id="numeracy-choices" class="numeracy-choice-grid"></div>
      <p id="numeracy-feedback" class="feedback" aria-live="assertive"></p>
      ${help ? `<p class="learner-help">${esc(help)}</p>` : ''}
    </div>`;
  $('numeracy-audio').appendChild(audioButton('Écouter', instruction, itemId));
  const grid = $('numeracy-choices');
  [...choices].sort(() => Math.random() - 0.5).forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'numeracy-choice-button';
    button.setAttribute('aria-label', choice.aria || choice.label);
    if (choice.html) button.innerHTML = choice.html;
    else button.textContent = choice.label;
    button.addEventListener('click', async () => {
      const correct = choice.id === target;
      await trackEvent('answer', itemId, { correct, choice:choice.id, target });
      grid.querySelectorAll('.numeracy-choice-button').forEach((item) => item.classList.remove('bad'));
      if (correct) {
        button.classList.add('good');
        grid.querySelectorAll('.numeracy-choice-button').forEach((item) => { item.disabled = true; });
        $('numeracy-feedback').className = 'feedback good';
        $('numeracy-feedback').textContent = 'Oui.';
        speakFrench('Oui.');
        await trackEvent('activity_completed', itemId, {});
        setTimeout(next, 750);
      } else {
        button.classList.add('bad');
        $('numeracy-feedback').className = 'feedback bad';
        $('numeracy-feedback').textContent = 'Essaie encore.';
        speakFrench('Essaie encore. ' + instruction);
      }
    });
    grid.appendChild(button);
  });
  speakFrench(instruction);
}

function renderNumeracyQuantityActivity() {
  renderNumeracyProbe({
    step:'1 · Les quantités',
    itemId:'quantity-counting',
    title:'Trouve trois assiettes.',
    instruction:'Touche le groupe avec trois assiettes.',
    choices:[
      { id:'2', label:'deux assiettes', aria:'deux assiettes', html:'<span class="numeracy-objects">🍽️ 🍽️</span>' },
      { id:'3', label:'trois assiettes', aria:'trois assiettes', html:'<span class="numeracy-objects">🍽️ 🍽️ 🍽️</span>' },
      { id:'4', label:'quatre assiettes', aria:'quatre assiettes', html:'<span class="numeracy-objects">🍽️ 🍽️ 🍽️ 🍽️</span>' },
    ],
    target:'3',
    help:'On regarde une quantité concrète, sans demander de lire un chiffre.',
    next:renderNumeracySpokenNumberActivity,
  });
}

function renderNumeracySpokenNumberActivity() {
  renderNumeracyProbe({
    step:'2 · Les chiffres',
    itemId:'spoken-number',
    title:'Écoute le nombre.',
    instruction:'Touche le nombre sept.',
    choices:[
      { id:'1', label:'1' },
      { id:'4', label:'4' },
      { id:'7', label:'7' },
      { id:'9', label:'9' },
    ],
    target:'7',
    help:'Ce test regarde seulement si le chiffre entendu est reconnu à l’écrit.',
    next:renderNumeracyCompareActivity,
  });
}

function renderNumeracyCompareActivity() {
  renderNumeracyProbe({
    step:'3 · Plus ou moins',
    itemId:'compare-quantities',
    title:'Où y en a-t-il le plus ?',
    instruction:'Regarde les deux groupes. Touche le groupe où il y a le plus de verres.',
    choices:[
      { id:'few', label:'deux verres', aria:'groupe avec deux verres', html:'<span class="numeracy-objects">🥛 🥛</span>' },
      { id:'many', label:'cinq verres', aria:'groupe avec cinq verres', html:'<span class="numeracy-objects">🥛 🥛 🥛<br>🥛 🥛</span>' },
    ],
    target:'many',
    help:'Il n’est pas nécessaire de connaître les mots « supérieur » ou « inférieur ».',
    next:renderNumeracyAdditionActivity,
  });
}

function renderNumeracyAdditionActivity() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage numeracy-stage">
      <p class="eyebrow">4 · Ajouter</p>
      <h3>Deux assiettes, puis encore une.</h3>
      <div id="numeracy-add-audio"></div>
      <div class="numeracy-operation" aria-label="deux assiettes plus une assiette">
        <span>🍽️ 🍽️</span><strong>+</strong><span>🍽️</span>
      </div>
      <p class="learner-prompt">Combien d’assiettes en tout&nbsp;?</p>
      <div id="numeracy-add-choices" class="numeracy-choice-grid"></div>
      <p id="numeracy-add-feedback" class="feedback" aria-live="assertive"></p>
      <p class="learner-help">C’est une situation concrète d’addition. Aucun calcul écrit n’est demandé.</p>
    </div>`;
  const instruction = 'Tu as deux assiettes. On ajoute une assiette. Combien d’assiettes en tout ?';
  $('numeracy-add-audio').appendChild(audioButton('Écouter', instruction, 'concrete-addition'));
  const grid = $('numeracy-add-choices');
  ['2','3','4'].sort(() => Math.random() - 0.5).forEach((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'numeracy-choice-button numeral';
    button.textContent = value;
    button.addEventListener('click', async () => {
      const correct = value === '3';
      await trackEvent('answer', 'concrete-addition', { correct, choice:value, target:'3' });
      grid.querySelectorAll('.numeracy-choice-button').forEach((item) => item.classList.remove('bad'));
      if (correct) {
        button.classList.add('good');
        grid.querySelectorAll('.numeracy-choice-button').forEach((item) => { item.disabled = true; });
        $('numeracy-add-feedback').className = 'feedback good';
        $('numeracy-add-feedback').textContent = 'Oui. Trois assiettes.';
        speakFrench('Oui. Trois assiettes.');
        await trackEvent('activity_completed', 'concrete-addition', {});
        setTimeout(renderNumeracyMoneyActivity, 750);
      } else {
        button.classList.add('bad');
        $('numeracy-add-feedback').className = 'feedback bad';
        $('numeracy-add-feedback').textContent = 'Compte encore les assiettes.';
        speakFrench('Compte encore les assiettes.');
      }
    });
    grid.appendChild(button);
  });
  speakFrench(instruction);
}

function renderNumeracyMoneyActivity() {
  renderNumeracyProbe({
    step:'5 · L’argent',
    itemId:'money-amount',
    title:'Écoute le prix.',
    instruction:'Touche cinq euros.',
    choices:[
      { id:'2', label:'2 €' },
      { id:'5', label:'5 €' },
      { id:'10', label:'10 €' },
      { id:'20', label:'20 €' },
    ],
    target:'5',
    help:'On vérifie seulement la reconnaissance de ce montant écrit.',
    next:renderNumeracyFinish,
  });
}

function renderNumeracyFinish() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      <div class="finish-card">
        <p class="eyebrow">Terminé pour maintenant</p>
        <h3>Bravo ${esc(state.learner.first_name)}.</h3>
        <p class="muted">Ton professeur voit les différentes étapes séparément et peut choisir la suite.</p>
        <div id="numeracy-finish-audio"></div>
      </div>
    </div>`;
  $('numeracy-finish-audio').appendChild(audioButton(
    'Écouter',
    `Bravo ${state.learner.first_name}. C’est terminé pour maintenant.`,
    'numeracy-v1'
  ));
  trackEvent('activity_completed', 'numeracy-v1', {});
  speakFrench(`Bravo ${state.learner.first_name}. C’est terminé pour maintenant.`);
}

const PSR_MATHS_MODULES = [
  { id:'durees', label:'Durées', description:'Lire une heure, calculer une durée et prévoir quand commencer.' },
  { id:'recettes', label:'Recettes', description:'Adapter une fiche technique quand le nombre de portions change.' },
  { id:'pourcentages', label:'Pourcentages', description:'Comprendre « sur 100 », calculer une part et une réduction.' },
  { id:'donnees', label:'Données', description:'Lire un tableau ou un graphique, comparer et calculer une moyenne.' },
  { id:'equations', label:'Équations', description:'Trouver un nombre inconnu et vérifier qu’il convient.' },
  { id:'graphiques', label:'Graphiques', description:'Voir comment une quantité change quand une autre change.' },
  { id:'commerce', label:'Prix & commerce', description:'Lire une facture, calculer une réduction et distinguer coût, prix et marge.' },
  { id:'probabilites', label:'Probabilités', description:'Comprendre le hasard, comparer fréquence et probabilité, puis simuler.' },
];
const PSR_MATHS_NATIVE_MODULE_IDS = ['durees','recettes','pourcentages','donnees','equations','fonctions'];

const PSR_MATHS_SEQUENCE = [
  { id:'overview', label:'Vue d’ensemble', phase:'Séquence' },
  { id:'intro', label:'Pourquoi ?', phase:'1' },
  { id:'diagnostic', label:'Diagnostic', phase:'2' },
  { id:'correction', label:'Correction', phase:'3' },
  { id:'challenge', label:'Défi PSR', phase:'4' },
  { id:'bilan', label:'Bilan', phase:'5' },
  ...PSR_MATHS_MODULES.map((module) => ({ id:module.id, label:module.label, phase:'Module' })),
];

function psrMathsMetaStorageKey() {
  const sessionId = state.joinSession?.id || '';
  const learnerId = state.learner?.id || '';
  return sessionId && learnerId ? `portail-psr-maths-meta:${sessionId}:${learnerId}` : '';
}

function readPsrMathsMeta() {
  if (state.previewMode) return { introDone:true, challengeDone:true };
  const key = psrMathsMetaStorageKey();
  if (!key) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePsrMathsMeta(patch) {
  if (state.previewMode) return;
  const key = psrMathsMetaStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ ...readPsrMathsMeta(), ...patch }));
  } catch {
    // Progress hints are optional; server activity remains the source for teacher follow-up.
  }
}

function psrMathsDiagnosticDone() {
  if (state.previewMode) return true;
  const answers = readPsrMathsAnswers();
  return PSR_MATHS_DIAGNOSTIC.every((question) => answers[question.id]);
}

function psrMathsChallengeDone() {
  return state.previewMode || Boolean(readPsrMathsMeta().challengeDone);
}

function psrMathsModuleDone(moduleId) {
  if (state.previewMode) return false;
  const completed = readPsrMathsMeta().completedModules;
  return Array.isArray(completed) && completed.includes(moduleId);
}

function markPsrMathsModuleDone(moduleId) {
  if (state.previewMode) return;
  const current = readPsrMathsMeta();
  const completed = new Set(Array.isArray(current.completedModules) ? current.completedModules : []);
  completed.add(moduleId);
  writePsrMathsMeta({ completedModules:[...completed] });
}

function psrMathsSequenceUnlocked(stepId) {
  if (state.previewMode) return true;
  if (['overview','intro','diagnostic'].includes(stepId)) return true;
  if (['correction','challenge'].includes(stepId)) return psrMathsDiagnosticDone();
  return psrMathsChallengeDone();
}

function psrMathsSequenceStatus(stepId) {
  if (state.previewMode) return 'aperçu libre';
  if (stepId === 'diagnostic') return psrMathsDiagnosticDone() ? 'terminé / refaire' : 'à faire';
  if (stepId === 'challenge') return psrMathsChallengeDone() ? 'terminé / refaire' : psrMathsDiagnosticDone() ? 'disponible' : 'après diagnostic';
  if (stepId === 'correction') return psrMathsDiagnosticDone() ? 'après diagnostic' : 'verrouillé';
  if (stepId === 'bilan') return psrMathsChallengeDone() ? 'disponible' : 'après défi';
  if (PSR_MATHS_MODULES.some((module) => module.id === stepId)) {
    if (psrMathsModuleDone(stepId)) return 'terminé';
    if (!psrMathsChallengeDone()) return 'après défi';
    return PSR_MATHS_NATIVE_MODULE_IDS.includes(stepId) ? 'disponible' : 'migration en cours';
  }
  return '';
}

function renderPsrMathsSequenceNav(activeId) {
  return `
    <nav class="psr-sequence-nav" aria-label="Séquence PSR Mathématiques">
      ${PSR_MATHS_SEQUENCE.map((step) => {
        const unlocked = psrMathsSequenceUnlocked(step.id);
        return `
          <button class="psr-sequence-link${step.id === activeId ? ' current' : ''}" type="button"
            data-psr-step="${esc(step.id)}" ${unlocked ? '' : 'disabled'}>
            <span class="psr-sequence-index">${esc(step.phase)}</span>
            <span><strong>${esc(step.label)}</strong><small>${esc(psrMathsSequenceStatus(step.id))}</small></span>
          </button>`;
      }).join('')}
    </nav>`;
}

function openPsrMathsSequenceStep(stepId) {
  if (!psrMathsSequenceUnlocked(stepId)) return;
  if (stepId === 'overview') return renderPsrMathsPathwayHome();
  if (stepId === 'intro') return renderPsrMathsIntro();
  if (stepId === 'diagnostic') return renderPsrMathsDiagnostic(0);
  if (stepId === 'correction') {
    if (state.previewMode) return renderPsrMathsCorrection({ unlocked:true });
    return refreshPsrMathsCorrectionAccess().then((unlocked) => renderPsrMathsCorrection({ unlocked }));
  }
  if (stepId === 'challenge') return renderPsrMathsChallenge();
  if (stepId === 'bilan') return renderPsrMathsBilan();
  if (stepId === 'durees') return renderPsrMathsDurationModule();
  if (stepId === 'recettes') return renderPsrMathsRecipesModule();
  if (stepId === 'pourcentages') return renderPsrMathsPercentModule();
  if (stepId === 'donnees') return renderPsrMathsDataModule();
  if (stepId === 'equations') return renderPsrMathsEquationModule();
  if (stepId === 'fonctions') return renderPsrMathsFunctionModule();
  return renderPsrMathsModulePreview(stepId);
}

function bindPsrMathsSequenceNav() {
  document.querySelectorAll('[data-psr-step]').forEach((button) => {
    button.addEventListener('click', () => openPsrMathsSequenceStep(button.dataset.psrStep));
  });
}

function renderPsrMathsPathwayHome() {
  const diagnosticDone = psrMathsDiagnosticDone();
  const challengeDone = psrMathsChallengeDone();
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('overview')}
      <div class="psr-pathway-head">
        <p class="eyebrow">PSR · Mathématiques</p>
        <h3>Le parcours en un coup d’œil.</h3>
        <p class="learner-help">${state.previewMode
          ? 'Vue professeur : tu peux ouvrir librement les étapes déjà migrées et visualiser la suite du programme.'
          : 'Tu avances étape par étape. Le diagnostic sert à savoir où commencer ; il ne donne pas de note.'}</p>
      </div>
      <div class="psr-pathway-grid">
        <article class="psr-path-step">
          <div class="step-num">1</div>
          <div><h4>Pourquoi des maths en PSR ?</h4><p>Peser, servir, lire une heure, vérifier un prix et comprendre des données.</p></div>
          <button class="btn secondary" type="button" data-open-psr="intro">Ouvrir</button>
        </article>
        <article class="psr-path-step">
          <div class="step-num">2</div>
          <div><h4>Diagnostic de rentrée</h4><p>10 situations courtes, avec « Je ne sais pas ». Aucun score affiché à l’élève.</p></div>
          <button class="btn primary" type="button" data-open-psr="diagnostic">${diagnosticDone ? 'Revoir / refaire' : 'Commencer'}</button>
        </article>
        <article class="psr-path-step">
          <div class="step-num">3</div>
          <div><h4>Correction guidée</h4><p>Comprendre la stratégie. Les solutions restent pilotées par le professeur.</p></div>
          <button class="btn secondary" type="button" data-open-psr="correction" ${psrMathsSequenceUnlocked('correction') ? '' : 'disabled'}>Voir</button>
        </article>
        <article class="psr-path-step">
          <div class="step-num">4</div>
          <div><h4>Défi PSR · préparer le service</h4><p>Adapter une recette, calculer une heure de départ et un chiffre d’affaires.</p></div>
          <button class="btn primary" type="button" data-open-psr="challenge" ${psrMathsSequenceUnlocked('challenge') ? '' : 'disabled'}>${challengeDone ? 'Refaire' : 'Relever le défi'}</button>
        </article>
        <article class="psr-path-step">
          <div class="step-num">5</div>
          <div><h4>Bilan et suite</h4><p>Repérer les domaines déjà solides et ceux à retravailler, sans classement.</p></div>
          <button class="btn secondary" type="button" data-open-psr="bilan" ${psrMathsSequenceUnlocked('bilan') ? '' : 'disabled'}>Voir</button>
        </article>
      </div>
      <div>
        <p class="eyebrow" style="margin-top:8px">Suite du CAP</p>
        <div class="psr-module-grid">
          ${PSR_MATHS_MODULES.map((module) => `
            <article class="psr-module-card">
              <span class="pill">${psrMathsModuleDone(module.id) ? 'terminé' : psrMathsChallengeDone() ? (PSR_MATHS_NATIVE_MODULE_IDS.includes(module.id) ? 'disponible' : 'migration en cours') : 'après le défi'}</span>
              <h4>${esc(module.label)}</h4>
              <p>${esc(module.description)}</p>
              <button class="btn ghost" type="button" data-open-psr="${esc(module.id)}" ${psrMathsSequenceUnlocked(module.id) ? '' : 'disabled'}>${PSR_MATHS_NATIVE_MODULE_IDS.includes(module.id) ? 'Ouvrir le module' : 'Voir le module'}</button>
            </article>`).join('')}
        </div>
      </div>
    </div>`;
  bindPsrMathsSequenceNav();
  document.querySelectorAll('[data-open-psr]').forEach((button) => {
    button.addEventListener('click', () => openPsrMathsSequenceStep(button.dataset.openPsr));
  });
}

function renderPsrMathsIntro() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('intro')}
      <div>
        <p class="eyebrow">Étape 1 · À quoi ça sert ?</p>
        <h3>En PSR, les maths sont partout.</h3>
        <p class="learner-help">On part de situations concrètes. Les mots plus techniques viennent ensuite.</p>
      </div>
      <div class="psr-intro-grid">
        <article class="psr-intro-tile"><span class="psr-intro-icon">⚖</span><strong>Préparer</strong><p>Peser, compter les portions, changer les quantités et prévoir une durée.</p></article>
        <article class="psr-intro-tile"><span class="psr-intro-icon">🕒</span><strong>Servir</strong><p>Lire l’heure, vérifier un prix et rendre la monnaie.</p></article>
        <article class="psr-intro-tile"><span class="psr-intro-icon">▥</span><strong>Lire des informations</strong><p>Comprendre un tableau ou un graphique et comparer des résultats.</p></article>
        <article class="psr-intro-tile"><span class="psr-intro-icon">?</span><strong>Trouver une solution</strong><p>Comprendre ce qu’on cherche, choisir un calcul et vérifier si le résultat est possible.</p></article>
      </div>
      <div class="callout"><strong>Objectif :</strong> comprendre une situation, choisir le bon outil et vérifier sa réponse.</div>
      <div class="practice-actions">
        <button id="psr-intro-continue" class="btn primary" type="button">Voir le parcours</button>
      </div>
    </div>`;
  bindPsrMathsSequenceNav();
  $('psr-intro-continue').addEventListener('click', () => {
    writePsrMathsMeta({ introDone:true });
    renderPsrMathsPathwayHome();
  });
}

function formatPsrNumber(value) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits:2 }).format(value);
}

function formatPsrMoney(value) {
  return new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR' }).format(value);
}

function renderPsrMathsChallenge() {
  const teacherPreview = state.previewMode;
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('challenge')}
      <div>
        <p class="eyebrow">Étape 4 · Défi PSR</p>
        <h3>Préparer le service.</h3>
        <p class="learner-help">La fiche technique est prévue pour 10 portions de salade de fruits. Adapte la production, puis réponds aux trois questions.</p>
      </div>
      <div class="psr-challenge-board">
        <section class="psr-recipe-card">
          <strong>Fiche technique · 10 portions</strong>
          <table class="psr-recipe-table">
            <thead><tr><th>Ingrédient</th><th>Quantité</th></tr></thead>
            <tbody><tr><td>Pommes</td><td>800 g</td></tr><tr><td>Oranges</td><td>600 g</td></tr><tr><td>Bananes</td><td>400 g</td></tr><tr><td>Jus</td><td>250 mL</td></tr></tbody>
          </table>
          <p class="learner-help">Coût matière pour 10 portions : 8,50 €.</p>
        </section>
        <section class="psr-challenge-controls">
          <label for="psr-portions"><strong>Nombre de portions à produire</strong></label>
          <div class="psr-big-number"><span id="psr-portion-count">30</span><small>portions</small></div>
          <input id="psr-portions" type="range" min="5" max="40" step="1" value="30" />
          <div class="psr-mini-stats">
            <div class="psr-mini-stat">Pommes<strong id="psr-apples"></strong></div>
            <div class="psr-mini-stat">Oranges<strong id="psr-oranges"></strong></div>
            <div class="psr-mini-stat">Bananes<strong id="psr-bananas"></strong></div>
            <div class="psr-mini-stat">Jus<strong id="psr-juice"></strong></div>
            <div class="psr-mini-stat">Coût estimé<strong id="psr-cost"></strong></div>
            <div class="psr-mini-stat">Coefficient<strong id="psr-factor"></strong></div>
          </div>
        </section>
      </div>
      <div class="psr-challenge-questions">
        <div class="psr-challenge-question">
          <label for="psr-factor-choice">1 · Comment trouver le coefficient pour adapter toutes les quantités ?</label>
          <select id="psr-factor-choice" class="input">
            <option value="">Choisir…</option>
            <option value="wrong-inverse">Faire 10 ÷ nombre de portions</option>
            <option value="coefficient">Faire nombre de portions ÷ 10, puis multiplier chaque quantité</option>
            <option value="wrong-add">Ajouter 10 au nombre de portions</option>
          </select>
        </div>
        <div class="psr-challenge-question">
          <label for="psr-start-time">2 · Service à 11 h 45. Préparation et mise en place : 35 minutes. Au plus tard, à quelle heure commencer ?</label>
          <input id="psr-start-time" class="input" type="text" placeholder="ex. 11 h 10" />
        </div>
        <div class="psr-challenge-question">
          <label for="psr-revenue">3 · Chaque portion est vendue 2,50 €. Quel chiffre d’affaires si tout est vendu ?</label>
          <div class="session-link-row"><input id="psr-revenue" class="input" inputmode="decimal" type="text" placeholder="Ta réponse" /><strong>€</strong></div>
        </div>
      </div>
      <div id="psr-challenge-feedback" class="callout hidden" aria-live="polite"></div>
      <div class="practice-actions">
        <button id="psr-check-challenge" class="btn primary" type="button">Vérifier le défi</button>
        ${teacherPreview ? '<button id="psr-show-challenge-answers" class="btn secondary" type="button">Afficher les réponses</button>' : ''}
        <button id="psr-challenge-overview" class="btn ghost" type="button">Retour au parcours</button>
      </div>
    </div>`;
  bindPsrMathsSequenceNav();

  const range = $('psr-portions');
  const update = () => {
    const portions = Number(range.value);
    const factor = portions / 10;
    $('psr-portion-count').textContent = String(portions);
    $('psr-apples').textContent = `${formatPsrNumber(800 * factor)} g`;
    $('psr-oranges').textContent = `${formatPsrNumber(600 * factor)} g`;
    $('psr-bananas').textContent = `${formatPsrNumber(400 * factor)} g`;
    $('psr-juice').textContent = `${formatPsrNumber(250 * factor)} mL`;
    $('psr-cost').textContent = formatPsrMoney(8.5 * factor);
    $('psr-factor').textContent = `× ${formatPsrNumber(factor)}`;
  };
  range.addEventListener('input', update);
  update();

  const check = async () => {
    const portions = Number(range.value);
    const factorOk = $('psr-factor-choice').value === 'coefficient';
    const timeOk = ['11h10','11 h 10','11:10','11.10'].some((value) => normalisePsrMathsText(value) === normalisePsrMathsText($('psr-start-time').value));
    const expectedRevenue = portions * 2.5;
    const revenueOk = Math.abs(parsePsrMathsNumber($('psr-revenue').value) - expectedRevenue) < 0.001;
    const checks = [
      ['psr-challenge-factor', factorOk, 'Proportionnalité'],
      ['psr-challenge-time', timeOk, 'Durées'],
      ['psr-challenge-revenue', revenueOk, 'Prix & calcul'],
    ];
    if (!teacherPreview) {
      for (const [itemId, correct, domain] of checks) {
        await trackEvent('answer', itemId, { correct, domain, portions });
        if (correct) await trackEvent('activity_completed', itemId, { domain });
      }
    }
    const count = checks.filter(([, correct]) => correct).length;
    const feedback = $('psr-challenge-feedback');
    show('psr-challenge-feedback', true);
    feedback.innerHTML = `<strong>${count}/3 réponses justes.</strong>
      <div class="feedback-lines">
        <span>${factorOk ? '✓' : '↻'} Coefficient : ${portions} ÷ 10 = <b>${formatPsrNumber(portions / 10)}</b>.</span>
        <span>${timeOk ? '✓' : '↻'} Horaire : 11 h 45 − 35 min = <b>11 h 10</b>.</span>
        <span>${revenueOk ? '✓' : '↻'} Chiffre d’affaires : ${portions} × 2,50 € = <b>${formatPsrMoney(expectedRevenue)}</b>.</span>
      </div>`;
    if (count === 3) {
      writePsrMathsMeta({ challengeDone:true });
      if (!teacherPreview) await trackEvent('activity_completed', 'psr-maths-challenge-v1', { portions });
      feedback.innerHTML += '<div class="practice-actions"><button id="psr-to-bilan" class="btn primary" type="button">Voir le bilan</button></div>';
      $('psr-to-bilan').addEventListener('click', renderPsrMathsBilan);
    }
  };
  $('psr-check-challenge').addEventListener('click', check);
  $('psr-show-challenge-answers')?.addEventListener('click', async () => {
    $('psr-factor-choice').value = 'coefficient';
    $('psr-start-time').value = '11 h 10';
    $('psr-revenue').value = formatPsrNumber(Number(range.value) * 2.5);
    await check();
  });
  $('psr-challenge-overview').addEventListener('click', renderPsrMathsPathwayHome);
}

function renderPsrMathsBilan() {
  const answers = readPsrMathsAnswers();
  const knownAnswers = PSR_MATHS_DIAGNOSTIC
    .map((question) => ({ question, answer:answers[question.id] }))
    .filter((item) => item.answer);
  const strong = [...new Set(knownAnswers.filter((item) => item.answer.correct).map((item) => item.question.domain))];
  const needsWork = [...new Set(knownAnswers.filter((item) => !item.answer.correct).map((item) => item.question.domain))];
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('bilan')}
      <div>
        <p class="eyebrow">Étape 5 · Bilan</p>
        <h3>Un point de départ, pas une note.</h3>
        <p class="learner-help">On garde les domaines séparés pour choisir la suite du travail, sans classement global.</p>
      </div>
      <div class="psr-bilan-grid">
        <article class="psr-bilan-card">
          <strong>Déjà bien repéré</strong>
          <div class="psr-domain-chips">${state.previewMode ? '<span class="pill">Selon les réponses de l’élève</span>' : strong.length ? strong.map((label) => `<span class="pill">${esc(label)}</span>`).join('') : '<span class="muted">À observer après le diagnostic.</span>'}</div>
        </article>
        <article class="psr-bilan-card">
          <strong>À retravailler en priorité</strong>
          <div class="psr-domain-chips">${state.previewMode ? '<span class="pill">Selon les erreurs / « Je ne sais pas »</span>' : needsWork.length ? needsWork.map((label) => `<span class="pill">${esc(label)}</span>`).join('') : '<span class="muted">Aucune priorité repérée dans les réponses disponibles.</span>'}</div>
        </article>
      </div>
      <div class="callout"><strong>Défi PSR :</strong> ${state.previewMode ? 'aperçu disponible' : psrMathsChallengeDone() ? 'terminé' : 'à terminer'}.</div>
      <p class="learner-help">La suite travaille les durées, la proportionnalité, les pourcentages, les données, les équations, les graphiques, les prix et les probabilités.</p>
      <div class="practice-actions"><button id="psr-bilan-overview" class="btn primary" type="button">Retour au parcours</button></div>
    </div>`;
  bindPsrMathsSequenceNav();
  $('psr-bilan-overview').addEventListener('click', renderPsrMathsPathwayHome);
}

function parsePsrClock(value) {
  const match = /^(\d{1,2})\s*(?:h|:|\.)\s*(\d{1,2})$/i.exec(String(value || '').trim());
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}

function formatPsrClock(totalMinutes) {
  const minutes = ((Number(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${String(rest).padStart(2, '0')}`;
}

async function recordPsrModuleChecks(moduleId, checks) {
  if (state.previewMode) return;
  for (const check of checks) {
    await trackEvent('answer', check.id, { correct:check.correct, domain:check.domain, module:moduleId });
    if (check.correct) {
      await trackEvent('activity_completed', check.id, { domain:check.domain, module:moduleId });
    }
  }
  if (checks.every((check) => check.correct)) {
    markPsrMathsModuleDone(moduleId);
    await trackEvent('activity_completed', `psr-module-${moduleId}-v1`, { module:moduleId });
  }
}

function renderPsrMathsDurationModule() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('durees')}
      <div>
        <p class="eyebrow">Module · Durées</p>
        <h3>Heures et minutes, sans piège.</h3>
        <p class="learner-help">En restauration, le temps sert à organiser le travail : commencer une préparation, respecter une cuisson et être prêt avant le service.</p>
      </div>
      <div class="psr-module-context-grid">
        <article class="psr-module-context"><span>🍲</span><strong>Cuisson</strong><p>Une soupe commence à 9 h 35 et cuit 50 min. Quand est-elle prête ?</p></article>
        <article class="psr-module-context"><span>🧑‍🍳</span><strong>Mise en place</strong><p>Le service est à 11 h 45. Il faut 35 min avant. Quand commencer ?</p></article>
        <article class="psr-module-context"><span>🧽</span><strong>Organisation</strong><p>Une tâche va de 10 h 15 à 12 h 00. Combien de temps dure-t-elle ?</p></article>
      </div>
      <div class="callout"><strong>À retenir :</strong> 1 heure = 60 minutes. Une heure n’a pas 100 minutes.</div>

      <section class="psr-learning-lab">
        <div><span class="pill">Manipule</span><h4>Fais bouger le temps</h4><p class="muted">Change le départ et la durée : l’heure de fin se recalcule immédiatement.</p></div>
        <div class="psr-time-controls">
          <label><span>Départ</span><strong id="psr-time-start-label">9 h 35</strong><input id="psr-time-start" type="range" min="480" max="780" step="5" value="575"></label>
          <label><span>Durée</span><strong><span id="psr-time-duration-label">50</span> min</strong><input id="psr-time-duration" type="range" min="10" max="120" step="5" value="50"></label>
        </div>
        <div class="psr-time-equation"><span id="psr-time-start-value"></span><b>+</b><span id="psr-time-duration-value"></span><b>=</b><strong id="psr-time-end-value"></strong></div>
      </section>

      <section class="psr-method-card">
        <p class="eyebrow">Une méthode simple</p>
        <div class="psr-method-steps">
          <div><span>1</span><p>Va jusqu’à l’heure ronde.</p></div>
          <div><span>2</span><p>Regarde combien de minutes tu as utilisées.</p></div>
          <div><span>3</span><p>Ajoute les minutes qui restent.</p></div>
        </div>
        <div class="callout"><strong>9 h 35 + 50 min</strong> → +25 min = 10 h 00 → il reste 25 min → <strong>10 h 25</strong>.</div>
      </section>

      <section class="psr-module-practice">
        <p class="eyebrow">À toi · 4 situations</p>
        <div class="psr-challenge-questions">
          <div class="psr-challenge-question"><label for="psr-duration-q1">1 · 9 h 35 + 50 min : heure de fin ?</label><input id="psr-duration-q1" class="input" type="text" placeholder="ex. 10 h 25"></div>
          <div class="psr-challenge-question"><label for="psr-duration-q2">2 · Service à 11 h 45, mise en place 35 min : heure de départ ?</label><input id="psr-duration-q2" class="input" type="text" placeholder="ex. 11 h 10"></div>
          <div class="psr-challenge-question"><label for="psr-duration-q3">3 · De 10 h 15 à 12 h 00 : combien de minutes ?</label><div class="session-link-row"><input id="psr-duration-q3" class="input" inputmode="numeric" type="text"><strong>min</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-duration-q4">4 · 1 h 30 correspond à combien de minutes ?</label><select id="psr-duration-q4" class="input"><option value="">Choisir…</option><option value="30">30 min</option><option value="60">60 min</option><option value="90">90 min</option><option value="130">130 min</option></select></div>
        </div>
        <div id="psr-duration-feedback" class="callout hidden" aria-live="polite"></div>
        <div class="practice-actions">
          <button id="psr-check-duration" class="btn primary" type="button">Vérifier</button>
          ${state.previewMode ? '<button id="psr-duration-answers" class="btn secondary" type="button">Voir les réponses</button>' : ''}
          <button class="btn secondary" type="button" data-open-psr="recettes">Module suivant · Recettes</button>
          <button class="btn ghost" type="button" data-open-psr="overview">Retour au parcours</button>
        </div>
      </section>
    </div>`;

  bindPsrMathsSequenceNav();
  document.querySelectorAll('[data-open-psr]').forEach((button) => button.addEventListener('click', () => openPsrMathsSequenceStep(button.dataset.openPsr)));

  const startRange = $('psr-time-start');
  const durationRange = $('psr-time-duration');
  const updateLab = () => {
    const start = Number(startRange.value);
    const duration = Number(durationRange.value);
    $('psr-time-start-label').textContent = formatPsrClock(start);
    $('psr-time-duration-label').textContent = String(duration);
    $('psr-time-start-value').textContent = formatPsrClock(start);
    $('psr-time-duration-value').textContent = `${duration} min`;
    $('psr-time-end-value').textContent = formatPsrClock(start + duration);
  };
  startRange.addEventListener('input', updateLab);
  durationRange.addEventListener('input', updateLab);
  updateLab();

  const check = async () => {
    const checks = [
      { id:'psr-duration-q1', domain:'Ajouter une durée', correct:parsePsrClock($('psr-duration-q1').value) === 625 },
      { id:'psr-duration-q2', domain:'Revenir en arrière', correct:parsePsrClock($('psr-duration-q2').value) === 670 },
      { id:'psr-duration-q3', domain:'Calculer une durée', correct:Math.abs(parsePsrMathsNumber($('psr-duration-q3').value) - 105) < 0.001 },
      { id:'psr-duration-q4', domain:'Convertir', correct:$('psr-duration-q4').value === '90' },
    ];
    const count = checks.filter((item) => item.correct).length;
    await recordPsrModuleChecks('durees', checks);
    show('psr-duration-feedback', true);
    $('psr-duration-feedback').innerHTML = `<strong>${count}/4 situations réussies.</strong><div class="feedback-lines">
      <span>${checks[0].correct ? '✓' : '↻'} 9 h 35 + 50 min = <b>10 h 25</b></span>
      <span>${checks[1].correct ? '✓' : '↻'} 11 h 45 − 35 min = <b>11 h 10</b></span>
      <span>${checks[2].correct ? '✓' : '↻'} 10 h 15 → 12 h 00 = <b>105 min</b></span>
      <span>${checks[3].correct ? '✓' : '↻'} 1 h 30 = <b>90 min</b></span>
    </div>`;
  };
  $('psr-check-duration').addEventListener('click', check);
  $('psr-duration-answers')?.addEventListener('click', async () => {
    $('psr-duration-q1').value = '10 h 25';
    $('psr-duration-q2').value = '11 h 10';
    $('psr-duration-q3').value = '105';
    $('psr-duration-q4').value = '90';
    await check();
  });
}

function renderPsrMathsRecipesModule() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('recettes')}
      <div>
        <p class="eyebrow">Module · Recettes & proportionnalité</p>
        <h3>Changer les portions, garder la recette.</h3>
        <p class="learner-help">Si le nombre de clients change, les quantités changent de la même façon. C’est l’idée de proportionnalité.</p>
      </div>
      <div class="psr-module-context-grid">
        <article class="psr-module-context"><span>🍚</span><strong>Recette</strong><p>5 portions utilisent 400 g de riz. Pour 15 portions, il faut trois fois plus.</p></article>
        <article class="psr-module-context"><span>🥤</span><strong>Boisson</strong><p>2 L suffisent pour 8 personnes. Pour 20 personnes, on conserve la même proportion.</p></article>
        <article class="psr-module-context"><span>📦</span><strong>Barquettes</strong><p>6 barquettes → 18 barquettes : toutes les quantités sont multipliées par 3.</p></article>
      </div>
      <div class="callout"><strong>À retenir :</strong> nouveau nombre ÷ nombre de départ = coefficient. On multiplie ensuite chaque quantité par ce même nombre.</div>

      <section class="psr-learning-lab">
        <div><span class="pill">Manipule</span><h4>Fais varier les portions</h4><p class="muted">Base : 10 portions · 800 g de riz · 500 g de légumes · 250 mL de sauce.</p></div>
        <div class="psr-recipe-lab">
          <div>
            <div class="psr-big-number"><span id="psr-recipe-portions-label">24</span><small>portions</small></div>
            <input id="psr-recipe-portions" type="range" min="5" max="35" step="1" value="24">
          </div>
          <div class="psr-mini-stats">
            <div class="psr-mini-stat">Coefficient<strong id="psr-recipe-factor"></strong></div>
            <div class="psr-mini-stat">Riz<strong id="psr-recipe-rice"></strong></div>
            <div class="psr-mini-stat">Légumes<strong id="psr-recipe-veg"></strong></div>
            <div class="psr-mini-stat">Sauce<strong id="psr-recipe-sauce"></strong></div>
          </div>
        </div>
      </section>

      <section class="psr-method-card">
        <p class="eyebrow">Une méthode simple</p>
        <div class="psr-method-steps">
          <div><span>1</span><p>Compare le nouveau nombre de portions au nombre de départ.</p></div>
          <div><span>2</span><p>Trouve par combien on multiplie.</p></div>
          <div><span>3</span><p>Multiplie chaque quantité par ce même coefficient.</p></div>
        </div>
        <div class="callout"><strong>5 → 15 portions</strong> : 15 ÷ 5 = 3, puis 400 g × 3 = <strong>1 200 g</strong>.</div>
      </section>

      <section class="psr-module-practice">
        <p class="eyebrow">À toi · 4 situations</p>
        <div class="psr-challenge-questions">
          <div class="psr-challenge-question"><label for="psr-recipe-q1">1 · 400 g de riz pour 5 portions. Combien pour 15 portions ?</label><div class="session-link-row"><input id="psr-recipe-q1" class="input" inputmode="decimal" type="text"><strong>g</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-recipe-q2">2 · 2 L de soupe pour 8 personnes. Combien pour 20 personnes ?</label><div class="session-link-row"><input id="psr-recipe-q2" class="input" inputmode="decimal" type="text"><strong>L</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-recipe-q3">3 · 750 g de fruits pour 6 portions. Combien pour 18 portions ?</label><div class="session-link-row"><input id="psr-recipe-q3" class="input" inputmode="decimal" type="text"><strong>g</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-recipe-q4">4 · On passe de 10 à 32 portions. Quel coefficient ?</label><select id="psr-recipe-q4" class="input"><option value="">Choisir…</option><option value="1.5">× 1,5</option><option value="2.5">× 2,5</option><option value="3.2">× 3,2</option><option value="32">× 32</option></select></div>
        </div>
        <div id="psr-recipe-feedback" class="callout hidden" aria-live="polite"></div>
        <div class="practice-actions">
          <button id="psr-check-recipe" class="btn primary" type="button">Vérifier</button>
          ${state.previewMode ? '<button id="psr-recipe-answers" class="btn secondary" type="button">Voir les réponses</button>' : ''}
          <button class="btn secondary" type="button" data-open-psr="pourcentages">Module suivant · Pourcentages</button>
          <button class="btn ghost" type="button" data-open-psr="overview">Retour au parcours</button>
        </div>
      </section>
    </div>`;

  bindPsrMathsSequenceNav();
  document.querySelectorAll('[data-open-psr]').forEach((button) => button.addEventListener('click', () => openPsrMathsSequenceStep(button.dataset.openPsr)));

  const range = $('psr-recipe-portions');
  const updateLab = () => {
    const portions = Number(range.value);
    const factor = portions / 10;
    $('psr-recipe-portions-label').textContent = String(portions);
    $('psr-recipe-factor').textContent = `× ${formatPsrNumber(factor)}`;
    $('psr-recipe-rice').textContent = `${formatPsrNumber(800 * factor)} g`;
    $('psr-recipe-veg').textContent = `${formatPsrNumber(500 * factor)} g`;
    $('psr-recipe-sauce').textContent = `${formatPsrNumber(250 * factor)} mL`;
  };
  range.addEventListener('input', updateLab);
  updateLab();

  const check = async () => {
    const checks = [
      { id:'psr-recipe-q1', domain:'Proportionnalité', correct:Math.abs(parsePsrMathsNumber($('psr-recipe-q1').value) - 1200) < 0.001 },
      { id:'psr-recipe-q2', domain:'Proportionnalité', correct:Math.abs(parsePsrMathsNumber($('psr-recipe-q2').value) - 5) < 0.001 },
      { id:'psr-recipe-q3', domain:'Proportionnalité', correct:Math.abs(parsePsrMathsNumber($('psr-recipe-q3').value) - 2250) < 0.001 },
      { id:'psr-recipe-q4', domain:'Coefficient', correct:$('psr-recipe-q4').value === '3.2' },
    ];
    const count = checks.filter((item) => item.correct).length;
    await recordPsrModuleChecks('recettes', checks);
    show('psr-recipe-feedback', true);
    $('psr-recipe-feedback').innerHTML = `<strong>${count}/4 situations réussies.</strong><div class="feedback-lines">
      <span>${checks[0].correct ? '✓' : '↻'} 15 ÷ 5 = 3 → 400 × 3 = <b>1 200 g</b></span>
      <span>${checks[1].correct ? '✓' : '↻'} 20 ÷ 8 = 2,5 → 2 × 2,5 = <b>5 L</b></span>
      <span>${checks[2].correct ? '✓' : '↻'} 18 ÷ 6 = 3 → 750 × 3 = <b>2 250 g</b></span>
      <span>${checks[3].correct ? '✓' : '↻'} 32 ÷ 10 = <b>3,2</b></span>
    </div>`;
  };
  $('psr-check-recipe').addEventListener('click', check);
  $('psr-recipe-answers')?.addEventListener('click', async () => {
    $('psr-recipe-q1').value = '1200';
    $('psr-recipe-q2').value = '5';
    $('psr-recipe-q3').value = '2250';
    $('psr-recipe-q4').value = '3.2';
    await check();
  });
}

function renderPsrMathsPercentModule() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('pourcentages')}
      <div>
        <p class="eyebrow">Module · Pourcentages</p>
        <h3>Un pourcentage, c’est une part sur 100.</h3>
        <p class="learner-help">En PSR, les pourcentages servent à lire une part, une réduction ou une évolution. On commence par voir la part, puis on calcule.</p>
      </div>
      <div class="psr-module-context-grid">
        <article class="psr-module-context"><span>🥗</span><strong>Répartition</strong><p>Sur 100 menus, 30 sont végétariens : cela représente 30 %.</p></article>
        <article class="psr-module-context"><span>🏷️</span><strong>Réduction</strong><p>Sur une formule à 10 €, 20 % représentent 2 €. Le nouveau prix est 8 €.</p></article>
        <article class="psr-module-context"><span>📦</span><strong>Stock</strong><p>25 % de 40 produits, cela représente 10 produits.</p></article>
      </div>
      <div class="callout"><strong>À retenir :</strong> 50 % = 50 sur 100 = la moitié. Donc <strong>50 % = 1/2 = 2/4</strong>.</div>

      <section class="psr-learning-lab">
        <div><span class="pill">Manipule</span><h4>Colorie une part sur 100</h4><p class="muted">Chaque case vaut 1 %. Bouge le curseur et compare pourcentage, part sur 100 et écriture décimale.</p></div>
        <div class="psr-percent-lab">
          <div id="psr-percent-grid" class="psr-percent-grid" aria-label="Grille de cent cases représentant un pourcentage"></div>
          <div>
            <div class="psr-big-number"><span id="psr-percent-value">50</span><small>%</small></div>
            <input id="psr-percent-slider" type="range" min="0" max="100" step="5" value="50">
            <div id="psr-percent-equivalence" class="psr-percent-equivalence">50 % = 50/100 = 1/2 = 2/4</div>
            <div class="psr-mini-stats">
              <div class="psr-mini-stat">Sur 100<strong id="psr-percent-outof">50</strong></div>
              <div class="psr-mini-stat">Décimal<strong id="psr-percent-decimal">0,5</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section class="psr-method-card">
        <p class="eyebrow">Une méthode simple</p>
        <div class="psr-method-steps">
          <div><span>1</span><p>Repère le nombre total.</p></div>
          <div><span>2</span><p>Transforme le pourcentage en part sur 100, en fraction simple ou en décimal.</p></div>
          <div><span>3</span><p>Calcule la part puis vérifie si le résultat paraît logique.</p></div>
        </div>
        <div class="callout"><strong>25 % de 40</strong> → 25 % = 1/4 → 40 ÷ 4 = <strong>10</strong>.</div>
      </section>

      <section class="psr-module-practice">
        <p class="eyebrow">À toi · 4 situations</p>
        <div class="psr-challenge-questions">
          <div class="psr-challenge-question"><label for="psr-percent-q1">1 · 25 % de 40 produits sont utilisés. Combien de produits ?</label><div class="session-link-row"><input id="psr-percent-q1" class="input" inputmode="decimal" type="text"><strong>produits</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-percent-q2">2 · Un menu coûte 18 €. Remise de 50 %. Quel nouveau prix ?</label><div class="session-link-row"><input id="psr-percent-q2" class="input" inputmode="decimal" type="text"><strong>€</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-percent-q3">3 · Une formule coûte 20 €. On retire 10 %. Quel prix reste à payer ?</label><div class="session-link-row"><input id="psr-percent-q3" class="input" inputmode="decimal" type="text"><strong>€</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-percent-q4">4 · 30 commandes sur 50 concernent le menu A. Quel pourcentage ?</label><select id="psr-percent-q4" class="input"><option value="">Choisir…</option><option value="30">30 %</option><option value="50">50 %</option><option value="60">60 %</option><option value="80">80 %</option></select></div>
        </div>
        <div id="psr-percent-feedback" class="callout hidden" aria-live="polite"></div>
        <div class="practice-actions">
          <button id="psr-check-percent" class="btn primary" type="button">Vérifier</button>
          ${state.previewMode ? '<button id="psr-percent-answers" class="btn secondary" type="button">Voir les réponses</button>' : ''}
          <button class="btn secondary" type="button" data-open-psr="donnees">Module suivant · Données</button>
          <button class="btn ghost" type="button" data-open-psr="overview">Retour au parcours</button>
        </div>
      </section>
    </div>`;

  bindPsrMathsSequenceNav();
  document.querySelectorAll('[data-open-psr]').forEach((button) => button.addEventListener('click', () => openPsrMathsSequenceStep(button.dataset.openPsr)));

  const grid = $('psr-percent-grid');
  grid.innerHTML = Array.from({ length:100 }, (_, index) => `<span data-cell="${index}"></span>`).join('');
  const slider = $('psr-percent-slider');
  const updateLab = () => {
    const value = Number(slider.value);
    $('psr-percent-value').textContent = String(value);
    $('psr-percent-outof').textContent = String(value);
    $('psr-percent-decimal').textContent = formatPsrNumber(value / 100);
    const equivalences = {
      0:'0 % = 0/100 = rien',
      25:'25 % = 25/100 = 1/4',
      50:'50 % = 50/100 = 1/2 = 2/4',
      75:'75 % = 75/100 = 3/4',
      100:'100 % = 100/100 = tout',
    };
    $('psr-percent-equivalence').textContent = equivalences[value] || `${value} % = ${value}/100`;
    grid.querySelectorAll('span').forEach((cell, index) => cell.classList.toggle('filled', index < value));
  };
  slider.addEventListener('input', updateLab);
  updateLab();

  const check = async () => {
    const checks = [
      { id:'psr-percent-q1', domain:'Calculer une part', correct:Math.abs(parsePsrMathsNumber($('psr-percent-q1').value) - 10) < 0.001 },
      { id:'psr-percent-q2', domain:'Moitié / réduction', correct:Math.abs(parsePsrMathsNumber($('psr-percent-q2').value) - 9) < 0.001 },
      { id:'psr-percent-q3', domain:'Réduction', correct:Math.abs(parsePsrMathsNumber($('psr-percent-q3').value) - 18) < 0.001 },
      { id:'psr-percent-q4', domain:'Part vers pourcentage', correct:$('psr-percent-q4').value === '60' },
    ];
    const count = checks.filter((item) => item.correct).length;
    await recordPsrModuleChecks('pourcentages', checks);
    show('psr-percent-feedback', true);
    $('psr-percent-feedback').innerHTML = `<strong>${count}/4 situations réussies.</strong><div class="feedback-lines">
      <span>${checks[0].correct ? '✓' : '↻'} 25 % de 40 = <b>10</b></span>
      <span>${checks[1].correct ? '✓' : '↻'} 50 % de 18 € = 9 €, donc nouveau prix <b>9 €</b></span>
      <span>${checks[2].correct ? '✓' : '↻'} 10 % de 20 € = 2 €, donc prix <b>18 €</b></span>
      <span>${checks[3].correct ? '✓' : '↻'} 30 ÷ 50 = 0,6 = <b>60 %</b></span>
    </div>`;
  };
  $('psr-check-percent').addEventListener('click', check);
  $('psr-percent-answers')?.addEventListener('click', async () => {
    $('psr-percent-q1').value = '10';
    $('psr-percent-q2').value = '9';
    $('psr-percent-q3').value = '18';
    $('psr-percent-q4').value = '60';
    await check();
  });
}

function renderPsrMathsDataModule() {
  const baseValues = [24,32,28,40,26];
  const labels = ['Lun','Mar','Mer','Jeu','Ven'];
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('donnees')}
      <div>
        <p class="eyebrow">Module · Données & statistiques</p>
        <h3>Lire des données pour décider.</h3>
        <p class="learner-help">Un tableau ou un graphique aide à comparer des jours, repérer un maximum et résumer plusieurs valeurs.</p>
      </div>
      <div class="psr-module-context-grid">
        <article class="psr-module-context"><span>📊</span><strong>Ventes</strong><p>Comparer le nombre de menus servis chaque jour.</p></article>
        <article class="psr-module-context"><span>📦</span><strong>Stock</strong><p>Repérer les produits les plus ou les moins utilisés.</p></article>
        <article class="psr-module-context"><span>🥪</span><strong>Choix clients</strong><p>Voir quel menu revient le plus souvent.</p></article>
      </div>
      <div class="callout"><strong>Avant de calculer :</strong> lis le titre, les unités et les valeurs. Pour une moyenne : on additionne, puis on divise par le nombre de valeurs.</div>

      <section class="psr-learning-lab">
        <div><span class="pill">Manipule</span><h4>Une semaine de menus servis</h4><p class="muted">Fais varier le vendredi. Observe comment le graphique, le total et la moyenne changent.</p></div>
        <div class="psr-data-lab">
          <div id="psr-data-chart" class="psr-data-chart" aria-label="Menus servis du lundi au vendredi">
            ${labels.map((label,index) => `
              <div class="psr-data-col">
                <strong id="psr-data-value-${index}">${baseValues[index]}</strong>
                <div class="psr-data-track"><span id="psr-data-bar-${index}" class="psr-data-bar"></span></div>
                <small>${label}</small>
              </div>`).join('')}
          </div>
          <div>
            <label for="psr-data-friday"><strong>Menus servis vendredi</strong></label>
            <div class="psr-big-number"><span id="psr-data-friday-label">26</span><small>menus</small></div>
            <input id="psr-data-friday" type="range" min="10" max="50" step="1" value="26">
            <div class="psr-mini-stats">
              <div class="psr-mini-stat">Total<strong id="psr-data-total"></strong></div>
              <div class="psr-mini-stat">Maximum<strong id="psr-data-max"></strong></div>
              <div class="psr-mini-stat">Minimum<strong id="psr-data-min"></strong></div>
              <div class="psr-mini-stat">Moyenne<strong id="psr-data-average"></strong></div>
            </div>
          </div>
        </div>
      </section>

      <section class="psr-method-card">
        <p class="eyebrow">Une méthode simple</p>
        <div class="psr-method-steps">
          <div><span>1</span><p>Lis ce que représentent les nombres et leur unité.</p></div>
          <div><span>2</span><p>Compare : plus grand, plus petit, écarts.</p></div>
          <div><span>3</span><p>Pour une moyenne : additionne puis divise par le nombre de valeurs.</p></div>
        </div>
        <div class="callout"><strong>20, 30 et 40 menus</strong> → total 90 → 90 ÷ 3 = <strong>30</strong>.</div>
      </section>

      <section class="psr-module-practice">
        <p class="eyebrow">À toi · 4 situations</p>
        <div class="psr-challenge-questions">
          <div class="psr-challenge-question"><label for="psr-data-q1">1 · Lundi 20, mardi 35, mercredi 30. Quel jour a le plus de menus ?</label><select id="psr-data-q1" class="input"><option value="">Choisir…</option><option value="lundi">Lundi</option><option value="mardi">Mardi</option><option value="mercredi">Mercredi</option></select></div>
          <div class="psr-challenge-question"><label for="psr-data-q2">2 · 20, 30 et 40 menus sur trois jours. Quelle moyenne ?</label><div class="session-link-row"><input id="psr-data-q2" class="input" inputmode="decimal" type="text"><strong>menus</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-data-q3">3 · 12 commandes sur 40 sont végétariennes. Quelle fréquence ?</label><div class="session-link-row"><input id="psr-data-q3" class="input" inputmode="decimal" type="text"><strong>%</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-data-q4">4 · Dans 18, 22, 22, 30, quelle valeur apparaît le plus souvent ?</label><select id="psr-data-q4" class="input"><option value="">Choisir…</option><option value="18">18</option><option value="22">22</option><option value="30">30</option><option value="23">23</option></select></div>
        </div>
        <div id="psr-data-feedback" class="callout hidden" aria-live="polite"></div>
        <div class="practice-actions">
          <button id="psr-check-data" class="btn primary" type="button">Vérifier</button>
          ${state.previewMode ? '<button id="psr-data-answers" class="btn secondary" type="button">Voir les réponses</button>' : ''}
          <button class="btn secondary" type="button" data-open-psr="equations">Module suivant · Équations</button>
          <button class="btn ghost" type="button" data-open-psr="overview">Retour au parcours</button>
        </div>
      </section>
    </div>`;

  bindPsrMathsSequenceNav();
  document.querySelectorAll('[data-open-psr]').forEach((button) => button.addEventListener('click', () => openPsrMathsSequenceStep(button.dataset.openPsr)));

  const friday = $('psr-data-friday');
  const updateLab = () => {
    const values = [...baseValues];
    values[4] = Number(friday.value);
    const total = values.reduce((sum,value) => sum + value, 0);
    const average = total / values.length;
    values.forEach((value,index) => {
      $('psr-data-value-' + index).textContent = String(value);
      $('psr-data-bar-' + index).style.height = `${Math.max(8, value / 50 * 100)}%`;
    });
    $('psr-data-friday-label').textContent = String(values[4]);
    $('psr-data-total').textContent = String(total);
    $('psr-data-max').textContent = String(Math.max(...values));
    $('psr-data-min').textContent = String(Math.min(...values));
    $('psr-data-average').textContent = formatPsrNumber(average);
  };
  friday.addEventListener('input', updateLab);
  updateLab();

  const check = async () => {
    const checks = [
      { id:'psr-data-q1', domain:'Lire et comparer', correct:$('psr-data-q1').value === 'mardi' },
      { id:'psr-data-q2', domain:'Moyenne', correct:Math.abs(parsePsrMathsNumber($('psr-data-q2').value) - 30) < 0.001 },
      { id:'psr-data-q3', domain:'Fréquence', correct:Math.abs(parsePsrMathsNumber($('psr-data-q3').value) - 30) < 0.001 },
      { id:'psr-data-q4', domain:'Valeur fréquente', correct:$('psr-data-q4').value === '22' },
    ];
    const count = checks.filter((item) => item.correct).length;
    await recordPsrModuleChecks('donnees', checks);
    show('psr-data-feedback', true);
    $('psr-data-feedback').innerHTML = `<strong>${count}/4 situations réussies.</strong><div class="feedback-lines">
      <span>${checks[0].correct ? '✓' : '↻'} 35 est la plus grande valeur : <b>mardi</b></span>
      <span>${checks[1].correct ? '✓' : '↻'} (20 + 30 + 40) ÷ 3 = <b>30</b></span>
      <span>${checks[2].correct ? '✓' : '↻'} 12 ÷ 40 = 0,3 = <b>30 %</b></span>
      <span>${checks[3].correct ? '✓' : '↻'} <b>22</b> apparaît deux fois</span>
    </div>`;
  };
  $('psr-check-data').addEventListener('click', check);
  $('psr-data-answers')?.addEventListener('click', async () => {
    $('psr-data-q1').value = 'mardi';
    $('psr-data-q2').value = '30';
    $('psr-data-q3').value = '30';
    $('psr-data-q4').value = '22';
    await check();
  });
}


function renderPsrMathsEquationModule() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('equations')}
      <div>
        <p class="eyebrow">Module · Équations</p>
        <h3>Trouver le nombre caché.</h3>
        <p class="learner-help">Parfois, on connaît le résultat mais pas la quantité de départ. La lettre <strong>x</strong> remplace simplement le nombre qu’on cherche.</p>
      </div>
      <div class="psr-module-context-grid">
        <article class="psr-module-context"><span>📦</span><strong>Barquettes</strong><p>3 lots identiques donnent 24 barquettes. Combien y en a-t-il dans un lot ?</p></article>
        <article class="psr-module-context"><span>💶</span><strong>Prix</strong><p>Après avoir ajouté 5 €, on obtient 17 €. Quel était le prix de départ ?</p></article>
        <article class="psr-module-context"><span>🥤</span><strong>Quantité</strong><p>4 bouteilles identiques coûtent 36 €. Quel est le prix d’une bouteille ?</p></article>
      </div>
      <div class="callout"><strong>L’idée avant le mot :</strong> on cherche le nombre qui rend l’égalité vraie. En maths, une égalité avec un nombre inconnu s’appelle une <strong>équation</strong>.</div>

      <section class="psr-learning-lab">
        <div><span class="pill">Manipule</span><h4>Fais équilibrer l’égalité</h4><p class="muted">On cherche x dans 3 × x = 24. Bouge le curseur jusqu’à ce que les deux côtés donnent la même chose.</p></div>
        <div class="psr-equation-lab">
          <div id="psr-equation-balance" class="psr-equation-balance">
            <div class="psr-equation-side"><span>3 × x</span><strong id="psr-equation-left">12</strong></div>
            <div id="psr-equation-sign" class="psr-balance-sign">≠</div>
            <div class="psr-equation-side target"><span>Résultat</span><strong>24</strong></div>
          </div>
          <div>
            <label for="psr-equation-x"><strong>Valeur de x</strong></label>
            <div class="psr-big-number"><span id="psr-equation-x-value">4</span></div>
            <input id="psr-equation-x" type="range" min="1" max="12" step="1" value="4">
            <div id="psr-equation-live" class="psr-equation-live">3 × 4 = 12</div>
            <p id="psr-equation-status" class="muted">Le côté gauche est encore trop petit.</p>
          </div>
        </div>
      </section>

      <section class="psr-method-card">
        <p class="eyebrow">Une méthode simple</p>
        <div class="psr-method-steps">
          <div><span>1</span><p>Repère le nombre que tu cherches.</p></div>
          <div><span>2</span><p>Regarde l’opération faite avec ce nombre.</p></div>
          <div><span>3</span><p>Fais l’opération inverse pour revenir au nombre caché.</p></div>
        </div>
        <div class="callout"><strong>3 × x = 24</strong> → on fait l’inverse de × 3 → 24 ÷ 3 → <strong>x = 8</strong>.</div>
      </section>

      <section class="psr-module-practice">
        <p class="eyebrow">À toi · 4 situations</p>
        <div class="psr-challenge-questions">
          <div class="psr-challenge-question"><label for="psr-equation-q1">1 · 3 × x = 24. Quelle est la valeur de x ?</label><input id="psr-equation-q1" class="input" inputmode="decimal" type="text"></div>
          <div class="psr-challenge-question"><label for="psr-equation-q2">2 · x + 7 = 19. Quel nombre manque ?</label><input id="psr-equation-q2" class="input" inputmode="decimal" type="text"></div>
          <div class="psr-challenge-question"><label for="psr-equation-q3">3 · 4 menus identiques coûtent 36 €. Quel est le prix d’un menu ?</label><div class="session-link-row"><input id="psr-equation-q3" class="input" inputmode="decimal" type="text"><strong>€</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-equation-q4">4 · x − 4 = 11. Quelle est la valeur de x ?</label><select id="psr-equation-q4" class="input"><option value="">Choisir…</option><option value="7">7</option><option value="15">15</option><option value="44">44</option><option value="4">4</option></select></div>
        </div>
        <div id="psr-equation-feedback" class="callout hidden" aria-live="polite"></div>
        <div class="practice-actions">
          <button id="psr-check-equation" class="btn primary" type="button">Vérifier</button>
          ${state.previewMode ? '<button id="psr-equation-answers" class="btn secondary" type="button">Voir les réponses</button>' : ''}
          <button class="btn secondary" type="button" data-open-psr="fonctions">Module suivant · Graphiques</button>
          <button class="btn ghost" type="button" data-open-psr="overview">Retour au parcours</button>
        </div>
      </section>
    </div>`;

  bindPsrMathsSequenceNav();
  document.querySelectorAll('[data-open-psr]').forEach((button) => button.addEventListener('click', () => openPsrMathsSequenceStep(button.dataset.openPsr)));

  const slider = $('psr-equation-x');
  const updateLab = () => {
    const x = Number(slider.value);
    const left = 3 * x;
    const solved = left === 24;
    $('psr-equation-x-value').textContent = String(x);
    $('psr-equation-left').textContent = String(left);
    $('psr-equation-sign').textContent = solved ? '=' : '≠';
    $('psr-equation-live').textContent = `3 × ${x} = ${left}`;
    $('psr-equation-status').textContent = solved
      ? 'Équilibre trouvé : x = 8.'
      : left < 24 ? 'Le côté gauche est encore trop petit.' : 'Le côté gauche est maintenant trop grand.';
    $('psr-equation-balance').classList.toggle('balanced', solved);
  };
  slider.addEventListener('input', updateLab);
  updateLab();

  const check = async () => {
    const checks = [
      { id:'psr-equation-q1', domain:'Division inverse', correct:Math.abs(parsePsrMathsNumber($('psr-equation-q1').value) - 8) < 0.001 },
      { id:'psr-equation-q2', domain:'Soustraction inverse', correct:Math.abs(parsePsrMathsNumber($('psr-equation-q2').value) - 12) < 0.001 },
      { id:'psr-equation-q3', domain:'Situation vers équation', correct:Math.abs(parsePsrMathsNumber($('psr-equation-q3').value) - 9) < 0.001 },
      { id:'psr-equation-q4', domain:'Addition inverse', correct:$('psr-equation-q4').value === '15' },
    ];
    const count = checks.filter((item) => item.correct).length;
    await recordPsrModuleChecks('equations', checks);
    show('psr-equation-feedback', true);
    $('psr-equation-feedback').innerHTML = `<strong>${count}/4 situations réussies.</strong><div class="feedback-lines">
      <span>${checks[0].correct ? '✓' : '↻'} 3 × x = 24 → 24 ÷ 3 = <b>8</b></span>
      <span>${checks[1].correct ? '✓' : '↻'} x + 7 = 19 → 19 − 7 = <b>12</b></span>
      <span>${checks[2].correct ? '✓' : '↻'} 36 € ÷ 4 menus = <b>9 €</b> par menu</span>
      <span>${checks[3].correct ? '✓' : '↻'} x − 4 = 11 → 11 + 4 = <b>15</b></span>
    </div>`;
  };
  $('psr-check-equation').addEventListener('click', check);
  $('psr-equation-answers')?.addEventListener('click', async () => {
    $('psr-equation-q1').value = '8';
    $('psr-equation-q2').value = '12';
    $('psr-equation-q3').value = '9';
    $('psr-equation-q4').value = '15';
    await check();
  });
}

function renderPsrMathsFunctionModule() {
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('fonctions')}
      <div>
        <p class="eyebrow">Module · Graphiques & fonctions</p>
        <h3>Quand une quantité change, l’autre change aussi.</h3>
        <p class="learner-help">Si chaque menu est vendu au même prix, plus on vend de menus, plus le montant total augmente. Un graphique permet de voir ce lien d’un coup d’œil.</p>
      </div>
      <div class="psr-module-context-grid">
        <article class="psr-module-context"><span>🍽️</span><strong>Menus vendus</strong><p>Nombre de menus ↔ montant encaissé.</p></article>
        <article class="psr-module-context"><span>🥣</span><strong>Production</strong><p>Nombre de portions ↔ quantité d’ingrédients.</p></article>
        <article class="psr-module-context"><span>⏱️</span><strong>Cadence</strong><p>Temps de production ↔ nombre de barquettes produites.</p></article>
      </div>
      <div class="callout"><strong>L’idée avant le mot :</strong> une quantité dépend d’une autre. En maths, cette relation peut s’appeler une <strong>fonction</strong>.</div>

      <section class="psr-learning-lab">
        <div><span class="pill">Manipule</span><h4>Menus vendus à 8 € l’unité</h4><p class="muted">Bouge le curseur. Le point se déplace sur la droite et le montant total change.</p></div>
        <div class="psr-function-lab">
          <div class="psr-function-chart-card">
            <svg class="psr-function-chart" viewBox="0 0 440 280" role="img" aria-label="Graphique reliant le nombre de menus au montant encaissé">
              <defs><pattern id="psr-function-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(102,86,242,.10)" stroke-width="1"/></pattern></defs>
              <rect x="50" y="20" width="360" height="220" rx="10" fill="url(#psr-function-grid)"/>
              <line x1="50" y1="240" x2="410" y2="240" class="psr-chart-axis"/>
              <line x1="50" y1="240" x2="50" y2="20" class="psr-chart-axis"/>
              <line x1="50" y1="240" x2="410" y2="20" class="psr-function-line"/>
              <circle id="psr-function-point" cx="194" cy="152" r="8" class="psr-function-point"/>
              <text x="220" y="270" text-anchor="middle" class="psr-chart-label">menus vendus</text>
              <text x="15" y="130" text-anchor="middle" transform="rotate(-90 15 130)" class="psr-chart-label">montant (€)</text>
              <text x="45" y="256" text-anchor="end" class="psr-chart-tick">0</text>
              <text x="230" y="256" text-anchor="middle" class="psr-chart-tick">10</text>
              <text x="410" y="256" text-anchor="middle" class="psr-chart-tick">20</text>
              <text x="42" y="135" text-anchor="end" class="psr-chart-tick">80</text>
              <text x="42" y="25" text-anchor="end" class="psr-chart-tick">160</text>
            </svg>
          </div>
          <div>
            <label for="psr-function-menus"><strong>Menus vendus</strong></label>
            <div class="psr-big-number"><span id="psr-function-menu-count">8</span><small>menus</small></div>
            <input id="psr-function-menus" type="range" min="0" max="20" step="1" value="8">
            <div class="psr-function-relation"><span id="psr-function-x">8 menus</span><b>× 8 €</b><strong id="psr-function-y">64 €</strong></div>
            <div class="psr-mini-stats">
              <div class="psr-mini-stat">x = menus<strong id="psr-function-x-card">8</strong></div>
              <div class="psr-mini-stat">y = montant<strong id="psr-function-y-card">64 €</strong></div>
              <div class="psr-mini-stat">Relation<strong>y = 8 × x</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section class="psr-method-card">
        <p class="eyebrow">Lire un graphique</p>
        <div class="psr-method-steps">
          <div><span>1</span><p>Regarde ce que représente l’axe horizontal.</p></div>
          <div><span>2</span><p>Regarde ce que représente l’axe vertical et les unités.</p></div>
          <div><span>3</span><p>Pars d’une valeur sur un axe et lis la valeur correspondante sur l’autre.</p></div>
        </div>
        <div class="callout"><strong>10 menus</strong> à 8 € chacun → 10 × 8 € → <strong>80 €</strong>.</div>
      </section>

      <section class="psr-module-practice">
        <p class="eyebrow">À toi · 4 situations</p>
        <div class="psr-challenge-questions">
          <div class="psr-challenge-question"><label for="psr-function-q1">1 · Un menu coûte 8 €. Quel montant pour 6 menus ?</label><div class="session-link-row"><input id="psr-function-q1" class="input" inputmode="decimal" type="text"><strong>€</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-function-q2">2 · Avec la relation y = 8 × x, quel montant correspond à 10 menus ?</label><div class="session-link-row"><input id="psr-function-q2" class="input" inputmode="decimal" type="text"><strong>€</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-function-q3">3 · On a encaissé 96 € avec des menus à 8 €. Combien de menus ont été vendus ?</label><div class="session-link-row"><input id="psr-function-q3" class="input" inputmode="decimal" type="text"><strong>menus</strong></div></div>
          <div class="psr-challenge-question"><label for="psr-function-q4">4 · Quand le nombre de menus est multiplié par 2, que devient le montant si le prix unitaire ne change pas ?</label><select id="psr-function-q4" class="input"><option value="">Choisir…</option><option value="same">Il reste pareil</option><option value="double">Il est multiplié par 2</option><option value="half">Il est divisé par 2</option><option value="plus8">On ajoute seulement 8 €</option></select></div>
        </div>
        <div id="psr-function-feedback" class="callout hidden" aria-live="polite"></div>
        <div class="practice-actions">
          <button id="psr-check-function" class="btn primary" type="button">Vérifier</button>
          ${state.previewMode ? '<button id="psr-function-answers" class="btn secondary" type="button">Voir les réponses</button>' : ''}
          <button class="btn secondary" type="button" data-open-psr="commerce">Module suivant · Prix & commerce</button>
          <button class="btn ghost" type="button" data-open-psr="overview">Retour au parcours</button>
        </div>
      </section>
    </div>`;

  bindPsrMathsSequenceNav();
  document.querySelectorAll('[data-open-psr]').forEach((button) => button.addEventListener('click', () => openPsrMathsSequenceStep(button.dataset.openPsr)));

  const slider = $('psr-function-menus');
  const updateLab = () => {
    const menus = Number(slider.value);
    const revenue = menus * 8;
    const x = 50 + menus / 20 * 360;
    const y = 240 - revenue / 160 * 220;
    $('psr-function-menu-count').textContent = String(menus);
    $('psr-function-x').textContent = `${menus} menu${menus > 1 ? 's' : ''}`;
    $('psr-function-y').textContent = `${formatPsrNumber(revenue)} €`;
    $('psr-function-x-card').textContent = String(menus);
    $('psr-function-y-card').textContent = `${formatPsrNumber(revenue)} €`;
    $('psr-function-point').setAttribute('cx', String(x));
    $('psr-function-point').setAttribute('cy', String(y));
  };
  slider.addEventListener('input', updateLab);
  updateLab();

  const check = async () => {
    const checks = [
      { id:'psr-function-q1', domain:'Calculer une image', correct:Math.abs(parsePsrMathsNumber($('psr-function-q1').value) - 48) < 0.001 },
      { id:'psr-function-q2', domain:'Lire une relation', correct:Math.abs(parsePsrMathsNumber($('psr-function-q2').value) - 80) < 0.001 },
      { id:'psr-function-q3', domain:'Retrouver l’entrée', correct:Math.abs(parsePsrMathsNumber($('psr-function-q3').value) - 12) < 0.001 },
      { id:'psr-function-q4', domain:'Comprendre la relation', correct:$('psr-function-q4').value === 'double' },
    ];
    const count = checks.filter((item) => item.correct).length;
    await recordPsrModuleChecks('fonctions', checks);
    show('psr-function-feedback', true);
    $('psr-function-feedback').innerHTML = `<strong>${count}/4 situations réussies.</strong><div class="feedback-lines">
      <span>${checks[0].correct ? '✓' : '↻'} 6 × 8 € = <b>48 €</b></span>
      <span>${checks[1].correct ? '✓' : '↻'} y = 8 × 10 = <b>80 €</b></span>
      <span>${checks[2].correct ? '✓' : '↻'} 96 € ÷ 8 € = <b>12 menus</b></span>
      <span>${checks[3].correct ? '✓' : '↻'} À prix fixe, si les menus doublent, le montant <b>double aussi</b></span>
    </div>`;
  };
  $('psr-check-function').addEventListener('click', check);
  $('psr-function-answers')?.addEventListener('click', async () => {
    $('psr-function-q1').value = '48';
    $('psr-function-q2').value = '80';
    $('psr-function-q3').value = '12';
    $('psr-function-q4').value = 'double';
    await check();
  });
}

function renderPsrMathsModulePreview(moduleId) {
  const module = PSR_MATHS_MODULES.find((item) => item.id === moduleId);
  if (!module) return renderPsrMathsPathwayHome();
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav(moduleId)}
      <div>
        <p class="eyebrow">Module · ${esc(module.label)}</p>
        <h3>${esc(module.description)}</h3>
      </div>
      <div class="callout">
        <strong>Migration en cours dans Portail.</strong>
        <p>Le module complet existe encore dans l’ancien cours Maths LGC. Il sera repris ici avec ses manipulations et exercices, sans recopier l’ancien shell technique.</p>
      </div>
      <div class="practice-actions"><button id="psr-module-overview" class="btn primary" type="button">Retour au parcours</button></div>
    </div>`;
  bindPsrMathsSequenceNav();
  $('psr-module-overview').addEventListener('click', renderPsrMathsPathwayHome);
}

const PSR_MATHS_DIAGNOSTIC = [
  {
    id:'psr-d01', domain:'Calcul',
    prompt:'Une caisse contient 12 bouteilles à 1,50 € chacune. Quel est le prix total ?',
    type:'number', suffix:'€', answer:18, tolerance:0.001,
    explanation:'12 × 1,50 = 18. On multiplie le prix unitaire par le nombre de bouteilles.'
  },
  {
    id:'psr-d02', domain:'Automatismes',
    prompt:'Un bac contient 3,6 kg de préparation. Combien cela fait-il en grammes ?',
    type:'number', suffix:'g', answer:3600, tolerance:0.001,
    explanation:'1 kg = 1 000 g, donc 3,6 × 1 000 = 3 600 g.'
  },
  {
    id:'psr-d03', domain:'Durées',
    prompt:'Une préparation commence à 9 h 35 et dure 50 minutes. À quelle heure finit-elle ?',
    type:'text', placeholder:'ex. 10 h 25',
    answer:['10h25','10 h 25','10:25','10.25'],
    explanation:'9 h 35 + 25 min = 10 h, puis encore 25 min : fin à 10 h 25.'
  },
  {
    id:'psr-d04', domain:'Fractions & pourcentages',
    prompt:'La moitié d’une quantité correspond à quel pourcentage ?',
    type:'number', suffix:'%', answer:50, tolerance:0.001,
    explanation:'1/2 = 0,5 = 50 %.'
  },
  {
    id:'psr-d05', domain:'Proportionnalité',
    prompt:'Une recette utilise 400 g de riz pour 5 portions. Combien faut-il de riz pour 15 portions ?',
    type:'number', suffix:'g', answer:1200, tolerance:0.001,
    explanation:'15 portions, c’est 3 fois 5 portions. Donc 400 × 3 = 1 200 g.'
  },
  {
    id:'psr-d06', domain:'Monnaie',
    prompt:'Un client paie 20 € pour une commande de 13,70 €. Quelle monnaie faut-il rendre ?',
    type:'number', suffix:'€', answer:6.30, tolerance:0.001,
    explanation:'20 − 13,70 = 6,30 €.'
  },
  {
    id:'psr-d07', domain:'Données',
    prompt:'Quatre services ont vendu 18, 22, 20 et 20 menus. Quelle est la moyenne ?',
    type:'number', suffix:'menus', answer:20, tolerance:0.001,
    explanation:'(18 + 22 + 20 + 20) ÷ 4 = 80 ÷ 4 = 20.'
  },
  {
    id:'psr-d08', domain:'Équations',
    prompt:'On cherche un nombre x tel que 3 × x = 24. Quelle est la valeur de x ?',
    type:'number', answer:8, tolerance:0.001,
    explanation:'x = 24 ÷ 3 = 8.'
  },
  {
    id:'psr-d09', domain:'Lecture de situation',
    prompt:'Une machine produit 6 barquettes toutes les 10 minutes. Combien en produit-elle en 30 minutes, au même rythme ?',
    type:'number', suffix:'barquettes', answer:18, tolerance:0.001,
    explanation:'30 minutes = 3 fois 10 minutes. Donc 6 × 3 = 18 barquettes.'
  },
  {
    id:'psr-d10', domain:'Ordres de grandeur',
    prompt:'Un produit coûte 4,98 €. Pour estimer rapidement le coût de 10 produits, quel ordre de grandeur est le plus raisonnable ?',
    type:'select', options:['5 €','50 €','500 €'], answer:'50 €',
    explanation:'4,98 € est proche de 5 €. Pour 10 produits : environ 5 × 10 = 50 €.'
  },
];

function normalisePsrMathsText(value) {
  return String(value || '').toLocaleLowerCase('fr-FR').replace(/\s+/g, '').replace(',', '.').trim();
}

function parsePsrMathsNumber(value) {
  const parsed = Number(String(value || '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function psrMathsAnswerIsCorrect(question, value) {
  if (question.type === 'select') return value === question.answer;
  if (question.type === 'text') {
    const candidate = normalisePsrMathsText(value);
    return question.answer.some((answer) => normalisePsrMathsText(answer) === candidate);
  }
  const number = parsePsrMathsNumber(value);
  return Number.isFinite(number) && Math.abs(number - question.answer) <= question.tolerance;
}

function psrMathsAnswersStorageKey() {
  const sessionId = state.joinSession?.id || '';
  const learnerId = state.learner?.id || '';
  return sessionId && learnerId ? `portail-psr-maths-answers:${sessionId}:${learnerId}` : '';
}

function readPsrMathsAnswers() {
  const key = psrMathsAnswersStorageKey();
  if (!key || state.previewMode) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePsrMathsAnswer(question, value, unknown, correct) {
  if (state.previewMode) return;
  const key = psrMathsAnswersStorageKey();
  if (!key) return;
  const answers = readPsrMathsAnswers();
  answers[question.id] = {
    value:unknown ? '' : String(value || ''),
    unknown:Boolean(unknown),
    correct:Boolean(correct),
  };
  try {
    localStorage.setItem(key, JSON.stringify(answers));
  } catch {
    // Local answer recall improves correction UX but is not required for server tracking.
  }
}

async function recordPsrDiagnosticAnswer(question, value, unknown = false) {
  const correct = !unknown && psrMathsAnswerIsCorrect(question, value);
  savePsrMathsAnswer(question, value, unknown, correct);
  await trackEvent('answer', question.id, {
    correct,
    unknown,
    choice: unknown ? '' : value,
    domain: question.domain,
  });
  await trackEvent('activity_completed', question.id, {
    unknown,
    domain: question.domain,
  });
}

function renderPsrMathsDiagnostic(index = 0) {
  const question = PSR_MATHS_DIAGNOSTIC[index];
  if (!question) return renderPsrMathsFinish();

  const inputMarkup = question.type === 'select'
    ? `<select id="psr-diagnostic-answer" class="input" aria-label="Réponse à la question ${index + 1}">
        <option value="">Choisir…</option>
        ${question.options.map((option) => `<option value="${esc(option)}">${esc(option)}</option>`).join('')}
      </select>`
    : `<input id="psr-diagnostic-answer" class="input" type="text"
        inputmode="${question.type === 'number' ? 'decimal' : 'text'}"
        placeholder="${esc(question.placeholder || 'Ta réponse')}"
        aria-label="Réponse à la question ${index + 1}" />`;

  $('student-session-message').innerHTML = `
    <div class="learner-stage numeracy-stage">
      ${renderPsrMathsSequenceNav('diagnostic')}
      <p class="eyebrow">Diagnostic de rentrée · ${index + 1}/${PSR_MATHS_DIAGNOSTIC.length}</p>
      <h3>${esc(question.prompt)}</h3>
      <p class="learner-help">Ce diagnostic n’est pas une note. Si tu ne sais pas, dis-le simplement : c’est une information utile pour le professeur.</p>
      <div class="form-grid compact">
        <label class="wide">Ta réponse
          <div class="session-link-row">
            ${inputMarkup}
            ${question.suffix ? `<strong>${esc(question.suffix)}</strong>` : ''}
          </div>
        </label>
      </div>
      <div class="practice-actions">
        <button id="psr-diagnostic-submit" class="btn primary" type="button">Valider ma réponse</button>
        <button id="psr-diagnostic-unknown" class="btn ghost" type="button">Je ne sais pas</button>
        <button id="psr-diagnostic-next" class="btn primary hidden" type="button">${index === PSR_MATHS_DIAGNOSTIC.length - 1 ? 'Terminer' : 'Question suivante'}</button>
      </div>
      <p id="psr-diagnostic-feedback" class="feedback" aria-live="polite"></p>
    </div>`;

  bindPsrMathsSequenceNav();
  const input = $('psr-diagnostic-answer');
  const finishAnswer = async (value, unknown) => {
    const clean = String(value || '').trim();
    if (!unknown && !clean) {
      $('psr-diagnostic-feedback').className = 'feedback bad';
      $('psr-diagnostic-feedback').textContent = 'Entre une réponse ou choisis « Je ne sais pas ».';
      return;
    }
    input.disabled = true;
    $('psr-diagnostic-submit').disabled = true;
    $('psr-diagnostic-unknown').disabled = true;
    await recordPsrDiagnosticAnswer(question, clean, unknown);
    $('psr-diagnostic-feedback').className = 'feedback';
    $('psr-diagnostic-feedback').textContent = unknown
      ? 'Merci. « Je ne sais pas » est enregistré.'
      : 'Réponse enregistrée.';
    show('psr-diagnostic-next', true);
  };

  $('psr-diagnostic-submit').addEventListener('click', () => finishAnswer(input.value, false));
  $('psr-diagnostic-unknown').addEventListener('click', () => finishAnswer('', true));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && question.type !== 'select') {
      event.preventDefault();
      $('psr-diagnostic-submit').click();
    }
  });
  $('psr-diagnostic-next').addEventListener('click', () => renderPsrMathsDiagnostic(index + 1));
  input.focus();
}

async function refreshPsrMathsCorrectionAccess() {
  if (state.previewMode) return true;
  if (!state.joinToken) return false;
  try {
    const { session } = await api(`/api/join?token=${encodeURIComponent(state.joinToken)}`);
    state.joinSession = session;
    return Boolean(session.corrections_unlocked);
  } catch {
    return false;
  }
}

async function renderPsrMathsFinish() {
  await trackEvent('activity_completed', 'psr-maths-rentree-v1', {
    questions:PSR_MATHS_DIAGNOSTIC.length,
  });
  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('diagnostic')}
      <div class="finish-card">
        <p class="eyebrow">Diagnostic terminé</p>
        <h3>Merci ${esc(state.learner.first_name)}.</h3>
        <p class="muted">Il n’y a pas de note affichée ici. Ton professeur voit les réponses question par question et pourra choisir les exercices utiles pour la suite.</p>
        <div class="practice-actions">
          <button id="psr-show-correction" class="btn secondary" type="button">Voir les stratégies</button>
          <button id="psr-start-challenge" class="btn primary" type="button">Continuer vers le défi PSR</button>
          <button id="psr-finish-overview" class="btn ghost" type="button">Voir le parcours</button>
        </div>
        <p id="psr-correction-access-status" class="status" aria-live="polite"></p>
      </div>
    </div>`;
  bindPsrMathsSequenceNav();
  $('psr-show-correction').addEventListener('click', async () => {
    $('psr-correction-access-status').textContent = 'Vérification…';
    const unlocked = await refreshPsrMathsCorrectionAccess();
    renderPsrMathsCorrection({ unlocked });
  });
  $('psr-start-challenge').addEventListener('click', renderPsrMathsChallenge);
  $('psr-finish-overview').addEventListener('click', renderPsrMathsPathwayHome);
}

function psrMathsAnswerLabel(answer) {
  if (!answer) return 'Réponse non disponible sur cet appareil';
  if (answer.unknown) return 'Je ne sais pas';
  return answer.value || '—';
}

function renderPsrMathsCorrection({ unlocked = false } = {}) {
  const teacherPreview = state.previewMode;
  const canShowSolutions = teacherPreview || unlocked;
  const answers = readPsrMathsAnswers();

  $('student-session-message').innerHTML = `
    <div class="learner-stage">
      ${renderPsrMathsSequenceNav('correction')}
      <div class="practice-heading">
        <div>
          <p class="eyebrow">Correction guidée</p>
          <h3>On regarde les stratégies.</h3>
        </div>
        <button id="psr-correction-back" class="btn ghost" type="button">${teacherPreview ? 'Retour à l’aperçu' : 'Retour'}</button>
      </div>
      ${teacherPreview ? '<p class="learner-help">Vue professeur : toutes les stratégies sont visibles, sans activité élève enregistrée.</p>' : ''}
      ${!canShowSolutions ? `
        <div class="callout">
          <strong>Corrigés encore verrouillés</strong>
          <p>Ton professeur ouvrira les solutions au bon moment pour la classe. Tes réponses restent enregistrées.</p>
          <button id="psr-refresh-corrections" class="btn secondary" type="button">Vérifier si les corrigés sont ouverts</button>
        </div>` : ''}
      <div class="report-item-summary">
        ${PSR_MATHS_DIAGNOSTIC.map((question, index) => {
          const answer = answers[question.id];
          const stateLabel = teacherPreview || !answer
            ? ''
            : answer.unknown
              ? 'Je ne sais pas'
              : answer.correct
                ? '✓ Bonne stratégie'
                : '↻ À reprendre';
          return `
            <article class="report-item-row">
              <strong>${index + 1}. ${esc(question.domain)}${stateLabel ? ` · ${esc(stateLabel)}` : ''}</strong>
              <span>${esc(question.prompt)}</span>
              ${teacherPreview ? '' : `<span>Ta réponse : ${esc(psrMathsAnswerLabel(answer))}</span>`}
              ${canShowSolutions ? `<span>Correction : ${esc(question.explanation)}</span>` : '<span>Solution masquée jusqu’au déblocage.</span>'}
            </article>`;
        }).join('')}
      </div>
      <div class="practice-actions">
        <button id="psr-correction-challenge" class="btn primary" type="button">Défi PSR</button>
        <button id="psr-correction-overview" class="btn ghost" type="button">Voir le parcours</button>
      </div>
    </div>`;

  bindPsrMathsSequenceNav();
  $('psr-correction-back').addEventListener('click', () => {
    if (teacherPreview) renderPsrMathsPathwayHome();
    else renderPsrMathsFinish();
  });
  $('psr-correction-challenge').addEventListener('click', renderPsrMathsChallenge);
  $('psr-correction-overview').addEventListener('click', renderPsrMathsPathwayHome);
  $('psr-refresh-corrections')?.addEventListener('click', async () => {
    const nowUnlocked = await refreshPsrMathsCorrectionAccess();
    renderPsrMathsCorrection({ unlocked:nowUnlocked });
  });
}


function showLogin() {
  show('student-view', false); show('login-view', true); show('teacher-view', false); show('logout', false);
}

async function showTeacher() {
  $('student-view').classList.remove('teacher-preview-mode');
  show('teacher-workspace-nav', false);
  leaveFocusedTeacherWorkspace();
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
    <button class="card-button${state.formation?.id === f.id ? ' selected' : ''}" data-formation="${esc(f.id)}" aria-pressed="${state.formation?.id === f.id}">
      <strong>${esc(f.label)}</strong>
      <span>${f.subjects.length} matière${f.subjects.length > 1 ? 's' : ''} disponible${f.subjects.length > 1 ? 's' : ''}</span>
    </button>`).join('');
  $('formation-grid').querySelectorAll('[data-formation]').forEach((button) => {
    button.addEventListener('click', () => selectFormation(button.dataset.formation));
  });
}

function markSelectedCards(containerId, dataKey, selectedId) {
  $(containerId).querySelectorAll(`[data-${dataKey}]`).forEach((button) => {
    const selected = button.dataset[dataKey] === selectedId;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function revealOnNarrowScreen(id) {
  if (!window.matchMedia('(max-width: 760px)').matches) return;
  const element = $(id);
  if (!element) return;
  window.requestAnimationFrame(() => element.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function externalTeacherUrl(tab = '') {
  if (!state.subject?.external_url) return '';
  const url = new URL(state.subject.external_url, window.location.origin);
  if (state.subject.id === 'psr-maths') {
    url.pathname = '/api/sso/start';
    url.search = '';
  }
  if (tab) url.searchParams.set('tab', tab);
  return url.toString();
}

function openExternalTeacher(tab = '') {
  const url = externalTeacherUrl(tab);
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}

function setWorkspaceAction(id, { disabled = false, description = '', status = '', upcoming = false } = {}) {
  const button = $(id);
  button.disabled = disabled;
  const descriptionNode = button.querySelector('.action-description');
  const statusNode = button.querySelector('.action-status');
  if (descriptionNode) descriptionNode.textContent = description;
  if (statusNode) {
    statusNode.textContent = status;
    statusNode.classList.toggle('upcoming', upcoming);
  }
}

function sessionPathwayLabel(session) {
  if (session.subject_id === 'psr-maths') return 'Rentrée · diagnostic';
  if (session.subject_id === 'ada-francais' && session.pathway_id === 'practice-v1') return 'Entraînement';
  if (session.subject_id === 'ada-francais') return 'Positionnement';
  if (session.subject_id === 'ada-maths') return 'Numératie';
  return '';
}

function sessionSupportsCorrections(session) {
  return !(session.subject_id === 'ada-francais' && session.pathway_id === 'practice-v1');
}

function sessionSupportsReports(session) {
  return !(session.subject_id === 'ada-francais' && session.pathway_id === 'practice-v1');
}

function configureSessionPathwayField() {
  const field = $('session-pathway-field');
  const select = $('session-pathway');
  const help = $('session-pathway-help');
  if (state.subject?.id === 'psr-maths') {
    select.innerHTML = '<option value="rentree-v1">Séance 1 — diagnostic de rentrée</option>';
    help.textContent = 'Le diagnostic alimente le suivi et les rapports sans afficher de note à l’élève.';
    show('session-pathway-field', true);
    return;
  }
  if (state.subject?.id === 'ada-francais') {
    select.innerHTML = `
      <option value="positioning-v1">Positionnement — observer les acquis</option>
      <option value="practice-v1">Entraînement — cartes, écoute et Memory</option>`;
    help.textContent = 'Le positionnement alimente les rapports. L’entraînement reste séparé et sans note.';
    show('session-pathway-field', true);
    return;
  }
  if (state.subject?.id === 'ada-maths') {
    select.innerHTML = '<option value="numeracy-v1">Numératie fondamentale</option>';
  } else {
    select.innerHTML = '<option value="default">Parcours par défaut</option>';
  }
  show('session-pathway-field', false);
}

function updateWorkspaceActions() {
  if (!state.subject) return;
  const internal = state.subject.mode === 'internal';
  const external = state.subject.mode === 'external';
  const planned = state.subject.mode === 'planned';
  const subjectSessions = state.sessions.filter((session) => session.subject_id === state.subject.id);
  const correctionSessions = subjectSessions.filter(sessionSupportsCorrections);
  const reportSessions = subjectSessions.filter(sessionSupportsReports);
  const hasSessions = subjectSessions.length > 0;
  const hasActiveSessions = subjectSessions.some((session) => session.active);
  const hasCorrectionSessions = correctionSessions.length > 0;
  const hasActiveCorrectionSessions = correctionSessions.some((session) => session.active);
  const hasReportSessions = reportSessions.length > 0;
  const hasInternalPreview = ['psr-maths', 'ada-francais', 'ada-maths'].includes(state.subject.id);

  if (planned) {
    setWorkspaceAction('show-create-session', { disabled:true, description:'Le parcours doit d’abord être construit.', status:'à construire', upcoming:true });
    setWorkspaceAction('explore-subject', { disabled:true, description:'Inspection disponible une fois le parcours construit.', status:'à construire', upcoming:true });
    setWorkspaceAction('corrections-subject', { disabled:true, description:'Pilotage disponible une fois les activités construites.', status:'à construire', upcoming:true });
    setWorkspaceAction('show-live-sessions', { disabled:true, description:'Le suivi démarrera avec les premières activités.', status:'à construire', upcoming:true });
    setWorkspaceAction('reports-subject', { disabled:true, description:'Les rapports démarreront avec les premières activités.', status:'à construire', upcoming:true });
    return;
  }

  setWorkspaceAction('show-create-session', {
    description: external ? 'Créer ou reprendre une séance directement dans Maths LGC.' : 'Créer un groupe, son lien élève et son QR.',
    status:'disponible'
  });
  setWorkspaceAction('explore-subject', {
    disabled: internal && !hasInternalPreview,
    description: external
      ? 'Inspecter librement le parcours et toutes ses activités.'
      : hasInternalPreview
        ? 'Parcourir toutes les activités sans enregistrer de données élève.'
        : 'La prévisualisation professeur sera ajoutée à ce parcours.',
    status: external || hasInternalPreview ? 'disponible' : 'en cours',
    upcoming: internal && !hasInternalPreview
  });
  setWorkspaceAction('corrections-subject', {
    disabled: internal && !hasActiveCorrectionSessions,
    description: external
      ? 'Verrouiller ou ouvrir les corrigés au moment choisi.'
      : hasActiveCorrectionSessions
        ? 'Verrouiller ou ouvrir les corrigés séance par séance.'
        : hasCorrectionSessions
          ? 'Réouvre une séance de positionnement pour modifier ses corrigés.'
          : hasSessions
            ? 'Les séances d’entraînement n’ont pas de corrigés.'
            : 'Crée d’abord une séance de positionnement pour piloter les corrigés.',
    status: external || hasActiveCorrectionSessions ? 'disponible' : hasCorrectionSessions ? 'séance fermée' : hasSessions ? 'non applicable' : 'après création',
    upcoming: internal && !hasActiveCorrectionSessions
  });
  setWorkspaceAction('show-live-sessions', {
    disabled: internal && !hasActiveSessions,
    description: external
      ? 'Voir les présences, l’avancement, les résultats et le rythme indicatif.'
      : hasActiveSessions
        ? 'Voir qui a commencé et suivre les premières activités.'
        : hasSessions
          ? 'Réouvre une séance pour reprendre le suivi en direct.'
          : 'Crée d’abord une séance pour démarrer le suivi.',
    status: external || hasActiveSessions ? 'disponible' : hasSessions ? 'séance fermée' : 'après création',
    upcoming: internal && !hasActiveSessions
  });
  setWorkspaceAction('reports-subject', {
    disabled: internal && !hasReportSessions,
    description: internal && hasSessions && !hasReportSessions
      ? 'Les entraînements sont volontairement exclus des rapports de positionnement.'
      : 'Synthèse du groupe, détail individuel et comparaison descriptive.',
    status: external || hasReportSessions ? 'V1' : hasSessions ? 'positionnement uniquement' : 'après création',
    upcoming: internal && !hasReportSessions
  });
}

function selectFormation(id) {
  state.formation = state.formations.find((f) => f.id === id) || null;
  state.subject = null;
  if (!state.formation) return;

  renderFormations();
  $('subjects-title').textContent = `${state.formation.label} · matières`;
  $('subject-grid').innerHTML = state.formation.subjects.map((s) => `
    <button class="card-button" data-subject="${esc(s.id)}" aria-pressed="false">
      <strong>${esc(s.label)}</strong>
      <span>${esc(s.description)}</span>
      ${s.mode === 'planned' ? '<span class="pill">à construire</span>' : s.mode === 'external' ? '<span class="pill">cours existant</span>' : ''}
    </button>`).join('');
  $('subject-grid').querySelectorAll('[data-subject]').forEach((button) => {
    button.addEventListener('click', () => selectSubject(button.dataset.subject));
  });
  show('subjects-panel', true);
  show('subject-workspace', false);
  renderRecentSessions();
  revealOnNarrowScreen('subjects-panel');
}

function selectSubject(id) {
  state.subject = state.formation?.subjects.find((s) => s.id === id) || null;
  if (!state.subject) return;

  markSelectedCards('subject-grid', 'subject', id);
  $('workspace-title').textContent = `${state.formation.label} · ${state.subject.label}`;
  $('workspace-description').textContent = state.subject.description;
  if (state.subject.external_url) {
    $('external-course').href = externalTeacherUrl();
    $('external-course').textContent = 'Ouvrir Maths LGC · professeur';
    show('external-course', true);
  } else {
    show('external-course', false);
  }

  show('subject-workspace', true);
  show('session-form', false);
  configureSessionPathwayField();
  updateWorkspaceActions();
  renderRecentSessions();
  revealOnNarrowScreen('subject-workspace');
}

function teacherHasSubject(subjectId) {
  return state.formations.some((formation) =>
    formation.subjects.some((subject) => subject.id === subjectId)
  );
}

function recentSessionTimestamp(session) {
  const value = Date.parse(session.updated_at || session.created_at || '');
  return Number.isFinite(value) ? value : 0;
}

function recentSessionDate(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime()) ? date.toLocaleString('fr-FR') : 'date inconnue';
}

function visibleRecentSessions() {
  let sessions = [...state.sessions, ...state.externalSessions];
  if (state.subject) {
    sessions = sessions.filter((session) => session.subject_id === state.subject.id);
  } else if (state.formation) {
    sessions = sessions.filter((session) => session.formation_id === state.formation.id);
  }
  return sessions
    .sort((a, b) => {
      const activeDelta = Number(Boolean(b.active)) - Number(Boolean(a.active));
      if (activeDelta) return activeDelta;
      return recentSessionTimestamp(b) - recentSessionTimestamp(a);
    })
    .slice(0, 8);
}

function renderRecentSessions() {
  const sessions = visibleRecentSessions();
  const panel = $('recent-sessions-panel');
  panel.classList.toggle('is-empty', !sessions.length);

  if (!sessions.length) {
    const mathsRelevant = state.subject
      ? state.subject.id === 'psr-maths'
      : !state.formation || state.formation.id === 'psr';
    const externalLoading = mathsRelevant && state.externalSessionsStatus === 'loading';
    const externalError = mathsRelevant && state.externalSessionsStatus === 'error';
    const title = externalLoading
      ? 'Chargement des séances récentes…'
      : externalError
        ? 'Séances Maths temporairement indisponibles'
        : state.subject
          ? 'Pas encore de séance pour cette matière'
          : state.formation
            ? 'Pas encore de séance pour cette formation'
            : 'Pas encore de séance';
    const detail = externalLoading
      ? 'Le portail récupère les séances liées à ton identité enseignant.'
      : externalError
        ? 'Tu peux toujours ouvrir Maths LGC directement ; réessaie ici dans un instant.'
        : 'Les séances ouvertes apparaissent ici en priorité pour pouvoir les reprendre rapidement.';
    $('sessions-list').innerHTML = `
      <div class="empty-sessions">
        <span class="empty-sessions-icon" aria-hidden="true">○</span>
        <div>
          <strong>${esc(title)}</strong>
          <span>${esc(detail)}</span>
        </div>
      </div>`;
    return;
  }

  $('sessions-list').innerHTML = sessions.map((session) => {
    const externalMaths = session.source === 'maths';
    const internalNative = !externalMaths && ['psr-maths', 'ada-francais', 'ada-maths'].includes(session.subject_id);
    const supportsCorrections = internalNative && sessionSupportsCorrections(session);
    const supportsReports = internalNative && sessionSupportsReports(session);
    const pathwayLabel = externalMaths ? 'Ancien Maths LGC' : sessionPathwayLabel(session);
    const lifecycleLabel = session.active ? 'ouverte' : 'fermée';
    const createdLabel = recentSessionDate(session.created_at);
    let actions = '';

    const focused = document.body.dataset.teacherWorkspace || '';
    if (externalMaths) {
      let legacyUrl = session.manage_url;
      try {
        const url = new URL(session.manage_url, window.location.origin);
        if (focused === 'corrections') url.searchParams.set('tab', 'corrections');
        else if (focused === 'reports') url.searchParams.set('tab', 'reports');
        else url.searchParams.set('tab', 'live');
        legacyUrl = url.toString();
      } catch { /* keep the server-provided URL */ }
      const label = focused === 'corrections'
        ? 'Gérer les anciens corrigés'
        : focused === 'reports'
          ? 'Voir l’ancien rapport'
          : session.active ? 'Ouvrir l’ancienne séance' : 'Ouvrir l’archive Maths';
      actions = `<a class="btn primary" href="${esc(legacyUrl)}" target="_blank" rel="noopener">${label}</a>`;
    } else {
      const showLive = !focused || focused === 'live';
      const showCorrections = !focused || focused === 'corrections';
      const showReports = !focused || focused === 'reports';
      const showSessionTools = !focused || focused === 'seances';

      if (showLive && internalNative && session.active) {
        actions += `<button class="btn primary" data-live="${esc(session.id)}">Suivi en direct</button>`;
      }
      if (showCorrections && supportsCorrections && session.active) {
        actions += `<button class="btn secondary" data-corrections="${esc(session.id)}" data-unlocked="${session.corrections_unlocked ? '1' : '0'}">Corrigés : ${session.corrections_unlocked ? 'ouverts' : 'verrouillés'}</button>`;
      }
      if (showReports && supportsReports) {
        actions += `<button class="btn secondary" data-report="${esc(session.id)}">Rapport</button>`;
      }
      if (showSessionTools && session.active) {
        actions += `<button class="btn ghost" data-copy="${esc(session.join_url)}">Copier le lien élève</button>`;
        actions += `<a class="btn secondary" href="/api/sessions/${encodeURIComponent(session.id)}/qr.svg" target="_blank" rel="noopener">QR</a>`;
      }
      if (showSessionTools) {
        actions += `<button class="btn ghost ${session.active ? 'danger' : ''}" data-session-active="${esc(session.id)}" data-active="${session.active ? '1' : '0'}">${session.active ? 'Fermer la séance' : 'Réouvrir'}</button>`;
      }
    }

    return `
    <article class="session-row${session.active ? '' : ' is-closed'}">
      <div class="meta">
        <div class="session-title-line">
          <strong>${esc(session.formation_label)} · ${esc(session.subject_label)} · Séance ${session.session_number}${session.title ? ` · ${esc(session.title)}` : ''}</strong>
          ${pathwayLabel ? `<span class="pill">${esc(pathwayLabel)}</span>` : ''}
          <span class="pill session-state ${session.active ? 'active' : 'closed'}">Séance ${lifecycleLabel}</span>
        </div>
        <small>${esc(session.group_label)} · créée ${esc(createdLabel)}${session.active ? '' : ' · accès élève fermé'}</small>
      </div>
      <div class="session-actions">${actions}</div>
    </article>`;
  }).join('');

  $('sessions-list').querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      const original = button.textContent;
      button.textContent = 'Copié ✓';
      setTimeout(() => { button.textContent = original; }, 1400);
    });
  });
  $('sessions-list').querySelectorAll('[data-live]').forEach((button) => {
    button.addEventListener('click', () => openLiveView(button.dataset.live));
  });
  $('sessions-list').querySelectorAll('[data-corrections]').forEach((button) => {
    button.addEventListener('click', () => toggleSessionCorrections(button.dataset.corrections, button.dataset.unlocked !== '1'));
  });
  $('sessions-list').querySelectorAll('[data-report]').forEach((button) => {
    button.addEventListener('click', () => openSessionReport(button.dataset.report));
  });
  $('sessions-list').querySelectorAll('[data-session-active]').forEach((button) => {
    button.addEventListener('click', () => setSessionActive(button.dataset.sessionActive, button.dataset.active !== '1'));
  });
}

async function loadExternalMathsSessions() {
  if (!teacherHasSubject('psr-maths')) {
    state.externalSessions = [];
    state.externalSessionsStatus = 'done';
    renderRecentSessions();
    return;
  }
  state.externalSessionsStatus = 'loading';
  renderRecentSessions();
  try {
    const { sessions } = await api('/api/external/maths/sessions');
    state.externalSessions = Array.isArray(sessions) ? sessions : [];
    state.externalSessionsStatus = 'done';
  } catch {
    state.externalSessions = [];
    state.externalSessionsStatus = 'error';
  }
  renderRecentSessions();
}

async function loadSessions() {
  const { sessions } = await api('/api/sessions');
  state.sessions = sessions;
  updateWorkspaceActions();
  renderRecentSessions();
  await loadExternalMathsSessions();
}
async function setSessionActive(sessionId, active) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  if (!active) {
    const label = `${session.formation_label} · ${session.subject_label} · ${session.group_label}`;
    const ok = confirm(
      `Fermer la séance « ${label} » ?\n\nLe lien et le QR élève cesseront immédiatement de fonctionner. Les résultats et rapports restent conservés, et tu pourras réouvrir la séance plus tard. Les corrigés seront reverrouillés.`
    );
    if (!ok) return;
  }
  try {
    await api(`/api/sessions/${encodeURIComponent(sessionId)}/active`, {
      method:'POST',
      body:JSON.stringify({ active }),
    });
    if (!active && state.liveSessionId === sessionId && $('live-dialog').open) {
      $('live-dialog').close();
    }
    await loadSessions();
  } catch (error) {
    window.alert(`Impossible de ${active ? 'réouvrir' : 'fermer'} la séance : ${error.message}`);
  }
}

function stopLiveTimer() {
  if (state.liveTimer) window.clearTimeout(state.liveTimer);
  state.liveTimer = null;
}

function scheduleLivePolling() {
  stopLiveTimer();
  if (!state.liveSessionId || !$('live-dialog').open || document.hidden) return;
  state.liveTimer = window.setTimeout(() => refreshLiveView({ automatic:true }), 4000);
}

async function openLiveView(sessionId) {
  clearLivePolling();
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session?.active) {
    window.alert('Cette séance est fermée. Réouvre-la avant de lancer le suivi en direct.');
    return;
  }
  state.liveSessionId = sessionId;
  $('live-title').textContent = session ? `${session.formation_label} · ${session.subject_label} · Séance ${session.session_number}` : 'Séance';
  $('live-context').textContent = session ? `${session.group_label}${session.title ? ` · ${session.title}` : ''}` : '';
  $('live-learners').innerHTML = '';
  $('roster-manage-list').innerHTML = '';
  $('live-status').textContent = 'Chargement…';
  $('roster-input').value = '';
  $('roster-status').textContent = '';
  $('live-dialog').showModal();
  await refreshLiveView();
}

function subjectCompletionCount(subjectId) {
  if (subjectId === 'ada-francais') return 8;
  if (subjectId === 'ada-maths') return 6;
  return 1;
}

function psrMathsLiveProgressLabel(learner) {
  const diagnosticIds = PSR_MATHS_DIAGNOSTIC.map((question) => question.id);
  const challengeIds = ['psr-challenge-factor','psr-challenge-time','psr-challenge-revenue'];
  const diagnostic = diagnosticIds.filter((id) => learnerItem(learner, id).completed).length;
  const challenge = challengeIds.filter((id) => learnerItem(learner, id).completed).length;
  const modules = PSR_MATHS_MODULES.filter((module) =>
    learnerItem(learner, `psr-module-${module.id}-v1`).completed
  ).length;
  return `Diagnostic ${diagnostic}/10 · Défi ${challenge}/3${modules ? ` · ${modules} module${modules > 1 ? 's' : ''}` : ''}`;
}

async function refreshLiveView({ automatic = false } = {}) {
  const sessionId = state.liveSessionId;
  if (!sessionId || !$('live-dialog').open || state.livePollInFlight) return;
  state.livePollInFlight = true;
  try {
    const { learners, started_count: startedCount } = await api(`/api/sessions/${encodeURIComponent(sessionId)}/activity`);
    if (state.liveSessionId !== sessionId || !$('live-dialog').open) return;
    const liveSession = state.sessions.find((session) => session.id === sessionId);
    const completionTarget = subjectCompletionCount(liveSession?.subject_id);
    state.liveLearners = learners;
    renderRosterManage(learners);
    if (!learners.length) {
      $('live-status').textContent = 'Ajoute la liste des élèves pour préparer la séance.';
      $('live-learners').innerHTML = '<p class="muted">Aucun élève dans la liste pour le moment.</p>';
      return;
    }
    $('live-status').textContent = `${startedCount} sur ${learners.length} ont commencé`;
    $('live-learners').innerHTML = learners.map((learner) => `
      <article class="live-row">
        <div>
          <strong>${esc(learner.first_name)}${learner.last_name ? ` ${esc(learner.last_name)}` : ''}</strong>
          <small>${learner.started
            ? `Dernière activité ${new Date(learner.last_activity_at).toLocaleTimeString('fr-FR')}`
            : 'Pas encore commencé'}</small>
        </div>
        <div class="progress-badge ${learner.started ? '' : 'waiting'}">
          ${learner.started
            ? liveSession?.subject_id === 'psr-maths'
              ? psrMathsLiveProgressLabel(learner)
              : `${learner.completed_items}/${completionTarget} étapes · ${learner.correct_answers}/${learner.attempts} réponses justes`
            : 'En attente'}
        </div>
      </article>`).join('');
  } catch (error) {
    if (!automatic) $('live-status').textContent = error.message;
  } finally {
    state.livePollInFlight = false;
    if (state.liveSessionId === sessionId) scheduleLivePolling();
  }
}

function renderRosterManage(learners) {
  const box = $('roster-manage-list');
  if (!learners.length) {
    box.innerHTML = '<p class="muted">La liste est vide.</p>';
    return;
  }
  box.innerHTML = learners.map((learner) => `
    <article class="roster-manage-row">
      <div>
        <strong>${esc(learner.first_name)}${learner.last_name ? ` ${esc(learner.last_name)}` : ''}</strong>
        <small>${learner.started ? 'A déjà commencé · suppression bloquée' : 'Pas encore commencé'}</small>
      </div>
      <div class="roster-manage-actions">
        <button class="btn ghost" type="button" data-roster-edit="${esc(learner.id)}">Modifier</button>
        <button class="btn ghost danger" type="button" data-roster-remove="${esc(learner.id)}" ${learner.started ? 'disabled title="Le travail de cet élève est déjà commencé."' : ''}>Retirer</button>
      </div>
    </article>`).join('');
  box.querySelectorAll('[data-roster-edit]').forEach((button) => {
    button.addEventListener('click', () => openRosterEdit(button.dataset.rosterEdit));
  });
  box.querySelectorAll('[data-roster-remove]').forEach((button) => {
    button.addEventListener('click', () => removeRosterLearner(button.dataset.rosterRemove));
  });
}

function openRosterEdit(learnerId) {
  const learner = state.liveLearners.find((item) => item.id === learnerId);
  if (!learner) return;
  $('roster-edit-id').value = learner.id;
  $('roster-edit-first-name').value = learner.first_name;
  $('roster-edit-last-name').value = learner.last_name || '';
  $('roster-edit-status').textContent = '';
  $('roster-edit-dialog').showModal();
}

async function saveRosterEdit() {
  const learnerId = $('roster-edit-id').value;
  $('roster-edit-status').textContent = '';
  $('roster-edit-save').disabled = true;
  try {
    await api(`/api/sessions/${encodeURIComponent(state.liveSessionId)}/learners/update`, {
      method:'POST',
      body:JSON.stringify({
        learner_id: learnerId,
        first_name: $('roster-edit-first-name').value,
        last_name: $('roster-edit-last-name').value,
      }),
    });
    $('roster-edit-dialog').close();
    await refreshLiveView();
  } catch (error) {
    $('roster-edit-status').textContent = error.message;
  } finally {
    $('roster-edit-save').disabled = false;
  }
}

async function removeRosterLearner(learnerId) {
  const learner = state.liveLearners.find((item) => item.id === learnerId);
  if (!learner || learner.started) return;
  if (!confirm(`Retirer ${learner.first_name}${learner.last_name ? ` ${learner.last_name}` : ''} de cette séance ?`)) return;
  try {
    await api(`/api/sessions/${encodeURIComponent(state.liveSessionId)}/learners/remove`, {
      method:'POST',
      body:JSON.stringify({ learner_id: learnerId }),
    });
    await refreshLiveView();
  } catch (error) {
    $('roster-status').textContent = error.message;
  }
}

function parseRosterInput(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[;\t]/).map((part) => part.trim());
      return {
        first_name: parts.shift() || '',
        last_name: parts.filter(Boolean).join(' '),
      };
    })
    .filter((learner) => learner.first_name);
}

async function addRosterLearners() {
  const learners = parseRosterInput($('roster-input').value);
  $('roster-status').textContent = '';
  if (!learners.length) {
    $('roster-status').textContent = 'Ajoute au moins un prénom.';
    return;
  }
  $('add-roster').disabled = true;
  try {
    const result = await api(`/api/sessions/${encodeURIComponent(state.liveSessionId)}/learners`, {
      method: 'POST',
      body: JSON.stringify({ learners }),
    });
    const createdLabel = `${result.created} ajouté${result.created > 1 ? 's' : ''}`;
    const skippedLabel = result.skipped ? ` · ${result.skipped} déjà présent${result.skipped > 1 ? 's' : ''}` : '';
    $('roster-status').textContent = createdLabel + skippedLabel;
    if (result.created) $('roster-input').value = '';
    await refreshLiveView();
  } catch (error) {
    $('roster-status').textContent = error.message;
  } finally {
    $('add-roster').disabled = false;
  }
}

function clearLivePolling() {
  stopLiveTimer();
  state.liveSessionId = null;
  state.liveLearners = [];
  state.livePollInFlight = false;
}

async function toggleSessionCorrections(sessionId, unlocked) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session?.active) {
    window.alert('Cette séance est fermée. Réouvre-la avant de modifier les corrigés.');
    return;
  }
  if (unlocked && !confirm('Ouvrir les corrigés pour les élèves de cette séance ?')) return;
  try {
    await api(`/api/sessions/${encodeURIComponent(sessionId)}/corrections`, {
      method:'POST',
      body:JSON.stringify({ unlocked }),
    });
    await loadSessions();
  } catch (error) {
    window.alert(`Impossible de modifier les corrigés : ${error.message}`);
  }
}

const ADA_ITEM_LABELS = {
  'oral-comprehension': 'Compréhension orale',
  'own-name': 'Reconnaissance du prénom',
  'first-letter': 'Première lettre du prénom',
  'visual-discrimination': 'Discrimination visuelle',
  'sound-letter-guided': 'Association son → lettre guidée',
  'useful-word': 'Reconnaissance du mot SORTIE',
  'writing-gesture': 'Geste d’écriture essayé',
  'positioning-v1': 'Positionnement terminé',
};

function adaItemLabel(itemId) {
  return ADA_ITEM_LABELS[itemId] || itemId || 'Activité';
}

function learnerItem(learner, itemId) {
  return (learner.items && learner.items[itemId]) || { attempts:0, correct_answers:0, completed:false };
}

function stageReportLabel(learner, itemId) {
  const item = learnerItem(learner, itemId);
  if (item.completed) return 'Terminé';
  if (item.attempts) return 'En cours';
  return '—';
}

function buildActivityReport(activity, completionItemId) {
  const learners = activity.learners || [];
  const finished = learners.filter((learner) => learnerItem(learner, completionItemId).completed).length;
  const attempts = learners.reduce((sum, learner) => sum + Number(learner.attempts || 0), 0);
  const correct = learners.reduce((sum, learner) => sum + Number(learner.correct_answers || 0), 0);
  const unknown = learners.reduce((sum, learner) => sum + Number(learner.unknown_answers || 0), 0);
  return {
    ...activity, learners,
    rosterCount: learners.length,
    startedCount: Number(activity.started_count || 0),
    finishedCount: finished,
    attempts, correct, unknown,
  };
}

function buildPsrMathsReport(activity) {
  return buildActivityReport(activity, 'psr-maths-rentree-v1');
}

function buildAdaReport(activity) {
  return buildActivityReport(activity, 'positioning-v1');
}

function buildNumeracyReport(activity) {
  return buildActivityReport(activity, 'numeracy-v1');
}

function setReportLearnerHeaders(labels) {
  const row = $('report-detail').querySelector('thead tr');
  row.innerHTML = labels.map((label) => `<th>${esc(label)}</th>`).join('');
}

function reportMetric(label, value) {
  return `<div class="report-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

async function openReports(preferredSessionId = '') {
  if (!state.subject || state.subject.mode !== 'internal') return;
  if (state.subject.id === 'psr-maths') {
    return openReportCollection(buildPsrMathsReport, renderPsrMathsReportDetail, preferredSessionId);
  }
  if (state.subject.id === 'ada-francais') {
    return openReportCollection(buildAdaReport, renderAdaReportDetail, preferredSessionId);
  }
  if (state.subject.id === 'ada-maths') {
    return openReportCollection(buildNumeracyReport, renderNumeracyReportDetail, preferredSessionId);
  }
}

async function openSessionReport(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session || !['psr-maths', 'ada-francais', 'ada-maths'].includes(session.subject_id) || !sessionSupportsReports(session)) return;
  if (state.formation?.id !== session.formation_id) selectFormation(session.formation_id);
  if (state.subject?.id !== session.subject_id) selectSubject(session.subject_id);
  await openReports(sessionId);
}

async function openReportCollection(buildReport, renderDetail, preferredSessionId = '') {
  if (!state.subject || state.subject.mode !== 'internal') return;
  $('reports-title').textContent = `${state.formation.label} · ${state.subject.label}`;
  $('reports-context').textContent = 'Synthèse des séances auxquelles tu as accès.';
  $('reports-status').textContent = 'Préparation des rapports…';
  $('report-session-grid').innerHTML = '';
  show('report-detail', false);
  show('report-comparison', false);
  state.reportSessionId = null;
  $('reports-dialog').showModal();

  const sessions = state.sessions.filter(
    (session) => session.subject_id === state.subject.id && sessionSupportsReports(session)
  );
  if (!sessions.length) {
    $('reports-status').textContent = 'Crée une première séance pour produire un rapport.';
    return;
  }
  const settled = await Promise.allSettled(
    sessions.map((session) => api(`/api/sessions/${encodeURIComponent(session.id)}/activity`))
  );
  const reports = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => buildReport(result.value));

  if (!reports.length) {
    $('reports-status').textContent = 'Aucun rapport n’a pu être chargé pour le moment.';
    return;
  }

  $('reports-status').textContent = `${reports.length} séance${reports.length > 1 ? 's' : ''} disponible${reports.length > 1 ? 's' : ''}.`;
  $('report-session-grid').innerHTML = reports.map((report) => `
    <article class="report-session-card">
      <div class="report-session-head">
        <div>
          <strong>${esc(report.session.group_label)}</strong>
          <small>Séance ${report.session.session_number}${report.session.title ? ` · ${esc(report.session.title)}` : ''}</small>
        </div>
        <button class="btn secondary" type="button" data-report-session="${esc(report.session.id)}">Détail</button>
      </div>
      <div class="report-metrics">
        ${reportMetric('Liste', String(report.rosterCount))}
        ${reportMetric('Commencé', `${report.startedCount}/${report.rosterCount}`)}
        ${reportMetric('Terminé', `${report.finishedCount}/${report.rosterCount}`)}
        ${reportMetric('Réponses justes', report.attempts ? `${report.correct}/${report.attempts}` : '—')}
      </div>
    </article>`).join('');

  $('report-session-grid').querySelectorAll('[data-report-session]').forEach((button) => {
    button.addEventListener('click', () => {
      const report = reports.find((item) => item.session.id === button.dataset.reportSession);
      if (report) renderDetail(report);
    });
  });
  renderAdaReportComparison(reports);
  if (preferredSessionId) {
    const preferred = reports.find((report) => report.session.id === preferredSessionId);
    if (preferred) renderDetail(preferred);
  }
}

const PSR_MATHS_ITEM_LABELS = Object.fromEntries(
  PSR_MATHS_DIAGNOSTIC.map((item, index) => [item.id, `${index + 1}. ${item.domain}`])
);
PSR_MATHS_ITEM_LABELS['psr-maths-rentree-v1'] = 'Diagnostic terminé';
PSR_MATHS_ITEM_LABELS['psr-challenge-factor'] = 'Défi · coefficient de proportionnalité';
PSR_MATHS_ITEM_LABELS['psr-challenge-time'] = 'Défi · heure de départ';
PSR_MATHS_ITEM_LABELS['psr-challenge-revenue'] = 'Défi · chiffre d’affaires';
PSR_MATHS_ITEM_LABELS['psr-maths-challenge-v1'] = 'Défi PSR terminé';
PSR_MATHS_ITEM_LABELS['psr-module-durees-v1'] = 'Module Durées terminé';
PSR_MATHS_ITEM_LABELS['psr-module-recettes-v1'] = 'Module Recettes terminé';
PSR_MATHS_ITEM_LABELS['psr-module-pourcentages-v1'] = 'Module Pourcentages terminé';
PSR_MATHS_ITEM_LABELS['psr-module-donnees-v1'] = 'Module Données terminé';
PSR_MATHS_ITEM_LABELS['psr-module-equations-v1'] = 'Module Équations terminé';
PSR_MATHS_ITEM_LABELS['psr-module-fonctions-v1'] = 'Module Graphiques terminé';

function renderPsrMathsReportDetail(report) {
  state.reportSessionId = report.session.id;
  setReportLearnerHeaders(['Élève','Diagnostic','Je ne sais pas','Défi PSR','Modules','État']);
  const challengeFinishedCount = report.learners.filter((learner) =>
    learnerItem(learner, 'psr-maths-challenge-v1').completed
  ).length;
  $('report-detail-title').textContent = report.session.group_label;
  $('report-detail-meta').textContent = `Séance ${report.session.session_number}${report.session.title ? ` · ${report.session.title}` : ''}`;
  $('report-detail-metrics').innerHTML = [
    reportMetric('Liste', String(report.rosterCount)),
    reportMetric('Commencé', `${report.startedCount}/${report.rosterCount}`),
    reportMetric('Diagnostic terminé', `${report.finishedCount}/${report.rosterCount}`),
    reportMetric('Défi terminé', `${challengeFinishedCount}/${report.rosterCount}`),
    reportMetric('Je ne sais pas', String(report.unknown || 0)),
  ].join('');

  const ids = [
    ...PSR_MATHS_DIAGNOSTIC.map((item) => item.id),
    'psr-maths-rentree-v1',
    'psr-challenge-factor','psr-challenge-time','psr-challenge-revenue','psr-maths-challenge-v1',
    ...PSR_MATHS_NATIVE_MODULE_IDS.map((id) => `psr-module-${id}-v1`)
  ];
  const items = (report.items || []).filter((item) => ids.includes(item.item_id));
  $('report-item-summary').innerHTML = items.map((item) => `
    <div class="report-item-row">
      <strong>${esc(PSR_MATHS_ITEM_LABELS[item.item_id] || item.item_id)}</strong>
      <span>${item.completed_count}/${report.rosterCount} terminé</span>
      <span>${item.attempts ? `${item.correct_answers}/${item.attempts} justes` : 'pas de réponse'}</span>
      <span>${item.unknown_answers ? `${item.unknown_answers} « je ne sais pas »` : ''}</span>
    </div>`).join('');

  $('report-learner-rows').innerHTML = report.learners.map((learner) => {
    const challengeItems = ['psr-challenge-factor','psr-challenge-time','psr-challenge-revenue'];
    const challengeAttempts = challengeItems.reduce((sum, id) => sum + learnerItem(learner, id).attempts, 0);
    const challengeCorrect = challengeItems.reduce((sum, id) => sum + learnerItem(learner, id).correct_answers, 0);
    const diagnosticDone = learnerItem(learner, 'psr-maths-rentree-v1').completed;
    const challengeDone = learnerItem(learner, 'psr-maths-challenge-v1').completed;
    const moduleDone = PSR_MATHS_NATIVE_MODULE_IDS.filter((id) =>
      learnerItem(learner, `psr-module-${id}-v1`).completed
    ).length;
    return `
      <tr>
        <td>${esc(learner.first_name)}${learner.last_name ? ` ${esc(learner.last_name)}` : ''}</td>
        <td>${diagnosticDone ? 'Terminé' : learner.started ? 'En cours' : '—'}</td>
        <td>${learner.unknown_answers || 0}</td>
        <td>${challengeAttempts ? `${challengeCorrect}/${challengeAttempts}` : '—'}</td>
        <td>${moduleDone ? `${moduleDone}/${PSR_MATHS_NATIVE_MODULE_IDS.length}` : '—'}</td>
        <td>${moduleDone ? 'Modules en cours' : challengeDone ? 'Défi terminé' : diagnosticDone ? 'Diagnostic terminé' : learner.started ? 'En cours' : '—'}</td>
      </tr>`;
  }).join('');
  show('report-detail', true);
  $('report-detail').scrollIntoView({ behavior:'smooth', block:'start' });
}

function renderAdaReportDetail(report) {
  setReportLearnerHeaders([
    'Élève','Écoute','Prénom','Première lettre','Discrimination visuelle',
    'Son → lettre guidé','Mot utile','Geste d’écriture','Terminé','Réponses'
  ]);
  state.reportSessionId = report.session.id;
  $('report-detail-title').textContent = report.session.group_label;
  $('report-detail-meta').textContent = `Séance ${report.session.session_number}${report.session.title ? ` · ${report.session.title}` : ''}`;
  $('report-detail-metrics').innerHTML = [
    reportMetric('Liste', String(report.rosterCount)),
    reportMetric('Commencé', `${report.startedCount}/${report.rosterCount}`),
    reportMetric('Positionnement terminé', `${report.finishedCount}/${report.rosterCount}`),
    reportMetric('Réponses justes', report.attempts ? `${report.correct}/${report.attempts}` : '—'),
  ].join('');

  const items = (report.items || []).filter((item) => [
    'oral-comprehension','own-name','first-letter','visual-discrimination',
    'sound-letter-guided','useful-word','writing-gesture','positioning-v1'
  ].includes(item.item_id));
  $('report-item-summary').innerHTML = items.map((item) => `
    <div class="report-item-row">
      <strong>${esc(adaItemLabel(item.item_id))}</strong>
      <span>${item.completed_count}/${report.rosterCount} terminé</span>
      <span>${item.attempts ? `${item.correct_answers}/${item.attempts} justes` : 'pas de réponse'}</span>
      <span>${item.item_id === 'first-letter'
        ? 'lettre nommée, pas décodage'
        : item.item_id === 'sound-letter-guided'
          ? 'association explicitement guidée'
          : item.item_id === 'writing-gesture'
            ? 'geste essayé, non évalué'
            : ''}</span>
    </div>`).join('');

  $('report-learner-rows').innerHTML = report.learners.map((learner) => `
    <tr>
      <td>${esc(learner.first_name)}${learner.last_name ? ` ${esc(learner.last_name)}` : ''}</td>
      <td>${esc(stageReportLabel(learner, 'oral-comprehension'))}</td>
      <td>${esc(stageReportLabel(learner, 'own-name'))}</td>
      <td>${esc(stageReportLabel(learner, 'first-letter'))}</td>
      <td>${esc(stageReportLabel(learner, 'visual-discrimination'))}</td>
      <td>${esc(stageReportLabel(learner, 'sound-letter-guided'))}</td>
      <td>${esc(stageReportLabel(learner, 'useful-word'))}</td>
      <td>${esc(stageReportLabel(learner, 'writing-gesture'))}</td>
      <td>${learnerItem(learner, 'positioning-v1').completed ? 'Oui' : '—'}</td>
      <td>${learner.attempts ? `${learner.correct_answers}/${learner.attempts}` : '—'}</td>
    </tr>`).join('');
  show('report-detail', true);
  $('report-detail').scrollIntoView({ behavior:'smooth', block:'start' });
}

const NUMERACY_ITEM_LABELS = {
  'quantity-counting': 'Quantité concrète',
  'spoken-number': 'Nombre entendu → chiffre',
  'compare-quantities': 'Comparer deux quantités',
  'concrete-addition': 'Addition concrète',
  'money-amount': 'Montant écrit',
  'numeracy-v1': 'Positionnement terminé',
};

function numeracyItemLabel(itemId) {
  return NUMERACY_ITEM_LABELS[itemId] || itemId || 'Activité';
}

function renderNumeracyReportDetail(report) {
  state.reportSessionId = report.session.id;
  setReportLearnerHeaders([
    'Élève','Quantités','Chiffre entendu','Plus / moins','Addition','Argent','Terminé','Réponses'
  ]);
  $('report-detail-title').textContent = report.session.group_label;
  $('report-detail-meta').textContent = `Séance ${report.session.session_number}${report.session.title ? ` · ${report.session.title}` : ''}`;
  $('report-detail-metrics').innerHTML = [
    reportMetric('Liste', String(report.rosterCount)),
    reportMetric('Commencé', `${report.startedCount}/${report.rosterCount}`),
    reportMetric('Positionnement terminé', `${report.finishedCount}/${report.rosterCount}`),
    reportMetric('Réponses justes', report.attempts ? `${report.correct}/${report.attempts}` : '—'),
  ].join('');

  const ids = ['quantity-counting','spoken-number','compare-quantities','concrete-addition','money-amount','numeracy-v1'];
  const items = (report.items || []).filter((item) => ids.includes(item.item_id));
  $('report-item-summary').innerHTML = items.map((item) => `
    <div class="report-item-row">
      <strong>${esc(numeracyItemLabel(item.item_id))}</strong>
      <span>${item.completed_count}/${report.rosterCount} terminé</span>
      <span>${item.attempts ? `${item.correct_answers}/${item.attempts} justes` : 'pas de réponse'}</span>
      <span>${item.item_id === 'concrete-addition'
        ? 'situation concrète, pas calcul écrit'
        : item.item_id === 'money-amount'
          ? 'reconnaissance du montant présenté'
          : ''}</span>
    </div>`).join('');

  $('report-learner-rows').innerHTML = report.learners.map((learner) => `
    <tr>
      <td>${esc(learner.first_name)}${learner.last_name ? ` ${esc(learner.last_name)}` : ''}</td>
      <td>${esc(stageReportLabel(learner, 'quantity-counting'))}</td>
      <td>${esc(stageReportLabel(learner, 'spoken-number'))}</td>
      <td>${esc(stageReportLabel(learner, 'compare-quantities'))}</td>
      <td>${esc(stageReportLabel(learner, 'concrete-addition'))}</td>
      <td>${esc(stageReportLabel(learner, 'money-amount'))}</td>
      <td>${learnerItem(learner, 'numeracy-v1').completed ? 'Oui' : '—'}</td>
      <td>${learner.attempts ? `${learner.correct_answers}/${learner.attempts}` : '—'}</td>
    </tr>`).join('');
  show('report-detail', true);
  $('report-detail').scrollIntoView({ behavior:'smooth', block:'start' });
}

function renderAdaReportComparison(reports) {
  const groups = new Map();
  reports.forEach((report) => {
    const key = `${report.session.session_number}|${normalized(report.session.title)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(report);
  });
  const comparable = [...groups.values()].filter((group) => group.length >= 2);
  if (!comparable.length) {
    show('report-comparison', false);
    return;
  }
  $('report-comparison-content').innerHTML = comparable.map((group) => `
    <div class="report-comparison-wrap">
      <table class="report-comparison-table">
        <thead><tr><th>Groupe</th><th>Liste</th><th>Commencé</th><th>Terminé</th><th>Réponses justes</th></tr></thead>
        <tbody>
          ${group.map((report) => `<tr>
            <td>${esc(report.session.group_label)}</td>
            <td>${report.rosterCount}</td>
            <td>${report.startedCount}/${report.rosterCount}</td>
            <td>${report.finishedCount}/${report.rosterCount}</td>
            <td>${report.attempts ? `${report.correct}/${report.attempts}` : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
  show('report-comparison', true);
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
    $('login-token').value = '';
    state.user = user;
    const continuation = ssoContinuation();
    if (continuation) {
      window.location.assign(continuation);
      return;
    }
    const previewSubject = teacherPreviewSubject();
    if (previewSubject) showTeacherPreview(previewSubject);
    else {
      await showTeacher();
      await applyRequestedTeacherWorkspace();
    }
  } catch (error) { $('login-status').textContent = error.message; }
});
$('login-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-button').click(); });
$('logout').addEventListener('click', async () => { await api('/api/auth/logout', { method:'POST', body:'{}' }); state.user = null; showLogin(); });
$('show-create-session').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('create');
  if (state.subject) window.location.assign(teacherWorkspaceHref(state.subject.id, 'seances'));
});
$('explore-subject').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('inspect');
  if (['psr-maths', 'ada-francais', 'ada-maths'].includes(state.subject?.id)) {
    window.location.assign(teacherWorkspaceHref(state.subject.id, 'parcours'));
  }
});
$('corrections-subject').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('corrections');
  if (state.subject) window.location.assign(teacherWorkspaceHref(state.subject.id, 'corrections'));
});
$('show-live-sessions').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('live');
  if (state.subject) window.location.assign(teacherWorkspaceHref(state.subject.id, 'live'));
});
$('reports-subject').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('reports');
  if (state.subject) window.location.assign(teacherWorkspaceHref(state.subject.id, 'reports'));
});
$('refresh-sessions').addEventListener('click', loadSessions);
$('live-dialog').addEventListener('close', clearLivePolling);
$('add-roster').addEventListener('click', addRosterLearners);
$('roster-edit-save').addEventListener('click', saveRosterEdit);
$('report-open-live').addEventListener('click', () => {
  const sessionId = state.reportSessionId;
  if (!sessionId) return;
  $('reports-dialog').close();
  openLiveView(sessionId);
});
$('session-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('session-status').textContent = '';
  try {
    await api('/api/sessions', { method:'POST', body:JSON.stringify({
      formation_id: state.formation.id, subject_id: state.subject.id,
      pathway_id: $('session-pathway').value,
      session_number: Number($('session-number').value), title:$('session-title').value, group_label:$('session-group').value,
    })});
    $('session-status').textContent = ['psr-maths', 'ada-francais', 'ada-maths'].includes(state.subject.id)
      ? 'Séance créée ✓ · ajoute maintenant la liste des élèves dans “Suivi en direct”.'
      : 'Séance créée ✓';
    $('session-title').value = ''; $('session-group').value = '';
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

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLiveTimer();
    return;
  }
  if (state.liveSessionId && $('live-dialog').open) refreshLiveView({ automatic:true });
});

boot().catch((error) => { $('login-status').textContent = error.message; showLogin(); });
