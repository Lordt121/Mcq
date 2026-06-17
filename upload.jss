import { db } from "./firebase-config.js";
import {
  collection, getDocs, query, orderBy, addDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LETTERS = ["A", "B", "C", "D"];
let questions = [];

const uploadNotice = document.getElementById("upload-notice");
const uploadResults = document.getElementById("upload-results");
const nameUpload = document.getElementById("student-name-upload");
const downloadTemplateBtn = document.getElementById("download-template-btn");
const gradeCsvBtn = document.getElementById("grade-csv-btn");
const csvUpload = document.getElementById("csv-upload");
const fileNameEl = document.getElementById("file-name");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function showNotice(message, type = "error") {
  uploadNotice.innerHTML = `<div class="notice notice--${type}">${escapeHtml(message)}</div>`;
}

async function loadQuestions() {
  try {
    const q = query(collection(db, "questions"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    showNotice("Couldn't load questions. Check Firebase setup.");
  }
}

csvUpload.addEventListener("change", () => {
  const file = csvUpload.files[0];
  fileNameEl.textContent = file ? `Selected: ${file.name}` : "";
});

downloadTemplateBtn.addEventListener("click", () => {
  if (questions.length === 0) {
    showNotice("Questions not loaded yet. Refresh and try again.");
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

gradeCsvBtn.addEventListener("click", async () => {
  uploadNotice.innerHTML = "";
  uploadResults.innerHTML = "";

  const name = nameUpload.value.trim();
  if (!name) { showNotice("Enter your name before grading."); return; }

  const file = csvUpload.files[0];
  if (!file) { showNotice("Select a CSV file first."); return; }
  if (!file.name.endsWith(".csv")) { showNotice("Only CSV files are accepted."); return; }

  gradeCsvBtn.disabled = true;
  gradeCsvBtn.textContent = "Grading…";

  const text = await file.text();
  const lines = text.trim().split("\n").slice(1);

  if (lines.length !== questions.length) {
    showNotice(`CSV has ${lines.length} rows but there are ${questions.length} questions. Use the downloaded template.`);
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
    showNotice("Result shown but couldn't be saved.", "info");
  }

  const pct = Math.round((score / total) * 100);
  const passed = pct >= 50;

  let html = `
    <div class="score-card">
      <div>
        <div class="score-card__label">${escapeHtml(name)} · Result</div>
        <div class="score-card__value">${score} / ${total}</div>
        <div class="score-card__sub">Review your answers below</div>
      </div>
      <div class="score-card__pct ${passed ? "score-card__pct--pass" : "score-card__pct--fail"}">${pct}%</div>
    </div>
  `;

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
      const tag = isCorrect
        ? '<span class="option__tag option__tag--correct">Correct</span>'
        : isWrong
        ? '<span class="option__tag option__tag--your-pick">Your answer</span>'
        : "";
      html += `<div class="${cls}"><span class="bubble">${letter}</span><span>${escapeHtml(text)}</span>${tag}</div>`;
    });
    html += "</div></div>";
  });

  uploadResults.innerHTML = html;
  uploadResults.scrollIntoView({ behavior: "smooth", block: "start" });

  gradeCsvBtn.disabled = false;
  gradeCsvBtn.textContent = "Grade My Answers";
});

loadQuestions();
