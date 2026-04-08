"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { useAuth } from "@/components/auth-context";
import {
  isStrongPassword,
  isValidEmail,
  isValidPhilippinePhone,
} from "@/lib/validation";

type TeacherRegisterForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  address: string;
  birthDate: string;
  username: string;
  password: string;
  passkey: string;
};

const INITIAL_FORM: TeacherRegisterForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  address: "",
  birthDate: "",
  username: "",
  password: "",
  passkey: "",
};

export default function TeacherRegisterPage() {
  const router = useRouter();
  const { loading, registerTeacher } = useAuth();
  const [form, setForm] = useState<TeacherRegisterForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof TeacherRegisterForm>(
    key: K,
    value: TeacherRegisterForm[K]
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = form.email.trim();
    const phone = form.phoneNumber.trim();
    const password = form.password;

    if (!isValidEmail(email)) {
      setError(
        "Email must be valid (example: name@gmail.com, name@hotmail.com, name@yahoo.com)."
      );
      return;
    }

    if (!isValidPhilippinePhone(phone)) {
      setError("Phone number must be exactly 11 digits (example: 09XXXXXXXXX).");
      return;
    }

    if (!isStrongPassword(password)) {
      setError(
        "Password must be at least 8 characters with 1 uppercase letter, 1 number, and 1 symbol."
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await registerTeacher({
        username: form.username.trim(),
        password,
        passkey: form.passkey.trim(),
        first_name: form.firstName.trim(),
        middle_name: form.middleName.trim() || undefined,
        last_name: form.lastName.trim(),
        email,
        phone_number: phone,
        address: form.address.trim() || undefined,
        birth_date: form.birthDate.trim() || undefined,
      });

      router.push("/teacher");
      router.refresh();
    } catch (registerError) {
      const message =
        registerError instanceof Error
          ? registerError.message
          : "Teacher registration failed.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel panel-lively">
        <p className="text-xs uppercase tracking-wider label-accent">Phase 3</p>
        <h2 className="mt-2 text-2xl font-semibold title-gradient">Teacher Registration</h2>
        <p className="mt-2 text-sm text-muted">
          Create a live teacher account using the registration passkey provided by your school
          coordinator or administrator.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            className="rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/"
          >
            Back to Login
          </Link>
          <Link
            className="rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            href="/register"
          >
            Student Registration
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
            Email
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("email", event.target.value)}
              pattern="^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"
              required
              type="email"
              value={form.email}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Phone Number
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("phoneNumber", event.target.value)}
              pattern="^\\d{11}$"
              placeholder="09XXXXXXXXX"
              required
              type="tel"
              value={form.phoneNumber}
            />
            <p className="text-xs text-muted">Format: `09XXXXXXXXX` (11 digits only)</p>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Birth Date
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("birthDate", event.target.value)}
              type="date"
              value={form.birthDate}
            />
            <p className="text-xs text-muted">Optional</p>
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Username
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("username", event.target.value)}
              required
              type="text"
              value={form.username}
            />
          </label>
        </div>

        <label className="space-y-1 text-sm font-semibold text-slate-800">
          Address
          <textarea
            className="min-h-20 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => updateField("address", event.target.value)}
            placeholder="Optional school or home address"
            value={form.address}
          />
          <p className="text-xs text-muted">Optional</p>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Password
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              minLength={8}
              onChange={(event) => updateField("password", event.target.value)}
              pattern="^(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$"
              required
              type="password"
              value={form.password}
            />
            <p className="text-xs text-muted">
              At least 8 chars, 1 uppercase, 1 number, and 1 symbol.
            </p>
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-800">
            Teacher Passkey
            <input
              className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => updateField("passkey", event.target.value)}
              required
              type="password"
              value={form.passkey}
            />
            <p className="text-xs text-muted">
              Ask your coordinator for the current passkey. Best practice is to rotate this
              regularly.
            </p>
          </label>
        </div>

        <div className="rounded-xl border border-brandBorder bg-brandBlueLight/35 p-4">
          <p className="text-sm font-semibold text-slate-900">Recommended rollout</p>
          <p className="mt-1 text-sm text-slate-700">
            This shared passkey flow is the fastest stable option for Phase 3. A stronger next step
            after rollout is moving to one-time invite codes per teacher.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || submitting}
            type="submit"
          >
            {submitting ? "Creating Account..." : "Create Teacher Account"}
          </button>

          <button
            className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            onClick={() => {
              setForm(INITIAL_FORM);
              setError(null);
            }}
            type="button"
          >
            Clear
          </button>
        </div>

        {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
      </form>
    </section>
  );
}
