document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['ollamaHost', 'ollamaModel', 'ollamaTextModel', 'fastMode', 'hqMode'], (result) => {
    if (result.ollamaHost) document.getElementById('hostUrl').value = result.ollamaHost;
    if (result.ollamaModel) document.getElementById('modelName').value = result.ollamaModel;
    // Default text model to llama3.2 if not set
    document.getElementById('textModelName').value = result.ollamaTextModel || "llama3.2";
    
    if (result.fastMode !== undefined) document.getElementById('fastModeToggle').checked = result.fastMode;
    if (result.hqMode !== undefined) document.getElementById('hqModeToggle').checked = result.hqMode;
  });
});

document.getElementById('solveBtn').addEventListener('click', async () => {
  const resultDiv = document.getElementById('result');
  const solveBtn = document.getElementById('solveBtn');
  const hostUrl = document.getElementById('hostUrl').value.replace(/\/$/, '');
  const visionModel = document.getElementById('modelName').value; // e.g. llava
  const textModel = document.getElementById('textModelName').value; // e.g. llama3.2
const explainMode = true;
  const fastMode = document.getElementById('fastModeToggle').checked;
  const hqMode = document.getElementById('hqModeToggle').checked; 

  // Save settings
  chrome.storage.local.set({ 
    ollamaHost: hostUrl, 
    ollamaModel: visionModel, 
    ollamaTextModel: textModel,
    fastMode: fastMode,
    hqMode: hqMode
  });

  solveBtn.disabled = true;
  solveBtn.innerText = "PRZETWARZANIE...";
  resultDiv.innerHTML = '<div class="spinner"></div><span>Pobieranie danych...</span>';

  try {
    let screenshotPromise;
    if (fastMode) {
      screenshotPromise = Promise.resolve(null);
    } else {
      // quality arg for captureVisibleTab
      screenshotPromise = captureScreenshot(hqMode ? 100 : 40, hqMode); 
    }

    const contextPromise = new Promise(async (resolve, reject) => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return reject(new Error("Brak aktywnej karty"));
        
        chrome.tabs.sendMessage(tab.id, { action: "extract_question" }, (response) => {
            if (chrome.runtime.lastError) return resolve("");
            resolve(response ? response.data : "");
        });
    });

    const [screenshot, context] = await Promise.all([screenshotPromise, contextPromise]);
      
    const activeModel = screenshot ? visionModel : textModel;
    const modeLabel = screenshot ? "Vision" : "Text/Logic";

    resultDiv.innerHTML = `<div class="spinner"></div><span>Uzywam modelu: <strong>${activeModel}</strong> (${modeLabel})<br>trwa proces jebania egzaminu...</span>`;
      
    await solveWithOllama(hostUrl, activeModel, context, screenshot, resultDiv);
    
    solveBtn.disabled = false;
    solveBtn.innerText = "ROZWIAZ";

  } catch (error) {
    resultDiv.innerHTML = `⚠️ <strong>Blad:</strong> ${error.message}`;
    solveBtn.disabled = false;
    solveBtn.innerText = "ROZWIAZ";
  }
});

async function solveWithOllama(host, model, context, screenshot, outputElement) {
  const url = `${host}/api/generate`;
  let systemPrompt = "You are an expert exam solver. Your goal is to provide the correct answer based strictly on the provided context.";

  let userPrompt = `Context:\n${context}\n\nTask: Solve the question step-by-step. 
  1. First, analyze the question and options carefully.
  2. Then, provide the final answer starting with the separator "### ANSWER:".
  
  Example Format:
  Analysis: [Reasoning...]
  ### ANSWER: A. Option
  
  Now solve:`;

  const payload = {
    model: model,
    prompt: userPrompt,
    system: systemPrompt,
    stream: false,
    images: screenshot ? [screenshot] : [],
    options: {
      temperature: 0.1, // Low temp for precision
      num_ctx: 4096     // Increased context for complex logic
    }
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    // Visual Timer
    let seconds = 0;
    const timerInterval = setInterval(() => {
        seconds++;
        let tip = "";
        if (seconds > 10) tip = "<br><small>Szybki tryb (tekst) jest o wiele szybszy.</small>";
        if (seconds > 30) tip = "<br><small>Model Vision dlugo mysli. Sprobuj 'moondream'.</small>";
        outputElement.innerHTML = `<div class="spinner"></div><span>Uzywam modelu: <strong>${model}</strong><br>trwa proces jebania egzaminu... (${seconds}s)</span>${tip}`;
    }, 1000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    clearInterval(timerInterval);

    if (!response.ok) throw new Error(`Ollama Error: ${response.status}`);

    const data = await response.json();
    
    if (!data.response) {
       outputElement.innerHTML = "masz kurwa lipe XD (pusta odpowiedz)";
       return;
    }

    outputElement.innerHTML = formatOutput(data.response);

  } catch (e) {
    if (e.name === 'AbortError') {
      outputElement.innerHTML = "⚠️ <strong>Limit czasu minal!</strong><br>Model myslal zbyt dlugo.";
    } else {
      outputElement.innerHTML = `⚠️ Blad polaczenia: ${e.message}`;
    }
  }
}
async function captureScreenshot(quality = 40, hqMode = false) {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: quality }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        resolve(null);
        return;
      }

      if (hqMode) {
        // Return raw base64 without resizing
        resolve(dataUrl.split(',')[1]);
        return;
      }

      // Resize image to max 800px width
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const resizedDataUrl = canvas.toDataURL('image/jpeg', quality / 100); 
        resolve(resizedDataUrl.split(',')[1]);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  });
}

function formatOutput(text) {
  const answerMatch = text.match(/###\s*ANSWER\s*:?\s*([\s\S]*)/i);
  
  let contentToShow = text;
  
  if (answerMatch && answerMatch[1]) {
      // Just show the part after the separator
      contentToShow = answerMatch[1].trim();
  } else {
      contentToShow = text;
  }

  // Formatting (Bold, Newlines)
  let formatted = contentToShow.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;

}

