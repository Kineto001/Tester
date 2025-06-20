import os
import json
import random
import math
from flask import Flask, request, jsonify, render_template
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables for local development (e.g., from a .env file)
# On Replit, these will be loaded from Secrets.
load_dotenv()

app = Flask(__name__)

# --- CONFIGURATION ---
SOURCE_MATERIAL_FOLDER = "source_material" 
SUBJECT_MAPPING = {
    "General Tamil": "general_tamil",
    "General Studies": "general_studies"
}

# --- GEMINI API SETUP ---
try:
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY not found in environment variables.")
    genai.configure(api_key=gemini_api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')
except Exception as e:
    print(f"Error configuring Gemini API: {e}")
    model = None

# --- HELPER FUNCTIONS ---
def clean_gemini_json_response(response_text):
    """Cleans the Gemini response to extract a valid JSON string."""
    start_index = response_text.find('[')
    end_index = response_text.rfind(']')
    if start_index != -1 and end_index != -1:
        return response_text[start_index:end_index+1]
    return response_text.strip().replace("```json", "").replace("```", "")

# --- API ENDPOINTS ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get-structure', methods=['GET'])
def get_structure():
    """Scans the source material directory and returns its structure."""
    structure = {}
    if not os.path.isdir(SOURCE_MATERIAL_FOLDER):
        return jsonify({"error": f"Base folder '{SOURCE_MATERIAL_FOLDER}' not found."}), 404
        
    for subject_key, subject_folder in SUBJECT_MAPPING.items():
        subject_path = os.path.join(SOURCE_MATERIAL_FOLDER, subject_folder)
        if os.path.isdir(subject_path):
            structure[subject_key] = {}
            for unit_folder in sorted(os.listdir(subject_path)):
                unit_path = os.path.join(subject_path, unit_folder)
                if os.path.isdir(unit_path):
                    topics = [
                        f.replace('.txt', '') for f in os.listdir(unit_path) 
                        if f.endswith('.txt')
                    ]
                    structure[subject_key][unit_folder] = topics
    return jsonify(structure)


@app.route('/api/generate-test', methods=['POST'])
def generate_test():
    """The core AI engine endpoint for generating questions."""
    if not model:
        return jsonify({"error": "Gemini API is not configured."}), 500

    data = request.json
    subject = data.get('subject')
    unit = data.get('unit')
    topic = data.get('topic')
    language = data.get('language')
    total_questions = int(data.get('num_questions', 10))

    file_based_count = math.ceil(total_questions * 0.6)
    newly_generated_count = total_questions - file_based_count

    try:
        subject_folder = SUBJECT_MAPPING.get(subject)
        file_path = os.path.join(SOURCE_MATERIAL_FOLDER, subject_folder, unit, f"{topic}.txt")
        with open(file_path, 'r', encoding='utf-8') as f:
            context_text = f.read()
    except Exception as e:
        return jsonify({"error": f"Could not read source file: {file_path}. Error: {e}"}), 404

    all_questions = []
    
    # --- REFINED PROMPTS WITH SPECIFIC GUIDANCE ---
    try:
        # Prompt 1 (File-Based) with new guidance
        if file_based_count > 0:
            prompt1 = f"""
            You are an expert TNPSC exam question creator specializing in Tamil.
            Based *only* on the following context, generate exactly {file_based_count} multiple-choice questions (MCQs) in the {language} language, relevant to the topic of '{topic}'.
            The context is from TNPSC Group 4 study material.

            **Context:**
            \"\"\"
            {context_text}
            \"\"\"

            **Instructions:**
            1. Each question must have four options.
            2. One option must be the correct answer.
            3. Provide a brief but clear explanation for why the correct answer is right.
            4. Return the output as a single, valid JSON array of objects. Do not include any text outside the JSON array.
            
            # --- NEWLY ADDED SECTION FOR BETTER TAMIL GRAMMAR QUESTIONS ---
            **Specific Guidance for Tamil Grammar Questions (if applicable):**
            - **For "பிரித்து எழுதுக" (Split the word) questions:** You MUST select a single, valid compound word (ஒரு புணர்ச்சிக்குரிய சொல்) for splitting. Do NOT use long phrases.
                - **Correct Example:** Ask to split 'சிறுகதை'. Correct options would be based on 'சிறுமை + கதை'.
                - **Incorrect Example:** Do NOT ask to split a long phrase like 'தமிழ்நாடு அரசுப் பணியாளர் தேர்வாணையம்'. This is an invalid question type.
            - **For "எதிர்ச்சொல்" (Antonym) or "பொருள் தருக" (Synonym) questions:** Focus on a single, meaningful word from the context.
            - Ensure all question options are grammatically plausible and challenging.

            **JSON Format Example:**
            [
              {{"question": "...", "options": ["...", "...", "...", "..."], "correct_answer_index": 2, "explanation": "..."}}
            ]
            """
            response1 = model.generate_content(prompt1)
            cleaned_json_str1 = clean_gemini_json_response(response1.text)
            all_questions.extend(json.loads(cleaned_json_str1))

        # Prompt 2 (Newly Generated) with new guidance
        if newly_generated_count > 0:
            prompt2 = f"""
            You are an expert TNPSC exam question creator specializing in Tamil.
            Generate exactly {newly_generated_count} new and original multiple-choice questions (MCQs) in the {language} language, for the TNPSC Group 4 exam on the topic of '{topic}' from '{unit}'.
            These questions should test a deep understanding of the topic.

            **Instructions:**
            1. Each question must have four options.
            2. One option must be the correct answer.
            3. Provide a brief but clear explanation for why the correct answer is right.
            4. Return the output as a single, valid JSON array of objects. Do not include any text outside the JSON array.

            # --- NEWLY ADDED SECTION FOR BETTER TAMIL GRAMMAR QUESTIONS ---
            **Specific Guidance for Tamil Grammar Questions (if applicable):**
            - **For "பிரித்து எழுதுக" (Split the word) questions:** You MUST select a single, valid compound word (ஒரு புணர்ச்சிக்குரிய சொல்) for splitting. Do NOT use long phrases.
                - **Correct Example:** Ask to split 'செந்தமிழ்'. Correct options would be based on 'செம்மை + தமிழ்'.
                - **Incorrect Example:** Do NOT ask to split a long phrase like 'உலகப் பொதுமறை எனப் போற்றப்படும் நூல்'. This is an invalid question type.
            - **For "எதிர்ச்சொல்" (Antonym) or "பொருள் தருக" (Synonym) questions:** Focus on a single, meaningful word.
            - Ensure all question options are grammatically plausible and challenging.

            **JSON Format Example:**
            [
              {{"question": "...", "options": ["...", "...", "...", "..."], "correct_answer_index": 1, "explanation": "..."}}
            ]
            """
            response2 = model.generate_content(prompt2)
            cleaned_json_str2 = clean_gemini_json_response(response2.text)
            all_questions.extend(json.loads(cleaned_json_str2))

    except json.JSONDecodeError as e:
        error_text = "Could not decode response."
        if 'response1' in locals() and response1: error_text = response1.text
        if 'response2' in locals() and response2: error_text = response2.text
        return jsonify({"error": f"Failed to parse JSON response from AI. Error: {e}. Response text: {error_text}"}), 500
    except Exception as e:
        return jsonify({"error": f"An error occurred while generating questions: {e}"}), 500

    random.shuffle(all_questions)
    return jsonify(all_questions)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)