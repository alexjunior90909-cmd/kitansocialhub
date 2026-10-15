import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

const NotFound: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-kitan-bg flex items-center justify-center p-6">
      <div className="text-center max-w-md animate-fade-in">
        <div className="relative mb-8">
          <span className="font-display text-[10rem] font-bold text-kitan-card leading-none select-none">404</span>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl animate-float">🎁</span>
          </div>
        </div>
        <h1 className="font-display text-2xl font-bold text-kitan-off-white mb-3">Page Not Found</h1>
        <p className="text-kitan-muted mb-8">Looks like this page got lost in delivery. Let's get you back on track.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-2">
            <ArrowLeft size={16} /> Go Back
          </button>
          <button onClick={() => navigate('/')} className="btn-primary flex items-center gap-2">
            <Home size={16} /> Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
