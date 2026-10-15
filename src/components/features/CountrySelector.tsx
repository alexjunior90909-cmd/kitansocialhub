import React from 'react';
import { X, Globe } from 'lucide-react';
import { COUNTRIES } from '@/constants';
import { useCountryStore } from '@/stores/useStore';
import type { Country } from '@/types';

const CountrySelector: React.FC = () => {
  const { showSelector, setShowSelector, setCountry, selectedCountry } = useCountryStore();

  if (!showSelector) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => selectedCountry && setShowSelector(false)} />
      <div className="relative w-full max-w-lg bg-kitan-surface border border-kitan-border rounded-3xl shadow-card-shadow animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="relative px-8 pt-8 pb-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-gradient flex items-center justify-center mb-4 mx-auto shadow-teal-glow">
            <Globe size={32} className="text-white" />
          </div>
          <h2 className="font-display text-2xl font-bold text-kitan-off-white text-center mb-2">
            Select Destination
          </h2>
          <p className="text-kitan-muted text-sm text-center">
            Choose the country where you want to send your gift
          </p>
          {selectedCountry && (
            <button
              onClick={() => setShowSelector(false)}
              className="absolute top-6 right-6 w-8 h-8 rounded-xl bg-kitan-card border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-off-white transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Country grid */}
        <div className="px-6 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {COUNTRIES.map(country => (
            <button
              key={country.code}
              onClick={() => setCountry(country.code as Country)}
              className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group ${
                selectedCountry === country.code
                  ? 'bg-kitan-teal/10 border-kitan-teal shadow-teal-glow'
                  : 'bg-kitan-bg border-kitan-border hover:border-kitan-teal hover:bg-kitan-teal/5'
              }`}
            >
              <span className="text-4xl">{country.flag}</span>
              <div>
                <p className={`font-semibold text-sm ${selectedCountry === country.code ? 'text-kitan-teal' : 'text-kitan-off-white group-hover:text-kitan-teal'} transition-colors`}>
                  {country.name}
                </p>
                <p className="text-kitan-subtle text-xs">{country.currency} · {country.symbol}</p>
              </div>
              {selectedCountry === country.code && (
                <div className="ml-auto w-6 h-6 rounded-full bg-kitan-teal flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CountrySelector;
