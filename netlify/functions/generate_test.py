# netlify/functions/generate_test.py
import os
import json
import random
import math
from flask import request, jsonify
from serverless_wsgi import handle
from .shared_app import app, model, clean_gemini_json_response

# --- CONFIGURATION ---
SOURCE_MATERIAL_FOLDER = "source_material" 
SUBJECT_MAPPING = {
    "General Tamil": "general_tamil",
    "General Studies": "general_studies"
}

@app.route('/api/generate-test', methods=['POST'])
def generate_test():
    """The core AI engine endpoint for generating questions."""
    if not model:
        return jsonify({"error": "Gemini API is not configured. Check the function logs."}), 500

    data = request.json
    subject = data.get('subject')
    unit = data.get('unit')
    topic = data.get('topic')
    language = data.get('language')
    total_questions = int(data.get('num_questions', 10))

    file_based_count = math.ceil(total_questions * 0.6)
    newly_generated_count = total_questions - file_based_count

    try:
        # CRITICAL: Build the absolute path from the project root in the serverless environment
        project_root = os.environ.get('LAMBDA_TASK_ROOT', os.getcwd())
        subject_folder = SUBJECT_MAPPING.get(subject)
        file_path = os.path.join(project_root, SOURCE_MATERIAL_FOLDER, subject_folder, unit, f"{topic}.txt")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            context_text = f.read()
    except Exception as e:
        return jsonify({"error": f"Could not read source file: {file_path}. Error: {e}"}), 404

    all_questions = []
    
    # --- PROMPTS ---
    # The prompts themselves do not need to be changed.
    # [Your prompt logic from the original main.py goes here]
    try:
        # Prompt 1 (File-Based)
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
            
            **Specific Guidance for Tamil Grammar Questions (if applicable):**
            - For "பிரித்து எழுதுக" (Split the word) questions: You MUST select a single, valid compound word (ஒரு புணர்ச்சிக்குரிய சொல்) for splitting. Do NOT use long phrases.
            - For "எதிர்ச்சொல்" (Antonym) or "பொருள் தருக" (Synonym) questions: Focus on a single, meaningful word from the context.
            - Ensure all question options are grammatically plausible and challenging.

            **JSON Format Example:**
            [
              {{"question": "...", "options": ["...", "...", "...", "..."], "correct_answer_index": 2, "explanation": "..."}}
            ]
            """
            response1 = model.generate_content(prompt1)
            cleaned_json_str1 = clean_gemini_json_response(response1.text)
            all_questions.extend(json.loads(cleaned_json_str1))

        # Prompt 2 (Newly Generated)
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

            **Specific Guidance for Tamil Grammar Questions (if applicable):**
            - For "பிரித்து எழுதுக" (Split the word) questions: You MUST select a single, valid compound word (ஒரு புணர்ச்சிக்குரிய சொல்) for splitting. Do NOT use long phrases.
            - For "எதிர்ச்சொல்" (Antonym) or "பொருள் தருக" (Synonym) questions: Focus on a single, meaningful word.
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

# This is the handler function that Netlify will call
def handler(event, context):
    return handle(app, event, context)