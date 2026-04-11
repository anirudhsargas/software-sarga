> Master Context: [../../SARGA_WORK_CONTEXT.md](../../SARGA_WORK_CONTEXT.md)
> Source of truth for project state, architecture, and workflow decisions.

# Quick Integration Templates

Copy these templates into each page file and adapt to your existing structure.

## Template 1: Simple Functional Component (Pattern A - Hook-Based)

**Use for: New pages or complete page rewrites**

```jsx
import React, { useState, useEffect } from 'react';
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import useApiRequest from '../hooks/useApiRequest';

export default function YourPage() {
  const { data, loading, error, retry, lastUpdated } = useApiRequest(
    '/api/your-endpoint'
  );

  if (loading) return <SkeletonLoader type="table" count={8} />;
  if (error) return <ServerError onRetry={retry} lastUpdated={lastUpdated} />;
  if (!data) return <div>No data available</div>;

  return (
    <div className="page-container">
      {/* Your content here */}
      <YourContent data={data} />
    </div>
  );
}
```

**Skeleton Types:**
- `type="cards"` - Dashboard items, grid layouts
- `type="table"` - Lists, tables, records
- `type="form"` - Input forms

---

## Template 2: Class Component Migration (Pattern B - With Existing State)

**Use for: Existing class components with lots of state**

```jsx
class YourPage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      data: [],
      loading: false,
      error: null,
      lastUpdated: null,
      lastDataRef: [], // Keep last successful data
    };
  }

  componentDidMount() {
    this.fetchData();
  }

  fetchData = async () => {
    this.setState({ loading: true, error: null });
    try {
      const response = await fetch('/api/your-endpoint');
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      this.setState({
        data: result,
        lastDataRef: result, // Cache successful response
        lastUpdated: new Date(),
      });
    } catch (error) {
      this.setState({ error: error.message });
    } finally {
      this.setState({ loading: false });
    }
  };

  render() {
    const { data, loading, error, lastUpdated, lastDataRef } = this.state;

    // Show skeleton while loading
    if (loading && lastDataRef.length === 0) {
      return <SkeletonLoader type="table" count={8} />;
    }

    // Show error banner but display cached data below
    if (error && lastDataRef.length > 0) {
      return (
        <>
          <ServerError
            onRetry={this.fetchData}
            lastUpdated={lastUpdated}
            message={error}
          />
          <YourContent data={lastDataRef} />
        </>
      );
    }

    // Only error, no cached data
    if (error) {
      return (
        <ServerError onRetry={this.fetchData} message={error} />
      );
    }

    // Success
    return <YourContent data={data} />;
  }
}
```

---

## Template 3: Paginated List (Pattern C - With Pagination)

**Use for: Jobs, Customers, Lists with pagination**

```jsx
import { useState, useEffect } from 'react';
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import useApiRequest from '../hooks/useApiRequest';

export default function ListPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const { data, loading, error, retry, lastUpdated } = useApiRequest(
    `/api/items?page=${page}&pageSize=${pageSize}`
  );

  // Show skeleton while loading first page
  if (loading && !data) return <SkeletonLoader type="table" />;

  // Error with no data
  if (error && !data) {
    return <ServerError onRetry={retry} lastUpdated={lastUpdated} />;
  }

  // Error but have cached data
  if (error && data) {
    return (
      <>
        <ServerError onRetry={retry} lastUpdated={lastUpdated} />
        <ItemsList items={data.items} />
        <Pagination 
          current={page} 
          onChange={setPage}
          total={data.total}
        />
      </>
    );
  }

  return (
    <>
      <ItemsList items={data.items} />
      <Pagination 
        current={page} 
        onChange={setPage}
        total={data.total}
      />
    </>
  );
}
```

---

## Template 4: Search/Filter with Refresh (Pattern D - Dynamic Queries)

**Use for: Pages with search, filters, or multiple endpoints**

```jsx
import { useState } from 'react';
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import useApiRequest from '../hooks/useApiRequest';

export default function SearchPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const url = `/api/items?search=${search}&filter=${filter}`;
  const { data, loading, error, retry, lastUpdated } = useApiRequest(url);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    // API will refetch automatically when URL changes
  };

  if (loading && !data) return <SkeletonLoader type="table" />;

  if (error && !data) {
    return <ServerError onRetry={retry} lastUpdated={lastUpdated} />;
  }

  return (
    <div>
      <SearchBar value={search} onChange={handleSearch} />
      {error && data && (
        <ServerError onRetry={retry} lastUpdated={lastUpdated} />
      )}
      <ResultsList items={data || []} />
    </div>
  );
}
```

---

## Template 5: Dashboard with Multiple Sections (Pattern E - Parallel Loads)

**Use for: FrontOffice, Dashboard pages**

```jsx
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import useApiRequest from '../hooks/useApiRequest';

export default function Dashboard() {
  const { data: summary, loading: summaryLoading, error: summaryError, retry: retrySummary } = 
    useApiRequest('/api/dashboard/summary');
  const { data: recent, loading: recentLoading, error: recentError, retry: retryRecent } = 
    useApiRequest('/api/dashboard/recent');
  const { data: stats, loading: statsLoading, error: statsError, retry: retryStats } = 
    useApiRequest('/api/dashboard/stats');

  // Show loader if any section is loading on first fetch
  if ((summaryLoading || recentLoading || statsLoading) && !summary) {
    return <SkeletonLoader type="cards" count={4} />;
  }

  return (
    <div className="dashboard">
      {/* Summary Section */}
      <div>
        {summaryError && <ServerError onRetry={retrySummary} />}
        {summary && <SummaryCards data={summary} />}
      </div>

      {/* Recent Section */}
      <div>
        {recentError && <ServerError onRetry={retryRecent} />}
        {recentLoading && !recent && <SkeletonLoader type="table" count={6} />}
        {recent && <RecentItems data={recent} />}
      </div>

      {/* Stats Section */}
      <div>
        {statsError && <ServerError onRetry={retryStats} />}
        {statsLoading && !stats && <SkeletonLoader type="cards" count={3} />}
        {stats && <StatsChart data={stats} />}
      </div>
    </div>
  );
}
```

---

## Template 6: With Manual Fetch Control (Pattern F - Advanced)

**Use for: Pages with manual refresh buttons or form submissions**

```jsx
import { useState, useRef } from 'react';
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';

export default function AdvancedPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const lastDataRef = useRef(null);

  const fetchData = async (url, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Request failed');
      const result = await response.json();
      setData(result);
      lastDataRef.current = result;
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchData('/api/data');
  };

  const handleFormSubmit = async (formData) => {
    await fetchData('/api/data', {
      method: 'POST',
      body: JSON.stringify(formData),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  if (loading && !lastDataRef.current) {
    return <SkeletonLoader type="form" />;
  }

  if (error && !lastDataRef.current) {
    return <ServerError onRetry={handleRefresh} />;
  }

  return (
    <>
      {error && lastDataRef.current && (
        <ServerError onRetry={handleRefresh} lastUpdated={lastUpdated} />
      )}
      <YourForm 
        data={data || lastDataRef.current}
        onSubmit={handleFormSubmit}
        onRefresh={handleRefresh}
      />
    </>
  );
}
```

---

## Implementation Checklist

- [ ] Copy appropriate template for your page
- [ ] Import the 3 new components/hooks
- [ ] Update API endpoint URL
- [ ] Test loading state
- [ ] Test error state (kill server to test)
- [ ] Test retry button
- [ ] Verify cached data shows when offline
- [ ] Check dark mode
- [ ] Test on mobile

## Common Adjustments

### Change skeleton type
```jsx
// For list/table views
<SkeletonLoader type="table" count={8} />

// For dashboard/cards
<SkeletonLoader type="cards" count={4} />

// For forms
<SkeletonLoader type="form" />
```

### Customize retry action
```jsx
const handleRetry = () => {
  // Custom retry logic
  retry();
};

<ServerError onRetry={handleRetry} />
```

### Add custom error message
```jsx
<ServerError 
  onRetry={retry}
  message="Failed to load data. Please try again."
  lastUpdated={lastUpdated}
/>
```

### Conditional rendering with data
```jsx
if (!data || data.length === 0) {
  return <EmptyState />;
}
```
