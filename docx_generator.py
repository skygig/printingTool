import docx
import os

def generate_docx_labels(template_path, output_path, po_num, part_num, description):
    """
    Modifies the grid-based part label DOCX template.
    Replaces PO#, Part#, and Description in all 4 labels while preserving the original layout and styling.
    """
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template docx file not found at: {template_path}")
        
    doc = docx.Document(template_path)
    
    # Check that tables exist
    if not doc.tables:
        raise ValueError("No tables found in the template docx.")
        
    # Iterate through all tables (each table represents one label)
    for i, table in enumerate(doc.tables):
        # The label content is in cell R0C1 (row 0, col 1)
        if len(table.rows) > 0 and len(table.rows[0].cells) > 1:
            cell = table.cell(0, 1)
            
            # Paragraph 2: GE PO# <po>
            if len(cell.paragraphs) > 2:
                p2 = cell.paragraphs[2]
                # In the original, the third run (index 2) contains the PO number
                if len(p2.runs) >= 3:
                    p2.runs[2].text = str(po_num)
                else:
                    # Fallback if runs are structured differently
                    p2.text = f"GE PO#   {po_num}"
            
            # Paragraph 3: Part# <part_num>
            if len(cell.paragraphs) > 3:
                p3 = cell.paragraphs[3]
                # In the original, the third run (index 2) contains the Part#
                if len(p3.runs) >= 3:
                    p3.runs[2].text = str(part_num)
                else:
                    p3.text = f"Part#       {part_num}"
            
            # Paragraph 4: Description: <description>
            if len(cell.paragraphs) > 4:
                p4 = cell.paragraphs[4]
                # In the original, run 0 contains the "Description:    TEFLON SEAL" text
                # run 1 contains trailing spacing
                if len(p4.runs) >= 1:
                    p4.runs[0].text = f"Description:    {description}"
                else:
                    p4.text = f"Description:    {description}                              "
                    
    # Save the modified document
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc.save(output_path)
    print(f"Generated label document at: {output_path}")
    return output_path

if __name__ == "__main__":
    # Test generation
    template = "/Users/akashsingh/Downloads/PrintingTool/GE Label - 42300276510.docx"
    output = "/Users/akashsingh/Downloads/PrintingTool/Outputs/test_label.docx"
    generate_docx_labels(template, output, "42300191168", "1-503-24-065", "TEFLON SEAL (TEST)")
