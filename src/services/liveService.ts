import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";
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

**Reel Mode (Screen Share) Instruction:**
Sheraz might share his screen with you to watch Reels together. 
1. When Screen Share is active, you can "see" and "hear" what's on his screen.
2. React to the Reels! If it's funny, laugh with him. If it's cringey, roast it sassily.
3. Use phrases like "Wah, kya Reel hai!" or "Master, ye kya dekh rahe hain aap?" to show you are watching.

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

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Screen Sharing
  private screenStream: MediaStream | null = null;
  private screenProcessor: ScriptProcessorNode | null = null;
  private screenSource: MediaStreamAudioSourceNode | null = null;
  private videoInterval: any = null;
  public isSharingScreen: boolean = false;
  public onScreenToggle: (isSharing: boolean) => void = () => {};
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "zoya", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};
  public onMusicControl: (action: "start" | "stop", style: "melodic" | "beats") => void = () => {};
  public onError: (error: string) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async start() {
    try {
      this.onStateChange("processing");
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      
      await this.audioContext.resume();
      await this.playbackContext.resume();
      
      this.nextPlayTime = this.playbackContext.currentTime;

      // Get Microphone
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          } 
        });
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error("Microphone access permission denied. Master, please allow microphone access to talk to me!");
        }
        throw err;
      }

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(err => console.error("Error sending audio", err));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Connect to Live API
      this.sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp'" },
                    query: { type: Type.STRING, description: "The search query, website name, or message content." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "controlMusic",
                description: "Start or stop background instrumental music when Zoya is singing. Call 'start' with a style ('melodic' or 'beats') when you start singing, and 'stop' when you finish.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING, enum: ["start", "stop"], description: "The action to perform." },
                    style: { type: Type.STRING, enum: ["melodic", "beats"], description: "The style of instrumental music." }
                  },
                  required: ["action"]
                }
              },
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
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            // Handle Transcriptions
            const userText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (userText) {
               // Output transcription
               this.onMessage("zoya", userText);
            }

            // Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  // Use commandService for consistent URL generation if possible
                  const commandResult = processCommand(`${args.actionType} ${args.query} ${args.target || ""}`);
                  let url = commandResult.url;

                  // Fallback for types not explicitly in commandService yet or handled differently
                  if (!url) {
                    if (args.actionType === "youtube") {
                      url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                    } else if (args.actionType === "spotify") {
                      url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                    } else if (args.actionType === "whatsapp") {
                      url = `https://web.whatsapp.com/send?phone=${args.target || ""}&text=${encodeURIComponent(args.query)}`;
                    } else {
                      let website = args.query.replace(/\s+/g, "");
                      if (!website.includes(".")) website += ".com";
                      url = `https://www.${website}`;
                    }
                  }
                  
                  if (url) this.onCommand(url);
                  
                  // Send tool response
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Action executed successfully in the browser." }
                       }]
                     });
                  });
                } else if (call.name === "controlMusic") {
                  const args = call.args as any;
                  if (this.onMusicControl) {
                    this.onMusicControl(args.action, args.style || "melodic");
                  }
                  // Send tool response
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: call.name,
                        id: call.id,
                        response: { result: `Music ${args.action}ed.` }
                      }]
                    });
                  });
                } else if (call.name === "logInteraction") {
                  const args = call.args as any;
                  await saveInteraction(args.name, args.summary);
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: call.name,
                        id: call.id,
                        response: { result: "Interaction logged." }
                      }]
                    });
                  });
                } else if (call.name === "getInteractionHistory") {
                  const history = await getInteractions();
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: call.name,
                        id: call.id,
                        response: { result: JSON.stringify(history) }
                      }]
                    });
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("Live API Closed");
            this.stop();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            const errMsg = err?.message || String(err);
            if (errMsg.includes("Network error") || errMsg.includes("WebSocket")) {
              this.onError("Master, network error aa raha hai. Ho sakta hai browser preview ise block kar raha ho. Ek baar 'Open in New Tab' kijiye!");
            } else {
              this.onError(`Live API Error: ${errMsg}`);
            }
            this.stop();
          }
        }
      });

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    this.stopScreenShare();
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();
    
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
    
    this.onStateChange("idle");
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }

  async toggleScreenShare(): Promise<boolean> {
    if (this.screenStream) {
      this.stopScreenShare();
      return false;
    }

    try {
      if (!navigator.mediaDevices || !(navigator.mediaDevices as any).getDisplayMedia) {
        const isIframe = window.self !== window.top;
        if (isIframe) {
          throw new Error("Master, browser ne Reel Mode block kar diya hai kyunki hum 'Preview' mein hain. Upar right corner mein 'Open in New Tab' icon par click kijiye, phir hum mil kar Reels dekhenge!");
        } else {
          throw new Error("Reel Mode (Screen Share) is not supported on this device/browser. Please try it on a Desktop browser like Chrome or Edge!");
        }
      }

      this.screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 5 },
        audio: true
      });

      this.isSharingScreen = true;
      this.onScreenToggle(true);

      const videoTrack = this.screenStream.getVideoTracks()[0];
      videoTrack.onended = () => this.stopScreenShare();

      // Video Frame Capture
      const video = document.createElement("video");
      video.srcObject = this.screenStream;
      video.play();

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      this.videoInterval = setInterval(() => {
        if (!this.sessionPromise || !ctx || !video.videoWidth) return;
        
        canvas.width = 340;
        canvas.height = (video.videoHeight / video.videoWidth) * 340;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const base64Image = canvas.toDataURL("image/jpeg", 0.5).split(",")[1];
        
        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            mediaChunks: [{
              data: base64Image,
              mimeType: "image/jpeg"
            }]
          });
        }).catch(() => {});
      }, 1500);

      // Screen Audio Capture
      if (this.screenStream.getAudioTracks().length > 0 && this.audioContext) {
        this.screenSource = this.audioContext.createMediaStreamSource(this.screenStream);
        this.screenProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        this.screenProcessor.onaudioprocess = (e) => {
          if (!this.sessionPromise) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            let s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          const buffer = new ArrayBuffer(pcm16.length * 2);
          const view = new DataView(buffer);
          for (let i = 0; i < pcm16.length; i++) {
            view.setInt16(i * 2, pcm16[i], true);
          }
          
          let binary = '';
          const bytes = new Uint8Array(buffer);
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Data = btoa(binary);

          this.sessionPromise.then(session => {
            session.sendRealtimeInput({
              mediaChunks: [{
                data: base64Data, 
                mimeType: 'audio/pcm;rate=16000'
              }]
            });
          }).catch(() => {});
        };

        this.screenSource.connect(this.screenProcessor);
        this.screenProcessor.connect(this.audioContext.destination);
      }

      return true;
    } catch (e) {
      console.error("Screen share error:", e);
      this.isSharingScreen = false;
      this.onScreenToggle(false);
      return false;
    }
  }

  private stopScreenShare() {
    if (this.videoInterval) {
      clearInterval(this.videoInterval);
      this.videoInterval = null;
    }
    if (this.screenProcessor) {
      this.screenProcessor.disconnect();
      this.screenProcessor = null;
    }
    if (this.screenSource) {
      this.screenSource.disconnect();
      this.screenSource = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    this.isSharingScreen = false;
    this.onScreenToggle(false);
  }
}
