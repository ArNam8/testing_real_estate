/** Walkthrough V84 public Seller Link gateway. */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { CORS_HEADERS, errorResponse, jsonResponse } from "../_shared/gemini.ts";

const unavailable = () => errorResponse("This private link is unavailable.", 404);
const clean = (value: unknown, limit = 1500) => typeof value === "string" ? value.trim().slice(0, limit) : "";
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  let body: { action?: string; token?: string; taskId?: string; payload?: Record<string, unknown>; fileName?: string; contentType?: string };
  try { body = await req.json(); } catch { return errorResponse("Invalid request.", 400); }
  const token = clean(body.token, 256);
  if (token.length < 32) return unavailable();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: link } = await admin.from("seller_links")
    .select("id, agent_id, plan_id, status, expires_at")
    .eq("token_hash", await hash(token)).maybeSingle();
  if (!link || link.status !== "active" || (link.expires_at && new Date(link.expires_at).getTime() <= Date.now())) return unavailable();

  const { data: plan } = await admin.from("home_launch_plans")
    .select("id, property_id, agent_intro, launch_target_date, status, properties(address)")
    .eq("id", link.plan_id).eq("agent_id", link.agent_id).maybeSingle();
  if (!plan) return unavailable();

  if (body.action === "read") {
    const { data: tasks, error } = await admin.from("home_launch_tasks")
      .select("id, category, title, why_it_matters, mandatory, requires_upload, due_date, display_order, seller_status, seller_completion_date, seller_note")
      .eq("plan_id", link.plan_id).order("display_order");
    if (error) return errorResponse("Could not load this checklist.", 500);
    return jsonResponse({ plan: { address: (plan.properties as { address?: string } | null)?.address ?? "Your home", agent_intro: plan.agent_intro, launch_target_date: plan.launch_target_date, status: plan.status }, tasks: tasks ?? [] });
  }

  if (body.action === "create_upload") {
    const taskId = clean(body.taskId, 80);
    const name = clean(body.fileName, 140).replace(/[^a-zA-Z0-9._-]/g, "_");
    const type = clean(body.contentType, 100);
    if (!taskId || !name || !new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]).has(type)) return errorResponse("Use a PDF, JPG, PNG, or WebP file.", 400);
    const { data: task } = await admin.from("home_launch_tasks").select("id").eq("id", taskId).eq("plan_id", link.plan_id).maybeSingle();
    if (!task) return errorResponse("That task is unavailable.", 400);
    const path = `${link.agent_id}/seller-uploads/${link.plan_id}/${crypto.randomUUID()}-${name}`;
    const { data, error } = await admin.storage.from("walkthrough-audio").createSignedUploadUrl(path);
    if (error || !data) return errorResponse("Could not prepare upload.", 500);
    return jsonResponse({ path, signedUrl: data.signedUrl, uploadToken: data.token });
  }

  if (body.action !== "submit" || !body.payload || typeof body.payload !== "object") return errorResponse("Invalid request.", 400);
  const payload = body.payload;
  const taskId = clean(body.taskId, 80) || null;
  const action = clean(payload.action, 40);
  if (!['complete', 'needs_help', 'unknown', 'message', 'final_submit'].includes(action)) return errorResponse("Invalid checklist update.", 400);
  let task: { id: string; title: string; mandatory: boolean; requires_upload: boolean } | null = null;
  if (action !== 'message' && action !== 'final_submit') {
    if (!taskId) return errorResponse("Choose a task.", 400);
    const { data } = await admin.from("home_launch_tasks").select("id,title,mandatory,requires_upload").eq("id", taskId).eq("plan_id", link.plan_id).maybeSingle();
    task = data;
    if (!task) return errorResponse("That task is unavailable.", 400);
    if (action === 'complete' && task.requires_upload && !clean(payload.upload_path, 400)) return errorResponse("Please add the requested proof before marking this complete.", 400);
  }

  if (action === 'final_submit') {
    const { data: incomplete } = await admin.from("home_launch_tasks").select("id").eq("plan_id", link.plan_id).eq("mandatory", true).not("seller_status", "in", "(submitted,reviewed)");
    if (incomplete && incomplete.length > 0) return errorResponse("Finish all required checklist items before submitting.", 400);
    await admin.from("home_launch_plans").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", link.plan_id);
  } else if (task) {
    const sellerStatus = action === 'complete' ? 'submitted' : action === 'needs_help' ? 'needs_help' : 'in_progress';
    await admin.from("home_launch_tasks").update({ seller_status: sellerStatus, seller_completion_date: clean(payload.expected_date, 20) || null, seller_note: clean(payload.note), agent_review_status: 'pending', updated_at: new Date().toISOString() }).eq("id", task.id);
  }
  const { data: submission, error: submissionError } = await admin.from("seller_task_submissions").insert({ agent_id: link.agent_id, plan_id: link.plan_id, task_id: taskId, seller_link_id: link.id, kind: action === 'final_submit' ? 'final_submit' : action === 'message' ? 'message' : 'task_update', payload }).select("id").single();
  if (submissionError || !submission) return errorResponse("Could not save your update.", 500);
  const title = action === 'final_submit' ? 'Seller submitted the Home Launch Checklist for review.' : action === 'needs_help' ? `Seller needs help with: ${task?.title ?? 'a checklist item'}.` : action === 'unknown' ? `Seller marked a checklist item as unknown: ${task?.title ?? ''}.` : action === 'message' ? 'Seller sent a Home Launch message.' : `Seller submitted: ${task?.title ?? 'checklist item'}.`;
  await admin.from("notices").insert({ agent_id: link.agent_id, property_id: plan.property_id, plan_id: link.plan_id, task_id: taskId, submission_id: submission.id, kind: action, title, detail: clean(payload.note, 320) || null });
  return jsonResponse({ ok: true, message: action === 'final_submit' ? 'Your checklist is with your agent for review.' : 'Your update has been sent to your agent.' });
});
