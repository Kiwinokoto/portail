'use strict';

// ADA foundational practice is deliberately separate from positioning/assessment.
let learningVocabularyCache = null;
let literacyBasicsCache = null;
let practiceRenderId = 0;

function practiceShuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function loadLearningVocabulary() {
  if (learningVocabularyCache) return learningVocabularyCache;
  const data = await api('/assets/learning/vocabulary.json');
  const items = Array.isArray(data?.items) ? data.items : [];
  const valid = items.filter((item) => item?.id && item?.word && item?.spoken && item?.visual);
  if (valid.length < 4) throw new Error("Le vocabulaire d’entraînement n’est pas disponible.");
  learningVocabularyCache = valid;
  return valid;
}

function learningVisual(item, extraClass = '') {
  return `<svg class="learning-visual ${esc(extraClass)}" viewBox="0 0 160 120" role="img" aria-label="${esc(item.word)}"><use href="/assets/learning/everyday.svg#${esc(item.visual)}"></use></svg>`;
}

function renderAdaTeacherPreviewHome() {
  practiceRenderId += 1;
  $('student-session-message').innerHTML = `
    <div class="learner-stage practice-stage">
      <p class="eyebrow">ADA · Français</p>
      <h3>Choisir une partie du parcours</h3>
      <p class="learner-help">L’aperçu professeur ne crée aucune activité élève. Le positionnement et l’entraînement restent volontairement séparés.</p>
      <div class="practice-module-grid">
        <button id="preview-positioning" class="practice-module-card" type="button">
          <span class="practice-module-icon" aria-hidden="true">◎</span>
          <strong>Positionnement</strong>
          <span>Les sondes courtes déjà en place : oral, prénom, lettre, discrimination, mot utile et geste d’écriture.</span>
          <small>observer · ne pas noter globalement</small>
        </button>
        <button id="preview-practice" class="practice-module-card" type="button">
          <span class="practice-module-icon" aria-hidden="true">▦</span>
          <strong>S’entraîner</strong>
          <span>Cartes d’apprentissage, écoute et petit Memory autour de mots de la vie courante.</span>
          <small>répéter · écouter · recommencer</small>
        </button>
      </div>
    </div>`;
  $('preview-positioning').addEventListener('click', () => state.learnerStart?.());
  $('preview-practice').addEventListener('click', renderLearningPracticeHome);
}

async function renderLearningPracticeHome() {
  const runId = ++practiceRenderId;
  $('student-session-message').innerHTML = `
    <div class="learner-stage practice-stage">
      <p class="eyebrow">S’entraîner</p>
      <h3>Chargement des cartes…</h3>
    </div>`;
  try {
    const items = await loadLearningVocabulary();
    if (runId !== practiceRenderId) return;
    $('student-session-message').innerHTML = `
      <div class="learner-stage practice-stage">
        <div class="practice-heading">
          <div>
            <p class="eyebrow">S’entraîner · vocabulaire courant</p>
            <h3>Choisir une activité</h3>
          </div>
          <button id="practice-back-preview" class="btn ghost" type="button">Retour au parcours</button>
        </div>
        <p class="learner-help">${items.length} mots communs disponibles. Les étiquettes PSR / AEPE servent seulement à réutiliser le vocabulaire dans d’autres contextes.</p>
        <div class="practice-module-grid practice-module-grid-three">
          <button id="practice-cards" class="practice-module-card" type="button">
            <span class="practice-module-icon" aria-hidden="true">▤</span>
            <strong>Cartes image + mot</strong>
            <span>Observer l’image, écouter le mot, puis révéler son écriture.</span>
            <small>sans score · à son rythme</small>
          </button>
          <button id="practice-listen" class="practice-module-card" type="button">
            <span class="practice-module-icon" aria-hidden="true">🔊</span>
            <strong>Écoute et retrouve</strong>
            <span>Entendre un mot puis toucher sa forme écrite parmi quatre choix.</span>
            <small>4 petits tours</small>
          </button>
          <button id="practice-memory" class="practice-module-card" type="button">
            <span class="practice-module-icon" aria-hidden="true">◫</span>
            <strong>Petit Memory</strong>
            <span>Associer quatre images aux quatre mots correspondants.</span>
            <small>4 paires · aperçu autorisé</small>
          </button>
          <button id="practice-case" class="practice-module-card" type="button">
            <span class="practice-module-icon" aria-hidden="true">Aa</span>
            <strong>Majuscule ↔ minuscule</strong>
            <span>Associer quatre lettres dans leurs deux formes visuelles.</span>
            <small>familiarité visuelle · pas décodage</small>
          </button>
          <button id="practice-syllables" class="practice-module-card" type="button">
            <span class="practice-module-icon" aria-hidden="true">ma</span>
            <strong>Écoute les syllabes</strong>
            <span>Écouter une syllabe simple puis retrouver sa forme écrite.</span>
            <small>4 petits tours · entraînement guidé</small>
          </button>
        </div>
      </div>`;
    $('practice-back-preview').addEventListener('click', renderAdaTeacherPreviewHome);
    $('practice-cards').addEventListener('click', renderLearningCardsPractice);
    $('practice-listen').addEventListener('click', renderLearningListeningPractice);
    $('practice-memory').addEventListener('click', renderLearningMemoryPractice);
    $('practice-case').addEventListener('click', renderCaseMemoryPractice);
    $('practice-syllables').addEventListener('click', renderSyllableListeningPractice);
  } catch (error) {
    if (runId !== practiceRenderId) return;
    $('student-session-message').innerHTML = `
      <div class="learner-stage practice-stage">
        <p class="eyebrow">S’entraîner</p>
        <h3>Les cartes ne sont pas disponibles.</h3>
        <p class="status">${esc(error.message)}</p>
        <button id="practice-error-back" class="btn ghost" type="button">Retour</button>
      </div>`;
    $('practice-error-back').addEventListener('click', renderAdaTeacherPreviewHome);
  }
}

async function renderLearningCardsPractice() {
  const runId = ++practiceRenderId;
  const items = practiceShuffle(await loadLearningVocabulary()).slice(0, 6);
  if (runId !== practiceRenderId) return;
  let index = 0;
  let revealed = false;

  const draw = () => {
    if (runId !== practiceRenderId) return;
    const item = items[index];
    $('student-session-message').innerHTML = `
      <div class="learner-stage practice-stage">
        <div class="practice-heading">
          <div><p class="eyebrow">Cartes image + mot · ${index + 1}/${items.length}</p><h3>Regarde. Écoute. Puis révèle le mot.</h3></div>
          <button id="learning-cards-back" class="btn ghost" type="button">Activités</button>
        </div>
        <article class="learning-card">
          ${learningVisual(item)}
          <div class="learning-card-audio" id="learning-card-audio"></div>
          ${revealed ? `<div class="learning-card-word">${esc(item.word)}</div>` : '<div class="learning-card-word learning-card-word-hidden" aria-hidden="true">••••••</div>'}
        </article>
        <div class="practice-actions">
          <button id="learning-card-reveal" class="btn ${revealed ? 'secondary' : 'primary'}" type="button">${revealed ? 'Masquer le mot' : 'Voir le mot'}</button>
          <button id="learning-card-next" class="btn secondary" type="button">${index === items.length - 1 ? 'Recommencer avec d’autres cartes' : 'Carte suivante'}</button>
        </div>
        <p class="learner-help">Pas de bonne ou mauvaise réponse ici : cette activité sert à revoir le même mot autant de fois que nécessaire.</p>
      </div>`;
    $('learning-card-audio').appendChild(audioButton('Écouter le mot', item.spoken, 'practice-card'));
    $('learning-cards-back').addEventListener('click', renderLearningPracticeHome);
    $('learning-card-reveal').addEventListener('click', () => { revealed = !revealed; draw(); });
    $('learning-card-next').addEventListener('click', () => {
      if (index === items.length - 1) return renderLearningCardsPractice();
      index += 1;
      revealed = false;
      draw();
    });
  };
  draw();
}

async function renderLearningListeningPractice() {
  const runId = ++practiceRenderId;
  const vocabulary = await loadLearningVocabulary();
  if (runId !== practiceRenderId) return;
  const rounds = practiceShuffle(vocabulary).slice(0, 4);
  let roundIndex = 0;

  const drawRound = () => {
    if (runId !== practiceRenderId) return;
    if (roundIndex >= rounds.length) {
      $('student-session-message').innerHTML = `
        <div class="learner-stage practice-stage">
          <div class="finish-card">
            <p class="eyebrow">Écoute et retrouve</p>
            <h3>Terminé pour cette série.</h3>
            <p class="muted">On peut refaire une nouvelle série immédiatement. Les essais ne sont pas une note.</p>
          </div>
          <div class="practice-actions">
            <button id="listen-again" class="btn primary" type="button">Nouvelle série</button>
            <button id="listen-back" class="btn ghost" type="button">Activités</button>
          </div>
        </div>`;
      $('listen-again').addEventListener('click', renderLearningListeningPractice);
      $('listen-back').addEventListener('click', renderLearningPracticeHome);
      return;
    }

    const target = rounds[roundIndex];
    const distractors = practiceShuffle(vocabulary.filter((item) => item.id !== target.id)).slice(0, 3);
    const choices = practiceShuffle([target, ...distractors]);
    $('student-session-message').innerHTML = `
      <div class="learner-stage practice-stage">
        <div class="practice-heading">
          <div><p class="eyebrow">Écoute et retrouve · ${roundIndex + 1}/${rounds.length}</p><h3>Écoute le mot puis touche-le.</h3></div>
          <button id="listen-back" class="btn ghost" type="button">Activités</button>
        </div>
        <div id="listen-word-audio"></div>
        <div id="listen-word-choices" class="word-choice-grid learning-listen-grid"></div>
        <p id="listen-word-feedback" class="feedback" aria-live="assertive"></p>
        <p class="learner-help">Tu peux réécouter autant de fois que nécessaire.</p>
      </div>`;
    $('listen-word-audio').appendChild(audioButton('Écouter', target.spoken, 'practice-listen'));
    const grid = $('listen-word-choices');
    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'word-choice-button learning-listen-choice';
      button.textContent = choice.word;
      button.addEventListener('click', () => {
        grid.querySelectorAll('.word-choice-button').forEach((node) => node.classList.remove('bad'));
        if (choice.id === target.id) {
          button.classList.add('good');
          grid.querySelectorAll('.word-choice-button').forEach((node) => { node.disabled = true; });
          $('listen-word-feedback').className = 'feedback good';
          $('listen-word-feedback').textContent = `Oui. ${target.word}.`;
          speakFrench(`Oui. ${target.spoken}.`);
          setTimeout(() => {
            if (runId !== practiceRenderId) return;
            roundIndex += 1;
            drawRound();
          }, 700);
        } else {
          button.classList.add('bad');
          $('listen-word-feedback').className = 'feedback bad';
          $('listen-word-feedback').textContent = 'Réécoute et essaie encore.';
          speakFrench(target.spoken);
        }
      });
      grid.appendChild(button);
    });
    $('listen-back').addEventListener('click', renderLearningPracticeHome);
    speakFrench(target.spoken);
  };
  drawRound();
}

async function renderLearningMemoryPractice() {
  const runId = ++practiceRenderId;
  const vocabulary = await loadLearningVocabulary();
  if (runId !== practiceRenderId) return;
  const picked = practiceShuffle(vocabulary).slice(0, 4);
  const deck = practiceShuffle(picked.flatMap((item) => [
    { uid:`${item.id}-image`, itemId:item.id, kind:'image', item, open:false, matched:false, preview:false },
    { uid:`${item.id}-word`, itemId:item.id, kind:'word', item, open:false, matched:false, preview:false },
  ]));
  let opened = [];
  let locked = false;
  let moves = 0;
  let matchedPairs = 0;

  const draw = () => {
    if (runId !== practiceRenderId) return;
    $('student-session-message').innerHTML = `
      <div class="learner-stage practice-stage memory-stage">
        <div class="practice-heading">
          <div><p class="eyebrow">Petit Memory · ${matchedPairs}/4 paires</p><h3>Associe chaque image à son mot.</h3></div>
          <button id="memory-back" class="btn ghost" type="button">Activités</button>
        </div>
        <div class="memory-toolbar">
          <span class="pill">Coups : ${moves}</span>
          <button id="memory-preview" class="btn ghost" type="button" ${locked ? 'disabled' : ''}>Aperçu 2 s</button>
          <button id="memory-new" class="btn ghost" type="button">Nouvelle partie</button>
        </div>
        <div id="learning-memory-grid" class="learning-memory-grid">
          ${deck.map((card) => {
            const visible = card.open || card.matched || card.preview;
            const content = card.kind === 'image'
              ? learningVisual(card.item, 'memory-visual')
              : `<span class="memory-word">${esc(card.item.word)}</span>`;
            return `<button class="learning-memory-card${card.matched ? ' matched' : ''}${visible ? ' revealed' : ''}" type="button" data-memory-card="${esc(card.uid)}" ${card.matched || locked ? 'disabled' : ''} aria-label="${visible ? esc(card.item.word) : 'Carte cachée'}">
              <span class="memory-card-hidden" aria-hidden="${visible ? 'true' : 'false'}">?</span>
              <span class="memory-card-content" aria-hidden="${visible ? 'false' : 'true'}">${content}</span>
            </button>`;
          }).join('')}
        </div>
        <p class="learner-help">L’aperçu est volontairement autorisé : c’est un entraînement de mémorisation, pas un test.</p>
        <p class="feedback ${matchedPairs === 4 ? 'good' : ''}" aria-live="polite">${matchedPairs === 4 ? 'Bravo. Les quatre paires sont retrouvées.' : ''}</p>
      </div>`;

    $('memory-back').addEventListener('click', renderLearningPracticeHome);
    $('memory-new').addEventListener('click', renderLearningMemoryPractice);
    $('memory-preview').addEventListener('click', () => {
      if (locked) return;
      locked = true;
      deck.forEach((card) => { if (!card.matched) card.preview = true; });
      draw();
      setTimeout(() => {
        if (runId !== practiceRenderId) return;
        deck.forEach((card) => { card.preview = false; });
        locked = false;
        draw();
      }, 2000);
    });

    $('learning-memory-grid').querySelectorAll('[data-memory-card]').forEach((button) => {
      button.addEventListener('click', () => {
        if (locked) return;
        const card = deck.find((item) => item.uid === button.dataset.memoryCard);
        if (!card || card.matched || card.open) return;
        card.open = true;
        opened.push(card);
        if (opened.length < 2) {
          draw();
          return;
        }

        moves += 1;
        locked = true;
        const [first, second] = opened;
        const match = first.itemId === second.itemId && first.kind !== second.kind;
        draw();
        setTimeout(() => {
          if (runId !== practiceRenderId) return;
          if (match) {
            first.matched = true;
            second.matched = true;
            matchedPairs += 1;
            speakFrench(first.item.spoken);
          } else {
            first.open = false;
            second.open = false;
          }
          opened = [];
          locked = false;
          draw();
        }, match ? 450 : 800);
      });
    });
  };
  draw();
}

async function loadLiteracyBasics() {
  if (literacyBasicsCache) return literacyBasicsCache;
  const data = await api('/assets/learning/literacy-basics.json');
  if (!Array.isArray(data?.letters) || data.letters.length < 4 || !Array.isArray(data?.syllables) || data.syllables.length < 4) {
    throw new Error("Les données lettres/syllabes ne sont pas disponibles.");
  }
  literacyBasicsCache = data;
  return data;
}

async function renderCaseMemoryPractice() {
  const runId = ++practiceRenderId;
  const basics = await loadLiteracyBasics();
  if (runId !== practiceRenderId) return;
  const picked = practiceShuffle(basics.letters).slice(0, 4);
  const deck = practiceShuffle(picked.flatMap((letter) => [
    { uid:`${letter}-upper`, pairId:letter, value:letter, kind:'upper', open:false, matched:false, preview:false },
    { uid:`${letter}-lower`, pairId:letter, value:letter.toLocaleLowerCase('fr-FR'), kind:'lower', open:false, matched:false, preview:false },
  ]));
  let opened = [];
  let locked = false;
  let moves = 0;
  let matchedPairs = 0;

  const draw = () => {
    if (runId !== practiceRenderId) return;
    $('student-session-message').innerHTML = `
      <div class="learner-stage practice-stage memory-stage">
        <div class="practice-heading">
          <div><p class="eyebrow">Majuscule ↔ minuscule · ${matchedPairs}/4 paires</p><h3>Retrouve les deux formes de la même lettre.</h3></div>
          <button id="case-back" class="btn ghost" type="button">Activités</button>
        </div>
        <div class="memory-toolbar">
          <span class="pill">Coups : ${moves}</span>
          <button id="case-preview" class="btn ghost" type="button" ${locked ? 'disabled' : ''}>Aperçu 2 s</button>
          <button id="case-new" class="btn ghost" type="button">Nouvelle partie</button>
        </div>
        <div id="case-memory-grid" class="learning-memory-grid">
          ${deck.map((card) => {
            const visible = card.open || card.matched || card.preview;
            return `<button class="learning-memory-card${card.matched ? ' matched' : ''}${visible ? ' revealed' : ''}" type="button" data-case-card="${esc(card.uid)}" ${card.matched || locked ? 'disabled' : ''} aria-label="${visible ? esc(card.value) : 'Carte cachée'}">
              <span class="memory-card-hidden" aria-hidden="${visible ? 'true' : 'false'}">?</span>
              <span class="memory-card-content case-letter" aria-hidden="${visible ? 'false' : 'true'}">${esc(card.value)}</span>
            </button>`;
          }).join('')}
        </div>
        <p class="learner-help">Cette activité entraîne la reconnaissance visuelle des deux formes. Elle ne prouve pas que la lettre est lue ou décodée.</p>
        <p class="feedback ${matchedPairs === 4 ? 'good' : ''}" aria-live="polite">${matchedPairs === 4 ? 'Bravo. Les quatre paires sont retrouvées.' : ''}</p>
      </div>`;
    $('case-back').addEventListener('click', renderLearningPracticeHome);
    $('case-new').addEventListener('click', renderCaseMemoryPractice);
    $('case-preview').addEventListener('click', () => {
      if (locked) return;
      locked = true;
      deck.forEach((card) => { if (!card.matched) card.preview = true; });
      draw();
      setTimeout(() => {
        if (runId !== practiceRenderId) return;
        deck.forEach((card) => { card.preview = false; });
        locked = false;
        draw();
      }, 2000);
    });
    $('case-memory-grid').querySelectorAll('[data-case-card]').forEach((button) => {
      button.addEventListener('click', () => {
        if (locked) return;
        const card = deck.find((item) => item.uid === button.dataset.caseCard);
        if (!card || card.matched || card.open) return;
        card.open = true;
        opened.push(card);
        if (opened.length < 2) return draw();
        moves += 1;
        locked = true;
        const [first, second] = opened;
        const match = first.pairId === second.pairId && first.kind !== second.kind;
        draw();
        setTimeout(() => {
          if (runId !== practiceRenderId) return;
          if (match) {
            first.matched = true;
            second.matched = true;
            matchedPairs += 1;
          } else {
            first.open = false;
            second.open = false;
          }
          opened = [];
          locked = false;
          draw();
        }, match ? 400 : 750);
      });
    });
  };
  draw();
}

async function renderSyllableListeningPractice() {
  const runId = ++practiceRenderId;
  const basics = await loadLiteracyBasics();
  if (runId !== practiceRenderId) return;
  const rounds = practiceShuffle(basics.syllables).slice(0, 4);
  let roundIndex = 0;

  const draw = () => {
    if (runId !== practiceRenderId) return;
    if (roundIndex >= rounds.length) {
      $('student-session-message').innerHTML = `
        <div class="learner-stage practice-stage">
          <div class="finish-card">
            <p class="eyebrow">Syllabes simples</p>
            <h3>Série terminée.</h3>
            <p class="muted">On peut recommencer avec d’autres syllabes. Ce résultat n’entre pas dans le positionnement.</p>
          </div>
          <div class="practice-actions">
            <button id="syllable-again" class="btn primary" type="button">Nouvelle série</button>
            <button id="syllable-back" class="btn ghost" type="button">Activités</button>
          </div>
        </div>`;
      $('syllable-again').addEventListener('click', renderSyllableListeningPractice);
      $('syllable-back').addEventListener('click', renderLearningPracticeHome);
      return;
    }
    const target = rounds[roundIndex];
    const choices = practiceShuffle([
      target,
      ...practiceShuffle(basics.syllables.filter((value) => value !== target)).slice(0, 3),
    ]);
    $('student-session-message').innerHTML = `
      <div class="learner-stage practice-stage">
        <div class="practice-heading">
          <div><p class="eyebrow">Syllabes simples · ${roundIndex + 1}/${rounds.length}</p><h3>Écoute puis retrouve la syllabe.</h3></div>
          <button id="syllable-back" class="btn ghost" type="button">Activités</button>
        </div>
        <div id="syllable-audio"></div>
        <div id="syllable-choices" class="word-choice-grid learning-listen-grid"></div>
        <p id="syllable-feedback" class="feedback" aria-live="assertive"></p>
        <p class="learner-help">La synthèse vocale sert ici de guide d’entraînement. Une future sonothèque enregistrée pourra la remplacer sans changer le jeu.</p>
      </div>`;
    $('syllable-audio').appendChild(audioButton('Écouter', target, 'practice-syllable'));
    const grid = $('syllable-choices');
    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'word-choice-button learning-listen-choice syllable-choice';
      button.textContent = choice.toLocaleUpperCase('fr-FR');
      button.addEventListener('click', () => {
        grid.querySelectorAll('.word-choice-button').forEach((node) => node.classList.remove('bad'));
        if (choice === target) {
          button.classList.add('good');
          grid.querySelectorAll('.word-choice-button').forEach((node) => { node.disabled = true; });
          $('syllable-feedback').className = 'feedback good';
          $('syllable-feedback').textContent = `Oui. ${target.toLocaleUpperCase('fr-FR')}.`;
          speakFrench(target);
          setTimeout(() => {
            if (runId !== practiceRenderId) return;
            roundIndex += 1;
            draw();
          }, 700);
        } else {
          button.classList.add('bad');
          $('syllable-feedback').className = 'feedback bad';
          $('syllable-feedback').textContent = 'Réécoute et essaie encore.';
          speakFrench(target);
        }
      });
      grid.appendChild(button);
    });
    $('syllable-back').addEventListener('click', renderLearningPracticeHome);
    speakFrench(target);
  };
  draw();
}
