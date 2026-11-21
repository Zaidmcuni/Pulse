# Idea 2: Real-Time Two-Way American Sign Language (ASL) Translator

## 📌 Executive Summary

> **CodeJam 16 Track Alignment:** Health Track (Improving quality of life for Deaf / hard-of-hearing individuals) / Compute Efficiency & Visible Engineering

This project is a real-time, two-way American Sign Language (ASL) translation application built for CodeJam 16 that bridges everyday communication between Deaf or hard-of-hearing signers and non-signers by converting ASL fingerspelling (A–Z) and common conversational phrases into clean text and spoken audio, while providing reverse visual ASL sign guides for replies.

Tailored to the Health track’s focus on improving quality of life for people with disabilities—and aligned with CodeJam 16’s emphasis on compute efficiency and transparent, visible engineering—the system avoids brittle raw-pixel or skin-tone classifiers in favor of a fast, CPU-only geometric landmark pipeline.

---

## 🏗️ Core Architecture & Pipeline

### 1. CPU-Only Geometric Landmark Extraction
* **Webcam Capture & Tracking:** Live webcam stream processed via Google MediaPipe’s `HandLandmarker` (`LIVE_STREAM` mode) in Python.
* **Keypoints:** Extracts 21 3D hand-knuckle keypoints $(x, y, z)$ and handedness with ~17 ms latency on standard laptop CPU hardware.
* **Invariant Normalization:**
  * Translates coordinates by subtracting the wrist anchor (`landmark[0]`) from all 21 keypoints.
  * Normalizes scale by dividing by maximum palm width.
  * Produces a lighting-, skin-tone-, and distance-independent 63-float feature vector.

### 2. Dual Classification Architecture (Static & Dynamic Signs)
* **Static Letters & Gestures (A–I, K–Y):** Lightweight `scikit-learn` classifier (`RandomForestClassifier`, SVM, or compact MLP) trained on rapidly captured venue samples for immediate frame-by-frame decoding.
* **Dynamic Motion Letters (J, Z) & Multi-Frame Phrases:** Rolling 15-to-20-frame sliding window of landmark velocity deltas fed into a compact 1D-CNN or LSTM to detect motion trajectories and conversational phrases ("Hello", "Thank you", "Help").

### 3. Sentence Assembly & Error Suppression
* **Temporal Stability Buffer:** Requires predictions to hold steady for ~0.8 seconds before committing characters, eliminating duplicate-letter flicker.
* **Editing Gestures:** Dedicated physical gestures for spacebar and backspace.
* **Text Post-Processing:** Dictionary-based autocorrect and n-gram word completion to construct coherent, fluent sentences.

### 4. Bidirectional Communication & Telemetry HUD
* **Forward Mode (Signer $\rightarrow$ Non-Signer):** Text-to-speech engine speaks the assembled sentences aloud in real time.
* **Reverse Mode (Non-Signer $\rightarrow$ Signer):** Converts typed text or spoken speech into step-by-step visual ASL sign prompts/guides.
* **Judge Telemetry HUD:** Displays a live 21-point hand skeleton overlay, predicted joint angles, confidence score, and inference latency telemetry to demonstrate transparent under-the-hood engineering.

---

## 🎯 Original Proposal Text

```text
This project is a real-time, two-way American Sign Language (ASL) translation application built for CodeJam 16 that bridges everyday communication between Deaf or hard-of-hearing signers and non-signers by converting ASL fingerspelling (A–Z) and common conversational phrases into clean text and spoken audio, while providing reverse visual ASL sign guides for replies. Tailored to the Health track’s focus on improving quality of life for people with disabilities—and aligned with CodeJam 16’s emphasis on compute efficiency and transparent, visible engineering—the system avoids brittle raw-pixel or skin-tone classifiers in favor of a fast, CPU-only geometric landmark pipeline. First, a live webcam stream passes frames through MediaPipe’s HandLandmarker (LIVE_STREAM mode) in Python to extract 21 3D hand-knuckle keypoints $(x, y, z)$ and handedness at roughly 17 ms latency on a standard laptop CPU. Next, a normalization layer achieves translation and scale invariance by subtracting the wrist anchor (landmark[0]) from all 21 points and dividing by maximum palm width, transforming each frame into a lighting- and distance-independent 63-float feature vector. For sign classification, a lightweight scikit-learn model (RandomForestClassifier, SVM, or compact MLP) trained on rapidly captured venue samples decodes static letters and gestures, while a rolling 15-to-20-frame sliding window of landmark velocity deltas feeds a compact 1D-CNN or LSTM to capture dynamic motion letters (J, Z) and multi-frame phrases such as "Hello", "Thank you", and "Help". To eliminate duplicate-letter flicker, a temporal stability buffer commits characters only after predictions hold steady for ~0.8 seconds, combining with dedicated space/backspace gestures and dictionary-based word autocorrect to assemble coherent sentences. Finally, the interface displays a live 21-point hand skeleton overlay alongside real-time confidence and latency telemetry so judges can clearly see how the pipeline interprets finger geometry under the hood, speaks completed sentences aloud via text-to-speech, and converts typed or spoken responses back into step-by-step visual ASL sign prompts for seamless bidirectional interaction.
```
