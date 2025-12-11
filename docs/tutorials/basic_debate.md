# Basic Debate

Introspecter lets you orchestrate debates between LLMs, such as OpenAI’s models and Together AI’s Llama and Mistral, and even include human participants. Models and humans act as independent agents, reasoning through questions from datasets such as GSM8K, MMLU, CommonsenseQA, or custom sets.

---

## Walkthrough

Let’s set up a debate between GPT-4o-mini, Llama 3.1 8B, and a Human Participant on a reasoning problem.

### Setting Up the Debate

First, select your models from the provider registry and configure human participation. When setting up agents, you can choose "Human Participant" as an agent type, which enables a modal interface for entering responses during the debate:

<video controls autoplay loop muted width="100%">
  <source src="../../assets/setup-debate.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>


### Running the Debate

Once the debate is initialized, the system processes the agents' responses. When it's the human participant's turn, a modal appears prompting for input, and the human participant can read the debate context and enter their reasoning in real-time:

<video controls autoplay loop muted width="100%">
  <source src="../../assets/debate-execution.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

### Viewing Results

After the debate completes, you can review the full transcript to see how each agent responded in each round. The **Metrics** tab provides performance analytics, including accuracy and majority-vote statistics.

<video controls autoplay loop muted width="100%">
  <source src="../../assets/debate-results.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>