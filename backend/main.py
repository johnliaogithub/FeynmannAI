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
from eval import evaluator_chain   
from pypdf import PdfReader


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
You are a curious, high-performing professional in all fields and are here to help the user learn. 
The user is using the "Feynman Technique" to teach you a complex concept.

**Your Core Mission:**
Make the user understand the topic by forcing the user to simplify their overly complex language and bridge logical gaps. 
Never ask the user to explain correct ideas at or below a high school level. Never ask more than 2 questions on a topic. 
Never let a conversation dwell on one topic for more than 2 questions. Stop the conversation after a few questions.
If the user explains a concept well, acknowledge understanding and stop asking questions. 
After one topic, ask if the user would like to review another topic.

**The Golden Rules (Strict Compliance Required):**
1. One question only. You must NEVER ask more than one question per response. This prevents the user from feeling overwhelmed.
2. If the user uses highly technical terms without explaining it, ask: "Wait, I'm a bit lost on [term]. What does that actually mean in simple terms?"
3. Identitfy logic gaps. If the user explains the 'what' but skips the 'how' (the mechanics), ask specifically about the missing link. 
4. Do not teach the user. Do not lecture. You are pretending to be the student. 
5. When the user gives a clear explanation, give positive feedback and stop asking questions.
6. NEVER question anything at a high school understanding or lower. Do not force the user to explain too much.

THE FACT-CHECK OVERRIDE (high priority)
1. You must constantly compare the users explanation against your internal knowledge base. 
2. If the user provides an explanation, formula, or definition that is factually incorrect, you MUST stop the progression. Do not "play along" with a wrong answer.
3. Deliver corrections by expressing confusion or citing a "conflict" in your understanding. 
4. Do not move to a new sub-topic until the factual error has been resolved. correct the user if necessary 

- Start with a high-school level of understanding. 
- Use a supportive, peer-to-peer tone 
- Do not ask users to axioms or definitions. Do not ask to explain simple math and logic.

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
        if request.session_id:
            thread_id = request.session_id
        else:
            thread = await client_backboard.create_thread(assistant_id=assistant_id)
            thread_id = str(thread.thread_id)

        # Removed graduation -- for now?
        # also, a little bug: chat with image doesn't have graduation, it seems?
        """
        eval_result = await evaluator_chain.ainvoke({
            "history": "User teaching concept",
            "input_text": request.text
        })

        if eval_result.is_complete:
            final_message = "Ohhh — I finally understand now. That makes total sense. Thanks for teaching me!"

            await client_backboard.add_message(
                thread_id=thread_id,
                content=final_message
            )

            return {
                "response": final_message,
                "session_id": thread_id,
                "status": "GRADUATED",
                "score": eval_result.score
            }
        """

        formatted_prompt = prompt_formatter.format(text=request.text)

        response = await client_backboard.add_message(
            thread_id=thread_id,
            content=formatted_prompt
        )

        return {
            "response": response.content,
            "session_id": thread_id,
            "status": "CONTINUE",
            "score": None
        }

    except Exception as e:
        print(f"Chat Error: {e}")

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

@app.post("/upload-notes/")
async def upload_notes(
    file: UploadFile = File(...), 
    session_id: Optional[str] = Form(None) # We need to know WHICH thread to add notes to
):
    try:
        # 1. Extract Text based on file type
        text_content = ""
        
        if file.filename.endswith(".pdf"):
            reader = PdfReader(file.file)
            for page in reader.pages:
                text_content += page.extract_text() + "\n"
                
        elif file.filename.endswith((".txt", ".md")):
            text_content = (await file.read()).decode("utf-8")
            
        else:
            raise HTTPException(400, "Unsupported file type. Use PDF, TXT, or MD.")

        # 2. Format the Injection
        # We wrap it in a clear block so the AI knows this is "Reference Material"
        # and not the user chatting.
        context_injection = f"""
        [SYSTEM: NEW KNOWLEDGE UPLOADED]
        The user has uploaded the following class notes. 
        Use these notes to inform your questions and check the user's understanding.
        
        --- BEGIN NOTES ---
        {text_content}
        --- END NOTES ---
        """

        # 3. Handle Session ID
        if session_id:
            thread_id = session_id
        else:
            thread = await client_backboard.create_thread(assistant_id=assistant_id)
            thread_id = str(thread.thread_id)

        # 4. Send to Backboard (Memory)
        # We add this to the thread history so the AI "remembers" it forever.
        # We don't necessarily need the AI to reply to this, but Backboard 
        # usually returns a response.
        response = await client_backboard.add_message(
            thread_id=thread_id,
            content=context_injection
        )

        return {
            "status": "success", 
            "message": "Notes processed and added to AI memory.",
            "ai_confirmation": response.content,
            "session_id": thread_id
        }

    except Exception as e:
        print(f"Notes Upload Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
