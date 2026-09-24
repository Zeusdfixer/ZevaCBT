/**
 * STUDENT APP — Zeva CBT
 * section select -> login -> instructions -> exam engine -> results -> (optional resit)
 */

const root = document.getElementById('root');

const state = {
  screen: 'section-select',
  section: null,        // 'high_school' | 'college' | 'professional'
  classFilter: null,     // e.g. 'Grade 9', 'UTME', 'ICAN'
  student: null,
  exam: null,
  subjects: [],
  questionsBySubject: {},
  activeSubjectId: null,
  answers: {},
  flagged: {},
  currentQuestionId: null,
  secondsLeft: 0,
  timerHandle: null,
  reconcileHandle: null,
  isPaused: false,
  lastResult: null,
  resitMode: null,       // null | 'full_time' | 'remaining_time'
  sessionId: null,       // LAN mode: server-side session id
  ttsEnabled: false,
};

function render() {
  if (state.screen === 'section-select') return renderSectionSelect();
  if (state.screen === 'login') return renderLogin();
  if (state.screen === 'guest-trial-setup') return renderGuestTrialSetup();
  if (state.screen === 'instructions') return renderInstructions();
  if (state.screen === 'exam') return renderExam();
  if (state.screen === 'results') return renderResults();
}

// ---------------------------------------------------------------
// SECTION SELECT — High School / College / Professional
// ---------------------------------------------------------------
function renderSectionSelect() {
  const isLan = window.ZEVA_MODE === 'lan';
  const savedAddress = window.ZEVA_getSavedServerAddress ? window.ZEVA_getSavedServerAddress() : null;

  root.innerHTML = `
    <div class="login-screen">
      <div class="section-select-card">
        <div class="brand-mark" style="justify-content:center; margin-bottom: 8px;">
          <img src="assets/logo-icon.png" class="brand-icon-img" alt="" />
          <div>ZEVA CBT<small>BY ZEUS TECHNOLOGIES INNOVATIONS &middot; POWERING SMARTER EXAMS</small></div>
        </div>
        <h1 style="text-align:center; margin-top:18px;">Choose your test category</h1>
        <p class="subtitle" style="text-align:center;">Select the section that matches the exam you are here to take.</p>

        <div class="section-tiles">
          <button class="section-tile" data-section="high_school">
            <div class="section-tile-icon">${ZevaIcons.school()}</div>
            <div class="section-tile-title">High School Test</div>
            <div class="section-tile-sub">Grade 7 &ndash; Grade 12</div>
          </button>
          <button class="section-tile" data-section="college">
            <div class="section-tile-icon">${ZevaIcons.graduationCap()}</div>
            <div class="section-tile-title">College Test</div>
            <div class="section-tile-sub">UTME, Post UTME &amp; Tertiary exams</div>
          </button>
          <button class="section-tile" data-section="professional">
            <div class="section-tile-icon">${ZevaIcons.briefcase()}</div>
            <div class="section-tile-title">Professional Test</div>
            <div class="section-tile-sub">ICAN, RMAFC, NBA &amp; other bodies</div>
          </button>
        </div>

        <div class="server-status-row">
          ${isLan
            ? `<span class="server-status-dot connected"></span> Connected to school server${savedAddress ? ` <span class="mono">(${escapeHtml(savedAddress)})</span>` : ''} &middot; <button class="link-btn" id="btn-change-server">Change</button>`
            : `<span class="server-status-dot"></span> Working offline &middot; <button class="link-btn" id="btn-connect-server">Connect to a school server</button>`
          }
        </div>

        <div class="login-footer">
          <a href="admin.html">Admin access</a> &middot; <a href="portal.html">Check results online</a> &middot; <a href="about.html">About</a>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.section-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      state.section = btn.dataset.section;
      state.screen = 'login';
      render();
    });
  });

  const connectBtn = document.getElementById('btn-connect-server') || document.getElementById('btn-change-server');
  if (connectBtn) {
    connectBtn.addEventListener('click', showServerConnectDialog);
  }
}

async function showServerConnectDialog() {
  let root2 = document.getElementById('tour-root');
  if (!root2) {
    root2 = document.createElement('div');
    root2.id = 'tour-root';
    document.body.appendChild(root2);
  }

  root2.innerHTML = `
    <div class="zeva-modal-overlay show">
      <div class="zeva-modal-card">
        <img src="assets/logo-icon.png" alt="" class="zeva-modal-icon" />
        <h3 class="zeva-modal-title">Connect to a school server</h3>
        <p class="zeva-modal-message">Ask your invigilator for the server address shown on the admin computer (for example <span class="mono">192.168.1.10:8080</span>), then enter it below.</p>
        <div class="field-group" style="text-align:left;">
          <input type="text" id="server-address-input" placeholder="e.g. 192.168.1.10:8080" value="${window.ZEVA_getSavedServerAddress ? (window.ZEVA_getSavedServerAddress() || '') : ''}" />
        </div>
        <div class="zeva-modal-actions">
          <button class="btn-secondary" id="server-connect-cancel">Cancel</button>
          <button class="btn-primary" id="server-connect-submit" style="width:auto; padding:12px 22px;">Connect</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('server-connect-cancel').addEventListener('click', () => { root2.innerHTML = ''; });
  document.getElementById('server-connect-submit').addEventListener('click', async () => {
    const input = document.getElementById('server-address-input');
    const address = input.value.trim();
    const submitBtn = document.getElementById('server-connect-submit');
    submitBtn.textContent = 'Connecting...';
    submitBtn.disabled = true;

    const result = await window.ZEVA_setServerAddress(address);
    root2.innerHTML = '';

    if (result.ok) {
      await zevaModal.alert({ title: 'Connected', message: 'You are now connected to the school server.' });
      render();
    } else {
      await zevaModal.alert({ title: 'Could not connect', message: result.error });
    }
  });
}

function getClassOptionsForSection(section) {
  if (section === 'high_school') return DataStore.HIGH_SCHOOL_GRADES;
  if (section === 'college') return DataStore.COLLEGE_TRACKS;
  if (section === 'professional') return DataStore.PROFESSIONAL_BODIES;
  return [];
}

function sectionLabel(section) {
  if (section === 'high_school') return 'High School Test';
  if (section === 'college') return 'College Test';
  if (section === 'professional') return 'Professional Test';
  return '';
}

function groupLabelForSection(section) {
  if (section === 'high_school') return 'Class / Grade';
  if (section === 'college') return 'Exam Track';
  if (section === 'professional') return 'Professional Body';
  return 'Class / Track';
}

// ---------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------
async function renderLogin() {
  const classOptions = getClassOptionsForSection(state.section);
  const allExams = await DataStore.getExams(state.section);

  root.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="brand-mark">
          <img src="assets/logo-icon.png" class="brand-icon-img" alt="" />
          <div>
            ZEVA CBT
            <small>${escapeHtml(sectionLabel(state.section)).toUpperCase()}</small>
          </div>
        </div>
        <h1>Student login</h1>
        <p class="subtitle">Enter your details exactly as registered.</p>

        <div class="field-group">
          <label>Full name (Surname &middot; First Name &middot; Other Name)</label>
          <input type="text" id="input-name" placeholder="e.g. Bello Aisha Yusuf" autocomplete="off" />
        </div>
        <div class="field-group">
          <label>Registration number</label>
          <input type="text" id="input-reg" placeholder="e.g. AMTI/001/2026" autocomplete="off" />
        </div>
        <div class="field-group">
          <label>Examination number</label>
          <input type="text" id="input-exam-number" placeholder="e.g. AMTI/EXAM/2026/001" autocomplete="off" />
        </div>
        <div class="field-group">
          <label>${escapeHtml(groupLabelForSection(state.section))}</label>
          <select id="input-class">
            <option value="">Select</option>
            ${classOptions.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <label>Select exam</label>
          <select id="input-exam">
            <option value="">Select your class/track above first</option>
          </select>
        </div>

        <button class="btn-primary" id="btn-start">Continue</button>
        <div class="login-footer">
          <button class="btn-ghost link-btn" id="btn-try-practice">Try a demo practice test instead</button>
          <br />
          <button class="btn-ghost" id="btn-back-section" style="color:var(--slate-light);">&larr; Change category</button>
        </div>
      </div>
    </div>
  `;

  function updateExamOptions() {
    const chosenClass = document.getElementById('input-class').value;
    const examSelect = document.getElementById('input-exam');
    if (!chosenClass) {
      examSelect.innerHTML = '<option value="">Select your class/track above first</option>';
      return;
    }
    const matching = allExams.filter(e => e.grade === chosenClass);
    if (matching.length === 0) {
      examSelect.innerHTML = '<option value="">No exams available for this class yet</option>';
      return;
    }
    examSelect.innerHTML = '<option value="">Select exam</option>' + matching.map(e => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join('');
  }
  document.getElementById('input-class').addEventListener('change', updateExamOptions);

  document.getElementById('btn-start').addEventListener('click', handleLoginSubmit);
  document.getElementById('btn-try-practice').addEventListener('click', () => {
    state.guestName = document.getElementById('input-name').value.trim() || 'Student';
    state.screen = 'guest-trial-setup';
    render();
  });
  document.getElementById('btn-back-section').addEventListener('click', () => {
    state.screen = 'section-select';
    render();
  });
}

async function handleLoginSubmit() {
  const fullName = document.getElementById('input-name').value.trim();
  const regNumber = document.getElementById('input-reg').value.trim();
  const examNumber = document.getElementById('input-exam-number').value.trim();
  const examId = document.getElementById('input-exam').value;

  if (!fullName || !regNumber || !examNumber) {
    await zevaModal.alert({ title: 'Missing details', message: 'Please enter your full name, registration number, and examination number.' });
    return;
  }
  if (!examId) {
    await zevaModal.alert({ title: 'No exam selected', message: 'Please select which exam you want to take.' });
    return;
  }

  const student = await DataStore.findStudentForLogin({ fullName, regNumber, examNumber });
  if (!student) {
    const schoolSettings = await DataStore.getSchoolSettings();
    const guestModeEnabled = schoolSettings.guestModeEnabled !== false;

    if (!guestModeEnabled) {
      await zevaModal.alert({
        title: 'No student record found',
        message: 'We could not find a matching student record for these details. Please check your full name, registration number, and examination number, then try again.',
      });
      return;
    }

    const tryDemo = await zevaModal.confirm({
      title: 'No student record found',
      message: 'We could not find a matching student record for these details. You can re-check them, or try our demo mock trial instead — a practice-only exam using sample questions, completely separate from any live exam content.',
      confirmText: 'Try demo mock trial',
      cancelText: 'Re-check my details',
    });
    if (!tryDemo) return;

    state.guestName = fullName;
    state.screen = 'guest-trial-setup';
    render();
    return;
  }
  state.student = student;

  const exam = await DataStore.getExam(examId);

  if (window.ZEVA_MODE === 'lan' && !state.student.isTrial) {
    const existingSession = await DataStore.getActiveExamSession(state.student.id, examId);
    if (existingSession && existingSession.status === 'paused') {
      const secondsLeft = Math.max(0, Math.round((existingSession.serverEndTime - Date.now()) / 1000));
      const resume = await zevaModal.confirm({
        title: 'Resume paused exam?',
        message: `You have a paused attempt on "${exam.title}" with ${formatTime(secondsLeft)} remaining. Resume where you left off?`,
        confirmText: 'Resume exam',
        cancelText: 'Continue anyway',
      });
      if (resume) {
        state.exam = exam;
        state.sessionId = existingSession.id;
        state.subjects = existingSession.subjects;
        state.questionsBySubject = existingSession.questionsBySubject;
        state.activeSubjectId = existingSession.activeSubjectId;
        state.answers = existingSession.answers;
        state.flagged = existingSession.flagged;
        state.currentQuestionId = existingSession.currentQuestionId;
        state.secondsLeft = secondsLeft;
        state.isPaused = true;
        state.screen = 'exam';
        render();
        startTimer();
        startReconciliation();
        document.getElementById('pause-overlay') && (document.getElementById('pause-overlay').style.display = 'flex');
        return;
      }
    }
    state.exam = exam;
    await maybeShowTour(exam);
    state.screen = 'instructions';
    render();
    return;
  }

  // Check for an existing paused session for this student+exam
  const paused = await DataStore.getActiveSession(state.student.id);
  if (paused && paused.examId === examId && paused.isPaused) {
    const resume = await zevaModal.confirm({
      title: 'Resume paused exam?',
      message: `You have a paused attempt on "${exam.title}" with ${formatTime(paused.secondsLeft)} remaining. Resume where you left off?`,
      confirmText: 'Resume exam',
      cancelText: 'Start fresh',
    });
    if (resume) {
      restoreSession(paused, exam);
      return;
    } else {
      await DataStore.clearActiveSession();
    }
  }

  state.exam = exam;
  await maybeShowTour(exam);
  state.screen = 'instructions';
  render();
}

// ---------------------------------------------------------------
// INTRODUCTORY TOUR GUIDE — shown after login, before instructions,
// unless the student previously chose "don't show again" on this device.
// ---------------------------------------------------------------
const TOUR_STEPS = [
  {
    title: 'Welcome to Zeva CBT',
    body: 'Before you begin, here is a quick guide to the exam screen so nothing catches you by surprise.',
  },
  {
    title: 'Subjects and the timer',
    body: 'Tabs along the top let you switch between subjects at any time. Your countdown timer sits at the top right — it keeps running once the exam starts.',
  },
  {
    title: 'The question navigator',
    body: 'On the right, a numbered grid shows every question in the current subject. Green means answered, amber means flagged for review, and plain means not yet answered. Tap any number to jump straight to it.',
  },
  {
    title: 'Flagging, calculator, and read-aloud',
    body: '"Flag for review" marks a question amber so you can revisit it later. A calculator (normal and scientific) is available from the top bar. If reading is difficult, tap the "Read aloud" button on any question to have it read to you.',
  },
  {
    title: 'Submitting your exam',
    body: 'When you are ready, use "Submit exam" in the sidebar. You will be asked to confirm before it is final. Good luck!',
  },
];

function maybeShowTour(exam) {
  const key = `zeva_skip_tour_${(state.student.regNumber || 'guest').toLowerCase()}`;
  if (localStorage.getItem(key) === 'true') return Promise.resolve();
  return showTour(key);
}

function showTour(storageKey) {
  return new Promise((resolve) => {
    let stepIndex = 0;
    let dontShowAgain = false;

    let root = document.getElementById('tour-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'tour-root';
      document.body.appendChild(root);
    }

    function renderStep() {
      const step = TOUR_STEPS[stepIndex];
      const isLast = stepIndex === TOUR_STEPS.length - 1;
      root.innerHTML = `
        <div class="zeva-modal-overlay show">
          <div class="zeva-modal-card tour-card">
            <img src="assets/logo-icon.png" alt="" class="zeva-modal-icon" />
            <div class="tour-progress-dots">
              ${TOUR_STEPS.map((_, i) => `<span class="tour-dot ${i === stepIndex ? 'active' : ''}"></span>`).join('')}
            </div>
            <h3 class="zeva-modal-title">${step.title}</h3>
            <p class="zeva-modal-message">${step.body}</p>
            <label class="tour-dont-show">
              <input type="checkbox" id="tour-dont-show-cb" ${dontShowAgain ? 'checked' : ''} />
              <span>Don't show this tour again on this device</span>
            </label>
            <div class="zeva-modal-actions">
              ${stepIndex > 0 ? '<button class="btn-secondary" id="tour-back">Back</button>' : '<button class="btn-ghost" id="tour-skip">Skip tour</button>'}
              <button class="btn-primary" id="tour-next" style="width:auto; padding:12px 22px;">${isLast ? 'Finish' : 'Next'}</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('tour-dont-show-cb').addEventListener('change', (e) => {
        dontShowAgain = e.target.checked;
      });

      const backBtn = document.getElementById('tour-back');
      if (backBtn) backBtn.addEventListener('click', () => { stepIndex--; renderStep(); });

      const skipBtn = document.getElementById('tour-skip');
      if (skipBtn) skipBtn.addEventListener('click', finish);

      document.getElementById('tour-next').addEventListener('click', () => {
        if (isLast) { finish(); return; }
        stepIndex++;
        renderStep();
      });
    }

    function finish() {
      if (dontShowAgain) localStorage.setItem(storageKey, 'true');
      root.innerHTML = '';
      resolve();
    }

    renderStep();
  });
}

// ---------------------------------------------------------------
// GUEST DEMO MOCK TRIAL — isolated practice content, never live exam questions
// ---------------------------------------------------------------
async function renderGuestTrialSetup() {
  const demoSubjects = await DataStore.getSubjects(state.section, { isDemo: true });
  const isHighSchool = state.section === 'high_school';
  const isProfessional = state.section === 'professional';

  let pickerHtml = '';
  if (isHighSchool) {
    const grades = [...new Set(demoSubjects.map(s => s.grade).filter(Boolean))];
    pickerHtml = `
      <div class="field-group">
        <label>Choose your grade</label>
        <select id="guest-grade-picker">
          ${grades.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
      </div>
    `;
  } else if (isProfessional) {
    pickerHtml = `
      <div class="field-group">
        <label>Choose a professional body</label>
        <select id="guest-body-picker">
          ${demoSubjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  root.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="brand-mark">
          <img src="assets/logo-icon.png" class="brand-icon-img" alt="" />
          <div>ZEVA CBT<small>DEMO MOCK TRIAL &middot; ${escapeHtml(sectionLabel(state.section)).toUpperCase()}</small></div>
        </div>
        <h1>Try a demo mock trial</h1>
        <p class="subtitle">This uses sample practice questions only — completely separate from any institution's real exam content. Your result won't be saved to any official record.</p>

        ${pickerHtml}

        <button class="btn-primary" id="btn-start-guest-trial">Start demo trial</button>
        <div class="login-footer">
          <button class="btn-ghost" id="btn-back-to-login" style="color:var(--slate-light);">&larr; Back to login</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back-to-login').addEventListener('click', () => {
    state.screen = 'login';
    render();
  });

  document.getElementById('btn-start-guest-trial').addEventListener('click', async () => {
    let selectedSubjects = demoSubjects;
    if (isHighSchool) {
      const grade = document.getElementById('guest-grade-picker').value;
      selectedSubjects = demoSubjects.filter(s => s.grade === grade);
    } else if (isProfessional) {
      const bodyId = document.getElementById('guest-body-picker').value;
      selectedSubjects = demoSubjects.filter(s => s.id === bodyId);
    }

    if (selectedSubjects.length === 0) {
      await zevaModal.alert({ title: 'No demo content available', message: 'There is no demo content set up for this selection yet.' });
      return;
    }

    const questionsPerSubject = {};
    selectedSubjects.forEach(s => { questionsPerSubject[s.id] = 8; });

    state.student = {
      id: 'trial_' + Date.now(),
      fullName: state.guestName || 'Guest',
      regNumber: '', examNumber: '',
      section: state.section,
      isTrial: true,
      photo: null,
    };
    state.exam = {
      id: 'guest_demo_exam',
      title: `Demo Mock Trial — ${sectionLabel(state.section)}`,
      section: state.section,
      subjectIds: selectedSubjects.map(s => s.id),
      questionsPerSubject,
      theoryQuestionsPerSubject: {},
      durationMinutes: 15,
      shuffleQuestions: true,
      shuffleOptions: true,
      passMarkPercent: 50,
      resitPolicy: 'remaining_time',
      allowPause: true,
      allowReview: true,
    };
    state.screen = 'instructions';
    render();
  });
}

function restoreSession(session, exam) {
  state.exam = exam;
  state.subjects = session.subjects;
  state.questionsBySubject = session.questionsBySubject;
  state.activeSubjectId = session.activeSubjectId;
  state.answers = session.answers;
  state.flagged = session.flagged;
  state.currentQuestionId = session.currentQuestionId;
  state.secondsLeft = session.secondsLeft;
  state.screen = 'exam';
  render();
  startTimer();
}

// ---------------------------------------------------------------
// INSTRUCTIONS
// ---------------------------------------------------------------
async function renderInstructions() {
  const exam = state.exam;
  const subjects = await DataStore.getSubjects(null, { isDemo: !!state.student.isTrial });
  const examSubjects = subjects.filter(s => exam.subjectIds.includes(s.id));
  const totalQuestions = Object.values(exam.questionsPerSubject).reduce((a, b) => a + b, 0);

  root.innerHTML = `
    <div class="instructions-screen">
      <div class="instructions-card">
        <div class="instructions-header">
          <div class="brand-mark">
            <img src="assets/logo-icon.png" class="brand-icon-img" alt="" />
            <div>ZEVA CBT <small>${escapeHtml(sectionLabel(state.section)).toUpperCase()}</small></div>
          </div>
          <div class="exam-title">${escapeHtml(exam.title)}</div>
        </div>
        <div class="instructions-body">
          <div class="exam-meta-grid">
            <div class="exam-meta-item">
              <div class="label">Duration</div>
              <div class="value">${exam.durationMinutes} min</div>
            </div>
            <div class="exam-meta-item">
              <div class="label">Questions</div>
              <div class="value">${totalQuestions}</div>
            </div>
            <div class="exam-meta-item">
              <div class="label">Subjects</div>
              <div class="value">${examSubjects.length}</div>
            </div>
          </div>

          <h3>Subjects covered</h3>
          <ul>
            ${examSubjects.map(s => `<li>${escapeHtml(s.name)} — ${exam.questionsPerSubject[s.id]} questions</li>`).join('')}
          </ul>

          <h3>Instructions</h3>
          <ul>
            <li>The timer starts as soon as you click "Begin exam".</li>
            <li>Use the subject tabs at the top to move between subjects at any time.</li>
            <li>Use the numbered grid on the right to jump directly to any question.</li>
            <li>You may flag a question to revisit later — flagged questions are marked in amber.</li>
            <li>The exam auto-submits when the timer reaches zero, whether or not you have finished.</li>
            ${(exam.allowPause && state.student.isTrial) ? '<li>You may pause this exam in an emergency and resume later from where you stopped.</li>' : ''}
            <li>A normal and scientific calculator is available on the exam screen.</li>
          </ul>

          <label class="confirm-checkbox">
            <input type="checkbox" id="confirm-ready" />
            <span>I, <strong>${escapeHtml(state.student.fullName)}</strong>, confirm that I understand the instructions above and am ready to begin.</span>
          </label>

          <button class="btn-primary" id="btn-begin" disabled>Begin exam</button>
        </div>
      </div>
    </div>
  `;

  const checkbox = document.getElementById('confirm-ready');
  const beginBtn = document.getElementById('btn-begin');
  checkbox.addEventListener('change', () => {
    beginBtn.disabled = !checkbox.checked;
    beginBtn.style.opacity = checkbox.checked ? '1' : '0.5';
  });
  beginBtn.style.opacity = '0.5';
  beginBtn.addEventListener('click', () => beginExam());
}

// ---------------------------------------------------------------
// EXAM ENGINE
// ---------------------------------------------------------------
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function beginExam(overrideSeconds = null) {
  const exam = state.exam;

  // Mock trials (no matching student record) never touch the server, in either
  // mode — there's no real student to attach a session or result to.
  if (window.ZEVA_MODE === 'lan' && !state.student.isTrial) {
    const { session } = await DataStore.startExamSession({
      studentId: state.student.id,
      examId: exam.id,
      overrideSeconds,
    });
    state.sessionId = session.id;
    state.subjects = session.subjects;
    state.questionsBySubject = session.questionsBySubject;
    state.activeSubjectId = session.activeSubjectId;
    state.currentQuestionId = session.currentQuestionId;
    state.answers = session.answers;
    state.flagged = session.flagged;
    state.secondsLeft = Math.max(0, Math.round((session.serverEndTime - Date.now()) / 1000));
    state.isPaused = session.status === 'paused';
    state.screen = 'exam';
    render();
    startTimer();
    startReconciliation();
    return;
  }

  const subjects = await DataStore.getSubjects(null, { isDemo: !!state.student.isTrial });
  state.subjects = subjects.filter(s => exam.subjectIds.includes(s.id));

  state.questionsBySubject = {};
  for (const subj of state.subjects) {
    const allQs = await DataStore.getQuestions(subj.id);
    let objectiveQs = allQs.filter(q => (q.questionType || 'objective') === 'objective');
    let theoryQs = allQs.filter(q => q.questionType === 'theory');

    if (exam.shuffleQuestions) objectiveQs = shuffleArray(objectiveQs);
    objectiveQs = objectiveQs.slice(0, exam.questionsPerSubject[subj.id] || objectiveQs.length);

    const objectiveMapped = exam.shuffleOptions
      ? objectiveQs.map(q => {
          const optionIndices = q.options.map((_, i) => i);
          const shuffled = shuffleArray(optionIndices);
          return {
            ...q,
            _displayOptions: shuffled.map(i => q.options[i]),
            _correctDisplayIndex: shuffled.indexOf(q.correctIndex),
          };
        })
      : objectiveQs.map(q => ({ ...q, _displayOptions: q.options, _correctDisplayIndex: q.correctIndex }));

    const theoryCount = (exam.theoryQuestionsPerSubject && exam.theoryQuestionsPerSubject[subj.id]) || 0;
    const theoryMapped = shuffleArray(theoryQs).slice(0, theoryCount);

    state.questionsBySubject[subj.id] = [...objectiveMapped, ...theoryMapped];
  }

  state.activeSubjectId = state.subjects[0]?.id || null;
  state.currentQuestionId = state.questionsBySubject[state.activeSubjectId]?.[0]?.id || null;
  state.answers = {};
  state.flagged = {};
  state.secondsLeft = overrideSeconds !== null ? overrideSeconds : exam.durationMinutes * 60;
  state.isPaused = false;
  state.screen = 'exam';
  render();
  startTimer();
}

/** LAN mode only: periodically re-sync secondsLeft with the server's clock
 * (corrects drift) and doubles as a heartbeat so the admin's live monitor
 * can tell this student is still connected. Also detects a genuinely
 * dropped connection (several consecutive failed pings, not just one
 * blip) and, if the exam has network-pause enabled, pauses the exam
 * server-side and logs the student out so they can safely resume once
 * reconnected — instead of silently burning down their timer offline.
 */
const NETWORK_DROP_FAILURE_THRESHOLD = 3; // consecutive missed pings (~15s at 5s interval)
function startReconciliation() {
  if (state.reconcileHandle) clearInterval(state.reconcileHandle);
  state.reconcileFailureCount = 0;
  state.reconcileHandle = setInterval(async () => {
    if (!state.sessionId || state.screen !== 'exam') return;
    try {
      const session = await DataStore.getSessionSnapshot(state.sessionId);
      state.reconcileFailureCount = 0;
      if (session.status === 'paused') return;
      state.secondsLeft = Math.max(0, Math.round((session.serverEndTime - Date.now()) / 1000));
      updateTimerDisplay();
    } catch (e) {
      // Server unreachable this tick — local countdown keeps running, and
      // a single blip is not treated as a real disconnect (Wi-Fi hiccups,
      // a momentary router hop, etc. are normal on a school LAN). Only a
      // run of consecutive failures is treated as a genuine drop.
      state.reconcileFailureCount = (state.reconcileFailureCount || 0) + 1;
      if (state.reconcileFailureCount >= NETWORK_DROP_FAILURE_THRESHOLD && state.exam?.allowNetworkPause) {
        handleNetworkDrop();
      }
    }
  }, 5000);
}

/** Fired once a real (multi-ping) connection drop is detected on an exam
 * that has network-pause enabled. Pauses locally right away so the
 * countdown stops burning immediately, then keeps retrying the pause
 * call to the server in the background (since the server is, by
 * definition, unreachable right now) until it succeeds or the student's
 * browser/tab closes. Once paused server-side, logs the student out to
 * the login screen — they resume via the existing "resume paused exam"
 * prompt once they log back in with a working connection. */
let networkDropHandling = false;
async function handleNetworkDrop() {
  if (networkDropHandling || state.screen !== 'exam') return;
  networkDropHandling = true;
  stopAntiCheatWatch();
  if (state.timerHandle) clearInterval(state.timerHandle);
  if (state.reconcileHandle) clearInterval(state.reconcileHandle);

  state.isPaused = true;
  const overlay = document.getElementById('pause-overlay');
  if (overlay) {
    overlay.innerHTML = `
      <div class="pause-card">
        <img src="assets/logo-icon.png" alt="" class="pause-logo" />
        <h2>Connection lost</h2>
        <p>Your exam has been paused because the connection to the school server was lost. Your answers and time remaining are safe. Reconnect and log back in to continue exactly where you left off.</p>
        <div class="pause-timer mono">${formatTime(state.secondsLeft)}</div>
      </div>
    `;
    overlay.style.display = 'flex';
  }

  const sessionIdAtDrop = state.sessionId;
  // Keep trying to tell the server to pause (it's currently unreachable,
  // that's the whole reason we're here) so the authoritative record is
  // correct as soon as connectivity returns, even if the student closes
  // the tab before it succeeds.
  const retryPause = setInterval(async () => {
    try {
      await DataStore.pauseExamSession(sessionIdAtDrop);
      clearInterval(retryPause);
    } catch (e) {
      // still unreachable — keep retrying
    }
  }, 4000);

  // Give the server a brief window to come back and accept the pause
  // before logging the student out to the login screen. If it's still
  // down after this, log out anyway — the pause will finish registering
  // in the background retry above once connectivity returns, and the
  // student can safely log back in and resume either way.
  setTimeout(async () => {
    await DataStore.clearActiveSession().catch(() => {});
    networkDropHandling = false;
    state.sessionId = null;
    state.screen = 'section-select';
    state.student = null;
    state.exam = null;
    state.isPaused = false;
    render();
  }, 6000);
}

function startTimer() {
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = setInterval(() => {
    if (state.isPaused) return;
    state.secondsLeft--;
    updateTimerDisplay();
    if (state.secondsLeft <= 0) {
      clearInterval(state.timerHandle);
      submitExam(true);
    }
  }, 1000);
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimerDisplay() {
  const pill = document.getElementById('timer-pill');
  if (!pill) return;
  pill.textContent = formatTime(Math.max(0, state.secondsLeft));
  pill.className = 'timer-pill';
  if (state.secondsLeft <= 60) pill.classList.add('critical');
  else if (state.secondsLeft <= 300) pill.classList.add('warning');
}

function getCurrentQuestion() {
  const list = state.questionsBySubject[state.activeSubjectId] || [];
  return list.find(q => q.id === state.currentQuestionId) || list[0];
}

function renderExam() {
  const exam = state.exam;
  const currentQ = getCurrentQuestion();
  const allQuestionsFlat = Object.values(state.questionsBySubject).flat();
  const answeredCount = Object.keys(state.answers).length;

  root.innerHTML = `
    <div class="exam-screen">
      <div class="exam-topbar">
        <div class="exam-topbar-student">
          <div class="student-photo-badge">
            ${state.student.photo ? `<img src="${state.student.photo}" alt="" />` : `<span>${escapeHtml((state.student.fullName || '?').charAt(0))}</span>`}
          </div>
          <div>
            <div class="student-name">${escapeHtml(state.student.fullName)}</div>
            <div class="exam-name">${escapeHtml(exam.title)}</div>
          </div>
        </div>
        <div class="exam-topbar-actions">
          ${(exam.allowPause && state.student.isTrial) ? `<button class="btn-pause" id="btn-pause">${ZevaIcons.pause()} Pause</button>` : ''}
          <div class="timer-pill" id="timer-pill">${formatTime(state.secondsLeft)}</div>
          <button class="btn-calc-toggle" id="btn-calc-toggle" title="Calculator">${ZevaIcons.calculator()}</button>
          <button class="btn-logout" id="btn-logout" title="Log out">${ZevaIcons.logout()}</button>
        </div>
      </div>

      <div class="subject-tabs">
        ${state.subjects.map(s => `
          <button class="subject-tab ${s.id === state.activeSubjectId ? 'active' : ''}" data-subject="${s.id}">
            ${escapeHtml(s.name)}
          </button>
        `).join('')}
      </div>

      <div class="exam-body">
        <div class="question-panel" id="question-panel"></div>
        <div class="exam-sidebar">
          <div class="sidebar-brand">
            <div class="brand-mark">
              <img src="assets/logo-icon.png" class="brand-icon-img" alt="" style="width:22px;height:22px;" />
              <div>ZEVA CBT<small>QUESTION NAVIGATOR</small></div>
            </div>
          </div>

          <div class="progress-summary" id="progress-summary">
            <span>${answeredCount} / ${allQuestionsFlat.length} answered</span>
          </div>

          <div class="legend">
            <div class="legend-item"><span class="legend-dot" style="background:var(--verdant)"></span>Answered</div>
            <div class="legend-item"><span class="legend-dot" style="background:var(--signal-amber)"></span>Flagged</div>
            <div class="legend-item"><span class="legend-dot" style="background:var(--line)"></span>Unanswered</div>
          </div>

          <div class="sidebar-section-title">${escapeHtml(state.subjects.find(s => s.id === state.activeSubjectId)?.name || '')}</div>
          <div class="palette-grid" id="palette-grid"></div>

          <div class="sidebar-footer">
            <button class="btn-submit-exam" id="btn-submit">Submit exam</button>
          </div>
        </div>
      </div>
    </div>

    <div class="calculator-widget" id="calculator-widget" style="display:none;"></div>
    <div class="pause-overlay" id="pause-overlay" style="display:none;">
      <div class="pause-card">
        <img src="assets/logo-icon.png" alt="" class="pause-logo" />
        <h2>Exam paused</h2>
        <p>Your progress and time remaining are saved. Click resume when you're ready to continue.</p>
        <div class="pause-timer mono">${formatTime(state.secondsLeft)}</div>
        <button class="btn-primary" id="btn-resume" style="width:auto; padding:13px 32px;">Resume exam</button>
      </div>
    </div>
  `;

  renderQuestionPanel(currentQ);
  renderPaletteGrid();
  renderCalculator();

  document.querySelectorAll('.subject-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeSubjectId = btn.dataset.subject;
      state.currentQuestionId = state.questionsBySubject[state.activeSubjectId]?.[0]?.id;
      renderQuestionPanel(getCurrentQuestion());
      renderPaletteGrid();
      document.querySelectorAll('.subject-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.sidebar-section-title`).textContent =
        state.subjects.find(s => s.id === state.activeSubjectId)?.name || '';
    });
  });

  document.getElementById('btn-submit').addEventListener('click', async () => {
    const confirmed = await zevaModal.confirm({
      title: 'Submit your exam now?',
      message: 'You cannot change your answers after this. Make sure you have reviewed every subject before continuing.',
      confirmText: 'Submit exam',
      cancelText: 'Go back',
      tone: 'danger',
    });
    if (confirmed) submitExam(false);
  });

  document.getElementById('btn-calc-toggle').addEventListener('click', () => {
    const widget = document.getElementById('calculator-widget');
    widget.style.display = widget.style.display === 'none' ? 'flex' : 'none';
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    const confirmed = await zevaModal.confirm({
      title: 'Log out?',
      message: 'If you log out now without submitting, your progress will be lost unless pausing is enabled for this exam.',
      confirmText: 'Log out',
      cancelText: 'Stay',
      tone: 'danger',
    });
    if (confirmed) {
      ttsStop();
      stopAntiCheatWatch();
      if (state.timerHandle) clearInterval(state.timerHandle);
      if (state.reconcileHandle) clearInterval(state.reconcileHandle);
      await DataStore.clearActiveSession();
      state.sessionId = null;
      state.screen = 'section-select';
      state.student = null;
      state.exam = null;
      render();
    }
  });

  if (exam.allowPause && state.student.isTrial) {
    document.getElementById('btn-pause').addEventListener('click', pauseExam);
    document.getElementById('btn-resume').addEventListener('click', resumeExam);
  }

  if (exam.antiCheatAutoSubmit !== false) {
    startAntiCheatWatch();
  }
}

// ---------------------------------------------------------------
// ANTI-CHEAT: AUTO-SUBMIT ON FOCUS LOSS
// ---------------------------------------------------------------
// Detects the exam window/tab being minimised, switched away from,
// covered by another window, or the browser/app losing OS-level focus,
// and immediately auto-submits. Applies to both the desktop LAN client
// and the mobile practice app (same web engine underneath).
//
// What this catches:
//  - Switching to another browser tab or application (visibilitychange)
//  - Minimising the window (visibilitychange fires 'hidden')
//  - Another window/app overlaying the exam (blur — OS focus moves away)
//  - Alt-tab / task-switching on desktop, app-switching on mobile
//  - Locking the screen (visibilitychange fires 'hidden')
//
// What this deliberately does NOT catch (by design, to avoid false
// positives that would unfairly submit a student's exam):
//  - Opening the in-app calculator (stays within the same window/focus)
//  - Clicking within the exam page itself
//  - The confirm/alert modals this app itself opens (checked below)
let antiCheatActive = false;
let antiCheatTriggered = false;

function startAntiCheatWatch() {
  if (antiCheatActive) return;
  antiCheatActive = true;
  antiCheatTriggered = false;
  document.addEventListener('visibilitychange', handleAntiCheatVisibilityChange);
  window.addEventListener('blur', handleAntiCheatBlur);
}

function stopAntiCheatWatch() {
  antiCheatActive = false;
  document.removeEventListener('visibilitychange', handleAntiCheatVisibilityChange);
  window.removeEventListener('blur', handleAntiCheatBlur);
}

function handleAntiCheatVisibilityChange() {
  if (!antiCheatActive || state.isPaused) return;
  if (document.hidden) {
    triggerAntiCheatAutoSubmit('The exam window was minimised or switched away from.');
  }
}

function handleAntiCheatBlur() {
  if (!antiCheatActive || state.isPaused) return;
  // A short delay lets legitimate same-window focus shifts (e.g. this
  // app's own modal dialogs, or the on-screen keyboard on mobile) settle
  // before deciding the exam window has genuinely lost focus to
  // something else. If focus is still away after the delay, treat it
  // as the student having switched to another app/window.
  setTimeout(() => {
    if (!antiCheatActive || state.isPaused) return;
    if (document.hasFocus()) return; // focus returned — false alarm
    triggerAntiCheatAutoSubmit('The exam window lost focus to another application.');
  }, 400);
}

function triggerAntiCheatAutoSubmit(reason) {
  if (antiCheatTriggered || state.screen !== 'exam') return;
  antiCheatTriggered = true;
  stopAntiCheatWatch();
  state.antiCheatReason = reason;
  submitExam(true, 'anti_cheat');
}

function autoSubmitMessage(reason) {
  if (reason === 'anti_cheat') return 'Auto-submitted: the exam window was left, minimised, or lost focus.';
  if (reason === 'network_drop') return 'Auto-submitted: connection to the server was lost and could not be resumed in time.';
  return 'Auto-submitted when time expired.';
}

async function pauseExam() {
  ttsStop();
  state.isPaused = true;
  document.getElementById('pause-overlay').style.display = 'flex';

  if (window.ZEVA_MODE === 'lan' && state.sessionId) {
    await DataStore.pauseExamSession(state.sessionId);
    return;
  }

  await DataStore.saveActiveSession({
    studentId: state.student.id,
    examId: state.exam.id,
    subjects: state.subjects,
    questionsBySubject: state.questionsBySubject,
    activeSubjectId: state.activeSubjectId,
    answers: state.answers,
    flagged: state.flagged,
    currentQuestionId: state.currentQuestionId,
    secondsLeft: state.secondsLeft,
    isPaused: true,
  });
}

async function resumeExam() {
  state.isPaused = false;
  document.getElementById('pause-overlay').style.display = 'none';

  if (window.ZEVA_MODE === 'lan' && state.sessionId) {
    const session = await DataStore.resumeExamSession(state.sessionId);
    state.secondsLeft = Math.max(0, Math.round((session.serverEndTime - Date.now()) / 1000));
    updateTimerDisplay();
  }
}

// ---------------------------------------------------------------
// CALCULATOR (normal + scientific)
// ---------------------------------------------------------------
function renderCalculator() {
  const widget = document.getElementById('calculator-widget');
  widget.innerHTML = `
    <div class="calc-card">
      <div class="calc-header">
        <span>Calculator</span>
        <div class="calc-mode-toggle">
          <button class="calc-mode-btn active" data-mode="normal">Normal</button>
          <button class="calc-mode-btn" data-mode="scientific">Scientific</button>
        </div>
        <button class="calc-close" id="calc-close">&times;</button>
      </div>
      <input type="text" class="calc-display" id="calc-display" readonly value="0" />
      <div class="calc-grid" id="calc-grid"></div>
    </div>
  `;

  let mode = 'normal';
  let expression = '';

  const normalKeys = ['C', '⌫', '%', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '=', ''];
  const sciKeys = ['sin', 'cos', 'tan', 'C', 'log', 'ln', '(', ')', '7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+', '√', '^', '⌫', '%'];

  function renderKeys() {
    const grid = document.getElementById('calc-grid');
    const keys = mode === 'normal' ? normalKeys : sciKeys;
    grid.className = `calc-grid ${mode === 'scientific' ? 'calc-grid-sci' : ''}`;
    grid.innerHTML = keys.map(k => k === '' ? '<div></div>' : `<button class="calc-key" data-key="${k}">${k}</button>`).join('');
    grid.querySelectorAll('.calc-key').forEach(btn => {
      btn.addEventListener('click', () => handleKey(btn.dataset.key));
    });
  }

  function handleKey(key) {
    const display = document.getElementById('calc-display');
    if (key === 'C') { expression = ''; display.value = '0'; return; }
    if (key === '⌫') { expression = expression.slice(0, -1); display.value = expression || '0'; return; }
    if (key === '=') {
      try {
        let evalExpr = expression
          .replace(/√/g, 'Math.sqrt')
          .replace(/\^/g, '**')
          .replace(/sin/g, 'Math.sin')
          .replace(/cos/g, 'Math.cos')
          .replace(/tan/g, 'Math.tan')
          .replace(/log/g, 'Math.log10')
          .replace(/ln/g, 'Math.log');
        // eslint-disable-next-line no-eval
        const result = eval(evalExpr);
        display.value = Number.isFinite(result) ? String(Math.round(result * 1e8) / 1e8) : 'Error';
        expression = Number.isFinite(result) ? String(result) : '';
      } catch (e) {
        display.value = 'Error';
        expression = '';
      }
      return;
    }
    expression += key;
    display.value = expression;
  }

  document.querySelectorAll('.calc-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      document.querySelectorAll('.calc-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderKeys();
    });
  });

  document.getElementById('calc-close').addEventListener('click', () => {
    widget.style.display = 'none';
  });

  renderKeys();
}

// ---------------------------------------------------------------
// TEXT-TO-SPEECH (offline — uses the browser's built-in speech engine)
// ---------------------------------------------------------------
let _ttsVoicesReady = false;
let _ttsWarnedNoVoices = false;

function ttsGetVoices() {
  return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}

/** Android Chrome (and some WebViews) load TTS voices asynchronously — calling
 * .speak() before they're ready silently does nothing, with no error thrown.
 * This waits for the 'voiceschanged' event (or a short timeout) once, so the
 * first read-aloud attempt on a device actually has voices to use. */
function ttsEnsureVoicesLoaded() {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) return resolve(false);
    if (ttsGetVoices().length > 0) { _ttsVoicesReady = true; return resolve(true); }

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      _ttsVoicesReady = ok;
      resolve(ok);
    };

    window.speechSynthesis.addEventListener('voiceschanged', () => {
      finish(ttsGetVoices().length > 0);
    }, { once: true });

    // Some Android builds never fire voiceschanged reliably — fall back to a timeout.
    setTimeout(() => finish(ttsGetVoices().length > 0), 1200);
  });
}

async function ttsSpeak(question) {
  if (!window.speechSynthesis) {
    if (!_ttsWarnedNoVoices) {
      _ttsWarnedNoVoices = true;
      await zevaModal.alert({
        title: 'Read-aloud not available',
        message: 'This browser does not support text-to-speech. Try a recent version of Chrome.',
      });
    }
    return;
  }

  if (!_ttsVoicesReady) {
    await ttsEnsureVoicesLoaded();
  }
  const voices = ttsGetVoices();
  if (voices.length === 0) {
    if (!_ttsWarnedNoVoices) {
      _ttsWarnedNoVoices = true;
      await zevaModal.alert({
        title: 'No voice available on this device',
        message: 'Your device doesn\'t have a text-to-speech voice installed. On Android, check Settings → Accessibility → Text-to-speech output, and make sure a voice/language is downloaded, then try again.',
      });
    }
    return;
  }

  window.speechSynthesis.cancel();

  let text = question.text + '. ';
  if (question.questionType === 'theory') {
    text += 'This is a written answer question. Type your response in the box provided.';
  } else {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    question._displayOptions.forEach((opt, i) => {
      text += `Option ${letters[i] || i + 1}: ${opt}. `;
    });
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  const preferredVoice = voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
  if (preferredVoice) utterance.voice = preferredVoice;

  // A short delay between cancel() and speak() avoids a known Chrome/Android
  // bug where speak() called immediately after cancel() is silently dropped.
  setTimeout(() => {
    try {
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('TTS speak error', e);
    }
  }, 60);
}

function ttsStop() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function renderQuestionPanel(question) {
  const panel = document.getElementById('question-panel');
  if (!question) {
    panel.innerHTML = `<p>No questions available for this subject.</p>`;
    return;
  }
  const list = state.questionsBySubject[state.activeSubjectId];
  const indexInSubject = list.findIndex(q => q.id === question.id);
  const isFlagged = !!state.flagged[question.id];
  const isTheory = question.questionType === 'theory';
  const selectedIndex = state.answers[question.id];

  panel.innerHTML = `
    <div class="question-topline">
      <div class="question-number-tag">
        Question ${indexInSubject + 1} of ${list.length}
        ${isTheory ? `<span class="theory-badge">Essay &middot; ${question.maxMarks || 10} marks</span>` : ''}
      </div>
      <button class="tts-toggle-btn ${state.ttsEnabled ? 'active' : ''}" id="btn-tts" title="Read question aloud">
        ${state.ttsEnabled ? ZevaIcons.speaker() : ZevaIcons.speakerMuted()} ${state.ttsEnabled ? 'Reading aloud' : 'Read aloud'}
      </button>
    </div>
    ${question.imageData ? `<img src="${question.imageData}" alt="Question diagram" class="question-image" />` : ''}
    <div class="question-text">${escapeHtml(question.text)}</div>
    ${isTheory ? `
      <textarea class="theory-answer-box" id="theory-answer-input" placeholder="Type your answer here...">${escapeHtml(state.answers[question.id] || '')}</textarea>
    ` : `
      <div class="options-list">
        ${question._displayOptions.map((opt, i) => `
          <div class="option-row ${selectedIndex === i ? 'selected' : ''}" data-option="${i}">
            <div class="option-letter">${String.fromCharCode(65 + i)}</div>
            <div class="option-text">${escapeHtml(opt)}</div>
          </div>
        `).join('')}
      </div>
    `}
    <div class="question-nav-buttons">
      <button class="flag-btn ${isFlagged ? 'flagged' : ''}" id="btn-flag">${isFlagged ? ZevaIcons.starFilled() : ZevaIcons.starOutline()} ${isFlagged ? 'Flagged for review' : 'Flag for review'}</button>
      <div style="display:flex; gap:10px;">
        <button class="btn-secondary" id="btn-prev" ${indexInSubject === 0 ? 'disabled style="opacity:0.4"' : ''}>Previous</button>
        <button class="btn-secondary" id="btn-next" ${indexInSubject === list.length - 1 ? 'disabled style="opacity:0.4"' : ''}>Next</button>
      </div>
    </div>
  `;

  document.getElementById('btn-tts').addEventListener('click', () => {
    state.ttsEnabled = !state.ttsEnabled;
    if (state.ttsEnabled) {
      ttsSpeak(question);
    } else {
      ttsStop();
    }
    renderQuestionPanel(question);
  });

  if (state.ttsEnabled) ttsSpeak(question);

  if (isTheory) {
    const textarea = document.getElementById('theory-answer-input');
    let saveTimeout = null;
    textarea.addEventListener('input', () => {
      state.answers[question.id] = textarea.value;
      renderPaletteGrid();
      if (window.ZEVA_MODE === 'lan' && state.sessionId) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          DataStore.answerQuestion(state.sessionId, question.id, textarea.value).catch(() => {});
        }, 800);
      }
    });
  } else {
    panel.querySelectorAll('.option-row').forEach(row => {
      row.addEventListener('click', () => {
        const optionIndex = parseInt(row.dataset.option, 10);
        state.answers[question.id] = optionIndex;
        renderQuestionPanel(question);
        renderPaletteGrid();
        if (window.ZEVA_MODE === 'lan' && state.sessionId) {
          DataStore.answerQuestion(state.sessionId, question.id, optionIndex).catch(() => {});
        }
      });
    });
  }

  document.getElementById('btn-flag').addEventListener('click', () => {
    state.flagged[question.id] = !state.flagged[question.id];
    renderQuestionPanel(question);
    renderPaletteGrid();
    if (window.ZEVA_MODE === 'lan' && state.sessionId) {
      DataStore.flagQuestion(state.sessionId, question.id, state.flagged[question.id]).catch(() => {});
    }
  });

  document.getElementById('btn-prev').addEventListener('click', () => {
    if (indexInSubject > 0) {
      state.currentQuestionId = list[indexInSubject - 1].id;
      renderQuestionPanel(getCurrentQuestion());
      renderPaletteGrid();
    }
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    if (indexInSubject < list.length - 1) {
      state.currentQuestionId = list[indexInSubject + 1].id;
      renderQuestionPanel(getCurrentQuestion());
      renderPaletteGrid();
    }
  });
}

function updateProgressSummary() {
  const summary = document.getElementById('progress-summary');
  if (!summary) return;
  const allQuestionsFlat = Object.values(state.questionsBySubject).flat();
  const answeredCount = Object.keys(state.answers).length;
  summary.querySelector('span').textContent = `${answeredCount} / ${allQuestionsFlat.length} answered`;
}

function renderPaletteGrid() {
  const grid = document.getElementById('palette-grid');
  if (!grid) return;
  updateProgressSummary();
  const list = state.questionsBySubject[state.activeSubjectId] || [];
  grid.innerHTML = list.map((q, i) => {
    const answered = state.answers[q.id] !== undefined;
    const flagged = !!state.flagged[q.id];
    const current = q.id === state.currentQuestionId;
    return `
      <div class="palette-cell ${answered ? 'answered' : ''} ${flagged ? 'flagged' : ''} ${current ? 'current' : ''}" data-qid="${q.id}">
        <div class="fill"></div>
        <span>${i + 1}</span>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.palette-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      state.currentQuestionId = cell.dataset.qid;
      renderQuestionPanel(getCurrentQuestion());
      renderPaletteGrid();
    });
  });
}

// ---------------------------------------------------------------
// SUBMIT + RESULTS
// ---------------------------------------------------------------
async function submitExam(isAutoSubmit, autoSubmitReason = null) {
  ttsStop();
  stopAntiCheatWatch();
  if (state.timerHandle) clearInterval(state.timerHandle);
  if (state.reconcileHandle) clearInterval(state.reconcileHandle);

  if (window.ZEVA_MODE === 'lan' && state.sessionId) {
    const { result } = await DataStore.submitExamSession(state.sessionId, { autoSubmitted: isAutoSubmit, autoSubmitReason });
    state.lastResult = { ...result, isTrial: false };
    state.screen = 'results';
    render();
    return;
  }

  await DataStore.clearActiveSession();

  const subjectResults = [];
  let totalCorrect = 0;
  let totalQuestions = 0;
  const theoryAnswers = [];

  for (const subj of state.subjects) {
    const qs = state.questionsBySubject[subj.id] || [];
    const objectiveQs = qs.filter(q => q.questionType !== 'theory');
    let correct = 0;
    objectiveQs.forEach(q => {
      totalQuestions++;
      if (state.answers[q.id] === q._correctDisplayIndex) {
        correct++;
        totalCorrect++;
      }
    });
    subjectResults.push({
      subjectId: subj.id,
      subjectName: subj.name,
      correct,
      total: objectiveQs.length,
      percent: objectiveQs.length ? Math.round((correct / objectiveQs.length) * 100) : 0,
    });

    qs.filter(q => q.questionType === 'theory').forEach(q => {
      theoryAnswers.push({
        subjectId: subj.id,
        subjectName: subj.name,
        questionId: q.id,
        questionText: q.text,
        maxMarks: q.maxMarks || 10,
        answerText: state.answers[q.id] || '',
        awardedMarks: null,
        graded: false,
      });
    });
  }

  const overallPercent = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const passed = overallPercent >= (state.exam.passMarkPercent || 50);
  const timeUsedSeconds = (state.exam.durationMinutes * 60) - state.secondsLeft;

  const result = {
    studentId: state.student.id,
    studentName: state.student.fullName,
    studentPhoto: state.student.photo || null,
    regNumber: state.student.regNumber,
    examNumber: state.student.examNumber,
    examId: state.exam.id,
    examTitle: state.exam.title,
    section: state.section,
    subjectResults,
    totalCorrect,
    totalQuestions,
    overallPercent,
    passed,
    autoSubmitted: isAutoSubmit,
    autoSubmitReason,
    isTrial: !!state.student.isTrial,
    secondsLeftAtSubmit: state.secondsLeft,
    timeUsedSeconds,
    theoryAnswers,
    theoryMarksAwarded: 0,
    theoryFullyGraded: theoryAnswers.length === 0,
  };

  if (!state.student.isTrial) {
    await DataStore.saveResult(result);
  }
  state.lastResult = result;
  state.screen = 'results';
  render();
}

function renderAnswerReviewHtml() {
  let html = '<h3 class="review-heading">Answer Review</h3>';
  for (const subj of state.subjects) {
    const qs = state.questionsBySubject[subj.id] || [];
    html += `<div class="review-subject-title">${escapeHtml(subj.name)}</div>`;
    qs.forEach((q, i) => {
      const studentIdx = state.answers[q.id];
      const correctIdx = q._correctDisplayIndex;
      const wasCorrect = studentIdx === correctIdx;
      html += `
        <div class="review-question ${wasCorrect ? 'review-correct' : 'review-wrong'}">
          <div class="review-q-header">
            <span class="review-q-num">Q${i + 1}</span>
            <span class="review-q-status">${wasCorrect ? ZevaIcons.checkCircle() : ZevaIcons.crossCircle()} ${wasCorrect ? 'Correct' : 'Incorrect'}</span>
          </div>
          <div class="review-q-text">${escapeHtml(q.text)}</div>
          <div class="review-options">
            ${q._displayOptions.map((opt, idx) => {
              let cls = '';
              if (idx === correctIdx) cls = 'review-opt-correct';
              else if (idx === studentIdx) cls = 'review-opt-wrong';
              return `<div class="review-option ${cls}">
                <span class="review-opt-letter">${String.fromCharCode(65 + idx)}</span>
                <span>${escapeHtml(opt)}</span>
                ${idx === correctIdx ? '<span class="review-tag">Correct answer</span>' : ''}
                ${idx === studentIdx && !wasCorrect ? '<span class="review-tag review-tag-wrong">Your answer</span>' : ''}
              </div>`;
            }).join('')}
            ${studentIdx === undefined ? '<div class="review-not-answered">You did not answer this question.</div>' : ''}
          </div>
        </div>
      `;
    });
  }
  return html;
}

function renderResults() {
  const r = state.lastResult;
  const exam = state.exam;
  const canResit = exam.resitPolicy && exam.resitPolicy !== 'not_allowed';
  const canReview = r.isTrial || exam.allowReview !== false;

  root.innerHTML = `
    <div class="results-screen">
      <div class="results-card">
        <div class="results-hero">
          <div class="brand-mark" style="justify-content:center;">
            <img src="assets/logo-icon.png" class="brand-icon-img" alt="" />
            <div>ZEVA CBT<small>BY ZEUS TECHNOLOGIES INNOVATIONS &middot; RESULT SLIP</small></div>
          </div>
          <div class="results-score-big">${r.overallPercent}%</div>
          <div>${r.totalCorrect} of ${r.totalQuestions} questions correct</div>
          <div class="results-verdict ${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASSED' : 'BELOW PASS MARK'}</div>
          ${r.isTrial ? '<div style="margin-top:10px; font-size:12px; color:var(--slate-light);">Mock trial — not saved to official records</div>' : ''}
          ${r.autoSubmitted ? `<div style="margin-top:6px; font-size:12px; color:var(--slate-light);">${escapeHtml(autoSubmitMessage(r.autoSubmitReason))}</div>` : ''}
        </div>

        <div class="results-breakdown">
          ${r.subjectResults.map(sr => `
            <div class="breakdown-row">
              <div class="subject-name">${escapeHtml(sr.subjectName)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${sr.percent}%"></div></div>
              <div class="subject-score">${sr.correct}/${sr.total}</div>
            </div>
          `).join('')}
        </div>

        <div class="results-actions">
          ${canReview ? '<button class="btn-secondary" id="btn-review">Review answers</button>' : ''}
          ${canResit ? '<button class="btn-secondary" id="btn-resit">Retake exam</button>' : ''}
          <button class="btn-secondary" id="btn-restart">Done</button>
        </div>

        ${canReview ? `<div class="answer-review" id="answer-review" style="display:none;"></div>` : ''}
      </div>
    </div>
  `;

  if (canReview) {
    document.getElementById('btn-review').addEventListener('click', () => {
      const reviewPanel = document.getElementById('answer-review');
      const isOpen = reviewPanel.style.display !== 'none';
      if (isOpen) {
        reviewPanel.style.display = 'none';
        return;
      }
      reviewPanel.style.display = 'block';
      reviewPanel.innerHTML = renderAnswerReviewHtml();
    });
  }

  document.getElementById('btn-restart').addEventListener('click', () => {
    state.screen = 'section-select';
    state.student = null;
    state.exam = null;
    state.sessionId = null;
    render();
  });

  if (canResit) {
    document.getElementById('btn-resit').addEventListener('click', async () => {
      if (exam.resitPolicy === 'remaining_time') {
        const confirmed = await zevaModal.confirm({
          title: 'Retake with remaining time?',
          message: `You will resit this exam with the time you had left: ${formatTime(r.secondsLeftAtSubmit)}. Continue?`,
          confirmText: 'Retake exam',
          cancelText: 'Cancel',
        });
        if (confirmed) beginExam(r.secondsLeftAtSubmit);
      } else {
        const confirmed = await zevaModal.confirm({
          title: 'Retake with full time?',
          message: `You will resit this exam with the full duration: ${exam.durationMinutes} minutes. Continue?`,
          confirmText: 'Retake exam',
          cancelText: 'Cancel',
        });
        if (confirmed) beginExam(null);
      }
    });
  }
}

// ---------------------------------------------------------------
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------
// INIT
// ---------------------------------------------------------------
(async function init() {
  showPreloader();
  await window.ZEVA_DATASTORE_READY;
  await DataStore.seedIfEmpty();
  if (typeof DataStore.seedDemoContentIfEmpty === 'function') {
    await DataStore.seedDemoContentIfEmpty();
  }
  render();
  hidePreloader();
})();
