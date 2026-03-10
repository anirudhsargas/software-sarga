# Search Functionality Analysis - Code Base Map

## Overview
Complete audit of search-related functionality across the client/src directory, including search input fields, handlers, and implementations.

---

## 1. GLOBAL/COMPONENT-LEVEL SEARCH

### SmartSearch Component (Ctrl+K Overlay)
- **File**: [client/src/components/SmartSearch.jsx](client/src/components/SmartSearch.jsx)
- **CSS**: [client/src/components/SmartSearch.css](client/src/components/SmartSearch.css)
- **Main Function**: `SmartSearch()` - Line 11
- **Search Handler**: `doSearch()` - Line 31
- **Search API Endpoint**: `/search` - Line 39
- **Features**:
  - Line 30-52: Debounced search with 300ms delay
  - Line 52: useCallback hook with automatic debounce
  - Line 111-141: Search dropdown UI with loading spinner
  - Searches across customers, orders/jobs, and products simultaneously
  - Keyboard navigation support for results

### SmartSearchBar Component  
- **File**: [client/src/components/SmartSearchBar.jsx](client/src/components/SmartSearchBar.jsx)
- **Search Function**: `doSearch()` - Line 43
- **API Endpoints**:
  - Line 37: Suggestions endpoint: `/ai/search/suggest?q=`
  - Line 48: Main search endpoint: `/ai/search`
- **Search Trigger**: Line 58-59 (on suggestion selection or Enter key)
- **Features**:
  - Line 43-59: Async search handler with suggestion support
  - Line 106: Placeholder text: "Search customers, jobs, payments..."
  - Line 123: Click handler for suggestion selection

### CSS Styling for Search Components
- **File**: [client/src/index.css](client/src/index.css)
- **Classes**:
  - Line 3444-3468: `.smart-search-trigger` - Search trigger button styles
  - Line 3768-3785: `.search-box` - Generic search input container styles
  - Line 2375: Comment marking "Search & filter bars" section

---

## 2. FRONT OFFICE DASHBOARD SEARCH

### FrontOffice Component (Main Dashboard)
- **File**: [client/src/pages/FrontOffice.jsx](client/src/pages/FrontOffice.jsx)
- **Search State Variables**:
  - Line 21: `[search, setSearch]` - Current search query
  - Line 22: `[searchResults, setSearchResults]` - Search results array
  - Line 23: `[searchLoading, setSearchLoading]` - Loading state
  - Line 24: `[showSearchResults, setShowSearchResults]` - Dropdown visibility
  - Line 25: `searchRef` - Reference for click-outside detection
  
- **Search Handler**: `handleSearch()` - Lines 140-157
  - Line 141: Update search state
  - Line 142-145: Clear results if query < 2 characters
  - Line 149: Set loading state
  - Line 151: API call: `/front-office/search?q=`
  - Line 152: Set search results
  - Line 300ms debounce on search

- **Search UI Elements**:
  - Line 274-297: Search input bar with icon
  - Line 275: Placeholder: "Search customer by name or mobile... (Ctrl+K)"
  - Line 289-296: Clear button and loading spinner
  - Line 298-318: Search dropdown results display
  - Line 292: Clear button handler

- **Keyboard Shortcut**:
  - Line 152: Ctrl+K focuses search input (`#fo-search`)

- **Dropdown Behavior**:
  - Line 160-167: Close on outside click detection
  - Line 298: Show/hide based on `showSearchResults` state

---

## 3. DASHBOARD MAIN COMPONENT

### Dashboard Component
- **File**: [client/src/pages/Dashboard.jsx](client/src/pages/Dashboard.jsx)
- **Search State**:
  - Line 67: `[searchOpen, setSearchOpen]` - SmartSearch overlay visibility
  - Line 158: Toggle search open state
  
- **Search Trigger Button**:
  - Line 469: `.smart-search-trigger` button with click handler
  - Toggles SmartSearch modal

- **SmartSearch Modal Integration**:
  - Line 511: `<SmartSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />`

---

## 4. PAGE-LEVEL SEARCH IMPLEMENTATIONS

### Customers Page
- **File**: [client/src/pages/Customers.jsx](client/src/pages/Customers.jsx)
- **Search State**:
  - Line 30: `[searchQuery, setSearchQuery]` - Search query state
  
- **Search Logic**:
  - Line 49-66: useEffect hook monitoring `searchQuery`
  - Line 55: Backend search parameter: `params.append('search', searchQuery.trim())`
  - Line 357: Input onChange handler

- **Search Input Element**:
  - Line 356-357: Input field with onChange handler

### Jobs/Orders Page
- **File**: [client/src/pages/Jobs.jsx](client/src/pages/Jobs.jsx)
- **Search State**:
  - Line 57: `[searchQuery, setSearchQuery]` - Search query state

- **Search Logic**:
  - Line 88: Search included in URL: `/jobs?page=${page}&search=${searchQuery}...`
  - Line 100: useEffect dependencies include `searchQuery`
  - Line 123: Page reset on search change

- **Search Input Element**:
  - Line 258-259: Input field with `searchQuery` value and onChange handler

### Accounts Page (Multiple Search Implementations)
- **File**: [client/src/pages/Accounts.jsx](client/src/pages/Accounts.jsx)

#### Bills/Documents Search
- **Search State**:
  - Line 275: `[search, setSearch]` - Bills search state
  - Line 399: `[search, setSearch]` - Bills/exports search state (separate instance)

- **Filter Logic**:
  - Line 679: Filter object with `vendor_name`, `document_type`, dates
  - Line 690-693: Vendor name search parameter
  - Line 698: useEffect depends on `filter` state

- **Search Input**:
  - Line 323: Vendor name search input with onChange handler
  - Line 448: Another search input instance
  - Line 764: Vendor search with placeholder

#### CSS Styling:
- **File**: [client/src/pages/Accounts.css](client/src/pages/Accounts.css)
- Search-related classes:
  - Line 157: `.acc-date-bar__search` - Search in date bar
  - Line 539-552: `.acc-search-wrap` - Search wrapper styles
  - Line 931-935: Mobile responsive search styles

### FrontOffice.jsx - JavaScript
- **File**: [client/src/pages/FrontOffice.jsx](client/src/pages/FrontOffice.jsx)
- **Additional Details**:
  - Line 140: `handleSearch()` function definition
  - Line 151: API endpoint: `/front-office/search` with debounce
  - Line 308-318: Rendering search results with click handlers

### Customers Page - Detailed View
- **File**: [client/src/pages/CustomerDetails.jsx](client/src/pages/CustomerDetails.jsx)
- **Filter State**:
  - Line 49: `[statusFilter, setStatusFilter]` - Job status filter
  
- **Filter Logic**:
  - Line 105-108: `filteredJobs` useMemo calculation
  - Line 107-108: Filter jobs by status with `.filter(j => j.status === statusFilter)`
  - Line 309-314: Filter buttons UI

- **CSS**:
  - [client/src/pages/CustomerDetails.css](client/src/pages/CustomerDetails.css)
  - Line 300-328: `.cd-filters` and `.cd-filter-btn` styles

### Orders/Predictions Page
- **File**: [client/src/pages/OrderPredictions.jsx](client/src/pages/OrderPredictions.jsx)
- **Search State**:
  - Line 24: `[search, setSearch]` - Order predictions search

- **Search Input**:
  - Line 111: Input with value and onChange handler

### Payment Verification Page
- **File**: [client/src/pages/PaymentVerification.jsx](client/src/pages/PaymentVerification.jsx)
- **Search State**:
  - Line 36: `[search, setSearch]` - Payment search state

- **Search Input**:
  - Line 140-142: Input with onChange and clear button
  - Line 142: Clear button (X icon) with onClick handler

### Production Tracker Page
- **File**: [client/src/pages/ProductionTracker.jsx](client/src/pages/ProductionTracker.jsx)
- **Search State**:
  - Line 35: `[search, setSearch]` - Production search state

- **Search Input**:
  - Line 91: Input field with value and onChange handler

### Plate Management Page
- **File**: [client/src/pages/PlateManagement.jsx](client/src/pages/PlateManagement.jsx)
- **Search State**:
  - Line 16: `[search, setSearch]` - Plate search state

- **Search Input**:
  - Line 270: Input field with onChange handler

### Expense Manager - Vendors Tab
- **File**: [client/src/pages/expense-manager/VendorsTab.jsx](client/src/pages/expense-manager/VendorsTab.jsx)
- **Search State**:
  - Line 19: `[searchTerm, setSearchTerm]` - Vendor search state

- **Filter Logic**:
  - Line 253-254: Case-insensitive filter on vendor name and type:
    ```javascript
    v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.type?.toLowerCase().includes(searchTerm.toLowerCase())
    ```

- **Search Input**:
  - Line 382: Input with placeholder "Search vendors..."
  - Line 408: Empty state with search term

### AI Monitoring Page
- **File**: [client/src/pages/AIMonitoring.jsx](client/src/pages/AIMonitoring.jsx)
- **Filter State**:
  - Line 21: `[filter, setFilter]` - Status filter state

- **Filter Logic**:
  - Line 27: API call with filter: `/ai/monitoring/alerts?status=${filter}`
  - Line 36: useEffect depends on `filter` state

- **Filter UI**:
  - Line 109-110: Filter button toggle with `setFilter(f)`

---

## 5. SEARCH PATTERNS SUMMARY

| Pattern | Files | Count |
|---------|-------|-------|
| Search State Variables | 7+ pages | 15+ instances |
| Search Handlers/Functions | 2 components | `handleSearch()`, `doSearch()` |
| Search Input Fields | 10+ pages | Multiple search inputs |
| Debounced Search | 2 | SmartSearch (300ms), FrontOffice (300ms) |
| API Endpoints Used | 4 | `/search`, `/ai/search`, `/front-office/search`, `/ai/search/suggest` |
| Dropdown/Results Display | 3 | SmartSearch, SmartSearchBar, FrontOffice |
| Keyboard Shortcuts | 2 | Ctrl+K (SmartSearch), Ctrl+K (FrontOffice) |
| Status Filters | 3+ | Jobs, CustomerDetails, AIMonitoring |

---

## 6. KEY ENDPOINTS AND CALLBACKS

### Search API Endpoints
1. **Global Search**: `/search` - Line 39 (SmartSearch.jsx)
2. **AI Smart Search**: `/ai/search` - Line 48 (SmartSearchBar.jsx)
3. **AI Search Suggestions**: `/ai/search/suggest?q=` - Line 37 (SmartSearchBar.jsx)
4. **Front Office Search**: `/front-office/search?q=` - Line 151 (FrontOffice.jsx)

### Debounce Implementation
- **SmartSearch**: 300ms timeout - Line 52 (SmartSearch.jsx)
- **FrontOffice**: 300ms timeout - Line 149 (FrontOffice.jsx)
- **SmartSearchBar**: Inline debouncing with suggestions

---

## 7. FILTER & CATEGORY IMPLEMENTATIONS

### Status Filters
- [client/src/pages/CustomerDetails.jsx](client/src/pages/CustomerDetails.jsx#L49) - Job status filter (Line 49)
- [client/src/pages/Jobs.jsx](client/src/pages/Jobs.jsx) - Status query parameter

### Vendor Filters
- [client/src/pages/expense-manager/VendorsTab.jsx](client/src/pages/expense-manager/VendorsTab.jsx#L253) - Name/type filter (Lines 253-254)

### Date/Document Filters
- [client/src/pages/Accounts.jsx](client/src/pages/Accounts.jsx#L679) - Multi-field filter object (Line 679)

---

## Summary Statistics

- **Total Files with Search**: 13+ JSX/CSS files
- **Total Search Input Fields**: 15+
- **Total Search Functions/Handlers**: 5+
- **Debounced Search Implementations**: 2
- **Global/Modal Search**: 2 (SmartSearch, SmartSearchBar)
- **Page-Level Search**: 11+
- **API Endpoints**: 4+
- **Keyboard Shortcuts**: 2+

