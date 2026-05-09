// passwordStrength.js
// Checks how strong a password is based on a set of rules.
// Used by the Settings page when adding or changing passwords.

// Rules that the password must pass
export const PASSWORD_RULES = [
  {
    id:      'length',
    label:   'At least 8 characters',
    test:    (p) => p.length >= 8,
  },
  {
    id:      'uppercase',
    label:   'At least one uppercase letter (A-Z)',
    test:    (p) => /[A-Z]/.test(p),
  },
  {
    id:      'number',
    label:   'At least one number (0-9)',
    test:    (p) => /[0-9]/.test(p),
  },
  {
    id:      'special',
    label:   'At least one special character (!@#$%^&*)',
    test:    (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p),
  },
];

// Returns how many rules the password passes
// Also returns the strength level: 'weak', 'medium', or 'strong'
export function checkPasswordStrength(password) {
  if (!password) {
    return { score: 0, level: null, passed: [], failed: PASSWORD_RULES.map(r => r.id) };
  }

  const passed = PASSWORD_RULES.filter(r => r.test(password)).map(r => r.id);
  const failed = PASSWORD_RULES.filter(r => !r.test(password)).map(r => r.id);
  const score  = passed.length;

  let level = 'weak';
  if (score === 4)      level = 'strong';
  else if (score >= 2)  level = 'medium';

  return { score, level, passed, failed };
}

// Color and label for each strength level
export const STRENGTH_CONFIG = {
  weak:   { color: '#ef4444', bg: '#fef2f2', label: 'Weak',   bars: 1 },
  medium: { color: '#f59e0b', bg: '#fffbeb', label: 'Medium', bars: 2 },
  strong: { color: '#10b981', bg: '#f0fdf4', label: 'Strong', bars: 3 },
};
