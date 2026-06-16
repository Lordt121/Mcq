import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- DOM Elements ----
const questionsContainer = document.getElementById("questions-container");
const resultsContainer = document.getElementById("results-container");
const noticeArea = document.getElementById("notice-area");
const questionCountEl = document.getElementById("question-count");
const form = document.getElementById("quiz-form");
const submitBtn = document.getElementById("submit-btn");
const nameInput = document.getElementById("student-name");
const tabQuizBtn = document.getElementById("tab-quiz-btn");
const tabUploadBtn = document.getElementById("tab-upload-btn");
const modeQuiz = document.getElementById("mode-quiz");
const modeUpload = document.getElementById("mode-upload");
const downloadTemplateBtn = document.getElementById("download-template-btn");
const gradeCsvBtn = document.getElementById("grade-csv-btn");
const csvUpload = document.getElementById("csv-upload");

const LETTERS = ["A", "B", "C", "D"];

let questions = [];
const selected = {};
let locked = false;

// ============================================================
// UTILITY
// ============================================================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function showNotice(message, type = "error") {
  noticeArea.innerHTML = `<div class="notice notice--${type}">${escapeHtml(message)}</div>`;
}

function clearNotice() {
  noticeArea.innerHTML = "";
}

// ============================================================
// MODE TABS — switch between online quiz and CSV upload
// ============================================================

tabQuizBtn.addEventListener("click", () => {
  tabQuizBtn.classList.add("is-active");
  tabUploadBtn.classList.remove("is-active");
  modeQuiz.style.display = "block";
  modeUpload.style.display = "none";
  clearNotice();
  resultsContainer.innerHTML = "";
});

tabUploadBtn.addEventListener("click", () => {
  tabUploadBtn.classList.add("is-active");
  tabQuizBtn.classList.remove("is-active");
  modeUpload.style.display = "block";
  modeQuiz.style.display = "none";
  clearNotice();
  resultsContainer.innerHTML = "";
});

// ============================================================
// LOAD QUESTIONS FROM FIRESTORE
// ============================================================

async function loadQuestions() {
  try {
    const q = query(collection(db, "questions"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    questionsContainer.innerHTML = "";
    submitBtn.disabled = true;
    showNotice("Couldn't load questions. Check firebase-config.js values.");
    return;
  }

  if (questions.length === 0) {
    questionsContainer.innerHTML = '<div class="empty-state">No questions yet. Add some from the <a href="admin.html">admin panel</a>.</div>';
    submitBtn.disabled = true;
    return;
  }

  questionCountEl.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;
  renderQuestions();
}

// ============================================================
// RENDER QUIZ QUESTIONS
// ============================================================

function renderQuestions() {
  questionsContainer.innerHTML = "";

  questions.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "question";
    card.dataset.id = item.id;

    const head = document.createElement("div");
    head.className = "question__head";
    head.innerHTML = `
      <span class="question__number">Q${index + 1}</span>
      <span class="question__text">${escapeHtml(item.text)}</span>
    `;
    card.appendChild(head);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "options";

    LETTERS.forEach((letter) => {
      const optionText = item.options ? item.options[letter] : undefined;
      if (!optionText) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.dataset.letter = letter;
      btn.innerHTML = `
        <span class="bubble">${letter}</span>
        <span>${escapeHtml(optionText)}</span>
      `;
      btn.addEventListener("click", () => selectAnswer(item.id, letter, card));
      optionsWrap.appendChild(btn);
    });

    card.appendChild(optionsWrap);
    questionsContainer.appendChild(card);
  });
}

function selectAnswer(questionId, letter, card) {
  if (locked) return;
  selected[questionId] = letter;
  card.querySelectorAll(".option").forEach((opt) => {
    opt.classList.toggle("is-selected", opt.dataset.letter === letter);
  });
}

// ============================================================
// ONLINE QUIZ SUBMISSION
// ============================================================

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (locked) return;
  clearNotice();

  const name = nameInput.value.trim();
  if (!name) {
    showNotice("Enter your name before submitting.");
    nameInput.focus();
    return;
  }

  const unanswered = questions.filter((q) => !selected[q.id]);
  if (unanswered.length > 0) {
    showNotice(`Answer all questions before submitting (${unanswered.length} left).`);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Grading…";

  const details = questions.map((q) => {
    const pick = selected[q.id];
    return {
      questionId: q.id,
      text: q.text,
      options: q.options,
      correct: q.correct,
      selected: pick,
      isCorrect: pick === q.correct,
    };
  });

  const score = details.filter((d) => d.isCorrect).length;
  const total = questions.length;

  try {
    await addDoc(collection(db, "submissions"), {
      studentName: name,
      score,
      total,
      answers: details,
      method: "online",
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    showNotice("Result shown below but couldn't be saved.", "info");
  }

  renderScoreCard(name, score, total);
  gradeQuizUI(details);
  lockQuiz();
});

// ============================================================
// CSV TEMPLATE DOWNLOAD
// Generates a CSV file with question numbers and blank answer column
// Student fills in column B with A/B/C/D and uploads it back
// ============================================================

downloadTemplateBtn.addEventListener("click", () => {
  if (questions.length === 0) {
    showNotice("No questions loaded yet. Wait for questions to load first.");
    return;
  }

  // Build CSV content
  // Header row + one row per question
  let csv = "Question,Your Answer (A/B/C/D)\n";
  questions.forEach((q, index) => {
    // Wrap question text in quotes in case it contains commas
    csv += `"Q${index + 1}: ${q.text.replace(/"/g, '""')}",\n`;
  });

  // Create a downloadable blob (binary large object) from the CSV string
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  // Create a temporary invisible link and click it to trigger download
  const a = document.createElement("a");
  a.href = url;
  a.download = "mcq-answer-sheet.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url); // free memory
});

// ============================================================
// CSV UPLOAD & GRADING
// Reads the uploaded CSV, parses student answers,
// compares to correct answers from Firestore
// ============================================================

gradeCsvBtn.addEventListener("click", async () => {
  clearNotice();
  resultsContainer.innerHTML = "";

  const name = nameInput.value.trim();
  if (!name) {
    showNotice("Enter your name before grading.");
    nameInput.focus();
    return;
  }

  const file = csvUpload.files[0];
  if (!file) {
    showNotice("Select a CSV file first.");
    return;
  }

  if (!file.name.endsWith(".csv")) {
    showNotice("Only CSV files are accepted.");
    return;
  }

  gradeCsvBtn.disabled = true;
  gradeCsvBtn.textContent = "Grading…";

  // Read the file content as text
  const text = await file.text();

  // Parse CSV — split into lines, skip the header row
  const lines = text.trim().split("\n").slice(1);

  if (lines.length === 0) {
    showNotice("The CSV file is empty.");
    gradeCsvBtn.disabled = false;
    gradeCsvBtn.textContent = "Grade my answers";
    return;
  }

  if (lines.length !== questions.length) {
    showNotice(`CSV has ${lines.length} answer rows but there are ${questions.length} questions. Make sure you used the downloaded template.`);
    gradeCsvBtn.disabled = false;
    gradeCsvBtn.textContent = "Grade my answers";
    return;
  }

  // Extract the answer from column B of each row
  // CSV rows look like: "Q1: What is...",A
  const studentAnswers = lines.map((line) => {
    // Handle quoted fields properly
    const parts = line.match(/(".*?"|[^,]+)/g) || [];
    const answer = parts[1] ? parts[1].trim().toUpperCase() : "";
    return answer;
  });

  // Build grading details — compare each answer to correct answer
  const details = questions.map((q, index) => {
    const pick = studentAnswers[index] || "";
    const validPick = LETTERS.includes(pick) ? pick : null;
    return {
      questionId: q.id,
      text: q.text,
      options: q.options,
      correct: q.correct,
      selected: validPick,
      isCorrect: validPick === q.correct,
    };
  });

  const score = details.filter((d) => d.isCorrect).length;
  const total = questions.length;

  // Save to Firestore
  try {
    await addDoc(collection(db, "submissions"), {
      studentName: name,
      score,
      total,
      answers: details,
      method: "csv-upload",
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    showNotice("Result shown below but couldn't be saved.", "info");
  }

  // Show results
  renderScoreCard(name, score, total);
  renderCsvReview(details);

  gradeCsvBtn.disabled = false;
  gradeCsvBtn.textContent = "Grade my answers";
});

// ============================================================
// GRADE REVIEW — for online quiz (highlights bubbles)
// ============================================================

function gradeQuizUI(details) {
  details.forEach((d) => {
    const card = questionsContainer.querySelector(`.question[data-id="${d.questionId}"]`);
    if (!card) return;

    card.querySelectorAll(".option").forEach((opt) => {
      const letter = opt.dataset.letter;
      const isCorrectAnswer = letter === d.correct;
      const isSelected = letter === d.selected;
      const isWrongSelection = isSelected && !isCorrectAnswer;

      opt.classList.add("is-graded");
      opt.classList.toggle("is-correct-answer", isCorrectAnswer);
      opt.classList.toggle("is-wrong-selection", isWrongSelection);

      const existingTag = opt.querySelector(".option__tag");
      if (existingTag) existingTag.remove();

      let tag = null;
      if (isCorrectAnswer) {
        tag = document.createElement("span");
        tag.className = "option__tag option__tag--correct";
        tag.textContent = "Correct answer";
      } else if (isWrongSelection) {
        tag = document.createElement("span");
        tag.className = "option__tag option__tag--your-pick";
        tag.textContent = "Your answer";
      }
      if (tag) opt.appendChild(tag);
    });
  });
}

// ============================================================
// GRADE REVIEW — for CSV upload (builds question cards fresh)
// ============================================================

function renderCsvReview(details) {
  let html = '<div style="margin-top:8px">';

  details.forEach((d, index) => {
    html += `
      <div class="question">
        <div class="question__head">
          <span class="question__number">Q${index + 1}</span>
          <span class="question__text">${escapeHtml(d.text)}</span>
        </div>
        <div class="options">
    `;

    LETTERS.forEach((letter) => {
      const optionText = d.options ? d.options[letter] : undefined;
      if (!optionText) return;

      const isCorrectAnswer = letter === d.correct;
      const isSelected = letter === d.selected;
      const isWrongSelection = isSelected && !isCorrectAnswer;

      let classes = "option is-graded";
      if (isSelected) classes += " is-selected";
      if (isCorrectAnswer) classes += " is-correct-answer";
      if (isWrongSelection) classes += " is-wrong-selection";

      let tag = "";
      if (isCorrectAnswer) tag = '<span class="option__tag option__tag--correct">Correct answer</span>';
      else if (isWrongSelection) tag = '<span class="option__tag option__tag--your-pick">Your answer</span>';

      // Show "No answer" if student left it blank
      const noAnswer = !d.selected && isCorrectAnswer
        ? '<span class="option__tag option__tag--your-pick">No answer given</span>'
        : "";

      html += `
        <div class="${classes}">
          <span class="bubble">${letter}</span>
          <span>${escapeHtml(optionText)}</span>
          ${tag}${noAnswer}
        </div>
      `;
    });

    html += "</div></div>";
  });

  html += "</div>";

  // Append review below the score card
  resultsContainer.innerHTML += html;
  resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ============================================================
// SCORE CARD
// ============================================================

function renderScoreCard(name, score, total) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const passed = pct >= 50;

  resultsContainer.innerHTML = `
    <div class="score-card">
      <div>
        <div class="score-card__label">${escapeHtml(name)} · Result</div>
        <div class="score-card__value">${score} / ${total}</div>
        <div class="score-card__sub">Correct answers — review your sheet below</div>
      </div>
      <div class="score-card__pct ${passed ? "score-card__pct--pass" : "score-card__pct--fail"}">${pct}%</div>
    </div>
  `;
}

// ============================================================
// LOCK QUIZ AFTER ONLINE SUBMISSION
// ============================================================

function lockQuiz() {
  locked = true;
  submitBtn.style.display = "none";
  nameInput.disabled = true;
}

// ============================================================
// KICK OFF
// ============================================================

loadQuestions();
