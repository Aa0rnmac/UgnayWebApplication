const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PH_PHONE_REGEX = /^09\d{9}$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function normalizePhilippinePhone(value: string): string {
  return value.replace(/\D+/g, "").slice(0, 11);
}

export function isValidPhilippinePhone(value: string): boolean {
  return PH_PHONE_REGEX.test(normalizePhilippinePhone(value));
}

export function isStrongPassword(value: string): boolean {
  return STRONG_PASSWORD_REGEX.test(value);
}
