import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """
    Custom canvas to handle basic drawing or headers if needed,
    but primarily keeps standard page creation clean.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        # We can draw page numbers at the bottom center
        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#666666"))
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawCentredString(letter[0] / 2.0, 30, page_text)
        self.restoreState()


def get_image_path(filename):
    """Locates the logo image if available, else returns None"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    paths = [
        os.path.join(base_dir, "Extracted_Images", filename),
        os.path.join(base_dir, filename),
        # Fallback to current directory
        filename
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return None


def generate_printing_slip(output_path, data):
    """
    Generates a Printing/Packing Slip PDF that matches the exact visual grid format
    and structure of the example document (PS 42300276510.pdf).
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 0.5 inch margins = 36 points
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'PSTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#000000"),
        alignment=2 # Right-aligned
    )
    
    exporter_body_style = ParagraphStyle(
        'PSExporterBody',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#000000")
    )
    
    address_title_style = ParagraphStyle(
        'PSAddressTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=12,
        textColor=colors.HexColor("#000000")
    )
    
    address_body_style = ParagraphStyle(
        'PSAddressBody',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#000000")
    )
    
    meta_header_style = ParagraphStyle(
        'PSMetaHeader',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=11,
        alignment=1 # Centered
    )
    
    meta_value_style = ParagraphStyle(
        'PSMetaValue',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=9,
        leading=11,
        alignment=1 # Centered
    )
    
    table_header_style = ParagraphStyle(
        'PSTableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#000000"),
        alignment=1 # Centered
    )
    
    table_cell_style = ParagraphStyle(
        'PSTableCell',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#000000")
    )
    
    table_cell_center_style = ParagraphStyle(
        'PSTableCellCenter',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#000000"),
        alignment=1 # Centered
    )

    story = []
    
    # --- HEADER SECTION (Logo on left, Exporter address underneath, Packing Slip Title & Date on right) ---
    logo_path = get_image_path("PS42300276510_p1_img1_Image1.png")
    
    logo_flowable = None
    if logo_path:
        logo_flowable = Image(logo_path, width=158, height=49)
    else:
        logo_flowable = Paragraph("<b>RMS International, Inc.</b>", styles['Heading3'])
        
    exporter_text = f"""
    Plainfield, IL 60585<br/>
    Tax ID {data.get('tax_id', '36-4426459')}<br/>
    """
    left_header = [
        logo_flowable,
        Spacer(1, 8),
        Paragraph(exporter_text, exporter_body_style)
    ]
    
    # Date sub-table
    date_data = [
        [Paragraph("Date", meta_header_style), Paragraph(data.get('date', ''), meta_value_style)]
    ]
    date_table = Table(date_data, colWidths=[60, 90])
    date_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#000000")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    
    right_header = [
        Paragraph("Packing Slip", title_style),
        Spacer(1, 10),
        # Wrap to align right (120 points spacer + 150 points table = 270 points column width)
        Table([["", date_table]], colWidths=[120, 150])
    ]
    
    # Setup outer table to align left and right headers
    top_table = Table([[left_header, right_header]], colWidths=[270, 270])
    top_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(top_table)
    story.append(Spacer(1, 15))
    
    # --- SOLD TO / SHIP TO SECTION (Boxed layout) ---
    ship_to_html = data.get('ship_to_address', '').replace('\n', '<br/>')
    sold_to_html = data.get('sold_to_address', '').replace('\n', '<br/>')
    
    # Ship To Box
    ship_to_box_data = [
        [Paragraph("Ship To", address_title_style)],
        [Paragraph(ship_to_html, address_body_style)]
    ]
    ship_to_box = Table(ship_to_box_data, colWidths=[260])
    ship_to_box.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#000000")),
        ('LINEBELOW', (0, 0), (0, 0), 0.5, colors.HexColor("#000000")),
        ('TOPPADDING', (0, 0), (-1, 0), 4),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, 1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 6),
    ]))
    
    # Sold To Box
    sold_to_box_data = [
        [Paragraph("Sold To", address_title_style)],
        [Paragraph(sold_to_html, address_body_style)]
    ]
    sold_to_box = Table(sold_to_box_data, colWidths=[260])
    sold_to_box.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#000000")),
        ('LINEBELOW', (0, 0), (0, 0), 0.5, colors.HexColor("#000000")),
        ('TOPPADDING', (0, 0), (-1, 0), 4),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, 1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 6),
    ]))
    
    # Combine side-by-side
    address_table = Table([[ship_to_box, "", sold_to_box]], colWidths=[260, 20, 260])
    address_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(address_table)
    story.append(Spacer(1, 15))
    
    # --- THREE METADATA TABLES (Order Date, S.O. No, P.O. No) ---
    # 1. Order Date Table
    order_date_data = [
        [Paragraph("Order Date", meta_header_style), Paragraph(data.get('order_date', ''), meta_value_style)]
    ]
    order_date_table = Table(order_date_data, colWidths=[65, 65])
    order_date_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#000000")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    
    # 2. S.O. No Table
    so_data = [
        [Paragraph("S.O. No.", meta_header_style), Paragraph(data.get('customer_po', ''), meta_value_style)]
    ]
    so_table = Table(so_data, colWidths=[60, 70])
    so_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#000000")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    
    # 3. P.O. No Table
    po_data = [
        [Paragraph("P.O. No.", meta_header_style), Paragraph(data.get('customer_po', ''), meta_value_style)]
    ]
    po_table = Table(po_data, colWidths=[60, 70])
    po_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#000000")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    
    # Combine side-by-side with spacer columns
    metadata_outer_table = Table(
        [[order_date_table, "", so_table, "", po_table]], 
        colWidths=[130, 75, 130, 75, 130]
    )
    metadata_outer_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(metadata_outer_table)
    story.append(Spacer(1, 20))
    
    # --- MAIN ITEMS TABLE ---
    # Column Headers: Line, Item, Description, Qty Ordered, Backordered
    table_headers = [
        Paragraph("Line", table_header_style),
        Paragraph("Item", table_header_style),
        Paragraph("Description", table_header_style),
        Paragraph("Qty Ordered", table_header_style),
        Paragraph("Backordered", table_header_style)
    ]
    
    # Values
    items = data.get('items', [])
    if not items:
        items = [{
            'line_num': data.get('line_num', '1'),
            'part_num': data.get('part_num', ''),
            'description': data.get('description', ''),
            'qty': data.get('qty', '0'),
            'backordered': data.get('backordered', '0')
        }]
        
    items_table_data = [table_headers]
    for item in items:
        line_no = item.get('line_num', '1')
        part_no = item.get('part_num', '')
        desc = item.get('part_desc') or item.get('description') or ''
        qty = item.get('qty', '0')
        backordered = item.get('backordered', '0')
        
        item_row = [
            Paragraph(str(line_no), table_cell_center_style),
            Paragraph(str(part_no), table_cell_style),
            Paragraph(str(desc), table_cell_style),
            Paragraph(str(qty), table_cell_center_style),
            Paragraph(str(backordered), table_cell_center_style)
        ]
        items_table_data.append(item_row)
        
    # Spacing row to push grid borders down
    spacing_row = ["", "", "", "", ""]
    items_table_data.append(spacing_row)
    
    # Total printable width is 540 points
    # Col widths: Line(35), Item(95), Description(290), Qty(60), Backorder(60) = 540
    # Heights: Header(auto), Data(auto), Spacing(400)
    spacing_height = max(50, 300 - (len(items) - 1) * 20)
    row_heights = [None] + [None]*len(items) + [spacing_height]
    
    items_table = Table(
        items_table_data, 
        colWidths=[35, 95, 290, 60, 60],
        rowHeights=row_heights
    )
    
    items_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#000000")), # Main solid grid borders
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    
    story.append(items_table)
    
    # Build PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    return output_path


def generate_commercial_invoice(output_path, data):
    """
    Generates a Commercial Invoice PDF that matches the exact visual grid format
    and structure of the example document (CI 114784-2.pdf).
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 0.5 inch margins = 36 points
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CITitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#000000"),
        alignment=2 # Right-aligned
    )
    
    exporter_body_style = ParagraphStyle(
        'CIExporterBody',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#000000")
    )
    
    address_title_style = ParagraphStyle(
        'CIAddressTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#000000")
    )
    
    address_body_style = ParagraphStyle(
        'CIAddressBody',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#000000")
    )
    
    meta_header_style = ParagraphStyle(
        'CIMetaHeader',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=11,
        alignment=1 # Centered
    )
    
    meta_value_style = ParagraphStyle(
        'CIMetaValue',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=9,
        leading=11,
        alignment=1 # Centered
    )
    
    table_header_style = ParagraphStyle(
        'CITableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#000000"),
        alignment=1 # Centered
    )
    
    table_cell_style = ParagraphStyle(
        'CITableCell',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#000000")
    )
    
    table_cell_center_style = ParagraphStyle(
        'CITableCellCenter',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#000000"),
        alignment=1 # Centered
    )
    
    table_cell_right_style = ParagraphStyle(
        'CITableCellRight',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#000000"),
        alignment=2 # Right-aligned
    )
    
    note_style = ParagraphStyle(
        'CINote',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#000000")
    )
    
    decl_style = ParagraphStyle(
        'CIDeclaration',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=8,
        leading=9,
        textColor=colors.HexColor("#000000")
    )
    
    total_label_style = ParagraphStyle(
        'CITotalLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#000000"),
        alignment=1 # Centered
    )
    
    total_val_style = ParagraphStyle(
        'CITotalValue',
        parent=styles['Normal'],
        fontName='Times-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#000000"),
        alignment=1 # Centered
    )

    story = []
    
    # --- HEADER SECTION (Logo on left, Exporter address underneath, Invoice Title on right) ---
    logo_path = get_image_path("CI114784-2_p1_img1_Im5.png")
    
    logo_flowable = None
    if logo_path:
        logo_flowable = Image(logo_path, width=158, height=49)
    else:
        logo_flowable = Paragraph("<b>RMS International, Inc.</b>", styles['Heading3'])
        
    exporter_text = f"""
    Plainfield, IL 60585<br/>
    Tel: {data.get('exporter_tel', '+1 708 638 1777')}<br/>
    Tax ID {data.get('tax_id', '36-4426459')}<br/>
    """
    left_header = [
        logo_flowable,
        Spacer(1, 8),
        Paragraph(exporter_text, exporter_body_style)
    ]
    
    top_table = Table([[left_header, Paragraph("Commercial Invoice", title_style)]], colWidths=[270, 270])
    top_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(top_table)
    story.append(Spacer(1, 10))
    
    # --- SOLD TO / SHIP TO SECTION ---
    sold_to_html = data.get('sold_to_address', '').replace('\n', '<br/>')
    ship_to_html = data.get('ship_to_address', '').replace('\n', '<br/>')
    
    address_data = [
        [Paragraph("Sold To", address_title_style), Paragraph("Ship To", address_title_style)],
        [Paragraph(sold_to_html, address_body_style), Paragraph(ship_to_html, address_body_style)]
    ]
    
    address_table = Table(address_data, colWidths=[260, 280])
    address_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (0, 0), 1, colors.HexColor("#000000")), # Solid black line under Sold To
        ('LINEBELOW', (1, 0), (1, 0), 1, colors.HexColor("#000000")), # Solid black line under Ship To
        ('BOTTOMPADDING', (0, 0), (-1, 0), 2),
        ('TOPPADDING', (0, 1), (-1, 1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(address_table)
    story.append(Spacer(1, 20))
    
    # --- METADATA TABLE (Size, Weight, PO, Date) ALIGNED TO THE RIGHT ---
    meta_data = [
        [Paragraph("Size in Inches", meta_header_style), Paragraph("Weight in Lbs.", meta_header_style), Paragraph("P.O. No.", meta_header_style), Paragraph("Date", meta_header_style)],
        [Paragraph(data.get('size', ''), meta_value_style), Paragraph(data.get('weight', ''), meta_value_style), Paragraph(data.get('customer_po', ''), meta_value_style), Paragraph(data.get('date', ''), meta_value_style)]
    ]
    meta_table = Table(meta_data, colWidths=[80, 80, 85, 80])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#000000")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    
    # Wrap in outer table to align to right
    meta_outer_table = Table([["", meta_table]], colWidths=[215, 325])
    meta_outer_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(meta_outer_table)
    
    # --- MAIN TABLE: ITEMS GRID + INTEGRATED FOOTER ---
    # Column Headers
    table_headers = [
        Paragraph("Item", table_header_style),
        Paragraph("Description", table_header_style),
        Paragraph("HS Code", table_header_style),
        Paragraph("Qty Ordered", table_header_style),
        Paragraph("Qty Backordered", table_header_style),
        Paragraph("Amount", table_header_style)
    ]
    
    # Values
    items = data.get('items', [])
    if not items:
        items = [{
            'part_num': data.get('part_num', ''),
            'part_desc': data.get('part_desc', ''),
            'hs_code': data.get('hs_code', ''),
            'qty': data.get('qty', '0'),
            'backordered': data.get('backordered', '0'),
            'amount': data.get('amount', '0.00')
        }]
        
    main_table_data = [table_headers]
    total_amount_val = 0.0
    
    def safe_float(val):
        if not val:
            return 0.0
        val_clean = str(val).replace('$', '').replace('US$', '').replace(',', '').strip()
        try:
            return float(val_clean)
        except ValueError:
            return 0.0
            
    for idx, item in enumerate(items):
        part_no = item.get('part_num', '')
        part_desc = item.get('part_desc') or item.get('description') or ''
        hs_code = item.get('hs_code', '')
        qty_ordered = item.get('qty', '0')
        qty_backordered = item.get('backordered', '0')
        amount_str = item.get('amount', '0.00')
        
        # Add to total
        total_amount_val += safe_float(amount_str)
        
        if not amount_str.startswith('$') and not amount_str.startswith('US$'):
            try:
                amount_val = float(amount_str)
                amount_str = f"{amount_val:,.2f}"
            except ValueError:
                pass
                
        # Build description cell flowables
        desc_flowables = [Paragraph(part_desc, table_cell_style)]
        
        # Attach notes to the first item
        if idx == 0:
            notes = data.get('notes', [])
            if notes:
                desc_flowables.append(Spacer(1, 3))
                desc_flowables.append(Paragraph("Note:", note_style))
                for note in notes:
                    desc_flowables.append(Paragraph(note, note_style))
                    
            free_repl = data.get('free_replacement_note', '')
            if free_repl:
                desc_flowables.append(Spacer(1, 3))
                desc_flowables.append(Paragraph(free_repl, note_style))
                
        item_row = [
            Paragraph(part_no, table_cell_style),
            desc_flowables,
            Paragraph(hs_code, table_cell_center_style),
            Paragraph(qty_ordered, table_cell_center_style),
            Paragraph(qty_backordered, table_cell_center_style),
            Paragraph(amount_str, table_cell_right_style)
        ]
        main_table_data.append(item_row)
    
    # Spacing row (to push vertical grid lines down)
    spacing_row = ["", "", "", "", "", ""]
    main_table_data.append(spacing_row)
    
    # Construct bottom-left merged cell contents (Declaration + Signature block)
    decl_text = "These commodities were exported from the United States of America in accordance with the Export Administration Regulations. Diversion contrary to U.S. law is prohibited."
    sig_data = [
        ["_______________________________________", "________________"],
        ["Rajan Madassery", "Date"],
        ["President, RMS International, Inc.", ""]
    ]
    sig_table = Table(sig_data, colWidths=[230, 110])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('FONTNAME', (0, 0), (-1, -1), 'Times-Roman'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
    ]))
    
    bottom_left_flowables = [
        Paragraph(decl_text, decl_style),
        Spacer(1, 10),
        sig_table
    ]
    
    # Total Amount right cells
    total_amount_text = f"US$&nbsp;&nbsp;&nbsp;&nbsp;{total_amount_val:,.2f}"
    
    footer_row_top = [
        bottom_left_flowables, "", "",
        Paragraph("Total Amount of Invoice", total_label_style), "", ""
    ]
    
    footer_row_bottom = [
        "", "", "",
        Paragraph(total_amount_text, total_val_style), "", ""
    ]
    
    main_table_data.append(footer_row_top)
    main_table_data.append(footer_row_bottom)
    
    # Widths: Item(95), Description(225), HS Code(65), Qty Ord(55), Qty Back(50), Amount(50) = 540
    # Heights: header(auto), data_rows(auto), spacing(220), footer_top(auto), footer_bottom(auto)
    spacing_height = max(50, 220 - (len(items) - 1) * 20)
    row_heights = [None] + [None]*len(items) + [spacing_height, None, None]
    
    main_table = Table(
        main_table_data, 
        colWidths=[95, 225, 65, 55, 50, 50],
        rowHeights=row_heights
    )
    
    N = len(items)
    main_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#000000")), # Main solid grid borders
        
        # Merge bottom-left block (declaration & signature) across columns 0-2 and rows N+2 to N+3
        ('SPAN', (0, N + 2), (2, N + 3)),
        
        # Merge bottom-right top block (Total label) across columns 3-5 in row N+2
        ('SPAN', (3, N + 2), (5, N + 2)),
        ('VALIGN', (3, N + 2), (5, N + 2), 'MIDDLE'),
        
        # Merge bottom-right bottom block (Total value) across columns 3-5 in row N+3
        ('SPAN', (3, N + 3), (5, N + 3)),
        ('VALIGN', (3, N + 3), (5, N + 3), 'MIDDLE'),
        
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    
    story.append(main_table)
    
    # Build PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    return output_path



if __name__ == "__main__":
    # Test generators
    test_data = {
        'date': '05/19/2026',
        'order_date': '04/14/2026',
        'customer_po': '42300276510',
        'rms_po': '9943',
        'ref_num': '76510-9943',
        'tax_id': '36-4426459',
        'line_num': '1',
        'part_num': '1-503-24-065',
        'part_desc': 'TEFLON SEAL',
        'description': 'TEFLON SEAL',
        'qty': '4',
        'backordered': '0',
        'hs_code': '3926.90.9985',
        'amount': '120.00',
        'weight': '2LBS',
        'size': '13x11x5',
        'ship_to_address': 'GE Energy Parts\nEnergy Services - Energy Parts COE\n4955 Mason Road\nAtlanta, GA 30349',
        'sold_to_address': 'GE Energy Parts\nEnergy Services - Energy Parts COE\n4955 Mason Road\nAtlanta, GA 30349',
        'exporter_tel': '+1 708 638 1777',
        'notes': [
            '1.Vent Plug need to be shipped loose.',
            '2.Usage of Teflon tape is prohibited.',
            '3.SS BOLTS LENGTH 2.25"'
        ],
        'free_replacement_note': 'Free replacement'
    }
    base_dir = os.path.dirname(os.path.abspath(__file__))
    generate_printing_slip(os.path.join(base_dir, "Outputs/test_ps.pdf"), test_data)
    generate_commercial_invoice(os.path.join(base_dir, "Outputs/test_ci.pdf"), test_data)
