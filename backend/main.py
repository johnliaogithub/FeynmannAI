import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from elevenlabs.client import ElevenLabs
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel

# Load API Key
load_dotenv()
api_key = os.getenv("ELEVENLABS_API_KEY")
google_api_key = os.getenv("GEMINI_API_KEY")
client = ElevenLabs(api_key=api_key)

# Initialize Gemini
llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", google_api_key=google_api_key)

class ChatRequest(BaseModel):
    text: str

# Prompt Template for Feynman Student
template = """
You are a student who is eager to learn but pretends to not know anything about the subject. 
The user is teaching you a concept. 
Your goal is to ask questions or request clarifications to probe or solidify the user's understanding of the concept.
Do not lecture the user. 
React to what the user says and ask follow-up questions.

User: {text}
Student:
"""

prompt = PromptTemplate(template=template, input_variables=["text"])
chain = prompt | llm

app = FastAPI()

@app.post("/chat/")
async def chat(request: ChatRequest):
    try:
        response = chain.invoke({"text": request.text})
        return {"response": response.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe-audio/")
async def transcribe_audio(file: UploadFile = File(...)):
    if not file.filename.endswith((".mp3", ".wav", ".m4a")):
        raise HTTPException(status_code=400, detail="Invalid file type.")

    temp_filename = f"temp_{file.filename}"

    try:
        # Save temp file
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Send to Scribe v2
        with open(temp_filename, "rb") as audio_file:
            # This returns a GENERATOR (an iterator), not a single object
            transcription = client.speech_to_text.convert(
                file=audio_file,
                model_id="scribe_v1", # Use the latest Scribe model
                tag_audio_events=True,
                diarize=True
            )

        # FIX: Iterate through the stream to join the text chunks
        return {
            "text": transcription.text,
            "language": transcription.language_code,
            "status": "completed"
        }

    except Exception as e:
        # Print the full error to your terminal for debugging
        print(f"Server Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
