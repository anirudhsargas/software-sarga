> Master Context: [SARGA_WORK_CONTEXT.md](SARGA_WORK_CONTEXT.md)
> Source of truth for project state, architecture, and workflow decisions.

# Security Setup Guide

This document outlines the security improvements made to the SARGA repository and steps to complete the migration.

## ✅ Completed Actions

### 1. Dev Scripts Organization
- **Status:** ✅ Complete
- All development scripts (`test_*.js`, `check_*.js`) have been moved to `server/dev-scripts/`
- This prevents accidental commits of testing/debugging code
- **Files moved:** 36 development scripts
- **Location:** `server/dev-scripts/`

### 2. .gitignore Updated
- **Status:** ✅ Complete
- Enhanced `.gitignore` to exclude:
  - `.env` files (all variants)
  - Database backups (`*.sql`, `*.backup`, `*.bak`)
  - Development scripts in `dev-scripts/`
  - IDE and OS files
  - Build artifacts and logs

### 3. Environment Configuration
- **Status:** ✅ Complete
- Created comprehensive `env.example` template
- All placeholder values with clear instructions
- **Setup Instructions:**
  ```bash
  # 1. Copy the template
  cp server/env.example server/.env
  
  # 2. Edit with real credentials
  nano server/.env
  ```

## ⚠️ Required Manual Actions

### 1. Clean Git History (Remove Sensitive Data)

**IMPORTANT:** The `.env` file with real credentials is currently in git history. Follow these steps:

```bash
# Option A: Using git-filter-branch (recommended for removing old commits)
git filter-branch --tree-filter 'rm -f sarga_db_backup.sql server/.env' --prune-empty HEAD

# Option B: Using git rm with BFG Repo-Cleaner (fastest)
# Download from: https://rtyley.github.io/bfg-repo-cleaner/

# Option C: Manual removal (see GitHub's documentation)
# https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
```

**After cleaning history:**
```bash
git push --force origin main
# WARNING: This rewrites history. All collaborators need to pull fresh copies.
```

### 2. Remove Previously Committed Files
```bash
# Remove backup file from tracking (if still committed)
git rm --cached sarga_db_backup.sql

# Remove .env from tracking
git rm --cached server/.env

# Commit the changes
git add .gitignore
git commit -m "chore: remove sensitive files from tracking"
git push origin main
```

### 3. Make Repository Private (GitHub)

1. **Go to Repository Settings:**
   - Navigate to: https://github.com/YOUR-USERNAME/sarga/settings
   
2. **Change Visibility:**
   - Scroll to "Danger Zone"
   - Click "Change repository visibility"
   - Select "Private"
   - Confirm the action

3. **Grant Access:**
   - Add team members in Settings → Collaborators
   - Only invite necessary people

### 4. Rotate Compromised Credentials

Since credentials are currently visible in git history:

```
- JWT_SECRET: ✅ Already strong/random
- Database Password: ⚠️ ROTATE if ever exposed externally
- Email App Password: ⚠️ ROTATE - Never share Gmail app passwords
- Gemini API Key: ⚠️ ROTATE - Regenerate from Google Cloud Console
- Git History: Clean with the commands above
```

**Steps to rotate credentials:**

1. **Database Password:**
   ```sql
   ALTER USER 'sarga_app'@'localhost' IDENTIFIED BY 'new_secure_password';
   FLUSH PRIVILEGES;
   ```

2. **Gmail App Password:**
   - Visit: https://myaccount.google.com/apppasswords
   - Regenerate the password
   - Update `.env`

3. **Gemini API Key:**
   - Visit: https://console.cloud.google.com/apis/dashboard
   - Regenerate the key
   - Update `.env`

### 5. Verify Security

After all actions:

```bash
# Verify .env is not tracked
git ls-files | grep .env
# Should return nothing

# Verify sarga_db_backup.sql is not tracked
git ls-files | grep .sql
# Should return nothing

# Check git history for sensitive patterns
git log -p | grep -i "password\|secret\|api" | head -5
# Should return nothing or only sanitized values
```

## 🔐 Best Practices Going Forward

1. **Never commit `.env` files**
   - Always use `.env.example` as a template
   - Team members create local `.env` files

2. **Rotate credentials regularly**
   - API keys: Monthly or when team changes
   - Passwords: Quarterly
   - JWT secrets: When security incidents occur

3. **Use secrets management in production**
   - GitHub Secrets for CI/CD
   - Environment variables in hosting platform
   - Never store in code or version control

4. **Review commits before pushing**
   ```bash
   git diff --cached
   git log -p origin/main..HEAD
   ```

5. **Set up branch protection**
   - Require pull request reviews
   - Run security checks in CI/CD
   - Block direct pushes to main

## 📋 Checklist

- [ ] Run git history cleanup commands
- [ ] Remove `.env` from git tracking
- [ ] Verify sensitive files are not in git history
- [ ] Make repository private on GitHub
- [ ] Rotate compromised credentials
- [ ] Update team members about private repo
- [ ] Grant necessary access to collaborators
- [ ] Test that development still works with new setup
- [ ] Create deployment documentation for production credentials

## ❓ Troubleshooting

**Q: Git history cleanup failed?**
A: Use GitHub's built-in tool or contact GitHub Support

**Q: CollaboratorsLost access after making repo private?**
A: Re-add them in Settings → Collaborators & Teams

**Q: .env file still appears in history?**
A: The old commits still contain it, but it's no longer tracked. For complete removal, use BFG Repo-Cleaner

## 📞 Support

For questions about git history cleaning:
- GitHub Docs: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- BFG Tool: https://rtyley.github.io/bfg-repo-cleaner/
