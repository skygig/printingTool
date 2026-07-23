// Intercept all fetch requests to handle 401 Unauthorized
const originalFetch = window.fetch;
window.fetch = function(...args) {
    return originalFetch.apply(this, args).then(response => {
        if (response.status === 401 && 
            typeof args[0] === 'string' &&
            !args[0].includes('/api/auth-status') && 
            !args[0].includes('/api/login')) {
            // Show login screen
            const loginOverlay = document.getElementById('login-overlay');
            const profileBadge = document.getElementById('user-profile-badge');
            const btnLogout = document.getElementById('btn-logout');
            if (loginOverlay) loginOverlay.classList.remove('hidden');
            if (profileBadge) profileBadge.classList.add('hidden');
            if (btnLogout) btnLogout.classList.add('hidden');
        }
        return response;
    });
};

// State Variables
let records = [];
let filteredRecords = [];
let currentPage = 1;
const rowsPerPage = 10;
let selectedRecord = null;
let currentUserRole = 'employee';

// ==========================================
// COMPLETED RECORD EDIT RESTRICTION LOGIC
// ==========================================

function isShippingRecordCompleted(rec) {
    if (!rec) return false;
    return (rec.outbound_tracking || '').toString().trim() !== '';
}

function isShippingGroupCompleted(recordOrGroup) {
    if (!recordOrGroup) return false;
    if (Array.isArray(recordOrGroup)) {
        return recordOrGroup.some(r => isShippingRecordCompleted(r));
    }
    return isShippingRecordCompleted(recordOrGroup);
}

function isReceivingRecordCompleted(rec) {
    if (!rec) return false;
    return (rec.inbound_tracking || '').toString().trim() !== '';
}

function isReceivingGroupCompleted(recordOrGroup) {
    if (!recordOrGroup) return false;
    if (Array.isArray(recordOrGroup)) {
        return recordOrGroup.some(r => isReceivingRecordCompleted(r));
    }
    return isReceivingRecordCompleted(recordOrGroup);
}

function getShippingInvoiceStatus(rec, currentTrackingInput = '') {
    if (!rec) return { statusClass: 'pending', statusLabel: 'Not Invoiced' };
    const rawStatus = (rec.invoice_status || '').trim();
    if (rawStatus.toLowerCase() === 'invoiced') {
        return { statusClass: 'invoiced', statusLabel: rawStatus || 'Invoiced' };
    }

    const trackingInInput = (currentTrackingInput || '').trim();
    const hasTracking = isShippingRecordCompleted(rec) || trackingInInput !== '';

    if (hasTracking) {
        return { statusClass: 'to-be-invoiced', statusLabel: 'To be Invoiced' };
    }

    return { statusClass: 'pending', statusLabel: rawStatus || 'Not Invoiced' };
}

function getReceivingInvoiceStatus(rec, currentTrackingInput = '') {
    if (!rec) return { statusClass: 'pending', statusLabel: 'Not Invoiced' };
    const rawStatus = (rec.invoice_status || '').trim();
    if (rawStatus.toLowerCase() === 'invoiced') {
        return { statusClass: 'invoiced', statusLabel: rawStatus || 'Invoiced' };
    }

    const trackingInInput = (currentTrackingInput || '').trim();
    const hasTracking = isReceivingRecordCompleted(rec) || trackingInInput !== '';

    if (hasTracking) {
        return { statusClass: 'to-be-invoiced', statusLabel: 'To be Invoiced' };
    }

    return { statusClass: 'pending', statusLabel: rawStatus || 'Not Invoiced' };
}

function setContainerControlsState(containerElement, disabled, exceptIds = []) {
    if (!containerElement) return;
    const controls = containerElement.querySelectorAll('input, select, textarea, button');
    controls.forEach(ctrl => {
        if (exceptIds.includes(ctrl.id)) return;
        ctrl.disabled = disabled;
    });
}

function updateShippingLockState() {
    const warningEl = document.getElementById('shipping-lock-warning');
    const saveBtn = document.getElementById('btn-save-shipping-changes');
    const formEl = document.getElementById('generator-form');
    if (!selectedRecord || !formEl) return;

    let groupRecords = [selectedRecord];
    const po = (selectedRecord.customer_po || '').trim();
    if (po) {
        groupRecords = records.filter(r => (r.customer_po || '').trim() === po);
    }

    const trackingInInput = inputOutboundTracking ? inputOutboundTracking.value.trim() : '';
    const hasTracking = isShippingGroupCompleted(groupRecords) || trackingInInput !== '';
    const isLocked = hasTracking && currentUserRole !== 'admin';

    if (warningEl) {
        if (isLocked) warningEl.classList.remove('hidden');
        else warningEl.classList.add('hidden');
    }

    if (saveBtn) {
        if (isLocked) {
            saveBtn.classList.add('hidden');
            saveBtn.style.display = 'none';
        } else {
            saveBtn.classList.remove('hidden');
            saveBtn.style.display = '';
        }
    }

    setContainerControlsState(formEl, isLocked, ['btn-save-shipping-changes']);
    renderTable();
}

function updateReceivingLockState() {
    const warningEl = document.getElementById('receiving-lock-warning');
    const saveBtn = document.getElementById('btn-save-receiving');
    const formEl = document.getElementById('receiving-form');
    if (!formEl || activeReceivingRecords.length === 0) return;

    const recTrackingEl = document.getElementById('rec-tracking');
    const trackingInInput = recTrackingEl ? recTrackingEl.value.trim() : '';
    const hasTracking = isReceivingGroupCompleted(activeReceivingRecords) || trackingInInput !== '';
    const isLocked = hasTracking && currentUserRole !== 'admin';

    if (warningEl) {
        if (isLocked) warningEl.classList.remove('hidden');
        else warningEl.classList.add('hidden');
    }

    if (saveBtn) {
        if (isLocked) {
            saveBtn.classList.add('hidden');
            saveBtn.style.display = 'none';
        } else {
            saveBtn.classList.remove('hidden');
            saveBtn.style.display = '';
        }
    }

    setContainerControlsState(formEl, isLocked, ['btn-save-receiving']);
    renderReceivingTable();
}

// Receiving State Variables
let receivingFilteredRecords = [];
let receivingCurrentPage = 1;
let selectedReceivingRowIds = new Set();
let activeReceivingRecords = [];
let receivingReports = {};
let uploadedPhotoName = "";

// Address Templates
const ADDRESSES = {
    GE: {
        sold_to: "GE Energy Parts\nEnergy Services - Energy Parts COE\n4955 Mason Road\nAtlanta, GA 30349",
        ship_to: "GE Energy Parts\nEnergy Services - Energy Parts COE\n4955 Mason Road\nAtlanta, GA 30349"
    },
    JORDS: {
        sold_to: "Jord Energy Pty Ltd\nP.O. Box 548, St. Leonards\nNSW 1590 Australia\nAttn: Diveshkarthick Elangovan",
        ship_to: "RMS INTERNATIONAL INC.\n10900 E. 183RD ST. STE# 175A\nCERRITOS, CA 90703\nATTN: MICHAEL / SCOTT\nTEL: 562 402 0881"
    },
    DEFAULT: {
        sold_to: "Customer Name\nAddress Line 1\nAddress Line 2",
        ship_to: "RMS INTERNATIONAL INC.\n10900 E. 183RD ST. STE# 175A\nCERRITOS, CA 90703\nATTN: MICHAEL / SCOTT\nTEL: 562 402 0881"
    }
};

// DOM Elements
const searchInput = document.getElementById('search-input');
const tableBody = document.getElementById('table-body');
const recordsCount = document.getElementById('records-count');
const pageIndicator = document.getElementById('page-indicator');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');

const btnPickFile = document.getElementById('btn-pick-file');
const dbFileInput = document.getElementById('db-file-input');
const excelActionsRow = document.getElementById('excel-actions-row');
const sheetSelect = document.getElementById('sheet-select');
const headerRowInput = document.getElementById('header-row-input');
const dbFilename = document.getElementById('db-filename');

// Receiving DB control elements
const receivingBtnPickFile = document.getElementById('receiving-btn-pick-file');
const receivingDbFileInput = document.getElementById('receiving-db-file-input');
const receivingExcelActionsRow = document.getElementById('receiving-excel-actions-row');
const receivingSheetSelect = document.getElementById('receiving-sheet-select');
const receivingHeaderRowInput = document.getElementById('receiving-header-row-input');


const emptyState = document.getElementById('empty-state');
const editorContent = document.getElementById('editor-content');
const poTitle = document.getElementById('po-title');
const generatorForm = document.getElementById('generator-form');

const btnGenerate = document.getElementById('btn-generate');
const btnSaveShippingChanges = document.getElementById('btn-save-shipping-changes');
const btnShowInFolder = document.getElementById('btn-show-in-folder');
const docsList = document.getElementById('docs-list');

// Toast elements
const toast = document.getElementById('toast');
const toastTitle = document.getElementById('toast-title');
const toastBody = document.getElementById('toast-body');
const toastLinks = document.getElementById('toast-links');
const toastIcon = document.getElementById('toast-icon');

// Form Input Elements
const inputCustomerPo = document.getElementById('customer_po');
const inputLineNum = document.getElementById('line_num');
const inputShippedDate = document.getElementById('shipped_date');
const inputOrderDate = document.getElementById('order_date');
const inputWeight = document.getElementById('weight');
const inputOutboundL = document.getElementById('outbound_l');
const inputOutboundW = document.getElementById('outbound_w');
const inputOutboundH = document.getElementById('outbound_h');
const inputCarrier = document.getElementById('outbound_carrier');
const inputOutboundTracking = document.getElementById('outbound_tracking');
const txtSoldTo = document.getElementById('sold_to_address');
const txtShipTo = document.getElementById('ship_to_address');
const inputFreeReplacement = document.getElementById('free_replacement_note');
const txtNotesList = document.getElementById('notes_list');
const inputCustomerEmail = document.getElementById('customer_email');
const customerEmailTagsContainer = document.getElementById('customer-email-tags');
let customerEmails = [];

function renderEmailTags() {
    if (!customerEmailTagsContainer) return;
    customerEmailTagsContainer.innerHTML = '';
    
    if (customerEmails.length === 0) {
        customerEmailTagsContainer.classList.add('hidden');
        customerEmailTagsContainer.style.display = 'none';
        customerEmailTagsContainer.style.marginBottom = '0px';
        return;
    }
    
    customerEmailTagsContainer.classList.remove('hidden');
    customerEmailTagsContainer.style.display = 'flex';
    customerEmailTagsContainer.style.marginBottom = '6px';
    
    customerEmails.forEach((email, idx) => {
        const tag = document.createElement('span');
        tag.className = 'email-tag';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = email;
        
        const removeBtn = document.createElement('span');
        removeBtn.className = 'email-tag-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove email';
        removeBtn.addEventListener('click', () => {
            removeCustomerEmail(idx);
        });
        
        tag.appendChild(textSpan);
        tag.appendChild(removeBtn);
        customerEmailTagsContainer.appendChild(tag);
    });
}

function addCustomerEmail(emailStr) {
    if (!emailStr) return;
    const parts = emailStr.split(/[\s,]+/);
    let added = false;
    let invalidEmails = [];
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    parts.forEach(part => {
        const clean = part.replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
        if (clean) {
            if (emailRegex.test(clean)) {
                if (!customerEmails.includes(clean)) {
                    customerEmails.push(clean);
                    added = true;
                }
            } else {
                invalidEmails.push(clean);
            }
        }
    });
    
    renderEmailTags();
    
    if (invalidEmails.length > 0) {
        showToast("Invalid Email", `'${invalidEmails.join(', ')}' is not a valid email address.`, null, true);
    }
}

function removeCustomerEmail(index) {
    if (index >= 0 && index < customerEmails.length) {
        customerEmails.splice(index, 1);
        renderEmailTags();
    }
}

const btnSendEmail = document.getElementById('btn-send-email');
const btnCaptureImagesPopup = document.getElementById('btn-capture-images-popup');
const capturesModal = document.getElementById('captures-modal');
const closeCapturesModal = document.getElementById('close-captures-modal');
const capturesGrid = document.getElementById('captures-grid');
const btnRefreshCaptures = document.getElementById('btn-refresh-captures');
const btnLinkImages = document.getElementById('btn-link-images');
const btnBrowseCapturesFolder = document.getElementById('btn-browse-captures-folder');
const shippingCapturesPath = document.getElementById('shipping_captures_path');

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    
    // Bind Event Listeners
    searchInput.addEventListener('input', handleSearch);
    prevPageBtn.addEventListener('click', () => changePage(-1));
    nextPageBtn.addEventListener('click', () => changePage(1));
    generatorForm.addEventListener('submit', handleFormSubmit);
    if (btnSaveShippingChanges) btnSaveShippingChanges.addEventListener('click', handleSaveShippingChanges);
    if (btnSendEmail) btnSendEmail.addEventListener('click', handleSendEmail);
    if (btnCaptureImagesPopup) btnCaptureImagesPopup.addEventListener('click', openCapturesModalHandler);
    if (closeCapturesModal) closeCapturesModal.addEventListener('click', closeCapturesModalHandler);
    if (btnRefreshCaptures) btnRefreshCaptures.addEventListener('click', refreshCapturesHandler);
    if (btnLinkImages) btnLinkImages.addEventListener('click', linkImagesHandler);
    if (btnBrowseCapturesFolder) btnBrowseCapturesFolder.addEventListener('click', handleBrowseCapturesFolder);
    if (inputCustomerPo) inputCustomerPo.addEventListener('input', updateCapturesPath);
    btnShowInFolder.addEventListener('click', openOutputsFolder);

    if (inputCustomerEmail) {
        inputCustomerEmail.addEventListener('keydown', (e) => {
            if (e.key === ',' || e.key === 'Enter' || (e.key === ' ' && inputCustomerEmail.value.trim().length > 0)) {
                e.preventDefault();
                addCustomerEmail(inputCustomerEmail.value);
                inputCustomerEmail.value = '';
            }
        });

        inputCustomerEmail.addEventListener('input', () => {
            const val = inputCustomerEmail.value;
            if (val.includes(',')) {
                addCustomerEmail(val);
                inputCustomerEmail.value = '';
            }
        });

        inputCustomerEmail.addEventListener('blur', () => {
            if (inputCustomerEmail.value.trim().length > 0) {
                addCustomerEmail(inputCustomerEmail.value);
                inputCustomerEmail.value = '';
            }
        });
    }
    
    btnPickFile.addEventListener('click', triggerFilePicker);
    dbFileInput.addEventListener('change', handleFileUpload);
    sheetSelect.addEventListener('change', handleSheetChange);
    if (headerRowInput) {
        headerRowInput.addEventListener('change', handleHeaderRowChange);
        headerRowInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                handleHeaderRowChange(e);
            }
        });
    }

    if (receivingBtnPickFile) receivingBtnPickFile.addEventListener('click', triggerFilePicker);
    if (receivingDbFileInput) receivingDbFileInput.addEventListener('change', handleFileUpload);
    if (receivingSheetSelect) receivingSheetSelect.addEventListener('change', handleSheetChange);
    if (receivingHeaderRowInput) {
        receivingHeaderRowInput.addEventListener('change', handleHeaderRowChange);
        receivingHeaderRowInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                handleHeaderRowChange(e);
            }
        });
    }

    // Dynamic lock state updates when Tracking inputs change
    if (inputOutboundTracking) {
        inputOutboundTracking.addEventListener('input', updateShippingLockState);
    }
    const recTrackingInput = document.getElementById('rec-tracking');
    if (recTrackingInput) {
        recTrackingInput.addEventListener('input', updateReceivingLockState);
    }

    // Non-admin click notification listeners on locked forms
    if (generatorForm) {
        generatorForm.addEventListener('click', (e) => {
            if (currentUserRole !== 'admin' && selectedRecord) {
                let groupRecords = [selectedRecord];
                const po = (selectedRecord.customer_po || '').trim();
                if (po) {
                    groupRecords = records.filter(r => (r.customer_po || '').trim() === po);
                }
                const trackingInInput = inputOutboundTracking ? inputOutboundTracking.value.trim() : '';
                if (isShippingGroupCompleted(groupRecords) || trackingInInput !== '') {
                    showToast("Editing Restricted", "This order is completed (Tracking / Pro # present). Only an Admin can edit details. Please ask an admin to make changes.", null, true);
                }
            }
        });
    }

    const recFormElement = document.getElementById('receiving-form');
    if (recFormElement) {
        recFormElement.addEventListener('click', (e) => {
            if (currentUserRole !== 'admin' && activeReceivingRecords.length > 0) {
                const trackingInInput = recTrackingInput ? recTrackingInput.value.trim() : '';
                if (isReceivingGroupCompleted(activeReceivingRecords) || trackingInInput !== '') {
                    showToast("Editing Restricted", "This order is completed (Tracking / Pro # present). Only an Admin can edit details. Please ask an admin to make changes.", null, true);
                }
            }
        });
    }

    // Theme Toggle Handler
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle ? themeToggle.querySelector('.theme-icon') : null;
    
    // Sync initial toggle button state
    if (document.body.classList.contains('light-theme')) {
        if (themeIcon) themeIcon.textContent = '🌙';
    } else {
        if (themeIcon) themeIcon.textContent = '☀️';
    }
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            const isLight = document.body.classList.contains('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            if (themeIcon) {
                themeIcon.textContent = isLight ? '🌙' : '☀️';
            }
        });
    }

    // Sync global line number with the first item's line number
    if (inputLineNum) {
        inputLineNum.addEventListener('input', () => {
            const firstItemCard = document.querySelector('.item-edit-card');
            if (firstItemCard) {
                const firstLineInput = firstItemCard.querySelector('.item-line-num');
                if (firstLineInput) {
                    firstLineInput.value = inputLineNum.value;
                }
            }
        });
    }

    // Page Switching (Dashboard, Receiving & Order Entry Tabs)
    const tabDashboard = document.getElementById('tab-dashboard');
    const tabReceiving = document.getElementById('tab-receiving');
    const tabOrderEntry = document.getElementById('tab-order-entry');
    const pageDashboard = document.getElementById('dashboard-page');
    const pageReceiving = document.getElementById('receiving-page');
    const pageOrderEntry = document.getElementById('order-entry-page');
    const orderEntryForm = document.getElementById('order-entry-form');

    function switchTab(activeTab, activePage) {
        [tabDashboard, tabReceiving, tabOrderEntry].forEach(t => {
            if (t) t.classList.remove('active');
        });
        [pageDashboard, pageReceiving, pageOrderEntry].forEach(p => {
            if (p) p.classList.add('hidden');
        });
        if (activeTab) activeTab.classList.add('active');
        if (activePage) activePage.classList.remove('hidden');
    }

    if (tabDashboard && tabReceiving && tabOrderEntry && pageDashboard && pageReceiving && pageOrderEntry) {
        tabDashboard.addEventListener('click', () => {
            switchTab(tabDashboard, pageDashboard);
        });

        tabReceiving.addEventListener('click', () => {
            switchTab(tabReceiving, pageReceiving);
            renderReceivingTable();
        });

        tabOrderEntry.addEventListener('click', () => {
            switchTab(tabOrderEntry, pageOrderEntry);
            prefillOrderEntryDefaults();
        });
    }

    if (orderEntryForm) {
        orderEntryForm.addEventListener('submit', handleOrderEntrySubmit);
    }

    const btnCancelOrder = document.getElementById('btn-cancel-order');
    if (btnCancelOrder && orderEntryForm && tabDashboard) {
        btnCancelOrder.addEventListener('click', () => {
            orderEntryForm.reset();
            tabDashboard.click();
        });
    }

    // Receiving Event Listeners
    const recSearchInput = document.getElementById('receiving-search-input');
    const recPrevPageBtn = document.getElementById('receiving-prev-page');
    const recNextPageBtn = document.getElementById('receiving-next-page');
    const recSelectAllCheckbox = document.getElementById('receiving-select-all');
    const btnReceiveAction = document.getElementById('btn-receive-action');
    
    const recForm = document.getElementById('receiving-form');
    const btnUploadPhoto = document.getElementById('btn-upload-photo');
    const recPhotoFile = document.getElementById('rec-photo-file');
    const recRecordSelect = document.getElementById('rec-record-select');
    const btnOpenReport = document.getElementById('btn-open-report');
    const recReportTextarea = document.getElementById('rec-report-text');
    

    if (recSearchInput) recSearchInput.addEventListener('input', handleReceivingSearch);
    if (recPrevPageBtn) recPrevPageBtn.addEventListener('click', () => changeReceivingPage(-1));
    if (recNextPageBtn) recNextPageBtn.addEventListener('click', () => changeReceivingPage(1));

    const btnCheckScansDropdown = document.getElementById('btn-check-scans-dropdown');
    if (btnCheckScansDropdown) btnCheckScansDropdown.addEventListener('click', toggleScansDropdown);

    // Close scans dropdown if clicked outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('scans-dropdown-menu');
        const btn = document.getElementById('btn-check-scans-dropdown');
        if (dropdown && !dropdown.classList.contains('hidden')) {
            if (e.target !== btn && !btn.contains(e.target) && e.target !== dropdown && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        }
    });
    
    if (recForm) recForm.addEventListener('submit', handleReceivingSave);
    if (btnUploadPhoto) btnUploadPhoto.addEventListener('click', handleUploadPhotoClick);
    if (recPhotoFile) recPhotoFile.addEventListener('change', handlePhotoFileChange);
    if (recRecordSelect) recRecordSelect.addEventListener('change', handleReportRecordSelectChange);
    if (btnOpenReport) btnOpenReport.addEventListener('click', handleOpenReportClick);
    if (recReportTextarea) recReportTextarea.addEventListener('input', handleReportTextareaInput);

    // Login form submit handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('login-username');
            const passwordInput = document.getElementById('login-password');
            const loginError = document.getElementById('login-error');
            const btnSubmit = document.getElementById('btn-login-submit');

            if (!usernameInput || !passwordInput) return;

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Signing in...';
            if (loginError) loginError.classList.add('hidden');

            fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(data => { throw new Error(data.error || 'Login failed'); });
                }
                return res.json();
            })
            .then(data => {
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Sign In';
                usernameInput.value = '';
                passwordInput.value = '';
                checkAuthStatus();
            })
            .catch(err => {
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Sign In';
                if (loginError) {
                    loginError.textContent = err.message || 'Invalid username or password.';
                    loginError.classList.remove('hidden');
                }
            });
        });
    }

    // Logout button handler
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            fetch('/api/logout', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const tabDashboard = document.getElementById('tab-dashboard');
                    if (tabDashboard) tabDashboard.click();
                    checkAuthStatus();
                }
            })
            .catch(err => {
                console.error("Logout failed:", err);
            });
        });
    }
});

function checkAuthStatus() {
    fetch('/api/auth-status')
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                currentUserRole = data.role || 'employee';
                const loginOverlay = document.getElementById('login-overlay');
                if (loginOverlay) loginOverlay.classList.add('hidden');
                
                const displayName = document.getElementById('user-display-name');
                if (displayName) {
                    displayName.textContent = `${data.username} (${data.role})`;
                }
                
                const profileBadge = document.getElementById('user-profile-badge');
                if (profileBadge) profileBadge.classList.remove('hidden');
                
                const btnLogout = document.getElementById('btn-logout');
                if (btnLogout) btnLogout.classList.remove('hidden');
                
                // Show/hide Order Entry tab based on role
                const tabOrderEntry = document.getElementById('tab-order-entry');
                if (tabOrderEntry) {
                    if (data.role === 'admin') {
                        tabOrderEntry.classList.remove('hidden');
                    } else {
                        tabOrderEntry.classList.add('hidden');
                    }
                }
                
                // Initialize database and files load
                loadDatabase();
                loadGeneratedFiles();

                updateShippingLockState();
                updateReceivingLockState();
            } else {
                currentUserRole = 'employee';
                const loginOverlay = document.getElementById('login-overlay');
                if (loginOverlay) loginOverlay.classList.remove('hidden');
                
                const profileBadge = document.getElementById('user-profile-badge');
                if (profileBadge) profileBadge.classList.add('hidden');
                
                const btnLogout = document.getElementById('btn-logout');
                if (btnLogout) btnLogout.classList.add('hidden');
            }
        })
        .catch(err => {
            console.error("Auth check failed:", err);
            const loginOverlay = document.getElementById('login-overlay');
            if (loginOverlay) loginOverlay.classList.remove('hidden');
        });
}

// Fetch CSV/Excel Data from API
function loadDatabase() {
    // 1. Fetch DB status first
    fetch('/api/db-status')
        .then(res => res.json())
        .then(status => {
            dbFilename.textContent = status.filename;
            const recDbFilename = document.getElementById('receiving-db-filename');
            if (recDbFilename) recDbFilename.textContent = status.filename;
            
            // Render sheets if it's an Excel database
            if (status.sheets && status.sheets.length > 0) {
                sheetSelect.innerHTML = '';
                if (receivingSheetSelect) receivingSheetSelect.innerHTML = '';
                status.sheets.forEach(sheet => {
                    const opt1 = document.createElement('option');
                    opt1.value = sheet;
                    opt1.textContent = sheet;
                    if (sheet === status.sheet_name) {
                        opt1.selected = true;
                    }
                    sheetSelect.appendChild(opt1);
                    
                    if (receivingSheetSelect) {
                        const opt2 = document.createElement('option');
                        opt2.value = sheet;
                        opt2.textContent = sheet;
                        if (sheet === status.sheet_name) {
                            opt2.selected = true;
                        }
                        receivingSheetSelect.appendChild(opt2);
                    }
                });
                if (headerRowInput) headerRowInput.value = status.header_row || 1;
                if (receivingHeaderRowInput) receivingHeaderRowInput.value = status.header_row || 1;
                
                if (excelActionsRow) excelActionsRow.classList.remove('hidden');
                if (receivingExcelActionsRow) receivingExcelActionsRow.classList.remove('hidden');
            } else {
                if (excelActionsRow) excelActionsRow.classList.add('hidden');
                if (receivingExcelActionsRow) receivingExcelActionsRow.classList.add('hidden');
                
                sheetSelect.innerHTML = '<option value="">Select Sheet...</option>';
                if (receivingSheetSelect) receivingSheetSelect.innerHTML = '<option value="">Select Sheet...</option>';
                
                if (headerRowInput) headerRowInput.value = 1;
                if (receivingHeaderRowInput) receivingHeaderRowInput.value = 1;
            }
            
            // 2. Fetch actual records
            return fetch('/api/records');
        })
        .then(res => res.json())
        .then(data => {
            setRecords(data);
            recordsCount.textContent = `${records.length} records loaded`;
            
            // Deselect selected row if the records changed
            if (selectedRecord) {
                const updatedRec = records.find(r => r.row_id === selectedRecord.row_id);
                if (updatedRec) {
                    selectedRecord = updatedRec;
                    renderLinkedImages(selectedRecord);
                } else {
                    selectedRecord = null;
                    emptyState.classList.remove('hidden');
                    editorContent.classList.add('hidden');
                }
            }
            
            // Reset receiving selection on DB load
            selectedReceivingRowIds.clear();
            activeReceivingRecords = [];
            receivingReports = {};
            uploadedPhotoName = '';
            
            const recEmptyState = document.getElementById('receiving-empty-state');
            const recEditorContent = document.getElementById('receiving-editor-content');
            if (recEmptyState) recEmptyState.classList.remove('hidden');
            if (recEditorContent) recEditorContent.classList.add('hidden');
            
            renderTable();
            renderReceivingTable();
        })
        .catch(err => {
            console.error("Error loading database:", err);
            recordsCount.textContent = "Error loading database";
        });
}

// Group records by Customer PO globally
function groupRecordsByCustomerPo(recordList) {
    const result = [];
    const seenPos = new Set();
    
    for (const rec of recordList) {
        const po = (rec.customer_po || '').trim();
        if (!po) {
            result.push(rec);
            continue;
        }
        if (seenPos.has(po)) {
            continue;
        }
        // Find all records with this customer_po in the list
        const group = recordList.filter(r => (r.customer_po || '').trim() === po);
        result.push(...group);
        seenPos.add(po);
    }
    return result;
}

function setRecords(data) {
    records = groupRecordsByCustomerPo(data);
    filteredRecords = [...records];
    receivingFilteredRecords = [...records];
}

// Render data grid rows
function renderTable() {
    tableBody.innerHTML = '';
    
    if (filteredRecords.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px;">No records found matching search.</td></tr>`;
        pageIndicator.textContent = 'Page 0 of 0';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        return;
    }
    
    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, filteredRecords.length);
    const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);
    
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    
    for (let i = startIdx; i < endIdx; i++) {
        const rec = filteredRecords[i];
        const tr = document.createElement('tr');
        
        const po = (rec.customer_po || '').trim();
        let isChild = false;
        if (po) {
            if (i > 0 && (filteredRecords[i - 1].customer_po || '').trim() === po) {
                isChild = true;
            }
        }
        
        if (isChild) {
            tr.classList.add('child-record');
        }
        
        tr.setAttribute('data-po', po);
        tr.setAttribute('data-row-id', rec.row_id);
        
        const isSelected = selectedRecord && (
            selectedRecord.row_id === rec.row_id || 
            (po !== '' && (selectedRecord.customer_po || '').trim() === po)
        );
        
        if (isSelected) {
            tr.classList.add('selected');
        }
        
        const trackingInputVal = isSelected && inputOutboundTracking ? inputOutboundTracking.value : '';
        const { statusClass, statusLabel } = getShippingInvoiceStatus(rec, trackingInputVal);
        
        // Truncate desc for table
        const shortDesc = rec.part_received.length > 35 ? rec.part_received.substring(0, 35) + '...' : rec.part_received;
        
        const rmsDisplay = isChild ? `↳ ${rec.rms_po || 'N/A'}` : `<strong>${rec.rms_po || 'N/A'}</strong>`;
        
        tr.innerHTML = `
            <td>${rmsDisplay}</td>
            <td>${rec.customer || 'N/A'}</td>
            <td>${rec.customer_po || 'N/A'}</td>
            <td title="${rec.part_received}">${shortDesc}</td>
            <td>${rec.outbound_date || rec.inbound_date || 'N/A'}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        `;
        
        tr.addEventListener('click', () => selectRow(rec, tr));
        tableBody.appendChild(tr);
    }
}

// Search Filter Handler
function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    
    if (query === '') {
        filteredRecords = [...records];
    } else {
        filteredRecords = records.filter(rec => {
            return (
                (rec.rms_po && rec.rms_po.toLowerCase().includes(query)) ||
                (rec.customer_po && rec.customer_po.toLowerCase().includes(query)) ||
                (rec.customer && rec.customer.toLowerCase().includes(query)) ||
                (rec.vendor && rec.vendor.toLowerCase().includes(query)) ||
                (rec.part_received && rec.part_received.toLowerCase().includes(query)) ||
                (rec.outbound_date && rec.outbound_date.toLowerCase().includes(query)) ||
                (rec.inbound_date && rec.inbound_date.toLowerCase().includes(query))
            );
        });
    }
    
    currentPage = 1;
    renderTable();
}

// Pagination Changer
function changePage(direction) {
    const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderTable();
    }
}

// Smart Regex Parser for Part Received
function parsePartReceived(str) {
    let qty = 1;
    let partNum = "";
    let desc = str;

    // 1. Extract Qty: Matches "QTY 4" or "QTY4" or "QTY: 4" or "QTY:4"
    const qtyRegex = /QTY\s*[:\-]?\s*(\d+)/i;
    const qtyMatch = str.match(qtyRegex);
    if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10);
    }

    // 2. Extract PN: Matches "PN 1-503-24-065" or "P/N 1-503-24-065" or "PN: 1" or "P/N:1"
    const pnRegex = /P[/\-]?N\s*[:\-]?\s*([A-Z0-9_\-\.\/]+)/i;
    const pnMatch = str.match(pnRegex);
    if (pnMatch) {
        partNum = pnMatch[1].trim();
    }

    // 3. Clean description by removing QTY and PN parts
    desc = str.replace(/QTY\s*[:\-]?\s*\d+/i, '');
    desc = desc.replace(/P[/\-]?N\s*[:\-]?\s*[A-Z0-9_\-\.\/]+/i, '');
    
    // Clean up punctuation leftovers
    desc = desc.replace(/^\s*[\s,\.\-:]+\s*/, '');
    desc = desc.replace(/\s*[\s,\.\-:]+\s*$/, '');
    desc = desc.replace(/\s+/g, ' ').trim();

    return { qty, partNum, desc };
}

// Format current date as MM/DD/YYYY
function getFormattedToday() {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

// Select a Row & Populate Editor Panel
function selectRow(record, trElement) {
    selectedRecord = record;
    
    // Highlight all rows in the group in the table
    const po = (record.customer_po || '').trim();
    const rows = tableBody.getElementsByTagName('tr');
    for (let r of rows) {
        const rowPo = r.getAttribute('data-po');
        if (po && rowPo === po) {
            r.classList.add('selected');
        } else if (r.getAttribute('data-row-id') == record.row_id) {
            r.classList.add('selected');
        } else {
            r.classList.remove('selected');
        }
    }
    
    // Reveal editor panel, hide empty state
    emptyState.classList.add('hidden');
    editorContent.classList.remove('hidden');
    
    // Get all records in the group
    let groupRecords = [record];
    if (po) {
        groupRecords = records.filter(r => (r.customer_po || '').trim() === po);
    }
    
    // Populate header info listing all RMS POs in group
    poTitle.textContent = groupRecords.map(r => r.rms_po || 'N/A').join(', ');
    
    // Map customer standard address & notes templates
    let customerType = 'DEFAULT';
    const custNameUpper = (record.customer || '').toUpperCase();
    if (custNameUpper.includes('GE')) {
        customerType = 'GE';
    } else if (custNameUpper.includes('JORD')) {
        customerType = 'JORDS';
    }
    
    // Dynamically build and render item cards
    const itemsContainer = document.getElementById('items-container');
    itemsContainer.innerHTML = '';
    
    groupRecords.forEach((item, index) => {
        const parsed = parsePartReceived(item.part_received);
        const defaultHs = customerType === 'JORDS' ? '8481.80.3060' : '3926.90.9985';
        
        const card = document.createElement('div');
        card.className = 'item-edit-card';
        card.innerHTML = `
            <div class="item-card-header">
                <h4>Line #${index + 1} — RMS P.O: ${item.rms_po || 'N/A'}</h4>
                <input type="hidden" class="item-rms-po" value="${item.rms_po || ''}">
            </div>
            <div class="form-grid">
                <div class="form-group span-2">
                    <label>Item Description</label>
                    <input type="text" class="item-part-received input-readonly" value="${item.part_received || ''}" readonly>
                </div>
                <div class="form-group">
                    <label>Line Number</label>
                    <input type="text" class="item-line-num" value="${index + 1}">
                </div>
                <div class="form-group">
                    <label>Part Number</label>
                    <input type="text" class="item-part-num" value="${parsed.partNum}">
                </div>
                <div class="form-group span-2">
                    <label>Description</label>
                    <input type="text" class="item-part-desc" value="${parsed.desc}">
                </div>
                <div class="form-group">
                    <label>Quantity Received</label>
                    <input type="number" class="item-qty" min="0" value="${parsed.qty}">
                </div>
                <div class="form-group">
                    <label>Backordered Qty</label>
                    <input type="number" class="item-backordered" min="0" value="0">
                </div>
                <div class="form-group">
                    <label>HS Code</label>
                    <input type="text" class="item-hs-code" value="${item.hs_code || defaultHs}">
                </div>
                <div class="form-group">
                    <label>Invoice Amount ($)</label>
                    <input type="text" class="item-amount" value="120.00">
                </div>
            </div>
            <!-- Item Linked Captures List (Requirement 3: above Accepted row) -->
            <div class="item-linked-images-container ${(item.captures && item.captures.length > 0) ? '' : 'hidden'}" style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--card-border);">
                <label style="font-weight: 600; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 6px; display: block;">Linked Images</label>
                <div class="item-linked-images-list" style="display: flex; flex-direction: column; gap: 6px; background: var(--input-bg); border-radius: 8px; padding: 8px; border: 1px solid var(--input-border); max-height: 120px; overflow-y: auto;">
                    <!-- Dynamic capture image links rendered here -->
                </div>
            </div>

            <!-- Requirement 1: Capture Image button in item details section on same row as Accepted checkbox with space-between alignment -->
            <div class="item-acceptance-row" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--card-border); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" class="item-accepted-checkbox" id="accept-item-${index}" style="width: auto; height: auto; cursor: pointer;">
                    <label for="accept-item-${index}" style="font-size: 12px; font-weight: 600; cursor: pointer; color: var(--text-primary); margin: 0;">Accepted</label>
                </div>
                <button type="button" class="btn btn-secondary btn-capture-item-image" style="padding: 4px 10px; font-size: 12px; width: auto;">
                    <span class="btn-icon">📷</span> Capture a image
                </button>
            </div>
        `;
        itemsContainer.appendChild(card);

        // Render item captures list if available
        const linkedList = card.querySelector('.item-linked-images-list');
        if (linkedList && item.captures && item.captures.length > 0) {
            item.captures.forEach(img => {
                const imgItem = document.createElement('div');
                imgItem.style.display = 'flex';
                imgItem.style.alignItems = 'center';
                imgItem.style.justifyContent = 'space-between';
                imgItem.style.padding = '4px 8px';
                imgItem.style.background = 'rgba(255, 255, 255, 0.05)';
                imgItem.style.borderRadius = '4px';
                imgItem.style.fontSize = '12px';
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = `📷 ${img.name}`;
                nameSpan.style.cursor = 'pointer';
                nameSpan.style.textDecoration = 'underline';
                nameSpan.style.flexGrow = '1';
                nameSpan.style.marginRight = '8px';
                nameSpan.style.whiteSpace = 'nowrap';
                nameSpan.style.overflow = 'hidden';
                nameSpan.style.textOverflow = 'ellipsis';
                nameSpan.addEventListener('click', () => {
                    openFileLocally(img.path);
                });
                
                const openBtn = document.createElement('button');
                openBtn.type = 'button';
                openBtn.textContent = 'Open';
                openBtn.style.padding = '2px 6px';
                openBtn.style.fontSize = '10px';
                openBtn.style.background = 'var(--primary-color)';
                openBtn.style.border = 'none';
                openBtn.style.borderRadius = '4px';
                openBtn.style.color = '#fff';
                openBtn.style.cursor = 'pointer';
                openBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openFileLocally(img.path);
                });
                
                imgItem.appendChild(nameSpan);
                imgItem.appendChild(openBtn);
                linkedList.appendChild(imgItem);
            });
        }

        // Bind Capture Image button listener for this specific item record
        const btnCaptureItemImage = card.querySelector('.btn-capture-item-image');
        if (btnCaptureItemImage) {
            btnCaptureItemImage.addEventListener('click', () => {
                openCapturesModalHandler(item);
            });
        }

        // Sync first item's line number with the global line number input
        const lineNumInput = card.querySelector('.item-line-num');
        if (index === 0 && inputLineNum) {
            lineNumInput.addEventListener('input', () => {
                inputLineNum.value = lineNumInput.value;
            });
        }

        // Accepted checkbox validation logic: ensure an image is captured and all input fields in item details have values
        const acceptedCb = card.querySelector('.item-accepted-checkbox');
        if (acceptedCb) {
            acceptedCb.addEventListener('change', (e) => {
                if (acceptedCb.checked) {
                    // Check if an image is captured/linked for this item
                    const linkedList = card.querySelector('.item-linked-images-list');
                    const hasCapturedImage = (item.captures && item.captures.length > 0) || (linkedList && linkedList.children.length > 0);
                    if (!hasCapturedImage) {
                        acceptedCb.checked = false;
                        showToast("Image Required", "Please capture an image for this item before checking Accepted.", null, true);
                        return;
                    }

                    const cardInputs = card.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])');
                    let blankFound = false;
                    cardInputs.forEach(input => {
                        if (!input.value || input.value.trim() === '') {
                            blankFound = true;
                        }
                    });
                    if (blankFound) {
                        acceptedCb.checked = false;
                        showToast("Incomplete Item Details", "Please fill in all input fields in item details before accepting.", null, true);
                    }
                }
            });

            // If an item detail input field becomes blank, reset Accepted status if checked
            const cardInputs = card.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"])');
            cardInputs.forEach(input => {
                input.addEventListener('input', () => {
                    if (acceptedCb.checked && (!input.value || input.value.trim() === '')) {
                        acceptedCb.checked = false;
                        showToast("Accepted Reset", "Item detail field is blank. Accepted status has been unchecked.", null, true);
                    }
                });
            });
        }
    });
    
    // Fill in shared Form Inputs
    inputCustomerPo.value = record.customer_po || '';
    if (inputLineNum) {
        inputLineNum.value = '1';
    }
    inputShippedDate.value = record.shipped_date || getFormattedToday();
    
    // Pre-fill Order Date (outbound_date if exists, else inbound_date)
    inputOrderDate.value = record.outbound_date || record.inbound_date || getFormattedToday();
    
    // Pre-fill Weight & Dimensions
    inputWeight.value = record.outbound_weight || record.inbound_weight || '2 LBS';
    
    if (record.outbound_l) {
        inputOutboundL.value = record.outbound_l;
        inputOutboundW.value = record.outbound_w;
        inputOutboundH.value = record.outbound_h;
    } else if (record.inbound_l) {
        inputOutboundL.value = record.inbound_l;
        inputOutboundW.value = record.inbound_w;
        inputOutboundH.value = record.inbound_h;
    } else {
        inputOutboundL.value = '13';
        inputOutboundW.value = '11';
        inputOutboundH.value = '5';
    }
    
    // Pre-fill Carrier (Dropdown)
    if (inputCarrier) {
        const rawCarrier = (record.outbound_carrier || '').trim();
        if (rawCarrier) {
            const options = Array.from(inputCarrier.options).map(o => o.value);
            const matchedOption = options.find(opt => opt.toLowerCase() === rawCarrier.toLowerCase());
            if (matchedOption) {
                inputCarrier.value = matchedOption;
            } else {
                inputCarrier.value = 'Others';
            }
        } else {
            inputCarrier.value = '';
        }
    }
    if (inputOutboundTracking) {
        inputOutboundTracking.value = record.outbound_tracking || '';
    }

    customerEmails = [];
    if (record && record.customer_contact) {
        const contact = record.customer_contact.toString().trim();
        const emailMatches = contact.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
        if (emailMatches) {
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            emailMatches.forEach(email => {
                const clean = email.trim();
                if (clean && emailRegex.test(clean) && !customerEmails.includes(clean)) {
                    customerEmails.push(clean);
                }
            });
        }
    }
    if (inputCustomerEmail) inputCustomerEmail.value = '';
    renderEmailTags();
    
    // Set Addresses
    txtSoldTo.value = ADDRESSES[customerType].sold_to;
    txtShipTo.value = ADDRESSES[customerType].ship_to;
    
    // Prefill Jords notes if customer is Jords
    if (customerType === 'JORDS') {
        inputFreeReplacement.value = "Free replacement";
        txtNotesList.value = "1.Vent Plug need to be shipped loose.\n2.Usage of Teflon tape is prohibited.\n3.SS BOLTS LENGTH 2.25\"";
    } else {
        inputFreeReplacement.value = "";
        txtNotesList.value = "";
    }
    
    // Reset toast and scroll editor card into view
    closeToast();
    loadGeneratedFiles(record); // Clear/Load file list for the new selection
    renderLinkedImages(record); // Render linked shipping images
    updateCapturesPath();
    updateShippingLockState();
    document.getElementById('editor-card').scrollIntoView({ behavior: 'smooth' });
}

// Handle Form Submission: Dispatch data to backend API
function handleFormSubmit(e) {
    e.preventDefault();
    if (!selectedRecord) return;
    
    // Verify item acceptance
    const checkboxes = document.querySelectorAll('.item-accepted-checkbox');
    let allAccepted = true;
    checkboxes.forEach(cb => {
        if (!cb.checked) {
            allAccepted = false;
        }
    });
    
    if (!allAccepted) {
        showToast("Acceptance Required", "Please accept these items to generate documents.", null, true);
        return;
    }
    
    // Lock button state
    btnGenerate.disabled = true;
    btnGenerate.innerHTML = `<span class="btn-icon">⏳</span> Generating files...`;
    
    // Process notes list
    const rawNotes = txtNotesList.value.split('\n');
    const notesArray = rawNotes.map(n => n.trim()).filter(n => n !== "");
    
    // Calculate ref_num using PO suffix + RMS P.O.
    let refNum = "";
    const po = inputCustomerPo.value.trim();
    const rms = (selectedRecord.rms_po || '').trim();
    if (po && rms) {
        const poSuffix = po.length >= 5 ? po.substring(po.length - 5) : po;
        refNum = `${poSuffix}-${rms}`;
    }
    
    // Read all items from the dynamic cards
    const items = [];
    const cards = document.querySelectorAll('.item-edit-card');
    cards.forEach(card => {
        items.push({
            rms_po: card.querySelector('.item-rms-po').value,
            line_num: card.querySelector('.item-line-num').value,
            part_received: card.querySelector('.item-part-received').value,
            part_num: card.querySelector('.item-part-num').value,
            part_desc: card.querySelector('.item-part-desc').value,
            description: card.querySelector('.item-part-desc').value, // compatibility
            qty: card.querySelector('.item-qty').value,
            backordered: card.querySelector('.item-backordered').value,
            hs_code: card.querySelector('.item-hs-code').value,
            amount: card.querySelector('.item-amount').value
        });
    });
    
    // Top-level compatibility fields (using first item's details if items exist)
    const firstItem = items[0] || {};
    
    const requestData = {
        rms_po: selectedRecord.rms_po,
        customer_po: inputCustomerPo.value,
        part_num: firstItem.part_num || '',
        part_desc: firstItem.part_desc || '',
        description: firstItem.part_desc || '', // Compatibility
        qty: firstItem.qty || '0',
        backordered: firstItem.backordered || '0',
        hs_code: firstItem.hs_code || '',
        amount: firstItem.amount || '0.00',
        line_num: (inputLineNum ? inputLineNum.value : '') || firstItem.line_num || '1',
        date: inputShippedDate.value,
        order_date: inputOrderDate.value,
        weight: inputWeight.value,
        size: `${inputOutboundL.value.trim()}x${inputOutboundW.value.trim()}x${inputOutboundH.value.trim()}`,
        sold_to_address: txtSoldTo.value,
        ship_to_address: txtShipTo.value,
        free_replacement_note: inputFreeReplacement.value,
        notes: notesArray,
        ref_num: refNum,
        tax_id: "36-4426459",
        items: items
    };
    
    fetch('/api/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    })
    .then(res => res.json())
    .then(data => {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = `<span class="btn-icon">⚡</span> Generate All 3 Documents`;
        
        if (data.success) {
            showToast("Success", "All three files generated successfully in your Outputs folder!", data.files);
            loadGeneratedFiles(selectedRecord); // Load only files matching the current record
        } else {
            showToast("Generation Error", data.error || "Failed to generate documents", null, true);
        }
    })
    .catch(err => {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = `<span class="btn-icon">⚡</span> Generate All 3 Documents`;
        showToast("Server Error", "An error occurred on the server.", null, true);
        console.error("Submit Error:", err);
    });
}

function handleSaveShippingChanges(e) {
    if (!selectedRecord) return;

    if (currentUserRole !== 'admin') {
        let groupRecordsCheck = [selectedRecord];
        const poCheck = (selectedRecord.customer_po || '').trim();
        if (poCheck) {
            groupRecordsCheck = records.filter(r => (r.customer_po || '').trim() === poCheck);
        }
        const trackingInInput = inputOutboundTracking ? inputOutboundTracking.value.trim() : '';
        if (isShippingGroupCompleted(groupRecordsCheck) || trackingInInput !== '') {
            showToast("Access Denied", "This order is completed (Tracking / Pro # present). Only an Admin can edit details. Please ask an admin to make changes.", null, true);
            return;
        }
    }

    const saveBtn = document.getElementById('btn-save-shipping-changes');
    const originalText = saveBtn.innerHTML;

    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="btn-icon">⏳</span> Saving...`;

    const po = (selectedRecord.customer_po || '').trim();
    let groupRecords = [selectedRecord];
    if (po) {
        groupRecords = records.filter(r => (r.customer_po || '').trim() === po);
    }

    const cards = document.querySelectorAll('.item-edit-card');
    if (cards.length === 0) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        return;
    }

    const updates = [];

    // Read metadata inputs
    const customerPoVal = inputCustomerPo.value.trim();
    const orderDateVal = inputOrderDate.value.trim();
    const weightVal = inputWeight.value.trim();
    const shipToVal = txtShipTo.value.trim();
    const shippedDateVal = inputShippedDate.value.trim();
    const carrierVal = inputCarrier.value.trim();
    const outboundTrackingVal = inputOutboundTracking ? inputOutboundTracking.value.trim() : '';

    // Outbound dimensions
    const outL = inputOutboundL.value.trim();
    const outW = inputOutboundW.value.trim();
    const outH = inputOutboundH.value.trim();

    cards.forEach((card, index) => {
        const rec = groupRecords[index];
        if (!rec) return;

        const lineNumVal = card.querySelector('.item-line-num').value.trim();
        const partNumVal = card.querySelector('.item-part-num').value.trim();
        const descVal = card.querySelector('.item-part-desc').value.trim();
        const qtyVal = card.querySelector('.item-qty').value.trim();
        const hsCodeVal = card.querySelector('.item-hs-code').value.trim();

        // Reconstruct part_received
        const partReceivedVal = `QTY ${qtyVal} PN ${partNumVal} ${descVal}`;

        updates.push({
            row_id: rec.row_id,
            row_hash: rec.row_hash,
            customer_po: customerPoVal,
            outbound_date: orderDateVal,
            outbound_weight: weightVal,
            outbound_l: outL,
            outbound_w: outW,
            outbound_h: outH,
            shipped_date: shippedDateVal,
            outbound_carrier: carrierVal,
            outbound_tracking: outboundTrackingVal,
            ship_to: shipToVal,
            line_num: lineNumVal,
            hs_code: hsCodeVal,
            part_received: partReceivedVal
        });
    });

    fetch('/api/update-records', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
    })
    .then(res => res.json())
    .then(data => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;

        if (data.success) {
            showToast("Changes Saved", `Successfully updated ${updates.length} records in the Excel sheet.`, null, false);
            
            // Reload database to refresh table data
            loadDatabase();
        } else {
            showToast("Save Error", data.error || "Failed to save changes", null, true);
        }
    })
    .catch(err => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        showToast("Server Error", "An error occurred while saving changes.", null, true);
        console.error("Save Changes Error:", err);
    });
}

function handleSendEmail(e) {
    if (!selectedRecord) {
        showToast("Error", "No record selected.", null, true);
        return;
    }
    
    // Auto-add any pending text typed in input Customer Email box
    if (inputCustomerEmail && inputCustomerEmail.value.trim().length > 0) {
        addCustomerEmail(inputCustomerEmail.value);
        inputCustomerEmail.value = '';
    }
    
    if (customerEmails.length === 0) {
        showToast("Validation Error", "Please enter at least one customer email address.", null, true);
        if (inputCustomerEmail) inputCustomerEmail.focus();
        return;
    }
    
    btnSendEmail.disabled = true;
    const originalContent = btnSendEmail.innerHTML;
    btnSendEmail.innerHTML = `<span class="btn-icon">⏳</span> Sending...`;
    
    const customerPoVal = inputCustomerPo.value.trim();
    const orderDateVal = inputOrderDate.value.trim();
    const weightVal = inputWeight.value.trim();
    const shipToVal = txtShipTo.value.trim();
    const shippedDateVal = inputShippedDate.value.trim();
    const carrierVal = inputCarrier.value.trim();
    const outboundTrackingVal = inputOutboundTracking ? inputOutboundTracking.value.trim() : '';
    
    const cards = document.querySelectorAll('.item-edit-card');
    let partReceivedVal = selectedRecord.part_received;
    if (cards.length > 0) {
        const lines = [];
        cards.forEach(card => {
            const qtyVal = card.querySelector('.item-qty').value.trim();
            const partNumVal = card.querySelector('.item-part-num').value.trim();
            const descVal = card.querySelector('.item-part-desc').value.trim();
            lines.push(`QTY ${qtyVal} PN ${partNumVal} ${descVal}`);
        });
        partReceivedVal = lines.join('\n');
    }
    
    const recordPayload = {
        ...selectedRecord,
        customer_po: customerPoVal,
        outbound_date: orderDateVal,
        outbound_weight: weightVal,
        shipped_date: shippedDateVal,
        outbound_carrier: carrierVal,
        outbound_tracking: outboundTrackingVal,
        ship_to: shipToVal,
        part_received: partReceivedVal
    };
    
    fetch('/api/send-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            customer_emails: customerEmails,
            customer_email: customerEmails.join(', '),
            record: recordPayload
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.error || 'Server error'); });
        }
        return response.json();
    })
    .then(data => {
        showToast("Success", "Email sent successfully!", null, false);
        btnSendEmail.disabled = false;
        btnSendEmail.innerHTML = originalContent;
    })
    .catch(err => {
        showToast("Error Sending Email", err.message, null, true);
        btnSendEmail.disabled = false;
        btnSendEmail.innerHTML = originalContent;
        console.error("Email Error:", err);
    });
}

let toastTimeout = null;

// Toast notification helper with 7-second timer bar
function showToast(title, body, files = null, isError = false, durationMs = 7000) {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }

    toastTitle.textContent = title;
    toastBody.textContent = body;
    
    const progressBar = document.getElementById('toast-progress-bar');
    if (progressBar) {
        progressBar.style.transition = 'none';
        progressBar.style.width = '100%';
    }
    
    if (isError) {
        toast.style.borderColor = "#ef4444";
        toastIcon.textContent = "❌";
        toastIcon.style.color = "#ef4444";
        if (progressBar) progressBar.style.background = "#ef4444";
        toastLinks.classList.add('hidden');
    } else {
        toast.style.borderColor = "var(--accent-success)";
        toastIcon.textContent = "✔️";
        toastIcon.style.color = "var(--accent-success)";
        if (progressBar) progressBar.style.background = "var(--accent-success)";
        
        if (files) {
            toastLinks.classList.remove('hidden');
            
            // Set up clicks to open files locally using backend utility
            setupFileOpenLink('link-ps', files.printing_slip.path);
            setupFileOpenLink('link-ci', files.commercial_invoice.path);
            setupFileOpenLink('link-label', files.part_labels.path);
        } else {
            toastLinks.classList.add('hidden');
        }
    }
    
    toast.classList.remove('hidden');
    
    if (progressBar) {
        void progressBar.offsetWidth; // Force reflow for linear transition restart
        progressBar.style.transition = `width ${durationMs}ms linear`;
        progressBar.style.width = '0%';
    }
    
    toastTimeout = setTimeout(closeToast, durationMs);
}

function setupFileOpenLink(elementId, filepath) {
    const btn = document.getElementById(elementId);
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', () => {
        openFileLocally(filepath);
    });
}

function openFileLocally(filepath) {
    fetch(`/api/open-file?path=${encodeURIComponent(filepath)}`)
        .then(res => res.json())
        .then(data => {
            if (!data.success) console.error("Could not open file:", data.error);
        })
        .catch(err => console.error("Error opening file:", err));
}

function renderLinkedImages(record) {
    const container = document.getElementById('linked-images-container');
    const list = document.getElementById('linked-images-list');
    
    if (!container || !list) return;
    
    list.innerHTML = '';
    
    if (record && record.captures && record.captures.length > 0) {
        container.classList.remove('hidden');
        record.captures.forEach(img => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'space-between';
            item.style.padding = '4px 8px';
            item.style.background = 'rgba(255, 255, 255, 0.05)';
            item.style.borderRadius = '4px';
            item.style.fontSize = '12px';
            
            // Name label (clickable to open)
            const nameSpan = document.createElement('span');
            nameSpan.textContent = `📷 ${img.name}`;
            nameSpan.style.cursor = 'pointer';
            nameSpan.style.textDecoration = 'underline';
            nameSpan.style.flexGrow = '1';
            nameSpan.style.marginRight = '8px';
            nameSpan.style.whiteSpace = 'nowrap';
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';
            nameSpan.addEventListener('click', () => {
                openFileLocally(img.path);
            });
            
            // Open button
            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.textContent = 'Open';
            openBtn.style.padding = '2px 6px';
            openBtn.style.fontSize = '10px';
            openBtn.style.background = 'var(--primary-color)';
            openBtn.style.border = 'none';
            openBtn.style.borderRadius = '4px';
            openBtn.style.color = '#fff';
            openBtn.style.cursor = 'pointer';
            openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openFileLocally(img.path);
            });
            
            item.appendChild(nameSpan);
            item.appendChild(openBtn);
            list.appendChild(item);
        });
    } else {
        container.classList.add('hidden');
    }
}

// Fetch generated documents list and render matching files for selected record
function loadGeneratedFiles(record = null) {
    if (!record) {
        docsList.innerHTML = `<li class="empty-list-msg">No documents generated yet.</li>`;
        return;
    }
    
    const customerPoVal = inputCustomerPo.value.trim();
    const rmsPoVal = (record.rms_po || '').trim();
    
    const cleanPo = customerPoVal.replace(/[^a-zA-Z0-9\-_]/g, '');
    const cleanRms = rmsPoVal.replace(/[^a-zA-Z0-9\-_]/g, '');
    const suffix = `_${cleanPo}_${cleanRms}`;
    
    fetch('/api/generated-files')
        .then(res => res.json())
        .then(files => {
            if (!files || files.length === 0) {
                docsList.innerHTML = `<li class="empty-list-msg">No documents generated yet.</li>`;
                return;
            }
            
            // Filter files that match current generation suffix
            const matchingFiles = files.filter(file => {
                const name = file.name;
                return name.includes(suffix) && 
                       (name.startsWith('PS_') || name.startsWith('CI_') || name.startsWith('Label_'));
            });
            
            if (matchingFiles.length === 0) {
                docsList.innerHTML = `<li class="empty-list-msg">No documents generated yet.</li>`;
                return;
            }
            
            docsList.innerHTML = '';
            matchingFiles.forEach(file => {
                const li = document.createElement('li');
                li.className = 'doc-item';
                
                // Icon based on type
                let icon = '📄';
                if (file.name.endsWith('.pdf')) {
                    icon = '📄';
                } else if (file.name.endsWith('.docx')) {
                    icon = '📝';
                }
                
                const sizeKB = (file.size / 1024).toFixed(1);
                
                li.innerHTML = `
                    <div class="doc-info">
                        <span class="doc-icon">${icon}</span>
                        <div>
                            <div class="doc-name" title="${file.name}">${file.name}</div>
                            <div class="doc-size">${sizeKB} KB</div>
                        </div>
                    </div>
                    <div class="doc-meta">
                        <span class="btn-doc-open" style="color: var(--primary-color); font-weight: 600; font-size: 12px;">Open ↗</span>
                    </div>
                `;
                
                li.addEventListener('click', () => {
                    openFileLocally(file.path);
                });
                
                docsList.appendChild(li);
            });
        })
        .catch(err => {
            console.error("Error loading generated files:", err);
            docsList.innerHTML = `<li class="empty-list-msg">Error loading generated documents.</li>`;
        });
}

function openOutputsFolder() {
    fetch('/api/open-outputs-folder')
        .then(res => res.json())
        .then(data => {
            if (!data.success) console.error("Could not open folder:", data.error);
        });
}

function closeToast() {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
    if (toast) {
        toast.classList.add('hidden');
    }
}

function triggerFilePicker() {
    const originalFilenameText = dbFilename.textContent;
    dbFilename.textContent = "Selecting file...";
    const recDbFilename = document.getElementById('receiving-db-filename');
    if (recDbFilename) recDbFilename.textContent = "Selecting file...";

    fetch('/api/pick-file', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast("Database Selected", `Loaded: ${data.filename}`, null, false);
            loadDatabase();
        } else {
            // Restore text if cancelled or errored
            dbFilename.textContent = originalFilenameText;
            if (recDbFilename) recDbFilename.textContent = originalFilenameText;
            
            if (data.error) {
                showToast("Error", data.error, null, true);
            }
        }
    })
    .catch(err => {
        dbFilename.textContent = originalFilenameText;
        if (recDbFilename) recDbFilename.textContent = originalFilenameText;
        console.error("File pick error:", err);
        showToast("Error", "Could not trigger file picker.", null, true);
    });
}

// File Upload Handler
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Update filename text to show loading progress
    dbFilename.textContent = `Uploading ${file.name}...`;
    const recDbFilename = document.getElementById('receiving-db-filename');
    if (recDbFilename) recDbFilename.textContent = `Uploading ${file.name}...`;
    recordsCount.textContent = "Uploading...";
    
    const formData = new FormData();
    formData.append('file', file);
    
    fetch('/api/upload-database', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        // Clear both file input values
        dbFileInput.value = '';
        if (receivingDbFileInput) receivingDbFileInput.value = '';
        
        if (data.success) {
            dbFilename.textContent = data.filename;
            if (recDbFilename) recDbFilename.textContent = data.filename;
            
            if (data.type === 'excel') {
                sheetSelect.innerHTML = '';
                if (receivingSheetSelect) receivingSheetSelect.innerHTML = '';
                
                data.sheets.forEach(sheet => {
                    const opt1 = document.createElement('option');
                    opt1.value = sheet;
                    opt1.textContent = sheet;
                    if (sheet === data.selected_sheet) {
                        opt1.selected = true;
                    }
                    sheetSelect.appendChild(opt1);
                    
                    if (receivingSheetSelect) {
                        const opt2 = document.createElement('option');
                        opt2.value = sheet;
                        opt2.textContent = sheet;
                        if (sheet === data.selected_sheet) {
                            opt2.selected = true;
                        }
                        receivingSheetSelect.appendChild(opt2);
                    }
                });
                if (headerRowInput) headerRowInput.value = data.header_row || 1;
                if (receivingHeaderRowInput) receivingHeaderRowInput.value = data.header_row || 1;
                
                if (excelActionsRow) excelActionsRow.classList.remove('hidden');
                if (receivingExcelActionsRow) receivingExcelActionsRow.classList.remove('hidden');
            } else {
                if (excelActionsRow) excelActionsRow.classList.add('hidden');
                if (receivingExcelActionsRow) receivingExcelActionsRow.classList.add('hidden');
                
                sheetSelect.innerHTML = '<option value="">Select Sheet...</option>';
                if (receivingSheetSelect) receivingSheetSelect.innerHTML = '<option value="">Select Sheet...</option>';
                
                if (headerRowInput) headerRowInput.value = 1;
                if (receivingHeaderRowInput) receivingHeaderRowInput.value = 1;
            }
            
            setRecords(data.records);
            currentPage = 1;
            recordsCount.textContent = `${records.length} records loaded`;
            
            // Clear selections
            selectedRecord = null;
            emptyState.classList.remove('hidden');
            editorContent.classList.add('hidden');
            
            // Reset search input
            searchInput.value = '';
            
            // Reset receiving selection
            selectedReceivingRowIds.clear();
            activeReceivingRecords = [];
            receivingReports = {};
            uploadedPhotoName = '';
            const recEmptyState = document.getElementById('receiving-empty-state');
            const recEditorContent = document.getElementById('receiving-editor-content');
            if (recEmptyState) recEmptyState.classList.remove('hidden');
            if (recEditorContent) recEditorContent.classList.add('hidden');
            
            renderTable();
            renderReceivingTable();
            showToast("Database Loaded", `Successfully loaded database file "${data.filename}".`, null, false);
        } else {
            showToast("Upload Error", data.error || "Failed to upload file", null, true);
            loadDatabase(); // Restore state
        }
    })
    .catch(err => {
        console.error("Upload error:", err);
        showToast("Server Error", "An error occurred while uploading the file.", null, true);
        loadDatabase(); // Restore state
    });
}

// Sheet Change Handler
function handleSheetChange(e) {
    const selectedSheet = e.target.value;
    if (!selectedSheet) return;
    
    recordsCount.textContent = "Loading sheet...";
    
    // Read header row value from whichever input is active
    const headerRowVal = (receivingHeaderRowInput && e.target === receivingHeaderRowInput) ? 
        (receivingHeaderRowInput.value || 1) : 
        (headerRowInput ? (headerRowInput.value || 1) : 1);
    
    fetch('/api/load-sheet', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            sheet_name: selectedSheet,
            header_row: headerRowVal
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            setRecords(data.records);
            currentPage = 1;
            recordsCount.textContent = `${records.length} records loaded`;
            
            // Sync selected sheet value on both dropdowns
            sheetSelect.value = selectedSheet;
            if (receivingSheetSelect) receivingSheetSelect.value = selectedSheet;
            
            // Clear selections
            selectedRecord = null;
            emptyState.classList.remove('hidden');
            editorContent.classList.add('hidden');
            
            // Reset search input
            searchInput.value = '';
            
            // Reset receiving selection
            selectedReceivingRowIds.clear();
            activeReceivingRecords = [];
            receivingReports = {};
            uploadedPhotoName = '';
            const recEmptyState = document.getElementById('receiving-empty-state');
            const recEditorContent = document.getElementById('receiving-editor-content');
            if (recEmptyState) recEmptyState.classList.remove('hidden');
            if (recEditorContent) recEditorContent.classList.add('hidden');
            
            renderTable();
            renderReceivingTable();
            showToast("Sheet Loaded", `Successfully loaded sheet "${selectedSheet}".`, null, false);
        } else {
            showToast("Load Error", data.error || "Failed to load sheet", null, true);
            loadDatabase(); // Restore state
        }
    })
    .catch(err => {
        console.error("Sheet change error:", err);
        showToast("Server Error", "An error occurred while loading the sheet.", null, true);
        loadDatabase(); // Restore state
    });
}

// Header Row Change Handler
function handleHeaderRowChange(e) {
    let inputEl = headerRowInput;
    if (e && e.target) {
        inputEl = e.target;
    }
    const headerRowVal = parseInt(inputEl.value, 10);
    if (isNaN(headerRowVal) || headerRowVal < 1) {
        showToast("Invalid Input", "Header row must be a positive number.", null, true);
        return;
    }
    
    const selectedSheet = (inputEl === receivingHeaderRowInput) ? 
        (receivingSheetSelect.value) : 
        (sheetSelect.value);
        
    recordsCount.textContent = "Updating header row...";
    
    fetch('/api/load-sheet', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            sheet_name: selectedSheet,
            header_row: headerRowVal
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            setRecords(data.records);
            currentPage = 1;
            recordsCount.textContent = `${records.length} records loaded`;
            
            // Sync values to both header inputs
            headerRowInput.value = data.header_row;
            if (receivingHeaderRowInput) receivingHeaderRowInput.value = data.header_row;
            
            // Also sync sheet select values if needed
            sheetSelect.value = selectedSheet;
            if (receivingSheetSelect) receivingSheetSelect.value = selectedSheet;
            
            // Clear selections
            selectedRecord = null;
            emptyState.classList.remove('hidden');
            editorContent.classList.add('hidden');
            
            // Reset search input
            searchInput.value = '';
            
            // Reset receiving selection
            selectedReceivingRowIds.clear();
            activeReceivingRecords = [];
            receivingReports = {};
            uploadedPhotoName = '';
            const recEmptyState = document.getElementById('receiving-empty-state');
            const recEditorContent = document.getElementById('receiving-editor-content');
            if (recEmptyState) recEmptyState.classList.remove('hidden');
            if (recEditorContent) recEditorContent.classList.add('hidden');
            
            renderTable();
            renderReceivingTable();
            showToast("Header Row Applied", `Successfully loaded records starting from row ${data.header_row}.`, null, false);
        } else {
            showToast("Load Error", data.error || "Failed to apply header row", null, true);
            loadDatabase(); // Restore state
        }
    })
    .catch(err => {
        console.error("Header row change error:", err);
        showToast("Server Error", "An error occurred while changing the header row.", null, true);
        loadDatabase(); // Restore state
    });
}

// Order Entry Helper & Handlers
function prefillOrderEntryDefaults() {
    const inboundDateInput = document.getElementById('oe-inbound-date');
    const outboundDateInput = document.getElementById('oe-outbound-date');
    const statusSelect = document.getElementById('oe-invoice-status');
    const lineNumInput = document.getElementById('oe-line-num');

    if (inboundDateInput && !inboundDateInput.value) {
        inboundDateInput.value = getFormattedToday();
    }
    if (outboundDateInput && !outboundDateInput.value) {
        outboundDateInput.value = getFormattedToday();
    }
    if (statusSelect) {
        statusSelect.value = '';
    }
    if (lineNumInput) {
        lineNumInput.value = '1';
    }
}

function handleOrderEntrySubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const saveBtn = document.getElementById('btn-save-order');
    const originalText = saveBtn.innerHTML;
    
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="btn-icon">⏳</span> Saving...`;
    
    const getOeVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };
    
    // Collect order entry fields
    const orderData = {
        inbound_date: getOeVal('oe-inbound-date'),
        rms_po: getOeVal('oe-rms-po'),
        part_received: getOeVal('oe-part-received'),
        vendor: getOeVal('oe-vendor'),
        promise_date: getOeVal('oe-promise-date'),
        inbound_notes: getOeVal('oe-inbound-notes'),
        vendor_contact: getOeVal('oe-vendor-contact'),
        received_date: getOeVal('oe-received-date'),
        inbound_carrier: getOeVal('oe-inbound-carrier'),
        inbound_tracking: getOeVal('oe-inbound-tracking'),
        inbound_l: getOeVal('oe-inbound-l'),
        inbound_w: getOeVal('oe-inbound-w'),
        inbound_h: getOeVal('oe-inbound-h'),
        inbound_weight: getOeVal('oe-inbound-weight'),
        inbound_charges: getOeVal('oe-inbound-charges'),
        outbound_date: getOeVal('oe-outbound-date'),
        customer: getOeVal('oe-customer'),
        customer_po: getOeVal('oe-customer-po'),
        rms_invoice: getOeVal('oe-rms-invoice'),
        ship_to: getOeVal('oe-ship-to'),
        line_num: getOeVal('oe-line-num'),
        hs_code: getOeVal('oe-hs-code'),
        shipped_date: getOeVal('oe-shipped-date'),
        invoice_status: getOeVal('oe-invoice-status'),
        outbound_l: getOeVal('oe-outbound-l'),
        outbound_w: getOeVal('oe-outbound-w'),
        outbound_h: getOeVal('oe-outbound-h'),
        outbound_weight: getOeVal('oe-outbound-weight'),
        outbound_carrier: getOeVal('oe-outbound-carrier'),
        outbound_tracking: getOeVal('oe-outbound-tracking'),
        crating_charges: getOeVal('oe-crating-charges'),
        shipping_charges: getOeVal('oe-shipping-charges'),
        customer_contact: getOeVal('oe-customer-contact'),
        outbound_notes: getOeVal('oe-outbound-notes'),
    };
    
    fetch('/api/save-order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
    })
    .then(res => res.json())
    .then(data => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        
        if (data.success) {
            showToast("Order Saved", "New order added to the database successfully!", null, false);
            form.reset();
            
            // Reload the database records
            fetch('/api/records')
                .then(res => res.json())
                .then(recordsList => {
                    setRecords(recordsList);
                    recordsCount.textContent = `${records.length} records loaded`;
                    renderTable();
                    renderReceivingTable();
                    
                    // Switch back to Dashboard page
                    const tabDashboard = document.getElementById('tab-dashboard');
                    if (tabDashboard) tabDashboard.click();
                    
                    // Find and select the newly added row
                    const newRmsPo = orderData.rms_po.trim();
                    const newCustPo = orderData.customer_po.trim();
                    
                    const matchedRecord = records.find(r => 
                        (r.rms_po || '').trim() === newRmsPo && 
                        (r.customer_po || '').trim() === newCustPo
                    );
                    
                    if (matchedRecord) {
                        const itemIndex = filteredRecords.findIndex(r => r.row_id === matchedRecord.row_id);
                        if (itemIndex !== -1) {
                            currentPage = Math.floor(itemIndex / rowsPerPage) + 1;
                            renderTable();
                            
                            // Select row in table after DOM update
                            setTimeout(() => {
                                const trs = document.querySelectorAll('#table-body tr');
                                for (let tr of trs) {
                                    if (tr.getAttribute('data-row-id') == matchedRecord.row_id) {
                                        tr.click();
                                        break;
                                    }
                                }
                            }, 100);
                        }
                    }
                })
                .catch(err => {
                    console.error("Error reloading database:", err);
                });
        } else {
            showToast("Save Error", data.error || "Failed to save order", null, true);
        }
    })
    .catch(err => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        showToast("Server Error", "An error occurred on the server.", null, true);
        console.error("Save Error:", err);
    });
}

// ==========================================
// RECEIVING VIEW IMPLEMENTATION
// ==========================================

// Render Receiving Table
function renderReceivingTable() {
    const recTableBody = document.getElementById('receiving-table-body');
    const recPageIndicator = document.getElementById('receiving-page-indicator');
    const recPrevPageBtn = document.getElementById('receiving-prev-page');
    const recNextPageBtn = document.getElementById('receiving-next-page');
    
    if (!recTableBody) return;
    
    // Set filtered records based on search
    const searchVal = document.getElementById('receiving-search-input')?.value.toLowerCase().trim() || '';
    if (searchVal === '') {
        receivingFilteredRecords = [...records];
    } else {
        receivingFilteredRecords = records.filter(rec => {
            return (
                (rec.rms_po && rec.rms_po.toLowerCase().includes(searchVal)) ||
                (rec.customer_po && rec.customer_po.toLowerCase().includes(searchVal)) ||
                (rec.customer && rec.customer.toLowerCase().includes(searchVal)) ||
                (rec.vendor && rec.vendor.toLowerCase().includes(searchVal)) ||
                (rec.part_received && rec.part_received.toLowerCase().includes(searchVal)) ||
                (rec.outbound_date && rec.outbound_date.toLowerCase().includes(searchVal)) ||
                (rec.inbound_date && rec.inbound_date.toLowerCase().includes(searchVal))
            );
        });
    }
    
    if (receivingFilteredRecords.length === 0) {
        recTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px;">No records found matching search.</td></tr>`;
        if (recPageIndicator) recPageIndicator.textContent = 'Page 0 of 0';
        if (recPrevPageBtn) recPrevPageBtn.disabled = true;
        if (recNextPageBtn) recNextPageBtn.disabled = true;
        return;
    }
    
    const startIdx = (receivingCurrentPage - 1) * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, receivingFilteredRecords.length);
    const totalPages = Math.ceil(receivingFilteredRecords.length / rowsPerPage);
    
    if (recPageIndicator) recPageIndicator.textContent = `Page ${receivingCurrentPage} of ${totalPages}`;
    if (recPrevPageBtn) recPrevPageBtn.disabled = receivingCurrentPage === 1;
    if (recNextPageBtn) recNextPageBtn.disabled = receivingCurrentPage === totalPages;
    
    recTableBody.innerHTML = '';
    
    for (let i = startIdx; i < endIdx; i++) {
        const rec = receivingFilteredRecords[i];
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        
        // Highlight active row if it's the selected one
        const isSelected = selectedReceivingRowIds.has(rec.row_id);
        if (isSelected) {
            tr.classList.add('receiving-selected');
        }
        
        const recTrackingEl = document.getElementById('rec-tracking');
        const trackingInputVal = isSelected && recTrackingEl ? recTrackingEl.value : '';
        const { statusClass, statusLabel } = getReceivingInvoiceStatus(rec, trackingInputVal);
        const shortDesc = rec.part_received.length > 35 ? rec.part_received.substring(0, 35) + '...' : rec.part_received;
        
        tr.innerHTML = `
            <td><strong>${rec.rms_po || 'N/A'}</strong></td>
            <td>${rec.customer || 'N/A'}</td>
            <td>${rec.customer_po || 'N/A'}</td>
            <td title="${rec.part_received}">${shortDesc}</td>
            <td>${rec.received_date || rec.inbound_date || 'N/A'}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        `;
        
        tr.addEventListener('click', () => {
            // Remove previous active classes in DOM for UI speed
            const rows = recTableBody.querySelectorAll('tr');
            rows.forEach(r => r.classList.remove('receiving-selected'));
            tr.classList.add('receiving-selected');
            
            // Set selection state
            selectedReceivingRowIds.clear();
            selectedReceivingRowIds.add(rec.row_id);
            
            // Load record details in editor
            handleReceiveAction();
        });
        
        recTableBody.appendChild(tr);
    }
}

function updateReceivingSelectionControls() {
    // No-op
}

function handleReceivingSearch() {
    receivingCurrentPage = 1;
    renderReceivingTable();
}

function changeReceivingPage(direction) {
    const totalPages = Math.ceil(receivingFilteredRecords.length / rowsPerPage);
    const newPage = receivingCurrentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        receivingCurrentPage = newPage;
        renderReceivingTable();
    }
}

function handleReceivingSelectAllChange(e) {
    // No-op
}

// Toggle recent scans list as a dropdown
function toggleScansDropdown() {
    const dropdown = document.getElementById('scans-dropdown-menu');
    const btn = document.getElementById('btn-check-scans-dropdown');
    if (!dropdown) return;
    
    if (!dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        return;
    }
    
    btn.disabled = true;
    btn.innerHTML = `⏳ Checking...`;
    
    fetch('/api/check-scans')
        .then(res => res.json())
        .then(data => {
            btn.disabled = false;
            btn.innerHTML = `🔍 Check for scans`;
            
            if (data.success && data.scans && data.scans.length > 0) {
                dropdown.innerHTML = '';
                
                data.scans.forEach(scan => {
                    const item = document.createElement('div');
                    item.className = 'scan-dropdown-item';
                    
                    let timeStr = '';
                    try {
                        timeStr = new Date(scan.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } catch(e) {
                        timeStr = scan.scannedAt;
                    }
                    
                    item.innerHTML = `
                        <span style="font-family: monospace; font-weight: 600; text-align: left;">${scan.trackingId}</span>
                        <span style="font-size: 11px; color: var(--text-secondary); opacity: 0.7; margin-left: 8px;">${timeStr}</span>
                    `;
                    
                    item.addEventListener('click', () => {
                        const trackingInput = document.getElementById('rec-tracking');
                        if (trackingInput) {
                            trackingInput.value = scan.trackingId;
                            trackingInput.dispatchEvent(new Event('input'));
                        }
                        dropdown.classList.add('hidden');
                        showToast("Scan Auto-Filled", `Tracking ID set to ${scan.trackingId}`, null, false);
                    });
                    
                    dropdown.appendChild(item);
                });
                
                dropdown.classList.remove('hidden');
            } else {
                dropdown.innerHTML = `
                    <div style="padding: 12px; text-align: center; font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
                        No scans found in the last 5 minutes.
                    </div>
                `;
                dropdown.classList.remove('hidden');
                showToast("No Scans Found", "No parcel scans in the last 5 minutes.", null, true);
            }
        })
        .catch(err => {
            btn.disabled = false;
            btn.innerHTML = `🔍 Check for scans`;
            console.error("Error fetching scans:", err);
            showToast("Fetch Failed", "Could not load scans from database.", null, true);
        });
}

// On clicking "Receive Selected"
function handleReceiveAction() {
    if (selectedReceivingRowIds.size === 0) return;
    
    activeReceivingRecords = records.filter(r => selectedReceivingRowIds.has(r.row_id));
    
    const emptyState = document.getElementById('receiving-empty-state');
    const editorContent = document.getElementById('receiving-editor-content');
    emptyState.classList.add('hidden');
    editorContent.classList.remove('hidden');
    
    const poTitle = document.getElementById('receiving-po-title');
    poTitle.textContent = activeReceivingRecords.length;
    
    // Reset/Pre-fill fields from the first selected record
    const firstRec = activeReceivingRecords[0];
    document.getElementById('rec-date').value = firstRec.received_date || getFormattedToday();
    document.getElementById('rec-courier').value = firstRec.inbound_carrier || '';
    document.getElementById('rec-tracking').value = firstRec.inbound_tracking || '';
    document.getElementById('rec-boxes').value = firstRec.no_of_boxes || '1';
    document.getElementById('rec-weight').value = firstRec.inbound_weight || '';
    document.getElementById('rec-l').value = firstRec.inbound_l || '';
    document.getElementById('rec-w').value = firstRec.inbound_w || '';
    document.getElementById('rec-h').value = firstRec.inbound_h || '';
    document.getElementById('rec-photo').value = firstRec.photo || '';
    
    // Photo preview setup
    const photoVal = firstRec.photo || '';
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview');
    if (photoVal) {
        previewImg.src = photoVal.startsWith('/uploads/') ? photoVal : '/uploads/' + photoVal;
        previewContainer.classList.remove('hidden');
        uploadedPhotoName = photoVal;
    } else {
        previewImg.src = '';
        previewContainer.classList.add('hidden');
        uploadedPhotoName = '';
    }
    
    // Populate dropdown selection for reports
    const recordSelect = document.getElementById('rec-record-select');
    recordSelect.innerHTML = '<option value="">Choose a record...</option>';
    activeReceivingRecords.forEach(rec => {
        const opt = document.createElement('option');
        opt.value = rec.row_id;
        const partDesc = rec.part_received.length > 40 ? rec.part_received.substring(0, 40) + '...' : rec.part_received;
        opt.textContent = `RMS PO: ${rec.rms_po || 'N/A'} - ${partDesc}`;
        
        if (receivingReports[rec.row_id] === undefined) {
            receivingReports[rec.row_id] = rec.report || '';
        }
        
        recordSelect.appendChild(opt);
    });
    
    document.getElementById('rec-report-input-group').classList.add('hidden');
    updateReceivingLockState();
}

// Individual Report selection handling
function handleReportRecordSelectChange() {
    const recordSelect = document.getElementById('rec-record-select');
    const selectedRowId = recordSelect.value;
    const reportInputGroup = document.getElementById('rec-report-input-group');
    const reportTextarea = document.getElementById('rec-report-text');
    
    if (!selectedRowId) {
        reportInputGroup.classList.add('hidden');
        return;
    }
    
    if (!reportInputGroup.classList.contains('hidden')) {
        reportTextarea.value = receivingReports[selectedRowId] || '';
    }
}

function handleOpenReportClick() {
    const recordSelect = document.getElementById('rec-record-select');
    const selectedRowId = recordSelect.value;
    const reportInputGroup = document.getElementById('rec-report-input-group');
    const reportTextarea = document.getElementById('rec-report-text');
    
    if (!selectedRowId) {
        showToast("Record Required", "Please select a record from the dropdown first.", null, true);
        return;
    }
    
    reportInputGroup.classList.remove('hidden');
    reportTextarea.value = receivingReports[selectedRowId] || '';
    reportTextarea.focus();
}

function handleReportTextareaInput() {
    const recordSelect = document.getElementById('rec-record-select');
    const selectedRowId = recordSelect.value;
    const reportTextarea = document.getElementById('rec-report-text');
    
    if (selectedRowId) {
        receivingReports[selectedRowId] = reportTextarea.value;
    }
}

// Photo Upload handlers
function handleUploadPhotoClick() {
    document.getElementById('rec-photo-file').click();
}

function handlePhotoFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const uploadBtn = document.getElementById('btn-upload-photo');
    const photoInput = document.getElementById('rec-photo');
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview');
    
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    const formData = new FormData();
    formData.append('file', file);
    
    fetch('/api/upload-photo', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📷 Choose Photo';
        
        if (data.success) {
            uploadedPhotoName = data.filename;
            photoInput.value = data.filename;
            
            previewImg.src = data.url;
            previewContainer.classList.remove('hidden');
            
            showToast("Photo Uploaded", "Photo uploaded successfully!", null, false);
        } else {
            showToast("Upload Error", data.error || "Failed to upload photo", null, true);
        }
    })
    .catch(err => {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📷 Choose Photo';
        showToast("Server Error", "An error occurred while uploading photo.", null, true);
        console.error("Photo upload error:", err);
    });
}

// Save receiving edits back to Excel/CSV
function handleReceivingSave(e) {
    e.preventDefault();
    if (activeReceivingRecords.length === 0) return;

    if (currentUserRole !== 'admin') {
        const recTrackingEl = document.getElementById('rec-tracking');
        const trackingInInput = recTrackingEl ? recTrackingEl.value.trim() : '';
        if (isReceivingGroupCompleted(activeReceivingRecords) || trackingInInput !== '') {
            showToast("Access Denied", "This order is completed (Tracking / Pro # present). Only an Admin can edit details. Please ask an admin to make changes.", null, true);
            return;
        }
    }
    
    const saveBtn = document.getElementById('btn-save-receiving');
    const originalText = saveBtn.innerHTML;
    
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="btn-icon">⏳</span> Saving...`;
    
    const dateVal = document.getElementById('rec-date').value.trim();
    const courierVal = document.getElementById('rec-courier').value.trim();
    const trackingVal = document.getElementById('rec-tracking').value.trim();
    const boxesVal = document.getElementById('rec-boxes').value.trim();
    const weightVal = document.getElementById('rec-weight').value.trim();
    const lVal = document.getElementById('rec-l').value.trim();
    const wVal = document.getElementById('rec-w').value.trim();
    const hVal = document.getElementById('rec-h').value.trim();
    const photoVal = document.getElementById('rec-photo').value.trim();
    
    const updates = activeReceivingRecords.map(rec => {
        return {
            row_id: rec.row_id,
            row_hash: rec.row_hash,
            received_date: dateVal,
            inbound_carrier: courierVal,
            inbound_tracking: trackingVal,
            no_of_boxes: boxesVal,
            inbound_weight: weightVal,
            inbound_l: lVal,
            inbound_w: wVal,
            inbound_h: hVal,
            photo: photoVal,
            report: receivingReports[rec.row_id] || ''
        };
    });
    
    fetch('/api/update-records', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
    })
    .then(res => res.json())
    .then(data => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        
        if (data.success) {
            showToast("Records Saved", `Successfully updated ${updates.length} records in the database.`, null, false);
            
            selectedReceivingRowIds.clear();
            activeReceivingRecords = [];
            receivingReports = {};
            uploadedPhotoName = '';
            
            document.getElementById('receiving-form').reset();
            document.getElementById('photo-preview-container').classList.add('hidden');
            document.getElementById('photo-preview').src = '';
            document.getElementById('rec-report-input-group').classList.add('hidden');
            
            document.getElementById('receiving-empty-state').classList.remove('hidden');
            document.getElementById('receiving-editor-content').classList.add('hidden');
            
            loadDatabase();
        } else {
            showToast("Save Error", data.error || "Failed to update records", null, true);
        }
    })
    .catch(err => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
        showToast("Server Error", "An error occurred on the server.", null, true);
        console.error("Save receiving error:", err);
    });
}

let selectedCaptureIds = new Set();
let currentCaptureItem = null;

function openCapturesModalHandler(item = null) {
    if (!item && !selectedRecord) {
        showToast("Error", "No record selected.", null, true);
        return;
    }
    currentCaptureItem = item || selectedRecord;
    
    selectedCaptureIds.clear();
    if (btnLinkImages) {
        btnLinkImages.disabled = true;
    }
    if (capturesModal) {
        capturesModal.classList.remove('hidden');
    }
    updateCapturesPath();
    loadCaptures();
}

function closeCapturesModalHandler() {
    if (capturesModal) {
        capturesModal.classList.add('hidden');
    }
}

function refreshCapturesHandler() {
    loadCaptures();
}

function loadCaptures() {
    if (!capturesGrid) return;
    
    capturesGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">⏳ Loading captures...</div>`;
    
    fetch('/api/shipping-captures')
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            throw new Error(data.error || "Failed to fetch captures");
        }
        
        const captures = data.captures || [];
        if (captures.length === 0) {
            capturesGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">📷 No shipping captures found in database.</div>`;
            return;
        }
        
        capturesGrid.innerHTML = '';
        captures.forEach(cap => {
            const card = document.createElement('div');
            card.className = `capture-card ${selectedCaptureIds.has(cap.id) ? 'selected' : ''}`;
            card.setAttribute('data-id', cap.id);
            
            let timeStr = cap.capturedAt;
            try {
                const date = new Date(cap.capturedAt);
                timeStr = date.toLocaleString();
            } catch(e) {}
            
            card.innerHTML = `
                <div class="capture-image-wrapper">
                    <img src="${cap.image}" class="capture-image" alt="Capture">
                </div>
                <div class="capture-details">
                    <span class="capture-meta-item user-badge">${cap.username || 'unknown'}</span>
                    <span class="capture-meta-item time-label">📅 ${timeStr}</span>
                </div>
            `;
            
            card.addEventListener('click', () => {
                const id = cap.id;
                if (selectedCaptureIds.has(id)) {
                    selectedCaptureIds.delete(id);
                    card.classList.remove('selected');
                } else {
                    selectedCaptureIds.add(id);
                    card.classList.add('selected');
                }
                
                if (btnLinkImages) {
                    btnLinkImages.disabled = selectedCaptureIds.size === 0;
                }
            });
            
            capturesGrid.appendChild(card);
        });
    })
    .catch(err => {
        console.error("Load Captures Error:", err);
        capturesGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #f87171;">⚠️ Error: ${err.message || "Failed to load captures"}</div>`;
    });
}

let customBaseDirectory = "";

function updateCapturesPath() {
    const rec = currentCaptureItem || selectedRecord;
    if (!rec) return;
    
    const customerName = (rec.customer || (selectedRecord ? selectedRecord.customer : '') || '').trim();
    const customerPo = (inputCustomerPo ? inputCustomerPo.value.trim() : '') || (rec.customer_po || '').trim();
    const rmsPo = (rec.rms_po || '').trim();

    const cleanCustomer = customerName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || 'Customer';
    const cleanPo = customerPo.replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || 'PO';
    const cleanRms = rmsPo.replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || 'RMS';

    const folderName = `${cleanCustomer}_${cleanPo}_${cleanRms}`;
    
    const baseDir = customBaseDirectory || "Z:/shipping_captures";
    const finalPath = `${baseDir}/${folderName}`;
    
    if (shippingCapturesPath) {
        shippingCapturesPath.value = finalPath;
    }
}

function handleBrowseCapturesFolder() {
    if (btnBrowseCapturesFolder) {
        btnBrowseCapturesFolder.disabled = true;
        btnBrowseCapturesFolder.innerHTML = `⏳ Browsing...`;
    }
    
    fetch('/api/browse-directory', {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (btnBrowseCapturesFolder) {
            btnBrowseCapturesFolder.disabled = false;
            btnBrowseCapturesFolder.innerHTML = `📂 Browse`;
        }
        
        if (data.success && data.directory) {
            customBaseDirectory = data.directory;
            updateCapturesPath();
            showToast("Directory Updated", `Base directory set to: ${data.directory}`, null, false);
        } else if (data.message) {
            console.log(data.message);
        } else if (data.error) {
            showToast("Browse Error", data.error, null, true);
        }
    })
    .catch(err => {
        console.error("Browse Directory Error:", err);
        showToast("Error", "Could not trigger local directory selector.", null, true);
        if (btnBrowseCapturesFolder) {
            btnBrowseCapturesFolder.disabled = false;
            btnBrowseCapturesFolder.innerHTML = `📂 Browse`;
        }
    });
}

function linkImagesHandler() {
    const rec = currentCaptureItem || selectedRecord;
    if (!rec) return;
    if (selectedCaptureIds.size === 0) return;
    
    const folderPath = (shippingCapturesPath ? shippingCapturesPath.value : '').trim();
    if (!folderPath) {
        showToast("Validation Error", "Please ensure the destination folder path is specified.", null, true);
        return;
    }
    
    if (btnLinkImages) {
        btnLinkImages.disabled = true;
        btnLinkImages.innerHTML = `⏳ Linking...`;
    }
    
    fetch('/api/link-shipping-images', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            image_ids: Array.from(selectedCaptureIds),
            folder_path: folderPath,
            row_id: rec.row_id,
            customer_po: (inputCustomerPo ? inputCustomerPo.value.trim() : '') || rec.customer_po || '',
            rms_po: rec.rms_po || ''
        })
    })
    .then(res => res.json())
    .then(data => {
        if (btnLinkImages) {
            btnLinkImages.innerHTML = `🔗 Link images to current shipping`;
        }
        
        if (data.success) {
            showToast("Linked Successfully", data.message, null, false);
            closeCapturesModalHandler();
            loadDatabase();
        } else {
            showToast("Linking Error", data.error || "Failed to link images", null, true);
            if (btnLinkImages) {
                btnLinkImages.disabled = false;
            }
        }
    })
    .catch(err => {
        console.error("Link Images Error:", err);
        showToast("Server Error", "An error occurred while linking images.", null, true);
        if (btnLinkImages) {
            btnLinkImages.innerHTML = `🔗 Link images to current shipping`;
            btnLinkImages.disabled = false;
        }
    });
}
