document.addEventListener('DOMContentLoaded', async () => {
    console.log("ANTIGRAVITY_STORAGE_READY");
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const depositForm = document.getElementById('deposit-form');
    
    // --- Folder Storage Utility ---
    const FolderStorage = {
        DB_NAME: 'DepositProDB',
        STORE_NAME: 'Settings',
        FILE_NAME: 'deposits_data.json',
        
        async getDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.DB_NAME, 1);
                request.onupgradeneeded = () => request.result.createObjectStore(this.STORE_NAME);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async saveHandle(handle) {
            const db = await this.getDB();
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).put(handle, 'folderHandle');
            return new Promise(r => tx.oncomplete = r);
        },

        async getHandle() {
            const db = await this.getDB();
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            return new Promise(r => {
                const req = tx.objectStore(this.STORE_NAME).get('folderHandle');
                req.onsuccess = () => r(req.result);
            });
        },

        async verifyPermission(handle, readWrite) {
            const options = {};
            if (readWrite) options.mode = 'readwrite';
            if ((await handle.queryPermission(options)) === 'granted') return true;
            if ((await handle.requestPermission(options)) === 'granted') return true;
            return false;
        },

        async saveToFile(data) {
            const handle = await this.getHandle();
            if (!handle) return false;
            try {
                if (!(await this.verifyPermission(handle, true))) return false;
                const fileHandle = await handle.getFileHandle(this.FILE_NAME, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(data, null, 2));
                await writable.close();
                console.log("Synced to folder file.");
                return true;
            } catch (e) {
                console.error("Save to file failed", e);
                return false;
            }
        },

        async loadFromFile() {
            const handle = await this.getHandle();
            if (!handle) return null;
            try {
                if (!(await this.verifyPermission(handle, false))) return null;
                const fileHandle = await handle.getFileHandle(this.FILE_NAME);
                const file = await fileHandle.getFile();
                const content = await file.text();
                return JSON.parse(content);
            } catch (e) {
                console.warn("No file found or load failed", e);
                return null;
            }
        }
    };

    let deposits = [];
    const localData = JSON.parse(localStorage.getItem('deposits') || '[]');
    
    // Attempt to load from folder
    const folderData = await FolderStorage.loadFromFile();
    if (folderData) {
        deposits = folderData;
        console.log("Loaded from Folder Storage");
    } else {
        deposits = localData;
    }

    // Migrate RD Data to include transactions ledger
    let needsSave = false;
    deposits.forEach(Math_random => {
        let d = Math_random;
        if (d.type === 'RD' && !d.transactions) {
            d.transactions = [];
            if (d.paidInstallments > 0) {
                let current = new Date(d.startDate);
                for (let i = 0; i < d.paidInstallments && i < d.months; i++) {
                    d.transactions.push({
                        date: current.toISOString().split('T')[0],
                        amount: d.amount
                    });
                    current.setMonth(current.getMonth() + 1);
                }
            }
            needsSave = true;
        }
    });
    if (needsSave) {
        localStorage.setItem('deposits', JSON.stringify(deposits));
        FolderStorage.saveToFile(deposits);
    }

    // Library Lazy Loader
    const loadedLibraries = new Set();
    async function loadLibrary(lib) {
        if (loadedLibraries.has(lib)) return;
        const libs = {
            jspdf: ['lib/jspdf.umd.min.js', 'lib/jspdf.plugin.autotable.min.js'],
            xlsx: ['lib/xlsx.full.min.js']
        };
        const urls = libs[lib];
        if (!urls) return;
        for (const url of urls) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        loadedLibraries.add(lib);
    }

    // Navigation Switcher
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewId = item.getAttribute('data-view');

            // Auto close mobile sidebar drawer
            const sidebarEl = document.querySelector('.sidebar');
            const overlayEl = document.getElementById('sidebar-overlay');
            if (sidebarEl && sidebarEl.classList.contains('mobile-open')) {
                sidebarEl.classList.remove('mobile-open');
                if (overlayEl) overlayEl.classList.remove('active');
            }

            // Update Active Nav
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Switch View
            views.forEach(v => v.style.display = 'none');
            const targetView = document.getElementById(viewId);
            targetView.style.display = 'block';

            if (viewId === 'dashboard') updateDashboard();
            if (viewId === 'manage-rd') renderManageRD();
            if (viewId === 'maturity-report') renderMaturityReport();
            if (viewId === 'upcoming-maturities') renderUpcomingMaturities(30); // Default 30
            if (viewId === 'customer-report') renderCustomerReport();
            if (viewId === 'interest-report') renderInterestReport();
            if (viewId === 'due-report') {
                const today = new Date().toISOString().split('T')[0];
                const dateInput = document.getElementById('due-upto-date');
                if (!dateInput.value) dateInput.value = today;
                renderDueReport(dateInput.value);
            }
            if (viewId === 'type-report') renderTypeReport();
            if (viewId === 'reference-report') renderReferenceReport();
            if (viewId === 'monthly-report') renderMonthlyReport();
            if (viewId === 'settings') renderSettings();
        });
    });

    // Password Security Logic
    const APP_PASSWORD_KEY = 'depositpro_password';

    function checkAppSecurity() {
        const savedPassword = localStorage.getItem(APP_PASSWORD_KEY);
        if (savedPassword) {
            const loginModal = document.getElementById('login-modal');
            loginModal.style.display = 'flex';
            document.querySelector('.sidebar').style.filter = 'blur(10px)';
            document.querySelector('.main-content').style.filter = 'blur(10px)';
            document.getElementById('login-password').focus();
        }
    }

    window.verifyLogin = () => {
        const input = document.getElementById('login-password');
        const error = document.getElementById('login-error');
        const savedPassword = localStorage.getItem(APP_PASSWORD_KEY);

        if (input.value === savedPassword) {
            document.getElementById('login-modal').style.display = 'none';
            document.querySelector('.sidebar').style.filter = 'none';
            document.querySelector('.main-content').style.filter = 'none';
            input.value = '';
            error.style.display = 'none';
        } else {
            error.style.display = 'block';
            input.value = '';
            input.focus();
        }
    };

    // Allow Enter key on login
    document.getElementById('login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyLogin();
    });

    async function renderSettings() {
        const area = document.getElementById('password-setup-area');
        const storageArea = document.getElementById('folder-storage-area');
        const savedPassword = localStorage.getItem(APP_PASSWORD_KEY);
        const folderHandle = await FolderStorage.getHandle();

        if (storageArea) {
            storageArea.innerHTML = `
                <div class="card" style="grid-column: span 2; margin-top: 20px; border: 1px dashed var(--primary-light);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3 style="display: flex; align-items: center; gap: 10px;">
                                <ion-icon name="folder-open-outline"></ion-icon> 
                                Project Folder Storage
                            </h3>
                            <p class="text-secondary" style="margin-top: 5px;">
                                ${folderHandle ? '🟢 Your data is synced to <strong>deposits_data.json</strong> in your folder.' : '🟡 Currently saving to browser memory only. Link folder for extra safety.'}
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="handleFolderLink()">
                            ${folderHandle ? 'Reconnect Folder' : 'Link Project Folder'}
                        </button>
                    </div>
                </div>
            `;
        }

        if (!savedPassword) {
            area.innerHTML = `
                <div class="form-group">
                    <label>Set New Password</label>
                    <input type="password" id="new-password" class="form-control" placeholder="Minimum 4 characters">
                </div>
                <button class="btn btn-primary" onclick="handlePasswordSetup('set')" style="width: 100%;">Set Password</button>
            `;
        } else {
            area.innerHTML = `
                <div class="form-group">
                    <label>Current Password</label>
                    <input type="password" id="current-password" class="form-control">
                </div>
                <div class="form-group">
                    <label>New Password</label>
                    <input type="password" id="change-new-password" class="form-control">
                </div>
                <button class="btn btn-primary" onclick="handlePasswordSetup('change')" style="width: 100%;">Update Password</button>
                <button class="btn btn-sm" onclick="handlePasswordSetup('remove')" style="width: 100%; margin-top: 10px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);">Remove Password</button>
            `;
        }
    }

    window.handleFolderLink = async () => {
        try {
            const handle = await window.showDirectoryPicker();
            await FolderStorage.saveHandle(handle);
            
            // Check if file exists in folder, if so, ask to load it
            const folderData = await FolderStorage.loadFromFile();
            if (folderData && folderData.length > 0) {
                if (confirm('Found existing data in the folder. Would you like to use it? (This will overwrite your current browser data)')) {
                    deposits = folderData;
                    localStorage.setItem('deposits', JSON.stringify(deposits));
                }
            } else {
                // If folder is empty, save current data to it
                await FolderStorage.saveToFile(deposits);
                alert('Project folder linked! A "deposits_data.json" file has been created in your folder.');
            }
            
            renderSettings();
            updateDashboard();
        } catch (e) {
            console.error(e);
            alert('Folder access cancelled or failed.');
        }
    };

    window.handlePasswordSetup = (action) => {
        const savedPassword = localStorage.getItem(APP_PASSWORD_KEY);

        if (action === 'set') {
            const pass = document.getElementById('new-password').value;
            if (pass.length < 4) return alert('Password must be at least 4 characters.');
            localStorage.setItem(APP_PASSWORD_KEY, pass);
            alert('Password set successfully! The app will now be protected on reload.');
            renderSettings();
        } else if (action === 'change') {
            const current = document.getElementById('current-password').value;
            const newPass = document.getElementById('change-new-password').value;
            if (current !== savedPassword) return alert('Incorrect current password.');
            if (newPass.length < 4) return alert('New password must be at least 4 characters.');
            localStorage.setItem(APP_PASSWORD_KEY, newPass);
            alert('Password updated successfully!');
            renderSettings();
        } else if (action === 'remove') {
            if (!confirm('Are you sure you want to remove password protection?')) return;
            const current = prompt('Enter current password to remove:');
            if (current === savedPassword) {
                localStorage.removeItem(APP_PASSWORD_KEY);
                alert('Password removed.');
                renderSettings();
            } else {
                alert('Incorrect password.');
            }
        }
    };

    let editId = null;

    function getCurrentBalance(d, toDate = new Date()) {
        if (d.type === 'RD') {
            return Calculations.generateRDLedger(d, toDate).finalBalance;
        }
        return d.amount;
    }

    // Autocomplete Datalists
    function updateAutocompleteSuggestions() {
        const customerList = document.getElementById('customer-suggestions');
        const depositList = document.getElementById('deposit-suggestions');
        if (!customerList || !depositList) return;

        const uniqueCustomers = [...new Set(deposits.map(d => d.customer).filter(Boolean))];
        const uniqueDeposits = [...new Set(deposits.map(d => d.name).filter(Boolean))];

        customerList.innerHTML = uniqueCustomers.map(c => `<option value="${c}">`).join('');
        depositList.innerHTML = uniqueDeposits.map(n => `<option value="${n}">`).join('');
    }

    updateAutocompleteSuggestions();


    // Backup & Restore listeners
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('import-file').addEventListener('change', importData);

    // Theme Switcher
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        const savedTheme = localStorage.getItem('theme') || 'default';
        themeSelect.value = savedTheme;
        document.body.setAttribute('data-theme', savedTheme);
        themeSelect.addEventListener('change', (e) => {
            const theme = e.target.value;
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        });
    }

    // Due Report date listener
    const dueUptoDateInput = document.getElementById('due-upto-date');
    if (dueUptoDateInput) {
        dueUptoDateInput.addEventListener('change', (e) => {
            renderDueReport(e.target.value);
        });
    }

    // Dashboard Drill-downs are now handled inline in the KPI card HTML (onclick attributes)

    // Sidebar Toggle Logic
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');

    // Restore state
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
        });
    }

    // Mobile Sidebar Toggle Logic
    const mobileToggleBtn = document.getElementById('mobile-sidebar-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileToggleBtn && sidebarOverlay) {
        mobileToggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            sidebarOverlay.classList.toggle('active');
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            sidebarOverlay.classList.remove('active');
        });
    }

    // Interest Drill-down is now handled via inline onclick on the KPI card

    function exportData() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(deposits));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `deposit_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    function importData(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (Array.isArray(imported)) {
                    deposits = imported;
                    localStorage.setItem('deposits', JSON.stringify(deposits));
                    FolderStorage.saveToFile(deposits); // Sync to folder
                    alert('Data restored successfully!');
                    updateDashboard();
                }
            } catch (err) {
                alert('Invalid backup file.');
            }
        };
        reader.readAsText(file);
    }

    // Live Preview Logic
    const previewFields = ['dep-amount', 'dep-rate', 'dep-start', 'dep-months', 'dep-type', 'dep-compounding'];
    previewFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateLivePreview);
    });

    function updateLivePreview() {
        const amount = parseFloat(document.getElementById('dep-amount').value) || 0;
        const rate = parseFloat(document.getElementById('dep-rate').value) || 0;
        const start = document.getElementById('dep-start').value;
        const months = parseInt(document.getElementById('dep-months').value) || 0;
        const type = document.getElementById('dep-type').value;
        const compounding = parseInt(document.getElementById('dep-compounding').value);

        if (!start || months <= 0) {
            document.getElementById('preview-maturity-date').textContent = '--';
            document.getElementById('preview-interest').textContent = '₹0';
            document.getElementById('preview-maturity-amount').textContent = '₹0';
            return;
        }

        let details;
        if (type === 'RD') {
            details = Calculations.calculateRD(amount, rate, months);
        } else if (type === 'DD') {
            details = Calculations.calculateDD(amount);
        } else {
            details = Calculations.calculateMaturity(amount, rate, months, compounding);
        }

        const maturityDate = Calculations.getMaturityDate(start, months).toISOString().split('T')[0];

        document.getElementById('preview-maturity-date').textContent = Calculations.formatDate(maturityDate);
        document.getElementById('preview-interest').textContent = `₹${details.interestEarned.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
        document.getElementById('preview-maturity-amount').textContent = `₹${details.maturityAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

        const currentTotalInterest = deposits.reduce((sum, d) => sum + d.interestEarned, 0);
        document.getElementById('preview-portfolio-total').textContent = `₹${(currentTotalInterest + details.interestEarned).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

        // Dynamic UI adjustment for DD and RD
        document.getElementById('compounding-group').style.display = type === 'DD' ? 'none' : 'block';

        const instGroup = document.getElementById('installment-day-group');
        const labelAmount = document.getElementById('label-amount');
        if (type === 'RD') {
            instGroup.style.display = 'block';
            labelAmount.textContent = 'Monthly Installment (₹)';
        } else {
            instGroup.style.display = 'none';
            labelAmount.textContent = 'Principal Amount (₹)';
        }
    }

    // Upcoming Maturity Filter Buttons
    document.querySelectorAll('.filter-mat').forEach(btn => {
        btn.addEventListener('click', () => {
            const days = parseInt(btn.getAttribute('data-days'));
            renderUpcomingMaturities(days);

            // Toggle active style
            document.querySelectorAll('.filter-mat').forEach(b => b.classList.remove('btn-primary'));
            document.querySelectorAll('.filter-mat').forEach(b => b.classList.add('btn-secondary'));
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        });
    });

    // Form Submission
    depositForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const depositData = {
            id: editId || Date.now(),
            customer: document.getElementById('dep-customer').value,
            name: document.getElementById('dep-name').value,
            type: document.getElementById('dep-type').value,
            accNo: document.getElementById('dep-acc-no').value,
            amount: parseFloat(document.getElementById('dep-amount').value),
            rate: parseFloat(document.getElementById('dep-rate').value),
            startDate: document.getElementById('dep-start').value,
            months: parseInt(document.getElementById('dep-months').value),
            compounding: parseInt(document.getElementById('dep-compounding').value),
            payout: document.getElementById('dep-payout').value,
            installmentDay: parseInt(document.getElementById('dep-installment-day').value) || 1,
            paidInstallments: 0 // Initialize for new deposits
        };

        // Calculate maturity details based on type
        let details;
        if (depositData.type === 'RD') {
            details = Calculations.calculateRD(depositData.amount, depositData.rate, depositData.months);
        } else if (depositData.type === 'DD') {
            details = Calculations.calculateDD(depositData.amount);
        } else {
            details = Calculations.calculateMaturity(depositData.amount, depositData.rate, depositData.months, depositData.compounding);
        }
        depositData.maturityAmount = details.maturityAmount;
        depositData.interestEarned = details.interestEarned;
        depositData.maturityDate = Calculations.getMaturityDate(depositData.startDate, depositData.months).toISOString().split('T')[0];

        if (editId) {
            const index = deposits.findIndex(d => d.id === editId);
            deposits[index] = depositData;
            editId = null;
            document.querySelector('#new-deposit h1').textContent = 'Open New Deposit';
        } else {
            deposits.push(depositData);
        }

        localStorage.setItem('deposits', JSON.stringify(deposits));
        FolderStorage.saveToFile(deposits); // Sync to folder
        updateAutocompleteSuggestions();
        alert('Deposit saved successfully!');
        depositForm.reset();
        document.querySelector('[data-view="dashboard"]').click();
    });

    function renderUpcomingMaturities(days) {
        const table = document.getElementById('upcoming-table');
        const tbody = table.querySelector('tbody');
        let tfoot = table.querySelector('tfoot');
        if (!tfoot) {
            tfoot = document.createElement('tfoot');
            table.appendChild(tfoot);
        }
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const threshold = new Date();
        threshold.setDate(threshold.getDate() + days);
        threshold.setHours(23, 59, 59, 999);

        const filtered = deposits.filter(d => {
            const matDate = new Date(d.maturityDate + "T00:00:00");
            return matDate >= today && matDate <= threshold;
        }).sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));

        let totalProceeds = 0;

        filtered.forEach(d => {
            totalProceeds += d.maturityAmount;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="clickable" onclick="showCustomerDetails('${d.customer}')">${d.customer}</td>
                <td class="clickable" onclick="showDepositModal(${d.id})">${d.name}</td>
                <td>${Calculations.formatDate(d.maturityDate)}</td>
                <td>₹${d.maturityAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td style="color: var(--primary-light); cursor: pointer;"><ion-icon name="call-outline"></ion-icon> Call</td>
            `;
            tbody.appendChild(tr);
        });

        if (filtered.length > 0) {
            tfoot.innerHTML = `
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td colspan="3" style="text-align: right;">Total Upcoming Proceeds:</td>
                    <td style="color: var(--accent);">₹${totalProceeds.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td></td>
                </tr>
            `;
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">No deposits maturing in this period.</td></tr>';
        }
    }

    function updateDashboard() {
        const now = new Date();

        // ---- Date/Greeting header ----
        const greetEl = document.getElementById('fin-greeting');
        const dateEl = document.getElementById('fin-date-display');
        if (greetEl) {
            const h = now.getHours();
            greetEl.textContent = h < 12 ? 'Good Morning 🌅' : h < 17 ? 'Good Afternoon ☀️' : 'Good Evening 🌙';
        }
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }

        // ---- Compute KPIs ----
        let totalInvested = 0, totalInterest = 0, totalMaturityAmt = 0;
        let activeCount = 0, maturedCount = 0;
        let totalWeightedRate = 0, totalOutstandingRD = 0;
        let nextMaturity = null, nextMaturityDays = null;
        let rdCount = 0;

        const typeMap = { FD: 0, RD: 0, DD: 0 };

        for (const d of deposits) {
            const matDate = new Date(d.maturityDate + 'T00:00:00');
            const currentBal = getCurrentBalance(d, now);
            totalInvested += currentBal;
            totalInterest += (d.interestEarned || 0);
            totalMaturityAmt += (d.maturityAmount || 0);
            totalWeightedRate += (currentBal * d.rate);
            typeMap[d.type] = (typeMap[d.type] || 0) + currentBal;

            if (matDate >= now) {
                activeCount++;
                const daysLeft = Math.ceil((matDate - now) / 86400000);
                if (!nextMaturity || matDate < nextMaturity) {
                    nextMaturity = matDate;
                    nextMaturityDays = daysLeft;
                }
            } else {
                maturedCount++;
            }

            if (d.type === 'RD') {
                rdCount++;
                const start = new Date(d.startDate);
                let monthsElapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                if (now.getDate() >= (d.installmentDay || 1)) monthsElapsed += 1;
                const expectedPaid = Math.min(monthsElapsed, d.months);
                const gap = expectedPaid - (d.paidInstallments || 0);
                if (gap > 0) totalOutstandingRD += (gap * d.amount);
            }
        }

        const avgRate = totalInvested > 0 ? (totalWeightedRate / totalInvested) : 0;
        const fmt = (v) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 });

        // ---- Update KPI Card Values ----
        document.getElementById('total-investment').textContent = `₹${fmt(totalInvested)}`;
        document.getElementById('total-interest').textContent = `₹${fmt(totalInterest)}`;
        document.getElementById('active-deposits').textContent = activeCount;
        document.getElementById('avg-interest-rate').textContent = `${avgRate.toFixed(2)}%`;
        document.getElementById('next-maturity').textContent = nextMaturity ? Calculations.formatDate(nextMaturity.toISOString().split('T')[0]) : '--';
        document.getElementById('outstanding-rd').textContent = `₹${fmt(totalOutstandingRD)}`;

        // KPI sub-labels
        const kpiMatEl = document.getElementById('kpi-total-maturity-val');
        if (kpiMatEl) kpiMatEl.textContent = `Maturity: ₹${fmt(totalMaturityAmt)}`;
        const kpiRateEl = document.getElementById('kpi-avg-rate-val');
        if (kpiRateEl) kpiRateEl.textContent = `Avg Rate: ${avgRate.toFixed(2)}%`;
        const kpiMaturedEl = document.getElementById('kpi-matured-val');
        if (kpiMaturedEl) kpiMaturedEl.textContent = `Matured: ${maturedCount}`;
        const kpiDaysEl = document.getElementById('kpi-days-left');
        if (kpiDaysEl) kpiDaysEl.textContent = nextMaturityDays !== null ? `${nextMaturityDays} days remaining` : '-- days remaining';
        const kpiRdEl = document.getElementById('kpi-rd-count');
        if (kpiRdEl) kpiRdEl.textContent = `${rdCount} RDs tracked`;

        // ---- Radial Active Deposits ----
        const radialEl = document.getElementById('radial-active');
        if (radialEl) {
            const total = activeCount + maturedCount;
            const pct = total > 0 ? activeCount / total : 0;
            const circ = 2 * Math.PI * 24;
            setTimeout(() => {
                radialEl.setAttribute('stroke-dasharray', `${pct * circ} ${circ}`);
            }, 300);
        }

        // ---- Rate Bar ----
        const rateBar = document.getElementById('fin-rate-bar');
        if (rateBar) {
            setTimeout(() => {
                rateBar.style.width = `${Math.min(avgRate / 15 * 100, 100)}%`;
            }, 400);
        }

        // ---- Gauge ----
        const gaugeArc = document.getElementById('gauge-arc');
        const gaugeNeedle = document.getElementById('gauge-needle');
        const gaugeTxt = document.getElementById('gauge-center-text');
        const gaugeStars = document.getElementById('gauge-stars');
        if (gaugeArc && gaugeNeedle) {
            const maxRate = 15;
            const pct = Math.min(avgRate / maxRate, 1);
            const arcLen = 251; // half-circle path length approx
            setTimeout(() => {
                gaugeArc.setAttribute('stroke-dasharray', `${pct * arcLen} ${arcLen}`);
                const deg = -90 + pct * 180;
                gaugeNeedle.style.transform = `rotate(${deg}deg)`;
                if (gaugeTxt) gaugeTxt.textContent = `${avgRate.toFixed(1)}%`;
                if (gaugeStars) {
                    const stars = Math.round(pct * 5);
                    gaugeStars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
                }
            }, 400);
        }

        // ---- Donut Chart ----
        const circumference = 2 * Math.PI * 75; // ≈ 471
        const totalForDonut = totalInvested || 1;
        let offsetFD = 0, dashFD = (typeMap.FD / totalForDonut) * circumference;
        let dashRD = (typeMap.RD / totalForDonut) * circumference;
        let dashDD = (typeMap.DD / totalForDonut) * circumference;

        const donutFD = document.getElementById('donut-fd');
        const donutRD = document.getElementById('donut-rd');
        const donutDD = document.getElementById('donut-dd');
        const donutCtr = document.getElementById('donut-center-val');

        if (donutFD && donutRD && donutDD) {
            setTimeout(() => {
                donutFD.setAttribute('stroke-dasharray', `${dashFD} ${circumference - dashFD}`);
                donutFD.setAttribute('stroke-dashoffset', '0');
                donutRD.setAttribute('stroke-dasharray', `${dashRD} ${circumference - dashRD}`);
                donutRD.setAttribute('stroke-dashoffset', `${-dashFD}`);
                donutDD.setAttribute('stroke-dasharray', `${dashDD} ${circumference - dashDD}`);
                donutDD.setAttribute('stroke-dashoffset', `${-(dashFD + dashRD)}`);
                if (donutCtr) donutCtr.textContent = totalInvested > 0 ? `₹${(totalInvested/100000).toFixed(1)}L` : '₹0';
            }, 200);
        }

        // Legend values
        const legFD = document.getElementById('legend-fd-val');
        const legRD = document.getElementById('legend-rd-val');
        const legDD = document.getElementById('legend-dd-val');
        if (legFD) legFD.textContent = `₹${fmt(typeMap.FD)}`;
        if (legRD) legRD.textContent = `₹${fmt(typeMap.RD || 0)}`;
        if (legDD) legDD.textContent = `₹${fmt(typeMap.DD || 0)}`;

        // ---- Maturity Bar Chart (Next 6 Months) ----
        const barChart = document.getElementById('maturity-bar-chart');
        if (barChart) {
            const monthBuckets = {};
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            for (let i = 0; i < 6; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                monthBuckets[key] = { label: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, total: 0, count: 0 };
            }
            deposits.forEach(d => {
                const mKey = d.maturityDate ? d.maturityDate.slice(0, 7) : null;
                if (mKey && monthBuckets[mKey]) {
                    monthBuckets[mKey].total += (d.maturityAmount || 0);
                    monthBuckets[mKey].count++;
                }
            });
            const keys = Object.keys(monthBuckets);
            const maxVal = Math.max(...keys.map(k => monthBuckets[k].total), 1);

            if (keys.every(k => monthBuckets[k].total === 0)) {
                barChart.innerHTML = '<div class="fin-bar-empty">No upcoming maturities in next 6 months</div>';
            } else {
                barChart.innerHTML = keys.map(k => {
                    const b = monthBuckets[k];
                    const pct = (b.total / maxVal) * 130;
                    const amtStr = b.total > 0 ? `₹${(b.total/1000).toFixed(0)}K` : '';
                    return `<div class="fin-bar-col">
                        <div class="fin-bar-fill" style="height:${Math.max(pct, b.total > 0 ? 8 : 0)}px" data-amt="${amtStr}"></div>
                        <div class="fin-bar-label">${b.label}${b.count ? `<br><span style='color:var(--primary-light);font-weight:700'>${b.count}</span>` : ''}</div>
                    </div>`;
                }).join('');
            }
        }

        // ---- Top Deposits by Value ----
        const topList = document.getElementById('top-deposits-list');
        if (topList) {
            const sorted = [...deposits].sort((a, b) => b.amount - a.amount).slice(0, 5);
            const maxAmt = sorted.length > 0 ? sorted[0].amount : 1;
            if (sorted.length === 0) {
                topList.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px 0">No deposits yet. Click "Open Deposit" to add one.</div>';
            } else {
                topList.innerHTML = sorted.map((d, i) => {
                    const pct = (d.amount / maxAmt) * 100;
                    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
                    const isMatured = new Date(d.maturityDate + 'T00:00:00') < now;
                    const badgeColor = isMatured ? '#f59e0b' : '#10b981';
                    return `<div class="fin-deposit-item" onclick="showDepositModal(${d.id})">
                        <div class="fin-deposit-rank ${rankClass}">${medal}</div>
                        <div class="fin-deposit-info">
                            <div class="fin-deposit-name">${d.name || '--'}</div>
                            <div class="fin-deposit-customer">${d.customer || '--'} · <span style="color:${badgeColor};font-weight:600">${isMatured ? 'Matured' : 'Active'}</span> · ${d.type} · ${d.rate}%</div>
                        </div>
                        <div class="fin-deposit-bar-wrap"><div class="fin-deposit-bar-fill" style="width:${pct}%"></div></div>
                        <div class="fin-deposit-amount">₹${fmt(d.amount)}</div>
                    </div>`;
                }).join('');
            }
        }

        // ---- Quick Stats Panel ----
        const statsPanel = document.getElementById('quick-stats-panel');
        if (statsPanel) {
            const roi = totalInvested > 0 ? ((totalInterest / totalInvested) * 100).toFixed(2) : '0.00';
            const totalYield = totalInvested > 0 ? totalMaturityAmt - totalInvested : 0;
            const maturingThis30 = deposits.filter(d => {
                const md = new Date(d.maturityDate + 'T00:00:00');
                const diff = (md - now) / 86400000;
                return diff >= 0 && diff <= 30;
            }).length;

            statsPanel.innerHTML = [
                ['💼 Total Deposits', deposits.length, 'blue'],
                ['📈 Return on Invest.', `${roi}%`, parseFloat(roi) >= 7 ? 'green' : parseFloat(roi) >= 4 ? 'amber' : 'red'],
                ['🏦 Maturity Value', `₹${fmt(totalMaturityAmt)}`, 'green'],
                ['💰 Total Profit', `₹${fmt(totalYield)}`, 'green'],
                ['⏰ Maturing (30d)', maturingThis30, maturingThis30 > 0 ? 'amber' : 'blue'],
                ['📂 RD Deposits', rdCount, 'blue'],
                ['✅ Active', activeCount, 'green'],
                ['🔴 Matured', maturedCount, maturedCount > 0 ? 'amber' : 'blue'],
            ].map(([label, val, cls]) =>
                `<div class="fin-stat-item">
                    <span class="fin-stat-label">${label}</span>
                    <span class="fin-stat-val ${cls}">${val}</span>
                </div>`
            ).join('');
        }
    }


    function renderMaturityReport() {
        const table = document.getElementById('maturity-table');
        const tbody = table.querySelector('tbody');
        let tfoot = table.querySelector('tfoot');
        if (!tfoot) {
            tfoot = document.createElement('tfoot');
            table.appendChild(tfoot);
        }
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        const sorted = [...deposits].sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));
        let totalPrincipal = 0;
        let totalMaturity = 0;

        sorted.forEach(d => {
            const currentBal = getCurrentBalance(d);
            totalPrincipal += currentBal;
            totalMaturity += d.maturityAmount;
            const isMatured = new Date(d.maturityDate) < new Date();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="clickable" onclick="showDepositModal(${d.id})">${d.name}</td>
                <td class="clickable" onclick="showCustomerDetails('${d.customer}')">${d.customer || '--'}</td>
                <td><span class="badge" style="background: rgba(99,102,241,0.1)">${d.type}</span></td>
                <td>${d.accNo || '--'}</td>
                <td>
                    ₹${currentBal.toLocaleString()}
                    ${d.type === 'RD' ? `<br><small style="color: var(--primary-light)">Paid: ${d.paidInstallments || 0}/${d.months}</small>` : ''}
                </td>
                <td>${Calculations.formatDate(d.maturityDate)}</td>
                <td style="font-weight: 600;">₹${d.maturityAmount.toLocaleString()}</td>
                <td><span class="badge ${isMatured ? 'badge-matured' : 'badge-active'}">${isMatured ? 'Matured' : 'Active'}</span></td>
                <td style="text-align: right;">
                    <button class="btn btn-secondary btn-sm" onclick="editDeposit(${d.id})" style="padding: 4px 8px; font-size: 0.8rem; margin-right: 5px;">Edit</button>
                    <button class="btn btn-sm" onclick="deleteDeposit(${d.id})" style="padding: 4px 8px; font-size: 0.8rem; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);">Del</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (sorted.length > 0) {
            tfoot.innerHTML = `
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td colspan="4" style="text-align: right;">TOTAL PORTFOLIO:</td>
                    <td>₹${totalPrincipal.toLocaleString()}</td>
                    <td></td>
                    <td style="color: var(--primary-light);">₹${totalMaturity.toLocaleString()}</td>
                    <td colspan="2"></td>
                </tr>
            `;
        }
    }

    window.editDeposit = (id) => {
        const d = deposits.find(dep => dep.id === id);
        if (!d) return;

        editId = id;
        document.querySelector('#new-deposit h1').textContent = 'Edit Deposit';

        document.getElementById('dep-customer').value = d.customer;
        document.getElementById('dep-name').value = d.name;
        document.getElementById('dep-type').value = d.type;
        document.getElementById('dep-acc-no').value = d.accNo;
        document.getElementById('dep-amount').value = d.amount;
        document.getElementById('dep-rate').value = d.rate;
        document.getElementById('dep-start').value = d.startDate;
        document.getElementById('dep-months').value = d.months;
        document.getElementById('dep-compounding').value = d.compounding;
        document.getElementById('dep-payout').value = d.payout;
        document.getElementById('dep-installment-day').value = d.installmentDay || '';

        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('[data-view="new-deposit"]').classList.add('active');
        views.forEach(v => v.style.display = 'none');
        document.getElementById('new-deposit').style.display = 'block';
        updateLivePreview();
    };

    window.deleteDeposit = (id) => {
        if (!confirm('Are you sure you want to delete this deposit?')) return;
        deposits = deposits.filter(d => d.id !== id);
        localStorage.setItem('deposits', JSON.stringify(deposits));
        FolderStorage.saveToFile(deposits); // Sync to folder
        renderMaturityReport();
        updateDashboard();
    };

    function renderCustomerReport() {
        const table = document.getElementById('customer-table');
        const tbody = table.querySelector('tbody');
        let tfoot = table.querySelector('tfoot');
        if (!tfoot) {
            tfoot = document.createElement('tfoot');
            table.appendChild(tfoot);
        }
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        const grouped = deposits.reduce((acc, d) => {
            const name = d.customer || 'Unknown';
            if (!acc[name]) {
                acc[name] = { count: 0, totalPrincipal: 0, totalInterest: 0, totalMaturity: 0, weightedRateSum: 0 };
            }
            const currentBal = getCurrentBalance(d);
            acc[name].count++;
            acc[name].totalPrincipal += currentBal;
            acc[name].totalInterest += d.interestEarned;
            acc[name].totalMaturity += d.maturityAmount;
            acc[name].weightedRateSum += (currentBal * d.rate);
            return acc;
        }, {});

        let grandPrincipal = 0;
        let grandInterest = 0;
        let grandMaturity = 0;
        let totalCount = 0;

        Object.keys(grouped).sort().forEach(customer => {
            const g = grouped[customer];
            grandPrincipal += g.totalPrincipal;
            grandInterest += g.totalInterest;
            grandMaturity += g.totalMaturity;
            totalCount += g.count;

            const avgRate = g.totalPrincipal > 0 ? (g.weightedRateSum / g.totalPrincipal) : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600;" class="clickable" onclick="showCustomerDetails('${customer}')">${customer}</td>
                <td>${g.count}</td>
                <td>₹${g.totalPrincipal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td>${avgRate.toFixed(2)}%</td>
                <td>₹${g.totalInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td style="color: var(--primary-light); font-weight: 700;">₹${g.totalMaturity.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
            `;
            tbody.appendChild(tr);
        });

        if (Object.keys(grouped).length > 0) {
            tfoot.innerHTML = `
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td style="text-align: right;">Grand Total:</td>
                    <td>${totalCount}</td>
                    <td>₹${grandPrincipal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td></td>
                    <td>₹${grandInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td style="color: var(--primary-light);">₹${grandMaturity.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                </tr>
            `;
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No data available.</td></tr>';
        }
    }

    // --- MANAGE RD LOGIC ---
    let currentRdAectId = null;

    window.renderManageRD = () => {
        const table = document.getElementById('manage-rd-table');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = '';
        
        const rdDeposits = deposits.filter(d => d.type === 'RD');

        rdDeposits.forEach(d => {
            const isMatured = new Date(d.maturityDate) < new Date();
            const txs = d.transactions || [];
            const pdCount = txs.length;
            
            // Recompute balance based on actual ledger
            const ledgerResult = Calculations.generateRDLedger(d);
            const bal = ledgerResult.finalBalance;
            
            // Save dynamically calculated interest/amount back if we need it for reporting
            // However, typical app logic uses `interestEarned` & `maturityAmount` as projected unless otherwise specified.
            // But we will show actual balance here.

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${d.accNo || '--'}</strong><br><small class="text-secondary">${d.name}</small></td>
                <td>${d.customer}</td>
                <td>₹${d.amount.toLocaleString('en-IN')}</td>
                <td><span class="badge" style="${pdCount >= d.months ? 'background: #22c55e;' : ''}">${pdCount} / ${d.months}</span></td>
                <td>₹${bal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td style="text-align: right; display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="btn btn-primary btn-sm" onclick="openRdLedger(${d.id})" style="padding: 6px 10px;">Ledger</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (rdDeposits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No Recurring Deposits Found.</td></tr>';
        }
    };

    window.openRdLedger = (id) => {
        currentRdAectId = id;
        const d = deposits.find(dep => dep.id === id);
        if (!d) return;

        document.getElementById('rd-ledger-modal').style.display = 'flex';
        document.getElementById('rd-ledger-title').textContent = `RD Ledger: ${d.accNo || d.name}`;
        document.getElementById('rd-ledger-subtitle').textContent = `Customer: ${d.customer} | Installment: ₹${d.amount}`;
        
        // Default new date to today
        document.getElementById('rd-new-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('rd-new-amount').value = d.amount;

        refreshRdLedgerTable(d);
    };

    window.closeRdLedger = () => {
        document.getElementById('rd-ledger-modal').style.display = 'none';
        currentRdAectId = null;
    };

    window.addRdPayment = () => {
        if (!currentRdAectId) return;
        const d = deposits.find(dep => dep.id === currentRdAectId);
        if (!d) return;

        const dateStr = document.getElementById('rd-new-date').value;
        const amount = parseFloat(document.getElementById('rd-new-amount').value);

        if (!dateStr || !amount || amount <= 0) {
            return alert('Please enter valid date and amount.');
        }

        if (!d.transactions) d.transactions = [];
        d.transactions.push({
            date: dateStr,
            amount: amount
        });

        // Update tracking metadata
        d.paidInstallments = d.transactions.length;

        // Save
        localStorage.setItem('deposits', JSON.stringify(deposits));
        FolderStorage.saveToFile(deposits);

        alert('Installment added successfully!');
        refreshRdLedgerTable(d);
        if (document.getElementById('manage-rd').style.display !== 'none') {
            renderManageRD();
        }
        updateDashboard();
    };

    function refreshRdLedgerTable(d) {
        const tbody = document.querySelector('#rd-ledger-table tbody');
        tbody.innerHTML = '';
        
        document.getElementById('rd-ledger-total-interest').textContent = "Total Capitalized Interest: ₹0";

        const ledgerResult = Calculations.generateRDLedger(d);
        
        ledgerResult.ledger.forEach(row => {
            const tr = document.createElement('tr');
            if (row.isInterest) {
                tr.style.background = 'rgba(99,102,241,0.05)';
                tr.style.fontWeight = '500';
            }
            tr.innerHTML = `
                <td>${Calculations.formatDate(row.date)}</td>
                <td style="${row.isInterest ? 'color: var(--accent);' : ''}">${row.particulars}</td>
                <td style="text-align: right; color: #ef4444;">${row.debit > 0 ? '₹'+row.debit.toLocaleString('en-IN') : '--'}</td>
                <td style="text-align: right; color: #22c55e;">${row.credit > 0 ? '₹'+row.credit.toLocaleString('en-IN') : '--'}</td>
                <td style="text-align: right; font-weight: 600;">₹${row.balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('rd-ledger-total-interest').textContent = `Total Capitalized Interest: ₹${ledgerResult.totalInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    }

    window.showCustomerDetails = (name) => {
        const filtered = deposits.filter(d => d.customer === name);
        const totalInvested = filtered.reduce((sum, d) => sum + getCurrentBalance(d), 0);
        const totalInterest = filtered.reduce((sum, d) => sum + d.interestEarned, 0);
        const totalMaturity = filtered.reduce((sum, d) => sum + d.maturityAmount, 0);
        const totalWeightedRate = filtered.reduce((sum, d) => sum + (getCurrentBalance(d) * d.rate), 0);
        const avgRate = totalInvested > 0 ? (totalWeightedRate / totalInvested) : 0;

        document.getElementById('details-customer-name').textContent = `Customer: ${name}`;
        const header = document.querySelector('#customer-details .header p');
        header.innerHTML = `Showing ${filtered.length} deposits for this customer. <strong style="color: var(--accent); margin-left: 10px;">Avg. Interest Rate: ${avgRate.toFixed(2)}%</strong>`;

        const table = document.getElementById('customer-details-table');
        const tbody = table.querySelector('tbody');
        let tfoot = table.querySelector('tfoot');
        if (!tfoot) {
            tfoot = document.createElement('tfoot');
            table.appendChild(tfoot);
        }
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        filtered.forEach(d => {
            const isMatured = new Date(d.maturityDate) < new Date();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.accNo}</td>
                <td class="clickable" onclick="showDepositModal(${d.id})">${d.name}</td>
                <td><span class="badge" style="background: rgba(99,102,241,0.1)">${d.type}</span></td>
                <td>₹${getCurrentBalance(d).toLocaleString()}</td>
                <td>₹${d.interestEarned.toLocaleString()}</td>
                <td>${Calculations.formatDate(d.maturityDate)}</td>
                <td><span class="badge ${isMatured ? 'badge-matured' : 'badge-active'}">${isMatured ? 'Matured' : 'Active'}</span></td>
            `;
            tbody.appendChild(tr);
        });

        if (filtered.length > 0) {
            tfoot.innerHTML = `
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td colspan="3" style="text-align: right;">Customer Totals:</td>
                    <td>₹${totalInvested.toLocaleString()}</td>
                    <td>₹${totalInterest.toLocaleString()}</td>
                    <td></td>
                    <td style="color: var(--primary-light);">₹${totalMaturity.toLocaleString()}</td>
                </tr>
            `;
        }

        // Setup Export Buttons
        document.getElementById('btn-customer-pdf').onclick = () => downloadCustomerDetailsPDF(name);
        document.getElementById('btn-customer-excel').onclick = () => downloadCustomerDetailsExcel(name);

        views.forEach(v => v.style.display = 'none');
        document.getElementById('customer-details').style.display = 'block';
    };

    window.downloadCustomerDetailsPDF = async (name) => {
        await loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const filtered = deposits.filter(d => d.customer === name).sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));

        doc.setFontSize(18);
        doc.text(`Customer Investment Report: ${name}`, 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

        const rows = filtered.map(d => [
            d.accNo || '--',
            d.name,
            d.type,
            `Rs. ${getCurrentBalance(d).toLocaleString()}`,
            `${d.rate}%`,
            Calculations.formatDate(d.startDate),
            Calculations.formatDate(d.maturityDate),
            `Rs. ${d.interestEarned.toLocaleString()}`,
            `Rs. ${d.maturityAmount.toLocaleString()}`
        ]);

        const totalPrincipal = filtered.reduce((sum, d) => sum + getCurrentBalance(d), 0);
        const totalInterest = filtered.reduce((sum, d) => sum + d.interestEarned, 0);
        const totalMaturity = filtered.reduce((sum, d) => sum + d.maturityAmount, 0);

        rows.push([
            '', '', 'TOTALS',
            `Rs. ${totalPrincipal.toLocaleString()}`,
            '', '', '',
            `Rs. ${totalInterest.toLocaleString()}`,
            `Rs. ${totalMaturity.toLocaleString()}`
        ]);

        doc.autoTable({
            head: [['Acc No', 'Deposit Name', 'Type', 'Principal', 'Rate', 'Start', 'Maturity', 'Interest', 'Maturity Amt']],
            body: rows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            didDrawCell: (data) => {
                if (data.row.index === rows.length - 1) {
                    doc.setFont(undefined, 'bold');
                }
            }
        });

        doc.save(`customer_report_${name.replace(/\s+/g, '_')}.pdf`);
    };

    window.downloadCustomerDetailsExcel = async (name) => {
        await loadLibrary('xlsx');
        const filtered = deposits.filter(d => d.customer === name).sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));

        const data = filtered.map(d => ({
            'Account No': d.accNo || '--',
            'Deposit Name': d.name,
            'Type': d.type,
            'Principal': getCurrentBalance(d),
            'Rate (%)': d.rate,
            'Start Date': d.startDate,
            'Maturity Date': d.maturityDate,
            'Interest Earned': d.interestEarned,
            'Maturity Amount': d.maturityAmount
        }));

        const totalPrincipal = filtered.reduce((sum, d) => sum + d.amount, 0);
        const totalInterest = filtered.reduce((sum, d) => sum + d.interestEarned, 0);
        const totalMaturity = filtered.reduce((sum, d) => sum + d.maturityAmount, 0);

        data.push({
            'Account No': 'TOTALS',
            'Deposit Name': '',
            'Type': '',
            'Principal': totalPrincipal,
            'Rate (%)': '',
            'Start Date': '',
            'Maturity Date': '',
            'Interest Earned': totalInterest,
            'Maturity Amount': totalMaturity
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Customer Deposits");
        XLSX.writeFile(wb, `customer_report_${name.replace(/\s+/g, '_')}.xlsx`);
    };

    window.showDepositModal = (id) => {
        const d = deposits.find(dep => dep.id === id);
        if (!d) return;

        const currentBal = getCurrentBalance(d);
        content.innerHTML = `
            <div class="detail-row"><span class="detail-label">Customer Name</span><span class="detail-value">${d.customer}</span></div>
            <div class="detail-row"><span class="detail-label">Reference Name</span><span class="detail-value">${d.name}</span></div>
            <div class="detail-row"><span class="detail-label">Account Number</span><span class="detail-value">${d.accNo}</span></div>
            <div class="detail-row"><span class="detail-label">Deposit Type</span><span class="detail-value">${d.type}</span></div>
            <div class="detail-row"><span class="detail-label">${d.type === 'RD' ? 'Monthly Installment' : 'Principal Amount'}</span><span class="detail-value">₹${d.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
            ${d.type === 'RD' ? `<div class="detail-row"><span class="detail-label">Current Balance</span><span class="detail-value" style="font-weight:700; color:var(--accent);">₹${currentBal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>` : ''}
            <div class="detail-row"><span class="detail-label">Interest Rate</span><span class="detail-value">${d.rate}%</span></div>
            <div class="detail-row"><span class="detail-label">Start Date</span><span class="detail-value">${Calculations.formatDate(d.startDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">${d.months} Months</span></div>
            <div class="detail-row"><span class="detail-label">Maturity Date</span><span class="detail-value">${Calculations.formatDate(d.maturityDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Interest Earned</span><span class="detail-value" style="color: var(--accent);">₹${d.interestEarned.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
            <div class="detail-row"><span class="detail-label">Maturity Amount</span><span class="detail-value" style="color: var(--primary-light);">₹${d.maturityAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
        `;

        if (d.type === 'RD') {
            const paid = d.paidInstallments || 0;
            const total = d.months;
            content.innerHTML += `
                <div style="margin-top: 20px; padding: 15px; background: rgba(99, 102, 241, 0.05); border-radius: 8px; border: 1px solid var(--border);">
                    <h4 style="margin-bottom: 10px; color: var(--primary-light);">RD Installment Status</h4>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span>Paid: <strong>${paid}</strong> / ${total} Months</span>
                        <div style="flex: 1; height: 8px; background: var(--border); border-radius: 4px; margin: 0 15px; position: relative; overflow: hidden;">
                            <div style="position: absolute; top: 0; left: 0; height: 100%; width: ${(paid / total) * 100}%; background: var(--primary); transition: width 0.3s;"></div>
                        </div>
                        <span style="font-weight: 700;">${Math.round((paid / total) * 100)}%</span>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button class="btn btn-sm" onclick="recordRDAmount(${d.id})" style="background: var(--primary); color: #fff; font-size: 0.8rem;">+ Mark Month Paid</button>
                        <button class="btn btn-sm" onclick="resetRDAmount(${d.id})" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); font-size: 0.8rem;">Reset</button>
                    </div>
                </div>
            `;
        }
        document.getElementById('deposit-modal').style.display = 'flex';
    };

    window.recordRDAmount = (id) => {
        const d = deposits.find(dep => dep.id === id);
        if (!d) return;
        if ((d.paidInstallments || 0) >= d.months) return alert('All installments are already paid.');


        d.paidInstallments = (d.paidInstallments || 0) + 1;
        localStorage.setItem('deposits', JSON.stringify(deposits));
        FolderStorage.saveToFile(deposits); // Sync to folder
        updateDashboard();
        showDepositModal(id);
    };

    window.resetRDAmount = (id) => {
        const d = deposits.find(dep => dep.id === id);
        if (!d) return;
        if (!confirm('Reset all paid installments?')) return;
        d.paidInstallments = 0;
        localStorage.setItem('deposits', JSON.stringify(deposits));
        FolderStorage.saveToFile(deposits); // Sync to folder
        updateDashboard();
        showDepositModal(id);
    };


    window.closeModal = () => {
        document.getElementById('deposit-modal').style.display = 'none';
    };

    function renderReferenceReport() {
        const table = document.getElementById('reference-table');
        const tbody = table.querySelector('tbody');
        let tfoot = table.querySelector('tfoot');
        if (!tfoot) {
            tfoot = document.createElement('tfoot');
            table.appendChild(tfoot);
        }
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        const grouped = deposits.reduce((acc, d) => {
            const name = d.name || 'Unknown';
            if (!acc[name]) {
                acc[name] = { count: 0, totalPrincipal: 0, totalInterest: 0, totalMaturity: 0, weightedRateSum: 0 };
            }
            const currentBal = getCurrentBalance(d);
            acc[name].count++;
            acc[name].totalPrincipal += currentBal;
            acc[name].totalInterest += d.interestEarned;
            acc[name].totalMaturity += d.maturityAmount;
            acc[name].weightedRateSum += (currentBal * d.rate);
            return acc;
        }, {});

        let grandPrincipal = 0;
        let grandInterest = 0;
        let grandMaturity = 0;
        let totalCount = 0;

        Object.keys(grouped).sort().forEach(name => {
            const g = grouped[name];
            grandPrincipal += g.totalPrincipal;
            grandInterest += g.totalInterest;
            grandMaturity += g.totalMaturity;
            totalCount += g.count;

            const avgRate = g.totalPrincipal > 0 ? (g.weightedRateSum / g.totalPrincipal) : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600;" class="clickable" onclick="showReferenceDetails('${name.replace(/'/g, "\\'")}')">${name}</td>
                <td>${g.count}</td>
                <td>₹${g.totalPrincipal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td>${avgRate.toFixed(2)}%</td>
                <td>₹${g.totalInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td style="color: var(--primary-light); font-weight: 700;">₹${g.totalMaturity.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
            `;
            tbody.appendChild(tr);
        });

        if (Object.keys(grouped).length > 0) {
            tfoot.innerHTML = `
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td style="text-align: right;">Grand Total:</td>
                    <td>${totalCount}</td>
                    <td>₹${grandPrincipal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td></td>
                    <td>₹${grandInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td style="color: var(--primary-light);">₹${grandMaturity.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                </tr>
            `;
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No data available.</td></tr>';
        }
    }

    window.showReferenceDetails = (name) => {
        const filtered = deposits.filter(d => d.name === name);
        const totalInvested = filtered.reduce((sum, d) => sum + getCurrentBalance(d), 0);
        const totalInterest = filtered.reduce((sum, d) => sum + d.interestEarned, 0);
        const totalMaturity = filtered.reduce((sum, d) => sum + d.maturityAmount, 0);
        const totalWeightedRate = filtered.reduce((sum, d) => sum + (getCurrentBalance(d) * d.rate), 0);
        const avgRate = totalInvested > 0 ? (totalWeightedRate / totalInvested) : 0;

        document.getElementById('details-reference-name').textContent = `Reference: ${name}`;
        const header = document.querySelector('#reference-details .header p');
        header.innerHTML = `Showing ${filtered.length} deposits for this reference. <strong style="color: var(--accent); margin-left: 10px;">Avg. Interest Rate: ${avgRate.toFixed(2)}%</strong>`;

        const table = document.getElementById('reference-details-table');
        const tbody = table.querySelector('tbody');
        let tfoot = table.querySelector('tfoot');
        if (!tfoot) {
            tfoot = document.createElement('tfoot');
            table.appendChild(tfoot);
        }
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        filtered.forEach(d => {
            const isMatured = new Date(d.maturityDate) < new Date();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="clickable" onclick="showCustomerDetails('${d.customer.replace(/'/g, "\\'")}')">${d.customer}</td>
                <td>${d.accNo}</td>
                <td><span class="badge" style="background: rgba(99,102,241,0.1)">${d.type}</span></td>
                <td>₹${getCurrentBalance(d).toLocaleString()}</td>
                <td>₹${d.interestEarned.toLocaleString()}</td>
                <td>${Calculations.formatDate(d.maturityDate)}</td>
                <td><span class="badge ${isMatured ? 'badge-matured' : 'badge-active'}">${isMatured ? 'Matured' : 'Active'}</span></td>
            `;
            tbody.appendChild(tr);
        });

        if (filtered.length > 0) {
            tfoot.innerHTML = `
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td colspan="3" style="text-align: right;">Reference Totals:</td>
                    <td>₹${totalInvested.toLocaleString()}</td>
                    <td>₹${totalInterest.toLocaleString()}</td>
                    <td></td>
                    <td style="color: var(--primary-light);">₹${totalMaturity.toLocaleString()}</td>
                </tr>
            `;
        }

        // Setup Export Buttons
        document.getElementById('btn-reference-pdf').onclick = () => downloadReferenceDetailsPDF(name);
        document.getElementById('btn-reference-excel').onclick = () => downloadReferenceDetailsExcel(name);

        views.forEach(v => v.style.display = 'none');
        document.getElementById('reference-details').style.display = 'block';
    };

    window.downloadReferenceSummaryPDF = async () => {
        await loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const grouped = deposits.reduce((acc, d) => {
            const name = d.name || 'Unknown';
            if (!acc[name]) acc[name] = { count: 0, principal: 0, interest: 0, maturity: 0, weightedRateSum: 0 };
            const currentBal = getCurrentBalance(d);
            acc[name].count++;
            acc[name].principal += currentBal;
            acc[name].interest += d.interestEarned;
            acc[name].maturity += d.maturityAmount;
            acc[name].weightedRateSum += (currentBal * d.rate);
            return acc;
        }, {});

        doc.setFontSize(18);
        doc.text('Reference-wise Summary Report', 14, 22);
        doc.setFontSize(11);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

        const rows = Object.keys(grouped).sort().map(name => {
            const g = grouped[name];
            return [
                name,
                g.count,
                `Rs. ${g.principal.toLocaleString()}`,
                `${(g.weightedRateSum / g.principal).toFixed(2)}%`,
                `Rs. ${g.interest.toLocaleString()}`,
                `Rs. ${g.maturity.toLocaleString()}`
            ];
        });

        const totals = {
            principal: deposits.reduce((s, d) => s + getCurrentBalance(d), 0),
            interest: deposits.reduce((s, d) => s + d.interestEarned, 0),
            maturity: deposits.reduce((s, d) => s + d.maturityAmount, 0)
        };

        rows.push([
            'GRAND TOTAL',
            deposits.length,
            `Rs. ${totals.principal.toLocaleString()}`,
            '',
            `Rs. ${totals.interest.toLocaleString()}`,
            `Rs. ${totals.maturity.toLocaleString()}`
        ]);

        doc.autoTable({
            head: [['Reference Name', 'Deposits', 'Principal', 'Avg Rate', 'Interest', 'Maturity Amt']],
            body: rows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            didDrawCell: (data) => {
                if (data.row.index === rows.length - 1) doc.setFont(undefined, 'bold');
            }
        });
        doc.save('reference_summary_report.pdf');
    };

    window.downloadReferenceSummaryExcel = async () => {
        await loadLibrary('xlsx');
        const grouped = deposits.reduce((acc, d) => {
            const name = d.name || 'Unknown';
            if (!acc[name]) acc[name] = { count: 0, principal: 0, interest: 0, maturity: 0, weightedRateSum: 0 };
            const currentBal = getCurrentBalance(d);
            acc[name].count++;
            acc[name].principal += currentBal;
            acc[name].interest += d.interestEarned;
            acc[name].maturity += d.maturityAmount;
            acc[name].weightedRateSum += (currentBal * d.rate);
            return acc;
        }, {});

        const data = Object.keys(grouped).sort().map(name => {
            const g = grouped[name];
            return {
                'Reference Name': name,
                'Deposits': g.count,
                'Principal': g.principal,
                'Avg Rate (%)': (g.weightedRateSum / g.principal).toFixed(2),
                'Interest': g.interest,
                'Maturity Amt': g.maturity
            };
        });

        const totals = {
            'Reference Name': 'GRAND TOTAL',
            'Deposits': deposits.length,
            'Principal': deposits.reduce((s, d) => s + getCurrentBalance(d), 0),
            'Avg Rate (%)': '',
            'Interest': deposits.reduce((s, d) => s + d.interestEarned, 0),
            'Maturity Amt': deposits.reduce((s, d) => s + d.maturityAmount, 0)
        };
        data.push(totals);

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reference Summary");
        XLSX.writeFile(wb, "reference_summary_report.xlsx");
    };

    window.downloadReferenceDetailsPDF = async (name) => {
        await loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const filtered = deposits.filter(d => d.name === name).sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));

        doc.setFontSize(18);
        doc.text(`Reference Details: ${name}`, 14, 22);
        doc.setFontSize(11);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

        const rows = filtered.map(d => [
            d.customer,
            d.accNo || '--',
            d.type,
            `Rs. ${getCurrentBalance(d).toLocaleString()}`,
            `${d.rate}%`,
            Calculations.formatDate(d.startDate),
            Calculations.formatDate(d.maturityDate),
            `Rs. ${d.interestEarned.toLocaleString()}`,
            `Rs. ${d.maturityAmount.toLocaleString()}`
        ]);

        const totalPrincipal = filtered.reduce((sum, d) => sum + getCurrentBalance(d), 0);
        const totalInterest = filtered.reduce((sum, d) => sum + d.interestEarned, 0);
        const totalMaturity = filtered.reduce((sum, d) => sum + d.maturityAmount, 0);

        rows.push(['TOTALS', '', '', `Rs. ${totalPrincipal.toLocaleString()}`, '', '', '', `Rs. ${totalInterest.toLocaleString()}`, `Rs. ${totalMaturity.toLocaleString()}`]);

        doc.autoTable({
            head: [['Customer', 'Acc No', 'Type', 'Principal', 'Rate', 'Start', 'Maturity', 'Interest', 'Maturity Amt']],
            body: rows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            didDrawCell: (data) => {
                if (data.row.index === rows.length - 1) doc.setFont(undefined, 'bold');
            }
        });
        doc.save(`reference_details_${name.replace(/\s+/g, '_')}.pdf`);
    };

    window.downloadReferenceDetailsExcel = async (name) => {
        await loadLibrary('xlsx');
        const filtered = deposits.filter(d => d.name === name).sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));

        const data = filtered.map(d => ({
            'Customer': d.customer,
            'Account No': d.accNo || '--',
            'Type': d.type,
            'Principal': getCurrentBalance(d),
            'Rate (%)': d.rate,
            'Start Date': d.startDate,
            'Maturity Date': d.maturityDate,
            'Interest Earned': d.interestEarned,
            'Maturity Amount': d.maturityAmount
        }));

        data.push({
            'Customer': 'TOTALS',
            'Account No': '',
            'Type': '',
            'Principal': filtered.reduce((sum, d) => sum + getCurrentBalance(d), 0),
            'Rate (%)': '',
            'Start Date': '',
            'Maturity Date': '',
            'Interest Earned': filtered.reduce((sum, d) => sum + d.interestEarned, 0),
            'Maturity Amount': filtered.reduce((sum, d) => sum + d.maturityAmount, 0)
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reference Details");
        XLSX.writeFile(wb, `reference_details_${name.replace(/\s+/g, '_')}.xlsx`);
    };

    window.closeModal = () => {
        document.getElementById('deposit-modal').style.display = 'none';
    };

    function renderInterestReport() {
        renderYearlyInterestSummary();
        renderCustomerInterestSummary();
    }

    function renderYearlyInterestSummary() {
        const container = document.getElementById('yearly-interest-summary');
        container.innerHTML = '';

        let consolidated = {};

        deposits.forEach(d => {
            const yearly = Calculations.calculateYearlyInterest(d.amount, d.rate, d.startDate, d.months, d.compounding, d.interestEarned);
            for (let fy in yearly) {
                consolidated[fy] = (consolidated[fy] || 0) + yearly[fy];
            }
        });

        let grandTotalInterest = 0;
        Object.keys(consolidated).forEach(fy => grandTotalInterest += consolidated[fy]);

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Financial Year (Apr-Mar)</th>
                    <th>Interest Accrued (Est.)</th>
                </tr>
            </thead>
            <tbody>
                ${Object.keys(consolidated).sort().reverse().map(fy => `
                    <tr class="clickable" onclick="showInterestDetails('${fy}')">
                        <td>FY ${fy} <small style="color: var(--primary-light); margin-left:10px;">(Click to view details)</small></td>
                        <td>₹${consolidated[fy].toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                `).join('')}
            </tbody>
            <tfoot>
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td style="text-align: right;">Lifetime Interest:</td>
                    <td style="color: var(--accent);">₹${grandTotalInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                </tr>
            </tfoot>
        `;
        container.appendChild(table);
    }

    function renderCustomerInterestSummary() {
        const container = document.getElementById('customer-interest-summary');
        if (!container) return;
        container.innerHTML = '';

        let customerInterest = {};

        deposits.forEach(d => {
            const interest = parseFloat(d.interestEarned || 0);
            customerInterest[d.customer] = (customerInterest[d.customer] || 0) + interest;
        });

        const sortedCustomers = Object.keys(customerInterest).sort((a, b) => customerInterest[b] - customerInterest[a]);
        
        let grandTotal = 0;
        sortedCustomers.forEach(c => grandTotal += customerInterest[c]);

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Customer Name</th>
                    <th>Total Interest Accrued (All Deposits)</th>
                </tr>
            </thead>
            <tbody>
                ${sortedCustomers.map(customer => `
                    <tr class="clickable" onclick="showCustomerDetails('${customer}')">
                        <td>${customer}</td>
                        <td>₹${customerInterest[customer].toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                `).join('')}
            </tbody>
            <tfoot>
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td style="text-align: right;">Overall Total:</td>
                    <td style="color: var(--accent);">₹${grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                </tr>
            </tfoot>
        `;
        container.appendChild(table);
    }

    window.downloadAllDepositsPDF = async () => {
        await loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFontSize(18);
        doc.text("FD Maturity Report", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

        const rows = deposits.map(d => [
            d.accNo || '--',
            d.customer || '--',
            d.name,
            d.type,
            `Rs. ${getCurrentBalance(d).toLocaleString()}`,
            `${d.rate}%`,
            Calculations.formatDate(d.startDate),
            Calculations.formatDate(d.maturityDate),
            `Rs. ${d.maturityAmount.toLocaleString()}`
        ]);

        doc.autoTable({
            head: [['Acc No', 'Customer', 'Name', 'Type', 'Principal', 'Rate', 'Start', 'Maturity', 'Maturity Amt']],
            body: rows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
        });

        doc.save(`all_deposits_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    function renderDueReport(uptoDate) {
        const table = document.getElementById('due-report-table');
        const tbody = table.querySelector('tbody');
        let tfoot = table.querySelector('tfoot');
        if (!tfoot) {
            tfoot = document.createElement('tfoot');
            table.appendChild(tfoot);
        }
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        const filterDate = new Date(uptoDate + "T23:59:59");
        const filtered = deposits.filter(d => {
            const matDate = new Date(d.maturityDate + "T00:00:00");
            const isMaturedDue = matDate <= filterDate;

            // Special logic for RD installments due: 
            // If it's an RD and the installment day of the current month (upto filterDate) has passed 
            // and it hasn't been matured yet.
            if (d.type === 'RD' && !isMaturedDue) {
                const today = new Date();
                const currentMonthDay = today.getDate();
                // This is a simplified check: if today is past the installment day, show it as due
                return d.installmentDay <= currentMonthDay;
            }

            return isMaturedDue;
        }).sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));

        let totalPrincipal = 0;
        let totalMaturity = 0;

        filtered.forEach(d => {
            const currentBal = getCurrentBalance(d);
            totalPrincipal += currentBal;
            totalMaturity += d.maturityAmount;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.accNo || '--'}</td>
                <td>${d.customer || '--'}</td>
                <td>${d.name}</td>
                <td>${d.type}${d.type === 'RD' ? ` (Day ${d.installmentDay || 1})` : ''}</td>
                <td>₹${currentBal.toLocaleString()}</td>
                <td>${Calculations.formatDate(d.maturityDate)}</td>
                <td style="font-weight: 600;">₹${d.maturityAmount.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });

        if (filtered.length > 0) {
            tfoot.innerHTML = `
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td colspan="4" style="text-align: right;">Total Due:</td>
                    <td>₹${totalPrincipal.toLocaleString()}</td>
                    <td></td>
                    <td style="color: var(--primary-light);">₹${totalMaturity.toLocaleString()}</td>
                </tr>
            `;
        } else {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No deposits due upto this date.</td></tr>';
        }
    }

    window.downloadDueReportPDF = async () => {
        await loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const uptoDate = document.getElementById('due-upto-date').value;

        doc.setFontSize(18);
        doc.text("Due Report", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
        doc.text(`Deposits maturing upto: ${uptoDate}`, 14, 36);

        const rows = [];
        const filtered = deposits.filter(d => {
            const matDate = new Date(d.maturityDate + "T00:00:00");
            return matDate <= new Date(uptoDate + "T23:59:59");
        }).sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));

        filtered.forEach(d => {
            rows.push([
                d.accNo || '--',
                d.customer || '--',
                d.name,
                d.type,
                `Rs. ${getCurrentBalance(d).toLocaleString()}`,
                d.maturityDate,
                `Rs. ${d.maturityAmount.toLocaleString()}`
            ]);
        });

        doc.autoTable({
            head: [['Acc No', 'Customer', 'Deposit', 'Type', 'Principal', 'Maturity Date', 'Maturity Amt']],
            body: rows,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
        });

        doc.save(`due_report_${uptoDate}.pdf`);
    };

    window.showInterestDetails = (fy) => {
        const modal = document.getElementById('deposit-modal');
        const content = document.getElementById('modal-content');
        const header = document.querySelector('#deposit-modal h3');
        header.textContent = `Interest Details for FY ${fy}`;

        // Create a flex container for the header to include a PDF button
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.width = '100%';
        
        // Remove existing button if any (to avoid duplicates)
        const oldBtn = document.getElementById('btn-fy-pdf');
        if (oldBtn) oldBtn.remove();

        const pdfBtn = document.createElement('button');
        pdfBtn.id = 'btn-fy-pdf';
        pdfBtn.className = 'btn btn-sm';
        pdfBtn.style.background = 'var(--primary)';
        pdfBtn.style.color = '#fff';
        pdfBtn.style.marginLeft = '10px';
        pdfBtn.innerHTML = '<ion-icon name="download-outline"></ion-icon> PDF';
        pdfBtn.onclick = () => downloadFYInterestPDF(fy);
        header.appendChild(pdfBtn);

        let totalFY = 0;
        let rowsHtml = '';

        deposits.forEach(d => {
            const yearly = Calculations.calculateYearlyInterest(d.amount, d.rate, d.startDate, d.months, d.compounding, d.interestEarned);
            if (yearly[fy]) {
                totalFY += yearly[fy];
                rowsHtml += `
                    <div class="detail-row">
                        <span class="detail-label">${d.name} (${d.accNo})</span>
                        <span class="detail-value">₹${yearly[fy].toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    </div>
                `;
            }
        });

        content.innerHTML = `
            <p style="margin-bottom: 15px; color: var(--text-secondary);">Breakdown of interest earned/accrued in the financial year ${fy}.</p>
            ${rowsHtml}
            <div class="detail-row" style="border-top: 1px solid var(--border); margin-top: 10px; padding-top: 10px; font-weight: 800;">
                <span class="detail-label">Total for FY ${fy}</span>
                <span class="detail-value" style="color: var(--primary-light);">₹${totalFY.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
        `;

        modal.style.display = 'flex';
    };

    window.downloadFYInterestPDF = async (fy) => {
        await loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.setTextColor(79, 70, 229);
        doc.text(`Interest Details: FY ${fy}`, 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

        const rows = [];
        let totalFY = 0;

        deposits.forEach(d => {
            const yearly = Calculations.calculateYearlyInterest(d.amount, d.rate, d.startDate, d.months, d.compounding, d.interestEarned);
            if (yearly[fy]) {
                totalFY += yearly[fy];
                rows.push([
                    d.customer || '--',
                    d.name || '--',
                    d.accNo || '--',
                    `Rs. ${d.amount.toLocaleString()}`,
                    `${d.rate}%`,
                    `Rs. ${yearly[fy].toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                ]);
            }
        });

        rows.push(['', '', '', '', 'TOTAL FOR FY', `Rs. ${totalFY.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`]);

        doc.autoTable({
            head: [['Customer', 'Deposit Name', 'Account No', 'Principal', 'Rate', 'Interest (FY)']],
            body: rows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            didDrawCell: (data) => {
                if (data.row.index === rows.length - 1) {
                    doc.setFont(undefined, 'bold');
                }
            }
        });

        doc.save(`interest_details_FY_${fy}.pdf`);
    };

    function renderTypeReport() {
        const summaryCardsContainer = document.getElementById('type-summary-cards');
        const tablesContainer = document.getElementById('type-report-container');
        summaryCardsContainer.innerHTML = '';
        tablesContainer.innerHTML = '';

        const grouped = deposits.reduce((acc, d) => {
            const type = d.type || 'Other';
            if (!acc[type]) {
                acc[type] = { deposits: [], totalAmount: 0, totalMaturity: 0 };
            }
            acc[type].deposits.push(d);
            const currentBal = getCurrentBalance(d);
            acc[type].totalAmount += currentBal;
            acc[type].totalMaturity += d.maturityAmount;
            return acc;
        }, {});

        // Add "All" Category
        grouped['All'] = {
            deposits: [...deposits],
            totalAmount: deposits.reduce((sum, d) => sum + getCurrentBalance(d), 0),
            totalMaturity: deposits.reduce((sum, d) => sum + d.maturityAmount, 0)
        };

        const types = ['All', 'FD', 'RD', 'DD', ...Object.keys(grouped).filter(t => !['All', 'FD', 'RD', 'DD'].includes(t))];
        let firstType = null;

        types.forEach(type => {
            if (!grouped[type] || grouped[type].deposits.length === 0) return;
            if (!firstType) firstType = type;

            const g = grouped[type];

            // Render Card (as Tab)
            const card = document.createElement('div');
            card.className = 'card type-tab';
            card.id = `tab-${type}`;
            card.style.cursor = 'pointer';
            card.style.transition = 'all 0.3s ease';
            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="background: var(--primary); color: #fff; padding: 10px; border-radius: 8px; display: flex;">
                        <ion-icon name="${type === 'All' ? 'layers' : (type === 'FD' ? 'lock-closed' : (type === 'RD' ? 'repeat' : 'trending-up'))}-outline" style="font-size: 1.5rem;"></ion-icon>
                    </div>
                    <div>
                        <p class="text-secondary">${type} Total</p>
                        <h3>₹${g.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
                        <small style="color: var(--primary-light)">${g.deposits.length} Accounts</small>
                    </div>
                </div>
            `;

            card.onclick = () => {
                // Reset all tabs
                document.querySelectorAll('.type-tab').forEach(t => {
                    t.style.border = '1px solid var(--glass-border)';
                    t.style.background = 'var(--bg-card)';
                    t.style.transform = 'translateY(0)';
                });
                // Highlight active tab
                card.style.border = '2px solid var(--primary)';
                card.style.background = 'rgba(99, 102, 241, 0.1)';
                card.style.transform = 'translateY(-4px)';

                // Show corresponding table section
                document.querySelectorAll('.type-table-section').forEach(s => s.style.display = 'none');
                const section = document.getElementById(`section-${type}`);
                if (section) {
                    section.style.display = 'block';
                    section.style.marginTop = '24px';
                    section.style.animation = 'slideUp 0.4s ease-out';
                }
            };

            summaryCardsContainer.appendChild(card);

            // Render Table Section
            const tableCard = document.createElement('div');
            tableCard.className = 'card type-table-section';
            tableCard.id = `section-${type}`;
            tableCard.style.display = 'none'; // Initially hidden
            tableCard.innerHTML = `
                <h3 style="margin-bottom: 20px; color: var(--primary-light); display: flex; align-items: center; gap: 10px;">
                    <ion-icon name="list-outline"></ion-icon> ${type} Deposits Detail
                </h3>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Acc No</th>
                                <th>Customer</th>
                                ${type === 'All' ? '<th>Type</th>' : ''}
                                <th>Principal</th>
                                <th>Rate</th>
                                <th>Start Date</th>
                                <th>Maturity Date</th>
                                <th>Maturity Amt</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${g.deposits.sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate)).map(d => `
                                <tr>
                                    <td>${d.accNo}</td>
                                    <td class="clickable" onclick="showCustomerDetails('${d.customer}')">${d.customer}</td>
                                    ${type === 'All' ? `<td><span class="badge" style="background: rgba(99,102,241,0.1)">${d.type}</span></td>` : ''}
                                    <td>₹${getCurrentBalance(d).toLocaleString()}</td>
                                    <td>${d.rate}%</td>
                                    <td>${Calculations.formatDate(d.startDate)}</td>
                                    <td>${Calculations.formatDate(d.maturityDate)}</td>
                                    <td style="font-weight: 600;">₹${d.maturityAmount.toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                                <td colspan="${type === 'All' ? 3 : 2}" style="text-align: right;">Group Totals:</td>
                                <td>₹${g.totalAmount.toLocaleString()}</td>
                                <td colspan="3"></td>
                                <td style="color: var(--primary-light);">₹${g.totalMaturity.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
            tablesContainer.appendChild(tableCard);
        });

        // Activate first tab by default
        if (firstType) {
            const firstTab = document.getElementById(`tab-${firstType}`);
            if (firstTab) firstTab.click();
        } else if (Object.keys(grouped).length === 0) {
            tablesContainer.innerHTML = '<div class="card" style="text-align: center; color: var(--text-secondary);">No deposits found.</div>';
        }
    }

    window.downloadAllDepositsExcel = async () => {
        await loadLibrary('xlsx');
        const data = deposits.map(d => ({
            'Account No': d.accNo || '--',
            'Customer': d.customer || '--',
            'Deposit Name': d.name,
            'Type': d.type,
            'Amount': getCurrentBalance(d),
            'Rate (%)': d.rate,
            'Start Date': d.startDate,
            'Maturity Date': d.maturityDate,
            'Interest Earned': d.interestEarned,
            'Maturity Amount': d.maturityAmount
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "All Deposits");
        XLSX.writeFile(wb, `all_deposits_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    window.downloadDueReportExcel = async () => {
        await loadLibrary('xlsx');
        const uptoDate = document.getElementById('due-upto-date').value;
        const filterDate = new Date(uptoDate + "T23:59:59");
        const filtered = deposits.filter(d => {
            const matDate = new Date(d.maturityDate + "T00:00:00");
            return matDate <= filterDate;
        }).sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));

        const data = filtered.map(d => ({
            'Account No': d.accNo || '--',
            'Customer': d.customer || '--',
            'Deposit': d.name,
            'Type': d.type,
            'Amount': getCurrentBalance(d),
            'Maturity Date': d.maturityDate,
            'Maturity Amt': d.maturityAmount
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Due Report");
        XLSX.writeFile(wb, `due_report_${uptoDate}.xlsx`);
    };

    window.downloadTypeReportExcel = async () => {
        await loadLibrary('xlsx');
        const wb = XLSX.utils.book_new();

        const grouped = deposits.reduce((acc, d) => {
            const type = d.type || 'Other';
            if (!acc[type]) acc[type] = [];
            acc[type].push(d);
            return acc;
        }, {});

        // Add All sheet
        const allData = deposits.map(d => ({
            'Acc No': d.accNo, 'Customer': d.customer, 'Type': d.type, 'Amount': getCurrentBalance(d), 'Rate': d.rate, 'Start': d.startDate, 'Maturity': d.maturityDate, 'Maturity Amt': d.maturityAmount
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allData), "All Deposits");

        // Add individual type sheets
        for (const type in grouped) {
            const typeData = grouped[type].map(d => ({
                'Acc No': d.accNo, 'Customer': d.customer, 'Amount': getCurrentBalance(d), 'Rate': d.rate, 'Start': d.startDate, 'Maturity': d.maturityDate, 'Maturity Amt': d.maturityAmount
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(typeData), type);
        }

        XLSX.writeFile(wb, `deposit_type_report_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    window.downloadCustomerSummaryExcel = async () => {
        await loadLibrary('xlsx');
        const grouped = deposits.reduce((acc, d) => {
            const name = d.customer || 'Unknown';
            if (!acc[name]) {
                acc[name] = { count: 0, totalPrincipal: 0, totalInterest: 0, totalMaturity: 0, weightedRateSum: 0 };
            }
            const currentBal = getCurrentBalance(d);
            acc[name].count++;
            acc[name].totalPrincipal += currentBal;
            acc[name].totalInterest += d.interestEarned;
            acc[name].totalMaturity += d.maturityAmount;
            acc[name].weightedRateSum += (currentBal * d.rate);
            return acc;
        }, {});

        const data = Object.keys(grouped).sort().map(customer => {
            const g = grouped[customer];
            return {
                'Customer': customer,
                'Total Deposits': g.count,
                'Total Principal': g.totalPrincipal,
                'Avg Rate (%)': (g.totalPrincipal > 0 ? (g.weightedRateSum / g.totalPrincipal) : 0).toFixed(2),
                'Total Interest': g.totalInterest,
                'Total Maturity': g.totalMaturity
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Customer Summary");
        XLSX.writeFile(wb, `customer_summary_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    window.downloadCustomerSummaryPDF = async () => {
        await loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text("Customer-wise Summary Report", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

        const grouped = deposits.reduce((acc, d) => {
            const name = d.customer || 'Unknown';
            if (!acc[name]) {
                acc[name] = { count: 0, totalPrincipal: 0, totalInterest: 0, totalMaturity: 0, weightedRateSum: 0 };
            }
            const currentBal = getCurrentBalance(d);
            acc[name].count++;
            acc[name].totalPrincipal += currentBal;
            acc[name].totalInterest += d.interestEarned;
            acc[name].totalMaturity += d.maturityAmount;
            acc[name].weightedRateSum += (currentBal * d.rate);
            return acc;
        }, {});

        const rows = Object.keys(grouped).sort().map(customer => {
            const g = grouped[customer];
            return [
                customer,
                g.count,
                `Rs. ${g.totalPrincipal.toLocaleString()}`,
                `${(g.totalPrincipal > 0 ? (g.weightedRateSum / g.totalPrincipal) : 0).toFixed(2)}%`,
                `Rs. ${g.totalInterest.toLocaleString()}`,
                `Rs. ${g.totalMaturity.toLocaleString()}`
            ];
        });

        doc.autoTable({
            head: [['Customer', 'Count', 'Principal', 'Avg Rate', 'Interest', 'Maturity Amt']],
            body: rows,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
        });

        doc.save(`customer_summary_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    window.downloadTypeReportPDF = async () => {
        await loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFontSize(18);
        doc.text("Deposit Type Report", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

        const grouped = deposits.reduce((acc, d) => {
            const type = d.type || 'Other';
            if (!acc[type]) acc[type] = [];
            acc[type].push(d);
            return acc;
        }, {});

        const pdfGrouped = { 'All': deposits, ...grouped };
        let currentY = 40;
        const types = ['All', 'FD', 'RD', 'DD', ...Object.keys(grouped).filter(t => !['All', 'FD', 'RD', 'DD'].includes(t))];

        types.forEach(type => {
            if (!pdfGrouped[type] || pdfGrouped[type].length === 0) return;

            doc.setFontSize(14);
            doc.setTextColor(79, 70, 229);
            doc.text(`${type} Deposits`, 14, currentY);

            const rows = pdfGrouped[type].sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate)).map(d => [
                d.accNo || '--',
                d.customer || '--',
                d.name,
                type === 'All' ? d.type : d.accNo,
                `Rs. ${getCurrentBalance(d).toLocaleString()}`,
                `${d.rate}%`,
                Calculations.formatDate(d.startDate),
                Calculations.formatDate(d.maturityDate),
                `Rs. ${d.maturityAmount.toLocaleString()}`
            ]);

            const head = type === 'All' ? [['Acc No', 'Customer', 'Name', 'Type', 'Principal', 'Rate', 'Start', 'Maturity', 'Maturity Amt']] : [['Acc No', 'Customer', 'Name', 'Principal', 'Rate', 'Start', 'Maturity', 'Maturity Amt']];
            if (type !== 'All') {
                rows.forEach(r => r.splice(3, 1));
            }

            doc.autoTable({
                head: head,
                body: rows,
                startY: currentY + 5,
                theme: 'grid',
                headStyles: { fillColor: [79, 70, 229] },
            });

            currentY = doc.lastAutoTable.finalY + 15;
            if (currentY > 180) {
                doc.addPage();
                currentY = 20;
            }
        });

        doc.save(`deposit_type_report_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    window.generatePeriodicInterestReport = () => {
        const fromDate = document.getElementById('interest-from-date').value;
        const toDate = document.getElementById('interest-to-date').value;

        if (!fromDate || !toDate) {
            alert('Please select both From and To dates.');
            return;
        }

        const reportCard = document.getElementById('periodic-interest-card');
        const reportTitle = document.getElementById('periodic-report-title');
        const tbody = document.querySelector('#periodic-interest-table tbody');
        const tfoot = document.querySelector('#periodic-interest-table tfoot');

        reportCard.style.display = 'block';
        reportTitle.textContent = `Interest Accrued from ${Calculations.formatDate(fromDate)} to ${Calculations.formatDate(toDate)}`;
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        let totalInterest = 0;
        let count = 0;

        deposits.forEach(d => {
            const interest = Calculations.calculateInterestForPeriod(d, fromDate, toDate);
            if (interest > 0) {
                count++;
                totalInterest += interest;
                const tr = document.createElement('tr');
                const isOngoing = new Date(d.startDate) <= new Date(toDate) && new Date(d.maturityDate) >= new Date(fromDate);

                tr.innerHTML = `
                    <td class="clickable" onclick="showCustomerDetails('${d.customer}')">${d.customer}</td>
                    <td class="clickable" onclick="showDepositModal(${d.id})">${d.name}</td>
                    <td>₹${getCurrentBalance(d).toLocaleString()}</td>
                    <td>${d.rate}%</td>
                    <td><span class="badge badge-active">${isOngoing ? 'Active/Matured in Period' : 'N/A'}</span></td>
                    <td style="font-weight: 700; color: var(--accent);">₹${interest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                `;
                tbody.appendChild(tr);
            }
        });

        if (count > 0) {
            tfoot.innerHTML = `
                <tr style="border-top: 2px solid var(--primary); font-weight: 700;">
                    <td colspan="5" style="text-align: right;">Total Interest for Period:</td>
                    <td style="color: var(--accent);">₹${totalInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                </tr>
            `;
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No interest accrued during this period.</td></tr>';
        }

        reportCard.scrollIntoView({ behavior: 'smooth' });
    };

    window.downloadPeriodicInterestPDF = async () => {
        await loadLibrary('jspdf');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFontSize(18);
        doc.setTextColor(79, 70, 229);
        doc.text("Periodic Interest Accrual Report", 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Period: ${Calculations.formatDate(fromDate)} to ${Calculations.formatDate(toDate)}`, 14, 30);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 36);

        const rows = [];
        let total = 0;
        let count = 0;

        deposits.forEach(d => {
            const interest = Calculations.calculateInterestForPeriod(d, fromDate, toDate);
            if (interest > 0) {
                count++;
                total += interest;
                rows.push([
                    d.customer || '--',
                    d.name || '--',
                    d.accNo || '--',
                    `Rs. ${getCurrentBalance(d).toLocaleString()}`,
                    `${d.rate}%`,
                    `Rs. ${interest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                ]);
            }
        });

        if (count === 0) {
            alert('No interest data found for the selected period.');
            return;
        }

        rows.push(['', '', '', '', 'TOTAL FOR PERIOD', `Rs. ${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`]);

        doc.autoTable({
            head: [['Customer', 'Deposit Name', 'Account No', 'Principal', 'Rate', 'Accrued Interest']],
            body: rows,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            didDrawCell: (data) => {
                if (data.row.index === rows.length - 1) {
                    doc.setFont(undefined, 'bold');
                }
            }
        });

        doc.save(`periodic_interest_${fromDate}_to_${toDate}.pdf`);
    };

    window.downloadYearlyInterestPDF = async () => {
        await loadLibrary('jspdf');
        if (deposits.length === 0) {
            alert('No deposits found to generate the report.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFontSize(18);
        doc.setTextColor(79, 70, 229);
        doc.text("Yearly Interest Summary Report", 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Consolidated interest accrued across financial years.`, 14, 30);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 36);

        let consolidated = {};
        deposits.forEach(d => {
            const yearly = Calculations.calculateYearlyInterest(d.amount, d.rate, d.startDate, d.months, d.compounding, d.interestEarned);
            for (let fy in yearly) {
                consolidated[fy] = (consolidated[fy] || 0) + yearly[fy];
            }
        });

        const rows = Object.keys(consolidated).sort().reverse().map(fy => [
            `Financial Year ${fy}`,
            `Rs. ${consolidated[fy].toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
        ]);

        let grandTotalInterest = 0;
        Object.keys(consolidated).forEach(fy => grandTotalInterest += consolidated[fy]);
        
        rows.push(['Lifetime Interest (All Years)', `Rs. ${grandTotalInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`]);

        doc.autoTable({
            head: [['Financial Year (Apr-Mar)', 'Interest Accrued (Est.)']],
            body: rows,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            columnStyles: {
                0: { cellWidth: 100 },
                1: { cellWidth: 100 }
            },
            didDrawCell: (data) => {
                if (data.row.index === rows.length - 1) {
                    doc.setFont(undefined, 'bold');
                }
            }
        });

        doc.save(`yearly_interest_summary_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    window.downloadCustomerInterestPDF = async () => {
        await loadLibrary('jspdf');
        if (deposits.length === 0) {
            alert('No deposits found to generate the report.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.setTextColor(79, 70, 229);
        doc.text("Customer-wise Interest Report", 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Total interest accrued across all deposits grouped by customer.`, 14, 30);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 36);

        let customerInterest = {};
        deposits.forEach(d => {
            const interest = parseFloat(d.interestEarned || 0);
            customerInterest[d.customer] = (customerInterest[d.customer] || 0) + interest;
        });

        const sortedCustomers = Object.keys(customerInterest).sort((a, b) => customerInterest[b] - customerInterest[a]);
        
        const rows = sortedCustomers.map(customer => [
            customer,
            `Rs. ${customerInterest[customer].toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
        ]);

        let grandTotal = 0;
        sortedCustomers.forEach(c => grandTotal += customerInterest[c]);
        
        rows.push(['Overall Total Interest', `Rs. ${grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`]);

        doc.autoTable({
            head: [['Customer Name', 'Total Interest Accrued']],
            body: rows,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            didDrawCell: (data) => {
                if (data.row.index === rows.length - 1) {
                    doc.setFont(undefined, 'bold');
                }
            }
        });

        doc.save(`customer_interest_summary_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    // Global Escape Key Navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Priority 1: Close any open modal
            const depositModal = document.getElementById('deposit-modal');
            const loginModal = document.getElementById('login-modal');
            
            if (loginModal && loginModal.style.display !== 'none') {
                // If login modal is open, don't allow bypass via escape
                return;
            }

            if (depositModal && depositModal.style.display !== 'none') {
                closeModal();
                return;
            }

            // Priority 2: If we are in customer details view, go back to customer report
            const customerDetailsView = document.getElementById('customer-details');
            if (customerDetailsView && customerDetailsView.style.display !== 'none') {
                document.querySelector('[data-view="customer-report"]').click();
                return;
            }

            // Priority 3: If we are in any other view except dashboard, go back to dashboard
            const dashboardView = document.getElementById('dashboard');
            if (dashboardView && dashboardView.style.display === 'none') {
                document.querySelector('[data-view="dashboard"]').click();
                return;
            }
        }
    });

    function renderMonthlyReport() {
        const container = document.getElementById('monthly-summary-container');
        if (!container) return;
        container.innerHTML = '';
        document.getElementById('monthly-details-section').style.display = 'none';

        // Helper to get FY label (e.g., 25-26)
        const getFY = (date) => {
            const year = date.getFullYear();
            const month = date.getMonth(); // 0-indexed
            if (month < 3) return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
            return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
        };

        const today = new Date();
        const currentFY = getFY(today);
        
        // Determine which FYs to show (Current and Next)
        const yearBase = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
        const fyList = [
            `${yearBase.toString().slice(-2)}-${(yearBase + 1).toString().slice(-2)}`,
            `${(yearBase + 1).toString().slice(-2)}-${(yearBase + 2).toString().slice(-2)}`
        ];

        // Group deposits by month and year
        const monthlyData = {};
        let carryoverSum = 0;
        let carryoverCount = 0;

        deposits.forEach(d => {
            const matDate = new Date(d.maturityDate + "T00:00:00");
            const fy = getFY(matDate);
            
            if (fyList.includes(fy)) {
                const monthKey = `${matDate.getFullYear()}-${matDate.getMonth()}`;
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = {
                        month: matDate.getMonth(),
                        year: matDate.getFullYear(),
                        fy: fy,
                        count: 0,
                        amount: 0,
                        items: []
                    };
                }
                monthlyData[monthKey].count++;
                monthlyData[monthKey].amount += d.maturityAmount;
                monthlyData[monthKey].items.push(d);
            } else if (matDate > today) {
                carryoverSum += d.maturityAmount;
                carryoverCount++;
            }
        });

        // Sort keys chronologically
        const sortedKeys = Object.keys(monthlyData).sort((a, b) => {
            const [yA, mA] = a.split('-').map(Number);
            const [yB, mB] = b.split('-').map(Number);
            return yA !== yB ? yA - yB : mA - mB;
        });

        fyList.forEach(fy => {
            const fyKeys = sortedKeys.filter(k => monthlyData[k].fy === fy);
            if (fyKeys.length === 0 && (fy !== fyList[1] || carryoverCount === 0)) return;

            const fyGroup = document.createElement('div');
            fyGroup.className = 'fy-group';
            fyGroup.innerHTML = `<div class="fy-header">Financial Year ${fy}</div>`;
            
            const boxesRow = document.createElement('div');
            boxesRow.className = 'monthly-boxes-row';

            fyKeys.forEach(key => {
                const data = monthlyData[key];
                const monthName = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(data.year, data.month));
                const box = document.createElement('div');
                box.className = 'month-box';
                box.innerHTML = `
                    <div class="month-name">${monthName} ${data.year.toString().slice(-2)}</div>
                    <div class="counts">${data.count} FD & Amount</div>
                    <div class="amount">₹${data.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                `;
                box.onclick = () => showMonthlyDetails(data, box);
                boxesRow.appendChild(box);
            });

            // Add carryover if it's the last displayed FY row
            if (fy === fyList[fyList.length - 1] && carryoverCount > 0) {
                const carryBox = document.createElement('div');
                carryBox.className = 'month-box carryover';
                carryBox.innerHTML = `
                   <div class="month-name">Future</div>
                   <div class="counts">as carryover</div>
                   <div class="amount">₹${carryoverSum.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                `;
                carryBox.onclick = () => alert(`Future deposits maturing after FY ${fy}: ${carryoverCount} deposits totalling ₹${carryoverSum.toLocaleString()}`);
                boxesRow.appendChild(carryBox);
            }

            fyGroup.appendChild(boxesRow);
            container.appendChild(fyGroup);
        });

        if (container.innerHTML === '') {
            container.innerHTML = '<p class="text-secondary" style="text-align: center; padding: 40px;">No upcoming maturities found for the current periods.</p>';
        }
    }

    function showMonthlyDetails(data, element) {
        document.querySelectorAll('.month-box').forEach(b => b.classList.remove('active'));
        element.classList.add('active');

        const section = document.getElementById('monthly-details-section');
        const title = document.getElementById('monthly-details-title');
        const tbody = document.getElementById('monthly-details-table').querySelector('tbody');

        const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(data.year, data.month));
        title.textContent = `Maturities Breakdown: ${monthName} ${data.year}`;
        
        tbody.innerHTML = '';
        [...data.items].sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate)).forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.accNo}</td>
                <td class="clickable" onclick="showCustomerDetails('${d.customer}')">${d.customer}</td>
                <td class="clickable" onclick="showDepositModal(${d.id})">${d.name}</td>
                <td><span class="badge" style="background: rgba(99,102,241,0.1)">${d.type}</span></td>
                <td>₹${d.amount.toLocaleString()}</td>
                <td>₹${d.interestEarned.toLocaleString()}</td>
                <td>${Calculations.formatDate(d.maturityDate)}</td>
                <td style="font-weight: 700;">₹${d.maturityAmount.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });

        section.style.display = 'block';
        section.scrollIntoView({ behavior: 'smooth' });
    }

    window.renderMonthlyReport = renderMonthlyReport;

    // Initialize - Deferred for speed
    setTimeout(() => {
        updateDashboard();
        checkAppSecurity();
    }, 0);
});

