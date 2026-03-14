import logging
import os
import sys
import warnings

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from src.config import KNOWN_FACES_DIR

# Suppress annoying stdout and warnings from InsightFace / ONNX
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
logging.getLogger("insightface").setLevel(logging.ERROR)


class FaceRecognizer:
    def __init__(self):
        print("Initializing Home Security System...")
        print("Loading AI Model (InsightFace) silently...")

        # Suppress ONNX C++ printed warnings by redirecting stdout momentarily
        old_stdout = sys.stdout
        sys.stdout = open(os.devnull, "w")

        try:
            # buffalo_l is the default model pack containing RetinaFace (det) and ArcFace (rec)
            self.app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
            # ctx_id=0 uses CPU by default, det_size sets input size for detection
            self.app.prepare(ctx_id=0, det_size=(640, 640))
        finally:
            sys.stdout.close()
            sys.stdout = old_stdout

        print("AI Model Loaded Successfully.")

        self.known_embeddings = []  # list of 512-d numpy arrays
        self.known_names = []  # corresponding names
        self.is_trained = False

        # ArcFace uses cosine similarity.
        # Range is [-1, 1], where 1 is identical.
        # Threshold usually between 0.35 and 0.50 (stricter).
        self.similarity_threshold = 0.40

        self.load_and_train()

    def load_and_train(self):
        """Loads images, detects faces, and generates 512-d embeddings via InsightFace."""
        print(f"Loading known faces from {KNOWN_FACES_DIR} for embeddings...")

        for person_name in os.listdir(KNOWN_FACES_DIR):
            person_dir = os.path.join(KNOWN_FACES_DIR, person_name)
            if not os.path.isdir(person_dir):
                continue

            for img_name in os.listdir(person_dir):
                img_path = os.path.join(person_dir, img_name)
                img = cv2.imread(img_path)
                if img is None:
                    continue

                # Get faces from InsightFace
                faces = self.app.get(img)
                if not faces:
                    print(f"No face found in {img_path}")
                    continue

                # Take the first (largest/most prominent face usually)
                face = faces[0]
                embedding = face.embedding

                self.known_embeddings.append(embedding)
                self.known_names.append(person_name)

        if len(self.known_embeddings) > 0:
            self.is_trained = True
            print(
                f"Encoding complete. Model knows {len(self.known_embeddings)} face variants using ArcFace."
            )
        else:
            print("No known faces found to encode.")

    def add_face_embedding(self, name: str, image_frame) -> bool:
        """
        Incrementally add a single new embedding without rescanning all images.
        Runs InsightFace on the provided BGR frame and appends the result.
        Returns True if a face was found and added, False otherwise.
        """
        faces = self.app.get(image_frame)
        if not faces:
            print(f"[add_face_embedding] No face detected in frame for '{name}'.")
            return False

        embedding = faces[0].embedding
        self.known_embeddings.append(embedding)
        self.known_names.append(name)
        self.is_trained = True
        print(
            f"[add_face_embedding] Added embedding for '{name}'. Total: {len(self.known_embeddings)}."
        )
        return True

    def compute_sim(self, feat1, feat2):
        from numpy.linalg import norm

        return np.dot(feat1, feat2) / (norm(feat1) * norm(feat2))

    def process_frame(self, frame: np.ndarray):
        """
        Process a frame: detect faces and compare ArcFace embeddings.
        Returns: [(x, y, w, h, name, is_known, landmarks), ...]
        where landmarks is a 5x2 numpy array of (x, y) coordinates for eyes, nose, and mouth corners.
        """
        # insightface app.get handles detection and embedding calculation in one step
        faces = self.app.get(frame)

        results = []
        for face in faces:
            # bbox is [left, top, right, bottom]
            box = face.bbox.astype(int)
            startX, startY, endX, endY = box

            fw = endX - startX
            fh = endY - startY

            name = "Unknown"
            is_known = False

            if self.is_trained:
                embedding = face.embedding

                best_sim = -1.0
                best_match_idx = -1

                for idx, known_emb in enumerate(self.known_embeddings):
                    sim = self.compute_sim(embedding, known_emb)
                    if sim > best_sim:
                        best_sim = sim
                        best_match_idx = idx

                if best_sim > self.similarity_threshold:
                    name = self.known_names[best_match_idx]
                    is_known = True

            # landmarks (kps) is a 5x2 array: list of [x, y] coordinates
            landmarks = face.kps.astype(int) if face.kps is not None else None

            results.append((startX, startY, fw, fh, name, is_known, landmarks))

        return results
