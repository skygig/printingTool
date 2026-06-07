// State Variables
let records = [];
let filteredRecords = [];
let currentPage = 1;
const rowsPerPage = 12;
let selectedRecord = null;

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

const emptyState = document.getElementById('empty-state');
const editorContent = document.getElementById('editor-content');
const poTitle = document.getElementById('po-title');
const generatorForm = document.getElementById('generator-form');

const btnGenerate = document.getElementById('btn-generate');
const btnShowInFolder = document.getElementById('btn-show-in-folder');
const docsList = document.getElementById('docs-list');

// Toast elements
const toast = document.getElementById('toast');
const toastTitle = document.getElementById('toast-title');
const toastBody = document.getElementById('toast-body');
const toastLinks = document.getElementById('toast-links');
const toastIcon = document.getElementById('toast-icon');

// Form Input Elements
const inputPartReceived = document.getElementById('part_received');
const inputPartNum = document.getElementById('part_num');
const inputPartDesc = document.getElementById('part_desc');
const inputQty = document.getElementById('qty');
const inputBackordered = document.getElementById('backordered');
const inputHsCode = document.getElementById('hs_code');
const inputAmount = document.getElementById('amount');
const inputCustomerPo = document.getElementById('customer_po');
const inputLineNum = document.getElementById('line_num');
const inputDate = document.getElementById('date');
const inputOrderDate = document.getElementById('order_date');
const inputWeight = document.getElementById('weight');
const inputSize = document.getElementById('size');
const txtSoldTo = document.getElementById('sold_to_address');
const txtShipTo = document.getElementById('ship_to_address');
const inputFreeReplacement = document.getElementById('free_replacement_note');
const txtNotesList = document.getElementById('notes_list');

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
    loadDatabase();
    loadGeneratedFiles();
    
    // Bind Event Listeners
    searchInput.addEventListener('input', handleSearch);
    prevPageBtn.addEventListener('click', () => changePage(-1));
    nextPageBtn.addEventListener('click', () => changePage(1));
    generatorForm.addEventListener('submit', handleFormSubmit);
    btnShowInFolder.addEventListener('click', openOutputsFolder);
});

// Fetch CSV Data from API
function loadDatabase() {
    fetch('/api/records')
        .then(res => res.json())
        .then(data => {
            records = data;
            filteredRecords = [...records];
            recordsCount.textContent = `${records.length} records loaded`;
            renderTable();
        })
        .catch(err => {
            console.error("Error loading database:", err);
            recordsCount.textContent = "Error loading database";
        });
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
        
        if (selectedRecord && selectedRecord.row_id === rec.row_id) {
            tr.classList.add('selected');
        }
        
        const statusClass = rec.invoice_status.toLowerCase() === 'invoiced' ? 'invoiced' : 'pending';
        const statusLabel = rec.invoice_status || 'Pending';
        
        // Truncate desc for table
        const shortDesc = rec.part_received.length > 35 ? rec.part_received.substring(0, 35) + '...' : rec.part_received;
        
        tr.innerHTML = `
            <td><strong>${rec.rms_po || 'N/A'}</strong></td>
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
    
    // Highlight selected row in table
    const rows = tableBody.getElementsByTagName('tr');
    for (let r of rows) {
        r.classList.remove('selected');
    }
    trElement.classList.add('selected');
    
    // Reveal editor panel, hide empty state
    emptyState.classList.add('hidden');
    editorContent.classList.remove('hidden');
    
    // Populate header info
    poTitle.textContent = record.rms_po || 'N/A';
    
    // Parse the part text
    const parsed = parsePartReceived(record.part_received);
    
    // Map customer standard address & notes templates
    let customerType = 'DEFAULT';
    const custNameUpper = (record.customer || '').toUpperCase();
    if (custNameUpper.includes('GE')) {
        customerType = 'GE';
    } else if (custNameUpper.includes('JORD')) {
        customerType = 'JORDS';
    }
    
    // Fill in Form Inputs
    inputPartReceived.value = record.part_received;
    inputPartNum.value = parsed.partNum;
    inputPartDesc.value = parsed.desc;
    inputQty.value = parsed.qty;
    inputBackordered.value = 0;
    
    // Pre-fill HS Code and Amount
    inputHsCode.value = record.hs_code || (customerType === 'JORDS' ? '8481.80.3060' : '3926.90.9985');
    inputAmount.value = '120.00'; // Default placeholder
    
    inputCustomerPo.value = record.customer_po || '';
    inputLineNum.value = record.line_num || '1';
    inputDate.value = getFormattedToday();
    
    // Pre-fill Order Date (outbound_date if exists, else inbound_date)
    inputOrderDate.value = record.outbound_date || record.inbound_date || getFormattedToday();
    
    // Pre-fill Weight & Size
    inputWeight.value = record.outbound_weight || record.inbound_weight || '2 LBS';
    
    const sizeStr = record.outbound_l ? 
        `${record.outbound_l}x${record.outbound_w}x${record.outbound_h}` : 
        (record.inbound_l ? `${record.inbound_l}x${record.inbound_w}x${record.inbound_h}` : '13x11x5');
    inputSize.value = sizeStr;
    
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
    loadGeneratedFiles(); // Clear file list for the new selection
    document.getElementById('editor-card').scrollIntoView({ behavior: 'smooth' });
}

// Handle Form Submission: Dispatch data to backend API
function handleFormSubmit(e) {
    e.preventDefault();
    if (!selectedRecord) return;
    
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
    
    const requestData = {
        rms_po: selectedRecord.rms_po,
        customer_po: inputCustomerPo.value,
        part_num: inputPartNum.value,
        part_desc: inputPartDesc.value,
        description: inputPartDesc.value, // Compatibility
        qty: inputQty.value,
        backordered: inputBackordered.value,
        hs_code: inputHsCode.value,
        amount: inputAmount.value,
        line_num: inputLineNum.value,
        date: inputDate.value,
        order_date: inputOrderDate.value,
        weight: inputWeight.value,
        size: inputSize.value,
        sold_to_address: txtSoldTo.value,
        ship_to_address: txtShipTo.value,
        free_replacement_note: inputFreeReplacement.value,
        notes: notesArray,
        ref_num: refNum,
        tax_id: "36-4426459"
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

// Toast notification helper
function showToast(title, body, files = null, isError = false) {
    toastTitle.textContent = title;
    toastBody.textContent = body;
    
    if (isError) {
        toast.style.borderColor = "#ef4444";
        toastIcon.textContent = "❌";
        toastIcon.style.color = "#ef4444";
        toastLinks.classList.add('hidden');
    } else {
        toast.style.borderColor = "var(--accent-success)";
        toastIcon.textContent = "✔️";
        toastIcon.style.color = "var(--accent-success)";
        
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
    
    // Auto-close after 12 seconds if no error
    if (!isError) {
        setTimeout(closeToast, 12000);
    }
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
    toast.classList.add('hidden');
}
