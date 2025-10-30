// src/pages/DebateDebuggerPage.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import DebateDebugger from "@/components/forms/DebateDebugger";
import DebateProgressMonitor from "@/components/forms/DebateProgressMonitor";

interface Agent {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
  isHuman?: boolean;
}

interface DebateData {
  experimentName: string;
  totalQuestions: number;
  numRounds: number;
  seeds: number[];
  agents: Agent[];
  selectedDatasets: string[];
  customQuestions: string[];
  isReplay?: boolean;
  existingDebateId?: string;
}

interface ReplayInfo {
  success: boolean;
  debate_id: string;
  experiment_name: string;
  dataset: string;
  seed: number;
  num_questions: number;
  num_rounds: number;
  agent_counts: Record<string, number>;
}

export default function DebateDebuggerPage() {
  const router = useRouter();
  const [showProgressMonitor, setShowProgressMonitor] = useState(false);
  const [replayDebateData, setReplayDebateData] = useState<DebateData | null>(null);

  const handleReplayStarted = (replayInfo: ReplayInfo) => {
    console.log("Replay started with info:", replayInfo);
    
    // Validate that we have the required data
    if (!replayInfo.agent_counts) {
      console.error("Missing agent_counts in replay info:", replayInfo);
      alert("Error: Missing agent information from replay. Please try again.");
      return;
    }
    
    // Validate that we have a debate_id for replay
    if (!replayInfo.debate_id) {
      console.error("Missing debate_id in replay info:", replayInfo);
      alert("Error: Missing debate ID for replay. Please try again.");
      return;
    }
    
    // Convert agent_counts to agents array
    const agents: Agent[] = Object.entries(replayInfo.agent_counts).map(([model, count]) => ({
      id: model,
      name: model,
      model: model,
      enabled: true,
      isHuman: model === 'human-participant' || model === 'human',
    }));
    console.log("Created agents:", agents);
    
    // Create DebateData for DebateProgressMonitor
    const debateData: DebateData = {
      experimentName: replayInfo.experiment_name || 'Replay Debate',
      totalQuestions: replayInfo.num_questions || 1,
      numRounds: replayInfo.num_rounds || 2,
      seeds: [replayInfo.seed || 0],
      agents: agents,
      selectedDatasets: [replayInfo.dataset || 'gsm8k'],
      customQuestions: [],
      isReplay: true,                          // ✅ Set this in debateData
      existingDebateId: replayInfo.debate_id,  // ✅ Set this in debateData
    };
    console.log("Created debate data for monitor:", debateData);
    
    setReplayDebateData(debateData);
    setShowProgressMonitor(true);
  };

  const handleBackFromMonitor = () => {
    setShowProgressMonitor(false);
    setReplayDebateData(null);
  };

  const handleBackToDashboard = () => {
    router.push("/dashboard");
  };

  if (showProgressMonitor && replayDebateData) {
    return (
      <DebateProgressMonitor
        debateData={replayDebateData}
        onBack={handleBackFromMonitor}
        onBackDashboard={handleBackToDashboard}
      />
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <DebateDebugger onReplayStarted={handleReplayStarted} />
    </div>
  );
}