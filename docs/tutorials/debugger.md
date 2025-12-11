# Debate Debugger

The Debate Debugger is a powerful tool for analyzing completed debates and testing counterfactual scenarios with human intervention. It allows you to replay any completed basic debate, step through individual questions and rounds, and explore how different responses might have changed the outcome.

---

## Overview

After running debates between AI agents, you can use the Debugger to:

- **Replay completed experiments** with full context
- **Test counterfactuals** by injecting human responses at any point
- **Analyze decision points** where agent reasoning diverged
- **Compare alternative arguments** and their impact on debate outcomes

---

## Getting Started

The Debugger interface shows your completed debate runs in the left sidebar. Each entry displays the experiment name, date, dataset (MMLU, GSM8K, CommonsenseQA, etc.), and seed number for reproducibility.

### Setting Up a Counterfactual

Select your completed debate, choose a question, starting round, and the model you want to override:

<video controls autoplay loop muted width="100%">
  <source src="/assets/debugger-setup.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

### Entering Counterfactual Responses

Once you start the debug session, you can inject your own reasoning at the selected point:

<video controls autoplay loop muted width="100%">
  <source src="/assets/debugger-counterfactual.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## Use Cases

### Testing Counterfactuals

Explore "what if" scenarios:

- What if a stronger counterargument had been presented in Round 2?
- How would the debate have evolved with different initial reasoning?
- Could a well-timed intervention have changed the final answer?

### Analyzing Agent Behavior

Understand how agents respond to different inputs:

- How do agents react to novel arguments they didn't generate?
- Are agents swayed by confident assertions or detailed reasoning?
- Do agents maintain consistency when challenged?

### Training and Calibration

Use the debugger to:

- Identify questions where agents consistently struggle
- Find patterns in successful vs. unsuccessful reasoning
- Calibrate confidence thresholds for different question types

### Quality Assurance

Verify debate quality by:

- Spot-checking high-stakes or controversial questions
- Ensuring agents engage with each other's arguments
- Identifying cases where debates reached incorrect conclusions

---

## Tips and Best Practices

- **Start with failed questions**: Focus on questions where the majority vote was incorrect
- **Test minimal changes**: Make small, targeted changes to isolate the impact of specific arguments
- **Review before/after**: Always compare the counterfactual outcome with the original debate result