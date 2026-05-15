import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, Music, Music2, Monitor, MonitorOff } from "lucide-react";
import { getZoyaResponse, getZoyaAudio, resetZoyaSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("zoya_chat_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("zoya_chat_history", JSON.stringify(messages));
  }, [messages]);

  const [isMuted, setIsMuted] = useState(false);
  const [bgMusic, setBgMusic] = useState<"none" | "melodic" | "beats">("none");
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (bgMusic === "none") {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
        bgMusicRef.current = null;
      }
    } else {
      if (bgMusicRef.current) bgMusicRef.current.pause();
      
      const audio = new Audio(
        bgMusic === "melodic" 
          ? "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
          : "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3"
      );
      audio.loop = true;
      audio.volume = 0.2;
      audio.play().catch(e => console.error("BG Music failed", e));
      bgMusicRef.current = audio;
    }
  }, [bgMusic]);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const wakeLockRef = useRef<any>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        // Optional: Check permission state first if supported
        if ((navigator as any).permissions) {
          try {
            const status = await (navigator as any).permissions.query({ name: 'screen-wake-lock' });
            if (status.state === 'denied') {
              console.warn('Wake Lock permission denied by policy');
              return;
            }
          } catch (e) {
            // Permission query might not be supported for screen-wake-lock
          }
        }

        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Wake Lock active');
      }
      
      // Silent Audio Hack for background persistence
      if (!silentAudioRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioContext = new AudioContextClass();
          const oscillator = audioContext.createOscillator();
          const dst = audioContext.createMediaStreamDestination();
          oscillator.connect(dst);
          oscillator.start();
          
          const audio = new Audio();
          audio.srcObject = dst.stream;
          audio.loop = true;
          audio.volume = 0.01; // Silent
          silentAudioRef.current = audio;
          silentAudioRef.current.play().catch(() => {
            console.warn("Silent audio play blocked (needs user interaction)");
          });
        }
      } else {
        silentAudioRef.current.play().catch(() => {});
      }
      
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        console.warn('Wake Lock blocked by Permissions Policy. This usually happens in the preview iframe. Open in a new tab for full background support.');
      } else {
        console.error(`Persistence error: ${err}`);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    if (silentAudioRef.current) {
      silentAudioRef.current.pause();
    }
  };

  useEffect(() => {
    if (isSessionActive) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    return () => releaseWakeLock();
  }, [isSessionActive]);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1500);
    } else {
      // 2. General Chit-Chat via Gemini
      responseText = await getZoyaResponse(finalTranscript, messagesRef.current);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetZoyaSession();
    } else {
      try {
        setIsSessionActive(true);
        resetZoyaSession();
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = (sender, text) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        session.onMusicControl = (action, style) => {
          if (action === "start") {
            setBgMusic(style);
          } else {
            setBgMusic("none");
          }
        };

        session.onScreenToggle = (isSharing) => {
          setIsSharingScreen(isSharing);
        };

        session.onError = (errorMessage) => {
          alert(errorMessage);
          setIsSessionActive(false);
          setAppState("idle");
        };

        await session.start();
      } catch (e: any) {
        console.error("Failed to start session", e);
        if (e.message?.includes("Microphone")) {
          alert(e.message);
        } else {
          setShowPermissionModal(true);
        }
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0 select-none touch-none">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-violet-900/30 blur-[140px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-pink-900/30 blur-[140px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header - Adjusted for Safe Areas */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 pt-12 pb-4 md:px-12 md:py-8">
        <div className="flex items-center gap-3">
          <motion.div 
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 4 }}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-500 to-pink-500 flex items-center justify-center font-bold text-lg shadow-lg shadow-pink-500/20"
          >
            Z
          </motion.div>
          <div className="flex flex-col">
            <h1 className="text-xl font-serif font-medium tracking-wide opacity-90 leading-tight">Zoya</h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">Mobile Core v2.0</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear the chat history?")) {
                  setMessages([]);
                  resetZoyaSession();
                }
              }}
              className="p-3 rounded-full bg-white/5 active:bg-white/10 transition-colors border border-white/10 shadow-lg"
              title="Clear Chat History"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}
          <button
            onClick={() => setBgMusic(prev => prev === "none" ? "melodic" : prev === "melodic" ? "beats" : "none")}
            className={`p-3 rounded-full transition-all border border-white/10 shadow-lg ${bgMusic !== "none" ? "bg-pink-500/20 text-pink-400 border-pink-500/30 ring-2 ring-pink-500/20" : "bg-white/5 active:bg-white/10"}`}
            title="Toggle Background Music (Singing Mode)"
          >
            {bgMusic === "none" ? <Music size={18} className="opacity-70" /> : <Music2 size={18} className="animate-pulse" />}
          </button>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-3 rounded-full bg-white/5 active:bg-white/10 transition-all border border-white/10 shadow-lg"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
          {isSessionActive && (
            <button
              onClick={async () => {
                const success = await liveSessionRef.current?.toggleScreenShare();
                if (success === false && !liveSessionRef.current?.isSharingScreen) {
                  const isIframe = window.self !== window.top;
                  if (isIframe) {
                    alert("Master, Screen Share preview mein block hai. Upar right corner mein 'Open in New Tab' icon par click kijiye, phir ye feature chal jayega!");
                  } else {
                    alert("Master, lagta hai aapka browser screen share support nahi kar raha. Laptop ya Desktop par Chrome use kijiye!");
                  }
                }
              }}
              className={`p-3 rounded-full transition-all border border-white/10 shadow-lg ${isSharingScreen ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 ring-2 ring-cyan-500/20" : "bg-white/5 active:bg-white/10"}`}
              title={isSharingScreen ? "Stop Shield" : "Start Reel Mode (Screen Share)"}
            >
              {isSharingScreen ? <MonitorOff size={18} /> : <Monitor size={18} className="opacity-70" />}
            </button>
          )}
        </div>
      </header>

      {/* Main Content - Visualizer & Chat */}
      <main className="absolute inset-0 flex flex-row items-center justify-between w-full h-full z-10 overflow-hidden pt-32 pb-40 px-4 md:px-12 pointer-events-none">
        
        {/* Left Column: Zoya Status */}
        <div className="flex w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6">
            <AnimatePresence mode="wait">
              {appState === "processing" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 text-cyan-300 text-sm italic font-serif"
                >
                  <Loader2 size={14} className="animate-spin" />
                  Replying...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center Visualizer (Fixed Full Screen Background) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer state={appState} />
        </div>

        {/* Right Column: User Status */}
        <div className="flex w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6 flex justify-end">
            <AnimatePresence mode="wait">
              {appState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 text-violet-300 text-sm italic"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  Listening...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </main>

      {/* Controls - Optimized for Hand Reach */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-12 md:pb-16 z-20 shrink-0 gap-6">
        <div className="flex flex-col items-center gap-6 w-full px-6">
          <AnimatePresence>
            {showTextInput && (
              <motion.form 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                onSubmit={handleTextSubmit}
                className="w-full max-w-lg flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl p-2 pl-5 backdrop-blur-xl shadow-2xl"
              >
                <input 
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Ask Zoya anything..."
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-base py-2"
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={!textInput.trim()}
                  className="p-3 rounded-xl bg-violet-500 active:scale-95 disabled:opacity-50 transition-all font-bold shadow-lg"
                >
                  <Send size={18} />
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-5">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleListening}
              className={`
                group relative flex items-center gap-4 px-10 py-5 rounded-full font-bold tracking-wider transition-all duration-300 shadow-2xl active:shadow-none
                ${
                  isSessionActive
                    ? "bg-red-500 text-white shadow-red-500/30"
                    : "bg-white text-black shadow-white/10 hover:shadow-white/20"
                }
              `}
            >
              <div className="absolute inset-0 rounded-full bg-inherit blur-md opacity-20 group-hover:opacity-40 transition-opacity" />
              {isSessionActive ? (
                <>
                  <MicOff size={22} />
                  <span>End Task</span>
                </>
              ) : (
                <>
                  <Mic size={22} className={appState === 'idle' ? 'animate-bounce' : ''} />
                  <span>Talk to Zoya</span>
                </>
              )}
            </motion.button>
            
            {!isSessionActive && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowTextInput(!showTextInput)}
                className={`p-5 rounded-full transition-all shadow-2xl border border-white/20 ${showTextInput ? 'bg-violet-500 text-white border-violet-400' : 'bg-white/10 text-white/70 active:bg-white/20'}`}
                title="Type instead"
              >
                <Keyboard size={24} />
              </motion.button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
