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
    'form', '.wrapper'
  ];

  for (const selector of quizSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.length > 20) {
        return `[Kontener Pytania (${selector})]\n${cleanText(el.innerText)}`;
    }
  }

  const main = document.querySelector('main') || document.body;
  
  const clone = main.cloneNode(true);
  
  const junk = clone.querySelectorAll('script, style, nav, footer, header, .ad, .advertisement, .sidebar');
  junk.forEach(el => el.remove());

  return `[Cala Strona (Oczyszczona)]\n${cleanText(clone.innerText).substring(0, 5000)}`;
}

function cleanText(text) {
  return text
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

}
