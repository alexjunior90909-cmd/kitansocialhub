import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { WHATSAPP_URL } from '@/constants';

const WhatsAppButton: React.FC = () => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-[70] flex flex-col items-end gap-2">
      {showTooltip && (
        <div className="bg-kitan-surface border border-kitan-border rounded-2xl px-4 py-3 shadow-card-shadow animate-fade-in max-w-[220px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-kitan-off-white text-sm font-semibold">Need help?</p>
              <p className="text-kitan-muted text-xs mt-0.5">Chat with us on WhatsApp instantly!</p>
            </div>
            <button onClick={() => setShowTooltip(false)} className="text-kitan-subtle hover:text-kitan-muted flex-shrink-0">
              <X size={14} />
            </button>
          </div>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 w-full bg-[#25D366] hover:bg-[#22C55E] text-white text-xs font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <MessageCircle size={14} />
            Chat on WhatsApp
          </a>
        </div>
      )}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setShowTooltip(false)}
        onMouseEnter={() => setShowTooltip(true)}
        className="w-14 h-14 bg-[#25D366] hover:bg-[#22C55E] rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all active:scale-95 animate-pulse-teal"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle size={26} className="text-white" />
      </a>
    </div>
  );
};

export default WhatsAppButton;
