from sqlalchemy import inspect, text
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
        "description": (
            "This module introduces the Filipino Sign Language (FSL) alphabet through fingerspelling. "
            "Students learn how to form each letter using hand shapes and movements, which serves as a "
            "foundation for all succeeding modules. Mastery of the alphabet allows learners to spell names, "
            "unfamiliar words, and specific terms that may not yet have dedicated signs."
        ),
        "order_index": 1,
        "lessons": [
            {
                "id": "m1-l1",
                "title": "Letters A-I",
                "content": (
                    "Focus on clean handshape formation for letters A, B, C, D, E, F, G, H, and I.\n"
                    "Practice each letter slowly, then spell short names using A-I letters."
                ),
            },
            {
                "id": "m1-l2",
                "title": "Letters J-R",
                "content": (
                    "Practice transitions and orientation for J through R.\n"
                    "Note: J is a moving gesture, so follow the motion path while keeping the handshape clear."
                ),
            },
            {
                "id": "m1-l3",
                "title": "Letters S-Z",
                "content": (
                    "Finalize finger spelling fluency for S through Z.\n"
                    "Note: Z is a moving gesture, so trace its motion clearly while maintaining clean handshape."
                ),
            },
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
            },
            {
                "id": "m1-q2",
                "question": "Which letters in this module are moving gestures?",
                "choices": ["J and Z", "A and E", "C and O", "M and N"],
                "answer": "J and Z",
            },
            {
                "id": "m1-q3",
                "question": "What is the best strategy for signing unfamiliar words?",
                "choices": [
                    "Finger-spell the word clearly letter by letter",
                    "Skip difficult letters",
                    "Use random gestures",
                    "Mouth the word without signing",
                ],
                "answer": "Finger-spell the word clearly letter by letter",
            },
            {
                "id": "m1-q4",
                "question": "Why is alphabet mastery important in FSL?",
                "choices": [
                    "It helps sign names and specific terms",
                    "It replaces all vocabulary signs",
                    "It removes the need for practice",
                    "It is only used in formal events",
                ],
                "answer": "It helps sign names and specific terms",
            },
            {
                "id": "m1-q5",
                "question": "When practicing fingerspelling, what should come first?",
                "choices": [
                    "Clear handshape and readable pacing",
                    "Very fast movement",
                    "Large arm swings",
                    "Looking away from the receiver",
                ],
                "answer": "Clear handshape and readable pacing",
            }
        ],
    },
    {
        "slug": "numbers",
        "title": "Module 2: Numbers",
        "description": (
            "This module focuses on numbers and counting in FSL. Students learn how to sign numbers from "
            "basic to higher values and apply them in real-life contexts such as counting objects, telling "
            "quantities, and asking numerical questions. This builds essential skills for everyday communication "
            "involving amounts and measurements."
        ),
        "order_index": 2,
        "lessons": [
            {"id": "m2-l1", "title": "Numbers 0-10", "content": "Practice number signs from 0 to 10 with clear hand orientation."},
            {"id": "m2-l2", "title": "Numbers 11-20", "content": "Review transitions and movement patterns for signs 11 to 20."},
            {
                "id": "m2-l3",
                "title": "Numbers 21-30",
                "content": "Practice signs from 21 to 30 and keep shape transitions smooth.",
            },
            {
                "id": "m2-l4",
                "title": "Numbers 31-40",
                "content": "Build fluency for numbers 31 to 40 using consistent handshape control.",
            },
            {
                "id": "m2-l5",
                "title": "Numbers 41-50",
                "content": "Practice signs from 41 to 50 and apply them in quick counting drills.",
            },
            {
                "id": "m2-l6",
                "title": "60, 70, 80, 90, 100",
                "content": (
                    "Study the shortcut signs for 60, 70, 80, 90, and 100 in one focused lesson.\n"
                    "Note: Familiarize the signs for 1-9 so you can combine them with tens (60, 70, 80, 90) "
                    "to sign full numbers such as 61-69, 71-79, 81-89, and 91-99."
                ),
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
            },
            {
                "id": "m2-q2",
                "question": "To sign a number like 67, what should you combine?",
                "choices": [
                    "The tens sign (60) and the ones sign (7)",
                    "Only the sign for 7",
                    "Only the sign for 60",
                    "A fingerspelled word for sixty-seven",
                ],
                "answer": "The tens sign (60) and the ones sign (7)",
            },
            {
                "id": "m2-q3",
                "question": "Which lesson focuses on shortcut higher-number signs?",
                "choices": ["60, 70, 80, 90, 100", "0-10", "11-20", "21-30"],
                "answer": "60, 70, 80, 90, 100",
            },
            {
                "id": "m2-q4",
                "question": "Why are number signs essential in daily communication?",
                "choices": [
                    "They help express amounts and quantities",
                    "They are used only in games",
                    "They replace all greeting signs",
                    "They are only for exams",
                ],
                "answer": "They help express amounts and quantities",
            },
            {
                "id": "m2-q5",
                "question": "Before mastering 71-79, what foundation is most important?",
                "choices": [
                    "Familiarity with 1-9 and the tens pattern",
                    "Only memorizing 100",
                    "Skipping signs below 20",
                    "Using voice instead of sign",
                ],
                "answer": "Familiarity with 1-9 and the tens pattern",
            }
        ],
    },
    {
        "slug": "common-words",
        "title": "Module 3: Greetings & Basic Expressions",
        "description": (
            "This module covers commonly used greetings and polite expressions. Students learn how to initiate "
            "and end conversations, respond appropriately, and express basic intentions. These signs are essential "
            "for building confidence in interacting with others in both formal and informal settings."
        ),
        "order_index": 3,
        "lessons": [
            {
                "id": "m3-l1",
                "title": "Daily Greetings",
                "content": (
                    "Focus on common greeting expressions:\n"
                    "- GOOD MORNING\n"
                    "- GOOD AFTERNOON\n"
                    "- GOOD EVENING\n"
                    "- HELLO"
                ),
            },
            {
                "id": "m3-l2",
                "title": "Check-In and Introduction",
                "content": (
                    "Practice these expressions for meeting and conversation starters:\n"
                    "- HOW ARE YOU\n"
                    "- I'M FINE\n"
                    "- NICE TO MEET YOU"
                ),
            },
            {
                "id": "m3-l3",
                "title": "Courtesy and Parting",
                "content": (
                    "Use these for polite responses and closing conversations:\n"
                    "- THANK YOU\n"
                    "- YOU'RE WELCOME\n"
                    "- SEE YOU TOMORROW"
                ),
            },
        ],
        "assessments": [
            {
                "id": "m3-q1",
                "question": "What is the best goal when reviewing daily interaction signs?",
                "choices": ["Consistency and clear meaning", "Fast random signing", "Minimal hand movement", "Skipping practice"],
                "answer": "Consistency and clear meaning",
            },
            {
                "id": "m3-q2",
                "question": "Which greeting best fits a morning conversation start?",
                "choices": ["GOOD MORNING", "SEE YOU TOMORROW", "YOU'RE WELCOME", "I'M FINE"],
                "answer": "GOOD MORNING",
            },
            {
                "id": "m3-q3",
                "question": "After someone signs HOW ARE YOU, which response is appropriate?",
                "choices": ["I'M FINE", "GOOD EVENING", "THANK YOU", "HELLO"],
                "answer": "I'M FINE",
            },
            {
                "id": "m3-q4",
                "question": "What is a polite reply to THANK YOU?",
                "choices": ["YOU'RE WELCOME", "DON'T KNOW", "NO", "SLOW"],
                "answer": "YOU'RE WELCOME",
            },
            {
                "id": "m3-q5",
                "question": "Which sign is commonly used to end a conversation politely?",
                "choices": ["SEE YOU TOMORROW", "HOW ARE YOU", "HELLO", "GOOD MORNING"],
                "answer": "SEE YOU TOMORROW",
            }
        ],
    },
    {
        "slug": "family-members",
        "title": "Module 4: Family Members",
        "description": (
            "This module introduces vocabulary related to family and relationships. Students learn how to "
            "identify family members and explain relationships between individuals. This helps learners "
            "communicate about their personal lives and understand others in similar contexts."
        ),
        "order_index": 4,
        "lessons": [
            {"id": "m4-l1", "title": "FATHER", "content": "Practice the sign for FATHER in simple family introductions."},
            {"id": "m4-l2", "title": "MOTHER", "content": "Practice the sign for MOTHER in simple family introductions."},
            {"id": "m4-l3", "title": "SON", "content": "Practice the sign for SON and use it in relationship examples."},
            {"id": "m4-l4", "title": "DAUGHTER", "content": "Practice the sign for DAUGHTER and use it in relationship examples."},
            {"id": "m4-l5", "title": "GRANDFATHER", "content": "Practice the sign for GRANDFATHER clearly and consistently."},
            {"id": "m4-l6", "title": "GRANDMOTHER", "content": "Practice the sign for GRANDMOTHER clearly and consistently."},
            {"id": "m4-l7", "title": "UNCLE", "content": "Review and practice the sign for UNCLE in context."},
            {"id": "m4-l8", "title": "AUNTIE", "content": "Review and practice the sign for AUNTIE in context."},
            {"id": "m4-l9", "title": "COUSIN", "content": "Practice the sign for COUSIN in family conversation examples."},
            {"id": "m4-l10", "title": "PARENTS", "content": "Practice the sign for PARENTS in complete family statements."},
        ],
        "assessments": [
            {
                "id": "m4-q1",
                "question": "Why is learning family signs important?",
                "choices": [
                    "To explain relationships in real conversations",
                    "To avoid introducing people",
                    "To replace all other vocabulary",
                    "To sign random words only",
                ],
                "answer": "To explain relationships in real conversations",
            },
            {
                "id": "m4-q2",
                "question": "Which signs can be combined to communicate PARENTS?",
                "choices": [
                    "FATHER and MOTHER",
                    "SON and DAUGHTER",
                    "UNCLE and AUNTIE",
                    "COUSIN and GRANDMOTHER",
                ],
                "answer": "FATHER and MOTHER",
            },
            {
                "id": "m4-q3",
                "question": "Which sign best identifies your parent's father?",
                "choices": ["GRANDFATHER", "UNCLE", "COUSIN", "SON"],
                "answer": "GRANDFATHER",
            },
            {
                "id": "m4-q4",
                "question": "If introducing your mother's sister, which sign do you use?",
                "choices": ["AUNTIE", "DAUGHTER", "MOTHER", "PARENTS"],
                "answer": "AUNTIE",
            },
            {
                "id": "m4-q5",
                "question": "What makes family-sign practice effective?",
                "choices": [
                    "Using each sign in relationship examples",
                    "Memorizing without context",
                    "Practicing only one sign repeatedly",
                    "Skipping review of similar signs",
                ],
                "answer": "Using each sign in relationship examples",
            }
        ],
    },
    {
        "slug": "people-description",
        "title": "Module 5: People Description",
        "description": (
            "This module focuses on describing people in FSL. Students learn how to identify and describe "
            "individuals using clear descriptive signs. This helps learners give details and communicate "
            "about people more accurately in daily interactions."
        ),
        "order_index": 5,
        "lessons": [
            {"id": "m5-l1", "title": "BOY", "content": "Practice the sign for BOY in identification phrases."},
            {"id": "m5-l2", "title": "GIRL", "content": "Practice the sign for GIRL in identification phrases."},
            {"id": "m5-l3", "title": "MAN", "content": "Practice the sign for MAN in description examples."},
            {"id": "m5-l4", "title": "WOMAN", "content": "Practice the sign for WOMAN in description examples."},
            {"id": "m5-l5", "title": "DEAF", "content": "Use the sign for DEAF correctly in respectful context."},
            {"id": "m5-l6", "title": "HARD OF HEARING", "content": "Practice the sign for HARD OF HEARING in clear context."},
            {"id": "m5-l7", "title": "WEELCHAIR PERSON", "content": "Practice the sign for WEELCHAIR PERSON in contextual statements."},
            {"id": "m5-l8", "title": "BLIND", "content": "Practice the sign for BLIND in people description examples."},
            {"id": "m5-l9", "title": "DEAF BLIND", "content": "Practice the sign for DEAF BLIND in contextual use."},
            {"id": "m5-l10", "title": "MARRIED", "content": "Practice the sign for MARRIED in personal-information statements."},
        ],
        "assessments": [
            {
                "id": "m5-q1",
                "question": "What is the best use of people description signs?",
                "choices": [
                    "To give clear details about a person",
                    "To avoid identifying anyone",
                    "To sign without context",
                    "To use only fingerspelling always",
                ],
                "answer": "To give clear details about a person",
            },
            {
                "id": "m5-q2",
                "question": "Which sign should be used when describing marital status?",
                "choices": ["MARRIED", "BLIND", "DEAF", "MAN"],
                "answer": "MARRIED",
            },
            {
                "id": "m5-q3",
                "question": "Which option refers to a person who is both deaf and blind?",
                "choices": ["DEAF BLIND", "HARD OF HEARING", "GIRL", "BOY"],
                "answer": "DEAF BLIND",
            },
            {
                "id": "m5-q4",
                "question": "Which approach is most respectful when describing someone?",
                "choices": [
                    "Use accurate signs and clear context",
                    "Use labels without context",
                    "Avoid descriptive details",
                    "Guess signs without confirmation",
                ],
                "answer": "Use accurate signs and clear context",
            },
            {
                "id": "m5-q5",
                "question": "What is the main communication goal of this module?",
                "choices": [
                    "Describe people clearly and appropriately",
                    "Replace greeting signs entirely",
                    "Focus only on spelling names",
                    "Avoid conversation context",
                ],
                "answer": "Describe people clearly and appropriately",
            }
        ],
    },
    {
        "slug": "days",
        "title": "Module 6: Days",
        "description": (
            "This module covers time-related concepts in FSL. Students learn how to express days of the week, "
            "parts of the day, and general time references such as past, present, and future. This allows "
            "learners to organize information and communicate schedules or sequences of events."
        ),
        "order_index": 6,
        "lessons": [
            {"id": "m6-l1", "title": "MONDAY", "content": "Practice the sign for MONDAY with clear form and timing context."},
            {"id": "m6-l2", "title": "TUESDAY", "content": "Practice the sign for TUESDAY with clear form and timing context."},
            {"id": "m6-l3", "title": "WEDNESDAY", "content": "Practice the sign for WEDNESDAY with clear form and timing context."},
            {"id": "m6-l4", "title": "THURSDAY", "content": "Practice the sign for THURSDAY with clear form and timing context."},
            {"id": "m6-l5", "title": "FRIDAY", "content": "Practice the sign for FRIDAY with clear form and timing context."},
            {"id": "m6-l6", "title": "SATURDAY", "content": "Practice the sign for SATURDAY with clear form and timing context."},
            {"id": "m6-l7", "title": "SUNDAY", "content": "Practice the sign for SUNDAY with clear form and timing context."},
            {"id": "m6-l8", "title": "TODAY", "content": "Practice the sign for TODAY in schedule and activity statements."},
            {"id": "m6-l9", "title": "TOMORROW", "content": "Practice the sign for TOMORROW in schedule and activity statements."},
            {"id": "m6-l10", "title": "YESTERDAY", "content": "Practice the sign for YESTERDAY in schedule and activity statements."},
        ],
        "assessments": [
            {
                "id": "m6-q1",
                "question": "Why are time-reference signs useful?",
                "choices": [
                    "They help organize events and schedules",
                    "They remove the need for context",
                    "They replace all noun signs",
                    "They are only for greetings",
                ],
                "answer": "They help organize events and schedules",
            },
            {
                "id": "m6-q2",
                "question": "Which sign best indicates a past event?",
                "choices": ["YESTERDAY", "TOMORROW", "TODAY", "MONDAY"],
                "answer": "YESTERDAY",
            },
            {
                "id": "m6-q3",
                "question": "If a class is next day, which time-reference sign is correct?",
                "choices": ["TOMORROW", "YESTERDAY", "SUNDAY", "TODAY"],
                "answer": "TOMORROW",
            },
            {
                "id": "m6-q4",
                "question": "What is the best way to sign schedules clearly?",
                "choices": [
                    "Combine day signs with time references",
                    "Use random day signs",
                    "Skip day and time signs",
                    "Use only fingerspelling",
                ],
                "answer": "Combine day signs with time references",
            },
            {
                "id": "m6-q5",
                "question": "Which sign names a specific weekday?",
                "choices": ["FRIDAY", "TODAY", "TOMORROW", "YESTERDAY"],
                "answer": "FRIDAY",
            }
        ],
    },
    {
        "slug": "colors-descriptions",
        "title": "Module 7: Colors & Descriptions",
        "description": (
            "This module introduces descriptive signs, including colors, sizes, and qualities. Students learn "
            "how to describe objects and people more clearly. This enhances their ability to provide details "
            "and make their communication more specific."
        ),
        "order_index": 7,
        "lessons": [
            {"id": "m7-l1", "title": "BLUE", "content": "Practice the sign for BLUE in object description examples."},
            {"id": "m7-l2", "title": "GREEN", "content": "Practice the sign for GREEN in object description examples."},
            {"id": "m7-l3", "title": "RED", "content": "Practice the sign for RED in object description examples."},
            {"id": "m7-l4", "title": "BROWN", "content": "Practice the sign for BROWN in object description examples."},
            {"id": "m7-l5", "title": "BLACK", "content": "Practice the sign for BLACK in object description examples."},
            {"id": "m7-l6", "title": "WHITE", "content": "Practice the sign for WHITE in object description examples."},
            {"id": "m7-l7", "title": "YELLOW", "content": "Practice the sign for YELLOW in object description examples."},
            {"id": "m7-l8", "title": "ORANGE", "content": "Practice the sign for ORANGE in object description examples."},
            {"id": "m7-l9", "title": "GRAY", "content": "Practice the sign for GRAY in object description examples."},
            {"id": "m7-l10", "title": "PINK", "content": "Practice the sign for PINK in object description examples."},
            {"id": "m7-l11", "title": "VIOLET", "content": "Practice the sign for VIOLET in object description examples."},
            {"id": "m7-l12", "title": "LIGHT", "content": "Practice the sign for LIGHT as a descriptive quality in context."},
            {"id": "m7-l13", "title": "DARK", "content": "Practice the sign for DARK as a descriptive quality in context."},
        ],
        "assessments": [
            {
                "id": "m7-q1",
                "question": "What is the goal of descriptive signs?",
                "choices": [
                    "To make communication more specific",
                    "To avoid describing anything",
                    "To sign only verbs",
                    "To skip visual details",
                ],
                "answer": "To make communication more specific",
            },
            {
                "id": "m7-q2",
                "question": "Which pair represents brightness contrast in this module?",
                "choices": ["LIGHT and DARK", "BLUE and RED", "WHITE and BLACK", "GREEN and BROWN"],
                "answer": "LIGHT and DARK",
            },
            {
                "id": "m7-q3",
                "question": "If you need to describe a red object, which sign is required?",
                "choices": ["RED", "PINK", "ORANGE", "GRAY"],
                "answer": "RED",
            },
            {
                "id": "m7-q4",
                "question": "How do descriptive signs improve conversations?",
                "choices": [
                    "They add clearer visual details",
                    "They remove context from sentences",
                    "They replace all noun signs",
                    "They reduce communication accuracy",
                ],
                "answer": "They add clearer visual details",
            },
            {
                "id": "m7-q5",
                "question": "When two objects are similar, what helps distinguish them?",
                "choices": [
                    "Use color and quality signs together",
                    "Use only a pointing gesture",
                    "Avoid descriptive signs",
                    "Repeat one random sign",
                ],
                "answer": "Use color and quality signs together",
            }
        ],
    },
    {
        "slug": "basic-conversations",
        "title": "Module 8: Basic Conversations",
        "description": (
            "This module integrates all previously learned signs into simple conversations. Students practice "
            "forming complete thoughts, asking and answering questions, and maintaining short dialogues. The "
            "goal is to develop functional communication skills and prepare learners for real-world interactions "
            "using FSL."
        ),
        "order_index": 8,
        "lessons": [
            {"id": "m8-l1", "title": "UNDERSTAND", "content": "Practice using UNDERSTAND in short conversation responses."},
            {"id": "m8-l2", "title": "DON'T UNDERSTAND", "content": "Practice using DON'T UNDERSTAND to ask for clarification."},
            {"id": "m8-l3", "title": "KNOW", "content": "Practice using KNOW in basic conversation exchanges."},
            {"id": "m8-l4", "title": "DON'T KNOW", "content": "Practice using DON'T KNOW in basic conversation exchanges."},
            {"id": "m8-l5", "title": "NO", "content": "Practice using NO clearly in question-and-answer dialogue."},
            {"id": "m8-l6", "title": "YES", "content": "Practice using YES clearly in question-and-answer dialogue."},
            {"id": "m8-l7", "title": "WRONG", "content": "Practice using WRONG as a corrective response in dialogue."},
            {"id": "m8-l8", "title": "CORRECT", "content": "Practice using CORRECT as a confirming response in dialogue."},
            {"id": "m8-l9", "title": "SLOW", "content": "Practice using SLOW in conversation pacing requests."},
            {"id": "m8-l10", "title": "FAST", "content": "Practice using FAST in conversation pacing requests."},
        ],
        "assessments": [
            {
                "id": "m8-q1",
                "question": "What is the main purpose of this module?",
                "choices": [
                    "Develop functional communication in real interactions",
                    "Memorize isolated signs only",
                    "Avoid asking questions",
                    "Use fingerspelling for every phrase",
                ],
                "answer": "Develop functional communication in real interactions",
            },
            {
                "id": "m8-q2",
                "question": "If you miss part of a message, which response is most appropriate?",
                "choices": ["DON'T UNDERSTAND", "CORRECT", "YES", "FAST"],
                "answer": "DON'T UNDERSTAND",
            },
            {
                "id": "m8-q3",
                "question": "Which sign is best for confirming accuracy?",
                "choices": ["CORRECT", "WRONG", "NO", "DON'T KNOW"],
                "answer": "CORRECT",
            },
            {
                "id": "m8-q4",
                "question": "Which sign can request slower pacing in a conversation?",
                "choices": ["SLOW", "FAST", "KNOW", "UNDERSTAND"],
                "answer": "SLOW",
            },
            {
                "id": "m8-q5",
                "question": "What skill is emphasized across this module's lessons?",
                "choices": [
                    "Responding appropriately in short dialogues",
                    "Avoiding responses in conversation",
                    "Using only one-word answers",
                    "Skipping question-and-answer practice",
                ],
                "answer": "Responding appropriately in short dialogues",
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


def _add_column_if_missing(table_name: str, column_name: str, ddl_sql: str) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    if table_name not in existing_tables:
        return
    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name in existing_columns:
        return
    with engine.begin() as connection:
        connection.execute(text(ddl_sql))


def ensure_schema_updates() -> None:
    # Users table profile/account lifecycle columns.
    _add_column_if_missing("users", "first_name", "ALTER TABLE users ADD COLUMN first_name VARCHAR(120)")
    _add_column_if_missing("users", "middle_name", "ALTER TABLE users ADD COLUMN middle_name VARCHAR(120)")
    _add_column_if_missing("users", "last_name", "ALTER TABLE users ADD COLUMN last_name VARCHAR(120)")
    _add_column_if_missing("users", "email", "ALTER TABLE users ADD COLUMN email VARCHAR(255)")
    _add_column_if_missing(
        "users", "phone_number", "ALTER TABLE users ADD COLUMN phone_number VARCHAR(40)"
    )
    _add_column_if_missing("users", "address", "ALTER TABLE users ADD COLUMN address TEXT")
    _add_column_if_missing("users", "birth_date", "ALTER TABLE users ADD COLUMN birth_date DATE")
    _add_column_if_missing(
        "users", "profile_image_path", "ALTER TABLE users ADD COLUMN profile_image_path VARCHAR(500)"
    )
    _add_column_if_missing(
        "users",
        "must_change_password",
        "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE",
    )
    _add_column_if_missing(
        "users",
        "role",
        "ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student'",
    )
    _add_column_if_missing(
        "user_module_progress",
        "assessment_right_count",
        "ALTER TABLE user_module_progress ADD COLUMN assessment_right_count INTEGER",
    )
    _add_column_if_missing(
        "user_module_progress",
        "assessment_wrong_count",
        "ALTER TABLE user_module_progress ADD COLUMN assessment_wrong_count INTEGER",
    )
    _add_column_if_missing(
        "user_module_progress",
        "assessment_total_items",
        "ALTER TABLE user_module_progress ADD COLUMN assessment_total_items INTEGER",
    )
    _add_column_if_missing(
        "user_module_progress",
        "assessment_label",
        "ALTER TABLE user_module_progress ADD COLUMN assessment_label VARCHAR(255)",
    )
    _add_column_if_missing(
        "user_module_progress",
        "completed_assessments",
        "ALTER TABLE user_module_progress ADD COLUMN completed_assessments JSON NOT NULL DEFAULT '[]'",
    )
    _add_column_if_missing(
        "user_module_progress",
        "improvement_areas",
        "ALTER TABLE user_module_progress ADD COLUMN improvement_areas JSON NOT NULL DEFAULT '[]'",
    )
    _add_column_if_missing(
        "user_module_progress",
        "report_sent_at",
        "ALTER TABLE user_module_progress ADD COLUMN report_sent_at TIMESTAMP",
    )

    # Registration workflow columns for teacher validation.
    _add_column_if_missing(
        "registrations", "status", "ALTER TABLE registrations ADD COLUMN status VARCHAR(20) DEFAULT 'pending'"
    )
    _add_column_if_missing(
        "registrations", "validated_at", "ALTER TABLE registrations ADD COLUMN validated_at TIMESTAMP"
    )
    _add_column_if_missing(
        "registrations", "validated_by", "ALTER TABLE registrations ADD COLUMN validated_by VARCHAR(120)"
    )
    _add_column_if_missing(
        "registrations", "linked_user_id", "ALTER TABLE registrations ADD COLUMN linked_user_id INTEGER"
    )
    _add_column_if_missing(
        "registrations", "issued_username", "ALTER TABLE registrations ADD COLUMN issued_username VARCHAR(120)"
    )
    _add_column_if_missing("registrations", "notes", "ALTER TABLE registrations ADD COLUMN notes TEXT")


def init_db() -> None:
    # Import models before create_all so SQLAlchemy registers metadata.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    ensure_schema_updates()
    with SessionLocal() as db:
        seed_modules(db)
        seed_demo_user(db)
