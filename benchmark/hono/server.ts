import { Hono } from "hono";

interface CreateUserBody {
  name: string;
  score: number;
}

class BenchmarkService {
  plain() { return "OK"; }
  user(id: number) { return { id, name: "Benchmark User" }; }
  create(body: CreateUserBody) { return { id: 1, name: body.name, score: body.score }; }
}

const service = new BenchmarkService();
const app = new Hono();

app.get("/plain", (context) => context.text(service.plain()));

app.get("/users/:id", (context) => {
  const id = Number(context.req.param("id"));
  if (!Number.isSafeInteger(id)) return context.json({ error: "Expected an integer" }, 400);
  return context.json(service.user(id));
});

app.post("/users", async (context) => {
  let body: unknown;
  try { body = await context.req.json(); } catch { return context.json({ error: "Invalid JSON" }, 400); }
  if (
    typeof body !== "object" || body === null ||
    typeof (body as Record<string, unknown>).name !== "string" ||
    (body as { name: string }).name.length < 1 ||
    (body as { name: string }).name.length > 100 ||
    !Number.isSafeInteger((body as Record<string, unknown>).score) ||
    ((body as Record<string, unknown>).score as number) < 0
  ) return context.json({ error: "Invalid body" }, 400);
  return context.json(service.create(body as CreateUserBody), 201);
});

export default {
  port: Number(Bun.env.PORT ?? 4100),
  fetch: app.fetch,
};
