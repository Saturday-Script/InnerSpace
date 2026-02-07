/**
 * LLM API Client for InnerSpace
 * IIFE pattern to avoid ES module CORS issues under file:// protocol
 */
(function () {
  'use strict';

  // --- Configuration ---
  var API_URL = 'https://llm-gateway.chocyt.com/v1/chat/completions';
  var MODEL = 'doubao-seed-1.8';

  // API Key: read from localStorage, prompt user on first API call if missing
  function getApiKey() {
    var key = localStorage.getItem('innerspace_api_key');
    if (key) return key;
    key = prompt('请输入 InnerSpace API Key\n（首次使用需要输入，之后会自动记住）');
    if (key && key.trim()) {
      key = key.trim();
      localStorage.setItem('innerspace_api_key', key);
      return key;
    }
    return null;
  }

  /**
   * Extract JSON from AI response text that may be wrapped in markdown code blocks
   */
  function sanitizeJSONPunctuation(str) {
    return str
      .replace(/[\u201c\u201d\u2018\u2019]/g, '"')
      .replace(/\uff1a/g, ':')
      .replace(/\uff0c/g, ',')
      .replace(/\uff5b/g, '{')
      .replace(/\uff5d/g, '}')
      .replace(/\uff3b/g, '[')
      .replace(/\uff3d/g, ']');
  }

  function tryParse(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return undefined;
    }
  }

  function extractJSON(text) {
    var result;

    // Try direct parse first
    result = tryParse(text);
    if (result !== undefined) return result;

    // Try extracting from ```json ... ``` or ``` ... ```
    var match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (match) {
      result = tryParse(match[1].trim());
      if (result !== undefined) return result;
    }

    // Try finding first { ... } or [ ... ] block
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      result = tryParse(text.substring(start, end + 1));
      if (result !== undefined) return result;
    }

    // Retry all strategies after replacing Chinese punctuation with ASCII equivalents
    var sanitized = sanitizeJSONPunctuation(text);

    result = tryParse(sanitized);
    if (result !== undefined) return result;

    match = sanitized.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (match) {
      result = tryParse(match[1].trim());
      if (result !== undefined) return result;
    }

    start = sanitized.indexOf('{');
    end = sanitized.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      result = tryParse(sanitized.substring(start, end + 1));
      if (result !== undefined) return result;
    }

    throw new Error('Failed to parse JSON from AI response: ' + text.substring(0, 200));
  }

  /**
   * Send a chat completion request
   * @param {Array} messages - Array of {role, content} objects
   * @param {Object} [options] - Optional: temperature, etc.
   * @returns {Promise<string>} AI response text
   */
  function chat(messages, options) {
    var apiKey = getApiKey();
    if (!apiKey) {
      return Promise.reject(new Error('未提供 API Key，无法调用 AI 服务。'));
    }

    options = options || {};

    var body = {
      model: MODEL,
      messages: messages,
      stream: false
    };

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    return fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(body)
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (err) {
            var msg = (err.error && err.error.message) || ('API error: ' + response.status);
            throw new Error(msg);
          });
        }
        return response.json();
      })
      .then(function (data) {
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error('Unexpected API response format');
        }
        return data.choices[0].message.content;
      });
  }

  /**
   * Send a chat request and parse the AI response as JSON
   * @param {Array} messages - Array of {role, content} objects
   * @param {Object} [options] - Optional: temperature, etc.
   * @returns {Promise<Object>} Parsed JSON object
   */
  function chatJSON(messages, options) {
    return chat(messages, options).then(function (text) {
      return extractJSON(text);
    });
  }

  // Expose globally
  window.LLMClient = {
    chat: chat,
    chatJSON: chatJSON
  };
})();
