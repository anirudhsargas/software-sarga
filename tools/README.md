# Sarga CCTV Attendance — Tools Folder
# =====================================
# Place this folder on each designer PC.
#
# Structure:
#   tools/
#   ├── face_recognition_attendance.py   ← main script
#   ├── config.json                      ← branch-specific config (DO NOT COMMIT)
#   ├── config.example.json              ← template for reference
#   ├── images/                          ← staff photos
#   │   ├── 3_rajan.jpg
#   │   ├── 5_priya_1.jpg
#   │   └── 5_priya_2.jpg
#   └── attendance_log.txt               ← auto-created log file
#
# Setup:
#   1. Install Python 3.9 (add to PATH)
#   2. pip install dlib-19.24.1-cp39-cp39-win_amd64.whl  (prebuilt from GitHub)
#   3. pip install opencv-python face-recognition requests
#   4. Copy config.example.json → config.json, fill in branch values
#   5. Add staff photos to images/ folder ({staff_id}_{name}.jpg)
#   6. python face_recognition_attendance.py
#
# Auto-start:
#   Win+R → shell:startup → create shortcut to:
#     pythonw face_recognition_attendance.py
#   Set "Start in" to this tools/ folder path.
