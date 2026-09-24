/**
 * ADMIN APP — Zeva CBT admin console
 * staff login -> subjects / questions / import / students / exams / results
 */

const root = document.getElementById('root');

const state = {
  staff: null,
  tab: 'subjects',
  subjects: [],
  questions: [],
  exams: [],
  students: [],
  activeSubjectFilter: null,
  resultsSortBy: 'date',
  resultsSearch: '',
  viewingResultId: null,
};

/** Downscales and compresses an uploaded image via canvas before storing it,
 * to keep local/LAN storage reasonable. Returns a JPEG data URL. */
function compressImage(file, maxDimension = 900, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const scale = maxDimension / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function refreshData() {
  state.subjects = await DataStore.getSubjects();
  state.questions = await DataStore.getQuestions();
  state.exams = await DataStore.getExams();
  state.students = await DataStore.getStudents();
}

// ---------------------------------------------------------------
// STAFF LOGIN GATE
// ---------------------------------------------------------------
async function renderStaffLogin() {
  const existingStaff = await DataStore.getStaff();
  const isFirstRun = existingStaff.length === 0;

  root.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="brand-mark">
          <img src="assets/logo-icon.png" class="brand-icon-img" alt="" />
          <div>ZEVA CBT<small>ADMIN CONSOLE</small></div>
        </div>
        ${isFirstRun ? `
          <h1>Create the first admin account</h1>
          <p class="subtitle">No staff accounts exist yet on this installation. Set up the first one — choose any name and any code you like, you'll use it to log in from now on.</p>
        ` : `
          <h1>Staff login</h1>
          <p class="subtitle">Enter your name and staff profile code to access the admin dashboard.</p>
        `}

        <div class="field-group">
          <label>Staff name</label>
          <input type="text" id="staff-name" placeholder="e.g. Prince Oliver Emmanuel" autocomplete="off" />
        </div>
        <div class="field-group">
          <label>Staff profile code</label>
          <input type="text" id="staff-code" placeholder="e.g. ZTI-ADMIN-01" autocomplete="off" />
        </div>
        ${isFirstRun ? `
          <div class="field-group">
            <label>Role / title (optional)</label>
            <input type="text" id="staff-role" placeholder="e.g. Principal / System Administrator" autocomplete="off" />
          </div>
        ` : ''}

        <button class="btn-primary" id="btn-staff-login">${isFirstRun ? 'Create account and log in' : 'Log in'}</button>
        <div class="login-footer">
          <a href="index.html">&larr; Back to student app</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-staff-login').addEventListener('click', async () => {
    const name = document.getElementById('staff-name').value.trim();
    const code = document.getElementById('staff-code').value.trim();
    if (!name || !code) {
      await zevaModal.alert({ title: 'Missing details', message: 'Please enter both your name and staff profile code.' });
      return;
    }

    if (isFirstRun) {
      const role = document.getElementById('staff-role').value.trim();
      try {
        await DataStore.saveStaff({ name, staffCode: code, role, accountType: 'admin' });
      } catch (e) {
        await zevaModal.alert({ title: 'Could not create account', message: e.message || 'That staff code may already be in use.' });
        return;
      }
    }

    const loginResult = await DataStore.staffLogin(name, code);
    if (!loginResult) {
      await zevaModal.alert({ title: 'Access denied', message: 'No staff profile matches this code. Please check and try again.' });
      return;
    }
    state.staff = loginResult.staff;
    state.tab = loginResult.staff.accountType === 'teacher' ? 'results' : 'subjects';
    render();
  });
}

// ---------------------------------------------------------------
// MAIN SHELL
// ---------------------------------------------------------------
/** Shows a low-key warning in the admin sidebar once the current
 * activation plan (or free trial) is within a few days of expiring,
 * so admins can buy a plan/renewal before they're locked out
 * mid-exam-season. Returns an empty string (renders nothing) in
 * standalone mode, where there's no licensing, or once expiry is
 * comfortably far away. */
async function renderLicenseBanner() {
  if (window.ZEVA_MODE !== 'lan') return '';
  try {
    const res = await fetch('/api/license/status');
    if (!res.ok) return '';
    const status = await res.json();
    if (!status.activated) return '';

    if (status.source === 'trial') {
      // Trial banner always shows (not just near expiry) so it's clear
      // throughout the trial that it's temporary and a countdown is
      // running — the 4-day window is short enough that a 7-day
      // "getting close" threshold wouldn't make sense here.
      const urgent = status.daysRemaining <= 1;
      return `
        <div class="license-banner ${urgent ? 'urgent' : ''}" style="margin: 10px 0; padding: 10px 12px; border-radius: 8px; background: ${urgent ? 'rgba(220,53,69,0.15)' : 'rgba(31,138,95,0.15)'}; color: ${urgent ? '#ffb4bd' : '#8fe3bd'}; font-size: 12px; line-height: 1.5;">
          <strong>Free trial: ${status.daysRemaining} day${status.daysRemaining === 1 ? '' : 's'} left.</strong> Purchase a 30/60/90-day activation code from Zeus Technologies Innovations any time to continue after the trial ends.
        </div>
      `;
    }

    if (status.daysRemaining > 7) return '';
    const urgent = status.daysRemaining <= 2;
    return `
      <div class="license-banner ${urgent ? 'urgent' : ''}" style="margin: 10px 0; padding: 10px 12px; border-radius: 8px; background: ${urgent ? 'rgba(220,53,69,0.15)' : 'rgba(245,166,35,0.15)'}; color: ${urgent ? '#ffb4bd' : '#ffd88a'}; font-size: 12px; line-height: 1.5;">
        <strong>${status.daysRemaining} day${status.daysRemaining === 1 ? '' : 's'} left</strong> on this installation's ${status.plan ? status.plan.replace('T', '') + '-day' : ''} activation plan. Purchase a renewal code from Zeus Technologies Innovations to avoid interruption.
      </div>
    `;
  } catch (e) {
    return '';
  }
}

async function render() {
  showPreloader();
  if (!state.staff) {
    await renderStaffLogin();
    hidePreloader();
    return;
  }

  await refreshData();
  const licenseBanner = await renderLicenseBanner();
  root.innerHTML = `
    <div class="admin-shell">
      <div class="admin-sidebar">
        <div class="brand-mark" style="color:var(--white); margin-bottom: 20px;">
          <img src="assets/logo-icon.png" class="brand-icon-img" alt="" />
          <div>ZEVA CBT<small>ADMIN CONSOLE</small></div>
        </div>
        <div class="staff-badge">
          <div class="staff-badge-code mono">${escapeHtml(state.staff.staffCode)}</div>
          <div class="staff-badge-name">${escapeHtml(state.staff.name)}</div>
          <div class="staff-badge-role">${escapeHtml(state.staff.role || '')} ${state.staff.accountType === 'teacher' ? '<span class="mini-tag" style="background:var(--signal-amber-soft); color:#8a5a12;">Teacher</span>' : ''}</div>
        </div>
        ${licenseBanner}
        <nav class="admin-nav">
          ${state.staff.accountType !== 'teacher' ? `
            <button class="admin-nav-item ${state.tab === 'subjects' ? 'active' : ''}" data-tab="subjects">Subjects</button>
            <button class="admin-nav-item ${state.tab === 'questions' ? 'active' : ''}" data-tab="questions">Question Bank</button>
            <button class="admin-nav-item ${state.tab === 'import' ? 'active' : ''}" data-tab="import">Bulk Import</button>
            <button class="admin-nav-item ${state.tab === 'students' ? 'active' : ''}" data-tab="students">Students</button>
            <button class="admin-nav-item ${state.tab === 'exams' ? 'active' : ''}" data-tab="exams">Exams</button>
          ` : ''}
          <button class="admin-nav-item ${state.tab === 'results' ? 'active' : ''}" data-tab="results">Results &amp; Analysis</button>
          <button class="admin-nav-item ${state.tab === 'theory-grading' ? 'active' : ''}" data-tab="theory-grading">Theory Grading</button>
          ${state.staff.accountType !== 'teacher' ? `
            <button class="admin-nav-item ${state.tab === 'staff' ? 'active' : ''}" data-tab="staff">Staff Management</button>
            <button class="admin-nav-item ${state.tab === 'settings' ? 'active' : ''}" data-tab="settings">School Settings</button>
          ` : ''}
        </nav>
        <div class="admin-sidebar-footer">
          <a href="index.html" class="btn-ghost" style="color:var(--slate-light); display:block; margin-bottom:8px;">&larr; Back to student app</a>
          <a href="portal.html" class="btn-ghost" style="color:var(--slate-light); display:block; margin-bottom:8px;">Result portal &#8599;</a>
          <a href="about.html" class="btn-ghost" style="color:var(--slate-light); display:block; margin-bottom:8px;">About Zeva CBT</a>
          <button class="btn-ghost" id="btn-staff-logout" style="color:var(--slate-light); margin-bottom:8px;">Log out</button>
          ${state.staff.accountType !== 'teacher' ? `<button class="btn-ghost" id="btn-reset-data" style="color:var(--danger);">Reset all data</button>` : ''}
        </div>
      </div>
      <div class="admin-main" id="admin-main"></div>
    </div>
  `;

  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      state.viewingResultId = null;
      renderTabContent();
      document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('btn-staff-logout').addEventListener('click', () => {
    state.staff = null;
    render();
  });

  const resetBtn = document.getElementById('btn-reset-data');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const confirmed = await zevaModal.confirm({
        title: 'Reset all data?',
        message: 'This will permanently delete ALL subjects, questions, exams, students and results. This cannot be undone.',
        confirmText: 'Reset everything',
        cancelText: 'Cancel',
        tone: 'danger',
      });
      if (confirmed) {
        await DataStore.resetAllData();
        await DataStore.seedIfEmpty();
        render();
      }
    });
  }

  renderTabContent();
  hidePreloader();
}

function renderTabContent() {
  const main = document.getElementById('admin-main');
  if (state.tab === 'subjects') return renderSubjectsTab(main);
  if (state.tab === 'questions') return renderQuestionsTab(main);
  if (state.tab === 'import') return renderImportTab(main);
  if (state.tab === 'students') return renderStudentsTab(main);
  if (state.tab === 'exams') return renderExamsTab(main);
  if (state.tab === 'results') return renderResultsTab(main);
  if (state.tab === 'theory-grading') return renderTheoryGradingTab(main);
  if (state.tab === 'staff') return renderStaffTab(main);
  if (state.tab === 'settings') return renderSettingsTab(main);
}

// ---------------------------------------------------------------
// SUBJECTS TAB
// ---------------------------------------------------------------
function getGroupOptionsForSection(section) {
  if (section === 'high_school') return DataStore.HIGH_SCHOOL_GRADES;
  if (section === 'college') return DataStore.COLLEGE_TRACKS;
  if (section === 'professional') return DataStore.PROFESSIONAL_BODIES;
  return [];
}

function groupLabelForSection(section) {
  if (section === 'high_school') return 'Grade / Class';
  if (section === 'college') return 'Exam Track';
  if (section === 'professional') return 'Professional Body';
  return 'Group';
}

async function renderSubjectsTab(main) {
  const realSubjects = state.subjects.filter(s => !s.isDemo);
  const demoSubjects = await DataStore.getSubjects(null, { isDemo: true });

  main.innerHTML = `
    <div class="admin-header">
      <h1>Subjects</h1>
      <p>Create subjects under a specific section and grade/track/body — questions and exams are organized under these.</p>
    </div>
    <div class="admin-panel">
      <div class="field-group">
        <label>Section</label>
        <select id="new-subject-section">
          <option value="high_school">High School</option>
          <option value="college">College</option>
          <option value="professional">Professional</option>
        </select>
      </div>
      <div class="field-group">
        <label id="new-subject-group-label">Grade / Class</label>
        <select id="new-subject-group"></select>
      </div>
      <div class="inline-form">
        <input type="text" id="new-subject-name" placeholder="Subject name (e.g. Physics)" />
        <input type="text" id="new-subject-code" placeholder="Code (e.g. PHY)" style="max-width:120px;" />
        <button class="btn-primary" id="btn-add-subject" style="width:auto; padding:11px 20px;">Add subject</button>
      </div>
      <div class="field-group">
        <label><input type="checkbox" id="new-subject-is-demo" style="width:auto;" /> This is demo/practice content (available to students for practice, separate from live exams)</label>
      </div>

      ${['high_school', 'college', 'professional'].map(sec => {
        const groups = getGroupOptionsForSection(sec);
        const secSubjects = realSubjects.filter(s => s.section === sec);
        if (secSubjects.length === 0) return '';
        return `
          <div class="subject-group-block">
            <div class="subject-group-heading">${sectionLabel(sec)}</div>
            ${groups.map(grp => {
              const groupSubjects = secSubjects.filter(s => s.grade === grp);
              if (groupSubjects.length === 0) return '';
              return `
                <div class="subject-group-subheading">${escapeHtml(grp)}</div>
                <div class="data-table">
                  ${groupSubjects.map(s => {
                    const count = state.questions.filter(q => q.subjectId === s.id).length;
                    return `
                      <div class="table-row">
                        <div class="row-main">
                          <div class="row-title">${escapeHtml(s.name)}</div>
                          <div class="row-sub mono">${escapeHtml(s.code || '')} &middot; ${count} question${count === 1 ? '' : 's'}</div>
                        </div>
                        <button class="btn-ghost" style="color:var(--danger)" data-delete-subject="${s.id}">Delete</button>
                      </div>
                    `;
                  }).join('')}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }).join('') || '<div class="empty-state">No subjects yet. Add one above to get started.</div>'}
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">Demo / Practice content (${demoSubjects.length})</h3>
      <p class="hint-text">This content is available to students as a practice test — separate from live exams, and never mixed into a real exam's question pool.</p>
      ${['high_school', 'college', 'professional'].map(sec => {
        const groups = getGroupOptionsForSection(sec);
        const secSubjects = demoSubjects.filter(s => s.section === sec);
        if (secSubjects.length === 0) return '';
        return `
          <div class="subject-group-block">
            <div class="subject-group-heading">${sectionLabel(sec)}</div>
            ${[...new Set(secSubjects.map(s => s.grade))].map(grp => {
              const groupSubjects = secSubjects.filter(s => s.grade === grp);
              if (groupSubjects.length === 0) return '';
              return `
                <div class="subject-group-subheading">${escapeHtml(grp || 'General')}</div>
                <div class="data-table">
                  ${groupSubjects.map(s => {
                    const count = state.questions.filter(q => q.subjectId === s.id).length;
                    return `
                      <div class="table-row">
                        <div class="row-main">
                          <div class="row-title">${escapeHtml(s.name)} <span class="mini-tag">Demo</span></div>
                          <div class="row-sub mono">${escapeHtml(s.code || '')} &middot; ${count} question${count === 1 ? '' : 's'}</div>
                        </div>
                        <button class="btn-ghost" style="color:var(--danger)" data-delete-subject="${s.id}">Delete</button>
                      </div>
                    `;
                  }).join('')}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }).join('') || '<div class="empty-state">No demo content yet.</div>'}
    </div>
  `;

  function updateGroupOptions() {
    const section = document.getElementById('new-subject-section').value;
    document.getElementById('new-subject-group-label').textContent = groupLabelForSection(section);
    const groupSelect = document.getElementById('new-subject-group');
    groupSelect.innerHTML = getGroupOptionsForSection(section).map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
  }
  updateGroupOptions();
  document.getElementById('new-subject-section').addEventListener('change', updateGroupOptions);

  document.getElementById('btn-add-subject').addEventListener('click', async () => {
    const name = document.getElementById('new-subject-name').value.trim();
    const code = document.getElementById('new-subject-code').value.trim();
    const section = document.getElementById('new-subject-section').value;
    const grade = document.getElementById('new-subject-group').value;
    if (!name) return zevaModal.alert({ title: 'Missing name', message: 'Enter a subject name.' });
    const isDemo = document.getElementById('new-subject-is-demo').checked;
    const { subject, created } = await DataStore.findOrCreateSubject({ name, code, section, grade, isDemo });
    if (!created) {
      await zevaModal.alert({
        title: 'Subject already exists',
        message: `"${subject.name}" already exists for ${grade || 'this group'} in ${sectionLabel(section)}. Its existing question bank will be used — add questions to it from the Question Bank tab and they'll join what's already there.`,
      });
    }
    render();
  });

  main.querySelectorAll('[data-delete-subject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await zevaModal.confirm({
        title: 'Delete this subject?',
        message: 'This subject and all its questions will be permanently removed.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        tone: 'danger',
      });
      if (confirmed) {
        await DataStore.deleteSubject(btn.dataset.deleteSubject);
        render();
      }
    });
  });
}

function sectionLabel(section) {
  if (section === 'high_school') return 'High School';
  if (section === 'college') return 'College';
  if (section === 'professional') return 'Professional';
  return 'Unassigned';
}

// ---------------------------------------------------------------
// QUESTION BANK TAB (builder)
// ---------------------------------------------------------------
function renderQuestionsTab(main) {
  const filtered = state.activeSubjectFilter
    ? state.questions.filter(q => q.subjectId === state.activeSubjectFilter)
    : state.questions;

  main.innerHTML = `
    <div class="admin-header">
      <h1>Question Bank</h1>
      <p>Build questions one at a time. Use Bulk Import for adding many objective questions at once.</p>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">Add a new question</h3>
      <div class="field-group">
        <label>Subject</label>
        <select id="qb-subject">
          <option value="">Select subject</option>
          ${state.subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${sectionLabel(s.section)})</option>`).join('')}
        </select>
      </div>
      <div class="field-group">
        <label>Question type</label>
        <div class="qtype-toggle">
          <button type="button" class="qtype-btn active" data-qtype="objective" id="qtype-objective">Objective (multiple choice)</button>
          <button type="button" class="qtype-btn" data-qtype="theory" id="qtype-theory">Theory (essay)</button>
        </div>
      </div>
      <div class="field-group">
        <label>Question text</label>
        <textarea id="qb-text" rows="3" placeholder="Type the question here..."></textarea>
      </div>
      <div class="field-group">
        <label>Diagram / image (optional)</label>
        <div class="photo-preview" id="qb-image-preview" style="width:220px; height:140px;">
          <span>No image</span>
        </div>
        <input type="file" id="qb-image-input" accept="image/*" />
      </div>

      <div id="qb-objective-fields">
        <div class="field-group">
          <label>Options (mark the correct one)</label>
          <div id="qb-options">
            ${[0, 1, 2, 3].map(i => `
              <div class="option-input-row">
                <input type="radio" name="qb-correct" value="${i}" ${i === 0 ? 'checked' : ''} />
                <input type="text" class="qb-option-text" placeholder="Option ${String.fromCharCode(65 + i)}" />
              </div>
            `).join('')}
          </div>
        </div>
        <div class="field-group">
          <label>Explanation (optional — shown in review mode later)</label>
          <textarea id="qb-explanation" rows="2" placeholder="Why is this the correct answer?"></textarea>
        </div>
      </div>

      <div id="qb-theory-fields" style="display:none;">
        <div class="field-group">
          <label>Maximum marks</label>
          <input type="number" id="qb-max-marks" value="10" min="1" style="max-width:140px;" />
        </div>
      </div>

      <button class="btn-primary" id="btn-add-question" style="width:auto; padding:12px 24px;">Add question</button>
    </div>

    <div class="admin-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 class="panel-title" style="margin:0;">All questions (${filtered.length})</h3>
        <select id="qb-filter" style="max-width:220px;">
          <option value="">All subjects</option>
          ${state.subjects.map(s => `<option value="${s.id}" ${state.activeSubjectFilter === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="data-table">
        ${filtered.length === 0 ? '<div class="empty-state">No questions found.</div>' : ''}
        ${filtered.map(q => {
          const subj = state.subjects.find(s => s.id === q.subjectId);
          const isTheory = q.questionType === 'theory';
          return `
            <div class="table-row">
              <div class="row-main">
                <div class="row-title">${escapeHtml(q.text)} ${q.imageData ? '<span class="mini-tag">Has image</span>' : ''}</div>
                <div class="row-sub">${escapeHtml(subj?.name || 'Unknown subject')} &middot; ${isTheory ? `Theory &middot; ${q.maxMarks || 10} marks` : `Correct: ${String.fromCharCode(65 + q.correctIndex)}. ${escapeHtml(q.options[q.correctIndex])}`}</div>
              </div>
              <button class="btn-ghost" style="color:var(--danger)" data-delete-q="${q.id}">Delete</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  let currentQType = 'objective';
  let pendingQuestionImage = null;

  document.getElementById('qtype-objective').addEventListener('click', () => setQType('objective'));
  document.getElementById('qtype-theory').addEventListener('click', () => setQType('theory'));

  function setQType(type) {
    currentQType = type;
    document.getElementById('qtype-objective').classList.toggle('active', type === 'objective');
    document.getElementById('qtype-theory').classList.toggle('active', type === 'theory');
    document.getElementById('qb-objective-fields').style.display = type === 'objective' ? 'block' : 'none';
    document.getElementById('qb-theory-fields').style.display = type === 'theory' ? 'block' : 'none';
  }

  document.getElementById('qb-image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, 900, 0.8).then((dataUrl) => {
      pendingQuestionImage = dataUrl;
      document.getElementById('qb-image-preview').innerHTML = `<img src="${dataUrl}" alt="" />`;
    });
  });

  document.getElementById('btn-add-question').addEventListener('click', async () => {
    const subjectId = document.getElementById('qb-subject').value;
    const text = document.getElementById('qb-text').value.trim();

    if (!subjectId) return zevaModal.alert({ title: 'Missing subject', message: 'Select a subject.' });
    if (!text) return zevaModal.alert({ title: 'Missing question', message: 'Enter the question text.' });

    if (currentQType === 'theory') {
      const maxMarks = parseInt(document.getElementById('qb-max-marks').value, 10) || 10;
      await DataStore.saveQuestion({
        subjectId, text, questionType: 'theory', maxMarks,
        options: [], correctIndex: -1, imageData: pendingQuestionImage,
      });
    } else {
      const optionInputs = [...document.querySelectorAll('.qb-option-text')].map(el => el.value.trim());
      const correctIndex = parseInt(document.querySelector('input[name="qb-correct"]:checked').value, 10);
      const explanation = document.getElementById('qb-explanation').value.trim();
      if (optionInputs.some(o => !o)) return zevaModal.alert({ title: 'Incomplete options', message: 'Fill in all four options.' });

      await DataStore.saveQuestion({
        subjectId, text, options: optionInputs, correctIndex, explanation,
        questionType: 'objective', imageData: pendingQuestionImage,
      });
    }
    render();
  });

  document.getElementById('qb-filter').addEventListener('change', (e) => {
    state.activeSubjectFilter = e.target.value || null;
    renderQuestionsTab(main);
  });

  main.querySelectorAll('[data-delete-q]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await zevaModal.confirm({ title: 'Delete this question?', message: 'This cannot be undone.', confirmText: 'Delete', cancelText: 'Cancel', tone: 'danger' });
      if (confirmed) {
        await DataStore.deleteQuestion(btn.dataset.deleteQ);
        render();
      }
    });
  });
}

// ---------------------------------------------------------------
// BULK IMPORT TAB (CSV)
// ---------------------------------------------------------------
function renderImportTab(main) {
  main.innerHTML = `
    <div class="admin-header">
      <h1>Bulk Import</h1>
      <p>Upload a CSV file to add many questions at once.</p>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">CSV format</h3>
      <p class="hint-text">Each row: <code class="mono">subjectCode,question,optionA,optionB,optionC,optionD,correctLetter,explanation</code></p>
      <p class="hint-text"><code class="mono">correctLetter</code> is A, B, C, or D. The <code class="mono">explanation</code> column is optional.</p>
      <button class="btn-secondary" id="btn-download-template" style="margin-top: 8px;">Download CSV template</button>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">Upload file</h3>
      <input type="file" id="csv-file-input" accept=".csv" />
      <div id="import-preview" style="margin-top:20px;"></div>
    </div>
  `;

  document.getElementById('btn-download-template').addEventListener('click', () => {
    const template = 'subjectCode,question,optionA,optionB,optionC,optionD,correctLetter,explanation\n' +
      'MTH,"What is 7 x 8?",54,56,58,64,B,"7 multiplied by 8 equals 56."\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'question_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('csv-file-input').addEventListener('change', handleCsvUpload);
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function handleCsvUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const dataLines = lines.slice(1);

  const previewDiv = document.getElementById('import-preview');
  const parsedQuestions = [];
  const errors = [];

  dataLines.forEach((line, idx) => {
    const cols = parseCsvLine(line);
    if (cols.length < 7) {
      errors.push(`Row ${idx + 2}: not enough columns.`);
      return;
    }
    const [subjectCode, question, optA, optB, optC, optD, correctLetter, explanation] = cols;
    const subject = state.subjects.find(s => (s.code || '').toLowerCase() === subjectCode.toLowerCase());
    if (!subject) {
      errors.push(`Row ${idx + 2}: unknown subject code "${subjectCode}".`);
      return;
    }
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf(correctLetter.toUpperCase());
    if (correctIndex === -1) {
      errors.push(`Row ${idx + 2}: correct letter must be A, B, C, or D.`);
      return;
    }
    parsedQuestions.push({
      subjectId: subject.id,
      text: question,
      options: [optA, optB, optC, optD],
      correctIndex,
      explanation: explanation || '',
    });
  });

  previewDiv.innerHTML = `
    <div class="import-summary">
      <div class="import-stat success">${parsedQuestions.length} question${parsedQuestions.length === 1 ? '' : 's'} ready to import</div>
      ${errors.length ? `<div class="import-stat error">${errors.length} row${errors.length === 1 ? '' : 's'} with errors</div>` : ''}
    </div>
    ${errors.length ? `<div class="error-list">${errors.map(e => `<div>${escapeHtml(e)}</div>`).join('')}</div>` : ''}
    ${parsedQuestions.length > 0 ? '<button class="btn-primary" id="btn-confirm-import" style="width:auto; padding:12px 24px; margin-top:12px;">Import ' + parsedQuestions.length + ' questions</button>' : ''}
  `;

  if (parsedQuestions.length > 0) {
    document.getElementById('btn-confirm-import').addEventListener('click', async () => {
      await DataStore.bulkAddQuestions(parsedQuestions);
      await zevaModal.alert({ title: 'Import complete', message: `Imported ${parsedQuestions.length} questions successfully.` });
      state.tab = 'questions';
      render();
    });
  }
}

// ---------------------------------------------------------------
// STUDENTS TAB (profile builder with photo)
// ---------------------------------------------------------------
let pendingPhotoDataUrl = null;

function renderStudentsTab(main) {
  main.innerHTML = `
    <div class="admin-header">
      <h1>Student Profiles</h1>
      <p>Create student records with registration/exam numbers and a passport photograph.</p>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">Create new student profile</h3>
      <div class="student-form-grid">
        <div>
          <div class="field-group">
            <label>Surname</label>
            <input type="text" id="stu-surname" placeholder="e.g. Bello" />
          </div>
          <div class="field-group">
            <label>First name</label>
            <input type="text" id="stu-firstname" placeholder="e.g. Aisha" />
          </div>
          <div class="field-group">
            <label>Other name</label>
            <input type="text" id="stu-othername" placeholder="e.g. Yusuf" />
          </div>
          <div class="field-group">
            <label>Sex</label>
            <select id="stu-sex">
              <option value="">-</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div class="field-group">
            <label>Section</label>
            <select id="stu-section">
              <option value="high_school">High School</option>
              <option value="college">College</option>
              <option value="professional">Professional</option>
            </select>
          </div>
          <div class="field-group" id="stu-class-wrap">
            <label>Class / Track</label>
            <select id="stu-class"></select>
          </div>
          <div class="field-group">
            <label>Registration number <span class="hint-text" style="display:inline;">(auto-generated, editable)</span></label>
            <input type="text" id="stu-reg" placeholder="AMTI/000/2026" />
          </div>
          <div class="field-group">
            <label>Examination number <span class="hint-text" style="display:inline;">(auto-generated, editable)</span></label>
            <input type="text" id="stu-examnum" placeholder="AMTI/EXAM/2026/000" />
          </div>
        </div>
        <div class="student-photo-panel">
          <label>Passport photograph</label>
          <div class="photo-preview" id="photo-preview">
            <span>No photo</span>
          </div>
          <input type="file" id="stu-photo-input" accept="image/*" />
        </div>
      </div>
      <button class="btn-primary" id="btn-add-student" style="width:auto; padding:12px 24px; margin-top:8px;">Save student profile</button>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">All students (${state.students.length})</h3>
      <div class="data-table">
        ${state.students.length === 0 ? '<div class="empty-state">No student profiles yet.</div>' : ''}
        ${state.students.map(s => `
          <div class="table-row">
            <div class="student-row-photo">
              ${s.photo ? `<img src="${s.photo}" alt="" />` : `<span>${escapeHtml((s.fullName || '?').charAt(0))}</span>`}
            </div>
            <div class="row-main">
              <div class="row-title">${escapeHtml(s.fullName)}</div>
              <div class="row-sub mono">${escapeHtml(s.regNumber)} &middot; ${escapeHtml(s.examNumber)} &middot; ${sectionLabel(s.section)}${s.grade ? ' &middot; ' + escapeHtml(s.grade) : ''}</div>
            </div>
            <button class="btn-ghost" style="color:var(--danger)" data-delete-student="${s.id}">Delete</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  function updateClassOptions() {
    const section = document.getElementById('stu-section').value;
    const classSelect = document.getElementById('stu-class');
    const options = section === 'high_school' ? DataStore.HIGH_SCHOOL_GRADES
      : section === 'college' ? DataStore.COLLEGE_TRACKS
      : DataStore.PROFESSIONAL_BODIES;
    classSelect.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
  }
  updateClassOptions();
  document.getElementById('stu-section').addEventListener('change', updateClassOptions);

  // Auto-generate reg/exam numbers on load
  DataStore.generateNextStudentNumbers().then(({ regNumber, examNumber }) => {
    document.getElementById('stu-reg').value = regNumber;
    document.getElementById('stu-examnum').value = examNumber;
  });

  pendingPhotoDataUrl = null;
  document.getElementById('stu-photo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingPhotoDataUrl = reader.result;
      document.getElementById('photo-preview').innerHTML = `<img src="${pendingPhotoDataUrl}" alt="" />`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-add-student').addEventListener('click', async () => {
    const surname = document.getElementById('stu-surname').value.trim();
    const firstName = document.getElementById('stu-firstname').value.trim();
    const otherName = document.getElementById('stu-othername').value.trim();
    const sex = document.getElementById('stu-sex').value;
    const section = document.getElementById('stu-section').value;
    const grade = document.getElementById('stu-class').value;
    const regNumber = document.getElementById('stu-reg').value.trim();
    const examNumber = document.getElementById('stu-examnum').value.trim();

    if (!surname || !firstName) {
      return zevaModal.alert({ title: 'Missing name', message: 'Enter at least the surname and first name.' });
    }
    if (!regNumber || !examNumber) {
      return zevaModal.alert({ title: 'Missing numbers', message: 'Registration and examination numbers are required.' });
    }

    const fullName = [surname, firstName, otherName].filter(Boolean).join(' ');

    await DataStore.saveStudent({
      surname, firstName, otherName, fullName, sex,
      section, grade, regNumber, examNumber,
      photo: pendingPhotoDataUrl,
      attendanceTotal: 0,
      resultTotal: 0,
    });

    await zevaModal.alert({ title: 'Profile saved', message: `${fullName}'s student profile has been created.` });
    render();
  });

  main.querySelectorAll('[data-delete-student]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await zevaModal.confirm({ title: 'Delete this student?', message: 'This will remove their profile permanently.', confirmText: 'Delete', cancelText: 'Cancel', tone: 'danger' });
      if (confirmed) {
        await DataStore.deleteStudent(btn.dataset.deleteStudent);
        render();
      }
    });
  });
}

// ---------------------------------------------------------------
// EXAMS TAB
// ---------------------------------------------------------------
function renderExamsTab(main) {
  main.innerHTML = `
    <div class="admin-header">
      <h1>Exams</h1>
      <p>Configure exam blueprints — pick a section and grade/track/body first, so you only see the subjects that belong there.</p>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">Create new exam</h3>
      <div class="field-group">
        <label>Exam title</label>
        <input type="text" id="exam-title" placeholder="e.g. Grade 9 Mock Exam — First Term" />
      </div>
      <div class="field-group">
        <label>Section</label>
        <select id="exam-section">
          <option value="high_school">High School</option>
          <option value="college">College</option>
          <option value="professional">Professional</option>
        </select>
      </div>
      <div class="field-group">
        <label id="exam-group-label">Grade / Class</label>
        <select id="exam-group"></select>
      </div>
      <div class="field-group">
        <label>Duration (minutes)</label>
        <input type="number" id="exam-duration" value="40" style="max-width:140px;" />
      </div>
      <div class="field-group">
        <label>Pass mark (%)</label>
        <input type="number" id="exam-passmark" value="50" style="max-width:140px;" />
      </div>
      <div class="field-group">
        <label><input type="checkbox" id="exam-shuffle-q" checked style="width:auto;" /> Shuffle question order per student</label>
      </div>
      <div class="field-group">
        <label><input type="checkbox" id="exam-shuffle-o" checked style="width:auto;" /> Shuffle option order per student</label>
      </div>
      <div class="field-group">
        <label><input type="checkbox" id="exam-allow-pause" style="width:auto;" /> Allow students to pause and resume this exam (mock trials only)</label>
      </div>
      <div class="field-group">
        <label><input type="checkbox" id="exam-anti-cheat" checked style="width:auto;" /> Auto-submit if the student minimises, switches app, or the exam window loses focus</label>
        <p class="hint-text" style="margin-top:4px;">Detects tab/app switching, window minimising, or another window overlaying the exam, on both the PC app and the mobile practice app. The exam is submitted immediately when this happens.</p>
      </div>
      <div class="field-group">
        <label><input type="checkbox" id="exam-network-pause" style="width:auto;" /> If connection drops during a live exam, pause instead of losing progress</label>
        <p class="hint-text" style="margin-top:4px;">LAN exams only. If a student's connection to this server is lost mid-exam, the exam and countdown timer pause automatically and the student is logged out. When they reconnect and log back in, they resume exactly where they left off. Leave this off to auto-submit on disconnect instead.</p>
      </div>
      <div class="field-group">
        <label><input type="checkbox" id="exam-allow-review" checked style="width:auto;" /> Allow students to review their answers after submitting</label>
      </div>
      <div class="field-group">
        <label>Resit policy</label>
        <select id="exam-resit-policy">
          <option value="not_allowed">Not allowed</option>
          <option value="remaining_time">Allowed — with remaining time only</option>
          <option value="full_time">Allowed — with full time restart</option>
        </select>
      </div>

      <h3 class="panel-title" style="margin-top:24px;">Subjects &amp; question count</h3>
      <p class="hint-text" id="exam-subject-config-hint"></p>
      <div id="exam-subject-config"></div>

      <button class="btn-primary" id="btn-create-exam" style="width:auto; padding:12px 24px; margin-top:16px;">Create exam</button>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">Existing exams</h3>
      ${['high_school', 'college', 'professional'].map(sec => {
        const secExams = state.exams.filter(e => e.section === sec);
        if (secExams.length === 0) return '';
        const groups = getGroupOptionsForSection(sec);
        return `
          <div class="subject-group-block">
            <div class="subject-group-heading">${sectionLabel(sec)}</div>
            ${groups.map(grp => {
              const groupExams = secExams.filter(e => e.grade === grp);
              if (groupExams.length === 0) return '';
              return `
                <div class="subject-group-subheading">${escapeHtml(grp)}</div>
                <div class="data-table">
                  ${groupExams.map(exam => {
                    const total = Object.values(exam.questionsPerSubject).reduce((a, b) => a + b, 0);
                    const theoryTotal = Object.values(exam.theoryQuestionsPerSubject || {}).reduce((a, b) => a + b, 0);
                    return `
                      <div class="table-row">
                        <div class="row-main">
                          <div class="row-title">${escapeHtml(exam.title)}</div>
                          <div class="row-sub mono">${exam.durationMinutes} min &middot; ${total} objective${theoryTotal ? ` + ${theoryTotal} theory` : ''} &middot; pass mark ${exam.passMarkPercent}% &middot; resit: ${exam.resitPolicy || 'not_allowed'} &middot; pause: ${exam.allowPause ? 'yes' : 'no'} &middot; anti-cheat: ${exam.antiCheatAutoSubmit !== false ? 'on' : 'off'} &middot; net-pause: ${exam.allowNetworkPause ? 'on' : 'off'}</div>
                        </div>
                        <button class="btn-ghost" style="color:var(--danger)" data-delete-exam="${exam.id}">Delete</button>
                      </div>
                    `;
                  }).join('')}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }).join('') || '<div class="empty-state">No exams created yet.</div>'}
    </div>
  `;

  function renderSubjectConfigList() {
    const section = document.getElementById('exam-section').value;
    const group = document.getElementById('exam-group').value;
    const configDiv = document.getElementById('exam-subject-config');
    const hint = document.getElementById('exam-subject-config-hint');
    const matching = state.subjects.filter(s => s.section === section && s.grade === group && !s.isDemo);

    if (matching.length === 0) {
      hint.textContent = `No subjects exist yet for ${sectionLabel(section)} / ${group}. Add some in the Subjects tab first.`;
      configDiv.innerHTML = '';
      return;
    }
    hint.textContent = `Showing subjects for ${sectionLabel(section)} / ${group} only.`;
    configDiv.innerHTML = matching.map(s => {
      const availableObjective = state.questions.filter(q => q.subjectId === s.id && (q.questionType || 'objective') === 'objective').length;
      const availableTheory = state.questions.filter(q => q.subjectId === s.id && q.questionType === 'theory').length;
      return `
        <div class="subject-config-row subject-config-row-exam">
          <label style="display:flex; align-items:center; gap:8px; flex:1;">
            <input type="checkbox" class="exam-subj-check" value="${s.id}" style="width:auto;" />
            ${escapeHtml(s.name)}
          </label>
          <div class="exam-subj-counts">
            <label class="exam-subj-count-label">Objective <span class="hint-text">(${availableObjective} avail.)</span>
              <input type="number" class="exam-subj-count" data-subject="${s.id}" placeholder="0" min="0" max="${availableObjective}" style="max-width:80px;" disabled />
            </label>
            <label class="exam-subj-count-label">Theory <span class="hint-text">(${availableTheory} avail.)</span>
              <input type="number" class="exam-subj-theory-count" data-subject="${s.id}" placeholder="0" min="0" max="${availableTheory}" value="0" style="max-width:80px;" disabled />
            </label>
          </div>
        </div>
      `;
    }).join('');

    configDiv.querySelectorAll('.exam-subj-check').forEach(chk => {
      chk.addEventListener('change', () => {
        const countInput = configDiv.querySelector(`.exam-subj-count[data-subject="${chk.value}"]`);
        const theoryInput = configDiv.querySelector(`.exam-subj-theory-count[data-subject="${chk.value}"]`);
        countInput.disabled = !chk.checked;
        theoryInput.disabled = !chk.checked;
        if (chk.checked && !countInput.value) countInput.value = countInput.max || 10;
      });
    });
  }

  function updateGroupOptions() {
    const section = document.getElementById('exam-section').value;
    document.getElementById('exam-group-label').textContent = groupLabelForSection(section);
    const groupSelect = document.getElementById('exam-group');
    groupSelect.innerHTML = getGroupOptionsForSection(section).map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    renderSubjectConfigList();
  }
  updateGroupOptions();
  document.getElementById('exam-section').addEventListener('change', updateGroupOptions);
  document.getElementById('exam-group').addEventListener('change', renderSubjectConfigList);

  document.getElementById('btn-create-exam').addEventListener('click', async () => {
    const title = document.getElementById('exam-title').value.trim();
    if (!title) return zevaModal.alert({ title: 'Missing title', message: 'Enter an exam title.' });

    const checkedSubjects = [...main.querySelectorAll('.exam-subj-check:checked')];
    if (checkedSubjects.length === 0) return zevaModal.alert({ title: 'No subjects selected', message: 'Select at least one subject.' });

    const subjectIds = [];
    const questionsPerSubject = {};
    const theoryQuestionsPerSubject = {};
    for (const chk of checkedSubjects) {
      const countInput = main.querySelector(`.exam-subj-count[data-subject="${chk.value}"]`);
      const theoryInput = main.querySelector(`.exam-subj-theory-count[data-subject="${chk.value}"]`);
      const qty = parseInt(countInput.value, 10) || 0;
      const theoryQty = parseInt(theoryInput.value, 10) || 0;
      if (qty <= 0 && theoryQty <= 0) continue;
      subjectIds.push(chk.value);
      if (qty > 0) questionsPerSubject[chk.value] = qty;
      if (theoryQty > 0) theoryQuestionsPerSubject[chk.value] = theoryQty;
    }
    if (subjectIds.length === 0) return zevaModal.alert({ title: 'Invalid quantity', message: 'Enter a question quantity greater than 0 for at least one subject.' });

    await DataStore.saveExam({
      title,
      section: document.getElementById('exam-section').value,
      grade: document.getElementById('exam-group').value,
      subjectIds,
      questionsPerSubject,
      theoryQuestionsPerSubject,
      durationMinutes: parseInt(document.getElementById('exam-duration').value, 10) || 40,
      passMarkPercent: parseInt(document.getElementById('exam-passmark').value, 10) || 50,
      shuffleQuestions: document.getElementById('exam-shuffle-q').checked,
      shuffleOptions: document.getElementById('exam-shuffle-o').checked,
      allowPause: document.getElementById('exam-allow-pause').checked,
      antiCheatAutoSubmit: document.getElementById('exam-anti-cheat').checked,
      allowNetworkPause: document.getElementById('exam-network-pause').checked,
      allowReview: document.getElementById('exam-allow-review').checked,
      resitPolicy: document.getElementById('exam-resit-policy').value,
    });

    render();
  });

  main.querySelectorAll('[data-delete-exam]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await zevaModal.confirm({ title: 'Delete this exam?', message: 'This cannot be undone.', confirmText: 'Delete', cancelText: 'Cancel', tone: 'danger' });
      if (confirmed) {
        await DataStore.deleteExam(btn.dataset.deleteExam);
        render();
      }
    });
  });
}

// ---------------------------------------------------------------
// RESULTS & ANALYSIS TAB
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// THEORY GRADING TAB
// ---------------------------------------------------------------
async function renderTheoryGradingTab(main) {
  const allResults = (await DataStore.getResults()).filter(r => (r.theoryAnswers || []).length > 0);
  const ungraded = allResults.filter(r => !r.theoryFullyGraded);
  const graded = allResults.filter(r => r.theoryFullyGraded);

  main.innerHTML = `
    <div class="admin-header">
      <h1>Theory Grading</h1>
      <p>Award marks for essay/theory answers. Scores blend automatically with the objective portion once graded.</p>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">Awaiting grading (${ungraded.length})</h3>
      <div class="data-table">
        ${ungraded.length === 0 ? '<div class="empty-state">Nothing pending — all submitted theory answers have been graded.</div>' : ''}
        ${ungraded.map(r => `
          <div class="table-row clickable-row" data-open-theory="${r.id}">
            <div class="row-main">
              <div class="row-title">${escapeHtml(r.studentName)} &middot; ${escapeHtml(r.examTitle)}</div>
              <div class="row-sub mono">${escapeHtml(r.regNumber || '')} &middot; ${(r.theoryAnswers || []).length} theory answer${(r.theoryAnswers || []).length === 1 ? '' : 's'} &middot; submitted ${new Date(r.createdAt).toLocaleDateString()}</div>
            </div>
            <button class="btn-ghost">Grade &rarr;</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">Already graded (${graded.length})</h3>
      <div class="data-table">
        ${graded.length === 0 ? '<div class="empty-state">None yet.</div>' : ''}
        ${graded.map(r => `
          <div class="table-row clickable-row" data-open-theory="${r.id}">
            <div class="row-main">
              <div class="row-title">${escapeHtml(r.studentName)} &middot; ${escapeHtml(r.examTitle)}</div>
              <div class="row-sub mono">${escapeHtml(r.regNumber || '')} &middot; theory marks: ${r.theoryMarksAwarded} &middot; overall ${r.overallPercent}%</div>
            </div>
            <button class="btn-ghost">Review &rarr;</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  main.querySelectorAll('[data-open-theory]').forEach(el => {
    el.addEventListener('click', () => renderTheoryGradingDetail(main, el.dataset.openTheory));
  });
}

async function renderTheoryGradingDetail(main, resultId) {
  const result = await DataStore.getResultById(resultId);
  if (!result) return renderTheoryGradingTab(main);

  main.innerHTML = `
    <button class="btn-ghost" id="btn-back-theory" style="margin-bottom:16px;">&larr; Back to theory grading</button>
    <div class="admin-header">
      <h1>${escapeHtml(result.studentName)}</h1>
      <p>${escapeHtml(result.examTitle)} &middot; ${escapeHtml(result.regNumber || '')}</p>
    </div>

    <div class="admin-panel">
      ${result.theoryAnswers.map((a, i) => `
        <div class="theory-grade-item">
          <div class="theory-grade-header">
            <span class="mono hint-text">${escapeHtml(a.subjectName)} &middot; Q${i + 1}</span>
            ${a.graded ? '<span class="import-stat success">Graded</span>' : '<span class="import-stat error">Ungraded</span>'}
          </div>
          <div class="theory-grade-question">${escapeHtml(a.questionText)}</div>
          <div class="theory-grade-answer">${a.answerText ? escapeHtml(a.answerText) : '<em>No answer submitted.</em>'}</div>
          <div class="theory-grade-marks-row">
            <label>Award marks (out of ${a.maxMarks})</label>
            <input type="number" class="theory-marks-input" data-question="${a.questionId}" min="0" max="${a.maxMarks}" value="${a.awardedMarks !== null ? a.awardedMarks : ''}" style="max-width:100px;" />
          </div>
        </div>
      `).join('')}
      <button class="btn-primary" id="btn-save-theory-grades" style="width:auto; padding:12px 24px; margin-top:8px;">Save grades</button>
    </div>
  `;

  document.getElementById('btn-back-theory').addEventListener('click', () => renderTheoryGradingTab(main));

  document.getElementById('btn-save-theory-grades').addEventListener('click', async () => {
    const gradedAnswers = [...main.querySelectorAll('.theory-marks-input')].map(input => ({
      questionId: input.dataset.question,
      awardedMarks: parseFloat(input.value) || 0,
    }));
    const exam = await DataStore.getExam(result.examId);
    await DataStore.gradeTheoryAnswers(result.id, gradedAnswers, exam?.passMarkPercent);
    await zevaModal.alert({ title: 'Grades saved', message: 'The overall score has been recalculated to include these marks.' });
    renderTheoryGradingTab(main);
  });
}

async function renderResultsTab(main) {
  if (state.viewingResultId) {
    return renderSingleResultView(main, state.viewingResultId);
  }

  let results = (await DataStore.getResults()).filter(r => !r.isTrial);

  if (state.resultsSearch) {
    const q = state.resultsSearch.toLowerCase();
    results = results.filter(r =>
      (r.regNumber || '').toLowerCase().includes(q) ||
      (r.examNumber || '').toLowerCase().includes(q) ||
      (r.studentName || '').toLowerCase().includes(q)
    );
  }

  results.sort((a, b) => {
    if (state.resultsSortBy === 'reg') return (a.regNumber || '').localeCompare(b.regNumber || '');
    if (state.resultsSortBy === 'exam') return (a.examNumber || '').localeCompare(b.examNumber || '');
    if (state.resultsSortBy === 'score') return b.overallPercent - a.overallPercent;
    return b.createdAt - a.createdAt;
  });

  const hasHighSchoolResults = results.some(r => r.section === 'high_school');

  main.innerHTML = `
    <div class="admin-header">
      <h1>Results &amp; Analysis</h1>
      <p>Click any result to view the full breakdown, print, or publish it to the student result portal.</p>
    </div>
    <div class="admin-panel">
      <div class="inline-form">
        <input type="text" id="results-search" placeholder="Search by registration no., exam no., or name" value="${escapeHtml(state.resultsSearch)}" />
        <select id="results-sort" style="max-width:220px;">
          <option value="date" ${state.resultsSortBy === 'date' ? 'selected' : ''}>Sort: Most recent</option>
          <option value="reg" ${state.resultsSortBy === 'reg' ? 'selected' : ''}>Sort: Registration number</option>
          <option value="exam" ${state.resultsSortBy === 'exam' ? 'selected' : ''}>Sort: Examination number</option>
          <option value="score" ${state.resultsSortBy === 'score' ? 'selected' : ''}>Sort: Highest score</option>
        </select>
        <button class="btn-secondary" id="btn-export-results" style="width:auto; padding:11px 18px;">Export CSV</button>
      </div>

      <div class="results-bulk-actions">
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--slate);">
          <input type="checkbox" id="select-all-results" style="width:auto;" /> Select all
        </label>
        <button class="btn-primary" id="btn-publish-selected" style="width:auto; padding:9px 18px;">Publish selected to result portal</button>
        ${hasHighSchoolResults ? '<button class="btn-secondary" id="btn-bulk-report-card" style="width:auto; padding:9px 18px;">Bulk-fill terminal report fields&hellip;</button>' : ''}
      </div>

      ${hasHighSchoolResults ? `
      <div class="admin-panel" id="bulk-report-card-panel" style="display:none; margin-top:14px; background:var(--paper-dim);">
        <h4 style="margin-bottom:6px;">Bulk-fill terminal report fields</h4>
        <p class="hint-text">Applies to every <strong>checked high-school result</strong> above. Great for class/term-wide fields such as term, academic year, class average, remarks, and next-term info. Per-subject scores and individual behaviour/skills ratings still need to be set per student on their result page. Leave a field blank to leave it unchanged for that student.</p>
        <div class="form-grid-3">
          <div class="field-group"><label>Class</label><input type="text" id="bulk-className" placeholder="e.g. JSS-THREE (A)" /></div>
          <div class="field-group"><label>Term</label>
            <select id="bulk-term">
              <option value="">(leave unchanged)</option>
              <option value="1st">1st Term</option>
              <option value="2nd">2nd Term</option>
              <option value="3rd">3rd Term</option>
            </select>
          </div>
          <div class="field-group"><label>Academic Year</label><input type="text" id="bulk-academicYear" placeholder="e.g. 25/26" /></div>
        </div>
        <div class="form-grid-3">
          <div class="field-group"><label>No. in Class</label><input type="number" id="bulk-noInClass" min="0" /></div>
          <div class="field-group"><label>Next Term Begins</label><input type="text" id="bulk-nextTermBegins" placeholder="e.g. Monday, 20th of April" /></div>
          <div class="field-group"><label>Next Term Fees</label><input type="text" id="bulk-nextTermFees" placeholder="e.g. N12,500" /></div>
        </div>
        <div class="field-group">
          <label>Class Teacher's Remark</label>
          <textarea id="bulk-classTeacherRemark" rows="2" placeholder="Applied to every checked student — edit individually afterward if needed"></textarea>
        </div>
        <div class="field-group">
          <label>Principal's Remark</label>
          <textarea id="bulk-principalRemark" rows="2"></textarea>
        </div>
        <button class="btn-primary" id="btn-apply-bulk-report-card" style="width:auto; padding:11px 22px;">Apply to checked results</button>
      </div>
      ` : ''}

      <div class="data-table">
        ${results.length === 0 ? '<div class="empty-state">No results yet.</div>' : ''}
        ${results.map(r => `
          <div class="table-row result-row" data-result-id="${r.id}">
            <input type="checkbox" class="result-select-cb" value="${r.id}" style="width:auto;" />
            <div class="student-row-photo small">
              ${r.studentPhoto ? `<img src="${r.studentPhoto}" alt="" />` : `<span>${escapeHtml((r.studentName || '?').charAt(0))}</span>`}
            </div>
            <div class="row-main clickable-row" data-open-result="${r.id}">
              <div class="row-title">${escapeHtml(r.studentName)} &middot; ${escapeHtml(r.examTitle)}</div>
              <div class="row-sub mono">${escapeHtml(r.regNumber || '')} &middot; ${escapeHtml(r.examNumber || '')} &middot; ${r.overallPercent}% &middot; ${r.passed ? 'PASSED' : 'FAILED'} ${r.published ? ' &middot; <span style="color:var(--verdant)">Published</span>' : ''}${r.autoSubmitted ? ` &middot; <span style="color:var(--signal-amber)">${r.autoSubmitReason === 'anti_cheat' ? 'Auto-submitted (left exam window)' : r.autoSubmitReason === 'network_drop' ? 'Auto-submitted (connection lost)' : 'Auto-submitted (time expired)'}</span>` : ''}</div>
            </div>
            <button class="btn-ghost" data-open-result-btn="${r.id}">View &rarr;</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('results-search').addEventListener('input', (e) => {
    state.resultsSearch = e.target.value;
    renderResultsTab(main);
  });
  document.getElementById('results-sort').addEventListener('change', (e) => {
    state.resultsSortBy = e.target.value;
    renderResultsTab(main);
  });

  document.getElementById('select-all-results').addEventListener('change', (e) => {
    main.querySelectorAll('.result-select-cb').forEach(cb => { cb.checked = e.target.checked; });
  });

  document.getElementById('btn-publish-selected').addEventListener('click', async () => {
    const selectedIds = [...main.querySelectorAll('.result-select-cb:checked')].map(cb => cb.value);
    if (selectedIds.length === 0) {
      return zevaModal.alert({ title: 'Nothing selected', message: 'Select at least one result to publish.' });
    }
    await DataStore.publishResults(selectedIds);
    await zevaModal.alert({ title: 'Published', message: `${selectedIds.length} result(s) are now visible on the student result portal.` });
    renderResultsTab(main);
  });

  const bulkToggleBtn = document.getElementById('btn-bulk-report-card');
  if (bulkToggleBtn) {
    bulkToggleBtn.addEventListener('click', () => {
      const panel = document.getElementById('bulk-report-card-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  }

  const bulkApplyBtn = document.getElementById('btn-apply-bulk-report-card');
  if (bulkApplyBtn) {
    bulkApplyBtn.addEventListener('click', async () => {
      const selectedIds = [...main.querySelectorAll('.result-select-cb:checked')].map(cb => cb.value);
      const selectedHighSchool = results.filter(r => selectedIds.includes(r.id) && r.section === 'high_school');
      if (selectedHighSchool.length === 0) {
        return zevaModal.alert({ title: 'Nothing selected', message: 'Check one or more high-school results above before applying bulk fields.' });
      }

      const fields = {
        className: document.getElementById('bulk-className').value.trim(),
        term: document.getElementById('bulk-term').value,
        academicYear: document.getElementById('bulk-academicYear').value.trim(),
        noInClass: document.getElementById('bulk-noInClass').value,
        nextTermBegins: document.getElementById('bulk-nextTermBegins').value.trim(),
        nextTermFees: document.getElementById('bulk-nextTermFees').value.trim(),
        classTeacherRemark: document.getElementById('bulk-classTeacherRemark').value.trim(),
        principalRemark: document.getElementById('bulk-principalRemark').value.trim(),
      };
      // Only include fields the admin actually filled in, so blanks don't
      // overwrite anything a student's individual report card already has.
      const toApply = {};
      Object.entries(fields).forEach(([k, v]) => { if (v !== '') toApply[k] = v; });

      if (Object.keys(toApply).length === 0) {
        return zevaModal.alert({ title: 'Nothing to apply', message: 'Fill in at least one field before applying.' });
      }

      for (const r of selectedHighSchool) {
        await DataStore.saveReportCard(r.id, toApply);
      }
      await zevaModal.alert({ title: 'Applied', message: `Updated ${selectedHighSchool.length} high-school result(s). Per-subject scores and behaviour/skills ratings still need per-student entry.` });
      renderResultsTab(main);
    });
  }

  document.getElementById('btn-export-results').addEventListener('click', () => {
    const header = 'Full Name,Registration Number,Examination Number,Exam,Score %,Correct,Total,Status,Date\n';
    const rows = results.map(r =>
      [r.studentName, r.regNumber, r.examNumber, r.examTitle, r.overallPercent, r.totalCorrect, r.totalQuestions, r.passed ? 'PASSED' : 'FAILED', new Date(r.createdAt).toLocaleString()]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zeva_results_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  main.querySelectorAll('[data-open-result], [data-open-result-btn]').forEach(el => {
    el.addEventListener('click', () => {
      state.viewingResultId = el.dataset.openResult || el.dataset.openResultBtn;
      renderResultsTab(main);
    });
  });
}

// ---------------------------------------------------------------
// UBMA-STYLE HIGH SCHOOL RESULT SHEET (terminal report card)
// Applies ONLY to results where section === 'high_school'. Other
// sections keep using the simpler generic result-sheet above.
// ---------------------------------------------------------------
const UBMA_BEHAVIOUR_TRAITS = [
  ['punctuality', 'Punctuality'],
  ['attendanceRating', 'Attendance'],
  ['reliability', 'Reliability'],
  ['neatness', 'Neatness'],
  ['politeness', 'Politeness'],
  ['honesty', 'Honesty'],
  ['relationshipWithStudents', 'Relationship With Students'],
  ['selfControl', 'Self Control'],
  ['attentiveness', 'Attentiveness'],
  ['perseverance', 'Perseverance'],
];
const UBMA_SKILLS_TRAITS = [
  ['handwriting', 'Handwriting'],
  ['games', 'Games'],
  ['sports', 'Sports'],
  ['drawingAndPaint', 'Drawing & Paint'],
  ['craft', 'Craft'],
  ['musicalSkills', 'Musical Skills'],
];
const UBMA_RATING_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];
const UBMA_RATING_KEY = [
  ['A', 'Excellent'],
  ['B', 'High/Good'],
  ['C', 'Acceptable'],
  ['D', 'Minimal'],
  ['F', 'Poor'],
];

function ubmaGradeFromPercent(pct) {
  // A1=75-100, B2=70-74, B3=65-69, C4=60-64, C5=55-59, C6=50-54, D7=45-49, E8=40-44, F9=0-39
  if (pct >= 75) return 'A1';
  if (pct >= 70) return 'B2';
  if (pct >= 65) return 'B3';
  if (pct >= 60) return 'C4';
  if (pct >= 55) return 'C5';
  if (pct >= 50) return 'C6';
  if (pct >= 45) return 'D7';
  if (pct >= 40) return 'E8';
  return 'F9';
}
function ubmaRemarkFromGrade(letter) {
  if (letter.startsWith('A')) return 'EXCELLENT';
  if (letter.startsWith('B')) return 'V.GOOD';
  if (letter.startsWith('C')) return 'GOOD';
  if (letter.startsWith('D')) return 'PASS';
  if (letter.startsWith('E')) return 'PASS';
  return 'FAIL';
}

/** Renders the UBMA-style terminal report sheet as an HTML string.
 * r = result row, school = school settings, student = full student record
 * (for class/grade display), subjectsById = Map of subjectId -> subject. */
function renderUbmaSheetHtml(r, school, student, subjectsById) {
  const rc = r.reportCard || {};
  const behaviour = rc.behaviour || {};
  const skills = rc.skills || {};
  const breakdown = rc.subjectBreakdown || {};

  const subjectRows = r.subjectResults.map(sr => {
    const b = breakdown[sr.subjectId] || {};
    const note = Number(b.note) || 0;
    const test1 = Number(b.test1) || 0;
    const test2 = Number(b.test2) || 0;
    const examScore = sr.correct; // raw exam score out of sr.total, scaled below if needed
    const examOutOf = sr.total;
    // Scale the CBT raw score onto a 70-mark "EXAM" column if the exam wasn't out of 70.
    const examScaled = examOutOf > 0 ? Math.round((examScore / examOutOf) * 70) : 0;
    const total = note + test1 + test2 + examScaled;
    const pct = Math.min(100, total);
    const gradeLetter = ubmaGradeFromPercent(pct);
    const remark = b.remark || ubmaRemarkFromGrade(gradeLetter);
    return { name: sr.subjectName, note, test1, test2, examScaled, total, gradeLetter, remark };
  });
  const grandTotal = subjectRows.reduce((sum, s) => sum + s.total, 0);
  const classAverage = rc.classAverage || (subjectRows.length ? Math.round(grandTotal / subjectRows.length) : 0);

  const ratingRow = (traits, source) => traits.map(([key, label]) => `
    <tr><td>${escapeHtml(label)}</td><td>${escapeHtml(source[key] || '')}</td></tr>
  `).join('');

  return `
    <div class="ubma-sheet" id="printable-ubma-sheet">
      <div class="ubma-head">
        ${school.schoolLogo
          ? `<img src="${school.schoolLogo}" class="ubma-head-logo" alt="" />`
          : `<div class="ubma-head-logo-placeholder">School<br/>Logo</div>`}
        <div class="ubma-head-titles">
          <div class="ubma-head-school-name">${escapeHtml(school.schoolName || 'AMTI \u2014 ARM\u2019S Minor Tech Institute')}</div>
          <div class="ubma-head-line">${escapeHtml(school.schoolAddress || '')}</div>
          <div class="ubma-head-line">${escapeHtml(school.schoolMinistryLine || '')}</div>
          <div class="ubma-head-doc-title">Junior/Senior Secondary &mdash; Terminal Report Sheet</div>
        </div>
      </div>

      <table class="ubma-meta-table">
        <tr>
          <td class="ubma-meta-label">Name of Student</td>
          <td>${escapeHtml(r.studentName)}</td>
          <td class="ubma-meta-label">Sex</td>
          <td>${escapeHtml(rc.sex || student?.sex || '')}</td>
          <td class="ubma-meta-photo-cell" rowspan="4">
            <div class="ubma-meta-photo">
              ${r.studentPhoto ? `<img src="${r.studentPhoto}" alt="" />` : `<span>${escapeHtml((r.studentName || '?').charAt(0))}</span>`}
            </div>
          </td>
        </tr>
        <tr>
          <td class="ubma-meta-label">Class</td>
          <td>${escapeHtml(rc.className || student?.grade || '')}</td>
          <td class="ubma-meta-label">Academic Year</td>
          <td>${escapeHtml(rc.academicYear || '')}</td>
        </tr>
        <tr>
          <td class="ubma-meta-label">Term</td>
          <td>${escapeHtml(rc.term || '')}</td>
          <td class="ubma-meta-label">No. in Class</td>
          <td>${escapeHtml(String(rc.noInClass ?? ''))}</td>
        </tr>
        <tr>
          <td class="ubma-meta-label">Attendance</td>
          <td>${escapeHtml(String(rc.attendance ?? ''))}</td>
          <td class="ubma-meta-label">Position</td>
          <td>${escapeHtml(rc.position ?? '')}</td>
        </tr>
      </table>

      <div class="ubma-section-title">The Terminal Reports</div>
      <table class="ubma-subjects-table">
        <thead>
          <tr>
            <th rowspan="2" style="text-align:left;">Subject</th>
            <th colspan="2">Note/Assignment (10%)</th>
            <th colspan="2">Test (20%)</th>
            <th rowspan="2">Exam<br/>(70%)</th>
            <th rowspan="2">Total<br/>(100%)</th>
            <th rowspan="2">Grade</th>
            <th rowspan="2" style="text-align:left;">Teacher's Remark</th>
          </tr>
          <tr><th>1st 5%</th><th>2nd 5%</th><th>1st 10%</th><th>2nd 10%</th></tr>
        </thead>
        <tbody>
          ${subjectRows.map(s => `
            <tr>
              <td class="ubma-subject-name">${escapeHtml(s.name)}</td>
              <td>${s.note ? Math.round(s.note / 2) : ''}</td>
              <td>${s.note ? Math.round(s.note / 2) : ''}</td>
              <td>${s.test1 || ''}</td>
              <td>${s.test2 || ''}</td>
              <td>${s.examScaled}</td>
              <td><strong>${s.total}</strong></td>
              <td><strong>${s.gradeLetter}</strong></td>
              <td class="ubma-subject-remark">${escapeHtml(s.remark)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="6" style="text-align:right;">TOTAL</td><td>${grandTotal}</td><td colspan="2"></td></tr>
        </tfoot>
      </table>
      <div style="text-align:right; font-size:11px; font-weight:700; margin:-6px 0 10px;">Class Average: ${classAverage}</div>

      <div class="ubma-lower-grid">
        <div class="ubma-box">
          <div class="ubma-box-title">Behaviour</div>
          <table class="ubma-rating-table">${ratingRow(UBMA_BEHAVIOUR_TRAITS, behaviour)}</table>
        </div>
        <div class="ubma-box">
          <div class="ubma-box-title">Skills</div>
          <table class="ubma-rating-table">${ratingRow(UBMA_SKILLS_TRAITS, skills)}</table>
        </div>
        <div class="ubma-box">
          <div class="ubma-box-title">Keys</div>
          <table class="ubma-key-table">${UBMA_RATING_KEY.map(([k, v]) => `<tr><td>${escapeHtml(v)}</td><td>${escapeHtml(k)}</td></tr>`).join('')}</table>
        </div>
      </div>

      <div class="ubma-remarks">
        <div class="ubma-remark-row">
          <div class="ubma-remark-label">Class Teacher's Remark</div>
          <div class="ubma-remark-value">${escapeHtml(rc.classTeacherRemark || '')}</div>
          <div class="ubma-remark-sig">Signature</div>
        </div>
        <div class="ubma-remark-row">
          <div class="ubma-remark-label">Principal's Remark</div>
          <div class="ubma-remark-value">${escapeHtml(rc.principalRemark || '')}</div>
          <div class="ubma-remark-sig">Signature</div>
        </div>
      </div>

      <div class="ubma-footer-row">
        <span>Next Term Begins: ${escapeHtml(rc.nextTermBegins || '')}</span>
        <span>Next Term Fees: ${escapeHtml(rc.nextTermFees || '')}</span>
      </div>

      <div class="result-sheet-footer">
        Generated by Zeva CBT &middot; by Zeus Technologies Innovations &middot; Powering Smarter Exams
      </div>
    </div>
  `;
}

/** The per-student entry form for all the UBMA-only fields. Renders into
 * a container element and wires its own save handler. */
function renderUbmaReportCardForm(r) {
  const rc = r.reportCard || {};
  const behaviour = rc.behaviour || {};
  const skills = rc.skills || {};
  const breakdown = rc.subjectBreakdown || {};
  const ratingSelect = (id, current) => `
    <select id="${id}">
      <option value="">-</option>
      ${UBMA_RATING_OPTIONS.map(o => `<option value="${o}" ${current === o ? 'selected' : ''}>${o}</option>`).join('')}
    </select>
  `;

  return `
    <div class="admin-panel" style="margin-top:20px;" id="ubma-form-panel">
      <h3 class="panel-title">Terminal Report Card Details (High School)</h3>
      <p class="hint-text">These fields power the printable terminal report sheet above. Fill them in per student, or use bulk entry from the Results tab for a whole class at once.</p>

      <div class="form-grid-3">
        <div class="field-group"><label>Class</label><input type="text" id="ubma-className" value="${escapeHtml(rc.className || '')}" placeholder="e.g. JSS-THREE (A)" /></div>
        <div class="field-group"><label>Term</label>
          <select id="ubma-term">
            <option value="">-</option>
            <option value="1st" ${rc.term === '1st' ? 'selected' : ''}>1st Term</option>
            <option value="2nd" ${rc.term === '2nd' ? 'selected' : ''}>2nd Term</option>
            <option value="3rd" ${rc.term === '3rd' ? 'selected' : ''}>3rd Term</option>
          </select>
        </div>
        <div class="field-group"><label>Academic Year</label><input type="text" id="ubma-academicYear" value="${escapeHtml(rc.academicYear || '')}" placeholder="e.g. 25/26" /></div>
      </div>
      <div class="form-grid-3">
        <div class="field-group"><label>Attendance (days present)</label><input type="number" id="ubma-attendance" min="0" value="${escapeHtml(String(rc.attendance ?? ''))}" /></div>
        <div class="field-group"><label>No. in Class</label><input type="number" id="ubma-noInClass" min="0" value="${escapeHtml(String(rc.noInClass ?? ''))}" /></div>
        <div class="field-group"><label>Position</label><input type="text" id="ubma-position" value="${escapeHtml(rc.position || '')}" placeholder="e.g. 3rd of 12" /></div>
      </div>

      <h4 style="margin:18px 0 8px;">Per-Subject Note & Test Scores</h4>
      <p class="hint-text">The Exam column is filled automatically from the CBT score. Enter Note/Assignment (out of 10) and Test (out of 20) here — they combine with the exam score for the subject's total out of 100.</p>
      <table class="result-sheet-table" style="margin-bottom:12px;">
        <thead><tr><th>Subject</th><th>Note (10)</th><th>Test 1 (10)</th><th>Test 2 (10)</th></tr></thead>
        <tbody>
          ${r.subjectResults.map(sr => `
            <tr>
              <td>${escapeHtml(sr.subjectName)}</td>
              <td><input type="number" min="0" max="10" class="ubma-note-input" data-subject-id="${sr.subjectId}" value="${escapeHtml(String(breakdown[sr.subjectId]?.note ?? ''))}" style="width:70px;" /></td>
              <td><input type="number" min="0" max="10" class="ubma-test1-input" data-subject-id="${sr.subjectId}" value="${escapeHtml(String(breakdown[sr.subjectId]?.test1 ?? ''))}" style="width:70px;" /></td>
              <td><input type="number" min="0" max="10" class="ubma-test2-input" data-subject-id="${sr.subjectId}" value="${escapeHtml(String(breakdown[sr.subjectId]?.test2 ?? ''))}" style="width:70px;" /></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h4 style="margin:18px 0 8px;">Behaviour Ratings (A&ndash;F)</h4>
      <div class="form-grid-3">
        ${UBMA_BEHAVIOUR_TRAITS.map(([key, label]) => `
          <div class="field-group"><label>${escapeHtml(label)}</label>${ratingSelect('ubma-beh-' + key, behaviour[key] || '')}</div>
        `).join('')}
      </div>

      <h4 style="margin:18px 0 8px;">Skills Ratings (A&ndash;F)</h4>
      <div class="form-grid-3">
        ${UBMA_SKILLS_TRAITS.map(([key, label]) => `
          <div class="field-group"><label>${escapeHtml(label)}</label>${ratingSelect('ubma-skl-' + key, skills[key] || '')}</div>
        `).join('')}
      </div>

      <div class="field-group" style="margin-top:14px;">
        <label>Class Teacher's Remark</label>
        <textarea id="ubma-classTeacherRemark" rows="2">${escapeHtml(rc.classTeacherRemark || '')}</textarea>
      </div>
      <div class="field-group">
        <label>Principal's Remark</label>
        <textarea id="ubma-principalRemark" rows="2">${escapeHtml(rc.principalRemark || '')}</textarea>
      </div>
      <div class="form-grid-3">
        <div class="field-group"><label>Next Term Begins</label><input type="text" id="ubma-nextTermBegins" value="${escapeHtml(rc.nextTermBegins || '')}" placeholder="e.g. Monday, 20th of April" /></div>
        <div class="field-group"><label>Next Term Fees</label><input type="text" id="ubma-nextTermFees" value="${escapeHtml(rc.nextTermFees || '')}" placeholder="e.g. N12,500" /></div>
        <div class="field-group"><label>Class Average (optional override)</label><input type="number" id="ubma-classAverage" value="${escapeHtml(String(rc.classAverage ?? ''))}" /></div>
      </div>

      <button class="btn-primary" id="btn-save-ubma-report-card" style="width:auto; padding:12px 24px; margin-top:10px;">Save report card details</button>
    </div>
  `;
}

function wireUbmaReportCardForm(main, r) {
  const btn = document.getElementById('btn-save-ubma-report-card');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const behaviour = {};
    UBMA_BEHAVIOUR_TRAITS.forEach(([key]) => {
      const el = document.getElementById('ubma-beh-' + key);
      if (el && el.value) behaviour[key] = el.value;
    });
    const skills = {};
    UBMA_SKILLS_TRAITS.forEach(([key]) => {
      const el = document.getElementById('ubma-skl-' + key);
      if (el && el.value) skills[key] = el.value;
    });
    const subjectBreakdown = {};
    r.subjectResults.forEach(sr => {
      const note = document.querySelector(`.ubma-note-input[data-subject-id="${sr.subjectId}"]`)?.value;
      const test1 = document.querySelector(`.ubma-test1-input[data-subject-id="${sr.subjectId}"]`)?.value;
      const test2 = document.querySelector(`.ubma-test2-input[data-subject-id="${sr.subjectId}"]`)?.value;
      if (note !== '' || test1 !== '' || test2 !== '') {
        subjectBreakdown[sr.subjectId] = {
          note: note !== '' ? Number(note) : 0,
          test1: test1 !== '' ? Number(test1) : 0,
          test2: test2 !== '' ? Number(test2) : 0,
        };
      }
    });

    const reportCard = {
      className: document.getElementById('ubma-className').value.trim(),
      term: document.getElementById('ubma-term').value,
      academicYear: document.getElementById('ubma-academicYear').value.trim(),
      attendance: document.getElementById('ubma-attendance').value,
      noInClass: document.getElementById('ubma-noInClass').value,
      position: document.getElementById('ubma-position').value.trim(),
      behaviour,
      skills,
      subjectBreakdown,
      classTeacherRemark: document.getElementById('ubma-classTeacherRemark').value.trim(),
      principalRemark: document.getElementById('ubma-principalRemark').value.trim(),
      nextTermBegins: document.getElementById('ubma-nextTermBegins').value.trim(),
      nextTermFees: document.getElementById('ubma-nextTermFees').value.trim(),
      classAverage: document.getElementById('ubma-classAverage').value,
    };

    await DataStore.saveReportCard(r.id, reportCard);
    await zevaModal.alert({ title: 'Report card saved', message: 'The terminal report sheet has been updated with these details.' });
    renderSingleResultView(main, r.id);
  });
}

async function renderSingleResultView(main, resultId) {
  const r = await DataStore.getResultById(resultId);
  const school = await DataStore.getSchoolSettings();
  if (!r) { state.viewingResultId = null; return renderResultsTab(main); }

  const isHighSchool = r.section === 'high_school';
  const student = isHighSchool && r.studentId ? await DataStore.getStudentById(r.studentId) : null;

  const sheetHtml = isHighSchool
    ? renderUbmaSheetHtml(r, school, student, null)
    : `
    <div class="result-sheet" id="printable-result-sheet">
      <div class="result-sheet-header">
        ${school.schoolLogo ? `<img src="${school.schoolLogo}" class="result-sheet-school-logo" alt="" />` : ''}
        <div class="result-sheet-titles">
          <div class="result-sheet-school-name">${escapeHtml(school.schoolName)}</div>
          <div class="result-sheet-doc-title">Official Examination Result</div>
        </div>
        <img src="assets/logo-icon.png" class="result-sheet-cbt-logo" alt="" />
      </div>

      <div class="result-sheet-student">
        <div class="result-sheet-photo">
          ${r.studentPhoto ? `<img src="${r.studentPhoto}" alt="" />` : `<span>${escapeHtml((r.studentName || '?').charAt(0))}</span>`}
        </div>
        <div class="result-sheet-student-details">
          <div class="rsd-row"><span>Full Name</span><strong>${escapeHtml(r.studentName)}</strong></div>
          <div class="rsd-row"><span>Registration No.</span><strong class="mono">${escapeHtml(r.regNumber || '')}</strong></div>
          <div class="rsd-row"><span>Examination No.</span><strong class="mono">${escapeHtml(r.examNumber || '')}</strong></div>
          <div class="rsd-row"><span>Exam</span><strong>${escapeHtml(r.examTitle)}</strong></div>
          <div class="rsd-row"><span>Date</span><strong>${new Date(r.createdAt).toLocaleDateString()}</strong></div>
        </div>
      </div>

      <div class="result-sheet-summary">
        <div class="rss-box">
          <div class="rss-label">Overall Score</div>
          <div class="rss-value">${r.overallPercent}%</div>
        </div>
        <div class="rss-box">
          <div class="rss-label">Correct</div>
          <div class="rss-value">${r.totalCorrect}/${r.totalQuestions}</div>
        </div>
        <div class="rss-box">
          <div class="rss-label">Verdict</div>
          <div class="rss-value" style="color:${r.passed ? 'var(--verdant)' : 'var(--danger)'}">${r.passed ? 'PASSED' : 'FAILED'}</div>
        </div>
      </div>

      <table class="result-sheet-table">
        <thead><tr><th>Subject</th><th>Correct</th><th>Total</th><th>Score</th></tr></thead>
        <tbody>
          ${r.subjectResults.map(sr => `
            <tr>
              <td>${escapeHtml(sr.subjectName)}</td>
              <td>${sr.correct}</td>
              <td>${sr.total}</td>
              <td>${sr.percent}%</td>
            </tr>
          `).join('')}
          ${(r.additionalScores || []).map(s => `
            <tr>
              <td>${escapeHtml(s.name)}</td>
              <td colspan="2" style="text-align:center;">${s.score}/${s.maxScore}</td>
              <td>${s.maxScore ? Math.round((s.score / s.maxScore) * 100) : 0}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${r.teacherNotes ? `
        <div class="result-sheet-notes">
          <div class="result-sheet-notes-label">Teacher's Notes</div>
          <div>${escapeHtml(r.teacherNotes)}</div>
        </div>
      ` : ''}

      <div class="result-sheet-footer">
        Generated by Zeva CBT &middot; by Zeus Technologies Innovations &middot; Powering Smarter Exams
      </div>
    </div>
  `;

  main.innerHTML = `
    <button class="btn-ghost" id="btn-back-results" style="margin-bottom:16px;">&larr; Back to results list</button>

    ${sheetHtml}

    ${!isHighSchool ? `
    <div class="admin-panel" style="margin-top:20px;">
      <h3 class="panel-title">Continuous Assessment &amp; Scores</h3>
      <p class="hint-text">Add CA tests, assignments, or any other named score component. These blend automatically into the overall result shown above.</p>
      <div id="ca-scores-rows">
        ${(r.additionalScores && r.additionalScores.length > 0 ? r.additionalScores : [{ name: '', score: '', maxScore: '' }]).map((s, i) => `
          <div class="ca-score-row" data-row="${i}">
            <input type="text" class="ca-score-name" placeholder="e.g. 1st CA" value="${escapeHtml(s.name || '')}" />
            <input type="number" class="ca-score-value" placeholder="Score" min="0" value="${s.score !== '' ? s.score : ''}" />
            <span class="ca-score-slash">/</span>
            <input type="number" class="ca-score-max" placeholder="Max" min="0" value="${s.maxScore !== '' ? s.maxScore : ''}" />
            <button type="button" class="btn-ghost ca-score-remove" style="color:var(--danger)">Remove</button>
          </div>
        `).join('')}
      </div>
      <button class="btn-secondary" id="btn-add-ca-row" style="width:auto; padding:9px 16px; margin-top:8px;">+ Add another score</button>

      <div class="field-group" style="margin-top:18px;">
        <label>Teacher's notes (optional — shown on the result sheet)</label>
        <textarea id="ca-notes" rows="3" placeholder="e.g. Shows strong improvement this term.">${escapeHtml(r.teacherNotes || '')}</textarea>
      </div>

      <button class="btn-primary" id="btn-save-ca-scores" style="width:auto; padding:12px 24px; margin-top:8px;">Save scores</button>
    </div>
    ` : ''}

    ${isHighSchool ? renderUbmaReportCardForm(r) : ''}

    <div class="admin-panel" style="margin-top:20px;">
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn-primary" id="btn-print-result" style="width:auto; padding:12px 24px;">Print result</button>
        ${!r.published ? '<button class="btn-secondary" id="btn-publish-one" style="width:auto; padding:12px 24px;">Publish to result portal</button>' : '<div class="import-stat success" style="align-self:center;">Already published</div>'}
      </div>
    </div>
  `;

  if (isHighSchool) wireUbmaReportCardForm(main, r);

  document.getElementById('btn-back-results').addEventListener('click', () => {
    state.viewingResultId = null;
    renderResultsTab(main);
  });

  document.getElementById('btn-print-result').addEventListener('click', () => {
    window.print();
  });

  const addCaRowBtn = document.getElementById('btn-add-ca-row');
  if (addCaRowBtn) {
    addCaRowBtn.addEventListener('click', () => {
      const rows = document.getElementById('ca-scores-rows');
      const newIndex = rows.children.length;
      const div = document.createElement('div');
      div.className = 'ca-score-row';
      div.dataset.row = newIndex;
      div.innerHTML = `
        <input type="text" class="ca-score-name" placeholder="e.g. Assignment" />
        <input type="number" class="ca-score-value" placeholder="Score" min="0" />
        <span class="ca-score-slash">/</span>
        <input type="number" class="ca-score-max" placeholder="Max" min="0" />
        <button type="button" class="btn-ghost ca-score-remove" style="color:var(--danger)">Remove</button>
      `;
      rows.appendChild(div);
      div.querySelector('.ca-score-remove').addEventListener('click', () => div.remove());
    });
  }

  document.querySelectorAll('.ca-score-remove').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.ca-score-row').remove());
  });

  const saveCaBtn = document.getElementById('btn-save-ca-scores');
  if (saveCaBtn) {
    saveCaBtn.addEventListener('click', async () => {
      const components = [...document.querySelectorAll('.ca-score-row')].map(row => ({
        name: row.querySelector('.ca-score-name').value.trim(),
        score: row.querySelector('.ca-score-value').value,
        maxScore: row.querySelector('.ca-score-max').value,
      })).filter(c => c.name && c.maxScore !== '');

      const notes = document.getElementById('ca-notes').value.trim();
      await DataStore.addScoresToResult(r.id, components, notes);
      await zevaModal.alert({ title: 'Scores saved', message: 'The overall result has been recalculated to include these scores.' });
      renderSingleResultView(main, r.id);
    });
  }

  const publishBtn = document.getElementById('btn-publish-one');
  if (publishBtn) {
    publishBtn.addEventListener('click', async () => {
      await DataStore.publishResults([r.id]);
      await zevaModal.alert({ title: 'Published', message: 'This result is now visible on the student result portal.' });
      renderResultsTab(main);
    });
  }
}

// ---------------------------------------------------------------
// STAFF MANAGEMENT TAB
// ---------------------------------------------------------------
let pendingStaffPhoto = null;

async function renderStaffTab(main) {
  const allStaff = await DataStore.getStaff();

  main.innerHTML = `
    <div class="admin-header">
      <h1>Staff Management</h1>
      <p>Create, view, and remove admin accounts — including this one, if needed.</p>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">Add a new admin</h3>
      <div class="student-form-grid">
        <div>
          <div class="field-group">
            <label>Full name</label>
            <input type="text" id="staff-new-name" placeholder="e.g. Chinwe Okafor" />
          </div>
          <div class="field-group">
            <label>Designation / role</label>
            <input type="text" id="staff-new-role" placeholder="e.g. Exams Officer" />
          </div>
          <div class="field-group">
            <label>Staff profile code</label>
            <input type="text" id="staff-new-code" placeholder="e.g. ZTI-ADMIN-02" />
          </div>
          <div class="field-group">
            <label>Account type</label>
            <div class="qtype-toggle">
              <button type="button" class="qtype-btn active" data-account-type="admin" id="acct-type-admin">Admin — full access</button>
              <button type="button" class="qtype-btn" data-account-type="teacher" id="acct-type-teacher">Teacher — results only</button>
            </div>
            <p class="hint-text">Teachers can enter CA/assignment scores, grade theory answers, and publish results — but can't manage subjects, questions, exams, students, or other staff.</p>
          </div>
        </div>
        <div class="student-photo-panel">
          <label>Passport photograph</label>
          <div class="photo-preview" id="staff-photo-preview">
            <span>No photo</span>
          </div>
          <input type="file" id="staff-photo-input" accept="image/*" />
        </div>
      </div>
      <button class="btn-primary" id="btn-add-staff" style="width:auto; padding:12px 24px; margin-top:8px;">Create admin account</button>
    </div>

    <div class="admin-panel">
      <h3 class="panel-title">All admin accounts (${allStaff.length})</h3>
      <div class="data-table">
        ${allStaff.map(s => `
          <div class="table-row">
            <div class="student-row-photo">
              ${s.photo ? `<img src="${s.photo}" alt="" />` : `<span>${escapeHtml((s.name || '?').charAt(0))}</span>`}
            </div>
            <div class="row-main">
              <div class="row-title">${escapeHtml(s.name)} ${s.id === state.staff.id ? '<span class="mini-tag">You</span>' : ''} <span class="mini-tag" style="${s.accountType === 'teacher' ? 'background:var(--signal-amber-soft); color:#8a5a12;' : ''}">${s.accountType === 'teacher' ? 'Teacher' : 'Admin'}</span></div>
              <div class="row-sub mono">${escapeHtml(s.staffCode)} &middot; ${escapeHtml(s.role || 'No designation set')}</div>
            </div>
            <button class="btn-ghost" style="color:var(--danger)" data-delete-staff="${s.id}">Delete</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  let newStaffAccountType = 'admin';
  document.getElementById('acct-type-admin').addEventListener('click', () => {
    newStaffAccountType = 'admin';
    document.getElementById('acct-type-admin').classList.add('active');
    document.getElementById('acct-type-teacher').classList.remove('active');
  });
  document.getElementById('acct-type-teacher').addEventListener('click', () => {
    newStaffAccountType = 'teacher';
    document.getElementById('acct-type-teacher').classList.add('active');
    document.getElementById('acct-type-admin').classList.remove('active');
  });

  pendingStaffPhoto = null;
  document.getElementById('staff-photo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, 500, 0.85).then((dataUrl) => {
      pendingStaffPhoto = dataUrl;
      document.getElementById('staff-photo-preview').innerHTML = `<img src="${dataUrl}" alt="" />`;
    });
  });

  document.getElementById('btn-add-staff').addEventListener('click', async () => {
    const name = document.getElementById('staff-new-name').value.trim();
    const role = document.getElementById('staff-new-role').value.trim();
    const staffCode = document.getElementById('staff-new-code').value.trim();

    if (!name || !staffCode) {
      return zevaModal.alert({ title: 'Missing details', message: 'Enter at least a name and a staff profile code.' });
    }

    try {
      await DataStore.saveStaff({ name, staffCode, role, photo: pendingStaffPhoto, accountType: newStaffAccountType });
    } catch (e) {
      return zevaModal.alert({ title: 'Could not create account', message: e.message || 'That staff code may already be in use.' });
    }
    await zevaModal.alert({ title: 'Account created', message: `${name} can now log in with the code "${staffCode}".` });
    render();
  });

  main.querySelectorAll('[data-delete-staff]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteStaff;
      const isSelf = id === state.staff.id;
      const isLastOne = allStaff.length === 1;

      let message = 'This admin account will be permanently removed.';
      if (isLastOne) {
        message = 'This is the only admin account on this installation. Deleting it will sign you out, and the next person to open the admin console will be asked to create a brand new first admin account. Continue?';
      } else if (isSelf) {
        message = 'This is your own account. Deleting it will sign you out immediately. Continue?';
      }

      const confirmed = await zevaModal.confirm({
        title: 'Delete this admin account?',
        message,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        tone: 'danger',
      });
      if (!confirmed) return;

      await DataStore.deleteStaff(id);

      if (isSelf) {
        state.staff = null;
        render();
        return;
      }
      render();
    });
  });
}

// ---------------------------------------------------------------
// SCHOOL SETTINGS TAB
// ---------------------------------------------------------------
let pendingSchoolLogoDataUrl = null;

async function renderSettingsTab(main) {
  const settings = await DataStore.getSchoolSettings();
  main.innerHTML = `
    <div class="admin-header">
      <h1>School Settings</h1>
      <p>Set your school name and logo — this appears on printed result sheets.</p>
    </div>
    <div class="admin-panel">
      <div class="field-group">
        <label>School / Institute name</label>
        <input type="text" id="school-name" value="${escapeHtml(settings.schoolName)}" />
      </div>
      <div class="field-group">
        <label>Address line <span class="hint-text" style="display:inline;">(shown under the school name on the terminal report sheet)</span></label>
        <input type="text" id="school-address" value="${escapeHtml(settings.schoolAddress || '')}" placeholder="e.g. Luvu - Masaka" />
      </div>
      <div class="field-group">
        <label>Ministry / regulatory line <span class="hint-text" style="display:inline;">(shown under the address on the terminal report sheet)</span></label>
        <input type="text" id="school-ministry-line" value="${escapeHtml(settings.schoolMinistryLine || '')}" placeholder="e.g. Ministry of Education, Nasarawa State, Nigeria" />
      </div>
      <div class="field-group">
        <label>School logo</label>
        <div class="photo-preview" id="school-logo-preview" style="width:120px; height:120px;">
          ${settings.schoolLogo ? `<img src="${settings.schoolLogo}" alt="" />` : '<span>No logo</span>'}
        </div>
        <input type="file" id="school-logo-input" accept="image/*" />
      </div>
      <div class="field-group">
        <label><input type="checkbox" id="guest-mode-toggle" ${settings.guestModeEnabled !== false ? 'checked' : ''} style="width:auto;" /> Offer a demo mock trial to guests when login details don't match a student record</label>
        <p class="hint-text">When enabled, a student who can't be found is offered a practice-only demo trial using sample questions — never real exam content. When disabled, they're only prompted to re-check their details.</p>
      </div>
      <button class="btn-primary" id="btn-save-settings" style="width:auto; padding:12px 24px;">Save settings</button>
    </div>
  `;

  pendingSchoolLogoDataUrl = settings.schoolLogo;
  document.getElementById('school-logo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingSchoolLogoDataUrl = reader.result;
      document.getElementById('school-logo-preview').innerHTML = `<img src="${pendingSchoolLogoDataUrl}" alt="" />`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    await DataStore.saveSchoolSettings({
      schoolName: document.getElementById('school-name').value.trim(),
      schoolAddress: document.getElementById('school-address').value.trim(),
      schoolMinistryLine: document.getElementById('school-ministry-line').value.trim(),
      schoolLogo: pendingSchoolLogoDataUrl,
      guestModeEnabled: document.getElementById('guest-mode-toggle').checked,
    });
    await zevaModal.alert({ title: 'Saved', message: 'School settings updated.' });
  });
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
(async function init() {
  await window.ZEVA_DATASTORE_READY;
  await DataStore.seedIfEmpty();
  render();
})();
