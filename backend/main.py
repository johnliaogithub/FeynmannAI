import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Form
import base64
import mimetypes
from langchain_core.messages import HumanMessage
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from elevenlabs.client import ElevenLabs
from backboard import BackboardClient
from dotenv import load_dotenv
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel
import uuid
from typing import Optional
from langchain_google_genai import ChatGoogleGenerativeAI


# 1. Load Keys
load_dotenv()
elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
backboard_api_key = os.getenv("BACKBOARD_API_KEY")
assistant_id = os.getenv("BACKBOARD_ASSISTANT_ID")
google_api_key = os.getenv("GEMINI_API_KEY")

# 2. Initialize Clients
client_eleven = ElevenLabs(api_key=elevenlabs_api_key)
client_backboard = BackboardClient(api_key=backboard_api_key)

# Initialize Gemini for Vision
vision_llm = ChatGoogleGenerativeAI(model="gemini-flash-latest", google_api_key=google_api_key)

class ChatRequest(BaseModel):
    text: str

class SpeakRequest(BaseModel):
    text: str

# Prompt Template for Feynman Student
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

@app.post("/chat-with-image/")
async def chat_with_image(
    text: str = Form(...),
    session_id: Optional[str] = Form(None),
    file: UploadFile = File(...)
):
    try:
        # Validate file
        if not file.content_type.startswith("image/"):
            raise HTTPException(400, "File must be an image")

        # Read and Encode Image
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(400, "Empty file received")
            # --- Save image for debugging ---
            try:
                debug_dir = os.path.join(os.getcwd(), "debug_images")
                os.makedirs(debug_dir, exist_ok=True)
                # Determine extension from filename or content type
                _, ext = os.path.splitext(file.filename or "")
                if not ext:
                    ext = mimetypes.guess_extension(file.content_type) or ".img"
                debug_filename = f"debug_{uuid.uuid4()}{ext}"
                debug_path = os.path.join(debug_dir, debug_filename)
                with open(debug_path, "wb") as dbg_f:
                    dbg_f.write(content)
                print(f"Saved debug image to: {debug_path}")
            except Exception as save_exc:
                print(f"Failed to save debug image: {save_exc}")
        
        # Determine media type
        media_type = file.content_type
        
        # Encode to Base64
        b64_image = base64.b64encode(content).decode("utf-8")
        image_url = f"data:{media_type};base64,{b64_image}"

        # 1. Vision-to-Text (Captioning/VQA) using Gemini
        # We ask Gemini to describe the image relevant to the user's text
        vqa_prompt = f"Please analyze this image. The user asks: '{text}'. Describe the image in detail relevant to the user's question so I can answer them."
        
        message = HumanMessage(
            content=[
                {"type": "text", "text": vqa_prompt},
                {"type": "image_url", "image_url": {"url": image_url}},
            ]
        )
        
        # Invoke Vision Model
        vision_response = await vision_llm.ainvoke([message])
        image_description = vision_response.content

        # Handle Session ID
        if session_id:
            thread_id = session_id
        else:
            thread = await client_backboard.create_thread(assistant_id=assistant_id)
            thread_id = str(thread.thread_id)

        # 2. Text-to-Backboard
        # Construct a combined prompt for the "Blind" Student Persona
        combined_text_prompt = f"""
[System Note: The user has uploaded an image. Here is the description of the image provided by a vision system:]
Image Description: {image_description}

[End of Image Description]

User's Original Message: {text}
"""
        # Format with the Student Persona Template
        # We might want to pass the combined prompt as the "text" to the formatter
        formatted_prompt = prompt_formatter.format(text=combined_text_prompt)

        # Send to Backboard (Text-Only)
        response = await client_backboard.add_message(
            thread_id=thread_id,
            content=formatted_prompt
        )

        return {
            "response": response.content,
            "session_id": thread_id
        }

    except Exception as e:
        print(f"Chat-Image Error: {e}")
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

@app.post("/speak/")
async def speak_text(request: SpeakRequest, background_tasks: BackgroundTasks ):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    output_filename = f"tts_{uuid.uuid4()}.mp3"
    try:
        # Call ElevenLabs TTS
        audio_stream = client_eleven.text_to_speech.convert(
            voice_id="vDchjyOZZytffNeZXfZK",  # or any voice you like
            model_id="eleven_monolingual_v1",
            text=request.text
        )
        # Save audio file
        with open(output_filename, "wb") as f:
            for chunk in audio_stream:
                f.write(chunk)
       
        # Schedule cleanup AFTER response is sent
        background_tasks.add_task(os.remove, output_filename)

        # Return audio file
        return FileResponse(
            output_filename,
            media_type="audio/mpeg",
            filename="response.mp3"
        )
    except Exception as e:
        print(f"Server Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
