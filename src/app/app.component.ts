import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import * as FileSaver from 'file-saver';
import * as _ from 'lodash';
import { QuillEditorComponent } from 'ngx-quill';
declare var webkitSpeechRecognition: any;
import { MatIconRegistry } from "@angular/material/icon";

import * as ort from 'onnxruntime-web'
import { DomSanitizer } from '@angular/platform-browser';
const gesture_mapping: { [name: number]: string } = {
  0: "other",
  1: "thumb up",
  2: "thumb down",
  4: "closed fist",
  3: "stop sign",
  5: "pointing finger"
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
  currentText: string = "";
  temporarySpeechResult: any;
  triggered: boolean = false;
  audio_command: boolean = false
  audioInput: string = ""
  current_filename: string = "hello world";
  current_extension: string = "text/html"
  wakeWord: string = "google"

  public get gesture() {
    return this._gesture;
  }

  public set gesture(gesture: string) {
    this._gesture = gesture;
  }

  constructor(private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer
  ) {
    this.registerIcons()
    this.setUpSpeechRecognition()
    this.setUpHandsCapture()
  }

  private registerIcons() {
    this.matIconRegistry.addSvgIcon(
      `closed_fist`,
      this.domSanitizer.bypassSecurityTrustResourceUrl(`../assets/icons/closed-fist-hand-gesture-svgrepo-com.svg`)
    ); this.matIconRegistry.addSvgIcon(
      `pointing_hand`,
      this.domSanitizer.bypassSecurityTrustResourceUrl(`../assets/icons/hand-gesture-outline-pointing-to-the-left-svgrepo-com.svg`)
    ); this.matIconRegistry.addSvgIcon(
      `stop_hand`,
      this.domSanitizer.bypassSecurityTrustResourceUrl(`../assets/icons/stop-hand-gesture-svgrepo-com.svg`)
    );

  }

  private setUpSpeechRecognition() {
    this.recognition = new webkitSpeechRecognition();
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
  }

  private setUpHandsCapture() {
    this.hands = new Hands({
      locateFile: (file) => {
        return `assets/@mediapipe/hands/${file}`;
      }
    });
    this.hands.setOptions({ minDetectionConfidence: 0.5, maxNumHands: 1, modelComplexity: 1 })
    this.gesture = ""
  }

  ngAfterViewInit(): void {
    this.setUpCameraFeed()
    this.setUpVoiceControls()
    this.setFilename(this.current_filename)
    this.setFilenameFormat(this.getExtension())
  }

  setFilename(filename: string): void {
    const filenameInput: HTMLInputElement = document.querySelector('#filenameInput') as HTMLInputElement;
    filenameInput.value = filename
  }

  setFilenameFormat(filenameFormat: string): void {
    const filenameFormatInput: HTMLInputElement = document.querySelector('#filenameFormatInput') as HTMLInputElement;
    filenameFormatInput.value = filenameFormat
  }

  changeFilenameFormat(event: any) {
    let format = event.target.value
    if (format === "txt") {
      this.current_extension = "text/plain"
    } else if (format === "html") {
      this.current_extension = "text/html"
    }
  }

  changeFilename(event: any) {
    this.current_filename = event.target.value
  }

  private setUpCameraFeed(): void {
    let video = document.querySelector("#videoFeed") as HTMLVideoElement;
    this.hands.onResults(this.onResultsHands);

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
          this.handsControls(this.gesture)
          this.current_action_count = 1
        }
      },
      width: 1280,
      height: 720
    });
    this.camera.start();
  }

  private setUpVoiceControls() {
    // Store temporary s2t result.
    this.recognition.addEventListener('result', (e: any) => {
      const transcript = Array.from(e.results)
        .map((result: any) => result[0])
        .map((result) => result.transcript)
        .join('');
      this.temporarySpeechResult = transcript;
    });

    this.recognition.addEventListener('end', (condition: any) => {
      this.recognition.stop();
      this.recognition.start();
      if (this.temporarySpeechResult !== undefined) {
        this.audioInput = this.audioInput + " " + this.temporarySpeechResult
      }
      if (this.temporarySpeechResult !== undefined && this.triggered) {
        if (this.temporarySpeechResult === this.wakeWord) {
          this.audio_command = true
          setTimeout(() => {
            this.audio_command = false
          }, 2000)
        }
        if (this.audio_command) {
          if (this.temporarySpeechResult == "download") {
            this.downloadFile()
          }
        } else {
          this.currentText = this.currentText + " " + this.temporarySpeechResult
        }
      }
      this.temporarySpeechResult = undefined
    });

    this.recognition.start();
  }

  public async onResultsHands(results: any) {
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
      tensorA = tensorA.reshape([63])
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


  loadCachedEditor(event: any) {
    var html = localStorage.getItem('html');
    if (html != null) {
      this.currentText = html
    } else {
      localStorage.setItem("html", "")
    }
  }

  editorContentChanged(obj: any) {
    console.log(obj.html)
    localStorage.setItem('html', obj.html);
  }

  private handsControls(event: string): void {
    if (event === "thumb up") {
      this.triggered = true
    } else if (this.triggered && event === "stop sign") {
      this.triggered = false
    } else if (this.triggered && event === "pointing finger") {
      this.currentText = this.currentText + "<p><br></p>"
      this.editor?.quillEditor.setSelection(this.editor.quillEditor.getLength(), 0)
    } else if (this.triggered && event === "thumb down") {
      this.downloadFile()
    }
  }

  downloadFile(): void {
    let text = ""
    if (this.current_extension === "text/plain") {
      text = this.editor?.elementRef.nativeElement.outerText
    } else if (this.current_extension === "text/html") {
      text = this.currentText
    }
    var blob = new Blob([text], { type: this.current_extension });
    FileSaver.saveAs(blob, this.current_filename + "." + this.getExtension());
  }

  getExtension(): string {
    if (this.current_extension == "text/plain") {
      return "txt"
    } else if (this.current_extension === "text/html") {
      return "html"
    }
    return ""
  }

  uploadFile(): void {
    const inputNode: any = document.querySelector('#file');

    if (typeof (FileReader) !== 'undefined') {
      const reader = new FileReader();
      var enc = new TextDecoder("utf-8");
      var self = this as AppComponent;
      this.current_filename = inputNode.files[0].name.split(".", 1)
      this.setFilename(this.current_filename)
      reader.onload = (e: any) => {
        self.currentText = enc.decode(e.target.result);
      };
      reader.readAsArrayBuffer(inputNode.files[0]);
    }
  }
}
