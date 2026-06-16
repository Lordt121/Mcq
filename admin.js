import { db, auth } from "./firebase-config.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const LETTERS = ["A", "B", "C", "D"];

const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");
const loginForm = document.getElementById("login-form");
const loginNotice = document.getElementById("login-notice");
const adminEmailEl = document.getElementById("admin-email");
const logoutLink = document.getElementById("logout-link");
const tabs = document.querySelectorAll(".admin-tab");
const sections = {
  questions: document.getElementById("tab-questions"),
  results: document.getElementById("tab-results"),
};
const questionForm = document.getElementById("question-form");
const questionFormTitle = document.getElementById("question-form-title");
const questionFormNotice = document.getElementById("question-form-notice");
const questionSubmitBtn = document.getElementById("question-submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const qTextInput = document.getElementById("q-text");
const qOptionInputs = {
  A: document.getElementById("q-option-a"),
  B: document.getElementById("q-option-b"),
  C: document.getElementById("q-option-c"),
  D: document.getElementById("q-option-d"),
};
const correctPick = document.getElementById("correct-pick");
const questionList = document.getElementById("question-list");
const questionCountLabel = document.getElementById("question-count-label");
const seedBtn = document.getElementById("seed-btn");
const resultsTableWrap = document.getElementById("results-table-wrap");
const resultsCountLabel = document.getElementById("results-count-label");
const resultDetail = document.getElementById("result-detail");
const refreshResultsBtn = document.getElementById("refresh-results-btn");

let correctLetter = "A";
let editingId = null;
let editingOrder = 0;
let questions = [];
let submissions = [];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginView.style.display = "none";
    adminView.style.display = "block";
    adminEmailEl.textContent = user.email || "Signed in";
    loadQuestions();
    loadResults();
  } else {
    loginView.style.display = "block";
    adminView.style.display = "none";
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginNotice.innerHTML = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    loginNotice.innerHTML = `<div class="notice notice--error">Error: ${err.code} — ${err.message}</div>`;
  }
});

logoutLink.addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
    Object.entries(sections).forEach(([key, section]) => {
      section.classList.toggle("is-active", key === tab.dataset.tab);
    });
  });
});

correctPick.querySelectorAll(".correct-pick__option").forEach((btn) => {
  btn.addEventListener("click", () => {
    correctLetter = btn.dataset.letter;
    correctPick.querySelectorAll(".correct-pick__option").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
    });
  });
});

async function loadQuestions() {
  questionList.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const q = query(collection(db, "questions"), orderBy("order", "asc"));
    const snap = await getDocs(q);
    questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    questionList.innerHTML = '<div class="notice notice--error">Couldn\'t load questions.</div>';
    return;
  }
  renderQuestionList();
}

function renderQuestionList() {
  questionCountLabel.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;

  if (questions.length === 0) {
    questionList.innerHTML = '<div class="empty-state">No questions yet. Add one above or load sample questions.</div>';
    return;
  }

  questionList.innerHTML = "";
  questions.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "question-row";

    const optsHtml = LETTERS.map((letter) => {
      const text = item.options ? item.options[letter] : undefined;
      if (!text) return "";
      const isCorrect = letter === item.correct;
      return `<div class="${isCorrect ? "is-correct" : ""}"><span>${letter}</span>${escapeHtml(text)}</div>`;
    }).join("");

    row.innerHTML = `
      <div class="question-row__head">
        <div>
          <div class="question-row__title">Q${index + 1}. ${escapeHtml(item.text)}</div>
          <div class="question-row__meta">Correct answer: ${item.correct || "—"}</div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" data-id="${item.id}">Edit</button>
          <button class="icon-btn icon-btn--danger" data-action="delete" data-id="${item.id}">Delete</button>
        </div>
      </div>
      <div class="question-row__opts">${optsHtml}</div>
    `;
    questionList.appendChild(row);
  });

  questionList.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => startEdit(btn.dataset.id));
  });
  questionList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => deleteQuestion(btn.dataset.id));
  });
}

function startEdit(id) {
  const item = questions.find((q) => q.id === id);
  if (!item) return;

  editingId = id;
  editingOrder = item.order ?? 0;
  qTextInput.value = item.text || "";
  LETTERS.forEach((letter) => {
    qOptionInputs[letter].value = item.options ? item.options[letter] || "" : "";
  });

  correctLetter = item.correct || "A";
  correctPick.querySelectorAll(".correct-pick__option").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.letter === correctLetter);
  });

  questionFormTitle.textContent = "Edit question";
  questionSubmitBtn.textContent = "Save changes";
  cancelEditBtn.style.display = "inline-block";
  questionFormNotice.innerHTML = "";
  questionForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetQuestionForm() {
  editingId = null;
  editingOrder = 0;
  questionForm.reset();
  correctLetter = "A";
  correctPick.querySelectorAll(".correct-pick__option").forEach((b, idx) => {
    b.classList.toggle("is-active", idx === 0);
  });
  questionFormTitle.textContent = "Add a question";
  questionSubmitBtn.textContent = "Add question";
  cancelEditBtn.style.display = "none";
  questionFormNotice.innerHTML = "";
}

cancelEditBtn.addEventListener("click", resetQuestionForm);

questionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  questionFormNotice.innerHTML = "";

  const text = qTextInput.value.trim();
  const optionA = qOptionInputs.A.value.trim();
  const optionB = qOptionInputs.B.value.trim();
  const optionC = qOptionInputs.C.value.trim();
  const optionD = qOptionInputs.D.value.trim();

  if (!text || !optionA || !optionB) {
    questionFormNotice.innerHTML = '<div class="notice notice--error">Question text plus options A and B are required.</div>';
    return;
  }

  const options = { A: optionA, B: optionB };
  if (optionC) options.C = optionC;
  if (optionD) options.D = optionD;

  if (!options[correctLetter]) {
    questionFormNotice.innerHTML = '<div class="notice notice--error">The correct answer must be one of the filled options.</div>';
    return;
  }

  const payload = {
    text,
    options,
    correct: correctLetter,
    order: editingId ? editingOrder : questions.length,
  };

  questionSubmitBtn.disabled = true;
  try {
    if (editingId) {
      await updateDoc(doc(db, "questions", editingId), payload);
    } else {
      await addDoc(collection(db, "questions"), payload);
    }
    resetQuestionForm();
    await loadQuestions();
  } catch (err) {
    console.error(err);
    questionFormNotice.innerHTML = '<div class="notice notice--error">Couldn\'t save. Check Firestore setup.</div>';
  } finally {
    questionSubmitBtn.disabled = false;
  }
});

async function deleteQuestion(id) {
  if (!confirm("Delete this question? This can't be undone.")) return;
  try {
    await deleteDoc(doc(db, "questions", id));
    await loadQuestions();
  } catch (err) {
    console.error(err);
    alert("Couldn't delete. Check Firestore setup.");
  }
}

const SAMPLE_QUESTIONS = [
  {
    text: "What does HTML stand for?",
    options: { A: "Hyper Text Markup Language", B: "High Transfer Markup Logic", C: "Hyperlink Text Management Language", D: "Home Tool Markup Language" },
    correct: "A",
  },
  {
    text: "Which data structure uses LIFO ordering?",
    options: { A: "Queue", B: "Stack", C: "Array", D: "Linked List" },
    correct: "B",
  },
  {
    text: "Which is NOT a JavaScript primitive type?",
    options: { A: "Boolean", B: "Float", C: "String", D: "Undefined" },
    correct: "B",
  },
  {
    text: "Time complexity of binary search?",
    options: { A: "O(n)", B: "O(n^2)", C: "O(log n)", D: "O(1)" },
    correct: "C",
  },
  {
    text: "Which symbol starts a single-line comment in JavaScript?",
    options: { A: "<!-- -->", B: "/* */", C: "//", D: "#" },
    correct: "C",
  },
];

seedBtn.addEventListener("click", async () => {
  if (!confirm(`Add ${SAMPLE_QUESTIONS.length} sample questions?`)) return;
  seedBtn.disabled = true;
  try {
    let order = questions.length;
    for (const sample of SAMPLE_QUESTIONS) {
      await addDoc(collection(db, "questions"), { ...sample, order: order++ });
    }
    await loadQuestions();
  } catch (err) {
    console.error(err);
    alert("Couldn't add samples. Check Firestore setup.");
  } finally {
    seedBtn.disabled = false;
  }
});

async function loadResults() {
  resultsTableWrap.innerHTML = '<div class="empty-state">Loading…</div>';
  resultDetail.innerHTML = "";
  try {
    const q = query(collection(db, "submissions"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    submissions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    resultsTableWrap.innerHTML = '<div class="notice notice--error">Couldn\'t load results.</div>';
    return;
  }
  renderResultsTable();
}

function renderResultsTable() {
  resultsCountLabel.textContent = `${submissions.length} submission${submissions.length === 1 ? "" : "s"}`;

  if (submissions.length === 0) {
    resultsTableWrap.innerHTML = '<div class="empty-state">No submissions yet.</div>';
    return;
  }

  let html = `
    <table class="results-table">
      <thead><tr><th>Student</th><th>Score</th><th>%</th><th>Submitted</th></tr></thead>
      <tbody>
  `;

  submissions.forEach((sub) => {
    const pct = sub.total > 0 ? Math.round((sub.score / sub.total) * 100) : 0;
    const passed = pct >= 50;
    const date = sub.createdAt && sub.createdAt.toDate ? sub.createdAt.toDate() : null;
    const dateStr = date ? date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

    html += `
      <tr data-id="${sub.id}">
        <td>${escapeHtml(sub.studentName)}</td>
        <td>${sub.score} / ${sub.total}</td>
        <td><span class="pct-pill ${passed ? "pct-pill--pass" : "pct-pill--fail"}">${pct}%</span></td>
        <td>${dateStr}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  resultsTableWrap.innerHTML = html;

  resultsTableWrap.querySelectorAll("tbody tr").forEach((row) => {
    row.addEventListener("click", () => showResultDetail(row.dataset.id));
  });
}

function showResultDetail(id) {
  const sub = submissions.find((s) => s.id === id);
  if (!sub) return;

  const pct = sub.total > 0 ? Math.round((sub.score / sub.total) * 100) : 0;
  const passed = pct >= 50;

  let html = `
    <div class="score-card">
      <div>
        <div class="score-card__label">${escapeHtml(sub.studentName)} · Answer review</div>
        <div class="score-card__value">${sub.score} / ${sub.total}</div>
      </div>
      <div class="score-card__pct ${passed ? "score-card__pct--pass" : "score-card__pct--fail"}">${pct}%</div>
    </div>
  `;

  (sub.answers || []).forEach((d, index) => {
    html += '<div class="question">';
    html += `
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

      html += `
        <div class="${classes}">
          <span class="bubble">${letter}</span>
          <span>${escapeHtml(optionText)}</span>
          ${tag}
        </div>
      `;
    });

    html += "</div></div>";
  });

  resultDetail.innerHTML = html;
  resultDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

refreshResultsBtn.addEventListener("click", loadResults);
