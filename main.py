import sys

import cv2
import numpy as np

from src.alerts.console import ConsoleAlert
from src.alerts.telegram import TelegramAlert
from src.camera.stream import CameraStreamWrapper
from src.camera.tapo import TapoCamera
from src.camera.webcam import MacbookWebcam
from src.config import ACTIVE_ALERT, ACTIVE_CAMERAS
from src.recognition.face_ops import FaceRecognizer


def get_camera(cam_config):
    cam_type = cam_config.get("type")

    if cam_type == "macbook":
        return MacbookWebcam()
    elif cam_type == "tapo":
        return TapoCamera(
            username=cam_config.get("user", "admin"),
            password=cam_config.get("pass", "password"),
            ip_address=cam_config.get("ip", "192.168.1.100"),
        )
    else:
        raise ValueError(f"Unknown camera type: {cam_type}")


def get_alert():
    if ACTIVE_ALERT == "console":
        return ConsoleAlert(cooldown_seconds=10)
    elif ACTIVE_ALERT == "telegram":
        return TelegramAlert(bot_token="YOUR_BOT_TOKEN", chat_id="YOUR_CHAT_ID")
    else:
        raise ValueError(f"Unknown alert: {ACTIVE_ALERT}")


def stack_frames(frames: list[np.ndarray]) -> np.ndarray:
    """
    Safely stacks multiple camera frames horizontally without forcing them into an arbitrary square grid,
    preserving natural aspect ratio. Assumes frames are resized to a common height, or if only 1 frame,
    returns it natively unmodified.
    """
    if not frames:
        return np.zeros((480, 640, 3), dtype=np.uint8)

    if len(frames) == 1:
        return frames[0]

    # Find the smallest height to normalize everything safely side-by-side
    min_h = min(f.shape[0] for f in frames)

    resized = []
    for f in frames:
        h, w = f.shape[:2]
        if h != min_h:
            # Scale proportionally
            scale = min_h / h
            new_w = int(w * scale)
            resized.append(cv2.resize(f, (new_w, min_h)))
        else:
            resized.append(f)

    # Stack horizontally (side-by-side)
    return np.hstack(resized)


def main():
    print("Initializing Home Security System (Single Machine)...")

    recognizer = FaceRecognizer()
    alert_manager = get_alert()

    # Wrap every camera in a background grabber thread
    streams: list[CameraStreamWrapper] = []
    for cam_config in ACTIVE_CAMERAS:
        cam_name = cam_config.get("name", "Camera")
        stream = CameraStreamWrapper(camera=get_camera(cam_config), name=cam_name)
        streams.append(stream)

    try:
        for stream in streams:
            stream.start()
            print(f"Started camera: {stream.name}")
    except Exception as e:
        print(f"Error starting cameras: {e}")
        sys.exit(1)

    print("Cameras live. Press 'q' in the display window to quit.")

    try:
        while True:
            display_frames: list[np.ndarray] = []
            unknown_detected = False
            trigger_frame = None

            for stream in streams:
                frame = stream.get_latest_frame()
                if frame is None:
                    continue

                for x, y, w, h, name, is_known, landmarks in recognizer.process_frame(frame):
                    # Green for known, Red for unknown
                    color = (0, 255, 0) if is_known else (0, 0, 255)

                    # Draw Bounding Box and Name
                    cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
                    cv2.putText(frame, name, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)

                    # Draw the 5 facial landmarks (eyes, nose tip, mouth corners)
                    if landmarks is not None:
                        for lx, ly in landmarks:
                            # Draw tiny yellow filled circles - `cv2.FILLED = -1`
                            cv2.circle(
                                frame,
                                (int(lx), int(ly)),
                                radius=2,
                                color=(0, 255, 255),
                                thickness=-1,
                            )

                    if not is_known:
                        unknown_detected = True
                        trigger_frame = frame.copy()

                # Overlay camera name label
                cv2.putText(
                    frame, stream.name, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2
                )
                display_frames.append(frame)

            if unknown_detected:
                alert_manager.send_alert("Unknown person detected!", image_frame=trigger_frame)

            if display_frames:
                cv2.imshow("Home Security Dashboard", stack_frames(display_frames))

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    except KeyboardInterrupt:
        print("\nStopping via keyboard interrupt...")
    finally:
        for stream in streams:
            stream.stop()
        cv2.destroyAllWindows()
        print("System stopped cleanly.")


if __name__ == "__main__":
    main()
