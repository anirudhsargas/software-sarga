const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'client/src/pages');

// Files to update (relative to baseDir)
const filesToUpdate = [
  'OtherStaffDashboard.jsx',
  'admin/PickupBookings.jsx',
  'AccountantDashboard.jsx',
  'Accounts.jsx',
  'Branches.jsx',
  'CCTVAttendance.jsx',
  'CCTVManagement.jsx',
  'PaperMovementHistory.jsx',
  'PaperStockDashboard.jsx',
  'DailyReportPDFExport.jsx',
  'WebInquiries.jsx',
  'SampleRequestsCMS.jsx',
  'Requests.jsx'
];

function processFile(relPath) {
  const filePath = path.join(baseDir, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Find all <select ...> tags
  const selectBlocks = [];
  let currentIndex = 0;
  
  while (true) {
    const startIdx = content.indexOf('<select', currentIndex);
    if (startIdx === -1) break;
    
    const endIdx = content.indexOf('</select>', startIdx);
    if (endIdx === -1) break; // malformed?
    
    const block = content.substring(startIdx, endIdx + 9);
    
    // Check if it's a branch select
    if (block.toLowerCase().includes('branch')) {
      const newBlock = block.replace(/^<select/, '<BranchSelect').replace(/<\/select>$/, '</BranchSelect>');
      content = content.substring(0, startIdx) + newBlock + content.substring(endIdx + 9);
      currentIndex = startIdx + newBlock.length;
      changed = true;
    } else {
      currentIndex = endIdx + 9;
    }
  }

  if (changed) {
    // Ensure import BranchSelect is there
    if (!content.includes('import BranchSelect')) {
      const depth = relPath.split('/').length - 1;
      let importPath = depth === 0 ? '../components/ui/BranchSelect' : '../../components/ui/BranchSelect';
      
      const importRegex = /^import\s+.*?;?\s*$/gm;
      let lastIndex = 0;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        lastIndex = match.index + match[0].length;
      }
      
      if (lastIndex > 0) {
        content = content.slice(0, lastIndex) + `\nimport BranchSelect from '${importPath}';` + content.slice(lastIndex);
      } else {
        content = `import BranchSelect from '${importPath}';\n` + content;
      }
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${relPath}`);
  }
}

for (const file of filesToUpdate) {
  processFile(file);
}
