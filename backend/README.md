FeynmanAI is an interactive learning tool built around the Feynman technique. The core idea is simple: you learn best when you explain something out loud to someone who does not already know it.
Instead of explaining your topic to a person, you explain it to an AI that intentionally starts with little to no knowledge. As you teach, the AI listens, asks clarifying questions, and points out gaps or unclear explanations. The goal is to help you discover what you truly understand and what you still need to work on.

The experience is fully voice-based. You talk naturally, and the AI talks back.

How it works:

    1. You choose a topic you want to learn or review.
    2. You explain the topic out loud as if teaching a beginner.
    3. Your speech is converted to text using ElevenLabs speech-to-text.
    4. The AI processes what you said and responds as a curious learner:
        • Asking follow-up questions
        • Pointing out confusing explanations
        • Requesting simpler explanations or examples
    5. The AI’s response is converted back into speech using ElevenLabs text-to-speech.
    6. You continue the conversation until you can explain the topic clearly and confidently.
The AI is designed to not act like an expert. It behaves like a smart student who wants to understand, not a teacher giving answers.

Why the Feynman technique?
The Feynman technique is based on four simple steps:

    1. Try to explain a concept in plain language
    2. Identify gaps or unclear parts in your explanation
    3. Go back and refine your understanding
    4. Simplify again
This project automates that process by giving you a patient, curious listener who never gets tired of asking questions.

Key features:

    • Voice-first learning experience
    • Beginner-level AI that asks real clarification questions
    • Automatic speech-to-text and text-to-speech
    • Encourages simple explanations and concrete examples

Tech stack:

    • Gemini API for conversational reasoning
    • ElevenLabs for speech-to-text and text-to-speech
    • Python


Example use cases:

    • Studying for exams by explaining concepts out loud
    • Preparing for interviews by teaching topics step-by-step
    • Learning new subjects without passive reading
    • Checking if you actually understand something

Project status:
This project is a work in progress. Core conversation flow and voice integration are functional, with ongoing improvements to question quality and topic handling.


Future ideas
    • Session summaries highlighting weak spots
    • Difficulty adjustment based on how well you explain
    • Saving and replaying explanations
