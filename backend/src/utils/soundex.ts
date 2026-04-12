/**
 * American Soundex algorithm.
 * Produces a 4-character code: first letter (uppercased) + 3 digits.
 * Used for phonetic matching of English surnames.
 */
export function soundex(input: string): string {
  if (!input) return '';

  // Strip non-alpha characters, uppercase
  const s = input.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (s.length === 0) return '';

  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };

  let code = s[0];
  let lastDigit = map[s[0]] ?? '0';

  for (let i = 1; i < s.length && code.length < 4; i++) {
    const digit = map[s[i]];
    if (digit && digit !== lastDigit) {
      code += digit;
    }
    // H and W are ignored as separators but don't reset lastDigit
    if (s[i] !== 'H' && s[i] !== 'W') {
      lastDigit = digit ?? '0';
    }
  }

  return code.padEnd(4, '0');
}
