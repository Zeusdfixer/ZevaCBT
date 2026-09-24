/**
 * db.js — Zeva CBT LAN Server database layer
 * Uses Node's built-in node:sqlite (Node 22+, no external dependencies).
 * This file owns the schema and every SQL statement. Nothing else in the
 * server should write raw SQL — call the functions exported here instead.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'zeva-cbt.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    staff_code TEXT NOT NULL UNIQUE,
    role TEXT,
    photo TEXT,
    account_type TEXT NOT NULL DEFAULT 'admin',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS school_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    school_name TEXT NOT NULL DEFAULT 'AMTI — ARM''s Minor Tech Institute',
    school_logo TEXT,
    guest_mode_enabled INTEGER NOT NULL DEFAULT 1,
    school_address TEXT,
    school_ministry_line TEXT
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    section TEXT,
    grade TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    text TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    explanation TEXT,
    image_data TEXT,
    question_type TEXT NOT NULL DEFAULT 'objective',
    max_marks INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    section TEXT,
    grade TEXT,
    subject_ids TEXT NOT NULL,
    questions_per_subject TEXT NOT NULL,
    theory_questions_per_subject TEXT NOT NULL DEFAULT '{}',
    duration_minutes INTEGER NOT NULL,
    shuffle_questions INTEGER NOT NULL DEFAULT 1,
    shuffle_options INTEGER NOT NULL DEFAULT 1,
    pass_mark_percent INTEGER NOT NULL DEFAULT 50,
    resit_policy TEXT NOT NULL DEFAULT 'not_allowed',
    allow_pause INTEGER NOT NULL DEFAULT 0,
    allow_review INTEGER NOT NULL DEFAULT 1,
    anti_cheat_auto_submit INTEGER NOT NULL DEFAULT 1,
    allow_network_pause INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    surname TEXT,
    first_name TEXT,
    other_name TEXT,
    full_name TEXT NOT NULL,
    reg_number TEXT NOT NULL,
    exam_number TEXT NOT NULL,
    section TEXT,
    grade TEXT,
    sex TEXT,
    photo TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exam_sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    exam_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    subjects_snapshot TEXT NOT NULL,
    questions_snapshot TEXT NOT NULL,
    answers TEXT NOT NULL DEFAULT '{}',
    flagged TEXT NOT NULL DEFAULT '{}',
    active_subject_id TEXT,
    current_question_id TEXT,
    server_start_time INTEGER NOT NULL,
    server_end_time INTEGER NOT NULL,
    paused_at INTEGER,
    total_paused_ms INTEGER NOT NULL DEFAULT 0,
    last_seen_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS results (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    student_id TEXT NOT NULL,
    exam_id TEXT NOT NULL,
    student_name TEXT,
    student_photo TEXT,
    reg_number TEXT,
    exam_number TEXT,
    exam_title TEXT,
    section TEXT,
    subject_results TEXT NOT NULL,
    total_correct INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    overall_percent INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    auto_submitted INTEGER NOT NULL DEFAULT 0,
    auto_submit_reason TEXT,
    is_trial INTEGER NOT NULL DEFAULT 0,
    seconds_left_at_submit INTEGER,
    time_used_seconds INTEGER,
    published INTEGER NOT NULL DEFAULT 0,
    theory_answers TEXT NOT NULL DEFAULT '[]',
    theory_marks_awarded INTEGER NOT NULL DEFAULT 0,
    theory_fully_graded INTEGER NOT NULL DEFAULT 1,
    additional_scores TEXT NOT NULL DEFAULT '[]',
    report_card TEXT,
    teacher_notes TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// ---- Lightweight column migrations ----
// CREATE TABLE IF NOT EXISTS only takes effect on a brand-new database file;
// it silently does nothing for a table that already exists with an older
// column set. Any column added to the schema after the app's first release
// needs an explicit ALTER TABLE guarded by a column-existence check, or
// existing installations will hit "no such column" errors.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('school_settings', 'school_address', 'TEXT');
ensureColumn('school_settings', 'school_ministry_line', 'TEXT');
ensureColumn('students', 'sex', 'TEXT');
ensureColumn('exams', 'anti_cheat_auto_submit', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('exams', 'allow_network_pause', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('results', 'auto_submit_reason', 'TEXT');

// Seed school settings row if absent
if (!db.prepare('SELECT id FROM school_settings WHERE id = 1').get()) {
  db.prepare('INSERT INTO school_settings (id, school_name, school_logo) VALUES (1, ?, NULL)')
    .run("AMTI — ARM's Minor Tech Institute");
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function now() {
  return Date.now();
}

// ---------------- STAFF ----------------
function rowToStaff(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, staffCode: row.staff_code, role: row.role, photo: row.photo || null, accountType: row.account_type || 'admin' };
}
function getStaff() {
  return db.prepare('SELECT * FROM staff ORDER BY created_at').all().map(rowToStaff);
}
function findStaffByCode(code) {
  return rowToStaff(db.prepare('SELECT * FROM staff WHERE staff_code = ? COLLATE NOCASE').get(code));
}
function createStaff({ name, staffCode, role, photo, accountType }) {
  const id = uid('staff');
  const type = accountType === 'teacher' ? 'teacher' : 'admin';
  db.prepare('INSERT INTO staff (id, name, staff_code, role, photo, account_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, staffCode, role || '', photo || null, type, now());
  return { id, name, staffCode, role, photo: photo || null, accountType: type };
}
function deleteStaff(id) {
  db.prepare('DELETE FROM staff WHERE id = ?').run(id);
  db.prepare('DELETE FROM auth_tokens WHERE staff_id = ?').run(id);
}
function createToken(staffId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO auth_tokens (token, staff_id, created_at) VALUES (?, ?, ?)').run(token, staffId, now());
  return token;
}
function getStaffByToken(token) {
  const row = db.prepare('SELECT staff_id FROM auth_tokens WHERE token = ?').get(token);
  if (!row) return null;
  return rowToStaff(db.prepare('SELECT * FROM staff WHERE id = ?').get(row.staff_id));
}

// ---------------- SCHOOL SETTINGS ----------------
function getSchoolSettings() {
  const row = db.prepare('SELECT * FROM school_settings WHERE id = 1').get();
  return {
    schoolName: row.school_name,
    schoolLogo: row.school_logo,
    guestModeEnabled: !!row.guest_mode_enabled,
    schoolAddress: row.school_address || '',
    schoolMinistryLine: row.school_ministry_line || '',
  };
}
function saveSchoolSettings({ schoolName, schoolLogo, guestModeEnabled, schoolAddress, schoolMinistryLine }) {
  const current = getSchoolSettings();
  db.prepare('UPDATE school_settings SET school_name = ?, school_logo = ?, guest_mode_enabled = ?, school_address = ?, school_ministry_line = ? WHERE id = 1')
    .run(
      schoolName ?? current.schoolName,
      schoolLogo !== undefined ? schoolLogo : current.schoolLogo,
      guestModeEnabled === false ? 0 : 1,
      schoolAddress !== undefined ? schoolAddress : current.schoolAddress,
      schoolMinistryLine !== undefined ? schoolMinistryLine : current.schoolMinistryLine
    );
  return getSchoolSettings();
}

// ---------------- SUBJECTS ----------------
function rowToSubject(row) {
  return { id: row.id, name: row.name, code: row.code, section: row.section, grade: row.grade || null, isDemo: !!row.is_demo };
}
function getSubjects(section, options = {}) {
  const isDemo = options.isDemo === undefined ? 0 : (options.isDemo ? 1 : 0);
  const rows = section
    ? db.prepare('SELECT * FROM subjects WHERE section = ? AND is_demo = ? ORDER BY created_at').all(section, isDemo)
    : db.prepare('SELECT * FROM subjects WHERE is_demo = ? ORDER BY created_at').all(isDemo);
  return rows.map(rowToSubject);
}
function createSubject({ name, code, section, grade, isDemo }) {
  const id = uid('subj');
  db.prepare('INSERT INTO subjects (id, name, code, section, grade, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, code || '', section || '', grade || null, isDemo ? 1 : 0, now());
  return { id, name, code, section, grade: grade || null, isDemo: !!isDemo };
}
/** Returns an existing subject matched by name+grade+section+isDemo
 * (case-insensitive on name), or creates a new one. Use this instead of
 * createSubject() whenever a subject might already exist, so that adding
 * "English Language" for a grade that already has it grows the same
 * question bank instead of forking a duplicate subject. */
function findOrCreateSubject({ name, code, section, grade, isDemo }) {
  const row = db.prepare(`
    SELECT * FROM subjects
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
      AND LOWER(TRIM(COALESCE(section,''))) = LOWER(TRIM(COALESCE(?,'')))
      AND LOWER(TRIM(COALESCE(grade,''))) = LOWER(TRIM(COALESCE(?,'')))
      AND is_demo = ?
  `).get(name, section || '', grade || '', isDemo ? 1 : 0);
  if (row) return { subject: rowToSubject(row), created: false };
  return { subject: createSubject({ name, code, section, grade, isDemo }), created: true };
}
function deleteSubject(id) {
  db.prepare('DELETE FROM questions WHERE subject_id = ?').run(id);
  db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
}

// ---------------- QUESTIONS ----------------
function rowToQuestion(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    text: row.text,
    options: JSON.parse(row.options),
    correctIndex: row.correct_index,
    explanation: row.explanation || '',
    imageData: row.image_data || null,
    questionType: row.question_type || 'objective',
    maxMarks: row.max_marks || null,
  };
}
function getQuestions(subjectId) {
  const rows = subjectId
    ? db.prepare('SELECT * FROM questions WHERE subject_id = ? ORDER BY created_at').all(subjectId)
    : db.prepare('SELECT * FROM questions ORDER BY created_at').all();
  return rows.map(rowToQuestion);
}
function createQuestion({ subjectId, text, options, correctIndex, explanation, imageData, questionType, maxMarks }) {
  const id = uid('q');
  const type = questionType || 'objective';
  db.prepare('INSERT INTO questions (id, subject_id, text, options, correct_index, explanation, image_data, question_type, max_marks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, subjectId, text, JSON.stringify(options || []), correctIndex ?? -1, explanation || '', imageData || null, type, maxMarks || null, now());
  return { id, subjectId, text, options, correctIndex, explanation, imageData, questionType: type, maxMarks };
}
function bulkCreateQuestions(list) {
  const stmt = db.prepare('INSERT INTO questions (id, subject_id, text, options, correct_index, explanation, image_data, question_type, max_marks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const created = [];
  for (const q of list) {
    const id = uid('q');
    stmt.run(id, q.subjectId, q.text, JSON.stringify(q.options || []), q.correctIndex ?? -1, q.explanation || '', q.imageData || null, q.questionType || 'objective', q.maxMarks || null, now());
    created.push({ ...q, id });
  }
  return created;
}
function deleteQuestion(id) {
  db.prepare('DELETE FROM questions WHERE id = ?').run(id);
}

// ---------------- EXAMS ----------------
function rowToExam(row) {
  return {
    id: row.id,
    title: row.title,
    section: row.section,
    grade: row.grade || null,
    subjectIds: JSON.parse(row.subject_ids),
    questionsPerSubject: JSON.parse(row.questions_per_subject),
    theoryQuestionsPerSubject: JSON.parse(row.theory_questions_per_subject || '{}'),
    durationMinutes: row.duration_minutes,
    shuffleQuestions: !!row.shuffle_questions,
    shuffleOptions: !!row.shuffle_options,
    passMarkPercent: row.pass_mark_percent,
    resitPolicy: row.resit_policy,
    allowPause: !!row.allow_pause,
    allowReview: row.allow_review === undefined ? true : !!row.allow_review,
    antiCheatAutoSubmit: row.anti_cheat_auto_submit === undefined ? true : !!row.anti_cheat_auto_submit,
    allowNetworkPause: !!row.allow_network_pause,
  };
}
function getExams(section) {
  const rows = section
    ? db.prepare('SELECT * FROM exams WHERE section = ? ORDER BY created_at').all(section)
    : db.prepare('SELECT * FROM exams ORDER BY created_at').all();
  return rows.map(rowToExam);
}
function getExam(id) {
  const row = db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
  return row ? rowToExam(row) : null;
}
function createExam(exam) {
  const id = uid('exam');
  db.prepare(`INSERT INTO exams
    (id, title, section, grade, subject_ids, questions_per_subject, theory_questions_per_subject, duration_minutes, shuffle_questions, shuffle_options, pass_mark_percent, resit_policy, allow_pause, allow_review, anti_cheat_auto_submit, allow_network_pause, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id, exam.title, exam.section || '', exam.grade || null,
      JSON.stringify(exam.subjectIds || []),
      JSON.stringify(exam.questionsPerSubject || {}),
      JSON.stringify(exam.theoryQuestionsPerSubject || {}),
      exam.durationMinutes, exam.shuffleQuestions ? 1 : 0, exam.shuffleOptions ? 1 : 0,
      exam.passMarkPercent || 50, exam.resitPolicy || 'not_allowed', exam.allowPause ? 1 : 0,
      exam.allowReview === false ? 0 : 1,
      exam.antiCheatAutoSubmit === false ? 0 : 1,
      exam.allowNetworkPause ? 1 : 0,
      now()
    );
  return getExam(id);
}
function deleteExam(id) {
  db.prepare('DELETE FROM exams WHERE id = ?').run(id);
}

// ---------------- STUDENTS ----------------
function rowToStudent(row) {
  return {
    id: row.id,
    surname: row.surname,
    firstName: row.first_name,
    otherName: row.other_name,
    fullName: row.full_name,
    regNumber: row.reg_number,
    examNumber: row.exam_number,
    section: row.section,
    grade: row.grade,
    sex: row.sex || '',
    photo: row.photo,
  };
}
function getStudents(section) {
  const rows = section
    ? db.prepare('SELECT * FROM students WHERE section = ? ORDER BY created_at').all(section)
    : db.prepare('SELECT * FROM students ORDER BY created_at').all();
  return rows.map(rowToStudent);
}
function getStudentById(id) {
  const row = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  return row ? rowToStudent(row) : null;
}
function findStudentForLogin({ fullName, regNumber, examNumber }) {
  const row = db.prepare(`
    SELECT * FROM students
    WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))
      AND LOWER(TRIM(reg_number)) = LOWER(TRIM(?))
      AND LOWER(TRIM(exam_number)) = LOWER(TRIM(?))
  `).get(fullName, regNumber, examNumber);
  return row ? rowToStudent(row) : null;
}
function createStudent(s) {
  const id = uid('stu');
  db.prepare(`INSERT INTO students
    (id, surname, first_name, other_name, full_name, reg_number, exam_number, section, grade, sex, photo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, s.surname || '', s.firstName || '', s.otherName || '', s.fullName, s.regNumber, s.examNumber, s.section || '', s.grade || '', s.sex || '', s.photo || null, now());
  return getStudentById(id);
}
function deleteStudent(id) {
  db.prepare('DELETE FROM students WHERE id = ?').run(id);
}
function generateNextStudentNumbers(year) {
  const y = year || new Date().getFullYear();
  const rows = db.prepare(`SELECT reg_number FROM students WHERE reg_number LIKE ?`).all(`%${y}%`);
  const nextSeq = rows.length + 1;
  const seqStr = String(nextSeq).padStart(3, '0');
  return { regNumber: `AMTI/${seqStr}/${y}`, examNumber: `AMTI/EXAM/${y}/${seqStr}` };
}

// ---------------- EXAM SESSIONS (server-authoritative) ----------------
function rowToSession(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    examId: row.exam_id,
    status: row.status,
    subjects: JSON.parse(row.subjects_snapshot),
    questionsBySubject: JSON.parse(row.questions_snapshot),
    answers: JSON.parse(row.answers),
    flagged: JSON.parse(row.flagged),
    activeSubjectId: row.active_subject_id,
    currentQuestionId: row.current_question_id,
    serverStartTime: row.server_start_time,
    serverEndTime: row.server_end_time,
    pausedAt: row.paused_at,
    totalPausedMs: row.total_paused_ms,
    lastSeenAt: row.last_seen_at,
  };
}
function createSession({ studentId, examId, subjects, questionsBySubject, durationSeconds }) {
  const id = uid('sess');
  const t = now();
  const endTime = t + durationSeconds * 1000;
  db.prepare(`INSERT INTO exam_sessions
    (id, student_id, exam_id, status, subjects_snapshot, questions_snapshot, answers, flagged, active_subject_id, current_question_id, server_start_time, server_end_time, total_paused_ms, last_seen_at, created_at, updated_at)
    VALUES (?, ?, ?, 'in_progress', ?, ?, '{}', '{}', ?, ?, ?, ?, 0, ?, ?, ?)`)
    .run(
      id, studentId, examId,
      JSON.stringify(subjects), JSON.stringify(questionsBySubject),
      subjects[0]?.id || null,
      questionsBySubject[subjects[0]?.id]?.[0]?.id || null,
      t, endTime, t, t, t
    );
  return getSession(id);
}
function getSession(id) {
  const row = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(id);
  return row ? rowToSession(row) : null;
}
function getActiveSessionForStudent(studentId, examId) {
  const row = db.prepare(`
    SELECT * FROM exam_sessions
    WHERE student_id = ? AND exam_id = ? AND status IN ('in_progress', 'paused')
    ORDER BY created_at DESC LIMIT 1
  `).get(studentId, examId);
  return row ? rowToSession(row) : null;
}
function getAllActiveSessions() {
  const rows = db.prepare(`SELECT * FROM exam_sessions WHERE status IN ('in_progress', 'paused') ORDER BY created_at`).all();
  return rows.map(rowToSession);
}
function saveAnswer(sessionId, questionId, optionIndex) {
  const session = getSession(sessionId);
  if (!session) return null;
  session.answers[questionId] = optionIndex;
  db.prepare('UPDATE exam_sessions SET answers = ?, last_seen_at = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(session.answers), now(), now(), sessionId);
  return session;
}
function saveFlag(sessionId, questionId, flagged) {
  const session = getSession(sessionId);
  if (!session) return null;
  session.flagged[questionId] = flagged;
  db.prepare('UPDATE exam_sessions SET flagged = ?, last_seen_at = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(session.flagged), now(), now(), sessionId);
  return session;
}
function updateNavigation(sessionId, { activeSubjectId, currentQuestionId }) {
  db.prepare('UPDATE exam_sessions SET active_subject_id = ?, current_question_id = ?, last_seen_at = ?, updated_at = ? WHERE id = ?')
    .run(activeSubjectId, currentQuestionId, now(), now(), sessionId);
  return getSession(sessionId);
}
function pauseSession(sessionId) {
  const t = now();
  db.prepare(`UPDATE exam_sessions SET status = 'paused', paused_at = ?, last_seen_at = ?, updated_at = ? WHERE id = ?`)
    .run(t, t, t, sessionId);
  return getSession(sessionId);
}
function resumeSession(sessionId) {
  const session = getSession(sessionId);
  if (!session || !session.pausedAt) return session;
  const pausedDuration = now() - session.pausedAt;
  const newEndTime = session.serverEndTime + pausedDuration;
  const newTotalPaused = session.totalPausedMs + pausedDuration;
  const t = now();
  db.prepare(`UPDATE exam_sessions SET status = 'in_progress', paused_at = NULL, server_end_time = ?, total_paused_ms = ?, last_seen_at = ?, updated_at = ? WHERE id = ?`)
    .run(newEndTime, newTotalPaused, t, t, sessionId);
  return getSession(sessionId);
}
function touchSession(sessionId) {
  db.prepare('UPDATE exam_sessions SET last_seen_at = ? WHERE id = ?').run(now(), sessionId);
}
function closeSession(sessionId, status) {
  db.prepare('UPDATE exam_sessions SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), sessionId);
}

// ---------------- RESULTS ----------------
function rowToResult(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    studentId: row.student_id,
    examId: row.exam_id,
    studentName: row.student_name,
    studentPhoto: row.student_photo,
    regNumber: row.reg_number,
    examNumber: row.exam_number,
    examTitle: row.exam_title,
    section: row.section,
    subjectResults: JSON.parse(row.subject_results),
    totalCorrect: row.total_correct,
    totalQuestions: row.total_questions,
    overallPercent: row.overall_percent,
    passed: !!row.passed,
    autoSubmitted: !!row.auto_submitted,
    autoSubmitReason: row.auto_submit_reason || null,
    isTrial: !!row.is_trial,
    secondsLeftAtSubmit: row.seconds_left_at_submit,
    timeUsedSeconds: row.time_used_seconds,
    published: !!row.published,
    theoryAnswers: JSON.parse(row.theory_answers || '[]'),
    theoryMarksAwarded: row.theory_marks_awarded || 0,
    theoryFullyGraded: !!row.theory_fully_graded,
    additionalScores: JSON.parse(row.additional_scores || '[]'),
    teacherNotes: row.teacher_notes || '',
    reportCard: row.report_card ? JSON.parse(row.report_card) : null,
    createdAt: row.created_at,
  };
}
function getResults(studentId) {
  const rows = studentId
    ? db.prepare('SELECT * FROM results WHERE student_id = ? ORDER BY created_at DESC').all(studentId)
    : db.prepare('SELECT * FROM results ORDER BY created_at DESC').all();
  return rows.map(rowToResult);
}
function getResultById(id) {
  const row = db.prepare('SELECT * FROM results WHERE id = ?').get(id);
  return row ? rowToResult(row) : null;
}
function createResult(r) {
  const id = uid('res');
  const theoryAnswers = r.theoryAnswers || [];
  const fullyGraded = theoryAnswers.length === 0; // no theory questions = nothing to grade
  db.prepare(`INSERT INTO results
    (id, session_id, student_id, exam_id, student_name, student_photo, reg_number, exam_number, exam_title, section,
     subject_results, total_correct, total_questions, overall_percent, passed, auto_submitted, auto_submit_reason, is_trial,
     seconds_left_at_submit, time_used_seconds, published, theory_answers, theory_marks_awarded, theory_fully_graded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`)
    .run(
      id, r.sessionId || null, r.studentId, r.examId, r.studentName, r.studentPhoto || null,
      r.regNumber || '', r.examNumber || '', r.examTitle, r.section || '',
      JSON.stringify(r.subjectResults), r.totalCorrect, r.totalQuestions, r.overallPercent,
      r.passed ? 1 : 0, r.autoSubmitted ? 1 : 0, r.autoSubmitReason || null, r.isTrial ? 1 : 0,
      r.secondsLeftAtSubmit ?? null, r.timeUsedSeconds ?? null,
      JSON.stringify(theoryAnswers), fullyGraded ? 1 : 0, now()
    );
  return getResultById(id);
}
function publishResults(ids) {
  const stmt = db.prepare('UPDATE results SET published = 1 WHERE id = ?');
  for (const id of ids) stmt.run(id);
}
/** Admin assigns marks to each theory answer; recomputes overall score to blend
 * objective auto-grading with manually-awarded theory marks. */
/** Shared blending logic: combines objective auto-grade + theory marks +
 * any admin/teacher-entered CA/assignment components into one overall score.
 * Called after EITHER theory grading OR CA/score entry, so either order
 * of operations always produces a consistent final result. */
function recomputeOverallScore(result, examPassMarkPercent) {
  const theoryMaxTotal = result.theoryAnswers.reduce((sum, a) => sum + (a.maxMarks || 0), 0);
  const theoryAwarded = result.theoryAnswers.reduce((sum, a) => sum + (a.graded ? (a.awardedMarks || 0) : 0), 0);
  const scoresMaxTotal = result.additionalScores.reduce((sum, s) => sum + (Number(s.maxScore) || 0), 0);
  const scoresAwarded = result.additionalScores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);

  const combinedEarned = result.totalCorrect + theoryAwarded + scoresAwarded;
  const combinedTotal = result.totalQuestions + theoryMaxTotal + scoresMaxTotal;
  const overallPercent = combinedTotal ? Math.round((combinedEarned / combinedTotal) * 100) : result.overallPercent;
  const passed = overallPercent >= (examPassMarkPercent || 50);
  return { overallPercent, passed };
}

function gradeTheoryAnswers(resultId, gradedAnswers, examPassMarkPercent) {
  const result = getResultById(resultId);
  if (!result) return null;

  const updatedTheoryAnswers = result.theoryAnswers.map((a) => {
    const graded = gradedAnswers.find((g) => g.questionId === a.questionId);
    if (!graded) return a;
    const awarded = Math.max(0, Math.min(a.maxMarks, Number(graded.awardedMarks) || 0));
    return { ...a, awardedMarks: awarded, graded: true };
  });
  const totalAwarded = updatedTheoryAnswers.reduce((sum, a) => sum + (a.awardedMarks || 0), 0);
  const allGraded = updatedTheoryAnswers.every((a) => a.graded);

  const { overallPercent, passed } = recomputeOverallScore(
    { ...result, theoryAnswers: updatedTheoryAnswers },
    examPassMarkPercent
  );

  db.prepare('UPDATE results SET theory_answers = ?, theory_marks_awarded = ?, theory_fully_graded = ?, overall_percent = ?, passed = ? WHERE id = ?')
    .run(JSON.stringify(updatedTheoryAnswers), totalAwarded, allGraded ? 1 : 0, overallPercent, passed ? 1 : 0, resultId);
  return getResultById(resultId);
}

/** Admin/teacher adds named score components (CA, assignment, etc.) and
 * optional notes. Overwrites the full component list each call (the admin
 * UI always sends the complete current set), then recomputes the blend. */
function addScoresToResult(resultId, components, notes, examPassMarkPercent) {
  const result = getResultById(resultId);
  if (!result) return null;

  const cleaned = (components || []).map((c) => ({
    name: String(c.name || '').trim() || 'Score',
    score: Math.max(0, Number(c.score) || 0),
    maxScore: Math.max(0, Number(c.maxScore) || 0),
  }));

  const { overallPercent, passed } = recomputeOverallScore(
    { ...result, additionalScores: cleaned },
    examPassMarkPercent
  );

  db.prepare('UPDATE results SET additional_scores = ?, teacher_notes = ?, overall_percent = ?, passed = ? WHERE id = ?')
    .run(JSON.stringify(cleaned), notes || '', overallPercent, passed ? 1 : 0, resultId);
  return getResultById(resultId);
}

function saveReportCard(resultId, reportCard) {
  const existing = getResultById(resultId);
  const merged = { ...(existing && existing.reportCard ? existing.reportCard : {}), ...(reportCard || {}) };
  db.prepare('UPDATE results SET report_card = ? WHERE id = ?').run(JSON.stringify(merged), resultId);
  return getResultById(resultId);
}

function resetAllData() {
  db.exec(`
    DELETE FROM staff; DELETE FROM subjects; DELETE FROM questions; DELETE FROM exams;
    DELETE FROM students; DELETE FROM exam_sessions; DELETE FROM results; DELETE FROM auth_tokens;
    UPDATE school_settings SET school_name = 'AMTI — ARM''s Minor Tech Institute', school_logo = NULL WHERE id = 1;
  `);
}

module.exports = {
  uid, now,
  getStaff, findStaffByCode, createStaff, deleteStaff, createToken, getStaffByToken,
  getSchoolSettings, saveSchoolSettings,
  getSubjects, createSubject, findOrCreateSubject, deleteSubject,
  getQuestions, createQuestion, bulkCreateQuestions, deleteQuestion,
  getExams, getExam, createExam, deleteExam,
  getStudents, getStudentById, findStudentForLogin, createStudent, deleteStudent, generateNextStudentNumbers,
  createSession, getSession, getActiveSessionForStudent, getAllActiveSessions,
  saveAnswer, saveFlag, updateNavigation, pauseSession, resumeSession, touchSession, closeSession,
  getResults, getResultById, createResult, publishResults, gradeTheoryAnswers, addScoresToResult, saveReportCard,
  resetAllData,
};
