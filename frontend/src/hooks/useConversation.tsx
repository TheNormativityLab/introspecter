"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  plotId?: string;
}

interface StoredPlot {
  id: string;
  type: string;
  title: string;
  data: any;
  rawData?: any;
  renderType?: string;
  createdAt: string;
  messageIndex: number;
}

interface ConversationContextType {
  conversationId: string | null;
  messages: Message[];
  plots: StoredPlot[];
  isLoading: boolean;
  setMessages: (messages: Message[]) => void;
  setPlots: (plots: StoredPlot[]) => void;
  addMessage: (message: Message) => void;
  addPlot: (plot: StoredPlot) => void;
  startNewConversation: () => void;
  clearConversation: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  getOrCreateConversationId: () => Promise<string>;
}

const ConversationContext = createContext<ConversationContextType | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [plots, setPlots] = useState<StoredPlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const conversationIdRef = useRef<string | null>(null);
  const createPromiseRef = useRef<Promise<string> | null>(null);
  const initializedRef = useRef(false);

  const updateConversationId = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    setConversationId(id);
    if (id) {
      localStorage.setItem('currentConversationId', id);
    } else {
      localStorage.removeItem('currentConversationId');
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      const savedId = localStorage.getItem('currentConversationId');
      if (savedId) {
        conversationIdRef.current = savedId;
        try {
          const response = await fetch(`/api/harness/conversations/${savedId}`);
          if (response.ok) {
            const data = await response.json();
            updateConversationId(savedId);
            setMessages(data.messages || []);
            setPlots(data.plots || []);
          } else {
            localStorage.removeItem('currentConversationId');
            conversationIdRef.current = null;
          }
        } catch {
          localStorage.removeItem('currentConversationId');
          conversationIdRef.current = null;
        }
      }
    };
    init();
  }, [updateConversationId]);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const addPlot = useCallback((plot: StoredPlot) => {
    setPlots(prev => [...prev, plot]);
  }, []);

  const startNewConversation = useCallback(() => {
    updateConversationId(null);
    setMessages([]);
    setPlots([]);
    createPromiseRef.current = null;
  }, [updateConversationId]);

  const clearConversation = useCallback(async () => {
    const currentId = conversationIdRef.current;
    if (currentId) {
      try {
        await fetch(`/api/harness/conversations/${currentId}/clear`, {
          method: 'POST',
        });
      } catch {}
    }
    setMessages([]);
    setPlots([]);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setIsLoading(true);
    createPromiseRef.current = null;
    try {
      const response = await fetch(`/api/harness/conversations/${id}`);
      if (response.ok) {
        const data = await response.json();
        updateConversationId(id);
        setMessages(data.messages || []);
        setPlots(data.plots || []);
      } else {
        updateConversationId(null);
        setMessages([]);
        setPlots([]);
      }
    } catch {
      updateConversationId(null);
      setMessages([]);
      setPlots([]);
    } finally {
      setIsLoading(false);
    }
  }, [updateConversationId]);

  const getOrCreateConversationId = useCallback(async (): Promise<string> => {
    const currentId = conversationIdRef.current;
    if (currentId) {
      return currentId;
    }

    if (createPromiseRef.current) {
      return createPromiseRef.current;
    }

    const promise = (async () => {
      const response = await fetch('/api/harness/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        createPromiseRef.current = null;
        throw new Error('Failed to create conversation');
      }

      const data = await response.json();
      const newId = data.conversationId;
      
      if (!newId) {
        createPromiseRef.current = null;
        throw new Error('No conversationId returned');
      }

      updateConversationId(newId);
      return newId;
    })();

    createPromiseRef.current = promise;
    
    try {
      return await promise;
    } catch (error) {
      createPromiseRef.current = null;
      throw error;
    }
  }, [updateConversationId]);

  return (
    <ConversationContext.Provider
      value={{
        conversationId,
        messages,
        plots,
        isLoading,
        setMessages,
        setPlots,
        addMessage,
        addPlot,
        startNewConversation,
        clearConversation,
        loadConversation,
        getOrCreateConversationId,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversationStore() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversationStore must be used within a ConversationProvider');
  }
  return context;
}