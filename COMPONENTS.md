# Component Inventory

Generated 2026-06-20. Scans `client/src/components/` (staff MIS portal) and `website/src/components/` (customer-facing site).

**Legend:** `*` = orphaned (zero importers) · `!` = >300 lines · `⚠` = known issues

---

## Layout & Navigation

| Component | File | State | Style | Lines | Importers |
|---|---|---|---|---|---|
| **AccountantSidebar** | `client/src/components/accounting/AccountantSidebar.jsx` | internal | AccountantSidebar.css + shared classes | 62 | `layouts/AccountantLayout.jsx` |
| **AppShellSkeleton** | `client/src/components/ui/AppShellSkeleton.jsx` | stateless | AppShellSkeleton.css | 63 | `App.jsx` |
| **BranchSelect** | `client/src/components/ui/BranchSelect.jsx` | controlled | inline + shared classes; deps: `var(--surface2)`, `var(--text-muted)`, `var(--border)` | 36 | 26 pages (Accounts, Dashboard, PickupBookings, etc.) |
| **Footer** | `website/src/components/Footer.jsx` | pure | Footer.css (BEM: `footer__*`) | 91 | `App.jsx` |
| **LanguageSwitcher** | `website/src/components/LanguageSwitcher.jsx` | controlled | inline; deps: `var(--border)`, `var(--accent)`, `var(--text)` | 38 | * orphaned |
| **Navbar** | `website/src/components/Navbar.jsx` | hybrid | Navbar.css (BEM: `navbar__*`) | 81 | `App.jsx` |
| **PageContainer** | `client/src/components/ui/PageContainer.jsx` | controlled | PageContainer.css | 12 | ~105 pages (most widely used) |
| **RequiresConnection** | `client/src/components/RequiresConnection.jsx` | controlled | inline; deps: `var(--text-secondary)`, `var(--destructive)` | 60 | `pages/Dashboard.jsx` |
| **StickyQuoteWidget** | `website/src/components/StickyQuoteWidget.jsx` | hybrid | inline + `.btn` `.btn-primary`; deps: `var(--radius-full)`, `var(--accent)` | 44 | * orphaned |

### Props

**AccountantSidebar** — none (collapsible via local state + localStorage)

**AppShellSkeleton** — none

**BranchSelect**
| Prop | Type | Required | Default |
|---|---|---|---|
| children | ReactNode | — | — |
| className | string | — | `""` |
| style | object | — | — |

**Footer** — none

**LanguageSwitcher** — none

**Navbar** — none

**PageContainer**
| Prop | Type | Required | Default |
|---|---|---|---|
| children | ReactNode | — | — |
| className | string | — | `""` |

**RequiresConnection**
| Prop | Type | Required | Default |
|---|---|---|---|
| children | ReactNode | — | — |
| feature | string | — | `"This feature"` |

**StickyQuoteWidget** — none

---

## Forms & Inputs

| Component | File | State | Style | Lines | Importers |
|---|---|---|---|---|---|
| **Button** | `client/src/components/Button.jsx` | controlled | shared `.btn` system + ripple | 62 | InvoiceModal, PaymentModal, Dashboard, DesignerDashboard, JobDetail, OtherStaffDashboard, PrinterDashboard |
| **CameraCapture** | `client/src/components/CameraCapture.jsx` | internal | inline; deps: `var(--card)`, `var(--foreground)`, `var(--success)`, `var(--accent)` | 268 | `pages/expense-manager/SmartBillUpload.jsx` |
| **CountryCodeSelect** | `client/src/components/CountryCodeSelect.jsx` | controlled | className + inline | 29 | `pages/Customers.jsx`, `pages/StaffManagement.jsx` |
| **FormError** `*` | `client/src/components/ui/FormError.jsx` | controlled | shared `.form-error` classes | 22 | * orphaned |
| **LoadingButton** | `client/src/components/LoadingButton.jsx` | controlled | className + inline | 58 | DesignerDashboard, JobDetail, OtherStaffDashboard, PrinterDashboard |
| **OTPVerification** `*` | `client/src/components/OTPVerification.jsx` | hybrid | `.otp-*` classes; deps: `var(--success)` | 185 | * orphaned |
| **ValidatedInput** `*` | `client/src/components/ui/ValidatedInput.jsx` | hybrid | `.validated-field__*` BEM-like | 138 | * orphaned |
| **ValidatedSelect** `*` | `client/src/components/ui/ValidatedSelect.jsx` | hybrid | `.validated-field__*` BEM-like | 102 | * orphaned |
| **ValidatedTextarea** `*` | `client/src/components/ui/ValidatedTextarea.jsx` | hybrid | `.validated-field__*` BEM-like | 113 | * orphaned |

### Props

**Button**
| Prop | Type | Required | Default |
|---|---|---|---|
| children | ReactNode | — | — |
| variant | string | — | `"primary"` |
| size | string | — | `"md"` |
| loading | boolean | — | `false` |
| loadingText | string | — | — |
| icon | ReactNode | — | — |
| iconRight | ReactNode | — | — |
| pill | boolean | — | `false` |
| full | boolean | — | `false` |
| onClick | function | — | — |
| className | string | — | `""` |

**CameraCapture**
| Prop | Type | Required | Default |
|---|---|---|---|
| onCapture | function | — | — |
| onClose | function | ✓ | — |

**CountryCodeSelect**
| Prop | Type | Required | Default |
|---|---|---|---|
| value | string | — | `"+91"` |
| onChange | function | — | noop |
| id | string | — | — |
| name | string | — | — |
| className | string | — | `""` |

**FormError**
| Prop | Type | Required | Default |
|---|---|---|---|
| message | string | — | — |
| onDismiss | function | — | — |

**LoadingButton**
| Prop | Type | Required | Default |
|---|---|---|---|
| loading | boolean | — | — |
| children | ReactNode | — | — |
| loadingText | string | — | — |
| className | string | — | `""` |
| disabled | boolean | — | — |
| icon | React.Component | — | — |

**OTPVerification**
| Prop | Type | Required | Default |
|---|---|---|---|
| onVerified | function | — | — |
| phoneNumber | string | — | — |
| autoSend | boolean | — | `false` |

**ValidatedInput**
| Prop | Type | Required | Default |
|---|---|---|---|
| type | string | — | `"text"` |
| name | string | — | — |
| label | string | — | — |
| value | string\|number | — | — |
| onChange | function | — | — |
| validator | function | — | — |
| required | boolean | — | `false` |
| placeholder | string | — | — |
| disabled | boolean | — | `false` |
| maxLength | number | — | — |
| min | number | — | — |
| max | number | — | — |
| step | number | — | — |
| className | string | — | `""` |
| inputClassName | string | — | `""` |
| autoFocus | boolean | — | `false` |
| onBlur | function | — | — |
| helpText | string | — | — |

**ValidatedSelect**
| Prop | Type | Required | Default |
|---|---|---|---|
| name | string | — | — |
| label | string | — | — |
| value | string | — | — |
| onChange | function | — | — |
| validator | function | — | — |
| required | boolean | — | `false` |
| options | array | — | `[]` |
| placeholder | string | — | `"Select..."` |
| disabled | boolean | — | `false` |
| className | string | — | `""` |
| inputClassName | string | — | `""` |
| helpText | string | — | — |

**ValidatedTextarea**
| Prop | Type | Required | Default |
|---|---|---|---|
| name | string | — | — |
| label | string | — | — |
| value | string | — | — |
| onChange | function | — | — |
| validator | function | — | — |
| required | boolean | — | `false` |
| placeholder | string | — | — |
| disabled | boolean | — | `false` |
| rows | number | — | `4` |
| maxLength | number | — | — |
| className | string | — | `""` |
| inputClassName | string | — | `""` |
| helpText | string | — | — |

---

## Data Display

| Component | File | State | Style | Lines | Importers |
|---|---|---|---|---|---|
| **InventoryImage** | `client/src/components/InventoryImage.jsx` | internal | `.inv-image-container` + inline; deps: `var(--surface-2)`, `var(--border)` | 173 | `pages/Inventory.jsx` |
| **OfflineStatusBar** `*` | `client/src/components/OfflineStatusBar.jsx` | none (obsolete stub) | inline | 8 | * orphaned — directs to SyncStatusBar |
| **OptimizedImage** `*` | `client/src/components/ui/OptimizedImage.jsx` | controlled | `<picture>` + inline styles (aspectRatio) | 67 | * orphaned |
| **Pagination** | `client/src/components/Pagination.jsx` | controlled | Pagination.css (`.pagination__*`) | 124 | CustomerDetails, CustomerPayments, Customers, Inventory, Jobs, Payments, PaymentVerification, SalesPrediction, StaffManagement |
| **SecureImage** | `client/src/components/SecureImage.jsx` | internal | className + inline; deps: `var(--surface-2)`, `var(--border)` | 118 | InventoryImage, AttendanceSalary, Billing, CCTV, CustomerDetails, Dashboard, EmployeeDetail, Inventory, JobDetail, ProductLibrary, ScanItem, StaffManagement |
| **Skeleton** | `client/src/components/Skeleton.jsx` | controlled | `.skeleton` classes | 39 | App, ChatbotTraining, AttendanceSalary, CustomerDetails, Customers, DailyReport, Dashboard, FrontOffice, Jobs |
| **SkeletonLoader** | `client/src/components/SkeletonLoader.jsx` | controlled | SkeletonLoader.css | 196 | ChatbotTraining, AttendanceSalary, Customers, DailyReport, Dashboard, FrontOffice, Jobs |
| **SmartSearch** | `client/src/components/SmartSearch.jsx` | internal | SmartSearch.css; deps: `var(--accent-soft)`, `var(--muted-foreground)` | 275 | `pages/Dashboard.jsx` |
| **SmartSearchBar** `*` | `client/src/components/SmartSearchBar.jsx` | internal | inline; deps: `var(--border)`, `var(--surface-2)`, `var(--shadow-lg)` | 206 | * orphaned |
| **SyncStatusBar** | `client/src/components/SyncStatusBar.jsx` | hybrid | SyncStatusBar.css; deps: `var(--success)`, `var(--danger)`, `var(--warning)` | 108 | `App.jsx` |

### Props

**InventoryImage**
| Prop | Type | Required | Default |
|---|---|---|---|
| item | object | ✓ | — |
| onUpdate | function | — | — |
| size | number | — | `40` |
| isAdmin | boolean | — | `false` |

**OfflineStatusBar** — none

**OptimizedImage**
| Prop | Type | Required | Default |
|---|---|---|---|
| src | string | ✓ | — |
| alt | string | — | `""` |
| width | number | — | — |
| height | number | — | — |
| className | string | — | `""` |
| sizes | string | — | `"40px"` |
| loading | string | — | `"lazy"` |
| fetchpriority | string | — | `"auto"` |

**Pagination**
| Prop | Type | Required | Default |
|---|---|---|---|
| page | number | ✓ | — |
| totalPages | number | ✓ | — |
| total | number | ✓ | — |
| limit | number | — | `20` |
| onPageChange | function | ✓ | — |
| loading | boolean | — | — |

**SecureImage**
| Prop | Type | Required | Default |
|---|---|---|---|
| src | string | ✓ | — |
| alt | string | — | — |
| className | string | — | — |
| style | object | — | — |
| loading | `"lazy"\|"eager"` | — | — |
| decoding | `"async"\|"sync"` | — | — |
| width | number\|string | — | — |
| height | number\|string | — | — |

**Skeleton** — exports subcomponents: `Skeleton`, `SkeletonText`, `SkeletonTitle`, `SkeletonAvatar`, `SkeletonKpi`. Each accepts `width`, `height`, `className`.

**SkeletonLoader**
| Prop | Type | Required | Default |
|---|---|---|---|
| type | `"cards"\|"table"\|"customer-list"\|"attendance"\|"form"` | — | `"cards"` |
| count | number | — | `6` |
| columns | array | — | — |

**SmartSearch**
| Prop | Type | Required | Default |
|---|---|---|---|
| isOpen | boolean | ✓ | — |
| onClose | function | ✓ | — |

**SmartSearchBar** — none

**SyncStatusBar** — none

---

## Modals & Dialogs

| Component | File | State | Style | Lines | Importers |
|---|---|---|---|---|---|
| **CameraPermissionModal** | `client/src/components/CameraPermissionModal.jsx` | hybrid | className + inline; deps: `var(--error)`, `var(--border)` | 107 | ScannerModal, ScanItem |
| **ConfirmModal** | `client/src/components/ConfirmModal.jsx` | controlled | `.confirm-modal` + `.btn-*` | 40 | `contexts/ConfirmContext.jsx` |
| **ImageCropModal** | `client/src/components/ImageCropModal.jsx` | internal | `.modal-backdrop`; deps: `react-easy-crop` | 112 | ProductLibrary, StaffManagement |
| **InvoiceModal** `!` | `client/src/components/InvoiceModal.jsx` | internal | `.modal` + inline; deps: `var(--surface-2)` | **352** | VendorDetail, Vendors |
| **ManageShortcuts** | `client/src/components/quickbilling/ManageShortcuts.jsx` | internal | inline + shared classes | 124 | QuickActionsDashboard |
| **PaperOptimizer** `!*` | `client/src/components/PaperOptimizer.jsx` | internal | inline; deps: `var(--shadow-sm)`, `var(--surface)` | **369** | * orphaned |
| **PaperSidePanel** `!` | `client/src/components/PaperSidePanel.jsx` | internal | className + inline; deps: `var(--border)` | 328 | `pages/Dashboard.jsx` |
| **PaymentModal** | `client/src/components/PaymentModal.jsx` | internal | `.modal` + inline; deps: `var(--border-subtle)` | 279 | VendorDetail, Vendors, ExpenseManager |
| **ProofReviewModal** | `website/src/components/ProofReviewModal.jsx` | hybrid | inline + `.btn` classes; deps: `var(--text-muted)` | 65 | `pages/JobDetail.jsx` |
| **ReceiptModal** `*` | `client/src/components/ReceiptModal.jsx` | controlled | ReceiptModal.css (`.receipt-modal__*`) | 190 | * orphaned (portal-based) |
| **ScannerModal** `!` | `client/src/components/ScannerModal.jsx` | internal | className + inline; deps: `var(--card)`, `var(--border)` | **387** | Billing, Dashboard |
| **ShortcutModal** | `client/src/components/quickbilling/ShortcutModal.jsx` | hybrid | inline + `.qb-*` classes; deps: `var(--muted)`, `var(--primary)` | 120 | QuickActionsDashboard |
| **VendorModal** | `client/src/components/VendorModal.jsx` | internal | `.modal-content-premium` + inline; deps: `var(--modal-overlay)`, `var(--border-subtle)` | 279 | Vendors |

### Props

**CameraPermissionModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| isOpen | boolean | ✓ | — |
| onClose | function | ✓ | — |
| onRetry | function | ✓ | — |

**ConfirmModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| isOpen | boolean | ✓ | — |
| title | string | — | — |
| message | string | — | — |
| confirmText | string | — | — |
| cancelText | string | — | — |
| type | `"danger"\|"warning"\|"info"` | — | — |
| onConfirm | function | ✓ | — |
| onCancel | function | ✓ | — |

**ImageCropModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| file | File | ✓ | — |
| title | string | — | `"Crop Image"` |
| outputSize | number | — | `512` |
| onCancel | function | ✓ | — |
| onComplete | function | ✓ | — |

**InvoiceModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| vendor | object | ✓ | — |
| onClose | function | ✓ | — |
| onSave | function | ✓ | — |

**ManageShortcuts**
| Prop | Type | Required | Default |
|---|---|---|---|
| onClose | function | ✓ | — |

**PaperOptimizer**
| Prop | Type | Required | Default |
|---|---|---|---|
| isOpen | boolean | ✓ | — |
| onClose | function | ✓ | — |
| onApply | function | — | — |

**PaperSidePanel**
| Prop | Type | Required | Default |
|---|---|---|---|
| open | boolean | ✓ | — |
| onClose | function | ✓ | — |

**PaymentModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| invoice | object | ✓ | — |
| onClose | function | ✓ | — |
| onSave | function | ✓ | — |

**ProofReviewModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| open | boolean | ✓ | — |
| proof | object | ✓ | — |
| onClose | function | ✓ | — |
| onSubmit | function | ✓ | — |

**ReceiptModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| isOpen | boolean | ✓ | — |
| onClose | function | ✓ | — |
| paymentData | object | ✓ | — |
| branchInfo | object | — | — |

**ScannerModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| isOpen | boolean | ✓ | — |
| onClose | function | ✓ | — |
| onScan | function | ✓ | — |

**ShortcutModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| shortcut | object | ✓ | — |
| onClose | function | ✓ | — |
| onAdd | function | ✓ | — |

**VendorModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| vendor | object\|null | — | `null` (create mode) |
| onClose | function | ✓ | — |
| onSave | function | ✓ | — |

---

## Feedback

| Component | File | State | Style | Lines | Importers |
|---|---|---|---|---|---|
| **AnomalyPanel** | `client/src/components/AnomalyPanel.jsx` | internal | inline; deps: `var(--error)`, `var(--warning)`, `var(--accent)` | 152 | `pages/Dashboard.jsx` |
| **AutomationWidget** `*` | `client/src/components/AutomationWidget.jsx` | internal | inline + `.card`; deps: `var(--success-light)`, `var(--danger-light)` | 88 | * orphaned |
| **ErrorBoundary** | `client/src/components/ErrorBoundary.jsx` | internal (class) | ErrorBoundary.css (`.error-boundary__*`) | 121 | App, CustomerPayments, Dashboard, Inventory, Invoices, Payments |
| **ErrorPage** | `client/src/components/ErrorPage.jsx` | controlled | `.empty-state-global__*` + inline; deps: `var(--text-secondary)` | 35 | AccessRestricted, NetworkError, NotFound, ServerError |
| **InsightsPanel** | `client/src/components/InsightsPanel.jsx` | internal | inline; deps: `var(--border)`, `var(--card)`, `var(--warning)` | 274 | `pages/Dashboard.jsx` |
| **ProgressBar** | `client/src/components/ProgressBar.jsx` | internal | inline; deps: `var(--card)`, `var(--accent)` | 83 | `pages/Dashboard.jsx` |
| **ScannerErrorBoundary** | `client/src/components/ScannerErrorBoundary.jsx` | internal (class) | className + inline; deps: `var(--warning)` | 39 | `pages/Inventory.jsx` |
| **SectionErrorBoundary** | `client/src/components/SectionErrorBoundary.jsx` | internal (class) | inline; deps: `var(--muted)`, `var(--border)` | 70 | CustomerPayments, Dashboard, Invoices, Payments |
| **ServerError** | `client/src/components/ServerError.jsx` | controlled | ServerError.css (`.server-error__*`) | 51 | AttendanceSalary, Customers, ExpenseManager, FrontOffice, Jobs |

### Props

**AnomalyPanel** — none

**AutomationWidget** — none

**ErrorBoundary**
| Prop | Type | Required | Default |
|---|---|---|---|
| children | ReactNode | — | — |

**ErrorPage**
| Prop | Type | Required | Default |
|---|---|---|---|
| icon | React.Component | — | — |
| title | string | — | — |
| message | string | — | — |
| suggestion | string | — | — |
| actions | `{label, variant, onClick}[]` | — | — |

**InsightsPanel** — none

**ProgressBar**
| Prop | Type | Required | Default |
|---|---|---|---|
| active | boolean | ✓ | — |
| onComplete | function | — | — |

**ScannerErrorBoundary**
| Prop | Type | Required | Default |
|---|---|---|---|
| children | ReactNode | — | — |
| onClose | function | ✓ | — |

**SectionErrorBoundary**
| Prop | Type | Required | Default |
|---|---|---|---|
| children | ReactNode | — | — |
| name | string | — | — |
| title | string | — | — |
| message | string | — | — |

**ServerError**
| Prop | Type | Required | Default |
|---|---|---|---|
| onRetry | function | — | — |
| lastUpdated | string\|null | — | — |
| message | string | — | `"Server is currently unavailable"` |

---

## Charts & Analytics (Recharts)

| Component | File | State | Style | Lines | Importers |
|---|---|---|---|---|---|
| **ForecastChart** | `client/src/components/ForecastChart.jsx` | internal | inline; deps: recharts (ComposedChart, Area, LineChart), `var(--card-bg)` | 248 | `pages/SalesPrediction.jsx` |
| **OrderForecastWidget** | `client/src/components/OrderForecastWidget.jsx` | internal | inline; deps: recharts (BarChart), `var(--primary)`, `var(--warning)` | 222 | `pages/Summary.jsx` |
| **VendorDashboard** `!` | `client/src/components/VendorDashboard.jsx` | internal | className + inline; deps: recharts (LineChart), `var(--border-subtle)` | **316** | `pages/Vendors.jsx` |

### Props

**ForecastChart** — none

**OrderForecastWidget**
| Prop | Type | Required | Default |
|---|---|---|---|
| branchId | string\|number | — | — |

**VendorDashboard**
| Prop | Type | Required | Default |
|---|---|---|---|
| refreshKey | number | — | `0` |

---

## Domain-Specific — Staff MIS (client)

| Component | File | State | Style | Lines | Importers |
|---|---|---|---|---|---|
| **AppearanceSettings** | `client/src/components/AppearanceSettings.jsx` | controlled | `.sp-card` + `.sp-theme-*` | 67 | SettingsPage, StaffSettingsPage |
| **BoneyardExample** `*` | `client/src/components/BoneyardExample.jsx` | controlled | `.example-card` + boneyard Skeleton wrapper | 29 | * orphaned — demo only |
| **ChatWidget** | `client/src/components/chatbot/ChatWidget.jsx` | internal | inline + `.card` `.btn`; deps: `var(--border)`, `var(--destructive)` | 73 | `pages/admin/ChatbotTraining.jsx` |
| **DailyBookAutomationSettings** `*` | `client/src/components/Settings/DailyBookAutomationSettings.jsx` | internal | `.sp-card` + inline; deps: `var(--bg-light)`, `var(--accent)` | 267 | * orphaned (route-loaded?) |
| **HolidayCalendar** | `client/src/components/HolidayCalendar.jsx` | internal | `.holiday-calendar__*` + inline; deps: `var(--accent)` | 130 | `pages/StaffManagement.jsx` |
| **MeterVerification** `!` | `client/src/components/MeterVerification.jsx` | internal | `.meter-verification` classes | **360** | `pages/MachineManagement.jsx` |
| **QuickActionsDashboard** | `client/src/components/quickbilling/QuickActionsDashboard.jsx` | internal | QuickBilling.css; deps: `var(--primary)`, `var(--border)` | 221 | `pages/FrontOffice.jsx` |
| **QuickCart** | `client/src/components/quickbilling/QuickCart.jsx` | hybrid | inline + `.qb-*` classes; deps: `var(--success)` | 114 | QuickActionsDashboard |
| **SEO** `*` | `client/src/components/SEO.jsx` | controlled | none (Helmet only) | 35 | * orphaned — superseded by `useSEO` hook |
| **ThemeToggle** `*` | `client/src/components/ThemeToggle.jsx` | hybrid | `.theme-toggle-*` | 59 | * orphaned |
| **UpsellSuggestions** `*` | `client/src/components/UpsellSuggestions.jsx` | internal | inline + `@keyframes`; deps: `var(--primary)`, `var(--bg-2)` | 108 | * orphaned |
| **VendorDetail** `!` | `client/src/components/VendorDetail.jsx` | internal | `.detail-*` + `.glass-card`; deps: `var(--font-heading)`, `var(--border-subtle)` | **499** | Vendors |
| **Vendors** `!` | `client/src/components/Vendors.jsx` | internal | `.vendor-card` + inline | 329 | `pages/ExpenseManager.jsx`, `pages/Vendors.jsx` |

### Props

**AppearanceSettings** — none

**BoneyardExample**
| Prop | Type | Required | Default |
|---|---|---|---|
| data | object | ✓ | — |
| isLoading | boolean | ✓ | — |

**ChatWidget** — none

**DailyBookAutomationSettings** — none

**HolidayCalendar**
| Prop | Type | Required | Default |
|---|---|---|---|
| onSuccess | function | — | — |

**MeterVerification**
| Prop | Type | Required | Default |
|---|---|---|---|
| machineId | number\|string | ✓ | — |
| machineName | string | — | — |
| machineIpAddress | string | — | — |
| lastClosingCount | number | — | — |

**QuickActionsDashboard** — none

**QuickCart**
| Prop | Type | Required | Default |
|---|---|---|---|
| isOpen | boolean | ✓ | — |
| setIsOpen | function | ✓ | — |
| items | array | ✓ | — |
| setItems | function | ✓ | — |

**SEO (client)**
| Prop | Type | Required | Default |
|---|---|---|---|
| title | string | — | — |
| description | string | — | — |
| url | string | — | — |
| image | string | — | — |
| type | string | — | `"website"` |

**ThemeToggle (client)**
| Prop | Type | Required | Default |
|---|---|---|---|
| showLabel | boolean | — | `false` |
| variant | string | — | `"dropdown"` |

**UpsellSuggestions**
| Prop | Type | Required | Default |
|---|---|---|---|
| currentServices | string[] | ✓ | — |
| branchId | number\|null | — | — |
| onAdd | function | ✓ | — |

**VendorDetail**
| Prop | Type | Required | Default |
|---|---|---|---|
| vendor | object | — | — |
| onBack | function | ✓ | — |
| onEditVendor | function | ✓ | — |
| onDeleteVendor | function | ✓ | — |
| formatCurrency | function | ✓ | — |
| getStatusBadge | function | ✓ | — |
| refreshKey | number | — | `0` |
| canEdit | boolean | — | `true` |
| canDelete | boolean | — | `true` |
| canAdd | boolean | — | `true` |

**Vendors**
| Prop | Type | Required | Default |
|---|---|---|---|
| refreshKey | number | — | `0` |
| canEdit | boolean | — | `true` |
| canDelete | boolean | — | `true` |
| canAdd | boolean | — | `true` |

**VendorModal**
| Prop | Type | Required | Default |
|---|---|---|---|
| vendor | object\|null | — | `null` |
| onClose | function | ✓ | — |
| onSave | function | ✓ | — |

---

## Domain-Specific — Customer-Facing (website)

| Component | File | State | Style | Lines | Importers |
|---|---|---|---|---|---|
| **CartDrawer** | `website/src/components/Cart/CartDrawer.jsx` | hybrid | CartDrawer.css | 57 | `App.jsx` |
| **CartIcon** | `website/src/components/Cart/CartIcon.jsx` | controlled | CartIcon.css | 16 | Navbar |
| **Chatbot** | `website/src/components/Chatbot/Chatbot.jsx` | hybrid | Chatbot.css | 199 | `App.jsx` |
| **FinishSimulator** `*` | `website/src/components/FinishSimulator.jsx` | hybrid | Tailwind + inline + `<style>` | 117 | * orphaned |
| **PricingCalculator** | `website/src/components/PricingCalculator.jsx` | hybrid | `.pricing-*` + `<style>`; deps: `var(--card-bg)`, `var(--border-color)` | 287 | `pages/PricingPage.jsx` |
| **PreflightChecker** `*` | `website/src/components/PreflightChecker.jsx` | hybrid | `.preflight-*` + inline; deps: `var(--error)`, `var(--success)`, `var(--card-bg)` | 147 | * orphaned |
| **Product3DPreview** `*⚠` | `website/src/components/Product3DPreview.jsx` | hybrid | Tailwind + inline | 177 | * orphaned — imports deleted `@react-three/fiber` + `three` (not in package.json) |
| **PromoBanner** `*` | `website/src/components/PromoBanner.jsx` | hybrid | PromoBanner.css + inline | 60 | * orphaned |
| **ReviewsWidget** `*` | `website/src/components/ReviewsWidget/ReviewsWidget.jsx` | hybrid | ReviewsWidget.css (`.rw-*` BEM) | 212 | * orphaned |
| **SEO** | `website/src/components/SEO.jsx` | pure | none (returns null, imperative DOM) | 66 | BlogList, BlogPostDetail, Checkout, DesignBooking, OrderView, PickupBooking, Portfolio, PricingPage, SampleRequest |
| **ThemeToggle** | `website/src/components/ThemeToggle.jsx` | hybrid | inline; deps: `var(--border)`, `var(--surface)`, `var(--text)` | 95 | Navbar |
| **WhatsAppButton** | `website/src/components/WhatsAppButton.jsx` | hybrid | inline (green `#25D366`) + className prop | 134 | PricingCalculator, PricingPage |

### Props

**CartDrawer** — none (uses CartContext)

**CartIcon** — none (uses CartContext)

**Chatbot** — none

**FinishSimulator**
| Prop | Type | Required | Default |
|---|---|---|---|
| designUrl | string | — | — |
| productName | string | — | `"Design Preview"` |
| width | number | — | `400` |
| height | number | — | `300` |

**PricingCalculator**
| Prop | Type | Required | Default |
|---|---|---|---|
| product | object | ✓ | — |
| preSelectedFinish | string\|number | — | — |
| onAddToCart | function | — | — |

**PreflightChecker**
| Prop | Type | Required | Default |
|---|---|---|---|
| onCheckComplete | function | — | — |
| jobId | string\|number | — | — |

**Product3DPreview**
| Prop | Type | Required | Default |
|---|---|---|---|
| productType | string | — | `"default"` |
| designUrl | string | — | — |
| height | number | — | `300` |
| interactive | boolean | — | `true` |

**PromoBanner** — none

**ReviewsWidget** — none

**SEO (website)**
| Prop | Type | Required | Default |
|---|---|---|---|
| title | string | — | — |
| description | string | — | — |
| ogImage | string | — | — |
| ogType | string | — | `"website"` |
| canonical | string | — | — |
| schema | object | — | — |

**ThemeToggle (website)** — none

**WhatsAppButton**
| Prop | Type | Required | Default |
|---|---|---|---|
| phoneNumber | string | — | `"+919895410035"` |
| productName | string | — | — |
| quantity | string | — | — |
| size | string | — | — |
| variant | string | — | — |
| customerName | string | — | — |
| artworkUrl | string | — | — |
| options | array | — | `[]` |
| orderRef | string | — | — |
| type | `"order"` | — | `"order"` |
| branch | string | — | — |
| analyticsEndpoint | string | — | `"/api/whatsapp/log"` |
| className | string | — | `""` |
| style | object | — | `{}` |
| label | string | — | — |

---

## Cross-Cutting Concerns

### Near-Duplicate Component Pairs

| Pair | Files | Notes |
|---|---|---|
| **SEO (client) / `useSEO` hook** | `client/src/components/SEO.jsx` vs `client/src/hooks/useSEO.js` | Both set meta tags/OG. The component (`SEO.jsx`) is **orphaned** — all clients use the `useSEO` hook instead. Can delete `SEO.jsx`. |
| **SmartSearch / SmartSearchBar** | `client/src/components/SmartSearch.jsx` vs `client/src/components/SmartSearchBar.jsx` | Both are Ctrl+K command-palette overlays searching customers/jobs/products. `SmartSearch.jsx` is imported by Dashboard; `SmartSearchBar.jsx` is orphaned. Likely superseded or experimental duplicate. |
| **Skeleton / SkeletonLoader** | `client/src/components/Skeleton.jsx` vs `client/src/components/SkeletonLoader.jsx` | `Skeleton.jsx` = low-level primitives (text, title, avatar, KPI shapes). `SkeletonLoader.jsx` = higher-level layout presets (cards, table, form). Complementary, but `SkeletonLoader` re-invents some of what `Skeleton` provides. Could consolidate. |
| **ThemeToggle (client) / ThemeToggle (website)** | Both projects have a ThemeToggle | Separate implementations, different prop interfaces. Client one takes `showLabel`/`variant` and is **orphaned**. Website one is imported by Navbar. |
| **OfflineStatusBar / SyncStatusBar** | `client/src/components/OfflineStatusBar.jsx` vs `client/src/components/SyncStatusBar.jsx` | OfflineStatusBar is an obsolete 8-line stub directing users to SyncStatusBar. Ready for deletion. |

### Duplicate CSS Class Issues (Cross-Referenced)

**`.modal` — 7 conflicting definitions** across `client/src/`:
- `index.css` (global): `max-width: 500px`, no `display: flex`
- `styles/components/modals.css`: `max-width: 420px`, `display: flex; flex-direction: column`
- `Billing.css`: `max-width: 480px`, no `display: flex`
- `JobDetail.css`: `max-width: 400px`, padding-based (no display flex)
- `BlogCMS.css`: `max-width: 1100px`, `display: flex; flex-direction: column`
- `ExpenseManager.css`: different `backdrop-filter: blur(3px)` (vs 4px in others)
- `Customers.css`: scoped `max-width: 520px`

`.modal--large` has **three different definitions**:
- `index.css` → `640px`
- `modals.css` → `800px`
- `BlogCMS.css` → `1100px` + `height: 90vh` + `flex column`

**`.badge` — 4 conflicting definitions**:
- `index.css` (client): `border-radius: var(--radius-xs)`, `inline-flex`, no uppercase
- `StockTransfer.css`: `border-radius: var(--radius-full)`, `inline-block`, `uppercase`
- `Vendors.css`: `badge-premium-*` duplicates all color variants
- `website/index.css`: `border-radius: var(--radius-full)`, `uppercase`, `letter-spacing: 0.08em`

**`.btn` / `.btn-primary` / `.btn-outline` / `.btn-ghost` / `.btn-sm`** — defined in both `client/src/styles/buttons.css` and `website/src/index.css` with different base values (border, padding, height, shadow).

### Deleted-Package Imports

| Component | Imports | Status |
|---|---|---|
| **Product3DPreview** (`website/src/components/Product3DPreview.jsx`) | `@react-three/fiber`, `@react-three/drei`, `three` | ⚠ **None of these are in `website/package.json`.** The component will fail at build/runtime. Either the dependency was removed or the component is dead code. |

### Components Over 300 Lines (Split Candidates)

| Component | Line Count | File |
|---|---|---|
| **VendorDetail** | 499 | `client/src/components/VendorDetail.jsx` |
| **ScannerModal** | 387 | `client/src/components/ScannerModal.jsx` |
| **PaperOptimizer** | 369 | `client/src/components/PaperOptimizer.jsx` |
| **MeterVerification** | 360 | `client/src/components/MeterVerification.jsx` |
| **InvoiceModal** | 352 | `client/src/components/InvoiceModal.jsx` |
| **Vendors** | 329 | `client/src/components/Vendors.jsx` |
| **PaperSidePanel** | 328 | `client/src/components/PaperSidePanel.jsx` |
| **VendorDashboard** | 316 | `client/src/components/VendorDashboard.jsx` |

---

## Summary

| Metric | Client | Website | Total |
|---|---|---|---|
| Components | 50 `.jsx` files | 16 `.jsx` files | 66 |
| CSS files | 11 | 7 | 18 |
| Orphaned (`*`) | 14 | 6 | 20 |
| >300 lines (`!`) | 8 | 0 | 8 |
| Deleted-dependency import | 0 | 1 | 1 |
