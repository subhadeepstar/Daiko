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
let pendingLocalDataUpload = false; // Flag to manage data upload after switching to shared mode
let pendingSwitchToIndividualMode = false; // True if user selected 'individual' mode while logged into 'shared'


// Modify your existing onAuthStateChanged function:
// Near line 20, replace the existing onAuthStateChanged


auth.onAuthStateChanged(async user => {
    const authStatusDisplay = document.getElementById('authStatusDisplay');
    const authFormContainer = document.getElementById('authFormContainer');
    const logoutButton = document.getElementById('logoutButton');
    const profileNameDisplay = document.getElementById('profileNameDisplay');
    const profileEmailDisplay = document.getElementById('profileEmailDisplay');
    const welcomeMessageEl = document.getElementById('welcomeMessage');
    const welcomeAvatarEl = document.getElementById('welcomeAvatar');

    // Always try to detach any existing listener first when auth state might be changing.
    if (budgetListenerUnsubscribe) {
        console.log("Detaching existing Firestore listener (onAuthStateChanged start).");
        budgetListenerUnsubscribe();
        budgetListenerUnsubscribe = null;
    }

    if (user) {
        currentUser = user; // Firebase user is logged in
        console.log("Firebase user session active:", currentUser.uid, currentUser.email);

        // Update common UI elements based on Firebase user and local userProfile
        if (profileEmailDisplay) profileEmailDisplay.textContent = currentUser.email;
        // Use local userProfile.name if available and not "Guest", otherwise derive from email
        let displayNameForWelcome = (userProfile.name && userProfile.name !== 'Guest' && userProfile.name.trim() !== '') ? userProfile.name : currentUser.email.split('@')[0];
        if (welcomeMessageEl) welcomeMessageEl.textContent = `Welcome, ${displayNameForWelcome}!`;
        if (welcomeAvatarEl) welcomeAvatarEl.src = userProfile.avatar || 'image1.png'; // Use local avatar image

        if (appSettings.budgetMode === 'shared') {
            console.log("User logged in AND in Shared Mode.");
            if (authStatusDisplay) authStatusDisplay.textContent = `Shared Mode: Logged in as ${currentUser.email}`;
            
            // Process any pending upload from a recent mode switch BEFORE setting up the listener
            await processPendingUploadIfNeeded(currentUser); // This handles prompts and potential Firestore write
            
            showToast('Syncing shared budget...');
            setupFirestoreListenerForUser(currentUser); // This sets onSnapshot, which loads data & calls render
        } else { // Individual Mode, but a Firebase user session technically exists
            console.log("Firebase user session active, but app is in Individual Mode. Using local data.");
            // Listener is already ensured detached.
            
            // Ensure local data is the source of truth
            monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
            // Full sanitization for monthlyData from localStorage
            for (const monthKey in monthlyData) {
                 if (monthlyData.hasOwnProperty(monthKey)) {
                    const month = monthlyData[monthKey];
                    if (month.hasOwnProperty('income')) month.income = parseFloat(month.income) || 0;
                    if (month.categories && Array.isArray(month.categories)) {
                        month.categories.forEach(cat => {
                            cat.initialBalance = parseFloat(cat.initialBalance) || 0;
                            cat.balance = parseFloat(cat.balance) || 0;
                            cat.spent = parseFloat(cat.spent) || 0;
                            if (cat.hasOwnProperty('emiAmount')) cat.emiAmount = parseFloat(cat.emiAmount) || 0;
                            if (cat.hasOwnProperty('dueDay') && cat.dueDay !== null) cat.dueDay = parseInt(cat.dueDay, 10) || null;
                        });
                    }
                     if (!month.history) month.history = [];
                     if (!month.hasOwnProperty('emiDeducted')) month.emiDeducted = false;
                     if (!month.hasOwnProperty('fundsImported')) month.fundsImported = false;
                 }
            }
            // appSettings would have been loaded from localStorage at DOMContentLoaded
            // and reflect 'individual' mode.
            document.getElementById('currencySelect').value = appSettings.currency;
            document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;

            showToast("Using Individual Offline Budget.");
            render(); // Render with local data
        }
        // Clear auth form fields after login/signup attempt is processed
        const emailAuthInput = document.getElementById('userEmailInput');
        const passwordAuthInput = document.getElementById('userPasswordInput');
        if (emailAuthInput) emailAuthInput.value = '';
        if (passwordAuthInput) passwordAuthInput.value = '';

    } else {
        // User is signed out from Firebase
        currentUser = null;
        console.log("Firebase user signed out (onAuthStateChanged).");

        // Reset UI to guest/logged-out state
        if (profileEmailDisplay) profileEmailDisplay.textContent = '';
        if (profileNameDisplay) profileNameDisplay.textContent = 'Guest';
        if (welcomeAvatarEl) welcomeAvatarEl.src = 'image1.png'; // Default avatar image on logout
        if (welcomeMessageEl) welcomeMessageEl.textContent = `Welcome, Guest!`;
        
        // Also reset the local userProfile object for consistency on logout
        userProfile.name = 'Guest';
        userProfile.email = ''; // Clear email from local profile as well
        userProfile.avatar = 'image1.png'; // Default avatar image
        saveUserProfile(); // Save this guest state to localStorage
        
        // Regardless of mode, if no Firebase user, operate on localStorage data
        monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
        // Full sanitization for monthlyData from localStorage
        for (const monthKey in monthlyData) {
             if (monthlyData.hasOwnProperty(monthKey)) {
                const month = monthlyData[monthKey];
                if (month.hasOwnProperty('income')) month.income = parseFloat(month.income) || 0;
                if (month.categories && Array.isArray(month.categories)) {
                    month.categories.forEach(cat => {
                        cat.initialBalance = parseFloat(cat.initialBalance) || 0;
                        cat.balance = parseFloat(cat.balance) || 0;
                        cat.spent = parseFloat(cat.spent) || 0;
                        if (cat.hasOwnProperty('emiAmount')) cat.emiAmount = parseFloat(cat.emiAmount) || 0;
                        if (cat.hasOwnProperty('dueDay') && cat.dueDay !== null) cat.dueDay = parseInt(cat.dueDay, 10) || null;
                    });
                }
                if (!month.history) month.history = [];
                if (!month.hasOwnProperty('emiDeducted')) month.emiDeducted = false;
                if (!month.hasOwnProperty('fundsImported')) month.fundsImported = false;
             }
        }
        // Load appSettings from localStorage. The budgetMode will determine further behavior.
        appSettings = JSON.parse(localStorage.getItem('appSettings')) || { currency: 'INR', defaultPaymentApp: 'GPay', notifications: [], budgetMode: 'individual' };
        if (!appSettings.budgetMode) appSettings.budgetMode = 'individual'; // Ensure default if missing
        if (!appSettings.notifications) appSettings.notifications = [];
        
        document.getElementById('currencySelect').value = appSettings.currency;
        document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;

        showToast("You are logged out.");
        render(); // Render the logged-out state using local data
    }
    // Update auth UI visibility based on the current mode and user object (currentUser could be null here)
    updateAuthUIVisibility();
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

function toggleHowWasMyDayGraph() {
    const graphContainer = document.getElementById('howWasMyDayGraphContainer');
    const graphToggleIcon = document.getElementById('howWasMyDayGraphToggleIcon');
    const isHidden = graphContainer.style.display === 'none';
    graphContainer.style.display = isHidden ? 'block' : 'none';
    graphToggleIcon.textContent = isHidden ? '▲' : '▼';
    if (isHidden) {
        renderHowWasMyDayChart(); // Render the chart when it's made visible
    }
}

function getHowWasMyDayExpenseDataForChart() {
    const today = new Date();
    const targetMonthKey = getMonthYearString(today); // Assumes getMonthYearString utility exists
    const targetDay = today.getDate();

    const hourlyExpenses = Array(24).fill(0); // 0 to 23 hours

    if (monthlyData[targetMonthKey] && monthlyData[targetMonthKey].history) {
        const historyForTodayMonth = monthlyData[targetMonthKey].history;
        const expenseTypes = ['expense_cash', 'expense_scan_pay', 'expense_pay_via_app', 'emi_deduction_processed'];

        historyForTodayMonth.forEach(transaction => {
            const transactionDate = new Date(transaction.timestamp);
            if (transactionDate.getFullYear() === today.getFullYear() &&
                transactionDate.getMonth() === today.getMonth() &&
                transactionDate.getDate() === targetDay &&
                expenseTypes.includes(transaction.type) &&
                transaction.amount > 0) {
                const hourOfDay = transactionDate.getHours();
                hourlyExpenses[hourOfDay] += transaction.amount;
            }
        });
    }

    const labels = Array.from({ length: 24 }, (_, i) => {
        const d = new Date(0, 0, 0, i);
        // Format time like "12AM", "1AM", ..., "11PM"
        let hours = d.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        return hours + ampm;
    });
    const data = hourlyExpenses;

    return {
        labels: labels,
        data: data
    };
}

function renderHowWasMyDayChart() {
    const chartData = getHowWasMyDayExpenseDataForChart();
    const ctx = document.getElementById('howWasMyDayBarChart').getContext('2d');
    const currentCurrencySymbol = currencySymbols[appSettings.currency];

    // Use same color variables as renderDailyBarChart
    const barChartTextColor = '#FFBF00'; // Amber/Gold color for text elements
    const primaryColorRGB = getComputedStyle(document.documentElement).getPropertyValue('--primary-color-rgb').trim();
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();

    if (howWasMyDayBarChartInstance) {
        howWasMyDayBarChartInstance.destroy();
    }

    howWasMyDayBarChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: `Today's Expenses (${currentCurrencySymbol})`,
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
                        color: barChartTextColor
                    }
                },
                tooltip: {
                    titleColor: barChartTextColor,
                    bodyColor: barChartTextColor,
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
                        color: barChartTextColor
                    },
                    ticks: {
                        color: barChartTextColor,
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
                        text: 'Time of Day',
                        color: barChartTextColor
                    },
                    ticks: {
                        color: barChartTextColor
                    },
                    grid: {
                        display: false, // No vertical grid lines for a cleaner look
                        borderColor: gridColor
                    }
                }
            }
        }
    });
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
  
    function analyzeFinancialMonth(monthData, monthKey) { // monthKey is string like "June 2025"
    const metrics = {
        month: monthKey,
        totalIncome: parseFloat(monthData.income) || 0,
        totalSpentOverall: 0,
        totalExpenseSpent: 0,
        totalInvestmentSpent: 0,
        totalAutoDeductSpent: 0, // Specifically for EMIs/Loans that are auto-deducted expenses
        spendingByCategory: {}, // To store sum of spending per category name
        topSpendingCategories: [],
        transferCount: 0,
        totalTransferAmount: 0,
        savings: 0,
        savingsRate: 0,
        // For 50/30/20 rule - these are heuristic-based estimates
        needsSpending: 0,
        wantsSpending: 0,
        savingsAndDebtRepaymentContribution: 0, // For the '20' part
        unclassifiedManualExpenses: 0, // For manual expenses not easily categorized
    };

    if (!monthData.categories || !Array.isArray(monthData.categories)) {
         console.warn(`No categories data for month: ${monthKey}`);
         monthData.categories = []; // Ensure it's an array to prevent errors
    }
    
    monthData.categories.forEach(cat => {
        const spent = parseFloat(cat.spent) || 0;
        metrics.totalSpentOverall += spent;
        metrics.spendingByCategory[cat.name] = (metrics.spendingByCategory[cat.name] || 0) + spent;

        if (cat.type === 'investment') {
            metrics.totalInvestmentSpent += spent;
            metrics.savingsAndDebtRepaymentContribution += spent; // Investments count towards the '20'
        } else if (cat.type === 'expense') {
            metrics.totalExpenseSpent += spent;
            if (cat.deductionType === 'auto') {
                metrics.totalAutoDeductSpent += spent;
                // Heuristic categorization for auto-deducted expenses:
                if (cat.name.toLowerCase().includes('loan') || cat.name.toLowerCase().includes('emi') || cat.name.toLowerCase().includes('debt')) {
                    metrics.savingsAndDebtRepaymentContribution += spent; // Debt repayment part of '20'
                } else if (['rent', 'mortgage', 'utilities', 'insurance', 'childcare', 'healthcare bill'].some(need => cat.name.toLowerCase().includes(need))) {
                    metrics.needsSpending += spent;
                } else {
                    // If an auto-deduct isn't clearly debt or a common need, it's tricky.
                    // For now, let's put other auto-deducts into needs, assuming they are fixed essentials.
                    metrics.needsSpending += spent; 
                }
            } else { // Manual expenses - harder to classify
                if (['groceries', 'food', 'transport', 'utilities', 'rent', 'childcare', 'healthcare', 'insurance', 'medicine', 'essential supplies'].some(need => cat.name.toLowerCase().includes(need))) {
                    metrics.needsSpending += spent;
                } else if (['entertainment', 'dining out', 'hobbies', 'shopping', 'travel', 'subscriptions', 'gifts', 'luxury'].some(want => cat.name.toLowerCase().includes(want))) {
                    metrics.wantsSpending += spent;
                } else {
                    metrics.unclassifiedManualExpenses += spent; // For things not easily matched
                }
            }
        }
    });
    
    // Handle unclassified manual expenses:
    if (metrics.unclassifiedManualExpenses > 0) {
        metrics.wantsSpending += metrics.unclassifiedManualExpenses; // Tentatively add to "Wants"
    }

    metrics.topSpendingCategories = Object.entries(metrics.spendingByCategory)
        .filter(([,amount]) => amount > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3) // Get top 3 spending categories
        .map(([name, amount]) => ({ name, amount }));

    if (monthData.history && Array.isArray(monthData.history)) {
        monthData.history.forEach(transaction => {
            if (transaction.type === 'transfer') {
                metrics.transferCount++;
                metrics.totalTransferAmount += parseFloat(transaction.amount) || 0;
            }
        });
    }

    metrics.savings = metrics.totalIncome - metrics.totalSpentOverall;
    if (metrics.totalIncome > 0) {
        metrics.savingsRate = (metrics.savings / metrics.totalIncome) * 100;
    } else {
        metrics.savingsRate = metrics.totalSpentOverall > 0 ? -Infinity : 0;
    }
    
    return metrics;
}

function suggestAndAnalyzeFinancialRule(metrics, income, currencySymbol) {
    // Ensure currencySymbol is the actual symbol (e.g., "₹") and not a placeholder string.
    // And that metrics and income contain valid numbers.

    let suggestedRule = { 
        name: "50/30/20", 
        needsTarget: 50, 
        wantsTarget: 30, 
        savingsTarget: 20, 
        details: "(50% Needs, 30% Wants, 20% Savings/Debt)" 
    };
    let ruleExplanation = "";
    let userBreakdownHTML = ""; // This is where the problematic HTML is constructed
    let ruleFeedbackPoints = [];

    const needsActualPercent = income > 0 ? (metrics.needsSpending / income) * 100 : 0;
    const wantsActualPercent = income > 0 ? (metrics.wantsSpending / income) * 100 : 0;
    const savingsActualPercent = income > 0 ? (metrics.savingsAndDebtRepaymentContribution / income) * 100 : 0;

    if (income > 0) {
        if (needsActualPercent > 58 && savingsActualPercent < 12) {
            suggestedRule = { name: "60/30/10", needsTarget: 60, wantsTarget: 30, savingsTarget: 10, details: "(60% Needs, 30% Wants, 10% Savings/Debt)" };
            // USE BACKTICKS (`) for template literals
            ruleExplanation = `Considering your current essential spending, the <strong>${suggestedRule.name} rule</strong> ${suggestedRule.details} might be a practical approach for now. The goal would be to gradually shift towards more savings.`;
        } else if (income < 30000 && appSettings.currency === 'INR') { 
            suggestedRule = { name: "70/20/10", needsTarget: 70, wantsTarget: null, savingsTarget: 20, extraTarget:10, details: "(70% Living Expenses, 20% Savings, 10% Debt/Giving)" , type: "simplified_living"};
            ruleExplanation = `For tighter budgets, the <strong>${suggestedRule.name} rule</strong> ${suggestedRule.details} can be useful. It focuses 70% on all living costs.`;
        } else if (metrics.totalInvestmentSpent > (income * 0.10) && income > 60000 && appSettings.currency === 'INR') { 
            suggestedRule = { name: "40/30/20/10", needsTarget: 40, wantsTarget: 30, savingsTarget: 20, extraTarget: 10, details: "(40% Needs, 30% Wants, 20% Savings/Debt, 10% Investing)", type: "advanced_investing" };
            ruleExplanation = `Since you're already investing, the <strong>${suggestedRule.name} rule</strong> ${suggestedRule.details} could help structure your finances further, with a dedicated portion for investments.`;
        } else { 
            ruleExplanation = `A balanced approach is the <strong>${suggestedRule.name} rule</strong> ${suggestedRule.details}. This is a great general guideline.`;
        }
    } else {
        ruleExplanation = "To get specific rule suggestions, please set your monthly income first. A common guideline is the 50/30/20 rule (50% Needs, 30% Wants, 20% Savings/Debt)."
        return { 
            ruleNameHtml: "N/A", 
            ruleExplanationHtml: `<p>${ruleExplanation}</p>`, 
            userBreakdownHTML: "<p>Please set your income to see a breakdown.</p>", 
            ruleFeedbackHTML: "" 
        };
    }

    // Constructing userBreakdownHTML - THIS IS THE CRITICAL PART
    // Ensure ALL string concatenations that involve variables use BACKTICKS (`)
    if (suggestedRule.type === "simplified_living") {
        const totalLivingExpenses = metrics.needsSpending + metrics.wantsSpending;
        const livingActualPercent = income > 0 ? (totalLivingExpenses / income) * 100 : 0;
        // Make sure all these variables are numbers before .toFixed() is called.
        // currencySymbol must be the actual symbol string.

        userBreakdownHTML = `Your estimated spending for the <strong>${suggestedRule.name}</strong> guideline:
            <ul>
                <li>Living Expenses (Target ${suggestedRule.needsTarget}%): <strong>${livingActualPercent.toFixed(1)}%</strong> (${currencySymbol}${totalLivingExpenses.toFixed(2)})</li>
                <li>Savings (Target ${suggestedRule.savingsTarget}%): <strong>${savingsActualPercent.toFixed(1)}%</strong> (${currencySymbol}${metrics.savingsAndDebtRepaymentContribution.toFixed(2)})</li>
                <li>Debt/Giving (Target ${suggestedRule.extraTarget}%): This portion requires your specific allocation.</li>
            </ul>`;
        if (livingActualPercent > suggestedRule.needsTarget + 5) ruleFeedbackPoints.push("Your total living expenses are a bit above the target.");
        if (savingsActualPercent < suggestedRule.savingsTarget - 2) ruleFeedbackPoints.push("Focus on increasing your savings allocation.");

    } else if (suggestedRule.type === "advanced_investing") { 
        const generalSavingsAmount = metrics.savingsAndDebtRepaymentContribution - metrics.totalInvestmentSpent;
        const generalSavingsPercent = income > 0 ? (generalSavingsAmount / income) * 100 : 0;
        const investmentActualPercent = income > 0 ? (metrics.totalInvestmentSpent / income) * 100 : 0;

        userBreakdownHTML = `Your estimated spending for the <strong>${suggestedRule.name}</strong> guideline:
            <ul>
                <li>Needs (Target ${suggestedRule.needsTarget}%): <strong>${needsActualPercent.toFixed(1)}%</strong> (${currencySymbol}${metrics.needsSpending.toFixed(2)})</li>
                <li>Wants (Target ${suggestedRule.wantsTarget}%): <strong>${wantsActualPercent.toFixed(1)}%</strong> (${currencySymbol}${metrics.wantsSpending.toFixed(2)})</li>
                <li>General Savings/Debt (Target ${suggestedRule.savingsTarget}%): <strong>${generalSavingsPercent.toFixed(1)}%</strong> (${currencySymbol}${generalSavingsAmount.toFixed(2)})</li>
                <li>Investing (Target ${suggestedRule.extraTarget}%): <strong>${investmentActualPercent.toFixed(1)}%</strong> (${currencySymbol}${metrics.totalInvestmentSpent.toFixed(2)})</li>
            </ul>`;
        if (investmentActualPercent < suggestedRule.extraTarget -2) ruleFeedbackPoints.push("Consider increasing your dedicated investment amount.");
        if (generalSavingsPercent < suggestedRule.savingsTarget -2) ruleFeedbackPoints.push("Look for ways to boost your general savings.");
        if (wantsActualPercent > suggestedRule.wantsTarget + 5) ruleFeedbackPoints.push("Your 'Wants' are a bit high for this rule.");

    } else { // For 50/30/20 or 60/30/10 (default case)
        userBreakdownHTML = `Your estimated spending for the <strong>${suggestedRule.name}</strong> guideline:
            <ul>
                <li>Needs (Target ${suggestedRule.needsTarget}%): <strong>${needsActualPercent.toFixed(1)}%</strong> (${currencySymbol}${metrics.needsSpending.toFixed(2)})</li>
                <li>Wants (Target ${suggestedRule.wantsTarget}%): <strong>${wantsActualPercent.toFixed(1)}%</strong> (${currencySymbol}${metrics.wantsSpending.toFixed(2)})</li>
                <li>Savings & Debt (Target ${suggestedRule.savingsTarget}%): <strong>${savingsActualPercent.toFixed(1)}%</strong> (${currencySymbol}${metrics.savingsAndDebtRepaymentContribution.toFixed(2)})</li>
            </ul>`;
        if (savingsActualPercent < suggestedRule.savingsTarget - 2) ruleFeedbackPoints.push(`Your savings are below the ${suggestedRule.savingsTarget}% target. Aim to increase this.`);
        if (wantsActualPercent > suggestedRule.wantsTarget + 5) ruleFeedbackPoints.push(`'Wants' spending is currently higher than the ${suggestedRule.wantsTarget}% suggested.`);
        if (needsActualPercent > suggestedRule.needsTarget + 5 && savingsActualPercent < suggestedRule.savingsTarget -2) ruleFeedbackPoints.push("High 'Needs' spending might be impacting your ability to save. Review fixed costs if possible.");
        if (savingsActualPercent > suggestedRule.savingsTarget + 2) ruleFeedbackPoints.push(`Great job on your savings & debt allocation, it's above the ${suggestedRule.savingsTarget}% target!`);
    }
    
    const ruleFeedbackHTML = ruleFeedbackPoints.length > 0 ? `<ul>${ruleFeedbackPoints.map(p => `<li>${p}</li>`).join('')}</ul>` : "<p>Your distribution looks quite balanced with this guideline for now!</p>";

    return {
        ruleNameHtml: `<strong>${suggestedRule.name}</strong> ${suggestedRule.details}`,
        ruleExplanationHtml: `<p>${ruleExplanation}</p>`,
        userBreakdownHTML, // This string must be correctly using template literals
        ruleFeedbackHTML
    };
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
   let userProfile = JSON.parse(localStorage.getItem('userProfile')) || { name: 'Guest', avatar: 'image1.png', email: '' };
let appSettings = JSON.parse(localStorage.getItem('appSettings')) || {
        currency: 'INR',
        defaultPaymentApp: 'GPay',
        notifications: [],
        
        userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone // Default to browser's timezone
    };
     if (!appSettings.notifications) appSettings.notifications = [];


    // Initialize Chart.js pie chart instance
    let expensePieChart;
    let dailyExpensesBarChart;
    let howWasMyDayBarChartInstance;
    // Dashboard Gauge Chart Instances
    let investmentGaugeChart, expenseGaugeChart, loanGaugeChart;

    const daikoInsightsModal = document.getElementById('daikoInsightsModal');
    const daikoInsightsContentEl = document.getElementById('daikoInsightsContent');
    const daikoInsightsModalTitleEl = document.getElementById('daikoInsightsModalTitle');


function openDaikoInsightsModal() {
    if (!daikoInsightsModal || !daikoInsightsContentEl) return;

    daikoInsightsModal.classList.add('active');
    daikoInsightsContentEl.innerHTML = `<p>Hi ${userProfile.name || 'there'}! Let me take a moment to analyze your finances...</p>`;
    if (daikoInsightsModalTitleEl) {
        daikoInsightsModalTitleEl.textContent = `Daiko's Financial Insights for ${getFullDateString(currentMonth)}`;
    }

    // Set initial state of the speak button
    const ttsButton = document.getElementById('toggleDaikoSpeakBtn');
    if (ttsButton) {
        if (isSpeakingEnabled && synth) { // Also check if synth is available
            ttsButton.innerHTML = '🔊';
            ttsButton.classList.remove('muted');
        } else {
            ttsButton.innerHTML = '🔇';
            ttsButton.classList.add('muted');
        }
    }

    setTimeout(async () => {
        await populateDaikoInsights();
    }, 700);
}

async function populateDaikoInsights() {
    if (!daikoInsightsContentEl) {
        console.error("Daiko Insights content element not found!");
        return;
    }
    let fullNarrationText = ""; 

    const currencySymbol = currencySymbols[appSettings.currency] || '₹';
    const currentMonthObj = new Date(currentMonth); 
    const currentMonthKey = getMonthYearString(currentMonthObj); 
    const currentMonthData = getCurrentMonthData(); 
    const currentMetrics = analyzeFinancialMonth(currentMonthData, currentMonthKey); // Ensure analyzeFinancialMonth is defined and working

    const prevMonthDate = new Date(currentMonthObj);
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonthKey = getMonthYearString(prevMonthDate); 
    const prevMonthData = monthlyData[prevMonthKey]; // Get previous month's raw data
    
    let insightsHTML = "";
    let greeting = `Hi ${userProfile.name || 'there'}! I've reviewed your finances. Here's what I see:`;
    insightsHTML += `<p>${greeting}</p>`;
    fullNarrationText += greeting + " ";

    // --- Section 1: Previous Month Review (REFINED LOGIC) ---
    let prevMonthNarrationAdded = false; // Flag to check if we add the "Flashback" title
    let tempPrevMonthHTML = "";
    let tempPrevMonthNarration = "";

    if (prevMonthData) {
        const prevMetrics = analyzeFinancialMonth(prevMonthData, prevMonthKey);
        // Only proceed if there's actual income or spending to report for the previous month
        if (prevMetrics && (prevMetrics.totalIncome > 0 || prevMetrics.totalSpentOverall > 0)) {
            let prevMonthSummary = "";
            if (prevMetrics.totalIncome > 0) {
                // CORRECTED TEMPLATE LITERAL USAGE
                prevMonthSummary += `Last month, your income was ${currencySymbol}${prevMetrics.totalIncome.toFixed(2)}. You spent ${currencySymbol}${prevMetrics.totalSpentOverall.toFixed(2)}. `;
                if (prevMetrics.savings >= 0) {
                    prevMonthSummary += `This means you saved ${currencySymbol}${prevMetrics.savings.toFixed(2)} (${prevMetrics.savingsRate.toFixed(1)}% of income). `;
                    if (prevMetrics.savingsRate >= 20) {
                        prevMonthSummary += "Fantastic job on saving! ";
                    } else if (prevMetrics.savingsRate < 10 && prevMetrics.savingsRate >= 0) {
                        prevMonthSummary += "That was a bit tight on savings, something to keep an eye on. ";
                    }
                } else {
                    prevMonthSummary += `Looks like you overspent by ${currencySymbol}${Math.abs(prevMetrics.savings).toFixed(2)}. Let's aim for a surplus! `;
                }
            } else { // Had spending but no income recorded for prev month
                 prevMonthSummary = `In ${prevMonthKey}, you spent ${currencySymbol}${prevMetrics.totalSpentOverall.toFixed(2)} with no income recorded for that month. `;
            }
            tempPrevMonthHTML += `<p>${prevMonthSummary}</p>`;
            tempPrevMonthNarration += prevMonthSummary;

            if (prevMetrics.topSpendingCategories && prevMetrics.topSpendingCategories.length > 0) {
                const topPrevCat = prevMetrics.topSpendingCategories[0];
                if (topPrevCat && topPrevCat.amount > 0) { // Ensure there's an actual top category with spending
                    // CORRECTED TEMPLATE LITERAL USAGE
                    const prevTopSpendingText = `Your main expense area then was <strong>"${topPrevCat.name}"</strong> at ${currencySymbol}${topPrevCat.amount.toFixed(2)}. `;
                    tempPrevMonthHTML += `<p>${prevTopSpendingText}</p>`;
                    tempPrevMonthNarration += prevTopSpendingText.replace(/<strong>|<\/strong>/g, "");
                }
            }
             if (prevMetrics.totalInvestmentSpent > 0){
                // CORRECTED TEMPLATE LITERAL USAGE
                const prevInvestText = `You also invested ${currencySymbol}${prevMetrics.totalInvestmentSpent.toFixed(2)}. That's the way to go!`;
                tempPrevMonthHTML += `<p>${prevInvestText}</p>`;
                tempPrevMonthNarration += prevInvestText;
             } else {
                const prevNoInvestText = "I didn't see any investments logged for that month. Remember, every bit counts towards your future goals. ";
                tempPrevMonthHTML += `<p>${prevNoInvestText}</p>`;
                tempPrevMonthNarration += prevNoInvestText;
             }
            prevMonthNarrationAdded = true; // We have content for previous month
        }
    }

    if (prevMonthNarrationAdded) {
        insightsHTML += `<div class="insight-section"><h5>Flashback to ${prevMonthKey}...</h5>`;
        fullNarrationText += `Flashback to ${prevMonthKey}. `;
        insightsHTML += tempPrevMonthHTML;
        fullNarrationText += tempPrevMonthNarration;
        insightsHTML += `</div>`;
    } else {
        // Optional: If you still want to mention that no data is available explicitly.
        // insightsHTML += `<div class="insight-section"><h5>Last Month (${prevMonthKey})</h5><p>I don't have enough activity from last month to give you a detailed review. Let's focus on the current one!</p></div>`;
        // fullNarrationText += `I don't have enough activity from last month to give you a detailed review. Let's focus on the current one! `;
        // Or simply omit the section if there's nothing to say, as implemented by the flag.
    }


    // --- Section 2: Current Month's Dynamic Tips (Ensure template literals are correct here too) ---
    insightsHTML += `<div class="insight-section"><h5>For ${currentMonthKey} right now...</h5>`;
    fullNarrationText += `For ${currentMonthKey} right now. `;
    let currentTipsList = [];
    const today = new Date(); //
    const dayOfMonth = today.getDate(); 

    if (currentMetrics.totalIncome === 0 && currentMetrics.totalSpentOverall > 0) {
        currentTipsList.push("I notice you've started logging expenses, but your income for this month isn't set. Setting it helps me give you much better advice!");
    } else if (currentMetrics.totalIncome > 0) {
        const spendPercentageOfIncome = (currentMetrics.totalSpentOverall / currentMetrics.totalIncome) * 100;
        // CORRECTED TEMPLATE LITERAL USAGE (Example, apply to all similar instances)
         if (dayOfMonth <= 7 && spendPercentageOfIncome < 20) {
             currentTipsList.push("It's the start of the month! You're off to a good start with your spending. Keep tracking!");
         } else if (dayOfMonth > 15 && dayOfMonth <= 22 && spendPercentageOfIncome > 65 && currentMetrics.savingsRate < 10) { 
             currentTipsList.push(`We're past mid-month and have used over ${spendPercentageOfIncome.toFixed(0)}% of your income. Let's be a bit more mindful with spending for the rest of the month to hit those saving goals!`);
         }
         if (currentMetrics.savings < 0) { 
             currentTipsList.push(`<strong>Alert!</strong> Your current spending of ${currencySymbol}${currentMetrics.totalSpentOverall.toFixed(2)} has exceeded your income of ${currencySymbol}${currentMetrics.totalIncome.toFixed(2)} by ${currencySymbol}${Math.abs(currentMetrics.savings).toFixed(2)}. Let's try to curb non-essential spending immediately.`);
         }
    }
    
    (currentMonthData.categories || []).forEach(fund => { // Added safeguard for categories
        if (fund.type === 'expense' && fund.deductionType === 'manual' && fund.initialBalance > 0) { 
            const balance = parseFloat(fund.balance) || 0; 
            const initialBalance = parseFloat(fund.initialBalance) || 0; 
            const remainingPercentage = initialBalance > 0 ? (balance / initialBalance) * 100 : 0; 
            // CORRECTED TEMPLATE LITERAL USAGE (Example, apply to all similar instances)
            if (remainingPercentage <= 10) { 
                currentTipsList.push(`Your fund "<strong>${fund.name}</strong>" is critically low at ${currencySymbol}${balance.toFixed(2)}. Try to avoid spending from this for now.`);
            } else if (remainingPercentage <= 35) { 
                currentTipsList.push(`Watch out! Your fund "<strong>${fund.name}</strong>" is running low, with ${currencySymbol}${balance.toFixed(2)} left.`);
            }
        }
        if (fund.deductionType === 'auto' && fund.dueDay && fund.emiAmount > 0) { 
            const dueDateThisMonth = new Date(currentMonthObj.getFullYear(), currentMonthObj.getMonth(), fund.dueDay); 
            const diffTime = dueDateThisMonth - today; 
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            // CORRECTED TEMPLATE LITERAL USAGE (Example, apply to all similar instances)
            if (diffDays >= 0 && diffDays <= 5) { 
                 currentTipsList.push(`Heads up! Your payment for "<strong>${fund.name}</strong>" (${currencySymbol}${fund.emiAmount.toFixed(2)}) is due ${diffDays === 0 ? 'today' : `in ${diffDays} day(s)`}.`); 
            }
        }
    });
    
    if (currentMetrics.topSpendingCategories && currentMetrics.topSpendingCategories.length > 0 && currentMetrics.totalIncome > 0) { 
        const topCat = currentMetrics.topSpendingCategories[0]; 
        if (topCat && (topCat.amount / currentMetrics.totalIncome) > 0.25) { 
            // CORRECTED TEMPLATE LITERAL USAGE
            currentTipsList.push(`Spending on "<strong>${topCat.name}</strong>" (${currencySymbol}${topCat.amount.toFixed(2)}) is one of your highest this month. Worth a quick review!`);
        }
    }

    if (currentTipsList.length === 0) {
        if (currentMetrics.totalIncome > 0 && currentMetrics.totalSpentOverall === 0) {
            insightsHTML += `<p>Looking good! No expenses logged yet for this month. A fresh start!</p>`;
            fullNarrationText += "Looking good! No expenses logged yet for this month. A fresh start! ";
        } else {
            insightsHTML += `<p>Everything seems balanced for now. Keep tracking your finances regularly!</p>`;
            fullNarrationText += "Everything seems balanced for now. Keep tracking your finances regularly! ";
        }
    } else {
        insightsHTML += `<ul>${currentTipsList.map(tip => `<li>${tip}</li>`).join('')}</ul>`;
        currentTipsList.forEach(tip => {
            const cleanTip = tip.replace(/<strong>|<\/strong>/g, ""); 
            fullNarrationText += cleanTip + " ";
        });
    }
    insightsHTML += `</div>`;

    // --- Section 3: Financial Rule Suggestion & Analysis (Ensure template literals are correct here too) ---
    insightsHTML += `<div class="insight-section"><h5>Choosing a Financial Guideline</h5>`;
    fullNarrationText += `Next, let's consider a financial guideline that might help you. `;

    if (currentMetrics.totalIncome > 0) {
        // Make sure suggestAndAnalyzeFinancialRule also uses correct template literals
        const ruleAnalysis = suggestAndAnalyzeFinancialRule(currentMetrics, currentMetrics.totalIncome, currencySymbol); 

        insightsHTML += `<div class="important-financial-rule">${ruleAnalysis.ruleExplanationHtml}</div>`;
        fullNarrationText += ruleAnalysis.ruleExplanationHtml.replace(/<[^>]*>/g, " ") + " "; 

        insightsHTML += ruleAnalysis.userBreakdownHTML;
        const breakdownForTTS = ruleAnalysis.userBreakdownHTML.replace(/<li>/g, ". ").replace(/<[^>]*>/g, " "); 
        fullNarrationText += "Your breakdown against this is: " + breakdownForTTS + " ";
        
        insightsHTML += `<div><h5>My Observations:</h5>${ruleAnalysis.ruleFeedbackHTML}</div>`;
        fullNarrationText += "My observations are: " + ruleAnalysis.ruleFeedbackHTML.replace(/<li>/g, ". ").replace(/<[^>]*>/g, " ") + " ";
        
        insightsHTML += `<p class="disclaimer">Remember, my categorization of your funds into Needs/Wants is an estimate. Review your spending against the suggested rule using your own judgment. You can also explore other common rules like the standard 50/30/20, 70/20/10, or 40/30/20/10 to see what fits your life best!</p>`;
        fullNarrationText += "Remember, my categorizations are estimates. Use your judgment and feel free to explore other rules too! ";

    } else {
        insightsHTML += "<p>Once you set your income and log some expenses, I can suggest a budgeting rule and show how your spending aligns with it.</p>";
        fullNarrationText += "Once you set your income and log expenses, I can suggest a budgeting rule for you. ";
    }
    insightsHTML += `</div>`;
    
    daikoInsightsContentEl.innerHTML = insightsHTML;

    if (isSpeakingEnabled && synth) { 
        speakText(fullNarrationText);
    }
}



function closeDaikoInsightsModal() {
    if (daikoInsightsModal) {
        daikoInsightsModal.classList.remove('active');
        if (synth && synth.speaking) {
            synth.cancel();
        }
    }
}

function toggleDaikoInsightSpeech() {
    const ttsButton = document.getElementById('toggleDaikoSpeakBtn');
    const ttsToggleChatbot = document.getElementById('ttsToggle'); // Your existing chatbot TTS toggle

    if (!synth) {
        showToast("Speech synthesis is not available on this browser.");
        if(ttsButton) ttsButton.innerHTML = '🔇'; // Show muted
        if(ttsButton) ttsButton.classList.add('muted');
        return;
    }

    isSpeakingEnabled = !isSpeakingEnabled; // Toggle the global flag

    if (isSpeakingEnabled) {
        if(ttsButton) ttsButton.innerHTML = '🔊'; // Speaker high volume icon
        if(ttsButton) ttsButton.classList.remove('muted');
        showToast("Daiko's voice enabled.");
        // If there's content in the modal and it wasn't speaking, you might want to make it speak the current content.
        // This depends on how `populateDaikoInsights` handles `isSpeakingEnabled`.
    } else {
        if(ttsButton) ttsButton.innerHTML = '🔇'; // Mute icon
        if(ttsButton) ttsButton.classList.add('muted');
        if (synth.speaking) {
            synth.cancel(); // Stop any current speech
        }
        showToast("Daiko's voice muted.");
    }

    // Sync with the chatbot's TTS toggle if you want them linked
    if (ttsToggleChatbot) {
        ttsToggleChatbot.checked = isSpeakingEnabled;
    }

    // Save the preference if you store isSpeakingEnabled in appSettings
    // For example:
    // appSettings.isTTSEnabled = isSpeakingEnabled;
    // saveAppSettings(); 
    // Note: Your current appSettings doesn't seem to store this, but your chatbot
    // ttsToggle checkbox implies a state. This function toggles the global isSpeakingEnabled.
}


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
         let walletFund = monthlyData[monthYear].categories.find(cat => cat.name === 'Wallet' && cat.isDefaultWallet);
    if (!walletFund) {
        walletFund = {
            id: 'default_wallet_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9), // Unique ID
            name: 'Wallet',
            initialBalance: monthlyData[monthYear].income, // Initialized with current income
            balance: monthlyData[monthYear].income,      // Balance also reflects this
            spent: 0,
            type: 'expense',
            deductionType: 'manual',
            isDefaultWallet: true, // Custom flag to identify this special fund
            isDeletable: false,    // Make it non-deletable
            isEditable: false      // Restrict certain edits (like name/type)
        };
        monthlyData[monthYear].categories.unshift(walletFund); // Add to the beginning
    } else {
        // If income changes, wallet's reference to it might need an update IF it's the only source
        // This logic will be handled more robustly in setMonthlyIncome and fund creation/deletion
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

// saveAppSettings function :
// Modify the existing saveAppSettings function
async function saveAppSettings() {
  // Always save the full appSettings (including budgetMode) to localStorage
  saveLocalAppSettings();

  // Only sync specific shared settings to Firestore if in shared mode and logged in
  if (appSettings.budgetMode === 'shared' && currentUser) {
    console.log("Shared mode & logged in. Attempting to save shareable appSettings to Firestore...");
    const sharedSettingsToSync = {
        currency: appSettings.currency,
        defaultPaymentApp: appSettings.defaultPaymentApp
        // Do NOT include appSettings.budgetMode or appSettings.notifications here for Firestore sync
    };

    try {
      await db.collection('budgets').doc('sharedFamilyBudget').set({
        appSettings: sharedSettingsToSync
      }, { merge: true });
      console.log('Shareable appSettings successfully synced to Firestore!');
    } catch (error) {
      console.error("Error syncing shareable appSettings to Firestore: ", error);
      showToast('Error syncing shared settings to cloud.');
      // Local save already done by saveLocalAppSettings()
    }
  } else {
    console.log("Not syncing appSettings to Firestore (either individual mode or not logged in).");
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



// Replace your existing handleLogoutAttempt function
async function handleLogoutAttempt() {
    try {
        if (appSettings.budgetMode === 'shared' && pendingSwitchToIndividualMode) {
            // User was in shared mode, selected individual, and is now logging out.
            // Prompt to copy data BEFORE actual Firebase sign-out.

            // Capture current in-memory data (which is from Firestore)
            const currentSharedMonthlyData = JSON.parse(JSON.stringify(monthlyData));
            const currentSharedAppSettingsForCopy = JSON.parse(JSON.stringify(appSettings));

            const confirmedCopy = await showConfirm(
                "You are logging out to switch to Individual Planner mode.\n\nDo you want to copy your current Shared Budget data for local, offline use?\n\n- 'OK' will overwrite your local data with this shared data.\n- 'Cancel' will use your previous local data (if any) after logout.",
                "Copy Shared Data Locally Before Logout?"
            );

            if (confirmedCopy) {
                showToast("Copying shared data for local use...");
                localStorage.setItem('monthlyData', JSON.stringify(currentSharedMonthlyData));
                const localSettingsToSave = {
                    ...currentSharedAppSettingsForCopy, // currency, defaultPaymentApp from shared
                    notifications: appSettings.notifications, // Preserve existing local notifications
                    budgetMode: 'individual' // Set the new mode
                };
                localStorage.setItem('appSettings', JSON.stringify(localSettingsToSave));
                showToast("Shared data copied for local use.");
            } else {
                showToast("Shared data not copied. Previous local data will be used.");
            }

            // Set the app to individual mode definitively before logging out of Firebase
            appSettings.budgetMode = 'individual';
            saveLocalAppSettings(); // Save this mode to localStorage
            pendingSwitchToIndividualMode = false; // Reset the flag
        }
        // For any other logout scenario, or after handling the pending switch, proceed to sign out.
        showToast('Logging out...');
        await auth.signOut();
        // onAuthStateChanged will handle UI updates and loading local data.
        // No need for showToast('Logout successful.') here, onAuthStateChanged will provide feedback.
    } catch (error) {
        console.error("Logout Error:", error);
        showAlert(`Logout failed: ${error.message}`);
        // Reset flags if logout fails mid-switch to prevent inconsistent state
        isSwitchingMode = false; 
        // pendingSwitchToIndividualMode might need careful handling if signOut fails
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

   
function updateAuthUIVisibility() {
    const authFormContainer = document.getElementById('authFormContainer');
    const logoutButton = document.getElementById('logoutButton');
    const authRelatedHeadingsAndProfile = document.querySelector('#settings-section .settings-group h5:first-of-type'); // Assuming "User Authentication & Profile"
    // Or more specifically target elements you want to hide if User Auth heading is separate
    // const userAuthHeading = document.getElementById('userAuthSpecificHeading'); // If you add such an ID

    if (appSettings.budgetMode === 'individual') {
        if (authFormContainer) authFormContainer.style.display = 'none';
        if (logoutButton) logoutButton.style.display = 'none';
        // Optionally hide the whole "User Authentication" section or just login parts
        // if (userAuthHeading) userAuthHeading.style.display = 'none';
        if (authStatusDisplay) authStatusDisplay.textContent = 'Using Individual Offline Mode';

    } else { // Shared mode
        // if (userAuthHeading) userAuthHeading.style.display = 'block';
        if (currentUser) {
            if (authFormContainer) authFormContainer.style.display = 'none';
            if (logoutButton) logoutButton.style.display = 'block';
            if (authStatusDisplay) authStatusDisplay.textContent = `Shared Mode: Logged in as ${currentUser.email}`;
        } else {
            if (authFormContainer) authFormContainer.style.display = 'block';
            if (logoutButton) logoutButton.style.display = 'none';
            if (authStatusDisplay) authStatusDisplay.textContent = 'Shared Mode: Not logged in';
        }
    }
}


     function saveLocalAppSettings() {
    localStorage.setItem('appSettings', JSON.stringify(appSettings));
    console.log("App settings (including mode) saved to localStorage.");
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

//render function
function render() {
    // These save functions will now use appSettings.budgetMode and currentUser
    // to determine if they save to localStorage or Firestore.
    saveData();
    saveUserProfile(); // This still saves to localStorage as per our previous decisions
    saveAppSettings(); // This saves appSettings.budgetMode to localStorage and shared settings to Firestore if applicable

    const currentMonthData = getCurrentMonthData(); // From main monthlyData
    // If you were implementing personal funds, you'd also get personalCurrentMonthData here.
    // For now, we assume 'categories' and 'history' come from the main (potentially synced) monthlyData.
    const categories = currentMonthData.categories || [];
    const history = currentMonthData.history || [];
    const monthlyIncome = currentMonthData.income || 0;

    const currentCurrencySymbol = currencySymbols[appSettings.currency] || '₹'; // Fallback currency
    
    // Update currency symbols throughout the UI
    document.getElementById('currencySymbolTotalBalance').textContent = currentCurrencySymbol;
    document.getElementById('currencySymbolMonthlyIncome').textContent = currentCurrencySymbol;
    document.getElementById('currencySymbolTotalExpenses').textContent = currentCurrencySymbol;
    const logTransactionBtnIcon = document.getElementById('logTransactionBtnIcon');
    if (logTransactionBtnIcon) logTransactionBtnIcon.textContent = currentCurrencySymbol;

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

    if (defaultPaymentAppNameSpan) defaultPaymentAppNameSpan.textContent = appSettings.defaultPaymentApp;

    // Clear existing fund displays and select options
    if (loanEmiFundsDiv) loanEmiFundsDiv.innerHTML = '';
    if (dailyExpenseFundsDiv) dailyExpenseFundsDiv.innerHTML = '';
    if (investmentFundsDiv) investmentFundsDiv.innerHTML = '';
    if (paySelect) paySelect.innerHTML = '';
    if (transferFromSelect) transferFromSelect.innerHTML = '';
    if (transferToSelect) transferToSelect.innerHTML = '';

    // --- MODIFIED HISTORY TABLE POPULATION ---
    const historyTableBody = document.querySelector('#historyTable tbody');
    if (historyTableBody) {
        historyTableBody.innerHTML = ''; // Clear previous rows
        history.forEach(h => {
            const row = historyTableBody.insertRow();
            const cellDate = row.insertCell();
            const cellDesc = row.insertCell(); // This will display the concise fund name/activity
            const cellAmount = row.insertCell();
            const cellType = row.insertCell();

            cellDate.textContent = new Date(h.timestamp).toLocaleDateString();

            let descriptionContent = '';
            switch (h.type) {
                case 'fund_creation':
                case 'personal_fund_creation':
                case 'fund_deletion':
                    descriptionContent = h.fundName || 'N/A';
                    break;
                case 'expense_cash':
                case 'expense_scan_pay':
                case 'expense_pay_via_app':
                    descriptionContent = h.fundName || 'N/A';
                    break;
                case 'transfer':
                    descriptionContent = h.fromFund && h.toFund ? `${h.fromFund} → ${h.toFund}` : 'Transfer';
                    break;
                case 'fund_edit':
                    descriptionContent = h.fundNameBeforeEdit || (h.changedProperties && h.changedProperties.name ? h.changedProperties.name.to : 'Fund Edited');
                    break;
                case 'emi_deduction_processed':
                    if (h.details && h.details.length === 1) {
                        const detailParts = h.details[0].split(':');
                        descriptionContent = detailParts[0].trim();
                    } else if (h.details && h.details.length > 1) {
                        descriptionContent = 'Multiple EMIs';
                    } else {
                        descriptionContent = 'EMI Processed';
                    }
                    break;
                case 'income_set':
                    descriptionContent = 'Income Update';
                    break;
                case 'funds_auto_imported':
                case 'funds_copied':
                    descriptionContent = `Funds from ${h.fromMonth || 'Previous Month'}`;
                    break;
                case 'revert_action':
                    if (h.description && h.description.toLowerCase().includes("from ")) {
                        const parts = h.description.split("from ");
                        if (parts.length > 1) {
                            const fundPart = parts[1].split('.')[0].trim().replace(/'/g, "");
                            descriptionContent = `Revert: ${fundPart}`;
                        } else {
                            descriptionContent = 'Transaction Reverted';
                        }
                    } else if (h.description && h.description.toLowerCase().includes("income set")) {
                         descriptionContent = 'Revert: Income Set';
                    } else {
                        descriptionContent = 'Transaction Reverted';
                    }
                    break;
                default:
                    descriptionContent = h.fundName || (h.type ? h.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A');
            }
            cellDesc.textContent = descriptionContent;

            cellAmount.textContent = h.amount ? `${currentCurrencySymbol}${h.amount.toFixed(2)}` : '-';
            
            let displayType = h.type ? h.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A';
            if (h.type && (h.type.startsWith('expense_') || h.type === 'emi_deduction_processed')) {
                displayType = 'Expense';
            } else if (h.type === 'fund_creation' || h.type === 'personal_fund_creation' || h.type === 'fund_edit' || h.type === 'fund_deletion' || h.type === 'funds_auto_imported' || h.type === 'funds_copied') {
                displayType = 'Fund Action';
            } else if (h.type === 'income_set') {
                displayType = 'Income';
            } else if (h.type === 'transfer') {
                displayType = 'Transfer';
            } else if (h.type === 'revert_action') {
                displayType = 'Correction';
            }
            cellType.textContent = displayType;
        });
    }

    // --- END OF MODIFIED HISTORY TABLE POPULATION ---

    const loanEmiCategories = categories.filter(cat => cat.deductionType === 'auto' && cat.type === 'expense');
    const dailyExpenseCategories = categories.filter(cat => cat.deductionType === 'manual' && cat.type === 'expense');
    const investmentCategories = categories.filter(cat => cat.type === 'investment');

    const prevMonthStr = getPreviousMonthYearString(currentMonth);
    const prevMonthDataExists = monthlyData[prevMonthStr] && monthlyData[prevMonthStr].categories && monthlyData[prevMonthStr].categories.length > 0;
    if (copyFundsBtn) { // Check if element exists
        copyFundsBtn.style.display = (categories.length === 0 && prevMonthDataExists) ? 'block' : 'none';
    }

    // This function needs to be defined within render or accessible to it.
    // It was previously nested, which is fine.
    function applyWarningBorder(fundTablet, fund) {
        if (fund.deductionType === 'manual' && fund.initialBalance > 0 && fund.type === 'expense') { // Only for manual expense funds
            const remainingPercentage = (fund.balance / fund.initialBalance) * 100;
            fundTablet.classList.remove('warning-orange', 'warning-red'); // Clear previous warnings
            if (remainingPercentage <= 10) {
                fundTablet.classList.add('warning-red');
            } else if (remainingPercentage <= 50) {
                fundTablet.classList.add('warning-orange');
            }
        } else {
            fundTablet.classList.remove('warning-orange', 'warning-red');
        }
    }

    const renderFundAsTablet = (fund, originalIndex) => { // Use originalIndex from main categories array
        const fundTablet = document.createElement('div');
        fundTablet.className = 'fund-tablet';
        
        // fundTablet.dataset.fundIndex = originalIndex; // Using originalIndex for consistency if edit uses it
        fundTablet.onclick = () => openEditFundModal(originalIndex); // Pass original index

        const dueDayText = (fund.deductionType === 'auto' && fund.dueDay)
                        ? `<div class="fund-due-day">Due: ${formatDueDate(fund.dueDay, currentMonth)}</div>`
                        : '';
        
        let amountDisplay;
        let bottomText = '';

        if (fund.type === 'investment' && fund.deductionType === 'auto') {
            amountDisplay = `${currentCurrencySymbol}${fund.emiAmount ? fund.emiAmount.toFixed(2) : '0.00'}`;
            bottomText = `Auto-Invested`;
        } else if (fund.type === 'investment' && fund.deductionType === 'manual') {
            amountDisplay = `${currentCurrencySymbol}${fund.balance ? fund.balance.toFixed(2) : '0.00'}`;
            bottomText = `Invested: ${currentCurrencySymbol}${fund.spent ? fund.spent.toFixed(2) : '0.00'}`;
        } else if (fund.type === 'expense' && fund.deductionType === 'auto') {
            amountDisplay = `${currentCurrencySymbol}${fund.emiAmount ? fund.emiAmount.toFixed(2) : '0.00'}`;
            bottomText = `Auto-Deduct`;
        } else { // Manual Expense or Personal Expense (if displayed here)
            amountDisplay = `${currentCurrencySymbol}${fund.balance ? fund.balance.toFixed(2) : '0.00'}`;
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

    if (loanEmiFundsDiv) {
        if (loanEmiCategories.length > 0) {
            loanEmiCategories.forEach((cat) => {
                const actualIndex = categories.findIndex(f => f.id === cat.id || (!f.id && !cat.id && f.name === cat.name)); // Match by ID or fallback to name
                if (actualIndex !== -1) loanEmiFundsDiv.appendChild(renderFundAsTablet(cat, actualIndex));
            });
        } else {
            loanEmiFundsDiv.innerHTML = '<p style="text-align: center; font-size: 0.9em; color: var(--text-color); grid-column: 1 / -1;">No Loan & EMI funds created.</p>';
        }
    }

    if (dailyExpenseFundsDiv) {
        if (dailyExpenseCategories.length > 0) {
            dailyExpenseCategories.forEach((cat) => {
                const actualIndex = categories.findIndex(f => f.id === cat.id || (!f.id && !cat.id && f.name === cat.name)); // Match by ID or fallback to name
                if (actualIndex !== -1) dailyExpenseFundsDiv.appendChild(renderFundAsTablet(cat, actualIndex));
            });
        } else {
            dailyExpenseFundsDiv.innerHTML = '<p style="text-align: center; font-size: 0.9em; color: var(--text-color); grid-column: 1 / -1;">No Daily Expense funds created.</p>';
        }
    }

    if (investmentFundsDiv) {
        if (investmentCategories.length > 0) {
            investmentCategories.forEach((cat) => {
                const actualIndex = categories.findIndex(f => f.id === cat.id || (!f.id && !cat.id && f.name === cat.name)); // Match by ID or fallback to name
                if (actualIndex !== -1) investmentFundsDiv.appendChild(renderFundAsTablet(cat, actualIndex));
            });
        } else {
            investmentFundsDiv.innerHTML = '<p style="text-align: center; font-size: 0.9em; color: var(--text-color); grid-column: 1 / -1;">No Investment funds created.</p>';
        }
    }
    
    // Populate dropdowns
if (paySelect) { // Ensure paySelect exists
        // It's good practice to clear the select box before populating
        paySelect.innerHTML = ''; 

        categories.forEach((cat, index) => {
            // Condition to include manual expense and manual investment funds
            if (
                (cat.type === 'expense' && cat.deductionType === 'manual') || 
                (cat.type === 'investment' && cat.deductionType === 'manual')
            ) {
                // Check if the current category is 'Wallet' to make it the default
                const isSelected = cat.name === 'Wallet' ? 'selected' : '';
                
                paySelect.innerHTML += `<option value='${index}' ${isSelected}>${cat.name} (${currentCurrencySymbol}${cat.balance.toFixed(2)})</option>`;
            }
        });
    }
    
    if (transferFromSelect && transferToSelect) { // Ensure these selects exist
        categories.forEach((cat, index) => {
            // Current logic for transfers (expenses only, no auto-deduct, no personal) is likely fine
            if (cat.type === 'expense' && cat.deductionType === 'manual' && !cat.isPersonal) { 
                transferFromSelect.innerHTML += `<option value='${index}'>${cat.name} (${currentCurrencySymbol}${cat.balance.toFixed(2)})</option>`;
                transferToSelect.innerHTML += `<option value='${index}'>${cat.name} (${currentCurrencySymbol}${cat.balance.toFixed(2)})</option>`;
            }
        });
    }

    const totalSpent = categories.reduce((sum, cat) => sum + (cat.spent || 0), 0);
    if (displayTotalExpensesSpan) displayTotalExpensesSpan.textContent = totalSpent.toFixed(2);
    if (totalBalanceSpan) totalBalanceSpan.textContent = (monthlyIncome - totalSpent).toFixed(2);

    let totalManualExpenses = 0;
    let totalAutoDeductExpenses = 0;
    let totalInvestments = 0;

    categories.forEach(cat => {
        if (cat.isPersonal) return; // Exclude personal funds from these shared summaries
        if (cat.type === 'expense') {
            if (cat.deductionType === 'auto') {
                totalAutoDeductExpenses += (cat.spent || 0);
            } else {
                totalManualExpenses += (cat.spent || 0);
            }
        } else if (cat.type === 'investment') {
            totalInvestments += (cat.spent || 0);
        }
    });

    if (expenseSummaryTextDiv) {
        expenseSummaryTextDiv.innerHTML = `
            <p>Total Manual Expenses: <strong>${currentCurrencySymbol}${totalManualExpenses.toFixed(2)}</strong></p>
            <p>Total Auto-Deduct (EMI/Loan) Expenses: <strong>${currentCurrencySymbol}${totalAutoDeductExpenses.toFixed(2)}</strong></p>
            <p>Total Investments: <strong>${currentCurrencySymbol}${totalInvestments.toFixed(2)}</strong></p>
            <p>Overall Total Budgeted Spending: <strong>${currentCurrencySymbol}${totalSpent.toFixed(2)}</strong></p>
        `;
    }

    // Filter out personal funds before sending to pie chart if it's meant for shared view
    const categoriesForPieChart = categories.filter(cat => !cat.isPersonal);
    renderPieChart(categoriesForPieChart); 
    renderDashboardGauges(); // This also uses the main 'categories' which might include personal ones if not filtered.
                             // Consider if gauges should reflect personal spending or only shared. Assuming shared for now.
    checkAndAddNotifications(); // This might need adjustment if notifications are based on personal funds too.
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
        
         const oldIncome = currentMonthData.income;
    currentMonthData.income = income;

    // Update Wallet fund
    let walletFund = currentMonthData.categories.find(cat => cat.isDefaultWallet);
    if (walletFund) {
        // Calculate total allocated to other funds
        const totalAllocatedToOtherFunds = currentMonthData.categories
            .filter(cat => !cat.isDefaultWallet)
            .reduce((sum, cat) => sum + cat.initialBalance, 0);

        walletFund.initialBalance = income; // Wallet's initial capacity is the income
        walletFund.balance = income - totalAllocatedToOtherFunds - walletFund.spent; // Current usable balance
    }

    addToHistory({
        type: 'income_set',
        amount: income,
        oldAmount: oldIncome,
        description: `Monthly income set/updated to <span class="math-inline">\{currentCurrencySymbol\}</span>{income.toFixed(2)}`
    });
    showToast(`Monthly income updated to <span class="math-inline">\{currentCurrencySymbol\}</span>{income.toFixed(2)}`);
    if (incomeFromBot === null) incomeInput.value = income.toFixed(2);

    render();





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
    const name = fundDetailsFromBot ? fundDetailsFromBot.name : document.getElementById('modalNewFundName').value.trim();
    const amount = fundDetailsFromBot ? fundDetailsFromBot.amount : parseFloat(document.getElementById('modalNewFundAmount').value);
    const fundType = fundDetailsFromBot ? fundDetailsFromBot.type : document.querySelector('input[name="modalFundType"]:checked').value;

    let deductionType = 'manual'; // Default, especially for personal_expense
    let dueDay = null;
    
    // Income check and auto-deduct details are only relevant for non-personal funds
    if (fundType !== 'personal_expense') {
        const mainCurrentMonthData = getCurrentMonthData(); // For checking income
        if (mainCurrentMonthData.income <= 0 && !fundDetailsFromBot) {
            await showAlert('Please set your monthly income first before creating a shared/investment fund.', 'Set Income Required');
            highlightElement('monthlyIncomeInput', 4000);
            const monthlyIncomeInputEl = document.getElementById('monthlyIncomeInput');
            if (monthlyIncomeInputEl) {
                monthlyIncomeInputEl.focus();
                const parentCard = monthlyIncomeInputEl.closest('.card');
                if (parentCard) parentCard.style.display = 'block';
            }
            closeCreateFundModal();
            return false;
        }

        // Get deductionType and dueDay only if not a personal expense
        deductionType = fundDetailsFromBot ? fundDetailsFromBot.deductionType : (document.getElementById('modalIsAutoDeduct').checked ? 'auto' : 'manual');
        if (!fundDetailsFromBot && deductionType === 'auto') {
            const dueDayInput = document.getElementById('modalNewFundDueDay');
            const dueDayValue = parseInt(dueDayInput.value);
            if (dueDayInput.value && (isNaN(dueDayValue) || dueDayValue < 1 || dueDayValue > 31)) {
                await showAlert('Please enter a valid Due Day (1-31) or leave it blank for auto-deductible funds.');
                return false;
            }
            if (dueDayInput.value) dueDay = dueDayValue;
        }
    } else {
        // Personal expenses are always 'manual' and have no 'dueDay' in this design
        deductionType = 'manual';
        dueDay = null;
    }

    const currentCurrencySymbol = currencySymbols[appSettings.currency];

    if (!name || isNaN(amount) || amount < 0) {
        if (!fundDetailsFromBot) await showAlert('Please enter a valid fund name and a non-negative initial amount.');
        return false;
    }

    // Auto-deduct amount must be positive (only applies to non-personal funds)
    if (fundType !== 'personal_expense' && deductionType === 'auto' && amount <= 0) {
        if (!fundDetailsFromBot) await showAlert('For auto-deductible funds, the amount must be a positive value.');
        return false;
    }

    // --- Generate Unique ID for the new fund ---
    const newFundId = 'fund_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

    let newFund = {
        id: newFundId, // Unique ID
        name,
        initialBalance: amount,
        type: fundType,
        deductionType: deductionType,
        emiAmount: 0,
        balance: amount,
        spent: 0,
        dueDay: (fundType !== 'personal_expense' && deductionType === 'auto') ? dueDay : null,
        isPersonal: fundType === 'personal_expense' // Flag to identify personal funds
    };
    
    if (!newFund.isDefaultWallet && newFund.initialBalance > 0) {
    const mainCurrentMonthData = getCurrentMonthData(); // Ensure current month data is fresh
    let walletFund = mainCurrentMonthData.categories.find(cat => cat.isDefaultWallet);
    if (walletFund) {
        if (walletFund.balance >= newFund.initialBalance) {
            walletFund.balance -= newFund.initialBalance;
            // Optionally, log this internal "transfer" or adjustment to Wallet's history or a specific log
            addToHistory({
                type: 'wallet_adjustment_create_fund',
                amount: newFund.initialBalance,
                fundName: newFund.name,
                description: `Allocated <span class="math-inline">\{currentCurrencySymbol\}</span>{newFund.initialBalance.toFixed(2)} from Wallet to ${newFund.name}.`
            });
        } else {
            if (!fundDetailsFromBot) await showAlert(`Insufficient balance in Wallet to create fund '${newFund.name}' with amount <span class="math-inline">\{currentCurrencySymbol\}</span>{newFund.initialBalance.toFixed(2)}. Wallet balance: <span class="math-inline">\{currentCurrencySymbol\}</span>{walletFund.balance.toFixed(2)}`);
            return false; // Prevent fund creation
        }
    } else {
        // This case should ideally not happen if getCurrentMonthData initializes Wallet
        if (!fundDetailsFromBot) await showAlert('Error: Default Wallet fund not found. Cannot allocate funds.');
        return false;
    }
}



    if (fundType !== 'personal_expense' && deductionType === 'auto') {
        newFund.emiAmount = amount;
        // For auto-deduct, balance might reflect post-deduction if it's immediate,
        // or initialBalance IS the EMI and balance starts effectively reduced.
        // Let's assume for auto-deduct, 'initialBalance' is the EMI value, 'spent' is the EMI, 'balance' is 0 or reflects remaining if it was a top-up.
        // For simplicity, let's consider 'initialBalance' as the total allocated/EMI amount, and 'spent' as the deducted amount.
        newFund.balance = newFund.initialBalance - newFund.emiAmount; // Or 0 if it's purely an EMI bucket
        newFund.spent = newFund.emiAmount;
    } else if (fundType === 'investment' && deductionType === 'manual') { // Manual Investment
        newFund.spent = amount; // Assume initial amount is "spent" into investment
        // newFund.balance remains initialBalance or could be 0 if it's purely tracking outflow.
        // For consistency with expense funds where balance means "remaining usable", let's set balance for manual investment.
        // If you want investment 'balance' to mean 'current value', that's a different concept.
        // For now, let's assume 'balance' is similar to expense funds.
    }
    // For manual expense and personal_expense, initialBalance = balance, spent = 0 initially.

    let targetCategoriesArray;
    let targetHistoryArray;
    let historyTransactionType;
    let saveTargetDataFunction;

    if (newFund.isPersonal) {
        const currentPersonalMonth = getCurrentPersonalMonthData();
        targetCategoriesArray = currentPersonalMonth.categories;
        targetHistoryArray = currentPersonalMonth.history;
        historyTransactionType = 'personal_fund_creation';
        saveTargetDataFunction = savePersonalData; // Save to localStorage for personal data

        // Check for existing personal fund with the same name
        const existingPersonalFund = targetCategoriesArray.find(cat => cat.name.toLowerCase() === name.toLowerCase());
        if (existingPersonalFund) {
            if (!fundDetailsFromBot) await showAlert(`A personal fund with the name '${name}' already exists. Please choose a different name.`);
            return false;
        }
    } else {
        const mainCurrentMonthData = getCurrentMonthData();
        targetCategoriesArray = mainCurrentMonthData.categories;
        targetHistoryArray = mainCurrentMonthData.history; // Main history is handled by global addToHistory
        historyTransactionType = 'fund_creation';
        saveTargetDataFunction = saveData; // Main saveData handles localStorage/Firestore based on mode

        // Check for existing shared/individual (non-personal) fund
        const existingMainFund = targetCategoriesArray.find(cat => cat.name.toLowerCase() === name.toLowerCase());
        if (existingMainFund) {
            if (!fundDetailsFromBot) await showAlert(`A fund with the name '${name}' already exists for shared/individual budgets. Please choose a different name.`);
            return false;
        }
    }

    targetCategoriesArray.push(newFund);
    
    let historyDescription = `Created new ${newFund.isPersonal ? 'personal ' : ''}${fundType.replace('_', ' ')} fund '${name}' with ${currentCurrencySymbol}${amount.toFixed(2)}`;
    if (!newFund.isPersonal && deductionType === 'auto') {
        historyDescription += ` (Auto-Deduct EMI: ${currentCurrencySymbol}${newFund.emiAmount.toFixed(2)})`;
        if (newFund.dueDay) historyDescription += `, Due: ${formatDueDate(newFund.dueDay, currentMonth)}`;
    }

    const historyEntry = {
        timestamp: new Date().toISOString(),
        type: historyTransactionType,
        fundName: name,
        amount: amount,
        fundType: fundType,
        deductionType: deductionType,
        dueDay: newFund.dueDay,
        description: historyDescription,
        fundId: newFund.id // Store fund ID in history for better tracking
    };

    if (newFund.isPersonal) {
        targetHistoryArray.unshift(historyEntry); // Add to personal history
        savePersonalData(); // Save personal data to localStorage
    } else {
        addToHistory(historyEntry); // Adds to main monthlyData.history
        // saveData() for main data will be called by render()
    }
    
    showToast(`Fund '${name}' created!`);

    if (!fundDetailsFromBot) {
        document.getElementById('modalNewFundName').value = '';
        document.getElementById('modalNewFundAmount').value = '';
        const modalDueDayInput = document.getElementById('modalNewFundDueDay');
        if (modalDueDayInput) modalDueDayInput.value = '';
        const expenseRadio = document.querySelector('input[name="modalFundType"][value="expense"]');
        if (expenseRadio) expenseRadio.checked = true;
        const autoDeductCheckbox = document.getElementById('modalIsAutoDeduct');
        if (autoDeductCheckbox) autoDeductCheckbox.checked = false;
        
        toggleModalAutoDeductOptions(); // Call this to reset UI based on default "expense" type
        closeCreateFundModal();
    }
    
    render(); // This will also call saveData() for the main monthlyData

    // Tutorial logic
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
    const currentMonthData = getCurrentMonthData(); // Ensures 'Wallet' fund exists if needed
    const fundNameToDelete = document.getElementById('editingFundNameOriginal').value; // Get the original name

    const fundIndexToDelete = currentMonthData.categories.findIndex(cat => cat.name === fundNameToDelete);

    if (fundIndexToDelete === -1) {
        await showAlert(`Error: Could not find fund '${fundNameToDelete}' to delete. It might have been renamed or already deleted. Please refresh or check.`, "Delete Error");
        closeEditFundModal(); // Close the modal as the context is lost
        return;
    }

    const fundToDelete = currentMonthData.categories[fundIndexToDelete];

    // Prevent deletion of the default 'Wallet' fund
    if (fundToDelete.isDefaultWallet) {
        await showAlert("The 'Wallet' fund cannot be deleted.", "Action Not Allowed");
        return;
    }

    const currentCurrencySymbol = currencySymbols[appSettings.currency];
    const confirmed = await showConfirm(
        `Are you sure you want to delete the fund '${fundToDelete.name}'? Its current balance of ${currentCurrencySymbol}${fundToDelete.balance.toFixed(2)} will be returned to your Wallet. This action cannot be undone.`,
        'Confirm Delete Fund'
    );

    if (confirmed) {
        // Amount to return to the wallet. This is typically the remaining balance.
        const amountToReturn = fundToDelete.balance;

        // Remove the fund from the categories array
        currentMonthData.categories.splice(fundIndexToDelete, 1);

        // Add the amount back to the Wallet fund
        let walletFund = currentMonthData.categories.find(cat => cat.isDefaultWallet);
        if (walletFund) {
            walletFund.balance += amountToReturn;
            addToHistory({
                type: 'wallet_adjustment_delete_fund',
                amount: amountToReturn,
                fundName: fundToDelete.name, // Name of the fund that was deleted
                description: `Returned ${currentCurrencySymbol}${amountToReturn.toFixed(2)} to Wallet from deleted fund '${fundToDelete.name}'.`
            });
        } else {
            // This should ideally not happen if getCurrentMonthData ensures Wallet exists
            console.error("Default Wallet fund not found when trying to return balance.");
            await showAlert("Error: Default Wallet not found. Balance could not be returned automatically.", "Wallet Error");
        }

        // Add to history for the fund deletion itself
        addToHistory({
            type: 'fund_deletion',
            fundName: fundToDelete.name, // Log the name of the deleted fund
            initialBalance: fundToDelete.initialBalance,
            fundType: fundToDelete.type,
            deductionType: fundToDelete.deductionType,
            emiAmount: fundToDelete.emiAmount,
            balanceAtDeletion: fundToDelete.balance, // Log balance at time of deletion
            spentAtDeletion: fundToDelete.spent,     // Log spent amount at time of deletion
            dueDay: fundToDelete.dueDay,
            returnedToWallet: amountToReturn, // Explicitly log amount returned
            description: `Deleted fund '${fundToDelete.name}'. Returned ${currentCurrencySymbol}${amountToReturn.toFixed(2)} to Wallet.`
        });

        showToast(`Fund '${fundToDelete.name}' deleted and balance returned to Wallet.`);
        closeEditFundModal();
        render(); // Update the UI
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
    if (!fundToPayFrom) {
        await showAlert(`Fund '${fundName}' not found.`);
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
                case 'expense_pay_via_app': // <<< FIX: Add this line
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

// Place this with your other event handling functions

let isSwitchingMode = false; // Flag to prevent re-entrant calls

// Replace your existing handleModeChangeAttempt function
async function handleModeChangeAttempt(newMode) {
    if (isSwitchingMode) {
        console.log("Mode switch already in progress.");
        const oldModeRadio = document.querySelector(`input[name="budgetModeOption"][value="${appSettings.budgetMode}"]`);
        if (oldModeRadio) oldModeRadio.checked = true;
        return;
    }
    isSwitchingMode = true;

    const oldMode = appSettings.budgetMode;
    console.log(`Attempting to switch mode from ${oldMode} to ${newMode}`);

    if (newMode === oldMode) {
        isSwitchingMode = false;
        return; // No change
    }

    const inMemoryMonthlyDataBeforeSwitch = JSON.parse(JSON.stringify(monthlyData));
    const inMemoryAppSettingsBeforeSwitch = JSON.parse(JSON.stringify(appSettings));

    if (newMode === 'individual' && oldMode === 'shared') {
        // User is in Shared mode and selected Individual mode
        if (currentUser) { // Only if currently logged in to shared mode
            pendingSwitchToIndividualMode = true; // Set flag
            await showAlert("To switch to Individual Planner mode, please log out. You will be asked if you want to copy your current shared data for local use during the logout process.", "Logout Required");
            // Revert the radio button UI to 'shared' as the mode change is deferred
            const sharedModeRadio = document.querySelector(`input[name="budgetModeOption"][value="shared"]`);
            if (sharedModeRadio) sharedModeRadio.checked = true;
            isSwitchingMode = false;
            return; // Actual switch will happen on logout
        } else {
            // Was in shared mode but not logged in (unusual, but handle gracefully)
            // Simply switch to individual mode and load local data.
            appSettings.budgetMode = 'individual';
            // Fall through to common logic at the end.
        }
    } else if (newMode === 'shared' && oldMode === 'individual') {
        // Switching from Individual (localStorage) to Shared (Firestore)
        // This part remains the same as before, with the pendingLocalDataUpload flag.
        appSettings.budgetMode = 'shared'; 
        saveLocalAppSettings();         
        pendingLocalDataUpload = true;  

        console.log("Switched to Shared mode. Pending local data upload decision after login.");

        if (!currentUser) { 
            await showAlert("You've switched to Shared Planner mode. Please log in or sign up. After logging in, you'll be asked if you want to upload your existing local data.");
        } else {
            console.log("User already logged in to Firebase. Upload prompt will appear if needed.");
            await processPendingUploadIfNeeded(currentUser); 
            if (budgetListenerUnsubscribe) { budgetListenerUnsubscribe(); budgetListenerUnsubscribe = null; }
            setupFirestoreListenerForUser(currentUser);
        }
    } else { 
        // Handles direct switch if not from shared-logged-in to individual,
        // or if already in the target mode (though initial check should catch this).
        appSettings.budgetMode = newMode;
    }

    // Common actions after attempting a mode change (unless returned early)
    saveLocalAppSettings(); // Save the potentially new appSettings.budgetMode to localStorage
    updateAuthUIVisibility();

    if (appSettings.budgetMode === 'individual') {
        // This block now runs if switching from shared (but not logged in) to individual,
        // or if switched from something else directly to individual.
        if (budgetListenerUnsubscribe) {
            console.log("Ensuring Firestore listener is detached for Individual mode.");
            budgetListenerUnsubscribe();
            budgetListenerUnsubscribe = null;
        }
        currentUser = null; // For app context in individual mode

        monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
        for (const monthKey in monthlyData) { /* ... your full sanitization logic ... */ } //

        let localAppSettings = JSON.parse(localStorage.getItem('appSettings')) || {};
        appSettings = { ...appSettings, ...localAppSettings, budgetMode: 'individual' };
        if (!appSettings.notifications) appSettings.notifications = [];

        console.log("Mode is Individual. Loaded data from localStorage.");
        render();
    } else if (appSettings.budgetMode === 'shared' && currentUser) {
        // If already logged in and switched to shared (and didn't go through individual->shared upload path above)
        // ensure listener is active.
        // This path is less likely if upload logic is correctly triggered.
        if (!budgetListenerUnsubscribe) {
            console.log("Ensuring listener is active for shared mode (already logged in).");
            setupFirestoreListenerForUser(currentUser);
        }
    }
    // If newMode is 'shared' and !currentUser, UI shows login prompt. render() might show empty state.
    if (newMode === 'shared' && !currentUser) {
        render();
    }

    showToast(`Budget mode preference set to ${appSettings.budgetMode === 'shared' ? 'Shared Planner' : 'Individual Planner'}.`);
    isSwitchingMode = false;
}

// New helper function to process pending upload, can be called from onAuthStateChanged or handleModeChangeAttempt
// Replace your existing processPendingUploadIfNeeded function
async function processPendingUploadIfNeeded(user) {
    if (appSettings.budgetMode === 'shared' && pendingLocalDataUpload && user) {
        pendingLocalDataUpload = false; // Reset flag: attempt this only once per switch
        console.log("Processing pending local data upload to shared budget.");

        // Retrieve current local data that needs to be merged/uploaded
        const localMonthlyDataToUpload = JSON.parse(localStorage.getItem('monthlyData')) || {};
        // Full sanitization for localMonthlyDataToUpload
        for (const monthKey in localMonthlyDataToUpload) {
            if (localMonthlyDataToUpload.hasOwnProperty(monthKey)) {
                const month = localMonthlyDataToUpload[monthKey];
                if (month.hasOwnProperty('income')) month.income = parseFloat(month.income) || 0;
                if (month.categories && Array.isArray(month.categories)) {
                    month.categories.forEach(cat => {
                        // Ensure all local funds have IDs before merging
                        if (!cat.id) {
                            cat.id = 'fund_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9) + '_migrated';
                        }
                        cat.initialBalance = parseFloat(cat.initialBalance) || 0;
                        cat.balance = parseFloat(cat.balance) || 0;
                        cat.spent = parseFloat(cat.spent) || 0;
                        if (cat.hasOwnProperty('emiAmount')) cat.emiAmount = parseFloat(cat.emiAmount) || 0;
                        if (cat.hasOwnProperty('dueDay') && cat.dueDay !== null) cat.dueDay = parseInt(cat.dueDay, 10) || null;
                    });
                }
                if (!month.history) month.history = [];
                 // Ensure local history items have a unique enough key for de-duplication if possible
                month.history.forEach(h => {
                    if(!h.id && h.timestamp && h.description) { // Create a simple ID if missing for de-duplication
                        h.id = `hist_${new Date(h.timestamp).getTime()}_${h.description.slice(0,10).replace(/\s/g,'')}`;
                    }
                });
                if (!month.hasOwnProperty('emiDeducted')) month.emiDeducted = false;
                if (!month.hasOwnProperty('fundsImported')) month.fundsImported = false;
            }
        }

        let localAppSettingsSnapshot = JSON.parse(localStorage.getItem('appSettings')) || {};
        const shareableLocalSettings = {
            currency: localAppSettingsSnapshot.currency || appSettings.currency || 'INR',
            defaultPaymentApp: localAppSettingsSnapshot.defaultPaymentApp || appSettings.defaultPaymentApp || 'GPay'
        };

        // Check if there's actually any significant local data to upload
        if (Object.keys(localMonthlyDataToUpload).length === 0 && 
            shareableLocalSettings.currency === 'INR' && 
            shareableLocalSettings.defaultPaymentApp === 'GPay') {
             console.log("No significant local data to upload, or it's default. Skipping upload prompt.");
             return; // Skip if local data is empty or default
        }

        const confirmedUpload = await showConfirm(
            "You are now in Shared Mode.\n\nDo you want to upload your previous local budget data to this shared online budget?\n\n- 'OK' will merge your local data with the online data (local data takes precedence for common months/settings).\n- 'Cancel' will connect to the existing shared budget, and your local data won't be uploaded.",
            "Upload Local Data to Shared?"
        );

        if (confirmedUpload) {
            showToast("Merging local data with shared budget...");
            try {
                const docRef = db.collection('budgets').doc('sharedFamilyBudget');
                const docSnap = await docRef.get();
                let existingSharedData = { monthlyData: {}, appSettings: {} };

                if (docSnap.exists) { // Use .exists (property) for compat
                    existingSharedData = docSnap.data() || { monthlyData: {}, appSettings: {} };
                    if (!existingSharedData.monthlyData) existingSharedData.monthlyData = {};
                    if (!existingSharedData.appSettings) existingSharedData.appSettings = {};
                }

                // 1. Merge appSettings: Local shareable settings overwrite existing shared ones
                const mergedAppSettings = {
                    ...existingSharedData.appSettings, // Start with existing shared settings
                    ...shareableLocalSettings         // Overwrite with local shareable settings
                };

                // 2. Merge monthlyData (deep merge month by month)
                const mergedMonthlyData = { ...existingSharedData.monthlyData };

                for (const monthKey in localMonthlyDataToUpload) {
                    if (localMonthlyDataToUpload.hasOwnProperty(monthKey)) {
                        const localMonth = localMonthlyDataToUpload[monthKey];
                        const sharedMonth = mergedMonthlyData[monthKey];

                        if (sharedMonth) { // Month exists in both local and shared
                            console.log(`Merging month: ${monthKey}`);
                            // Income: Local overwrites shared
                            sharedMonth.income = localMonth.income;
                            
                            // Categories: Combine, ensuring uniqueness by ID
                            // Take all local categories for the month.
                            // Then add shared categories from that month only if their ID isn't in the local list.
                            const localCategoryIds = new Set(localMonth.categories.map(cat => cat.id));
                            const combinedCategories = [...localMonth.categories];
                            if (sharedMonth.categories && Array.isArray(sharedMonth.categories)) {
                                sharedMonth.categories.forEach(sharedCat => {
                                    if (sharedCat.id && !localCategoryIds.has(sharedCat.id)) {
                                        combinedCategories.push(sharedCat);
                                    } else if (!sharedCat.id) { // if old shared fund has no ID, add it to avoid losing it
                                        combinedCategories.push(sharedCat);
                                    }
                                });
                            }
                            sharedMonth.categories = combinedCategories;

                            // History: Concatenate and simple de-duplication by ID
                            const combinedHistory = [...(localMonth.history || [])];
                            const localHistoryIds = new Set(combinedHistory.map(h => h.id).filter(id => id)); // Get IDs from local history

                            if (sharedMonth.history && Array.isArray(sharedMonth.history)) {
                                sharedMonth.history.forEach(sharedHist => {
                                     // Add shared history item if its ID is not in local (or if it has no ID)
                                    if (!sharedHist.id || !localHistoryIds.has(sharedHist.id)) {
                                        combinedHistory.push(sharedHist);
                                    }
                                });
                            }
                            // A more robust de-duplication might be needed if IDs are not perfectly unique or consistent
                            sharedMonth.history = combinedHistory;


                            // Merge other month-level flags (local takes precedence or specific logic)
                            sharedMonth.emiDeducted = localMonth.emiDeducted || sharedMonth.emiDeducted;
                            sharedMonth.fundsImported = localMonth.fundsImported || sharedMonth.fundsImported;
                            
                            mergedMonthlyData[monthKey] = sharedMonth;
                        } else {
                            // Month exists in local but not in shared: Add local month entirely
                            mergedMonthlyData[monthKey] = localMonth;
                        }
                    }
                }

                // Now save the fully merged data structure
                await docRef.set({
                    monthlyData: mergedMonthlyData,
                    appSettings: mergedAppSettings
                }); // Using .set() without merge:false on whole doc implies overwrite of fields provided
                   // but since we constructed mergedMonthlyData and mergedAppSettings from existingSharedData,
                   // this acts like a deep merge for these two fields.

                showToast("Local data merged with shared budget. Syncing...");
                // The onSnapshot listener (set up by setupFirestoreListenerForUser)
                // will automatically fetch this newly merged data.
            } catch (error) {
                console.error("Error merging local data to Firestore:", error);
                await showAlert("Error merging local data. Please try again.", "Merge Failed");
                // If merge fails, the app will still proceed to listen to Firestore for existing shared data.
            }
        } else {
            showToast("Skipped uploading/merging local data. Connecting to existing shared budget.");
        }
        // Ensure the flag is always reset
        pendingLocalDataUpload = false;
    }
}


// New Helper: Encapsulate Firestore Listener Setup
function setupFirestoreListenerForUser(user) {
    if (appSettings.budgetMode !== 'shared' || !user) {
        if (budgetListenerUnsubscribe) {
            budgetListenerUnsubscribe();
            budgetListenerUnsubscribe = null;
        }
        return; // Only set up if in shared mode and user is valid
    }

    // Detach existing listener before creating a new one
    if (budgetListenerUnsubscribe) {
        console.log("Detaching existing Firestore listener before setting up new one.");
        budgetListenerUnsubscribe();
        budgetListenerUnsubscribe = null;
    }

    console.log(`Setting up Firestore listener for user: ${user.email}`);
    const docRef = db.collection('budgets').doc('sharedFamilyBudget');
    budgetListenerUnsubscribe = docRef.onSnapshot(docSnap => {
        // This is the SAME onSnapshot logic from your Step 6
        console.log("Firestore real-time update received (onSnapshot).");
        if (docSnap.exists) {
            // ... (Full logic to extract monthlyData, appSettings, sanitize, render) ...
            // Refer to the onSnapshot block from Step 6 for this full logic.
            // For brevity, I'm not repeating the entire data processing block here.
            // Ensure it loads monthlyData, shared appSettings, sanitizes, and calls render().
            const firestoreData = docSnap.data();
            let dataChanged = false;
            if (firestoreData.monthlyData) {
                monthlyData = firestoreData.monthlyData;
                 for (const monthKey in monthlyData) { /* ... full sanitization ... */ }
                dataChanged = true;
            }
            if (firestoreData.appSettings) {
                const sharedSettings = firestoreData.appSettings;
                if (appSettings.currency !== sharedSettings.currency || appSettings.defaultPaymentApp !== sharedSettings.defaultPaymentApp) dataChanged = true;
                appSettings.currency = sharedSettings.currency || appSettings.currency;
                appSettings.defaultPaymentApp = sharedSettings.defaultPaymentApp || appSettings.defaultPaymentApp;
            }
            if (dataChanged || !docSnap.metadata.hasPendingWrites) {
                 showToast("Budget data synced from cloud.");
                 document.getElementById('currencySelect').value = appSettings.currency;
                 document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;
                 render();
            }
        } else {
            console.log("No shared budget document (real-time). Initializing local/default.");
            monthlyData = JSON.parse(localStorage.getItem('monthlyData')) || {};
            for (const monthKey in monthlyData) { /* ... full sanitization ... */ }
            let localAppSettings = JSON.parse(localStorage.getItem('appSettings')) || {};
            appSettings = { budgetMode: 'shared', currency: 'INR', defaultPaymentApp: 'GPay', notifications: [], ...localAppSettings, budgetMode: 'shared' }; // Ensure shared mode
            if (!appSettings.notifications) appSettings.notifications = [];
            document.getElementById('currencySelect').value = appSettings.currency;
            document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;
            render();
        }
    }, error => {
        console.error("Error in Firestore real-time listener: ", error);
        showToast("Error syncing data. Please check connection.");
    });
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
    newFund.balance = newFund.initialBalance; // Reset balance to its initial allocated amount
    newFund.spent = 0; // Reset spent amount to 0 for the new month

    // The only exception is for manual investments, where the initial amount is considered "spent"
    if (newFund.type === 'investment' && newFund.deductionType === 'manual') {
        newFund.spent = newFund.initialBalance;
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





// Replace your existing exportToPdf function
async function exportToPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const currentMonthData = getCurrentMonthData();
    const currentCurrencySymbol = currencySymbols[appSettings.currency] || '₹';
    const monthYearDisplay = getFullDateString(currentMonth);
    const userSelectedTimezone = appSettings.userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    let yPos = 15;
    const lineHeight = 7;
    const margin = 15;
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;

    // PDF Header
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('Account Statement', pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 1.5;
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Period: ${monthYearDisplay}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 2;

    // Account Holder Info
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Account Holder:', margin, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(userProfile.name || 'N/A', margin + 40, yPos);
    yPos += lineHeight;
    doc.setFont(undefined, 'bold');
    doc.text('Email:', margin, yPos);
    doc.setFont(undefined, 'normal');
    const emailToDisplay = currentUser ? currentUser.email : (userProfile.email || 'N/A');
    doc.text(emailToDisplay, margin + 40, yPos);
    yPos += lineHeight;
    doc.setFont(undefined, 'bold');
    doc.text('Statement Date:', margin, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(new Date().toLocaleDateString(undefined, { timeZone: userSelectedTimezone }), margin + 40, yPos);
    yPos += lineHeight * 2;

    // Account Summary
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Account Summary', margin, yPos);
    yPos += lineHeight * 1.5;

    const summaryHead = [['Description', 'Amount']]; // Header for summary
    const summaryBody = [
        [`Monthly Income:`, `${currentCurrencySymbol}${currentMonthData.income.toFixed(2)}`],
    ];
    const totalSpent = (currentMonthData.categories || []).reduce((sum, cat) => sum + (cat.spent || 0), 0);
    summaryBody.push([`Total Expenses/Investments:`, `${currentCurrencySymbol}${totalSpent.toFixed(2)}`]);
    const totalBalance = (currentMonthData.income || 0) - totalSpent;
    summaryBody.push([`Remaining Balance:`, `${currentCurrencySymbol}${totalBalance.toFixed(2)}`]);

    // --- MODIFIED autoTable call for summary ---
    doc.autoTable({
        head: summaryHead,
        body: summaryBody,
        startY: yPos,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [22, 160, 133], textColor: 255, fontStyle: 'bold' },
        margin: { left: margin, right: margin },
        tableWidth: 'auto',
    });
    yPos = doc.lastAutoTable.finalY + lineHeight * 2;

    // Transaction Details
    const historyToRender = currentMonthData.history || [];
    if (historyToRender.length > 0) {
        if (yPos + lineHeight * 4 > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
        }
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Transaction Details', margin, yPos);
        yPos += lineHeight * 1.5;

        const transactionTableHead = [["Date", "Time", "Description", `Amount (${currentCurrencySymbol})`, "Type"]];
        const transactionTableRows = [];

        historyToRender.forEach(transaction => {
            const transactionDateObject = new Date(transaction.timestamp);
            const transactionDate = transactionDateObject.toLocaleDateString(undefined, { timeZone: userSelectedTimezone });
            const transactionTime = transactionDateObject.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: userSelectedTimezone });
            const transactionType = transaction.type ? transaction.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A';
            const transactionAmount = transaction.amount ? transaction.amount.toFixed(2) : '-';

            transactionTableRows.push([
                transactionDate,
                transactionTime,
                transaction.description, // Full description
                transactionAmount,
                transactionType
            ]);
        });

        // --- MODIFIED autoTable call for transaction details ---
        doc.autoTable({
            head: transactionTableHead,
            body: transactionTableRows,
            startY: yPos,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 20 },    // Date
                1: { cellWidth: 20 },    // Time
                2: { cellWidth: 85, halign: 'left'}, // Description
                3: { cellWidth: 25, halign: 'right' }, // Amount
                4: { cellWidth: 25 }     // Type
            },
            margin: { left: margin, right: margin },
            didDrawPage: function (data) {
                doc.setFontSize(10);
                doc.text('Page ' + doc.internal.getNumberOfPages(), data.settings.margin.left, pageHeight - 10);
            }
        });
        yPos = doc.lastAutoTable.finalY;
    } else {
        // ... (No transaction history message) ...
        if (yPos + lineHeight * 2 > pageHeight - margin) { doc.addPage(); yPos = margin; }
        doc.setFontSize(12); doc.text('No transaction history for this period.', margin, yPos); yPos += lineHeight;
    }

    // PDF Footer
    if (yPos + lineHeight * 3 > pageHeight - margin * 2) { doc.addPage(); yPos = margin; }
    doc.setFontSize(9);
    doc.setFont(undefined, 'italic');
    doc.text('This is a system-generated statement.', margin, pageHeight - margin - lineHeight * 2);
    doc.text(`Smart Budget Wallet - ${new Date().getFullYear()}`, margin, pageHeight - margin - lineHeight);

    doc.save(`Statement_CurrentMonth_${monthYearDisplay.replace(/\s+/g, '_')}.pdf`);
    showToast('Current month statement downloaded!');
}

// Add this new or replace existing exportToPdfWithDateRange function
async function exportToPdfWithDateRange() {
    const startDateString = document.getElementById('pdfStartDate').value;
    const endDateString = document.getElementById('pdfEndDate').value;

    if (!startDateString || !endDateString) {
        await showAlert("Please select both a start and end date for the range.", "Date Range Required");
        return;
    }

    const startDate = new Date(startDateString);
    startDate.setHours(0, 0, 0, 0); 

    const endDate = new Date(endDateString);
    endDate.setHours(23, 59, 59, 999);

    if (endDate < startDate) {
        await showAlert("End date cannot be before the start date.", "Invalid Date Range");
        return;
    }

    showToast("Generating statement for selected range...");

    let rangedHistory = [];
    for (const monthKey in monthlyData) {
        if (monthlyData.hasOwnProperty(monthKey) && monthlyData[monthKey].history) {
            monthlyData[monthKey].history.forEach(transaction => {
                const transactionTimestamp = new Date(transaction.timestamp);
                if (transactionTimestamp >= startDate && transactionTimestamp <= endDate) {
                    rangedHistory.push(transaction);
                }
            });
        }
    }

    rangedHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (rangedHistory.length === 0) {
        await showAlert("No transactions found for the selected date range.", "No Data");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const currentCurrencySymbol = currencySymbols[appSettings.currency] || '₹';
    const userSelectedTimezone = appSettings.userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    let yPos = 15;
    const lineHeight = 7;
    const margin = 15;
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;

    doc.setFontSize(20); doc.setFont(undefined, 'bold');
    doc.text('Account Statement', pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 1.5;
    doc.setFontSize(12); doc.setFont(undefined, 'normal');
    const formattedStartDate = startDate.toLocaleDateString(undefined, {timeZone: userSelectedTimezone});
    const formattedEndDate = endDate.toLocaleDateString(undefined, {timeZone: userSelectedTimezone});
    doc.text(`Period: ${formattedStartDate} - ${formattedEndDate}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 2;

    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Account Holder:', margin, yPos); doc.setFont(undefined, 'normal'); doc.text(userProfile.name || 'N/A', margin + 40, yPos); yPos += lineHeight;
    doc.setFont(undefined, 'bold');
    doc.text('Email:', margin, yPos); doc.setFont(undefined, 'normal');
    const emailToDisplayRanged = currentUser ? currentUser.email : (userProfile.email || 'N/A');
    doc.text(emailToDisplayRanged, margin + 40, yPos); yPos += lineHeight;
    doc.setFont(undefined, 'bold');
    doc.text('Statement Date:', margin, yPos); doc.setFont(undefined, 'normal'); doc.text(new Date().toLocaleDateString(undefined, {timeZone: userSelectedTimezone}), margin + 40, yPos); yPos += lineHeight * 2;

    let totalExpensesInRange = 0;
    rangedHistory.forEach(t => {
        if (t.amount && (t.type.startsWith('expense_') || t.type === 'emi_deduction_processed' || t.type === 'fund_creation' && t.fundType === 'investment')) {
            totalExpensesInRange += t.amount;
        } else if (t.type === 'transfer' && t.amount > 0) { // Consider transfers out as an expense for this summary
             const fromFundDetails = monthlyData[getMonthYearString(new Date(t.timestamp))]?.categories.find(c => c.name === t.fromFund);
             if (fromFundDetails && fromFundDetails.type !== 'investment') { // Only count if not from investment for "expense"
                // This simple sum might not be perfect, but it's a basic approach
             }
        }
    });
    doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text('Summary for Selected Range', margin, yPos); yPos += lineHeight * 1.5;
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    // --- ENSURE BACKTICKS (`) ARE USED FOR TEMPLATE LITERAL BELOW ---
    doc.text(`Total Spent/Invested in Range: ${currentCurrencySymbol}${totalExpensesInRange.toFixed(2)}`, margin, yPos);
    yPos += lineHeight * 2;

    if (yPos + lineHeight * 4 > pageHeight - margin) { doc.addPage(); yPos = margin; }
    doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text('Transaction Details', margin, yPos); yPos += lineHeight * 1.5;

    const tableColumn = ["Date", "Time", "Description", `Amount (${currentCurrencySymbol})`, "Type"];
    const tableRows = [];

    rangedHistory.forEach(transaction => {
        const transactionDateObject = new Date(transaction.timestamp);
        const transactionDate = transactionDateObject.toLocaleDateString(undefined, {timeZone: userSelectedTimezone});
        const transactionTime = transactionDateObject.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: userSelectedTimezone });
        const transactionType = transaction.type ? transaction.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A';
        const transactionAmount = transaction.amount ? transaction.amount.toFixed(2) : '-';

        const rowData = [
            transactionDate,
            transactionTime,
            transaction.description, // Full description
            transactionAmount,
            transactionType
        ];
        tableRows.push(rowData);
    });

    doc.autoTable(tableColumn, tableRows, {
        startY: yPos,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' }, // overflow: 'linebreak'
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 20 },    // Date
            1: { cellWidth: 20 },    // Time
            2: { cellWidth: 85}, // Description
            3: { cellWidth: 25, halign: 'right' }, // Amount
            4: { cellWidth: 25 }     // Type
        },
        margin: { left: margin, right: margin },
        didDrawPage: function (data) { /* ... your page number logic ... */ }
    });
    yPos = doc.lastAutoTable.finalY;

    if (yPos + lineHeight * 3 > pageHeight - margin * 2) { doc.addPage(); }
    doc.setFontSize(7); doc.setFont(undefined, 'italic');
    doc.text('This is a system-generated statement.', margin, pageHeight - margin - lineHeight * 2);
    doc.text(`Smart Budget Wallet - ${new Date().getFullYear()}`, margin, pageHeight - margin - lineHeight);

    doc.save(`Statement_Range_${startDateString}_to_${endDateString}.pdf`);
    showToast('Statement for selected range downloaded!');
}





function toggleLogTransactionSection() {
    const section = document.getElementById('logTransactionSectionCard');
    if (section) { // Check if the element actually exists
        section.classList.toggle('open'); // This will add/remove the '.open' class

        // If the section is now open (meaning the 'open' class was added),
        // you might want to scroll it into view if it's off-screen.
        if (section.classList.contains('open')) {
            // This scrolling is optional.
            // setTimeout(() => { 
            //     section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            // }, 50); 
        }
    } else {
        console.error("#logTransactionSectionCard element not found!");
    }
}


    let activeSectionWrapperId = 'dashboardSectionWrapper';
    const sectionOrder = ['dashboardSectionWrapper', 'historySectionWrapper', 'analyticsSectionWrapper', 'settingsSectionWrapper'];


function scrollToSection(sectionId, isSwipe = false) {
    const newSectionWrapperId = sectionId.replace('-section', 'SectionWrapper');
    const oldSectionWrapper = document.getElementById(activeSectionWrapperId);
    const newSectionWrapper = document.getElementById(newSectionWrapperId);
    // const daikoFab = document.getElementById('daikoInsightsFab'); // Defined below for clarity

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
        // ... (existing content of newSectionAnimationEnd callback which handles displaying section contents)
        // This callback should remain as is, managing the display of #dashboardSectionWrapper, #historySectionWrapper etc.
        // We will manage the FAB outside this specific animation callback for simplicity,
        // though it could also be done here.
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
                        if (isCurrentNewSection) { 
                            el.style.display = (selector === '#dashboardGaugesContainer' ? 'flex' : 'block'); 
                        } else { 
                            el.style.display = 'none'; 
                        }
                    }
                }); 
                const currentDateDisplayCard = sectionWrapperElement.querySelector('#currentDateDisplay')?.closest('.card'); 
                if (currentDateDisplayCard) { 
                    currentDateDisplayCard.style.display = isCurrentNewSection ? 'block' : 'none'; 
                }

                const logTransactionCard = document.getElementById('logTransactionSectionCard'); 
                if (logTransactionCard) {  
                    if (isCurrentNewSection) { 
                        logTransactionCard.style.display = '';  
                    } else { 
                        logTransactionCard.classList.remove('open');  
                    }
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
                            if (historyContent && historyToggleIcon && historyToggleIcon.textContent === '▲') { 
                                historyContent.style.display = 'block'; 
                            } else if (historyContent) { 
                                historyContent.style.display = 'none'; 
                            }
                            const howWasMyDayContent = document.getElementById('howWasMyDayGraphContainer'); 
                            const howWasMyDayToggleIcon = document.getElementById('howWasMyDayGraphToggleIcon'); 
                            if (howWasMyDayContent && howWasMyDayToggleIcon && howWasMyDayToggleIcon.textContent === '▲'){ 
                                howWasMyDayContent.style.display = 'block'; 
                                renderHowWasMyDayChart(); 
                            } else if (howWasMyDayContent){ 
                                howWasMyDayContent.style.display = 'none'; 
                            }
                            const dailyGraphContent = document.getElementById('dailyExpensesGraphContainer'); 
                            const dailyGraphToggleIcon = document.getElementById('dailyExpensesGraphToggleIcon'); 
                            if (dailyGraphContent && dailyGraphToggleIcon && dailyGraphToggleIcon.textContent === '▲'){ 
                                dailyGraphContent.style.display = 'block'; 
                                renderDailyBarChart();  
                            } else if (dailyGraphContent){ 
                                dailyGraphContent.style.display = 'none'; 
                            }
                        } else if (wrapperId === 'analyticsSectionWrapper' && isCurrentNewSection) { 
                            const categoriesForPieChart = getCurrentMonthData().categories.filter(cat => !cat.isPersonal); 
                            renderPieChart(categoriesForPieChart); 
                        } else if (wrapperId === 'settingsSectionWrapper') { 
                            const faqContent = document.getElementById('faqContentSettings'); 
                            const faqToggleIcon = document.getElementById('faqToggleIconSettings'); 
                            if (faqContent && faqToggleIcon && faqToggleIcon.textContent === '▲') {  
                                faqContent.style.display = 'block'; 
                            } else if (faqContent) { 
                                faqContent.style.display = 'none'; 
                            }
                        }
                    }
                }
            }
       });
        render(); // Existing render call
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

    activeSectionWrapperId = newSectionWrapperId; // Active section is updated here

    // --- START: MODIFIED Daiko Insights FAB visibility logic ---
    const daikoFab = document.getElementById('daikoInsightsFab');
    if (daikoFab) {
        const targetSectionsForDaikoFab = ['dashboardSectionWrapper', 'historySectionWrapper', 'analyticsSectionWrapper'];
        if (targetSectionsForDaikoFab.includes(activeSectionWrapperId)) { // Check against the new activeSectionWrapperId
            daikoFab.style.display = 'flex'; // Use 'flex' as per your FAB CSS
        } else {
            daikoFab.style.display = 'none';
        }
    }
    // --- END: MODIFIED Daiko Insights FAB visibility logic ---

    const navButtons = document.querySelectorAll('.bottom-nav button');
    // ... (rest of your nav button update logic) ...
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


function updateUserTimezone() {
    const selectedTimezone = document.getElementById('timezoneSelect').value;
    appSettings.userTimezone = selectedTimezone;
    saveLocalAppSettings(); // Save to localStorage

    // Optionally, re-render if any dates/times on the current page need immediate updating.
    // For now, a toast is sufficient. Full effect will be seen on next date renderings.
    render(); // This will re-render elements like history with new timezone potentially
    showToast(`Timezone set to ${selectedTimezone}. Dates and times will use this preference.`);
    
    // If you have specific date/time elements that need immediate reformatting without a full render:
    // document.getElementById('currentDateDisplay').textContent = getFullDateString(currentMonth); 
    // (getFullDateString would need to be updated to use appSettings.userTimezone)
}




function renderUserProfile() {
    document.getElementById('welcomeMessage').textContent = `Welcome, ${userProfile.name}!`;
    document.getElementById('welcomeAvatar').src = userProfile.avatar;
    document.getElementById('userNameInput').value = userProfile.name;
    document.getElementById('userEmailInput').value = userProfile.email;
    document.getElementById('profileAvatarDisplay').src = userProfile.avatar;
    document.getElementById('profileNameDisplay').textContent = userProfile.name;
    document.getElementById('profileEmailDisplay').textContent = userProfile.email;

    document.querySelectorAll('.avatar-image-option').forEach(option => {
        if (option.dataset.image === userProfile.avatar) {
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

  function markTutorialAsComplete() {
    localStorage.setItem('tutorialShown', 'true');
    console.log("Tutorial marked as complete.");
    // Optionally clean up any highlights if they are still active
    document.querySelectorAll('.highlight-tutorial').forEach(el => el.classList.remove('highlight-tutorial'));
}

async function showNextTutorialStep() {
        if (localStorage.getItem('tutorialShown') === 'true') {
            console.log("Tutorial already marked as complete, skipping.");
            return;
        }
        
          markTutorialAsComplete();

        if (currentTutorialStep >= tutorialSteps.length) {
            markTutorialAsComplete(); // Call the new function here
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

        if (step.highlightId !== 'fab') { // This condition is specific to the "Create Your Funds" step
            currentTutorialStep++;
            if (currentTutorialStep < tutorialSteps.length) {
                 setTimeout(showNextTutorialStep, 300);
            } else {
                markTutorialAsComplete(); // Call the new function here when all steps are done
                render();
            }
        }
        // If the current step's highlightId IS 'fab', we wait for the user to click it.
        // The currentTutorialStep is incremented inside openCreateFundModal().
        // So, once openCreateFundModal is called and the tutorial proceeds,
        // it eventually hits the final step and calls markTutorialAsComplete.
        // This structure seems to be the intended flow.
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


async function saveEditedFund() {
    // Check if a fund is actually being edited
    if (fundIndexToEdit === -1) {
        await showAlert('Error: No fund selected for editing.');
        return;
    }

    const currentMonthData = getCurrentMonthData();
    const fundToEdit = currentMonthData.categories[fundIndexToEdit];

    if (!fundToEdit) {
        await showAlert('Error: Could not find the fund to edit.', 'Edit Error');
        closeEditFundModal();
        return;
    }

    // Store original details for the history log
    const originalFundDetails = JSON.parse(JSON.stringify(fundToEdit));

    // Get new values from the modal's input fields
    const newName = document.getElementById('editFundName').value.trim();
    const newType = document.querySelector('input[name="editFundType"]:checked').value;
    const newDeductionType = document.getElementById('editIsAutoDeduct').checked ? 'auto' : 'manual';
    let newDueDay = null;

    if (newDeductionType === 'auto') {
        const dueDayValueStr = document.getElementById('editFundDueDay').value;
        if (dueDayValueStr) {
            const dueDayValue = parseInt(dueDayValueStr, 10);
            if (isNaN(dueDayValue) || dueDayValue < 1 || dueDayValue > 31) {
                await showAlert('Please enter a valid Due Day (1-31) or leave it blank.');
                return;
            }
            newDueDay = dueDayValue;
        }
    }

    // --- Validations ---
    if (!newName) {
        await showAlert('Fund name cannot be empty.');
        return;
    }

    // Check if another fund (other than the one being edited) already has the new name
    const anotherFundExists = currentMonthData.categories.some((cat, index) =>
        index !== fundIndexToEdit && cat.name.toLowerCase() === newName.toLowerCase()
    );

    if (anotherFundExists) {
        await showAlert(`A fund with the name '${newName}' already exists.`);
        return;
    }

    // --- Apply Changes ---
    // Note: The Amount field is set to read-only in this modal, so we are not changing financial values here.
    fundToEdit.name = newName;
    fundToEdit.type = newType;
    fundToEdit.deductionType = newDeductionType;
    fundToEdit.dueDay = newDeductionType === 'auto' ? newDueDay : null;

    // --- Log to History ---
    addToHistory({
        type: 'fund_edit',
        fundId: fundToEdit.id,
        fundNameBeforeEdit: originalFundDetails.name,
        description: `Fund '${originalFundDetails.name}' was updated to '${newName}'.`
    });

    // --- Finalize ---
    showToast(`Fund '${newName}' updated successfully.`);
    closeEditFundModal();
    render(); // Re-draw the screen with the updated information
}



    function toggleEditDueDayVisibility() {
        editDueDayInputContainer.style.display = editIsAutoDeductCheckbox.checked ? 'block' : 'none';
        if (!editIsAutoDeductCheckbox.checked) {
            editFundDueDayInput.value = '';
        }
    }



// Inside script.js

async function saveUnifiedEditedFund() {
    if (!currentUnifiedFundId) {
        showAlert("Error: No fund selected for editing.");
        return;
    }

    const currentMonthData = getCurrentMonthData(); // Ensures Wallet fund is available
    const fundToEdit = currentMonthData.categories.find(cat => cat.id === currentUnifiedFundId);
    const walletFund = currentMonthData.categories.find(cat => cat.isDefaultWallet);

    if (!fundToEdit) {
        await showAlert("Error: Could not find the fund to edit.", "Edit Error");
        closeUnifiedFundModal();
        return;
    }

    if (fundToEdit.isDefaultWallet) {
        await showAlert("The Wallet fund's core properties cannot be edited here.", "Action Not Allowed");
        // Allow only name change if that's desired, otherwise just close.
        // For now, preventing any edit to wallet's core financial properties.
        const newWalletName = document.getElementById('unifiedEditFundName').value.trim();
        if (newWalletName && newWalletName !== walletFund.name) {
            const oldName = walletFund.name;
            walletFund.name = newWalletName;
            addToHistory({
                type: 'fund_edit',
                fundId: walletFund.id,
                fundNameBeforeEdit: oldName,
                changedProperties: { name: { from: oldName, to: newWalletName } },
                description: `Default Wallet name changed from '${oldName}' to '${newWalletName}'.`
            });
            showToast("Wallet name updated.");
            render();
        }
        // closeUnifiedFundModal(); // Or hide config section
        hideUnifiedConfigurationSection();
        return;
    }

    if (!walletFund) {
        await showAlert("Critical Error: Default Wallet fund not found.", "System Error");
        closeUnifiedFundModal();
        return;
    }

    const originalFundDetailsForHistory = JSON.parse(JSON.stringify(fundToEdit)); // Deep copy for history

    // Get new values from the modal
    const newName = document.getElementById('unifiedEditFundName').value.trim();
    
    // **NEW: Read the potentially changed amount**
    // Assuming 'unifiedEditFundAmountDisplay' is now editable for initialBalance/emiAmount
    const newAmountString = document.getElementById('unifiedEditFundAmountDisplay').value;
    const newMainAmount = parseFloat(newAmountString); // This is the new initialBalance or emiAmount

    const newType = document.querySelector('input[name="unifiedEditFundType"]:checked').value;
    const newDeductionType = document.getElementById('unifiedEditIsAutoDeduct').checked ? 'auto' : 'manual';
    let newDueDay = null;
    if (newDeductionType === 'auto') {
        const dueDayValueStr = document.getElementById('unifiedEditFundDueDay').value;
        if (dueDayValueStr) {
            const dueDayValue = parseInt(dueDayValueStr);
            if (isNaN(dueDayValue) || dueDayValue < 1 || dueDayValue > 31) {
                await showAlert('Please enter a valid Due Day (1-31) for auto-deduct or leave it blank.'); return;
            }
            newDueDay = dueDayValue;
        }
    }

    // --- Validations ---
    if (!newName) { await showAlert('Fund name cannot be empty.'); return; }
    if (newName.toLowerCase() !== fundToEdit.name.toLowerCase() &&
        currentMonthData.categories.some(cat => cat.id !== currentUnifiedFundId && cat.name.toLowerCase() === newName.toLowerCase())) {
        await showAlert(`A fund with the name '${newName}' already exists.`); return;
    }
    if (isNaN(newMainAmount) || newMainAmount < 0) {
        await showAlert('The fund amount must be a non-negative number.'); return;
    }
    if (newDeductionType === 'auto' && newMainAmount <= 0) {
        await showAlert('Auto-Deduct/Auto-Invest amount must be positive.'); return;
    }

    // --- Calculate Difference in Allocation ---
    let allocationDifference = 0;
    let oldAllocatedAmount = 0;

    if (fundToEdit.deductionType === 'manual') {
        oldAllocatedAmount = fundToEdit.initialBalance;
        if (newDeductionType === 'manual') {
            allocationDifference = newMainAmount - fundToEdit.initialBalance;
        } else { // Changing from Manual to Auto
            allocationDifference = newMainAmount - fundToEdit.initialBalance; // New EMI vs old InitialBalance
        }
    } else { // fundToEdit.deductionType was 'auto'
        oldAllocatedAmount = fundToEdit.emiAmount;
        if (newDeductionType === 'auto') {
            allocationDifference = newMainAmount - fundToEdit.emiAmount;
        } else { // Changing from Auto to Manual
            allocationDifference = newMainAmount - fundToEdit.emiAmount; // New InitialBalance vs old EMI
        }
    }

    // --- Adjust Wallet Balance ---
    if (allocationDifference !== 0) {
        if (allocationDifference > 0) { // Increased allocation to this fund
            if (walletFund.balance < allocationDifference) {
                await showAlert(`Insufficient balance in Wallet to increase allocation. Wallet has ${currencySymbols[appSettings.currency]}${walletFund.balance.toFixed(2)}, needs ${currencySymbols[appSettings.currency]}${allocationDifference.toFixed(2)}.`);
                return; // Stop the save
            }
            walletFund.balance -= allocationDifference;
            addToHistory({
                type: 'wallet_adjustment_edit_fund',
                amount: allocationDifference,
                fundName: newName,
                description: `Wallet decreased by ${currencySymbols[appSettings.currency]}${allocationDifference.toFixed(2)} due to increased allocation for ${newName}.`
            });
        } else { // Decreased allocation to this fund (allocationDifference is negative)
            walletFund.balance += Math.abs(allocationDifference);
            addToHistory({
                type: 'wallet_adjustment_edit_fund',
                amount: Math.abs(allocationDifference), // Log positive amount returned
                fundName: newName,
                description: `Wallet increased by ${currencySymbols[appSettings.currency]}${Math.abs(allocationDifference.toFixed(2))} due to decreased allocation for ${newName}.`
            });
        }
    }

    // --- Update Fund Properties ---
    fundToEdit.name = newName;
    const previousType = fundToEdit.type; // For history/logic if needed
    const previousDeductionType = fundToEdit.deductionType; // For history/logic
    fundToEdit.type = newType;

    if (newDeductionType === 'manual') {
        const oldBalanceBeforeEdit = fundToEdit.balance; // Preserve current balance before overwriting initialBalance
        const oldSpentBeforeEdit = fundToEdit.spent;

        fundToEdit.initialBalance = newMainAmount;
        fundToEdit.deductionType = 'manual';
        fundToEdit.emiAmount = 0;
        fundToEdit.dueDay = null;

        if (previousDeductionType === 'auto' || fundToEdit.initialBalance !== oldAllocatedAmount) {
            // If type changed from auto OR if initialBalance itself was changed for a manual fund
            if (fundToEdit.type === 'investment') {
                fundToEdit.spent = fundToEdit.initialBalance; // Manual investment: initial amount is considered "spent" into it
                fundToEdit.balance = 0; // Or how you define balance for manual investments
            } else { // Manual Expense
                // If it was converted from Auto, or if initialBalance changed, we need to decide how 'spent' and 'balance' are affected.
                // Simplest: reset spent if initialBalance changed significantly, or if converted from auto.
                // This assumes past transactions are still valid but the "envelope size" changed.
                // A common approach is that 'spent' remains, and 'balance' adjusts.
                // Balance = New Initial Balance - Existing Spent
                fundToEdit.spent = oldSpentBeforeEdit; // Keep existing spent
                // Recalculate balance: New Initial - Existing Spent
                fundToEdit.balance = fundToEdit.initialBalance - fundToEdit.spent;
            }
        } else {
            // If it was already manual and only name/type changed (not initialBalance)
            // spent and balance would remain as they were.
            // This path means allocationDifference was 0 and it was already manual.
        }

    } else { // newDeductionType is 'auto'
        fundToEdit.emiAmount = newMainAmount;
        fundToEdit.deductionType = 'auto';
        fundToEdit.dueDay = newDueDay;
        // For auto-deduct funds, initialBalance might be set to emiAmount for consistency,
        // or it might represent a "total allocated for EMIs" concept if topped up.
        // Let's assume initialBalance also reflects the new EMI amount for simplicity.
        fundToEdit.initialBalance = newMainAmount;
        fundToEdit.spent = fundToEdit.emiAmount; // Assume EMI is "spent" for the current month view
        fundToEdit.balance = 0; // Auto-deduct funds often reflect 0 balance or over/under
    }

    // --- Add History for the Fund Edit Itself ---
    addToHistory({
        type: 'fund_edit',
        fundId: fundToEdit.id,
        fundNameBeforeEdit: originalFundDetailsForHistory.name,
        changedProperties: {
            name: fundToEdit.name !== originalFundDetailsForHistory.name ? { from: originalFundDetailsForHistory.name, to: fundToEdit.name } : undefined,
            amount: newMainAmount !== oldAllocatedAmount ? { from: oldAllocatedAmount, to: newMainAmount } : undefined,
            type: fundToEdit.type !== originalFundDetailsForHistory.type ? { from: originalFundDetailsForHistory.type, to: fundToEdit.type } : undefined,
            deductionType: fundToEdit.deductionType !== originalFundDetailsForHistory.deductionType ? { from: originalFundDetailsForHistory.deductionType, to: fundToEdit.deductionType } : undefined,
            dueDay: fundToEdit.dueDay !== originalFundDetailsForHistory.dueDay ? { from: originalFundDetailsForHistory.dueDay, to: fundToEdit.dueDay } : undefined,
        },
        description: `Fund '${originalFundDetailsForHistory.name}' updated. New amount: ${currencySymbols[appSettings.currency]}${newMainAmount.toFixed(2)}.`
    });

    showToast(`Fund '${fundToEdit.name}' updated.`);
    render();
    hideUnifiedConfigurationSection(); // Or closeUnifiedFundModal();
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
                        `"${fund.name}" balance is very low.`,
                        fundLow10Id,
                        'lowBalance10'
                    );
                } else if (remainingPercentage <= 50) {
                    const low10Notification = appSettings.notifications.find(n => n.id === fundLow10Id && !n.read);
                    if (!low10Notification) {
                         addNotification(
                            `"${fund.name}" balance is low.`,
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
        
        // Add this line for the staggered animation
        let animationDelay = 0;

        unreadNotifications.forEach(n => {
            const item = document.createElement('div');
            item.className = 'notification-item unread';
            item.innerHTML = n.message;

            // --- START: Added Animation Logic ---
            item.style.animation = `slideInFade 0.4s ease-out forwards`;
            item.style.animationDelay = `${animationDelay}s`;
            animationDelay += 0.1; // Increment delay for the next item
            // --- END: Added Animation Logic ---

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
            return "I'm DaikuFi's assistant. You can call me Daiko when we're chatting with voice!";
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

// Near line 2413, replace the existing DOMContentLoaded listener
document.addEventListener('DOMContentLoaded', () => {
    // Load global appSettings (including budgetMode) from localStorage first
    // This ensures appSettings.budgetMode is available for immediate decisions.
    let loadedSettings = JSON.parse(localStorage.getItem('appSettings'));
    appSettings = { // Establish defaults
        currency: 'INR',
        defaultPaymentApp: 'GPay',
        notifications: [],
        budgetMode: 'individual', // Default mode
        ...loadedSettings // Overwrite with anything from localStorage
    };
    if (!appSettings.notifications) appSettings.notifications = [];
    if (!appSettings.budgetMode) appSettings.budgetMode = 'individual'; // Extra safety for budgetMode

    console.log("DOMContentLoaded: Initial budgetMode is", appSettings.budgetMode);

    // Set the budget mode radio button in Settings UI
    const currentModeRadio = document.querySelector(`input[name="budgetModeOption"][value="${appSettings.budgetMode}"]`);
    if (currentModeRadio) {
        currentModeRadio.checked = true;
    } else {
        console.warn("Budget mode radio button not found for current mode:", appSettings.budgetMode);
    }

    // Initialize Auth UI visibility based on the loaded mode and (initially null) currentUser
    // onAuthStateChanged will fire shortly if there's a persisted Firebase session and update currentUser
    updateAuthUIVisibility();
    

const initialDaikoFab = document.getElementById('daikoInsightsFab');
if (initialDaikoFab) {
    const targetSectionsForDaikoFab = ['dashboardSectionWrapper', 'historySectionWrapper', 'analyticsSectionWrapper'];
    if (targetSectionsForDaikoFab.includes(activeSectionWrapperId)) { // activeSectionWrapperId is 'dashboardSectionWrapper' on load
        initialDaikoFab.style.display = 'flex'; 
    } else {
        initialDaikoFab.style.display = 'none';
    }
}


    // --- Your other existing DOMContentLoaded initializations ---
    const ttsToggle = document.getElementById('ttsToggle');
    if (ttsToggle) {
        isSpeakingEnabled = ttsToggle.checked;
    } else {
        isSpeakingEnabled = false;
        console.error("ttsToggle element not found!");
    }

    setupPasswordVisibilityToggle('userPasswordInput', 'togglePasswordVisibility'); // For the auth form

    if ('speechSynthesis' in window) {
        synth = window.speechSynthesis;
    } else {
        // ... (your existing speech synth warning)
        console.warn('Web Speech API (SpeechSynthesis) not supported.');
        showToast('Text-to-speech is not supported.');
        if (ttsToggle) {
            const ttsOptionsContainer = ttsToggle.closest('.chat-options');
            if (ttsOptionsContainer) ttsOptionsContainer.style.display = 'none';
        }
        isSpeakingEnabled = false;
    }
  

  const timezoneSelectElement = document.getElementById('timezoneSelect');
if (timezoneSelectElement) {
    // Optional: Dynamically populate more timezone options here if needed.
    // For now, we assume the HTML has a decent list.

    // Set the selected option
    if (appSettings.userTimezone) {
        timezoneSelectElement.value = appSettings.userTimezone;
    } else {
        // If no timezone is set (e.g., very old localStorage), default to browser's and save it
        appSettings.userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        timezoneSelectElement.value = appSettings.userTimezone;
        saveLocalAppSettings();
    }
}
    const dailyExpensesGraphContainer = document.getElementById('dailyExpensesGraphContainer');
    const dailyExpensesGraphToggleIcon = document.getElementById('dailyExpensesGraphToggleIcon');
    if (dailyExpensesGraphContainer && dailyExpensesGraphToggleIcon) {
        dailyExpensesGraphToggleIcon.textContent = dailyExpensesGraphContainer.style.display === 'none' ? '▼' : '▲';
    }
    
     const howWasMyDayGraphContainer = document.getElementById('howWasMyDayGraphContainer');
const howWasMyDayGraphToggleIcon = document.getElementById('howWasMyDayGraphToggleIcon');
if (howWasMyDayGraphContainer && howWasMyDayGraphToggleIcon) {
    howWasMyDayGraphToggleIcon.textContent = howWasMyDayGraphContainer.style.display === 'none' ? '▼' : '▲';
}




    document.getElementById('currencySelect').value = appSettings.currency;
    document.getElementById('defaultPaymentAppSelect').value = appSettings.defaultPaymentApp;
    
    // renderUserProfile() is called within render(), or by onAuthStateChanged based on currentUser
    // So, an initial call here might be redundant if render() is called soon.
    // However, to ensure profile details are shown immediately from localStorage if available:
    renderUserProfile(); // Reflects localStorage userProfile initially

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
        if (event.target.classList.contains('avatar-image-option')) {
            selectAvatar(event.target.dataset.image);
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

    // ... (Your existing swipe event listeners for mainWrapper) ...
    const mainWrapper = document.getElementById('mainContentWrapper');
    if (mainWrapper) {
        // ... (keep your full swipe setup here) ...
        let touchStartX = 0;
        let touchEndX = 0;
        const swipeThreshold = 50;

        mainWrapper.addEventListener('touchstart', e => {
            if (e.touches.length === 1) touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        mainWrapper.addEventListener('touchend', e => {
            if (e.changedTouches.length === 1) {
                touchEndX = e.changedTouches[0].screenX;
                handleSwipe();
            }
        }, { passive: true });

        function handleSwipe() {
            const deltaX = touchEndX - touchStartX;
            const currentSectionIndex = sectionOrder.indexOf(activeSectionWrapperId);
            if (currentSectionIndex === -1 || touchStartX === 0 || touchEndX === 0) {
                touchStartX = 0; touchEndX = 0; return;
            }
            if (deltaX < -swipeThreshold && currentSectionIndex < sectionOrder.length - 1) {
                scrollToSection(sectionOrder[currentSectionIndex + 1].replace('SectionWrapper', '-section'), true);
            } else if (deltaX > swipeThreshold && currentSectionIndex > 0) {
                scrollToSection(sectionOrder[currentSectionIndex - 1].replace('SectionWrapper', '-section'), true);
            }
            touchStartX = 0; touchEndX = 0;
        }
    }


    toggleAutoDeductOptions(); // For the create fund modal
    
    // Initial section display setup (can be simplified if scrollToSection handles it perfectly)
    sectionOrder.forEach(wrapperId => {
        const sectionWrapperElement = document.getElementById(wrapperId);
        if (!sectionWrapperElement) return;
        if (wrapperId === activeSectionWrapperId) { // activeSectionWrapperId is 'dashboardSectionWrapper' by default
            sectionWrapperElement.classList.add('active');
            // Ensure dashboard elements are correctly displayed
            if (wrapperId === 'dashboardSectionWrapper') {
                 const dashboardElementsToToggle = [
                    '.total-balance', '#dashboardGaugesContainer', '#toggleLogTransactionBtn',
                    '#monthlyIncomeCard', '#expenseFundsCard', '#investmentFundsCard',
                    '#transferFundsCard'
                ];
                dashboardElementsToToggle.forEach(selector => {
                    const el = sectionWrapperElement.querySelector(selector) || document.querySelector(selector);
                    if (el) el.style.display = (selector === '#dashboardGaugesContainer' ? 'flex' : 'block');
                });
                const currentDateDisplayCard = document.getElementById('currentDateDisplay')?.closest('.card');
                if (currentDateDisplayCard) currentDateDisplayCard.style.display = 'block';
            }
        } else {
            sectionWrapperElement.classList.remove('active');
            const mainContentId = wrapperId.replace('SectionWrapper', '-section');
            const mainContentDiv = document.getElementById(mainContentId);
            if(mainContentDiv) mainContentDiv.style.display = 'none';
        }
    });


    // Payment method radio button text update logic
    const paymentActionTextSpan = document.getElementById('paymentActionText');
    if (document.querySelector('input[name="paymentMethod"]')) {
        // ... (Keep your existing payment method radio listener logic) ...
         document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
            radio.addEventListener('change', function() { /* ... your logic ... */ });
        });
        const initiallyCheckedRadio = document.querySelector('input[name="paymentMethod"]:checked');
        if (initiallyCheckedRadio) initiallyCheckedRadio.dispatchEvent(new Event('change'));
    }

    // Initial render based on localStorage (onAuthStateChanged will override if in shared mode and logged in)
    render();

    const welcomeMessageElDOM = document.getElementById('welcomeMessage'); // Re-fetch after render potentially changes DOM
    if (welcomeMessageElDOM && userProfile) { // Use the global userProfile that was loaded from localStorage
         let initialDisplayName = (userProfile.name && userProfile.name !== 'Guest' && userProfile.name.trim() !== '') ? userProfile.name : 'Guest';
         welcomeMessageElDOM.textContent = `Welcome, ${initialDisplayName}!`;
    }


    const todayForImport = new Date();
    const currentMonthDataForImport = getCurrentMonthData(); // getCurrentMonthData uses global monthlyData
    if (currentMonthDataForImport && todayForImport.getDate() === 1 && !currentMonthDataForImport.fundsImported) {
        autoImportFundsForNewMonth().then(() => {});
    }

    if (localStorage.getItem('tutorialShown') !== 'true') {
        setTimeout(startTutorial, 700);
    }

    setupChatbotEventListeners();
});
