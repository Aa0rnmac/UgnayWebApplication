"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import { submitRegistration } from "@/lib/api";
import {
  isValidEmail,
  isValidPhilippinePhone,
  normalizePhilippinePhone
} from "@/lib/validation";

type FormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: string;
  address: string;
  email: string;
  phoneNumber: string;
  referenceNumber: string;
  referenceImage: File | null;
};

const INITIAL_FORM: FormState = {
  firstName: "",
  middleName: "",
  lastName: "",
  birthDate: "",
  address: "",
  email: "",
  phoneNumber: "",
  referenceNumber: "",
  referenceImage: null
};

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const imagePreview = useMemo(() => {
    if (!form.referenceImage) {
      return null;
    }
    return URL.createObjectURL(form.referenceImage);
  }, [form.referenceImage]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    updateField("referenceImage", file);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = form.email.trim();
    const phone = normalizePhilippinePhone(form.phoneNumber);

    if (!isValidEmail(email)) {
      setError(
        "Email must be valid (example: name@gmail.com, name@hotmail.com, name@yahoo.com)."
      );
      return;
    }
    if (!isValidPhilippinePhone(phone)) {
      setError("Phone number must start with 09 and contain exactly 11 digits (example: 09123456789).");
      return;
    }
    if (!form.referenceImage) {
      setError("Reference image upload is required.");
      return;
    }
    const referenceImage = form.referenceImage;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await submitRegistration({
        first_name: form.firstName.trim(),
        middle_name: form.middleName.trim() || undefined,
        last_name: form.lastName.trim(),
        birth_date: form.birthDate.trim(),
        address: form.address.trim(),
        email,
        phone_number: phone,
        reference_number: form.referenceNumber.trim(),
        reference_image: referenceImage
      });

      setSuccess(
        `${response.message}\nReference #${response.registration.reference_number}\nStatus: pending teacher review`
      );
      setForm(INITIAL_FORM);
      setFileInputKey((value) => value + 1);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Registration submission failed.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel panel-lively">
        <h2 className="text-2xl font-semibold title-gradient">Student Registration</h2>
        <p className="mt-2 text-sm text-muted">
          Fill in your personal information, contact details, and reference number. All fields are
          required except middle name, and payment reference image upload is required. A teacher
          will review and validate the registration before login credentials are issued.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            className="inline-flex rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/"
          >
            Back to Login
          </Link>
        </div>
      </div>

      <form className="panel panel-lively space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            First Name
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("firstName", event.target.value)}
              required
              type="text"
              value={form.firstName}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Middle Name
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("middleName", event.target.value)}
              type="text"
              value={form.middleName}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Last Name
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("lastName", event.target.value)}
              required
              type="text"
              value={form.lastName}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Birth Date
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("birthDate", event.target.value)}
              required
              type="date"
              value={form.birthDate}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Phone Number
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              autoComplete="tel-national"
              inputMode="numeric"
              maxLength={11}
              onChange={(event) => updateField("phoneNumber", normalizePhilippinePhone(event.target.value))}
              pattern="09[0-9]{9}"
              placeholder="09XXXXXXXXX"
              required
              type="tel"
              value={form.phoneNumber}
            />
            <p className="text-xs text-muted">Format: `09XXXXXXXXX` (must start with 09 and be 11 digits)</p>
          </label>
        </div>

        <label className="space-y-1 text-sm font-semibold text-slate-800">
          Address
          <textarea
            className="min-h-20 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => updateField("address", event.target.value)}
            placeholder="House number, street, barangay, city"
            required
            value={form.address}
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Email
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("email", event.target.value)}
              pattern="^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"
              required
              type="email"
              value={form.email}
            />
            <p className="text-xs text-muted">Example: `name@gmail.com`</p>
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Reference Number
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("referenceNumber", event.target.value)}
              required
              type="text"
              value={form.referenceNumber}
            />
          </label>
        </div>

        <div className="rounded-xl border border-brandBorder bg-brandBlueLight/40 p-3">
          <p className="text-sm font-semibold text-slate-800">Upload Proof of Payment</p>
          <p className="mt-1 text-xs text-muted">Accepted: JPG, PNG, WEBP (max 6MB)</p>

          <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90">
            Upload Image
            <input
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              key={fileInputKey}
              onChange={onImageChange}
              required
              type="file"
            />
          </label>

          <div className="mt-2 text-xs text-slate-600">
            {form.referenceImage ? `Selected: ${form.referenceImage.name}` : "No image selected"}
          </div>

          {imagePreview ? (
            <img
              alt="Reference preview"
              className="mt-3 h-44 w-full rounded-lg border border-brandBorder bg-white object-contain"
              src={imagePreview}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg bg-brandRed px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandRed/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Submitting..." : "Submit Registration"}
          </button>

          <button
            className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            onClick={() => {
              setForm(INITIAL_FORM);
              setFileInputKey((value) => value + 1);
              setError(null);
              setSuccess(null);
            }}
            type="button"
          >
            Clear
          </button>

          <Link
            className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/"
          >
            Back to Login
          </Link>
        </div>

        {success ? (
          <p className="whitespace-pre-line rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm font-semibold text-slate-800">
            {success}
          </p>
        ) : null}

        {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
      </form>
    </section>
  );
}
