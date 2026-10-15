import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { CATEGORIES, CATEGORY_ICONS } from '@/constants';
import { useProductsStore } from '@/stores/useStore';

const CategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const { products } = useProductsStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-heading">All Categories</h1>
        <p className="text-kitan-muted text-sm mt-1">Browse our 26 premium gift categories</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {CATEGORIES.map(cat => {
          const count = products.filter(p => p.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => navigate(`/gifts?category=${encodeURIComponent(cat)}`)}
              className="card-kitan p-5 flex flex-col items-center gap-3 group text-center hover:border-kitan-teal"
            >
              <span className="text-4xl group-hover:scale-110 transition-transform duration-200">{CATEGORY_ICONS[cat] || '🎁'}</span>
              <p className="text-kitan-off-white text-sm font-semibold group-hover:text-kitan-teal transition-colors leading-snug">{cat}</p>
              <p className="text-kitan-subtle text-xs">{count} item{count !== 1 ? 's' : ''}</p>
              <ChevronRight size={14} className="text-kitan-subtle group-hover:text-kitan-teal transition-colors" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CategoriesPage;
