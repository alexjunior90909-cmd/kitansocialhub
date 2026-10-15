import React from 'react';
import { Star } from 'lucide-react';
import { getStarArray } from '@/lib/utils';

interface Props {
  rating: number;
  size?: number;
  showNumber?: boolean;
}

const StarRating: React.FC<Props> = ({ rating, size = 14, showNumber = true }) => {
  const stars = getStarArray(rating);

  return (
    <div className="flex items-center gap-1">
      {stars.map((type, i) => (
        <Star
          key={i}
          size={size}
          className={type === 'empty' ? 'text-kitan-border' : 'text-amber-400'}
          fill={type === 'full' ? '#F59E0B' : type === 'half' ? 'url(#half)' : 'none'}
        />
      ))}
      {showNumber && (
        <span className="text-kitan-muted text-xs ml-1">{rating.toFixed(1)}</span>
      )}
    </div>
  );
};

export default StarRating;
