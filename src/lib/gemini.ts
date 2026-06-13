export enum Type {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  NULL = "NULL",
}

async function generateContent(params: any): Promise<any> {
  const response = await fetch("/api/gemini-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini generate error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return {
    text: data.text,
    candidates: [
      {
        content: {
          parts: [
            { text: data.text, thought: false } as any
          ]
        }
      }
    ]
  };
}

async function* generateContentStream(params: any): AsyncGenerator<any, any, any> {
  const response = await fetch("/api/gemini-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini stream error: ${response.status} - ${errText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder("utf-8");

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const textChunk = decoder.decode(value, { stream: true });
      if (textChunk) {
        yield {
          text: textChunk,
          candidates: [
            {
              content: {
                parts: [
                  { text: textChunk, thought: false }
                ] as any[]
              }
            }
          ]
        };
      }
    }
  }
}

export class GoogleGenAI {
  config: any;
  constructor(config?: any) {
    this.config = config;
  }
  get models() {
    return {
      generateContent,
      generateContentStream,
    };
  }
}

export const ai = new GoogleGenAI();

export const MODELS = {
  FLASH_35: "gemini-3.5-flash",
  FLASH_25: "gemini-2.5-flash",
  FLASH_LITE: "gemini-3.1-flash-lite",
  PRO: "gemini-3.1-pro-preview",
};
