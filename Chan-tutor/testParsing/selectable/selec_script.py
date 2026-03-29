import pdfplumber
import re
import csv
import os

# --- CONFIGURATION ---
INPUT_FOLDER = "pdfs_to_process"
OUTPUT_CSV = "result/question_bank.csv"

# Regex for Question numbers (e.g., "1." or "125.")
Q_PATTERN = re.compile(r'^(\d+)\.\s')
# Regex for Choice letters (e.g., "A. ", "F. ", "(A) ")
CHOICE_PATTERN = re.compile(r'^([A-H])[\.\)]?\s')
# Regex to filter out system codes/Item IDs often found in test banks
SYSTEM_CODE_PATTERN = re.compile(r'^[A-Z]{2,}\d+_\d+')
NOISE = ["--- PAGE", "CONTINUE ON", "PART 1", "FORM A", "STOP", "GO ON", "FORM B"]

def get_media_letter(index):
    return chr(65 + index) # 0 -> A, 1 -> B...

def process_pdf(pdf_path):
    results = []
    filename = os.path.basename(pdf_path).replace(".pdf", "")
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # 1. Capture ALL media objects with their vertical 'top' position
            media_objects = []
            for obj_type in ['images', 'rects', 'curves']:
                for obj in getattr(page, obj_type):
                    # Filter: ignore small items like choice bubbles (width < 30)
                    if obj['width'] > 30 or obj['height'] > 30:
                        media_objects.append({'top': obj['top'], 'type': obj_type})
            
            # Sort media by vertical position
            media_objects.sort(key=lambda x: x['top'])

            # 2. Extract text and track question start positions
            lines = page.extract_text().split('\n')
            current_q = None
            
            # We will use this to track which media falls under which question
            questions_on_page = []

            for line in lines:
                clean_line = line.strip()
                if not clean_line or any(n in clean_line.upper() for n in NOISE):
                    continue
                
                # Detect Question
                q_match = Q_PATTERN.match(clean_line)
                if q_match:
                    if current_q: questions_on_page.append(current_q)
                    
                    # Store current 'top' approximate based on layout if possible
                    # but for most test banks, simple sequential assignment works.
                    current_q = {
                        "uid": f"{filename}_Q{q_match.group(1)}",
                        "q_num": q_match.group(1),
                        "text": clean_line,
                        "A": "", "B": "", "C": "", "D": "", "E": "", "F": "", "G": "", "H": "",
                        "raw_media": [] # Temporary bucket for media on this page
                    }
                    continue

                # Detect Choice
                c_match = CHOICE_PATTERN.match(clean_line)
                if c_match and current_q:
                    letter = c_match.group(1)
                    # Mapping for alternating labels like E, F, G, H to A, B, C, D if preferred
                    # but here we keep the original letter
                    current_q[letter] = clean_line[len(c_match.group(0)):].strip()
                    continue

                # Append Body Text (filtering out system codes like ER01101803_3)
                if current_q and not SYSTEM_CODE_PATTERN.match(clean_line):
                    current_q["text"] += " " + clean_line

            if current_q: questions_on_page.append(current_q)

            # 3. Assign Media IDs in the specific format: FileName_Q#_Letter
            # Logic: If a page has media, we distribute it among the questions on that page.
            # In complex cases, you'd compare Y-coordinates, but for 52 PDFs, 
            # a per-page tagging is the safest starting point for manual review.
            if media_objects and questions_on_page:
                # If there is only one question and one media, it's a perfect match.
                # If multiple, we tag the question with the ID for the manual step.
                for q in questions_on_page:
                    for i in range(len(media_objects)):
                        # Generate the specific ID you requested
                        tag = f"{filename}_Q{q['q_num']}_{get_media_letter(i)}"
                        q["raw_media"].append(tag)

            results.extend(questions_on_page)

    return results

def main():
    if not os.path.exists(INPUT_FOLDER):
        os.makedirs(INPUT_FOLDER)
        print(f"Put your PDFs in {INPUT_FOLDER}")
        return

    all_data = []
    for file in os.listdir(INPUT_FOLDER):
        if file.endswith(".pdf"):
            print(f"Processing {file}...")
            all_data.extend(process_pdf(os.path.join(INPUT_FOLDER, file)))

    # Write to CSV
    keys = ["uid", "text", "A", "B", "C", "D", "E", "F", "G", "H", "media_refs"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in all_data:
            writer.writerow({
                "uid": row["uid"],
                "text": row["text"],
                "A": row["A"], "B": row["B"], "C": row["C"], "D": row["D"],
                "E": row["E"], "F": row["F"], "G": row["G"], "H": row["H"],
                "media_refs": ", ".join(row["raw_media"])
            })
    print(f"Success! {len(all_data)} questions exported.")

if __name__ == "__main__":
    main()