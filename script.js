// STEP 1: FIREBASE INITIALIZATION
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDTQ5xBCp0fNcQkLpp_66rcjlqqdbyFE8g", // Your actual API key
  authDomain: "daikofi-pwa.firebaseapp.com",          // Your actual authDomain
  projectId: "daikofi-pwa",                          // Your actual projectId
  storageBucket: "daikofi-pwa.firebasestorage.app",    // Your actual storageBucket
  messagingSenderId: "6320171744",                   // Your actual messagingSenderId
  appId: "1:6320171744:web:efafd8b5f6003ce9d1fe85",   // Your actual appId
  measurementId: "G-PT1M19NL78"                      // Your actual measurementId (optional)
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig); // Uses the 'firebase' global object from SDK

// Initialize Firebase services that you'll use
const auth = firebase.auth();         // Firebase Authentication service
const db = firebase.firestore();      // Firebase Firestore service (Cloud Firestore)
const analytics = firebase.analytics(); // Firebase Analytics service (optional)

console.log("Firebase initialized successfully!"); // For checking in the browser console

let currentUser = null;
let budgetListenerUnsubscribe = null; // To store the unsubscribe function for the Firestore listener

// Modify your existing onAuthStateChanged function:
auth.onAuthStateChanged(async user => {
    const authStatusDisplay = document.getElementById('authStatusDisplay');
    const authFormContainer = document.getElementById('authFormContainer');
    const logoutButton = document.getElementById('logoutButton');
    const profileEmailDisplay = document.getElementById('profileEmailDisplay');
    const welcomeMessageEl = document.getElementById('welcomeMessage');
    const welcomeAvatarEl = document.getElementById('welcomeAvatar');

    // If there's an existing listener, unsubscribe from it first
    if (budgetListenerUnsubscribe) {
        console.log("Detaching existing Firestore listener.");
        budgetListenerUnsubscribe();
        budgetListenerUnsubscribe = null;
    }

    if (user) {
        currentUser = user;
        console.log("User logged in:", currentUser.uid, currentUser.email);

        if (authStatusDisplay) authStatusDisplay.textContent = `Logged in as: ${currentUser.email}`;
        if (profileEmailDisplay) profileEmailDisplay.textContent = currentUser.email;
        if (profileNameDisplay) profileNameDisplay.textContent = userProfile.name; // Uses localStorage name
        if (welcomeAvatarEl) welcomeAvatarEl.textContent = userProfile.avatar; // Uses localStorage avatar
        let displayNameForWelcome = (userProfile.name && userProfile.name !== 'Guest') ? userProfile.name : currentUser.email.split('@')[0];
        if (welcomeMessageEl) welcomeMessageEl.textContent = `Welcome, ${displayNameForWelcome}!`;
        if (authFormContainer) authFormContainer.style.display = 'none';
        if (logoutButton) logoutButton.style.display = 'block';
        const emailAuthInput = document.getElementById('userEmailInput');
        const passwordAuthInput = document.getElementById('userPasswordInput');
        if (emailAuthInput) emailAuthInput.value = '';
        if (passwordAuthInput) passwordAuthInput.value = '';

        showToast('You are now logged in! Setting up real-time data sync...');

        // --- Setup Real-time Listener ---
        const docRef = db.collection('budgets').doc('sharedFamilyBudget');
        budgetListenerUnsubscribe = docRef.onSnapshot(docSnap => {
            console.log("Firestore real-time update received (onSnapshot).");
            if (docSnap.exists) { // Remember: .exists is a property for compat libraries
                console.log("Shared budget document found in Firestore (real-time)!");
                const firestoreData = docSnap.data();
                let dataChanged = false;

                // Load and sanitize monthlyData
                if (firestoreData.monthlyData) {
                    // Simple check for changes; for deep objects, a proper deep-equal is better
                    // For now, we'll just update if the field exists.
                    // A more robust check: if(JSON.stringify(monthlyData) !== JSON.stringify(firestoreData.monthlyData))
                    monthlyData = firestoreData.monthlyData;
                    // Sanitize monthlyData fetched from Firestore
                    for (const monthKey in monthlyData) {
                        if (monthlyData.hasOwnProperty(monthKey)) {
                            const month = monthlyData[monthKey];
                            if (month.hasOwnProperty('income')) {
                                month.income = parseFloat(month.income) || 0;
                            }
                            if (month.categories && Array.isArray(month.categories)) {
                                month.categories.forEach(cat => {
                                    cat.initialBalance = parseFloat(cat.initialBalance) || 0;
                                    cat.balance = parseFloat(cat.balance) || 0;
                                    cat.spent = parseFloat(cat.spent) || 0;
                                    if (cat.hasOwnProperty('emiAmount')) {
                                        cat.emiAmount = parseFloat(cat.emiAmount) || 0;
                                    }
                                    if (cat.hasOwnProperty('dueDay') && cat.dueDay !== null) {
                                        cat.dueDay = parseInt(cat.dueDay, 10) || null;
                                    }
                                });
                            }
                            if (!month.history) month.history = [];
                            if (!month.hasOwnProperty('emiDeducted')) month.emiDeducted = false;
                            if (!month.hasOwnProperty('fundsImported')) month.fundsImported = false;
                        }
                    }
                    dataChanged = true;
                    console.log("monthlyData updated from Firestore (real-time).");
                } else {
                    // If monthlyData field is missing in Firestore but user is logged in,
                    // it implies it was deleted from DB or never created. Re-initialize.
                    monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
                    console.log("No 'monthlyData' in Firestore (real-time). Using local/default.");
                    // dataChanged might still be true if local differs from an empty cloud state
                }

                // Load and merge appSettings
                if (firestoreData.appSettings) {
                    const sharedSettings = firestoreData.appSettings;
                    if (appSettings.currency !== sharedSettings.currency ||
                        appSettings.defaultPaymentApp !== sharedSettings.defaultPaymentApp) {
                        dataChanged = true;
                    }
                    appSettings.currency = sharedSettings.currency || appSettings.currency;
                    appSettings.defaultPaymentApp = sharedSettings.defaultPaymentApp || appSettings.defaultPaymentApp;
                    console.log("Shared appSettings updated from Firestore (real-time) and merged.");
                } else {
                     console.log("No 'appSettings' in Firestore (real-time). Using local/default.");
                }

                if (dataChanged) {
                    showToast("Budget data synced from cloud.");
                    document.getElementById('currencySelect').value = appSettings.currency;
                    document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;
                    render(); // Re-render UI with new data
                } else if (!docSnap.metadata.hasPendingWrites) { // Initial load might not show dataChanged yet
                     // First snapshot after login (initial load) might not be flagged as "dataChanged" by simple checks above.
                     // So, always render on the first successful fetch unless it's a local echo.
                     // docSnap.metadata.hasPendingWrites is true if the change originated locally.
                    console.log("Initial data load via onSnapshot or no effective change, rendering.");
                    document.getElementById('currencySelect').value = appSettings.currency;
                    document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;
                    render();
                }

            } else {
                // Document sharedFamilyBudget does not exist
                console.log("No shared budget document (real-time). Initializing local/default. Will be created on first save.");
                monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
                // Ensure full sanitization
                for (const monthKey in monthlyData) { /* ... (full sanitization as in loadDataFromFirestore) ... */ }
                appSettings = JSON.parse(localStorage.getItem('appSettings')) || {
                    currency: 'INR', defaultPaymentApp: 'GPay', notifications: []
                };
                if (!appSettings.notifications) appSettings.notifications = [];
                document.getElementById('currencySelect').value = appSettings.currency;
                document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;
                render(); // Render with local/default data
            }
        }, error => {
            console.error("Error in Firestore real-time listener: ", error);
            showToast("Error syncing data. Please check connection.");
            // Optionally, implement more robust error handling or fallback logic here.
        });
        // --- End of Real-time Listener Setup ---

    } else {
        // User is signed out.
        currentUser = null;
        console.log("User logged out. (onAuthStateChanged)");

        if (authStatusDisplay) authStatusDisplay.textContent = 'Not logged in';
        if (profileEmailDisplay) profileEmailDisplay.textContent = '';
        if (profileNameDisplay) profileNameDisplay.textContent = 'Guest';
        if (welcomeAvatarEl) welcomeAvatarEl.textContent = '👋';
        if (welcomeMessageEl) welcomeMessageEl.textContent = `Welcome, Guest!`;
        userProfile.name = 'Guest';
        userProfile.email = '';
        userProfile.avatar = '👋';
        saveUserProfile(); // Save guest state to localStorage

        if (authFormContainer) authFormContainer.style.display = 'block';
        if (logoutButton) logoutButton.style.display = 'none';

        // Reset to local data on logout
        monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
        // Ensure full sanitization
        for (const monthKey in monthlyData) {
             if (monthlyData.hasOwnProperty(monthKey)) {
                const month = monthlyData[monthKey];
                if (month.hasOwnProperty('income')) {
                    month.income = parseFloat(month.income) || 0;
                }
                if (month.categories && Array.isArray(month.categories)) {
                    month.categories.forEach(cat => {
                        cat.initialBalance = parseFloat(cat.initialBalance) || 0;
                        cat.balance = parseFloat(cat.balance) || 0;
                        cat.spent = parseFloat(cat.spent) || 0;
                        // ... etc. for all properties in category
                    });
                }
                 if (!month.history) month.history = [];
                 if (!month.hasOwnProperty('emiDeducted')) month.emiDeducted = false;
                 if (!month.hasOwnProperty('fundsImported')) month.fundsImported = false;
             }
        }

        appSettings = JSON.parse(localStorage.getItem('appSettings')) || {
            currency: 'INR', defaultPaymentApp: 'GPay', notifications: []
        };
        if (!appSettings.notifications) appSettings.notifications = [];

        document.getElementById('currencySelect').value = appSettings.currency;
        document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;

        showToast("You are now logged out.");
        render();
    }
});

// service-worker.js registration (added here for completeness, usually in a separate file)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
              console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
              console.log('ServiceWorker registration failed: ', err);
            });
        });
    }

    // Moved Date utility functions to the top
    function getMonthYearString(date) { // Used as key for monthlyData
        const options = { year: 'numeric', month: 'long' };
        return date.toLocaleString('en-US', options);
    }

  function toggleDailyExpensesGraph() {
    const graphContainer = document.getElementById('dailyExpensesGraphContainer');
    const graphToggleIcon = document.getElementById('dailyExpensesGraphToggleIcon');
    const isHidden = graphContainer.style.display === 'none';
    graphContainer.style.display = isHidden ? 'block' : 'none';
    graphToggleIcon.textContent = isHidden ? '▲' : '▼';
    if (isHidden) {
        renderDailyBarChart(); // Render the chart when it's made visible
    }
} 
   function getDailyExpenseDataForChart() {
    const currentMonthData = getCurrentMonthData();
    const history = currentMonthData.history;
    const dailyExpenses = {}; // Object to store expenses sum per day

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const labels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString()); // Labels for days 1 to N

    // Initialize expenses for all days to 0
    labels.forEach(day => {
        dailyExpenses[day] = 0;
    });

    history.forEach(transaction => {
        // Consider relevant expense types
        const expenseTypes = ['expense_cash', 'expense_scan_pay', 'expense_pay_via_app'];
        // Optionally include EMI/Auto-deductions if they should appear as daily spikes:
        // const expenseTypes = ['expense_cash', 'expense_scan_pay', 'expense_pay_via_app', 'emi_deduction_processed'];
        
        if (expenseTypes.includes(transaction.type) && transaction.amount > 0) {
            const transactionDate = new Date(transaction.timestamp);
            if (transactionDate.getMonth() === currentMonth.getMonth() &&
                transactionDate.getFullYear() === currentMonth.getFullYear()) {
                const dayOfMonth = transactionDate.getDate().toString();
                dailyExpenses[dayOfMonth] += transaction.amount;
            }
        }
    });

    const data = labels.map(day => dailyExpenses[day] || 0); // Ensure order matches labels

    return {
        labels: labels,
        data: data
    };
}
 
function renderDailyBarChart() {
    const chartData = getDailyExpenseDataForChart();
    const ctx = document.getElementById('dailyBarChart').getContext('2d');
    const currentCurrencySymbol = currencySymbols[appSettings.currency];

    // Define the new text color for the bar chart
    const barChartTextColor = '#FFBF00'; // Amber/Gold color

    // Get theme-appropriate colors for other elements like background and borders
    const primaryColorRGB = getComputedStyle(document.documentElement).getPropertyValue('--primary-color-rgb').trim();
    // const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(); // Keep for reference or other elements if needed, but bar chart will use barChartTextColor
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();


    if (dailyExpensesBarChart) {
        dailyExpensesBarChart.destroy();
    }

    dailyExpensesBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: `Daily Expenses (${currentCurrencySymbol})`,
                data: chartData.data,
                backgroundColor: `rgba(${primaryColorRGB}, 0.7)`,
                borderColor: `rgb(${primaryColorRGB})`,
                borderWidth: 1,
                barThickness: 'flex',
                maxBarThickness: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: barChartTextColor // Use new color for legend labels
                    }
                },
                tooltip: {
                    titleColor: barChartTextColor, // Use new color for tooltip title
                    bodyColor: barChartTextColor,  // Use new color for tooltip body
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += currentCurrencySymbol + context.parsed.y.toFixed(2);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: `Amount (${currentCurrencySymbol})`,
                        color: barChartTextColor // Use new color for Y-axis title
                    },
                    ticks: {
                        color: barChartTextColor, // Use new color for Y-axis ticks
                        callback: function(value) {
                            return currentCurrencySymbol + value;
                        }
                    },
                    grid: {
                        color: gridColor,
                        borderColor: gridColor
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Day of the Month',
                        color: barChartTextColor // Use new color for X-axis title
                    },
                    ticks: {
                        color: barChartTextColor // Use new color for X-axis ticks
                    },
                    grid: {
                        display: false,
                        borderColor: gridColor
                    }
                }
            }
        }
    });
}


   function getFullDateString(date) { // For display
        const day = date.getDate();
        const month = date.toLocaleString('en-US', { month: 'long' });
        const year = date.getFullYear();
        let suffix = 'th';
        if (day === 1 || day === 21 || day === 31) suffix = 'st';
        else if (day === 2 || day === 22) suffix = 'nd';
        else if (day === 3 || day === 23) suffix = 'rd';
        return `${day}${suffix} ${month} ${year}`;
    }

    function getPreviousMonthYearString(date) {
        const prevMonth = new Date(date);
        prevMonth.setMonth(date.getMonth() - 1);
        const options = { year: 'numeric', month: 'long' };
        return prevMonth.toLocaleString('en-US', options);
    }

    function formatDueDate(day, monthDate) {
        if (!day) return '';
        const dayInt = parseInt(day, 10);
        if (isNaN(dayInt) || dayInt < 1 || dayInt > 31) return '';

        let suffix = 'th';
        if (dayInt === 1 || dayInt === 21 || dayInt === 31) suffix = 'st';
        else if (dayInt === 2 || dayInt === 22) suffix = 'nd';
        else if (dayInt === 3 || day === 23) suffix = 'rd';

        const monthName = monthDate.toLocaleString('en-US', { month: 'short' });
        return `${dayInt}${suffix} ${monthName}`;
    }

    function setupPasswordVisibilityToggle(passwordInputId, toggleButtonId) {
    const togglePasswordButton = document.getElementById(toggleButtonId);
    const passwordInput = document.getElementById(passwordInputId);

    if (togglePasswordButton && passwordInput) {
        const toggle = () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            // Ensure the icon text also updates correctly
            togglePasswordButton.textContent = type === 'password' ? '👁️' : '🙈';
        };

        togglePasswordButton.addEventListener('click', toggle);
        togglePasswordButton.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
            }
        });
    } else {
        // This warning helps if IDs in HTML don't match
        console.warn(`Password toggle elements not found for: input ID "${passwordInputId}" or button ID "${toggleButtonId}"`);
    }
}

    // Data structure to hold monthly data
    let monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
    // Sanitize loaded data to ensure numeric types
    for (const monthKey in monthlyData) {
        if (monthlyData.hasOwnProperty(monthKey)) {
            const month = monthlyData[monthKey];
            if (month.hasOwnProperty('income')) {
                month.income = parseFloat(month.income) || 0;
            }
            if (month.categories && Array.isArray(month.categories)) {
                month.categories.forEach(cat => {
                    cat.initialBalance = parseFloat(cat.initialBalance) || 0;
                    cat.balance = parseFloat(cat.balance) || 0;
                    cat.spent = parseFloat(cat.spent) || 0;
                    if (cat.hasOwnProperty('emiAmount')) {
                        cat.emiAmount = parseFloat(cat.emiAmount) || 0;
                    }
                    if (cat.hasOwnProperty('dueDay') && cat.dueDay !== null) {
                        cat.dueDay = parseInt(cat.dueDay, 10) || null;
                    }
                });
            }
        }
    }


    let currentMonth = new Date(); // Represents the month being viewed

    // User Profile and App Settings
    let userProfile = JSON.parse(localStorage.getItem('userProfile')) || { name: 'Guest', avatar: ' ', email: '' };
    let appSettings = JSON.parse(localStorage.getItem('appSettings')) || {
        currency: 'INR',
        defaultPaymentApp: 'GPay',
        notifications: []
    };
     if (!appSettings.notifications) appSettings.notifications = [];


    // Initialize Chart.js pie chart instance
    let expensePieChart;
    let dailyExpensesBarChart;
    // Dashboard Gauge Chart Instances
    let investmentGaugeChart, expenseGaugeChart, loanGaugeChart;


    // Currency Symbols Map
    const currencySymbols = {
        'USD': '$',
        'EUR': '€',
        'INR': '₹'
    };

    // Payment App URLs (placeholders for deep linking) - UPDATED
    const paymentAppUrls = {
        'GPay': 'https://gpay.app.goo.gl/', // General GPay link
        'PhonePe': 'phonepe://open', // Opens PhonePe app
        'AmazonPay': 'amazonpay://home', // Might vary, opens Amazon Pay section in Amazon app
    };

    // QR Scanner instance
    let html5QrCodeScanner;
    let isProcessingUPIScan = false;

    // --- Modal Functions ---
    const customModal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalAlertBtn = document.getElementById('modalAlertBtn');
    const modalConfirmBtn = document.getElementById('modalConfirmBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');

    function showModal(title, message, type) {
        return new Promise((resolve) => {
            modalTitle.textContent = title;
            modalMessage.textContent = message;
            modalAlertBtn.style.display = 'none';
            modalConfirmBtn.style.display = 'none';
            modalCancelBtn.style.display = 'none';

            const closeModal = () => {
                customModal.classList.remove('active');
                modalAlertBtn.onclick = null;
                modalConfirmBtn.onclick = null;
                modalCancelBtn.onclick = null;
            };

            if (type === 'alert') {
                modalAlertBtn.style.display = 'block';
                modalAlertBtn.onclick = () => {
                    closeModal();
                    resolve(true);
                };
            } else if (type === 'confirm') {
                modalConfirmBtn.style.display = 'block';
                modalCancelBtn.style.display = 'block';
                modalConfirmBtn.onclick = () => {
                    closeModal();
                    resolve(true);
                };
                modalCancelBtn.onclick = () => {
                    closeModal();
                    resolve(false);
                };
            }
            customModal.classList.add('active');
        });
    }

    async function showAlert(message, title = 'Notification') {
        await showModal(title, message, 'alert');
    }

    async function showConfirm(message, title = 'Confirmation') {
        return await showModal(title, message, 'confirm');
    }
    // --- End Modal Functions ---

    // --- Toast Notification Function ---
    function showToast(message) {
        const toast = document.getElementById('toastNotification');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    // --- End Toast Notification Function ---

    function getCurrentMonthData() {
        const monthYear = getMonthYearString(currentMonth);
        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = {
                income: 0,
                categories: [],
                history: [],
                emiDeducted: false,
                fundsImported: false
            };
        }
        monthlyData[monthYear].income = parseFloat(monthlyData[monthYear].income) || 0;
        return monthlyData[monthYear];
    }

// Replace the existing saveData function with this:
async function saveData() {
  if (!currentUser) {
    // If no user is logged in, fall back to localStorage for offline/guest use if desired,
    // or simply don't save to the cloud. For now, let's keep saving to localStorage
    // as a fallback, but ideally, cloud-dependent features would be disabled when logged out.
    console.log("No user logged in. Saving monthlyData to localStorage.");
    localStorage.setItem('monthlyData', JSON.stringify(monthlyData));
    return; // Exit if no user to prevent Firestore errors
  }

  console.log("User logged in. Attempting to save monthlyData to Firestore...");
  try {
    // We are saving the entire monthlyData object under a 'monthlyData' field
    // in our shared document. { merge: true } ensures we don't overwrite other fields
    // like 'appSettings' in the same document.
    await db.collection('budgets').doc('sharedFamilyBudget').set({
      monthlyData: monthlyData
    }, { merge: true });
    console.log('monthlyData successfully saved to Firestore!');
    // showToast('Budget data synced to cloud.'); // Optional: feedback to user
  } catch (error) {
    console.error("Error saving monthlyData to Firestore: ", error);
    showToast('Error syncing budget data. Using local backup.');
    // As a fallback or for offline, you might still save to localStorage
    localStorage.setItem('monthlyData', JSON.stringify(monthlyData));
  }
}
    function saveUserProfile() {
        localStorage.setItem('userProfile', JSON.stringify(userProfile));
        renderUserProfile();
    }

// Replace the existing saveAppSettings function with this:
async function saveAppSettings() {
  if (!currentUser) {
    console.log("No user logged in. Saving appSettings to localStorage.");
    localStorage.setItem('appSettings', JSON.stringify(appSettings));
    return; // Exit if no user
  }

  console.log("User logged in. Attempting to save appSettings to Firestore...");
  // We only want to sync specific shared settings, e.g., currency and defaultPaymentApp.
  // Notifications are usually device-specific and voluminous, so let's exclude them from Firestore sync for now.
  const sharedSettings = {
      currency: appSettings.currency,
      defaultPaymentApp: appSettings.defaultPaymentApp
      // Add any other settings you specifically want to sync
  };

  try {
    await db.collection('budgets').doc('sharedFamilyBudget').set({
      appSettings: sharedSettings // Save the filtered sharedSettings
    }, { merge: true });
    console.log('Shared appSettings successfully saved to Firestore!');
    // showToast('App settings synced to cloud.'); // Optional
  } catch (error) {
    console.error("Error saving appSettings to Firestore: ", error);
    showToast('Error syncing app settings. Using local backup.');
    localStorage.setItem('appSettings', JSON.stringify(appSettings)); // Fallback
  }
}
        // --- START: AUTHENTICATION FUNCTIONS ---

    async function handleSignUpAttempt() {
        // Using 'userEmailInput' and 'userPasswordInput' as per your integrated HTML
        const emailInput = document.getElementById('userEmailInput');
        const passwordInput = document.getElementById('userPasswordInput');
        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            showAlert('Please enter both email and password to sign up.');
            return;
        }
        if (password.length < 6) {
            showAlert('Password should be at least 6 characters long.');
            return;
        }

        try {
            // Show some loading state if you have one
            showToast('Attempting to sign up...');
            await auth.createUserWithEmailAndPassword(email, password);
            // onAuthStateChanged will automatically handle the UI update and log success
            // No need to call showToast here for success, onAuthStateChanged will reflect login.
            // emailInput.value = ''; // Optionally clear fields
            // passwordInput.value = '';
        } catch (error) {
            console.error("Sign Up Error:", error);
            showAlert(`Sign up failed: ${error.message}`);
        }
    }

    async function handleLoginAttempt() {
        const emailInput = document.getElementById('userEmailInput');
        const passwordInput = document.getElementById('userPasswordInput');
        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            showAlert('Please enter both email and password to log in.');
            return;
        }

        try {
            // Show some loading state
            showToast('Attempting to log in...');
            await auth.signInWithEmailAndPassword(email, password);
            // onAuthStateChanged will automatically handle the UI update and log success
            // emailInput.value = ''; // Optionally clear fields
            // passwordInput.value = '';
        } catch (error) {
            console.error("Login Error:", error);
            showAlert(`Login failed: ${error.message}`);
        }
    }

    async function handleLogoutAttempt() {
        try {
            showToast('Logging out...');
            await auth.signOut();
            // onAuthStateChanged will handle the UI update
            // Additional cleanup (like clearing specific app data) can be done in onAuthStateChanged's "else" block
        } catch (error) {
            console.error("Logout Error:", error);
            showAlert(`Logout failed: ${error.message}`);
        }
    }

    // --- END: AUTHENTICATION FUNCTIONS ---

    // --- Dashboard Gauge Chart Functions ---
    function createGaugeChart(canvasId, initialPercentage, fillColor, trackColor) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [initialPercentage, 100 - initialPercentage],
                    backgroundColor: [fillColor, trackColor],
                    borderWidth: 1,
                    circumference: 180,
                    rotation: -90,
                    borderRadius: 8, // Or your desired roundness, e.g., 10 or { outerStart: 8, outerEnd: 8, innerStart: 8, innerEnd: 8 } for more control
                    borderSkipped: false // Important for making borderRadius visible on all sides
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                animation: {
                    animateRotate: true,
                    animateScale: false
                }
            }
        });
        return chart;
    }

    function updateGaugeChart(chartInstance, percentage, textElementId, cssColorVarForText) {
        const cappedPercentage = Math.min(Math.max(percentage, 0), 100);
        const textElement = document.getElementById(textElementId);

        if (chartInstance) {
            chartInstance.data.datasets[0].data = [cappedPercentage, 100 - cappedPercentage];
            const newFillColor = getComputedStyle(document.documentElement).getPropertyValue(cssColorVarForText.substring(4, cssColorVarForText.length -1)).trim();
            const newTrackColor = getComputedStyle(document.documentElement).getPropertyValue('--gauge-track-color').trim();
            chartInstance.data.datasets[0].backgroundColor = [newFillColor, newTrackColor];
            chartInstance.update('none');
        }

        if (textElement) {
            textElement.textContent = `${cappedPercentage.toFixed(1)}%`;
            textElement.style.color = getComputedStyle(document.documentElement).getPropertyValue(cssColorVarForText.substring(4, cssColorVarForText.length -1)).trim();
        }
    }

    function initializeDashboardGauges() {
        const invColorVar = '--investment-gauge-color';
        const expColorVar = '--expense-gauge-color';
        const loanColorVar = '--loan-gauge-color';
        const trackColor = getComputedStyle(document.documentElement).getPropertyValue('--gauge-track-color').trim();

        if (investmentGaugeChart) investmentGaugeChart.destroy();
        investmentGaugeChart = createGaugeChart('investmentGaugeCanvas', 0, getComputedStyle(document.documentElement).getPropertyValue(invColorVar).trim(), trackColor);

        if (expenseGaugeChart) expenseGaugeChart.destroy();
        expenseGaugeChart = createGaugeChart('expenseGaugeCanvas', 0, getComputedStyle(document.documentElement).getPropertyValue(expColorVar).trim(), trackColor);

        if (loanGaugeChart) loanGaugeChart.destroy();
        loanGaugeChart = createGaugeChart('loanGaugeCanvas', 0, getComputedStyle(document.documentElement).getPropertyValue(loanColorVar).trim(), trackColor);
    }

    function renderDashboardGauges() {
        const currentMonthData = getCurrentMonthData();
        const monthlyIncome = currentMonthData.income;
        const categories = currentMonthData.categories;

        let totalInvestmentSpent = 0;
        let totalManualExpenseSpent = 0;
        let totalLoanSpent = 0;

        categories.forEach(cat => {
            if (cat.type === 'investment') {
                totalInvestmentSpent += cat.spent;
            } else if (cat.type === 'expense') {
                if (cat.deductionType === 'manual') {
                    totalManualExpenseSpent += cat.spent;
                } else if (cat.deductionType === 'auto') {
                    totalLoanSpent += cat.spent;
                }
            }
        });

        const investmentPercentage = monthlyIncome > 0 ? (totalInvestmentSpent / monthlyIncome) * 100 : 0;
        const expensePercentage = monthlyIncome > 0 ? (totalManualExpenseSpent / monthlyIncome) * 100 : 0;
        const loanPercentage = monthlyIncome > 0 ? (totalLoanSpent / monthlyIncome) * 100 : 0;

        updateGaugeChart(investmentGaugeChart, investmentPercentage, 'investmentPercentageText', 'var(--investment-gauge-color)');
        updateGaugeChart(expenseGaugeChart, expensePercentage, 'expensePercentageText', 'var(--expense-gauge-color)');
        updateGaugeChart(loanGaugeChart, loanPercentage, 'loanPercentageText', 'var(--loan-gauge-color)');
    }

    async function loadDataFromFirestore() {
  if (!currentUser) {
    console.log("No user logged in. Not loading data from Firestore.");
    // The app will use data currently in 'monthlyData' and 'appSettings'
    // (which would be from localStorage or default if no localStorage data was found).
    // We still need to render to ensure UI consistency based on whatever is loaded locally.
    render();
    return;
  }

  console.log(`User ${currentUser.email} logged in. Attempting to load data from Firestore...`);
  showToast("Loading your budget data..."); // Optional: loading indicator

  try {
    const docRef = db.collection('budgets').doc('sharedFamilyBudget');
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      console.log("Shared budget document found in Firestore!");
      const firestoreData = docSnap.data();

      // Load monthlyData
      if (firestoreData.monthlyData) {
        monthlyData = firestoreData.monthlyData;
        // IMPORTANT: Sanitize monthlyData fetched from Firestore, just like you do for localStorage
        for (const monthKey in monthlyData) {
          if (monthlyData.hasOwnProperty(monthKey)) {
            const month = monthlyData[monthKey];
            if (month.hasOwnProperty('income')) {
              month.income = parseFloat(month.income) || 0;
            }
            if (month.categories && Array.isArray(month.categories)) {
              month.categories.forEach(cat => {
                cat.initialBalance = parseFloat(cat.initialBalance) || 0;
                cat.balance = parseFloat(cat.balance) || 0;
                cat.spent = parseFloat(cat.spent) || 0;
                if (cat.hasOwnProperty('emiAmount')) {
                  cat.emiAmount = parseFloat(cat.emiAmount) || 0;
                }
                if (cat.hasOwnProperty('dueDay') && cat.dueDay !== null) {
                  cat.dueDay = parseInt(cat.dueDay, 10) || null;
                }
              });
            }
            if (!month.history) month.history = []; // Ensure history array exists
            if (!month.hasOwnProperty('emiDeducted')) month.emiDeducted = false;
            if (!month.hasOwnProperty('fundsImported')) month.fundsImported = false;

          }
        }
        console.log("monthlyData loaded and sanitized from Firestore.");
      } else {
        console.log("No 'monthlyData' field in Firestore document. Initializing locally.");
        monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {}; // Fallback or initialize empty
        // You might want to save an empty monthlyData structure to Firestore here if it's the very first load
        // await saveData(); // This would create it if called
      }

      // Load appSettings
      if (firestoreData.appSettings) {
        // Merge with existing appSettings to keep local-only settings like notifications
        const sharedSettings = firestoreData.appSettings;
        appSettings.currency = sharedSettings.currency || appSettings.currency;
        appSettings.defaultPaymentApp = sharedSettings.defaultPaymentApp || appSettings.defaultPaymentApp;
        // appSettings.notifications remains from localStorage
        console.log("Shared appSettings loaded from Firestore and merged.");
      } else {
        console.log("No 'appSettings' field in Firestore document. Using local/default appSettings.");
        // appSettings will retain its localStorage or default values
      }

      showToast("Budget data loaded successfully!");
    } else {
      // Document sharedFamilyBudget does not exist
      console.log("No shared budget document found in Firestore. Using local/default data. It will be created on first save.");
      // Initialize with localStorage or defaults if no Firestore data exists yet
      monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
      appSettings = JSON.parse(localStorage.getItem('appSettings')) || {
          currency: 'INR',
          defaultPaymentApp: 'GPay',
          notifications: []
      };
      if (!appSettings.notifications) appSettings.notifications = [];

      // Perform initial sanitization for localStorage loaded data too
      for (const monthKey in monthlyData) { /* ... (add full sanitization block here if needed) ... */ }
    }
  } catch (error) {
    console.error("Error loading data from Firestore: ", error);
    showToast('Error loading cloud data. Using local backup.');
    // Fallback to localStorage if Firestore fetch fails
    monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
    appSettings = JSON.parse(localStorage.getItem('appSettings')) || {
        currency: 'INR',
        defaultPaymentApp: 'GPay',
        notifications: []
    };
    if (!appSettings.notifications) appSettings.notifications = [];
    // Perform initial sanitization for localStorage loaded data too
    for (const monthKey in monthlyData) { /* ... (add full sanitization block here if needed) ... */ }
  }

  // Ensure UI is updated with whatever data has been loaded (Firestore or local fallback)
  // This also updates currency selectors etc. based on loaded appSettings
  document.getElementById('currencySelect').value = appSettings.currency;
  document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;
  render();
}

    function render() {
      saveData();
      saveUserProfile();
      saveAppSettings();

      const currentMonthData = getCurrentMonthData();
      const categories = currentMonthData.categories;
      const history = currentMonthData.history;
      const monthlyIncome = currentMonthData.income;

      const currentCurrencySymbol = currencySymbols[appSettings.currency];
      document.getElementById('currencySymbolTotalBalance').textContent = currentCurrencySymbol;
      document.getElementById('currencySymbolMonthlyIncome').textContent = currentCurrencySymbol;
      document.getElementById('currencySymbolTotalExpenses').textContent = currentCurrencySymbol;
      document.getElementById('logTransactionBtnIcon').textContent = currentCurrencySymbol;


      document.getElementById('currentDateDisplay').textContent = getFullDateString(currentMonth);
      document.getElementById('monthlyIncomeInput').value = monthlyIncome > 0 ? monthlyIncome.toFixed(2) : '';
      document.getElementById('displayMonthlyIncome').textContent = monthlyIncome.toFixed(2);

      const loanEmiFundsDiv = document.getElementById('loanEmiFunds');
      const dailyExpenseFundsDiv = document.getElementById('dailyExpenseFunds');
      const investmentFundsDiv = document.getElementById('investmentFunds');

      const paySelect = document.getElementById('payCategory');
      const transferFromSelect = document.getElementById('transferFromCategory');
      const transferToSelect = document.getElementById('transferToCategory');
      const totalBalanceSpan = document.getElementById('totalBalance');
      const displayTotalExpensesSpan = document.getElementById('displayTotalExpenses');
      const copyFundsBtn = document.getElementById('copyFundsBtn');
      const expenseSummaryTextDiv = document.getElementById('expenseSummaryText');
      const defaultPaymentAppNameSpan = document.getElementById('defaultPaymentAppName');

      if(defaultPaymentAppNameSpan) defaultPaymentAppNameSpan.textContent = appSettings.defaultPaymentApp;


      loanEmiFundsDiv.innerHTML = '';
      dailyExpenseFundsDiv.innerHTML = '';
      investmentFundsDiv.innerHTML = '';
      paySelect.innerHTML = '';
      transferFromSelect.innerHTML = '';
      transferToSelect.innerHTML = '';

      const historyTableBody = document.querySelector('#historyTable tbody');
      historyTableBody.innerHTML = '';
      history.forEach(h => {
          const row = historyTableBody.insertRow();
          const cellDate = row.insertCell();
          const cellDesc = row.insertCell();
          const cellAmount = row.insertCell();
          const cellType = row.insertCell();

          cellDate.textContent = new Date(h.timestamp).toLocaleDateString();
          cellDesc.textContent = h.description;
          cellAmount.textContent = h.amount ? `${currentCurrencySymbol}${h.amount.toFixed(2)}` : '-';
          cellType.textContent = h.type ? h.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A';
      });


      const loanEmiCategories = categories.filter(cat => cat.deductionType === 'auto' && cat.type === 'expense');
      const dailyExpenseCategories = categories.filter(cat => cat.deductionType === 'manual' && cat.type === 'expense');
      const investmentCategories = categories.filter(cat => cat.type === 'investment');


      const prevMonthDataExists = monthlyData[getPreviousMonthYearString(currentMonth)] && monthlyData[getPreviousMonthYearString(currentMonth)].categories.length > 0;
      copyFundsBtn.style.display = (categories.length === 0 && prevMonthDataExists) ? 'block' : 'none';

      function applyWarningBorder(fundTablet, fund) {
          if (fund.deductionType === 'manual' && fund.initialBalance > 0) {
              const remainingPercentage = (fund.balance / fund.initialBalance) * 100;
              fundTablet.classList.remove('warning-orange', 'warning-red');
              if (remainingPercentage <= 10) {
                  fundTablet.classList.add('warning-red');
              } else if (remainingPercentage <= 50) {
                  fundTablet.classList.add('warning-orange');
              }
          } else {
              fundTablet.classList.remove('warning-orange', 'warning-red');
          }
      }

      const renderFundAsTablet = (fund, index) => {
          const fundTablet = document.createElement('div');
          fundTablet.className = 'fund-tablet';
          fundTablet.dataset.fundIndex = index;
          fundTablet.onclick = () => openEditFundModal(index);

          const dueDayText = (fund.deductionType === 'auto' && fund.dueDay)
                            ? `<div class="fund-due-day">Due: ${formatDueDate(fund.dueDay, currentMonth)}</div>`
                            : '';

          let amountDisplay;
          let bottomText = '';

          if (fund.type === 'investment' && fund.deductionType === 'auto') {
              amountDisplay = `${currentCurrencySymbol}${fund.emiAmount.toFixed(2)}`;
              bottomText = `Auto-Invested`;
          } else if (fund.type === 'investment' && fund.deductionType === 'manual') {
              amountDisplay = `${currentCurrencySymbol}${fund.balance.toFixed(2)}`;
              bottomText = `Invested: ${currentCurrencySymbol}${fund.spent.toFixed(2)}`;
          } else if (fund.type === 'expense' && fund.deductionType === 'auto') {
              amountDisplay = `${currentCurrencySymbol}${fund.emiAmount.toFixed(2)}`;
              bottomText = `Auto-Deduct`;
          } else { // Manual Expense
              amountDisplay = `${currentCurrencySymbol}${fund.balance.toFixed(2)}`;
          }

          fundTablet.innerHTML = `
              <div class="fund-tablet-header">
                  <strong>${fund.name}</strong>
                  </div>
              ${dueDayText}
              <div class="fund-tablet-amount">${amountDisplay}</div>
              ${bottomText ? `<div style="font-size:0.8em; text-align:center; margin-top:5px;">${bottomText}</div>` : ''}
          `;
          applyWarningBorder(fundTablet, fund);
          return fundTablet;
      };


      if (loanEmiCategories.length > 0) {
        loanEmiCategories.forEach((cat) => {
            const actualIndex = categories.findIndex(f => f.name === cat.name);
            loanEmiFundsDiv.appendChild(renderFundAsTablet(cat, actualIndex));
        });
      } else {
          loanEmiFundsDiv.innerHTML = '<p style="text-align: center; font-size: 0.9em; color: var(--text-color); grid-column: 1 / -1;">No Loan & EMI funds created.</p>';
      }

      if (dailyExpenseCategories.length > 0) {
        dailyExpenseCategories.forEach((cat) => {
             const actualIndex = categories.findIndex(f => f.name === cat.name);
            dailyExpenseFundsDiv.appendChild(renderFundAsTablet(cat, actualIndex));
        });
      } else {
          dailyExpenseFundsDiv.innerHTML = '<p style="text-align: center; font-size: 0.9em; color: var(--text-color); grid-column: 1 / -1;">No Daily Expense funds created.</p>';
      }

      if (investmentCategories.length > 0) {
        investmentCategories.forEach((cat) => {
            const actualIndex = categories.findIndex(f => f.name === cat.name);
            investmentFundsDiv.appendChild(renderFundAsTablet(cat, actualIndex));
        });
      } else {
          investmentFundsDiv.innerHTML = '<p style="text-align: center; font-size: 0.9em; color: var(--text-color); grid-column: 1 / -1;">No Investment funds created.</p>';
      }


      categories.forEach((cat, index) => {
        if (cat.type === 'expense' && cat.deductionType !== 'auto') {
            paySelect.innerHTML += `<option value='${index}'>${cat.name} (${currentCurrencySymbol}${cat.balance.toFixed(2)})</option>`;
        }
        if (cat.type === 'expense' && cat.deductionType === 'manual') {
            transferFromSelect.innerHTML += `<option value='${index}'>${cat.name} (${currentCurrencySymbol}${cat.balance.toFixed(2)})</option>`;
            transferToSelect.innerHTML += `<option value='${index}'>${cat.name} (${currentCurrencySymbol}${cat.balance.toFixed(2)})</option>`;
        }
      });

      const totalSpent = categories.reduce((sum, cat) => sum + cat.spent, 0);
      displayTotalExpensesSpan.textContent = totalSpent.toFixed(2);
      totalBalanceSpan.textContent = (monthlyIncome - totalSpent).toFixed(2);

      let totalManualExpenses = 0;
      let totalAutoDeductExpenses = 0;
      let totalInvestments = 0;

      categories.forEach(cat => {
          if (cat.type === 'expense') {
              if (cat.deductionType === 'auto') {
                  totalAutoDeductExpenses += cat.spent;
              } else {
                  totalManualExpenses += cat.spent;
              }
          } else if (cat.type === 'investment') {
              totalInvestments += cat.spent;
          }
      });

      expenseSummaryTextDiv.innerHTML = `
          <p>Total Manual Expenses: <strong>${currentCurrencySymbol}${totalManualExpenses.toFixed(2)}</strong></p>
          <p>Total Auto-Deduct (EMI/Loan) Expenses: <strong>${currentCurrencySymbol}${totalAutoDeductExpenses.toFixed(2)}</strong></p>
          <p>Total Investments: <strong>${currentCurrencySymbol}${totalInvestments.toFixed(2)}</strong></p>
          <p>Overall Total Expenses: <strong>${currentCurrencySymbol}${totalSpent.toFixed(2)}</strong></p>
      `;

      renderPieChart(categories);
      renderDashboardGauges();
      checkAndAddNotifications();
    }

    function renderPieChart(categories) {
        const ctx = document.getElementById('expensePieChart').getContext('2d');
        const expensesData = categories.filter(cat => cat.spent > 0 && (cat.type === 'expense' || cat.type === 'investment'));

        const labels = expensesData.map(cat => cat.name);
        const data = expensesData.map(cat => cat.spent);

        const backgroundColors = expensesData.map((_, i) => `hsl(${(i * 70 + 30) % 360}, 70%, 70%)`);
        const borderColors = expensesData.map((_, i) => `hsl(${(i * 70 + 30) % 360}, 70%, 50%)`);


        if (expensePieChart) {
            expensePieChart.destroy();
        }

        expensePieChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-color'),
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += currencySymbols[appSettings.currency] + context.parsed.toFixed(2);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    async function setMonthlyIncome(incomeFromBot = null) {
        const incomeInput = document.getElementById('monthlyIncomeInput');
        const income = incomeFromBot !== null ? parseFloat(incomeFromBot) : parseFloat(incomeInput.value);
        const currentMonthData = getCurrentMonthData();
        const currentCurrencySymbol = currencySymbols[appSettings.currency];

        if (isNaN(income) || income < 0) {
            await showAlert('Please enter a valid non-negative income amount.');
            if (incomeFromBot === null) incomeInput.focus();
            return false;
        }

        const tutorialActiveAndIncomeStep = localStorage.getItem('tutorialShown') !== 'true' && currentTutorialStep === 0;

        if (currentMonthData.income > 0 && income !== currentMonthData.income && !tutorialActiveAndIncomeStep) {
            const confirmed = await showConfirm('You have already set an income for this month. Do you want to update it?');
            if (!confirmed) {
                if (incomeFromBot === null) incomeInput.value = currentMonthData.income.toFixed(2);
                return false;
            }
        }

        currentMonthData.income = income;
        addToHistory({
            type: 'income_set',
            amount: income,
            description: `Monthly income set/updated to ${currentCurrencySymbol}${income.toFixed(2)}`
        });
        showToast(`Monthly income updated to ${currentCurrencySymbol}${income.toFixed(2)}`);
        if (incomeFromBot === null) incomeInput.value = income.toFixed(2);
        render();

        if (tutorialActiveAndIncomeStep) {
            currentTutorialStep++;
        }
        return true;
    }

    function toggleAutoDeductOptions() {
        const isAutoDeductCheckbox = document.getElementById('modalIsAutoDeduct');
        const dueDayInputContainer = document.getElementById('modalDueDayInputContainer');

        if (isAutoDeductCheckbox && dueDayInputContainer) {
            if (isAutoDeductCheckbox.checked) {
                dueDayInputContainer.classList.add('show');
            } else {
                dueDayInputContainer.classList.remove('show');
                const dueDayInput = document.getElementById('modalNewFundDueDay');
                if(dueDayInput) dueDayInput.value = '';
            }
        }
    }
    function toggleModalAutoDeductOptions() {
        toggleAutoDeductOptions();
    }


    async function createFundFromModal(fundDetailsFromBot = null) {
        const currentMonthData = getCurrentMonthData();
        if (currentMonthData.income <= 0 && !fundDetailsFromBot) {
            await showAlert('Please set your monthly income first before creating a fund.', 'Set Income Required');
            highlightElement('monthlyIncomeInput', 4000);
            document.getElementById('monthlyIncomeInput').focus();
            document.getElementById('monthlyIncomeInput').closest('.card').style.display = 'block';
            closeCreateFundModal();
            return false;
        }

        const name = fundDetailsFromBot ? fundDetailsFromBot.name : document.getElementById('modalNewFundName').value.trim();
        const amount = fundDetailsFromBot ? fundDetailsFromBot.amount : parseFloat(document.getElementById('modalNewFundAmount').value);
        const fundType = fundDetailsFromBot ? fundDetailsFromBot.type : document.querySelector('input[name="modalFundType"]:checked').value;
        const deductionType = fundDetailsFromBot ? fundDetailsFromBot.deductionType : (document.getElementById('modalIsAutoDeduct').checked ? 'auto' : 'manual');
        let dueDay = fundDetailsFromBot ? fundDetailsFromBot.dueDay : null;

        if (!fundDetailsFromBot && deductionType === 'auto') {
            const dueDayInput = document.getElementById('modalNewFundDueDay');
            const dueDayValue = parseInt(dueDayInput.value);
            if (dueDayInput.value && (isNaN(dueDayValue) || dueDayValue < 1 || dueDayValue > 31)) {
                await showAlert('Please enter a valid Due Day (1-31) or leave it blank for auto-deductible funds.');
                return false;
            }
            if(dueDayInput.value) dueDay = dueDayValue;
        }


        const currentCurrencySymbol = currencySymbols[appSettings.currency];

        if (!name || isNaN(amount) || amount < 0) {
            if (!fundDetailsFromBot) await showAlert('Please enter a valid fund name and a non-negative initial amount.');
            return false;
        }

        if (deductionType === 'auto' && amount <= 0) {
             if (!fundDetailsFromBot) await showAlert('For auto-deductible funds, the initial amount must be a positive value.');
             return false;
        }

        const existingFund = currentMonthData.categories.find(cat => cat.name.toLowerCase() === name.toLowerCase());
        if (existingFund) {
            if (!fundDetailsFromBot) await showAlert(`A fund with the name '${name}' already exists. Please choose a different name.`);
            return false;
        }

        let newFund = {
            name,
            initialBalance: amount,
            type: fundType,
            deductionType: deductionType,
            emiAmount: 0,
            balance: amount,
            spent: 0,
            dueDay: deductionType === 'auto' ? dueDay : null
        };

        if (deductionType === 'auto') {
            newFund.emiAmount = amount;
            newFund.balance = amount - newFund.emiAmount;
            newFund.spent = newFund.emiAmount;
        } else {
            if (fundType === 'investment') {
                newFund.spent = amount;
            } else {
                newFund.spent = 0;
            }
        }


        currentMonthData.categories.push(newFund);
        let historyDescription = `Created new ${fundType} fund '${name}' with ${currentCurrencySymbol}${amount.toFixed(2)} (Deduction: ${deductionType === 'auto' ? `Auto, EMI: ${currentCurrencySymbol}${newFund.emiAmount.toFixed(2)}` : 'Manual'})`;
        if (deductionType === 'auto' && newFund.dueDay) {
            historyDescription += `, Due: ${formatDueDate(newFund.dueDay, currentMonth)}`;
        }
        addToHistory({
            type: 'fund_creation',
            fundName: name,
            amount: amount,
            fundType: fundType,
            deductionType: deductionType,
            dueDay: newFund.dueDay,
            description: historyDescription
        });
        showToast(`Fund '${name}' created!`);

        if (!fundDetailsFromBot) {
            document.getElementById('modalNewFundName').value = '';
            document.getElementById('modalNewFundAmount').value = '';
            document.getElementById('modalNewFundDueDay').value = '';
            document.querySelector('input[name="modalFundType"][value="expense"]').checked = true;
            document.getElementById('modalIsAutoDeduct').checked = false;
            toggleModalAutoDeductOptions();
            closeCreateFundModal();
        }
        render();

        if (localStorage.getItem('tutorialShown') !== 'true' && currentTutorialStep === 1 && !fundDetailsFromBot) {
            currentTutorialStep++;
            setTimeout(showNextTutorialStep, 300);
        }
        return true;
    }

    const createFundModal = document.getElementById('createFundModal');
    function openCreateFundModal() {
        document.getElementById('modalNewFundName').value = '';
        document.getElementById('modalNewFundAmount').value = '';
        document.querySelector('input[name="modalFundType"][value="expense"]').checked = true;
        document.getElementById('modalIsAutoDeduct').checked = false;
        document.getElementById('modalNewFundDueDay').value = '';
        toggleModalAutoDeductOptions();

        createFundModal.classList.add('active');
        if (localStorage.getItem('tutorialShown') !== 'true' && currentTutorialStep === 1) {
             currentTutorialStep++;
             setTimeout(showNextTutorialStep, 300);
        }
    }
    function closeCreateFundModal() {
        createFundModal.classList.remove('active');
    }


    async function deleteFundFromEditModal() {
        const currentMonthData = getCurrentMonthData();
        const fundName = editingFundNameOriginalInput.value;

        const confirmed = await showConfirm(`Are you sure you want to delete the fund '${fundName}'? This action cannot be undone.`, 'Delete Fund');
        if (confirmed) {
            const actualIndex = currentMonthData.categories.findIndex(cat => cat.name === fundName);
            if (actualIndex !== -1) {
                const deletedFund = currentMonthData.categories.splice(actualIndex, 1)[0];
                addToHistory({
                    type: 'fund_deletion',
                    fundName: deletedFund.name,
                    initialBalance: deletedFund.initialBalance,
                    fundType: deletedFund.type,
                    deductionType: deletedFund.deductionType,
                    emiAmount: deletedFund.emiAmount,
                    balance: deletedFund.balance,
                    spent: deletedFund.spent,
                    dueDay: deletedFund.dueDay,
                    description: `Deleted fund '${deletedFund.name}' from edit modal.`
                });
                showToast(`Fund '${fundName}' deleted.`);
                closeEditFundModal();
                render();
            } else {
                showAlert(`Error: Could not find fund '${fundName}' to delete.`, "Delete Error");
            }
        }
    }

    // --- QR Scanner Modal Functions - UPDATED with Debugging ---
function openQrScannerModal() {
    console.log("Attempting to open QR Scanner Modal...");
    const qrModal = document.getElementById('qrScannerModal');
    const qrScanResultEl = document.getElementById('qrScanResult');
    const qrScannerViewEl = document.getElementById('qrScannerView');

    if (!qrModal || !qrScanResultEl || !qrScannerViewEl) {
        console.error("QR Modal elements not found! Cannot open scanner.");
        return;
    }

    qrModal.classList.add('active');
    qrScannerViewEl.innerHTML = '<p style="color: var(--text-color); opacity: 0.7;">Initializing camera...</p>';
    if (qrScanResultEl) qrScanResultEl.textContent = 'Point camera at a QR code.';

    // Initialize or re-initialize html5QrCodeScanner instance
    // This ensures a clean state if the modal was opened before or had issues.
    try {
        if (html5QrCodeScanner && typeof html5QrCodeScanner.stop === 'function') {
             // Attempt to stop any previous instance cleanly if it exists and might be scanning
             html5QrCodeScanner.stop().catch(err => console.warn("Previous scanner stop error (non-critical):", err));
        }
        console.log("Initializing new Html5Qrcode instance.");
        html5QrCodeScanner = new Html5Qrcode("qrScannerView", { verbose: true });
    } catch (e) {
        console.error("Failed to initialize Html5Qrcode:", e);
        if (qrScannerViewEl) qrScannerViewEl.innerHTML = `<p style="color: red;">Error initializing scanner: ${e.message || e}</p>`;
        return;
    }

    // Define qrConfig *before* calling start()
    const qrConfig = {
        fps: 10,
        qrbox: (videoWidth, videoHeight) => {
            const minEdge = Math.min(videoWidth, videoHeight);
            const qrboxSize = Math.floor(minEdge * 0.70); // Use 70% of the smaller dimension
            console.log(`Calculated qrbox size: ${qrboxSize} for video ${videoWidth}x${videoHeight}`);
            return { width: qrboxSize, height: qrboxSize };
        },
        rememberLastUsedCamera: true,
        // aspectRatio: 1.0, // Optional: if you want a square scanning region strictly
    };

    console.log("Starting CAMERA scanner with simplified constraints and config:", qrConfig);
    if (qrScannerViewEl) qrScannerViewEl.innerHTML = ''; // Clear "Initializing camera..." text

    html5QrCodeScanner.start(
        { facingMode: "environment" }, // Basic camera request
        qrConfig,                      // Pass the defined qrConfig
        (decodedText, decodedResult) => { // Success callback for CAMERA scan
            console.log("CAMERA SCAN SUCCESS (simplified start):", decodedText, decodedResult);
            if (typeof qrCodeSuccessCallback === 'function') {
                qrCodeSuccessCallback(decodedText, decodedResult);
            } else {
                console.error("qrCodeSuccessCallback is not defined when camera scan succeeded.");
            }
        },
        (errorMessage) => { // Partial result or error callback for CAMERA scan
            // This is called frequently by the library, e.g., when no QR is found.
            // Avoid updating UI here too often to prevent flicker.
            // console.log(`Camera Scanner Message (non-critical): ${errorMessage}`);
        }
    ).catch(err => {
        console.error("CRITICAL ERROR starting camera scanner:", err);
        if (qrScannerViewEl) {
            qrScannerViewEl.innerHTML = `<p style="color: red;">Camera Error: ${err.message || err}. Please ensure camera access is allowed.</p>`;
        }
        if (qrScanResultEl) {
            qrScanResultEl.textContent = "Camera initialisation failed. Try uploading an image.";
        }
        showToast("Camera failed to start. Check console for details.");
    });

    // Setup file input listener
    const qrFileInput = document.getElementById('qrFileInput');
    qrFileInput.onchange = (event) => {
        const file = event.target.files[0];
        const localQrScanResultEl = document.getElementById('qrScanResult'); // Get fresh reference

        if (!file) {
            console.log("No file selected for scanning.");
            return;
        }

        console.log("File selected for QR scan:", file.name, "Type:", file.type, "Size:", file.size);
        if (localQrScanResultEl) localQrScanResultEl.textContent = `Preparing to scan: ${file.name}...`;

        // Ensure camera scanning is stopped before processing a file
        if (html5QrCodeScanner && typeof html5QrCodeScanner.stop === 'function') {
            let needsStop = false;
            try {
                // Check scanner state cautiously, as getState or Html5QrcodeScannerState might not always be available/reliable
                if (typeof Html5QrcodeScannerState !== 'undefined' && typeof html5QrCodeScanner.getState === 'function') {
                     needsStop = html5QrCodeScanner.getState() === Html5QrcodeScannerState.SCANNING;
                } else if (typeof html5QrCodeScanner.isScanning === 'boolean') {
                     needsStop = html5QrCodeScanner.isScanning;
                } else { // If state is unknown but instance exists, assume it might need stopping
                    needsStop = true; console.warn("Scanner state unknown, attempting stop before file scan.");
                }
            } catch(e) { console.warn("Could not reliably get scanner state for stopping before file scan.", e); needsStop = true;}
            
            if (needsStop) {
                console.log("Stopping camera scanner for file upload.");
                html5QrCodeScanner.stop().catch(err => console.error("Error stopping camera for file scan (non-critical):", err));
            }
        }
        
        setTimeout(() => {
            console.log("Attempting to scan file with html5QrCodeScanner.scanFile()...");
            if (localQrScanResultEl) localQrScanResultEl.textContent = `Scanning image: ${file.name}...`;

            if (!html5QrCodeScanner) {
                console.error("html5QrCodeScanner instance is not available for file scan! Re-initializing.");
                // Attempt to re-initialize if it's somehow lost (should not happen ideally)
                try {
                    html5QrCodeScanner = new Html5Qrcode("qrScannerView", { verbose: true });
                } catch (e) {
                     console.error("Failed to re-initialize Html5Qrcode for file scan:", e);
                     if (localQrScanResultEl) localQrScanResultEl.textContent = "Error: Scanner component failed.";
                     if (typeof qrCodeErrorCallback === 'function') qrCodeErrorCallback("Scanner component failed for file scan.");
                     return;
                }
            }

            html5QrCodeScanner.scanFile(file, true) // showImage = true
                .then(decodedText => {
                    console.log("FILE SCAN SUCCESS:", decodedText);
                    if (localQrScanResultEl) localQrScanResultEl.textContent = `File Scan Success!`;
                    if (typeof qrCodeSuccessCallback === 'function') {
                        qrCodeSuccessCallback(decodedText, { isFileScan: true, fileName: file.name });
                    } else {
                        console.error("qrCodeSuccessCallback is not defined when file scan succeeded.");
                    }
                })
                .catch(err => {
                    console.error("ERROR scanning QR image file with scanFile():", err);
                    let errorMessageText = "Error scanning file.";
                    if (err && err.message) errorMessageText = err.message;
                    else if (typeof err === 'string') errorMessageText = err;
                    
                    if (localQrScanResultEl) {
                        if (errorMessageText.toLowerCase().includes("no qr code found")) {
                            localQrScanResultEl.textContent = 'No QR code found in the image or it could not be decoded.';
                        } else {
                            localQrScanResultEl.textContent = 'Error: ' + errorMessageText;
                        }
                    }
                    if (typeof qrCodeErrorCallback === 'function') {
                        qrCodeErrorCallback('File scan error: ' + errorMessageText);
                    }
                    showToast("Failed to scan QR from image.");
                });
        }, 250); // Increased delay slightly
    };
}

function closeQrScannerModalVisualsOnly() {
    console.log("Cleaning up QR scanner modal visuals.");
    const qrModal = document.getElementById('qrScannerModal');
    if (qrModal) qrModal.classList.remove('active');

    const qrScannerViewEl = document.getElementById('qrScannerView');
    if (qrScannerViewEl) qrScannerViewEl.innerHTML = ''; // Clear the video feed/placeholder

    const qrFileInput = document.getElementById('qrFileInput');
    if (qrFileInput) qrFileInput.value = null; // Reset file input

    const qrScanResultEl = document.getElementById('qrScanResult');
    if (qrScanResultEl) qrScanResultEl.textContent = ''; // Clear result text
}



function closeQrScannerModal() {
    console.log("closeQrScannerModal called (likely manual cancel or explicit full close).");
    
    if (html5QrCodeScanner && typeof html5QrCodeScanner.stop === 'function') {
        let scannerIsActive = false;
        try {
            if (typeof Html5QrcodeScannerState !== 'undefined' && typeof html5QrCodeScanner.getState === 'function') {
                scannerIsActive = html5QrCodeScanner.getState() === Html5QrcodeScannerState.SCANNING;
            } else if (typeof html5QrCodeScanner.isScanning === 'boolean') {
                scannerIsActive = html5QrCodeScanner.isScanning;
            } else {
                // If state is unknown but instance exists, assume we should try to stop.
                console.warn("Scanner state unknown in closeQrScannerModal, attempting stop.");
                scannerIsActive = true; // Force attempt to stop
            }
        } catch(e) {
            console.error("Error checking scanner state in closeQrScannerModal:", e);
            scannerIsActive = true; // Force attempt to stop if state check fails
        }

        if (scannerIsActive) {
            console.log("Attempting to stop scanner via closeQrScannerModal.");
            html5QrCodeScanner.stop()
                .then(() => console.log("Scanner stopped via closeQrScannerModal."))
                .catch(err => console.error("Error stopping scanner in closeQrScannerModal:", err));
        } else {
            console.log("Scanner reported as not active in closeQrScannerModal, or stop method not available.");
        }
    } else {
        console.log("No html5QrCodeScanner instance or stop method to call in closeQrScannerModal.");
    }
    
    closeQrScannerModalVisualsOnly(); // Clean up UI elements

    // If a scan was initiated (flag is true) but is being cancelled by this modal closure
    // before processScannedUpiData's finally block could reset it, reset it now.
    if (isProcessingUPIScan) {
        console.log("Scan process was active, resetting isProcessingUPIScan due to modal close/cancel.");
        isProcessingUPIScan = false;
    }
}

// GLOBAL CALLBACKS - Ensure these are defined in the global scope of your script.js

async function processScannedUpiData(upiUrl) {
    // isProcessingUPIScan flag should have been set by qrCodeSuccessCallback
    console.log("Processing Scanned UPI Data (scanner should be stopped or stopping):", upiUrl);
    
    // Clean up modal visuals. The scanner itself was commanded to stop in qrCodeSuccessCallback.
    closeQrScannerModalVisualsOnly(); 

    const currentMonthData = getCurrentMonthData();
    const amountInput = document.getElementById('payAmount');
    const amount = parseFloat(amountInput.value);
    const currentCurrencySymbol = currencySymbols[appSettings.currency];

    // --- Validations ---
    if (isNaN(amount) || amount <= 0) {
        await showAlert('Please enter a valid positive amount for the transaction before scanning.');
        setTimeout(() => { isProcessingUPIScan = false; console.log("isProcessingUPIScan flag reset (amount error)."); }, 100);
        return;
    }

    const payCategorySelect = document.getElementById('payCategory');
    const index = parseInt(payCategorySelect.value);

    if (isNaN(index) || index < 0 || !currentMonthData.categories || index >= currentMonthData.categories.length) {
        await showAlert('Please select a valid fund before scanning.');
        setTimeout(() => { isProcessingUPIScan = false; console.log("isProcessingUPIScan flag reset (fund selection error)."); }, 100);
        return;
    }
    const fundToPayFrom = currentMonthData.categories[index];

    if (!fundToPayFrom) { // Should be caught by previous check, but as a safeguard
        await showAlert('Selected fund not found. Please try again.');
        setTimeout(() => { isProcessingUPIScan = false; console.log("isProcessingUPIScan flag reset (fund not found error)."); }, 100);
        return;
    }

    if (fundToPayFrom.balance < amount) {
        await showAlert(`Insufficient funds in ${fundToPayFrom.name}. Current balance: ${currentCurrencySymbol}${fundToPayFrom.balance.toFixed(2)}`);
        setTimeout(() => { isProcessingUPIScan = false; console.log("isProcessingUPIScan flag reset (insufficient funds error)."); }, 100);
        return;
    }
    // --- End Validations ---

    // Log the expense internally
    fundToPayFrom.balance -= amount;
    fundToPayFrom.spent += amount;
    addToHistory({
        type: 'expense_scan_pay',
        fundName: fundToPayFrom.name,
        amount: amount,
        upi: upiUrl,
        description: `Paid ${currentCurrencySymbol}${amount.toFixed(2)} from ${fundToPayFrom.name} via Scan & Pay.`
    });
    showToast(`Logged ${currentCurrencySymbol}${amount.toFixed(2)} from '${fundToPayFrom.name}'. Opening payment app...`);
    render(); // Update UI

    try {
        console.log("Attempting to open UPI URL:", upiUrl);
        window.open(upiUrl, '_blank');
    } catch (e) {
        console.error("Error opening UPI link:", e);
        await showAlert("Could not automatically open payment app. Please try opening your UPI app manually or check app permissions.", "Payment App Error");
    } finally {
        // Reset the flag after a cooldown period to allow app switching and prevent immediate re-triggering.
        setTimeout(() => {
            isProcessingUPIScan = false;
            console.log("isProcessingUPIScan flag reset after UPI processing and cooldown delay.");
        }, 2500); // Cooldown period of 2.5 seconds. Adjust if necessary.
    }
}

function qrCodeSuccessCallback(decodedText, decodedResult) {
    console.log(`GLOBAL qrCodeSuccessCallback! Decoded Text: "${decodedText}"`, decodedResult);

    if (isProcessingUPIScan) {
        console.warn("qrCodeSuccessCallback: Scan processing already in progress or recently completed. Ignoring duplicate call.");
        return;
    }
    isProcessingUPIScan = true; // Set flag immediately to block re-entry

    const qrScanResultEl = document.getElementById('qrScanResult');
    if (qrScanResultEl) qrScanResultEl.textContent = `Scan successful! Stopping scanner...`;

    if (html5QrCodeScanner && typeof html5QrCodeScanner.stop === 'function') {
        console.log("Attempting to stop scanner in qrCodeSuccessCallback before processing UPI data...");
        html5QrCodeScanner.stop()
            .then(() => {
                console.log("Scanner stopped successfully (from success callback). Now processing UPI data.");
                processScannedUpiData(decodedText); // Process data AFTER scanner is confirmed stopped
            })
            .catch(err => {
                console.error("Error stopping scanner in qrCodeSuccessCallback, but proceeding to process UPI data anyway:", err);
                processScannedUpiData(decodedText); // Proceed to not block the user
            });
    } else {
        console.warn("html5QrCodeScanner instance or stop method not available at qrCodeSuccessCallback. Proceeding directly to process UPI data.");
        processScannedUpiData(decodedText);
    }
}

function qrCodeErrorCallback(errorMessage) {
    console.error("GLOBAL qrCodeErrorCallback:", errorMessage);
    const qrScanResultEl = document.getElementById('qrScanResult');
    if (qrScanResultEl) {
        qrScanResultEl.textContent = `Scan Error: ${errorMessage}`;
    }
    showToast(`Scan Error: ${errorMessage}`);
}   

    // --- End QR Scanner Modal Functions ---


async function handlePay(payDetailsFromBot = null) {
    const payCategorySelect = document.getElementById('payCategory');
    const amountInput = document.getElementById('payAmount');
    const currentMonthData = getCurrentMonthData();
    const currentCurrencySymbol = currencySymbols[appSettings.currency];

    // Get selected payment method
    const paymentMethodRadio = document.querySelector('input[name="paymentMethod"]:checked');
    const paymentMethod = paymentMethodRadio ? paymentMethodRadio.value : 'cash'; // Default to cash if nothing selected

    let fundName, amount;

    if (payDetailsFromBot) {
        // ... (your existing bot handling logic)
        fundName = payDetailsFromBot.fundName;
        amount = payDetailsFromBot.amount;
    } else {
        const index = parseInt(payCategorySelect.value);
        if (isNaN(index) || index < 0 || !currentMonthData.categories || index >= currentMonthData.categories.length) {
            await showAlert('Please select a valid fund to pay from.');
            return false;
        }
        fundName = currentMonthData.categories[index].name;
        amount = parseFloat(amountInput.value);
    }

    const fundToPayFrom = currentMonthData.categories.find(cat => cat.name.toLowerCase() === fundName.toLowerCase());

    // --- Common Validations ---
    if (!fundToPayFrom) {
        await showAlert(`Fund '${fundName}' not found.`);
        return false;
    }
    if (fundToPayFrom.type !== 'expense') {
        await showAlert('You can only log expenses from Expense funds.');
        return false;
    }
    if (fundToPayFrom.deductionType === 'auto') {
        await showAlert('Auto-deduct funds cannot be used for manual transactions.');
        return false;
    }
    if (isNaN(amount) || amount <= 0) {
      await showAlert('Please enter a valid positive amount for the transaction.');
      return false;
    }
    if (fundToPayFrom.balance < amount) {
      await showAlert(`Insufficient funds in ${fundToPayFrom.name}. Current balance: ${currentCurrencySymbol}${fundToPayFrom.balance.toFixed(2)}`);
      return false;
    }
    // --- End Common Validations ---

    // --- Payment Method Specific Logic ---
    if (paymentMethod === 'scanAndPay' && !payDetailsFromBot) {
        if (isProcessingUPIScan) { // Check the flag for QR scan processing
             await showAlert('A QR scan is already in progress or completing. Please wait.');
             return false;
        }
        openQrScannerModal(); // This will now handle its own processing flag internally via qrCodeSuccessCallback
        return true; 
    } else if (paymentMethod === 'payViaUpiApp' && !payDetailsFromBot) {
        // Log the expense first
        fundToPayFrom.balance -= amount;
        fundToPayFrom.spent += amount;
        addToHistory({
            type: 'expense_pay_via_app', // New history type
            fundName: fundToPayFrom.name,
            amount: amount,
            paymentApp: appSettings.defaultPaymentApp, // Store which app was intended
            description: `Paid ${currentCurrencySymbol}${amount.toFixed(2)} from ${fundToPayFrom.name} (via ${appSettings.defaultPaymentApp})`
        });
        showToast(`Logged ${currentCurrencySymbol}${amount.toFixed(2)} from '${fundToPayFrom.name}'. Opening ${appSettings.defaultPaymentApp}...`);
        if (!payDetailsFromBot) amountInput.value = '';
        render();

        // Open the selected default payment app
        const selectedPaymentAppKey = appSettings.defaultPaymentApp; // e.g., "GPay", "PhonePe", "AmazonPay"
        const selectedAppDeeplinkUrl = paymentAppUrls[selectedPaymentAppKey];

        if (selectedAppDeeplinkUrl) {
            console.log(`Opening ${selectedPaymentAppKey} via deeplink: ${selectedAppDeeplinkUrl}`);
            try {
                 window.open(selectedAppDeeplinkUrl, '_blank');
            } catch (e) {
                console.error(`Error opening ${selectedPaymentAppKey} deeplink:`, e);
                await showAlert(`Could not open ${selectedPaymentAppKey}. The app might not be installed or the link is incorrect.`);
            }
        } else {
            await showAlert(`No deeplink URL configured for ${selectedPaymentAppKey}. Please check app settings.`);
        }
        return true;
    } else { // Default to 'cash' or if called by bot (assuming bot payments are direct logs)
        fundToPayFrom.balance -= amount;
        fundToPayFrom.spent += amount;
        addToHistory({
            type: 'expense_cash', 
            fundName: fundToPayFrom.name,
            amount: amount,
            description: `Paid ${currentCurrencySymbol}${amount.toFixed(2)} (Cash) from ${fundToPayFrom.name}`
        });
        showToast(`Paid ${currentCurrencySymbol}${amount.toFixed(2)} from '${fundToPayFrom.name}'.`);
        if (!payDetailsFromBot) amountInput.value = '';
        render();
        return true;
    }
}
    async function transferFunds(transferDetailsFromBot = null) {
        const transferFromSelect = document.getElementById('transferFromCategory');
        const transferToSelect = document.getElementById('transferToCategory');
        const amountInput = document.getElementById('transferAmount');
        const currentMonthData = getCurrentMonthData();
        const currentCurrencySymbol = currencySymbols[appSettings.currency];

        let fromFundName, toFundName, amount;

        if (transferDetailsFromBot) {
            fromFundName = transferDetailsFromBot.fromFundName;
            toFundName = transferDetailsFromBot.toFundName;
            amount = transferDetailsFromBot.amount;
        } else {
            const fromIndex = parseInt(transferFromSelect.value);
            const toIndex = parseInt(transferToSelect.value);
            if (isNaN(fromIndex) || fromIndex < 0 || fromIndex >= currentMonthData.categories.length ||
                isNaN(toIndex) || toIndex < 0 || toIndex >= currentMonthData.categories.length) {
                await showAlert('Please select valid "From" and "To" funds for the transfer.');
                return false;
            }
            fromFundName = currentMonthData.categories[fromIndex].name;
            toFundName = currentMonthData.categories[toIndex].name;
            amount = parseFloat(amountInput.value);
        }


        if (isNaN(amount) || amount <= 0) {
            await showAlert('Please enter a valid positive amount to transfer.');
            return false;
        }
        if (fromFundName.toLowerCase() === toFundName.toLowerCase()) {
            await showAlert('Cannot transfer funds to the same fund.');
            return false;
        }

        const fromFund = currentMonthData.categories.find(f => f.name.toLowerCase() === fromFundName.toLowerCase());
        const toFund = currentMonthData.categories.find(f => f.name.toLowerCase() === toFundName.toLowerCase());

        if (!fromFund || !toFund) {
            await showAlert('One or both funds for transfer not found.');
            return false;
        }

        if (fromFund.type === 'investment' || toFund.type === 'investment') {
            await showAlert('Transfers to or from Investment funds are not allowed.');
            return false;
        }
        if ((fromFund.type === 'expense' && fromFund.deductionType === 'auto') || (toFund.type === 'expense' && toFund.deductionType === 'auto')) {
            await showAlert('Transfers involving Auto-Deduct (EMI/Loan) funds are not allowed.');
            return false;
        }

        if (fromFund.balance < amount) {
            await showAlert(`Insufficient funds in ${fromFund.name}. Current balance: ${currentCurrencySymbol}${fromFund.balance.toFixed(2)}`);
            return false;
        }

        fromFund.balance -= amount;
        toFund.balance += amount;

        addToHistory({
            type: 'transfer',
            fromFund: fromFund.name,
            toFund: toFund.name,
            amount: amount,
            description: `Transferred ${currentCurrencySymbol}${amount.toFixed(2)} from ${fromFund.name} to ${toFund.name}`
        });
        showToast(`Transferred ${currentCurrencySymbol}${amount.toFixed(2)} from '${fromFund.name}' to '${toFund.name}'.`);
        if (!transferDetailsFromBot) amountInput.value = '';
        render();
        return true;
    }

    function addToHistory(transaction) {
      transaction.timestamp = new Date().toISOString();
      const currentMonthData = getCurrentMonthData();
      currentMonthData.history.unshift(transaction);
      currentMonthData.history = currentMonthData.history.slice(0, 50);
    }

    async function revertLastTransaction() {
        const currentMonthData = getCurrentMonthData();
        if (currentMonthData.history.length === 0) {
            await showAlert('No transactions to revert.');
            return;
        }

        const lastTransaction = currentMonthData.history[0];
        const currentCurrencySymbol = currencySymbols[appSettings.currency];

        const confirmed = await showConfirm(`Are you sure you want to revert the last transaction: "${lastTransaction.description}"?`, 'Confirm Revert');
        if (!confirmed) {
            return;
        }

        let success = false;
        let revertDescription = '';

        try {
            switch (lastTransaction.type) {
                case 'expense_cash':
                case 'expense_scan_pay':
                    const expenseFund = currentMonthData.categories.find(cat => cat.name === lastTransaction.fundName);
                    if (expenseFund) {
                        expenseFund.balance += lastTransaction.amount;
                        expenseFund.spent -= lastTransaction.amount;
                        revertDescription = `Reverted expense of ${currentCurrencySymbol}${lastTransaction.amount.toFixed(2)} from ${lastTransaction.fundName}.`;
                        success = true;
                    } else {
                        revertDescription = `Failed to revert: Fund '${lastTransaction.fundName}' not found.`;
                    }
                    break;
                case 'transfer':
                    const fromFund = currentMonthData.categories.find(cat => cat.name === lastTransaction.fromFund);
                    const toFund = currentMonthData.categories.find(cat => cat.name === lastTransaction.toFund);
                    if (fromFund && toFund) {
                        fromFund.balance += lastTransaction.amount;
                        toFund.balance -= lastTransaction.amount;
                        revertDescription = `Reverted transfer of ${currentCurrencySymbol}${lastTransaction.amount.toFixed(2)} from ${lastTransaction.fromFund} to ${lastTransaction.toFund}.`;
                        success = true;
                    } else {
                        revertDescription = `Failed to revert: One or both funds for transfer not found.`;
                    }
                    break;
                case 'income_set':
                    revertDescription = `Reverting income set is not directly supported. Please manually adjust income if needed.`;
                    break;
                case 'fund_creation':
                    revertDescription = `Reverting fund creation is not directly supported. Please manually delete the fund if needed.`;
                    break;
                case 'fund_deletion':
                    revertDescription = `Reverting fund deletion is not directly supported. Please manually recreate the fund if needed.`;
                    break;
                case 'emi_deduction':
                    revertDescription = `Reverting auto-deducted EMI is not directly supported.`;
                    break;
                default:
                    revertDescription = `Cannot revert this type of transaction: ${lastTransaction.type}.`;
                    break;
            }

            if (success) {
                currentMonthData.history.shift();
                addToHistory({
                    type: 'revert_action',
                    originalTransactionType: lastTransaction.type,
                    description: revertDescription
                });
                showToast(revertDescription);
                render();
            } else {
                await showAlert(revertDescription, 'Revert Failed');
            }

        } catch (error) {
            console.error("Error during transaction revert:", error);
            await showAlert(`An error occurred while trying to revert the transaction. ${error.message}`, 'Revert Error');
        }
    }


    async function resetData() {
      const confirmed = await showConfirm(`Are you sure you want to reset all funds, income, and history for ${getFullDateString(currentMonth)}? This action is irreversible.`, 'Reset Data');
      if (confirmed) {
        const currentMonthData = getCurrentMonthData();
        currentMonthData.income = 0;
        currentMonthData.categories = [];
        currentMonthData.history = [];
        currentMonthData.emiDeducted = false;
        currentMonthData.fundsImported = false;
        appSettings.notifications = [];
        saveAppSettings();
        saveData();
        render();
        await showAlert(`All data for ${getFullDateString(currentMonth)} has been reset.`, 'Data Reset');
        showToast(`All data for ${getFullDateString(currentMonth)} has been reset.`);
      }
    }

    function toggleHistory() {
      const historyDiv = document.getElementById('history');
      const historyToggleIcon = document.getElementById('historyToggleIcon');
      const isHidden = historyDiv.style.display === 'none';
      historyDiv.style.display = isHidden ? 'block' : 'none';
      historyToggleIcon.textContent = isHidden ? '▲' : '▼';
    }

    function toggleFaqSection() {
        const faqContentDiv = document.getElementById('faqContent');
        const isHidden = faqContentDiv.style.display === 'none';
        faqContentDiv.style.display = isHidden ? 'block' : 'none';
    }

    function toggleFaqSectionSettings() {
        const faqContentDiv = document.getElementById('faqContentSettings');
        const faqToggleIcon = document.getElementById('faqToggleIconSettings');
        const isHidden = faqContentDiv.style.display === 'none';
        faqContentDiv.style.display = isHidden ? 'block' : 'none';
        faqToggleIcon.textContent = isHidden ? '▲' : '▼';
    }


    function toggleFaqAnswer(element) {
        const answer = element.nextElementSibling;
        const icon = element.querySelector('.faq-toggle-icon');
        if (icon) {
            if (answer.classList.contains('active')) {
                answer.classList.remove('active');
                icon.style.transform = 'rotate(0deg)';
            } else {
                answer.classList.add('active');
                icon.style.transform = 'rotate(180deg)';
            }
        } else {
            if (answer.classList.contains('active')) {
                answer.classList.remove('active');
            } else {
                answer.classList.add('active');
            }
        }
    }

async function changeMonth(delta) {
    console.log(`changeMonth called with delta: ${delta}. Current month before change: ${getMonthYearString(currentMonth)}`);
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    const newMonthString = getMonthYearString(currentMonth);
    console.log(`Current month AFTER change: ${newMonthString}`);

    // Ensure data for the new month is loaded/initialized.
    const newMonthData = getCurrentMonthData(); // This loads or initializes for 'currentMonth'
    console.log(`Data for new month (<span class="math-inline">\{newMonthString\}\)\: fundsImported\=</span>{newMonthData.fundsImported}, emiDeducted=${newMonthData.emiDeducted}`);

    const today = new Date();
    const isViewingCurrentRealMonth = currentMonth.getFullYear() === today.getFullYear() &&
                                currentMonth.getMonth() === today.getMonth();
    const isFirstDayOfCurrentRealMonth = isViewingCurrentRealMonth && today.getDate() === 1;

    if (delta > 0) { // Moving to Next Month
        // Process EMIs for the new month if not already done.
        if (!newMonthData.emiDeducted) {
            console.log("Calling autoDeductEmiForCurrentMonth for the new month:", newMonthString);
            await autoDeductEmiForCurrentMonth();
        }
        // Auto-import funds if we are landing on the *actual current month* for the first time (e.g., app opened on 1st of month).
        // This typically shouldn't run when just clicking "Next Month" to a future date unless that date is today.
        if (isFirstDayOfCurrentRealMonth && !newMonthData.fundsImported) {
            console.log("It's the 1st of the current real month, and funds not imported. Attempting auto-import for:", newMonthString);
            await autoImportFundsForNewMonth(); // This function calls render() internally
        }
    } else if (delta < 0) { // Moving to Previous Month
        // No special processing typically needed other than rendering.
        console.log("Moving to previous month:", newMonthString);
    }

    // Always render the new month's state at the end of changeMonth.
    // This ensures the UI updates even if the async functions above didn't make changes that triggered their own render,
    // or if no async functions were called (e.g., moving to a previous month).
    console.log("Final render call in changeMonth for:", newMonthString);
    render();
    console.log("changeMonth finished for:", newMonthString);
    console.log("Final render call in changeMonth for:", newMonthString);
    render(); // This will update data models

    // If the daily bar chart is visible, re-render it for the new month's data
    if (document.getElementById('dailyExpensesGraphContainer').style.display !== 'none') {
        renderDailyBarChart();
    }
    console.log("changeMonth finished for:", newMonthString);
}
    async function autoImportFundsForNewMonth() {
        const currentMonthData = getCurrentMonthData();
        if (currentMonthData.fundsImported) return;

        const prevMonthStr = getPreviousMonthYearString(currentMonth);
        const prevMonthData = monthlyData[prevMonthStr];

        if (prevMonthData && prevMonthData.categories && prevMonthData.categories.length > 0) {
            currentMonthData.categories = prevMonthData.categories.map(fund => {
                let newFund = { ...fund };
                newFund.balance = newFund.initialBalance;
                if (newFund.deductionType === 'auto') {
                    newFund.spent = newFund.emiAmount;
                    newFund.balance -= newFund.emiAmount;
                } else {
                    newFund.spent = (newFund.type === 'investment') ? newFund.initialBalance : 0;
                }
                return newFund;
            });
            currentMonthData.history = [];
            currentMonthData.emiDeducted = false;
            currentMonthData.fundsImported = true;

            addToHistory({
                type: 'funds_auto_imported',
                fromMonth: prevMonthStr,
                description: `Funds automatically imported from ${prevMonthStr}.`
            });
            showToast(`Funds automatically imported for ${getFullDateString(currentMonth)}.`);
            saveData();
            render();
        }
    }

    async function manualCopyFundsFromPreviousMonth() {
        const confirmed = await showConfirm(`Are you sure you want to copy all fund setups from the previous month to ${getFullDateString(currentMonth)}? This will overwrite any existing funds in this month.`, 'Copy Funds');
        if (!confirmed) return;

        const prevMonthStr = getPreviousMonthYearString(currentMonth);
        const prevMonthData = monthlyData[prevMonthStr];
        const currentMonthData = getCurrentMonthData();

        if (prevMonthData && prevMonthData.categories && prevMonthData.categories.length > 0) {
            currentMonthData.categories = prevMonthData.categories.map(fund => {
                let newFund = { ...fund };
                newFund.balance = newFund.initialBalance;
                if (newFund.deductionType === 'auto') {
                    newFund.spent = newFund.emiAmount;
                    newFund.balance -= newFund.emiAmount;
                } else {
                    if (newFund.type === 'investment') {
                        newFund.spent = newFund.initialBalance;
                    } else {
                        newFund.spent = 0;
                    }
                }
                return newFund;
            });
            currentMonthData.history = [];
            currentMonthData.emiDeducted = false;
            currentMonthData.fundsImported = true;
            addToHistory({
                type: 'funds_copied',
                fromMonth: prevMonthStr,
                description: `Funds manually copied from ${prevMonthStr}. Initial balances reset.`
            });
            showToast(`Funds manually copied from ${prevMonthStr}.`);
            render();
        } else {
            await showAlert('No funds found in the previous month to copy.');
        }
    }


async function autoDeductEmiForCurrentMonth() {
    const currentMonthData = getCurrentMonthData();
    if (currentMonthData.emiDeducted) {
        console.log("EMIs already marked as deducted for:", getMonthYearString(currentMonth));
        // If already deducted, no state change, so no immediate render needed from here.
        // The calling function (changeMonth) will handle rendering.
        return;
    }

    console.log("Running autoDeductEmiForCurrentMonth for:", getMonthYearString(currentMonth));
    let totalEmiDeducted = 0;
    let emiDeductionDetails = [];
    const currentCurrencySymbol = currencySymbols[appSettings.currency];
    let deductionsWereAttempted = false; // Flag to see if we even looked at any auto-deduct funds

    currentMonthData.categories.forEach(cat => {
        if (cat.deductionType === 'auto' && cat.emiAmount > 0) {
            deductionsWereAttempted = true;
            const deductionAmount = cat.emiAmount;
            // For EMIs, we usually deduct regardless of current fund balance,
            // as they are often linked to external obligations.
            cat.balance -= deductionAmount; // This might make the fund's internal balance negative
            cat.spent += deductionAmount;
            totalEmiDeducted += deductionAmount;
            emiDeductionDetails.push(`${cat.name}: <span class="math-inline">\{currentCurrencySymbol\}</span>{deductionAmount.toFixed(2)} deducted`);
        }
    });

    // Mark EMI processing as done for this month if there were any auto-deduct funds to consider
    // This prevents re-running the logic every time we view this month.
    if (deductionsWereAttempted || currentMonthData.categories.some(c => c.deductionType === 'auto')) {
        currentMonthData.emiDeducted = true;
    }


    if (emiDeductionDetails.length > 0) { // If any EMIs were actually processed
        addToHistory({
            type: 'emi_deduction_processed',
            amount: totalEmiDeducted,
            details: emiDeductionDetails,
            description: `Auto-deductions processed for ${getFullDateString(currentMonth)}: ${emiDeductionDetails.join('; ')}`
        });
        showToast(`Auto-deductions processed for ${getFullDateString(currentMonth)}.`);
        console.log("EMIs processed for", getMonthYearString(currentMonth), ". State changed, will be rendered by changeMonth.");
        // render(); // We will let changeMonth handle the final render call
    } else if (deductionsWereAttempted) { // Auto-deduct funds exist, but none had emiAmount > 0
        console.log("No EMIs with positive amount to deduct for", getMonthYearString(currentMonth));
        addToHistory({
             type: 'emi_check_no_positive_amount',
             description: `Checked for EMIs for ${getFullDateString(currentMonth)}, none with positive amounts found.`
         });
    } else {
        console.log("No auto-deduct funds found for", getMonthYearString(currentMonth));
    }
    // No explicit render() here; changeMonth will call it.
}
    async function exportToPdf() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const currentMonthData = getCurrentMonthData();
        const currentCurrencySymbol = currencySymbols[appSettings.currency];
        const monthYearDisplay = getFullDateString(currentMonth);

        let yPos = 15;
        const lineHeight = 7;
        const margin = 15;
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;

        doc.setFontSize(20);
        doc.setFont(undefined, 'bold');
        doc.text('Account Statement', pageWidth / 2, yPos, { align: 'center' });
        yPos += lineHeight * 1.5;
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(`Period: ${monthYearDisplay}`, pageWidth / 2, yPos, { align: 'center' });
        yPos += lineHeight * 2;

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('Account Holder:', margin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(userProfile.name || 'N/A', margin + 40, yPos);
        yPos += lineHeight;

        doc.setFont(undefined, 'bold');
        doc.text('Email:', margin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(userProfile.email || 'N/A', margin + 40, yPos);
        yPos += lineHeight;

        doc.setFont(undefined, 'bold');
        doc.text('Statement Date:', margin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(getFullDateString(new Date()), margin + 40, yPos);
        yPos += lineHeight * 2;

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Account Summary', margin, yPos);
        yPos += lineHeight * 1.5;

        const summaryData = [
            ['Monthly Income:', `${currentCurrencySymbol}${currentMonthData.income.toFixed(2)}`],
        ];

        const totalSpent = currentMonthData.categories.reduce((sum, cat) => sum + cat.spent, 0);
        summaryData.push(['Total Expenses/Investments:', `${currentCurrencySymbol}${totalSpent.toFixed(2)}`]);

        const totalBalance = currentMonthData.income - totalSpent;
        summaryData.push(['Remaining Balance:', `${currentCurrencySymbol}${totalBalance.toFixed(2)}`]);

        doc.autoTable({
            startY: yPos,
            head: [['Description', 'Amount']],
            body: summaryData,
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 2 },
            headStyles: { fillColor: [22, 160, 133], textColor: 255, fontStyle: 'bold' },
            margin: { left: margin, right: margin },
            tableWidth: 'auto',
        });
        yPos = doc.lastAutoTable.finalY + lineHeight * 2;

        if (currentMonthData.history.length > 0) {
            if (yPos + lineHeight * 4 > pageHeight - margin) {
                doc.addPage();
                yPos = margin;
            }
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('Transaction Details', margin, yPos);
            yPos += lineHeight * 1.5;

            const tableColumn = ["Date", "Description", "Amount (" + currentCurrencySymbol + ")", "Type"];
            const tableRows = [];

            currentMonthData.history.forEach(transaction => {
                const transactionDate = new Date(transaction.timestamp).toLocaleDateString();
                const transactionAmount = transaction.amount ? transaction.amount.toFixed(2) : '-';
                const transactionType = transaction.type ? transaction.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A';

                const rowData = [
                    transactionDate,
                    transaction.description,
                    transactionAmount,
                    transactionType
                ];
                tableRows.push(rowData);
            });

            doc.autoTable(tableColumn, tableRows, {
                startY: yPos,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 'auto' },
                    2: { cellWidth: 30, halign: 'right' },
                    3: { cellWidth: 30 }
                },
                margin: { left: margin, right: margin },
                didDrawPage: function (data) {
                    doc.setFontSize(10);
                    doc.text('Page ' + doc.internal.getNumberOfPages(), data.settings.margin.left, pageHeight - 10);
                }
            });
        } else {
            if (yPos + lineHeight * 2 > pageHeight - margin) {
                doc.addPage();
                yPos = margin;
            }
            doc.setFontSize(12);
            doc.text('No transaction history for this period.', margin, yPos);
        }

        if (doc.lastAutoTable.finalY + lineHeight * 3 > pageHeight - margin * 2) {
             doc.addPage();
        }
        doc.setFontSize(9);
        doc.setFont(undefined, 'italic');
        doc.text('This is a system-generated statement and does not require a signature.', margin, pageHeight - margin - lineHeight * 2);
        doc.text(`Smart Budget Wallet - ${new Date().getFullYear()}`, margin, pageHeight - margin - lineHeight);


        doc.save(`Statement_${monthYearDisplay.replace(/\s+/g, '_')}.pdf`);
        showToast('Statement downloaded successfully!');
    }

    function toggleLogTransactionSection() {
        const section = document.getElementById('logTransactionSectionCard');
        const isHidden = section.style.display === 'none';
        section.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    let activeSectionWrapperId = 'dashboardSectionWrapper';
    const sectionOrder = ['dashboardSectionWrapper', 'historySectionWrapper', 'analyticsSectionWrapper', 'settingsSectionWrapper'];


    function scrollToSection(sectionId, isSwipe = false) {
        const newSectionWrapperId = sectionId.replace('-section', 'SectionWrapper');
        const oldSectionWrapper = document.getElementById(activeSectionWrapperId);
        const newSectionWrapper = document.getElementById(newSectionWrapperId);

        if (!newSectionWrapper || activeSectionWrapperId === newSectionWrapperId) {
            if (sectionId === 'create-fund-section' && activeSectionWrapperId !== 'create-fund-section') {
                openCreateFundModal();
            }
            return;
        }

        if (sectionId === 'create-fund-section') {
            openCreateFundModal();
            return;
        }

        const newSectionAnimationEnd = () => {
            newSectionWrapper.classList.remove('fade-in-start');
            sectionOrder.forEach(wrapperId => {
                const isCurrentNewSection = (wrapperId === newSectionWrapperId);
                const sectionWrapperElement = document.getElementById(wrapperId);

                if (!sectionWrapperElement) return;

                if (wrapperId === 'dashboardSectionWrapper') {
                    const dashboardElementsToToggle = [
                        '.total-balance', '#dashboardGaugesContainer', '#toggleLogTransactionBtn',
                        '#monthlyIncomeCard', '#expenseFundsCard', '#investmentFundsCard',
                        '#transferFundsCard'
                    ];
                    dashboardElementsToToggle.forEach(selector => {
                        const el = sectionWrapperElement.querySelector(selector) || document.querySelector(selector);
                        if (el) {
                            el.style.display = isCurrentNewSection ? (selector === '#dashboardGaugesContainer' ? 'flex' : 'block') : 'none';
                        }
                    });
                    const currentDateDisplayCard = document.getElementById('currentDateDisplay')?.closest('.card');
                    if (currentDateDisplayCard) currentDateDisplayCard.style.display = isCurrentNewSection ? 'block' : 'none';
                    const logTransactionCard = document.getElementById('logTransactionSectionCard');
                    if (logTransactionCard && !isCurrentNewSection) {
                        logTransactionCard.style.display = 'none';
                    }
                } else {
                    const mainContentId = wrapperId.replace('SectionWrapper', '-section');
                    const mainContentDiv = document.getElementById(mainContentId);
                    if (mainContentDiv) {
                        mainContentDiv.style.display = isCurrentNewSection ? 'block' : 'none';
                        if (isCurrentNewSection) {
                            if (wrapperId === 'historySectionWrapper') {
                                const historyContent = document.getElementById('history');
                                const historyToggleIcon = document.getElementById('historyToggleIcon');
                                if (historyContent && historyToggleIcon) {
                                    historyContent.style.display = historyToggleIcon.textContent === '▲' ? 'block' : 'none';
                                }
                            } else if (wrapperId === 'settingsSectionWrapper') {
                                const faqContent = document.getElementById('faqContentSettings');
                                const faqToggleIcon = document.getElementById('faqToggleIconSettings');
                                if (faqContent && faqToggleIcon) {
                                    faqContent.style.display = faqToggleIcon.textContent === '▲' ? 'block' : 'none';
                                }
                            }
                        }
                    }
                }
            });
            render();
            newSectionWrapper.removeEventListener('animationend', newSectionAnimationEnd);
        };

        if (oldSectionWrapper && oldSectionWrapper !== newSectionWrapper) {
            oldSectionWrapper.classList.add('fade-out-start');
            oldSectionWrapper.addEventListener('animationend', function handleOldSectionFadeOut() {
                oldSectionWrapper.classList.remove('active');
                oldSectionWrapper.classList.remove('fade-out-start');
                newSectionWrapper.classList.add('active');
                newSectionWrapper.classList.add('fade-in-start');
                newSectionWrapper.addEventListener('animationend', newSectionAnimationEnd, { once: true });
            }, { once: true });
        } else {
            newSectionWrapper.classList.add('active');
            newSectionWrapper.classList.add('fade-in-start');
            newSectionWrapper.addEventListener('animationend', newSectionAnimationEnd, { once: true });
        }

        activeSectionWrapperId = newSectionWrapperId;

        const navButtons = document.querySelectorAll('.bottom-nav button');
        navButtons.forEach(button => button.classList.remove('active'));
        const targetButtonId = `nav${sectionId.charAt(0).toUpperCase() + sectionId.slice(1).replace(/-section$/, 'Btn').replace(/-(\w)/g, (match, p1) => p1.toUpperCase())}`;
        const targetButton = document.getElementById(targetButtonId);
        if (targetButton) {
            targetButton.classList.add('active');
        } else {
            const simpleTargetButtonId = `nav${sectionId.replace('-section', 'Btn').replace(/(\w)(\w*)/g, (g0,g1,g2) => g1.toUpperCase() + g2.toLowerCase())}`;
            const simpleTargetButton = document.getElementById(simpleTargetButtonId);
            if(simpleTargetButton) simpleTargetButton.classList.add('active');
        }
    }


    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkMode);
        document.getElementById('darkModeToggleSwitchSettings').checked = isDarkMode;

        renderPieChart(getCurrentMonthData().categories);
        initializeDashboardGauges();
        renderDashboardGauges();

        if (document.getElementById('dailyExpensesGraphContainer').style.display !== 'none') {
            renderDailyBarChart();
        }
    }

    function updateCurrency() {
        const selectedCurrency = document.getElementById('currencySelect').value;
        appSettings.currency = selectedCurrency;
        saveAppSettings();
        render();
        showToast(`Currency set to ${selectedCurrency}`);
    }

    function updateDefaultPaymentApp() {
        const selectedApp = document.getElementById('defaultPaymentAppSelect').value;
        appSettings.defaultPaymentApp = selectedApp;
        saveAppSettings();
        render();
        showToast(`Default payment app set to ${selectedApp}`);
    }

    function renderUserProfile() {
        document.getElementById('welcomeMessage').textContent = `Welcome, ${userProfile.name}!`;
        document.getElementById('welcomeAvatar').textContent = userProfile.avatar;
        document.getElementById('userNameInput').value = userProfile.name;
        document.getElementById('userEmailInput').value = userProfile.email;
        document.getElementById('profileAvatarDisplay').textContent = userProfile.avatar;
        document.getElementById('profileNameDisplay').textContent = userProfile.name;
        document.getElementById('profileEmailDisplay').textContent = userProfile.email;

        document.querySelectorAll('.avatar-option').forEach(option => {
            if (option.dataset.emoji === userProfile.avatar) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    function updateUserProfile() {
        userProfile.name = document.getElementById('userNameInput').value.trim();
        userProfile.email = document.getElementById('userEmailInput').value.trim();
        saveUserProfile();
    }

    function selectAvatar(emoji) {
        userProfile.avatar = emoji;
        saveUserProfile();
        showToast(`Avatar updated to ${emoji}`);
    }

    let currentTutorialStep = 0;
    const tutorialSteps = [
        {
            title: "Welcome to Smart Budget Wallet!",
            message: "Let's get you started. First, please enter your monthly income for the current month in the highlighted field below.",
            highlightId: "monthlyIncomeInput",
            focusId: "monthlyIncomeInput",
            preAction: () => {
                document.getElementById('monthlyIncomeCard').style.display = 'block';
            }
        },
        {
            title: "Create Your Funds",
            message: "Great! Now, let's set up some funds. Click the '+' button (highlighted) at the bottom right to open the fund creation form.",
            highlightId: "fab",
        },
        {
            title: "Tutorial Complete!",
            message: "You're all set! Explore the app to log transactions, transfer funds, and view analytics. Check 'Settings' (bottom navigation) for more options like changing currency or theme.",
        }
    ];

    function highlightElement(elementId, duration = 5000) {
        const element = document.getElementById(elementId);
        if (element) {
            const parentCard = element.closest('.card');
            if (parentCard && parentCard.style.display === 'none') {
                parentCard.style.display = 'block';
            }
            if (!parentCard && element.style.display === 'none' && element.id !== 'logTransactionSectionCard') {
                 element.style.display = 'block';
            }


            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-tutorial');
            setTimeout(() => {
                element.classList.remove('highlight-tutorial');
            }, duration);
        }
    }

    async function showNextTutorialStep() {
        if (localStorage.getItem('tutorialShown') === 'true') return;

        if (currentTutorialStep >= tutorialSteps.length) {
            localStorage.setItem('tutorialShown', 'true');
            document.querySelectorAll('.highlight-tutorial').forEach(el => el.classList.remove('highlight-tutorial'));
            render();
            return;
        }

        const step = tutorialSteps[currentTutorialStep];
        document.querySelectorAll('.highlight-tutorial').forEach(el => el.classList.remove('highlight-tutorial'));

        if (step.preAction) {
            step.preAction();
        }

        if (step.highlightId) {
            highlightElement(step.highlightId, 6000);
        }

        await showModal(step.title, step.message, 'alert');

        if (step.focusId) {
            const focusEl = document.getElementById(step.focusId);
            if (focusEl) focusEl.focus();
        }

        if (step.highlightId !== 'fab') {
            currentTutorialStep++;
            if (currentTutorialStep < tutorialSteps.length) {
                 setTimeout(showNextTutorialStep, 300);
            } else {
                localStorage.setItem('tutorialShown', 'true');
                document.querySelectorAll('.highlight-tutorial').forEach(el => el.classList.remove('highlight-tutorial'));
                render();
            }
        }
    }

    async function startTutorial() {
        currentTutorialStep = 0;
        scrollToSection('dashboard-section');
        setTimeout(async () => {
            await showNextTutorialStep();
        }, 1000);
    }
    const editFundModal = document.getElementById('editFundModal');
    const editFundNameInput = document.getElementById('editFundName');
    const editFundAmountInput = document.getElementById('editFundAmount');
    const editFundTypeExpenseRadio = document.querySelector('input[name="editFundType"][value="expense"]');
    const editFundTypeInvestmentRadio = document.querySelector('input[name="editFundType"][value="investment"]');
    const editIsAutoDeductCheckbox = document.getElementById('editIsAutoDeduct');
    const editDueDayInputContainer = document.getElementById('editDueDayInputContainer');
    const editFundDueDayInput = document.getElementById('editFundDueDay');
    const editingFundNameOriginalInput = document.getElementById('editingFundNameOriginal');

    let fundIndexToEdit = -1;

function openEditFundModal(index) {
    fundIndexToEdit = index;
    const currentMonthData = getCurrentMonthData();
    const fund = currentMonthData.categories[index];

    if (!fund) {
        console.error("Fund not found for editing at index:", index);
        return;
    }

    editingFundNameOriginalInput.value = fund.name;
    editFundNameInput.value = fund.name;

    // --- Make Amount field readonly and display original value ---
    editFundAmountInput.readOnly = true; // Make it readonly
    editFundAmountInput.style.backgroundColor = "var(--gauge-track-color)"; // Visual cue for readonly
    editFundAmountInput.title = "This value cannot be changed after fund creation.";


    if (fund.deductionType === 'auto') {
        editFundAmountInput.value = fund.emiAmount.toFixed(2);
        // Consider changing the label text for clarity if you have a separate label element for editFundAmountInput
        // document.getElementById('labelForEditFundAmount').textContent = "EMI Amount (Read-only):";
    } else {
        editFundAmountInput.value = fund.initialBalance.toFixed(2);
        // document.getElementById('labelForEditFundAmount').textContent = "Initial Amount (Read-only):";
    }
    // --- End of Amount field handling ---

    if (fund.type === 'expense') {
        editFundTypeExpenseRadio.checked = true;
    } else {
        editFundTypeInvestmentRadio.checked = true;
    }
    editIsAutoDeductCheckbox.checked = fund.deductionType === 'auto';
    editFundDueDayInput.value = fund.dueDay || '';

    toggleEditDueDayVisibility();
    editFundModal.classList.add('active');
}
    function closeEditFundModal() {
        editFundModal.classList.remove('active');
        fundIndexToEdit = -1;
    }

    function toggleEditDueDayVisibility() {
        editDueDayInputContainer.style.display = editIsAutoDeductCheckbox.checked ? 'block' : 'none';
        if (!editIsAutoDeductCheckbox.checked) {
            editFundDueDayInput.value = '';
        }
    }

async function saveEditedFund() {
    if (fundIndexToEdit === -1) return;

    const currentMonthData = getCurrentMonthData();
    const fundToEdit = currentMonthData.categories[fundIndexToEdit];

    if (!fundToEdit) {
        await showAlert("Error: Could not find the fund to edit. It might have been modified or deleted.", "Edit Error");
        closeEditFundModal();
        render();
        return;
    }

    const originalFundDetailsForHistory = { ...fundToEdit }; // Capture details before any change

    const newName = editFundNameInput.value.trim();
    // newAmount is NO LONGER read from editFundAmountInput for changing value
    const newType = document.querySelector('input[name="editFundType"]:checked').value;
    const newDeductionType = editIsAutoDeductCheckbox.checked ? 'auto' : 'manual';
    let newDueDay = null;

    if (!newName) {
        await showAlert('Fund name cannot be empty.');
        return;
    }
    if (newName.toLowerCase() !== fundToEdit.name.toLowerCase() && currentMonthData.categories.some((cat, idx) => idx !== fundIndexToEdit && cat.name.toLowerCase() === newName.toLowerCase())) {
        await showAlert(`A fund with the name '${newName}' already exists. Please choose a different name.`);
        return;
    }

    // Update name
    fundToEdit.name = newName;
    fundToEdit.type = newType; // User can change between expense/investment

    // Handle changes in deductionType and dueDay
    if (newDeductionType === 'auto') {
        const dueDayValue = parseInt(editFundDueDayInput.value);
        if (editFundDueDayInput.value && (isNaN(dueDayValue) || dueDayValue < 1 || dueDayValue > 31)) {
            await showAlert('Please enter a valid Due Day (1-31) for auto-deduct or leave it blank.');
            return;
        }
        newDueDay = editFundDueDayInput.value ? parseInt(editFundDueDayInput.value) : null;

        if (fundToEdit.deductionType === 'manual') { // Changing from Manual to Auto
            console.log(`Changing fund '${fundToEdit.name}' from Manual to Auto.`);
            // Use existing initialBalance as the new EMI amount
            fundToEdit.emiAmount = fundToEdit.initialBalance; // Or a default if initialBalance is 0? For now, use initialBalance.
            if (fundToEdit.emiAmount <= 0) {
                 await showAlert(`Cannot change to Auto-Deduct. The fund's original value (which would become EMI) is ${fundToEdit.emiAmount.toFixed(2)}. Auto-Deduct EMI must be positive. Delete and recreate if needed.`, "Type Change Error");
                 // Revert UI changes for deduction type if necessary before returning
                 editIsAutoDeductCheckbox.checked = false; // Revert checkbox
                 toggleEditDueDayVisibility();
                 return;
            }
            // When converting to auto, its specific "balance" for this EMI is 0, and "spent" is the EMI for the month.
            fundToEdit.spent = fundToEdit.emiAmount;
            fundToEdit.balance = 0; 
        }
        // If it was already auto, only dueDay and potentially emiAmount (if we allowed it) would change.
        // Since emiAmount is not editable, only dueDay changes if it was already auto.
        fundToEdit.deductionType = 'auto';
        fundToEdit.dueDay = newDueDay;

    } else { // newDeductionType is 'manual'
        if (fundToEdit.deductionType === 'auto') { // Changing from Auto to Manual
            console.log(`Changing fund '${fundToEdit.name}' from Auto to Manual.`);
            // Use existing emiAmount as the new initialBalance
            fundToEdit.initialBalance = fundToEdit.emiAmount;
            // Reset spent and balance based on new manual type
            if (fundToEdit.type === 'investment') {
                fundToEdit.spent = fundToEdit.initialBalance; // Assume full initial amount is "invested"
                fundToEdit.balance = 0;
            } else { // Manual Expense
                fundToEdit.spent = 0; // Reset spent for a newly manual expense fund
                fundToEdit.balance = fundToEdit.initialBalance;
            }
        }
        // If it was already manual, no monetary values change from this path as newAmount is not used.
        // Only name, type could have changed.
        fundToEdit.deductionType = 'manual';
        fundToEdit.emiAmount = 0;
        fundToEdit.dueDay = null;
    }

    addToHistory({
        type: 'fund_edit',
        fundNameBeforeEdit: originalFundDetailsForHistory.name, // For clarity in history
        changedProperties: { // Log what could have changed
            name: fundToEdit.name !== originalFundDetailsForHistory.name ? { from: originalFundDetailsForHistory.name, to: fundToEdit.name } : undefined,
            type: fundToEdit.type !== originalFundDetailsForHistory.type ? { from: originalFundDetailsForHistory.type, to: fundToEdit.type } : undefined,
            deductionType: fundToEdit.deductionType !== originalFundDetailsForHistory.deductionType ? { from: originalFundDetailsForHistory.deductionType, to: fundToEdit.deductionType } : undefined,
            dueDay: fundToEdit.dueDay !== originalFundDetailsForHistory.dueDay ? { from: originalFundDetailsForHistory.dueDay, to: fundToEdit.dueDay } : undefined,
            // Note: Monetary values (initialBalance, emiAmount, spent, balance) might change *indirectly* if deductionType changes.
        },
        description: `Fund '${originalFundDetailsForHistory.name}' settings updated. Name: '${fundToEdit.name}', Type: ${fundToEdit.type}, Deduction: ${fundToEdit.deductionType}.`
    });
    showToast(`Fund '${fundToEdit.name}' updated.`);
    closeEditFundModal();
    render();
}

    const notificationsDropdown = document.getElementById('notificationsDropdown');
    const notificationBadge = document.getElementById('notificationBadge');

function addNotification(message, id, type = 'info') {
    const existingNotification = appSettings.notifications.find(n => n.id === id);

    if (existingNotification) {
        // If a notification with this ID already exists (whether it's read or unread),
        // we won't add it again. This prevents a read notification for a persistent
        // condition from being immediately re-added as unread.
        // console.log(`Notification with ID ${id} already exists. Current read state: ${existingNotification.read}. Not re-adding or marking unread.`);
        return; // Do nothing further if it already exists
    }

    // If no notification with this ID exists, then it's a genuinely new condition to notify about.
    // Add it as new and unread.
    console.log(`Adding new notification with ID ${id}.`);
    const notification = {
        id: id,
        message: message,
        type: type,
        timestamp: new Date().toISOString(),
        read: false
    };
    appSettings.notifications.unshift(notification); // Add to the beginning of the array

    // Keep the notifications list to a manageable size
    if (appSettings.notifications.length > 20) {
        appSettings.notifications.pop();
    }
    saveAppSettings();
    // Note: renderNotifications() should be called by a higher-level function 
    // (like checkAndAddNotifications or render) after all checks are done, 
    // not directly from addNotification, to avoid multiple rapid re-renders.
    // If checkAndAddNotifications already calls renderNotifications at its end, that's correct.
}
    function checkAndAddNotifications() {
        const today = new Date();
        today.setHours(0,0,0,0);
        const currentMonthData = getCurrentMonthData();
        const categories = currentMonthData.categories;

        categories.forEach(fund => {
            if (fund.deductionType === 'auto' && fund.dueDay) {
                const dueDateThisMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), fund.dueDay);
                dueDateThisMonth.setHours(0,0,0,0);

                const diffTime = dueDateThisMonth - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const notificationId = `due-${fund.name}-${getMonthYearString(currentMonth)}-${fund.dueDay}`;

                if (diffDays >= 0 && diffDays <= 3) {
                    addNotification(
                        `Payment for "${fund.name}" is due on ${formatDueDate(fund.dueDay, currentMonth)}.`,
                        notificationId,
                        'due'
                    );
                }
            }

            if (fund.type === 'expense' && fund.deductionType === 'manual' && fund.initialBalance > 0) {
                const remainingPercentage = (fund.balance / fund.initialBalance) * 100;
                const fundLow10Id = `low10-${fund.name}-${getMonthYearString(currentMonth)}`;
                const fundLow50Id = `low50-${fund.name}-${getMonthYearString(currentMonth)}`;

                if (remainingPercentage <= 10) {
                    addNotification(
                        `"${fund.name}" balance is very low (≤10% remaining).`,
                        fundLow10Id,
                        'lowBalance10'
                    );
                } else if (remainingPercentage <= 50) {
                    const low10Notification = appSettings.notifications.find(n => n.id === fundLow10Id && !n.read);
                    if (!low10Notification) {
                         addNotification(
                            `"${fund.name}" balance is low (≤50% remaining).`,
                            fundLow50Id,
                            'lowBalance50'
                        );
                    }
                }
            }
        });
        renderNotifications();
    }

    function renderNotifications() {
        notificationsDropdown.innerHTML = '';
        const unreadNotifications = appSettings.notifications.filter(n => !n.read);

        if (unreadNotifications.length > 0) {
            notificationBadge.textContent = unreadNotifications.length;
            notificationBadge.classList.add('visible');
            unreadNotifications.forEach(n => {
                const item = document.createElement('div');
                item.className = 'notification-item unread';
                item.innerHTML = n.message;
                item.onclick = () => {
                    const notificationToMark = appSettings.notifications.find(notif => notif.id === n.id);
                    if (notificationToMark) notificationToMark.read = true;
                    saveAppSettings();
                    renderNotifications();
                };
                notificationsDropdown.appendChild(item);
            });
        } else {
            notificationBadge.classList.remove('visible');
        }

        const readNotifications = appSettings.notifications
            .filter(n => n.read)
            .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 3);

        if (unreadNotifications.length > 0 && readNotifications.length > 0) {
            const separator = document.createElement('hr');
            separator.style.margin = "10px 0";
            separator.style.borderColor = "var(--border-color)";
            notificationsDropdown.appendChild(separator);
        }


        readNotifications.forEach(n => {
            const item = document.createElement('div');
            item.className = 'notification-item';
            item.innerHTML = n.message;
            item.style.opacity = "0.7";
            notificationsDropdown.appendChild(item);
        });

         if (unreadNotifications.length === 0 && readNotifications.length === 0) {
            notificationsDropdown.innerHTML = '<p class="no-notifications">No notifications.</p>';
        }
    }

    function toggleNotifications() {
        notificationsDropdown.classList.toggle('visible');
    }

    let botConversationState = 'IDLE';
    let pendingActionDetails = {};
    let recognition;
    let synth;
    let isListening = false;
    let isSpeakingEnabled = true;
    let sentiment;
    let sentimentModelReady = false;
    let isDaikoActive = false;
    let manualMicStop = false;

    function sentimentModelLoadedCallback() {
        console.log('Sentiment model loaded successfully!');
        sentimentModelReady = true;
        const chatInput = document.getElementById('chatInput');
        const sendChatBtn = document.getElementById('sendChatBtn');
        const micBtn = document.getElementById('micBtn');
        if (chatInput) { chatInput.disabled = false; chatInput.placeholder = 'Type or say "Hi Daiko"'; }
        if (sendChatBtn) sendChatBtn.disabled = false;
        if (micBtn) micBtn.disabled = false;
    }

    function sentimentModelErrorCallback(error) {
        console.error('Error loading sentiment model:', error);
        sentimentModelReady = false;
        const chatInput = document.getElementById('chatInput');
        const sendChatBtn = document.getElementById('sendChatBtn');
        const micBtn = document.getElementById('micBtn');
        if (chatInput) { chatInput.disabled = false; chatInput.placeholder = 'Type or say "Hi Daiko" (sentiment N/A)';}
        if (sendChatBtn) sendChatBtn.disabled = false;
        if (micBtn) micBtn.disabled = false;
    }

    async function initializeAndLoadSentimentModel() {
        if (typeof ml5 !== 'undefined') {
            try {
                console.log('Attempting to load sentiment model via ml5.js...');
                const chatInput = document.getElementById('chatInput');
                const sendChatBtn = document.getElementById('sendChatBtn');
                const micBtn = document.getElementById('micBtn');
                if (chatInput) { chatInput.disabled = true; chatInput.placeholder = 'Bot is warming up...';}
                if (sendChatBtn) sendChatBtn.disabled = true;
                if (micBtn) micBtn.disabled = true;

                sentiment = ml5.sentiment('movieReviews', sentimentModelLoadedCallback);
            } catch (error) {
                sentimentModelErrorCallback(error);
            }
        } else {
            sentimentModelErrorCallback(new Error('ml5 library is not defined.'));
        }
    }

    function appendMessageToChat(sender, message) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message', sender.toLowerCase());
        const span = document.createElement('span');
        span.innerHTML = message;
        messageDiv.appendChild(span);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        if (sender.toLowerCase() === 'bot' && isSpeakingEnabled && synth) {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = message;
            const textToSpeak = tempDiv.textContent || tempDiv.innerText || "";
            speakText(textToSpeak);
        }
    }

    function speakText(text) {
        if (synth && isSpeakingEnabled && text.trim() !== "") {
            if (synth.speaking) {
                synth.cancel();
            }
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onend = () => {
                console.log("TTS finished speaking. Daiko active:", isDaikoActive, "Bot state:", botConversationState);
                const chatContainer = document.getElementById('chatContainer');
                if (isSpeakingEnabled && chatContainer && chatContainer.classList.contains('open')) {
                    const statesExpectingUserInput = [
                        'AWAITING_INCOME_AMOUNT', 'CONFIRM_INCOME_SET',
                        'AWAITING_FUND_NAME', 'AWAITING_FUND_TYPE', 'AWAITING_FUND_DEDUCTION_TYPE',
                        'AWAITING_FUND_EMI_AMOUNT', 'AWAITING_FUND_INITIAL_AMOUNT', 'AWAITING_FUND_DUE_DAY_AUTO',
                        'CONFIRM_FUND_CREATION',
                        'AWAITING_EXPENSE_FUND_NAME', 'AWAITING_EXPENSE_AMOUNT', 'CONFIRM_EXPENSE_LOG',
                        'AWAITING_WIKIPEDIA_SEARCH_TERM', 'CONFIRM_WIKIPEDIA_SEARCH'
                    ];

                    if (isDaikoActive && (botConversationState === 'IDLE' || statesExpectingUserInput.includes(botConversationState))) {
                        activateMicForBotInput();
                    } else if (!isDaikoActive && botConversationState === 'IDLE') {
                        activateMicForBotInput();
                    } else if (statesExpectingUserInput.includes(botConversationState)) {
                        activateMicForBotInput();
                    }
                }
            };
            utterance.onerror = (event) => {
                console.error("SpeechSynthesis Error:", event);
            };
            synth.speak(utterance);
        }
    }

    function activateMicForBotInput() {
        const chatContainer = document.getElementById('chatContainer');
        if (recognition && !isListening && chatContainer && chatContainer.classList.contains('open') && isSpeakingEnabled) {
            console.log("Attempting to activate mic. Daiko:", isDaikoActive, "State:", botConversationState);
            if (synth && synth.speaking) {
                synth.cancel();
            }
            try {
                manualMicStop = false;
                recognition.start();
            } catch (e) {
                console.error("Error starting recognition in activateMicForBotInput:", e);
                if (e.name === 'NotAllowedError') showToast('Microphone permission needed.');
            }
        }
    }

    async function sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        const sendChatBtn = document.getElementById('sendChatBtn');
        const micBtn = document.getElementById('micBtn');

        if (!chatInput) return;
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        manualMicStop = true;
        if (isListening && recognition) {
            recognition.stop();
        }

        appendMessageToChat('User', userMessage);
        chatInput.value = '';
        chatInput.placeholder = 'Thinking...';
        if (chatInput) chatInput.disabled = true;
        if (sendChatBtn) sendChatBtn.disabled = true;
        if (micBtn) micBtn.disabled = true;

        let sentimentScore = 0;
        if (sentimentModelReady && sentiment) {
            try {
                const prediction = sentiment.predict(userMessage);
                sentimentScore = prediction.score;
            } catch(e){ console.warn("Sentiment prediction error", e); }
        }
        let sentimentPrefix = "";
        if (sentimentScore > 0.7) sentimentPrefix = "Glad to hear! ";
        if (sentimentScore < 0.3) sentimentPrefix = "I understand. ";


        await processBotLogic(userMessage, sentimentPrefix);

        if (chatInput) {
            chatInput.placeholder = isDaikoActive ? 'Listening...' : 'Type or say "Hi Daiko"';
            chatInput.disabled = false;
        }
        if (sendChatBtn) sendChatBtn.disabled = false;
        if (micBtn) micBtn.disabled = false;
    }


    async function callExternalNLU(userMessage) {
        appendMessageToChat('Bot', "Let me check that with my advanced brain... (simulating external NLU call)");
        try {
            await new Promise(resolve => setTimeout(resolve, 1500));
            if (userMessage.toLowerCase().includes("weather")) {
                return "The simulated weather is sunny with a chance of code. (This would come from a real NLU/weather API via serverless)";
            }
            return null;

        } catch (error) {
            console.error("Error calling external NLU:", error);
            return "Sorry, I'm having trouble reaching my advanced knowledge base right now.";
        }
    }

    async function fetchWikipediaSummary(term) {
        appendMessageToChat('Bot', `Searching Wikipedia for "${term}"...`);
        const encodedTerm = encodeURIComponent(term);
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTerm}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json; charset=utf-8'
                }
            });
            if (!response.ok) {
                if (response.status === 404) {
                    return `Sorry, I couldn't find a Wikipedia page for "${term}".`;
                }
                throw new Error(`Wikipedia API error: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.type === 'disambiguation') {
                return `"${term}" could refer to multiple things. Please be more specific. You can check details here: <a href="${data.content_urls.desktop.page}" target="_blank">${data.content_urls.desktop.page}</a>`;
            }
            let summary = data.extract_html || "No summary available.";
            summary += ` <a href="${data.content_urls.desktop.page}" target="_blank">(Read more on Wikipedia)</a>`;
            return summary;
        } catch (error) {
            console.error("Error fetching Wikipedia summary:", error);
            return "Sorry, I encountered an error while trying to search Wikipedia.";
        }
    }


    async function processBotLogic(userMessage, sentimentPrefix = "") {
        const lowerMessage = userMessage.toLowerCase();
        const currentMonthData = getCurrentMonthData();
        const categories = currentMonthData.categories;
        const monthlyIncome = currentMonthData.income;
        const currentCurrencySymbol = currencySymbols[appSettings.currency];
        let botResponse = "";
        let match;

        if (isDaikoActive && (lowerMessage === "no" || lowerMessage === "no thanks" || lowerMessage === "nope") && botConversationState === 'IDLE') {
            isDaikoActive = false;
            botConversationState = 'IDLE_AFTER_DAIKO_NO';
            botResponse = "Okay. Let me know if you need anything else! You can say 'Hi Daiko' to talk again.";
            appendMessageToChat('Bot', sentimentPrefix + botResponse);
            return;
        }


        switch (botConversationState) {
            case 'AWAITING_INCOME_AMOUNT':
                const incomeAmount = parseFloat(lowerMessage.replace(/[^\d.-]/g, ''));
                if (!isNaN(incomeAmount) && incomeAmount >= 0) {
                    pendingActionDetails.amount = incomeAmount;
                    botConversationState = 'CONFIRM_INCOME_SET';
                    botResponse = `Okay, you want to set your income to ${currentCurrencySymbol}${incomeAmount.toFixed(2)}. Is that correct? (yes/no)`;
                } else {
                    botResponse = "That doesn't seem like a valid amount. Please enter a number for your income.";
                }
                break;
            case 'CONFIRM_INCOME_SET':
                if (lowerMessage === 'yes') {
                    const success = await setMonthlyIncome(pendingActionDetails.amount);
                    botResponse = success ? `Great! Your income has been set to ${currentCurrencySymbol}${pendingActionDetails.amount.toFixed(2)}.` : "There was an issue setting your income.";
                    botConversationState = 'IDLE';
                    if (isDaikoActive) botResponse += " What else can I do for you?";
                } else if (lowerMessage === 'no') {
                    botResponse = "Okay, income setting cancelled.";
                    botConversationState = 'IDLE';
                    if (isDaikoActive) botResponse += " How else can I assist?";
                } else {
                    botResponse = "Please answer with 'yes' or 'no'.";
                }
                pendingActionDetails = {};
                break;

            case 'AWAITING_FUND_NAME':
                pendingActionDetails.name = userMessage;
                botConversationState = 'AWAITING_FUND_TYPE';
                botResponse = `Okay, fund name will be "${userMessage}". Is this an "expense" fund or an "investment" fund?`;
                break;
            case 'AWAITING_FUND_TYPE':
                if (lowerMessage.includes("expense")) {
                    pendingActionDetails.type = "expense";
                    botConversationState = 'AWAITING_FUND_DEDUCTION_TYPE';
                    botResponse = `Got it, an expense fund. Will this be an "auto-deduct" fund (like an EMI) or a "manual" fund for regular spending?`;
                } else if (lowerMessage.includes("investment")) {
                    pendingActionDetails.type = "investment";
                    botConversationState = 'AWAITING_FUND_DEDUCTION_TYPE';
                     botResponse = `Got it, an investment fund. Will this be an "auto-invest" (auto-deduct) fund or a "manual" investment where you log amounts?`;
                } else {
                    botResponse = 'Please specify if it\'s an "expense" or "investment" fund.';
                }
                break;
            case 'AWAITING_FUND_DEDUCTION_TYPE':
                 if (lowerMessage.includes("auto") || lowerMessage.includes("auto-deduct") || lowerMessage.includes("auto-invest")) {
                    pendingActionDetails.deductionType = "auto";
                    botConversationState = 'AWAITING_FUND_EMI_AMOUNT';
                    botResponse = `Okay, auto-deduct. What is the fixed monthly amount for this?`;
                } else if (lowerMessage.includes("manual")) {
                    pendingActionDetails.deductionType = "manual";
                    botConversationState = 'AWAITING_FUND_INITIAL_AMOUNT';
                    botResponse = `Okay, manual fund. What is the initial allocated amount for this fund?`;
                } else {
                    botResponse = 'Is it "auto-deduct" or "manual"?';
                }
                break;
            case 'AWAITING_FUND_EMI_AMOUNT':
                const emiAmount = parseFloat(lowerMessage.replace(/[^\d.-]/g, ''));
                if (!isNaN(emiAmount) && emiAmount > 0) {
                    pendingActionDetails.amount = emiAmount;
                    botConversationState = 'AWAITING_FUND_DUE_DAY_AUTO';
                    botResponse = `The auto-deduct amount is ${currentCurrencySymbol}${emiAmount.toFixed(2)}. Is there a specific due day of the month for this (e.g., 5, 15), or should I leave it blank? (Type 'skip' or 'blank' if none)`;
                } else {
                    botResponse = "Please enter a valid positive number for the auto-deduct amount.";
                }
                break;
            case 'AWAITING_FUND_INITIAL_AMOUNT':
                const initialManualAmount = parseFloat(lowerMessage.replace(/[^\d.-]/g, ''));
                if (!isNaN(initialManualAmount) && initialManualAmount >= 0) {
                    pendingActionDetails.amount = initialManualAmount;
                    botConversationState = 'CONFIRM_FUND_CREATION';
                    botResponse = `Create a ${pendingActionDetails.deductionType} ${pendingActionDetails.type} fund named "${pendingActionDetails.name}" with an initial amount of ${currentCurrencySymbol}${initialManualAmount.toFixed(2)}? (yes/no)`;
                } else {
                    botResponse = "Please enter a valid number for the initial amount.";
                }
                break;
            case 'AWAITING_FUND_DUE_DAY_AUTO':
                const dayInput = lowerMessage.trim();
                if (dayInput === "blank" || dayInput === "no" || dayInput === "skip" || dayInput === "" || dayInput === "none") {
                    pendingActionDetails.dueDay = null;
                } else {
                    const day = parseInt(dayInput.replace(/[^\d]/g, ''));
                    if (!isNaN(day) && day >= 1 && day <= 31) {
                        pendingActionDetails.dueDay = day;
                    } else {
                        botResponse = "That's not a valid day (1-31). Let's try the due day again, or say 'skip'.";
                        appendMessageToChat('Bot', sentimentPrefix + botResponse);
                        return;
                    }
                }
                botConversationState = 'CONFIRM_FUND_CREATION';
                let dueDayText = pendingActionDetails.dueDay ? ` with due day ${pendingActionDetails.dueDay}` : " with no specific due day";
                botResponse = `Okay, create an ${pendingActionDetails.deductionType} ${pendingActionDetails.type} fund: "${pendingActionDetails.name}", amount ${currentCurrencySymbol}${pendingActionDetails.amount.toFixed(2)}${dueDayText}. Correct? (yes/no)`;
                break;
            case 'CONFIRM_FUND_CREATION':
                 if (lowerMessage === 'yes') {
                    const success = await createFundFromModal(pendingActionDetails);
                    botResponse = success ? `Fund "${pendingActionDetails.name}" created successfully!` : "Sorry, I couldn't create the fund. Please ensure the name is unique and details are correct.";
                    botConversationState = 'IDLE';
                    if (isDaikoActive) botResponse += " What next?";
                } else if (lowerMessage === 'no') {
                    botResponse = "Okay, fund creation cancelled.";
                    botConversationState = 'IDLE';
                    if (isDaikoActive) botResponse += " How else can I help?";
                } else {
                    botResponse = "Please confirm with 'yes' or 'no'.";
                }
                pendingActionDetails = {};
                break;

            case 'AWAITING_EXPENSE_FUND_NAME':
                const expenseFundToFind = categories.find(cat => cat.name.toLowerCase() === lowerMessage && cat.type === 'expense' && cat.deductionType === 'manual');
                if (expenseFundToFind) {
                    pendingActionDetails.fundName = expenseFundToFind.name;
                    botConversationState = 'AWAITING_EXPENSE_AMOUNT';
                    botResponse = `Okay, logging expense for "${expenseFundToFind.name}". How much was the expense? Current balance: ${currentCurrencySymbol}${expenseFundToFind.balance.toFixed(2)}.`;
                } else {
                    const manualExpenseFunds = categories.filter(c => c.type === 'expense' && c.deductionType === 'manual');
                    botResponse = `Sorry, I couldn't find a manual expense fund named "${userMessage}". Your manual expense funds are: ${manualExpenseFunds.map(f=>f.name).join(', ') || 'None created'}. Please try again or create it first.`;
                     botConversationState = 'IDLE';
                }
                break;
            case 'AWAITING_EXPENSE_AMOUNT':
                const expenseAmount = parseFloat(lowerMessage.replace(/[^\d.-]/g, ''));
                if (!isNaN(expenseAmount) && expenseAmount > 0) {
                    pendingActionDetails.amount = expenseAmount;
                    botConversationState = 'CONFIRM_EXPENSE_LOG';
                    botResponse = `Log an expense of ${currentCurrencySymbol}${expenseAmount.toFixed(2)} from "${pendingActionDetails.fundName}"? (yes/no)`;
                } else {
                    botResponse = "That's not a valid amount. Please enter a positive number.";
                }
                break;
            case 'CONFIRM_EXPENSE_LOG':
                if (lowerMessage === 'yes') {
                    const success = await handlePay(pendingActionDetails);
                    botResponse = success ? `Expense logged successfully from "${pendingActionDetails.fundName}".` : "Couldn't log the expense. Check if the fund has enough balance.";
                     botConversationState = 'IDLE';
                    if (isDaikoActive) botResponse += " Anything else?";
                } else if (lowerMessage === 'no') {
                    botResponse = "Okay, expense logging cancelled.";
                    botConversationState = 'IDLE';
                    if (isDaikoActive) botResponse += " What can I do for you then?";
                } else {
                    botResponse = "Please answer 'yes' or 'no'.";
                }
                pendingActionDetails = {};
                break;

            case 'AWAITING_WIKIPEDIA_SEARCH_TERM':
                pendingActionDetails.searchTerm = userMessage;
                botConversationState = 'CONFIRM_WIKIPEDIA_SEARCH';
                botResponse = `You want me to search Wikipedia for "${userMessage}"? (yes/no)`;
                break;
            case 'CONFIRM_WIKIPEDIA_SEARCH':
                if (lowerMessage === 'yes') {
                    botResponse = await fetchWikipediaSummary(pendingActionDetails.searchTerm);
                    botConversationState = 'IDLE';
                    if (isDaikoActive) botResponse += "<br>What else can I look up or do for you?";
                } else if (lowerMessage === 'no') {
                    botResponse = "Okay, Wikipedia search cancelled.";
                    botConversationState = 'IDLE';
                    if (isDaikoActive) botResponse += " How else can I help?";
                } else {
                    botResponse = "Please confirm with 'yes' or 'no'.";
                }
                pendingActionDetails = {};
                break;

            case 'IDLE_AFTER_DAIKO_NO':
                botConversationState = 'IDLE';
                appendMessageToChat('Bot', sentimentPrefix + botResponse);
                return;


            default:
                if (lowerMessage.match(/^(set|update) my income to (?:rs\.?|rupees|${currentCurrencySymbol.replace("$", "\\$")})?\s*([\d,]+\.?\d*)/i) || lowerMessage.match(/^(set|update) income to (?:rs\.?|rupees|${currentCurrencySymbol.replace("$", "\\$")})?\s*([\d,]+\.?\d*)/i)) {
                    match = lowerMessage.match(/(?:rs\.?|rupees|${currentCurrencySymbol.replace("$", "\\$")})?\s*([\d,]+\.?\d*)/i);
                    const amount = parseFloat(match[1].replace(/,/g, ''));
                     if (!isNaN(amount) && amount >= 0) {
                        pendingActionDetails = { amount: amount };
                        botConversationState = 'CONFIRM_INCOME_SET';
                        botResponse = `Okay, set your income to ${currentCurrencySymbol}${amount.toFixed(2)}. Correct? (yes/no)`;
                    } else {
                        botResponse = "I didn't catch a valid amount. What is the income amount?";
                        botConversationState = 'AWAITING_INCOME_AMOUNT';
                    }
                } else if (lowerMessage.match(/^(set|update) (monthly )?income/i)) {
                    botConversationState = 'AWAITING_INCOME_AMOUNT';
                    pendingActionDetails = {};
                    botResponse = "Okay, what is the new monthly income amount?";
                }
                else if (lowerMessage.match(/^(create|add|new) fund/i)) {
                    if (currentMonthData.income <= 0 && !isDaikoActive) {
                        botResponse = "Please set your monthly income first. You can say 'set income'.";
                    } else {
                        botConversationState = 'AWAITING_FUND_NAME';
                        pendingActionDetails = {};
                        botResponse = "Sure, what would you like to name the new fund?";
                    }
                }
                else if (lowerMessage.match(/^(log|add|new) (expense|transaction|payment)/i)) {
                     if (currentMonthData.income <= 0 && !isDaikoActive) {
                        botResponse = "Please set your monthly income first. You can say 'set income'.";
                    } else {
                        const manualExpenseFunds = categories.filter(c => c.type === 'expense' && c.deductionType === 'manual');
                        if (manualExpenseFunds.length === 0) {
                            botResponse = "You don't have any manual expense funds to log against. Please create one first by saying 'add fund'.";
                        } else {
                            botConversationState = 'AWAITING_EXPENSE_FUND_NAME';
                            pendingActionDetails = {};
                            botResponse = `Okay, from which fund would you like to log an expense? Your manual expense funds are: ${manualExpenseFunds.map(f => f.name).join(', ')}.`;
                        }
                    }
                }
                else if (match = lowerMessage.match(/(?:search wikipedia for|what is|who is|tell me about)\s+(.+)/i)) {
                    const searchTerm = match[1].trim();
                    if (searchTerm) {
                        pendingActionDetails = { searchTerm: searchTerm };
                        botConversationState = 'CONFIRM_WIKIPEDIA_SEARCH';
                        botResponse = `You want me to search Wikipedia for "${searchTerm}"? (yes/no)`;
                    } else {
                        botResponse = "What term would you like me to search on Wikipedia?";
                        botConversationState = 'AWAITING_WIKIPEDIA_SEARCH_TERM';
                    }
                }
                else {
                    botResponse = getBotResponse(userMessage);
                    if (botResponse.startsWith("I'm not sure how to help") && isDaikoActive) {
                        const nluReply = await callExternalNLU(userMessage);
                        if (nluReply) {
                            botResponse = nluReply;
                        } else {
                             botResponse = "I couldn't find an answer for that, even with my advanced brain. Can I help with something else related to your budget, or perhaps a Wikipedia search?";
                        }
                    }
                }
                break;
        }

        appendMessageToChat('Bot', sentimentPrefix + botResponse);
    }


    function getBotResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        const currentMonthData = getCurrentMonthData();
        const categories = currentMonthData.categories;
        const monthlyIncome = currentMonthData.income;
        const totalBalanceElement = document.getElementById('totalBalance');
        const rawBalanceText = totalBalanceElement ? totalBalanceElement.textContent : '0';
        const balanceWithoutCurrency = rawBalanceText.replace(currencySymbols[appSettings.currency], '').trim();
        const totalBalance = parseFloat(balanceWithoutCurrency) || (monthlyIncome - categories.reduce((sum, cat) => sum + cat.spent, 0));
        const currentCurrencySymbol = currencySymbols[appSettings.currency];
        let match;

        if (lowerMessage.match(/^(hello|hi|hey|greetings|good morning|good afternoon|good evening)/i)) {
             return `Hi there, ${userProfile.name}! ${isDaikoActive ? "I'm Daiko." : ""} How can I assist you today?`;
        }

        if (lowerMessage.match(/\b(balance|remaining balance|how much (money|do i have left|is left))\b/i)) {
            return `Your current total remaining balance is ${currentCurrencySymbol}${totalBalance.toFixed(2)}.`;
        }

        if (lowerMessage.match(/\b(income|monthly income)\b/i) && !lowerMessage.match(/^(set|update)/i)) {
             if (monthlyIncome > 0) {
                return `Your set monthly income is ${currentCurrencySymbol}${monthlyIncome.toFixed(2)}. Would you like to update it?`;
            } else {
                return "You haven't set your monthly income yet. You can tell me 'set income' to begin.";
            }
        }
        match = lowerMessage.match(/(?:what is my|details for|info on|tell me about my)\s*(.+?)\s*(?:fund)?\b/i);
        if (match) {
            const fundNameToFind = match[1].trim();
            const foundFund = categories.find(cat => cat.name.toLowerCase() === fundNameToFind.toLowerCase());
            if (foundFund) {
                let details = `Fund: <strong>${foundFund.name}</strong> (${foundFund.type}), Initial: ${currentCurrencySymbol}${foundFund.initialBalance.toFixed(2)}, Balance: ${currentCurrencySymbol}${foundFund.balance.toFixed(2)}, Spent: ${currentCurrencySymbol}${foundFund.spent.toFixed(2)}.`;
                if (foundFund.deductionType === 'auto') {
                    details += ` It's an auto-deduct fund with EMI of ${currentCurrencySymbol}${foundFund.emiAmount.toFixed(2)}.`;
                    if (foundFund.dueDay) details += ` Due on: ${formatDueDate(foundFund.dueDay, currentMonth)}.`;
                }
                return details;
            } else {
                return `Sorry, I couldn't find a fund named "${fundNameToFind}".`;
            }
        }
        match = lowerMessage.match(/(?:due date of|when is|due day for)\s*(.+?)\s*(?:due)?\??$/i);
        if (match) {
            const fundNameToFind = match[1].trim();
            const foundFund = categories.find(cat => cat.name.toLowerCase() === fundNameToFind.toLowerCase() && cat.deductionType === 'auto' && cat.dueDay);
            if (foundFund) {
                return `The due date for "${foundFund.name}" is ${formatDueDate(foundFund.dueDay, currentMonth)}.`;
            } else if (categories.find(cat => cat.name.toLowerCase() === fundNameToFind.toLowerCase())) {
                return `"${fundNameToFind}" doesn't seem to be an auto-deduct fund with a set due date, or the name is incorrect.`;
            } else {
                return `Sorry, I couldn't find an auto-deduct fund named "${fundNameToFind}" with a due date.`;
            }
        }
        if (lowerMessage.includes('total expense')) {
            const totalExpVal = categories.filter(c => c.type === 'expense').reduce((sum, cat) => sum + cat.spent, 0);
            return `Your total expenses (excluding investments) this month are ${currentCurrencySymbol}${totalExpVal.toFixed(2)}.`;
        }
        if (lowerMessage.includes('total investment')) {
            const totalInvVal = categories.filter(c => c.type === 'investment').reduce((sum, cat) => sum + cat.spent, 0);
            return `Your total investments this month are ${currentCurrencySymbol}${totalInvVal.toFixed(2)}.`;
        }
        if (lowerMessage.includes('total loan') || lowerMessage.includes('total emi')) {
            const totalLoanVal = categories.filter(c => c.type === 'expense' && c.deductionType === 'auto').reduce((sum, cat) => sum + cat.spent, 0);
            return `Your total loan/EMI payments this month are ${currentCurrencySymbol}${totalLoanVal.toFixed(2)}.`;
        }
        if (lowerMessage.includes('summary') || lowerMessage.includes('give me a summary')) {
            let summary = `Here's your summary for ${getFullDateString(currentMonth)}:<br>`;
            summary += `Income: ${currentCurrencySymbol}${monthlyIncome.toFixed(2)}<br>`;
            const totalExpVal = categories.filter(c => c.type === 'expense').reduce((sum, cat) => sum + cat.spent, 0);
            summary += `Total Expenses (non-investment): ${currentCurrencySymbol}${totalExpVal.toFixed(2)}<br>`;
            const totalInvVal = categories.filter(c => c.type === 'investment').reduce((sum, cat) => sum + cat.spent, 0);
            summary += `Total Investments: ${currentCurrencySymbol}${totalInvVal.toFixed(2)}<br>`;
            summary += `Remaining Balance: ${currentCurrencySymbol}${totalBalance.toFixed(2)}`;
            return summary;
        }
        if (lowerMessage.includes('list funds') || lowerMessage.includes('show my funds') || lowerMessage.includes('what funds do i have')) {
            if (categories.length === 0) return "You haven't created any funds yet. Try 'add fund'.";
            const fundList = categories.map(f => `<strong>${f.name}</strong> (${f.type}, ${f.deductionType === 'auto' ? 'Auto' : 'Manual'})`).join('<br> - ');
            return `Here are your funds:<br> - ${fundList}`;
        }

        if (lowerMessage.match(/\b(help|what can you do|capabilities)\b/i)) {
            return "I can help you: <br>- Set/update your income (e.g., 'set income to 50000') <br>- Create funds (e.g., 'add a new fund') <br>- Log expenses (e.g., 'log an expense') <br>- Check your balance or fund details (e.g., 'what is my balance?', 'details for groceries fund') <br>- Search Wikipedia (e.g., 'what is inflation?'). <br>Just tell me what you need or say 'Hi Daiko' to talk!";
        }
        if (lowerMessage.match(/\b(thank you|thanks|thx|cheers)\b/i)) {
            return "You're most welcome! Let me know if there's anything else.";
        }
        if (lowerMessage.match(/\b(how are you|how's it going|how are you doing)\b/i)) {
            return "I'm doing well, ready to help you manage your budget! How about you?";
        }
        if (lowerMessage.match(/\b(what is your name|who are you)\b/i)) {
            return "I'm Smart Budget Wallet's assistant. You can call me Daiko when we're chatting with voice!";
        }


        if (isDaikoActive) {
            return "Sorry, I didn't quite get that. Could you try rephrasing, or ask for 'help'? You can also say 'search Wikipedia for [your topic]'.";
        }
        return "I'm not sure how to help with that. You can ask for 'help', try rephrasing, or say 'Hi Daiko' to start a voice session for more complex queries.";
    }


    function setupChatbotEventListeners() {
        initializeAndLoadSentimentModel();

        const ttsToggle = document.getElementById('ttsToggle');
        const chatbotFab = document.getElementById('chatbotFab');
        const chatContainer = document.getElementById('chatContainer');
        const closeChatBtn = document.getElementById('closeChatBtn');
        const chatInput = document.getElementById('chatInput');
        const sendChatBtn = document.getElementById('sendChatBtn');
        const micBtn = document.getElementById('micBtn');
        const chatMessages = document.getElementById('chatMessages');


        if (ttsToggle) {
            isSpeakingEnabled = ttsToggle.checked;
            ttsToggle.addEventListener('change', () => {
                isSpeakingEnabled = ttsToggle.checked;
                if (!isSpeakingEnabled && synth && synth.speaking) {
                    synth.cancel();
                }
                if (isSpeakingEnabled && chatContainer.classList.contains('open') && botConversationState === 'IDLE' && !isDaikoActive) {
                    checkAndStartInitialRecognition();
                }
            });
        }

        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                isListening = true;
                manualMicStop = false;
                if(micBtn) micBtn.classList.add('listening');
                if(chatInput) { chatInput.placeholder = 'Listening...'; chatInput.disabled = true; }
                if(sendChatBtn) sendChatBtn.disabled = true;
                console.log("Recognition started. Daiko active:", isDaikoActive, "State:", botConversationState);
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                const lowerTranscript = transcript.toLowerCase();
                console.log("Heard:", transcript, "Daiko active:", isDaikoActive, "Mic manually stopped:", manualMicStop);

                if (manualMicStop) {
                    console.log("Ignoring transcript as mic was manually stopped:", transcript);
                    return;
                }

                if (!isDaikoActive && (lowerTranscript.includes('hi daiko') || lowerTranscript.includes('hey daiko') || lowerTranscript.includes('hello daiko'))) {
                    isDaikoActive = true;
                    botConversationState = 'IDLE';
                    appendMessageToChat('User', transcript);
                    const welcomeDaikoMsg = `Hi ${userProfile.name}! I'm Daiko. How can I help you with your budget today? You can ask me to 'set income', 'add fund', 'log expense', ask about your 'balance', or search Wikipedia.`;
                    appendMessageToChat('Bot', welcomeDaikoMsg);
                } else if (isDaikoActive || (document.activeElement === chatInput && transcript.trim() !== "")) {
                     if (transcript.trim() !== "") {
                        chatInput.value = transcript;
                        sendChatMessage();
                    } else {
                        console.log("Empty transcript, not processing.");
                    }
                } else {
                     console.log("Ignored speech (not 'Hi Daiko' and not in active session/input focused):", transcript);
                     if(isSpeakingEnabled && chatContainer.classList.contains('open') && !isListening && !isDaikoActive && botConversationState === 'IDLE'){
                         checkAndRestartRecognition();
                     }
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                if(micBtn) micBtn.classList.remove('listening');
                if(chatInput && !chatInput.disabled) chatInput.placeholder = isDaikoActive ? 'Problem listening...' : 'Type or say "Hi Daiko"';

                if (chatInput && chatInput.disabled) chatInput.disabled = false;
                if (sendChatBtn && sendChatBtn.disabled) sendChatBtn.disabled = false;


                if (event.error === 'no-speech' && isDaikoActive && botConversationState !== 'IDLE') {
                    appendMessageToChat('Bot', "Sorry, I didn't catch that. Could you please try again?");
                } else if (event.error === 'not-allowed') {
                    showAlert('Microphone access denied. Please enable it in browser settings to use voice commands.');
                    isSpeakingEnabled = false;
                    if(ttsToggle) ttsToggle.checked = false;
                } else if (event.error === 'network') {
                    showToast('Network error with speech recognition.');
                } else if (event.error !== 'aborted' && event.error !== 'language-not-supported' && event.error !== 'service-not-allowed' && event.error !== 'audio-capture') {
                }
                isListening = false;
                checkAndRestartRecognition();
            };

            recognition.onend = () => {
                console.log("Recognition ended. Daiko active:", isDaikoActive, "State:", botConversationState, "Manual stop:", manualMicStop);
                isListening = false;
                if(micBtn) micBtn.classList.remove('listening');

                if (chatInput && chatInput.disabled && sendChatBtn && sendChatBtn.disabled && (!synth || !synth.speaking)) {
                    chatInput.disabled = false;
                    sendChatBtn.disabled = false;
                    if(chatInput) chatInput.placeholder = isDaikoActive ? 'Tap mic or type...' : 'Type or say "Hi Daiko"';
                }


                if (!manualMicStop) {
                    checkAndRestartRecognition();
                }
            };
        } else {
            if(micBtn) micBtn.style.display = 'none';
            console.warn('Web Speech API (SpeechRecognition) not supported.');
            showToast('Speech input is not supported in your browser.');
        }

        if ('speechSynthesis' in window) {
            synth = window.speechSynthesis;
        } else {
            if(ttsToggle) {
                const ttsOptionsContainer = ttsToggle.closest('.chat-options');
                if(ttsOptionsContainer) ttsOptionsContainer.style.display = 'none';
            }
            isSpeakingEnabled = false;
            console.warn('Web Speech API (SpeechSynthesis) not supported.');
            showToast('Text-to-speech is not supported.');
        }

        function checkAndStartInitialRecognition() {
            if (isSpeakingEnabled && chatContainer.classList.contains('open') && recognition && !isListening && !isDaikoActive && botConversationState === 'IDLE') {
                 if (synth && synth.speaking) return;
                console.log("Initial check: Starting recognition for 'Hi Daiko'");
                try {
                    manualMicStop = false;
                    recognition.start();
                } catch (e) { console.error("Initial recognition start error:", e); }
            }
        }
        function checkAndRestartRecognition() {
            if (isSpeakingEnabled && chatContainer.classList.contains('open') && recognition && !isListening && (!synth || !synth.speaking)) {
                const statesExpectingUserInputAfterBot = [
                    'AWAITING_INCOME_AMOUNT', 'CONFIRM_INCOME_SET', 'AWAITING_FUND_NAME', 'AWAITING_FUND_TYPE',
                    'AWAITING_FUND_DEDUCTION_TYPE', 'AWAITING_FUND_EMI_AMOUNT', 'AWAITING_FUND_INITIAL_AMOUNT',
                    'AWAITING_FUND_DUE_DAY_AUTO', 'CONFIRM_FUND_CREATION', 'AWAITING_EXPENSE_FUND_NAME',
                    'AWAITING_EXPENSE_AMOUNT', 'CONFIRM_EXPENSE_LOG', 'AWAITING_WIKIPEDIA_SEARCH_TERM', 'CONFIRM_WIKIPEDIA_SEARCH'
                ];

                const listenForDaikoCommand = isDaikoActive && (botConversationState === 'IDLE' || statesExpectingUserInputAfterBot.includes(botConversationState));
                const listenForWakeWord = !isDaikoActive && botConversationState === 'IDLE';

                if (listenForDaikoCommand || listenForWakeWord) {
                    console.log("checkAndRestartRecognition: Conditions met, restarting. Daiko:", isDaikoActive, "State:", botConversationState);
                    try {
                        manualMicStop = false;
                        recognition.start();
                    } catch (e) {
                        console.error("Error restarting recognition in checkAndRestartRecognition:", e);
                         if (e.name === "InvalidStateError" && isListening) { /* Already listening, fine */ }
                    }
                } else {
                    console.log("checkAndRestartRecognition: Conditions NOT met. Daiko:", isDaikoActive, "State:", botConversationState);
                }
            }
        }


        if (chatbotFab) {
            chatbotFab.addEventListener('click', () => {
                chatContainer.classList.toggle('open');
                if (chatContainer.classList.contains('open')) {
                    if(chatInput) chatInput.focus();
                    if(chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
                    checkAndStartInitialRecognition();
                } else {
                    if (recognition && isListening) { manualMicStop = true; recognition.stop(); }
                    isDaikoActive = false;
                    botConversationState = 'IDLE';
                    if(synth && synth.speaking) synth.cancel();
                }
            });
        }

        if (closeChatBtn) {
            closeChatBtn.addEventListener('click', () => {
                chatContainer.classList.remove('open');
                if (recognition && isListening) { manualMicStop = true; recognition.stop(); }
                isDaikoActive = false;
                botConversationState = 'IDLE';
                if(synth && synth.speaking) synth.cancel();
            });
        }

        if (sendChatBtn) sendChatBtn.addEventListener('click', sendChatMessage);

        if (chatInput) {
            chatInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    manualMicStop = true;
                    if (isListening && recognition) recognition.abort();
                    sendChatMessage();
                }
            });
             chatInput.addEventListener('input', () => {
                if (isListening && recognition && chatInput.value.length > 0) {
                    console.log("User is typing, stopping recognition.");
                    manualMicStop = true;
                    recognition.abort();
                }
            });
        }

        if (micBtn && recognition) {
            micBtn.addEventListener('click', () => {
                if (!isSpeakingEnabled) { showToast("Please enable voice first using the toggle."); return; }
                manualMicStop = true;
                if (isListening) {
                    recognition.stop();
                } else {
                    if (synth && synth.speaking) synth.cancel();
                    try {
                        manualMicStop = false;
                        recognition.start();
                    } catch (e) { console.error("Mic button click error starting recognition:", e); }
                }
            });
        }
        setTimeout(checkAndStartInitialRecognition, 100);
    }

    document.addEventListener('DOMContentLoaded', () => {
        const ttsToggle = document.getElementById('ttsToggle');
        if (ttsToggle) {
            isSpeakingEnabled = ttsToggle.checked;
        } else {
            isSpeakingEnabled = false;
            console.error("ttsToggle element not found!");
        }
        
        // Add this line, ensuring the IDs match your HTML for the auth password field
    setupPasswordVisibilityToggle('userPasswordInput', 'togglePasswordVisibility');

        if ('speechSynthesis' in window) {
            synth = window.speechSynthesis;
        } else {
            console.warn('Web Speech API (SpeechSynthesis) not supported.');
            showToast('Text-to-speech is not supported.');
            if (ttsToggle) {
                const ttsOptionsContainer = ttsToggle.closest('.chat-options');
                if (ttsOptionsContainer) ttsOptionsContainer.style.display = 'none';
            }
            isSpeakingEnabled = false;
        }

        const dailyExpensesGraphContainer = document.getElementById('dailyExpensesGraphContainer');
                   const dailyExpensesGraphToggleIcon = document.getElementById('dailyExpensesGraphToggleIcon');
                   if (dailyExpensesGraphContainer && dailyExpensesGraphToggleIcon) {
                   dailyExpensesGraphToggleIcon.textContent = dailyExpensesGraphContainer.style.display === 'none' ? '▼' : '▲';
                   }
        
        document.getElementById('currencySelect').value = appSettings.currency;
        document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;
        renderUserProfile();

        const settingsDarkModeToggle = document.getElementById('darkModeToggleSwitchSettings');
        const savedDarkMode = localStorage.getItem('darkMode');
        if (savedDarkMode === 'true') {
            document.body.classList.add('dark-mode');
            if(settingsDarkModeToggle) settingsDarkModeToggle.checked = true;
        } else {
            if(settingsDarkModeToggle) settingsDarkModeToggle.checked = false;
        }
        if(settingsDarkModeToggle) settingsDarkModeToggle.addEventListener('change', toggleDarkMode);

        const avatarOptionsContainer = document.getElementById('avatarOptions');
        if(avatarOptionsContainer) avatarOptionsContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('avatar-option')) {
                selectAvatar(event.target.dataset.emoji);
            }
        });

        const mainFaqContent = document.getElementById('faqContent');
        const settingsFaqContent = document.getElementById('faqContentSettings');
        if (mainFaqContent && settingsFaqContent) {
            settingsFaqContent.innerHTML = mainFaqContent.innerHTML;
        }

        initializeDashboardGauges();
        const toggleLogTransactionBtn = document.getElementById('toggleLogTransactionBtn');
        if(toggleLogTransactionBtn) toggleLogTransactionBtn.addEventListener('click', toggleLogTransactionSection);

        const mainWrapper = document.getElementById('mainContentWrapper');
    if (mainWrapper) {
        let touchStartX = 0;
        let touchEndX = 0;
        const swipeThreshold = 50; // Minimum distance for a swipe

        mainWrapper.addEventListener('touchstart', e => {
            // Only consider single touch for swipe
            if (e.touches.length === 1) {
                touchStartX = e.changedTouches[0].screenX;
                console.log(`Swipe TouchStart on mainWrapper: X=${touchStartX}, Current Section: ${activeSectionWrapperId}`);
            }
        }, { passive: true });

        mainWrapper.addEventListener('touchend', e => {
            // Only consider single touch for swipe
            if (e.changedTouches.length === 1) {
                touchEndX = e.changedTouches[0].screenX;
                console.log(`Swipe TouchEnd on mainWrapper: X=${touchEndX}, Current Section: ${activeSectionWrapperId}`);
                handleSwipe(); // Call your existing handleSwipe function
            }
        }, { passive: true });

        function handleSwipe() {
            const deltaX = touchEndX - touchStartX;
            const currentSectionIndex = sectionOrder.indexOf(activeSectionWrapperId);

            console.log(
                `handleSwipe Executed: StartX=${touchStartX}, EndX=${touchEndX}, DeltaX=${deltaX}, ` +
                `ActiveSection=${activeSectionWrapperId}, CurrentIndex=${currentSectionIndex}, Threshold=${swipeThreshold}`
            );

            if (currentSectionIndex === -1) {
                console.error("Swipe Error: Could not determine current section index. Active ID:", activeSectionWrapperId);
                // Reset points to avoid issues on next attempt
                touchStartX = 0;
                touchEndX = 0;
                return;
            }

            // Check if a significant swipe occurred (both points must be set, and delta must exceed threshold)
            if (touchStartX !== 0 && touchEndX !== 0) { // Ensure both start and end were captured
                if (deltaX < -swipeThreshold) { // Swiped Left (Next Section)
                    if (currentSectionIndex < sectionOrder.length - 1) {
                        console.log("Swipe Action: Swiped Left. Navigating to NEXT section.");
                        scrollToSection(sectionOrder[currentSectionIndex + 1].replace('SectionWrapper', '-section'), true);
                    } else {
                        console.log("Swipe Action: Swiped Left. Already at the last section.");
                    }
                } else if (deltaX > swipeThreshold) { // Swiped Right (Previous Section)
                    if (currentSectionIndex > 0) {
                        console.log("Swipe Action: Swiped Right. Navigating to PREVIOUS section.");
                        scrollToSection(sectionOrder[currentSectionIndex - 1].replace('SectionWrapper', '-section'), true);
                    } else {
                        console.log("Swipe Action: Swiped Right. Already at the first section.");
                    }
                } else {
                    console.log("Swipe Action: Swipe distance did not meet threshold. DeltaX:", deltaX);
                }
            } else {
                console.log("Swipe Action: Incomplete swipe data (touchStartX or touchEndX not properly set).");
            }

            // Reset points for the next distinct swipe gesture
            touchStartX = 0;
            touchEndX = 0;
        }
    }

        toggleAutoDeductOptions();
        sectionOrder.forEach(wrapperId => {
            const sectionWrapperElement = document.getElementById(wrapperId);
            if (!sectionWrapperElement) return;
            const isDashboard = (wrapperId === 'dashboardSectionWrapper');
            if (isDashboard) {
                sectionWrapperElement.classList.add('active');
                const dashboardElementsToToggle = [
                    '.total-balance', '#dashboardGaugesContainer', '#toggleLogTransactionBtn',
                    '#monthlyIncomeCard', '#expenseFundsCard', '#investmentFundsCard',
                    '#transferFundsCard'
                ];
                dashboardElementsToToggle.forEach(selector => {
                    const el = sectionWrapperElement.querySelector(selector) || document.querySelector(selector);
                    if (el) {
                        el.style.display = (selector === '#dashboardGaugesContainer') ? 'flex' : 'block';
                    }
                });
                const currentDateDisplayCard = document.getElementById('currentDateDisplay')?.closest('.card');
                if (currentDateDisplayCard) currentDateDisplayCard.style.display = 'block';
                const logTransactionCard = document.getElementById('logTransactionSectionCard');
                if (logTransactionCard) logTransactionCard.style.display = 'none';

            } else {
                sectionWrapperElement.classList.remove('active');
                const mainContentId = wrapperId.replace('SectionWrapper', '-section');
                const mainContentDiv = document.getElementById(mainContentId);
                if (mainContentDiv) {
                    mainContentDiv.style.display = 'none';
                }
            }
        });

        const paymentActionTextSpan = document.getElementById('paymentActionText');
        if (document.querySelector('input[name="paymentMethod"]')) {
            document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    if (paymentActionTextSpan) {
                        const logExpenseButton = document.querySelector('#logTransactionSectionCard button.secondary');
                        if (this.value === 'scanAndPay') {
                            paymentActionTextSpan.textContent = ' & Scan QR';
                            if(logExpenseButton) logExpenseButton.childNodes[0].nodeValue = "Log & Scan ";
                        } else if (this.value === 'cash') { // Added explicit handling for cash
                            paymentActionTextSpan.textContent = '';
                            if(logExpenseButton) logExpenseButton.childNodes[0].nodeValue = "Log Expense ";
                        }
                        // ADD THE NEW 'else if' FOR 'payViaUpiApp' HERE:
                        else if (this.value === 'payViaUpiApp') {
                            const defaultApp = appSettings.defaultPaymentApp || 'Default App'; // Fallback text
                            paymentActionTextSpan.textContent = ` & Open ${defaultApp}`;
                            if(logExpenseButton) logExpenseButton.childNodes[0].nodeValue = "Log Expense "; // Keep main button text
                        }
                        // Ensure default case for cash if none of the above match or if you want to reset
                        // else { 
                        //     paymentActionTextSpan.textContent = '';
                        //     if(logExpenseButton) logExpenseButton.childNodes[0].nodeValue = "Log Expense ";
                        // }
                    }
                });
            });
            // Trigger change event for the initially checked radio button to set initial button text
            const initiallyCheckedRadio = document.querySelector('input[name="paymentMethod"]:checked');
            if (initiallyCheckedRadio) {
                initiallyCheckedRadio.dispatchEvent(new Event('change'));
            }
        }

        render();

        const welcomeMessageEl = document.getElementById('welcomeMessage');
        if(welcomeMessageEl && userProfile) welcomeMessageEl.textContent = `Welcome, ${userProfile.name}!`;


        const todayForImport = new Date();
        const currentMonthDataForImport = getCurrentMonthData();
        if (currentMonthDataForImport && todayForImport.getDate() === 1 && !currentMonthDataForImport.fundsImported) {
            autoImportFundsForNewMonth().then(() => {
            });
        }

        if (localStorage.getItem('tutorialShown') !== 'true') {
            setTimeout(startTutorial, 700);
        }

        setupChatbotEventListeners();

    });
