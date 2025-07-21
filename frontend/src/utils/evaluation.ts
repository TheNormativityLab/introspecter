interface DebateSession {
  getAgentResponses(): Record<string, string[]>;
}

interface DebateResult {
  debateSession: DebateSession;
  correctAnswer: string | number;
  validOptions?: string[];
}

type TaskName = 'mmlu' | 'math' | 'commonsense_qa' | 'gsm8k';

function solveMathProblems(inputStr: string): string | null {
  const pattern = /\d+\.?\d*/g;
  const matches = inputStr.match(pattern);
  return matches ? matches[matches.length - 1] : null;
}

function parseMmluAnswer(inputStr: string, validOptions?: string[]): string | null {
  const defaultValidOptions = ['A', 'B', 'C', 'D', 'E'];
  const options = validOptions || defaultValidOptions;
  
  const cleanStr = inputStr.trim();
  
  const patterns = [
    {
      regex: /(?:answer\s+is\s*|final\s+answer\s*(?:is)?\s*:?\s*|therefore[^.]*?answer[^.]*?is\s*|thus[^.]*?answer[^.]*?is\s*|my\s+(?:updated\s+)?answer\s+is\s*)\(?([A-E])\)?/gi,
      priority: 10,
      captureGroup: 1
    },
    
    {
      regex: /\(([A-E])\)\s*\.?\s*$/gi,
      priority: 9,
      captureGroup: 1
    },
    
    {
      regex: /(?:thus|therefore|hence|so|in conclusion)[^.]*?(?:answer|option|choice)[^.]*?\(?([A-E])\)?(?=.{0,50}$)/gi,
      priority: 8,
      captureGroup: 1
    },
    
    {
      regex: /(?:the\s+)?(?:correct\s+)?answer\s+is\s+(?:option\s+)?\(?([A-E])\)?/gi,
      priority: 7,
      captureGroup: 1
    },
    
    {
      regex: /(?:I\s+(?:choose|select|pick)|my\s+choice\s+is)\s+(?:option\s+)?\(?([A-E])\)?/gi,
      priority: 6,
      captureGroup: 1
    },
    
    {
      regex: /\b(?:option|choice)\s+([A-E])\b/gi,
      priority: 5,
      captureGroup: 1
    },
    
    {
      regex: /([A-E])\)\s*[a-z\s]+/gi,
      priority: 4,
      captureGroup: 1
    },
    
    {
      regex: /\(([A-E])\)/g,
      priority: 3,
      captureGroup: 1
    },
    
    {
      regex: /\b([A-E])\)/g,
      priority: 2,
      captureGroup: 1
    },
    
    {
      regex: /\b([A-E])\b/g,
      priority: 1,
      captureGroup: 1
    }
  ];
  
  const candidates: Array<{answer: string, priority: number, position: number, context: string}> = [];
  
  for (const pattern of patterns) {
    const matches = [...cleanStr.matchAll(pattern.regex)];
    
    for (const match of matches) {
      const candidate = match[pattern.captureGroup]?.toUpperCase();
      if (candidate && options.includes(candidate)) {
        const contextStart = Math.max(0, (match.index || 0) - 50);
        const contextEnd = Math.min(cleanStr.length, (match.index || 0) + match[0].length + 50);
        const context = cleanStr.slice(contextStart, contextEnd).toLowerCase();
        
        candidates.push({
          answer: candidate,
          priority: pattern.priority,
          position: match.index || 0,
          context: context
        });
      }
    }
  }
  
  if (candidates.length === 0) {
    return null;
  }
  
  const filteredCandidates = candidates.filter(candidate => {
    const negativePatterns = [
      /not\s+([A-E])/i,
      /isn't\s+([A-E])/i,
      /wasn't\s+([A-E])/i,
      /exclude\s+([A-E])/i,
      /eliminate\s+([A-E])/i,
      /wrong.*?([A-E])/i,
      /incorrect.*?([A-E])/i
    ];
    
    return !negativePatterns.some(pattern => {
      const match = candidate.context.match(pattern);
      return match && match[1] && match[1].toUpperCase() === candidate.answer;
    });
  });
  
  const workingCandidates = filteredCandidates.length > 0 ? filteredCandidates : candidates;
  
  workingCandidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return b.position - a.position;
  });
  
  const lastPortion = cleanStr.slice(-200).toLowerCase();
  const conclusiveWords = [
    'therefore', 'thus', 'hence', 'so', 'final answer', 'conclusion',
    'answer is', 'correct answer', 'the answer', 'my answer', 'updated answer'
  ];
  
  const finalPortionCandidates = workingCandidates.filter(c => 
    c.position >= cleanStr.length - 200
  );
  
  if (finalPortionCandidates.length > 0) {
    const highPriorityFinal = finalPortionCandidates.filter(c => c.priority >= 7);
    if (highPriorityFinal.length > 0) {
      return highPriorityFinal[0].answer;
    }
  }
  
  const hasConclusive = conclusiveWords.some(word => lastPortion.includes(word));
  if (hasConclusive && finalPortionCandidates.length > 0) {
    return finalPortionCandidates[0].answer;
  }
  
  const highPriorityCandidates = workingCandidates.filter(c => c.priority >= 6);
  if (highPriorityCandidates.length > 0) {
    return highPriorityCandidates[0].answer;
  }
  
  const answerCounts = new Map<string, number>();
  const recentBonus = new Map<string, number>();
  const textLength = cleanStr.length;
  
  workingCandidates.forEach(c => {
    answerCounts.set(c.answer, (answerCounts.get(c.answer) || 0) + 1);
    
    if (c.position >= textLength * 0.7) {
      recentBonus.set(c.answer, (recentBonus.get(c.answer) || 0) + 0.5);
    }
  });
  
  let bestAnswer = '';
  let bestScore = 0;
  
  for (const [answer, count] of answerCounts.entries()) {
    const score = count + (recentBonus.get(answer) || 0);
    if (score > bestScore) {
      bestScore = score;
      bestAnswer = answer;
    }
  }
  
  if (bestAnswer) {
    return bestAnswer;
  }
  
  return workingCandidates[0]?.answer || null;
}

function parseCommonsenseQaAnswer(inputStr: string, validOptions?: string[]): string | null {
  return parseMmluAnswer(inputStr, validOptions);
}

function parseMathAnswer(inputStr: string): number | null {
  const answerPatterns = [
    /(?:answer|result|solution)\s*(?:is|=|:)\s*(-?\d*\.?\d+)/gi,
    /(?:final answer|the answer)\s*(?:is|=|:)\s*(-?\d*\.?\d+)/gi,
    /(?:therefore|thus|so)\s*(?:,)?\s*(-?\d*\.?\d+)/gi,
    /=\s*(-?\d*\.?\d+)/g,
    /(-?\d*\.?\d+)$/g
  ];
  
  for (const pattern of answerPatterns) {
    const matches = [...inputStr.matchAll(pattern)];
    if (matches.length > 0) {
      const solution = matches[matches.length - 1][1].replace(/[^0-9.-]/g, '');
      if (solution) {
        return parseFloat(solution);
      }
    }
  }
  
  const pattern = /(-?\d*\.?\d+)/g;
  const matches = [...inputStr.matchAll(pattern)];
  
  for (let i = matches.length - 1; i >= 0; i--) {
    const solution = matches[i][1].replace(/[^0-9.-]/g, '');
    if (solution) {
      return parseFloat(solution);
    }
  }
  
  return null;
}

function parseGsm8kAnswer(inputStr: string): string | null {
  const bracePattern = /\{([0-9.,$]*)\}/g;
  const braceMatches = [...inputStr.matchAll(bracePattern)];
  
  for (let i = braceMatches.length - 1; i >= 0; i--) {
    const solution = braceMatches[i][1].replace(/[^0-9.]/g, '');
    if (solution) {
      return solution;
    }
  }
  
  return solveMathProblems(inputStr);
}

function mostFrequent<T>(answers: T[]): T | null {
  if (answers.length === 0) {
    return null;
  }

  let counter = 0;
  let mostFreq = answers[0];

  for (const answer of answers) {
    const currentFrequency = answers.filter(a => a === answer).length;
    if (currentFrequency > counter) {
      counter = currentFrequency;
      mostFreq = answer;
    }
  }

  return mostFreq;
}

function answerCheck<T>(predictedAnswers: T[], gtAnswer: T, strict: boolean = false): number {
  if (predictedAnswers.length === 0) {
    return 0.0;
  }

  if (strict) {
    const uniqueAnswers = new Set(predictedAnswers);
    if (uniqueAnswers.size > 1) {
      return 0.0;
    }
  }

  const mostFreqAnswer = mostFrequent(predictedAnswers);
  return mostFreqAnswer === gtAnswer ? 1.0 : 0.0;
}



 
export {
  solveMathProblems,
  parseMmluAnswer,
  parseCommonsenseQaAnswer,
  parseMathAnswer,
  parseGsm8kAnswer,
  mostFrequent,
  answerCheck,
  type DebateResult,
  type DebateSession,
  type TaskName,
};