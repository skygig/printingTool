import os
import csv
import sys
import json
import openpyxl
import webbrowser
from threading import Timer
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from docx_generator import generate_docx_labels
from pdf_generator import generate_printing_slip, generate_commercial_invoice

app = Flask(__name__, static_folder='static', static_url_path='')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Global Database States (Thread-safe-ish for local single-user app)
CURRENT_DB_NAME = None
CURRENT_DB_PATH = None
CURRENT_SHEET = None
EXCEL_SHEETS = []
CURRENT_HEADER_ROW = 1

CONFIG_PATH = os.path.join(BASE_DIR, "db_config.json")

def load_db_config():
    global CURRENT_DB_NAME, CURRENT_DB_PATH, CURRENT_SHEET, EXCEL_SHEETS, CURRENT_HEADER_ROW
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            filename = config.get('filename')
            if filename:
                file_path = os.path.join(BASE_DIR, filename)
                if os.path.exists(file_path):
                    CURRENT_DB_NAME = filename
                    CURRENT_DB_PATH = file_path
                    CURRENT_SHEET = config.get('sheet_name')
                    EXCEL_SHEETS = config.get('sheets', [])
                    CURRENT_HEADER_ROW = config.get('header_row', 1)
                    print(f"Loaded database configuration from config file: {filename} (Sheet: {CURRENT_SHEET}, Header: {CURRENT_HEADER_ROW})")
                    return
        except Exception as e:
            print(f"Error loading db_config.json: {e}")
            
    # Default fallback if config load fails or config doesn't exist
    CURRENT_DB_NAME = "Warehouse Tracking sheet (1).xlsx - Main.csv"
    CURRENT_DB_PATH = os.path.join(BASE_DIR, CURRENT_DB_NAME)
    CURRENT_SHEET = None
    EXCEL_SHEETS = []
    CURRENT_HEADER_ROW = 1


def save_db_config():
    try:
        config = {
            'filename': CURRENT_DB_NAME,
            'sheet_name': CURRENT_SHEET,
            'sheets': EXCEL_SHEETS,
            'header_row': CURRENT_HEADER_ROW
        }
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4)
        print(f"Saved database configuration to config file: {CURRENT_DB_NAME}")
    except Exception as e:
        print(f"Error saving db_config.json: {e}")

# Load configuration on startup
load_db_config()

TEMPLATE_DOCX_PATH = os.path.join(BASE_DIR, "GE Label - 42300276510.docx")
OUTPUTS_DIR = os.path.join(BASE_DIR, "Outputs")

# Ensure outputs directory exists
os.makedirs(OUTPUTS_DIR, exist_ok=True)

def parse_csv_database(file_path=None):
    """
    Parses the warehouse tracking CSV file.
    Maps columns by absolute index to avoid duplicate headers.
    """
    if file_path is None:
        file_path = CURRENT_DB_PATH
        
    records = []
    if not os.path.exists(file_path):
        print(f"Warning: CSV file not found at {file_path}")
        return records
        
    try:
        with open(file_path, mode='r', encoding='utf-8-sig', errors='ignore') as f:
            reader = csv.reader(f)
            headers = next(reader, None)
            if not headers:
                return records
                
            for idx, row in enumerate(reader):
                if not row or all(cell.strip() == "" for cell in row):
                    continue # Skip empty rows
                
                # Check that row has enough columns (header has 34 columns)
                # Pad row if it is short
                if len(row) < 34:
                    row = row + [""] * (34 - len(row))
                    
                # Create mapped dictionary using indexes
                record = {
                    'row_id': idx + 2, # Line number in CSV (1-indexed, +1 for header)
                    'inbound_date': row[0].strip(),
                    'rms_po': row[1].strip(),
                    'part_received': row[2].strip(),
                    'vendor': row[3].strip(),
                    'promise_date': row[4].strip(),
                    'inbound_notes': row[5].strip(),
                    'vendor_contact': row[6].strip(),
                    'received_date': row[7].strip(),
                    'inbound_carrier': row[8].strip(),
                    'inbound_tracking': row[9].strip(),
                    'inbound_l': row[10].strip(),
                    'inbound_w': row[11].strip(),
                    'inbound_h': row[12].strip(),
                    'inbound_weight': row[13].strip(),
                    'inbound_charges': row[14].strip(),
                    'outbound_date': row[15].strip(),
                    'customer': row[16].strip(),
                    'customer_po': row[17].strip(),
                    'rms_invoice': row[18].strip(),
                    'ship_to': row[19].strip(),
                    'line_num': row[20].strip(),
                    'hs_code': row[21].strip(),
                    'shipped_date': row[22].strip(),
                    'invoice_status': row[23].strip(),
                    'outbound_l': row[24].strip(),
                    'outbound_w': row[25].strip(),
                    'outbound_h': row[26].strip(),
                    'outbound_weight': row[27].strip(),
                    'outbound_carrier': row[28].strip(),
                    'outbound_tracking': row[29].strip(),
                    'crating_charges': row[30].strip(),
                    'shipping_charges': row[31].strip(),
                    'customer_contact': row[32].strip(),
                    'outbound_notes': row[33].strip(),
                }
                
                # Check for at least some identifying data
                if record['rms_po'] or record['customer_po'] or record['part_received']:
                    records.append(record)
                    
    except Exception as e:
        print(f"Error parsing CSV: {e}")
        
    return records


def parse_excel_database(file_path, sheet_name=None, header_row=1):
    """
    Parses the warehouse tracking Excel sheet.
    Maps columns by absolute index to match the CSV format.
    """
    records = []
    if not os.path.exists(file_path):
        print(f"Warning: Excel file not found at {file_path}")
        return records
        
    try:
        wb = openpyxl.load_workbook(file_path, data_only=True)
        if not sheet_name or sheet_name not in wb.sheetnames:
            sheet = wb.active
        else:
            sheet = wb[sheet_name]
            
        rows = list(sheet.iter_rows(values_only=True))
        wb.close()
        
        if not rows:
            return records
            
        # Ensure header_row is within valid bounds
        h_idx = max(1, int(header_row))
        if h_idx > len(rows):
            print(f"Warning: header_row {h_idx} exceeds total rows {len(rows)}")
            return records
            
        data_rows = rows[h_idx:]
        
        # Iterate data rows starting after the header
        for idx, row_cells in enumerate(data_rows):
            row = []
            for val in row_cells:
                if val is None:
                    row.append("")
                elif isinstance(val, float) and val.is_integer():
                    # Format float representing integers as integers (e.g. 9141.0 -> "9141")
                    row.append(str(int(val)))
                else:
                    # Convert cell value to clean string
                    row.append(str(val))
                    
            if not row or all(cell.strip() == "" for cell in row):
                continue # Skip empty rows
                
            if len(row) < 34:
                row = row + [""] * (34 - len(row))
                
            record = {
                'row_id': idx + h_idx + 1, # Line number in sheet (1-indexed, starts at header_row + 1)
                'inbound_date': row[0].strip(),
                'rms_po': row[1].strip(),
                'part_received': row[2].strip(),
                'vendor': row[3].strip(),
                'promise_date': row[4].strip(),
                'inbound_notes': row[5].strip(),
                'vendor_contact': row[6].strip(),
                'received_date': row[7].strip(),
                'inbound_carrier': row[8].strip(),
                'inbound_tracking': row[9].strip(),
                'inbound_l': row[10].strip(),
                'inbound_w': row[11].strip(),
                'inbound_h': row[12].strip(),
                'inbound_weight': row[13].strip(),
                'inbound_charges': row[14].strip(),
                'outbound_date': row[15].strip(),
                'customer': row[16].strip(),
                'customer_po': row[17].strip(),
                'rms_invoice': row[18].strip(),
                'ship_to': row[19].strip(),
                'line_num': row[20].strip(),
                'hs_code': row[21].strip(),
                'shipped_date': row[22].strip(),
                'invoice_status': row[23].strip(),
                'outbound_l': row[24].strip(),
                'outbound_w': row[25].strip(),
                'outbound_h': row[26].strip(),
                'outbound_weight': row[27].strip(),
                'outbound_carrier': row[28].strip(),
                'outbound_tracking': row[29].strip(),
                'crating_charges': row[30].strip(),
                'shipping_charges': row[31].strip(),
                'customer_contact': row[32].strip(),
                'outbound_notes': row[33].strip(),
            }
            
            if record['rms_po'] or record['customer_po'] or record['part_received']:
                records.append(record)
                
    except Exception as e:
        print(f"Error parsing Excel: {e}")
        
    return records


def load_current_database():
    """Loads records from the active database file."""
    if not CURRENT_DB_PATH or not os.path.exists(CURRENT_DB_PATH):
        print(f"Warning: Database path does not exist: {CURRENT_DB_PATH}")
        return []
        
    ext = os.path.splitext(CURRENT_DB_PATH)[1].lower()
    if ext == '.csv':
        return parse_csv_database(CURRENT_DB_PATH)
    elif ext in ['.xlsx', '.xls']:
        return parse_excel_database(CURRENT_DB_PATH, CURRENT_SHEET, CURRENT_HEADER_ROW)
    return []


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.after_request
def add_header(response):
    """Disable caching for development"""
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response


@app.route('/api/records')
def get_records():
    records = load_current_database()
    return jsonify(records)


@app.route('/api/db-status')
def get_db_status():
    return jsonify({
        'filename': CURRENT_DB_NAME,
        'sheet_name': CURRENT_SHEET,
        'sheets': EXCEL_SHEETS,
        'header_row': CURRENT_HEADER_ROW
    })


@app.route('/api/upload-database', methods=['POST'])
def upload_database():
    global CURRENT_DB_PATH, CURRENT_DB_NAME, CURRENT_SHEET, EXCEL_SHEETS, CURRENT_HEADER_ROW
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file:
        filename = secure_filename(file.filename)
        file_path = os.path.join(BASE_DIR, filename)
        file.save(file_path)
        
        ext = os.path.splitext(filename)[1].lower()
        
        CURRENT_DB_NAME = filename
        CURRENT_DB_PATH = file_path
        CURRENT_SHEET = None
        EXCEL_SHEETS = []
        CURRENT_HEADER_ROW = 1
        
        if ext == '.csv':
            records = parse_csv_database(file_path)
            save_db_config()
            return jsonify({
                'success': True,
                'type': 'csv',
                'filename': filename,
                'records': records
            })
        elif ext in ['.xlsx', '.xls']:
            try:
                wb = openpyxl.load_workbook(file_path, read_only=True)
                sheets = wb.sheetnames
                wb.close()
                
                EXCEL_SHEETS = sheets
                if len(sheets) > 0:
                    CURRENT_SHEET = sheets[0]
                    records = parse_excel_database(file_path, CURRENT_SHEET, CURRENT_HEADER_ROW)
                else:
                    records = []
                    
                save_db_config()
                return jsonify({
                    'success': True,
                    'type': 'excel',
                    'filename': filename,
                    'sheets': sheets,
                    'selected_sheet': CURRENT_SHEET,
                    'header_row': CURRENT_HEADER_ROW,
                    'records': records
                })
            except Exception as e:
                return jsonify({'error': f"Failed to read Excel workbook: {str(e)}"}), 500
        else:
            return jsonify({'error': 'Unsupported file format. Please upload CSV or Excel (.xlsx, .xls) files.'}), 400


@app.route('/api/load-sheet', methods=['POST'])
def load_sheet():
    global CURRENT_SHEET, CURRENT_HEADER_ROW
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    if CURRENT_DB_NAME.endswith('.csv'):
        return jsonify({'error': 'Active database is a CSV, sheet selection is not supported.'}), 400
        
    # Switch sheet if provided
    sheet_name = data.get('sheet_name', CURRENT_SHEET)
    if sheet_name not in EXCEL_SHEETS:
        return jsonify({'error': f"Sheet '{sheet_name}' not found in workbook."}), 400
        
    # Read header row if provided
    header_row_val = data.get('header_row', CURRENT_HEADER_ROW)
    try:
        CURRENT_HEADER_ROW = max(1, int(header_row_val))
    except (ValueError, TypeError):
        pass
        
    CURRENT_SHEET = sheet_name
    records = parse_excel_database(CURRENT_DB_PATH, CURRENT_SHEET, CURRENT_HEADER_ROW)
    save_db_config()
    return jsonify({
        'success': True,
        'filename': CURRENT_DB_NAME,
        'sheet_name': CURRENT_SHEET,
        'header_row': CURRENT_HEADER_ROW,
        'records': records
    })


@app.route('/api/generate', methods=['POST'])
def generate_documents():
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400
        
    try:
        po_num = data.get('customer_po', 'UNKNOWN_PO').strip()
        rms_po = data.get('rms_po', 'UNKNOWN_RMS').strip()
        
        # Clean filenames (replace slashes and spaces)
        clean_po = "".join(c for c in po_num if c.isalnum() or c in '-_')
        clean_rms = "".join(c for c in rms_po if c.isalnum() or c in '-_')
        
        # Output filenames
        ps_filename = f"PS_{clean_po}_{clean_rms}.pdf"
        ci_filename = f"CI_{clean_po}_{clean_rms}.pdf"
        label_filename = f"Label_{clean_po}_{clean_rms}.docx"
        
        ps_path = os.path.join(OUTPUTS_DIR, ps_filename)
        ci_path = os.path.join(OUTPUTS_DIR, ci_filename)
        label_path = os.path.join(OUTPUTS_DIR, label_filename)
        
        # 1. Generate Printing Slip (PDF)
        generate_printing_slip(ps_path, data)
        
        # 2. Generate Commercial Invoice (PDF)
        generate_commercial_invoice(ci_path, data)
        
        # 3. Generate Part Labels (DOCX)
        # Parse qty from request data
        qty_str = data.get('qty', '4')
        try:
            qty = max(1, int(qty_str))
        except (ValueError, TypeError):
            qty = 4

        generate_docx_labels(
            template_path=TEMPLATE_DOCX_PATH,
            output_path=label_path,
            po_num=po_num,
            part_num=data.get('part_num', ''),
            description=data.get('part_desc', ''),
            qty=qty,
            items=data.get('items')
        )
        
        return jsonify({
            'success': True,
            'message': 'All documents generated successfully!',
            'files': {
                'printing_slip': {
                    'filename': ps_filename,
                    'path': ps_path
                },
                'commercial_invoice': {
                    'filename': ci_filename,
                    'path': ci_path
                },
                'part_labels': {
                    'filename': label_filename,
                    'path': label_path
                }
            }
        })
        
    except Exception as e:
        print(f"Error generating files: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/generated-files')
def get_generated_files():
    try:
        files = []
        if os.path.exists(OUTPUTS_DIR):
            for filename in os.listdir(OUTPUTS_DIR):
                if filename.startswith('.'):
                    continue
                path = os.path.join(OUTPUTS_DIR, filename)
                if os.path.isfile(path):
                    stat = os.stat(path)
                    files.append({
                        'name': filename,
                        'path': path,
                        'size': stat.st_size,
                        'mtime': stat.st_mtime
                    })
            # Sort by modification time, newest first
            files.sort(key=lambda x: x['mtime'], reverse=True)
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/open-file')
def open_file():
    filepath = request.args.get('path')
    if not filepath or not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
        
    try:
        # Open file using OS default application
        if sys.platform == 'darwin':
            os.system(f'open "{filepath}"')
        elif sys.platform == 'win32':
            os.startfile(filepath)
        else:
            os.system(f'xdg-open "{filepath}"')
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/open-outputs-folder')
def open_outputs_folder():
    try:
        if sys.platform == 'darwin':
            os.system(f'open "{OUTPUTS_DIR}"')
        elif sys.platform == 'win32':
            os.startfile(OUTPUTS_DIR)
        else:
            os.system(f'xdg-open "{OUTPUTS_DIR}"')
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def open_browser():
    webbrowser.open_new('http://localhost:5001')


if __name__ == '__main__':
    # Delay opening browser for 1 second to ensure Flask starts first
    Timer(1.0, open_browser).start()
    app.run(host='127.0.0.1', port=5001, debug=False)
