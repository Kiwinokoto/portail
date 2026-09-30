const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  formations: [],
  formation: null,
  subject: null,
  sessions: [],
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
  return ['ada-francais', 'ada-maths'].includes(subjectId) ? subjectId : '';
}

function configureLearnerPath(session) {
  if (session.subject_id === 'ada-francais') {
    state.positioningItemId = 'positioning-v1';
    state.learnerStart = () => renderOralComprehensionActivity(0);
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

function showAdaTeacherPreview(subjectId) {
  const isMaths = subjectId === 'ada-maths';
  state.previewMode = true;
  state.joinToken = null;
  state.joinSession = {
    id: 'teacher-preview',
    formation_id: 'ada',
    formation_label: 'ADA',
    subject_id: subjectId,
    subject_label: isMaths ? 'Mathématiques' : 'Français',
    session_number: 1,
    title: 'Aperçu du positionnement',
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
  $('student-session-title').textContent = `ADA · ${state.joinSession.subject_label} — aperçu professeur`;
  $('student-session-context').textContent = 'Navigation libre · aucune donnée élève enregistrée';
  state.learnerStart();
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
  if (previewSubject) return showAdaTeacherPreview(previewSubject);
  await showTeacher();
}

async function showStudentJoin(token) {
  state.previewMode = false;
  state.joinToken = token;
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
  { target: 'telephone', instruction: 'Touche le téléphone.' },
  { target: 'cle', instruction: 'Touche la clé.' },
  { target: 'bus', instruction: 'Touche le bus.' },
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

  $('oral-audio').appendChild(audioButton('Réécouter', round.instruction, 'oral-comprehension'));
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
        speakFrench(`Essaie encore. ${round.instruction}`);
      }
    });
    grid.appendChild(button);
  });
  speakFrench(round.instruction);
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

function updateWorkspaceActions() {
  if (!state.subject) return;
  const internal = state.subject.mode === 'internal';
  const external = state.subject.mode === 'external';
  const planned = state.subject.mode === 'planned';
  const hasSessions = state.sessions.some((session) => session.subject_id === state.subject.id);
  const hasInternalPreview = ['ada-francais', 'ada-maths'].includes(state.subject.id);

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
    disabled: internal && !hasSessions,
    description: external ? 'Verrouiller ou ouvrir les corrigés au moment choisi.' : (hasSessions ? 'Verrouiller ou ouvrir les corrigés séance par séance.' : 'Crée d’abord une séance pour piloter les corrigés.'),
    status: external || hasSessions ? 'disponible' : 'après création',
    upcoming: internal && !hasSessions
  });
  setWorkspaceAction('show-live-sessions', {
    disabled: internal && !hasSessions,
    description: external ? 'Voir les présences, l’avancement, les résultats et le rythme indicatif.' : (hasSessions ? 'Voir qui a commencé et suivre les premières activités.' : 'Crée d’abord une séance pour démarrer le suivi.'),
    status: external || hasSessions ? 'disponible' : 'après création',
    upcoming: internal && !hasSessions
  });
  setWorkspaceAction('reports-subject', {
    disabled: internal && !hasSessions,
    description: 'Synthèse du groupe, détail individuel et comparaison descriptive.',
    status: external || hasSessions ? 'V1' : 'après création',
    upcoming: internal && !hasSessions
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
  updateWorkspaceActions();
  revealOnNarrowScreen('subject-workspace');
}

async function loadSessions() {
  const { sessions } = await api('/api/sessions');
  state.sessions = sessions;
  $('recent-sessions-panel').classList.toggle('is-empty', !sessions.length);
  updateWorkspaceActions();

  if (!sessions.length) {
    $('sessions-list').innerHTML = `
      <div class="empty-sessions">
        <span class="empty-sessions-icon" aria-hidden="true">○</span>
        <div>
          <strong>Pas encore de séance</strong>
          <span>Choisis un parcours puis crée ta première séance.</span>
        </div>
      </div>`;
    return;
  }

  $('sessions-list').innerHTML = sessions.map((s) => `
    <article class="session-row">
      <div class="meta">
        <strong>${esc(s.formation_label)} · ${esc(s.subject_label)} · Séance ${s.session_number}${s.title ? ` · ${esc(s.title)}` : ''}</strong>
        <small>${esc(s.group_label)} · créée ${new Date(s.created_at).toLocaleString('fr-FR')}</small>
      </div>
      <div class="session-actions">
        ${['ada-francais', 'ada-maths'].includes(s.subject_id) ? `<button class="btn primary" data-live="${esc(s.id)}">Suivi en direct</button>
        <button class="btn secondary" data-corrections="${esc(s.id)}" data-unlocked="${s.corrections_unlocked ? '1' : '0'}">Corrigés : ${s.corrections_unlocked ? 'ouverts' : 'verrouillés'}</button>
        <button class="btn secondary" data-report="${esc(s.id)}">Rapport</button>` : ''}
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
  $('sessions-list').querySelectorAll('[data-corrections]').forEach((button) => {
    button.addEventListener('click', () => toggleSessionCorrections(button.dataset.corrections, button.dataset.unlocked !== '1'));
  });
  $('sessions-list').querySelectorAll('[data-report]').forEach((button) => {
    button.addEventListener('click', () => openSessionReport(button.dataset.report));
  });
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
  state.liveSessionId = sessionId;
  const session = state.sessions.find((item) => item.id === sessionId);
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
          ${learner.started ? `${learner.completed_items}/${completionTarget} étapes · ${learner.correct_answers}/${learner.attempts} réponses justes` : 'En attente'}
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
  return {
    ...activity, learners,
    rosterCount: learners.length,
    startedCount: Number(activity.started_count || 0),
    finishedCount: finished,
    attempts, correct,
  };
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
  if (state.subject.id === 'ada-francais') {
    return openReportCollection(buildAdaReport, renderAdaReportDetail, preferredSessionId);
  }
  if (state.subject.id === 'ada-maths') {
    return openReportCollection(buildNumeracyReport, renderNumeracyReportDetail, preferredSessionId);
  }
}

async function openSessionReport(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session || !['ada-francais', 'ada-maths'].includes(session.subject_id)) return;
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

  const sessions = state.sessions.filter((session) => session.subject_id === state.subject.id);
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
    if (previewSubject) showAdaTeacherPreview(previewSubject);
    else await showTeacher();
  } catch (error) { $('login-status').textContent = error.message; }
});
$('login-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-button').click(); });
$('logout').addEventListener('click', async () => { await api('/api/auth/logout', { method:'POST', body:'{}' }); state.user = null; showLogin(); });
$('show-create-session').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('create');
  show('session-form', true);
});
$('explore-subject').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('inspect');
  if (['ada-francais', 'ada-maths'].includes(state.subject?.id)) {
    window.open(`/?preview=teacher&subject=${encodeURIComponent(state.subject.id)}`, '_blank', 'noopener');
  }
});
$('corrections-subject').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('corrections');
  $('recent-sessions-panel').scrollIntoView({ behavior:'smooth', block:'start' });
});
$('show-live-sessions').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('live');
  $('recent-sessions-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('reports-subject').addEventListener('click', () => {
  if (state.subject?.mode === 'external') return openExternalTeacher('reports');
  openReports();
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
      session_number: Number($('session-number').value), title:$('session-title').value, group_label:$('session-group').value,
    })});
    $('session-status').textContent = ['ada-francais', 'ada-maths'].includes(state.subject.id)
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
