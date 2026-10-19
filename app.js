/* ==========================================
   Rahmatia Masjid Accounts
   Firebase + Firestore
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


/* 2. Application State */

let currentUser = null;
let isAdmin = false;
let transactions = [];
let unsubscribeTransactions = null;
let authCheckVersion = 0;


/* 3. HTML Elements */

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("loginEmail");
const passwordInput = document.getElementById("loginPassword");

const adminLoginBtn = document.getElementById("adminLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const adminPanel = document.getElementById("adminPanel");

const loginDialog = document.getElementById("loginDialog");
const closeLoginBtn = document.getElementById("closeLoginBtn");
const loginError = document.getElementById("loginError");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");

const transactionForm = document.getElementById("transactionForm");
const transactionList = document.getElementById("transactionList");
const actionHeader = document.getElementById("actionHeader");

const totalIncomeElement = document.getElementById("totalIncome");
const totalExpenseElement = document.getElementById("totalExpense");
const balanceElement = document.getElementById("balance");
const balanceNote = document.getElementById("balanceNote");

const statusElement = document.getElementById("statusMessage");
const entryCount = document.getElementById("entryCount");
const emptyMessage = document.getElementById("emptyMessage");

const searchInput = document.getElementById("searchInput");
const filterType = document.getElementById("filterType");
const refreshBtn = document.getElementById("refreshBtn");


/* 4. Helper Functions */

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


/* 5. Admin Permission Check */

async function checkAdminPermission(user) {
  const adminRef = doc(db, "admins", user.uid);
  const adminSnapshot = await getDoc(adminRef);

  return adminSnapshot.exists() &&
    adminSnapshot.data().role === "admin";
}


/* 6. Open and Close Login Dialog */

if (adminLoginBtn && loginDialog) {
  adminLoginBtn.addEventListener("click", () => {
    showLoginError("");

    if (!loginDialog.open) {
      loginDialog.showModal();
    }
  });
}

if (closeLoginBtn && loginDialog) {
  closeLoginBtn.addEventListener("click", () => {
    loginDialog.close();
  });
}


/* 7. Admin Login */

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showLoginError("");

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showLoginError("ইমেইল ও পাসওয়ার্ড লিখো।");
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
          "এই অ্যাকাউন্ট Admin নয়। Firebase admins collection-এ UID ও role পরীক্ষা করো।"
        );
        return;
      }

      if (passwordInput) passwordInput.value = "";

      if (loginDialog?.open) {
        loginDialog.close();
      }

      showStatus("Admin লগইন সফল।");

    } catch (error) {
      console.error("Login error:", error);

      const messages = {
        "auth/invalid-credential": "ইমেইল অথবা পাসওয়ার্ড ভুল।",
        "auth/invalid-email": "সঠিক ইমেইল ঠিকানা লিখো।",
        "auth/too-many-requests": "অনেকবার চেষ্টা হয়েছে। পরে আবার চেষ্টা করো।",
        "auth/network-request-failed": "ইন্টারনেট সংযোগ পরীক্ষা করো।",
        "permission-denied": "Admin অনুমতি যাচাই করা যায়নি। Firestore Rules পরীক্ষা করো।"
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


/* 8. Admin Logout */

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


/* 9. Load Public Transactions */

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

        return (b.createdAt?.seconds || 0) -
          (a.createdAt?.seconds || 0);
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


/* 10. Calculate Financial Summary */

function renderTotals() {
  const income = transactions.reduce((sum, item) => {
    return sum + (
      item.type === "income" ? Number(item.amount || 0) : 0
    );
  }, 0);

  const expense = transactions.reduce((sum, item) => {
    return sum + (
      item.type === "expense" ? Number(item.amount || 0) : 0
    );
  }, 0);

  const balance = income - expense;

  if (totalIncomeElement) {
    totalIncomeElement.textContent = formatMoney(income);
  }

  if (totalExpenseElement) {
    totalExpenseElement.textContent = formatMoney(expense);
  }

  if (balanceElement) {
    balanceElement.textContent = formatMoney(balance);
  }

  if (balanceNote) {
    balanceNote.textContent = balance < 0
      ? "ব্যয়ের পরিমাণ আয়ের চেয়ে বেশি"
      : "আয় থেকে ব্যয় বাদ দিয়ে";
  }
}


/* 11. Search and Filter */

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

    const matchesSearch = searchableText.includes(query);

    return matchesType && matchesSearch;
  });
}


/* 12. Render Transaction Table */

function renderTransactions() {
  if (!transactionList) return;

  const filtered = getFilteredTransactions();

  if (entryCount) {
    entryCount.textContent = `${filtered.length}টি এন্ট্রি`;
  }

  setHidden(actionHeader, !isAdmin);

  if (filtered.length === 0) {
    transactionList.innerHTML = `
      <tr>
        <td colspan="${isAdmin ? 6 : 5}" class="empty-state">
          কোনো হিসাব পাওয়া যায়নি।
        </td>
      </tr>
    `;

    setHidden(emptyMessage, true);
    return;
  }

  setHidden(emptyMessage, true);

  transactionList.innerHTML = filtered.map((item) => {
    const isIncome = item.type === "income";
    const typeText = isIncome ? "আয়" : "ব্যয়";
    const amountClass = isIncome ? "income" : "expense";

    const date = escapeHTML(item.date || "—");
    const description = escapeHTML(item.description || "—");
    const person = escapeHTML(item.person || "—");
    const category = escapeHTML(item.category || typeText);
    const amount = formatMoney(item.amount);

    const deleteButton = isAdmin
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
          <br>
          <small>${category}</small>
        </td>

        <td>${person}</td>

        <td>
          <span class="${amountClass}">${typeText}</span>
        </td>

        <td class="amount-column ${amountClass}">
          <strong>${isIncome ? "+" : "−"}${amount}</strong>
        </td>

        ${deleteButton}
      </tr>
    `;
  }).join("");
}


/* 13. Add Transaction — Admin Only */

if (transactionForm) {
  transactionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !isAdmin) {
      showStatus("হিসাব যোগ করতে Admin লগইন প্রয়োজন।", true);
      return;
    }

    const type = document.getElementById("type")?.value;
    const amount = Number(
      document.getElementById("amount")?.value
    );
    const date = document.getElementById("date")?.value;
    const person = document.getElementById("person")?.value.trim() || "";
    const category = document.getElementById("category")?.value;
    const description =
      document.getElementById("description")?.value.trim();

    if (!["income", "expense"].includes(type)) {
      showStatus("হিসাবের ধরন নির্বাচন করো।", true);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showStatus("সঠিক টাকার পরিমাণ লিখো।", true);
      return;
    }

    if (!date || !category || !description) {
      showStatus("প্রয়োজনীয় সব তথ্য পূরণ করো।", true);
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


/* 14. Delete Transaction — Admin Only */

if (transactionList) {
  transactionList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-id]");

    if (!button) return;

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
  });
}


/* 15. Search and Filter Events */

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
    showStatus("দেখানো হিসাব রিফ্রেশ করা হয়েছে।");
  });
}


/* 16. Authentication State */

onAuthStateChanged(auth, async (user) => {
  const version = ++authCheckVersion;

  currentUser = user;
  isAdmin = false;

  setHidden(adminPanel, true);
  setHidden(adminLoginBtn, Boolean(user));
  setHidden(logoutBtn, true);

  // লগইন ছাড়াই প্রকাশিত হিসাব লোড হবে
  loadTransactions();

  if (!user) {
    showStatus(
      "সবার জন্য আয়-ব্যয়ের হিসাব দেখানো হচ্ছে। নতুন হিসাব যোগ করতে Admin লগইন করো।"
    );

    renderTransactions();
    return;
  }

  try {
    const allowed = await checkAdminPermission(user);

    if (version !== authCheckVersion) return;

    if (!allowed) {
      showStatus(
        "এই অ্যাকাউন্টের Admin অনুমতি নেই।",
        true
      );

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

    showStatus(
      `Admin যাচাই ব্যর্থ: ${error.code || error.message}`,
      true
    );

    // যাচাই ব্যর্থ হলে Admin সুবিধা বন্ধ থাকবে
    isAdmin = false;
    setHidden(adminPanel, true);
    renderTransactions();
  }
});


/* 17. Initial Display */

renderTotals();
renderTransactions();
