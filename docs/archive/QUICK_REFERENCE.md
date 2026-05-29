> Master Context: [SARGA_WORK_CONTEXT.md](SARGA_WORK_CONTEXT.md)
> Source of truth for project state, architecture, and workflow decisions.

# Quick Reference - Copy & Run Commands

## 🔐 CRITICAL: Execute Before Pushing to GitHub

### Terminal 1: Clean Git History & Force Push

```powershell
# Set Git alias
Set-Alias git "C:\Program Files\Git\cmd\git.exe"

# Navigate to repo
cd "d:\software sarga"

# Option A: Using git filter-branch (RECOMMENDED)
# ================================================

# Verify what will be removed
git rev-list --all --objects | Select-String "\.env$", "sarga_db_backup.sql"

# Clean all .env files from history
git filter-branch --tree-filter 'rm -f server/.env' -- --all

# Clean up refs
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Push with force (rewrites history)
git push origin main --force-with-lease

# Verify cleaning worked
git log -p | Select-String "DB_PASSWORD" | Select-String /v "your_"
# Should return NOTHING
```

### Terminal 2: Update .env with New Credentials

```powershell
# After successful force push, rotate credentials:

# 1. MySQL - Connect and update
#    ALTER USER 'sarga_app'@'localhost' IDENTIFIED BY 'NEW_PASSWORD_HERE';
#    FLUSH PRIVILEGES;

# 2. Update server/.env with new credentials
cd "d:\software sarga\server"

# Verify setup
node setup-check.js
# Should now pass all checks if .env exists with new values
```

### Terminal 3: GitHub Settings (Manual/Browser)

```
1. Open: https://github.com/YOUR-USERNAME/sarga/settings

2. Find "Danger Zone" section

3. Click "Change repository visibility"

4. Select "Private"

5. Confirm

6. Go to "Collaborators & teams"

7. Add team members with read/write access
```

---

## 📋 Verification Checklist

```powershell
# After completing all steps:

Set-Alias git "C:\Program Files\Git\cmd\git.exe"
cd "d:\software sarga"

# 1. Verify commits are pushed
git log origin/main --oneline | head -5

# 2. Verify .env NOT in history
git log -p | Select-String "EmailPass\|GEMINI" | head -5
# Should return nothing

# 3. Verify repo status
git status
# Should show: nothing to commit

# 4. Check remote
git remote -v
# Show fetch and push URLs

# 5. Run security check
cd server
node setup-check.js
# All checks should pass
```

---

## 🚀 Team Communication Template

**Subject: GitHub Repository Security Update - Action Required**

```
Hi Team,

We've completed a security update to the SARGA repository:

✅ Completed:
- Removed sensitive test files and backups
- Secured environment configuration
- Enhanced .gitignore protections
- Documentation added

🔒 Repository is now PRIVATE
- Only team members with explicit access can see it
- Enhanced security for sensitive information

📝 What You Need to Do:

1. If you already cloned the repo:
   rm -rf sarga  # or delete folder
   git clone https://github.com/YOUR-USERNAME/sarga.git
   cd sarga

2. Create your local .env:
   cd server
   cp env.example .env

3. Get real credentials from team lead
   (Request via secure channel)

4. Update .env with real values
   nano .env

5. Verify setup:
   node setup-check.js

6. Start development:
   npm install
   npm start

If you have active branches:
   git pull --rebase
   # Manually resolve conflicts if needed

Questions? Check NEXT_STEPS_ACTION_PLAN.md in the repo
```

---

## ⚠️ If Something Goes Wrong

```powershell
# Abort filter-branch if it fails mid-operation
git filter-branch --abort

# Reset to before force push
git push origin main --force-with-lease

# If need to undo, revert to backed up state
git reset --hard BACKUP_BRANCH_NAME

# Contact git support or see:
# https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
```

---

## 📊 Status After Each Step

### After Git History Cleanup
- ✓ Old commits no longer contain .env
- ✓ server/.env removed from all history
- ✓ New commit 081cbca still exists with security improvements
- ⚠️ Local repository size may increase temporarily (cleanup happens on force push)

### After Force Push
- ✓ Remote repository updated
- ✓ Team must pull fresh copies
- ✓ Old credentials no longer accessible via git history
- ⚠️ Team should rebuild immediately

### After Credential Rotation
- ✓ New credentials in use
- ✓ Old credentials invalidated
- ✓ Audit trail for rotation process

### After Making Private
- ✓ Repository visible only to authorized users
- ✓ No public access to code
- ✓ CI/CD can still access with appropriate tokens

---

## 🎯 Final Verification Commands

```powershell
Set-Alias git "C:\Program Files\Git\cmd\git.exe"
cd "d:\software sarga"

# Show commit log
git log --graph --oneline --all | head -10

# Check branch status
git branch -vv

# Show current security state
echo "=== Git Status ===" ; git status
echo "`n=== Last Commit ===" ; git log -1 --format="%H %s"
echo "`n=== Branch Info ===" ; git branch -vv

# Manual verification
cd server
node setup-check.js
```

---

**Remember:**
- ✓ NEVER push before cleaning git history
- ✓ ALWAYS rotate credentials after exposure
- ✓ ALWAYS make repo private immediately
- ✓ ALWAYS notify team of changes
- ✓ ALWAYS verify cleanup with git log -p

**Timeline:** 30-45 minutes total for all steps
