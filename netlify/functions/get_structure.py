# netlify/functions/get_structure.py
import os
from flask import jsonify
from .shared_app import app # Import the shared Flask app

# Constants can be defined here or in shared_app
SOURCE_MATERIAL_FOLDER = "source_material" 
SUBJECT_MAPPING = {
    "General Tamil": "general_tamil",
    "General Studies": "general_studies"
}

# The route is defined on the shared app object
@app.route('/api/get-structure', methods=['GET'])
def get_structure():
    """Scans the source material directory and returns its structure."""
    # ... your get_structure function logic is IDENTICAL ...
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

# This handler is what Netlify actually calls.
# It uses the Flask app's WSGI interface.
def handler(event, context):
    return app.wsgi_app(event, context)