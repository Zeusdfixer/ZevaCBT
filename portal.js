/**
 * RESULT PORTAL — standalone page for students/parents to check published results.
 * This is the ONE part of the suite intended to run online.
 */

const root = document.getElementById('root');

const state = {
  screen: 'login',
  result: null,
};

async function render() {
  if (state.screen === 'login') return renderPortalLogin();
  if (state.screen === 'result') return renderPortalResult();
}

async function renderPortalLogin() {
  const school = await DataStore.getSchoolSettings();
  root.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="brand-mark">
          <img src="assets/logo-icon.png" class="brand-icon-img" alt="" />
          <div>ZEVA CBT<small>STUDENT RESULT PORTAL</small></div>
        </div>
        <h1>Check your result</h1>
        <p class="subtitle">Enter the same details you used to take your exam.</p>

        <div class="field-group">
          <label>Full name (Surname &middot; First Name &middot; Other Name)</label>
          <input type="text" id="portal-name" placeholder="e.g. Bello Aisha Yusuf" autocomplete="off" />
        </div>
        <div class="field-group">
          <label>Registration number</label>
          <input type="text" id="portal-reg" placeholder="e.g. AMTI/001/2026" autocomplete="off" />
        </div>
        <div class="field-group">
          <label>Examination number</label>
          <input type="text" id="portal-exam-number" placeholder="e.g. AMTI/EXAM/2026/001" autocomplete="off" />
        </div>

        <button class="btn-primary" id="btn-check-result">Check result</button>

        <div class="portal-footer-brand">
          ${school.schoolLogo ? `<img src="${school.schoolLogo}" alt="" />` : ''}
          <img src="assets/logo-icon.png" alt="" />
          <span>${escapeHtml(school.schoolName)} &middot; Powered by Zeva CBT</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-check-result').addEventListener('click', handlePortalLogin);
}

async function handlePortalLogin() {
  const fullName = document.getElementById('portal-name').value.trim();
  const regNumber = document.getElementById('portal-reg').value.trim();
  const examNumber = document.getElementById('portal-exam-number').value.trim();

  if (!fullName || !regNumber || !examNumber) {
    await zevaModal.alert({ title: 'Missing details', message: 'Please fill in all three fields.' });
    return;
  }

  const student = await DataStore.findStudentForLogin({ fullName, regNumber, examNumber });
  if (!student) {
    await zevaModal.alert({ title: 'No record found', message: 'We could not find a student record matching these details. Please check and try again.' });
    return;
  }

  const results = (await DataStore.getResults(student.id)).filter(r => r.published);
  if (results.length === 0) {
    await zevaModal.alert({ title: 'No result available yet', message: 'Your result has not been published yet. Please check back later or contact your institution.' });
    return;
  }

  // Most recent published result
  state.result = results.sort((a, b) => b.createdAt - a.createdAt)[0];
  state.screen = 'result';
  render();
}

async function renderPortalResult() {
  const r = state.result;
  const school = await DataStore.getSchoolSettings();

  root.innerHTML = `
    <div class="results-screen">
      <div class="results-card">
        <button class="btn-ghost" id="btn-back-portal" style="margin-bottom:16px;">&larr; Check another result</button>

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

        <div class="results-actions" style="margin-top:20px;">
          <button class="btn-primary" id="btn-print-portal-result" style="width:auto; padding:13px 32px;">Print result</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back-portal').addEventListener('click', () => {
    state.screen = 'login';
    state.result = null;
    render();
  });

  document.getElementById('btn-print-portal-result').addEventListener('click', () => {
    window.print();
  });
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

(async function init() {
  showPreloader();
  await window.ZEVA_DATASTORE_READY;
  render();
  hidePreloader();
})();
