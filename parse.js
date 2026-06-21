const fs = require('fs');
const path = require('path');

const clientPagesDir = path.join(__dirname, 'client', 'src', 'pages');
const websitePagesDir = path.join(__dirname, 'website', 'src', 'pages');

function walkDir(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath, fileList);
        } else if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const clientFiles = walkDir(clientPagesDir);
const websiteFiles = walkDir(websitePagesDir);

function analyzeFile(filePath, isClient) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(isClient ? clientPagesDir : websitePagesDir, filePath).replace(/\\/g, '/');
    
    // Find all api calls (axios/api)
    // Examples: api.get('/jobs'), api.post('/requests/discount')
    const apiRegex = /api\.(get|post|put|delete|patch)\s*\(\s*[`']([^`'\?#\s]+)[`']/g;
    const apiCalls = [];
    let match;
    while ((match = apiRegex.exec(content)) !== null) {
        apiCalls.push({
            method: match[1].toUpperCase(),
            endpoint: match[2]
        });
    }

    const apiRegexBackticks = /api\.(get|post|put|delete|patch)\s*\(\s*`([^`\?#\s]+)/g;
    while ((match = apiRegexBackticks.exec(content)) !== null) {
        apiCalls.push({
            method: match[1].toUpperCase(),
            endpoint: match[2]
        });
    }

    // Look for unique methods/endpoints
    const uniqueCalls = [];
    const seen = new Set();
    for (const call of apiCalls) {
        const key = `${call.method}:${call.endpoint}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueCalls.push(call);
        }
    }

    // Roles check
    const roles = [];
    const possibleRoles = ['Admin', 'Accountant', 'Front Office', 'Designer', 'Printer', 'Other Staff'];
    possibleRoles.forEach(role => {
        if (content.includes(role)) {
            roles.push(role);
        }
    });

    // Branch restrictions
    const hasBranchId = content.includes('branch_id');
    const hasSelectedBranchId = content.includes('selectedBranchId');
    const hasBranchSelect = content.includes('BranchSelect');
    const hasGetUserBranch = content.includes('getUserBranch');
    const branchRestricted = hasBranchId || hasSelectedBranchId || hasBranchSelect || hasGetUserBranch;

    // Known issues: TODOs
    const todos = [];
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('TODO') || line.includes('FIXME')) {
            todos.push(`L${index + 1}: ${line.trim()}`);
        }
    });

    // Known issues: console.logs
    const consoleLogs = [];
    lines.forEach((line, index) => {
        if (line.includes('console.log')) {
            consoleLogs.push(`L${index + 1}: ${line.trim()}`);
        }
    });

    // Composed Components
    const components = [];
    const componentRegex = /<([A-Z][a-zA-Z0-9]+)/g;
    while ((match = componentRegex.exec(content)) !== null) {
        const comp = match[1];
        if (!components.includes(comp) && comp !== 'Route' && comp !== 'Routes' && comp !== 'Link' && comp !== 'NavLink' && comp !== 'Suspense') {
            components.push(comp);
        }
    }

    // Attempt to extract purpose
    let purpose = '';
    // Look at first multi-line comment or single comments for description
    const commentMatch = content.match(/^\s*\/\*\*?([\s\S]*?)\*\//);
    if (commentMatch) {
        purpose = commentMatch[1].replace(/\*/g, '').trim().split('\n')[0].trim();
    }
    if (!purpose) {
        // Try single line comments in first 10 lines
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            if (lines[i].trim().startsWith('//')) {
                purpose = lines[i].replace(/^\/\/+/, '').trim();
                break;
            }
        }
    }

    return {
        relativePath,
        purpose,
        apiCalls: uniqueCalls,
        roles,
        branchRestricted,
        branchRestrictedDetail: `branch_id: ${hasBranchId}, selectedBranchId: ${hasSelectedBranchId}, BranchSelect: ${hasBranchSelect}, getUserBranch: ${hasGetUserBranch}`,
        todos,
        consoleLogs,
        components
    };
}

const clientData = clientDataResults = clientFiles.map(f => analyzeFile(f, true));
const websiteData = websiteDataResults = websiteFiles.map(f => analyzeFile(f, false));

const output = {
    client: clientData,
    website: websiteData
};

fs.writeFileSync(path.join(__dirname, 'analysis.json'), JSON.stringify(output, null, 2));
console.log('Analysis complete. Written to analysis.json.');
