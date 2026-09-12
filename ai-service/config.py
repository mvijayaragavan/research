import os
try:
    from dotenv import load_dotenv
    root_env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.env"))
    load_dotenv(root_env_path)
except ImportError:
    pass

AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "gemini-1.5-flash")
PORT = int(os.getenv("PYTHON_SERVICE_PORT", 8000))
