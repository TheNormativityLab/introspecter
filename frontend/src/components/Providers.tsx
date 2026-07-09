// components/Providers.tsx
"use client";

import { ConversationProvider } from '@/hooks/useConversation';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConversationProvider>
      {children}
    </ConversationProvider>
  );
}