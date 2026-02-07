from google import genai
import os
from dotenv import load_dotenv

# Load API Key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

# CONFIGURATION
# Replace this with your actual API key from Google AI Studio

def generate_text():
    try:
        # 1. Initialize the client
        client = genai.Client(api_key=api_key)

        # 2. Define your prompt
        prompt = "Explain quantum computing in one sentence."

        # 3. Send the request to the model
        print("Sending request...")
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )

        # 4. Print the result
        print("\n--- Response ---")
        print(response.text)

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    generate_text()
