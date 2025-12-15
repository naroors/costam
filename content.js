chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract_question") {
    try {
      const context = extractQuestionContext();
      sendResponse({ status: "success", data: context });
    } catch (error) {
      sendResponse({ status: "error", message: error.message });
    }
  }
  return true;
});

function extractQuestionContext() {
  const selection = window.getSelection().toString().trim();
  if (selection.length > 5) {
    return `[Zaznaczony tekst]\n${selection}`;
  }

  const quizSelectors = [
    '.question-content', '.quiz-question', '#question-text', 
    '.wpProQuiz_question_text', '.qtext', '.formulation',
    'form', '.wrapper', 'main'
  ];

  let bestContainer = null;
  let maxLen = 0;

  for (const selector of quizSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.length > maxLen) {
        bestContainer = el;
        maxLen = el.innerText.length;
    }
  }

  const target = bestContainer || document.body;
  
  const clone = target.cloneNode(true);
  
  const junk = clone.querySelectorAll('script, style, nav, footer, header, .ad, .advertisement, .sidebar, noscript, iframe');
  junk.forEach(el => el.remove());

  return `[Kontekst Strony]\n${domToText(clone).substring(0, 6000)}`;
}

function domToText(node) {
  let text = "";

  if (node.nodeType === Node.TEXT_NODE) {
    const content = node.textContent;
    if (node.parentNode && (node.parentNode.tagName === 'PRE' || node.parentNode.tagName === 'CODE')) {
        return content;
    }
    return content.replace(/\s+/g, ' ');
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const tagName = node.tagName.toUpperCase();
    
    const isBlock = ['DIV', 'P', 'H1', 'H2', 'H3', 'LI', 'BR', 'TR', 'PRE', 'BLOCKQUOTE'].includes(tagName);
    
    if (isBlock) text += "\n";
    if (tagName === 'LI') text += "- ";

    for (let child of node.childNodes) {
      text += domToText(child);
    }
    
    if (isBlock) text += "\n";
  }

  return text;
}