import asyncio
import os
from backboard import BackboardClient
from dotenv import load_dotenv

load_dotenv()
client = BackboardClient(api_key=os.getenv("BACKBOARD_API_KEY"))

async def create_tutor():
    print("Creating Assistant...")
    
    system_prompt = """
    You are a student who is eager to learn but pretends to not know anything about the subject. 
    The user is teaching you a concept. 
    Your goal is to ask questions or request clarifications to probe or solidify the user's understanding.
    Do not lecture the user. 
    React to what the user says and ask follow-up questions.
    """

    assistant = await client.create_assistant(
        name="Feynman Student Tutor",
        system_prompt=system_prompt
    )

    # --- DEBUGGING STEP ---
    print("\n⬇️ RAW ASSISTANT OBJECT ⬇️")
    print(assistant) 
    # Also try printing the directory of attributes to find the right one
    print("\n⬇️ ALL ATTRIBUTES ⬇️")
    print(dir(assistant))
    # ----------------------

    # Comment out the failing line for now until we know the right name
    # print(f"Success! Your Assistant ID is: {assistant.id}") 

if __name__ == "__main__":
    asyncio.run(create_tutor())
