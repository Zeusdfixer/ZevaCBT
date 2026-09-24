/**
 * ABOUT PAGE — Zeva CBT software info and creator profile
 */

const root = document.getElementById('root');

function render() {
  root.innerHTML = `
    <div class="about-screen">
      <div class="about-container">

        <div class="about-hero">
          <img src="assets/logo-secondary.png" alt="Zeva CBT" class="about-hero-logo" />
          <p class="about-hero-tagline">Powering Smarter Exams</p>
        </div>

        <div class="about-panel">
          <h2>About Zeva CBT</h2>
          <p>
            Zeva CBT is a complete computer-based testing platform built for schools, tertiary institutions,
            and professional examination bodies. It brings the structure and discipline of large-scale exams
            like JAMB's UTME and NECO's CBT systems into a single piece of software that any institution can
            run on its own terms — offline, in its own exam hall, under its own name.
          </p>
          <p>
            The platform covers the full lifecycle of an exam: building a question bank by hand or by bulk
            CSV import, assembling exams with configurable timing, shuffling, pass marks, pause and resit
            rules, running the exam itself with a JAMB-style timed interface and calculator, grading
            automatically, and producing an official, printable result sheet carrying the student's
            photograph and the institution's own logo.
          </p>
          <p>
            Zeva CBT serves three tiers of examination out of the box: <strong>High School</strong>
            (Grade 7 through Grade 12), <strong>College</strong> (UTME, Post-UTME, and other tertiary
            institution exams), and <strong>Professional</strong> bodies such as ICAN, RMAFC, and the NBA.
            Each tier gets its own tailored login and class/track selection, so one installation can serve
            an entire institution's testing needs across every level.
          </p>
        </div>

        <div class="about-panel">
          <h2>How it works</h2>
          <div class="about-steps">
            <div class="about-step">
              <div class="about-step-num">1</div>
              <div>
                <strong>Admin sets up the exam.</strong>
                Staff log in with a name and staff profile code, create subjects, build or bulk-import
                questions, create student profiles with passport photographs and auto-generated
                registration/examination numbers, then assemble an exam blueprint — choosing subjects,
                question counts, duration, pass mark, and whether pausing or resits are allowed.
              </div>
            </div>
            <div class="about-step">
              <div class="about-step-num">2</div>
              <div>
                <strong>Students take the exam.</strong>
                Students choose their test category, log in with their full name, registration number,
                and examination number exactly as registered, confirm the instructions, and sit the exam
                in a timed, subject-tabbed interface with a question palette, flagging, and a built-in
                normal and scientific calculator.
              </div>
            </div>
            <div class="about-step">
              <div class="about-step-num">3</div>
              <div>
                <strong>Results are graded and published.</strong>
                Scores are calculated automatically and broken down by subject. Admin staff can search,
                sort, and review every result, then selectively publish results to the online Result
                Portal — the one part of Zeva CBT designed to run online — where students and parents can
                check and print an official result sheet, just like the WAEC or JAMB result checkers.
              </div>
            </div>
          </div>
        </div>

        <div class="about-panel">
          <h2>Designed to run offline</h2>
          <p>
            Aside from the Result Portal, every part of Zeva CBT — the student exam interface and the
            admin dashboard — is built to run entirely offline, on a local machine or school network, with
            no dependency on an internet connection during an exam. This matters most where it matters
            most: exam day should never be at the mercy of a network outage.
          </p>
        </div>

        <div class="about-panel about-creator">
          <h2>About the creator</h2>
          <div class="about-creator-grid">
            <div>
              <p><strong>Prince Oliver Emmanuel</strong> (Zeus) is the founder and CEO of Zeus Technologies
              Innovations, the company behind Zeva CBT.</p>
              <p>
                He is a teacher and Principal at Uncle Ben's Model Academy, where he teaches Digital
                Technology, Civic Education, Government, and Literature in English across junior and
                senior secondary levels. He also serves as Commander General of the Elite Intelligence
                Service (EIS) and Lead Technical Director at Living Faith Church, Luvu.
              </p>
              <p>
                His work sits at the intersection of education and technology — building AI-powered digital
                tools and teaching the next generation how to use them. Zeva CBT grew directly out of that
                work: a need for an exam platform an African school could actually own, run, and rely on
                without depending on foreign software or a live internet connection.
              </p>
              <p class="about-brand-code">Personal brand code: D.I.E — Discipline. Integrity. Excellence.</p>
            </div>
          </div>

          <div class="about-contact">
            <h3>Contact</h3>
            <div class="about-contact-grid">
              <div class="about-contact-item">
                <span class="about-contact-label">Phone</span>
                <span class="mono">0707 798 0922</span>
              </div>
              <div class="about-contact-item">
                <span class="about-contact-label">Phone</span>
                <span class="mono">0907 851 2141</span>
              </div>
              <div class="about-contact-item">
                <span class="about-contact-label">Email</span>
                <span class="mono">sirprincedie@gmail.com</span>
              </div>
              <div class="about-contact-item">
                <span class="about-contact-label">Email</span>
                <span class="mono">zeusdfixer@gmail.com</span>
              </div>
            </div>
          </div>
        </div>

        <div class="about-footer-nav">
          <a href="index.html">&larr; Back to Zeva CBT</a>
        </div>

      </div>
    </div>
  `;
}

(function init() {
  showPreloader();
  render();
  hidePreloader();
})();
