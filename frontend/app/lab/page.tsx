"use client";

import { useEffect, useRef, useState } from "react";

import {
  AlphabetModelStatus,
  LabPrediction,
  NumbersModelStatus,
  NumbersCategory,
  RecognitionMode,
  WordsModelStatus,
  WordsCategory,
  getAlphabetModelStatus,
  getNumbersModelStatus,
  getWordsModelStatus,
  predictNumbersFromFrames,
  predictSignFromImage,
  predictWordsFromFrames
} from "@/lib/api";

type RecognitionStatuses = {
  alphabet: AlphabetModelStatus | null;
  numbers: NumbersModelStatus | null;
  words: WordsModelStatus | null;
  error: string | null;
};

type ModeAvailability = {
  ready: boolean;
  title: string;
  detail: string;
};

function describeModelAvailability(
  ready: boolean,
  modelFound: boolean,
  modelPath: string,
  retrainScript: string,
  label: string
): string {
  if (ready) {
    return `${label} is loaded.`;
  }

  if (modelFound) {
    return `Found trained ${label.toLowerCase()} at ${modelPath}, but the backend has not loaded it yet. Refresh status or relaunch the backend. If this keeps happening, rerun ${retrainScript} so the artifact matches the current backend format.`;
  }

  return `Missing trained ${label.toLowerCase()}: ${modelPath}. Restore that file or run ${retrainScript} after restoring the dataset.`;
}

async function loadRecognitionStatuses(): Promise<RecognitionStatuses> {
  const [alphabetResult, numbersResult, wordsResult] = await Promise.allSettled([
    getAlphabetModelStatus(),
    getNumbersModelStatus(),
    getWordsModelStatus()
  ]);

  const errors = [alphabetResult, numbersResult, wordsResult]
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) =>
      result.reason instanceof Error ? result.reason.message : "Unable to load model status."
    );

  return {
    alphabet: alphabetResult.status === "fulfilled" ? alphabetResult.value : null,
    numbers: numbersResult.status === "fulfilled" ? numbersResult.value : null,
    words: wordsResult.status === "fulfilled" ? wordsResult.value : null,
    error: errors.length > 0 ? errors[0] : null
  };
}

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
  const [recognizedInput, setRecognizedInput] = useState("");
  const [alphabetStatus, setAlphabetStatus] = useState<AlphabetModelStatus | null>(null);
  const [numbersStatus, setNumbersStatus] = useState<NumbersModelStatus | null>(null);
  const [wordsStatus, setWordsStatus] = useState<WordsModelStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
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
    setRecognizedInput("");
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
    setRecognizedInput("");
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
  }, [numbersCategory, mode]);

  useEffect(() => {
    if (!prediction || prediction === "No prediction yet.") {
      return;
    }
    setRecognizedInput(prediction);
  }, [prediction]);

  async function refreshRecognitionStatuses() {
    setStatusLoading(true);
    const payload = await loadRecognitionStatuses();
    setAlphabetStatus(payload.alphabet);
    setNumbersStatus(payload.numbers);
    setWordsStatus(payload.words);
    setStatusError(payload.error);
    setStatusLoading(false);
  }

  useEffect(() => {
    void refreshRecognitionStatuses();
  }, []);

  function getCurrentModeAvailability(): ModeAvailability {
    if (statusLoading) {
      return {
        ready: false,
        title: "Checking lab recognition status",
        detail: "Verifying whether the trained recognition models are available."
      };
    }

    if (mode === "alphabet") {
      if (alphabetStatus?.ready) {
        return {
          ready: true,
          title: "Alphabet recognition ready",
          detail: "Alphabet image recognition model is loaded."
        };
      }

      return {
        ready: false,
        title: "Alphabet recognition unavailable",
        detail:
          alphabetStatus !== null
            ? describeModelAvailability(
                alphabetStatus.ready,
                alphabetStatus.model_found,
                alphabetStatus.model_path,
                "backend/scripts/train_alphabet_model.py",
                "alphabet model"
              )
            : `Unable to verify alphabet model status.${statusError ? ` ${statusError}` : ""}`
      };
    }

    if (mode === "numbers") {
      const needsMotionModel = numbersCategory !== "0-10";
      if (
        numbersStatus &&
        ((needsMotionModel && numbersStatus.motion_ready) ||
          (!needsMotionModel && numbersStatus.ready))
      ) {
        return {
          ready: true,
          title: "Numbers recognition ready",
          detail: needsMotionModel
            ? "Motion-based numbers model is loaded for 11-100."
            : "Static numbers model is loaded for 0-10."
        };
      }

      return {
        ready: false,
        title: "Numbers recognition unavailable",
        detail:
          numbersStatus !== null
            ? needsMotionModel
              ? describeModelAvailability(
                  numbersStatus.motion_ready,
                  numbersStatus.motion_model_found,
                  numbersStatus.motion_model_path,
                  "backend/scripts/train_numbers_motion_model.py",
                  "numbers motion model"
                )
              : describeModelAvailability(
                  numbersStatus.ready,
                  numbersStatus.model_found,
                  numbersStatus.model_path,
                  "backend/scripts/train_numbers_model.py",
                  "numbers model"
                )
            : `Unable to verify numbers model status.${statusError ? ` ${statusError}` : ""}`
      };
    }

    if (wordsStatus?.ready) {
      return {
        ready: true,
        title: "Words recognition ready",
        detail: "Words sequence model is loaded."
      };
    }

    return {
      ready: false,
      title: "Words recognition unavailable",
      detail:
        wordsStatus !== null
          ? describeModelAvailability(
              wordsStatus.ready,
              wordsStatus.model_found,
              wordsStatus.model_path,
              "backend/scripts/train_words_model.py",
              "words model"
            )
          : `Unable to verify words model status.${statusError ? ` ${statusError}` : ""}`
    };
  }

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
    const modeAvailability = getCurrentModeAvailability();
    if (!modeAvailability.ready) {
      setError(modeAvailability.detail);
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
    const modeAvailability = getCurrentModeAvailability();
    if (!modeAvailability.ready) {
      setError(modeAvailability.detail);
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
      const firstPassFrames = isPhraseHeavyCategory ? 24 : 20;
      const firstPassDelay = isPhraseHeavyCategory ? 45 : 45;
      const fallbackPassFrames = isPhraseHeavyCategory ? 30 : 24;
      const fallbackPassDelay = isPhraseHeavyCategory ? 52 : 50;
      const fallbackThreshold = isPhraseHeavyCategory ? 0.74 : 0.68;
      const captureProfile = {
        maxWidth: isPhraseHeavyCategory ? 860 : 800,
        maxHeight: isPhraseHeavyCategory ? 640 : 600,
        jpegQuality: isPhraseHeavyCategory ? 0.92 : 0.9
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
        setCaptureStatus("Capturing a longer gesture...");
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
    const modeAvailability = getCurrentModeAvailability();
    if (!modeAvailability.ready) {
      setError(modeAvailability.detail);
      return;
    }
    predictionInFlightRef.current = true;
    setError(null);
    setPredicting(true);

    try {
      const isDynamicRange = numbersCategory !== "0-10";
      const capturePlan = isDynamicRange
        ? [
            {
              frameCount: 22,
              frameDelay: 72,
              minimumFrames: 16,
              statusText: "Capturing gesture for 11-100..."
            },
            {
              frameCount: 28,
              frameDelay: 78,
              minimumFrames: 18,
              statusText: "Recapturing a longer 11-100 gesture..."
            }
          ]
        : [
            {
              frameCount: 12,
              frameDelay: 90,
              minimumFrames: 8,
              statusText: "Capturing gesture..."
            }
          ];
      const captureProfile = isDynamicRange
        ? {
            maxWidth: 820,
            maxHeight: 620,
            jpegQuality: 0.9
          }
        : {
            maxWidth: 760,
            maxHeight: 560,
            jpegQuality: 0.9
          };

      await runCaptureCountdown(3, sequenceAuto);
      let lastErrorMessage: string | null = null;
      for (let planIndex = 0; planIndex < capturePlan.length; planIndex += 1) {
        const plan = capturePlan[planIndex];
        setCaptureStatus(plan.statusText);
        const sequence = await captureFrameSequence(plan.frameCount, plan.frameDelay, captureProfile);
        if (sequence.length < plan.minimumFrames) {
          lastErrorMessage = "Not enough clear frames. Keep one hand centered and try again.";
          continue;
        }

        setCaptureStatus("Capture complete. You can remove your hand.");
        await sleep(160);
        setCaptureStatus("Analyzing captured gesture...");

        try {
          const result = await predictNumbersFromFrames(sequence, undefined, numbersCategory);
          setPrediction(result.prediction);
          setConfidence(result.confidence);
          setTopCandidates(result.top_candidates);
          lastErrorMessage = null;
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Numbers prediction failed";
          lastErrorMessage = message;
          if (
            !isDynamicRange ||
            planIndex === capturePlan.length - 1 ||
            !message.toLowerCase().includes("no clear hand sequence")
          ) {
            throw err;
          }
          await sleep(120);
        }
      }

      if (lastErrorMessage) {
        setError(lastErrorMessage);
      }
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
    if (!getCurrentModeAvailability().ready) {
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
            : 2300
          : 1200;
    const interval = window.setInterval(() => {
      void runPrediction();
    }, intervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [running, mode, sequenceAuto, isSequenceMode, wordsCategory, numbersCategory]);

  const currentModeStatus = getCurrentModeAvailability();

  return (
    <section className="space-y-4">
      <div className="panel panel-lively">
        <h2 className="text-2xl font-semibold title-gradient">Free Signing Lab</h2>
        <p className="mt-2 text-sm text-muted">
          Alphabet runs live automatically. Numbers and Words support manual capture or auto analyze.
        </p>
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            currentModeStatus.ready
              ? "border-brandGreen/30 bg-brandGreenLight/40 text-slate-800"
              : "border-brandYellow/40 bg-brandYellowLight/60 text-slate-800"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{currentModeStatus.title}</p>
              <p className="mt-1 text-xs text-slate-700">{currentModeStatus.detail}</p>
            </div>
            <button
              className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
              onClick={() => {
                void refreshRecognitionStatuses();
              }}
              type="button"
            >
              Refresh Status
            </button>
          </div>
        </div>
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

        <aside className="panel panel-lively">
          <label className="text-xs uppercase tracking-wider label-accent" htmlFor="recognition-mode">
            Recognition Mode
          </label>
          <select
            className="mt-2 w-full rounded border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 focus:border-brandBlue focus:outline-none"
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
                className={`rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                  currentModeStatus.ready
                    ? "bg-brandRed hover:-translate-y-0.5 hover:bg-brandRed/90"
                    : "cursor-not-allowed bg-slate-400"
                }`}
                disabled={!currentModeStatus.ready || statusLoading}
                onClick={() => {
                  void runPrediction();
                }}
                type="button"
              >
                Analyze Sign Now
              </button>
              <button
                className={`rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                  currentModeStatus.ready
                    ? "bg-brandBlue hover:-translate-y-0.5 hover:bg-brandBlue/90"
                    : "cursor-not-allowed bg-slate-400"
                }`}
                disabled={!currentModeStatus.ready || statusLoading}
                onClick={() => setSequenceAuto((value) => !value)}
                type="button"
              >
                Auto Analyze: {sequenceAuto ? "On" : "Off"}
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

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wider label-accent">
            Recognized Gesture
            <input
              autoComplete="off"
              className="mt-2 w-full rounded border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => setRecognizedInput(event.target.value)}
              onDrop={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              placeholder="Type recognized gesture/letters here..."
              spellCheck={false}
              type="text"
              value={recognizedInput}
            />
          </label>
          <button
            className="mt-2 rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            onClick={() => setRecognizedInput("")}
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

