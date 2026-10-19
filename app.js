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
  apiKey: "AIzaSyDwTC0C3b1NE2CAIrs4FZjuCXLA2VtPDC-YE",
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

/* 3. HTML Elements
   HTML-এ এই ID-গুলো থাকতে হবে।
*/

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const adminLoginBtn = document.getElementById("adminLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const adminPanel = document.getElementById("adminPanel");

const transactionForm =
  document.getElementById("transactionForm");

const transactionList =
  document.getElementById("transactionList");

const totalIncomeElement =
  document.getElementById("totalIncome");

const totalExpenseElement =
  document.getElementById("totalExpense");

const balanceElement =
  document.getElementById("balance");

const statusElement =
  document.getElementById("status");

/* 4. Helper Functions */

function setHidden(element, hidden) {
  if (element) {
    element.hidden = hidden;
  }
}

function showStatus(message, isError = false) {
  if (!statusElement) {
    console.log(message);
    return;
  }

  statusElement.textContent = message;
  statusElement.style.color = isError ? "#c62828" : "#18794e";
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString("en-BD", {
    maximumFractionDigits: 2
  }) + " ৳";
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

/* 5. Check Admin Permission */

async function checkAdminPermission(user) {
  const adminRef = doc(db, "admins", user.uid);
  const adminSnapshot = await getDoc(adminRef);

  return adminSnapshot.exists() &&
    adminSnapshot.data().role === "admin";
}

/* 6. Login */

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showStatus("ইমেইল ও পাসওয়ার্ড লিখো।", true);
      return;
    }

    try {
      showStatus("লগইন যাচাই হচ্ছে...");

      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const allowed = await checkAdminPermission(credential.user);

      if (!allowed) {
        await signOut(auth);
        showStatus(
          "এই অ্যাকাউন্ট Admin নয়। admins collection-এ UID ও role পরীক্ষা করো।",
          true
        );
        return;
      }

      showStatus("Admin লগইন সফল।");
      if (passwordInput) passwordInput.value = "";

    } catch (error) {
      console.error("Login error:", error);
      showStatus(
        `লগইন ব্যর্থ: ${error.code || error.message}`,
        true
      );
    }
  });
}

/* 7. Logout */

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

/* 8. Load Public Transactions
   সবাই হিসাব দেখতে পারবে।
   Firestore Rules-এ public read অনুমোদিত থাকতে হবে।
*/

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

/* 9. Calculate Income, Expense and Balance */

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
}

/* 10. Display Transaction List */

function renderTransactions() {
  if (!transactionList) return;

  if (transactions.length === 0) {
    transactionList.innerHTML =
      '<p class="empty-message">এখনো কোনো হিসাব যোগ করা হয়নি।</p>';
    return;
  }

  transactionList.innerHTML = transactions.map((item) => {
    const isIncome = item.type === "income";
    const typeText = isIncome ? "আয়" : "ব্যয়";
    const amountClass = isIncome ? "income" : "expense";

    const date = escapeHTML(item.date || "তারিখ নেই");
    const category = escapeHTML(item.category || typeText);
    const description = escapeHTML(item.description || "—");
    const amount = formatMoney(item.amount);

    const deleteButton = isAdmin
      ? `<button type="button"
          class="delete-btn"
          data-delete-id="${escapeHTML(item.id)}">
          মুছুন
        </button>`
      : "";

    return `
      <article class="transaction-item">
        <div class="transaction-details">
          <strong>${category}</strong>
          <p>${description}</p>
          <small>${date}</small>
        </div>

        <div class="transaction-amount ${amountClass}">
          <strong>${isIncome ? "+" : "−"}${amount}</strong>
          <span>${typeText}</span>
          ${deleteButton}
        </div>
      </article>
    `;
  }).join("");
}

/* 11. Add Transaction — Admin Only */

if (transactionForm) {
  transactionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || !isAdmin) {
      showStatus("হিসাব যোগ করতে Admin লগইন প্রয়োজন।", true);
      return;
    }

    const formData = new FormData(transactionForm);

    const type = String(formData.get("type") || "");
    const amount = Number(formData.get("amount"));
    const date = String(formData.get("date") || "");
    const category = String(formData.get("category") || "").trim();
    const description =
      String(formData.get("description") || "").trim();

    if (!["income", "expense"].includes(type)) {
      showStatus("হিসাবের ধরন নির্বাচন করো।", true);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showStatus("সঠিক টাকার পরিমাণ লিখো।", true);
      return;
    }

    if (!date) {
      showStatus("তারিখ নির্বাচন করো।", true);
      return;
    }

    try {
      await addDoc(collection(db, "transactions"), {
        type,
        amount,
        date,
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
    }
  });
}

/* 12. Delete Transaction — Admin Only */

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
      await deleteDoc(doc(db, "transactions", transactionId));
      showStatus("হিসাব মুছে ফেলা হয়েছে।");

    } catch (error) {
      console.error("Delete transaction error:", error);
      showStatus(
        `হিসাব মোছা যায়নি: ${error.code || error.message}`,
        true
      );
    }
  });
}

/* 13. Authentication State
   লগইন ছাড়াও হিসাব লোড হবে।
*/

onAuthStateChanged(auth, async (user) => {
  const version = ++authCheckVersion;

  currentUser = user;
  isAdmin = false;

  setHidden(adminPanel, true);
  setHidden(adminLoginBtn, Boolean(user));
  setHidden(logoutBtn, true);

  // আগের Firestore listener বন্ধ করে নতুনটি চালু করা
  loadTransactions();

  if (!user) {
    showStatus(
      "সবার জন্য আয়-ব্যয়ের হিসাব দেখানো হচ্ছে। নতুন হিসাব যোগ করতে Admin লগইন করো।"
    );
    return;
  }

  try {
    const allowed = await checkAdminPermission(user);

    // এর মধ্যে নতুন auth state এলে পুরোনো ফল উপেক্ষা করো
    if (version !== authCheckVersion) return;

    if (!allowed) {
      showStatus(
        "এই অ্যাকাউন্টের Admin অনুমতি নেই।",
        true
      );
       const loginDialog = document.getElementById("loginDialog");
const closeLoginBtn = document.getElementById("closeLoginBtn");
const loginError = document.getElementById("loginError");

if (adminLoginBtn && loginDialog) {
  adminLoginBtn.addEventListener("click", () => {
    if (typeof loginDialog.showModal === "function") {
      loginDialog.showModal();
    } else {
      loginDialog.setAttribute("open", "");
    }
  });
}

if (closeLoginBtn && loginDialog) {
  closeLoginBtn.addEventListener("click", () => {
    loginDialog.close();
  });
}

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
  }
});

/* 14. Initial Display */

renderTotals();
renderTransactions();
const loginDialog = document.getElementById("loginDialog");
const closeLoginBtn = document.getElementById("closeLoginBtn");

if (adminLoginBtn && loginDialog) {
  adminLoginBtn.onclick = () => {
    if (!loginDialog.open) {
      loginDialog.showModal();
    }
  };
}

if (closeLoginBtn && loginDialog) {
  closeLoginBtn.onclick = () => {
    loginDialog.close();
  };
}
