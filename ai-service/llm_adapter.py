import os
import requests
try:
    import google.generativeai as genai
except ImportError:
    genai = None

from config import AI_PROVIDER, AI_MODEL, AI_API_KEY

class LLMAdapter:
    """
    Unified LLM Abstraction Adapter for PrivacyGuard AI
    Supports: Google Gemini API, Local Ollama, and Grounded Fallback Generator
    """

    def __init__(self):
        self.provider = AI_PROVIDER.lower()
        self.model_name = AI_MODEL
        self.api_key = AI_API_KEY

        if self.provider == "gemini" and genai and self.api_key and self.api_key != "your_gemini_api_key_here":
            try:
                genai.configure(api_key=self.api_key)
                self.gemini_model = genai.GenerativeModel(self.model_name)
                print(f"[LLM Adapter] Gemini API configured successfully with model {self.model_name}")
            except Exception as e:
                print(f"[LLM Adapter Warning] Gemini setup error: {e}")
                self.gemini_model = None
        else:
            self.gemini_model = None

    def generate_response(self, user_query: str, sanitized_context: str) -> str:
        """
        Generate answer from sanitized context enforcing strict prompt boundaries and grounding
        """
        system_prompt = (
            "You are a PDF question-answering assistant.\n"
            "STRICT GROUNDING RULES:\n"
            "1. Answer ONLY using the supplied document context.\n"
            "2. Do NOT use your general training knowledge to fill missing information.\n"
            "3. If the answer cannot be found in the retrieved document context, say:\n"
            "   'I could not find this information in the selected PDF.'\n"
            "4. Do not invent facts, names, numbers, dates, or conclusions.\n"
        )

        prompt_payload = f"{system_prompt}\n<document_context>\n{sanitized_context}\n</document_context>\n\nUser Question: {user_query}"

        # Try Gemini API if configured
        if self.provider == "gemini" and self.gemini_model:
            try:
                response = self.gemini_model.generate_content(prompt_payload)
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                print(f"[LLM Adapter Warning] Gemini API call failed: {e}. Falling back to grounded synthesis.")

        # Try Ollama if configured
        if self.provider == "ollama":
            try:
                ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
                res = requests.post(ollama_url, json={
                    "model": self.model_name,
                    "prompt": prompt_payload,
                    "stream": False
                }, timeout=10)
                if res.status_code == 200:
                    return res.json().get("response", "").strip()
            except Exception as e:
                print(f"[LLM Adapter Warning] Ollama call failed: {e}")

        # Grounded Fallback Generator
        return self._generate_fallback_answer(user_query, sanitized_context)

    def _generate_fallback_answer(self, user_query: str, context: str) -> str:
        """
        Grounded response generator when cloud API is unavailable
        """
        if not context or context.strip() == "No specific document context found.":
            return "I could not find this information in the selected PDF."

        query_terms = [w.lower() for w in user_query.split() if len(w) > 2 and w.lower() not in {"what", "when", "who", "where", "how", "this", "that", "the", "does", "which"}]
        context_lines = [line.strip() for line in context.split("\n") if line.strip() and not line.startswith("[MINIMIZED") and not line.startswith("---") and not line.startswith("[Chunk")]

        matched_facts = []
        for line in context_lines:
            line_lower = line.lower()
            if any(term in line_lower for term in query_terms):
                matched_facts.append(line)

        if not matched_facts:
            return "I could not find this information in the selected PDF."

        answer = "Based on the selected PDF document context:\n"
        seen = set()
        for fact in matched_facts:
            if fact not in seen:
                seen.add(fact)
                answer += f"- {fact}\n"
            if len(seen) >= 4:
                break

        return answer.strip()
