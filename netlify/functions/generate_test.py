# netlify/functions/generate_test.py (ULTRA-SIMPLE HELLO WORLD TEST)

from flask import jsonify
from serverless_wsgi import handle
from .shared_app import app

@app.route('/api/generate-test', methods=['POST'])
def generate_test():
    # This function does nothing but return a success message.
    # It proves the function is being called correctly.
    return jsonify({"message": "Hello World! The function is running."})

# This handler remains the same
def handler(event, context):
    return handle(app, event, context)
