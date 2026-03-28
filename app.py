# gemini code (may be correct for gps devices)
from flask import Flask, request, jsonify, Response
import face_recognition
import cv2
import numpy as np
from geopy.distance import geodesic
import requests
from flask_cors import CORS
import time
import os
from datetime import datetime
import json
from pymongo import MongoClient

app = Flask(__name__)
CORS(app)

# ---------- Config ----------

# Exact coordinates of the school
SCHOOL_LOCATION = (23.730782,92.717353)

# Range in meters (Strict 500m)
MIN_DISTANCE_METERS = 500 
MAX_FACE_DISTANCE = 0.6

# Global variables
CURRENT_TEACHER_EMAIL = None
KNOWN_FACE_ENCODING = None
user_location = None
video_capture = None
attendance_done = False
verification_start_time = None

# ---------- MongoDB Connection ----------
try:
    client = MongoClient('mongodb+srv://nisant54321_db_user:lPwQbLf5igvdrSEb@cluster0.krcxaus.mongodb.net/?appName=Cluster0')
    # Test the connection
    client.admin.command('ping')
    db = client['test']
    teachers_collection = db['teachers']
    print("✅ Connected to MongoDB successfully")
    print(f"📊 Database: {db.name}, Collection: {teachers_collection.name}")
except Exception as e:
    print(f"❌ MongoDB connection error: {e}")
    client = None
    db = None
    teachers_collection = None

# ---------- Helper Functions ----------

def load_teacher_face(image_url):
    try:
        print(f"📸 Loading face from URL: {image_url}")
        response = requests.get(image_url, stream=True, timeout=10)
        if response.status_code == 200:
            image_array = np.asarray(bytearray(response.content), dtype=np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            if image is None:
                print("❌ Failed to decode image")
                return None
                
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            encodings = face_recognition.face_encodings(rgb_image)
            
            if len(encodings) > 0:
                print("✅ Face encoding loaded successfully")
                return encodings[0]
            else:
                print("❌ No faces found in the image")
                return None
        else:
            print(f"❌ Failed to download image. Status: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error loading face: {str(e)}")
        return None

def mark_attendance_direct_in_db(email, face_matched, location_matched):
    """Direct database access to mark attendance"""
    try:
        if teachers_collection is None:
            print("❌ Database connection not available")
            return False, "db_connection_error"

        current_time = datetime.now()
        date_str = current_time.strftime("%Y-%m-%d")
        time_str = current_time.strftime("%H:%M:%S")
        verified = face_matched and location_matched
        
        print(f"💾 Saving attendance for {email} | Date: {date_str} | Verified: {verified}")

        # Find the teacher
        teacher = teachers_collection.find_one({"email": email})
        if not teacher:
            print(f"❌ Teacher not found: {email}")
            return False, "teacher_not_found"

        # Check existing attendance
        existing_record_index = -1
        if 'attendance' in teacher and teacher['attendance']:
            for i, record in enumerate(teacher['attendance']):
                if record.get('date') == date_str:
                    existing_record_index = i
                    break

        attendance_record = {
            "date": date_str,
            "time": time_str,
            "faceMatched": face_matched,
            "locationMatched": location_matched,
            "verified": verified
        }

        if existing_record_index != -1:
            # Update existing
            result = teachers_collection.update_one(
                {"email": email},
                {"$set": {
                    f"attendance.{existing_record_index}.time": time_str,
                    f"attendance.{existing_record_index}.faceMatched": face_matched,
                    f"attendance.{existing_record_index}.locationMatched": location_matched,
                    f"attendance.{existing_record_index}.verified": verified
                }}
            )
            action = "updated"
        else:
            # Add new
            result = teachers_collection.update_one(
                {"email": email},
                {"$push": {"attendance": attendance_record}}
            )
            action = "created"

        # if result.modified_count > 0 or (result.matched_count > 0 and action == "updated"):
        #     return True, action
        # else:
        #     return False, "no_changes"
        
        # Always treat matched_count >= 1 as success
        if result.matched_count > 0:
            return True, action
        else:
            return False, "no_changes"

    except Exception as e:
        print(f"❌ Database Error: {str(e)}")
        return False, f"error: {str(e)}"

def check_todays_attendance_direct(email):
    """Check if attendance exists for today"""
    try:
        if teachers_collection is None:
            return False, None

        today = datetime.now().strftime("%Y-%m-%d")
        teacher = teachers_collection.find_one({"email": email})
        
        if not teacher or 'attendance' not in teacher:
            return False, None

        today_attendance = next((record for record in teacher['attendance'] if record.get('date') == today), None)
        return today_attendance is not None, today_attendance

    except Exception as e:
        print(f"❌ Error checking attendance: {e}")
        return False, None

# ---------- Routes ----------

@app.route("/start_verification", methods=["POST"])
def start_verification():
    global CURRENT_TEACHER_EMAIL, KNOWN_FACE_ENCODING, video_capture, attendance_done, verification_start_time, user_location
    
    try:
        data = request.get_json()
        CURRENT_TEACHER_EMAIL = data.get("email")
        teacher_image_url = data.get("imageUrl")

        if not CURRENT_TEACHER_EMAIL or not teacher_image_url:
            return jsonify({"status": "error", "message": "Email and imageUrl required"})

        # Reset states
        user_location = None # Reset location on new start
        attendance_done = False
        
        # Check if already marked
        marked, data = check_todays_attendance_direct(CURRENT_TEACHER_EMAIL)
        if marked:
            return jsonify({
                "status": "already_marked", 
                "message": "Attendance already marked",
                "attendance_time": data.get('time')
            })

        # Load Face
        KNOWN_FACE_ENCODING = load_teacher_face(teacher_image_url)
        if KNOWN_FACE_ENCODING is None:
            return jsonify({"status": "error", "message": "Failed to load face"})

        # Init Camera
        # Note: On Mac/Linux you might need cv2.CAP_AVFOUNDATION or index 1
        video_capture = cv2.VideoCapture(0)
        if not video_capture.isOpened():
            return jsonify({"status": "error", "message": "Cannot access webcam"})
            
        verification_start_time = time.time()
        
        return jsonify({"status": "ready", "message": "System initialized"})
        
    except Exception as e:
        print(f"❌ Start Error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)})

@app.route("/set_location", methods=["POST"])
def set_location():
    global user_location
    try:
        data = request.get_json()
        lat = data.get("latitude")
        lng = data.get("longitude")
        
        if lat is None or lng is None:
            return jsonify({"status": "error", "message": "Coordinates required"})
            
        # FORCE FLOAT conversion to prevent string math errors
        user_location = (float(lat), float(lng))
        
        # Calculate immediately for debug response
        distance = geodesic(SCHOOL_LOCATION, user_location).meters
        is_within = distance <= MIN_DISTANCE_METERS
        
        print(f"📍 Location Update: {user_location}")
        print(f"📏 Distance to School: {distance:.2f} meters")
        print(f"✅ Within {MIN_DISTANCE_METERS}m? {'Yes' if is_within else 'No'}")
        
        return jsonify({
            "status": "success", 
            "message": "Location updated",
            "distance_from_school": f"{distance:.2f}m",
            "within_range": is_within
        })
        
    except Exception as e:
        print(f"❌ Location Error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)})

def generate_frames():
    global attendance_done, user_location, CURRENT_TEACHER_EMAIL
    
    face_match_counter = 0
    required_consecutive_matches = 5 # Reduced to make it faster but still safe
    
    while video_capture and video_capture.isOpened():
        success, frame = video_capture.read()
        if not success:
            continue

        # Resize for performance
        small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
        
        face_locations = face_recognition.face_locations(rgb_small_frame)
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        face_matched = False
        location_verified = False
        distance_from_school = 0.0
        
        # 1. Check Location Logic
        if user_location:
            try:
                distance_from_school = geodesic(SCHOOL_LOCATION, user_location).meters
                # Strict check against 500m
                location_verified = distance_from_school <= MIN_DISTANCE_METERS
            except Exception as e:
                print(f"Calculation Error: {e}")
                location_verified = False
        
        # 2. Check Face Logic
        for face_encoding in face_encodings:
            matches = face_recognition.compare_faces([KNOWN_FACE_ENCODING], face_encoding, tolerance=MAX_FACE_DISTANCE)
            if True in matches:
                face_matched = True
                break

        # 3. Validation Counter
        if face_matched and location_verified:
            face_match_counter += 1
        else:
            face_match_counter = 0

        # 4. Mark Attendance Trigger
        if (face_match_counter >= required_consecutive_matches and 
            not attendance_done and 
            CURRENT_TEACHER_EMAIL and
            location_verified):
            
            print("🚀 Verifying Attendance...")
            success_db, action = mark_attendance_direct_in_db(
                CURRENT_TEACHER_EMAIL, 
                face_matched, 
                location_verified
            )
            
            if success_db:
                attendance_done = True
                face_match_counter = 0
                print("✅ Attendance Finalized.")

        # 5. Drawing UI on Frame
        for (top, right, bottom, left) in face_locations:
            top *= 4; right *= 4; bottom *= 4; left *= 4
            
            # Color logic: Green if matched AND location good, else Red or Orange
            if face_matched and location_verified:
                color = (0, 255, 0) # Green
                label = "Verified"
            elif face_matched and not location_verified:
                color = (0, 165, 255) # Orange (Face Good, Location Bad)
                label = "Location Fail"
            else:
                color = (0, 0, 255) # Red
                label = "Unknown"

            cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
            cv2.putText(frame, label, (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        # Status HUD
        if user_location:
            loc_status = f"{distance_from_school:.1f}m"
            loc_color = "✅" if location_verified else "❌"
        else:
            loc_status = "Waiting..."
            loc_color = "⚠️"

        status_text = f"Face: {'✅' if face_matched else '❌'} | Loc: {loc_color} ({loc_status})"
        
        cv2.rectangle(frame, (0, 0), (640, 40), (0, 0, 0), -1) # Black background for text
        cv2.putText(frame, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        if attendance_done:
            cv2.putText(frame, "ATTENDANCE RECORDED", (10, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 3)

        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            continue
            
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route("/video_feed")
def video_feed():
    if video_capture is None:
        return "Video capture not initialized", 400
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/status")
def status():
    # Helper endpoint for JS to poll status
    dist = 0
    is_range = False
    
    if user_location:
        dist = geodesic(SCHOOL_LOCATION, user_location).meters
        is_range = dist <= MIN_DISTANCE_METERS

    return jsonify({
        "teacher_email": CURRENT_TEACHER_EMAIL,
        "face_loaded": KNOWN_FACE_ENCODING is not None,
        "location_set": user_location is not None,
        "distance_from_school": dist,
        "within_school_range": is_range,
        "attendance_done": attendance_done
    })

@app.route("/stop_verification", methods=["POST"])
def stop_verification():
    global video_capture, attendance_done, CURRENT_TEACHER_EMAIL, KNOWN_FACE_ENCODING, user_location
    if video_capture:
        video_capture.release()
    video_capture = None
    attendance_done = False
    CURRENT_TEACHER_EMAIL = None
    KNOWN_FACE_ENCODING = None
    user_location = None # Clean up location
    return jsonify({"status": "stopped", "message": "System stopped"})

if __name__ == "__main__":
    print(f"🚀 Server running on port 5001")
    print(f"📍 School Target: {SCHOOL_LOCATION}")
    print(f"📏 Max Distance: {MIN_DISTANCE_METERS} meters")
    app.run(port=5001, debug=True)


