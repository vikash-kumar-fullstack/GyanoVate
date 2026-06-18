import cv2
from ultralytics import YOLO
from flask import Flask, jsonify
from datetime import datetime
import os

app = Flask(__name__)

print("Loading YOLO model...")
model = YOLO("yolov8m.pt")
print("Model loaded!\n")

def count_students(frame):
    results = model(frame, imgsz=640, verbose=False)
    count = 0
    for r in results:
        for b in r.boxes:
            cls = int(b.cls[0])
            if cls == 0:
                conf = float(b.conf[0])
                if conf > 0.35:
                    count += 1
    return count

@app.route("/capture_students")
def capture_students():
    print("📷 Opening camera...")

    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        return jsonify({"error": "Camera not accessible"}), 500

    # warmup frames
    for _ in range(5):
        cap.read()

    ret, frame = cap.read()
    cap.release()

    if not ret:
        return jsonify({"error": "Capture failed"}), 500

    print("📸 Captured image")

    os.makedirs("captures", exist_ok=True)

    filename = f"captures/class_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    cv2.imwrite(filename, frame)

    print("🔍 Detecting students...")
    count = count_students(frame)

    print(f"🎓 Students detected: {count}")

    return jsonify({
        "studentCount": count,
        "imagePath": filename
    })


if __name__ == "__main__":
    app.run(port=5002, debug=True)