import os
import json
import random
import math
import time
from flask import Flask, request, jsonify, render_template
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, template_folder='templates', static_folder='static')

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
    model = genai.GenerativeModel('gemini-1.5-flash-latest')
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

# --- PROMPT TEMPLATES ---
PROMPT_TEMPLATE = """
You are an expert TNPSC Group 4 exam question creator. Your task is to generate {num_questions} high-quality, challenging multiple-choice questions (MCQs) in {language} for the topic: '{topic}'.

**Source Context (Use if provided, otherwise use general knowledge):**
\"\"\"
{context}
\"\"\"

**Crucial Instructions:**
1.  **Difficulty:** Questions must be of a competitive exam standard (medium to high difficulty). Avoid simple, direct-recall questions. Focus on questions that require analysis, application, or deep understanding.
2.  **Question Variety:** Generate a mix of the following question formats:
    *   **Standard MCQ:** "Choose the correct answer."
    *   **Match the Following:** The question should present two lists and the options should be the correctly matched codes.
    *   **Assertion and Reason (A/R):** The question should contain an Assertion (A) and a Reason (R).
    *   **Find the Odd One Out / Incorrectly Matched Pair:** The question should ask the user to identify the item that doesn't belong or the pair that is wrongly matched.
3.  **Format:** Return the output as a single, valid JSON array of objects. **Do not include any text, notes, or markdown outside the final JSON array.**
4.  **Quality Control:** All questions, options, and explanations must be factually correct, clear, and unambiguous.

**JSON Object Structure:**
{{
  "question": "The full question text.",
  "options": [ "Option A", "Option B", "Option C", "Option D" ],
  "correct_answer_index": <index of the correct option, 0-3>,
  "explanation": "A clear, concise explanation for why the correct answer is right."
}}

Generate exactly {num_questions} questions now.
"""

FALLBACK_PROMPT_TEMPLATE = """
You are an expert TNPSC Group 4 exam question creator. Your task is to generate {num_questions} standard multiple-choice questions (MCQs) in {language} for the topic: '{topic}'.

**Source Context (Use if provided, otherwise use general knowledge):**
\"\"\"
{context}
\"\"\"

**Instructions:**
1.  **Standard:** Questions must be of a standard TNPSC Group 4 level. They must be accurate and meaningful.
2.  **Focus:** Concentrate on core, fundamental concepts related to the topic. Avoid overly complex or niche formats. Simple MCQs are perfect.
3.  **Format:** Return the output as a single, valid JSON array of objects. **Do not include any text, notes, or markdown outside the final JSON array.**

**JSON Object Structure:**
{{
  "question": "The full question text.",
  "options": [ "Option A", "Option B", "Option C", "Option D" ],
  "correct_answer_index": <index of the correct option, 0-3>,
  "explanation": "A clear, concise explanation for why the correct answer is right."
}}

Generate exactly {num_questions} questions now.
"""

def generate_questions_for_topic(prompt_details):
    """Generates and parses questions for a single topic, with a fallback prompt on retry."""
    num_questions = prompt_details['num_questions']
    language = prompt_details['language']
    topic = prompt_details['topic']
    context = prompt_details['context']

    for attempt in range(2):
        if attempt == 0:
            print(f"Attempt 1 for topic '{topic}': Using standard prompt.")
            prompt = PROMPT_TEMPLATE.format(num_questions=num_questions, language=language, topic=topic, context=context)
        else:
            print(f"Warning: Attempt 1 failed. Retrying for topic '{topic}' with a simplified fallback prompt.")
            prompt = FALLBACK_PROMPT_TEMPLATE.format(num_questions=num_questions, language=language, topic=topic, context=context)
        
        try:
            response = model.generate_content(prompt)
            cleaned_json_str = clean_gemini_json_response(response.text)
            questions = json.loads(cleaned_json_str)
            if isinstance(questions, list) and len(questions) > 0:
                print(f"Successfully generated {len(questions)} questions for '{topic}' on attempt {attempt+1}.")
                return questions
        except json.JSONDecodeError as e:
            print(f"JSONDecodeError on attempt {attempt+1} for '{topic}': {e}. Response was: {response.text}")
        except Exception as e:
            print(f"An unexpected error occurred on attempt {attempt+1} for '{topic}': {e}")
        
        time.sleep(1.5)

    print(f"Error: All attempts failed for topic '{topic}'. Returning empty list.")
    return []

# --- API ENDPOINTS ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get-structure', methods=['GET'])
def get_structure():
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
                    topics = [f.replace('.txt', '') for f in os.listdir(unit_path) if f.endswith('.txt')]
                    structure[subject_key][unit_folder] = sorted(topics)
    return jsonify(structure)


@app.route('/api/generate-test', methods=['POST'])
def generate_test():
    if not model:
        return jsonify({"error": "Gemini API is not configured."}), 500
    data = request.json
    subject = data.get('subject')
    unit = data.get('unit')
    topic = data.get('topic')
    language = data.get('language')
    num_questions = int(data.get('num_questions', 10))
    
    context_text = "No specific context provided. Generate questions based on general knowledge of the topic."
    topic_display = topic
    subject_folder = SUBJECT_MAPPING.get(subject)

    if subject_folder and unit and topic:
        try:
            file_path = os.path.join(SOURCE_MATERIAL_FOLDER, subject_folder, unit, f"{topic}.txt")
            with open(file_path, 'r', encoding='utf-8') as f:
                context_text = f.read()
            topic_display = f"{topic} (from {unit})"
        except Exception:
            print(f"Note: Could not read source file for {subject}/{unit}/{topic}. Will generate from general knowledge.")
    
    prompt_details = {
        'num_questions': num_questions,
        'language': language,
        'topic': topic_display,
        'context': context_text
    }
    
    all_questions = generate_questions_for_topic(prompt_details)
    random.shuffle(all_questions)

    if not all_questions:
        return jsonify({"error": f"The AI failed to generate questions for the topic '{topic}' after multiple attempts. Please try again."}), 500
    
    return jsonify(all_questions)


@app.route('/api/get-mock-test-structure', methods=['GET'])
def get_mock_test_structure():
    """Provides the blueprint for the mock test to the client."""
    MOCK_TEST_BLUEPRINT = {
        "subjects": [
            {
                "name": "General Tamil",
                "language": "Tamil",
                "topics": [
                    {"topic": "இலக்கணம்", "count": 25},
                    {"topic": "சொல்லகராதி", "count": 15},
                    {"topic": "எழுதும் திறன்", "count": 15},
                    {"topic": "கலை சொற்கள்", "count": 10},
                    {"topic": "வாசித்தல்", "count": 15},
                    {"topic": "மொழி பெயர்ப்பு", "count": 5},
                    {"topic": "இலக்கியம்", "count": 15}
                ]
            },
            {
                "name": "General Studies",
                "language": "USER_CHOICE", # To be replaced by user's selection on the client
                "topics": [
                    {"topic": "General Science", "count": 5},
                    {"topic": "Geography", "count": 5},
                    {"topic": "History, Culture of India, and Indian National Movement", "count": 10},
                    {"topic": "Indian Polity", "count": 15},
                    {"topic": "Indian Economy and Development Administration in Tamil Nadu", "count": 20},
                    {"topic": "History, Culture, Heritage, and Socio-Political Movements of Tamil Nadu", "count": 20},
                    {"topic": "Aptitude and Mental Ability", "count": 25}
                ]
            }
        ]
    }
    return jsonify(MOCK_TEST_BLUEPRINT)


@app.route('/api/chat-support', methods=['POST'])
def chat_support():
    if not model:
        return jsonify({"error": "Gemini API is not configured."}), 500
    data = request.json
    user_query = data.get('user_query')
    question_text = data.get('question_text')
    if not user_query or not question_text:
        return jsonify({"error": "Missing user_query or question_text"}), 400
    try:
        prompt = f"""
        You are "VidhAI", a helpful AI tutor for the TNPSC exam. A student is stuck on a question. Your goal is to provide a useful hint *without giving away the answer*.
        **Test Question:** "{question_text}"
        **Student's Request:** "{user_query}"
        **Your Task:** Provide a short, clear hint. If the student asks for the answer, gently refuse and provide a clue instead. Maintain a supportive tone.
        """
        response = model.generate_content(prompt)
        return jsonify({"reply": response.text})
    except Exception as e:
        return jsonify({"error": f"An error occurred while getting a hint: {e}"}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)