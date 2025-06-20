# netlify/functions/shared_app.py
import os
import google.generativeai as genai
from flask import Flask
from dotenv import load_dotenv

load_dotenv()

# --- SHARED FLASK APP & GEMINI SETUP ---
app = Flask(__name__)
model = None

try:
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY not found in environment variables.")
    genai.configure(api_key=gemini_api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')
except Exception as e:
    # We print the error, so it shows up in Netlify Function logs
    print(f"FATAL: Error configuring Gemini API: {e}")

# --- SHARED HELPER FUNCTIONS ---
def clean_gemini_json_response(response_text):
    """Cleans the Gemini response to extract a valid JSON string."""
    start_index = response_text.find('[')
    end_index = response_text.rfind(']')
    if start_index != -1 and end_index != -1:
        return response_text[start_index:end_index+1]
    # Fallback for responses that might not be arrays
    start_index = response_text.find('{')
    end_index = response_text.rfind('}')
    if start_index != -1 and end_index != -1:
        return response_text[start_index:end_index+1]
    return response_text.strip().replace("```json", "").replace("```", "")