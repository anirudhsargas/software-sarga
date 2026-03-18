🔐 SECURITY IMPLEMENTATION - NEXT STEPS
========================================

✅ COMPLETED:
1. ✓ Dev scripts moved to server/dev-scripts/
2. ✓ Database backups removed from git tracking
3. ✓ .gitignore updated with security rules
4. ✓ env.example secured with placeholders
5. ✓ Security documentation created
6. ✓ Git commit prepared: 081cbca

⚠️  **CRITICAL - DO BEFORE PUSHING TO GITHUB:**

The git history still contains real credentials in server/.env from previous commits.
You MUST clean this BEFORE pushing, otherwise credentials remain accessible through git history.

===================================================================
STEP 1: Clean Git History (Removes .env from all commits)
===================================================================

Option A - Using git filter-branch (recommended for this project):
────────────────────────────────────────────────────────────────

  # Show what will be removed
  git rev-list --all --objects | grep "\.env\|\.sql" | cut -d' ' -f2

  # Clean history (be careful with the command - it rewrites history)
  git filter-branch --tree-filter 'rm -f server/.env' -- --all

  # After successful cleanup, verify .env is gone
  git log -p | findstr "DB_PASSWORD\|EMAIL_PASS\|GEMINI_API_KEY" | findstr /v "your_"
  # Should return nothing

Option B - Using BFG Repo-Cleaner (faster, better for large repos):
────────────────────────────────────────────────────────────────────

  # Download from: https://rtyley.github.io/bfg-repo-cleaner/
  # Install Java if needed

  # Run BFG to remove .env
  java -jar bfg.jar --delete-files server/.env

  # Clean refs
  git reflog expire --expire=now --all && git gc --prune=now --aggressive

===================================================================
STEP 2: Force Push (WARNING: Rewrites History)
===================================================================

After cleaning git history, you MUST force push:

  git push origin main --force-with-lease

⚠️  WARNING: This rewrites history. All team members must:
    - Delete their local clone
    - Clone fresh copy: git clone https://github.com/YOUR/sarga.git
    - Or if they have work: git pull --rebase (then manually resolve)

===================================================================
STEP 3: Rotate Compromised Credentials (Do After Cleanup)
===================================================================

Since credentials were exposed in git history:

1. DATABASE PASSWORD
   ─────────────────
   # Connect to MySQL as admin
   ALTER USER 'sarga_app'@'localhost' IDENTIFIED BY 'YOUR_NEW_STRONG_PASSWORD';
   FLUSH PRIVILEGES;

   # Update server/.env with new password

2. GMAIL APP PASSWORD
   ──────────────────
   - Visit: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Generate new password
   - Copy it to server/.env: EMAIL_PASS=new_password

3. GEMINI API KEY
   ──────────────
   - Visit: https://console.cloud.google.com/apis/credentials
   - Delete old key
   - Create new key
   - Update server/.env: GEMINI_API_KEY=new_key_here

4. Commit credential updates:
   git add server/.env
   git commit -m "chore: rotate compromised credentials"
   git push origin main

===================================================================
STEP 4: Make Repository Private (GitHub Settings)
===================================================================

1. Go to: https://github.com/YOUR-USERNAME/sarga/settings

2. Scroll to "Danger Zone" section

3. Click "Change repository visibility"

4. Select "Private" and confirm

5. Grant access to team members:
   - Go to: Settings → Collaborators & teams
   - Search and add team members
   - Set appropriate permissions

===================================================================
STEP 5: Verification
===================================================================

After completing all steps, verify:

  # 1. Check .env is NOT in history
  git log -p | findstr "server/.env" | findstr /v ".gitignore"
  # Should return nothing

  # 2. Check git is clean
  git status
  # Should show: nothing to commit, working tree clean

  # 3. Verify it's pushed
  git log origin/main --oneline | head -1
  # Should show: chore(security): remove sensitive files...

  # 4. Run security check
  cd server && node setup-check.js
  # Should pass all checks

===================================================================
TEAM COMMUNICATION
===================================================================

After pushing private repo, notify team:

"Repository is now private with security improvements:
✓ .env files excluded from git
✓ Database backups removed
✓ Dev scripts organized
✓ Credentials rotated

To get fresh copy:
  git clone https://github.com/YOUR/sarga.git
  cd sarga/server
  cp env.example .env
  (Get real credentials from team lead)
  node setup-check.js
  npm install && npm start"

===================================================================
TIMELINE ESTIMATE
===================================================================

- Git history cleanup:  5-10 minutes
- Force push:          2-3 minutes
- Credential rotation:  10-15 minutes
- GitHub settings:      2-3 minutes
- Team notification:    5 minutes
─────────────────────────────────────
TOTAL:                 25-35 minutes

===================================================================
🚨 IMPORTANT REMINDERS
===================================================================

DO NOT:
  ✗ Push before cleaning git history
  ✗ Commit .env files after this
  ✗ Use default/weak credentials
  ✗ Share credentials in git or without encryption

DO:
  ✓ Use git filter-branch or BFG before force push
  ✓ Rotate all exposed credentials
  ✓ Make repository private immediately
  ✓ Monitor repository logs
  ✓ Use `.env` template for new setups
  ✓ Store credentials in team password manager

===================================================================
CURRENT GIT STATE
===================================================================

  Current branch: main
  Unpushed commits: 1 (081cbca: security improvements)
  Files staged: 0
  Working tree: clean

  Commit ready to push:
  ┌─────────────────────────────────────────────────────┐
  │ 081cbca chore(security): remove sensitive files     │
  │ and reorganize dev scripts                         │
  │                                                     │
  │ Changes:                                           │
  │  - Removed: 37 dev scripts from tracking           │
  │  - Removed: 2 database backups from tracking       │
  │  - Updated: .gitignore with security rules         │
  │  - Created: SECURITY_SETUP.md                      │
  │  - Created: SERVER_SETUP.md                        │
  │  - Created: server/setup-check.js                  │
  └─────────────────────────────────────────────────────┘

Next: Execute steps 1-5 above, then push!

===================================================================
