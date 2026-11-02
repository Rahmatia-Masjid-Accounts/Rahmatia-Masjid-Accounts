import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ========================================
// FIREBASE CONFIG
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyDwTCb1NE2CAIrs4FZjuCXLA2VtPDC-YE",
  authDomain: "rahmatia-masjid-accounts.firebaseapp.com",
  projectId: "rahmatia-masjid-accounts",
  storageBucket: "rahmatia-masjid-accounts.firebasestorage.app",
  messagingSenderId: "229600290304",
  appId: "1:229600290304:web:79ac7f54da968badc21ae5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ========================================
// GLOBAL VARIABLES
// ========================================

let currentUser = null;
let isAdmin = false;
let transactions = [];
let unsubscribeTransactions = null;

const incomeCategories = [
  "রশিদ বাবদ",
  "গ্রাম কালেকশন",
  "অন্যান্য"
];

const expenseCategories = [
  "মঞ্চ ও সাউন্ড",
  "খাবার",
  "প্রচার",
  "যাতায়াত",
  "অন্যান্য ব্যয়"
];

// ========================================
// HELPER FUNCTIONS
// ========================================

const $ = id => document.getElementById(id);

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function money(value) {
  return `৳ ${formatNumber(value)}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  element.classList.toggle("hidden", hidden);
}

function showMessage(message) {
  alert(message);
}

function getCategory(item) {
  if (item.type === "income") {
    return incomeCategories.includes(item.category)
      ? item.category
      : "অন্যান্য";
  }

  return expenseCategories.includes(item.category)
    ? item.category
    : "অন্যান্য ব্যয়";
}

// ========================================
// CATEGORY SELECT
// ========================================

function updateCategoryOptions() {
  const typeSelect = $("type");
  const categorySelect = $("category");

  if (!typeSelect || !categorySelect) return;

  const categories =
    typeSelect.value === "income"
      ? incomeCategories
      : expenseCategories;

  const previous = categorySelect.value;

  categorySelect.innerHTML = categories
    .map(category =>
      `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
    )
    .join("");

  if (categories.includes(previous)) {
    categorySelect.value = previous;
  }
}

$("type")?.addEventListener("change", updateCategoryOptions);

// ========================================
// ADMIN CHECK
// ========================================

async function checkAdmin(user) {
  if (!user) return false;

  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);

    return adminSnap.exists() &&
      adminSnap.data().role === "admin";

  } catch (error) {
    console.error("Admin check error:", error);
    return false;
  }
}

// ========================================
// AUTH UI
// ========================================

function updateAdminUI() {
  setHidden($("adminPanel"), !isAdmin);
  setHidden($("adminLoginBtn"), isAdmin);
  setHidden($("logoutBtn"), !isAdmin);

  const incomeHeader = $("incomeActionHeader");
  const expenseHeader = $("expenseActionHeader");

  setHidden(incomeHeader, !isAdmin);
  setHidden(expenseHeader, !isAdmin);
}

// ========================================
// LOGIN
// ========================================

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  if (!email || !password) {
    showMessage("ইমেইল ও পাসওয়ার্ড প্রদান করুন।");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);

    $("loginDialog")?.close?.();

    if ($("loginDialog") && typeof $("loginDialog").close !== "function") {
      setHidden($("loginDialog"), true);
    }

    $("loginForm").reset();

  } catch (error) {
    console.error(error);
    showMessage("লগইন করা যায়নি। ইমেইল ও পাসওয়ার্ড যাচাই করুন।");
  }
});

// ========================================
// LOGOUT
// ========================================

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showMessage("সফলভাবে লগআউট হয়েছে।");
  } catch (error) {
    console.error(error);
    showMessage("লগআউট করা যায়নি।");
  }
});

// ========================================
// LOAD TRANSACTIONS
// ========================================

function loadTransactions() {
  if (unsubscribeTransactions) {
    unsubscribeTransactions();
    unsubscribeTransactions = null;
  }

  const tbody = $("expenseTransactionList");

  if (tbody) {
    tbody.innerHTML =
      `<tr><td colspan="5">তথ্য লোড হচ্ছে...</td></tr>`;
  }

  unsubscribeTransactions = onSnapshot(
    collection(db, "transactions"),

    snapshot => {
      transactions = snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
      }));

      transactions.sort((a, b) => {
        const dateA = String(a.date || "");
        const dateB = String(b.date || "");
        return dateB.localeCompare(dateA);
      });

      renderTotals();
      renderTransactions();
    },

    error => {
      console.error("Firestore error:", error);
      showMessage("হিসাবের তথ্য লোড করা যায়নি।");
    }
  );
}

// ========================================
// TOTALS
// ========================================

function renderTotals() {
  const income = transactions
    .filter(item => item.type === "income")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const expense = transactions
    .filter(item => item.type === "expense")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const balance = income - expense;

  if ($("totalIncome")) {
    $("totalIncome").textContent = money(income);
  }

  if ($("totalExpense")) {
    $("totalExpense").textContent = money(expense);
  }

  if ($("balance")) {
    $("balance").textContent = money(balance);
  }

  const receipt = transactions
    .filter(item =>
      item.type === "income" &&
      getCategory(item) === "রশিদ বাবদ"
    )
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const village = transactions
    .filter(item =>
      item.type === "income" &&
      getCategory(item) === "গ্রাম কালেকশন"
    )
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const other = transactions
    .filter(item =>
      item.type === "income" &&
      getCategory(item) === "অন্যান্য"
    )
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  if ($("receiptIncome")) {
    $("receiptIncome").textContent = money(receipt);
  }

  if ($("villageIncome")) {
    $("villageIncome").textContent = money(village);
  }

  if ($("otherIncome")) {
    $("otherIncome").textContent = money(other);
  }

  if ($("incomeLedgerTotal")) {
    $("incomeLedgerTotal").textContent =
      `মোট আয়: ${money(income)}`;
  }

  if ($("expenseLedgerTotal")) {
    $("expenseLedgerTotal").textContent =
      `মোট ব্যয়: ${money(expense)}`;
  }
}

// ========================================
// SEARCH AND FILTER
// ========================================

function getFilteredTransactions() {
  const search = $("searchInput")?.value
    .trim()
    .toLowerCase() || "";

  const filterType = $("filterType")?.value || "all";

  return transactions.filter(item => {
    const matchesType =
      filterType === "all" || item.type === filterType;

    const searchable = [
      item.person,
      item.description,
      item.category,
      item.date,
      item.amount
    ].join(" ").toLowerCase();

    const matchesSearch = searchable.includes(search);

    return matchesType && matchesSearch;
  });
}

$("searchInput")?.addEventListener("input", renderTransactions);
$("filterType")?.addEventListener("change", renderTransactions);

$("refreshBtn")?.addEventListener("click", () => {
  loadTransactions();
});

// ========================================
// RENDER TRANSACTIONS
// ========================================

function renderTransactions() {
  const filtered = getFilteredTransactions();

  const incomeContainer = $("incomeCategoryLedgers");
  const expenseBody = $("expenseTransactionList");

  if (!incomeContainer || !expenseBody) {
    console.error("Ledger HTML elements not found.");
    return;
  }

  const incomeTransactions = filtered.filter(
    item => item.type === "income"
  );

  const expenseTransactions = filtered.filter(
    item => item.type === "expense"
  );

  // --------------------------------------
  // INCOME: THREE SEPARATE TABLES
  // --------------------------------------

  incomeContainer.innerHTML = "";

  incomeCategories.forEach(category => {
    const items = incomeTransactions.filter(
      item => getCategory(item) === category
    );

    const total = items.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const section = document.createElement("section");
    section.className = "category-ledger";

    section.innerHTML = `
      <div class="ledger-subheading">
        <h4>${escapeHTML(category)}</h4>
        <span>মোট: ${money(total)}</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>তারিখ</th>
              <th>বিবরণ</th>
              <th>নাম</th>
              <th>পরিমাণ</th>
              ${isAdmin ? "<th>অ্যাকশন</th>" : ""}
            </tr>
          </thead>

          <tbody>
            ${
              items.length
                ? items.map(item => `
                  <tr>
                    <td>${escapeHTML(item.date || "-")}</td>
                    <td>${escapeHTML(item.description || "-")}</td>
                    <td>${escapeHTML(item.person || "-")}</td>
                    <td>${money(item.amount)}</td>
                    ${
                      isAdmin
                        ? `<td>
                            <button class="delete-btn"
                              data-id="${escapeHTML(item.id)}">
                              মুছুন
                            </button>
                          </td>`
                        : ""
                    }
                  </tr>
                `).join("")
                : `<tr>
                    <td colspan="${isAdmin ? 5 : 4}">
                      কোনো তথ্য নেই
                    </td>
                  </tr>`
            }
          </tbody>
        </table>
      </div>
    `;

    incomeContainer.appendChild(section);
  });

  // --------------------------------------
  // EXPENSE: ONE COMBINED TABLE
  // --------------------------------------

  expenseBody.innerHTML = expenseTransactions.length
    ? expenseTransactions.map(item => `
        <tr>
          <td>${escapeHTML(item.date || "-")}</td>

          <td>
            ${escapeHTML(item.description || "-")}
            <small class="expense-category">
              ${escapeHTML(getCategory(item))}
            </small>
          </td>

          <td>${escapeHTML(item.person || "-")}</td>

          <td>${money(item.amount)}</td>

          ${
            isAdmin
              ? `<td>
                  <button class="delete-btn"
                    data-id="${escapeHTML(item.id)}">
                    মুছুন
                  </button>
                </td>`
              : ""
          }
        </tr>
      `).join("")
    : `<tr>
        <td colspan="${isAdmin ? 5 : 4}">
          কোনো ব্যয়ের তথ্য নেই
        </td>
      </tr>`;

  if ($("entryCount")) {
    $("entryCount").textContent =
      `মোট ${filtered.length}টি এন্ট্রি`;
  }

  if ($("emptyMessage")) {
    setHidden($("emptyMessage"), filtered.length !== 0);
  }
}

// ========================================
// ADD TRANSACTION
// ========================================

$("transactionForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin || !currentUser) {
    showMessage("শুধু অ্যাডমিন হিসাব যোগ করতে পারবেন।");
    return;
  }

  const type = $("type")?.value;
  const amount = Number($("amount")?.value);
  const person = $("person")?.value.trim() || "";
  const date = $("date")?.value || "";
  const category = $("category")?.value || "";
  const description = $("description")?.value.trim() || "";

  if (!["income", "expense"].includes(type)) {
    showMessage("হিসাবের ধরন নির্বাচন করুন।");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("সঠিক পরিমাণ লিখুন।");
    return;
  }

  const allowedCategories =
    type === "income" ? incomeCategories : expenseCategories;

  if (!allowedCategories.includes(category)) {
    showMessage("সঠিক ক্যাটাগরি নির্বাচন করুন।");
    return;
  }

  if (!date) {
    showMessage("তারিখ নির্বাচন করুন।");
    return;
  }

  try {
    await addDoc(collection(db, "transactions"), {
      type,
      amount,
      person,
      date,
      category,
      description,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    $("transactionForm").reset();
    updateCategoryOptions();

    showMessage("হিসাব সফলভাবে যোগ হয়েছে।");

  } catch (error) {
    console.error("Add transaction error:", error);
    showMessage("হিসাব যোগ করা যায়নি। আবার চেষ্টা করুন।");
  }
});

// ========================================
// DELETE TRANSACTION
// ========================================

document.addEventListener("click", async event => {
  const button = event.target.closest(".delete-btn");

  if (!button) return;

  if (!isAdmin || !currentUser) {
    showMessage("শুধু অ্যাডমিন হিসাব মুছতে পারবেন।");
    return;
  }

  const id = button.dataset.id;

  if (!id) return;

  if (!confirm("আপনি কি এই হিসাবটি মুছে ফেলতে চান?")) {
    return;
  }

  try {
    await deleteDoc(doc(db, "transactions", id));
    showMessage("হিসাব মুছে ফেলা হয়েছে।");

  } catch (error) {
    console.error("Delete error:", error);
    showMessage("হিসাব মুছে ফেলা যায়নি।");
  }
});

// ========================================
// AUTH STATE
// ========================================

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (user) {
    isAdmin = await checkAdmin(user);

    if (!isAdmin) {
      await signOut(auth);
      currentUser = null;
      isAdmin = false;
      showMessage("এই অ্যাকাউন্টটি অ্যাডমিন হিসেবে অনুমোদিত নয়।");
    }
  } else {
    isAdmin = false;
  }

  updateAdminUI();
  renderTransactions();
  loadTransactions();
});

// ========================================
// INITIALIZE
// ========================================

updateCategoryOptions();
