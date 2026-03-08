import logging
import os
import sys
import time
import warnings

import cv2
from insightface.app import FaceAnalysis

from src.config import KNOWN_FACES_DIR


def capture_face():
    print("====================================")
    print("      ADD KNOWN PERSON UTILITY     ")
    print("====================================")

    person_name = input("Enter the name of the person: ").strip()
    if not person_name:
        print("Name cannot be empty.")
        return

    person_dir = os.path.join(KNOWN_FACES_DIR, person_name)
    os.makedirs(person_dir, exist_ok=True)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open the webcam.")
        return

    print("Loading InsightFace AI silently...")

    warnings.filterwarnings("ignore", category=UserWarning)
    warnings.filterwarnings("ignore", category=FutureWarning)
    logging.getLogger("insightface").setLevel(logging.ERROR)

    old_stdout = sys.stdout
    sys.stdout = open(os.devnull, "w")

    try:
        app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=0, det_size=(640, 640))
    finally:
        sys.stdout.close()
        sys.stdout = old_stdout

    print("AI Model Loaded Successfully.")

    count = 0
    existing_files = [
        f for f in os.listdir(person_dir) if f.startswith("face_") and f.endswith(".jpg")
    ]
    if existing_files:
        nums = [int(f.split("_")[1].split(".")[0]) for f in existing_files]
        count = max(nums) + 1

    phases = [
        ("Look straight into the camera", 10),
        ("Turn your head SLIGHTLY left", 10),
        ("Turn your head SLIGHTLY right", 10),
        ("Look SLIGHTLY up", 5),
        ("Look SLIGHTLY down", 5),
    ]

    print("\nInstructions:")
    print(" The system will automatically capture photos while instructing you.")
    print(" You will see your facial landmarks highlighted in green when detected.")
    print("\nPress ENTER when you are ready to begin...")
    input()

    try:
        phase_idx = 0
        frames_captured_in_phase = 0
        last_capture_time = time.time()

        while phase_idx < len(phases):
            ret, frame = cap.read()
            if not ret:
                break

            current_instruction, max_frames = phases[phase_idx]
            display_frame = frame.copy()

            # InsightFace Detection
            faces = app.get(frame)
            face_detected = len(faces) > 0

            if face_detected:
                for face in faces:
                    box = face.bbox.astype(int)
                    cv2.rectangle(display_frame, (box[0], box[1]), (box[2], box[3]), (255, 0, 0), 2)

                    # Draw 5 landmarks
                    if face.kps is not None:
                        for _idx, kp in enumerate(face.kps):
                            kp = kp.astype(int)
                            cv2.circle(display_frame, tuple(kp), 2, (0, 255, 0), 2)

            cv2.putText(
                display_frame,
                current_instruction,
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 255),
                2,
            )
            cv2.putText(
                display_frame,
                f"Capturing: {frames_captured_in_phase}/{max_frames}",
                (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2,
            )

            cv2.imshow("Capture Face", display_frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break

            current_time = time.time()
            if face_detected and (current_time - last_capture_time) > 0.3:
                file_path = os.path.join(person_dir, f"face_{count}.jpg")
                cv2.imwrite(file_path, frame)

                cv2.rectangle(
                    display_frame,
                    (0, 0),
                    (display_frame.shape[1], display_frame.shape[0]),
                    (0, 255, 0),
                    10,
                )
                cv2.imshow("Capture Face", display_frame)
                cv2.waitKey(100)

                count += 1
                frames_captured_in_phase += 1
                last_capture_time = time.time()

                if frames_captured_in_phase >= max_frames:
                    phase_idx += 1
                    frames_captured_in_phase = 0
                    if phase_idx < len(phases):
                        print(f"\nNext phase: {phases[phase_idx][0]}")
                        time.sleep(1.5)

    finally:
        cap.release()
        cv2.destroyAllWindows()

    print(f"\nSuccessfully added {count} photos.")


if __name__ == "__main__":
    capture_face()
