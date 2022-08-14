import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import { WebcamComponent, WebcamImage } from 'ngx-webcam';
import { Observable, Observer, Subject } from 'rxjs';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

import { Model } from "deepspeech";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit {
  private trigger: Subject<void> = new Subject();
  private camera!: Camera;
  private video!: HTMLVideoElement | null;

  title = 'multimodal-text-editor';
  hands: Hands;

  constructor() {

    //let model = new Model("assets/deepspeech/deepspeech-0.9.3-models.pbmm");
    console.log("model loaded!")
    this.hands = new Hands({
      locateFile: (file) => {
        return `assets/@mediapipe/hands/${file}`;
      }
    });
    this.hands.setOptions({ minDetectionConfidence: 0.5, maxNumHands: 2, modelComplexity: 1 })
  }

  onResults(results: any) {
    const canvasElement = document.getElementsByClassName('output_canvas')[0] as HTMLCanvasElement;
    const canvasCtx = canvasElement.getContext('2d') as CanvasRenderingContext2D;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(
      results.image, 0, 0, canvasElement.width, canvasElement.height);
    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
          { color: '#00FF00', lineWidth: 5 });
        drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });
      }
    }
    canvasCtx.restore();
  }

  ngAfterViewInit(): void {


    let video = document.querySelector("#hello") as HTMLVideoElement;

    this.hands.onResults(this.onResults);


    this.camera = new Camera(video, {
      onFrame: async () => {
        await this.hands.send({ image: video });
      },
      width: 1280,
      height: 720
    });
    this.camera.start();

  }

  public get triggerObservable(): Observable<void> {

    return this.trigger.asObservable();
  }

}
