import { NextRequest, NextResponse } from "next/server";
import { getAppUserId, getMemoryStatus, getSupabaseAdmin } from "@/lib/memory-store";

export const dynamic = "force-dynamic";

type IncomingTrade = {
  id: string;
  pair: string;
  side: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  openedAt: string;
  status: "OPEN" | "CLOSED";
  exit?: number;
  pnlCad?: number;
  pips?: number;
  lesson?: string;
};

function toDbTrade(trade: IncomingTrade, userId: string) {
  return {
    id: trade.id,
    user_id: userId,
    pair: trade.pair,
    side: trade.side,
    entry: trade.entry,
    stop_loss: trade.stopLoss,
    take_profit: trade.takeProfit,
    confidence: trade.confidence,
    opened_at: trade.openedAt,
    status: trade.status,
    exit: trade.exit ?? null,
    pnl_cad: trade.pnlCad ?? null,
    pips: trade.pips ?? null,
    lesson: trade.lesson ?? null,
    payload: trade,
    updated_at: new Date().toISOString()
  };
}

function fromDbTrade(row: Record<string, unknown>): IncomingTrade {
  const payload = row.payload as Partial<IncomingTrade> | null;

  return {
    id: String(row.id),
    pair: String(row.pair),
    side: row.side === "SELL" ? "SELL" : "BUY",
    entry: Number(row.entry),
    stopLoss: Number(row.stop_loss),
    takeProfit: Number(row.take_profit),
    confidence: Number(row.confidence),
    openedAt: String(row.opened_at),
    status: row.status === "CLOSED" ? "CLOSED" : "OPEN",
    exit: row.exit == null ? payload?.exit : Number(row.exit),
    pnlCad: row.pnl_cad == null ? payload?.pnlCad : Number(row.pnl_cad),
    pips: row.pips == null ? payload?.pips : Number(row.pips),
    lesson: row.lesson == null ? payload?.lesson : String(row.lesson)
  };
}

export async function GET() {
  const status = getMemoryStatus();
  const supabase = getSupabaseAdmin();

  if (!status.enabled || !supabase) {
    return NextResponse.json({ enabled: false, reason: status.reason, trades: [] });
  }

  const { data, error } = await supabase
    .from("paper_trades")
    .select("*")
    .eq("user_id", getAppUserId())
    .order("opened_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ enabled: false, reason: error.message, trades: [] }, { status: 200 });
  }

  return NextResponse.json({ enabled: true, trades: (data || []).map(fromDbTrade) });
}

export async function POST(request: NextRequest) {
  const status = getMemoryStatus();
  const supabase = getSupabaseAdmin();

  if (!status.enabled || !supabase) {
    return NextResponse.json({ enabled: false, reason: status.reason, saved: false });
  }

  const body = (await request.json()) as { trade?: IncomingTrade; trades?: IncomingTrade[] };
  const trades = body.trades || (body.trade ? [body.trade] : []);

  if (!Array.isArray(trades) || trades.length === 0) {
    return NextResponse.json({ enabled: true, saved: false, error: "Aucun trade à sauvegarder." }, { status: 400 });
  }

  const rows = trades.map((trade) => toDbTrade(trade, getAppUserId()));

  const { error } = await supabase
    .from("paper_trades")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ enabled: true, saved: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enabled: true, saved: true, count: rows.length });
}

export async function DELETE(request: NextRequest) {
  const status = getMemoryStatus();
  const supabase = getSupabaseAdmin();

  if (!status.enabled || !supabase) {
    return NextResponse.json({ enabled: false, reason: status.reason, deleted: false });
  }

  const search = request.nextUrl.searchParams;
  const id = search.get("id");

  let query = supabase.from("paper_trades").delete().eq("user_id", getAppUserId());

  if (id) {
    query = query.eq("id", id);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ enabled: true, deleted: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enabled: true, deleted: true });
}
