# netlify/functions/generate_test.py  (DIAGNOSTIC VERSION)

import os
import json
import random
import math
from flask import request, jsonify
from serverless_wsgi import handle
# We don't import the model here to isolate the problem
from .shared_app import app

# --- CONFIGURATION ---
SOURCE_MATERIAL_FOLDER = "source_material" 
SUBJECT_MAPPING = {
    "General Tamil": "general_tamil",
    "General Studies": "general_studies"
}

@app.route('/api/generate-test', methods=['POST'])
def generate_test():
    """DIAGNOSTIC VERSION: Checks file access and basic functionality."""
    data = request.json
    subject = data.get('subject')
    unit = data.get('unit')
    topic = data.get('topic')
    context_text = ""
    file_path_to_check = ""

    # --- Step 1: Try to access the source file ---
    try:
        project_root = os.environ.get('LAMBDA_TASK_ROOT', os.getcwd())
        subject_folder = SUBJECT_MAPPING.get(subject)
        file_path_to_check = os.path.join(project_root, SOURCE_MATERIAL_FOLDER, subject_folder, unit, f"{topic}.txt")
        
        with open(file_path_to_check, 'r', encoding='utf-8') as f:
            # Read just the first 100 chars to prove we can open it
            context_text = f.read(100)
    except Exception as e:
        # If this fails, return a specific error
        return jsonify({
            "error": "CRITICAL: Failed to read the source file.",
            "details": str(e),
            "checked_path": file_path_to_check
        }), 500

    # --- Step 2: If file access is successful, return a hardcoded success response ---
    # This bypasses the Gemini API call completely.
    mock_questions = [
        {
            "question": f"DIAGNOSTIC: If you see this, file access for '{topic}.txt' was successful. The first 100 chars are: '{context_text[:100]}...'",
            "options": ["Option A", "Option B", "Option C", "Success!"],
            "correct_answer_index": 3,
            "explanation": "This is a mock response to confirm the function is running and can access source files. The problem is likely with the Gemini API call (timeout or API key)."
        }
    ]
    return jsonify(mock_questions)


# This handler remains the same
def handler(event, context):
    return handle(app, event, context)