/**
 * AssetSelector — premium glassmorphism asset cards for the Consignment Video
 * form. Multi-select with clear visual selection state.
 */
import React from 'react';
import {
  Layers, Gem, Link2, Package, KeyRound, Car, Zap, Banknote, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ASSET_DEFS: Array<{ id: string; label: string; icon: React.ElementType }> = [
  { id: 'gold_bars',     label: 'Gold Bars',      icon: Layers  },
  { id: 'rings',         label: 'Rings',           icon: Gem     },
  { id: 'necklaces',     label: 'Necklaces',       icon: Link2   },
  { id: 'iphone_carton', label: 'iPhone Carton',   icon: Package },
  { id: 'car_key',       label: 'Car Key',         icon: KeyRound },
  { id: 'cybertruck_key', label: 'Cybertruck Key', icon: Car     },
  { id: 'tesla_key',     label: 'Tesla Key',       icon: Zap     },
  { id: 'cash',          label: 'Cash',            icon: Banknote },
];

interface Props {
  selected: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
}

const AssetSelector: React.FC<Props> = ({ selected, onChange }) => {
  const toggle = (id: string) => {
    // Functional update — safe even for rapid consecutive clicks
    onChange(prev => (prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]));
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {ASSET_DEFS.map(({ id, label, icon: Icon }) => {
        const active = selected.includes(id);
        return (
          <button
            type="button"
            key={id}
            onClick={() => toggle(id)}
            aria-pressed={active}
            className={cn(
              'relative rounded-2xl p-4 flex flex-col items-center gap-2.5 border backdrop-blur-md transition-all duration-200 select-none',
              active
                ? 'bg-kitan-teal/15 border-kitan-teal/70 shadow-teal-glow'
                : 'bg-kitan-card/50 border-kitan-border hover:border-kitan-teal/40 hover:bg-kitan-card/70',
            )}
          >
            <span
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center border transition-colors',
                active ? 'bg-kitan-teal/20 border-kitan-teal/50' : 'bg-kitan-bg/60 border-kitan-border',
              )}
            >
              <Icon size={20} className={active ? 'text-kitan-teal' : 'text-kitan-muted'} />
            </span>
            <span className={cn('text-xs font-semibold', active ? 'text-kitan-teal' : 'text-kitan-muted')}>
              {label}
            </span>
            <span
              className={cn(
                'absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center border transition-all',
                active ? 'bg-kitan-teal border-kitan-teal' : 'bg-kitan-bg/70 border-kitan-border',
              )}
            >
              {active && <Check size={12} className="text-white" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default React.memo(AssetSelector);
