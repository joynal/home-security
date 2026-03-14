"""
src/api/pose.py
───────────────
Head-pose detection from InsightFace keypoints.
Uses interocular-distance normalisation so thresholds are
independent of camera distance and face size.
"""

import numpy as np


def compute_pose(kps_array: np.ndarray, bbox: list) -> dict:
    """
    Given 5 facial keypoints and a bounding box, return the head pose.

    KPS order (InsightFace buffalo_l):
        [right_eye, left_eye, nose_tip, right_mouth, left_mouth]

    Returns
    -------
    dict with keys: pose (str), offset_x (float), offset_y (float)
        offset_x  positive → nose right of midpoint (user turned their right)
        offset_y  frontal ≈ 1.2–1.8 interocular units below eye midpoint
    """
    if kps_array is None or len(kps_array) < 3:
        return {"pose": "none", "offset_x": 0.0, "offset_y": 0.0}

    # Interocular distance — scale-invariant denominator
    dx = float(kps_array[1][0] - kps_array[0][0])
    dy = float(kps_array[1][1] - kps_array[0][1])
    eye_dist = max(float(np.sqrt(dx * dx + dy * dy)), 1.0)

    eye_mid_x = (kps_array[0][0] + kps_array[1][0]) / 2.0
    eye_mid_y = (kps_array[0][1] + kps_array[1][1]) / 2.0
    nose = kps_array[2]

    h_offset = (nose[0] - eye_mid_x) / eye_dist  # horizontal turn
    v_offset = (nose[1] - eye_mid_y) / eye_dist  # vertical tilt

    # Thresholds (calibrated for typical desk webcam)
    H_THRESH = 0.40  # 40 % of eye-width → confirmed turn
    V_UP = 1.05  # nose very close to eye line → looking up
    V_DOWN = 1.90  # nose far below eye line → looking down
    # Center band: V_UP < v_offset < V_DOWN

    if h_offset < -H_THRESH:
        pose = "left"
    elif h_offset > H_THRESH:
        pose = "right"
    elif v_offset < V_UP:
        pose = "up"
    elif v_offset > V_DOWN:
        pose = "down"
    else:
        pose = "center"

    return {
        "pose": pose,
        "offset_x": round(float(h_offset), 3),
        "offset_y": round(float(v_offset), 3),
    }
