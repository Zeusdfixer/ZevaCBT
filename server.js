/**
 * server.js — Zeva CBT LAN Server
 * Serves the existing frontend files AND a REST API backed by SQLite.
 * Zero external dependencies — uses only Node's built-in http, fs, path, node:sqlite.
 *
 * Run: node server.js [port]
 * Default port: 8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./db.js');
const { buildDemoContent } = require('../demo-content.js');
const license = require('../licensing/license.js');

// The license file lives inside the server folder (removed by a normal
// uninstall of the packaged app — see licensing/license.js and
// INSTALL-GUIDE.txt for why this location matters).
const LICENSE_DIR = __dirname;

// Seed demo (guest mock trial) content once, if none exists yet. Entirely
// separate from any institution's real question bank — isDemo:true only.
(function seedDemoContentIfEmpty() {
  const existingDemo = db.getSubjects(null, { isDemo: true });
  if (existingDemo.length > 0) return;
  const { subjects, questionsBySubjectKey } = buildDemoContent();
  for (const subj of subjects) {
    const saved = db.createSubject({ name: subj.name, code: subj.code, section: subj.section, grade: subj.grade, isDemo: true });
    const questions = questionsBySubjectKey[subj.key].map((q) => ({ ...q, subjectId: saved.id }));
    db.bulkCreateQuestions(questions);
  }
  console.log(`Seeded ${subjects.length} demo subjects for guest mock trials.`);
})();

const PORT = parseInt(process.argv[2], 10) || 8080;
const FRONTEND_ROOT = path.join(__dirname, '..'); // cbt-app/ (parent of server/)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) { // 25MB cap (photos are base64)
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function getAuthStaff(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return db.getStaffByToken(token);
}

function requireAuth(req, res) {
  const staff = getAuthStaff(req);
  if (!staff) {
    sendJson(res, 401, { error: 'Unauthorized — staff login required.' });
    return null;
  }
  return staff;
}

/** Full admin permissions (subjects/questions/exams/students/staff/settings)
 * are restricted to accountType==='admin'. Teachers can log in and handle
 * results (CA scores, theory grading, publishing) but not the above. */
function requireAdmin(req, res) {
  const staff = requireAuth(req, res);
  if (!staff) return null;
  if (staff.accountType !== 'admin') {
    sendJson(res, 403, { error: 'This action requires an admin account.' });
    return null;
  }
  return staff;
}

// ---------------------------------------------------------------
// Grading logic (server-authoritative — mirrors client logic in app.js)
// ---------------------------------------------------------------
function gradeSession(session, exam) {
  const subjectResults = [];
  let totalCorrect = 0;
  let totalQuestions = 0;
  const theoryAnswers = [];

  for (const subj of session.subjects) {
    const qs = session.questionsBySubject[subj.id] || [];
    const objectiveQs = qs.filter((q) => q.questionType !== 'theory');
    let correct = 0;
    objectiveQs.forEach((q) => {
      totalQuestions++;
      if (session.answers[q.id] === q._correctDisplayIndex) {
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

    qs.filter((q) => q.questionType === 'theory').forEach((q) => {
      theoryAnswers.push({
        subjectId: subj.id,
        subjectName: subj.name,
        questionId: q.id,
        questionText: q.text,
        maxMarks: q.maxMarks || 10,
        answerText: session.answers[q.id] || '',
        awardedMarks: null,
        graded: false,
      });
    });
  }

  const overallPercent = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const passed = overallPercent >= (exam.passMarkPercent || 50);
  return { subjectResults, totalCorrect, totalQuestions, overallPercent, passed, theoryAnswers };
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestionSnapshot(exam) {
  const subjects = db.getSubjects().filter((s) => exam.subjectIds.includes(s.id));
  const questionsBySubject = {};
  for (const subj of subjects) {
    let objectiveQs = db.getQuestions(subj.id).filter((q) => (q.questionType || 'objective') === 'objective');
    let theoryQs = db.getQuestions(subj.id).filter((q) => q.questionType === 'theory');

    if (exam.shuffleQuestions) objectiveQs = shuffleArray(objectiveQs);
    objectiveQs = objectiveQs.slice(0, exam.questionsPerSubject[subj.id] || objectiveQs.length);

    const objectiveMapped = objectiveQs.map((q) => {
      if (exam.shuffleOptions) {
        const optionIndices = q.options.map((_, i) => i);
        const shuffled = shuffleArray(optionIndices);
        return {
          id: q.id, text: q.text, imageData: q.imageData || null, questionType: 'objective',
          _displayOptions: shuffled.map((i) => q.options[i]),
          _correctDisplayIndex: shuffled.indexOf(q.correctIndex),
        };
      }
      return { id: q.id, text: q.text, imageData: q.imageData || null, questionType: 'objective', _displayOptions: q.options, _correctDisplayIndex: q.correctIndex };
    });

    const theoryCount = (exam.theoryQuestionsPerSubject && exam.theoryQuestionsPerSubject[subj.id]) || 0;
    const theoryMapped = shuffleArray(theoryQs).slice(0, theoryCount).map((q) => ({
      id: q.id, text: q.text, imageData: q.imageData || null, questionType: 'theory', maxMarks: q.maxMarks || 10,
    }));

    questionsBySubject[subj.id] = [...objectiveMapped, ...theoryMapped];
  }
  return { subjects, questionsBySubject };
}

// ---------------------------------------------------------------
// API ROUTER
// ---------------------------------------------------------------
async function handleApi(req, res, pathname) {
  const method = req.method;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const q = url.searchParams;
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]

  try {
    // ---- config ----
    if (pathname === '/api/config' && method === 'GET') {
      const nets = os.networkInterfaces();
      let lanIp = null;
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) { lanIp = net.address; break; }
        }
        if (lanIp) break;
      }
      return sendJson(res, 200, { ok: true, mode: 'lan', port: PORT, lanIp, serverTime: db.now() });
    }

    // ---- staff ----
    if (pathname === '/api/staff/login' && method === 'POST') {
      const { name, staffCode } = await readBody(req);
      const staff = db.findStaffByCode(staffCode || '');
      if (!staff) return sendJson(res, 404, { error: 'No staff profile matches this code.' });
      const token = db.createToken(staff.id);
      return sendJson(res, 200, { token, staff });
    }
    if (pathname === '/api/staff' && method === 'GET') {
      if (!requireAuth(req, res)) return;
      return sendJson(res, 200, db.getStaff());
    }
    if (pathname === '/api/staff' && method === 'POST') {
      const existingStaff = db.getStaff();
      if (existingStaff.length > 0 && !requireAdmin(req, res)) return;
      const body = await readBody(req);
      if (db.findStaffByCode(body.staffCode)) return sendJson(res, 409, { error: 'That staff code is already in use.' });
      const created = db.createStaff(body);
      return sendJson(res, 201, created);
    }
    if (parts[1] === 'staff' && parts[2] && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      db.deleteStaff(parts[2]);
      return sendJson(res, 200, { ok: true });
    }

    // ---- school settings ----
    if (pathname === '/api/school-settings' && method === 'GET') {
      return sendJson(res, 200, db.getSchoolSettings());
    }
    if (pathname === '/api/school-settings' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      return sendJson(res, 200, db.saveSchoolSettings(body));
    }

    // ---- subjects ----
    if (pathname === '/api/subjects' && method === 'GET') {
      return sendJson(res, 200, db.getSubjects(q.get('section') || null, { isDemo: q.get('demo') === 'true' }));
    }
    if (pathname === '/api/subjects' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      // Match on name+grade+section+isDemo so adding a subject that already
      // exists (e.g. another "English Language" for the same grade) reuses
      // the existing subject and its question bank instead of forking a
      // duplicate. Set body.forceNew:true to bypass and always create new.
      if (body.forceNew) return sendJson(res, 201, db.createSubject(body));
      const { subject, created } = db.findOrCreateSubject(body);
      return sendJson(res, created ? 201 : 200, { ...subject, _merged: !created });
    }
    if (parts[1] === 'subjects' && parts[2] && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      db.deleteSubject(parts[2]);
      return sendJson(res, 200, { ok: true });
    }

    // ---- questions ----
    if (pathname === '/api/questions' && method === 'GET') {
      return sendJson(res, 200, db.getQuestions(q.get('subjectId') || null));
    }
    if (pathname === '/api/questions' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      return sendJson(res, 201, db.createQuestion(body));
    }
    if (pathname === '/api/questions/bulk' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      return sendJson(res, 201, db.bulkCreateQuestions(body.questions || []));
    }
    if (parts[1] === 'questions' && parts[2] && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      db.deleteQuestion(parts[2]);
      return sendJson(res, 200, { ok: true });
    }

    // ---- exams ----
    if (pathname === '/api/exams' && method === 'GET') {
      return sendJson(res, 200, db.getExams(q.get('section') || null));
    }
    if (parts[1] === 'exams' && parts[2] && method === 'GET') {
      const exam = db.getExam(parts[2]);
      if (!exam) return sendJson(res, 404, { error: 'Exam not found.' });
      return sendJson(res, 200, exam);
    }
    if (pathname === '/api/exams' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      return sendJson(res, 201, db.createExam(body));
    }
    if (parts[1] === 'exams' && parts[2] && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      db.deleteExam(parts[2]);
      return sendJson(res, 200, { ok: true });
    }

    // ---- students ----
    if (pathname === '/api/students' && method === 'GET') {
      return sendJson(res, 200, db.getStudents(q.get('section') || null));
    }
    if (pathname === '/api/students/next-numbers' && method === 'GET') {
      const year = q.get('year') ? parseInt(q.get('year'), 10) : undefined;
      return sendJson(res, 200, db.generateNextStudentNumbers(year));
    }
    if (pathname === '/api/students/login' && method === 'POST') {
      const body = await readBody(req);
      const student = db.findStudentForLogin(body);
      if (!student) return sendJson(res, 404, { error: 'No student record found for these details.' });
      return sendJson(res, 200, student);
    }
    if (pathname === '/api/students' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      return sendJson(res, 201, db.createStudent(body));
    }
    if (parts[1] === 'students' && parts[2] && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      db.deleteStudent(parts[2]);
      return sendJson(res, 200, { ok: true });
    }

    // ---- exam sessions (server-authoritative timing/grading) ----
    if (pathname === '/api/sessions/start' && method === 'POST') {
      const { studentId, examId, overrideSeconds } = await readBody(req);
      const exam = db.getExam(examId);
      if (!exam) return sendJson(res, 404, { error: 'Exam not found.' });

      const existing = db.getActiveSessionForStudent(studentId, examId);
      if (existing) return sendJson(res, 200, { session: existing, resumed: true });

      const { subjects, questionsBySubject } = buildQuestionSnapshot(exam);
      const durationSeconds = (overrideSeconds !== undefined && overrideSeconds !== null)
        ? overrideSeconds
        : exam.durationMinutes * 60;
      const session = db.createSession({
        studentId, examId, subjects, questionsBySubject, durationSeconds,
      });
      return sendJson(res, 201, { session, resumed: false });
    }
    if (pathname === '/api/sessions/active' && method === 'GET') {
      const session = db.getActiveSessionForStudent(q.get('studentId'), q.get('examId'));
      return sendJson(res, 200, { session });
    }
    if (parts[1] === 'sessions' && parts[2] && !parts[3] && method === 'GET') {
      const session = db.getSession(parts[2]);
      if (!session) return sendJson(res, 404, { error: 'Session not found.' });
      db.touchSession(session.id);
      return sendJson(res, 200, session);
    }
    if (parts[1] === 'sessions' && parts[2] && parts[3] === 'answer' && method === 'POST') {
      const { questionId, optionIndex } = await readBody(req);
      const session = db.saveAnswer(parts[2], questionId, optionIndex);
      if (!session) return sendJson(res, 404, { error: 'Session not found.' });
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'sessions' && parts[2] && parts[3] === 'flag' && method === 'POST') {
      const { questionId, flagged } = await readBody(req);
      const session = db.saveFlag(parts[2], questionId, flagged);
      if (!session) return sendJson(res, 404, { error: 'Session not found.' });
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'sessions' && parts[2] && parts[3] === 'nav' && method === 'POST') {
      const body = await readBody(req);
      const session = db.updateNavigation(parts[2], body);
      return sendJson(res, 200, { ok: true, session });
    }
    if (parts[1] === 'sessions' && parts[2] && parts[3] === 'pause' && method === 'POST') {
      // Pausing is a mock-trial-only feature. Real sessions never reach the server
      // as trials (trials always stay client-side), so any session found here
      // belongs to a live candidate — pausing is always refused.
      return sendJson(res, 403, { error: 'Pausing is not available for live exams.' });
    }
    if (parts[1] === 'sessions' && parts[2] && parts[3] === 'resume' && method === 'POST') {
      return sendJson(res, 200, db.resumeSession(parts[2]));
    }
    if (parts[1] === 'sessions' && parts[2] && parts[3] === 'submit' && method === 'POST') {
      const session = db.getSession(parts[2]);
      if (!session) return sendJson(res, 404, { error: 'Session not found.' });
      const body = await readBody(req);
      const exam = db.getExam(session.examId);
      const student = db.getStudentById(session.studentId);
      const grading = gradeSession(session, exam);

      const secondsLeftAtSubmit = Math.max(0, Math.round((session.serverEndTime - db.now()) / 1000));
      const timeUsedSeconds = exam.durationMinutes * 60 - secondsLeftAtSubmit;

      const result = db.createResult({
        sessionId: session.id,
        studentId: session.studentId,
        examId: session.examId,
        studentName: student?.fullName,
        studentPhoto: student?.photo,
        regNumber: student?.regNumber,
        examNumber: student?.examNumber,
        examTitle: exam.title,
        section: exam.section,
        ...grading,
        autoSubmitted: !!body.autoSubmitted,
        autoSubmitReason: body.autoSubmitReason || null,
        isTrial: false,
        secondsLeftAtSubmit,
        timeUsedSeconds,
      });
      db.closeSession(session.id, 'submitted');
      return sendJson(res, 200, { result });
    }

    // ---- admin live monitoring ----
    if (pathname === '/api/admin/monitor' && method === 'GET') {
      if (!requireAuth(req, res)) return;
      const sessions = db.getAllActiveSessions();
      const enriched = sessions.map((s) => {
        const student = db.getStudentById(s.studentId);
        const exam = db.getExam(s.examId);
        const allQuestions = Object.values(s.questionsBySubject).flat();
        const answeredCount = Object.keys(s.answers).length;
        const secondsLeft = Math.max(0, Math.round(((s.status === 'paused' ? s.serverEndTime : s.serverEndTime) - db.now()) / 1000));
        return {
          sessionId: s.id,
          studentName: student?.fullName || 'Unknown',
          regNumber: student?.regNumber || '',
          examTitle: exam?.title || '',
          status: s.status,
          answeredCount,
          totalQuestions: allQuestions.length,
          secondsLeft: s.status === 'paused' ? Math.max(0, Math.round((s.serverEndTime - s.pausedAt) / 1000)) : secondsLeft,
          lastSeenAt: s.lastSeenAt,
          connected: (db.now() - s.lastSeenAt) < 30000, // 30s heartbeat window
        };
      });
      return sendJson(res, 200, enriched);
    }

    // ---- results ----
    if (pathname === '/api/results' && method === 'GET') {
      return sendJson(res, 200, db.getResults(q.get('studentId') || null));
    }
    if (parts[1] === 'results' && parts[2] && method === 'GET') {
      const result = db.getResultById(parts[2]);
      if (!result) return sendJson(res, 404, { error: 'Result not found.' });
      return sendJson(res, 200, result);
    }
    if (pathname === '/api/results/publish' && method === 'POST') {
      if (!requireAuth(req, res)) return;
      const { ids } = await readBody(req);
      db.publishResults(ids || []);
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'results' && parts[2] && parts[3] === 'grade-theory' && method === 'POST') {
      if (!requireAuth(req, res)) return;
      const result = db.getResultById(parts[2]);
      if (!result) return sendJson(res, 404, { error: 'Result not found.' });
      const exam = db.getExam(result.examId);
      const { gradedAnswers } = await readBody(req);
      const updated = db.gradeTheoryAnswers(parts[2], gradedAnswers || [], exam?.passMarkPercent);
      return sendJson(res, 200, updated);
    }
    if (parts[1] === 'results' && parts[2] && parts[3] === 'add-scores' && method === 'POST') {
      if (!requireAuth(req, res)) return;
      const result = db.getResultById(parts[2]);
      if (!result) return sendJson(res, 404, { error: 'Result not found.' });
      const exam = db.getExam(result.examId);
      const { components, notes } = await readBody(req);
      const updated = db.addScoresToResult(parts[2], components || [], notes || '', exam?.passMarkPercent);
      return sendJson(res, 200, updated);
    }
    if (parts[1] === 'results' && parts[2] && parts[3] === 'report-card' && method === 'POST') {
      if (!requireAuth(req, res)) return;
      const result = db.getResultById(parts[2]);
      if (!result) return sendJson(res, 404, { error: 'Result not found.' });
      const { reportCard } = await readBody(req);
      const updated = db.saveReportCard(parts[2], reportCard || {});
      return sendJson(res, 200, updated);
    }

    // ---- reset (dangerous, admin-only) ----
    if (pathname === '/api/reset' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      db.resetAllData();
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'Not found', path: pathname });
  } catch (err) {
    console.error('API error:', err);
    return sendJson(res, 500, { error: 'Server error', detail: err.message });
  }
}

// ---------------------------------------------------------------
// STATIC FILE SERVING
// ---------------------------------------------------------------
function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, ''); // prevent path traversal
  const fullPath = path.join(FRONTEND_ROOT, filePath);

  if (!fullPath.startsWith(FRONTEND_ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------
// SERVER
// ---------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // ---- Activation gate ----
  // Checked fresh on every request (cheap: local file read + HMAC) so
  // that activating doesn't require restarting the server — the very
  // next request after a successful activation is treated as licensed.
  const licenseStatus = license.checkLicenseStatus(LICENSE_DIR);
  const isActivationRoute = pathname === '/api/license/status' || pathname === '/api/license/activate' || pathname === '/activate.html' || pathname.startsWith('/assets/');
  if (!licenseStatus.activated && !isActivationRoute) {
    const message = licenseStatus.expired
      ? `This installation's ${licenseStatus.plan ? licenseStatus.plan.replace('T', '') + '-day ' : ''}activation plan has expired. Purchase a new activation code to continue.`
      : 'This installation is not activated.';
    if (pathname.startsWith('/api/')) {
      res.writeHead(402, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: message, serialNumber: licenseStatus.serialNumber, expired: licenseStatus.expired }));
    }
    res.writeHead(302, { Location: '/activate.html' });
    return res.end();
  }

  if (pathname === '/api/license/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(licenseStatus));
  }
  if (pathname === '/api/license/activate' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { activationCode } = JSON.parse(body || '{}');
        const result = license.activateWithCode(activationCode, LICENSE_DIR);
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, message: 'Invalid request.' }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname);
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  console.log('\n========================================');
  console.log('  ZEVA CBT LOCAL SERVER');
  console.log('========================================');
  console.log(`  Status:  RUNNING`);
  console.log(`  Port:    ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Network: http://${net.address}:${PORT}  <-- share this with student PCs`);
      }
    }
  }
  console.log('========================================\n');
});

module.exports = server;
