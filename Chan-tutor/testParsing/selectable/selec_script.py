import pdfplumber
print("Library is successfully imported!")
import re
import csv
import os

# --- CONFIGURATION ---
INPUT_FOLDER = "tests"
OUTPUT_CSV = "result/question_bank.csv"
Q_PATTERN = re.compile(r'^(\d+)\.\s') 
CHOICE_PATTERN = re.compile(r'^([A-H])[\.\)]\s')
NOISE = ["--- PAGE", "CONTINUE ON", "PART 1", "FORM A", "STOP", "GO ON"]

def is_noise(text):
    return any(n in text.upper() for n in NOISE)

def process_pdf(pdf_path):
    questions = []
    current_q = None
    filename = os.path.basename(pdf_path)
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # 1. Collect all visual elements on this page
            # rects and curves are common in tables and vector charts
            visual_elements = page.images + page.rects + page.curves
            
            # 2. Extract text and track the "top" coordinate of each line
            # We use layout=True to keep the structure more consistent
            text_lines = page.extract_text().split('\n')
            
            # For more precision, we can use page.extract_words() 
            # but for a standard question bank, line-by-line is faster.
            
            for line in text_lines:
                clean_line = line.strip()
                if not clean_line or is_noise(clean_line):
                    continue
                
                # Check for New Question
                q_match = Q_PATTERN.match(clean_line)
                if q_match:
                    if current_q:
                        questions.append(current_q)
                    
                    q_num = q_match.group(1)
                    current_q = {
                        "uid": f"{filename[:-4]}_Q{q_num}",
                        "question_text": clean_line,
                        "A": "", "B": "", "C": "", "D": "", "E": "", "F": "", "G": "", "H": "",
                        "has_media": "No"
                    }
                    
                    # Detect if there's visual media on this page
                    # In most test PDFs, if an image exists, it's related to the questions on that page.
                    if len(visual_elements) > 0:
                        current_q["has_media"] = "Yes"
                        # Append a specific tag so you can filter the CSV easily
                        if page.images:
                            current_q["question_text"] += " [IMAGE_DETECTED]"
                        if page.rects or page.curves:
                            current_q["question_text"] += " [TABLE/GRAPH_DETECTED]"
                    continue
                
                # Check for Choices
                c_match = CHOICE_PATTERN.match(clean_line)
                if c_match and current_q:
                    letter = c_match.group(1)
                    content = clean_line[len(c_match.group(0)):].strip()
                    current_q[letter] = content
                    continue
                
                # Append body text
                if current_q:
                    current_q["question_text"] += " " + clean_line

        if current_q:
            questions.append(current_q)
            
    return questions

def main():
    all_questions = []
    if not os.path.exists(INPUT_FOLDER):
        os.makedirs(INPUT_FOLDER)
        print(f"Created folder '{INPUT_FOLDER}'. Put your PDFs there and re-run.")
        return

    for file in os.listdir(INPUT_FOLDER):
        if file.endswith(".pdf"):
            print(f"Processing {file}...")
            try:
                data = process_pdf(os.path.join(INPUT_FOLDER, file))
                all_questions.extend(data)
            except Exception as e:
                print(f"Error processing {file}: {e}")

    keys = ["uid", "question_text", "A", "B", "C", "D", "E", "F", "G", "H", "has_media"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(all_questions)
    
    print(f"Extraction complete. {len(all_questions)} questions saved to {OUTPUT_CSV}")

if __name__ == "__main__":
    main()