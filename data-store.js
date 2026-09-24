/**
 * DATA STORE — Zeva CBT by Zeus Technologies Innovations
 * ----------------------------------------------------------------
 * Two backends behind one interface:
 *   - LocalDataStore: browser localStorage (Standalone Mode, fully offline)
 *   - LanDataStore:   the Zeva CBT LAN server over HTTP (LAN Mode)
 *
 * At load time this file pings the server's /api/config. If it answers,
 * window.DataStore = LanDataStore. Otherwise window.DataStore = LocalDataStore.
 * Every other file in the app calls window.DataStore.* and never needs to
 * know which mode is active — await window.ZEVA_DATASTORE_READY before the
 * first call (each entry script's init() does this).
 * ----------------------------------------------------------------
 */

const DB_KEYS = {
  SUBJECTS: 'zeva_subjects',
  QUESTIONS: 'zeva_questions',
  EXAMS: 'zeva_exams',
  RESULTS: 'zeva_results',
  STUDENTS: 'zeva_students',
  SESSION: 'zeva_active_session',
  STAFF: 'zeva_staff',
  SCHOOL: 'zeva_school_settings',
};

const SECTIONS = {
  HIGH_SCHOOL: 'high_school',
  COLLEGE: 'college',
  PROFESSIONAL: 'professional',
};

const HIGH_SCHOOL_GRADES = [
  'Common Entrance',
  'Grade 7 (JSS 1)', 'Grade 8 (JSS 2)', 'Grade 9 (JSS 3)',
  'Grade 10 (SS 1)', 'Grade 11 (SS 2)', 'Grade 12 (SS 3)',
];
const COLLEGE_TRACKS = [
  'UTME', 'Post UTME', 'SAT', 'TOEFL', 'WAEC', 'NECO', 'NCE', 'Junior WAEC',
  'Other Tertiary Institution Exam',
];
const PROFESSIONAL_BODIES = [
  'ICAN', 'NBA (Law School)', 'RMAFC', 'CIBN', 'COREN', 'Other Professional Body',
];

function _read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('DataStore read error', key, e);
    return fallback;
  }
}

function _write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('DataStore write error', key, e);
    return false;
  }
}

function _uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// =================================================================
// LOCAL DATA STORE — localStorage-backed, Standalone Mode
// (Unchanged from the original single-mode implementation.)
// =================================================================
const LocalDataStore = {

  SECTIONS,
  HIGH_SCHOOL_GRADES,
  COLLEGE_TRACKS,
  PROFESSIONAL_BODIES,

  async getSchoolSettings() {
    return _read(DB_KEYS.SCHOOL, { schoolName: 'AMTI — ARM\'s Minor Tech Institute', schoolLogo: null, guestModeEnabled: true });
  },

  async saveSchoolSettings(settings) {
    const current = await this.getSchoolSettings();
    const merged = { ...current, ...settings };
    _write(DB_KEYS.SCHOOL, merged);
    return merged;
  },

  async getStaff() {
    return _read(DB_KEYS.STAFF, []);
  },

  async findStaffByCode(staffCode) {
    const staff = await this.getStaff();
    return staff.find(s => s.staffCode.toLowerCase() === String(staffCode).toLowerCase()) || null;
  },

  async saveStaff(staffMember) {
    const staff = await this.getStaff();
    if (!staffMember.id) {
      const codeInUse = staff.some(s => s.staffCode.toLowerCase() === String(staffMember.staffCode).toLowerCase());
      if (codeInUse) throw new Error('That staff code is already in use.');
      staffMember.id = _uid('staff');
    }
    const idx = staff.findIndex(s => s.id === staffMember.id);
    if (idx >= 0) staff[idx] = staffMember; else staff.push(staffMember);
    _write(DB_KEYS.STAFF, staff);
    return staffMember;
  },

  async deleteStaff(id) {
    const staff = (await this.getStaff()).filter(s => s.id !== id);
    _write(DB_KEYS.STAFF, staff);
  },

  /** Unified login used by both modes. Local mode never needs a real token. */
  async staffLogin(name, staffCode) {
    const staff = await this.findStaffByCode(staffCode);
    if (!staff) return null;
    return { token: null, staff };
  },

  async getSubjects(section = null, options = {}) {
    const all = _read(DB_KEYS.SUBJECTS, []);
    const wantDemo = !!options.isDemo;
    let filtered = all.filter(s => !!s.isDemo === wantDemo);
    if (section) filtered = filtered.filter(s => s.section === section);
    return filtered;
  },

  async saveSubject(subject) {
    const subjects = _read(DB_KEYS.SUBJECTS, []);
    if (!subject.id) subject.id = _uid('subj');
    const idx = subjects.findIndex(s => s.id === subject.id);
    if (idx >= 0) subjects[idx] = subject; else subjects.push(subject);
    _write(DB_KEYS.SUBJECTS, subjects);
    return subject;
  },

  /** Returns an existing subject matched by name+grade+section+isDemo
   * (case-insensitive on name), or creates a new one. Use this instead of
   * saveSubject() whenever a subject might already exist — e.g. the "Add
   * subject" button — so questions accumulate in one shared bank instead
   * of splitting across duplicate subject rows. */
  async findOrCreateSubject({ name, code, section, grade, isDemo }) {
    const subjects = _read(DB_KEYS.SUBJECTS, []);
    const norm = (s) => String(s || '').trim().toLowerCase();
    const existing = subjects.find(s =>
      norm(s.name) === norm(name) &&
      norm(s.section) === norm(section) &&
      norm(s.grade) === norm(grade) &&
      !!s.isDemo === !!isDemo
    );
    if (existing) return { subject: existing, created: false };
    const created = await this.saveSubject({ name, code, section, grade, isDemo });
    return { subject: created, created: true };
  },

  async deleteSubject(id) {
    const subjects = _read(DB_KEYS.SUBJECTS, []).filter(s => s.id !== id);
    _write(DB_KEYS.SUBJECTS, subjects);
    const questions = (await this.getQuestions()).filter(q => q.subjectId !== id);
    _write(DB_KEYS.QUESTIONS, questions);
  },

  async getQuestions(subjectId = null) {
    const all = _read(DB_KEYS.QUESTIONS, []);
    return subjectId ? all.filter(q => q.subjectId === subjectId) : all;
  },

  async saveQuestion(question) {
    const all = await this.getQuestions();
    if (!question.id) question.id = _uid('q');
    const idx = all.findIndex(q => q.id === question.id);
    if (idx >= 0) all[idx] = question; else all.push(question);
    _write(DB_KEYS.QUESTIONS, all);
    return question;
  },

  async bulkAddQuestions(questionArray) {
    const all = await this.getQuestions();
    const withIds = questionArray.map(q => ({ ...q, id: q.id || _uid('q') }));
    _write(DB_KEYS.QUESTIONS, [...all, ...withIds]);
    return withIds;
  },

  async deleteQuestion(id) {
    const all = (await this.getQuestions()).filter(q => q.id !== id);
    _write(DB_KEYS.QUESTIONS, all);
  },

  async getExams(section = null) {
    const all = _read(DB_KEYS.EXAMS, []);
    return section ? all.filter(e => e.section === section) : all;
  },

  async getExam(id) {
    return (await this.getExams()).find(e => e.id === id) || null;
  },

  async saveExam(exam) {
    const exams = await this.getExams();
    if (!exam.id) exam.id = _uid('exam');
    if (exam.resitPolicy === undefined) exam.resitPolicy = 'not_allowed';
    if (exam.allowReview === undefined) exam.allowReview = true;
    if (exam.antiCheatAutoSubmit === undefined) exam.antiCheatAutoSubmit = true;
    if (exam.allowNetworkPause === undefined) exam.allowNetworkPause = false;
    const idx = exams.findIndex(e => e.id === exam.id);
    if (idx >= 0) exams[idx] = exam; else exams.push(exam);
    _write(DB_KEYS.EXAMS, exams);
    return exam;
  },

  async deleteExam(id) {
    const exams = (await this.getExams()).filter(e => e.id !== id);
    _write(DB_KEYS.EXAMS, exams);
  },

  async getStudents(section = null) {
    const all = _read(DB_KEYS.STUDENTS, []);
    return section ? all.filter(s => s.section === section) : all;
  },

  async getStudentById(id) {
    return (await this.getStudents()).find(s => s.id === id) || null;
  },

  async findStudentForLogin({ fullName, regNumber, examNumber }) {
    const students = await this.getStudents();
    const norm = (s) => String(s || '').trim().toLowerCase();
    return students.find(s =>
      norm(s.fullName) === norm(fullName) &&
      norm(s.regNumber) === norm(regNumber) &&
      norm(s.examNumber) === norm(examNumber)
    ) || null;
  },

  async saveStudent(student) {
    const students = await this.getStudents();
    if (!student.id) student.id = _uid('stu');
    const idx = students.findIndex(s => s.id === student.id);
    if (idx >= 0) students[idx] = student; else students.push(student);
    _write(DB_KEYS.STUDENTS, students);
    return student;
  },

  async deleteStudent(id) {
    const students = (await this.getStudents()).filter(s => s.id !== id);
    _write(DB_KEYS.STUDENTS, students);
  },

  async generateNextStudentNumbers({ year = new Date().getFullYear() } = {}) {
    const students = await this.getStudents();
    const yearStudents = students.filter(s => s.regNumber && s.regNumber.includes(String(year)));
    const nextSeq = yearStudents.length + 1;
    const seqStr = String(nextSeq).padStart(3, '0');
    return {
      regNumber: `AMTI/${seqStr}/${year}`,
      examNumber: `AMTI/EXAM/${year}/${seqStr}`,
    };
  },

  async getActiveSession(studentId = null) {
    const session = _read(DB_KEYS.SESSION, null);
    if (studentId) return session && session.studentId === studentId ? session : null;
    return session;
  },

  async saveActiveSession(session) {
    _write(DB_KEYS.SESSION, session);
    return session;
  },

  async clearActiveSession() {
    localStorage.removeItem(DB_KEYS.SESSION);
  },

  // Local mode has no concept of other machines, so live monitoring is always empty.
  async getLiveMonitor() {
    return [];
  },

  async getResults(studentId = null) {
    const all = _read(DB_KEYS.RESULTS, []);
    return studentId ? all.filter(r => r.studentId === studentId) : all;
  },

  async getResultById(id) {
    return (await this.getResults()).find(r => r.id === id) || null;
  },

  async saveResult(result) {
    const all = await this.getResults();
    if (!result.id) result.id = _uid('res');
    result.createdAt = result.createdAt || Date.now();
    if (result.published === undefined) result.published = false;
    all.push(result);
    _write(DB_KEYS.RESULTS, all);
    return result;
  },

  async updateResult(id, patch) {
    const all = await this.getResults();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    _write(DB_KEYS.RESULTS, all);
    return all[idx];
  },

  _recomputeOverallScore(result, examPassMarkPercent) {
    const theoryAnswers = result.theoryAnswers || [];
    const additionalScores = result.additionalScores || [];
    const theoryMaxTotal = theoryAnswers.reduce((sum, a) => sum + (a.maxMarks || 0), 0);
    const theoryAwarded = theoryAnswers.reduce((sum, a) => sum + (a.graded ? (a.awardedMarks || 0) : 0), 0);
    const scoresMaxTotal = additionalScores.reduce((sum, s) => sum + (Number(s.maxScore) || 0), 0);
    const scoresAwarded = additionalScores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);

    const combinedEarned = result.totalCorrect + theoryAwarded + scoresAwarded;
    const combinedTotal = result.totalQuestions + theoryMaxTotal + scoresMaxTotal;
    const overallPercent = combinedTotal ? Math.round((combinedEarned / combinedTotal) * 100) : result.overallPercent;
    const passed = overallPercent >= (examPassMarkPercent || 50);
    return { overallPercent, passed };
  },

  async gradeTheoryAnswers(resultId, gradedAnswers, examPassMarkPercent) {
    const result = await this.getResultById(resultId);
    if (!result) return null;
    const theoryAnswers = result.theoryAnswers || [];
    const updated = theoryAnswers.map(a => {
      const graded = gradedAnswers.find(g => g.questionId === a.questionId);
      if (!graded) return a;
      const awarded = Math.max(0, Math.min(a.maxMarks, Number(graded.awardedMarks) || 0));
      return { ...a, awardedMarks: awarded, graded: true };
    });
    const totalAwarded = updated.reduce((sum, a) => sum + (a.awardedMarks || 0), 0);
    const allGraded = updated.every(a => a.graded);
    const { overallPercent, passed } = this._recomputeOverallScore({ ...result, theoryAnswers: updated }, examPassMarkPercent);
    return this.updateResult(resultId, {
      theoryAnswers: updated,
      theoryMarksAwarded: totalAwarded,
      theoryFullyGraded: allGraded,
      overallPercent,
      passed,
    });
  },

  async addScoresToResult(resultId, components, notes, examPassMarkPercent) {
    const result = await this.getResultById(resultId);
    if (!result) return null;
    const cleaned = (components || []).map(c => ({
      name: String(c.name || '').trim() || 'Score',
      score: Math.max(0, Number(c.score) || 0),
      maxScore: Math.max(0, Number(c.maxScore) || 0),
    }));
    const { overallPercent, passed } = this._recomputeOverallScore({ ...result, additionalScores: cleaned }, examPassMarkPercent);
    return this.updateResult(resultId, {
      additionalScores: cleaned,
      teacherNotes: notes || '',
      overallPercent,
      passed,
    });
  },

  async publishResults(resultIds) {
    const all = await this.getResults();
    all.forEach(r => { if (resultIds.includes(r.id)) r.published = true; });
    _write(DB_KEYS.RESULTS, all);
  },

  /** Saves the high-school report-card fields (attendance, position,
   * behaviour/skills ratings, remarks, etc.) onto a result. Merges with
   * whatever reportCard data already exists rather than replacing it. */
  async saveReportCard(resultId, reportCard) {
    const result = await this.getResultById(resultId);
    if (!result) return null;
    const merged = { ...(result.reportCard || {}), ...reportCard };
    return this.updateResult(resultId, { reportCard: merged });
  },

  async seedDemoContentIfEmpty() {
    const existingDemo = await this.getSubjects(null, { isDemo: true });
    if (existingDemo.length > 0) return;
    if (typeof buildDemoContent !== 'function') return;

    const { subjects, questionsBySubjectKey } = buildDemoContent();
    const keyToRealId = {};

    for (const subj of subjects) {
      const saved = await this.saveSubject({
        name: subj.name, code: subj.code, section: subj.section, grade: subj.grade, isDemo: true,
      });
      keyToRealId[subj.key] = saved.id;
    }
    for (const subj of subjects) {
      const questions = questionsBySubjectKey[subj.key].map(q => ({ ...q, subjectId: keyToRealId[subj.key] }));
      await this.bulkAddQuestions(questions);
    }
  },

  async seedIfEmpty() {
    const subjects = await this.getSubjects();
    if (subjects.length > 0) return;

    const englishId = _uid('subj');
    const mathId = _uid('subj');
    const civicId = _uid('subj');

    await this.saveSubject({ id: englishId, name: 'English Language', code: 'ENG', section: SECTIONS.HIGH_SCHOOL });
    await this.saveSubject({ id: mathId, name: 'Mathematics', code: 'MTH', section: SECTIONS.HIGH_SCHOOL });
    await this.saveSubject({ id: civicId, name: 'Civic Education', code: 'CIV', section: SECTIONS.HIGH_SCHOOL });

    const demoQuestions = [
      {
        subjectId: englishId,
        text: 'Choose the option that best completes the sentence: "Neither the teacher nor the students ____ ready for the test."',
        options: ['was', 'were', 'is', 'has been'],
        correctIndex: 1,
        explanation: 'With "neither...nor", the verb agrees with the subject nearer to it — "students" (plural), so "were" is correct.',
      },
      {
        subjectId: englishId,
        text: 'Select the correctly spelt word.',
        options: ['Accomodate', 'Acommodate', 'Accommodate', 'Acomodate'],
        correctIndex: 2,
      },
      {
        subjectId: mathId,
        text: 'Simplify: 3x + 5x - 2x',
        options: ['6x', '8x', '10x', '4x'],
        correctIndex: 0,
      },
      {
        subjectId: mathId,
        text: 'What is the value of x if 2x + 6 = 20?',
        options: ['5', '6', '7', '8'],
        correctIndex: 1,
      },
      {
        subjectId: mathId,
        text: 'Find the next number in the sequence: 2, 4, 8, 16, ___',
        options: ['18', '24', '32', '20'],
        correctIndex: 2,
      },
      {
        subjectId: civicId,
        text: 'The arm of government responsible for making laws is called the:',
        options: ['Executive', 'Judiciary', 'Legislature', 'Civil Service'],
        correctIndex: 2,
      },
      {
        subjectId: civicId,
        text: 'Which of these is a fundamental human right guaranteed by the Nigerian Constitution?',
        options: ['Right to free transportation', 'Right to life', 'Right to a car', 'Right to a job'],
        correctIndex: 1,
      },
    ];

    await this.bulkAddQuestions(demoQuestions);

    await this.saveExam({
      id: 'demo_exam',
      title: 'Sample Practice Exam — Grade 9',
      section: SECTIONS.HIGH_SCHOOL,
      grade: 'Grade 9 (JSS 3)',
      subjectIds: [englishId, mathId, civicId],
      questionsPerSubject: { [englishId]: 2, [mathId]: 3, [civicId]: 2 },
      durationMinutes: 20,
      shuffleQuestions: true,
      shuffleOptions: true,
      passMarkPercent: 50,
      resitPolicy: 'remaining_time',
      allowPause: true,
    });

    await this.saveStudent({
      id: 'demo_student',
      surname: 'Bello',
      firstName: 'Aisha',
      otherName: 'Yusuf',
      fullName: 'Bello Aisha Yusuf',
      regNumber: 'AMTI/001/2026',
      examNumber: 'AMTI/EXAM/2026/001',
      section: SECTIONS.HIGH_SCHOOL,
      grade: 'Grade 9 (JSS 3)',
      photo: null,
    });

    // No default staff account is seeded here. Standalone mode uses the
    // same first-run gate as LAN mode (see admin.js renderStaffLogin) —
    // when the staff list is empty, the login screen prompts to create
    // the first admin account with whatever name/code the user chooses.
  },

  async resetAllData() {
    Object.values(DB_KEYS).forEach(k => localStorage.removeItem(k));
  },
};

window.LocalDataStore = LocalDataStore;
window.DB_KEYS = DB_KEYS;
