import hashlib
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.deps import get_current_learning_user
from app.core.config import settings
from app.models.user import User
from app.schemas.lab import AlphabetModelStatusResponse
from app.schemas.lab import (
    AlphabetDatasetStatusResponse,
    LabPredictionRequest,
    LabPredictionResponse,
    NumbersDatasetStatusResponse,
    NumbersModelStatusResponse,
    OpenPalmDetectionResponse,
    WordsDatasetStatusResponse,
    WordsModelStatusResponse,
)
from app.services.alphabet_dataset import ALPHABET_LABELS_24, get_alphabet_dataset_status
from app.services.alphabet_model import get_alphabet_model_service
from app.services.custom_numbers_motion_dataset import (
    labels_for_number_group,
    normalize_number_group,
)
from app.services.hand_landmarks import detect_open_palm_from_image, extract_landmark_feature_candidates
from app.services.numbers_dataset import get_numbers_dataset_status
from app.services.numbers_motion_model import get_numbers_motion_model_service
from app.services.numbers_model import get_numbers_model_service
from app.services.numbers_ten_motion_model import get_numbers_ten_motion_model_service
from app.services.words_dataset import get_words_dataset_status, resolve_word_group_labels
from app.services.words_model import get_words_model_service

router = APIRouter(prefix="/lab", tags=["lab"])


def _missing_model_detail(label: str, model_path: str, training_script: str) -> str:
    return (
        f"{label} recognition is unavailable because no trained model artifact was found at "
        f"{model_path}. Run {training_script} to generate the artifact, then retry the lab."
    )


@router.get("/alphabet-dataset", response_model=AlphabetDatasetStatusResponse)
def alphabet_dataset_status() -> AlphabetDatasetStatusResponse:
    payload = get_alphabet_dataset_status()
    return AlphabetDatasetStatusResponse(**payload)


@router.get("/alphabet-model", response_model=AlphabetModelStatusResponse)
def alphabet_model_status() -> AlphabetModelStatusResponse:
    payload = get_alphabet_model_service().status()
    return AlphabetModelStatusResponse(**payload)


@router.get("/numbers-dataset", response_model=NumbersDatasetStatusResponse)
def numbers_dataset_status() -> NumbersDatasetStatusResponse:
    payload = get_numbers_dataset_status()
    return NumbersDatasetStatusResponse(**payload)


@router.get("/numbers-model", response_model=NumbersModelStatusResponse)
def numbers_model_status() -> NumbersModelStatusResponse:
    payload = get_numbers_model_service().status()
    return NumbersModelStatusResponse(**payload)


@router.get("/words-dataset", response_model=WordsDatasetStatusResponse)
def words_dataset_status() -> WordsDatasetStatusResponse:
    payload = get_words_dataset_status()
    return WordsDatasetStatusResponse(**payload)


@router.get("/words-model", response_model=WordsModelStatusResponse)
def words_model_status() -> WordsModelStatusResponse:
    payload = get_words_model_service().status()
    return WordsModelStatusResponse(**payload)


def _pick_best_numbers_prediction(predictions: list[LabPredictionResponse]) -> LabPredictionResponse:
    if len(predictions) == 1:
        return predictions[0]

    by_label: dict[str, tuple[float, int, LabPredictionResponse]] = {}
    for item in predictions:
        score = item.confidence + (0.15 if item.prediction != "UNSURE" else 0.0)
        if item.prediction not in by_label:
            by_label[item.prediction] = (score, 1, item)
            continue
        old_score, old_count, old_best = by_label[item.prediction]
        best_item = item if item.confidence >= old_best.confidence else old_best
        by_label[item.prediction] = (old_score + score, old_count + 1, best_item)

    ranked = sorted(
        by_label.values(),
        key=lambda value: (value[0], value[1], value[2].confidence),
        reverse=True,
    )
    return ranked[0][2]


@router.post("/predict", response_model=LabPredictionResponse)
def predict_sign(
    payload: LabPredictionRequest, current_user: User = Depends(get_current_learning_user)
) -> LabPredictionResponse:
    labels = ALPHABET_LABELS_24
    seed_text = f"{current_user.id}:{payload.frame_count}:{payload.metadata or {}}"
    hashed = hashlib.sha256(seed_text.encode("utf-8")).hexdigest()
    index = int(hashed[:4], 16) % len(labels)
    confidence = round(0.65 + ((int(hashed[4:8], 16) % 30) / 100), 2)

    top_candidates = [labels[index]]
    for offset in range(1, 3):
        top_candidates.append(labels[(index + offset) % len(labels)])

    return LabPredictionResponse(
        prediction=labels[index], confidence=min(confidence, 0.95), top_candidates=top_candidates
    )


@router.post("/predict-image", response_model=LabPredictionResponse)
async def predict_sign_from_image(
    image: UploadFile = File(...),
    mode: Literal["alphabet", "numbers", "words"] = Form(default="alphabet"),
    current_user: User = Depends(get_current_learning_user),
) -> LabPredictionResponse:
    del current_user
    contents = await image.read()
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded image is empty."
        )

    candidates = extract_landmark_feature_candidates(contents)
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hand detected. Make sure one clear hand is visible in frame.",
        )

    if mode == "words":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Words mode uses motion sequence. Use /api/lab/predict-words-sequence endpoint.",
        )

    service = get_alphabet_model_service() if mode == "alphabet" else get_numbers_model_service()
    model_status = service.status()
    if not model_status["ready"]:
        mode_label = "Alphabet" if mode == "alphabet" else "Numbers"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_missing_model_detail(
                mode_label,
                str(model_status["model_path"]),
                "scripts/train_alphabet_model.py"
                if mode == "alphabet"
                else "scripts/train_numbers_model.py",
            ),
        )

    prediction = service.predict_best_of_candidates(candidates)
    return LabPredictionResponse(
        prediction=prediction.prediction,
        confidence=prediction.confidence,
        top_candidates=prediction.top_candidates,
    )


@router.post("/detect-open-palm", response_model=OpenPalmDetectionResponse)
async def detect_open_palm(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_learning_user),
) -> OpenPalmDetectionResponse:
    del current_user
    contents = await image.read()
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded image is empty."
        )

    return OpenPalmDetectionResponse(open_palm=detect_open_palm_from_image(contents))


@router.post("/predict-words-sequence", response_model=LabPredictionResponse)
async def predict_words_sequence(
    frames: list[UploadFile] = File(...),
    word_group: str = Form(default="greeting"),
    current_user: User = Depends(get_current_learning_user),
) -> LabPredictionResponse:
    del current_user
    if not frames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No frames were uploaded."
        )

    payloads: list[bytes] = []
    for frame in frames[:80]:
        contents = await frame.read()
        if contents:
            payloads.append(contents)

    if len(payloads) < settings.words_min_sequence_frames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Need at least {settings.words_min_sequence_frames} clear frames for words mode.",
        )

    service = get_words_model_service()
    model_status = service.status()
    if not model_status["ready"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_missing_model_detail(
                "Words",
                str(model_status["model_path"]),
                "scripts/train_words_model.py",
            ),
        )

    allowed_labels = resolve_word_group_labels(word_group, existing_only=True)
    if not allowed_labels:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No labels available for selected words category.",
        )

    try:
        prediction = service.predict_from_frame_bytes(payloads, allowed_labels=allowed_labels)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return LabPredictionResponse(
        prediction=prediction.prediction,
        confidence=prediction.confidence,
        top_candidates=prediction.top_candidates,
    )


@router.post("/predict-numbers-sequence", response_model=LabPredictionResponse)
async def predict_numbers_sequence(
    frames: list[UploadFile] = File(...),
    number_group: str = Form(default="0-10"),
    current_user: User = Depends(get_current_learning_user),
) -> LabPredictionResponse:
    del current_user
    if not frames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No frames were uploaded."
        )

    payloads: list[bytes] = []
    for frame in frames[:80]:
        contents = await frame.read()
        if contents:
            payloads.append(contents)

    selected_group = normalize_number_group(number_group)
    min_required_frames = (
        settings.numbers_ten_min_sequence_frames
        if selected_group == "0-10"
        else settings.numbers_motion_min_sequence_frames
    )
    if len(payloads) < min_required_frames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Need at least "
                f"{min_required_frames} clear frames for numbers mode."
            ),
        )

    # Tens-group mode for dynamic numbers (11-100) for faster inference.
    if selected_group != "0-10":
        motion_service = get_numbers_motion_model_service()
        motion_status = motion_service.status()
        if not motion_status["ready"]:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=_missing_model_detail(
                    f"Numbers {selected_group}",
                    str(motion_status["model_path"]),
                    "scripts/train_numbers_motion_model.py",
                ),
            )

        allowed_labels = labels_for_number_group(selected_group)
        try:
            result = motion_service.predict_from_frame_bytes(
                payloads, allowed_labels=allowed_labels
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        return LabPredictionResponse(
            prediction=result.prediction,
            confidence=result.confidence,
            top_candidates=result.top_candidates,
        )

    numbers_service = get_numbers_model_service()
    numbers_status = numbers_service.status()
    if not numbers_status["ready"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_missing_model_detail(
                "Numbers 0-10",
                str(numbers_status["model_path"]),
                "scripts/train_numbers_model.py",
            ),
        )

    ten_service = get_numbers_ten_motion_model_service()
    ten_status = ten_service.status()
    if ten_status["ready"]:
        try:
            ten_result = ten_service.predict_from_frame_bytes(payloads)
            if ten_result.is_ten:
                return LabPredictionResponse(
                    prediction="10",
                    confidence=ten_result.ten_confidence,
                    top_candidates=["10", "9", "8"],
                )
        except ValueError:
            # Fall through to static digit fallback when sequence is unclear.
            pass

    predictions: list[LabPredictionResponse] = []
    sample_stride = max(1, len(payloads) // 6)
    sampled_payloads = payloads[::sample_stride][:6]
    for payload in sampled_payloads:
        candidates = extract_landmark_feature_candidates(payload)
        if not candidates:
            continue
        item = numbers_service.predict_best_of_candidates(candidates)
        predictions.append(
            LabPredictionResponse(
                prediction=item.prediction,
                confidence=item.confidence,
                top_candidates=item.top_candidates,
            )
        )

    if not predictions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No clear hand detected in sampled frames.",
        )

    return _pick_best_numbers_prediction(predictions)
