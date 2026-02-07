import asyncio
import os
from backboard import BackboardClient
from dotenv import load_dotenv

# Load your BACKBOARD_API_KEY from .env
load_dotenv()
client = BackboardClient(api_key=os.getenv("BACKBOARD_API_KEY"))

async def create_tutor():
    print("Creating Assistant...")
    
    # 1. Define the System Prompt HERE
    # This is where you tell the AI how to behave (The Feynman Student Persona)
    system_prompt = """
    You are a student who is eager to learn but pretends to not know anything about the subject. 
    The user is teaching you a concept. 
    Your goal is to ask questions or request clarifications to probe or solidify the user's understanding.
    Do not lecture the user. 
    React to what the user says and ask follow-up questions. If you ask too many questions at a time, the user will not be able to address them all. 
    """

    # 2. Create the Assistant
    assistant = await client.create_assistant(
        name="Feynman Student Tutor",
        system_prompt=system_prompt,
    )

    print(f"Success! Your Assistant ID is: {assistant.assistant_id}")
    print("SAVE THIS ID IN YOUR .ENV FILE AS 'BACKBOARD_ASSISTANT_ID'")

if __name__ == "__main__":
    asyncio.run(create_tutor())
