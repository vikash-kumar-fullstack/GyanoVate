from flask import Flask, request, jsonify, Response
import face_recognition
import cv2
import numpy as np
from geopy.distance import geodesic
import requests
from flask_cors import CORS
import os
from datetime import datetime
from pymongo import MongoClient
from bson.objectid import ObjectId
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ================= CONFIG =================
MIN_DISTANCE_METERS = 500000000009
MAX_FACE_DISTANCE = 0.6

# ================= GLOBAL STATE =================
CURRENT_TEACHER_EMAIL = None
KNOWN_FACE_ENCODING = None
video_capture = None
attendance_done = False
already_marked = False
CURRENT_SCHOOL_LOCATION = None

# ================= DB =================
client = MongoClient(os.getenv('MONGODB_URI'))
db = client['test']
users_collection = db['users']
schools_collection = db['schools']

# ================= SCHOOL FETCH =================
def get_school_location_from_teacher(email):
    teacher = users_collection.find_one({"email": email})
    if not teacher:
        return None

    school_id = teacher.get("schoolId")

    if isinstance(school_id, str):
        school_id = ObjectId(school_id)

    school = schools_collection.find_one({"_id": school_id})
    if not school:
        return None

    lat = school.get("latitude")
    lon = school.get("longitude")

    if lat is None or lon is None:
        return None

    return (float(lat), float(lon))

# ================= FACE LOAD =================
def load_face_encoding_from_url(url):
    try:
        resp = requests.get(url)
        img = np.asarray(bytearray(resp.content), dtype=np.uint8)
        img = cv2.imdecode(img, cv2.IMREAD_COLOR)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        enc = face_recognition.face_encodings(rgb)
        return enc[0] if enc else None
    except:
        return None

# ================= START =================
@app.route("/start_verification", methods=["POST"])
def start_verification():
    global CURRENT_TEACHER_EMAIL, KNOWN_FACE_ENCODING, CURRENT_SCHOOL_LOCATION
    global attendance_done, already_marked

    attendance_done = False
    already_marked = False

    data = request.json
    CURRENT_TEACHER_EMAIL = data.get("email")
    image_url = data.get("imageUrl")

    today = datetime.now().strftime("%Y-%m-%d")

    # 🔥 PRE-CHECK (IMPORTANT)
    existing = users_collection.find_one({
        "email": CURRENT_TEACHER_EMAIL,
        "attendance.date": today
    })

    if existing:
        already_marked = True
        return jsonify({"status": "already_marked"})

    CURRENT_SCHOOL_LOCATION = get_school_location_from_teacher(CURRENT_TEACHER_EMAIL)

    if not CURRENT_SCHOOL_LOCATION:
        return jsonify({"status": "error", "message": "School not found"})

    KNOWN_FACE_ENCODING = load_face_encoding_from_url(image_url)

    if KNOWN_FACE_ENCODING is None:
        return jsonify({"status": "error", "message": "Face not detected"})

    return jsonify({"status": "waiting_for_location"})

# ================= LOCATION =================
@app.route("/set_location", methods=["POST"])
def set_location():
    global video_capture

    data = request.json
    user_location = (float(data["latitude"]), float(data["longitude"]))

    if not CURRENT_SCHOOL_LOCATION:
        return jsonify({"status": "error", "message": "School not loaded"})

    dist = geodesic(CURRENT_SCHOOL_LOCATION, user_location).meters

    if dist <= MIN_DISTANCE_METERS:
        video_capture = cv2.VideoCapture(0)
        return jsonify({
            "status": "verified",
            "within_range": True,
            "distance_from_school": dist
        })
    else:
        return jsonify({
            "status": "denied",
            "within_range": False,
            "distance_from_school": dist
        })

# ================= VIDEO =================
@app.route("/video_feed")
def video_feed():

    def generate():
        global attendance_done, video_capture, already_marked

        match_counter = 0

        while True:

            if attendance_done:
                break

            if not video_capture or not video_capture.isOpened():
                break

            success, frame = video_capture.read()
            if not success:
                continue

            small = cv2.resize(frame, (0,0), fx=0.25, fy=0.25)
            rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

            encs = face_recognition.face_encodings(rgb)

            face_detected = False

            for enc in encs:
                dist = face_recognition.face_distance([KNOWN_FACE_ENCODING], enc)[0]
                if dist < MAX_FACE_DISTANCE:
                    face_detected = True

            if face_detected:
                match_counter += 1
            else:
                match_counter = 0

            # 🔥 SAVE
            if match_counter >= 3 and not attendance_done:

                today = datetime.now().strftime("%Y-%m-%d")
                time_str = datetime.now().strftime("%H:%M:%S")

                result = users_collection.update_one(
                    {
                        "email": CURRENT_TEACHER_EMAIL,
                        "attendance.date": {"$ne": today}
                    },
                    {
                        "$push": {
                            "attendance": {
                                "date": today,
                                "time": time_str,
                                "verified": True,
                                "faceMatched": True,
                                "locationMatched": True
                            }
                        }
                    }
                )

                if result.modified_count == 0:
                    already_marked = True
                    print("🚫 Already marked today")
                else:
                    print("✅ Attendance saved")

                attendance_done = True

                if video_capture:
                    video_capture.release()

                break

            ret, buffer = cv2.imencode('.jpg', frame)
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' +
                   buffer.tobytes() + b'\r\n')

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

# ================= STATUS =================
@app.route("/status")
def status():
    return jsonify({
        "attendance_done": attendance_done,
        "already_marked": already_marked
    })

# ================= RUN =================
if __name__ == "__main__":
    app.run(port=5001, debug=True)