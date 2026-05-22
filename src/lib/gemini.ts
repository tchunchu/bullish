import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_MYKEY;

if (!apiKey) {
  console.error("VITE_MYKEY is missing in the environment.");
}

export const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const MODELS = {
  FLASH: "gemini-3-flash-preview",
  PRO: "gemini-3.1-pro-preview",
};
