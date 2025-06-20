# netlify/functions/get_structure.py
import os
from flask import jsonify
from serverless_wsgi import handle
from .shared_app import app # Import the shared app

# --- CONFIGURATION ---
SOURCE_MATERIAL_FOLDER = "source_material" 
SUBJECT_MAPPING = {
    "General Tamil": "general_tamil",
    "General Studies": "general_studies"
}

@app.route('/api/get-structure', methods=['GET'])
def get_structure():
    """Scans the source material directory and returns its structure."""
    structure = {}
    
    # CRITICAL: Build the absolute path from the project root in the serverless environment
    project_root = os.environ.get('LAMBDA_TASK_ROOT', os.getcwd())
    base_path = os.path.join(project_root, SOURCE_MATERIAL_FOLDER)
    
    if not os.path.isdir(base_path):
        return jsonify({"error": f"Base folder '{base_path}' not found."}), 404
        
    for subject_key, subject_folder in SUBJECT_MAPPING.items():
        subject_path = os.path.join(base_path, subject_folder)
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

# This is the handler function that Netlify will call
def handler(event, context):
    return handle(app, event, context)