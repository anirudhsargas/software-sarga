#!/usr/bin/env node

/**
 * SARGA Setup Helper Script
 * Validates environment setup and ensures security best practices
 */

const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function check(condition, successMsg, errorMsg) {
    if (condition) {
        log(`✓ ${successMsg}`, 'green');
        return true;
    } else {
        log(`✗ ${errorMsg}`, 'red');
        return false;
    }
}

async function runSetupCheck() {
    log('\n' + colors.bold + '=== SARGA Security Setup Verification ===' + colors.reset + '\n', 'blue');

    const serverDir = path.join(__dirname, '..');
    const envPath = path.join(serverDir, '.env');
    const envExamplePath = path.join(serverDir, 'env.example');
    const gitignorePath = path.join(__dirname, '..', '..', '.gitignore');

    let allChecks = true;

    // 1. Check if .env exists
    allChecks &= check(
        fs.existsSync(envPath),
        '.env file exists',
        '.env file not found - Create from env.example: cp env.example .env'
    );

    // 2. Check if env.example exists
    allChecks &= check(
        fs.existsSync(envExamplePath),
        'env.example template exists',
        'env.example template missing'
    );

    // 3. Check .env is in .gitignore
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        allChecks &= check(
            gitignoreContent.includes('.env'),
            '.env is in .gitignore',
            '.env is NOT in .gitignore - This is a security risk!'
        );
    }

    // 4. Check if .env contains real values vs placeholders
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const hasPlaceholders = envContent.includes('your_') || envContent.includes('change_me');
        const isConfigured = !hasPlaceholders;

        check(
            isConfigured,
            '.env appears to have real values configured',
            '.env still contains placeholder values - Update them with real credentials'
        );
    }

    // 5. Check for sarga_db_backup.sql in .gitignore
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        allChecks &= check(
            gitignoreContent.includes('*.sql'),
            'Database backups (*.sql) are in .gitignore',
            'Database backups are NOT ignored - Add *.sql to .gitignore'
        );
    }

    // 6. Check if dev-scripts exists
    const devScriptsPath = path.join(serverDir, 'dev-scripts');
    allChecks &= check(
        fs.existsSync(devScriptsPath),
        'dev-scripts directory exists',
        'dev-scripts directory not found'
    );

    // 7. Check if dev-scripts is in .gitignore
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        allChecks &= check(
            gitignoreContent.includes('dev-scripts'),
            'dev-scripts/ is in .gitignore',
            'dev-scripts/ is NOT in .gitignore'
        );
    }

    // 8. Check required environment variables
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const requiredVars = ['PORT', 'JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
        
        log('\n' + colors.bold + 'Checking required environment variables:' + colors.reset);
        for (const varName of requiredVars) {
            const hasVar = envContent.includes(`${varName}=`);
            check(
                hasVar,
                `${varName} is configured`,
                `${varName} is missing from .env`
            );
        }
    }

    // 9. Summary
    log('\n' + colors.bold + '=== Setup Status ===' + colors.reset, 'blue');
    if (allChecks) {
        log('✓ All security checks passed!', 'green');
        log('\nYou can now start the development servers:', 'blue');
        log('  - Backend:  cd server && npm start', 'reset');
        log('  - Frontend: cd client && npm run dev', 'reset');
    } else {
        log('⚠ Some checks failed. Please review the messages above.', 'yellow');
        log('\nFor help, see: SECURITY_SETUP.md', 'yellow');
        process.exit(1);
    }

    log('\n' + colors.bold + 'Security Reminders:' + colors.reset, 'blue');
    log('  1. Never commit .env files', 'yellow');
    log('  2. Never commit database backups (*.sql files)', 'yellow');
    log('  3. Keep dev-scripts out of version control', 'yellow');
    log('  4. Rotate credentials regularly', 'yellow');
    log('  5. Keep the repository private', 'yellow');
}

// Run the check
runSetupCheck().catch(err => {
    console.error('Setup check error:', err);
    process.exit(1);
});
