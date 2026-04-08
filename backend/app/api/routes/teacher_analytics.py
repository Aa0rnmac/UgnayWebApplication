from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_teacher
from app.db.session import get_db
from app.models.assessment_attempt import UserAssessmentAttempt
from app.models.batch import Batch
from app.models.module import Module
from app.models.user import User
from app.schemas.teacher import (
    TeacherAnalyticsOverview,
    TeacherAnalyticsSummary,
    TeacherInterventionSuggestion,
    TeacherLowScoringStudent,
    TeacherRecentAttempt,
    TeacherSnapshotEvidence,
    TeacherWrongItemStat,
)

router = APIRouter(prefix="/teacher/analytics", tags=["teacher-analytics"])

DEFAULT_LOW_SCORE_THRESHOLD = 75.0
DEFAULT_READY_SCORE_THRESHOLD = 90.0


@dataclass
class _AttemptContext:
    attempt: UserAssessmentAttempt
    user: User
    batch: Batch | None
    module: Module


@dataclass
class _AnalyticsBundle:
    summary: TeacherAnalyticsSummary
    wrong_items: list[TeacherWrongItemStat]
    low_scoring_students: list[TeacherLowScoringStudent]
    recent_attempts: list[TeacherRecentAttempt]
    snapshot_evidence: list[TeacherSnapshotEvidence]
    intervention_suggestions: list[TeacherInterventionSuggestion]


def _student_display_name(user: User) -> str:
    full_name = " ".join(
        part.strip()
        for part in [user.first_name or "", user.middle_name or "", user.last_name or ""]
        if part and part.strip()
    ).strip()
    return full_name or user.username


def _validate_filters(
    db: Session,
    *,
    batch_id: int | None,
    module_id: int | None,
    student_id: int | None,
) -> None:
    if batch_id is not None:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if not batch:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

    if module_id is not None:
        module = db.query(Module).filter(Module.id == module_id, Module.is_published.is_(True)).first()
        if not module:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")

    if student_id is not None:
        student = db.query(User).filter(User.id == student_id, User.role == "student").first()
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")


def _query_attempt_contexts(
    db: Session,
    *,
    batch_id: int | None,
    module_id: int | None,
    student_id: int | None,
) -> list[_AttemptContext]:
    query = (
        db.query(UserAssessmentAttempt, User, Batch, Module)
        .join(User, User.id == UserAssessmentAttempt.user_id)
        .outerjoin(Batch, Batch.id == User.batch_id)
        .join(Module, Module.id == UserAssessmentAttempt.module_id)
        .filter(User.role == "student", Module.is_published.is_(True))
    )

    if batch_id is not None:
        query = query.filter(User.batch_id == batch_id)
    if module_id is not None:
        query = query.filter(UserAssessmentAttempt.module_id == module_id)
    if student_id is not None:
        query = query.filter(UserAssessmentAttempt.user_id == student_id)

    rows = (
        query.order_by(UserAssessmentAttempt.submitted_at.desc(), UserAssessmentAttempt.id.desc()).all()
    )
    return [
        _AttemptContext(attempt=attempt, user=user, batch=batch, module=module)
        for attempt, user, batch, module in rows
    ]


def _latest_attempts_by_student(contexts: list[_AttemptContext]) -> dict[int, _AttemptContext]:
    latest: dict[int, _AttemptContext] = {}
    for context in contexts:
        if context.user.id not in latest:
            latest[context.user.id] = context
    return latest


def _build_summary(
    contexts: list[_AttemptContext],
    *,
    low_score_threshold: float,
    ready_score_threshold: float,
) -> TeacherAnalyticsSummary:
    latest_by_student = _latest_attempts_by_student(contexts)
    latest_scores = [context.attempt.score_percent for context in latest_by_student.values()]

    support_queue_count = sum(1 for score in latest_scores if score < low_score_threshold)
    assessment_ready_count = sum(1 for score in latest_scores if score >= ready_score_threshold)
    on_track_count = max(0, len(latest_scores) - support_queue_count - assessment_ready_count)

    return TeacherAnalyticsSummary(
        filtered_attempts=len(contexts),
        filtered_students=len(latest_by_student),
        average_score=round(mean(latest_scores), 2) if latest_scores else None,
        support_queue_count=support_queue_count,
        on_track_count=on_track_count,
        assessment_ready_count=assessment_ready_count,
        snapshot_evidence_count=sum(len(context.attempt.snapshots or []) for context in contexts),
        latest_attempted_at=contexts[0].attempt.submitted_at if contexts else None,
        low_score_threshold=low_score_threshold,
        ready_score_threshold=ready_score_threshold,
    )


def _build_wrong_items(
    contexts: list[_AttemptContext],
    *,
    limit: int,
) -> list[TeacherWrongItemStat]:
    aggregated: dict[tuple[int, str, str], dict] = {}

    for context in contexts:
        for answer in context.attempt.answers or []:
            assessment_item_id = str(answer.get("assessment_item_id") or "").strip()
            if not assessment_item_id:
                continue

            key = (context.module.id, context.attempt.assessment_id, assessment_item_id)
            entry = aggregated.setdefault(
                key,
                {
                    "module_id": context.module.id,
                    "module_title": context.module.title,
                    "assessment_id": context.attempt.assessment_id,
                    "assessment_title": context.attempt.assessment_title,
                    "assessment_type": context.attempt.assessment_type,
                    "assessment_item_id": assessment_item_id,
                    "prompt": answer.get("prompt") or assessment_item_id,
                    "expected_response": answer.get("expected_response"),
                    "miss_count": 0,
                    "appearance_count": 0,
                    "student_ids": set(),
                    "latest_submitted_at": None,
                },
            )
            entry["appearance_count"] += 1

            if answer.get("is_correct") is False:
                entry["miss_count"] += 1
                entry["student_ids"].add(context.user.id)
                latest_submitted_at = entry["latest_submitted_at"]
                if latest_submitted_at is None or context.attempt.submitted_at > latest_submitted_at:
                    entry["latest_submitted_at"] = context.attempt.submitted_at

    items: list[TeacherWrongItemStat] = []
    for entry in aggregated.values():
        if entry["miss_count"] <= 0:
            continue

        miss_rate = (
            entry["miss_count"] / entry["appearance_count"] * 100
            if entry["appearance_count"]
            else 0.0
        )
        items.append(
            TeacherWrongItemStat(
                module_id=entry["module_id"],
                module_title=entry["module_title"],
                assessment_id=entry["assessment_id"],
                assessment_title=entry["assessment_title"],
                assessment_type=entry["assessment_type"],
                assessment_item_id=entry["assessment_item_id"],
                prompt=entry["prompt"],
                expected_response=entry["expected_response"],
                miss_count=entry["miss_count"],
                appearance_count=entry["appearance_count"],
                miss_rate_percent=round(miss_rate, 2),
                unique_student_count=len(entry["student_ids"]),
                latest_submitted_at=entry["latest_submitted_at"],
            )
        )

    items.sort(key=lambda item: item.latest_submitted_at or datetime.min, reverse=True)
    items.sort(key=lambda item: item.miss_rate_percent, reverse=True)
    items.sort(key=lambda item: item.miss_count, reverse=True)
    return items[:limit]


def _build_low_scoring_students(
    contexts: list[_AttemptContext],
    *,
    low_score_threshold: float,
    limit: int,
) -> list[TeacherLowScoringStudent]:
    attempts_by_student: dict[int, list[_AttemptContext]] = defaultdict(list)
    for context in contexts:
        attempts_by_student[context.user.id].append(context)

    learners: list[TeacherLowScoringStudent] = []
    for student_attempts in attempts_by_student.values():
        latest = student_attempts[0]
        average_score = round(mean(item.attempt.score_percent for item in student_attempts), 2)
        latest_score = round(latest.attempt.score_percent, 2)

        if latest_score >= low_score_threshold and average_score >= low_score_threshold:
            continue

        learners.append(
            TeacherLowScoringStudent(
                user_id=latest.user.id,
                username=latest.user.username,
                full_name=_student_display_name(latest.user),
                batch_id=latest.batch.id if latest.batch else None,
                batch_name=latest.batch.name if latest.batch else None,
                attempt_count=len(student_attempts),
                average_score=average_score,
                latest_score=latest_score,
                latest_module_id=latest.module.id,
                latest_module_title=latest.module.title,
                latest_assessment_title=latest.attempt.assessment_title,
                latest_submitted_at=latest.attempt.submitted_at,
            )
        )

    learners.sort(key=lambda item: item.latest_submitted_at, reverse=True)
    learners.sort(key=lambda item: item.average_score)
    learners.sort(key=lambda item: item.latest_score)
    return learners[:limit]


def _build_recent_attempts(
    contexts: list[_AttemptContext],
    *,
    limit: int,
) -> list[TeacherRecentAttempt]:
    attempts: list[TeacherRecentAttempt] = []
    for context in contexts[:limit]:
        wrong_answer_count = sum(
            1 for answer in context.attempt.answers or [] if answer.get("is_correct") is False
        )
        attempts.append(
            TeacherRecentAttempt(
                attempt_id=context.attempt.id,
                user_id=context.user.id,
                username=context.user.username,
                full_name=_student_display_name(context.user),
                batch_id=context.batch.id if context.batch else None,
                batch_name=context.batch.name if context.batch else None,
                module_id=context.module.id,
                module_title=context.module.title,
                assessment_id=context.attempt.assessment_id,
                assessment_title=context.attempt.assessment_title,
                assessment_type=context.attempt.assessment_type,
                score_percent=round(context.attempt.score_percent, 2),
                score_correct=context.attempt.score_correct,
                score_total=context.attempt.score_total,
                wrong_answer_count=wrong_answer_count,
                snapshot_count=len(context.attempt.snapshots or []),
                submitted_at=context.attempt.submitted_at,
            )
        )

    return attempts


def _build_snapshot_evidence(
    contexts: list[_AttemptContext],
    *,
    limit: int,
) -> list[TeacherSnapshotEvidence]:
    evidence: list[TeacherSnapshotEvidence] = []

    for context in contexts:
        answers_by_id = {
            str(answer.get("assessment_item_id") or ""): answer for answer in context.attempt.answers or []
        }
        for snapshot in context.attempt.snapshots or []:
            assessment_item_id = str(snapshot.get("assessment_item_id") or "").strip()
            if not assessment_item_id:
                continue

            answer = answers_by_id.get(assessment_item_id)
            evidence.append(
                TeacherSnapshotEvidence(
                    attempt_id=context.attempt.id,
                    user_id=context.user.id,
                    username=context.user.username,
                    full_name=_student_display_name(context.user),
                    batch_id=context.batch.id if context.batch else None,
                    batch_name=context.batch.name if context.batch else None,
                    module_id=context.module.id,
                    module_title=context.module.title,
                    assessment_title=context.attempt.assessment_title,
                    assessment_type=context.attempt.assessment_type,
                    assessment_item_id=assessment_item_id,
                    label=snapshot.get("label"),
                    prompt=answer.get("prompt") if answer else None,
                    expected_response=answer.get("expected_response") if answer else None,
                    response_text=answer.get("response_text") if answer else None,
                    is_correct=answer.get("is_correct") if answer else None,
                    image_path=str(snapshot.get("image_path") or ""),
                    submitted_at=context.attempt.submitted_at,
                )
            )

    evidence = [item for item in evidence if item.image_path]
    evidence.sort(key=lambda item: item.submitted_at, reverse=True)
    evidence.sort(
        key=lambda item: 0 if item.is_correct is False else 1 if item.is_correct is None else 2
    )
    return evidence[:limit]


def _build_intervention_suggestions(
    *,
    summary: TeacherAnalyticsSummary,
    wrong_items: list[TeacherWrongItemStat],
    low_scoring_students: list[TeacherLowScoringStudent],
    snapshot_evidence: list[TeacherSnapshotEvidence],
    suggestion_limit: int,
) -> list[TeacherInterventionSuggestion]:
    suggestions: list[TeacherInterventionSuggestion] = []

    if summary.filtered_attempts == 0:
        return [
            TeacherInterventionSuggestion(
                priority="info",
                title="Collect the first assessment signal",
                rationale="No saved assessment attempts match the current filters yet.",
                suggested_action=(
                    "Ask students to complete at least one graded assessment so the teacher "
                    "dashboard can surface low scorers, missed items, and snapshot evidence."
                ),
            )
        ]

    if low_scoring_students:
        lowest = low_scoring_students[0]
        suggestions.append(
            TeacherInterventionSuggestion(
                priority="high",
                title="Run a targeted support block",
                rationale=(
                    f"{len(low_scoring_students)} learner(s) are below the {summary.low_score_threshold:.0f}% "
                    f"support threshold. {lowest.full_name} most recently scored "
                    f"{lowest.latest_score:.1f}% in {lowest.latest_module_title}."
                ),
                suggested_action=(
                    "Group the lowest scorers for a short reteach, slow the pacing, and ask them "
                    "to repeat the affected assessment in the same session."
                ),
            )
        )

    if wrong_items:
        top_item = wrong_items[0]
        suggestions.append(
            TeacherInterventionSuggestion(
                priority="medium",
                title="Reteach the most-missed prompt",
                rationale=(
                    f"{top_item.prompt} was missed {top_item.miss_count} time(s) across "
                    f"{top_item.unique_student_count} learner(s) in {top_item.module_title} "
                    f"with a {top_item.miss_rate_percent:.1f}% miss rate."
                ),
                suggested_action=(
                    "Model this item again, show the expected response clearly, and run a brief "
                    "drill focused only on this prompt before the next graded pass."
                ),
            )
        )

    incorrect_evidence = next(
        (item for item in snapshot_evidence if item.is_correct is False),
        None,
    )
    if incorrect_evidence:
        evidence_label = incorrect_evidence.label or incorrect_evidence.prompt or "the saved sign"
        suggestions.append(
            TeacherInterventionSuggestion(
                priority="medium",
                title="Use snapshot evidence during feedback",
                rationale=(
                    f"Recent snapshot evidence for {evidence_label} includes an incorrect saved attempt, "
                    "which gives you a concrete visual for handshape and motion coaching."
                ),
                suggested_action=(
                    "Review the saved snapshot with the learner, compare it with the target sign, "
                    "and point out orientation or movement differences before they retry."
                ),
            )
        )

    if summary.assessment_ready_count > 0:
        suggestions.append(
            TeacherInterventionSuggestion(
                priority="info",
                title="Advance the ready group",
                rationale=(
                    f"{summary.assessment_ready_count} learner(s) are already at or above the "
                    f"{summary.ready_score_threshold:.0f}% ready threshold on their latest filtered attempt."
                ),
                suggested_action=(
                    "Move these learners into a stronger retest or mixed-speed practice while the "
                    "support queue focuses on weak items and corrective feedback."
                ),
            )
        )

    return suggestions[:suggestion_limit]


def _build_analytics_bundle(
    db: Session,
    *,
    batch_id: int | None,
    module_id: int | None,
    student_id: int | None,
    low_score_threshold: float,
    ready_score_threshold: float,
    wrong_items_limit: int,
    low_score_limit: int,
    recent_limit: int,
    snapshot_limit: int,
    suggestion_limit: int,
) -> _AnalyticsBundle:
    if low_score_threshold >= ready_score_threshold:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Low-score threshold must be lower than ready-score threshold.",
        )

    _validate_filters(
        db,
        batch_id=batch_id,
        module_id=module_id,
        student_id=student_id,
    )
    contexts = _query_attempt_contexts(
        db,
        batch_id=batch_id,
        module_id=module_id,
        student_id=student_id,
    )

    summary = _build_summary(
        contexts,
        low_score_threshold=low_score_threshold,
        ready_score_threshold=ready_score_threshold,
    )
    wrong_items = _build_wrong_items(contexts, limit=wrong_items_limit)
    low_scoring_students = _build_low_scoring_students(
        contexts,
        low_score_threshold=low_score_threshold,
        limit=low_score_limit,
    )
    recent_attempts = _build_recent_attempts(contexts, limit=recent_limit)
    snapshot_evidence = _build_snapshot_evidence(contexts, limit=snapshot_limit)
    intervention_suggestions = _build_intervention_suggestions(
        summary=summary,
        wrong_items=wrong_items,
        low_scoring_students=low_scoring_students,
        snapshot_evidence=snapshot_evidence,
        suggestion_limit=suggestion_limit,
    )

    return _AnalyticsBundle(
        summary=summary,
        wrong_items=wrong_items,
        low_scoring_students=low_scoring_students,
        recent_attempts=recent_attempts,
        snapshot_evidence=snapshot_evidence,
        intervention_suggestions=intervention_suggestions,
    )


@router.get("/overview", response_model=TeacherAnalyticsOverview)
def get_teacher_analytics_overview(
    batch_id: int | None = Query(default=None, ge=1),
    module_id: int | None = Query(default=None, ge=1),
    student_id: int | None = Query(default=None, ge=1),
    low_score_threshold: float = Query(default=DEFAULT_LOW_SCORE_THRESHOLD, ge=0, le=100),
    ready_score_threshold: float = Query(default=DEFAULT_READY_SCORE_THRESHOLD, ge=0, le=100),
    wrong_items_limit: int = Query(default=6, ge=1, le=25),
    low_score_limit: int = Query(default=8, ge=1, le=25),
    recent_limit: int = Query(default=8, ge=1, le=25),
    snapshot_limit: int = Query(default=6, ge=1, le=25),
    suggestion_limit: int = Query(default=4, ge=1, le=10),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherAnalyticsOverview:
    bundle = _build_analytics_bundle(
        db,
        batch_id=batch_id,
        module_id=module_id,
        student_id=student_id,
        low_score_threshold=low_score_threshold,
        ready_score_threshold=ready_score_threshold,
        wrong_items_limit=wrong_items_limit,
        low_score_limit=low_score_limit,
        recent_limit=recent_limit,
        snapshot_limit=snapshot_limit,
        suggestion_limit=suggestion_limit,
    )
    return TeacherAnalyticsOverview(
        summary=bundle.summary,
        wrong_items=bundle.wrong_items,
        low_scoring_students=bundle.low_scoring_students,
        recent_attempts=bundle.recent_attempts,
        snapshot_evidence=bundle.snapshot_evidence,
        intervention_suggestions=bundle.intervention_suggestions,
    )


@router.get("/wrong-items", response_model=list[TeacherWrongItemStat])
def get_teacher_wrong_items(
    batch_id: int | None = Query(default=None, ge=1),
    module_id: int | None = Query(default=None, ge=1),
    student_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> list[TeacherWrongItemStat]:
    bundle = _build_analytics_bundle(
        db,
        batch_id=batch_id,
        module_id=module_id,
        student_id=student_id,
        low_score_threshold=DEFAULT_LOW_SCORE_THRESHOLD,
        ready_score_threshold=DEFAULT_READY_SCORE_THRESHOLD,
        wrong_items_limit=limit,
        low_score_limit=1,
        recent_limit=1,
        snapshot_limit=1,
        suggestion_limit=1,
    )
    return bundle.wrong_items


@router.get("/low-scoring-students", response_model=list[TeacherLowScoringStudent])
def get_teacher_low_scoring_students(
    batch_id: int | None = Query(default=None, ge=1),
    module_id: int | None = Query(default=None, ge=1),
    student_id: int | None = Query(default=None, ge=1),
    low_score_threshold: float = Query(default=DEFAULT_LOW_SCORE_THRESHOLD, ge=0, le=100),
    ready_score_threshold: float = Query(default=DEFAULT_READY_SCORE_THRESHOLD, ge=0, le=100),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> list[TeacherLowScoringStudent]:
    bundle = _build_analytics_bundle(
        db,
        batch_id=batch_id,
        module_id=module_id,
        student_id=student_id,
        low_score_threshold=low_score_threshold,
        ready_score_threshold=ready_score_threshold,
        wrong_items_limit=1,
        low_score_limit=limit,
        recent_limit=1,
        snapshot_limit=1,
        suggestion_limit=1,
    )
    return bundle.low_scoring_students


@router.get("/recent-attempts", response_model=list[TeacherRecentAttempt])
def get_teacher_recent_attempts(
    batch_id: int | None = Query(default=None, ge=1),
    module_id: int | None = Query(default=None, ge=1),
    student_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> list[TeacherRecentAttempt]:
    bundle = _build_analytics_bundle(
        db,
        batch_id=batch_id,
        module_id=module_id,
        student_id=student_id,
        low_score_threshold=DEFAULT_LOW_SCORE_THRESHOLD,
        ready_score_threshold=DEFAULT_READY_SCORE_THRESHOLD,
        wrong_items_limit=1,
        low_score_limit=1,
        recent_limit=limit,
        snapshot_limit=1,
        suggestion_limit=1,
    )
    return bundle.recent_attempts


@router.get("/snapshot-evidence", response_model=list[TeacherSnapshotEvidence])
def get_teacher_snapshot_evidence(
    batch_id: int | None = Query(default=None, ge=1),
    module_id: int | None = Query(default=None, ge=1),
    student_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> list[TeacherSnapshotEvidence]:
    bundle = _build_analytics_bundle(
        db,
        batch_id=batch_id,
        module_id=module_id,
        student_id=student_id,
        low_score_threshold=DEFAULT_LOW_SCORE_THRESHOLD,
        ready_score_threshold=DEFAULT_READY_SCORE_THRESHOLD,
        wrong_items_limit=1,
        low_score_limit=1,
        recent_limit=1,
        snapshot_limit=limit,
        suggestion_limit=1,
    )
    return bundle.snapshot_evidence


@router.get("/interventions", response_model=list[TeacherInterventionSuggestion])
def get_teacher_interventions(
    batch_id: int | None = Query(default=None, ge=1),
    module_id: int | None = Query(default=None, ge=1),
    student_id: int | None = Query(default=None, ge=1),
    low_score_threshold: float = Query(default=DEFAULT_LOW_SCORE_THRESHOLD, ge=0, le=100),
    ready_score_threshold: float = Query(default=DEFAULT_READY_SCORE_THRESHOLD, ge=0, le=100),
    limit: int = Query(default=4, ge=1, le=10),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> list[TeacherInterventionSuggestion]:
    bundle = _build_analytics_bundle(
        db,
        batch_id=batch_id,
        module_id=module_id,
        student_id=student_id,
        low_score_threshold=low_score_threshold,
        ready_score_threshold=ready_score_threshold,
        wrong_items_limit=3,
        low_score_limit=5,
        recent_limit=3,
        snapshot_limit=3,
        suggestion_limit=limit,
    )
    return bundle.intervention_suggestions
