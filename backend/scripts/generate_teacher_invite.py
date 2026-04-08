from __future__ import annotations

import argparse
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont

from app.core.config import PROJECT_ROOT
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.teacher_invite import TeacherInvite
from app.services.teacher_invites import build_qr_payload, generate_invite_code, generate_teacher_passkey


def build_printable_card(
    qr_image: Image.Image,
    invite_label: str,
    invite_code: str,
    passkey: str,
) -> Image.Image:
    card = Image.new("RGB", (1400, 2000), color="white")
    draw = ImageDraw.Draw(card)
    title_font = ImageFont.load_default()
    text_font = ImageFont.load_default()

    draw.text((80, 80), "UGNAY Learning Hub", fill="black", font=title_font)
    draw.text((80, 120), "Teacher Onboarding QR + Passkey", fill="black", font=text_font)

    draw.text((80, 200), f"Label: {invite_label}", fill="black", font=text_font)
    draw.text((80, 240), f"Invite Code: {invite_code}", fill="black", font=text_font)
    draw.text((80, 280), f"Passkey: {passkey}", fill="black", font=text_font)
    draw.text(
        (80, 330),
        "Use this QR and passkey only for teacher account registration.",
        fill="black",
        font=text_font,
    )

    qr_size = 900
    qr = qr_image.convert("RGB").resize((qr_size, qr_size))
    qr_x = (card.width - qr_size) // 2
    card.paste(qr, (qr_x, 430))
    return card


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate reusable teacher QR + passkey invite.")
    parser.add_argument("--label", default="Teacher Invite", help="Label for this invite.")
    parser.add_argument(
        "--output-dir",
        default=str((PROJECT_ROOT / "backend" / "artifacts" / "teacher_invites").resolve()),
        help="Directory where QR and printable files will be written.",
    )
    args = parser.parse_args()

    invite_code = generate_invite_code()
    passkey = generate_teacher_passkey()
    qr_payload = build_qr_payload(invite_code)

    with SessionLocal() as db:
        invite = TeacherInvite(
            invite_code=invite_code,
            label=args.label.strip() or "Teacher Invite",
            passkey_hash=hash_password(passkey),
            status="active",
        )
        db.add(invite)
        db.commit()

    output_root = Path(args.output_dir).expanduser().resolve() / invite_code
    output_root.mkdir(parents=True, exist_ok=True)

    qr_image = qrcode.make(qr_payload)
    qr_path = output_root / "invite_qr.png"
    qr_image.save(qr_path)

    card = build_printable_card(
        qr_image=qr_image,
        invite_label=args.label.strip() or "Teacher Invite",
        invite_code=invite_code,
        passkey=passkey,
    )
    card_png_path = output_root / "printable_card.png"
    card_pdf_path = output_root / "printable_card.pdf"
    card.save(card_png_path)
    card.save(card_pdf_path, "PDF", resolution=150.0)

    print("Teacher invite generated successfully.")
    print(f"Invite Code : {invite_code}")
    print(f"Passkey     : {passkey}")
    print(f"QR Image    : {qr_path}")
    print(f"Print PNG   : {card_png_path}")
    print(f"Print PDF   : {card_pdf_path}")
    print("Keep passkey secure. It is shown only once.")


if __name__ == "__main__":
    main()
