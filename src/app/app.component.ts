import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import * as FileSaver from 'file-saver';
import * as _ from 'lodash';
import { QuillEditorComponent } from 'ngx-quill';
declare var webkitSpeechRecognition: any;

import * as ort from 'onnxruntime-web'
import { BehaviorSubject } from 'rxjs';
import { EventEmitter } from 'stream';
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
  current_action_count: number = 0
  record: any;
  recognition: any;
  current_text: string = "";
  tempWords: any;
  triggered: boolean = false;
  audio_command: boolean = false
  audio_input: string = ""
  current_filename: string = "hello world.html";
  current_extension: string = "text/html;charset=utf-8"
  wake_word: string = "google"

  public get gesture() {
    return this._gesture;
  }

  public set gesture(gesture: string) {
    this._gesture = gesture;
  }

  constructor() {
    this.recognition = new webkitSpeechRecognition();

    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.hands = new Hands({
      locateFile: (file) => {
        return `assets/@mediapipe/hands/${file}`;
      }
    });
    this.hands.setOptions({ minDetectionConfidence: 0.5, maxNumHands: 1, modelComplexity: 1 })
    this.gesture = ""
    localStorage.setItem("html", "")
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
    var html = localStorage.getItem('html');
    if (html != null) {
      event.root.innerHTML = html;
    }
  }

  contentChanged(obj: any) {
    localStorage.setItem('html', obj.html);
    this.current_text = obj.html
  }

  actionToTake(event: string) {
    if (event === "thumb up") {
      this.triggered = true
      return
    }

    if (this.triggered) {
      if (event === "other") {
        return
      } else if (event === "thumb down") {
        this.download()
      }
    }
  }

  download() {
    var blob = new Blob([this.current_text], { type: this.current_extension });
    FileSaver.saveAs(blob, this.current_filename);
  }

  upload() {
    const inputNode: any = document.querySelector('#file');

    if (typeof (FileReader) !== 'undefined') {
      const reader = new FileReader();
      var enc = new TextDecoder("utf-8");
      var self = this as AppComponent;

      reader.onload = (e: any) => {
        self.current_text = enc.decode(e.target.result);
      };

      reader.readAsArrayBuffer(inputNode.files[0]);
    }
  }

  ngAfterViewInit(): void {
    this.recognition.addEventListener('result', (e: any) => {
      const transcript = Array.from(e.results)
        .map((result: any) => result[0])
        .map((result) => result.transcript)
        .join('');
      this.tempWords = transcript;
    });

    this.recognition.addEventListener('end', (condition: any) => {
      this.recognition.stop();
      this.recognition.start();
      if (this.tempWords !== undefined) {
        this.audio_input = this.audio_input + " " + this.tempWords
      }
      if (this.tempWords !== undefined && this.triggered) {
        if (this.tempWords === this.wake_word) {
          this.audio_command = true
          setTimeout(() => {
            this.audio_command = false
          }, 2000)
        }
        if (this.audio_command) {
          if (this.tempWords == "download") {
            this.download()
          }
        } else {
          this.current_text = this.current_text + " " + this.tempWords
        }
      }
      console.log(this.tempWords)
      this.tempWords = undefined

    });

    this.recognition.start();

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

