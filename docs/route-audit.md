# Route Audit Report — 2026-06-16

## Client App (client/src/pages/)

### Active Pages (imported and routed)

| Page | File Exists | Imported | Routed | Links |
|------|------------|----------|--------|-------|
| AccessRestricted | Yes | No | No | No |
| DailyReportOffset | Yes | No | No | No |
| DailyReportPDFExport | Yes | No | No | No |
| InternalTransfers | Yes | No | No | No |
| InventoryLayout | Yes | No | No | No |
| OfflineTestPage | Yes | No | No | No |
| PaperManagement | Yes | No | No | No |
| Payments | Yes | No | No | No |
| QRDiagnostic | Yes | No | No | No |
| RateCalculator | Yes | No | No | No |
| SummaryWidgets | Yes | No | No | No |
| AccountsLayout | Yes | No | No | No |
| AdminLayout | Yes | No | No | No |

### Deprecated Pages (have redirects)

| Page | File Exists | Redirect |
|------|------------|----------|
| Billing | Yes | `/dashboard/billing` -> `/dashboard/sales/invoices` (line 844 of Dashboard.jsx) |

---

## Website (website/src/pages/)

### Active Pages (imported and routed)

| Page | File Exists | Imported in App.jsx | Routed | Links |
|------|------------|-------------------|--------|-------|
| ArtworkUpload | Yes | No | No | No |
| BlogList | Yes | No | No | No |
| BlogPostDetail | Yes | No | No | No |
| Checkout | Yes | No | No | No |
| DesignBooking | Yes | No | No | No |
| PickupBooking | Yes | No | No | No |
| Portfolio | Yes | No | No | No |
| PricingPage | Yes | No | No | No |
| SampleRequest | Yes | No | No | No |
| EditorOnboarding | Yes | No | No | No |

### Active (imported and routed in App.jsx)
Home, Services, Products, TrackOrder, SignIn, PortalDashboard, JobDetail, Contact, NotFound (errors/), Privacy, Terms, DesignHub, PhotoSheetLayout, AlbumDesigner, FabricEditorHub, PrintEditor, UploadDesign

---

## Summary

### Client App
- **Total pages checked:** 14
- **Active:** 0
- **Orphaned (exist but unused):** 13 — AccessRestricted, AccountsLayout, AdminLayout, DailyReportOffset, DailyReportPDFExport, InternalTransfers, InventoryLayout, OfflineTestPage, PaperManagement, Payments, QRDiagnostic, RateCalculator, SummaryWidgets
- **Deprecated (redirect-only):** 1 — Billing

### Website
- **Total pages checked:** 10
- **Active:** 0
- **Orphaned (exist but unused):** 10 — ArtworkUpload, BlogList, BlogPostDetail, Checkout, DesignBooking, PickupBooking, Portfolio, PricingPage, SampleRequest, EditorOnboarding

### Grand Total
- **Total pages audited:** 24
- **Active:** 0
- **Orphaned:** 23
- **Deprecated:** 1
