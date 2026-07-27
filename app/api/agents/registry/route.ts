import { NextResponse } from "next/server";
import { agentCatalog, riskPolicy } from "@/lib/firm-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const agents = agentCatalog.map((agent) => {
    const connected = Boolean(process.env[agent.connectionEnvVar]);

    return {
      key: agent.key,
      name: agent.name,
      role: agent.role,
      responsibility: agent.responsibility,
      connectionEnvVar: agent.connectionEnvVar,
      connected,
      status: connected ? "configured" : "awaiting-agent",
      mayExecuteOrders: agent.mayExecuteOrders
    };
  });

  return NextResponse.json({
    architecture: "manager-with-specialists",
    openAiApiConfigured: Boolean(process.env.OPENAI_API_KEY),
    connectedAgents: agents.filter((agent) => agent.connected).length,
    totalAgents: agents.length,
    riskPolicy,
    agents,
    generatedAt: new Date().toISOString()
  });
}
