const LETTER_TEXT_PATTERN = /^[A-Za-z][A-Za-z\s'-]*$/;
const JUNK_WORDS = new Set(["asdf", "qwerty", "test", "none", "null", "admin", "user", "xxx", "xxxx"]);

export function lettersOnlyInput(value: string) {
  return value.replace(/[^A-Za-z\s'-]/g, "").replace(/\s{2,}/g, " ");
}

export function digitsOnlyInput(value: string) {
  return value.replace(/\D/g, "");
}

export function validateMeaningfulLetters(value: string, fieldName: string, options?: { minWords?: number }) {
  const clean = value.trim().replace(/\s+/g, " ");

  if (!clean) return `${fieldName} is required.`;
  if (!LETTER_TEXT_PATTERN.test(clean)) return `${fieldName} must contain letters only.`;

  const words = clean.split(" ").filter(Boolean);
  if (options?.minWords && words.length < options.minWords) {
    return `${fieldName} must include at least ${options.minWords} words.`;
  }

  for (const word of words) {
    const plain = word.replace(/['-]/g, "").toLowerCase();

    if (plain.length < 2) return `${fieldName} contains a word that is too short.`;
    if (!/[aeiou]/i.test(plain)) return `${fieldName} contains a word that does not look meaningful.`;
    if (/(.)\1{2,}/i.test(plain)) return `${fieldName} contains repeated letters that do not look meaningful.`;
    if (JUNK_WORDS.has(plain)) return `${fieldName} contains placeholder text. Please enter the real value.`;
  }

  return "";
}

export function validateNumericText(value: string, fieldName: string, options?: { minLength?: number; maxLength?: number }) {
  const clean = value.trim();

  if (!clean) return `${fieldName} is required.`;
  if (!/^\d+$/.test(clean)) return `${fieldName} must contain numbers only.`;
  if (options?.minLength && clean.length < options.minLength) {
    return `${fieldName} must be at least ${options.minLength} digits.`;
  }
  if (options?.maxLength && clean.length > options.maxLength) {
    return `${fieldName} must be ${options.maxLength} digits or fewer.`;
  }

  return "";
}
