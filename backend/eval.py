from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv
import os

load_dotenv()

# ===== NEW: grading schema =====
class EvaluationResult(BaseModel):
    is_complete: bool = Field(description="True if explanation is clear and complete.")
    feedback: str = Field(description="Short reason for the decision.")
    score: int = Field(description="Score 1-100 for teaching quality.")

# ===== NEW: evaluator model =====
llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    google_api_key=os.getenv("GEMINI_API_KEY"),
    temperature=0
)

structured_llm = llm.with_structured_output(EvaluationResult)

eval_template = """
You are a strict professor grading a teaching attempt.

Conversation:
{history}

User explanation:
{input_text}

Decide:
- complete + clear → True
- vague/incomplete/wrong → False

Return JSON only.
"""

eval_prompt = PromptTemplate(
    template=eval_template,
    input_variables=["history", "input_text"]
)

# ===== NEW: exported chain =====
evaluator_chain = eval_prompt | structured_llm
