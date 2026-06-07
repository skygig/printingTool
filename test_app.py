import os
import json
import unittest
from app import app, parse_csv_database

class TestDocumentGeneratorApp(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def test_csv_parsing(self):
        print("Testing CSV database parsing...")
        records = parse_csv_database()
        self.assertIsNotNone(records)
        self.assertTrue(len(records) > 0, "No records found in CSV database.")
        print(f"  Successfully parsed {len(records)} records.")
        # Check that some headers mapped correctly
        first_rec = records[0]
        self.assertIn('rms_po', first_rec)
        self.assertIn('customer_po', first_rec)
        self.assertIn('part_received', first_rec)
        print("  CSV structure mapping verified.")

    def test_api_records_endpoint(self):
        print("Testing /api/records endpoint...")
        response = self.app.get('/api/records')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(isinstance(data, list))
        self.assertTrue(len(data) > 0)
        print(f"  API returned {len(data)} records successfully.")

    def test_api_generate_endpoint(self):
        print("Testing /api/generate endpoint...")
        test_payload = {
            'date': '06/07/2026',
            'order_date': '05/01/2026',
            'customer_po': '42300191168',
            'rms_po': '9679',
            'ref_num': '191168-9679',
            'tax_id': '36-4426459',
            'line_num': '1',
            'part_num': '1-503-24-065',
            'part_desc': 'TEFLON SEAL (TEST_RUN)',
            'description': 'TEFLON SEAL (TEST_RUN)',
            'qty': '4',
            'backordered': '0',
            'hs_code': '3926.90.9985',
            'amount': '250.00',
            'weight': '2LBS',
            'size': '13x11x5',
            'ship_to_address': 'GE Energy Parts\nEnergy Services - Energy Parts COE\n4955 Mason Road\nAtlanta, GA 30349',
            'sold_to_address': 'GE Energy Parts\nEnergy Services - Energy Parts COE\n4955 Mason Road\nAtlanta, GA 30349',
            'notes': ['1. Test Note 1', '2. Test Note 2'],
            'free_replacement_note': 'Free replacement'
        }
        
        response = self.app.post(
            '/api/generate',
            data=json.dumps(test_payload),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('files', data)
        
        # Verify files are written to disk
        ps_path = data['files']['printing_slip']['path']
        ci_path = data['files']['commercial_invoice']['path']
        label_path = data['files']['part_labels']['path']
        
        self.assertTrue(os.path.exists(ps_path), f"Packing slip file not found: {ps_path}")
        self.assertTrue(os.path.exists(ci_path), f"Commercial Invoice file not found: {ci_path}")
        self.assertTrue(os.path.exists(label_path), f"Label file not found: {label_path}")
        
        print("  All three files generated and written to Outputs successfully.")
        print(f"    PS: {ps_path}")
        print(f"    CI: {ci_path}")
        print(f"    Label: {label_path}")

if __name__ == '__main__':
    unittest.main()
