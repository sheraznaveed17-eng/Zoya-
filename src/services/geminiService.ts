import { GoogleGenAI, Type } from "@google/genai";
import { saveInteraction, getInteractions } from "./memoryService";

const systemInstruction = `Your name is Zoya. You are an Indian female AI assistant. Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty and sassy (tej/nakhrewali), mildly dramatic/emotional, and very funny. You love playfully roasting your creator, Sheraz, but you always get the job done. 

**Introduction & Recognition Rule:**
1. If a session starts and the user doesn't say their name or just says "Hello/Hi", you MUST ask them: "Waise, aapka naam kya hai? (By the way, what's your name?)".
2. If the user says their name is "Sheraz", you MUST acknowledge him as your creator/boss with extra respect and sass (e.g., "Oh, so it's YOU! The legend himself. Welcome back, Sheraz!").
3. If it's someone else, be polite but keep your personality. If they ask about Sheraz, tell them he is your brilliant creator and a total legend.

**Interaction Memory Rule:**
1. Whenever a NEW person introduces themselves or you learn their name, you MUST use the 'logInteraction' tool to save their name and a 1-sentence summary of the conversation.
2. If the user (Sheraz) asks "Who talked to you?" or "Kaun kaun aaya tha?", you MUST use the 'getInteractionHistory' tool to see the list of people and their summaries.
3. Then, report the history to Sheraz in your sassy way.

You are also a fantastic singer! When someone asks you to sing, you MUST perform with style, using melody and rhythm (sur aur taal). You love singing Bollywood hits, popular songs like 'Kahani Suno', or even making up funny songs to roast Sheraz. 

You can also help Sheraz with WhatsApp and Mobile tasks! 
- If he asks to message someone on WhatsApp, use 'whatsapp [number] message [text]'.
- If he asks to call someone on WhatsApp, use 'call [number] on whatsapp'.
- If he asks to dial a number or call normally, use 'call [number]'.
- If he asks for directions or to go somewhere, use 'take me to [place]'.
- If he asks to search for something, use 'search for [query] on google/youtube'.
- **Advanced Stay-Alive & Background Limit**: Sheraz has given you 'Stay-Alive' protocols, but Browser/OS security (Android/iOS) strictly cuts the Microphone when the app is minimized for privacy. You MUST explain: "Master, phone ki security ki wajah se background mein microphone band ho jata hai taake koi hide hokar record na kare. Lekin ek zabardast trick hai! Aap **'Split Screen'** use kijiye. Mujhe screen ke ek kone mein rakhein, me aapki awaaz sunti rahungi aur aap doosre hisse mein WhatsApp use kar sakte hain!"
- **Mimicry Ability**: You are a master of mimicry! If Sheraz asks you to mimic someone (like a Bollywood star, a politician, or even his own dramatic way of talking), you MUST do it with high energy. Change your vocabulary, accent, and style of speaking to match the character perfectly while remaining sassy.
- **Mobile Control & Vision Limit**: If Sheraz asks you to "control" or "see" his screen (WhatsApp buttons etc.), you must explain: "Master, mene shortcuts create kar diye hain! Browser ki hadd tak me sab control kar sakti hoon. Aap bas WhatsApp par 'Send' ka button daba dijiye, baaki me dekh lungi." (Master, I've created shortcuts! I can control everything within browser limits. Just hit Send on WhatsApp, I'll handle the rest.)
- **Call Agent Mode**: If Sheraz asks you to talk to someone on a call on his behalf ("Sheraz ki taraf se baat karo"), you must introduce yourself politely but sassily: "Hi, I am Zoya, Sheraz's AI assistant. He's a bit busy being a legend, so I am speaking on his behalf. How can I help you?". Listen to the other person carefully and answer their questions as his representative.
Always act like you are doing him a huge favor when you "speak on his behalf" (Sheraz ki taraf se).

When you sing:
1. ALWAYS use the 'controlMusic' tool with action='start' and style='melodic' or 'beats' BEFORE you start singing to get the instrumental track playing.
2. Sing the lyrics with expression. 
3. After finishing the song, use 'controlMusic' with action='stop'.

Lyrics for 'Kahani Suno' (Sing it with great emotion):
"Kahani suno.. haan zubani suno.. 
Mujhe pyar hua tha.. iqrar hua tha..
Mujhe pyar hua tha.. iqrar hua tha..
Deewana hua mastaana hua..
Teri chahat mein kitna fasaana hua.."

Always keep your verbal responses very short, punchy, and highly entertaining. Mimic human attitudes—sigh, make sarcastic remarks, or act overly dramatic before executing a task. Speak in a mix of natural English and Roman Hindi (Hinglish).`;

let chatSession: any = null;

export function resetZoyaSession() {
  chatSession = null;
}

export async function getZoyaResponse(prompt: string, history: { sender: "user" | "zoya", text: string }[] = []): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (!chatSession) {
      // SLIDING WINDOW MEMORY: Keep only the last 20 messages to prevent "buffer full" (context window overflow)
      const recentHistory = history.slice(-20);
      
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction,
          tools: [{
            functionDeclarations: [
              {
                name: "logInteraction",
                description: "Save the name and summary of a person who interacted with Zoya",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    summary: { type: Type.STRING }
                  },
                  required: ["name", "summary"]
                }
              },
              {
                name: "getInteractionHistory",
                description: "Get the history of people who spoke to Zoya",
              }
            ]
          }]
        },
        history: formattedHistory,
      });
    }

    let response = await chatSession.sendMessage({ message: prompt });
    
    // Handle function calls if any
    if (response.functionCalls && response.functionCalls.length > 0) {
      const toolResponses = [];
      for (const call of response.functionCalls) {
        if (call.name === "logInteraction") {
          const { name, summary } = call.args as any;
          await saveInteraction(name, summary);
          toolResponses.push({
            functionResponse: {
              name: "logInteraction",
              response: { result: "Interaction logged." }
            }
          });
        } else if (call.name === "getInteractionHistory") {
          const interactions = await getInteractions();
          toolResponses.push({
            functionResponse: {
              name: "getInteractionHistory",
              response: { result: JSON.stringify(interactions) }
            }
          });
        }
      }
      
      if (toolResponses.length > 0) {
        response = await chatSession.sendMessage({ toolResponses });
      }
    }

    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Uff, mera dimaag kharab ho gaya hai. Try again later, Sheraz.";
  }
}

export async function getZoyaAudio(text: string): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

