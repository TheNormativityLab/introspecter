// src/pages/DebateDebuggerPage.tsx
"use client";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import DebateDebugger from "@/components/forms/DebateDebugger";
import DebateProgressMonitor from "@/components/forms/DebateProgressMonitor";

interface ReplayDebateData {
  experimentName: string;
  totalQuestions: number;
  numRounds: number;
  seeds: number[];
  agents: Array<{
    id: string;
    name: string;
    model: string;
    enabled: boolean;
    isHuman?: boolean;
  }>;
  selectedDatasets: string[];
  customQuestions: string[];
  status: string;
  createdAt: string;
  isReplay: boolean;
  originalDebateId?: string;
  questionIndex?: number;
  startFromRound?: number;
}

export default function DebateDebuggerPage() {
  const [showProgressMonitor, setShowProgressMonitor] = useState(false);
  const [replayDebateData, setReplayDebateData] =
    useState<ReplayDebateData | null>(null);

  const handleBackToDashboard = () => {
    if (showProgressMonitor) {
      setShowProgressMonitor(false);
      setReplayDebateData(null);
    } else {
      window.history.back();
    }
  };

  const handleReplayStarted = (debateData: ReplayDebateData) => {
    setReplayDebateData(debateData);
    setShowProgressMonitor(true);
  };

  if (showProgressMonitor && replayDebateData) {
    return (
      <DebateProgressMonitor
        debateData={replayDebateData}
        onBack={() => {
          setShowProgressMonitor(false);
          setReplayDebateData(null);
        }}
      />
    );
  }

  return (
    <div className="debugger-page">
      <DebateDebugger onReplayStarted={handleReplayStarted} />
    </div>
  );
}
