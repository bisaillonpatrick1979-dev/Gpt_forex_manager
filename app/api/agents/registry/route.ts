import { NextResponse } from "next/server";
import { agentCatalog, riskPolicy } from "@/lib/firm-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const openAiApiConfigured = Boolean(process.env.OPENAI_API_KEY);

  const agents = agentCatalog.map((agent) => {
    const storedPromptConfigured = Boolean(process.env[agent.connectionEnvVar]);
    const sdkImplemented = agent.key === "master";
    const connected = agent.key === "master"
      ? openAiApiConfigured
      : openAiApiConfigured && storedPromptConfigured;

    return {
      key: agent.key,
      name: agent.name,
      role: agent.role,
      responsibility: agent.responsibility,
      connectionEnvVar: agent.connectionEnvVar,
      connected,
      sdkImplemented,
      storedPromptConfigured,
      integrationMode: agent.key === "master"
        ? storedPromptConfigured ? "agents-sdk-with-stored-prompt" : "agents-sdk-with-code-instructions"
        : storedPromptConfigured ? "stored-prompt-awaiting-sdk-agent" : "awaiting-specialist",
      status: connected ? "configured" : sdkImplemented ? "api-key-required" : "awaiting-agent",
      mayExecuteOrders: agent.mayExecuteOrders
    };
  });

  return NextResponse.json({
    architecture: "manager-with-specialists",
    openAiApiConfigured,
    connectedAgents: agents.filter((agent) => agent.connected).length,
    implementedAgents: agents.filter((agent) => agent.sdkImplemented).length,
    totalAgents: agents.length,
    riskPolicy,
    agents,
    generatedAt: new Date().toISOString()
  });
}
