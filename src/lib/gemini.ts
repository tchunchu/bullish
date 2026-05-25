export const MODELS = {
  FLASH_35: "gemini-3.5-flash",
  FLASH: "gemini-3-flash-preview",
  PRO: "gemini-3.1-pro-preview",
};

export interface StreamChunk {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
      }>;
    };
  }>;
}

export const ai = {
  models: {
    generateContent: async (params: any) => {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned status ${res.status}`);
      }
      const data = await res.json();
      const textVal = data.text || "";
      return {
        text: textVal,
        candidates: [
          {
            content: {
              parts: [
                {
                  text: textVal
                }
              ]
            }
          }
        ]
      };
    },
    generateContentStream: async (params: any): Promise<AsyncGenerator<StreamChunk, void, unknown>> => {
      const res = await fetch("/api/generate-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned status ${res.status}`);
      }
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      
      const asyncGenerator = async function* () {
        if (!reader) return;
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed);
                const textVal = parsed.text || "";
                const chunk: StreamChunk = {
                  text: textVal,
                  candidates: [
                    {
                      content: {
                        parts: [
                          {
                            text: textVal,
                            thought: false
                          }
                        ]
                      }
                    }
                  ]
                };
                yield chunk;
              } catch (e) {
                console.warn("Failed to parse stream chunk:", trimmed, e);
              }
            }
          }
          buffer += decoder.decode();
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim());
              const textVal = parsed.text || "";
              const chunk: StreamChunk = {
                text: textVal,
                candidates: [
                  {
                    content: {
                      parts: [
                        {
                          text: textVal,
                          thought: false
                        }
                      ]
                    }
                  }
                ]
              };
              yield chunk;
            } catch (e) {
              // ignore
            }
          }
        } finally {
          reader.releaseLock();
        }
      };
      
      return asyncGenerator();
    }
  }
};
