/**
 * Assessment Dialog Engine for InnerSpace
 * Manages conversation state, AI interaction, and DOM rendering
 * IIFE pattern for file:// compatibility
 */
(function () {
  'use strict';

  var config = null;
  var container = null;
  var messages = [];
  var currentRound = 0;
  var state = 'idle'; // idle | loading | question | result | error
  var lastQuestionData = null; // 最近一次 AI 返回的问题数据

  /**
   * Escape HTML special characters to prevent broken rendering
   */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Session persistence (localStorage) ---

  function sessionKey() {
    return 'innerspace_session_' + config.id;
  }

  function saveSession() {
    try {
      var session = {
        messages: messages,
        currentRound: currentRound,
        state: state,
        lastQuestionData: lastQuestionData
      };
      localStorage.setItem(sessionKey(), JSON.stringify(session));
    } catch (e) {}
  }

  function loadSession() {
    try {
      var stored = localStorage.getItem(sessionKey());
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(sessionKey());
    } catch (e) {}
  }

  /**
   * Initialize the engine
   */
  function init(moduleConfig, containerEl) {
    config = moduleConfig;
    container = containerEl;
    messages = [];
    currentRound = 0;
    state = 'idle';
    lastQuestionData = null;
    applyTheme();
  }

  /**
   * Apply module theme to the page
   */
  function applyTheme() {
    var titleEl = document.getElementById('module-title');
    var subtitleEl = document.getElementById('module-subtitle');
    var iconEl = document.getElementById('module-icon');

    if (titleEl) titleEl.textContent = config.title;
    if (subtitleEl) subtitleEl.textContent = config.subtitle;
    if (iconEl) iconEl.textContent = config.icon;

    document.documentElement.style.setProperty('--accent-color', config.accentColor);
  }

  /**
   * Start the assessment (fresh)
   */
  function start() {
    clearSession();
    messages = [
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: '请开始测评，提出第一个问题。' }
    ];
    currentRound = 0;
    lastQuestionData = null;
    sendToAI();
  }

  /**
   * Resume from a saved session, or start fresh if none
   */
  function resume() {
    var session = loadSession();
    if (!session || !session.messages || session.messages.length === 0) {
      start();
      return;
    }

    messages = session.messages;
    currentRound = session.currentRound || 0;
    state = session.state || 'idle';
    lastQuestionData = session.lastQuestionData || null;

    // 恢复到上次的状态
    if (state === 'question' && lastQuestionData) {
      renderQuestion(lastQuestionData);
    } else if (state === 'loading') {
      // 上次刷新时正在等 AI 回复，重新发送
      sendToAI();
    } else {
      // 其他情况重新开始
      start();
    }
  }

  /**
   * Send messages to AI and handle response
   */
  function sendToAI() {
    state = 'loading';
    saveSession();
    renderLoading();

    LLMClient.chatJSON(messages, { temperature: 0.8 })
      .then(function (data) {
        messages.push({ role: 'assistant', content: JSON.stringify(data) });

        if (data.type === 'result') {
          state = 'result';
          lastQuestionData = null;
          clearSession(); // 测评完成，清除进度
          saveResult(data);
          renderResult(data);
        } else if (data.type === 'question') {
          state = 'question';
          currentRound = data.round || (currentRound + 1);
          lastQuestionData = data;
          saveSession();
          renderQuestion(data);
        } else {
          throw new Error('Unknown response type: ' + data.type);
        }
      })
      .catch(function (err) {
        state = 'error';
        renderError(err.message);
      });
  }

  /**
   * Handle user selecting an option
   */
  function handleSelect(option) {
    if (state !== 'question') return;

    var userMsg = '我选择 ' + option.label + '：' + option.text;
    messages.push({ role: 'user', content: userMsg });
    sendToAI();
  }

  /**
   * Save result to localStorage
   */
  function saveResult(data) {
    try {
      var results = {};
      var stored = localStorage.getItem('innerspace_results');
      if (stored) {
        results = JSON.parse(stored);
      }
      results[config.id] = {
        timestamp: new Date().toISOString(),
        data: data
      };
      localStorage.setItem('innerspace_results', JSON.stringify(results));
    } catch (e) {}
  }

  // --- Rendering Functions ---

  function renderLoading() {
    var progress = Math.min((currentRound / config.totalRounds) * 100, 95);
    updateProgress(progress);

    container.innerHTML = [
      '<div class="card loading-card">',
      '  <div class="loading-indicator">',
      '    <div class="loading-dots">',
      '      <span></span><span></span><span></span>',
      '    </div>',
      '    <p class="loading-text">AI 正在思考中...</p>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function renderQuestion(data) {
    var progress = Math.min((data.round / config.totalRounds) * 100, 95);
    updateProgress(progress);

    var optionsHTML = data.options.map(function (opt) {
      return [
        '<button class="option-btn" data-label="' + escapeHTML(opt.label) + '">',
        '  <span class="option-label">' + escapeHTML(opt.label) + '</span>',
        '  <span class="option-text">' + escapeHTML(opt.text) + '</span>',
        '</button>'
      ].join('');
    }).join('\n');

    container.innerHTML = [
      '<div class="card question-card">',
      '  <div class="question-meta">',
      '    <span class="round-badge">Round ' + data.round + ' / ' + config.totalRounds + '</span>',
      '    <span class="topic-badge">' + escapeHTML(data.topic || '') + '</span>',
      '  </div>',
      '  <h2 class="question-text">' + escapeHTML(data.question) + '</h2>',
      '  <div class="options-list">',
           optionsHTML,
      '  </div>',
      '</div>'
    ].join('\n');

    var buttons = container.querySelectorAll('.option-btn');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        var label = btn.getAttribute('data-label');
        var text = btn.querySelector('.option-text').textContent;
        btn.addEventListener('click', function () {
          handleSelect({ label: label, text: text });
        });
      })(buttons[i]);
    }
  }

  function renderResult(data) {
    updateProgress(100);

    var dimensionsHTML = (data.dimensions || []).map(function (dim) {
      var safeScore = parseInt(dim.score, 10) || 0;
      return [
        '<div class="dimension-item">',
        '  <div class="dimension-header">',
        '    <span class="dimension-name">' + escapeHTML(dim.name) + '</span>',
        '    <span class="dimension-score">' + safeScore + '</span>',
        '  </div>',
        '  <div class="dimension-bar">',
        '    <div class="dimension-fill" style="width:' + safeScore + '%;"></div>',
        '  </div>',
        '  <p class="dimension-desc">' + escapeHTML(dim.description) + '</p>',
        '</div>'
      ].join('');
    }).join('\n');

    container.innerHTML = [
      '<div class="card result-card">',
      '  <div class="result-header">',
      '    <div class="result-icon">' + config.icon + '</div>',
      '    <h2 class="result-title">' + escapeHTML(data.title || '分析结果') + '</h2>',
      '  </div>',
      '  <p class="result-summary">' + escapeHTML(data.summary || '') + '</p>',
      '  <div class="result-type">',
      '    <h3 class="type-name">' + escapeHTML(data.typeName || '') + '</h3>',
      '    <p class="type-desc">' + escapeHTML(data.typeDescription || '') + '</p>',
      '  </div>',
      '  <div class="dimensions-list">',
           dimensionsHTML,
      '  </div>',
      '  <div class="result-advice">',
      '    <h4>个性化建议</h4>',
      '    <p>' + escapeHTML(data.advice || '') + '</p>',
      '  </div>',
      '  <div class="result-actions">',
      '    <button class="btn-retry" onclick="AssessmentEngine.start()">重新测评</button>',
      '    <a class="btn-home" href="fragments.html">返回碎片空间</a>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function renderError(message) {
    container.innerHTML = [
      '<div class="card error-card">',
      '  <div class="error-icon">&#9888;</div>',
      '  <h3>出现了一些问题</h3>',
      '  <p class="error-message">' + message + '</p>',
      '  <button class="btn-retry" onclick="AssessmentEngine.start()">重新开始</button>',
      '</div>'
    ].join('\n');
  }

  function updateProgress(percent) {
    var fill = document.getElementById('progress-fill');
    var text = document.getElementById('progress-text');
    if (fill) fill.style.width = percent + '%';
    if (text) text.textContent = Math.round(percent) + '%';
  }

  /**
   * Show a saved result directly (without starting a new assessment)
   */
  function showSavedResult(data) {
    state = 'result';
    renderResult(data);
  }

  // Expose globally
  window.AssessmentEngine = {
    init: init,
    start: start,
    resume: resume,
    showSavedResult: showSavedResult
  };
})();
