import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useFinancialStore } from '../store/useFinancialStore';
import { Card } from '../components/ui/Card';
import type { AIMessage } from '../types';
import { generateAIResponse } from '../engine/aiAdvisor';
import { PaperAirplaneIcon, TrashIcon, SparklesIcon } from '@heroicons/react/24/outline';

const SAMPLE_QUESTIONS = [
  'Can I retire next year?',
  'What if the market drops 35%?',
  'What if I spend $180,000/year?',
  'What if I inherit $500,000?',
  'What if I buy a vacation home?',
  "What's my Freedom Number?",
  'How should I claim Social Security?',
  'What can I leave my daughters?',
];

export function AIAdvisor() {
  const { profile, assets, assumptions, cashFlows, monteCarloResult, aiMessages, addAIMessage, clearAIMessages } = useFinancialStore();
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, isThinking]);

  const sendMessage = (text?: string) => {
    const message = (text ?? input).trim();
    if (!message) return;

    const userMsg: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    addAIMessage(userMsg);
    setInput('');
    setIsThinking(true);

    setTimeout(() => {
      const response = generateAIResponse(message, {
        profile,
        assets,
        assumptions,
        cashFlows,
        monteCarloResult,
      });

      const assistantMsg: AIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };
      addAIMessage(assistantMsg);
      setIsThinking(false);
    }, 800);
  };

  const MessageBubble = ({ msg }: { msg: AIMessage }) => {
    const isUser = msg.role === 'user';
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}
      >
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <SparklesIcon className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        <div
          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-gray-800 text-gray-200 rounded-tl-sm'
          }`}
        >
          {msg.content.split('\n').map((line, i) => {
            // Bold text between **
            const parts = line.split(/\*\*(.*?)\*\*/g);
            return (
              <p key={i} className={`${i > 0 ? 'mt-1' : ''}`}>
                {parts.map((part, j) => (j % 2 === 1 ? <strong key={j} className="font-semibold">{part}</strong> : part))}
              </p>
            );
          })}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[800px]">
      <Card className="flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
              <SparklesIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">AI Financial Advisor</p>
              <p className="text-xs text-gray-400">Ask anything about your financial plan</p>
            </div>
          </div>
          {aiMessages.length > 0 && (
            <button
              onClick={clearAIMessages}
              className="text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 text-xs"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {aiMessages.length === 0 && (
            <div className="text-center py-6">
              <SparklesIcon className="w-10 h-10 text-violet-500/50 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-400">Your Personal CFO</p>
              <p className="text-xs text-gray-500 mt-1 mb-6">Ask me anything about your retirement, taxes, estate, or investment strategy.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SAMPLE_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left px-3 py-2 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 text-xs text-gray-300 hover:text-white transition-colors border border-gray-700/50 hover:border-gray-600"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {aiMessages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {isThinking && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
                <SparklesIcon className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2.5 flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              placeholder="Ask about your retirement plan..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={isThinking}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isThinking}
              className="px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            AI responses are estimates based on your plan data. Consult a licensed financial advisor for personalized advice.
          </p>
        </div>
      </Card>
    </div>
  );
}
