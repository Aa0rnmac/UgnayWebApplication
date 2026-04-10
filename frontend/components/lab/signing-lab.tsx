"use client";

import { useEffect, useRef, useState } from "react";

import {
  detectOpenPalmFromImage,
  getAlphabetModelStatus,
  getNumbersModelStatus,
  getWordsModelStatus,
  LabPrediction,
  NumbersCategory,
  RecognitionMode,
  WordsCategory,
  predictNumbersFromFrames,
  predictSignFromImage,
  predictWordsFromFrames,
} from "@/lib/api";

type SigningLabVariant = "student" | "teacher";

export type SigningLabTeacherFocus = {
  title: string;
  description: string;
  selectorHint: string;
  prepFocus?: string;
  readiness?: "ready" | "attention";
};

type SigningLabProps = {
  variant?: SigningLabVariant;
  preferredMode?: RecognitionMode;
  preferredNumbersCategory?: NumbersCategory;
  preferredWordsCategory?: WordsCategory;
  teacherFocus?: SigningLabTeacherFocus | null;
};

type CaptureOptions = {
  maxWidth?: number;
  maxHeight?: number;
  jpegQuality?: number;
};

function formatResultTime(value: number | null) {
  if (!value) {
    return "No test run yet.";
  }

  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Latest test captured.";
  }
}

const MODE_OPTIONS: { value: RecognitionMode; label: string }[] = [
  { value: "alphabet", label: "Alphabet" },
  { value: "numbers", label: "Numbers" },
  { value: "words", label: "Words" },
];

const NUMBER_OPTIONS: { value: NumbersCategory; label: string }[] = [
  { value: "0-10", label: "0-10" },
  { value: "11-20", label: "11-20" },
  { value: "21-30", label: "21-30" },
  { value: "31-40", label: "31-40" },
  { value: "41-50", label: "41-50" },
  { value: "51-60", label: "51-60" },
  { value: "61-70", label: "61-70" },
  { value: "71-80", label: "71-80" },
  { value: "81-90", label: "81-90" },
  { value: "91-100", label: "91-100" },
];

const WORD_OPTIONS: { value: WordsCategory; label: string }[] = [
  { value: "greeting", label: "Greeting" },
  { value: "responses", label: "Responses" },
  { value: "date", label: "Days" },
  { value: "family", label: "Family" },
  { value: "relationship", label: "People" },
  { value: "color", label: "Color" },
];

function formatModeTitle(mode: RecognitionMode) {
  if (mode === "numbers") {
    return "Numbers";
  }
  if (mode === "words") {
    return "Words";
  }
  return "Alphabet";
}

function formatWordsCategoryLabel(category: WordsCategory) {
  return WORD_OPTIONS.find((option) => option.value === category)?.label ?? "Words";
}

function currentLaneLabel(
  mode: RecognitionMode,
  numbersCategory: NumbersCategory,
  wordsCategory: WordsCategory
) {
  if (mode === "numbers") {
    return `Numbers ${numbersCategory}`;
  }
  if (mode === "words") {
    return `Words · ${formatWordsCategoryLabel(wordsCategory)}`;
  }
  return "Alphabet";
}

function buildTeacherChecklist(
  mode: RecognitionMode,
  numbersCategory: NumbersCategory,
  wordsCategory: WordsCategory
) {
  if (mode === "alphabet") {
    return [
      "Keep one hand centered and hold the final letter shape for a short beat before checking the result.",
      "Use repeated quick tries to compare similar letters and confirm consistency before scoring learners.",
      "Clear the result between attempts when you want a clean teacher-only rehearsal log.",
    ];
  }

  if (mode === "numbers") {
    return [
      numbersCategory === "0-10"
        ? "For 0-10, prioritize a stable handshape and good framing over speed."
        : `For ${numbersCategory}, let the motion finish fully before reviewing the capture result.`,
      "Ask the learner to repeat the sign with the same tempo if the model returns an unsure or weak result.",
      "Use manual capture after the countdown so the teacher can control exactly when the sequence starts.",
    ];
  }

  return [
    `Match the lesson lane to ${formatWordsCategoryLabel(wordsCategory)} before recording the gesture sequence.`,
    "Keep the whole movement inside the frame from start to finish so the sequence model sees the transition.",
    "Run one more pass when a phrase starts or ends out of frame, or when the top candidates are too close together.",
  ];
}

export function SigningLab({
  variant = "student",
  preferredMode,
  preferredNumbersCategory,
  preferredWordsCategory,
  teacherFocus,
}: SigningLabProps) {
  const REPEAT_TOKEN_COOLDOWN_MS = 1400;
  const ALPHABET_PALM_COOLDOWN_MS = 900;
  const isTeacherTester = variant === "teacher";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const predictionInFlightRef = useRef(false);
  const openPalmInFlightRef = useRef(false);
  const wordsHistoryRef = useRef<LabPrediction[]>([]);
  const palmRaisedRef = useRef(false);
  const lastPalmCommitAtRef = useRef(0);
  const predictionRef = useRef("No prediction yet.");
  const blockedTokenRef = useRef<string | null>(null);
  const modeCheckRef = useRef<{ key: string; ready: boolean; message: string } | null>(null);
  const lastAcceptedRef = useRef<{ token: string | null; at: number }>({
    token: null,
    at: 0,
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
  const [warmingModel, setWarmingModel] = useState(false);
  const [modeStatusMessage, setModeStatusMessage] = useState<string | null>(null);
  const [modeReady, setModeReady] = useState<boolean | null>(null);
  const [recognizedInput, setRecognizedInput] = useState("");
  const [lastRecognizedToken, setLastRecognizedToken] = useState<string | null>(null);
  const [blockedTokenAfterClear, setBlockedTokenAfterClear] = useState<string | null>(null);
  const [lastTestedAt, setLastTestedAt] = useState<number | null>(null);

  const isSequenceMode = mode === "numbers" || mode === "words";

  useEffect(() => {
    if (!preferredMode) {
      return;
    }
    setMode(preferredMode);
  }, [preferredMode]);

  useEffect(() => {
    if (!preferredNumbersCategory) {
      return;
    }
    setNumbersCategory(preferredNumbersCategory);
  }, [preferredNumbersCategory]);

  useEffect(() => {
    if (!preferredWordsCategory) {
      return;
    }
    setWordsCategory(preferredWordsCategory);
  }, [preferredWordsCategory]);

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
    setModeStatusMessage(null);
    setModeReady(null);
    setConfidence(null);
    setTopCandidates([]);
    setPrediction("No prediction yet.");
    setCaptureStatus(null);
    setRecognizedInput("");
    setLastRecognizedToken(null);
    setBlockedTokenAfterClear(null);
    setLastTestedAt(null);
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
    setLastTestedAt(null);
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
    setLastTestedAt(null);
    palmRaisedRef.current = false;
    lastPalmCommitAtRef.current = 0;
    lastAcceptedRef.current = { token: null, at: 0 };
  }, [numbersCategory, mode]);

  useEffect(() => {
    if (isTeacherTester || mode === "alphabet") {
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
  }, [prediction, lastRecognizedToken, blockedTokenAfterClear, mode, isTeacherTester]);

  useEffect(() => {
    if (isTeacherTester || !running || mode !== "alphabet") {
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
          jpegQuality: 0.9,
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
  }, [running, mode, blockedTokenAfterClear, isTeacherTester]);

  async function startCamera() {
    setError(null);
    modeCheckRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setRunning(true);
      await ensureSelectedModeReady({ fromCamera: true });
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

  function selectedModeKey() {
    if (mode === "numbers") {
      return `numbers:${numbersCategory}`;
    }
    if (mode === "words") {
      return `words:${wordsCategory}`;
    }
    return "alphabet";
  }

  async function ensureSelectedModeReady(options?: { fromCamera?: boolean }): Promise<boolean> {
    const currentKey = selectedModeKey();
    const cached = modeCheckRef.current;
    if (cached && cached.key === currentKey) {
      setModeReady(cached.ready);
      setModeStatusMessage(cached.message);
      if (!cached.ready) {
        setError(cached.message);
      }
      if (options?.fromCamera) {
        setCaptureStatus(
          cached.ready
            ? cached.message
            : `Camera ready, but ${mode === "numbers" ? "the selected numbers range" : mode} recognition is unavailable.`
        );
      }
      return cached.ready;
    }

    setWarmingModel(true);
    setError(null);

    try {
      if (mode === "alphabet") {
        const status = await getAlphabetModelStatus();
        if (!status.ready) {
          const message =
            "Alphabet recognition is unavailable because the trained model artifact is missing. Run scripts/train_alphabet_model.py to create backend/artifacts/alphabet_model.joblib.";
          modeCheckRef.current = { key: currentKey, ready: false, message };
          setModeReady(false);
          setModeStatusMessage(message);
          setError(message);
          if (options?.fromCamera) {
            setCaptureStatus("Camera ready, but alphabet recognition is unavailable.");
          }
          return false;
        }

        modeCheckRef.current = {
          key: currentKey,
          ready: true,
          message: "Alphabet model loaded and ready.",
        };
        setModeReady(true);
        setModeStatusMessage("Alphabet model loaded and ready.");
        if (options?.fromCamera) {
          setCaptureStatus("Camera ready. Alphabet model warmed.");
        }
        return true;
      }

      if (mode === "numbers") {
        const status = await getNumbersModelStatus();
        const isStaticRange = numbersCategory === "0-10";

        if (isStaticRange && !status.ready) {
          const message =
            "Numbers 0-10 recognition is unavailable because the trained model artifact is missing. Run scripts/train_numbers_model.py to create backend/artifacts/numbers_model.joblib.";
          modeCheckRef.current = { key: currentKey, ready: false, message };
          setModeReady(false);
          setModeStatusMessage(message);
          setError(message);
          if (options?.fromCamera) {
            setCaptureStatus("Camera ready, but numbers 0-10 recognition is unavailable.");
          }
          return false;
        }

        if (!isStaticRange && !status.motion_ready) {
          const message = `Numbers ${numbersCategory} recognition is unavailable because the motion model artifact is missing. Run scripts/train_numbers_motion_model.py to create backend/artifacts/numbers_motion_model.joblib.`;
          modeCheckRef.current = { key: currentKey, ready: false, message };
          setModeReady(false);
          setModeStatusMessage(message);
          setError(message);
          if (options?.fromCamera) {
            setCaptureStatus(
              `Camera ready, but numbers ${numbersCategory} recognition is unavailable.`
            );
          }
          return false;
        }

        const message = isStaticRange
          ? status.ten_motion_ready
            ? "Numbers 0-10 models loaded and ready."
            : "Numbers 0-10 static model loaded. Ten-motion assist is unavailable, but static recognition is ready."
          : `Numbers ${numbersCategory} motion model loaded and ready.`;
        modeCheckRef.current = { key: currentKey, ready: true, message };
        setModeReady(true);
        setModeStatusMessage(message);
        if (options?.fromCamera) {
          setCaptureStatus(
            isStaticRange
              ? "Camera ready. Numbers 0-10 model warmed."
              : `Camera ready. Numbers ${numbersCategory} model warmed.`
          );
        }
        return true;
      }

      const status = await getWordsModelStatus();
      if (!status.ready) {
        const message =
          "Words recognition is unavailable because the trained model artifact is missing. Run scripts/train_words_model.py to create backend/artifacts/words_model.joblib.";
        modeCheckRef.current = { key: currentKey, ready: false, message };
        setModeReady(false);
        setModeStatusMessage(message);
        setError(message);
        if (options?.fromCamera) {
          setCaptureStatus("Camera ready, but words recognition is unavailable.");
        }
        return false;
      }

      modeCheckRef.current = {
        key: currentKey,
        ready: true,
        message: "Words sequence model loaded and ready.",
      };
      setModeReady(true);
      setModeStatusMessage("Words sequence model loaded and ready.");
      if (options?.fromCamera) {
        setCaptureStatus("Camera ready. Words model warmed.");
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to verify model readiness.";
      modeCheckRef.current = { key: currentKey, ready: false, message };
      setModeReady(false);
      setModeStatusMessage(message);
      setError(message);
      return false;
    } finally {
      setWarmingModel(false);
    }
  }

  async function runCaptureCountdown(seconds: number, autoMode: boolean) {
    if (autoMode) {
      setCaptureStatus(
        isTeacherTester
          ? "Live recognition active: keep one gesture centered in view."
          : "Auto capture: hold your gesture in view."
      );
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
      top_candidates: mergedCandidates.slice(0, 3),
    };
  }

  function markPredictionResult(result: LabPrediction) {
    setPrediction(result.prediction);
    setConfidence(result.confidence);
    setTopCandidates(result.top_candidates);
    setLastTestedAt(Date.now());
  }

  async function runStaticPrediction() {
    if (!running || predictionInFlightRef.current) {
      return;
    }
    if (!(await ensureSelectedModeReady())) {
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

      markPredictionResult(chooseStablePrediction(samples));
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
    if (!(await ensureSelectedModeReady())) {
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
        jpegQuality: isPhraseHeavyCategory ? 0.9 : 0.86,
      };

      setCaptureStatus("Capturing gesture...");
      const firstPass = await captureFrameSequence(firstPassFrames, firstPassDelay, {
        ...captureProfile,
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
          ...captureProfile,
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
      markPredictionResult(immediateResult);
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
    if (!(await ensureSelectedModeReady())) {
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
            jpegQuality: 0.88,
          }
        : {
            maxWidth: 760,
            maxHeight: 560,
            jpegQuality: 0.9,
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
      markPredictionResult(result);
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
    if (isTeacherTester || !running || isSequenceMode) {
      return;
    }

    void runPrediction();
    const interval = window.setInterval(() => {
      void runPrediction();
    }, 1200);

    return () => {
      window.clearInterval(interval);
    };
  }, [running, mode, isSequenceMode, wordsCategory, numbersCategory, isTeacherTester]);

  useEffect(() => {
    if (!running || predicting) {
      return;
    }
    void ensureSelectedModeReady({ fromCamera: true });
  }, [running, mode, numbersCategory, wordsCategory, predicting]);

  const sectionTitle = "Free Signing Lab";
  const sectionDescription =
    "For Alphabet mode, show an open palm to enter the current predicted letter. Numbers and Words support manual capture.";
  const modeLabel = isTeacherTester ? "Recognition Mode" : "What do you want to sign?";
  const actionLabel = "Analyze Sign Now";
  const outputLabel = "Prediction Output";
  const idleStatus = isTeacherTester
    ? isSequenceMode
      ? `${mode === "words" ? "Words" : "Numbers"} mode ready`
      : "Alphabet mode ready"
    : isSequenceMode
      ? `${mode === "words" ? "Words" : "Numbers"} manual mode ready`
      : "Alphabet mode active (show open palm to enter)";
  const activeStatus = isTeacherTester
    ? "Analyzing gesture..."
    : isSequenceMode
      ? "Analyzing gesture sequence..."
      : "Live mode active";
  const confidencePercent = confidence !== null ? Math.round(confidence * 100) : null;
  const confidenceLabel =
    confidencePercent === null
      ? "Awaiting capture"
      : confidencePercent >= 85
        ? "High confidence"
        : confidencePercent >= 65
          ? "Moderate confidence"
          : "Low confidence";
  const confidenceBarTone =
    confidencePercent === null
      ? "bg-slate-300"
      : confidencePercent >= 85
        ? "bg-brandGreen"
        : confidencePercent >= 65
          ? "bg-amber-400"
          : "bg-brandRed";
  const teacherTitle = teacherFocus?.title ?? `${formatModeTitle(mode)} teacher check`;
  const teacherDescription =
    teacherFocus?.description ??
    "Use this workspace to rehearse the live recognition lane, verify readiness, and compare model output before using the activity in class.";
  const teacherHint =
    teacherFocus?.selectorHint ??
    (mode === "numbers"
      ? "Match the numbers range before recording the gesture."
      : mode === "words"
        ? "Match the lesson category before recording the sequence."
        : "Use alphabet for single-letter checks and quick repetition drills.");
  const teacherPrepFocus =
    teacherFocus?.prepFocus ??
    (mode === "numbers"
      ? "Coach the learner to finish the gesture cleanly before reviewing the capture."
      : mode === "words"
        ? "Keep the whole sequence inside the frame and retry if the start or end is clipped."
        : "Use repeated short checks to compare similar handshapes and verify consistency.");
  const teacherChecklist = buildTeacherChecklist(mode, numbersCategory, wordsCategory);
  const selectedLaneLabel = currentLaneLabel(mode, numbersCategory, wordsCategory);
  const teacherStatusTone =
    modeReady === false || teacherFocus?.readiness === "attention"
      ? "border-brandYellow/40 bg-brandYellowLight text-brandNavy"
      : modeReady
        ? "border-brandGreen/40 bg-brandGreenLight text-brandGreen"
        : "border-brandBlue/20 bg-brandBlue/10 text-brandBlue";

  if (isTeacherTester) {
    return (
      <section className="space-y-4">
        <div className="panel overflow-hidden">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
                Teacher Check Workspace
              </p>
              <h2 className="teacher-panel-heading mt-3 text-3xl font-black tracking-tight">
                {teacherTitle}
              </h2>
              <p className="teacher-panel-copy mt-3 text-sm leading-relaxed">
                {teacherDescription}
              </p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${teacherStatusTone}`}>
              {modeReady === false || teacherFocus?.readiness === "attention"
                ? "Selected lane needs teacher caution."
                : modeReady
                  ? "Selected lane is ready for guided checks."
                  : "Select a lane and warm the model."}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">
                Active Lane
              </p>
              <p className="teacher-card-title mt-2 text-lg font-black">{selectedLaneLabel}</p>
              <p className="teacher-card-copy mt-2 text-xs leading-relaxed">{teacherHint}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">
                Model Status
              </p>
              <p className="teacher-card-title mt-2 text-lg font-black">
                {modeReady === false
                  ? "Needs attention"
                  : modeReady
                    ? "Ready to test"
                    : "Waiting for warm-up"}
              </p>
              <p className="teacher-card-copy mt-2 text-xs leading-relaxed">
                {modeStatusMessage ?? "Start the camera to warm the selected model lane."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">
                Best Practice
              </p>
              <p className="teacher-card-title mt-2 text-lg font-black">Coach with intent</p>
              <p className="teacher-card-copy mt-2 text-xs leading-relaxed">
                {teacherPrepFocus}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <div className="panel panel-lively overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
                  Live Camera Preview
                </p>
                <p className="teacher-card-title mt-2 text-lg font-black">
                  Frame the signer before you capture.
                </p>
              </div>
              <span className="rounded-full border border-brandBorder bg-brandYellowLight px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brandNavy">
                {captureStatus ?? (predicting ? activeStatus : running ? idleStatus : "Camera is off")}
              </span>
            </div>

            <div className="relative mt-4 overflow-hidden rounded-[1.6rem] border border-slate-300 bg-slate-950">
              <video
                autoPlay
                className="aspect-video w-full object-cover"
                muted
                playsInline
                ref={videoRef}
              />
              {!running ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/78 px-6 text-center text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/70">
                    Camera Off
                  </p>
                  <p className="mt-3 text-2xl font-black">
                    Start the camera to preview the signing space.
                  </p>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">
                    Use even lighting, keep hands inside frame, and make sure the final gesture can
                    be seen clearly before you run a teacher check.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 ${
                  running ? "bg-brandRed hover:bg-brandRed/90" : "bg-brandBlue hover:bg-brandBlue/90"
                }`}
                onClick={() => {
                  void toggleCamera();
                }}
                type="button"
              >
                <span className="inline-grid min-w-[112px] place-items-center">
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
              <button
                className="rounded-lg bg-brandRed px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brandRed/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!running || predicting || warmingModel || modeReady === false}
                onClick={() => {
                  void runPrediction();
                }}
                type="button"
              >
                {warmingModel ? "Preparing Model..." : actionLabel}
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              {isSequenceMode
                ? "Use the teacher-controlled capture to compare repeat attempts and review the clearest sequence."
                : "Alphabet checks can be repeated quickly to compare similar letters and confirm stable handshape output."}
            </p>
          </div>

          <aside className="space-y-4">
            <div className="panel panel-lively">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
                Lane Setup
              </p>

              <label
                className="mt-4 block text-xs uppercase tracking-wider label-accent"
                htmlFor="recognition-mode"
              >
                {modeLabel}
              </label>
              <select
                className="teacher-card-control mt-2 w-full"
                id="recognition-mode"
                onChange={(event) => setMode(event.target.value as RecognitionMode)}
                value={mode}
              >
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              {mode === "numbers" ? (
                <div className="mt-4">
                  <label
                    className="text-xs uppercase tracking-wider label-accent"
                    htmlFor="numbers-category"
                  >
                    Numbers Range
                  </label>
                  <select
                    className="teacher-card-control mt-2 w-full"
                    id="numbers-category"
                    onChange={(event) => setNumbersCategory(event.target.value as NumbersCategory)}
                    value={numbersCategory}
                  >
                    {NUMBER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {mode === "words" ? (
                <div className="mt-4">
                  <label
                    className="text-xs uppercase tracking-wider label-accent"
                    htmlFor="words-category"
                  >
                    Words Category
                  </label>
                  <select
                    className="teacher-card-control mt-2 w-full"
                    id="words-category"
                    onChange={(event) => setWordsCategory(event.target.value as WordsCategory)}
                    value={wordsCategory}
                  >
                    {WORD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.2em]">
                  Teacher Reminder
                </p>
                <p className="teacher-card-copy mt-2 text-sm leading-relaxed">{teacherHint}</p>
              </div>
            </div>

            <div className="panel panel-lively">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandGreen">
                {outputLabel}
              </p>
              <div className="mt-4 rounded-2xl border border-brandBlue/20 bg-gradient-to-br from-brandBlue/10 via-white to-white p-4">
                <p className="text-sm font-semibold text-slate-600">
                  {prediction === "No prediction yet."
                    ? "Waiting for a teacher capture"
                    : "Latest prediction"}
                </p>
                <p className="mt-2 text-3xl font-black text-brandBlue">{prediction}</p>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                    <span>{confidenceLabel}</span>
                    <span>{confidencePercent !== null ? `${confidencePercent}%` : "N/A"}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-200">
                    <div
                      className={`h-2 rounded-full transition-all ${confidenceBarTone}`}
                      style={{ width: confidencePercent !== null ? `${confidencePercent}%` : "0%" }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {topCandidates.length > 0 ? (
                    topCandidates.map((candidate) => (
                      <span
                        key={candidate}
                        className="rounded-full border border-brandBorder bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {candidate}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-brandBorder bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500">
                      No alternate candidates yet
                    </span>
                  )}
                </div>

                <p className="mt-4 text-xs text-slate-600">
                  Last result: {formatResultTime(lastTestedAt)}
                </p>
              </div>

              <button
                className="mt-4 rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                onClick={() => {
                  setPrediction("No prediction yet.");
                  setConfidence(null);
                  setTopCandidates([]);
                  setLastTestedAt(null);
                  setError(null);
                }}
                type="button"
              >
                Clear Result
              </button>
            </div>

            <div className="panel panel-lively">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">
                Teacher Checklist
              </p>
              <div className="mt-4 space-y-3">
                {teacherChecklist.map((item, index) => (
                  <div key={`${mode}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="teacher-card-title text-sm font-black">0{index + 1}</p>
                    <p className="teacher-card-copy mt-2 text-sm leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {error ? (
              <div className="panel border-brandRed/20 bg-brandRedLight">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandRed">
                  Teacher Attention Needed
                </p>
                <p className="mt-3 text-sm leading-relaxed text-brandRed">{error}</p>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {!isTeacherTester ? (
        <div className="panel panel-lively">
          <h2 className="text-2xl font-semibold title-gradient">{sectionTitle}</h2>
          <p className="mt-2 text-sm text-muted">{sectionDescription}</p>
        </div>
      ) : null}

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
                (predicting ? activeStatus : running ? idleStatus : "Camera is off")}
            </span>
          </div>
        </div>

        <aside className="panel panel-lively">
          <label className="text-xs uppercase tracking-wider label-accent" htmlFor="recognition-mode">
            {modeLabel}
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

          {!isTeacherTester && mode === "alphabet" ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-900">
              Note: Show an open palm after the prediction appears to enter the letter.
            </div>
          ) : null}

          {isSequenceMode || isTeacherTester ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-brandRed px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brandRed/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!running || predicting || warmingModel || modeReady === false}
                onClick={() => {
                  void runPrediction();
                }}
                type="button"
              >
                {warmingModel ? "Preparing Model..." : actionLabel}
              </button>
            </div>
          ) : null}

          {modeStatusMessage ? (
            <div
              className={`mt-3 rounded-xl border px-3 py-3 text-xs leading-relaxed ${
                modeReady === false
                  ? "border-brandRed/30 bg-brandRedLight text-brandRed"
                  : "border-brandGreen/30 bg-brandGreenLight text-brandGreen"
              }`}
            >
              {modeStatusMessage}
            </div>
          ) : null}

          <p className="mt-4 text-xs uppercase tracking-wider label-accent">{outputLabel}</p>
          <p className="mt-3 text-2xl font-bold text-brandBlue">{prediction}</p>
          <p className="mt-2 text-sm text-slate-700">
            Confidence: {confidence !== null ? `${Math.round(confidence * 100)}%` : "N/A"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Top candidates: {topCandidates.length > 0 ? topCandidates.join(" | ") : "N/A"}
          </p>
          {isTeacherTester ? (
            <p className="mt-2 text-xs text-slate-600">
              Last result: {formatResultTime(lastTestedAt)}
            </p>
          ) : null}

          {isTeacherTester ? (
            <>
              <button
                className="mt-4 rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                onClick={() => {
                  setPrediction("No prediction yet.");
                  setConfidence(null);
                  setTopCandidates([]);
                  setLastTestedAt(null);
                  setError(null);
                }}
                type="button"
              >
                Clear Result
              </button>
            </>
          ) : (
            <>
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
                  if (
                    currentToken &&
                    currentToken !== "No prediction yet." &&
                    currentToken !== "UNSURE"
                  ) {
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
                  setLastTestedAt(null);
                }}
                type="button"
              >
                Clear Input
              </button>
            </>
          )}
        </aside>
      </div>

      {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
    </section>
  );
}
