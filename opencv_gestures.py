"""
Modul Avansat de Gesturi și Viziune Artificială (OpenCV / Python - USV AI/AR).

Funcționalități:
  1. Detecție Gesturi cu Degetul Mare:
     - 👍 Thumbs Up    -> Alege Titlul A (sau „Mai mare”)
     - 👎 Thumbs Down  -> Alege Titlul B (sau „Mai mic”)
     - 👈 Thumb Left   -> Alege Titlul A (Stânga)
     - 👉 Thumb Right  -> Alege Titlul B (Dreapta)

  2. Detecție Clipit din Ochi (Eye Wink / Blink Detection - Haar Cascades):
     - 😉 Clipit ochi stâng (Left Wink)   -> Alege Titlul A
     - 😉 Clipit ochi drept (Right Wink)  -> Alege Titlul B
     - 👀 Clipire amândoi ochii (Blink)   -> Următoarea întrebare (Next)

Transmite comenzile în timp real prin WebSocket (port 8765) către jocul web (AR sau 2D).
"""

import asyncio
import json
import math
import sys
import threading
import time
import cv2
import numpy as np
import websockets

WS_HOST = "127.0.0.1"
WS_PORT = 8765
HOLD_SECONDS = 0.40
COOLDOWN_SECONDS = 0.45
WINK_FRAMES_REQ = 4

CLIENTS = set()
ws_loop = None

# Încărcare clasificatori Haar OpenCV
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")


async def broadcast(message: dict):
    if not CLIENTS:
        return
    payload = json.dumps(message)
    await asyncio.gather(
        *[client.send(payload) for client in list(CLIENTS)],
        return_exceptions=True,
    )


def send_action(action: str, choice: str = None, gesture: str = "", eye: str = None):
    if ws_loop and ws_loop.is_running():
        msg = {"action": action, "choice": choice, "gesture": gesture, "eye": eye}
        asyncio.run_coroutine_threadsafe(broadcast(msg), ws_loop)


async def server_worker():
    global ws_loop
    ws_loop = asyncio.get_running_loop()

    async def handler(websocket):
        CLIENTS.add(websocket)
        print(f"[WebSocket] Conexiune stabilită cu browserul! ({websocket.remote_address})")
        try:
            await websocket.wait_closed()
        finally:
            CLIENTS.discard(websocket)
            print("[WebSocket] Conexiune închisă cu browserul.")

    async with websockets.serve(handler, WS_HOST, WS_PORT):
        print(f"[WebSocket] Server de gesturi și clipit activ pe ws://{WS_HOST}:{WS_PORT}")
        await asyncio.Event().wait()


def start_server_thread():
    t = threading.Thread(target=lambda: asyncio.run(server_worker()), daemon=True)
    t.start()
    return t


def classify_thumb_gesture(contour, cx, cy, w, h):
    """
    Analizează direcția degetului mare față de centroidul mâinii (cx, cy).
    """
    topmost = tuple(contour[contour[:, :, 1].argmin()][0])
    bottommost = tuple(contour[contour[:, :, 1].argmax()][0])
    leftmost = tuple(contour[contour[:, :, 0].argmin()][0])
    rightmost = tuple(contour[contour[:, :, 0].argmax()][0])

    d_top = cy - topmost[1]
    d_bottom = bottommost[1] - cy
    d_left = cx - leftmost[0]
    d_right = rightmost[0] - cx

    min_dist = max(w, h) * 0.35

    # 1. Thumbs Up
    if d_top > min_dist and d_top > max(d_bottom, d_left, d_right) * 1.25:
        return "thumbs_up", "A", "👍", "Titlul A (Mai mare)", topmost

    # 2. Thumbs Down
    if d_bottom > min_dist and d_bottom > max(d_top, d_left, d_right) * 1.25:
        return "thumbs_down", "B", "👎", "Titlul B (Mai mic)", bottommost

    # 3. Thumb Left
    if d_left > min_dist and d_left > max(d_top, d_bottom, d_right) * 1.25:
        return "thumb_left", "A", "👈", "Titlul A (Stânga)", leftmost

    # 4. Thumb Right
    if d_right > min_dist and d_right > max(d_top, d_bottom, d_left) * 1.25:
        return "thumb_right", "B", "👉", "Titlul B (Dreapta)", rightmost

    return None, None, "", "", None


def process_eyes_and_winks(gray_frame, color_frame):
    """
    Detectează fața și ochii pentru recunoașterea clipitului din ochi (wink).
    """
    faces = face_cascade.detectMultiScale(gray_frame, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))
    if len(faces) == 0:
        return None, None

    # Luăm cea mai mare față (utilizatorul principal)
    fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    cv2.rectangle(color_frame, (fx, fy), (fx + fw, fy + fh), (80, 80, 80), 1)

    # Zona ochilor (jumătatea superioară a feței)
    eye_roi_y1 = fy + int(fh * 0.22)
    eye_roi_y2 = fy + int(fh * 0.55)
    eye_roi_x1 = fx
    eye_roi_x2 = fx + fw

    eye_gray = gray_frame[eye_roi_y1:eye_roi_y2, eye_roi_x1:eye_roi_x2]
    eye_color = color_frame[eye_roi_y1:eye_roi_y2, eye_roi_x1:eye_roi_x2]

    # Împărțire în stânga / dreapta privitorului (ecran oglindit: stânga ecran = ochi stâng al utilizatorului)
    mid_x = fw // 2
    left_eye_roi = eye_gray[:, :mid_x]
    right_eye_roi = eye_gray[:, mid_x:]

    eyes_left = eye_cascade.detectMultiScale(left_eye_roi, 1.15, 3, minSize=(20, 20))
    eyes_right = eye_cascade.detectMultiScale(right_eye_roi, 1.15, 3, minSize=(20, 20))

    has_left = len(eyes_left) > 0
    has_right = len(eyes_right) > 0

    # Desenare boxuri ochi
    for ex, ey, ew, eh in eyes_left:
        cv2.rectangle(eye_color, (ex, ey), (ex + ew, ey + eh), (0, 255, 0), 2)
    for ex, ey, ew, eh in eyes_right:
        cv2.rectangle(eye_color, (mid_x + ex, ey), (mid_x + ex + ew, ey + eh), (0, 255, 0), 2)

    return has_left, has_right


def main():
    print("=" * 65)
    print("  MAI MARE SAU MAI MIC - Super Tool OpenCV (Gesturi + Clipit)")
    print("=" * 65)
    print("  👍 Thumbs Up          -> Titlul A (sau Mai mare)")
    print("  👎 Thumbs Down        -> Titlul B (sau Mai mic)")
    print("  👈 Thumb Left         -> Titlul A (Stânga)")
    print("  👉 Thumb Right        -> Titlul B (Dreapta)")
    print("  😉 Clipit Ochi Stâng  -> Titlul A")
    print("  😉 Clipit Ochi Drept  -> Titlul B")
    print("  👀 Clipire Ambii Ochi -> Următoarea întrebare (Next)")
    print("  Apasă 'q' sau 'ESC' în fereastra video pentru oprire.")
    print("=" * 65)

    start_server_thread()
    time.sleep(0.3)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[Eroare] Nu am putut deschide camera web (index 0).")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    current_gesture = None
    gesture_start_time = 0.0
    cooldown_until = 0.0

    left_wink_counter = 0
    right_wink_counter = 0
    both_blink_counter = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        h_frame, w_frame = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        now = time.time()
        action_triggered = False

        # ---------------- 1. Detecție Clipit din Ochi (Wink / Blink) ----------------
        has_l, has_r = process_eyes_and_winks(gray, frame)

        if has_l is not None and now >= cooldown_until:
            # Ochi stâng închis, ochi drept deschis
            if (not has_l) and has_r:
                left_wink_counter += 1
                right_wink_counter = 0
                both_blink_counter = 0
                if left_wink_counter >= WINK_FRAMES_REQ:
                    send_action("choose", "A", "😉", eye="left")
                    print("[OpenCV] >>> 😉 CLIPIT OCHI STÂNG -> Alege Titlul A")
                    cooldown_until = now + COOLDOWN_SECONDS
                    left_wink_counter = 0
                    action_triggered = True

            # Ochi drept închis, ochi stâng deschis
            elif has_l and (not has_r):
                right_wink_counter += 1
                left_wink_counter = 0
                both_blink_counter = 0
                if right_wink_counter >= WINK_FRAMES_REQ:
                    send_action("choose", "B", "😉", eye="right")
                    print("[OpenCV] >>> 😉 CLIPIT OCHI DREPT -> Alege Titlul B")
                    cooldown_until = now + COOLDOWN_SECONDS
                    right_wink_counter = 0
                    action_triggered = True

            # Ambii ochi închiși scurt
            elif (not has_l) and (not has_r):
                both_blink_counter += 1
                if both_blink_counter >= WINK_FRAMES_REQ:
                    send_action("next", None, "👀")
                    print("[OpenCV] >>> 👀 CLIPIRE AMBII OCHI -> Următoarea întrebare")
                    cooldown_until = now + COOLDOWN_SECONDS
                    both_blink_counter = 0
                    action_triggered = True
            else:
                left_wink_counter = 0
                right_wink_counter = 0
                both_blink_counter = 0

        # ---------------- 2. Detecție Mână și Deget Mare ----------------
        roi_x1 = int(w_frame * 0.35)
        roi_y1 = int(h_frame * 0.2)
        roi_x2 = int(w_frame * 0.95)
        roi_y2 = int(h_frame * 0.95)

        roi = frame[roi_y1:roi_y2, roi_x1:roi_x2]
        ycrcb = cv2.cvtColor(roi, cv2.COLOR_BGR2YCrCb)
        mask = cv2.inRange(ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.erode(mask, kernel, iterations=1)
        mask = cv2.dilate(mask, kernel, iterations=2)
        mask = cv2.GaussianBlur(mask, (7, 7), 0)
        _, mask = cv2.threshold(mask, 128, 255, cv2.THRESH_BINARY)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        detected_gesture = None
        choice = None
        icon = ""
        label = ""
        tip_point = None

        if contours:
            largest_cnt = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest_cnt)

            if area > 4500:
                cv2.drawContours(roi, [largest_cnt], -1, (0, 255, 255), 2)
                M = cv2.moments(largest_cnt)
                if M["m00"] != 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])
                    cv2.circle(roi, (cx, cy), 7, (0, 0, 255), -1)

                    bx, by, bw, bh = cv2.boundingRect(largest_cnt)
                    detected_gesture, choice, icon, label, tip_point = classify_thumb_gesture(
                        largest_cnt, cx, cy, bw, bh
                    )

                    if tip_point:
                        cv2.circle(roi, tip_point, 9, (0, 255, 0), -1)
                        cv2.line(roi, (cx, cy), tip_point, (0, 255, 0), 2)

        progress = 0.0

        if now < cooldown_until:
            status_text = "Actiune trimisa! Astept revenire..."
            status_color = (0, 255, 128)
        elif detected_gesture:
            if current_gesture != detected_gesture:
                current_gesture = detected_gesture
                gesture_start_time = now

            elapsed = now - gesture_start_time
            progress = min(1.0, elapsed / HOLD_SECONDS)
            status_text = f"GEST: {label}"
            status_color = (0, 255, 255) if progress < 1.0 else (0, 255, 0)

            if progress >= 1.0:
                send_action("choose", choice, icon)
                print(f"[OpenCV] >>> Declanșat: {icon} {label} -> Trimis {choice}")
                cooldown_until = now + COOLDOWN_SECONDS
                current_gesture = None
                progress = 0.0
        else:
            current_gesture = None
            status_text = "Deget mare (👍/👎/👈/👉) sau Clipit (😉)"
            status_color = (200, 200, 200)

        # Chenar ROI mână
        cv2.rectangle(frame, (roi_x1, roi_y1), (roi_x2, roi_y2), (255, 200, 0), 2)
        cv2.putText(frame, "Zona mana", (roi_x1 + 10, roi_y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 200, 0), 1)

        # Header HUD
        cv2.rectangle(frame, (0, 0), (w_frame, 60), (20, 24, 38), -1)
        cv2.putText(frame, status_text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.72, status_color, 2)

        # Bară de progres pentru degetul mare
        if progress > 0.0:
            bar_w = int(220 * progress)
            cv2.rectangle(frame, (w_frame - 240, 18), (w_frame - 20, 42), (60, 60, 60), -1)
            cv2.rectangle(frame, (w_frame - 240, 18), (w_frame - 240 + bar_w, 42), (0, 255, 0), -1)

        # Footer status
        ws_info = f"WebSocket joc: {'CONECTAT' if CLIENTS else 'ASTEPT CONEXIUNE'}"
        ws_col = (0, 255, 0) if CLIENTS else (0, 165, 255)
        cv2.putText(frame, ws_info, (20, h_frame - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.55, ws_col, 2)

        cv2.imshow("Mai mare sau mai mic - Super Tool OpenCV (Gesturi + Clipit)", frame)

        key = cv2.waitKey(10) & 0xFF
        if key in (ord("q"), ord("Q"), 27):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("[OpenCV] Modul oprit.")


if __name__ == "__main__":
    main()
