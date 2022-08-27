import { AfterViewInit, Component, OnInit } from '@angular/core';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import * as _ from 'lodash';

import * as ort from 'onnxruntime-web'
import * as jup from "@jupyterlite/server"
const gesture_mapping: { [name: number]: string } = {
  0: "other",
  1: "thumb up",
  2: "thumb down"
}

let current_gesture = ""


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})



export class AppComponent implements AfterViewInit {
  private camera!: Camera;
  hands: Hands;
  title = 'multimodal-text-editor';
  _gesture: string = "";

  public get gesture() {
    return this._gesture;
  }

  public set gesture(gesture: string) {
    this._gesture = gesture;
  }

  constructor() {
    //let model = new Model("assets/deepspeech/deepspeech-0.9.3-models.pbmm");
    this.hands = new Hands({
      locateFile: (file) => {
        return `assets/@mediapipe/hands/${file}`;
      }
    });
    this.hands.setOptions({ minDetectionConfidence: 0.5, maxNumHands: 1, modelComplexity: 1 })
    this.gesture = ""
    new jup.JupyterLiteServer({})
  }


  public async onResults(results: any) {
    const canvasElement = document.getElementsByClassName('output_canvas')[0] as HTMLCanvasElement;
    const canvasCtx = canvasElement.getContext('2d') as CanvasRenderingContext2D;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(
      results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks.length !== 0) {
      let temp = Array(results.multiHandLandmarks[0].map((item: any) => { return [item.x, item.y, item.z] }))
      temp = [].concat.apply([], temp[0]);
      let tensorA = new ort.Tensor('float32', temp);
      tensorA = tensorA.reshape([1, 63])
      const feeds = { input: tensorA };

      const session = await ort.InferenceSession.create('./assets/super_resolution.onnx');
      const out = await session.run(feeds);
      const dataC = Array.from(out["output"].data as Float32Array);

      const maxValue = Math.max(...dataC)
      const pred = _.findIndex(dataC, (x) => x == maxValue)

      for (const landmarks of results.multiHandLandmarks) {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
          { color: '#00FF00', lineWidth: 1 });
        drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1 });
      }
      current_gesture = gesture_mapping[pred]
    }
    canvasCtx.restore();
  }




  ngAfterViewInit(): void {
    let video = document.querySelector("#hello") as HTMLVideoElement;

    this.hands.onResults(this.onResults);

    this.camera = new Camera(video, {
      onFrame: async () => {
        await this.hands.send({ image: video });
        this.gesture = current_gesture
      },
      width: 1280,
      height: 720
    });
    this.camera.start();

  }
}

