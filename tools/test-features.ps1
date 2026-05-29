# ==================  COMPREHENSIVE FEATURE TESTING  ==================

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           TESTING ALL KEY APPLICATION FEATURES                ║" -ForegroundColor Cyan  
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

$baseUrl = "http://localhost:5000"
$timeoutSec = 5

# ===== 1. TEST LOGIN FOR ALL ROLES =====
Write-Host "`n📋 [TEST 1] LOGIN - All Roles" -ForegroundColor Yellow

# Test Admin login
try {
  $adminLoginBody = @{
    userId = "9876543210"
    password = "admin123"
  } | ConvertTo-Json
  $resp = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body $adminLoginBody -ContentType "application/json" -UseBasicParsing -TimeoutSec $timeoutSec -ErrorAction Stop
  $data = $resp.Content | ConvertFrom-Json
  if ($data.user.role -eq "Admin") {
    Write-Host "  ✅ Admin login works - Role: " $data.user.role -ForegroundColor Green
    $adminToken = $data.token
  } else {
    Write-Host "  ❌ Admin login failed - Role not Admin" -ForegroundColor Red
  }
} catch {
  Write-Host "  ❌ Admin login error: " $_.Exception.Message -ForegroundColor Red
}

# Test Front Office
try {
  $foLoginBody = @{
    userId = "5555555555"
    password = "FO@1234"
  } | ConvertTo-Json
  $resp = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body $foLoginBody -ContentType "application/json" -UseBasicParsing -TimeoutSec $timeoutSec -ErrorAction Stop
  $data = $resp.Content | ConvertFrom-Json
  if ($data.user.role -eq "Front Office") {
    Write-Host "  ✅ Front Office login works - Role: " $data.user.role -ForegroundColor Green
    $foToken = $data.token
  } else {
    Write-Host "  ❌ Front Office login failed" -ForegroundColor Red
  }
} catch {
  Write-Host "  ❌ Front Office login error: " $_.Exception.Message -ForegroundColor Red
}

# Test Designer
try {
  $dsgnLoginBody = @{
    userId = "4444444444"
    password = "DSGN@1234"
  } | ConvertTo-Json
  $resp = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body $dsgnLoginBody -ContentType "application/json" -UseBasicParsing -TimeoutSec $timeoutSec -ErrorAction Stop
  $data = $resp.Content | ConvertFrom-Json
  if ($data.user.role -eq "Designer") {
    Write-Host "  ✅ Designer login works - Role: " $data.user.role -ForegroundColor Green
    $designerToken = $data.token
  } else {
    Write-Host "  ❌ Designer login failed" -ForegroundColor Red
  }
} catch {
  Write-Host "  ❌ Designer login error: " $_.Exception.Message -ForegroundColor Red
}

# Test Printer
try {
  $printerLoginBody = @{
    userId = "3333333333"
    password = "PRNT@1234"
  } | ConvertTo-Json
  $resp = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body $printerLoginBody -ContentType "application/json" -UseBasicParsing -TimeoutSec $timeoutSec -ErrorAction Stop
  $data = $resp.Content | ConvertFrom-Json
  if ($data.user.role -eq "Printer") {
    Write-Host "  ✅ Printer login works - Role: " $data.user.role -ForegroundColor Green
    $printerToken = $data.token
  } else {
    Write-Host "  ❌ Printer login failed" -ForegroundColor Red
  }
} catch {
  Write-Host "  ❌ Printer login error: " $_.Exception.Message -ForegroundColor Red
}

# ===== 2. TEST CREATE JOB =====
Write-Host "`n📋 [TEST 2] CREATE JOB WITH BILLING" -ForegroundColor Yellow

if ($adminToken) {
  try {
    $jobBody = @{
      customer_id = 1
      type = "Flexography"
      description = "Test Job for Feature Testing"
      quantity = 100
      billing_amount = 5000
      status = "Pending"
    } | ConvertTo-Json
    
    $resp = Invoke-WebRequest -Uri "$baseUrl/api/jobs" -Method POST -Body $jobBody `
      -ContentType "application/json" -UseBasicParsing -TimeoutSec $timeoutSec `
      -Headers @{"Authorization" = "Bearer $adminToken"} -ErrorAction Stop
    $jobData = $resp.Content | ConvertFrom-Json
    Write-Host "  ✅ Job created - ID: " $jobData.id -ForegroundColor Green
    Write-Host "     - Amount: " $jobData.billing_amount -ForegroundColor Gray
    $jobId = $jobData.id
  } catch {
    Write-Host "  ❌ Job creation error: " $_.Exception.Message -ForegroundColor Red
  }
}

# ===== 3. TEST TAKE PAYMENT =====
Write-Host "`n📋 [TEST 3] TAKE PAYMENT FOR JOB" -ForegroundColor Yellow

if ($adminToken -and $jobId) {
  try {
    $paymentBody = @{
      customer_id = 1
      amount = 5000
      type = "Cash"
      reference_id = $jobId
      notes = "Payment for job $jobId"
    } | ConvertTo-Json
    
    $resp = Invoke-WebRequest -Uri "$baseUrl/api/customer-payments" -Method POST -Body $paymentBody `
      -ContentType "application/json" -UseBasicParsing -TimeoutSec $timeoutSec `
      -Headers @{"Authorization" = "Bearer $adminToken"} -ErrorAction Stop
    $paymentData = $resp.Content | ConvertFrom-Json
    Write-Host "  ✅ Payment recorded - ID: " $paymentData.id -ForegroundColor Green
    Write-Host "     - Amount: " $paymentData.amount -ForegroundColor Gray
  } catch {
    Write-Host "  ❌ Payment error: " $_.Exception.Message -ForegroundColor Red
  }
}

# ===== 4. TEST GET CUSTOMER DETAILS =====
Write-Host "`n📋 [TEST 4] CUSTOMER DETAILS AFTER PAYMENT" -ForegroundColor Yellow

if ($adminToken) {
  try {
    $resp = Invoke-WebRequest -Uri "$baseUrl/api/customers/1" -Method GET `
      -UseBasicParsing -TimeoutSec $timeoutSec `
      -Headers @{"Authorization" = "Bearer $adminToken"} -ErrorAction Stop
    $custData = $resp.Content | ConvertFrom-Json
    Write-Host "  ✅ Customer retrieved" -ForegroundColor Green
    Write-Host "     - ID: " $custData.id -ForegroundColor Gray
    Write-Host "     - Name: " $custData.name -ForegroundColor Gray
    if ($custData.total_paid) {
      Write-Host "     - Total Paid: " $custData.total_paid -ForegroundColor Gray
    }
  } catch {
    Write-Host "  ❌ Customer retrieval error: " $_.Exception.Message -ForegroundColor Red
  }
}

# ===== 5. TEST ADD EXPENSE =====
Write-Host "`n📋 [TEST 5] ADD EXPENSE" -ForegroundColor Yellow

if ($foToken) {
  try {
    $expenseBody = @{
      amount = 500
      category = "Supplies"
      description = "Office Supplies Test"
      bill_photo = ""
    } | ConvertTo-Json
    
    $resp = Invoke-WebRequest -Uri "$baseUrl/api/office-expenses" -Method POST -Body $expenseBody `
      -ContentType "application/json" -UseBasicParsing -TimeoutSec $timeoutSec `
      -Headers @{"Authorization" = "Bearer $foToken"} -ErrorAction Stop
    $expenseData = $resp.Content | ConvertFrom-Json
    Write-Host "  ✅ Expense added - ID: " $expenseData.id -ForegroundColor Green
    Write-Host "     - Amount: " $expenseData.amount -ForegroundColor Gray
  } catch {
    Write-Host "  ❌ Expense error: " $_.Exception.Message -ForegroundColor Red
  }
}

# ===== 6. TEST STAFF SALARY PAYMENT =====
Write-Host "`n📋 [TEST 6] RECORD SALARY PAYMENT" -ForegroundColor Yellow

if ($adminToken) {
  try {
    $now = Get-Date
    $salaryBody = @{
      staff_id = 1
      amount = 15000
      month = $now.AddMonths(-1).ToString('yyyy-MM')
      paid_via = "Bank Transfer"
      reference = "TEST-SAL-$(Get-Random)"
    } | ConvertTo-Json
    
    $resp = Invoke-WebRequest -Uri "$baseUrl/api/payments" -Method POST -Body $salaryBody `
      -ContentType "application/json" -UseBasicParsing -TimeoutSec $timeoutSec `
      -Headers @{"Authorization" = "Bearer $adminToken"} -ErrorAction Stop
    $salaryData = $resp.Content | ConvertFrom-Json
    Write-Host "  ✅ Salary payment recorded - ID: " $salaryData.id -ForegroundColor Green
    Write-Host "     - Amount: " $salaryData.amount -ForegroundColor Gray
  } catch {
    Write-Host "  ❌ Salary payment error: " $_.Exception.Message -ForegroundColor Red
  }
}

# ===== 7. TEST MARK ATTENDANCE =====
Write-Host "`n📋 [TEST 7] MARK ATTENDANCE" -ForegroundColor Yellow

if ($foToken) {
  try {
    $now = Get-Date
    $attendanceBody = @{
      staff_id = 2
      date = $now.ToString('yyyy-MM-dd')
      status = "Present"
      check_in = $now.ToString('HH:mm:ss')
      check_out = $now.AddHours(8).ToString('HH:mm:ss')
    } | ConvertTo-Json
    
    $resp = Invoke-WebRequest -Uri "$baseUrl/api/attendance" -Method POST -Body $attendanceBody `
      -ContentType "application/json" -UseBasicParsing -TimeoutSec $timeoutSec `
      -Headers @{"Authorization" = "Bearer $foToken"} -ErrorAction Stop
    $attData = $resp.Content | ConvertFrom-Json
    Write-Host "  ✅ Attendance marked - ID: " $attData.id -ForegroundColor Green
    Write-Host "     - Date: " $attData.date -ForegroundColor Gray
    Write-Host "     - Status: " $attData.status -ForegroundColor Gray
  } catch {
    Write-Host "  ❌ Attendance error: " $_.Exception.Message -ForegroundColor Red
  }
}

# ===== 8. TEST DAILY REPORT =====
Write-Host "`n📋 [TEST 8] DAILY REPORT" -ForegroundColor Yellow

if ($adminToken) {
  try {
    $now = Get-Date
    $dateStr = $now.ToString('yyyy-MM-dd')
    $resp = Invoke-WebRequest -Uri "$baseUrl/api/daily-report?date=$dateStr" -Method GET `
      -UseBasicParsing -TimeoutSec $timeoutSec `
      -Headers @{"Authorization" = "Bearer $adminToken"} -ErrorAction Stop
    $reportData = $resp.Content | ConvertFrom-Json
    Write-Host "  ✅ Daily report retrieved" -ForegroundColor Green
    Write-Host "     - Date: " $reportData.date -ForegroundColor Gray
    Write-Host "     - Total Revenue: " $reportData.total_revenue -ForegroundColor Gray
    Write-Host "     - Total Expenses: " $reportData.total_expenses -ForegroundColor Gray
  } catch {
    Write-Host "  ❌ Daily report error: " $_.Exception.Message -ForegroundColor Red
  }
}

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         ✅ ALL TESTS COMPLETED - CHECK RESULTS ABOVE          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
