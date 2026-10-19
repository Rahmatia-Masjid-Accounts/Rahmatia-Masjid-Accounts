/* =====================================================
   Rahmatia Masjid Accounts
   Firebase Authentication + Firestore
   GitHub Pages compatible
   ===================================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

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


/* 1. Firebase Configuration */

const firebaseConfig = {
  apiKey: "AIzaSyDw0TCb1NE2CAIrs4FZjuCXLA2VtPDC-YE",
  authDomain: "rahmatia-masjid-accounts.firebaseapp.com",
  projectId: "rahmatia-masjid-accounts",
  storageBucket: "rahmatia-masjid-accounts.firebasestorage.app",
  messagingSenderId: "229600290304",
  appId: "1:229600290304:web:79ac7f54da968badc21ae5"
};


/* 2. Initialize Firebase */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* 3. HTML Elements */

const $ = (id) => document.getElementById(id);

const adminLoginBtn = $("adminLoginBtn");
const refreshBtn = $("refreshBtn");
const logoutBtn = $("logoutBtn");

const adminPanel = $("adminPanel");
const transactionForm = $("transactionForm");

const typeInput = $("type");
const amountInput = $("amount");
const personInput = $("person");
const dateInput = $("date");
const categoryInput = $("category");
const descriptionInput = $("description");

const submitBtn = $("submitBtn");
const statusMessage = $("statusMessage");

const totalIncome = $("totalIncome");
const totalExpense = $("totalExpense");
const balanceElement = $("balance");
const balanceNote = $("balanceNote");

const entryCount = $("entryCount");
const searchInput = $("searchInput");
const filterType = $("filterType");
const transactionList = $("transactionList");
const actionHeader = $("actionHeader");
const emptyMessage = $("emptyMessage");

const loginDialog = $("loginDialog");
const loginForm = $("loginForm");
const closeLoginBtn = $("closeLoginBtn");
const loginEmail = $("loginEmail");
const loginPassword = $("loginPassword");
const loginError = $("loginError");
const loginSubmitBtn = $("loginSubmitBtn");


/* 4. Application State */

let currentUser = null;
let isAdmin = false;
let transactions = [];
let unsubscribeTransactions = null;
let authCheckVersion = 0;


/* 5. Helpers */

function showStatus(message, isError = false) {
  if (!statusMessage) return;

  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "#dc2626" : "#166534";
}

function showLoginError(message) {
  if (loginError) {
    loginError.textContent = message;
  }
}

function setHidden(element, hidden) {
  if (element) {
    element.classList.toggle("hidden", hidden);
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatMoney(value) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset)
    .toISOString()
    .slice(0, 10);
}

function friendlyAuthError(error) {
  const code = error?.code || "unknown";

  const messages = {
    "auth/invalid-email":
      "ইমেইল ঠিকানাটি সঠিক নয়।",

    "auth/invalid-credential":
      "ইমেইল বা পাসওয়ার্ড সঠিক নয়।",

    "auth/wrong-password":
      "পাসওয়ার্ড সঠিক নয়।",

    "auth/user-not-found":
      "এই ইমেইলে Firebase অ্যাকাউন্ট পাওয়া যায়নি।",

    "auth/too-many-requests":
      "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো।",

    "auth/network-request-failed":
      "ইন্টারনেট সংযোগ পরীক্ষা করো।",

    "auth/unauthorized-domain":
      "Firebase Authentication-এর Authorized domains-এ ওয়েবসাইটের ডোমেইন যোগ করতে হবে।",

    "auth/operation-not-allowed":
      "Firebase Console-এ Email/Password sign-in চালু করতে হবে.",

    "auth/invalid-api-key":
      "Firebase API key সঠিক নয়। app.js-এর Config পরীক্ষা করো।",

    "auth/user-disabled":
      "এই Firebase অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে।"
  };

  return `${messages[code] || "লগইন ব্যর্থ হয়েছে। নিচের Error Code দেখে সমস্যা শনাক্ত করো।"} (Error: ${code})`;
}


/* 6. Login Dialog */

adminLoginBtn?.addEventListener("click", () => {
  showLoginError("");

  if (loginDialog?.showModal) {
    loginDialog.showModal();
  } else {
    showStatus("Login dialog পাওয়া যায়নি। index.html পরীক্ষা করো।", true);
  }
});

closeLoginBtn?.addEventListener("click", () => {
  loginDialog?.close();
});

loginDialog?.addEventListener("click", (event) => {
  if (event.target === loginDialog) {
    loginDialog.close();
  }
});


/* 7. Check Admin Permission */

async function checkAdminPermission(user) {
  const adminRef = doc(db, "admins", user.uid);
  const adminSnapshot = await getDoc(adminRef);

  return (
    adminSnapshot.exists() &&
    adminSnapshot.data()?.role === "admin"
  );
}


/* 8. Login */

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  showLoginError("");

  const email = loginEmail?.value.trim();
  const password = loginPassword?.value;

  if (!email || !password) {
    showLoginError("ইমেইল ও পাসওয়ার্ড লিখো।");
    return;
  }

  if (loginSubmitBtn) {
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = "লগইন হচ্ছে...";
  }

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const allowed = await checkAdminPermission(credential.user);

    if (!allowed) {
      await signOut(auth);

      showLoginError(
        "লগইন পরিচয় যাচাই হয়েছে, কিন্তু এই অ্যাকাউন্ট অ্যাডমিন নয়। " +
        "Firestore-এর admins collection-এ UID ও role পরীক্ষা করো।"
      );

      return;
    }

    loginDialog?.close();
    loginForm.reset();

    showStatus("অ্যাডমিন হিসেবে লগইন সফল হয়েছে।");

  } catch (error) {
    console.error("Firebase login error:", error);

    showLoginError(friendlyAuthError(error));
  } finally {
    if (loginSubmitBtn) {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = "লগইন";
    }
  }
});


/* 9. Logout */

logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showStatus("সফলভাবে লগআউট হয়েছে।");
  } catch (error) {
    console.error("Logout error:", error);
    showStatus("লগআউট ব্যর্থ হয়েছে।", true);
  }
});


/* 10. Listen for Authentication Changes */

onAuthStateChanged(auth, async (user) => {
  const version = ++authCheckVersion;

  currentUser = user;
  isAdmin = false;

  setHidden(adminPanel, true);
  setHidden(adminLoginBtn, Boolean(user));
  setHidden(logoutBtn, true);

  if (unsubscribeTransactions) {
    unsubscribeTransactions();
    unsubscribeTransactions = null;
  }

  if (!user) {
    transactions = [];
    renderTransactions();
    renderTotals();

    showStatus("হিসাব দেখতে পারবে। নতুন হিসাব যোগ করতে অ্যাডমিন লগইন করো।");
    return;
  }

  try {
    const allowed = await checkAdminPermission(user);

    if (version !== authCheckVersion) return;

    if (!allowed) {
      showStatus(
        "এই অ্যাকাউন্টের অ্যাডমিন অনুমতি নেই। admins collection পরীক্ষা করো।",
        true
      );

      await signOut(auth);
      return;
    }

    isAdmin = true;

    setHidden(adminPanel, false);
    setHidden(adminLoginBtn, true);
    setHidden(logoutBtn, false);

    showStatus("অ্যাডমিন লগইন সফল।");

    loadTransactions();

  } catch (error) {
    console.error("Admin verification error:", error);

    showStatus(
      `অ্যাডমিন যাচাই ব্যর্থ: ${error.code || error.message}`,
      true
    );
  }
});


/* 11. Load Transactions */

function loadTransactions() {
  if (unsubscribeTransactions) {
    unsubscribeTransactions();
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
      showStatus("হিসাব আপডেট হয়েছে।");
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


/* 12. Calculate Income, Expense and Balance */

function renderTotals() {
  const income = transactions.reduce((sum, item) => {
    return item.type === "income"
      ? sum + (Number(item.amount) || 0)
      : sum;
  }, 0);

  const expense = transactions.reduce((sum, item) => {
    return item.type === "expense"
      ? sum + (Number(item.amount) || 0)
      : sum;
  }, 0);

  const balance = income - expense;

  if (totalIncome) {
    totalIncome.textContent = formatMoney(income);
  }

  if (totalExpense) {
    totalExpense.textContent = formatMoney(expense);
  }

  if (balanceElement) {
    balanceElement.textContent = formatMoney(balance);
  }

  if (balanceNote) {
    balanceNote.textContent =
      balance < 0
        ? "ব্যয়ের পরিমাণ আয়ের চেয়ে বেশি।"
        : "মোট আয় থেকে মোট ব্যয় বাদ দিয়ে হিসাব করা হয়েছে।";
  }
}


/* 13. Render Transaction Table */

function renderTransactions() {
  if (!transactionList) return;

  const query = (searchInput?.value || "").trim().toLowerCase();
  const selectedType = filterType?.value || "all";

  const filtered = transactions.filter((item) => {
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

  if (entryCount) {
    entryCount.textContent = `${filtered.length}টি হিসাব`;
  }

  if (actionHeader) {
    actionHeader.classList.toggle("hidden", !isAdmin);
  }

  if (filtered.length === 0) {
    transactionList.innerHTML = "";
    setHidden(emptyMessage, false);
    return;
  }

  setHidden(emptyMessage, true);

  transactionList.innerHTML = filtered.map((item) => {
    const isIncome = item.type === "income";

    return `
      <tr>
        <td>${escapeHTML(item.date || "—")}</td>
        <td>${escapeHTML(item.category || "অন্যান্য")}</td>
        <td>${escapeHTML(item.description || "—")}</td>
        <td>${escapeHTML(item.person || "—")}</td>
        <td>
          <span class="${isIncome ? "income" : "expense"}">
            ${isIncome ? "আয়" : "ব্যয়"}
          </span>
        </td>
        <td>${formatMoney(item.amount)}</td>
        ${isAdmin ? `
          <td>
            <button
              type="button"
              class="delete-transaction"
              data-id="${escapeHTML(item.id)}"
              aria-label="হিসাব মুছুন"
            >মুছুন</button>
          </td>
        ` : ""}
      </tr>
    `;
  }).join("");
}


/* 14. Search and Filter */

searchInput?.addEventListener("input", renderTransactions);
filterType?.addEventListener("change", renderTransactions);

refreshBtn?.addEventListener("click", () => {
  renderTotals();
  renderTransactions();
  showStatus("দেখানো হিসাব রিফ্রেশ হয়েছে।");
});


/* 15. Add a Transaction */

if (dateInput && !dateInput.value) {
  dateInput.value = localToday();
}

transactionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !isAdmin) {
    showStatus("হিসাব যোগ করতে আগে অ্যাডমিন লগইন করো।", true);
    return;
  }

  const type = typeInput?.value;
  const amount = Number(amountInput?.value);
  const person = personInput?.value.trim();
  const date = dateInput?.value;
  const category = categoryInput?.value.trim();
  const description = descriptionInput?.value.trim();

  if (!["income", "expense"].includes(type)) {
    showStatus("হিসাবের ধরন নির্বাচন করো।", true);
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showStatus("সঠিক টাকার পরিমাণ লিখো।", true);
    return;
  }

  if (!date || !person || !category || !description) {
    showStatus("সব প্রয়োজনীয় তথ্য পূরণ করো।", true);
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "সংরক্ষণ হচ্ছে...";
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

    transactionForm.reset();

    if (dateInput) {
      dateInput.value = localToday();
    }

    showStatus("হিসাব সফলভাবে সংরক্ষণ হয়েছে।");

  } catch (error) {
    console.error("Add transaction error:", error);

    showStatus(
      `হিসাব সংরক্ষণ হয়নি: ${error.code || error.message}`,
      true
    );
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "হিসাব সংরক্ষণ";
    }
  }
});


/* 16. Delete a Transaction */

transactionList?.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-transaction");

  if (!button) return;

  if (!currentUser || !isAdmin) {
    showStatus("হিসাব মুছতে অ্যাডমিন অনুমতি প্রয়োজন।", true);
    return;
  }

  const id = button.dataset.id;

  if (!id) return;

  const confirmed = window.confirm(
    "তুমি কি সত্যিই এই হিসাবটি মুছে ফেলতে চাও?"
  );

  if (!confirmed) return;

  button.disabled = true;

  try {
    await deleteDoc(doc(db, "transactions", id));

    showStatus("হিসাব মুছে ফেলা হয়েছে।");

  } catch (error) {
    console.error("Delete transaction error:", error);

    showStatus(
      `হিসাব মুছতে ব্যর্থ: ${error.code || error.message}`,
      true
    );

    button.disabled = false;
  }
});


/* 17. Initial Screen */

renderTotals();
renderTransactions();
