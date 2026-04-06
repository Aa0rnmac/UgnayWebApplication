"use client";

import { useEffect, useRef, useState } from "react";

import {
  LabPrediction,
  NumbersCategory,
  RecognitionMode,
  WordsCategory,
  predictNumbersFromFrames,
  predictSignFromImage,
  predictWordsFromFrames
} from "@/lib/api";

export default function SigningLabPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionInFlightRef = useRef(false);
  const wordsHistoryRef = useRef<LabPrediction[]>([]);
  const [prediction, setPrediction] = useState<string>("No prediction yet.");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [topCandidates, setTopCandidates] = useState<string[]>([]);
  const [mode, setMode] = useState<RecognitionMode>("alphabet");
  const [numbersCategory, setNumbersCategory] = useState<NumbersCategory>("0-10");
  const [wordsCategory, setWordsCategory] = useState<WordsCategory>("greeting");
  const [sequenceAuto, setSequenceAuto] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const isSequenceMode = mode === "numbers" || mode === "words";

  type CaptureOptions = {
    maxWidth?: number;
    maxHeight?: number;
    jpegQuality?: number;
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    setError(null);
    setConfidence(null);
    setTopCandidates([]);
    setPrediction("No prediction yet.");
    setCaptureStatus(null);
    wordsHistoryRef.current = [];
    if (!isSequenceMode) {
      setSequenceAuto(false);
    }
  }, [mode, isSequenceMode]);

  useEffect(() => {
    if (mode !== "words") {
      return;
    }
    wordsHistoryRef.current = [];
    setError(null);
    setConfidence(null);
    setTopCandidates([]);
    setPrediction("No prediction yet.");
    setCaptureStatus(null);
  }, [wordsCategory, mode]);

  useEffect(() => {
    if (mode !== "numbers") {
      return;
    }
    setError(null);
    setConfidence(null);
    setTopCandidates([]);
    setPrediction("No prediction yet.");
    setCaptureStatus(null);
  }, [numbersCategory, mode]);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setRunning(true);
    } catch {
      setError("Unable to access camera. Check browser permissions.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    wordsHistoryRef.current = [];
    setCaptureStatus(null);
    setRunning(false);
  }

  async function captureCurrentFrameAsFile(options?: CaptureOptions): Promise<File | null> {
    if (!videoRef.current || !running) {
      return null;
    }

    const video = videoRef.current;
    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    const maxWidth = options?.maxWidth ?? sourceWidth;
    const maxHeight = options?.maxHeight ?? sourceHeight;
    const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", options?.jpegQuality ?? 0.95);
    });
    if (!blob) {
      return null;
    }
    return new File([blob], "camera-frame.jpg", { type: "image/jpeg" });
  }

  async function captureFrameSequence(
    frameCount: number,
    delayMs: number,
    options?: CaptureOptions
  ): Promise<File[]> {
    const frames: File[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      const frame = await captureCurrentFrameAsFile(options);
      if (frame) {
        frames.push(frame);
      }
      if (index < frameCount - 1) {
        await sleep(delayMs);
      }
    }
    return frames;
  }

  function sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function runCaptureCountdown(seconds: number, autoMode: boolean) {
    if (autoMode) {
      setCaptureStatus("Auto capture: hold your gesture in view.");
      return;
    }
    for (let remaining = seconds; remaining >= 1; remaining -= 1) {
      setCaptureStatus(`Get ready... ${remaining} (not capturing yet)`);
      await sleep(550);
    }
    setCaptureStatus("Sign now. Capture starts...");
    await sleep(220);
  }

  function chooseStablePrediction(samples: LabPrediction[]): LabPrediction {
    if (samples.length === 1) {
      return samples[0];
    }

    const confidentSamples = samples.filter((sample) => sample.prediction !== "UNSURE");
    const source = confidentSamples.length > 0 ? confidentSamples : samples;

    const byLabel = new Map<
      string,
      { score: number; count: number; bestConfidence: number; sample: LabPrediction }
    >();

    for (const sample of source) {
      const previous = byLabel.get(sample.prediction);
      const weightedScore = sample.confidence + (sample.prediction === "UNSURE" ? 0 : 0.15);
      if (!previous) {
        byLabel.set(sample.prediction, {
          score: weightedScore,
          count: 1,
          bestConfidence: sample.confidence,
          sample,
        });
        continue;
      }

      byLabel.set(sample.prediction, {
        score: previous.score + weightedScore,
        count: previous.count + 1,
        bestConfidence: Math.max(previous.bestConfidence, sample.confidence),
        sample: sample.confidence >= previous.bestConfidence ? sample : previous.sample,
      });
    }

    return [...byLabel.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.count !== a.count) return b.count - a.count;
      return b.bestConfidence - a.bestConfidence;
    })[0].sample;
  }

  function chooseStableWordsPrediction(samples: LabPrediction[]): LabPrediction {
    const picked = chooseStablePrediction(samples);
    const matched = samples.filter((sample) => sample.prediction === picked.prediction);
    if (matched.length === 0) {
      return picked;
    }

    const averageConfidence =
      matched.reduce((total, sample) => total + sample.confidence, 0) / matched.length;
    const agreementRatio = matched.length / samples.length;
    const mergedCandidates: string[] = [picked.prediction];
    for (const sample of matched) {
      for (const candidate of sample.top_candidates) {
        if (!mergedCandidates.includes(candidate)) {
          mergedCandidates.push(candidate);
        }
      }
    }

    return {
      prediction: picked.prediction,
      confidence: Math.min(0.99, averageConfidence * 0.78 + agreementRatio * 0.22),
      top_candidates: mergedCandidates.slice(0, 3)
    };
  }

  async function runStaticPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    predictionInFlightRef.current = true;
    setError(null);
    setPredicting(true);

    try {
      const attempts = 3;
      const samples: LabPrediction[] = [];
      for (let index = 0; index < attempts; index += 1) {
        const frame = await captureCurrentFrameAsFile();
        if (!frame) {
          continue;
        }
        try {
          const sample = await predictSignFromImage(frame, mode);
          samples.push(sample);
        } catch {
          // Keep trying next frame to improve chance of finding a clear hand.
        }
        if (index < attempts - 1) {
          await sleep(100);
        }
      }

      if (samples.length === 0) {
        setError("No clear hand was detected. Keep one hand centered and try again.");
        return;
      }
      const result = chooseStablePrediction(samples);
      setPrediction(result.prediction);
      setConfidence(result.confidence);
      setTopCandidates(result.top_candidates);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Prediction failed";
      setError(message);
    } finally {
      setPredicting(false);
      predictionInFlightRef.current = false;
    }
  }

  async function runWordsPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    predictionInFlightRef.current = true;
    setError(null);
    setPredicting(true);

    try {
      await runCaptureCountdown(3, sequenceAuto);

      const samples: LabPrediction[] = [];
      const isPhraseHeavyCategory =
        wordsCategory === "greeting" ||
        wordsCategory === "responses" ||
        wordsCategory === "family" ||
        wordsCategory === "relationship";
      const firstPassFrames = isPhraseHeavyCategory ? 18 : 15;
      const firstPassDelay = isPhraseHeavyCategory ? 65 : 55;
      const fallbackPassFrames = isPhraseHeavyCategory ? 14 : 12;
      const fallbackPassDelay = isPhraseHeavyCategory ? 70 : 65;
      const fallbackThreshold = isPhraseHeavyCategory ? 0.68 : 0.62;
      const captureProfile = {
        maxWidth: isPhraseHeavyCategory ? 800 : 720,
        maxHeight: isPhraseHeavyCategory ? 600 : 540,
        jpegQuality: isPhraseHeavyCategory ? 0.9 : 0.86
      };

      setCaptureStatus("Capturing gesture...");
      const firstPass = await captureFrameSequence(firstPassFrames, firstPassDelay, {
        ...captureProfile
      });

      if (firstPass.length < 8) {
        setError("Not enough clear frames. Keep one hand centered and try again.");
        return;
      }

      try {
        const quickSample = await predictWordsFromFrames(firstPass, undefined, wordsCategory);
        samples.push(quickSample);
      } catch {
        // Continue to fallback pass.
      }

      const needsFallbackPass =
        samples.length === 0 ||
        samples[0].prediction === "UNSURE" ||
        samples[0].confidence < fallbackThreshold;

      if (needsFallbackPass) {
        setCaptureStatus("Capturing gesture...");
        await sleep(90);
        const fallbackPass = await captureFrameSequence(fallbackPassFrames, fallbackPassDelay, {
          ...captureProfile
        });
        if (fallbackPass.length >= 8) {
          try {
            const fallbackSample = await predictWordsFromFrames(
              fallbackPass,
              undefined,
              wordsCategory
            );
            samples.push(fallbackSample);
          } catch {
            // Keep the quick sample result if fallback call fails.
          }
        }
      }

      setCaptureStatus("Capture complete. You can remove your hand.");
      await sleep(180);

      if (samples.length === 0) {
        setError("Not enough clear frames. Keep one hand centered and try again.");
        return;
      }

      setCaptureStatus("Analyzing captured gesture...");
      const immediateResult = chooseStableWordsPrediction(samples);
      if (!sequenceAuto) {
        wordsHistoryRef.current = [immediateResult];
        setPrediction(immediateResult.prediction);
        setConfidence(immediateResult.confidence);
        setTopCandidates(immediateResult.top_candidates);
      } else {
        const history = [...wordsHistoryRef.current, immediateResult].slice(-2);
        const latest = history[history.length - 1];
        const previous = history.length > 1 ? history[history.length - 2] : null;

        // If a new sign is strongly detected, switch quickly to avoid stale smoothing.
        if (previous && latest.prediction !== previous.prediction && latest.confidence >= 0.64) {
          wordsHistoryRef.current = [latest];
        } else {
          wordsHistoryRef.current = history;
        }

        const stabilized = chooseStableWordsPrediction(wordsHistoryRef.current);
        setPrediction(stabilized.prediction);
        setConfidence(stabilized.confidence);
        setTopCandidates(stabilized.top_candidates);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Words prediction failed";
      setError(message);
    } finally {
      setPredicting(false);
      if (sequenceAuto) {
        setCaptureStatus(null);
      } else {
        window.setTimeout(() => setCaptureStatus(null), 1200);
      }
      predictionInFlightRef.current = false;
    }
  }

  async function runNumbersPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    predictionInFlightRef.current = true;
    setError(null);
    setPredicting(true);

    try {
      const isDynamicRange = numbersCategory !== "0-10";
      const frameCount = isDynamicRange ? 11 : 12;
      const frameDelay = isDynamicRange ? 70 : 90;
      await runCaptureCountdown(isDynamicRange ? 2 : 3, sequenceAuto);
      setCaptureStatus("Capturing gesture...");
      const sequence = await captureFrameSequence(frameCount, frameDelay);
      if (sequence.length < 8) {
        setError("Not enough clear frames. Keep one hand centered and try again.");
        return;
      }
      setCaptureStatus("Capture complete. You can remove your hand.");
      await sleep(180);
      setCaptureStatus("Analyzing captured gesture...");
      const result = await predictNumbersFromFrames(sequence, undefined, numbersCategory);
      setPrediction(result.prediction);
      setConfidence(result.confidence);
      setTopCandidates(result.top_candidates);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Numbers prediction failed";
      setError(message);
    } finally {
      setPredicting(false);
      if (sequenceAuto) {
        setCaptureStatus(null);
      } else {
        window.setTimeout(() => setCaptureStatus(null), 1200);
      }
      predictionInFlightRef.current = false;
    }
  }

  async function runPrediction() {
    if (mode === "numbers") {
      await runNumbersPrediction();
      return;
    }
    if (mode === "words") {
      await runWordsPrediction();
      return;
    }
    await runStaticPrediction();
  }

  useEffect(() => {
    if (!running) {
      return;
    }
    if (isSequenceMode && !sequenceAuto) {
      return;
    }

    void runPrediction();
    const intervalMs =
      mode === "words"
        ? 2300
        : mode === "numbers"
          ? numbersCategory === "0-10"
            ? 1700
            : 1400
          : 1200;
    const interval = window.setInterval(() => {
      void runPrediction();
    }, intervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [running, mode, sequenceAuto, isSequenceMode, wordsCategory, numbersCategory]);

  return (
    <section className="space-y-4">
      <div className="panel">
        <h2 className="text-2xl font-semibold">Free Signing Lab</h2>
        <p className="mt-2 text-sm text-muted">
          Alphabet runs live automatically. Numbers and Words support manual capture or auto analyze.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="panel">
          <video
            autoPlay
            className="aspect-video w-full rounded-xl border border-white/20 bg-black"
            muted
            playsInline
            ref={videoRef}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded bg-accent px-3 py-2 text-xs font-semibold"
              onClick={startCamera}
              type="button"
            >
              Start Camera
            </button>
            <button
              className="rounded bg-slate-600 px-3 py-2 text-xs font-semibold"
              onClick={stopCamera}
              type="button"
            >
              Stop Camera
            </button>
            <span className="rounded bg-accentWarm px-3 py-2 text-xs font-semibold text-black">
              {captureStatus ??
                (predicting
                ? mode === "words" || mode === "numbers"
                  ? "Analyzing gesture sequence..."
                  : "Predicting live..."
                : running
                  ? mode === "words" || mode === "numbers"
                    ? sequenceAuto
                      ? `${mode === "words" ? "Words" : "Numbers"} auto mode active`
                      : `${mode === "words" ? "Words" : "Numbers"} manual mode ready`
                    : "Live mode active"
                  : "Camera is off")}
            </span>
          </div>
        </div>

        <aside className="panel">
          <label className="text-xs uppercase tracking-wider text-muted" htmlFor="recognition-mode">
            Recognition Mode
          </label>
          <select
            className="mt-2 w-full rounded border border-white/20 bg-black/30 px-3 py-2 text-sm text-slate-100"
            id="recognition-mode"
            onChange={(event) => setMode(event.target.value as RecognitionMode)}
            value={mode}
          >
            <option value="alphabet">Alphabet Mode</option>
            <option value="numbers">Numbers Mode</option>
            <option value="words">Words Mode</option>
          </select>

          {mode === "numbers" ? (
            <div className="mt-3">
              <label className="text-xs uppercase tracking-wider text-muted" htmlFor="numbers-category">
                Numbers Range
              </label>
              <select
                className="mt-2 w-full rounded border border-white/20 bg-black/30 px-3 py-2 text-sm text-slate-100"
                id="numbers-category"
                onChange={(event) => setNumbersCategory(event.target.value as NumbersCategory)}
                value={numbersCategory}
              >
                <option value="0-10">0-10</option>
                <option value="11-20">11-20</option>
                <option value="21-30">21-30</option>
                <option value="31-40">31-40</option>
                <option value="41-50">41-50</option>
                <option value="51-60">51-60</option>
                <option value="61-70">61-70</option>
                <option value="71-80">71-80</option>
                <option value="81-90">81-90</option>
                <option value="91-100">91-100</option>
              </select>
            </div>
          ) : null}

          {mode === "words" ? (
            <div className="mt-3">
              <label className="text-xs uppercase tracking-wider text-muted" htmlFor="words-category">
                Words Category
              </label>
              <select
                className="mt-2 w-full rounded border border-white/20 bg-black/30 px-3 py-2 text-sm text-slate-100"
                id="words-category"
                onChange={(event) => setWordsCategory(event.target.value as WordsCategory)}
                value={wordsCategory}
              >
                <option value="greeting">Greeting</option>
                <option value="responses">Responses</option>
                <option value="date">Days</option>
                <option value="family">Family</option>
                <option value="relationship">People</option>
                <option value="color">Color</option>
              </select>
            </div>
          ) : null}

          {isSequenceMode ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded bg-accent px-3 py-2 text-xs font-semibold"
                onClick={() => {
                  void runPrediction();
                }}
                type="button"
              >
                Analyze Sign Now
              </button>
              <button
                className="rounded bg-slate-600 px-3 py-2 text-xs font-semibold"
                onClick={() => setSequenceAuto((value) => !value)}
                type="button"
              >
                Auto Analyze: {sequenceAuto ? "On" : "Off"}
              </button>
            </div>
          ) : null}

          <p className="mt-4 text-xs uppercase tracking-wider text-muted">Prediction Output</p>
          <p className="mt-3 text-2xl font-bold text-accentWarm">{prediction}</p>
          <p className="mt-2 text-sm text-slate-200">
            Confidence: {confidence !== null ? `${Math.round(confidence * 100)}%` : "N/A"}
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Top candidates: {topCandidates.length > 0 ? topCandidates.join(" | ") : "N/A"}
          </p>
        </aside>
      </div>

      {error ? <p className="text-sm text-red-300">Error: {error}</p> : null}
    </section>
  );
}
