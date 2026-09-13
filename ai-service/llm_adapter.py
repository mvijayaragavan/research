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
            "You are a grounded PDF question-answering assistant.\n"
            "STRICT GROUNDING RULES:\n"
            "1. Answer the user's question directly using ONLY the supplied document context.\n"
            "2. Do NOT invent facts, commands, names, numbers, dates, procedures, credentials, or code.\n"
            "3. Do NOT return or quote raw retrieved passages as a substitute for an answer.\n"
            "4. If the supplied document context does NOT contain the answer or enough information to answer the question, say explicitly:\n"
            "   'I could not find this information in the selected PDF.'\n"
            "5. Do not treat the presence of retrieved context as proof that the answer is supported.\n"
            "6. Return only information directly supported by the context.\n"
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

        stopwords = {"what", "when", "who", "where", "how", "this", "that", "the", "does", "which", "give", "show", "tell", "list"}
        query_terms = [w.lower() for w in user_query.split() if len(w) > 2 and w.lower() not in stopwords]
        if not query_terms:
            return "I could not find this information in the selected PDF."

        context_lines = [line.strip() for line in context.split("\n") if line.strip() and not line.startswith("[MINIMIZED") and not line.startswith("---") and not line.startswith("[Chunk")]

        matched_facts = []
        for line in context_lines:
            line_lower = line.lower()
            if any(term in line_lower for term in query_terms):
                matched_facts.append(line)

        if not matched_facts:
            return "I could not find this information in the selected PDF."

        # If asking for commands/passwords/specifics, verify the lines actually contain actionable answers
        q_lower = user_query.lower()
        if "command" in q_lower or "commands" in q_lower:
            command_indicators = ["npm ", "node ", "cypher", "run ", "execute", "install", "setup", "git ", "docker ", "python "]
            matched_facts = [f for f in matched_facts if any(ci in f.lower() for ci in command_indicators)]
            if not matched_facts:
                return "I could not find specific commands in the selected document."

        if "password" in q_lower or "credential" in q_lower or "secret" in q_lower:
            sec_indicators = ["password:", "password =", "pass:", "secret:"]
            matched_facts = [f for f in matched_facts if any(si in f.lower() for si in sec_indicators)]
            if not matched_facts:
                return "I could not find that information in the selected document."

        answer = "Based on the selected PDF document context:\n"
        seen = set()
        for fact in matched_facts:
            if fact not in seen:
                seen.add(fact)
                answer += f"- {fact}\n"
            if len(seen) >= 4:
                break

        return answer.strip()
