import os
import csv
import sys
import webbrowser
from threading import Timer
from flask import Flask, jsonify, request, send_from_directory

from docx_generator import generate_docx_labels
from pdf_generator import generate_printing_slip, generate_commercial_invoice

app = Flask(__name__, static_folder='static', static_url_path='')

CSV_PATH = "/Users/akashsingh/Downloads/PrintingTool/Warehouse Tracking sheet (1).xlsx - Main.csv"
TEMPLATE_DOCX_PATH = "/Users/akashsingh/Downloads/PrintingTool/GE Label - 42300276510.docx"
OUTPUTS_DIR = "/Users/akashsingh/Downloads/PrintingTool/Outputs"

# Ensure outputs directory exists
os.makedirs(OUTPUTS_DIR, exist_ok=True)

def parse_csv_database():
    """
    Parses the warehouse tracking CSV file.
    Maps columns by absolute index to avoid duplicate headers.
    """
    records = []
    if not os.path.exists(CSV_PATH):
        print(f"Warning: CSV file not found at {CSV_PATH}")
        return records
        
    try:
        with open(CSV_PATH, mode='r', encoding='utf-8-sig', errors='ignore') as f:
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
    records = parse_csv_database()
    return jsonify(records)


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
        # We need templates PO, Part#, Description
        generate_docx_labels(
            template_path=TEMPLATE_DOCX_PATH,
            output_path=label_path,
            po_num=po_num,
            part_num=data.get('part_num', ''),
            description=data.get('part_desc', '')
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
