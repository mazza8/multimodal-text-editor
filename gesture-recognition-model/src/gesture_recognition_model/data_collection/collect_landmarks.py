import argparse

import cv2
import mediapipe as mp
import numpy as np
import pandas as pd

CURRENT_LABEL = 0
IMAGES_DESTINATION = "data/others"

if __name__ == "__main__":
  parser = argparse.ArgumentParser(description="Display Cabina Armadio Turbina")
  parser.add_argument('--current-label', '-l', required=False, help="Current action label.", default=CURRENT_LABEL)
  parser.add_argument('--gestures-file', '-g', required=False, help="Csv file to store the hand landmarks and labels.",
                      default="data/gestures.csv")
  parser.add_argument('--images-destination', '-i', required=False, help="Destination folder for the ",
                      default=IMAGES_DESTINATION)

  args = parser.parse_args()

  try:
    df = pd.read_csv(args.gestures_file)
  except FileNotFoundError as e:
    df = None

  mp_drawing = mp.solutions.drawing_utils
  mp_drawing_styles = mp.solutions.drawing_styles
  mp_hands = mp.solutions.hands
  i = 0
  cap = cv2.VideoCapture(0)
  with mp_hands.Hands(
    max_num_hands=1,
    model_complexity=0,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5) as hands:
    while cap.isOpened():
      success, image = cap.read()

      image.flags.writeable = False
      image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
      results = hands.process(image)

      image.flags.writeable = True
      image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
      if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
          mp_drawing.draw_landmarks(
            image,
            hand_landmarks,
            mp_hands.HAND_CONNECTIONS,
            mp_drawing_styles.get_default_hand_landmarks_style(),
            mp_drawing_styles.get_default_hand_connections_style())
        landmarks = np.array(list(map(lambda x: (x.x, x.y, x.z), list(hand_landmarks.ListFields()[0][1])))).flatten()
        filename = f"{args.images_destination}/{i}.jpg"
        columns = [f"feat{j}" for j in range(landmarks.shape[0])]
        df_row = pd.DataFrame(landmarks.reshape(1, -1), columns=columns)
        df_row["filename"] = filename
        df_row["label"] = args.current_label
        df = df_row.copy() if df is None else pd.concat([df, df_row])
        df.to_csv(args.gestures_file, index=False)
        cv2.imwrite(filename, image)
        i += 1

  cap.release()
