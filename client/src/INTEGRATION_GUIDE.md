> Master Context: [../../SARGA_WORK_CONTEXT.md](../../SARGA_WORK_CONTEXT.md)
> Source of truth for project state, architecture, and workflow decisions.

/**
 * OFFLINE & SERVER HANDLING INTEGRATION GUIDE
 * 
 * How to integrate SkeletonLoader, ServerError, and useApiRequest into pages
 */

// ============================================================================
// STEP 1: Import the new components and hook
// ============================================================================

import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import useApiRequest from '../hooks/useApiRequest';

// ============================================================================
// STEP 2: Choose integration pattern based on your page type
// ============================================================================

// PATTERN A: For pages that use useApiRequest (NEW Approach - Recommended)
// ─────────────────────────────────────────────────────────────────────────

const MyPage = () => {
  // Replace: const [data, setData] = useState(null);
  //          const [loading, setLoading] = useState(true);
  //          const [error, setError] = useState('');
  //          Then manual fetch calls...
  
  // With a single hook:
  const { data, loading, error, retry, lastUpdated } = useApiRequest('/api/endpoint');

  // Simple render logic:
  if (loading) return <SkeletonLoader type="table" count={8} />;
  if (error) return <ServerError onRetry={retry} lastUpdated={lastUpdated} />;
  if (!data) return <div>No data available</div>;

  // Render your content with data...
  return <YourContent data={data} />;
};


// PATTERN B: For pages with existing manual state management (MIGRATION Approach)
// ─────────────────────────────────────────────────────────────────────────────

const MyPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const lastDataRef = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/endpoint');
      setData(response.data);
      lastDataRef.current = response.data;
      setLastUpdated(new Date());
      setError('');
    } catch (err) {
      console.error('Fetch error:', err);
      setError(true);
      if (lastDataRef.current) {
        setData(lastDataRef.current);  // Show last cached data
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, []);

  // NEW: Add error and loading states
  if (loading && !lastDataRef.current) {
    return <SkeletonLoader type="table" count={8} />;
  }

  if (error) {
    return <ServerError onRetry={handleRetry} lastUpdated={lastUpdated} />;
  }

  // Render your content...
  return <YourContent data={data} />;
};


// ============================================================================
// STEP 3: SkeletonLoader Types
// ============================================================================

// For list/table pages:
<SkeletonLoader type="table" count={8} />

// For dashboard/grid pages:
<SkeletonLoader type="cards" count={6} />

// For form pages:
<SkeletonLoader type="form" count={4} />


// ============================================================================
// STEP 4: ServerError Handling
// ============================================================================

// Basic usage:
<ServerError onRetry={retry} />

// With more context:
<ServerError 
  onRetry={retry} 
  lastUpdated={lastUpdated}
  message="Customer data unavailable"
/>


// ============================================================================
// PAGINATION PATTERN with Offline Support
// ============================================================================

const PaginatedPage = () => {
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const lastDataRef = useRef(null);

  const fetchPage = async (pageNum = 1) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/endpoint?page=${pageNum}`);
      setItems(response.data.items);
      setTotal(response.data.total);
      lastDataRef.current = response.data;
      setError('');
    } catch (err) {
      setError(true);
      if (lastDataRef.current) {
        setItems(lastDataRef.current.items);
        setTotal(lastDataRef.current.total);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(page);
  }, [page]);

  if (loading && !lastDataRef.current) {
    return <SkeletonLoader type="table" count={8} />;
  }

  if (error) {
    return <ServerError onRetry={() => fetchPage(page)} />;
  }

  return (
    <>
      {/* Your table content */}
      <Pagination 
        page={page}
        total={total}
        onPageChange={setPage}
      />
    </>
  );
};


// ============================================================================
// SEARCH & FILTER PATTERN
// ============================================================================

const SearchablePage = () => {
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const { data, loading, error, retry } = useApiRequest(
    `/api/search?q=${query || ''}`,
    { skip: !loaded }  // Don't fetch until user starts searching
  );

  if (loading) return <SkeletonLoader type="table" />;
  if (error) return <ServerError onRetry={retry} />;

  return (
    <div>
      <input 
        onChange={(e) => {
          setQuery(e.target.value);
          setLoaded(true);
        }}
      />
      {data?.length > 0 ? (
        <YourResults data={data} />
      ) : (
        <div>No results found</div>
      )}
    </div>
  );
};


// ============================================================================
// ERROR BOUNDARY INTEGRATION
// ============================================================================

// In your App.tsx or root component:
import ErrorBoundary from '../components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <YourRouter />
    </ErrorBoundary>
  );
}

// The ErrorBoundary automatically catches:
// - React render errors
// - Stale chunk errors (PWA cache)
// - Shows user-friendly error UI with retry capability
