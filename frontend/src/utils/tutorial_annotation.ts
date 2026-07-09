export interface TutorialAnnotation {
  sentenceStart: string;
  sentenceEnd: string;
  label: "violation" | "good";
  norm: string;
  explanationShort: string;
  explanationLong: string;
}

export const tutorialAnnotations: TutorialAnnotation[][] = [
  [
    {
      "sentenceStart": "Debater B-turn1-sentence1",
      "sentenceEnd": "Debater B-turn1-sentence1",
      "label": "violation",
      "norm": "Provide a reason to accept as true all factual assertions (evidence, common knowledge, valid or reasonable inference from known facts)",
      "explanationShort": "Unsupported factual assertion",
      "explanationLong": "Debater gives no reason for us to believe that the incapacitation happened",
    },
    {
      "sentenceStart": "Debater B-turn1-sentence7",
      "sentenceEnd": "Debater B-turn1-sentence7",
      "label": "violation",
      "norm": "Ensure that inferences are valid or reasonable",
      "explanationShort": "Invalid inference",
      "explanationLong": "Not a reasonable inference from the quote above — it talks about the narrator’s blinding, not the priests’",
    },
    {
      "sentenceStart": "Debater B-turn1-sentence8",
      "sentenceEnd": "Debater B-turn1-sentence8",
      "label": "violation",
      "norm": "Ensure that inferences are valid or reasonable",
      "explanationShort": "Invalid inference",
      "explanationLong": "Incapacitation being the only explanation is not a valid inference",
    },
    {
      "sentenceStart": "Debater A-turn2-sentence6",
      "sentenceEnd": "Debater A-turn2-sentence6",
      "label": "good",
      "norm": "Stronger arguments rely on more commonly believed/accepted facts (status quo, usual course of events, ordinary motivations, etc.)",
      "explanationShort": "Relying on status quo",
      "explanationLong": "Debater makes assumptions based on the usual course of events",
    },
    {
      "sentenceStart": "Debater B-turn2-sentence1",
      "sentenceEnd": "Debater B-turn2-sentence7",
      "label": "violation",
      "norm": "Address and join issue with counterarguments",
      "explanationShort": "Ignored counterargument",
      "explanationLong": "Debater A’s counterargument is not addressed",
    },
    {
      "sentenceStart": "Debater B-turn2-sentence4",
      "sentenceEnd": "Debater B-turn2-sentence4",
      "label": "violation",
      "norm": "Ensure that inferences are valid or reasonable",
      "explanationShort": "Invalid inference",
      "explanationLong": "Not a valid inference from the above quote",
    },
    {
      "sentenceStart": "Debater B-turn2-sentence5",
      "sentenceEnd": "Debater B-turn2-sentence5",
      "label": "violation",
      "norm": "Don’t rely on unsupported speculation about facts",
      "explanationShort": "Unsupported speculation",
      "explanationLong": "Debater speculates that the incapacitation must have happened off page",
    },
    {
      "sentenceStart": "Debater A-turn3-sentence2",
      "sentenceEnd": "Debater A-turn3-sentence5",
      "label": "good",
      "norm": "Stronger arguments rely on more commonly believed/accepted facts (status quo, usual course of events, ordinary motivations, etc.)",
      "explanationShort": "Relying on status quo",
      "explanationLong": "Debater makes assumptions based on the status quo",
    },
    {
      "sentenceStart": "Debater A-turn3-sentence10",
      "sentenceEnd": "Debater A-turn3-sentence10",
      "label": "good",
      "norm": "Stronger arguments rely on more commonly believed/accepted facts (status quo, usual course of events, ordinary motivations, etc.)",
      "explanationShort": "Relying on status quo",
      "explanationLong": "Debater makes assumptions based on the usual course of events",
    },
    {
      "sentenceStart": "Debater B-turn3-sentence2",
      "sentenceEnd": "Debater B-turn3-sentence4",
      "label": "violation",
      "norm": "Ensure that inferences are valid or reasonable",
      "explanationShort": "Invalid inference",
      "explanationLong": "Not a valid inference from the provided quote",
    }
  ],
  [
    {
      "sentenceStart": "Debater A-turn1-sentence1",
      "sentenceEnd": "Debater A-turn1-sentence2",
      "label": "violation",
      "norm": "Ensure arguments are consistent throughout",
      "explanationShort": "Inconsistency (self-contradiction)",
      "explanationLong": "Sentence 2 (admitting that Max was chosen for his genetics) contradicts sentence 1 (arguing that Max was not selected because of his ability)",
    },
    {
      "sentenceStart": "Debater B-turn1-sentence3",
      "sentenceEnd": "Debater B-turn1-sentence3",
      "label": "good",
      "norm": "Identify evidence to support arguments",
      "explanationShort": "Good choice of evidence",
      "explanationLong": "Debater correctly selects a quote that supports the claim from sentence 1 (“Max needed to be the one to use the machine because he possessed a unique genetic trait … which allowed him to remain conscious during time travel.”)",
    },
    {
      "sentenceStart": "Debater B-turn2-sentence5",
      "sentenceEnd": "Debater B-turn2-sentence5",
      "label": "good",
      "norm": "Stronger arguments are tightly tied to claim",
      "explanationShort": "Argument tightly tied to the question.",
      "explanationLong": "Unlike Debater A, Debater B explains not just why Max used the machine, but why Max NEEDED TO BE THE ONE that used the machine, following the phrasing of the question precisely.",
    },
  ],
  [
    {
      "sentenceStart": "Debater B-turn1-sentence4",
      "sentenceEnd": "Debater B-turn1-sentence4",
      "label": "violation",
      "norm": "Stronger arguments rely on more commonly accepted interpretations of words/semantics/intent of language/speaker",
      "explanationShort": "Unlikely interpretation of quote",
      "explanationLong": "Debater suggests a metaphorical interpretation of the above quote when a literal one is more likely.",
    },
    {
      "sentenceStart": "Debater A-turn2-sentence1",
      "sentenceEnd": "Debater A-turn2-sentence1",
      "label": "good",
      "norm": "Address and join issue with counterarguments",
      "explanationShort": "Addressed counterargument",
      "explanationLong": "Debater B's counterargument is acknowledged and addressed.",
    },
    {
      "sentenceStart": "Debater A-turn2-sentence2",
      "sentenceEnd": "Debater A-turn2-sentence4",
      "label": "violation",
      "norm": "Evidence should be relevant to and support argument or claim",
      "explanationShort": "Evidence does not support argument",
      "explanationLong": "The provided quote does not support the argument of Maitland's general ambition being irrelevant, because professional knowledge ≠ ambition",
    },
    {
      "sentenceStart": "Debater B-turn2-sentence6",
      "sentenceEnd": "Debater B-turn2-sentence6",
      "label": "violation",
      "norm": "Ensure that inferences are valid or reasonable",
      "explanationShort": "Invalid inference",
      "explanationLong": "The second half of the sentence does not follow from the first: whether Maitland is ambitious or not is not related to him cooperating with Swarts.",
    },
  ]
];