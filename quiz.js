import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LETTERS = ["A", "B", "C", "D"];
let questions = [];
const selected = {};
let locked = false;

// ---- DOM ----
const questionsContainer = document.getElementById("questions-container");
const quizResults = document.getElementById("quiz-results");
const uploadResults = document.getElementById("upload-results");
const quizNotice = document.getElementById("quiz-notice");
const uploadNotice = document.getElementById("upload-notice");
const questionCountEl = document.getElementById("question-count");
const form = document.getElementById("quiz-form");
const submitBtn = document.getElementById("submit-btn");
const nameQuiz = document.getElementById("student-name-quiz");
const nameUpload = document.getElementById("student-name-upload");
const downloadTemplateBtn = document.getElementById("download-template-btn");
const gradeCsvBtn = document.getElementById("grade-csv-btn");
const csvUpload = document.getElementById("csv-upload");
const fileNameEl = document.getElementById("file-name");

// ---- Navigation ----
window.navigate = function (section) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("is-active"));
  document.querySelectorAll(".navbar__link").forEach((l) => l.classList.remove("is-active"));
  document.getElementById(section).classList.add("is-active");
  const link = document.querySelector(`.navbar__link[data-section="${section}"]`);
  if (link) link.classList.add("is-active");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

document.querySelectorAll(".navbar__link").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    navigate(link.dataset.section);
  });
});

// ---- Utilities ----
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function showNotice(el, message, type = "error") {
  el.innerHTML = `<div class="notice notice--${type}">${escapeHtml(message)}</div>`;
}

function clearNotice(el) {
  el.innerHTML = "";
}

// ---- Show file name when selected ----
csvUpload.addEventListener("change", () => {
  const file = csvUpload.files[0];
  fileNameEl.textContent = file ? `Selected: ${file.name}` : "";
});

// ---- Load questions from Firestore ----
async function loadQuestions() {
  try {
    const q = query(collection(db, "questions"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    questionsContainer.innerHTML = '<div class="empty-state">Couldn\'t load questions. Check Firebase setup.</div>';
    submitBtn.disabled = true;
    return;
  }

  if (questions.length === 0) {
    questionsContainer.innerHTML = '<div class="empty-state">No questions yet. An admin needs to add questions first.</div>';
    submitBtn.disabled = true;
    return;
  }

  questionCountEl.textContent = `${questions.length} Questions`;
  renderQuestions();
}

// ---- Render quiz bubbles ----
function renderQuestions() {
  questionsContainer.innerHTML = "";
  questions.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "question";
    card.dataset.id = item.id;

    card.innerHTML = `
      <div class="question__head">
        <span class="question__number">Q${index + 1}</span>
        <span class="question__text">${escapeHtml(item.text)}</span>
      </div>
      <div class="options"></div>
    `;

    const optionsWrap = card.querySelector(".options");
    LETTERS.forEach((letter) => {
      const optionText = item.options?.[letter];
      if (!optionText) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.dataset.letter = letter;
      btn.innerHTML = `<span class="bubble">${letter}</span><span>${escapeHtml(optionText)}</span>`;
      btn.addEventListener("click", () => {
        if (locked) return;
        selected[item.id] = letter;
        card.querySelectorAll(".option").forEach((o) =>
          o.classList.toggle("is-selected", o.dataset.letter === letter)
        );
      });
      optionsWrap.appendChild(btn);
    });

    questionsContainer.appendChild(card);
  });
}

// ---- Online quiz submit ----
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (locked) return;
  clearNotice(quizNotice);

  const name = nameQuiz.value.trim();
  if (!name) { showNotice(quizNotice, "Enter your name before submitting."); return; }

  const unanswered = questions.filter((q) => !selected[q.id]);
  if (unanswered.length > 0) {
    showNotice(quizNotice, `${unanswered.length} question${unanswered.length > 1 ? "s" : ""} still unanswered.`);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Grading…";

  const details = questions.map((q) => {
    const pick = selected[q.id];
    return { questionId: q.id, text: q.text, options: q.options, correct: q.correct, selected: pick, isCorrect: pick === q.correct };
  });

  const score = details.filter((d) => d.isCorrect).length;
  const total = questions.length;

  try {
    await addDoc(collection(db, "submissions"), {
      studentName: name, score, total, answers: details, method: "online", createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    showNotice(quizNotice, "Result shown but couldn't be saved.", "info");
  }

  renderScoreCard(quizResults, name, score, total);
  gradeQuizUI(details);
  locked = true;
  submitBtn.style.display = "none";
  nameQuiz.disabled = true;
  quizResults.scrollIntoView({ behavior: "smooth", block: "start" });
});

// ---- Grade quiz UI ----
function gradeQuizUI(details) {
  details.forEach((d) => {
    const card = questionsContainer.querySelector(`.question[data-id="${d.questionId}"]`);
    if (!card) return;
    card.querySelectorAll(".option").forEach((opt) => {
      const letter = opt.dataset.letter;
      const isCorrect = letter === d.correct;
      const isWrong = letter === d.selected && !isCorrect;
      opt.classList.add("is-graded");
      opt.classList.toggle("is-correct-answer", isCorrect);
      opt.classList.toggle("is-wrong-selection", isWrong);
      opt.querySelector(".option__tag")?.remove();
      if (isCorrect) {
        const t = document.createElement("span");
        t.className = "option__tag option__tag--correct";
        t.textContent = "Correct";
        opt.appendChild(t);
      } else if (isWrong) {
        const t = document.createElement("span");
        t.className = "option__tag option__tag--your-pick";
        t.textContent = "Your answer";
        opt.appendChild(t);
      }
    });
  });
}

// ---- Download CSV template ----
downloadTemplateBtn.addEventListener("click", () => {
  if (questions.length === 0) {
    showNotice(uploadNotice, "Questions not loaded yet. Try again in a moment.");
    return;
  }
  let csv = "Question,Your Answer (A/B/C/D)\n";
  questions.forEach((q, i) => {
    csv += `"Q${i + 1}: ${q.text.replace(/"/g, '""')}",\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mcq-answer-sheet.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ---- Grade uploaded CSV ----
gradeCsvBtn.addEventListener("click", async () => {
  clearNotice(uploadNotice);
  uploadResults.innerHTML = "";

  const name = nameUpload.value.trim();
  if (!name) { showNotice(uploadNotice, "Enter your name before grading."); return; }

  const file = csvUpload.files[0];
  if (!file) { showNotice(uploadNotice, "Select a CSV file first."); return; }
  if (!file.name.endsWith(".csv")) { showNotice(uploadNotice, "Only CSV files are accepted."); return; }

  gradeCsvBtn.disabled = true;
  gradeCsvBtn.textContent = "Grading…";

  const text = await file.text();
  const lines = text.trim().split("\n").slice(1);

  if (lines.length !== questions.length) {
    showNotice(uploadNotice, `CSV has ${lines.length} rows but there are ${questions.length} questions. Use the downloaded template.`);
    gradeCsvBtn.disabled = false;
    gradeCsvBtn.textContent = "Grade My Answers";
    return;
  }

  const studentAnswers = lines.map((line) => {
    const parts = line.match(/(".*?"|[^,]+)/g) || [];
    return parts[1] ? parts[1].trim().toUpperCase() : "";
  });

  const details = questions.map((q, i) => {
    const pick = LETTERS.includes(studentAnswers[i]) ? studentAnswers[i] : null;
    return { questionId: q.id, text: q.text, options: q.options, correct: q.correct, selected: pick, isCorrect: pick === q.correct };
  });

  const score = details.filter((d) => d.isCorrect).length;
  const total = questions.length;

  try {
    await addDoc(collection(db, "submissions"), {
      studentName: name, score, total, answers: details, method: "csv-upload", createdAt: serverTimestamp(),
    });
  } catch (err) {
    showNotice(uploadNotice, "Result shown but couldn't be saved.", "info");
  }

  renderScoreCard(uploadResults, name, score, total);
  renderCsvReview(uploadResults, details);
  uploadResults.scrollIntoView({ behavior: "smooth", block: "start" });

  gradeCsvBtn.disabled = false;
  gradeCsvBtn.textContent = "Grade My Answers";
});

// ---- Score card ----
function renderScoreCard(container, name, score, total) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const passed = pct >= 50;
  container.innerHTML = `
    <div class="score-card">
      <div>
        <div class="score-card__label">${escapeHtml(name)} · Result</div>
        <div class="score-card__value">${score} / ${total}</div>
        <div class="score-card__sub">Review your answers below</div>
      </div>
      <div class="score-card__pct ${passed ? "score-card__pct--pass" : "score-card__pct--fail"}">${pct}%</div>
    </div>
  `;
}

// ---- CSV answer review ----
function renderCsvReview(container, details) {
  let html = "";
  details.forEach((d, index) => {
    html += `<div class="question"><div class="question__head"><span class="question__number">Q${index + 1}</span><span class="question__text">${escapeHtml(d.text)}</span></div><div class="options">`;
    LETTERS.forEach((letter) => {
      const text = d.options?.[letter];
      if (!text) return;
      const isCorrect = letter === d.correct;
      const isSelected = letter === d.selected;
      const isWrong = isSelected && !isCorrect;
      let cls = "option is-graded";
      if (isSelected) cls += " is-selected";
      if (isCorrect) cls += " is-correct-answer";
      if (isWrong) cls += " is-wrong-selection";
      let tag = isCorrect ? '<span class="option__tag option__tag--correct">Correct</span>' : isWrong ? '<span class="option__tag option__tag--your-pick">Your answer</span>' : "";
      html += `<div class="${cls}"><span class="bubble">${letter}</span><span>${escapeHtml(text)}</span>${tag}</div>`;
    });
    html += "</div></div>";
  });
  container.innerHTML += html;
}

loadQuestions();
