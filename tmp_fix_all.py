import re, os

def fix_file_lines(filepath, fixes):
    """Apply line-specific fixes to a file. fixes is a list of (line_num, old_text, new_text)."""
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    modified = False
    for line_num, old_text, new_text in fixes:
        idx = line_num - 1
        if idx < len(lines):
            if old_text in lines[idx]:
                lines[idx] = lines[idx].replace(old_text, new_text, 1)
                modified = True
            else:
                print(f"  WARNING: Could not find '{old_text}' on line {line_num} of {filepath}")
    
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(lines)
    return modified

def fix_import_unused(filepath, import_name, import_line_content):
    """Remove a named import from an import line."""
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Try to remove the specific import from the line
    # Handle: import { a, b, c } from '...'
    # Handle: import { a as b } from '...'
    modified = False
    
    # Pattern: { a, b, c } where we want to remove one
    # Find the import line
    for line in content.split('\n'):
        if import_name in line and 'import' in line and 'from' in line:
            # Parse the imports
            m = re.search(r'\{([^}]+)\}', line)
            if m:
                imports = [s.strip() for s in m.group(1).split(',')]
                # Filter out the unused one
                new_imports = []
                for imp in imports:
                    # Check if this is the one to remove
                    imp_clean = imp.strip()
                    if imp_clean == import_name:
                        continue
                    # Handle 'as' aliases: check both parts
                    if ' as ' in imp_clean:
                        parts = imp_clean.split(' as ')
                        if parts[0].strip() == import_name or parts[1].strip() == import_name:
                            continue
                    new_imports.append(imp_clean)
                
                if len(new_imports) < len(imports):
                    new_import_str = ', '.join(new_imports)
                    old_line = line
                    new_line = line.replace(m.group(1), new_import_str)
                    content = content.replace(old_line, new_line, 1)
                    modified = True
                    break
    
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
    return modified

def prefix_var_in_line(filepath, line_num, var_name, prefix='_'):
    """Add prefix to a variable on a specific line."""
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    idx = line_num - 1
    if idx < len(lines):
        line = lines[idx]
        # Replace the variable with prefix, being careful not to replace substrings
        # Use word boundary
        new_line = re.sub(r'\b' + re.escape(var_name) + r'\b', prefix + var_name, line)
        if new_line != line:
            lines[idx] = new_line
            with open(filepath, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            return True
    return False

# ============================================================
# FIXES BY FILE
# ============================================================

fixes_count = 0

# 1. InventoryImage.jsx:21 - 'source' unused
fp = 'client/src/components/InventoryImage.jsx'
if prefix_var_in_line(fp, 21, 'source'):
    print(f"Fixed: {fp}:21 source")
    fixes_count += 1

# 2. InvoiceModal.jsx:127 - 'field' unused (function arg)
fp = 'client/src/components/InvoiceModal.jsx'
if prefix_var_in_line(fp, 127, 'field'):
    print(f"Fixed: {fp}:127 field")
    fixes_count += 1

# 3. MeterVerification.jsx:30,54 - 'error' unused in catch
fp = 'client/src/components/MeterVerification.jsx'
for ln in [30, 54]:
    if prefix_var_in_line(fp, ln, 'error'):
        print(f"Fixed: {fp}:{ln} error")
        fixes_count += 1

# 4. PaymentModal.jsx:78 - 'field' unused (function arg)
fp = 'client/src/components/PaymentModal.jsx'
if prefix_var_in_line(fp, 78, 'field'):
    print(f"Fixed: {fp}:78 field")
    fixes_count += 1

# 5. VendorDetail.jsx:21 - 'getStatusBadge' unused prop
fp = 'client/src/components/VendorDetail.jsx'
if prefix_var_in_line(fp, 21, 'getStatusBadge'):
    print(f"Fixed: {fp}:21 getStatusBadge")
    fixes_count += 1

# 6. VendorModal.jsx:2 - 'api' import unused
fp = 'client/src/components/VendorModal.jsx'
if fix_import_unused(fp, 'api', None):
    print(f"Fixed: {fp}:2 removed api import")
    fixes_count += 1

# 7. Vendors.jsx:3 - 'api' import unused
fp = 'client/src/components/Vendors.jsx'
if fix_import_unused(fp, 'api', None):
    print(f"Fixed: {fp}:3 removed api import")
    fixes_count += 1

# 8. Vendors.jsx:20 - 'navigate' unused
fp = 'client/src/components/Vendors.jsx'
if prefix_var_in_line(fp, 20, 'navigate'):
    print(f"Fixed: {fp}:20 navigate")
    fixes_count += 1

# 9. ShortcutModal.jsx:3 - 'toast' import unused
fp = 'client/src/components/quickbilling/ShortcutModal.jsx'
if fix_import_unused(fp, 'toast', None):
    print(f"Fixed: {fp}:3 removed toast import")
    fixes_count += 1

# 10. useApiRequest.js:3 - 'toast' import unused
fp = 'client/src/hooks/useApiRequest.js'
if fix_import_unused(fp, 'toast', None):
    print(f"Fixed: {fp}:3 removed toast import")
    fixes_count += 1

# 11. Billing.jsx:16 - 'formatCurrency' import unused
fp = 'client/src/pages/Billing.jsx'
if fix_import_unused(fp, 'formatCurrency', None):
    print(f"Fixed: {fp}:16 removed formatCurrency import")
    fixes_count += 1

# Billing.jsx many state vars - prefix all with _
billing_var_fixes = [
    (118, 'machines'),
    (120, 'selectedProduct'),
    (124, 'jobData'),
    (124, 'setJobData'),
    (125, 'showJobDetails'),
    (125, 'setShowJobDetails'),
    (126, 'showMachineDetails'),
    (126, 'setShowMachineDetails'),
    (134, 'scannerOpen'),
    (134, 'setScannerOpen'),
    (155, 'fieldErrors'),
    (155, 'setFieldErrors'),
    (163, 'lastOrderCustomerType'),
    (164, 'lastOrderAutoDelivered'),
    (237, 'isInternalBill'),
    (368, 'computeDiscTotal'),
    (572, 'removeLine'),
    (842, 'handleBack'),
]
for ln, var in billing_var_fixes:
    if prefix_var_in_line(fp, ln, var):
        print(f"Fixed: {fp}:{ln} {var}")
        fixes_count += 1

# Billing.jsx:818,851,1591 - matter_file, matter_preview args
for ln in [818, 851, 1591]:
    if prefix_var_in_line(fp, ln, 'matter_file'):
        print(f"Fixed: {fp}:{ln} matter_file")
        fixes_count += 1
    if prefix_var_in_line(fp, ln, 'matter_preview'):
        print(f"Fixed: {fp}:{ln} matter_preview")
        fixes_count += 1

# 28. Branches.jsx:53 - 'prevBranches' unused
fp = 'client/src/pages/Branches.jsx'
if prefix_var_in_line(fp, 53, 'prevBranches'):
    print(f"Fixed: {fp}:53 prevBranches")
    fixes_count += 1

# 29. ChangePassword.jsx:20 - 'navigate' unused
fp = 'client/src/pages/ChangePassword.jsx'
if prefix_var_in_line(fp, 20, 'navigate'):
    print(f"Fixed: {fp}:20 navigate")
    fixes_count += 1

# 30. ConsumablesManagement.jsx:203 - 'prevConsumables' unused
fp = 'client/src/pages/ConsumablesManagement.jsx'
if prefix_var_in_line(fp, 203, 'prevConsumables'):
    print(f"Fixed: {fp}:203 prevConsumables")
    fixes_count += 1

# 31. CustomerDetails.jsx:2 - 'useCallback' import unused
fp = 'client/src/pages/CustomerDetails.jsx'
if fix_import_unused(fp, 'useCallback', None):
    print(f"Fixed: {fp}:2 removed useCallback import")
    fixes_count += 1

# 32. CustomerDetails.jsx:3 - 'usePolling' import unused
if fix_import_unused(fp, 'usePolling', None):
    print(f"Fixed: {fp}:3 removed usePolling import")
    fixes_count += 1

# 33. CustomerDetails.jsx:17 - 'paymentReminderMessage' unused
if prefix_var_in_line(fp, 17, 'paymentReminderMessage'):
    print(f"Fixed: {fp}:17 paymentReminderMessage")
    fixes_count += 1

# 34. CustomerDetails.jsx:108 - 'setPaymentsLimit' unused
if prefix_var_in_line(fp, 108, 'setPaymentsLimit'):
    print(f"Fixed: {fp}:108 setPaymentsLimit")
    fixes_count += 1

# 35. CustomerDetails.jsx:752 - 'isPdf' unused
if prefix_var_in_line(fp, 752, 'isPdf'):
    print(f"Fixed: {fp}:752 isPdf")
    fixes_count += 1

# 36. Customers.jsx:696 - 'idx' unused arg
fp = 'client/src/pages/Customers.jsx'
if prefix_var_in_line(fp, 696, 'idx'):
    print(f"Fixed: {fp}:696 idx")
    fixes_count += 1

# 37. DailyReport.jsx:229 - 'formatDateDisplay' unused
fp = 'client/src/pages/DailyReport.jsx'
if prefix_var_in_line(fp, 229, 'formatDateDisplay'):
    print(f"Fixed: {fp}:229 formatDateDisplay")
    fixes_count += 1

# 38. DailyReport.jsx:604 - 'manualRefresh' unused
if prefix_var_in_line(fp, 604, 'manualRefresh'):
    print(f"Fixed: {fp}:604 manualRefresh")
    fixes_count += 1

# 39. DailyReport.jsx:1672 - 'idx' unused arg
if prefix_var_in_line(fp, 1672, 'idx'):
    print(f"Fixed: {fp}:1672 idx")
    fixes_count += 1

# 40. DailyReportOffset.jsx:378 - 'importCompletedJobs' unused
fp = 'client/src/pages/DailyReportOffset.jsx'
if prefix_var_in_line(fp, 378, 'importCompletedJobs'):
    print(f"Fixed: {fp}:378 importCompletedJobs")
    fixes_count += 1

# 41. Dashboard.jsx:10 - 'imgUrl' import unused
fp = 'client/src/pages/Dashboard.jsx'
if fix_import_unused(fp, 'imgUrl', None):
    print(f"Fixed: {fp}:10 removed imgUrl import")
    fixes_count += 1

# 42. Dashboard.jsx:362 - 'resolvedTheme' unused
if prefix_var_in_line(fp, 362, 'resolvedTheme'):
    print(f"Fixed: {fp}:362 resolvedTheme")
    fixes_count += 1

# 43. Dashboard.jsx:941 - 'handleCropCancel' unused
if prefix_var_in_line(fp, 941, 'handleCropCancel'):
    print(f"Fixed: {fp}:941 handleCropCancel")
    fixes_count += 1

# 44. DesignerDashboard.jsx:34 - 'retryCount' unused
fp = 'client/src/pages/DesignerDashboard.jsx'
if prefix_var_in_line(fp, 34, 'retryCount'):
    print(f"Fixed: {fp}:34 retryCount")
    fixes_count += 1

# 45. EmployeeDetail.jsx:2 - 'useCallback' import unused
fp = 'client/src/pages/EmployeeDetail.jsx'
if fix_import_unused(fp, 'useCallback', None):
    print(f"Fixed: {fp}:2 removed useCallback import")
    fixes_count += 1

# 46-49. EmployeeDetail.jsx - todayInTime, todayOutTime
for ln in [259, 260, 288, 289]:
    if prefix_var_in_line(fp, ln, 'todayInTime'):
        print(f"Fixed: {fp}:{ln} todayInTime")
        fixes_count += 1
    if prefix_var_in_line(fp, ln, 'todayOutTime'):
        print(f"Fixed: {fp}:{ln} todayOutTime")
        fixes_count += 1

# 50. ExpenseManager.jsx:13 - 'fmt', 'fmtDate' import unused
fp = 'client/src/pages/ExpenseManager.jsx'
if fix_import_unused(fp, 'fmt', None):
    print(f"Fixed: {fp}:13 removed fmt import")
    fixes_count += 1
if fix_import_unused(fp, 'fmtDate', None):
    print(f"Fixed: {fp}:13 removed fmtDate import")
    fixes_count += 1

# 51. InternalTransfers.jsx:45 - 'watch' unused
fp = 'client/src/pages/InternalTransfers.jsx'
if prefix_var_in_line(fp, 45, 'watch'):
    print(f"Fixed: {fp}:45 watch")
    fixes_count += 1

# 52. Inventory.jsx:5 - 'useAuth' import unused
fp = 'client/src/pages/Inventory.jsx'
if fix_import_unused(fp, 'useAuth', None):
    print(f"Fixed: {fp}:5 removed useAuth import")
    fixes_count += 1

# 53. JobDetail.jsx:3 - 'usePolling' import unused
fp = 'client/src/pages/JobDetail.jsx'
if fix_import_unused(fp, 'usePolling', None):
    print(f"Fixed: {fp}:3 removed usePolling import")
    fixes_count += 1

# 54. JobDetail.jsx:55,124,137 - 'Icon' unused arg
for ln in [55, 124, 137]:
    if prefix_var_in_line(fp, ln, 'Icon'):
        print(f"Fixed: {fp}:{ln} Icon")
        fixes_count += 1

# 55. JobDetail.jsx:178 - 'branchUpiId', 'setBranchUpiId'
if prefix_var_in_line(fp, 178, 'branchUpiId'):
    print(f"Fixed: {fp}:178 branchUpiId")
    fixes_count += 1
if prefix_var_in_line(fp, 178, 'setBranchUpiId'):
    print(f"Fixed: {fp}:178 setBranchUpiId")
    fixes_count += 1

# 56. JobDetail.jsx:703 - 'payColor' unused
if prefix_var_in_line(fp, 703, 'payColor'):
    print(f"Fixed: {fp}:703 payColor")
    fixes_count += 1

# 57. Jobs.jsx:3 - 'usePolling' import unused
fp = 'client/src/pages/Jobs.jsx'
if fix_import_unused(fp, 'usePolling', None):
    print(f"Fixed: {fp}:3 removed usePolling import")
    fixes_count += 1

# 58. Jobs.jsx:16 - 'formatCurrency' import unused
if fix_import_unused(fp, 'formatCurrency', None):
    print(f"Fixed: {fp}:16 removed formatCurrency import")
    fixes_count += 1

# 59-69. Jobs.jsx various vars
jobs_var_fixes = [
    (61, 'formatRupee'),
    (63, 'getStatusColor'),
    (75, 'canManageOrderStatus'),
    (76, 'canDeleteOrder'),
    (131, 'setActiveTab'),
    (152, 'searchQuery'),
    (153, 'statusFilter'),
    (154, 'branchFilter'),
    (218, 'toggleExpandedPayment'),
    (409, 'visibleRenderItems'),
    (577, 'totalCols'),
]
for ln, var in jobs_var_fixes:
    if prefix_var_in_line(fp, ln, var):
        print(f"Fixed: {fp}:{ln} {var}")
        fixes_count += 1

# 70. MachineManagement.jsx:16 - 'formatCurrency' import unused
fp = 'client/src/pages/MachineManagement.jsx'
if fix_import_unused(fp, 'formatCurrency', None):
    print(f"Fixed: {fp}:16 removed formatCurrency import")
    fixes_count += 1

# 71. MachineManagement.jsx:188 - '_' unused in destructuring
# Need to replace _ with __ or remove it
fp = 'client/src/pages/MachineManagement.jsx'
with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()
idx = 188 - 1
if idx < len(lines):
    line = lines[idx]
    # Replace , _ ) or , _} with just ) or }
    # Or replace _ with _unused
    if ', _)' in line:
        lines[idx] = line.replace(', _)', ')')
        with open(fp, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f"Fixed: {fp}:188 removed unused _ from destructuring")
        fixes_count += 1
    elif ', _ }' in line or ', _}' in line:
        lines[idx] = line.replace(', _ }', ' }').replace(', _}', '}')
        with open(fp, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f"Fixed: {fp}:188 removed unused _ from destructuring")
        fixes_count += 1
    else:
        # Try other patterns
        new_line = re.sub(r',\s*_\s*[,})]', lambda m: m.group(0).replace('_', '_unused'), line)
        if new_line != line:
            lines[idx] = new_line
            with open(fp, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            print(f"Fixed: {fp}:188 renamed unused _ to _unused")
            fixes_count += 1
        else:
            print(f"  WARNING: Could not fix {fp}:188 _")

# 72. MachineManagement.jsx:276 - 'prevMachines' unused
if prefix_var_in_line(fp, 276, 'prevMachines'):
    print(f"Fixed: {fp}:276 prevMachines")
    fixes_count += 1

# 73. OtherStaffDashboard.jsx:34 - 'retryCount' unused
fp = 'client/src/pages/OtherStaffDashboard.jsx'
if prefix_var_in_line(fp, 34, 'retryCount'):
    print(f"Fixed: {fp}:34 retryCount")
    fixes_count += 1

# 74. PlateManagement.jsx:6 - 'findBestPlateSize' import unused
fp = 'client/src/pages/PlateManagement.jsx'
if fix_import_unused(fp, 'findBestPlateSize', None):
    print(f"Fixed: {fp}:6 removed findBestPlateSize import")
    fixes_count += 1

# 75-79. PlateManagement.jsx vars
pm_var_fixes = [
    (34, 'autoOptimize'),
    (34, 'setAutoOptimize'),
    (189, 'filteredJobs'),
    (486, 'idx'),
    (487, 'scale'),
]
for ln, var in pm_var_fixes:
    if prefix_var_in_line(fp, ln, var):
        print(f"Fixed: {fp}:{ln} {var}")
        fixes_count += 1

# 80. PrinterDashboard.jsx:34 - 'retryCount' unused
fp = 'client/src/pages/PrinterDashboard.jsx'
if prefix_var_in_line(fp, 34, 'retryCount'):
    print(f"Fixed: {fp}:34 retryCount")
    fixes_count += 1

# 81. ProductLibrary.jsx:23 - 'verticalListSortingStrategy' import unused
fp = 'client/src/pages/ProductLibrary.jsx'
if fix_import_unused(fp, 'verticalListSortingStrategy', None):
    print(f"Fixed: {fp}:23 removed verticalListSortingStrategy import")
    fixes_count += 1

# 82-86. ProductLibrary.jsx vars
pl_var_fixes = [
    (32, 'index'),
    (89, 'filterVendorRef'),
    (90, 'filterCalcTypeRef'),
    (119, 'savingOrder'),
    (375, 'toggleSub'),
    (516, 'currentProduct'),
]
for ln, var in pl_var_fixes:
    if prefix_var_in_line(fp, ln, var):
        print(f"Fixed: {fp}:{ln} {var}")
        fixes_count += 1

# 87. Quotes.jsx:2 - 'useRef' import unused
fp = 'client/src/pages/Quotes.jsx'
if fix_import_unused(fp, 'useRef', None):
    print(f"Fixed: {fp}:2 removed useRef import")
    fixes_count += 1

# 88. Requests.jsx:16-18 - unused vars
fp = 'client/src/pages/Requests.jsx'
for ln, var in [(16, 'idRequests'), (17, 'customerRequests'), (18, 'vendorRequests')]:
    if prefix_var_in_line(fp, ln, var):
        print(f"Fixed: {fp}:{ln} {var}")
        fixes_count += 1

# 89. SalesPrediction.jsx:170,328,806
fp = 'client/src/pages/SalesPrediction.jsx'
if prefix_var_in_line(fp, 170, 'index'):
    print(f"Fixed: {fp}:170 index")
    fixes_count += 1
if prefix_var_in_line(fp, 328, 'paginatedStockRecommendations'):
    print(f"Fixed: {fp}:328 paginatedStockRecommendations")
    fixes_count += 1
if prefix_var_in_line(fp, 806, 'arr'):
    print(f"Fixed: {fp}:806 arr")
    fixes_count += 1

# 90. ScanItem.jsx:552 - 'Icon' unused arg
fp = 'client/src/pages/ScanItem.jsx'
if prefix_var_in_line(fp, 552, 'Icon'):
    print(f"Fixed: {fp}:552 Icon")
    fixes_count += 1

# 91. ScheduleManagement.jsx:2 - 'useMemo' import unused
fp = 'client/src/pages/ScheduleManagement.jsx'
if fix_import_unused(fp, 'useMemo', None):
    print(f"Fixed: {fp}:2 removed useMemo import")
    fixes_count += 1

# 92. SettingsPage.jsx:2 - 'useCallback' import unused
fp = 'client/src/pages/SettingsPage.jsx'
if fix_import_unused(fp, 'useCallback', None):
    print(f"Fixed: {fp}:2 removed useCallback import")
    fixes_count += 1

# 93. ShortcutsPage.jsx:31 - 'loadingSuggestions' unused
fp = 'client/src/pages/ShortcutsPage.jsx'
if prefix_var_in_line(fp, 31, 'loadingSuggestions'):
    print(f"Fixed: {fp}:31 loadingSuggestions")
    fixes_count += 1

# 94-95. StaffManagement.jsx:15,16 - 'telHref', 'validatePhone' unused
fp = 'client/src/pages/StaffManagement.jsx'
if prefix_var_in_line(fp, 15, 'telHref'):
    print(f"Fixed: {fp}:15 telHref")
    fixes_count += 1
if prefix_var_in_line(fp, 16, 'validatePhone'):
    print(f"Fixed: {fp}:16 validatePhone")
    fixes_count += 1

# 96. StaffManagement.jsx:180 - 'error' unused
if prefix_var_in_line(fp, 180, 'error'):
    print(f"Fixed: {fp}:180 error")
    fixes_count += 1

# 97. StockVerification.jsx:14 - 'user' unused
fp = 'client/src/pages/StockVerification.jsx'
if prefix_var_in_line(fp, 14, 'user'):
    print(f"Fixed: {fp}:14 user")
    fixes_count += 1

# 98-100. Summary.jsx - various
fp = 'client/src/pages/Summary.jsx'
if prefix_var_in_line(fp, 20, 'Icon'):
    print(f"Fixed: {fp}:20 Icon")
    fixes_count += 1
if prefix_var_in_line(fp, 37, 'Icon'):
    print(f"Fixed: {fp}:37 Icon")
    fixes_count += 1
if prefix_var_in_line(fp, 123, 'topCustomers'):
    print(f"Fixed: {fp}:123 topCustomers")
    fixes_count += 1
if prefix_var_in_line(fp, 124, 'staffProd'):
    print(f"Fixed: {fp}:124 staffProd")
    fixes_count += 1

# 101. UploadBills.jsx - various
fp = 'client/src/pages/UploadBills.jsx'
if prefix_var_in_line(fp, 50, 'currentPreviewIndex'):
    print(f"Fixed: {fp}:50 currentPreviewIndex")
    fixes_count += 1
if prefix_var_in_line(fp, 50, 'setCurrentPreviewIndex'):
    print(f"Fixed: {fp}:50 setCurrentPreviewIndex")
    fixes_count += 1
if prefix_var_in_line(fp, 57, 'isCameraActive'):
    print(f"Fixed: {fp}:57 isCameraActive")
    fixes_count += 1
if prefix_var_in_line(fp, 74, 'categories'):
    print(f"Fixed: {fp}:74 categories")
    fixes_count += 1
if prefix_var_in_line(fp, 431, 'amount'):
    print(f"Fixed: {fp}:431 amount")
    fixes_count += 1
if prefix_var_in_line(fp, 438, 'total'):
    print(f"Fixed: {fp}:438 total")
    fixes_count += 1

# 102. WebInquiries.jsx - various
fp = 'client/src/pages/WebInquiries.jsx'
if fix_import_unused(fp, 'useSEO', None):
    print(f"Fixed: {fp}:1 removed useSEO import")
    fixes_count += 1
if prefix_var_in_line(fp, 62, 'error'):
    print(f"Fixed: {fp}:62 error")
    fixes_count += 1
if prefix_var_in_line(fp, 76, 'subject'):
    print(f"Fixed: {fp}:76 subject")
    fixes_count += 1

# 103. DeliveryRulesManager.jsx:1 - 'useMemo' import unused
fp = 'client/src/pages/admin/DeliveryRulesManager.jsx'
if fix_import_unused(fp, 'useMemo', None):
    print(f"Fixed: {fp}:1 removed useMemo import")
    fixes_count += 1

# 104. PortfolioManager.jsx:1 - 'useMemo' import unused
fp = 'client/src/pages/admin/PortfolioManager.jsx'
if fix_import_unused(fp, 'useMemo', None):
    print(f"Fixed: {fp}:1 removed useMemo import")
    fixes_count += 1

# 105. PortfolioManager.jsx:87 - 'res' unused
if prefix_var_in_line(fp, 87, 'res'):
    print(f"Fixed: {fp}:87 res")
    fixes_count += 1

# 106-108. ReviewsManagement.jsx:66,82,92 - '_e' unused (catch blocks)
fp = 'client/src/pages/admin/ReviewsManagement.jsx'
for ln in [66, 82, 92]:
    # Remove the variable from catch
    with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    idx = ln - 1
    if idx < len(lines):
        line = lines[idx]
        if 'catch (_e)' in line:
            lines[idx] = line.replace('catch (_e)', 'catch')
            with open(fp, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            print(f"Fixed: {fp}:{ln} catch (_e) -> catch")
            fixes_count += 1

# 109. designer/ProductLibrary.jsx:62 - 'copyToClipboard' unused
fp = 'client/src/pages/designer/ProductLibrary.jsx'
if prefix_var_in_line(fp, 62, 'copyToClipboard'):
    print(f"Fixed: {fp}:62 copyToClipboard")
    fixes_count += 1

# 110-111. expense-manager/PaymentModal.jsx:36,64 - '_err' unused
fp = 'client/src/pages/expense-manager/PaymentModal.jsx'
for ln in [36, 64]:
    with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    idx = ln - 1
    if idx < len(lines):
        line = lines[idx]
        if 'catch (_err)' in line:
            lines[idx] = line.replace('catch (_err)', 'catch')
            with open(fp, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            print(f"Fixed: {fp}:{ln} catch (_err) -> catch")
            fixes_count += 1

# 112. VendorsTab.jsx - multiple _err and _e catches
fp = 'client/src/pages/expense-manager/VendorsTab.jsx'
with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()
for ln in [209, 218, 259, 527, 613]:
    idx = ln - 1
    if idx < len(lines):
        line = lines[idx]
        if 'catch (_err)' in line:
            lines[idx] = line.replace('catch (_err)', 'catch')
            print(f"Fixed: {fp}:{ln} catch (_err) -> catch")
            fixes_count += 1
for ln in [614, 617, 836]:
    idx = ln - 1
    if idx < len(lines):
        line = lines[idx]
        if 'catch (_e)' in line:
            lines[idx] = line.replace('catch (_e)', 'catch')
            print(f"Fixed: {fp}:{ln} catch (_e) -> catch")
            fixes_count += 1
with open(fp, 'w', encoding='utf-8') as f:
    f.writelines(lines)

# Also fix _e in the catch blocks at line 259 - might be catch (_e) with inline code
# Let me re-read to check
with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()
if 'catch (_e)' in content:
    content = content.replace('catch (_e)', 'catch')
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed: {fp} remaining catch (_e) -> catch")

# 113. HomePage.jsx:19,127 - '_e' unused
fp = 'client/src/pages/public/HomePage.jsx'
with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()
if 'catch (_e)' in content:
    content = content.replace('catch (_e)', 'catch')
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed: {fp} catch (_e) -> catch")
    fixes_count += 1

# VendorsTab.jsx line 259 also has _e
fp2 = 'client/src/pages/expense-manager/VendorsTab.jsx'
with open(fp2, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()
if 'catch (_e)' in content:
    content = content.replace('catch (_e)', 'catch')
    with open(fp2, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed: {fp2} remaining catch (_e) -> catch")

print(f"\nTotal fixes applied: {fixes_count}")
