import React from 'react';
import ReactDOM from 'react-dom';
import { useAiAssistantStore } from '@/stores/aiAssistantStore';
import AiAssistantPanel from './AiAssistantPanel';

/** Mounted once in App.tsx, next to ModalHost -- same "one global portal,
 *  toggled by a store" shape, so the panel is available from any page
 *  instead of being threaded through every page's own AppShell instance. */
const AiAssistantHost: React.FC = () => {
  const open = useAiAssistantStore((s) => s.open);
  if (!open) return null;
  return ReactDOM.createPortal(<AiAssistantPanel />, document.body);
};

export default AiAssistantHost;
