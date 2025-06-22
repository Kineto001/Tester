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
        raise ValueError("GEMINI_API_KEY not found in Replit Secrets.")
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

def generate_questions_for_topic(prompt):
    """Generates and parses questions for a single topic, with retries."""
    for attempt in range(2): # Retry once on failure
        try:
            response = model.generate_content(prompt)
            cleaned_json_str = clean_gemini_json_response(response.text)
            questions = json.loads(cleaned_json_str)
            if isinstance(questions, list) and len(questions) > 0:
                return questions
            else:
                print(f"Warning: AI returned empty or invalid list for prompt. Retrying...")
        except json.JSONDecodeError as e:
            print(f"JSONDecodeError on attempt {attempt+1}: {e}. Response was: {response.text}")
        except Exception as e:
            print(f"An unexpected error occurred on attempt {attempt+1}: {e}")
        time.sleep(1) # Wait before retrying
    return [] # Return empty list if all retries fail


# --- PROMPT TEMPLATE ---
PROMPT_TEMPLATE = """
You are an expert TNPSC Group 4 exam question creator. Your task is to generate {num_questions} high-quality, challenging multiple-choice questions (MCQs) in {language} for the topic: '{topic}'.

**Source Context (Use if provided):**
\"\"\"
{context}
\"\"\"

**Crucial Instructions:**
1.  **Difficulty:** Questions must be of a competitive exam standard (medium to high difficulty). Avoid simple, direct-recall questions. Focus on questions that require analysis, application, or deep understanding.
2.  **Question Variety:** Generate a mix of the following question formats:
    *   **Standard MCQ:** "Choose the correct answer."
    *   **Match the Following:** The question should present two lists (e.g., Authors and Books) and the options should be the correctly matched codes (e.g., "A-2, B-4, C-1, D-3").
    *   **Assertion and Reason (A/R):** The question should contain an Assertion (A) and a Reason (R). The options must be: "(A) is correct, (R) is the correct explanation of (A)", "(A) is correct, but (R) is not the correct explanation of (A)", "(A) is correct, (R) is incorrect", "(A) is incorrect, (R) is correct".
    *   **Find the Odd One Out / Incorrectly Matched Pair:** The question should ask the user to identify the item that doesn't belong or the pair that is wrongly matched.
3.  **Format:** Return the output as a single, valid JSON array of objects. **Do not include any text, notes, or markdown outside the final JSON array.**

**JSON Object Structure:**
{{
  "question": "The full question text, including any lists for matching or Assertion/Reason statements.",
  "options": [
    "Option A",
    "Option B",
    "Option C",
    "Option D"
  ],
  "correct_answer_index": <index of the correct option, 0-3>,
  "explanation": "A clear, concise explanation for why the correct answer is right."
}}

Generate exactly {num_questions} questions now.
"""

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
    try:
        subject_folder = SUBJECT_MAPPING.get(subject)
        file_path = os.path.join(SOURCE_MATERIAL_FOLDER, subject_folder, unit, f"{topic}.txt")
        with open(file_path, 'r', encoding='utf-8') as f:
            context_text = f.read()
    except Exception:
        print(f"Note: Could not read source file for {subject}/{unit}/{topic}. Generating from general knowledge.")
    prompt = PROMPT_TEMPLATE.format(num_questions=num_questions, language=language, topic=f"{topic} (from {unit})", context=context_text)
    questions = generate_questions_for_topic(prompt)
    if not questions:
        return jsonify({"error": "The AI failed to generate questions for the topic after multiple attempts. Please try again."}), 500
    return jsonify(questions)


@app.route('/api/generate-mock-test', methods=['POST'])
def generate_mock_test():
    if not model:
        return jsonify({"error": "Gemini API is not configured."}), 500
    MOCK_TEST_STRUCTURE = {
        "General Tamil": {
            "language": "Tamil",
            "topics": {"இலக்கணம்": 25, "சொல்லகராதி": 15, "எழுதும் திறன்": 15, "கலை சொற்கள்": 10, "வாசித்தல்": 15, "மொழி பெயர்ப்பு": 5, "இலக்கியம்": 15}
        },
        "General Studies": {
            "language": "English and Tamil",
            "topics": {"General Science": 5, "Geography": 5, "History, Culture of India, and Indian National Movement": 10, "Indian Polity": 15, "Indian Economy and Development Administration in Tamil Nadu": 20, "History, Culture, Heritage, and Socio-Political Movements of Tamil Nadu": 20, "Aptitude and Mental Ability": 25}
        }
    }
    all_questions = []
    for subject, details in MOCK_TEST_STRUCTURE.items():
        subject_folder = SUBJECT_MAPPING.get(subject)
        language = details['language']
        for topic, num_questions in details['topics'].items():
            print(f"Generating {num_questions} questions for {subject} -> {topic}...")
            context_text = "No specific context file found for this mock test topic. Generate from general knowledge."
            try:
                sanitized_topic_folder = topic.split(',')[0].replace(' ', '_')
                topic_path = os.path.join(SOURCE_MATERIAL_FOLDER, subject_folder, sanitized_topic_folder)
                if os.path.isdir(topic_path):
                    for filename in os.listdir(topic_path):
                        if filename.endswith('.txt'):
                            with open(os.path.join(topic_path, filename), 'r', encoding='utf-8') as f:
                                context_text = f.read()
                            print(f"Found context file: {filename}")
                            break
            except Exception as e:
                print(f"Could not find/read context for {topic}: {e}")
            prompt = PROMPT_TEMPLATE.format(num_questions=num_questions, language=language, topic=topic, context=context_text)
            generated_qs = generate_questions_for_topic(prompt)
            if generated_qs:
                all_questions.extend(generated_qs)
            else:
                print(f"Warning: Failed to generate any questions for topic: {topic}")
    if len(all_questions) < 180:
         return jsonify({"error": f"Failed to generate a complete test. Only got {len(all_questions)}/200 questions. Please try again."}), 500
    random.shuffle(all_questions)
    return jsonify(all_questions)


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