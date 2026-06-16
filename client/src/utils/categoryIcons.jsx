import React from 'react';
import {
  BookOpen,
  Printer,
  Frame,
  Trophy,
  Smartphone,
  Briefcase,
  FileText,
  Package,
  Box,
  Image as ImageIcon
} from 'lucide-react';

export const getCategoryIcon = (categoryName, size = 24, className = '') => {
  if (!categoryName) return <Package size={size} className={className} />;
  
  const lowerCat = String(categoryName).toLowerCase();

  if (lowerCat.includes('stationery') || lowerCat.includes('book')) {
    return <BookOpen size={size} className={className} />;
  }
  if (lowerCat.includes('print') || lowerCat.includes('offset') || lowerCat.includes('laser')) {
    return <Printer size={size} className={className} />;
  }
  if (lowerCat.includes('frame')) {
    return <Frame size={size} className={className} />;
  }
  if (lowerCat.includes('memento') || lowerCat.includes('trophy') || lowerCat.includes('award')) {
    return <Trophy size={size} className={className} />;
  }
  if (lowerCat.includes('electronic') || lowerCat.includes('device')) {
    return <Smartphone size={size} className={className} />;
  }
  if (lowerCat.includes('office')) {
    return <Briefcase size={size} className={className} />;
  }
  if (lowerCat.includes('paper')) {
    return <FileText size={size} className={className} />;
  }
  if (lowerCat.includes('box') || lowerCat.includes('pack')) {
    return <Box size={size} className={className} />;
  }

  return <ImageIcon size={size} className={className} />;
};
