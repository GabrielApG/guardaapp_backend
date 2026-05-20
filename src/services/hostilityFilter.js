const HOSTILE_PATTERNS = [
  { pattern: /irrespons[aá]vel/i,  score: 0.7 },
  { pattern: /incompetente/i,       score: 0.8 },
  { pattern: /mentiro(so|sa)/i,     score: 0.9 },
  { pattern: /inútil/i,             score: 0.8 },
  { pattern: /descuidado/i,         score: 0.6 },
  { pattern: /abandono/i,           score: 0.7 },
  { pattern: /ameaço/i,             score: 1.0 },
  { pattern: /processarei/i,        score: 0.8 },
  { pattern: /advogado/i,           score: 0.4 },
  { pattern: /vagabund[oa]/i,       score: 1.0 },
  { pattern: /idiota/i,             score: 0.9 },
  { pattern: /você não presta/i,    score: 1.0 },
  { pattern: /péssim[oa] mãe/i,     score: 1.0 },
  { pattern: /péssim[oa] pai/i,     score: 1.0 },
];

function analyze(text) {
  const flags = [];
  let totalScore = 0;

  for (const { pattern, score } of HOSTILE_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(pattern.toString());
      totalScore = Math.max(totalScore, score);
    }
  }

  return {
    hostile:    totalScore >= 0.6,
    score:      totalScore,
    flags,
    suggestion: totalScore >= 0.6 ? 'Sua mensagem pode ser interpretada de forma hostil. Considere reformular.' : null,
  };
}

module.exports = { analyze };
