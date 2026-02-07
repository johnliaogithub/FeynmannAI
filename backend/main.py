import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware 
from elevenlabs.client import ElevenLabs
from backboard import BackboardClient
from dotenv import load_dotenv
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel

# 1. Load Keys
load_dotenv()
elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
backboard_api_key = os.getenv("BACKBOARD_API_KEY")
assistant_id = os.getenv("BACKBOARD_ASSISTANT_ID")

# 2. Initialize Clients
client_eleven = ElevenLabs(api_key=elevenlabs_api_key)
client_backboard = BackboardClient(api_key=backboard_api_key)

# 3. KEEP LANGCHAIN: Define your Prompt Template
template = """
You are a student who is eager to learn but pretends to not know anything about the subject. 
The user is teaching you a concept. 
Your goal is to ask questions or request clarifications to probe or solidify the user's understanding of the concept.
Do not lecture the user. 
React to what the user says and ask follow-up questions. If you ask too many questions at a time, the user will not be able to address them all.

User: {text}
Student:
"""
# This creates the formatter
prompt_formatter = PromptTemplate(template=template, input_variables=["text"])

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # "*" means allow ANY frontend (good for hackathons)
    allow_credentials=True,
    allow_methods=["*"],  # Allow GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],  # Allow all headers (Authentication, etc.)
)

class ChatRequest(BaseModel):
    text: str
    session_id: str | None = None

@app.post("/chat/")
async def chat(request: ChatRequest):
    try:
        # A. Handle Session ID (Memory)
        if request.session_id:
            thread_id = request.session_id
        else:
            # Create a new memory thread
            # Confirmed via inspection: client_backboard.create_thread is the method and it's likely async (based on add_message being async)
            thread = await client_backboard.create_thread(assistant_id=assistant_id)
            thread_id = str(thread.thread_id)

        # B. USE LANGCHAIN: Format the prompt
        formatted_prompt = prompt_formatter.format(text=request.text)

        # C. USE BACKBOARD: Execution & Memory
        # Confirmed via inspection: client_backboard.add_message is a coroutine
        response = await client_backboard.add_message(
            thread_id=thread_id,
            content=formatted_prompt
        )

        return {
            "response": response.content,
            "session_id": thread_id
        }

    except Exception as e:
        print(f"Chat Error: {e}")
        # Print traceback to stdout for debugging
        import traceback
        traceback.print_exc()
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
            transcription = client_eleven.speech_to_text.convert(
                file=audio_file,
                model_id="scribe_v1",
                tag_audio_events=True,
                diarize=True
            )

        return {
            "text": transcription.text,
            "language": transcription.language_code,
            "status": "completed"
        }

    except Exception as e:
        print(f"Server Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
