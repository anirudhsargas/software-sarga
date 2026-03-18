# 🔐 SARGA Repository Security Setup - Action Plan

**Date:** March 18, 2026  
**Status:** 80% Complete - Manual actions required

---

## ✅ Completed Tasks

### 1. Development Scripts Reorganized
✓ **36 files moved** to `server/dev-scripts/`  
- `test_*.js` files (21 scripts)
- `check_*.js` files (15 scripts)

**Benefit:** Prevents accidental commits of debugging code
```
server/
├── dev-scripts/          ← All dev scripts here
│   ├── test_admin_login.js
│   ├── check_schema.js
│   └── ... (36 total)
├── routes/
├── middleware/
└── index.js
```

---

### 2. .gitignore Enhanced
✓ **Updated** with comprehensive security rules

**Now excludes:**
- `.env` (all environment files)
- `*.sql` (database backups)
- `*.backup`, `*.bak`
- `dev-scripts/` (entire folder)
- `check_*.js`, `test_*.js` (at root level)
- Build artifacts and IDE files

---

### 3. Environment Configuration Template
✓ **Updated** `server/env.example` with:
- Placeholder values instead of real credentials
- Clear documentation for each variable
- Comments explaining configuration

**Before:**
```env
JWT_SECRET=6d9f4b0a3f8d2c1e7a5b9c4d8e2f6a1c9b3d7e0f4a8c2d6e1b5f9a3c7d0e4b8
DB_PASSWORD=Sarga@12345
GEMINI_API_KEY=your_gemini_api_key_here
```

**After:**
```env
JWT_SECRET=your_256_bit_random_secret_at_least_32_characters_long_12345678
DB_PASSWORD=your_secure_database_password_here
GEMINI_API_KEY=your_gemini_api_key_here
```

---

### 4. Security Verification Tool
✓ **Created** `server/setup-check.js` that validates:
- `.env` file exists and is configured
- Required environment variables are set
- Sensitive files are properly gitignored
- Security best practices are followed

**Run it:**
```bash
cd server
node setup-check.js
```

---

### 5. Setup Documentation
✓ **Created** `SECURITY_SETUP.md` with:
- Detailed security checklist
- Git history cleanup instructions
- Credential rotation procedures
- Production deployment guidelines

---

## ⚠️ IMMEDIATE ACTIONS REQUIRED (Manual)

### Priority 1: Clean Git History
**⚠️ CRITICAL:** `.env` with real credentials is committed in git history

**Step 1: Remove .env from git tracking**
```bash
cd d:\software sarga

# Remove .env from tracking but keep local file
git rm --cached server/.env

# Remove backup file if tracked
git rm --cached sarga_db_backup.sql

# Commit the removal
git add .gitignore
git commit -m "chore(security): remove sensitive files from tracking"

# Push changes
git push origin main
```

**Step 2: Clean git history of old commits**
```bash
# OPTION A - Using git filter-branch (simple, slower)
git filter-branch --tree-filter 'rm -f server/.env sarga_db_backup.sql' -f HEAD

# OPTION B - Using BFG Repo-Cleaner (fast, recommended)
# Download: https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --delete-files server/.env --delete-files sarga_db_backup.sql

# After using either option:
git push origin main --force-with-lease

# ⚠️ WARNING: Force push rewrites history
# All collaborators must pull fresh copies:
git pull --rebase
```

### Priority 2: Rotate Exposed Credentials

Since credentials were committed to git:

**1. Database Password**
```sql
-- Login to MySQL as admin
ALTER USER 'sarga_app'@'localhost' IDENTIFIED BY 'NEW_SECURE_PASSWORD_HERE';
FLUSH PRIVILEGES;
```

**2. Gmail App Password**
- Visit: https://myaccount.google.com/apppasswords
- Regenerate the app password
- Update `server/.env` with new `EMAIL_PASS`

**3. Gemini API Key**
- Visit: https://console.cloud.google.com/apis/credentials
- Delete old key
- Create new key
- Update `server/.env` with new `GEMINI_API_KEY`

### Priority 3: Make Repository Private on GitHub

1. **Open repository settings:**
   - https://github.com/YOUR-USERNAME/sarga/settings

2. **Scroll to "Danger Zone" section**

3. **Click "Change repository visibility"**

4. **Select "Private"**

5. **Confirm the action**

6. **Grant access to team members:**
   - Settings → Collaborators & Teams
   - Add team members who need access

---

## 📋 Setup Checklist for Team Members

After security changes are complete:

```bash
# 1. Clone the repository
git clone https://github.com/YOUR-USERNAME/sarga.git

# 2. Navigate to server
cd sarga/server

# 3. Create .env from template
cp env.example .env

# 4. Edit .env with real values
# You need to obtain these from the team lead:
# - DB_PASSWORD
# - EMAIL_PASS  
# - GEMINI_API_KEY
nano .env

# 5. Verify setup
node setup-check.js

# 6. Install dependencies
npm install

# 7. Start development
npm start
```

---

## 🛡️ Security Verification Checklist

After completing all manual actions:

- [ ] Git history cleaned (no .env in history)
- [ ] `.env` file is NOT tracked by git (`git ls-files | grep .env` returns nothing)
- [ ] `*.sql` files are NOT tracked (`git ls-files | grep .sql` returns nothing)
- [ ] Repository is PRIVATE on GitHub
- [ ] Old credentials are ROTATED
- [ ] Team members have REBUILD/cloned fresh copies
- [ ] `setup-check.js` PASSES
- [ ] Development servers start successfully
- [ ] All tests PASS

---

## 📂 Final Directory Structure

```
sarga/
├── .env               ← Local only (in .gitignore)
├── .env.example       ← Template (tracked)
├── .gitignore         ← ✓ Updated
├── SECURITY_SETUP.md  ← ✓ Created
├── SERVER_SETUP.md    ← This file
│
├── server/
│   ├── .env           ← Local only (in .gitignore)
│   ├── env.example    ← ✓ Updated
│   ├── setup-check.js ← ✓ Created (validation tool)
│   ├── dev-scripts/   ← ✓ Created
│   │   ├── test_*.js  ← Not tracked
│   │   ├── check_*.js ← Not tracked
│   │   └── ...
│   ├── routes/
│   ├── middleware/
│   ├── node_modules/
│   └── index.js
│
└── client/
    ├── src/
    ├── public/
    └── ...
```

---

## 🚀 Next Steps

1. **Execute Priority 1-3 actions** (above)
2. **Run security checks** to verify
3. **Communicate with team** about changes
4. **Have team pull fresh copies** from repository
5. **Document credential rotation** schedule

---

## 📞 Support Resources

- **Git History Cleaning:** https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- **BFG Repo-Cleaner:** https://rtyley.github.io/bfg-repo-cleaner/
- **GitHub Private Repos:** https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
- **Environment Security:** https://owasp.org/www-community/Sensitive_Data_Exposure

---

## 💡 Tips

- **Test everything locally first** before making changes public
- **Keep a backup** of the repository before cleaning history
- **Communicate early** with your team about these changes
- **Use strong passwords** and rotate regularly
- **Monitor credentials** for any suspicious activity

---

**Last Updated:** March 18, 2026  
**By:** GitHub Copilot  
**Status:** Ready for manual actions
