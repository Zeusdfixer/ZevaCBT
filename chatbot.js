/**
 * CHATBOT — floating offline FAQ assistant for the student exam experience.
 * No network calls: everything here is a static FAQ list plus simple
 * keyword matching, so it works with zero internet connection.
 */

const ZEVA_FAQS = [
  {
    q: 'How do I answer a question?',
    a: 'Click any of the lettered options (A, B, C, D). Your choice is highlighted immediately and saved automatically.',
    keywords: ['answer', 'select', 'choose', 'option', 'click'],
  },
  {
    q: 'How do I flag a question for review?',
    a: '"Flag for review" sits below the answer options on every question. Flagged questions show an amber marker in the question navigator so you can find them again quickly.',
    keywords: ['flag', 'review', 'mark', 'later'],
  },
  {
    q: 'How do I move between questions?',
    a: 'Use the Previous/Next buttons, click a subject tab at the top to switch subjects, or tap any number in the question navigator on the right to jump straight there.',
    keywords: ['move', 'next', 'previous', 'navigate', 'switch', 'jump', 'subject', 'tab'],
  },
  {
    q: 'How do I use the calculator?',
    a: 'Tap the calculator icon in the top bar. You can switch between Normal and Scientific modes using the tabs inside the calculator panel.',
    keywords: ['calculator', 'calculate', 'math', 'scientific'],
  },
  {
    q: 'Can questions be read aloud to me?',
    a: 'Yes. Tap the "Read aloud" button above any question and it will be read to you, including all the answer options. Tap it again to turn it off.',
    keywords: ['read', 'aloud', 'speech', 'listen', 'audio', 'voice', 'hear'],
  },
  {
    q: 'How do I pause my exam?',
    a: 'If pausing is enabled for this exam, a "Pause" button appears in the top bar. Not every exam allows pausing — check with your invigilator if you don\'t see it.',
    keywords: ['pause', 'stop', 'break', 'emergency'],
  },
  {
    q: 'What happens if time runs out?',
    a: 'Your exam is submitted automatically with whatever answers you have given at that point, so it\'s worth keeping an eye on the timer.',
    keywords: ['time', 'timer', 'expire', 'runs out', 'end'],
  },
  {
    q: 'How do I submit my exam?',
    a: 'Tap "Submit exam" in the sidebar. You will be asked to confirm before it is final, since you cannot change answers afterward.',
    keywords: ['submit', 'finish', 'done', 'complete', 'end exam'],
  },
  {
    q: 'Can I change an answer after selecting it?',
    a: 'Yes — you can change any answer at any time before you submit, as long as the timer hasn\'t run out.',
    keywords: ['change', 'edit', 'undo', 'redo'],
  },
];

function findBestFaqMatch(query) {
  const q = query.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const faq of ZEVA_FAQS) {
    let score = 0;
    for (const kw of faq.keywords) {
      if (q.includes(kw)) score += 2;
    }
    faq.q.toLowerCase().split(/\s+/).forEach((word) => {
      if (word.length > 3 && q.includes(word)) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }
  return bestScore > 0 ? best : null;
}

function injectChatbotMarkup() {
  if (document.getElementById('zeva-chatbot-root')) return;
  const el = document.createElement('div');
  el.id = 'zeva-chatbot-root';
  el.innerHTML = `
    <button class="chatbot-fab" id="chatbot-fab" title="Need help?">${ZevaIcons.chatBubble()}</button>
    <div class="chatbot-panel" id="chatbot-panel" style="display:none;">
      <div class="chatbot-header">
        <img src="assets/logo-icon.png" alt="" />
        <div>
          <div class="chatbot-title">Zeva Assistant</div>
          <div class="chatbot-subtitle">Offline help &middot; no internet needed</div>
        </div>
        <button class="chatbot-close" id="chatbot-close">&times;</button>
      </div>
      <div class="chatbot-body" id="chatbot-body">
        <div class="chatbot-msg chatbot-msg-bot">
          Hi! I can help you navigate the CBT screen. Ask a question below or tap one of the common questions.
        </div>
        <div class="chatbot-faq-list" id="chatbot-faq-list">
          ${ZEVA_FAQS.map((faq, i) => `<button class="chatbot-faq-btn" data-faq="${i}">${escapeHtmlChatbot(faq.q)}</button>`).join('')}
        </div>
      </div>
      <div class="chatbot-input-row">
        <input type="text" id="chatbot-input" placeholder="Type your question..." />
        <button id="chatbot-send">Ask</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  const panel = document.getElementById('chatbot-panel');
  const body = document.getElementById('chatbot-body');

  document.getElementById('chatbot-fab').addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  });
  document.getElementById('chatbot-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  function addMessage(text, from) {
    const msg = document.createElement('div');
    msg.className = `chatbot-msg chatbot-msg-${from}`;
    msg.textContent = text;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
  }

  function askFaq(faq) {
    addMessage(faq.q, 'user');
    addMessage(faq.a, 'bot');
  }

  body.querySelectorAll('.chatbot-faq-btn').forEach((btn) => {
    btn.addEventListener('click', () => askFaq(ZEVA_FAQS[parseInt(btn.dataset.faq, 10)]));
  });

  function handleAsk() {
    const input = document.getElementById('chatbot-input');
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    const match = findBestFaqMatch(text);
    if (match) {
      addMessage(match.a, 'bot');
    } else {
      addMessage("I don't have an answer for that yet — try one of the common questions above, or ask your invigilator.", 'bot');
    }
    input.value = '';
  }

  document.getElementById('chatbot-send').addEventListener('click', handleAsk);
  document.getElementById('chatbot-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAsk();
  });
}

function escapeHtmlChatbot(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

injectChatbotMarkup();
