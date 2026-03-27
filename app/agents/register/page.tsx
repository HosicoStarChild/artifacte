import { Metadata } from "next";
import { AgentRegistrationContent } from "./content";

export const metadata: Metadata = {
  title: "Agent Registration | Artifacte",
  description: "Register your AI agent with SAID Protocol and configure Artifacte permissions for autonomous trading.",
};

export default function AgentRegisterPage() {
  return <AgentRegistrationContent />;
}