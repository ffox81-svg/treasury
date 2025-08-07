import { GoogleGenAI } from "@google/genai";
import type { Audience, GeminiMessage } from '../types';

// The API key is expected to be set in the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface PromptGenerationParams {
  audience: Audience;
  gameType: string;
  gameDescription: string;
  additionalFeatures: string;
  userExperience?: string;
  technicalRequirements?: string;
}

export const generateGamePrompt = async (params: PromptGenerationParams): Promise<string> => {
  const {
    audience,
    gameType,
    gameDescription,
    additionalFeatures,
    userExperience,
    technicalRequirements
  } = params;

  const targetAudienceText = audience === 'children'
    ? "ילדים. השתמש בשפה פשוטה, מעוררת השראה ויצירתית. התמקד בכיף ובהדרגתיות."
    : "מבוגרים ללא רקע טכני. השתמש בשפה ברורה, מובנית ומפורטת. הדגש את חווית המשתמש והמטרות.";

  const promptForGemini = `
    אתה מומחה לעיצוב משחקים ועוזר למשתמשים ליצור פרומפטים (הנחיות) עבור בינה מלאכותית שבונה משחקי אינטרנט פשוטים.
    בהתבסס על הפרטים הבאים, צור פרומפט ברור, מעורר השראה ומובנה שהמשתמש יוכל להעתיק ולהדביק.
    שמור על שפת הפרומפט בעברית.

    פרטי הבקשה של המשתמש:
    - קהל יעד: ${targetAudienceText}
    - סוג המשחק: ${gameType}
    - תיאור המשחק: ${gameDescription}
    - תכונות ורכיבים מרכזיים (כל אחד בשורה חדשה):
    ${additionalFeatures}
    ${audience === 'adults' ? `- חווית משתמש רצויה: ${userExperience}` : ''}
    ${audience === 'adults' ? `- דרישות טכניות (כל אחת בשורה חדשה):\n${technicalRequirements}` : ''}

    הפרומפט שאתה יוצר צריך להיות בנוי לפי התבנית המתאימה לקהל היעד, כפי שלמדת מהדוגמאות.
    התחל ישירות עם הפרומפט עצמו, ללא הקדמות נוספות.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptForGemini,
      config: {
        temperature: 0.7,
      }
    });
    return response.text ?? '';
  } catch (error) {
    console.error("Error generating prompt with Gemini:", error);
    // Re-throw a user-friendly error to be handled by the component
    throw new Error("Error: Could not generate prompt. Please check your API key and network connection, or try again later.");
  }
};

export const generateGameCode = async (prompt: string): Promise<string> => {
  // Combine system instruction and user prompt into a single, detailed prompt.
  // This can sometimes help avoid vague backend errors by making the request more explicit.
  const fullPrompt = \`You are an expert web game developer specializing in creating single-file, vanilla JavaScript games.
Your task is to take the following game idea and turn it into a complete, playable HTML file.

**Game Idea (in Hebrew):**
---
${prompt}
---

**Critical requirements for your output:**
1.  **Single File:** All HTML, CSS, and JavaScript must be contained within a single .html file. Do not use any external assets or libraries (e.g., jQuery, React).
2.  **Vanilla Code:** Use only standard HTML5, CSS3, and modern ES6+ JavaScript.
3.  **Complete & Runnable:** The code must be a full HTML document that is runnable immediately when opened in a browser.
4.  **Simplicity First:** Implement the simplest possible version of the game that is fun and fulfills the core request. Avoid adding overly complex features.
5.  **Basic Styling:** Include clean, basic CSS to make the game visually appealing and user-friendly.
6.  **Hebrew UI:** All text visible to the player in the game's interface (buttons, instructions, scores, etc.) must be in Hebrew (עברית).
7.  **Code Only:** Your entire response MUST be only the raw HTML code. Start your response with \\\`<!DOCTYPE html>\\\` and end it with \\\`</html>\\\`. Do not include any extra text, explanations, or markdown formatting like \\\`\\\`\\\`html.
8.  **No Audio:** Do not add any audio or sound effects. The game must be completely silent. Any use of the Web Audio API is forbidden.\`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
      config: {
        // systemInstruction is now part of the main prompt.
        temperature: 0.3, // Lowered temperature for more deterministic and stable code generation.
      }
    });
    // Clean up potential markdown formatting from the response
    let code = response.text ?? '';
    if (code.startsWith('\\\`\\\`\\\`html')) {
      code = code.substring(7);
    }
    if (code.endsWith('\\\`\\\`\\\`')) {
      code = code.slice(0, -3);
    }
    return code.trim();
  } catch (error) {
    console.error("Error generating game code with Gemini:", error);
    throw new Error("Error: Could not generate game code. The AI might be busy or the request is too complex. Please try again.");
  }
};

export const sendChat = async (history: GeminiMessage[]): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: history,
    });

    let text = response.text ?? '';
    if (text.startsWith('\\\`\\\`\\\`html')) {
      text = text.substring(7);
      if (text.endsWith('\\\`\\\`\\\`')) {
        text = text.slice(0, -3);
      }
    }
    return text.trim();
  } catch (error) {
    console.error("Error sending chat message to Gemini:", error);
    throw new Error("שגיאה: לא ניתן היה לקבל תגובה מהצ'אט. אנא נסה שוב.");
  }
};
