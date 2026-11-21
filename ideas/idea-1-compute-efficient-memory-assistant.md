# Idea 1: Compute-Efficient AI Personal Relationship & Memory Assistant

## 📌 Executive Summary

> **CodeJam 16 Track Alignment:** Agent Solution (Financial & Environmental Compute Efficiency) / Health or People First

This project is a compute-efficient, AI-powered personal relationship and memory assistant built for CodeJam 16 that identifies the people you interact with in real time, automatically logs your conversations into a growing longitudinal database, and surfaces instant contextual recall and conversational guidance whenever you re-encounter them. 

Designed to align with CodeJam 16’s emphasis on avoiding wasteful token usage and generic assistant clones—making it an ideal fit for the Agent Solution track’s focus on financial and environmental compute efficiency, as well as Health or People First—the system decouples visual identification from heavy generative AI by using a classical computer vision pipeline (`opencv-contrib-python`) on the CPU as a zero-GPU gatekeeper.

---

## 🏗️ Core Architecture & Pipeline

### 1. Zero-GPU Classical Computer Vision Gatekeeper (CPU)
* **Face Detection:** Frontal face detection on live camera feed using Haar Cascades (`cv2.CascadeClassifier`) or HOG + Linear SVM.
* **Geometric Alignment:** Extract eye coordinates to normalize and align face angle.
* **Pre-processing:** Fixed-size grayscale crop with Contrast Limited Adaptive Histogram Equalization (CLAHE) to neutralize uneven indoor lighting.
* **Recognition:** Local Binary Patterns Histograms (`LBPHFaceRecognizer_create`).
  * **Enrollment:** 3-second, 30-frame burst enrollment mode.
  * **Incremental Updates:** Continual updates to enrolled profiles without requiring complete retraining.
* **Temporal Filtering & Tracking:**
  * Requires temporal majority voting (e.g., 8 out of 10 consecutive frames below a strict distance threshold) to suppress false positives.
  * Hands off confirmed bounding boxes to Lucas-Kanade Optical Flow or CSRT tracking to bypass redundant per-frame facial inference.

### 2. Contextual Recall & Longitudinal Memory
* Once a `person_id` is verified and locked, the system queries a local SQLite and vector memory store.
* Surfaces an immediate, concise **encounter brief**:
  * Summary of past discussions.
  * Pending follow-ups and unresolved topics.
  * Tailored, context-sensitive talking points.

### 3. On-Demand Speech-to-Text & Targeted LLM Extraction
* Avoids continuous audio streaming and wasteful token burning.
* Employs an explicit, user-triggered recording toggle to capture new interactions.
* Runs local transcription via `faster-whisper`.
* Invokes an LLM **only** when an interaction has concluded to extract structured facts, relational insights, and action items into the database.

### 4. Real-Time Telemetry & Transparency HUD
* Exposes live diagnostic telemetry for both users and hackathon judges:
  * CLAHE-normalized facial crop.
  * LBP texture map visualization.
  * Match distance score against threshold.
  * Live compute metrics: CPU utilization, skipped inferences, and estimated token/cost savings.

---

## 🎯 Original Proposal Text

```text
This project is a compute-efficient, AI-powered personal relationship and memory assistant built for CodeJam 16 that identifies the people you interact with in real time, automatically logs your conversations into a growing longitudinal database, and surfaces instant contextual recall and conversational guidance whenever you re-encounter them. Designed to align with CodeJam 16’s emphasis on avoiding wasteful token usage and generic assistant clones—making it an ideal fit for the Agent Solution track’s focus on financial and environmental compute efficiency, as well as Health or People First—the system decouples visual identification from heavy generative AI by using a classical computer vision pipeline (opencv-contrib-python) on the CPU as a zero-GPU gatekeeper. First, a live camera feed runs frontal face detection using Haar Cascades (cv2.CascadeClassifier) or HOG + Linear SVM, extracts eye coordinates to geometrically align the face, converts the region of interest to a fixed-size grayscale crop, and applies Contrast Limited Adaptive Histogram Equalization (CLAHE) to neutralize uneven indoor lighting. Next, a Local Binary Patterns Histograms (LBPHFaceRecognizer_create) model—initialized via a 3-second, 30-frame burst enrollment mode and incrementally updatable without full retraining—matches facial texture histograms against enrolled profiles, using temporal majority voting (requiring 8 out of 10 consecutive frames below a strict distance threshold) to prevent false positives and handing off confirmed bounding boxes to Lucas-Kanade Optical Flow or CSRT tracking to skip redundant per-frame inference. Once a known person_id is locked in, the system queries a local SQLite and vector memory store to immediately display a concise encounter brief summarizing past discussions, unresolved follow-ups, and tailored talking points, while an explicit, user-triggered recording toggle captures new conversations via faster-whisper speech-to-text and extracts structured facts and relationship insights via an LLM only when an interaction actually occurs. Finally, the interface exposes real-time diagnostic telemetry—displaying the CLAHE-normalized crop, LBP texture map, match distance score, and live CPU and token savings—so both users and judges can transparently see how the pipeline operates under the hood rather than just its final outputs.
```
