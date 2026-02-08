# [FeynmannAI](https://feynmann-ai.vercel.app/)

**Master complex topics by teaching them to an AI.**

FeynmannAI is an interactive learning platform based on the **Feynman Technique**: the idea that you learn best when you explain a concept simply. Instead of explaining to a person, you teach a curious AI student who asks follow-up questions to test your understanding.

## Project Structure

This repository is divided into two main parts:

- **[Backend](./backend/README.md)**: A Python/FastAPI server that handles the AI logic, speech processing (ElevenLabs), and memory management.
- **[Frontend](./frontend/README.md)**: A Next.js web application that provides the chat interface, voice recording, and dashboard.

## Quick Start

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- API Keys for:
  - Gemini (Google AI)
  - ElevenLabs (Voice)
  - Supabase (Auth & Database)

### 1. Backend Setup
Navigate to the `backend` directory and follow the [detailed instructions](./backend/README.md).
```bash
cd backend
python -m venv env
source env/bin/activate  # or .\env\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Frontend Setup
Navigate to the `frontend` directory and follow the [detailed instructions](./frontend/README.md).
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start learning!

## Tech Stack
- **AI Core**: Google Gemini Flash (Vision & Text)
- **Voice**: ElevenLabs (Scribe v2 & TTS)
- **Backend**: FastAPI (Python)
- **Frontend**: Next.js (React) + TailwindCSS
- **Database/Auth**: Supabase
- **Rendering**: ReactMarkdown + KaTeX (for math equations)
