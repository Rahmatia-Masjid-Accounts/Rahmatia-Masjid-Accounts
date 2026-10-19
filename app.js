/* ==========================================
   RAHMATIA MASJID ACCOUNTS
   Firebase + Authentication + Firestore
   ========================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
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

/* ==========================================
   1. FIREBASE CONFIG
   Firebase Console থেকে নিজের config বসাও
   ========================================== */

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_AUTH_DOMAIN",
  projectId: "rahmatia-masjid-accounts",
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

/* ==========================================
   2. INITIALIZE FIREBASE
   ========================================== */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ==========================================
   3. HTML ELEMENTS
   ========================================== */

const $ = (id) => document.getElementById(id);

const loginDialog = $("loginDialog");
const loginForm = $("loginForm");
const loginError = $("loginError");
const loginEmail = $("loginEmail");
const loginPassword = $("loginPassword");

const adminLoginBtn = $("adminLoginBtn");
const closeLoginBtn = $("closeLoginBtn");
const logoutBtn = $("logoutBtn");

const adminPanel = $("adminPanel");
const transactionForm = $("transactionForm");
const submitBtn = $("submitBtn");

const transactionList = $("transactionList");
const totalIncomeEl = $("totalIncome");
const totalExpenseEl = $("totalExpense");
const balanceEl = $("balance");
const balanceNote = $("balanceNote");

const statusMessage = $("statusMessage");
const entryCount = $("entryCount");
const searchInput = $("searchInput");
const filterType = $("filterType");
const refreshBtn = $("refreshBtn");
const actionHeader = $("actionHeader");
const emptyMessage = $("emptyMessage");

/* ==========================================
   4. APPLICATION STATE
   ========================================== */

let currentUser = null;
let isAdmin = false;
let transactions = [];
let unsubscribeTransactions = null;
let requestNumber = 0;

/* ==========================================
   5. HELPERS
   ========================================== */

const money = (amount) => {
  return "৳ " + Number(amount || 0).toLocaleString("bn-BD", {
    maximumFractionDigits: 2
  });
};

const dateToday = () => {
  const now = new Date();
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );
  return localDate.toISOString().slice(0, 10);
};

function showStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = "status-message";

  if (type) {
    statusMessage.classList.add(type);
  }
}

function setButtonLoading(button, loading, loadingText, normalText) {
  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}

function stopTransactionListener() {
  if (unsubscribeTransactions) {
    unsubscribeTransactions();
    unsubscribeTransactions = null;
  }
}

/* ==========================================
   6. ADMIN LOGIN DIALOG
   ========================================== */

adminLoginBtn.addEventListener("click", () => {
  if (currentUser && isAdmin) {
    adminPanel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    return;
  }

  loginError.textContent = "";

  if (typeof loginDialog.showModal === "function") {
    loginDialog.showModal();
  } else {
    showStatus("এই ব্রাউজারে লগইন ডায়ালগ খোলা যাচ্ছে না।", "error");
  }
});

closeLoginBtn.addEventListener("click", () => {
  loginDialog.close();
});

loginDialog.addEventListener("click", (event) => {
  if (event.target === loginDialog) {
    loginDialog.close();
  }
});

/* ==========================================
   7. SIGN IN
   ========================================== */

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginError.textContent = "";

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    loginError.textContent = "ইমেইল ও পাসওয়ার্ড লিখুন।";
    return;
  }

  setButtonLoading(
    $("loginSubmitBtn"),
    true,
    "লগইন হচ্ছে...",
    "লগইন করুন"
  );

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginPassword.value = "";
    loginDialog.close();
  } catch (error) {
    console.error("Login error:", error);

    loginError.textContent =
      error.code === "auth/invalid-credential"
        ? "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।"
        : error.code === "auth/too-many-requests"
        ? "অনেকবার চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।"
        : error.code === "auth/network-request-failed"
        ? "ইন্টারনেট সংযোগ পরীক্ষা করুন।"
        : "লগইন করা যায়নি। Firebase Authentication সেটিংস পরীক্ষা করুন।";
  } finally {
    setButtonLoading(
      $("loginSubmitBtn"),
      false,
      "লগইন হচ্ছে...",
      "লগইন করুন"
    );
  }
});

/* ==========================================
   8. SIGN OUT
   ========================================== */

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showStatus("সফলভাবে লগআউট হয়েছে।", "success");
  } catch (error) {
    console.error(error);
    showStatus("লগআউট করা যায়নি। আবার চেষ্টা করুন।", "error");
  }
});

/* ==========================================
   9. AUTHENTICATION + ADMIN CHECK
   ========================================== */

onAuthStateChanged(auth, async (user) => {
  const myRequest = ++requestNumber;

  currentUser = user;
  isAdmin = false;

  adminPanel.classList.add("hidden");
  actionHeader.classList.add("hidden");

  adminLoginBtn.textContent = user
    ? "🔐 অ্যাকাউন্ট যাচাই হচ্ছে..."
    : "🔐 অ্যাডমিন লগইন";

  if (!user) {
    stopTransactionListener();

    adminLoginBtn.textContent = "🔐 অ্যাডমিন লগইন";
    showStatus("সর্বসাধারণের জন্য প্রকাশিত হিসাব দেখুন।");

    startTransactionListener();
    return;
  }

  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnapshot = await getDoc(adminRef);

    if (myRequest !== requestNumber) return;

    if (adminSnapshot.exists()) {
      isAdmin = true;

      adminPanel.classList.remove("hidden");
      actionHeader.classList.remove("hidden");

      adminLoginBtn.textContent = "✓ অ্যাডমিন প্যানেল";

      showStatus(
        "অ্যাডমিন হিসেবে লগইন সফল হয়েছে।",
        "success"
      );

      $("date").value = dateToday();
    } else {
      adminLoginBtn.textContent = "🔐 অ্যাডমিন লগইন";

      showStatus(
        "এই অ্যাকাউন্ট অ্যাডমিন হিসেবে অনুমোদিত নয়।",
        "error"
      );

      await signOut(auth);
      return;
    }

    startTransactionListener();
  } catch (error) {
    console.error("Admin verification error:", error);

    if (myRequest !== requestNumber) return;

    showStatus(
      "অ্যাডমিন যাচাই করা যায়নি। Firestore Security Rules পরীক্ষা করুন।",
      "error"
    );
  }
});

/* ==========================================
   10. LOAD PUBLIC TRANSACTIONS
   ========================================== */

function startTransactionListener() {
  stopTransactionListener();

  transactionList.replaceChildren();

  const loadingRow = document.createElement("tr");
  const loadingCell = document.createElement("td");

  loadingCell.colSpan = isAdmin ? 6 : 5;
  loadingCell.className = "empty-state";
  loadingCell.textContent = "হিসাব লোড হচ্ছে...";

  loadingRow.appendChild(loadingCell);
  transactionList.appendChild(loadingRow);

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

        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;

        return timeB - timeA;
      });

      renderTransactions();

      showStatus(
        "হিসাব সর্বশেষ তথ্য অনুযায়ী আপডেট হয়েছে।",
        "success"
      );
    },
    (error) => {
      console.error("Firestore read error:", error);

      showStatus(
        "হিসাব লোড করা যায়নি। Firestore Rules ও ইন্টারনেট পরীক্ষা করুন।",
        "error"
      );

      transactions = [];
      renderTransactions();
    }
  );
}

/* ==========================================
   11. CALCULATE TOTALS + RENDER LEDGER
   ========================================== */

function renderTransactions() {
  const totalIncome = transactions.reduce((sum, item) => {
    return sum + (
      item.type === "income" ? Number(item.amount || 0) : 0
    );
  }, 0);

  const totalExpense = transactions.reduce((sum, item) => {
    return sum + (
      item.type === "expense" ? Number(item.amount || 0) : 0
    );
  }, 0);

  const balance = totalIncome - totalExpense;

  totalIncomeEl.textContent = money(totalIncome);
  totalExpenseEl.textContent = money(totalExpense);
  balanceEl.textContent = money(balance);

  balanceNote.textContent = balance < 0
    ? "ব্যয়ের পরিমাণ আয়ের চেয়ে বেশি"
    : "আয় থেকে ব্যয় বাদ দিয়ে";

  balanceEl.style.color = balance < 0
    ? "#d83b48"
    : "#102b55";

  const query = searchInput.value.trim().toLocaleLowerCase("bn");
  const selectedType = filterType.value;

  const filtered = transactions.filter((item) => {
    const matchesType =
      selectedType === "all" || item.type === selectedType;

    const searchableText = [
      item.description,
      item.person,
      item.category,
      item.date
    ].join(" ").toLocaleLowerCase("bn");

    return matchesType && searchableText.includes(query);
  });

  entryCount.textContent =
    `${filtered.length.toLocaleString("bn-BD")}টি এন্ট্রি`;

  transactionList.replaceChildren();

  if (filtered.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = isAdmin ? 6 : 5;
    cell.className = "empty-state";
    cell.textContent = "কোনো হিসাব পাওয়া যায়নি।";

    row.appendChild(cell);
    transactionList.appendChild(row);

    emptyMessage.classList.remove("hidden");
    return;
  }

  emptyMessage.classList.add("hidden");

  for (const item of filtered) {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(item.date);

    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = item.description || "—";

    const personCell = document.createElement("td");
    personCell.textContent = item.person || "উল্লেখ নেই";

    const typeCell = document.createElement("td");
    const badge = document.createElement("span");

    badge.className = `type-badge ${
      item.type === "income" ? "income" : "expense"
    }`;

    badge.textContent =
      item.type === "income" ? "আয়" : "ব্যয়";

    typeCell.appendChild(badge);

    const amountCell = document.createElement("td");
    amountCell.className = "amount-column";
    amountCell.textContent = money(item.amount);

    row.append(
      dateCell,
      descriptionCell,
      personCell,
      typeCell,
      amountCell
    );

    if (isAdmin) {
      const actionCell = document.createElement("td");
      const deleteButton = document.createElement("button");

      deleteButton.type = "button";
      deleteButton.className = "delete-btn";
      deleteButton.textContent = "মুছুন";

      deleteButton.addEventListener("click", () => {
        deleteTransaction(item);
      });

      actionCell.appendChild(deleteButton);
      row.appendChild(actionCell);
    }

    transactionList.appendChild(row);
  }
}

function formatDate(value) {
  if (!value) return "—";

  const parts = String(value).split("-");

  if (parts.length !== 3) return value;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/* ==========================================
   12. ADD TRANSACTION
   ========================================== */

transactionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !isAdmin) {
    showStatus("হিসাব যোগ করতে অ্যাডমিন লগইন প্রয়োজন।", "error");
    return;
  }

  const type = $("type").value;
  const amount = Number($("amount").value);
  const person = $("person").value.trim();
  const date = $("date").value;
  const category = $("category").value;
  const description = $("description").value.trim();

  if (
    !["income", "expense"].includes(type) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !date ||
    !description
  ) {
    showStatus(
      "সব প্রয়োজনীয় তথ্য সঠিকভাবে পূরণ করুন।",
      "error"
    );
    return;
  }

  setButtonLoading(
    submitBtn,
    true,
    "সংরক্ষণ হচ্ছে...",
    "+ হিসাব সংরক্ষণ করুন"
  );

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
    $("date").value = dateToday();

    showStatus(
      "হিসাব সফলভাবে সংরক্ষণ হয়েছে।",
      "success"
    );
  } catch (error) {
    console.error("Add transaction error:", error);

    showStatus(
      "হিসাব সংরক্ষণ করা যায়নি। অ্যাডমিন অনুমতি ও Rules পরীক্ষা করুন।",
      "error"
    );
  } finally {
    setButtonLoading(
      submitBtn,
      false,
      "সংরক্ষণ হচ্ছে...",
      "+ হিসাব সংরক্ষণ করুন"
    );
  }
});

/* ==========================================
   13. DELETE TRANSACTION
   ========================================== */

async function deleteTransaction(item) {
  if (!currentUser || !isAdmin) {
    showStatus("এই কাজের জন্য অ্যাডমিন অনুমতি প্রয়োজন।", "error");
    return;
  }

  const confirmed = window.confirm(
    `এই ${item.type === "income" ? "আয়ের" : "ব্যয়ের"} এন্ট্রি মুছে ফেলবেন?\n\n` +
    `${item.description}\n${money(item.amount)}\n\n` +
    "এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।"
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "transactions", item.id));

    showStatus(
      "এন্ট্রি মুছে ফেলা হয়েছে।",
      "success"
    );
  } catch (error) {
    console.error("Delete transaction error:", error);

    showStatus(
      "এন্ট্রি মুছে ফেলা যায়নি। অনুমতি ও Rules পরীক্ষা করুন।",
      "error"
    );
  }
}

/* ==========================================
   14. SEARCH, FILTER, REFRESH
   ========================================== */

searchInput.addEventListener("input", renderTransactions);
filterType.addEventListener("change", renderTransactions);

refreshBtn.addEventListener("click", () => {
  renderTransactions();
  showStatus("দেখানো হিসাব আপডেট করা হয়েছে।");
});

/* ==========================================
   15. INITIAL DATE
   ========================================== */

$("date").value = dateToday();

console.log("Rahmatia Masjid Accounts initialized.");
