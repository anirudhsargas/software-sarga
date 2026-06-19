import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · SARGA` : 'SARGA Admin';
  }, [title]);
}

export default usePageTitle;
