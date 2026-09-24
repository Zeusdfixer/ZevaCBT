/**
 * LAN DATA STORE — talks to the Zeva CBT LAN server over HTTP.
 * Implements the exact same method names as LocalDataStore so every
 * other file in the app can call window.DataStore.* without caring
 * which mode is active.
 *
 * Must be loaded AFTER data-store.js and BEFORE any page's own script.
 */

let _authToken = null;
let _customBaseUrl = null; // e.g. "http://192.168.1.10:8080" — set via ZEVA_setServerAddress()

async function _apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`;
  const base = _customBaseUrl || '';
  const res = await fetch(`${base}/api${path}`, { ...options, headers });
  let body = null;
  try { body = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const LanDataStore = {

  SECTIONS,
  HIGH_SCHOOL_GRADES,
  COLLEGE_TRACKS,
  PROFESSIONAL_BODIES,

  async getSchoolSettings() {
    return _apiFetch('/school-settings');
  },
  async saveSchoolSettings(settings) {
    return _apiFetch('/school-settings', { method: 'POST', body: JSON.stringify(settings) });
  },

  async getStaff() {
    try { return await _apiFetch('/staff'); } catch (e) { return []; }
  },
  async findStaffByCode(staffCode) {
    // Not exposed as a direct lookup endpoint (would leak staff existence pre-auth) —
    // staffLogin() is the real path. Kept only so any legacy caller doesn't crash.
    return null;
  },
  async saveStaff(staffMember) {
    return _apiFetch('/staff', { method: 'POST', body: JSON.stringify(staffMember) });
  },
  async deleteStaff(id) {
    return _apiFetch(`/staff/${id}`, { method: 'DELETE' });
  },
  async staffLogin(name, staffCode) {
    try {
      const result = await _apiFetch('/staff/login', { method: 'POST', body: JSON.stringify({ name, staffCode }) });
      _authToken = result.token;
      sessionStorage.setItem('zeva_auth_token', result.token);
      return result;
    } catch (e) {
      return null;
    }
  },

  async getSubjects(section = null, options = {}) {
    const params = new URLSearchParams();
    if (section) params.set('section', section);
    if (options.isDemo) params.set('demo', 'true');
    const qs = params.toString();
    return _apiFetch(`/subjects${qs ? `?${qs}` : ''}`);
  },
  async saveSubject(subject) {
    return _apiFetch('/subjects', { method: 'POST', body: JSON.stringify(subject) });
  },
  /** Server already merges on name+grade+section+isDemo for every POST to
   * /subjects (see server.js), so this is a thin wrapper kept for interface
   * parity with LocalDataStore.findOrCreateSubject(). */
  async findOrCreateSubject(subject) {
    const saved = await this.saveSubject(subject);
    const created = !saved._merged;
    delete saved._merged;
    return { subject: saved, created };
  },
  async deleteSubject(id) {
    return _apiFetch(`/subjects/${id}`, { method: 'DELETE' });
  },

  async getQuestions(subjectId = null) {
    return _apiFetch(`/questions${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`);
  },
  async saveQuestion(question) {
    return _apiFetch('/questions', { method: 'POST', body: JSON.stringify(question) });
  },
  async bulkAddQuestions(questionArray) {
    const created = await _apiFetch('/questions/bulk', { method: 'POST', body: JSON.stringify({ questions: questionArray }) });
    return created;
  },
  async deleteQuestion(id) {
    return _apiFetch(`/questions/${id}`, { method: 'DELETE' });
  },

  async getExams(section = null) {
    return _apiFetch(`/exams${section ? `?section=${encodeURIComponent(section)}` : ''}`);
  },
  async getExam(id) {
    try { return await _apiFetch(`/exams/${id}`); } catch (e) { return null; }
  },
  async saveExam(exam) {
    return _apiFetch('/exams', { method: 'POST', body: JSON.stringify(exam) });
  },
  async deleteExam(id) {
    return _apiFetch(`/exams/${id}`, { method: 'DELETE' });
  },

  async getStudents(section = null) {
    return _apiFetch(`/students${section ? `?section=${encodeURIComponent(section)}` : ''}`);
  },
  async getStudentById(id) {
    const students = await this.getStudents();
    return students.find(s => s.id === id) || null;
  },
  async findStudentForLogin({ fullName, regNumber, examNumber }) {
    try {
      return await _apiFetch('/students/login', { method: 'POST', body: JSON.stringify({ fullName, regNumber, examNumber }) });
    } catch (e) {
      return null;
    }
  },
  async saveStudent(student) {
    return _apiFetch('/students', { method: 'POST', body: JSON.stringify(student) });
  },
  async deleteStudent(id) {
    return _apiFetch(`/students/${id}`, { method: 'DELETE' });
  },
  async generateNextStudentNumbers({ year } = {}) {
    return _apiFetch(`/students/next-numbers${year ? `?year=${year}` : ''}`);
  },

  // ---- Server-authoritative exam sessions ----
  async startExamSession({ studentId, examId, overrideSeconds }) {
    return _apiFetch('/sessions/start', { method: 'POST', body: JSON.stringify({ studentId, examId, overrideSeconds }) });
  },
  async getSessionSnapshot(sessionId) {
    return _apiFetch(`/sessions/${sessionId}`);
  },
  async getActiveExamSession(studentId, examId) {
    const { session } = await _apiFetch(`/sessions/active?studentId=${encodeURIComponent(studentId)}&examId=${encodeURIComponent(examId)}`);
    return session;
  },
  async answerQuestion(sessionId, questionId, optionIndex) {
    return _apiFetch(`/sessions/${sessionId}/answer`, { method: 'POST', body: JSON.stringify({ questionId, optionIndex }) });
  },
  async flagQuestion(sessionId, questionId, flagged) {
    return _apiFetch(`/sessions/${sessionId}/flag`, { method: 'POST', body: JSON.stringify({ questionId, flagged }) });
  },
  async pauseExamSession(sessionId) {
    return _apiFetch(`/sessions/${sessionId}/pause`, { method: 'POST' });
  },
  async resumeExamSession(sessionId) {
    return _apiFetch(`/sessions/${sessionId}/resume`, { method: 'POST' });
  },
  async submitExamSession(sessionId, { autoSubmitted, autoSubmitReason }) {
    return _apiFetch(`/sessions/${sessionId}/submit`, { method: 'POST', body: JSON.stringify({ autoSubmitted, autoSubmitReason }) });
  },
  async getLiveMonitor() {
    try { return await _apiFetch('/admin/monitor'); } catch (e) { return []; }
  },

  // Local-only concepts that LAN mode doesn't use the same way — kept as safe no-ops
  // so any legacy caller doesn't crash.
  async getActiveSession() { return null; },
  async saveActiveSession() { return null; },
  async clearActiveSession() { return null; },

  async getResults(studentId = null) {
    return _apiFetch(`/results${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''}`);
  },
  async getResultById(id) {
    try { return await _apiFetch(`/results/${id}`); } catch (e) { return null; }
  },
  async publishResults(resultIds) {
    return _apiFetch('/results/publish', { method: 'POST', body: JSON.stringify({ ids: resultIds }) });
  },
  async gradeTheoryAnswers(resultId, gradedAnswers) {
    return _apiFetch(`/results/${resultId}/grade-theory`, { method: 'POST', body: JSON.stringify({ gradedAnswers }) });
  },
  async addScoresToResult(resultId, components, notes) {
    return _apiFetch(`/results/${resultId}/add-scores`, { method: 'POST', body: JSON.stringify({ components, notes }) });
  },
  async saveReportCard(resultId, reportCard) {
    return _apiFetch(`/results/${resultId}/report-card`, { method: 'POST', body: JSON.stringify({ reportCard }) });
  },

  // The server has its own bootstrap (first staff creation); no client-side seeding.
  async seedIfEmpty() { return; },

  async resetAllData() {
    return _apiFetch('/reset', { method: 'POST' });
  },
};

window.LanDataStore = LanDataStore;

// ---------------------------------------------------------------
// MANUAL SERVER CONNECTION — for devices that don't auto-detect the
// server (e.g. app files opened locally rather than served from the
// LAN server's own address). Lets a student/admin type in the
// server's IP:port directly.
// ---------------------------------------------------------------
async function _pingServer(baseUrl, timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/api/config`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const config = await res.json();
    return config && config.ok ? config : null;
  } catch (e) {
    return null;
  }
}

function _normalizeServerAddress(address) {
  let addr = String(address || '').trim();
  if (!addr) return null;
  if (!/^https?:\/\//i.test(addr)) addr = `http://${addr}`;
  return addr.replace(/\/+$/, ''); // strip trailing slash
}

/** Try connecting to a specific server address (e.g. "192.168.1.10:8080").
 * On success, switches the whole app into LAN mode against that address
 * and remembers it for next time. Returns { ok, error }. */
window.ZEVA_setServerAddress = async function (address) {
  const normalized = _normalizeServerAddress(address);
  if (!normalized) return { ok: false, error: 'Enter a server address.' };

  const config = await _pingServer(normalized);
  if (!config) {
    return { ok: false, error: 'Could not reach a Zeva CBT server at that address. Check the address and that both devices are on the same network.' };
  }

  _customBaseUrl = normalized;
  localStorage.setItem('zeva_server_address', normalized);
  window.DataStore = LanDataStore;
  window.ZEVA_MODE = 'lan';
  window.ZEVA_SERVER_CONFIG = config;
  return { ok: true };
};

window.ZEVA_getSavedServerAddress = function () {
  return localStorage.getItem('zeva_server_address');
};

window.ZEVA_forgetServerAddress = function () {
  localStorage.removeItem('zeva_server_address');
  _customBaseUrl = null;
};

// ---------------------------------------------------------------
// MODE DETECTION
// ---------------------------------------------------------------
window.ZEVA_DATASTORE_READY = (async () => {
  const saved = sessionStorage.getItem('zeva_auth_token');
  if (saved) _authToken = saved;

  // 1) If the page is genuinely being served BY the LAN server itself,
  //    that's the ideal case — same-origin, zero setup needed.
  const sameOriginConfig = await _pingServer('');
  if (sameOriginConfig) {
    window.DataStore = LanDataStore;
    window.ZEVA_MODE = 'lan';
    window.ZEVA_SERVER_CONFIG = sameOriginConfig;
    return;
  }

  // 2) Otherwise, if a server address was manually saved before
  //    (e.g. the app files were opened locally on a student device),
  //    try that.
  const savedAddress = localStorage.getItem('zeva_server_address');
  if (savedAddress) {
    const config = await _pingServer(savedAddress);
    if (config) {
      _customBaseUrl = savedAddress;
      window.DataStore = LanDataStore;
      window.ZEVA_MODE = 'lan';
      window.ZEVA_SERVER_CONFIG = config;
      return;
    }
  }

  // 3) No server reachable any way — fully offline standalone mode.
  window.DataStore = LocalDataStore;
  window.ZEVA_MODE = 'standalone';
})();
