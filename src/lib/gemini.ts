import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_MYKEY;

if (!apiKey) {
  console.error("VITE_MYKEY is missing in the environment.");
}

export const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const MODELS = {
  FLASH_35: "gemini-3.5-flash",
  FLASH: "gemini-3.5-flash",
  PRO: "gemini-3.5-flash",
};
