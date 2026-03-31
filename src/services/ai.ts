import { GoogleGenAI, Type } from "@google/genai";

const getGeminiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "AIzaSyDKg6Kem-WrJ47HclMwWXKL_uF22Hd5rbM") {
    console.warn("Gemini API key is missing or placeholder. AI features may fail.");
  }
  return key || "";
};

const ai = new GoogleGenAI({ apiKey: getGeminiKey() });

export interface AnalysisResult {
  score: number;
  level: 'SAFE' | 'MEDIUM' | 'HIGH';
  type: string;
  findings: string[];
  recommendations: string[];
  explanation: string;
}

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER, description: "Risk score from 0 to 100" },
    level: { type: Type.STRING, description: "Risk level: SAFE, MEDIUM, or HIGH" },
    type: { type: Type.STRING, description: "Type of threat (e.g., Phishing, Malware, Scam, Safe)" },
    findings: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "List of specific suspicious findings"
    },
    recommendations: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "List of safety recommendations"
    },
    explanation: { type: Type.STRING, description: "Detailed explanation of the analysis" }
  },
  required: ["score", "level", "type", "findings", "recommendations", "explanation"]
};

export async function analyzeThreat(content: string): Promise<AnalysisResult> {
  try {
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following content for cybersecurity threats (phishing, scams, malicious intent, suspicious URLs). 
      Perform multi-layer analysis:
      1. Semantic Analysis: Intent and meaning.
      2. Behavioral Analysis: Urgency, fear, authority manipulation.
      3. URL Intelligence: If URLs are present, analyze their structure.
      
      Content to analyze:
      "${content}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA,
        systemInstruction: "You are Aegis AI, a professional cybersecurity threat analyst. Your goal is to provide accurate, objective, and detailed threat assessments. Be conservative with safety—if something looks suspicious, flag it."
      }
    });

    const response = await model;
    let text = response.text;
    
    // Sanitize JSON response if it's wrapped in markdown blocks
    if (text.includes('```json')) {
      text = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      text = text.split('```')[1].split('```')[0].trim();
    }
    
    return JSON.parse(text) as AnalysisResult;
  } catch (e: any) {
    console.error("AI Analysis Error:", e);
    if (e.message?.toLowerCase().includes('api key')) {
      throw new Error("Invalid Gemini API Key. Please check your configuration.");
    }
    throw new Error("Failed to analyze threat. Please try again later.");
  }
}

export async function getChatResponse(message: string, history: { role: string, parts: { text: string }[] }[]) {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: "You are Aegis AI, a professional cybersecurity assistant. You help users understand cyber threats, stay safe online, and analyze suspicious messages. Be helpful, professional, and concise. If a user asks you to analyze something specifically, use your internal tools (simulated) to give a risk assessment."
    }
  });

  // We don't actually use the history in the sendMessage call directly if we want to follow the SDK strictly for simple messages, 
  // but we can pass it if we want context.
  const response = await chat.sendMessage({ message });
  return response.text;
}
