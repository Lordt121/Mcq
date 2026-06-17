import { db } from "./firebase-config.js";
import {
  collection, getDocs, query, orderBy, addDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LETTERS = ["A", "B", "C", "D"];
let questions = [];
const selected = {};
let locked = false;

const questionsContainer = document.getElementById("questions-container");
const quizResults = document.getElementById("quiz-results");
const quizNotice = document.getElementById("quiz-notice");
const questionCountEl = document.getElementById("question-count");
const form = document.getElementById("quiz-form");
const submitBtn = document.getElementById("submit-btn");
const nameQuiz = document.getElementById("student-name-quiz");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function showNotice(message, type = "error") {
  quizNotice.innerHTML = `<div class="notice notice--${type}">${escapeHtml(message)}</div>`;
}

async function loadQuestions() {
  try {
    const q = query(collection(db, "questions"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    questionsContainer.innerHTML = '<div class="empty-state">Couldn\'t load questions.</div>';
    submitBtn.disabled = true;
    return;
  }

  if (questions.length === 0) {
    questionsContainer.innerHTML = '<div class="empty-state">No questions yet.</div>';
    submitBtn.disabled = true;
    return;
  }

  questionCountEl.textContent = `${questions.length} Questions`;
  renderQuestions();
}

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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (locked) return;
  quizNotice.innerHTML = "";

  const name = nameQuiz.value.trim();
  if (!name) { showNotice("Enter your name before submitting."); return; }

  const unanswered = questions.filter((q) => !selected[q.id]);
  if (unanswered.length > 0) {
    showNotice(`${unanswered.length} question${unanswered.length > 1 ? "s" : ""} still unanswered.`);
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
    showNotice("Result shown but couldn't be saved.", "info");
  }

  const pct = Math.round((score / total) * 100);
  const passed = pct >= 50;
  quizResults.innerHTML = `
    <div class="score-card">
      <div>
        <div class="score-card__label">${escapeHtml(name)} · Result</div>
        <div class="score-card__value">${score} / ${total}</div>
        <div class="score-card__sub">Review your answers below</div>
      </div>
      <div class="score-card__pct ${passed ? "score-card__pct--pass" : "score-card__pct--fail"}">${pct}%</div>
    </div>
  `;

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

  locked = true;
  submitBtn.style.display = "none";
  nameQuiz.disabled = true;
  quizResults.scrollIntoView({ behavior: "smooth", block: "start" });
});

loadQuestions();
