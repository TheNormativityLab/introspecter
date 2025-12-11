# Debate Annotation Interface

A visualization tool for analyzing completed debates between AI language models, showing how different models cite evidence and construct arguments from source material.

---

## Interface Layout

![Screenshot of the Debate Annotation interface](../images/debate-annotation.png)

---

## What This Tool Does

The Debate Annotation Interface helps researchers evaluate how AI models perform in structured debates. After models have completed a debate by arguing opposite sides of questions about a source text, this interface reveals:

- **Reasoning patterns** - How different models structure arguments from evidence
- **Evidence usage** - Which claims are grounded vs unsupported
- **Model comparison** - How citation strategies differ across models

---

## Four Synchronized Panels

**Left: Source Text**  
The original document that AI models were given to debate. Use this to verify every citation.

**Top Center: Question**  
The specific claim or question the model is arguing (e.g., "Why can't the crew radio Earth for help?")

**Center: Model's Argument**  
The AI's complete response with yellow highlights showing cited claims and `[1]`, `[2]` markers linking to evidence.

**Right: Evidence Cards**  
Numbered cards displaying the exact quotes the model cited, matching the `[n]` markers in the argument.

---

## Analysis Workflow

### Verifying Model Citations

1. Read a highlighted claim in the model's argument
2. Check the citation number (e.g., `[2]`)
3. Find Evidence Card 2 on the right panel
4. Compare: Does the quote support the claim?
5. Verify in the source text (left) for full context

### Comparing Model Performance

Navigate between debate questions using the numbered sidebar (far left) to analyze:

- **Citation density** - How much evidence does each model provide?
- **Argument structure** - Do models front-load evidence or use it throughout their argument?
- **Contextualization** - Which models cherry-pick vs use quotes fairly?

---

## Research Applications

### AI Safety & Alignment

- Measure faithfulness to ground truth
- Identify patterns in deceptive argumentation
- Test citation robustness across model versions