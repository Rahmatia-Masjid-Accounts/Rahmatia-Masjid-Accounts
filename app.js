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
// 1. FIREBASE CONFIG
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyDw0TCb1NE2CAIrs4FZjuCXLA2VtPDC-YE",
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
// 2. GLOBAL VARIABLES
// ========================================

let currentUser = null;
let isAdmin = false;
let transactions = [];
let unsubscribeTransactions = null;
let authCheckVersion = 0;

// নতুন তিনটি আয়ের উৎস
const incomeCategories = [
  "রশিদ বাবদ কালেকশন",
  "গ্রাম কালেকশন",
  "অন্যান্য কালেকশন"
];

// ব্যয়ের বিভাগ
const expenseCategories = [
  "মঞ্চ ও সাউন্ড",
  "খাবার",
  "প্রচার",
  "যাতায়াত",
  "অন্যান্য ব্যয়"
];

// ========================================
// 3. HELPER FUNCTIONS
// ========================================

const $ = id => document.getElementById(id);

function formatNumber(value) {
  const number = Number(value || 0);

  return number.toLocaleString("en-US", {
    maximumFractionDigits: 2
  });
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

function setStatus(message, error = false) {
  const element = $("statusMessage");

  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error", error);
}

function getCategory(item) {
  // পুরোনো/ভিন্ন নামে সংরক্ষিত category field-ও পড়বে।
  const rawCategory =
    item.category ??
    item.categoryName ??
    item.incomeCategory ??
    item.expenseCategory ??
    item.division ??
    "";

  const category = String(rawCategory).trim().normalize("NFC");

  // ফাঁকা বা placeholder বিভাগকে নির্দিষ্ট fallback-এ দেখানো হবে।
  if (
    !category ||
    ["বিভাগ নেই", "নেই", "undefined", "null"].includes(category.toLowerCase())
  ) {
    return item.type === "income"
      ? "অন্যান্য"
      : "অন্যান্য ব্যয়";
  }

  return category;
}

function getAmount(item) {
  const amount = Number(item.amount);

  return Number.isFinite(amount) ? amount : 0;
}

// ========================================
// 4. INCOME CATEGORY MAPPING
// ========================================

// পুরোনো ক্যাটাগরিগুলোকে নতুন তিনটি বিভাগে দেখানো হবে।
// Firestore-এর পুরোনো ডেটা পরিবর্তন বা ডিলিট করা হবে না।

function getIncomeDisplayCategory(item) {
  const category = getCategory(item).trim().normalize("NFC");

  // রশিদ বাবদ: নতুন ও পুরোনো সব নাম একই বিভাগে দেখাবে।
  if (
    [
      "রশিদ বাবদ",
      "রশিদ",
      "রশিদ বাবদ কালেকশন",
      "রশিদ সংগ্রহ"
    ].includes(category)
  ) {
    return "রশিদ বাবদ কালেকশন";
  }

  // গ্রাম কালেকশন: পুরোনো নামও সমর্থিত।
  if (
    [
      "গ্রাম কালেকশন",
      "বাজার/মাঠ/গ্রাম কালেকশন",
      "বাজার / মাঠ / গ্রাম কালেকশন",
      "গ্রাম",
      "বাজার কালেকশন",
      "মাঠ কালেকশন"
    ].includes(category)
  ) {
    return "গ্রাম কালেকশন";
  }

  // অন্য সব আয় এবং বিভাগ-ছাড়া পুরোনো আয় এখানে দেখাবে।
  return "অন্যান্য কালেকশন";
}

// ========================================
// 5. CATEGORY SELECT
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
    .map(category => `
      <option value="${escapeHTML(category)}">
        ${escapeHTML(category)}
      </option>
    `)
    .join("");

  if (categories.includes(previous)) {
    categorySelect.value = previous;
  }
}

$("type")?.addEventListener("change", updateCategoryOptions);

// ========================================
// 6. ADMIN VERIFICATION
// ========================================

async function checkAdmin(user) {
  if (!user) return false;

  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);

    if (!adminSnap.exists()) {
      console.warn("Admin document not found.");
      return false;
    }

    const data = adminSnap.data();

    return data.role === "admin";

  } catch (error) {
    console.error("ADMIN VERIFICATION ERROR:", error);

    setStatus(
      "অ্যাডমিন যাচাই করা যায়নি: " +
      (error.code || error.message),
      true
    );

    return false;
  }
}

// ========================================
// 7. ADMIN UI
// ========================================

function updateAdminUI() {
  setHidden($("adminPanel"), !isAdmin);
  setHidden($("adminLoginBtn"), isAdmin);
  setHidden($("logoutBtn"), !isAdmin);

  setHidden($("incomeActionHeader"), !isAdmin);
  setHidden($("expenseActionHeader"), !isAdmin);

  renderTransactions();
}

// ========================================
// 8. LOGIN
// ========================================

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  const errorElement = $("loginError");
  const submitButton = $("loginSubmitBtn");

  if (errorElement) errorElement.textContent = "";

  if (!email || !password) {
    if (errorElement) {
      errorElement.textContent =
        "ইমেইল ও পাসওয়ার্ড প্রদান করুন।";
    }
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "লগইন হচ্ছে...";
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);

    $("loginDialog")?.close?.();
    $("loginForm")?.reset();

    if (errorElement) errorElement.textContent = "";

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    const errors = {
      "auth/invalid-credential":
        "ইমেইল অথবা পাসওয়ার্ড ভুল।",

      "auth/user-not-found":
        "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।",

      "auth/wrong-password":
        "পাসওয়ার্ড সঠিক নয়।",

      "auth/invalid-email":
        "সঠিক ইমেইল ঠিকানা দিন।",

      "auth/user-disabled":
        "এই অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।",

      "auth/too-many-requests":
        "অনেকবার চেষ্টা করা হয়েছে। পরে আবার চেষ্টা করুন।",

      "auth/network-request-failed":
        "ইন্টারনেট সংযোগ পরীক্ষা করুন।",

      "auth/operation-not-allowed":
        "Firebase Email/Password Authentication চালু নেই।",

      "auth/invalid-api-key":
        "Firebase API Key যাচাই করুন।",

      "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
        "Firebase API Key সঠিক নয়।"
    };

    const message =
      errors[error.code] ||
      `লগইন সমস্যা: ${error.code || error.message}`;

    if (errorElement) {
      errorElement.textContent = message;
    } else {
      showMessage(message);
    }

  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "লগইন করুন";
    }
  }
});

// ========================================
// 9. LOGOUT
// ========================================

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showMessage("সফলভাবে লগআউট হয়েছে।");

  } catch (error) {
    console.error("LOGOUT ERROR:", error);

    showMessage(
      "লগআউট করা যায়নি: " +
      (error.code || error.message)
    );
  }
});

// ========================================
// 10. LOAD TRANSACTIONS
// ========================================

function loadTransactions() {
  if (unsubscribeTransactions) {
    unsubscribeTransactions();
    unsubscribeTransactions = null;
  }

  transactions = [];

  setStatus("হিসাবের তথ্য লোড হচ্ছে...");

  const incomeContainer = $("incomeCategoryLedgers");
  const expenseBody = $("expenseTransactionList");

  if (incomeContainer) {
    incomeContainer.innerHTML = "";
  }

  if (expenseBody) {
    expenseBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          হিসাবের তথ্য লোড হচ্ছে...
        </td>
      </tr>
    `;
  }

  try {
    const transactionsRef = collection(db, "transactions");

    unsubscribeTransactions = onSnapshot(
      transactionsRef,

      snapshot => {
  console.log(
    "FIRESTORE SUCCESS:",
    snapshot.size,
    "documents"
  );

  try {
    transactions = snapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));

    transactions.sort((a, b) =>
      String(b.date || "").localeCompare(
        String(a.date || "")
      )
    );

    // আগে ডেটা আসার বিষয়টি নিশ্চিত করি
    setStatus(
      `Firebase থেকে ${transactions.length}টি হিসাব পাওয়া গেছে।`
    );

    renderTotals();
    renderTransactions();

    setStatus(
      `হিসাব সফলভাবে লোড হয়েছে। মোট ${transactions.length}টি এন্ট্রি।`
    );

  } catch (error) {
    console.error("RENDER ERROR:", error);

    setStatus(
      "ডেটা এসেছে, কিন্তু প্রদর্শনে সমস্যা: " +
      (error.message || error),
      true
    );
  }
},

      error => {
        console.error("FIRESTORE ERROR:", error);

        setStatus(
          "হিসাব লোড করা যায়নি: " +
          (error.code || error.message),
          true
        );

        if (expenseBody) {
          expenseBody.innerHTML = `
            <tr>
              <td colspan="5">
                ${escapeHTML(error.code || error.message)}
              </td>
            </tr>
          `;
        }
      }
    );

  } catch (error) {
    console.error("LOAD ERROR:", error);

    setStatus(
      "ডেটাবেজ সংযোগ সমস্যা: " +
      (error.code || error.message),
      true
    );
  }
}
// ========================================
// INCOME OVERVIEW DROPDOWN DETAILS
// ========================================

function renderIncomeDetails(containerId, items) {
  const container = $(containerId);

  if (!container) return;

  // মোট হিসাবের জন্য ব্যবহৃত একই transaction list থেকেই বিস্তারিত দেখানো হবে।
  items = [...items].sort((a, b) =>
    String(b.date || "").localeCompare(
      String(a.date || "")
    )
  );

  if (items.length === 0) {
    container.innerHTML = `
      <p class="detail-empty">
        এই বিভাগে এখনো কোনো হিসাব নেই।
      </p>
    `;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="income-detail-row">

      <div class="income-detail-info">

        <strong>
          ${escapeHTML(item.description || "বিবরণ নেই")}
        </strong>

        <small>
          তারিখ: ${escapeHTML(item.date || "-")}
          ${item.person
            ? " | নাম: " + escapeHTML(item.person)
            : ""}
        </small>

      </div>

      <span class="income-detail-amount">
        ${money(getAmount(item))}
      </span>

    </div>
  `).join("");
}
// ========================================
// 11. FINANCIAL TOTALS
// ========================================

function renderTotals() {
  const incomeTransactions = transactions.filter(
    item => item.type === "income"
  );

  const expenseTransactions = transactions.filter(
    item => item.type === "expense"
  );

  const income = incomeTransactions.reduce(
    (sum, item) => sum + getAmount(item),
    0
  );

  const expense = expenseTransactions.reduce(
    (sum, item) => sum + getAmount(item),
    0
  );

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

  // তিনটি আয়ের বিভাগের জন্য একবারই তালিকা তৈরি করা হচ্ছে।
  // একই তালিকা থেকে মোট টাকা এবং বিস্তারিত—দুটিই দেখানো হবে।
  const receiptItems = incomeTransactions.filter(
    item => getIncomeDisplayCategory(item) === "রশিদ বাবদ কালেকশন"
  );

  const villageItems = incomeTransactions.filter(
    item => getIncomeDisplayCategory(item) === "গ্রাম কালেকশন"
  );

  const otherItems = incomeTransactions.filter(
    item => getIncomeDisplayCategory(item) === "অন্যান্য কালেকশন"
  );

  const receipt = receiptItems.reduce(
    (sum, item) => sum + getAmount(item), 0
  );

  const village = villageItems.reduce(
    (sum, item) => sum + getAmount(item), 0
  );

  const other = otherItems.reduce(
    (sum, item) => sum + getAmount(item), 0
  );

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

  // Firebase থেকে প্রতিবার নতুন হিসাব এলে বিস্তারিত তালিকাও রিফ্রেশ হবে।
  renderIncomeDetails(
    "receiptIncomeDetails",
    receiptItems
  );

  renderIncomeDetails(
    "villageIncomeDetails",
    villageItems
  );

  renderIncomeDetails(
    "otherIncomeDetails",
    otherItems
  );
}

// ========================================
// 12. SEARCH AND FILTER
// ========================================

function getFilteredTransactions() {
  const search = $("searchInput")?.value
    .trim()
    .toLowerCase() || "";

  const filterType = $("filterType")?.value || "all";

  return transactions.filter(item => {
    const matchesType =
      filterType === "all" ||
      item.type === filterType;

    const searchable = [
      item.person,
      item.description,
      item.category,
      item.date,
      item.amount,
      item.type === "income"
        ? getIncomeDisplayCategory(item)
        : getCategory(item)
    ].join(" ").toLowerCase();

    return matchesType && searchable.includes(search);
  });
}

$("searchInput")?.addEventListener(
  "input",
  renderTransactions
);

$("filterType")?.addEventListener(
  "change",
  renderTransactions
);

// ========================================
// 13. REFRESH
// ========================================

$("refreshBtn")?.addEventListener("click", () => {
  loadTransactions();
});

// ========================================
// 14. RENDER TRANSACTIONS
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
  // INCOME LEDGER
  // শুধু তিনটি বিভাগ দেখাবে
  // --------------------------------------

  incomeContainer.innerHTML = "";

  incomeCategories.forEach(category => {
    const items = incomeTransactions.filter(
      item => getIncomeDisplayCategory(item) === category
    );

    const total = items.reduce(
      (sum, item) => sum + getAmount(item),
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
  <td data-label="তারিখ">
    ${escapeHTML(item.date || "-")}
  </td>

  <td data-label="বিবরণ">
    ${escapeHTML(item.description || "-")}
  </td>

  <td data-label="নাম">
    ${escapeHTML(item.person || "-")}
  </td>

  <td data-label="পরিমাণ">
    ${money(getAmount(item))}
  </td>
                    ${
                      isAdmin
                        ? `<td>
                            <button
                              class="delete-btn"
                              data-id="${escapeHTML(item.id)}"
                              type="button">
                              মুছুন
                            </button>
                          </td>`
                        : ""
                    }
                  </tr>
                `).join("")
                : `
                  <tr>
                    <td colspan="${isAdmin ? 5 : 4}">
                      কোনো তথ্য নেই
                    </td>
                  </tr>
                `
            }
          </tbody>
        </table>
      </div>
    `;

    incomeContainer.appendChild(section);
  });

  // --------------------------------------
  // EXPENSE LEDGER
  // সব ব্যয় একসঙ্গে
  // --------------------------------------

  expenseBody.innerHTML = expenseTransactions.length
    ? expenseTransactions.map(item => `
        <tr>
  <td data-label="তারিখ">
    ${escapeHTML(item.date || "-")}
  </td>

  <td data-label="বিবরণ">
    ${escapeHTML(item.description || "-")}

    <small class="expense-category">
      ${escapeHTML(getCategory(item))}
    </small>
  </td>

  <td data-label="নাম">
    ${escapeHTML(item.person || "-")}
  </td>

  <td data-label="পরিমাণ">
    ${money(getAmount(item))}
  </td>

          ${
            isAdmin
              ? `<td>
                  <button
                    class="delete-btn"
                    data-id="${escapeHTML(item.id)}"
                    type="button">
                    মুছুন
                  </button>
                </td>`
              : ""
          }
        </tr>
      `).join("")
    : `
      <tr>
        <td colspan="${isAdmin ? 5 : 4}">
          কোনো ব্যয়ের তথ্য নেই
        </td>
      </tr>
    `;

  // --------------------------------------
  // ENTRY COUNT
  // --------------------------------------

  if ($("entryCount")) {
    $("entryCount").textContent =
      `মোট ${filtered.length}টি এন্ট্রি`;
  }

  setHidden(
    $("emptyMessage"),
    filtered.length !== 0
  );
}

// ========================================
// 15. ADD TRANSACTION
// ========================================

$("transactionForm")?.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (!isAdmin || !currentUser) {
      showMessage(
        "শুধু অনুমোদিত অ্যাডমিন হিসাব যোগ করতে পারবেন।"
      );
      return;
    }

    const type = $("type")?.value;
    const amount = Number($("amount")?.value);
    const person = $("person")?.value.trim() || "";
    const date = $("date")?.value || "";
    const category = $("category")?.value || "";
    const description =
      $("description")?.value.trim() || "";

    if (!["income", "expense"].includes(type)) {
      showMessage("হিসাবের ধরন নির্বাচন করুন।");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage("সঠিক টাকার পরিমাণ লিখুন।");
      return;
    }

    const allowedCategories =
      type === "income"
        ? incomeCategories
        : expenseCategories;

    if (!allowedCategories.includes(category)) {
      showMessage("সঠিক বিভাগ নির্বাচন করুন।");
      return;
    }

    if (!date || !description) {
      showMessage("তারিখ ও বিবরণ পূরণ করুন।");
      return;
    }

    const submitButton = $("submitBtn");

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "সংরক্ষণ হচ্ছে...";
    }

    try {
      await addDoc(
        collection(db, "transactions"),
        {
          type,
          amount,
          person,
          date,
          category,
          description,
          createdAt: serverTimestamp(),
          createdBy: currentUser.uid
        }
      );

      $("transactionForm").reset();
      updateCategoryOptions();

      showMessage("হিসাব সফলভাবে সংরক্ষণ হয়েছে।");

    } catch (error) {
      console.error("ADD TRANSACTION ERROR:", error);

      showMessage(
        "হিসাব সংরক্ষণ করা যায়নি: " +
        (error.code || error.message)
      );

    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "+ হিসাব সংরক্ষণ করুন";
      }
    }
  }
);

// ========================================
// 16. DELETE TRANSACTION
// ========================================

document.addEventListener("click", async event => {
  const button = event.target.closest?.(".delete-btn");

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

  button.disabled = true;

  try {
    await deleteDoc(doc(db, "transactions", id));

    showMessage("হিসাব সফলভাবে মুছে ফেলা হয়েছে।");

  } catch (error) {
    console.error("DELETE ERROR:", error);

    showMessage(
      "হিসাব মুছে ফেলা যায়নি: " +
      (error.code || error.message)
    );

    button.disabled = false;
  }
});

// ========================================
// 17. AUTH STATE
// ========================================

onAuthStateChanged(auth, async user => {
  const currentCheck = ++authCheckVersion;

  currentUser = user;
  isAdmin = false;

  if (user) {
    setStatus("অ্যাডমিন অনুমোদন যাচাই হচ্ছে...");

    const authorized = await checkAdmin(user);

    // পুরোনো Auth check-এর ফলাফল উপেক্ষা
    if (currentCheck !== authCheckVersion) return;

    if (authorized) {
      currentUser = user;
      isAdmin = true;

      setStatus("অ্যাডমিন হিসেবে সফলভাবে লগইন হয়েছে।");

    } else {
      currentUser = null;
      isAdmin = false;

      await signOut(auth);

      if (currentCheck !== authCheckVersion) return;

      showMessage(
        "এই অ্যাকাউন্টটি অ্যাডমিন হিসেবে অনুমোদিত নয়।"
      );
    }

  } else {
    currentUser = null;
    isAdmin = false;
  }

  updateAdminUI();
});

// ========================================
// 18. INITIALIZATION
// ========================================

updateCategoryOptions();

// লগইন ছাড়াই হিসাব দেখা যাবে
loadTransactions();

console.log("Rahmatia Masjid Accounts initialized.");
