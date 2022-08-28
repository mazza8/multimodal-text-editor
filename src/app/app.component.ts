import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import * as FileSaver from 'file-saver';
import * as _ from 'lodash';
import { QuillEditorComponent } from 'ngx-quill';


import * as ort from 'onnxruntime-web'
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
  @ViewChild(QuillEditorComponent) editor?: QuillEditorComponent;
  private camera!: Camera;
  hands: Hands;
  title = 'multimodal-text-editor';
  _gesture: string = "";
  curret_text: string = "";
  current_action_count: number = 0

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
    localStorage.setItem("html", "<h1>Hello World!</h1>")
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
    } else {
      current_gesture = ""
    }
    canvasCtx.restore();
  }


  created(event: any) {
    console.log(event);
    var html = localStorage.getItem('html');
    if (html != null) {
      event.root.innerHTML = html;
    }
  }

  contentChanged(obj: any) {
    localStorage.setItem('html', obj.html);
    this.curret_text = obj.html
  }

  actionToTake(event: string) {
    if (event === "other") {
      return
    } else if (event === "thumb up") {
      this.upload()
    } else if (event === "thumb down") {
      this.download()
    }
  }

  download() {
    var blob = new Blob(["Hello, world!"], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, "hello world.txt");
  }

  upload() {
    this.curret_text += "<b>SAY WHAT!?!</b>"
  }

  ngAfterViewInit(): void {
    let video = document.querySelector("#hello") as HTMLVideoElement;
    this.hands.onResults(this.onResults);

    this.camera = new Camera(video, {
      onFrame: async () => {
        await this.hands.send({ image: video });
        if (current_gesture !== "" && this.gesture === current_gesture) {
          this.current_action_count += 1
        } else {
          this.current_action_count = 1
        }
        this.gesture = current_gesture

        if (this.current_action_count == 20) {
          this.actionToTake(this.gesture)
          this.current_action_count = 1
        }
      },
      width: 1280,
      height: 720
    });
    this.camera.start();

  }
}

