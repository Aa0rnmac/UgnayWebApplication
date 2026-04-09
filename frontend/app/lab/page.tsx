"use client";

import { useEffect, useRef, useState } from "react";

import {
  detectOpenPalmFromImage,
  LabPrediction,
  NumbersCategory,
  RecognitionMode,
  WordsCategory,
  predictNumbersFromFrames,
  predictSignFromImage,
  predictWordsFromFrames
} from "@/lib/api";

export default function SigningLabPage() {
  const REPEAT_TOKEN_COOLDOWN_MS = 1400;
  const ALPHABET_PALM_COOLDOWN_MS = 900;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionInFlightRef = useRef(false);
  const openPalmInFlightRef = useRef(false);
  const wordsHistoryRef = useRef<LabPrediction[]>([]);
  const palmRaisedRef = useRef(false);
  const lastPalmCommitAtRef = useRef(0);
  const predictionRef = useRef("No prediction yet.");
  const blockedTokenRef = useRef<string | null>(null);
  const lastAcceptedRef = useRef<{ token: string | null; at: number }>({
    token: null,
    at: 0
  });
  const [prediction, setPrediction] = useState<string>("No prediction yet.");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [topCandidates, setTopCandidates] = useState<string[]>([]);
  const [mode, setMode] = useState<RecognitionMode>("alphabet");
  const [numbersCategory, setNumbersCategory] = useState<NumbersCategory>("0-10");
  const [wordsCategory, setWordsCategory] = useState<WordsCategory>("greeting");
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [recognizedInput, setRecognizedInput] = useState("");
  const [lastRecognizedToken, setLastRecognizedToken] = useState<string | null>(null);
  const [blockedTokenAfterClear, setBlockedTokenAfterClear] = useState<string | null>(null);
  const isSequenceMode = mode === "numbers" || mode === "words";

  type CaptureOptions = {
    maxWidth?: number;
    maxHeight?: number;
    jpegQuality?: number;
  };

  useEffect(() => {
    predictionRef.current = prediction;
  }, [prediction]);

  useEffect(() => {
    blockedTokenRef.current = blockedTokenAfterClear;
  }, [blockedTokenAfterClear]);

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
    setRecognizedInput("");
    setLastRecognizedToken(null);
    setBlockedTokenAfterClear(null);
    palmRaisedRef.current = false;
    lastPalmCommitAtRef.current = 0;
    lastAcceptedRef.current = { token: null, at: 0 };
    wordsHistoryRef.current = [];
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
    setRecognizedInput("");
    setLastRecognizedToken(null);
    setBlockedTokenAfterClear(null);
    palmRaisedRef.current = false;
    lastPalmCommitAtRef.current = 0;
    lastAcceptedRef.current = { token: null, at: 0 };
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
    setRecognizedInput("");
    setLastRecognizedToken(null);
    setBlockedTokenAfterClear(null);
    palmRaisedRef.current = false;
    lastPalmCommitAtRef.current = 0;
    lastAcceptedRef.current = { token: null, at: 0 };
  }, [numbersCategory, mode]);

  useEffect(() => {
    if (mode === "alphabet") {
      return;
    }
    const token = prediction.trim();
    if (!token || token === "No prediction yet." || token === "UNSURE") {
      return;
    }
    if (blockedTokenAfterClear && token === blockedTokenAfterClear) {
      return;
    }
    if (blockedTokenAfterClear && token !== blockedTokenAfterClear) {
      setBlockedTokenAfterClear(null);
    }
    const now = Date.now();
    const lastToken = lastAcceptedRef.current.token;
    const elapsed = now - lastAcceptedRef.current.at;
    if (token === lastToken && elapsed < REPEAT_TOKEN_COOLDOWN_MS) {
      return;
    }
    setRecognizedInput((previous) => (previous ? `${previous} ${token}` : token));
    setLastRecognizedToken(token);
    lastAcceptedRef.current = { token, at: now };
  }, [prediction, lastRecognizedToken, blockedTokenAfterClear, mode]);

  useEffect(() => {
    if (!running || mode !== "alphabet") {
      palmRaisedRef.current = false;
      return;
    }

    let cancelled = false;

    async function checkOpenPalmSignal() {
      if (cancelled || !running || mode !== "alphabet" || openPalmInFlightRef.current) {
        return;
      }
      openPalmInFlightRef.current = true;
      try {
        const frame = await captureCurrentFrameAsFile({
          maxWidth: 640,
          maxHeight: 480,
          jpegQuality: 0.9
        });
        if (!frame) {
          return;
        }
        const result = await detectOpenPalmFromImage(frame);
        const openPalm = result.open_palm;
        const now = Date.now();

        if (
          openPalm &&
          !palmRaisedRef.current &&
          now - lastPalmCommitAtRef.current >= ALPHABET_PALM_COOLDOWN_MS
        ) {
          const token = predictionRef.current.trim();
          const blocked = blockedTokenRef.current;
          if (
            token &&
            token !== "No prediction yet." &&
            token !== "UNSURE" &&
            (!blocked || blocked !== token)
          ) {
            setRecognizedInput((previous) => (previous ? `${previous} ${token}` : token));
            setLastRecognizedToken(token);
            lastAcceptedRef.current = { token, at: now };
            lastPalmCommitAtRef.current = now;
          }
        }

        palmRaisedRef.current = openPalm;
      } catch {
        // Keep silent to avoid noisy UI while polling.
      } finally {
        openPalmInFlightRef.current = false;
      }
    }

    const interval = window.setInterval(() => {
      void checkOpenPalmSignal();
    }, 420);
    void checkOpenPalmSignal();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      palmRaisedRef.current = false;
    };
  }, [running, mode, blockedTokenAfterClear]);

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

  async function toggleCamera() {
    if (running) {
      stopCamera();
      return;
    }
    await startCamera();
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
      await runCaptureCountdown(3, false);

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
      wordsHistoryRef.current = [immediateResult];
      setPrediction(immediateResult.prediction);
      setConfidence(immediateResult.confidence);
      setTopCandidates(immediateResult.top_candidates);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Words prediction failed";
      setError(message);
    } finally {
      setPredicting(false);
      window.setTimeout(() => setCaptureStatus(null), 1200);
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
      const frameCount = isDynamicRange ? 16 : 12;
      const frameDelay = isDynamicRange ? 85 : 90;
      const minimumFrames = isDynamicRange ? 10 : 8;
      const captureProfile = isDynamicRange
        ? {
            maxWidth: 720,
            maxHeight: 540,
            jpegQuality: 0.88
          }
        : {
            maxWidth: 760,
            maxHeight: 560,
            jpegQuality: 0.9
          };

      await runCaptureCountdown(3, false);
      setCaptureStatus(isDynamicRange ? "Capturing gesture for 11-100..." : "Capturing gesture...");
      const sequence = await captureFrameSequence(frameCount, frameDelay, captureProfile);
      if (sequence.length < minimumFrames) {
        setError("Not enough clear frames. Keep one hand centered and try again.");
        return;
      }
      setCaptureStatus("Capture complete. You can remove your hand.");
      await sleep(160);
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
      window.setTimeout(() => setCaptureStatus(null), 1200);
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
    if (isSequenceMode) {
      return;
    }

    void runPrediction();
    const intervalMs = 1200;
    const interval = window.setInterval(() => {
      void runPrediction();
    }, intervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [running, mode, isSequenceMode, wordsCategory, numbersCategory]);

  return (
    <section className="space-y-4">
      <div className="panel panel-lively">
        <h2 className="text-2xl font-semibold title-gradient">Free Signing Lab</h2>
        <p className="mt-2 text-sm text-muted">
          For Alphabet mode, show an open palm to enter the current predicted letter. Numbers and Words support manual capture.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="panel panel-lively">
          <video
            autoPlay
            className="aspect-video w-full rounded-xl border border-slate-300 bg-slate-900"
            muted
            playsInline
            ref={videoRef}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={`rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 ${
                running ? "bg-brandRed hover:bg-brandRed/90" : "bg-brandBlue hover:bg-brandBlue/90"
              }`}
              onClick={() => {
                void toggleCamera();
              }}
              type="button"
            >
              <span className="inline-grid min-w-[92px] place-items-center">
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
                  }`}
                >
                  Start Camera
                </span>
                <span
                  className={`col-start-1 row-start-1 transition-all duration-300 ${
                    running ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
                  }`}
                >
                  Stop Camera
                </span>
              </span>
            </button>
            <span className="rounded-lg border border-brandBorder bg-brandYellowLight px-3 py-2 text-xs font-semibold text-brandNavy">
              {captureStatus ??
                (predicting
                ? mode === "words" || mode === "numbers"
                  ? "Analyzing gesture sequence..."
                  : "Live mode active"
                : running
                  ? mode === "words" || mode === "numbers"
                    ? `${mode === "words" ? "Words" : "Numbers"} manual mode ready`
                    : "Alphabet mode active (show open palm to enter)"
                  : "Camera is off")}
            </span>
          </div>
        </div>

        <aside className="panel panel-lively">
          <label className="text-xs uppercase tracking-wider label-accent" htmlFor="recognition-mode">
            What do you want to sign?
          </label>
          <select
            className="mt-2 w-full rounded border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 focus:border-brandBlue focus:outline-none"
            id="recognition-mode"
            onChange={(event) => setMode(event.target.value as RecognitionMode)}
            value={mode}
          >
            <option value="alphabet">Alphabet</option>
            <option value="numbers">Numbers</option>
            <option value="words">Words</option>
          </select>

          {mode === "numbers" ? (
            <div className="mt-3">
              <label className="text-xs uppercase tracking-wider label-accent" htmlFor="numbers-category">
                Numbers Range
              </label>
              <select
                className="mt-2 w-full rounded border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 focus:border-brandBlue focus:outline-none"
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
              <label className="text-xs uppercase tracking-wider label-accent" htmlFor="words-category">
                Words Category
              </label>
              <select
                className="mt-2 w-full rounded border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 focus:border-brandBlue focus:outline-none"
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
                className="rounded-lg bg-brandRed px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brandRed/90"
                onClick={() => {
                  void runPrediction();
                }}
                type="button"
              >
                Analyze Sign Now
              </button>
            </div>
          ) : null}

          <p className="mt-4 text-xs uppercase tracking-wider label-accent">Prediction Output</p>
          <p className="mt-3 text-2xl font-bold text-brandBlue">{prediction}</p>
          <p className="mt-2 text-sm text-slate-700">
            Confidence: {confidence !== null ? `${Math.round(confidence * 100)}%` : "N/A"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Top candidates: {topCandidates.length > 0 ? topCandidates.join(" | ") : "N/A"}
          </p>
          <p className="mt-2 rounded-md border border-brandYellow/35 bg-brandYellowLight px-2 py-1 text-xs font-semibold text-slate-800">
            Note: In Alphabet mode, show an open palm after a prediction appears to enter that letter.
          </p>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wider label-accent">
            Recognized Gesture
            <input
              autoComplete="off"
              className="mt-2 w-full rounded border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              readOnly
              onDrop={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              placeholder="Recognized gesture/phrase appears here..."
              spellCheck={false}
              type="text"
              value={recognizedInput}
            />
          </label>
          <button
            className="mt-2 rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            onClick={() => {
              const currentToken = prediction.trim();
              if (currentToken && currentToken !== "No prediction yet." && currentToken !== "UNSURE") {
                setBlockedTokenAfterClear(currentToken);
              } else {
                setBlockedTokenAfterClear(null);
              }
              setRecognizedInput("");
              setPrediction("No prediction yet.");
              setConfidence(null);
              setTopCandidates([]);
              lastAcceptedRef.current = { token: null, at: 0 };
              setLastRecognizedToken(null);
            }}
            type="button"
          >
            Clear Input
          </button>
        </aside>
      </div>

      {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
    </section>
  );
}

