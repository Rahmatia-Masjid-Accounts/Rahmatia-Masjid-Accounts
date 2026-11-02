/* ==========================================
   Rahmatia Masjid Accounts
   Firebase + Firestore
   Category-wise Income & Expense Ledgers
   ========================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp
} from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";


/* 1. Firebase Configuration */

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


/* 2. Application State */

let currentUser = null;
let isAdmin = false;
let transactions = [];
let unsubscribeTransactions = null;
let authCheckVersion = 0;


/* 3. Categories */

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

function getCategory(item) {
  const category = String(item.category || "").trim();

  if (item.type === "income") {
    return incomeCategories.includes(category)
      ? category
      : "অন্যান্য";
  }

  if (item.type === "expense") {
    return expenseCategories.includes(category)
      ? category
      : "অন্যান্য ব্যয়";
  }

  return category || "অন্যান্য";
}


/* 4. HTML Elements */

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("loginEmail");
const passwordInput = document.getElementById("loginPassword");

const adminLoginBtn = document.getElementById("adminLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const adminPanel = document.getElementById("adminPanel");

const loginError = document.getElementById("loginError");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");

const transactionForm = document.getElementById("transactionForm");
const typeInput = document.getElementById("type");
const categoryInput = document.getElementById("category");

const incomeCategoryLedgers =
  document.getElementById("incomeCategoryLedgers");

const expenseCategoryLedgers =
  document.getElementById("expenseCategoryLedgers");

const incomeLedgerTotal =
  document.getElementById("incomeLedgerTotal");

const expenseLedgerTotal =
  document.getElementById("expenseLedgerTotal");

const receiptIncomeElement =
  document.getElementById("receiptIncome");

const villageIncomeElement =
  document.getElementById("villageIncome");

const otherIncomeElement =
  document.getElementById("otherIncome");

const totalIncomeElement =
  document.getElementById("totalIncome");

const totalExpenseElement =
  document.getElementById("totalExpense");

const balanceElement =
  document.getElementById("balance");

const balanceNote =
  document.getElementById("balanceNote");

const statusElement =
  document.getElementById("statusMessage");

const entryCount =
  document.getElementById("entryCount");

const emptyMessage =
  document.getElementById("emptyMessage");

const searchInput =
  document.getElementById("searchInput");

const filterType =
  document.getElementById("filterType");

const refreshBtn =
  document.getElementById("refreshBtn");


/* 5. Helper Functions */

function setHidden(element, hidden) {
  if (!element) return;

  element.hidden = hidden;
  element.classList.toggle("hidden", hidden);
}

function showStatus(message, isError = false) {
  if (!statusElement) {
    console.log(message);
    return;
  }

  statusElement.textContent = message;
  statusElement.style.color = isError ? "#c62828" : "#18794e";
}

function showLoginError(message) {
  if (loginError) {
    loginError.textContent = message;
  }
}

function formatMoney(amount) {
  return "৳ " + Number(amount || 0).toLocaleString("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}


/* 6. Admin Permission Check */

async function checkAdminPermission(user) {
  const adminRef = doc(db, "admins", user.uid);
  const adminSnapshot = await getDoc(adminRef);

  return (
    adminSnapshot.exists() &&
    adminSnapshot.data().role === "admin"
  );
}


/* 7. Dynamic Category Options */

function updateCategoryOptions() {
  if (!typeInput || !categoryInput) return;

  const selectedType = typeInput.value;

  const categories = selectedType === "expense"
    ? expenseCategories
    : incomeCategories;

  categoryInput.innerHTML = categories.map((category) => {
    const label = category === "অন্যান্য"
      ? "অন্যান্য আয়"
      : category;

    return `
      <option value="${escapeHTML(category)}">
        ${escapeHTML(label)}
      </option>
    `;
  }).join("");
}

if (typeInput) {
  typeInput.addEventListener("change", updateCategoryOptions);
}

updateCategoryOptions();


/* 8. Admin Login */

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showLoginError("");

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showLoginError("ইমেইল ও পাসওয়ার্ড লিখুন।");
      return;
    }

    try {
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = "যাচাই হচ্ছে...";
      }

      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const allowed = await checkAdminPermission(credential.user);

      if (!allowed) {
        await signOut(auth);

        showLoginError(
          "এই অ্যাকাউন্ট Admin নয়। Firebase-এর admins collection পরীক্ষা করুন।"
        );
        return;
      }

      if (passwordInput) {
        passwordInput.value = "";
      }

      showStatus("Admin লগইন সফল।");

    } catch (error) {
      console.error("Login error:", error);

      const messages = {
        "auth/invalid-credential":
          "ইমেইল অথবা পাসওয়ার্ড ভুল।",

        "auth/invalid-email":
          "সঠিক ইমেইল ঠিকানা লিখুন।",

        "auth/too-many-requests":
          "অনেকবার চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।",

        "auth/network-request-failed":
          "ইন্টারনেট সংযোগ পরীক্ষা করুন।",

        "permission-denied":
          "Admin অনুমতি যাচাই করা যায়নি।"
      };

      showLoginError(
        messages[error.code] ||
        `লগইন ব্যর্থ: ${error.code || error.message}`
      );

    } finally {
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = "লগইন করুন";
      }
    }
  });
}


/* 9. Admin Logout */

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showStatus("লগআউট সফল।");

    } catch (error) {
      console.error("Logout error:", error);
      showStatus("লগআউট করা যায়নি।", true);
    }
  });
}


/* 10. Load Transactions */

function loadTransactions() {
  if (unsubscribeTransactions) {
    unsubscribeTransactions();
    unsubscribeTransactions = null;
  }

  unsubscribeTransactions = onSnapshot(
    collection(db, "transactions"),

    (snapshot) => {
      transactions = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      transactions.sort((a, b) => {
        const dateA = String(a.date || "");
        const dateB = String(b.date || "");

        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }

        return (
          (b.createdAt?.seconds || 0) -
          (a.createdAt?.seconds || 0)
        );
      });

      renderTotals();
      renderTransactions();

      showStatus("আয়-ব্যয়ের হিসাব আপডেট হয়েছে।");
    },

    (error) => {
      console.error("Firestore read error:", error);

      showStatus(
        `হিসাব লোড হয়নি: ${error.code || error.message}`,
        true
      );
    }
  );
}


/* 11. Calculate All Financial Totals */

function renderTotals() {
  const incomeItems = transactions.filter(
    item => item.type === "income"
  );

  const expenseItems = transactions.filter(
    item => item.type === "expense"
  );

  const sum = items => items.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  const income = sum(incomeItems);
  const expense = sum(expenseItems);
  const balance = income - expense;

  const receipt = sum(
    incomeItems.filter(item => getCategory(item) === "রশিদ বাবদ")
  );

  const village = sum(
    incomeItems.filter(item => getCategory(item) === "গ্রাম কালেকশন")
  );

  const other = sum(
    incomeItems.filter(item => getCategory(item) === "অন্যান্য")
  );

  if (totalIncomeElement) {
    totalIncomeElement.textContent = formatMoney(income);
  }

  if (totalExpenseElement) {
    totalExpenseElement.textContent = formatMoney(expense);
  }

  if (balanceElement) {
    balanceElement.textContent = formatMoney(balance);
  }

  if (receiptIncomeElement) {
    receiptIncomeElement.textContent = formatMoney(receipt);
  }

  if (villageIncomeElement) {
    villageIncomeElement.textContent = formatMoney(village);
  }

  if (otherIncomeElement) {
    otherIncomeElement.textContent = formatMoney(other);
  }

  if (balanceNote) {
    balanceNote.textContent = balance < 0
      ? "ব্যয়ের পরিমাণ আয়ের চেয়ে বেশি"
      : "আয় থেকে ব্যয় বাদ দিয়ে";
  }
}


/* 12. Search and Filter */

function getFilteredTransactions() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const selectedType = filterType?.value || "all";

  return transactions.filter((item) => {
    const matchesType =
      selectedType === "all" || item.type === selectedType;

    const searchableText = [
      item.person,
      item.category,
      item.description,
      item.date
    ].join(" ").toLowerCase();

    return matchesType && searchableText.includes(query);
  });
}


/* 13. Create a Category Ledger Table */

function renderCategoryTable(items, category, type) {
  const isIncome = type === "income";
  const colspan = isAdmin ? 5 : 4;

  const rows = items.length
    ? items.map((item) => {
        const date = escapeHTML(item.date || "—");
        const description = escapeHTML(item.description || "—");
        const person = escapeHTML(item.person || "—");
        const amount = formatMoney(item.amount);

        const deleteCell = isAdmin
          ? `<td>
               <button
                 type="button"
                 class="delete-btn"
                 data-delete-id="${escapeHTML(item.id)}">
                 মুছুন
               </button>
             </td>`
          : "";

        return `
          <tr>
            <td>${date}</td>
            <td>
              <strong>${description}</strong>
            </td>
            <td>${person}</td>
            <td class="amount-column ${isIncome ? "income" : "expense"}">
              <strong>${isIncome ? "+" : "−"}${amount}</strong>
            </td>
            ${deleteCell}
          </tr>
        `;
      }).join("")
    : `
        <tr>
          <td colspan="${colspan}" class="empty-state">
            এই বিভাগে কোনো হিসাব পাওয়া যায়নি।
          </td>
        </tr>
      `;

  const total = items.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  return `
    <section class="category-ledger">
      <div class="ledger-subheading">
        <h4>${escapeHTML(category)}</h4>
        <span>মোট: ${formatMoney(total)}</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">তারিখ</th>
              <th scope="col">বিবরণ</th>
              <th scope="col">নাম</th>
              <th scope="col" class="amount-column">পরিমাণ</th>
              ${isAdmin ? '<th scope="col">অ্যাকশন</th>' : ""}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}


/* 14. Render All Category Ledgers */

function renderTransactions() {
  if (!incomeCategoryLedgers || !expenseCategoryLedgers) {
    console.error(
      "incomeCategoryLedgers অথবা expenseCategoryLedgers পাওয়া যায়নি। index.html পরীক্ষা করুন।"
    );
    return;
  }

  const filtered = getFilteredTransactions();

  const incomeItems = filtered.filter(
    item => item.type === "income"
  );

  const expenseItems = filtered.filter(
    item => item.type === "expense"
  );

  if (entryCount) {
    entryCount.textContent = `${filtered.length}টি এন্ট্রি`;
  }

  setHidden(emptyMessage, filtered.length > 0);

  incomeCategoryLedgers.innerHTML = incomeCategories.map(category => {
    const items = incomeItems.filter(
      item => getCategory(item) === category
    );

    return renderCategoryTable(items, category, "income");
  }).join("");

  expenseCategoryLedgers.innerHTML = expenseCategories.map(category => {
    const items = expenseItems.filter(
      item => getCategory(item) === category
    );

    return renderCategoryTable(items, category, "expense");
  }).join("");

  // Ledger totals show all records, not only search results.
  const allIncome = transactions
    .filter(item => item.type === "income")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const allExpense = transactions
    .filter(item => item.type === "expense")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  if (incomeLedgerTotal) {
    incomeLedgerTotal.textContent =
      `মোট আয়: ${formatMoney(allIncome)}`;
  }

  if (expenseLedgerTotal) {
    expenseLedgerTotal.textContent =
      `মোট ব্যয়: ${formatMoney(allExpense)}`;
  }
}


/* 15. Add Transaction — Admin Only */

if (transactionForm) {
  transactionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !isAdmin) {
      showStatus("হিসাব যোগ করতে Admin লগইন প্রয়োজন।", true);
      return;
    }

    const type = typeInput?.value;
    const amount = Number(
      document.getElementById("amount")?.value
    );

    const date = document.getElementById("date")?.value;

    const person =
      document.getElementById("person")?.value.trim() || "";

    const category = categoryInput?.value;

    const description =
      document.getElementById("description")?.value.trim();

    const validCategories = type === "income"
      ? incomeCategories
      : expenseCategories;

    if (!["income", "expense"].includes(type)) {
      showStatus("হিসাবের ধরন নির্বাচন করুন।", true);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showStatus("সঠিক টাকার পরিমাণ লিখুন।", true);
      return;
    }

    if (!date || !category || !description) {
      showStatus("প্রয়োজনীয় সব তথ্য পূরণ করুন।", true);
      return;
    }

    if (!validCategories.includes(category)) {
      showStatus("সঠিক বিভাগ নির্বাচন করুন।", true);
      return;
    }

    const submitBtn = document.getElementById("submitBtn");

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "সংরক্ষণ হচ্ছে...";
      }

      await addDoc(collection(db, "transactions"), {
        type,
        amount,
        date,
        person,
        category,
        description,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      });

      transactionForm.reset();
      updateCategoryOptions();

      showStatus("নতুন হিসাব সফলভাবে যোগ হয়েছে।");

    } catch (error) {
      console.error("Add transaction error:", error);

      showStatus(
        `হিসাব যোগ হয়নি: ${error.code || error.message}`,
        true
      );

    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "+ হিসাব সংরক্ষণ করুন";
      }
    }
  });
}


/* 16. Delete Transaction — Admin Only */

function handleDeleteClick(event) {
  const button = event.target.closest("[data-delete-id]");

  if (!button) return;

  deleteTransaction(button);
}

async function deleteTransaction(button) {
  if (!currentUser || !isAdmin) {
    showStatus("হিসাব মুছতে Admin লগইন প্রয়োজন।", true);
    return;
  }

  const transactionId = button.dataset.deleteId;

  if (!transactionId) return;

  if (!confirm("তুমি কি এই হিসাবটি মুছতে চাও?")) {
    return;
  }

  try {
    button.disabled = true;

    await deleteDoc(
      doc(db, "transactions", transactionId)
    );

    showStatus("হিসাব মুছে ফেলা হয়েছে।");

  } catch (error) {
    console.error("Delete transaction error:", error);

    showStatus(
      `হিসাব মোছা যায়নি: ${error.code || error.message}`,
      true
    );

    button.disabled = false;
  }
}

if (incomeCategoryLedgers) {
  incomeCategoryLedgers.addEventListener("click", handleDeleteClick);
}

if (expenseCategoryLedgers) {
  expenseCategoryLedgers.addEventListener("click", handleDeleteClick);
}


/* 17. Search, Filter and Refresh */

if (searchInput) {
  searchInput.addEventListener("input", renderTransactions);
}

if (filterType) {
  filterType.addEventListener("change", renderTransactions);
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    renderTotals();
    renderTransactions();
    showStatus("হিসাব রিফ্রেশ করা হয়েছে।");
  });
}


/* 18. Authentication State */

onAuthStateChanged(auth, async (user) => {
  const version = ++authCheckVersion;

  currentUser = user;
  isAdmin = false;

  setHidden(adminPanel, true);
  setHidden(adminLoginBtn, Boolean(user));
  setHidden(logoutBtn, true);

  loadTransactions();

  if (!user) {
    showStatus(
      "সবার জন্য আয়-ব্যয়ের হিসাব দেখানো হচ্ছে। নতুন হিসাব যোগ করতে Admin লগইন করুন।"
    );

    renderTransactions();
    return;
  }

  try {
    const allowed = await checkAdminPermission(user);

    if (version !== authCheckVersion) return;

    if (!allowed) {
      showStatus("এই অ্যাকাউন্টের Admin অনুমতি নেই।", true);
      await signOut(auth);
      return;
    }

    isAdmin = true;

    setHidden(adminPanel, false);
    setHidden(adminLoginBtn, true);
    setHidden(logoutBtn, false);

    renderTransactions();
    showStatus("Admin লগইন সফল।");

  } catch (error) {
    console.error("Admin verification error:", error);

    if (version !== authCheckVersion) return;

    isAdmin = false;
    setHidden(adminPanel, true);

    showStatus(
      `Admin যাচাই ব্যর্থ: ${error.code || error.message}`,
      true
    );
  }
});


/* 19. Initial Display */

renderTotals();
renderTransactions();

console.log(
  "Rahmatia Masjid Accounts: Category-wise ledger loaded successfully."
);
