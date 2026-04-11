> Master Context: [SARGA_WORK_CONTEXT.md](SARGA_WORK_CONTEXT.md)
> Source of truth for project state, architecture, and workflow decisions.

# MPR (Multifunction Printer) Integration Guide

## Overview
This system allows you to integrate meter count data from Bizhub multifunction printers (and similar devices) directly into your Sarga software. It automatically fetches actual print counts from the machine and compares them with manual entries to detect discrepancies.

## Features

### 1. **Automatic Meter Data Fetching**
- Fetches total print counts, black prints, and color prints from the MPR web interface
- Works with Bizhub C226i and similar models
- Tests connectivity to machine IP address

### 2. **Count Verification & Mismatch Detection**
- Compares manual opening count entered by staff with actual machine meter
- Detects variance in counts (percentage and absolute)
- Flags mismatches for admin review

### 3. **Daily Change Tracking**
- Compares daily print changes between actual meter and expected count
- Tracks if yesterday's closing count matches today's opening
- Identifies discrepancies in daily usage patterns

### 4. **Automatic Alert Generation**
- Creates mismatch requests automatically when counts don't match
- Admin can approve or reject entries
- Full audit trail of all verifications

## Setup Instructions

### Step 1: Configure Machine IP Address
1. Go to **Machine Management** → Select a machine → Click **Edit**
2. Add the **IP Address** of the Bizhub machine (e.g., `192.168.1.53`)
3. Save the machine configuration

**Note**: The machine must be on the same network and have a web interface accessible at `http://{ip_address}/wcd/spa_main.html`

### Step 2: Access Meter Verification
1. Go to **Machine Management**
2. Select a machine with configured IP address
3. Click the **"MPR Verification"** tab
4. You'll see:
   - Current meter reading from the machine
   - Manual opening count entry field
   - Verification history

### Step 3: Verify Daily Opening Counts

**For Admin Staff:**
1. In the morning, navigate to the machine in **MachineManagement** → **MPR Verification** tab
2. Click **"Fetch Meter Data from Machine"** to get current count
3. Enter the **Manual Opening Count**
4. Click **"Verify Count"**
5. System will compare and show if there's a mismatch

**What the System Does:**
- ✅ **Match**: Green confirmation - no action needed
- ⚠️ **Mismatch**: Yellow warning - creates a count request for review
- Shows variance (difference) between expected and actual
- Calculates daily change comparison

## Understanding the Results

### When Counts Match
```
✅ Count matches machine meter!
Manual Entry: 10,500
Actual Meter: 10,500
Status: Verified
```

### When There's a Mismatch
```
⚠️ Mismatch Detected!
Expected Count: 10,500
Actual Count: 10,530
Variance: 30 (0.29%)
Message: Machine count is 30 higher than entered
```

## Workflow for Morning Verification

### Standard Process:
1. **Front Desk Staff**: Enters opening meter count manually
2. **Admin**: 
   - Takes screenshot from MPR web interface OR
   - Uses "Fetch Meter Data" button in software
3. **Comparison**: System automatically compares both values
4. **Resolution**:
   - If Match: Continue normal operations
   - If Mismatch: Admin reviews and takes action

### Handling Mismatches:
1. Check physical meter on machine
2. Verify manual entry was correct
3. In **Count Requests** tab:
   - **Approve**: Accept the staff's count (they were right)
   - **Reject**: Use the machine's count (staff made error)
4. System updates opening count accordingly

## API Endpoints (For Integration)

### Get MPR Meter Data
```
GET /machines/{machineId}/mpr-meter-data
Response: { meter_data: { total_prints, black_prints, color_prints, ... } }
```

### Verify Count
```
POST /machines/{machineId}/verify-count
Body: { manual_opening_count: 10500 }
Response: { comparison_result: { has_mismatch, variance, ... } }
```

### Comparison History
```
GET /machines/{machineId}/meter-comparison?page=1&limit=30
Response: { comparisons: [...], total_mismatches, ... }
```

## Machine IP Configuration

### How to Find Your Machine's IP:
1. **On Machine Panel**:
   - Press Menu → Network Settings
   - Look for "IP Address" or "Ethernet IP"
   - Usually format: `192.168.x.x`

2. **Via DHCP/Router**:
   - Check your router's connected devices
   - Look for device name like "Bizhub-C226i"
   - Note its assigned IP

3. **Via DNS/Hostname**:
   - Try: `http://bizhub-c226i.local:80/wcd/spa_main.html`
   - Or: `http://bizhub.local:80/wcd/spa_main.html`

### Testing Connection:
1. Before using in software, test:
   ```
   http://{machine_ip}/wcd/spa_main.html
   ```
2. You should see the machine's web interface with meter readings

## Troubleshooting

### "Machine IP address not configured" error
- Go to **Machine Management** → Edit machine
- Add IP address in the `ip_address` field
- Save and try again

### "Failed to fetch meter data" error
- Check machine is powered on and connected to network
- Verify IP address is correct
- Test pinging machine: `ping 192.168.1.53`
- Check if web interface is accessible: `http://192.168.1.53`
- Ensure machine's web interface is not behind authentication

### Meter data shows "N/A"
- Web interface fetch succeeded but couldn't parse meter data
- Machine may use different webpage format
- Contact support with machine model number

### Counts consistently off by same amount
- May indicate software-controlled offset setting on machine
- Check machine's Output/Finishing settings
- Review if machine has waste/test copies

## Important Notes

1. **Data Accuracy**: This system compares actual machine counts with manual entries - it doesn't modify machine counters
2. **Timing**: Fetch meter data just before staff enters opening count for best accuracy
3. **Multiple Machines**: Configure IP for each machine you want to monitor
4. **Network Access**: Machine must be accessible from server over network
5. **No Remote Reset**: System cannot remotely reset machine counters - use machine's UI for that

## Advanced: Multiple Machine Models

The system includes generic printer support for other MFP models:
- Xerox machines
- Canon imageRUNNER
- HP LaserJet MFP
- Ricoh MP series

If you have a different printer model, please provide:
- Machine model number
- Network IP address
- Screenshot of meter data page
- URL path to meter/counter data

We can add support for additional models.

## Support & Configuration

For setting up or troubleshooting:
1. Verify machine is on network and has IP address assigned
2. Test accessing `http://{ip}/wcd/spa_main.html` from your browser
3. Provide machine model and screenshot of meter display
4. Share any error messages from the software

---

**Last Updated**: April 2026
**Version**: 1.0
**Status**: Production Ready
