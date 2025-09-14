import React, { useEffect, useRef, useState } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import io from 'socket.io-client';

type EventLog = {
  type: string;
  detail?: string;
  ts: string;
};

const BACKEND = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:4000';

const Proctor: React.FC<{ sessionId: string; candidateName?: string }> = ({ sessionId }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<any>(null);
  const [logs, setLogs] = useState<EventLog[]>([]);

  useEffect(() => {
    socketRef.current = io(BACKEND);
    socketRef.current.emit('join-session', sessionId);

    let faceMesh: FaceMesh | null = null;
    let camera: any = null;
    let model: cocoSsd.ObjectDetection | null = null;
    let lastFaceSeen = Date.now();
    let lastLookingCenter = Date.now();
    const lastObjectLogTimes: Record<string, number> = {};

    async function init() {
      const video = videoRef.current!;
      if (!video) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
      await video.play();

      model = await cocoSsd.load();

      faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });
      faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5 });
      faceMesh.onResults((results) => {
        handleFaceResults(results);
      });

      camera = new Camera(video, {
        onFrame: async () => {
          await faceMesh!.send({ image: video });
          const predictions = await model!.detect(video);
          handleObjectDetections(predictions);
        },
        width: 640,
        height: 480
      });
      camera.start();

      // media recorder to upload chunks
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      let chunks: Blob[] = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const fd = new FormData();
        fd.append('file', blob, `${sessionId}_${Date.now()}.webm`);
        try {
          await fetch(`${BACKEND}/upload`, { method: 'POST', body: fd });
          pushLog({ type: 'VideoUploaded', detail: 'Chunk uploaded', ts: new Date().toISOString() });
        } catch (err) {
          console.warn('upload failed', err);
        }
        chunks = [];
      };
      mediaRecorder.start(30000);
    }

    init();

    function pushLog(e: EventLog) {
      setLogs(s => [e, ...s].slice(0, 200));
      socketRef.current?.emit('proctor-event', { sessionId, ...e });
    }

    function handleFaceResults(results: any) {
      const now = Date.now();
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        lastFaceSeen = now;
        const lm = results.multiFaceLandmarks[0];
        const nose = lm[1];
        const left = lm[33];
        const right = lm[263];
        const eyeMidX = (left.x + right.x) / 2;
        const dx = nose.x - eyeMidX;
        if (Math.abs(dx) > 0.08) {
          if (now - lastLookingCenter > 5000) {
            pushLog({ type: 'FocusLost', detail: 'User looking away >5s', ts: new Date().toISOString() });
            lastLookingCenter = now;
          }
        } else {
          lastLookingCenter = now;
        }
      } else {
        if (Date.now() - lastFaceSeen > 10000) {
          pushLog({ type: 'NoFace', detail: 'No face seen >10s', ts: new Date().toISOString() });
          lastFaceSeen = Date.now();
        }
      }
    }

    function handleObjectDetections(predictions: any[]) {
      const interesting = ['cell phone', 'book', 'laptop'];
      predictions.forEach(p => {
        const cls = p.class;
        if (interesting.includes(cls)) {
          const now = Date.now();
          if ((now - (lastObjectLogTimes[cls] || 0)) > 3000) {
            lastObjectLogTimes[cls] = now;
            pushLog({ type: 'ObjectDetected', detail: cls, ts: new Date().toISOString() });
            
          }
        }
      });
    }

    return () => {
      socketRef.current?.disconnect();
      // camera and faceMesh cleanup left minimal here
    };
  }, [sessionId]);

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div>
        <video ref={videoRef} autoPlay playsInline muted width={640} height={480} />
        <div style={{ marginTop: 8 }}>
          <button onClick={() => { /* future: start/stop recording */ }}>Start/Stop</button>
        </div>
      </div>
      <div style={{ maxWidth: 420 }}>
        <h3>Event logs</h3>
        <div style={{ maxHeight: 480, overflow: 'auto', background: '#fff', padding: 8, borderRadius: 6 }}>
          <ul style={{ paddingLeft: 14 }}>
            {logs.map((l, i) => (
              <li key={i}><strong>{l.type}</strong> — {l.detail} <br/><small>{l.ts}</small></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Proctor;
