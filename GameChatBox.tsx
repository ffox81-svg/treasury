import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { sendChat } from '../services/geminiService';
import type { GeminiMessage } from '../types';

interface ChatBoxProps {
  gameCode: string;
  onUpdatedCode: (newCode: string) => Promise<void>;
  gameTitle: string;
}

const GameChatBox: React.FC<ChatBoxProps> = ({ gameCode, onUpdatedCode, gameTitle }) => {
  const [messages, setMessages] = useState<GeminiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([
      {
        role: 'user',
        parts: [{ text: `Here is the code for the game. I want to modify it. Your responses must be only the full, runnable HTML code.\n\n\`\`\`html\n${gameCode}\n\`\`\`` }]
      },
      {
        role: 'model',
        parts: [{ text: 'קיבלתי את הקוד. אני מוכן לקבל את השינויים שתרצה לבצע.' }]
      }
    ]);
  }, [gameCode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    setError(null);
    const userMessage: GeminiMessage = { role: 'user', parts: [{ text: input }] };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsSending(true);

    try {
      const responseText = await sendChat(newMessages);

      if (responseText.trim().toLowerCase().startsWith('<!doctype html>')) {
        await onUpdatedCode(responseText);
        toast.success('המשחק עודכן ונשמר!');
        const modelResponseMessage: GeminiMessage = { role: 'model', parts: [{ text: 'הנה הקוד המעודכן. הוא נטען במשחק למעלה.' }] };
        setMessages(prev => [...prev, modelResponseMessage]);
      } else {
         const modelResponseMessage: GeminiMessage = { role: 'model', parts: [{ text: responseText }] };
         setMessages(prev => [...prev, modelResponseMessage]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      const errorResponseMessage: GeminiMessage = { role: 'model', parts: [{ text: `אופס, קרתה שגיאה: ${errorMessage}` }] };
      setMessages(prev => [...prev, errorResponseMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const visibleMessages = messages.slice(1);

  return (
    <div className="border rounded-lg p-4 bg-white shadow-lg flex flex-col h-[400px] sm:h-[448px] lg:h-[calc(600px-theme(space.6))]">
      <h2 className="text-xl font-bold mb-3 text-gray-800 flex-shrink-0">שפר את המשחק</h2>
      <div className="flex-grow h-0 overflow-y-auto pr-2 space-y-4">
        {visibleMessages.map((msg, idx) => (
          <div key={idx} className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">AI</div>}
            <div className={`p-3 rounded-lg max-w-sm ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
              <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.parts[0].text}</p>
            </div>
             {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">אני</div>}
          </div>
        ))}
        {isSending && (
           <div className="flex items-start gap-2.5 justify-start">
             <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">AI</div>
             <div className="p-3 rounded-lg bg-gray-200 text-gray-800 rounded-bl-none">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                </div>
             </div>
           </div>
        )}
        <div ref={chatEndRef} />
      </div>
      {error && <p className="text-red-500 text-xs my-2 flex-shrink-0">{error}</p>}
      <div className="flex gap-2 pt-3 border-t flex-shrink-0">
        <textarea
          className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 transition"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="בקש שינוי, למשל: 'שנה את צבע הרקע לכחול'"
          disabled={isSending}
        />
        <button
          onClick={handleSend}
          disabled={isSending || !input.trim()}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-semibold"
        >
          {isSending ? '...' : 'שלח'}
        </button>
      </div>
    </div>
  );
};

export default GameChatBox;
