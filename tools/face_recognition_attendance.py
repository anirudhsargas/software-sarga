"""
Sarga Prints — CCTV Face Recognition Attendance Script
======================================================
Runs on each branch's designer PC. Reads the local Hikvision camera feed,
detects and matches staff faces, and posts entry/exit events to the Sarga
backend API.

Requirements:
  Python 3.9  |  opencv-python  |  face_recognition  |  requests
  dlib installed via prebuilt .whl (see README)

Usage:
  python face_recognition_attendance.py          # with camera window
  pythonw face_recognition_attendance.py         # silent (no window)
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, date, timedelta

import cv2
import face_recognition
import requests

# ── Load configuration ────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")

if not os.path.exists(CONFIG_PATH):
    print(f"ERROR: config.json not found at {CONFIG_PATH}")
    print("Copy config.example.json to config.json and fill in your values.")
    sys.exit(1)

with open(CONFIG_PATH, "r") as f:
    config = json.load(f)

RTSP_URL = config["rtsp_url"]
BRANCH = config["branch"]
BACKEND_URL = config["backend_url"].rstrip("/")
API_KEY = config.get("api_key", "")
CONFIDENCE_THRESHOLD = config.get("confidence_threshold", 0.45)
CHECK_INTERVAL = config.get("check_interval_seconds", 2)
MIN_GAP_MINUTES = config.get("min_gap_between_events_minutes", 60)
LOG_FILE = os.path.join(SCRIPT_DIR, config.get("log_file", "attendance_log.txt"))

IMAGES_DIR = os.path.join(SCRIPT_DIR, "images")

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("cctv_attendance")

# ── Load known faces ──────────────────────────────────────────────────────────
known_encodings = []
known_staff_ids = []
known_names = []


def load_known_faces():
    """Load and encode all staff photos from the images/ folder."""
    global known_encodings, known_staff_ids, known_names
    known_encodings = []
    known_staff_ids = []
    known_names = []

    if not os.path.isdir(IMAGES_DIR):
        logger.error(f"Images directory not found: {IMAGES_DIR}")
        logger.error("Create an 'images' folder and add staff photos (e.g. 3_rajan.jpg)")
        sys.exit(1)

    loaded = 0
    for filename in os.listdir(IMAGES_DIR):
        if not filename.lower().endswith((".jpg", ".jpeg", ".png")):
            continue

        # Parse staff_id from filename: {staff_id}_{name}.jpg
        parts = filename.split("_", 1)
        if not parts[0].isdigit():
            logger.warning(f"Skipping {filename} — filename must start with staff_id")
            continue

        staff_id = int(parts[0])
        name = parts[1].rsplit(".", 1)[0] if len(parts) > 1 else f"staff_{staff_id}"

        filepath = os.path.join(IMAGES_DIR, filename)
        try:
            image = face_recognition.load_image_file(filepath)
            encodings = face_recognition.face_encodings(image)
            if len(encodings) == 0:
                logger.warning(f"No face found in {filename} — skipping")
                continue
            known_encodings.append(encodings[0])
            known_staff_ids.append(staff_id)
            known_names.append(name)
            loaded += 1
        except Exception as e:
            logger.error(f"Failed to load {filename}: {e}")

    logger.info(f"Loaded {loaded} face(s) from {IMAGES_DIR}")
    if loaded == 0:
        logger.error("No valid face images loaded. Add photos to images/ folder.")
        sys.exit(1)


# ── Event tracking (per-day, in-memory) ──────────────────────────────────────
# { staff_id: datetime_of_last_event }
last_event_time = {}
# { staff_id: 'entry' | 'exit' }
last_event_type = {}
current_tracking_date = None


def reset_daily_tracking():
    """Clear tracking data at the start of each new day."""
    global last_event_time, last_event_type, current_tracking_date
    today = date.today()
    if current_tracking_date != today:
        last_event_time.clear()
        last_event_type.clear()
        current_tracking_date = today
        logger.info(f"New day — tracking reset for {today}")


def determine_event_type(staff_id):
    """
    Determine whether this detection should be entry or exit.
    - No event today → entry
    - Last was entry → exit
    - Last was exit → entry (re-entry)
    """
    last = last_event_type.get(staff_id)
    if last is None:
        return "entry"
    elif last == "entry":
        return "exit"
    else:
        return "entry"


def should_record(staff_id):
    """Check the minimum gap rule to prevent duplicate events."""
    last_time = last_event_time.get(staff_id)
    if last_time is None:
        return True
    elapsed = (datetime.now() - last_time).total_seconds() / 60.0
    return elapsed >= MIN_GAP_MINUTES


# ── Backend communication ────────────────────────────────────────────────────
def post_attendance(staff_id, event_type):
    """Send attendance event to the Sarga backend."""
    url = f"{BACKEND_URL}/api/cctv/attendance"
    payload = {
        "staff_id": staff_id,
        "branch": BRANCH,
        "event_type": event_type,
        "source": "face_recognition",
        "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        if resp.status_code in (200, 201):
            data = resp.json()
            if data.get("skipped"):
                logger.info(f"  → Backend skipped (duplicate): staff {staff_id}")
            else:
                logger.info(f"  → Recorded: staff {staff_id} {event_type} (id={data.get('id')})")
            return True
        else:
            logger.error(f"  → Backend error {resp.status_code}: {resp.text[:200]}")
            return False
    except requests.RequestException as e:
        logger.error(f"  → Network error posting attendance: {e}")
        return False


def post_unknown_alert():
    """Notify the backend that an unrecognised face was detected."""
    url = f"{BACKEND_URL}/api/cctv/attendance/unknown-alert"
    payload = {
        "branch": BRANCH,
        "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    try:
        requests.post(url, json=payload, headers=headers, timeout=10)
    except requests.RequestException:
        pass  # best-effort


# ── Main loop ────────────────────────────────────────────────────────────────
def main():
    load_known_faces()

    logger.info(f"Connecting to camera: {RTSP_URL.split('@')[0]}@***")
    logger.info(f"Branch: {BRANCH}  |  Interval: {CHECK_INTERVAL}s  |  Gap: {MIN_GAP_MINUTES}min")

    cap = cv2.VideoCapture(RTSP_URL)
    if not cap.isOpened():
        logger.error("Failed to open camera stream. Check RTSP URL and network.")
        sys.exit(1)

    logger.info("Camera stream opened. Starting detection loop...")

    # Determine if we should show a window (not running as pythonw)
    show_window = sys.stdout is not None and hasattr(sys.stdout, "write")
    try:
        # Test if we can create a window — will fail under pythonw
        if show_window:
            cv2.namedWindow("Sarga CCTV Attendance", cv2.WINDOW_NORMAL)
    except Exception:
        show_window = False

    frame_count = 0
    try:
        while True:
            reset_daily_tracking()

            ret, frame = cap.read()
            if not ret:
                logger.warning("Failed to read frame — reconnecting in 5s...")
                cap.release()
                time.sleep(5)
                cap = cv2.VideoCapture(RTSP_URL)
                continue

            frame_count += 1

            # Downscale for faster face detection
            small = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
            rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

            # Detect faces
            face_locations = face_recognition.face_locations(rgb_small)
            if not face_locations:
                if show_window:
                    cv2.imshow("Sarga CCTV Attendance", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                time.sleep(CHECK_INTERVAL)
                continue

            face_encs = face_recognition.face_encodings(rgb_small, face_locations)

            for face_enc, face_loc in zip(face_encs, face_locations):
                distances = face_recognition.face_distance(known_encodings, face_enc)
                if len(distances) == 0:
                    continue

                best_idx = distances.argmin()
                best_distance = distances[best_idx]

                # Scale face location back to original size for display
                top, right, bottom, left = [v * 2 for v in face_loc]

                if best_distance <= CONFIDENCE_THRESHOLD:
                    staff_id = known_staff_ids[best_idx]
                    name = known_names[best_idx]

                    if should_record(staff_id):
                        event_type = determine_event_type(staff_id)
                        logger.info(
                            f"Face matched: {name} (staff_id={staff_id}) "
                            f"distance={best_distance:.3f} → {event_type}"
                        )
                        if post_attendance(staff_id, event_type):
                            last_event_time[staff_id] = datetime.now()
                            last_event_type[staff_id] = event_type

                    # Draw green box with name
                    if show_window:
                        cv2.rectangle(frame, (left, top), (right, bottom), (0, 200, 0), 2)
                        cv2.putText(
                            frame, f"{name} ({best_distance:.2f})",
                            (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                            (0, 200, 0), 2,
                        )
                else:
                    # Unknown face
                    logger.info(f"Unknown face detected (distance={best_distance:.3f})")
                    post_unknown_alert()

                    if show_window:
                        cv2.rectangle(frame, (left, top), (right, bottom), (0, 0, 255), 2)
                        cv2.putText(
                            frame, "Unknown",
                            (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                            (0, 0, 255), 2,
                        )

            if show_window:
                cv2.imshow("Sarga CCTV Attendance", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    logger.info("Quit key pressed. Exiting.")
                    break

            time.sleep(CHECK_INTERVAL)

    except KeyboardInterrupt:
        logger.info("Interrupted. Shutting down.")
    finally:
        cap.release()
        if show_window:
            cv2.destroyAllWindows()
        logger.info("Camera released. Script stopped.")


if __name__ == "__main__":
    main()
