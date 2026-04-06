from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.module import Module
from app.models.user import User

SEED_MODULES = [
    {
        "slug": "fsl-alphabets",
        "title": "Module 1: FSL Alphabets",
        "description": "Review handshapes and finger spelling for the Filipino Sign Language alphabet.",
        "order_index": 1,
        "lessons": [
            {"id": "m1-l1", "title": "Letters A-I", "content": "Review clear handshapes for letters A through I."},
            {"id": "m1-l2", "title": "Letters J-R", "content": "Practice transitions and orientation for J through R."},
            {"id": "m1-l3", "title": "Letters S-Z", "content": "Finalize finger spelling fluency for S through Z."},
        ],
        "assessments": [
            {
                "id": "m1-q1",
                "question": "Which set best describes finger spelling?",
                "choices": [
                    "Letter-by-letter handshapes",
                    "Whole sentence movement only",
                    "Voice-only response",
                    "Body posture only",
                ],
                "answer": "Letter-by-letter handshapes",
            }
        ],
    },
    {
        "slug": "numbers",
        "title": "Module 2: Numbers",
        "description": "Review number signs and counting patterns commonly used in daily communication.",
        "order_index": 2,
        "lessons": [
            {"id": "m2-l1", "title": "Numbers 1-10", "content": "Practice basic counting signs from 1 to 10."},
            {"id": "m2-l2", "title": "Numbers 11-20", "content": "Review handshape changes for 11 to 20."},
            {
                "id": "m2-l3",
                "title": "Tens and Quantities",
                "content": "Apply number signs in age, quantity, and time examples.",
            },
        ],
        "assessments": [
            {
                "id": "m2-q1",
                "question": "What should you focus on when signing numbers?",
                "choices": [
                    "Correct finger orientation and clarity",
                    "Random speed without control",
                    "Ignoring hand position",
                    "Looking away from the receiver",
                ],
                "answer": "Correct finger orientation and clarity",
            }
        ],
    },
    {
        "slug": "common-words",
        "title": "Module 3: Common Words",
        "description": "Review high-frequency FSL words used in daily interactions such as greetings, yes/no, and agreement signs.",
        "order_index": 3,
        "lessons": [
            {
                "id": "m3-l1",
                "title": "Greetings and Courtesy",
                "content": "Practice words like hello, thank you, please, and sorry.",
            },
            {
                "id": "m3-l2",
                "title": "Yes/No and Agreement Signs",
                "content": "Review response signs like yes, no, agree, disagree, and okay.",
            },
            {
                "id": "m3-l3",
                "title": "Daily Interaction Words",
                "content": "Practice everyday signs used in home, community, and social conversations.",
            },
        ],
        "assessments": [
            {
                "id": "m3-q1",
                "question": "What is the best goal when reviewing daily interaction signs?",
                "choices": ["Consistency and clear meaning", "Fast random signing", "Minimal hand movement", "Skipping practice"],
                "answer": "Consistency and clear meaning",
            }
        ],
    },
]


def seed_modules(db: Session) -> None:
    for item in SEED_MODULES:
        existing = db.query(Module).filter(Module.order_index == item["order_index"]).first()
        if not existing:
            db.add(Module(**item))
            continue

        existing.slug = item["slug"]
        existing.title = item["title"]
        existing.description = item["description"]
        existing.lessons = item["lessons"]
        existing.assessments = item["assessments"]
        existing.is_published = True
    db.commit()


def seed_demo_user(db: Session) -> None:
    existing_user = db.query(User).filter(User.username == "student_demo").first()
    if existing_user:
        return
    db.add(User(username="student_demo", password_hash=hash_password("student123")))
    db.commit()


def init_db() -> None:
    # Import models before create_all so SQLAlchemy registers metadata.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_modules(db)
        seed_demo_user(db)
